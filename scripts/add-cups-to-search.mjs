// Add current domestic cups to the generated global search index.
// build.mjs owns data/search.json; this small post-build step keeps cup search separate from the page builder.
import { readFile, writeFile } from "node:fs/promises";
import { COUNTRIES } from "./leagues.mjs";

const file = "data/search.json";
const search = JSON.parse(await readFile(file, "utf8"));
const seen = new Set(search.map((x) => [x.type, x.country, x.name, x.path || "", x.hash || ""].join("|")));

const aliases = {
  "england/fa-cup": ["Emirates FA Cup"],
  "england/efl-cup": ["Carabao Cup", "EFL League Cup", "English League Cup"]
};

const add = (x) => {
  const key = [x.type, x.country, x.name, x.path || "", x.hash || ""].join("|");
  if (!seen.has(key)) {
    seen.add(key);
    search.push(x);
  }
};

for (const country of COUNTRIES) {
  for (const cup of country.cups || []) {
    // Historical-only cups have season pages but no current competition landing page.
    if (cup.until) continue;
    const base = {
      type: "competition",
      country: country.country,
      countryName: country.name,
      path: `${country.country}/${cup.id}/`
    };
    // Sponsor and other names are searched (aka) but don't show as separate results.
    const aka = aliases[`${country.country}/${cup.id}`] || [];
    add({ ...base, name: cup.name, short: cup.short || "", ...(aka.length ? { aka } : {}) });
  }
}

search.sort((a, b) => a.name.localeCompare(b.name) || a.countryName.localeCompare(b.countryName));
await writeFile(file, JSON.stringify(search));
console.log(`Search index: ${search.length} entries including current domestic cups.`);
