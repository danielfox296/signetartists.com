/* Site styles: the colour, type and corner tokens in content/styles.json,
   written into the stylesheet. The tokens as the stylesheet has them leave
   it as it is, byte for byte. */

// The colours the admin edits, as the stylesheet's :root names them.
export const COLORS = ["--paper", "--paper-sunk", "--rule", "--rule-strong", "--ink", "--ink-soft", "--ink-faint", "--brass", "--brass-bright"];
// Kept the same as --ink-soft, as the stylesheet says it is by design.
const ALIASES = { "--paper-dim": "--ink-soft" };

// Font sizes a type scale reaches: headings, and running text.
const HEADINGS = /\.(h1|h2|h3)\b|\.display\b|\.h3--lead|headline|subhead|-title\b|\.act-name/;
const BODY = /(^|[\s,])body\b|\.lede\b|\.prose\b|\.note\b|blog-prose|blog-dek|act-blurb|blog-row-dek|blog-related-dek/;

// Boxes that take the corner radius. Pills stay round, and grids drawn with
// hairline gaps stay square.
const CORNERS = [
  ".btn", ".media", ".panel", ".chip", ".clip-thumb", ".act-card-img", ".act-card-video", ".act-video", ".blog-row-thumb",
  ".blog-figure img", ".blog-data-viz svg", ".blog-video-frame", ".blog-stat", ".blog-aside", ".blog-takeaways", ".blog-cta",
  ".season-date", ".field input", ".field select", ".field textarea", ".filter-field select", ".catalog-search input",
];

const ROOT = /:root\s*\{[\s\S]*?\n\}/;

// The tokens the stylesheet itself has.
export function stylesOf(css) {
  const root = (ROOT.exec(css) || [""])[0];
  const colors = {};
  for (const name of COLORS) {
    const m = new RegExp(`\\n\\s*${name}:\\s*([^;]+);`).exec(root);
    if (m) colors[name] = m[1].trim();
  }
  return { colors, type: { headings: 100, body: 100 }, corners: 0 };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Lengths in a font-size value times a factor: 2.25rem, 16px, clamp(...).
const scaleValue = (v, f) => v.replace(/(\d*\.?\d+)(rem|px|em|vw)\b/g, (_, n, u) => `${+(Number(n) * f).toFixed(4)}${u}`);

function scaleType(css, pattern, f) {
  if (f === 1) return css;
  // Comments are set aside first: they may hold braces.
  const notes = [];
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, (c) => `\u0000${notes.push(c) - 1}\u0000`);
  const scaled = bare.replace(/([^{}]*)\{([^{}]*)\}/g, (all, sel, body) => {
    if (!pattern.test(sel.replace(/\u0000\d+\u0000/g, " ")) || !/font-size\s*:/.test(body)) return all;
    return `${sel}{${body.replace(/(font-size\s*:\s*)([^;]+)/g, (_, k, v) => k + scaleValue(v, f))}}`;
  });
  return scaled.replace(/\u0000(\d+)\u0000/g, (_, i) => notes[Number(i)]);
}

// The stylesheet with the tokens in `styles` written into it.
export function stylesheet(css, styles) {
  if (!styles) return css;
  const base = stylesOf(css);
  const want = { colors: { ...base.colors, ...(styles.colors || {}) }, type: { ...base.type, ...(styles.type || {}) }, corners: Number(styles.corners) || 0 };
  if (same(want, base)) return css;
  let out = css.replace(ROOT, (root) => {
    let r = root;
    for (const [name, value] of Object.entries(want.colors)) {
      if (!COLORS.includes(name) || !/^#[0-9a-f]{3,8}$/i.test(String(value).trim())) continue;
      r = r.replace(new RegExp(`(\\n\\s*${name}:\\s*)[^;]+;`), `$1${String(value).trim()};`);
    }
    for (const [alias, of] of Object.entries(ALIASES)) {
      if (want.colors[of] !== base.colors[of]) r = r.replace(new RegExp(`(\\n\\s*${alias}:\\s*)[^;]+;`), `$1${want.colors[of]};`);
    }
    return r;
  });
  out = scaleType(out, HEADINGS, (Number(want.type.headings) || 100) / 100);
  out = scaleType(out, BODY, (Number(want.type.body) || 100) / 100);
  if (want.corners > 0) out = out.replace(/\n*$/, "\n") + `\n/* Corners, from the site styles. */\n${CORNERS.join(",\n")} {\n  border-radius: ${want.corners}px;\n}\n`;
  return out;
}

// A short, stable fingerprint of the stylesheet, for its ?v= when the
// tokens change it.
export function fingerprint(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}
