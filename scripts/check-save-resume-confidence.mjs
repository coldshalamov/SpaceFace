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
import {
  fmtCredits,
  fmtPlaytime,
  shipLabel,
  slotBadges,
  slotObjectiveSummary,
  slotSummaryLines,
} from '../src/ui/screens/saveLoad.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const menu = read('src/ui/screens/mainMenu.js');
const save = read('src/save/saveSystem.js');
const saveLoad = read('src/ui/screens/saveLoad.js');
const uiRoot = read('src/ui/uiRoot.js');
const missions = read('src/systems/missions.js');

// Main menu: Continue must be informative, not a blind button.
assert.match(menu, /sf-menu-save-summary/, 'mainMenu must render a latest-save summary beside Continue');
assert.match(menu, /function readSaveIndex\(ctx\)/, 'mainMenu must read the save index through one helper');
assert.match(menu, /listSlots/, 'mainMenu should prefer save.listSlots() when the save system is available');
assert.match(menu, /LS_PREFIX \+ 'index'/, 'mainMenu should fall back to the canonical localStorage save index');
assert.match(menu, /function latestSave\(slots\)/, 'mainMenu must resolve the latest occupied save slot');
assert.match(menu, /function saveSummaryText\(slot, meta\)/, 'mainMenu must format human-readable save metadata');
assert.match(menu, /function objectiveSummaryText\(meta\)/,
  'mainMenu must accept nav, mission, or story resume metadata from the save index');
assert.match(menu, /Continue: /, 'mainMenu summary must explicitly label what Continue will load');
assert.match(menu, /const latest = latestSave\(readSaveIndex\(ctx\)\);[\s\S]*ctx\.bus\.emit\('game:load',\s*\{\s*slot:\s*latest\.slot\s*\}\)/,
  'Continue should load the exact latest slot displayed in the title summary');
assert.doesNotMatch(menu, /slot:\s*'latest'/,
  'Continue must not ask a second latest resolver to reinterpret the player-visible summary');
assert.doesNotMatch(menu, /boots straight into flight/,
  'mainMenu comments must not claim a divergent/stale boot path');

// Save system: the index must contain enough data for trustworthy resume copy.
for (const field of ['savedAt', 'playtimeS', 'credits', 'sectorName', 'shipName', 'objectiveSummary', 'version']) {
  assert.match(save, new RegExp(field), `save index should include ${field} metadata`);
}
assert.match(save, /idx\[slot\]\s*=\s*\{[\s\S]*sectorName[\s\S]*shipName[\s\S]*navObjectiveSummary[\s\S]*missionSummary[\s\S]*storySummary[\s\S]*objectiveSummary[\s\S]*version/s,
  'save index metadata should include sector, ship, and objective context for the main menu');
assert.match(save, /const navSummary = navObjectiveSummary\(state\.nav\)/,
  'save index should preserve active navigation as the first resume hint');
assert.match(save, /const missionSummary = missionObjectiveSummary\(state\.missions,\s*state\.ui && state\.ui\.trackedMissionId\)/,
  'save index should fall back to active mission context when nav is clear');
assert.match(save, /const storySummary = storyObjectiveSummary\(state\.story\)/,
  'save index should fall back to story context when no nav or active mission exists');
assert.match(save, /objectiveSummary:\s*resumeObjectiveSummary\(\{\s*navSummary,\s*missionSummary,\s*storySummary\s*\}\)/,
  'save index objective metadata should pick nav, then active mission, then story');
assert.match(save, /import \{ STORY_BEATS \} from '\.\.\/data\/missions\.js'/,
  'save index story fallback should use the canonical story beat table');
assert.match(save, /this\.bus\.emit\('save:completed'/, 'save system must emit save:completed for UI confidence feedback');
assert.match(save, /this\.bus\.emit\('save:error'/, 'save system must emit save:error for failed saves/loads');
assert.match(save, /this\.bus\.emit\('save:loaded'/, 'save system must emit save:loaded after restore');
assert.doesNotMatch(save, /Start or load a game before saving/,
  'save system should leave no-player save feedback to uiRoot save-event listeners');
assert.match(save, /bus\.on\('dock:undocked',\s*\(\)\s*=>\s*this\.requestAutosave\('undock',\s*\{\s*force:\s*true\s*\}\)\)/,
  'station departure must force an autosave so cargo and nav intent are durable before the debounce window');
assert.match(save, /if \(!options\.force && now - this\._lastAutosaveAt < AUTOSAVE_DEBOUNCE_MS\) return false;/,
  'forced autosaves should bypass only the debounce gate');

// Save system: player-authored navigation intent must survive Continue/Load.
assert.match(save, /data\.nav\s*=\s*this\._serializeNav\(\)/,
  'save data must include the active navigation intent');
assert.match(save, /_restoreNav\(data\.nav\)/,
  'load restore must rebuild navigation intent before save:loaded listeners run');
assert.match(save, /function sanitizeNavState\(nav\)/,
  'saved navigation must be sanitized into a plain JSON contract');
assert.match(save, /function sanitizeNavWaypoint\(waypoint\)[\s\S]*commodityId/s,
  'trade route waypoints must persist the commodity id needed at the destination market');
assert.match(save, /this\.bus\.emit\('nav:waypoint',\s*restored\.waypoint \|\| null\)/,
  'restoring a save must rebroadcast the restored or cleared waypoint');
assert.match(missions, /_restoreNavigationAfterLoad\(\)[\s\S]*_trackedOrFirstActiveMission\(\)[\s\S]*existing && existing\.kind === 'trade'/,
  'mission save-load repair should preserve saved trade waypoints when no active mission owns navigation');
assert.match(missions, /_restoreNavigationAfterLoad\(\)[\s\S]*_refreshNavigation\(\{\s*silent:\s*true\s*\}\)/,
  'active missions should still reclaim navigation after load');

// Save/Load remains the fuller slot inspector. Main menu and Save/Load must share the same source
// of truth instead of inventing separate storage schemes.
assert.match(saveLoad, /function readSlots\(ctx\)/, 'saveLoad must keep reading slots defensively');
assert.match(saveLoad, /listSlots/, 'saveLoad should also prefer save.listSlots()');
assert.match(saveLoad, /function latestOccupiedSlot\(slots\)/, 'saveLoad must preserve latest-slot resolution for export/selection');
assert.match(saveLoad, /sf-slot-context/, 'saveLoad slot rows must show ship/sector context');
assert.match(saveLoad, /sf-slot-detail/, 'saveLoad slot rows must show save details');
assert.match(saveLoad, /sf-slot-badge/, 'saveLoad slot rows must show status/version badges');
assert.match(saveLoad, /slotSummaryLines\(meta\)/, 'saveLoad must render slot summaries through the tested formatter');
assert.match(saveLoad, /function slotObjectiveSummary\(meta\)/,
  'saveLoad slot details must read nav, mission, or story resume metadata');
assert.match(saveLoad, /slotBadges\(id,\s*meta,\s*currentSlot,\s*latestSlot\)/,
  'saveLoad must render current/latest/version badges through the tested formatter');
assert.match(menu, /objectiveSummary/, 'mainMenu Continue summary must include saved objective context when available');
assert.match(saveLoad, /objectiveSummary/, 'saveLoad slot details must include saved objective context when available');
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
  objectiveSummary: 'Route: Tethys Trade Hub - Provisions',
  version: 5,
});
assert.equal(summary.context, 'Helios Reach - Kestrel Runner', 'saveLoad context should combine sector and ship');
assert.match(summary.detail, /Route: Tethys Trade Hub - Provisions/, 'saveLoad detail should include saved objective context');
assert.match(summary.detail, /1h 1m played/, 'saveLoad detail should include playtime');
assert.match(summary.detail, /12,345 CR/, 'saveLoad detail should include credits');
assert.equal(slotObjectiveSummary({ storySummary: 'Story: Honest Work - Accept a haul' }), 'Story: Honest Work - Accept a haul',
  'saveLoad should show story context for quiet saves without active nav');
assert.equal(slotObjectiveSummary({ missionSummary: 'Mission: Supply Run', storySummary: 'Story: Honest Work' }), 'Mission: Supply Run',
  'saveLoad should prefer active mission context over story context');
assert.equal(slotObjectiveSummary({ navObjectiveSummary: 'Route: Helios Gate', missionSummary: 'Mission: Supply Run' }), 'Route: Helios Gate',
  'saveLoad should prefer active navigation context over mission context');
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

console.log('Save/resume confidence OK - title Continue shows latest-save context and loads the displayed slot.');
