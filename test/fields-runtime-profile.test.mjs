// HAND-FIELDS-GUARD (build_map row 38, ledger D87) — the continuous-field kernel
// (PQ-012: Well/Repulsor/Cone/Sheet) and the PQ-013 planet site ship ON under the
// production runtime profile and OFF under the legacy47a golden pin. The field is the
// guard: a regression that flipped production to OFF — or let a stale partial config
// silently inherit — would leave every shipped field power "implemented" but dead on
// the real route, which is exactly the failure this file exists to fail on.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { PLANET_FLAGS } from '../src/data/planets.js';
import {
  applyFeatureConfigToMaps,
  featureConfigFromMaps,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../src/data/featureFlags.js';
import {
  LEGACY47A_FEATURES,
  PRODUCTION_FEATURES,
  RUNTIME_PROFILES,
  cloneFeatureConfig,
  getRuntimeProfile,
} from '../src/runtime/runtimeProfiles.js';
import { resolveRuntimeManifest } from '../src/runtime/resolveRuntimeManifest.js';
import {
  PRODUCTION_INIT_ORDER,
  PRODUCTION_UPDATE_ORDER,
} from '../src/runtime/authoritativeSystemManifest.js';

test('production profile ships fields and planets ON; legacy47a keeps the pin OFF', () => {
  assert.equal(PRODUCTION_FEATURES.fields.enabled, true,
    'production must ship the field kernel — a flag OFF in production is a dead feature');
  assert.equal(PRODUCTION_FEATURES.planets.enabled, true);
  assert.equal(LEGACY47A_FEATURES.fields.enabled, false,
    'the 47-A golden predates the field kernel — the pin keeps its bytes stable');
  assert.equal(LEGACY47A_FEATURES.planets.enabled, false);
});

test('the default runtime profile is production, not a quietly-reduced set', () => {
  const profile = getRuntimeProfile();
  assert.equal(profile.id, 'production');
  assert.equal(profile.features.fields.enabled, true);
  assert.equal(getRuntimeProfile('').id, 'production', 'empty profile id falls back to production');
  assert.equal(getRuntimeProfile(null).id, 'production');
  assert.throws(() => getRuntimeProfile('nonsense'), /Unknown runtime profile/);
  assert.equal(RUNTIME_PROFILES.legacy47a.features.fields.enabled, false);
});

test('a real registry boot at production applies FIELD_FLAGS to the live kernel map', () => {
  const snapshot = snapshotFeatureMaps();
  try {
    const state = createGameState(38);
    const registry = createRegistry({ state, bus: createBus(), helpers: {} });
    assert.equal(FIELD_FLAGS.enabled, true,
      'after a production boot the field kernel flag map must read ON — FIELD_FLAGS is what fields.js actually gates on');
    assert.equal(PLANET_FLAGS.enabled, true);
    assert.equal(registry.runtimeManifest.features.fields.enabled, true,
      'the instance-bound config must carry the same truth the process map does');
    assert.equal(state.runtime.features.fields.enabled, true,
      'state.runtime.features is the save/replay-visible record of what ran');
  } finally {
    restoreFeatureMaps(snapshot);
  }
});

test('the legacy47a profile holds the OFF pin through the real apply path', () => {
  const snapshot = snapshotFeatureMaps();
  try {
    // The curated 47-A set is materialized via createSimulation, not a full registry —
    // the pin's wire is resolveRuntimeManifest → applyFeatureConfigToMaps, same as boot.
    const legacy = resolveRuntimeManifest({ profileId: 'legacy47a' });
    assert.equal(legacy.profileId, 'legacy47a');
    applyFeatureConfigToMaps(legacy.features);
    assert.equal(FIELD_FLAGS.enabled, false,
      'the golden profile must not leak field forces into 47-A replays');
    assert.equal(PLANET_FLAGS.enabled, false);
    // …and a production re-apply in the same process restores ON (sequential replay safety).
    applyFeatureConfigToMaps(PRODUCTION_FEATURES);
    assert.equal(FIELD_FLAGS.enabled, true);
    assert.equal(PLANET_FLAGS.enabled, true);
  } finally {
    restoreFeatureMaps(snapshot);
  }
});

test('a partial config that predates the fields family reads OFF, never inherits a stale map', () => {
  const cloned = cloneFeatureConfig({
    combat: { missileV2: true },
    massline2: { enabled: true },
    travel: { travelBurn: true },
    // no fields/planets keys at all — a config serialized before those families existed
  });
  assert.equal(cloned.fields.enabled, false);
  assert.equal(cloned.planets.enabled, false);
  // …but a real production config keeps its authored ON through the same clone.
  const prod = cloneFeatureConfig(PRODUCTION_FEATURES);
  assert.equal(prod.fields.enabled, true);
  assert.equal(prod.planets.enabled, true);
});

test('fields and planetRuntime are members of the production manifest, not bolt-ons', () => {
  assert.ok(PRODUCTION_INIT_ORDER.includes('fields'), 'fields must init on the production route');
  assert.ok(PRODUCTION_UPDATE_ORDER.includes('fields'), 'fields must tick on the production route');
  assert.ok(PRODUCTION_INIT_ORDER.includes('planetRuntime'));
  assert.ok(PRODUCTION_UPDATE_ORDER.includes('planetRuntime'));
  // The kernel feeds the physics membrane same-tick: it must still sit before physics.
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('fields') < PRODUCTION_UPDATE_ORDER.indexOf('physics'),
    'field forces queued after the physics solve would arrive a tick stale');
});

test('featureConfigFromMaps round-trips what a boot actually set', () => {
  const snapshot = snapshotFeatureMaps();
  try {
    const state = createGameState(38);
    createRegistry({ state, bus: createBus(), helpers: {} });
    const live = featureConfigFromMaps();
    assert.equal(live.fields.enabled, true);
    assert.equal(live.planets.enabled, true);
  } finally {
    restoreFeatureMaps(snapshot);
  }
});
