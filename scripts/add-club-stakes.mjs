// Add a concise "What's at stake" line to current club pages from the standings already saved in data/<country>.json.
// This is deliberately descriptive rather than predictive: it only reports the club's current zone and the points
// gap to the nearest meaningful promotion/play-off/qualification or relegation boundary.
// Historical country pages also get adjacent-season navigation that preserves the current league anchor.
import { readFile, writeFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { COUNTRIES } from "./leagues.mjs";

const require = createRequire(import.meta.url);
const FP = require("../assets/render.js");

const esc = FP.esc;
const pointText = (n) => `${Math.max(0, n)} ${Math.abs(n) === 1 ? "pt" : "pts"}`;
const groupsOf = (lg) => lg.groups?.length ? lg.groups : [{ name: "", rows: lg.rows || [] }];
const rowAt = (rows, pos) => rows.find((r) => r.pos === pos);
const zoneAt = (lg, pos) => (lg.zones || []).find((z) => pos >= z.from && pos <= z.to) || null;
const lower = (s) => String(s || "").toLowerCase();

function statusLabel(z) {
  if (!z) return "";
  const label = String(z.label || "");
  if (/^promotion$/i.test(label)) return "Automatic promotion place";
  if (/relegation play-?off/i.test(label)) return "Relegation play-off place";
  if (/play-?offs?/i.test(label)) return label.replace(/play-?offs?/i, "Play-off") + (/(place|round|final)/i.test(label) ? "" : " place");
  if (/^relegation$/i.test(label)) return "Relegation place";
  return label ? label + (/(place|round|final|semi|qualif)/i.test(label) ? "" : " place") : "";
}

function targetLabel(z) {
  if (!z) return "";
  const label = lower(z.label);
  if (label === "promotion") return "automatic promotion";
  if (/play-?off/.test(label)) return label.replace(/play-?offs?/, "play-offs");
  return label || "the target places";
}

function stakeParts(lg, rows, me) {
  const zones = (lg.zones || []).slice().sort((a, b) => a.from - b.from);
  if (!zones.length || !rows.length) return [];
  const active = zoneAt(lg, me.pos);
  const parts = [];

  if (active) {
    const s = statusLabel(active);
    if (s) parts.push(s);

    if (active.kind === "down") {
      const safe = rowAt(rows, active.from - 1);
      if (safe) {
        const gap = safe.pts - me.pts;
        parts.push(gap > 0 ? `${pointText(gap)} from safety` : "Level on points with safety");
      }
      return parts.slice(0, 2);
    }

    // In an automatic-promotion place, second (or lower in a multi-place zone) is more interesting relative to 1st.
    if (/^promotion$/i.test(active.label || "") && me.pos > 1) {
      const leader = rowAt(rows, 1);
      if (leader) {
        const gap = leader.pts - me.pts;
        parts.push(gap > 0 ? `${pointText(gap)} behind 1st` : "Level on points with 1st");
        return parts.slice(0, 2);
      }
    }

    // Inside a play-off/Europe/promotion zone: show the cushion to dropping out of that zone.
    const below = rowAt(rows, active.to + 1);
    if (below) {
      const gap = me.pts - below.pts;
      const target = /^promotion$/i.test(active.label || "") ? "promotion" : targetLabel(active);
      parts.push(gap > 0 ? `${pointText(gap)} clear of the ${target} cut-off` : `Level on points at the ${target} cut-off`);
    }
    return parts.slice(0, 2);
  }

  // Between marked zones: show the nearest target above and the nearest danger below.
  const above = zones.filter((z) => z.to < me.pos).sort((a, b) => b.to - a.to)[0];
  const below = zones.filter((z) => z.from > me.pos).sort((a, b) => a.from - b.from)[0];
  if (above) {
    const target = rowAt(rows, above.to);
    if (target) {
      const gap = target.pts - me.pts;
      parts.push(gap > 0 ? `${pointText(gap)} from ${targetLabel(above)}` : `Level on points with ${targetLabel(above)}`);
    }
  }
  if (below) {
    const target = rowAt(rows, below.from);
    if (target) {
      const gap = me.pts - target.pts;
      const label = /relegation/i.test(below.label || "") ? "relegation" : targetLabel(below);
      parts.push(gap > 0 ? `${pointText(gap)} clear of ${label}` : `Level on points with ${label}`);
    }
  }
  return parts.slice(0, 2);
}

function placeStake(html, stake) {
  const nextMatch = html.match(/<section class="next-match[^"]*"[\s\S]*?<\/section>/);
  if (nextMatch) return html.replace(nextMatch[0], nextMatch[0] + stake);
  const journey = '<section class="cl-sec" id="journey">';
  if (html.includes(journey)) return html.replace(journey, stake + journey);
  const fixtures = '<div class="cl-cols">';
  return html.includes(fixtures) ? html.replace(fixtures, stake + fixtures) : html;
}

let changed = 0;
for (const cfg of COUNTRIES) {
  let country;
  try { country = JSON.parse(await readFile(`data/${cfg.country}.json`, "utf8")); } catch { continue; }

  for (const lg of country.leagues || []) {
    for (const group of groupsOf(lg)) {
      const rows = group.rows || [];
      for (const me of rows) {
        const parts = stakeParts(lg, rows, me);
        if (!parts.length) continue;
        const file = `${cfg.country}/club/${FP.slug(me.team)}/index.html`;
        let html;
        try { html = await readFile(file, "utf8"); } catch { continue; }

        // Idempotent on repeated scheduled builds. Remove either the original class or the story-positioned version.
        const original = html;
        html = html.replace(/<p class="cup-note (?:cl-stakes|club-stakes)"(?: data-club-stakes)?[\s\S]*?<\/p>/, "");
        const stake = `<p class="cup-note club-stakes" data-club-stakes><strong>What’s at stake:</strong> ${parts.map(esc).join(" · ")}</p>`;
        const next = placeStake(html, stake);
        if (next !== original) { await writeFile(file, next); changed++; }
      }
    }
  }
}

const stripTags = (s) => s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
const seasonContextScript = `<script data-season-link-context>
(function () {
  function updateSeasonLinks() {
    try {
      var hash = location.hash && document.getElementById(location.hash.slice(1)) ? location.hash : "";
      var club = new URLSearchParams(location.search).get("club");
      var links = document.querySelectorAll(".seasons a, .season-step-nav a");
      for (var i = 0; i < links.length; i++) {
        var a = links[i];
        var base = a.getAttribute("data-season-base");
        if (!base) {
          base = (a.getAttribute("href") || "").split("#")[0].split("?")[0];
          a.setAttribute("data-season-base", base);
        }
        var href = base;
        if (club) href += (href.indexOf("?") > -1 ? "&" : "?") + "club=" + encodeURIComponent(club);
        a.setAttribute("href", href + hash);
      }
    } catch (e) {}
  }
  updateSeasonLinks();
  window.addEventListener("hashchange", updateSeasonLinks);
})();
</script>`;

function addSeasonNavigation(html) {
  html = html.replace(/<nav class="tf-tabs season-step-nav"[\s\S]*?<\/nav>/, "");
  html = html.replace(/\n?<script data-season-link-context>[\s\S]*?<\/script>/, "");

  const details = html.match(/<details class="seasons">[\s\S]*?<\/details>/);
  if (!details) return html;
  const items = Array.from(details[0].matchAll(/<li>([\s\S]*?)<\/li>/g)).map((m) => m[1]);
  const current = items.findIndex((x) => /aria-current="page"/.test(x));
  if (current < 0) return html;

  const item = (idx) => {
    if (idx < 0 || idx >= items.length) return null;
    const href = items[idx].match(/href="([^"]+)"/);
    if (!href) return null;
    return { href: href[1], label: stripTags(items[idx]) };
  };
  // The season list is newest to oldest: older goes left, newer goes right.
  const older = item(current + 1);
  const newer = item(current - 1);
  const currentLabel = stripTags(items[current]);
  if (!older && !newer) return html;

  const nav = '<nav class="tf-tabs season-step-nav" aria-label="Browse adjacent seasons" style="margin:10px 0 14px">' +
    (older ? `<a class="tf-tab" href="${older.href}">← ${older.label}</a>` : "") +
    `<span class="tf-tab on" aria-current="page">${currentLabel}</span>` +
    (newer ? `<a class="tf-tab" href="${newer.href}">${newer.label} →</a>` : "") +
    "</nav>";

  html = html.replace(details[0], details[0] + nav);
  return html.replace("</body>", seasonContextScript + "\n</body>");
}

let historyChanged = 0;
for (const cfg of COUNTRIES) {
  let dirs = [];
  try { dirs = await readdir(cfg.country, { withFileTypes: true }); } catch {}
  for (const dir of dirs) {
    if (!dir.isDirectory() || !/^\d{4}(?:-\d{2})?$/.test(dir.name)) continue;
    const file = `${cfg.country}/${dir.name}/index.html`;
    let html;
    try { html = await readFile(file, "utf8"); } catch { continue; }
    if (!html.includes('data-page="history"')) continue;
    const next = addSeasonNavigation(html);
    if (next !== html) { await writeFile(file, next); historyChanged++; }
  }
}

console.log(`Club context: updated current stakes on ${changed} club pages; season navigation on ${historyChanged} historical pages.`);
