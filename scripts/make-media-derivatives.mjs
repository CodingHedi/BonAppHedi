// Generate the smaller copies of the seeded photographs for the MOCKED build.
//
//   node scripts\make-media-derivatives.mjs
//
// Run this when a file in frontend/public/media changes, and only then — the
// output is committed, like the photographs themselves.
//
// Why this exists at all: in production MediaController makes these on request
// and nothing is committed. The mocked build has no server, so the same URLs
// have to be real files on disk or every card in the e2e suite requests a
// photograph that is not there — and `fixtures.ts` fails a test on a failed
// request, which is exactly the behaviour worth keeping.
//
// The alternative was to have the mock offer a single source and skip srcset
// entirely in the mocked build. That was rejected: the suite would then never
// render the markup that ships, and "the srcset works" would rest on nothing
// but the backend tests and a reading of image.ts.
//
// Chromium does the resizing, as in make-favicon.mjs. It will not produce
// byte-identical output to the Java encoder in PhotoIngest and does not need
// to: these are the mocked build's assets. What has to match is the *name* and
// the *width*, because those are what the running site asks for.

import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, extname, basename } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const require = createRequire(join(repo, 'frontend', 'package.json'));
const { chromium } = require('playwright');

const MEDIA = join(repo, 'frontend', 'public', 'media');

/** Must match MediaStorage.WIDTH_LADDER and image-sources.ts. */
const WIDTH_LADDER = [400, 800];
const QUALITY = 0.78;

const files = (await readdir(MEDIA)).filter(
  (name) => extname(name).toLowerCase() === '.jpg' && !name.includes('@'),
);

if (!files.length) {
  console.error(`No photographs in ${MEDIA}`);
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage();

let written = 0;
for (const file of files) {
  const bytes = await readFile(join(MEDIA, file));
  const dataUri = `data:image/jpeg;base64,${bytes.toString('base64')}`;

  for (const width of WIDTH_LADDER) {
    const produced = await page.evaluate(
      async ([src, target, quality]) => {
        const image = new Image();
        await new Promise((ok, fail) => {
          image.onload = ok;
          image.onerror = fail;
          image.src = src;
        });

        // Never upscale. The server refuses to, so a file here that the server
        // would never produce is a mock that disagrees with production.
        if (image.naturalWidth <= target) return null;

        const height = Math.max(1, Math.round((image.naturalHeight * target) / image.naturalWidth));
        const canvas = document.createElement('canvas');
        canvas.width = target;
        canvas.height = height;

        const context = canvas.getContext('2d');
        context.imageSmoothingQuality = 'high';
        // JPEG has no alpha; without a ground, transparency comes back black.
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, target, height);
        context.drawImage(image, 0, 0, target, height);

        return canvas.toDataURL('image/jpeg', quality).split(',')[1];
      },
      [dataUri, width, QUALITY],
    );

    if (!produced) {
      console.log(`  ${file} is already ${width}px or narrower — skipped`);
      continue;
    }

    const stem = basename(file, extname(file));
    const out = join(MEDIA, `${stem}@${width}${extname(file)}`);
    const buffer = Buffer.from(produced, 'base64');
    await writeFile(out, buffer);
    console.log(`  ${stem}@${width}.jpg  ${(buffer.length / 1024).toFixed(0)} KB`);
    written++;
  }
}

await browser.close();
console.log(`\n${written} derivatives written into frontend/public/media`);
