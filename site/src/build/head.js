/* <head>, the Google tag and the redirect stubs. Plain templates: nothing
   here is edited on the canvas. */
import { esc } from "../lib/util.js";

// The Google tag, for visitors only: the live hostname, a browser not
// marked as ours with ?internal=1, and not an automated one.
export function gaTag(gid) {
  if (!gid) return "";
  return (
    "<script>(function(){" +
    "var h=location.hostname;" +
    "if(h!=='signetartists.com'&&h!=='www.signetartists.com')return;" +
    "try{var q=location.search;" +
    "if(/[?&]internal=1(&|$)/.test(q))localStorage.setItem('signet_internal','1');" +
    "if(/[?&]internal=0(&|$)/.test(q))localStorage.removeItem('signet_internal');" +
    "if(localStorage.getItem('signet_internal')==='1')return;}catch(e){}" +
    "if(navigator.webdriver)return;" +
    "var s=document.createElement('script');s.async=true;" +
    `s.src='https://www.googletagmanager.com/gtag/js?id=${gid}';` +
    "document.head.appendChild(s);" +
    "window.dataLayer=window.dataLayer||[];" +
    "window.gtag=function(){dataLayer.push(arguments);};" +
    `gtag('js',new Date());gtag('config','${gid}');` +
    "})();</script>"
  );
}

export function head(h) {
  const { site } = h;
  const brand = site.brand;
  return `<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="${site.themeColor}">
  <title>${esc(h.title)}</title>
  <meta name="description" content="${esc(h.description)}">
  <meta name="robots" content="${h.robots}">
  <link rel="canonical" href="${h.canonical}">
  <link rel="alternate" type="application/rss+xml" title="${esc(brand.name)} | Blog" href="${h.prefix}rss.xml">

  <meta property="og:type" content="${h.ogType}">
  <meta property="og:site_name" content="${esc(brand.name)}">
  <meta property="og:title" content="${esc(h.title)}">
  <meta property="og:description" content="${esc(h.description)}">
  <meta property="og:url" content="${h.canonical}">
  <meta property="og:image" content="${h.ogImage}">
  <meta name="twitter:card" content="summary_large_image">
  ${h.headExtra || ""}

  <link rel="preload" href="${h.prefix}vendor/fonts/archivo-variable-latin.woff2" as="font" type="font/woff2" crossorigin>

  <link rel="icon" href="/favicon.ico" sizes="any">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">

  <link rel="stylesheet" href="${h.prefix}styles.css?v=${site.cssVersion}">
  ${h.schema || ""}
  ${gaTag(site.gaId)}
  <script defer src="${h.prefix}analytics.js"></script>
</head>`;
}

export function document(headHtml, bodyHtml) {
  return `<!DOCTYPE html>\n<html lang="en">\n${headHtml}\n<body>\n${bodyHtml}\n</body>\n</html>\n`;
}

export function redirectStub(site, target) {
  return (
    '<!DOCTYPE html>\n<html lang="en">\n<head>\n' +
    '  <meta charset="utf-8">\n' +
    `  <meta http-equiv="refresh" content="0; url=${target}">\n` +
    `  <link rel="canonical" href="${target}">\n` +
    `  <title>Moved | ${esc(site.brand.name)}</title>\n` +
    "</head>\n<body>\n" +
    `  <p>This page moved to <a href="${target}">${target}</a>.</p>\n` +
    "</body>\n</html>\n"
  );
}
