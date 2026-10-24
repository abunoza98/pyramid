from pathlib import Path

# Generalise the browser finder without touching the remembered-club behaviour.
p = Path('assets/app.js')
s = p.read_text()
s = s.replace('/* Football Pyramids: browser behaviour. Club finder, remembered club, and live refresh of the tables. */',
              '/* Football Pyramids: browser behaviour. Club and league search, remembered club, and live refresh of the tables. */')
start = s.index('  /* ---------- Club finder')
end = s.index('  /* ---------- Live refresh ----------', start)
block = r'''  /* ---------- Club and league search ----------
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
'''
s = s[:start] + block + '\n\n' + s[end:]
p.write_text(s)

# Make future builds emit unified search copy and data.
p = Path('scripts/build.mjs')
s = p.read_text()
s = s.replace('Output: index.html, <country>/index.html, data/clubs.json, sitemap.xml, robots.txt',
              'Output: index.html, <country>/index.html, data/clubs.json, data/search.json, sitemap.xml, robots.txt')
s = s.replace('<label class="sr-only" for="club-find">Find a club</label>', '<label class="sr-only" for="club-find">Search clubs or leagues</label>')
s = s.replace('placeholder="Find a club" autocomplete="off"', 'placeholder="Search clubs or leagues" autocomplete="off"')
s = s.replace('aria-label="Matching clubs" hidden></ul>', 'aria-label="Matching clubs or leagues" hidden></ul>')
marker = '''  // Club index for the finder
  const clubs = [];
  for (const c of countries) {
    for (const lg of c.leagues) {
      for (const g of FP.groupsOf(lg)) {
        for (const r of g.rows) clubs.push({ team: r.team, country: c.country, countryName: c.name, league: lg.name, tier: lg.tier,
          ...(clubUrls.includes(`/${c.country}/club/${FP.slug(r.team)}/`) ? { path: `${c.country}/club/${FP.slug(r.team)}/` } : {}) });
      }
    }
  }
  // Then clubs that are only in past seasons, marked with the last season they were seen.
  clubs.push(...pastFinder);
  clubs.sort((a, b) => a.team.localeCompare(b.team));
  await write("data/clubs.json", JSON.stringify(clubs));'''
replacement = '''  // Club index retained for compatibility, plus a unified search index for clubs and leagues.
  const clubs = [];
  for (const c of countries) {
    for (const lg of c.leagues) {
      for (const g of FP.groupsOf(lg)) {
        for (const r of g.rows) clubs.push({ team: r.team, country: c.country, countryName: c.name, league: lg.name, tier: lg.tier,
          ...(clubUrls.includes(`/${c.country}/club/${FP.slug(r.team)}/`) ? { path: `${c.country}/club/${FP.slug(r.team)}/` } : {}) });
      }
    }
  }
  clubs.push(...pastFinder);
  clubs.sort((a, b) => a.team.localeCompare(b.team));
  await write("data/clubs.json", JSON.stringify(clubs));

  const search = [], searchSeen = new Set();
  const addSearch = (x) => {
    const k = [x.type, x.country, x.name, x.path || "", x.hash || ""].join("|");
    if (!searchSeen.has(k)) { searchSeen.add(k); search.push(x); }
  };
  for (const c of clubs) addSearch({ type: "club", name: c.team, country: c.country, countryName: c.countryName, league: c.league, tier: c.tier,
    ...(c.past ? { past: c.past } : {}), ...(c.path ? { path: c.path } : {}) });
  for (const c of countries) for (const lg of c.leagues) addSearch({ type: "league", name: lg.name, short: lg.short, country: c.country, countryName: c.name,
    tier: lg.tier, path: `${c.country}/`, hash: lg.id });
  if (europe) for (const lg of europe.leagues) addSearch({ type: "competition", name: lg.name, short: lg.short, country: "europe", countryName: "Europe",
    path: `europe/${lg.id}/` });
  search.sort((a, b) => a.name.localeCompare(b.name) || a.countryName.localeCompare(b.countryName));
  await write("data/search.json", JSON.stringify(search));'''
if marker not in s:
    raise SystemExit('Could not find club-index block in scripts/build.mjs')
s = s.replace(marker, replacement)
p.write_text(s)

# Homepage copy in the render source.
p = Path('assets/render.js')
s = p.read_text()
s = s.replace('// Club search, the quickest way in. assets/app.js wires it up and keeps it in place when the page redraws.',
              '// Club and league search, the quickest way in. assets/app.js wires it up and keeps it in place when the page redraws.')
s = s.replace('<div class="hero-find" id="hero-find-box"><label for="hero-find">Find your club</label>',
              '<div class="hero-find" id="hero-find-box"><label for="hero-find">Find a club or league</label>')
s = s.replace('placeholder="Type a club’s name" autocomplete="off"', 'placeholder="Type a club or league name" autocomplete="off"')
s = s.replace('aria-label="Matching clubs" hidden></ul></div>', 'aria-label="Matching clubs or leagues" hidden></ul></div>')
s = s.replace('Any club in these leagues, now or in past seasons: fixtures, results and its journey through the pyramid.',
              'Search any club or league covered here. Club results open fixtures, results and its pyramid journey; league results jump straight to the table.')
p.write_text(s)
