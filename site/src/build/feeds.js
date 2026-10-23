/* sitemap.xml, video-sitemap.xml, rss.xml and llms.txt, from the list of
   pages the build wrote and the post and video files. */
import { esc, rssDate } from "../lib/util.js";

const isoSeconds = (d) => {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d);
  if (!m) throw new Error(`duration ${d} is not ISO 8601 (PT1M5S)`);
  return Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0);
};
export { isoSeconds };

const noindex = (r) => (r || "").startsWith("noindex");

// The watch pages are listed in video-sitemap.xml, with their videos, and
// nowhere else: no URL is in two sitemaps.
export function sitemap(m, built, lastmod) {
  const urls = [];
  for (const b of built) {
    if (noindex(b.robots) || b.watch) continue;
    const loc = esc(m.canonicalFor(b.output));
    const d = lastmod(b);
    urls.push(d ? `  <url><loc>${loc}</loc><lastmod>${d}</lastmod></url>` : `  <url><loc>${loc}</loc></url>`);
  }
  for (const d of m.published) {
    const p = d.root.props;
    if (noindex(p.robots)) continue;
    urls.push(`  <url><loc>${esc(`${m.SITE_URL}/blog/${p.slug}/`)}</loc><lastmod>${p.last_updated || p.date}</lastmod></url>`);
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.join("\n") + "\n</urlset>\n";
}

export function videoSitemap(m) {
  const urls = m.FOOTAGE.map((v) => {
    const src = v.id
      ? `      <video:player_loc>https://www.youtube-nocookie.com/embed/${v.id}</video:player_loc>`
      : `      <video:content_loc>${esc(m.SITE_URL + "/" + v.file)}</video:content_loc>`;
    return [
      "  <url>",
      `    <loc>${esc(m.watchUrl(v))}</loc>`,
      "    <video:video>",
      `      <video:thumbnail_loc>${esc(m.watchThumb(v))}</video:thumbnail_loc>`,
      `      <video:title>${esc(v.name)}</video:title>`,
      `      <video:description>${esc(v.description)}</video:description>`,
      src,
      `      <video:duration>${isoSeconds(v.duration)}</video:duration>`,
      `      <video:publication_date>${v.uploadDate}</video:publication_date>`,
      "    </video:video>",
      "  </url>",
    ].join("\n");
  });
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n' +
    '        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">\n' +
    urls.join("\n") +
    "\n</urlset>\n"
  );
}

export function rss(m, blogDescription) {
  const x = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "<channel>",
    `  <title>${x(m.brand.name)} | Blog</title>`,
    `  <link>${m.SITE_URL}/blog/</link>`,
    `  <description>${x(blogDescription)}</description>`,
    "  <language>en-us</language>",
    `  <atom:link href="${m.SITE_URL}/rss.xml" rel="self" type="application/rss+xml"/>`,
  ];
  for (const d of m.published.slice(0, 20)) {
    const p = d.root.props;
    const link = `${m.SITE_URL}/blog/${p.slug}/`;
    lines.push(
      "  <item>",
      `    <title>${x(p.title)}</title>`,
      `    <link>${link}</link>`,
      `    <description>${x(p.meta_description || p.dek || "")}</description>`,
      `    <pubDate>${rssDate(p.date)}</pubDate>`,
      `    <guid>${link}</guid>`,
      "  </item>"
    );
  }
  lines.push("</channel>", "</rss>", "");
  return lines.join("\n");
}

// llms.txt: the words come from site.json "llms", the lists from the files.
export function llms(m, built) {
  const { brand, site } = m;
  const t = site.llms;
  const fill = (s) => s.replace(/\{name\}/g, brand.name).replace(/\{serviceArea\}/g, brand.serviceArea).replace(/\{site\}/g, m.SITE_URL);
  const logos = m.c.logoStrip.logos;
  const lines = [
    `# ${brand.name}`,
    "",
    `> ${brand.intro}`,
    "",
    fill(t.about),
    "",
    "## Credits",
    "",
    `${m.c.logoStrip.label} ` + logos.slice(0, -1).map((l) => l.name).join(", ") + ` and ${logos[logos.length - 1].name}. ${m.c.logoStrip.also}`,
    "",
    "## Pages",
    "",
  ];
  for (const b of built) {
    if (noindex(b.robots) || b.watch) continue;
    lines.push(`- [${b.title}](${m.canonicalFor(b.output)}): ${b.description || ""}`);
  }
  lines.push("", "## Video clips", "", fill(t.videos), "");
  for (const v of m.FOOTAGE) lines.push(`- [${v.name}](${m.watchUrl(v)})`);
  const pub = m.published.map((d) => d.root.props).filter((p) => !noindex(p.robots));
  if (pub.length) {
    lines.push("", "## Blog", "");
    for (const p of pub) lines.push(`- [${p.title}](${m.SITE_URL}/blog/${p.slug}/): ${p.llms_description || p.meta_description || p.dek || ""}`);
  }
  lines.push("", "## Acts", "", t.actsNote, "");
  for (const a of m.ACTS) {
    lines.push(`- ${a.name} (${a.style}, ${m.actBylineInline(a)}): ${a.blurb} Configurations: ${m.actConfigRange(a)}. ${m.SITE_URL}/${m.actUrl(a)}`);
  }
  lines.push("", "## Pricing", "", ...t.pricing.map(fill).flatMap((s) => [s, ""]));
  return lines.join("\n");
}
