/* Pages and parts whose lists come from the act, video and post files:
   the clip index, a clip's own page, and Custom HTML for the one-offs. */
import { esc } from "../lib/util.js";
import { isoSeconds } from "../build/feeds.js";
import { H, Pic, Raw, useHref, useSite } from "./parts.jsx";

export const CustomHtml = {
  label: "Custom HTML",
  fields: { html: { type: "textarea", label: "HTML" } },
  defaultProps: { html: "" },
  render: ({ html }) => <Raw html={html} />,
};

function ClipCard({ v }) {
  const s = useSite();
  const href = useHref();
  const src = v.poster ? s.prefix + v.poster : v.id ? `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg` : "";
  const secs = isoSeconds(v.duration);
  return (
    <a className="clip-card" href={href(`/${s.model.WATCH_BASE}/${v.slug}/`)}>
      {src ? <Pic class="clip-thumb" src={src} alt="" width="320" height="180" loading="lazy" decoding="async" /> : null}
      <span className="clip-title">{v.name}</span>
      <span className="clip-time">{`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`}</span>
    </a>
  );
}

// Every clip, grouped by act in the roster's order.
export function clipGroups(m) {
  return [...m.FORMAT_ACTS, ...m.NAMED_ACTS].map((a) => ({ act: a, clips: m.FOOTAGE.filter((v) => v.act === a.id) })).filter((g) => g.clips.length);
}

export const VideoIndex = {
  label: "Video clips",
  fields: {
    eyebrow: { type: "richtext", label: "Eyebrow", contentEditable: true },
    title: { type: "richtext", label: "Title", contentEditable: true },
    lede: { type: "richtext", label: "Lede", contentEditable: true },
  },
  render: function VideoIndexRender({ eyebrow, title, lede }) {
    const s = useSite();
    const m = s.model;
    const groups = clipGroups(m);
    return (
      <>
        <section className="section section--top">
          <div className="wrap">
            <div className="heading">
              <H as="p" className="eyebrow eyebrow--slab" html={eyebrow} />
              <H as="h1" className="h2 display" html={title} />
              <H as="p" className="lede" html={lede} />
            </div>
            <nav className="jump-list" aria-label="Acts">
              <ul className="sibling-list">
                {groups.map((g) => (
                  <li key={g.act.id}><a href={`#clips-${g.act.id}`}>{g.act.name}</a></li>
                ))}
              </ul>
            </nav>
          </div>
        </section>
        <section className="section section--ruled clips">
          <div className="wrap">
            {groups.map((g) => {
              const actHref = m.actUrl(g.act, s.prefix);
              return (
                <div className="clip-group" id={`clips-${g.act.id}`} key={g.act.id}>
                  <div className="heading">
                    <p className="eyebrow">{g.act.style}</p>
                    <h2 className="h3"><a href={actHref}>{g.act.name}</a></h2>
                  </div>
                  <div className="clip-grid">
                    {g.clips.map((v) => <ClipCard key={v.slug} v={v} />)}
                  </div>
                  <p className="note"><a href={actHref}>{"See " + g.act.name}</a></p>
                </div>
              );
            })}
          </div>
        </section>
      </>
    );
  },
};

// A clip's own page: the clip at the top, its words, the act it books and
// the act's other clips.
export function WatchPage({ v }) {
  const s = useSite();
  const m = s.model;
  const act = m.ACT_BY_ID[v.act];
  const actHref = m.actUrl(act, s.prefix);
  const others = m.FOOTAGE.filter((x) => x.act === v.act && x.slug !== v.slug);
  const player = v.id ? (
    <div className="act-video watch-video">
      <iframe src={`https://www.youtube-nocookie.com/embed/${v.id}?rel=0`} title={v.name} allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowFullScreen />
    </div>
  ) : (
    <div className="act-video watch-video">
      <video src={s.prefix + v.file} poster={v.poster ? s.prefix + v.poster : undefined} title={v.name} controls preload="metadata" playsInline />
    </div>
  );
  return (
    <>
      <section className="section section--top watch">
        <div className="wrap">
          <div className="heading">
            <p className="eyebrow eyebrow--slab">{act.style}</p>
            <h1 className="h1 display">{v.name}</h1>
          </div>
          {player}
          <p className="lede">{v.description}</p>
          <div className="btn-row">
            <a className="btn" href={`${s.prefix}contact/?act=${act.id}`}>Check a date</a>
            <a className="btn btn--outline" href={actHref}>{"See " + act.name}</a>
          </div>
        </div>
      </section>
      {others.length ? (
        <section className="section section--ruled siblings">
          <div className="wrap">
            <p className="eyebrow">
              {"More "}<a href={`${s.prefix}${m.WATCH_BASE}/`}>video clips</a>{" of "}<a href={actHref}>{act.name}</a>
            </p>
            <ul className="sibling-list">
              {others.map((x) => (
                <li key={x.slug}><a href={`${s.prefix}${m.WATCH_BASE}/${x.slug}/`}>{x.name}</a></li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </>
  );
}

export const watchHeadExtra = (m, v) =>
  v.id
    ? `<meta property="og:video" content="https://www.youtube.com/embed/${esc(v.id)}">`
    : `<meta property="og:video" content="${m.SITE_URL}/${esc(v.file)}"><meta property="og:video:type" content="video/mp4">`;
