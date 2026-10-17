/* Pictures in the static build: each local JPEG or PNG a component shows
   keeps its <img>, in the same place, and gains a srcset of WebP copies in
   the widths below its own, with the component's sizes. The JPEG or PNG
   stays its src. The copies are made at deploy time by build/images.js,
   never committed: img/a.jpg -> img/a-800w.webp. The editor canvas draws
   the plain <img>, since a new upload has no copies yet.

   `sizes` is how wide the component draws the picture, measured on the
   site at phone to desktop widths. */

export const WIDTHS = [480, 800, 1200, 1600];
export const MAX_WIDTH = 2400;
export const FORMAT = "webp";

// A YouTube video's own picture, kept by the deploy at img/yt/<id>.jpg.
export const YT_WIDTHS = [480, 800, 1280];
export const ytPath = (id) => `img/yt/${id}.jpg`;
export const ytId = (src) => (/^https:\/\/www\.youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})(?:[?#]|$)/.exec(src || "") || [])[1] || null;

const PAD = "calc(100vw - 48px)";
const grid = `(min-width: 1072px) 256px, (min-width: 968px) 25vw, (min-width: 742px) 34vw, (min-width: 498px) 50vw, ${PAD}`;
export const SIZES = {
  wrap: `(min-width: 1072px) 1024px, ${PAD}`,
  screen: "100vw",
  grid,
  single: `(min-width: 704px) 640px, ${PAD}`,
  videos: (n) => (n < 2 ? SIZES.wrap : n === 2 ? `(min-width: 1072px) 504px, (min-width: 658px) 50vw, ${PAD}` : `(min-width: 1072px) 336px, (min-width: 962px) 34vw, (min-width: 658px) 50vw, ${PAD}`),
  card: `(min-width: 1072px) 340px, (min-width: 768px) 32vw, ${PAD}`,
  post: `(min-width: 768px) 672px, ${PAD}`,
  related: `(min-width: 640px) 304px, calc(100vw - 96px)`,
  row: `(min-width: 640px) 208px, ${PAD}`,
  clip: grid,
  strip: "(max-width: 700px) 25vw, 12.5vw",
  wall: "(min-width: 1100px) 20vw, (min-width: 641px) 34vw, 50vw",
};

// A picture given a width in its style (width: 39.5rem) is drawn that wide,
// or the column's width on a phone.
export function sizesFor(style, otherwise = SIZES.wrap) {
  const m = /(?:^|;)\s*width:\s*([\d.]+)(rem|px)\s*(?:;|$)/.exec(typeof style === "string" ? style : "");
  if (!m) return otherwise;
  const px = Math.round(Number(m[1]) * (m[2] === "rem" ? 16 : 1));
  return `(min-width: ${px + 48}px) ${px}px, ${PAD}`;
}

export function widthsFor(w) {
  const top = Math.min(w, MAX_WIDTH);
  return [...WIDTHS.filter((x) => x < top * 0.9), top];
}

export const variantPath = (path, w, ext = FORMAT) => path.replace(/\.(jpe?g|png)$/i, `-${w}w.${ext}`);

// The repo path of a picture as a page writes it (../../img/a.jpg, /img/a.jpg),
// when it is a local JPEG or PNG.
export function repoPath(src) {
  const p = String(src || "").replace(/^(?:\.\.\/)+|^\.\/|^\//, "");
  return /^(?:img|media)\/[^?#"]+\.(?:jpe?g|png)$/i.test(p) && !p.includes("..") ? p : null;
}

const enc = (u) => u.replace(/ /g, "%20").replace(/,/g, "%2C");

// The WebP copies as an <img srcset>, from the src as the page writes it.
export const srcsetOf = (src, widths) => widths.map((w) => `${enc(variantPath(src, w))} ${w}w`).join(", ");
