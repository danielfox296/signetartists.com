/* Layouts: which parts the act card, post, post card and video page show,
   in what order, and their image ratios. Each is one file under
   content/layouts/; a file left out, or a part it doesn't name, keeps the
   site as it has always been drawn. */

export const LAYOUT_FILES = {
  card: "act-card.json",
  post: "post.json",
  postCard: "post-card.json",
  video: "video-page.json",
};

const parts = (ids, off = []) => ids.map((id) => ({ id, on: !off.includes(id) }));

export const LAYOUT_DEFAULTS = {
  card: { parts: parts(["media", "kind", "name", "face", "tags", "blurb", "sizes", "link"]), ratio: "16 / 9", blurb: "full", tags: "buckets", link: "See {name}" },
  post: { parts: parts(["eyebrow", "title", "dek", "byline", "hero", "contents"], ["contents"]), heroRatio: "16 / 9" },
  postCard: { parts: parts(["photo", "eyebrow", "date", "time", "title", "dek"]), ratio: "16 / 9" },
  video: { parts: parts(["style", "title", "player", "description", "buttons", "more"]) },
};

export const DEFAULT_RATIO = "16 / 9";

// A stored layout over the defaults: its parts in its order, then any part
// it doesn't name where the defaults have it.
export function layoutOf(stored, key) {
  const d = LAYOUT_DEFAULTS[key];
  const s = stored && typeof stored === "object" ? stored : {};
  const known = new Set(d.parts.map((p) => p.id));
  const list = (Array.isArray(s.parts) ? s.parts : []).filter((p) => p && known.has(p.id)).map((p) => ({ id: p.id, on: p.on !== false }));
  const seen = new Set(list.map((p) => p.id));
  d.parts.forEach((p, i) => {
    if (seen.has(p.id)) return;
    // After the part it follows by default, or first.
    const prev = d.parts.slice(0, i).reverse().find((x) => seen.has(x.id));
    const at = prev ? list.findIndex((x) => x.id === prev.id) + 1 : 0;
    list.splice(at, 0, { ...p });
    seen.add(p.id);
  });
  return { ...d, ...s, parts: list };
}

export const shows = (L, id) => L.parts.some((p) => p.id === id && p.on);

// The parts that are on, in order, with each run of parts from `group`
// gathered into one entry: [{group: true, ids}] or {id}.
export function runs(L, group) {
  const out = [];
  for (const p of L.parts) {
    if (!p.on) continue;
    if (group.includes(p.id)) {
      const last = out[out.length - 1];
      if (last && last.group) last.ids.push(p.id);
      else out.push({ group: true, ids: [p.id] });
    } else out.push({ id: p.id });
  }
  return out;
}

// An image ratio other than the stylesheet's, as an inline style.
export const ratioStyle = (ratio) => (ratio && ratio.replace(/\s+/g, "") !== DEFAULT_RATIO.replace(/\s+/g, "") ? `aspect-ratio: ${ratio};` : undefined);
