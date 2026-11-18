/* Website forms for every site (signetartists.com, foxlessons.com,
   daniel-fox.com). A page loads this one file from
   https://signetartists.com/enquiry.js, and any form on it whose action is
   FormSubmit is sent to the shared enquiry endpoint instead (a Google Apps
   Script web app that writes each one to a sheet and emails it on). The
   FormSubmit action stays as the fallback: it is used when the endpoint
   can't be reached, answers with an error or takes longer than 15 seconds,
   and when this script doesn't load. */
(function () {
  "use strict";

  var ENDPOINT = "https://script.google.com/macros/s/AKfycbw4WojjT1h0DfgxeECpG1ud0Hg3FeiqJFE-EA1veNaqOw9VFH0LU2O1sqN_I9rgKruxEA/exec";
  var me = document.currentScript;
  var endpoint = (me && me.getAttribute("data-endpoint")) || ENDPOINT;
  if (!window.fetch || !window.FormData || !window.URLSearchParams) return;

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
    if (button) { button.disabled = true; button.textContent = "Sending"; }

    var data = new URLSearchParams();
    new FormData(form).forEach(function (v, k) {
      if (typeof v === "string") data.append(k, v);
    });
    data.append("_page", location.href);
    var nextField = form.querySelector('input[name="_next"]');
    var next = (nextField && nextField.value) || "/thanks/";

    var settled = false;
    function fallback() {
      if (settled) return;
      settled = true;
      if (button) { button.disabled = false; button.textContent = label; }
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
