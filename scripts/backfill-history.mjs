#!/usr/bin/env node
// Football Pyramids: fetches every past season's final tables that API-Football has,
// and saves them as data/history/<country>/<year>.json. Run once; re-running only fetches seasons not yet saved.
//
//   API_FOOTBALL_KEY=xxxx node scripts/backfill-history.mjs              all countries (roughly 300 requests the first time)
//   API_FOOTBALL_KEY=xxxx node scripts/backfill-history.mjs --force      re-fetch seasons already saved
//   node scripts/backfill-history.mjs --fixture test/history-sample.json --out /tmp/fp-hist   offline test
//
// Then run `node scripts/build.mjs` to make the season pages (the GitHub job does both).

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { COUNTRIES } from "./leagues.mjs";
import { api, toRows, groupName, seasonLabel } from "./update-standings.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const now = new Date();
const CURRENT = Number(process.env.SEASON || (now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1));
const PAUSE_MS = 250;   // stay well under the per-minute limit
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Zones from the data's own labels ----------
   Past seasons had different formats, so instead of today's settings we use the "description"
   API-Football gives each row, e.g. "Promotion - Premier League" or "Relegation - League One". */
export function classify(desc) {
  if (!desc) return null;
  const d = desc.toLowerCase();
  if (/relegation|play-?out/.test(d)) return { kind: "down", label: /play|round/.test(d) ? "Relegation play-off" : "Relegation" };
  if (/play-?off/.test(d)) return { kind: "mid", label: "Play-offs" };
  if (/champions league/.test(d)) return { kind: "top", label: /qualif/.test(d) ? "Champions League qualifiers" : "Champions League" };
  if (/europa league/.test(d)) return { kind: "mid", label: "Europa League" };
  if (/conference league/.test(d)) return { kind: "mid", label: "Conference League" };
  if (/promotion/.test(d)) return { kind: "top", label: "Promotion" };
  if (/uefa|europe/.test(d)) return { kind: "mid", label: "Europe" };
  return null;
}
export function zonesFrom(table) {
  const zones = [];
  for (const t of table.slice().sort((a, b) => a.rank - b.rank)) {
    const z = classify(t.description);
    const last = zones[zones.length - 1];
    if (!z) continue;
    if (last && last.label === z.label && last.kind === z.kind && last.to === t.rank - 1) last.to = t.rank;
    else zones.push({ from: t.rank, to: t.rank, kind: z.kind, label: z.label });
  }
  return zones;
}

function nameFor(cfg, year) {
  const h = (cfg.history || []).find((x) => year <= x.until);
  return h ? { name: h.name, short: h.short || cfg.short } : { name: cfg.name, short: cfg.short };
}
const idsOf = (cfg) => (cfg.groups ? cfg.groups.map((g) => g.apiId) : [cfg.apiId]);
const exists = (f) => access(f).then(() => true, () => false);

async function main() {
  const args = process.argv.slice(2);
  const key = process.env.API_FOOTBALL_KEY;
  const force = args.includes("--force");
  const fi = args.indexOf("--fixture"), oi = args.indexOf("--out");
  const outRoot = oi > -1 ? path.resolve(args[oi + 1]) : ROOT;
  const fixture = fi > -1 ? JSON.parse(await readFile(path.resolve(args[fi + 1]), "utf8")) : null;
  if (!fixture && !key) throw new Error("Set API_FOOTBALL_KEY (the GitHub job does this for you).");

  let requests = 0;
  const get = async (q) => {
    if (fixture) return fixture[q] || { response: [] };
    requests++;
    await sleep(PAUSE_MS);
    try { return await api(q, key); }
    catch (e) { console.log(`  skipped ${q}: ${e.message}`); return { response: [] }; }
  };

  let saved = 0;
  for (const c of COUNTRIES) {
    // Which past seasons does each league have tables for?
    const years = new Map();   // apiId -> Set(year)
    for (const cfg of c.leagues) {
      for (const id of idsOf(cfg)) {
        const body = await get(`/leagues?id=${id}`);
        const seasons = body?.response?.[0]?.seasons || [];
        years.set(id, new Set(seasons.filter((s) => s.coverage?.standings && s.year < CURRENT).map((s) => s.year)));
      }
    }
    const topYears = [...(years.get(c.leagues[0].apiId) || [])].sort((a, b) => b - a);
    console.log(`${c.name}: ${topYears.length} past seasons available${topYears.length ? ` (${topYears.at(-1)}–${topYears[0]})` : ""}.`);

    for (const year of topYears) {
      const file = path.join(outRoot, "data", "history", c.country, `${year}.json`);
      if (!force && await exists(file)) continue;
      const leagues = [];
      for (const cfg of c.leagues) {
        const ids = idsOf(cfg).filter((id) => years.get(id)?.has(year));
        if (!ids.length) continue;
        const tables = [];
        for (const id of ids) {
          const body = await get(`/standings?league=${id}&season=${year}`);
          const st = body?.response?.[0]?.league?.standings || [];
          st.filter((t) => Array.isArray(t) && t.length).forEach((t) => tables.push({ id, t }));
        }
        if (!tables.length) continue;
        const notes = [];
        const { name, short } = nameFor(cfg, year);
        const league = { id: cfg.id, tier: cfg.tier, name, short, final: true, zones: zonesFrom(tables[0].t), notes };
        if (tables.length > 1) {
          league.groups = tables.map(({ id, t }, i) => {
            const named = cfg.groups && ids.length === tables.length ? cfg.groups.find((g) => g.apiId === id)?.name : null;
            return { name: named || groupName(t[0]?.group, i), rows: toRows(t, notes).rows };
          });
        } else {
          league.rows = toRows(tables[0].t, notes).rows;
        }
        leagues.push(league);
      }
      if (!leagues.length) continue;
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify({
        country: c.country, name: c.name, adjective: c.adjective, season: seasonLabel(year), year, mode: "final", leagues
      }, null, 1) + "\n");
      saved++;
      console.log(`  ${seasonLabel(year)}: saved ${leagues.length} tiers.`);
    }
  }
  console.log(`Done. ${saved} season files saved${fixture ? "" : `, ${requests} requests used`}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => { console.error(`Backfill failed: ${err.message}`); process.exit(1); });
}
