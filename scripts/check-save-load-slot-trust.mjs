#!/usr/bin/env node
// check-save-load-slot-trust.mjs - guards destructive Save/Load confirmations.
//
// The Save / Load slot list already displays sector, ship, objective, playtime,
// credits, and saved-at metadata. The destructive Load/Overwrite confirmations
// must repeat that concrete context so a returning player can trust the action
// before replacing the current session or clobbering an old save. Importing an
// external save file is also a destructive load path, so it must get the same
// explicit confirmation before file selection mutates the live run.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { importConfirmBody, shouldOfferNewGameShortcut, slotConfirmSummary } from '../src/ui/screens/saveLoad.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const saveLoad = read('src/ui/screens/saveLoad.js');
const pkg = read('package.json');

assert.match(saveLoad, /export function slotConfirmSummary\(meta\)[\s\S]*slotSummaryLines\(meta\)/,
  'Save/Load confirmations must reuse the same rich slot summary data shown in the slot row');
assert.match(saveLoad, /function loadConfirmBody\(id, meta\)[\s\S]*slotLabel\(id\)[\s\S]*slotConfirmSummary\(meta\)[\s\S]*Unsaved progress is lost/,
  'Load confirmation must include slot label plus concrete save context before warning about lost progress');
assert.match(saveLoad, /function overwriteConfirmBody\(id, meta\)[\s\S]*slotLabel\(id\)[\s\S]*slotConfirmSummary\(meta\)[\s\S]*cannot be undone/,
  'Overwrite confirmation must include slot label plus concrete save context before the irreversible warning');
assert.match(saveLoad, /title: 'Load this save\?',\s*\n\s*body: loadConfirmBody\(id, meta\),/,
  'Load dialog must call the trust-hardened body helper');
assert.match(saveLoad, /title: 'Overwrite save\?',\s*\n\s*body: overwriteConfirmBody\(id, meta\),/,
  'Overwrite dialog must call the trust-hardened body helper');
assert.match(saveLoad, /async _import\(ctx, fileIn\)[\s\S]*title: 'Import save file\?',\s*\n\s*body: importConfirmBody\(f\),\s*\n\s*confirmLabel: 'Import & Load', danger: true,/,
  'Import must confirm before loading an external file into the live session');
assert.match(saveLoad, /if \(!confirmed\) \{ fileIn\.value = ''; return; \}/,
  'Cancelling import confirmation must clear the file input and leave the current run untouched');
assert.doesNotMatch(saveLoad, /save from ' \+ slotLabel\(id\)/,
  'Load dialog must not fall back to slot-only copy');
assert.doesNotMatch(saveLoad, /existing save in ' \+ slotLabel\(id\) \+ '\. This cannot be undone\.'/,
  'Overwrite dialog must not fall back to slot-only copy');

const summary = slotConfirmSummary({
  savedAt: '2026-06-27T12:00:00.000Z',
  playtimeS: 3660,
  credits: 12345,
  sectorName: 'Helios Reach',
  shipName: 'ship_kestrel_runner',
  objectiveSummary: 'Route: Tethys Trade Hub - Provisions',
});
assert.match(summary, /Helios Reach - Kestrel Runner/, 'confirmation summary should include sector and ship context');
assert.match(summary, /Route: Tethys Trade Hub - Provisions/, 'confirmation summary should include objective context');
assert.match(summary, /1h 1m played/, 'confirmation summary should include playtime context');
assert.match(summary, /12,345 CR/, 'confirmation summary should include credit context');

const importSummary = importConfirmBody({ name: 'spaceface_quick_2026-06-28.json' });
assert.match(importSummary, /spaceface_quick_2026-06-28\.json/, 'import confirmation should name the selected file');
assert.match(importSummary, /validate and load that save immediately/, 'import confirmation should disclose the immediate load');
assert.match(importSummary, /Unsaved progress is lost/, 'import confirmation should warn about replacing unsaved progress');

assert.equal(shouldOfferNewGameShortcut({}, false), true,
  'title/load flow should offer New Game on empty slots when no live run can be saved');
assert.equal(shouldOfferNewGameShortcut(null, false), true,
  'missing slot metadata should count as empty for title New Game shortcut');
assert.equal(shouldOfferNewGameShortcut({ savedAt: '2026-06-27T12:00:00.000Z' }, false), false,
  'occupied slots should never show the New Game shortcut');
assert.equal(shouldOfferNewGameShortcut({}, true), false,
  'live Save/Load surfaces must not offer New Game on empty slots while current progress can be saved');
assert.match(saveLoad, /if \(shouldOfferNewGameShortcut\(meta, saveAllowed\)\) \{/,
  'New Game shortcut must be gated by live-run save availability, not just empty-slot state');

assert.match(pkg, /"check:save-load-slot-trust": "node scripts\/check-save-load-slot-trust\.mjs"/,
  'package.json must expose the focused Save/Load slot-trust check');
assert.match(pkg, /check:title-continue-runtime && npm run check:save-load-slot-trust/,
  'Full check must include Save/Load slot trust after title Continue trust');

console.log('Save/Load slot trust OK - destructive confirmations repeat concrete slot context, and live Save/Load empty slots do not route to New Game.');
