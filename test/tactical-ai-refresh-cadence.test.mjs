import assert from 'node:assert/strict';
import test from 'node:test';

import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../src/ai/doctrine.js';
import { setSimCoreFlags } from '../src/core/simCoreFlags.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';

// The production stack thinks every third tick (20 Hz) and staggers each hull's sensor refresh by
// id bucket (id % 3) and a 3-per-window member batch. Both staggers were written for a stack that
// runs every tick; at a 20 Hz think they aliased, so only the hulls whose bucket matched the think
// phase ever refreshed and the rest flew on a contact picture up to 16 s old (swarm round 6,
// measured 2026-11-23). Every hull must now see the world at least once per think.

function run({ flags, doctrine, ticks = 30 }) {
  setSimCoreFlags(flags);
  try {
    const player = ship(100, 0, 0);
    const hulls = [ship(30, 1, 200, doctrine ? combatAI() : passiveAI()),
      ship(31, 1, 240, doctrine ? combatAI() : passiveAI()),
      ship(32, 1, 280, doctrine ? combatAI() : passiveAI()),
      ship(33, 1, 320, doctrine ? combatAI() : passiveAI())];
    const actors = new Map([player, ...hulls].map((entity) => [entity.id, entity]));
    const refreshTicks = new Map(hulls.map((entity) => [entity.id, []]));
    const tactical = createTacticalAISystem({
      seed: 47,
      config: {
        runtime: { decisionIntervalTicks: 3, memberBatchSize: 3, memberBatchSpreadTicks: 3 },
        trace: { enabled: false },
      },
      sensors: {
        frameFor(entityId, tick) {
          refreshTicks.get(entityId).push(tick);
          return frame(actors.get(entityId), player, tick, doctrine);
        },
      },
      roster: {
        listSquads(tick) {
          return [{
            id: 'cadence_fixture', doctrine: 'patrol', faction: 'fixture', tick,
            members: hulls.map((entity) => ({
              id: entity.id,
              capabilities: ['drive', 'sensor', 'weapon', 'ranged'],
              combatDoctrineId: doctrine ? 'interceptor_flyby' : null,
              team: entity.team,
              alive: true,
              pos: entity.pos,
              passive: false,
              playerId: player.id,
              playerTeam: player.team,
              authorityOrigin: player.pos,
              authorityRadius: 5000,
            })),
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
      world: { currentSectorId: 'sector_ceres_belt' },
      entities: actors,
      entityList: [player, ...hulls],
      combat: { trace: { events: [] } },
    };
    tactical.init({ state, bus: null, helpers: {} });
    for (let tick = 0; tick < ticks; tick++) {
      state.tick = tick;
      tactical.update(1 / 60, state);
    }
    return refreshTicks;
  } finally {
    setSimCoreFlags({});
  }
}

function longestGap(ticks, end) {
  let gap = 0;
  let last = null;
  for (const tick of ticks) {
    if (last != null) gap = Math.max(gap, tick - last);
    last = tick;
  }
  return Math.max(gap, end - (last ?? 0));
}

test('every doctrine hull refreshes its perception on each 20 Hz think', () => {
  const refreshed = run({ flags: { aiRefreshCadence: true }, doctrine: true });
  for (const [id, ticks] of refreshed) {
    assert.ok(ticks.length >= 9, `hull ${id} refreshed ${ticks.length} times in 30 ticks`);
    assert.ok(longestGap(ticks, 29) <= 3, `hull ${id} went ${longestGap(ticks, 29)} ticks without a fresh picture`);
  }
});

test('the legacy aliased schedule starves every doctrine hull outside the think phase', () => {
  // Pins the bug the flag fixes, so the A/B switch keeps meaning what it says.
  const refreshed = run({ flags: { aiRefreshCadence: false }, doctrine: true });
  const starved = [...refreshed.values()].filter((ticks) => ticks.length <= 1).length;
  assert.ok(starved >= 2, `expected the aliased schedule to starve hulls, starved ${starved}`);
});

test('the member batch still reaches every non-doctrine hull within a few thinks', () => {
  const refreshed = run({ flags: { aiRefreshCadence: true }, doctrine: false, ticks: 60 });
  for (const [id, ticks] of refreshed) {
    assert.ok(ticks.length >= 10, `hull ${id} refreshed only ${ticks.length} times in 60 ticks`);
    assert.ok(longestGap(ticks, 59) <= 6, `hull ${id} went ${longestGap(ticks, 59)} ticks without a fresh picture`);
  }
});

function frame(entity, player, tick, doctrine) {
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
      capabilities: ['drive', 'sensor', 'weapon', 'ranged'],
      subsystemFractions: {},
      activity: entity.data.ai.activity || null,
      roe: entity.data.ai.roe,
      combatDoctrineId: doctrine ? 'interceptor_flyby' : null,
    },
    contacts: [{
      id: player.id,
      kind: 'ship',
      team: player.team,
      classification: 'live_hostile',
      pos: player.pos,
      vel: player.vel,
      radius: player.radius,
      confidence: 1,
      threat: 0.9,
      hostile: true,
      alive: true,
      valid: true,
      visible: true,
      tags: ['armed'],
    }],
    events: [],
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
    data: { ...(ai ? { ai } : {}), intent: { fire: false }, combat: {}, weapons: [{ projSpeed: 420 }] },
  };
}

function passiveAI() {
  return { passive: false, roe: RulesOfEngagement.HOLD_FIRE, activity: null };
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
