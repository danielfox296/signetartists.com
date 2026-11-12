/* The acts UI. Restructure 2026-08-15, two lanes 2026-09-23.
 *
 * Two behaviours, both guarded on the elements they need, so the one file
 * loads on the roster page and the contact page and does the right thing on
 * each: sorting the roster, and preselecting the act on the contact form.
 *
 * Progressive enhancement: the controls ship hidden in the HTML and this file
 * unhides them. With script off, or if this file fails to load, every act on
 * the roster is still on the page in its usual order.
 *
 * Since 2026-11-11 the roster sorts and never hides. One chip per kind of
 * event (the cards' data-buckets); picking one moves the acts tagged with it
 * to the top of each lane, marks the matching pill on those cards, and puts
 * the rest under a heading below them. Picking it again, or Reset, puts every
 * card back in its built order. ?night=<bucket> opens the page sorted.
 */
(function () {
  "use strict";

  var form = document.getElementById("roster-filters");
  var grids = Array.prototype.slice.call(document.querySelectorAll(".roster-grid"));
  if (!form || !grids.length) return;

  var chips = Array.prototype.slice.call(form.querySelectorAll("[data-fit]"));
  if (!chips.length) return;
  var reset = document.getElementById("filter-reset");
  var countEl = document.getElementById("filter-count");
  var moreText = form.getAttribute("data-more") || "";
  var sortedText = form.getAttribute("data-sorted") || "";

  // Each grid's cards in the order the build wrote them.
  var order = grids.map(function (grid) {
    return Array.prototype.slice.call(grid.querySelectorAll(".act-card"));
  });

  function fits(card, id) {
    return (card.getAttribute("data-buckets") || "").split(/\s+/).indexOf(id) !== -1;
  }

  function apply(id) {
    chips.forEach(function (chip) {
      chip.setAttribute("aria-pressed", chip.getAttribute("data-fit") === id ? "true" : "false");
    });

    grids.forEach(function (grid, g) {
      var old = grid.querySelector(".roster-more");
      if (old) grid.removeChild(old);
      var cards = order[g];
      var top = id ? cards.filter(function (c) { return fits(c, id); }) : cards;
      var rest = id ? cards.filter(function (c) { return !fits(c, id); }) : [];
      cards.forEach(function (card) {
        card.classList.toggle("is-fit", !!id && fits(card, id));
        var pills = card.querySelectorAll(".pill[data-bucket]");
        for (var i = 0; i < pills.length; i += 1) {
          pills[i].classList.toggle("pill--on", pills[i].getAttribute("data-bucket") === id);
        }
      });
      top.forEach(function (card) { grid.appendChild(card); });
      if (top.length && rest.length && moreText) {
        var more = document.createElement("p");
        more.className = "roster-more";
        more.textContent = moreText;
        grid.appendChild(more);
      }
      rest.forEach(function (card) { grid.appendChild(card); });
    });

    var label = "";
    chips.forEach(function (chip) {
      if (chip.getAttribute("data-fit") === id) label = chip.textContent;
    });
    countEl.textContent = id ? sortedText.replace("{label}", label) : "";
    if (reset) reset.hidden = !id;
    form.setAttribute("data-picked", id || "");
  }

  // The bar stays just under the sticky header.
  var header = document.querySelector(".site-header");
  function place() {
    if (header) form.style.setProperty("--sort-top", header.offsetHeight + 12 + "px");
  }
  place();
  window.addEventListener("resize", place);

  // After a pick, the roster comes into view under the bar and the acts that
  // suit it rise into place, so the pick visibly does something.
  function show() {
    var lane = document.querySelector(".roster-lane:not([hidden])");
    if (lane) lane.scrollIntoView({ behavior: "smooth", block: "start" });
    var fit = document.querySelectorAll(".act-card.is-fit");
    for (var i = 0; i < fit.length; i += 1) {
      fit[i].classList.remove("is-moved");
      void fit[i].offsetWidth;
      fit[i].classList.add("is-moved");
    }
  }

  chips.forEach(function (chip) {
    chip.addEventListener("click", function () {
      var id = chip.getAttribute("data-fit");
      var next = form.getAttribute("data-picked") === id ? "" : id;
      apply(next);
      if (next) show();
    });
  });

  if (reset) reset.addEventListener("click", function () { apply(""); });

  // Open sorted from ?night=<bucket>. A value no chip carries is ignored.
  var start = "";
  var m = /[?&]night=([^&]+)/.exec(window.location.search);
  if (m) {
    var wanted = decodeURIComponent(m[1]);
    chips.forEach(function (chip) {
      if (chip.getAttribute("data-fit") === wanted) start = wanted;
    });
  }

  // Unhide last: until the listeners are attached the controls would be inert.
  form.hidden = false;
  if (start) apply(start);
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

/* Contact form: tick a checkbox from the link, the same way. A checkbox with
 * data-param="photo-video" is ticked when the page was opened with
 * ?photo-video (any value). */
(function () {
  "use strict";

  if (!window.location.search) return;
  var boxes = document.querySelectorAll("input[type=checkbox][data-param]");
  for (var i = 0; i < boxes.length; i += 1) {
    var key = boxes[i].getAttribute("data-param").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp("[?&]" + key + "(=|&|$)").test(window.location.search)) boxes[i].checked = true;
  }
})();

/* Contact form: a one-of choice with data-param="package" ships hidden and
 * disabled, and appears with its choice made when the page was opened with
 * ?package=<the choice in lower case, words joined by hyphens>, e.g.
 * ?package=photos-and-film. Opened any other way, the form never shows it. */
(function () {
  "use strict";

  if (!window.location.search) return;
  var sets = document.querySelectorAll("fieldset[data-param]");
  var slug = function (t) {
    return String(t).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  };
  for (var i = 0; i < sets.length; i += 1) {
    var key = sets[i].getAttribute("data-param").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    var match = new RegExp("[?&]" + key + "=([^&]+)").exec(window.location.search);
    if (!match) continue;
    var wanted;
    try {
      wanted = slug(decodeURIComponent(match[1].replace(/\+/g, " ")));
    } catch (e) {
      continue;
    }
    var radios = sets[i].querySelectorAll("input[type=radio]");
    for (var j = 0; j < radios.length; j += 1) {
      if (slug(radios[j].value) === wanted) {
        radios[j].checked = true;
        sets[i].disabled = false;
        sets[i].hidden = false;
        break;
      }
    }
  }
})();

/* Contact form: fill the venue from the link. A venue page's button opens
 * the form with ?venue=<the venue's name>, and the venue field starts with it. */
(function () {
  "use strict";

  var field = document.getElementById("venue");
  var match = /[?&]venue=([^&]+)/.exec(window.location.search);
  if (!field || !match || field.value) return;
  try {
    field.value = decodeURIComponent(match[1].replace(/\+/g, " "));
  } catch (e) {}
})();
