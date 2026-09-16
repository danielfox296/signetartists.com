/* The acts UI. Restructure 2026-08-15.
 *
 * Two behaviours, both guarded on the elements they need, so the one file
 * loads on the roster page and the contact page and does the right thing on
 * each: roster filtering, and preselecting the act on the contact form.
 *
 * Progressive enhancement: the controls ship hidden in the HTML and this file
 * unhides them. With script off, or if this file fails to load, every act on
 * the roster is still on the page and nothing is offered that cannot work.
 *
 * The filter is a hidden-attribute toggle over data attributes rendered by
 * build.py. No re-render, no template in JS, and the cards remain the same
 * DOM nodes the crawler saw.
 *
 * The starting-price filter was removed 2026-09-04 with the published rate
 * card. Kind of night and size were the two axes left; genre, vocals and
 * where joined them 2026-09-16 (acts.json _facets_note), each rendered by
 * build.py only when the roster varies on it.
 */
(function () {
  "use strict";

  var form = document.getElementById("roster-filters");
  var grid = document.getElementById("roster-grid");
  if (!form || !grid) return;

  var cards = Array.prototype.slice.call(grid.querySelectorAll(".act-card"));
  if (!cards.length) return;

  // Each select filters one data attribute on the cards. Genre, vocals and
  // where were added 2026-09-16; build.py renders a select only when the
  // roster varies on that facet, so every entry here is guarded on the
  // element existing.
  var facets = [
    ["filter-bucket", "buckets"],
    ["filter-config", "configs"],
    ["filter-genre", "genres"],
    ["filter-vocals", "vocals"],
    ["filter-area", "areas"],
  ].map(function (pair) {
    return { el: document.getElementById(pair[0]), key: pair[1] };
  }).filter(function (f) { return f.el; });
  var reset = document.getElementById("filter-reset");
  var countEl = document.getElementById("filter-count");
  var emptyEl = document.getElementById("filter-empty");

  function tags(card, key) {
    return (card.getAttribute("data-" + key) || "").split(/\s+/);
  }

  function apply() {
    var shown = 0;

    cards.forEach(function (card) {
      var ok = facets.every(function (f) {
        return !f.el.value || tags(card, f.key).indexOf(f.el.value) !== -1;
      });
      card.hidden = !ok;
      if (ok) shown += 1;
    });

    countEl.textContent =
      shown === cards.length
        ? "Every act"
        : shown + " matching";
    emptyEl.hidden = shown !== 0;
  }

  facets.forEach(function (f) {
    f.el.addEventListener("change", apply);
  });

  reset.addEventListener("click", function () {
    facets.forEach(function (f) { f.el.value = ""; });
    apply();
  });

  // Unhide last: until the listeners are attached the controls would be inert.
  form.hidden = false;
  apply();
})();

/* Contact form: preselect the act from ?act=<id>.
 *
 * Every "Inquire" link on the roster and every CTA on an act page carries the
 * act id. Without this the planner arrives at a blank form having already told
 * us what they wanted, and has to say it twice. The select works on its own if
 * this never runs. */
(function () {
  "use strict";

  var field = document.getElementById("act");
  if (!field || !window.location.search) return;

  var match = /[?&]act=([^&]+)/.exec(window.location.search);
  if (!match) return;

  var wanted = decodeURIComponent(match[1]);
  var options = field.querySelectorAll("option[data-id]");
  for (var i = 0; i < options.length; i += 1) {
    if (options[i].getAttribute("data-id") === wanted) {
      field.value = options[i].value;
      return;
    }
  }
})();
