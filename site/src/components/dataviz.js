/* The chart block: an inline SVG drawn from a small table, in the site's
   colours, the way _src/lib/data_viz.py drew it. Bar, line (one series or
   two) and a two-bar comparison. A chart it can't draw (no rows, or a
   comparison without exactly two) keeps its caption and source. */
const x = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const BG = "#f2efe9";
const TEXT = "#16150f";
const MUTED = "#6f6c62";
const SERIES1 = "#84682d";
const SERIES2 = "#8a8679";
const HEADING = "'Fraunces', Georgia, serif";
const BODY = "Inter, sans-serif";

// Python's "{:.1f}": the exact value rounded, a tie to the even digit.
function f1(n) {
  const [whole, frac] = Math.abs(n).toFixed(100).split(".");
  const rest = frac.slice(1);
  const up = /^0*$/.test(rest) ? false : /^50*$/.test(rest) ? Number(frac[0]) % 2 === 1 : rest[0] >= "5";
  const digits = String(BigInt(whole + frac[0]) + (up ? 1n : 0n)).padStart(2, "0");
  return (n < 0 || Object.is(n, -0) ? "-" : "") + digits.slice(0, -1) + "." + digits.slice(-1);
}
const num = (v) => (typeof v === "number" ? v : Number(v) || 0);
const fmt = (v) => String(v);

function niceCeil(value) {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const n = value / magnitude;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * magnitude;
}

const svgOpen = (w, h, title) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="${x(title)}" style="width:100%;height:auto;background:${BG}">`;

// The dashed lines across, and the scale beside them.
function grid(padLeft, padTop, chartH, right, ceil, labels) {
  const lines = [];
  const marks = [];
  for (let i = 0; i < 5; i++) {
    const frac = i / 4;
    const y = padTop + chartH - frac * chartH;
    lines.push(`<line x1="${padLeft}" y1="${f1(y)}" x2="${right}" y2="${f1(y)}" stroke="${MUTED}" stroke-width="0.5" stroke-dasharray="4,4"/>`);
    if (labels) marks.push(`<text x="${padLeft - 8}" y="${f1(y)}" text-anchor="end" dominant-baseline="middle" fill="${MUTED}" font-size="11" font-family="${BODY}">${fmt(frac * ceil)}</text>`);
  }
  return { lines, marks };
}

const indent = (list) => list.map((s) => `  ${s}`).join("\n");

function bar(data, title) {
  const [w, h, padTop, padBottom, padLeft, padRight] = [600, 400, 60, 60, 60, 30];
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;
  const values = data.map((d) => num(d.value));
  const ceil = niceCeil(Math.max(...values) > 0 ? Math.max(...values) : 1);
  const groupW = chartW / data.length;
  const barW = groupW * 0.7;
  const gap = groupW * 0.3;
  const g = grid(padLeft, padTop, chartH, w - padRight, ceil, true);
  const bars = [];
  const labels = [];
  data.forEach((d, i) => {
    const v = num(d.value);
    const bx = padLeft + i * groupW + gap / 2;
    const bh = ceil ? (v / ceil) * chartH : 0;
    const by = padTop + chartH - bh;
    bars.push(`<rect x="${f1(bx)}" y="${f1(by)}" width="${f1(barW)}" height="${f1(bh)}" fill="${SERIES1}"/>`);
    bars.push(`<text x="${f1(bx + barW / 2)}" y="${f1(by - 8)}" text-anchor="middle" fill="${TEXT}" font-size="12" font-family="${BODY}">${fmt(d.value)}</text>`);
    labels.push(`<text x="${f1(bx + barW / 2)}" y="${padTop + chartH + 20}" text-anchor="middle" fill="${TEXT}" font-size="11" font-family="${BODY}">${x(d.label)}</text>`);
  });
  const base = `<line x1="${padLeft}" y1="${padTop + chartH}" x2="${w - padRight}" y2="${padTop + chartH}" stroke="${MUTED}" stroke-width="1"/>`;
  const head = `<text x="${padLeft}" y="30" fill="${TEXT}" font-size="18" font-weight="700" font-family="${HEADING}">${x(title)}</text>`;
  return `${svgOpen(w, h, title)}\n  ${head}\n${indent(g.lines)}\n${indent(g.marks)}\n  ${base}\n${indent(bars)}\n${indent(labels)}\n</svg>`;
}

function line(data, title) {
  const [w, h, padTop, padBottom, padLeft, padRight] = [600, 400, 60, 60, 60, 30];
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;
  const dual = data.some((d) => "value2" in d);
  const all = data.map((d) => num(d.value)).concat(dual ? data.map((d) => num(d.value2)) : []);
  const ceil = niceCeil(Math.max(...all) > 0 ? Math.max(...all) : 1);
  const n = data.length;
  const xp = (i) => (n === 1 ? padLeft + chartW / 2 : padLeft + (i / (n - 1)) * chartW);
  const yp = (v) => (ceil ? padTop + chartH - (v / ceil) * chartH : padTop + chartH);
  const g = grid(padLeft, padTop, chartH, w - padRight, ceil, true);
  const pts1 = data.map((d, i) => [xp(i), yp(num(d.value))]);
  const dots1 = pts1.map(([px, py]) => `<circle cx="${f1(px)}" cy="${f1(py)}" r="4" fill="${SERIES1}" stroke="${BG}" stroke-width="2"/>`);
  let line2 = "";
  let dots2 = [];
  if (dual) {
    const pts2 = data.map((d, i) => [xp(i), yp(num(d.value2))]);
    line2 = `<polyline points="${pts2.map(([px, py]) => `${f1(px)},${f1(py)}`).join(" ")}" fill="none" stroke="${SERIES2}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    dots2 = pts2.map(([px, py]) => `<circle cx="${f1(px)}" cy="${f1(py)}" r="4" fill="${SERIES2}" stroke="${BG}" stroke-width="2"/>`);
  }
  const labels = data.map((d, i) => `<text x="${f1(xp(i))}" y="${padTop + chartH + 20}" text-anchor="middle" fill="${TEXT}" font-size="11" font-family="${BODY}">${x(d.label)}</text>`);
  const base = `<line x1="${padLeft}" y1="${padTop + chartH}" x2="${w - padRight}" y2="${padTop + chartH}" stroke="${MUTED}" stroke-width="1"/>`;
  const head = `<text x="${padLeft}" y="30" fill="${TEXT}" font-size="18" font-weight="700" font-family="${HEADING}">${x(title)}</text>`;
  const lx = w - padRight;
  const legend = dual
    ? `<circle cx="${lx - 130}" cy="25" r="5" fill="${SERIES1}"/><text x="${lx - 120}" y="29" fill="${TEXT}" font-size="11" font-family="${BODY}">Series 1</text><circle cx="${lx - 55}" cy="25" r="5" fill="${SERIES2}"/><text x="${lx - 45}" y="29" fill="${TEXT}" font-size="11" font-family="${BODY}">Series 2</text>`
    : "";
  const poly = `<polyline points="${pts1.map(([px, py]) => `${f1(px)},${f1(py)}`).join(" ")}" fill="none" stroke="${SERIES1}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  return (
    `${svgOpen(w, h, title)}\n  ${head}\n  ${legend}\n${indent(g.lines)}\n${indent(g.marks)}\n  ${base}\n  ${poly}\n` +
    (line2 ? `  ${line2}\n` : "") +
    `${indent(dots1)}\n` +
    (dots2.length ? `${indent(dots2)}\n` : "") +
    `${indent(labels)}\n</svg>`
  );
}

function comparison(data, title) {
  if (data.length !== 2) return null;
  const [w, h, padTop, padBottom, padLeft, padRight] = [400, 300, 55, 50, 40, 40];
  const chartW = w - padLeft - padRight;
  const chartH = h - padTop - padBottom;
  const values = data.map((d) => num(d.value));
  const ceil = niceCeil(Math.max(...values) > 0 ? Math.max(...values) : 1);
  const colors = [SERIES1, SERIES2];
  const barW = chartW * 0.3;
  const gap = chartW * 0.1;
  const startX = padLeft + (chartW - (barW * 2 + gap)) / 2;
  const g = grid(padLeft, padTop, chartH, w - padRight, ceil, false);
  const base = `<line x1="${padLeft}" y1="${padTop + chartH}" x2="${w - padRight}" y2="${padTop + chartH}" stroke="${MUTED}" stroke-width="1"/>`;
  const bars = [];
  data.forEach((d, i) => {
    const v = num(d.value);
    const bx = startX + i * (barW + gap);
    const bh = ceil ? (v / ceil) * chartH : 0;
    const by = padTop + chartH - bh;
    bars.push(`<rect x="${f1(bx)}" y="${f1(by)}" width="${f1(barW)}" height="${f1(bh)}" fill="${colors[i]}"/>`);
    bars.push(`<text x="${f1(bx + barW / 2)}" y="${f1(by - 10)}" text-anchor="middle" fill="${TEXT}" font-size="16" font-weight="600" font-family="${BODY}">${fmt(d.value)}</text>`);
    bars.push(`<text x="${f1(bx + barW / 2)}" y="${padTop + chartH + 22}" text-anchor="middle" fill="${TEXT}" font-size="12" font-family="${BODY}">${x(d.label)}</text>`);
  });
  const head = `<text x="${f1(w / 2)}" y="28" text-anchor="middle" fill="${TEXT}" font-size="16" font-weight="700" font-family="${HEADING}">${x(title)}</text>`;
  return `${svgOpen(w, h, title)}\n  ${head}\n${indent(g.lines)}\n  ${base}\n${indent(bars)}\n</svg>`;
}

const CHARTS = { bar, line, comparison };

export function renderChart({ chart_type, data, title, caption, source }) {
  const draw = CHARTS[chart_type || "bar"];
  const rows = Array.isArray(data) ? data : [];
  const svg = draw && rows.length ? draw(rows, title || "") : null;
  const parts = ['<figure class="blog-data-viz">'];
  if (svg) parts.push(svg);
  if (caption || source) {
    parts.push("  <figcaption>");
    if (caption) parts.push(`    <span>${x(caption)}</span>`);
    if (source) parts.push(`    <cite style="display:block;font-size:0.75em;color:${MUTED};margin-top:0.25em;font-style:normal">Source: ${x(source)}</cite>`);
    parts.push("  </figcaption>");
  }
  parts.push("</figure>");
  return parts.join("\n");
}
