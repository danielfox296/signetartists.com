/* The static build: content/ in, the whole site out, the same files
   build.py wrote. Every page is rendered with the editor's own components.

   node site/scripts/build.mjs --out <folder>          build the site
   node site/scripts/build.mjs --render-sections <f>   render sections (converter check)
*/
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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
  const brandTitle = (t, exact) => (exact ? t : `${t} | ${m.brand.name}`);
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
  const { m, S, hubs, OG_DEFAULT, brandTitle, absImg, base } = makeSite(c);
  const files = {};
  const built = [];
  const write = (rel, text) => {
    files[rel] = text;
  };
  // The stylesheet with the site styles in it. Only when they change it is
  // it written, with its own ?v= and the theme colour following the ground.
  let headSite = m.site;
  const cssPath = path.join(REPO, "styles.css");
  if (c.styles && fs.existsSync(cssPath)) {
    const css = fs.readFileSync(cssPath, "utf8");
    const next = stylesheet(css, c.styles);
    if (next !== css) {
      write("styles.css", next);
      const paper = stylesOf(next).colors["--paper"];
      headSite = { ...m.site, cssVersion: `${m.site.cssVersion}-${fingerprint(next)}`, themeColor: paper !== stylesOf(css).colors["--paper"] ? paper : m.site.themeColor };
    }
  }

  const page = ({ output, prefix, nav, trail, indexed, content, ctxExtra, title, description, robots, ogType, ogImage, headExtra, schema }) => {
    const ctx = { ...base, prefix, output, url: "/" + output.replace("index.html", ""), trail, indexed, raw: [], ...ctxExtra };
    const body = renderStatic(
      <Body nav={nav} trail={trail} output={output} hubs={hubs} indexed={indexed}>
        {content}
      </Body>,
      ctx
    );
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
    } else schema = S.pageSchema({ ...doc, content: m.pageContent(doc) }, canonical);
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
      title: brandTitle(v.name, false),
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
  write("sitemap.xml", sitemap(m, built, lastmodFor(c)));
  write("video-sitemap.xml", videoSitemap(m));
  write("llms.txt", llms(m, built));
  write("rss.xml", rss(m, blogIndex ? blogIndex.root.props.description : ""));
  write("robots.txt", fs.readFileSync(path.join(c.dir, "robots.txt"), "utf8"));

  for (const [rel, text] of Object.entries(files)) {
    const target = path.join(out, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
  }
  return { files: Object.keys(files), built };
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
  const r = buildSite(loadContent(), out);
  console.log(`Built ${r.files.length} files into ${out}`);
}
