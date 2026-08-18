/* Signet Artists quote engine.
   Loaded by the pricing page only. The markup lives in
   _src/partials/quote-engine.html and is integrated as a pricing section.

   Rules this file follows:
   - The eight ensemble rates are never written here. They are read off the
     server-rendered rate card (table.rate-table--full), which build.py
     generates from _src/data/site.json. One source of truth: change
     site.json, rebuild, and the engine follows on the next load.
   - Before revealing anything, every parsed row is proved against the card's
     own printed totals (call-out + hours x hourly). If a single number
     disagrees, the engine stands down and the static card stands alone.
     The same happens when JS fails entirely: the section ships hidden and
     only this file reveals it.
   - The added-slot rates are the Duo and DJ hourly rates from the same card,
     per the published rule: an added slot bills at hourly only, no second
     call-out.
   - Travel fees, the peak and NYE multipliers and the bundle discount mirror
     the published extras (site.json "extras", OFFER.md). They are flat
     constants; update them alongside site.json if the extras ever change.
   - No dependencies, no email gate. Analytics (if gtag is present) records
     what was configured, never who configured it.

   Order of operations, from the quote engine spec in OFFER.md:
     1. call-out + (hours x hourly)
     2. + added slots at hourly only
     3. x date multiplier, performance fees only
     4. + travel flat; lodging is billed at cost and never totalled here
     5. - 10% when three or more parts of the night are booked together

   window.SignetQuote exposes the pure pieces as a hook for tests. */
(function () {
  'use strict';

  var TRAVEL = {
    metro: { label: 'Denver metro', fee: 0 },
    frontrange: { label: 'Front Range', fee: 300 },
    i70: { label: 'I-70 corridor', fee: 600 },
    far: { label: 'Far resorts', fee: 600, lodging: true }
  };

  var DATE_TYPES = {
    standard: { label: '', rate: 0 },
    peak: { label: 'Holiday or peak weekend, +25% on performance fees', rate: 0.25 },
    nye: { label: "New Year's Eve, +50% on performance fees", rate: 0.5 }
  };

  var BUNDLE_DISCOUNT = 0.1; /* three or more parts of the night together */
  var HOURS_MAX = 6;         /* the hours select runs to six, in 30-minute steps */
  var SLOT_HOURS_MAX = 3;    /* added slots run to three hours each */

  /* ------------------------------------------------------------ formatting */

  function money(n) {
    var sign = n < 0 ? '−' : '';
    return sign + '$' + Math.abs(n).toLocaleString('en-US');
  }

  function hoursLabel(h) {
    return h === 1 ? '1 hour' : h + ' hours';
  }

  function parseMoney(text) {
    var digits = String(text).replace(/[^0-9]/g, '');
    return digits ? parseInt(digits, 10) : null;
  }

  /* ------------------------------------------------------------ rate card */

  /* Read the rendered card and prove each row against its printed totals.
     Returns null (and the engine never appears) on any surprise. */
  function readRates(doc) {
    var table = (doc || document).querySelector('table.rate-table--full');
    if (!table) { return null; }
    var rows = table.querySelectorAll('tbody tr');
    var rates = [];
    for (var i = 0; i < rows.length; i++) {
      var cells = rows[i].querySelectorAll('td');
      if (cells.length < 7) { return null; }
      var size = (cells[0].textContent || '').trim();
      var callOut = parseMoney(cells[1].textContent);
      var hourly = parseMoney(cells[2].textContent);
      if (!size || callOut === null || hourly === null) { return null; }
      var min = 0;
      for (var h = 1; h <= 4; h++) {
        var printed = parseMoney(cells[2 + h].textContent);
        if (printed === null) {
          /* a blank after the minimum is not a shape we know */
          if (min) { return null; }
          continue;
        }
        if (!min) { min = h; }
        if (printed !== callOut + hourly * h) { return null; }
      }
      if (!min) { return null; }
      rates.push({ size: size, callOut: callOut, hourly: hourly, min: min });
    }
    return rates.length ? rates : null;
  }

  /* ------------------------------------------------------------- arithmetic */

  /* Pure. row is the main booking; duoRow/djRow supply added-slot hourly
     rates and may be null; state is {hours, travel, date, duoHours, djHours}.
     Derived lines round to the whole dollar and the total is the exact sum
     of the lines shown, so the itemisation always adds up. */
  function compute(row, duoRow, djRow, state) {
    var lines = [];
    var performanceAmt = row.hourly * state.hours;
    var duoAmt = duoRow ? duoRow.hourly * state.duoHours : 0;
    var djAmt = djRow ? djRow.hourly * state.djHours : 0;
    var performance = row.callOut + performanceAmt + duoAmt + djAmt;

    lines.push({ label: row.size + ' call-out', amount: row.callOut });
    lines.push({
      label: 'Performance, ' + hoursLabel(state.hours) + ' at ' + money(row.hourly) + ' an hour',
      amount: performanceAmt
    });
    if (duoAmt > 0) {
      lines.push({
        label: 'Cocktail duo, ' + hoursLabel(state.duoHours) + ', no second call-out',
        amount: duoAmt
      });
    }
    if (djAmt > 0) {
      lines.push({
        label: 'DJ after the band, ' + hoursLabel(state.djHours) + ', no second call-out',
        amount: djAmt
      });
    }

    var dateType = DATE_TYPES[state.date] || DATE_TYPES.standard;
    var uplift = Math.round(performance * dateType.rate);
    if (uplift > 0) {
      lines.push({ label: dateType.label, amount: uplift });
    }

    var travel = TRAVEL[state.travel] || TRAVEL.metro;
    if (travel.fee > 0) {
      lines.push({ label: 'Travel, ' + travel.label, amount: travel.fee });
    }
    if (travel.lodging) {
      lines.push({ label: "One night's lodging per musician", amount: null, note: 'At cost' });
    }

    var parts = 1 + (duoAmt > 0 ? 1 : 0) + (djAmt > 0 ? 1 : 0);
    var discount = parts >= 3 ? Math.round((performance + uplift) * BUNDLE_DISCOUNT) : 0;
    if (discount > 0) {
      lines.push({
        label: 'Three parts booked together, 10% off performance fees',
        amount: -discount,
        discount: true
      });
    }

    return {
      lines: lines,
      total: performance + uplift + travel.fee - discount,
      lodging: !!travel.lodging,
      parts: parts
    };
  }

  /* -------------------------------------------------------------- analytics */

  function track(name, params) {
    if (typeof window.gtag === 'function') {
      try { window.gtag('event', name, params); } catch (e) { /* never break the page */ }
    }
  }

  var configuredTimer = null;
  function trackConfigured(row, state, total) {
    if (typeof window.gtag !== 'function') { return; }
    clearTimeout(configuredTimer);
    configuredTimer = setTimeout(function () {
      track('quote_configured', {
        ensemble: row.size,
        hours: state.hours,
        travel: state.travel,
        date_type: state.date,
        cocktail_duo_hours: state.duoHours,
        dj_hours: state.djHours,
        quote_total: total
      });
    }, 1000);
  }

  /* ------------------------------------------------------------------- UI */

  function init() {
    var section = document.getElementById('quote-engine');
    if (!section || section.getAttribute('data-qe-init')) { return; }
    section.setAttribute('data-qe-init', '1');

    var rates = readRates(document);
    if (!rates) { return; }

    var el = {
      form: document.getElementById('qe-form'),
      ensemble: document.getElementById('qe-ensemble'),
      hours: document.getElementById('qe-hours'),
      travel: document.getElementById('qe-travel'),
      duo: document.getElementById('qe-duo'),
      dj: document.getElementById('qe-dj'),
      lines: document.getElementById('qe-lines'),
      total: document.getElementById('qe-total'),
      lodgingNote: document.getElementById('qe-lodging-note'),
      check: document.getElementById('qe-check')
    };
    if (!el.ensemble || !el.hours || !el.travel || !el.lines || !el.total) { return; }

    var duoRow = null;
    var djRow = null;
    var lastTotal = null;
    for (var i = 0; i < rates.length; i++) {
      if (rates[i].size === 'Duo') { duoRow = rates[i]; }
      if (rates[i].size === 'DJ') { djRow = rates[i]; }
    }

    function hideField(select) {
      var field = select && select.closest ? select.closest('.field') : null;
      if (field) { field.hidden = true; }
      if (select) { select.disabled = true; select.value = '0'; }
    }

    /* The ensemble list is whatever the card publishes, in the card's order. */
    rates.forEach(function (r, idx) {
      var opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = r.size + ' · ' + money(r.callOut) + ' + ' + money(r.hourly) + '/hr';
      el.ensemble.appendChild(opt);
    });

    function fillHours(min) {
      var prev = parseFloat(el.hours.value);
      el.hours.innerHTML = '';
      for (var h = min; h <= HOURS_MAX; h += 0.5) {
        var opt = document.createElement('option');
        opt.value = String(h);
        opt.textContent = hoursLabel(h);
        el.hours.appendChild(opt);
      }
      if (!isNaN(prev) && prev >= min && prev <= HOURS_MAX) {
        el.hours.value = String(prev);
      } else {
        el.hours.value = String(min);
      }
    }

    function fillSlot(select, sourceRow) {
      if (!select) { return; }
      if (!sourceRow) { hideField(select); return; }
      for (var h = 1; h <= SLOT_HOURS_MAX; h += 0.5) {
        var opt = document.createElement('option');
        opt.value = String(h);
        opt.textContent = hoursLabel(h) + ' · +' + money(sourceRow.hourly * h);
        select.appendChild(opt);
      }
    }
    fillSlot(el.duo, duoRow);
    fillSlot(el.dj, djRow);

    /* Added slots are additions to a band booking. With the duo as the main
       booking a cocktail duo is just more duo hours, and with the DJ as the
       main booking both additions stop meaning anything, so those pairings
       switch off, so the engine never quotes something the offer does not say. */
    function syncAddOns(mainRow) {
      if (el.duo && duoRow) {
        var duoOff = mainRow.size === 'Duo' || mainRow.size === 'DJ';
        el.duo.disabled = duoOff;
        if (duoOff) { el.duo.value = '0'; }
      }
      if (el.dj && djRow) {
        var djOff = mainRow.size === 'DJ';
        el.dj.disabled = djOff;
        if (djOff) { el.dj.value = '0'; }
      }
    }

    function currentState() {
      var checked = document.querySelector('input[name="qe-date"]:checked');
      return {
        hours: parseFloat(el.hours.value),
        travel: el.travel.value,
        date: checked ? checked.value : 'standard',
        duoHours: el.duo && !el.duo.disabled ? parseFloat(el.duo.value) || 0 : 0,
        djHours: el.dj && !el.dj.disabled ? parseFloat(el.dj.value) || 0 : 0
      };
    }

    function render(result) {
      el.lines.innerHTML = '';
      result.lines.forEach(function (line) {
        var row = document.createElement('div');
        row.className = 'def-row' + (line.discount ? ' qe-discount' : '');
        var dt = document.createElement('dt');
        dt.textContent = line.label;
        var dd = document.createElement('dd');
        dd.className = 'tnum';
        dd.textContent = line.amount === null ? line.note : money(line.amount);
        row.appendChild(dt);
        row.appendChild(dd);
        el.lines.appendChild(row);
      });
      el.total.textContent = money(result.total);
      if (el.lodgingNote) { el.lodgingNote.hidden = !result.lodging; }
    }

    function recalc(announce) {
      var mainRow = rates[parseInt(el.ensemble.value, 10) || 0];
      var state = currentState();
      var result = compute(mainRow, duoRow, djRow, state);
      lastTotal = result.total;
      render(result);
      if (announce) { trackConfigured(mainRow, state, result.total); }
    }

    function onChange(event) {
      if (event.target === el.ensemble) {
        var mainRow = rates[parseInt(el.ensemble.value, 10) || 0];
        fillHours(mainRow.min);
        syncAddOns(mainRow);
      }
      recalc(true);
    }

    /* Defaults: the quartet at four hours. It is the ceiling of the 2026 product
       and the size most enquiries are sizing. */
    var defaultIdx = 0;
    for (var d = 0; d < rates.length; d++) {
      if (rates[d].size === 'Quartet') { defaultIdx = d; break; }
    }
    el.ensemble.value = String(defaultIdx);
    fillHours(rates[defaultIdx].min);
    if (rates[defaultIdx].min <= 4 && HOURS_MAX >= 4) { el.hours.value = '4'; }
    syncAddOns(rates[defaultIdx]);

    if (el.form) {
      el.form.addEventListener('submit', function (e) { e.preventDefault(); });
      el.form.addEventListener('change', onChange);
    }
    if (el.check) {
      el.check.addEventListener('click', function () {
        track('quote_check_date', { quote_total: lastTotal });
      });
    }

    recalc(false);
    section.hidden = false;
  }

  window.SignetQuote = {
    readRates: readRates,
    compute: compute,
    money: money
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
