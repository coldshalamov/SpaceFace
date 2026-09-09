import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createSimulation } from '../src/core/sim.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';

const TARGET_ID = 1;

test('recycled tactical AI ids do not inherit the prior actor decision or fire revalidation', () => {
  let state = null;
  const sensorCalls = [];
  const maneuvers = [];
  const starts = [];
  const actionState = new Map();
  const helpers = {};

  const actorView = (entity) => ({
    id: entity.id,
    capabilities: ['drive', 'weapon', 'ranged'],
    combatDoctrineId: null,
    team: entity.team,
    alive: entity.alive !== false,
    pos: entity.pos,
    passive: false,
    playerId: 999,
    playerTeam: null,
    authorityOrigin: { x: 0, z: 0 },
    authorityRadius: 2500,
    activity: null,
  });

  helpers.aiSensors = {
    frameFor(entityId, tick) {
      const entity = state.entities.get(entityId);
      const contacts = entity && entity._sensorContacts ? entity._sensorContacts : [];
      sensorCalls.push({ entityId, tick, contactCount: contacts.length });
      return {
        tick,
        self: {
          id: entityId,
          team: entity?.team,
          pos: entity?.pos,
          vel: entity?.vel,
          rot: entity?.rot || 0,
          radius: entity?.radius || 12,
          hullFraction: 1,
          energyFraction: 1,
          heatFraction: 0,
          disabled: false,
          tethered: false,
          capabilities: ['drive', 'weapon', 'ranged'],
          subsystemFractions: {},
          activity: null,
          roe: 'weapons_free',
          combatDoctrineId: null,
        },
        contacts,
        events: [],
      };
    },
  };
  helpers.aiRoster = {
    listSquads(tick) {
      const actor = [...state.entities.values()]
        .find((entity) => entity.id !== TARGET_ID && entity.type === 'ship');
      return actor && actor.alive !== false ? [{
        id: 'recycled_id_fixture',
        doctrine: 'scavenger',
        faction: 'fixture',
        formation: 'wedge',
        formationSpacing: 72,
        formationBound: 170,
        members: [actorView(actor)],
        tick,
      }] : [];
    },
  };
  helpers.aiManeuver = {
    request(request) {
      maneuvers.push({
        entityId: request.entityId,
        tick: request.tick,
        kind: request.kind,
        targetHeading: request.targetHeading,
      });
      return true;
    },
  };

  const tactical = createTacticalAISystem({
    actionPortFactory: () => ({
      list() {
        return [{
          id: 'action_burst',
          tags: ['attack', 'ranged'],
          range: 700,
          preferredRange: 180,
          targetKinds: ['ship'],
        }];
      },
      canStart() { return { ok: true, reason: 'fixture_ok' }; },
      start(entityId, actionId, request) {
        starts.push({ entityId, actionId, targetId: request.targetId, tick: request.tick });
        actionState.set(entityId, { actionId, targetId: request.targetId });
        return { ok: true, handle: `${entityId}:${actionId}` };
      },
      status(entityId) { return actionState.has(entityId) ? 'running' : 'idle'; },
      interrupt(entityId) { actionState.delete(entityId); return true; },
      forget(entityId) { actionState.delete(entityId); },
    }),
  });

  const sim = createSimulation({
    seed: 47081,
    helpers,
    systems: [tactical],
    updateOrder: [tactical],
  });
  state = sim.state;
  state.playerId = 999;

  const target = sim.spawn({ type: 'ship', team: 1, pos: { x: 160, z: 0 }, radius: 12 });
  const actorA = sim.spawn({
    type: 'ship',
    team: 2,
    pos: { x: 0, z: 0 },
    radius: 12,
    data: {
      ai: { passive: false },
      intent: { fire: false },
    },
  });
  actorA._sensorContacts = [{
    id: target.id,
    kind: 'ship',
    team: target.team,
    classification: 'live_hostile',
    pos: target.pos,
    vel: target.vel,
    radius: target.radius,
    confidence: 1,
    threat: 0.9,
    hostile: true,
    alive: true,
    valid: true,
    visible: true,
    tags: ['armed'],
  }];

  sim.step();
  const firstDecision = tactical.stack.lastResult.decisions[0];
  assert.equal(firstDecision.action.actionId, 'action_burst');
  assert.equal(firstDecision.action.targetId, target.id);
  assert.equal(firstDecision.maneuver.kind, 'orbit');
  assert.equal(starts.length, 1);
  assert.equal(maneuvers.length, 1);

  assert.equal(sim.helpers.removeEntity(actorA.id, { immediate: true, reason: 'tactical_id_reuse_test' }), true);
  assert.equal(actorA.alive, false);
  assert.equal(state.entities.has(actorA.id), false);
  assert.ok(state.freeIds.includes(actorA.id));

  const actorB = sim.spawn({
    type: 'ship',
    team: 2,
    pos: { x: 0, z: 0 },
    radius: 12,
    data: {
      ai: { passive: false },
      intent: {
        fire: false,
        fireBlockReason: 'replacement-sentinel',
        fireBlockerId: 'replacement-sentinel',
      },
    },
  });
  actorB._sensorContacts = [];
  assert.equal(actorB.id, actorA.id, 'core allocator must recycle the removed actor id');
  assert.notStrictEqual(actorB, actorA, 'recycled IDs must still identify a new entity object');
  assert.strictEqual(state.entities.get(actorB.id), actorB);
  assert.equal(state.freeIds.includes(actorB.id), false);

  const maneuversBeforeReplacementTick = maneuvers.length;
  sim.step();
  const replacementManeuvers = maneuvers.slice(maneuversBeforeReplacementTick);
  const replacementAI = tactical.stack.inspect({ entityId: actorB.id });

  assert.deepEqual(replacementManeuvers, [], 'the replacement must not receive A\'s skipped-tick maneuver');
  assert.equal(sensorCalls.some((call) => call.entityId === actorB.id && call.tick === state.tick), false,
    'the default skipped tick need not sensor-refresh, but must not replay stale state');
  assert.equal(replacementAI.perception.self, null, 'B must not inherit A\'s perception self frame');
  assert.deepEqual(replacementAI.perception.contacts, [], 'B must not inherit A\'s perceived target');
  assert.equal(replacementAI.behavior, null, 'B must not inherit A\'s action executor state');
  assert.equal(replacementAI.maneuver, null, 'B must not inherit A\'s maneuver runtime');
  assert.equal(replacementAI.combatDoctrine, null, 'B must not inherit A\'s doctrine state');
  assert.equal(starts.length, 1, 'B must not start A\'s action before a fresh decision');
  assert.equal(actorB.data.intent.fire, false);
  assert.equal(actorB.data.intent.fireBlockReason, 'replacement-sentinel',
    'a cached A decision must not revalidate fire against B');
  assert.equal(actorB.data.intent.fireBlockerId, 'replacement-sentinel');
});

test('tactical AI lifecycle subscriptions are idempotent and teardown-safe', () => {
  const state = createGameState(47082);
  const bus = createBus();
  const system = createTacticalAISystem({ actionPortFactory: () => ({}) });
  const ctx = { state, bus, helpers: {} };
  const lifecycleEvents = ['game:started', 'save:loaded', 'entity:spawned', 'entity:destroyed'];

  system.init(ctx);
  system.init(ctx);
  for (const event of lifecycleEvents) {
    assert.equal(bus._listeners.get(event)?.size || 0, 1, `${event} must have one owned listener`);
  }

  system.destroy();
  for (const event of lifecycleEvents) {
    assert.equal(bus._listeners.get(event)?.size || 0, 0, `${event} listeners must be detached on destroy`);
  }
});

test('a deferred destroy receipt cannot invalidate a same-tick replacement decision', () => {
  let state = null;
  let actorA = null;
  let actorB = null;
  let replacementCount = 0;
  const maneuvers = [];
  const helpers = {};

  const actorView = (entity) => ({
    id: entity.id,
    capabilities: ['drive'],
    combatDoctrineId: null,
    team: entity.team,
    alive: entity.alive !== false,
    pos: entity.pos,
    passive: false,
    playerId: 999,
    playerTeam: null,
    authorityOrigin: { x: 0, z: 0 },
    authorityRadius: 2500,
    activity: null,
  });

  helpers.aiSensors = {
    frameFor(entityId, tick) {
      const entity = state.entities.get(entityId);
      return {
        tick,
        self: {
          id: entityId,
          team: entity?.team,
          pos: entity?.pos,
          vel: entity?.vel,
          rot: entity?.rot || 0,
          radius: entity?.radius || 12,
          hullFraction: 1,
          energyFraction: 1,
          heatFraction: 0,
          disabled: false,
          tethered: false,
          capabilities: ['drive'],
          subsystemFractions: {},
          activity: null,
          roe: 'weapons_free',
          combatDoctrineId: null,
        },
        contacts: entity?._sensorContacts || [],
        events: [],
      };
    },
  };
  helpers.aiRoster = {
    listSquads(tick) {
      const actor = [...state.entities.values()]
        .find((entity) => entity.id !== TARGET_ID && entity.type === 'ship');
      return actor && actor.alive !== false ? [{
        id: 'deferred_destroy_fixture',
        doctrine: 'scavenger',
        faction: 'fixture',
        formation: 'wedge',
        formationSpacing: 72,
        formationBound: 170,
        members: [actorView(actor)],
        tick,
      }] : [];
    },
  };
  helpers.aiManeuver = {
    request(request) {
      maneuvers.push({ entityId: request.entityId, tick: request.tick, kind: request.kind });
      return true;
    },
  };

  const tactical = createTacticalAISystem({
    actionPortFactory: () => ({
      list() { return []; },
      canStart() { return { ok: false, reason: 'no_actions_fixture' }; },
      start() { return null; },
      status() { return 'idle'; },
      interrupt() { return true; },
      forget() {},
    }),
  });
  const replacer = {
    name: 'deferredDestroyReplacement',
    init(ctx) {
      this.state = ctx.state;
      this.helpers = ctx.helpers;
    },
    update() {
      if (replacementCount || this.state.tick !== 3) return;
      assert.equal(this.helpers.removeEntity(actorA.id, {
        immediate: true,
        reason: 'deferred_destroy_replacement_test',
      }), true);
      actorB = this.helpers.spawnEntity({
        type: 'ship',
        team: 2,
        pos: { x: 40, z: 0 },
        radius: 12,
        data: { ai: { passive: false }, intent: { fire: false } },
      });
      actorB._sensorContacts = [];
      replacementCount++;
    },
  };

  const sim = createSimulation({
    seed: 47083,
    helpers,
    systems: [replacer, tactical],
    updateOrder: [replacer, tactical],
  });
  state = sim.state;
  state.playerId = 999;

  const target = sim.spawn({ type: 'ship', team: 1, pos: { x: 160, z: 0 }, radius: 12 });
  actorA = sim.spawn({
    type: 'ship',
    team: 2,
    pos: { x: 0, z: 0 },
    radius: 12,
    data: { ai: { passive: false }, intent: { fire: false } },
  });
  actorA._sensorContacts = [{
    id: target.id,
    kind: 'ship',
    team: target.team,
    classification: 'live_hostile',
    pos: target.pos,
    vel: target.vel,
    radius: target.radius,
    confidence: 1,
    threat: 0.9,
    hostile: true,
    alive: true,
    valid: true,
    visible: true,
    tags: ['armed'],
  }];

  sim.step();
  assert.equal(state.tick, 1);
  assert.equal(maneuvers.length, 1);
  sim.step();
  assert.equal(state.tick, 2);
  assert.equal(maneuvers.length, 2, 'tick 2 establishes the normal cached maneuver replay');

  sim.step();
  assert.equal(state.tick, 3);
  assert.equal(actorB.id, actorA.id);
  assert.notStrictEqual(actorB, actorA);
  assert.strictEqual(state.entities.get(actorB.id), actorB);
  const freshReplacementAI = tactical.stack.inspect({ entityId: actorB.id });
  assert.equal(freshReplacementAI.perception.self.id, actorB.id,
    'the late A destroy receipt must not erase B\'s fresh perception');
  assert.equal(freshReplacementAI.perception.self.pos.x, 40);
  assert.equal(freshReplacementAI.behavior.actionId, null,
    'B must have a fresh idle behavior state, not A\'s action state');
  assert.ok(freshReplacementAI.maneuver, 'B must retain the fresh maneuver runtime after flush');
  assert.equal(tactical.stack.lastResult.tick, 3, 'B must own the fresh decision after replacement');

  const maneuversBeforeNextTick = maneuvers.length;
  sim.step();
  assert.equal(state.tick, 4);
  assert.deepEqual(maneuvers.slice(maneuversBeforeNextTick), [{
    entityId: actorB.id,
    tick: 4,
    kind: maneuvers[maneuversBeforeNextTick - 1].kind,
  }], 'the next skipped tick must replay B\'s own maneuver');
});
