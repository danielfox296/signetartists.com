/* Signet Artists — GA4 event instrumentation (WEBSITE-PLAN.md §7).
   Four events, nothing more: lead_submit, cta_click, email_click,
   pricing_engaged. No-ops cleanly if gtag is absent or blocked. */
(function () {
  "use strict";

  function send(name, params) {
    try {
      if (typeof window.gtag !== "function") return;
      var p = params || {};
      p.page = location.pathname;
      p.transport_type = "beacon"; // survives the navigation on links/submits
      window.gtag("event", name, p);
    } catch (e) { /* analytics must never break the page */ }
  }

  // cta_click: .btn and .act-card-link anchors into contact/ (query string
  // included — Inquire links carry ?act=<id>) plus the form's Send button.
  // email_click: any mailto link. One delegated listener covers both;
  // capture phase so a stopPropagation elsewhere can't swallow them.
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest && e.target.closest("a, button");
    if (!el) return;
    var href = el.getAttribute("href") || "";
    if (href.slice(0, 7) === "mailto:") return send("email_click");
    if (!el.classList.contains("btn") && !el.classList.contains("act-card-link")) return;
    if (el.tagName === "A" && !/contact\/(\?[^#]*)?$/.test(href)) return;
    var label = (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100);
    send("cta_click", { label: label });
  }, true);

  // lead_submit: observe the formsubmit.co POST without touching it —
  // no preventDefault, the browser submit proceeds untouched.
  document.addEventListener("submit", function (e) {
    var action = e.target && e.target.getAttribute
      ? e.target.getAttribute("action") || "" : "";
    if (action.indexOf("formsubmit.co") !== -1) send("lead_submit");
  }, true);

  // pricing_engaged: first rate table scrolled into view, once per page view.
  var tables = document.querySelectorAll(".rate-table");
  if (tables.length && "IntersectionObserver" in window) {
    var fired = false; // latch: a pending batch can land after disconnect()
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (fired || !entries[i].isIntersecting) continue;
        fired = true;
        io.disconnect();
        send("pricing_engaged");
      }
    }, { threshold: 0.4 });
    for (var i = 0; i < tables.length; i++) io.observe(tables[i]);
  }
})();
