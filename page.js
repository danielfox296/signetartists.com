/* signetartists.com: the page behaviour every page shares. Loaded with defer
   from the <head>, so it runs once the page is parsed. */

// Mobile nav toggle. The button label doubles as the state indicator.
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

// Even rows for anything that wraps. A grid of cards or tiles never ends on a
// row with one item under three or more: it drops to the nearest column count
// that comes out even (four in three columns becomes two and two). Two across
// with one left over is allowed. A wrapping row of chips or logos that ends
// on one item is narrowed until its rows even out. Runs on load and on every
// width change, and again after a click or change, so filtered lists stay even.
(function () {
  var SKIP = '.breadcrumb ol, .blog-byline, .blog-row-meta, .wall-grid, .nav-mobile, .story-photos';
  // Rows of award laurels and outlet marks never end on one alone, even
  // two-and-one; a photo gallery fills its last row when a count allows.
  var STRICT = '.laurels, .honor-marks';
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
  function lone(counts, el) {
    var most = el && el.matches(STRICT) ? 2 : 3;
    return counts.length > 1 && counts[counts.length - 1] === 1 && Math.max.apply(null, counts) >= most;
  }
  function tracks(el) {
    var t = getComputedStyle(el).gridTemplateColumns;
    if (!t || t === 'none') { return 0; }
    return t.replace(/\[[^\]]*\]/g, ' ').split(/\s+/).filter(Boolean).length;
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
  function exact(n, c) {
    var tries = [c, c + 1, c - 1];
    for (var i = 0; i < tries.length; i++) { if (tries[i] >= 2 && n > tries[i] && n % tries[i] === 0) { return tries[i]; } }
    return 0;
  }
  function fitGrid(el, n) {
    var c = tracks(el), k = (el.matches('.media-grid') && exact(n, c)) || pick(n, c);
    if (k !== c) { el.style.gridTemplateColumns = 'repeat(' + k + ', minmax(0, 1fr))'; }
  }
  function fitFlex(el, list) {
    var counts = rows(list);
    if (!lone(counts, el)) { return; }
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
      if (!lone(rows(list), el)) { found = hi; } else { top = hi - 1; }
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

// Click-to-play YouTube: a video's button becomes its player, playing. A
// playlist's item plays in the playlist's stage.
document.addEventListener('click', function (e) {
  var item = e.target.closest && e.target.closest('.playlist-item');
  if (item) {
    var pl = item.closest('.playlist');
    var stage = pl.querySelector('.playlist-stage');
    var p = document.createElement('iframe');
    var u = item.getAttribute('data-play');
    p.src = u + (u.indexOf('?') < 0 ? '?' : '&') + 'autoplay=1';
    p.title = item.getAttribute('data-title') || '';
    p.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture');
    p.allowFullscreen = true;
    stage.replaceChildren(p);
    pl.querySelectorAll('.playlist-item').forEach(function (x) { x.setAttribute('aria-pressed', x === item ? 'true' : 'false'); });
    if (stage.getBoundingClientRect().top < 0) { stage.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    return;
  }
  var b = e.target.closest && e.target.closest('.yt');
  if (!b) { return; }
  var src = b.getAttribute('data-yt');
  var f = document.createElement('iframe');
  f.src = src + (src.indexOf('?') < 0 ? '?' : '&') + 'autoplay=1';
  f.title = b.getAttribute('data-title') || '';
  f.setAttribute('allow', b.getAttribute('data-allow') || '');
  if (b.hasAttribute('data-referrerpolicy')) { f.referrerPolicy = b.getAttribute('data-referrerpolicy'); }
  f.allowFullscreen = true;
  b.replaceWith(f);
  f.focus();
});

// Anchor-link copy for a post's subheads. A click puts the section URL on the
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

// A venue's event spaces: each play button puts the act's clip in a small
// player over the corner of the space's photo. One at a time per section; the
// button stops it again.
document.querySelectorAll('.vspaces').forEach(function (root) {
  function stop(b) {
    var p = b.closest('.vspace').querySelector('.vspace__player');
    p.innerHTML = '';
    p.classList.remove('is-on');
    b.classList.remove('is-on');
    b.querySelector('.vspace__play-text').textContent = 'Hear ' + b.dataset.title;
  }
  root.querySelectorAll('[data-vclip]').forEach(function (b) {
    b.addEventListener('click', function () {
      var on = b.classList.contains('is-on');
      root.querySelectorAll('[data-vclip].is-on').forEach(stop);
      if (on) { return; }
      var p = b.closest('.vspace').querySelector('.vspace__player');
      p.innerHTML = '<iframe src="https://www.youtube-nocookie.com/embed/' + b.dataset.vclip + '?autoplay=1&rel=0&modestbranding=1&playsinline=1" title="' + b.dataset.title.replace(/"/g, '') + '" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>';
      p.classList.add('is-on');
      b.classList.add('is-on');
      b.querySelector('.vspace__play-text').textContent = 'Stop the music';
    });
  });
});
