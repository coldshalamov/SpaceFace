// Guards profile-level settings persistence: accessibility/control/video/audio preferences must
// survive boot, New Game resets, and old save loads without turning run difficulty into a global.
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { save } from '../src/save/saveSystem.js';

const PROFILE_KEY = 'sf.settings.profile.v1';

globalThis.localStorage = makeStorage();

function initSave(state) {
  const bus = createBus();
  save.init({ state, bus, helpers: {}, registry: { get: () => null } });
  return { bus, save };
}

const first = createGameState(11);
const firstRuntime = initSave(first);
first.settings.uiScale = 1.45;
first.settings.showDamageNumbers = false;
first.settings.audio.master = 0.23;
first.settings.video.motionReduce = true;
first.settings.video.renderScale = 1.1;
first.settings.accessibility.highContrast = true;
first.settings.accessibility.flashReduce = true;
first.settings.controls.gamepad.deadzone = 0.31;
first.settings.controls.touch = { enabled: false };
first.settings.controls.bindings = { boost: ['ShiftRight'] };
first.settings.gameplay.autosaveIntervalS = 300;
first.settings.gameplay.tutorialHints = false;
first.settings.gameplay.difficulty = 'ironman';
firstRuntime.bus.emit('settings:changed', { section: 'accessibility', key: 'highContrast', value: true });

const stored = JSON.parse(localStorage.getItem(PROFILE_KEY));
assert.equal(stored.settings.accessibility.highContrast, true, 'profile store should persist accessibility choices');
assert.equal(stored.settings.video.motionReduce, true, 'profile store should persist reduce-motion');
assert.equal(stored.settings.controls.gamepad.deadzone, 0.31, 'profile store should persist controller preferences');
assert.equal(stored.settings.gameplay.autosaveIntervalS, 300, 'profile store should persist autosave preference');
assert.equal(stored.settings.gameplay.tutorialHints, false, 'profile store should persist tutorial preference');
assert.equal(stored.settings.gameplay.difficulty, undefined, 'profile store must not globalize run difficulty');
assert.equal(stored.settings.gameplay.physicsBackend, undefined, 'profile store must not persist runtime backend forks');

const booted = createGameState(22);
initSave(booted);
assert.equal(booted.settings.uiScale, 1.45, 'boot should load profile UI scale');
assert.equal(booted.settings.showDamageNumbers, false, 'boot should load profile damage-number preference');
assert.equal(booted.settings.audio.master, 0.23, 'boot should load profile audio');
assert.equal(booted.settings.video.motionReduce, true, 'boot should load profile accessibility-backed video');
assert.equal(booted.settings.accessibility.highContrast, true, 'boot should load profile accessibility');
assert.equal(booted.settings.controls.gamepad.deadzone, 0.31, 'boot should load profile controls');
assert.equal(booted.settings.controls.touch.enabled, false, 'boot should load profile touch preference');
assert.deepEqual(booted.settings.controls.bindings, { boost: ['ShiftRight'] }, 'boot should load profile keybinds');
assert.equal(booted.settings.gameplay.autosaveIntervalS, 300, 'boot should load profile autosave preference');
assert.equal(booted.settings.gameplay.tutorialHints, false, 'boot should load profile tutorial preference');
assert.equal(booted.settings.gameplay.difficulty, 'standard', 'boot profile must leave default run difficulty alone');

booted.settings.accessibility.highContrast = false;
booted.settings.video.motionReduce = false;
booted.settings.audio.master = 0.9;
booted.settings.controls.gamepad.deadzone = 0.05;
booted.settings.gameplay.autosaveIntervalS = 60;
booted.settings.gameplay.tutorialHints = true;
booted.settings.gameplay.difficulty = 'veteran';
save._restoreSettings({
  accessibility: { highContrast: false, flashReduce: false },
  video: { motionReduce: false, renderScale: 0.55 },
  audio: { master: 0.9 },
  controls: { gamepad: { enabled: true, deadzone: 0.05, invertY: false }, touch: { enabled: true } },
  gameplay: { autosaveIntervalS: 60, tutorialHints: true, difficulty: 'veteran', physicsBackend: 'legacy' },
});

assert.equal(booted.settings.accessibility.highContrast, true, 'profile accessibility should override old save accessibility');
assert.equal(booted.settings.accessibility.flashReduce, true, 'profile flash preference should override old save accessibility');
assert.equal(booted.settings.video.motionReduce, true, 'profile reduce-motion should override old save video');
assert.equal(booted.settings.video.renderScale, 1.1, 'profile video preference should override old save video');
assert.equal(booted.settings.audio.master, 0.23, 'profile audio should override old save audio');
assert.equal(booted.settings.controls.gamepad.deadzone, 0.31, 'profile controls should override old save controls');
assert.equal(booted.settings.controls.touch.enabled, false, 'profile touch mode should override old save controls');
assert.equal(booted.settings.gameplay.autosaveIntervalS, 300, 'profile autosave should override old save preference');
assert.equal(booted.settings.gameplay.tutorialHints, false, 'profile tutorial preference should override old save preference');
assert.equal(booted.settings.gameplay.difficulty, 'veteran', 'save-slot difficulty should remain run-scoped');
assert.equal(booted.settings.gameplay.physicsBackend, 'rapier-dynamic', 'restored settings must canonicalize physics backend');

console.log('Settings profile persistence OK - accessibility/control preferences survive boot and old save loads without globalizing difficulty.');

function makeStorage() {
  const map = new Map();
  return {
    getItem(key) {
      key = String(key);
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(String(key), String(value));
    },
    removeItem(key) {
      map.delete(String(key));
    },
    clear() {
      map.clear();
    },
  };
}
