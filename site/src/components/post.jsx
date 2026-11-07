/* Blog posts: the article frame and its block types. Prose is stored as the
   HTML its Markdown always produced. */
import { Fragment } from "react";
import { H, Pic, Raw, useHref, useSite, YouTube } from "./parts.jsx";
import { SIZES } from "../lib/pictures.js";
import { renderChart } from "./dataviz.js";
import { ratioStyle, runs } from "../lib/layouts.js";

const rich = (label) => ({ type: "richtext", label, contentEditable: true });
const text = (label) => ({ type: "text", label });
const area = (label) => ({ type: "textarea", label });

// Python's slugify for subhead anchors: drop what is not a word character,
// space or hyphen, then hyphenate.
export const slugify = (t) =>
  String(t)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_\s-]/gu, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "");

const mmss = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;

export const blocks = {
  Prose: {
    label: "Text",
    fields: { html: rich("Text") },
    render: ({ html }) => <H as="div" className="blog-prose" html={html} />,
  },
  Subhead: {
    label: "Subheading",
    fields: { text: text("Text"), level: { type: "select", label: "Level", options: [{ label: "H2", value: 2 }, { label: "H3", value: 3 }] }, anchor: text("Anchor") },
    render: ({ text: t, level = 2, anchor }) => {
      const Tag = `h${level}`;
      const a = anchor || slugify(t || "");
      return (
        <Tag id={a} className={`blog-subhead blog-subhead--h${level}`}>
          {t}{" "}
          <a href={`#${a}`} className="anchor-link" aria-label="Link to section">#</a>
        </Tag>
      );
    },
  },
  Pullquote: {
    label: "Pull quote",
    fields: { text: area("Quote"), attribution: text("By") },
    render: ({ text: t, attribution }) => (
      <figure className="blog-pullquote">
        <blockquote>{t}</blockquote>
        {attribution ? <figcaption>{"— " + attribution}</figcaption> : null}
      </figure>
    ),
  },
  StatCallout: {
    label: "Big number",
    fields: { number: text("Number"), label: text("Label"), source: text("Source") },
    render: ({ number, label, source }) => (
      <div className="blog-stat">
        <div className="blog-stat-number">{String(number ?? "")}</div>
        <div className="blog-stat-label">{label}</div>
        <div className="blog-stat-source">{source}</div>
      </div>
    ),
  },
  DataViz: {
    label: "Chart",
    fields: { chart_type: { type: "select", label: "Kind", options: [{ label: "Bar", value: "bar" }, { label: "Line", value: "line" }, { label: "Comparison", value: "comparison" }] }, title: text("Title"), caption: text("Caption"), source: text("Source"), data: { type: "array", label: "Data", getItemSummary: (d) => d.label, arrayFields: { label: text("Label"), value: { type: "number", label: "Value" } } } },
    render: (b) => <Raw html={renderChart(b)} />,
  },
  Figure: {
    label: "Photo",
    fields: { src: text("File"), alt: text("Alt text"), caption: text("Caption"), source: text("Source") },
    render: function FigureRender({ src, alt, caption, source }) {
      const href = useHref();
      return (
        <figure className="blog-figure">
          <Pic src={href(src)} alt={alt} loading="lazy" sizes={SIZES.post} />
          {caption || source ? (
            <figcaption>
              {caption || null}
              {caption && source ? " — " : null}
              {source ? <cite>{source}</cite> : null}
            </figcaption>
          ) : null}
        </figure>
      );
    },
  },
  Aside: {
    label: "Aside",
    fields: { title: text("Title"), html: rich("Text") },
    render: ({ title, html }) => (
      <aside className="blog-aside">
        <div className="blog-aside-title">{title}</div>
        <H as="div" className="blog-aside-body" html={html} />
      </aside>
    ),
  },
  ComparisonTable: {
    label: "Comparison table",
    fields: {
      title: text("Title"),
      columns: { type: "array", label: "Columns", getItemSummary: (c) => c.text, arrayFields: { text: text("Heading") } },
      rows: { type: "array", label: "Rows", getItemSummary: (r) => (r.cells && r.cells[0] ? r.cells[0].text : ""), arrayFields: { cells: { type: "array", label: "Cells", arrayFields: { text: text("Text") } } } },
    },
    render: ({ title, columns = [], rows = [] }) => (
      <figure className="blog-comparison-table">
        {title ? <figcaption className="blog-comparison-title">{title}</figcaption> : null}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((c, i) => <th key={i} scope="col">{String(c.text)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.cells.map((cell, j) =>
                    j === 0 ? <th key={j} scope="row" data-label={columns[0] && columns[0].text}>{String(cell.text)}</th> : <td key={j} data-label={columns[j] && columns[j].text}>{String(cell.text)}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </figure>
    ),
  },
  KeyTakeaways: {
    label: "Key takeaways",
    fields: { items: { type: "array", label: "Items", arrayFields: { text: text("Text") } } },
    render: ({ items = [] }) => (
      <div className="blog-takeaways">
        <div className="blog-takeaways-title">Key takeaways</div>
        <ul>
          {items.map((it, i) => <li key={i}>{it.text}</li>)}
        </ul>
      </div>
    ),
  },
  Methodology: {
    label: "How we measured",
    fields: { what_we_measured: area("What we measured"), sample: area("Sample"), date_range: text("Date range"), caveats: area("Caveats") },
    render: (b) => (
      <details className="blog-methodology">
        <summary>Methodology</summary>
        <dl>
          <dt>What we measured</dt>
          <dd>{b.what_we_measured}</dd>
          <dt>Sample</dt>
          <dd>{b.sample}</dd>
          <dt>Date range</dt>
          <dd>{b.date_range}</dd>
          <dt>Caveats</dt>
          <dd>{b.caveats}</dd>
        </dl>
      </details>
    ),
  },
  PostCta: {
    label: "Call to action",
    fields: { headline: text("Headline"), html: rich("Text"), link: text("Link"), link_text: text("Button") },
    render: function CtaRender({ headline, html, link, link_text }) {
      const href = useHref();
      return (
        <aside className="blog-cta">
          <div className="blog-cta-headline">{headline}</div>
          <H as="div" className="blog-cta-body" html={html} />
          <a href={href(link)} className="btn blog-cta-btn">{link_text}</a>
        </aside>
      );
    },
  },
  RelatedPosts: {
    label: "Related posts",
    fields: { posts: { type: "array", label: "Posts", getItemSummary: (p) => p.slug, arrayFields: { slug: text("Post") } } },
    render: function RelatedRender({ posts = [] }) {
      const s = useSite();
      const href = useHref();
      const found = posts.map((x) => s.model.postBySlug[x.slug]).filter((d) => d && !d.root.props.draft).map((d) => d.root.props);
      const L = s.model.L.postCard;
      return (
        <section className="blog-related" aria-label="Related posts">
          <h2 className="blog-subhead blog-subhead--h2">Keep reading</h2>
          <div className="blog-related-grid">
            {found.map((p, k) => {
              // The card's parts sit on their own lines in the template, so
              // a space separates them inside the link.
              // The post card layout's parts; the date and reading time
              // show in the blog list only.
              const part = {
                photo: () => (p.hero && p.hero.src ? <Pic key="i" src={href(p.hero.src)} alt="" class="media" loading="lazy" width="1600" height="900" style={ratioStyle(L.ratio)} sizes={SIZES.related} /> : null),
                eyebrow: () => (p.eyebrow ? <span key="e" className="eyebrow">{p.eyebrow}</span> : null),
                title: () => <span key="t" className="blog-related-card-title">{p.title}</span>,
                dek: () => (p.dek ? <span key="d" className="blog-related-dek">{p.dek}</span> : null),
              };
              const parts = L.parts.filter((x) => x.on && part[x.id]).map((x) => part[x.id]()).filter(Boolean);
              return (
                <Fragment key={p.slug}>
                  {k ? " " : null}
                  <a href={href(`/blog/${p.slug}/`)} className="blog-related-card">
                    {" "}
                    {parts.flatMap((x, i) => [x, <Fragment key={"s" + i}>{" "}</Fragment>])}
                  </a>
                </Fragment>
              );
            })}
          </div>
        </section>
      );
    },
  },
  Video: {
    label: "Video",
    fields: { caption: text("Caption") },
    render: function VideoRender({ caption }) {
      const s = useSite();
      const v = s.post && s.post.video;
      if (!v || !v.id) return null;
      return (
        <div className="blog-video">
          <div className="blog-video-frame">
            <YouTube
              id={v.id}
              src={`https://www.youtube-nocookie.com/embed/${v.id}?rel=0`}
              title={v.title || s.post.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              sizes={SIZES.post}
            />
          </div>
          {caption ? <p className="blog-video-caption">{caption}</p> : null}
        </div>
      );
    },
  },
  Transcript: {
    label: "Chapters",
    fields: { chapters: { type: "array", label: "Chapters", getItemSummary: (c) => c.label, arrayFields: { label: text("Label"), time: { type: "number", label: "Seconds" }, html: rich("Text") } } },
    render: function TranscriptRender({ chapters = [] }) {
      const s = useSite();
      const v = s.post && s.post.video;
      const watch = "https://www.youtube.com/watch?v=" + (v ? v.id : "");
      const hasBody = chapters.some((c) => c.html);
      return (
        <div className="blog-transcript">
          <h2 className="blog-subhead blog-subhead--h2" id="chapters">Chapters</h2>
          <ol className="blog-transcript-toc">
            {chapters.map((c, i) => (
              <li key={i}>
                {v && v.id ? (
                  <a href={`${watch}&t=${c.time}s`} target="_blank" rel="noopener">
                    <span className="blog-transcript-time">{mmss(c.time)}</span>{" " + c.label}
                  </a>
                ) : (
                  <>
                    <span className="blog-transcript-time">{mmss(c.time)}</span>{" " + c.label}
                  </>
                )}
              </li>
            ))}
          </ol>
          {hasBody ? (
            <>
              <h2 className="blog-subhead blog-subhead--h2" id="transcript">Transcript</h2>
              {chapters.filter((c) => c.html).map((c, i) => (
                <Fragment key={i}>
                  <h3 className="blog-transcript-chapter" id={slugify(c.label)}>
                    <span className="blog-transcript-time">{mmss(c.time)}</span>{" " + c.label}
                  </h3>
                  <Raw html={c.html} />
                </Fragment>
              ))}
            </>
          ) : null}
        </div>
      );
    },
  },
  References: {
    label: "Sources",
    fields: { heading: text("Heading"), items: { type: "array", label: "Sources", getItemSummary: (r) => r.text, arrayFields: { text: area("Citation"), url: text("Link"), link_text: text("Link text") } } },
    render: ({ heading, items = [] }) =>
      items.length ? (
        <div className="blog-references">
          <h2 className="blog-subhead blog-subhead--h2" id="references">{heading || "References"}</h2>
          <ol className="blog-references-list">
            {items.map((it, i) => (
              <li key={i}>
                {it.text}
                {it.url ? <>{" "}<a href={it.url} rel="noopener">{it.link_text || "Read the source"}</a></> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null,
  },
};

const ANCHOR_SCRIPT = `<script>
  // Anchor-link copy for subheads. Click puts the section URL on the
  // clipboard; the # flips to a check for a moment as the receipt.
  document.querySelectorAll('.anchor-link').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      navigator.clipboard.writeText(
        window.location.origin + window.location.pathname + a.getAttribute('href')
      );
      a.textContent = '✓';
      setTimeout(function () { a.textContent = '#'; }, 1500);
    });
  });
</script>`;

function Block({ c }) {
  const C = blocks[c.type];
  if (!C) throw new Error(`Unknown post block ${c.type}`);
  const R = C.render;
  return <R {...c.props} puck={{ isEditing: false }} />;
}

// The article's frame: the header and hero, then what goes inside, in the
// post layout's parts and order. The site draws a post with it, and so does
// the editor.
const HEADER = ["eyebrow", "title", "dek", "byline"];
export function PostFrame({ p, minutes, content, children }) {
  const s = useSite();
  const href = useHref();
  const L = s.model.L.post;
  const author = p.author || {};
  const sep = <span className="blog-byline-sep" aria-hidden="true">{"·"}</span>;
  const subheads = (content || []).filter((c) => c.type === "Subhead" && Number(c.props.level || 2) === 2 && typeof c.props.text === "string" && c.props.text.trim());
  const part = {
    eyebrow: () => <p key="eyebrow" className="eyebrow">{p.eyebrow}</p>,
    title: () => <h1 key="title" className="h1 blog-headline">{p.title}</h1>,
    dek: () => <p key="dek" className="lede blog-dek">{p.dek}</p>,
    byline: () => (
      <p key="byline" className="blog-byline">
        <span className="blog-byline-author">{author.name}</span>{" "}
        {author.role ? <>{sep}{" "}<span>{author.role}</span>{" "}</> : null}
        {sep}{" "}
        <time dateTime={p.date}>{s.model.dateDisplay(p.date)}</time>{" "}
        {sep}{" "}
        <span>{`${minutes} min read`}</span>
      </p>
    ),
    hero: (k) =>
      p.hero && p.hero.src ? (
        <figure key={k} className="blog-hero">
          <Pic class="media" src={href(p.hero.src)} alt={p.hero.alt} width="1600" height="900" loading="eager" fetchpriority="high" style={ratioStyle(L.heroRatio)} sizes={SIZES.post} />
          {p.hero.caption ? <figcaption className="blog-hero-caption">{p.hero.caption}</figcaption> : null}
        </figure>
      ) : null,
    contents: (k) =>
      subheads.length ? (
        <nav key={k} className="blog-takeaways blog-contents" aria-label="In this post">
          <div className="blog-takeaways-title">In this post</div>
          <ul>
            {subheads.map((c) => (
              <li key={c.props.id}>
                <a href={`#${c.props.anchor || slugify(c.props.text)}`}>{c.props.text}</a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null,
  };
  return (
    <section className="section section--top">
      <div className="wrap">
        <article className="blog-article">
          {runs(L, HEADER).map((r, i) =>
            r.group ? (
              <header key={i} className="blog-header">
                {r.ids.map((id) => part[id]())}
              </header>
            ) : (
              part[r.id](i)
            )
          )}
          {children}
        </article>
      </div>
    </section>
  );
}

// The article: key takeaways first, the body, then the call to action and
// the related posts wherever they sit in the list.
export function PostArticle({ doc }) {
  const s = useSite();
  const kt = doc.content.filter((c) => c.type === "KeyTakeaways");
  const cta = doc.content.filter((c) => c.type === "PostCta");
  const rel = doc.content.filter((c) => c.type === "RelatedPosts");
  const body = doc.content.filter((c) => !["KeyTakeaways", "PostCta", "RelatedPosts"].includes(c.type));
  const last = (list) => (list.length ? [list[list.length - 1]] : []);
  return (
    <>
      <PostFrame p={doc.root.props} minutes={s.model.readingTime(doc)} content={doc.content}>
        {last(kt).map((c) => <Block key={c.props.id} c={c} />)}
        <div className="blog-body">
          {body.map((c) => <Block key={c.props.id} c={c} />)}
        </div>
        {last(cta).map((c) => <Block key={c.props.id} c={c} />)}
        {last(rel).map((c) => <Block key={c.props.id} c={c} />)}
      </PostFrame>
      <Raw html={ANCHOR_SCRIPT} />
    </>
  );
}
