/* Football Pyramids: browser behaviour. Club and league search, remembered club, and live refresh of the tables. */
(function () {
  "use strict";
  var body = document.querySelector("[data-page]") || document.body;
  var PAGE = body.getAttribute("data-page");          // "home" or "country"
  var COUNTRY = body.getAttribute("data-country");    // e.g. "spain" on a country page
  var BASE = body.getAttribute("data-base") || "";    // relative path back to the site root
  var COUNTRIES = (body.getAttribute("data-countries") || "").split(",").filter(Boolean);
  var SUFFIX = body.getAttribute("data-index") || "";  // "index.html" only in the offline preview
  var REFRESH_MS = 5 * 60 * 1000;
  var STORE_KEY = "pyramid:club";
  var ALIASES = {
    "spurs": "Tottenham Hotspur", "man city": "Manchester City", "man utd": "Manchester United",
    "man united": "Manchester United", "wolves": "Wolverhampton Wanderers", "boro": "Middlesbrough",
    "qpr": "Queens Park Rangers", "west brom": "West Bromwich Albion", "forest": "Nottingham Forest",
    "brighton": "Brighton & Hove Albion", "bournemouth": "AFC Bournemouth", "mk dons": "Milton Keynes Dons",
    "sheff utd": "Sheffield United", "sheff wed": "Sheffield Wednesday", "villa": "Aston Villa",
    "palace": "Crystal Palace", "pompey": "Portsmouth", "barca": "Barcelona", "barça": "Barcelona",
    "atleti": "Atlético Madrid", "atletico": "Atlético Madrid", "real": "Real Madrid", "betis": "Real Betis",
    "bayern": "Bayern Munich", "dortmund": "Borussia Dortmund", "bvb": "Borussia Dortmund",
    "gladbach": "Borussia Mönchengladbach", "leverkusen": "Bayer Leverkusen", "hsv": "Hamburger SV",
    "psg": "Paris Saint-Germain", "om": "Marseille", "ol": "Lyon", "inter": "Inter Milan", "milan": "AC Milan",
    "juve": "Juventus"
  };
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(id) { return document.getElementById(id); }
  var myClub = null;
  try { myClub = localStorage.getItem(STORE_KEY); } catch (e) {}

  /* ---------- Highlighting a club ---------- */
  function applyClub(scroll) {
    var rows = document.querySelectorAll("tr[data-team]");
    var target = null;
    for (var i = 0; i < rows.length; i++) {
      var on = rows[i].getAttribute("data-team") === myClub;
      rows[i].classList.toggle("is-mine", on);
      rows[i].classList.remove("flash");
      if (on && !target) target = rows[i];
    }
    $("club-clear").hidden = !myClub;
    if (myClub && document.activeElement !== $("club-find")) $("club-find").value = myClub;
    if (scroll && target) {
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      void target.offsetWidth;
      target.classList.add("flash");
    }
    return !!target;
  }
  function setClub(name) {
    myClub = name || null;
    try { if (myClub) localStorage.setItem(STORE_KEY, myClub); else localStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  /* ---------- Club and league search ----------
     Searches every current league plus every current and past club. A combobox: type, pick from the list with the
     mouse or arrow keys, Enter opens the club page or jumps straight to the league table. Matching ignores accents,
     case and punctuation, so "koln" finds "1. FC Köln". Club aliases such as "Spurs" still work. */
  var searchItems = null;
  var searchLoading = null;
  function norm(s) {
    var t = String(s || "").toLowerCase();
    try { t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
    return t.replace(/ø/g, "o").replace(/ł/g, "l").replace(/ß/g, "ss").replace(/ı/g, "i").replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }
  function itemName(x) { return x.name || x.team || ""; }
  function loadSearch() {
    if (searchItems) return Promise.resolve(searchItems);
    if (searchLoading) return searchLoading;
    searchLoading = fetch(BASE + "data/search.json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; })
      .then(function (list) {
        list.forEach(function (x) { x._n = norm(itemName(x)); x._short = norm(x.short || ""); x._aka = (x.aka || []).map(norm); });
        searchItems = list;
        return list;
      });
    return searchLoading;
  }
  function searchAll(q, max) {
    if (!searchItems) return [];
    var raw = q.trim().toLowerCase();
    var n = norm(ALIASES[raw] || raw);
    if (!n) return [];
    var out = [];
    searchItems.forEach(function (x) {
      var s = x._n === n || x._short === n ? 0
        : x._n.indexOf(n) === 0 || (x._short && x._short.indexOf(n) === 0) ? 1
        : (" " + x._n).indexOf(" " + n) > -1 ? 2
        : x._n.indexOf(n) > -1 ? 3 : -1;
      // Other names (a cup's sponsor name, say) match as well as the name itself, without a result of their own.
      if (s < 0 && x._aka.some(function (a) { return a.indexOf(n) > -1 || (" " + a).indexOf(" " + n) > -1; })) s = 2;
      if (s > -1) out.push({ x: x, s: s });
    });
    function typeRank(x) { return x.past ? 2 : x.type === "league" || x.type === "competition" ? 0 : 1; }
    out.sort(function (a, b) {
      return a.s - b.s || typeRank(a.x) - typeRank(b.x) || (a.x.tier || 9) - (b.x.tier || 9) || itemName(a.x).localeCompare(itemName(b.x));
    });
    return out.slice(0, max || 8).map(function (r) { return r.x; });
  }
  function matchSearch(q) { return searchAll(q, 1)[0] || null; }
  var toastTimer;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function goToItem(x, input) {
    var name = itemName(x);
    if (input) { input.value = name; input.blur(); }
    if (x.type === "league" || x.type === "competition") {
      location.href = BASE + x.path + SUFFIX + (x.hash ? "#" + x.hash : "");
      return;
    }
    setClub(name);
    if (x.path) { location.href = BASE + x.path + SUFFIX; return; }
    if (applyClub(true)) return;
    location.href = BASE + x.country + "/" + SUFFIX + "#club";
  }
  function finder(input) {
    var list = $(input.getAttribute("aria-controls"));
    var results = [], active = -1, closeTimer;
    function close() {
      list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); active = -1;
    }
    function setActive(i) {
      active = i;
      var items = list.querySelectorAll("[role=option]");
      for (var k = 0; k < items.length; k++) {
        var on = k === i;
        items[k].classList.toggle("on", on); items[k].setAttribute("aria-selected", on ? "true" : "false");
        if (on) { input.setAttribute("aria-activedescendant", items[k].id); items[k].scrollIntoView({ block: "nearest" }); }
      }
      if (i < 0) input.removeAttribute("aria-activedescendant");
    }
    function show() {
      var q = input.value;
      if (!q.trim()) { close(); return; }
      results = searchAll(q, 8);
      if (!results.length) {
        list.innerHTML = '<li class="finder-none" role="presentation">No matching club, league or competition in the competitions covered here.</li>';
      } else {
        list.innerHTML = results.map(function (x, i) {
          var kind = x.type === "competition" ? (x.kind || (x.country === "europe" ? "Continental" : "Competition")) : x.type === "league" ? "League" : "Club";
          var meta = x.type === "club"
            ? (x.past ? kind + " · " + x.countryName + " · last seen " + x.past + ", " + x.league : kind + " · " + x.league + " · " + x.countryName)
            : kind + (x.tier ? " · Tier " + x.tier : "") + " · " + x.countryName;
          return '<li role="option" id="' + list.id + "-" + i + '" aria-selected="false" data-i="' + i + '">' +
            FP.flag(x.country) + '<span class="fl-name">' + FP.esc(itemName(x)) + '</span><span class="fl-meta">' + FP.esc(meta) + "</span></li>";
        }).join("");
      }
      list.hidden = false; input.setAttribute("aria-expanded", "true");
      setActive(results.length ? 0 : -1);
    }
    function choose() {
      var q = input.value;
      if (!q.trim()) return;
      loadSearch().then(function () {
        var x = results[active] || matchSearch(q);
        if (x) { close(); goToItem(x, input); }
        else toast("No matching club, league or competition in the competitions covered here.");
      });
    }
    input.addEventListener("focus", function () {
      if (input.value && input.value === myClub) { try { input.select(); } catch (e) {} }
      loadSearch().then(function () { if (input.value && document.activeElement === input && input.value !== myClub) show(); });
    });
    input.addEventListener("input", function () {
      if (input === $("club-find") && !input.value) { setClub(null); applyClub(false); }
      loadSearch().then(show);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (list.hidden) { loadSearch().then(show); return; }
        if (!results.length) return;
        setActive((active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
      } else if (e.key === "Enter") {
        e.preventDefault(); choose();
      } else if (e.key === "Escape") {
        if (!list.hidden) { e.preventDefault(); close(); }
      }
    });
    input.addEventListener("blur", function () { closeTimer = setTimeout(close, 150); });
    list.addEventListener("mousedown", function (e) { e.preventDefault(); clearTimeout(closeTimer); });
    list.addEventListener("click", function (e) {
      var li = e.target.closest && e.target.closest("[role=option]");
      if (!li) return;
      var x = results[Number(li.getAttribute("data-i"))];
      if (x) { close(); goToItem(x, input); }
    });
  }
  finder($("club-find"));
  if ($("hero-find")) {
    finder($("hero-find"));
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) { body.classList.toggle("hero-find-on", es[0].isIntersecting); }).observe($("hero-find-box"));
    }
  }
  $("club-clear").addEventListener("click", function () {
    $("club-find").value = "";
    setClub(null);
    applyClub(false);
    $("club-find").focus();
  });

  /* ---------- Live refresh ----------
     Official tables: data/<country>.json, re-read every 5 minutes.
     Live scores: the live worker's /live.json, read every 30 seconds while a game is on and
     every 5 minutes otherwise. The page is redrawn with FP.applyLive() laid over the official tables. */
  var LIVE_URL = body.getAttribute("data-live") || "";
  var current = {};
  try { current = JSON.parse(body.getAttribute("data-stamps") || "{}"); } catch (e) {}
  var official = {};
  var live = null, liveText = "", liveShown = false, lastTables = 0;
  var seasons = null;
  try { seasons = JSON.parse(body.getAttribute("data-seasons") || "null"); } catch (e) {}
  var MINE = PAGE === "country" || PAGE === "cup" ? [COUNTRY] : PAGE === "europe" || PAGE === "comp" ? ["europe"] : COUNTRIES;
  var STATUSES = {}, EUROPE_SUM = null, compFx = null, compFxLoaded = false;
  try { STATUSES = JSON.parse(body.getAttribute("data-statuses") || "{}"); } catch (e) {}
  if (PAGE === "home" && body.getAttribute("data-europe")) MINE = MINE.concat(["europe"]);
  var CLUBPATHS = null;
  try { CLUBPATHS = JSON.parse(body.getAttribute("data-clubpaths") || "null"); } catch (e) {}
  var CUPSMAP = {};
  try { CUPSMAP = JSON.parse(body.getAttribute("data-cupsmap") || "{}"); } catch (e) {}
  var CUPS = [];
  try { CUPS = JSON.parse(body.getAttribute("data-cups") || "[]"); } catch (e) {}
  var MARKS = null;
  try { MARKS = JSON.parse(body.getAttribute("data-marks") || "null"); } catch (e) {}
  var NAV = null;
  try { NAV = JSON.parse(body.getAttribute("data-nav") || "null"); } catch (e) {}
  var FIXLINKS = {};
  try { FIXLINKS = JSON.parse(body.getAttribute("data-fixtures") || "{}"); } catch (e) {}
  var MOVERS = [];
  try { MOVERS = JSON.parse(body.getAttribute("data-movers") || "[]"); } catch (e) {}
  var OTHERS = [];
  try { OTHERS = JSON.parse(body.getAttribute("data-others") || "[]"); } catch (e) {}
  var initialAnchor = PAGE === "country" && location.hash.length > 1 && location.hash !== "#club" ? location.hash.slice(1) : null;

  function valid(c) {
    return c && Array.isArray(c.leagues) && c.leagues.length && c.leagues.every(function (lg) {
      return lg && lg.id && Array.isArray(lg.zones) && ((lg.rows && lg.rows.length) || (lg.groups && lg.groups.length));
    });
  }
  function getCountry(id) {
    return fetch(BASE + "data/" + id + ".json?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; });
  }
  function redraw(html) {
    var y = window.scrollY;
    var open = {};
    var key = function (d) { return d.id || (d.classList.contains("seasons") ? "seasons" : null); };
    document.querySelectorAll("#main-content details").forEach(function (d) { var k = key(d); if (k) open[k] = d.open; });
    var heroFind = $("hero-find-box");
    var wheel = document.querySelector("#main-content .xp-tabs"), wheelX = wheel ? wheel.scrollLeft : 0;
    var games = document.querySelector("#main-content .strip-list"), gamesX = games ? games.scrollLeft : 0;
    $("main-content").innerHTML = html;
    if (wheel && document.querySelector("#main-content .xp-tabs")) {
      var row2 = document.querySelector("#main-content .xp-tabs");
      loopWheel(row2);
      row2.scrollLeft = wheelX;
      requestAnimationFrame(wheels);
    }
    if (heroFind && $("hero-find-box")) $("hero-find-box").replaceWith(heroFind);
    document.querySelectorAll("#main-content details").forEach(function (d) {
      var k = key(d);
      if (k && k in open) d.open = open[k];
    });
    applyClub(false);
    applyViews();
    var games2 = document.querySelector("#main-content .strip-list");
    if (games2) { games2.scrollLeft = gamesX; requestAnimationFrame(function () { stripArrows(games2); }); }
    requestAnimationFrame(bracketLines);
    if (initialAnchor) {
      var anchor = document.getElementById(initialAnchor);
      if (anchor) {
        initialAnchor = null;
        requestAnimationFrame(function () { anchor.scrollIntoView({ block: "start" }); });
      } else window.scrollTo(0, y);
    } else window.scrollTo(0, y);
  }

  var views = {};
  function sortRows(sec, byForm) {
    sec.classList.toggle("by-form", byForm);
    sec.querySelectorAll(".tview button").forEach(function (b) {
      var on = (b.getAttribute("data-view") === "form") === byForm;
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on);
    });
    sec.querySelectorAll("tbody").forEach(function (tb) {
      var rows = Array.prototype.slice.call(tb.rows);
      rows.sort(function (a, b) {
        var pa = +a.getAttribute("data-pos"), pb = +b.getAttribute("data-pos");
        return byForm ? (+b.getAttribute("data-fp") - +a.getAttribute("data-fp")) || pa - pb : pa - pb;
      });
      rows.forEach(function (r) { tb.appendChild(r); });
    });
  }
  function applyViews() {
    document.querySelectorAll("section.tier").forEach(function (sec) { if (views[sec.id] === "form") sortRows(sec, true); });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest(".tview button");
    if (!b) return;
    var sec = b.closest("section.tier"), byForm = b.getAttribute("data-view") === "form";
    views[sec.id] = byForm ? "form" : "table";
    sortRows(sec, byForm);
  });

  function setBarHeight() {
    var bar = document.querySelector(".bar");
    if (bar) document.documentElement.style.setProperty("--bar-h", bar.offsetHeight + "px");
  }
  setBarHeight();
  window.addEventListener("resize", setBarHeight);

  document.documentElement.classList.add("js");
  var tabState = {};
  function applyTabs() {
    document.querySelectorAll("[data-tabs]").forEach(function (box) {
      var name = box.getAttribute("data-tabs"), want = tabState[name];
      if (!want) return;
      // Only this box's own tabs and panels: a box can hold another (the state row inside Australia's nav).
      var own = function (el) { return el.closest("[data-tabs]") === box; };
      box.querySelectorAll("[data-tab]").forEach(function (b) {
        if (!own(b)) return;
        var on = b.getAttribute("data-tab") === want;
        b.classList.toggle("on", on); b.setAttribute("aria-selected", on);
      });
      box.querySelectorAll("[data-panel]").forEach(function (p) { if (own(p)) p.classList.toggle("on", p.getAttribute("data-panel") === want); });
      box.setAttribute("data-on", want);
      // Rows shown only with some tabs (the state row, for NPL and State 2nd divisions).
      box.querySelectorAll("[data-show-on]").forEach(function (el) {
        if (el.parentNode.closest("[data-tabs]") === box) el.classList.toggle("is-off", el.getAttribute("data-show-on").split(" ").indexOf(want) < 0);
      });
      // Filter tabs ("All", or one state): hide the elements tagged with another key. data-only: shown only for its key.
      if (box.hasAttribute("data-filter")) document.querySelectorAll('[data-filter-by="' + name + '"]').forEach(function (el) {
        var k = el.getAttribute("data-key");
        el.classList.toggle("is-filtered", el.hasAttribute("data-only") ? k !== want : want !== "all" && k !== want);
      });
    });
  }
  // A link to "#npl" etc. on a page whose nav has that tab opens the tab (pyramid bars, links from other pages).
  function goTab(id) {
    var b = id && document.querySelector('[data-hashtabs] [data-tab="' + id.replace(/"/g, "") + '"]');
    if (!b) return false;
    var box = b.closest("[data-tabs]");
    tabState[box.getAttribute("data-tabs")] = id;
    applyTabs();
    return box;
  }

  /* ---------- Knockout bracket connector lines ---------- */
  function bracketLines() {
    document.querySelectorAll(".bracket").forEach(function (br) {
      var old = br.querySelector(".br-lines");
      if (old) old.remove();
      var oldNote = br.previousElementSibling;
      if (oldNote && oldNote.classList && oldNote.classList.contains("br-progress")) oldNote.remove();
      if (!br.offsetWidth || !br.offsetHeight) return;
      var cols = Array.prototype.slice.call(br.children).filter(function (x) { return x.classList && x.classList.contains("br-col"); });
      if (cols.length < 2) return;
      br.style.position = "relative";
      cols.forEach(function (c) { c.style.position = "relative"; c.style.zIndex = "1"; });
      var finalTies = cols[cols.length - 1].querySelectorAll(".tie");
      if (finalTies.length > 1) {
        var h = cols[cols.length - 1].querySelector(".br-h");
        var note = document.createElement("p");
        note.className = "br-progress";
        note.textContent = "Bracket currently shown through " + (h ? h.textContent.trim() : "this round") + ". Later rounds appear here once they are drawn.";
        note.style.margin = "14px 0 -6px";
        note.style.fontSize = "13px";
        note.style.color = "var(--muted)";
        br.parentNode.insertBefore(note, br);
      }
      var rect = br.getBoundingClientRect(), w = br.scrollWidth, hgt = br.scrollHeight;
      var ns = "http://www.w3.org/2000/svg";
      var svg = document.createElementNS(ns, "svg");
      svg.setAttribute("class", "br-lines");
      svg.setAttribute("aria-hidden", "true");
      svg.setAttribute("width", w);
      svg.setAttribute("height", hgt);
      svg.setAttribute("viewBox", "0 0 " + w + " " + hgt);
      svg.style.position = "absolute";
      svg.style.left = "0";
      svg.style.top = "0";
      svg.style.width = w + "px";
      svg.style.height = hgt + "px";
      svg.style.pointerEvents = "none";
      svg.style.zIndex = "0";
      svg.style.overflow = "visible";
      var names = function (tie) { return (tie.getAttribute("data-teams") || "").split("|").filter(Boolean); };
      var hasName = function (tie, name) { return name && names(tie).indexOf(name) > -1; };
      var winnerName = function (tie) {
        var rows = tie.querySelectorAll(".tie-team"), ns2 = names(tie);
        for (var i = 0; i < rows.length; i++) if (rows[i].classList.contains("tie-won")) return ns2[i] || null;
        return null;
      };
      var targetFor = function (tie, i, current, next) {
        var win = winnerName(tie), mine = names(tie), found = [];
        if (win) for (var a = 0; a < next.length; a++) if (hasName(next[a], win)) return next[a];
        for (var b = 0; b < next.length; b++) if (mine.some(function (n) { return hasName(next[b], n); })) found.push(next[b]);
        if (found.length === 1) return found[0];
        if (current.length === next.length * 2) return next[Math.floor(i / 2)] || null;
        return null;
      };
      for (var c = 0; c < cols.length - 1; c++) {
        var current = Array.prototype.slice.call(cols[c].querySelectorAll(".tie"));
        var next = Array.prototype.slice.call(cols[c + 1].querySelectorAll(".tie"));
        current.forEach(function (tie, i) {
          var target = targetFor(tie, i, current, next);
          if (!target) return;
          var a = tie.getBoundingClientRect(), b = target.getBoundingClientRect();
          var x1 = a.right - rect.left + br.scrollLeft;
          var y1 = a.top + a.height / 2 - rect.top + br.scrollTop;
          var x2 = b.left - rect.left + br.scrollLeft;
          var y2 = b.top + b.height / 2 - rect.top + br.scrollTop;
          if (x2 <= x1) return;
          var mid = x1 + (x2 - x1) / 2;
          var p = document.createElementNS(ns, "path");
          p.setAttribute("d", "M " + x1 + " " + y1 + " H " + mid + " V " + y2 + " H " + x2);
          p.setAttribute("fill", "none");
          p.setAttribute("stroke", "var(--rule-strong)");
          p.setAttribute("stroke-width", "1.5");
          p.setAttribute("stroke-linecap", "round");
          p.setAttribute("stroke-linejoin", "round");
          p.setAttribute("vector-effect", "non-scaling-stroke");
          svg.appendChild(p);
        });
      }
      if (svg.childNodes.length) br.insertBefore(svg, br.firstChild);
    });
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (a) {
      var box = goTab(a.getAttribute("href").slice(1));
      if (box) { e.preventDefault(); box.scrollIntoView({ block: "start" }); if (history.replaceState) history.replaceState(null, "", a.getAttribute("href")); }
      return;
    }
    var b = e.target.closest && e.target.closest("[data-tab]");
    if (!b) return;
    var box = b.closest("[data-tabs]");
    tabState[box.getAttribute("data-tabs")] = b.getAttribute("data-tab");
    applyTabs();
    requestAnimationFrame(bracketLines);
    if (box.hasAttribute("data-hashtabs") && history.replaceState) {
      var t = b.getAttribute("data-tab");
      history.replaceState(null, "", location.pathname + location.search + (t === "overview" ? "" : "#" + t));
    }
    if (FX_TABS.indexOf(box.getAttribute("data-tabs")) > -1 && history.replaceState) {
      history.replaceState(null, "", location.pathname + location.search + (b.getAttribute("data-tab") === "fx" ? "#fixtures" : ""));
    }
  });
  window.addEventListener("resize", function () { requestAnimationFrame(bracketLines); });
  requestAnimationFrame(bracketLines);

  /* ---------- Today's games: horizontal strip with explicit controls ---------- */
  function stripArrows(row) {
    if (!row) return;
    var strip = row.closest(".strip"), max = Math.max(0, row.scrollWidth - row.clientWidth);
    if (!strip) return;
    var prev = strip.querySelector(".strip-arrow.prev"), next = strip.querySelector(".strip-arrow.next"), nav = strip.querySelector(".strip-nav");
    if (nav) nav.hidden = max <= 2;
    if (prev) prev.disabled = row.scrollLeft <= 2;
    if (next) next.disabled = row.scrollLeft >= max - 2;
  }
  function stripRows() { document.querySelectorAll(".strip-list").forEach(stripArrows); }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-strip-scroll]");
    if (!a) return;
    var row = a.closest(".strip").querySelector(".strip-list"), card = row.querySelector(".chip");
    var gap = parseFloat(getComputedStyle(row).columnGap || getComputedStyle(row).gap) || 8;
    var step = card ? card.getBoundingClientRect().width + gap : row.clientWidth * 0.75;
    row.scrollBy({ left: Number(a.getAttribute("data-strip-scroll")) * step * 2, behavior: "smooth" });
  });
  document.addEventListener("keydown", function (e) {
    var row = e.target && e.target.classList && e.target.classList.contains("strip-list") ? e.target : null;
    if (!row || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    var card = row.querySelector(".chip"), gap = parseFloat(getComputedStyle(row).columnGap || getComputedStyle(row).gap) || 8;
    var step = card ? card.getBoundingClientRect().width + gap : row.clientWidth * 0.75;
    row.scrollBy({ left: (e.key === "ArrowLeft" ? -1 : 1) * step, behavior: "smooth" });
  });
  document.addEventListener("scroll", function (e) {
    var row = e.target;
    if (row && row.classList && row.classList.contains("strip-list")) stripArrows(row);
  }, true);
  window.addEventListener("resize", stripRows);
  stripRows();

  function wheelArrows(row) {
    var wheel = row.parentNode, max = row.scrollWidth - row.clientWidth;
    var prev = wheel.querySelector(".xp-arrow.prev"), next = wheel.querySelector(".xp-arrow.next");
    var loop = !!row.getAttribute("data-loop");
    if (prev) prev.disabled = !loop && row.scrollLeft <= 2;
    if (next) next.disabled = !loop && row.scrollLeft >= max - 2;
  }
  function loopWheel(row) {
    if (row.getAttribute("data-loop") || row.scrollWidth <= row.clientWidth + 2) return;
    var items = Array.prototype.slice.call(row.children);
    var copy = function () {
      var f = document.createDocumentFragment();
      items.forEach(function (el) {
        var c = el.cloneNode(true);
        c.setAttribute("data-clone", "1"); c.setAttribute("aria-hidden", "true");
        if (c.tagName === "BUTTON") { c.setAttribute("tabindex", "-1"); c.removeAttribute("role"); c.removeAttribute("aria-selected"); }
        f.appendChild(c);
      });
      return f;
    };
    row.insertBefore(copy(), row.firstChild);
    row.appendChild(copy());
    row.setAttribute("data-loop", "1");
    row.scrollLeft += setWidth(row);
  }
  function setWidth(row) {
    var firstCopy = row.firstElementChild, firstReal = row.querySelector(":scope > :not([data-clone])");
    return firstReal && firstCopy ? firstReal.offsetLeft - firstCopy.offsetLeft : 0;
  }
  function recentre(row) {
    var w = setWidth(row);
    if (!w) return;
    if (row.scrollLeft < w * 0.5) row.scrollLeft += w;
    else if (row.scrollLeft > w * 1.5) row.scrollLeft -= w;
  }
  var loopTimers = [];
  function wheels() { document.querySelectorAll(".xp-tabs").forEach(function (row) { loopWheel(row); wheelArrows(row); }); }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-xp-scroll]");
    if (!a) return;
    var row = a.parentNode.querySelector(".xp-tabs");
    row.scrollBy({ left: Number(a.getAttribute("data-xp-scroll")) * row.clientWidth * 0.8, behavior: "smooth" });
  });
  document.addEventListener("scroll", function (e) {
    var row = e.target;
    if (!(row && row.classList && row.classList.contains("xp-tabs"))) return;
    wheelArrows(row);
    if (!row.getAttribute("data-loop")) return;
    var max = row.scrollWidth - row.clientWidth;
    if (row.scrollLeft <= 1 || row.scrollLeft >= max - 1) recentre(row);
    clearTimeout(loopTimers[0]);
    loopTimers[0] = setTimeout(function () { recentre(row); }, 140);
  }, true);
  window.addEventListener("resize", wheels);
  function showChosen() {
    document.querySelectorAll(".xp-tabs").forEach(function (row) {
      loopWheel(row);
      var on = row.querySelector(".xp-tab.on:not([data-clone])");
      if (!on) return;
      var l = on.offsetLeft - row.offsetLeft, r = l + on.offsetWidth;
      if (l < row.scrollLeft || r > row.scrollLeft + row.clientWidth) row.scrollLeft = l - 24;
      wheelArrows(row);
    });
  }
  showChosen();

  var FX_TABS = ["stage", "cup"];
  if (location.hash.length > 1) goTab(location.hash.slice(1));
  if (location.hash === "#fixtures") { FX_TABS.forEach(function (k) { tabState[k] = "fx"; }); applyTabs(); }

  function showRound(nav, i) {
    var panel = nav.parentNode, rounds = panel.querySelectorAll(".fx-round");
    i = Math.max(0, Math.min(i, rounds.length - 1));
    rounds.forEach(function (r) { r.hidden = Number(r.getAttribute("data-round")) !== i; });
    var pick = nav.querySelector("[data-rpick]");
    if (pick) pick.value = String(i);
    nav.querySelector('[data-rstep="-1"]').disabled = i === 0;
    nav.querySelector('[data-rstep="1"]').disabled = i === rounds.length - 1;
    fxState.round = i;
  }
  function shownRound(nav) {
    var on = nav.parentNode.querySelector(".fx-round:not([hidden])");
    return on ? Number(on.getAttribute("data-round")) : 0;
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-rstep]");
    if (!b) return;
    var nav = b.closest(".rnav");
    showRound(nav, shownRound(nav) + Number(b.getAttribute("data-rstep")));
  });
  document.addEventListener("change", function (e) {
    if (!e.target.hasAttribute || !e.target.hasAttribute("data-rpick")) return;
    showRound(e.target.closest(".rnav"), Number(e.target.value));
  });

  function relevant() {
    if (!live || !live.fixtures) return [];
    return PAGE === "home" ? live.fixtures : live.fixtures.filter(function (f) { return MINE.indexOf(f.c) > -1; });
  }
  function render() {
    if (!MINE.every(function (c) { return official[c]; })) return;
    var withLive = MINE.map(function (c) { return FP.applyLive(official[c], live); });
    var html;
    if (PAGE === "country") html = FP.countryMain(withLive[0], { seasons: seasons, fixtures: FIXLINKS, cups: CUPS, marks: MARKS, nav: NAV, racesHref: body.getAttribute("data-races") || "" });
    else if (PAGE === "cup") {
      if (!compFx) return;
      html = FP.cupMain({ name: compFx.name, country: COUNTRY }, compFx, { tz: fxState.tz, live: live, seasons: seasons, fxRound: fxState.round, myClub: myClub,
        fxPaths: CLUBPATHS, root: BASE, suffix: SUFFIX });
    } else if (PAGE === "europe") html = FP.europeMain(withLive[0], { statuses: STATUSES, base: "", suffix: SUFFIX, clubPaths: CLUBPATHS, root: BASE });
    else if (PAGE === "comp") {
      var id = body.getAttribute("data-league");
      var comp = withLive[0].leagues.filter(function (l) { return l.id === id; })[0];
      if (!comp) return;
      html = FP.compMain(comp, compFx, { tz: fxState.tz, live: live, seasons: seasons, fxRound: fxState.round, myClub: myClub,
        clubPaths: CLUBPATHS, root: BASE, suffix: SUFFIX });
    } else {
      var eu = MINE.indexOf("europe") > -1 ? withLive[MINE.indexOf("europe")] : null;
      html = FP.homeMain(withLive.filter(function (c) { return c.country !== "europe"; }), BASE, SUFFIX, OTHERS, { live: live, fixtures: FIXLINKS, europe: eu, cups: CUPSMAP, clubPaths: CLUBPATHS, movers: MOVERS });
    }
    redraw(html);
    applyTabs();
    requestAnimationFrame(bracketLines);
    liveShown = relevant().length > 0;
  }
  function refreshTables() {
    lastTables = Date.now();
    return Promise.all(MINE.map(getCountry)).then(function (list) {
      if (!list.every(valid)) return false;
      var changed = list.some(function (c) { return current[c.country] && current[c.country] !== c.updated; });
      list.forEach(function (c) { official[c.country] = c; current[c.country] = c.updated; });
      return changed;
    });
  }
  function refreshLive() {
    if (!LIVE_URL) return Promise.resolve(false);
    return fetch(LIVE_URL, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.text() : null; })
      .catch(function () { return null; })
      .then(function (text) {
        if (!text || text === liveText) return false;
        try { live = JSON.parse(text); } catch (e) { return false; }
        liveText = text;
        return true;
      });
  }
  function nextDelay() {
    var now = Date.now() / 1000, soon = false, on = false;
    relevant().forEach(function (f) {
      if (FP.isLive(f)) on = true;
      else if (f.st === "NS" && f.ko - now < 15 * 60 && f.ko - now > -3 * 3600) soon = true;
    });
    return on || soon ? 30 * 1000 : 5 * 60 * 1000;
  }
  var timer = null;
  function cycle() {
    clearTimeout(timer);
    if (!window.fetch || !window.FP || ["home", "country", "europe", "comp", "cup"].indexOf(PAGE) < 0) return;
    if (document.hidden) return;
    var needTables = !lastTables || Date.now() - lastTables > REFRESH_MS;
    var needFx = (PAGE === "comp" || PAGE === "cup") && !compFxLoaded;
    var fxLoad = needFx ? fetch(BASE + "data/fixtures/" + (PAGE === "cup" ? COUNTRY : "europe") + "/" + body.getAttribute("data-league") + ".json?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (d) { compFx = d; compFxLoaded = true; return true; }) : Promise.resolve(false);
    Promise.all([needTables ? refreshTables() : Promise.resolve(false), refreshLive(), fxLoad]).then(function (res) {
      var tablesChanged = res[0] || res[2], liveChanged = res[1];
      var anyLive = relevant().some(FP.isLive);
      if (tablesChanged || (liveChanged && (relevant().length || liveShown)) || anyLive) render();
      timer = setTimeout(cycle, nextDelay());
    });
  }

  document.addEventListener("click", function (e) {
    document.querySelectorAll(".nav-more[open]").forEach(function (open) { if (!open.contains(e.target)) open.open = false; });
  });
  document.addEventListener("keydown", function (e) {
    var open = document.querySelector(".nav-more[open]");
    if (open && e.key === "Escape") { open.open = false; open.querySelector("summary").focus(); }
  });

  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest(".copy");
    if (!btn) return;
    var text = btn.getAttribute("data-copy");
    var done = function () { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy address"; }, 2000); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { toast(text); });
    else toast(text);
  });

  var ps = $("privacy-settings");
  if (ps) {
    window.googlefc = window.googlefc || {};
    window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
    window.googlefc.callbackQueue.push({ CONSENT_DATA_READY: function () { ps.hidden = false; } });
    ps.addEventListener("click", function () {
      if (window.googlefc && window.googlefc.showRevocationMessage) window.googlefc.callbackQueue.push(window.googlefc.showRevocationMessage);
    });
  }

  var TZ_KEY = "pyramid:tz";
  var fxData = null, fxLinks = null, fxState = { tz: "local", group: 0, round: null };
  try { var savedTz = localStorage.getItem(TZ_KEY); if (savedTz === "venue" || savedTz === "uk") fxState.tz = "venue"; } catch (e) {}
  function fxRender() {
    if (!fxData) return;
    var y = window.scrollY;
    $("main-content").innerHTML = FP.fixturesMain(fxData, {
      tz: fxState.tz, group: fxState.group, round: fxState.round, live: live, myClub: myClub,
      tableHref: body.getAttribute("data-table") || "",
      tableText: COUNTRY === "europe" && fxData ? fxData.name + (fxData.year ? " " + fxData.season : " table and bracket") : null,
      links: fxLinks
    });
    window.scrollTo(0, y);
  }
  function fxRound() { var el = document.querySelector(".fx-round"); return el ? Number(el.getAttribute("data-round")) : 0; }
  function fxStart() {
    var league = body.getAttribute("data-league");
    var file = body.getAttribute("data-fxfile") || "data/fixtures/" + COUNTRY + "/" + league + ".json";
    fetch(BASE + file + "?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (d) {
        if (!d || !d.groups) return;
        fxData = d;
        var paths = {};
        d.groups.forEach(function (g) { (g.rounds || []).forEach(function (r) { (r.fixtures || []).forEach(function (f) {
          [f.h, f.a].forEach(function (t) {
            if (!t || !t.n) return;
            var s = FP.slug(t.n), p = COUNTRY + "/club/" + s + "/";
            if (t.id) paths[t.id] = p;
            paths["n:" + s] = p;
          });
        }); }); });
        fxLinks = COUNTRY === "europe" ? null : { paths: paths, root: BASE, suffix: SUFFIX };
        fxRender();
        fxLive();
      });
    document.addEventListener("click", function (e) {
      var t = e.target.closest && e.target.closest("[data-step], [data-group]");
      if (!t || !fxData) return;
      if (t.hasAttribute("data-step")) fxState.round = fxRound() + Number(t.getAttribute("data-step"));
      else { fxState.group = Number(t.getAttribute("data-group")); fxState.round = null; }
      fxRender();
    });
    document.addEventListener("change", function (e) {
      if (e.target.id !== "round-pick" || !fxData) return;
      fxState.round = Number(e.target.value);
      fxRender();
    });
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest(".tz-toggle");
    if (!t) return;
    fxState.tz = t.getAttribute("data-tz");
    try { localStorage.setItem(TZ_KEY, fxState.tz); } catch (err) {}
    if (PAGE === "fixtures") fxRender(); else if (PAGE === "club") clubRender(); else if (PAGE === "comp" || PAGE === "cup") render();
  });
  var fxTimer = null;
  function fxLive() {
    clearTimeout(fxTimer);
    if (document.hidden) return;
    refreshLive().then(function (changed) {
      var anyLive = relevant().some(FP.isLive);
      if (changed || anyLive) fxRender();
      fxTimer = setTimeout(fxLive, nextDelay());
    });
  }

  document.addEventListener("click", function (e) {
    var dot = e.target.closest ? e.target.closest(".ld, .fchip") : null;
    var open = document.querySelectorAll(".ld.open, .fchip.open");
    for (var i = 0; i < open.length; i++) if (open[i] !== dot) open[i].classList.remove("open");
    if (!dot) return;
    var canHover = window.matchMedia && window.matchMedia("(hover: hover)").matches;
    if (dot.classList.contains("fchip")) { if (!canHover) dot.classList.toggle("open"); return; }
    if (!canHover && !dot.classList.contains("open")) { e.preventDefault(); dot.classList.add("open"); }
  });
  function fitTip(host) {
    var tip = host && host.querySelector(".ltip");
    if (!tip) return;
    tip.style.translate = "";
    requestAnimationFrame(function () {
      var r = tip.getBoundingClientRect(), pad = 12, vw = document.documentElement.clientWidth;
      if (!r.width) return;
      var shift = r.left < pad ? pad - r.left : r.right > vw - pad ? vw - pad - r.right : 0;
      if (shift) tip.style.translate = Math.round(shift) + "px 0";
    });
  }
  ["mouseover", "focusin", "click"].forEach(function (type) {
    document.addEventListener(type, function (e) { fitTip(e.target.closest ? e.target.closest(".ld, .fchip") : null); });
  });
  function clubRender() { if (window.FP) FP.retime($("main-content"), fxState.tz, COUNTRY); }
  var CLUB_DONE = ["FT", "AET", "PEN"], clubTimer = null;
  function clubLive() {
    clearTimeout(clubTimer);
    if (!LIVE_URL || !window.fetch || !window.FP || document.hidden) return;
    refreshLive().then(function () {
      var byId = {}, on = false, soon = false, nowS = Date.now() / 1000;
      ((live && live.fixtures) || []).forEach(function (f) { byId[f.id] = f; });
      document.querySelectorAll("#main-content [data-fid]").forEach(function (el) {
        var f = byId[el.getAttribute("data-fid")];
        if (!f) return;
        var isOn = FP.isLive(f), done = CLUB_DONE.indexOf(f.st) > -1;
        if (isOn) on = true;
        else if (f.st === "NS" && f.ko - nowS < 15 * 60 && f.ko - nowS > -3 * 3600) soon = true;
        if (f.h.g == null || f.a.g == null || (!isOn && !done)) return;
        var clk = FP.clock(f, Date.now());
        if (el.classList.contains("next-match")) {
          el.classList.toggle("on", isOn);
          var b = el.querySelector(".nm-teams b"), w = el.querySelector(".nm-when"), h = el.querySelector(".nm-h");
          if (b) b.textContent = f.h.g + "–" + f.a.g;
          if (w) w.textContent = clk;
          if (h) h.textContent = (isOn ? "Live now" : "Full time") + " · " + el.getAttribute("data-comp");
        } else {
          var home = el.getAttribute("data-home") === "1", me = home ? f.h.g : f.a.g, them = home ? f.a.g : f.h.g;
          var right = el.lastElementChild;
          if (right) right.outerHTML = '<span class="lv' + (isOn ? " on" : "") + '">' + FP.esc(clk) + " " + me + "–" + them + "</span>";
        }
      });
      clubTimer = setTimeout(clubLive, on || soon ? 30 * 1000 : 5 * 60 * 1000);
    });
  }

  if ("serviceWorker" in navigator && !body.getAttribute("data-index") &&
      (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }

  var arrivedForClub = location.hash === "#club";
  if (arrivedForClub && history.replaceState) history.replaceState(null, "", location.pathname + location.search);
  applyClub(arrivedForClub);
  if (PAGE === "club") {
    clubRender();
    clubLive();
    document.addEventListener("visibilitychange", function () { if (!document.hidden) clubLive(); });
  } else if (PAGE === "fixtures" && window.fetch && window.FP) {
    fxStart();
    document.addEventListener("visibilitychange", function () { if (!document.hidden && fxData) fxLive(); });
  } else {
    cycle();
    document.addEventListener("visibilitychange", function () { if (!document.hidden) cycle(); });
  }
})();
