// Guards global settings preference persistence: accessibility/audio/input preferences must survive
// browser refreshes and loading older save slots without changing default launch routes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGameState } from '../src/core/gameState.js';
import {
  SETTINGS_PREFS_KEY,
  persistSettingsPrefs,
  restoreSettingsPrefs,
  settingsPrefs,
  settingsPrefsSnapshot,
} from '../src/systems/settingsPrefs.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const registrySrc = readFileSync(join(ROOT, 'src/core/registry.js'), 'utf8');
const prefsSrc = readFileSync(join(ROOT, 'src/systems/settingsPrefs.js'), 'utf8');

assert.match(registrySrc, /import \{ settingsPrefs \} from '\.\.\/systems\/settingsPrefs\.js'/,
  'registry must import the global settings preference system');
assert.match(registrySrc, /settingsPrefs, core, input/,
  'settings preferences must restore before input/audio/ui systems initialize');
assert.match(prefsSrc, /save:loaded/,
  'settings preferences must reapply after loading older save slots');
assert.match(prefsSrc, /settings:changed/,
  'settings preferences must persist whenever the player changes settings');

function makeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}

function makeBus() {
  const handlers = new Map();
  const events = [];
  return {
    events,
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, []);
      handlers.get(type).push(fn);
    },
    emit(type, payload) {
      events.push({ type, payload });
      for (const fn of handlers.get(type) || []) fn(payload);
    },
  };
}

const tuned = createGameState(101).settings;
tuned.audio.muted = true;
tuned.audio.master = 0.21;
tuned.audio.music = 0.09;
tuned.video.motionReduce = true;
tuned.video.renderScale = 1.35;
tuned.accessibility.highContrast = true;
tuned.accessibility.flashReduce = true;
tuned.accessibility.colorblindMode = 'tritanopia';
tuned.uiScale = 1.45;
tuned.showDamageNumbers = false;
tuned.controls.flightMode = 'drift';
tuned.controls.bindings = { forward: ['KeyI', 'ArrowUp'], boost: ['ShiftRight'] };
tuned.controls.gamepad = { enabled: false, deadzone: 0.22, invertY: true };

const storage = makeStorage();
assert.equal(persistSettingsPrefs(tuned, storage), true, 'preference snapshot should write to storage');
assert.ok(storage.getItem(SETTINGS_PREFS_KEY), 'preference snapshot must use the stable prefs key');

const snapshot = settingsPrefsSnapshot(tuned);
assert.deepEqual(snapshot.audio, tuned.audio, 'snapshot must preserve audio preferences');
assert.deepEqual(snapshot.accessibility, tuned.accessibility, 'snapshot must preserve accessibility preferences');
assert.deepEqual(snapshot.controls.bindings, tuned.controls.bindings, 'snapshot must preserve control bindings');

const fresh = createGameState(202).settings;
assert.equal(fresh.audio.muted, false, 'fresh state sanity check should start from defaults');
assert.equal(restoreSettingsPrefs(fresh, storage), true, 'restore should merge persisted prefs into fresh settings');
assert.equal(fresh.audio.muted, true, 'restore must preserve mute preference');
assert.equal(fresh.audio.master, 0.21, 'restore must preserve master volume preference');
assert.equal(fresh.video.motionReduce, true, 'restore must preserve reduce-motion preference');
assert.equal(fresh.video.renderScale, 1.35, 'restore must preserve render-scale preference without changing defaults');
assert.equal(fresh.accessibility.highContrast, true, 'restore must preserve high-contrast preference');
assert.equal(fresh.accessibility.flashReduce, true, 'restore must preserve flash-reduction preference');
assert.equal(fresh.accessibility.colorblindMode, 'tritanopia', 'restore must preserve colorblind palette preference');
assert.equal(fresh.uiScale, 1.45, 'restore must preserve UI scale preference');
assert.equal(fresh.showDamageNumbers, false, 'restore must preserve gameplay readability preference');
assert.deepEqual(fresh.controls.bindings.forward, ['KeyI', 'ArrowUp'], 'restore must preserve key bindings');
assert.deepEqual(fresh.controls.gamepad, { enabled: false, deadzone: 0.22, invertY: true }, 'restore must preserve gamepad preferences');

const pollutedStorage = makeStorage({
  [SETTINGS_PREFS_KEY]: JSON.stringify({
    audio: { master: 0.42 },
    '__proto__': { polluted: true },
    unsafeNewRoot: { shouldNot: 'copy' },
  }),
});
const safe = createGameState(303).settings;
assert.equal(restoreSettingsPrefs(safe, pollutedStorage), true, 'restore should tolerate extra keys in prefs payload');
assert.equal(safe.audio.master, 0.42, 'restore should keep valid known keys from mixed payloads');
assert.equal(Object.prototype.polluted, undefined, 'restore must not allow prototype pollution');
assert.equal(safe.unsafeNewRoot, undefined, 'restore must ignore unknown top-level prefs');

const corrupt = createGameState(404).settings;
assert.equal(restoreSettingsPrefs(corrupt, makeStorage({ [SETTINGS_PREFS_KEY]: '{not-json' })), false,
  'corrupt preference payload should fail closed');
assert.equal(corrupt.audio.master, 0.55, 'corrupt preference payload must leave settings untouched');

const previousLocalStorage = globalThis.localStorage;
const liveStorage = makeStorage({ [SETTINGS_PREFS_KEY]: storage.getItem(SETTINGS_PREFS_KEY) });
globalThis.localStorage = liveStorage;
try {
  const state = createGameState(505);
  const bus = makeBus();
  settingsPrefs.init({ state, bus });
  assert.equal(state.settings.audio.muted, true, 'system init must restore prefs before dependent systems initialize');
  assert.equal(state.settings.accessibility.highContrast, true, 'system init must restore accessibility prefs');

  state.settings.audio.master = 0.33;
  bus.emit('settings:changed', { section: 'audio', key: 'master', value: 0.33 });
  const written = JSON.parse(liveStorage.getItem(SETTINGS_PREFS_KEY));
  assert.equal(written.audio.master, 0.33, 'settings:changed must update the global preference mirror');

  state.settings.audio.master = 0.88;
  state.settings.video.motionReduce = false;
  bus.emit('save:loaded', { slot: 'legacy' });
  assert.equal(state.settings.audio.master, 0.33, 'save:loaded must reapply the global audio preference over stale slot data');
  assert.equal(state.settings.video.motionReduce, true, 'save:loaded must reapply the global accessibility preference over stale slot data');
  assert.ok(bus.events.some((event) => event.type === 'settings:prefsRestored'),
    'save:loaded reapply should emit a diagnostic prefs-restored event');
  assert.ok(bus.events.some((event) => event.type === 'settings:changed' && event.payload && event.payload.section === 'prefs'),
    'save:loaded reapply should notify live systems to reread settings');
} finally {
  if (previousLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousLocalStorage;
}

console.log('Settings prefs OK - global accessibility/audio/input preferences survive boot and stale save-load restores.');
