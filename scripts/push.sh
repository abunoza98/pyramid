#!/bin/bash
# Commit what a GitHub job changed and push it. Someone (another job, or a code change) may have pushed to main
# while the job was running, so it catches up first and tries a few times before giving up.
#
#   bash scripts/push.sh "Update standings"
#
# Where both sides changed the same file (usually a generated page), the job's version wins; the next hourly
# run rebuilds every page anyway.
set -u
msg="$1"

# Club pages can link directly to the adjacent covered tier where the competition rules explicitly connect them.
# This uses only the saved site/config data and makes no football-data API calls.
if [ -f scripts/add-club-routes.mjs ]; then
  node scripts/add-club-routes.mjs
fi

# build.mjs writes the main club/league search index. Add current domestic cups afterwards so every normal
# data-update workflow keeps global search complete without duplicating cup configuration in the browser.
if [ -f data/search.json ] && [ -f scripts/add-cups-to-search.mjs ]; then
  node scripts/add-cups-to-search.mjs
fi

# Club pages are generated from the same saved standings. Add a concise current-season context line after each
# build without making any extra football-data API calls.
if [ -f scripts/add-club-stakes.mjs ]; then
  node scripts/add-club-stakes.mjs
fi

# Add club achievements from saved league/cup history and infer the usual home stadium from venue names already
# present on current league fixtures. This is local post-processing only: no extra football-data API calls.
if [ -f scripts/add-club-profile.mjs ]; then
  node scripts/add-club-profile.mjs
fi

# Add saved Champions League / Europa League / Conference League runs to club pages. No extra API calls.
if [ -f scripts/add-club-europe.mjs ]; then
  node scripts/add-club-europe.mjs
fi

if [ -z "$(git status --porcelain)" ]; then
  echo "No changes."
  exit 0
fi
git config user.name "pyramid-bot"
git config user.email "pyramid-bot@users.noreply.github.com"
git add -A
git commit -q -m "$msg"

branch="$(git rev-parse --abbrev-ref HEAD)"
for try in 1 2 3; do
  if git pull -q --rebase -X theirs origin "$branch" && git push -q origin "HEAD:$branch"; then
    echo "Pushed: $msg"
    exit 0
  fi
  git rebase --abort 2>/dev/null || true
  echo "Push failed (try $try of 3), trying again."
  sleep $((try * 15))
done
echo "Couldn't push after 3 tries."
exit 1
