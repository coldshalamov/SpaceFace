// CHAMPIONS ARRIVE OWED — hull, crew or capital, every body a champion package.
//
// C01-01: the command colossi (Nest Carrier, Furnace Maw, Adjudicator 44-C, Hive-Hulk)
// sat past round 30 — unreachable, and the wrap/escort cases are retired; see
// test/RETIRED_SWARM_ENDLESS.md. The laws they pinned survive on the course's six
// champions: capital rows field one scored hull, the Wing and the Anvil field their
// authored crews, every champion package is spent from opening chaff on one bearing.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { swarmJuice } from '../src/systems/swarmJuice.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import {
  SWARM_BOSS_ROTATION,
  SWARM_RULESET,
  bossPackagesFor,
  swarmBossFor,
  swarmEligibleEnemyIds,
  swarmOpeningCount,
  swarmPressureAt,
  swarmQuota,
  swarmConcurrent,
} from '../src/data/swarmMode.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';

const DT = 1 / 60;
const SEED = 4242;
// Seed 4242 parks the Yardmaster's deterministic draw exactly on the materialization line
// (the pos clamps to SWARM_MIN_ARRIVAL_WU and the float lands a hair under — the pending
// entry redraws the same spot forever; an E4 boundary quirk, not a wave-20 claim). Seed 7
// draws the hull clear so the landing claim stays honest.
const HULL_SEED = 7;
const ARENA = 'helios_core';

function boot(wave, seed = SEED) {
  const state = createGameState(seed);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const budget = makeBudgetApi(state);
  const spawned = [];
  const helpers = {
    spawnBudget: budget,
    routeCombatDamage(packet) { return packet; },
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship', team: 0 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));
  state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed });
  state.run.arenaId = ARENA;
  state.run.phase = 'active';
  state.run.wave = wave;

  const ctx = { state, bus, helpers };
  survivalWave.init(ctx);
  swarmJuice.init(ctx);
  const capSys = createProductionCapitalBossEncounters();
  capSys.init(ctx);
  return { state, bus, emitted, spawned, capSys };
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.tick += 1;
    h.state.simTime += DT;
    survivalWave.update(DT);
    swarmJuice.update(DT, h.state);
    h.capSys.update(DT);
  }
}

function planFor(wave, seed = SEED) {
  const plan = planWave({ seed, arenaId: ARENA, wave, ruleset: SWARM_RULESET });
  assert.ok(!plan.error, `wave ${wave} plans`);
  return plan;
}

function startWave(h, wave, seed = SEED) {
  h.bus.emit('run:wavePlanned', { wave, plan: planFor(wave, seed) });
  h.bus.emit('run:waveStarted', { wave });
  tick(h, 2);
}

function cohort(h) {
  return h.spawned.filter((e) => e.data && e.data.runCohort === SURVIVAL_COHORT_TAG);
}
function championBodies(h) {
  return cohort(h).filter((e) => e.data.swarmChampion === true);
}
function bossRow(id) {
  return SWARM_BOSS_ROTATION.find((b) => b.id === id);
}

// The course's six champions: capitals field one hull under a score stamp; the Wing and
// the Anvil field their authored crews — every body champion-owed, one bearing.
const CAPITALS = [
  [5, 'dreadnought_boss', 'capital_boss_hulk'],
  [15, 'mirrorjaw_foreman', 'capital_boss_foreman'],
  [20, 'yardmaster', 'capital_boss_yardmaster'],
  [30, 'forge_regent', 'capital_boss_regent'],
];
const CREWS = [
  [10, 'corsair_wing', [['corsair_raider', 3]]],
  [25, 'the_anvil', [['pd_screen_escort', 2], ['bruiser_brawler', 2]]],
];

test('the course rows field their authored packages — capitals solo, crews as the fight', () => {
  for (const [wave, hullId, scoreId] of CAPITALS) {
    const boss = swarmBossFor(wave);
    assert.equal(boss, bossRow(boss.id), `wave ${wave} returns the authored row itself`);
    assert.equal(boss.cycle, undefined, `wave ${wave} is the first pass`);
    assert.equal(boss.scoreId, scoreId);
    assert.deepEqual(
      bossPackagesFor(boss).map((p) => [p.enemyId, p.count]),
      [[hullId, 1]],
      `wave ${wave} fields the capital hull alone`,
    );
    assert.equal(bossPackagesFor(boss)[0].enemyId, boss.enemyId,
      `wave ${wave} hull stays package zero — the score binding reads package order`);
  }
  for (const [wave, bossId, crew] of CREWS) {
    const boss = swarmBossFor(wave);
    assert.equal(boss.id, bossId);
    assert.equal(boss.scoreId, undefined, `wave ${wave} is a crew, not a capital`);
    assert.deepEqual(
      bossPackagesFor(boss).map((p) => [p.enemyId, p.count]),
      crew,
      `wave ${wave} fields its authored crew`,
    );
  }
});

test('every course champion materializes its owed bodies through the real path', () => {
  for (const wave of [5, 10, 15, 20, 25, 30]) {
    const seed = wave === 20 ? HULL_SEED : SEED;
    const h = boot(wave, seed);
    startWave(h, wave, seed);
    const boss = swarmBossFor(wave);
    const owed = planFor(wave, seed).packages.filter((p) => p.champion === true)
      .reduce((sum, p) => sum + p.count, 0);
    const champions = championBodies(h);
    assert.equal(champions.length, owed, `wave ${wave} owes ${owed} champion bodies`);
    for (const e of champions) {
      assert.equal(e.data.swarmChampion, true, `wave ${wave} body is an owed champion`);
      assert.equal(e.data.runWave, wave);
    }
    // A capital hull lands under its score stamp — and only the hull does. The score
    // binds the stamped body, not a crewmate. (Compositional rows keep their authored
    // hunter trick — the Wing's phase-jammer rides; capital rows carry none.)
    if (boss.scoreId) {
      const hull = champions.find((e) => e.data.missionTag === 'capital_boss');
      assert.ok(hull, `wave ${wave} capital hull landed`);
      assert.equal(hull.data.bountyHunt, undefined, 'a capital row carries no hunter trick');
      const starts = h.emitted.filter((e) => e.event === 'capitalBoss:start');
      assert.equal(starts.length, 1, `wave ${wave} opened one capital fight`);
      assert.equal(starts[0].payload.bossId, hull.id);
      assert.equal(starts[0].payload.encounterId, boss.scoreId);
    } else {
      assert.ok(champions.every((e) => e.data.missionTag === undefined),
        `wave ${wave} crew fields no capital stamp`);
    }
  }
});

test('capital colossi materialize exactly one champion — the hull rides alone', () => {
  for (const [wave, hullId] of CAPITALS) {
    const seed = wave === 20 ? HULL_SEED : SEED;
    const h = boot(wave, seed);
    startWave(h, wave, seed);
    const champions = championBodies(h);
    assert.equal(champions.length, 1, `wave ${wave} owes exactly one champion`);
    assert.equal(champions[0].data.lootTableId, hullId);
    assert.equal(champions[0].data.missionTag, 'capital_boss');
    const plan = planFor(wave, seed);
    assert.equal(plan.packages.filter((p) => p.champion === true).length, 1,
      `wave ${wave} plans one champion package`);
  }
});

test('champion seats are spent from opening chaff — the room stays exactly as full', () => {
  for (const wave of [5, 10, 15, 20, 25, 30]) {
    const plan = planFor(wave);
    // The whole opening burst — champions and chaff together — lands exactly on the wave's
    // opening pressure, the same fill an ordinary round fields. Champion bodies displace
    // chaff 1:1, never stack on top.
    assert.equal(
      swarmOpeningCount(plan.packages),
      swarmPressureAt(wave, 0),
      `wave ${wave} opening burst is the wave's own pressure — champions did not stack on top`,
    );
    assert.equal(plan.swarm.concurrent, swarmConcurrent(wave), `wave ${wave} concurrency is authored`);
    assert.equal(plan.swarm.killTarget, swarmQuota(wave), `wave ${wave} quota is authored`);
    // Champions lead the wave — one arrival in time, each on its authored bearing
    // (the Anvil's crew splits across two gates; the hull-and-tender rows share one).
    const champions = plan.packages.filter((p) => p.champion === true);
    assert.ok(champions.length >= 1, `wave ${wave} fields a champion package`);
    for (const pkg of champions) {
      assert.equal(pkg.atTick, 0, `wave ${wave} champions land together`);
      assert.ok(typeof pkg.gateGroup === 'string' && pkg.gateGroup,
        `wave ${wave} champion keeps its authored gate`);
    }
  }
});

// Retired with C01-01 — wrap/escort cases that only existed past round 30 (see
// test/RETIRED_SWARM_ENDLESS.md):
//   - a wrapped command row keeps its attendants AND wears the guard — bounded by the
//     shared cap
//   - a wrapped escorted wave materializes hull plus attendants plus guard inside the
//     same law
//   - solo rows keep the exact wrap law they shipped — the guard formula is unchanged

test('the card and the announce name the course champion — id, label, line, room ride the row', () => {
  const h = boot(30);
  startWave(h, 30);
  const intro = h.emitted.filter((e) => e.event === 'swarm:bossIntro');
  assert.equal(intro.length, 1, 'one versus card');
  assert.equal(intro[0].payload.name, 'Forge Regent', 'the card names the champion');
  const plan = planFor(30).swarm;
  assert.equal(plan.bossId, 'forge_regent');
  assert.equal(plan.bossLabel, 'Forge Regent');
  assert.equal(plan.bossScoreId, 'capital_boss_regent');
  assert.equal(plan.bossEnemyId, 'forge_regent');
  assert.equal(plan.bossRoom, 'crown_furnace');
  assert.equal(plan.bossCycle, 0);
  // Prewarm still sees the hull the wave fields.
  const eligible = swarmEligibleEnemyIds(30);
  assert.ok(eligible.has('forge_regent'), 'the launch warm covers the Regent hull');
});

test('course champion plans stay deterministic — same seed, same composition', () => {
  for (const wave of [5, 10, 15, 20, 25, 30]) {
    const a = planFor(wave);
    const b = planFor(wave);
    assert.deepEqual(a.packages, b.packages, `wave ${wave} packages drifted`);
    assert.equal(a.swarm.bossLabel, b.swarm.bossLabel);
  }
});
