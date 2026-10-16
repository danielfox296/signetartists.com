/* The site as the admin sees it: content/ from the working copy, the model
   the components read, and what each page's canvas needs to know. */
import { createModel, outputFor, pySort } from "../../src/lib/model.js";
import { plan } from "../../src/lib/plan.js";

export const pagePath = (slug) => `content/pages/${slug}.json`;
export const slugOf = (path) => path.split("/").pop().replace(/\.json$/, "");
export const serialize = (v) => JSON.stringify(v, null, 1) + "\n";

export function contentFrom(repo) {
  const dir = (d) =>
    repo
      .list(`content/${d}/`)
      .filter((p) => p.endsWith(".json") && p.split("/").length === 3)
      .map((p) => [slugOf(p), repo.json(p)])
      .sort(([a], [b]) => pySort(a, b));
  return {
    site: repo.json("content/site.json"),
    header: repo.json("content/shared/header.json"),
    footer: repo.json("content/shared/footer.json"),
    logoStrip: repo.json("content/shared/logo-strip.json"),
    roster: repo.json("content/roster.json"),
    acts: Object.fromEntries(dir("acts")),
    videos: dir("videos")
      .map(([, v]) => v)
      .sort((a, b) => a.order - b.order),
    posts: dir("posts").map(([, d]) => d),
    // A wrapper, not the parsed file: nothing here may write into the
    // working copy's objects.
    pages: dir("pages").map(([slug, d]) => ({ root: d.root, content: d.content, slug })),
    redirects: repo.json("content/redirects.json"),
    photoFocus: repo.json("content/photo-focus.json"),
    lastmod: {},
    repertoire: repo.json("content/repertoire.json"),
    logoSvg: (id) => repo.get(`img/logos/${id}.svg`) || "<svg></svg>",
    exists: (rel) => repo.has(rel),
  };
}

export function siteFrom(repo) {
  const c = contentFrom(repo);
  const m = createModel(c);
  const hubs = new Set(c.pages.filter((d) => d.content.some((x) => x.type === "PagesAndPosts")).map((d) => d.root.props.path));
  return { c, m, hubs, built: plan(c, m) };
}

// What a component on the canvas reads through useSite().
export function pageContext(site, doc, { prefix, assetUrl }) {
  const p = doc.root.props;
  const output = outputFor(p.path);
  const robots = p.robots || "index, follow";
  const indexed = !robots.startsWith("noindex");
  let trail = null;
  try {
    trail = indexed ? site.m.breadcrumbs(output, "") : null;
  } catch {
    trail = null;
  }
  return { model: site.m, hubs: site.hubs, built: site.built, prefix, output, url: p.path, trail, indexed, page: doc, assetUrl };
}

// ------------------------------------------------------------ pages

export const normPath = (s) => {
  let p = String(s || "").trim();
  if (!p) return "";
  p = p.replace(/^https?:\/\/[^/]+/i, "");
  if (!p.startsWith("/")) p = "/" + p;
  if (!p.endsWith("/") && !p.endsWith(".html")) p += "/";
  return p.replace(/\/{2,}/g, "/").toLowerCase();
};

export const slugForPath = (path) => (path === "/" ? "home" : path.replace(/^\/|\/$/g, "").replace(/\.html$/, "").replace(/[^a-z0-9]+/g, "-") || "page");

export function pagesList(repo) {
  return repo
    .list("content/pages/")
    .filter((p) => p.endsWith(".json"))
    .map((file) => {
      const d = repo.json(file);
      return { slug: slugOf(file), file, doc: d, path: d.root.props.path, title: d.root.props.title, robots: d.root.props.robots || "index, follow" };
    })
    .sort((a, b) => pySort(a.path, b.path));
}

export function pageByPath(repo, path) {
  return pagesList(repo).find((p) => p.path === path);
}

// A path no page or redirect already uses.
export function pathProblem(repo, path, self) {
  if (!path || !/^\/([a-z0-9-]+\/)*$/.test(path)) return "URL";
  const taken = pagesList(repo).find((p) => p.path === path && p.slug !== self);
  if (taken) return "Taken";
  return null;
}

// Fix what refers to a page's URL after it moves or is deleted: redirects
// point at the new place, posts filed under it move, and hub lists drop it.
export function repoint(repo, from, to) {
  const changes = new Map();
  const redirects = structuredClone(repo.json("content/redirects.json"));
  let red = redirects.filter((r) => r.from !== to).map((r) => (r.to === from ? { ...r, to } : r));
  if (!red.some((r) => r.from === from)) red.push({ from, to });
  red = red.filter((r) => r.from !== r.to);
  changes.set("content/redirects.json", red);
  for (const file of repo.list("content/posts/")) {
    const d = repo.json(file);
    const parent = `/${String(d.root.props.parent || "").replace(/^\/+|\/+$/g, "")}/`;
    if (parent !== from) continue;
    const n = structuredClone(d);
    n.root.props.parent = to.replace(/^\/|\/$/g, "");
    changes.set(file, n);
  }
  for (const pg of pagesList(repo)) {
    let touched = false;
    const n = structuredClone(pg.doc);
    for (const s of n.content) {
      if (s.type !== "PagesAndPosts") continue;
      for (const g of s.props.groups || []) {
        const keep = (g.pages || []).filter((e) => `${pg.path}${e.path.replace(/^\/+|\/+$/g, "")}/` !== from);
        if (keep.length !== (g.pages || []).length) {
          g.pages = keep;
          touched = true;
        }
      }
    }
    if (touched) changes.set(pg.file, n);
  }
  return changes;
}

export function blankPage(path, title) {
  return { root: { props: { path, title, description: "" } }, content: [] };
}

export function copyPage(doc, path, title) {
  const d = structuredClone(doc);
  const keep = ["description", "titleExact", "ogImage", "nav", "schema", "robots"];
  const props = { path, title };
  for (const k of keep) if (k in d.root.props) props[k] = d.root.props[k];
  if (props.titleExact) props.titleExact = false;
  d.root.props = props;
  // A hub's list names pages relative to its own URL; at a new URL it
  // starts empty and lists whatever sits under it.
  for (const s of d.content) if (s.type === "PagesAndPosts") s.props.groups = [];
  return d;
}
