// Profile the recipe grid at a realistic catalogue size.
//
// Docs/backlog.md asks for a rendering measurement rather than a recipe count,
// and for three specific things: whether the grid is actually slow at two or
// three hundred cards, how much of it is decoded before it is scrolled to, and
// whether reserving the image box in fact costs zero layout shift. This answers
// all three and prints the numbers, so the entry can be revisited on evidence
// instead of on a guess about how many recipes there are.
//
//   cd frontend ; npm run build
//   node scripts\grid-perf.mjs 6 300
//
// The production build is not optional. `ng serve` ships unminified code and
// every number here would be wrong in the same direction, which is worse than
// having no numbers: it would look like a measurement.
//
// The catalogue is synthesised and injected by intercepting /api, so this needs
// no backend and no database. Each card gets its own cache-busting image URL
// on purpose - pointed at the same six files, 300 cards would share six decodes
// and the decode cost, which is the interesting half, would vanish.
//
// Nothing here runs in `npm run verify`. It takes a build and the better part of
// a minute, and it answers a question that is asked once a milestone rather than
// once a commit. The regression guard that *does* run every time is the
// cumulative-layout-shift assertion in frontend/e2e/recipe-list.spec.ts.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, join, extname, normalize, resolve } from 'node:path';

// Playwright is a frontend devDependency and this script is not inside that
// package, so resolve it from there rather than relying on hoisting - exactly
// as scripts/csp-lab.mjs has to.
const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const require = createRequire(join(repo, 'frontend', 'package.json'));
const { chromium } = require('playwright');

const DIST = join(repo, 'frontend', 'dist', 'frontend', 'browser');
const PORT = 4399;
const COUNTS = process.argv.slice(2).map(Number).filter(Boolean);
if (!COUNTS.length) COUNTS.push(6, 300);

// ---------------------------------------------------------------- the server

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

async function tryFile(path) {
  try {
    if (!(await stat(path)).isFile()) return null;
    return await readFile(path);
  } catch {
    return null;
  }
}

function serve() {
  return new Promise((ready) => {
    const server = createServer(async (req, res) => {
      const { pathname } = new URL(req.url, 'http://localhost');
      const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');

      // Never fall back to index.html for the API. Answering a JSON call with a
      // page is how the first run of this harness appeared to work: the SPA
      // parsed HTML as a session object, threw during bootstrap, and rendered
      // nothing - which looks identical to a grid that is simply empty.
      if (safe.startsWith('/api/')) {
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end('{"error":"not intercepted"}');
        return;
      }

      let file = join(DIST, safe);
      let body = await tryFile(file);
      if (!body) {
        file = join(DIST, 'index.html');
        body = await tryFile(file);
      }
      if (!body) {
        res.writeHead(404).end('not found');
        return;
      }

      res.writeHead(200, {
        'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
        // Explicit: without it Node sends chunked and every content-length the
        // measurement reads comes back zero.
        'content-length': body.length,
        'cache-control': 'no-store',
      });
      res.end(body);
    });
    server.listen(PORT, () => ready(server));
  });
}

// ------------------------------------------------------------- the catalogue

/** The six real photographs, cycled. Geometry matches the files. */
const PHOTOS = [
  { file: 'babka-au-chocolat.jpg', width: 1600, height: 738 },
  { file: 'cheesecake-basque.jpg', width: 1205, height: 1600 },
  { file: 'tajine-de-boeuf.jpg', width: 1600, height: 1067 },
  { file: 'chakchouka.jpg', width: 1600, height: 1067 },
  { file: 'pain-au-levain.jpg', width: 1600, height: 1200 },
  { file: 'jus-grenade-orange.jpg', width: 1600, height: 1067 },
];

const WORDS = [
  'tajine', 'babka', 'cheesecake', 'chakchouka', 'levain', 'grenade', 'safran',
  'citron', 'amande', 'pistache', 'harissa', 'confit', 'brioche', 'semoule',
  'fenouil', 'coriandre', 'abricot', 'poivron', 'aubergine', 'cannelle',
];

const TAGS = [
  { slug: 'dessert', label: 'dessert', colorVariant: 'accent' },
  { slug: 'plat', label: 'plat', colorVariant: 'accent2' },
  { slug: 'boisson', label: 'boisson', colorVariant: 'accent' },
  { slug: 'boulange', label: 'boulange', colorVariant: 'accent2' },
];

const AUTHOR = { slug: 'hedi', displayName: 'Hédi', avatarUrl: null, bio: 'Je cuisine.' };

function catalogue(count) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const photo = PHOTOS[i % PHOTOS.length];
    const a = WORDS[i % WORDS.length];
    const b = WORDS[(i * 7 + 3) % WORDS.length];
    const title = `${a[0].toUpperCase()}${a.slice(1)} ${b} n°${i + 1}`;
    const excerpt = `Une recette de ${a} au ${b}, travaillée lentement.`.slice(0, 40 + (i % 20));
    const tags = [TAGS[i % TAGS.length], TAGS[(i + 2) % TAGS.length]];
    items.push({
      slug: `recette-${i + 1}`,
      title,
      excerpt,
      image: { url: `/media/${photo.file}?r=${i}`, alt: title, width: photo.width, height: photo.height },
      tags,
      author: AUTHOR,
      publishedAt: new Date(Date.UTC(2026, 0, 1 + (i % 200))).toISOString(),
      prepMinutes: 10 + (i % 40),
      cookMinutes: 20 + (i % 90),
      difficulty: (i % 3) + 1,
      rating: { average: 3 + ((i % 20) / 10), count: 1 + (i % 30) },
      searchText: `${title} ${excerpt}`,
    });
  }
  return items;
}

async function install(page, items) {
  const json = (body) => ({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  });

  const featured = items.slice(0, 3).map((r, i) => ({
    slug: r.slug,
    kicker: ['À la une', 'Nouveau', 'De saison'][i],
    title: r.title,
    excerpt: r.excerpt,
    image: r.image,
  }));

  // One regex route rather than a glob per endpoint: a glob's `?` is a literal,
  // so `**/api/recipes?**` silently never matches the query-string call and the
  // grid stays empty while every other route works.
  await page.route(/\/api\//, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/api/recipes/featured')) return route.fulfill(json(featured));
    if (path.endsWith('/api/recipes'))
      return route.fulfill(json({ items, page: 0, size: items.length, total: items.length }));
    // A fixed count: tag chips widen with the number in them, and letting that
    // grow with the catalogue makes the filter bar wrap at 300 and not at 6,
    // which shows up as a layout shift belonging to the harness.
    if (path.endsWith('/api/tags')) return route.fulfill(json(TAGS.map((t) => ({ ...t, count: 4 }))));
    if (path.endsWith('/api/authors')) return route.fulfill(json([AUTHOR]));
    if (path.endsWith('/api/auth/session')) return route.fulfill(json({ user: null }));
    return route.fulfill(json({}));
  });
}

// ------------------------------------------------------------ the collectors

const COLLECTOR = () => {
  window.__perf = { cls: 0, shifts: [], longTasks: [] };

  const describe = (n) => {
    if (!n || n.nodeType !== 1) return '?';
    const cls =
      typeof n.className === 'string' && n.className
        ? `.${n.className.trim().split(/\s+/).join('.')}`
        : '';
    return `${n.tagName.toLowerCase()}${cls}`;
  };

  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__perf.cls += e.value;
      if (e.value <= 0.0001) continue;
      // Which element moved: without attribution a CLS number says something is
      // wrong and not what, and the guess is always "the images".
      window.__perf.shifts.push({
        value: +e.value.toFixed(4),
        at: Math.round(e.startTime),
        sources: [...(e.sources ?? [])].map((s) => `${describe(s.node)} ${Math.round(s.previousRect.y)}→${Math.round(s.currentRect.y)}px`),
      });
    }
  }).observe({ type: 'layout-shift', buffered: true });

  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__perf.longTasks.push(Math.round(e.duration));
  }).observe({ type: 'longtask', buffered: true });
};

const imageStats = (page) =>
  page.evaluate(() => {
    const imgs = [...document.querySelectorAll('bah-recipe-card img')];
    const decoded = imgs.filter((i) => i.complete && i.naturalWidth > 0);
    return {
      total: imgs.length,
      decoded: decoded.length,
      megapixels: +(
        decoded.reduce((s, i) => s + i.naturalWidth * i.naturalHeight, 0) / 1e6
      ).toFixed(1),
    };
  });

async function scrollAndSample(page) {
  return await page.evaluate(async () => {
    const frames = [];
    let last = performance.now();
    let running = true;
    const tick = (now) => {
      frames.push(now - last);
      last = now;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);

    for (let y = 0; y < document.documentElement.scrollHeight; y += 700) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    await new Promise((r) => setTimeout(r, 400));
    running = false;
    // The first interval is the gap since the observer started rather than a
    // rendered frame.
    return frames.slice(1);
  });
}

// ------------------------------------------------------------------- the run

async function run(browser, count) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  let bytes = 0;
  let requests = 0;
  page.on('response', (res) => {
    if (!/\/media\/.*\.jpg/.test(res.url())) return;
    requests++;
    bytes += Number(res.headers()['content-length'] ?? 0);
  });

  await page.addInitScript(COLLECTOR);
  await install(page, catalogue(count));

  const t0 = Date.now();
  // The list is the locale root. `recettes` is only the detail-page prefix, so
  // /fr/recettes is the 404 page - which fetches recipes too, and therefore
  // looks convincingly like a working measurement.
  await page.goto(`http://localhost:${PORT}/fr`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.card', { timeout: 30_000 });
  const loadMs = Date.now() - t0;

  await page.waitForTimeout(1200);
  const beforeScroll = await imageStats(page);
  const bytesBefore = bytes;
  const domNodes = await page.evaluate(() => document.getElementsByTagName('*').length);
  const cards = await page.locator('.card').count();

  const frames = await scrollAndSample(page);
  await page.waitForTimeout(600);
  const afterScroll = await imageStats(page);
  const perf = await page.evaluate(() => ({
    cls: +window.__perf.cls.toFixed(4),
    shifts: window.__perf.shifts,
    longTasks: window.__perf.longTasks,
  }));

  await context.close();

  const sorted = [...frames].sort((a, b) => a - b);
  const at = (p) => +(sorted[Math.floor(sorted.length * p)] ?? 0).toFixed(1);

  return {
    count,
    cards,
    domNodes,
    loadMs,
    cls: perf.cls,
    shifts: perf.shifts,
    decodedBeforeScroll: `${beforeScroll.decoded}/${beforeScroll.total} (${beforeScroll.megapixels} MP)`,
    decodedAfterScroll: `${afterScroll.decoded}/${afterScroll.total} (${afterScroll.megapixels} MP)`,
    imageMBBeforeScroll: +(bytesBefore / 1e6).toFixed(2),
    imageMBTotal: +(bytes / 1e6).toFixed(2),
    imageRequests: requests,
    frameMs: { p50: at(0.5), p95: at(0.95), worst: +Math.max(...frames).toFixed(1) },
    framesOver32ms: frames.filter((f) => f > 32).length,
    longTasks: perf.longTasks,
  };
}

if (!(await tryFile(join(DIST, 'index.html')))) {
  console.error(`No production build at ${DIST}\n  cd frontend ; npm run build`);
  process.exit(1);
}

const server = await serve();
const browser = await chromium.launch();
const results = [];
for (const count of COUNTS) {
  process.stderr.write(`measuring ${count} recipes...\n`);
  results.push(await run(browser, count));
}
await browser.close();
server.close();

console.log(JSON.stringify(results, null, 2));
