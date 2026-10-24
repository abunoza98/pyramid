// Add promotion/relegation destination links to current club pages using the configured league pyramid.
// A route only appears when that league explicitly has a promotion/relegation rule and the adjacent tier is covered
// on the site. This deliberately leaves closed/disconnected systems such as MLS and the A-League unlinked.
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { COUNTRIES } from "./leagues.mjs";

const require = createRequire(import.meta.url);
const FP = require("../assets/render.js");
const esc = FP.esc;

const groupsOf = (lg) => lg.groups?.length ? lg.groups : [{ name: "", rows: lg.rows || [] }];
const leagueAtTier = (cfg, tier) => (cfg.leagues || []).find((l) => l.tier === tier);

function routesFor(cfg, league) {
  const out = [];
  const higher = leagueAtTier(cfg, league.tier - 1);
  const lower = leagueAtTier(cfg, league.tier + 1);

  if (league.promotionNote && higher) {
    out.push({ dir: "up", text: `Promotion → ${higher.name}`, href: `../../../${cfg.country}/#${higher.id}` });
  }
  if (league.relegationNote && lower) {
    out.push({ dir: "down", text: `Relegation → ${lower.name}`, href: `../../../${cfg.country}/#${lower.id}` });
  }
  return out;
}

let changed = 0;
for (const cfg of COUNTRIES) {
  let country;
  try { country = JSON.parse(await readFile(`data/${cfg.country}.json`, "utf8")); } catch { continue; }

  for (const dataLeague of country.leagues || []) {
    const league = (cfg.leagues || []).find((l) => l.id === dataLeague.id);
    if (!league) continue;
    const routes = routesFor(cfg, league);
    if (!routes.length) continue;

    const routesHtml = '<p class="fx-links cl-routes">' + routes.map((r) =>
      `<a class="cx-${r.dir}" href="${esc(r.href)}">${r.dir === "up" ? "▲" : "▼"} ${esc(r.text)}</a>`
    ).join("") + "</p>";

    for (const group of groupsOf(dataLeague)) {
      for (const row of group.rows || []) {
        const file = `${cfg.country}/club/${FP.slug(row.team)}/index.html`;
        let html;
        try { html = await readFile(file, "utf8"); } catch { continue; }
        const original = html;
        html = html.replace(/<p class="fx-links cl-routes">[\s\S]*?<\/p>/, "");
        const marker = '<p class="fx-links">';
        if (!html.includes(marker)) continue;
        const next = html.replace(marker, routesHtml + marker);
        if (next !== original) { await writeFile(file, next); changed++; }
      }
    }
  }
}

console.log(`Club routes: updated promotion/relegation links on ${changed} club pages.`);
