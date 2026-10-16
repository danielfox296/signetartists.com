/* The chart block. Only a draft post uses it today, so the chart itself is
   not ported yet (Phase 5: port _src/lib/data_viz.py). The figure, caption
   and source render as build.py writes them. */
const x = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function renderChart({ caption, source }) {
  const parts = ['<figure class="blog-data-viz">'];
  if (caption || source) {
    parts.push("  <figcaption>");
    if (caption) parts.push(`    <span>${x(caption)}</span>`);
    if (source) parts.push(`    <cite style="display:block;font-size:0.75em;color:#6f6c62;margin-top:0.25em;font-style:normal">Source: ${x(source)}</cite>`);
    parts.push("  </figcaption>");
  }
  parts.push("</figure>");
  return parts.join("\n");
}
