/* Football Pyramids: comparison bootstrap.
   The existing comparison implementation lives in compare-base.js. This small layer detects the special case where
   both clubs spent every displayed season in the same division and reuses the existing journey renderer on a
   one-division scale, so the chart becomes a pure finishing-position comparison. */
(function () {
  "use strict";
  if (!window.FP) return;

  var originalPlot = FP.journeyPlot;
  var originalGeometry = FP.journeyGeometry;
  var activeLeague = "";

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // Return a one-division version of a two-club comparison when every displayed season has both clubs in the same
  // exact league. Missing seasons, league changes, promotions or relegations all fall back to the normal pyramid view.
  function sameLeagueConfig(cfg) {
    activeLeague = "";
    if (!cfg || !cfg.slots || !cfg.slots.length || !cfg.series || cfg.series.length !== 2) return null;

    var a = cfg.series[0].pts || [];
    var b = cfg.series[1].pts || [];
    if (a.length !== cfg.slots.length || b.length !== cfg.slots.length || !a[0] || !b[0]) return null;

    var league = a[0].league;
    var tier = a[0].tier;
    if (!league || !tier) return null;

    var maxSize = 1;
    for (var i = 0; i < cfg.slots.length; i++) {
      var x = a[i], y = b[i];
      if (!x || !y || x.league !== league || y.league !== league || x.tier !== tier || y.tier !== tier) return null;
      maxSize = Math.max(maxSize, x.of || 0, y.of || 0, x.pos || 0, y.pos || 0);
    }

    // Keep the real tier number so promotion/relegation/champion markers retain their existing meaning. Empty sizes
    // above it collapse away, leaving only this league visible while positions run 1st -> league size.
    var sizes = [];
    for (var s = 0; s < tier; s++) sizes.push(s === tier - 1 ? maxSize : 0);

    var slots = cfg.slots.map(function (slot) {
      return Object.assign({}, slot, { sizes: sizes.slice() });
    });
    var series = cfg.series.map(function (ser) {
      return Object.assign({}, ser, {
        pts: ser.pts.map(function (p) {
          return p ? Object.assign({}, p, { rank: p.pos, sizes: sizes.slice() }) : null;
        })
      });
    });

    var ladder = [];
    for (var t = 1; t <= tier; t++) ladder.push({ tier: t, name: "", short: "" });
    var meta = (cfg.ladder || []).filter(function (l) { return l.tier === tier; })[0] || {};
    ladder[tier - 1] = { tier: tier, name: league, short: meta.short || league };

    activeLeague = league;
    return Object.assign({}, cfg, { slots: slots, series: series, ladder: ladder, mode: "rank" });
  }

  FP.journeyPlot = function (cfg) {
    var mapped = sameLeagueConfig(cfg);
    return originalPlot(mapped || cfg);
  };

  FP.journeyGeometry = function (cfg) {
    var mapped = sameLeagueConfig(cfg);
    return originalGeometry(mapped || cfg);
  };

  function enhanceComparisonUI() {
    if ((document.body.getAttribute("data-page") || "") !== "compare") return;
    var app = document.getElementById("cmp-app");
    if (!app) return;

    var oldNote = app.querySelector(".cmp-auto-league");
    if (!activeLeague) {
      if (oldNote) oldNote.remove();
      return;
    }

    var mode = app.querySelector(".cmp-mode");
    if (mode && mode.getAttribute("data-auto-league") !== activeLeague) {
      mode.setAttribute("data-auto-league", activeLeague);
      mode.setAttribute("aria-label", "Chart view");
      mode.removeAttribute("role");
      mode.innerHTML = '<button type="button" class="on" disabled>League position</button>';
    }

    var chart = app.querySelector(".cmp-chart");
    if (chart && !oldNote) {
      var note = document.createElement("p");
      note.className = "cmp-note cmp-auto-league";
      note.innerHTML = "<strong>" + esc(activeLeague) + " throughout.</strong> Both clubs were in the same division for every season shown, so the chart compares their league finishing positions directly.";
      var plot = chart.querySelector(".lchart");
      if (plot) chart.insertBefore(note, plot);
    }
  }

  var app = document.getElementById("cmp-app");
  if (app && window.MutationObserver) {
    new MutationObserver(function () { enhanceComparisonUI(); }).observe(app, { childList: true, subtree: true });
  }

  // Load the unchanged comparison application after the renderer hooks above are in place.
  var here = document.currentScript && document.currentScript.src ? document.currentScript.src : "";
  var src = here.replace(/compare\.js(?=([?#]|$))/, "compare-base.js");
  var script = document.createElement("script");
  script.src = src || "compare-base.js";
  script.async = false;
  script.onload = enhanceComparisonUI;
  document.head.appendChild(script);
})();
