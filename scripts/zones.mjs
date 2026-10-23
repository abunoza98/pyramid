// Football Pyramids: table zones. From API-Football's per-row descriptions, corrected by PLAYOFF_RULES,
// with European places won through a cup labelled as such.
import { PLAYOFF_RULES } from "./leagues.mjs";

/* ---------- Zones from the data's own labels ----------
   Past seasons had different formats, so instead of today's settings we use the "description"
   API-Football gives each row, e.g. "Promotion - Premier League" or "Relegation - League One". */
export function classify(desc) {
  if (!desc) return null;
  const d = desc.toLowerCase().trim();
  const playoff = /play[- ]?offs?|semi-finals?|quarter-finals?|\bfinal\b/.test(d);
  // "Bundesliga (Relegation)", "Liga Portugal (Relegation)": the API's way of marking a relegation play-off.
  if (/relegation|play-?out/.test(d)) {
    const po = /play|round/.test(d) || (/\(relegation\)$/.test(d) && !/^relegation/.test(d));
    return { kind: "down", label: po ? "Relegation play-off" : "Relegation" };
  }
  // Outside Europe: South American, Asian and North American club competitions. Before the UEFA checks,
  // because "AFC Champions League" would otherwise read as the UEFA one.
  if (/libertadores/.test(d)) return { kind: "top", label: /qualif/.test(d) ? "Copa Libertadores qualifiers" : "Copa Libertadores" };
  if (/sudamericana/.test(d)) return { kind: "mid", label: "Copa Sudamericana" };
  if (/afc champions league elite|afc champions league(?! 2| two)/.test(d)) return { kind: "top", label: "AFC Champions League Elite" };
  if (/afc champions league (2|two)/.test(d)) return { kind: "mid", label: "AFC Champions League Two" };
  if (/concacaf/.test(d)) return { kind: "top", label: "CONCACAF Champions Cup" };
  if (/conference league/.test(d)) return { kind: "mid", label: playoff ? "Conference League play-offs" : "Conference League" };
  if (/europa league/.test(d)) return { kind: "mid", label: playoff ? "Europa League play-offs" : "Europa League" };
  if (/champions league/.test(d)) return { kind: "top", label: /qualif/.test(d) ? "Champions League qualifiers" : "Champions League" };
  // "Promotion - Eredivisie (Promotion)", "... (Promotion: Semi-finals)": promotion play-off places.
  if (playoff || /\(promotion\b/.test(d)) return { kind: "mid", label: "Play-offs" };
  if (/promotion/.test(d)) return { kind: "top", label: "Promotion" };
  if (/uefa|europe/.test(d)) return { kind: "mid", label: "Europe" };
  return null;
}
export function zonesFrom(table) {
  const zones = [];
  for (const t of table.slice().sort((a, b) => a.rank - b.rank)) {
    const z = classify(t.description);
    const last = zones[zones.length - 1];
    if (!z) continue;
    if (last && last.label === z.label && last.kind === z.kind && last.to === t.rank - 1) last.to = t.rank;
    else zones.push({ from: t.rank, to: t.rank, kind: z.kind, label: z.label });
  }
  return zones;
}


export function zoneAt(lg, pos) { return (lg.zones || []).find((z) => pos >= z.from && pos <= z.to) || null; }

// Rewrite a past season's zones using PLAYOFF_RULES, for the leagues listed there.
export function applyPlayoffRules(season, rules = PLAYOFF_RULES) {
  for (const lg of season.leagues) {
    const list = rules[lg.id];
    if (!list) continue;
    const rule = list.find((r) => season.year >= r.from && season.year <= (r.to ?? 9999)) || {};
    const rel = rule.rel || [], promo = rule.promo || [];
    // Only take over the kinds of play-off this league has rules for; leave the rest as the API has them.
    const doesRel = list.some((r) => r.rel), doesPromo = list.some((r) => r.promo);
    const size = Math.max(0, ...(lg.groups ? lg.groups.map((g) => g.rows.length) : [(lg.rows || []).length]));
    const at = [];
    for (let pos = 1; pos <= size; pos++) {
      let z = zoneAt(lg, pos);
      z = z ? { kind: z.kind, label: z.label } : null;
      const playoffish = z && /play/i.test(z.label) && (z.kind === "down" ? doesRel : doesPromo);
      if (rel.includes(pos)) z = { kind: "down", label: "Relegation play-off" };
      else if (promo.includes(pos)) z = { kind: "mid", label: "Play-offs" };
      else if (playoffish) z = null;   // a play-off place the rules say didn't exist
      at.push(z);
    }
    const zones = [];
    at.forEach((z, i) => {
      if (!z) return;
      const last = zones[zones.length - 1];
      if (last && last.to === i && last.kind === z.kind && last.label === z.label) last.to = i + 1;
      else zones.push({ from: i + 1, to: i + 1, ...z });
    });
    lg.zones = zones;
  }
  return season;
}


/* European places that come from winning a cup (e.g. 12th in Europa League because they won the FA Cup)
   sit apart from the main block at the top. Label those so the key doesn't read "17th Champions League". */
export function labelCupPlaces(season) {
  for (const lg of season.leagues) {
    let topEnd = 0;
    for (const z of lg.zones || []) {
      if (z.kind === "down") continue;
      if (z.from === topEnd + 1) { topEnd = z.to; continue; }
      if (/league|europe/i.test(z.label) && !/promotion|play/i.test(z.label)) { z.label += " (cup winners)"; z.kind = "cup"; }
    }
  }
  return season;
}

