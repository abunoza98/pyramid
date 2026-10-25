// Add neutral neighbouring-tier links to current club pages using the configured league pyramid.
// Also make historical journey links preserve the club being viewed, so the historical table can highlight it.
// A neighbouring tier only appears when that league explicitly has a promotion/relegation rule and the adjacent tier is
// covered on the site. This deliberately leaves closed/disconnected systems such as MLS and the A-League unlinked.
import { readFile, writeFile, readdir } from "node:fs/promises";
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
    out.push({ relation: "above", text: `${higher.name} (tier above)`, href: `../../../${cfg.country}/#${higher.id}` });
  }
  if (league.relegationNote && lower) {
    out.push({ relation: "below", text: `${lower.name} (tier below)`, href: `../../../${cfg.country}/#${lower.id}` });
  }
  return out;
}

function withClubQuery(href, club) {
  const at = href.indexOf("#");
  const base = at > -1 ? href.slice(0, at) : href;
  const hash = at > -1 ? href.slice(at) : "";
  return base + (base.includes("?") ? "&" : "?") + "club=" + encodeURIComponent(club) + hash;
}

function journeyWithClub(html, club, country) {
  return html.replace(/<section class="cl-sec" id="journey">[\s\S]*?<\/section>/, (section) =>
    section.replace(/href="([^"]+)"/g, (all, href) => {
      const historical = href.includes(`/${country}/`) && /\/\d{4}(?:-\d{2})?\/#/.test(href);
      return historical ? `href="${esc(withClubQuery(href, club))}"` : all;
    })
  );
}

// League fixture pages are server-rendered before the browser fetches the fixture JSON. Link the club names in that
// initial HTML too, so navigation works immediately and does not depend on the client-side re-render finishing first.
function fixtureClubLinks(html, dataLeague, country) {
  const links = new Map();
  for (const group of groupsOf(dataLeague)) for (const row of group.rows || []) {
    if (!row.tid) continue;
    links.set(esc(row.team), `../../../${country}/club/${FP.slug(row.team)}/`);
  }
  if (!links.size) return html;
  return html.replace(/(<span class="g-[ha](?: w)?">)([^<]+)(<\/span>)/g, (all, open, name, close) => {
    const href = links.get(name);
    return href ? `${open}<a class="club-link" href="${esc(href)}">${name}</a>${close}` : all;
  });
}

const historyClubScript = `<script data-history-club-context>
(function () {
  try {
    var club = new URLSearchParams(location.search).get("club");
    if (!club) return;
    var rows = document.querySelectorAll("tr[data-team]"), target = null;
    for (var i = 0; i < rows.length; i++) {
      rows[i].classList.remove("is-mine", "flash");
      if (!target && rows[i].getAttribute("data-team") === club) target = rows[i];
    }
    if (!target) return;
    target.classList.add("is-mine", "flash");
    requestAnimationFrame(function () { target.scrollIntoView({ block: "center" }); });
  } catch (e) {}
})();
</script>`;

let changed = 0;
for (const cfg of COUNTRIES) {
  let country;
  try { country = JSON.parse(await readFile(`data/${cfg.country}.json`, "utf8")); } catch { continue; }

  for (const dataLeague of country.leagues || []) {
    const league = (cfg.leagues || []).find((l) => l.id === dataLeague.id);
    if (!league) continue;
    const routes = routesFor(cfg, league);
    const routesHtml = routes.length ? '<p class="fx-links cl-routes"><span>Pyramid:</span>' + routes.map((r) =>
      `<a href="${esc(r.href)}" data-tier-relation="${r.relation}">${esc(r.text)}</a>`
    ).join("") + "</p>" : "";

    for (const group of groupsOf(dataLeague)) {
      for (const row of group.rows || []) {
        const file = `${cfg.country}/club/${FP.slug(row.team)}/index.html`;
        let html;
        try { html = await readFile(file, "utf8"); } catch { continue; }
        const original = html;

        // Keep the existing pyramid-route augmentation idempotent. The timezone row must stay the first .fx-links
        // block because FP.retime() updates that first block in place when the visitor changes time zone.
        html = html.replace(/<p class="fx-links cl-routes">[\s\S]*?<\/p>/, "");
        if (routesHtml) {
          html = html.replace(/<p class="fx-links">[\s\S]*?<\/p>/, (timezone) => timezone + routesHtml);
        }

        // Journey dots and season-by-season league links now carry the club name into historical table pages.
        html = journeyWithClub(html, row.team, cfg.country);
        if (html !== original) { await writeFile(file, html); changed++; }
      }
    }

    // The browser already links these names after it refreshes the fixture data. Do the same in the generated HTML
    // so a club is clickable from the first paint, including on slow connections or when JavaScript is unavailable.
    const fixtureFile = `${cfg.country}/${dataLeague.id}/fixtures/index.html`;
    let fixtureHtml;
    try { fixtureHtml = await readFile(fixtureFile, "utf8"); } catch { fixtureHtml = null; }
    if (fixtureHtml && fixtureHtml.includes('data-page="fixtures"')) {
      const linked = fixtureClubLinks(fixtureHtml, dataLeague, cfg.country);
      if (linked !== fixtureHtml) { await writeFile(fixtureFile, linked); changed++; }
    }
  }

  // Historical country pages read ?club= transiently. This does not alter the visitor's remembered club.
  let dirs = [];
  try { dirs = await readdir(cfg.country, { withFileTypes: true }); } catch {}
  for (const dir of dirs) {
    if (!dir.isDirectory() || !/^\d{4}(?:-\d{2})?$/.test(dir.name)) continue;
    const file = `${cfg.country}/${dir.name}/index.html`;
    let html;
    try { html = await readFile(file, "utf8"); } catch { continue; }
    if (!html.includes('data-page="history"')) continue;
    const original = html;
    html = html.replace(/\n?<script data-history-club-context>[\s\S]*?<\/script>/, "");
    html = html.replace("</body>", historyClubScript + "\n</body>");
    if (html !== original) { await writeFile(file, html); changed++; }
  }
}

console.log(`Club routes/history/fixture links: updated ${changed} generated pages.`);
