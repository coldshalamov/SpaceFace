// PRO-07 — "The orbit assist strength survives a new game like the other accessibility keys".
//
// `gameplay.orbitAssistStrength` is a live flight behaviour (flightV3 -> stepAnchorRelativeOrbitAssist)
// with its own Gameplay settings row, but `profileSettingsSnapshot` built an explicit allow-list
// that omitted it — so the pilot's choice was dropped at the profile write and silently reverted to
// 'standard' on the next boot. Two more holes sat in the same block: no domain rule at all, so any
// out-of-domain value reached the kernel, and the autosave interval, whose failure is silent.
//
// Run: node --test test/pro-07-orbit-assist-profile-persistence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { ORBIT_ASSIST_STRENGTH } from '../src/core/flight/orbitAssist.js';
import { bootstrapProfileSettingsBeforeRegistry, PROFILE_SETTINGS_KEY } from '../src/core/graphicsProfileBootstrap.js';
import { save } from '../src/save/saveSystem.js';

const LEGAL = Object.keys(ORBIT_ASSIST_STRENGTH);
const local = () => {
  const store = new Map();
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
};

/**
 * Drive the real profile write: a `settings:changed` event through the live save system into a
 * localStorage stand-in. The system is a module singleton, so each case re-inits it against a
 * fresh state and bus exactly the way the shipped settings check does.
 */
function writeProfile(state, strength) {
  state.settings.gameplay.orbitAssistStrength = strength;
  const storage = local();
  globalThis.localStorage = storage;
  const events = createBus();
  save.init({ state, bus: events, helpers: {}, registry: { get: () => null } });
  events.emit('settings:changed', { section: 'gameplay' });
  const raw = storage.getItem(PROFILE_SETTINGS_KEY);
  return { save, storage, profile: raw ? JSON.parse(raw) : null };
}

test('a chosen orbit assist strength reaches the stored profile', () => {
  const { profile } = writeProfile(createGameState(4242), 'light');
  assert.ok(profile, 'the settings:changed route must actually write a profile');
  assert.equal(profile.settings.gameplay.orbitAssistStrength, 'light');
});

test('every legal strength survives the write and the boot read', () => {
  for (const strength of LEGAL) {
    const state = createGameState(4242);
    const { profile } = writeProfile(state, strength);
    assert.equal(profile.settings.gameplay.orbitAssistStrength, strength, `write: ${strength}`);

    // A fresh state reading the same stored profile must keep the pilot's choice.
    const next = createGameState(4242);
    bootstrapProfileSettingsBeforeRegistry(next, writeProfile(createGameState(4242), strength).storage);
    assert.equal(next.settings.gameplay.orbitAssistStrength, strength, `boot: ${strength}`);
  }
});

test('a save carrying the key restores it, and the profile wins over a save', () => {
  const state = createGameState(4242);
  const { save } = writeProfile(state, 'off');

  // Documented precedence (saveSystem _restoreSettings): the profile is merged last, so a
  // pilot's standing choice outranks whatever an older slot carries.
  save._restoreSettings({ gameplay: { orbitAssistStrength: 'full' } });
  assert.equal(state.settings.gameplay.orbitAssistStrength, 'off',
    'the profile must win over an older save value');

  // With no stored profile the save is the only authority, and the key must survive it.
  const bare = createGameState(4242);
  const events = createBus();
  globalThis.localStorage = local();
  save.init({ state: bare, bus: events, helpers: {}, registry: { get: () => null } });
  save._restoreSettings({ gameplay: { orbitAssistStrength: 'full' } });
  assert.equal(bare.settings.gameplay.orbitAssistStrength, 'full');
});

test('out-of-domain values are clamped to the default instead of reaching the kernel', () => {
  // The hole this closes: sanitizeRestoredSettings guarded controlScheme and
  // masslineReleaseAssist but not this key, so every one of these passed through untouched.
  const bad = ['banana', 'OFF', 'Light', '', 3, 0, null, true, undefined, { evil: 1 }, ['light']];
  for (const value of bad) {
    const state = createGameState(4242);
    const { save } = writeProfile(state, 'standard');
    save._restoreSettings({ gameplay: { orbitAssistStrength: value } });
    const got = state.settings.gameplay.orbitAssistStrength;
    assert.ok(LEGAL.includes(got),
      `${JSON.stringify(value)} reached settings as ${JSON.stringify(got)}, outside the domain`);
    // 'OFF' is the dangerous one: the kernel lowercases, so unclamped it resolves to a legal
    // 'off' and silently disables an assist the pilot never turned off.
    assert.notEqual(got, 'OFF');
  }
});

test('a corrupt autosave interval cannot silently disable interval autosave', () => {
  // The consumer is `intervalS > 0`; a non-numeric value makes that false, so autosave stops
  // firing for the whole session with no error and no receipt.
  for (const value of [{}, [], 'abc', null, -5, NaN]) {
    const state = createGameState(4242);
    const events = createBus();
    globalThis.localStorage = local();
    save.init({ state, bus: events, helpers: {}, registry: { get: () => null } });
    save._restoreSettings({ gameplay: { autosaveIntervalS: value } });
    const got = state.settings.gameplay.autosaveIntervalS;
    assert.equal(typeof got, 'number', `${JSON.stringify(value)} left a non-number interval`);
    assert.ok(got >= 0 && Number.isFinite(got), `${JSON.stringify(value)} produced ${got}`);
  }
});

test('a legal autosave interval is preserved, not reset', () => {
  const state = createGameState(4242);
  const events = createBus();
  globalThis.localStorage = local();
  save.init({ state, bus: events, helpers: {}, registry: { get: () => null } });
  save._restoreSettings({ gameplay: { autosaveIntervalS: 300 } });
  assert.equal(state.settings.gameplay.autosaveIntervalS, 300);
});

test('an untouched profile records the shipped default', () => {
  const { profile } = writeProfile(createGameState(4242), 'standard');
  assert.equal(profile.settings.gameplay.orbitAssistStrength, 'standard');
});

test('difficulty stays out of the profile — the line forbids globalizing it', () => {
  const { profile } = writeProfile(createGameState(4242), 'light');
  assert.equal(profile.settings.gameplay.difficulty, undefined);
});
