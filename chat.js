/* Signet Artists — the Crisp chat box. The page's <head> loads Crisp; this
   file tags each conversation with the part of the site it started on and
   opens the chat from the "Or chat with us" buttons beside Check a
   Date. If Crisp never loads, those buttons go to the form instead. */
(function () {
  "use strict";

  var path = location.pathname;
  var crisp = function (cmd) {
    try { window.$crisp.push(cmd); } catch (e) { /* chat must never break the page */ }
  };

  function segment(p) {
    if (p === "/" || p === "/index.html") return "home";
    if (/^\/corporate\//.test(p)) return "corporate";
    if (/^\/weddings\//.test(p)) return "wedding";
    if (/^\/(private-parties|daytime)\//.test(p)) return "private-event";
    if (/^\/blog\//.test(p)) return "blog";
    if (/string-quartet/.test(p)) return "strings";
    if (/jazz/.test(p)) return "jazz";
    if (/(^|[\/-])dj([\/-]|$)/.test(p)) return "dj";
    return "other";
  }

  // The tag is the part of the site the conversation starts on: each page
  // replaces it until the visitor sends a message, then it stays.
  var seg = segment(path);
  crisp(["on", "session:loaded", function () {
    try {
      if (!window.$crisp.is("session:ongoing")) crisp(["set", "session:segments", [[seg], true]]);
    } catch (e) {}
  }]);

  // The line the chat opens with; the visitor finishes it.
  var occasion = {
    wedding: "a wedding",
    corporate: "a corporate event",
    "private-event": /^\/private-parties\//.test(path) ? "a private party" : "an event"
  }[seg] || "an event";
  var starter = "Hi! I'm planning " + occasion + ", and the date is ";

  function loaded() {
    return window.$crisp && typeof window.$crisp.is === "function";
  }

  // The message box only takes text once the chat is open, and only gets it
  // when the visitor hasn't typed anything yet.
  var pending = false;
  function fill() {
    pending = false;
    try {
      if (!window.$crisp.get("message:text")) crisp(["set", "message:text", [starter]]);
    } catch (e) {}
  }
  // Analytics: chat_open when the box opens, chat_start when the visitor
  // sends a message. Each fires once per page view, with the part of the
  // site as "segment". Crisp keeps one handler per event, so the opened
  // handler does both jobs.
  var sent = {};
  function track(name) {
    if (sent[name]) return;
    sent[name] = true;
    try {
      if (typeof window.gtag === "function") {
        window.gtag("event", name, { segment: seg, page: path, transport_type: "beacon" });
      }
    } catch (e) {}
  }
  crisp(["on", "chat:opened", function () { track("chat_open"); if (pending) fill(); }]);
  crisp(["on", "message:sent", function () { track("chat_start"); }]);

  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest && e.target.closest("[data-chat]");
    if (!b) return;
    var form = b.getAttribute("data-chat");
    crisp(["do", "chat:show"]);
    if (loaded() && window.$crisp.is("chat:opened")) return fill();
    pending = true;
    crisp(["do", "chat:open"]);
    if (!loaded()) {
      setTimeout(function () { if (!loaded()) location.href = form; }, 2500);
    }
  });
})();
