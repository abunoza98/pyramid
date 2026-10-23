#!/usr/bin/env node
// Football Pyramids: past seasons of each domestic cup (FA Cup, DFB-Pokal…), boiled down to how far every club
// got, for the "Cup runs" chart on club pages. Saved to data/history/<country>/cups/<cup>/<year>.json.
// One request a season; seasons already saved are skipped (the "Backfill history" GitHub job runs it).
//
//   API_FOOTBALL_KEY=xxxx node scripts/backfill-cups.mjs             (--force to fetch saved seasons again)
//   node scripts/backfill-cups.mjs --fixture test/cups-history.json --out /tmp/fp     offline test

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { COUNTRIES } from "./leagues.mjs";
import { api, seasonLabel } from "./update-standings.mjs";
import { slim } from "./update-fixtures.mjs";
import { toRounds, cupRounds } from "./rounds.mjs";
import { summarise, learnLabels } from "./cupruns.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const now = new Date();
const CURRENT = Number(process.env.SEASON || (now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
    await sleep(1500);   // API-Football refuses requests sent back to back
    for (let i = 1; ; i++) {
      try { return await api(q, key); }
      catch (e) {
        if (i < 3 && /too many|limit|429/i.test(e.message)) { await sleep(8000); continue; }
        console.log(`  skipped ${q}: ${e.message}`); return { response: [] };
      }
    }
  };

  let saved = 0;
  for (const c of COUNTRIES) for (const cup of c.cups || []) {
    const body = await get(`/leagues?id=${cup.apiId}`);
    const years = (body?.response?.[0]?.seasons || []).map((s) => s.year).filter((y) => y < CURRENT).sort((a, b) => a - b);
    const dir = path.join(outRoot, "data", "history", c.country, "cups", cup.id);
    const done = [];
    for (const year of years) {
      const file = path.join(dir, `${year}.json`);
      if (!force && await exists(file)) { try { done.push(JSON.parse(await readFile(file, "utf8"))); } catch {} continue; }
      const fx = await get(`/fixtures?league=${cup.apiId}&season=${year}&timezone=UTC`);
      const list = (fx.response || []).map((x) => ({ round: x.league?.round, f: slim(x) }));
      if (!list.length) continue;
      cupRounds(list, cup.rounds);
      const s = summarise(toRounds(list), learnLabels(done));
      const out = { country: c.country, cup: cup.id, name: cup.name, season: seasonLabel(year), year, ...s };
      await mkdir(dir, { recursive: true });
      await writeFile(file, JSON.stringify(out) + "\n");
      done.push(out);
      saved++;
      console.log(`${c.name} ${cup.name} ${seasonLabel(year)}: ${Object.keys(s.clubs).length} clubs${s.winner ? `, won by ${s.winner.n}` : ""}.`);
    }
  }
  console.log(`Done. ${saved} cup season${saved === 1 ? "" : "s"} saved${fixture ? "" : `, ${requests} requests used`}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => { console.error(`Cup backfill failed: ${err.message}`); process.exit(1); });
}
