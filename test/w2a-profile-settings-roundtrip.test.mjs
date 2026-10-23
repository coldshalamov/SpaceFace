// W2-A / O15 — Settings the player changed must survive a relaunch and New Game.
//
// The profile (sf.settings.profile.v1) used to omit the glass preset, the pursuit-slot assist, the
// hit pips and the racing-camera settings, so each silently reverted on the next launch although
// Settings showed them as saved. The snapshot now iterates one list (src/save/profileSettings.js);
// this file pins (1) that every control the UI exposes is classified in that list, and (2) a real
// round trip: change through `settings:changed`, read the profile key out of a fake localStorage,
// boot a fresh game on it, expect equality.
// Run: node --test test/w2a-profile-settings-roundtrip.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { createSimulation } from '../src/core/sim.js';
import { createGameState } from '../src/core/gameState.js';
import { PROFILE_SETTINGS_KEY } from '../src/core/graphicsProfileBootstrap.js';
import { save } from '../src/save/saveSystem.js';
import {
  GLASS_PRESET_IDS,
  PROFILE_GAMEPLAY_KEYS,
  PROFILE_GAMEPLAY_PICKERS,
  PROFILE_ROOT_KEYS,
  PROFILE_WHOLE_SECTIONS,
  RACING_RIG_RANGES,
  RUN_SCOPED_GAMEPLAY_KEYS,
  STEERING_VIEW_IDS,
} from '../src/save/profileSettings.js';
import { GLASS_PRESETS } from '../src/ui/hudAttention.js';
import { STEERING_VIEWS, racingRigOf } from '../src/systems/racingSteer.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function memoryStorage() {
  const values = new Map();
  return {
    get length() { return values.size; },
    key(index) { return [...values.keys()][index] ?? null; },
    getItem(key) { return values.has(String(key)) ? values.get(String(key)) : null; },
    setItem(key, value) { values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
  };
}

function withStorage(storage, fn) {
  const previous = globalThis.localStorage;
  globalThis.localStorage = storage;
  try { return fn(); } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

// Every settings control the UI wires: (section, key) pairs from the Settings screen's row helpers
// and from the other screens that publish settings:changed themselves (the racing view toggle).
function exposedSettings() {
  const found = new Map();
  const note = (section, key, file) => {
    const id = `${section}.${key}`;
    if (!found.has(id)) found.set(id, { section, key, file });
  };
  for (const file of walk(path.join(ROOT, 'src', 'ui'))) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    for (const m of text.matchAll(/_set\(\s*ctx\s*,\s*'(\w+)'\s*,\s*'(\w+)'/g)) note(m[1], m[2], rel);
    for (const m of text.matchAll(/_set\(\s*ctx\s*,\s*null\s*,\s*'(\w+)'/g)) note('root', m[1], rel);
    for (const m of text.matchAll(/settings:changed'\s*,\s*\{\s*section:\s*'(\w+)'\s*,\s*key:\s*'(\w+)'/g)) {
      note(m[1], m[2], rel);
    }
  }
  return [...found.values()];
}

test('every control the UI exposes is classified: carried by the profile or deliberately run-scoped', () => {
  const exposed = exposedSettings();
  assert.ok(exposed.length > 40, `scan should see the whole Settings screen, saw ${exposed.length}`);
  const unclassified = [];
  for (const { section, key, file } of exposed) {
    const carried = section === 'root' ? PROFILE_ROOT_KEYS.includes(key)
      : section === 'gameplay' ? (PROFILE_GAMEPLAY_KEYS.includes(key) || key in RUN_SCOPED_GAMEPLAY_KEYS)
        : PROFILE_WHOLE_SECTIONS.includes(section);
    if (!carried) unclassified.push(`${section}.${key} (${file})`);
  }
  assert.deepEqual(unclassified, [],
    'a Settings control that is not in src/save/profileSettings.js is forgotten on the next launch');
  // The keys that used to be forgotten are exposed AND carried now.
  const ids = new Set(exposed.map((e) => `${e.section}.${e.key}`));
  for (const key of ['pursuitSlotAssist', 'steeringView', 'racingDistance', 'racingHeight', 'racingLookAhead', 'racingGhost']) {
    assert.ok(ids.has(`gameplay.${key}`), `${key} is exposed in the UI`);
    assert.ok(PROFILE_GAMEPLAY_KEYS.includes(key), `${key} is carried by the profile`);
  }
  assert.ok(PROFILE_ROOT_KEYS.includes('glassPreset'));
  assert.ok(PROFILE_GAMEPLAY_KEYS.includes('hitPips'));
});

test('the profile lists agree with the owners of the same domains', () => {
  assert.deepEqual([...GLASS_PRESET_IDS].sort(), Object.keys(GLASS_PRESETS).sort(), 'glass presets');
  assert.deepEqual([...STEERING_VIEW_IDS].sort(), [...STEERING_VIEWS].sort(), 'steering views');
  // The racing sliders clamp exactly where the camera rig reads them back.
  const lowRig = racingRigOf({ gameplay: { racingDistance: -1e9, racingHeight: -1e9, racingLookAhead: -1e9 } });
  const highRig = racingRigOf({ gameplay: { racingDistance: 1e9, racingHeight: 1e9, racingLookAhead: 1e9 } });
  assert.deepEqual([lowRig.distance, highRig.distance], [...RACING_RIG_RANGES.racingDistance]);
  assert.deepEqual([lowRig.height, highRig.height], [...RACING_RIG_RANGES.racingHeight]);
  assert.deepEqual([lowRig.lookAhead, highRig.lookAhead], [...RACING_RIG_RANGES.racingLookAhead]);
  assert.deepEqual(Object.keys(PROFILE_GAMEPLAY_PICKERS), PROFILE_GAMEPLAY_KEYS);
});

// A non-default, in-domain value for every profile-carried key.
const CHANGES = {
  root: { uiScale: 1.25, locale: 'fr-FR', showDamageNumbers: false, glassPreset: 'fighter' },
  gameplay: {
    autosaveIntervalS: 300,
    tutorialHints: false,
    controlScheme: 'classic',
    controlSchemeV2: true,
    masslineReleaseAssist: 'arm',
    orbitAssistStrength: 'off',
    targetAssistStrength: 'light',
    damageNumbers: false,
    stuntMoments: 'flow',
    gameSpeed: 0.8,
    velocityVectoring: false,
    pauseOnFocusLoss: false,
    powerFire: 'press',
    pursuitSlotAssist: true,
    hitPips: false,
    steeringView: 'racing',
    racingDistance: 90,
    racingHeight: 40,
    racingLookAhead: 80,
    racingGhost: false,
  },
};

// controlSchemeV2 is a one-way migration flag that is true on every profile, never a player choice.
const FLAG_ONLY_KEYS = new Set(['controlSchemeV2']);

test('the change list covers every profile-carried key and moves each off its default', () => {
  assert.deepEqual(Object.keys(CHANGES.gameplay).sort(), [...PROFILE_GAMEPLAY_KEYS].sort());
  assert.deepEqual(Object.keys(CHANGES.root).sort(), [...PROFILE_ROOT_KEYS].sort());
  const defaults = createGameState(1).settings;
  for (const [key, value] of Object.entries(CHANGES.gameplay)) {
    if (FLAG_ONLY_KEYS.has(key)) continue;
    assert.notDeepEqual(defaults.gameplay[key], value, `gameplay.${key} sample must differ from the default`);
  }
  for (const [key, value] of Object.entries(CHANGES.root)) {
    assert.notDeepEqual(defaults[key], value, `${key} sample must differ from the default`);
  }
});

test('every carried setting survives change -> profile -> fresh boot', () => {
  const storage = memoryStorage();
  withStorage(storage, () => {
    // Session 1: the player changes everything through the same event the Settings screen emits.
    const first = createSimulation({ seed: 7, systems: [save] });
    for (const [key, value] of Object.entries(CHANGES.root)) {
      first.state.settings[key] = value;
      first.bus.emit('settings:changed', { section: null, key, value });
    }
    for (const [key, value] of Object.entries(CHANGES.gameplay)) {
      first.state.settings.gameplay[key] = value;
      first.bus.emit('settings:changed', { section: 'gameplay', key, value });
    }
    const stored = JSON.parse(storage.getItem(PROFILE_SETTINGS_KEY));
    for (const [key, value] of Object.entries(CHANGES.gameplay)) {
      assert.deepEqual(stored.settings.gameplay[key], value, `profile carries gameplay.${key}`);
    }
    for (const [key, value] of Object.entries(CHANGES.root)) {
      assert.deepEqual(stored.settings[key], value, `profile carries ${key}`);
    }
    first.dispose?.();

    // Session 2: relaunch / New Game boot on the same storage with brand-new state.
    const second = createSimulation({ seed: 8, systems: [save] });
    for (const [key, value] of Object.entries(CHANGES.gameplay)) {
      assert.deepEqual(second.state.settings.gameplay[key], value, `gameplay.${key} after relaunch`);
    }
    for (const [key, value] of Object.entries(CHANGES.root)) {
      assert.deepEqual(second.state.settings[key], value, `${key} after relaunch`);
    }
    second.dispose?.();
  });
});

test('out-of-domain values are normalised on the way in, not pinned', () => {
  const storage = memoryStorage();
  withStorage(storage, () => {
    storage.setItem(PROFILE_SETTINGS_KEY, JSON.stringify({
      version: 1,
      settings: {
        glassPreset: 'wide-open',
        gameplay: {
          pursuitSlotAssist: 'yes',
          hitPips: 'no',
          steeringView: 'sideways',
          racingDistance: 'far',
          racingHeight: 9999,
          racingLookAhead: -5,
        },
      },
    }));
    const sim = createSimulation({ seed: 9, systems: [save] });
    const s = sim.state.settings;
    assert.equal(s.glassPreset, 'clean');
    assert.equal(s.gameplay.pursuitSlotAssist, false, 'only a real true enables the assist');
    assert.equal(s.gameplay.hitPips, true, 'pips stay on unless explicitly off');
    assert.equal('steeringView' in s.gameplay, false, 'an unknown view falls back to the reader default');
    assert.equal('racingDistance' in s.gameplay, false, 'a non-numeric distance is dropped, not pinned');
    assert.equal(s.gameplay.racingHeight, RACING_RIG_RANGES.racingHeight[1]);
    assert.equal(s.gameplay.racingLookAhead, RACING_RIG_RANGES.racingLookAhead[0]);
    sim.dispose?.();
  });
});

test('a profile that never carried the new keys leaves the shipped defaults alone', () => {
  const storage = memoryStorage();
  withStorage(storage, () => {
    storage.setItem(PROFILE_SETTINGS_KEY, JSON.stringify({
      version: 1,
      settings: { gameplay: { autosaveIntervalS: 90, powerFire: 'press' } },
    }));
    const sim = createSimulation({ seed: 10, systems: [save] });
    const defaults = createGameState(10).settings;
    assert.equal(sim.state.settings.gameplay.autosaveIntervalS, 90);
    assert.equal(sim.state.settings.gameplay.powerFire, 'press');
    assert.equal(sim.state.settings.glassPreset, defaults.glassPreset);
    assert.equal(sim.state.settings.gameplay.pursuitSlotAssist, false);
    assert.equal(sim.state.settings.gameplay.hitPips, true);
    sim.dispose?.();
  });
});
