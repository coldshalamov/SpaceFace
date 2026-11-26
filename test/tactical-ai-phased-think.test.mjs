import assert from 'node:assert/strict';
import test from 'node:test';

import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../src/ai/doctrine.js';
import { TacticalAIStack } from '../src/ai/stack.js';
import { setSimCoreFlags } from '../src/core/simCoreFlags.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';

// aiPhasedThink (2026-11-24): the production stack used to run once every third tick, so all ~16
// hostile hulls paid their whole think — sensor frame, doctrine, action pick, maneuver plan — on
// the same step (~10 ms spike). The flag runs the stack every fixed tick and lets each hull's
// existing stagger slot gate its think instead: the same ~20 Hz cadence per hull, ~1/3 of them
// per step, steering and firing still 60 Hz on replayed decisions. These fixtures pin that the
// per-hull refresh slots are deterministic, that every hull still refreshes once per window, and
// that the flag-off arm reproduces the legacy all-on-one-tick schedule exactly.

function run({ flags, doctrine = true, ticks = 30 } = {}) {
  setSimCoreFlags(flags);
  try {
    const player = ship(100, 0, 0);
    const hulls = [ship(30, 1, 200, combatAI()),
      ship(31, 1, 240, combatAI()),
      ship(32, 1, 280, combatAI()),
      ship(33, 1, 320, combatAI())];
    const actors = new Map([player, ...hulls].map((entity) => [entity.id, entity]));
    const refreshTicks = new Map(hulls.map((entity) => [entity.id, []]));
    const requestTicks = [];
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
            id: 'phased_fixture', doctrine: 'patrol', faction: 'fixture', tick,
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
      maneuver: { request(request) { if (request) requestTicks.push(request.tick ?? state.tick); return true; } },
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
    return { refreshTicks, requestTicks };
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

test('phased think puts every doctrine hull on its own deterministic 3-tick slot', () => {
  const { refreshTicks } = run({ flags: { aiPhasedThink: true, aiRefreshCadence: true } });
  const refreshedPerTick = new Map();
  for (const [id, ticks] of refreshTicks) {
    // The first update has no cached picture, so every hull refreshes once on tick 0; from then
    // on each hull refreshes only on its own slot tick (numeric ids bucket by id % 3).
    for (const tick of ticks.slice(1)) {
      assert.equal(tick % 3, id % 3, `hull ${id} refreshed off its slot at tick ${tick}`);
      refreshedPerTick.set(tick, (refreshedPerTick.get(tick) || 0) + 1);
    }
    assert.ok(ticks.length >= 9, `hull ${id} refreshed ${ticks.length} times in 30 ticks`);
    assert.ok(ticks.length <= 12, `hull ${id} refreshed ${ticks.length} times — more than one slot`);
    assert.ok(longestGap(ticks, 29) <= 3, `hull ${id} went ${longestGap(ticks, 29)} ticks without a fresh picture`);
  }
  // ids 30..33 bucket 0,1,2,0: the whole roster never lands on one tick — at most two hulls
  // refresh per step where the old schedule refreshed all four.
  const perTick = [...refreshedPerTick.values()];
  assert.ok(perTick.length > 0);
  assert.ok(Math.max(...perTick) <= 2, `a single tick refreshed ${Math.max(...perTick)} hulls`);
});

test('phased think keeps 60 Hz maneuver authority and a deterministic schedule', () => {
  const first = run({ flags: { aiPhasedThink: true, aiRefreshCadence: true } });
  const second = run({ flags: { aiPhasedThink: true, aiRefreshCadence: true } });
  // A fresh maneuver request still lands for every hull every tick: non-due members replay their
  // last plan, due members plan fresh — steering never waits for the slot.
  assert.ok(first.requestTicks.length >= 4 * 30,
    `only ${first.requestTicks.length} maneuver requests over 30 ticks`);
  for (const [id, ticks] of first.refreshTicks) {
    assert.deepEqual(second.refreshTicks.get(id), ticks, `hull ${id} refreshed on different ticks between runs`);
  }
});

test('flag off restores the all-hulls-on-one-tick schedule', () => {
  const { refreshTicks } = run({ flags: { aiPhasedThink: false, aiRefreshCadence: true } });
  for (const [id, ticks] of refreshTicks) {
    for (const tick of ticks) {
      assert.equal(tick % 3, 0, `hull ${id} refreshed off the legacy think tick at ${tick}`);
    }
    assert.equal(ticks.length, 10, `hull ${id} refreshed ${ticks.length} times in 30 ticks`);
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

test('phased think gates commander.update to thinkPeriodTicks while off-slot authored steering keeps re-planning', () => {
  setSimCoreFlags({ aiPhasedThink: true, aiRefreshCadence: true });
  let shapedPoint = { x: 300, z: 0 };
  try {
    const player = ship(100, 0, 0);
    const hull = ship(30, 1, 200, combatAI());
    hull.data.ai.combatDoctrineId = null;
    const actors = new Map([[player.id, player], [hull.id, hull]]);
    const requests = [];
    let selections = 0;
    const stack = new TacticalAIStack({
      seed: 47,
      config: {
        runtime: { decisionIntervalTicks: 3, memberBatchSize: 1, memberBatchSpreadTicks: 3 },
        trace: { enabled: false },
      },
      shapeBehavior: (behavior) => ({
        ...behavior,
        targetId: null,
        maneuver: { ...(behavior.maneuver || {}), kind: 'formation', flightPoint: { ...shapedPoint }, reason: 'authored-off-slot' },
      }),
      ports: {
        sensors: { frameFor(entityId, tick) { return frame(actors.get(entityId), player, tick, false); } },
        roster: {
          listSquads(tick) {
            return [{
              id: 'phased_commander_fixture', doctrine: 'patrol', faction: 'fixture', tick,
              members: [{
                id: hull.id, capabilities: ['drive', 'sensor'], combatDoctrineId: null,
                team: hull.team, alive: true, pos: hull.pos, passive: false,
                playerId: player.id, playerTeam: player.team, authorityOrigin: player.pos, authorityRadius: 5000,
              }],
            }];
          },
        },
        maneuver: { request(request) { if (request) requests.push(request); return true; } },
        actions: {
          list: () => { selections++; return []; },
          canStart: () => ({ ok: false }),
          start: () => null,
          status: () => 'idle',
          interrupt: () => true,
        },
      },
    });
    let commanderCalls = 0;
    const origUpdate = stack.commander.update.bind(stack.commander);
    stack.commander.update = (...args) => { commanderCalls++; return origUpdate(...args); };

    for (let tick = 0; tick < 6; tick++) {
      if (tick === 2) shapedPoint = { x: -300, z: 0 };
      stack.update(tick, {});
    }
    assert.equal(commanderCalls, 2, 'commander.update advances on thinkPeriodTicks (0 and 3), not every fixed tick');
    const offSlotReq = requests[2];
    const offSlotDecision = stack.lastDecisionByEntity.get(hull.id);
    assert.equal(offSlotDecision.action.maneuver.reason, 'authored-off-slot',
      'off-slot authored shaping reaches the cached decision under aiPhasedThink');
    assert.ok(offSlotReq.forceLocal.forward < 0,
      'off-slot authored steering re-plans against the moved flightPoint before the next due tick');
    assert.ok(selections <= 2, `action selection stays on the slow cadence (${selections})`);
  } finally {
    setSimCoreFlags({});
  }
});
