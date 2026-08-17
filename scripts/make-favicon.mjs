// Regenerate frontend/public/favicon.ico from frontend/public/favicon.svg.
//
//   node scripts\make-favicon.mjs
//
// Run this when the mark changes, and only then - the .ico is committed, like
// the photographs are, because a build must not depend on a browser being
// installed to produce an asset that changes once a year.
//
// Why an .ico at all when favicon.svg exists and is better: index.html offers
// the SVG first and every current browser takes it, so this is the fallback for
// the ones that do not - which are also the ones that cannot adapt to a dark
// tab strip. It is therefore Ink and only Ink, deliberately: the adaptive pair
// lives in the SVG, and a single static image has to pick the common case,
// which is light chrome.
//
// The ICO is a container: a 6-byte header, one 16-byte directory entry per
// size, then the images. The payloads here are PNGs rather than BMPs, which
// every browser has understood for twenty years and which avoids hand-rolling
// a bottom-up BGRA bitmap with an AND mask.

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const require = createRequire(join(repo, 'frontend', 'package.json'));
const { chromium } = require('playwright');

const SVG = join(repo, 'frontend', 'public', 'favicon.svg');
const ICO = join(repo, 'frontend', 'public', 'favicon.ico');

// 16 is the tab, 32 the bookmark bar and the Windows taskbar, 48 the desktop
// shortcut. Larger sizes belong to the SVG, which has no sizes at all.
const SIZES = [16, 32, 48];

const svg = await readFile(SVG, 'utf8');

const browser = await chromium.launch();
// Forced light: the SVG carries a prefers-color-scheme rule, and a machine set
// to dark would otherwise silently bake the Cream variant into the fallback.
const context = await browser.newContext({ colorScheme: 'light' });
const page = await context.newPage();

const pngs = [];
for (const size of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;width:${size}px;height:${size}px">${svg.replace(
      '<svg',
      `<svg width="${size}" height="${size}"`,
    )}</body>`,
  );
  pngs.push(await page.screenshot({ omitBackground: true }));
}
await browser.close();

const HEADER = 6;
const ENTRY = 16;
const header = Buffer.alloc(HEADER);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // 1 = icon
header.writeUInt16LE(SIZES.length, 4);

let offset = HEADER + ENTRY * SIZES.length;
const entries = SIZES.map((size, i) => {
  const entry = Buffer.alloc(ENTRY);
  // 0 means 256 in this field; nothing here is that big, but the convention is
  // why the byte is written rather than assumed.
  entry.writeUInt8(size === 256 ? 0 : size, 0);
  entry.writeUInt8(size === 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2); // palette size - 0 for truecolour
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(pngs[i].length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return entry;
});

await writeFile(ICO, Buffer.concat([header, ...entries, ...pngs]));
console.log(`favicon.ico written: ${SIZES.join(', ')}px, ${offset} bytes`);
