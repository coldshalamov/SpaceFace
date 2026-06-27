#!/usr/bin/env node
// check-save-resume-confidence.mjs - guards the title-screen Continue/Load confidence loop.
//
// A Steam-demo player should know exactly what Continue will restore before clicking it. This
// contract keeps the main menu tied to the save-system index metadata instead of drifting back to a
// blind enabled/disabled button. It also pins the existing save/load signal surface used by toasts,
// menus, and probes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const menu = read('src/ui/screens/mainMenu.js');
const save = read('src/save/saveSystem.js');
const saveLoad = read('src/ui/screens/saveLoad.js');

// Main menu: Continue must be informative, not a blind button.
assert.match(menu, /sf-menu-save-summary/, 'mainMenu must render a latest-save summary beside Continue');
assert.match(menu, /function readSaveIndex\(ctx\)/, 'mainMenu must read the save index through one helper');
assert.match(menu, /listSlots/, 'mainMenu should prefer save.listSlots() when the save system is available');
assert.match(menu, /LS_PREFIX \+ 'index'/, 'mainMenu should fall back to the canonical localStorage save index');
assert.match(menu, /function latestSave\(slots\)/, 'mainMenu must resolve the latest occupied save slot');
assert.match(menu, /function saveSummaryText\(slot, meta\)/, 'mainMenu must format human-readable save metadata');
assert.match(menu, /Continue: /, 'mainMenu summary must explicitly label what Continue will load');
assert.match(menu, /ctx\.bus\.emit\('game:load',\s*\{\s*slot:\s*'latest'\s*\}\)/,
  'Continue should still use the canonical save-system latest-slot load path');
assert.doesNotMatch(menu, /boots straight into flight/,
  'mainMenu comments must not claim a divergent/stale boot path');

// Save system: the index must contain enough data for trustworthy resume copy.
for (const field of ['savedAt', 'playtimeS', 'credits', 'sectorName', 'shipName', 'version']) {
  assert.match(save, new RegExp(field), `save index should include ${field} metadata`);
}
assert.match(save, /idx\[slot\]\s*=\s*\{[\s\S]*sectorName[\s\S]*shipName[\s\S]*version/s,
  'save index metadata should include sector + ship context for the main menu');
assert.match(save, /this\.bus\.emit\('save:completed'/, 'save system must emit save:completed for UI confidence feedback');
assert.match(save, /this\.bus\.emit\('save:error'/, 'save system must emit save:error for failed saves/loads');
assert.match(save, /this\.bus\.emit\('save:loaded'/, 'save system must emit save:loaded after restore');

// Save/Load remains the fuller slot inspector. Main menu and Save/Load must share the same source
// of truth instead of inventing separate storage schemes.
assert.match(saveLoad, /function readSlots\(ctx\)/, 'saveLoad must keep reading slots defensively');
assert.match(saveLoad, /listSlots/, 'saveLoad should also prefer save.listSlots()');
assert.match(saveLoad, /function latestOccupiedSlot\(slots\)/, 'saveLoad must preserve latest-slot resolution for export/selection');

console.log('Save/resume confidence OK - title Continue shows latest-save context and uses the canonical save index.');
