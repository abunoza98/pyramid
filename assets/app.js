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

  /* ---------- Club finder (searches every country) ---------- */
  var clubs = null;   // [{team, country, countryName, league}]
  var clubsLoading = null;
  function loadClubs() {
    if (clubs) return Promise.resolve(clubs);
    if (clubsLoading) return clubsLoading;
    clubsLoading = fetch(BASE + "data/clubs.json", { cache: "no-cache" })
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; })
      .then(function (list) {
        clubs = list;
        $("club-list").innerHTML = list.map(function (c) {
          return '<option value="' + c.team.replace(/"/g, "&quot;") + '">' + c.league + ", " + c.countryName + "</option>";
        }).join("");
        return list;
      });
    return clubsLoading;
  }
  function matchClub(q) {
    q = q.trim().toLowerCase();
    if (!q || !clubs) return null;
    if (ALIASES[q]) q = ALIASES[q].toLowerCase();
    var exact = clubs.filter(function (c) { return c.team.toLowerCase() === q; })[0];
    if (exact) return exact;
    var starts = clubs.filter(function (c) { return c.team.toLowerCase().indexOf(q) === 0; });
    var has = clubs.filter(function (c) { return c.team.toLowerCase().indexOf(q) > -1; });
    return has.length === 1 ? has[0] : (starts[0] || has[0] || null);
  }
  var toastTimer;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 3200);
  }
  function goToClub(c) {
    setClub(c.team);
    $("club-find").value = c.team;
    $("club-find").blur();
    // Open the club's page (it stays highlighted in every table from now on).
    if (c.path) { location.href = BASE + c.path + SUFFIX; return; }
    // No club page: show it in its table instead.
    if (applyClub(true)) return;
    location.href = BASE + c.country + "/" + SUFFIX + "#club";
  }
  function submitFind() {
    var q = $("club-find").value;
    if (!q.trim()) return;
    loadClubs().then(function () {
      var m = matchClub(q);
      if (m) goToClub(m);
      else toast("No club called “" + q.trim() + "” in these leagues yet.");
    });
  }
  $("club-find").addEventListener("focus", loadClubs, { once: true });
  $("club-find").addEventListener("change", submitFind);
  $("club-find").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submitFind(); } });
  $("club-find").addEventListener("input", function () {
    var v = this.value;
    if (!v) { setClub(null); applyClub(false); return; }
    if (clubs) {
      var exact = clubs.filter(function (c) { return c.team === v; })[0];
      if (exact) goToClub(exact);
    }
  });
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
    $("main-content").innerHTML = html;
    document.querySelectorAll("#main-content details").forEach(function (d) {
      var k = key(d);
      if (k && k in open) d.open = open[k];
    });
    applyClub(false);
    window.scrollTo(0, y);
  }
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
      html = FP.cupMain({ name: compFx.name, country: COUNTRY }, compFx, { tz: fxState.tz, live: live, fixturesHref: body.getAttribute("data-fx") || "" });
    }
    else if (PAGE === "europe") html = FP.europeMain(withLive[0], { statuses: STATUSES, base: "", suffix: SUFFIX });
    else if (PAGE === "comp") {
      var id = body.getAttribute("data-league");
      var comp = withLive[0].leagues.filter(function (l) { return l.id === id; })[0];
      if (!comp) return;
      html = FP.compMain(comp, compFx, { tz: fxState.tz, live: live, fixturesHref: body.getAttribute("data-fx") || "", seasons: seasons,
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
    var open = document.querySelector(".nav-more[open]");
    if (open && !open.contains(e.target)) open.open = false;
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
  // Pyramid chart dots: on touch screens the first tap shows the label, a second tap opens the table.
  document.addEventListener("click", function (e) {
    var dot = e.target.closest ? e.target.closest(".ld") : null;
    var open = document.querySelectorAll(".ld.open");
    for (var i = 0; i < open.length; i++) if (open[i] !== dot) open[i].classList.remove("open");
    if (!dot) return;
    var canHover = window.matchMedia && window.matchMedia("(hover: hover)").matches;
    if (!canHover && !dot.classList.contains("open")) { e.preventDefault(); dot.classList.add("open"); }
  });
  function clubRender() { if (window.FP) FP.retime($("main-content"), fxState.tz, COUNTRY); }

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
