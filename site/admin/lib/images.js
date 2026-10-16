/* Pictures are resized in the browser before they are committed, so the
   repo never takes a camera original. A picture keeps PNG only when it has
   transparency; everything else becomes a JPEG. */
import { bytesToB64 } from "./github.js";

export const MAX_SIDE = 2000;

export async function resize(file, max = MAX_SIDE) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d");
  g.drawImage(bmp, 0, 0, width, height);
  let png = false;
  if (file.type === "image/png" || file.type === "image/webp" || file.type === "image/gif") {
    const px = g.getImageData(0, 0, width, height).data;
    for (let i = 3; i < px.length; i += 4 * 7) if (px[i] < 255) {
      png = true;
      break;
    }
  }
  if (!png) {
    // JPEG has no transparency: put the picture on white first.
    g.globalCompositeOperation = "destination-over";
    g.fillStyle = "#ffffff";
    g.fillRect(0, 0, width, height);
  }
  const type = png ? "image/png" : "image/jpeg";
  const blob = await new Promise((r) => canvas.toBlob(r, type, 0.85));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { blob, bytes, b64: bytesToB64(bytes), width, height, type, ext: png ? "png" : "jpg" };
}

export const fileSlug = (name) =>
  name
    .replace(/\.[a-z0-9]+$/i, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "picture";

// A free path under img/ for a new picture.
export function freePath(repo, slug, ext) {
  let p = `img/${slug}.${ext}`;
  for (let i = 2; repo.has(p); i++) p = `img/${slug}-${i}.${ext}`;
  return p;
}

// The entry img/SOURCES.md gets for a picture added in the admin.
export function sourcesEntry(file, { usedOn, creator, licence, source }, size, today) {
  const lines = [`## ${file}`];
  if (usedOn) lines.push(`- Used on: ${usedOn}`);
  if (creator) lines.push(`- Creator: ${creator}`);
  if (licence) lines.push(`- Licence: ${licence}`);
  if (source) lines.push(`- Source: ${source}`);
  lines.push(`- Added: ${today} in the admin, resized to ${size.width}x${size.height}`);
  return lines.join("\n") + "\n";
}
