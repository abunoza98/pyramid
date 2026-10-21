# Football Pyramids

footballpyramids.com: every Premier League and EFL table on one scrolling page, from tier 1 down to tier 4. Other countries to follow.

## What's here

| File | What it does |
| --- | --- |
| `index.html` | The whole site. One page, no build step. Reads `data.json` on load and again every 5 minutes. |
| `data.json` | The tables. Currently a snapshot from 19–20 Oct 2026 (`"mode": "snapshot"`). |
| `scripts/update-standings.mjs` | Pulls fresh tables from API-Football and rewrites `data.json`. Only writes when something changed. |
| `.github/workflows/update-standings.yml` | Runs the updater on GitHub, free: hourly through UK match hours plus once early morning. |
| `test/api-football-sample.json` | A sample API response for testing the updater without a key. |

## Going live (about 30 minutes)

1. **Get a data key.** Sign up at dashboard.api-football.com and copy your key. Start on the free plan (100 requests a day). Read their terms on commercial display before you put ads on the site.
2. **Check your plan covers this season.** Run `API_FOOTBALL_KEY=yourkey node scripts/update-standings.mjs --check`. It shows your plan and quota (free to check), then lists England's leagues for this season with whether standings are available, and confirms IDs 39–42. If it errors saying your plan can't access the season, you need Pro (US$19/month).
3. **Run it once locally.** `API_FOOTBALL_KEY=yourkey node scripts/update-standings.mjs`. Open `index.html` through a local server (for example `npx serve .`) and check the tables. The page will switch from "Sample snapshot" to "Live".
4. **Put the folder in a GitHub repo.** Add the key under Settings → Secrets and variables → Actions as `API_FOOTBALL_KEY`.
5. **Host it.** Connect the repo to Cloudflare Pages or Netlify (no build command, output folder `/`). Every time the updater commits a new `data.json`, the host redeploys. Visitors' pages pick up the change within 5 minutes without reloading.
6. **Add ads.** Replace the three `.ad` placeholder blocks in `index.html` (left rail, right rail, and the one between tiers 2 and 3 on smaller screens) with your ad network's code. Google AdSense needs the site live with real content before it will approve it.

If you would rather run the updater from n8n, use an Execute Command node on a schedule that runs the same script, then push `data.json` to wherever the site is hosted.

## Testing the updater without a key

```
node scripts/update-standings.mjs --fixture test/api-football-sample.json --out /tmp/out.json
```

## Things to know

- **No crests.** API-Football's docs say club logos may need permission from the clubs or leagues to use. The site shows names only.
- **Club names.** API-Football shortens some names ("Wolves", "QPR"). The `NAMES` list in the script maps them to full names. If a club shows up oddly, add it there.
- **Points deductions.** The API has no deduction field, so the script works it out from wins, draws and points, and adds a note under the table.
- **Zones.** Promotion, play-off and relegation places are set in the script, not taken from the API. Check them each summer: the Championship play-offs moved to 3rd–8th for 2026–27.
- **Request budget.** 4 requests per run, 14 runs a day = 56 requests, inside the free plan. API-Football only refreshes standings once an hour, so polling more often wouldn't make the tables any fresher. That also means "live" here is "within about an hour of full time". True in-play tables would mean working them out from the fixtures feed, which updates every 15 seconds; that's a later upgrade and needs a paid plan.
- **Tier 5 next.** Add the National League to `LEAGUES` in the script (API-Football usually lists it as 43). The page adds a new table automatically.
