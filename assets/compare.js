/* Football Pyramids: club journey enhancements and comparison bootstrap.
   - Club pages reconstruct the current league table after each completed round and show a connected season-position line.
   - Comparison pages auto-focus on league position when both clubs stayed in the same division throughout the range.
   The full comparison application lives in compare-base.js. */
(function () {
  "use strict";
  if (!window.FP) return;

  var body = document.querySelector("[data-page]") || document.body;
  var PAGE = body.getAttribute("data-page") || "";
  var COUNTRY = body.getAttribute("data-country") || "";
  var BASE = body.getAttribute("data-base") || "";

  var originalPlot = FP.journeyPlot;
  var originalGeometry = FP.journeyGeometry;
  var activeLeague = "";

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fold(s) {
    var t = String(s || "").toLowerCase();
    try { t = t.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); } catch (e) {}
    return t.replace(/[^a-z0-9]+/g, " ").trim();
  }
  function ord(n) {
    var s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /* ---------- Current-season club journey ---------- */
  function initSeasonJourney() {
    if (PAGE !== "club" || !COUNTRY || !window.fetch) return;
    var crumb = document.querySelector(".crumb-bar[data-league]");
    var heading = document.getElementById("intro-h");
    if (!crumb || !heading) return;

    var leagueId = crumb.getAttribute("data-league");
    var clubName = heading.textContent.trim();
    if (!leagueId || !clubName) return;

    addSeasonJourneyStyles();

    var fixtureUrl = BASE + "data/fixtures/" + COUNTRY + "/" + leagueId + ".json";
    var countryUrl = BASE + "data/" + COUNTRY + ".json";
    Promise.all([
      fetch(fixtureUrl).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }),
      fetch(countryUrl).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    ]).then(function (res) {
      var fx = res[0], country = res[1];
      if (!fx || fx.cup) return;

      var league = country && (country.leagues || []).filter(function (l) { return l.id === leagueId; })[0];
      var data = buildSeasonJourney(fx, league, clubName);
      if (!data || data.points.length < 2) return;

      var sectionHTML = seasonJourneyHTML(data, clubName, fx.season || (country && country.season) || "");
      function ensure() {
        if (document.getElementById("season-journey")) return;
        var historical = document.getElementById("journey");
        if (!historical || !historical.parentNode) return;
        historical.insertAdjacentHTML("beforebegin", sectionHTML);
        // On a narrow screen the chart scrolls sideways: open it on the latest round, not round 1.
        var sc = document.querySelector("#season-journey .sj-scroll");
        if (sc && sc.scrollWidth > sc.clientWidth) sc.scrollLeft = sc.scrollWidth;
      }
      ensure();

      var main = document.getElementById("main-content");
      if (main && window.MutationObserver) {
        new MutationObserver(function () { ensure(); }).observe(main, { childList: true });
      }
    }).catch(function () {});
  }

  function rowsOf(league) {
    if (!league) return [];
    if (league.groups && league.groups.length) {
      return league.groups.reduce(function (all, g) { return all.concat(g.rows || []); }, []);
    }
    return league.rows || [];
  }

  function buildSeasonJourney(fx, league, clubName) {
    var groups = fx.groups || [];
    if (!groups.length) return null;

    var currentRows = rowsOf(league);
    var clubRows = currentRows.filter(function (r) { return fold(r.team) === fold(clubName); });
    var clubRow = clubRows[0] || null;
    var clubId = clubRow && clubRow.tid != null ? Number(clubRow.tid) : null;
    var DONE = { FT: 1, AET: 1, PEN: 1, AWD: 1, WO: 1 };
    var OFF = { PST: 1, CANC: 1, ABD: 1, TBD: 1 };

    var isClub = function (t) {
      return !!t && ((clubId != null && t.id != null && Number(t.id) === clubId) || fold(t.n) === fold(clubName));
    };
    var groupScore = function (g) {
      var hits = 0, teams = {};
      (g.rounds || []).forEach(function (r) {
        (r.fixtures || []).forEach(function (f) {
          if (isClub(f.h) || isClub(f.a)) hits++;
          if (f.h) teams["t" + (f.h.id != null ? f.h.id : fold(f.h.n))] = 1;
          if (f.a) teams["t" + (f.a.id != null ? f.a.id : fold(f.a.n))] = 1;
        });
      });
      return { hits: hits, teams: Object.keys(teams).length };
    };
    var candidates = groups.map(function (g) { return { g: g, s: groupScore(g) }; })
      .filter(function (x) { return x.s.hits; })
      .sort(function (a, b) { return b.s.hits - a.s.hits || b.s.teams - a.s.teams; });
    if (!candidates.length) return null;

    var group = candidates[0].g;
    // League rounds only: finals series and play-offs saved with the league (the state NPLs, the EFL play-offs) are not
    // part of the table.
    var KO = /final|play-?off|eliminat|knock-?out|quarter|semi|qualif/i;
    var rounds = (group.rounds || []).filter(function (r) { return !KO.test(r.key || r.label || ""); });

    // A league played in stages (Argentina's Apertura then Clausura, Brazil's first stage then second-stage groups)
    // has a table per stage: follow the stage, and the table row, whose games match. Ties go to the later stage.
    var stageOf = function (r) { return String(r.key || r.label || "").replace(/\s*-\s*\d+$/, "").trim().toLowerCase(); };
    var clubGames = function (list) {
      var n = 0;
      list.forEach(function (r) { (r.fixtures || []).forEach(function (f) { if (DONE[f.st] && f.hg != null && (isClub(f.h) || isClub(f.a))) n++; }); });
      return n;
    };
    var options = [rounds], stageNames = [];
    rounds.forEach(function (r) { var st = stageOf(r); if (stageNames.indexOf(st) < 0) stageNames.push(st); });
    if (stageNames.length > 1) stageNames.forEach(function (st) { options.push(rounds.filter(function (r) { return stageOf(r) === st; })); });
    if (clubRows.length) {
      var best = null;
      options.forEach(function (opt, oi) {
        var games = clubGames(opt);
        clubRows.forEach(function (cr) {
          var gap = cr.p != null ? Math.abs(Number(cr.p) - games) : 0;
          if (!best || gap < best.gap || (gap === best.gap && oi > best.oi)) best = { gap: gap, oi: oi, row: cr, rounds: opt };
        });
      });
      rounds = best.rounds;
      clubRow = best.row;
    }
    // Rank the club among the clubs in its own table (its zone or group), where the league is split.
    var tableRows = currentRows;
    if (league && league.groups && league.groups.length && clubRow) {
      var home = league.groups.filter(function (g) { return (g.rows || []).indexOf(clubRow) > -1; })[0];
      if (home) tableRows = home.rows || [];
    }
    var inTable = {};
    tableRows.forEach(function (r) { inTable[r.tid != null ? "i" + Number(r.tid) : "n" + fold(r.team)] = 1; inTable["n" + fold(r.team)] = 1; });
    var split = tableRows !== currentRows || stageNames.length > 1;

    var team = {};
    var deductions = {};
    tableRows.forEach(function (r) {
      var k = r.tid != null ? "i" + Number(r.tid) : "n" + fold(r.team);
      deductions[k] = Number(r.ded) || 0;
    });
    function key(t) { return t && t.id != null ? "i" + Number(t.id) : "n" + fold(t && t.n); }
    function row(t) {
      var k = key(t);
      if (!team[k]) team[k] = { key: k, id: t && t.id, name: (t && t.n) || "", p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: -(deductions[k] || 0) };
      return team[k];
    }

    rounds.forEach(function (r) { (r.fixtures || []).forEach(function (f) { if (f.h) row(f.h); if (f.a) row(f.a); }); });
    var targetKey = clubId != null ? "i" + clubId : null;
    if (!targetKey || !team[targetKey]) {
      Object.keys(team).some(function (k) {
        if (fold(team[k].name) === fold(clubName)) { targetKey = k; return true; }
        return false;
      });
    }
    if (!targetKey || !team[targetKey]) return null;

    var DAY = 86400, WINDOW = 4 * DAY;
    var points = [], prev = null;

    // Every finished game, in kick-off order. A rearranged game counts from the day it is actually played, so a
    // round with a game still to play no longer drops the whole round (it used to: League Two lost rounds 8 and 9).
    var played = [];
    rounds.forEach(function (r) { (r.fixtures || []).forEach(function (f) { if (DONE[f.st] && f.hg != null && f.ag != null) played.push(f); }); });
    played.sort(function (a, b) { return a.ts - b.ts || a.id - b.id; });
    var used = 0;

    function apply(f) {
      var h = row(f.h), a = row(f.a), hg = Number(f.hg), ag = Number(f.ag);
      h.p++; a.p++; h.gf += hg; h.ga += ag; a.gf += ag; a.ga += hg;
      if (hg > ag) { h.w++; a.l++; h.pts += 3; }
      else if (hg < ag) { a.w++; h.l++; a.pts += 3; }
      else { h.d++; a.d++; h.pts++; a.pts++; }
    }
    function upTo(ts) { while (used < played.length && played[used].ts <= ts) apply(played[used++]); }
    function ranking() {
      return Object.keys(team).map(function (k) { return team[k]; }).filter(function (t) {
        return !split || t.key === targetKey || inTable[t.key] || inTable["n" + fold(t.name)];
      }).sort(function (a, b) {
        return b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf || b.w - a.w || a.name.localeCompare(b.name);
      });
    }
    function mineIn(list) {
      var mine = list.filter(function (f) { return DONE[f.st] && f.hg != null && (key(f.h) === targetKey || key(f.a) === targetKey); });
      return mine.length ? mine.map(function (f) { return f.h.n + " " + f.hg + "–" + f.ag + " " + f.a.n; }).join(" · ") : "";
    }
    function push(label, short, list) {
      var ranked = ranking(), pos = ranked.findIndex(function (x) { return x.key === targetKey; }) + 1;
      var me = team[targetKey];
      points.push({
        label: label, short: short, pos: pos, of: ranked.length, pts: me.pts, gd: me.gf - me.ga,
        result: mineIn(list) || "No league match this round", move: prev == null ? 0 : prev - pos
      });
      prev = pos;
    }

    // Checkpoints: the end of each round, taken from the games played on the round's own dates (within four days
    // of its middle kick-off). Leagues whose "round" is the whole season (USL's group stage) use the club's own
    // match days instead.
    var spread = function (r) {
      var ts = (r.fixtures || []).filter(function (f) { return !OFF[f.st]; }).map(function (f) { return f.ts; });
      return ts.length ? Math.max.apply(null, ts) - Math.min.apply(null, ts) : 0;
    };
    var seasonLong = rounds.length <= 3 && rounds.some(function (r) { return spread(r) > 28 * DAY; });
    if (seasonLong) {
      played.filter(function (f) { return key(f.h) === targetKey || key(f.a) === targetKey; }).forEach(function (f) {
        upTo(f.ts);
        var d = new Date(f.ts * 1000), label = d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
        push(label, label, [f]);
      });
    } else {
      for (var ri = 0; ri < rounds.length; ri++) {
        var r = rounds[ri], fs = r.fixtures || [];
        var live = fs.filter(function (f) { return !OFF[f.st]; });
        if (!live.length) continue;
        var ts = live.map(function (f) { return f.ts; }).sort(function (a, b) { return a - b; });
        var mid = ts[Math.floor(ts.length / 2)];
        var own = live.filter(function (f) { return Math.abs(f.ts - mid) <= WINDOW; });
        if (!own.every(function (f) { return DONE[f.st]; })) break;   // this round is still being played
        upTo(Math.max.apply(null, own.map(function (f) { return f.ts; })));
        var label = r.label || ("Round " + (ri + 1));
        push(label, String(label).replace(/^Regular Season\s*-\s*/i, "").replace(/^Round\s+/i, ""), fs);
      }
    }

    // The last point always agrees with the table on the page: games played since the last full round (rearranged
    // games, a round under way) are added as "Now", and the position comes from the official table where we have it.
    var official = clubRow && clubRow.pos ? Number(clubRow.pos) : null;
    if (points.length && used < played.length) {
      var later = played.slice(used);
      upTo(Infinity);
      push("Now", "Now", later);
      var last = points[points.length - 1];
      if (!mineIn(later)) {
        // Only other clubs' rearranged games since: worth a point only if they moved this club.
        if (!last.move) points.pop();
        else last.result = "Rearranged games for other clubs since the last full round";
      }
    }
    // Only when the table row is for these same games. If the table counts a different set of games altogether (a
    // league played in stages or zones, ranked here across the whole season) the chart would contradict the table,
    // so it isn't shown. One game apart is just the tables and fixtures updating at different times.
    if (clubRow && clubRow.p != null) {
      var gap = Math.abs(Number(clubRow.p) - team[targetKey].p);
      if (gap > 1) return null;
      if (gap) official = null;
    }
    if (points.length && official) {
      var end = points[points.length - 1], before = points.length > 1 ? points[points.length - 2].pos : null;
      end.pos = official;
      if (clubRow.pts != null) end.pts = Number(clubRow.pts);
      if (clubRow.gf != null && clubRow.ga != null) end.gd = Number(clubRow.gf) - Number(clubRow.ga);
      end.move = before == null ? 0 : before - official;
    }

    if (points.length < 2) return null;
    return {
      points: points,
      league: fx.name || (league && league.name) || "League",
      teamCount: Math.max.apply(null, points.map(function (p) { return p.of; })),
      zones: league && league.zones ? league.zones : []
    };
  }

  function seasonJourneyHTML(data, clubName, season) {
    var pts = data.points, n = pts.length, teams = Math.max(2, data.teamCount);
    var W = 1000, H = 300, X0 = 24, X1 = 976, Y0 = 14, Y1 = 286;
    var xOf = function (i) { return n === 1 ? W / 2 : X0 + i / (n - 1) * (X1 - X0); };
    var yOf = function (pos) { return Y0 + (pos - 1) / (teams - 1) * (Y1 - Y0); };
    var ticks = [1];
    for (var t = 5; t < teams; t += 5) ticks.push(t);
    if (ticks[ticks.length - 1] !== teams) ticks.push(teams);

    var step = (Y1 - Y0) / Math.max(1, teams - 1);
    var zoneRects = (data.zones || []).map(function (z) {
      var from = Math.max(1, Number(z.from) || 1), to = Math.min(teams, Number(z.to) || from);
      var y = Math.max(0, yOf(from) - step / 2), bottom = Math.min(H, yOf(to) + step / 2);
      return '<rect class="sj-zone sj-z-' + esc(z.kind || "mid") + '" x="0" y="' + y.toFixed(1) + '" width="' + W + '" height="' + (bottom - y).toFixed(1) + '"/>';
    }).join("");

    var grid = ticks.map(function (p) {
      return '<line class="sj-grid" x1="0" x2="' + W + '" y1="' + yOf(p).toFixed(1) + '" y2="' + yOf(p).toFixed(1) + '"/>';
    }).join("");
    var poly = pts.map(function (p, i) { return xOf(i).toFixed(1) + "," + yOf(p.pos).toFixed(1); }).join(" ");
    var yLabels = ticks.map(function (p) {
      return '<span style="top:' + (yOf(p) / H * 100).toFixed(2) + '%">' + ord(p) + "</span>";
    }).join("");

    var every = n <= 12 ? 1 : n <= 24 ? 2 : 4;
    var xLabels = pts.map(function (p, i) {
      if (i !== 0 && i !== n - 1 && i % every) return "";
      return '<span style="left:' + (xOf(i) / W * 100).toFixed(2) + '%">' + esc(p.short) + "</span>";
    }).join("");

    var dots = pts.map(function (p, i) {
      var move = p.move > 0 ? "↑ Up " + p.move : p.move < 0 ? "↓ Down " + Math.abs(p.move) : i ? "No change" : "Opening position";
      var gd = p.gd > 0 ? "+" + p.gd : String(p.gd);
      var detail = p.label + ": " + ord(p.pos) + " of " + p.of + ", " + p.pts + " points, goal difference " + gd + ". " + p.result + ". " + move + ".";
      var cls = "sj-point" + (i === 0 ? " first" : i === n - 1 ? " last" : "") + (p.pos <= 4 ? " below" : "");
      return '<button type="button" class="' + cls + '" style="left:' + (xOf(i) / W * 100).toFixed(2) + '%;top:' + (yOf(p.pos) / H * 100).toFixed(2) + '%" aria-label="' + esc(detail) + '">' +
        '<span class="sj-tip"><b>' + esc(p.label) + '</b><strong>' + ord(p.pos) + ' of ' + p.of + '</strong><span>' + p.pts + ' pts · ' + gd + ' GD</span><span>' + esc(p.result) + '</span><em>' + esc(move) + '</em></span></button>';
    }).join("");

    var latest = pts[n - 1];
    var wide = Math.max(540, n * 42);
    var possessive = /s$/i.test(clubName) ? clubName + "’" : clubName + "’s";
    var cap = "Position after each " + data.league + " round. Latest: " + ord(latest.pos) + (latest.label === "Now" ? " in the current table" : " after " + latest.label) + ".";

    return '<section class="cl-sec sj-sec" id="season-journey"><div class="cl-sec-h"><h2>' + esc(possessive) + " " + esc(season) + ' league journey</h2></div>' +
      '<p class="lchart-cap">' + esc(cap) + '</p><div class="sj-scroll"><div class="sj-chart" style="width:' + wide + 'px">' +
      '<div class="sj-y">' + yLabels + '</div><div class="sj-plot"><svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" aria-hidden="true">' +
      zoneRects + grid + '<polyline class="sj-line" points="' + poly + '"/></svg>' + dots + '</div><div class="sj-x">' + xLabels + "</div></div></div>" +
      '<p class="lchart-note">Tap or hover a point for the round result, points and movement. Positions are worked out from the results; rearranged games count from the day they are played, and the latest point matches the table. Tied teams use points, goal difference, goals scored and wins.</p></section>';
  }

  function addSeasonJourneyStyles() {
    if (document.getElementById("season-journey-styles")) return;
    var style = document.createElement("style");
    style.id = "season-journey-styles";
    style.textContent =
      ".sj-sec{margin-top:28px}.sj-scroll{overflow-x:auto;overflow-y:visible;padding:4px 0 12px;-webkit-overflow-scrolling:touch}" +
      ".sj-chart{min-width:540px;display:grid;grid-template-columns:46px minmax(0,1fr);grid-template-rows:300px 30px;position:relative}" +
      ".sj-y{grid-column:1;grid-row:1;position:sticky;left:0;z-index:3;background:var(--paper);color:var(--muted);font:500 11px/1 var(--mono)}" +
      ".sj-y span{position:absolute;right:9px;transform:translateY(-50%);white-space:nowrap}" +
      ".sj-plot{grid-column:2;grid-row:1;position:relative;background:var(--sheet);border-left:1px solid var(--rule-strong);border-bottom:1px solid var(--rule)}" +
      ".sj-plot svg{display:block;width:100%;height:100%;overflow:visible}.sj-grid{stroke:var(--rule);stroke-width:1;vector-effect:non-scaling-stroke}" +
      ".sj-zone{opacity:.075}.sj-z-top{fill:var(--up)}.sj-z-mid{fill:var(--accent)}.sj-z-down{fill:var(--down)}" +
      ".sj-line{fill:none;stroke:var(--accent);stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}" +
      ".sj-point{position:absolute;width:16px;height:16px;padding:0;border:3px solid var(--accent);border-radius:50%;background:var(--sheet);transform:translate(-50%,-50%);cursor:pointer;z-index:2}" +
      ".sj-point:last-of-type{background:var(--accent)}.sj-point:focus-visible{outline:2px solid var(--ink);outline-offset:3px}" +
      ".sj-tip{display:none;position:absolute;left:50%;bottom:22px;transform:translateX(-50%);width:220px;padding:9px 10px;border:1px solid var(--rule-strong);border-radius:8px;background:var(--sheet);color:var(--ink);box-shadow:0 8px 24px rgba(14,20,28,.18);text-align:left;font:400 12px/1.35 var(--body);z-index:5;pointer-events:none}" +
      ".sj-tip b,.sj-tip strong,.sj-tip span,.sj-tip em{display:block}.sj-tip b{font:500 11px/1.2 var(--mono);color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.sj-tip strong{margin:3px 0;font-size:15px}.sj-tip em{margin-top:4px;font-style:normal;color:var(--accent)}" +
      ".sj-point:hover .sj-tip,.sj-point:focus .sj-tip{display:block}.sj-point.below .sj-tip{bottom:auto;top:22px}.sj-point.first .sj-tip{left:-5px;transform:none}.sj-point.last .sj-tip{left:auto;right:-5px;transform:none}" +
      ".sj-x{grid-column:2;grid-row:2;position:relative;color:var(--muted);font:500 10px/1 var(--mono)}.sj-x span{position:absolute;top:9px;transform:translateX(-50%)}" +
      "@media(max-width:599px){.sj-sec{margin-top:22px}.sj-chart{grid-template-columns:40px minmax(0,1fr);grid-template-rows:260px 28px}.sj-y{font-size:10px}.sj-tip{width:190px}.sj-plot{min-height:260px}}";
    document.head.appendChild(style);
  }

  /* ---------- Comparison: same-league auto-focus ---------- */
  function sameLeagueConfig(cfg) {
    activeLeague = "";
    if (!cfg || !cfg.slots || !cfg.slots.length || !cfg.series || cfg.series.length !== 2) return null;

    var a = cfg.series[0].pts || [];
    var b = cfg.series[1].pts || [];
    if (a.length !== cfg.slots.length || b.length !== cfg.slots.length || !a[0] || !b[0]) return null;

    var league = a[0].league;
    var tier = a[0].tier;
    if (!league || !tier) return null;

    var maxSize = 1;
    for (var i = 0; i < cfg.slots.length; i++) {
      var x = a[i], y = b[i];
      if (!x || !y || x.league !== league || y.league !== league || x.tier !== tier || y.tier !== tier) return null;
      maxSize = Math.max(maxSize, x.of || 0, y.of || 0, x.pos || 0, y.pos || 0);
    }

    var sizes = [];
    for (var s = 0; s < tier; s++) sizes.push(s === tier - 1 ? maxSize : 0);

    var slots = cfg.slots.map(function (slot) {
      return Object.assign({}, slot, { sizes: sizes.slice() });
    });
    var series = cfg.series.map(function (ser) {
      return Object.assign({}, ser, {
        pts: ser.pts.map(function (p) {
          return p ? Object.assign({}, p, { rank: p.pos, sizes: sizes.slice() }) : null;
        })
      });
    });

    var ladder = [];
    for (var t = 1; t <= tier; t++) ladder.push({ tier: t, name: "", short: "" });
    var meta = (cfg.ladder || []).filter(function (l) { return l.tier === tier; })[0] || {};
    ladder[tier - 1] = { tier: tier, name: league, short: meta.short || league };

    activeLeague = league;
    return Object.assign({}, cfg, { slots: slots, series: series, ladder: ladder, mode: "rank" });
  }

  FP.journeyPlot = function (cfg) {
    var mapped = sameLeagueConfig(cfg);
    return originalPlot(mapped || cfg);
  };

  FP.journeyGeometry = function (cfg) {
    var mapped = sameLeagueConfig(cfg);
    return originalGeometry(mapped || cfg);
  };

  function enhanceComparisonUI() {
    if (PAGE !== "compare") return;
    var app = document.getElementById("cmp-app");
    if (!app) return;

    var oldNote = app.querySelector(".cmp-auto-league");
    if (!activeLeague) {
      if (oldNote) oldNote.remove();
      return;
    }

    var mode = app.querySelector(".cmp-mode");
    if (mode && mode.getAttribute("data-auto-league") !== activeLeague) {
      mode.setAttribute("data-auto-league", activeLeague);
      mode.setAttribute("aria-label", "Chart view");
      mode.removeAttribute("role");
      mode.innerHTML = '<button type="button" class="on" aria-disabled="true" tabindex="-1" style="cursor:default">League position</button>';
    }

    var chart = app.querySelector(".cmp-chart");
    if (chart && !oldNote) {
      var note = document.createElement("p");
      note.className = "cmp-note cmp-auto-league";
      note.innerHTML = "<strong>" + esc(activeLeague) + " throughout.</strong> Both clubs were in the same division for every season shown, so the chart compares their league finishing positions directly.";
      var plot = chart.querySelector(".lchart");
      if (plot) chart.insertBefore(note, plot);
    }
  }

  if (PAGE === "club") initSeasonJourney();

  var app = document.getElementById("cmp-app");
  if (app && window.MutationObserver) {
    new MutationObserver(function () { enhanceComparisonUI(); }).observe(app, { childList: true, subtree: true });
  }

  var here = document.currentScript && document.currentScript.src ? document.currentScript.src : "";
  var src = here.replace(/compare\.js(?=([?#]|$))/, "compare-base.js");
  var script = document.createElement("script");
  script.src = src || "compare-base.js";
  script.async = false;
  script.onload = enhanceComparisonUI;
  document.head.appendChild(script);
})();
