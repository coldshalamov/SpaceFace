// VERB-17 follow-up — "the key persists" was only half delivered.
//
// VERB-17 shipped `targetAssistStrength` as a Gameplay setting with its own row and a live
// consumer (autoTargetScale), and its test proved persistence with an in-memory
// `JSON.parse(JSON.stringify(settings))` clone. That never touches profileSettingsSnapshot or
// localStorage, so the key was absent from the profile allow-list: a pilot who set
// "Auto-target assist: Off" got it back on the next launch. The same hole PRO-07 closed for the
// orbit assist, one row over.
//
// This file also pins that the save layer's copy of the domain agrees with the combat kernel's,
// which is why the set is hand-written in saveSystem.js instead of imported.
//
// Run: node --test test/verb-17b-target-assist-profile-persistence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { TARGET_ASSIST_SCALES, targetAssistScale } from '../src/combat/autoTargetMode.js';
import { PROFILE_SETTINGS_KEY } from '../src/core/graphicsProfileBootstrap.js';
import { save } from '../src/save/saveSystem.js';

const LEGAL = Object.keys(TARGET_ASSIST_SCALES);

const local = () => {
  const store = new Map();
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
};

/** Drive the real profile write, the way the shipped settings check does. */
function writeProfile(state, strength) {
  state.settings.gameplay.targetAssistStrength = strength;
  const storage = local();
  globalThis.localStorage = storage;
  const bus = createBus();
  save.init({ state, bus, helpers: {}, registry: { get: () => null } });
  bus.emit('settings:changed', { section: 'gameplay' });
  const raw = storage.getItem(PROFILE_SETTINGS_KEY);
  return { save, storage, profile: raw ? JSON.parse(raw) : null };
}

function bareState() {
  const state = createGameState(4242);
  save.init({ state, bus: createBus(), helpers: {}, registry: { get: () => null } });
  return state;
}

test('a chosen auto-target strength reaches the stored profile', () => {
  const { profile } = writeProfile(createGameState(4242), 'off');
  assert.ok(profile, 'the settings:changed route must actually write a profile');
  assert.equal(profile.settings.gameplay.targetAssistStrength, 'off');
});

test('every legal strength survives the profile write', () => {
  for (const strength of LEGAL) {
    const { profile } = writeProfile(createGameState(4242), strength);
    assert.equal(profile.settings.gameplay.targetAssistStrength, strength, `write: ${strength}`);
  }
});

test('the boot read keeps the choice — the whole point of the profile', () => {
  for (const strength of LEGAL) {
    const storage = writeProfile(createGameState(4242), strength).storage;
    // A fresh session reading that stored profile.
    const next = createGameState(4242);
    globalThis.localStorage = storage;
    save.init({ state: next, bus: createBus(), helpers: {}, registry: { get: () => null } });
    assert.equal(next.settings.gameplay.targetAssistStrength, strength, `boot: ${strength}`);
  }
});

test('an out-of-domain strength clamps to full, never to off', () => {
  // targetAssistScale fails OPEN to full for an unknown key, which is the safe direction: a
  // corrupt value must never be the thing that silently turns a player's assist off. The profile
  // rule has to agree with it rather than inventing a different default.
  for (const value of ['turbo', 'OFF', '', 3, 0, null, true, { evil: 1 }, ['light'], undefined]) {
    const state = bareState();
    globalThis.localStorage = local();
    save._restoreSettings({ gameplay: { targetAssistStrength: value } });
    const got = state.settings.gameplay.targetAssistStrength;
    assert.ok(LEGAL.includes(got), `${JSON.stringify(value)} reached settings as ${JSON.stringify(got)}`);
    assert.equal(got, 'full', `${JSON.stringify(value)} clamped somewhere other than full`);
    assert.equal(targetAssistScale(state), 1, 'an unknown strength must never resolve to zero correction');
  }
});

test('the save layer and the combat kernel agree on the domain', () => {
  // saveSystem.js hand-writes this set so the save layer never gains a flight import edge. This
  // test is what keeps the copy honest.
  const state = bareState();
  globalThis.localStorage = local();
  save._restoreSettings({ gameplay: { targetAssistStrength: 'definitely-not-a-strength' } });
  assert.equal(state.settings.gameplay.targetAssistStrength, 'full');

  const settings = createGameState(4242).settings;
  for (const key of LEGAL) {
    settings.gameplay.targetAssistStrength = key;
    assert.equal(targetAssistScale({ settings }), TARGET_ASSIST_SCALES[key],
      `kernel scale disagrees for "${key}"`);
  }
});

test('off really does mean zero aim correction once restored', () => {
  // End to end: the value the profile carried must be the value the flight code reads.
  const state = bareState();
  globalThis.localStorage = local();
  save._restoreSettings({ gameplay: { targetAssistStrength: 'off' } });
  assert.equal(state.settings.gameplay.targetAssistStrength, 'off');
  assert.equal(targetAssistScale(state), 0);
});

test('an untouched profile records the shipped default', () => {
  const { profile } = writeProfile(createGameState(4242), 'full');
  assert.equal(profile.settings.gameplay.targetAssistStrength, 'full');
});
