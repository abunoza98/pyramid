/* Football Pyramids: live scores.
   A Cloudflare Worker that runs every minute. It keeps today's fixtures for every league on the site, asks
   API-Football for live scores only while a game is on, and serves the result at /live.json for the pages to read.

   Needs (set in the Cloudflare dashboard):
     - Secret            API_FOOTBALL_KEY   your API-Football key
     - KV namespace       LIVE               bound under the name LIVE
     - Cron trigger       * * * * *          (every minute)
   It reads the list of leagues and the current tables from the site itself (data/live-leagues.json and data/<country>.json),
   so adding a league to the site needs no change here.

   API use: about 170 requests a day for fixture lists, plus one a minute while games are on
   (a busy Saturday is roughly 700). KV writes only happen when a score or status changes (well under the free 1,000 a day). */

const API = "https://v3.football.api-sports.io";
const SITE = "https://footballpyramids.com";
const LIVE = ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"];
const DONE = ["FT", "AET", "PEN"];
const OFF = ["PST", "CANC", "ABD", "AWD", "WO"];
const SCHEDULE_EVERY_MS = 3 * 3600 * 1000;   // re-check today's fixture list every 3 hours (kick-off changes)
const WRITE_CAP = 950;                          // stay under KV's free 1,000 writes a day

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(tick(env).catch((e) => console.log("tick failed:", e.message)));
  },

  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS" };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (url.pathname === "/live.json") {
      const cache = caches.default;
      const key = new Request(url.origin + "/live.json");
      const hit = await cache.match(key);
      if (hit) return hit;
      const body = (await env.LIVE.get("state")) || '{"fixtures":[]}';
      const res = new Response(body, {
        headers: { ...cors, "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=20" }
      });
      ctx.waitUntil(cache.put(key, res.clone()));
      return res;
    }
    if (url.pathname === "/") {
      return new Response("Football Pyramids live scores. Data: /live.json\n", { headers: { ...cors, "content-type": "text/plain" } });
    }
    return new Response("Not found\n", { status: 404, headers: cors });
  }
};

export async function tick(env, opts = {}) {
  const now = opts.now ?? Date.now();
  const fetchFn = opts.fetch ?? fetch;
  const today = new Date(now).toISOString().slice(0, 10);
  const raw = await env.LIVE.get("state");
  const s = raw ? JSON.parse(raw) : { v: 1, updated: 0, day: "", scheduleAt: 0, writes: { day: "", n: 0 }, leagues: {}, fixtures: [] };
  const before = JSON.stringify({ ...s, updated: 0, writes: null });

  const api = async (q) => {
    const r = await fetchFn(API + q, { headers: { "x-apisports-key": env.API_FOOTBALL_KEY } });
    if (!r.ok) throw new Error(`API-Football ${r.status} on ${q}`);
    const b = await r.json();
    const errs = b.errors && (Array.isArray(b.errors) ? b.errors : Object.values(b.errors));
    if (errs && errs.length) throw new Error(`API-Football said: ${errs.join("; ")}`);
    return b.response || [];
  };
  const site = async (p) => {
    const r = await fetchFn(SITE + p + "?t=" + Math.floor(now / 60000));
    return r.ok ? r.json() : null;
  };

  // 1. Today's fixtures, from the leagues the site lists.
  if (s.day !== today || now - s.scheduleAt > SCHEDULE_EVERY_MS) {
    const cfg = await site("/data/live-leagues.json");
    if (!cfg) throw new Error("couldn't read live-leagues.json from the site");
    s.leagues = cfg.leagues;
    // Keep today's games (their starting points must not change) and any game still running past midnight.
    const keep = s.fixtures.filter((f) => f.day === today || LIVE.includes(f.st));
    const byId = new Map(keep.map((f) => [f.id, f]));
    const played = {};   // country -> Map(club id -> games played in the official table)
    const playedFor = async (c) => {
      if (!played[c]) {
        played[c] = new Map();
        const d = await site(`/data/${c}.json`);
        for (const lg of d?.leagues || []) for (const r of lg.groups ? lg.groups.flatMap((g) => g.rows) : lg.rows || []) {
          if (r.tid) played[c].set(r.tid, r.p);
        }
      }
      return played[c];
    };
    for (const [id, m] of Object.entries(cfg.leagues)) {
      const list = await api(`/fixtures?league=${id}&season=${cfg.season}&date=${today}&timezone=UTC`);
      for (const x of list) {
        const old = byId.get(x.fixture.id);
        const f = fromApi(x, m, old, today);
        if (!old) {
          // Games played so far, so the pages know whether the official table already includes this result.
          // Only for games not yet finished: for a finished one we can't tell, so the pages leave it out of the table.
          if (!DONE.includes(f.st)) {
            const p = await playedFor(m.c);
            f.h.b = p.get(f.h.id) ?? null;
            f.a.b = p.get(f.a.id) ?? null;
          } else { f.h.b = null; f.a.b = null; }
        }
        byId.set(f.id, f);
      }
    }
    s.fixtures = [...byId.values()].sort((a, b) => a.ko - b.ko || a.id - b.id);
    s.day = today;
    s.scheduleAt = now;
  }

  // 2. Live scores, only when a game is on (or about to be).
  const active = s.fixtures.filter((f) => !DONE.includes(f.st) && !OFF.includes(f.st) &&
    now >= f.ko * 1000 - 5 * 60000 && now <= f.ko * 1000 + 4 * 3600000);
  if (active.length) {
    const ids = Object.keys(s.leagues);
    const live = await api(`/fixtures?live=${ids.join("-")}`);
    const seen = new Set();
    for (const x of live) {
      const m = s.leagues[x.league.id];
      if (!m) continue;
      seen.add(x.fixture.id);
      const i = s.fixtures.findIndex((f) => f.id === x.fixture.id);
      const old = i > -1 ? s.fixtures[i] : null;
      const f = fromApi(x, m, old, old ? old.day : today);
      if (!old) { f.h.b = null; f.a.b = null; s.fixtures.push(f); } else s.fixtures[i] = f;
    }
    // Games that were live last minute but aren't now have finished (or stopped): fetch their final state.
    // Also any game still "not started" well after kick-off (missed while the worker was down, or delayed).
    const gone = s.fixtures.filter((f) => !seen.has(f.id) &&
      (LIVE.includes(f.st) || (f.st === "NS" && now > f.ko * 1000 + 110 * 60000 && now <= f.ko * 1000 + 4 * 3600000))).slice(0, 20);
    if (gone.length) {
      for (const x of await api(`/fixtures?ids=${gone.map((f) => f.id).join("-")}`)) {
        const i = s.fixtures.findIndex((f) => f.id === x.fixture.id);
        if (i > -1) s.fixtures[i] = fromApi(x, s.leagues[x.league.id] || s.fixtures[i], s.fixtures[i], s.fixtures[i].day);
      }
    }
  }

  // 3. Save only if something changed.
  if (JSON.stringify({ ...s, updated: 0, writes: null }) === before) return { wrote: false, state: s };
  if (s.writes.day !== today) s.writes = { day: today, n: 0 };
  if (s.writes.n >= WRITE_CAP) { console.log("daily write cap reached"); return { wrote: false, state: s }; }
  s.writes.n++;
  s.updated = now;
  await env.LIVE.put("state", JSON.stringify(s));
  return { wrote: true, state: s };
}

function fromApi(x, m, old, day) {
  const side = (t, g, o) => ({ id: t.id, n: t.name, g: g ?? null, b: o ? o.b : undefined });
  return {
    id: x.fixture.id, c: m.c, l: m.l, g: m.g || null, day,
    ko: x.fixture.timestamp, st: x.fixture.status?.short || "NS",
    p1: x.fixture.periods?.first || null, p2: x.fixture.periods?.second || null,
    h: side(x.teams.home, x.goals?.home, old && old.h),
    a: side(x.teams.away, x.goals?.away, old && old.a)
  };
}
