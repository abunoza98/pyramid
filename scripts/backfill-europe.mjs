#!/usr/bin/env node
// Football Pyramids: past seasons of the Champions League, Europa League and Conference League.
// For each season API-Football has: the group-stage tables (or, since 2024–25, the league-phase table) and every
// fixture from qualifying to the final. Saved to data/history/europe/<competition>/<year>.json and <year>-fixtures.json.
// Run once (the "Backfill history" GitHub job does it); seasons already saved are skipped. About 2 requests a season.
//
//   API_FOOTBALL_KEY=xxxx node scripts/backfill-europe.mjs            (--force to fetch saved seasons again)
//   node scripts/backfill-europe.mjs --fixture test/europe-history.json --out /tmp/fp    offline test

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { EUROPE } from "./leagues.mjs";
import { api, toRows, groupName, seasonLabel } from "./update-standings.mjs";
import { slim, toRounds, europeRounds } from "./update-fixtures.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const now = new Date();
const CURRENT = Number(process.env.SEASON || (now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (f) => access(f).then(() => true, () => false);

// Where each group-stage or league-phase place led, from the API's descriptions.
// e.g. "Promotion - Champions League (Round of 16)", "Europa League (Play Offs)", "Promotion - Europa League (1/16-finals)".
export function euroZone(desc, compId) {
  if (!desc) return null;
  const d = desc.toLowerCase();
  if (compId === "champions-league" && /europa league/.test(d)) return { kind: "mid", label: "Into the Europa League" };
  if (compId === "europa-league" && /conference league/.test(d)) return { kind: "mid", label: "Into the Conference League" };
  if (/1\/8|round of 16|eighth/.test(d)) return { kind: "top", label: "Round of 16" };
  if (/1\/16|round of 32/.test(d)) return { kind: compId === "champions-league" && !/play/.test(d) ? "top" : "mid", label: /play/.test(d) ? "Knockout play-offs" : "Round of 32" };
  if (/play-?off/.test(d)) return { kind: "mid", label: "Knockout play-offs" };
  if (/elimin|relegat/.test(d)) return { kind: "down", label: "Eliminated" };
  return null;
}
function zonesOf(table, compId) {
  const zones = [];
  for (const t of table.slice().sort((a, b) => a.rank - b.rank)) {
    const z = euroZone(t.description, compId);
    if (!z) continue;
    const last = zones[zones.length - 1];
    if (last && last.label === z.label && last.to === t.rank - 1) last.to = t.rank;
    else zones.push({ from: t.rank, to: t.rank, ...z });
  }
  return zones;
}

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
    for (let i = 1; ; i++) {
      await sleep(1500);   // API-Football refuses requests sent back to back
      requests++;
      try { return await api(q, key); }
      catch (e) {
        if (i < 3 && /too many|limit|429/i.test(e.message)) { await sleep(8000); continue; }
        console.log(`  skipped ${q}: ${e.message}`);
        return { response: [] };
      }
    }
  };

  let saved = 0;
  for (const cfg of EUROPE.leagues) {
    const seasons = ((await get(`/leagues?id=${cfg.apiId}`)).response?.[0]?.seasons || [])
      .filter((s) => s.year < CURRENT && (s.coverage?.fixtures?.events !== false))
      .map((s) => s.year).sort((a, b) => b - a);
    console.log(`${cfg.name}: ${seasons.length} past seasons${seasons.length ? ` (${seasons.at(-1)}–${seasons[0]})` : ""}.`);
    for (const year of seasons) {
      const dir = path.join(outRoot, "data", "history", "europe", cfg.id);
      const file = path.join(dir, `${year}.json`);
      if (!force && await exists(file)) continue;

      // Every game, from qualifying to the final.
      const list = ((await get(`/fixtures?league=${cfg.apiId}&season=${year}&timezone=UTC`)).response || [])
        .map((x) => ({ round: x.league?.round, f: slim(x, null) }));
      if (!list.length) { console.log(`  ${seasonLabel(year)}: no fixtures, skipped.`); continue; }
      europeRounds(list);

      // The group-stage tables or the league-phase table.
      const st = ((await get(`/standings?league=${cfg.apiId}&season=${year}`)).response?.[0]?.league?.standings || [])
        .filter((t) => Array.isArray(t) && t.length && t.length <= 40);
      const notes = [];
      const comp = { id: cfg.id, tier: cfg.tier, name: cfg.name, short: cfg.short, final: true, notes };
      if (st.length > 1) {
        comp.stage = "groups";
        comp.zones = zonesOf(st[0], cfg.id);
        comp.groups = st.map((t, i) => ({ name: groupName(t[0]?.group, i), rows: toRows(t, notes).rows }));
      } else if (st.length === 1) {
        comp.zones = zonesOf(st[0], cfg.id);
        comp.rows = toRows(st[0], notes).rows;
        if (!comp.zones.length && st[0].length === 36) comp.zones = cfg.zones;
      } else {
        comp.rows = [];
        comp.zones = [];
      }

      await mkdir(dir, { recursive: true });
      await writeFile(file, JSON.stringify({ country: "europe", name: cfg.name, season: seasonLabel(year), year, mode: "final", comp }) + "\n");
      await writeFile(path.join(dir, `${year}-fixtures.json`), JSON.stringify({
        country: "europe", countryName: "Europe", league: cfg.id, name: cfg.name, tier: cfg.tier,
        season: seasonLabel(year), year, updated: now.toISOString(), groups: [{ name: null, rounds: toRounds(list) }]
      }));
      saved++;
      console.log(`  ${seasonLabel(year)}: ${list.length} games${st.length > 1 ? `, ${st.length} groups` : ""}.`);
    }
  }
  console.log(`Done. ${saved} European seasons saved${fixture ? "" : `, ${requests} requests used`}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => { console.error(`Europe backfill failed: ${err.message}`); process.exit(1); });
}
