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

  function pyramidHTML(c) {
    var tiers = c.leagues.map(function (lg) {
      var g = lg.groups && lg.groups.length;
      return { tier: lg.tier, name: lg.name, clubs: clubCount(lg), groups: g ? lg.groups.length : 0, href: "#" + lg.id };
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

  // Small summary of a country for its card on the home page.
  function summary(c) {
    return { country: c.country, name: c.name, tiers: c.leagues.length, clubs: countryClubs(c), sizes: c.leagues.map(clubCount) };
  }
  function cardsHTML(list, base, suffix, cls) {
    return '<ul class="countries' + (cls ? " " + cls : "") + '" aria-label="' + (cls ? "More country pyramids" : "Country pyramids") + '">' + list.map(function (c) {
      var max = Math.max.apply(null, c.sizes);
      return '<li><a href="' + base + c.country + "/" + suffix + '">' +
        '<span class="c-name">' + esc(c.name) + "</span>" +
        '<span class="mini" aria-hidden="true">' + c.sizes.map(function (n) {
          return '<i style="--w:' + (n / max * 100).toFixed(1) + '%"></i>';
        }).join("") + "</span>" +
        '<span class="c-meta">' + c.tiers + " tier" + (c.tiers === 1 ? "" : "s") + " · " + c.clubs + " clubs</span></a></li>";
    }).join("") + "</ul>";
  }

  // countries: the featured countries (full data). others: summaries of the rest, shown as cards only.
  function homeMain(countries, base, suffix, others) {
    suffix = suffix || "";
    others = others || [];
    var newest = countries.map(function (c) { return c.leagues[0].updated; }).sort().pop();
    var live = countries.every(function (c) { return c.mode === "live"; });
    var cards = cardsHTML(countries.map(summary), base, suffix) +
      (others.length ? '<h2 class="countries-more-h">More pyramids</h2>' + cardsHTML(others, base, suffix, "extra") : "");
    var html =
      '<section class="intro" aria-labelledby="intro-h">' +
      '<p class="eyebrow">Europe · ' + esc(countries[0].season) + "</p>" +
      '<h1 id="intro-h">Europe’s top five leagues, with every tier below them.</h1>' +
      '<p class="lede">The Premier League, La Liga, Bundesliga, Ligue 1 and Serie A on one page. Open a country to see its whole pyramid, from the top flight down.</p>' +
      stampHTML(live ? "live" : "snapshot", newest, countries.reduce(function (n, c) { return n + (c.liveCount || 0); }, 0)) +
      cards + "</section>";
    countries.forEach(function (c, i) {
      var top = c.leagues[0];
      html += tierHTML(top, {
        eyebrow: c.name + " · Tier 1",
        more: { href: base + c.country + "/" + suffix, text: "See the full " + c.adjective + " pyramid: " + c.leagues.length + " tiers, " + countryClubs(c) + " clubs" }
      });
      if (i === 1) html += INLINE_AD;
    });
    return html;
  }

  return {
    esc: esc, ukTime: ukTime, clubCount: clubCount, countryClubs: countryClubs, groupsOf: groupsOf,
    countryMain: countryMain, homeMain: homeMain, summary: summary, applyLive: applyLive, clock: clock, isLive: isLive
  };
});
