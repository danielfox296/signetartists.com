/* The pictures' copies, made when the site is deployed (build.mjs --images
   <cache>), never committed:
   - AVIF and WebP in the widths lib/pictures.js gives each picture the
     pages show (img/a.jpg -> img/a-800w.avif)
   - every JPEG under img/ and media/ recompressed, where that saves a tenth
   - each YouTube video's own picture, the largest YouTube has, at
     img/yt/<id>.jpg and its copies
   The cache folder keeps what was made, by the source file's hash, so a
   deploy only makes what is new, and loses what nothing uses any more. */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { FORMATS, variantPath, widthsFor, YT_WIDTHS, ytPath } from "../lib/pictures.js";

// Bump to make every copy again.
const VERSION = "1";
const AVIF = { quality: 58, effort: 4 };
const WEBP = { quality: 80, effort: 5, smartSubsample: true };
const JPEG = { quality: 82, mozjpeg: true };
const encode = (img, fmt, chroma) =>
  fmt === "avif" ? img.avif({ ...AVIF, chromaSubsampling: chroma === "4:4:4" ? "4:4:4" : "4:2:0" }) : fmt === "webp" ? img.webp(WEBP) : img.jpeg({ ...JPEG, chromaSubsampling: chroma === "4:4:4" ? "4:4:4" : "4:2:0" });

const RASTER = /\.(jpe?g|png)$/i;
function walk(dir, files) {
  if (!fs.existsSync(dir)) return files;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, files);
    else if (RASTER.test(f.name)) files.push(p);
  }
  return files;
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  }));
}

// Each local JPEG and PNG's size as a browser draws it.
export async function imageDims(repo) {
  const dims = new Map();
  const files = ["img", "media"].flatMap((d) => walk(path.join(repo, d), []));
  await pool(files, 16, async (f) => {
    const m = await sharp(f).metadata();
    const o = m.autoOrient || m;
    dims.set(path.relative(repo, f).split(path.sep).join("/"), { w: o.width, h: o.height, chroma: m.chromaSubsampling });
  });
  return dims;
}

const sha1 = (...parts) => {
  const h = crypto.createHash("sha1");
  for (const p of parts) h.update(p);
  return h.digest("hex");
};

// The largest picture YouTube has for a video. YouTube answers 404 for a size
// it doesn't have.
async function ytFetch(id) {
  for (const name of ["maxresdefault", "sddefault", "hqdefault"]) {
    try {
      const r = await fetch(`https://i.ytimg.com/vi/${id}/${name}.jpg`, { signal: AbortSignal.timeout(20000) });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
    } catch {
      // the next size, else the cached one
    }
  }
  return null;
}

export async function makeImages({ repo, out, cache, used, yt, dims, log = console.log }) {
  fs.mkdirSync(cache, { recursive: true });
  const kept = new Set();
  const jobs = [];
  const copies = [];
  let made = 0;
  let saved = 0;

  // A copy in the cache, made once: `make` writes it.
  const cached = (key, name, make) => {
    kept.add(key);
    const file = path.join(cache, key, name);
    if (!fs.existsSync(file)) {
      jobs.push(async () => {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        await make(tmp);
        fs.renameSync(tmp, file);
        made++;
      });
    }
    return file;
  };
  const place = (file, rel) => copies.push([file, path.join(out, rel)]);

  // The pictures the pages show, in their widths.
  for (const rel of [...used].sort()) {
    const d = dims.get(rel);
    const buf = fs.readFileSync(path.join(repo, rel));
    const key = sha1(VERSION, buf);
    for (const w of widthsFor(d.w)) {
      for (const fmt of FORMATS) {
        place(cached(key, `${w}.${fmt}`, (to) => encode(sharp(buf).autoOrient().resize({ width: w, withoutEnlargement: true }), fmt, d.chroma).toFile(to)), variantPath(rel, w, fmt));
      }
    }
  }

  // Every JPEG, recompressed. A copy that doesn't save a tenth isn't used.
  const jpegs = [...dims.keys()].filter((rel) => /\.jpe?g$/i.test(rel)).sort();
  const recompressed = [];
  for (const rel of jpegs) {
    const buf = fs.readFileSync(path.join(repo, rel));
    const key = sha1(VERSION, buf);
    const file = cached(key, "full.jpg", (to) => encode(sharp(buf).autoOrient(), "jpeg", dims.get(rel).chroma).toFile(to));
    recompressed.push([rel, buf.length, file]);
  }

  // YouTube's pictures: fetched every deploy, so a new one on YouTube shows;
  // the last one fetched if YouTube doesn't answer; a dark frame if there has
  // never been one.
  const ytSrc = path.join(cache, "yt");
  fs.mkdirSync(ytSrc, { recursive: true });
  const ids = [...yt].sort();
  const fetched = new Map();
  await pool(ids, 8, async (id) => fetched.set(id, await ytFetch(id)));
  for (const id of ids) {
    const keep = path.join(ytSrc, `${id}.jpg`);
    let buf = fetched.get(id);
    if (buf) fs.writeFileSync(keep, buf);
    else if (fs.existsSync(keep)) {
      buf = fs.readFileSync(keep);
      log(`YouTube didn't answer for ${id}: its last picture is used`);
    } else {
      buf = await sharp({ create: { width: 1280, height: 720, channels: 3, background: "#1b1a17" } }).jpeg().toBuffer();
      log(`No picture for YouTube video ${id}: a dark frame is used`);
    }
    const key = sha1(VERSION, "yt", buf);
    // 16:9, without the bars YouTube puts on its 4:3 sizes.
    const frame = async () => {
      const m = await sharp(buf).metadata();
      const h = Math.min(m.height, Math.round((m.width * 9) / 16));
      return sharp(buf).extract({ left: 0, top: Math.floor((m.height - h) / 2), width: m.width, height: h });
    };
    const rel = ytPath(id);
    place(cached(key, "yt.jpg", async (to) => encode((await frame()).resize({ width: 1280, height: 720 }), "jpeg").toFile(to)), rel);
    for (const w of YT_WIDTHS) {
      for (const fmt of FORMATS) place(cached(key, `yt-${w}.${fmt}`, async (to) => encode((await frame()).resize({ width: w, height: Math.round((w * 9) / 16) }), fmt).toFile(to)), variantPath(rel, w, fmt));
    }
  }

  // AVIF is slow: several at once.
  await pool(jobs, Math.max(2, Math.min(8, os.cpus().length)), (job) => job());

  for (const [rel, size, file] of recompressed) {
    if (fs.statSync(file).size <= size * 0.9) {
      copies.push([file, path.join(out, rel)]);
      saved += size - fs.statSync(file).size;
    }
  }
  for (const [from, to] of copies) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }

  // What nothing uses any more leaves the cache.
  for (const d of fs.readdirSync(cache)) {
    if (d !== "yt" && !kept.has(d)) fs.rmSync(path.join(cache, d), { recursive: true, force: true });
  }
  for (const f of fs.readdirSync(ytSrc)) if (!yt.has(f.replace(/\.jpg$/, ""))) fs.rmSync(path.join(ytSrc, f), { force: true });

  log(`Pictures: ${used.size} shown in ${copies.length} files, ${made} made, ${Math.round(saved / 1024)} KB off ${jpegs.length} JPEGs, ${ids.length} YouTube pictures`);
  return { made, files: copies.length };
}
