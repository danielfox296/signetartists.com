/* The site as data: everything the components and the build derive from
   content/. Lists, trails, sibling links and act facts are computed here so
   that a page, a post or an act added to content/ joins them with no edit. */
import { decodeEntities, longDate } from "./util.js";

export const outputFor = (path) => (path === "/" ? "index.html" : path.endsWith(".html") ? path.slice(1) : path.slice(1) + "index.html");
export const urlFor = (output) => "/" + output.replace("index.html", "");
export const prefixFor = (output) => "../".repeat((output.match(/\//g) || []).length);

const VOCALS_LABEL = { sung: "With a singer", instrumental: "Instrumental" };
const VOCALS_MATCH = { sung: "sung", instrumental: "instrumental", optional: "sung instrumental" };

export function createModel(c) {
  const site = c.site;
  const brand = site.brand;
  const SITE_URL = brand.url.replace(/\/+$/, "");
  const roster = c.roster;
  const ACTS = roster.order.map((id) => c.acts[id]);
  const RATE_BY_ID = Object.fromEntries(roster.rateCard.map((r) => [r.id, r]));
  const BUCKET_LABEL = Object.fromEntries(roster.buckets.map((b) => [b.id, b.label]));
  const GENRE_LABEL = Object.fromEntries((roster.genres || []).map((g) => [g.id, g.label]));
  const AREA_LABEL = Object.fromEntries((roster.areas || []).map((a) => [a.id, a.label]));
  const SERVICE_AREAS = (roster.areas || []).map((a) => a.label);
  const ACT_BY_ID = Object.fromEntries(ACTS.map((a) => [a.id, a]));
  const ACTS_BASE = "music";
  const WATCH_BASE = "video";

  const actLane = (a) => a.lane || (a.presentation === "face" ? "named" : "format");
  const sizeKey = (a) => {
    const pieces = a.config_tags.map((t) => RATE_BY_ID[t].pieces);
    return [Math.max(...pieces), Math.min(...pieces), a.config_tags.includes("dj") ? 1 : 0, a.name];
  };
  const cmp = (x, y) => {
    for (let i = 0; i < x.length; i++) {
      if (x[i] < y[i]) return -1;
      if (x[i] > y[i]) return 1;
    }
    return 0;
  };
  const FORMAT_ACTS = ACTS.filter((a) => actLane(a) === "format").sort((a, b) => cmp(sizeKey(a), sizeKey(b)));
  const NAMED_ACTS = ACTS.filter((a) => actLane(a) === "named");
  const FLAGSHIPS = ACTS.filter((a) => a.status === "flagship");
  const ACT_BY_URL = Object.fromEntries(ACTS.filter((a) => a.page).map((a) => ["/" + a.page, a]));

  const actUrl = (a, prefix = "") => (a.page ? prefix + a.page : `${prefix}${ACTS_BASE}/#act-${a.id}`);
  const actConfigs = (a) => a.config_tags.map((t) => RATE_BY_ID[t]);
  const actAreaIds = (a) => (a.area_tags && a.area_tags.length ? a.area_tags : (roster.areas || []).map((x) => x.id));
  const actAreas = (a) => actAreaIds(a).map((i) => AREA_LABEL[i]);
  const actByline = (a) => a.byline || (a.presentation === "face" ? `Fronted by ${a.face}` : a.spec);
  const actBylineInline = (a) => a.byline_inline || (a.presentation === "face" ? `fronted by ${a.face}` : a.spec);
  const actConfigRange = (a) => {
    if (a.configRangeLabel) return a.configRangeLabel;
    const cs = actConfigs(a);
    return cs.length === 1 ? cs[0].label : `${cs[0].label} to ${cs[cs.length - 1].rangeLabel}`;
  };
  const actCardLine = (a) => {
    if (a.card_line) return a.card_line;
    const parts = a.blurb.trim().split(/(?<=[.!?])\s+/);
    let line = parts[0];
    if (line.split(/\s+/).filter(Boolean).length < 12 && parts.length > 1) line += " " + parts[1];
    return line;
  };

  const canonicalFor = (output) => (output === "index.html" ? `${SITE_URL}/` : output.endsWith("/index.html") ? `${SITE_URL}/${output.slice(0, -"index.html".length)}` : `${SITE_URL}/${output}`);

  // Videos
  const FOOTAGE = c.videos;
  const footageKey = (src) => {
    const m = /embed\/([A-Za-z0-9_-]{11})/.exec(src);
    return m ? m[1] : src.replace(/^(?:\.\.\/)+/, "");
  };
  const FOOTAGE_BY_KEY = Object.fromEntries(FOOTAGE.map((v) => [v.id || v.file, v]));
  const watchOutput = (v) => `${WATCH_BASE}/${v.slug}/index.html`;
  const watchUrl = (v) => canonicalFor(watchOutput(v));
  const watchThumb = (v) => (v.poster ? `${SITE_URL}/${v.poster}` : `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`);

  // Posts: published, newest first.
  const posts = c.posts.map((d) => d.root.props);
  const postBySlug = Object.fromEntries(c.posts.map((d) => [d.root.props.slug, d]));
  const published = c.posts
    .filter((d) => !d.root.props.draft)
    .sort((a, b) => {
      const x = [a.root.props.date || "", a.root.props.slug];
      const y = [b.root.props.date || "", b.root.props.slug];
      return -cmp(x, y);
    });
  const indexedPosts = published.filter((d) => !(d.root.props.robots || "").startsWith("noindex"));

  // Pages: URL -> short label, for trails and sibling lists.
  const pages = c.pages;
  const pageByUrl = {};
  const LABELS = {};
  for (const d of pages) {
    const p = d.root.props;
    pageByUrl[p.path] = d;
    LABELS[p.path] = p.breadcrumb || slugLabel(p.path);
  }
  const CRUMB_OVERRIDES = {};
  for (const v of FOOTAGE) {
    const a = ACT_BY_ID[v.act];
    if (a.page) CRUMB_OVERRIDES[`/${WATCH_BASE}/${v.slug}/`] = "/" + a.page;
  }
  const POSTS_BY_PARENT = {};
  for (const d of indexedPosts) {
    const p = d.root.props;
    const url = `/${String(p.parent || "").replace(/^\/+|\/+$/g, "")}/`;
    if (!p.parent || !(url in LABELS)) throw new Error(`${p.slug}: parent ${url} is not a page on the site`);
    CRUMB_OVERRIDES[`/blog/${p.slug}/`] = url;
    (POSTS_BY_PARENT[url] ||= []).push(p);
  }
  const PARENTS = site.breadcrumbParents;
  const crumbLabel = (url) => LABELS[url] || slugLabel(url);
  const crumbParent = (url) => {
    if (url in CRUMB_OVERRIDES) return CRUMB_OVERRIDES[url];
    for (const [prefix, parent] of Object.entries(PARENTS)) if (url.startsWith("/" + prefix)) return "/" + parent;
    let parts = url.replace(/^\/+|\/+$/g, "").split("/");
    while (parts.length > 1) {
      parts = parts.slice(0, -1);
      const cand = "/" + parts.join("/") + "/";
      if (cand in LABELS) return cand;
    }
    return url !== "/" ? "/" : null;
  };
  const crumbTrail = (url, label) => {
    const trail = [[url, label || crumbLabel(url)]];
    const seen = new Set([url]);
    let node = url;
    for (;;) {
      node = crumbParent(node);
      if (!node || seen.has(node)) break;
      seen.add(node);
      trail.unshift([node, node === "/" ? "Home" : crumbLabel(node)]);
      if (node === "/") break;
    }
    return trail;
  };
  const breadcrumbs = (output, label) => {
    const url = urlFor(output);
    if (url === "/" || url === "/404.html" || output === "404.html") return null;
    const trail = crumbTrail(url, label);
    return trail.length < 2 ? null : trail;
  };
  const SIBLING_SKIP = ["blog/", "video/"];
  const siblings = (output) => {
    const url = urlFor(output);
    if (SIBLING_SKIP.some((p) => url.startsWith("/" + p))) return null;
    const parts = url.replace(/^\/+|\/+$/g, "").split("/");
    if (parts.length < 2 || output === "404.html") return null;
    const folder = "/" + parts.slice(0, -1).join("/") + "/";
    const act = ACT_BY_URL[url];
    let peers, laneWord = "";
    if (act) {
      const laneActs = actLane(act) === "format" ? FORMAT_ACTS : NAMED_ACTS;
      peers = laneActs.filter((a) => a.page && "/" + a.page !== url).map((a) => "/" + a.page);
      laneWord = actLane(act) === "format" ? "configurations" : "named acts";
    } else {
      const depth = (u) => (u.replace(/^\/+|\/+$/g, "").match(/\//g) || []).length;
      peers = Object.keys(LABELS)
        .filter((u) => u !== url && u.startsWith(folder) && depth(u) === depth(url))
        .sort(pySort);
    }
    if (peers.length < 2) return null;
    const parent = crumbParent(url) || "/";
    return { lead: laneWord ? `More ${laneWord} in` : "More in", parent, parentLabel: parent === "/" ? "Home" : crumbLabel(parent), peers: peers.map((u) => [u, crumbLabel(u)]) };
  };
  const postRows = (list) => [...list].sort((a, b) => -cmp([a.date || "", a.slug], [b.date || "", b.slug]));
  const relatedArticles = (url, hubUrls) => {
    const ps = POSTS_BY_PARENT[url];
    if (!ps || hubUrls.has(url)) return null;
    return postRows(ps);
  };
  const actClips = (url) => {
    const act = ACT_BY_URL[url];
    const clips = FOOTAGE.filter((v) => act && v.act === act.id);
    return clips.length ? { act, clips } : null;
  };
  // A hub's list: its own groups, anything unplaced under the first, posts last.
  const hubIndex = (url, groups) => {
    const placed = new Set();
    const rows = groups.map((g) => [
      g.label,
      g.pages.map((e) => {
        const u = `${url}${e.path.replace(/^\/+|\/+$/g, "")}/`;
        if (!(u in LABELS)) throw new Error(`Pages and posts ${url}: ${u} is not a page on the site`);
        placed.add(u);
        return [u, e.label || crumbLabel(u)];
      }),
    ]);
    const strays = Object.keys(LABELS).filter((u) => u.startsWith(url) && u !== url && !placed.has(u)).sort(pySort);
    for (const u of strays) rows[0][1].push([u, crumbLabel(u)]);
    const ps = Object.entries(POSTS_BY_PARENT).filter(([parent]) => parent.startsWith(url)).flatMap(([, list]) => list);
    return { rows, posts: ps.length ? postRows(ps) : null };
  };

  // Minutes to read a post at 200 words a minute, from the text a reader
  // sees in its prose, asides, key takeaways and pull quotes.
  const words = (t) => decodeEntities(String(t ?? "").replace(/<[^>]+>/g, "")).replace(/[*_`~]+/g, "").split(/\s+/).filter(Boolean).length;
  const readingTime = (d) => {
    let n = 0;
    for (const c of d.content) {
      const p = c.props;
      if (c.type === "Prose") n += words(p.html);
      else if (c.type === "Aside") n += words(p.html) + words(p.title);
      else if (c.type === "KeyTakeaways") for (const it of p.items || []) n += words(it.text);
      else if (c.type === "Pullquote") n += words(p.text);
    }
    return Math.max(1, Math.ceil(n / 200));
  };
  const dateDisplay = (iso) => longDate(iso);

  return {
    c, site, brand, SITE_URL, roster, ACTS, ACT_BY_ID, ACT_BY_URL, RATE_BY_ID, BUCKET_LABEL, GENRE_LABEL, AREA_LABEL, SERVICE_AREAS,
    VOCALS_LABEL, VOCALS_MATCH, FORMAT_ACTS, NAMED_ACTS, FLAGSHIPS, ACTS_BASE, WATCH_BASE,
    actLane, actUrl, actConfigs, actAreaIds, actAreas, actByline, actBylineInline, actConfigRange, actCardLine,
    canonicalFor, FOOTAGE, FOOTAGE_BY_KEY, footageKey, watchOutput, watchUrl, watchThumb,
    posts, postBySlug, published, indexedPosts, pages, pageByUrl, LABELS, crumbLabel, crumbParent, crumbTrail, breadcrumbs,
    siblings, relatedArticles, actClips, hubIndex, POSTS_BY_PARENT, readingTime, dateDisplay,
  };
}

export function slugLabel(url) {
  const slug = url.replace(/^\/+|\/+$/g, "").split("/").pop();
  return slug ? slug.replace(/-/g, " ").replace(/^./, (x) => x.toUpperCase()).replace(/(?<=.)[A-Z]/g, (x) => x.toLowerCase()) : "Home";
}

// Python's default string ordering (code points).
export const pySort = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
