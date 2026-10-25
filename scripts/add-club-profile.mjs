// Add club-page profile details and polish without making any new football-data API calls:
// - achievements from saved league/cup history
// - the club's usual home stadium from venue names already stored on league fixtures
// - de-duplicated results/form when the same fixture also appears in a finals competition
// - generic club-page metadata wording that works outside Europe
import { readFile, writeFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { COUNTRIES } from "./leagues.mjs";
import { applyPlayoffRules } from "./zones.mjs";
import { summarise } from "./cupruns.mjs";

const require = createRequire(import.meta.url);
const FP = require("../assets/render.js");
const esc = FP.esc;

// All-time honours lists, where we have them: data/cup-titles.json (cups, already used by the Runs chart) and
// data/honours.json (any competition, leagues included). Both are keyed "country/competition-id", each with
// `through` (the last season the list covers, by starting year) and `titles: [{ n, tid?, v, years? }]`. A club's
// total is the list's count up to `through` plus wins in our own records after it; without a list, it's our records
// alone and the line says so. Adding a competition to honours.json later needs no code change.
let HONOURS = {};
for (const f of ["data/cup-titles.json", "data/honours.json"]) {
  try { const d = JSON.parse(await readFile(f, "utf8")); for (const [k, v] of Object.entries(d)) if (!k.startsWith("_")) HONOURS[k] = v; } catch {}
}
const honourOf = (key, clubName, tid) => {
  const h = HONOURS[key];
  if (!h) return null;
  const e = (h.titles || []).find((x) => (tid && x.tid ? Number(x.tid) === Number(tid) : clean(x.n) === clean(clubName)));
  return { through: h.through, v: e ? e.v || 0 : 0, years: e && e.years ? e.years : null };
};

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
  if (cup.championName) return `${cup.championName} winner`;   // shown without " winner" on the Honours line
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
        kind: "cup", key: `${cfg.country}/${cup.id}`, text: championText(cfg, cup).replace(/ winner$/, "") });
    }

    // Current-season cup wins are already present in the regular fixture cache once the final is complete.
    let fx;
    try { fx = JSON.parse(await readFile(`data/fixtures/${cfg.country}/${cup.id}.json`, "utf8")); } catch { fx = null; }
    if (fx?.groups?.[0]?.rounds?.length) {
      const sum = summarise(fx.groups[0].rounds, cup.dist || {});
      const winner = sum.winner;
      const same = winner && ((tid && winner.id && Number(winner.id) === Number(tid)) || clean(winner.n) === clean(clubName));
      if (same) wins.push({ year: yearOf(fx.season), season: fx.season, kind: "cup", key: `${cfg.country}/${cup.id}`, text: championText(cfg, cup).replace(/ winner$/, "") });
    }
  }
  return wins;
}

// One line under the club's position: "Honours: 🏆 Premier League ×4 · FA Cup ×2 · ▲ 2 promotions", which opens to
// the seasons. Titles per competition come from the all-time list where there is one (plus our wins since), else
// from our records; promotions always from our records. Labelled "Honours" only when every title count is all-time.
// since: { competition key: first season on record } for counts that come from our records only.
function honoursHTML(items, clubName, tid, since) {
  const titles = new Map(), promos = [];
  for (const x of items) {
    if (x.kind === "promotion") { promos.push(x); continue; }
    const k = x.key || x.text;
    if (!titles.has(k)) titles.set(k, { key: k, text: x.text, ours: [] });
    if (!titles.get(k).ours.some((y) => y.season === x.season)) titles.get(k).ours.push(x);
  }
  // Competitions where the club has all-time titles but none in our records.
  for (const [k, h] of Object.entries(HONOURS)) {
    if (titles.has(k) || !k.startsWith(items.country + "/")) continue;
    const e = honourOf(k, clubName, tid);
    if (e && e.v) titles.set(k, { key: k, text: items.names[k] || h.name || k.split("/")[1], ours: [] });
  }
  const list = [...titles.values()].map((t) => {
    const h = honourOf(t.key, clubName, tid);
    if (!h) return { ...t, n: t.ours.length, years: t.ours.map((y) => y.season), since: since[t.key] || null };
    const later = t.ours.filter((y) => y.year > h.through);
    const years = (h.years || []).map(String).concat(later.map((y) => y.season));
    return { ...t, n: h.v + later.length, years: h.years ? years : later.map((y) => y.season), partial: !h.years && h.v > 0 };
  }).filter((t) => t.n > 0).sort((a, b) => b.n - a.n || a.text.localeCompare(b.text));
  if (!list.length && !promos.length) return "";
  // A count from our records only says where it starts. All-time counts don't.
  const parts = list.map((t) => `${esc(t.text)} ×${t.n}${t.since ? ` <small>(since ${esc(t.since)})</small>` : ""}`);
  const head = (list.length ? "🏆 " + parts.join(" · ") : "") + (list.length && promos.length ? " · " : "") +
    (promos.length ? `▲ ${promos.length} promotion${promos.length === 1 ? "" : "s"}` : "");
  const label = "Honours";
  const note = list.some((t) => t.since) || promos.length
    ? '<p class="hn-note">Title totals are all-time where we hold the full list. Counts marked "since" and promotions come from the seasons on this site.</p>' : "";
  const detail = list.map((t) => `<li><b>${esc(t.text)}</b> <span>${t.n}</span>${t.years.length ? `<i>${esc(t.years.slice().sort().reverse().join(", "))}${t.partial ? " and earlier" : ""}</i>` : ""}</li>`).join("") +
    (promos.length ? `<li><b>Promotions</b> <span>${promos.length}</span><i>${promos.sort((a, b) => b.year - a.year).map((p) => `${esc(p.season)} ${esc(p.text)}`).join("; ")}</i></li>` : "");
  return `<details class="cl-honours"><summary><strong>${label}:</strong> ${head}</summary><ul>${detail}</ul>${note}</details>`;
}

function insertAchievements(html, line) {
  html = html.replace(/<section class="cl-sec cl-achievements"[\s\S]*?<\/section>/, "");
  html = html.replace(/<details class="cl-honours">[\s\S]*?<\/details>/, "");
  if (!line) return html;
  const ctx = html.match(/<p class="cl-context">[\s\S]*?<\/p>/);
  if (ctx) return html.replace(ctx[0], ctx[0] + line);
  const lede = html.match(/<p class="lede">[\s\S]*?<\/p>/);
  return lede ? html.replace(lede[0], lede[0] + line) : html;
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

const decodeText = (s) => String(s || "").replace(/<[^>]*>/g, "")
  .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();

function resultRowInfo(row) {
  const id = row.match(/data-fid="([^"]+)"/)?.[1] || "";
  const wdl = row.match(/class="wdl wdl-([WDL])"/)?.[1] || "";
  const time = row.match(/<time\b[^>]*>[\s\S]*?<\/time>/)?.[0] || "";
  const comp = decodeText(row.match(/<span class="ctag [^"]*" title="([^"]*)">/)?.[1] || "");
  const ha = row.match(/<span class="cl-ha">([HA])<\/span>/)?.[1] || "";
  const opp = decodeText(row.match(/<span class="cl-opp">([\s\S]*?)<\/span>/)?.[1] || "");
  const score = decodeText(row.match(/<span class="cl-score">([\s\S]*?)<\/span>/)?.[1] || "");
  return { id, wdl, time, comp, ha, opp, score, priority: /ctag-league/.test(row) ? 0 : 1 };
}

function formChip(info, i, n) {
  if (!info.wdl || !info.time) return "";
  const side = i === 0 ? " l" : i === n - 1 ? " r" : "";
  const where = info.ha === "H" ? "Home v " : info.ha === "A" ? "Away at " : "v ";
  const verb = info.wdl === "W" ? "Won" : info.wdl === "L" ? "Lost" : "Drew";
  return `<b class="fchip ${info.wdl}" tabindex="0">${info.wdl}<span class="ltip${side}"><b>${info.time}${info.comp ? ` · ${esc(info.comp)}` : ""}</b>${where}${esc(info.opp)}${info.score ? `<i>${verb} ${esc(info.score)}</i>` : ""}</span></b>`;
}

// Some finals feeds reuse the same API fixture IDs as the parent league. On club pages that previously made one
// real match appear twice (and could distort Last 5). Keep one row per fixture ID, preferring the named cup/finals
// competition over the generic league copy, then rebuild the visible six + collapsed remainder and Last 5.
function dedupeResults(html) {
  const re = /<section class="cl-sec"><div class="cl-sec-h"><h2>Results<\/h2><\/div>[\s\S]*?<\/section>/;
  const section = html.match(re)?.[0];
  if (!section) return html;
  const rows = section.match(/<li class="cl-row"[\s\S]*?<\/li>/g) || [];
  if (!rows.length) return html;

  const chosen = new Map(), order = [];
  rows.forEach((row, i) => {
    const info = resultRowInfo(row);
    const key = info.id || `row-${i}`;
    if (!chosen.has(key)) {
      chosen.set(key, { row, info, i });
      order.push(key);
    } else if (info.priority > chosen.get(key).info.priority) {
      chosen.set(key, { row, info, i: chosen.get(key).i });
    }
  });
  const unique = order.map((k) => chosen.get(k)).sort((a, b) => a.i - b.i);
  if (unique.length === rows.length) return html.replaceAll("across league, cups and Europe", "across all competitions");

  const visible = unique.slice(0, 6).map((x) => x.row).join("");
  const more = unique.slice(6).map((x) => x.row).join("");
  const head = '<section class="cl-sec"><div class="cl-sec-h"><h2>Results</h2></div>';
  const details = more ? `<details class="cl-more" id="more-result"><summary>All ${unique.length} result${unique.length === 1 ? "" : "s"}</summary><ul class="cl-list">${more}</ul></details>` : "";
  html = html.replace(section, `${head}<ul class="cl-list">${visible}</ul>${details}</section>`);

  const last = unique.slice(0, 5).map((x) => x.info);
  const chips = last.map((x, i) => formChip(x, i, last.length)).join("");
  html = html.replace(/<p class="lede">[\s\S]*?<\/p>/, (lede) => {
    if (!/Last 5 matches:/.test(lede)) return lede;
    return lede.replace(/Last 5 matches:[\s\S]*<\/p>$/, `Last 5 matches: <span class="form">${chips}</span></p>`);
  });
  return html.replaceAll("across league, cups and Europe", "across all competitions");
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

  // Current names of every competition, for honours the club has only in an all-time list.
  const names = Object.fromEntries([...cfg.leagues.map((l) => [`${cfg.country}/${l.id}`, l.name.replace(/ Men$/, "")]),
    ...(cfg.cups || []).map((c) => [`${cfg.country}/${c.id}`, championText(cfg, c).replace(/ winner$/, "")])]);
  // First season on record per competition, for "since" on counts without an all-time list.
  const sinceByKey = {};
  for (const s of seasons) for (const rec of s.records.values()) { const k = `${cfg.country}/${rec.leagueId}`; if (!sinceByKey[k]) sinceByKey[k] = s.season; }
  for (const cup of cfg.cups || []) {
    let files = [];
    try { files = (await readdir(`data/history/${cfg.country}/cups/${cup.id}`)).filter((f) => /^\d{4}\.json$/.test(f)).sort(); } catch {}
    if (files.length) { try { sinceByKey[`${cfg.country}/${cup.id}`] = JSON.parse(await readFile(`data/history/${cfg.country}/cups/${cup.id}/${files[0]}`, "utf8")).season; } catch {} }
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
        // Grouped by league ID under its current name, so renamed leagues (A-League / A-League Men) count together.
        const nowName = (cfg.leagues.find((l) => l.id === rec.leagueId) || {}).name || rec.league;
        achievements.push({ year: s.year, season: s.season, kind: "league", key: `${cfg.country}/${rec.leagueId}`, text: nowName.replace(/ Men$/, "") });
      }
      const next = byYear.get(s.year + 1)?.records.get(key);
      if (next && next.tier < rec.tier) {
        const viaPlayoff = /play-?off/i.test(rec.zone?.label || "");
        achievements.push({ year: s.year, season: s.season, kind: "promotion",
          text: `to ${next.league}${viaPlayoff ? " via the play-offs" : ""}` });
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
    html = dedupeResults(html);
    html = insertStadium(html, stadium);
    achievements.country = cfg.country; achievements.names = names;
    html = insertAchievements(html, honoursHTML(achievements, club.name, club.tid, sinceByKey));
    if (html !== original) { await writeFile(file, html); changed++; }
  }
}

console.log(`Club profiles: polished results, metadata, stadium and achievements on ${changed} generated club pages.`);
