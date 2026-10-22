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
import { COUNTRIES, SITE, CONTACT, ADS, ADSENSE_CLIENT, PLAYOFF_RULES, LIVE_URL } from "./leagues.mjs";
import { contactPage, privacyPage } from "./pages.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const FP = require(path.join(ROOT, "assets/render.js"));

const FAVICON = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#121B2A"/>' +
  '<rect x="12" y="7" width="8" height="4" rx="1" fill="#8EA2FF"/><rect x="8" y="14" width="16" height="4" rx="1" fill="#8EA2FF"/>' +
  '<rect x="4" y="21" width="24" height="4" rx="1" fill="#8EA2FF"/></svg>');

const esc = FP.esc;

function shell({ title, description, canonical, base, suffix, page, country, stamps, main, countries, seasons }) {
  const snapshot = countries.some((c) => c.mode !== "live");
  const home = base || "./";
  const homeHref = suffix ? base + suffix : home;
  const nav = countries.map((c) =>
    `<a href="${base}${c.country}/${suffix}"${c.country === country ? ' aria-current="page"' : ""}>` +
    `<span class="short">${(COUNTRIES.find((x) => x.country === c.country) || {}).code || c.name.slice(0, 3).toUpperCase()}</span><span class="long">${esc(c.name)}</span></a>`
  ).join("");
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
<body${ADS ? "" : ' class="no-ads"'} data-page="${page}" data-base="${base}" data-index="${suffix}"${country ? ` data-country="${country}"` : ""} data-countries="${countries.map((c) => c.country).join(",")}" data-stamps="${esc(JSON.stringify(stamps))}"${seasons ? ` data-seasons="${esc(JSON.stringify(seasons))}"` : ""}${LIVE_URL && (page === "home" || page === "country") ? ` data-live="${esc(LIVE_URL)}"` : ""}>
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
    out.push(JSON.parse(await readFile(path.join(root, "data", cfg.country + ".json"), "utf8")));
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
function zoneAt(lg, pos) { return (lg.zones || []).find((z) => pos >= z.from && pos <= z.to) || null; }

// Rewrite a past season's zones using PLAYOFF_RULES, for the leagues listed there.
export function applyPlayoffRules(season, rules = PLAYOFF_RULES) {
  for (const lg of season.leagues) {
    const list = rules[lg.id];
    if (!list) continue;
    const rule = list.find((r) => season.year >= r.from && season.year <= (r.to ?? 9999)) || {};
    const rel = rule.rel || [], promo = rule.promo || [];
    // Only take over the kinds of play-off this league has rules for; leave the rest as the API has them.
    const doesRel = list.some((r) => r.rel), doesPromo = list.some((r) => r.promo);
    const size = Math.max(0, ...(lg.groups ? lg.groups.map((g) => g.rows.length) : [(lg.rows || []).length]));
    const at = [];
    for (let pos = 1; pos <= size; pos++) {
      let z = zoneAt(lg, pos);
      z = z ? { kind: z.kind, label: z.label } : null;
      const playoffish = z && /play/i.test(z.label) && (z.kind === "down" ? doesRel : doesPromo);
      if (rel.includes(pos)) z = { kind: "down", label: "Relegation play-off" };
      else if (promo.includes(pos)) z = { kind: "mid", label: "Play-offs" };
      else if (playoffish) z = null;   // a play-off place the rules say didn't exist
      at.push(z);
    }
    const zones = [];
    at.forEach((z, i) => {
      if (!z) return;
      const last = zones[zones.length - 1];
      if (last && last.to === i && last.kind === z.kind && last.label === z.label) last.to = i + 1;
      else zones.push({ from: i + 1, to: i + 1, ...z });
    });
    lg.zones = zones;
  }
  return season;
}

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

/* European places that come from winning a cup (e.g. 12th in Europa League because they won the FA Cup)
   sit apart from the main block at the top. Label those so the key doesn't read "17th Champions League". */
export function labelCupPlaces(season) {
  for (const lg of season.leagues) {
    let topEnd = 0;
    for (const z of lg.zones || []) {
      if (z.kind === "down") continue;
      if (z.from === topEnd + 1) { topEnd = z.to; continue; }
      if (/league|europe/i.test(z.label) && !/promotion|play/i.test(z.label)) { z.label += " (cup winners)"; z.kind = "cup"; }
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
    title: "Football Pyramids: Premier League, La Liga, Bundesliga, Ligue 1 and Serie A tables",
    description: "Europe's top five league tables on one page, with every tier of each country's football pyramid below them.",
    canonical: SITE + "/", base: "", suffix, page: "home", stamps, countries,
    main: FP.homeMain(countries, "", suffix)
  }));

  // Country pages
  for (const c of countries) {
    const { first, last } = tierNames(c);
    await write(`${c.country}/index.html`, shell({
      title: `${c.adjective} football pyramid: ${first} to ${last} tables | Football Pyramids`,
      description: `Every ${c.adjective} league table from ${first} down to ${last} on one page, with promotion and relegation places marked.`,
      canonical: `${SITE}/${c.country}/`, base: "../", suffix, page: "country", country: c.country,
      stamps: { [c.country]: c.updated }, countries, seasons: seasonList(c, history[c.country], "", suffix, null),
      main: FP.countryMain(c, { seasons: seasonList(c, history[c.country], "", suffix, null) })
    }));
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
  for (const c of COUNTRIES) for (const lg of c.leagues) {
    for (const g of lg.groups || [{ apiId: lg.apiId }]) live.leagues[g.apiId] = { c: c.country, l: lg.id, ...(g.name ? { g: g.name } : {}) };
  }
  await write("data/live-leagues.json", JSON.stringify(live));

  if (!preview) {
    const today = new Date().toISOString().slice(0, 10);
    const urls = ["/", ...countries.map((c) => `/${c.country}/`), "/contact/", "/privacy/"];
    const past = countries.flatMap((c) => history[c.country].map((h) => `/${c.country}/${slug(h.year)}/`));
    await write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${SITE}${u}</loc><lastmod>${today}</lastmod><changefreq>hourly</changefreq></url>`).join("\n")}
${past.map((u) => `  <url><loc>${SITE}${u}</loc><changefreq>yearly</changefreq></url>`).join("\n")}
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
