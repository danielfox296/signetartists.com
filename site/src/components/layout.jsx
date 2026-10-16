/* The frame around every page: header, breadcrumb, the lists back down and
   across, and the footer. The trail and the lists are computed from the
   URL and the page, post and video files, never stored. */
import { Fragment } from "react";
import { H, Raw, useHref, useSite } from "./parts.jsx";

// Links written one per line in the partials have a space between them.
const spaced = (els) => els.flatMap((e, i) => (i ? [<Fragment key={"s" + i}>{" "}</Fragment>, e] : [e]));

export function Header({ nav }) {
  const s = useSite();
  const href = useHref();
  const h = s.model.c.header;
  const current = (n) => (n.key && n.key === nav ? "page" : undefined);
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <div className="wrap header-inner">
          <div className="brand-lockup">
            <a className="wordmark" href={s.prefix || "./"}>{s.model.brand.name}</a>
            <p className="header-loc">{h.tagline}</p>
          </div>
          <nav className="nav-desktop">
            {spaced(h.nav.map((n, i) => (
              <a key={i} className={n.cls || undefined} href={href(n.href)} aria-current={current(n)}>{n.label}</a>
            )))}
          </nav>
          <button type="button" className="nav-toggle" aria-expanded="false" aria-controls="mobile-nav">Menu</button>
        </div>
        <nav className="nav-mobile" id="mobile-nav">
          {spaced(h.navMobile.map((n, i) => (
            <a key={i} className={n.cls || undefined} href={href(n.href)} aria-current={current(n)}>{n.label}</a>
          )))}
        </nav>
      </header>
    </>
  );
}

export function Footer() {
  const s = useSite();
  const href = useHref();
  const f = s.model.c.footer;
  const b = s.model.brand;
  return (
    <footer className="site-footer">
      <div className="wrap footer-head">
        <div className="footer-brand">
          <p className="wordmark">{b.name}</p>
          <p className="footer-line">{f.line}</p>
        </div>
        <div className="footer-contact">
          {spaced([
            <a key="e" className="footer-email" href={"mailto:" + b.email}>{b.email}</a>,
            ...f.links.map((l, i) => (
              <a key={i} className={l.cls || undefined} href={href(l.href)} rel={l.rel || undefined}>{l.label}</a>
            )),
          ])}
        </div>
      </div>
      <div className="wrap footer-band">
        {f.columns.map((c, i) => (
          <div className="footer-col" key={i}>
            <p className="eyebrow">{c.title}</p>
            <ul className="footer-list">
              {c.links.map((l, j) => (
                <li key={j}><a href={href(l.href)}>{l.label}</a></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="wrap footer-base">
        <ul className="footer-base-links">
          {f.baseLinks.map((l, i) => (
            <li key={i}><a href={href(l.href)}>{l.label}</a></li>
          ))}
        </ul>
        <div className="footer-base-meta">
          {f.meta.map((m, i) => (
            <p key={i} className={m.cls}>{m.text}</p>
          ))}
        </div>
      </div>
    </footer>
  );
}

export function Breadcrumb({ trail }) {
  const href = useHref();
  if (!trail) return null;
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <div className="wrap">
        <ol>
          {trail.map(([u, label], i) => (
            <li key={i}>{i === trail.length - 1 ? <span aria-current="page">{label}</span> : <a href={href(u)}>{label}</a>}</li>
          ))}
        </ol>
      </div>
    </nav>
  );
}

function LinkList({ rows, cls = "sibling-list" }) {
  const href = useHref();
  return (
    <ul className={cls}>
      {rows.map(([u, label], i) => (
        <li key={i}><a href={href(u)}>{label}</a></li>
      ))}
    </ul>
  );
}

export const postLinks = (posts) => posts.map((p) => [`/blog/${p.slug}/`, p.title]);

// The trail's way back down and across: the act's clips, the posts filed
// under the page, and the other pages in its folder.
export function Below({ output, hubs }) {
  const s = useSite();
  const m = s.model;
  const href = useHref();
  const url = "/" + output.replace("index.html", "");
  const clips = m.actClips(url);
  const related = m.relatedArticles(url, hubs);
  const sib = m.siblings(output);
  return (
    <>
      {clips ? (
        <section className="section section--ruled related">
          <div className="wrap">
            <p className="eyebrow"><a href={href(`/${m.WATCH_BASE}/`)}>Video clips</a>{" of " + clips.act.name}</p>
            <LinkList rows={clips.clips.map((v) => [`/${m.WATCH_BASE}/${v.slug}/`, v.name])} />
          </div>
        </section>
      ) : null}
      {related ? (
        <section className="section section--ruled related">
          <div className="wrap">
            <p className="eyebrow">Related articles</p>
            <LinkList rows={postLinks(related)} />
          </div>
        </section>
      ) : null}
      {sib ? (
        <section className="section section--ruled siblings">
          <div className="wrap">
            <p className="eyebrow">{sib.lead + " "}<a href={href(sib.parent)}>{sib.parentLabel}</a></p>
            <LinkList rows={sib.peers} />
          </div>
        </section>
      ) : null}
    </>
  );
}

const NAV_SCRIPT = `
    // Mobile nav toggle. The button label doubles as the state indicator, the
    // same as the React version it replaced.
    (function () {
      var btn = document.querySelector('.nav-toggle');
      var panel = document.querySelector('.nav-mobile');
      if (!btn || !panel) { return; }
      btn.addEventListener('click', function () {
        var open = panel.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.textContent = open ? 'Close' : 'Menu';
      });
    })();

  `;

// The whole <body>: header, main, footer and the menu script.
export function Body({ nav, trail, output, hubs, indexed, children }) {
  return (
    <>
      <Header nav={nav} />
      <main id="main" tabIndex={-1}>
        {indexed ? <Breadcrumb trail={trail} /> : null}
        {children}
        {indexed ? <Below output={output} hubs={hubs} /> : null}
      </main>
      <Footer />
      <Raw html={`<script>${NAV_SCRIPT}</script>`} />
    </>
  );
}

export { H };
