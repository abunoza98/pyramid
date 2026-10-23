// Football Pyramids: how far each club got in a cup season, for the "Cup runs" chart on club pages.
// Used by backfill-cups.mjs (past seasons, saved) and build.mjs (this season, from the fixture file).

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const FP = require("../assets/render.js");

const pow2 = (n) => n > 0 && (n & (n - 1)) === 0;

// rounds: [{ label, fixtures }] in playing order (as update-fixtures saves them).
// Returns { rounds: [labels], dist: [rounds from the final, per round, or null], final: bool, winner, clubs }
// clubs: { id: [name, roundIndex, result, opponent, score] } where result is "W" (won the cup), "L" (knocked out
// in that round) or "" (still in, or the tie isn't decided yet).
export function summarise(rounds, labelDist = {}) {
  const labels = rounds.map((r) => r.label);
  const ties = rounds.map((r) => FP.tiesOf(r));
  const last = ties[ties.length - 1] || [];
  const final = rounds.length > 0 && last.length === 1 && last[0].winner != null && /final/i.test(labels[labels.length - 1]) && !/semi|quarter/i.test(labels[labels.length - 1]);
  // Rounds from the final: exact once the final is played; before that, from what the same round was called in
  // earlier seasons, or the number of ties (4 ties = quarter-finals).
  // (Tie counts only from the last 16 on: earlier, clubs still to enter make "32 ties" mean more than 64 clubs left.)
  const dist = labels.map((l, i) => {
    if (final) return labels.length - 1 - i;
    if (l in labelDist) return labelDist[l];
    if (/semi/i.test(l)) return 1;
    if (/quarter/i.test(l)) return 2;
    if (/^final$/i.test(l)) return 0;
    if (pow2(ties[i].length) && ties[i].length <= 8) return Math.log2(ties[i].length);
    return null;
  });
  const clubs = {};
  ties.forEach((list, i) => list.forEach((t) => t.teams.forEach((tm, k) => {
    if (!tm.id) return;
    const them = t.teams[1 - k];
    let res = "";
    if (t.winner != null) res = t.winner === k ? (final && i === ties.length - 1 ? "W" : "") : "L";
    let score = "";
    if (t.played) {
      score = `${tm.agg}–${them.agg}`;
      const lastLeg = t.legs[t.legs.length - 1];
      if (t.how === "pens" && lastLeg.pen) {
        const mine = lastLeg.h.id === tm.id ? lastLeg.pen[0] : lastLeg.pen[1], theirs = lastLeg.h.id === tm.id ? lastLeg.pen[1] : lastLeg.pen[0];
        score += `, ${mine}–${theirs} on pens`;
      } else if (t.how === "aet") score += " aet";
      if (t.series) score = `${tm.agg}–${them.agg} in games`;          // a best-of-three series
      else if (t.legs.length > 1) score += ` over ${t.legs.length} games`;   // two legs, or a replay
    }
    // A club's furthest round wins; within a round keep the deciding result.
    const prev = clubs[tm.id];
    if (!prev || prev[1] <= i) clubs[tm.id] = [tm.n, i, res, them.n || "", score];
  })));
  const w = final ? last[0].teams[last[0].winner] : null;
  return { rounds: labels, dist, final, winner: w ? { id: w.id, n: w.n } : null, clubs };
}

// "Round of 16" etc. -> rounds from the final, learned from finished seasons.
export function learnLabels(seasons) {
  const out = {};
  for (const s of seasons) if (s.final) s.rounds.forEach((l, i) => { if (!(l in out)) out[l] = s.rounds.length - 1 - i; });
  return out;
}
