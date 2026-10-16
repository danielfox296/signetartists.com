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

// The blog index list: every published post, newest first, the category as
// the eyebrow. Written for the blog index page, so links are its own.
export const BlogPosts = {
  label: "Blog list",
  fields: {},
  render: function BlogPostsRender() {
    const s = useSite();
    const m = s.model;
    const posts = m.published.map((d) => d.root.props);
    if (!posts.length) {
      return (
        <>
          <p className="prose">The first entry is on its way.</p>
          <p className="note">{"There is an "}<a href="../rss.xml">RSS feed</a>{" if you would rather subscribe than check back."}</p>
        </>
      );
    }
    const sep = <span className="blog-row-sep" aria-hidden="true">{"·"}</span>;
    const thumb = (src) => {
      const rel = src.replace(/^\//, "");
      if (/^(https?:)?\/\//.test(src)) return src;
      const t = `img/thumbs/${rel.split("/").pop()}`;
      return m.c.exists(t) ? t : rel;
    };
    return (
      <div className="blog-list">
        {posts.map((p, i) => (
          <a className="blog-row" href={`${p.slug}/`} key={p.slug}>
            {p.hero && p.hero.src ? <Pic class="blog-row-thumb" src={s.prefix + thumb(p.hero.src)} alt="" width="640" height="360" loading={i < 2 ? "eager" : "lazy"} decoding="async" /> : null}
            <div className="blog-row-text">
              <p className="blog-row-meta">
                <span className="blog-row-eyebrow">{p.eyebrow || ""}</span>
                {sep}
                <time dateTime={p.date}>{m.dateDisplay(p.date)}</time>
                {sep}
                <span>{`${p.readingTime} min read`}</span>
              </p>
              <h2 className="blog-row-title">{p.title}</h2>
              <p className="blog-row-dek">{p.dek || ""}</p>
            </div>
          </a>
        ))}
      </div>
    );
  },
};

// The HTML sitemap: every indexed page by tree, in the header's order,
// then the posts. Built from the same list as sitemap.xml.
export const PageIndex = {
  label: "All pages",
  fields: {},
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
    const tops = (top || []).filter((o) => byOutput[o]).map((o) => byOutput[o]);
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
