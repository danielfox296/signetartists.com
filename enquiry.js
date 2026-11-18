/* Website forms for every site (signetartists.com, foxlessons.com,
   daniel-fox.com). A page loads this one file from
   https://signetartists.com/enquiry.js, and any form on it whose action is
   FormSubmit is sent to the shared enquiry endpoint instead (a Google Apps
   Script web app that writes each one to a sheet and emails it on). The
   FormSubmit action stays as the fallback: it is used when the endpoint
   can't be reached, answers with an error or takes longer than 15 seconds,
   and when this script doesn't load. A visitor who came to the form from
   another page of the same site sends that page's path as "Came from". */
(function () {
  "use strict";

  var ENDPOINT = "https://script.google.com/macros/s/AKfycbw4WojjT1h0DfgxeECpG1ud0Hg3FeiqJFE-EA1veNaqOw9VFH0LU2O1sqN_I9rgKruxEA/exec";
  var me = document.currentScript;
  var endpoint = (me && me.getAttribute("data-endpoint")) || ENDPOINT;
  if (!window.fetch || !window.FormData || !window.URLSearchParams) return;

  // A polite live region in the form, so a screen reader hears "Sending".
  // Made on first use; its text is set a moment later so it is announced.
  function announce(form, text) {
    var s = form.querySelector("[data-enquiry-status]");
    if (!s) {
      s = document.createElement("span");
      s.setAttribute("data-enquiry-status", "");
      s.setAttribute("role", "status");
      s.setAttribute("aria-live", "polite");
      s.style.cssText = "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0";
      form.appendChild(s);
    }
    setTimeout(function () { s.textContent = text; }, 50);
  }

  // The page the visitor was on before the form, when it is on this site.
  function cameFrom() {
    try {
      if (!document.referrer) return "";
      var r = new URL(document.referrer);
      if (r.origin !== location.origin || r.pathname === location.pathname) return "";
      return r.pathname;
    } catch (err) {
      return "";
    }
  }

  // A form sent and then come back to with the Back button is shown from the
  // browser's cache as it was left: ready to send again.
  function reset(form) {
    form.removeAttribute("data-sending");
    var button = form.querySelector('[type="submit"]');
    var label = button && button.getAttribute("data-label");
    if (button && label != null) {
      button.disabled = false;
      button.textContent = label;
      button.removeAttribute("data-label");
    }
    var s = form.querySelector("[data-enquiry-status]");
    if (s) s.textContent = "";
  }
  window.addEventListener("pageshow", function () {
    var sent = document.querySelectorAll("form[data-sending]");
    for (var i = 0; i < sent.length; i++) reset(sent[i]);
  });

  // Bubble phase on document, so the analytics listener (capture phase)
  // has already counted the submit.
  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (!form || !form.getAttribute) return;
    if ((form.getAttribute("action") || "").indexOf("formsubmit.co") === -1) return;
    if (e.defaultPrevented) return;
    e.preventDefault();
    if (form.getAttribute("data-sending")) return;
    form.setAttribute("data-sending", "1");

    var button = form.querySelector('[type="submit"]');
    var label = button ? button.textContent : "";
    if (button) {
      button.setAttribute("data-label", label);
      button.disabled = true;
      button.textContent = "Sending";
    }
    announce(form, "Sending");

    var data = new URLSearchParams();
    new FormData(form).forEach(function (v, k) {
      if (typeof v === "string") data.append(k, v);
    });
    data.append("_page", location.href);
    var from = cameFrom();
    if (from) data.append("Came from", from);
    var nextField = form.querySelector('input[name="_next"]');
    var next = (nextField && nextField.value) || "/thanks/";

    var settled = false;
    function fallback() {
      if (settled) return;
      settled = true;
      if (button) { button.disabled = false; button.textContent = label; }
      var s = form.querySelector("[data-enquiry-status]");
      if (s) s.textContent = "";
      HTMLFormElement.prototype.submit.call(form);
    }
    var timer = setTimeout(fallback, 15000);

    fetch(endpoint, { method: "POST", body: data })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        clearTimeout(timer);
        if (settled) return;
        if (j && j.ok) {
          settled = true;
          location.href = next;
        } else {
          fallback();
        }
      })
      .catch(function () {
        clearTimeout(timer);
        fallback();
      });
  });
})();
