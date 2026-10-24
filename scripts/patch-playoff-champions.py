from pathlib import Path


def replace_once(path, old, new, label):
    p = Path(path)
    s = p.read_text()
    if old not in s:
        raise SystemExit(f"{label} marker not found in {path}")
    p.write_text(s.replace(old, new, 1))


replace_once(
    "scripts/leagues.mjs",
    '''      dist: { "Elimination finals": 2, "Semi-finals": 1, "Grand Final": 0 } }],''',
    '''      dist: { "Elimination finals": 2, "Semi-finals": 1, "Grand Final": 0 },
      championOf: "a-league", championLabel: "Grand Final winner" }],''',
    "A-League Finals config",
)

replace_once(
    "scripts/leagues.mjs",
    '''        dist: { "Wild card": 4, "Round One": 3, "Conference semi-finals": 2, "Conference finals": 1, "MLS Cup final": 0 } }],''',
    '''        dist: { "Wild card": 4, "Round One": 3, "Conference semi-finals": 2, "Conference finals": 1, "MLS Cup final": 0 },
        championOf: "mls", championLabel: "MLS Cup winner" }],''',
    "MLS Cup Playoffs config",
)

replace_once(
    "scripts/build.mjs",
    '''  // Cups on a past season's pyramid: who won each that season, linking to that season's cup page when it has one
  // (its ties have been saved by scripts/backfill-cups.mjs), otherwise shown without a link.
  const pastCupCards = (c, year, rel) => ((COUNTRIES.find((x) => x.country === c.country) || {}).cups || []).map((cup) => {
    const sum = ((cupHistory[c.country] || {})[cup.id] || []).find((x) => x.year === year);
    if (!sum) return null;
    const fx = fixtures[`${c.country}/${cup.id}`];
    const past = (cupPast[`${c.country}/${cup.id}`] || []).filter((p) => !fx || p.season !== fx.season);
    const own = (fx ? past : past.slice(1)).some((p) => p.year === year);
    const href = own ? `${rel}${cup.id}/${slug(year, c.country)}/${suffix}` : !fx && past[0] && past[0].year === year ? `${rel}${cup.id}/${suffix}` : null;
    const w = sum.winner, fin = w && sum.clubs && sum.clubs[w.id];
    const status = w ? `Won by ${w.n}` + (fin && fin[3] ? ` (beat ${fin[3]}${fin[4] ? " " + fin[4] : ""} in the final)` : "") : "";
    return { id: cup.id, name: cup.name, status, span: "", href };
  }).filter(Boolean);''',
    '''  // Where a saved cup/finals season lives. When there is no current edition yet, the latest completed
  // one is deliberately served at the competition root; older editions have their own season folder.
  const pastCupHref = (c, cup, year, rel) => {
    const fx = fixtures[`${c.country}/${cup.id}`];
    const past = (cupPast[`${c.country}/${cup.id}`] || []).filter((p) => !fx || p.season !== fx.season);
    const own = (fx ? past : past.slice(1)).some((p) => p.year === year);
    return own ? `${rel}${cup.id}/${slug(year, c.country)}/${suffix}` : !fx && past[0] && past[0].year === year ? `${rel}${cup.id}/${suffix}` : null;
  };
  // Cups on a past season's pyramid: who won each that season, linking to the bracket/ties when saved.
  const pastCupCards = (c, year, rel) => ((COUNTRIES.find((x) => x.country === c.country) || {}).cups || []).map((cup) => {
    const sum = ((cupHistory[c.country] || {})[cup.id] || []).find((x) => x.year === year);
    if (!sum) return null;
    const href = pastCupHref(c, cup, year, rel);
    const w = sum.winner, fin = w && sum.clubs && sum.clubs[w.id];
    const status = w ? `Won by ${w.n}` + (fin && fin[3] ? ` (beat ${fin[3]}${fin[4] ? " " + fin[4] : ""} in the final)` : "") : "";
    return { id: cup.id, name: cup.name, status, span: "", href };
  }).filter(Boolean);
  // Some leagues crown their champion through a postseason rather than the regular-season table (A-League, MLS).
  // Mark that postseason winner on the historical league table and link the badge to that season's bracket.
  const markPostseasonChampions = (c, season, rel) => {
    const cfg = COUNTRIES.find((x) => x.country === c.country);
    if (!cfg) return season;
    for (const cup of (cfg.cups || []).filter((x) => x.championOf)) {
      const sum = ((cupHistory[c.country] || {})[cup.id] || []).find((x) => x.year === season.year);
      const winner = sum && sum.winner;
      const lg = season.leagues.find((x) => x.id === cup.championOf);
      if (!winner || !lg) continue;
      const rows = FP.groupsOf(lg).flatMap((g) => g.rows);
      const clean = (n) => FP.slug(n).replace(/-fc$/, "");
      const row = rows.find((r) => winner.id && r.tid && Number(r.tid) === Number(winner.id)) ||
        rows.find((r) => FP.slug(r.team) === FP.slug(winner.n)) || rows.find((r) => clean(r.team) === clean(winner.n));
      if (!row) continue;
      row.title = { label: cup.championLabel || `${cup.name} winner`, href: pastCupHref(c, cup, season.year, rel) };
    }
    return season;
  };''',
    "historical cup cards",
)

replace_once(
    "scripts/build.mjs",
    '''      labelCupPlaces(markOutcomes(applyPlayoffRules(h), next));
      const n = tierNames(h);''',
    '''      labelCupPlaces(markOutcomes(applyPlayoffRules(h), next));
      markPostseasonChampions(c, h, "../");
      const n = tierNames(h);''',
    "historical season build",
)

replace_once(
    "assets/render.js",
    '''        (r.out ? '<span class="out ' + r.out + '">' + OUT[r.out] + "</span>" : "") +
        (r.q ? '<span class="qtag ' + r.q + '" title="' + esc(QTAG[r.q][1]) + '">' + QTAG[r.q][0] + "</span>" : "") +''',
    '''        (r.out ? '<span class="out ' + r.out + '">' + OUT[r.out] + "</span>" : "") +
        (r.title ? (r.title.href ? '<a class="out champ" href="' + esc(r.title.href) + '" title="Open the postseason bracket">🏆 ' + esc(r.title.label) + "</a>"
          : '<span class="out champ">🏆 ' + esc(r.title.label) + "</span>") : "") +
        (r.q ? '<span class="qtag ' + r.q + '" title="' + esc(QTAG[r.q][1]) + '">' + QTAG[r.q][0] + "</span>" : "") +''',
    "table champion badge",
)

replace_once(
    "assets/style.css",
    '''.out.po-lost { background: var(--down); }
.out.po-stayed { background: var(--muted); }''',
    '''.out.po-lost { background: var(--down); }
.out.po-stayed { background: var(--muted); }
.out.champ { background: var(--ink); text-decoration: none; }
.out.champ:hover { text-decoration: underline; text-underline-offset: 2px; }''',
    "champion badge CSS",
)
