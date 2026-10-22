#!/usr/bin/env node
// Football Pyramids: what does API-Football have for a country? Lists every league competition with its ID,
// and for those with tables: club count, groups, the zones from the API's own descriptions, and the club names.
// Used to set up new countries in scripts/leagues.mjs.
//
//   API_FOOTBALL_KEY=xxxx node scripts/scan-leagues.mjs Portugal Netherlands "England:43,50,51" "UEFA:2,3,848"
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
    // With IDs: look those up directly (works for cups and European competitions too). Without: every league in the country.
    let list = [];
    if (ids) { for (const id of ids) { const x = ((await get(`/leagues?id=${id}`, key)).response || [])[0]; if (x) list.push(x); } }
    else list = (await get(`/leagues?country=${encodeURIComponent(country)}&season=${SEASON}&type=league`, key)).response || [];
    const rows = list.map((x) => ({ id: x.league.id, name: x.league.name,
      st: !!(x.seasons || []).find((s) => s.year === SEASON)?.coverage?.standings }))
      .sort((a, b) => a.id - b.id);
    for (const r of rows) console.log(`  ${r.id}\t${r.name}\t${r.st ? "tables" : "no tables"}`);
    const pick = rows.filter((r) => (ids ? ids.includes(r.id) : r.st && !SKIP.test(r.name))).slice(0, ids ? 99 : MAX_PER_COUNTRY);
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
      if (ids) {
        // Round names and dates, so cup rounds (qualifying, league phase, knockouts) can be set up.
        const fx = (await get(`/fixtures?league=${r.id}&season=${SEASON}&timezone=UTC`, key)).response || [];
        const rounds = new Map();
        for (const x of fx) {
          const k = x.league?.round || "?";
          if (!rounds.has(k)) rounds.set(k, { n: 0, from: x.fixture.date, to: x.fixture.date, st: {} });
          const o = rounds.get(k);
          o.n++;
          if (x.fixture.date < o.from) o.from = x.fixture.date;
          if (x.fixture.date > o.to) o.to = x.fixture.date;
          o.st[x.fixture.status?.short] = (o.st[x.fixture.status?.short] || 0) + 1;
        }
        console.log(`     rounds (${fx.length} games):`);
        for (const [k, o] of [...rounds.entries()].sort((a, b) => a[1].from.localeCompare(b[1].from))) {
          console.log(`       ${k}: ${o.n} games, ${o.from.slice(0, 10)} to ${o.to.slice(0, 10)}, ${Object.entries(o.st).map(([a, b]) => a + " " + b).join(", ")}`);
        }
        const ko = fx.filter((x) => !/league|group|qualif/i.test(x.league?.round || "")).slice(0, 3);
        for (const x of ko) console.log(`       e.g. ${x.league.round}: ${x.teams.home.name} v ${x.teams.away.name} (${x.fixture.status.short}${x.score?.penalty?.home != null ? ", pens" : ""})`);
      }
    }
    console.log("");
  }
}

main().catch((e) => { console.error(`Scan failed: ${e.message}`); process.exit(1); });
