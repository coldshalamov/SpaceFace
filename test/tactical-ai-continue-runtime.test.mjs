// Canonical owners and a JSON-detached envelope: no warm TacticalAIStack or entity pointer is
// retained by the restored host. Fixture actors are explicitly staged, not ordinary play proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { snapshotSimState } from '../src/core/simSnapshot.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { actions } from '../src/systems/actions.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { save } from '../src/save/saveSystem.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { normalizeActivity, ActivityKind, RulesOfEngagement } from '../src/ai/doctrine.js';
import { fnv1a } from '../src/save/checksum.js';
import { preparePhysicsBackend } from '../scripts/lib/simScenarioDriver.mjs';

function host({ prefix = false } = {}) {
  const tactical = createTacticalAISystem();
  const sim = createSimulation({ seed: 47,
    systems: [tactical, actions, flightV3, aiPorts, physics, combat, save] });
  const { state } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  state.settings.gameplay.flightBackend = 'v3';
  const leadingActor = prefix ? sim.spawn(makeShipEntitySpec('ship_wasp', {
    team: 1, factionId: 'faction_reavers', pos: { x: 100, z: 0 }, ai: {},
  })) : null;
  if (leadingActor) leadingActor.flags.persistent = true;
  const staleTarget = prefix ? sim.spawn(makeShipEntitySpec('ship_wasp', {
    team: 0, factionId: 'faction_free', pos: { x: 3000, z: 0 },
    ai: { passive: true, allowPassiveManeuver: false },
  })) : null;
  if (staleTarget) staleTarget.flags.persistent = true;
  const player = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
    team: 0, factionId: 'faction_free', pos: { x: 0, z: 0 }, rot: 0,
    isPlayer: true, player: state.player,
    fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
  }));
  state.playerId = player.id;
  const actor = sim.spawn(makeShipEntitySpec('ship_wasp', {
    team: 1, factionId: 'faction_reavers', pos: { x: 620, z: -18 }, rot: Math.PI,
    ai: { role: 'target_dummy' },
  }));
  actor.flags.persistent = true;
  sim.bus.emit('game:started', { source: 'tactical-continue-fixture' });
  return { sim, state, tactical, player, actor, leadingActor, staleTarget, saver: sim.registry.get('save') };
}

function advance(h, ticks) {
  for (let i = 0; i < ticks; i++) h.sim.step(SIM_DT);
}

function physical(h) {
  const snapshot = snapshotSimState(h.state);
  return { tick: snapshot.tick, simTime: snapshot.simTime, entities: snapshot.entities, physics: snapshot.physics };
}

test('JSON cold Continue preserves the next production sensor cadence, decision and native state', async (t) => {
  const warm = host();
  await preparePhysicsBackend(warm.sim.registry, warm.state, 'rapier-dynamic');
  advance(warm, 600);
  const captureStart = performance.now();
  const captured = warm.tactical.serialize();
  const captureMs = performance.now() - captureStart;
  const envelope = JSON.parse(JSON.stringify(warm.saver.serialize('tactical-fixture')));
  const slice = envelope.data.tacticalAI;
  assert.deepEqual(slice, captured);
  const planEntry = warm.saver._saveCapturePlan().find(([key]) => key === 'tacticalAI');
  assert.deepEqual(JSON.parse(JSON.stringify(planEntry[1]())), slice, 'incremental and synchronous saves capture the same slice');
  assert.equal(slice.version, 1, 'the actual envelope must contain owned tactical memory');
  assert.ok(slice.actors > 0);
  assert.ok(slice.maxContacts > 0);
  assert.ok(Buffer.byteLength(JSON.stringify(slice)) <= 1024 * 1024);
  t.diagnostic(JSON.stringify({ addedBytes: Buffer.byteLength(JSON.stringify(slice)), captureMs, actors: slice.actors, maxContacts: slice.maxContacts }));
  const stack = warm.tactical.stack;
  const expectedPerception = warm.tactical.inspect().perception;
  const expectedDirector = warm.tactical.inspect().director;

  const cold = host();
  await preparePhysicsBackend(cold.sim.registry, cold.state, 'rapier-dynamic');
  assert.equal(cold.saver.loadEnvelope(envelope, 'tactical-fixture'), true);
  await preparePhysicsBackend(cold.sim.registry, cold.state, 'rapier-dynamic', {
    reset: true, sg02Snapshot: envelope.data.physics,
  });
  assert.notEqual(cold.tactical.stack, stack);
  assert.notEqual(cold.state.entities.get(warm.actor.id), warm.actor);
  const coldActor = cold.state.entities.get(warm.actor.id);
  assert.notEqual(coldActor.occupantGeneration, warm.actor.occupantGeneration, 'canonical restore issues a fresh physical life');
  const coldPerception = cold.tactical.inspect().perception;
  assert.equal(coldPerception[warm.actor.id].self.occupantGeneration, coldActor.occupantGeneration,
    'the saved sensor actor is explicitly rebound to that fresh canonical life');
  assert.equal(coldPerception[warm.actor.id].tick, expectedPerception[warm.actor.id].tick,
    'rebinding never freshens the saved sensor timestamp');
  assert.deepEqual(cold.tactical.inspect().director, expectedDirector);

  for (let i = 0; i < 12; i++) {
    const warmSensors = warm.sim.registry.get('aiPorts').inspect().sensorFrames;
    const coldSensors = cold.sim.registry.get('aiPorts').inspect().sensorFrames;
    advance(warm, 1);
    advance(cold, 1);
    assert.equal(cold.sim.registry.get('aiPorts').inspect().sensorFrames - coldSensors,
      warm.sim.registry.get('aiPorts').inspect().sensorFrames - warmSensors, `sensor schedule tick ${warm.state.tick}`);
    assert.deepEqual(cold.tactical.inspect().lastResult, warm.tactical.inspect().lastResult, `decision tick ${warm.state.tick}`);
    assert.deepEqual(physical(cold), physical(warm), `native state tick ${warm.state.tick}`);
  }
});

test('old/malformed slices reset safely and a recycled actor/target cannot inherit cached decisions', () => {
  const warm = host();
  advance(warm, 24);
  const slice = JSON.parse(JSON.stringify(warm.tactical.serialize()));
  assert.ok(slice);
  for (const replaceTarget of [false, true]) {
    const recycled = host();
    recycled.state.tick = warm.state.tick;
    recycled.state.simTime = warm.state.simTime;
    // Explicit body-recycling fixture: typed numeric ID stays, physical generation changes.
    const entity = replaceTarget ? recycled.player : recycled.actor;
    entity.occupantGeneration += 100;
    recycled.sim.bus.emit('save:loaded', { tacticalAI: slice });
    assert.equal(recycled.tactical.stack.lastDecisionByEntity.has(warm.actor.id), false);
    assert.equal(recycled.tactical.stack.perceptionCache.has(warm.actor.id), false);
    assert.equal(recycled.tactical.stack.lastResult.decisions.some((row) => row.entityId === warm.actor.id), false);
  }
  const cold = host();
  cold.state.tick = warm.state.tick;
  cold.state.simTime = warm.state.simTime;
  cold.sim.bus.emit('save:loaded', { tacticalAI: { ...slice,
    bindings: slice.bindings.filter((row) => row.id !== warm.actor.id) } });
  assert.equal(cold.tactical.stack.lastDecisionByEntity.has(warm.actor.id), false,
    'an actor without a saved identity binding cannot inherit a decision');
  cold.sim.bus.emit('save:loaded', { tacticalAI: { ...slice, version: 999 } });
  assert.equal(cold.tactical.stack, null);
  cold.sim.bus.emit('save:loaded', { tacticalAI: { ...slice, data: {} } });
  assert.equal(cold.tactical.stack, null);
  cold.sim.bus.emit('save:loaded', {});
  assert.equal(cold.tactical.stack, null, 'old envelopes retain the compatible fresh-runtime path');
});

test('actual loadEnvelope rejects cognition whose old life disagrees with its saved body row', () => {
  const warm = host();
  advance(warm, 24);
  const original = JSON.parse(JSON.stringify(warm.saver.serialize('receipt-fixture')));
  const savedActor = original.data.entities.persistent.find((row) => row.id === warm.actor.id);
  assert.equal(savedActor.occupantGeneration, warm.actor.occupantGeneration);
  for (const legacyRow of [false, true]) {
    const envelope = JSON.parse(JSON.stringify(original));
    const binding = envelope.data.tacticalAI.bindings.find((row) => row.id === warm.actor.id);
    if (legacyRow) delete envelope.data.entities.persistent.find((row) => row.id === warm.actor.id).occupantGeneration;
    else binding.generation += 1000;
    envelope.checksum = fnv1a(JSON.stringify(envelope.data));
    const cold = host();
    let receipts;
    cold.sim.bus.on('save:loaded', (payload) => { receipts = payload.tacticalAIEntityBindings; });
    assert.equal(cold.saver.loadEnvelope(envelope, 'receipt-fixture'), true);
    assert.equal(receipts.some((row) => row.saveId === warm.actor.id), false,
      'the receipt producer validates the independent saved physical row');
    assert.equal(cold.tactical.stack.lastDecisionByEntity.has(warm.actor.id), false);
    assert.equal(cold.tactical.stack.perceptionCache.has(warm.actor.id), false);
    const sensors = cold.sim.registry.get('aiPorts').inspect().sensorFrames;
    advance(cold, 1);
    assert.ok(cold.sim.registry.get('aiPorts').inspect().sensorFrames > sensors, 'the next tick builds fresh cognition');
  }
});

function combatActor(entity, anchor, squadId) {
  entity.data.ai = {
    passive: false, lawful: false, hostileTeams: [0], squadId,
    motive: 'assigned_interdiction', engagementTrigger: 'authorized_hostile_spawn',
    zoneId: 'zone_ceres_belt', approachTelegraph: 'engine_flare', noFireResponseWindowS: 1,
    combatDoctrineId: 'interceptor_flyby', roe: RulesOfEngagement.WEAPONS_FREE,
    activity: normalizeActivity({ kind: ActivityKind.ATTACK_RUN, reason: 'remap_fixture',
      anchor: { x: anchor, z: 0 }, leashRadius: 2200, startedTick: 0 }),
  };
}

test('actual chained restore keeps typed IDs separate from a stale target identity', () => {
  const warm = host({ prefix: true });
  warm.staleTarget.pos.x = 400;
  const first = warm.leadingActor;
  combatActor(first, 0, '3'); // A string squad id must not inherit numeric entity3's remap.
  first.data.ai.sensorRange = 200;
  const second = warm.actor;
  second.pos.x = 500;
  combatActor(second, 400, 'stale-target-squad');
  second.data.ai.sensorRange = 200;
  advance(warm, 24);
  const originalDecision = warm.tactical.stack.lastDecisionByEntity.get(first.id);
  assert.equal(originalDecision.directive.focusTargetId, warm.player.id, 'fixture reaches an actual focused directive');
  assert.ok([...warm.tactical.stack.memory.byEntity.get(second.id).contacts.values()]
    .some((row) => row.id === warm.staleTarget.id), 'the other actor really remembers the target being removed');
  const envelope = JSON.parse(JSON.stringify(warm.saver.serialize('remap-fixture')));
  // Controlled saved-body fixture: omit the retired prefix body. The canonical restore now
  // maps player3→1 and actor1→2. Old invalid2 must not invalidate the valid new actor2.
  envelope.data.entities.persistent = envelope.data.entities.persistent.filter((row) => row.id !== warm.staleTarget.id);
  envelope.data.physics = null; // Changed body set rebuilds native membership from canonical rows.
  envelope.checksum = fnv1a(JSON.stringify(envelope.data));
  const cold = host();
  let receipts;
  cold.sim.bus.on('save:loaded', (payload) => { receipts = payload.tacticalAIEntityBindings; });
  assert.equal(cold.saver.loadEnvelope(envelope, 'remap-fixture'), true);
  const mapped = (id) => receipts.find((row) => row.saveId === id).entityId;
  const playerId = mapped(warm.player.id), actorId = mapped(first.id), secondId = mapped(second.id);
  assert.equal(playerId, 1);
  assert.equal(playerId, first.id, 'actual old player3→new1 chains through old actor1→new2');
  assert.equal(actorId, warm.staleTarget.id, 'the valid new actor occupies rejected old target2');
  const decision = cold.tactical.stack.lastDecisionByEntity.get(actorId);
  assert.ok(decision, 'the valid follower is retained despite the stale OLD2/current actor2 collision');
  assert.equal(decision.entityId, actorId);
  assert.equal(decision.directive.memberId, actorId);
  assert.equal(decision.directive.focusTargetId, playerId);
  assert.equal(decision.directive.objective.targetId, playerId);
  assert.equal(decision.directive.squadId, '3', 'typed squad identity is unchanged');
  assert.equal(decision.directive.objective.reason, originalDecision.directive.objective.reason);
  assert.equal(cold.tactical.stack.commander.squads.get('3').focusTargetId, playerId);
  assert.equal(cold.tactical.stack.lastDecisionByEntity.has(secondId), false, 'stale target drops only its actual source actor cache');
  assert.equal(cold.tactical.stack.perceptionCache.has(secondId), false);
  const actor = cold.state.entities.get(actorId);
  assert.notEqual(actor.occupantGeneration, first.occupantGeneration);
  assert.equal(cold.tactical.stack.perceptionCache.get(actorId).self.occupantGeneration, actor.occupantGeneration);
});
