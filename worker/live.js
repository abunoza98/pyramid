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
const GAP_MS = 2500;                            // gap between API requests in the same minute
const SCHEDULE_BATCH = 3;                       // fixture lists fetched per minute (19 leagues take 7 minutes)

export default {
  async scheduled(event, env, ctx) {
    // If a run fails before anything is saved, keep the reason (shown in /live.json), writing only when it changes.
    ctx.waitUntil(tick(env).then(async () => {
      if (await env.LIVE.get("error")) await env.LIVE.delete("error");
    }).catch(async (e) => {
      console.log("tick failed:", e.message);
      const msg = JSON.stringify({ at: new Date().toISOString().slice(0, 13), message: String(e.message || e) });
      try { if ((await env.LIVE.get("error"))?.slice(0, 200) !== msg.slice(0, 200)) await env.LIVE.put("error", msg); } catch {}
    }));
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
      const err = await env.LIVE.get("error");
      let body = (await env.LIVE.get("state")) || '{"fixtures":[]}';
      if (err) body = body.replace(/^\{/, '{"runError":' + err + ",");
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
  const s = raw ? JSON.parse(raw) : { v: 1, updated: 0, day: "", scheduleAt: 0, writes: { day: "", n: 0 }, leagues: {}, season: 0, pending: [], fixtures: [] };
  const before = JSON.stringify({ ...s, updated: 0, writes: null });

  // API-Football refuses requests sent back to back, so leave a gap between them.
  let lastCall = 0, lastHeaders = null;
  const pause = (ms) => (opts.fetch ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));
  const api = async (q) => {
    const wait = lastCall + GAP_MS - Date.now();
    if (wait > 0) await pause(wait);
    lastCall = Date.now();
    const r = await fetchFn(API + q, { headers: { "x-apisports-key": env.API_FOOTBALL_KEY } });
    const h = (k) => r.headers?.get?.(k) ?? null;
    lastHeaders = { minuteLimit: h("x-ratelimit-limit"), minuteLeft: h("x-ratelimit-remaining"), dayLeft: h("x-ratelimit-requests-remaining") };
    if (!r.ok) throw new Error(`API-Football ${r.status} on ${q}`);
    const b = await r.json();
    const errs = b.errors && (Array.isArray(b.errors) ? b.errors : Object.values(b.errors));
    if (errs && errs.length) throw new Error(`API-Football said: ${errs.join("; ")}`);
    return b.response || [];
  };
  const site = async (p) => {
    const r = await fetchFn(SITE + p + "?t=" + Math.floor(now / 60000), { headers: { "user-agent": "footballpyramids-live-worker" } });
    if (!r.ok) console.log(`site ${p}: HTTP ${r.status}`);
    return r.ok ? r.json() : null;
  };

  // Paused after API-Football said "too many requests"? Wait it out.
  if (s.pauseUntil && now < s.pauseUntil) return { wrote: false, state: s };
  let failed = null;
  const tryApi = async (q) => {
    for (let attempt = 1; ; attempt++) {
      try { return await api(q); }
      catch (e) {
        const limited = /too many|limit|429/i.test(e.message);
        if (limited && attempt < 3) { await pause(8000); continue; }   // try again a few seconds later
        failed = e.message;
        // Shown in /live.json so problems can be seen without digging through logs.
        s.lastError = { at: new Date(now).toISOString(), message: e.message, request: q.split("&")[0], attempts: attempt, headers: lastHeaders };
        if (limited) s.pauseUntil = now + 2 * 60000;
        return null;
      }
    }
  };

  // Fetch the latest state of particular games by ID (finished, stopped or stuck).
  const settle = async (list) => {
    for (const x of (await tryApi(`/fixtures?ids=${list.map((f) => f.id).join("-")}`)) || []) {
      const i = s.fixtures.findIndex((f) => f.id === x.fixture.id);
      if (i > -1) s.fixtures[i] = { ...fromApi(x, s.leagues[x.league.id] || s.fixtures[i], s.fixtures[i], s.fixtures[i].day), chk: s.fixtures[i].chk };
    }
  };

  // 1. Today's fixtures, from the leagues the site lists. A few leagues a minute, so we never send a burst.
  if (!s.pending?.length && (s.day !== today || now - s.scheduleAt > SCHEDULE_EVERY_MS)) {
    const cfg = await site("/data/live-leagues.json");
    if (!cfg) throw new Error("couldn't read live-leagues.json from the site (blocked or not deployed?)");
    s.leagues = cfg.leagues;
    s.season = cfg.season;
    s.pending = Object.keys(cfg.leagues);
    s.scheduleAt = now;
    if (s.day !== today) {
      // New day: keep only games still running past midnight.
      s.fixtures = s.fixtures.filter((f) => LIVE.includes(f.st));
      s.day = today;
    }
  }
  if (s.pending?.length) {
    const played = {};   // country -> Map(club id -> games played in the official table)
    const playedFor = async (c) => {
      if (!played[c]) {
        played[c] = new Map();
        const d = await site(`/data/${c}.json`);
        for (const lg of d?.leagues || []) for (const r of lg.groups ? lg.groups.flatMap((g) => g.rows) : lg.rows || []) {
          if (r.tid) played[c].set(r.tid, { p: r.p, team: r.team });
        }
      }
      return played[c];
    };
    for (const id of s.pending.slice(0, SCHEDULE_BATCH)) {
      const m = s.leagues[id];
      // A calendar-year league (Brazil, the USA…) carries its own season as `s` in live-leagues.json.
      const list = await tryApi(`/fixtures?league=${id}&season=${(m && m.s) || s.season}&date=${s.day}&timezone=UTC`);
      if (!list) break;
      for (const x of list) {
        const i = s.fixtures.findIndex((f) => f.id === x.fixture.id);
        const old = i > -1 ? s.fixtures[i] : null;
        const f = fromApi(x, m, old, s.day);
        if (!old) {
          // Games played so far, so the pages know whether the official table already includes this result.
          // Only for games not yet finished: for a finished one we can't tell, so the pages leave it out of the table.
          if (!DONE.includes(f.st)) {
            const p = await playedFor(m.c);
            f.h.b = p.get(f.h.id)?.p ?? null;
            f.a.b = p.get(f.a.id)?.p ?? null;
          } else { f.h.b = null; f.a.b = null; }
          // Club names as the site shows them (the API's can be odd, e.g. "ST Mirren").
          const p = await playedFor(m.c);
          f.h.n = p.get(f.h.id)?.team || f.h.n;
          f.a.n = p.get(f.a.id)?.team || f.a.n;
          s.fixtures.push(f);
        } else s.fixtures[i] = f;
      }
      s.pending = s.pending.filter((x) => x !== id);
    }
    s.fixtures.sort((a, b) => a.ko - b.ko || a.id - b.id);
  }

  // 2. Live scores, only when a game is on (or about to be).
  const active = s.fixtures.filter((f) => !DONE.includes(f.st) && !OFF.includes(f.st) &&
    now >= f.ko * 1000 - 5 * 60000 && now <= f.ko * 1000 + 4 * 3600000);
  if (active.length) {
    const ids = Object.keys(s.leagues);
    const live = failed ? null : await tryApi(`/fixtures?live=${ids.join("-")}`);
    const seen = new Set();
    for (const x of live || []) {
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
    const gone = !live ? [] : s.fixtures.filter((f) => !seen.has(f.id) &&
      (LIVE.includes(f.st) || (f.st === "NS" && now > f.ko * 1000 + 110 * 60000 && now <= f.ko * 1000 + 4 * 3600000))).slice(0, 20);
    if (gone.length) await settle(gone);
  }

  // 3. Safety net: a game still marked live (or not started) two hours or more after kick-off, outside the
  // window above or after a failed live request, gets its final state fetched. At most once every 10 minutes per game.
  const stuck = s.fixtures.filter((f) => (LIVE.includes(f.st) || (f.st === "NS" && now <= f.ko * 1000 + 12 * 3600000)) && now > f.ko * 1000 + 120 * 60000 &&
    now - (f.chk || 0) > 10 * 60000).slice(0, 20);
  if (stuck.length && !failed) {
    stuck.forEach((f) => { f.chk = now; });
    await settle(stuck);
  }

  if (failed) console.log("API problem:", failed);

  // 4. Save only if something changed.
  if (JSON.stringify({ ...s, updated: 0, writes: null }) === before) return { wrote: false, state: s };
  if (s.writes.day !== today) s.writes = { day: today, n: 0 };
  if (s.writes.n >= WRITE_CAP) { console.log("daily write cap reached"); return { wrote: false, state: s }; }
  s.writes.n++;
  s.updated = now;
  await env.LIVE.put("state", JSON.stringify(s));
  return { wrote: true, state: s };
}

// Knockout games played inside a league's own fixture list (the MLS Cup playoffs in league 253, play-off finals):
// they aren't league games, so the pages must not add them to the table.
const KNOCKOUT = /play-?offs?|wild ?card|final|quarter|semi|1\/\d+-finals?|knockout|round one/i;
function fromApi(x, m, old, day) {
  const side = (t, g, o) => ({ id: t.id, n: (o && o.n) || t.name, g: g ?? null, b: o ? o.b : undefined });
  const round = String(x.league?.round || "");
  return {
    id: x.fixture.id, c: m.c, l: m.l, g: m.g || null, day, ...(KNOCKOUT.test(round) ? { ko1: 1 } : {}),
    ko: x.fixture.timestamp, st: x.fixture.status?.short || "NS",
    p1: x.fixture.periods?.first || null, p2: x.fixture.periods?.second || null,
    h: side(x.teams.home, x.goals?.home, old && old.h),
    a: side(x.teams.away, x.goals?.away, old && old.a)
  };
}
