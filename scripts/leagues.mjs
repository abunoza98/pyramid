// Football Pyramids: every country and league on the site, in display order.
// The updater uses apiId to fetch tables; the page builder uses the rest.
// Zones and notes are checked by hand each summer, because formats change (e.g. Ligue 3 arrived in 2026–27).

export const SITE = "https://footballpyramids.com";

// Shown on the About & contact and Privacy pages.
// operator: leave empty to keep the company name off the site, or set e.g. "Arrow Sport Pty Ltd".
// Ad slots stay hidden until AdSense is approved. Set to true when the ad code goes in.
export const ADS = false;
// Live scores come from a small Cloudflare Worker (worker/live.js). Set to "" to switch live scores off.
export const LIVE_URL = "https://footballpyramids-live.shrill-breeze-e2a5.workers.dev/live.json";
// Google AdSense publisher ID. The AdSense script loads on every page and ads.txt is written from this.
export const ADSENSE_CLIENT = "ca-pub-3336933659025894";

export const CONTACT = { email: "hello@footballpyramids.com", operator: "Arrow Sport Pty Ltd", based: "Australia" };

const Z = (from, to, kind, label) => ({ from, to, kind, label });
const RESERVES = "Reserve teams can't be promoted to the same division as their first team.";

// cups: each country's knockout cups (API-Football league IDs), shown as brackets on /<country>/<cup>/.
// rounds: the API's round names -> the names fans use (its own naming isn't consistent between cups).
// featured: shown in the header and with a table on the home page. Others sit under "More".
export const COUNTRIES = [
  {
    country: "england", featured: true, code: "ENG", name: "England", adjective: "English", apiCountry: "England",
    belowNote: "Champions and play-off winners from step 3 (the Northern Premier, Southern and Isthmian leagues) come up",
    cups: [{ apiId: 45, id: "fa-cup", name: "FA Cup", short: "FAC",
      rounds: { "1st Round Qualifying": "First qualifying round", "2nd Round Qualifying": "Second qualifying round",
        "3rd Round Qualifying": "Third qualifying round", "4th Round Qualifying": "Fourth qualifying round",
        "1/128-finals": "First round", "1/64-finals": "Second round", "1/32-finals": "Third round", "1/16-finals": "Fourth round", "1/8-finals": "Fifth round" } }, { apiId: 48, id: "efl-cup", name: "EFL Cup", short: "EFL",
      rounds: { "Round of 128": "First round", "Round of 64": "Second round", "Round of 32": "Third round", "Round of 16": "Fourth round" } }],
    leagues: [
      { apiId: 39, id: "premier-league", tier: 1, name: "Premier League", short: "PL", clubs: 20,
        zones: [Z(1, 4, "top", "Champions League"), Z(5, 5, "mid", "Europa League"), Z(18, 20, "down", "Relegation")],
        relegationNote: "18th–20th drop to the Championship", notes: [] },
      { apiId: 40, id: "championship", tier: 2, name: "Championship", short: "CH", clubs: 24,
        zones: [Z(1, 2, "top", "Promotion"), Z(3, 8, "mid", "Play-offs"), Z(22, 24, "down", "Relegation")],
        promotionNote: "1st, 2nd and the play-off winner go up", relegationNote: "22nd–24th drop to League One",
        notes: ["Play-offs: 3rd and 4th go straight to the semi-finals; 5th to 8th play eliminators first."] },
      { apiId: 41, id: "league-one", tier: 3, name: "League One", short: "L1", clubs: 24,
        zones: [Z(1, 2, "top", "Promotion"), Z(3, 6, "mid", "Play-offs"), Z(21, 24, "down", "Relegation")],
        promotionNote: "1st, 2nd and the play-off winner go up", relegationNote: "21st–24th drop to League Two", notes: [] },
      { apiId: 42, id: "league-two", tier: 4, name: "League Two", short: "L2", clubs: 24,
        zones: [Z(1, 3, "top", "Promotion"), Z(4, 7, "mid", "Play-offs"), Z(23, 24, "down", "Relegation")],
        promotionNote: "1st–3rd and the play-off winner go up", relegationNote: "23rd–24th drop to the National League", notes: [] },
      { apiId: 43, id: "national-league", tier: 5, name: "National League", short: "NL", clubs: 24, zones: "api",
        promotionNote: "1st and the play-off winner go up", relegationNote: "21st–24th drop to National League North or South",
        notes: ["Play-offs: 2nd and 3rd go straight to the semi-finals; 4th to 7th play quarter-finals first."],
        history: [{ until: 2014, name: "Conference Premier", short: "CONF" }] },
      { id: "national-league-north-south", tier: 6, name: "National League North & South", short: "NL N & S", clubs: 24, zones: "api",
        groups: [{ apiId: 50, name: "North" }, { apiId: 51, name: "South" }],
        promotionNote: "Each division's champion and play-off winner go up",
        relegationNote: "21st–24th in each division drop to step 3",
        notes: ["Play-offs: 2nd and 3rd go straight to the semi-finals; 4th to 7th play quarter-finals first."],
        history: [{ until: 2014, name: "Conference North & South", short: "CONF N & S" }] }
    ]
  },
  {
    country: "spain", featured: true, code: "ESP", name: "Spain", adjective: "Spanish", apiCountry: "Spain",
    belowNote: "Promoted clubs from Segunda Federación come up",
    cups: [{ apiId: 143, id: "copa-del-rey", name: "Copa del Rey", short: "CDR", rounds: { "1/128-finals": "Preliminary round", "Round of 128": "First round", "Round of 64": "Second round" } }],
    leagues: [
      { apiId: 140, id: "la-liga", tier: 1, name: "La Liga", short: "LL", clubs: 20,
        zones: [Z(1, 4, "top", "Champions League"), Z(5, 5, "mid", "Europa League"), Z(6, 6, "mid", "Conference League"), Z(18, 20, "down", "Relegation")],
        relegationNote: "18th–20th drop to Segunda División", notes: [] },
      { apiId: 141, id: "segunda", tier: 2, name: "Segunda División", short: "SD", clubs: 22,
        zones: [Z(1, 2, "top", "Promotion"), Z(3, 6, "mid", "Play-offs"), Z(19, 22, "down", "Relegation")],
        promotionNote: "1st, 2nd and the play-off winner go up", relegationNote: "19th–22nd drop to Primera Federación",
        notes: [RESERVES] },
      // Primera Federación started in 2021-22. The API's older seasons under these IDs are the old
      // Segunda B, filed under the wrong years, so past tables start from 2021-22.
      { id: "primera-federacion", tier: 3, name: "Primera Federación", short: "PF", clubs: 20, historyFrom: 2021,
        groups: [{ apiId: 435, name: "Group 1" }, { apiId: 436, name: "Group 2" }],
        zones: [Z(1, 1, "top", "Promotion"), Z(2, 5, "mid", "Play-offs"), Z(16, 20, "down", "Relegation")],
        promotionNote: "Each group winner goes up, plus two play-off winners",
        relegationNote: "16th–20th in each group drop to Segunda Federación", notes: [] }
    ]
  },
  {
    country: "germany", featured: true, code: "GER", name: "Germany", adjective: "German", apiCountry: "Germany",
    belowNote: "Regionalliga champions come up, some through a play-off",
    cups: [{ apiId: 81, id: "dfb-pokal", name: "DFB-Pokal", short: "DFB", rounds: { "Round of 64": "First round", "Round of 32": "Second round" } }],
    leagues: [
      { apiId: 78, id: "bundesliga", tier: 1, name: "Bundesliga", short: "BL", clubs: 18,
        zones: [Z(1, 4, "top", "Champions League"), Z(5, 5, "mid", "Europa League"), Z(6, 6, "mid", "Conference League"),
                Z(16, 16, "down", "Relegation play-off"), Z(17, 18, "down", "Relegation")],
        relegationNote: "17th–18th drop to 2. Bundesliga; 16th plays a relegation play-off", notes: [] },
      { apiId: 79, id: "2-bundesliga", tier: 2, name: "2. Bundesliga", short: "2BL", clubs: 18,
        zones: [Z(1, 2, "top", "Promotion"), Z(3, 3, "mid", "Promotion play-off"), Z(16, 16, "down", "Relegation play-off"), Z(17, 18, "down", "Relegation")],
        promotionNote: "1st and 2nd go up; 3rd plays the Bundesliga's 16th",
        relegationNote: "17th–18th drop to 3. Liga; 16th plays a relegation play-off", notes: [] },
      { apiId: 80, id: "3-liga", tier: 3, name: "3. Liga", short: "3L", clubs: 20,
        zones: [Z(1, 2, "top", "Promotion"), Z(3, 3, "mid", "Promotion play-off"), Z(17, 20, "down", "Relegation")],
        promotionNote: "1st and 2nd go up; 3rd plays 2. Bundesliga's 16th",
        relegationNote: "17th–20th drop to the Regionalliga", notes: [RESERVES] }
    ]
  },
  {
    country: "france", featured: true, code: "FRA", name: "France", adjective: "French", apiCountry: "France",
    belowNote: "Promoted clubs from National 1 come up",
    // The Coupe de la Ligue ended in 2020: past seasons only (`until` is its last season's start year).
    cups: [{ apiId: 66, id: "coupe-de-france", name: "Coupe de France", short: "CDF" },
      { apiId: 65, id: "coupe-de-la-ligue", name: "Coupe de la Ligue", short: "CDL", until: 2019 }],
    leagues: [
      { apiId: 61, id: "ligue-1", tier: 1, name: "Ligue 1", short: "L1", clubs: 18,
        zones: [Z(1, 3, "top", "Champions League"), Z(4, 4, "top", "Champions League qualifiers"), Z(5, 5, "mid", "Europa League"),
                Z(6, 6, "mid", "Conference League"), Z(16, 16, "down", "Relegation play-off"), Z(17, 18, "down", "Relegation")],
        relegationNote: "17th–18th drop to Ligue 2; 16th plays a relegation play-off", notes: [] },
      { apiId: 62, id: "ligue-2", tier: 2, name: "Ligue 2", short: "L2", clubs: 18,
        zones: [Z(1, 2, "top", "Promotion"), Z(3, 5, "mid", "Play-offs"), Z(16, 16, "down", "Relegation play-off"), Z(17, 18, "down", "Relegation")],
        promotionNote: "1st and 2nd go up; the play-off winner (3rd–5th) plays Ligue 1's 16th",
        relegationNote: "17th–18th drop to Ligue 3; 16th plays a relegation play-off", notes: [] },
      // Ligue 3 is new for 2026–27 (API-Football ID 63, confirmed October 2026).
      { apiId: 63, id: "ligue-3", tier: 3, name: "Ligue 3", short: "L3", clubs: 18,
        zones: [Z(1, 2, "top", "Promotion"), Z(3, 6, "mid", "Play-offs"), Z(16, 18, "down", "Relegation")],
        promotionNote: "1st and 2nd go up; the play-off winner (3rd–6th) plays Ligue 2's 16th",
        relegationNote: "16th–18th drop to National 1",
        history: [{ until: 2025, name: "Championnat National", short: "NAT" }],
        notes: ["Ligue 3 replaced the Championnat National as France's third tier this season."] }
    ]
  },
  {
    country: "italy", featured: true, code: "ITA", name: "Italy", adjective: "Italian", apiCountry: "Italy",
    belowNote: "Serie D group winners come up",
    cups: [{ apiId: 137, id: "coppa-italia", name: "Coppa Italia", short: "CI" }],
    leagues: [
      { apiId: 135, id: "serie-a", tier: 1, name: "Serie A", short: "SA", clubs: 20,
        zones: [Z(1, 4, "top", "Champions League"), Z(5, 5, "mid", "Europa League"), Z(6, 6, "mid", "Conference League"), Z(18, 20, "down", "Relegation")],
        relegationNote: "18th–20th drop to Serie B", notes: [] },
      { apiId: 136, id: "serie-b", tier: 2, name: "Serie B", short: "SB", clubs: 20,
        zones: [Z(1, 2, "top", "Promotion"), Z(3, 8, "mid", "Play-offs"), Z(16, 17, "down", "Play-out"), Z(18, 20, "down", "Relegation")],
        promotionNote: "1st, 2nd and the play-off winner go up",
        relegationNote: "18th–20th drop to Serie C; 16th and 17th play a play-out",
        notes: ["Play-offs: 3rd and 4th go straight to the semi-finals; 5th to 8th play a preliminary round first."] },
      { id: "serie-c", tier: 3, name: "Serie C", short: "SC", clubs: 20,
        groups: [{ apiId: 138, name: "Girone A" }, { apiId: 942, name: "Girone B" }, { apiId: 943, name: "Girone C" }],
        zones: [Z(1, 1, "top", "Promotion"), Z(2, 10, "mid", "Play-offs"), Z(17, 18, "down", "Play-out"), Z(19, 20, "down", "Relegation")],
        promotionNote: "Each group winner goes up, plus one play-off winner",
        relegationNote: "19th–20th in each group drop to Serie D; 17th and 18th play a play-out", notes: [],
        history: [{ until: 2016, name: "Lega Pro", short: "LP" }] }
    ]
  },
  // ---------- More pyramids (added October 2026). zones: "api" takes the places from API-Football's own labels. ----------
  {
    country: "belgium", code: "BEL", name: "Belgium", adjective: "Belgian", apiCountry: "Belgium",
    belowNote: "The top amateur clubs come up",
    cups: [{ apiId: 147, id: "belgian-cup", name: "Belgian Cup", short: "BC" }],
    leagues: [
      { apiId: 144, id: "pro-league", tier: 1, name: "Pro League", short: "JPL", clubs: 18, zones: "api",
        relegationNote: "17th–18th drop to the Challenger Pro League", notes: [],
        history: [{ until: 2021, name: "First Division A", short: "D1A" }] },
      { apiId: 145, id: "challenger-pro-league", tier: 2, name: "Challenger Pro League", short: "CPL", clubs: 15, zones: "api",
        promotionNote: "1st goes up; 2nd–5th go into the promotion play-offs",
        relegationNote: "14th–15th drop to the amateur divisions",
        notes: ["Reserve (II) teams can't be promoted to the Pro League."],
        history: [{ until: 2021, name: "First Division B", short: "D1B" }] }
    ]
  },
  {
    country: "croatia", code: "CRO", name: "Croatia", adjective: "Croatian", apiCountry: "Croatia",
    belowNote: "Treća NL champions come up",
    cups: [{ apiId: 212, id: "croatian-cup", name: "Croatian Cup", short: "HNK" }],
    leagues: [
      { apiId: 210, id: "hnl", tier: 1, name: "HNL", short: "HNL", clubs: 10, zones: "api",
        relegationNote: "10th drops to the Prva NL",
        notes: ["Ten clubs play each other four times."],
        history: [{ until: 2021, name: "Prva HNL", short: "1HNL" }] },
      { apiId: 211, id: "prva-nl", tier: 2, name: "Prva NL", short: "1NL", clubs: 16, zones: "api",
        promotionNote: "1st goes up", relegationNote: "16th drops to the Druga NL",
        notes: ["Reserve sides can't be promoted to the HNL."],
        history: [{ until: 2021, name: "Druga HNL", short: "2HNL" }] },
      { apiId: 946, id: "druga-nl", tier: 3, name: "Druga NL", short: "2NL", clubs: 16, zones: "api",
        promotionNote: "1st goes up", relegationNote: "16th drops to the Treća NL", notes: [] }
    ]
  },
  {
    country: "netherlands", code: "NED", name: "Netherlands", adjective: "Dutch", apiCountry: "Netherlands",
    belowNote: "The top Derde Divisie clubs come up",
    cups: [{ apiId: 90, id: "knvb-beker", name: "KNVB Beker", short: "KNVB" }],
    leagues: [
      { apiId: 88, id: "eredivisie", tier: 1, name: "Eredivisie", short: "ERE", clubs: 18, zones: "api",
        relegationNote: "17th–18th drop to the Eerste Divisie; 16th goes into the play-offs", notes: [] },
      { apiId: 89, id: "eerste-divisie", tier: 2, name: "Eerste Divisie", short: "EED", clubs: 20, zones: "api", single: true,
        promotionNote: "1st and 2nd go up; the play-off winner joins them",
        notes: ["Jong teams (reserve sides) can't be promoted.",
                "Play-off places include the winners of the season's four periods, so they can shift."] },
      { apiId: 492, id: "tweede-divisie", tier: 3, name: "Tweede Divisie", short: "TWD", clubs: 18, zones: "api",
        relegationNote: "18th drops to the Derde Divisie; 16th and 17th play relegation play-offs", notes: [] }
    ]
  },
  {
    country: "portugal", code: "POR", name: "Portugal", adjective: "Portuguese", apiCountry: "Portugal",
    belowNote: "Liga 3's top clubs come up, one through a play-off",
    cups: [{ apiId: 96, id: "taca-de-portugal", name: "Taça de Portugal", short: "TP", rounds: { "1/128-finals": "First round", "Round of 128": "Second round", "Round of 64": "Third round" } }],
    leagues: [
      { apiId: 94, id: "liga-portugal", tier: 1, name: "Liga Portugal", short: "LP", clubs: 18, zones: "api",
        relegationNote: "17th–18th drop to Liga Portugal 2; 16th plays Liga Portugal 2's 3rd", notes: [] },
      { apiId: 95, id: "liga-portugal-2", tier: 2, name: "Liga Portugal 2", short: "LP2", clubs: 18, zones: "api",
        promotionNote: "1st and 2nd go up; 3rd plays Liga Portugal's 16th",
        relegationNote: "17th–18th drop to Liga 3; 16th plays a relegation play-off",
        notes: [RESERVES] }
    ]
  },
  {
    country: "scotland", code: "SCO", name: "Scotland", adjective: "Scottish", apiCountry: "Scotland",
    belowNote: "The Highland/Lowland League play-off winner can come up",
    cups: [{ apiId: 181, id: "scottish-cup", name: "Scottish Cup", short: "SC",
      rounds: { "1st Round": "First round", "Round of 128": "Second round", "Round of 64": "Third round", "Round of 32": "Fourth round", "Round of 16": "Fifth round" } }, { apiId: 185, id: "scottish-league-cup", name: "Scottish League Cup", short: "SLC", rounds: { "Group Stage": "Group stage" } }],
    leagues: [
      { apiId: 179, id: "premiership", tier: 1, name: "Premiership", short: "PREM", clubs: 12, split: 6,
        zones: [Z(11, 11, "down", "Relegation play-off"), Z(12, 12, "down", "Relegation")],
        relegationNote: "12th drops to the Championship; 11th plays the Championship play-off winner",
        notes: ["After 33 games the league splits into a top six and a bottom six for the last five rounds."] },
      { apiId: 180, id: "scottish-championship", tier: 2, name: "Championship", short: "CH", clubs: 10,
        zones: [Z(1, 1, "top", "Promotion"), Z(2, 4, "mid", "Play-offs"), Z(9, 9, "down", "Relegation play-off"), Z(10, 10, "down", "Relegation")],
        promotionNote: "1st goes up; 2nd–4th play off for a final against the Premiership's 11th",
        relegationNote: "10th drops to League One; 9th plays in League One's play-offs", notes: [] },
      { apiId: 183, id: "scottish-league-one", tier: 3, name: "League One", short: "L1", clubs: 10,
        zones: [Z(1, 1, "top", "Promotion"), Z(2, 4, "mid", "Play-offs"), Z(9, 9, "down", "Relegation play-off"), Z(10, 10, "down", "Relegation")],
        promotionNote: "1st goes up; 2nd–4th play off with the Championship's 9th",
        relegationNote: "10th drops to League Two; 9th plays in League Two's play-offs", notes: [] },
      { apiId: 184, id: "scottish-league-two", tier: 4, name: "League Two", short: "L2", clubs: 10,
        zones: [Z(1, 1, "top", "Promotion"), Z(2, 4, "mid", "Play-offs"), Z(10, 10, "down", "Relegation play-off")],
        promotionNote: "1st goes up; 2nd–4th play off with League One's 9th",
        relegationNote: "10th plays the Highland/Lowland League play-off winner", notes: [] }
    ]
  },
  {
    country: "turkey", code: "TUR", name: "Turkey", adjective: "Turkish", apiCountry: "Turkey",
    belowNote: "Regional amateur league champions come up",
    cups: [{ apiId: 206, id: "turkish-cup", name: "Turkish Cup", short: "TC" }],
    leagues: [
      { apiId: 203, id: "super-lig", tier: 1, name: "Süper Lig", short: "SL", clubs: 18, zones: "api",
        relegationNote: "16th–18th drop to the 1. Lig", notes: [] },
      { apiId: 204, id: "1-lig", tier: 2, name: "1. Lig", short: "1L", clubs: 20, zones: "api",
        promotionNote: "1st and 2nd go up, plus the play-off winner (3rd–7th)",
        relegationNote: "17th–20th drop to the 2. Lig",
        notes: ["Play-offs: 3rd goes straight to the final; 4th to 7th play quarter-finals and semi-finals first."] },
      { apiId: 205, id: "2-lig", tier: 3, name: "2. Lig", short: "2L", zones: "api", splitGroups: true,
        promotionNote: "Each group winner goes up, plus each group's play-off winner (2nd–5th)",
        relegationNote: "The bottom clubs in each group drop to the 3. Lig", notes: [] },
      // Before 2018-19 the API names several different 3. Lig clubs "Elazığ Belediyespor SK", so past tables start there.
      { id: "3-lig", tier: 4, name: "3. Lig", short: "3L", clubs: 18, zones: "api", historyFrom: 2018,
        groups: [{ apiId: 552, name: "Group 1" }, { apiId: 553, name: "Group 2" }, { apiId: 554, name: "Group 3" }],
        promotionNote: "The top clubs in each group go up",
        notes: ["API-Football doesn't mark this league's promotion and relegation places yet, so they aren't coloured."] }
    ]
  }
];

// ---------- UEFA club competitions ----------
// Shaped like a country so the same table, live-score and fixtures code works, but it isn't a pyramid:
// it gets its own pages under /europe/. Knockout ties appear once each draw is made.
const LEAGUE_PHASE = [Z(1, 8, "top", "Round of 16"), Z(9, 24, "mid", "Knockout play-offs"), Z(25, 36, "down", "Eliminated")];
export const EUROPE = {
  country: "europe", code: "EUR", name: "Europe", adjective: "European", apiCountry: "World",
  leagues: [
    { apiId: 2, id: "champions-league", tier: 1, name: "Champions League", short: "UCL", clubs: 36, zones: LEAGUE_PHASE, matchdays: 8,
      notes: ["League phase: each club plays eight different opponents, four at home and four away."] },
    { apiId: 3, id: "europa-league", tier: 2, name: "Europa League", short: "UEL", clubs: 36, zones: LEAGUE_PHASE, matchdays: 8,
      notes: ["League phase: each club plays eight different opponents, four at home and four away."] },
    { apiId: 848, id: "conference-league", tier: 3, name: "Conference League", short: "UECL", clubs: 36, zones: LEAGUE_PHASE, matchdays: 6,
      notes: ["League phase: each club plays six different opponents, three at home and three away."] }
  ]
};

// API-Football shortens or anglicises some names. Map them to the names shown on the site.
// After the first live run, check the pages and add any that look odd.
export const NAMES = {
  // England
  "Brighton": "Brighton & Hove Albion", "Bournemouth": "AFC Bournemouth", "Tottenham": "Tottenham Hotspur",
  "Newcastle": "Newcastle United", "Leeds": "Leeds United", "Ipswich": "Ipswich Town", "Coventry": "Coventry City",
  "Wolves": "Wolverhampton Wanderers", "West Ham": "West Ham United", "West Brom": "West Bromwich Albion",
  "QPR": "Queens Park Rangers", "Sheffield Utd": "Sheffield United", "Birmingham": "Birmingham City",
  "Blackburn": "Blackburn Rovers", "Bolton": "Bolton Wanderers", "Cardiff": "Cardiff City", "Charlton": "Charlton Athletic",
  "Derby": "Derby County", "Lincoln": "Lincoln City", "Norwich": "Norwich City", "Preston": "Preston North End",
  "Swansea": "Swansea City", "Huddersfield": "Huddersfield Town", "Bradford": "Bradford City", "Plymouth": "Plymouth Argyle",
  "Leicester": "Leicester City", "Luton": "Luton Town", "Wycombe": "Wycombe Wanderers", "Doncaster": "Doncaster Rovers",
  "MK Dons": "Milton Keynes Dons", "Peterborough": "Peterborough United", "Wigan": "Wigan Athletic",
  "Crewe": "Crewe Alexandra", "Cheltenham": "Cheltenham Town", "Shrewsbury": "Shrewsbury Town",
  "Accrington ST": "Accrington Stanley", "Accrington": "Accrington Stanley", "Tranmere": "Tranmere Rovers",
  "Grimsby": "Grimsby Town", "Colchester": "Colchester United", "Oldham": "Oldham Athletic", "Rotherham": "Rotherham United",
  "Northampton": "Northampton Town", "Carlisle": "Carlisle United", "Forest Green": "Forest Green Rovers",
  "Sutton Utd": "Sutton United", "Cambridge": "Cambridge United", "Harrogate": "Harrogate Town",
  // Spain
  "Atletico Madrid": "Atlético Madrid", "Athletic Club": "Athletic Bilbao", "Alaves": "Alavés", "Malaga": "Málaga",
  "Cadiz": "Cádiz", "Leganes": "Leganés", "Almeria": "Almería", "Cordoba": "Córdoba", "Sporting Gijon": "Sporting Gijón",
  "Deportivo La Coruna": "Deportivo La Coruña", "Real Sociedad II": "Real Sociedad B",
  // Germany
  "Bayern München": "Bayern Munich", "Borussia Monchengladbach": "Borussia Mönchengladbach",
  "1899 Hoffenheim": "TSG Hoffenheim", "FC Koln": "1. FC Köln", "1. FC Koln": "1. FC Köln",
  "Paderborn": "SC Paderborn", "FC Schalke 04": "Schalke 04",
  // France
  "Paris Saint Germain": "Paris Saint-Germain", "Saint Etienne": "Saint-Étienne", "Stade Brestois 29": "Brest",
  "York": "York City",
  // Spain (added after the first live run, October 2026)
  "Granada CF": "Granada", "Celta de Vigo II": "Celta Fortuna", "FC Andorra": "Andorra", "AD Ceuta FC": "Ceuta",
  "Mérida AD": "Mérida", "Athletic Club II": "Bilbao Athletic", "Mirandes": "Mirandés", "Extremadura 1924": "Extremadura",
  "Deportivo La Coruña II": "Deportivo Fabril", "CD Coria": "Coria", "Arenas Getxo": "Arenas", "Real Avilés": "Avilés",
  "Villarreal II": "Villarreal B", "FC Cartagena": "Cartagena", "Alcorcon": "Alcorcón", "Real Madrid II": "Real Madrid Castilla",
  "Gimnastic": "Gimnàstic", "Atlético Madrid II": "Atlético Madrileño", "Europa Fc": "Europa", "Real Jaén": "Jaén", "Real Murcia": "Murcia",
  "Unionistas de Salamanca": "Unionistas",
  // Germany
  "FSV Mainz 05": "Mainz 05", "SC Paderborn 07": "SC Paderborn", "SpVgg Greuther Fürth": "Greuther Fürth",
  "SV Darmstadt 98": "Darmstadt 98", "FC Viktoria Köln": "Viktoria Köln", "FC Saarbrücken": "1. FC Saarbrücken",
  "Hoffenheim II": "TSG Hoffenheim II", "Stuttgart II": "VfB Stuttgart II", "FC Ingolstadt 04": "FC Ingolstadt",
  "SV Wehen": "Wehen Wiesbaden", "Verl": "SC Verl", "SG Sonnenhof Grossaspach": "Sonnenhof Großaspach",
  "SSV Jahn Regensburg": "Jahn Regensburg", "Havelse": "TSV Havelse", "Rot-Weiß Essen": "Rot-Weiss Essen",
  // France
  "Estac Troyes": "Troyes", "RED Star FC 93": "Red Star", "PAU": "Pau", "Clermont Foot": "Clermont",
  "La Roche VF": "La Roche", "Le Puy Foot": "Le Puy", "Fleury 91": "Fleury", "Gobelins": "Paris 13 Atletico",
  "Quevilly": "Quevilly-Rouen", "Thionville Lusitanos": "Thionville", "Orleans": "Orléans", "Bourg-en-bresse 01": "Bourg-Péronnas",
  // Italy
  "Inter": "Inter Milan", "AS Roma": "Roma", "Sudtirol": "Südtirol", "Vicenza Virtus": "Vicenza", "Alcione": "Alcione Milano",
  "Albinoleffe": "AlbinoLeffe", "Desenzano Calvina": "Desenzano", "Juventus U23": "Juventus Next Gen", "Athletic Carpi": "Carpi",
  "PRO Vercelli": "Pro Vercelli", "Guidonia Montecelio 1937": "Guidonia Montecelio", "Atalanta II": "Atalanta U23",
  "Campobasso FC": "Campobasso", "Forli": "Forlì", "SS Monopoli": "Monopoli", "AZ Picerno": "Picerno",
  "Team Altamura": "Altamura", "Inter U23": "Inter Milan U23",
  // England: National League, North and South
  "Southend": "Southend United", "Hartlepool": "Hartlepool United", "Scunthorpe": "Scunthorpe United",
  "Maidstone Utd": "Maidstone United", "Torquay": "Torquay United", "Braintree": "Braintree Town",
  "Maidenhead": "Maidenhead United", "Dover": "Dover Athletic", "Hampton & Richmond": "Hampton & Richmond Borough",
  "Darlington 1883": "Darlington",
  // Belgium
  "Club Brugge KV": "Club Brugge", "Union St. Gilloise": "Union Saint-Gilloise", "KVC Westerlo": "Westerlo",
  "Standard Liege": "Standard Liège", "St. Truiden": "Sint-Truiden", "RAAL La Louvière": "La Louvière",
  "K. Lierse S.K.": "Lierse", "KAA Gent II": "Gent II", "KRC Genk II": "Genk II", "RSC Anderlecht II": "Anderlecht II",
  // Croatia
  "HNK Hajduk Split": "Hajduk Split", "NK Varazdin": "Varaždin", "NK Osijek": "Osijek", "HNK Rijeka": "Rijeka",
  "NK Lokomotiva Zagreb": "Lokomotiva", "NK Slaven Belupo": "Slaven Belupo", "Rudes": "Rudeš", "HNK Gorica": "Gorica",
  "Bsk Bijelo Brdo": "BSK Bijelo Brdo", "HNK Cibalia": "Cibalia", "Kustosija": "Kustošija", "Lucko": "Lučko",
  "Dinamo Zagreb U21": "Dinamo Zagreb II", "Inter Zapresic": "Inter Zaprešić", "Grobničan Čavle": "Grobničan",
  // Netherlands
  "GO Ahead Eagles": "Go Ahead Eagles", "Waalwijk": "RKC Waalwijk", "Roda": "Roda JC", "Jong PSV U21": "Jong PSV",
  "FC OSS": "TOP Oss", "Den Bosch": "FC Den Bosch", "Dordrecht": "FC Dordrecht", "Almere City FC": "Almere City",
  "Ijsselmeervogels": "IJsselmeervogels",
  // Portugal
  "GIL Vicente": "Gil Vicente", "Academico Viseu": "Académico de Viseu", "SC Braga": "Braga", "Famalicao": "Famalicão",
  "Maritimo": "Marítimo", "Estrela": "Estrela da Amadora", "Vitória SC": "Vitória de Guimarães", "Leixoes": "Leixões",
  "Academica": "Académica",
  // Scotland
  "Heart Of Midlothian": "Heart of Midlothian", "ST Johnstone": "St Johnstone", "ST Mirren": "St Mirren",
  "Dundee Utd": "Dundee United", "Partick": "Partick Thistle", "Inverness CT": "Inverness Caledonian Thistle",
  "Ayr Utd": "Ayr United", "Morton": "Greenock Morton", "Airdrie United": "Airdrieonians",
  // Turkey
  "Gençlerbirliği S.K.": "Gençlerbirliği", "Manisa F.K.": "Manisa FK", "Amed": "Amed SK",
  // European competitions
  "Olympiakos Piraeus": "Olympiacos", "Ferencvarosi TC": "Ferencváros", "Plzen": "Viktoria Plzeň", "Sparta Praha": "Sparta Prague",
  "Slavia Praha": "Slavia Prague", "Bodo/Glimt": "Bodø/Glimt", "FK Crvena Zvezda": "Red Star Belgrade", "Lask Linz": "LASK",
  "AEK Athens FC": "AEK Athens", "Lech Poznan": "Lech Poznań", "Jagiellonia": "Jagiellonia Białystok", "Lillestrom": "Lillestrøm",
  "FC Nordsjaelland": "Nordsjælland", "Mjallby AIF": "Mjällby", "FC Midtjylland": "Midtjylland", "Sabah FC": "Sabah",
  "Lincoln Red Imps FC": "Lincoln Red Imps", "Riga": "Riga FC", "FK Jablonec": "Jablonec", "FC Thun": "Thun",
  "FC Lugano": "Lugano", "Aarhus": "AGF", "Kauno Žalgiris": "Kauno Žalgiris", "Tromso": "Tromsø"
};

/* ---------- Play-off places in past seasons ----------
   API-Football's old tables don't always mark play-off places (e.g. every Bundesliga season shows 16th as plain
   "Relegation"), so these rules set them for the leagues where we know the format. Years are the season's start
   year (2016 = 2016–17). A year no rule covers means that league had no play-offs that season.
   rel: relegation play-off places (play the team from the tier below); promo: promotion play-off places.
   Leagues not listed here use whatever the API data says. */
export const PLAYOFF_RULES = {
  // England: unchanged since the 2000s. The API marks all six of League One 2025–26 as "Promotion".
  "championship": [{ from: 2000, promo: [3, 4, 5, 6] }],
  "league-one":   [{ from: 2000, promo: [3, 4, 5, 6] }],
  "league-two":   [{ from: 2000, promo: [4, 5, 6, 7] }],
  "segunda":      [{ from: 2010, promo: [3, 4, 5, 6] }],
  "bundesliga":   [{ from: 2008, rel: [16] }],
  "2-bundesliga": [{ from: 2008, promo: [3], rel: [16] }],
  "3-liga":       [{ from: 2008, promo: [3] }],
  "ligue-1": [
    { from: 2016, to: 2018, rel: [18] },   // barrage v Ligue 2 play-off winner
    { from: 2020, to: 2021, rel: [18] },   // 2019–20 was cut short; 2022–23 had four relegated and no barrage
    { from: 2023, rel: [16] }              // 18-club league
  ],
  "ligue-2": [
    { from: 2016, to: 2018, promo: [3, 4, 5] },
    { from: 2020, to: 2021, promo: [3, 4, 5] },
    { from: 2023, promo: [3, 4, 5] }
  ]
};
