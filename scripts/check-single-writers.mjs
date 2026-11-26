// Single-writer contract check (contract index, hunt ledger C-1).
// The architecture names one canonical writer per owned field. This check greps every
// source file for direct assignments to owned fields and fails if any file other than
// the declared owner performs one. Method-call indirection (owner helpers invoked from
// elsewhere) is allowed by design; direct mutation outside the owner is the contract
// violation class this catches.
//
// Additive check: reads files only. Run: node scripts/check-single-writers.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = new URL('../src/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// field pattern -> owning file (paths relative to src/).
// `allowed` names declared exception writers: the save envelope restoring serialized
// state, new-game bootstrap, and deterministic lab/balance harnesses that construct
// fixture state. `systems/survivalRecords.js` restores a pre-packet player blob but
// writes `player.cargo` back as the same live reference (preserve, not mutation).
// Exception writers are part of the contract, not a weakening of it — an undeclared
// writer is the defect class this check exists to catch.
const CONTRACTS = [
  { field: /player\s*\.\s*credits\b/, owner: 'systems/economy.js', name: 'state.player.credits',
    allowed: ['save/', 'core/newGameBoot.js', 'testing/', 'balance/'] },
  { field: /player\s*\.\s*cargo\b/, owner: 'systems/cargo.js', name: 'state.player.cargo',
    allowed: ['save/', 'core/newGameBoot.js', 'testing/', 'balance/', 'systems/survivalRecords.js'] },
  { field: /player\s*\.\s*heat\b/, owner: 'systems/heat.js', name: 'state.player.heat',
    allowed: ['save/', 'core/newGameBoot.js', 'testing/', 'balance/'] },
  { field: /factions\s*(?:\[[^\]]*\]|\.[A-Za-z0-9_$]+)\s*\.\s*rep\b/, owner: 'systems/factions.js', name: 'state.factions[id].rep',
    allowed: ['save/', 'core/newGameBoot.js', 'testing/', 'balance/'] },
  { field: /factions\s*(?:\[[^\]]*\]|\.[A-Za-z0-9_$]+)\s*\.\s*aggro\b/, owner: 'systems/factions.js', name: 'state.factions[id].aggro',
    allowed: ['save/', 'core/newGameBoot.js', 'testing/', 'balance/'] },
  { field: /state\s*\.\s*timeScale\b/, owner: 'core/timeEffects.js', name: 'state.timeScale',
    allowed: ['save/', 'testing/', 'balance/'] },
];

// Write operators: `=` (not ==, ===, =>) and compound assigns (`+=`, `-=`, `&&=`,
// `??=` …). Comparison, arrow functions, and `&&`/`||` boolean chains are reads.
const WRITE_OP = /^(=(?![=>])|[+\-*/%|&^]=|\?\?=|&&=|\|\|=)/;

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      yield* walk(p);
    } else if (entry.endsWith('.js') || entry.endsWith('.mjs')) {
      yield p;
    }
  }
}

const violations = [];
for (const file of walk(SRC)) {
  const rel = relative(SRC, file).replace(/\\/g, '/');
  let text;
  try { text = readFileSync(file, 'utf8'); } catch { continue; }
  const lines = text.split('\n');
  for (const { field, owner, name, allowed } of CONTRACTS) {
    if (rel === owner) continue;
    if (allowed.some((a) => a.endsWith('/') ? rel.startsWith(a) : rel === a)) continue;
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
      if (!field.test(line)) return;
      // Must contain a write operator on the field side: `field =`, `field +=`, etc.
      const m = line.match(field);
      const idx = line.indexOf(m[0]) + m[0].length;
      const after = line.slice(idx).trimStart();
      if (WRITE_OP.test(after.slice(0, 4))) {
        violations.push({ field: name, file: `src/${rel}`, line: i + 1, text: trimmed.slice(0, 120) });
      }
    });
  }
}

if (violations.length) {
  console.error(`single-writer violations: ${violations.length}`);
  for (const v of violations) console.error(`  ${v.field}  ${v.file}:${v.line}  ${v.text}`);
  process.exit(1);
}
console.log(`single-writer contracts hold (${CONTRACTS.length} fields, owners respected)`);
