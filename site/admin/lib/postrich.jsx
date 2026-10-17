/* Copy in a post: paragraphs and lists, as its prose has always been
   written, with bold, italic and links. A paragraph keeps its class
   ("note"), and a list item is written without the paragraph the editor
   puts inside it. */
import { Extension } from "@tiptap/core";
import { RichTextMenu } from "@puckeditor/core";
import { LinkControl, RICH, Span } from "./richtext.jsx";

const ParagraphClass = Extension.create({
  name: "paragraphClass",
  addGlobalAttributes() {
    return [{ types: ["paragraph"], attributes: { class: { default: null, parseHTML: (el) => el.getAttribute("class"), renderHTML: (a) => (a.class ? { class: a.class } : {}) } } }];
  },
});

const menu = ({ editor, readOnly }) => (
  <RichTextMenu>
    <RichTextMenu.Group>
      <RichTextMenu.Bold />
      <RichTextMenu.Italic />
      <LinkControl editor={editor} readOnly={readOnly} />
    </RichTextMenu.Group>
    <RichTextMenu.Group>
      <RichTextMenu.BulletList />
      <RichTextMenu.OrderedList />
    </RichTextMenu.Group>
  </RichTextMenu>
);

const { bulletList, orderedList, listItem, listKeymap, ...options } = RICH.options; // eslint-disable-line no-unused-vars

export const POST_RICH = {
  ...RICH,
  renderMenu: menu,
  renderInlineMenu: menu,
  options,
  tiptap: { extensions: [Span, ParagraphClass] },
};

// The editor's HTML as a post stores it: blocks and list items each on
// their own line, as the post's prose has always been written.
export function postHtml(v) {
  if (typeof v !== "string") return v;
  let h = v.replace(/<li>\s*<p>((?:(?!<\/?p[\s>]).)*)<\/p>\s*<\/li>/gs, "<li>$1</li>");
  if (/^\s*(<p>\s*<\/p>\s*)*$/.test(h)) return "";
  return h
    .replace(/<\/(p|ul|ol|h[1-6]|blockquote)>\s*<(p|ul|ol|h[1-6]|blockquote)([\s>])/g, "</$1>\n<$2$3")
    .replace(/<(ul|ol)>\s*<li/g, "<$1>\n<li")
    .replace(/<\/li>\s*<li/g, "</li>\n<li")
    .replace(/<\/li>\s*<\/(ul|ol)>/g, "</li>\n</$1>");
}

// The editor writes every paragraph of a block it touched again, on one
// line, with its own entities, and a link outside the bold around it. Paragraphs and lists that read the same
// as before keep their stored text, so a save changes only what was edited.
const BLOCK = /<(p|ul|ol|h[1-6]|blockquote)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi;
function blocksOf(h) {
  const out = [];
  let last = 0;
  for (const m of h.matchAll(BLOCK)) {
    if (h.slice(last, m.index).trim()) return null;
    out.push(m[0]);
    last = m.index + m[0].length;
  }
  return h.slice(last).trim() ? null : out;
}
function norm(h) {
  const d = new DOMParser().parseFromString(`<!doctype html><body>${h}</body>`, "text/html");
  return d.body.innerHTML
    .replace(/\s+/g, " ")
    .replace(/\s*(<\/?(?:p|ul|ol|li|h[1-6]|blockquote)(?:\s[^>]*)?>)\s*/g, "$1")
    .replace(/<(strong|em)>(<a\s[^>]*>)([^<]*)<\/a><\/\1>/g, "$2<$1>$3</$1></a>")
    .trim();
}
export function keepUnedited(prev, next) {
  if (typeof prev !== "string" || typeof next !== "string" || prev === next) return next;
  if (norm(prev) === norm(next)) return prev;
  const a = blocksOf(prev);
  const b = blocksOf(next);
  if (!a || !b) return next;
  const pool = new Map();
  for (const x of a) {
    const k = norm(x);
    if (!pool.has(k)) pool.set(k, []);
    pool.get(k).push(x);
  }
  const out = b.map((x) => {
    const same = pool.get(norm(x));
    return same && same.length ? same.shift() : x;
  });
  return out.join(a.length > 1 && !/<\/(?:p|ul|ol|h[1-6]|blockquote)>\n</i.test(prev) ? "" : "\n");
}
