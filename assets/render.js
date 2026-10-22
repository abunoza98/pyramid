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
    return '<tr class="' + cls.join(" ") + '" data-team="' + esc(r.team) + '">' +
      '<td class="c-pos">' + r.pos +
        (r.move ? '<span class="mv ' + (r.move > 0 ? "mv-up" : "mv-down") + '" title="' + (r.move > 0 ? "Up " : "Down ") + Math.abs(r.move) + ' as it stands">' + (r.move > 0 ? "▲" : "▼") + "</span>" : "") + "</td>" +
      '<th scope="row" class="c-club">' + (clubHref(lg, r) ? '<a class="club-link" href="' + esc(clubHref(lg, r)) + '">' + esc(r.team) + "</a>" : esc(r.team)) +
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
      '<p class="tier-meta">' + meta + "</p>" +
      (opts.fixtures ? '<a class="tier-fx" href="' + esc(opts.fixtures) + '">Fixtures and results <span aria-hidden="true">→</span></a>' : "") + "</header>" +
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
  // cups: [{ name, href, status, span }] shown as chips under the bars.
  var CUP_ICON = '<svg class="cup-ic" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2h8v3a4 4 0 0 1-8 0V2zM4 3H2v1a2.5 2.5 0 0 0 2.6 2.5M12 3h2v1a2.5 2.5 0 0 1-2.6 2.5M8 9v3M5 14h6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function cupChipsHTML(cups) {
    if (!cups || !cups.length) return "";
    return '<div class="pyr-cups"><span class="pyr-cups-h">Cups</span>' + cups.map(function (c) {
      return '<a class="cup-chip" href="' + esc(c.href) + '">' + CUP_ICON + '<span class="cup-chip-name">' + esc(c.name) + "</span>" +
        '<span class="cup-chip-meta">' + esc([c.span, c.status].filter(Boolean).join(" · ")) + "</span></a>";
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
      stampHTML(c.mode, c.updated, c.liveCount) + pyramidHTML(c, "", opts.cups) + "</section>";
    c.leagues.forEach(function (lg, i) {
      if (!past) { lg._club = "club/"; lg._suffix = opts.suffix || ""; }
      else if (opts.clubPaths) { lg._paths = opts.clubPaths; lg._root = opts.root || ""; lg._suffix = opts.suffix || ""; }
      html += tierHTML(lg, { fixtures: (opts.fixtures || {})[c.country + "/" + lg.id] }) + bandHTML(lg, c.leagues[i + 1] || null, c.belowNote);
      if (i === 1) html += INLINE_AD;
    });
    return html;
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
      var href = f.c === "europe" ? base + "europe/" + f.l + "/" + suffix : base + f.c + "/" + suffix + "#" + f.l;
      return '<li><a class="chip' + (isLive(f) ? " on" : "") + '" href="' + esc(href) + '">' +
        '<span class="chip-top">' + flag(f.c) + "<span>" + esc(lg.short) + "</span><b>" + esc(t) + "</b></span>" +
        '<span class="chip-row"><span>' + esc(nm(f.h)) + "</span><b>" + (started ? f.h.g : "") + "</b></span>" +
        '<span class="chip-row"><span>' + esc(nm(f.a)) + "</span><b>" + (started ? f.a.g : "") + "</b></span></a></li>";
    }).join("");
    return '<section class="strip" aria-label="Today’s games"><p class="strip-head">' +
      (liveN ? '<span class="live-dot" aria-hidden="true"></span>' : "") + "Today: " + fx.length + " game" + (fx.length === 1 ? "" : "s") +
      " in " + nC + " countr" + (nC === 1 ? "y" : "ies") + (liveN ? " · <strong>" + liveN + " live</strong>" : "") + "</p>" +
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

  // The pyramid explorer: a flag for each country, and that country's pyramid.
  function explorerHTML(all, base, suffix, cupsBy) {
    var tabs = all.map(function (s, i) {
      return '<button type="button" role="tab" class="xp-tab' + (i === 0 ? " on" : "") + '" data-tab="' + s.country + '" aria-selected="' + (i === 0) + '">' +
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
      stripHTML(opts.live, opts.europe ? all.concat([summary(opts.europe)]) : all, base, suffix, names) +
      // England first (the default), Europe straight after the big five.
      explorerHTML(opts.europe ? all.slice(0, countries.length).concat([summary(opts.europe)], all.slice(countries.length)) : all, base, suffix, opts.cups) + INLINE_AD;
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
        more: { href: base + "europe/champions-league/" + suffix, text: "Champions League bracket, qualifying and past seasons" } } });
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

  function gameHTML(f, tz, now, myClub) {
    var on = isLive(f), done = isDone(f) || f.st === "AWD" || f.st === "WO";
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
    var mine = myClub && (f.h.n === myClub || f.a.n === myClub);
    return '<li class="g' + (on ? " on" : "") + (GONE[f.st] && !on ? " off" : "") + (mine ? " is-mine" : "") + '">' +
      '<span class="g-time">' + esc(time) + "</span>" +
      '<span class="g-h' + (win === "h" ? " w" : "") + '">' + esc(f.h.n) + "</span>" +
      '<span class="g-s">' + score + "</span>" +
      '<span class="g-a' + (win === "a" ? " w" : "") + '">' + esc(f.a.n) + "</span>" +
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

  function fixturesMain(fx, opts) {
    opts = opts || {};
    var mode = opts.tz === "local" ? "local" : "venue", now = opts.now || Date.now();
    var tz = zoneOfMode(mode, fx.country);
    var gi = Math.min(opts.group || 0, fx.groups.length - 1);
    var g = fx.groups[gi];
    var ri = opts.round == null ? currentRound(g.rounds, now) : Math.max(0, Math.min(opts.round, g.rounds.length - 1));
    var r = g.rounds[ri];
    // Today's live scores, laid over the fixture list.
    var live = {};
    (opts.live && opts.live.fixtures || []).forEach(function (f) { live[f.id] = f; });
    var games = r.fixtures.map(function (f) {
      var l = live[f.id];
      if (!l) return f;
      var c = JSON.parse(JSON.stringify(f));
      c.st = l.st; c.p1 = l.p1 || c.p1; c.p2 = l.p2 || c.p2;
      if (l.h.g != null) { c.hg = l.h.g; c.ag = l.a.g; }
      return c;
    });
    // Group by day in the chosen time zone; postponed and cancelled games go last.
    var days = [], byDay = {}, off = [];
    games.forEach(function (f) {
      if (GONE[f.st] && !isLive(f) && f.st !== "ABD" && f.st !== "AWD") { off.push(f); return; }
      var d = fmt(f.ts, tz, { weekday: "long", day: "numeric", month: "long" });
      if (!byDay[d]) { byDay[d] = []; days.push(d); }
      byDay[d].push(f);
    });
    var list = days.map(function (d) {
      return '<h3 class="fx-date">' + esc(d) + '</h3><ul class="fx-list">' +
        byDay[d].map(function (f) { return gameHTML(f, tz, now, opts.myClub); }).join("") + "</ul>";
    }).join("") + (off.length ? '<h3 class="fx-date">Postponed and cancelled</h3><ul class="fx-list">' +
        off.map(function (f) { return gameHTML(f, tz, now, opts.myClub); }).join("") + "</ul>" : "");
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
      return { teams: teams, legs: legs, played: played, done: done, on: on, winner: winner, how: how, upset: upset };
    });
  }

  function tieHTML(t, tz, now) {
    var legNotes = t.legs.map(function (f, i) {
      var name = t.legs.length > 1 ? (i === 0 ? "1st leg" : "2nd leg") : "";
      if (GONE[f.st] && !isLive(f)) return (name ? name + ": " : "") + GONE[f.st];
      if (f.hg != null && (isDone(f) || isLive(f))) {
        var a = f.h.id === t.teams[0].id ? f.hg : f.ag, b = f.h.id === t.teams[0].id ? f.ag : f.hg;
        return (name ? name + " " : "") + a + "–" + b + (isLive(f) ? " (" + clock(f, now) + ")" : f.st === "AET" ? " aet" : "");
      }
      return (name ? name + " " : "") + (f.st === "TBD" ? fmt(f.ts, tz, { weekday: "short", day: "numeric", month: "short" }) + ", time TBC"
        : fmt(f.ts, tz, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }));
    });
    if (t.how === "pens") { var lp = t.legs[t.legs.length - 1]; legNotes.push("won " + Math.max(lp.pen[0], lp.pen[1]) + "–" + Math.min(lp.pen[0], lp.pen[1]) + " on pens"); }
    var row = function (i) {
      var tm = t.teams[i];
      return '<span class="tie-team' + (t.winner === i ? " tie-won" : t.winner === 1 - i ? " tie-lost" : "") + '"><span>' + esc(tm.n) +
        (tm.t ? ' <i class="tag tier-' + (tm.tier || 0) + '" title="Plays in ' + esc(tm.t) + '">' + esc(tm.t) + "</i>" : "") + "</span>" +
        (t.played ? "<b>" + tm.agg + "</b>" : "") + "</span>";
    };
    return '<div class="tie' + (t.on ? " on" : "") + '" data-teams="' + esc(t.teams[0].n + "|" + t.teams[1].n) + '">' + row(0) + row(1) +
      '<span class="tie-note">' + (t.upset ? '<b class="upset">Upset</b> · ' : "") + legNotes.map(esc).join(" · ") + "</span></div>";
  }

  // The knockout bracket: one column per round. Each round's ties are put in the order of the round after it,
  // so winners line up with where they go next. Rounds not yet drawn simply aren't there yet.
  function bracketHTML(rounds, tz, now) {
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
        c.ties.map(function (t) { return tieHTML(t, tz, now); }).join("") + "</div></div>";
    }).join("") + "</div>";
  }

  function qualifyingHTML(rounds, tz, now) {
    if (!rounds.length) return '<p class="ko-empty">No qualifying rounds this season.</p>';
    return rounds.slice().reverse().map(function (r) {
      var ties = tiesOf(r);
      return '<details class="q-round"><summary>' + esc(r.label) + " <span>" + ties.length + " ties</span></summary>" +
        '<div class="q-ties">' + ties.map(function (t) { return tieHTML(t, tz, now); }).join("") + "</div></details>";
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
    var mode = opts.tz === "local" ? "local" : "venue", now = opts.now || Date.now();
    var tz = zoneOfMode(mode, "europe");
    var lpRounds = fx ? stageRounds(fx, "lp", opts.live) : [];
    var ko = fx ? stageRounds(fx, "ko", opts.live) : [];
    var q = fx ? stageRounds(fx, "q", opts.live) : [];
    var lpDone = lpRounds.length && lpRounds.every(function (r) { return r.fixtures.every(function (f) { return isDone(f) || GONE[f.st]; }); });
    var first = ko.length && lpDone ? "ko" : "lp";
    var tab = function (k, label) {
      return '<button type="button" role="tab" class="tf-tab' + (k === first ? " on" : "") + '" data-tab="' + k + '" aria-selected="' + (k === first) + '">' + label + "</button>";
    };
    var panel = function (k, html) { return '<div class="tf-panel' + (k === first ? " on" : "") + '" data-panel="' + k + '" role="tabpanel">' + html + "</div>"; };
    return '<section class="intro fx-intro" aria-labelledby="intro-h">' +
      '<p class="eyebrow">UEFA · ' + esc(fx ? fx.season : "") + "</p>" +
      '<h1 id="intro-h"><span class="comp-dot c-' + esc(comp.id) + '" aria-hidden="true"></span>' + esc(comp.name) + "</h1>" +
      (opts.seasons ? seasonsHTML({ name: comp.name, season: fx ? fx.season : "" }, opts.seasons) : "") +
      '<p class="lede"><strong>' + esc(compStatus(comp, fx)) + "</strong> · " + (comp.final ? (comp.groups ? "The group-stage tables" : "The league-phase table") + ", the full knockout bracket and every qualifying tie."
        : "The league-phase table, the knockout bracket as each draw is made, and every qualifying tie.") + "</p>" +
      '<p class="fx-links">' + (opts.fixturesHref ? '<a href="' + esc(opts.fixturesHref) + '">Fixtures and results by round →</a>' : "") +
      tzLine(mode, "europe") + "</p></section>" +
      '<section class="comp" data-tabs="stage"><div class="tf-tabs comp-tabs" role="tablist" aria-label="Stages">' +
      tab("lp", comp.groups ? "Group stage" : "League phase") + tab("ko", "Knockouts") + tab("q", "Qualifying") + "</div>" +
      panel("lp", (comp.rows && !comp.rows.length && !comp.groups ? '<p class="ko-empty">No table for this season.</p>'
        : tierHTML(opts.clubPaths ? Object.assign(comp, { _paths: opts.clubPaths, _root: opts.root || "", _suffix: opts.suffix || "" }) : comp, { eyebrow: comp.groups ? "Group stage" : "League phase" }))) +
      panel("ko", bracketHTML(ko, tz, now)) +
      panel("q", qualifyingHTML(q, tz, now)) + "</section>";
  }

  // The /europe/ page: a card per competition.
  function europeMain(e, opts) {
    opts = opts || {};
    var base = opts.base || "", suffix = opts.suffix || "";
    var cards = e.leagues.map(function (c) {
      var top = (c.rows || []).slice(0, 3);
      return '<li><a class="ecard" href="' + base + c.id + "/" + suffix + '">' +
        '<span class="ecard-name"><span class="comp-dot c-' + esc(c.id) + '" aria-hidden="true"></span>' + esc(c.name) + "</span>" +
        '<span class="ecard-status">' + esc((opts.statuses || {})[c.id] || "League phase") + "</span>" +
        '<ol class="ecard-top">' + top.map(function (r) {
          return "<li><span>" + r.pos + "</span>" + esc(r.team) + (r.live ? ' <i class="lv on">' + esc(r.live.clock) + " " + r.live.gf + "–" + r.live.ga + "</i>" : "") + "<b>" + r.pts + " pts</b></li>";
        }).join("") + "</ol></a></li>";
    }).join("");
    return '<section class="intro" aria-labelledby="intro-h"><p class="eyebrow">UEFA club competitions · ' + esc(e.season) + "</p>" +
      '<h1 id="intro-h">Champions League, Europa League and Conference League</h1>' +
      '<p class="lede">League-phase tables, knockout brackets that fill in after each draw, every qualifying tie and every fixture, with live scores on European nights.</p>' +
      stampHTML(e.mode, e.updated, e.liveCount) + '</section><ul class="ecards">' + cards + "</ul>" +
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
    opts = opts || {};
    var country = fx ? fx.country : cup.country;
    var mode = opts.tz === "local" ? "local" : "venue", now = opts.now || Date.now();
    var tz = zoneOfMode(mode, country);
    var lm = liveMap(opts.live);
    var rounds = fx ? fx.groups[0].rounds.map(function (r) {
      return { key: r.key, label: r.label, mid: r.mid, fixtures: r.fixtures.map(function (f) { return mergeLive(f, lm); }) };
    }) : [];
    // The bracket starts at the last 16 (8 ties or fewer); earlier rounds are listed.
    var startAt = -1;
    for (var i = 0; i < rounds.length; i++) if (tiesOf(rounds[i]).length <= 8) { startAt = i; break; }
    var bracketRounds = startAt > -1 ? rounds.slice(startAt) : [];
    var first = bracketRounds.length ? "bracket" : "rounds";
    var current = rounds.length - 1;
    for (var j = 0; j < rounds.length; j++) {
      if (rounds[j].fixtures.some(function (f) { return !isDone(f) && !GONE[f.st]; })) { current = j; break; }
    }
    var list = rounds.map(function (r, k) { return { r: r, k: k }; }).reverse().map(function (x) {
      var ties = tiesOf(x.r), range = roundRange(x.r, tz);
      return '<details class="q-round" id="round-' + x.k + '"' + (x.k === current ? " open" : "") + "><summary>" + esc(x.r.label) + " <span>" + ties.length + " tie" + (ties.length === 1 ? "" : "s") +
        (range ? " · " + esc(range) : "") + "</span></summary>" +
        '<div class="q-ties">' + ties.map(function (t) { return tieHTML(t, tz, now); }).join("") + "</div></details>";
    }).join("");
    var tab = function (k, label) {
      return '<button type="button" role="tab" class="tf-tab' + (k === first ? " on" : "") + '" data-tab="' + k + '" aria-selected="' + (k === first) + '">' + label + "</button>";
    };
    var panel = function (k, html) { return '<div class="tf-panel' + (k === first ? " on" : "") + '" data-panel="' + k + '" role="tabpanel">' + html + "</div>"; };
    return '<section class="intro fx-intro" aria-labelledby="intro-h">' +
      '<p class="eyebrow">' + esc((fx && fx.countryName) || "") + " · Cup · " + esc(fx ? fx.season : "") + "</p>" +
      '<h1 id="intro-h" class="cup-h">' + flag(country) + "<span>" + esc(cup.name) + "</span></h1>" +
      '<p class="lede"><strong>' + esc(cupStatus(fx)) + "</strong> · Every round and every tie, with each club’s league next to its name, so the giant-killings stand out.</p>" +
      '<p class="fx-links">' + (opts.fixturesHref ? '<a href="' + esc(opts.fixturesHref) + '">Fixtures and results by round →</a>' : "") +
      tzLine(mode, country) + "</p></section>" +
      '<section class="comp" data-tabs="cup"><div class="tf-tabs comp-tabs" role="tablist" aria-label="Views">' +
      tab("bracket", "Bracket") + tab("rounds", "Every round") + "</div>" +
      panel("bracket", bracketRounds.length ? bracketHTML(bracketRounds, tz, now)
        : '<p class="ko-empty">The bracket starts at the last 16 and appears once that draw is made. Until then, see every round so far.</p>') +
      panel("rounds", list || '<p class="ko-empty">No ties yet. They appear as soon as the first draw is made.</p>') + "</section>";
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

    // Table: the club and the three places either side
    var lg = d.league, tableHTMLs = "";
    if (lg && lg.rows && lg.rows.length) {
      var i = lg.rows.map(function (r) { return r.tid; }).indexOf(d.tid);
      var from = Math.max(0, Math.min(i - 3, lg.rows.length - 7)), part = lg.rows.slice(from, from + 7);
      var l2 = { id: lg.id, zones: lg.zones, _hl: d.tid, _club: lg._club, _suffix: lg._suffix };
      tableHTMLs = '<section class="cl-sec"><div class="cl-sec-h"><h2>' + esc(lg.name) + (lg.group ? " · " + esc(lg.group) : "") + "</h2>" +
        (lg.tableHref ? '<a href="' + esc(lg.tableHref) + '">Full table →</a>' : "") + "</div>" + legendHTML(l2, false) + tableHTML(l2, part, lg.name + " table around " + d.name) + "</section>";
    }

    // Each competition: where the club is up to
    var comps = {}, order = [];
    fx.forEach(function (f) { if (!comps[f.comp.key]) { comps[f.comp.key] = { comp: f.comp, list: [] }; order.push(f.comp.key); } comps[f.comp.key].list.push(f); });
    var rank = { league: 0, europe: 1, cup: 2 };
    order.sort(function (a, b) { return rank[comps[a].comp.kind] - rank[comps[b].comp.kind]; });
    var compRows = order.map(function (k) {
      var c = comps[k], st;
      var up = c.list.filter(function (f) { return !isDone(f) && !GONE[f.st]; }).sort(function (a, b) { return a.ts - b.ts; })[0];
      var last = c.list.filter(function (f) { return isDone(f) && f.hg != null; }).sort(function (a, b) { return b.ts - a.ts; })[0];
      if (c.comp.kind === "league") st = d.pos ? ord(d.pos) + " of " + lg.rows.length + " · " + d.pts + " pts" : "";
      else if (up) st = "Next: " + (up.round ? up.round + " " : "") + "v " + up.opp.n;
      else if (last) { var g = mine(last); st = (last.round ? last.round + ": " : "") + res(last) + " " + g[0] + "–" + g[1] + " v " + last.opp.n; }
      return '<li><span class="ctag ctag-' + c.comp.kind + '">' + esc(c.comp.short) + '</span><a href="' + esc(c.comp.href) + '">' + esc(c.comp.name) + "</a><span>" + esc(st || "") + "</span></li>";
    }).join("");

    // Pyramid journey: each season's finishing position on one ladder for the whole pyramid
    // (in England 1-20 is the Premier League, 21-44 the Championship and so on), oldest on the left.
    var journey = "";
    if ((d.journey || []).length) {
      var j = d.journey.slice().reverse(), n = j.length;
      var ladder = d.ladder || [];
      var depth = 0;
      while (depth < ladder.length && !ladder[depth].split) depth++;
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
      var dots = j.map(function (x, k) {
        var href = x.now ? tableNow : x.href, at = X(k) / 1000;
        var tip = '<span class="ltip' + (at < 0.2 ? " l" : at > 0.8 ? " r" : "") + (yOf(x) / ymax < 0.25 ? " below" : "") + '"><b>' + esc(x.season) + "</b>" +
          esc(x.league) + ": " + ord(x.pos) + (x.of ? " of " + x.of : "") + "<i>" + ord(x.rank) + " in the pyramid</i>" + (href ? "<u>View table →</u>" : "") + "</span>";
        var attrs = ' class="ld' + (x.now ? " now" : "") + '" style="left:' + pct(X(k), 1000) + ";top:" + pct(yOf(x), ymax) + '" aria-label="' +
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
      var total = off(latest, depth);
      var cap = latest.now ? "This season so far: " + ord(latest.pos) + " " + inLeague(latest.league) + ", " + ord(latest.rank) + " of " + total + " in the pyramid."
        : "In " + latest.season + ": " + ord(latest.pos) + " " + inLeague(latest.league) + ", " + ord(latest.rank) + " of " + total + " in the pyramid.";
      journey = '<section class="cl-sec"><div class="cl-sec-h"><h2>Pyramid journey</h2></div>' +
        '<p class="lchart-cap">' + esc(cap) + "</p>" +
        '<div class="lchart"><div class="lside">' + side + '</div><div class="lplot" style="height:' + h + 'px">' +
        '<svg viewBox="0 0 1000 ' + ymax + '" preserveAspectRatio="none" aria-hidden="true">' + rects + lpath + "</svg>" + dots + "</div>" +
        '<div class="lx">' + xl + "</div></div>" +
        '<details class="jmore" id="club-seasons"><summary>Season by season <span>' + n + (n === 1 ? " season" : " seasons") + "</span></summary>" +
        '<ul class="jlist">' + d.journey.map(function (x) {
          return "<li><span>" + esc(x.season) + '</span><i class="tag tier-' + x.tier + '">T' + x.tier + "</i>" +
            ((x.href || (x.now && tableNow)) ? '<a href="' + esc(x.href || tableNow) + '">' + esc(x.league) + "</a>" : esc(x.league)) + "<b>" + (x.pos ? ord(x.pos) + (x.of ? " of " + x.of : "") : "") +
            (x.rank ? '<em>' + ord(x.rank) + " overall</em>" : "") + "</b></li>";
        }).join("") + "</ul></details></section>";
    }

    var formStr = played.slice(0, 5).reverse().map(res).join("");
    return '<section class="intro fx-intro" aria-labelledby="intro-h">' +
      '<p class="eyebrow">' + esc(d.countryName) + (lg ? " · " + esc(lg.name) : "") + " · " + esc(d.season) + "</p>" +
      '<h1 id="intro-h" class="cup-h">' + flag(d.country) + "<span>" + esc(d.name) + "</span></h1>" +
      '<p class="lede">' + (d.pos ? "<strong>" + ord(d.pos) + " " + esc(inLeague(lg.name)) + "</strong>, " + d.pts + " points from " + d.p + " games." : esc(d.note || "")) +
      (formStr ? ' Last five: <span class="form">' + formStr.split("").map(function (c) { return '<b class="' + c + '">' + c + "</b>"; }).join("") + "</span>" : "") + "</p>" +
      '<p class="fx-links">' + tzLine(mode, d.country) + "</p></section>" +
      nextHTML +
      '<div class="cl-cols"><section class="cl-sec"><div class="cl-sec-h"><h2>Fixtures</h2></div>' +
        (list(live, "live", 9) + list(upcoming, "fixture", 6) || '<p class="ko-empty">No fixtures scheduled yet.</p>') + "</section>" +
      '<section class="cl-sec"><div class="cl-sec-h"><h2>Results</h2></div>' + (list(played, "result", 6) || '<p class="ko-empty">No results yet this season.</p>') + "</section></div>" +
      tableHTMLs +
      (compRows ? '<section class="cl-sec"><div class="cl-sec-h"><h2>Competitions</h2></div><ul class="cl-comps">' + compRows + "</ul></section>" : "") +
      journey;
  }

  return {
    slug: slug, esc: esc, ukTime: ukTime, clubCount: clubCount, countryClubs: countryClubs, groupsOf: groupsOf,
    countryMain: countryMain, homeMain: homeMain, summary: summary, flag: flag, fixturesMain: fixturesMain, currentRound: currentRound, compMain: compMain, europeMain: europeMain, cupMain: cupMain, cupStatus: cupStatus, cupSpan: cupSpan, inLeague: inLeague, clubMain: clubMain, retime: retime, compStatus: compStatus, tiesOf: tiesOf, applyLive: applyLive, clock: clock, isLive: isLive
  };
});
