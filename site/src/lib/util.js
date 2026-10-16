/* Small helpers shared by the components, the build and the editor. Several
   copy Python's behaviour exactly, so the new build writes what build.py wrote. */

// Python's html.escape(s, quote=True).
export function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

// The XML escaping build.py's feeds use: html.escape(s) for sitemaps.
export const xesc = esc;

// json.dumps(v, ensure_ascii=False): ", " and ": " separators.
export function pyjson(v) {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "[" + v.map(pyjson).join(", ") + "]";
  if (typeof v === "object") {
    return "{" + Object.entries(v).map(([k, x]) => JSON.stringify(k) + ": " + pyjson(x)).join(", ") + "}";
  }
  return JSON.stringify(v);
}

// Links are stored from the site root ("/contact/") and written relative to
// the page they land on ("../contact/"), the way the site has always linked.
export function relUrl(u, prefix) {
  if (typeof u !== "string" || !u.startsWith("/") || u.startsWith("//")) return u;
  return prefix + u.slice(1);
}

export function relHtml(html, prefix) {
  if (typeof html !== "string") return html;
  return html.replace(/(\s(?:href|src|poster)=")\/(?!\/)/g, (_, a) => a + prefix);
}

// An inline style as written in the markup ("max-width: 32rem;") as a React
// style object. Values stay strings so React adds no units.
export function css(s) {
  if (!s) return undefined;
  const out = {};
  for (const part of String(s).split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (!k) continue;
    out[k.startsWith("--") ? k : k.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

export const cx = (...xs) => xs.filter(Boolean).join(" ");

// Text of an inline HTML string: tags dropped, entities decoded. Used where a
// visible answer also feeds structured data.
const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…", middot: "·", copy: "©", eacute: "é", oacute: "ó", aacute: "á", iacute: "í", uacute: "ú", ntilde: "ñ", times: "×" };
export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return NAMED[e] ?? m;
  });
}
export const htmlText = (s) => decodeEntities(String(s ?? "").replace(/<[^>]+>/g, ""));

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export function parseDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
// "August 3, 2026"
export const longDate = (iso) => {
  const d = parseDate(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
};
// RSS: "Mon, 03 Aug 2026 00:00:00 +0000"
export const rssDate = (iso) => {
  const d = parseDate(iso);
  return `${DAYS[d.getUTCDay()]}, ${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()} 00:00:00 +0000`;
};
// "Thu Nov 5"
export const shortDay = (iso) => {
  const d = parseDate(iso);
  return `${DAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`;
};
