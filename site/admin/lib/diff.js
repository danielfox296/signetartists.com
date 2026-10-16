/* What changed in a file, as a person reads it: the words that changed in
   each piece of copy, and the sections added, removed or moved. */
import { htmlText } from "../../src/lib/util.js";

const isComp = (x) => x && typeof x === "object" && typeof x.type === "string" && x.props && typeof x.props === "object";

// Every string in a value, keyed by where it sits. Components are keyed by
// id, so a section that moves keeps its key. `fields` names what each key
// is called where it sits.
function leaves(v, key, out, comps, labels, label, owner, fields) {
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
    out.set(key, { v: String(v), label, owner });
    return;
  }
  if (Array.isArray(v)) {
    v.forEach((x, i) => {
      if (isComp(x)) {
        const k = `${key}/${x.props.id || i}`;
        comps.set(k, { c: x, at: i, list: key, owner });
        leaves(x.props, k, out, comps, labels, [...label, labels.comp(x)], k, labels.fieldsOf(x.type));
      } else leaves(x, `${key}/${i}`, out, comps, labels, [...label, `${i + 1}`], owner, fields);
    });
    return;
  }
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (k === "id" || k.startsWith("_") || k === "notes") continue;
      const f = fields && fields[k];
      const sub = f ? (f.type === "object" ? f.objectFields : f.type === "array" ? f.arrayFields : null) : null;
      const name = k === "root" || k === "props" || k === "content" || (f && f.type === "slot") ? null : (f && f.label) || labels.human(k);
      leaves(x, `${key}/${k}`, out, comps, labels, name ? [...label, name] : label, owner, k === "root" || k === "props" ? fields : sub);
    }
  }
}

const words = (s) => s.match(/\s+|[^\s]+/g) || [];

// Word-level diff: [{t: "same" | "del" | "ins", s}]
export function wordDiff(a, b) {
  const x = words(a);
  const y = words(b);
  if (x.length * y.length > 4e6) return [{ t: "del", s: a }, { t: "ins", s: b }];
  const n = x.length;
  const m = y.length;
  const L = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  const push = (t, s) => {
    const last = out[out.length - 1];
    if (last && last.t === t) last.s += s;
    else out.push({ t, s });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) push("same", x[i++]), j++;
    else if (L[i + 1][j] >= L[i][j + 1]) push("del", x[i++]);
    else push("ins", y[j++]);
  }
  while (i < n) push("del", x[i++]);
  while (j < m) push("ins", y[j++]);
  return out;
}

// Trim long unchanged runs to a few words either side of a change.
export function clip(parts, keep = 8) {
  return parts.map((p, i) => {
    if (p.t !== "same") return p;
    const w = words(p.s);
    if (w.length <= keep * 2 + 1) return p;
    const head = i === 0 ? [] : w.slice(0, keep);
    const tail = i === parts.length - 1 ? [] : w.slice(-keep);
    return { t: "same", s: (head.length ? head.join("") : "") + " … " + (tail.length ? tail.join("") : "") };
  });
}

const plain = (s) => htmlText(s).replace(/\s+/g, " ").trim();
const tidy = (l) => l.filter((x, i, a) => x !== a[i - 1]).join(" · ") || "Settings";

export function makeLabels(registry) {
  return {
    comp: (c) => (registry[c.type] ? registry[c.type].label || c.type : c.type),
    fieldsOf: (type) => (registry[type] ? registry[type].fields : null),
    human: (k) => k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()),
  };
}

// The first words a section shows, to tell two of a kind apart.
export function sectionName(c, registry) {
  const def = registry[c.type];
  const kind = def ? def.label || c.type : c.type;
  const first = (v) => {
    if (typeof v === "string") return v;
    if (Array.isArray(v)) {
      for (const x of v) {
        const r = first(isComp(x) ? x.props : x);
        if (r) return r;
      }
    } else if (v && typeof v === "object") {
      for (const k of ["title", "eyebrow", "html", "heading", "label", "q", "term"]) if (typeof v[k] === "string" && plain(v[k])) return v[k];
      for (const k of ["blocks", "c1"]) if (v[k]) {
        const r = first(v[k]);
        if (r) return r;
      }
    }
    return "";
  };
  const t = plain(first(c.props) || "");
  return { kind, text: t.length > 60 ? t.slice(0, 57) + "…" : t };
}

// The readable changes between two versions of a JSON file. `rootFields`
// names the file's top-level keys (a page's settings, a shared part's fields).
export function jsonDiff(a, b, registry, rootFields) {
  const labels = makeLabels(registry);
  const la = new Map();
  const lb = new Map();
  const ca = new Map();
  const cb = new Map();
  if (a !== undefined) leaves(a, "", la, ca, labels, [], null, rootFields);
  if (b !== undefined) leaves(b, "", lb, cb, labels, [], null, rootFields);
  const out = [];
  const name = (c) => {
    const n = sectionName(c, registry);
    return n.text ? `${n.kind}: ${n.text}` : n.kind;
  };
  // Added and removed components, not counting the ones inside them.
  for (const [k, x] of cb) if (!ca.has(k) && !(x.owner && !ca.has(x.owner))) out.push({ kind: "added", where: name(x.c) });
  for (const [k, x] of ca) if (!cb.has(k) && !(x.owner && !cb.has(x.owner))) out.push({ kind: "removed", where: name(x.c) });
  // The order of the sections that are on both sides.
  const order = (m, other) => [...m.entries()].filter(([k, x]) => x.list === "/content" && other.has(k)).sort((p, q) => p[1].at - q[1].at).map(([k]) => k);
  if (order(ca, cb).join() !== order(cb, ca).join()) out.push({ kind: "moved", where: "Section order" });
  // Copy and settings, inside components on both sides.
  for (const [k, x] of lb) {
    const y = la.get(k);
    if (y && y.v === x.v) continue;
    if (x.owner && !ca.has(x.owner)) continue;
    if (!y) {
      if (plain(x.v)) out.push({ kind: "changed", where: tidy(x.label), parts: [{ t: "ins", s: plain(x.v) }] });
      continue;
    }
    const pa = plain(y.v);
    const pb = plain(x.v);
    out.push({ kind: "changed", where: tidy(x.label), parts: pa === pb ? [{ t: "same", s: "Formatting" }] : clip(wordDiff(pa, pb)) });
  }
  for (const [k, y] of la) {
    if (lb.has(k) || (y.owner && !cb.has(y.owner))) continue;
    if (plain(y.v)) out.push({ kind: "changed", where: tidy(y.label), parts: [{ t: "del", s: plain(y.v) }] });
  }
  return out;
}
