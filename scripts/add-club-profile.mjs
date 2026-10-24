// Add two club-page profile details without making any new football-data API calls:
// - achievements from saved league/cup history
// - the club's usual home stadium from venue names already stored on league fixtures
import { readFile, writeFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { COUNTRIES } from "./leagues.mjs";
import { applyPlayoffRules } from "./zones.mjs";
import { summarise } from "./cupruns.mjs";

const require = createRequire(import.meta.url);
const FP = require("../assets/render.js");
const esc = FP.esc;

const groupsOf = (lg) => lg.groups?.length ? lg.groups : [{ name: "", rows: lg.rows || [] }];
const clean = (name) => FP.slug(name).replace(/-fc$/, "");
const yearOf = (season) => Number(String(season || "").slice(0, 4));
const zoneAt = (lg, pos) => (lg.zones || []).find((z) => pos >= z.from && pos <= z.to) || null;

function recordsForSeason(raw) {
  const season = raw.mode === "final" ? applyPlayoffRules(raw) : raw;
  const out = new Map();
  for (const lg of season.leagues || []) {
    const ph = FP.phases(lg);
    if (ph) {
      for (const row of ph.base.rows || []) {
        const pos = ph.pos(row);
        out.set(clean(row.team), {
          name: row.team, tid: row.tid || null, year: season.year ?? yearOf(season.season), season: season.season,
          tier: lg.tier, league: lg.name, leagueId: lg.id, pos, zone: zoneAt(lg, pos), titleEligible: true
        });
      }
      continue;
    }
    const gs = groupsOf(lg), titleEligible = gs.length === 1;
    for (const g of gs) for (const row of g.rows || []) {
      out.set(clean(row.team), {
        name: row.team, tid: row.tid || null, year: season.year ?? yearOf(season.season), season: season.season,
        tier: lg.tier, league: lg.name, leagueId: lg.id, pos: row.pos, zone: zoneAt(lg, row.pos), titleEligible
      });
    }
  }
  return out;
}

async function historyFor(country) {
  const dir = `data/history/${country}`;
  let files = [];
  try { files = (await readdir(dir)).filter((f) => /^\d{4}\.json$/.test(f)); } catch {}
  const out = [];
  for (const file of files) {
    try { out.push(JSON.parse(await readFile(`${dir}/${file}`, "utf8"))); } catch {}
  }
  return out.sort((a, b) => a.year - b.year);
}

function homeStadium(fx, clubName, tid) {
  if (!fx) return "";
  const counts = new Map();
  for (const group of fx.groups || []) for (const round of group.rounds || []) for (const f of round.fixtures || []) {
    const home = tid && f.h?.id ? Number(f.h.id) === Number(tid) : clean(f.h?.n) === clean(clubName);
    const venue = String(f.v || "").trim();
    if (!home || !venue || /^(tbc|tbd|unknown|n\/a)$/i.test(venue)) continue;
    counts.set(venue, (counts.get(venue) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "";
}

function championText(cfg, cup) {
  if (!cup.championOf) return `${cup.name} winner`;
  if (cup.championLabel) {
    if (/^(mls|a-league|.*\bcup\b)/i.test(cup.championLabel)) return cup.championLabel;
    const lg = (cfg.leagues || []).find((l) => l.id === cup.championOf);
    return `${(lg?.name || cup.name).replace(/ Men$/, "")} ${cup.championLabel}`;
  }
  return `${cup.name} winner`;
}

async function cupWinsFor(cfg, clubName, tid) {
  const wins = [];
  for (const cup of cfg.cups || []) {
    const dir = `data/history/${cfg.country}/cups/${cup.id}`;
    let files = [];
    try { files = (await readdir(dir)).filter((f) => /^\d{4}\.json$/.test(f)); } catch {}
    for (const file of files) {
      let sum;
      try { sum = JSON.parse(await readFile(`${dir}/${file}`, "utf8")); } catch { continue; }
      const winner = sum.winner;
      if (!winner) continue;
      const same = (tid && winner.id && Number(winner.id) === Number(tid)) || clean(winner.n) === clean(clubName);
      if (!same) continue;
      wins.push({ year: sum.year ?? Number(file.slice(0, 4)), season: sum.season || String(file.slice(0, 4)),
        kind: "cup", text: championText(cfg, cup) });
    }

    // Current-season cup wins are already present in the regular fixture cache once the final is complete.
    let fx;
    try { fx = JSON.parse(await readFile(`data/fixtures/${cfg.country}/${cup.id}.json`, "utf8")); } catch { fx = null; }
    if (fx?.groups?.[0]?.rounds?.length) {
      const sum = summarise(fx.groups[0].rounds, cup.dist || {});
      const winner = sum.winner;
      const same = winner && ((tid && winner.id && Number(winner.id) === Number(tid)) || clean(winner.n) === clean(clubName));
      if (same) wins.push({ year: yearOf(fx.season), season: fx.season, kind: "cup", text: championText(cfg, cup) });
    }
  }
  return wins;
}

function achievementHTML(items) {
  if (!items.length) return "";
  const unique = [], seen = new Set();
  for (const x of items.sort((a, b) => b.year - a.year || ({ cup: 0, league: 1, promotion: 2 }[a.kind] ?? 9) - ({ cup: 0, league: 1, promotion: 2 }[b.kind] ?? 9))) {
    const key = `${x.season}|${x.text}`;
    if (!seen.has(key)) { seen.add(key); unique.push(x); }
  }
  const row = (x) => '<li><span class="ctag' + (x.kind === "cup" || x.kind === "league" ? ' ctag-cup' : '') + '">' +
    (x.kind === "promotion" ? "▲" : "🏆") + '</span><strong>' + esc(x.text) + '</strong><span class="cl-time" style="margin-left:auto">' + esc(x.season) + "</span></li>";
  const first = unique.slice(0, 8).map(row).join("");
  const more = unique.length > 8 ? '<details class="cl-more ach-more"><summary>Show ' + (unique.length - 8) +
    ' earlier achievement' + (unique.length - 8 === 1 ? "" : "s") + '</summary><ul class="cl-comps">' + unique.slice(8).map(row).join("") + "</ul></details>" : "";
  return '<section class="cl-sec cl-achievements" id="achievements"><div class="cl-sec-h"><h2>Achievements in our records</h2></div>' +
    '<p class="cup-note">Only league seasons and cup competitions currently covered by Football Pyramids are counted.</p>' +
    '<ul class="cl-comps">' + first + "</ul>" + more + "</section>";
}

function insertAchievements(html, section) {
  html = html.replace(/<section class="cl-sec cl-achievements"[\s\S]*?<\/section>/, "");
  if (!section) return html;
  const journey = html.match(/<section class="cl-sec" id="journey">[\s\S]*?<\/section>/);
  if (journey) return html.replace(journey[0], journey[0] + section);
  const fixtures = '<div class="cl-cols">';
  return html.includes(fixtures) ? html.replace(fixtures, section + fixtures) : html;
}

function insertStadium(html, stadium) {
  html = html.replace(/<p class="cup-note cl-stadium">[\s\S]*?<\/p>/, "");
  if (!stadium) return html;
  const line = `<p class="cup-note cl-stadium"><strong>Stadium:</strong> ${esc(stadium)}</p>`;
  const stakes = html.match(/<p class="cup-note cl-stakes">[\s\S]*?<\/p>/);
  if (stakes) return html.replace(stakes[0], line + stakes[0]);
  const routes = html.match(/<p class="fx-links cl-routes">[\s\S]*?<\/p>/);
  if (routes) return html.replace(routes[0], line + routes[0]);
  return html.includes('<p class="fx-links">') ? html.replace('<p class="fx-links">', line + '<p class="fx-links">') : html;
}

let changed = 0;
for (const cfg of COUNTRIES) {
  let current;
  try { current = JSON.parse(await readFile(`data/${cfg.country}.json`, "utf8")); } catch { continue; }

  const historical = await historyFor(cfg.country);
  const currentYear = yearOf(current.season);
  const seasons = historical.map((h) => ({ year: h.year, season: h.season, records: recordsForSeason(h) }));
  seasons.push({ year: currentYear, season: current.season, records: recordsForSeason(current), current: true });
  const byYear = new Map(seasons.map((s) => [s.year, s]));

  const clubs = new Map();
  for (const s of seasons) for (const [key, rec] of s.records) {
    const prev = clubs.get(key) || {};
    clubs.set(key, { name: s.current ? rec.name : (prev.name || rec.name), tid: s.current && rec.tid ? rec.tid : (prev.tid || rec.tid || null) });
  }

  const postseasonLeagues = new Set((cfg.cups || []).filter((c) => c.championOf).map((c) => c.championOf));
  const fixtureByLeague = new Map();
  for (const lg of current.leagues || []) {
    try { fixtureByLeague.set(lg.id, JSON.parse(await readFile(`data/fixtures/${cfg.country}/${lg.id}.json`, "utf8"))); } catch {}
  }

  for (const [key, club] of clubs) {
    const achievements = [];
    for (const s of seasons) {
      if (s.current) continue;
      const rec = s.records.get(key);
      if (!rec) continue;
      if (rec.titleEligible && rec.pos === 1 && !postseasonLeagues.has(rec.leagueId)) {
        achievements.push({ year: s.year, season: s.season, kind: "league", text: `${rec.league} winner` });
      }
      const next = byYear.get(s.year + 1)?.records.get(key);
      if (next && next.tier < rec.tier) {
        const viaPlayoff = /play-?off/i.test(rec.zone?.label || "");
        achievements.push({ year: s.year, season: s.season, kind: "promotion",
          text: viaPlayoff ? `Promoted via play-offs to ${next.league}` : `Promoted to ${next.league}` });
      }
    }
    achievements.push(...await cupWinsFor(cfg, club.name, club.tid));

    let stadium = "";
    const now = byYear.get(currentYear)?.records.get(key);
    if (now) stadium = homeStadium(fixtureByLeague.get(now.leagueId), club.name, club.tid);

    const file = `${cfg.country}/club/${FP.slug(club.name)}/index.html`;
    let html;
    try { html = await readFile(file, "utf8"); } catch { continue; }
    const original = html;
    html = insertStadium(html, stadium);
    html = insertAchievements(html, achievementHTML(achievements));
    if (html !== original) { await writeFile(file, html); changed++; }
  }
}

console.log(`Club profiles: updated stadium/achievements on ${changed} generated club pages.`);
