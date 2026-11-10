// Row 493 — Settings → Gameplay → Powers. "Use on press" must survive a relaunch (the profile
// allow-list in saveSystem.profileSettingsSnapshot drops any gameplay key it does not name), and
// the Gameplay page reset must return it to "Hold to preview" (the shipped defaults omit the key,
// so the reset reaches it through RESET_FALLBACKS).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { PROFILE_SETTINGS_KEY, bootstrapProfileSettingsBeforeRegistry } from '../src/core/graphicsProfileBootstrap.js';
import { save } from '../src/save/saveSystem.js';
import { powersFireOnPress } from '../src/systems/powerVerbs.js';
import { settingsPageResetPlan, settingsScreen } from '../src/ui/screens/settings.js';

const local = () => {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
};

function writeProfile(state) {
  const storage = local();
  globalThis.localStorage = storage;
  const bus = createBus();
  save.init({ state, bus, helpers: {}, registry: { get: () => null } });
  bus.emit('settings:changed', { section: 'gameplay', key: 'powerFire' });
  return storage;
}

test('"Use on press" reaches the stored profile and a fresh launch reads it back', () => {
  const state = createGameState(4931);
  const bus = createBus();
  settingsScreen._set({ state, bus }, 'gameplay', 'powerFire', 'press');
  assert.equal(powersFireOnPress(state), true);
  const storage = writeProfile(state);
  const profile = JSON.parse(storage.getItem(PROFILE_SETTINGS_KEY));
  assert.equal(profile.settings.gameplay.powerFire, 'press');

  const relaunched = createGameState(4931);
  assert.equal(powersFireOnPress(relaunched), false, 'a fresh state is hold to preview');
  assert.equal(bootstrapProfileSettingsBeforeRegistry(relaunched, storage), true);
  assert.equal(relaunched.settings.gameplay.powerFire, 'press');
  assert.equal(powersFireOnPress(relaunched), true, 'the choice survives the relaunch');
});

test('the shipped default stores as hold, and a stray value reads as hold', () => {
  const storage = writeProfile(createGameState(4932));
  assert.equal(JSON.parse(storage.getItem(PROFILE_SETTINGS_KEY)).settings.gameplay.powerFire, 'hold');
  const state = createGameState(4932);
  state.settings.gameplay.powerFire = 'sometimes';
  assert.equal(powersFireOnPress(state), false);
});

test('the Gameplay page reset returns Powers to hold to preview', () => {
  const defaults = createGameState(0).settings;
  const item = settingsPageResetPlan('Gameplay', defaults).find((row) => row.key === 'powerFire');
  assert.deepEqual(item, { section: 'gameplay', key: 'powerFire', value: 'hold', fallback: true });
  const state = createGameState(4933);
  const bus = createBus();
  state.settings.gameplay.powerFire = 'press';
  settingsScreen._resetPage({ state, bus }, 'Gameplay');
  assert.equal(state.settings.gameplay.powerFire, 'hold');
  assert.equal(powersFireOnPress(state), false);
});
