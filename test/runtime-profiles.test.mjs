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
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import { createSimulation } from '../src/core/sim.js';

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

test('feature MAP isolation: production step after legacy creation observes production flags (restore-on-step)', () => {
  const snap = snapshotFeatureMaps();
  try {
    // Seed process MAPS so call sites that read combatFlag() without features see the bind.
    const observed = { duringProdStep: null, afterProdStep: null, duringLegacyStep: null };

    const flagProbe = (bucket) => ({
      name: 'flagProbe',
      update(_dt, state) {
        // Process-global readers (no features arg) must see THIS runtime's profile during step.
        state[bucket] = {
          weaponImpulseConsequences: combatFlag('weaponImpulseConsequences'),
          masslineEnabled: massline2Flag('enabled'),
          travelBurn: travelFlag('travelBurn'),
          missileV2: combatFlag('missileV2'),
        };
      },
    });

    const prod = createAuthoritativeRuntime({
      profileId: 'production',
      seed: 11,
      systems: [flagProbe('_prodObs')],
      seedProcessMaps: true,
    });
    const legacy = createAuthoritativeRuntime({
      profileId: 'legacy47a',
      seed: 22,
      systems: [flagProbe('_legacyObs')],
      seedProcessMaps: true,
    });

    // Creating legacy last would permanently overwrite MAPS under the old bug.
    // After restore-on-step, stepping production must still see production flags.
    assert.equal(prod.featureMapIsolation, 'restore-on-step');
    assert.equal(legacy.featureMapIsolation, 'restore-on-step');

    prod.step(1 / 60);
    observed.duringProdStep = prod.state._prodObs;
    observed.afterProdStep = {
      weaponImpulseConsequences: combatFlag('weaponImpulseConsequences'),
      masslineEnabled: massline2Flag('enabled'),
    };

    assert.deepEqual(observed.duringProdStep, {
      weaponImpulseConsequences: true,
      masslineEnabled: true,
      travelBurn: true,
      missileV2: true,
    }, 'production step must bind production flags while systems run');

    // After step, MAPS restore to pre-step snapshot (not permanently production).
    // Do not require a specific residual value — only that the next runtime's step is correct.
    legacy.step(1 / 60);
    observed.duringLegacyStep = legacy.state._legacyObs;
    assert.deepEqual(observed.duringLegacyStep, {
      weaponImpulseConsequences: false,
      masslineEnabled: false,
      travelBurn: false,
      missileV2: false,
    }, 'legacy step after production must bind legacy flags while systems run');

    // Instance configs remain frozen and uncontaminated throughout.
    assert.equal(prod.config.features.massline2.enabled, true);
    assert.equal(legacy.config.features.massline2.enabled, false);

    prod.dispose();
    legacy.dispose();
  } finally {
    restoreFeatureMaps(snap);
  }
});

test('createAuthoritativeRuntime steps systems in authoritativeUpdateOrder, not init order', () => {
  // Init order starts with voiceArbiter before input; update order starts with input.
  // Capture the sequence of update() calls and compare to the resolved update-order IDs.
  const stepOrder = [];
  const makeSys = (name) => ({
    name,
    init() {},
    update() { stepOrder.push(name); },
  });

  // Use a mini explicit list first? No — need materialised production update order.
  // Build a lookup of stub systems for a small slice that still differs init vs update.
  // Simpler: materialize full node-safe production via createAuthoritativeRuntime with systemLookup.
  // That's heavy. Instead resolve IDs and pass stubs for every update-order id, plus a decoy
  // that only appears in init order (would step first under the old bug).

  const resolved = resolveRuntimeManifest({ profileId: 'production', nodeSafeOnly: true });
  const updateIds = [...resolved.authoritativeUpdateOrderIds];
  const initIds = [...resolved.authoritativeSystemIds].filter((id) => id !== 'core');

  // Build stubs; slot IDs materialize to named stubs. Core is in the init list but
  // createSimulation always prepends its own core definition — provide a placeholder for resolve.
  const lookup = new Map();
  lookup.set('core', makeSys('core'));
  for (const id of new Set([...initIds, ...updateIds])) {
    if (id === 'aiSlot' || id === 'flightSlot' || id === 'core') continue;
    lookup.set(id, makeSys(id));
  }
  const aiStub = makeSys('ai');
  const flightStub = makeSys('flight');
  lookup.set('aiSlot', aiStub);
  lookup.set('flightSlot', flightStub);
  lookup.set('ai', aiStub);
  lookup.set('flight', flightStub);

  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    seed: 99,
    systemLookup: lookup,
    slots: {
      aiSlot: aiStub,
      flightSlot: flightStub,
      aiBackend: 'legacy',
      flightBackend: 'legacy',
    },
    nodeSafeOnly: true,
    seedProcessMaps: false,
  });

  stepOrder.length = 0;
  runtime.step(1 / 60);

  // Map stepped system names back to manifest slot IDs for comparison.
  const steppedAsIds = stepOrder.map((n) => {
    if (n === 'ai' || n === 'tacticalAI') return 'aiSlot';
    if (n === 'flight') return 'flightSlot';
    return n;
  });

  assert.deepEqual(
    steppedAsIds,
    updateIds,
    'runtime must step exactly authoritativeUpdateOrder (not init/registration order)',
  );
  // Guard against the old bug: init order starts with voiceArbiter, update with input.
  assert.equal(updateIds[0], 'input');
  assert.notEqual(initIds[0], 'input');
  assert.equal(steppedAsIds[0], 'input', 'first stepped system must be input (update order)');
  assert.ok(!stepOrder.includes('core'), 'core is not an update-order system');

  runtime.dispose();
});

test('manifestHash includes selected flight/AI backends (different backends → different hash)', () => {
  const base = {
    profileId: 'production',
    nodeSafeOnly: true,
  };
  const v3 = resolveRuntimeManifest({
    ...base,
    slots: {
      aiSlot: { name: 'tacticalAI' },
      flightSlot: { name: 'flight' },
      aiBackend: 'sg06-tactical',
      flightBackend: 'v3',
    },
  });
  const legacyFlight = resolveRuntimeManifest({
    ...base,
    slots: {
      aiSlot: { name: 'tacticalAI' },
      flightSlot: { name: 'flight' },
      aiBackend: 'sg06-tactical',
      flightBackend: 'legacy',
    },
  });
  const legacyAi = resolveRuntimeManifest({
    ...base,
    slots: {
      aiSlot: { name: 'ai' },
      flightSlot: { name: 'flight' },
      aiBackend: 'legacy',
      flightBackend: 'v3',
    },
  });

  assert.equal(v3.selectedSlots.flightBackend, 'v3');
  assert.equal(legacyFlight.selectedSlots.flightBackend, 'legacy');
  assert.notEqual(v3.manifestHash, legacyFlight.manifestHash,
    'flight backend alone must change manifestHash');
  assert.notEqual(v3.manifestHash, legacyAi.manifestHash,
    'AI backend alone must change manifestHash');
  // Same backends → same hash
  const v3Again = resolveRuntimeManifest({
    ...base,
    slots: {
      aiSlot: { name: 'tacticalAI' },
      flightSlot: { name: 'flight' },
      aiBackend: 'sg06-tactical',
      flightBackend: 'v3',
    },
  });
  assert.equal(v3.manifestHash, v3Again.manifestHash);
});

test('authoritative runtime does not expose raw sim.step (isolation cannot be bypassed)', () => {
  const snap = snapshotFeatureMaps();
  try {
    const runtime = createAuthoritativeRuntime({
      profileId: 'production',
      seed: 7,
      systems: [{ name: 'probe', update() {} }],
      seedProcessMaps: true,
    });

    // No path to unwrapped sim.step / sim.runTicks on the returned object.
    assert.equal(runtime.sim, undefined, 'raw sim must not be exposed');
    assert.equal(typeof runtime.sim?.step, 'undefined');
    assert.equal(typeof runtime.sim?.runTicks, 'undefined');
    // Wrapped entry points remain the only stepping API.
    assert.equal(typeof runtime.step, 'function');
    assert.equal(typeof runtime.runTicks, 'function');
    assert.ok(runtime.state, 'state remains exposed');
    assert.ok(runtime.bus, 'bus remains exposed');

    // Own keys must not surface a raw sim host.
    assert.ok(!Object.prototype.hasOwnProperty.call(runtime, 'sim'));
    assert.ok(!('sim' in runtime));

    runtime.dispose();
  } finally {
    restoreFeatureMaps(snap);
  }
});

test('createRegistry slot identity reflects selected impl after physics fallback (not requested backend)', () => {
  // Request V3 + tactical AI but non-Rapier physics → selectors fall back to legacy systems.
  // Slot labels / manifestHash must record the SELECTED legacy identity, not the request.
  const fallbackState = createGameState(101);
  fallbackState.settings.gameplay.physicsBackend = 'custom';
  fallbackState.settings.gameplay.flightBackend = 'v3';
  fallbackState.settings.gameplay.aiBackend = 'sg06-tactical';
  const fallbackRegistry = createRegistry({
    state: fallbackState,
    bus: createBus(),
    helpers: {},
    applyRuntimeFeatures: false,
  });

  const trueV3State = createGameState(102);
  trueV3State.settings.gameplay.physicsBackend = 'rapier-dynamic';
  trueV3State.settings.gameplay.flightBackend = 'v3';
  trueV3State.settings.gameplay.aiBackend = 'sg06-tactical';
  const trueV3Registry = createRegistry({
    state: trueV3State,
    bus: createBus(),
    helpers: {},
    applyRuntimeFeatures: false,
  });

  const fallbackSlots = fallbackRegistry.runtimeManifest.selectedSlots;
  const trueV3Slots = trueV3Registry.runtimeManifest.selectedSlots;

  assert.equal(fallbackSlots.flightBackend, 'legacy',
    'non-Rapier + v3-requested must record legacy flight, not v3');
  assert.equal(fallbackSlots.aiBackend, 'legacy',
    'non-Rapier + tactical-requested must record legacy AI, not sg06-tactical');
  assert.equal(trueV3Slots.flightBackend, 'v3');
  assert.equal(trueV3Slots.aiBackend, 'sg06-tactical');

  assert.notEqual(
    fallbackRegistry.runtimeManifest.manifestHash,
    trueV3Registry.runtimeManifest.manifestHash,
    'legacy fallback must hash differently from true V3 / tactical selection',
  );
});

test('explicit empty updateOrder steps zero systems; omitted steps all init systems', () => {
  let updates = 0;
  const sysA = { name: 'sysA', update() { updates += 1; } };
  const sysB = { name: 'sysB', update() { updates += 1; } };

  // Explicit []: init systems for handlers, but step nothing.
  const zeroStep = createSimulation({
    seed: 3,
    systems: [sysA, sysB],
    updateOrder: [],
  });
  updates = 0;
  zeroStep.step(1 / 60);
  assert.equal(updates, 0, 'updateOrder: [] must invoke zero system updates');

  // Omitted updateOrder: default to all non-core init systems.
  const allStep = createSimulation({
    seed: 4,
    systems: [sysA, sysB],
  });
  updates = 0;
  allStep.step(1 / 60);
  assert.equal(updates, 2, 'omitted updateOrder must step every registered non-core system');
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
