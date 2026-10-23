// Football Pyramids: which season a country is in, and how to write it.
//
// Most countries play August to May: the season is the year it starts (2026 = "2026–27", pages at /2026-27/).
// Countries with `calendar: true` in leagues.mjs (Brazil, Argentina, China, USA…) play within one year:
// the season is that year (2026 = "2026", pages at /2026/).
//
// SEASON=2025 in the environment forces a start year for every country (used for testing and re-runs).

const forced = process.env.SEASON ? Number(process.env.SEASON) : null;

export function seasonFor(country, d = new Date()) {
  if (forced) return forced;
  if (country?.calendar) return d.getUTCFullYear();
  return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

const yy = (y) => String((y + 1) % 100).padStart(2, "0");
export const seasonLabel = (y, country) => (country?.calendar ? String(y) : `${y}–${yy(y)}`);
export const seasonSlug = (y, country) => (country?.calendar ? String(y) : `${y}-${yy(y)}`);
