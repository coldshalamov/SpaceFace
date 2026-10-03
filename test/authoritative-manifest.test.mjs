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
  validateSystemClockDeclarations,
} from '../src/runtime/authoritativeSystemManifest.js';
import {
  authoritativeIdentityEqual,
  resolveRuntimeManifest,
} from '../src/runtime/resolveRuntimeManifest.js';
import { actions } from '../src/systems/actions.js';
import { combat } from '../src/systems/combat.js';
import { weapons } from '../src/systems/weapons.js';

test('production init + update order lengths match the live browser baseline', () => {
  // 135 -> 142 and 101 -> 103: the Crucible (PQ-133) adds seven systems. Six are event-driven
  // owners that never tick (runSession-adjacent: survivalWave and survivalHud are the only two
  // that joined the update order), so the two figures move by different amounts on purpose.
  // 142 -> 146 (PQ-135). swarmArena maintains the debris field and swarmSupply drops repair cells;
  // both are event-driven and never tick. crucibleFocus watches the run phase to hide campaign
  // chrome, and swarmChain ticks only to notice a kill chain lapsing — so those are the ones
  // in the update order, and the two figures move by different amounts on purpose.
  // 147 -> 148: the drift-bomb bay (design/ORDNANCE_BOMBS_SPEC.md) joins both orders as one
  // input-gated deployable owner, so init and update move together this time.
  // 148 -> 150: the station yard (berths/crews/service queue) and the pacing director join
  // both orders — both tick real per-second work, so init and update move together again.
  // 150 -> 152: genie packet arrivals — the Chronicler (world memory; init+update, 60 Hz table)
  // and the tension director (pacing policy over the encounter owner; init+update+calendar).
  // 152 -> 155 init / 114 -> 116 update: the nemesis packet (Counterexample). The arc engine
  // (nemesis) and the encounter host (nemesisEncounter) join both orders immediately before the
  // AI slot (engine → host → tacticalAI); nemesisSignals routes voice/toast receipts and is
  // event-only, so init grows by three while update grows by two.
  // 155 -> 156 init / 116 -> 117 update: packet 09 (Three Capitals) adds exactly one system.
  // capitalBossEncounters initialises after the combat kernel (it validates
  // helpers.routeCombatDamage at init) and ticks immediately before the AI slot (score orders
  // precede AI action consumption on the same fixed tick), so init and update move together.
  // 156 -> 157 init / 117 -> 118 update: emergent combat primitives. One fixed-step owner,
  // after bombs and before impulseCharges, so it still sees chargeDetonate and queues forces
  // before the physics solve.
  // 157 -> 158 init / 118 -> 119 update: the kill replay ring. It ticks after the swarm
  // chain so the five seconds it keeps are the positions this step already moved.
  // 158 -> 159 init only: impoundPayPrompt is an event-only prompt-deck adapter (same
  // posture as customsPrompt) — it subscribes at init and never ticks.
  // 159 -> 160 init only: moralTrapPrompt is the same adapter posture (deck verbs over the
  // shipped moralTrap:choose intent) — init order only.
  // 160 -> 161 init / 119 -> 120 update: the kill-cam recorder (DEMO_READINESS §4). A
  // read-only pose ring one slot after the kill-replay ring; it writes nothing but its
  // own buffers, so the update order grows by one pure observer.
  // 161 -> 162 init / 120 -> 121 update: INFERENCE-30 noFireAdvisory — the station no-fire
  // ring watch; an observer whose tick only tracks ring inside/outside so exits re-arm.
  // 162 -> 163 init: wreckChoicePrompt (BP-01.1/PQ-138.04) — event-only prompt-deck adapter,
  // same posture as impoundPayPrompt/moralTrapPrompt; init order only.
  // 162 init / 121 -> 122 update: the moralTrapSystem trap-reveal drive — init-only since the
  // packet landed, now ticking for one bounded purpose: firing a same-sector fork whose short
  // post-undock delay has elapsed. Every other reveal path stays event-driven; a mission
  // without a pending reveal makes the tick a two-comparison no-op.
  // 163 -> 164 init / 122 -> 123 update: miningHud — the mining beam's vent-band / rich-core /
  // seam instrument (DOM-guarded, event-mirrored from the seams mining.js already publishes).
  // One system in both orders, same posture as the sibling DOM-guarded HUDs; its tick only
  // places the world-anchored dial and retires it when the beam stops.
  // 164 -> 165 init / 123 -> 124 update: hullBurst (hull-burst overhaul slice C) — the Gravity
  // Bumper's timed front wedge; one system in both orders, right after impulseCharges so both blast
  // verbs sit before physics. Absent from the frozen legacy47a list, so the 47-A golden cannot see it.
  // Morrow adds one fixed-step character owner before physics.
  // 166 -> 167 init / 125 -> 126 update: vesper joins as a second fixed-step character owner
  // immediately after morrow and still before physics, so both orders grow by one.
  // 167 -> 168 init / 126 -> 127 update: volatileExposure (NXB-008) — exposure-driven volatile
  // cargo state; one system in both orders right after jettisonImpulse. Its update is a cheap
  // tick%15 gate on non-cadence ticks, so it runs on the table clock beside lootShards.
  // 168 -> 169 init / 127 -> 128 update: BRACKET adds one fixed-step character owner before physics.
  // 169 -> 171 init / 128 -> 130 update: SWARM-02 juice pack — the arcade detector (swarmJuice,
  // one slot after swarmChain so it reads the kills this tick settled) and its DOM-guarded
  // presenter (swarmJuiceHud, after survivalHud); one in both orders each.
  assert.equal(PRODUCTION_INIT_ORDER.length, 171);
  assert.equal(PRODUCTION_UPDATE_ORDER.length, 130);
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
  assert.equal(registry.systems.length, 171);
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
