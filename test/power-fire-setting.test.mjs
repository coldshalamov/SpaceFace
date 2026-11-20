// Settings → Gameplay → "Powers: aim first" (ruling R17, 2026-11-20: every power acts on press by
// default). The opt-in must survive a relaunch (the profile allow-list in
// saveSystem.profileSettingsSnapshot drops any gameplay key it does not name), and the Gameplay
// page reset must return it to press (the shipped defaults omit the key; RESET_FALLBACKS reach it).
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

test('"Aim first" reaches the stored profile and a fresh launch reads it back', () => {
  const state = createGameState(4931);
  const bus = createBus();
  settingsScreen._set({ state, bus }, 'gameplay', 'powerFire', 'aim');
  assert.equal(powersFireOnPress(state), false);
  const storage = writeProfile(state);
  const profile = JSON.parse(storage.getItem(PROFILE_SETTINGS_KEY));
  assert.equal(profile.settings.gameplay.powerFire, 'aim');

  const relaunched = createGameState(4931);
  assert.equal(powersFireOnPress(relaunched), true,
    'R17: one input rule for all five powers: they act on press, at the cursor');
  assert.equal(bootstrapProfileSettingsBeforeRegistry(relaunched, storage), true);
  assert.equal(relaunched.settings.gameplay.powerFire, 'aim');
  assert.equal(powersFireOnPress(relaunched), false, 'the choice survives the relaunch');
});

test('the shipped default stores as press; the old stored default "hold" and stray values read as press', () => {
  const storage = writeProfile(createGameState(4932));
  assert.equal(JSON.parse(storage.getItem(PROFILE_SETTINGS_KEY)).settings.gameplay.powerFire, 'press');
  const state = createGameState(4932);
  for (const stale of ['hold', 'sometimes', undefined]) {
    state.settings.gameplay.powerFire = stale;
    assert.equal(powersFireOnPress(state), true,
      `"${stale}" acts on press: the old hold default was never a choice the player made`);
  }
});

test('the Gameplay page reset returns Powers to act on press', () => {
  const defaults = createGameState(0).settings;
  const item = settingsPageResetPlan('Gameplay', defaults).find((row) => row.key === 'powerFire');
  assert.deepEqual(item, { section: 'gameplay', key: 'powerFire', value: 'press', fallback: true });
  const state = createGameState(4933);
  const bus = createBus();
  state.settings.gameplay.powerFire = 'aim';
  settingsScreen._resetPage({ state, bus }, 'Gameplay');
  assert.equal(state.settings.gameplay.powerFire, 'press');
  assert.equal(powersFireOnPress(state), true);
});
