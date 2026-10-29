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
  render: (p) => (
    <div className="heading" style={css(p.headingStyle)}>
      {p.eyebrow != null ? <H as="p" className={cx("eyebrow", p.slab && "eyebrow--slab")} html={p.eyebrow} /> : null}
      {p.title != null ? <H as={p.titleTag || "h2"} className={p.titleClass || "h2"} style={css(p.titleStyle)} html={p.title} /> : null}
      {p.face != null ? <H as="p" className="act-face" html={p.face} /> : null}
      {p.imageFirst ? <Img im={p.image} /> : null}
      {p.lede != null ? <H as="p" className="lede" style={css(p.ledeStyle)} html={p.lede} /> : null}
      {(p.headingText || []).map((t, i) => (
        <H key={i} as="p" className={t.cls || "prose"} style={css(t.style)} html={t.html} />
      ))}
      {p.imageFirst ? null : <Img im={p.image} />}
      <Buttons items={p.buttons} />
      {p.headingNote != null ? <H as="p" className="note" html={p.headingNote} /> : null}
    </div>
  ),
};

export const Paragraph = {
  label: "Paragraph",
  fields: { html: rich("Text"), cls: select("Style", [{ label: "Text", value: "prose" }, { label: "Note", value: "note" }, { label: "Small note", value: "note note--small" }, { label: "Lede", value: "lede" }]), style: text("Style") },
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
  },
  defaultProps: { source: "own", items: [{ html: "Item" }], cols: false },
  render: function SpecListRender({ source, items, cols, style }) {
    const s = useSite();
    const DASH = '<span class="dash" aria-hidden="true"></span>';
    const list = source && source !== "own" ? s.model.site.lists[source].map((t) => DASH + esc(t)) : (items || []).map((it) => (typeof it.html === "string" ? DASH + it.html : it.html));
    // Copy being edited on the canvas is an editor, not a string: the dash goes before it.
    return (
      <ul className={cx("spec-list", cols && "spec-list--cols")} style={css(style)}>
        {list.map((h, i) => (typeof h === "string" ? <H key={i} as="li" html={h} /> : <li key={i}><span className="dash" aria-hidden="true"></span>{h}</li>))}
      </ul>
    );
  },
};

// ------------------------------------------------------------------ rows

export const DefRows = {
  label: "Rows",
  fields: {
    rows: {
      type: "array",
      label: "Rows",
      getItemSummary: (r) => plain(r.term),
      arrayFields: { term: rich("Label"), text: rich("Text"), termStyle: text("Label style"), textStyle: text("Text style"), textCls: text("Text class") },
    },
    cls: select("Layout", [{ label: "Stacked", value: "def-list def-list--stack" }, { label: "Side by side", value: "def-list" }]),
    bare: { type: "radio", label: "Row boxes", options: [{ label: "Yes", value: false }, { label: "No", value: true }] },
    style: text("Style"),
  },
  defaultProps: { cls: "def-list def-list--stack", rows: [{ term: "Label", text: "Text" }] },
  render: ({ cls, style, bare, rows }) => (
    <dl className={cls || "def-list def-list--stack"} style={css(style)}>
      {(rows || []).map((r, i) => {
        const dt = <H as="dt" style={css(r.termStyle)} html={r.term} />;
        const dd = <H as="dd" className={r.textCls || undefined} style={css(r.textStyle)} html={r.text} />;
        return bare ? (
          <Fragment key={i}>{dt}{dd}</Fragment>
        ) : (
          <div className="def-row" key={i}>{dt}{dd}</div>
        );
      })}
    </dl>
  ),
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
  render: ({ items, style }) => (
    <dl className="faq-list" style={css(style)}>
      {(items || []).map((f, i) => (
        <div className="faq-row" key={i}>
          <H as="dt" html={f.q} />
          {f.open ? (
            <dd><H as="span" data-tbd="true" html={f.a} /></dd>
          ) : (
            <H as="dd" html={f.a} />
          )}
        </div>
      ))}
    </dl>
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
  fields: { videos: { type: "array", label: "Videos", getItemSummary: (v) => v.title || v.src, arrayFields: videoFields }, single: { type: "radio", label: "Layout", options: [{ label: "Grid", value: false }, { label: "One", value: true }] } },
  defaultProps: { videos: [], single: false },
  render: ({ videos, single, style }) => (
    <div className={cx("video-grid", single && "video-grid--single")} style={css(style)}>
      {(videos || []).map((v, i) => (
        <div className="act-video" key={i}>
          <Player v={v} sizes={single ? SIZES.single : SIZES.videos((videos || []).length)} />
        </div>
      ))}
    </div>
  ),
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
  render: (p) => {
    const words = (
      <>
        <H as="h2" className={p.titleCls || "h2"} style={css(p.titleStyle)} html={p.title} />
        {p.lede != null ? <H as="p" className="lede" style={css(p.ledeStyle)} html={p.lede} /> : null}
        <Img im={p.image} />
      </>
    );
    return (
      <div className="close-row">
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
    acts: { type: "array", label: "Acts", getItemSummary: (p) => p.act, arrayFields: { act: text("Act") } },
    compact: { type: "radio", label: "Cards", options: [{ label: "Full", value: false }, { label: "Short", value: true }] },
    picks: {
      type: "array",
      label: "Picks",
      getItemSummary: (p) => p.act,
      arrayFields: { act: text("Act"), config: text("Size"), kicker: text("Kicker"), why: { type: "textarea", label: "Why" }, face: select("Second line", [{ label: "Size", value: "config" }, { label: "Style", value: "style" }]) },
    },
  },
  defaultProps: { source: "flagships", picks: [] },
  render: function CardsRender({ source, picks, occasion, night, acts, compact, style }) {
    const s = useSite();
    const m = s.model;
    const href = useHref();
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

export const blockComponents = { Heading, Paragraph, Title, Quote, Picture, ButtonRow, List, SpecList, DefRows, Faq, MediaGrid, VideoGrid, ActVideo, Columns, Panel, Table, CloseRow, Cards, Season, StagePlot, HtmlBlock };
