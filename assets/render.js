/* Football Pyramids: turns country data into page HTML.
   Used twice: by scripts/build.mjs to write the pages, and in the browser to redraw them when new tables arrive. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FP = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // "Brighton & Hove Albion" -> "brighton-hove-albion", "Atlético Madrid" -> "atletico-madrid" (also used by the build)
  function slug(name) {
    var t = String(name || "");
    try { t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
    return t.toLowerCase().replace(/ø/g, "o").replace(/ł/g, "l").replace(/ß/g, "ss").replace(/ı/g, "i")
      .replace(/&/g, " ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "club";
  }
  function ord(n) {
    var s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function range(z) { return z.from === z.to ? ord(z.from) : z.from + "–" + z.to; }
  function gd(r) { var d = r.gf - r.ga; return d > 0 ? "+" + d : d < 0 ? "−" + Math.abs(d) : "0"; }

  // "2026-10-21" is a date only; anything longer carries a time. API-Football's standings stamp is a date sent as
  // midnight UTC ("2026-10-21T00:00:00.000Z"), so that counts as a date only too: showing it as "01:00" would claim a
  // time nobody recorded.
  function isDateOnly(iso) { return /^\d{4}-\d{2}-\d{2}(T00:00(:00(\.0+)?)?(Z|\+00:00))?$/.test(String(iso || "")); }
  function ukTime(iso) {
    if (!iso) return "";
    var dateOnly = isDateOnly(iso);
    if (dateOnly) iso = String(iso).slice(0, 10);
    try {
      var opts = { timeZone: "Europe/London", day: "numeric", month: "short" };
      if (!dateOnly) { opts.hour = "2-digit"; opts.minute = "2-digit"; opts.hour12 = false; }
      return new Intl.DateTimeFormat("en-GB", opts).format(new Date(dateOnly ? iso + "T12:00:00Z" : iso));
    } catch (e) { return iso; }
  }

  function zoneOf(lg, pos) {
    for (var i = 0; i < lg.zones.length; i++) {
      var z = lg.zones[i];
      if (pos >= z.from && pos <= z.to) return z;
    }
    return null;
  }
  function groupsOf(lg) { return lg.groups && lg.groups.length ? lg.groups : [{ name: "", rows: lg.rows || [] }]; }
  /* Split seasons. Some leagues play a regular season, then split into a championship round and a relegation round
     (Greece, Scotland, Austria, Belgium…). The API sends each phase as its own table, so the relegation round's
     "1st" is really 7th or 13th. phases(lg) spots that shape (one full table, the others strictly smaller and made
     only of its clubs, none overlapping) and works out each club's final place: the phase tables in order of their
     best regular-season position, clubs in no phase table keeping their regular-season place. Returns null for
     anything else (conferences, regions, Apertura/Clausura), which keep their tables as they are. */
  var PHASE_NAME = /champion|relegation|promotion|play-?off|qualifying round|upper|lower|europ|conference|middle|title|2nd phase/i;
  function phases(lg) {
    var gs = groupsOf(lg);
    if (gs.length < 2) return null;
    var key = function (r) { return r.tid ? "t" + r.tid : "n" + slug(r.team); };
    var base = gs.slice().sort(function (a, b) { return b.rows.length - a.rows.length; })[0];
    if (gs.filter(function (g) { return g.rows.length === base.rows.length; }).length > 1) return null;
    var basePos = {};
    base.rows.forEach(function (r) { basePos[key(r)] = r.pos; });
    var seen = {}, others = gs.filter(function (g) { return g !== base; });
    // Only tables named as a later stage count: the API also sends first-phase groups, Apertura/Clausura halves and
    // conferences that look the same shape but aren't a split of one season.
    if (!others.every(function (g) { return PHASE_NAME.test(g.name || ""); })) return null;
    for (var i = 0; i < others.length; i++) for (var k = 0; k < others[i].rows.length; k++) {
      var kk = key(others[i].rows[k]);
      if (basePos[kk] == null || seen[kk]) return null;
      seen[kk] = 1;
    }
    var blocks = others.map(function (g) {
      return { g: g, at: Math.min.apply(null, g.rows.map(function (r) { return basePos[key(r)]; })), rows: g.rows.slice().sort(function (a, b) { return a.pos - b.pos; }) };
    });
    base.rows.forEach(function (r) { if (!seen[key(r)]) blocks.push({ g: null, at: r.pos, rows: [r] }); });
    blocks.sort(function (a, b) { return a.at - b.at; });
    var final = {}, offset = [], n = 0;
    blocks.forEach(function (b) {
      if (b.g) offset.push({ g: b.g, off: n });
      b.rows.forEach(function (r) { final[key(r)] = ++n; });
    });
    return { base: base, size: base.rows.length, pos: function (r) { return final[key(r)]; },
      offsetOf: function (g) { for (var j = 0; j < offset.length; j++) if (offset[j].g === g) return offset[j].off; return null; } };
  }
  // Each club once, even when a later stage's groups repeat it (Brazil's Série C second stage).
  function clubCount(lg) {
    var seen = {}, n = 0;
    groupsOf(lg).forEach(function (g) { g.rows.forEach(function (r) { var k = r.tid || r.team; if (!seen[k]) { seen[k] = 1; n++; } }); });
    return n;
  }
  function countryClubs(c) { return c.leagues.reduce(function (n, lg) { return n + clubCount(lg); }, 0); }

  // Play-off results, worked out by scripts/build.mjs from the next season's tables.
  var OUT = { "po-won": "▲ Won play-off", "po-stayed": "Stayed up", "po-lost": "▼ Lost play-off" };
  // UEFA league phase: what each club has already made certain, from the points still available.
  var QTAG = { "q-r16": ["✓ Last 16", "Certain to finish in the top 8"], "q-po": ["✓ Top 24", "Certain of at least a knockout play-off place"], "q-out": ["Out", "Can no longer reach the top 24"] };
  function markQualified(comp) {
    var rows = comp.rows || [], md = comp.matchdays;
    if (!md || rows.length < 24 || comp.groups) return comp;
    // Leave out results still being played, so nothing is declared certain mid-game.
    var base = rows.map(function (r) {
      var lp = r.live ? (r.live.gf > r.live.ga ? 3 : r.live.gf === r.live.ga ? 1 : 0) : 0;
      var p = r.live ? r.p - 1 : r.p, pts = r.pts - lp;
      return { r: r, pts: pts, max: pts + 3 * Math.max(0, md - p), p: p };
    });
    if (base.every(function (b) { return b.p >= md; })) return comp;   // finished: the zones say it all
    var any = false;
    var out = Object.assign({}, comp, { rows: base.map(function (b) {
      var catchable = base.filter(function (o) { return o !== b && o.max >= b.pts; }).length;   // could finish level or above
      var ahead = base.filter(function (o) { return o !== b && o.pts > b.max; }).length;       // certain to finish above
      var q = catchable <= 7 ? "q-r16" : catchable <= 23 ? "q-po" : ahead >= 24 ? "q-out" : null;
      if (q) any = true;
      return q ? Object.assign({}, b.r, { q: q }) : b.r;
    }) });
    if (any) out.notes = (comp.notes || []).concat(["✓ Last 16: certain to finish in the top 8. ✓ Top 24: certain of at least a play-off place. Out: can no longer reach the top 24. Worked out from the points still available."]);
    return out;
  }

  // The knockouts if the league phase ended now. UEFA's bracket is fixed by position; the draw only decides
  // which club of each pair goes where.
  function projectedHTML(comp) {
    var rows = comp.rows || [];
    if (rows.length < 24 || comp.groups) return "";
    var at = function (n) { return rows.filter(function (r) { return r.pos === n; })[0]; };
    var who = function (n) {
      var r = at(n), href = r && clubHref(comp, r);
      return '<span class="pj-club"><i>' + ord(n) + "</i>" + (r ? (href ? '<a href="' + esc(href) + '">' + esc(r.team) + "</a>" : esc(r.team)) : "") + "</span>";
    };
    var pair = function (a, b) { return '<div class="pj-pair">' + who(a) + who(b) + "</div>"; };
    var sets = [[1, 2, 15, 16, 17, 18], [3, 4, 13, 14, 19, 20], [5, 6, 11, 12, 21, 22], [7, 8, 9, 10, 23, 24]];
    var po = sets.map(function (x) { return '<div class="pj-tie">' + pair(x[2], x[3]) + '<span class="pj-v">v</span>' + pair(x[4], x[5]) + "</div>"; }).join("");
    var r16 = sets.map(function (x) {
      return '<div class="pj-tie">' + pair(x[0], x[1]) + '<span class="pj-v">v</span><div class="pj-pair pj-from">Play-off winners<br>(' + ord(x[2]) + "–" + ord(x[5]) + ")</div></div>";
    }).join("");
    return '<div class="pj"><p class="pj-note"><strong>As it stands.</strong> If the league phase ended now. In each pair the draw decides who goes where; ' +
      "the higher-placed clubs play the second leg at home. 25th–36th go out.</p>" +
      '<div class="pj-cols"><div class="pj-col"><h3 class="br-h">Knockout play-offs</h3>' + po + "</div>" +
      '<div class="pj-col"><h3 class="br-h">Round of 16</h3>' + r16 + "</div></div></div>";
  }


  /* ---------- Live scores ----------
     The live worker sends today's fixtures. applyLive() copies a country's official tables, adds the score of every
     game in progress (and finished games the official table hasn't caught up with), and re-sorts: "as it stands". */
  var LIVE_ST = ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"];
  var DONE_ST = ["FT", "AET", "PEN"];
  var OFF_ST = { PST: "Postponed", CANC: "Cancelled", ABD: "Abandoned", AWD: "Awarded", WO: "Walkover", TBD: "TBC" };
  function isLive(f) { return LIVE_ST.indexOf(f.st) > -1; }
  function isDone(f) { return DONE_ST.indexOf(f.st) > -1; }

  // "67′", "HT", "45+′" etc. Worked out from when each half kicked off, so it ticks without new data.
  function clock(f, now) {
    now = (now || Date.now()) / 1000;
    if (f.st === "1H" && f.p1) { var m = Math.floor((now - f.p1) / 60) + 1; return m > 45 ? "45+′" : Math.max(1, m) + "′"; }
    if (f.st === "2H" && f.p2) { var n = 45 + Math.floor((now - f.p2) / 60) + 1; return n > 90 ? "90+′" : Math.max(46, n) + "′"; }
    return { HT: "HT", ET: "ET", BT: "ET", P: "Pens", SUSP: "Susp.", INT: "Stopped", FT: "FT", AET: "AET", PEN: "Pens" }[f.st] || "Live";
  }

  function cmpRows(a, b) {
    return b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || a.pos - b.pos;
  }

  function applyLive(c, live, now) {
    var fx = live && live.fixtures ? live.fixtures.filter(function (f) { return f.c === c.country; }) : [];
    if (!fx.length) return c;
    var d = JSON.parse(JSON.stringify(c));
    d.liveCount = 0;
    d.leagues.forEach(function (lg) {
      var mine = fx.filter(function (f) { return f.l === lg.id; });
      if (!mine.length) return;
      var names = {};
      groupsOf(lg).forEach(function (g) { g.rows.forEach(function (r) { if (r.tid) names[r.tid] = r.team; }); });
      lg.today = mine.map(function (f) {
        return { st: f.st, ko: f.ko, clock: isLive(f) || isDone(f) ? clock(f, now) : "", off: OFF_ST[f.st] || "",
          g: f.g, live: isLive(f), home: names[f.h.id] || f.h.n, away: names[f.a.id] || f.a.n, hg: f.h.g, ag: f.a.g };
      });
      mine.forEach(function (f) { if (isLive(f)) d.liveCount++; });
      groupsOf(lg).forEach(function (g) {
        var byTid = {}, touched = false;
        g.rows.forEach(function (r) { if (r.tid) byTid[r.tid] = r; });
        mine.forEach(function (f) {
          var on = isLive(f), done = isDone(f);
          if ((!on && !done) || f.h.g == null || f.a.g == null) return;
          [["h", "a"], ["a", "h"]].forEach(function (pr) {
            var me = f[pr[0]], them = f[pr[1]], r = byTid[me.id];
            if (!r) return;
            // Skip if the official table already has this result (or, for a finished game, we can't tell).
            if (me.b == null ? done : r.p !== me.b) return;
            r.p++; r.gf += me.g; r.ga += them.g;
            if (me.g > them.g) { r.w++; r.pts += 3; } else if (me.g === them.g) { r.d++; r.pts += 1; } else r.l++;
            r.live = { on: on, clock: clock(f, now), gf: me.g, ga: them.g, opp: names[them.id] || them.n, home: pr[0] === "h" };
            touched = true;
          });
        });
        if (touched) {
          var was = {};
          g.rows.forEach(function (r) { was[r.team] = r.pos; });
          g.rows.sort(cmpRows);
          g.rows.forEach(function (r, i) { r.pos = i + 1; r.move = was[r.team] - r.pos; });
          lg.asItStands = true;
        }
      });
    });
    return d;
  }

  function todayHTML(lg) {
    if (!lg.today || !lg.today.length) return "";
    var live = lg.today.filter(function (f) { return f.live; }).length;
    var grouped = lg.groups && lg.groups.length > 1;
    var items = lg.today.map(function (f) {
      var started = f.hg != null && f.ag != null && !f.off;
      var t = f.off || (started ? f.clock : ukClock(f.ko));
      return '<li class="fx' + (f.live ? " on" : "") + '"><span class="fx-t">' + esc(t) + "</span>" +
        '<span class="fx-h">' + esc(f.home) + "</span>" +
        '<span class="fx-s">' + (started ? f.hg + "–" + f.ag : "v") + "</span>" +
        '<span class="fx-a">' + esc(f.away) + "</span>" +
        (grouped && f.g ? '<span class="fx-g">' + esc(f.g) + "</span>" : "") + "</li>";
    }).join("");
    return '<details class="today" id="today-' + esc(lg.id) + '"><summary>' +
      (live ? '<span class="live-dot" aria-hidden="true"></span>' : "") + "Today: " + lg.today.length + " game" + (lg.today.length === 1 ? "" : "s") +
      (live ? " · " + live + " live" : "") + "</summary><ul>" + items + "</ul></details>";
  }
  function ukClock(ts) {
    try {
      return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ts * 1000));
    } catch (e) { return ""; }
  }

  // Where a club's name in a table links to: a map of club pages (by club ID, or "n:<slug>" by name) when the
  // table comes with one (past seasons, Europe), otherwise the country's club folder for current tables.
  // "in the Premier League" but "in League One", "in Serie A", "in La Liga".
  function inLeague(name) {
    return "in " + (/^(League (One|Two)|La Liga|Segunda|Primera|Ligue|Serie|Liga )/.test(name) ? "" : "the ") + name;
  }

  function clubHref(lg, r) {
    if (lg._paths) {
      var p = (r.tid && lg._paths[r.tid]) || lg._paths["n:" + slug(r.team)];
      return p ? (lg._root || "") + p + (lg._suffix || "") : null;
    }
    return lg._club && r.tid ? lg._club + slug(r.team) + "/" + (lg._suffix || "") : null;
  }

  /* ---------- Pieces ---------- */
  // Points from the last five games (form is stored oldest first).
  function formPts(form) {
    return String(form || "").slice(-5).split("").reduce(function (a, c) { return a + (c === "W" ? 3 : c === "D" ? 1 : 0); }, 0);
  }
  function rowHTML(lg, rows, r, i, hasForm) {
    var z = zoneOf(lg, r.pos);
    var next = rows[i + 1];
    var cls = [];
    if (z) cls.push("z-" + z.kind);
    if (next && zoneOf(lg, next.pos) !== z) cls.push("edge");
    if (lg._hl && r.tid === lg._hl) cls.push("is-this");
    var form = "";
    if (hasForm) {
      form = '<td class="c-form"><span class="form" aria-label="Last five, most recent last: ' + esc(r.form || "") + '">' +
        String(r.form || "").slice(-5).split("").map(function (c) {
          return /[WDL]/.test(c) ? '<b class="' + c + '">' + c + "</b>" : "";
        }).join("") + "</span></td>";
    }
    return '<tr class="' + cls.join(" ") + '" data-team="' + esc(r.team) + '" data-pos="' + r.pos + '" data-fp="' + formPts(r.form) + '">' +
      // The zone colour is repeated as text for screen readers, so the table never relies on colour alone.
      '<td class="c-pos">' + r.pos + (z ? '<span class="sr-only"> (' + esc(z.label) + ")</span>" : "") +
        (r.move ? '<span class="mv ' + (r.move > 0 ? "mv-up" : "mv-down") + '" title="' + (r.move > 0 ? "Up " : "Down ") + Math.abs(r.move) + ' as it stands">' + (r.move > 0 ? "▲" : "▼") + "</span>" : "") + "</td>" +
      '<th scope="row" class="c-club">' + (clubHref(lg, r) ? '<a class="club-link" href="' + esc(clubHref(lg, r)) + '">' + esc(r.team) + "</a>" : esc(r.team)) +
        (r.ded ? '<span class="ded" title="' + r.ded + ' points deducted">−' + r.ded + "</span>" : "") +
        (r.out ? '<span class="out ' + r.out + '">' + OUT[r.out] + "</span>" : "") +
        (r.q ? '<span class="qtag ' + r.q + '" title="' + esc(QTAG[r.q][1]) + '">' + QTAG[r.q][0] + "</span>" : "") +
        (r.live ? '<span class="lv ' + (r.live.gf > r.live.ga ? "lv-w" : r.live.gf < r.live.ga ? "lv-l" : "lv-d") + (r.live.on ? " on" : "") +
          '" title="' + esc((r.live.home ? r.team + " " + r.live.gf + "–" + r.live.ga + " " + r.live.opp : r.live.opp + " " + r.live.ga + "–" + r.live.gf + " " + r.team) + " (" + r.live.clock + ")") + '">' +
          esc(r.live.clock) + " " + r.live.gf + "–" + r.live.ga + "</span>" : "") + "</th>" +
      '<td class="c-n">' + r.p + "</td>" +
      '<td class="c-n c-w">' + r.w + "</td>" +
      '<td class="c-n c-d">' + r.d + "</td>" +
      '<td class="c-n c-l">' + r.l + "</td>" +
      '<td class="c-n c-gf">' + r.gf + "</td>" +
      '<td class="c-n c-ga">' + r.ga + "</td>" +
      '<td class="c-gd">' + gd(r) + "</td>" + form +
      '<td class="c-pts"><span class="v-t">' + r.pts + '</span><span class="v-f">' + formPts(r.form) + "</span></td></tr>";
  }

  function tableHTML(lg, rows, caption) {
    var hasForm = rows.some(function (r) { return r.form; });
    return '<div class="table-wrap"><table><caption class="sr-only">' + esc(caption) + "</caption>" +
      "<thead><tr>" +
        '<th scope="col" class="c-pos"><abbr title="Position">Pos</abbr></th>' +
        '<th scope="col" class="c-club">Club</th>' +
        '<th scope="col" class="c-n"><abbr title="Played">P</abbr></th>' +
        '<th scope="col" class="c-n c-w"><abbr title="Won">W</abbr></th>' +
        '<th scope="col" class="c-n c-d"><abbr title="Drawn">D</abbr></th>' +
        '<th scope="col" class="c-n c-l"><abbr title="Lost">L</abbr></th>' +
        '<th scope="col" class="c-n c-gf"><abbr title="Goals for">GF</abbr></th>' +
        '<th scope="col" class="c-n c-ga"><abbr title="Goals against">GA</abbr></th>' +
        '<th scope="col" class="c-gd"><abbr title="Goal difference">GD</abbr></th>' +
        (hasForm ? '<th scope="col" class="c-form"><abbr title="Last five league games, most recent on the right">Form</abbr></th>' : "") +
        '<th scope="col" class="c-pts"><abbr class="v-t" title="Points">Pts</abbr><abbr class="v-f" title="Points from the last five games">L5</abbr></th>' +
      "</tr></thead><tbody>" +
      rows.map(function (r, i) { return rowHTML(lg, rows, r, i, hasForm); }).join("") +
      "</tbody></table></div>";
  }

  function legendHTML(lg, grouped) {
    if (!lg.zones || !lg.zones.length) return "";
    return '<ul class="legend" aria-label="Table key">' + lg.zones.map(function (z) {
      return '<li class="k-' + z.kind + '"><i></i>' + range(z) + (grouped ? " in each group " : " ") + esc(z.label) + "</li>";
    }).join("") + "</ul>";
  }

  function notesHTML(lg) {
    return (lg.notes || []).length
      ? '<ul class="tier-notes">' + lg.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + "</ul>"
      : "";
  }

  // For one table of a split season: the league with its zones moved to that table's places (the relegation round's
  // 1st is the league's 7th, say), or with no zones at all for the regular-season table, which decides nothing.
  function phaseLg(lg, g) {
    var ph = phases(lg);
    if (!ph) return lg;
    var off = g === ph.base ? null : ph.offsetOf(g);
    var copy = {}; for (var k in lg) copy[k] = lg[k];
    copy.zones = off == null ? [] : (lg.zones || []).map(function (z) { return { from: z.from - off, to: z.to - off, kind: z.kind, label: z.label }; })
      .filter(function (z) { return z.to >= 1 && z.from <= g.rows.length; });
    return copy;
  }
  // opts: { eyebrow, more: {href, text} }
  function tierHTML(lg, opts) {
    opts = opts || {};
    var grouped = !!(lg.groups && lg.groups.length);
    var meta = clubCount(lg) + " clubs · " + (lg.final ? "final table" : lg.asItStands ? "as it stands" : "as of " + ukTime(lg.updated));
    var body = grouped
      ? lg.groups.map(function (g) {
          var stamp = g.updated && g.updated !== lg.updated ? "as of " + ukTime(g.updated) : "";
          return '<div class="group"><div class="group-head"><h3>' + esc(g.name) + "</h3>" +
            (stamp ? "<span>" + stamp + "</span>" : "") + "</div>" +
            tableHTML(phaseLg(lg, g), g.rows, lg.name + ", " + g.name) + "</div>";
        }).join("")
      : tableHTML(lg, lg.rows, lg.name + " table");
    if (grouped) {
      var dates = lg.groups.map(function (g) { return g.updated || lg.updated; });
      var newest = dates.slice().sort().pop();
      meta = clubCount(lg) + " clubs in " + lg.groups.length + " groups · " + (lg.final ? "final tables" : lg.asItStands ? "as they stand" : "as of " + ukTime(newest));
    }
    return '<section class="tier" id="' + esc(lg.id) + '" aria-labelledby="h-' + esc(lg.id) + '">' +
      '<header class="tier-head"><p class="tier-num">' + esc(opts.eyebrow || "Tier " + lg.tier) + "</p>" +
      '<h2 id="h-' + esc(lg.id) + '">' + esc(lg.name) + "</h2>" +
      '<p class="tier-meta">' + meta + "</p>" +
      (opts.fixtures ? '<a class="tier-fx" href="' + esc(opts.fixtures) + '">Fixtures and results <span aria-hidden="true">→</span></a>' : "") +
      (groupsOf(lg).some(function (g) { return g.rows.some(function (r) { return r.form; }); }) && !lg.final
        ? '<div class="tview" role="group" aria-label="Sort by"><button type="button" class="on" data-view="table" aria-pressed="true">Table</button>' +
          '<button type="button" data-view="form" aria-pressed="false">Form <span>last 5</span></button></div>' : "") + "</header>" +
      todayHTML(lg) + legendHTML(lg, grouped) + body + notesHTML(lg) +
      (opts.more ? '<a class="more" href="' + esc(opts.more.href) + '">' + esc(opts.more.text) + ' <span aria-hidden="true">→</span></a>' : "") +
      "</section>";
  }

  function bandHTML(upper, lower, belowNote) {
    if (!upper.relegationNote) return "";
    return '<div class="band" role="note">' +
      '<p class="band-label">Tier ' + upper.tier + " ⇅ Tier " + (upper.tier + 1) + "</p>" +
      '<p class="band-down"><span class="arw" aria-hidden="true">▼</span><strong>' + esc(upper.name) + ":</strong> " + esc(upper.relegationNote) + "</p>" +
      '<p class="band-up"><span class="arw" aria-hidden="true">▲</span>' + (lower ? "<strong>" + esc(lower.name) + ":</strong> " + esc(lower.promotionNote) : esc(belowNote)) + "</p>" +
      "</div>";
  }

  function stampHTML(mode, updated, liveCount) {
    if (liveCount) return '<p class="stamp live now" id="stamp"><span class="dot"></span><span>' + liveCount + " game" + (liveCount === 1 ? "" : "s") +
      " live · tables show scores as they stand</span></p>";
    if (mode === "final") return '<p class="stamp final" id="stamp"><span class="dot"></span><span>Final tables</span></p>';
    // The date is when the newest table last changed (in practice its latest matchday), not when the site last
    // checked: a quiet midweek keeps an older date even though the feed is working.
    var live = mode === "live";
    return '<p class="stamp' + (live ? " live" : "") + '" id="stamp"><span class="dot"></span><span>' +
      (live ? "Standings as of " : "Sample snapshot · standings as of ") + ukTime(updated) + (isDateOnly(updated) ? "" : " UK") +
      (live ? " · checked through the day" : "") + "</span></p>";
  }

  var INLINE_AD = '<div class="ad ad-inline"><span class="ad-tag">Advertisement</span>' +
    '<span class="ad-size"><span class="wide">728 × 90</span><span class="narrow">320 × 100</span></span></div>';

  // c: a country's data, or a home-page summary (whose leagues carry clubs/groups counts). link: page the bars link to.
  // cups: [{ name, href, status, span }] shown as chips under the bars.
  var CUP_ICON = '<svg class="cup-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2h8v3a4 4 0 0 1-8 0V2zM4 3H2v1a2.5 2.5 0 0 0 2.6 2.5M12 3h2v1a2.5 2.5 0 0 1-2.6 2.5M8 9v3M5 14h6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function cupChipsHTML(cups) {
    if (!cups || !cups.length) return "";
    return '<div class="pyr-cups"><span class="pyr-cups-h">Cups</span>' + cups.map(function (c) {
      // A chip without a page to open (a past season whose ties aren't saved yet) is shown but not linked.
      var tag = c.href ? 'a class="cup-chip" href="' + esc(c.href) + '"' : 'span class="cup-chip no-link"';
      return "<" + tag + ">" + CUP_ICON + '<span class="cup-chip-name">' + esc(c.name) + "</span>" +
        '<span class="cup-chip-meta">' + esc([c.span, c.status].filter(Boolean).join(" · ")) + "</span></" + tag.split(" ")[0] + ">";
    }).join("") + "</div>";
  }

  function pyramidHTML(c, link, cups) {
    var tiers = c.leagues.map(function (lg) {
      var g = lg.groups && lg.groups.length;
      return { tier: lg.tier, name: lg.name, short: lg.short, clubs: lg.clubs != null && !lg.rows && !lg.groups ? lg.clubs : clubCount(lg),
        groups: lg.groupCount != null ? lg.groupCount : g ? lg.groups.length : 0, href: c.country === "europe" ? (link || "") + lg.id + "/" : (link || "") + "#" + lg.id };
    }).concat(c.later || []);
    var max = Math.max.apply(null, tiers.map(function (t) { return t.clubs; }));
    var rows = tiers.map(function (t) {
      var detail = t.clubs + " clubs" + (t.groups ? " · " + t.groups + " groups" : "") + (t.href ? "" : " · soon");
      var inner =
        '<span class="pyr-tier">Tier ' + t.tier + "</span>" +
        '<span class="pyr-track"><span class="pyr-bar" style="--w:' + (t.clubs / max * 100).toFixed(2) + '%"></span>' +
        '<span class="pyr-label"><span><span class="nm-long">' + esc(t.name) + '</span><span class="nm-short">' + esc(t.short || t.name) + "</span></span>" +
        "<small>" + detail + "</small></span></span>";
      return t.href ? '<a class="pyr-row" href="' + t.href + '">' + inner + "</a>" : '<div class="pyr-row soon">' + inner + "</div>";
    }).join("");
    return '<figure class="pyr"><div class="pyr-rows">' + rows + "</div>" + cupChipsHTML(cups) +
      "<figcaption>Bar width is to scale with the number of clubs in each tier." +
      ((c.later || []).length ? " Tiers " + c.later.map(function (t) { return t.tier; }).join(" and ") + " are next to be added." : "") +
      "</figcaption></figure>";
  }

  /* ---------- Whole pages (the inside of <main>) ---------- */
  // "ENGLAND · 2026–27 ▾" that opens to a button per season. seasons: [{ label, href, current }]
  function seasonsHTML(c, seasons) {
    var head = esc(c.name) + '<span class="sep" aria-hidden="true">·</span>' + esc(c.season);
    if (!seasons || seasons.length < 2) return '<p class="seasons"><span class="seasons-head">' + head + "</span></p>";
    return '<details class="seasons"><summary class="seasons-head">' + head + '<span class="seasons-more">Seasons</span></summary>' +
      '<ul aria-label="Seasons">' + seasons.map(function (s) {
        return "<li>" + (s.current ? '<span aria-current="page">' + esc(s.label) + "</span>" : '<a href="' + esc(s.href) + '">' + esc(s.label) + "</a>") + "</li>";
      }).join("") + "</ul></details>";
  }

  function countryMain(c, opts) {
    opts = opts || {};
    var last = c.leagues[c.leagues.length - 1];
    var n = ["", "one", "two", "three", "four", "five", "six"][c.leagues.length];
    var past = c.mode === "final";
    var html =
      '<section class="intro" aria-labelledby="intro-h">' +
      '<h1 id="intro-h">The ' + esc(c.adjective) + " football pyramid</h1>" +
      seasonsHTML(c, opts.seasons) +
      (past
        ? '<p class="lede">Final tables for the top ' + n + " tiers of " + esc(c.adjective) + " football in " + esc(c.season) +
          ", from " + esc(c.leagues[0].name) + " down to " + esc(last.name) + ". Promotion, play-off and relegation places are marked from each league's records.</p>"
        : '<p class="lede">Every league in the top ' + n + " tiers of " + esc(c.adjective) + " football, from " + esc(c.leagues[0].name) +
          " down to " + esc(last.name) + ". Promotion, play-off and relegation places are marked on every table.</p>") +
      stampHTML(c.mode, c.updated, c.liveCount) + pyramidHTML(c, "", opts.cups) +
      (opts.racesHref ? '<a class="tf-tab tf-go races-link" href="' + esc(opts.racesHref) + '">Promotion and relegation races <span aria-hidden="true">→</span></a>' : "") + "</section>";
    c.leagues.forEach(function (lg, i) {
      if (!past) { lg._club = "club/"; lg._suffix = opts.suffix || ""; }
      else if (opts.clubPaths) { lg._paths = opts.clubPaths; lg._root = opts.root || ""; lg._suffix = opts.suffix || ""; }
      html += tierHTML(lg, { fixtures: (opts.fixtures || {})[c.country + "/" + lg.id] }) + bandHTML(lg, c.leagues[i + 1] || null, c.belowNote);
      if (i === 1) html += INLINE_AD;
    });
    return html;
  }

  /* ---------- Promotion and relegation races ----------
     For each league below the top flight: its promotion and play-off places as configured, plus the two clubs just
     outside, with the points gap at each cut line. For every league with relegation places: the same at the bottom.
     Nothing here decides who is "in the race"; the zones come from scripts/leagues.mjs (or the API's labels). */
  var RACE_OUT = 2;   // clubs shown beyond the last line
  var PROMO = /promot|play-?off/i, EURO = /champions|europa|conference|uefa/i;
  function raceRows(lg, rows, side, href) {
    var zones = (lg.zones || []).filter(function (z) {
      return side === "up" ? z.kind !== "down" && PROMO.test(z.label) && !EURO.test(z.label) : z.kind === "down";
    }).sort(function (a, b) { return a.from - b.from; });
    if (!zones.length || !rows.length) return "";
    var first = side === "up" ? 1 : Math.max(1, zones[0].from - RACE_OUT);
    var last = side === "up" ? Math.min(rows.length, zones[zones.length - 1].to + RACE_OUT) : rows.length;
    // Cut lines sit below each promotion zone, or above each relegation zone.
    var lines = {};
    zones.forEach(function (z) { var at = side === "up" ? z.to : z.from - 1; if (at >= 1 && at < rows.length) lines[at] = z; });
    var out = "";
    rows.forEach(function (r, i) {
      if (r.pos < first || r.pos > last) return;
      var z = zoneOf(lg, r.pos), h = href(r);
      out += '<li class="rc-row' + (z ? " z-" + z.kind : "") + '"><span class="rc-pos">' + r.pos + (z ? '<span class="sr-only"> (' + esc(z.label) + ")</span>" : "") + "</span>" +
        '<span class="rc-club">' + (h ? '<a class="club-link" href="' + esc(h) + '">' + esc(r.team) + "</a>" : esc(r.team)) + (r.ded ? ' <span class="ded" title="' + r.ded + ' points deducted">−' + r.ded + "</span>" : "") + "</span>" +
        '<span class="rc-p" title="Played">' + r.p + '</span><span class="rc-pts">' + r.pts + "</span></li>";
      var cut = lines[r.pos], below = rows[i + 1];
      if (cut && below) {
        var g = r.pts - below.pts;
        out += '<li class="rc-cut rc-' + side + '"><span>' + esc(cut.label.replace(/-offs$/i, "-off")) + " line</span><b>" +
          (g === 0 ? "Level on points either side" : g + "-point gap") + "</b>" +
          (r.p !== below.p ? '<i>' + ord(r.pos) + " has played " + r.p + ", " + ord(below.pos) + " " + below.p + "</i>" : "") + "</li>";
      }
    });
    return out;
  }
  // c: a country's current data. opts: { root, suffix, tableHref } (links to club pages and back to the tables).
  function racesMain(c, opts) {
    opts = opts || {};
    var href = function (r) { return r.tid ? (opts.root || "") + c.country + "/club/" + slug(r.team) + "/" + (opts.suffix || "") : null; };
    var block = function (side) {
      var html = "";
      c.leagues.forEach(function (lg) {
        if (side === "up" && lg.tier === 1) return;     // the top flight's places are European, not promotion
        groupsOf(lg).forEach(function (g) {
          var body = raceRows(lg, g.rows, side, href);
          if (!body) return;
          html += '<section class="rc"><div class="rc-h"><p>Tier ' + lg.tier + "</p><h3>" + esc(lg.name) + (g.name ? " · " + esc(g.name) : "") + "</h3>" +
            '<span>' + (lg.final ? "final table" : "as of " + ukTime(g.updated || lg.updated)) + "</span></div>" +
            '<ol class="rc-list"><li class="rc-row rc-head" aria-hidden="true"><span>Pos</span><span>Club</span><span>P</span><span>Pts</span></li>' + body + "</ol>" + notesHTML(lg) + "</section>";
        });
      });
      return html || '<p class="ko-empty">No ' + (side === "up" ? "promotion" : "relegation") + " places are set for these leagues yet.</p>";
    };
    return '<section class="intro" aria-labelledby="intro-h"><p class="eyebrow crumbs"><a href="' + esc(opts.tableHref || "../") + '">' + esc(c.name) + "</a> · " + esc(c.season) + "</p>" +
      '<h1 id="intro-h">' + esc(c.adjective) + " promotion and relegation races</h1>" +
      '<p class="lede">Every promotion, play-off and relegation place in the ' + esc(c.adjective) + " leagues covered here, with the clubs just outside them and the points between each side of the line.</p>" +
      stampHTML(c.mode, c.updated, 0) + "</section>" +
      '<section class="comp" data-tabs="races"><div class="tf-tabs comp-tabs" role="tablist" aria-label="Races">' +
      '<button type="button" role="tab" class="tf-tab on" data-tab="up" aria-selected="true">Promotion</button>' +
      '<button type="button" role="tab" class="tf-tab" data-tab="down" aria-selected="false">Relegation</button></div>' +
      '<div class="tf-panel on" data-panel="up" role="tabpanel"><div class="rc-grid">' + block("up") + "</div></div>" +
      '<div class="tf-panel" data-panel="down" role="tabpanel"><div class="rc-grid">' + block("down") + "</div></div></section>";
  }

  /* ---------- Flags (simple SVGs, so they look the same on every device) ---------- */
  var FLAGS = {
    europe: '<rect width="30" height="20" fill="#1F3A93"/><circle cx="20.60" cy="10.00" r="0.9" fill="#FFCC00"/><circle cx="19.85" cy="12.80" r="0.9" fill="#FFCC00"/><circle cx="17.80" cy="14.85" r="0.9" fill="#FFCC00"/><circle cx="15.00" cy="15.60" r="0.9" fill="#FFCC00"/><circle cx="12.20" cy="14.85" r="0.9" fill="#FFCC00"/><circle cx="10.15" cy="12.80" r="0.9" fill="#FFCC00"/><circle cx="9.40" cy="10.00" r="0.9" fill="#FFCC00"/><circle cx="10.15" cy="7.20" r="0.9" fill="#FFCC00"/><circle cx="12.20" cy="5.15" r="0.9" fill="#FFCC00"/><circle cx="15.00" cy="4.40" r="0.9" fill="#FFCC00"/><circle cx="17.80" cy="5.15" r="0.9" fill="#FFCC00"/><circle cx="19.85" cy="7.20" r="0.9" fill="#FFCC00"/>',
    england: '<rect width="30" height="20" fill="#fff"/><rect x="12.5" width="5" height="20" fill="#CE1124"/><rect y="7.5" width="30" height="5" fill="#CE1124"/>',
    spain: '<rect width="30" height="20" fill="#AA151B"/><rect y="5" width="30" height="10" fill="#F1BF00"/>',
    germany: '<rect width="30" height="20" fill="#FFCE00"/><rect width="30" height="13.33" fill="#DD0000"/><rect width="30" height="6.67" fill="#000"/>',
    france: '<rect width="30" height="20" fill="#CE1126"/><rect width="20" height="20" fill="#fff"/><rect width="10" height="20" fill="#002654"/>',
    italy: '<rect width="30" height="20" fill="#CE2B37"/><rect width="20" height="20" fill="#fff"/><rect width="10" height="20" fill="#009246"/>',
    belgium: '<rect width="30" height="20" fill="#EF3340"/><rect width="20" height="20" fill="#FDDA24"/><rect width="10" height="20" fill="#000"/>',
    croatia: '<rect width="30" height="20" fill="#171796"/><rect width="30" height="13.33" fill="#fff"/><rect width="30" height="6.67" fill="#FF0000"/>' +
      '<rect x="12" y="5" width="6" height="7.5" fill="#fff"/><path d="M12 5h2v1.5h-2zM16 5h2v1.5h-2zM14 6.5h2v1.5h-2zM12 8h2v1.5h-2zM16 8h2v1.5h-2zM14 9.5h2v1.5h-2zM12 11h2v1.5h-2zM16 11h2v1.5h-2z" fill="#FF0000"/>',
    netherlands: '<rect width="30" height="20" fill="#21468B"/><rect width="30" height="13.33" fill="#fff"/><rect width="30" height="6.67" fill="#AE1C28"/>',
    portugal: '<rect width="30" height="20" fill="#FF0000"/><rect width="12" height="20" fill="#006600"/><circle cx="12" cy="10" r="3.6" fill="none" stroke="#FFE000" stroke-width="1.4"/>',
    scotland: '<rect width="30" height="20" fill="#0065BD"/><path d="M0 0L30 20M30 0L0 20" stroke="#fff" stroke-width="3.6"/>',
    turkey: '<rect width="30" height="20" fill="#E30A17"/><circle cx="11" cy="10" r="5" fill="#fff"/><circle cx="12.25" cy="10" r="4" fill="#E30A17"/>' +
      '<path d="M15.6 10l3.7-1.2-2.3 3.15V8.05l2.3 3.15z" fill="#fff"/>',
    switzerland: '<rect width="30" height="20" fill="#DA291C"/><path d="M13.25 4.5h3.5v3.75h3.75v3.5h-3.75v3.75h-3.5v-3.75H9.5v-3.5h3.75z" fill="#fff"/>',
    austria: '<rect width="30" height="20" fill="#C8102E"/><rect y="6.67" width="30" height="6.67" fill="#fff"/>',
    greece: '<rect width="30" height="20" fill="#0D5EAF"/><rect y="2.22" width="30" height="2.22" fill="#fff"/><rect y="6.66" width="30" height="2.22" fill="#fff"/><rect y="11.10" width="30" height="2.22" fill="#fff"/><rect y="15.54" width="30" height="2.22" fill="#fff"/><rect width="11.11" height="11.11" fill="#0D5EAF"/><path d="M4.44 0h2.22v11.11H4.44zM0 4.44h11.11v2.22H0z" fill="#fff"/>',
    brazil: '<rect width="30" height="20" fill="#009C3B"/><path d="M15 2.2L27.4 10 15 17.8 2.6 10z" fill="#FFDF00"/><circle cx="15" cy="10" r="4.6" fill="#002776"/><path d="M10.6 9.1q4.4-1.2 8.9 1.9" stroke="#fff" stroke-width="0.9" fill="none"/>',
    argentina: '<rect width="30" height="20" fill="#74ACDF"/><rect y="6.67" width="30" height="6.67" fill="#fff"/><circle cx="15" cy="10" r="1.9" fill="#F6B40E" stroke="#85340A" stroke-width="0.3"/>',
    china: '<rect width="30" height="20" fill="#EE1C25"/><path d="M5.00 2.00L5.67 4.07L7.85 4.07L6.09 5.35L6.76 7.43L5.00 6.15L3.24 7.43L3.91 5.35L2.15 4.07L4.33 4.07z" fill="#FFFF00"/><path d="M10.39 1.08L10.33 1.80L11.00 2.09L10.29 2.25L10.22 2.97L9.85 2.35L9.14 2.52L9.62 1.97L9.25 1.34L9.91 1.63zM12.71 3.29L12.38 3.94L12.89 4.45L12.17 4.34L11.84 4.99L11.73 4.27L11.01 4.16L11.66 3.83L11.55 3.11L12.06 3.62zM12.94 6.66L12.37 7.11L12.62 7.79L12.01 7.38L11.44 7.83L11.64 7.13L11.04 6.72L11.76 6.70L11.97 6.00L12.21 6.68zM10.36 8.07L10.32 8.79L11.00 9.05L10.30 9.24L10.26 9.97L9.86 9.36L9.16 9.54L9.62 8.98L9.22 8.37L9.90 8.63z" fill="#FFFF00"/>',
    japan: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#BC002D"/>',
    indonesia: '<rect width="30" height="20" fill="#fff"/><rect width="30" height="10" fill="#CE1126"/>',
    mexico: '<rect width="30" height="20" fill="#CE1126"/><rect width="20" height="20" fill="#fff"/><rect width="10" height="20" fill="#006847"/><circle cx="15" cy="10" r="2.6" fill="#8C6239"/><circle cx="15" cy="10" r="1.3" fill="#006847"/>',
    usa: '<rect width="30" height="20" fill="#B22234"/><rect y="1.54" width="30" height="1.54" fill="#fff"/><rect y="4.62" width="30" height="1.54" fill="#fff"/><rect y="7.69" width="30" height="1.54" fill="#fff"/><rect y="10.77" width="30" height="1.54" fill="#fff"/><rect y="13.85" width="30" height="1.54" fill="#fff"/><rect y="16.92" width="30" height="1.54" fill="#fff"/><rect width="12" height="10.77" fill="#3C3B6E"/><circle cx="1.10" cy="1.30" r="0.45" fill="#fff"/><circle cx="3.10" cy="1.30" r="0.45" fill="#fff"/><circle cx="5.10" cy="1.30" r="0.45" fill="#fff"/><circle cx="7.10" cy="1.30" r="0.45" fill="#fff"/><circle cx="9.10" cy="1.30" r="0.45" fill="#fff"/><circle cx="11.10" cy="1.30" r="0.45" fill="#fff"/><circle cx="2.10" cy="3.35" r="0.45" fill="#fff"/><circle cx="4.10" cy="3.35" r="0.45" fill="#fff"/><circle cx="6.10" cy="3.35" r="0.45" fill="#fff"/><circle cx="8.10" cy="3.35" r="0.45" fill="#fff"/><circle cx="10.10" cy="3.35" r="0.45" fill="#fff"/><circle cx="1.10" cy="5.40" r="0.45" fill="#fff"/><circle cx="3.10" cy="5.40" r="0.45" fill="#fff"/><circle cx="5.10" cy="5.40" r="0.45" fill="#fff"/><circle cx="7.10" cy="5.40" r="0.45" fill="#fff"/><circle cx="9.10" cy="5.40" r="0.45" fill="#fff"/><circle cx="11.10" cy="5.40" r="0.45" fill="#fff"/><circle cx="2.10" cy="7.45" r="0.45" fill="#fff"/><circle cx="4.10" cy="7.45" r="0.45" fill="#fff"/><circle cx="6.10" cy="7.45" r="0.45" fill="#fff"/><circle cx="8.10" cy="7.45" r="0.45" fill="#fff"/><circle cx="10.10" cy="7.45" r="0.45" fill="#fff"/><circle cx="1.10" cy="9.50" r="0.45" fill="#fff"/><circle cx="3.10" cy="9.50" r="0.45" fill="#fff"/><circle cx="5.10" cy="9.50" r="0.45" fill="#fff"/><circle cx="7.10" cy="9.50" r="0.45" fill="#fff"/><circle cx="9.10" cy="9.50" r="0.45" fill="#fff"/><circle cx="11.10" cy="9.50" r="0.45" fill="#fff"/>',
    australia: '<rect width="30" height="20" fill="#012169"/><rect width="15" height="10" fill="#012169"/><path d="M0 0L15 10M15 0L0 10" stroke="#fff" stroke-width="2"/><path d="M0 0L15 10M15 0L0 10" stroke="#C8102E" stroke-width="0.7"/><path d="M7.5 0v10M0 5h15" stroke="#fff" stroke-width="3.2"/><path d="M7.5 0v10M0 5h15" stroke="#C8102E" stroke-width="1.8"/><path d="M7.50 12.60L7.97 14.03L9.38 13.50L8.55 14.76L9.84 15.53L8.34 15.67L8.54 17.16L7.50 16.08L6.46 17.16L6.66 15.67L5.16 15.53L6.45 14.76L5.62 13.50L7.03 14.03z" fill="#fff"/><path d="M22.50 15.10L22.73 15.81L23.44 15.55L23.03 16.18L23.67 16.57L22.92 16.64L23.02 17.38L22.50 16.84L21.98 17.38L22.08 16.64L21.33 16.57L21.97 16.18L21.56 15.55L22.27 15.81zM18.20 8.00L18.43 8.71L19.14 8.45L18.73 9.08L19.37 9.47L18.62 9.54L18.72 10.28L18.20 9.74L17.68 10.28L17.78 9.54L17.03 9.47L17.67 9.08L17.26 8.45L17.97 8.71zM22.50 2.20L22.73 2.91L23.44 2.65L23.03 3.28L23.67 3.67L22.92 3.74L23.02 4.48L22.50 3.94L21.98 4.48L22.08 3.74L21.33 3.67L21.97 3.28L21.56 2.65L22.27 2.91zM26.30 6.90L26.53 7.61L27.24 7.35L26.83 7.98L27.47 8.37L26.72 8.44L26.82 9.18L26.30 8.64L25.78 9.18L25.88 8.44L25.13 8.37L25.77 7.98L25.36 7.35L26.07 7.61z" fill="#fff"/><path d="M24.20 10.60L24.33 11.01L24.77 11.01L24.42 11.27L24.55 11.69L24.20 11.43L23.85 11.69L23.98 11.27L23.63 11.01L24.07 11.01z" fill="#fff"/>'
  };
  function flag(country) {
    var f = FLAGS[country];
    return f ? '<svg class="flag" viewBox="0 0 30 20" width="30" height="20" aria-hidden="true">' + f + "</svg>" : "";
  }

  // A country's summary for the home page: enough to draw its pyramid and card without the tables.
  function summary(c) {
    return {
      country: c.country, name: c.name, adjective: c.adjective, code: c.code, featured: !!c.featured, region: c.region || null,
      tiers: c.leagues.length, clubs: countryClubs(c), sizes: c.leagues.map(clubCount),
      leagues: c.leagues.map(function (lg) {
        return { id: lg.id, tier: lg.tier, name: lg.name, short: lg.short, clubs: clubCount(lg), groupCount: lg.groups ? lg.groups.length : 0,
          leader: lg.rows && lg.rows[0] ? lg.rows[0].team : null };
      })
    };
  }

  // Today's games across every country, for the strip under the headline.
  function stripHTML(live, all, base, suffix, names, now) {
    var fx = live && live.fixtures ? live.fixtures.slice() : [];
    if (!fx.length) return "";
    var nm = function (t) { return names[t.id] || t.n; };
    var info = {};
    all.forEach(function (s) { s.leagues.forEach(function (lg) { info[s.country + "/" + lg.id] = { short: lg.short || lg.name, name: lg.name, tier: lg.tier }; }); });
    var rank = function (f) { return isLive(f) ? 0 : f.st === "NS" ? 1 : isDone(f) ? 2 : 3; };
    fx.sort(function (a, b) {
      var ta = (info[a.c + "/" + a.l] || {}).tier || 9, tb = (info[b.c + "/" + b.l] || {}).tier || 9;
      return rank(a) - rank(b) || ta - tb || a.ko - b.ko;
    });
    var liveN = fx.filter(isLive).length;
    // Count competitions, not countries: a night of European games is one "country" (Europe) but several
    // competitions, and the clubs come from all over. One or two are named; more are counted.
    var comps = [];
    fx.forEach(function (f) { var k = f.c + "/" + f.l; if (comps.indexOf(k) < 0) comps.push(k); });
    var where = comps.length <= 2
      ? "the " + comps.map(function (k) { return esc((info[k] || {}).name || "league"); }).join(" and the ")
      : comps.length + " competitions";
    var chips = fx.slice(0, 24).map(function (f) {
      var lg = info[f.c + "/" + f.l] || { short: "" };
      var started = f.h.g != null && f.a.g != null && !OFF_ST[f.st];
      var t = OFF_ST[f.st] || (started ? clock(f, now) : ukClock(f.ko));
      var href = f.c === "europe" ? base + "europe/" + f.l + "/" + suffix : base + f.c + "/" + suffix + "#" + f.l;
      return '<li><a class="chip' + (isLive(f) ? " on" : "") + '" href="' + esc(href) + '">' +
        '<span class="chip-top">' + flag(f.c) + "<span>" + esc(lg.short) + "</span><b>" + esc(t) + "</b></span>" +
        '<span class="chip-row"><span>' + esc(nm(f.h)) + "</span><b>" + (started ? f.h.g : "") + "</b></span>" +
        '<span class="chip-row"><span>' + esc(nm(f.a)) + "</span><b>" + (started ? f.a.g : "") + "</b></span></a></li>";
    }).join("");
    return '<section class="strip" aria-label="Today’s games"><p class="strip-head">' +
      (liveN ? '<span class="live-dot" aria-hidden="true"></span>' : "") + "Today: " + fx.length + " game" + (fx.length === 1 ? "" : "s") +
      " in " + where + (liveN ? " · <strong>" + liveN + " live</strong>" : "") + "</p>" +
      '<ul class="strip-list">' + chips + "</ul></section>";
  }

  // Home page: the three European competitions, under the strip.
  function europeCardsHTML(e, statuses, base, suffix) {
    if (!e) return "";
    return '<section class="euro-home" aria-labelledby="eu-h"><h2 class="section-h" id="eu-h">European competitions</h2><ul class="ecards compact">' +
      e.leagues.map(function (c) {
        return '<li><a class="ecard" href="' + base + "europe/" + c.id + "/" + suffix + '"><span class="ecard-name"><span class="comp-dot c-' + esc(c.id) + '" aria-hidden="true"></span>' +
          esc(c.name) + '</span><span class="ecard-status">' + esc((statuses || {})[c.id] || "League phase") +
          (c.leader && /^League phase/.test((statuses || {})[c.id] || "League phase") ? " · " + esc(c.leader) + " top" : "") + "</span></a></li>";
      }).join("") + "</ul></section>";
  }

  // The order of the pyramid picker: the featured countries as listed, then the European competitions, then the
  // rest of Europe, South America, North America and Asia, each A–Z. Each later group gets a small label.
  var XP_GROUPS = [
    { label: "", has: function (s) { return s.featured; } },
    { label: "", has: function (s) { return s.country === "europe"; } },
    { label: "More of Europe", has: function (s) { return s.region === "europe"; } },
    { label: "South America", has: function (s) { return s.region === "south-america"; } },
    { label: "North America", has: function (s) { return s.region === "north-america"; } },
    { label: "Asia & Oceania", has: function (s) { return s.region === "asia"; } }
  ];
  function explorerOrder(all) {
    var left = all.slice(), out = [];
    XP_GROUPS.forEach(function (g, gi) {
      var mine = left.filter(g.has);
      left = left.filter(function (s) { return mine.indexOf(s) < 0; });
      if (gi > 1) mine.sort(function (a, b) { return a.name.localeCompare(b.name); });
      mine.forEach(function (s, i) { out.push({ s: s, label: i === 0 ? g.label : "" }); });
    });
    left.sort(function (a, b) { return a.name.localeCompare(b.name); });   // a country with no region yet goes last
    left.forEach(function (s) { out.push({ s: s, label: "" }); });
    return out;
  }

  // The pyramid explorer: a sideways-scrolling row with a flag for each country, and that country's pyramid.
  function explorerHTML(all, base, suffix, cupsBy) {
    var order = explorerOrder(all);
    all = order.map(function (x) { return x.s; });
    var tabs = order.map(function (x, i) {
      var s = x.s;
      return (x.label ? '<span class="xp-group" aria-hidden="true">' + esc(x.label) + "</span>" : "") +
        '<button type="button" role="tab" class="xp-tab' + (i === 0 ? " on" : "") + '" data-tab="' + s.country + '" aria-selected="' + (i === 0) + '">' +
        flag(s.country) + "<span>" + esc(s.name) + "</span></button>";
    }).join("");
    var panels = all.map(function (s, i) {
      var href = base + s.country + "/" + suffix, eu = s.country === "europe";
      return '<div class="xp-panel' + (i === 0 ? " on" : "") + '" data-panel="' + s.country + '" role="tabpanel">' +
        '<div class="xp-head"><h2>' + flag(s.country) + (eu ? "European competitions" : "The " + esc(s.adjective) + " pyramid") + "</h2>" +
        "<p>" + (eu ? s.tiers + " competitions · " + s.clubs + " clubs in the league phase" : s.tiers + " tier" + (s.tiers === 1 ? "" : "s") + " · " + s.clubs + " clubs") + "</p></div>" +
        pyramidHTML(s, eu ? base + "europe/" : href, (cupsBy || {})[s.country]) +
        '<a class="more" href="' + href + '">' + (eu ? "Open the European tables and brackets" : "Open every " + esc(s.adjective) + " table") + ' <span aria-hidden="true">→</span></a></div>';
    }).join("");
    return '<section class="explorer" data-tabs="pyramid" aria-labelledby="xp-h"><h2 class="section-h" id="xp-h">Pick a pyramid</h2>' +
      '<div class="xp"><div class="xp-wheel">' +
      '<button type="button" class="xp-arrow prev" data-xp-scroll="-1" aria-label="Scroll the countries left" disabled><span aria-hidden="true">‹</span></button>' +
      '<div class="xp-tabs" role="tablist" aria-label="Countries">' + tabs + "</div>" +
      '<button type="button" class="xp-arrow next" data-xp-scroll="1" aria-label="Scroll the countries right"><span aria-hidden="true">›</span></button></div>' +
      '<div class="xp-panels">' + panels + "</div></div></section>";
  }

  // "Up and down": each country's moves between its top two divisions since last season, one line each.
  // movers: [{ country, name, top, second, last, up: [{ n, path, pos }], down: [...] }], built by scripts/build.mjs.
  function moversHTML(movers, base, suffix) {
    if (!movers || !movers.length) return "";
    var names = function (list) {
      return list.map(function (m) { return m.path ? '<a class="club-link" href="' + esc(base + m.path + suffix) + '">' + esc(m.n) + "</a>" : esc(m.n); }).join(", ");
    };
    var the = function (n) { return inLeague(n).slice(3); };
    var line = function (c) {
      return '<li><a class="mv-c" href="' + esc(base + c.country + "/" + suffix) + '">' + flag(c.country) + "<span>" + esc(c.name) + "</span></a>" +
        '<span class="mvl-up"><b aria-hidden="true">▲</b><span class="sr-only">Promoted to ' + esc(the(c.top)) + ": </span>" + (c.up.length ? names(c.up) : "None") + "</span>" +
        '<span class="mvl-down"><b aria-hidden="true">▼</b><span class="sr-only">Relegated to ' + esc(the(c.second)) + ": </span>" + (c.down.length ? names(c.down) : "None") + "</span></li>";
    };
    // The featured countries show; the rest fold away so the section stays short.
    var main = movers.filter(function (c) { return c.featured; }), more = movers.filter(function (c) { return !c.featured; });
    if (!main.length) { main = more; more = []; }
    return '<section class="movers" aria-labelledby="mv-h"><h2 class="section-h" id="mv-h">Up and down this season</h2>' +
      '<p class="mv-lede">Clubs that moved between each country’s top two divisions since last season. <span class="mv-key"><b class="u">▲</b> up into the top flight <b class="d">▼</b> down from it</span></p>' +
      '<ul class="mv-list">' + main.map(line).join("") + "</ul>" +
      (more.length ? '<details class="mv-more" id="movers-more"><summary>' + more.length + " more countr" + (more.length === 1 ? "y" : "ies") + '</summary><ul class="mv-list">' + more.map(line).join("") + "</ul></details>" : "") +
      "</section>";
  }

  // countries: the featured countries (full data). others: summaries of the rest.
  // opts.live: today's games from the live worker, for the strip.
  function homeMain(countries, base, suffix, others, opts) {
    suffix = suffix || "";
    others = others || [];
    opts = opts || {};
    var all = countries.map(summary).concat(others);
    var names = {};   // club ID -> name as shown on the site, for the strip
    countries.forEach(function (c) { c.leagues.forEach(function (lg) { groupsOf(lg).forEach(function (g) { g.rows.forEach(function (r) { if (r.tid) names[r.tid] = r.team; }); }); }); });
    // The newest date across every table on the page (all tiers, plus the Champions League), so the hero never shows
    // an older date than a table below it.
    var stampsAll = [];
    countries.forEach(function (c) { c.leagues.forEach(function (lg) { if (lg.updated) stampsAll.push(String(lg.updated)); }); });
    if (opts.europe && opts.europe.updated) stampsAll.push(String(opts.europe.updated));
    var newest = stampsAll.sort().pop();
    var live = countries.every(function (c) { return c.mode === "live"; });
    var nLeagues = all.reduce(function (n, s) { return n + s.tiers; }, 0);
    var nClubs = all.reduce(function (n, s) { return n + s.clubs; }, 0);
    var html =
      '<section class="intro hero" aria-labelledby="intro-h">' +
      '<p class="eyebrow">Football Pyramids · ' + esc(countries[0].season) + "</p>" +
      '<h1 id="intro-h">Football league tables, from the top flight down.</h1>' +
      '<p class="lede">' + all.length + " countries, " + nLeagues + " leagues and " + nClubs.toLocaleString("en-GB") +
      " clubs. Each country’s divisions sit on one page in pyramid order, with the promotion and relegation places that connect them. " +
      "Fixtures, past seasons and live scores on match days.</p>" +
      // Club search, the quickest way in. assets/app.js wires it up and keeps it in place when the page redraws.
      '<div class="hero-find" id="hero-find-box"><label for="hero-find">Find your club</label>' +
        '<div class="hero-find-in"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/>' +
        '<path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>' +
        '<input id="hero-find" type="search" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="hero-find-list" aria-describedby="hero-find-hint" ' +
        'placeholder="Type a club’s name" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go">' +
        '<ul class="finder-list" id="hero-find-list" role="listbox" aria-label="Matching clubs" hidden></ul></div>' +
        '<p class="hero-find-hint" id="hero-find-hint">Any club in these leagues, now or in past seasons: fixtures, results and its journey through the pyramid.</p></div>' +
      stampHTML(live ? "live" : "snapshot", newest, countries.reduce(function (n, c) { return n + (c.liveCount || 0); }, 0)) +
      "</section>" +
      stripHTML(opts.live, opts.europe ? all.concat([summary(opts.europe)]) : all, base, suffix, names) +
      // England first (the default), Europe straight after the big five.
      explorerHTML(opts.europe ? all.slice(0, countries.length).concat([summary(opts.europe)], all.slice(countries.length)) : all, base, suffix, opts.cups) +
      moversHTML(opts.movers, base, suffix) + INLINE_AD;
    // The top flights, one tab each, with the Champions League last when it's there.
    var items = countries.map(function (c) {
      c.leagues[0]._club = base + c.country + "/club/"; c.leagues[0]._suffix = suffix;
      return { key: c.country, flagOf: c.country, label: c.leagues[0].name, lg: c.leagues[0],
        opt: { eyebrow: c.name + " · Tier 1", fixtures: (opts.fixtures || {})[c.country + "/" + c.leagues[0].id],
          more: { href: base + c.country + "/" + suffix, text: "See the full " + c.adjective + " pyramid: " + c.leagues.length + " tiers, " + countryClubs(c) + " clubs" } } };
    });
    var ucl = opts.europe && opts.europe.leagues.filter(function (l) { return l.id === "champions-league"; })[0];
    if (ucl && opts.clubPaths) { ucl._paths = opts.clubPaths; ucl._root = base; ucl._suffix = suffix; }
    if (ucl) items.push({ key: "ucl", flagOf: "europe", label: ucl.name, lg: ucl,
      opt: { eyebrow: "UEFA · League phase", fixtures: (opts.fixtures || {})["europe/champions-league"],
        more: { href: base + "europe/champions-league/" + suffix, text: "Champions League fixtures, knockouts, qualifying and past seasons" } } });
    var tabs = items.map(function (it, i) {
      return '<button type="button" role="tab" class="tf-tab' + (i === 0 ? " on" : "") + '" data-tab="' + it.key + '" aria-selected="' + (i === 0) + '">' +
        flag(it.flagOf) + "<span>" + esc(it.label) + "</span></button>";
    }).join("");
    var panels = items.map(function (it, i) {
      return '<div class="tf-panel' + (i === 0 ? " on" : "") + '" data-panel="' + it.key + '" role="tabpanel">' + tierHTML(it.lg, it.opt) + "</div>";
    }).join("");
    html += '<section class="topflights" data-tabs="table" aria-labelledby="tf-h"><h2 class="section-h" id="tf-h">Top-flight tables</h2>' +
      '<div class="tf-tabs" role="tablist" aria-label="Leagues">' + tabs + "</div>" + panels + "</section>";
    return html;
  }

  /* ---------- Fixtures pages ----------
     fx: data/fixtures/<country>/<league>.json. opts: { tz: "local" | "venue", now, live, group, round, tableHref, myClub }.
     Rounds are as the league names them; the page opens on the current one. */
  // Times are shown either in the visitor's own time zone ("local") or in local kick-off time where the game is
  // played ("venue"). European competitions use Central European Time, as UEFA does.
  var VENUE_TZ = {
    england: "Europe/London", scotland: "Europe/London", spain: "Europe/Madrid", germany: "Europe/Berlin",
    france: "Europe/Paris", italy: "Europe/Rome", belgium: "Europe/Brussels", netherlands: "Europe/Amsterdam",
    portugal: "Europe/Lisbon", croatia: "Europe/Zagreb", turkey: "Europe/Istanbul", europe: "Europe/Paris"
  };
  function zoneOfMode(mode, country) { return mode === "venue" ? VENUE_TZ[country] || "Europe/London" : "local"; }
  function myZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { return ""; } }
  // tz: "local", or an IANA zone such as "Europe/Madrid"
  function fmt(ts, tz, o) {
    var opt = {};
    for (var k in o) opt[k] = o[k];
    if (tz && tz !== "local") opt.timeZone = tz;
    try { return new Intl.DateTimeFormat("en-GB", opt).format(new Date(ts * 1000)); } catch (e) { return ""; }
  }
  function zoneCity(z) { return (String(z).split("/").pop() || "local").replace(/_/g, " "); }
  function tzName(mode, country) {
    if (mode === "venue") return country === "europe" ? "Central European Time, as UEFA lists them" : "local kick-off time (" + zoneCity(VENUE_TZ[country] || "Europe/London") + ")";
    var z = myZone();
    return z ? "your time (" + zoneCity(z) + ")" : "your time";
  }
  // The "Times in …" line, with a switch unless the visitor is already in the venue's time zone.
  function tzLine(mode, country) {
    var same = myZone() === VENUE_TZ[country];
    return "<span>Times in " + esc(same ? "local time (" + zoneCity(myZone()) + ")" : tzName(mode, country)) + "</span>" +
      (same ? "" : '<button type="button" class="tz-toggle" data-tz="' + (mode === "venue" ? "local" : "venue") + '">' +
        (mode === "venue" ? "Use my time zone" : "Show local kick-off times") + "</button>");
  }
  function currentRound(rounds, now) {
    var t = (now || Date.now()) / 1000 - 2 * 86400;
    for (var i = 0; i < rounds.length; i++) if (rounds[i].mid >= t) return i;
    return rounds.length - 1;
  }
  var GONE = { PST: "Postponed", CANC: "Cancelled", ABD: "Abandoned", AWD: "Awarded", WO: "Walkover", SUSP: "Suspended", INT: "Interrupted" };

  // tags: show each club's league next to its name, and mark upsets (cup fixtures).
  // A club's name as a link to its page on the site, when it has one. links: { paths, root, suffix }, where paths
  // maps API club IDs (or "n:<slug>" for clubs known only by name) to club page paths.
  function clubName(tm, links) {
    var p = links && links.paths && ((tm.id && links.paths[tm.id]) || links.paths["n:" + slug(tm.n)]);
    return p ? '<a class="club-link" href="' + esc((links.root || "") + p + (links.suffix || "")) + '">' + esc(tm.n) + "</a>" : esc(tm.n);
  }
  function gameHTML(f, tz, now, myClub, tags, links) {
    var on = isLive(f), done = isDone(f) || f.st === "AWD" || f.st === "WO";
    var tag = function (t) { return tags && t.t ? ' <i class="tag tier-' + (t.tier || 0) + '" title="Plays in ' + esc(t.t) + '">' + esc(t.t) + "</i>" : ""; };
    var hasScore = f.hg != null && f.ag != null;
    var time = GONE[f.st] && !on ? "" : f.st === "TBD" ? "TBC" : on || isDone(f) ? clock({ st: f.st, p1: f.p1, p2: f.p2 }, now) : fmt(f.ts, tz, { hour: "2-digit", minute: "2-digit", hour12: false });
    var score = hasScore && (on || done || f.st === "ABD") ? f.hg + "–" + f.ag : "v";
    var notes = [];
    if (GONE[f.st] && !on) notes.push('<b class="g-flag">' + GONE[f.st] + "</b>");
    if (f.moved && !done) notes.push('<span class="g-moved">Moved from ' + esc(fmt(f.moved.from, tz, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })) + "</span>");
    if (f.ht && (on || done) && f.st !== "1H") notes.push("HT " + f.ht[0] + "–" + f.ht[1]);
    if (f.st === "AET") notes.push("After extra time");
    if (f.pen) notes.push("Penalties " + f.pen[0] + "–" + f.pen[1]);
    if (f.v) notes.push(esc(f.v));
    var win = done && hasScore ? (f.hg > f.ag ? "h" : f.hg < f.ag ? "a" : "") : "";
    if (tags && done) {
      // Who went through: the score, then penalties, then the API's winner flag.
      var thru = win || (f.pen ? (f.pen[0] > f.pen[1] ? "h" : "a") : f.w || "");
      var w = thru === "h" ? f.h : thru === "a" ? f.a : null, l = thru === "h" ? f.a : thru === "a" ? f.h : null;
      if (w && w.tier && l.tier && w.tier > l.tier) notes.unshift('<b class="upset">Upset</b>');
    }
    var mine = myClub && (f.h.n === myClub || f.a.n === myClub);
    return '<li class="g' + (on ? " on" : "") + (GONE[f.st] && !on ? " off" : "") + (mine ? " is-mine" : "") + '">' +
      '<span class="g-time">' + esc(time) + "</span>" +
      '<span class="g-h' + (win === "h" ? " w" : "") + '">' + clubName(f.h, links) + tag(f.h) + "</span>" +
      '<span class="g-s">' + score + "</span>" +
      '<span class="g-a' + (win === "a" ? " w" : "") + '">' + clubName(f.a, links) + tag(f.a) + "</span>" +
      (notes.length ? '<span class="g-note">' + notes.join(" · ") + "</span>" : "") + "</li>";
  }

  function roundRange(r, tz) {
    var ts = r.fixtures.filter(function (f) { return !GONE[f.st] && f.st !== "TBD"; }).map(function (f) { return f.ts; });
    if (!ts.length) return "";
    var a = Math.min.apply(null, ts), b = Math.max.apply(null, ts);
    var da = fmt(a, tz, { day: "numeric", month: "short" }), db = fmt(b, tz, { day: "numeric", month: "short" });
    if (da === db) return da;
    var ma = fmt(a, tz, { month: "short" }), mb = fmt(b, tz, { month: "short" });
    return ma === mb ? fmt(a, tz, { day: "numeric" }) + "–" + db : da + " – " + db;
  }

  // One round's games: listed by day, or as ties with aggregate scores for qualifying rounds and two-legged cup rounds.
  function roundBodyHTML(fx, games, tz, now, myClub, links) {
    if (!games.length) return '<p class="ko-empty">No games in this round yet.</p>';
    var tags = !!fx.cup;
    var ties = games[0].stage === "q" || (fx.cup && tiesOf({ fixtures: games }).some(function (t) { return t.legs.length > 1; }));
    if (ties) return '<div class="q-ties fx-ties">' + tiesOf({ fixtures: games }).map(function (t) { return tieHTML(t, tz, now, links); }).join("") + "</div>";
    // Group by day in the chosen time zone; postponed and cancelled games go last.
    var days = [], byDay = {}, off = [];
    games.forEach(function (f) {
      if (GONE[f.st] && !isLive(f) && f.st !== "ABD" && f.st !== "AWD") { off.push(f); return; }
      var d = fmt(f.ts, tz, { weekday: "long", day: "numeric", month: "long" });
      if (!byDay[d]) { byDay[d] = []; days.push(d); }
      byDay[d].push(f);
    });
    return days.map(function (d) {
      return '<h3 class="fx-date">' + esc(d) + '</h3><ul class="fx-list">' +
        byDay[d].map(function (f) { return gameHTML(f, tz, now, myClub, tags, links); }).join("") + "</ul>";
    }).join("") + (off.length ? '<h3 class="fx-date">Postponed and cancelled</h3><ul class="fx-list">' +
        off.map(function (f) { return gameHTML(f, tz, now, myClub, tags, links); }).join("") + "</ul>" : "");
  }

  // The "Fixtures and results" tab on competition and cup pages: every round is on the page and the round
  // picker just shows one (so it works on past-season pages too, with no data to fetch).
  function fxTabHTML(fx, opts) {
    opts = opts || {};
    var now = opts.now || Date.now(), tz = opts.tzZone;
    var rounds = fx && fx.groups && fx.groups[0] ? fx.groups[0].rounds.filter(function (r) { return r.fixtures.length; }) : [];
    if (!rounds.length) return '<p class="ko-empty">No fixtures yet. They appear as soon as the first draw is made.</p>';
    var lm = liveMap(opts.live);
    var ri = opts.round != null && opts.round >= 0 && opts.round < rounds.length ? opts.round : currentRound(rounds, now);
    var options = rounds.map(function (x, i) {
      var range = roundRange(x, tz);
      return '<option value="' + i + '"' + (i === ri ? " selected" : "") + ">" + esc(x.label) + (range ? " · " + esc(range) : "") + "</option>";
    }).join("");
    return (opts.tzLine ? '<p class="fx-links fx-tz">' + opts.tzLine + "</p>" : "") +
      '<nav class="rnav" aria-label="Rounds">' +
      '<button type="button" class="rnav-step" data-rstep="-1"' + (ri === 0 ? " disabled" : "") + ' aria-label="Previous round">‹</button>' +
      '<label class="sr-only" for="fx-round-pick">Round</label><select id="fx-round-pick" class="round-pick" data-rpick>' + options + "</select>" +
      '<button type="button" class="rnav-step" data-rstep="1"' + (ri === rounds.length - 1 ? " disabled" : "") + ' aria-label="Next round">›</button></nav>' +
      rounds.map(function (r, i) {
        var games = r.fixtures.map(function (f) { return mergeLive(f, lm); });
        var liveN = games.filter(isLive).length;
        return '<div class="fx-round" data-round="' + i + '"' + (i === ri ? "" : " hidden") + ">" +
          (liveN ? '<p class="stamp live now"><span class="dot"></span><span>' + liveN + " game" + (liveN === 1 ? "" : "s") + " live</span></p>" : "") +
          roundBodyHTML(fx, games, tz, now, opts.myClub, opts.links) + "</div>";
      }).join("");
  }

  function fixturesMain(fx, opts) {
    opts = opts || {};
    var mode = opts.tz === "local" ? "local" : "venue", now = opts.now || Date.now();
    var tz = zoneOfMode(mode, fx.country);
    var gi = Math.min(opts.group || 0, fx.groups.length - 1);
    var g = fx.groups[gi];
    var ri = opts.round == null ? currentRound(g.rounds, now) : Math.max(0, Math.min(opts.round, g.rounds.length - 1));
    var r = g.rounds[ri];
    var lm = liveMap(opts.live);
    var games = r.fixtures.map(function (f) { return mergeLive(f, lm); });
    var list = roundBodyHTML(fx, games, tz, now, opts.myClub, opts.links);
    var liveN = games.filter(isLive).length;

    var groups = fx.groups.length > 1 ? '<div class="tf-tabs fx-groups" role="tablist" aria-label="Groups">' + fx.groups.map(function (x, i) {
      return '<button type="button" role="tab" class="tf-tab' + (i === gi ? " on" : "") + '" data-group="' + i + '" aria-selected="' + (i === gi) + '">' + esc(x.name) + "</button>";
    }).join("") + "</div>" : "";
    var options = g.rounds.map(function (x, i) {
      var range = roundRange(x, tz);
      return '<option value="' + i + '"' + (i === ri ? " selected" : "") + ">" + esc(x.label) + (range ? " · " + esc(range) : "") + "</option>";
    }).join("");
    return '<section class="intro fx-intro" aria-labelledby="intro-h">' +
      '<p class="eyebrow">' + (fx.country === "europe" ? "UEFA" : esc(fx.countryName) + (fx.cup ? " · Cup" : " · Tier " + fx.tier)) + " · " + esc(fx.season) + "</p>" +
      '<h1 id="intro-h">' + esc(fx.name) + " fixtures and results</h1>" +
      '<p class="lede">' + (fx.year ? "Every " + esc(fx.name) + " game from " + esc(fx.season) + ", round by round, from the first qualifying round to the final."
        : "Every " + esc(fx.name) + " game this season, round by round, with results, postponements and kick-off changes.") + "</p>" +
      '<p class="fx-links">' + (opts.tableHref ? '<a href="' + esc(opts.tableHref) + '">' + esc(opts.tableText || fx.name + " table") + " →</a>" : "") +
      tzLine(mode, fx.country) + "</p></section>" +
      groups +
      '<nav class="rnav" aria-label="Rounds">' +
      '<button type="button" class="rnav-step" data-step="-1"' + (ri === 0 ? " disabled" : "") + ' aria-label="Previous round">‹</button>' +
      '<label class="sr-only" for="round-pick">Round</label><select id="round-pick" class="round-pick">' + options + "</select>" +
      '<button type="button" class="rnav-step" data-step="1"' + (ri === g.rounds.length - 1 ? " disabled" : "") + ' aria-label="Next round">›</button></nav>' +
      (liveN ? '<p class="stamp live now"><span class="dot"></span><span>' + liveN + " game" + (liveN === 1 ? "" : "s") + " live</span></p>" : "") +
      '<div class="fx-round" data-round="' + ri + '">' + list + "</div>" +
      (fx.year ? "" : '<p class="fx-foot">Fixture lists are checked every 6 hours; live scores update during games. Kick-off changes are marked for three weeks.</p>');
  }

  /* ---------- European competitions ----------
     comp: a competition's league-phase table (like a league). fx: its fixtures file, every round tagged
     with a stage: "q" qualifying, "lp" league phase, "ko" knockouts. */
  function mergeLive(f, live) {
    var l = live[f.id];
    if (!l) return f;
    var c = JSON.parse(JSON.stringify(f));
    c.st = l.st; c.p1 = l.p1 || c.p1; c.p2 = l.p2 || c.p2;
    if (l.h.g != null) { c.hg = l.h.g; c.ag = l.a.g; }
    return c;
  }
  function liveMap(live) {
    var m = {};
    (live && live.fixtures || []).forEach(function (f) { m[f.id] = f; });
    return m;
  }
  function stageRounds(fx, stage, live) {
    var lm = liveMap(live);
    return fx.groups[0].rounds.filter(function (r) { return r.fixtures.length && r.fixtures[0].stage === stage; }).map(function (r) {
      return { key: r.key, label: r.label, mid: r.mid, fixtures: r.fixtures.map(function (f) { return mergeLive(f, lm); }) };
    });
  }

  // Two-legged (or one-off) ties from a round's games.
  function tiesOf(round) {
    var by = {}, order = [];
    round.fixtures.forEach(function (f) {
      var k = [f.h.id, f.a.id].sort(function (x, y) { return x - y; }).join("-");
      if (!by[k]) { by[k] = []; order.push(k); }
      by[k].push(f);
    });
    return order.map(function (k) {
      var legs = by[k].sort(function (x, y) { return x.ts - y.ts; });
      var first = legs[0];
      var teams = [{ id: first.h.id, n: first.h.n, t: first.h.t, tier: first.h.tier, agg: 0 }, { id: first.a.id, n: first.a.n, t: first.a.t, tier: first.a.tier, agg: 0 }];
      var played = false, done = legs.every(function (f) { return isDone(f) || f.st === "AWD" || f.st === "WO"; });
      var on = legs.some(isLive);
      legs.forEach(function (f) {
        if (f.hg == null || !(isDone(f) || isLive(f) || f.st === "AWD")) return;
        played = true;
        var hi = f.h.id === teams[0].id ? 0 : 1;
        teams[hi].agg += f.hg; teams[1 - hi].agg += f.ag;
      });
      var last = legs[legs.length - 1], winner = null, how = "";
      if (done) {
        if (teams[0].agg !== teams[1].agg) winner = teams[0].agg > teams[1].agg ? 0 : 1;
        else if (last.pen) { var ph = last.pen[0] > last.pen[1] ? last.h.id : last.a.id; winner = ph === teams[0].id ? 0 : 1; how = "pens"; }
        else if (last.w) { var wid = last.w === "h" ? last.h.id : last.a.id; winner = wid === teams[0].id ? 0 : 1; }
        if (last.st === "AET" && !how) how = "aet";
      }
      // A lower-league club knocking out a higher one (both tiers known).
      var upset = winner != null && teams[winner].tier && teams[1 - winner].tier && teams[winner].tier > teams[1 - winner].tier;
      return { teams: teams, legs: legs, played: played, done: done, on: on, winner: winner, how: how, upset: upset, replay: legs.some(function (f) { return f.rep; }) };
    });
  }

  // A tie, laid out like a scoreboard: one row per club. Two-legged ties (and cup replays) get a column per game
  // and a bold aggregate; extra time, penalties and upcoming kick-offs go in a line underneath.
  function tieHTML(t, tz, now, links) {
    var multi = t.legs.length > 1;
    var shown = function (f) { return f.hg != null && (isDone(f) || isLive(f) || f.st === "AWD"); };
    var goals = function (f, i) { return f.h.id === t.teams[i].id ? f.hg : f.ag; };
    var ORD = ["1st", "2nd", "3rd", "4th"];
    var cols = multi ? t.legs.length + 1 : 1;
    var head = multi ? '<span class="tie-head" aria-hidden="true"><span></span>' +
      t.legs.map(function (f, k) { return "<span>" + (ORD[k] || k + 1 + "th") + "</span>"; }).join("") + "<span>Agg</span></span>" : "";
    var row = function (i) {
      var tm = t.teams[i];
      var cells = multi ? t.legs.map(function (f) {
        return '<span class="tie-g' + (isLive(f) ? " live" : "") + '">' + (shown(f) ? goals(f, i) : "") + "</span>";
      }).join("") : "";
      return '<span class="tie-team' + (t.winner === i ? " tie-won" : t.winner === 1 - i ? " tie-lost" : "") + '"><span class="tie-name">' + clubName(tm, links) +
        (tm.t ? ' <i class="tag tier-' + (tm.tier || 0) + '" title="Plays in ' + esc(tm.t) + '">' + esc(tm.t) + "</i>" : "") + "</span>" +
        cells + "<b>" + (t.played ? tm.agg : "") + "</b></span>";
    };
    var notes = [];
    t.legs.forEach(function (f, k) {
      var name = multi ? (ORD[k] || k + 1 + "th") + (t.legs.length === 2 && !t.replay ? " leg" : " game") : "";
      if (isLive(f)) notes.push((name ? name + " " : "") + "live · " + clock(f, now));
      else if (GONE[f.st]) notes.push((name ? name + ": " : "") + GONE[f.st]);
      else if (!shown(f)) notes.push((name ? name + " " : "") + (f.st === "TBD" ? fmt(f.ts, tz, { weekday: "short", day: "numeric", month: "short" }) + ", time TBC"
        : fmt(f.ts, tz, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })));
    });
    if (t.how === "pens") {
      var lp = t.legs[t.legs.length - 1];
      notes.push(t.teams[t.winner].n + " win " + Math.max(lp.pen[0], lp.pen[1]) + "–" + Math.min(lp.pen[0], lp.pen[1]) + " on penalties");
    } else if (t.how === "aet") notes.push("After extra time");
    return '<div class="tie' + (t.on ? " on" : "") + (multi ? " tie-multi" : "") + '" style="--n:' + cols + '" data-teams="' + esc(t.teams[0].n + "|" + t.teams[1].n) + '">' +
      head + row(0) + row(1) +
      (t.upset || notes.length ? '<span class="tie-note">' + (t.upset ? '<b class="upset">Upset</b>' + (notes.length ? " · " : "") : "") + notes.map(esc).join(" · ") + "</span>" : "") + "</div>";
  }

  // The knockout bracket: one column per round. Each round's ties are put in the order of the round after it,
  // so winners line up with where they go next. Rounds not yet drawn simply aren't there yet.
  function bracketHTML(rounds, tz, now, links) {
    if (!rounds.length) return '<p class="ko-empty">The knockout ties appear here as soon as each draw is made, after the league phase.</p>';
    var cols = rounds.map(function (r) { return { label: r.label, ties: tiesOf(r) }; });
    for (var k = cols.length - 2; k >= 0; k--) {
      var next = cols[k + 1].ties, pos = {};
      next.forEach(function (t, i) { pos[t.teams[0].id] = i * 2; pos[t.teams[1].id] = i * 2 + 1; });
      var rank = function (t) {
        var a = pos[t.teams[0].id], b = pos[t.teams[1].id];
        var p = a != null ? a : b != null ? b : null;
        return p == null ? 1e6 : p;
      };
      var keep = cols[k].ties.map(function (t, i) { return { t: t, i: i }; });
      keep.sort(function (x, y) { return rank(x.t) - rank(y.t) || x.i - y.i; });
      cols[k].ties = keep.map(function (x) { return x.t; });
    }
    return '<div class="bracket" role="list">' + cols.map(function (c) {
      return '<div class="br-col" role="listitem"><h3 class="br-h">' + esc(c.label) + '</h3><div class="br-ties">' +
        c.ties.map(function (t) { return tieHTML(t, tz, now, links); }).join("") + "</div></div>";
    }).join("") + "</div>";
  }

  function qualifyingHTML(rounds, tz, now, links) {
    if (!rounds.length) return '<p class="ko-empty">No qualifying rounds this season.</p>';
    return rounds.slice().reverse().map(function (r) {
      var ties = tiesOf(r);
      return '<details class="q-round"><summary>' + esc(r.label) + " <span>" + ties.length + " ties</span></summary>" +
        '<div class="q-ties">' + ties.map(function (t) { return tieHTML(t, tz, now, links); }).join("") + "</div></details>";
    }).join("");
  }

  // "League phase · matchday 3 of 8", "Round of 16", "Final" etc.
  function compStatus(comp, fx) {
    if (!fx) return "League phase";
    var rounds = fx.groups[0].rounds;
    var ko = rounds.filter(function (r) { return r.fixtures[0] && r.fixtures[0].stage === "ko"; });
    var lp = rounds.filter(function (r) { return r.fixtures[0] && r.fixtures[0].stage === "lp"; });
    var finished = function (r) { return r.fixtures.every(function (f) { return isDone(f) || GONE[f.st]; }); };
    if (ko.length) {
      var open = ko.filter(function (r) { return !finished(r); })[0];
      if (!open) {
        var fin = ko.filter(function (r) { return /^final$/i.test(r.label); })[0];
        var t = fin && tiesOf(fin)[0];
        return t && t.winner != null ? "Won by " + t.teams[t.winner].n : "Final played";
      }
      return /^knockout/i.test(open.label) ? open.label : "Knockouts: " + open.label.toLowerCase().replace(/^\w/, function (c) { return c.toUpperCase(); });
    }
    var done = lp.filter(finished).length;
    if (lp.length && done === lp.length) return "League phase complete";
    if (lp.length) return "League phase · " + done + " of " + lp.length + " matchdays played";
    return "Qualifying";
  }

  function compMain(comp, fx, opts) {
    opts = opts || {};
    var links = opts.fxPaths || opts.clubPaths ? { paths: opts.fxPaths || opts.clubPaths, root: opts.root || "", suffix: opts.suffix || "" } : null;
    var mode = opts.tz === "local" ? "local" : "venue", now = opts.now || Date.now();
    var tz = zoneOfMode(mode, "europe");
    var lpRounds = fx ? stageRounds(fx, "lp", opts.live) : [];
    var ko = fx ? stageRounds(fx, "ko", opts.live) : [];
    var q = fx ? stageRounds(fx, "q", opts.live) : [];
    var lpDone = lpRounds.length && lpRounds.every(function (r) { return r.fixtures.every(function (f) { return isDone(f) || GONE[f.st]; }); });
    // Qualifying gets its own tab only while it's the stage being played (before the league phase kicks off);
    // after that its ties sit under Fixtures and results.
    var lpStarted = lpRounds.some(function (r) { return r.fixtures.some(function (f) { return isDone(f) || isLive(f); }); });
    var inQual = q.length && !lpStarted && !comp.final;
    var first = ko.length && lpDone ? "ko" : "lp";
    var tab = function (k, label) {
      return '<button type="button" role="tab" class="tf-tab' + (k === first ? " on" : "") + '" data-tab="' + k + '" aria-selected="' + (k === first) + '">' + label + "</button>";
    };
    var panel = function (k, html) { return '<div class="tf-panel' + (k === first ? " on" : "") + '" data-panel="' + k + '" role="tabpanel">' + html + "</div>"; };
    return '<section class="intro fx-intro" aria-labelledby="intro-h">' +
      '<p class="eyebrow">UEFA · ' + esc(fx ? fx.season : "") + "</p>" +
      '<h1 id="intro-h"><span class="comp-dot c-' + esc(comp.id) + '" aria-hidden="true"></span>' + esc(comp.name) + "</h1>" +
      (opts.seasons ? seasonsHTML({ name: comp.name, season: fx ? fx.season : "" }, opts.seasons) : "") +
      '<p class="lede"><strong>' + esc(compStatus(comp, fx)) + "</strong> · " + (comp.final ? (comp.groups ? "The group-stage tables" : "The league-phase table") + ", the full knockout bracket and every fixture and result, qualifying included."
        : "The league-phase table, the knockout bracket as each draw is made, and every fixture and result.") + "</p></section>" +
      '<section class="comp" data-tabs="stage"><div class="tf-tabs comp-tabs" role="tablist" aria-label="Stages">' +
      tab("lp", comp.groups ? "Group stage" : "League phase") + (fx ? tab("fx", "Fixtures and results") : "") +
      tab("ko", "Knockouts") + (inQual ? tab("q", "Qualifying") : "") + "</div>" +
      panel("lp", (comp.rows && !comp.rows.length && !comp.groups ? '<p class="ko-empty">No table for this season.</p>'
        : tierHTML(markQualified(opts.clubPaths ? Object.assign(comp, { _paths: opts.clubPaths, _root: opts.root || "", _suffix: opts.suffix || "" }) : comp), { eyebrow: comp.groups ? "Group stage" : "League phase" }))) +
      (fx ? panel("fx", fxTabHTML(fx, { tzZone: tz, tzLine: tzLine(mode, "europe"), now: now, live: opts.live, round: opts.fxRound, myClub: opts.myClub, links: links })) : "") +
      panel("ko", !ko.length && !comp.final && projectedHTML(comp) ? projectedHTML(comp) : bracketHTML(ko, tz, now, links)) +
      (inQual ? panel("q", qualifyingHTML(q, tz, now, links)) : "") + "</section>";
  }

  // The /europe/ page: a card per competition.
  function europeMain(e, opts) {
    opts = opts || {};
    var base = opts.base || "", suffix = opts.suffix || "";
    // Each competition opens in place to its full table; knockouts and fixtures stay on its own page.
    var cards = e.leagues.map(function (c) {
      var top = (c.rows || []).slice(0, 3);
      var href = base + c.id + "/" + suffix;
      var lg = opts.clubPaths ? Object.assign({}, c, { _paths: opts.clubPaths, _root: opts.root || "", _suffix: suffix }) : c;
      var hasTable = (c.rows && c.rows.length) || (c.groups && c.groups.length);
      return '<li><details class="ecomp" id="ec-' + esc(c.id) + '"><summary class="ecard">' +
        '<span class="ecard-name"><span class="comp-dot c-' + esc(c.id) + '" aria-hidden="true"></span>' + esc(c.name) + "</span>" +
        '<span class="ecard-status">' + esc((opts.statuses || {})[c.id] || "League phase") + "</span>" +
        '<ol class="ecard-top">' + top.map(function (r) {
          return "<li><span>" + r.pos + "</span>" + esc(r.team) + (r.live ? ' <i class="lv on">' + esc(r.live.clock) + " " + r.live.gf + "–" + r.live.ga + "</i>" : "") + "<b>" + r.pts + " pts</b></li>";
        }).join("") + "</ol>" +
        '<span class="ecard-toggle" aria-hidden="true"><span class="when-closed">Full table</span><span class="when-open">Hide table</span></span></summary>' +
        '<div class="ecomp-body">' + (hasTable ? tierHTML(markQualified(lg), { eyebrow: c.groups ? "Group stage" : "League phase",
          more: { href: href, text: "Fixtures, knockouts and qualifying" } })
          : '<p class="ko-empty">No table yet. <a href="' + esc(href) + '">Fixtures and qualifying →</a></p>') + "</div></details></li>";
    }).join("");
    return '<section class="intro" aria-labelledby="intro-h"><p class="eyebrow">UEFA club competitions · ' + esc(e.season) + "</p>" +
      '<h1 id="intro-h">Champions League, Europa League and Conference League</h1>' +
      '<p class="lede">League-phase tables, knockout brackets that fill in after each draw, every qualifying tie and every fixture, with live scores on European nights.</p>' +
      stampHTML(e.mode, e.updated, e.liveCount) + '</section><ul class="ecards ecomps">' + cards + "</ul>" +
      (opts.stripLive ? stripHTML(opts.stripLive, [summary(e)], base.replace(/europe\/$/, ""), suffix, {}) : "");
  }

  /* ---------- Domestic cups ----------
     fx: data/fixtures/<country>/<cup>.json (cup: true). Each club carries its league ("t") and tier, so ties show
     who's from where and lower-league wins are marked as upsets. */
  function cupStatus(fx) {
    if (!fx || !fx.groups[0].rounds.length) return "Draw to come";
    var rounds = fx.groups[0].rounds;
    var unfinished = function (f) { return !isDone(f) && !GONE[f.st] && f.st !== "AWD" && f.st !== "WO"; };
    for (var i = 0; i < rounds.length; i++) {
      var r = rounds[i], open = r.fixtures.filter(unfinished);
      if (!open.length) continue;
      var started = r.fixtures.some(function (f) { return isDone(f) || isLive(f); });
      return (started ? "" : "Next: ") + r.label + (started ? " in progress" : "");
    }
    var last = rounds[rounds.length - 1], t = tiesOf(last)[0];
    return /final/i.test(last.label) && t && t.winner != null ? "Won by " + t.teams[t.winner].n : "Latest: " + last.label;
  }

  // "Tiers 1–4", or "Open to all levels" when clubs from below the site's leagues take part too.
  function cupSpan(fx) {
    if (!fx) return "";
    var tiers = [], untagged = false;
    fx.groups[0].rounds.forEach(function (r) { r.fixtures.forEach(function (f) { [f.h, f.a].forEach(function (t) {
      if (t.tier) tiers.push(t.tier); else untagged = true;
    }); }); });
    if (!tiers.length) return "";
    var lo = Math.min.apply(null, tiers), hi = Math.max.apply(null, tiers);
    if (untagged) return lo === 1 ? "Open to all levels" : "Tier " + lo + " and below";
    return lo === hi ? "Tier " + lo : "Tiers " + lo + "–" + hi;
  }

  function cupMain(cup, fx, opts) {
    var links = opts && opts.fxPaths ? { paths: opts.fxPaths, root: opts.root || "", suffix: opts.suffix || "" } : null;
    opts = opts || {};
    var country = fx ? fx.country : cup.country;
    var mode = opts.tz === "local" ? "local" : "venue", now = opts.now || Date.now();
    var tz = zoneOfMode(mode, country);
    var lm = liveMap(opts.live);
    var rounds = fx ? fx.groups[0].rounds.map(function (r) {
      return { key: r.key, label: r.label, mid: r.mid, fixtures: r.fixtures.map(function (f) { return mergeLive(f, lm); }) };
    }) : [];
    // The bracket starts at the earliest round of 64 or fewer (32 ties) after which every round halves cleanly
    // (no byes), so each tie feeds the next; earlier rounds are under Fixtures and results.
    var startAt = -1, counts = rounds.map(function (r) { return tiesOf(r).length; });
    for (var i = 0; i < rounds.length && startAt < 0; i++) {
      if ([32, 16, 8, 4, 2, 1].indexOf(counts[i]) < 0) continue;   // a full round of 64, 32, 16...
      var clean = true;
      for (var j = i + 1; j < rounds.length; j++) if (counts[j] * 2 !== counts[j - 1]) { clean = false; break; }
      if (clean) startAt = i;
    }
    var bracketRounds = startAt > -1 ? rounds.slice(startAt) : [];
    var first = bracketRounds.length ? "bracket" : "fx";
    var tab = function (k, label) {
      return '<button type="button" role="tab" class="tf-tab' + (k === first ? " on" : "") + '" data-tab="' + k + '" aria-selected="' + (k === first) + '">' + label + "</button>";
    };
    var panel = function (k, html) { return '<div class="tf-panel' + (k === first ? " on" : "") + '" data-panel="' + k + '" role="tabpanel">' + html + "</div>"; };
    return '<section class="intro fx-intro" aria-labelledby="intro-h">' +
      '<p class="eyebrow">' + esc((fx && fx.countryName) || "") + " · Cup · " + esc(fx ? fx.season : "") + "</p>" +
      '<h1 id="intro-h" class="cup-h">' + flag(country) + "<span>" + esc(cup.name) + "</span></h1>" +
      (opts.seasons ? seasonsHTML({ name: cup.name, season: fx ? fx.season : "" }, opts.seasons) : "") +
      (opts.note ? '<p class="cup-note">' + esc(opts.note) + "</p>" : "") +
      '<p class="lede"><strong>' + esc(cupStatus(fx)) + "</strong> · Every tie and result, round by round, with each club’s league next to its name, so the giant-killings stand out.</p></section>" +
      '<section class="comp" data-tabs="cup"><div class="tf-tabs comp-tabs" role="tablist" aria-label="Views">' +
      tab("fx", "Fixtures and results") + tab("bracket", "Bracket") + "</div>" +
      panel("fx", fxTabHTML(fx, { tzZone: tz, tzLine: tzLine(mode, country), now: now, live: opts.live, round: opts.fxRound, myClub: opts.myClub, links: links })) +
      panel("bracket", bracketRounds.length ? bracketHTML(bracketRounds, tz, now, links)
        : '<p class="ko-empty">The bracket starts once the cup is down to 64 clubs or fewer and that draw is made. Until then, see Fixtures and results.</p>') + "</section>";
  }

  // Country pages: the country's cups, under the tables.
  function cupsHTML(cups) {
    if (!cups || !cups.length) return "";
    return '<section class="cups-sec" aria-labelledby="cups-h"><h2 class="section-h" id="cups-h">Cups</h2><ul class="ecards">' +
      cups.map(function (c) {
        return '<li><a class="ecard" href="' + esc(c.href) + '"><span class="ecard-name">' + esc(c.name) + '</span><span class="ecard-status">' + esc(c.status) + "</span></a></li>";
      }).join("") + "</ul></section>";
  }

  /* ---------- Club pages ----------
     d: built by scripts/build.mjs for each club: its league table, every fixture it has in the league, cups and
     Europe (newest data from the fixture files), and its "pyramid journey" from past seasons. */
  // Dates and times that the browser re-formats in place when the time zone changes (club pages).
  var TFMT = {
    d: { day: "numeric", month: "short" },
    t: { hour: "2-digit", minute: "2-digit", hour12: false },
    long: { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hour12: false }
  };
  function tt(ts, tz, f) { return '<time data-ts="' + ts + '" data-f="' + f + '">' + esc(fmt(ts, tz, TFMT[f])) + "</time>"; }
  function retime(root, mode, country) {
    var tz = zoneOfMode(mode, country);
    root.querySelectorAll("time[data-ts]").forEach(function (el) { el.textContent = fmt(Number(el.getAttribute("data-ts")), tz, TFMT[el.getAttribute("data-f")]); });
    var line = root.querySelector(".fx-links");
    if (line) line.innerHTML = tzLine(mode, country);
  }

  function clubMain(d, opts) {
    opts = opts || {};
    var mode = opts.tz === "local" ? "local" : "venue", now = opts.now || Date.now();
    var tz = zoneOfMode(mode, d.country);
    var lm = liveMap(opts.live);
    var fx = d.fx.map(function (f) {
      var l = lm[f.id];
      if (!l) return f;
      var c = JSON.parse(JSON.stringify(f));
      c.st = l.st; c.p1 = l.p1 || c.p1; c.p2 = l.p2 || c.p2;
      if (l.h.g != null) { c.hg = l.h.g; c.ag = l.a.g; }
      return c;
    });
    var played = fx.filter(function (f) { return (isDone(f) || f.st === "AWD") && f.hg != null; }).sort(function (a, b) { return b.ts - a.ts; });
    var live = fx.filter(isLive);
    var upcoming = fx.filter(function (f) { return !isDone(f) && !isLive(f) && !GONE[f.st] && f.st !== "AWD"; }).sort(function (a, b) { return a.ts - b.ts; });
    var mine = function (f) { return f.home ? [f.hg, f.ag] : [f.ag, f.hg]; };
    var res = function (f) {
      var g = mine(f);
      if (g[0] === g[1] && f.pen) { var p = f.home ? f.pen : [f.pen[1], f.pen[0]]; return p[0] > p[1] ? "W" : "L"; }
      return g[0] > g[1] ? "W" : g[0] < g[1] ? "L" : "D";
    };
    fx.forEach(function (f) { if (typeof f.comp === "string") f.comp = d.comps[f.comp]; });
    var opp = function (f) {
      var href = f.opp.s ? d.root + f.opp.s + (d.suffix || "") : null;
      return (href ? '<a href="' + esc(href) + '">' + esc(f.opp.n) + "</a>" : esc(f.opp.n)) +
        (f.opp.t && f.comp.kind !== "league" ? ' <i class="tag tier-' + (f.opp.tier || 0) + '">' + esc(f.opp.t) + "</i>" : "");
    };
    var compTag = function (f) { return '<span class="ctag ctag-' + f.comp.kind + '" title="' + esc(f.comp.name) + '">' + esc(f.comp.short) + "</span>"; };
    var when = function (f, o) {
      return f.st === "TBD" ? fmt(f.ts, tz, { weekday: "short", day: "numeric", month: "short" }) + ", TBC" : fmt(f.ts, tz, o || { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
    };
    var line = function (f, kind) {
      var right;
      if (kind === "result") {
        var g = mine(f), r = res(f);
        right = '<span class="cl-res"><b class="wdl wdl-' + r + '">' + r + "</b><span class=\"cl-score\">" + g[0] + "–" + g[1] + (f.st === "AET" ? " aet" : f.pen ? " p" : "") + "</span></span>";
      } else if (kind === "live") {
        var lg2 = mine(f);
        right = '<span class="lv on">' + esc(clock(f, now)) + " " + lg2[0] + "–" + lg2[1] + "</span>";
      } else right = '<span class="cl-time">' + (f.st === "TBD" ? "TBC" : tt(f.ts, tz, "t")) + "</span>";
      return '<li class="cl-row"><span class="cl-date">' + tt(f.ts, tz, "d") + "</span>" + compTag(f) +
        '<span class="cl-ha">' + (f.home ? "H" : "A") + '</span><span class="cl-opp">' + opp(f) + "</span>" + right + "</li>";
    };
    var list = function (arr, kind, first) {
      if (!arr.length) return "";
      var head = arr.slice(0, first).map(function (f) { return line(f, kind); }).join("");
      var rest = arr.slice(first).map(function (f) { return line(f, kind); }).join("");
      return '<ul class="cl-list">' + head + "</ul>" + (rest ? '<details class="cl-more" id="more-' + kind + '"><summary>All ' + arr.length + " " + (kind === "result" ? "results" : "fixtures") +
        '</summary><ul class="cl-list">' + rest + "</ul></details>" : "");
    };

    // Next (or live) match
    var nx = live[0] || upcoming[0];
    var nextHTML = nx ? '<section class="next-match' + (isLive(nx) ? " on" : "") + '"><p class="nm-h">' + (isLive(nx) ? "Live now" : "Next match") + " · " + esc(nx.comp.name) +
      (nx.round ? " · " + esc(nx.round) : "") + "</p>" +
      '<p class="nm-teams"><span>' + (nx.home ? esc(d.name) : opp(nx)) + "</span><b>" +
        (isLive(nx) ? nx.hg + "–" + nx.ag : "v") + "</b><span>" + (nx.home ? opp(nx) : esc(d.name)) + "</span></p>" +
      '<p class="nm-when">' + (isLive(nx) ? esc(clock(nx, now)) : nx.st === "TBD" ? tt(nx.ts, tz, "d") + ", time TBC" : tt(nx.ts, tz, "long")) +
      (nx.v ? " · " + esc(nx.v) : "") + "</p></section>" : "";

    // Competitions: one tab per competition the club is in this season (league first, then Europe, then cups).
    // League and Europe show the table around the club; every tab lists the club's games in it.
    var lg = d.league;
    var excerpt = function (t, rows, name) {
      var i = rows.map(function (r) { return r.tid; }).indexOf(d.tid);
      var from = Math.max(0, Math.min(i - 3, rows.length - 7)), part = rows.slice(from, from + 7);
      return legendHTML(t, false) + tableHTML(t, part, name + " table around " + d.name);
    };
    var comps = {}, order = [];
    fx.forEach(function (f) { if (!comps[f.comp.key]) { comps[f.comp.key] = { comp: f.comp, list: [] }; order.push(f.comp.key); } comps[f.comp.key].list.push(f); });
    var rank = { league: 0, europe: 1, cup: 2 };
    order.sort(function (a, b) { return rank[comps[a].comp.kind] - rank[comps[b].comp.kind]; });
    var games = function (list) {
      var shown = list.filter(function (f) { return !GONE[f.st]; }).sort(function (a, b) { return a.ts - b.ts; });
      if (!shown.length) return "";
      return '<ul class="cl-list">' + shown.map(function (f) { return line(f, isLive(f) ? "live" : (isDone(f) || f.st === "AWD") && f.hg != null ? "result" : "fixture"); }).join("") + "</ul>";
    };
    var compTabs = order.map(function (k) {
      var c = comps[k], st, body = "", more = "Competition page";
      var up = c.list.filter(function (f) { return !isDone(f) && !GONE[f.st]; }).sort(function (a, b) { return a.ts - b.ts; })[0];
      var last = c.list.filter(function (f) { return isDone(f) && f.hg != null; }).sort(function (a, b) { return b.ts - a.ts; })[0];
      if (c.comp.kind === "league") {
        st = d.pos && lg ? ord(d.pos) + " of " + lg.rows.length + " · " + d.pts + " pts" : "";
        if (lg && lg.rows && lg.rows.length) body = excerpt({ id: lg.id, zones: lg.zones, _hl: d.tid, _club: lg._club, _suffix: lg._suffix }, lg.rows, lg.name);
        more = "Full table";
        return { k: k, c: c, st: st, href: (lg && lg.tableHref) || c.comp.href, more: more, body: body };
      }
      if (up) st = "Next: " + (up.round ? up.round + " " : "") + "v " + up.opp.n;
      else if (last) { var g = mine(last); st = (last.round ? last.round + ": " : "") + res(last) + " " + g[0] + "–" + g[1] + " v " + last.opp.n; }
      var et = c.comp.kind === "europe" && d.euro && d.euro[k];
      if (et) {
        st = ord(et.pos) + " of " + et.of + " in the league phase · " + et.pts + " pts" + (st ? " · " + st : "");
        body = excerpt({ id: et.id, zones: et.zones, _hl: d.tid, _paths: et.paths, _root: d.root, _suffix: d.suffix }, et.rows, et.name);
      }
      more = c.comp.kind === "cup" ? "Full bracket" : "Tables and bracket";
      return { k: k, c: c, st: st, href: c.comp.href, more: more, body: body + games(c.list) };
    });
    var compSection = "";
    if (compTabs.length) {
      var first = compTabs[0].k;
      compSection = '<section class="cl-sec cl-comps-sec" data-tabs="club-comps"><div class="cl-sec-h"><h2>Competitions</h2></div>' +
        '<div class="tf-tabs cl-tabs" role="tablist" aria-label="Competitions">' + compTabs.map(function (t) {
          return '<button type="button" role="tab" class="tf-tab' + (t.k === first ? " on" : "") + '" data-tab="' + esc(t.k) + '" aria-selected="' + (t.k === first) + '">' +
            '<span class="ctag ctag-' + t.c.comp.kind + '">' + esc(t.c.comp.short) + "</span>" + esc(t.c.comp.name) + "</button>";
        }).join("") + "</div>" +
        compTabs.map(function (t) {
          return '<div class="tf-panel' + (t.k === first ? " on" : "") + '" data-panel="' + esc(t.k) + '" role="tabpanel">' +
            '<div class="cl-tab-h"><p>' + esc(t.st || "") + '</p><a href="' + esc(t.href) + '">' + t.more + " →</a></div>" + t.body + "</div>";
        }).join("") + "</section>";
    }

    // Pyramid journey: each season's finishing position on one ladder for the whole pyramid
    // (in England 1-20 is the Premier League, 21-44 the Championship and so on), oldest on the left.
    // Cup runs: one small chart per cup, a dot for each season at the furthest round reached (Winners at the top,
    // then the final, semi-finals and so on), with a gold ring on the seasons the club won it.
    var LEVELS = ["Winners", "Final", "Semi-finals", "Quarter-finals", "Last 16", "Last 32", "Last 64", "Earlier rounds"];
    var SHORT = ["Won", "Final", "Semis", "Quarters", "Last 16", "Last 32", "Last 64", "Earlier"];
    var levelOf = function (dd) { return dd < 0 ? 0 : Math.min(dd + 1, LEVELS.length - 1); };
    var cupList = d.cupRuns || [];
    var cupRuns = cupList.map(function (cr, ci) {
      var n = cr.seasons.length, cell = 1000 / n, X = function (i) { return (i + 0.5) * cell; };
      var H = LEVELS.length, Y = function (lv) { return (lv + 0.5) / H * 100; };
      var wins = cr.runs.filter(function (r) { return r.res === "W"; });
      var best = cr.runs.slice().sort(function (a, b) { return a.d - b.d || b.i - a.i; })[0];
      var segs = "";
      for (var k = 1; k < cr.runs.length; k++) {
        var a = cr.runs[k - 1], b = cr.runs[k];
        // Join each run to the next, stepping over a single season the club wasn't in the cup (it went out before
        // the rounds we have, or didn't enter). A longer absence ends the line at the last run before it.
        if (b.i - a.i > 2) continue;
        segs += '<line x1="' + X(a.i) + '" y1="' + Y(levelOf(a.d)) + '" x2="' + X(b.i) + '" y2="' + Y(levelOf(b.d)) + '" vector-effect="non-scaling-stroke"/>';
      }
      var dots = cr.runs.map(function (r) {
        var at = X(r.i) / 1000, out = r.res === "L" ? "Out in the " + r.round.charAt(0).toLowerCase() + r.round.slice(1) : r.res === "W" ? "Won the " + cr.name : r.now ? "Still in: " + r.round : r.round;
        var tie = r.opp ? (r.res === "W" ? "Beat " : r.res === "L" ? "Lost to " : "v ") + esc(r.opp) + (r.score ? " " + esc(r.score) : "") : "";
        var tip = '<span class="ltip' + (at < 0.2 ? " l" : at > 0.8 ? " r" : "") + (levelOf(r.d) < 2 ? " below" : "") + '"><b>' + esc(cr.seasons[r.i]) + "</b>" + esc(out) +
          (tie ? "<i>" + tie + "</i>" : "") + "</span>";
        return '<span class="ld cr-dot' + (r.res === "W" ? " won" : "") + (r.now ? " now" : "") + '" tabindex="0" style="left:' + (Math.round(at * 10000) / 100) + "%;top:" + Y(levelOf(r.d)) + '%" aria-label="' +
          esc(cr.seasons[r.i] + ": " + out) + '">' + tip + "</span>";
      }).join("");
      // Season labels thinned so they never overlap: at most 9 on a wide screen, 5 on a phone, newest always shown.
      var wide = Math.ceil(n / 9), narrow = Math.ceil(n / 5);
      var xl = cr.seasons.map(function (sname, i) {
        var lab = String(sname).replace(/^\d\d(\d\d)[–-](?:\d\d)?(\d\d)$/, "$1–$2");
        return '<span class="' + ((n - 1 - i) % wide ? "hw" : (n - 1 - i) % narrow ? "hn" : "") + (i === 0 && n > 1 ? " first" : i === n - 1 && n > 1 ? " last" : "") + '" style="left:' + (Math.round(X(i) / 10 * 100) / 100) + '%">' + esc(lab) + "</span>";
      }).join("");
      // All-time titles (when known) first, then what the seasons shown here add up to.
      // All-time record first (titles and lost finals, from the honours list plus later seasons), then the
      // seasons shown on the chart.
      var fin = cr.finals || { lost: 0 }, lostTxt = "", allTime = "";
      var times = function (k) { return k === 1 ? "once" : k === 2 ? "twice" : k + " times"; };
      var yearsTxt = function (ys) { return ys.length === 1 ? String(ys[0]) : ys.slice(0, -1).join(", ") + " and " + ys[ys.length - 1]; };
      if (fin.lost) lostTxt = fin.years && fin.years.length === fin.lost && fin.lost <= 3 ? "runner-up in " + yearsTxt(fin.years)
        : "runner-up " + times(fin.lost) + (fin.last ? ", most recently in " + fin.last : "");
      var lostFinals = !fin.lost ? "" : fin.years && fin.years.length === fin.lost && fin.lost <= 3 ? ", plus lost finals in " + yearsTxt(fin.years)
        : ", plus " + fin.lost + (fin.lost === 1 ? " lost final" : " lost finals") + (fin.last ? " (most recently " + fin.last + ")" : "");
      if (fin.lost === 1 && fin.years && fin.years.length === 1) lostFinals = ", plus a lost final in " + fin.years[0];
      if (cr.titles) allTime = cr.titles + (cr.titles === 1 ? " title" : " titles") + " in all" + lostFinals + ". ";
      else if (cr.titles === 0) allTime = fin.lost ? "Never won it; " + lostTxt + ". " : "Never won it or reached the final. ";
      var since = cr.seasons.length ? " since " + cr.seasons[0] : "";
      var shown = wins.length ? (wins.length === 1 ? "Won it in " + cr.seasons[wins[0].i] : "Won it " + wins.length + " times" + since + ": " + wins.map(function (w) { return cr.seasons[w.i]; }).join(", ")) + "."
        : best ? "Best run" + since + ": " + LEVELS[levelOf(best.d)].toLowerCase().replace("earlier rounds", "the early rounds") + " (" + cr.seasons[best.i] + ")." : "";
      // A club missing from the latest seasons: say so, so empty recent seasons don't read as missing data.
      var lastRun = cr.runs[cr.runs.length - 1];
      // Only finished seasons count: while this season's cup is still going, a club that isn't in it yet may just
      // not have entered yet (Premier League clubs join the FA Cup in January).
      var lastDone = cr.open ? n - 2 : n - 1;
      // Worded neutrally: some cups' saved data starts after regional rounds (the Coupe de France at the last 256), so
      // a missing season can mean out early as well as not qualifying.
      var absent = lastRun && lastRun.i < lastDone ? " Hasn't featured since " + cr.seasons[lastRun.i] + "." : "";
      var cap = allTime + shown + absent;
      var head = cupList.length > 1 ? '<div class="cr-h"><p>' + esc(cap) + "</p>" + (cr.href ? '<a href="' + esc(cr.href) + '">' + esc(cr.name) + " this season →</a>" : "") + "</div>"
        : '<div class="cr-h"><h3>' + (cr.href ? '<a href="' + esc(cr.href) + '">' + esc(cr.name) + "</a>" : esc(cr.name)) + "</h3><p>" + esc(cap) + "</p></div>";
      return '<div class="cr' + (cupList.length > 1 ? " tf-panel" + (ci === 0 ? " on" : "") : "") + '"' + (cupList.length > 1 ? ' data-panel="' + esc(cr.id) + '" role="tabpanel"' : "") + ">" + head +
        '<div class="lchart cr-chart"><div class="lside">' + LEVELS.map(function (l, lv) { return '<span class="ls cr-l" style="top:' + (lv / H * 100) + "%;height:" + (100 / H) + '%" title="' + esc(l) + '"><b>' + esc(SHORT[lv]) + "</b></span>"; }).join("") +
        '</div><div class="lplot" style="height:' + (H * 24) + 'px">' +
        '<svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">' +
        LEVELS.map(function (l, lv) { return lv % 2 ? '<rect class="lb alt" x="0" width="1000" y="' + (lv / H * 100) + '" height="' + (100 / H) + '"/>' : ""; }).join("") +
        '<g class="cr-line">' + segs + "</g></svg>" + dots + '</div><div class="lx">' + xl + "</div></div></div>";
    }).join("");
    // More than one cup: a tab for each, one chart showing at a time.
    var cupTabs = cupList.length > 1 ? '<div class="tf-tabs cl-tabs" role="tablist" aria-label="Cups">' + cupList.map(function (cr, ci) {
      var won = cr.titles != null ? cr.titles : cr.runs.filter(function (r) { return r.res === "W"; }).length;
      return '<button type="button" role="tab" class="tf-tab' + (ci === 0 ? " on" : "") + '" data-tab="' + esc(cr.id) + '" aria-selected="' + (ci === 0) + '">' + esc(cr.name) +
        (won ? '<span class="cr-won" title="' + won + (won === 1 ? " title" : " titles") + ' in all">' + won + "×</span>" : "") + "</button>";
    }).join("") + "</div>" : "";
    var cupSection = cupRuns ? '<section class="cl-sec"' + (cupList.length > 1 ? ' data-tabs="cup-runs"' : "") + '><div class="cl-sec-h"><h2>Cup runs</h2></div>' + cupTabs + cupRuns + "</section>" : "";

    var journey = "";
    if ((d.journey || []).length) {
      var j = d.journey.slice().reverse(), n = j.length;
      var ladder = d.ladder || [];
      var depth = 0;
      while (depth < ladder.length && !ladder[depth].split) depth++;
      // Overall positions only make sense down to the last single national division: below that a tier splits
      // into parallel regional groups (England's National League North and South), which can't be ranked
      // against each other. nat is how many divisions the overall ranking covers.
      var nat = depth;
      var NUM = ["", "one", "two", "three", "four", "five", "six", "seven", "eight"];
      // Past seasons may cover fewer divisions (England's saved seasons before 2022–23 stop at League Two), so the
      // count and the wording come from each season's own data: "of 92 across the top four", "of 116 across the top five".
      var tiersIn = function (x) { var k = 0; for (var i = 0; i < nat; i++) if (x.sizes && x.sizes[i]) k++; return k; };
      var acrossOf = function (x) { var k = tiersIn(x); return "across the top " + (NUM[k] || k) + " " + (d.adjective ? d.adjective + " " : "") + "divisions"; };
      var ranked = function (x) { return nat > 1 && x.rank && x.tier <= nat && tiersIn(x) > 1; };
      var natTotal = function (x) { var o = 0; for (var i = 0; i < nat; i++) o += (x.sizes && x.sizes[i]) || 0; return o; };
      depth = Math.max(depth, Math.max.apply(null, j.map(function (x) { return x.tier; })), 1);
      var sz = function (x, t) { return (x.sizes && x.sizes[t]) || 0; };
      var off = function (x, t) { var o = 0; for (var i = 0; i < t; i++) o += sz(x, i); return o; };
      var ymax = Math.max.apply(null, j.map(function (x) { return off(x, depth); })) || 1;
      var cell = 1000 / n, X = function (k) { return (k + 0.5) * cell; };
      var pct = function (v, of) { return Math.round(v / of * 10000) / 100 + "%"; };
      // Shaded bands per division, joined across seasons with the same division sizes.
      var rects = "", runs = [];
      j.forEach(function (x, k) {
        var key = (x.sizes || []).slice(0, depth).join(",");
        if (runs.length && runs[runs.length - 1].key === key) runs[runs.length - 1].to = k;
        else runs.push({ key: key, from: k, to: k, x: x });
      });
      runs.forEach(function (r) {
        for (var t = 0; t < depth; t++) if (sz(r.x, t)) rects += '<rect class="lb' + (t === 0 ? " top" : t % 2 ? " alt" : "") + '" x="' + (r.from * cell) + '" width="' + ((r.to - r.from + 1) * cell) +
          '" y="' + off(r.x, t) + '" height="' + sz(r.x, t) + '"/>';
      });
      var yOf = function (x) { return x.rank - 0.5; };
      var lpath = n > 1 ? '<polyline class="lp" vector-effect="non-scaling-stroke" points="' + j.map(function (x, k) { return X(k) + "," + yOf(x); }).join(" ") + '"/>' : "";
      // Division labels down the side, placed for the newest season.
      var latest = j[n - 1];
      var side = ladder.slice(0, depth).map(function (l, t) {
        var a = off(latest, t), b = a + sz(latest, t);
        if (!sz(latest, t)) return "";
        return '<span class="ls" style="top:' + pct(a, ymax) + ";height:" + pct(b - a, ymax) + '" title="' + esc(l.name) + '"><b>' + esc(l.short || l.name) + "</b><i>" + (a + 1) + "–" + b + "</i></span>";
      }).join("");
      // Each dot opens a label with the season, league and position, linking to that season's table.
      var tableNow = d.league && d.league.tableHref;
      // Gold: top-flight champions. Green: went up the next season (automatically or through the play-offs).
      // Red: went down. The season in progress is never marked.
      var mark = function (x) { return x.now ? "" : x.tier === 1 && x.pos === 1 ? "champ" : x.move === "up" ? "up" : x.move === "down" ? "down" : ""; };
      var MARK = { champ: "Champions", up: "Promoted", down: "Relegated" };
      var dots = j.map(function (x, k) {
        var href = x.now ? tableNow : x.href, at = X(k) / 1000, m = mark(x);
        var tip = '<span class="ltip' + (at < 0.2 ? " l" : at > 0.8 ? " r" : "") + (yOf(x) / ymax < 0.25 ? " below" : "") + '"><b>' + esc(x.season) + "</b>" +
          esc(x.league) + ": " + ord(x.pos) + (x.of ? " of " + x.of : "") + (m ? ' · <em class="lt-' + m + '">' + MARK[m] + "</em>" : "") +
          (ranked(x) ? "<i>" + ord(x.rank) + " of " + natTotal(x) + " " + acrossOf(x) + "</i>" : x.tier > nat ? "<i>Tier " + x.tier + "</i>" : "") + (href ? "<u>View table →</u>" : "") + "</span>";
        var attrs = ' class="ld' + (x.now ? " now" : "") + (m ? " m-" + m : "") + '" style="left:' + pct(X(k), 1000) + ";top:" + pct(yOf(x), ymax) + '" aria-label="' +
          esc(x.season + ": " + x.league + ", " + ord(x.pos)) + '"';
        return href ? "<a" + attrs + ' href="' + esc(href) + '">' + tip + "</a>" : "<span" + attrs + ' tabindex="0">' + tip + "</span>";
      }).join("");
      // Season labels, thinned so they never overlap: at most 9 on a wide screen and 5 on a phone,
      // always keeping the newest. A tick marks every season.
      var wide = Math.ceil(n / 9), narrow = Math.ceil(n / 5);
      var xl = j.map(function (x, k) {
        var back = n - 1 - k;
        var lab = x.now ? "Now" : String(x.season).replace(/^\d\d(\d\d)[–-]\d\d(\d\d)$/, "$1–$2").replace(/^\d\d(\d\d)[–-](\d\d)$/, "$1–$2").replace(/^\d\d(\d\d)$/, "$1");
        var cls = (back % wide ? "hw" : back % narrow ? "hn" : "") + (k === 0 && n > 1 ? " first" : back === 0 && n > 1 ? " last" : "");
        return '<span class="' + cls + '" style="left:' + pct(X(k), 1000) + '">' + esc(lab) + "</span>";
      }).join("");
      var h = Math.max(200, Math.min(380, Math.round(ymax * 2.6)));
      var where = ord(latest.pos) + " " + inLeague(latest.league) +
        (ranked(latest) ? ", " + ord(latest.rank) + " of " + natTotal(latest) + " " + acrossOf(latest) : latest.tier > nat ? ", tier " + latest.tier : "");
      var cap = (latest.now ? "This season so far: " : "In " + latest.season + ": ") + where + ".";
      // Say why a regional season has no overall position, but only for clubs that have one.
      var splitNote = nat > 1 && j.some(function (x) { return x.tier > nat; }) && ladder[nat]
        ? '<p class="lchart-note">Overall positions count the top ' + (NUM[nat] || nat) + " divisions. " + esc(ladder[nat].name) +
          " (tier " + (nat + 1) + ") is split into regional groups, so seasons there aren't ranked against the rest.</p>" : "";
      var ups = d.journey.filter(function (x) { return x.move === "up"; }).length, downs = d.journey.filter(function (x) { return x.move === "down"; }).length;
      var oldest = d.journey[d.journey.length - 1];
      var tally = n > 1 && (ups || downs)
        ? " Since " + oldest.season + ": " + (ups ? ups + " promotion" + (ups === 1 ? "" : "s") : "") + (ups && downs ? " and " : "") +
          (downs ? downs + " relegation" + (downs === 1 ? "" : "s") : "") + "."
        : "";
      journey = '<section class="cl-sec" id="journey"><div class="cl-sec-h"><h2>' + esc(d.name) + (/s$/.test(d.name) ? "’" : "’s") + " journey through the " + (d.adjective ? esc(d.adjective) + " " : "") + "pyramid</h2></div>" +
        '<p class="lchart-cap">' + esc(cap + tally) + "</p>" + splitNote +
        '<div class="lchart"><div class="lside">' + side + '</div><div class="lplot" style="height:' + h + 'px">' +
        '<svg viewBox="0 0 1000 ' + ymax + '" preserveAspectRatio="none" aria-hidden="true">' + rects + lpath + "</svg>" + dots + "</div>" +
        '<div class="lx">' + xl + "</div></div>" +
        (function () {   // key, only for the colours this club has
          var have = {}; j.forEach(function (x) { var m = mark(x); if (m) have[m] = 1; });
          var keys = ["champ", "up", "down"].filter(function (k2) { return have[k2]; });
          return keys.length ? '<ul class="lkey">' + keys.map(function (k2) { return '<li><i class="m-' + k2 + '"></i>' + MARK[k2] + "</li>"; }).join("") + "</ul>" : "";
        })() +
        '<details class="jmore" id="club-seasons"><summary>Season by season <span>' + n + (n === 1 ? " season" : " seasons") + "</span></summary>" +
        '<ul class="jlist">' + d.journey.map(function (x) {
          return "<li><span>" + esc(x.season) + '</span><i class="tag tier-' + x.tier + '">T' + x.tier + "</i>" +
            "<span class=\"jl\">" + ((x.href || (x.now && tableNow)) ? '<a href="' + esc(x.href || tableNow) + '">' + esc(x.league) + "</a>" : esc(x.league)) +
            (x.move ? ' <i class="jm ' + x.move + '" title="' + esc((x.move === "up" ? "Up to " : "Down to ") + x.to + " the next season") + '">' +
              (x.move === "up" ? "▲ Promoted" : "▼ Relegated") + "</i>" : "") + "</span><b>" + (x.pos ? ord(x.pos) + (x.of ? " of " + x.of : "") : "") +
            (ranked(x) ? '<em>' + ord(x.rank) + " of " + natTotal(x) + "</em>" : "") + "</b></li>";
        }).join("") + "</ul></details></section>";
    }

    // Last five, oldest first; each chip shows the match on hover (or tap on a phone).
    var form5 = played.slice(0, 5).reverse();
    var formStr = form5.map(res).join("");
    var formChips = form5.map(function (f, k) {
      var r = res(f), g = mine(f);
      var score = g[0] + "–" + g[1] + (f.st === "AET" ? " after extra time" : "");
      if (f.pen) { var p = f.home ? f.pen : [f.pen[1], f.pen[0]]; score += ", " + p[0] + "–" + p[1] + " on penalties"; }
      var tip = '<span class="ltip' + (k < 2 ? " l" : k > 3 ? " r" : "") + '"><b>' + tt(f.ts, tz, "d") + " · " + esc(f.comp.name) + (f.round ? " · " + esc(f.round) : "") + "</b>" +
        (f.home ? "Home v " : "Away at ") + esc(f.opp.n) + "<i>" + ({ W: "Won", D: "Drew", L: "Lost" })[r] + " " + score + "</i></span>";
      return '<b class="fchip ' + r + '" tabindex="0">' + r + tip + "</b>";
    }).join("");
    return '<section class="intro fx-intro" aria-labelledby="intro-h">' +
      // Breadcrumb: the country's pyramid, then the club's league table on it.
      '<p class="eyebrow crumbs"><a href="' + esc(d.root + d.country + "/" + d.suffix) + '">' + esc(d.countryName) + "</a>" +
        (lg ? " · " + (lg.tableHref ? '<a href="' + esc(lg.tableHref) + '">' + esc(lg.name) + "</a>" : esc(lg.name)) : "") + " · " + esc(d.season) + "</p>" +
      '<h1 id="intro-h" class="cup-h">' + flag(d.country) + "<span>" + esc(d.name) + "</span></h1>" +
      '<p class="lede">' + (d.pos ? "<strong>" + ord(d.pos) + " " + esc(inLeague(lg.name)) + "</strong>, " + d.pts + " points from " + d.p + " games." : esc(d.note || "")) +
      (formStr ? ' Last 5 matches: <span class="form">' + formChips + "</span>" : "") + "</p>" +
      // Where the club has come from: promoted or relegated, back after how long, how many seasons in a row.
      ((d.context || []).length ? '<p class="cl-context">' + d.context.map(function (c) {
        return '<span class="' + (c.dir ? "cx-" + c.dir : "") + '">' + (c.dir === "up" ? '<b aria-hidden="true">▲</b> ' : c.dir === "down" ? '<b aria-hidden="true">▼</b> ' : "") + esc(c.text) + "</span>";
      }).join('<i aria-hidden="true"> · </i>') + "</p>" : "") +
      '<p class="fx-links">' + tzLine(mode, d.country) + "</p></section>" +
      // The journey comes straight after the next match: it's what this site has that a scores site doesn't.
      nextHTML + journey +
      '<div class="cl-cols"><section class="cl-sec"><div class="cl-sec-h"><h2>Fixtures</h2></div>' +
        (list(live, "live", 9) + list(upcoming, "fixture", 6) || '<p class="ko-empty">No fixtures scheduled yet.</p>') + "</section>" +
      '<section class="cl-sec"><div class="cl-sec-h"><h2>Results</h2></div>' + (list(played, "result", 6) || '<p class="ko-empty">No results yet this season.</p>') + "</section></div>" +
      compSection + cupSection;
  }

  return {
    slug: slug, esc: esc, ukTime: ukTime, phases: phases, clubCount: clubCount, countryClubs: countryClubs, groupsOf: groupsOf,
    countryMain: countryMain, racesMain: racesMain, homeMain: homeMain, summary: summary, flag: flag, fixturesMain: fixturesMain, currentRound: currentRound, compMain: compMain, europeMain: europeMain, cupMain: cupMain, cupStatus: cupStatus, cupSpan: cupSpan, inLeague: inLeague, clubMain: clubMain, retime: retime, compStatus: compStatus, tiesOf: tiesOf, applyLive: applyLive, clock: clock, isLive: isLive
  };
});
