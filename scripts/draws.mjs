// Football Pyramids: cup draws kept by hand, for the gap between a draw being made and API-Football adding the ties
// (often a day or more). Listed in data/manual/draws.json; each round is added to the cup's fixtures file until the
// API has a round of the same name, then it simply stops being used (it can be deleted from the file any time after).
//
//   {
//     "england/efl-cup": {
//       "season": "2026–27",
//       "rounds": [{
//         "round": "Quarter-finals",                 the round's name as the fixture file calls it
//         "when": "Week of 14 December",              shown where a kick-off time would be
//         "around": "2026-12-15",                     a date in that week, so the round sorts after the others
//         "source": "EFL draw, 28 October 2026",      where the draw came from (not shown)
//         "ties": [
//           { "h": 1336, "a": { "winnerOf": 1640385 } },     club IDs; or the winner of a tie still to be played
//           { "h": 50, "a": 1343 }
//         ]
//       }]
//     }
//   }
//
// Club names, leagues and tiers come from the cup's own fixtures, so only IDs are needed. A "winnerOf" side shows as
// "Everton or Newcastle United" until that tie is decided, then as the winner, with no edit needed.
//
//   node scripts/draws.mjs        adds the draws to the saved fixture files (the build does this too)

import { readFile, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DONE = new Set(["FT", "AET", "PEN", "AWD", "WO"]);

export async function loadDraws(root = ROOT) {
  try { return JSON.parse(await readFile(path.join(root, "data", "manual", "draws.json"), "utf8")); }
  catch { return {}; }
}

// Who won a finished game, or null.
function winnerOf(f) {
  if (!f || !DONE.has(f.st)) return null;
  if (f.w === "h") return f.h;
  if (f.w === "a") return f.a;
  if (f.hg != null && f.hg !== f.ag) return f.hg > f.ag ? f.h : f.a;
  if (f.pen) return f.pen[0] > f.pen[1] ? f.h : f.a;
  return null;
}

// A saved fixtures file (country, league, season, groups[0].rounds) -> the same with any hand-kept draw rounds the
// API hasn't got yet. Rounds added this way have every fixture marked draw: 1, so running this again replaces them
// (picking up a "winnerOf" tie that has since been played) rather than adding them twice.
export function withDraws(fx, draws) {
  const entry = fx && draws && draws[`${fx.country}/${fx.league}`];
  if (!entry || !fx.groups || !fx.groups[0] || (entry.season && entry.season !== fx.season)) return fx;
  const g = fx.groups[0];
  const own = (r) => r.fixtures.length && r.fixtures.every((f) => f.draw);
  const rounds = g.rounds.filter((r) => !own(r));
  const teams = new Map(), byId = new Map();
  for (const r of rounds) for (const f of r.fixtures) {
    byId.set(f.id, f);
    for (const t of [f.h, f.a]) if (t && t.id != null && !teams.has(t.id)) teams.set(t.id, t);
  }
  const side = (x) => {
    if (x && typeof x === "object" && x.winnerOf != null) {
      const f = byId.get(x.winnerOf);
      const w = winnerOf(f);
      if (w) return { ...w };
      if (!f) return null;
      return { id: null, n: `${f.h.n} or ${f.a.n}`, from: [f.h.id, f.a.id].filter((v) => v != null) };
    }
    const t = teams.get(Number(x));
    return t ? { ...t } : null;
  };
  let added = 0;
  (entry.rounds || []).forEach((dr, ri) => {
    if (rounds.some((r) => r.key === dr.round)) return;   // the API has this round now
    const ts = Math.floor(Date.parse(`${dr.around}T12:00:00Z`) / 1000) || 0;
    const fixtures = [];
    (dr.ties || []).forEach((t, ti) => {
      const h = side(t.h), a = side(t.a);
      if (!h || !a) return;   // a club we can't name: leave the tie out rather than guess
      fixtures.push({ id: -(1000 * (ri + 1) + ti + 1), ts, st: "TBD", h, a, nodate: true, ...(dr.when ? { when: dr.when } : {}), draw: 1 });
    });
    if (!fixtures.length) return;
    rounds.push({ key: dr.round, label: dr.round, mid: ts, fixtures });
    added++;
  });
  if (!added && rounds.length === g.rounds.length) return fx;
  rounds.sort((a, b) => a.mid - b.mid);
  return { ...fx, groups: [{ ...g, rounds }, ...fx.groups.slice(1)] };
}

// Adds the draws to the saved fixture files. Returns the files changed.
export async function applyDraws(root = ROOT) {
  const draws = await loadDraws(root), changed = [];
  for (const key of Object.keys(draws)) {
    const file = path.join(root, "data", "fixtures", `${key}.json`);
    let fx;
    try { fx = JSON.parse(await readFile(file, "utf8")); } catch { continue; }
    const out = withDraws(fx, draws);
    if (JSON.stringify(out) === JSON.stringify(fx)) continue;
    await writeFile(file + ".tmp", JSON.stringify(out));
    await rename(file + ".tmp", file);
    changed.push(key);
  }
  return changed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  applyDraws().then((c) => console.log(c.length ? `Draws added to: ${c.join(", ")}` : "No draws to add."))
    .catch((e) => { console.error(`Draws failed: ${e.message}`); process.exit(1); });
}
