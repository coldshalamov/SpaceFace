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
  getSystemClock,
  getSystemCapability,
  isNodeSafeSystemId,
  validateSystemClockDeclarations,
} from '../src/runtime/authoritativeSystemManifest.js';
import {
  authoritativeIdentityEqual,
  resolveRuntimeManifest,
} from '../src/runtime/resolveRuntimeManifest.js';
import { actions } from '../src/systems/actions.js';
import { combat } from '../src/systems/combat.js';
import { weapons } from '../src/systems/weapons.js';
import { lastShiftPrompt } from '../src/ui/lastShiftPrompt.js';
import { ilexArkPrompt } from '../src/ui/ilexArkPrompt.js';
import { towlineTablePrompt } from '../src/ui/towlineTablePrompt.js';

test('production systems preserve unique membership and physical update boundaries', () => {
  assert.equal(new Set(PRODUCTION_INIT_ORDER).size, PRODUCTION_INIT_ORDER.length, 'a system initializes once');
  assert.equal(new Set(PRODUCTION_UPDATE_ORDER).size, PRODUCTION_UPDATE_ORDER.length, 'a system ticks once');
  assert.ok(PRODUCTION_INIT_ORDER.includes('swarmFortify'));
  assert.ok(PRODUCTION_UPDATE_ORDER.includes('swarmFortify'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('swarmFortify') < PRODUCTION_UPDATE_ORDER.indexOf('fields'),
    'structure pulse state is published before the canonical field solve');
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('fields') < PRODUCTION_UPDATE_ORDER.indexOf('physics'));
  assert.ok(PRODUCTION_INIT_ORDER.includes('heroManeuvers'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('input') < PRODUCTION_UPDATE_ORDER.indexOf('heroManeuvers'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('heroManeuvers') < PRODUCTION_UPDATE_ORDER.indexOf('flightSlot'),
    'the maneuver lease reaches V3 before propulsion consumes the tick');
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('heroManeuvers') < PRODUCTION_UPDATE_ORDER.indexOf('bombs'),
    'an authored maneuver consumes its command before ordinary bomb release');
  assert.equal(getSystemClock('heroManeuvers'), 'table');
  assert.ok(PRODUCTION_INIT_ORDER.includes('furnaceIntake'));
  assert.ok(PRODUCTION_UPDATE_ORDER.includes('furnaceIntake'));
  for (const id of ['orbitalGallery', 'kineticLeague', 'reactiveMatter', 'spectrum']) {
    assert.ok(PRODUCTION_INIT_ORDER.includes(id));
    assert.ok(PRODUCTION_UPDATE_ORDER.includes(id));
  }
  assert.equal(getSystemClock('environmentMaterials'), 'table');
  assert.equal(PRODUCTION_INIT_ORDER.includes('stuckTowPrompt'), true);
  assert.equal(PRODUCTION_UPDATE_ORDER.includes('stuckTowPrompt'), false);
  assert.equal(getSystemClock('moralTrap'), 'calendar');
  assert.equal(getSystemClock('moralTrapSystem'), 'calendar');
  assert.ok(PRODUCTION_INIT_ORDER.includes('ravel'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('bracket') < PRODUCTION_UPDATE_ORDER.indexOf('ravel'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('ravel') < PRODUCTION_UPDATE_ORDER.indexOf('physics'));
  assert.equal(PRODUCTION_UPDATE_ORDER[PRODUCTION_UPDATE_ORDER.length - 1], 'save');
  assert.ok(PRODUCTION_UPDATE_ORDER.includes('save'));
  assert.equal(PRODUCTION_INIT_ORDER[0], 'core');
  assert.ok(PRODUCTION_INIT_ORDER.includes('render'));
  assert.ok(PRODUCTION_INIT_ORDER.includes('save'));
  assert.ok(PRODUCTION_INIT_ORDER.includes('massSeedHud'));
  assert.ok(PRODUCTION_INIT_ORDER.includes('miningHud'));
  assert.ok(!PRODUCTION_UPDATE_ORDER.includes('render'));
  assert.ok(PRODUCTION_UPDATE_ORDER.includes('flightSlot'));
  assert.ok(PRODUCTION_UPDATE_ORDER.includes('masslineSnares'));
  assert.ok(PRODUCTION_UPDATE_ORDER.includes('massSeedHud'));
  assert.ok(PRODUCTION_UPDATE_ORDER.includes('miningHud'));
  assert.ok(PRODUCTION_UPDATE_ORDER.includes('stuntGrammar'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('collisionConsequences')
    < PRODUCTION_UPDATE_ORDER.indexOf('stuntGrammar'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('environmentalMachinery')
    < PRODUCTION_UPDATE_ORDER.indexOf('fields'));
  const worldIndex = PRODUCTION_UPDATE_ORDER.indexOf('world');
  const heistFacilitiesIndex = PRODUCTION_UPDATE_ORDER.indexOf('heistFacilities');
  const regionalEcologyIndex = PRODUCTION_UPDATE_ORDER.indexOf('regionalEcology');
  assert.ok(worldIndex < heistFacilitiesIndex);
  assert.ok(heistFacilitiesIndex < regionalEcologyIndex);
  // Nemesis packet ordering contract: engine -> encounter host -> tactical AI, and the
  // event-only signals adapter never enters the update order.
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('nemesis')
    < PRODUCTION_UPDATE_ORDER.indexOf('nemesisEncounter'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('nemesisEncounter')
    < PRODUCTION_UPDATE_ORDER.indexOf('aiSlot'));
  assert.ok(!PRODUCTION_UPDATE_ORDER.includes('nemesisSignals'));
  assert.ok(PRODUCTION_INIT_ORDER.includes('nemesisSignals'));
  // Packet 09 ordering contract: the capital score publishes before AI consumes on the same
  // fixed tick, and it initialises after the combat kernel installed the damage ports.
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('capitalBossEncounters')
    < PRODUCTION_UPDATE_ORDER.indexOf('aiSlot'));
  assert.ok(PRODUCTION_INIT_ORDER.indexOf('combat')
    < PRODUCTION_INIT_ORDER.indexOf('capitalBossEncounters'));
  assert.ok(PRODUCTION_INIT_ORDER.includes('capitalBossEncounters'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('palletJack')
    < PRODUCTION_UPDATE_ORDER.indexOf('secondRinse'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('secondRinse')
    < PRODUCTION_UPDATE_ORDER.indexOf('aiSlot'));
  assert.ok(PRODUCTION_INIT_ORDER.includes('secondRinse'));
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

  // Node drops declared non-Node-safe systems, including presentation platform IDs.
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

  // Authoritative Node-safe IDs (excluding main-realm adapters/platform) match Node resolve.
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

  // Full init list length and terminal platform systems preserved. 147 since PQ-146.02 registered
  // the existing stuntGrammar observer so trick receipts reach titles and barks; 148 with the
  // drift-bomb bay (one system, both orders); 150 with the station yard and the pacing director;
  // 152 with the Chronicler and the tension director (genie packet returns); 155 with the
  // nemesis packet (nemesis + nemesisEncounter + event-only nemesisSignals); 156 with packet 09's
  // capitalBossEncounters (one system in both orders; score orders precede AI action consumption).
  // 157 with emergentPrimitives (one system in both orders; reads chargeDetonate before it is consumed).
  // 158 with the kill-replay ring (one system in both orders; records after the swarm chain).
  // 159 with impoundPayPrompt (event-only prompt-deck adapter; init order only).
  // 160 with moralTrapPrompt (same adapter posture; init order only).
  // 161 with the kill-cam recorder (one system in both orders; reads poses after the
  // kill-replay ring, writes only its own ring buffers).
  // 162 with noFireAdvisory (one system in both orders; the no-fire ring watch — observer).
  // 163 with wreckChoicePrompt (BP-01.1/PQ-138.04; event-only prompt-deck adapter).
  // 164 with miningHud (INF lane): the mining instrument joins both orders beside the
  // other DOM-guarded HUDs (massSeedHud/fieldHud/planetHud posture).
  // 165 with hullBurst (hull-burst overhaul slice C; one system in both orders).
  // 166 with morrow (fixed-step character owner before physics); 167 with vesper (same
  // posture — one system in both orders, between morrow and physics). 168 with
  // volatileExposure (NXB-008, beside jettisonImpulse in both orders).
  // 169 with bracket (PR #210 — a third fixed-step character owner before physics).
  // 171 with SWARM-02 juice pack — swarmJuice (arcade detector, after swarmChain) and
  // swarmJuiceHud (DOM-guarded presenter, after survivalHud), one system in both orders each.
  // 172 with ravel (PR #217 — fixed-step character owner after bracket, before physics).
  // 173 with SWARM-06 swarmElites (the Threat/affix/perk runtime; one system in both orders,
  // after swarmJuice so cohort stamps precede the HUDs' readout).
  // 174 with solstice (SL-9 system owner, after ravel and before physics).
  // 175 with rubric (HM-11 system owner, after solstice and before physics).
  // 177 with the Gyre Snare pair — gyreSnare (the held-verb lash itself, between
  // fields and physics) and gyreHud (DOM-guarded lane pill beside fieldHud), one
  // system in both orders each.
  // 200 with secondRinse and ruud, each registered once in both orders.
  assert.equal(registry.systems.length, PRODUCTION_INIT_ORDER.length);
  const names = registry.systems.map((s) => s.name);
  assert.ok(names.includes('render') || registry.runtimeManifest.authoritativeSystemIds.includes('render'));
  assert.ok(registry.runtimeManifest.authoritativeSystemIds.includes('ui'));
  assert.ok(registry.runtimeManifest.authoritativeSystemIds.includes('save'));

  // Update order still has collisionConsequences between aiPorts and weapons (PQ-009 contract),
  // and the crossing-line owner runs after impacts but before throw resolution.
  const updates = registry.updateOrder.map((s) => s.name);
  const consequenceIndex = updates.indexOf('collisionConsequences');
  assert.ok(consequenceIndex > updates.indexOf('aiPorts'));
  assert.ok(consequenceIndex < updates.indexOf('weapons'));
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

// FB-089: the table clock is declared, never defaulted. Every production update-order id
// must appear in exactly one clock list (or hold a glass capability) — a new system with
// no declaration fails here with its id named.
test('every production update-order system has exactly one declared clock', () => {
  const violations = validateSystemClockDeclarations();
  assert.deepEqual(violations, [], `clock declaration violations: ${violations.join('; ')}`);
});

test('every manifest id resolves to a real browser factory and every Node-safe id to a Node factory', async () => {
  // Regression: 0a59973d4e referenced ids/constants with no module on master and crashed boot.
  // The browser lookup must materialize ALL IDs. The Node table intentionally excludes
  // main-realm HUD adapters as well as the five presentation platform systems.
  const registry = createRegistry({ state: createGameState(17), bus: createBus(), helpers: {}, applyRuntimeFeatures: false });
  const browserTable = new Map(registry.runtimeManifest.authoritativeSystemIds.map((id, index) => [id, registry.systems[index]]));
  const { getNodeSystemFactoryTable } = await import('../src/runtime/nodeSystemFactoryTable.js');
  const nodeTable = getNodeSystemFactoryTable();
  const ids = [...new Set([...PRODUCTION_INIT_ORDER, ...PRODUCTION_UPDATE_ORDER])];
  assert.deepEqual(ids.filter((id) => !browserTable.get(id)), [], 'missing browser factories');
  assert.deepEqual(ids.filter((id) => isNodeSafeSystemId(id) && !nodeTable.get(id)), [], 'missing Node-safe factories');
});

for (const [id, adapter] of [
  ['lastShiftPrompt', lastShiftPrompt],
  ['ilexArkPrompt', ilexArkPrompt],
  ['towlineTablePrompt', towlineTablePrompt],
]) test(`${id} remains an imported, main-realm, init-only HUD adapter`, async () => {
  const registry = createRegistry({ state: createGameState(19), bus: createBus(), helpers: {}, applyRuntimeFeatures: false });
  const { getNodeSystemFactoryTable } = await import('../src/runtime/nodeSystemFactoryTable.js');
  const nodePath = resolveRuntimeManifest({ profileId: 'production', nodeSafeOnly: true });
  assert.equal(registry.get(id), adapter, 'browser must materialize the real imported adapter');
  assert.equal(PRODUCTION_INIT_ORDER.filter((entry) => entry === id).length, 1);
  assert.equal(PRODUCTION_UPDATE_ORDER.includes(id), false);
  assert.deepEqual(getSystemCapability(id), { nodeSafe: false, phase: 'platform', capability: 'hud' });
  assert.equal(PRESENTATION_PLATFORM_IDS.includes(id), false, 'HUD adapters are not generic presentation platform systems');
  assert.equal(isNodeSafeSystemId(id), false);
  assert.equal(getNodeSystemFactoryTable().has(id), false);
  assert.equal(nodePath.authoritativeSystemIds.includes(id), false);
  assert.equal(nodePath.authoritativeUpdateOrderIds.includes(id), false);
});

test('missing required Node and main-realm factories still fail manifest materialization', async () => {
  const { getNodeSystemFactoryTable } = await import('../src/runtime/nodeSystemFactoryTable.js');
  const nodeTable = getNodeSystemFactoryTable();
  nodeTable.delete('actions');
  assert.throws(
    () => resolveRuntimeManifest({ profileId: 'production', nodeSafeOnly: true, systemLookup: nodeTable }),
    /missing system "actions" for init order/,
  );
  const registry = createRegistry({ state: createGameState(23), bus: createBus(), helpers: {}, applyRuntimeFeatures: false });
  for (const id of ['lastShiftPrompt', 'ilexArkPrompt', 'towlineTablePrompt']) {
    const browserTable = new Map(registry.runtimeManifest.authoritativeSystemIds.map((entry, index) => [entry, registry.systems[index]]));
    browserTable.delete(id);
    assert.throws(
      () => resolveRuntimeManifest({ profileId: 'production', nodeSafeOnly: false, systemLookup: browserTable }),
      new RegExp(`missing system "${id}" for init order`),
    );
  }
});
