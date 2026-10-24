// Put qualified UEFA runs into the same chart area as domestic cup runs on club pages.
// Uses only saved UEFA fixture history/current fixture JSON; no football-data API calls.
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
const MAIN_STAGES = new Set(["lp", "ko"]);
const clean = (name) => FP.slug(name).replace(/-fc$/, "");
const sameTeam = (team, club, tid) => !!team && ((tid && team.id && Number(team.id) === Number(tid)) || clean(team.n) === clean(club));
const hasClub = (f, club, tid) => sameTeam(f.h, club, tid) || sameTeam(f.a, club, tid);
const compRank = (comp) => COMPS.findIndex((c) => c.id === comp.id);

function seasonPath(season) {
  return String(season || "").replace(/–/g, "-").replace(/\s+/g, "");
}

function roundName(round) {
  return String(round?.label || round?.key || "").trim();
}

function isMainRound(round, mine = []) {
  if (mine.some((f) => MAIN_STAGES.has(f.stage))) return true;
  const s = roundName(round);
  if (!s || /qualif|preliminary/i.test(s)) return false;
  return /^group\b|group stage|league (?:phase|stage)|regular season|knockout.*play|play-?off round|round of (?:16|32|64)|^(?:8th|16th|32nd|1\/8|1\/16|1\/32)\s+finals?$|quarter|semi|^finals?$/i.test(s);
}

function friendlyRound(entry, year) {
  const round = entry?.round || {};
  const s = roundName(round);
  const stage = entry?.mine?.map((f) => f.stage).find((x) => MAIN_STAGES.has(x)) ||
    (round.fixtures || []).map((f) => f.stage).find((x) => MAIN_STAGES.has(x));

  // UEFA's saved fixtures call the pre-2024 group rounds "Matchday N" too, so the season tells us
  // whether an lp fixture is the old group stage or the new league phase.
  if (stage === "lp") return Number(year) >= 2024 ? "League phase" : "Group stage";
  if (!s) return "European campaign";
  if (/league (phase|stage)|regular season/i.test(s)) return "League phase";
  if (/^group\b|group stage/i.test(s)) return "Group stage";
  if (/knockout.*play|play-?off round/i.test(s)) return "Knockout play-offs";
  if (/round of 16/i.test(s) || /^(?:8th|1\/8)\s+finals?$/i.test(s)) return "Round of 16";
  if (/round of 32/i.test(s) || /^(?:16th|1\/16)\s+finals?$/i.test(s)) return "Round of 32";
  if (/round of 64/i.test(s) || /^(?:32nd|1\/32)\s+finals?$/i.test(s)) return "Round of 64";
  if (/quarter/i.test(s)) return "Quarter-finals";
  if (/semi/i.test(s)) return "Semi-finals";
  if (/^finals?$/i.test(s)) return "Final";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function wonFinal(round, club, tid) {
  const s = roundName(round);
  if (!/^finals?$/i.test(s)) return false;

  // Historical UEFA files reliably save the fixture-level winner even when their legacy stage code is generic.
  for (const f of round.fixtures || []) {
    if (!DONE.has(f.st) || !hasClub(f, club, tid)) continue;
    if (sameTeam(f.h, club, tid) && f.w === "h") return true;
    if (sameTeam(f.a, club, tid) && f.w === "a") return true;
  }

  // Keep the tie-based fallback for any two-leg/future formats where the winner is derived from aggregate data.
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

  // A qualifying-round appearance is not treated as a European run unless the club actually reaches
  // the main competition. Modern files use lp/ko stage tags; older UEFA files can label every fixture "q",
  // so their group/league and knockout round names are the authoritative fallback.
  const main = rounds.filter((x) => isMainRound(x.round, x.mine));
  if (!main.length) return null;

  const last = main[main.length - 1];
  const year = Number(fx.year ?? String(fx.season || "").slice(0, 4));
  const won = wonFinal(last.round, club, tid);
  const upcoming = current && last.mine.some((f) => !DONE.has(f.st) && !["CANC", "PST", "ABD"].includes(f.st));
  return {
    year,
    season: fx.season || String(fx.year || ""),
    stage: won ? "Winners" : friendlyRound(last, year),
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

const EURO_LEVELS = [
  { key: "Winners", label: "Won" },
  { key: "Final", label: "Final" },
  { key: "Semi-finals", label: "Semis" },
  { key: "Quarter-finals", label: "Quarters" },
  { key: "Round of 16", label: "Last 16" },
  { key: "Round of 32", label: "Last 32 / KO" },
  { key: "Round of 64", label: "Last 64" },
  { key: "Group stage", label: "Group / league" }
];
const LEVEL_H = 100 / EURO_LEVELS.length;

function stageLevel(stage) {
  if (stage === "Winners") return 0;
  if (stage === "Final") return 1;
  if (stage === "Semi-finals") return 2;
  if (stage === "Quarter-finals") return 3;
  if (stage === "Round of 16") return 4;
  if (stage === "Round of 32" || stage === "Knockout play-offs") return 5;
  if (stage === "Round of 64") return 6;
  return 7; // Group stage / league phase
}

function seasonShort(year) {
  return String(year).slice(-2) + "–" + String(year + 1).slice(-2);
}

const EURO_STYLE = `<style data-europe-runs-style>
.cl-runs-sec .run-tabs{margin:0 0 14px}.cl-runs-sec .tf-panel{margin-top:0}.er-legend{display:flex;flex-wrap:wrap;gap:8px 14px;margin:0 0 12px;font-size:12px;color:var(--muted)}.er-legend span{display:inline-flex;align-items:center;gap:6px}.er-key{display:inline-block;width:10px;height:10px;border-radius:50%;border:2px solid transparent}.er-key.er-ucl,.er-dot.er-ucl{background:#5267D9;border-color:#3549B5}.er-key.er-uel,.er-dot.er-uel{background:#E67E22;border-color:#B85E0E}.er-key.er-uecl,.er-dot.er-uecl{background:#24A66A;border-color:#147747}.er-key.won,.er-dot.won{box-shadow:0 0 0 2px #E8B931,0 0 0 4px rgba(232,185,49,.24)}.er-dot{display:block;text-decoration:none}.er-line line{stroke:var(--rule-strong);stroke-width:2;opacity:.8}.er-note{margin:-3px 0 12px;font-size:12px;color:var(--muted)}
</style>`;

function europeanChartHTML(runs) {
  if (!runs.length) return "";
  const points = runs.slice().sort((a, b) => a.year - b.year || compRank(a.comp) - compRank(b.comp));
  const minYear = points[0].year, maxYear = points[points.length - 1].year;
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, i) => minYear + i);
  const perYear = new Map();
  for (const p of points) {
    if (!perYear.has(p.year)) perYear.set(p.year, []);
    perYear.get(p.year).push(p);
  }

  const plotted = [];
  for (const year of years) {
    const same = (perYear.get(year) || []).sort((a, b) => compRank(a.comp) - compRank(b.comp));
    const base = years.length === 1 ? 50 : ((year - minYear + 0.5) / years.length) * 100;
    const offsetStep = Math.min(1.15, 18 / years.length);
    same.forEach((r, i) => plotted.push({
      ...r,
      x: base + (i - (same.length - 1) / 2) * offsetStep,
      y: (stageLevel(r.stage) + 0.5) * LEVEL_H
    }));
  }

  const bands = EURO_LEVELS.map((l, i) =>
    '<rect class="lb' + (i % 2 ? " alt" : "") + '" x="0" width="1000" y="' + (i * LEVEL_H).toFixed(2) +
    '" height="' + LEVEL_H.toFixed(2) + '"/>').join("");
  const lines = plotted.slice(1).map((p, i) => {
    const prev = plotted[i];
    if (p.year - prev.year > 1) return "";
    return '<line x1="' + (prev.x * 10).toFixed(1) + '" y1="' + prev.y.toFixed(2) + '" x2="' +
      (p.x * 10).toFixed(1) + '" y2="' + p.y.toFixed(2) + '"/>';
  }).join("");
  const side = EURO_LEVELS.map((l, i) =>
    '<span class="ls cr-l" style="top:' + (i * LEVEL_H).toFixed(2) + '%;height:' + LEVEL_H.toFixed(2) +
    '%" title="' + esc(l.key) + '"><b>' + esc(l.label) + '</b></span>').join("");

  const dots = plotted.map((r) => {
    const href = r.current ? `../../../europe/${r.comp.id}/` : `../../../europe/${r.comp.id}/${seasonPath(r.season)}/`;
    const sideClass = r.x < 13 ? " l" : r.x > 87 ? " r" : "";
    const below = r.y < 24 ? " below" : "";
    const detail = r.won ? "Won the competition" : (r.current ? "Currently at " : "Reached ") + r.stage.toLowerCase();
    const aria = `${r.season}: ${r.comp.name}, ${r.stage}`;
    return '<a class="ld cr-dot er-dot er-' + r.comp.cls + (r.won ? " won" : "") +
      '" style="left:' + r.x.toFixed(2) + '%;top:' + r.y.toFixed(2) + '%" href="' + esc(href) + '" aria-label="' +
      esc(aria) + '"><span class="ltip' + sideClass + below + '"><b>' + esc(r.season) + ' · ' +
      esc(r.comp.name) + '</b>' + esc(detail) + '</span></a>';
  }).join("");

  const axis = years.map((year) => {
    const x = years.length === 1 ? 50 : ((year - minYear + 0.5) / years.length) * 100;
    return '<span style="left:' + x.toFixed(2) + '%">' + seasonShort(year) + '</span>';
  }).join("");
  const legend = COMPS.map((c) => '<span><i class="er-key er-' + c.cls + '" aria-hidden="true"></i>' +
    esc(c.name) + '</span>').join("") +
    '<span><i class="er-key er-ucl won" aria-hidden="true"></i>Winner</span>';

  return '<div class="cr er-chart"><div class="cr-h"><div><h3>Europe</h3><p>Only seasons where the club reached the main UEFA competition are shown.</p></div></div>' +
    '<div class="er-legend" aria-label="European competition key">' + legend + '</div>' +
    '<p class="er-note">No dot means the club did not qualify for the group/league or knockout stage that season.</p>' +
    '<div class="lchart cr-chart"><div class="lside">' + side + '</div><div class="lplot" style="height:' +
    (EURO_LEVELS.length * 24) + 'px"><svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">' +
    bands + '<g class="er-line">' + lines + '</g></svg>' + dots + '</div><div class="lx">' + axis + '</div></div></div>';
}

function cleanOldEurope(html) {
  html = html.replace(/<style data-europe-runs-style>[\s\S]*?<\/style>/g, "");
  html = html.replace(/<section class="cl-sec cl-euro-runs"[\s\S]*?<\/section>/g, "");
  return html;
}

function runsSection(cupBody, europeBody) {
  const hasCups = !!cupBody;
  const tabs = (hasCups
    ? '<button type="button" role="tab" class="tf-tab on" data-tab="cups" aria-selected="true">Cups</button>'
    : "") +
    '<button type="button" role="tab" class="tf-tab' + (hasCups ? "" : " on") +
    '" data-tab="europe" aria-selected="' + (hasCups ? "false" : "true") + '">Europe</button>';
  const panels = (hasCups
    ? '<div class="tf-panel on" data-panel="cups" role="tabpanel">' + cupBody + '</div>'
    : "") +
    '<div class="tf-panel' + (hasCups ? "" : " on") + '" data-panel="europe" role="tabpanel">' + europeBody + '</div>';
  return EURO_STYLE + '<section class="cl-sec cl-runs-sec" data-tabs="club-runs"><div class="cl-sec-h"><h2>Runs</h2></div>' +
    '<div class="tf-tabs cl-tabs run-tabs" role="tablist" aria-label="Run history">' + tabs + '</div>' + panels + '</section>';
}

function insertEuropeanRuns(html, runs) {
  html = cleanOldEurope(html);

  // Idempotence if this post-processor is run twice without a full site rebuild.
  const existing = html.match(/<section class="cl-sec cl-runs-sec" data-tabs="club-runs">[\s\S]*?<\/section>/);
  let cupBody = "";
  if (existing) {
    const cups = existing[0].match(/<div class="tf-panel on" data-panel="cups" role="tabpanel">([\s\S]*?)<\/div>\s*<div class="tf-panel/);
    if (cups) cupBody = cups[1];
    html = html.replace(existing[0], "");
  } else {
    const cup = html.match(/<section class="cl-sec"><div class="cl-sec-h"><h2>Cup runs<\/h2><\/div>([\s\S]*?)<\/section>/);
    if (cup) {
      cupBody = cup[1];
      html = html.replace(cup[0], "");
    }
  }

  if (!runs.length) {
    if (cupBody) {
      const cupSection = '<section class="cl-sec"><div class="cl-sec-h"><h2>Cup runs</h2></div>' + cupBody + '</section>';
      const comps = html.match(/<section class="cl-sec cl-comps-sec"[\s\S]*?<\/section>/);
      return comps ? html.replace(comps[0], comps[0] + cupSection) : html + cupSection;
    }
    return html;
  }

  const section = runsSection(cupBody, europeanChartHTML(runs));
  const comps = html.match(/<section class="cl-sec cl-comps-sec"[\s\S]*?<\/section>/);
  if (comps) return html.replace(comps[0], comps[0] + section);
  const fixtures = '<div class="cl-cols">';
  return html.includes(fixtures) ? html.replace(fixtures, section + fixtures) : html + section;
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
  runs.sort((a, b) => b.year - a.year || compRank(a.comp) - compRank(b.comp));
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
  html = insertEuropeanRuns(html, runs);
  if (html !== original) { await writeFile(file, html); changed++; }
}

console.log(`Club Europe: updated ${changed} generated club pages.`);