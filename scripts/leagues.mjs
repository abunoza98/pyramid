// Football Pyramids: every country and league on the site, in display order.
// The updater uses apiId to fetch tables; the page builder uses the rest.
// Zones and notes are checked by hand each summer, because formats change (e.g. Ligue 3 arrived in 2026–27).

export const SITE = "https://footballpyramids.com";

// Shown on the About & contact and Privacy pages.
// operator: leave empty to keep the company name off the site, or set e.g. "Arrow Sport Pty Ltd".
// Ad slots stay hidden until AdSense is approved. Set to true when the ad code goes in.
export const ADS = false;
// Google AdSense publisher ID. The AdSense script loads on every page and ads.txt is written from this.
export const ADSENSE_CLIENT = "ca-pub-3336933659025894";

export const CONTACT = { email: "hello@footballpyramids.com", operator: "Arrow Sport Pty Ltd", based: "Australia" };

const Z = (from, to, kind, label) => ({ from, to, kind, label });
const RESERVES = "Reserve teams can't be promoted to the same division as their first team.";

export const COUNTRIES = [
  {
    country: "england", code: "ENG", name: "England", adjective: "English", apiCountry: "England",
    belowNote: "National League champions and play-off winner come up",
    later: [
      { tier: 5, name: "National League", clubs: 24 },
      { tier: 6, name: "National League North & South", short: "NL North & South", clubs: 48 }
    ],
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
        promotionNote: "1st–3rd and the play-off winner go up", relegationNote: "23rd–24th drop to the National League", notes: [] }
    ]
  },
  {
    country: "spain", code: "ESP", name: "Spain", adjective: "Spanish", apiCountry: "Spain",
    belowNote: "Promoted clubs from Segunda Federación come up",
    leagues: [
      { apiId: 140, id: "la-liga", tier: 1, name: "La Liga", short: "LL", clubs: 20,
        zones: [Z(1, 4, "top", "Champions League"), Z(5, 5, "mid", "Europa League"), Z(6, 6, "mid", "Conference League"), Z(18, 20, "down", "Relegation")],
        relegationNote: "18th–20th drop to Segunda División", notes: [] },
      { apiId: 141, id: "segunda", tier: 2, name: "Segunda División", short: "SD", clubs: 22,
        zones: [Z(1, 2, "top", "Promotion"), Z(3, 6, "mid", "Play-offs"), Z(19, 22, "down", "Relegation")],
        promotionNote: "1st, 2nd and the play-off winner go up", relegationNote: "19th–22nd drop to Primera Federación",
        notes: [RESERVES] },
      { id: "primera-federacion", tier: 3, name: "Primera Federación", short: "PF", clubs: 20,
        groups: [{ apiId: 435, name: "Group 1" }, { apiId: 436, name: "Group 2" }],
        zones: [Z(1, 1, "top", "Promotion"), Z(2, 5, "mid", "Play-offs"), Z(16, 20, "down", "Relegation")],
        promotionNote: "Each group winner goes up, plus two play-off winners",
        relegationNote: "16th–20th in each group drop to Segunda Federación", notes: [] }
    ]
  },
  {
    country: "germany", code: "GER", name: "Germany", adjective: "German", apiCountry: "Germany",
    belowNote: "Regionalliga champions come up, some through a play-off",
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
    country: "france", code: "FRA", name: "France", adjective: "French", apiCountry: "France",
    belowNote: "Promoted clubs from National 1 come up",
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
    country: "italy", code: "ITA", name: "Italy", adjective: "Italian", apiCountry: "Italy",
    belowNote: "Serie D group winners come up",
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
  }
];

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
  "Team Altamura": "Altamura", "Inter U23": "Inter Milan U23"
};

/* ---------- Play-off places in past seasons ----------
   API-Football's old tables don't always mark play-off places (e.g. every Bundesliga season shows 16th as plain
   "Relegation"), so these rules set them for the leagues where we know the format. Years are the season's start
   year (2016 = 2016–17). A year no rule covers means that league had no play-offs that season.
   rel: relegation play-off places (play the team from the tier below); promo: promotion play-off places.
   Leagues not listed here use whatever the API data says. */
export const PLAYOFF_RULES = {
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
