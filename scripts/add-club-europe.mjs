// Add European competition history to club pages using saved UEFA fixture history/current fixture JSON.
// No football-data API calls are made here.
import { readFile, writeFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const FP = require("../assets/render.js");
const esc = FP.esc;

const COMPS = [
  { id: "champions-league", name: "Champions League", short: "UCL", cls: "ucl" },
  { id: "europa-league", name: "Europa League", short: "UEL", cls: "uel" },
  { id: "conference-league", name: "Conference League", short: "UECL", cls: "uecl" }
];
const DONE = new Set(["FT", "AET", "PEN", "AWD", "WO"]);
const clean = (name) => FP.slug(name).replace(/-fc$/, "");
const sameTeam = (team, club, tid) => !!team && ((tid && team.id && Number(team.id) === Number(tid)) || clean(team.n) === clean(club));
const hasClub = (f, club, tid) => sameTeam(f.h, club, tid) || sameTeam(f.a, club, tid);

function seasonPath(season) {
  return String(season || "").replace(/–/g, "-").replace(/\s+/g, "");
}

function friendlyRound(round) {
  const s = String(round?.label || round?.key || "").trim();
  const stage = round?.fixtures?.[0]?.stage;
  if (!s) return "European campaign";
  if (stage === "lp") return /group/i.test(s) ? "Group stage" : "League phase";
  if (/league (phase|stage)|regular season/i.test(s)) return "League phase";
  if (/group stage|group [a-z0-9]+$/i.test(s)) return "Group stage";
  if (/knockout.*play/i.test(s)) return "Knockout play-offs";
  if (/round of 16|1\/8/i.test(s)) return "Round of 16";
  if (/quarter/i.test(s)) return "Quarter-finals";
  if (/semi/i.test(s)) return "Semi-finals";
  if (/final/i.test(s) && !/qual/i.test(s)) return "Final";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function wonFinal(round, club, tid) {
  if (!round || !/final/i.test(String(round.label || round.key || "")) || /qual/i.test(String(round.label || round.key || ""))) return false;
  for (const tie of FP.tiesOf({ fixtures: round.fixtures || [] })) {
    const mine = tie.teams.findIndex((t) => sameTeam(t, club, tid));
    if (mine > -1 && tie.done && tie.winner === mine) return true;
  }
  return false;
}

function runFromFixtures(fx, club, tid, current) {
  if (!fx) return null;
  const rounds = [];
  for (const group of fx.groups || []) for (const round of group.rounds || []) {
    const mine = (round.fixtures || []).filter((f) => hasClub(f, club, tid));
    if (mine.length) rounds.push({ round, mine });
  }
  if (!rounds.length) return null;

  const last = rounds[rounds.length - 1];
  const won = wonFinal(last.round, club, tid);
  const upcoming = current && last.mine.some((f) => !DONE.has(f.st) && !["CANC", "PST", "ABD"].includes(f.st));
  return {
    year: Number(fx.year ?? String(fx.season || "").slice(0, 4)),
    season: fx.season || String(fx.year || ""),
    stage: won ? "Winners" : friendlyRound(last.round),
    won,
    current: !!current && !won && upcoming
  };
}

async function competitionSeasons(comp) {
  const out = [];
  const dir = `data/history/europe/${comp.id}`;
  let files = [];
  try { files = (await readdir(dir)).filter((f) => /^\d{4}-fixtures\.json$/.test(f)).sort(); } catch {}
  for (const file of files) {
    try { out.push({ fx: JSON.parse(await readFile(`${dir}/${file}`, "utf8")), current: false }); } catch {}
  }
  try { out.push({ fx: JSON.parse(await readFile(`data/fixtures/europe/${comp.id}.json`, "utf8")), current: true }); } catch {}
  return out;
}

const EURO_STYLE = `<style data-europe-runs-style>
.cl-euro-runs .cup-note{margin-bottom:12px}.er-legend{display:flex;flex-wrap:wrap;gap:8px 14px;margin:0 0 14px;font-size:12px;color:var(--muted)}.er-legend span{display:inline-flex;align-items:center;gap:6px}.er-list{list-style:none;margin:0;padding:0;display:grid;gap:4px}.er-row{display:grid;grid-template-columns:70px 16px minmax(0,1fr);align-items:center;gap:10px;padding:8px 2px;border-bottom:1px solid var(--rule)}.er-season{font:500 12px/1.3 var(--mono);color:var(--muted)}.er-dot{display:inline-block;width:11px;height:11px;border-radius:50%;box-shadow:0 0 0 1px rgba(18,27,42,.18)}.er-dot.er-ucl{background:#5267D9}.er-dot.er-uel{background:#E67E22}.er-dot.er-uecl{background:#24A66A}.er-dot.won{box-shadow:0 0 0 2px #E8B931,0 0 0 4px rgba(232,185,49,.24)}.er-run{min-width:0;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.er-run a{color:var(--ink);text-decoration:none}.er-run a:hover{color:var(--accent);text-decoration:underline}.er-run span{font-size:13px;color:var(--muted)}@media(max-width:520px){.er-row{grid-template-columns:62px 14px minmax(0,1fr);gap:7px}.er-run{display:grid;gap:1px}}
</style>`;

function europeanRunsHTML(runs) {
  if (!runs.length) return "";
  const legend = COMPS.map((c) => `<span><i class="er-dot er-${c.cls}" aria-hidden="true"></i>${esc(c.name)}</span>`).join("") +
    '<span><i class="er-dot er-ucl won" aria-hidden="true"></i>Competition winner</span>';
  const rows = runs.map((r) => {
    const href = r.current ? `../../../europe/${r.comp.id}/` : `../../../europe/${r.comp.id}/${seasonPath(r.season)}/`;
    return '<li class="er-row"><span class="er-season">' + esc(r.season) + '</span>' +
      '<i class="er-dot er-' + r.comp.cls + (r.won ? " won" : "") + '" aria-hidden="true"></i>' +
      '<span class="er-run"><a href="' + esc(href) + '"><strong>' + esc(r.comp.name) + '</strong></a>' +
      '<span>' + esc(r.stage) + (r.current ? " · current" : "") + "</span></span></li>";
  }).join("");
  return '<section class="cl-sec cl-euro-runs" id="europe-runs"><div class="cl-sec-h"><h2>European runs</h2></div>' +
    '<p class="cup-note">Furthest stage reached in each UEFA competition covered by Football Pyramids.</p>' +
    '<div class="er-legend" aria-label="European competition key">' + legend + '</div><ul class="er-list">' + rows + "</ul></section>";
}

function insertEuropeanRuns(html, section) {
  html = html.replace(/<style data-europe-runs-style>[\s\S]*?<\/style>/, "");
  html = html.replace(/<section class="cl-sec cl-euro-runs"[\s\S]*?<\/section>/, "");
  if (!section) return html;
  const achievements = html.match(/<section class="cl-sec cl-achievements"[\s\S]*?<\/section>/);
  if (achievements) return html.replace(achievements[0], achievements[0] + EURO_STYLE + section);
  const journey = html.match(/<section class="cl-sec" id="journey">[\s\S]*?<\/section>/);
  if (journey) return html.replace(journey[0], journey[0] + EURO_STYLE + section);
  const fixtures = '<div class="cl-cols">';
  return html.includes(fixtures) ? html.replace(fixtures, EURO_STYLE + section + fixtures) : html;
}

// Build one UEFA-history index up front, rather than re-scanning every European fixture for every domestic club page.
const europeByClub = new Map();
for (const comp of COMPS) {
  for (const season of await competitionSeasons(comp)) {
    const teams = new Map();
    for (const group of season.fx?.groups || []) for (const round of group.rounds || []) for (const f of round.fixtures || []) {
      for (const t of [f.h, f.a]) if (t?.n) teams.set(clean(t.n), t);
    }
    for (const team of teams.values()) {
      const run = runFromFixtures(season.fx, team.n, team.id, season.current);
      if (!run) continue;
      const key = clean(team.n);
      if (!europeByClub.has(key)) europeByClub.set(key, []);
      europeByClub.get(key).push({ ...run, comp });
    }
  }
}
for (const runs of europeByClub.values()) {
  runs.sort((a, b) => b.year - a.year || COMPS.findIndex((c) => c.id === a.comp.id) - COMPS.findIndex((c) => c.id === b.comp.id));
}

let search = [];
try { search = JSON.parse(await readFile("data/search.json", "utf8")); } catch {}
const clubs = new Map();
for (const item of search) {
  if (item.type !== "club" || !item.path || !item.name) continue;
  const existing = clubs.get(item.path);
  if (!existing || (!item.past && existing.past)) clubs.set(item.path, item);
}

let changed = 0;
for (const club of clubs.values()) {
  const runs = europeByClub.get(clean(club.name)) || [];
  const file = `${club.path}index.html`;
  let html;
  try { html = await readFile(file, "utf8"); } catch { continue; }
  const original = html;
  html = insertEuropeanRuns(html, europeanRunsHTML(runs));
  if (html !== original) { await writeFile(file, html); changed++; }
}

console.log(`Club Europe: updated ${changed} generated club pages.`);
