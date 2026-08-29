// The backend's answer to `npm audit`, which the backend does not have.
//
// The frontend gets vulnerability reporting for free and the backend gets
// nothing, so on 2026-08-29 Spring Boot was found ten patch releases behind —
// 3.5.6 against a current 3.5.16 — with no CVE alert anywhere, because nothing
// was looking. Ten releases of Spring Framework, Spring Security, Tomcat and
// Jackson fixes had simply not been taken.
//
// This checks *currency*, not vulnerabilities, and that is a deliberate
// narrowing rather than a shortfall:
//
//   - It needs no CVE database. OWASP dependency-check wants an NVD API key
//     and a long download, which is a lot of moving parts for a personal site
//     and one more thing to rot.
//   - Currency is what actually drifted. A patch bump inside a supported line
//     is the mechanism by which almost every backend CVE gets fixed here, so
//     "are we on the newest patch" answers the question that matters without
//     needing to know what the vulnerabilities are.
//
// It fails only on **patch drift within the minor line we are already on**,
// because that is the update that is safe to take unread. A newer minor or
// major is reported and does not fail: those are judgement calls about
// migration effort, and a scheduled job that goes red the day Spring Boot 4.0
// ships is a job people learn to ignore.
//
// Not in `verify` or `verify:prod`, on purpose. It reaches the network, so it
// would make an offline build fail and would let a release published five
// minutes ago block a deploy. It runs on a schedule instead — see
// .github/workflows/dependencies.yml.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const pom = readFileSync(join(here, '..', 'backend', 'pom.xml'), 'utf8');

/** The version each of these is pinned at, and where to ask what is current. */
const WATCHED = [
  {
    name: 'spring-boot-starter-parent',
    path: 'org/springframework/boot/spring-boot-starter-parent',
    // The parent's own <version>, which is not a property like the others.
    version: pom.match(/<artifactId>spring-boot-starter-parent<\/artifactId>\s*<version>([^<]+)</)?.[1],
  },
  { name: 'sqlite-jdbc', path: 'org/xerial/sqlite-jdbc', property: 'sqlite.version' },
  { name: 'commonmark', path: 'org/commonmark/commonmark', property: 'commonmark.version' },
  {
    name: 'owasp-java-html-sanitizer',
    path: 'com/googlecode/owasp-java-html-sanitizer/owasp-java-html-sanitizer',
    property: 'owasp.sanitizer.version',
  },
];

for (const item of WATCHED) {
  if (item.property) {
    item.version = pom.match(new RegExp(`<${item.property}>([^<]+)<`))?.[1];
  }
  if (!item.version) {
    console.error(`check-backend-dependencies: could not read ${item.name} out of pom.xml.`);
    console.error('  The pom has been restructured and this check is now lying. Fix it.');
    process.exit(1);
  }
}

/**
 * Every published version, newest last.
 *
 * `<release>` alone is not enough: it is the newest overall, so once a newer
 * minor exists it stops answering "is there a patch for the line we are on".
 */
async function published(path) {
  const url = `https://repo1.maven.org/maven2/${path}/maven-metadata.xml`;
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} from ${url}`);
  return [...(await response.text()).matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
}

/** Numeric where both sides are numeric, lexical otherwise. 3.5.16 > 3.5.6. */
const compare = (a, b) => {
  const pa = a.split(/[.-]/);
  const pb = b.split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const [x, y] = [pa[i] ?? '', pb[i] ?? ''];
    const [nx, ny] = [Number(x), Number(y)];
    const numeric = x !== '' && y !== '' && !Number.isNaN(nx) && !Number.isNaN(ny);
    if (numeric && nx !== ny) return nx - ny;
    if (!numeric && x !== y) return x < y ? -1 : 1;
  }
  return 0;
};

const behind = [];
const newerLines = [];

for (const item of WATCHED) {
  let versions;
  try {
    versions = await published(item.path);
  } catch (error) {
    // Distinguished from drift on purpose: this is the check being broken,
    // not the dependencies being stale, and the two want different responses.
    console.error(`check-backend-dependencies: could not reach Maven Central for ${item.name}.`);
    console.error(`  ${error.message}`);
    console.error('  This is a broken check, not a stale dependency.');
    process.exit(1);
  }

  // Same major.minor as what we ship, so "behind" means an unread patch.
  const line = item.version.split('.').slice(0, 2).join('.');
  const sameLine = versions.filter((v) => v.startsWith(`${line}.`));
  const newestPatch = sameLine.sort(compare).at(-1);

  if (newestPatch && compare(newestPatch, item.version) > 0) {
    behind.push(`${item.name}: ${item.version} -> ${newestPatch}`);
  }

  /*
   * Only versions shaped like ours are candidates, and this is not fussiness.
   * The OWASP sanitizer numbered its releases `r239` before moving to dates,
   * and `r239` sorts after `20260313.1` on any lexical comparison — so the
   * first run of this check confidently reported a four-year-old release as
   * the newer line. A comparison is only meaningful inside one scheme.
   */
  const shaped = (v) => /^\d/.test(v) === /^\d/.test(item.version);
  const newest = versions
    .filter((v) => shaped(v) && !/-(RC|M|SNAPSHOT|alpha|beta)/i.test(v))
    .sort(compare)
    .at(-1);
  if (newest && !newest.startsWith(`${line}.`) && compare(newest, item.version) > 0) {
    newerLines.push(`${item.name}: on ${item.version}, newest line is ${newest}`);
  }
}

if (newerLines.length > 0) {
  console.log('A newer release line exists. Not a failure — migrating is a decision:');
  for (const line of newerLines) console.log(`  ${line}`);
  console.log('');
}

if (behind.length > 0) {
  console.error('Behind on patch releases, which is where the security fixes are:');
  for (const line of behind) console.error(`  ${line}`);
  console.error('');
  console.error('  Bump them one at a time in backend/pom.xml so a failure names its own');
  console.error('  cause, run `backend\\mvnw.cmd test`, and then the acceptance suite —');
  console.error('  unit tests passing is not the same as the framework still working.');
  process.exit(1);
}

console.log('check-backend-dependencies: ok — every pinned artifact is on the newest patch of its line.');
