#!/usr/bin/env node
// Football Pyramids: pulls the latest Premier League and EFL tables from API-Football
// and writes data.json, which the page re-reads every five minutes.
//
//   API_FOOTBALL_KEY=xxxx node scripts/update-standings.mjs
//   API_FOOTBALL_KEY=xxxx node scripts/update-standings.mjs --check   (plan, quota, league IDs; uses 1 request)
//   node scripts/update-standings.mjs --fixture test/api-football-sample.json --out /tmp/out.json  (offline test, no key)
//
// Needs Node 18 or newer (built-in fetch). 4 API requests per run.

import { readFile, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data.json");
const API = "https://v3.football.api-sports.io";

// Season is the year the season starts: 2026 = 2026–27.
const SEASON = Number(process.env.SEASON || seasonFor(new Date()));

// League IDs on API-Football. Confirm with --check before going live.
// To add tier 5 later: National League is usually 43 (zones: 1 up, 2–7 play-offs, 21–24 down).
const LEAGUES = [
  {
    apiId: 39, id: "premier-league", tier: 1, name: "Premier League", short: "PL",
    zones: [
      { from: 1, to: 4, kind: "top", label: "Champions League" },
      { from: 5, to: 5, kind: "mid", label: "Europa League" },
      { from: 18, to: 20, kind: "down", label: "Relegation" }
    ],
    relegationNote: "18th–20th drop to the Championship",
    notes: []
  },
  {
    apiId: 40, id: "championship", tier: 2, name: "Championship", short: "CH",
    zones: [
      { from: 1, to: 2, kind: "top", label: "Promotion" },
      { from: 3, to: 8, kind: "mid", label: "Play-offs" },
      { from: 22, to: 24, kind: "down", label: "Relegation" }
    ],
    promotionNote: "1st, 2nd and the play-off winner go up",
    relegationNote: "22nd–24th drop to League One",
    notes: ["Play-offs: 3rd and 4th go straight to the semi-finals; 5th to 8th play eliminators first."]
  },
  {
    apiId: 41, id: "league-one", tier: 3, name: "League One", short: "L1",
    zones: [
      { from: 1, to: 2, kind: "top", label: "Promotion" },
      { from: 3, to: 6, kind: "mid", label: "Play-offs" },
      { from: 21, to: 24, kind: "down", label: "Relegation" }
    ],
    promotionNote: "1st, 2nd and the play-off winner go up",
    relegationNote: "21st–24th drop to League Two",
    notes: []
  },
  {
    apiId: 42, id: "league-two", tier: 4, name: "League Two", short: "L2",
    zones: [
      { from: 1, to: 3, kind: "top", label: "Promotion" },
      { from: 4, to: 7, kind: "mid", label: "Play-offs" },
      { from: 23, to: 24, kind: "down", label: "Relegation" }
    ],
    promotionNote: "1st–3rd and the play-off winner go up",
    relegationNote: "23rd–24th drop to the National League",
    notes: []
  }
];

// API-Football uses short names for some clubs. Map them to the full names shown on the site.
// Add to this list if a club shows up with an odd name.
const NAMES = {
  "Brighton": "Brighton & Hove Albion",
  "Bournemouth": "AFC Bournemouth",
  "Tottenham": "Tottenham Hotspur",
  "Newcastle": "Newcastle United",
  "Leeds": "Leeds United",
  "Ipswich": "Ipswich Town",
  "Hull City": "Hull City",
  "Coventry": "Coventry City",
  "Nottingham Forest": "Nottingham Forest",
  "Wolves": "Wolverhampton Wanderers",
  "West Ham": "West Ham United",
  "West Brom": "West Bromwich Albion",
  "QPR": "Queens Park Rangers",
  "Sheffield Utd": "Sheffield United",
  "Sheffield Wednesday": "Sheffield Wednesday",
  "Birmingham": "Birmingham City",
  "Blackburn": "Blackburn Rovers",
  "Bolton": "Bolton Wanderers",
  "Bristol City": "Bristol City",
  "Cardiff": "Cardiff City",
  "Charlton": "Charlton Athletic",
  "Derby": "Derby County",
  "Lincoln": "Lincoln City",
  "Norwich": "Norwich City",
  "Preston": "Preston North End",
  "Stoke City": "Stoke City",
  "Swansea": "Swansea City",
  "Huddersfield": "Huddersfield Town",
  "Bradford": "Bradford City",
  "Cambridge United": "Cambridge United",
  "Plymouth": "Plymouth Argyle",
  "Oxford United": "Oxford United",
  "Leicester": "Leicester City",
  "Mansfield Town": "Mansfield Town",
  "Leyton Orient": "Leyton Orient",
  "Luton": "Luton Town",
  "Burton Albion": "Burton Albion",
  "Wycombe": "Wycombe Wanderers",
  "Doncaster": "Doncaster Rovers",
  "MK Dons": "Milton Keynes Dons",
  "Milton Keynes Dons": "Milton Keynes Dons",
  "Peterborough": "Peterborough United",
  "Wigan": "Wigan Athletic",
  "Notts County": "Notts County",
  "Salford City": "Salford City",
  "Crewe": "Crewe Alexandra",
  "Cheltenham": "Cheltenham Town",
  "Shrewsbury": "Shrewsbury Town",
  "Exeter City": "Exeter City",
  "Accrington ST": "Accrington Stanley",
  "Accrington": "Accrington Stanley",
  "Newport County": "Newport County",
  "Tranmere": "Tranmere Rovers",
  "Swindon Town": "Swindon Town",
  "Bristol Rovers": "Bristol Rovers",
  "Grimsby": "Grimsby Town",
  "Fleetwood Town": "Fleetwood Town",
  "Colchester": "Colchester United",
  "Oldham": "Oldham Athletic",
  "Rotherham": "Rotherham United",
  "Northampton": "Northampton Town",
  "Crawley Town": "Crawley Town",
  "Carlisle": "Carlisle United",
  "Forest Green": "Forest Green Rovers",
  "Sutton Utd": "Sutton United",
  "Cambridge": "Cambridge United",
  "Harrogate": "Harrogate Town",
  "Barrow": "Barrow"
};

function seasonFor(d) {
  // New season from July onwards.
  return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

function seasonLabel(y) {
  return `${y}–${String((y + 1) % 100).padStart(2, "0")}`;
}

async function api(pathAndQuery, key) {
  const res = await fetch(API + pathAndQuery, { headers: { "x-apisports-key": key } });
  if (!res.ok) throw new Error(`API-Football ${res.status} on ${pathAndQuery}`);
  const body = await res.json();
  const errs = body.errors && (Array.isArray(body.errors) ? body.errors : Object.values(body.errors));
  if (errs && errs.length) throw new Error(`API-Football said: ${errs.join("; ")}`);
  const left = res.headers.get("x-ratelimit-requests-remaining");
  if (left !== null) console.log(`  requests left today: ${left}`);
  return body;
}

// Turn one API-Football /standings response into a Football Pyramids league object.
export function toLeague(cfg, body) {
  const table = body?.response?.[0]?.league?.standings?.[0];
  if (!Array.isArray(table) || table.length === 0) {
    throw new Error(`${cfg.name}: no table in the response (check league ID ${cfg.apiId} and season ${SEASON})`);
  }
  let latest = 0;
  const notes = [...cfg.notes];
  const rows = table
    .slice()
    .sort((a, b) => a.rank - b.rank)
    .map((t) => {
      const all = t.all || {};
      const w = all.win ?? 0, d = all.draw ?? 0, l = all.lose ?? 0;
      const team = NAMES[t.team?.name] || t.team?.name || "Unknown";
      // API-Football has no deduction field; infer it from the points.
      const ded = Math.max(0, 3 * w + d - (t.points ?? 0));
      if (ded) notes.push(`${team}: ${ded} point${ded === 1 ? "" : "s"} deducted.`);
      const stamp = Date.parse(t.update || "");
      if (stamp > latest) latest = stamp;
      const row = {
        pos: t.rank, team, p: all.played ?? w + d + l, w, d, l,
        gf: all.goals?.for ?? 0, ga: all.goals?.against ?? 0, pts: t.points ?? 0
      };
      if (ded) row.ded = ded;
      // API-Football gives form newest-first ("DLDLW"). Store oldest-first so the latest result sits on the right.
      if (t.form) row.form = String(t.form).replace(/[^WDL]/g, "").slice(0, 5).split("").reverse().join("");
      return row;
    });

  const { apiId, ...meta } = cfg;
  return {
    ...meta,
    notes,
    updated: new Date(latest || Date.now()).toISOString(),
    rows
  };
}

function check(league) {
  const want = league.tier === 1 ? 20 : 24;
  if (league.rows.length !== want) {
    throw new Error(`${league.name}: expected ${want} clubs, got ${league.rows.length}. Not writing data.json.`);
  }
}

async function writeAtomic(file, obj) {
  const tmp = file + ".tmp";
  await writeFile(tmp, JSON.stringify(obj, null, 2) + "\n");
  await rename(tmp, file);
}

async function main() {
  const args = process.argv.slice(2);
  const fixtureIdx = args.indexOf("--fixture");
  const outIdx = args.indexOf("--out");
  const OUT_FILE = outIdx > -1 ? path.resolve(args[outIdx + 1]) : OUT;
  const key = process.env.API_FOOTBALL_KEY;

  if (args.includes("--check") || args.includes("--list-leagues")) {
    if (!key) throw new Error("Set API_FOOTBALL_KEY first.");
    // /status is free: it doesn't count against the daily quota.
    const status = (await api("/status", key)).response || {};
    const req = status.requests || {};
    console.log(`Plan: ${status.subscription?.plan ?? "?"} · used today: ${req.current ?? "?"} of ${req.limit_day ?? "?"}\n`);

    const body = await api(`/leagues?country=England&season=${SEASON}&type=league`, key);
    const wanted = new Map(LEAGUES.map((l) => [l.apiId, l.name]));
    console.log(`English leagues for season ${seasonLabel(SEASON)}:`);
    for (const item of body.response || []) {
      const season = (item.seasons || []).find((s) => s.year === SEASON) || item.seasons?.[0];
      const standings = season?.coverage?.standings ? "standings yes" : "standings NO";
      const mark = wanted.has(item.league.id) ? "  ← used on the site" : "";
      console.log(`  ${item.league.id}\t${item.league.name}\t${standings}${mark}`);
    }
    const found = new Set((body.response || []).map((i) => i.league.id));
    const missing = [...wanted].filter(([id]) => !found.has(id));
    if (missing.length) console.log(`\nNot found: ${missing.map(([id, n]) => `${n} (${id})`).join(", ")}. Update the IDs in LEAGUES.`);
    else console.log("\nAll four leagues found. You're good to run the updater.");
    return;
  }

  let leagues;
  if (fixtureIdx > -1) {
    // Offline test: fixture file holds { "39": <standings response>, "40": ..., ... }
    const fixture = JSON.parse(await readFile(path.resolve(args[fixtureIdx + 1]), "utf8"));
    leagues = LEAGUES.map((cfg) => toLeague(cfg, fixture[cfg.apiId]));
  } else {
    if (!key) throw new Error("Set API_FOOTBALL_KEY (get one at dashboard.api-football.com).");
    leagues = [];
    for (const cfg of LEAGUES) {
      console.log(`Fetching ${cfg.name}…`);
      leagues.push(toLeague(cfg, await api(`/standings?league=${cfg.apiId}&season=${SEASON}`, key)));
    }
  }
  leagues.forEach(check);

  const next = {
    season: seasonLabel(SEASON),
    mode: "live",
    updated: leagues.map((l) => l.updated).sort().at(-1),
    belowNote: "National League champions and play-off winner come up",
    leagues
  };

  // Only write when the tables actually changed, so hosts don't redeploy for nothing.
  let prev = null;
  try { prev = JSON.parse(await readFile(OUT_FILE, "utf8")); } catch {}
  const same = prev && JSON.stringify(prev.leagues?.map((l) => l.rows)) === JSON.stringify(leagues.map((l) => l.rows));
  if (same && prev.mode === "live") {
    console.log("No change in any table. data.json left as it is.");
    return;
  }
  await writeAtomic(OUT_FILE, next);
  console.log(`Wrote ${path.relative(process.cwd(), OUT_FILE)} (${leagues.reduce((n, l) => n + l.rows.length, 0)} clubs).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(`Update failed: ${err.message}`);
    process.exit(1);
  });
}
