/* Pages and parts whose lists come from the act, video and post files:
   the clip index, a clip's own page, and Custom HTML for the one-offs. */
import { Fragment } from "react";
import { esc } from "../lib/util.js";
import { ratioStyle, runs } from "../lib/layouts.js";
import { isoSeconds } from "../build/feeds.js";
import { H, Pic, Raw, useHref, useSite } from "./parts.jsx";
import { SIZES } from "../lib/pictures.js";

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
      {src ? <Pic class="clip-thumb" src={src} alt="" width="320" height="180" loading="lazy" decoding="async" sizes={SIZES.clip} /> : null}
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
  // The video page layout's parts and order. The style line and the title
  // next to each other share one heading; the other clips are a band of
  // their own, above the clip or below it.
  const L = m.L.video;
  const part = {
    style: () => <p key="style" className="eyebrow eyebrow--slab">{act.style}</p>,
    title: () => <h1 key="title" className="h1 display">{v.name}</h1>,
    player: (k) => <Fragment key={k}>{player}</Fragment>,
    description: (k) => <p key={k} className="lede">{v.description}</p>,
    buttons: (k) => (
      <div key={k} className="btn-row">
        <a className="btn" href={`${s.prefix}contact/?act=${act.id}`}>Check a date</a>
        <a className="btn btn--outline" href={actHref}>{"See " + act.name}</a>
      </div>
    ),
  };
  const on = L.parts.filter((x) => x.on);
  const main = (
    <section key="main" className="section section--top watch">
      <div className="wrap">
        {runs({ parts: on.filter((x) => x.id !== "more") }, ["style", "title"]).map((r, i) =>
          r.group ? (
            <div key={i} className="heading">
              {r.ids.map((id) => part[id]())}
            </div>
          ) : (
            part[r.id](i)
          )
        )}
      </div>
    </section>
  );
  const more =
    on.some((x) => x.id === "more") && others.length ? (
      <section key="more" className="section section--ruled siblings">
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
    ) : null;
  return <>{on.length && on[0].id === "more" ? [more, main] : [main, more]}</>;
}

export const watchHeadExtra = (m, v) =>
  v.id
    ? `<meta property="og:video" content="https://www.youtube.com/embed/${esc(v.id)}">`
    : `<meta property="og:video" content="${m.SITE_URL}/${esc(v.file)}"><meta property="og:video:type" content="video/mp4">`;

const META = ["eyebrow", "date", "time"];
const ROW_TEXT = ["eyebrow", "date", "time", "title", "dek"];

// The blog index list: every published post, newest first, the category as
// the eyebrow. Written for the blog index page, so links are its own.
export const BlogPosts = {
  label: "Blog list",
  fields: {},
  render: function BlogPostsRender() {
    const s = useSite();
    const m = s.model;
    const docs = m.published;
    const posts = docs.map((d) => d.root.props);
    if (!posts.length) {
      return (
        <>
          <p className="prose">The first entry is on its way.</p>
          <p className="note">{"There is an "}<a href="../rss.xml">RSS feed</a>{" if you would rather subscribe than check back."}</p>
        </>
      );
    }
    const sep = <span className="blog-row-sep" aria-hidden="true">{"·"}</span>;
    const L = m.L.postCard;
    const thumb = (src) => {
      const rel = src.replace(/^\//, "");
      if (/^(https?:)?\/\//.test(src)) return src;
      const t = `img/thumbs/${rel.split("/").pop()}`;
      return m.c.exists(t) ? t : rel;
    };
    return (
      <div className="blog-list">
        {posts.map((p, i) => {
          // The post card layout's parts and order; the eyebrow, date and
          // reading time next to each other share one line.
          const part = {
            eyebrow: () => <span key="e" className="blog-row-eyebrow">{p.eyebrow || ""}</span>,
            date: () => <time key="d" dateTime={p.date}>{m.dateDisplay(p.date)}</time>,
            time: () => <span key="t">{`${m.readingTime(docs[i])} min read`}</span>,
            title: () => <h2 key="title" className="blog-row-title">{p.title}</h2>,
            dek: () => <p key="dek" className="blog-row-dek">{p.dek || ""}</p>,
          };
          const text = (ids) => {
            const out = [];
            for (const id of ids) {
              const last = out[out.length - 1];
              if (META.includes(id) && Array.isArray(last)) last.push(id);
              else out.push(META.includes(id) ? [id] : id);
            }
            return out.map((x, k) =>
              Array.isArray(x) ? (
                <p key={k} className="blog-row-meta">
                  {x.map((id, j) => (j ? [<Fragment key={"s" + j}>{sep}</Fragment>, part[id]()] : part[id]()))}
                </p>
              ) : (
                part[x]()
              )
            );
          };
          return (
            <a className="blog-row" href={`${p.slug}/`} key={p.slug}>
              {runs(L, ROW_TEXT).map((r, k) =>
                r.group ? (
                  <div key={k} className="blog-row-text">{text(r.ids)}</div>
                ) : p.hero && p.hero.src ? (
                  <Pic key={k} class="blog-row-thumb" src={s.prefix + thumb(p.hero.src)} alt="" width="640" height="360" loading={i < 2 ? "eager" : "lazy"} decoding="async" style={ratioStyle(L.ratio)} sizes={SIZES.row} />
                ) : null
              )}
            </a>
          );
        })}
      </div>
    );
  },
};

// The HTML sitemap: every indexed page by tree, in the header's order,
// then the posts. Built from the same list as sitemap.xml.
export const PageIndex = {
  label: "All pages",
  fields: {
    top: { type: "array", label: "First", getItemSummary: (t) => t.output, arrayFields: { output: { type: "text", label: "Page" } } },
    groups: { type: "array", label: "Groups", getItemSummary: (g) => g.heading, arrayFields: { prefix: { type: "text", label: "Folder" }, heading: { type: "text", label: "Heading" }, lanes: { type: "radio", label: "Acts by lane", options: [{ label: "No", value: false }, { label: "Yes", value: true }] } } },
  },
  render: function PageIndexRender({ top, groups }) {
    const s = useSite();
    const m = s.model;
    const live = (s.built || []).filter((b) => !(b.robots || "").startsWith("noindex") && b.output !== "404.html");
    const byOutput = Object.fromEntries(live.map((b) => [b.output, b]));
    const used = new Set();
    const rows = [];
    const label = (b) => b.indexLabel || b.title.split("|")[0].split(":")[0].trim();
    const emit = (heading, group) => {
      group.forEach((b) => used.add(b.output));
      rows.push([heading, group.map((b) => ["/" + b.output.replace("index.html", ""), label(b)])]);
    };
    const tops = (top || []).map((t) => t.output).filter((o) => byOutput[o]).map((o) => byOutput[o]);
    if (tops.length) emit("The site", tops);
    const depth = (o) => (o.match(/\//g) || []).length;
    for (const g of groups || []) {
      if (g.lanes) {
        for (const [heading, acts] of [["Configurations", m.FORMAT_ACTS], ["Named acts", m.NAMED_ACTS]]) {
          const group = acts.filter((a) => a.page && byOutput[a.page + "index.html"] && !used.has(a.page + "index.html")).map((a) => byOutput[a.page + "index.html"]);
          if (group.length) emit(heading, group);
        }
      }
      const group = live.filter((b) => b.output.startsWith(g.prefix) && !used.has(b.output)).sort((a, b) => depth(a.output) - depth(b.output) || (a.output < b.output ? -1 : a.output > b.output ? 1 : 0));
      if (group.length) emit(g.heading, group);
    }
    const rest = live.filter((b) => !used.has(b.output)).sort((a, b) => (a.output < b.output ? -1 : a.output > b.output ? 1 : 0));
    if (rest.length) emit("Elsewhere", rest);
    const posts = m.indexedPosts.map((d) => d.root.props);
    if (posts.length) rows.push(["Notes", posts.map((p) => [`/blog/${p.slug}/`, p.title])]);
    const href = (u) => s.prefix + u.slice(1);
    return (
      <dl className="def-list def-list--stack">
        {rows.map(([heading, links], i) => (
          <div className="def-row" key={i}>
            <dt>{heading}</dt>
            <dd>
              <ul className="index-list">
                {links.map(([u, t], j) => <li key={j}><a href={href(u)}>{t}</a></li>)}
              </ul>
            </dd>
          </div>
        ))}
      </dl>
    );
  },
};
