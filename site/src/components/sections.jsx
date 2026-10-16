/* Signet's section types. Most are a band holding a list of blocks; their
   names say what the section is for (Rows, Questions, Images) and decide
   what a new one starts with. The rest have one fixed shape: the logo strip,
   the hub lists, the home hero, the cover walls, the act lists. */
import { Fragment } from "react";
import { css, cx, esc } from "../lib/util.js";
import { bandClass, Buttons, buttonFields, F, H, headingFields, Img, imageFields, Pic, Raw, shellFields, useHref, useSite } from "./parts.jsx";
import { ALLOW, CardGrid, CloseRow } from "./blocks.jsx";

const { rich, text } = F;
const plain = (s) => (typeof s === "string" ? s.replace(/<[^>]+>/g, "").slice(0, 48) : "");

// ------------------------------------------------------- block sections

function Standard({ band, cls, anchor, label, narrow, wrapStyle, blocks: Blocks }) {
  return (
    <section className={cx(bandClass(band), cls)} id={anchor || undefined} aria-label={label || undefined}>
      <div className={cx("wrap", narrow && "wrap--narrow")} style={css(wrapStyle)}>
        {Blocks ? <Blocks /> : null}
      </div>
    </section>
  );
}

let n = 0;
const block = (type, props = {}) => ({ type, props: { id: `${type}-new-${++n}`, ...props } });
const heading = (extra) => block("Heading", { eyebrow: "Eyebrow", title: "Title", titleTag: "h2", titleClass: "h2", ...extra });

const standard = (label, band, blocks) => ({
  label,
  fields: { ...shellFields, blocks: { type: "slot", label: "Blocks" } },
  defaultProps: { band, blocks },
  render: Standard,
});

export const blockSections = {
  Intro: standard("Heading", "top", [heading({ slab: true, titleTag: "h1", titleClass: "h2 display", lede: "Lede" })]),
  ActHero: { ...standard("Act hero", "top", [heading({ slab: true, titleTag: "h1", titleClass: "h1 display", face: "Fronted by", lede: "Lede" }), block("ActVideo")]), defaultProps: { band: "top", cls: "act-hero", blocks: [] } },
  Text: standard("Text", "ruled", [block("Title", { html: "Title", tag: "h2", cls: "h3" }), block("Paragraph", { html: "Text", cls: "prose" })]),
  Rows: standard("Rows", "sunk", [heading(), block("DefRows")]),
  Questions: standard("Questions", "ruled", [block("Title", { html: "Questions", tag: "h2", cls: "h3" }), block("Faq")]),
  Images: standard("Images", "sunk", [heading(), block("MediaGrid")]),
  Videos: standard("Videos", "sunk", [heading(), block("VideoGrid")]),
  TwoColumns: standard("Two columns", "ruled", [heading(), block("Columns")]),
  Specs: standard("Spec list", "ruled", [block("Title", { html: "Title", tag: "h2", cls: "h3" }), block("SpecList")]),
  RateTable: standard("Rate table", "ruled", [block("Title", { html: "Title", tag: "h2", cls: "h3" }), block("Table")]),
  ActCards: standard("Act cards", "ruled", [heading(), block("Cards")]),
  SeasonBoard: standard("Season board", "sunk", [heading(), block("Season")]),
  CallToAction: standard("Call to action", "ruled", [block("CloseRow")]),
  BlogList: standard("Blog list", "ruled", [block("BlogPosts")]),
  AllPages: standard("All pages", "top", [heading(), block("PageIndex")]),
};

// ------------------------------------------------------------ fixed parts

// The client logos, one strip shared by every page that shows it.
const LogoStrip = {
  label: "Logo strip",
  fields: { band: shellFields.band, label: shellFields.label, showAlso: { type: "radio", label: "Line under", options: [{ label: "No", value: false }, { label: "Yes", value: true }] }, blocks: { type: "slot", label: "After" } },
  defaultProps: { band: "ruled", label: "Trusted and booked by", showAlso: false, blocks: [] },
  render: function LogoStripRender({ band, label, showAlso, blocks: Blocks }) {
    const s = useSite();
    const c = s.model.c.logoStrip;
    return (
      <section className={cx(bandClass(band), "credits")} aria-label={label || undefined}>
        <div className="wrap">
          <p className="eyebrow">{c.label}</p>
          <ul className="credits-list" aria-label={c.label}>
            {c.logos.map((l) => {
              const svg = s.model.c.logoSvg(l.id).replace("<svg ", `<svg role="img" aria-label="${esc(l.name)}" focusable="false" `);
              return <li key={l.id} className="credit" style={{ "--credit-h": String(l.h ?? 1) }} dangerouslySetInnerHTML={{ __html: svg }} />;
            })}
          </ul>
          {showAlso ? <p className="note credits-also">{c.also}</p> : null}
          {Blocks ? <Blocks /> : null}
        </div>
      </section>
    );
  },
};

// A hub's list of everything under it: its groups of pages, anything not
// yet grouped, then the posts filed under it. Labels come from each page.
const PagesAndPosts = {
  label: "Pages and posts",
  fields: {
    band: shellFields.band,
    heading: text("Heading"),
    groups: {
      type: "array",
      label: "Groups",
      getItemSummary: (g) => g.label,
      arrayFields: { label: text("Label"), pages: { type: "array", label: "Pages", getItemSummary: (p) => p.path, arrayFields: { path: text("Page"), label: text("Label") } } },
    },
  },
  defaultProps: { band: "ruled", heading: "All pages", groups: [] },
  render: function PagesAndPostsRender({ band, heading, groups }) {
    const s = useSite();
    const href = useHref();
    const url = s.url;
    const { rows, posts } = s.model.hubIndex(url, groups || []);
    return (
      <section className={cx(bandClass(band), "hub-index-band")}>
        <div className="wrap">
          <nav className="hub-index" aria-label={heading}>
            <p className="eyebrow">{heading}</p>
            <dl className="hub-index-list">
              {rows.map(([label, links], i) => (
                <div className="hub-index-row" key={i}>
                  <dt>{label}</dt>
                  <dd>
                    <ul className="sibling-list">
                      {links.map(([u, t], j) => <li key={j}><a href={href(u)}>{t}</a></li>)}
                    </ul>
                  </dd>
                </div>
              ))}
              {posts ? (
                <div className="hub-index-row">
                  <dt>Articles</dt>
                  <dd>
                    <ul className="index-list">
                      {posts.map((p) => <li key={p.slug}><a href={href(`/blog/${p.slug}/`)}>{p.title}</a></li>)}
                    </ul>
                  </dd>
                </div>
              ) : null}
            </dl>
          </nav>
        </div>
      </section>
    );
  },
};

const HomeHero = {
  label: "Home hero",
  fields: {
    label: shellFields.label,
    title: rich("Title"),
    titleStyle: text("Title style"),
    lede: rich("Lede"),
    ledeStyle: text("Lede style"),
    buttons: buttonFields,
    frames: { type: "array", label: "Pictures", getItemSummary: (i) => (i.src || "").split("/").pop(), arrayFields: imageFields },
    framesHidden: text("Hidden"),
  },
  render: ({ label, frames, framesHidden, title, titleStyle, lede, ledeStyle, buttons }) => (
    <section className="hero-cine" aria-label={label || undefined}>
      <div className="hero-cine__frames" aria-hidden={framesHidden || "false"}>
        {(frames || []).map((im, i) => (
          <Fragment key={i}>
            {i ? " " : null}
            <Img im={{ cls: "hero-cine__frame", ...im }} />
          </Fragment>
        ))}
      </div>
      <div className="hero-cine__scrim" aria-hidden="true"></div>
      <div className="wrap hero-cine__copy">
        <H as="h1" className="h1 display" style={css(titleStyle)} html={title} />
        <H as="p" className="hero-lede" style={css(ledeStyle)} html={lede} />
        <Buttons items={buttons || []} />
      </div>
    </section>
  ),
};

const RangeStrip = {
  label: "Range strip",
  fields: { label: shellFields.label, image: { type: "object", label: "Picture", objectFields: imageFields } },
  render: ({ label, image }) => (
    <section className="range-strip" aria-label={label || undefined}>
      <Img im={image} />
    </section>
  ),
};

// A run of album sleeves under a note.
const CoverStrip = {
  label: "Cover strip",
  fields: { tiles: { type: "array", label: "Sleeves", getItemSummary: (t) => t.alt, arrayFields: { src: text("File"), alt: text("Alt text") } }, note: rich("Note") },
  render: function CoverStripRender({ tiles, note }) {
    const href = useHref();
    return (
      <section className="section--night cover-strip">
        <div className="cover-strip-inner">
          {(tiles || []).map((t, i) => <Pic key={i} src={href(t.src)} alt={t.alt} loading="lazy" decoding="async" width="300" height="300" />)}
        </div>
        <div className="wrap">
          <H as="p" className="cover-strip-note" html={note} />
        </div>
      </section>
    );
  },
};

// A wall of sleeves with the words set among them.
const CoverWall = {
  label: "Cover wall",
  fields: {
    eyebrow: rich("Eyebrow"),
    title: rich("Title"),
    text: rich("Text"),
    tiles: { type: "array", label: "Sleeves", getItemSummary: (t) => plain(t.song), arrayFields: { src: text("File"), alt: text("Alt text"), song: rich("Song"), credit: rich("Credit"), style: text("Place"), loading: imageFields.loading, decoding: imageFields.decoding } },
    notes: rich("Notes"),
    textAt: { type: "number", label: "Words at", min: 0 },
    titleStyle: text("Title style"),
    textStyle: text("Text style"),
    flip: { type: "radio", label: "Side", options: [{ label: "Words left", value: false }, { label: "Words right", value: true }] },
  },
  render: function CoverWallRender({ flip, eyebrow, title, titleStyle, text: body, textStyle, textAt, tiles, notes }) {
    const href = useHref();
    const words = (
      <div className="wall-text" key="words">
        <H as="span" className="eyebrow" html={eyebrow} />
        <H as="h2" className="h2" style={css(titleStyle)} html={title} />
        <H as="p" className="prose" style={css(textStyle)} html={body} />
      </div>
    );
    const figs = (tiles || []).map((t, i) => (
      <figure className="wall-tile" style={css(t.style)} key={i}>
        <Pic src={href(t.src)} alt={t.alt} loading={t.loading || undefined} decoding={t.decoding || undefined} />
        <figcaption>
          <H as="span" className="wall-song" html={t.song} />
          <H as="span" className="wall-credit" html={t.credit} />
        </figcaption>
      </figure>
    ));
    const at = textAt || 0;
    return (
      <section className={cx("section--night cover-wall", flip && "cover-wall--flip")}>
        <div className="wall-grid">
          {[...figs.slice(0, at), words, ...figs.slice(at)]}
        </div>
        <div className="wrap">
          <H as="p" className="wall-notes" html={notes} />
        </div>
      </section>
    );
  },
};

// ------------------------------------------------------------ act parts

// The act a part draws from: the one it names, else the page's own act.
const actFor = (s, act) => (act ? s.model.ACT_BY_ID[act] : s.model.pageAct(s.page)) || null;

// The top of an act page, from the act's file: style, name, byline,
// description, the button to the contact form, and the footage or photo.
const ActHeader = {
  label: "Act header",
  fields: { act: text("Act"), button: text("Button") },
  render: function ActHeaderRender({ act, button }) {
    const s = useSite();
    const href = useHref();
    const m = s.model;
    const a = actFor(s, act);
    if (!a) return null;
    const face = [m.actByline(a), a.material].filter(Boolean).map((x) => x.replace(/[.\s]+$/, "") + ".").join(" ");
    let media = null;
    if (a.video && /^https?:\/\//.test(a.video)) media = <iframe src={a.video} title={`${a.name} performing`} loading="lazy" allow={ALLOW} allowFullScreen />;
    else if (a.video) media = <video src={href("/" + a.video)} poster={a.video_poster ? href("/" + a.video_poster) : undefined} title={`${a.name} performing`} controls preload="metadata" playsInline />;
    else if (a.img) media = <Pic class="act-video-photo" src={href("/img/" + a.img)} alt={a.alt || ""} decoding="async" />;
    return (
      <section className="section section--top act-hero">
        <div className="wrap">
          <div className="heading">
            {a.style ? <p className="eyebrow eyebrow--slab">{a.style}</p> : null}
            <h1 className="h1 display">{a.name}</h1>
            {face ? <p className="act-face">{face}</p> : null}
            {a.blurb ? <p className="lede">{a.blurb}</p> : null}
            <div className="btn-row">
              <a className="btn" href={href(`/contact/?act=${a.id}`)}>{button || "Check a date"}</a>
            </div>
          </div>
          {media ? <div className="act-video">{media}</div> : null}
        </div>
      </section>
    );
  },
};

// The act's About paragraphs.
const ActAbout = {
  label: "Act about",
  fields: { act: text("Act"), band: shellFields.band },
  render: function ActAboutRender({ act, band }) {
    const s = useSite();
    const a = actFor(s, act);
    const paras = (a && a.identity) || [];
    if (!paras.length) return null;
    return (
      <section className={bandClass(band || "ruled")}>
        <div className="wrap wrap--narrow">
          {paras.map((t, i) => <p key={i} className="prose">{t}</p>)}
        </div>
      </section>
    );
  },
};

// The close of an act page: {name} in the title is the act's name, and the
// button opens the contact form with the act chosen.
const ActClose = {
  label: "Act close",
  fields: { act: text("Act"), band: shellFields.band, title: rich("Title"), lede: rich("Lede"), button: text("Button") },
  render: function ActCloseRender({ act, band, title, lede, button }) {
    const s = useSite();
    const a = actFor(s, act);
    if (!a) return null;
    const R = CloseRow.render;
    const t = typeof title === "string" ? title.replace(/\{name\}/g, esc(a.name)) : title;
    return (
      <section className={bandClass(band || "ruled")}>
        <div className="wrap">
          <R boxed boxStyle="max-width: 32rem;" title={t} lede={lede} buttons={[{ label: button || "Check a date", href: `/contact/?act=${a.id}`, cls: "btn" }]} />
        </div>
      </section>
    );
  },
};

// Where an act's own sections go in the act page layout. The build puts
// them in its place; the layout editor shows where.
const ActOwn = {
  label: "Own sections",
  fields: {},
  render: function ActOwnRender() {
    const s = useSite();
    if (!s || s.raw) return null;
    return (
      <section className="section section--ruled act-own">
        <div className="wrap">
          <p className="note">Own sections</p>
        </div>
      </section>
    );
  },
};

// An act's sizes: what each one is and what it suits, from the act's file.
const ActSizes = {
  label: "Act sizes",
  fields: { act: text("Act"), title: rich("Title"), note: rich("Note") },
  render: function ActSizesRender({ act, title, note }) {
    const s = useSite();
    const m = s.model;
    const a = actFor(s, act);
    if (!a || !(a.ladder || []).length) return null;
    return (
      <section className="section section--ruled section--sunk" id="configurations">
        <div className="wrap">
          <H as="h2" className="h3" html={title} />
          <div className="table-scroll">
            <table className="rate-table tnum">
              <thead>
                <tr><th>Size</th><th>What it suits</th></tr>
              </thead>
              <tbody>
                {a.ladder.map((rung, i) => (
                  <tr key={i}>
                    <th scope="row" className="rate-size">{(m.RATE_BY_ID[rung.config] || { label: rung.config }).label}<span className="rate-note">{rung.build}</span></th>
                    <td className="ladder-best">{rung.bestFor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <H as="p" className="note" html={note} />
        </div>
      </section>
    );
  },
};

// A sample of an act's set: picked from the song list by moment, or the
// act's own list.
const Setlist = {
  label: "Setlist",
  fields: { act: text("Act"), title: rich("Title"), more: rich("Note") },
  render: function SetlistRender({ act, title, more }) {
    const s = useSite();
    const m = s.model;
    const a = actFor(s, act);
    const sl = a && a.setlist;
    if (!sl) return null;
    let body;
    if (sl.from_repertoire) {
      const songs = m.c.repertoire;
      body = (
        <>
          <div className="split split--three">
            {(sl.groups || []).map((g, i) => (
              <div key={i}>
                <h3 className="h5">{g.label}</h3>
                <ul className="setlist">
                  {songs.filter((x) => x.moments.includes(g.moment) && !x.flags.includes("band")).slice(0, g.count).map((x, j) => (
                    <li key={j}><span className="song-title">{x.title}</span>{" "}<span className="song-artist">{x.artist}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <H as="p" className="note" html={more} />
        </>
      );
    } else {
      body = (
        <ul className="setlist setlist--cols">
          {(sl.items || []).map((x, j) => <li key={j}><span className="song-title">{x}</span></li>)}
        </ul>
      );
    }
    return (
      <section className="section section--ruled">
        <div className="wrap">
          <H as="h2" className="h3" html={title} />
          {sl.note ? <p className="note">{sl.note}</p> : null}
          {body}
        </div>
      </section>
    );
  },
};

const VendorList = {
  label: "Vendor list",
  fields: {
    categories: { type: "array", label: "Categories", getItemSummary: (c) => c.label, arrayFields: { id: text("Anchor"), label: text("Name"), ask: { type: "textarea", label: "Empty line" } } },
    vendors: { type: "array", label: "Vendors", getItemSummary: (v) => v.name, arrayFields: { name: text("Name"), url: text("Website"), location: text("Where"), note: { type: "textarea", label: "Line" }, category: text("Category") } },
  },
  render: ({ categories, vendors }) => (
    <section className="section section--ruled">
      <div className="wrap vendor-cats">
        {(categories || []).map((cat) => {
          const rows = (vendors || []).filter((v) => v.category === cat.id);
          return (
            <div className="vendor-cat" id={cat.id} key={cat.id}>
              <h2 className="h3">{cat.label}</h2>
              {rows.length ? (
                <div className="card-grid card-grid--2">
                  {rows.map((v, i) => (
                    <article className="card" key={i}>
                      <h3><a href={v.url} target="_blank" rel="noopener">{v.name}</a></h3>
                      <p className="vendor-where">{v.location}</p>
                      <p>{v.note}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="note">{cat.ask}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  ),
};

const actsScript = (s) => `<script defer src="${s.prefix}acts.js"></script>`;

// The enquiry form. The act field lists the roster and stays hidden until
// a link names an act.
const ContactForm = {
  label: "Contact form",
  fields: {
    band: shellFields.band,
    ...headingFields,
    details: { type: "array", label: "Details", getItemSummary: (d) => plain(d.term), arrayFields: { term: rich("Label"), html: rich("Text") } },
    action: text("Sends to"),
    hidden: { type: "array", label: "Hidden fields", getItemSummary: (h) => h.name, arrayFields: { name: text("Name"), value: text("Value") } },
    fields: {
      type: "array",
      label: "Fields",
      getItemSummary: (f) => (f.kind === "acts" ? "Act" : plain(f.label)),
      arrayFields: {
        kind: { type: "select", label: "Kind", options: [{ label: "Text", value: "input" }, { label: "Long text", value: "textarea" }, { label: "Act", value: "acts" }] },
        label: rich("Label"),
        id: text("Id"),
        name: text("Name"),
        type: text("Type"),
        autocomplete: text("Autocomplete"),
        required: { type: "radio", label: "Required", options: [{ label: "No", value: false }, { label: "Yes", value: true }] },
        full: { type: "radio", label: "Width", options: [{ label: "Half", value: false }, { label: "Full", value: true }] },
        rows: text("Rows"),
        placeholder: text("Placeholder"),
      },
    },
    button: text("Button"),
    script: { type: "radio", label: "Act script", options: [{ label: "Yes", value: true }, { label: "No", value: false }] },
  },
  render: function ContactFormRender(p) {
    const s = useSite();
    const m = s.model;
    const opts = (acts) => acts.map((a) => <option key={a.id} value={a.name} data-id={a.id}>{`${a.name} (${a.style})`}</option>);
    return (
      <>
        <section className={bandClass(p.band || "top")}>
          <div className="wrap">
            <div className="split contact-grid">
              <div>
                <div className="heading">
                  <H as="p" className={cx("eyebrow", p.slab && "eyebrow--slab")} html={p.eyebrow} />
                  <H as={p.titleTag || "h1"} className={p.titleClass || "h2 display"} html={p.title} />
                  <H as="p" className="lede" html={p.lede} />
                  {(p.headingText || []).map((t, i) => <H key={i} as="p" className={t.cls || "prose"} html={t.html} />)}
                </div>
                <dl className="contact-details">
                  {(p.details || []).map((d, i) => (
                    <div key={i}>
                      <H as="dt" html={d.term} />
                      <H as="dd" html={d.html} />
                    </div>
                  ))}
                </dl>
              </div>
              <form action={p.action} method="POST">
                {(p.hidden || []).map((h, i) => (
                  <Fragment key={i}>
                    {i ? " " : null}
                    <input type="hidden" name={h.name} value={h.value} />
                  </Fragment>
                ))}
                <div className="form-grid">
                  {(p.fields || []).map((f, i) =>
                    f.kind === "acts" ? (
                      <div className="field field--full" id="act-field" hidden key={i}>
                        <label htmlFor="act">Act</label>
                        <select id="act" name="Act" disabled>
                          <option value="">Not sure yet, recommend one</option>
                          <optgroup label="Configurations">{opts(m.FORMAT_ACTS)}</optgroup>
                          <optgroup label="Named acts">{opts(m.NAMED_ACTS)}</optgroup>
                        </select>
                      </div>
                    ) : (
                      <div className={f.full ? "field field--full" : "field"} key={i}>
                        <H as="label" htmlFor={f.id} html={f.label} />
                        {" "}
                        {f.kind === "textarea" ? (
                          <textarea id={f.id} name={f.name} rows={f.rows} placeholder={f.placeholder} />
                        ) : (
                          <input id={f.id} name={f.name} type={f.type || undefined} autoComplete={f.autocomplete || undefined} required={f.required || undefined} />
                        )}
                      </div>
                    )
                  )}
                </div>
                <div className="btn-row">
                  <button type="submit" className="btn">{p.button}</button>
                </div>
              </form>
            </div>
          </div>
        </section>
        {p.script ? <Raw html={actsScript(s)} /> : null}
      </>
    );
  },
};

// The roster page: the filters, then the two lanes of act cards.
const Roster = {
  label: "Roster",
  fields: {
    title: rich("Title"),
    note: rich("Note"),
    empty: rich("Nothing matches"),
    lanes: { type: "array", label: "Lanes", getItemSummary: (l) => plain(l.eyebrow), arrayFields: { lane: { type: "select", label: "Acts", options: [{ label: "Configurations", value: "format" }, { label: "Named acts", value: "named" }] }, eyebrow: rich("Eyebrow"), title: rich("Title"), lede: rich("Lede") } },
    band: shellFields.band,
    script: { type: "radio", label: "Act script", options: [{ label: "Yes", value: true }, { label: "No", value: false }] },
  },
  render: function RosterRender({ band, title, note, empty, lanes, script }) {
    const s = useSite();
    const m = s.model;
    const href = useHref();
    return (
      <>
        <section className={bandClass(band)}>
          <div className="wrap">
            <H as="h2" className="h3" html={title} />
            <H as="p" className="note" html={note} />
            <RosterFilters />
            <H as="p" className="filter-empty" id="filter-empty" hidden html={empty} />
            {(lanes || []).map((l, i) => (
              <div className="roster-lane" data-lane={l.lane} key={i}>
                <div className="heading">
                  <H as="p" className="eyebrow" html={l.eyebrow} />
                  <H as="h2" className="h2" html={l.title} />
                  <H as="p" className="lede" html={l.lede} />
                </div>
                {l.lane === "format" ? (
                  <CardGrid acts={m.FORMAT_ACTS} compact id="roster-formats" cls="card-grid card-grid--3 roster-grid" />
                ) : (
                  <>
                    <CardGrid acts={m.NAMED_ACTS} id="roster-named" cls="card-grid card-grid--3 roster-grid" />
                    <p className="note">{"Want to see them play? "}<a href={href(`/${m.WATCH_BASE}/`)}>Check out our video clips</a>.</p>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>
        {script ? <Raw html={actsScript(s)} /> : null}
      </>
    );
  },
};

// The filters: each one lists only what some act on the roster carries.
function RosterFilters() {
  const s = useSite();
  const m = s.model;
  const r = m.roster;
  const acts = m.ACTS;
  const has = (list, f) => list.filter(f);
  const usedB = new Set(acts.flatMap((a) => a.bucket_tags));
  const usedC = new Set(acts.flatMap((a) => a.config_tags));
  const usedG = new Set(acts.flatMap((a) => a.genre_tags || []));
  const vocal = new Set(acts.flatMap((a) => m.VOCALS_MATCH[a.vocals || "instrumental"].split(" ")));
  const restricted = acts.some((a) => a.area_tags && a.area_tags.length);
  const usedA = new Set(acts.flatMap((a) => m.actAreaIds(a)));
  const usedO = new Set(acts.flatMap((a) => a.occasion_tags || []));
  const opt = (list) => list.map((x) => <option key={x.id} value={x.id}>{x.label}</option>);
  const occ = has(r.occasions || [], (o) => usedO.has(o.id));
  const gen = has(r.genres || [], (g) => usedG.has(g.id));
  const field = (id, name, label, any, options) => (
    <div className="filter-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={name}>
        <option value="">{any}</option>
        {options}
      </select>
    </div>
  );
  return (
    <form className="roster-filters" id="roster-filters" hidden>
      {occ.length ? field("filter-occasion", "occasion", "Occasion", "Any", opt(occ)) : null}
      {field("filter-bucket", "bucket", "Kind of night", "Any", opt(has(r.buckets, (b) => usedB.has(b.id))))}
      {field("filter-config", "config", "Size", "Any", opt(has(r.rateCard, (c) => usedC.has(c.id))))}
      {gen.length ? field("filter-genre", "genre", "Genre", "Any", opt(gen)) : null}
      {vocal.size > 1 ? field("filter-vocals", "vocals", "Vocals", "Any", Object.entries(m.VOCALS_LABEL).filter(([v]) => vocal.has(v)).map(([v, l]) => <option key={v} value={v}>{l}</option>)) : null}
      {restricted ? field("filter-area", "area", "Where", "Anywhere we play", opt(has(r.areas || [], (a) => usedA.has(a.id)))) : null}
      <button type="button" className="btn btn--sm btn--outline" id="filter-reset">Reset</button>
      <p className="filter-count" id="filter-count" role="status">Every act</p>
    </form>
  );
}

// The whole song book, searchable: rows and filter chips come from the
// song list, so a song added there joins the page and its chips.
const MOMENTS = [["arrival", "Arrival"], ["dinner", "Dinner"], ["lift", "The turn"], ["dance", "Dancing"], ["closer", "Closer"], ["ceremony", "Ceremony"]];
const FLAGS = [["singalong", "Everyone knows it"], ["firstdance", "First dance"], ["request", "Requested often"], ["band", "Needs the full band"], ["lyric-trap", "Read the lyrics first"], ["check-lyrics", "Clear with the client"]];
const CATALOG_JS = `<script>
    // Progressive enhancement only: the full list is in the HTML and readable
    // with JS off, which is why the controls ship hidden and this reveals them.
    (function () {
      var root = document.getElementById('catalog');
      if (!root) return;
      var controls = root.querySelector('[data-catalog-controls]');
      var search = root.querySelector('[data-catalog-search]');
      var count = root.querySelector('[data-catalog-count]');
      var empty = root.querySelector('[data-catalog-empty]');
      var rows = Array.prototype.slice.call(root.querySelectorAll('.catalog-row'));
      var chips = Array.prototype.slice.call(root.querySelectorAll('.chip'));
      if (!rows.length) return;
      controls.hidden = false;
      var active = [];
      function apply() {
        var q = (search.value || '').trim().toLowerCase();
        var shown = 0;
        rows.forEach(function (row) {
          var tags = row.getAttribute('data-tags').split(' ');
          var okTags = active.every(function (t) { return tags.indexOf(t) !== -1; });
          var okText = !q || row.getAttribute('data-search').indexOf(q) !== -1;
          var show = okTags && okText;
          row.hidden = !show;
          if (show) shown++;
        });
        count.textContent = shown === rows.length
          ? rows.length + ' songs'
          : shown + ' of ' + rows.length + ' songs';
        empty.hidden = shown !== 0;
      }
      chips.forEach(function (chip) {
        chip.addEventListener('click', function () {
          var tag = chip.getAttribute('data-filter');
          var i = active.indexOf(tag);
          if (i === -1) { active.push(tag); } else { active.splice(i, 1); }
          chip.setAttribute('aria-pressed', i === -1 ? 'true' : 'false');
          apply();
        });
      });
      search.addEventListener('input', apply);
      apply();
    })();
  </script>`;

const SongCatalog = {
  label: "Song catalog",
  fields: { band: shellFields.band, anchor: shellFields.anchor, blocks: { type: "slot", label: "Heading" }, empty: rich("Nothing found") },
  defaultProps: { band: "sunk", anchor: "catalog", blocks: [], empty: "Nothing here by that name." },
  render: function SongCatalogRender({ band, anchor, blocks: Blocks, empty }) {
    const s = useSite();
    const songs = s.model.c.repertoire;
    const present = new Set(songs.flatMap((x) => [...x.moments, ...x.flags]));
    const chips = [...MOMENTS, ...FLAGS].filter(([k]) => present.has(k));
    const rows = songs
      .map((x) => {
        const tags = [...(x.energy ? [x.energy] : []), ...x.moments, ...x.flags].join(" ");
        const hay = `${x.title} ${x.artist}`.toLowerCase();
        return `<li class="catalog-row" data-tags="${esc(tags)}" data-search="${esc(hay)}"><span class="catalog-song">${esc(x.title)}</span><span class="catalog-artist">${esc(x.artist)}</span></li>`;
      })
      .join("\n");
    const controls =
      '<div class="catalog-controls" data-catalog-controls hidden>\n' +
      '<label class="catalog-search">\n<span class="visually-hidden">Search the repertoire</span>\n' +
      '<input type="search" placeholder="Search a song or artist" data-catalog-search autocomplete="off">\n</label>\n' +
      '<div class="catalog-chips" role="group" aria-label="Filter by moment">\n' +
      chips.map(([k, l]) => `<button type="button" class="chip" data-filter="${esc(k)}" aria-pressed="false">${esc(l)}</button>`).join("\n") +
      '\n</div>\n<p class="catalog-count note" data-catalog-count aria-live="polite"></p>\n</div>\n' +
      `<ul class="catalog-list" data-catalog-list>\n${rows}\n</ul>`;
    return (
      <section className={cx(bandClass(band), "catalog")} id={anchor || undefined}>
        <div className="wrap">
          {Blocks ? <Blocks /> : null}
          <Raw html={controls} />
          <H as="p" className="catalog-empty note" data-catalog-empty="" hidden html={empty} />
        </div>
        <Raw html={CATALOG_JS} />
      </section>
    );
  },
};

export const fixedSections = { LogoStrip, PagesAndPosts, HomeHero, RangeStrip, CoverStrip, CoverWall, ActHeader, ActAbout, ActSizes, Setlist, ActClose, VendorList, ContactForm, Roster, SongCatalog };

export const components = { ...blockSections, ...fixedSections, ActOwn };

export const categories = {
  sections: { title: "Sections", components: Object.keys(blockSections) },
  parts: { title: "Parts", components: Object.keys(fixedSections) },
};

export { Fragment };
