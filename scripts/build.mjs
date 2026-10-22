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
import { COUNTRIES, EUROPE, SITE, CONTACT, ADS, ADSENSE_CLIENT, LIVE_URL } from "./leagues.mjs";
import { zoneAt, applyPlayoffRules, labelCupPlaces } from "./zones.mjs";
export { applyPlayoffRules, labelCupPlaces };
import { contactPage, privacyPage } from "./pages.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const FP = require(path.join(ROOT, "assets/render.js"));

const FAVICON = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#121B2A"/>' +
  '<rect x="12" y="7" width="8" height="4" rx="1" fill="#8EA2FF"/><rect x="8" y="14" width="16" height="4" rx="1" fill="#8EA2FF"/>' +
  '<rect x="4" y="21" width="24" height="4" rx="1" fill="#8EA2FF"/></svg>');

const esc = FP.esc;

let HAS_EUROPE = false;   // set by build() once the European tables exist

function shell({ title, description, canonical, base, suffix, page, country, stamps, main, countries, seasons, attrs = {} }) {
  const snapshot = countries.some((c) => c.mode !== "live");
  const home = base || "./";
  const homeHref = suffix ? base + suffix : home;
  const link = (c) => `<a href="${base}${c.country}/${suffix}"${c.country === country ? ' aria-current="page"' : ""}>` +
    `<span class="short">${c.code || c.name.slice(0, 3).toUpperCase()}</span><span class="long">${esc(c.name)}</span></a>`;
  const featured = countries.filter((c) => c.featured), others = countries.filter((c) => !c.featured);
  const here = others.find((c) => c.country === country);
  const euro = HAS_EUROPE ? `<a href="${base}europe/${suffix}"${country === "europe" ? ' aria-current="page"' : ""}><span class="short">EUR</span><span class="long">Europe</span></a>` : "";
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
<meta property="og:image:alt" content="Football Pyramids: every league table from the top flight down, on one page.">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${FAVICON}">
<link rel="preload" href="${base}assets/fonts/big-shoulders-display-latin-800-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${base}assets/fonts/ibm-plex-sans-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${base}assets/style.css">
${ADSENSE_CLIENT && !suffix ? `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}" crossorigin="anonymous"></script>\n` : ""}</head>
<body${ADS ? "" : ' class="no-ads"'} data-page="${page}" data-base="${base}" data-index="${suffix}"${country ? ` data-country="${country}"` : ""} data-countries="${featured.map((c) => c.country).join(",")}"${page === "home" ? ` data-others="${esc(JSON.stringify(others.map(FP.summary)))}"` : ""} data-stamps="${esc(JSON.stringify(stamps))}"${seasons ? ` data-seasons="${esc(JSON.stringify(seasons))}"` : ""}${LIVE_URL && (page === "home" || page === "country" || page === "fixtures") ? ` data-live="${esc(LIVE_URL)}"` : ""}${Object.entries(attrs).map(([k, v]) => ` data-${k}="${esc(typeof v === "string" ? v : JSON.stringify(v))}"`).join("")}>
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
      ${snapshot ? "<p>These are sample standings gathered by hand, and each table shows the date it is from. Live updates start once the data feed is connected.</p>" : "<p>Tables update through the day as results come in.</p>"}
      <p>Clubs are ranked by points, then by each league's own tie-break rules. Times are UK time.</p>
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
<script src="${base}assets/render.js"></script>
<script src="${base}assets/app.js"></script>
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
    for (const f of files) list.push(JSON.parse(await readFile(path.join(dir, f), "utf8")));
    out[cfg.country] = list.sort((a, b) => b.year - a.year);
  }
  return out;
}
// Fixture lists saved by scripts/update-fixtures.mjs: { "england/premier-league": data }
export async function loadFixtures(root = ROOT) {
  const out = {};
  for (const cfg of [...COUNTRIES, EUROPE]) for (const lg of cfg.leagues) {
    try { out[`${cfg.country}/${lg.id}`] = JSON.parse(await readFile(path.join(root, "data", "fixtures", cfg.country, `${lg.id}.json`), "utf8")); } catch {}
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
      try { h.fx = JSON.parse(await readFile(path.join(dir, f.replace(".json", "-fixtures.json")), "utf8")); } catch { h.fx = null; }
      list.push(h);
    }
    out[lg.id] = list.sort((a, b) => b.year - a.year);
  }
  return out;
}
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
    title: "Football Pyramids: every league table, top to bottom | Premier League, La Liga, Bundesliga, Ligue 1, Serie A",
    description: `Every tier of ${countries.length} countries' football pyramids, each on one page: ${countries.map((c) => c.name).join(", ")}. Live scores on match days.`,
    canonical: SITE + "/", base: "", suffix, page: "home", stamps, countries,
    attrs: { fixtures: fxLinks(true), ...(europe ? { europe: euroSummary, statuses } : {}) },
    main: FP.homeMain(countries.filter((c) => c.featured), "", suffix, countries.filter((c) => !c.featured).map(FP.summary),
      { fixtures: fxLinks(true), europe: euroSummary, statuses })
  }));

  // Country pages
  for (const c of countries) {
    const { first, last } = tierNames(c);
    await write(`${c.country}/index.html`, shell({
      title: `${c.adjective} football pyramid: ${first} to ${last} tables | Football Pyramids`,
      description: `Every ${c.adjective} league table from ${first} down to ${last} on one page, with promotion and relegation places marked.`,
      canonical: `${SITE}/${c.country}/`, base: "../", suffix, page: "country", country: c.country,
      stamps: { [c.country]: c.updated }, countries, seasons: seasonList(c, history[c.country], "", suffix, null),
      attrs: { fixtures: fxLinks(false) },
      main: FP.countryMain(c, { seasons: seasonList(c, history[c.country], "", suffix, null), fixtures: fxLinks(false) })
    }));
    // Fixtures pages, one per league
    for (const lg of c.leagues) {
      const fx = fixtures[`${c.country}/${lg.id}`];
      if (!fx) continue;
      await write(`${c.country}/${lg.id}/fixtures/index.html`, shell({
        title: `${fx.name} fixtures and results ${fx.season} | Football Pyramids`,
        description: `Every ${fx.name} fixture and result for ${fx.season}, round by round, with kick-off times in your time zone, postponements and live scores.`,
        canonical: `${SITE}/${c.country}/${lg.id}/fixtures/`, base: "../../../", suffix, page: "fixtures", country: c.country,
        stamps: {}, countries, attrs: { league: lg.id, table: `../../${suffix}#${lg.id}` },
        main: FP.fixturesMain(fx, { tz: "uk", tableHref: `../../${suffix}#${lg.id}` })
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
        stamps: {}, countries, main: FP.countryMain(h, { seasons })
      }));
    }
  }

  // European competitions
  const euroPast = [];
  if (europe) {
    await write(`europe/index.html`, shell({
      title: `Champions League, Europa League and Conference League tables ${europe.season} | Football Pyramids`,
      description: "League-phase tables, knockout brackets, qualifying ties and fixtures for the Champions League, Europa League and Conference League, with live scores.",
      canonical: `${SITE}/europe/`, base: "../", suffix, page: "europe", country: "europe", stamps: { europe: europe.updated }, countries,
      attrs: { statuses },
      main: FP.europeMain(europe, { statuses, base: "", suffix })
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
          main: FP.compMain(h.comp, h.fx, { tz: "uk", seasons, fixturesHref: h.fx ? `fixtures/${suffix}` : "" })
        }));
        if (h.fx) await write(`europe/${comp.id}/${sl}/fixtures/index.html`, shell({
          title: `${comp.name} fixtures and results ${h.season} | Football Pyramids`,
          description: `Every ${comp.name} fixture and result from ${h.season}, from qualifying to the final.`,
          canonical: `${SITE}/europe/${comp.id}/${sl}/fixtures/`, base: "../../../../", suffix, page: "fixtures", country: "europe", stamps: {}, countries,
          attrs: { league: comp.id, table: `../${suffix}`, fxfile: `data/history/europe/${comp.id}/${h.year}-fixtures.json` },
          main: FP.fixturesMain(h.fx, { tz: "uk", tableHref: `../${suffix}`, tableText: `${comp.name} ${h.season}` })
        }));
        euroPast.push(`/europe/${comp.id}/${sl}/`);
      }
      await write(`europe/${comp.id}/index.html`, shell({
        title: `${comp.name} ${europe.season}: table, knockout bracket and results | Football Pyramids`,
        description: `The ${comp.name} league-phase table, the knockout bracket as each draw is made, every qualifying tie and live scores.`,
        canonical: `${SITE}/europe/${comp.id}/`, base: "../../", suffix, page: "comp", country: "europe", stamps: { europe: europe.updated }, countries,
        seasons: seasonsNow, attrs: { league: comp.id, fx: fx ? `fixtures/${suffix}` : "" },
        main: FP.compMain(comp, fx, { tz: "uk", fixturesHref: fx ? `fixtures/${suffix}` : "", seasons: seasonsNow })
      }));
      if (fx) await write(`europe/${comp.id}/fixtures/index.html`, shell({
        title: `${comp.name} fixtures and results ${fx.season} | Football Pyramids`,
        description: `Every ${comp.name} fixture and result for ${fx.season}, from qualifying to the final, with kick-off times in your time zone and live scores.`,
        canonical: `${SITE}/europe/${comp.id}/fixtures/`, base: "../../../", suffix, page: "fixtures", country: "europe", stamps: {}, countries,
        attrs: { league: comp.id, table: `../${suffix}` },
        main: FP.fixturesMain(fx, { tz: "uk", tableHref: `../${suffix}`, tableText: `${comp.name} table and bracket` })
      }));
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
        for (const r of g.rows) clubs.push({ team: r.team, country: c.country, countryName: c.name, league: lg.name });
      }
    }
  }
  clubs.sort((a, b) => a.team.localeCompare(b.team));
  await write("data/clubs.json", JSON.stringify(clubs));

  // For the live-scores worker: which API-Football league IDs belong to which table on the site.
  const live = { season: Number(String(countries[0].season).slice(0, 4)), leagues: {} };
  for (const c of [...COUNTRIES, EUROPE]) for (const lg of c.leagues) {
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
