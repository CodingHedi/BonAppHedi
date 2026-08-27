// Refuses to let the build ask for an asset the API is going to shadow.
//
// Runs as part of `npm run verify:prod`, alongside check-legal.mjs and
// check-favicon.mjs, and for the same reason: it should never interrupt
// anybody working on a recipe card, and it should absolutely stop a deploy.
//
// The bug it exists for, in full, because it is not obvious from either side:
//
//   MediaStorage.PREFIX is "/media/" and MediaController maps
//   PREFIX + "{name:.+}", which outranks Spring's static resource handling for
//   everything beneath it. Angular's build emits hashed assets — fonts, in
//   practice — into its own "media" folder by default and references them from
//   the stylesheet as ./media/…. In production the controller therefore
//   answered every one of those from the upload directory, found nothing, and
//   returned 404.
//
//   All eleven font files 404'd on the live site from 2026-08-10 to
//   2026-08-27. The site rendered in system-ui for seventeen days and every
//   suite stayed green throughout. ADR 8's audit records why nothing saw it;
//   the short version is that the e2e suite runs against a build with no
//   Spring in it, so the collision cannot occur there.
//
// The fix was to move Angular's emitted assets to /assets/ (angular.json,
// outputPath.media). This check is what stops them moving back — an Angular
// upgrade changing that default would be silent, would pass every test, and
// would take the typeface off the site again.
//
// Scope is deliberate. It reads the *stylesheet's* url() references only, not
// the JavaScript: the app legitimately carries "/media/…" strings at runtime
// for recipe photographs, which come from the API and are served by the
// controller exactly as intended. A url() in the built CSS is always a
// build-emitted asset, so there are no false positives to explain away.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const browserDir = join(here, '..', 'frontend', 'dist', 'frontend', 'browser');
const mediaStorage = join(
  here,
  '..',
  'backend',
  'src',
  'main',
  'java',
  'fr',
  'bonapphedi',
  'media',
  'MediaStorage.java',
);

const die = (message) => {
  console.error(`check-media-collision: ${message}`);
  process.exit(1);
};

// Read the prefix from the backend rather than hardcoding it, so moving the
// API's path moves the check with it instead of leaving it asserting a value
// nothing uses any more.
let prefix;
try {
  const java = readFileSync(mediaStorage, 'utf8');
  prefix = java.match(/PREFIX\s*=\s*"([^"]+)"/)?.[1];
} catch {
  die(`could not read ${mediaStorage} — has the media package moved?`);
}

if (!prefix) die('could not find PREFIX in MediaStorage.java — has it been renamed?');

let stylesheets;
try {
  stylesheets = readdirSync(browserDir).filter((f) => f.endsWith('.css'));
} catch {
  die(`no build at ${browserDir} — run \`npm run build\` first`);
}

if (stylesheets.length === 0) die('the build produced no stylesheet, which is itself wrong');

const bare = prefix.replace(/^\/|\/$/g, ''); // "/media/" -> "media"
const offenders = [];

for (const file of stylesheets) {
  const css = readFileSync(join(browserDir, file), 'utf8');

  for (const [, url] of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
    if (url.startsWith('data:') || /^[a-z]+:\/\//i.test(url)) continue;

    // "./media/x.woff2", "/media/x.woff2" and "media/x.woff2" are one thing.
    const path = url.replace(/^\.?\//, '');
    if (path === bare || path.startsWith(`${bare}/`)) offenders.push(`${file}: ${url}`);
  }
}

if (offenders.length > 0) {
  die(
    `the build emits assets under ${prefix}, which MediaController shadows in production.\n` +
      offenders.map((o) => `    ${o}`).join('\n') +
      `\n\n  These return 404 from the jar: the controller answers ${prefix}** from the\n` +
      `  upload directory and never falls through to static resources. Set\n` +
      `  outputPath.media in frontend/angular.json to something outside ${prefix}.\n` +
      `  See Docs/adr/0008-milestone-3-the-sites-own-images.md.`,
  );
}

console.log(`check-media-collision: ok — no stylesheet asset sits under ${prefix}`);
