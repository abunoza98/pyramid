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
  function ord(n) {
    var s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function range(z) { return z.from === z.to ? ord(z.from) : z.from + "–" + z.to; }
  function gd(r) { var d = r.gf - r.ga; return d > 0 ? "+" + d : d < 0 ? "−" + Math.abs(d) : "0"; }

  // "2026-10-21" is a date only; anything longer carries a time.
  function ukTime(iso) {
    if (!iso) return "";
    var dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(iso);
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
  function clubCount(lg) { return groupsOf(lg).reduce(function (n, g) { return n + g.rows.length; }, 0); }
  function countryClubs(c) { return c.leagues.reduce(function (n, lg) { return n + clubCount(lg); }, 0); }

  // Play-off results, worked out by scripts/build.mjs from the next season's tables.
  var OUT = { "po-won": "▲ Won play-off", "po-stayed": "Stayed up", "po-lost": "▼ Lost play-off" };

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
      return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ts * 1000));
    } catch (e) { return ""; }
  }

  /* ---------- Pieces ---------- */
  function rowHTML(lg, rows, r, i, hasForm) {
    var z = zoneOf(lg, r.pos);
    var next = rows[i + 1];
    var cls = [];
    if (z) cls.push("z-" + z.kind);
    if (next && zoneOf(lg, next.pos) !== z) cls.push("edge");
    var form = "";
    if (hasForm) {
      form = '<td class="c-form"><span class="form" aria-label="Last five, most recent last: ' + esc(r.form || "") + '">' +
        String(r.form || "").slice(-5).split("").map(function (c) {
          return /[WDL]/.test(c) ? '<b class="' + c + '">' + c + "</b>" : "";
        }).join("") + "</span></td>";
    }
    return '<tr class="' + cls.join(" ") + '" data-team="' + esc(r.team) + '">' +
      '<td class="c-pos">' + r.pos +
        (r.move ? '<span class="mv ' + (r.move > 0 ? "mv-up" : "mv-down") + '" title="' + (r.move > 0 ? "Up " : "Down ") + Math.abs(r.move) + ' as it stands">' + (r.move > 0 ? "▲" : "▼") + "</span>" : "") + "</td>" +
      '<th scope="row" class="c-club">' + esc(r.team) +
        (r.ded ? '<span class="ded" title="' + r.ded + ' points deducted">−' + r.ded + "</span>" : "") +
        (r.out ? '<span class="out ' + r.out + '">' + OUT[r.out] + "</span>" : "") +
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
      '<td class="c-pts">' + r.pts + "</td></tr>";
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
        '<th scope="col" class="c-pts"><abbr title="Points">Pts</abbr></th>' +
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

  // opts: { eyebrow, more: {href, text} }
  function tierHTML(lg, opts) {
    opts = opts || {};
    var grouped = !!(lg.groups && lg.groups.length);
    var meta = clubCount(lg) + " clubs · " + (lg.final ? "final table" : lg.asItStands ? "as it stands" : "updated " + ukTime(lg.updated));
    var body = grouped
      ? lg.groups.map(function (g) {
          var stamp = g.updated && g.updated !== lg.updated ? "updated " + ukTime(g.updated) : "";
          return '<div class="group"><div class="group-head"><h3>' + esc(g.name) + "</h3>" +
            (stamp ? "<span>" + stamp + "</span>" : "") + "</div>" +
            tableHTML(lg, g.rows, lg.name + ", " + g.name) + "</div>";
        }).join("")
      : tableHTML(lg, lg.rows, lg.name + " table");
    if (grouped) {
      var dates = lg.groups.map(function (g) { return g.updated || lg.updated; });
      var newest = dates.slice().sort().pop();
      meta = clubCount(lg) + " clubs in " + lg.groups.length + " groups · " + (lg.final ? "final tables" : lg.asItStands ? "as they stand" : "updated " + ukTime(newest));
    }
    return '<section class="tier" id="' + esc(lg.id) + '" aria-labelledby="h-' + esc(lg.id) + '">' +
      '<header class="tier-head"><p class="tier-num">' + esc(opts.eyebrow || "Tier " + lg.tier) + "</p>" +
      '<h2 id="h-' + esc(lg.id) + '">' + esc(lg.name) + "</h2>" +
      '<p class="tier-meta">' + meta + "</p></header>" +
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
    var live = mode === "live";
    return '<p class="stamp' + (live ? " live" : "") + '" id="stamp"><span class="dot"></span><span>' +
      (live ? "Live · updated " : "Sample snapshot · standings as of ") + ukTime(updated) + " UK</span></p>";
  }

  var INLINE_AD = '<div class="ad ad-inline"><span class="ad-tag">Advertisement</span>' +
    '<span class="ad-size"><span class="wide">728 × 90</span><span class="narrow">320 × 100</span></span></div>';

  // c: a country's data, or a home-page summary (whose leagues carry clubs/groups counts). link: page the bars link to.
  function pyramidHTML(c, link) {
    var tiers = c.leagues.map(function (lg) {
      var g = lg.groups && lg.groups.length;
      return { tier: lg.tier, name: lg.name, short: lg.short, clubs: lg.clubs != null && !lg.rows && !lg.groups ? lg.clubs : clubCount(lg),
        groups: lg.groupCount != null ? lg.groupCount : g ? lg.groups.length : 0, href: (link || "") + "#" + lg.id };
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
    return '<figure class="pyr"><div class="pyr-rows">' + rows + "</div>" +
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
      stampHTML(c.mode, c.updated, c.liveCount) + pyramidHTML(c) + "</section>";
    c.leagues.forEach(function (lg, i) {
      html += tierHTML(lg) + bandHTML(lg, c.leagues[i + 1] || null, c.belowNote);
      if (i === 1) html += INLINE_AD;
    });
    return html;
  }

  /* ---------- Flags (simple SVGs, so they look the same on every device) ---------- */
  var FLAGS = {
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
      '<path d="M15.6 10l3.7-1.2-2.3 3.15V8.05l2.3 3.15z" fill="#fff"/>'
  };
  function flag(country) {
    var f = FLAGS[country];
    return f ? '<svg class="flag" viewBox="0 0 30 20" aria-hidden="true">' + f + "</svg>" : "";
  }

  // A country's summary for the home page: enough to draw its pyramid and card without the tables.
  function summary(c) {
    return {
      country: c.country, name: c.name, adjective: c.adjective, code: c.code, featured: !!c.featured,
      tiers: c.leagues.length, clubs: countryClubs(c), sizes: c.leagues.map(clubCount),
      leagues: c.leagues.map(function (lg) {
        return { id: lg.id, tier: lg.tier, name: lg.name, short: lg.short, clubs: clubCount(lg), groupCount: lg.groups ? lg.groups.length : 0 };
      })
    };
  }

  // Today's games across every country, for the strip under the headline.
  function stripHTML(live, all, base, suffix, names, now) {
    var fx = live && live.fixtures ? live.fixtures.slice() : [];
    if (!fx.length) return "";
    var nm = function (t) { return names[t.id] || t.n; };
    var info = {};
    all.forEach(function (s) { s.leagues.forEach(function (lg) { info[s.country + "/" + lg.id] = { short: lg.short || lg.name, tier: lg.tier }; }); });
    var rank = function (f) { return isLive(f) ? 0 : f.st === "NS" ? 1 : isDone(f) ? 2 : 3; };
    fx.sort(function (a, b) {
      var ta = (info[a.c + "/" + a.l] || {}).tier || 9, tb = (info[b.c + "/" + b.l] || {}).tier || 9;
      return rank(a) - rank(b) || ta - tb || a.ko - b.ko;
    });
    var liveN = fx.filter(isLive).length;
    var countries = {};
    fx.forEach(function (f) { countries[f.c] = 1; });
    var nC = Object.keys(countries).length;
    var chips = fx.slice(0, 24).map(function (f) {
      var lg = info[f.c + "/" + f.l] || { short: "" };
      var started = f.h.g != null && f.a.g != null && !OFF_ST[f.st];
      var t = OFF_ST[f.st] || (started ? clock(f, now) : ukClock(f.ko));
      return '<li><a class="chip' + (isLive(f) ? " on" : "") + '" href="' + base + f.c + "/" + suffix + "#" + esc(f.l) + '">' +
        '<span class="chip-top">' + flag(f.c) + "<span>" + esc(lg.short) + "</span><b>" + esc(t) + "</b></span>" +
        '<span class="chip-row"><span>' + esc(nm(f.h)) + "</span><b>" + (started ? f.h.g : "") + "</b></span>" +
        '<span class="chip-row"><span>' + esc(nm(f.a)) + "</span><b>" + (started ? f.a.g : "") + "</b></span></a></li>";
    }).join("");
    return '<section class="strip" aria-label="Today’s games"><p class="strip-head">' +
      (liveN ? '<span class="live-dot" aria-hidden="true"></span>' : "") + "Today: " + fx.length + " game" + (fx.length === 1 ? "" : "s") +
      " in " + nC + " countr" + (nC === 1 ? "y" : "ies") + (liveN ? " · <strong>" + liveN + " live</strong>" : "") + "</p>" +
      '<ul class="strip-list">' + chips + "</ul></section>";
  }

  // The pyramid explorer: a flag for each country, and that country's pyramid.
  function explorerHTML(all, base, suffix) {
    var tabs = all.map(function (s, i) {
      return '<button type="button" role="tab" class="xp-tab' + (i === 0 ? " on" : "") + '" data-tab="' + s.country + '" aria-selected="' + (i === 0) + '">' +
        flag(s.country) + "<span>" + esc(s.name) + "</span></button>";
    }).join("");
    var panels = all.map(function (s, i) {
      var href = base + s.country + "/" + suffix;
      return '<div class="xp-panel' + (i === 0 ? " on" : "") + '" data-panel="' + s.country + '" role="tabpanel">' +
        '<div class="xp-head"><h2>' + flag(s.country) + "The " + esc(s.adjective) + " pyramid</h2>" +
        "<p>" + s.tiers + " tier" + (s.tiers === 1 ? "" : "s") + " · " + s.clubs + " clubs</p></div>" +
        pyramidHTML(s, href) +
        '<a class="more" href="' + href + '">Open every ' + esc(s.adjective) + ' table <span aria-hidden="true">→</span></a></div>';
    }).join("");
    return '<section class="explorer" data-tabs="pyramid" aria-labelledby="xp-h"><h2 class="section-h" id="xp-h">Pick a pyramid</h2>' +
      '<div class="xp"><div class="xp-tabs" role="tablist" aria-label="Countries">' + tabs + "</div>" +
      '<div class="xp-panels">' + panels + "</div></div></section>";
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
    var newest = countries.map(function (c) { return c.leagues[0].updated; }).sort().pop();
    var live = countries.every(function (c) { return c.mode === "live"; });
    var nLeagues = all.reduce(function (n, s) { return n + s.tiers; }, 0);
    var nClubs = all.reduce(function (n, s) { return n + s.clubs; }, 0);
    var html =
      '<section class="intro hero" aria-labelledby="intro-h">' +
      '<p class="eyebrow">Football Pyramids · ' + esc(countries[0].season) + "</p>" +
      '<h1 id="intro-h">Every league table, top to bottom.</h1>' +
      '<p class="lede">' + all.length + " countries, " + nLeagues + " leagues and " + nClubs.toLocaleString("en-GB") +
      " clubs. Each country’s whole football pyramid on one page, from the top flight down, with live scores on match days.</p>" +
      stampHTML(live ? "live" : "snapshot", newest, countries.reduce(function (n, c) { return n + (c.liveCount || 0); }, 0)) +
      "</section>" +
      stripHTML(opts.live, all, base, suffix, names) +
      explorerHTML(all, base, suffix) + INLINE_AD;
    // The top flights, one tab each.
    var tabs = countries.map(function (c, i) {
      return '<button type="button" role="tab" class="tf-tab' + (i === 0 ? " on" : "") + '" data-tab="' + c.country + '" aria-selected="' + (i === 0) + '">' +
        flag(c.country) + "<span>" + esc(c.leagues[0].name) + "</span></button>";
    }).join("");
    var panels = countries.map(function (c, i) {
      return '<div class="tf-panel' + (i === 0 ? " on" : "") + '" data-panel="' + c.country + '" role="tabpanel">' +
        tierHTML(c.leagues[0], {
          eyebrow: c.name + " · Tier 1",
          more: { href: base + c.country + "/" + suffix, text: "See the full " + c.adjective + " pyramid: " + c.leagues.length + " tiers, " + countryClubs(c) + " clubs" }
        }) + "</div>";
    }).join("");
    html += '<section class="topflights" data-tabs="table" aria-labelledby="tf-h"><h2 class="section-h" id="tf-h">Top-flight tables</h2>' +
      '<div class="tf-tabs" role="tablist" aria-label="Leagues">' + tabs + "</div>" + panels + "</section>";
    return html;
  }

  return {
    esc: esc, ukTime: ukTime, clubCount: clubCount, countryClubs: countryClubs, groupsOf: groupsOf,
    countryMain: countryMain, homeMain: homeMain, summary: summary, flag: flag, applyLive: applyLive, clock: clock, isLive: isLive
  };
});
