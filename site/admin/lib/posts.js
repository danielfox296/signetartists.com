/* Posts and videos as the admin edits them: one file each under content/.
   Lists, the blog index, hub lists, RSS and the sitemaps are built from the
   files, so nothing here writes them. What does need writing when a post
   or a video moves or goes is here: its file, the posts that list it, and
   a redirect from where it was. */
import { pySort, slugLabel } from "../../src/lib/model.js";
import { pagesList, serialize, slugOf } from "./site.js";

export const postPath = (slug) => `content/posts/${slug}.json`;
export const videoPath = (slug) => `content/videos/${slug}.json`;
export const postUrl = (slug) => `/blog/${slug}/`;
export const watchUrl = (slug) => `/video/${slug}/`;

// A URL's last part from a title or what was typed: lower case, words
// joined by hyphens.
export const slugify = (t) =>
  String(t || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// What was typed in a URL field ("/blog/x/", "blog/x", "x") as the slug.
export const slugFromUrl = (s, base) =>
  slugify(
    String(s || "")
      .trim()
      .replace(/^https?:\/\/[^/]+/i, "")
      .replace(new RegExp(`^/?${base}/`), "")
  );

// Today where the admin is open, as YYYY-MM-DD.
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ------------------------------------------------------------ posts

export function postsList(repo) {
  return repo
    .list("content/posts/")
    .filter((p) => p.endsWith(".json") && p.split("/").length === 3)
    .map((file) => {
      const doc = repo.json(file);
      return { slug: slugOf(file), file, doc, p: doc.root.props };
    })
    .sort((a, b) => pySort(b.p.date || "", a.p.date || "") || pySort(a.slug, b.slug));
}

// A hub is stored as "ensembles/yacht-rock/"; as a URL it is
// "/ensembles/yacht-rock/".
export const hubUrl = (parent) => (parent ? `/${String(parent).replace(/^\/+|\/+$/g, "")}/` : "");
export const hubValue = (url) => (url ? url.replace(/^\/+/, "").replace(/\/*$/, "/") : "");

// The pages a post can be filed under: every page but the home page and
// the 404 page.
export function hubOptions(repo) {
  return pagesList(repo)
    .filter((p) => p.path !== "/" && !p.path.endsWith(".html"))
    .map((p) => ({ value: p.path, label: hubLabel(repo, p.path) }));
}

// A hub by the name its breadcrumb shows.
export function hubLabel(repo, url) {
  const pg = pagesList(repo).find((p) => p.path === url);
  if (!pg) return url;
  return pg.doc.root.props.breadcrumb || slugLabel(url);
}

// The small copy of a picture where the site has one.
export function thumbFor(repo, src) {
  if (!src || /^(https?:)?\/\//.test(src)) return src;
  const t = `img/thumbs/${src.split("/").pop()}`;
  return repo.has(t) ? t : src;
}

// Draft, live, or changed since it went live.
export function postStatus(entry, pending) {
  if (entry.p.draft) return "draft";
  return pending && pending.has(entry.file) ? "wait" : "live";
}

export function slugProblem(repo, slug, self, kind = "post") {
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return "Invalid";
  if (slug === self) return null;
  const path = kind === "post" ? postPath(slug) : videoPath(slug);
  if (repo.has(path)) return "Taken";
  const list = kind === "post" ? postsList(repo).map((e) => e.p.slug) : videosList(repo).map((e) => e.v.slug);
  if (list.includes(slug)) return "Taken";
  const url = kind === "post" ? postUrl(slug) : watchUrl(slug);
  if (pagesList(repo).some((p) => p.path === url)) return "Taken";
  return null;
}

// A new post, as a draft, blank or from another post's blocks.
export function newPost({ title, slug, from }) {
  const props = { title, slug, eyebrow: "", parent: "", dek: "", date: today(), author: { name: "Signet Artists" }, meta_description: "", hero: { src: "", alt: "" }, draft: true };
  if (!from) return { root: { props }, content: [] };
  const d = structuredClone(from);
  const keep = ["eyebrow", "parent", "dek", "author", "meta_description", "llms_description", "hero", "video"];
  const p = { title, slug };
  for (const k of Object.keys(d.root.props)) if (keep.includes(k)) p[k] = d.root.props[k];
  for (const [k, v] of Object.entries(props)) if (!(k in p)) p[k] = v;
  p.date = today();
  p.draft = true;
  d.root.props = p;
  d.content = d.content.map((c) => ({ ...c, props: { ...c.props, id: `${c.type}-${crypto.randomUUID().slice(0, 8)}` } }));
  return d;
}

// Redirects once `from` has moved to `to` (or gone, to a page): one from
// the old URL, older ones that pointed at it now point at the new one, and
// none left from the new URL.
export function redirectsAfter(redirects, from, to) {
  let red = redirects.filter((r) => r.from !== to).map((r) => (r.to === from ? { ...r, to } : r));
  if (!red.some((r) => r.from === from)) red.push({ from, to });
  return red.filter((r) => r.from !== r.to);
}

// A redirect from a URL that a new post or video now uses goes.
export function freeUrl(repo, url) {
  const red = repo.json("content/redirects.json");
  if (!red.some((r) => r.from === url)) return null;
  return red.filter((r) => r.from !== url);
}

// Every file a post's new slug changes: the post under its new name, the
// posts that list it as related, and, if it is published, a redirect.
export function renamePost(repo, oldSlug, next) {
  const changes = new Map();
  const newSlug = next.root.props.slug;
  changes.set(postPath(oldSlug), null);
  changes.set(postPath(newSlug), next);
  for (const e of postsList(repo)) {
    if (e.slug === oldSlug) continue;
    let touched = false;
    const d = structuredClone(e.doc);
    for (const c of d.content) {
      if (c.type !== "RelatedPosts") continue;
      for (const x of c.props.posts || []) if (x.slug === oldSlug) ((x.slug = newSlug), (touched = true));
    }
    if (touched) changes.set(e.file, d);
  }
  const red = repo.json("content/redirects.json");
  const from = postUrl(oldSlug);
  const to = postUrl(newSlug);
  let after = next.root.props.draft ? red.filter((r) => r.from !== to) : redirectsAfter(red, from, to);
  if (serialize(after) !== serialize(red)) changes.set("content/redirects.json", after);
  return changes;
}

// Deleting a post: its file, its place in related lists, and a redirect
// when it was published.
export function deletePost(repo, slug, redirectTo) {
  const changes = new Map();
  const doc = repo.json(postPath(slug));
  changes.set(postPath(slug), null);
  for (const e of postsList(repo)) {
    if (e.slug === slug) continue;
    let touched = false;
    const d = structuredClone(e.doc);
    for (const c of d.content) {
      if (c.type !== "RelatedPosts") continue;
      const keep = (c.props.posts || []).filter((x) => x.slug !== doc.root.props.slug);
      if (keep.length !== (c.props.posts || []).length) ((c.props.posts = keep), (touched = true));
    }
    if (touched) changes.set(e.file, d);
  }
  if (redirectTo) changes.set("content/redirects.json", redirectsAfter(repo.json("content/redirects.json"), postUrl(doc.root.props.slug), redirectTo));
  return changes;
}

// Root props as the file keeps them: optional fields left empty go, and
// published leaves no flag behind (or the false the file had).
const OPTIONAL = ["seo_title", "last_updated", "llms_description"];
export function tidyPostProps(cur, next, base) {
  const out = {};
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined || v === null) continue;
    if (v === "" && (OPTIONAL.includes(k) || !(k in cur))) continue;
    out[k] = v;
  }
  if (out.hero && typeof out.hero === "object") {
    const h = {};
    for (const [k, v] of Object.entries(out.hero)) if (!(v === undefined || v === null || (v === "" && k !== "src" && k !== "alt"))) h[k] = v;
    out.hero = h;
  }
  if (out.author && typeof out.author === "object") {
    const a = {};
    for (const [k, v] of Object.entries(out.author)) if (!(v === undefined || v === null || (v === "" && k !== "name"))) a[k] = v;
    out.author = a;
  }
  if (out.draft !== true) {
    delete out.draft;
    const was = (base && "draft" in base ? base.draft : cur.draft);
    if (was === false) out.draft = false;
  }
  return out;
}

// ------------------------------------------------------------ videos

export function videosList(repo) {
  return repo
    .list("content/videos/")
    .filter((p) => p.endsWith(".json") && p.split("/").length === 3)
    .map((file) => ({ slug: slugOf(file), file, v: repo.json(file) }))
    .sort((a, b) => a.v.order - b.v.order || pySort(a.slug, b.slug));
}

// A video file's keys as the form names them, for the Go live drawer.
export const VIDEO_FIELDS = {
  name: { type: "text", label: "Title" },
  description: { type: "textarea", label: "Description" },
  act: { type: "text", label: "Act" },
  id: { type: "text", label: "YouTube ID" },
  uploadDate: { type: "text", label: "Date" },
  duration: { type: "text", label: "Length" },
  slug: { type: "text", label: "URL" },
  poster: { type: "text", label: "Poster" },
  order: { type: "number", label: "Order" },
  file: { type: "text", label: "File" },
};

export const ytThumb = (id) => (id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : "");

// "PT1M5S" as "1:05", and back.
export function mmss(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || "");
  if (!m) return "";
  const s = Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function isoDuration(t) {
  const m = /^\s*(?:(\d+):)?(\d+):(\d{1,2})\s*$/.exec(t || "") || /^\s*()()(\d+)\s*$/.exec(t || "");
  if (!m) return null;
  let s = Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
  if (!s) return null;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const mi = Math.floor(s / 60);
  s -= mi * 60;
  return "PT" + (h ? `${h}H` : "") + (mi ? `${mi}M` : "") + (s ? `${s}S` : "");
}

// A YouTube id from an id or any of YouTube's URLs.
export function youtubeId(s) {
  const t = String(s || "").trim();
  const m = /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/.exec(t);
  if (m) return m[1];
  return t;
}

export function newVideo(repo, { name, slug, id, act, duration }) {
  const order = Math.max(0, ...videosList(repo).map((e) => e.v.order || 0)) + 1;
  return { order, slug, id: id || null, file: null, poster: null, act, name, description: "", uploadDate: today(), duration };
}

// A video's new slug: the file under its new name and a redirect from its
// old watch page.
export function renameVideo(repo, oldSlug, next) {
  const changes = new Map();
  changes.set(videoPath(oldSlug), null);
  changes.set(videoPath(next.slug), next);
  const red = repo.json("content/redirects.json");
  const after = redirectsAfter(red, watchUrl(oldSlug), watchUrl(next.slug));
  if (serialize(after) !== serialize(red)) changes.set("content/redirects.json", after);
  return changes;
}

export function deleteVideo(repo, slug, redirectTo) {
  const changes = new Map();
  const v = repo.json(videoPath(slug));
  changes.set(videoPath(slug), null);
  if (redirectTo) changes.set("content/redirects.json", redirectsAfter(repo.json("content/redirects.json"), watchUrl(v.slug), redirectTo));
  return changes;
}

// Write a set of changes from the helpers above.
export function apply(repo, changes, source) {
  for (const [f, v] of changes) {
    if (v === null) repo.remove(f, source);
    else repo.set(f, typeof v === "string" ? v : serialize(v), source);
  }
}
