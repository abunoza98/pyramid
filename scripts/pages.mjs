// Football Pyramids: the About & contact page and the privacy policy.
// Edit the wording here, then run `node scripts/build.mjs`.
// When the policy changes, update POLICY_DATE.

export const POLICY_DATE = "22 October 2026";

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function emailLine(email) {
  return `<p class="email-line"><a href="mailto:${esc(email)}">${esc(email)}</a>` +
    `<button type="button" class="copy" data-copy="${esc(email)}">Copy address</button></p>`;
}

export function contactPage({ contact, snapshot, countryNames }) {
  const list = countryNames.slice(0, -1).join(", ") + " and " + countryNames[countryNames.length - 1];
  return `<article class="prose" aria-labelledby="page-h">
<p class="eyebrow">About</p>
<h1 id="page-h">About Football Pyramids</h1>
<p class="lede">Each country's league system on one long page: the top division first, then every tier below it, with promotion, play-off and relegation places marked on each table.</p>

<h2>What's covered</h2>
<p>The home page shows the top divisions of ${esc(list)}. Each country has its own page with the tiers below. More tiers and countries will be added over time.</p>

<h2>Where the tables come from</h2>
${snapshot
  ? "<p>For now the tables are a sample snapshot gathered by hand, and each table shows the date it is from. Once the live data feed is switched on, they will update through the day as results come in.</p>"
  : "<p>The tables come from a football data provider and update through the day as results come in, usually within an hour of full time. Each table shows when it was last updated.</p>"}

<h2>Contact</h2>
<p>Email us at:</p>
${emailLine(contact.email)}
<ul>
  <li><strong>Spotted a mistake in a table?</strong> Tell us the league and the club, and we'll check it.</li>
  <li><strong>Want another country or tier added?</strong> Let us know which one.</li>
  <li><strong>Advertising and partnerships:</strong> use the same address.</li>
</ul>
<p>We try to reply within a few days.</p>

<h2>Independence</h2>
<p>Football Pyramids is not affiliated with any league, federation or club. Club and competition names are used only to identify them.</p>
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
