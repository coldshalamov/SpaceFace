#!/usr/bin/env node
// Strip stray backticks from inside a Deckplate CSS template.
//
// Every Deckplate module ships its CSS as a template literal, and this repo writes prose comments
// with markdown quoting. One backtick inside the template ends the string and takes the module with
// it. It has happened five times in this tree. test/deckplate-css-templates.test.mjs catches it;
// this fixes it. Run it after editing any src/ui/deckplate/*.js that exports a *_CSS template.
//
//   node scripts/lib/dp-sanitise.mjs src/ui/deckplate/light.js
import { readFileSync, writeFileSync } from 'node:fs';

const FENCE = '`';
const OPENS = new RegExp(`^export const [A-Z0-9_]+ = ${FENCE}$`);
let touched = 0;

for (const file of process.argv.slice(2)) {
  const lines = readFileSync(file, 'utf8').split('\n');
  let inside = false;
  let fixed = 0;
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (!inside) { if (OPENS.test(trimmed)) inside = true; return; }
    if (trimmed === `${FENCE};`) { inside = false; return; }
    if (line.includes(FENCE)) { lines[i] = line.split(FENCE).join(''); fixed += 1; }
  });
  if (fixed) { writeFileSync(file, lines.join('\n')); touched += fixed; }
  console.log(`${file}: ${fixed} line${fixed === 1 ? '' : 's'} sanitised`);
}
process.exit(touched ? 0 : 0);
