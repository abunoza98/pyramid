#!/usr/bin/env node
// Football Pyramids: checks every saved past season (data/history/<country>/<year>.json) and lists anything
// that can't be a real final table, then (with --repair) fixes what it can.
//
//   node scripts/audit-history.mjs                               report only (no API requests)
//   API_FOOTBALL_KEY=xxxx node scripts/audit-history.mjs --repair  also rebuild the broken tables
//   ... --repair --rebuild spain:2017:segunda,croatia:2018   also rebuild these seasons from results
//
// What it checks, per table:
//   - Unfinished: a club has played fewer games than a full season (2 x (clubs - 1)). API-Football sometimes
//     froze an old season's table mid-season (e.g. the 2017-18 Championship after 31 games).
//   - Numbers that don't add up: W + D + L <> P, GF/GA sums, positions not 1..n, the same club twice.
//   - The same club in two divisions in one season.
//   - Promotion and relegation that don't fit: a club that went down the next season but finished mid-table,
//     or went up from mid-table. This catches tables saved under the wrong season.
//
// Repair, for unfinished tables: ask the API for the table again; if it's still unfinished, rebuild it from
// the season's results (league games only), keeping any points deductions already shown.
// It writes data/history/AUDIT.md with every finding and what was done.

import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { COUNTRIES, clubName } from "./leagues.mjs";
import { zoneAt } from "./zones.mjs";
import { api, toRows, namesFor } from "./update-standings.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HIST = process.env.HIST_DIR ? path.resolve(process.env.HIST_DIR) : path.join(ROOT, "data", "history");
const PAUSE_MS = 1500;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const label = (y) => `${y}–${String(y + 1).slice(2)}`;
// 2019-20: many leagues stopped early because of Covid and were decided on points per game.
const CURTAILED = new Set([2019]);
// Other seasons cut short or played to a shorter format (country:year).
const SHORTENED = { "netherlands:2020": "Tweede Divisie abandoned (Covid)", "scotland:2020": "shortened Covid season" };
// Tables for one phase of a split season (Belgian play-offs, the Scottish split, Spain's 2020-21 phases):
// points carry over or the phase is short by design, so the full-season checks don't apply.
const PHASE = /play-?offs?|round|phase|champion|relegation|qualif|conference|europa|opening|closing|promotion|group$|cham$|relega$/i;
const isPhase = (g) => PHASE.test(g.name || "");
const groupsOf = (lg) => (lg.groups && lg.groups.length ? lg.groups : [{ name: "", rows: lg.rows || [] }]);
const fullSeason = (n) => 2 * (n - 1);

// expected: games in a full season. At least 2 x (clubs - 1); more where the league plays each other
// three or four times (Scotland, Croatia), learned from the longest season saved for that league and size.
export function checkTable(rows, expected) {
  const issues = [];
  const n = rows.length;
  if (!n) return [{ kind: "empty", text: "No clubs in the table." }];
  const full = Math.max(fullSeason(n), expected || 0);
  const minP = Math.min(...rows.map((r) => r.p)), maxP = Math.max(...rows.map((r) => r.p));
  const short = rows.filter((r) => r.p < full);
  if (short.length && short.length <= 2 && rows.length - short.length >= rows.length - 2 && maxP >= full)
    issues.push({ kind: "withdrawn", text: short.map((r) => `${r.team} played ${r.p}`).join(", ") + ` of ${full}: a club that withdrew, was expelled or had a game cancelled.` });
  else if (minP < full) issues.push({ kind: "unfinished", text: `Clubs have played ${minP === maxP ? minP : `${minP}–${maxP}`} games; a full season is ${full}.` });
  for (const r of rows) {
    if (r.w + r.d + r.l !== r.p) issues.push({ kind: "sums", text: `${r.team}: W ${r.w} + D ${r.d} + L ${r.l} is not P ${r.p}.` });
    const expect = 3 * r.w + r.d - (r.ded || 0);
    if (r.pts !== expect) issues.push({ kind: "points", text: `${r.team}: ${r.pts} pts, but ${r.w} wins and ${r.d} draws${r.ded ? ` less ${r.ded} deducted` : ""} make ${expect}.` });
  }
  const gf = rows.reduce((a, r) => a + r.gf, 0), ga = rows.reduce((a, r) => a + r.ga, 0);
  if (gf !== ga) issues.push({ kind: "sums", text: `Goals for (${gf}) and against (${ga}) don't match across the table.` });
  const pos = rows.map((r) => r.pos).sort((a, b) => a - b);
  if (pos.some((p, i) => p !== i + 1)) issues.push({ kind: "order", text: "Positions aren't 1 to " + n + "." });
  for (let i = 1; i < rows.length; i++) if (rows[i].pts > rows[i - 1].pts) { issues.push({ kind: "order", text: `${rows[i].team} (${rows[i].pts} pts) is below ${rows[i - 1].team} (${rows[i - 1].pts} pts).` }); break; }
  const seen = new Set();
  for (const r of rows) { if (seen.has(r.team)) issues.push({ kind: "duplicate", text: `${r.team} appears twice.` }); seen.add(r.team); }
  return issues;
}

// Countries that separate clubs level on points by their games against each other first.
const H2H = new Set(["spain", "italy", "portugal", "croatia", "turkey"]);
let REBUILD = new Set();

// Standings from a season's league results: 3 points a win, then (h2h) head-to-head points and goal
// difference between the clubs level, then goal difference and goals scored.
// opts.allRounds: count every league game (the Scottish split's last five rounds aren't "Regular Season").
// opts.split: names of the top six after the split, who finish 1-6 whatever their points.
export function tableFromFixtures(list, keep, opts = {}) {
  const t = new Map();
  const side = (team) => {
    const raw = String(team.name).trim();
    const name = clubName(raw, opts.country);
    if (!t.has(team.id)) t.set(team.id, { team: name, tid: team.id, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, res: [] });
    return t.get(team.id);
  };
  const games = list.filter((f) => (opts.allRounds ? !/play-?off/i.test(f.league?.round || "") : /regular season/i.test(f.league?.round || "Regular Season"))
    && ["FT", "AET", "PEN", "AWD", "WO"].includes(f.fixture?.status?.short) && f.goals?.home != null).sort((a, b) => a.fixture.timestamp - b.fixture.timestamp);
  const played = [];
  for (const f of games) {
    const h = side(f.teams.home), a = side(f.teams.away);
    const hg = f.goals.home, ag = f.goals.away;
    played.push({ h: f.teams.home.id, a: f.teams.away.id, hg, ag });
    for (const [me, gf, ga] of [[h, hg, ag], [a, ag, hg]]) {
      me.p++; me.gf += gf; me.ga += ga;
      const r = gf > ga ? "W" : gf < ga ? "L" : "D";
      me[r === "W" ? "w" : r === "D" ? "d" : "l"]++;
      me.res.push(r);
    }
  }
  const rows = [...t.values()].map((r) => {
    const ded = keep.get(r.team) || 0;
    const row = { pos: 0, team: r.team, p: r.p, w: r.w, d: r.d, l: r.l, gf: r.gf, ga: r.ga, pts: 3 * r.w + r.d - ded, tid: r.tid, form: r.res.slice(-5).join("") };
    if (ded) row.ded = ded;
    return row;
  });
  const overall = (a, b) => (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.team.localeCompare(b.team);
  // Mini-table between clubs level on points.
  const mini = (group) => {
    const ids = new Set(group.map((r) => r.tid)), m = new Map(group.map((r) => [r.tid, { pts: 0, gd: 0, gf: 0 }]));
    for (const g of played) if (ids.has(g.h) && ids.has(g.a)) {
      const H = m.get(g.h), A = m.get(g.a);
      H.gf += g.hg; A.gf += g.ag; H.gd += g.hg - g.ag; A.gd += g.ag - g.hg;
      if (g.hg > g.ag) H.pts += 3; else if (g.hg < g.ag) A.pts += 3; else { H.pts++; A.pts++; }
    }
    return m;
  };
  const order = (list) => {
    list.sort((a, b) => b.pts - a.pts || overall(a, b));
    if (!opts.h2h) return list;
    const out = [];
    for (let i = 0; i < list.length;) {
      let j = i; while (j < list.length && list[j].pts === list[i].pts) j++;
      const group = list.slice(i, j);
      if (group.length > 1) {
        const m = mini(group);
        group.sort((a, b) => m.get(b.tid).pts - m.get(a.tid).pts || m.get(b.tid).gd - m.get(a.tid).gd || overall(a, b));
      }
      out.push(...group); i = j;
    }
    return out;
  };
  let sorted;
  if (opts.split) {
    const top = rows.filter((r) => opts.split.has(r.team)), rest = rows.filter((r) => !opts.split.has(r.team));
    sorted = [...order(top), ...order(rest)];
  } else sorted = order(rows);
  sorted.forEach((r, i) => { r.pos = i + 1; });
  const level = sorted.filter((r, i) => sorted.some((o, j) => j !== i && o.pts === r.pts));
  return { rows: sorted, ties: level.length > 0 && !opts.h2h };
}

export async function main() {
  const repair = process.argv.includes("--repair");
  const ri = process.argv.indexOf("--rebuild");
  REBUILD = new Set(ri > -1 ? String(process.argv[ri + 1] || "").split(",").filter(Boolean) : []);
  const key = process.env.API_FOOTBALL_KEY;
  if (repair && !key) throw new Error("--repair needs API_FOOTBALL_KEY (the GitHub job sets it).");
  let requests = 0;
  const get = async (q) => {
    requests++;
    await sleep(PAUSE_MS);
    for (let i = 1; ; i++) {
      try { return await api(q, key); }
      catch (e) {
        if (i < 3 && /too many|limit|429/i.test(e.message)) { await sleep(8000); continue; }
        console.log(`  skipped ${q}: ${e.message}`); return { response: [] };
      }
    }
  };

  const findings = [];   // { country, year, league, group, kind, text, action }
  const add = (o) => { findings.push(o); console.log(`${o.country} ${label(o.year)} ${o.league}${o.group ? ` (${o.group})` : ""}: ${o.text}${o.action ? ` -> ${o.action}` : ""}`); };

  for (const c of COUNTRIES) {
    namesFor(c);
    let files = [];
    try { files = (await readdir(path.join(HIST, c.country))).filter((f) => /^\d{4}\.json$/.test(f)); } catch { continue; }
    const seasons = new Map();
    for (const f of files.sort()) seasons.set(Number(f.slice(0, 4)), JSON.parse(await readFile(path.join(HIST, c.country, f), "utf8")));
    const shown = (lg, year) => !((c.leagues.find((x) => x.id === lg.id) || {}).historyFrom > year);
    // Longest season seen per league and size (most clubs finish level, so use the most common games played).
    const longest = new Map();
    for (const [year, h] of seasons) if (!CURTAILED.has(year)) for (const lg of h.leagues) for (const g of groupsOf(lg)) {
      if (isPhase(g)) continue;
      const counts = {};
      for (const r of g.rows) counts[r.p] = (counts[r.p] || 0) + 1;
      const common = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 0);
      const k = `${lg.id}:${g.rows.length}`;
      longest.set(k, Math.max(longest.get(k) || 0, common));
    }

    for (const [year, h] of seasons) {
      let changed = false;
      for (const lg of h.leagues) {
        const cfg = c.leagues.find((x) => x.id === lg.id) || {};
        if (cfg.historyFrom > year) continue;   // not shown on the site
        const apiIds = cfg.groups ? cfg.groups.map((g) => g.apiId) : [cfg.apiId];
        for (const [gi, g] of groupsOf(lg).entries()) {
          const base = { country: c.name, year, league: lg.name, group: g.name };
          if (isPhase(g)) continue;
          if (cfg.split && lg.groups && lg.groups.length > 1) continue;   // combined below
          const expected = longest.get(`${lg.id}:${g.rows.length}`);
          const shortened = SHORTENED[`${c.country}:${year}`];
          // Write a fixed table back into the league itself (single-table leagues have no groups array).
          const put = (rows) => { if (lg.groups && lg.groups.length) lg.groups[gi].rows = rows; else lg.rows = rows; g.rows = rows; };
          for (const issue of checkTable(g.rows, expected)) {
            if (issue.kind === "unfinished" && shortened) { add({ ...base, ...issue, action: `${shortened}: left as is` }); continue; }
            if (issue.kind !== "unfinished" || !repair) { add({ ...base, ...issue, action: issue.kind === "unfinished" && CURTAILED.has(year) ? "season stopped early (Covid): left as is" : "" }); continue; }
            if (CURTAILED.has(year)) { add({ ...base, ...issue, action: "season stopped early (Covid): left as is" }); continue; }
            // 1. The API may have the finished table now.
            const id = lg.groups && apiIds.length === groupsOf(lg).length ? apiIds[gi] : apiIds[0];
            if (!id) { add({ ...base, ...issue, action: "no API league ID to repair from" }); continue; }
            const body = await get(`/standings?league=${id}&season=${year}`);
            const tables = (body?.response?.[0]?.league?.standings || []).filter((t) => Array.isArray(t) && t.length);
            const notes = [];
            const again = tables[0] ? toRows(tables[0], notes).rows : [];
            if (again.length === g.rows.length && !checkTable(again, expected).some((x) => x.kind === "unfinished") && !lg.groups) {
              put(again); changed = true;
              add({ ...base, ...issue, action: "replaced with the API's finished table" });
              continue;
            }
            // 2. Rebuild from the season's results, keeping deductions already shown.
            const fx = await get(`/fixtures?league=${id}&season=${year}`);
            const keep = new Map(g.rows.filter((r) => r.ded).map((r) => [r.team, r.ded]));
            const built = tableFromFixtures(fx?.response || [], keep, { h2h: H2H.has(c.country), country: c });
            const ok = built.rows.length === g.rows.length && !checkTable(built.rows, expected).some((x) => x.kind === "unfinished");
            if (!ok) { add({ ...base, ...issue, action: `couldn't rebuild (results found for ${built.rows.length} clubs, not all complete): check by hand` }); continue; }
            const top = built.rows.slice(0, 3).map((r) => `${r.pos}. ${r.team} ${r.pts}`).join(", ");
            put(built.rows); changed = true;
            if (keep.size) lg.notes = [...new Set([...(lg.notes || []).filter((n) => !/deducted/.test(n)), ...[...keep].map(([t, d]) => `${t}: ${d} point${d === 1 ? "" : "s"} deducted.`)])];
            add({ ...base, ...issue, action: `rebuilt from results (${top})${H2H.has(c.country) ? "; ties split by head-to-head" : ""}` });
          }
        }

        // --rebuild spain:2017:segunda,italy:2017 (country:year or country:year:league): rebuild every full table that season from results, even if it looks
        // complete (e.g. to redo ties with head-to-head).
        if (repair && (REBUILD.has(`${c.country}:${year}`) || REBUILD.has(`${c.country}:${year}:${lg.id}`)) && !(lg.groups && lg.groups.length > 1 && cfg.split)) {
          for (const [gi, g] of groupsOf(lg).entries()) {
            if (isPhase(g)) continue;
            const id = lg.groups && apiIds.length === groupsOf(lg).length ? apiIds[gi] : apiIds[0];
            if (!id) continue;
            const fx = await get(`/fixtures?league=${id}&season=${year}`);
            const keep = new Map(g.rows.filter((r) => r.ded).map((r) => [r.team, r.ded]));
            const built = tableFromFixtures(fx?.response || [], keep, { h2h: H2H.has(c.country), country: c });
            const base = { country: c.name, year, league: lg.name, group: g.name, kind: "rebuilt" };
            if (built.rows.length !== g.rows.length || built.rows.some((r) => r.p !== g.rows[0].p && r.p < Math.max(...g.rows.map((x) => x.p)))) {
              add({ ...base, text: "Asked to rebuild.", action: `results incomplete (${built.rows.length} clubs): kept the saved table` }); continue;
            }
            const moved = built.rows.filter((r) => (g.rows.find((x) => x.team === r.team) || {}).pos !== r.pos).map((r) => `${r.team} ${(g.rows.find((x) => x.team === r.team) || {}).pos || "?"}→${r.pos}`);
            if (lg.groups && lg.groups.length) lg.groups[gi].rows = built.rows; else lg.rows = built.rows;
            changed = true;
            add({ ...base, text: "Rebuilt from results with head-to-head tie-breaks.", action: moved.length ? `positions changed: ${moved.join(", ")}` : "no positions changed" });
          }
        }

        // Scottish Premiership: the API saves the 33-game table and the two split groups separately. Combine
        // them into the real 38-game final table: the top six after 33 games finish 1-6, the rest 7-12.
        if (repair && cfg.split && lg.groups && lg.groups.length > 1 && !CURTAILED.has(year)) {
          const full = lg.groups.find((g) => g.rows.length === (cfg.clubs || 12));
          const base = { country: c.name, year, league: lg.name, kind: "split" };
          if (!full) { add({ ...base, text: "Split season with no 33-game table.", action: "check by hand" }); continue; }
          const top = new Set(full.rows.filter((r) => r.pos <= cfg.split).map((r) => r.team));
          const fx = await get(`/fixtures?league=${cfg.apiId}&season=${year}`);
          const keep = new Map(full.rows.filter((r) => r.ded).map((r) => [r.team, r.ded]));
          const built = tableFromFixtures(fx?.response || [], keep, { allRounds: true, split: top, country: c });
          const games = new Set(built.rows.map((r) => r.p));
          if (built.rows.length !== full.rows.length || games.size !== 1 || [...games][0] <= full.rows[0].p) {
            add({ ...base, text: "Split season.", action: `couldn't combine (results for ${built.rows.length} clubs, games played ${[...games].join("/")}): left as is` }); continue;
          }
          lg.rows = built.rows; delete lg.groups;
          if (Array.isArray(cfg.zones)) lg.zones = cfg.zones;
          lg.notes = [...new Set([...(lg.notes || []), "After 33 games the league splits in two; the top six finish 1st–6th whatever their points."])];
          changed = true;
          add({ ...base, text: "Split season saved as separate tables.", action: `combined into the final ${[...games][0]}-game table (1. ${built.rows[0].team} ${built.rows[0].pts}, 12. ${built.rows[11]?.team})` });
        }
      }
      if (changed) await writeFile(path.join(HIST, c.country, `${year}.json`), JSON.stringify(h, null, 1) + "\n");
    }

    // Across seasons: one club in two divisions; promotion and relegation that don't fit the final positions.
    for (const [year, h] of seasons) {
      const where = new Map();
      for (const lg of h.leagues) if (shown(lg, year)) for (const g of groupsOf(lg)) if (!isPhase(g)) for (const r of g.rows) {
        if (where.has(r.team) && where.get(r.team) !== lg.name) add({ country: c.name, year, league: lg.name, kind: "duplicate", text: `${r.team} is also in the ${where.get(r.team)} this season.` });
        where.set(r.team, lg.name);
      }
      const next = seasons.get(year + 1);
      if (!next || CURTAILED.has(year)) continue;
      const tierOf = (s, team) => { for (const lg of s.leagues) for (const g of groupsOf(lg)) if (g.rows.some((r) => r.team === team)) return lg.tier; return null; };
      for (const lg of h.leagues) {
        if (lg.groups && lg.groups.length > 1) continue;
        const n = lg.rows.length;
        for (const r of lg.rows) {
          const t2 = tierOf(next, r.team);
          if (t2 == null) continue;
          const z = zoneAt(lg, r.pos), zl = z ? `${z.kind} ${z.label}` : "";
          if (t2 > lg.tier && /down|relegat|play-?off/i.test(zl)) continue;
          if (t2 < lg.tier && /top|promot|play-?off/i.test(zl)) continue;
          if (t2 > lg.tier && r.pos <= n - 6) add({ country: c.name, year, league: lg.name, kind: "continuity", text: `${r.team} finished ${r.pos} of ${n} but played a tier lower in ${label(year + 1)}.` });
          if (t2 < lg.tier && r.pos > 6) add({ country: c.name, year, league: lg.name, kind: "continuity", text: `${r.team} finished ${r.pos} of ${n} but played a tier higher in ${label(year + 1)}.` });
        }
      }
    }
  }

  // Report
  const order = ["split", "rebuilt", "unfinished", "continuity", "withdrawn", "order", "sums", "points", "duplicate", "empty"];
  const titles = { unfinished: "Tables that stop before the end of the season", continuity: "Promotion and relegation that don't fit the final positions",
    order: "Positions out of order", withdrawn: "Clubs that withdrew or were expelled (usually correct)",
    split: "Scottish Premiership split seasons", rebuilt: "Seasons rebuilt on request", sums: "Numbers that don't add up", points: "Points that don't match wins and draws", duplicate: "Clubs listed twice", empty: "Empty tables" };
  let md = `# Past seasons audit\n\nChecked ${new Date().toISOString().slice(0, 10)}. ${findings.length ? `${findings.length} findings.` : "Nothing found."}` +
    `${repair ? ` Repair mode: ${requests} API requests used.` : " Report only; run with --repair to fix unfinished tables."}\n`;
  for (const k of order) {
    const list = findings.filter((f) => f.kind === k);
    if (!list.length) continue;
    md += `\n## ${titles[k]} (${list.length})\n\n`;
    for (const f of list) md += `- **${f.country} ${label(f.year)}, ${f.league}${f.group ? ` (${f.group})` : ""}**: ${f.text}${f.action ? ` _${f.action}._` : ""}\n`;
  }
  await writeFile(path.join(HIST, "AUDIT.md"), md);
  console.log(`\n${findings.length} findings. Report written to data/history/AUDIT.md${repair ? `; ${requests} requests used` : ""}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => { console.error(`Audit failed: ${err.message}`); process.exit(1); });
}
