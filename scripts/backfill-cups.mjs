#!/usr/bin/env node
// Football Pyramids: past seasons of each domestic cup (FA Cup, DFB-Pokal…). For each season it saves every tie
// (data/history/<country>/cups/<cup>/<year>-fixtures.json, for the past-season bracket pages) and how far every club
// got (<year>.json, for the "Cup runs" chart on club pages). One request a season; seasons already saved are
// skipped (the "Backfill history" GitHub job runs it).
//
//   API_FOOTBALL_KEY=xxxx node scripts/backfill-cups.mjs             (--force to fetch saved seasons again)
//   node scripts/backfill-cups.mjs --fixture test/cups-history.json --out /tmp/fp     offline test

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { COUNTRIES } from "./leagues.mjs";
import { api } from "./update-standings.mjs";
import { seasonFor, seasonLabel } from "./season.mjs";
import { slim } from "./update-fixtures.mjs";
import { toRounds, cupRounds, cupStage } from "./rounds.mjs";
import { summarise, learnLabels } from "./cupruns.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const now = new Date();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const exists = (f) => access(f).then(() => true, () => false);

const slugOf = (n) => String(n || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
async function leaguesIn(root, country, year) {
  const out = new Map();
  try {
    const h = JSON.parse(await readFile(path.join(root, "data", "history", country, `${year}.json`), "utf8"));
    for (const lg of h.leagues || []) for (const r of lg.groups ? lg.groups.flatMap((g) => g.rows) : lg.rows || []) {
      const t = { s: lg.short || lg.name, tier: lg.tier };
      if (r.tid) out.set(r.tid, t);
      out.set("n:" + slugOf(r.team), t);
    }
  } catch {}
  return out;
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
    const cupSeason = cup.calendar ? { calendar: true } : c;
    const years = (body?.response?.[0]?.seasons || []).map((s) => s.year).filter((y) => y < seasonFor(cupSeason) && (!cup.until || y <= cup.until)).sort((a, b) => a - b);
    const dir = path.join(outRoot, "data", "history", c.country, "cups", cup.id);
    const done = [];
    for (const year of years) {
      const file = path.join(dir, `${year}.json`), fxFile = path.join(dir, `${year}-fixtures.json`);
      if (!force && await exists(file) && await exists(fxFile)) { try { done.push(JSON.parse(await readFile(file, "utf8"))); } catch {} continue; }
      const fx = await get(`/fixtures?league=${cup.apiId}&season=${year}&timezone=UTC`);
      let list = cupStage((fx.response || []).map((x) => ({ round: x.league?.round, f: slim(x) })), cup);
      if (!list.length) continue;
      cupRounds(list, cup.rounds);
      // Each club's league that season ("PL", "L2"…), from the saved tables, for the tags and giant-killings.
      const tags = await leaguesIn(outRoot, c.country, year);
      for (const { f } of list) for (const side of [f.h, f.a]) {
        const t = tags.get(side.id) || tags.get("n:" + slugOf(side.n));
        if (t) { side.t = t.s; side.tier = t.tier; }
      }
      if (cup.bothTier) list = list.filter(({ f }) => f.h.tier === cup.bothTier && f.a.tier === cup.bothTier);
      if (!list.length) continue;
      const rounds = toRounds(list);
      const s = summarise(rounds, { ...learnLabels(done), ...(cup.dist || {}) });
      const out = { country: c.country, cup: cup.id, name: cup.name, season: seasonLabel(year, cupSeason), year, ...s };
      await mkdir(dir, { recursive: true });
      await writeFile(fxFile, JSON.stringify({ country: c.country, countryName: c.name, league: cup.id, name: cup.name, cup: true,
        season: seasonLabel(year, cupSeason), year, groups: [{ name: null, rounds }] }) + "\n");
      await writeFile(file, JSON.stringify(out) + "\n");
      done.push(out);
      saved++;
      console.log(`${c.name} ${cup.name} ${seasonLabel(year, c)}: ${Object.keys(s.clubs).length} clubs${s.winner ? `, won by ${s.winner.n}` : ""}.`);
    }
  }
  console.log(`Done. ${saved} cup season${saved === 1 ? "" : "s"} saved${fixture ? "" : `, ${requests} requests used`}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => { console.error(`Cup backfill failed: ${err.message}`); process.exit(1); });
}
