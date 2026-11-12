/* Signet's section types. Most are a band holding a list of blocks; their
   names say what the section is for (Rows, Questions, Images) and decide
   what a new one starts with. The rest have one fixed shape: the logo strip,
   the hub lists, the home hero, the cover walls, the act lists. */
import { Fragment } from "react";
import { css, cx, esc } from "../lib/util.js";
import { bandClass, shapeClass, Buttons, buttonFields, F, H, headingFields, Img, imageFields, Pic, Raw, shellFields, useHref, useSite, YouTube } from "./parts.jsx";
import { SIZES, ytId } from "../lib/pictures.js";
import { coverPath, patchwork } from "../lib/patchwork.js";
import { ALLOW, CloseRow, RosterGrid, rowMark } from "./blocks.jsx";
import { CreditList, honorsOf, Laurel, LaurelRow, laurelsOf, Mark, markedOf, PressList, pressOf, creditsOf } from "./honors.jsx";

const { rich, text } = F;
const plain = (s) => (typeof s === "string" ? s.replace(/<[^>]+>/g, "").slice(0, 48) : "");

// ------------------------------------------------------- block sections

function Standard({ band, cls, anchor, label, narrow, wrapStyle, edge, pin, blocks: Blocks }) {
  return (
    <section className={cx(bandClass(band), shapeClass({ edge, pin }), cls)} id={anchor || undefined} aria-label={label || undefined}>
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
  render: function LogoStripRender({ band, label, showAlso, wrapStyle, blocks: Blocks }) {
    const s = useSite();
    const c = s.model.c.logoStrip;
    return (
      <section className={cx(bandClass(band), "credits")} aria-label={label || undefined}>
        <div className="wrap" style={css(wrapStyle)}>
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
// The article rail's arrows: each press moves the row by most of its width,
// and an arrow is disabled at its end. Without script the row still scrolls.
const RAIL_SCRIPT =
  `(function(){var w=document.currentScript.parentNode,u=w.querySelector(".post-rail"),b=w.querySelectorAll(".rail-btn");` +
  `function f(){b[0].disabled=u.scrollLeft<8;b[1].disabled=u.scrollLeft+u.clientWidth>=u.scrollWidth-8;}` +
  `b.forEach(function(x){x.addEventListener("click",function(){u.scrollBy({left:(+x.dataset.dir)*u.clientWidth*0.9,` +
  `behavior:matchMedia("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});});});` +
  `u.addEventListener("scroll",f,{passive:true});addEventListener("resize",f);f();})();`;

const PagesAndPosts = {
  label: "Pages and posts",
  fields: {
    band: shellFields.band,
    heading: text("Heading"),
    groups: {
      type: "array",
      label: "Groups",
      getItemSummary: (g) => g.label,
      arrayFields: { label: text("Label"), art: text("Drawing (Cards only; blank: picked from the label)"), pages: { type: "array", label: "Pages", getItemSummary: (p) => p.path, arrayFields: { path: text("Page"), label: text("Label") } } },
    },
    look: { type: "radio", label: "Look", options: [{ label: "List", value: "list" }, { label: "Cards", value: "cards" }] },
  },
  defaultProps: { band: "ruled", heading: "All pages", groups: [] },
  render: function PagesAndPostsRender({ band, heading, groups, look, wrapStyle }) {
    const s = useSite();
    const href = useHref();
    const url = s.url;
    const { rows, posts } = s.model.hubIndex(url, groups || []);
    if (look === "cards") {
      const arts = Object.fromEntries((groups || []).filter((g) => g.art).map((g) => [g.label, g.art]));
      return (
        <section className={cx(bandClass(band), "hub-cards-band")}>
          <div className="wrap" style={css(wrapStyle)}>
            <nav className="hub-cards" aria-label={heading}>
              <h2 className="h2">{heading}</h2>
              <div className="hub-groups">
                {rows.map(([label, links], i) => (
                  <div className="def-row hub-group" key={i} data-art={arts[label] || rowMark(label).art}>
                    <h3 className="hub-group__label">{label}</h3>
                    <ul className="hub-chips">
                      {links.map(([u, t], j) => <li key={j}><a className="hub-chip" href={href(u)}>{t}</a></li>)}
                    </ul>
                  </div>
                ))}
              </div>
              {posts ? (
                <div className="hub-articles">
                  <div className="hub-articles__head">
                    <h3 className="hub-group__label">Articles</h3>
                    <div className="rail-nav">
                      <button type="button" className="rail-btn" data-dir="-1" aria-label="Earlier articles in the row">{"\u2190"}</button>
                      <button type="button" className="rail-btn" data-dir="1" aria-label="Later articles in the row">{"\u2192"}</button>
                    </div>
                  </div>
                  <ul className="post-rail">
                    {posts.map((p) => (
                      <li key={p.slug}>
                        <a className="post-card" href={href(`/blog/${p.slug}/`)}>
                          {p.hero && p.hero.src ? <Pic src={href(p.hero.src)} alt="" width="640" height="360" loading="lazy" decoding="async" sizes={SIZES.rail} /> : null}
                          {p.eyebrow ? <span className="post-card__eyebrow">{p.eyebrow}</span> : null}
                          <span className="post-card__title">{p.title}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                  <script dangerouslySetInnerHTML={{ __html: RAIL_SCRIPT }} />
                </div>
              ) : null}
            </nav>
          </div>
        </section>
      );
    }
    return (
      <section className={cx(bandClass(band), "hub-index-band")}>
        <div className="wrap" style={css(wrapStyle)}>
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
    video: text("Video (a silent loop, e.g. /media/signet-hero.mp4; the first picture is its poster)"),
  },
  render: ({ label, frames, framesHidden, video, title, titleStyle, lede, ledeStyle, buttons, wrapStyle }) => (
    <section className={video ? "hero-cine hero-cine--video" : "hero-cine"} aria-label={label || undefined}>
      <div className="hero-cine__frames" aria-hidden={framesHidden || "false"}>
        {(frames || []).map((im, i) => (
          <Fragment key={i}>
            {i ? " " : null}
            <Img im={{ cls: "hero-cine__frame", ...im }} sizes={SIZES.screen} />
          </Fragment>
        ))}
        {video ? (
          // Written as raw HTML: React's server render drops the muted attribute, and a
          // browser only autoplays a video it can see is muted. The video has no src in the
          // HTML: the script beside it picks the 540p copy (the same path with -540 before
          // .mp4) for narrow screens and the full copy otherwise, and loads nothing at all
          // for data saver or reduced motion, which keep the poster still.
          <div
            className="hero-cine__video-wrap"
            dangerouslySetInnerHTML={{
              __html:
                `<video class="hero-cine__video" data-src="${video}" data-src-small="${video.replace(/\.mp4$/, "-540.mp4")}"${frames && frames[0] ? ` poster="${frames[0].src}"` : ""} autoplay muted loop playsinline preload="none" aria-hidden="true" tabindex="-1"></video>` +
                `<script>(function(){var v=document.currentScript.previousElementSibling,c=navigator.connection;` +
                `if((c&&c.saveData)||matchMedia("(prefers-reduced-motion: reduce)").matches)return;` +
                `v.src=matchMedia("(max-width: 767px)").matches?v.dataset.srcSmall:v.dataset.src;` +
                `var p=v.play();p&&p.catch&&p.catch(function(){});})();</script>` +
                `<div class="hero-cine__grain"></div>`,
            }}
          />
        ) : null}
      </div>
      <div className="hero-cine__scrim" aria-hidden="true"></div>
      <div className="wrap hero-cine__copy" style={css(wrapStyle)}>
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
  render: ({ label, image, wrapStyle }) => (
    <section className="range-strip" aria-label={label || undefined} style={css(wrapStyle)}>
      <Img im={image} sizes={SIZES.screen} />
    </section>
  ),
};

// A run of album sleeves under a note.
const CoverStrip = {
  label: "Cover strip",
  fields: { tiles: { type: "array", label: "Sleeves", getItemSummary: (t) => t.alt, arrayFields: { src: text("File"), alt: text("Alt text") } }, note: rich("Note") },
  render: function CoverStripRender({ tiles, note, wrapStyle }) {
    const href = useHref();
    return (
      <section className="section--night cover-strip" style={css(wrapStyle)}>
        <div className="cover-strip-inner">
          {(tiles || []).map((t, i) => <Pic key={i} src={href(t.src)} alt={t.alt} loading="lazy" decoding="async" width="300" height="300" sizes={SIZES.strip} />)}
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
  render: function CoverWallRender({ flip, eyebrow, title, titleStyle, text: body, textStyle, textAt, tiles, notes, wrapStyle }) {
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
        <Pic src={href(t.src)} alt={t.alt} loading={t.loading || undefined} decoding={t.decoding || undefined} sizes={SIZES.wall} />
        <figcaption>
          <H as="span" className="wall-song" html={t.song} />
          <H as="span" className="wall-credit" html={t.credit} />
        </figcaption>
      </figure>
    ));
    const at = textAt || 0;
    return (
      <section className={cx("section--night cover-wall", flip && "cover-wall--flip")} style={css(wrapStyle)}>
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
  render: function ActHeaderRender({ act, button, wrapStyle }) {
    const s = useSite();
    const href = useHref();
    const m = s.model;
    const a = actFor(s, act);
    if (!a) return null;
    const face = [m.actByline(a), a.material].filter(Boolean).map((x) => x.replace(/[.\s]+$/, "") + ".").join(" ");
    let media = null;
    if (a.video && ytId(a.video)) media = <YouTube id={ytId(a.video)} src={a.video} title={`${a.name} performing`} allow={ALLOW} sizes={SIZES.wrap} />;
    else if (a.video && /^https?:\/\//.test(a.video)) media = <iframe src={a.video} title={`${a.name} performing`} loading="lazy" allow={ALLOW} allowFullScreen />;
    else if (a.video) media = <video src={href("/" + a.video)} poster={a.video_poster ? href("/" + a.video_poster) : undefined} title={`${a.name} performing`} controls preload="metadata" playsInline />;
    else if (a.img) media = <Pic class="act-video-photo" src={href("/img/" + a.img)} alt={a.alt || ""} decoding="async" sizes={SIZES.wrap} />;
    return (
      <section className="section section--top act-hero">
        <div className="wrap" style={css(wrapStyle)}>
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
  render: function ActAboutRender({ act, band, wrapStyle }) {
    const s = useSite();
    const a = actFor(s, act);
    const paras = (a && a.identity) || [];
    if (!paras.length) return null;
    return (
      <section className={bandClass(band || "ruled")}>
        <div className="wrap wrap--narrow" style={css(wrapStyle)}>
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
  fields: { act: text("Act"), band: shellFields.band, title: rich("Title"), lede: rich("Lede"), button: text("Button"), note: rich("Line under the button") },
  render: function ActCloseRender({ act, band, title, lede, button, note, wrapStyle }) {
    const s = useSite();
    const a = actFor(s, act);
    if (!a) return null;
    const R = CloseRow.render;
    const t = typeof title === "string" ? title.replace(/\{name\}/g, esc(a.name)) : title;
    return (
      <section className={bandClass(band || "ruled")}>
        <div className="wrap" style={css(wrapStyle)}>
          <R boxed boxStyle="max-width: 32rem;" title={t} lede={lede} buttons={[{ label: button || "Check a date", href: `/contact/?act=${a.id}`, cls: "btn" }]} note={note} />
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
  render: function ActSizesRender({ act, title, note, wrapStyle }) {
    const s = useSite();
    const m = s.model;
    const a = actFor(s, act);
    if (!a || !(a.ladder || []).length) return null;
    return (
      <section className="section section--ruled section--sunk" id="configurations">
        <div className="wrap" style={css(wrapStyle)}>
          <H as="h2" className="h3" html={title} />
          <div className="table-scroll">
            <table className="rate-table tnum">
              <thead>
                <tr><th>Size</th><th>What it suits</th></tr>
              </thead>
              <tbody>
                {a.ladder.map((rung, i) => (
                  <tr key={i}>
                    <th scope="row" className="rate-size">{rung.label || (m.RATE_BY_ID[rung.config] || { label: rung.config }).label}<span className="rate-note">{rung.build}</span></th>
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

// An act's go-to songs as a patchwork of their record sleeves on the night
// band. The sleeves are placed ahead of time at three widths (lib/patchwork.js)
// so every row is full. Only songs with a real sleeve on file are in the
// patchwork, never a title set as a stand-in. Every song, sleeve or not, is
// in the list of names underneath, which is what
// a screen reader, a phone and a search engine read; the sleeves are pictures
// of it. As the patchwork scrolls into view the sleeves come in one after
// another and each one settles from a slight zoom. Nothing moves under
// reduced motion, and with script off they are simply there.
const PATCH_SCRIPT =
  `(function(){var r=document.currentScript.parentNode,g=r.querySelector(".song-patch__grid");` +
  `if(!g||matchMedia("(prefers-reduced-motion: reduce)").matches||!("IntersectionObserver" in window))return;` +
  `var t=Array.prototype.slice.call(g.querySelectorAll(".song-tile"));` +
  `function order(){var b=t.map(function(f){var x=f.getBoundingClientRect();return [x.top+x.left/1e4,f];});` +
  `b.sort(function(p,q){return p[0]-q[0];});b.forEach(function(p,i){p[1].style.setProperty("--i",Math.min(i,14));});}` +
  `order();g.classList.add("is-armed");var o=new IntersectionObserver(function(es){es.forEach(function(e){` +
  `if(e.isIntersecting){g.classList.add("is-in");o.disconnect();}});},{threshold:0.15});o.observe(g);})();`;

function SongPatch({ s, songs, eyebrow, title, lede, note, more, wrapStyle }) {
  const href = useHref();
  const exists = s.model.c.exists;
  const sleeved = songs.filter((song) => song.cover !== false && exists && exists(coverPath(song)));
  const layout = patchwork(sleeved.length);
  const place = (i) =>
    ["sm", "md", "lg"].map((k) => {
      const p = layout[k].at[i];
      return `--c-${k}: ${p.c}; --r-${k}: ${p.r}; --s-${k}: ${p.s}`;
    }).join("; ");
  const gridStyle = layout ? ["sm", "md", "lg"].map((k) => `--cols-${k}: ${layout[k].cols}`).join("; ") : "";
  return (
    <section className="section section--night song-patch">
      <div className="wrap song-patch__head" style={css(wrapStyle)}>
        <H as="p" className="eyebrow" html={eyebrow} />
        <H as="h2" className="h2" html={title} />
        {lede ? <H as="p" className="prose song-patch__note" html={lede} /> : note ? <p className="prose song-patch__note">{note}</p> : null}
      </div>
      {sleeved.length ? (
        <div className="song-patch__field">
          <div className="song-patch__grid" style={css(gridStyle)} aria-hidden="true">
            {sleeved.map((song, i) => {
              const big = layout.lg.at[i].s > 1;
              return (
                <figure className={cx("song-tile", big && "song-tile--big")} style={css(place(i))} key={i}>
                  <Pic src={href("/" + coverPath(song))} alt={`Album cover for ${song.title} by ${song.artist}`} loading="lazy" decoding="async" sizes={big ? SIZES.patchBig : SIZES.patch} />
                  <figcaption>
                    <span className="song-tile__title">{song.title}</span>
                    <span className="song-tile__artist">{song.artist}</span>
                  </figcaption>
                </figure>
              );
            })}
          </div>
          <script dangerouslySetInnerHTML={{ __html: PATCH_SCRIPT }} />
        </div>
      ) : null}
      <div className="wrap" style={css(wrapStyle)}>
        <ul className="song-patch__list">
          {songs.map((song, i) => (
            <li key={i}>
              <span className="song-title">{song.title}</span>
              {song.artist ? <span className="song-artist">{song.artist}</span> : null}
            </li>
          ))}
        </ul>
        <H as="p" className="note song-patch__more" html={more} />
      </div>
    </section>
  );
}

// A sample of an act's set: picked from the song list by moment, or the
// act's own list.
const Setlist = {
  label: "Setlist",
  fields: { act: text("Act"), eyebrow: rich("Eyebrow"), title: rich("Title"), lede: rich("Lede (else the act's note)"), more: rich("Note") },
  render: function SetlistRender({ act, eyebrow, title, lede, more, wrapStyle }) {
    const s = useSite();
    const m = s.model;
    const a = actFor(s, act);
    const sl = a && a.setlist;
    if (!sl) return null;
    if ((sl.songs || []).length) return <SongPatch s={s} songs={sl.songs} eyebrow={eyebrow} title={title} lede={lede} note={sl.note} more={more} wrapStyle={wrapStyle} />;
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
        <div className="wrap" style={css(wrapStyle)}>
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
    vendors: { type: "array", label: "Vendors", getItemSummary: (v) => v.name, arrayFields: { name: text("Name"), url: text("Website"), location: text("Where"), note: { type: "textarea", label: "Line" }, category: text("Category"), page: text("Our page about them"), image: text("Picture"), imageAlt: text("Picture's alt text") } },
  },
  render: function VendorListRender({ categories, vendors, wrapStyle }) {
    const href = useHref();
    const s = useSite();
    // The venues category lists every hotel and conference center page.
    const venues = s.model.VENUES || [];
    return (
    <section className="section section--ruled">
      <div className="wrap vendor-cats" style={css(wrapStyle)}>
        {(categories || []).map((cat) => {
          const rows = (vendors || []).filter((v) => v.category === cat.id);
          return (
            <div className="vendor-cat" id={cat.id} key={cat.id}>
              <h2 className="h3">{cat.label}</h2>
              {cat.id === "venues" && venues.length ? (
                <VenueCards s={s} venues={venues} />
              ) : rows.length ? (
                <div className="card-grid card-grid--3 vendor-grid">
                  {rows.map((v, i) => (
                    <article className="card vendor-card" key={i}>
                      {v.image ? (
                        <a className="vendor-card-photo" {...(v.page ? { href: href(v.page) } : { href: v.url, target: "_blank", rel: "noopener" })}>
                          <Pic src={href(v.image)} alt={v.imageAlt || ""} loading="lazy" decoding="async" sizes={SIZES.roster} />
                        </a>
                      ) : null}
                      <div className="vendor-card-body">
                        <h3><a href={v.url} target="_blank" rel="noopener">{v.name}</a></h3>
                        <p className="vendor-where">{v.location}</p>
                        <p>{v.note}</p>
                        {v.page ? <p><a href={href(v.page)}>Read more about {v.name}</a></p> : null}
                      </div>
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
    );
  },
};

// The venues: every venue page as a card, with its area, its spaces and the
// acts that have played there. Grouped under each venue's group once there is
// more than one group.
const actLinks = (s, ids) => {
  const m = s.model;
  const links = ids.map((id) => m.ACT_BY_ID[id]).map((a) => (a.page ? `<a href="/${a.page}">${esc(a.name)}</a>` : esc(a.name)));
  return links.length < 2 ? links.join("") : `${links.slice(0, -1).join(", ")} and ${links[links.length - 1]}`;
};
// The hub's venue cards: the hotel's own photograph, its town, its name, its
// event spaces and the acts that have played there or that its page picks.
// The photograph drifts in as it scrolls into view and catches a sweep of
// light on hover; nothing moves under reduced motion.
function VenueCards({ s, venues }) {
  const href = useHref();
  const m = s.model;
  const acts = (v) => {
    const names = (ids) => ids.map((id) => m.ACT_BY_ID[id]).filter((a) => a && !a.hidden).map((a) => esc(a.name));
    if (v.played.length) {
      const n = names(v.played);
      return `<span class="venue-card__label">Played here</span>${n.join(" · ")}`;
    }
    const n = names([...v.named]).slice(0, 3);
    return n.length ? `<span class="venue-card__label">Acts we'd pick</span>${n.join(" · ")}` : "";
  };
  // Three across: a venue an act has played comes first, and when the count
  // would leave one card alone on the last row, the first card runs double
  // width so every row stays full or a pair.
  const sorted = [...venues].sort((x, y) => (y.played.length ? 1 : 0) - (x.played.length ? 1 : 0));
  const wide = sorted.length > 3 && sorted.length % 3 === 1;
  return (
    <ul className="venue-cards">
      {sorted.map((v, i) => (
        <li className={cx("venue-card", wide && i === 0 && "venue-card--wide")} key={v.path}>
          <a className="venue-card__link" href={s.prefix + v.path.slice(1)}>
            <div className="venue-card__photo">
              {v.img ? <Pic src={href("/" + v.img.replace(/^\//, ""))} alt="" width="1600" height="1067" loading="lazy" decoding="async" sizes={SIZES.roster} /> : null}
              <span className="venue-card__sheen" aria-hidden="true" />
            </div>
            <div className="venue-card__body">
              {v.area ? <p className="venue-card__area">{v.area}</p> : null}
              <h4 className="venue-card__name">{v.name}</h4>
              {v.spaces ? <p className="venue-card__spaces">{v.spaces}</p> : null}
              <H as="p" className="venue-card__acts" html={acts(v) || null} />
              <span className="venue-card__more">{`Live music at ${v.short}`}</span>
            </div>
          </a>
        </li>
      ))}
    </ul>
  );
}
const VenueList = {
  label: "Venue list",
  fields: { band: shellFields.band, title: rich("Title"), lede: rich("Lede"), groupTitle: text("Heading for each town ({group} is the town)") },
  render: function VenueListRender({ band, title, lede, groupTitle, wrapStyle }) {
    const s = useSite();
    const venues = s.model.VENUES;
    if (!venues.length) return null;
    const count = (g) => venues.filter((v) => (v.group || "") === g).length;
    const groups = [...new Set(venues.map((v) => v.group || ""))].sort((x, y) => count(y) - count(x));
    const head = (g) => (groupTitle && g ? groupTitle.replace(/\{group\}/g, g) : g || "More venues");
    return (
      <section className={cx(bandClass(band || "ruled"), "venues-hub")} id="venues">
        <div className="wrap" style={css(wrapStyle)}>
          <H as="h2" className="h2" html={title} />
          <H as="p" className="lede" html={lede} />
          {groups.length < 2 ? (
            <VenueCards s={s} venues={venues} />
          ) : (
            groups.map((g) => (
              <div className="venue-town" key={g}>
                <h3 className="venue-town__name">{head(g)}</h3>
                <VenueCards s={s} venues={venues.filter((v) => (v.group || "") === g)} />
              </div>
            ))
          )}
        </div>
      </section>
    );
  },
};

// On an act page: the venue pages that name the act. Nothing when none do.
const ActVenues = {
  label: "Act venues",
  fields: { act: text("Act"), band: shellFields.band, title: rich("Title"), lede: rich("Lede ({name} is the act's name)") },
  render: function ActVenuesRender({ act, band, title, lede, wrapStyle }) {
    const s = useSite();
    const a = actFor(s, act);
    const venues = a ? s.model.venuesFor(a.id) : [];
    if (!venues.length) return null;
    const name = esc(a.name);
    const line = (v) => [v.kind && v.area ? `A ${esc(v.kind)} in ${esc(v.area)}.` : v.area ? `${esc(v.area)}.` : "", v.played.includes(a.id) ? `${name} has played here.` : ""].filter(Boolean).join(" ");
    return (
      <section className={bandClass(band || "ruled")} id="venues">
        <div className="wrap" style={css(wrapStyle)}>
          <H as="h2" className="h3" html={title} />
          <H as="p" className="prose" html={typeof lede === "string" ? lede.replace(/\{name\}/g, name) : lede} />
          <VenueCards s={s} venues={venues} line={line} />
        </div>
      </section>
    );
  },
};

// On an act page, under the hero: the act's awards as laurels, its press,
// TV and radio with the outlets' marks, then stages and credits. Nothing
// when the act has none.
const ActHonors = {
  label: "Act awards and press",
  fields: { act: text("Act"), band: shellFields.band, title: rich("Title"), lede: rich("Lede ({name} is the act's name)"), pressTitle: rich("Press title"), creditsTitle: rich("Stages title") },
  defaultProps: { band: "ruled", title: "Awards and press", pressTitle: "In the press and on air", creditsTitle: "Stages and credits" },
  render: function ActHonorsRender({ act, band, title, lede, pressTitle, creditsTitle, wrapStyle }) {
    const s = useSite();
    const a = actFor(s, act);
    if (!honorsOf(a).length) return null;
    const laurels = laurelsOf(a), press = pressOf(a), credits = creditsOf(a);
    return (
      <section className={cx(bandClass(band || "ruled"), "honors")} id="awards">
        <div className="wrap" style={css(wrapStyle)}>
          <H as="h2" className="h2" html={title || "Awards and press"} />
          <H as="p" className="prose honors-lede" html={typeof lede === "string" ? lede.replace(/\{name\}/g, esc(a.name)) : lede} />
          <LaurelRow items={laurels} />
          {press.length ? (
            <>
              <H as="h3" className="h4 honors-sub" html={pressTitle || "In the press and on air"} />
              <PressList items={press} />
            </>
          ) : null}
          {credits.length ? (
            <>
              <H as="h3" className="h4 honors-sub" html={creditsTitle || "Stages and credits"} />
              <CreditList items={credits} />
            </>
          ) : null}
        </div>
      </section>
    );
  },
};

// The roster's awards in one place: every laurel won across the Featured
// Artists, each naming and linking its act, then every outlet's and stage's
// mark once. With "strongest", honors marked minor in the act file stay off.
const HonorsWall = {
  label: "Artists' awards and press",
  fields: { band: shellFields.band, eyebrow: rich("Eyebrow"), title: rich("Title"), lede: rich("Lede"), marksLabel: rich("Marks label"), strongest: { type: "radio", label: "Awards shown", options: [{ label: "All", value: false }, { label: "Leave out the minor ones", value: true }] } },
  defaultProps: { band: "ruled", eyebrow: "Featured Artists", title: "Our artists' awards and press", marksLabel: "In the press, on air and on stage" },
  render: function HonorsWallRender({ band, eyebrow, title, lede, marksLabel, strongest, wrapStyle }) {
    const s = useSite();
    const m = s.model;
    const acts = m.ACTS.filter((a) => a.page && honorsOf(a).length);
    const rank = ["award", "honoree", "finalist", "invited"];
    const laurels = acts
      .flatMap((a) => laurelsOf(a).filter((h) => rank.includes(h.kind) && !(strongest && h.minor)).map((h) => ({ h, a })))
      .map((x, i) => [x, i])
      .sort((x, y) => rank.indexOf(x[0].h.kind) - rank.indexOf(y[0].h.kind) || x[1] - y[1])
      .map(([x]) => x);
    const seen = new Set();
    const marks = acts.flatMap((a) => markedOf(a).map((h) => ({ h, a }))).filter(({ h }) => !seen.has(h.logo) && seen.add(h.logo));
    if (!laurels.length && !marks.length) return null;
    return (
      <section className={cx(bandClass(band || "ruled"), "honors honors-wall")} id="awards">
        <div className="wrap" style={css(wrapStyle)}>
          <div className="heading honors-wall-head">
            <H as="p" className="eyebrow" html={eyebrow} />
            <H as="h2" className="h2" html={title} />
            <H as="p" className="lede" html={lede} />
          </div>
          {laurels.length ? (
            <ul className="laurels laurels--wall">
              {laurels.map(({ h, a }, i) => <Laurel key={i} h={h} act={a.name} href={m.actUrl(a, s.prefix)} />)}
            </ul>
          ) : null}
          {marks.length ? (
            <>
              <H as="p" className="eyebrow honors-marks-label" html={marksLabel} />
              <ul className="honor-marks honor-marks--wall">
                {marks.map(({ h, a }, i) => (
                  <li key={i}>
                    <a href={m.actUrl(a, s.prefix)} aria-label={`${h.from}: ${a.name}`}><Mark h={h} /></a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </section>
    );
  },
};

const actsScript = (s) => `<script defer src="${s.prefix}acts.js"></script>`;

// The enquiry form. The act field lists the roster and stays hidden until
// a link names an act.
const ContactForm = {
  label: "Contact form",
  fields: {
    band: shellFields.band,
    anchor: shellFields.anchor,
    ...headingFields,
    details: { type: "array", label: "Details", getItemSummary: (d) => plain(d.term), arrayFields: { term: rich("Label"), html: rich("Text") } },
    action: text("Sends to"),
    hidden: { type: "array", label: "Hidden fields", getItemSummary: (h) => h.name, arrayFields: { name: text("Name"), value: text("Value") } },
    fields: {
      type: "array",
      label: "Fields",
      getItemSummary: (f) => (f.kind === "acts" ? "Act" : plain(f.label)),
      arrayFields: {
        kind: { type: "select", label: "Kind", options: [{ label: "Text", value: "input" }, { label: "Long text", value: "textarea" }, { label: "Act", value: "acts" }, { label: "One checkbox", value: "check" }, { label: "Checkboxes", value: "checks" }, { label: "One of", value: "choice" }] },
        label: rich("Label"),
        id: text("Id"),
        name: text("Name"),
        type: text("Type"),
        autocomplete: text("Autocomplete"),
        required: { type: "radio", label: "Required", options: [{ label: "No", value: false }, { label: "Yes", value: true }] },
        full: { type: "radio", label: "Width", options: [{ label: "Half", value: false }, { label: "Full", value: true }] },
        rows: text("Rows"),
        placeholder: text("Placeholder"),
        options: text("Choices (Checkboxes and One of), separated by |"),
        param: text("Ticked when the link carries (One checkbox, e.g. photo-video); for One of, shown and chosen only when the link names a choice (e.g. package=event-photos)"),
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
        <section className={bandClass(p.band || "top")} id={p.anchor || undefined}>
          <div className="wrap" style={css(p.wrapStyle)}>
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
                          <optgroup label="Featured Artists">{opts(m.NAMED_ACTS)}</optgroup>
                          <optgroup label="House Ensembles">{opts(m.FORMAT_ACTS)}</optgroup>
                        </select>
                      </div>
                    ) : f.kind === "check" ? (
                      <div className={f.full ? "field field--full field--check" : "field field--check"} key={i}>
                        <label className="choice">
                          <input type="checkbox" id={f.id} name={f.name} value="Yes" data-param={f.param || undefined} />
                          {" "}
                          <H as="span" html={f.label} />
                        </label>
                      </div>
                    ) : f.kind === "checks" || f.kind === "choice" ? (
                      // A one-of with a link key stays hidden and off until the link names a choice (acts.js).
                      <fieldset
                        className={f.full ? "field field--full field--choices" : "field field--choices"}
                        key={i}
                        data-param={f.kind === "choice" && f.param ? f.param : undefined}
                        hidden={f.kind === "choice" && f.param ? true : undefined}
                        disabled={f.kind === "choice" && f.param ? true : undefined}
                      >
                        <H as="legend" html={f.label} />
                        <div className="choices">
                          {String(f.options || "").split("|").map((o) => o.trim()).filter(Boolean).map((o, j) => (
                            <label className="choice" key={j}>
                              <input
                                type={f.kind === "checks" ? "checkbox" : "radio"}
                                name={f.kind === "checks" ? o : f.name}
                                value={f.kind === "checks" ? "Yes" : o}
                                id={j ? undefined : f.id}
                              />
                              {" "}
                              <span>{o}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
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

// The roster page: the sort, then the two lanes of act cards, two across
// with the photograph first. The sort never hides an act: the acts that suit
// the kind of event picked move to the top of each lane, and the rest follow.
const Roster = {
  label: "Roster",
  fields: {
    title: rich("Title"),
    note: rich("Note"),
    more: rich("Heading over the rest"),
    sorted: rich("Status after a pick ({label})"),
    lanes: { type: "array", label: "Lanes", getItemSummary: (l) => plain(l.eyebrow), arrayFields: { lane: { type: "select", label: "Acts", options: [{ label: "House Ensembles", value: "format" }, { label: "Featured Artists", value: "named" }] }, eyebrow: rich("Eyebrow"), title: rich("Title"), lede: rich("Lede") } },
    band: shellFields.band,
    script: { type: "radio", label: "Act script", options: [{ label: "Yes", value: true }, { label: "No", value: false }] },
  },
  render: function RosterRender({ band, title, note, more, sorted, lanes, script, wrapStyle }) {
    const s = useSite();
    const m = s.model;
    const href = useHref();
    return (
      <>
        <section className={bandClass(band)}>
          <div className="wrap" style={css(wrapStyle)}>
            <H as="h2" className="h3" html={title} />
            <H as="p" className="note" html={note} />
            <RosterSort more={more} sorted={sorted} />
            {(lanes || []).map((l, i) => (
              <div className="roster-lane" data-lane={l.lane} id={l.lane === "named" ? "featured-artists" : "house-ensembles"} key={i}>
                <div className="heading">
                  <H as="p" className="eyebrow" html={l.eyebrow} />
                  <H as="h2" className="h2" html={l.title} />
                  <H as="p" className="lede" html={l.lede} />
                </div>
                {l.lane === "format" ? (
                  <RosterGrid acts={m.FORMAT_ACTS} id="roster-formats" />
                ) : (
                  <>
                    <RosterGrid acts={m.NAMED_ACTS} id="roster-named" />
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

// The sort: one chip for each kind of event some act on the roster carries,
// leaving out a kind marked "chip": false in roster.json.
function RosterSort({ more, sorted }) {
  const s = useSite();
  const m = s.model;
  const used = new Set(m.ACTS.flatMap((a) => a.bucket_tags || []));
  const kinds = m.roster.buckets.filter((b) => used.has(b.id) && b.chip !== false);
  const text = (h) => (h || "").replace(/<[^>]+>/g, "");
  return (
    <div className="roster-filters roster-sort" id="roster-filters" data-more={text(more)} data-sorted={text(sorted)} hidden>
      <div className="catalog-chips" role="group" aria-label="Kind of event">
        {kinds.map((b) => <button key={b.id} type="button" className="chip" data-fit={b.id} aria-pressed="false" title={b.blurb}>{b.label}</button>)}
      </div>
      <button type="button" className="btn btn--sm btn--outline" id="filter-reset" hidden>Reset</button>
      <p className="filter-count" id="filter-count" role="status"></p>
    </div>
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
  render: function SongCatalogRender({ band, anchor, blocks: Blocks, empty, wrapStyle }) {
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
        <div className="wrap" style={css(wrapStyle)}>
          {Blocks ? <Blocks /> : null}
          <Raw html={controls} />
          <H as="p" className="catalog-empty note" data-catalog-empty="" hidden html={empty} />
        </div>
        <Raw html={CATALOG_JS} />
      </section>
    );
  },
};

// ------------------------------------------------ venue landing pages
// Built 2026-11-12 for the venue pages (Daniel: "make these great landing
// pages for people who have or are considering booking music there").

// The act a venue section picks, its page and its first YouTube clip.
function venueAct(s, id, clip) {
  const m = s.model;
  const a = id ? m.ACT_BY_ID[id] : null;
  if (!a || a.hidden) return null;
  const yt = clip || ((m.FOOTAGE || []).find((v) => v.act === a.id && v.id) || {}).id || null;
  return { a, url: m.actUrl(a, s.prefix), yt };
}

// Each event space as its own panel: the hotel's photograph of it (or, with
// no photograph, the space's size set large), what the space is, the one act
// we'd pick for it and why, and a button that plays that act over the photo.
const VenueSpaces = {
  label: "Venue spaces",
  fields: {
    band: shellFields.band,
    eyebrow: rich("Eyebrow"),
    title: rich("Title"),
    lede: rich("Lede"),
    spaces: {
      type: "array",
      label: "Spaces",
      getItemSummary: (x) => x.name,
      arrayFields: { name: text("Space"), img: text("Photo"), alt: text("Photo's alt text"), credit: text("Photo credit"), stat: text("Without a photo: the size, set large"), facts: rich("What the space is"), act: text("Act we'd pick (id)"), kicker: text("Line over the act's name"), why: rich("Why"), clip: text("YouTube id (blank: the act's first clip)") },
    },
  },
  render: function VenueSpacesRender({ band, eyebrow, title, lede, spaces, wrapStyle }) {
    const s = useSite();
    const href = useHref();
    return (
      <section className={cx(bandClass(band || "ruled"), "vspaces")}>
        <div className="wrap" style={css(wrapStyle)}>
          <div className="heading">
            <H as="p" className="eyebrow" html={eyebrow} />
            <H as="h2" className="h2" html={title} />
            <H as="p" className="lede" html={lede} />
          </div>
          <div className="vspaces__list">
            {(spaces || []).map((x, i) => {
              const pick = venueAct(s, x.act, x.clip);
              return (
                <article className={cx("vspace", !x.img && "vspace--stat")} key={i}>
                  <figure className="vspace__media">
                    {x.img ? <Pic src={href(x.img)} alt={x.alt || ""} loading="lazy" decoding="async" sizes="(min-width: 1100px) 640px, 100vw" /> : <p className="vspace__stat">{x.stat}</p>}
                    <div className="vspace__player" aria-live="polite"></div>
                    {x.credit ? <figcaption className="vspace__credit">{x.credit}</figcaption> : null}
                  </figure>
                  <div className="vspace__body">
                    <h3 className="vspace__name">{x.name}</h3>
                    <H as="p" className="vspace__facts" html={x.facts} />
                    {pick ? (
                      <div className="vspace__pick">
                        <p className="vspace__label">{x.kicker || "Our pick"}</p>
                        <p className="vspace__act"><a href={pick.url}>{pick.a.name}</a></p>
                        <H as="p" className="vspace__why" html={x.why} />
                        {pick.yt ? (
                          <button type="button" className="vspace__play" data-vclip={pick.yt} data-title={pick.a.name}>
                            <span className="vspace__play-icon" aria-hidden="true"></span>
                            <span className="vspace__play-text">{`Hear ${pick.a.name}`}</span>
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
        <Raw html={`<script>${VSPACE_JS}</script>`} />
      </section>
    );
  },
};
// The play button: the act's clip in a small player over the corner of the
// space's photo, so the room stays in view while the music plays. One at a
// time; the button stops it again.
const VSPACE_JS =
  `(function(){var root=document.currentScript.parentNode;` +
  `function stop(b){var p=b.closest(".vspace").querySelector(".vspace__player");p.innerHTML="";p.classList.remove("is-on");b.classList.remove("is-on");b.querySelector(".vspace__play-text").textContent="Hear "+b.dataset.title;}` +
  `root.querySelectorAll("[data-vclip]").forEach(function(b){b.addEventListener("click",function(){` +
  `var on=b.classList.contains("is-on");root.querySelectorAll("[data-vclip].is-on").forEach(stop);if(on)return;` +
  `var p=b.closest(".vspace").querySelector(".vspace__player");` +
  `p.innerHTML='<iframe src="https://www.youtube-nocookie.com/embed/'+b.dataset.vclip+'?autoplay=1&rel=0&modestbranding=1&playsinline=1" title="'+b.dataset.title.replace(/"/g,"")+'" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';` +
  `p.classList.add("is-on");b.classList.add("is-on");b.querySelector(".vspace__play-text").textContent="Stop the music";});});})();`;

// Moments at a venue: a wedding's ceremony, cocktails and reception, or a
// company's party, gala and reception, each with the space and one act, shown
// by the act's photograph.
const VenueMoments = {
  label: "Venue moments",
  fields: {
    band: shellFields.band,
    eyebrow: rich("Eyebrow"),
    title: rich("Title"),
    lede: rich("Lede"),
    moments: { type: "array", label: "Moments", getItemSummary: (x) => x.label, arrayFields: { label: text("Moment"), space: text("Space"), act: text("Act (id)"), photo: text("Photo (blank: the act's card)"), line: rich("Line") } },
    note: rich("Note"),
  },
  render: function VenueMomentsRender({ band, eyebrow, title, lede, moments, note, wrapStyle }) {
    const s = useSite();
    const href = useHref();
    return (
      <section className={cx(bandClass(band || "ruled"), "vmoments")}>
        <div className="wrap" style={css(wrapStyle)}>
          <div className="heading">
            <H as="p" className="eyebrow" html={eyebrow} />
            <H as="h2" className="h2" html={title} />
            <H as="p" className="lede" html={lede} />
          </div>
          <ol className="vmoments__list">
            {(moments || []).map((x, i) => {
              const pick = venueAct(s, x.act);
              const img = x.photo || (pick && pick.a.img ? "/img/" + pick.a.img : null);
              return (
                <li className="vmoment" key={i}>
                  <a className="vmoment__link" href={pick ? pick.url : undefined}>
                    <div className="vmoment__photo">
                      {img ? <Pic src={href(img)} alt="" loading="lazy" decoding="async" sizes="(min-width: 900px) 33vw, 100vw" /> : null}
                    </div>
                    <div className="vmoment__body">
                      <p className="vmoment__label">{x.label}</p>
                      <p className="vmoment__space">{x.space}</p>
                      {pick ? <p className="vmoment__act">{pick.a.name}</p> : null}
                      <H as="p" className="vmoment__line" html={x.line} />
                    </div>
                  </a>
                </li>
              );
            })}
          </ol>
          <H as="p" className="note" html={note} />
        </div>
      </section>
    );
  },
};

// The other venue pages in the same town as this one, as venue cards.
const VenueNearby = {
  label: "Nearby venues",
  fields: { band: shellFields.band, title: rich("Title"), lede: rich("Lede"), note: rich("Note") },
  render: function VenueNearbyRender({ band, title, lede, note, wrapStyle }) {
    const s = useSite();
    const here = s.page && s.page.root && s.page.root.props;
    const group = here && here.venue && here.venue.group;
    const venues = (s.model.VENUES || []).filter((v) => v.group === group && v.path !== here.path);
    if (!venues.length) return null;
    return (
      <section className={cx(bandClass(band || "ruled"), "venues-hub vnearby")}>
        <div className="wrap" style={css(wrapStyle)}>
          <H as="h2" className="h2" html={title} />
          <H as="p" className="lede" html={lede} />
          <VenueCards s={s} venues={venues} />
          <H as="p" className="note" html={note} />
        </div>
      </section>
    );
  },
};

export const fixedSections = { LogoStrip, PagesAndPosts, HomeHero, RangeStrip, CoverStrip, CoverWall, ActHeader, ActAbout, ActSizes, Setlist, ActHonors, HonorsWall, ActVenues, ActClose, VendorList, VenueList, VenueSpaces, VenueMoments, VenueNearby, ContactForm, Roster, SongCatalog };

export const components = { ...blockSections, ...fixedSections, ActOwn };

export const categories = {
  sections: { title: "Sections", components: Object.keys(blockSections) },
  parts: { title: "Parts", components: Object.keys(fixedSections) },
};

export { Fragment };
