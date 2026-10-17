/* Pieces every section shares: the site context, rich text, the section
   frame, the heading block and the run of paragraphs around a section's body. */
import { createContext, Fragment, useContext } from "react";
import { css, cx, relHtml, relUrl } from "../lib/util.js";
import { sizesFor, srcsetOf, ytPath } from "../lib/pictures.js";

// What a component needs to know about the page it is on: the link prefix
// for its depth, its URL, the site model, and (in the static build) where to
// collect raw HTML that is written into the page as is.
export const Site = createContext(null);
export const useSite = () => useContext(Site);

// In the admin, `assetUrl` shows a picture uploaded but not yet built.
export function useHref() {
  const s = useSite();
  return (u) => (s && s.assetUrl && s.assetUrl(u)) || relUrl(u, s ? s.prefix : "/");
}

// Raw HTML with no wrapper element: a placeholder in the static build that
// is swapped for the markup afterwards; a display:contents box in the editor.
export function Raw({ html }) {
  const s = useSite();
  const h = relHtml(html || "", s ? s.prefix : "/");
  if (s && s.raw) {
    s.raw.push(h);
    return <raw-html data-k={s.raw.length - 1} />;
  }
  return <div style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: h }} />;
}

// Stored rich text is inline HTML. While Puck edits it on the canvas the
// value is an editor node instead.
export function H({ as: Tag = "span", html, ...rest }) {
  const s = useSite();
  if (html == null) return null;
  if (typeof html !== "string") {
    const Box = Tag === "p" ? "div" : Tag;
    return <Box {...rest}>{html}</Box>;
  }
  return <Tag {...rest} dangerouslySetInnerHTML={{ __html: relHtml(html, s ? s.prefix : "/") }} />;
}

// The editor may hand back paragraphs; they become the site's line breaks.
export function inline(v) {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (!/^<p[ >]/i.test(t)) return v;
  return t.replace(/^<p[^>]*>/i, "").replace(/<\/p>$/i, "").replace(/<\/p>\s*<p[^>]*>/gi, "<br><br>");
}

const BANDS = {
  ruled: "section section--ruled",
  sunk: "section section--ruled section--sunk",
  top: "section section--top",
  night: "section section--ruled section--night",
};
export const bandClass = (band) => BANDS[band || "ruled"] ?? band;

export function Shell({ p, cls, wrap = true, children }) {
  const inner = wrap ? (
    <div className={cx("wrap", p.narrow && "wrap--narrow")} style={css(p.wrapStyle)}>
      {children}
    </div>
  ) : (
    children
  );
  return (
    <section className={cx(bandClass(p.band), cls)} id={p.anchor || undefined} aria-label={p.label || undefined}>
      {inner}
    </section>
  );
}

// An <img>. The static build writes it as plain markup: React 19 would
// otherwise add a <link rel="preload"> for every image not marked lazy,
// which the site has never had. Given `sizes`, a local picture gains a srcset
// of its WebP copies, and its width and height; it stays the same <img>.
export function Pic({ sizes, ...attrs }) {
  const s = useSite();
  let a = Object.entries(attrs).filter(([, v]) => v !== undefined && v !== null && v !== false);
  if (s && s.raw) {
    const pic = sizes && s.pictures ? s.pictures.of(attrs.src) : null;
    if (pic) {
      const src = a.findIndex(([k]) => k === "src") + 1;
      a = [...a.slice(0, src), ["srcset", srcsetOf(attrs.src, pic.widths)], ["sizes", sizes], ...a.slice(src)];
      if (attrs.width == null && attrs.height == null) {
        const at = a.findIndex(([k]) => k === "alt") + 1 || a.length;
        a = [...a.slice(0, at), ["width", pic.w], ["height", pic.h], ...a.slice(at)];
      }
    }
    const html = "<img" + a.map(([k, v]) => (k === "style" && typeof v === "object" ? "" : ` ${k === "className" ? "class" : k.toLowerCase()}="${escAttr(v)}"`)).join("") + ">";
    s.raw.push(html);
    return <raw-html data-k={s.raw.length - 1} />;
  }
  const props = Object.fromEntries(a.map(([k, v]) => [k === "fetchpriority" ? "fetchPriority" : k === "class" ? "className" : k, k === "style" && typeof v === "string" ? css(v) : v]));
  return <img {...props} />;
}

// A YouTube video as its picture and a play button: the video's poster, or
// the picture YouTube shows for it. The page's script swaps in the player,
// playing, on a click or Enter, so nothing loads from YouTube until then.
export function YouTube({ id, src, title, allow, referrerPolicy, sizes }) {
  const s = useSite();
  const href = useHref();
  const v = s && s.model && s.model.FOOTAGE_BY_KEY ? s.model.FOOTAGE_BY_KEY[id] : null;
  const own = s && s.raw && s.pictures;
  const pic = v && v.poster ? { src: href("/" + v.poster) } : own ? { src: href("/" + ytPath(id)) } : { src: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, width: "480", height: "360" };
  return (
    <button type="button" className="yt" data-yt={src} data-title={title} data-allow={allow} data-referrerpolicy={referrerPolicy} aria-label={title ? `Play video: ${title}` : "Play video"}>
      <Pic src={pic.src} alt="" width={pic.width} height={pic.height} loading="lazy" decoding="async" sizes={sizes} />
      <span className="yt-play" aria-hidden="true"></span>
    </button>
  );
}

const escAttr = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// A stored picture. It is drawn as wide as its style says, else as wide as
// the column, unless the block that holds it says otherwise.
export function Img({ im, sizes }) {
  const href = useHref();
  if (!im) return null;
  return (
    <Pic
      sizes={sizes || sizesFor(im.style)}
      class={im.cls || undefined}
      src={href(im.src)}
      alt={im.alt ?? undefined}
      width={im.width || undefined}
      height={im.height || undefined}
      loading={im.loading || undefined}
      decoding={im.decoding || undefined}
      fetchpriority={im.fetchpriority || undefined}
      style={im.style || undefined}
    />
  );
}

export function Buttons({ items, cls }) {
  const href = useHref();
  if (items == null) return null;
  // Buttons sit on their own lines in the markup, so a space separates them.
  return (
    <div className={cx("btn-row", cls)}>
      {items.map((b, i) => (
        <Fragment key={i}>
          {i ? " " : null}
          <a className={b.cls || "btn"} href={href(b.href)} target={b.target || undefined} rel={b.rel || undefined}>
            {b.label}
          </a>
        </Fragment>
      ))}
    </div>
  );
}

// The heading block: eyebrow, title, the act line, lede, paragraphs, a
// picture, buttons and a note, in that order. With `bare` the title stands
// on its own, as the smaller sections write it.
export function Heading({ p }) {
  if (p.headingBox === false) {
    return p.title != null ? <H as={p.titleTag || "h2"} className={p.titleClass || "h3"} style={css(p.titleStyle)} html={p.title} /> : null;
  }
  if (p.headingBox !== true && p.eyebrow == null && p.title == null) return null;
  return (
    <div className="heading" style={css(p.headingStyle)}>
      {p.eyebrow != null ? <H as="p" className={cx("eyebrow", p.slab && "eyebrow--slab")} html={p.eyebrow} /> : null}
      {p.title != null ? <H as={p.titleTag || "h2"} className={p.titleClass || "h2"} style={css(p.titleStyle)} html={p.title} /> : null}
      {p.face != null ? <H as="p" className="act-face" html={p.face} /> : null}
      {p.headingImageFirst ? <Img im={p.headingImage} /> : null}
      {p.lede != null ? <H as="p" className="lede" style={css(p.ledeStyle)} html={p.lede} /> : null}
      {(p.headingText || []).map((t, i) => (
        <H key={i} as="p" className={t.cls || "prose"} style={css(t.style)} html={t.html} />
      ))}
      {p.headingImageFirst ? null : <Img im={p.headingImage} />}
      <Buttons items={p.buttons} />
      {p.headingNote != null ? <H as="p" className="note" html={p.headingNote} /> : null}
    </div>
  );
}

// A run of paragraphs, notes, quotes, small titles, pictures and buttons.
export function Flow({ items }) {
  if (!items || !items.length) return null;
  return items.map((b, i) => <Block key={i} b={b} />);
}

export function Block({ b }) {
  switch (b.kind) {
    case "p":
      return <H as="p" className={b.cls || undefined} style={css(b.style)} html={b.html} />;
    case "title":
      return <H as={b.tag || "h3"} className={b.cls || undefined} style={css(b.style)} html={b.html} />;
    case "quote":
      return (
        <figure className="review-pull">
          <H as="blockquote" html={b.html} />
          <H as="figcaption" html={b.by} />
        </figure>
      );
    case "image":
      return <Img im={b.image} />;
    case "buttons":
      return <Buttons items={b.buttons} cls={b.cls} />;
    case "list":
      return <List b={b} />;
    case "raw":
      return <Raw html={b.html} />;
    default:
      return null;
  }
}

export function List({ b }) {
  const Tag = b.tag || "ul";
  return (
    <Tag className={b.cls || undefined} style={css(b.style)}>
      {(b.items || []).map((it, i) => (
        <H key={i} as="li" html={it} />
      ))}
    </Tag>
  );
}

// Section settings shared by every standard section.
export const shellFields = {
  band: {
    type: "select",
    label: "Background",
    options: [
      { label: "Plain", value: "ruled" },
      { label: "Band", value: "sunk" },
      { label: "Top", value: "top" },
      { label: "Night", value: "night" },
    ],
  },
  anchor: { type: "text", label: "Anchor" },
  label: { type: "text", label: "Label" },
  narrow: { type: "radio", label: "Width", options: [{ label: "Full", value: false }, { label: "Narrow", value: true }] },
  wrapStyle: { type: "text", label: "Style" },
  cls: { type: "text", label: "Class" },
};

const rich = (label) => ({ type: "richtext", label, contentEditable: true });
const text = (label) => ({ type: "text", label });
export const F = { rich, text };

export const buttonFields = {
  type: "array",
  label: "Buttons",
  getItemSummary: (b) => b.label,
  arrayFields: {
    label: text("Label"),
    href: text("Link"),
    cls: { type: "select", label: "Style", options: [{ label: "Solid", value: "btn" }, { label: "Outline", value: "btn btn--outline" }, { label: "Small", value: "btn btn--sm" }, { label: "Small outline", value: "btn btn--sm btn--outline" }] },
  },
};

export const imageFields = {
  src: text("File"),
  alt: text("Alt text"),
  width: text("Width"),
  height: text("Height"),
  style: text("Style"),
  loading: { type: "select", label: "Loading", options: [{ label: "Default", value: "" }, { label: "Lazy", value: "lazy" }, { label: "Eager", value: "eager" }] },
  decoding: { type: "select", label: "Decoding", options: [{ label: "Default", value: "" }, { label: "Async", value: "async" }] },
  fetchpriority: { type: "select", label: "Priority", options: [{ label: "Default", value: "" }, { label: "High", value: "high" }] },
};

export const headingFields = {
  eyebrow: rich("Eyebrow"),
  face: rich("Act line"),
  slab: { type: "radio", label: "Eyebrow style", options: [{ label: "Plain", value: false }, { label: "Slab", value: true }] },
  title: rich("Title"),
  titleTag: { type: "select", label: "Title level", options: [{ label: "H1", value: "h1" }, { label: "H2", value: "h2" }, { label: "H3", value: "h3" }] },
  titleClass: { type: "select", label: "Title size", options: ["h1 display", "h2 display", "h1", "h2", "h3", "h3 h3--lead", "h5"].map((v) => ({ label: v, value: v })) },
  titleStyle: text("Title style"),
  lede: rich("Lede"),
  ledeStyle: text("Lede style"),
  headingText: { type: "array", label: "Heading text", getItemSummary: (t) => (typeof t.html === "string" ? t.html.replace(/<[^>]+>/g, "").slice(0, 40) : "Text"), arrayFields: { html: rich("Text"), style: text("Style") } },
  buttons: buttonFields,
  headingNote: rich("Note"),
  headingStyle: text("Heading style"),
  image: { type: "object", label: "Picture", objectFields: imageFields },
  imageFirst: { type: "radio", label: "Picture", options: [{ label: "After the text", value: false }, { label: "Before the lede", value: true }] },
};

export const flowFields = (label) => ({
  type: "array",
  label,
  getItemSummary: (b) => (typeof b.html === "string" ? b.html.replace(/<[^>]+>/g, "").slice(0, 40) : b.kind),
  arrayFields: {
    kind: { type: "select", label: "Kind", options: [{ label: "Paragraph", value: "p" }, { label: "Title", value: "title" }, { label: "Quote", value: "quote" }, { label: "Picture", value: "image" }, { label: "Buttons", value: "buttons" }, { label: "List", value: "list" }] },
    cls: { type: "select", label: "Style", options: [{ label: "Text", value: "prose" }, { label: "Note", value: "note" }, { label: "Small note", value: "note note--small" }, { label: "Lede", value: "lede" }, { label: "H3", value: "h3" }, { label: "H5", value: "h5" }] },
    html: rich("Text"),
    by: rich("By"),
    style: text("Style"),
  },
});
