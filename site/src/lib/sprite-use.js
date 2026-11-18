/* A drawing from a sprite sheet (src/build/sprites.js) on a page. */

// A <use> of one symbol, placed over the whole of the page <svg>'s viewBox:
// a symbol's viewport starts at the <use>'s x and y, which default to 0.
export function useOf(href, viewBox) {
  const [x, y, w, h] = viewBox.trim().split(/[\s,]+/);
  return `<use href="${href}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
}
