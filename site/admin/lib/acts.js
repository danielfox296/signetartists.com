/* Acts as the admin edits them: one file each under content/acts/, their
   order and the filter choices in content/roster.json, photo crop points in
   content/photo-focus.json, and each act's page under content/pages/. Every
   change here is an edit to the working copy, saved with the next save. */
import { normPath, pagePath, pagesList, pathProblem, repoint, serialize, slugForPath, slugOf } from "./site.js";

export const ROSTER = "content/roster.json";
export const FOCUS = "content/photo-focus.json";
export const actPath = (id) => `content/acts/${id}.json`;

// The filter groups an act is tagged with. Vocals is one value, not a list.
export const FACETS = [
  { key: "buckets", tag: "bucket_tags", name: "Kind of night" },
  { key: "rateCard", tag: "config_tags", name: "Size" },
  { key: "genres", tag: "genre_tags", name: "Genre" },
  { key: "occasions", tag: "occasion_tags", name: "Occasion" },
  { key: "areas", tag: "area_tags", name: "Area" },
];
export const FACET = Object.fromEntries(FACETS.map((f) => [f.key, f]));
export const VOCALS = [
  { value: "sung", label: "Sung" },
  { value: "instrumental", label: "Instrumental" },
  { value: "optional", label: "Either" },
];
export const LANES = [
  { value: "named", label: "Named act" },
  { value: "format", label: "Band setup" },
];
export const LANE_LABEL = Object.fromEntries(LANES.map((l) => [l.value, l.label]));

export const slugify = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const unique = (base, taken) => {
  let id = base;
  for (let i = 2; taken(id); i++) id = `${base}-${i}`;
  return id;
};

// ------------------------------------------------------------ reading

export const rosterOf = (repo) => repo.json(ROSTER);
export const actOf = (repo, id) => repo.json(actPath(id));
export const laneOf = (a) => a.lane || (a.presentation === "face" ? "named" : "format");

// Every act: the roster's order, then any act file the roster doesn't list.
export function actsList(repo) {
  const r = rosterOf(repo);
  if (!r) return [];
  const files = repo
    .list("content/acts/")
    .filter((p) => p.endsWith(".json"))
    .map(slugOf);
  const order = r.order.filter((id) => files.includes(id));
  const loose = files.filter((id) => !order.includes(id));
  return [...order.map((id) => ({ ...actOf(repo, id), onRoster: true })), ...loose.map((id) => ({ ...actOf(repo, id), onRoster: false }))];
}

export const labelOf = (repo, key, id) => {
  const x = (rosterOf(repo)[key] || []).find((c) => c.id === id);
  return x ? x.label : id;
};

// "Solo to quartet", the way the card writes it.
export function sizeRange(repo, a) {
  if (a.configRangeLabel) return a.configRangeLabel;
  const card = rosterOf(repo).rateCard;
  const cs = (a.config_tags || []).map((t) => card.find((c) => c.id === t)).filter(Boolean);
  if (!cs.length) return "";
  return cs.length === 1 ? cs[0].label : `${cs[0].label} to ${cs[cs.length - 1].rangeLabel}`;
}

// The act's page: the page file at its URL.
export function actPage(repo, a) {
  if (!a || !a.page) return null;
  return pagesList(repo).find((p) => p.path === "/" + a.page) || null;
}

// ------------------------------------------------------------ writing

const write = (repo, path, v, source) => {
  const t = serialize(v);
  if (t !== repo.get(path)) repo.set(path, t, source);
};

export function editAct(repo, id, fn, source) {
  const cur = actOf(repo, id);
  if (!cur) return;
  const n = structuredClone(cur);
  fn(n);
  write(repo, actPath(id), n, source);
}

export function editRoster(repo, fn) {
  const n = structuredClone(rosterOf(repo));
  fn(n);
  write(repo, ROSTER, n);
}

// Fields every act file carries. Any other field left empty leaves the
// file, so a save writes no empty fields.
const KEEP = new Set(["id", "name", "presentation", "status", "style", "bucket_tags", "config_tags", "genre_tags", "occasion_tags", "vocals", "img", "alt", "video", "blurb"]);
const empty = (v) => v == null || v === "" || (Array.isArray(v) && !v.length);
export function put(obj, key, value) {
  if (empty(value) && !KEEP.has(key)) delete obj[key];
  else obj[key] = value;
}

// Tags keep the order they were added in, except sizes, which keep the
// size list's order: the card reads "first to last".
export function toggleTag(repo, a, facet, value) {
  const cur = a[facet.tag] || [];
  let next;
  if (cur.includes(value)) next = cur.filter((x) => x !== value);
  else if (facet.key === "rateCard") {
    const order = rosterOf(repo).rateCard.map((c) => c.id);
    next = order.filter((x) => x === value || cur.includes(x));
    next.push(...cur.filter((x) => !order.includes(x)));
  } else next = [...cur, value];
  return next;
}

// ------------------------------------------------------------ crop point

export const focusKey = (img) => (img ? `img/${img}` : null);
export function focusOf(repo, img) {
  const f = repo.json(FOCUS) || {};
  const v = img && f[focusKey(img)];
  const m = /^\s*(-?[\d.]+)%\s+(-?[\d.]+)%\s*$/.exec(v || "");
  return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 50, y: 50 };
}
// The centre is the default crop, so a point there leaves the file.
export function setFocus(repo, img, { x, y }) {
  if (!img) return;
  const f = structuredClone(repo.json(FOCUS) || {});
  const k = focusKey(img);
  if (Math.round(x) === 50 && Math.round(y) === 50) delete f[k];
  else f[k] = `${Math.round(x)}% ${Math.round(y)}%`;
  write(repo, FOCUS, f);
}

// ------------------------------------------------------------ roster

export function moveInRoster(repo, id, beforeId) {
  editRoster(repo, (r) => {
    const order = r.order.filter((x) => x !== id);
    const at = beforeId ? order.indexOf(beforeId) : -1;
    if (at < 0) order.push(id);
    else order.splice(at, 0, id);
    r.order = order;
  });
}

const ACT_IDS = (repo) => new Set(repo.list("content/acts/").map(slugOf));

export function newAct(repo, { name, lane }) {
  const taken = ACT_IDS(repo);
  const id = unique(slugify(name) || "act", (x) => taken.has(x));
  const named = lane === "named";
  const a = {
    id,
    name: name.trim(),
    presentation: named ? "face" : "spec",
    status: "listing",
    hidden: true,
    style: "",
    ...(named ? { face: "" } : { spec: "" }),
    bucket_tags: [],
    config_tags: [],
    genre_tags: [],
    vocals: "sung",
    img: "",
    alt: "",
    video: "",
    blurb: "",
    occasion_tags: [],
  };
  write(repo, actPath(id), a);
  editRoster(repo, (r) => r.order.push(id));
  return id;
}

// A copy sits after the act, hidden, with no page, and without the notes
// the act's own file keeps about its decisions.
const withoutNotes = (v) => {
  if (Array.isArray(v)) return v.map(withoutNotes);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith("_")).map(([k, x]) => [k, withoutNotes(x)]));
  return v;
};
export function duplicateAct(repo, id) {
  const src = actOf(repo, id);
  const taken = ACT_IDS(repo);
  const nid = unique(`${id}-copy`, (x) => taken.has(x));
  const a = withoutNotes(structuredClone(src));
  a.id = nid;
  a.name = `${src.name} (copy)`;
  a.status = "listing";
  delete a.page;
  const out = {};
  for (const [k, v] of Object.entries(a)) {
    out[k] = v;
    if (k === "status") out.hidden = true;
  }
  if (!("hidden" in out)) out.hidden = true;
  write(repo, actPath(nid), out);
  editRoster(repo, (r) => {
    const i = r.order.indexOf(id);
    r.order.splice(i < 0 ? r.order.length : i + 1, 0, nid);
  });
  return nid;
}

// What goes with an act when it is deleted: its page, its video clips, and
// the parts and list entries on other pages that name it.
const NAMES_ACT = new Set(["ActHeader", "ActAbout", "ActSizes", "Setlist", "ActClose"]);
function withoutAct(items, id) {
  let n = 0;
  const walk = (list) =>
    list
      .filter((c) => {
        if (NAMES_ACT.has(c.type) && c.props.act === id) return (n++, false);
        return true;
      })
      .map((c) => {
        const props = { ...c.props };
        if (c.type === "Cards") {
          for (const k of ["picks", "acts"]) {
            if (!Array.isArray(props[k])) continue;
            const keep = props[k].filter((x) => x.act !== id);
            if (keep.length !== props[k].length) (n += props[k].length - keep.length), (props[k] = keep);
          }
        }
        for (const [k, v] of Object.entries(props)) if (Array.isArray(v) && v.length && v[0] && v[0].type && v[0].props) props[k] = walk(v);
        return { ...c, props };
      });
  return { content: walk(items), n };
}

// The other pages whose copy or buttons link to a page.
export function linkedFrom(repo, path, skip) {
  if (!path) return [];
  const needle = `"${path}`;
  return pagesList(repo).filter((p) => p.file !== skip && p.path !== path && (repo.get(p.file) || "").includes(needle));
}

export function deletePlan(repo, id) {
  const a = actOf(repo, id);
  const page = actPage(repo, a);
  const clips = repo
    .list("content/videos/")
    .filter((p) => p.endsWith(".json"))
    .map((p) => ({ file: p, v: repo.json(p) }))
    .filter((x) => x.v.act === id);
  const pages = pagesList(repo)
    .filter((p) => !page || p.file !== page.file)
    .map((p) => ({ ...p, cut: withoutAct(p.doc.content, id) }))
    .filter((p) => p.cut.n);
  const links = page ? linkedFrom(repo, page.path, page.file) : [];
  return { a, page, clips, pages, links };
}

export function deleteAct(repo, id, { redirectTo = "/music/" } = {}) {
  const plan = deletePlan(repo, id);
  const apply = (changes, skip) => {
    for (const [f, v] of changes) if (f !== skip) repo.set(f, serialize(v));
  };
  if (plan.page) {
    apply(repoint(repo, plan.page.path, normPath(redirectTo), { deleted: true }), plan.page.file);
    repo.remove(plan.page.file);
  }
  for (const c of plan.clips) {
    apply(repoint(repo, `/video/${c.v.slug}/`, "/video/", { deleted: true }), c.file);
    repo.remove(c.file);
  }
  for (const p of plan.pages) {
    const cur = repo.json(p.file);
    if (!cur) continue;
    write(repo, p.file, { ...cur, content: withoutAct(cur.content, id).content });
  }
  editRoster(repo, (r) => (r.order = r.order.filter((x) => x !== id)));
  repo.remove(actPath(id));
}

// ------------------------------------------------------------ the act's page

export const defaultPageUrl = (a) => `/${laneOf(a) === "named" ? "artists" : "ensembles"}/${slugify(a.name) || a.id}/`;

const firstSentences = (t) => {
  const parts = String(t || "").trim().split(/(?<=[.!?])\s+/);
  return parts.slice(0, 2).join(" ").slice(0, 300);
};

// A new page on the act page layout, at `url`. Returns a problem, or null.
export function pageOn(repo, id, url) {
  const a = actOf(repo, id);
  const path = normPath(url);
  const problem = pathProblem(repo, path, null);
  if (problem) return problem;
  let slug = slugForPath(path);
  for (let i = 2; repo.has(pagePath(slug)); i++) slug = `${slugForPath(path)}-${i}`;
  const props = { path, title: a.seo_title || a.name, description: a.meta_description || firstSentences(a.blurb), nav: "music" };
  if (a.img) props.ogImage = `img/${a.img}`;
  props.layout = "act";
  props.schema = { act: id };
  const red = repo.json("content/redirects.json");
  if (red.some((r) => r.from === path)) write(repo, "content/redirects.json", red.filter((r) => r.from !== path));
  write(repo, pagePath(slug), { root: { props }, content: [] });
  editAct(repo, id, (x) => {
    const out = {};
    for (const [k, v] of Object.entries(x)) {
      if (k === "page") continue;
      out[k] = v;
      if (k === "status") out.page = path.slice(1);
    }
    if (!("page" in out)) out.page = path.slice(1);
    for (const k of Object.keys(x)) delete x[k];
    Object.assign(x, out);
  });
  return null;
}

// The page goes, with a redirect to `to`.
export function pageOff(repo, id, to) {
  const a = actOf(repo, id);
  const pg = actPage(repo, a);
  if (pg) {
    for (const [f, v] of repoint(repo, pg.path, normPath(to), { deleted: true })) if (f !== pg.file) repo.set(f, serialize(v));
    repo.remove(pg.file);
  }
  editAct(repo, id, (x) => delete x.page);
}

// The page moves to `url`, and what pointed at the old address follows.
export function movePage(repo, id, url) {
  const a = actOf(repo, id);
  const pg = actPage(repo, a);
  const path = normPath(url);
  if (!pg) {
    editAct(repo, id, (x) => (x.page = path.slice(1)));
    return null;
  }
  if (path === pg.path) return null;
  const problem = pathProblem(repo, path, pg.slug);
  if (problem) return problem;
  for (const [f, v] of repoint(repo, pg.path, path)) if (f !== pg.file) repo.set(f, serialize(v));
  const doc = structuredClone(repo.json(pg.file));
  doc.root.props.path = path;
  write(repo, pg.file, doc);
  return null;
}

// Search fields sit on the page: its SEO title and meta description.
export function editPageProps(repo, file, fn) {
  const doc = structuredClone(repo.json(file));
  fn(doc.root.props);
  write(repo, file, doc);
}

// ------------------------------------------------------------ filter choices

export function choiceUsers(repo, key, id) {
  const f = FACET[key];
  const acts = actsList(repo).filter((a) => (a[f.tag] || []).includes(id) || (key === "rateCard" && (a.ladder || []).some((r) => r.config === id)));
  const src = key === "occasions" ? "occasion" : key === "buckets" ? "night" : null;
  const pages = [];
  if (src) {
    for (const p of pagesList(repo)) {
      let hit = false;
      const walk = (list) => {
        for (const c of list || []) {
          if (c.type === "Cards" && c.props.source === src && c.props[src] === id) hit = true;
          for (const v of Object.values(c.props || {})) if (Array.isArray(v) && v.length && v[0] && v[0].type && v[0].props) walk(v);
        }
      };
      walk(p.doc.content);
      if (hit) pages.push(p);
    }
  }
  return { acts, pages };
}

export function renameChoice(repo, key, id, label) {
  editRoster(repo, (r) => {
    const x = r[key].find((c) => c.id === id);
    if (x) x.label = label;
  });
}

export function editChoice(repo, key, id, fn) {
  editRoster(repo, (r) => {
    const x = r[key].find((c) => c.id === id);
    if (x) fn(x);
  });
}

export function moveChoice(repo, key, from, to) {
  editRoster(repo, (r) => {
    const list = r[key];
    if (to < 0 || to >= list.length || from === to) return;
    const [x] = list.splice(from, 1);
    list.splice(to, 0, x);
  });
}

export function addChoice(repo, key, label) {
  const name = label.trim();
  if (!name) return null;
  const list = rosterOf(repo)[key] || [];
  const id = unique(slugify(name) || "choice", (x) => list.some((c) => c.id === x));
  editRoster(repo, (r) => {
    const item = key === "rateCard" ? { id, rangeLabel: name.toLowerCase(), label: name, pieces: 1 } : { id, label: name };
    (r[key] ||= []).push(item);
  });
  return id;
}

// The choice leaves the list and every act that carries it, in one save.
export function removeChoice(repo, key, id) {
  const f = FACET[key];
  for (const a of choiceUsers(repo, key, id).acts) {
    editAct(repo, a.id, (x) => {
      if (Array.isArray(x[f.tag])) put(x, f.tag, x[f.tag].filter((t) => t !== id));
      if (key === "rateCard" && Array.isArray(x.ladder)) put(x, "ladder", x.ladder.filter((r) => r.config !== id));
    });
  }
  editRoster(repo, (r) => (r[key] = r[key].filter((c) => c.id !== id)));
}
