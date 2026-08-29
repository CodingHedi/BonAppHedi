// A backtick inside an Angular component's `template:` or `styles:` block ends
// the template literal, and the rest of the component parses as TypeScript.
//
// The compiler does catch it. The problem is what it says: the error surfaces
// tens of lines away, describes a type that has nothing to do with the comment,
// and never mentions a string. A real one, from a CSS comment reading
// "opacity: 0.6" in backticks:
//
//   TS2349: This expression is not callable. Type 'Number' has no call
//   signatures.        41 |  * whole row. `opacity: 0.6` sat here...
//
// Which sends you looking for a bad call. This ran four times in one day while
// ADR 14 was being written, because the house style quotes code in comments
// with backticks everywhere else and the habit does not stop at the template
// literal's edge. The fix each time was three seconds; finding it was not.
//
// So this says the true thing early, in the lint step, before the compiler gets
// a chance to say a false one.

import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'frontend', 'src');

/** Every .ts under src/, without pulling in a glob dependency. */
function* sources(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sources(path);
    else if (entry.name.endsWith('.ts')) yield path;
  }
}

const offences = [];

for (const file of sources(root)) {
  const lines = readFileSync(file, 'utf8').split('\n');

  // Inside which block, if any. Opening and closing are both unambiguous: the
  // decorator property opens one and a line of exactly "`," closes it.
  let block = null;

  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim();

    if (block === null) {
      if (/^(template|styles):\s*`$/.test(trimmed)) block = trimmed.split(':')[0];
      continue;
    }

    if (trimmed === '`,' || trimmed === '`') {
      block = null;
      continue;
    }

    if (line.includes('`')) {
      offences.push({
        file: relative(process.cwd(), file),
        line: index + 1,
        block,
        text: trimmed.slice(0, 78),
      });
    }
  }
}

if (offences.length > 0) {
  console.error('A backtick inside a template literal ends it. These will not compile:\n');
  for (const o of offences) {
    console.error(`  ${o.file}:${o.line}  (inside ${o.block}:)`);
    console.error(`    ${o.text}\n`);
  }
  console.error('  Name the code plainly instead — opacity: 0.6, not `opacity: 0.6`.');
  console.error('  The compiler will report this as a type error somewhere else entirely.');
  process.exit(1);
}

console.log(`check-template-backticks: ok — no stray backticks in template or styles blocks.`);
