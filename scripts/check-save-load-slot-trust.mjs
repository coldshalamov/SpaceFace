#!/usr/bin/env node
// check-save-load-slot-trust.mjs - guards destructive Save/Load confirmations.
//
// The Save / Load slot list already displays sector, ship, objective, playtime,
// credits, and saved-at metadata. The destructive Load/Overwrite confirmations
// must repeat that concrete context so a returning player can trust the action
// before replacing the current session or clobbering an old save.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { slotConfirmSummary } from '../src/ui/screens/saveLoad.js';

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

assert.match(pkg, /"check:save-load-slot-trust": "node scripts\/check-save-load-slot-trust\.mjs"/,
  'package.json must expose the focused Save/Load slot-trust check');
assert.match(pkg, /check:title-continue-runtime && npm run check:save-load-slot-trust/,
  'Full check must include Save/Load slot trust after title Continue trust');

console.log('Save/Load slot trust OK - destructive confirmations repeat concrete slot context before replacing or overwriting a save.');
