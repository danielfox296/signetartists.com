// Where each sleeve of a song patchwork sits, at three widths. A patchwork is
// square cells: most sleeves take one, a few take two by two or three by
// three, and the first song always gets the biggest. Every layout is packed
// here, ahead of time, so the last row is always full: a patchwork that
// trails off into a ragged row reads as a gap, not a design.

// Columns tried at each width, best first.
export const PATCH_WIDTHS = [
  { key: "sm", cols: [3, 2], tall: 1.6 },
  { key: "md", cols: [4, 3], tall: 1 },
  { key: "lg", cols: [6, 5, 7, 4, 8], tall: 0.5 },
];

// First fit, row by row: what CSS calls dense packing.
function pack(spans, cols) {
  const taken = [];
  const free = (r, c, s) => {
    if (c + s > cols) return false;
    for (let y = r; y < r + s; y++) for (let x = c; x < c + s; x++) if (taken[y] && taken[y][x]) return false;
    return true;
  };
  const at = spans.map((s) => {
    for (let r = 0; ; r++) {
      for (let c = 0; c < cols; c++) {
        if (free(r, c, s)) {
          for (let y = r; y < r + s; y++) {
            taken[y] = taken[y] || [];
            for (let x = c; x < c + s; x++) taken[y][x] = true;
          }
          return { c: c + 1, r: r + 1, s };
        }
      }
    }
  });
  const rows = taken.length;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (!taken[y] || !taken[y][x]) return null;
  return { at, rows };
}

// Which songs get the big sleeves: the first, then the rest spread evenly
// through the list, kept clear of the last few so singles can fill in after
// them. `shift` nudges the spread when a layout leaves a hole.
function spansFor(n, twos, threes, shift) {
  const spans = new Array(n).fill(1);
  const big = [...new Array(threes).fill(3), ...new Array(twos).fill(2)];
  if (!big.length) return spans;
  spans[0] = big[0];
  const rest = big.slice(1);
  const room = Math.max(1, n - 3);
  rest.forEach((s, k) => {
    let i = Math.min(n - 1, Math.max(1, Math.round(((k + 1) * room) / (rest.length + 1)) + shift));
    while (spans[i] !== 1 && i < n - 1) i++;
    spans[i] = s;
  });
  return spans;
}

export function patchwork(n) {
  if (!n) return null;
  const out = {};
  for (const w of PATCH_WIDTHS) {
    const tries = [];
    for (const cols of w.cols) {
      for (let threes = 0; threes <= (cols >= 3 ? 2 : 0); threes++) {
        for (let twos = 0; twos <= Math.ceil(n / 2); twos++) {
          if (twos + threes > n) continue;
          if (n > 1 && twos + threes === 0 && n > cols) continue;
          const cells = n + 3 * twos + 8 * threes;
          if (cells % cols) continue;
          const rows = cells / cols;
          const cost =
            Math.abs(twos + threes - Math.max(1, n / 5)) +
            threes * 2 +
            Math.abs(rows / cols - w.tall) * 4 +
            w.cols.indexOf(cols) * 0.6 +
            (rows < 2 && n > 2 ? 3 : 0);
          tries.push({ cols, twos, threes, cost });
        }
      }
    }
    tries.sort((a, b) => a.cost - b.cost);
    let found = null;
    for (const t of tries) {
      for (let shift = 0; shift < 4 && !found; shift++) {
        const p = pack(spansFor(n, t.twos, t.threes, shift), t.cols);
        if (p) found = { cols: t.cols, ...p };
      }
      if (found) break;
    }
    // Nothing packs: everything single, the last row allowed to run short.
    out[w.key] = found || { cols: w.cols[0], at: Array.from({ length: n }, (_, i) => ({ c: (i % w.cols[0]) + 1, r: Math.floor(i / w.cols[0]) + 1, s: 1 })), rows: Math.ceil(n / w.cols[0]) };
  }
  return out;
}

// The song slug a sleeve's file is named by: the same rule as slug() in
// scripts/act_covers.py.
export function songSlug(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const coverPath = (song) => `img/covers/${songSlug(song.artist)}--${songSlug(song.title)}.jpg`;
