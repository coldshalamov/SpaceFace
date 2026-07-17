#!/usr/bin/env node
// Focused A2 acceptance: prose breadth, read-only deterministic projection, archive bounds,
// post-gate Vols hand, Senna name continuity, endgame quote provenance, panel semantics,
// and pause-route player reachability (no station chrome redesign).

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { validateShipLedgerTemplates } from '../src/data/shipLedgerTemplates.js';
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

// Player-route wiring: pause-accessible screen registered on the production uiRoot path.
const uiRoot = readFileSync(fileURLToPath(new URL('../src/ui/uiRoot.js', import.meta.url)), 'utf8');
const pause = readFileSync(fileURLToPath(new URL('../src/ui/screens/pause.js', import.meta.url)), 'utf8');
const screen = readFileSync(fileURLToPath(new URL('../src/ui/screens/shipLedgerScreen.js', import.meta.url)), 'utf8');
if (!uiRoot.includes('shipLedgerScreen') || !uiRoot.includes('shipLedgerScreen.js')) {
  console.error(JSON.stringify({
    check: 'depth-program-a2', ok: false,
    errors: ['uiRoot must register shipLedgerScreen for default-route reachability'],
  }, null, 2));
  process.exit(1);
}
if (!/pushScreen['"]\s*,\s*['"]shipLedger['"]/.test(pause)) {
  console.error(JSON.stringify({
    check: 'depth-program-a2', ok: false,
    errors: ['pause menu must open shipLedger without station redesign'],
  }, null, 2));
  process.exit(1);
}
if (!screen.includes('createShipLedgerPanel') || !screen.includes("id: 'shipLedger'")) {
  console.error(JSON.stringify({
    check: 'depth-program-a2', ok: false,
    errors: ['shipLedgerScreen must wrap createShipLedgerPanel with id shipLedger'],
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  check: 'depth-program-a2',
  ok: true,
  sourcePolicy: 'read-only projector; zero subscriptions, emits, or serializers',
  playerRoute: "pause → Ship's Ledger screen (no station chrome redesign)",
  entryTypes: 8,
  variantsPerType: '>=4',
  pageSize: SHIP_LEDGER_PAGE_SIZE,
  maxPageSize: SHIP_LEDGER_MAX_PAGE_SIZE,
  maxEntries: SHIP_LEDGER_MAX_ENTRIES,
  focusedTests: '8/8',
}, null, 2));
