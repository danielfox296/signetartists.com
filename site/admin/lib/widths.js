/* Widths of sections and blocks. A width is written into the style the item
   already keeps for its box (a section's column, a paragraph, a heading, a
   call to action's words, a picture), as the site and CopyDesk always wrote
   it: "max-width: 42rem;", or for a picture "width: 42rem; height: auto;".
   A box is never wider than what holds it, so a phone never overflows. */

// The site's reading measure and its column (styles.css: .prose, .heading
// and .wrap--narrow; --wrap), in rem.
export const NARROW = 42;
export const WIDE = 64;
export const MIN = { box: 8, img: 4 };
// A section's column sits at the page column's left edge, as wide as asked.
export const SECTION_LEFT = "max(0px, (100% - var(--wrap)) / 2 - 2rem)";

// Where each item keeps the style of the box its width applies to.
// Sections: their column (.wrap), or the section itself where it has none.
const BLOCK_PROP = { Heading: "headingStyle", CloseRow: "boxStyle", Picture: "image.style" };
// Sections that run the window's width, or are markup as written: the
// section itself is sized, as a block is.
const WHOLE = new Set(["RangeStrip", "CoverStrip", "CoverWall", "CustomHtml"]);
export function widthOf(type, isSection) {
  if (isSection) return { prop: "wrapStyle", kind: WHOLE.has(type) ? "box" : "section" };
  if (type === "Picture") return { prop: BLOCK_PROP.Picture, kind: "img" };
  return { prop: BLOCK_PROP[type] || "style", kind: "box" };
}
// Blocks the site's stylesheet centres on its own.
const CENTRED = new Set(["Quote"]);
// A heading's title, lede and paragraphs, and a call to action's title and
// words, were often given the width of the box around them so they would
// fill it. When the box is resized those widths go, and they follow the box;
// a narrower measure of their own stays. OWN: the box's width with none set.
const INNER = { Heading: ["titleStyle", "ledeStyle", "headingText"], CloseRow: ["titleStyle", "ledeStyle"] };
const OWN = { Heading: NARROW, CloseRow: Infinity };
function follow(props, keys, outer) {
  const loose = (st) => {
    const r = remOf(getDecl(st, "max-width"));
    return r != null && r >= outer - 0.01 ? withDecls(st, { "max-width": null }) || undefined : st;
  };
  let out = props;
  for (const k of keys) {
    if (k === "headingText" && Array.isArray(out[k])) {
      const next = out[k].map((t) => (t && t.style && loose(t.style) !== t.style ? setPath(t, "style", loose(t.style)) : t));
      if (next.some((t, i) => t !== out[k][i])) out = { ...out, [k]: next };
    } else if (typeof out[k] === "string" && loose(out[k]) !== out[k]) out = setPath(out, k, loose(out[k]));
  }
  return out;
}

// ------------------------------------------------------------ style text

// "max-width: 42rem; zoom: 1.2;" -> [["max-width", "42rem"], ["zoom", "1.2"]],
// each with the text it was written as, so what isn't changed stays as it was.
function decls(style) {
  const out = [];
  for (const raw of String(style || "").split(";")) {
    const i = raw.indexOf(":");
    if (i < 0) continue;
    const prop = raw.slice(0, i).trim().toLowerCase();
    if (prop) out.push({ prop, value: raw.slice(i + 1).trim(), raw: raw.trim() });
  }
  return out;
}
export const getDecl = (style, prop) => (decls(style).find((d) => d.prop === prop) || {}).value;

// The style with each of `changes` set ({prop: value}) or taken out
// ({prop: null}); new declarations go at the end. "" when nothing is left.
export function withDecls(style, changes) {
  const list = decls(style);
  const out = [];
  const done = new Set();
  for (const d of list) {
    if (!(d.prop in changes)) out.push(d.raw);
    else if (changes[d.prop] != null && !done.has(d.prop)) out.push(`${d.prop}: ${changes[d.prop]}`), done.add(d.prop);
    else done.add(d.prop);
  }
  for (const [p, v] of Object.entries(changes)) if (v != null && !done.has(p)) out.push(`${p}: ${v}`);
  return out.length ? out.join("; ") + ";" : "";
}

const remOf = (v) => {
  const m = /^([\d.]+)rem$/.exec(String(v || "").trim());
  return m ? Number(m[1]) : null;
};
export const roundRem = (x) => Math.round(x * 2) / 2;

// ------------------------------------------------------------ reading

// What an item's width is: {preset, rem, align}. `measured` is what the
// canvas shows when nothing is written ({rem, full, centred}).
export function readWidth(item, w, measured) {
  const style = getPath(item.props, w.prop);
  const m = measured || {};
  if (w.kind === "img") {
    const v = getDecl(style, "width");
    const rem = remOf(v);
    const align = getDecl(style, "margin-left") === "auto" || m.centred ? "center" : "left";
    if (v === "100%") return { preset: "full", rem: m.rem, align };
    if (rem != null) return { preset: presetOf(rem), rem, align };
    return { preset: m.full ? "full" : m.rem != null ? presetOf(m.rem) : null, rem: m.rem, align };
  }
  const v = getDecl(style, "max-width");
  const ml = getDecl(style, "margin-left");
  let align = ml === "auto" ? "center" : ml != null ? "left" : null;
  if (w.kind === "section") {
    if (v === "none") return { preset: "full", rem: m.rem, align: null };
    const rem = remOf(v);
    if (rem != null) return { preset: presetOf(rem), rem, align: align || "center" };
    // The section's own column, or the narrow one it was given before widths.
    if (item.props.narrow) return { preset: "narrow", rem: NARROW, align: null };
    return { preset: "wide", rem: WIDE, align: "center" };
  }
  if (!align && m.centred != null) align = m.centred ? "center" : "left";
  if (v === "none") return { preset: "full", rem: m.rem, align };
  const rem = remOf(v);
  if (rem != null) return { preset: presetOf(rem), rem, align };
  return { preset: m.full ? "full" : m.rem != null ? presetOf(m.rem) : null, rem: m.rem, align };
}
const presetOf = (rem) => (rem === NARROW ? "narrow" : rem === WIDE ? "wide" : "custom");

// ------------------------------------------------------------ writing

export const getPath = (o, path) => path.split(".").reduce((cur, k) => (cur == null ? cur : cur[k]), o);
function setPath(o, path, v) {
  const [k, ...rest] = path.split(".");
  if (!rest.length) {
    const out = { ...o };
    if (v === undefined) delete out[k];
    else out[k] = v;
    return out;
  }
  return { ...o, [k]: setPath(o[k] || {}, rest.join("."), v) };
}

// The item's props with its width set: `to` is {preset, rem} and/or
// {align}; what isn't given stays as it is.
export function setWidth(item, w, to, type) {
  let props = item.props;
  let style = getPath(props, w.prop) || "";
  const cur = readWidth(item, w, to.measured);
  const preset = to.preset || cur.preset;
  const rem = to.preset === "custom" ? to.rem : !to.preset && cur.preset === "custom" ? cur.rem : null;
  const align = to.align || cur.align;
  const changes = {};
  if (w.kind === "img") {
    if (to.preset || to.rem != null) {
      changes.width = preset === "full" ? "100%" : `${preset === "narrow" ? NARROW : preset === "wide" ? WIDE : rem}rem`;
      changes.height = "auto";
    }
    if (to.align) {
      const centre = to.align === "center";
      changes.display = centre ? "block" : getDecl(style, "display") === "block" ? null : getDecl(style, "display");
      changes["margin-left"] = centre ? "auto" : null;
      changes["margin-right"] = centre ? "auto" : null;
    }
  } else if (w.kind === "section") {
    const target = preset === "narrow" ? NARROW : preset === "wide" ? null : preset === "full" ? "none" : rem;
    // The narrow column a section had before widths stays as it is until
    // its width or alignment is changed.
    if (to.preset === "narrow" && props.narrow && !getDecl(style, "max-width") && !to.align) return props;
    if (props.narrow) props = { ...props, narrow: undefined };
    changes["max-width"] = target == null ? null : typeof target === "number" ? `${target}rem` : target;
    const left = align === "left" && typeof target === "number";
    changes["margin-left"] = left ? SECTION_LEFT : null;
    changes["margin-right"] = left ? "auto" : null;
  } else {
    if (to.preset || to.rem != null) changes["max-width"] = preset === "full" ? "none" : `${preset === "narrow" ? NARROW : preset === "wide" ? WIDE : rem}rem`;
    if (to.align) {
      const centre = to.align === "center";
      changes["margin-left"] = centre ? "auto" : CENTRED.has(type) ? "0" : null;
      changes["margin-right"] = centre ? "auto" : null;
    }
  }
  if (changes["max-width"] !== undefined && INNER[type]) props = follow(props, INNER[type], remOf(getDecl(style, "max-width")) ?? OWN[type]);
  style = withDecls(style, changes);
  props = setPath(props, w.prop, style || undefined);
  // A call to action's words get their own box to be sized.
  if (type === "CloseRow" && style && props.boxed === false) props = { ...props, boxed: true };
  return props;
}

// A width as the Go live drawer says it: "Narrow, Center", "50 rem".
export function describeWidth(style, kind) {
  const v = getDecl(style, kind === "img" ? "width" : "max-width");
  const rem = remOf(v);
  const size = v == null ? "" : v === "none" || v === "100%" ? "Full" : rem === NARROW ? "Narrow" : rem === WIDE ? "Wide" : rem != null ? `${rem} rem` : v;
  const ml = getDecl(style, "margin-left");
  const align = ml === "auto" ? "Center" : ml != null ? "Left" : "";
  return [size, align].filter(Boolean).join(", ");
}
