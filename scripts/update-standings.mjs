#!/usr/bin/env node
// Football Pyramids: pulls the latest tables from API-Football, writes data/<country>.json,
// then rebuilds the pages. The pages also re-read the data files every five minutes.
//
//   API_FOOTBALL_KEY=xxxx node scripts/update-standings.mjs           update everything (one request per league or group)
//   API_FOOTBALL_KEY=xxxx node scripts/update-standings.mjs --check   plan, quota and league IDs (5 requests)
//   node scripts/update-standings.mjs --fixture test/api-football-sample.json --out /tmp/fp-test   offline test, no key
//
// Needs Node 18 or newer (built-in fetch).

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { COUNTRIES, EUROPE, clubName } from "./leagues.mjs";
import { build } from "./build.mjs";
import { zonesFrom, applyPlayoffRules, labelCupPlaces } from "./zones.mjs";
import { seasonFor, seasonLabel } from "./season.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://v3.football.api-sports.io";

// Season is the year it starts: 2026 = 2026–27 (or just 2026 for calendar-year countries; see season.mjs).
// Set per country as the updater works through them.
let SEASON = seasonFor(null);
export { seasonLabel };

export async function api(pathAndQuery, key) {
  const res = await fetch(API + pathAndQuery, { headers: { "x-apisports-key": key } });
  if (!res.ok) throw new Error(`API-Football ${res.status} on ${pathAndQuery}`);
  const body = await res.json();
  const errs = body.errors && (Array.isArray(body.errors) ? body.errors : Object.values(body.errors));
  if (errs && errs.length) throw new Error(`API-Football said: ${errs.join("; ")}`);
  const left = res.headers.get("x-ratelimit-requests-remaining");
  if (left !== null) console.log(`  requests left today: ${left}`);
  return body;
}

// "Serie C: Girone A" -> "Girone A"; "Primera Federación, Group 1" -> "Group 1"
export function groupName(raw, i) {
  if (!raw) return `Group ${i + 1}`;
  const parts = String(raw).split(/[:,]/);
  return parts[parts.length - 1].trim() || `Group ${i + 1}`;
}

// The country being worked on, for its own club-name fixes. Callers set it with namesFor(country).
let NAME_COUNTRY = null;
export function namesFor(country) { NAME_COUNTRY = country; }

export function toRows(table, notes) {
  let latest = 0;
  const rows = table.slice().sort((a, b) => a.rank - b.rank).map((t) => {
    const all = t.all || {};
    const w = all.win ?? 0, d = all.draw ?? 0, l = all.lose ?? 0;
    const raw = String(t.team?.name || "Unknown").trim();
    const team = clubName(raw, NAME_COUNTRY);
    // API-Football has no deduction field, so work it out from the points.
    const ded = Math.max(0, 3 * w + d - (t.points ?? 0));
    if (ded) notes.push(`${team}: ${ded} point${ded === 1 ? "" : "s"} deducted.`);
    const stamp = Date.parse(t.update || "");
    if (stamp > latest) latest = stamp;
    const row = { pos: t.rank, team, p: all.played ?? w + d + l, w, d, l,
      gf: all.goals?.for ?? 0, ga: all.goals?.against ?? 0, pts: t.points ?? 0 };
    if (ded) row.ded = ded;
    if (t.team?.id) row.tid = t.team.id;   // API-Football's club ID, used to match live scores to rows
    // API-Football gives form newest-first ("DLDLW"). Store oldest-first so the latest result sits on the right.
    if (t.form) row.form = String(t.form).replace(/[^WDL]/g, "").slice(0, 5).split("").reverse().join("");
    return row;
  });
  return { rows, updated: latest ? new Date(latest).toISOString() : new Date().toISOString() };
}

function firstTable(body, label, apiId) {
  const standings = body?.response?.[0]?.league?.standings;
  if (!Array.isArray(standings) || !standings.length || !standings[0]?.length) {
    throw new Error(`${label}: no table in the response (check league ID ${apiId} and season ${SEASON})`);
  }
  return standings[0];
}

// Turn API-Football /standings responses into a league object for the site.
// A tier split into regional groups has one API league per group, so `body` is then a list, one per group.
export function toLeague(cfg, body) {
  const { apiId, clubs, groups, groupNames, latestStage, calendar, ...meta } = cfg;
  const notes = [...(cfg.notes || [])];
  const league = { ...meta, notes };
  const warn = (what, n) => { if (clubs && n !== clubs) console.log(`  note: ${what} has ${n} clubs (expected ${clubs}).`); };
  let first;
  // latestStage: the season has stages with their own tables (Argentina's Apertura then Clausura, Liga MX's
  // Apertura and Clausura), and the API returns all of them. Keep only the stage being played now, the last one.
  let stageName = null;
  if (cfg.latestStage) {
    const all = (body?.response?.[0]?.league?.standings || []).filter((t) => Array.isArray(t) && t.length);
    const stageOf = (t) => String(t[0]?.group || "").split(/\s+-\s+|:/)[0].trim();
    if (all.length > 1) {
      stageName = stageOf(all[all.length - 1]);
      const now = all.filter((t) => stageOf(t) === stageName);
      body = { response: [{ league: { standings: cfg.splitGroups ? now : [now[now.length - 1]] } }] };
      if (stageName) notes.unshift(`${cfg.splitGroups ? "These are the" : "This is the"} ${stageName} ${cfg.splitGroups ? "tables" : "table"}.`);
    }
  }
  if (cfg.splitGroups) {
    // One API league whose response holds several tables, one per group (e.g. Turkey's 2. Lig).
    const tables = (body?.response?.[0]?.league?.standings || []).filter((t) => Array.isArray(t) && t.length);
    if (!tables.length) throw new Error(`${cfg.name}: no table in the response (check league ID ${apiId} and season ${SEASON})`);
    first = tables[0];
    league.groups = tables.map((t, i) => {
      const { rows, updated } = toRows(t, notes);
      // groupNames: names to use when the API gives every table the same name (the USL Championship's conferences).
      let name = (cfg.groupNames && cfg.groupNames[i]) || groupName(t[0]?.group, i);
      if (stageName && name.startsWith(stageName)) name = name.slice(stageName.length).replace(/^\s*-\s*/, "") || name;
      return { name, updated, rows };
    });
    league.updated = league.groups.map((g) => g.updated).sort().at(-1);
  } else if (groups) {
    league.groups = groups.map((g, i) => {
      const t = firstTable(body[i], `${cfg.name} ${g.name}`, g.apiId);
      if (i === 0) first = t;
      const { rows, updated } = toRows(t, notes);
      warn(`${cfg.name} ${g.name}`, rows.length);
      return { name: g.name, updated, rows };
    });
    league.updated = league.groups.map((g) => g.updated).sort().at(-1);
  } else {
    first = firstTable(body, cfg.name, apiId);
    const { rows, updated } = toRows(first, notes);
    warn(cfg.name, rows.length);
    league.rows = rows;
    league.updated = updated;
  }
  // zones: "api" means take promotion, play-off, European and relegation places from the API's own row
  // descriptions (they change with each country's European ranking), corrected by PLAYOFF_RULES.
  if (cfg.zones === "api") {
    const s = { year: SEASON, leagues: [{ ...league, zones: zonesFrom(first) }] };
    labelCupPlaces(applyPlayoffRules(s));
    league.zones = s.leagues[0].zones;
  }
  return league;
}

function tablesOf(country) {
  return JSON.stringify(country.leagues.map((l) => l.rows || l.groups.map((g) => g.rows)));
}

async function writeAtomic(file, obj) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp";
  await writeFile(tmp, JSON.stringify(obj, null, 1) + "\n");
  await rename(tmp, file);
}

async function check(key) {
  // /status is free: it doesn't count against the daily quota.
  const status = (await api("/status", key)).response || {};
  const req = status.requests || {};
  console.log(`Plan: ${status.subscription?.plan ?? "?"} · used today: ${req.current ?? "?"} of ${req.limit_day ?? "?"}\n`);
  let missing = [];
  for (const c of COUNTRIES) {
    SEASON = seasonFor(c);
    const body = await api(`/leagues?country=${encodeURIComponent(c.apiCountry)}&season=${SEASON}&type=league`, key);
    const wanted = new Map(c.leagues.flatMap((l) => l.groups ? l.groups.map((g) => [g.apiId, `${l.name} ${g.name}`]) : [[l.apiId, l.name]]));
    console.log(`${c.name}, season ${seasonLabel(SEASON, c)}:`);
    for (const item of body.response || []) {
      const season = (item.seasons || []).find((s) => s.year === SEASON) || item.seasons?.[0];
      const st = season?.coverage?.standings ? "standings yes" : "standings NO";
      const mark = wanted.has(item.league.id) ? `  ← used for ${wanted.get(item.league.id)}` : "";
      console.log(`  ${item.league.id}\t${item.league.name}\t${st}${mark}`);
    }
    const found = new Set((body.response || []).map((i) => i.league.id));
    missing = missing.concat([...wanted].filter(([id]) => !found.has(id)).map(([id, n]) => `${c.name} ${n} (${id})`));
    console.log("");
  }
  if (missing.length) console.log(`Not found: ${missing.join(", ")}. Update those IDs in scripts/leagues.mjs.`);
  else console.log("All leagues found. You're good to run the updater.");
}

async function main() {
  const args = process.argv.slice(2);
  const key = process.env.API_FOOTBALL_KEY;
  const fixtureIdx = args.indexOf("--fixture");
  const outIdx = args.indexOf("--out");
  const outRoot = outIdx > -1 ? path.resolve(args[outIdx + 1]) : ROOT;

  if (args.includes("--check") || args.includes("--list-leagues")) {
    if (!key) throw new Error("Set API_FOOTBALL_KEY first.");
    return check(key);
  }

  let fixture = null;
  if (fixtureIdx > -1) fixture = JSON.parse(await readFile(path.resolve(args[fixtureIdx + 1]), "utf8"));
  else if (!key) throw new Error("Set API_FOOTBALL_KEY (get one at dashboard.api-football.com).");

  let changed = 0, failures = 0;
  for (const c of [...COUNTRIES, EUROPE]) {
    const file = path.join(outRoot, "data", `${c.country}.json`);
    let prev = null;
    try { prev = JSON.parse(await readFile(file, "utf8")); } catch {}
    const leagues = [];
    namesFor(c);
    const year = seasonFor(c);
    let shown = year;   // the season the top tier's table comes from
    for (const cfg of c.leagues) {
      if (!fixture) console.log(`Fetching ${c.name}: ${cfg.name}…`);
      const get = async (id) => {
        if (fixture) return fixture[id];
        await new Promise((r) => setTimeout(r, 1500));   // API-Football refuses requests sent back to back
        return api(`/standings?league=${id}&season=${SEASON}`, key);
      };
      const fetchAll = async () => {
        const body = [];
        if (cfg.groups) for (const g of cfg.groups) body.push(await get(g.apiId));
        return toLeague(cfg, cfg.groups ? body : await get(cfg.apiId));
      };
      try {
        // A league can play within a calendar year in a country that doesn't (Australia's state NPLs).
        const cal = c.calendar || cfg.calendar;
        const yr = cfg.calendar && !c.calendar ? seasonFor({ calendar: true }) : year;
        SEASON = yr;
        let lg;
        try { lg = await fetchAll(); }
        catch (err) {
          // A calendar-year league early in the year may not have started yet: show last year's final table until it does.
          if (!cal || !/no table/.test(err.message)) throw err;
          SEASON = yr - 1;
          console.log(`  ${cfg.name}: ${yr} hasn't started yet, showing ${yr - 1}.`);
          lg = await fetchAll();
        }
        if (!leagues.length && !cfg.calendar) shown = SEASON;
        leagues.push(lg);
      } catch (err) {
        // One league failing shouldn't stop the rest: keep its last good table, or leave it out for now.
        const old = prev?.leagues?.find((l) => l.id === cfg.id);
        console.log(`  ${cfg.name}: ${err.message}. ${old ? "Keeping the last good table." : "Leaving it out for now."}`);
        failures++;
        if (old) leagues.push(old);
      }
    }
    if (!leagues.length) { console.log(`${c.name}: nothing to show yet, skipped.`); continue; }
    const next = {
      country: c.country, name: c.name, adjective: c.adjective, season: seasonLabel(shown, c), mode: "live",
      updated: leagues.map((l) => l.updated).sort().at(-1), belowNote: c.belowNote,
      ...(c.later ? { later: c.later } : {}), leagues
    };
    if (prev && prev.mode === "live" && tablesOf(prev) === tablesOf(next)) {
      console.log(`${c.name}: no change.`);
      continue;
    }
    await writeAtomic(file, next);
    changed++;
    console.log(`${c.name}: updated (${leagues.length} leagues).`);
  }

  // Always rebuild: cheap, and it picks up changes to the site settings or design.
  // GitHub only commits files that actually changed.
  if (!changed) console.log("No table changes. Rebuilding pages anyway.");
  const files = await build({ root: outRoot, outDir: outRoot });
  console.log(`Rebuilt ${files.length} files.`);
  if (failures) console.log(`${failures} league${failures === 1 ? "" : "s"} couldn't be updated this time (see above).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => { console.error(`Update failed: ${err.message}`); process.exit(1); });
}
