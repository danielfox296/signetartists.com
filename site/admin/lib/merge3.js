/* A line-level three-way merge, for undoing one save in a file that has
   changed since: merge3(base, ours, theirs) applies both sides' changes to
   base, or returns null where they touch the same lines. */

// The changes from a to b as hunks over a's lines: {start, end, lines}.
function hunks(a, b) {
  const n = a.length;
  const m = b.length;
  // Trim the common head and tail; the files differ in a few places.
  let lo = 0;
  while (lo < n && lo < m && a[lo] === b[lo]) lo++;
  let ea = n;
  let eb = m;
  while (ea > lo && eb > lo && a[ea - 1] === b[eb - 1]) ea--, eb--;
  const x = a.slice(lo, ea);
  const y = b.slice(lo, eb);
  if (x.length * y.length > 25e6) return [{ start: lo, end: ea, lines: y }];
  const L = Array.from({ length: x.length + 1 }, () => new Uint32Array(y.length + 1));
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = [];
  let i = 0;
  let j = 0;
  let cur = null;
  const flush = () => {
    if (cur) out.push(cur);
    cur = null;
  };
  while (i < x.length || j < y.length) {
    if (i < x.length && j < y.length && x[i] === y[j]) {
      flush();
      i++;
      j++;
    } else if (j < y.length && (i === x.length || L[i][j + 1] >= L[i + 1][j])) {
      cur ||= { start: lo + i, end: lo + i, lines: [] };
      cur.lines.push(y[j++]);
    } else {
      cur ||= { start: lo + i, end: lo + i, lines: [] };
      cur.end = lo + ++i;
    }
  }
  flush();
  return out;
}

export function merge3(base, ours, theirs) {
  if (ours === theirs) return ours;
  if (base === ours) return theirs;
  if (base === theirs) return ours;
  const b = base.split("\n");
  const ho = hunks(b, ours.split("\n")).map((h) => ({ ...h, side: "o" }));
  const ht = hunks(b, theirs.split("\n")).map((h) => ({ ...h, side: "t" }));
  const all = [...ho, ...ht].sort((p, q) => p.start - q.start || p.end - q.end);
  // Two hunks clash when their ranges overlap, or both insert at one place.
  for (let k = 1; k < all.length; k++) {
    const p = all[k - 1];
    const q = all[k];
    if (p.side === q.side) continue;
    const touch = q.start < p.end || (q.start === p.start && p.start === p.end && q.start === q.end);
    const same = p.start === q.start && p.end === q.end && p.lines.join("\n") === q.lines.join("\n");
    if (touch && !same) return null;
  }
  const out = [];
  let at = 0;
  const seen = new Set();
  for (const h of all) {
    const key = `${h.start}:${h.end}:${h.lines.join("\n")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(...b.slice(at, h.start), ...h.lines);
    at = h.end;
  }
  out.push(...b.slice(at));
  return out.join("\n");
}
