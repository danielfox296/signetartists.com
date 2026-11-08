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
            <a className="logo" href={s.prefix || "./"}>
              <img src={href("/img/signet-logo.png")} alt={s.model.brand.name} width="372" height="144" />
            </a>
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
          <a className="logo footer-logo" href={s.prefix || "./"}>
            <img src={href("/img/signet-logo.png")} alt={b.name} width="372" height="144" loading="lazy" decoding="async" />
          </a>
        </div>
        <div className="footer-contact">
          {spaced([
            <p key="l" className="footer-line">{f.line}</p>,
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
            <p className="eyebrow"><a href={href(`/${m.WATCH_BASE}/`)}>Video clips</a>{clips.act.presentation === "spec" ? "" : " of " + clips.act.name}</p>
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

// Even rows for anything that wraps. A grid of cards or tiles never ends on a
// row with one item under three or more: it drops to the nearest column count
// that comes out even (four in three columns becomes two and two). Two across
// with one left over is allowed. A wrapping row of chips or logos that ends
// on one item is narrowed until its rows even out. Runs on load and on every
// width change, and again after a click or change, so filtered lists stay even.
const WRAP_SCRIPT = `
    (function () {
      var SKIP = '.breadcrumb ol, .blog-byline, .blog-row-meta, .wall-grid, .nav-mobile';
      var watched = [];
      function items(el) {
        var out = [];
        for (var i = 0; i < el.children.length; i++) {
          var k = el.children[i], s = getComputedStyle(k);
          if (s.display === 'none' || s.position === 'absolute' || s.position === 'fixed') { continue; }
          out.push(k);
        }
        return out;
      }
      function rows(list) {
        var r = [];
        list.forEach(function (k) {
          var t = k.offsetTop, b = t + k.offsetHeight, last = r[r.length - 1];
          if (last && t < last.b - 2) { last.n++; last.b = Math.max(last.b, b); } else { r.push({ b: b, n: 1 }); }
        });
        return r.map(function (x) { return x.n; });
      }
      function lone(counts) {
        return counts.length > 1 && counts[counts.length - 1] === 1 && Math.max.apply(null, counts) >= 3;
      }
      function tracks(el) {
        var t = getComputedStyle(el).gridTemplateColumns;
        if (!t || t === 'none') { return 0; }
        return t.replace(/\\[[^\\]]*\\]/g, ' ').split(/\\s+/).filter(Boolean).length;
      }
      function pick(n, c) {
        var k, r;
        if (c < 3 || n <= c) { return c; }
        for (k = c; k >= c - 1; k--) { r = n % k; if (r === 0 || r >= k - 1) { return k; } }
        for (k = c; k >= 2; k--) { r = n % k; if (r !== 1 || k === 2) { return k; } }
        return c;
      }
      function kind(el) {
        var s = getComputedStyle(el);
        if (s.display.indexOf('grid') > -1) {
          if (s.gridAutoFlow.indexOf('column') > -1) { return ''; }
          for (var j = 0; j < el.children.length; j++) {
            var c = getComputedStyle(el.children[j]);
            if (c.gridColumnStart !== 'auto' || c.gridColumnEnd !== 'auto') { return ''; }
          }
          return 'grid';
        }
        return s.display.indexOf('flex') > -1 && s.flexWrap === 'wrap' ? 'flex' : '';
      }
      function scan() {
        var all = document.querySelectorAll('main *, footer *');
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          if (el._even || el.children.length < 3 || el.matches(SKIP) || el.closest('.wall-grid') || !kind(el)) { continue; }
          el._even = { gtc: el.style.gridTemplateColumns, mw: el.style.maxWidth, ml: el.style.marginLeft, mr: el.style.marginRight, n: -1 };
          watched.push(el);
        }
      }
      function reset(el) {
        var st = el._even;
        el.style.gridTemplateColumns = st.gtc;
        el.style.maxWidth = st.mw;
        el.style.marginLeft = st.ml;
        el.style.marginRight = st.mr;
      }
      function fitGrid(el, n) {
        var c = tracks(el), k = pick(n, c);
        if (k !== c) { el.style.gridTemplateColumns = 'repeat(' + k + ', minmax(0, 1fr))'; }
      }
      function fitFlex(el, list) {
        var counts = rows(list);
        if (!lone(counts)) { return; }
        var top = el.clientWidth, floor = 0, want = counts.length, found = 0;
        list.forEach(function (k) { floor = Math.max(floor, k.offsetWidth); });
        for (var extra = 0; extra < 6 && !found; extra++) {
          var lo = floor, hi = top;
          while (hi - lo > 4) {
            var mid = Math.floor((lo + hi) / 2);
            el.style.maxWidth = mid + 'px';
            if (rows(list).length > want + extra) { lo = mid; } else { hi = mid; }
          }
          el.style.maxWidth = hi + 'px';
          if (!lone(rows(list))) { found = hi; } else { top = hi - 1; }
        }
        if (!found) { reset(el); return; }
        if (getComputedStyle(el).justifyContent === 'center') { el.style.marginLeft = 'auto'; el.style.marginRight = 'auto'; }
      }
      function fit(el) {
        reset(el);
        var k = kind(el), list = items(el);
        el._even.n = list.length;
        if (!el.isConnected || !el.clientWidth || list.length < 3) { return; }
        if (k === 'grid') { fitGrid(el, list.length); } else if (k === 'flex') { fitFlex(el, list); }
      }
      function fitAll() {
        var root = document.documentElement;
        root.classList.add('wrap-fitting');
        scan();
        watched.forEach(fit);
        void root.offsetWidth;
        root.classList.remove('wrap-fitting');
      }
      function countsChanged() {
        return watched.some(function (el) { return items(el).length !== el._even.n; });
      }
      var queued = false, lastW = window.innerWidth;
      function soon(check) {
        if (queued) { return; }
        queued = true;
        requestAnimationFrame(function () {
          queued = false;
          if (check === 'count' && !countsChanged()) { return; }
          fitAll();
        });
      }
      window.addEventListener('resize', function () {
        if (window.innerWidth === lastW) { return; }
        lastW = window.innerWidth;
        soon();
      });
      document.addEventListener('click', function () { soon('count'); });
      document.addEventListener('change', function () { soon('count'); });
      window.addEventListener('load', function () { soon(); });
      if (document.fonts && document.fonts.ready) { document.fonts.ready.then(function () { soon(); }); }
      fitAll();
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
      <Raw html={`<script>${WRAP_SCRIPT}</script>`} />
    </>
  );
}

export { H };
