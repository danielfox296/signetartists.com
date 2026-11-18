/* The Content-Security-Policy and the referrer policy, as <meta> tags in
   each page's <head> (GitHub Pages sends no headers of its own). Every inline
   script on the page is allowed by its sha256 hash. */
import crypto from "node:crypto";

const INLINE = /<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;
const hash = (text) => `'sha256-${crypto.createHash("sha256").update(text, "utf8").digest("base64")}'`;

// The staging deploy turns each form off with this inline handler.
const STAGING_FORM_OFF = "event.preventDefault();location.href='/thanks/'";

const GA = ["https://*.google-analytics.com", "https://*.analytics.google.com", "https://*.googletagmanager.com", "https://*.g.doubleclick.net", "https://www.google.com"];
const CRISP = { script: ["https://client.crisp.chat"], img: ["https://client.crisp.chat", "https://image.crisp.chat", "https://storage.crisp.chat"] };

export function policy(html) {
  const hashes = new Set();
  for (const m of html.matchAll(INLINE)) {
    const type = /\stype="([^"]*)"/.exec(m[1]);
    if (type && !/javascript|module/.test(type[1])) continue;
    hashes.add(hash(m[2]));
  }
  const src = {
    "default-src": ["'self'"],
    "script-src": ["'self'", ...hashes, "'unsafe-hashes'", hash(STAGING_FORM_OFF), "https://www.googletagmanager.com", ...CRISP.script],
    "style-src": ["'self'", "'unsafe-inline'", "https://client.crisp.chat"],
    "img-src": ["'self'", "data:", "https://i.ytimg.com", ...GA.filter((g) => !g.includes("analytics.google.com")), ...CRISP.img],
    "font-src": ["'self'", "https://client.crisp.chat"],
    "media-src": ["'self'", "https://client.crisp.chat"],
    "connect-src": ["'self'", "https://script.google.com", "https://script.googleusercontent.com", ...GA, "https://client.crisp.chat", "https://storage.crisp.chat", "wss://client.relay.crisp.chat", "wss://stream.relay.crisp.chat"],
    "frame-src": ["https://www.youtube-nocookie.com"],
    "form-action": ["'self'", "https://formsubmit.co"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
  };
  return Object.entries(src).map(([k, v]) => `${k} ${v.join(" ")}`).join("; ");
}

// The two tags, right after the viewport tag, ahead of every script.
export function withPolicy(html) {
  const tags =
    `\n  <meta http-equiv="Content-Security-Policy" content="${policy(html)}">` +
    `\n  <meta name="referrer" content="strict-origin-when-cross-origin">`;
  return html.replace(/(<meta name="viewport"[^>]*>)/, `$1${tags}`);
}
