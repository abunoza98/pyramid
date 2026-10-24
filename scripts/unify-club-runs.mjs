// Merge the post-built Europe chart into the existing domestic cup-run selector.
// This runs after add-club-europe.mjs and only rewrites generated club HTML.
import { readFile, writeFile } from "node:fs/promises";

function elementBounds(html, start, tag) {
  const openEnd = html.indexOf(">", start);
  if (openEnd < 0) return null;
  const re = new RegExp(`<${tag}\\b|<\\/${tag}>`, "gi");
  re.lastIndex = openEnd + 1;
  let depth = 1, m;
  while ((m = re.exec(html))) {
    if (m[0][1] === "/") depth--;
    else depth++;
    if (!depth) return { start, openEnd, closeStart: m.index, end: re.lastIndex };
  }
  return null;
}

function findSection(html, test) {
  const re = /<section\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const b = elementBounds(html, m.index, "section");
    if (!b) continue;
    const section = html.slice(b.start, b.end);
    if (test(section)) return { ...b, html: section };
    re.lastIndex = b.end;
  }
  return null;
}

function panelInner(section, panel) {
  const at = section.indexOf(`data-panel="${panel}"`);
  if (at < 0) return "";
  const start = section.lastIndexOf("<div", at);
  if (start < 0) return "";
  const b = elementBounds(section, start, "div");
  return b ? section.slice(b.openEnd + 1, b.closeStart) : "";
}

function compactEurope(europe) {
  return europe.replace(
    /<div class="cr-h"><div><h3>Europe<\/h3><p>([\s\S]*?)<\/p><\/div><\/div>/,
    '<p class="cup-note">$1</p>'
  );
}

function removePreviousEurope(section) {
  section = section.replace(/<button\b[^>]*data-europe-run-tab[^>]*>[\s\S]*?<\/button>/g, "");
  section = section.replace(/<!-- europe-run-panel:start -->[\s\S]*?<!-- europe-run-panel:end -->/g, "");
  return section;
}

function ensureSectionAttrs(section) {
  return section.replace(/^<section\b([^>]*)>/, (all, attrs) => {
    let a = attrs;
    if (/\bdata-tabs=/.test(a)) a = a.replace(/\bdata-tabs="[^"]*"/, 'data-tabs="cup-runs"');
    else a += ' data-tabs="cup-runs"';
    if (!/\bdata-europe-unified\b/.test(a)) a += " data-europe-unified";
    return `<section${a}>`;
  });
}

function addEuropeToCupSection(section, europe) {
  section = removePreviousEurope(section);
  section = ensureSectionAttrs(section);
  section = section.replace(/<h2>(?:Cup runs|Runs)<\/h2>/, "<h2>Runs</h2>");

  const tabStart = section.search(/<div\b[^>]*class="[^"]*\btf-tabs\b[^"]*"[^>]*>/i);
  if (tabStart >= 0) {
    const tabs = elementBounds(section, tabStart, "div");
    if (!tabs) return section;
    let open = section.slice(tabs.start, tabs.openEnd + 1).replace('aria-label="Cups"', 'aria-label="Run history"');
    const beforeTabs = section.slice(0, tabs.start);
    const tabBody = section.slice(tabs.openEnd + 1, tabs.closeStart);
    const afterTabs = section.slice(tabs.end);
    const euroButton = '<button type="button" role="tab" class="tf-tab" data-tab="europe" data-europe-run-tab aria-selected="false">Europe</button>';
    section = beforeTabs + open + tabBody + euroButton + "</div>" + afterTabs;
  } else {
    const nameMatch = section.match(/<h3>(?:<a\b[^>]*>)?([^<]+)(?:<\/a>)?<\/h3>/i);
    const name = nameMatch ? nameMatch[1] : "Cup";
    section = section.replace(/<div class="cr">/, '<div class="cr tf-panel on" data-panel="domestic-cup" role="tabpanel">');
    const headEnd = section.indexOf("</div>", section.indexOf("<h2>Runs</h2>"));
    if (headEnd >= 0) {
      const tabs = '<div class="tf-tabs cl-tabs" role="tablist" aria-label="Run history">' +
        '<button type="button" role="tab" class="tf-tab on" data-tab="domestic-cup" aria-selected="true">' + name + '</button>' +
        '<button type="button" role="tab" class="tf-tab" data-tab="europe" data-europe-run-tab aria-selected="false">Europe</button></div>';
      section = section.slice(0, headEnd + 6) + tabs + section.slice(headEnd + 6);
    }
  }

  const close = section.lastIndexOf("</section>");
  if (close < 0) return section;
  const euroPanel = '<!-- europe-run-panel:start --><div class="tf-panel" data-panel="europe" role="tabpanel">' + europe + '</div><!-- europe-run-panel:end -->';
  return section.slice(0, close) + euroPanel + section.slice(close);
}

let search = [];
try { search = JSON.parse(await readFile("data/search.json", "utf8")); } catch {}
const paths = [...new Set(search.filter((x) => x.type === "club" && x.path).map((x) => x.path))];
let changed = 0;

for (const path of paths) {
  const file = `${path}index.html`;
  let html;
  try { html = await readFile(file, "utf8"); } catch { continue; }
  const original = html;

  const europeSection = findSection(html, (s) => /\bcl-runs-sec\b/.test(s) && /data-panel="europe"/.test(s));
  if (!europeSection) continue;
  const europe = compactEurope(panelInner(europeSection.html, "europe"));
  const nestedCups = panelInner(europeSection.html, "cups");
  if (!europe) continue;

  // Remove the temporary Europe-only section produced by add-club-europe.mjs.
  html = html.slice(0, europeSection.start) + html.slice(europeSection.end);

  let target = findSection(html, (s) => /\bdata-europe-unified\b/.test(s));
  if (!target) target = findSection(html, (s) => /<h2>Cup runs<\/h2>/.test(s));

  // If an earlier Europe pass already swallowed the domestic cup section, recover its original body.
  if (!target && nestedCups) {
    const recovered = '<section class="cl-sec"><div class="cl-sec-h"><h2>Cup runs</h2></div>' + nestedCups + '</section>';
    html = html.slice(0, europeSection.start) + recovered + html.slice(europeSection.start);
    target = findSection(html, (s) => /<h2>Cup runs<\/h2>/.test(s));
  }

  if (target) {
    const merged = addEuropeToCupSection(target.html, europe);
    html = html.slice(0, target.start) + merged + html.slice(target.end);
  } else {
    // A club with European history but no covered domestic cup still gets one compact run section.
    const fallback = '<section class="cl-sec" data-europe-unified><div class="cl-sec-h"><h2>Runs</h2></div>' + europe + '</section>';
    html = html.slice(0, europeSection.start) + fallback + html.slice(europeSection.start);
  }

  if (html !== original) {
    await writeFile(file, html);
    changed++;
  }
}

console.log(`Club runs: unified ${changed} generated club pages.`);
