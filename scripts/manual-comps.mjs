// Competitions no API covers yet, kept by hand in data/manual/<country>/<competition>/<year>.json (the Australian
// Championship). Each file lists the groups and every match; this turns it into the same shapes the API data takes:
// `comp` (group tables, worked out from the results) and `fx` (a fixtures file with group-stage and knockout
// rounds), so the European competition page, club pages and fixture lists can show it unchanged.
// Nothing here is live: results only appear once they're added to the file.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { COUNTRIES, venueZone } from "./leagues.mjs";

const STAGES = { qf: "Quarter-finals", sf: "Semi-finals", final: "Final" };

// Each club's API ID and state league in a season, from the feeder league's table (its groups are the states).
async function clubsOf(root, country, feeder, year) {
  const files = [path.join(root, "data", `${country}.json`), path.join(root, "data", "history", country, `${year}.json`)];
  const out = {};
  for (const f of files) {
    let d;
    try { d = JSON.parse(await readFile(f, "utf8")); } catch { continue; }
    if (Number(d.year ?? String(d.season).slice(0, 4)) !== year) continue;
    const lg = (d.leagues || []).find((l) => l.id === feeder);
    for (const g of (lg && lg.groups) || []) for (const r of g.rows) out[r.team] = { tid: r.tid || null, state: g.name, pos: r.pos, rows: g.rows };
  }
  return out;
}

const noon = (d) => Date.parse(`${d}T12:00:00+10:00`) / 1000;

function build(cfg, def, ed, clubs) {
  const year = ed.year;
  const tag = (n) => {
    const c = clubs[n] || {};
    return { id: c.tid || null, n, ...(c.state ? { t: `${def.feederShort || "NPL"} ${c.state}`, tier: 2 } : {}) };
  };
  // Group-stage rounds by week from the first match, unless the file says which round.
  const first = Math.min(...ed.matches.filter((m) => m.g && !m.nodate).map((m) => m.at ? Date.parse(m.at) / 1000 : noon(m.d)));
  const monday = (() => { const d = new Date(first * 1000); d.setUTCHours(0, 0, 0, 0); return d.getTime() / 1000 - ((d.getUTCDay() + 6) % 7) * 86400; })();
  const fixtures = ed.matches.map((m, i) => {
    const ts = m.at ? Date.parse(m.at) / 1000 : m.d ? noon(m.d) : 0;
    const done = Array.isArray(m.s);
    const f = { id: -(year * 1000 + i + 1), ts, st: done ? (m.pen ? "PEN" : m.aet ? "AET" : "FT") : m.at ? "NS" : "TBD", h: tag(m.h), a: tag(m.a) };
    if (done) { f.hg = m.s[0]; f.ag = m.s[1]; f.p1 = ts; f.p2 = ts + 3600; }
    if (m.pen) f.pen = m.pen;
    // The shootout winner: given (so), or from the shootout score (pen), so a group-stage bonus point is never missed.
    if (m.so) f.so = m.so; else if (m.pen && m.pen[0] !== m.pen[1]) f.so = m.pen[0] > m.pen[1] ? "h" : "a";
    if (m.v) f.v = m.v;
    if (m.nodate) f.nodate = true;
    const z = venueZone(cfg, f, (clubs[m.h] || {}).state);
    if (z) f.z = z;
    f.stage = m.g ? "lp" : "ko";
    f._g = m.g || null;
    f._r = m.g ? m.r || Math.floor((ts - monday) / (7 * 86400)) + 1 : null;
    f._k = m.stage || null;
    return f;
  });
  // Rounds, in order: Round 1-6 of the group stage, then the knockouts.
  const rounds = [];
  const roundOf = (key, label) => {
    let r = rounds.find((x) => x.key === key);
    if (!r) { r = { key, label, fixtures: [] }; rounds.push(r); }
    return r;
  };
  for (let n = 1; n <= (ed.rounds || 0); n++) roundOf(`Round ${n}`, `Round ${n}`);
  for (const f of fixtures.filter((x) => x.stage === "lp").sort((a, b) => a.ts - b.ts)) roundOf(`Round ${f._r}`, `Round ${f._r}`).fixtures.push(f);
  for (const k of Object.keys(STAGES)) for (const f of fixtures.filter((x) => x._k === k)) roundOf(STAGES[k], STAGES[k]).fixtures.push(f);
  for (const r of rounds) {
    // A game whose date isn't known goes last in its round (and is listed under "Date not confirmed").
    const known = r.fixtures.filter((f) => !f.nodate).map((f) => f.ts);
    for (const f of r.fixtures) if (f.nodate) { f.ts = known.length ? Math.max(...known) + 1 : 0; if (f.p1) { f.p1 = f.ts; f.p2 = f.ts + 3600; } }
    r.fixtures.sort((a, b) => a.ts - b.ts);
    const ts = r.fixtures.map((f) => f.ts).filter(Boolean);
    r.mid = ts.length ? ts[Math.floor(ts.length / 2)] : 0;
  }
  const groupOf = {};
  for (const f of fixtures) { groupOf[f.id] = f._g; delete f._g; delete f._r; delete f._k; }

  // Group tables from the results: 3 for a win, 1 for a draw; with shootouts, the shootout winner gets one more.
  // Ordered by points, then goal difference, then goals scored (how the 2025 tables were settled).
  const groups = Object.entries(ed.groups).map(([letter, names]) => {
    const rows = names.map((n) => ({ team: n, tid: (clubs[n] || {}).tid || undefined, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0, form: "" }));
    const row = (n) => rows.find((r) => r.team === n);
    for (const f of fixtures.filter((x) => groupOf[x.id] === letter && x.hg != null).sort((a, b) => a.ts - b.ts)) {
      for (const [me, gf, ga, side] of [[f.h.n, f.hg, f.ag, "h"], [f.a.n, f.ag, f.hg, "a"]]) {
        const r = row(me);
        if (!r) continue;
        r.p++; r.gf += gf; r.ga += ga;
        if (gf > ga) { r.w++; r.pts += 3; r.form += "W"; }
        else if (gf < ga) { r.l++; r.form += "L"; }
        else { r.d++; r.pts += 1 + (ed.shootoutPoints && f.so === side ? 1 : 0); r.form += "D"; }
      }
    }
    rows.sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.team.localeCompare(b.team));
    rows.forEach((r, i) => { r.pos = i + 1; r.form = r.form.slice(-5); if (!r.tid) delete r.tid; });
    return { name: `Group ${letter}`, rows };
  });

  const finished = fixtures.length && fixtures.every((f) => f.hg != null) && rounds.some((r) => r.key === "Final" && r.fixtures.length);
  const updated = new Date(`${ed.updated}T12:00:00+10:00`).toISOString();
  const notes = [
    ...(ed.shootoutPoints ? ["A drawn game goes to a penalty shootout: the winner gets 2 points, the loser 1 (both shown as draws)."] : []),
    ...(finished ? [] : ["Results are added by hand after each matchday: there are no live scores for this competition yet."])
  ];
  const comp = {
    id: def.id, name: def.name, short: def.short, tier: 2, final: !!finished, asItStands: !finished, stage: "groups", matchdays: ed.rounds,
    updated, notes, groups, zones: [{ from: 1, to: 2, kind: "top", label: "Quarter-finals" }]
  };
  const fx = {
    country: cfg.country, countryName: cfg.name, league: def.id, name: def.name, tier: 2, cup: true, manual: true,
    season: ed.season, year, updated, groups: [{ name: "", rounds }]
  };
  return { comp, fx };
}

// Who qualified and why, from the feeder league's final tables: each state's premier, or, when that's a
// foundation club, the highest-placed club that isn't. Checked against the clubs actually in the groups.
function qualifiers(def, ed, clubs) {
  const inGroups = new Set(Object.values(ed.groups).flat());
  const foundation = new Set(ed.foundation || []);
  const states = {};
  for (const [team, c] of Object.entries(clubs)) if (c.state && !states[c.state]) states[c.state] = c.rows;
  return Object.entries(states).map(([state, rows]) => {
    const sorted = rows.slice().sort((a, b) => a.pos - b.pos);
    const premier = sorted[0];
    const pick = sorted.find((r) => !foundation.has(r.team));
    const actual = Object.values(ed.groups).flat().find((n) => (clubs[n] || {}).state === state && !foundation.has(n));
    if (pick && actual && pick.team !== actual) console.warn(`${def.name} ${ed.season}: ${state} rule gives ${pick.team}, groups have ${actual}`);
    const team = actual || (pick && inGroups.has(pick.team) ? pick.team : null);
    if (!team) return null;
    const pos = (sorted.find((r) => r.team === team) || {}).pos;
    return { state, team, tid: (clubs[team] || {}).tid || null, pos, premier: premier.team, premierIsFoundation: foundation.has(premier.team) && premier.team !== team };
  }).filter(Boolean);
}

// { "australia/australian-championship": { def, editions: [{ year, season, comp, fx, ed, qualifiers }] newest first } }
export async function loadManual(root) {
  const out = {};
  for (const cfg of COUNTRIES) for (const def of cfg.manual || []) {
    const dir = path.join(root, "data", "manual", cfg.country, def.id);
    let files = [];
    try { files = (await readdir(dir)).filter((f) => /^\d{4}\.json$/.test(f)); } catch { continue; }
    const editions = [];
    for (const f of files) {
      const ed = JSON.parse(await readFile(path.join(dir, f), "utf8"));
      const clubs = await clubsOf(root, cfg.country, def.feeder, ed.year);
      for (const n of Object.values(ed.groups).flat()) if (!clubs[n]) console.warn(`${def.name} ${ed.season}: ${n} isn't in that season's ${def.feeder} table`);
      editions.push({ year: ed.year, season: ed.season, ed, ...build(cfg, def, ed, clubs), qualifiers: qualifiers(def, ed, clubs) });
    }
    if (editions.length) out[`${cfg.country}/${def.id}`] = { cfg, def, editions: editions.sort((a, b) => b.year - a.year) };
  }
  return out;
}
