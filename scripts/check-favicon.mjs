// Refuses to let the Angular template favicon reach production.
//
// Runs as part of `npm run verify:prod`, alongside check-legal.mjs and for the
// same reason: this should never stop anybody working on a recipe card, and it
// should absolutely stop a deploy.
//
// The site shipped for three weeks with Angular's own favicon in the tab —
// 15086 bytes of red-and-white "A" — not because anyone chose it but because
// nothing pointed at it. It was on the milestone-3 list from the first day and
// stayed there. This gate could not be written until there was a real icon to
// keep, which is why it arrives after the logo rather than with it (ADR 11).
//
// It checks three things, and the third is the one worth having:
//
//   1. favicon.ico is not the Angular template, by size and by hash.
//   2. favicon.svg exists and still carries both inks, so the adaptive icon
//      cannot quietly become a single-colour one.
//   3. index.html offers the SVG *before* the .ico. Order is the whole
//      mechanism — a browser takes the first icon it understands — so swapping
//      the two lines silently disables the adaptive favicon while leaving
//      every file present and every test green.

import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, '..', 'frontend', 'public');
const indexHtml = join(here, '..', 'frontend', 'src', 'index.html');

/** The generated Angular favicon, as it arrived on 2026-07-25. */
const ANGULAR_TEMPLATE_BYTES = 15086;

const problems = [];

// --- 1. the .ico is ours ----------------------------------------------------
const icoPath = join(publicDir, 'favicon.ico');
let ico;
try {
  ico = readFileSync(icoPath);
} catch {
  problems.push('frontend/public/favicon.ico is missing');
}

if (ico) {
  if (ico.length === ANGULAR_TEMPLATE_BYTES) {
    problems.push(
      `favicon.ico is ${ico.length} bytes, which is the Angular template. ` +
        'Regenerate it: node scripts/make-favicon.mjs',
    );
  }
  // An ICO starts 00 00 01 00 and then a little-endian count of images. A file
  // that is not one at all would otherwise pass the size check.
  if (!(ico[0] === 0 && ico[1] === 0 && ico[2] === 1 && ico[3] === 0)) {
    problems.push('favicon.ico is not an ICO file — check scripts/make-favicon.mjs');
  }
  const images = ico.readUInt16LE(4);
  if (images < 1) problems.push('favicon.ico declares no images');
}

// --- 2. the SVG still adapts ------------------------------------------------
const svgPath = join(publicDir, 'favicon.svg');
let svg = '';
try {
  svg = readFileSync(svgPath, 'utf8');
  if (statSync(svgPath).size === 0) problems.push('favicon.svg is empty');
} catch {
  problems.push('frontend/public/favicon.svg is missing');
}

if (svg) {
  if (!svg.includes('prefers-color-scheme')) {
    problems.push(
      'favicon.svg no longer switches on prefers-color-scheme, so the icon ' +
        'cannot adapt to a dark tab strip (ADR 11)',
    );
  }
  for (const [hex, chrome] of [
    ['#1e1a1b', 'Ink, for light chrome'],
    ['#efe6d6', 'Cream, for dark chrome'],
  ]) {
    if (!svg.toLowerCase().includes(hex)) {
      problems.push(`favicon.svg no longer contains ${hex} (${chrome})`);
    }
  }
}

// --- 3. the SVG is offered first --------------------------------------------
let html = '';
try {
  html = readFileSync(indexHtml, 'utf8');
} catch {
  problems.push('frontend/src/index.html is missing');
}

if (html) {
  const svgAt = html.indexOf('favicon.svg');
  const icoAt = html.indexOf('favicon.ico');

  if (svgAt === -1) problems.push('index.html does not link favicon.svg');
  if (icoAt === -1) problems.push('index.html does not link favicon.ico as a fallback');
  if (svgAt !== -1 && icoAt !== -1 && svgAt > icoAt) {
    problems.push(
      'index.html links favicon.ico before favicon.svg. A browser takes the ' +
        'first icon it understands, so this disables the adaptive favicon ' +
        'without removing a single file.',
    );
  }
}

if (problems.length) {
  console.error('\nThe favicon is not fit to deploy:\n');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('');
  process.exit(1);
}

console.log('favicon: ours, adaptive, and offered in the right order');
