// Phase 2: explicit runtime profiles + instance-isolated feature config.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  COMBAT_FLAGS,
  MASSLINE2_FLAGS,
  TRAVEL_FLAGS,
  applyFeatureConfigToMaps,
  combatFlag,
  featureConfigFromMaps,
  massline2Flag,
  restoreFeatureMaps,
  snapshotFeatureMaps,
  travelFlag,
} from '../src/data/featureFlags.js';
import {
  LEGACY47A_FEATURES,
  PRODUCTION_FEATURES,
  RUNTIME_PROFILES,
  freezeFeatureConfig,
  getRuntimeProfile,
} from '../src/runtime/runtimeProfiles.js';
import { resolveRuntimeManifest } from '../src/runtime/resolveRuntimeManifest.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { fingerprintPayload } from '../src/runtime/runtimeFingerprint.js';

test('production resolves identical feature values regardless of simulated host context', () => {
  const nodeLike = resolveRuntimeManifest({ profileId: 'production', nodeSafeOnly: true });
  const browserLike = resolveRuntimeManifest({ profileId: 'production', nodeSafeOnly: false });

  assert.deepEqual(nodeLike.features, browserLike.features);
  assert.deepEqual(nodeLike.features, freezeFeatureConfig(PRODUCTION_FEATURES));
  assert.equal(nodeLike.features.combat.missileV2, true);
  assert.equal(nodeLike.features.massline2.enabled, true);
  assert.equal(nodeLike.features.travel.travelBurn, true);
  assert.equal(nodeLike.features.combat.momentumInherit, false);
  // Host adapters may drop presentation systems; feature values stay identical.
  assert.notEqual(
    nodeLike.authoritativeSystemIds.length,
    browserLike.authoritativeSystemIds.length,
  );
});

test('legacy47a resolves deliberately and independently of production', () => {
  const legacy = resolveRuntimeManifest({ profileId: 'legacy47a' });
  const production = resolveRuntimeManifest({ profileId: 'production' });

  assert.equal(legacy.profileId, 'legacy47a');
  assert.deepEqual(legacy.features, freezeFeatureConfig(LEGACY47A_FEATURES));
  assert.equal(legacy.features.combat.weaponImpulseConsequences, false);
  assert.equal(legacy.features.massline2.enabled, false);
  assert.equal(legacy.features.travel.travelBurn, false);

  assert.notEqual(legacy.profileHash, production.profileHash);
  assert.notEqual(legacy.manifestHash, production.manifestHash);
  assert.notDeepEqual(legacy.features, production.features);
  assert.ok(legacy.authoritativeSystemIds.length < production.authoritativeSystemIds.length);
});

test('two runtime instances with different profiles do not cross-contaminate instance config', () => {
  const snap = snapshotFeatureMaps();
  try {
    const prod = createAuthoritativeRuntime({
      profileId: 'production',
      seed: 1,
      systems: [], // focused empty — bind config without requiring system factories
      seedProcessMaps: false,
      createSimulation: false,
    });
    const legacy = createAuthoritativeRuntime({
      profileId: 'legacy47a',
      seed: 2,
      systems: [],
      seedProcessMaps: false,
      createSimulation: false,
    });

    assert.equal(prod.config.features.massline2.enabled, true);
    assert.equal(legacy.config.features.massline2.enabled, false);
    assert.equal(prod.config.features.combat.weaponImpulseConsequences, true);
    assert.equal(legacy.config.features.combat.weaponImpulseConsequences, false);

    // Instance configs are distinct frozen objects.
    assert.notEqual(prod.config.features, legacy.config.features);
    assert.notEqual(prod.config.features.combat, legacy.config.features.combat);

    // Mutating process MAPS must not rewrite frozen instance config.
    applyFeatureConfigToMaps(LEGACY47A_FEATURES);
    assert.equal(prod.config.features.massline2.enabled, true);
    assert.equal(combatFlag('missileV2', prod.config.features), true);
    assert.equal(combatFlag('missileV2', legacy.config.features), false);
  } finally {
    restoreFeatureMaps(snap);
  }
});

test('profile resolution is immutable after init', () => {
  const resolved = resolveRuntimeManifest({ profileId: 'production' });
  assert.ok(Object.isFrozen(resolved));
  assert.ok(Object.isFrozen(resolved.features));
  assert.ok(Object.isFrozen(resolved.features.combat));
  assert.ok(Object.isFrozen(resolved.authoritativeSystemIds));

  assert.throws(() => {
    // @ts-expect-error intentional mutation
    resolved.profileId = 'legacy47a';
  });
  assert.throws(() => {
    // @ts-expect-error intentional mutation
    resolved.features.combat.missileV2 = false;
  });

  const profile = getRuntimeProfile('production');
  assert.ok(Object.isFrozen(profile));
  assert.ok(Object.isFrozen(RUNTIME_PROFILES));
});

test('no migrated authoritative feature defaults branch on host environment', () => {
  const featureFlagsSrc = readFileSync(
    fileURLToPath(new URL('../src/data/featureFlags.js', import.meta.url)),
    'utf8',
  );
  const profilesSrc = readFileSync(
    fileURLToPath(new URL('../src/runtime/runtimeProfiles.js', import.meta.url)),
    'utf8',
  );
  const resolveSrc = readFileSync(
    fileURLToPath(new URL('../src/runtime/resolveRuntimeManifest.js', import.meta.url)),
    'utf8',
  );

  // Migrated defaults must not reintroduce env-derived selection in code
  // (comments may mention the old model; strip them before scanning).
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const featureCode = stripComments(featureFlagsSrc);
  const profileCode = stripComments(profilesSrc);
  const resolveCode = stripComments(resolveSrc);
  assert.equal(featureCode.includes('typeof window'), false,
    'featureFlags.js must not derive defaults from typeof window');
  assert.equal(featureCode.includes('process.env'), false);
  assert.equal(profileCode.includes('typeof window'), false);
  assert.equal(profileCode.includes('process.env'), false);
  assert.equal(resolveCode.includes('typeof window'), false);
  assert.equal(resolveCode.includes('process.env'), false);

  // Production feature table is explicit true/false literals (via frozen objects).
  assert.equal(PRODUCTION_FEATURES.combat.missileV2, true);
  assert.equal(LEGACY47A_FEATURES.combat.missileV2, false);
});

test('process MAP seed + restore keeps test Object.assign contract', () => {
  const snap = snapshotFeatureMaps();
  try {
    applyFeatureConfigToMaps(PRODUCTION_FEATURES);
    assert.equal(MASSLINE2_FLAGS.enabled, true);
    assert.equal(TRAVEL_FLAGS.travelBurn, true);
    assert.equal(COMBAT_FLAGS.weaponImpulseConsequences, true);

    // Tests still mutate MAPS via Object.assign / property write.
    const previous = COMBAT_FLAGS.weaponImpulseConsequences;
    COMBAT_FLAGS.weaponImpulseConsequences = false;
    assert.equal(combatFlag('weaponImpulseConsequences'), false);
    COMBAT_FLAGS.weaponImpulseConsequences = previous;

    Object.assign(MASSLINE2_FLAGS, { enabled: true, throw: true });
    assert.equal(massline2Flag('throw'), true);

    applyFeatureConfigToMaps(LEGACY47A_FEATURES);
    assert.equal(massline2Flag('throw'), false);
    assert.equal(travelFlag('dashMomentum'), false);
    assert.deepEqual(featureConfigFromMaps().combat, { ...LEGACY47A_FEATURES.combat });
  } finally {
    restoreFeatureMaps(snap);
  }
});

test('profile fingerprints are stable across repeated resolves', () => {
  const a = resolveRuntimeManifest({ profileId: 'production' });
  const b = resolveRuntimeManifest({ profileId: 'production' });
  assert.equal(a.profileHash, b.profileHash);
  assert.equal(a.manifestHash, b.manifestHash);
  assert.match(a.profileHash, /^[a-f0-9]{64}$/);
  assert.match(a.manifestHash, /^[a-f0-9]{64}$/);

  const again = fingerprintPayload({
    schema: 'spaceface.runtimeProfile.v1',
    profileId: 'production',
    systemSet: 'production',
    features: freezeFeatureConfig(PRODUCTION_FEATURES),
  });
  assert.equal(again, a.profileHash);
});
