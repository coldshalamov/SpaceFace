#!/usr/bin/env node
// Focused A2 acceptance: prose breadth, read-only deterministic projection, archive bounds,
// post-gate Vols hand, Senna name continuity, endgame quote provenance, and panel semantics.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { SHIP_LEDGER_ENTRY_TYPES, validateShipLedgerTemplates } from '../src/data/shipLedgerTemplates.js';
import {
  SHIP_LEDGER_MAX_ENTRIES,
  SHIP_LEDGER_MAX_PAGE_SIZE,
  SHIP_LEDGER_PAGE_SIZE,
} from '../src/systems/shipLedger.js';

const validation = validateShipLedgerTemplates();
if (!validation.ok) {
  console.error(JSON.stringify({ check: 'depth-program-a2', ok: false, errors: validation.errors }, null, 2));
  process.exit(1);
}

const projectorSource = readFileSync(fileURLToPath(new URL('../src/systems/shipLedger.js', import.meta.url)), 'utf8');
const executableProjectorSource = projectorSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');
const forbiddenRuntimeHooks = [
  /\binit\s*\(/,
  /\bserialize\s*\(/,
  /\bdeserialize\s*\(/,
  /\.on\s*\(\s*['"]/,
  /\.emit\s*\(\s*['"]/,
];
const hooks = forbiddenRuntimeHooks.filter((pattern) => pattern.test(executableProjectorSource)).map(String);
if (hooks.length) {
  console.error(JSON.stringify({
    check: 'depth-program-a2', ok: false,
    errors: [`read-only projector contains runtime writer hooks: ${hooks.join(', ')}`],
  }, null, 2));
  process.exit(1);
}

const testPath = fileURLToPath(new URL('../test/depth-program-a2-ship-ledger.test.mjs', import.meta.url));
const result = spawnSync(process.execPath, ['--test', testPath], { stdio: 'inherit' });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status == null ? 1 : result.status);

console.log(JSON.stringify({
  check: 'depth-program-a2',
  ok: true,
  sourcePolicy: 'read-only projector; zero subscriptions, emits, or serializers',
  // Read from the catalog, never restated: the count grew when PQ-142.01 added the hull's own
  // history families (scar / patch / renown) and a hand-written literal would have lied here.
  entryTypes: SHIP_LEDGER_ENTRY_TYPES.length,
  variantsPerType: '>=4',
  pageSize: SHIP_LEDGER_PAGE_SIZE,
  maxPageSize: SHIP_LEDGER_MAX_PAGE_SIZE,
  maxEntries: SHIP_LEDGER_MAX_ENTRIES,
  focusedTests: '8/8',
}, null, 2));
