/* How copy is edited: inline, as the site writes it. Links keep exactly
   the attributes they have (TipTap would otherwise add target="_blank" and
   rel="nofollow" to every one), the site's own <span class> markup
   survives an edit, and the tools that would put blocks inside a line of
   copy (headings, lists, alignment) are not offered. */
import { Mark } from "@tiptap/core";
import { RichTextMenu } from "@puckeditor/core";

export const Span = Mark.create({
  name: "span",
  addAttributes() {
    return { class: { default: null }, style: { default: null } };
  },
  parseHTML() {
    return [{ tag: "span" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },
});

const LinkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </svg>
);

// A link is set, changed or taken off from one button. The browser's own
// prompt asks for the address: unlike a dialog in the page it leaves the
// editor focused, and Puck only takes edits from the focused field.
function LinkControl({ editor, readOnly }) {
  const active = !!editor && editor.isActive("link");
  return (
    <RichTextMenu.Control
      title="Link"
      icon={<LinkIcon />}
      active={active}
      disabled={readOnly || !editor}
      onClick={() => {
        const cur = active ? editor.getAttributes("link").href || "" : "";
        const href = window.prompt("Link", cur);
        if (href == null) return;
        const chain = editor.chain().focus().extendMarkRange("link");
        if (!href.trim()) chain.unsetLink().run();
        else chain.setLink({ href: href.trim() }).run();
      }}
    />
  );
}

const menu = ({ editor, readOnly }) => (
  <RichTextMenu>
    <RichTextMenu.Group>
      <RichTextMenu.Bold />
      <RichTextMenu.Italic />
      <LinkControl editor={editor} readOnly={readOnly} />
    </RichTextMenu.Group>
  </RichTextMenu>
);

export const RICH = {
  renderMenu: menu,
  renderInlineMenu: menu,
  options: {
    link: { openOnClick: false, HTMLAttributes: { target: null, rel: null, class: null } },
    heading: false,
    bulletList: false,
    orderedList: false,
    listItem: false,
    listKeymap: false,
    blockquote: false,
    code: false,
    codeBlock: false,
    horizontalRule: false,
    textAlign: false,
    strike: false,
    underline: false,
  },
  tiptap: { extensions: [Span] },
};
