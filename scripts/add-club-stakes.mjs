// Add a concise "What's at stake" line to current club pages from the standings already saved in data/<country>.json.
// This is deliberately descriptive rather than predictive: it only reports the club's current zone and the points
// gap to the nearest meaningful promotion/play-off/qualification or relegation boundary.
import { readFile, writeFile } from "node:fs/promises";
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

        // Idempotent on repeated scheduled builds: only write when the final page really differs.
        const original = html;
        html = html.replace(/<p class="cup-note cl-stakes">[\s\S]*?<\/p>/, "");
        const stake = `<p class="cup-note cl-stakes"><strong>What’s at stake:</strong> ${parts.map(esc).join(" · ")}</p>`;
        const marker = '<p class="fx-links">';
        if (!html.includes(marker)) continue;
        const next = html.replace(marker, stake + marker);
        if (next !== original) { await writeFile(file, next); changed++; }
      }
    }
  }
}

console.log(`Club context: updated current stakes on ${changed} club pages.`);
