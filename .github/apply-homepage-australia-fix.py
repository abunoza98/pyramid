from pathlib import Path


def replace_once(path, old, new):
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f"Expected block not found in {path}")
    p.write_text(s.replace(old, new, 1))


# 1) Today's games: render explicit horizontal-scroll controls.
replace_once(
    "assets/render.js",
    '''    return '<section class="strip" aria-label="Today’s games"><p class="strip-head">' +
      (liveN ? '<span class="live-dot" aria-hidden="true"></span>' : "") + "Today: " + fx.length + " game" + (fx.length === 1 ? "" : "s") +
      " in " + where + (liveN ? " · <strong>" + liveN + " live</strong>" : "") + "</p>" +
      '<ul class="strip-list">' + chips + "</ul></section>";''',
    '''    return '<section class="strip" aria-label="Today’s games"><div class="strip-head"><p>' +
      (liveN ? '<span class="live-dot" aria-hidden="true"></span>' : "") + "Today: " + fx.length + " game" + (fx.length === 1 ? "" : "s") +
      " in " + where + (liveN ? " · <strong>" + liveN + " live</strong>" : "") + '</p><div class="strip-nav" role="group" aria-label="Scroll today’s games">' +
      '<button class="strip-arrow prev" type="button" data-strip-scroll="-1" aria-label="Previous games">‹</button>' +
      '<button class="strip-arrow next" type="button" data-strip-scroll="1" aria-label="Next games">›</button></div></div>' +
      '<ul class="strip-list" tabindex="0" aria-label="Today’s fixtures">' + chips + "</ul></section>";'''
)


# 2) Today's games: constrain all flexible text so long club/competition names cannot push the time out of the card.
replace_once(
    "assets/style.css",
    '''/* Today's games */
.strip { margin-top: 26px; }
.strip-head {
  display: flex; align-items: center; gap: 8px; margin: 0 0 10px;
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted);
}
.strip-head strong { color: var(--down); font-weight: 500; }
.strip-list {
  list-style: none; margin: 0; padding: 0 0 8px; display: flex; gap: 8px;
  overflow-x: auto; scroll-snap-type: x proximity; -webkit-overflow-scrolling: touch;
}
.strip-list li { flex: none; scroll-snap-align: start; }
.chip {
  display: grid; gap: 4px; width: 176px; padding: 9px 11px; border-radius: 8px;
  background: var(--sheet); border: 1px solid var(--rule); color: var(--ink); text-decoration: none; font-size: 13.5px;
}
.chip:hover { border-color: var(--accent); }
.chip.on { border-color: var(--down); }
.chip-top { display: flex; align-items: center; gap: 6px; font-family: var(--mono); font-size: 11px; color: var(--muted); }
.chip-top .flag { width: 16px; height: 11px; }
.chip-top b { margin-left: auto; font-weight: 500; }
.chip.on .chip-top b { color: var(--down); }
.chip-row { display: flex; gap: 8px; justify-content: space-between; }
.chip-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip-row b { font-variant-numeric: tabular-nums; }
''',
    '''/* Today's games */
.strip { margin-top: 26px; min-width: 0; }
.strip-head {
  display: flex; align-items: center; gap: 10px; margin: 0 0 10px;
  font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted);
}
.strip-head p { display: flex; align-items: center; gap: 8px; min-width: 0; margin: 0; }
.strip-head strong { color: var(--down); font-weight: 500; }
.strip-nav { display: none; align-items: center; gap: 6px; margin-left: auto; flex: none; }
.js .strip-nav { display: flex; }
.strip-arrow {
  display: inline-flex; align-items: center; justify-content: center; flex: none; width: 34px; height: 34px;
  border-radius: 50%; cursor: pointer; font: inherit; font-size: 22px; line-height: 1;
  color: var(--ink); background: var(--sheet); border: 1px solid var(--rule);
}
.strip-arrow:hover:not(:disabled) { border-color: var(--accent); }
.strip-arrow:disabled { opacity: 0.35; cursor: default; }
.strip-arrow:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.strip-list {
  list-style: none; margin: 0; padding: 0 0 8px; display: flex; gap: 8px; min-width: 0;
  overflow-x: auto; scroll-snap-type: x proximity; scroll-padding-inline: 2px;
  -webkit-overflow-scrolling: touch; overscroll-behavior-x: contain; scrollbar-width: thin;
}
.strip-list:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 8px; }
.strip-list li { flex: none; min-width: 0; scroll-snap-align: start; }
.chip {
  display: grid; gap: 4px; width: 176px; min-width: 0; overflow: hidden; padding: 9px 11px; border-radius: 8px;
  background: var(--sheet); border: 1px solid var(--rule); color: var(--ink); text-decoration: none; font-size: 13.5px;
}
.chip:hover { border-color: var(--accent); }
.chip.on { border-color: var(--down); }
.chip-top { display: flex; align-items: center; gap: 6px; min-width: 0; font-family: var(--mono); font-size: 11px; color: var(--muted); }
.chip-top .flag { width: 16px; height: 11px; flex: none; }
.chip-top > span:not(.flag) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip-top b { margin-left: auto; flex: none; min-width: max-content; white-space: nowrap; font-weight: 500; }
.chip.on .chip-top b { color: var(--down); }
.chip-row { display: flex; gap: 8px; min-width: 0; justify-content: space-between; }
.chip-row span { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chip-row b { flex: none; white-space: nowrap; font-variant-numeric: tabular-nums; }
'''
)


# 3) Today's games: preserve horizontal position during live redraws.
replace_once(
    "assets/app.js",
    '''    // The country picker keeps its sideways scroll position through the redraw.
    var wheel = document.querySelector("#main-content .xp-tabs"), wheelX = wheel ? wheel.scrollLeft : 0;
    $("main-content").innerHTML = html;''',
    '''    // Sideways rows keep their scroll position through live redraws.
    var wheel = document.querySelector("#main-content .xp-tabs"), wheelX = wheel ? wheel.scrollLeft : 0;
    var games = document.querySelector("#main-content .strip-list"), gamesX = games ? games.scrollLeft : 0;
    $("main-content").innerHTML = html;'''
)
replace_once(
    "assets/app.js",
    '''    applyClub(false);
    applyViews();
    window.scrollTo(0, y);''',
    '''    applyClub(false);
    applyViews();
    var games2 = document.querySelector("#main-content .strip-list");
    if (games2) { games2.scrollLeft = gamesX; requestAnimationFrame(function () { stripArrows(games2); }); }
    window.scrollTo(0, y);'''
)
replace_once(
    "assets/app.js",
    '''  /* ---------- The home page's country picker: a sideways-scrolling row with arrows for mouse users ---------- */''',
    '''  /* ---------- Today's games: horizontal strip with explicit controls ---------- */
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

  /* ---------- The home page's country picker: a sideways-scrolling row with arrows for mouse users ---------- */'''
)


# 4) Australia Cup: configure the national cup separately from the A-League finals.
replace_once(
    "scripts/leagues.mjs",
    '''      championOf: "a-league", championLabel: "Grand Final winner" }],''',
    '''      championOf: "a-league", championLabel: "Grand Final winner" },
      { apiId: 874, id: "australia-cup", name: "Australia Cup", short: "AUSC", calendar: true }],'''
)


# 5) Historical cup runs: a cup can use a calendar season even when its country's league season crosses years.
replace_once(
    "scripts/backfill-cups.mjs",
    '''    const body = await get(`/leagues?id=${cup.apiId}`);
    const years = (body?.response?.[0]?.seasons || []).map((s) => s.year).filter((y) => y < seasonFor(c) && (!cup.until || y <= cup.until)).sort((a, b) => a - b);''',
    '''    const body = await get(`/leagues?id=${cup.apiId}`);
    const cupSeason = cup.calendar ? { calendar: true } : c;
    const years = (body?.response?.[0]?.seasons || []).map((s) => s.year).filter((y) => y < seasonFor(cupSeason) && (!cup.until || y <= cup.until)).sort((a, b) => a - b);'''
)
replace_once(
    "scripts/backfill-cups.mjs",
    '''      const out = { country: c.country, cup: cup.id, name: cup.name, season: seasonLabel(year, c), year, ...s };''',
    '''      const out = { country: c.country, cup: cup.id, name: cup.name, season: seasonLabel(year, cupSeason), year, ...s };'''
)
replace_once(
    "scripts/backfill-cups.mjs",
    '''        season: seasonLabel(year, c), year, groups: [{ name: null, rounds }] }) + "\\n");''',
    '''        season: seasonLabel(year, cupSeason), year, groups: [{ name: null, rounds }] }) + "\\n");'''
)

print("Applied Today's games and Australia Cup fixes")
