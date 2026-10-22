// Football Pyramids: turn API-Football's per-row descriptions into table zones.

/* ---------- Zones from the data's own labels ----------
   Past seasons had different formats, so instead of today's settings we use the "description"
   API-Football gives each row, e.g. "Promotion - Premier League" or "Relegation - League One". */
export function classify(desc) {
  if (!desc) return null;
  const d = desc.toLowerCase();
  if (/relegation|play-?out/.test(d)) return { kind: "down", label: /play|round/.test(d) ? "Relegation play-off" : "Relegation" };
  if (/play[- ]?offs?/.test(d)) return { kind: "mid", label: "Play-offs" };
  if (/champions league/.test(d)) return { kind: "top", label: /qualif/.test(d) ? "Champions League qualifiers" : "Champions League" };
  if (/europa league/.test(d)) return { kind: "mid", label: "Europa League" };
  if (/conference league/.test(d)) return { kind: "mid", label: "Conference League" };
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

