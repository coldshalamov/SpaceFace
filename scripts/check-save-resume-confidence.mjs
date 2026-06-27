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
import { fmtCredits, fmtPlaytime, shipLabel, slotBadges, slotSummaryLines } from '../src/ui/screens/saveLoad.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const menu = read('src/ui/screens/mainMenu.js');
const save = read('src/save/saveSystem.js');
const saveLoad = read('src/ui/screens/saveLoad.js');
const uiRoot = read('src/ui/uiRoot.js');
const core = read('src/core/coreSystem.js');
const navPersistence = read('src/systems/navPersistence.js');

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
assert.doesNotMatch(save, /Start or load a game before saving/,
  'save system should leave no-player save feedback to uiRoot save-event listeners');

// Run-to-run objective continuity: player-selected trade/mission nav should survive save/load.
assert.match(core, /navPersistence\.init\(ctx\)/,
  'core init must install nav persistence before save.init wires game:save/game:load');
assert.match(navPersistence, /serializeDataWithNav/, 'nav persistence must add state.nav to save payloads');
assert.match(navPersistence, /data\.nav = serializeNavState/, 'nav persistence must serialize route and waypoint state');
assert.match(navPersistence, /restoreWithNav/, 'nav persistence must restore saved nav after load');
assert.match(navPersistence, /emit\('nav:waypoint'/, 'nav restore must notify HUD/departure UI after resume');
assert.match(navPersistence, /normalizeWaypoint/, 'nav persistence must sanitize saved waypoints before restoring');

// Save/Load remains the fuller slot inspector. Main menu and Save/Load must share the same source
// of truth instead of inventing separate storage schemes.
assert.match(saveLoad, /function readSlots\(ctx\)/, 'saveLoad must keep reading slots defensively');
assert.match(saveLoad, /listSlots/, 'saveLoad should also prefer save.listSlots()');
assert.match(saveLoad, /function latestOccupiedSlot\(slots\)/, 'saveLoad must preserve latest-slot resolution for export/selection');
assert.match(saveLoad, /sf-slot-context/, 'saveLoad slot rows must show ship/sector context');
assert.match(saveLoad, /sf-slot-detail/, 'saveLoad slot rows must show save details');
assert.match(saveLoad, /sf-slot-badge/, 'saveLoad slot rows must show status/version badges');
assert.match(saveLoad, /slotSummaryLines\(meta\)/, 'saveLoad must render slot summaries through the tested formatter');
assert.match(saveLoad, /slotBadges\(id,\s*meta,\s*currentSlot,\s*latestSlot\)/,
  'saveLoad must render current/latest/version badges through the tested formatter');
assert.match(saveLoad, /const ids = \['quick'\];[\s\S]*if \(slots\.autosave \|\| slots\.auto\) ids\.push[\s\S]*for \(let i = 1; i <= SLOT_COUNT - 1; i\+\+\)/,
  'saveLoad should list autosave directly after quick, before manual slots');

assert.equal(fmtPlaytime(3660), '1h 1m played', 'saveLoad should format hour-scale playtime');
assert.equal(fmtCredits(12345.4), '12,345 CR', 'saveLoad should format credits with separators');
assert.equal(shipLabel('ship_kestrel_runner'), 'Kestrel Runner', 'saveLoad should turn ship ids into readable labels');
const summary = slotSummaryLines({
  savedAt: '2026-06-27T12:00:00Z',
  playtimeS: 3660,
  credits: 12345,
  sectorName: 'Helios Reach',
  shipName: 'ship_kestrel_runner',
  version: 5,
});
assert.equal(summary.context, 'Helios Reach - Kestrel Runner', 'saveLoad context should combine sector and ship');
assert.match(summary.detail, /1h 1m played/, 'saveLoad detail should include playtime');
assert.match(summary.detail, /12,345 CR/, 'saveLoad detail should include credits');
assert.deepEqual(slotBadges('quick', { savedAt: '2026-06-27T12:00:00Z', version: 5 }, 'quick', 'auto'), ['Current', 'v5'],
  'current occupied slot should get current and version badges');
assert.deepEqual(slotBadges('auto', { savedAt: '2026-06-27T12:00:00Z', version: 5 }, 'quick', 'auto'), ['Latest', 'v5'],
  'latest non-current occupied slot should get latest and version badges');

// UI save feedback: F5/F9/autosave and Save/Load screen actions all converge through save events.
assert.match(uiRoot, /function wireSaveFeedback\(bus\)/, 'uiRoot must centralize save/load feedback');
for (const eventName of ['save:started', 'save:completed', 'save:loaded', 'save:error']) {
  assert.match(uiRoot, new RegExp(`bus\\.on\\('${eventName}'`), `uiRoot must listen for ${eventName}`);
}
assert.match(uiRoot, /function saveErrorText\(payload = \{\}\)/, 'uiRoot must translate save error reasons into player copy');
assert.match(uiRoot, /Autosaved/, 'uiRoot should show a short autosave completion toast');
assert.match(uiRoot, /Start or load a game before saving/, 'uiRoot should explain no-player save failures');
assert.match(uiRoot, /No save found for /, 'uiRoot should explain load misses');
assert.doesNotMatch(saveLoad, /Saving to /, 'saveLoad should not duplicate the centralized save:started toast');

console.log('Save/resume confidence OK - Continue shows latest-save context and saved nav guidance resumes through the canonical save index.');
