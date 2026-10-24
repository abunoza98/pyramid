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
        list.forEach(function (x) { x._n = norm(itemName(x)); x._short = norm(x.short || ""); });
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
        list.innerHTML = '<li class="finder-none" role="presentation">No matching club or league in the competitions covered here.</li>';
      } else {
        list.innerHTML = results.map(function (x, i) {
          var kind = x.type === "competition" ? "Competition" : x.type === "league" ? "League" : "Club";
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
        else toast("No matching club or league in the competitions covered here.");
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
  var current = {};   // country -> updated stamp on screen
  try { current = JSON.parse(body.getAttribute("data-stamps") || "{}"); } catch (e) {}
  var official = {};  // country -> official data
  var live = null, liveText = "", liveShown = false, lastTables = 0;
  var seasons = null;
  try { seasons = JSON.parse(body.getAttribute("data-seasons") || "null"); } catch (e) {}
  var MINE = PAGE === "country" || PAGE === "cup" ? [COUNTRY] : PAGE === "europe" || PAGE === "comp" ? ["europe"] : COUNTRIES;
  var STATUSES = {}, EUROPE_SUM = null, compFx = null, compFxLoaded = false;
  try { STATUSES = JSON.parse(body.getAttribute("data-statuses") || "{}"); } catch (e) {}
  // The home page shows the Champions League table too, so it also loads data/europe.json.
  if (PAGE === "home" && body.getAttribute("data-europe")) MINE = MINE.concat(["europe"]);
  // The home page's strip shows every country's games, not just the featured ones.
  var CLUBPATHS = null;   // club pages by club ID, for tables that mix countries (Europe)
  try { CLUBPATHS = JSON.parse(body.getAttribute("data-clubpaths") || "null"); } catch (e) {}
  var CUPSMAP = {};   // the home page's cup chips, by country
  try { CUPSMAP = JSON.parse(body.getAttribute("data-cupsmap") || "{}"); } catch (e) {}
  var CUPS = [];   // a country page's cup cards
  try { CUPS = JSON.parse(body.getAttribute("data-cups") || "[]"); } catch (e) {}
  var FIXLINKS = {};   // links from each table to its fixtures page
  try { FIXLINKS = JSON.parse(body.getAttribute("data-fixtures") || "{}"); } catch (e) {}
  var MOVERS = [];   // the home page's "Up and down this season" lines
  try { MOVERS = JSON.parse(body.getAttribute("data-movers") || "[]"); } catch (e) {}
  var OTHERS = [];   // the home page's "More pyramids" cards
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
    // Keep open/closed sections as the visitor left them (only those with an id, plus the seasons list).
    var key = function (d) { return d.id || (d.classList.contains("seasons") ? "seasons" : null); };
    document.querySelectorAll("#main-content details").forEach(function (d) { var k = key(d); if (k) open[k] = d.open; });
    // The home page's club search is moved across rather than redrawn, so typing (and focus) survives a live update.
    var heroFind = $("hero-find-box");
    // Sideways rows keep their scroll position through live redraws.
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
    if (initialAnchor) {
      var anchor = document.getElementById(initialAnchor);
      if (anchor) {
        initialAnchor = null;
        requestAnimationFrame(function () { anchor.scrollIntoView({ block: "start" }); });
      } else window.scrollTo(0, y);
    } else window.scrollTo(0, y);
  }
  /* ---------- Table / Form switch: re-sort a division by points from the last five games ---------- */
  var views = {};   // division id -> "form", kept when the page redraws
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

  // Column headings stick below the header bar, whose height changes with screen width.
  function setBarHeight() {
    var bar = document.querySelector(".bar");
    if (bar) document.documentElement.style.setProperty("--bar-h", bar.offsetHeight + "px");
  }
  setBarHeight();
  window.addEventListener("resize", setBarHeight);

  /* ---------- Tabs on the home page (pyramid explorer, top-flight tables) ---------- */
  document.documentElement.classList.add("js");
  var tabState = {};   // tab group -> chosen tab, kept when the page redraws
  function applyTabs() {
    document.querySelectorAll("[data-tabs]").forEach(function (box) {
      var want = tabState[box.getAttribute("data-tabs")];
      if (!want) return;
      box.querySelectorAll("[data-tab]").forEach(function (b) {
        var on = b.getAttribute("data-tab") === want;
        b.classList.toggle("on", on); b.setAttribute("aria-selected", on);
      });
      box.querySelectorAll("[data-panel]").forEach(function (p) { p.classList.toggle("on", p.getAttribute("data-panel") === want); });
    });
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-tab]");
    if (!b) return;
    var box = b.closest("[data-tabs]");
    tabState[box.getAttribute("data-tabs")] = b.getAttribute("data-tab");
    applyTabs();
    // Competition and cup pages: the address ends in #fixtures while that tab is open, so it can be shared.
    if (FX_TABS.indexOf(box.getAttribute("data-tabs")) > -1 && history.replaceState) {
      history.replaceState(null, "", location.pathname + location.search + (b.getAttribute("data-tab") === "fx" ? "#fixtures" : ""));
    }
  });
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

  /* ---------- The home page's country picker: a sideways-scrolling row with arrows for mouse users ---------- */
  function wheelArrows(row) {
    var wheel = row.parentNode, max = row.scrollWidth - row.clientWidth;
    var prev = wheel.querySelector(".xp-arrow.prev"), next = wheel.querySelector(".xp-arrow.next");
    var loop = !!row.getAttribute("data-loop");   // a looping row never runs out in either direction
    if (prev) prev.disabled = !loop && row.scrollLeft <= 2;
    if (next) next.disabled = !loop && row.scrollLeft >= max - 2;
  }
  /* Endless scrolling: when the row is wider than the screen, a copy of the countries goes either side of the real
     ones, and whenever the view drifts into a copy it's moved back by exactly one set, which looks the same. The
     copies are hidden from screen readers and the keyboard; clicking one picks that country as usual. */
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
  // Scroll events don't bubble, so listen in the capture phase.
  document.addEventListener("scroll", function (e) {
    var row = e.target;
    if (!(row && row.classList && row.classList.contains("xp-tabs"))) return;
    wheelArrows(row);
    if (!row.getAttribute("data-loop")) return;
    // Move back into the real set once scrolling settles (moving it mid-swipe or mid-animation would jolt), or straight
    // away at the very ends, where the browser would otherwise stop.
    var max = row.scrollWidth - row.clientWidth;
    if (row.scrollLeft <= 1 || row.scrollLeft >= max - 1) recentre(row);
    clearTimeout(loopTimers[0]);
    loopTimers[0] = setTimeout(function () { recentre(row); }, 140);
  }, true);
  window.addEventListener("resize", wheels);
  // On first load, bring the chosen country into view.
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


  // Arriving at /<competition>/#fixtures (old fixtures pages redirect here) opens that tab.
  var FX_TABS = ["stage", "cup"];
  if (location.hash === "#fixtures") { FX_TABS.forEach(function (k) { tabState[k] = "fx"; }); applyTabs(); }

  /* ---------- Fixtures and results tab (competition and cup pages) ----------
     Every round is on the page; the picker shows one. The choice survives live redraws. */
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
    if (PAGE === "country") html = FP.countryMain(withLive[0], { seasons: seasons, fixtures: FIXLINKS, cups: CUPS, racesHref: body.getAttribute("data-races") || "" });
    else if (PAGE === "cup") {
      if (!compFx) return;
      html = FP.cupMain({ name: compFx.name, country: COUNTRY }, compFx, { tz: fxState.tz, live: live, seasons: seasons, fxRound: fxState.round, myClub: myClub,
        fxPaths: CLUBPATHS, root: BASE, suffix: SUFFIX });
    }
    else if (PAGE === "europe") html = FP.europeMain(withLive[0], { statuses: STATUSES, base: "", suffix: SUFFIX, clubPaths: CLUBPATHS, root: BASE });
    else if (PAGE === "comp") {
      var id = body.getAttribute("data-league");
      var comp = withLive[0].leagues.filter(function (l) { return l.id === id; })[0];
      if (!comp) return;
      html = FP.compMain(comp, compFx, { tz: fxState.tz, live: live, seasons: seasons, fxRound: fxState.round, myClub: myClub,
        clubPaths: CLUBPATHS, root: BASE, suffix: SUFFIX });
    }
    else {
      var eu = MINE.indexOf("europe") > -1 ? withLive[MINE.indexOf("europe")] : null;
      html = FP.homeMain(withLive.filter(function (c) { return c.country !== "europe"; }), BASE, SUFFIX, OTHERS, { live: live, fixtures: FIXLINKS, europe: eu, cups: CUPSMAP, clubPaths: CLUBPATHS, movers: MOVERS });
    }
    redraw(html);
    applyTabs();
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
  // How long until the next look at live scores.
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
    // A competition page also needs its fixtures (for the bracket and qualifying ties), once.
    var needFx = (PAGE === "comp" || PAGE === "cup") && !compFxLoaded;
    var fxLoad = needFx ? fetch(BASE + "data/fixtures/" + (PAGE === "cup" ? COUNTRY : "europe") + "/" + body.getAttribute("data-league") + ".json?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (d) { compFx = d; compFxLoaded = true; return true; }) : Promise.resolve(false);
    Promise.all([needTables ? refreshTables() : Promise.resolve(false), refreshLive(), fxLoad]).then(function (res) {
      var tablesChanged = res[0] || res[2], liveChanged = res[1];
      var anyLive = relevant().some(FP.isLive);
      // Redraw when the tables or scores change, every cycle while a game is on (the clock moves),
      // and once more when the last game drops off so the page goes back to the official tables.
      if (tablesChanged || (liveChanged && (relevant().length || liveShown)) || anyLive) render();
      timer = setTimeout(cycle, nextDelay());
    });
  }

  /* ---------- "More" countries menu: close it when tapping elsewhere ---------- */
  document.addEventListener("click", function (e) {
    document.querySelectorAll(".nav-more[open]").forEach(function (open) { if (!open.contains(e.target)) open.open = false; });
  });
  document.addEventListener("keydown", function (e) {
    var open = document.querySelector(".nav-more[open]");
    if (open && e.key === "Escape") { open.open = false; open.querySelector("summary").focus(); }
  });

  /* ---------- Copy buttons (contact email) ---------- */
  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest(".copy");
    if (!btn) return;
    var text = btn.getAttribute("data-copy");
    var done = function () { btn.textContent = "Copied"; setTimeout(function () { btn.textContent = "Copy address"; }, 2000); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { toast(text); });
    else toast(text);
  });

  /* ---------- Privacy and cookie settings ----------
     Appears once Google's consent tool (AdSense Privacy & messaging) is on the page. */
  var ps = $("privacy-settings");
  if (ps) {
    window.googlefc = window.googlefc || {};
    window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
    window.googlefc.callbackQueue.push({ CONSENT_DATA_READY: function () { ps.hidden = false; } });
    ps.addEventListener("click", function () {
      if (window.googlefc && window.googlefc.showRevocationMessage) window.googlefc.callbackQueue.push(window.googlefc.showRevocationMessage);
    });
  }

  /* ---------- Fixtures pages ----------
     The page arrives showing the current round in UK time. Here it switches to the visitor's time zone,
     lets them move between rounds and groups, and lays today's live scores over the list. */
  var TZ_KEY = "pyramid:tz";

  var fxData = null, fxState = { tz: "local", group: 0, round: null };
  try { var savedTz = localStorage.getItem(TZ_KEY); if (savedTz === "venue" || savedTz === "uk") fxState.tz = "venue"; } catch (e) {}
  function fxRender() {
    if (!fxData) return;
    var y = window.scrollY;
    $("main-content").innerHTML = FP.fixturesMain(fxData, {
      tz: fxState.tz, group: fxState.group, round: fxState.round, live: live, myClub: myClub,
      tableHref: body.getAttribute("data-table") || "",
      tableText: COUNTRY === "europe" && fxData ? fxData.name + (fxData.year ? " " + fxData.season : " table and bracket") : null
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
  // Your time / local kick-off time switch (fixtures and competition pages). The choice is remembered.
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

  /* ---------- Club pages ----------
     Rendered by the build; here the dates and times switch to the visitor's time zone. */
  // Pyramid chart dots and form chips: on touch screens the first tap shows the label, a second tap opens the table.
  document.addEventListener("click", function (e) {
    var dot = e.target.closest ? e.target.closest(".ld, .fchip") : null;
    var open = document.querySelectorAll(".ld.open, .fchip.open");
    for (var i = 0; i < open.length; i++) if (open[i] !== dot) open[i].classList.remove("open");
    if (!dot) return;
    var canHover = window.matchMedia && window.matchMedia("(hover: hover)").matches;
    // Form chips: hover only with a mouse; on touch screens a tap shows the label until something else is tapped.
    if (dot.classList.contains("fchip")) { if (!canHover) dot.classList.toggle("open"); return; }
    if (!canHover && !dot.classList.contains("open")) { e.preventDefault(); dot.classList.add("open"); }
  });
  // Keep a label on screen. Its side (left, centred, right) is set by where its chip or dot usually sits, but on a
  // phone the form chips can wrap onto a new line, so measure once it shows and nudge it back inside the screen.
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
  /* Live scores on club pages. The page is built from the fixture files (checked every two hours), so a game in
     progress shows whatever score it had then. Here the live worker's scores are laid over the next-match card and
     the fixture rows, matched by fixture ID, every 30 seconds while one of this club's games is on. */
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

  /* ---------- Installable app ----------
     Registers sw.js so phones can add the site to the home screen and open it offline. Only on the live site
     (https, or localhost when testing), not in the offline preview build. To switch it off for everyone, replace
     this register() call with: navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); }); */
  if ("serviceWorker" in navigator && !body.getAttribute("data-index") &&
      (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }

  /* ---------- Start ---------- */
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
