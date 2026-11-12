/* The site as data: everything the components and the build derive from
   content/. Lists, trails, sibling links and act facts are computed here so
   that a page, a post or an act added to content/ joins them with no edit. */
import { decodeEntities, longDate } from "./util.js";
import { layoutOf, LAYOUT_DEFAULTS } from "./layouts.js";
import { ytPath } from "./pictures.js";

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
  // The roster's acts in its order, and the ones not hidden. A hidden act is
  // on no list, card or filter, but a page that names it still renders:
  // ACT_BY_ID holds every act file.
  const ALL_ACTS = roster.order.map((id) => c.acts[id]).filter(Boolean);
  const ACTS = ALL_ACTS.filter((a) => !a.hidden);
  const RATE_BY_ID = Object.fromEntries(roster.rateCard.map((r) => [r.id, r]));
  const BUCKET_LABEL = Object.fromEntries(roster.buckets.map((b) => [b.id, b.label]));
  const GENRE_LABEL = Object.fromEntries((roster.genres || []).map((g) => [g.id, g.label]));
  const AREA_LABEL = Object.fromEntries((roster.areas || []).map((a) => [a.id, a.label]));
  const SERVICE_AREAS = (roster.areas || []).map((a) => a.label);
  const ACT_BY_ID = Object.fromEntries(Object.values(c.acts).map((a) => [a.id, a]));
  const ACTS_BASE = "music";
  const WATCH_BASE = "video";

  const actConfigs = (a) => (a.config_tags || []).map((t) => RATE_BY_ID[t]).filter(Boolean);
  const actLane = (a) => a.lane || (a.presentation === "face" ? "named" : "format");
  const sizeKey = (a) => {
    const pieces = actConfigs(a).map((r) => r.pieces);
    return pieces.length ? [Math.max(...pieces), Math.min(...pieces), (a.config_tags || []).includes("dj") ? 1 : 0, a.name] : [0, 0, 0, a.name];
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
  const ACT_BY_URL = Object.fromEntries(ALL_ACTS.filter((a) => a.page).map((a) => ["/" + a.page, a]));

  const actUrl = (a, prefix = "") => (a.page ? prefix + a.page : `${prefix}${ACTS_BASE}/#act-${a.id}`);
  const actAreaIds = (a) => (a.area_tags && a.area_tags.length ? a.area_tags : (roster.areas || []).map((x) => x.id));
  const actAreas = (a) => actAreaIds(a).map((i) => AREA_LABEL[i]).filter(Boolean);
  const actByline = (a) => a.byline || (a.presentation === "face" ? (a.face ? `Fronted by ${a.face}` : "") : a.spec || "");
  const actBylineInline = (a) => a.byline_inline || (a.presentation === "face" ? (a.face ? `fronted by ${a.face}` : "") : a.spec || "");
  const actConfigRange = (a) => {
    if (a.configRangeLabel) return a.configRangeLabel;
    const cs = actConfigs(a);
    if (!cs.length) return "";
    return cs.length === 1 ? cs[0].label : `${cs[0].label} to ${cs[cs.length - 1].rangeLabel}`;
  };
  const actCardLine = (a) => {
    if (a.card_line) return a.card_line;
    const parts = String(a.blurb || "").trim().split(/(?<=[.!?])\s+/);
    let line = parts[0];
    if (line.split(/\s+/).filter(Boolean).length < 12 && parts.length > 1) line += " " + parts[1];
    return line;
  };

  // The acts a list on a page shows: by occasion, by kind of night, or
  // chosen by hand, in roster order unless chosen.
  const actsWhere = ({ source, occasion, night, acts }) => {
    if (source === "occasion") return ACTS.filter((a) => (a.occasion_tags || []).includes(occasion));
    if (source === "night") return ACTS.filter((a) => (a.bucket_tags || []).includes(night));
    if (source === "acts") return (acts || []).map((x) => ACT_BY_ID[x && x.act]).filter((a) => a && !a.hidden);
    return FLAGSHIPS;
  };

  // A page built on the act page layout: the layout's sections, with the
  // page's own sections where the layout says.
  const pageAct = (doc) => {
    const p = doc && doc.root && doc.root.props;
    return p && p.schema && p.schema.act ? ACT_BY_ID[p.schema.act] || null : null;
  };
  const LAYOUT = (c.layouts && c.layouts.act) || null;
  // The act card, post, post card and video page layouts.
  const L = Object.fromEntries(Object.keys(LAYOUT_DEFAULTS).map((k) => [k, layoutOf(c.layouts && c.layouts[k], k)]));
  const usesLayout = (doc) => !!(LAYOUT && doc && doc.root && doc.root.props.layout === "act");
  // A layout section switched off is left out; the act's own sections still go where it says.
  const pageContent = (doc) => {
    if (!usesLayout(doc)) return doc.content;
    const out = [];
    let placed = false;
    for (const s of LAYOUT.content) {
      if (s.type === "ActOwn") {
        out.push(...doc.content);
        placed = true;
      } else if (!s.props.hidden) out.push(s);
    }
    if (!placed) out.push(...doc.content);
    return out;
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
  // A video's picture: its own poster, else the copy of its largest YouTube
  // picture the deploy keeps at 1280x720, not YouTube's 480x360
  // hqdefault with black bars. The share image, the schema and the video
  // sitemap all name this one file; the deploy makes it for every video,
  // falling back to the last one fetched, then a dark frame.
  const watchThumb = (v) => `${SITE_URL}/${v.poster || ytPath(v.id)}`;

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
    const own = p.layout === "act" && p.schema && ACT_BY_ID[p.schema.act];
    LABELS[p.path] = p.breadcrumb || (own ? own.name : "") || slugLabel(p.path);
  }
  // Venues: a page whose root carries `venue` is a venue page. The acts it
  // names are the acts in its act cards and the acts that have played there.
  // The venues hub lists every venue page, and each act page lists the venue
  // pages that name it, so a new venue page joins both with no other edit.
  const cardActs = (o, out) => {
    if (Array.isArray(o)) o.forEach((x) => cardActs(x, out));
    else if (o && typeof o === "object") {
      if (o.type === "Cards" && o.props) for (const k of ["acts", "picks"]) for (const x of o.props[k] || []) if (x && x.act) out.add(x.act);
      Object.values(o).forEach((x) => cardActs(x, out));
    }
    return out;
  };
  const VENUES = pages
    .filter((d) => d.root.props.venue && !(d.root.props.robots || "").startsWith("noindex"))
    .map((d) => {
      const p = d.root.props;
      const v = p.venue;
      const played = (v.played || []).filter((id) => ACT_BY_ID[id] && !ACT_BY_ID[id].hidden);
      const named = new Set([...played, ...cardActs(d.content, new Set())]);
      return { ...v, path: p.path, played, named };
    })
    .sort((a, b) => pySort(a.name, b.name));
  const venuesFor = (id) => VENUES.filter((v) => v.named.has(id));
  // Testimonials (content/records/testimonials.json): the ones not hidden whose
  // act is on the site (no act: about Signet), newest first.
  const REVIEWS = ((c.testimonials && c.testimonials.testimonials) || [])
    .filter((t) => t && t.id && t.quote && !t.hidden && (!t.act || (ACT_BY_ID[t.act] && !ACT_BY_ID[t.act].hidden)))
    .sort((x, y) => String(y.date || "").localeCompare(String(x.date || "")));
  const REVIEW_BY_ID = Object.fromEntries(REVIEWS.map((t) => [t.id, t]));
  const reviewsFor = (id) => REVIEWS.filter((t) => t.act === id);
  const reviewsWhere = ({ occasions = [], acts = [], ids = [], limit } = {}) => {
    let out = ids.length
      ? ids.map((i) => REVIEW_BY_ID[i]).filter(Boolean)
      : REVIEWS.filter((t) => (!acts.length || acts.includes(t.act)) && (!occasions.length || (t.occasions || []).some((o) => occasions.includes(o))));
    // One act at a time while the list runs: the first of each act, then the second.
    if (!ids.length) {
      const by = new Map();
      for (const t of out) by.set(t.act || "", [...(by.get(t.act || "") || []), t]);
      const rounds = [];
      for (let i = 0; rounds.length < out.length; i++) for (const ts of by.values()) if (ts[i]) rounds.push(ts[i]);
      out = rounds;
    }
    return limit > 0 ? out.slice(0, limit) : out;
  };
  const CRUMB_OVERRIDES = {};
  for (const v of FOOTAGE) {
    const a = ACT_BY_ID[v.act];
    if (a && a.page) CRUMB_OVERRIDES[`/${WATCH_BASE}/${v.slug}/`] = "/" + a.page;
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
      laneWord = actLane(act) === "format" ? "House Ensembles" : "Featured Artists";
    } else {
      const depth = (u) => (u.replace(/^\/+|\/+$/g, "").match(/\//g) || []).length;
      peers = Object.keys(LABELS)
        .filter((u) => u !== url && u.startsWith(folder) && depth(u) === depth(url))
        .sort(pySort);
    }
    if (peers.length < 2) return null;
    const parent = crumbParent(url) || "/";
    return { lead: laneWord ? `More ${laneWord} on our` : "More in", parent, parentLabel: parent === "/" ? "Home" : crumbLabel(parent), peers: peers.map((u) => [u, crumbLabel(u)]) };
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
    c, site, brand, SITE_URL, roster, ALL_ACTS, ACTS, ACT_BY_ID, ACT_BY_URL, RATE_BY_ID, BUCKET_LABEL, GENRE_LABEL, AREA_LABEL, SERVICE_AREAS,
    VOCALS_LABEL, VOCALS_MATCH, FORMAT_ACTS, NAMED_ACTS, FLAGSHIPS, ACTS_BASE, WATCH_BASE,
    actsWhere, pageAct, usesLayout, pageContent, LAYOUT, L,
    actLane, actUrl, actConfigs, actAreaIds, actAreas, actByline, actBylineInline, actConfigRange, actCardLine,
    canonicalFor, FOOTAGE, FOOTAGE_BY_KEY, footageKey, watchOutput, watchUrl, watchThumb,
    posts, postBySlug, published, indexedPosts, pages, pageByUrl, LABELS, crumbLabel, crumbParent, crumbTrail, breadcrumbs,
    siblings, relatedArticles, actClips, hubIndex, POSTS_BY_PARENT, readingTime, dateDisplay, VENUES, venuesFor,
    REVIEWS, REVIEW_BY_ID, reviewsFor, reviewsWhere,
  };
}

export function slugLabel(url) {
  const slug = url.replace(/^\/+|\/+$/g, "").split("/").pop();
  return slug ? slug.replace(/-/g, " ").replace(/^./, (x) => x.toUpperCase()).replace(/(?<=.)[A-Z]/g, (x) => x.toLowerCase()) : "Home";
}

// Python's default string ordering (code points).
export const pySort = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
