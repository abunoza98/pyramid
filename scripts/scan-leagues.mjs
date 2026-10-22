#!/usr/bin/env node
// Football Pyramids: what does API-Football have for a country? Lists every league competition with its ID,
// and for those with tables: club count, groups, the zones from the API's own descriptions, and the club names.
// Used to set up new countries in scripts/leagues.mjs.
//
//   API_FOOTBALL_KEY=xxxx node scripts/scan-leagues.mjs Portugal Netherlands "England:43,50,51"
//
// "Country:1,2,3" scans only those league IDs (useful for England, which has dozens of leagues).
// About one request per country plus one per league scanned, spaced out so API-Football doesn't refuse them.

import { api, seasonLabel } from "./update-standings.mjs";

const now = new Date();
const SEASON = Number(process.env.SEASON || (now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1));
const SKIP = /women|femin|femen|frauen|dames|vrouwen|kadın|ženska|u-?1\d|u-?2\d|youth|junior|primavera|reserve|futsal|beach/i;
const MAX_PER_COUNTRY = 10;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(q, key) {
  for (let i = 1; ; i++) {
    await sleep(2500);
    try { return await api(q, key); }
    catch (e) {
      if (i < 3 && /too many|limit|429/i.test(e.message)) { await sleep(8000); continue; }
      console.log(`  ! ${q}: ${e.message}`);
      return { response: [] };
    }
  }
}

async function main() {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("Set API_FOOTBALL_KEY.");
  const args = process.argv.slice(2);
  console.log(`Season ${seasonLabel(SEASON)}\n`);
  for (const arg of args) {
    const [country, only] = arg.split(":");
    const ids = only ? only.split(",").map(Number) : null;
    console.log(`=== ${country} ===`);
    const list = (await get(`/leagues?country=${encodeURIComponent(country)}&season=${SEASON}&type=league`, key)).response || [];
    const rows = list.map((x) => ({ id: x.league.id, name: x.league.name,
      st: !!(x.seasons || []).find((s) => s.year === SEASON)?.coverage?.standings }))
      .sort((a, b) => a.id - b.id);
    for (const r of rows) console.log(`  ${r.id}\t${r.name}\t${r.st ? "tables" : "no tables"}`);
    const pick = rows.filter((r) => r.st && (ids ? ids.includes(r.id) : !SKIP.test(r.name))).slice(0, ids ? 99 : MAX_PER_COUNTRY);
    for (const r of pick) {
      const st = (await get(`/standings?league=${r.id}&season=${SEASON}`, key)).response?.[0]?.league?.standings || [];
      const tables = st.filter((t) => Array.isArray(t) && t.length);
      console.log(`\n  -- ${r.id} ${r.name}: ${tables.length} table${tables.length === 1 ? "" : "s"} (${tables.map((t) => t.length).join(" + ")} clubs)`);
      for (const t of tables) {
        if (tables.length > 1) console.log(`     [${t[0].group}]`);
        // Zones as the API describes them: "1-2 Promotion - Primeira Liga"
        const zones = [];
        for (const row of t.slice().sort((a, b) => a.rank - b.rank)) {
          const last = zones[zones.length - 1];
          if (!row.description) continue;
          if (last && last.d === row.description && last.to === row.rank - 1) last.to = row.rank;
          else zones.push({ from: row.rank, to: row.rank, d: row.description });
        }
        console.log(`     zones: ${zones.map((z) => `${z.from}${z.to !== z.from ? "-" + z.to : ""} ${z.d}`).join(" | ") || "(none)"}`);
        console.log(`     played: ${Math.min(...t.map((x) => x.all?.played ?? 0))}-${Math.max(...t.map((x) => x.all?.played ?? 0))}`);
        console.log(`     clubs: ${t.map((x) => x.team?.name).join(", ")}`);
      }
    }
    console.log("");
  }
}

main().catch((e) => { console.error(`Scan failed: ${e.message}`); process.exit(1); });
