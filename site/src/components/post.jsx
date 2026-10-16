/* Blog posts: the article frame and its block types. Prose is stored as the
   HTML its Markdown always produced. */
import { Fragment } from "react";
import { H, Pic, Raw, useHref, useSite } from "./parts.jsx";
import { renderChart } from "./dataviz.js";

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
    label: "Subhead",
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
    label: "Figure callout",
    fields: { number: text("Figure"), label: text("Label"), source: text("Source") },
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
    fields: { chart_type: text("Chart"), title: text("Title"), caption: text("Caption"), source: text("Source") },
    render: (b) => <Raw html={renderChart(b)} />,
  },
  Figure: {
    label: "Picture",
    fields: { src: text("File"), alt: text("Alt text"), caption: text("Caption"), source: text("Source") },
    render: function FigureRender({ src, alt, caption, source }) {
      const href = useHref();
      return (
        <figure className="blog-figure">
          <Pic src={href(src)} alt={alt} loading="lazy" />
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
    label: "Table",
    fields: { title: text("Title") },
    render: ({ title, columns = [], rows = [] }) => (
      <figure className="blog-comparison-table">
        {title ? <figcaption className="blog-comparison-title">{title}</figcaption> : null}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((c, i) => <th key={i} scope="col">{String(c)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {r.map((cell, j) =>
                    j === 0 ? <th key={j} scope="row" data-label={columns[0]}>{String(cell)}</th> : <td key={j} data-label={columns[j]}>{String(cell)}</td>
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
          {items.map((it, i) => <li key={i}>{typeof it === "string" ? it : it.text}</li>)}
        </ul>
      </div>
    ),
  },
  Methodology: {
    label: "Methodology",
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
    label: "Keep reading",
    fields: {},
    render: function RelatedRender({ posts = [] }) {
      const s = useSite();
      const href = useHref();
      const found = posts.map((slug) => s.model.postBySlug[slug]).filter((d) => d && !d.root.props.draft).map((d) => d.root.props);
      return (
        <section className="blog-related" aria-label="Related posts">
          <h2 className="blog-subhead blog-subhead--h2">Keep reading</h2>
          <div className="blog-related-grid">
            {found.map((p, k) => {
              // The card's parts sit on their own lines in the template, so
              // a space separates them inside the link.
              const parts = [
                p.hero && p.hero.src ? <Pic key="i" src={href(p.hero.src)} alt="" class="media" loading="lazy" width="1600" height="900" /> : null,
                p.eyebrow ? <span key="e" className="eyebrow">{p.eyebrow}</span> : null,
                <span key="t" className="blog-related-card-title">{p.title}</span>,
                p.dek ? <span key="d" className="blog-related-dek">{p.dek}</span> : null,
              ].filter(Boolean);
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
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${v.id}?rel=0`}
              title={v.title || s.post.title}
              loading="lazy"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
          {caption ? <p className="blog-video-caption">{caption}</p> : null}
        </div>
      );
    },
  },
  Transcript: {
    label: "Chapters",
    fields: {},
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
    label: "References",
    fields: { heading: text("Heading") },
    render: ({ heading, items = [] }) =>
      items.length ? (
        <div className="blog-references">
          <h2 className="blog-subhead blog-subhead--h2" id="references">{heading || "References"}</h2>
          <ol className="blog-references-list">
            {items.map((it, i) =>
              typeof it === "object" && it ? (
                <li key={i}>
                  {it.text}
                  {it.url ? <>{" "}<a href={it.url} rel="noopener">{it.link_text || "Read the source"}</a></> : null}
                </li>
              ) : (
                <li key={i}>{it}</li>
              )
            )}
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

// The article: header, hero, key takeaways first, the body, then the call
// to action and the related posts wherever they sit in the list.
export function PostArticle({ doc }) {
  const s = useSite();
  const href = useHref();
  const p = doc.root.props;
  const author = p.author || {};
  const kt = doc.content.filter((c) => c.type === "KeyTakeaways");
  const cta = doc.content.filter((c) => c.type === "PostCta");
  const rel = doc.content.filter((c) => c.type === "RelatedPosts");
  const body = doc.content.filter((c) => !["KeyTakeaways", "PostCta", "RelatedPosts"].includes(c.type));
  const sep = <span className="blog-byline-sep" aria-hidden="true">{"·"}</span>;
  const last = (list) => (list.length ? [list[list.length - 1]] : []);
  return (
    <>
      <section className="section section--top">
        <div className="wrap">
          <article className="blog-article">
            <header className="blog-header">
              <p className="eyebrow">{p.eyebrow}</p>
              <h1 className="h1 blog-headline">{p.title}</h1>
              <p className="lede blog-dek">{p.dek}</p>
              <p className="blog-byline">
                <span className="blog-byline-author">{author.name}</span>{" "}
                {author.role ? <>{sep}{" "}<span>{author.role}</span>{" "}</> : null}
                {sep}{" "}
                <time dateTime={p.date}>{s.model.dateDisplay(p.date)}</time>{" "}
                {sep}{" "}
                <span>{`${p.readingTime} min read`}</span>
              </p>
            </header>
            {p.hero && p.hero.src ? (
              <figure className="blog-hero">
                <Pic class="media" src={href(p.hero.src)} alt={p.hero.alt} width="1600" height="900" loading="eager" fetchpriority="high" />
                {p.hero.caption ? <figcaption className="blog-hero-caption">{p.hero.caption}</figcaption> : null}
              </figure>
            ) : null}
            {last(kt).map((c) => <Block key={c.props.id} c={c} />)}
            <div className="blog-body">
              {body.map((c) => <Block key={c.props.id} c={c} />)}
            </div>
            {last(cta).map((c) => <Block key={c.props.id} c={c} />)}
            {last(rel).map((c) => <Block key={c.props.id} c={c} />)}
          </article>
        </div>
      </section>
      <Raw html={ANCHOR_SCRIPT} />
    </>
  );
}
