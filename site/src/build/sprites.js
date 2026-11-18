/* Sprite sheets: drawings that repeat on many pages, written once as an SVG
   file of <symbol>s and drawn on a page with <svg viewBox><use href></svg>.
   The page's <svg> keeps its viewBox, size, class and accessible name; the
   drawing inside a <use> inherits the page's colour (currentColor) and its
   custom properties, as the inline drawing did. */
import crypto from "node:crypto";

const ROOT = /^\s*(?:<\?xml[^>]*>\s*)?<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/;
const attrOf = (attrs, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(" " + attrs);
  return m ? m[1] : null;
};

// One drawing's parts: the root's viewBox and paint attributes, its <title>,
// and its children made self-contained, so the symbol needs nothing from the
// file around it: no ids, no <use> inside, no clip paths, no <style>.
export function splitSvg(svg) {
  const m = ROOT.exec(svg);
  if (!m) throw new Error("not an <svg>: " + svg.slice(0, 60));
  const [, attrs, inner0] = m;
  const viewBox = attrOf(attrs, "viewBox");
  const paint = ["fill", "fill-rule", "clip-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"]
    .map((k) => [k, attrOf(attrs, k)])
    .filter(([, v]) => v != null);
  let inner = inner0;
  const titleM = /<title>([\s\S]*?)<\/title>/.exec(inner);
  const title = titleM ? titleM[1] : null;
  inner = inner.replace(/<title>[\s\S]*?<\/title>/g, "");
  // <use href="#x"> becomes a copy of #x.
  const byId = (id) => {
    const r = new RegExp(`<([a-zA-Z]+)\\b[^>]*\\sid="${id}"[^>]*?(?:/>|>[\\s\\S]*?</\\1>)`).exec(inner);
    return r ? r[0] : null;
  };
  inner = inner.replace(/<use\b([^>]*?)\/?>(?:<\/use>)?/g, (all, a) => {
    const ref = (attrOf(a, "xlink:href") || attrOf(a, "href") || "").replace(/^#/, "");
    const el = ref && byId(ref);
    if (!el) throw new Error("a <use> with nothing to copy: " + all);
    const t = attrOf(a, "transform");
    return t ? `<g transform="${t}">${el}</g>` : el;
  });
  // Every class rule in the drawings sets fill to currentColor, which the
  // root's fill already gives.
  const styles = inner.match(/<style\b[\s\S]*?<\/style>/g) || [];
  for (const s of styles) {
    const rules = s.replace(/<\/?style[^>]*>/g, "").trim().split("}").map((x) => x.trim()).filter(Boolean);
    if (!rules.every((r) => /^\.[\w-]+\s*\{\s*fill:\s*currentColor;?\s*$/.test(r)) || attrOf(attrs, "fill") !== "currentColor")
      throw new Error("a <style> the sprite cannot carry: " + s);
  }
  inner = inner.replace(/<style\b[\s\S]*?<\/style>/g, "").replace(/\sclass="[^"]*"/g, "");
  inner = inner
    .replace(/<clipPath\b[\s\S]*?<\/clipPath>/g, "")
    .replace(/<linearGradient\b[\s\S]*?<\/linearGradient>/g, "")
    .replace(/<radialGradient\b[\s\S]*?<\/radialGradient>/g, "")
    .replace(/\sclip-path="[^"]*"/g, "")
    .replace(/\sid="[^"]*"/g, "")
    .replace(/<defs\b[^>]*>\s*<\/defs>|<defs\b[^>]*\/>/g, "");
  if (/url\(#|href="#/.test(inner)) throw new Error("a drawing still points inside itself");
  return { viewBox, paint, title, inner };
}

const fp = (text) => crypto.createHash("sha1").update(text).digest("hex").slice(0, 10);

// The sheet's text and its ?v= from {id: {viewBox, paint, inner}}.
export function sheet(drawings) {
  const body = Object.entries(drawings)
    .map(([id, d]) => {
      const paint = d.paint.map(([k, v]) => ` ${k}="${v}"`).join("");
      return `<symbol id="${id}" viewBox="${d.viewBox}"${paint}>${d.inner}</symbol>`;
    })
    .join("\n");
  const text = `<svg xmlns="http://www.w3.org/2000/svg">\n${body}\n</svg>\n`;
  return { text, version: fp(text) };
}
