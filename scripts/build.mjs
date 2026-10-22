#!/usr/bin/env node
// Football Pyramids: writes the website's pages from the data files.
//
//   node scripts/build.mjs                 builds into the project folder (what goes live)
//   node scripts/build.mjs --preview DIR   builds a copy with explicit index.html links, for opening offline
//
// Output: index.html, <country>/index.html, data/clubs.json, sitemap.xml, robots.txt

import { readFile, writeFile, mkdir, copyFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { COUNTRIES, EUROPE, SITE, CONTACT, ADS, ADSENSE_CLIENT, LIVE_URL } from "./leagues.mjs";
import { zoneAt, applyPlayoffRules, labelCupPlaces } from "./zones.mjs";
import { regroupEurope } from "./rounds.mjs";
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

function shell({ title, description, canonical, base, suffix, page, country, stamps, main, countries, seasons, attrs = {} }) {
  const snapshot = countries.some((c) => c.mode !== "live");
  const home = base || "./";
  const homeHref = suffix ? base + suffix : home;
  const link = (c) => `<a href="${base}${c.country}/${suffix}"${c.country === country ? ' aria-current="page"' : ""}>` +
    `<span class="short">${c.code || c.name.slice(0, 3).toUpperCase()}</span><span class="long">${esc(c.name)}</span></a>`;
  const featured = countries.filter((c) => c.featured), others = countries.filter((c) => !c.featured);
  const here = others.find((c) => c.country === country);
  // Europe: a menu like "More", with the overview and each competition.
  const euroHere = country === "europe" ? (EUROPE.leagues.find((l) => String(canonical || "").includes(`/europe/${l.id}/`)) || {}).id || "hub" : null;
  const euro = HAS_EUROPE ? `<details class="nav-more nav-euro${euroHere ? " is-here" : ""}"><summary aria-label="European competitions"><span class="short">EUR</span><span class="long">Europe</span></summary>` +
    `<div class="nav-panel"><a href="${base}europe/${suffix}"${euroHere === "hub" ? ' aria-current="page"' : ""}>${FP.flag("europe")}All competitions</a>` +
    EUROPE.leagues.map((l) => `<a href="${base}europe/${l.id}/${suffix}"${euroHere === l.id ? ' aria-current="page"' : ""}><span class="comp-dot c-${l.id}" aria-hidden="true"></span>${esc(l.name)}</a>`).join("") +
    `</div></details>` : "";
  const nav = featured.map(link).join("") + euro + (here ? link(here) : "") + (others.length
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
<link rel="preload" href="${base}assets/fonts/big-shoulders-display-latin-800-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${base}assets/fonts/ibm-plex-sans-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${base}assets/style.css?v=${VER["style.css"]}">
${ADSENSE_CLIENT && !suffix ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>\n` : ""}</head>
<body${ADS ? "" : ' class="no-ads"'} data-page="${page}" data-base="${base}" data-index="${suffix}"${country ? ` data-country="${country}"` : ""} data-countries="${featured.map((c) => c.country).join(",")}"${page === "home" ? ` data-others="${esc(JSON.stringify(others.map(FP.summary)))}"` : ""} data-stamps="${esc(JSON.stringify(stamps))}"${seasons ? ` data-seasons="${esc(JSON.stringify(seasons))}"` : ""}${LIVE_URL && ["home", "country", "fixtures", "europe", "comp", "cup", "club"].includes(page) ? ` data-live="${esc(LIVE_URL)}"` : ""}${Object.entries(attrs).map(([k, v]) => ` data-${k}="${esc(typeof v === "string" ? v : JSON.stringify(v))}"`).join("")}>
<header class="bar">
  <div class="bar-inner">
    <a class="brand" href="${homeHref}" aria-label="Football Pyramids, home">
      <span class="glyph" aria-hidden="true"><i></i><i></i><i></i></span>
      <span class="brand-text" aria-hidden="true"><small>Football</small><span>Pyramids</span></span>
    </a>
    <nav class="nav" aria-label="Countries">${nav}</nav>
    <div class="finder">
      <label class="sr-only" for="club-find">Find a club</label>
      <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>
      <input id="club-find" type="search" list="club-list" placeholder="Find a club" autocomplete="off" enterkeyhint="search">
      <datalist id="club-list"></datalist>
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
      <p>Football Pyramids is an independent site and is not affiliated with any league, federation or club.</p>
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
    out.push(Object.assign(d, { featured: !!cfg.featured, code: cfg.code }));
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
export async function loadFixtures(root = ROOT) {
  const out = {};
  for (const cfg of [...COUNTRIES, EUROPE]) for (const lg of [...cfg.leagues, ...(cfg.cups || [])]) {
    try {
      const fx = JSON.parse(await readFile(path.join(root, "data", "fixtures", cfg.country, `${lg.id}.json`), "utf8"));
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
const slug = (year) => `${year}-${String((year + 1) % 100).padStart(2, "0")}`;

// The "Other seasons" list. rel is the path from the page to the country folder ("" or "../").
function seasonList(current, past, rel, suffix, onYear) {
  if (!past.length) return null;
  return [
    { label: `${current.season} (live)`, href: (rel || "./") + suffix, current: onYear == null },
    ...past.map((h) => ({ label: h.season, href: `${rel}${slug(h.year)}/${suffix}`, current: onYear === h.year }))
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
  const fixtures = await loadFixtures(root);
  const cupUrls = [];
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
  // Cards for a country's cups (status from the fixtures), with links relative to the country page.
  const cupCards = (c, rel) => ((COUNTRIES.find((x) => x.country === c.country) || {}).cups || [])
    .filter((cup) => fixtures[`${c.country}/${cup.id}`])
    .map((cup) => {
      const fx = fixtures[`${c.country}/${cup.id}`];
      return { id: cup.id, name: cup.name, status: FP.cupStatus(fx), span: FP.cupSpan(fx), href: `${rel}${cup.id}/${suffix}` };
    });
  let europe = null;
  try { europe = JSON.parse(await readFile(path.join(root, "data", "europe.json"), "utf8")); } catch {}
  HAS_EUROPE = !!europe;
  const statuses = europe ? Object.fromEntries(europe.leagues.map((c) => [c.id, FP.compStatus(c, fixtures[`europe/${c.id}`])])) : {};
  const euroSummary = europe ? FP.summary(europe) : null;
  // Links from tables to fixtures pages, relative to the home page or a country page.
  const fxLinks = (fromHome) => Object.fromEntries(Object.keys(fixtures).map((k) => {
    const [c, l] = k.split("/");
    return [k, (fromHome ? `${c}/` : "") + `${l}/fixtures/${suffix}`];
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

  // Home
  await write("index.html", shell({
    title: "Football Pyramids: league tables from the top flight down",
    description: `League tables for ${countries.length} countries (${countries.map((c) => c.name).join(", ")}), each country's divisions on one page with promotion and relegation places marked. Fixtures, past seasons and live scores.`,
    canonical: SITE + "/", base: "", suffix, page: "home", stamps, countries,
    attrs: { fixtures: { ...fxLinks(true), ...(europe ? { "europe/champions-league": `europe/champions-league/fixtures/${suffix}` } : {}) },
      ...(europe ? { europe: "1", clubpaths: pathsFor(europe.leagues[0]) } : {}), cupsmap: Object.fromEntries(countries.map((c) => [c.country, cupCards(c, `${c.country}/`)])) },
    main: FP.homeMain(countries.filter((c) => c.featured), "", suffix, countries.filter((c) => !c.featured).map(FP.summary),
      { fixtures: { ...fxLinks(true), ...(europe ? { "europe/champions-league": `europe/champions-league/fixtures/${suffix}` } : {}) }, europe,
        cups: Object.fromEntries(countries.map((c) => [c.country, cupCards(c, `${c.country}/`)])), clubPaths: europe ? pathsFor(europe.leagues[0]) : null })
  }));

  // Country pages
  for (const c of countries) {
    const { first, last } = tierNames(c);
    await write(`${c.country}/index.html`, shell({
      title: `${c.adjective} football pyramid: ${first} to ${last} tables | Football Pyramids`,
      description: `Every ${c.adjective} league table from ${first} down to ${last} on one page, with promotion and relegation places marked.`,
      canonical: `${SITE}/${c.country}/`, base: "../", suffix, page: "country", country: c.country,
      stamps: { [c.country]: c.updated }, countries, seasons: seasonList(c, history[c.country], "", suffix, null),
      attrs: { fixtures: fxLinks(false), cups: cupCards(c, "") },
      main: FP.countryMain(c, { seasons: seasonList(c, history[c.country], "", suffix, null), fixtures: fxLinks(false), cups: cupCards(c, "") })
    }));
    // Cup pages
    for (const cup of (COUNTRIES.find((x) => x.country === c.country) || {}).cups || []) {
      const fx = fixtures[`${c.country}/${cup.id}`];
      if (!fx) continue;
      await write(`${c.country}/${cup.id}/index.html`, shell({
        title: `${cup.name} ${fx.season}: bracket, draw and results | Football Pyramids`,
        description: `The ${cup.name} ${fx.season} round by round: every tie and result, the bracket from the last 16, and each club's league so the giant-killings stand out.`,
        canonical: `${SITE}/${c.country}/${cup.id}/`, base: "../../", suffix, page: "cup", country: c.country, stamps: {}, countries,
        attrs: { league: cup.id, fx: `fixtures/${suffix}` },
        main: FP.cupMain(cup, fx, { tz: "venue", fixturesHref: `fixtures/${suffix}` })
      }));
      cupUrls.push(`/${c.country}/${cup.id}/`);
    }
    // Fixtures pages, one per league and cup
    const cupsOf = (COUNTRIES.find((x) => x.country === c.country) || {}).cups || [];
    for (const lg of [...c.leagues, ...cupsOf]) {
      const fx = fixtures[`${c.country}/${lg.id}`];
      if (!fx) continue;
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
      const n = tierNames(h);
      const seasons = seasonList(c, history[c.country], "../", suffix, h.year);
      await write(`${c.country}/${slug(h.year)}/index.html`, shell({
        title: `${c.adjective} football pyramid ${h.season}: ${n.first} to ${n.last} final tables | Football Pyramids`,
        description: `Final ${h.season} tables for ${c.adjective} football, from ${n.first} down to ${n.last}, with promotion and relegation marked.`,
        canonical: `${SITE}/${c.country}/${slug(h.year)}/`, base: "../../", suffix, page: "history", country: c.country,
        stamps: {}, countries, main: FP.countryMain(h, { seasons, clubPaths: pathByName[c.country], root: "../../", suffix })
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
          main: FP.compMain(h.comp, h.fx, { tz: "venue", seasons, fixturesHref: h.fx ? `fixtures/${suffix}` : "", clubPaths: pathsFor(h.comp), root: "../../../", suffix })
        }));
        if (h.fx) await write(`europe/${comp.id}/${sl}/fixtures/index.html`, shell({
          title: `${comp.name} fixtures and results ${h.season} | Football Pyramids`,
          description: `Every ${comp.name} fixture and result from ${h.season}, from qualifying to the final.`,
          canonical: `${SITE}/europe/${comp.id}/${sl}/fixtures/`, base: "../../../../", suffix, page: "fixtures", country: "europe", stamps: {}, countries,
          attrs: { league: comp.id, table: `../${suffix}`, fxfile: `data/history/europe/${comp.id}/${h.year}-fixtures.json` },
          main: FP.fixturesMain(h.fx, { tz: "venue", tableHref: `../${suffix}`, tableText: `${comp.name} ${h.season}` })
        }));
        euroPast.push(`/europe/${comp.id}/${sl}/`);
      }
      await write(`europe/${comp.id}/index.html`, shell({
        title: `${comp.name} ${europe.season}: table, knockout bracket and results | Football Pyramids`,
        description: `The ${comp.name} league-phase table, the knockout bracket as each draw is made, every qualifying tie and live scores.`,
        canonical: `${SITE}/europe/${comp.id}/`, base: "../../", suffix, page: "comp", country: "europe", stamps: { europe: europe.updated }, countries,
        seasons: seasonsNow, attrs: { league: comp.id, fx: fx ? `fixtures/${suffix}` : "", clubpaths: pathsFor(comp) },
        main: FP.compMain(comp, fx, { tz: "venue", fixturesHref: fx ? `fixtures/${suffix}` : "", seasons: seasonsNow, clubPaths: pathsFor(comp), root: "../../", suffix })
      }));
      if (fx) await write(`europe/${comp.id}/fixtures/index.html`, shell({
        title: `${comp.name} fixtures and results ${fx.season} | Football Pyramids`,
        description: `Every ${comp.name} fixture and result for ${fx.season}, from qualifying to the final, with kick-off times in your time zone and live scores.`,
        canonical: `${SITE}/europe/${comp.id}/fixtures/`, base: "../../../", suffix, page: "fixtures", country: "europe", stamps: {}, countries,
        attrs: { league: comp.id, table: `../${suffix}` },
        main: FP.fixturesMain(fx, { tz: "venue", tableHref: `../${suffix}`, tableText: `${comp.name} table and bracket` })
      }));
    }
  }

  // Club pages: one per club in the current tables, from data the site already has (no extra API requests).
  const clubUrls = [];
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
    const pastSeasons = (c, name) => {
      const out = [];
      for (const h of history[c.country] || []) {
        const sizes = sizesOf(h.leagues);
        found: for (const plg of h.leagues) for (const pg of FP.groupsOf(plg)) {
          const pr = pg.rows.find((x) => x.team === name);
          if (pr) {
            out.push({ season: h.season, tier: plg.tier, league: plg.name, pos: pr.pos, of: pg.rows.length, rank: rankIn(sizes, plg.tier, pr.pos), sizes,
              href: `${base}${c.country}/${slug(h.year)}/${suffix}${plg.id ? "#" + plg.id : ""}` });
            break found;
          }
        }
      }
      return out;
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
      const journey = [{ season: c.season, tier: lg.tier, league: lg.name, pos: r.pos, of: g.rows.length, rank: rankIn(sizesNow, lg.tier, r.pos), sizes: sizesNow, now: true },
        ...pastSeasons(c, r.team)];
      const data = {
        tid, name: r.team, country: c.country, countryName: c.name, season: c.season, comps, root: base, suffix,
        pos: r.pos, pts: r.pts, p: r.p,
        league: { ...tableOf(c, lg), short: lg.short, group: FP.groupsOf(lg).length > 1 ? g.name : null, rows: g.rows,
          tableHref: `${base}${c.country}/${suffix}#${lg.id}`, _club: `${base}${c.country}/club/`, _suffix: suffix },
        fx, journey, ladder: laddersOf(c), euro
      };
      await write(`${k.path}index.html`, shell({
        title: `${r.team} fixtures, results and table ${c.season} | Football Pyramids`,
        description: `${r.team}: ${ordinal(r.pos)} ${FP.inLeague(lg.name)}. Every fixture and result this season across league, cups and Europe, and the club's journey through the ${c.adjective} pyramid.`,
        canonical: `${SITE}/${k.path}`, base, suffix, page: "club", country: c.country, stamps: {}, countries,
        main: FP.clubMain(data, { tz: "venue" })
      }));
      clubUrls.push(`/${k.path}`);
    }
    // Clubs only in past seasons: their journey through the pyramid and when they were last seen.
    for (const k of pastOnly) {
      const journey = pastSeasons(k.c, k.name);
      if (!journey.length) continue;
      const last = journey[0];
      const data = { tid: null, name: k.name, country: k.c.country, countryName: k.c.name, season: k.c.season, comps: {}, root: base, suffix,
        league: null, fx: [], journey, ladder: laddersOf(k.c),
        note: `Not in the ${k.c.adjective} leagues covered here this season. Last seen in ${last.season}: ${last.league}, ${ordinal(last.pos)}.` };
      await write(`${k.path}index.html`, shell({
        title: `${k.name}: seasons in the ${k.c.adjective} football pyramid | Football Pyramids`,
        description: `${k.name}'s seasons in the ${k.c.adjective} football pyramid: tier, league and finishing position each season.`,
        canonical: `${SITE}/${k.path}`, base, suffix, page: "club", country: k.c.country, stamps: {}, countries,
        main: FP.clubMain(data, { tz: "venue" })
      }));
      clubUrls.push(`/${k.path}`);
    }
  }

  // About & contact, and the privacy policy
  const snapshot = countries.some((c) => c.mode !== "live");
  await write(`contact/index.html`, shell({
    title: "About and contact | Football Pyramids",
    description: "What Football Pyramids covers, where its tables come from, and how to get in touch.",
    canonical: `${SITE}/contact/`, base: "../", suffix, page: "static", stamps: {}, countries,
    main: contactPage({ contact: CONTACT, snapshot, countryNames: countries.map((c) => c.name) })
  }));
  await write(`privacy/index.html`, shell({
    title: "Privacy policy | Football Pyramids",
    description: "How Football Pyramids handles data, cookies and advertising.",
    canonical: `${SITE}/privacy/`, base: "../", suffix, page: "static", stamps: {}, countries,
    main: privacyPage({ contact: CONTACT })
  }));

  // Club index for the finder
  const clubs = [];
  for (const c of countries) {
    for (const lg of c.leagues) {
      for (const g of FP.groupsOf(lg)) {
        for (const r of g.rows) clubs.push({ team: r.team, country: c.country, countryName: c.name, league: lg.name,
          ...(clubUrls.includes(`/${c.country}/club/${FP.slug(r.team)}/`) ? { path: `${c.country}/club/${FP.slug(r.team)}/` } : {}) });
      }
    }
  }
  clubs.sort((a, b) => a.team.localeCompare(b.team));
  await write("data/clubs.json", JSON.stringify(clubs));

  // For the live-scores worker: which API-Football league IDs belong to which table on the site.
  const live = { season: Number(String(countries[0].season).slice(0, 4)), leagues: {} };
  for (const c of [...COUNTRIES, EUROPE]) for (const lg of [...c.leagues, ...(c.cups || [])]) {
    for (const g of lg.groups || [{ apiId: lg.apiId }]) live.leagues[g.apiId] = { c: c.country, l: lg.id, ...(g.name ? { g: g.name } : {}) };
  }
  await write("data/live-leagues.json", JSON.stringify(live));

  if (!preview) {
    const today = new Date().toISOString().slice(0, 10);
    const urls = ["/", ...countries.map((c) => `/${c.country}/`), ...(europe ? ["/europe/", ...europe.leagues.map((c) => `/europe/${c.id}/`)] : []), "/contact/", "/privacy/"];
    const past = countries.flatMap((c) => history[c.country].map((h) => `/${c.country}/${slug(h.year)}/`));
    const fxUrls = Object.keys(fixtures).filter((k) => (europe && k.startsWith("europe/")) || countries.some((c) => c.country === k.split("/")[0])).map((k) => `/${k}/fixtures/`);
    await write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod><changefreq>hourly</changefreq></url>`).join("\n")}
${clubUrls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq></url>`).join("\n")}
${cupUrls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq></url>`).join("\n")}
${fxUrls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq></url>`).join("\n")}
${past.concat(euroPast).map((u) => `  <url><loc>${SITE}${u}</loc><changefreq>yearly</changefreq></url>`).join("\n")}
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
  return written;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const pi = args.indexOf("--preview");
  const opts = pi > -1 ? { outDir: path.resolve(args[pi + 1]), preview: true } : {};
  build(opts).then((files) => console.log(`Built ${files.length} files: ${files.join(", ")}`))
    .catch((err) => { console.error(`Build failed: ${err.message}`); process.exit(1); });
}
