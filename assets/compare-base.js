/* Football Pyramids: club comparison.

   - Club pages: "Compare with another club" opens a search box; picking a club opens the comparison.
   - /compare/<country>/: two clubs' journeys on one chart (FP.journeyGeometry / FP.journeyPlot, the same chart the
     club pages use), a short summary, the seasons they shared a division, and a shareable image.

   Everything comes from data/journeys/<country>.json, written by scripts/build.mjs from the same journeys the club
   pages show. The address holds the whole comparison, so a link or a refresh reopens it exactly:
     /compare/england/?clubs=west-ham-united-vs-millwall&range=10&mode=tier
   range: all (default), 5, 10, or 2015-2022 (first and last season's start years). mode: rank (default) or tier. */
(function () {
  "use strict";
  var body = document.querySelector("[data-page]") || document.body;
  var PAGE = body.getAttribute("data-page");
  var COUNTRY = body.getAttribute("data-country");
  var BASE = body.getAttribute("data-base") || "";
  var SUFFIX = body.getAttribute("data-index") || "";
  if (!window.FP || !window.fetch) return;
  var esc = FP.esc, ord = function (n) { var s = ["th", "st", "nd", "rd"], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
  function $(id) { return document.getElementById(id); }
  function fold(s) {
    var t = String(s || "").toLowerCase();
    try { t = t.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return t.replace(/[^a-z0-9]+/g, " ").trim();
  }
  function toast(msg) {
    var t = $("toast"); if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function compareUrl(country, a, b, extra) {
    var q = "clubs=" + encodeURIComponent(a) + "-vs-" + encodeURIComponent(b);
    if (extra) q += extra;
    return BASE + "compare/" + country + "/" + SUFFIX + "?" + q;
  }

  /* ---------- Data ---------- */
  var loaded = {};
  function load(country, url) {
    if (!loaded[country]) {
      loaded[country] = fetch(BASE + (url || "data/journeys/" + country + ".json"))
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(decode);
      loaded[country].catch(function () { delete loaded[country]; });
    }
    return loaded[country];
  }
  // Rows come compact: [year, tier, league, pos, of, rank, move, href, now]. Each becomes the same journey entry the
  // club pages use, with its season's label and division sizes from the country's list of seasons.
  function decode(raw) {
    var byYear = {};
    raw.slots.forEach(function (s, i) { s.i = i; byYear[s.year] = s; });
    raw.clubs.forEach(function (c) {
      c.byYear = {};
      c.j.forEach(function (r) {
        var slot = byYear[r[0]];
        if (!slot) return;
        var lh = raw.leagueHref && raw.leagueHref[r[2]];
        c.byYear[r[0]] = { season: slot.season, year: r[0], tier: r[1], league: r[2], pos: r[3], of: r[4] || 0, rank: r[5] || 0,
          move: r[6] || "", href: r[7] ? BASE + r[7] : r[8] && lh ? BASE + lh : "", now: !!r[8], sizes: slot.sizes };
      });
      c.first = c.j.length ? c.j[c.j.length - 1][0] : null;
      c.last = c.j.length ? c.j[0][0] : null;
      c.key = fold(c.n);
    });
    raw.bySlug = {};
    raw.clubs.forEach(function (c) { raw.bySlug[c.s] = c; });
    return raw;
  }

  /* ---------- Club search box ---------- */
  // A combobox over one country's clubs: type to filter, arrows to move, Enter to pick, Escape to close.
  function picker(input, list, opts) {
    var items = [], at = -1;
    function close() { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); at = -1; }
    function mark(i) {
      var els = list.querySelectorAll("[role=option]");
      at = Math.max(-1, Math.min(i, els.length - 1));
      for (var k = 0; k < els.length; k++) { els[k].classList.toggle("on", k === at); els[k].setAttribute("aria-selected", k === at ? "true" : "false"); }
      if (at > -1) { input.setAttribute("aria-activedescendant", els[at].id); els[at].scrollIntoView({ block: "nearest" }); }
    }
    function show() {
      var q = fold(input.value), all = opts.clubs(), skip = opts.exclude ? opts.exclude() : null;
      items = all.filter(function (c) { return c.s !== skip && (!q || c.key.indexOf(q) > -1); });
      // Names starting with what's typed first, then clubs still in the leagues covered, then A to Z.
      items.sort(function (a, b) {
        var sa = q && a.key.indexOf(q) === 0 ? 0 : 1, sb = q && b.key.indexOf(q) === 0 ? 0 : 1;
        return sa - sb || (b.last || 0) - (a.last || 0) || a.n.localeCompare(b.n);
      });
      items = items.slice(0, 40);
      list.innerHTML = items.length ? items.map(function (c, i) {
        var latest = c.byYear[c.last] || {};
        var meta = latest.now ? latest.league + " · " + ord(latest.pos) : "Last seen " + (latest.season || "") + (latest.league ? " · " + latest.league : "");
        return '<li role="option" id="' + list.id + "-" + i + '" aria-selected="false" data-i="' + i + '">' + FP.flag(opts.country()) +
          '<span class="fl-name">' + esc(c.n) + '</span><span class="fl-meta">' + esc(meta) + "</span></li>";
      }).join("") : '<li class="finder-none">No ' + esc(opts.adjective()) + " club by that name with a journey here.</li>";
      list.hidden = false; input.setAttribute("aria-expanded", "true");
      mark(q && items.length ? 0 : -1);
    }
    function pick(i) { var c = items[i]; if (!c) return; close(); opts.onPick(c); }
    input.addEventListener("input", show);
    input.addEventListener("focus", function () { if (opts.ready()) { input.select(); show(); } });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { e.preventDefault(); if (list.hidden) show(); else mark(at + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); mark(at - 1); }
      else if (e.key === "Enter") { e.preventDefault(); if (!list.hidden) pick(at > -1 ? at : 0); }
      else if (e.key === "Escape") { if (!list.hidden) { e.stopPropagation(); close(); if (opts.onCancel) opts.onCancel(); } }
    });
    list.addEventListener("mousedown", function (e) { e.preventDefault(); });   // keep focus in the box
    list.addEventListener("click", function (e) { var li = e.target.closest("[role=option]"); if (li) pick(Number(li.getAttribute("data-i"))); });
    input.addEventListener("blur", function () { setTimeout(function () { close(); if (opts.onBlur) opts.onBlur(); }, 120); });
    return { show: show, close: close };
  }

  /* ---------- Club page: "Compare with another club" ---------- */
  if (PAGE === "club") {
    document.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest(".cmp-btn");
      if (!btn) return;
      e.preventDefault();
      var sec = btn.closest(".cl-sec"), box = sec.querySelector(".cmp-box");
      if (box) { box.hidden = !box.hidden; if (!box.hidden) box.querySelector("input").focus(); return; }
      var me = btn.getAttribute("data-compare"), name = (document.getElementById("intro-h") || {}).textContent || "this club";
      box = document.createElement("div");
      box.className = "cmp-box";
      box.innerHTML = '<label for="cmp-find">Compare ' + esc(name) + " with…</label>" +
        '<div class="cmp-field"><input id="cmp-find" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="cmp-find-list" placeholder="Search clubs" autocomplete="off" spellcheck="false">' +
        '<ul class="finder-list cmp-list" id="cmp-find-list" role="listbox" hidden></ul></div>';
      sec.querySelector(".cl-sec-h").insertAdjacentElement("afterend", box);
      var input = box.querySelector("input"), data = null;
      var p = picker(input, box.querySelector("ul"), {
        clubs: function () { return data ? data.clubs : []; }, exclude: function () { return me; },
        country: function () { return COUNTRY; }, adjective: function () { return data ? data.adjective : ""; },
        ready: function () { return !!data; },
        onPick: function (c) { location.href = compareUrl(COUNTRY, me, c.s); },
        onCancel: function () { box.hidden = true; btn.focus(); }
      });
      input.placeholder = "Loading clubs…";
      input.focus();
      load(COUNTRY).then(function (d) {
        data = d; input.placeholder = "Search " + d.adjective + " clubs";
        if (document.activeElement === input) p.show();
      }, function () { location.href = btn.href; });   // no data here: the comparison page has its own search
    });
    return;
  }
  if (PAGE !== "compare") return;

  /* ---------- Comparison page ---------- */
  var app = $("cmp-app"), D = null;
  var state = readState();
  var swapHost = document.querySelector(".cmp-vs");
  if (swapHost) {
    swapHost.removeAttribute("aria-hidden");
    swapHost.innerHTML = '<button type="button" class="cmp-act" id="cmp-swap" aria-label="Swap club 1 and club 2" title="Swap clubs">⇄ <span>Swap</span></button>';
  }

  function readState() {
    var q = new URLSearchParams(location.search), st = { a: q.get("a") || "", b: q.get("b") || "", pair: q.get("clubs") || "" };
    var r = q.get("range") || "all", m = /^(\d{4})-(\d{4})$/.exec(r);
    st.range = m ? "custom" : r === "5" || r === "10" ? r : "all";
    st.from = m ? Number(m[1]) : null; st.to = m ? Number(m[2]) : null;
    st.mode = q.get("mode") === "tier" ? "tier" : "rank";
    return st;
  }
  // "west-ham-united-vs-millwall": try each "-vs-" so a club whose own name contains "vs" still works.
  function resolvePair() {
    if (state.pair && D) {
      var parts = state.pair.split("-vs-");
      for (var i = 1; i < parts.length; i++) {
        var a = parts.slice(0, i).join("-vs-"), b = parts.slice(i).join("-vs-");
        if (D.bySlug[a] && D.bySlug[b]) { state.a = a; state.b = b; break; }
      }
      if (!state.a && parts.length > 1) { state.a = parts[0]; state.b = parts.slice(1).join("-vs-"); }
    }
    state.pair = "";
  }
  function query() {
    var q = [];
    if (state.a && state.b) q.push("clubs=" + encodeURIComponent(state.a) + "-vs-" + encodeURIComponent(state.b));
    else if (state.a) q.push("a=" + encodeURIComponent(state.a));
    else if (state.b) q.push("b=" + encodeURIComponent(state.b));
    if (state.range === "5" || state.range === "10") q.push("range=" + state.range);
    if (state.range === "custom" && state.from && state.to) q.push("range=" + state.from + "-" + state.to);
    if (state.mode === "tier") q.push("mode=tier");
    return q.length ? "?" + q.join("&") : "";
  }
  function pageUrl() { return location.origin + location.pathname + query(); }
  function save() { try { history.replaceState(null, "", location.pathname + query()); } catch (e) {} }

  var A = function () { return D && D.bySlug[state.a]; }, B = function () { return D && D.bySlug[state.b]; };

  // The seasons on the chart. Full history: from the first season either club appears to the last, so the chart
  // isn't padded with seasons neither was in. The last 5 or 10 run back from this season.
  function visibleSlots(a, b) {
    var slots = D.slots, n = slots.length;
    if (state.range === "5" || state.range === "10") return slots.slice(Math.max(0, n - Number(state.range)));
    if (state.range === "custom" && state.from && state.to) {
      var lo = Math.min(state.from, state.to), hi = Math.max(state.from, state.to);
      var c = slots.filter(function (s) { return s.year >= lo && s.year <= hi; });
      if (c.length) return c;
    }
    var has = function (s) { return (a && a.byYear[s.year]) || (b && b.byYear[s.year]); };
    var i = 0, j = n - 1;
    while (i < n - 1 && !has(slots[i])) i++;
    while (j > i && !has(slots[j])) j--;
    return slots.slice(i, j + 1);
  }

  // Summary figures for one club over the seasons shown, from tracked seasons only.
  function stats(c, slots, other) {
    var pts = slots.map(function (s) { return c.byYear[s.year]; }).filter(Boolean);
    var best = pts.slice().sort(function (x, y) { return x.tier - y.tier || x.pos - y.pos || y.year - x.year; })[0];
    var low = pts.slice().sort(function (x, y) { return y.tier - x.tier || y.year - x.year; })[0];
    var nowSlot = D.slots[D.slots.length - 1], now = c.byYear[nowSlot.year];
    var shared = other ? slots.filter(function (s) { var x = c.byYear[s.year], y = other.byYear[s.year]; return x && y && x.tier === y.tier && x.league === y.league; }) : [];
    return {
      pts: pts, best: best, low: low, now: now,
      ups: pts.filter(function (x) { return x.move === "up"; }).length,
      downs: pts.filter(function (x) { return x.move === "down"; }).length,
      shared: shared
    };
  }
  function tierName(t) { var l = (D.ladder || []).filter(function (x) { return x.tier === t; })[0]; return l ? l.name : ""; }
  function short(name) { return String(name).replace(/ (Football Club|FC|AFC|CF|SC)$/, ""); }

  function render() {
    var a = A(), b = B();
    var title = $("cmp-title"), lede = $("cmp-lede");
    $("cmp-a").value = a ? a.n : ""; $("cmp-b").value = b ? b.n : "";
    var pickers = $("cmp-pickers");
    pickers.classList.toggle("cmp-ready", !!(a && b));
    var swap = $("cmp-swap");
    if (swap) swap.disabled = !(a && b);
    var sys = D.system || D.adjective + " pyramid";
    if (!a || !b) {
      title.textContent = "Compare " + D.adjective + " clubs";
      lede.textContent = "Two clubs on one chart: every season of their journeys through the " + sys + ".";
      document.title = "Compare " + D.adjective + " clubs: pyramid journey comparison | Football Pyramids";
      app.innerHTML = '<p class="cmp-empty">' + (a || b ? "Now choose a club to compare " + esc((a || b).n) + " with." : "Choose two " + esc(D.adjective) + " clubs to compare their journeys.") + "</p>";
      return;
    }
    title.textContent = a.n + " vs " + b.n;
    lede.textContent = "Their journeys through the " + sys + ", season by season.";
    document.title = a.n + " vs " + b.n + ": Pyramid Journey Comparison | Football Pyramids";
    var md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute("content", "Compare " + a.n + " and " + b.n + "’s journey through the " + (D.system || D.adjective + " football pyramid") + ", season by season.");
    var can = document.querySelector('link[rel="canonical"]');
    if (can) can.setAttribute("href", can.getAttribute("href").split("?")[0] + "?clubs=" + a.s + "-vs-" + b.s);

    if (a.s === b.s) { app.innerHTML = '<p class="cmp-empty">Choose a different club to compare.</p>'; return; }

    var slots = visibleSlots(a, b);
    var sa = stats(a, slots, b), sb = stats(b, slots, a);
    var overlap = slots.some(function (s) { return a.byYear[s.year] && b.byYear[s.year]; });
    var series = [a, b].map(function (c) {
      return { name: c.n, pts: slots.map(function (s) { return c.byYear[s.year] || null; }) };
    });
    var plotCfg = { slots: slots, series: series, ladder: D.ladder, adjective: D.adjective, mode: state.mode };
    var plot = FP.journeyPlot(plotCfg);
    var span = slots.length ? slots[0].season + " → " + slots[slots.length - 1].season : "";

    // Controls: seasons, view, share.
    var opt = function (v, l) { return '<option value="' + v + '"' + (state.range === v ? " selected" : "") + ">" + l + "</option>"; };
    var yrs = D.slots.map(function (s) { return s.year; });
    var from = state.from || slots[0].year, to = state.to || slots[slots.length - 1].year;
    var yopt = function (sel) { return D.slots.map(function (s) { return '<option value="' + s.year + '"' + (s.year === sel ? " selected" : "") + ">" + esc(s.season) + "</option>"; }).join(""); };
    var controls = '<div class="cmp-controls">' +
      '<label class="cmp-range"><span class="sr-only">Seasons</span><select id="cmp-range">' + opt("all", "Full history") + opt("10", "Last 10 seasons") + opt("5", "Last 5 seasons") + opt("custom", "Custom range…") + "</select></label>" +
      (state.range === "custom" ? '<span class="cmp-custom"><label><span class="sr-only">From</span><select id="cmp-from">' + yopt(from) + '</select></label><i aria-hidden="true">→</i><label><span class="sr-only">To</span><select id="cmp-to">' + yopt(to) + "</select></label></span>" : "") +
      '<div class="tview cmp-mode" role="group" aria-label="Chart view"><button type="button" data-mode="rank" class="' + (state.mode === "rank" ? "on" : "") + '" aria-pressed="' + (state.mode === "rank") + '">Pyramid position</button>' +
        '<button type="button" data-mode="tier" class="' + (state.mode === "tier" ? "on" : "") + '" aria-pressed="' + (state.mode === "tier") + '">Tier</button></div>' +
      '<div class="cmp-actions"><button type="button" class="cmp-act cmp-act-main" id="cmp-export" aria-expanded="false" aria-controls="cmp-export-box">Export image</button>' +
        '<button type="button" class="cmp-act" id="cmp-copy">Copy link</button></div></div>';

    // Chart caption: where each club is now (or was last seen).
    var where = function (c, s) {
      var x = s.now;
      if (x) return c.n + " " + ord(x.pos) + " " + FP.inLeague(x.league) + (plot.scale.ranked(x) ? " (" + ord(x.rank) + " of " + plot.scale.natTotal(x) + ")" : "");
      var last = c.byYear[c.last];
      return c.n + ": not in the leagues covered here this season" + (last ? " (last seen " + last.season + ", " + last.league + ")" : "");
    };
    var cap = '<p class="lchart-cap">' + esc(D.slots[D.slots.length - 1].season) + ": " + esc(where(a, sa)) + "; " + esc(where(b, sb)) + ".</p>";
    var note = !overlap
      ? '<p class="cmp-note">These clubs don’t have overlapping journey data in Football Pyramids’ current historical coverage' + (state.range === "all" ? "" : " for these seasons") + ". Each line shows the seasons we do have.</p>"
      : "";
    var gapNote = [a, b].some(function (c) { return slots.some(function (s) { return !c.byYear[s.year]; }); })
      ? '<p class="lchart-note">A break in a line is a season the club was outside the divisions tracked here, or one we have no table for. Missing seasons are never filled in.</p>' : "";

    // Summary panel
    var bestTxt = function (s) { return s.best ? ord(s.best.pos) + " in " + s.best.league + " (" + s.best.season + ")" : "–"; };
    var nowTxt = function (s) { return s.now ? "Tier " + s.now.tier + " · " + s.now.league : "Not in covered leagues"; };
    var lowTxt = function (s) { return s.low ? "Tier " + s.low.tier + " · " + (tierName(s.low.tier) || s.low.league) : "–"; };
    var row = function (label, f) { return "<tr><th scope=\"row\">" + label + "</th><td>" + esc(f(sa)) + "</td><td>" + esc(f(sb)) + "</td></tr>"; };
    var summary = '<section class="cl-sec cmp-sum"><div class="cl-sec-h"><h2>At a glance</h2><span class="cmp-span">' + esc(span) + "</span></div>" +
      '<div class="cmp-table-wrap"><table class="cmp-table"><thead><tr><th scope="col"><span class="sr-only">Measure</span></th>' +
        '<th scope="col"><i class="lk-s0" aria-hidden="true"></i>' + esc(a.n) + '</th><th scope="col"><i class="lk-s1" aria-hidden="true"></i>' + esc(b.n) + "</th></tr></thead><tbody>" +
        row("Current tier", nowTxt) + row("Highest tracked finish", bestTxt) + row("Lowest tracked tier", lowTxt) +
        row("Promotions", function (s) { return String(s.ups); }) + row("Relegations", function (s) { return String(s.downs); }) +
        row("Seasons tracked", function (s) { return String(s.pts.length); }) +
        '<tr><th scope="row">Seasons in the same division</th><td colspan="2" class="cmp-both">' + sa.shared.length + "</td></tr>" +
      "</tbody></table></div></section>";

    // Seasons in the same division, newest first.
    var sharedHTML = sa.shared.length ? '<section class="cl-sec"><div class="cl-sec-h"><h2>Same division</h2></div><ul class="cmp-shared">' +
      sa.shared.slice().reverse().map(function (s) {
        var x = a.byYear[s.year], y = b.byYear[s.year], aAbove = x.pos < y.pos;
        var link = x.href || y.href;
        return "<li><span class=\"cs-season\">" + esc(s.season) + '</span><span class="cs-league">' + (link ? '<a href="' + esc(link) + '">' + esc(x.league) + "</a>" : esc(x.league)) + "</span>" +
          '<span class="cs-pos"><b class="' + (aAbove ? "ahead" : "") + '"><i class="lk-s0" aria-hidden="true"></i>' + esc(short(a.n)) + " " + ord(x.pos) + "</b>" +
          '<b class="' + (!aAbove ? "ahead" : "") + '"><i class="lk-s1" aria-hidden="true"></i>' + esc(short(b.n)) + " " + ord(y.pos) + "</b></span></li>";
      }).join("") + "</ul></section>" : "";

    // Season by season, both clubs side by side.
    var cell = function (x) {
      if (!x) return '<td class="cs-out" title="No tracked data for this club in this season">No tracked season</td>';
      return "<td><i class=\"tag tier-" + x.tier + "\">T" + x.tier + "</i> " + (x.href ? '<a href="' + esc(x.href) + '">' + esc(x.league) + "</a>" : esc(x.league)) + " <b>" + ord(x.pos) + "</b>" +
        (x.move ? ' <i class="jm ' + x.move + '">' + (x.move === "up" ? "▲" : "▼") + "</i>" : "") + "</td>";
    };
    var seasons = '<details class="jmore" id="cmp-seasons"><summary>Season by season <span>' + slots.length + (slots.length === 1 ? " season" : " seasons") + "</span></summary>" +
      '<div class="cmp-table-wrap"><table class="cmp-table cmp-seasons"><thead><tr><th scope="col">Season</th><th scope="col">' + esc(a.n) + '</th><th scope="col">' + esc(b.n) + "</th></tr></thead><tbody>" +
      slots.slice().reverse().map(function (s) { return "<tr><th scope=\"row\">" + esc(s.season) + "</th>" + cell(a.byYear[s.year]) + cell(b.byYear[s.year]) + "</tr>"; }).join("") +
      "</tbody></table></div></details>";

    var openSeasons = $("cmp-seasons") && $("cmp-seasons").open;
    app.innerHTML = controls + '<div class="cmp-export" id="cmp-export-box" hidden></div>' +
      '<section class="cl-sec cmp-chart" id="journey"><div class="cl-sec-h"><h2>' + esc(a.n) + " vs " + esc(b.n) + "</h2></div>" + cap + note + plot.html + gapNote + seasons + "</section>" +
      summary + sharedHTML +
      '<p class="cmp-links"><a href="' + esc(BASE + a.p + SUFFIX) + '">' + esc(a.n) + ' club page →</a><a href="' + esc(BASE + b.p + SUFFIX) + '">' + esc(b.n) + " club page →</a></p>";
    if (openSeasons) $("cmp-seasons").open = true;
    current = { a: a, b: b, slots: slots, sa: sa, sb: sb, plotCfg: plotCfg, span: span };
    if (exportOpen) openExport();
  }
  var current = null, exportOpen = false;

  function update(changes) {
    for (var k in changes) state[k] = changes[k];
    save(); render();
  }

  var swapBtn = $("cmp-swap");
  if (swapBtn) {
    swapBtn.addEventListener("click", function () {
      if (!state.a || !state.b) return;
      var oldA = state.a;
      update({ a: state.b, b: oldA });
      swapBtn.focus();
    });
  }

  // Controls (delegated, since the controls are redrawn with the chart).
  app.addEventListener("change", function (e) {
    if (e.target.id === "cmp-range") {
      var v = e.target.value;
      if (v === "custom") {
        var sl = current ? current.slots : D.slots;
        update({ range: "custom", from: sl[0].year, to: sl[sl.length - 1].year });
      } else update({ range: v, from: null, to: null });
      var r = $("cmp-range"); if (r) r.focus();
    } else if (e.target.id === "cmp-from" || e.target.id === "cmp-to") {
      var f = Number($("cmp-from").value), t = Number($("cmp-to").value);
      update({ from: Math.min(f, t), to: Math.max(f, t) });
      var again = $(e.target.id); if (again) again.focus();
    }
  });
  app.addEventListener("click", function (e) {
    var m = e.target.closest("[data-mode]");
    if (m) { update({ mode: m.getAttribute("data-mode") }); var b2 = app.querySelector('[data-mode="' + state.mode + '"]'); if (b2) b2.focus(); return; }
    if (e.target.closest("#cmp-copy")) { copyLink(); return; }
    if (e.target.closest("#cmp-export")) { exportOpen = !exportOpen; if (exportOpen) openExport(); else closeExport(); return; }
    var f = e.target.closest("[data-format]");
    if (f) { format = f.getAttribute("data-format"); openExport(); return; }
    if (e.target.closest("#cmp-dl")) { download(); return; }
    if (e.target.closest("#cmp-share")) { share(); return; }
  });

  function copyLink() {
    var url = pageUrl();
    var done = function () { var b = $("cmp-copy"); if (b) { b.textContent = "Link copied"; setTimeout(function () { var b2 = $("cmp-copy"); if (b2) b2.textContent = "Copy link"; }, 2000); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { toast(url); });
    else toast(url);
  }

  /* ---------- Shareable image ----------
     A purpose-built card, not a screenshot: an SVG drawn from the same chart geometry and summary as the page, in the
     site's dark colours and fonts (embedded, so the image looks the same everywhere), then turned into a PNG. */
  var FORMATS = { square: [1080, 1080, "Square"], portrait: [1080, 1350, "Portrait"], landscape: [1200, 675, "Landscape"] };
  var format = "square", lastPng = null, building = 0;
  var C = { bg: "#0E141C", panel: "#151D28", ink: "#E6EBF0", muted: "#96A1B3", rule: "#243041", rule2: "#3A4B62",
    accent: "#8EA2FF", accentSoft: "#1C2547", hatch: "rgba(230,235,240,0.05)", up: "#45C47E", down: "#F26B60", champ: "#E8B931", s1: "#E6EBF0" };
  var FONTS = [
    ["Big Shoulders Display", 800, "big-shoulders-display-latin-800-normal"],
    ["Big Shoulders Display", 700, "big-shoulders-display-latin-700-normal"],
    ["IBM Plex Sans", 400, "ibm-plex-sans-latin-400-normal"],
    ["IBM Plex Sans", 600, "ibm-plex-sans-latin-600-normal"],
    ["IBM Plex Mono", 500, "ibm-plex-mono-latin-500-normal"]
  ];
  var fontCss = null;
  function fontsCss() {
    if (fontCss) return fontCss;
    fontCss = Promise.all(FONTS.map(function (f) {
      return fetch(BASE + "assets/fonts/" + f[2] + ".woff2").then(function (r) { return r.blob(); }).then(function (blob) {
        return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(blob); });
      }).then(function (url) { return '@font-face{font-family:"' + f[0] + '";font-weight:' + f[1] + ';src:url(' + url + ') format("woff2");}'; });
    })).then(function (css) { return css.join(""); });
    fontCss.catch(function () { fontCss = null; });
    return fontCss;
  }
  var measureCtx = null;
  function textWidth(text, font) {
    measureCtx = measureCtx || document.createElement("canvas").getContext("2d");
    measureCtx.font = font;
    return measureCtx.measureText(text).width;
  }
  // The biggest size (up to max) at which the text fits the width.
  function fit(text, weight, family, max, width, min) {
    var size = max;
    while (size > (min || 20) && textWidth(text, weight + " " + size + 'px "' + family + '"') > width) size -= 2;
    return size;
  }
  function x(s) { return esc(s); }

  function cardSVG(fmt, css) {
    var W = FORMATS[fmt][0], H = FORMATS[fmt][1], wide = fmt === "landscape";
    var cur = current, a = cur.a, b = cur.b;
    var P = wide ? 48 : 64, out = [];
    var D_ = "Big Shoulders Display", S_ = "IBM Plex Sans", M_ = "IBM Plex Mono";
    out.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '">');
    out.push("<defs><style>" + css + "</style></defs>");
    out.push('<rect width="' + W + '" height="' + H + '" fill="' + C.bg + '"/>');
    // Brand line
    var y = P;
    out.push('<g transform="translate(' + P + "," + (y - 2) + ')"><rect x="8" y="0" width="12" height="6" rx="1.5" fill="' + C.accent + '"/><rect x="4" y="10" width="20" height="6" rx="1.5" fill="' + C.accent + '"/><rect x="0" y="20" width="28" height="6" rx="1.5" fill="' + C.accent + '"/></g>');
    out.push('<text x="' + (P + 40) + '" y="' + (y + 21) + '" font-family="' + D_ + '" font-weight="800" font-size="30" letter-spacing="1.5" fill="' + C.ink + '">FOOTBALL PYRAMIDS</text>');
    out.push('<text x="' + (W - P) + '" y="' + (y + 20) + '" text-anchor="end" font-family="' + M_ + '" font-weight="500" font-size="17" letter-spacing="2.5" fill="' + C.accent + '">' + x(D.name.toUpperCase()) + " · CLUB COMPARISON</text>");
    y += 30 + (wide ? 34 : 56);
    // Title
    var tw = W - 2 * P, an = a.n.toUpperCase(), bn = b.n.toUpperCase();
    var one = an + "  VS  " + bn;
    var oneSize = fit(one, 800, D_, wide ? 66 : 90, tw, 44);
    if (wide && oneSize >= 46) {
      out.push('<text x="' + P + '" y="' + (y + oneSize * 0.8) + '" font-family="' + D_ + '" font-weight="800" font-size="' + oneSize + '" fill="' + C.ink + '">' +
        '<tspan fill="' + C.accent + '">' + x(an) + '</tspan><tspan fill="' + C.muted + '" font-weight="700">  vs  </tspan><tspan>' + x(bn) + "</tspan></text>");
      y += oneSize * 0.8 + 18;
    } else {
      var size = Math.min(fit(an, 800, D_, wide ? 60 : 96, tw, 36), fit(bn, 800, D_, wide ? 60 : 96, tw, 36));
      out.push('<text x="' + P + '" y="' + (y + size * 0.8) + '" font-family="' + D_ + '" font-weight="800" font-size="' + size + '" fill="' + C.accent + '">' + x(an) + "</text>");
      y += size * 0.8 + size * 0.42;
      out.push('<text x="' + P + '" y="' + y + '" font-family="' + D_ + '" font-weight="700" font-size="' + Math.round(size * 0.42) + '" letter-spacing="2" fill="' + C.muted + '">VS</text>');
      y += size * 0.12 + size * 0.8;
      out.push('<text x="' + P + '" y="' + y + '" font-family="' + D_ + '" font-weight="800" font-size="' + size + '" fill="' + C.ink + '">' + x(bn) + "</text>");
      y += 20;
    }
    var sub = "Their journey through the " + (D.system || D.adjective + " pyramid");
    out.push('<text x="' + P + '" y="' + (y + 24) + '" font-family="' + S_ + '" font-weight="400" font-size="' + (wide ? 21 : 25) + '" fill="' + C.muted + '">' + x(sub) +
      '<tspan font-family="' + M_ + '" font-weight="500" fill="' + C.ink + '" dx="14">' + x(cur.span) + "</tspan></text>");
    y += 24 + (wide ? 26 : 40);

    // Footer and stats sit at the bottom; the chart takes what's left.
    var footH = 54, statsH = wide ? 0 : fmt === "portrait" ? 196 : 150;
    var chartTop = y, chartBottom = H - P - footH - statsH - (wide ? 0 : 24);
    var chartW = wide ? Math.round((W - 2 * P) * 0.66) : W - 2 * P;
    out.push(chartSvg(P, chartTop, chartW, chartBottom - chartTop));

    // Stats: two columns under the chart (square, portrait) or a column beside it (landscape).
    var plural = function (k, w) { return k + " " + w + (k === 1 ? "" : "s"); };
    var lines = function (s) {
      return [
        ["Highest", s.best ? ord(s.best.pos) + " in " + s.best.league + " · " + s.best.season : "–"],
        ["Moves", plural(s.ups, "promotion") + " · " + plural(s.downs, "relegation")],
        ["Current", s.now ? s.now.league + " · " + ord(s.now.pos) : "Not in covered leagues"]
      ];
    };
    // stacked: label above value (the narrow column beside the chart on a landscape card).
    var drawStats = function (sx, sy, w, s, c, si, stacked) {
      var g = '<g transform="translate(' + sx + "," + sy + ')">';
      g += si ? '<rect x="2" y="6" width="16" height="16" fill="' + C.bg + '" stroke="' + C.s1 + '" stroke-width="4"/>' : '<circle cx="10" cy="14" r="9" fill="' + C.accent + '"/>';
      var nm = c.n.toUpperCase(), ns = fit(nm, 800, D_, 32, w - 30, 18);
      g += '<text x="30" y="24" font-family="' + D_ + '" font-weight="800" font-size="' + ns + '" letter-spacing="0.5" fill="' + (si ? C.s1 : C.accent) + '">' + x(nm) + "</text>";
      var step = stacked ? 42 : fmt === "portrait" ? 40 : 30, lw = stacked ? 0 : 120, first = stacked ? 54 : 60;
      lines(s).forEach(function (l, i) {
        var val = l[1], vs = fit(val, 600, S_, stacked ? 19 : 20, w - lw, 13), ly = first + i * step;
        g += '<text x="0" y="' + ly + '" font-family="' + M_ + '" font-weight="500" font-size="' + (stacked ? 13 : 14) + '" letter-spacing="1.5" fill="' + C.muted + '">' + l[0].toUpperCase() + "</text>";
        g += '<text x="' + lw + '" y="' + (stacked ? ly + 22 : ly) + '" font-family="' + S_ + '" font-weight="600" font-size="' + vs + '" fill="' + C.ink + '">' + x(val) + "</text>";
      });
      return g + "</g>";
    };
    if (wide) {
      var sx = P + chartW + 36, sw = W - P - sx;
      out.push(drawStats(sx, chartTop - 4, sw, cur.sa, a, 0, true));
      out.push(drawStats(sx, chartTop - 4 + 184, sw, cur.sb, b, 1, true));
    } else {
      var colW = (W - 2 * P - 40) / 2, top = chartBottom + 30;
      out.push('<line x1="' + P + '" y1="' + (top - 6) + '" x2="' + (W - P) + '" y2="' + (top - 6) + '" stroke="' + C.rule + '" stroke-width="2"/>');
      out.push(drawStats(P, top + 14, colW, cur.sa, a, 0));
      out.push(drawStats(P + colW + 40, top + 14, colW, cur.sb, b, 1));
    }
    // Footer: key for the dot colours, and the address.
    var fy = H - P;
    var keyX = P, key = [["champ", "Champions", C.champ], ["up", "Promoted", C.up], ["down", "Relegated", C.down]];
    var have = {}; [cur.sa, cur.sb].forEach(function (s) { s.pts.forEach(function (p) { var m = FP.journeyMark(p); if (m) have[m] = 1; }); });
    key.forEach(function (k) {
      if (!have[k[0]]) return;
      out.push('<circle cx="' + (keyX + 7) + '" cy="' + (fy - 7) + '" r="7" fill="' + k[2] + '"/><text x="' + (keyX + 22) + '" y="' + fy + '" font-family="' + S_ + '" font-weight="400" font-size="18" fill="' + C.muted + '">' + k[1] + "</text>");
      keyX += 32 + textWidth(k[1], '400 18px "IBM Plex Sans"') + 18;
    });
    out.push('<text x="' + (W - P) + '" y="' + fy + '" text-anchor="end" font-family="' + D_ + '" font-weight="800" font-size="30" letter-spacing="1" fill="' + C.ink + '">footballpyramids.com</text>');
    out.push("</svg>");
    return out.join("");
  }
  // The chart, drawn from FP.journeyGeometry (the same numbers as the page's chart) into a box on the card.
  function chartSvg(L, T, W, H) {
    var g = FP.journeyGeometry(current.plotCfg), sideW = 92, xlH = 34;
    var px = L + sideW, pw = W - sideW, ph = H - xlH;
    var sx = function (v) { return px + v / 1000 * pw; }, sy = function (v) { return T + v / g.ymax * ph; };
    var o = ['<g>'];
    o.push('<rect x="' + px + '" y="' + T + '" width="' + pw + '" height="' + ph + '" fill="' + C.panel + '"/>');
    g.bands.forEach(function (b) {
      var fill = b.t === 0 ? C.accentSoft : b.t % 2 ? C.hatch : "none";
      if (fill !== "none") o.push('<rect x="' + sx(b.x) + '" y="' + sy(b.y) + '" width="' + (b.w / 1000 * pw) + '" height="' + (b.h / g.ymax * ph) + '" fill="' + fill + '"/>');
    });
    // Division labels and a line where each division starts.
    g.side.forEach(function (l, i) {
      var top = sy(l.y), hh = l.h / g.ymax * ph, mid = top + hh / 2;
      if (i) o.push('<line x1="' + L + '" y1="' + top + '" x2="' + (px + pw) + '" y2="' + top + '" stroke="' + C.rule2 + '" stroke-width="1"/>');
      if (hh >= 20) {
        var ns = fit(l.short, 500, "IBM Plex Mono", 15, sideW - 12, 10);
        o.push('<text x="' + (px - 10) + '" y="' + (mid + (hh >= 40 ? -2 : 5)) + '" text-anchor="end" font-family="IBM Plex Mono" font-weight="500" font-size="' + ns + '" fill="' + C.ink + '">' + x(l.short) + "</text>");
        if (hh >= 40) o.push('<text x="' + (px - 10) + '" y="' + (mid + 15) + '" text-anchor="end" font-family="IBM Plex Mono" font-weight="500" font-size="12" fill="' + C.muted + '">' + x(l.range) + "</text>");
      }
    });
    o.push('<line x1="' + px + '" y1="' + T + '" x2="' + px + '" y2="' + (T + ph) + '" stroke="' + C.rule2 + '" stroke-width="2"/>');
    // Lines, then dots on top.
    g.lines.forEach(function (segs, si) {
      segs.forEach(function (sg) {
        if (sg.length < 2) return;
        o.push('<polyline fill="none" stroke="' + (si ? C.s1 : C.accent) + '" stroke-width="' + (si ? 3.5 : 4.5) + '" stroke-linejoin="round" stroke-linecap="round"' + (si ? ' stroke-dasharray="10 7"' : "") +
          ' points="' + sg.map(function (p) { return sx(p[0]).toFixed(1) + "," + sy(p[1]).toFixed(1); }).join(" ") + '"/>');
      });
    });
    var r = g.n > 30 ? 5 : g.n > 18 ? 6.5 : 8;
    g.dots.forEach(function (d) {
      var col = d.s ? C.s1 : C.accent, fill = d.mark === "champ" ? C.champ : d.mark === "up" ? C.up : d.mark === "down" ? C.down : d.p.now ? col : C.bg;
      var cx = sx(d.x), cy = sy(d.y);
      if (d.s) o.push('<rect x="' + (cx - r) + '" y="' + (cy - r) + '" width="' + 2 * r + '" height="' + 2 * r + '" fill="' + fill + '" stroke="' + (d.mark ? fill : col) + '" stroke-width="3"/>');
      else o.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="' + fill + '" stroke="' + (d.mark ? fill : col) + '" stroke-width="3"/>');
    });
    // Season labels along the bottom, thinned as on a wide screen.
    g.xl.forEach(function (l) {
      if (!l.wide) return;
      var anchor = l.k === g.n - 1 && g.n > 1 ? "end" : "middle";
      var tx = sx(l.x) + (anchor === "start" ? -6 : anchor === "end" ? 6 : 0);
      o.push('<line x1="' + sx(l.x) + '" y1="' + (T + ph) + '" x2="' + sx(l.x) + '" y2="' + (T + ph + 7) + '" stroke="' + C.rule2 + '" stroke-width="2"/>');
      o.push('<text x="' + tx + '" y="' + (T + ph + 28) + '" text-anchor="' + anchor + '" font-family="IBM Plex Mono" font-weight="500" font-size="16" fill="' + C.muted + '">' + x(l.label) + "</text>");
    });
    o.push("</g>");
    return o.join("");
  }

  function makePng(fmt) {
    var id = ++building;
    return Promise.all([fontsCss(), document.fonts && document.fonts.load ? Promise.all([
      document.fonts.load('800 40px "Big Shoulders Display"'), document.fonts.load('600 20px "IBM Plex Sans"'), document.fonts.load('500 15px "IBM Plex Mono"')
    ]).catch(function () {}) : null]).then(function (r) {
      var svg = cardSVG(fmt, r[0]), W = FORMATS[fmt][0], H = FORMATS[fmt][1];
      return new Promise(function (res, rej) {
        var img = new Image();
        img.onload = function () {
          // A moment for the embedded fonts (some browsers lay out text before they've decoded).
          setTimeout(function () {
            var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
            var ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0, W, H);
            cv.toBlob(function (blob) { blob ? res({ blob: blob, svg: svg, id: id }) : rej(new Error("png")); }, "image/png");
          }, 60);
        };
        img.onerror = function () { rej(new Error("svg")); };
        img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      });
    });
  }
  function fileName() { return "football-pyramids-" + current.a.s + "-vs-" + current.b.s + "-" + format + ".png"; }
  function openExport() {
    var box = $("cmp-export-box"), btn = $("cmp-export");
    if (!box || !current) return;
    box.hidden = false; if (btn) btn.setAttribute("aria-expanded", "true");
    var canShare = !!(navigator.canShare && window.File && navigator.canShare({ files: [new File([""], "x.png", { type: "image/png" })] }));
    box.innerHTML = '<div class="cmp-ex-h"><div class="tview" role="group" aria-label="Image size">' + Object.keys(FORMATS).map(function (k) {
      return '<button type="button" data-format="' + k + '" class="' + (k === format ? "on" : "") + '" aria-pressed="' + (k === format) + '">' + FORMATS[k][2] + " <span>" + FORMATS[k][0] + "×" + FORMATS[k][1] + "</span></button>";
    }).join("") + '</div><div class="cmp-ex-btns">' + (canShare ? '<button type="button" class="cmp-act" id="cmp-share">Share image</button>' : "") +
      '<button type="button" class="cmp-act cmp-act-main" id="cmp-dl">Download PNG</button></div></div>' +
      '<div class="cmp-preview cmp-' + format + '"><p class="cmp-wait">Drawing the image…</p></div>';
    lastPng = null;
    var want = format;
    makePng(format).then(function (p) {
      if (p.id !== building || want !== format) return;
      lastPng = p;
      var pv = box.querySelector(".cmp-preview");
      if (pv) pv.innerHTML = '<img alt="' + esc(current.a.n + " vs " + current.b.n + ": shareable image") + '" src="' + URL.createObjectURL(p.blob) + '" width="' + FORMATS[format][0] + '" height="' + FORMATS[format][1] + '">';
    }, function () {
      var pv = box.querySelector(".cmp-preview");
      if (pv) pv.innerHTML = '<p class="cmp-wait">The image couldn’t be made in this browser. Try another browser, or copy the link instead.</p>';
    });
  }
  function closeExport() { var box = $("cmp-export-box"), btn = $("cmp-export"); if (box) box.hidden = true; if (btn) btn.setAttribute("aria-expanded", "false"); }
  function withPng(fn) {
    if (lastPng) return fn(lastPng);
    makePng(format).then(function (p) { lastPng = p; fn(p); }, function () { toast("The image couldn’t be made in this browser."); });
  }
  function download() {
    withPng(function (p) {
      var a = document.createElement("a"); a.href = URL.createObjectURL(p.blob); a.download = fileName();
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    });
  }
  function share() {
    withPng(function (p) {
      var file = new File([p.blob], fileName(), { type: "image/png" });
      navigator.share({ files: [file], title: current.a.n + " vs " + current.b.n, text: current.a.n + " vs " + current.b.n + " · Football Pyramids", url: pageUrl() })
        .catch(function (e) { if (e && e.name !== "AbortError") download(); });
    });
  }

  /* ---------- Start ---------- */
  var listOpts = function (side) {
    return {
      clubs: function () { return D ? D.clubs : []; },
      exclude: function () { return side === "a" ? state.b : state.a; },
      country: function () { return COUNTRY; }, adjective: function () { return D ? D.adjective : ""; },
      ready: function () { return !!D; },
      onPick: function (c) {
        var ch = {}; ch[side] = c.s; update(ch);
        if (side === "a" && !state.b) $("cmp-b").focus();
        else if (side === "b" && !state.a) $("cmp-a").focus();
      },
      onBlur: function () { var c = side === "a" ? A() : B(), el = $("cmp-" + side); if (el && document.activeElement !== el) el.value = c ? c.n : ""; }
    };
  };
  picker($("cmp-a"), $("cmp-a-list"), listOpts("a"));
  picker($("cmp-b"), $("cmp-b-list"), listOpts("b"));
  app.innerHTML = '<p class="cmp-empty">Loading journeys…</p>';
  load(COUNTRY, body.getAttribute("data-journeys")).then(function (d) {
    D = d;
    resolvePair();
    if (state.a && !D.bySlug[state.a]) state.a = "";
    if (state.b && !D.bySlug[state.b]) state.b = "";
    save();
    render();
    if (!state.a) $("cmp-a").focus();
    else if (!state.b) $("cmp-b").focus();
  }, function () {
    app.innerHTML = '<p class="cmp-empty">The journeys couldn’t be loaded. Check your connection and refresh the page.</p>';
  });
})();