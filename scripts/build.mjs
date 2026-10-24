#!/usr/bin/env node
// Football Pyramids: writes the website's pages from the data files.
//
//   node scripts/build.mjs                 builds into the project folder (what goes live)
//   node scripts/build.mjs --preview DIR   builds a copy with explicit index.html links, for opening offline
//
// Output: index.html, <country>/index.html, data/clubs.json, data/search.json, sitemap.xml, robots.txt

import { readFile, writeFile, mkdir, copyFile, readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { COUNTRIES, EUROPE, SITE, CONTACT, ADS, ADSENSE_CLIENT, LIVE_URL, venueZone } from "./leagues.mjs";
import { zoneAt, applyPlayoffRules, labelCupPlaces } from "./zones.mjs";
import { regroupEurope } from "./rounds.mjs";
import { seasonFor, seasonLabel, seasonSlug } from "./season.mjs";
import { summarise, learnLabels } from "./cupruns.mjs";
export { applyPlayoffRules, labelCupPlaces };
import { contactPage, privacyPage } from "./pages.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const FP = require(path.join(ROOT, "assets/render.js"));
// A short fingerprint per asset, added to its URL, so browsers and Cloudflare fetch the new file after each change.
const VER = Object.fromEntries(["style.css", "render.js", "app.js"].map((f) =>
  [f, createHash("sha1").update(readFileSync(path.join(ROOT, "assets", f))).digest("hex").slice(0, 8)]));

const FAVICON = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#121B2A"/>' +
  '<rect x="12" y="7" width="8" height="4" rx="1" fill="#8EA2FF"/><rect x="8" y="14" width="16" height="4" rx="1" fill="#8EA2FF"/>' +
  '<rect x="4" y="21" width="24" height="4" rx="1" fill="#8EA2FF"/></svg>');

const esc = FP.esc;

let HAS_EUROPE = false;

// Footer notes only where they apply: table pages explain the tables; fixtures, cup and bracket pages need none.
function footNotes(page, snapshot) {
  const ranking = "<p>Clubs are ranked by points, then by each league's own tie-break rules.</p>";
  if (["home", "country", "europe"].includes(page)) {
    return (snapshot ? "<p>These are sample standings gathered by hand, and each table shows the date it is from.</p>" : "<p>Tables update through the day as results come in.</p>") + ranking;
  }
  if (page === "history") return "<p>Final tables as they stood at the end of the season.</p>" + ranking;
  return "";
}   // set by build() once the European tables exist

// Structured data (schema.org JSON-LD). Only for things the page visibly shows: the site itself on the home page,
// and on club and past-season pages the trail of links at the top, plus the club as a team.
const crumbs = (items) => ({ "@context": "https://schema.org", "@type": "BreadcrumbList",
  itemListElement: items.map(([name, url], i) => ({ "@type": "ListItem", position: i + 1, name, item: url })) });
const ldScript = (data) => data ? (Array.isArray(data) ? data : [data]).map((d) =>
  `<script type="application/ld+json">${JSON.stringify(d).replace(/</g, "\\u003c")}</script>\n`).join("") : "";

// An old address that now lives in a tab: send visitors (and search engines, via the canonical link) to the tab.
function redirectPage(to, canonical, name) {
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<title>${esc(name)} fixtures and results | Football Pyramids</title>
<link rel="canonical" href="${canonical}">
<meta name="robots" content="noindex, follow">
<meta http-equiv="refresh" content="0; url=${to}">
<script>location.replace(${JSON.stringify(to)});</script>
</head>
<body><p><a href="${to}">${esc(name)} fixtures and results</a></p></body>
</html>
`;
}

function shell({ title, description, canonical, base, suffix, page, country, stamps, main, countries, seasons, attrs = {}, jsonld = null }) {
  const snapshot = countries.some((c) => c.mode !== "live");
  const home = base || "./";
  const homeHref = suffix ? base + suffix : home;
  const link = (c, extra) => `<a href="${base}${c.country}/${suffix}"${c.country === country ? ' aria-current="page"' : ""}${extra ? ' class="nav-here"' : ""}>` +
    `<span class="short">${c.code || c.name.slice(0, 3).toUpperCase()}</span><span class="long">${esc(c.name)}</span></a>`;
  const featured = countries.filter((c) => c.featured), others = countries.filter((c) => !c.featured);
  const here = others.find((c) => c.country === country);
  // Europe: a menu like "More", with the overview and each competition.
  const euroHere = country === "europe" ? (EUROPE.leagues.find((l) => String(canonical || "").includes(`/europe/${l.id}/`)) || {}).id || "hub" : null;
  const euro = HAS_EUROPE ? `<details class="nav-more nav-euro${euroHere ? " is-here" : ""}"><summary aria-label="European competitions"><span class="short">EUR</span><span class="long">Europe</span></summary>` +
    `<div class="nav-panel"><a href="${base}europe/${suffix}"${euroHere === "hub" ? ' aria-current="page"' : ""}>${FP.flag("europe")}All competitions</a>` +
    EUROPE.leagues.map((l) => `<a href="${base}europe/${l.id}/${suffix}"${euroHere === l.id ? ' aria-current="page"' : ""}><span class="comp-dot c-${l.id}" aria-hidden="true"></span>${esc(l.name)}</a>`).join("") +
    `</div></details>` : "";
  const nav = featured.map((c) => link(c)).join("") + euro + (here ? link(here, true) : "") + (others.length
    ? `<details class="nav-more"><summary aria-label="More countries"><span class="short">More</span><span class="long">More</span></summary>` +
      `<div class="nav-panel">${others.map((c) => `<a href="${base}${c.country}/${suffix}"${c.country === country ? ' aria-current="page"' : ""}>${FP.flag(c.country)}${esc(c.name)}</a>`).join("")}</div></details>`
    : "");
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="Football Pyramids">
<meta property="og:image" content="${SITE}/assets/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Football Pyramids: football league tables, from the top flight down.">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${FAVICON}">
<link rel="manifest" href="${base}manifest.webmanifest">
<link rel="apple-touch-icon" href="${base}assets/icons/apple-touch-icon.png">
<meta name="theme-color" content="#F2F4F0" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0E141C" media="(prefers-color-scheme: dark)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Pyramids">
<link rel="preload" href="${base}assets/fonts/big-shoulders-display-latin-800-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${base}assets/fonts/ibm-plex-sans-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${base}assets/style.css?v=${VER["style.css"]}">
${suffix ? "" : ldScript(jsonld)}${ADSENSE_CLIENT && !suffix ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>\n` : ""}</head>
<body${ADS ? "" : ' class="no-ads"'} data-page="${page}" data-base="${base}" data-index="${suffix}"${country ? ` data-country="${country}"` : ""} data-countries="${featured.map((c) => c.country).join(",")}"${page === "home" ? ` data-others="${esc(JSON.stringify(others.map(FP.summary)))}"` : ""} data-stamps="${esc(JSON.stringify(stamps))}"${seasons ? ` data-seasons="${esc(JSON.stringify(seasons))}"` : ""}${LIVE_URL && ["home", "country", "fixtures", "europe", "comp", "cup", "club"].includes(page) ? ` data-live="${esc(LIVE_URL)}"` : ""}${Object.entries(attrs).map(([k, v]) => ` data-${k}="${esc(typeof v === "string" ? v : JSON.stringify(v))}"`).join("")}>
<header class="bar">
  <div class="bar-inner">
    <a class="brand" href="${homeHref}" aria-label="Football Pyramids, home">
      <span class="glyph" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="brand-text" aria-hidden="true"><small>Football</small><span>Pyramids</span></span>
    </a>
    <nav class="nav" aria-label="Countries">${nav}</nav>
    <div class="finder">
      <label class="sr-only" for="club-find">Search clubs or leagues</label>
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>
      <input id="club-find" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="club-find-list" placeholder="Search clubs or leagues" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
      <ul class="finder-list" id="club-find-list" role="listbox" aria-label="Matching clubs or leagues" hidden></ul>
      <button id="club-clear" type="button" aria-label="Clear highlighted club" hidden>×</button>
    </div>
  </div>
</header>

<div class="shell" id="top">
  <aside class="rail rail-left" aria-label="Advertisement">
    <div class="stick">
      <div class="ad" style="--h:600px"><span class="ad-tag">Advertisement</span><span class="ad-size">160 × 600</span><span class="ad-note">Skyscraper</span></div>
    </div>
  </aside>

  <main>
    <div id="main-content">${main}</div>
    <footer>
      ${footNotes(page, snapshot)}
      <p>Football Pyramids is an independent site and is not affiliated with any league, federation or club. Club and competition names are used only to identify them.</p>
      <p class="foot-links">
        <a href="${base}contact/${suffix}">About and contact</a>
        <a href="${base}privacy/${suffix}">Privacy policy</a>
        <button type="button" id="privacy-settings" hidden>Privacy and cookie settings</button>
      </p>
    </footer>
  </main>

  <aside class="rail rail-right" aria-label="Advertisement">
    <div class="stick">
      <div class="ad" style="--h:600px"><span class="ad-tag">Advertisement</span><span class="ad-size">300 × 600</span><span class="ad-note">Half page</span></div>
      <div class="ad" style="--h:250px"><span class="ad-tag">Advertisement</span><span class="ad-size">300 × 250</span><span class="ad-note">Medium rectangle</span></div>
    </div>
  </aside>
</div>

<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
<script src="${base}assets/render.js?v=${VER["render.js"]}"></script>
<script src="${base}assets/app.js?v=${VER["app.js"]}"></script>
</body>
</html>
`;
}

export async function loadCountries(root = ROOT) {
  const out = [];
  for (const cfg of COUNTRIES) {
    // A country only appears once its first tables have been fetched.
    let d;
    try { d = JSON.parse(await readFile(path.join(root, "data", cfg.country + ".json"), "utf8")); } catch { continue; }
    out.push(Object.assign(d, { featured: !!cfg.featured, code: cfg.code, region: cfg.region,
      system: cfg.system || null, systemNote: cfg.systemNote || null, closed: !!cfg.closed }));
  }
  return out;
}

// Past seasons saved by scripts/backfill-history.mjs, newest first.
export async function loadHistory(root = ROOT) {
  const out = {};
  for (const cfg of COUNTRIES) {
    const dir = path.join(root, "data", "history", cfg.country);
    let files = [];
    try { files = (await readdir(dir)).filter((f) => /^\d{4}\.json$/.test(f)); } catch {}
    const list = [];
    for (const f of files) {
      const h = JSON.parse(await readFile(path.join(dir, f), "utf8"));
      // Leave out leagues whose saved seasons before `historyFrom` aren't reliable.
      h.leagues = h.leagues.filter((l) => !((cfg.leagues.find((x) => x.id === l.id) || {}).historyFrom > h.year));
      if (h.leagues.length) list.push(h);
    }
    out[cfg.country] = list.sort((a, b) => b.year - a.year);
  }
  return out;
}
// Fixture lists saved by scripts/update-fixtures.mjs: { "england/premier-league": data }
// Past cup seasons saved by scripts/backfill-cups.mjs: { country: { cupId: [season summaries, oldest first] } }
export async function loadCupHistory(root = ROOT) {
  const out = {};
  for (const c of COUNTRIES) for (const cup of c.cups || []) {
    const dir = path.join(root, "data", "history", c.country, "cups", cup.id);
    let files = [];
    try { files = (await readdir(dir)).filter((f) => /^\d{4}\.json$/.test(f)); } catch { continue; }
    const list = [];
    for (const f of files) list.push(JSON.parse(await readFile(path.join(dir, f), "utf8")));
    (out[c.country] ||= {})[cup.id] = list.sort((a, b) => a.year - b.year);
  }
  return out;
}
// Past cup seasons' ties, saved by scripts/backfill-cups.mjs: { "country/cup": [fixture files, newest first] }
export async function loadCupFixtureHistory(root = ROOT) {
  const out = {};
  for (const c of COUNTRIES) for (const cup of c.cups || []) {
    const dir = path.join(root, "data", "history", c.country, "cups", cup.id);
    let files = [];
    try { files = (await readdir(dir)).filter((f) => /^\d{4}-fixtures\.json$/.test(f)); } catch { continue; }
    const list = [];
    for (const f of files) list.push(JSON.parse(await readFile(path.join(dir, f), "utf8")));
    if (list.length) out[`${c.country}/${cup.id}`] = list.sort((a, b) => b.year - a.year);
  }
  return out;
}
export async function loadFixtures(root = ROOT) {
  const out = {};
  for (const cfg of [...COUNTRIES, EUROPE]) for (const lg of [...cfg.leagues, ...(cfg.cups || [])]) {
    try {
      const fx = JSON.parse(await readFile(path.join(root, "data", "fixtures", cfg.country, `${lg.id}.json`), "utf8"));
      if (cfg.tz) for (const g of fx.groups || []) for (const r of g.rounds || []) for (const f of r.fixtures || []) if (!f.z) { const z = venueZone(cfg, f, g.name); if (z) f.z = z; }
      out[`${cfg.country}/${lg.id}`] = cfg === EUROPE ? regroupEurope(fx) : fx;
    } catch {}
  }
  return out;
}
// Past European seasons saved by scripts/backfill-europe.mjs: { "champions-league": [{ year, season, comp, fx }] }, newest first.
export async function loadEuropeHistory(root = ROOT) {
  const out = {};
  for (const lg of EUROPE.leagues) {
    const dir = path.join(root, "data", "history", "europe", lg.id);
    let files = [];
    try { files = (await readdir(dir)).filter((f) => /^\d{4}\.json$/.test(f)); } catch {}
    const list = [];
    for (const f of files) {
      const h = JSON.parse(await readFile(path.join(dir, f), "utf8"));
      try { h.fx = regroupEurope(JSON.parse(await readFile(path.join(dir, f.replace(".json", "-fixtures.json")), "utf8"))); } catch { h.fx = null; }
      list.push(h);
    }
    out[lg.id] = list.sort((a, b) => b.year - a.year);
  }
  return out;
}
const ordinal = (n) => { const v = n % 100, s = ["th", "st", "nd", "rd"]; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
// Season folder: "2015-16", or "2015" for calendar-year countries. cc is the country code (none for Europe).
const slug = (year, cc) => seasonSlug(year, COUNTRIES.find((x) => x.country === cc));

// The "Other seasons" list. rel is the path from the page to the country folder ("" or "../").
function seasonList(current, past, rel, suffix, onYear) {
  if (!past.length) return null;
  return [
    { label: `${current.season} (live)`, href: (rel || "./") + suffix, current: onYear == null },
    ...past.map((h) => ({ label: h.season, href: `${rel}${slug(h.year, current.country)}/${suffix}`, current: onYear === h.year }))
  ];
}

/* ---------- Play-off results ----------
   The API doesn't say who won a play-off, but the next season does: a play-off club that turns up a tier higher
   next season won it. Same for relegation play-offs (stayed up or went down). Marks rows with `out`. */
const teamsByTier = (s) => new Map(s.leagues.map((lg) => [lg.tier,
  new Set((lg.groups ? lg.groups.flatMap((g) => g.rows) : lg.rows || []).map((r) => r.team))]));
export function markOutcomes(season, next) {
  if (!next) return season;
  const tiers = teamsByTier(next);
  for (const lg of season.leagues) {
    const up = tiers.get(lg.tier - 1), same = tiers.get(lg.tier), down = tiers.get(lg.tier + 1);
    for (const r of lg.groups ? lg.groups.flatMap((g) => g.rows) : lg.rows || []) {
      const z = zoneAt(lg, r.pos);
      if (!z || !/play/i.test(z.label)) continue;
      if (z.kind !== "down" && up?.has(r.team)) r.out = "po-won";
      else if (z.kind === "down" && same?.has(r.team)) r.out = "po-stayed";
      else if (z.kind === "down" && down?.has(r.team)) r.out = "po-lost";
    }
  }
  return season;
}

function tierNames(c) {
  const first = c.leagues[0].name, last = c.leagues[c.leagues.length - 1].name;
  return { first, last };
}

export async function build({ root = ROOT, outDir = ROOT, preview = false } = {}) {
  const countries = await loadCountries(root);
  const history = await loadHistory(root);
  // A calendar-year country early in the year still shows last year's table as its current season;
  // its saved copy of that season mustn't appear twice.
  for (const c of countries) {
    const live = Number(String(c.season).slice(0, 4));
    if (history[c.country]) history[c.country] = history[c.country].filter((h) => h.year < live);
  }
  const fixtures = await loadFixtures(root);
  const cupHistory = await loadCupHistory(root);
  // All-time titles per cup up to a season (data/cup-titles.json); later wins come from our own cup data.
  let cupTitles = {};
  try { cupTitles = JSON.parse(await readFile(path.join(root, "data", "cup-titles.json"), "utf8")); } catch {}
  const cupPast = await loadCupFixtureHistory(root);
  const cupPastUrls = [];
  const cupUrls = [];
  const racesUrls = [];
  // Every club that gets a page: those in the current tables (by club ID), plus clubs only found in past
  // seasons (by name), so any table, current or past, can link to its clubs.
  const index = new Map();          // club ID -> { c, lg, g, r, slug, path }
  const pathByName = {};            // country -> { "n:<slug>": path }
  const pastOnly = [];              // [{ c, name, slug, path }]
  for (const c of countries) {
    const seen = new Set();
    pathByName[c.country] = {};
    for (const lg of c.leagues) for (const g of FP.groupsOf(lg)) for (const r of g.rows) {
      if (!r.tid || index.has(r.tid)) continue;
      const sl = FP.slug(r.team);
      if (seen.has(sl)) continue;   // two clubs with the same name in one country: the first gets the page
      seen.add(sl);
      index.set(r.tid, { c, lg, g, r, slug: sl, path: `${c.country}/club/${sl}/` });
      pathByName[c.country]["n:" + sl] = `${c.country}/club/${sl}/`;
    }
    for (const h of history[c.country] || []) for (const plg of h.leagues) for (const pg of FP.groupsOf(plg)) for (const r of pg.rows) {
      const sl = FP.slug(r.team);
      if (seen.has(sl)) continue;
      seen.add(sl);
      pastOnly.push({ c, name: r.team, slug: sl, path: `${c.country}/club/${sl}/` });
      pathByName[c.country]["n:" + sl] = `${c.country}/club/${sl}/`;
    }
  }
  // Club ID -> path, for tables that mix countries (Europe).
  const pathByTid = Object.fromEntries([...index].map(([tid, k]) => [tid, k.path]));
  const anyByName = {};
  for (const m of Object.values(pathByName)) for (const [k, v] of Object.entries(m)) if (!(k in anyByName)) anyByName[k] = v;
  // Only the clubs in one European table, so each page carries a few dozen links rather than every club.
  const pathsFor = (comp) => {
    const out = {};
    if (comp) for (const g of FP.groupsOf(comp)) for (const r of g.rows) {
      const n = "n:" + FP.slug(r.team);
      if (r.tid && pathByTid[r.tid]) out[r.tid] = pathByTid[r.tid];
      else if (anyByName[n]) out[n] = anyByName[n];
    }
    return out;
  };
  // Every club in a cup or European competition's ties that has a page here: by club ID, else by name (within the
  // country for a domestic cup). Used to link club names in brackets, tie lists and fixture rows.
  const pathsForFx = (fx, country) => {
    const out = {}, byName = country ? pathByName[country] || {} : anyByName;
    if (fx) for (const g of fx.groups || []) for (const r of g.rounds || []) for (const f of r.fixtures || []) for (const t of [f.h, f.a]) {
      if (!t) continue;
      if (t.id && pathByTid[t.id]) { out[t.id] = pathByTid[t.id]; continue; }
      const n = "n:" + FP.slug(t.n);
      if (byName[n]) out[n] = byName[n];
    }
    return out;
  };
  // Where a saved cup/finals season lives. When there is no current edition yet, the latest completed
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
  };
  // Cards for a country's cups (status from the fixtures), with links relative to the country page.
  const cupCards = (c, rel) => ((COUNTRIES.find((x) => x.country === c.country) || {}).cups || [])
    .filter((cup) => fixtures[`${c.country}/${cup.id}`] || cupPast[`${c.country}/${cup.id}`])
    .map((cup) => {
      const fx = fixtures[`${c.country}/${cup.id}`];
      if (fx) return { id: cup.id, name: cup.name, status: FP.cupStatus(fx), span: FP.cupSpan(fx), href: `${rel}${cup.id}/${suffix}` };
      const last = cupPast[`${c.country}/${cup.id}`][0];
      return { id: cup.id, name: cup.name, status: (cup.until ? `Ended in ${cup.until + 1} · ` : `${last.season}: `) + FP.cupStatus(last), span: "", href: `${rel}${cup.id}/${suffix}` };
    });
  let europe = null;
  try { europe = JSON.parse(await readFile(path.join(root, "data", "europe.json"), "utf8")); } catch {}
  HAS_EUROPE = !!europe;
  const statuses = europe ? Object.fromEntries(europe.leagues.map((c) => [c.id, FP.compStatus(c, fixtures[`europe/${c.id}`])])) : {};
  const euroSummary = europe ? FP.summary(europe) : null;
  // Links from tables to fixtures pages, relative to the home page or a country page.
  const fxLinks = (fromHome) => Object.fromEntries(Object.keys(fixtures).map((k) => {
    const [c, l] = k.split("/");
    return [k, (fromHome ? `${c}/` : "") + (fixtures[k].cup ? `${l}/${suffix}#fixtures` : `${l}/fixtures/${suffix}`)];
  }));
  const suffix = preview ? "index.html" : "";
  const stamps = Object.fromEntries(countries.map((c) => [c.country, c.updated]));
  const written = [];
  const write = async (rel, text) => {
    const file = path.join(outDir, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text);
    written.push(rel);
  };

  // Home page "Up and down" module: for each country, the clubs that moved between its top two divisions since last
  // season, from last season's saved final tables and this season's (matched by club ID, else by name). Only the
  // top-flight boundary, to keep it short; a country without last season's top two tiers on record is left out.
  const movers = [];
  for (const c of countries) {
    const Y = Number(String(c.season).slice(0, 4));
    const last = (history[c.country] || []).find((h) => h.year === Y - 1);
    if (!last) continue;
    const rowsOf = (leagues, tier) => leagues.filter((l) => l.tier === tier).flatMap((l) => FP.groupsOf(l).flatMap((g) => g.rows.map((r) => ({ r, l }))));
    const [was1, was2, now1, now2] = [rowsOf(last.leagues, 1), rowsOf(last.leagues, 2), rowsOf(c.leagues, 1), rowsOf(c.leagues, 2)];
    if (!was1.length || !was2.length || !now1.length || !now2.length) continue;
    const same = (a, b) => (a.tid && b.tid ? a.tid === b.tid : FP.slug(a.team) === FP.slug(b.team));
    const link = (r) => pathByName[c.country]["n:" + FP.slug(r.team)] || null;
    const up = now1.map(({ r }) => ({ r, was: was2.find((x) => same(x.r, r)) })).filter((x) => x.was)
      .sort((a, b) => a.was.r.pos - b.was.r.pos).map(({ r, was }) => ({ n: r.team, path: link(r), pos: was.r.pos }));
    const down = now2.map(({ r }) => ({ r, was: was1.find((x) => same(x.r, r)) })).filter((x) => x.was)
      .sort((a, b) => a.was.r.pos - b.was.r.pos).map(({ r, was }) => ({ n: r.team, path: link(r), pos: was.r.pos }));
    if (!up.length && !down.length) continue;
    movers.push({ country: c.country, name: c.name, featured: !!c.featured, top: now1[0].l.name, second: now2[0].l.name, last: last.season, up, down });
  }

  // Home
  await write("index.html", shell({
    title: "Football Pyramids: league tables from the top flight down",
    description: `League tables for ${countries.length} countries (${countries.map((c) => c.name).join(", ")}), each country's divisions on one page with promotion and relegation places marked. Fixtures, past seasons and live scores.`,
    canonical: SITE + "/", base: "", suffix, page: "home", stamps, countries,
    jsonld: { "@context": "https://schema.org", "@type": "WebSite", name: "Football Pyramids", url: SITE + "/" },
    attrs: { fixtures: { ...fxLinks(true), ...(europe ? { "europe/champions-league": `europe/champions-league/${suffix}#fixtures` } : {}) },
      ...(europe ? { europe: "1", clubpaths: pathsFor(europe.leagues[0]) } : {}), cupsmap: Object.fromEntries(countries.map((c) => [c.country, cupCards(c, `${c.country}/`)])), movers },
    main: FP.homeMain(countries.filter((c) => c.featured), "", suffix, countries.filter((c) => !c.featured).map(FP.summary),
      { fixtures: { ...fxLinks(true), ...(europe ? { "europe/champions-league": `europe/champions-league/${suffix}#fixtures` } : {}) }, europe,
        cups: Object.fromEntries(countries.map((c) => [c.country, cupCards(c, `${c.country}/`)])), clubPaths: europe ? pathsFor(europe.leagues[0]) : null, movers })
  }));

  // Country pages
  for (const c of countries) {
    const { first, last } = tierNames(c);
    await write(`${c.country}/index.html`, shell({
      title: `${c.system ? c.system.charAt(0).toUpperCase() + c.system.slice(1) : c.adjective + " football pyramid"}: ${first} to ${last} tables | Football Pyramids`,
      description: `Every ${c.adjective} league table from ${first} down to ${last} on one page, with ${c.closed ? "play-off" : "promotion, relegation and play-off"} places marked.`,
      canonical: `${SITE}/${c.country}/`, base: "../", suffix, page: "country", country: c.country,
      stamps: { [c.country]: c.updated }, countries, seasons: seasonList(c, history[c.country], "", suffix, null),
      attrs: { fixtures: fxLinks(false), cups: cupCards(c, ""), races: c.closed ? "" : `races/${suffix}` },
      main: FP.countryMain(c, { seasons: seasonList(c, history[c.country], "", suffix, null), fixtures: fxLinks(false), cups: cupCards(c, ""), racesHref: c.closed ? "" : `races/${suffix}` })
    }));
    // Promotion and relegation races: each league's zones and the clubs just outside them, from the current tables.
    // Not for a league system without promotion and relegation (the USA).
    if (!c.closed) await write(`${c.country}/races/index.html`, shell({
      title: `${c.adjective} football promotion and relegation races ${c.season} | Football Pyramids`,
      description: `Who's in the promotion, play-off and relegation places in every ${c.adjective} league covered here, who's just outside, and the points gap at each line.`,
      canonical: `${SITE}/${c.country}/races/`, base: "../../", suffix, page: "races", country: c.country, stamps: { [c.country]: c.updated }, countries,
      jsonld: crumbs([["Football Pyramids", SITE + "/"], [c.name, `${SITE}/${c.country}/`], ["Promotion and relegation races", `${SITE}/${c.country}/races/`]]),
      main: FP.racesMain(c, { root: "../../", suffix, tableHref: `../${suffix}` })
    }));
    if (!c.closed) racesUrls.push(`/${c.country}/races/`);
    // Cup pages
    // Cup pages: this season at /<country>/<cup>/, each past season at /<country>/<cup>/<season>/, with a Seasons
    // picker. A cup with no current season yet (or one that has ended) shows its latest finished season there.
    for (const cup of (COUNTRIES.find((x) => x.country === c.country) || {}).cups || []) {
      const fx = fixtures[`${c.country}/${cup.id}`];
      const past = (cupPast[`${c.country}/${cup.id}`] || []).filter((p) => !fx || p.season !== fx.season);
      if (!fx && !past.length) continue;
      const top = fx || past[0];                    // what /<country>/<cup>/ shows
      const older = fx ? past : past.slice(1);      // the seasons with their own page
      const picker = (rel, onYear) => [
        { label: fx ? `${fx.season} (live)` : top.season, href: (rel || "./") + suffix, current: onYear == null },
        ...older.map((p) => ({ label: p.season, href: `${rel}${slug(p.year, c.country)}/${suffix}`, current: onYear === p.year }))
      ];
      const note = !fx ? (cup.until ? `The ${cup.name} ended after the ${top.season} season.` : `This season's ${cup.name} isn't covered yet; it appears here once the draw reaches the national rounds.`) : "";
      await write(`${c.country}/${cup.id}/index.html`, shell({
        title: `${cup.name} ${top.season}: bracket, draw and results | Football Pyramids`,
        description: `The ${cup.name} ${top.season} round by round: every tie and result, the bracket, and each club's league so the giant-killings stand out.`,
        canonical: `${SITE}/${c.country}/${cup.id}/`, base: "../../", suffix, page: fx ? "cup" : "cup-history", country: c.country, stamps: {}, countries,
        seasons: older.length ? picker("", null) : null,
        attrs: fx ? { league: cup.id, clubpaths: pathsForFx(top, c.country) } : {},
        main: FP.cupMain(cup, top, { tz: "venue", seasons: older.length ? picker("", null) : null, note, fxPaths: pathsForFx(top, c.country), root: "../../", suffix })
      }));
      cupUrls.push(`/${c.country}/${cup.id}/`);
      for (const p of older) {
        await write(`${c.country}/${cup.id}/${slug(p.year, c.country)}/index.html`, shell({
          title: `${cup.name} ${p.season}: bracket and results | Football Pyramids`,
          description: `The ${cup.name} ${p.season}: every round, every tie and the bracket, with each club's league that season.`,
          canonical: `${SITE}/${c.country}/${cup.id}/${slug(p.year, c.country)}/`, base: "../../../", suffix, page: "cup-history", country: c.country, stamps: {}, countries,
          seasons: picker("../", p.year),
          main: FP.cupMain(cup, p, { tz: "venue", seasons: picker("../", p.year), fxPaths: pathsForFx(p, c.country), root: "../../../", suffix })
        }));
        cupPastUrls.push(`/${c.country}/${cup.id}/${slug(p.year, c.country)}/`);
      }
    }
    // Fixtures pages, one per league and cup
    const cupsOf = (COUNTRIES.find((x) => x.country === c.country) || {}).cups || [];
    for (const lg of [...c.leagues, ...cupsOf]) {
      const fx = fixtures[`${c.country}/${lg.id}`];
      if (!fx) continue;
      if (fx.cup) {
        await write(`${c.country}/${lg.id}/fixtures/index.html`, redirectPage(`../${suffix}#fixtures`, `${SITE}/${c.country}/${lg.id}/`, fx.name));
        continue;
      }
      const back = fx.cup ? `../${suffix}` : `../../${suffix}#${lg.id}`;
      await write(`${c.country}/${lg.id}/fixtures/index.html`, shell({
        title: `${fx.name} fixtures and results ${fx.season} | Football Pyramids`,
        description: `Every ${fx.name} fixture and result for ${fx.season}, round by round, with kick-off times in your time zone, postponements and live scores.`,
        canonical: `${SITE}/${c.country}/${lg.id}/fixtures/`, base: "../../../", suffix, page: "fixtures", country: c.country,
        stamps: {}, countries, attrs: { league: lg.id, table: back },
        main: FP.fixturesMain(fx, { tz: "venue", tableHref: back, tableText: fx.cup ? `${fx.name} bracket` : null })
      }));
    }
    // Past seasons
    const liveYear = Number(String(c.season).slice(0, 4));
    for (const h of history[c.country]) {
      const next = h.year + 1 === liveYear ? c : history[c.country].find((x) => x.year === h.year + 1);
      labelCupPlaces(markOutcomes(applyPlayoffRules(h), next));
      markPostseasonChampions(c, h, "../");
      const n = tierNames(h);
      const seasons = seasonList(c, history[c.country], "../", suffix, h.year);
      await write(`${c.country}/${slug(h.year, c.country)}/index.html`, shell({
        title: `${c.system ? c.system.charAt(0).toUpperCase() + c.system.slice(1) : c.adjective + " football pyramid"} ${h.season}: ${n.first} to ${n.last} final tables | Football Pyramids`,
        description: `Final ${h.season} tables for ${c.adjective} football, from ${n.first} down to ${n.last}, with promotion and relegation marked.`,
        canonical: `${SITE}/${c.country}/${slug(h.year, c.country)}/`, base: "../../", suffix, page: "history", country: c.country,
        jsonld: crumbs([["Football Pyramids", SITE + "/"], [c.name, `${SITE}/${c.country}/`], [h.season, `${SITE}/${c.country}/${slug(h.year, c.country)}/`]]),
        stamps: {}, countries, main: FP.countryMain(Object.assign(h, { system: c.system, closed: c.closed }), { seasons, clubPaths: pathByName[c.country], root: "../../", suffix, cups: pastCupCards(c, h.year, "../") })
      }));
    }
  }

  // European competitions
  const euroPast = [];
  if (europe) {
    const euroPaths = Object.assign({}, ...europe.leagues.map(pathsFor));
    await write(`europe/index.html`, shell({
      title: `Champions League, Europa League and Conference League tables ${europe.season} | Football Pyramids`,
      description: "League-phase tables, knockout brackets, qualifying ties and fixtures for the Champions League, Europa League and Conference League, with live scores.",
      canonical: `${SITE}/europe/`, base: "../", suffix, page: "europe", country: "europe", stamps: { europe: europe.updated }, countries,
      attrs: { statuses, clubpaths: euroPaths },
      main: FP.europeMain(europe, { statuses, base: "", suffix, clubPaths: euroPaths, root: "../" })
    }));
    const euroHistory = await loadEuropeHistory(root);
    for (const comp of europe.leagues) {
      const fx = fixtures[`europe/${comp.id}`];
      const past = euroHistory[comp.id] || [];
      const seasonsNow = seasonList({ season: europe.season }, past, "", suffix, null);
      // Past seasons
      for (const h of past) {
        const sl = slug(h.year);
        const seasons = seasonList({ season: europe.season }, past, "../", suffix, h.year);
        await write(`europe/${comp.id}/${sl}/index.html`, shell({
          title: `${comp.name} ${h.season}: ${h.comp.groups ? "group stage" : "league phase"}, knockout bracket and results | Football Pyramids`,
          description: `The ${comp.name} ${h.season}: ${h.comp.groups ? "every group-stage table" : "the league-phase table"}, the full knockout bracket and every qualifying tie.`,
          canonical: `${SITE}/europe/${comp.id}/${sl}/`, base: "../../../", suffix, page: "comp-history", country: "europe", stamps: {}, countries, seasons,
          main: FP.compMain(h.comp, h.fx, { tz: "venue", seasons, clubPaths: { ...pathsForFx(h.fx), ...pathsFor(h.comp) }, root: "../../../", suffix })
        }));
        if (h.fx) await write(`europe/${comp.id}/${sl}/fixtures/index.html`,
          redirectPage(`../${suffix}#fixtures`, `${SITE}/europe/${comp.id}/${sl}/`, `${comp.name} ${h.season}`));
        euroPast.push(`/europe/${comp.id}/${sl}/`);
      }
      await write(`europe/${comp.id}/index.html`, shell({
        title: `${comp.name} ${europe.season}: table, knockout bracket and results | Football Pyramids`,
        description: `The ${comp.name} league-phase table, the knockout bracket as each draw is made, every qualifying tie and live scores.`,
        canonical: `${SITE}/europe/${comp.id}/`, base: "../../", suffix, page: "comp", country: "europe", stamps: { europe: europe.updated }, countries,
        seasons: seasonsNow, attrs: { league: comp.id, clubpaths: { ...pathsForFx(fx), ...pathsFor(comp) } },
        main: FP.compMain(comp, fx, { tz: "venue", seasons: seasonsNow, clubPaths: { ...pathsForFx(fx), ...pathsFor(comp) }, root: "../../", suffix })
      }));
      if (fx) await write(`europe/${comp.id}/fixtures/index.html`, redirectPage(`../${suffix}#fixtures`, `${SITE}/europe/${comp.id}/`, comp.name));
    }
  }

  // Club pages: one per club in the current tables, from data the site already has (no extra API requests).
  const clubUrls = [];
  const pastFinder = [];   // clubs only in past seasons, for the club finder
  {
    // Every fixture each club has, across its league, cups and Europe.
    const cfgOf = (cc, id) => {
      const owner = cc === "europe" ? EUROPE : COUNTRIES.find((x) => x.country === cc);
      return owner && [...owner.leagues, ...(owner.cups || [])].find((l) => l.id === id);
    };
    const games = new Map();
    for (const [key, fx] of Object.entries(fixtures)) {
      const [cc, id] = key.split("/");
      const cfg = cfgOf(cc, id) || {};
      const kind = cc === "europe" ? "europe" : fx.cup ? "cup" : "league";
      const comp = { key, kind, name: fx.name, short: cfg.short || fx.name,
        path: kind === "league" ? `${cc}/${id}/fixtures/` : `${cc}/${id}/` };
      for (const g of fx.groups) for (const r of g.rounds) for (const f of r.fixtures) {
        for (const [me, them, home] of [[f.h, f.a, true], [f.a, f.h, false]]) {
          if (!index.has(me.id)) continue;
          if (!games.has(me.id)) games.set(me.id, []);
          const { h, a, stage, moved, ...rest } = f;
          games.get(me.id).push({ ...rest, home, round: kind === "league" ? "" : r.label, comp, opp: { id: them.id, n: them.n, t: them.t, tier: them.tier } });
        }
      }
    }
    const base = "../../../";
    // Clubs per tier in one season (a tier split into groups counts one group), so a finishing
    // position can be placed on one ladder for the whole pyramid: 1-20 Premier League, 21-44 Championship...
    const sizesOf = (leagues) => {
      const out = [];
      for (const l of leagues) if (l.tier) out[l.tier - 1] = Math.max(out[l.tier - 1] || 0, ...FP.groupsOf(l).map((x) => x.rows.length));
      return Array.from(out, (n) => n || 0);
    };
    const rankIn = (sizes, tier, pos) => sizes.slice(0, tier - 1).reduce((a, n) => a + n, 0) + pos;
    // The ladder's divisions: every tier down to the last single national league, named as now.
    const laddersOf = (c) => {
      const out = [];
      for (const l of c.leagues.slice().sort((a, b) => a.tier - b.tier)) {
        if (out.some((x) => x.tier === l.tier)) continue;
        out.push({ tier: l.tier, name: l.name, short: l.short, split: FP.groupsOf(l).length > 1 || c.leagues.filter((x) => x.tier === l.tier).length > 1 });
      }
      return out;
    };
    // A club's past seasons. Rows are matched on API-Football's club ID where both sides have one (the newer
    // countries' history files carry it), otherwise on the name's slug, so spellings that differ only in accents,
    // case or punctuation ("1.FC Köln" / "1. FC Köln", "Besiktas" / "Beşiktaş") count as the same club. A row whose
    // ID differs is a different club, even with the same name.
    // Cup runs: every season of each of the country's cups (saved past ones plus this one), and how far the club got.
    const cupSeasons = {};
    for (const c of countries) for (const cup of (COUNTRIES.find((x) => x.country === c.country) || {}).cups || []) {
      const past = (cupHistory[c.country] || {})[cup.id] || [];
      const fx = fixtures[`${c.country}/${cup.id}`];
      const now = fx && fx.groups[0].rounds.length ? { ...summarise(fx.groups[0].rounds, { ...learnLabels(past), ...(cup.dist || {}) }), season: fx.season, now: true } : null;
      const list = [...past, ...(now ? [now] : [])];
      if (list.length) cupSeasons[`${c.country}/${cup.id}`] = { name: cup.name, href: fx ? `${base}${c.country}/${cup.id}/${suffix}` : null, list };
    }
    const cupRunsOf = (c, name, tid) => {
      const out = [], sl = FP.slug(name);
      for (const cup of (COUNTRIES.find((x) => x.country === c.country) || {}).cups || []) {
        const cs = cupSeasons[`${c.country}/${cup.id}`];
        if (!cs) continue;
        const runs = [];
        cs.list.forEach((s, i) => {
          const hit = (tid && s.clubs[tid]) || Object.values(s.clubs).find((x) => FP.slug(x[0]) === sl);
          if (!hit) return;
          const [, ri, res, opp, score] = hit;
          runs.push({ i, d: res === "W" ? -1 : s.dist[ri] == null ? 9 : s.dist[ri], round: s.rounds[ri], res, opp, score, now: !!s.now });
        });
        // All-time titles: the honours list up to its season, plus wins in our data after it.
        const ct = cupTitles[`${c.country}/${cup.id}`];
        // Lost finals the same way: the honours list's, plus any lost in our data after it (year the final was played).
        let titles = null, finals = null;
        if (ct) {
          const e = ct.titles.find((x) => (tid && x.tid ? x.tid === tid : FP.slug(x.n) === sl));
          const yearOf = (r) => Number(String(cs.list[r.i].year || cs.list[r.i].season).slice(0, 4));
          const after = runs.filter((r) => yearOf(r) > ct.through);
          titles = (e ? e.v : 0) + after.filter((r) => r.res === "W").length;
          const lostLater = after.filter((r) => r.res === "L" && r.d === 0).map((r) => yearOf(r) + 1);
          const lost = (e && e.lost ? e.lost : 0) + lostLater.length;
          finals = { lost, years: e && e.lostYears ? e.lostYears.concat(lostLater) : (!e || !e.lost ? lostLater : null),
            last: lostLater.length ? lostLater[lostLater.length - 1] : (e && (e.lastLost || (e.lostYears || []).slice(-1)[0])) || null };
        }
        // This season, while the cup is still going: a club not in it yet may simply not have entered yet (the
        // big clubs join in later rounds), so it doesn't count as missing the draw.
        const lastSeason = cs.list[cs.list.length - 1];
        const open = !!(lastSeason && lastSeason.now && !lastSeason.winner);
        if (runs.length || titles) out.push({ id: cup.id, name: cs.name, href: cs.href, seasons: cs.list.map((s) => s.season), runs, titles, finals, open });
      }
      return out;
    };
    // The division a club actually played in when a tier is split: "National League North" rather than
    // "National League North & South", "Serie C (Girone A)" rather than "Serie C".
    const divisionName = (lg, g) => {
      if (FP.groupsOf(lg).length < 2 || !g || !g.name) return lg.name;
      const both = lg.name.match(/^(.*?)\b(\w+) & (\w+)$/);
      if (both && (g.name === both[2] || g.name === both[3])) return both[1] + g.name;
      return `${lg.name} (${g.name})`;
    };
    const pastSeasons = (c, name, tid) => {
      const out = [];
      const sl = FP.slug(name);
      const same = (x) => (tid && x.tid ? x.tid === tid : FP.slug(x.team) === sl);
      for (const h of history[c.country] || []) {
        const sizes = sizesOf(h.leagues);
        found: for (const plg of h.leagues) {
          // A season split into a championship and a relegation round: the club's final place across both, not its
          // place within one (Volos were 1st of the 2020-21 relegation round: 7th in the Super League).
          const ph = FP.phases(plg);
          if (ph) {
            const pr = ph.base.rows.find(same);
            if (pr) {
              const pos = ph.pos(pr);
              out.push({ season: h.season, year: h.year, tier: plg.tier, league: plg.name, pos, of: ph.size, rank: rankIn(sizes, plg.tier, pos), sizes,
                href: `${base}${c.country}/${slug(h.year, c.country)}/${suffix}${plg.id ? "#" + plg.id : ""}` });
              break found;
            }
            continue;
          }
          for (const pg of FP.groupsOf(plg)) {
          const pr = pg.rows.find(same);
          if (pr) {
            out.push({ season: h.season, year: h.year, tier: plg.tier, league: divisionName(plg, pg), pos: pr.pos, of: pg.rows.length, rank: rankIn(sizes, plg.tier, pr.pos), sizes,
              href: `${base}${c.country}/${slug(h.year, c.country)}/${suffix}${plg.id ? "#" + plg.id : ""}` });
            break found;
          }
          }
        }
      }
      return out;
    };
    // Promotion and relegation, from the tier the club played in the following season. Only marked when that season
    // is on the site too, so a gap in the record (a club below the tiers covered) is never guessed at.
    // Which tiers each season's saved tables cover, per country (this season included): { country: { tier: Set(years) } }.
    const coverage = {};
    for (const c of countries) {
      const cov = coverage[c.country] = {};
      const add = (t, y) => (cov[t] ||= new Set()).add(y);
      for (const l of c.leagues) add(l.tier, Number(String(c.season).slice(0, 4)));
      for (const h of history[c.country] || []) for (const l of h.leagues) add(l.tier, h.year);
    }
    const label = (y, cc) => seasonLabel(y, COUNTRIES.find((x) => x.country === cc));
    // A line or two of context for the top of a club page, from its journey and nothing else: promoted or relegated
    // last season, first season back in a division since when, how many seasons in a row. Every statement is checked
    // against what the saved seasons actually cover, so a gap in our records is never read as a fact about the club
    // ("since our records begin" rather than "first ever").
    const contextOf = (c, journey) => {
      const now = journey[0];
      if (!now || !now.now) return [];
      const cov = coverage[c.country] || {}, has = (t, y) => !!(cov[t] && cov[t].has(y));
      const the = (n) => FP.inLeague(n).slice(3);          // "the Championship", "Serie C", "La Liga"
      const Y = now.year, T = now.tier, by = new Map(journey.map((x) => [x.year, x]));
      const prev = by.get(Y - 1);
      // Facts about the tier use the tier's league name, not this season's regional group ("Serie C", not
      // "Serie C (Girone A)"): clubs move between groups from year to year.
      const tierLg = (c.leagues.find((l) => l.tier === T) || {}).name || now.league;
      const out = [];
      // The club has just arrived in this tier: when was it last here, as far back as this tier is on record?
      const back = () => {
        for (let y = Y - 2; has(T, y); y--) {
          const x = by.get(y);
          if (x && x.tier === T) { const away = Y - y - 1; return `Back in ${the(tierLg)} after ${away === 1 ? "one season" : away + " seasons"} away`; }
        }
        let first = Y - 1; while (has(T, first - 1)) first--;
        return has(T, Y - 1) ? `First season in ${the(tierLg)} since our records begin in ${label(first, c.country)}` : "";
      };
      if (prev && prev.tier !== T) {
        out.push({ dir: prev.tier > T ? "up" : "down", text: `${prev.tier > T ? "Promoted" : "Relegated"} from ${the(prev.league)} last season` });
        const b = back(); if (b) out.push({ text: b });
      } else if (prev) {
        let k = 1;
        while (by.get(Y - k) && by.get(Y - k).tier === T) k++;
        // k seasons in a row. If the season before the run isn't on record for this tier, we only know "since then".
        out.push({ text: has(T, Y - k) ? `${ordinal(k)} season in a row in ${the(tierLg)}` : `In ${the(tierLg)} every season since our records begin in ${label(Y - k + 1, c.country)}` });
      } else {
        // Not on record last season, though this tier and every tier above it were: the club came up from below the
        // divisions covered here (or is new to the league system).
        let all = true; for (let t = 1; t <= T; t++) if (!has(t, Y - 1)) all = false;
        if (all) {
          out.push({ dir: "up", text: `New to ${the(tierLg)}: not in the divisions covered here last season` });
          const b = back(); if (b && b.indexOf("records begin") < 0) out.push({ text: b });
        }
      }
      return out;
    };
    const moves = (journey) => {
      const byYear = new Map(journey.map((x) => [x.year, x]));
      for (const x of journey) {
        const next = byYear.get(x.year + 1);
        if (!next || next.tier === x.tier) continue;
        x.move = next.tier < x.tier ? "up" : "down";
        x.to = next.league;
      }
      return journey;
    };
    const tableOf = (c, lg) => ({ id: lg.id, name: lg.name, zones: lg.zones });
    for (const [tid, k] of index) {
      const { c, lg, g, r } = k;
      const comps = {};
      const fx = (games.get(tid) || []).map((f) => {
        comps[f.comp.key] = { key: f.comp.key, kind: f.comp.kind, name: f.comp.name, short: f.comp.short, href: base + f.comp.path + suffix };
        const o = index.get(f.opp.id);
        // Opponents with a page on the site link to it (including clubs from other countries met in Europe).
        return { ...f, comp: f.comp.key, opp: { n: f.opp.n, t: f.opp.t, tier: f.opp.tier, s: o ? o.path : null } };
      }).sort((a, b) => a.ts - b.ts);
      // European league-phase tables: the club and the three places either side, for its Competitions tab.
      const euro = {};
      for (const k of Object.keys(comps)) {
        if (comps[k].kind !== "europe" || !europe) continue;
        const el = europe.leagues.find((l) => l.id === k.split("/")[1]);
        const eg = el && FP.groupsOf(el).find((x) => x.rows.some((y) => y.tid === tid));
        if (!eg) continue;
        const me = eg.rows.find((y) => y.tid === tid), i = eg.rows.indexOf(me);
        const from = Math.max(0, Math.min(i - 3, eg.rows.length - 7)), part = eg.rows.slice(from, from + 7);
        euro[k] = { id: el.id, name: el.name, zones: el.zones, of: eg.rows.length, pos: me.pos, pts: me.pts, rows: part,
          paths: Object.fromEntries(part.filter((y) => pathByTid[y.tid]).map((y) => [y.tid, pathByTid[y.tid]])) };
      }
      // Pyramid journey: this season, then each saved past season (matched by name).
      const sizesNow = sizesOf(c.leagues);
      // This season too: once a league splits into rounds, its place across them.
      const phNow = FP.phases(lg), posNow = (phNow && phNow.pos(r)) || r.pos;
      const journey = moves([{ season: c.season, year: Number(String(c.season).slice(0, 4)), tier: lg.tier, league: phNow ? lg.name : divisionName(lg, g), pos: posNow,
        of: phNow ? phNow.size : g.rows.length, rank: rankIn(sizesNow, lg.tier, posNow), sizes: sizesNow, now: true }, ...pastSeasons(c, r.team, tid)]);
      const data = {
        tid, name: r.team, country: c.country, countryName: c.name, adjective: c.adjective, system: c.system || null, season: c.season, comps, root: base, suffix,
        pos: r.pos, pts: r.pts, p: r.p,
        league: { ...tableOf(c, lg), short: lg.short, group: FP.groupsOf(lg).length > 1 ? g.name : null, rows: g.rows,
          tableHref: `${base}${c.country}/${suffix}#${lg.id}`, _club: `${base}${c.country}/club/`, _suffix: suffix },
        fx, journey, ladder: laddersOf(c), euro, cupRuns: cupRunsOf(c, r.team, tid), context: contextOf(c, journey)
      };
      await write(`${k.path}index.html`, shell({
        title: `${r.team} fixtures, results and table ${c.season} | Football Pyramids`,
        description: `${r.team}: ${ordinal(r.pos)} ${FP.inLeague(lg.name)}. Every fixture and result this season across league, cups and Europe, and the club's journey through the ${c.adjective} pyramid.`,
        canonical: `${SITE}/${k.path}`, base, suffix, page: "club", country: c.country, stamps: {}, countries,
        jsonld: [crumbs([["Football Pyramids", SITE + "/"], [c.name, `${SITE}/${c.country}/`], [r.team, `${SITE}/${k.path}`]]),
          { "@context": "https://schema.org", "@type": "SportsTeam", name: r.team, sport: "Soccer", url: `${SITE}/${k.path}`,
            memberOf: { "@type": "SportsOrganization", name: lg.name } }],
        main: FP.clubMain(data, { tz: "venue" })
      }));
      clubUrls.push(`/${k.path}`);
    }
    // Clubs only in past seasons: their journey through the pyramid and when they were last seen.
    for (const k of pastOnly) {
      const journey = moves(pastSeasons(k.c, k.name));
      if (!journey.length) continue;
      const last = journey[0];
      const data = { tid: null, name: k.name, country: k.c.country, countryName: k.c.name, adjective: k.c.adjective, system: k.c.system || null, season: k.c.season, comps: {}, root: base, suffix,
        league: null, fx: [], journey, ladder: laddersOf(k.c), cupRuns: cupRunsOf(k.c, k.name, null),
        note: `Not in the ${k.c.adjective} leagues covered here this season. Last seen in ${last.season}: ${last.league}, ${ordinal(last.pos)}.` };
      await write(`${k.path}index.html`, shell({
        title: `${k.name}: seasons in the ${k.c.adjective} football pyramid | Football Pyramids`,
        description: `${k.name}'s seasons in the ${k.c.adjective} football pyramid: tier, league and finishing position each season.`,
        canonical: `${SITE}/${k.path}`, base, suffix, page: "club", country: k.c.country, stamps: {}, countries,
        jsonld: [crumbs([["Football Pyramids", SITE + "/"], [k.c.name, `${SITE}/${k.c.country}/`], [k.name, `${SITE}/${k.path}`]]),
          { "@context": "https://schema.org", "@type": "SportsTeam", name: k.name, sport: "Soccer", url: `${SITE}/${k.path}` }],
        main: FP.clubMain(data, { tz: "venue" })
      }));
      clubUrls.push(`/${k.path}`);
      pastFinder.push({ team: k.name, country: k.c.country, countryName: k.c.name, league: last.league, tier: last.tier, past: last.season, path: k.path });
    }
  }

  // Club pages from earlier builds that this build no longer writes (a club renamed in the data, or a past season
  // dropped by `historyFrom`) would otherwise stay online with stale content and no links to them.
  if (!preview) {
    const keep = new Set(clubUrls.map((u) => u.slice(1)));
    for (const c of countries) {
      let dirs = [];
      try { dirs = await readdir(path.join(outDir, c.country, "club"), { withFileTypes: true }); } catch {}
      for (const d of dirs) {
        const rel = `${c.country}/club/${d.name}/`;
        if (d.isDirectory() && !keep.has(rel)) await rm(path.join(outDir, rel), { recursive: true, force: true });
      }
    }
  }

  // About & contact, and the privacy policy
  const snapshot = countries.some((c) => c.mode !== "live");
  await write(`contact/index.html`, shell({
    title: "About Football Pyramids: coverage, data and contact",
    description: "Why Football Pyramids exists, which countries and tiers it covers, where the tables come from, how often they update and how to report a mistake.",
    canonical: `${SITE}/contact/`, base: "../", suffix, page: "static", stamps: {}, countries,
    main: contactPage({ contact: CONTACT, snapshot, europe: europe ? europe.leagues.map((l) => l.name) : [],
      countries: countries.map((c) => {
        const t = tierNames(c), oldest = (history[c.country] || []).slice(-1)[0];
        return { name: c.name, first: t.first, last: t.last, tiers: new Set(c.leagues.map((l) => l.tier)).size, since: oldest ? oldest.season : null };
      }) })
  }));
  await write(`privacy/index.html`, shell({
    title: "Privacy policy | Football Pyramids",
    description: "How Football Pyramids handles data, cookies and advertising.",
    canonical: `${SITE}/privacy/`, base: "../", suffix, page: "static", stamps: {}, countries,
    main: privacyPage({ contact: CONTACT })
  }));

  // Club index retained for compatibility, plus a unified search index for clubs and leagues.
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
  await write("data/search.json", JSON.stringify(search));

  // For the live-scores worker: which API-Football league IDs belong to which table on the site.
  // `s` is a league's own season where it differs from everyone else's: calendar-year leagues (Brazil, the USA,
  // Australia's NPLs…), whose games today always belong to this year's season.
  const live = { season: Number(String(countries[0].season).slice(0, 4)), leagues: {} };
  for (const c of [...COUNTRIES, EUROPE]) for (const lg of [...c.leagues, ...(c.cups || []).filter((x) => !x.until)]) {
    const own = c.calendar || lg.calendar ? seasonFor({ calendar: true }) : null;
    for (const g of lg.groups || [{ apiId: lg.apiId }]) {
      // A cup that's a stage of a league (the MLS playoffs, league 253) shares its ID: the league keeps it.
      if (lg.only && live.leagues[g.apiId]) continue;
      live.leagues[g.apiId] = { c: c.country, l: lg.id, ...(g.name ? { g: g.name } : {}), ...(own && own !== live.season ? { s: own } : {}) };
    }
  }
  await write("data/live-leagues.json", JSON.stringify(live));

  if (!preview) {
    // lastmod is the date the page's data last changed (not the build date, which moves every hour whether or not
    // anything did), so search engines can trust it. Pages with no data date (About, past seasons) carry none.
    const day = (iso) => (iso ? String(iso).slice(0, 10) : "");
    const dated = (u, iso, freq) => `  <url><loc>${SITE}${u}</loc>${day(iso) ? `<lastmod>${day(iso)}</lastmod>` : ""}<changefreq>${freq}</changefreq></url>`;
    const countryDate = Object.fromEntries(countries.map((c) => [c.country, c.updated]));
    const newestOf = (...xs) => xs.filter(Boolean).map(String).sort().pop();
    const fxDate = (k) => (fixtures[k] || {}).updated;
    const urls = [["/", newestOf(...countries.map((c) => c.updated))], ...countries.map((c) => [`/${c.country}/`, c.updated]),
      ...(europe ? [["/europe/", europe.updated], ...europe.leagues.map((c) => [`/europe/${c.id}/`, newestOf(europe.updated, fxDate(`europe/${c.id}`))])] : []),
      ["/contact/", null], ["/privacy/", null]];
    const past = countries.flatMap((c) => history[c.country].map((h) => `/${c.country}/${slug(h.year, c.country)}/`));
    const fxKeys = Object.keys(fixtures).filter((k) => (europe && k.startsWith("europe/")) || countries.some((c) => c.country === k.split("/")[0]));
    // Only league fixtures have their own page; cups and European competitions show fixtures in a tab.
    const fxPages = fxKeys.filter((k) => !k.startsWith("europe/") && !fixtures[k].cup);
    // A club page changes with its country's tables and its fixtures; the country date is the honest lower bound.
    const clubDate = (u) => newestOf(countryDate[u.split("/")[1]], ...fxKeys.filter((k) => k.startsWith(u.split("/")[1] + "/")).map(fxDate));
    await write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, d]) => dated(u, d, "hourly")).join("\n")}
${clubUrls.map((u) => dated(u, clubDate(u), "daily")).join("\n")}
${cupUrls.map((u) => dated(u, fxDate(u.slice(1, -1)), "daily")).join("\n")}
${racesUrls.map((u) => dated(u, countryDate[u.split("/")[1]], "daily")).join("\n")}
${fxPages.map((k) => dated(`/${k}/fixtures/`, fxDate(k), "daily")).join("\n")}
${past.concat(euroPast, cupPastUrls).map((u) => `  <url><loc>${SITE}${u}</loc><changefreq>yearly</changefreq></url>`).join("\n")}
</urlset>
`);
    await write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);
    if (ADSENSE_CLIENT) await write("ads.txt", `google.com, ${ADSENSE_CLIENT.replace("ca-", "")}, DIRECT, f08c47fec0942fa0\n`);
  } else {
    // The preview needs its own copy of the assets and data.
    const fonts = ["big-shoulders-display-latin-700-normal", "big-shoulders-display-latin-800-normal", "ibm-plex-sans-latin-400-normal",
      "ibm-plex-sans-latin-500-normal", "ibm-plex-sans-latin-600-normal", "ibm-plex-sans-latin-700-normal", "ibm-plex-mono-latin-500-normal"]
      .map((f) => `assets/fonts/${f}.woff2`);
    for (const rel of ["assets/style.css", "assets/render.js", "assets/app.js", ...fonts, ...countries.map((c) => `data/${c.country}.json`)]) {
      await mkdir(path.dirname(path.join(outDir, rel)), { recursive: true });
      await copyFile(path.join(root, rel), path.join(outDir, rel));
    }
  }
  // Club-page extras added after the main pages are written: pyramid route links, cups in search, what's at stake,
  // stadium and achievements, European runs, and the combined Runs chart. They run here, on every build, in this
  // order, so `node scripts/build.mjs` always produces the whole site (each step reads the pages just written, so
  // running the build again gives the same result). No football-data API calls.
  if (!preview) {
    for (const step of ["add-club-routes", "add-cups-to-search", "add-club-stakes", "add-club-profile", "add-club-europe", "unify-club-runs"]) {
      execFileSync(process.execPath, [path.join(ROOT, "scripts", `${step}.mjs`)], { cwd: outDir, stdio: ["ignore", "inherit", "inherit"] });
    }
  }
  return written;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const pi = args.indexOf("--preview");
  const opts = pi > -1 ? { outDir: path.resolve(args[pi + 1]), preview: true } : {};
  build(opts).then((files) => console.log(`Built ${files.length} files: ${files.join(", ")}`))
    .catch((err) => { console.error(`Build failed: ${err.message}`); process.exit(1); });
}
