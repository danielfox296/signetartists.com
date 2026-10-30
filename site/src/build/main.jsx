/* The static build: content/ in, the whole site out, the same files
   build.py wrote. Every page is rendered with the editor's own components.

   node site/scripts/build.mjs --out <folder>          build the site
   node site/scripts/build.mjs --out <folder> --images <cache>
                                                       and its pictures' copies (deploys)
   node site/scripts/build.mjs --render-sections <f>   render sections (converter check)
*/
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { transformSync } from "esbuild";
import { renderToStaticMarkup } from "react-dom/server";
import { createModel, outputFor, prefixFor, pySort } from "../lib/model.js";
import { plan } from "../lib/plan.js";
import { Site } from "../components/parts.jsx";
import { Body } from "../components/layout.jsx";
import { Item } from "../components/registry.jsx";
import { PostArticle } from "../components/post.jsx";
import { WatchPage, watchHeadExtra } from "../components/generated.jsx";
import { makeSchema } from "./schema.js";
import { document, head, redirectStub } from "./head.js";
import { llms, rss, sitemap, videoSitemap } from "./feeds.js";
import { fingerprint, stylesheet, stylesOf } from "./styles.js";
import { esc, pyjson } from "../lib/util.js";
import { LAYOUT_FILES } from "../lib/layouts.js";
import { repoPath, widthsFor, YT_WIDTHS } from "../lib/pictures.js";
import { imageDims, makeImages } from "./images.js";

const REPO = process.cwd();
const CONTENT = path.join(REPO, "content");

const j = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const dirJson = (d) =>
  fs
    .readdirSync(d)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.slice(0, -5))
    .sort(pySort)
    .map((name) => [name, j(path.join(d, name + ".json"))]);

export function loadContent(dir = CONTENT) {
  const at = (p) => path.join(dir, p);
  const pages = dirJson(at("pages")).map(([slug, d]) => Object.assign(d, { slug }));
  return {
    dir,
    site: j(at("site.json")),
    header: j(at("shared/header.json")),
    footer: j(at("shared/footer.json")),
    logoStrip: j(at("shared/logo-strip.json")),
    roster: j(at("roster.json")),
    acts: Object.fromEntries(dirJson(at("acts"))),
    videos: dirJson(at("videos")).map(([, v]) => v).sort((a, b) => a.order - b.order),
    posts: dirJson(at("posts")).map(([, d]) => d),
    pages,
    redirects: j(at("redirects.json")),
    photoFocus: j(at("photo-focus.json")),
    lastmod: fs.existsSync(at("lastmod.json")) ? j(at("lastmod.json")) : {},
    repertoire: j(at("repertoire.json")),
    layouts: {
      act: fs.existsSync(at("layouts/act-page.json")) ? j(at("layouts/act-page.json")) : null,
      ...Object.fromEntries(Object.entries(LAYOUT_FILES).map(([k, f]) => [k, fs.existsSync(at(`layouts/${f}`)) ? j(at(`layouts/${f}`)) : null])),
    },
    styles: fs.existsSync(at("styles.json")) ? j(at("styles.json")) : null,
    logoSvg: (id) => fs.readFileSync(path.join(REPO, "img", "logos", `${id}.svg`), "utf8"),
    exists: (rel) => fs.existsSync(path.join(REPO, rel)),
  };
}

// Where the subject of a photo sits: object-position joins the style of
// every <img> showing it, on every page.
export function photoFocus(m, html) {
  const focus = Object.fromEntries(Object.entries(m.c.photoFocus).filter(([k]) => !k.startsWith("_")));
  if (!Object.keys(focus).length) return html;
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = /\ssrc="([^"]*)"/.exec(tag);
    if (!src) return tag;
    let p = src[1].split("?")[0].split("#")[0].replace(/^(?:\.\.\/)+|^\//, "");
    if (p.startsWith(m.SITE_URL + "/")) p = p.slice(m.SITE_URL.length + 1);
    const pos = focus[p];
    if (!pos) return tag;
    const st = /\sstyle="([^"]*)"/.exec(tag);
    if (st) {
      const kept = st[1].split(";").filter((d) => d.trim() && !d.trim().toLowerCase().startsWith("object-position")).join(";");
      const value = (kept.trim() ? kept.trimEnd() + "; " : "") + `object-position: ${pos};`;
      return tag.slice(0, st.index) + ` style="${value}"` + tag.slice(st.index + st[0].length);
    }
    return tag.slice(0, 4) + ` style="object-position: ${pos};"` + tag.slice(4);
  });
}

const Section = Item;

// The pictures the pages show with copies (lib/pictures.js), as they are
// drawn: from a local file whose size is known, or a YouTube video's own.
function picturesFor(dims) {
  const used = new Set();
  const yt = new Set();
  return {
    used,
    yt,
    of(src) {
      const p = repoPath(src);
      const y = p && /^img\/yt\/([\w-]{11})\.jpg$/.exec(p);
      if (y) {
        yt.add(y[1]);
        return { widths: YT_WIDTHS, w: 1280, h: 720 };
      }
      const d = p && dims.get(p);
      if (!d) return null;
      used.add(p);
      return { widths: widthsFor(d.w), w: d.w, h: d.h };
    },
  };
}

// A page's first picture, when its first section has one, is the page's
// hero: it is asked for first and never waits to be scrolled to.
export function hero(html) {
  const main = html.indexOf("<main");
  const first = main < 0 ? -1 : html.indexOf("<section", main);
  if (first < 0) return html;
  const end = html.indexOf("</section>", first);
  const img = /<img\b[^>]*>/g;
  img.lastIndex = first;
  const m = img.exec(html);
  if (!m || (end >= 0 && m.index > end)) return html;
  let tag = m[0].replace(/\sloading="lazy"/, "");
  if (!/\sfetchpriority=/.test(tag)) tag = tag.replace(/^<img/, '<img fetchpriority="high"');
  return html.slice(0, m.index) + tag + html.slice(m.index + m[0].length);
}

// Click-to-play YouTube: a video's button becomes its player, playing.
const YT_SCRIPT = `<script>
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.yt');
      if (!b) { return; }
      var src = b.getAttribute('data-yt');
      var f = document.createElement('iframe');
      f.src = src + (src.indexOf('?') < 0 ? '?' : '&') + 'autoplay=1';
      f.title = b.getAttribute('data-title') || '';
      f.setAttribute('allow', b.getAttribute('data-allow') || '');
      if (b.hasAttribute('data-referrerpolicy')) { f.referrerPolicy = b.getAttribute('data-referrerpolicy'); }
      f.allowFullscreen = true;
      b.replaceWith(f);
      f.focus();
    });
  </script>`;

const minifyCss = (css) => transformSync(css, { loader: "css", minify: true }).code;

export { plan };

function renderStatic(el, ctx) {
  const html = renderToStaticMarkup(<Site.Provider value={ctx}>{el}</Site.Provider>);
  return html.replace(/<raw-html data-k="(\d+)"><\/raw-html>/g, (_, k) => ctx.raw[Number(k)]);
}

export function makeSite(c) {
  const m = createModel(c);
  const S = makeSchema(m);
  const hubs = new Set(c.pages.filter((d) => d.content.some((x) => x.type === "PagesAndPosts")).map((d) => d.root.props.path));
  const OG_DEFAULT = `${m.SITE_URL}/img/og-default.png`;
  // The brand follows the title while the whole thing fits a search result
  // (60 characters); a longer title stands alone, and the site's name is
  // in the page's schema.
  const brandTitle = (t, exact) => {
    if (exact) return t;
    const full = `${t} | ${m.brand.name}`;
    return full.length > 60 ? t : full;
  };
  const absImg = (src) => (!src ? "" : /^https?:\/\//.test(src) ? src : `${m.SITE_URL}/${src.replace(/^\/+/, "")}`);
  const base = { model: m, hubs, built: plan(c, m) };
  return { m, S, hubs, OG_DEFAULT, brandTitle, absImg, base };
}

export function renderSections(c, reqs) {
  const { m, base } = makeSite(c);
  return reqs.map((r) => {
    const ctx = { ...base, prefix: r.prefix, output: r.output, url: "/" + r.output.replace("index.html", ""), page: m.pages.find((d) => d.slug === r.page), raw: [] };
    return photoFocus(m, renderStatic(<Section c={r.item} />, ctx));
  });
}

export function buildSite(c, out) {
  const { m, S, hubs, OG_DEFAULT, brandTitle, absImg, base: plain } = makeSite(c);
  const pictures = c.images ? picturesFor(c.images) : null;
  const base = { ...plain, pictures };
  const files = {};
  const built = [];
  const lastmod = lastmodFor(c);
  const write = (rel, text) => {
    files[rel] = text;
  };
  // The stylesheet with the site styles in it, minified, with a ?v= of its
  // own and the theme colour following the ground.
  let headSite = m.site;
  const cssPath = path.join(REPO, "styles.css");
  if (fs.existsSync(cssPath)) {
    const css = fs.readFileSync(cssPath, "utf8");
    const next = c.styles ? stylesheet(css, c.styles) : css;
    const min = minifyCss(next);
    write("styles.css", min);
    const paper = stylesOf(next).colors["--paper"];
    headSite = { ...m.site, cssVersion: `${m.site.cssVersion}-${fingerprint(min)}`, themeColor: paper !== stylesOf(css).colors["--paper"] ? paper : m.site.themeColor };
  }

  const page = ({ output, prefix, nav, trail, indexed, content, ctxExtra, title, description, robots, ogType, ogImage, headExtra, schema, first }) => {
    const ctx = { ...base, prefix, output, url: "/" + output.replace("index.html", ""), trail, indexed, raw: [], ...ctxExtra };
    let body = renderStatic(
      <Body nav={nav} trail={trail} output={output} hubs={hubs} indexed={indexed}>
        {content}
      </Body>,
      ctx
    );
    if (first) body = hero(body);
    if (body.includes('<button type="button" class="yt"')) body += "\n" + YT_SCRIPT;
    const canonical = m.canonicalFor(output);
    const h = head({ site: headSite, title, description, robots, canonical, prefix, ogType, ogImage, headExtra, schema: schema + (trail ? S.breadcrumbSchema(trail) : "") });
    write(output, photoFocus(m, document(h, body)));
  };

  const renderDoc = (doc) => {
    const p = doc.root.props;
    const output = outputFor(p.path);
    const robots = p.robots || "index, follow";
    const indexed = !robots.startsWith("noindex");
    const trail = indexed ? m.breadcrumbs(output, "") : null;
    const canonical = m.canonicalFor(output);
    let schema;
    if (p.schemaKind === "videos") {
      const listed = [...m.FORMAT_ACTS, ...m.NAMED_ACTS].flatMap((a) => m.FOOTAGE.filter((v) => v.act === a.id));
      schema = schemaFor(S.videoIndexSchema(doc, canonical, listed));
    } else {
      const file = `content/pages/${doc.slug}.json`;
      const modified = lastmod({ output, file });
      schema = S.pageSchema({ ...doc, content: m.pageContent(doc) }, canonical, { published: p.published || modified, modified });
    }
    page({
      output,
      prefix: p.absolutePaths ? "/" : prefixFor(output),
      nav: p.nav || "",
      trail,
      indexed,
      content: m.pageContent(doc).map((x) => <Section key={x.props.id} c={x} />),
      ctxExtra: { page: doc },
      title: brandTitle(p.title, p.titleExact),
      description: p.description || "",
      robots,
      ogType: p.ogType || "website",
      ogImage: absImg(p.ogImage) || OG_DEFAULT,
      headExtra: "",
      schema,
      first: true,
    });
    built.push({ output, title: p.title, description: p.description || "", robots, indexLabel: p.indexLabel, watch: false, file: `content/pages/${doc.slug}.json` });
  };

  const LAST = ["video", "sitemap"];
  for (const doc of c.pages.filter((d) => !LAST.includes(d.slug))) renderDoc(doc);

  for (const v of m.FOOTAGE) {
    const output = m.watchOutput(v);
    const trail = m.breadcrumbs(output, v.name);
    const thumb = m.watchThumb(v);
    page({
      output,
      prefix: prefixFor(output),
      nav: m.ACTS_BASE,
      trail,
      indexed: true,
      content: <WatchPage v={v} />,
      title: brandTitle(v.seoTitle || v.name, false),
      description: v.description,
      robots: "index, follow",
      ogType: "video.other",
      ogImage: thumb,
      headExtra: watchHeadExtra(m, v),
      schema: schemaFor(S.watchSchema(v, m.canonicalFor(output))),
    });
    built.push({ output, title: v.name, description: v.description, robots: "index, follow", indexLabel: v.name, watch: true, file: `content/videos/${v.slug}.json` });
  }
  for (const slug of LAST) {
    const doc = c.pages.find((d) => d.slug === slug);
    if (doc) renderDoc(doc);
  }

  for (const r of c.redirects) write(r.from.slice(1) + "index.html", redirectStub(m.site, `${m.SITE_URL}${r.to}`));

  for (const d of m.published) {
    const p = d.root.props;
    const output = `blog/${p.slug}/index.html`;
    const canonical = m.canonicalFor(output);
    const og = p.hero && p.hero.src ? absImg(p.hero.src) : "";
    const robots = p.robots || "index, follow";
    const indexed = !robots.startsWith("noindex");
    const authorName = (p.author || {}).name ?? m.brand.name;
    page({
      output,
      prefix: prefixFor(output),
      nav: "",
      trail: indexed ? m.breadcrumbs(output, p.title) : null,
      indexed,
      content: <PostArticle doc={d} />,
      ctxExtra: { post: p },
      title: brandTitle(p.seo_title || p.title, false),
      description: p.meta_description || "",
      robots,
      ogType: "article",
      ogImage: og || OG_DEFAULT,
      headExtra: [
        `<meta property="article:published_time" content="${p.date}">`,
        `<meta property="article:modified_time" content="${p.last_updated || p.date}">`,
        `<meta property="article:author" content="${esc(authorName)}">`,
      ].join("\n  "),
      schema: schemaFor(S.articleSchema(p, canonical, og || OG_DEFAULT)),
    });
  }

  const blogIndex = c.pages.find((d) => d.slug === "blog-index");
  write("sitemap.xml", sitemap(m, built, lastmod));
  write("video-sitemap.xml", videoSitemap(m, built, lastmod));
  write("llms.txt", llms(m, built));
  write("rss.xml", rss(m, blogIndex ? blogIndex.root.props.description : ""));
  write("robots.txt", fs.readFileSync(path.join(c.dir, "robots.txt"), "utf8"));

  for (const [rel, text] of Object.entries(files)) {
    const target = path.join(out, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
  return { files: Object.keys(files), built, pictures };
}

function schemaFor(payload) {
  return `<script type="application/ld+json">${pyjson(payload)}</script>`;
}

// A page's sitemap date: the date it had when it was converted while its
// file is unchanged, then the file's own last commit.
function lastmodFor(c) {
  const cache = {};
  const gitDate = (file) => {
    if (file in cache) return cache[file];
    let d = null;
    try {
      d = execFileSync("git", ["log", "-1", "--format=%cs", "--", file], { cwd: REPO, encoding: "utf8" }).trim() || null;
    } catch {
      d = null;
    }
    return (cache[file] = d);
  };
  return (b) => {
    const seed = c.lastmod[b.output];
    if (!seed) return null;
    const p = path.join(REPO, seed.file);
    if (!fs.existsSync(p)) return seed.date;
    const sha = crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex");
    if (sha === seed.sha1) return seed.date;
    return gitDate(seed.file) || seed.date;
  };
}

// CLI
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
if (flag("--render-sections")) {
  const reqs = j(flag("--render-sections"));
  process.stdout.write(JSON.stringify(renderSections(loadContent(), reqs)));
} else if (flag("--out")) {
  const out = path.resolve(flag("--out"));
  const c = loadContent();
  c.images = await imageDims(REPO);
  const r = buildSite(c, out);
  console.log(`Built ${r.files.length} files into ${out}`);
  if (flag("--images")) {
    const { made } = await makeImages({ repo: REPO, out, cache: path.resolve(flag("--images")), used: r.pictures.used, yt: r.pictures.yt, dims: c.images });
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `pictures_made=${made}\n`);
  }
}
