// Refuses to let an incomplete legal notice reach production.
//
// Runs as part of `npm run verify:prod`, which README and TESTING both name as
// the gate before a deploy - and NOT as part of the everyday `npm run verify`.
// The distinction is deliberate: a missing publisher name should not stop
// anybody working on a recipe card, and it should absolutely stop a deploy.
//
// Mentions legales are legally required of a French site, personal or not, and
// the page had shipped for months reading "A completer avant la mise en ligne"
// while the site was live. This is what makes that impossible to repeat.
//
// Reads the source rather than importing it: this is plain Node with no
// TypeScript loader, and the shape being checked - a handful of string literals
// or the token `null` - is one a regex reads honestly.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, '..', 'frontend', 'src', 'app', 'pages', 'legal', 'legal-details.ts');

const REQUIRED = [
  ['publisher', 'who publishes the site'],
  ['publicationDirector', 'the directeur de la publication'],
  ['contactEmail', 'an address a reader can actually write to'],
  ['name', "the host's legal name"],
  ['address', "the host's postal address"],
  ['phone', "the host's telephone number"],
];

let source;
try {
  source = readFileSync(file, 'utf8');
} catch {
  console.error(`check-legal: cannot read ${file}`);
  console.error('If the legal details have moved, point this script at them - do not delete it.');
  process.exit(1);
}

const missing = [];
for (const [key, what] of REQUIRED) {
  // `key: null`, `key: ''` and a key that is absent altogether all count.
  const match = source.match(new RegExp(`\\b${key}\\s*:\\s*(null|'([^']*)'|"([^"]*)")`));
  const value = match ? (match[2] ?? match[3] ?? null) : null;
  if (!value || !value.trim()) missing.push(`  ${key.padEnd(22)} ${what}`);
}

if (missing.length) {
  console.error('\ncheck-legal: the mentions legales are incomplete.\n');
  console.error(missing.join('\n'));
  console.error(`\nFill them in at ${file}`);
  console.error('A French site is required to publish these, personal or not.\n');
  process.exit(1);
}

console.log('check-legal: the legal notice is complete.');
