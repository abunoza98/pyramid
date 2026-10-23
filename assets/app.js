/* Football Pyramids: browser behaviour. Club finder, remembered club, and live refresh of the tables. */
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

  /* ---------- Club finder (searches every country, current and past clubs) ----------
     A combobox: type, pick from the list with the mouse or the arrow keys, Enter opens the club's page.
     Matching ignores accents, case and punctuation, so "koln" finds "1. FC Köln". Used by the header box on every
     page and the big box on the home page. */
  var clubs = null;   // [{team, country, countryName, league, tier, past?, path?, _n}]
  var clubsLoading = null;
  function norm(s) {
    var t = String(s || "").toLowerCase();
    try { t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
    return t.replace(/ø/g, "o").replace(/ł/g, "l").replace(/ß/g, "ss").replace(/ı/g, "i").replace(/&/g, " and ")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }
  function loadClubs() {
    if (clubs) return Promise.resolve(clubs);
    if (clubsLoading) return clubsLoading;
    clubsLoading = fetch(BASE + "data/clubs.json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; })
      .then(function (list) {
        list.forEach(function (c) { c._n = norm(c.team); });
        clubs = list;
        return list;
      });
    return clubsLoading;
  }
  // Best matches first: exact name, then names starting with the text, then a word starting with it, then anywhere.
  // Clubs in this season's tables come before clubs only seen in past seasons, and higher tiers before lower.
  function searchClubs(q, max) {
    if (!clubs) return [];
    var raw = q.trim().toLowerCase();
    var n = norm(ALIASES[raw] || raw);
    if (!n) return [];
    var out = [];
    clubs.forEach(function (c) {
      var s = c._n === n ? 0 : c._n.indexOf(n) === 0 ? 1 : (" " + c._n).indexOf(" " + n) > -1 ? 2 : c._n.indexOf(n) > -1 ? 3 : -1;
      if (s > -1) out.push({ c: c, s: s });
    });
    out.sort(function (a, b) {
      return a.s - b.s || (a.c.past ? 1 : 0) - (b.c.past ? 1 : 0) || (a.c.tier || 9) - (b.c.tier || 9) || a.c.team.localeCompare(b.c.team);
    });
    return out.slice(0, max || 8).map(function (x) { return x.c; });
  }
  function matchClub(q) { return searchClubs(q, 1)[0] || null; }
  var toastTimer;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function goToClub(c, input) {
    setClub(c.team);
    if (input) { input.value = c.team; input.blur(); }
    // Open the club's page (it stays highlighted in every table from now on).
    if (c.path) { location.href = BASE + c.path + SUFFIX; return; }
    // No club page: show it in its table instead.
    if (applyClub(true)) return;
    location.href = BASE + c.country + "/" + SUFFIX + "#club";
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
      results = searchClubs(q, 8);
      if (!results.length) {
        list.innerHTML = '<li class="finder-none" role="presentation">No club called “' + FP.esc(q.trim()) + "” in these leagues yet.</li>";
      } else {
        list.innerHTML = results.map(function (c, i) {
          var meta = c.past ? c.countryName + " · last seen " + c.past + ", " + c.league : c.league + " · " + c.countryName;
          return '<li role="option" id="' + list.id + "-" + i + '" aria-selected="false" data-i="' + i + '">' +
            FP.flag(c.country) + '<span class="fl-name">' + FP.esc(c.team) + '</span><span class="fl-meta">' + FP.esc(meta) + "</span></li>";
        }).join("");
      }
      list.hidden = false; input.setAttribute("aria-expanded", "true");
      setActive(results.length ? 0 : -1);
    }
    function choose() {
      var q = input.value;
      if (!q.trim()) return;
      loadClubs().then(function () {
        var c = results[active] || matchClub(q);
        if (c) { close(); goToClub(c, input); }
        else toast("No club called “" + q.trim() + "” in these leagues yet.");
      });
    }
    input.addEventListener("focus", function () {
      // The header box shows the remembered club; select it so typing starts a new search.
      if (input.value && input.value === myClub) { try { input.select(); } catch (e) {} }
      loadClubs().then(function () { if (input.value && document.activeElement === input && input.value !== myClub) show(); });
    });
    input.addEventListener("input", function () {
      if (input === $("club-find") && !input.value) { setClub(null); applyClub(false); }
      loadClubs().then(show);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (list.hidden) { loadClubs().then(show); return; }
        if (!results.length) return;
        setActive((active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
      } else if (e.key === "Enter") {
        e.preventDefault(); choose();
      } else if (e.key === "Escape") {
        if (!list.hidden) { e.preventDefault(); close(); }
      }
    });
    input.addEventListener("blur", function () { closeTimer = setTimeout(close, 150); });
    // mousedown keeps the focus in the box, so the list doesn't close before the click lands.
    list.addEventListener("mousedown", function (e) { e.preventDefault(); clearTimeout(closeTimer); });
    list.addEventListener("click", function (e) {
      var li = e.target.closest && e.target.closest("[role=option]");
      if (!li) return;
      var c = results[Number(li.getAttribute("data-i"))];
      if (c) { close(); goToClub(c, input); }
    });
  }
  finder($("club-find"));
  if ($("hero-find")) finder($("hero-find"));
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
  var OTHERS = [];   // the home page's "More pyramids" cards
  try { OTHERS = JSON.parse(body.getAttribute("data-others") || "[]"); } catch (e) {}

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
    $("main-content").innerHTML = html;
    if (heroFind && $("hero-find-box")) $("hero-find-box").replaceWith(heroFind);
    document.querySelectorAll("#main-content details").forEach(function (d) {
      var k = key(d);
      if (k && k in open) d.open = open[k];
    });
    applyClub(false);
    applyViews();
    window.scrollTo(0, y);
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
    if (PAGE === "country") html = FP.countryMain(withLive[0], { seasons: seasons, fixtures: FIXLINKS, cups: CUPS });
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
      html = FP.homeMain(withLive.filter(function (c) { return c.country !== "europe"; }), BASE, SUFFIX, OTHERS, { live: live, fixtures: FIXLINKS, europe: eu, cups: CUPSMAP, clubPaths: CLUBPATHS });
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
  } else if (PAGE === "fixtures" && window.fetch && window.FP) {
    fxStart();
    document.addEventListener("visibilitychange", function () { if (!document.hidden && fxData) fxLive(); });
  } else {
    cycle();
    document.addEventListener("visibilitychange", function () { if (!document.hidden) cycle(); });
  }
})();
