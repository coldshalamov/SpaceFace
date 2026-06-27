// Guards profile-level settings persistence: accessibility/audio/control choices are user preferences,
// not campaign state, so old save slots must not silently override them.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  applySettingsUiScale,
  persistSettingsProfile,
  readSettingsProfile,
  restoreSettingsProfile,
} from '../src/save/settingsProfile.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
}

const storage = new MemoryStorage();
const profile = {
  uiScale: 1.45,
  audio: { muted: true, master: 0.33 },
  video: { motionReduce: true },
  accessibility: { highContrast: true, flashReduce: true },
  controls: { gamepad: { enabled: true, deadzone: 0.24, invertY: true }, touch: { enabled: true } },
};

assert.equal(persistSettingsProfile(profile, storage), true, 'profile settings should write to storage');
assert.deepEqual(readSettingsProfile(storage), profile, 'profile settings should round-trip as plain JSON');

const loadedSaveState = {
  settings: {
    uiScale: 1,
    audio: { muted: false, master: 0.9, music: 0.2 },
    video: { motionReduce: false, fov: 55 },
    accessibility: { highContrast: false, flashReduce: false, colorblindMode: 'none' },
    controls: { gamepad: { enabled: true, deadzone: 0.12, invertY: false }, touch: { enabled: null } },
    gameplay: { autosaveIntervalS: 120, tutorialHints: true },
  },
};
assert.equal(restoreSettingsProfile(loadedSaveState, storage), true, 'profile should restore over save-loaded settings');
assert.equal(loadedSaveState.settings.audio.muted, true, 'profile audio mute should outvote old slot audio');
assert.equal(loadedSaveState.settings.audio.music, 0.2, 'merge should preserve save/default fields absent from profile');
assert.equal(loadedSaveState.settings.video.motionReduce, true, 'profile motion-reduce should outvote old slot video');
assert.equal(loadedSaveState.settings.video.fov, 55, 'merge should not erase unrelated video settings');
assert.equal(loadedSaveState.settings.accessibility.highContrast, true, 'profile high-contrast should outvote old slot accessibility');
assert.equal(loadedSaveState.settings.controls.gamepad.deadzone, 0.24, 'profile controls should outvote old slot controls');

const uiScaleWrites = {};
const fakeRoot = { style: { setProperty(key, value) { uiScaleWrites[key] = value; } } };
assert.equal(applySettingsUiScale({ uiScale: 3 }, fakeRoot), 2, 'ui scale should clamp high values');
assert.equal(uiScaleWrites['--ui-scale'], '2', 'ui scale should write the shipped CSS variable');
assert.equal(applySettingsUiScale({ uiScale: 0.1 }, fakeRoot), 0.75, 'ui scale should clamp low values');
assert.equal(uiScaleWrites['--ui-scale'], '0.75', 'ui scale should write the low clamp');

const badStorage = { getItem() { throw new Error('locked'); }, setItem() { throw new Error('locked'); } };
assert.equal(readSettingsProfile(badStorage), null, 'locked storage read should not throw');
assert.equal(persistSettingsProfile(profile, badStorage), false, 'locked storage write should not throw');
assert.equal(restoreSettingsProfile({ settings: {} }, badStorage), false, 'locked storage restore should not throw');

const registrySrc = await readFile(join(ROOT, 'src/core/registry.js'), 'utf8');
assert.match(registrySrc, /restoreSettingsProfile\(ctx\.state\)/, 'registry must restore profile before system selection/init');
assert.match(registrySrc, /persistSettingsProfile\(ctx\.state\.settings\)/, 'settings changes must persist immediately');
assert.match(registrySrc, /bus\.on\('save:loaded', \(\) => \{\s*restoreSettingsProfile\(ctx\.state\);/s,
  'save load must re-apply profile settings after slot settings restore');
assert.match(registrySrc, /applySettingsUiScale\(ctx\.state\.settings\)/, 'profile UI scale must apply outside the settings slider path');
assert.match(registrySrc, /const aiSlot = selectAISystem\(ctx\)/, 'registry should still preserve canonical system selection');

const packageJson = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8'));
assert.equal(packageJson.scripts['check:settings-profile'], 'node scripts/check-settings-profile.mjs', 'package must expose focused settings-profile check');
assert.match(packageJson.scripts.check, /npm run check:settings-profile/, 'full check must include settings-profile guard');
assert.match(packageJson.scripts['check:ci'], /npm run check:settings-profile/, 'CI check must include settings-profile guard');

console.log('Settings profile OK - preferences persist before first save and survive old-slot loads.');
