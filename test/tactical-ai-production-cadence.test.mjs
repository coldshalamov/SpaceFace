import assert from 'node:assert/strict';
import test from 'node:test';

import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../src/ai/doctrine.js';
import { shouldRunOnTick } from '../src/core/activityScheduler.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';

test('production Tactical AI decisions run at 30 Hz while physical requests remain 60 Hz', () => {
  assert.equal(createTacticalAISystem().decisionIntervalTicks, 2,
    'the live helper-port stack must amortize full decisions across two fixed ticks');
});

test('injected Tactical AI fixtures retain every-tick decisions unless explicitly configured', () => {
  const sensorPort = {};
  assert.equal(createTacticalAISystem({ sensors: sensorPort }).decisionIntervalTicks, 1);
  assert.equal(createTacticalAISystem({
    sensors: sensorPort,
    config: { runtime: { decisionIntervalTicks: 3 } },
  }).decisionIntervalTicks, 3);
});

test('off-table passive tactical actors sleep while near and hostile actors stay awake', () => {
  const player = ship(100, 0, 0);
  const nearPassive = ship(1, 2, 100, { passive: true });
  const farPassive = ship(2, 2, 1200, { passive: true });
  const farHostile = ship(3, 1, 1200, { passive: false });
  const actors = new Map([nearPassive, farPassive, farHostile].map((entity) => [entity.id, entity]));
  const sensorTicks = new Map([...actors.keys()].map((id) => [id, []]));
  const authorityOrigin = player.pos;
  const rosterMember = (entity) => ({
    id: entity.id,
    capabilities: ['drive'],
    combatDoctrineId: null,
    team: entity.team,
    alive: true,
    pos: entity.pos,
    passive: entity.data.ai.passive,
    playerId: player.id,
    playerTeam: player.team,
    authorityOrigin,
    authorityRadius: 500,
  });
  const tactical = createTacticalAISystem({
    seed: 47,
    config: {
      runtime: { decisionIntervalTicks: 1, memberBatchSize: 3 },
      trace: { enabled: false },
    },
    sensors: {
      frameFor(entityId, tick) {
        sensorTicks.get(entityId).push(tick);
        return idleSensorFrame(actors.get(entityId), tick);
      },
    },
    roster: {
      listSquads(tick) {
        return [{
          id: 'sleep_fixture',
          doctrine: 'patrol',
          faction: 'fixture',
          tick,
          members: [...actors.values()].map(rosterMember),
        }];
      },
    },
    maneuver: { request() { return true; } },
    actionPortFactory: () => idleActionPort(),
  });
  const state = {
    tick: 0,
    playerId: player.id,
    player: { heat: 0 },
    entities: new Map([[player.id, player], ...actors]),
    entityList: [player, ...actors.values()],
    combat: { trace: { events: [] } },
  };
  tactical.init({ state, bus: null, helpers: {} });
  for (let tick = 0; tick < 16; tick++) {
    state.tick = tick;
    tactical.update(1 / 60, state);
  }

  assert.deepEqual(sensorTicks.get(nearPassive.id), [...Array(16).keys()],
    'an actor inside deterministic table authority stays at full tactical cadence');
  assert.deepEqual(sensorTicks.get(farHostile.id), [...Array(16).keys()],
    'a hostile actor stays awake even when off-table');
  assert.deepEqual(sensorTicks.get(farPassive.id), [0, ...[...Array(15).keys()]
    .map((tick) => tick + 1)
    .filter((tick) => shouldRunOnTick(tick, `sleep:${farPassive.id}`, 8))],
  'the passive off-table actor fills its initial cache, then uses the deterministic sleep phase');
});

test('skipped decision ticks revoke cached fire immediately when the live target dies', () => {
  const target = ship(1, 0, 320);
  const attacker = ship(2, 1, 0, combatAI());
  const state = {
    tick: 120,
    playerId: target.id,
    player: { heat: 0 },
    world: { currentSectorId: 'sector_ceres_belt' },
    entities: new Map([[target.id, target], [attacker.id, attacker]]),
    entityList: [target, attacker],
    combat: { trace: { events: [] } },
  };
  const tactical = createTacticalAISystem({
    seed: 47,
    config: { runtime: { decisionIntervalTicks: 2 }, trace: { enabled: false } },
    sensors: { frameFor(entityId, tick) { return sensorFrame(attacker, target, entityId, tick); } },
    roster: {
      listSquads() {
        return [{
          id: 'cadence_fire_fixture',
          doctrine: 'scavenger',
          faction: 'fixture',
          members: [{
            id: attacker.id,
            capabilities: ['drive', 'sensor', 'weapon', 'ranged'],
            combatDoctrineId: 'interceptor_flyby',
          }],
        }];
      },
    },
    maneuver: { request() { return true; } },
    actionPortFactory: () => actionPort(),
  });
  tactical.init({ state, bus: null, helpers: {} });
  let authorizedTick = null;
  for (let tick = 120; tick <= 180; tick++) {
    state.tick = tick;
    tactical.update(1 / 60, state);
    if (attacker.data.intent.fire) {
      authorizedTick = tick;
      break;
    }
  }
  assert.notEqual(authorizedTick, null, 'the live doctrine reaches an authorized fire window');
  assert.equal(attacker.data.intent.fire, true,
    'the full decision tick authorizes live fire');

  target.alive = false;
  state.tick = authorizedTick + 1;
  tactical.update(1 / 60, state);
  assert.equal(attacker.data.intent.fire, false,
    'the next fixed tick clears stale authorization without waiting for another tactical decision');
});

function sensorFrame(attacker, target, entityId, tick) {
  return {
    tick,
    self: {
      id: entityId,
      team: attacker.team,
      pos: attacker.pos,
      vel: attacker.vel,
      rot: attacker.rot,
      radius: attacker.radius,
      hullFraction: 1,
      energyFraction: 1,
      heatFraction: 0,
      disabled: false,
      tethered: false,
      capabilities: ['drive', 'sensor', 'weapon', 'ranged'],
      subsystemFractions: {},
      activity: attacker.data.ai.activity,
      roe: attacker.data.ai.roe,
      combatDoctrineId: 'interceptor_flyby',
    },
    contacts: [{
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
      alive: target.alive,
      valid: target.alive,
      visible: target.alive,
      tags: ['armed'],
    }],
    events: [],
  };
}

function actionPort() {
  return {
    list() {
      return [{
        id: 'action_burst',
        tags: ['attack'],
        range: 700,
        preferredRange: 220,
        targetKinds: ['ship'],
      }];
    },
    canStart() { return { ok: true, reason: 'fixture_ok' }; },
    start(entityId, actionId, request) { return { entityId, actionId, startedTick: request.tick }; },
    status() { return 'running'; },
    interrupt() { return true; },
  };
}

function idleActionPort() {
  return {
    list() { return []; },
    canStart() { return { ok: false, reason: 'idle_fixture' }; },
    start() { return null; },
    status() { return 'idle'; },
    interrupt() { return true; },
  };
}

function idleSensorFrame(entity, tick) {
  return {
    tick,
    self: {
      id: entity.id,
      team: entity.team,
      pos: entity.pos,
      vel: entity.vel,
      rot: entity.rot,
      radius: entity.radius,
      hullFraction: 1,
      energyFraction: 1,
      heatFraction: 0,
      disabled: false,
      tethered: false,
      capabilities: ['drive'],
      subsystemFractions: {},
      activity: null,
      roe: RulesOfEngagement.HOLD_FIRE,
      combatDoctrineId: null,
    },
    contacts: [],
    events: [],
  };
}

function ship(id, team, x, ai = null) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    factionId: team === 1 ? 'faction_reach' : 'faction_free',
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 12,
    data: {
      ...(ai ? { ai } : {}),
      intent: { fire: false },
      combat: {},
      weapons: [{ projSpeed: 420 }],
    },
  };
}

function combatAI() {
  return {
    passive: false,
    lawful: false,
    forcePlayerTarget: true,
    hostileTeams: [0],
    motive: 'assigned_interdiction',
    engagementTrigger: 'authorized_hostile_spawn',
    zoneId: 'zone_ceres_belt',
    approachTelegraph: 'engine_flare',
    noFireResponseWindowS: 1,
    combatDoctrineId: 'interceptor_flyby',
    activity: normalizeActivity({
      kind: ActivityKind.ATTACK_RUN,
      reason: 'test_attack_run',
      anchor: { x: 0, z: 0 },
      leashRadius: 2200,
      startedTick: 0,
    }),
    roe: RulesOfEngagement.WEAPONS_FREE,
  };
}
