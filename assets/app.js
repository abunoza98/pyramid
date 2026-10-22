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
    if (applyClub(true)) return;
    // Not on this page: open the club's country page, which scrolls to it.
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

  /* ---------- Live refresh ---------- */
  var current = {};   // country -> updated stamp on screen
  try { current = JSON.parse(body.getAttribute("data-stamps") || "{}"); } catch (e) {}
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
    var open = document.querySelector("details.seasons[open]");
    $("main-content").innerHTML = html;
    if (open) { var d = document.querySelector("details.seasons"); if (d) d.open = true; }
    applyClub(false);
    window.scrollTo(0, y);
  }
  function refresh() {
    if (!window.fetch || !window.FP || (PAGE !== "home" && PAGE !== "country")) return;
    if (PAGE === "country") {
      getCountry(COUNTRY).then(function (c) {
        if (!valid(c)) return;
        var seasons = null;
        try { seasons = JSON.parse(body.getAttribute("data-seasons") || "null"); } catch (e) {}
        if (current[COUNTRY] && current[COUNTRY] !== c.updated) redraw(FP.countryMain(c, { seasons: seasons }));
        current[COUNTRY] = c.updated;
      });
    } else {
      Promise.all(COUNTRIES.map(getCountry)).then(function (list) {
        if (!list.every(valid)) return;
        var changed = list.some(function (c) { return current[c.country] && current[c.country] !== c.updated; });
        if (changed) redraw(FP.homeMain(list, BASE, SUFFIX));
        list.forEach(function (c) { current[c.country] = c.updated; });
      });
    }
  }

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

  /* ---------- Start ---------- */
  var arrivedForClub = location.hash === "#club";
  if (arrivedForClub && history.replaceState) history.replaceState(null, "", location.pathname + location.search);
  applyClub(arrivedForClub);
  refresh();
  setInterval(function () { if (!document.hidden) refresh(); }, REFRESH_MS);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) refresh(); });
})();
