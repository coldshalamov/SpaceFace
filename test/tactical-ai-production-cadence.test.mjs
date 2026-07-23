import assert from 'node:assert/strict';
import test from 'node:test';

import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../src/ai/doctrine.js';
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
