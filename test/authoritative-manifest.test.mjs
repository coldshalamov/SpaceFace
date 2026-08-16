// Phase 2: one authoritative system manifest shared by createRegistry and createSimulation paths.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import { createSimulation } from '../src/core/sim.js';
import {
  PRESENTATION_PLATFORM_IDS,
  PRODUCTION_INIT_ORDER,
  PRODUCTION_UPDATE_ORDER,
  getAuthoritativeInitOrder,
  getAuthoritativeUpdateOrder,
  isNodeSafeSystemId,
} from '../src/runtime/authoritativeSystemManifest.js';
import {
  authoritativeIdentityEqual,
  resolveRuntimeManifest,
} from '../src/runtime/resolveRuntimeManifest.js';
import { actions } from '../src/systems/actions.js';
import { combat } from '../src/systems/combat.js';
import { weapons } from '../src/systems/weapons.js';

test('production init + update order lengths match the live browser baseline', () => {
  assert.equal(PRODUCTION_INIT_ORDER.length, 138);
  assert.equal(PRODUCTION_UPDATE_ORDER.length, 106);
  assert.equal(PRODUCTION_INIT_ORDER[0], 'core');
  assert.ok(PRODUCTION_INIT_ORDER.includes('render'));
  assert.ok(PRODUCTION_INIT_ORDER.includes('save'));
  assert.ok(PRODUCTION_INIT_ORDER.includes('massSeedHud'));
  assert.ok(!PRODUCTION_UPDATE_ORDER.includes('render'));
  assert.ok(PRODUCTION_UPDATE_ORDER.includes('flightSlot'));
  assert.ok(PRODUCTION_UPDATE_ORDER.includes('masslineSnares'));
  assert.ok(PRODUCTION_UPDATE_ORDER.includes('massSeedHud'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('titles')
    < PRODUCTION_UPDATE_ORDER.indexOf('wingMorale'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('environmentalMachinery')
    < PRODUCTION_UPDATE_ORDER.indexOf('fields'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('anomalyRuntime')
    < PRODUCTION_UPDATE_ORDER.indexOf('fields'));
  const worldIndex = PRODUCTION_UPDATE_ORDER.indexOf('world');
  const heistFacilitiesIndex = PRODUCTION_UPDATE_ORDER.indexOf('heistFacilities');
  const regionalEcologyIndex = PRODUCTION_UPDATE_ORDER.indexOf('regionalEcology');
  assert.ok(worldIndex < heistFacilitiesIndex);
  assert.ok(heistFacilitiesIndex < regionalEcologyIndex);
});

// J6: every system in update order must also be initialized (update ⊆ init).
test('J6: production update order is a subset of init order', () => {
  const initSet = new Set(PRODUCTION_INIT_ORDER);
  const missing = PRODUCTION_UPDATE_ORDER.filter((id) => !initSet.has(id));
  assert.deepEqual(missing, [], `update systems missing from init: ${missing.join(', ')}`);
});

test('createRegistry materializes the production manifest system IDs and order', () => {
  const state = createGameState(7);
  const registry = createRegistry({ state, bus: createBus(), helpers: {} });

  assert.equal(registry.runtimeManifest.profileId, 'production');
  assert.equal(registry.runtimeManifest.evidenceClass, 'production-manifest');
  assert.deepEqual(
    [...registry.runtimeManifest.authoritativeSystemIds],
    [...PRODUCTION_INIT_ORDER],
  );
  assert.deepEqual(
    [...registry.runtimeManifest.authoritativeUpdateOrderIds],
    [...PRODUCTION_UPDATE_ORDER],
  );
  assert.equal(registry.systems.length, PRODUCTION_INIT_ORDER.length);
  assert.equal(registry.updateOrder.length, PRODUCTION_UPDATE_ORDER.length);

  // Slot aliases still resolve.
  assert.ok(registry.get('ai'));
  assert.ok(registry.get('flight'));
  assert.equal(registry.get('ai'), registry.get('aiSlot'));
  assert.equal(registry.get('flight'), registry.get('flightSlot'));
  assert.equal(registry.get('heistFacilities')?.name, 'heistFacilities');
});

test('Node production resolve (nodeSafeOnly) shares feature values and authoritative ID order with browser path', () => {
  const browserPath = resolveRuntimeManifest({ profileId: 'production', nodeSafeOnly: false });
  const nodePath = resolveRuntimeManifest({ profileId: 'production', nodeSafeOnly: true });

  assert.deepEqual(browserPath.features, nodePath.features);
  assert.equal(browserPath.profileHash, nodePath.profileHash);

  // Node drops presentation platform IDs only.
  for (const id of PRESENTATION_PLATFORM_IDS) {
    assert.ok(browserPath.authoritativeSystemIds.includes(id));
    assert.ok(!nodePath.authoritativeSystemIds.includes(id));
  }

  const browserGameplayIds = browserPath.authoritativeSystemIds.filter(isNodeSafeSystemId);
  assert.deepEqual([...nodePath.authoritativeSystemIds], [...browserGameplayIds]);
  assert.ok(nodePath.authoritativeSystemIds.includes('heistFacilities'));

  const browserUpdateGameplay = browserPath.authoritativeUpdateOrderIds.filter(isNodeSafeSystemId);
  assert.deepEqual([...nodePath.authoritativeUpdateOrderIds], [...browserUpdateGameplay]);
});

test('createRegistry (browser path) and resolveRuntimeManifest (Node path) agree on production identity', () => {
  const state = createGameState(11);
  const registry = createRegistry({
    state,
    bus: createBus(),
    helpers: {},
    // Do not re-seed MAPS for unrelated parallel tests in this file beyond this call.
    applyRuntimeFeatures: true,
  });
  const nodeResolved = resolveRuntimeManifest({ profileId: 'production', nodeSafeOnly: true });

  assert.equal(registry.runtimeManifest.profileId, nodeResolved.profileId);
  assert.deepEqual(registry.runtimeManifest.features, nodeResolved.features);

  // Authoritative gameplay IDs (excluding presentation platform) match Node resolve.
  const registryGameplayIds = registry.runtimeManifest.authoritativeSystemIds
    .filter(isNodeSafeSystemId);
  assert.deepEqual([...registryGameplayIds], [...nodeResolved.authoritativeSystemIds]);

  const registryUpdateGameplay = registry.runtimeManifest.authoritativeUpdateOrderIds
    .filter(isNodeSafeSystemId);
  assert.deepEqual([...registryUpdateGameplay], [...nodeResolved.authoritativeUpdateOrderIds]);
});

test('manifest and profile fingerprints are stable', () => {
  const a = resolveRuntimeManifest({ profileId: 'production' });
  const b = resolveRuntimeManifest({ profileId: 'production' });
  assert.equal(a.manifestHash, b.manifestHash);
  assert.equal(a.profileHash, b.profileHash);
  assert.match(a.manifestHash, /^[a-f0-9]{64}$/);

  const legacy = resolveRuntimeManifest({ profileId: 'legacy47a' });
  assert.notEqual(legacy.manifestHash, a.manifestHash);
});

test('browser production system set is unchanged vs production manifest constants', () => {
  const state = createGameState(13);
  const registry = createRegistry({ state, bus: createBus(), helpers: {} });

  // Full init list length and terminal platform systems preserved.
  assert.equal(registry.systems.length, 138);
  const names = registry.systems.map((s) => s.name);
  assert.ok(names.includes('render') || registry.runtimeManifest.authoritativeSystemIds.includes('render'));
  assert.ok(registry.runtimeManifest.authoritativeSystemIds.includes('ui'));
  assert.ok(registry.runtimeManifest.authoritativeSystemIds.includes('save'));

  // Update order still has collisionConsequences between aiPorts and weapons (PQ-009 contract),
  // and the crossing-line owner runs after impacts but before throw resolution.
  const updates = registry.updateOrder.map((s) => s.name);
  const consequenceIndex = updates.indexOf('collisionConsequences');
  assert.ok(consequenceIndex > updates.indexOf('aiPorts'));
  assert.ok(consequenceIndex < updates.indexOf('heavyPartsRuntime'));
  assert.ok(updates.indexOf('heavyPartsRuntime') < updates.indexOf('capitalRuntime'));
  assert.ok(updates.indexOf('capitalRuntime') < updates.indexOf('weapons'));
  assert.ok(updates.indexOf('masslineImpacts') < updates.indexOf('masslineSnares'));
  assert.ok(updates.indexOf('masslineSnares') < updates.indexOf('masslineThrow'));
});

test('focused explicit systems report exclusions and may not claim production-manifest evidence', () => {
  const systems = [actions, weapons, combat];
  const focused = resolveRuntimeManifest({
    profileId: 'legacy47a',
    explicitSystems: systems,
    exclusions: ['massline-family'],
  });

  assert.equal(focused.evidenceClass, 'focused-explicit');
  assert.ok(focused.exclusions.includes('production-manifest-claim'));
  assert.ok(focused.exclusions.includes('profile-full-system-set'));
  assert.ok(focused.exclusions.includes('massline-family'));
  assert.deepEqual([...focused.authoritativeSystemIds], ['actions', 'weapons', 'combat']);

  const sim = createSimulation({
    seed: 47,
    systems,
    runtimeManifest: focused,
    runtimeConfig: {
      profileId: 'legacy47a',
      features: focused.features,
      evidenceClass: focused.evidenceClass,
      exclusions: focused.exclusions,
    },
  });

  assert.equal(sim.evidenceClassification.class, 'focused-explicit');
  assert.ok(sim.evidenceClassification.exclusions.includes('production-manifest-claim'));
  assert.notEqual(sim.evidenceClassification.class, 'production-manifest');
  sim.dispose();
});

test('legacy47a system set matches curated 47-A list (+ core)', () => {
  const ids = getAuthoritativeInitOrder('legacy47a', { includeCore: true });
  assert.deepEqual([...ids], [
    'core',
    'scenarioRuntime',
    'presentationOrchestrator',
    'presentationAdapters',
    'actions',
    'flightSlot',
    'weapons',
    'physics',
    'combat',
    'cargo',
    'economy',
    'missions',
    'story',
    'save',
  ]);
  const update = getAuthoritativeUpdateOrder('legacy47a');
  assert.ok(!update.includes('core'));
  assert.ok(update.includes('flightSlot'));
});

test('authoritativeIdentityEqual detects profile and order drift', () => {
  const a = resolveRuntimeManifest({ profileId: 'production' });
  const b = resolveRuntimeManifest({ profileId: 'production' });
  const c = resolveRuntimeManifest({ profileId: 'legacy47a' });
  assert.equal(authoritativeIdentityEqual(a, b), true);
  assert.equal(authoritativeIdentityEqual(a, c), false);
});
