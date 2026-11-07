/* The media library: every picture under img/, where each one is used, and
   replacing one with another everywhere it is used. A use is a reference in
   a page, post, act, video, shared part or the site file; credits, crop
   points and the records are not uses and are left as they are. */

export const isPicture = (p) => /^img\/.+\.(jpe?g|png|webp|gif)$/i.test(p) && !p.startsWith("img/thumbs/");

// Where a file is read for uses.
const SKIP = ["content/records/", "content/photo-focus.json", "content/lastmod.json"];
const scanned = (p) => p.startsWith("content/") && p.endsWith(".json") && !SKIP.some((s) => p.startsWith(s));

const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// "img/x.jpg" as the files write it: "img/x.jpg", "/img/x.jpg", "../img/x.jpg".
const refRe = (path) => new RegExp(`(^|[^A-Za-z0-9_./-])((?:\\.\\./)*/?)${escRe(path)}(?=$|[^A-Za-z0-9_./-])`, "g");

// An act names its picture from img/ ("acts/x.jpg").
const actPicture = (file, key) => file.startsWith("content/acts/") && key === "img";

function walk(v, visit, key, parent) {
  if (typeof v === "string") return visit(v, key, parent);
  if (Array.isArray(v)) v.forEach((x, i) => walk(x, visit, i, v));
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, visit, k, v);
}

// Every picture's uses: path -> [file].
export function usesIndex(repo) {
  const pics = repo.list("img/").filter(isPicture);
  const byPath = new Map(pics.map((p) => [p, []]));
  const byName = new Map(pics.map((p) => [p.slice(4), p]));
  for (const file of repo.list("content/").filter(scanned)) {
    const text = repo.get(file);
    if (!text || !text.includes(".")) continue;
    let doc;
    try {
      doc = JSON.parse(text);
    } catch {
      continue;
    }
    const found = new Set();
    walk(doc, (s, key) => {
      if (actPicture(file, key) && byName.has(s)) found.add(byName.get(s));
      if (!s.includes("img/")) return;
      for (const m of s.matchAll(/(^|[^A-Za-z0-9_./-])(?:\.\.\/)*\/?(img\/[^\s"'?#)<>,]+?\.(?:jpe?g|png|webp|gif))(?=$|[^A-Za-z0-9_./-])/gi)) if (byPath.has(m[2])) found.add(m[2]);
    });
    for (const p of found) byPath.get(p).push(file);
  }
  return byPath;
}

// Every file a replacement changes: each reference to `from` becomes `to`,
// and an item that names its picture's width and height takes the new one's.
export function replacePlan(repo, from, to, size) {
  const changes = new Map();
  const re = refRe(from);
  const fromName = from.slice(4);
  const toName = to.slice(4);
  for (const file of repo.list("content/").filter(scanned)) {
    const text = repo.get(file);
    if (!text || (!text.includes(from) && !(file.startsWith("content/acts/") && text.includes(fromName)))) continue;
    const doc = JSON.parse(text);
    let touched = false;
    walk(doc, (s, key, parent) => {
      let next = s;
      if (actPicture(file, key) && s === fromName) next = toName;
      else if (s.includes(from)) next = s.replace(re, (_, a, b) => a + b + to);
      if (next === s) return;
      parent[key] = next;
      touched = true;
      // An image item with its own size takes the new picture's.
      if (size && parent && !Array.isArray(parent) && typeof parent === "object") {
        for (const k of ["width", "height"]) if (k in parent && (typeof parent[k] === "number" || /^\d+$/.test(String(parent[k])))) parent[k] = typeof parent[k] === "number" ? size[k] : String(size[k]);
      }
      // Markup with the picture in it: its width and height attributes too.
      if (size && next.includes("<img")) {
        parent[key] = next.replace(/<img\b[^>]*>/gi, (tag) => (tag.includes(to) ? tag.replace(/\swidth="\d+"/, ` width="${size.width}"`).replace(/\sheight="\d+"/, ` height="${size.height}"`) : tag));
      }
    });
    if (touched) changes.set(file, doc);
  }
  return changes;
}
