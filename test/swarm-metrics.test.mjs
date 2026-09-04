// PQ-174.00 swarm bars — pure measureSwarmRun + .01 opening-quota curve.
//
// Historical traces do not carry first-hostile spawn, named death cause/telegraph, or menus.
// Those fields stay null with a reason. A 90s survivor is right-censored, never a death time.
// Player-death (cause='player', archetype='player') is not a hostile kill. Raw collision
// receipts and combat:collateral are not memorable moments.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isHostileKill,
  isPlayerDeathKill,
  isRightCensored,
  measureSwarmRun,
  SWARM_UNAVAILABLE,
} from '../scripts/lib/bench/swarmMetrics.mjs';
import {
  SWARM_CONCURRENT_MAX,
  SWARM_CONCURRENT_MIN,
  SWARM_LEVEL_CAP,
  SWARM_QUOTA_CAP,
  SWARM_QUOTA_MARGIN,
  SWARM_QUOTA_OPENING_MARGIN,
  SWARM_OPENING_QUOTA,
  isSwarmBossWave,
  swarmConcurrent,
  swarmCurveIsSane,
  swarmLevel,
  swarmPressureAt,
  swarmQuota,
} from '../src/data/swarmMode.js';

const TICK = (tick, type, data = {}) => ({ tick, type, data });
const sec = (ticks) => Math.round((ticks / 60) * 1e6) / 1e6;

function runOf(overrides) {
  return {
    loadoutId: 'physics_toolkit',
    seed: 4242,
    arenaId: 'helios_core',
    stopReason: 'tick_cap',
    simSeconds: 90,
    ticks: 5400,
    eventTrace: [],
    fitReceipt: { hullId: 'hornet', fitted: ['wpn_concussion'] },
    bodyAdmission: { samples: 1 },
    ...overrides,
  };
}

test('player death entity:killed is excluded from hostile kills and is not firstKill', () => {
  const playerDeath = TICK(1004, 'entity:killed', {
    cause: 'player',
    targetId: 1,
    archetype: 'player',
    killerId: 325,
  });
  const hostile = TICK(728, 'entity:killed', {
    cause: 'collision',
    targetId: 328,
    archetype: 'fighter',
    killerId: 328,
  });
  assert.equal(isPlayerDeathKill(playerDeath), true);
  assert.equal(isHostileKill(playerDeath), false);
  assert.equal(isHostileKill(hostile), true);

  const swarm = measureSwarmRun(runOf({
    stopReason: 'player_dead',
    simSeconds: 16.72,
    ticks: 1003,
    eventTrace: [
      TICK(2, 'run:wavePlanned', { wave: 1 }),
      hostile,
      TICK(983, 'entity:killed', { cause: 'weapon', targetId: 327, archetype: 'fighter', killerId: 1 }),
      playerDeath,
    ],
  }));
  assert.equal(swarm.kills.hostile, 2);
  assert.equal(swarm.kills.playerDeathsExcluded, 1);
  assert.equal(swarm.firstKill.available, true);
  assert.equal(swarm.firstKill.seconds, sec(728));
  assert.notEqual(swarm.firstKill.seconds, sec(1004));
  assert.equal(swarm.firstDeath.available, true);
  assert.equal(swarm.firstDeath.censored, false);
  assert.equal(swarm.firstDeath.seconds, sec(1004));
});

test('historical traces leave firstHostile, menus, and death telegraph unavailable — not zero', () => {
  const swarm = measureSwarmRun(runOf({
    stopReason: 'player_dead',
    simSeconds: 16.72,
    ticks: 1003,
    eventTrace: [
      TICK(2, 'run:wavePlanned', { wave: 1 }),
      TICK(168, 'verb:used', { verb: 'brake' }),
      TICK(728, 'entity:killed', { cause: 'collision', targetId: 328, archetype: 'fighter', killerId: 328 }),
      TICK(1004, 'entity:killed', {
        cause: 'player', targetId: 1, archetype: 'player', killerId: 325,
      }),
    ],
  }));
  assert.equal(swarm.firstHostile.available, false);
  assert.equal(swarm.firstHostile.seconds, null);
  assert.match(swarm.firstHostile.reason, /not captured/);
  assert.equal(swarm.menus.available, false);
  assert.equal(swarm.menus.count, null);
  assert.equal(swarm.menus.perWave, null);
  assert.match(swarm.menus.reason, /not captured/);
  assert.equal(swarm.playerDeaths.length, 1);
  assert.equal(swarm.playerDeaths[0].causeAvailable, false);
  assert.equal(swarm.playerDeaths[0].cause, null);
  assert.match(swarm.playerDeaths[0].causeReason, /not captured|not a causal/);
  assert.equal(swarm.playerDeaths[0].telegraphAvailable, false);
  assert.equal(swarm.playerDeaths[0].telegraph, null);
  assert.equal(swarm.quotaFromTrace.available, false);
  assert.equal(swarm.quotaFromTrace.quota, null);
});

test('a 90s survivor is right-censored — never a run-length-to-death', () => {
  assert.equal(isRightCensored('tick_cap', 90, 5400), true);
  assert.equal(isRightCensored('player_dead', 16.72, 1003), false);

  const swarm = measureSwarmRun(runOf({
    eventTrace: [
      TICK(2, 'run:wavePlanned', { wave: 1 }),
      TICK(372, 'entity:killed', { cause: 'weapon', targetId: 10, archetype: 'fighter', killerId: 1 }),
    ],
  }));
  assert.equal(swarm.censored, true);
  assert.equal(swarm.firstDeath.censored, true);
  assert.equal(swarm.firstDeath.available, false);
  assert.equal(swarm.firstDeath.seconds, null);
  assert.match(swarm.firstDeath.reason, /right-censored/);
  assert.ok(!/run-length-to-death/.test(JSON.stringify(swarm.firstDeath.seconds)));
  const w1 = swarm.waveDurations.find((w) => w.wave === 1);
  assert.ok(w1);
  assert.equal(w1.status, 'censored');
  assert.equal(w1.durationSeconds, sec(5400 - 2));
  // Quiet-after-wave-1 is undefined until wave 1 actually completes.
  assert.equal(swarm.quietSecondsAfterWave1.available, false);
});

test('collision:playerKnock and combat:collateral never become memorable moments', () => {
  const spam = [];
  for (let i = 0; i < 80; i++) {
    spam.push(TICK(100 + i, 'collision:playerKnock', { deltaV: 1, causalActorId: null }));
    spam.push(TICK(100 + i, 'combat:collateral', { bodiesInvolved: 2 }));
  }
  const swarm = measureSwarmRun(runOf({
    stopReason: 'tick_cap',
    simSeconds: 90,
    ticks: 5400,
    eventTrace: [
      TICK(2, 'run:wavePlanned', { wave: 1 }),
      ...spam,
      TICK(400, 'entity:killed', { cause: 'weapon', targetId: 9, archetype: 'fighter', killerId: 1 }),
    ],
  }));
  assert.equal(swarm.meaningfulMoments.length, 0);
  assert.equal(swarm.momentsPerMinute, 0);
  assert.equal(swarm.kills.hostile, 1);
});

test('attributed physics kills and coalesced 3-in-2s bursts are moments; bursts coalesce once', () => {
  const swarm = measureSwarmRun(runOf({
    simSeconds: 30,
    ticks: 1800,
    stopReason: 'tick_cap',
    eventTrace: [
      TICK(2, 'run:wavePlanned', { wave: 1 }),
      TICK(600, 'entity:killed', { cause: 'collision', targetId: 2, archetype: 'fighter', killerId: 2 }),
      TICK(620, 'entity:killed', { cause: 'weapon', targetId: 3, archetype: 'fighter', killerId: 1 }),
      TICK(640, 'entity:killed', { cause: 'weapon', targetId: 4, archetype: 'fighter', killerId: 1 }),
      TICK(660, 'entity:killed', { cause: 'weapon', targetId: 5, archetype: 'fighter', killerId: 1 }),
    ],
  }));
  const bursts = swarm.meaningfulMoments.filter((m) => m.kind === 'kill_burst');
  const physics = swarm.meaningfulMoments.filter((m) => m.kind === 'physics_kill');
  assert.equal(bursts.length, 1, 'the 4-kill cluster is one coalesced burst, not four');
  assert.ok(bursts[0].killCount >= 3);
  assert.equal(physics.length, 1);
  assert.equal(physics[0].cause, 'collision');
});

test('completed wave + cleanup from waveCleared → next planned; lastAction is not a death cause', () => {
  const swarm = measureSwarmRun(runOf({
    stopReason: 'tick_cap',
    simSeconds: 90,
    ticks: 5400,
    eventTrace: [
      TICK(2, 'run:wavePlanned', { wave: 1, quota: 22 }),
      TICK(372, 'entity:killed', { cause: 'weapon', targetId: 10, archetype: 'fighter', killerId: 1 }),
      TICK(4122, 'run:waveCleared', { wave: 1 }),
      TICK(4168, 'run:wavePlanned', { wave: 2, quota: 24 }),
    ],
  }));
  const w1 = swarm.waveDurations.find((w) => w.wave === 1);
  assert.equal(w1.status, 'completed');
  assert.equal(w1.endSeconds, sec(4122));
  assert.equal(w1.durationSeconds, sec(4122 - 2));
  const w2 = swarm.waveDurations.find((w) => w.wave === 2);
  assert.equal(w2.status, 'censored');
  const cleanup = swarm.cleanupDurations.find((c) => c.wave === 1);
  assert.equal(cleanup.status, 'completed');
  assert.equal(cleanup.durationTicks, 46);
  assert.equal(cleanup.durationSeconds, sec(46));
  assert.equal(swarm.quotaFromTrace.quota, 22);

  const death = measureSwarmRun(runOf({
    stopReason: 'player_dead',
    simSeconds: 16.72,
    ticks: 1003,
    eventTrace: [
      TICK(1004, 'entity:killed', {
        cause: 'player',
        archetype: 'player',
        targetId: 1,
        killerId: 325,
        lastAction: 'brake',
      }),
    ],
  }));
  assert.equal(death.playerDeaths[0].cause, null);
  assert.equal(death.playerDeaths[0].causeAvailable, false);
  assert.match(death.playerDeaths[0].causeReason, /lastAction is not a causal death cause/);
});

test('new-run capture: firstHostile, menus, quota, and telegraphed death with attacker', () => {
  const swarm = measureSwarmRun(runOf({
    stopReason: 'player_dead',
    simSeconds: 20,
    ticks: 1200,
    eventTrace: [
      TICK(2, 'run:wavePlanned', { wave: 1, quota: 15, concurrent: 10, draftAfter: false }),
      TICK(18, 'hostile:spawned', { entityId: 20, archetype: 'wasp_swarmer', wave: 1 }),
      TICK(80, 'entity:killed', { cause: 'weapon', targetId: 20, archetype: 'fighter', killerId: 1 }),
      TICK(200, 'run:draftOffered', { wave: 5, kind: 'draft' }),
      TICK(1190, 'entity:killed', {
        cause: 'player',
        archetype: 'player',
        targetId: 1,
        killerId: 44,
        attackerId: 44,
        attackerArchetype: 'wasp_swarmer',
        deathCause: 'wasp_swarmer',
        telegraphed: true,
        telegraphInForce: true,
        telegraphKind: 'ram',
      }),
    ],
  }));
  assert.equal(swarm.firstHostile.available, true);
  assert.equal(swarm.firstHostile.seconds, sec(18));
  assert.equal(swarm.menus.available, true);
  assert.equal(swarm.menus.count, 1);
  assert.equal(swarm.quotaFromTrace.quota, 15);
  assert.equal(swarm.playerDeaths[0].causeAvailable, true);
  assert.equal(swarm.playerDeaths[0].cause, 'wasp_swarmer');
  assert.equal(swarm.playerDeaths[0].telegraphAvailable, true);
  assert.equal(swarm.playerDeaths[0].telegraph, 'ram');
});

test('.01 opening quota is 15; later waves still climb; concurrency and level unchanged', () => {
  assert.equal(SWARM_OPENING_QUOTA, 15);
  assert.equal(SWARM_QUOTA_OPENING_MARGIN, 5);
  assert.equal(SWARM_QUOTA_MARGIN, 8, 'global later-wave margin is not weakened');
  assert.equal(SWARM_QUOTA_CAP, 48, 'global cap is not weakened');
  assert.equal(swarmQuota(1), 15);
  assert.equal(swarmConcurrent(1), SWARM_CONCURRENT_MIN);
  assert.equal(swarmConcurrent(1), 10, 'live population at wave 1 is unchanged');
  assert.equal(swarmPressureAt(1, 0), 10, 'opening live pressure is unchanged');
  assert.equal(swarmLevel(1), 1);
  assert.equal(swarmLevel(22), SWARM_LEVEL_CAP);
  // Later count still increases (wave-2 formula is the pre-.01 20+2w curve).
  assert.equal(swarmQuota(2), 24);
  assert.ok(swarmQuota(2) > swarmQuota(1));
  assert.ok(swarmQuota(12) > swarmQuota(1));
  assert.equal(swarmQuota(60), SWARM_QUOTA_CAP);
  for (let wave = 1; wave <= 40; wave++) {
    assert.ok(swarmCurveIsSane(wave), `wave ${wave} stays sane under the opening-specific margin`);
    if (wave > 1 && !isSwarmBossWave(wave) && !isSwarmBossWave(wave - 1)) {
      assert.ok(swarmQuota(wave) >= swarmQuota(wave - 1), `wave ${wave} never asks for less`);
      assert.ok(swarmConcurrent(wave) >= swarmConcurrent(wave - 1));
    }
  }
  assert.equal(swarmConcurrent(999), SWARM_CONCURRENT_MAX);
});

test('armed menu capture reports observed zero instead of historical unavailable', () => {
  const swarm = measureSwarmRun(runOf({
    swarmTelemetry: { menus: true, firstHostile: true, deathTelegraph: true },
    eventTrace: [
      TICK(0, 'swarm:telemetry', { channels: ['hostile:spawned', 'run:draftOffered'] }),
      TICK(2, 'run:wavePlanned', { wave: 1, quota: 15 }),
      TICK(18, 'hostile:spawned', { entityId: 9, archetype: 'wasp_swarmer', wave: 1 }),
      TICK(80, 'entity:killed', { cause: 'weapon', targetId: 9, archetype: 'fighter', killerId: 1 }),
    ],
  }));
  assert.equal(swarm.menus.available, true);
  assert.equal(swarm.menus.count, 0);
  assert.equal(swarm.menus.perWave, 0);
  assert.equal(swarm.firstHostile.available, true);
});

test('unavailable reasons are explicit constants, not inferred zeros', () => {
  assert.ok(SWARM_UNAVAILABLE.firstHostile);
  assert.ok(SWARM_UNAVAILABLE.deathCause);
  assert.ok(SWARM_UNAVAILABLE.menus);
  assert.ok(SWARM_UNAVAILABLE.telegraph);
});
