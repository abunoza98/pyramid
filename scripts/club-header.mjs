#!/usr/bin/env node
// Football Pyramids: the top of each club page, tidied into one summary. Runs last in the build, after the steps that
// add the stadium, honours, pyramid routes and "what's at stake" (each of which used to add its own line or box).
//
//   Fleetwood Town
//   18th in League Two, 14 points from 13 games. Last 5, all competitions: D W L L W
//   What's at stake: 5 pts from play-offs · 2 pts clear of relegation
//   3rd season in a row in League Two · Home ground: Highbury Stadium
//   Honours (only with a title or cup win; promotions alone are in the journey section)
//   Pyramid: League One (tier above) · National League (tier below)
//
// The "Times in …" switch moves to the top of the Fixtures list, where the times are. Safe to run again: it works
// from the pieces wherever they are and puts them back the same way.
//
//   node scripts/club-header.mjs            (run from the site's root, as the build does)

import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = process.cwd();

const cut = (html, re) => {
  const m = html.match(re);
  return m ? [html.replace(m[0], ""), m[0]] : [html, ""];
};

export function tidy(html) {
  if (!/data-page="club"/.test(html)) return html;
  const introRe = /<section class="intro fx-intro" aria-labelledby="intro-h">[\s\S]*?<\/section>/;
  const im = html.match(introRe);
  if (!im || !/<h1 id="intro-h"/.test(im[0])) return html;
  let intro = im[0], rest = html.replace(im[0], "\u0000INTRO\u0000");

  // Undo an earlier run.
  intro = intro.replace(/<div class="cl-sum">([\s\S]*?)<\/div><!--cl-sum-->/, "$1");

  let lede, ctx, honours, tz, stadium, routes, stake;
  [intro, lede] = cut(intro, /<p class="lede">[\s\S]*?<\/p>/);
  [intro, ctx] = cut(intro, /<p class="cl-context">[\s\S]*?<\/p>/);
  [intro, honours] = cut(intro, /<details class="cl-honours">[\s\S]*?<\/details>/);
  [intro, stadium] = cut(intro, /<p class="cup-note cl-stadium">[\s\S]*?<\/p>/);
  [intro, routes] = cut(intro, /<p class="fx-links cl-routes">[\s\S]*?<\/p>/);
  [intro, stake] = cut(intro, /<p class="(?:cup-note club-stakes|cl-stake)"[^>]*>[\s\S]*?<\/p>/);
  [intro, tz] = cut(intro, /<p class="fx-links(?: fx-tz)?">[\s\S]*?<\/p>/);
  if (!stake) [rest, stake] = cut(rest, /<p class="cup-note club-stakes"[^>]*>[\s\S]*?<\/p>/);
  if (!tz) [rest, tz] = cut(rest, /<p class="fx-links fx-tz cl-tz">[\s\S]*?<\/p>/);

  // The header's form counts every competition; the table's form column is league games only. Say which.
  if (lede) lede = lede.replace(/Last 5 matches:/, "Last 5, all competitions:");
  if (stake) stake = stake.replace(/^<p class="cup-note club-stakes"/, '<p class="cl-stake"');
  // Stadium joins the context line ("3rd season in a row in League Two · Home ground: Highbury Stadium").
  const ground = stadium ? stadium.replace(/^<p[^>]*>\s*<strong>Stadium:<\/strong>\s*/, "").replace(/<\/p>$/, "").trim() : "";
  if (ground) {
    const bit = `<span class="cl-ground">Home ground: ${ground}</span>`;
    ctx = ctx ? ctx.replace(/<\/p>$/, `${bit}</p>`) : `<p class="cl-context">${bit}</p>`;
  }
  // Honours only with a title or cup win in it. A club whose only "honour" is a promotion already has it in the
  // journey section ("Since 2012–13: 1 promotion and 1 relegation").
  if (honours && !/🏆/.test(honours.match(/<summary>[\s\S]*?<\/summary>/)?.[0] || "")) honours = "";

  const sum = `<div class="cl-sum">${lede}${stake}${ctx}${honours}${routes}</div><!--cl-sum-->`;
  intro = intro.replace(/(<h1 id="intro-h"[\s\S]*?<\/h1>)/, `$1${sum}`);

  // The time-zone switch: to the top of the Fixtures list (or Results, for a club with no fixtures left).
  if (tz) {
    tz = tz.replace(/^<p class="fx-links(?: fx-tz)?(?: cl-tz)?">/, '<p class="fx-links fx-tz cl-tz">');
    let placed = false;
    for (const h of ["Fixtures", "Results"]) {
      const re = new RegExp(`(<section class="cl-sec"><div class="cl-sec-h"><h2>${h}</h2></div>)`);
      if (re.test(rest)) { rest = rest.replace(re, `$1${tz}`); placed = true; break; }
    }
    if (!placed) intro = intro.replace(/<\/section>$/, `${tz}</section>`);
  }
  return rest.replace("\u0000INTRO\u0000", intro);
}

async function* clubPages(dir) {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    if (!ent.isDirectory() || ent.name.startsWith(".") || ["assets", "data", "scripts", "node_modules", "worker", "test"].includes(ent.name)) continue;
    const club = path.join(dir, ent.name, "club");
    let slugs;
    try { slugs = await readdir(club, { withFileTypes: true }); } catch { continue; }
    for (const s of slugs) if (s.isDirectory()) yield path.join(club, s.name, "index.html");
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  let changed = 0, seen = 0;
  for await (const file of clubPages(root)) {
    let html;
    try { html = await readFile(file, "utf8"); } catch { continue; }
    seen++;
    const out = tidy(html);
    if (out !== html) { await writeFile(file, out); changed++; }
  }
  console.log(`Club headers: ${changed} of ${seen} pages tidied.`);
}
