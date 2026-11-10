import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';
import { PROFILE_SETTINGS_KEY } from '../src/core/graphicsProfileBootstrap.js';
import { save } from '../src/save/saveSystem.js';
import { applyQualityPreset, matchingQualityPreset } from '../src/render/adaptiveQuality.js';
import { resolveNocturneQuality } from '../src/render/nocturne/runtime.js';

const KEYS = ['nocturne', 'nocturneShadows', 'nocturneAtmosphere', 'nocturneQuality'];
const preferences = video => Object.fromEntries(KEYS.map(key => [key, video[key]]));
function withStorage(fn) {
  const previous = globalThis.localStorage;
  const items = new Map();
  const storage = { getItem: key => items.get(String(key)) ?? null,
    setItem: (key, value) => items.set(String(key), String(value)),
    removeItem: key => items.delete(String(key)), key: i => [...items.keys()][i] ?? null,
    get length() { return items.size; } };
  globalThis.localStorage = storage;
  try { fn(storage); } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
}

test('lighting preferences are part of preset matching and automatic quality scales by hardware', () => {
  const settings = createGameState(1).settings;
  assert.equal(matchingQualityPreset(settings.video), 'medium');
  assert.deepEqual(preferences(settings.video), { nocturne: true, nocturneShadows: false,
    nocturneAtmosphere: true, nocturneQuality: 'auto' });
  settings.video.nocturneQuality = 'high';
  assert.equal(matchingQualityPreset(settings.video), null);
  assert.equal(resolveNocturneQuality(settings.video, { tier: 'integrated' }), 'high');
  const changed = applyQualityPreset(settings, 'low');
  assert.ok(changed.changed.includes('nocturneQuality'));
  assert.equal(resolveNocturneQuality(settings.video, { tier: 'desktop' }), 'integrated');
  applyQualityPreset(settings, 'medium');
  assert.equal(resolveNocturneQuality(settings.video, { tier: 'desktop' }), 'balanced');
  assert.equal(resolveNocturneQuality(settings.video, { tier: 'software' }), 'integrated');
  applyQualityPreset(settings, 'igpu60');
  assert.equal(resolveNocturneQuality(settings.video, { tier: 'desktop' }), 'integrated');
  applyQualityPreset(settings, 'high');
  assert.equal(resolveNocturneQuality(settings.video, { tier: 'desktop' }), 'high');
});

test('lighting toggles and quality survive a real profile round trip', () => withStorage(storage => {
  const first = createSimulation({ seed: 7, systems: [save] });
  const changed = { nocturne: false, nocturneShadows: false, nocturneAtmosphere: false, nocturneQuality: 'high' };
  for (const [key, value] of Object.entries(changed)) {
    first.state.settings.video[key] = value;
    first.bus.emit('settings:changed', { section: 'video', key, value });
  }
  assert.deepEqual(preferences(JSON.parse(storage.getItem(PROFILE_SETTINGS_KEY)).settings.video), changed);
  first.dispose?.();
  const second = createSimulation({ seed: 8, systems: [save] });
  assert.deepEqual(preferences(second.state.settings.video), changed);
  second.dispose?.();
}));

test('old and malformed profiles inherit the same lighting defaults without changing simulation data', () => withStorage(storage => {
  const defaults = preferences(createGameState(1).settings.video);
  for (const video of [{ bloom: false }, { nocturne: 'off', nocturneShadows: 0,
    nocturneAtmosphere: null, nocturneQuality: 'ultra' }]) {
    storage.setItem(PROFILE_SETTINGS_KEY, JSON.stringify({ version: 1, settings: { video } }));
    const sim = createSimulation({ seed: 9, systems: [save] });
    assert.deepEqual(preferences(sim.state.settings.video), defaults);
    assert.equal(sim.state.tick, 0);
    sim.dispose?.();
  }
}));
