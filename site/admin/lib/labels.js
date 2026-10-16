/* Names for files, as the admin shows them and as its commits read. */
import { slugLabel } from "../../src/lib/model.js";

const SHARED = { "content/shared/header.json": "Header", "content/shared/footer.json": "Footer", "content/shared/logo-strip.json": "Logo strip" };
const DATA = {
  "content/redirects.json": "Redirects",
  "content/roster.json": "Roster",
  "content/site.json": "Site",
  "content/photo-focus.json": "Crop points",
  "content/repertoire.json": "Songs",
  "content/lastmod.json": "Sitemap dates",
  "content/robots.txt": "robots.txt",
  "content/layouts/act-page.json": "Act page layout",
};

// Set once signed in: an act's name from its id.
export const actNames = { get: null };

export function fileKind(path) {
  if (path.startsWith("content/pages/")) return "page";
  if (SHARED[path]) return "shared";
  if (path.startsWith("content/layouts/")) return "layout";
  if (path.startsWith("content/")) return "data";
  if (path.startsWith("img/")) return "media";
  return "code";
}

const titleFrom = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

// `text` is the file's current text, when there is one.
export function fileLabel(path, text) {
  if (SHARED[path]) return SHARED[path];
  if (DATA[path]) return DATA[path];
  if (path.startsWith("content/pages/")) {
    const d = text && titleFrom(text);
    const p = d && d.root && d.root.props;
    const own = p && p.layout === "act" && p.schema && actNames.get ? actNames.get(p.schema.act) : null;
    if (p) return p.breadcrumb || own || (p.path === "/" ? "Home" : slugLabel(p.path));
    return path.split("/").pop().replace(/\.json$/, "");
  }
  if (path.startsWith("content/posts/")) {
    const d = text && titleFrom(text);
    return (d && d.root && d.root.props.title) || path.split("/").pop().replace(/\.json$/, "");
  }
  if (path.startsWith("content/acts/") || path.startsWith("content/videos/")) {
    const d = text && titleFrom(text);
    return (d && d.name) || path.split("/").pop().replace(/\.json$/, "");
  }
  if (path.endsWith("SOURCES.md")) return "Picture credits";
  return path.replace(/^img\//, "");
}

export function commitMessage(names) {
  const uniq = [...new Set(names)];
  const shown = uniq.slice(0, 3).join(", ");
  return uniq.length > 3 ? `${shown} and ${uniq.length - 3} more` : shown;
}
