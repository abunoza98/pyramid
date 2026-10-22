#!/usr/bin/env node
// Football Pyramids: every league's fixtures and results for the current season, divided into rounds.
// Writes data/fixtures/<country>/<league>.json, then rebuilds the pages. Run every 6 hours by GitHub.
//
//   API_FOOTBALL_KEY=xxxx node scripts/update-fixtures.mjs         one request per league or group (about 40)
//   node scripts/update-fixtures.mjs --fixture test/fixtures-sample.json --out /tmp/fp   offline test
//
// Kick-off changes: each fixture keeps the time it had before, so the pages can say "Moved from Sat 1 Nov"
// for three weeks after a change is spotted.

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { COUNTRIES, EUROPE, NAMES } from "./leagues.mjs";
import { api, seasonLabel } from "./update-standings.mjs";
import { build } from "./build.mjs";
import { roundLabel, europeRounds, toRounds } from "./rounds.mjs";
export { roundLabel, europeRounds, toRounds };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const now = new Date();
const SEASON = Number(process.env.SEASON || (now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1));
const MOVED_DAYS = 21;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const name = (t) => { const raw = String(t?.name || "Unknown").trim(); return NAMES[raw] || raw; };

// One API fixture -> what the pages need.
export function slim(x, prev) {
  const st = x.fixture?.status?.short || "NS";
  const ts = x.fixture?.timestamp || 0;
  const f = {
    id: x.fixture.id, ts, st,
    h: { id: x.teams?.home?.id, n: name(x.teams?.home) },
    a: { id: x.teams?.away?.id, n: name(x.teams?.away) }
  };
  if (x.goals?.home != null) { f.hg = x.goals.home; f.ag = x.goals.away; }
  const sc = x.score || {};
  if (sc.halftime?.home != null && f.hg != null) f.ht = [sc.halftime.home, sc.halftime.away];
  if (sc.penalty?.home != null) f.pen = [sc.penalty.home, sc.penalty.away];
  if (x.teams?.home?.winner === true) f.w = "h"; else if (x.teams?.away?.winner === true) f.w = "a";
  if (x.fixture?.venue?.name) f.v = x.fixture.venue.name;
  if (x.fixture?.periods?.first) f.p1 = x.fixture.periods.first;
  if (x.fixture?.periods?.second) f.p2 = x.fixture.periods.second;
  // Kick-off moved since we last looked? (Ignore games whose time wasn't set yet.)
  if (prev) {
    if (prev.ts && prev.ts !== ts && prev.st !== "TBD") f.moved = { from: prev.ts, seen: now.toISOString() };
    else if (prev.moved && Date.now() - Date.parse(prev.moved.seen) < MOVED_DAYS * 86400000) f.moved = prev.moved;
  }
  return f;
}

async function main() {
  const args = process.argv.slice(2);
  const key = process.env.API_FOOTBALL_KEY;
  const fi = args.indexOf("--fixture"), oi = args.indexOf("--out");
  const outRoot = oi > -1 ? path.resolve(args[oi + 1]) : ROOT;
  const fixture = fi > -1 ? JSON.parse(await readFile(path.resolve(args[fi + 1]), "utf8")) : null;
  if (!fixture && !key) throw new Error("Set API_FOOTBALL_KEY (the GitHub job does this for you).");

  const get = async (id) => {
    if (fixture) return fixture[id] || { response: [] };
    for (let i = 1; ; i++) {
      await sleep(1500);   // API-Football refuses requests sent back to back
      try { return await api(`/fixtures?league=${id}&season=${SEASON}&timezone=UTC`, key); }
      catch (e) {
        if (i < 3 && /too many|limit|429/i.test(e.message)) { await sleep(8000); continue; }
        throw e;
      }
    }
  };

  let saved = 0, failed = 0;
  for (const c of [...COUNTRIES, EUROPE]) {
    for (const cfg of c.leagues) {
      const file = path.join(outRoot, "data", "fixtures", c.country, `${cfg.id}.json`);
      let prev = null;
      try { prev = JSON.parse(await readFile(file, "utf8")); } catch {}
      const prevById = new Map();
      for (const g of prev?.groups || []) for (const r of g.rounds) for (const f of r.fixtures) prevById.set(f.id, f);
      const parts = cfg.groups ? cfg.groups.map((g) => ({ apiId: g.apiId, name: g.name })) : [{ apiId: cfg.apiId, name: null }];
      try {
        const groups = [];
        for (const part of parts) {
          const body = await get(part.apiId);
          const list = (body.response || []).map((x) => ({ round: x.league?.round, f: slim(x, prevById.get(x.fixture.id)) }));
          if (c === EUROPE) europeRounds(list);
          if (!list.length) throw new Error(`no fixtures for league ${part.apiId}`);
          groups.push({ name: part.name, rounds: toRounds(list) });
        }
        const out = {
          country: c.country, countryName: c.name, league: cfg.id, name: cfg.name, tier: cfg.tier,
          season: seasonLabel(SEASON), updated: now.toISOString(), groups
        };
        const text = JSON.stringify(out);
        const same = prev && JSON.stringify({ ...prev, updated: null }) === JSON.stringify({ ...out, updated: null });
        if (same) continue;
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file + ".tmp", text);
        await rename(file + ".tmp", file);
        saved++;
        console.log(`${c.name} ${cfg.name}: ${groups.reduce((n, g) => n + g.rounds.reduce((m, r) => m + r.fixtures.length, 0), 0)} fixtures saved.`);
      } catch (e) {
        failed++;
        console.log(`${c.name} ${cfg.name}: ${e.message}. ${prev ? "Keeping the last good list." : "Skipped for now."}`);
      }
    }
  }
  console.log(`Fixtures: ${saved} league${saved === 1 ? "" : "s"} changed${failed ? `, ${failed} couldn't be updated` : ""}.`);
  const files = await build({ root: outRoot, outDir: outRoot });
  console.log(`Rebuilt ${files.length} files.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => { console.error(`Fixtures update failed: ${err.message}`); process.exit(1); });
}
