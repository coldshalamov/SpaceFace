// FB-100 — HUD scale/opacity, the voice gate, and the five audio buses are real defaulted
// settings keys with rows and readers; the six formerly-hidden video keys keep their shipped
// defaults and gain rows. Asserts default → persist (profile snapshot) → reader for each key.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { save } from '../src/save/saveSystem.js';
import {
  HUD_OPACITY_MAX,
  HUD_OPACITY_MIN,
  HUD_SCALE_MAX,
  HUD_SCALE_MIN,
  applyHudPresentationFromSettings,
} from '../src/ui/hudLayout.js';

const PROFILE_KEY = 'sf.settings.profile.v1';

const NEW_KEYS = [
  ['audio', 'voice', 1],
  ['audio', 'engine', 0.7],
  ['audio', 'ambient', 0.7],
  ['audio', 'combat', 0.7],
  ['audio', 'ui', 0.7],
  ['audio', 'comms', 0.7],
  ['video', 'hudScale', 1],
  ['video', 'hudOpacity', 1],
  ['video', 'screenShake', 100],
];

function makeStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
  };
}

function fakeRoot() {
  const vars = new Map();
  return {
    style: { setProperty: (name, value) => vars.set(name, String(value)) },
    vars,
  };
}

test('the nine parity keys default inside settings without changing the shipped mix/picture', () => {
  const state = createGameState(11);
  for (const [section, key, expected] of NEW_KEYS) {
    assert.equal(state.settings[section][key], expected, `settings.${section}.${key} default`);
  }
});

test('every new key round-trips through the profile snapshot unchanged', () => {
  globalThis.localStorage = makeStorage();
  const state = createGameState(11);
  const bus = createBus();
  save.init({ state, bus, helpers: {}, registry: { get: () => null } });

  const edits = {
    'audio.voice': 0,
    'audio.engine': 0.31,
    'audio.ambient': 0.42,
    'audio.combat': 0.83,
    'audio.ui': 0.55,
    'audio.comms': 0.64,
    'video.hudScale': 1.25,
    'video.hudOpacity': 0.6,
    'video.screenShake': 40,
  };
  for (const [path, value] of Object.entries(edits)) {
    const [section, key] = path.split('.');
    state.settings[section][key] = value;
    bus.emit('settings:changed', { section, key, value });
  }

  const stored = JSON.parse(localStorage.getItem(PROFILE_KEY));
  assert.ok(stored && stored.settings, 'profile snapshot exists');
  for (const [path, value] of Object.entries(edits)) {
    const [section, key] = path.split('.');
    assert.equal(stored.settings[section][key], value, `profile persists ${path}`);
  }
});

test('hudScale/hudOpacity reach #hud as CSS variables through the hudLayout reader', () => {
  const root = fakeRoot();
  const applied = applyHudPresentationFromSettings(
    { video: { hudScale: 1.25, hudOpacity: 0.6 } }, root);
  assert.equal(applied.hudScale, 1.25);
  assert.equal(applied.hudOpacity, 0.6);
  assert.equal(root.vars.get('--sf-hud-scale'), '1.25');
  assert.equal(root.vars.get('--sf-hud-opacity'), '0.6');

  // Absent keys and out-of-range values clamp to the authored band — a stale profile
  // can never hide the HUD outright or blow it past the legible range.
  const def = applyHudPresentationFromSettings({}, fakeRoot());
  assert.equal(def.hudScale, 1);
  assert.equal(def.hudOpacity, 1);
  const clamped = applyHudPresentationFromSettings(
    { video: { hudScale: 99, hudOpacity: 0 } }, fakeRoot());
  assert.equal(clamped.hudScale, HUD_SCALE_MAX);
  assert.equal(clamped.hudOpacity, HUD_OPACITY_MIN);
  assert.ok(HUD_SCALE_MIN > 0 && HUD_OPACITY_MIN > 0);
});

test('every parity key has a live reader — no write-only settings', () => {
  const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const audioSystem = read('src/audio/audioSystem.js');
  for (const bus of ['engine', 'ambient', 'combat', 'ui', 'comms']) {
    assert.match(audioSystem, new RegExp(`a\\.${bus}\\s*==\\s*null`),
      `audioSystem mixes the ${bus} bus`);
  }
  const barkDirector = read('src/systems/barkDirector.js');
  assert.match(barkDirector, /audio\.voice\s*!==\s*0/, 'barkDirector gates speech on audio.voice');
  const cameraOrFeel = read('src/render/camera.js') + read('src/render/feel.js');
  assert.match(cameraOrFeel, /screenShake/, 'the feel path reads video.screenShake');
  const hudCss = read('styles/ui.css');
  assert.match(hudCss, /--sf-hud-scale/, '#hud consumes the HUD scale variable');
  assert.match(hudCss, /--sf-hud-opacity/, '#hud consumes the HUD opacity variable');
});

test('the settings screen exposes a row for each parity key and the six hidden video keys', () => {
  const source = fs.readFileSync(new URL('../src/ui/screens/settings.js', import.meta.url), 'utf8');
  for (const key of ['voice', 'engine', 'ambient', 'combat', 'ui', 'comms',
    'hudScale', 'hudOpacity', 'screenShake',
    'chaseClose', 'postFx', 'sharpen', 'bloomLevels', 'pixelRatioCap', 'bloomThreshold']) {
    assert.match(source, new RegExp(`'${section_key(key)}'`), `settings.js writes ${key}`);
  }
  function section_key(key) { return key; } // key name is the _set argument — the row exists
});

test('defaults that alter the shipped picture/mix are unchanged by this parity pass', () => {
  const state = createGameState(11);
  assert.equal(state.settings.audio.master, 0.55);
  assert.equal(state.settings.audio.sfx, 0.7);
  assert.equal(state.settings.audio.music, 0.32);
  assert.equal(state.settings.video.bloomStrength, 0.52);
  assert.equal(state.settings.video.bloomThreshold, 1.0);
  assert.equal(state.settings.video.pixelRatioCap, 2);
  assert.equal(state.settings.video.bloomLevels, 2);
  assert.equal(state.settings.video.postFx, true);
  assert.equal(state.settings.video.sharpen, false);
  assert.equal(state.settings.video.chaseClose, false);
});
