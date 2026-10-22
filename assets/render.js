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
      '<td class="c-pos">' + r.pos + "</td>" +
      '<th scope="row" class="c-club">' + esc(r.team) +
        (r.ded ? '<span class="ded" title="' + r.ded + ' points deducted">−' + r.ded + "</span>" : "") + "</th>" +
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
    var meta = clubCount(lg) + " clubs · " + (lg.final ? "final table" : "updated " + ukTime(lg.updated));
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
      meta = clubCount(lg) + " clubs in " + lg.groups.length + " groups · " + (lg.final ? "final tables" : "updated " + ukTime(newest));
    }
    return '<section class="tier" id="' + esc(lg.id) + '" aria-labelledby="h-' + esc(lg.id) + '">' +
      '<header class="tier-head"><p class="tier-num">' + esc(opts.eyebrow || "Tier " + lg.tier) + "</p>" +
      '<h2 id="h-' + esc(lg.id) + '">' + esc(lg.name) + "</h2>" +
      '<p class="tier-meta">' + meta + "</p></header>" +
      legendHTML(lg, grouped) + body + notesHTML(lg) +
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

  function stampHTML(mode, updated) {
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
      stampHTML(c.mode, c.updated) + pyramidHTML(c) + "</section>";
    c.leagues.forEach(function (lg, i) {
      html += tierHTML(lg) + bandHTML(lg, c.leagues[i + 1] || null, c.belowNote);
      if (i === 1) html += INLINE_AD;
    });
    return html;
  }

  function homeMain(countries, base, suffix) {
    suffix = suffix || "";
    var newest = countries.map(function (c) { return c.leagues[0].updated; }).sort().pop();
    var live = countries.every(function (c) { return c.mode === "live"; });
    var cards = countries.map(function (c) {
      var sizes = c.leagues.map(clubCount);
      var max = Math.max.apply(null, sizes);
      return '<li><a href="' + base + c.country + "/" + suffix + '">' +
        '<span class="c-name">' + esc(c.name) + "</span>" +
        '<span class="mini" aria-hidden="true">' + sizes.map(function (n) {
          return '<i style="--w:' + (n / max * 100).toFixed(1) + '%"></i>';
        }).join("") + "</span>" +
        '<span class="c-meta">' + c.leagues.length + " tiers · " + countryClubs(c) + " clubs</span></a></li>";
    }).join("");
    var html =
      '<section class="intro" aria-labelledby="intro-h">' +
      '<p class="eyebrow">Europe · ' + esc(countries[0].season) + "</p>" +
      '<h1 id="intro-h">Europe’s top five leagues, with every tier below them.</h1>' +
      '<p class="lede">The Premier League, La Liga, Bundesliga, Ligue 1 and Serie A on one page. Open a country to see its whole pyramid, from the top flight down.</p>' +
      stampHTML(live ? "live" : "snapshot", newest) +
      '<ul class="countries" aria-label="Country pyramids">' + cards + "</ul></section>";
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
    countryMain: countryMain, homeMain: homeMain
  };
});
