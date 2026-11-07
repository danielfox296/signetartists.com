/* The blocks a section is made of. A section holds them in order, so any
   arrangement the site uses (a table between two paragraphs, a quote after
   the rows) is a list of these. Copy is inline HTML; links are stored from
   the site root and written relative to the page. */
import { Fragment } from "react";
import { css, cx, esc } from "../lib/util.js";
import { ratioStyle, runs } from "../lib/layouts.js";
import { Boxed, buttonFields, Buttons, F, H, headingFields, Img, imageFields, Pic, Raw, useHref, useSite, YouTube } from "./parts.jsx";
import { SIZES, ytId } from "../lib/pictures.js";

const { rich, text } = F;
const select = (label, values) => ({ type: "select", label, options: values.map((v) => (typeof v === "string" ? { label: v, value: v } : v)) });
const plain = (s) => (typeof s === "string" ? s.replace(/<[^>]+>/g, "").slice(0, 48) : "");

// ------------------------------------------------------------------ copy

export const Heading = {
  label: "Heading",
  fields: { ...headingFields, slab: headingFields.slab },
  defaultProps: { eyebrow: "Eyebrow", title: "Title", titleTag: "h2", titleClass: "h2", lede: "Lede" },
  render: function HeadingRender(p) {
    const s = useSite();
    const href = useHref();
    // "left": the picture in a column of its own beside the words, which stack
    // under it on a narrow screen. The pair is not a .heading, so the section
    // keeps its full width instead of narrowing to the reading column.
    const left = (p.imageFirst === "left" || p.imageFirst === "right") && p.image && p.image.src;
    const heading = (
    <div className="heading" style={css(p.headingStyle)}>
      {p.eyebrow != null ? <H as="p" className={cx("eyebrow", p.slab && "eyebrow--slab")} html={p.eyebrow} /> : null}
      {p.title != null ? <H as={p.titleTag || "h2"} className={p.titleClass || "h2"} style={css(p.titleStyle)} html={p.title} /> : null}
      {p.face != null ? <H as="p" className="act-face" html={p.face} /> : null}
      {p.imageFirst && !left ? <Img im={p.image} /> : null}
      {p.lede != null ? <H as="p" className="lede" style={css(p.ledeStyle)} html={p.lede} /> : null}
      {(p.headingText || []).map((t, i) => (
        <H key={i} as="p" className={t.cls || "prose"} style={css(t.style)} html={t.html} />
      ))}
      {p.imageFirst ? null : <Img im={p.image} />}
      <Buttons items={p.buttons} />
      {p.headingNote != null ? <H as="p" className="note" html={p.headingNote} /> : null}
    </div>
    );
    if (left) {
      return (
        <div className={cx("heading-split", p.imageFirst === "right" && "heading-split--right")}>
          <div className="heading-split__media"><Img im={p.image} /></div>
          {heading}
        </div>
      );
    }
    // The page's own h1 heading sits over a full-bleed photo, the same
    // treatment as the closing call to action.
    const photo = p.titleTag === "h1" ? heroPhoto(s) : null;
    if (!photo) return heading;
    return (
      <div className="hero-photo">
        <div className="hero-photo__bg" aria-hidden="true" style={photoStyle(href, photo)} />
        {heading}
      </div>
    );
  },
};

export const Paragraph = {
  label: "Paragraph",
  fields: { html: rich("Text"), cls: select("Style", [{ label: "Text", value: "prose" }, { label: "Note", value: "note" }, { label: "Small note", value: "note note--small" }, { label: "Lede", value: "lede" }, { label: "Callout", value: "callout" }]), style: text("Style") },
  defaultProps: { html: "Text", cls: "prose" },
  render: ({ html, cls, style }) => <H as="p" className={cls || undefined} style={css(style)} html={html} />,
};

export const Title = {
  label: "Title",
  fields: { html: rich("Title"), tag: select("Level", ["h2", "h3", "h4", "h5"]), cls: select("Size", ["h2", "h3", "h3 h3--lead", "h5"]), style: text("Style") },
  defaultProps: { html: "Title", tag: "h2", cls: "h3" },
  render: ({ html, tag, cls, style }) => <H as={tag || "h2"} className={cls || undefined} style={css(style)} html={html} />,
};

export const Quote = {
  label: "Quote",
  fields: { html: rich("Quote"), by: rich("By") },
  defaultProps: { html: "Quote", by: "Name" },
  render: ({ html, by, style }) => (
    <figure className="review-pull" style={css(style)}>
      <H as="blockquote" html={html} />
      <H as="figcaption" html={by} />
    </figure>
  ),
};

export const Picture = {
  label: "Picture",
  fields: { image: { type: "object", label: "Picture", objectFields: imageFields } },
  render: ({ image }) => <Img im={image} />,
};

export const ButtonRow = {
  label: "Buttons",
  fields: { buttons: buttonFields },
  defaultProps: { buttons: [{ label: "Check a Date", href: "/contact/", cls: "btn" }] },
  render: ({ buttons, cls, style }) => <Buttons items={buttons || []} cls={cls} style={style} />,
};

export const List = {
  label: "List",
  fields: { items: { type: "array", label: "Items", getItemSummary: (x) => plain(x.html), arrayFields: { html: rich("Item") } }, cls: text("Style") },
  render: ({ tag, cls, style, items }) => {
    const Tag = tag || "ul";
    return (
      <Tag className={cls || undefined} style={css(style)}>
        {(items || []).map((it, i) => <H key={i} as="li" html={it.html} />)}
      </Tag>
    );
  },
};

// A dash list; the included and extras lists are the site's own, shared by
// every page that shows them.
export const SpecList = {
  label: "Spec list",
  fields: {
    source: select("List", [{ label: "This list", value: "own" }, { label: "What's included", value: "included" }, { label: "Quoted separately", value: "extras" }]),
    items: { type: "array", label: "Items", getItemSummary: (x) => plain(x.html), arrayFields: { html: rich("Item") } },
    cols: { type: "radio", label: "Columns", options: [{ label: "One", value: false }, { label: "Two", value: true }] },
    mark: select("Marker", [{ label: "Dash", value: "" }, { label: "Check", value: "check" }, { label: "Plus", value: "plus" }]),
  },
  defaultProps: { source: "own", items: [{ html: "Item" }], cols: false },
  render: function SpecListRender({ source, items, cols, mark, style }) {
    const s = useSite();
    const DASH = '<span class="dash" aria-hidden="true"></span>';
    const list = source && source !== "own" ? s.model.site.lists[source].map((t) => DASH + esc(t)) : (items || []).map((it) => (typeof it.html === "string" ? DASH + it.html : it.html));
    // Copy being edited on the canvas is an editor, not a string: the dash goes before it.
    return (
      <ul className={cx("spec-list", cols && "spec-list--cols", mark && `spec-list--${mark}`)} style={css(style)}>
        {list.map((h, i) => (typeof h === "string" ? <H key={i} as="li" html={h} /> : <li key={i}><span className="dash" aria-hidden="true"></span>{h}</li>))}
      </ul>
    );
  },
};

// ------------------------------------------------------------------ rows

// The marker beside a list row. A label with an
// ordinal ("The 40th") gets the number in brass; any other label gets the line
// drawing its words point to, first match wins, music notes when nothing does.
// The drawings themselves are in styles.css, keyed by data-art.
const ROW_ART = [
  [/\b(?:stage lighting|lighting\b|spotlight)/, "spotlight"],
  [/\bkaraoke/, "microphone"],
  [/\b(?:wedding|reception|ceremony|couple|bride|engagement|propos)/, "rings"],
  [/\b(?:anniversar)/, "heart"],
  [/\b(?:birthday)/, "cake"],
  [/\b(?:graduat)/, "cap"],
  [/\b(?:retire)/, "clock"],
  [/\b(?:shower)/, "gift"],
  [/\b(?:halloween)/, "moon"],
  [/\b(?:memorial|funeral|celebration of life)/, "candle"],
  [/\b(?:holiday|cocktail|drinks|toast|happy hour|welcome)/, "glass"],
  [/\b(?:dinner|brunch|lunch|meal|banquet)/, "plate"],
  [/\b(?:after-party|after party|conference|gala|award|fundrais|launch|keynote|program)/, "microphone"],
  [/\b(?:retreat|mountain|vail|aspen|breckenridge|beaver creek|telluride|steamboat|crested butte|winter park|resort)/, "mountain"],
  [/\b(?:backyard|garden|patio|outdoor|lawn|park|courtyard|terrace|rooftop)/, "tree"],
  [/\b(?:daytime|morning|afternoon|markets?\b|farmers|festival|summer)/, "sun"],
  [/\b(?:senior|community|library|neighbo|house party|at home)/, "house"],
  [/\b(?:\bdj\b|late night|dance floor|dancing)/, "headphones"],
  [/\b(?:sound|volume|speaker|\bpa\b|loud|quiet|noise)/, "speaker"],
  [/\b(?:song|setlist|set list|first dance|repertoire|request)/, "list"],
  [/\b(?:dress|attire|wear|black tie)/, "bowtie"],
  [/\b(?:office|company|corporate|client|team|member|club|staff)/, "building"],
  [/\b(?:guitar|flamenco|spanish)/, "guitar"],
  [/\b(?:duo|trio|quartet|quintet|band|piece|musician|solo|size|singer|voice|ensemble)/, "musicians"],
  [/\b(?:costs?\b|price|budget|quote|fees?\b|deposit|pay\b|payment|rates?\b|marketplace|tier\b)/, "tag"],
  [/\b(?:travel|drive|miles?\b|distance)/, "car"],
  [/\b(?:venue|denver|boulder|colorado springs|fort collins|city|town|space|stage|floor)/, "pin"],
  [/\b(?:when|date|book|ahead|month|week|calendar|season)/, "calendar"],
  [/\b(?:time|hour|minute|length|long|curfew|late)/, "clock"],
  [/\b(?:point of contact|contact|phone)/, "phone"],
  [/\b(?:insurance|insured|certificate)/, "shield"],
  [/\b(?:paperwork|invoice|w-9|contract)/, "document"],
  [/\b(?:load-in|load in|load-out|setup|strike)/, "box"],
];
function rowMark(term) {
  const t = String(term || "").replace(/<[^>]+>/g, "").toLowerCase();
  const n = t.match(/\b(\d{1,3})(?:st|nd|rd|th)\b/);
  if (n) return { num: n[1] };
  for (const [re, art] of ROW_ART) if (re.test(t)) return { art };
  return { art: "notes" };
}

// The first sentence of a row in the brighter ink, so a skimmer gets the point
// Splits at the first full stop, question or exclamation mark
// that is outside a tag and not inside an open link, and leaves the row alone
// when there is no second sentence or the first runs past 90 characters.
// Cards skip it: the card's own title is the cue there.
function leadSentence(html) {
  if (typeof html !== "string") return html;
  let depth = 0;
  let inTag = false;
  for (let i = 0; i < html.length; i++) {
    const ch = html[i];
    if (ch === "<") {
      inTag = true;
      if (html.startsWith("<a", i) && /\s|>/.test(html[i + 2] || "")) depth++;
      else if (html.startsWith("</a", i)) depth--;
      continue;
    }
    if (ch === ">") { inTag = false; continue; }
    if (inTag || depth > 0) continue;
    if ((ch === "." || ch === "?" || ch === "!") && html[i + 1] === " ") {
      const rest = html.slice(i + 2);
      if (!rest.trim()) return html;
      // A long first sentence in bold is a block, not a cue: leave it plain.
      if (html.slice(0, i + 1).replace(/<[^>]+>/g, "").length > 90) return html;
      return `<span class="lead">${html.slice(0, i + 1)}</span> ${rest}`;
    }
  }
  return html;
}

export const DefRows = {
  label: "Rows",
  fields: {
    rows: {
      type: "array",
      label: "Rows",
      getItemSummary: (r) => plain(r.term),
      arrayFields: { term: rich("Label"), text: rich("Text"), art: text("Drawing (blank: picked from the label)"), termStyle: text("Label style"), textStyle: text("Text style"), textCls: text("Text class") },
    },
    cls: select("Layout", [
      { label: "Stacked", value: "def-list def-list--stack" },
      { label: "Cards", value: "def-list def-list--cards" },
      { label: "Icon list", value: "def-list def-list--icons" },
      { label: "Tiles", value: "def-list def-list--tiles" },
      { label: "Add-on tiles", value: "def-list def-list--tiles def-list--addons" },
      { label: "Route", value: "def-list def-list--route" },
      { label: "Side by side", value: "def-list" },
    ]),
    image: text("Photo behind (Route only)"),
    bare: { type: "radio", label: "Row boxes", options: [{ label: "Yes", value: false }, { label: "No", value: true }] },
    style: text("Style"),
  },
  defaultProps: { cls: "def-list def-list--stack", rows: [{ term: "Label", text: "Text" }] },
  render: function DefRowsRender({ cls, style, bare, rows, image }) {
    const href = useHref();
    const layout = cls || "def-list def-list--stack";
    const marked = /def-list--(stack|cards|icons|tiles|route)/.test(layout);
    const leads = /def-list--stack/.test(layout);
    const staggered = /def-list--(tiles|route)/.test(layout);
    const list = (
    <dl className={layout} style={css(style)}>
      {(rows || []).map((r, i) => {
        const dt = <H as="dt" style={css(r.termStyle)} html={r.term} />;
        const dd = <H as="dd" className={r.textCls || undefined} style={css(r.textStyle)} html={leads ? leadSentence(r.text) : r.text} />;
        const mark = marked ? (r.art ? { art: r.art } : rowMark(r.term)) : {};
        return bare ? (
          <Fragment key={i}>{dt}{dd}</Fragment>
        ) : (
          <div className="def-row" key={i} data-art={mark.art} data-num={mark.num} style={staggered ? { "--i": i } : undefined}>{dt}{dd}</div>
        );
      })}
    </dl>
    );
    // A route can sit on a photo, drawn in black and white under a dark wash
    // like the closing call; the photo is a background, so it needs no description.
    if (/def-list--route/.test(layout) && image) {
      return <div className="route-panel" style={{ backgroundImage: `url("${href(image)}")` }}>{list}</div>;
    }
    return list;
  },
};

// The questions a page shows. With "schema" on, they are also the page's
// FAQPage structured data; an answer marked open is shown but kept out.
export const Faq = {
  label: "Questions",
  fields: {
    items: {
      type: "array",
      label: "Questions",
      getItemSummary: (q) => plain(q.q),
      arrayFields: { q: rich("Question"), a: rich("Answer"), open: { type: "radio", label: "Settled", options: [{ label: "Yes", value: false }, { label: "Open", value: true }] } },
    },
    schema: { type: "radio", label: "Search results", options: [{ label: "Yes", value: true }, { label: "No", value: false }] },
    style: text("Style"),
  },
  defaultProps: { items: [{ q: "Question", a: "Answer" }], schema: true },
  // Each question opens on a click, the first one open: a page
  // shows its questions, not a column of answers. The answers stay in the
  // page for search, and the FAQPage markup still renders from the items.
  render: ({ items, style }) => (
    <div className="faq-list" style={css(style)}>
      {(items || []).map((f, i) => (
        <details className="faq-row" key={i} open={i === 0 || undefined}>
          <summary>
            <H as="span" className="faq-q" html={f.q} />
            <span className="faq-toggle" aria-hidden="true" />
          </summary>
          {f.open ? (
            <div className="faq-a"><H as="span" data-tbd="true" html={f.a} /></div>
          ) : (
            <H as="div" className="faq-a" html={f.a} />
          )}
        </details>
      ))}
    </div>
  ),
};

// ----------------------------------------------------------------- media

const figureFields = { ...imageFields, caption: rich("Caption") };

export const MediaGrid = {
  label: "Images",
  fields: { images: { type: "array", label: "Pictures", getItemSummary: (i) => (i.src || "").split("/").pop(), arrayFields: figureFields }, single: { type: "radio", label: "Layout", options: [{ label: "Grid", value: false }, { label: "One", value: true }] } },
  defaultProps: { images: [], single: false },
  render: ({ images, single, style }) => (
    <div className={cx("media-grid", single && "media-grid--single")} style={css(style)}>
      {(images || []).map((im, i) => (
        <figure key={i}>
          <Img im={im} sizes={single ? SIZES.single : SIZES.grid} />
          {im.caption != null ? <H as="figcaption" html={im.caption} /> : null}
        </figure>
      ))}
    </div>
  ),
};

export const ALLOW = "accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture";

export function Player({ v, sizes }) {
  const href = useHref();
  if (v.kind === "video") {
    return <video src={href(v.src)} poster={v.poster ? href(v.poster) : undefined} title={v.title} controls preload="metadata" playsInline />;
  }
  if (v.kind === "photo") {
    return <Img im={{ cls: "act-video-photo", ...v.image }} sizes={sizes} />;
  }
  const id = ytId(v.src);
  if (id) return <YouTube id={id} src={v.src} title={v.title} allow={v.allow || ALLOW} sizes={sizes} />;
  return <iframe src={v.src} title={v.title} loading={v.loading || undefined} allow={v.allow || ALLOW} allowFullScreen />;
}

const videoFields = {
  kind: select("Kind", [{ label: "YouTube", value: "iframe" }, { label: "Video file", value: "video" }, { label: "Photo", value: "photo" }]),
  src: text("Address"),
  title: text("Title"),
  poster: text("Poster"),
  loading: select("Loading", [{ label: "Default", value: "" }, { label: "Lazy", value: "lazy" }]),
  allow: text("Allow"),
  image: { type: "object", label: "Photo", objectFields: imageFields },
};

export const VideoGrid = {
  label: "Videos",
  fields: {
    videos: { type: "array", label: "Videos", getItemSummary: (v) => v.title || v.src, arrayFields: { ...videoFields, caption: rich("Caption (playlist)") } },
    single: { type: "radio", label: "Layout", options: [{ label: "Grid", value: false }, { label: "One", value: true }] },
    playlist: { type: "radio", label: "Playlist", options: [{ label: "No", value: false }, { label: "Yes", value: true }] },
  },
  defaultProps: { videos: [], single: false, playlist: false },
  render: ({ videos, single, playlist, style }) => {
    const list = videos || [];
    // A playlist: one player and the clips listed beside it; a
    // click on a line plays that clip in the player (YT_SCRIPT in main.jsx).
    if (playlist && list.length) {
      return (
        <div className="playlist" style={css(style)}>
          <div className="playlist-stage act-video">
            <Player v={list[0]} sizes={SIZES.wrap} />
          </div>
          <ol className="playlist-list">
            {list.map((v, i) => (
              <li key={i}>
                <button type="button" className="playlist-item" data-play={v.src} data-title={v.title} aria-pressed={i === 0 ? "true" : "false"}>
                  <H as="span" className="playlist-caption" html={v.caption || v.title} />
                </button>
              </li>
            ))}
          </ol>
        </div>
      );
    }
    return (
    <div className={cx("video-grid", single && "video-grid--single")} style={css(style)}>
      {list.map((v, i) => (
        <div className="act-video" key={i}>
          <Player v={v} sizes={single ? SIZES.single : SIZES.videos(list.length)} />
        </div>
      ))}
    </div>
    );
  },
};

// The picture or the clip beside an act's heading.
export const ActVideo = {
  label: "Act video",
  fields: videoFields,
  defaultProps: { kind: "iframe", src: "", title: "" },
  render: (v) => (
    <div className="act-video" style={css(v.style)}>
      <Player v={v} sizes={SIZES.wrap} />
    </div>
  ),
};

// --------------------------------------------------------------- columns

const SLOTS = ["c1", "c2", "c3", "c4", "c5", "c6"];

export const Columns = {
  label: "Columns",
  fields: {
    cls: select("Columns", [{ label: "Two", value: "split split--two" }, { label: "Three", value: "split split--three" }]),
    n: { type: "number", label: "Boxes", min: 1, max: 6 },
    ...Object.fromEntries(SLOTS.map((k, i) => [k, { type: "slot", label: `Box ${i + 1}` }])),
  },
  defaultProps: { cls: "split split--two", n: 2, c1: [], c2: [], c3: [], c4: [], c5: [], c6: [] },
  render: (p) => {
    const count = p.n || (/three/.test(p.cls || "") ? 3 : 2);
    return (
      <div className={p.cls || "split split--two"} style={css(p.style)}>
        {SLOTS.slice(0, count).map((k, i) => {
          const Col = p[k];
          return <div key={k} style={css(p.styles && p.styles[i])}>{Col ? <Col /> : null}</div>;
        })}
      </div>
    );
  },
};

// A boxed group of blocks.
export const Panel = {
  label: "Panel",
  fields: { style: text("Width"), blocks: { type: "slot", label: "Blocks" } },
  defaultProps: { blocks: [] },
  render: ({ style, blocks: Blocks }) => <div className="panel" style={css(style)}>{Blocks ? <Blocks /> : null}</div>,
};

// ----------------------------------------------------------------- table

const cellFields = { html: rich("Text"), tag: select("Cell", [{ label: "Data", value: "" }, { label: "Header", value: "th" }, { label: "Data cell", value: "td" }]), cls: text("Class"), scope: text("Scope") };
// Price ranges: each row is a published market range drawn as a bar on one
// shared dollar scale, with its label, its market and the figures in large
// type. Each bar grows in from the left as its row scrolls into view (not
// for reduced motion, and with script off they are simply drawn). It carries
// the rate-table class, so the pricing_engaged event in analytics.js still
// fires when a reader reaches it.
const money = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("en-US");
const RANGE_SCRIPT =
  `(function(){var r=document.currentScript.parentNode;` +
  `if(matchMedia("(prefers-reduced-motion: reduce)").matches||!("IntersectionObserver" in window))return;` +
  `r.classList.add("is-armed");var o=new IntersectionObserver(function(es){es.forEach(function(e){` +
  `if(e.isIntersecting){e.target.classList.add("is-in");o.unobserve(e.target);}});},{threshold:0.6});` +
  `r.querySelectorAll(".price-range").forEach(function(x){o.observe(x);});})();`;
export const PriceRanges = {
  label: "Price ranges",
  fields: {
    caption: rich("Caption"),
    max: { type: "number", label: "Scale to ($)", min: 0 },
    rows: {
      type: "array",
      label: "Rows",
      getItemSummary: (r) => plain(r.label),
      arrayFields: { label: rich("What"), market: text("Market"), low: { type: "number", label: "From ($)", min: 0 }, high: { type: "number", label: "To ($)", min: 0 } },
    },
  },
  defaultProps: { rows: [] },
  render: ({ caption, max, rows, style }) => {
    const list = rows || [];
    const top = Number(max) || Math.ceil(Math.max(1, ...list.map((r) => Number(r.high) || 0)) / 5000) * 5000;
    const pct = (n) => `${Math.max(0, Math.min(100, ((Number(n) || 0) / top) * 100)).toFixed(2)}%`;
    const ticks = [];
    for (let t = 0; t <= top; t += 5000) ticks.push(t);
    return (
      <div className="rate-table price-ranges" style={css(style)}>
        {caption != null ? <H as="p" className="price-ranges__caption" html={caption} /> : null}
        <div className="price-ranges__axis" aria-hidden="true">
          <div className="price-ranges__ticks">
            {ticks.map((t) => (
              <span key={t} style={{ left: pct(t) }}>{t ? `$${t / 1000}k` : "$0"}</span>
            ))}
          </div>
        </div>
        <ul className="price-ranges__rows">
          {list.map((r, i) => (
            <li className="price-range" key={i} style={{ "--lo": pct(r.low), "--hi": pct(r.high), "--i": i }}>
              <div className="price-range__what">
                <H as="span" className="price-range__label" html={r.label} />
                {r.market ? <span className="price-range__market">{r.market}</span> : null}
              </div>
              <div className="price-range__track" aria-hidden="true"><span className="price-range__bar"></span></div>
              <p className="price-range__figure tnum">{money(r.low)}<span className="price-range__to"> to </span>{money(r.high)}</p>
            </li>
          ))}
        </ul>
        <script dangerouslySetInnerHTML={{ __html: RANGE_SCRIPT }} />
      </div>
    );
  },
};

export const Table = {
  label: "Rate table",
  fields: {
    caption: rich("Caption"),
    captionCls: text("Caption class"),
    provisional: { type: "radio", label: "Provisional", options: [{ label: "No", value: false }, { label: "Yes", value: true }] },
    tableCls: text("Class"),
    head: { type: "array", label: "Header", getItemSummary: (c) => plain(c.html), arrayFields: cellFields },
    rows: { type: "array", label: "Rows", getItemSummary: (r) => plain((r.cells || [])[0] && r.cells[0].html), arrayFields: { cells: { type: "array", label: "Cells", arrayFields: cellFields } } },
  },
  render: ({ caption, captionCls, head, rows, provisional, tableCls, style }) => (
    <div className="table-scroll" data-provisional={provisional ? "true" : undefined} style={css(style)}>
      <table className={tableCls || "rate-table tnum"}>
        {caption != null ? <H as="caption" className={captionCls || undefined} html={caption} /> : null}
        {head ? (
          <thead>
            <tr>
              {head.map((c, i) => <Cell key={i} c={c} tag="th" />)}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {(rows || []).map((r, i) => (
            <tr key={i}>
              {(r.cells || []).map((c, j) => <Cell key={j} c={c} tag="td" />)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
};

function Cell({ c, tag }) {
  return <H as={c.tag || tag} scope={c.scope || undefined} className={c.cls || undefined} html={c.html} />;
}

// -------------------------------------------------------- call to action

// The photo behind the closing call to action: the picture set
// on the block, else the page's own act's card, else one from site.closePhotos
// (dealt below). Each returns { src, pos } or null.
function closePhoto(s, image) {
  if (image && image.src) return { src: image.src };
  const act = pageActOf(s);
  const card = act && act.img ? { src: "/img/" + act.img } : null;
  if (card && (heroPhoto(s) || {}).src !== card.src) return card;
  return dealt(s, true);
}

// The photo behind a page's h1 heading. An act page takes the first
// photograph in its own gallery, else its card; any other page is dealt one
// from site.closePhotos.
function pageActOf(s) {
  const m = s && s.model;
  const props = s && s.page && s.page.root && s.page.root.props;
  const id = props && props.schema && props.schema.act;
  return m && id ? m.ACT_BY_ID[id] : null;
}
const slash = (src) => (src.startsWith("/") ? src : "/" + src);
// site.closePhotos is the pool
// of professional photos, listed one act at a time. The pages are dealt from
// it in URL order, so a tree's pages sit together: each page's hero is the
// next photo in the pool whose act is not on the page already and not among
// the last five pages' heroes; its close is dealt the same way from half the
// pool along, never its hero's act. An act page uses a dealt close only when
// its card is already its hero. One deal per build, kept on the model.
const deals = new WeakMap();
function dealt(s, close) {
  const m = s && s.model;
  const pool = (m && m.site && m.site.closePhotos) || [];
  if (!pool.length || !s.page) return null;
  if (!deals.has(m)) deals.set(m, deal(m, pool));
  const d = deals.get(m)[s.page.root.props.path];
  const e = d && (close ? d.close : d.hero);
  return e ? { src: slash(e.src), pos: e.pos } : null;
}
function deal(m, pool) {
  const actOf = {};
  for (const a of Object.values(m.ACT_BY_ID)) if (a.img) actOf["img/" + a.img] = a.id;
  Object.assign(actOf, (m.site && m.site.photoActs) || {});
  for (const e of pool) actOf[e.src] = e.act;
  const n = pool.length;
  const at = [0, Math.floor(n / 2)];
  const recent = [[], []];
  const out = {};
  const pick = (k, avoid) => {
    // Relax the neighbours rule, then the page's own acts, before repeating.
    for (const strict of [2, 1, 0]) {
      for (let i = 0; i < n; i++) {
        const e = pool[(at[k] + i) % n];
        if (strict > 0 && avoid.has(e.act)) continue;
        if (strict > 1 && recent[k].includes(e.act)) continue;
        at[k] = (at[k] + i + 1) % n;
        recent[k] = [...recent[k], e.act].slice(-5);
        return e;
      }
    }
    return pool[0];
  };
  for (const d of [...(m.pages || [])].sort((x, y) => (x.root.props.path < y.root.props.path ? -1 : 1))) {
    const body = JSON.stringify(d.content || []);
    const shown = new Set(Object.keys(actOf).filter((src) => body.includes(src)).map((src) => actOf[src]));
    const id = d.root.props.schema && d.root.props.schema.act;
    if (id) shown.add(id);
    const hero = pick(0, shown);
    const close = pick(1, new Set([...shown, hero.act]));
    out[d.root.props.path] = { hero, close };
  }
  return out;
}
function heroPhoto(s) {
  if (!s || !s.model || !s.page) return null;
  // A page about someone else's business (a preferred vendor) sits on their
  // photo: one of our musicians behind their name would read as their work.
  const own = s.page.root && s.page.root.props && s.page.root.props.heroImage;
  if (own) return { src: slash(own) };
  const act = pageActOf(s);
  if (act) {
    let first = null;
    const walk = (o) => {
      if (first || !o) return;
      if (Array.isArray(o)) return o.forEach(walk);
      if (typeof o === "object") {
        if (o.type === "MediaGrid" && o.props && o.props.images && o.props.images[0]) first = o.props.images[0].src;
        else Object.values(o).forEach(walk);
      }
    };
    walk(s.page.content);
    if (first) return { src: slash(first) };
    return act.img ? { src: "/img/" + act.img } : null;
  }
  return dealt(s, false);
}
const photoStyle = (href, photo) => ({ backgroundImage: `url("${href(photo.src)}")`, ...(photo.pos ? { backgroundPosition: photo.pos } : {}) });


export const CloseRow = {
  label: "Call to action",
  fields: {
    title: rich("Title"),
    lede: rich("Text"),
    buttons: buttonFields,
    boxed: { type: "radio", label: "Box", options: [{ label: "Yes", value: true }, { label: "No", value: false }] },
    boxStyle: text("Width"),
    titleStyle: text("Title style"),
    titleCls: text("Title size"),
    ledeStyle: text("Text style"),
    image: { type: "object", label: "Picture", objectFields: imageFields },
  },
  defaultProps: { boxed: true, boxStyle: "max-width: 32rem;", title: "Title", lede: "Text", buttons: [{ label: "Check a Date", href: "/contact/", cls: "btn" }] },
  render: function CloseRowRender(p) {
    const s = useSite();
    const href = useHref();
    const photo = closePhoto(s, p.image);
    const words = (
      <>
        <H as="h2" className={p.titleCls || "h2"} style={css(p.titleStyle)} html={p.title} />
        {p.lede != null ? <H as="p" className="lede" style={css(p.ledeStyle)} html={p.lede} /> : null}
      </>
    );
    return (
      <div className={photo ? "close-row close-row--photo" : "close-row"}>
        {photo ? <div className="close-photo" aria-hidden="true" style={photoStyle(href, photo)} /> : null}
        {p.boxed ? <div style={css(p.boxStyle)}>{words}</div> : words}
        <Buttons items={p.buttons || []} />
      </div>
    );
  },
};

// ------------------------------------------------------- acts and dates

// An act's card, in the act card layout's parts and order.
const CARD_BODY = ["kind", "name", "face", "tags", "blurb", "sizes", "link"];
function ActCard({ a, compact }) {
  const s = useSite();
  const m = s.model;
  const L = m.L.card;
  const flagship = a.status === "flagship";
  const href = useHref();
  const tagLabels = L.tags === "occasions"
    ? (a.occasion_tags || []).map((t) => (m.roster.occasions || []).find((o) => o.id === t)).filter(Boolean).map((o) => [o.id, o.label])
    : L.tags === "none"
      ? []
      : (a.bucket_tags || []).filter((b) => m.BUCKET_LABEL[b]).map((b) => [b, m.BUCKET_LABEL[b]]);
  const part = {
    kind: () => <p key="kind" className="act-kind">{a.style}</p>,
    name: () => <h3 key="name" className="act-name">{a.name}</h3>,
    face: () => <p key="face" className="act-face">{m.actByline(a)}</p>,
    tags: () => (
      <ul key="tags" className="pill-row">
        {tagLabels.map(([id, label]) => <li key={id} className="pill">{label}</li>)}
      </ul>
    ),
    blurb: () => <p key="blurb" className="act-blurb">{compact || L.blurb === "short" ? m.actCardLine(a) : a.blurb}</p>,
    sizes: () => (
      <dl key="sizes" className="act-facts">
        <dt>Configurations</dt>
        <dd>{m.actConfigRange(a)}</dd>
      </dl>
    ),
    link: () =>
      flagship || a.page ? (
        <a key="link" className="act-card-link" href={m.actUrl(a, s.prefix)}>{String(L.link || "See {name}").replace(/\{name\}/g, a.name)}</a>
      ) : (
        <a key="link" className="act-card-link" href={href(`/contact/?act=${a.id}`)}>Inquire</a>
      ),
  };
  return (
    <article
      className={compact ? "card act-card act-card--compact" : "card act-card"}
      id={`act-${a.id}`}
      data-lane={m.actLane(a)}
      data-buckets={(a.bucket_tags || []).join(" ")}
      data-configs={(a.config_tags || []).join(" ")}
      data-genres={(a.genre_tags || []).join(" ")}
      data-vocals={m.VOCALS_MATCH[a.vocals || "instrumental"]}
      data-areas={m.actAreaIds(a).join(" ")}
      data-occasions={(a.occasion_tags || []).join(" ")}
      data-status={a.status}
      data-name={a.name}
    >
      {runs(L, CARD_BODY).map((r, i) =>
        r.group ? (
          <div key={i} className="act-card-body">{r.ids.map((id) => part[id]())}</div>
        ) : compact ? null : (
          <CardMedia key={i} a={a} ratio={L.ratio} />
        )
      )}
    </article>
  );
}

function CardMedia({ a, ratio }) {
  const href = useHref();
  const st = ratioStyle(ratio);
  if (a.video) {
    if (/^https?:\/\//.test(a.video)) {
      return (
        <div className="act-card-video" style={css(st)}>
          {ytId(a.video) ? (
            <YouTube id={ytId(a.video)} src={a.video} title={`${a.name} performing`} allow={ALLOW} sizes={SIZES.card} />
          ) : (
            <iframe src={a.video} title={`${a.name} performing`} loading="lazy" allow={ALLOW} allowFullScreen />
          )}
        </div>
      );
    }
    return (
      <div className="act-card-video" style={css(st)}>
        <video src={href("/" + a.video)} poster={a.video_poster ? href("/" + a.video_poster) : undefined} title={`${a.name} performing`} controls preload="metadata" playsInline />
      </div>
    );
  }
  if (!a.img) return null;
  return <Pic class="act-card-img" src={href(`/img/${a.img}`)} alt={a.alt} width="1600" height="900" loading="lazy" decoding="async" style={st} sizes={SIZES.card} />;
}

// The roster page's card: the act's photograph carries
// it, with the kind and the name over the foot of the photo; under it the
// size, the tags and one line. The whole card is the link. It keeps the act
// card's class and data so acts.js filters it as before. The photo carries no
// description: the act's name is over it inside the same link, and the card
// photo is often a crop of a photo the act's page describes in the same words.
function RosterCard({ a }) {
  const s = useSite();
  const m = s.model;
  const href = useHref();
  const named = m.actLane(a) === "named";
  const url = a.status === "flagship" || a.page ? m.actUrl(a, s.prefix) : href(`/contact/?act=${a.id}`);
  return (
    <article
      className="act-card act-card--roster"
      id={`act-${a.id}`}
      data-lane={m.actLane(a)}
      data-buckets={(a.bucket_tags || []).join(" ")}
      data-configs={(a.config_tags || []).join(" ")}
      data-genres={(a.genre_tags || []).join(" ")}
      data-vocals={m.VOCALS_MATCH[a.vocals || "instrumental"]}
      data-areas={m.actAreaIds(a).join(" ")}
      data-occasions={(a.occasion_tags || []).join(" ")}
      data-status={a.status}
      data-name={a.name}
    >
      <a className="roster-card-link" href={url}>
        <div className="roster-card-photo">
          {a.img ? <Pic src={href(`/img/${a.img}`)} alt="" width="1600" height="1200" loading="lazy" decoding="async" sizes={SIZES.roster} /> : null}
          <div className="roster-card-over">
            <p className="act-kind">{a.style}</p>
            <h3 className="roster-card-name">{a.name}</h3>
          </div>
        </div>
        <div className="roster-card-meta">
          <span className="roster-card-size">{m.actConfigRange(a)}</span>
          <ul className="pill-row">
            {(a.bucket_tags || []).filter((b) => m.BUCKET_LABEL[b]).map((b) => <li key={b} className="pill">{m.BUCKET_LABEL[b]}</li>)}
          </ul>
        </div>
        <p className="roster-card-line">{named ? m.actCardLine(a) : m.actByline(a) || m.actCardLine(a)}</p>
      </a>
    </article>
  );
}

export function RosterGrid({ acts, id }) {
  return (
    <div className="roster-grid roster-grid--photo" id={id}>
      {acts.map((a) => <RosterCard key={a.id} a={a} />)}
    </div>
  );
}

// A photo card: the act's photograph with the kind and the name over its foot,
// and nothing under it; the whole card links to the act. An act with a `loop`
// (a short silent clip under media/loops/) plays it over the photo while the
// card is on screen. The video is written as raw HTML because React's server
// render drops the muted attribute, and a browser only autoplays a muted video.
function PhotoCard({ a, kicker }) {
  const s = useSite();
  const m = s.model;
  const href = useHref();
  const url = a.status === "flagship" || a.page ? m.actUrl(a, s.prefix) : href(`/contact/?act=${a.id}`);
  return (
    <article className="act-card act-card--roster act-card--photo" id={`act-${a.id}`} data-name={a.name}>
      <a className="roster-card-link" href={url}>
        <div className="roster-card-photo">
          {a.img ? <Pic src={href(`/img/${a.img}`)} alt="" width="1600" height="1200" loading="lazy" decoding="async" sizes={SIZES.roster} /> : null}
          {a.loop ? (
            <div
              className="photo-card-loop"
              dangerouslySetInnerHTML={{ __html: `<video data-src="${href("/" + a.loop)}" muted loop playsinline preload="none" aria-hidden="true" tabindex="-1"></video>` }}
            />
          ) : null}
          <div className="roster-card-over">
            <p className="act-kind">{kicker || a.style}</p>
            <h3 className="roster-card-name">{a.name}</h3>
          </div>
        </div>
      </a>
    </article>
  );
}

// Plays each card's loop while it is on screen and pauses it off screen. Loads
// nothing for data saver or reduced motion, which keep the photos still.
const LOOP_SCRIPT =
  `(function(){var g=document.currentScript.previousElementSibling,c=navigator.connection;` +
  `if((c&&c.saveData)||matchMedia("(prefers-reduced-motion: reduce)").matches||!("IntersectionObserver" in window))return;` +
  `var o=new IntersectionObserver(function(es){es.forEach(function(e){var v=e.target;` +
  `if(e.isIntersecting){if(!v.src){v.src=v.dataset.src;v.addEventListener("playing",function(){v.parentNode.classList.add("is-playing");});}` +
  `var p=v.play();p&&p.catch&&p.catch(function(){});}else if(v.src){v.pause();}});},{rootMargin:"150px 0px"});` +
  `g.querySelectorAll(".photo-card-loop video").forEach(function(v){o.observe(v);});})();`;

export function PhotoGrid({ acts, id, style, kickers }) {
  const looping = acts.some((a) => a.loop);
  return (
    <>
      <div className="roster-grid roster-grid--photo" id={id} style={css(style)}>
        {acts.map((a) => <PhotoCard key={a.id} a={a} kicker={kickers && kickers[a.id]} />)}
      </div>
      {looping ? <script dangerouslySetInnerHTML={{ __html: LOOP_SCRIPT }} /> : null}
    </>
  );
}

export function CardGrid({ acts, compact, id, cls = "card-grid card-grid--3", style }) {
  return (
    <div className={cls} id={id} style={css(style)}>
      {acts.map((a) => <ActCard key={a.id} a={a} compact={compact} />)}
    </div>
  );
}

// Act cards: the flagships, the acts for an occasion or a kind of night,
// acts chosen by hand, or a short list of picks with a line on why each one
// suits the night.
export const CARD_SOURCES = [
  { label: "Flagships", value: "flagships" },
  { label: "Occasion", value: "occasion" },
  { label: "Kind of night", value: "night" },
  { label: "Chosen acts", value: "acts" },
  { label: "Picks", value: "picks" },
];
export const Cards = {
  label: "Act cards",
  fields: {
    source: select("Acts", CARD_SOURCES),
    occasion: text("Occasion"),
    night: text("Kind of night"),
    acts: { type: "array", label: "Acts", getItemSummary: (p) => p.act, arrayFields: { act: text("Act"), kicker: text("Line over the name (Photos only; blank: the act's style)") } },
    compact: { type: "radio", label: "Cards", options: [{ label: "Full", value: false }, { label: "Short", value: true }] },
    look: { type: "radio", label: "Look", options: [{ label: "Cards", value: "cards" }, { label: "Photos", value: "photos" }] },
    picks: {
      type: "array",
      label: "Picks",
      getItemSummary: (p) => p.act,
      arrayFields: { act: text("Act"), config: text("Size"), kicker: text("Kicker"), why: { type: "textarea", label: "Why" }, face: select("Second line", [{ label: "Size", value: "config" }, { label: "Style", value: "style" }]) },
    },
  },
  defaultProps: { source: "flagships", picks: [] },
  render: function CardsRender({ source, picks, occasion, night, acts, compact, look, style }) {
    const s = useSite();
    const m = s.model;
    const href = useHref();
    if (source !== "picks" && look === "photos") {
      const kickers = Object.fromEntries((acts || []).filter((x) => x && x.act && x.kicker).map((x) => [x.act, x.kicker]));
      return <PhotoGrid acts={m.actsWhere({ source, occasion, night, acts })} style={style} kickers={kickers} />;
    }
    if (source !== "picks") return <CardGrid acts={m.actsWhere({ source, occasion, night, acts })} compact={!!compact} style={style} />;
    return (
      <div className="card-grid card-grid--3" style={css(style)}>
        {(picks || []).map((p, i) => {
          const a = m.ACT_BY_ID[p.act];
          const r = m.RATE_BY_ID[p.config];
          return (
            <article className="card" key={i}>
              <p className="act-kind">{p.kicker}</p>
              <h3 className="act-name">{a.name}</h3>
              <p className="act-face">{`${p.face === "style" ? a.style : r.label}. ${m.actByline(a)}.`}</p>
              <p className="act-blurb">{p.why}</p>
              <dl className="act-facts">
                <dt>Configuration</dt>
                <dd>{`${r.label}, ${r.pieces} ${r.pieces === 1 ? "musician" : "musicians"}`}</dd>
              </dl>
              <a className="act-card-link" href={href(`/contact/?act=${a.id}`)}>Check a date</a>
            </article>
          );
        })}
      </div>
    );
  },
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The season's dates, peak dates marked, and the count under them.
export const Season = {
  label: "Season board",
  fields: {
    dates: { type: "array", label: "Dates", getItemSummary: (d) => d.date, arrayFields: { date: text("Date"), peak: { type: "radio", label: "Peak", options: [{ label: "No", value: false }, { label: "Yes", value: true }] }, note: text("Tag") } },
  },
  defaultProps: { dates: [] },
  render: ({ dates, style }) => (
    <>
      <ul className="season-board" style={css(style)}>
        {(dates || []).map((d, i) => {
          const [y, mo, da] = d.date.split("-").map(Number);
          const dt = new Date(Date.UTC(y, mo - 1, da));
          const label = `${DAYS[dt.getUTCDay()]} ${MON[dt.getUTCMonth()]} ${dt.getUTCDate()}`;
          return (
            <li key={i} className={cx("season-date", d.peak && "season-date--peak")}>
              <span className="season-day">{label}</span>
              <span className="season-tag">{d.note ? d.note : d.peak ? "Peak date" : "Standard date"}</span>
            </li>
          );
        })}
      </ul>
      <p className="note">
        <strong className="num-accent">{String((dates || []).length)}</strong>
        {" party dates: Thursdays, Fridays and Saturdays across November and December, plus New Year's Eve. A peak date and a Thursday in November aren't the same job, and New Year's Eve is its own case. Send the date and we price that night."}
      </p>
    </>
  ),
};

// The technical page's stage drawing: the rental guide's footprint and a
// quartet's, to the same scale.
export const StagePlot = {
  label: "Stage drawing",
  fields: { guide: { type: "number", label: "Guide (ft)" }, width: { type: "number", label: "Width (ft)" }, depth: { type: "number", label: "Depth (ft)" } },
  defaultProps: { guide: 24, width: 14, depth: 10 },
  render: ({ guide, width: w, depth: d, style }) => {
    const U = 20;
    const gw = guide * U;
    const aw = w * U;
    const ad = d * U;
    const ax = (gw - aw) / 2;
    const ay = gw - ad;
    const saved = guide * guide - w * d;
    const f = (x) => (Number.isInteger(x) ? `${x}.0` : String(x));
    const pct = Math.round(100 * (1 - (w * d) / (guide * guide)));
    const html = `<figure class="stage-plot">
<svg viewBox="-8 -8 ${gw + 16} ${gw + 16}" role="img"
     aria-label="Two stage footprints at the same scale. Published rental
     guidance is ${guide} by ${guide} feet. A quartet takes ${w} by ${d} feet,
     about ${pct} percent less floor.">
  <rect x="0" y="0" width="${gw}" height="${gw}" class="plot-guide"/>
  <rect x="${f(ax)}" y="${ay}" width="${aw}" height="${ad}" class="plot-actual"/>
  <text x="${f(gw / 2)}" y="${f(ay / 2)}" class="plot-label" text-anchor="middle">
    ${guide} &#215; ${guide} ft
  </text>
  <text x="${f(gw / 2)}" y="${f(ay / 2 + 26)}" class="plot-sub" text-anchor="middle">
    what the rental guide says
  </text>
  <text x="${f(gw / 2)}" y="${f(ay + ad / 2 - 4)}" class="plot-label" text-anchor="middle">
    ${w} &#215; ${d} ft
  </text>
  <text x="${f(gw / 2)}" y="${f(ay + ad / 2 + 22)}" class="plot-sub" text-anchor="middle">
    what a quartet takes
  </text>
</svg>
<figcaption class="note">Both drawn to the same scale. The difference is
${saved} square feet of floor, which is a few hundred dollars of riser and about
${Math.round(saved / 10)} guests standing.</figcaption>
</figure>`;
    return <Boxed style={style}><Raw html={html} /></Boxed>;
  },
};

// A run of markup the other blocks don't cover, kept exactly as written.
export const HtmlBlock = {
  label: "HTML",
  fields: { html: { type: "textarea", label: "HTML" } },
  defaultProps: { html: "" },
  render: ({ html, style }) => <Boxed style={style}><Raw html={html} /></Boxed>,
};

export const blockComponents = { Heading, Paragraph, Title, Quote, Picture, ButtonRow, List, SpecList, DefRows, Faq, MediaGrid, VideoGrid, ActVideo, Columns, Panel, PriceRanges, Table, CloseRow, Cards, Season, StagePlot, HtmlBlock };
