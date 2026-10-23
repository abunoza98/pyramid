// Football Pyramids: the About & contact page and the privacy policy.
// Edit the wording here, then run `node scripts/build.mjs`.
// When the policy changes, update POLICY_DATE.

export const POLICY_DATE = "23 October 2026";

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function emailLine(email) {
  return `<p class="email-line"><a href="mailto:${esc(email)}">${esc(email)}</a>` +
    `<button type="button" class="copy" data-copy="${esc(email)}">Copy address</button></p>`;
}

// countries: [{ name, first, last, tiers, since }] in site order. europe: competition names, or [].
export function contactPage({ contact, snapshot, countries, europe = [] }) {
  const coverage = countries.map((c) => `<li><strong>${esc(c.name)}:</strong> ${c.tiers} tier${c.tiers === 1 ? "" : "s"}, ${esc(c.first)} down to ${esc(c.last)}` +
    (c.since ? `. Final tables back to ${esc(c.since)}.` : ".") + "</li>").join("\n  ");
  return `<article class="prose" aria-labelledby="page-h">
<p class="eyebrow">About</p>
<h1 id="page-h">Why Football Pyramids exists</h1>
<p class="lede">League tables are usually shown one division at a time. Football Pyramids puts a country's divisions on one page, top flight first, so you can see how they connect: who goes up, who comes down, and where any club sits in the wider pyramid.</p>

<h2>What's covered</h2>
<ul>
  ${coverage}
</ul>
${europe.length ? `<p>Plus the ${esc(europe.slice(0, -1).join(", "))} and ${esc(europe[europe.length - 1])}: tables, brackets and qualifying.</p>` : ""}
<p>Each country goes as deep as we can get reliable data for, so some don't reach as far down as others yet. More tiers and countries will follow. Every club has a page with its fixtures, results and its journey through the pyramid season by season.</p>

<h2>Where the tables come from</h2>
${snapshot
  ? "<p>For now the tables are a sample snapshot gathered by hand, and each table shows the date it is from. Once the live data feed is switched on, they will update through the day as results come in.</p>"
  : `<p>Tables, fixtures and results come from a commercial football data provider.</p>
<ul>
  <li><strong>Standings</strong> are checked hourly through the afternoon and evening (UK time) and once in the morning. Each table says which date it is as of: the last time it changed, so a table can show an older date after a quiet week without anything being wrong.</li>
  <li><strong>Fixtures and kick-off times</strong> are checked every two hours. Postponed, cancelled and "time to be confirmed" games are marked as such, and a moved kick-off shows its old time for three weeks.</li>
  <li><strong>Live scores</strong> update about every minute while games are on, and the tables show how they stand until the official tables catch up.</li>
</ul>`}

<h2>How the tables are worked out</h2>
<ul>
  <li>Positions are as published, which follows each league's own tie-break rules.</li>
  <li>The feed doesn't list points deductions, so we work them out from wins, draws and points and note each one under its table.</li>
  <li>Promotion, play-off and relegation places are set for each league from its competition rules. Where places change from year to year (European spots, for example), they're taken from the data provider's labels instead.</li>
  <li>For past seasons, where the provider's final table stopped short of the last matchday, we rebuilt it from the results where we could; a few are still being checked by hand. Seasons cut short by Covid are shown as they ended.</li>
</ul>

<h2>Spotted a mistake?</h2>
<p>Tell us the league, the club and what looks wrong, and we'll check it against the official record:</p>
${emailLine(contact.email)}

<h2>Contact</h2>
<ul>
  <li><strong>Want another country or tier added?</strong> Let us know which one.</li>
  <li><strong>Advertising and partnerships:</strong> use the same address.</li>
</ul>
<p>We try to reply within a few days.</p>

</article>`;
}

export function privacyPage({ contact }) {
  const who = contact.operator
    ? `Football Pyramids is run by ${esc(contact.operator)}, based in ${esc(contact.based)}.`
    : `Football Pyramids is an independent website run from ${esc(contact.based)}.`;
  return `<article class="prose" aria-labelledby="page-h">
<p class="eyebrow">Privacy</p>
<h1 id="page-h">Privacy policy</h1>
<p class="updated">Last updated ${esc(POLICY_DATE)}</p>

<div class="summary">
<p><strong>The short version.</strong> Football Pyramids doesn't ask for your name, email address or any other details, and there are no accounts. Our web host handles the technical details every website sees. Ads on the site come from Google, which uses cookies, and you can say no to personalised ads.</p>
</div>

<h2>Who runs this site</h2>
<p>${who} For any question about this policy or your data, email:</p>
${emailLine(contact.email)}

<h2>What we collect</h2>
<p>We don't collect personal information directly. There are no sign-ups, comments or forms on the site.</p>

<h2>Hosting</h2>
<p>The site is hosted by Cloudflare. Like any web host, Cloudflare processes your IP address and basic details about your browser when you visit, so it can deliver pages and protect the site from attacks. We don't use these details to identify you. Cloudflare's <a href="https://www.cloudflare.com/privacypolicy/">privacy policy</a> explains how it handles this data. Live scores load from a separate service of ours, also run on Cloudflare (on its workers.dev address).</p>

<h2>What's stored in your browser</h2>
<p>If you use the club finder, the site remembers the club you picked in your browser's local storage, so it's highlighted on your next visit. This stays on your device and is never sent to us. To remove it, clear the club finder with the × button or clear your browser's data for this site.</p>
<p>On fixtures pages, if you switch between times in your own time zone and local kick-off times, that choice is stored the same way.</p>

<h2>Advertising</h2>
<p>Football Pyramids is paid for by advertising, shown through Google AdSense.</p>
<ul>
  <li>Third-party vendors, including Google, use cookies to show ads based on your previous visits to this site and other websites.</li>
  <li>Google's use of advertising cookies lets it and its partners show you ads based on your visits to this site and other sites on the internet.</li>
  <li>You can turn off personalised advertising in Google's <a href="https://adssettings.google.com">Ad Settings</a>. You can also opt out of other vendors' advertising cookies at <a href="https://optout.aboutads.info">aboutads.info</a> or, in Europe, <a href="https://www.youronlinechoices.eu">youronlinechoices.eu</a>.</li>
</ul>
<p>Google explains more in <a href="https://policies.google.com/technologies/partner-sites">how Google uses information from sites that use its services</a>.</p>

<h2>Your choices in the UK, EU and Switzerland</h2>
<p>If you visit from the UK, the EU or Switzerland, you'll see a message asking for your consent before personalised ads are shown. You can accept or refuse, and change your choice at any time with the <strong>Privacy and cookie settings</strong> link at the bottom of every page. If you refuse, you may still see ads, but they won't be based on your browsing.</p>

<h2>Analytics</h2>
<p>We don't run any analytics or tracking scripts of our own. If that changes, we'll update this page first.</p>

<h2>Fonts</h2>
<p>The site's fonts are stored on the site itself, so loading a page doesn't contact any outside font service.</p>

<h2>Children</h2>
<p>The site is for a general audience and isn't aimed at children under 16. We don't knowingly collect information from children.</p>

<h2>Your rights</h2>
<p>Depending on where you live, you may have the right to ask what personal data is held about you, to have it corrected or deleted, or to object to how it's used. Because we don't collect personal information ourselves, most requests will concern Google or Cloudflare. You can contact them directly, or email us and we'll help where we can.</p>
<p>If you're unhappy with how your data is handled, you can complain to the <a href="https://ico.org.uk">Information Commissioner's Office</a> in the UK, your local data protection authority in the EU, or the <a href="https://www.oaic.gov.au">Office of the Australian Information Commissioner</a>.</p>

<h2>Changes to this policy</h2>
<p>If we change this policy, we'll update the date at the top of the page.</p>
</article>`;
}
