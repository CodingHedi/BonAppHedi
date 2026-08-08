// Try a Content-Security-Policy against the local jar, by injecting the header
// with request interception. Nothing is deployed: a policy that breaks the site
// breaks it here rather than on bonapphedi.fr.
//
// This exists because the first CSP was reasoned about instead of tested, went
// straight to production, and took the site down. Every term in the policy now
// in deploy/Caddyfile earned its place by being removed here and watching what
// broke.
//
//   cd frontend ; npm run build          # -Pweb only *copies* frontend/dist
//   cd ..\backend ; .\mvnw.cmd clean -Pweb -DskipTests package
//   java -jar backend\target\backend-0.0.1-SNAPSHOT.jar
//   node scripts\csp-lab.mjs "<policy>"
//
// The frontend build is not optional and skipping it is silent: the Maven
// profile copies whatever is already in frontend/dist, so without it the jar
// serves the previous bundle and the policy is measured against code that is no
// longer the code. `clean` for the same reason — copy-resources adds files and
// never removes them, so an old main-*.js otherwise lingers in target/.
//
// Pass the policy exactly as it appears in the Caddyfile. Anything the browser
// refuses is printed at the end; a clean run prints no violations.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Playwright is a frontend devDependency and this script is not inside that
// package, so resolve it from there rather than relying on hoisting.
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '..', 'frontend', 'package.json'));
const { chromium } = require('playwright');

const CSP = process.argv[2];
if (!CSP) throw new Error('pass the policy as the first argument');

const ORIGIN = process.env.CSP_LAB_ORIGIN ?? 'http://localhost:8080';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });

const violations = new Set();
const errors = [];
page.on('console', (m) => {
  const t = m.text();
  if (/Content Security Policy|Refused to/i.test(t)) violations.add(t.slice(0, 150));
  else if (m.type() === 'error') errors.push(t.slice(0, 120));
});

// Only on responses this site serves - which is all Caddy can do anyway.
// Injecting it into third-party responses too made the youtube-nocookie iframe
// receive `frame-ancestors 'none'` and refuse to be framed, which looked like
// the policy forbidding the video and was purely an artefact of the harness.
await page.route('**/*', async (route) => {
  const url = route.request().url();
  if (!url.startsWith(`${ORIGIN}/`)) return route.continue();

  const response = await route.fetch();
  await route.fulfill({
    response,
    headers: { ...response.headers(), 'content-security-policy': CSP },
  });
});

let failed = 0;
const ok = (n, c, d = '') => {
  if (!c) failed++;
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? ' - ' + d : ''}`);
};

await page.goto(`${ORIGIN}/fr`, { waitUntil: 'networkidle' });
await page.locator('bah-recipe-card').first().waitFor({ timeout: 15000 }).catch(() => {});

ok('cards render', (await page.locator('bah-recipe-card').count()) === 5);
// Weaker than its name, and known to be: ThemeService sets the same attribute
// during bootstrap, so this still passes with the inline script blocked - a
// corrupted hash was tried on 2026-08-08 and only the violations check below
// caught it. Kept because the attribute missing entirely is still worth seeing;
// the guard on script-src is the violations list, not this line.
ok('theme bootstrap ran (inline script allowed)', !!(await page.getAttribute('html', 'data-theme')));

// Styling actually applied - the question when dropping 'unsafe-inline' from
// style-src, which is the term most worth trying to remove.
const styled = await page.evaluate(() => {
  const el = document.querySelector('bah-recipe-card');
  return el ? getComputedStyle(el.querySelector('h3') ?? el).fontFamily : '';
});
ok('component styles applied', /Bricolage|Work Sans/i.test(styled), styled.slice(0, 40));

// ICU plurals. This was the reason 'unsafe-eval' was in the policy until
// 2026-08-08, when messageformat was replaced by a transpiler that generates no
// code (ADR 5). The check stays: it is the thing that would break first if
// anything ever reintroduced a runtime compiler, and it fails by rendering
// empty rather than by throwing anywhere visible.
const count = (await page.locator('.count').first().textContent()) ?? '';
ok('ICU plural rendered', /5\s*recettes/.test(count), JSON.stringify(count.trim()));

// The video facade, which frame-src and script-src both govern: the facade
// fetches the IFrame Player API from youtube.com, which then frames
// youtube-nocookie.com. Allowing only the second is not enough.
await page.goto(`${ORIGIN}/fr/recettes/babka-au-chocolat`, { waitUntil: 'networkidle' });
const play = page.locator('bah-recipe-media button').first();
if (await play.count()) {
  await play.click();
  await page.waitForTimeout(3000);
  const yt = page.frames().map((f) => f.url()).filter((u) => /youtube/.test(u));
  ok('youtube iframe allowed', yt.length > 0, yt[0]?.slice(0, 55) ?? 'no frame');
} else {
  ok('play button found', false);
}

if (violations.size) {
  failed++;
  console.log('\nCSP VIOLATIONS:\n  ' + [...violations].join('\n  '));
} else {
  console.log('\nPASS  no CSP violations');
}
if (errors.length) {
  console.log('other console errors:\n  ' + [...new Set(errors)].slice(0, 5).join('\n  '));
}

await browser.close();
process.exit(failed ? 1 : 0);
