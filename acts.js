/* The acts UI. Restructure 2026-08-15, two lanes 2026-09-23.
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
 * build.py only when the roster varies on it. Occasion joined 2026-09-23,
 * the same day the roster split into two lanes: the configurations and the
 * named acts. A lane whose every card is filtered out hides its heading too,
 * and the page can be opened pre-filtered (?occasion=weddings, ?size=duo,
 * ?genre=jazz, ?night=party, ?vocals=sung) so an occasion page can link
 * straight to the acts that suit it.
 */
(function () {
  "use strict";

  var form = document.getElementById("roster-filters");
  var grids = document.querySelectorAll(".roster-grid");
  if (!form || !grids.length) return;

  var cards = [];
  for (var g = 0; g < grids.length; g += 1) {
    cards = cards.concat(Array.prototype.slice.call(grids[g].querySelectorAll(".act-card")));
  }
  if (!cards.length) return;
  var lanes = Array.prototype.slice.call(document.querySelectorAll(".roster-lane"));

  // Each select filters one data attribute on the cards. build.py renders a
  // select only when the roster varies on that facet, so every entry here is
  // guarded on the element existing. The third column is the query-string
  // key an occasion page can use to open the roster already filtered.
  var facets = [
    ["filter-occasion", "occasions", "occasion"],
    ["filter-bucket", "buckets", "night"],
    ["filter-config", "configs", "size"],
    ["filter-genre", "genres", "genre"],
    ["filter-vocals", "vocals", "vocals"],
    ["filter-area", "areas", "where"],
  ].map(function (row) {
    return { el: document.getElementById(row[0]), key: row[1], param: row[2] };
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

    // A lane with nothing left in it takes its heading with it, so a buyer
    // filtering to one named act never reads "Configurations" over nothing.
    lanes.forEach(function (lane) {
      var visible = lane.querySelectorAll(".act-card:not([hidden])").length;
      lane.hidden = visible === 0;
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

  // Preselect from the query string. A value the select does not carry is
  // ignored, so a stale link filters nothing rather than everything.
  if (window.location.search) {
    facets.forEach(function (f) {
      var m = new RegExp("[?&]" + f.param + "=([^&]+)").exec(window.location.search);
      if (!m) return;
      var wanted = decodeURIComponent(m[1]);
      for (var i = 0; i < f.el.options.length; i += 1) {
        if (f.el.options[i].value === wanted) { f.el.value = wanted; break; }
      }
    });
  }

  // Unhide last: until the listeners are attached the controls would be inert.
  form.hidden = false;
  apply();
})();

/* Contact form: preselect the act from ?act=<id>.
 *
 * Every "Inquire" link on the roster and every CTA on an act page carries the
 * act id. Without this the planner arrives at a blank form having already told
 * us what they wanted, and has to say it twice.
 *
 * Since 2026-09-23 the field ships hidden and disabled, and only appears when
 * the link named an act the select carries. A buyer who arrives any other way
 * never sees a roster-length dropdown, and a disabled select is not submitted,
 * so the enquiry email has no empty Act row. If this never runs the form is
 * still complete without it. */
(function () {
  "use strict";

  var field = document.getElementById("act");
  var wrap = document.getElementById("act-field");
  if (!field || !wrap || !window.location.search) return;

  var match = /[?&]act=([^&]+)/.exec(window.location.search);
  if (!match) return;

  var wanted = decodeURIComponent(match[1]);
  var options = field.querySelectorAll("option[data-id]");
  for (var i = 0; i < options.length; i += 1) {
    if (options[i].getAttribute("data-id") === wanted) {
      field.value = options[i].value;
      field.disabled = false;
      wrap.hidden = false;
      return;
    }
  }
})();
