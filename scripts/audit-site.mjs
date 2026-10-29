#!/usr/bin/env node
// Audit the generated static site for broken internal URLs and fragments.
// No network calls: it checks only files already present in the build/repository.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] || process.cwd());
const SITE_HOSTS = new Set(["footballpyramids.com", "www.footballpyramids.com"]);
const IGNORE_DIRS = new Set([".git", ".github", "node_modules", "scripts", "worker", ".wrangler"]);
const IGNORE_PREFIXES = ["cdn-cgi/"];

const files = new Set();
const htmlFiles = [];

async function walk(dir, rel = "") {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".") && ent.name !== ".well-known") continue;
    if (ent.isDirectory() && IGNORE_DIRS.has(ent.name)) continue;
    const r = path.posix.join(rel, ent.name);
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) await walk(full, r);
    else if (ent.isFile()) {
      files.add(r);
      if (r.endsWith(".html")) htmlFiles.push(r);
    }
  }
}

const decodeEntities = (s) => String(s || "")
  .replace(/&amp;/g, "&").replace(/&#38;/g, "&")
  .replace(/&quot;/g, '\"').replace(/&#39;/g, "'");

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

function internalUrl(raw, sourceRel) {
  raw = decodeEntities(raw).trim();
  if (!raw || /^(?:mailto:|tel:|javascript:|data:|blob:)/i.test(raw)) return null;
  let u;
  try { u = new URL(raw, `https://footballpyramids.com/${sourceRel}`); } catch { return { invalid: true, raw }; }
  if (!/^https?:$/.test(u.protocol) || !SITE_HOSTS.has(u.hostname.toLowerCase())) return null;
  let rel = safeDecode(u.pathname).replace(/^\/+/, "");
  if (IGNORE_PREFIXES.some((p) => rel.startsWith(p))) return null;
  rel = path.posix.normalize(rel || "index.html");
  if (rel === ".") rel = "index.html";
  return { rel, fragment: safeDecode(u.hash.replace(/^#/, "")), raw };
}

function targetFile(rel) {
  if (rel === "") return "index.html";
  if (files.has(rel)) return rel;
  if (rel.endsWith("/")) return rel + "index.html";
  if (!path.posix.extname(rel)) {
    if (files.has(rel + "/index.html")) return rel + "/index.html";
    if (files.has(rel + ".html")) return rel + ".html";
  }
  return rel;
}

const htmlCache = new Map();
const idsCache = new Map();
async function htmlOf(rel) {
  if (!htmlCache.has(rel)) htmlCache.set(rel, await readFile(path.join(root, rel), "utf8"));
  return htmlCache.get(rel);
}
async function idsOf(rel) {
  if (idsCache.has(rel)) return idsCache.get(rel);
  const html = await htmlOf(rel);
  const ids = new Set();
  const counts = new Map();
  // Fragment targets are IDs, plus the legacy <a name="..."> form. Only real IDs count for duplicate-ID warnings;
  // generic form-field name= attributes are not DOM IDs and can legitimately repeat.
  for (const m of html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)) {
    const id = decodeEntities(m[1]);
    ids.add(id); counts.set(id, (counts.get(id) || 0) + 1);
  }
  for (const m of html.matchAll(/<a\b[^>]*\bname\s*=\s*["']([^"']+)["'][^>]*>/gi)) ids.add(decodeEntities(m[1]));
  // Tabs opened from the address (assets/app.js): "#fixtures" opens a cup or competition page's Fixtures tab, and on
  // pages with data-hashtabs (Australia's nav) "#<tab>" opens that tab. Neither is an element ID, but both work.
  if (/data-tabs="(?:stage|cup)"/.test(html) && /data-tab="fx"/.test(html)) ids.add("fixtures");
  if (/data-hashtabs/.test(html)) for (const m of html.matchAll(/\bdata-tab\s*=\s*["']([^"']+)["']/gi)) ids.add(decodeEntities(m[1]));
  const duplicates = [...counts.entries()].filter(([, n]) => n > 1).map(([id, n]) => ({ id, n }));
  const out = { ids, duplicates };
  idsCache.set(rel, out);
  return out;
}

const failures = new Map();
const warnings = [];
let checked = 0;

function record(kind, target, source, raw) {
  const key = `${kind}\u0000${target}`;
  if (!failures.has(key)) failures.set(key, { kind, target, count: 0, samples: [] });
  const e = failures.get(key); e.count++;
  if (e.samples.length < 3) e.samples.push(`${source} -> ${raw}`);
}

async function checkRef(raw, sourceRel) {
  const ref = internalUrl(raw, sourceRel);
  if (!ref) return;
  checked++;
  if (ref.invalid) { record("invalid URL", raw, sourceRel, raw); return; }
  const target = targetFile(ref.rel);
  if (!files.has(target)) {
    record("missing target", target, sourceRel, raw);
    return;
  }
  if (ref.fragment && target.endsWith(".html")) {
    const { ids } = await idsOf(target);
    if (!ids.has(ref.fragment)) record("missing anchor", `${target}#${ref.fragment}`, sourceRel, raw);
  }
}

await walk(root);

for (const rel of htmlFiles) {
  const html = await htmlOf(rel);
  for (const m of html.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)) await checkRef(m[1], rel);
  const { duplicates } = await idsOf(rel);
  if (duplicates.length) warnings.push(`${rel}: duplicate IDs ${duplicates.map((x) => `${x.id}×${x.n}`).join(", ")}`);
}

// Search results are navigation too: every path/hash should land somewhere valid.
if (files.has("data/search.json")) {
  try {
    const search = JSON.parse(await readFile(path.join(root, "data/search.json"), "utf8"));
    for (const x of search) if (x.path) {
      const raw = `/${x.path}${x.hash ? `#${x.hash}` : ""}`;
      await checkRef(raw, "index.html");
    }
  } catch (err) {
    record("invalid search index", "data/search.json", "data/search.json", err.message);
  }
}

// Sitemap URLs should all correspond to generated pages.
if (files.has("sitemap.xml")) {
  const xml = await readFile(path.join(root, "sitemap.xml"), "utf8");
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/gi)) await checkRef(m[1], "index.html");
}

console.log(`Site audit: ${htmlFiles.length} HTML pages, ${checked} internal references checked.`);
if (warnings.length) {
  console.log(`Warnings (${warnings.length}):`);
  warnings.slice(0, 20).forEach((w) => console.log(`  - ${w}`));
  if (warnings.length > 20) console.log(`  ... ${warnings.length - 20} more`);
}

if (failures.size) {
  console.error(`Broken internal references (${failures.size} unique targets):`);
  for (const e of [...failures.values()].sort((a, b) => b.count - a.count || a.target.localeCompare(b.target))) {
    console.error(`  [${e.kind}] ${e.target} (${e.count} occurrence${e.count === 1 ? "" : "s"})`);
    e.samples.forEach((s) => console.error(`    ${s}`));
  }
  process.exitCode = 1;
} else {
  console.log("No broken internal targets or anchors found.");
}
