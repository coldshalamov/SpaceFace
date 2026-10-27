// COMMAND COLOSSI ARRIVE WITH ATTENDANTS — the authored escort fold.
//
// Late-rotation capital champions used to field alone: waves 90–140 were the same hull solo,
// which is the exact failure the wrap fix already named for wave 150. The command rows —
// the Nest Carrier, the Furnace Maw, Adjudicator 44-C and the Hive-Hulk — now carry
// `escort`: attendant champions folded in beside the hull through `bossPackagesFor`, spent
// out of the wave's own opening chaff (never stacked on top), owed like every champion
// package. Lone silhouettes — the Casket Worm's grave-work, the Yardmaster's wreck-ball —
// stay solo: a thing with no crew commands nothing.
//
// On a wrapped pass the honor guard shares the escort budget: the wardens top the authored
// entourage up to the cycle's escort target instead of stacking on it, so a wrapped command
// row keeps its attendants AND its guard without exceeding the room's escort ceiling.

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
  SWARM_WRAP_ESCORT_ENEMY,
  SWARM_WRAP_ESCORT_MAX,
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
const ARENA = 'helios_core';

function boot(wave) {
  const state = createGameState(SEED);
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
  state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
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

function planFor(wave) {
  const plan = planWave({ seed: SEED, arenaId: ARENA, wave, ruleset: SWARM_RULESET });
  assert.ok(!plan.error, `wave ${wave} plans`);
  return plan;
}

function startWave(h, wave) {
  h.bus.emit('run:wavePlanned', { wave, plan: planFor(wave) });
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

// wave → [boss hull enemyId, escort enemyId] for the escorted command rows.
const ESCORTED = [
  [90, 'nest_carrier', 'mine_layer_jackal'],
  [110, 'furnace_maw', 'bruiser_brawler'],
  [130, 'adjudicator_44c', 'patrol_lawman'],
  [140, 'hive_hulk', 'tether_control_raider'],
];
const SOLO = [
  [100, 'casket_worm'],
  [120, 'yardmaster'],
];

test('the command rows fold hull plus attendants; the lone silhouettes stay solo', () => {
  for (const [wave, hullId, escortId] of ESCORTED) {
    const boss = swarmBossFor(wave);
    assert.equal(boss, bossRow(boss.id), `wave ${wave} returns the authored row itself`);
    assert.equal(boss.cycle, undefined, `wave ${wave} is the first pass`);
    const packages = bossPackagesFor(boss);
    assert.deepEqual(
      packages.map((p) => [p.enemyId, p.count]),
      [[hullId, 1], [escortId, 2]],
      `wave ${wave} fields the capital hull plus a pair of attendants`,
    );
    assert.equal(packages[0].enemyId, boss.enemyId,
      `wave ${wave} hull stays package zero — the score binding reads package order`);
    assert.equal(packages[1].sameGate, true, `wave ${wave} attendants arrive on the hull's own gate`);
  }
  for (const [wave, hullId] of SOLO) {
    const boss = swarmBossFor(wave);
    assert.equal(boss.escort, undefined, `wave ${wave} authors no escort — a lone silhouette`);
    assert.deepEqual(
      bossPackagesFor(boss).map((p) => [p.enemyId, p.count]),
      [[hullId, 1]],
      `wave ${wave} fields the hull alone`,
    );
  }
});

test('escorted waves materialize the capital hull plus owed attendant champions through the real path', () => {
  for (const [wave, hullId, escortId] of ESCORTED) {
    const h = boot(wave);
    startWave(h, wave);
    const bodies = cohort(h);
    // The capital hull lands under its score stamp — and only the hull does.
    const hull = bodies.find((e) => e.data.missionTag === 'capital_boss');
    assert.ok(hull, `wave ${wave} capital hull landed`);
    assert.equal(hull.data.lootTableId, hullId, `wave ${wave} score rides the ${hullId} hull`);
    assert.equal(hull.data.swarmChampion, true);
    // The attendants are real cohort bodies, champion-flagged and owed like the hull —
    // but never the score's own body and never a hunter trick (capital rows carry none).
    const attendants = bodies.filter((e) => e.data.lootTableId === escortId);
    assert.equal(attendants.length, 2, `wave ${wave} fields two ${escortId} attendants`);
    for (const e of attendants) {
      assert.equal(e.data.swarmChampion, true, `wave ${wave} attendant is an owed champion`);
      assert.equal(e.data.missionTag, undefined, 'the attendant is not the score hull');
      assert.equal(e.data.bountyHunt, undefined, 'a capital row carries no hunter trick');
      assert.equal(e.data.runWave, wave);
    }
    // The score binds the HULL, not an attendant — the fight record opens on the stamped body.
    const starts = h.emitted.filter((e) => e.event === 'capitalBoss:start');
    assert.equal(starts.length, 1, `wave ${wave} opened one capital fight`);
    assert.equal(starts[0].payload.bossId, hull.id, `wave ${wave} score owns the hull, not an attendant`);
    assert.equal(starts[0].payload.encounterId, bossRow(hullId).scoreId);
    // Every champion is owed: requireBoss counts hull + attendants alike.
    assert.equal(championBodies(h).length, 3, `wave ${wave} owes three champion bodies`);
  }
});

test('solo colossi materialize exactly one champion — no attendants sneak in', () => {
  for (const [wave, hullId] of SOLO) {
    const h = boot(wave);
    startWave(h, wave);
    const champions = championBodies(h);
    assert.equal(champions.length, 1, `wave ${wave} owes exactly one champion`);
    assert.equal(champions[0].data.lootTableId, hullId);
    assert.equal(champions[0].data.missionTag, 'capital_boss');
    const plan = planFor(wave);
    assert.equal(plan.packages.filter((p) => p.champion === true).length, 1,
      `wave ${wave} plans one champion package`);
  }
});

test('attendant seats are spent from opening chaff — the room stays exactly as full', () => {
  for (const [wave] of [...ESCORTED, ...SOLO]) {
    const plan = planFor(wave);
    // The whole opening burst — champions and chaff together — lands exactly on the wave's
    // opening pressure, the same fill a solo boss wave fields. Escorts displace chaff 1:1.
    assert.equal(
      swarmOpeningCount(plan.packages),
      swarmPressureAt(wave, 0),
      `wave ${wave} opening burst is the wave's own pressure — attendants did not stack on top`,
    );
    assert.equal(plan.swarm.concurrent, swarmConcurrent(wave), `wave ${wave} concurrency is authored`);
    assert.equal(plan.swarm.killTarget, swarmQuota(wave), `wave ${wave} quota is authored`);
    // Champions lead the wave and share one bearing — the arrival reads as one event.
    const champions = plan.packages.filter((p) => p.champion === true);
    for (const pkg of champions) {
      assert.equal(pkg.atTick, 0, `wave ${wave} attendants land with the hull`);
      assert.equal(pkg.gateGroup, champions[0].gateGroup, `wave ${wave} one gate, one arrival`);
    }
  }
});

test('a wrapped command row keeps its attendants AND wears the guard — bounded by the shared cap', () => {
  // hive_hulk sits at rotation index 13: wraps land on waves 280/420/560/700 (cycles 1–4).
  for (const [wave, cycle, wardens] of [[280, 1, 1], [420, 2, 1], [560, 3, 1], [700, 4, 2]]) {
    const boss = swarmBossFor(wave);
    assert.equal(boss.id, 'hive_hulk', `wave ${wave} lands the Hive-Hulk again`);
    assert.equal(boss.cycle, cycle, `wave ${wave}`);
    assert.equal(boss.label, `Hive-Hulk ${['II', 'III', 'IV', 'V'][cycle - 1]}`);
    const packages = bossPackagesFor(boss);
    // The authored entourage is still there — the wrap replaces nothing.
    const attendants = packages.filter((p) => p.enemyId === 'tether_control_raider');
    assert.equal(attendants.reduce((s, p) => s + p.count, 0), 2, `wave ${wave} keeps its tenders`);
    // The guard fills the shared escort budget: attendants + wardens top up to the cycle
    // target and never exceed SWARM_WRAP_ESCORT_MAX — but the guard is never absent.
    const guard = packages.find((p) => p.enemyId === SWARM_WRAP_ESCORT_ENEMY);
    assert.ok(guard, `wave ${wave} wears a warden guard`);
    assert.equal(guard.count, wardens, `wave ${wave} wardens are the shortfall, not a stack`);
    const escortTotal = bossPackagesFor(boss)
      .slice(1)
      .reduce((s, p) => s + p.count, 0);
    assert.ok(escortTotal <= SWARM_WRAP_ESCORT_MAX,
      `wave ${wave} total escorts ${escortTotal} stay inside the wrap cap`);
    assert.ok(bossPackagesFor(boss)[0].enemyId === 'hive_hulk', 'the hull stays package zero');
  }
});

test('a wrapped escorted wave materializes hull plus attendants plus guard inside the same law', () => {
  const h = boot(280);
  startWave(h, 280);
  const bodies = championBodies(h);
  const hull = bodies.find((e) => e.data.missionTag === 'capital_boss');
  assert.ok(hull, 'the wrapped Hive-Hulk hull landed under its score stamp');
  assert.equal(hull.data.lootTableId, 'hive_hulk');
  assert.equal(bodies.filter((e) => e.data.lootTableId === 'tether_control_raider').length, 2,
    'the authored tenders ride the wrap');
  assert.equal(bodies.filter((e) => e.data.lootTableId === SWARM_WRAP_ESCORT_ENEMY).length, 1,
    'the cycle-one guard tops the entourage up');
  assert.equal(bodies.length, 4, 'hull + two tenders + one warden — all owed');
  // The same opening fill as the base wave — the guard is spent from chaff too.
  assert.equal(swarmOpeningCount(planFor(280).packages), swarmPressureAt(280, 0));
  // The versus card names the pass.
  const intro = h.emitted.filter((e) => e.event === 'swarm:bossIntro');
  assert.equal(intro.length, 1);
  assert.equal(intro[0].payload.name, 'Hive-Hulk II');
});

test('solo rows keep the exact wrap law they shipped — the guard formula is unchanged', () => {
  // iron_maw carries no escort: the warden count is min(cycle, MAX), byte-identical to before.
  for (const [wave, count] of [[150, 1], [290, 2], [430, 3], [570, 4]]) {
    const guard = bossPackagesFor(swarmBossFor(wave)).find((p) => p.enemyId === SWARM_WRAP_ESCORT_ENEMY);
    assert.equal(guard && guard.count, count, `wave ${wave}`);
  }
  // And a compositional row's wing is the boss, not an entourage — the guard still stacks.
  const wing = swarmBossFor(180);
  assert.equal(bossPackagesFor(wing).filter((p) => p.enemyId === 'corsair_raider')
    .reduce((s, p) => s + p.count, 0), 3, 'the aces are the fight, not attendants');
  assert.equal(bossPackagesFor(wing).find((p) => p.enemyId === SWARM_WRAP_ESCORT_ENEMY).count, 1);
});

test('the card and the announce are untouched — id, label, line, room all ride the row', () => {
  const h = boot(90);
  startWave(h, 90);
  const intro = h.emitted.filter((e) => e.event === 'swarm:bossIntro');
  assert.equal(intro.length, 1, 'one versus card');
  assert.equal(intro[0].payload.name, 'Nest Carrier', 'the card names the hull, not the entourage');
  const plan = planFor(90).swarm;
  assert.equal(plan.bossId, 'nest_carrier');
  assert.equal(plan.bossLabel, 'Nest Carrier');
  assert.equal(plan.bossScoreId, 'capital_boss_nest_carrier');
  assert.equal(plan.bossEnemyId, 'nest_carrier');
  assert.equal(plan.bossRoom, 'nest_berth');
  assert.equal(plan.bossCycle, 0);
  // Prewarm still sees every hull the wave can field, attendants included.
  const eligible = swarmEligibleEnemyIds(90);
  assert.ok(eligible.has('nest_carrier') && eligible.has('mine_layer_jackal'),
    'the launch warm covers the attendant hulls');
});

test('escorted boss plans stay deterministic — same seed, same composition', () => {
  for (const wave of [90, 110, 130, 140, 280]) {
    const a = planFor(wave);
    const b = planFor(wave);
    assert.deepEqual(a.packages, b.packages, `wave ${wave} packages drifted`);
    assert.equal(a.swarm.bossLabel, b.swarm.bossLabel);
  }
});
