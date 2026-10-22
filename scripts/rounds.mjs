// Football Pyramids: fixture rounds. Shared by the fixtures updater, the European backfill and the page builder.

// "Regular Season - 12" -> "Round 12"; "Relegation Round - 3" -> "Relegation round 3"
export function roundLabel(r) {
  const s = String(r || "").trim();
  let m = /^Regular Season\s*-\s*(\d+)$/i.exec(s);
  if (m) return `Round ${m[1]}`;
  m = /^(.*?)\s*-\s*(\d+)$/.exec(s);
  if (m) return `${m[1].charAt(0).toUpperCase()}${m[1].slice(1).toLowerCase()} ${m[2]}`;
  if (/^\d+(st|nd|rd|th) qualifying round$/i.test(s)) return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  return s || "Other games";
}

// European competitions: "Play-offs" is used both for the last qualifying round and (after the league phase)
// for the knockout play-offs, so name them apart by date. League-phase and group-stage rounds become "Matchday N"
// (before 2024–25 the API names them per group, "Group A - 3"). Safe to run again on rounds already renamed.
const LP = /^(?:league|group) stage\s*-\s*(\d+)$|^group [a-z]\s*-\s*(\d+)$|^matchday (\d+)$/i;
const PO = /^play-?offs?$|^playoff round$|knockout round play-?offs|^qualifying play-offs$|^knockout play-offs$/i;
export function europeRounds(list) {
  const lp = list.filter((x) => LP.test(x.round || "")).map((x) => x.f.ts);
  const start = lp.length ? Math.min(...lp) : Infinity;
  for (const x of list) {
    const r = String(x.round || "").trim();
    const m = LP.exec(r);
    if (m) { x.round = `Matchday ${m[1] || m[2] || m[3]}`; x.f.stage = "lp"; continue; }
    if (PO.test(r)) x.round = x.f.ts < start ? "Qualifying play-offs" : "Knockout play-offs";
    x.f.stage = x.f.ts < start ? "q" : "ko";
  }
  return list;
}

// Saved rounds -> the same, re-sorted with europeRounds (so files saved by older code come out right).
export function regroupEurope(fx) {
  if (!fx) return fx;
  for (const g of fx.groups) {
    const list = [];
    for (const r of g.rounds) for (const f of r.fixtures) list.push({ round: r.key, f });
    g.rounds = toRounds(europeRounds(list));
  }
  return fx;
}

// Fixtures -> rounds, in date order (by each round's middle kick-off, so a rearranged game doesn't reorder rounds).
export function toRounds(list) {
  const by = new Map();
  for (const x of list) {
    const key = x.round;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(x.f);
  }
  const rounds = [...by.entries()].map(([key, fixtures]) => {
    fixtures.sort((a, b) => a.ts - b.ts || a.id - b.id);
    const times = fixtures.filter((f) => !["PST", "CANC", "TBD"].includes(f.st)).map((f) => f.ts).sort((a, b) => a - b);
    const mid = times.length ? times[Math.floor(times.length / 2)] : (fixtures[0]?.ts || 0);
    return { key, label: roundLabel(key), mid, fixtures };
  });
  rounds.sort((a, b) => a.mid - b.mid);
  return rounds;
}


// Domestic cups: replays are played as separate "rounds" ("3rd Round Replays"); put them back with their round.
// Then rename rounds: the cup's own map first ("1/128-finals" -> "First round" for the FA Cup), otherwise
// "1/N-finals" becomes "Round of 2N".
export function cupRounds(list, names = {}) {
  for (const x of list) {
    let r = String(x.round || "").trim();
    const m = /^(.*?)\s*-?\s*replays?$/i.exec(r);
    if (m && m[1]) r = m[1];
    const k = /^1\/(\d+)-finals?$/i.exec(r);
    x.round = names[r] || (k ? `Round of ${2 * Number(k[1])}` : r);
  }
  return list;
}
