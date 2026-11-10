// A WRAPPED CHAMPION IS AN ESCALATION, NOT A REPRINT.
//
// The rotation has fourteen rows, so wave 145 lands on the wave-5 row again. That rematch
// used to arrive verbatim — same card, same single hull. Now a wrapped row keeps the fight
// the player learned (id, score, room, line, trick) and escalates through the mode's own
// currency: a cycle numeral the versus card already renders ("Iron Maw II") and an honor
// guard of wardens folded into the row's `packages`, so the guards are owed like the wing
// row's aces are owed — never HP inflation.
//
// Versioned for S14 (483dff172351): the champion cadence moved from 10, 20, 30... to
// 5, 15, 25... (SWARM_BOSS_FIRST + step * SWARM_BOSS_EVERY), so every rotation step and every
// wrap is retargeted at the wave that now fields it: the wrap at 145 instead of 150.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { swarmJuice } from '../src/systems/swarmJuice.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  SWARM_BOSS_EVERY,
  SWARM_BOSS_FIRST,
  SWARM_BOSS_ROTATION,
  SWARM_RULESET,
  SWARM_WRAP_ESCORT_ENEMY,
  SWARM_WRAP_ESCORT_MAX,
  bossPackagesFor,
  swarmBossFor,
  swarmCycleNumeral,
} from '../src/data/swarmMode.js';
import { SURVIVAL_COHORT_TAG } from '../src/systems/waveMaterialization.js';

const DT = 1 / 60;
const SEED = 4242;
const ARENA = 'helios_core';
/** The wave a rotation step lands on under the S14 cadence. */
const champWave = (step) => SWARM_BOSS_FIRST + step * SWARM_BOSS_EVERY;

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
  return { state, bus, emitted, spawned };
}

function tick(h, n = 1) {
  for (let i = 0; i < n; i++) {
    h.state.tick += 1;
    h.state.simTime += DT;
    survivalWave.update(DT);
    swarmJuice.update(DT, h.state);
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
function escortPackage(boss) {
  return bossPackagesFor(boss).find((pkg) => pkg.enemyId === SWARM_WRAP_ESCORT_ENEMY) || null;
}

test('the first pass is untouched — same frozen row, no cycle, no numeral', () => {
  for (const [i, wave] of [5, 15, 25, 35, 45, 55, 65, 75, 85, 95, 105, 115, 125, 135].entries()) {
    assert.equal(wave, champWave(i), `rotation step ${i} lands on wave ${wave}`);
    const boss = swarmBossFor(wave);
    assert.equal(boss, SWARM_BOSS_ROTATION[i], `wave ${wave} returns the authored row itself`);
    assert.equal(boss.cycle, undefined, `wave ${wave} carries no cycle`);
    assert.equal(boss.label, SWARM_BOSS_ROTATION[i].label, `wave ${wave} wears no numeral`);
    assert.equal(planFor(wave).swarm.bossCycle, 0, `wave ${wave} plan rides pass zero`);
  }
  assert.equal(swarmBossFor(10), null, 'a non-boss wave still fields nothing (S14: none at 10)');
});

test('the numeral ladder reads the pass — II on the second, VIII at the ceiling', () => {
  assert.equal(swarmCycleNumeral(1), 'II');
  assert.equal(swarmCycleNumeral(2), 'III');
  assert.equal(swarmCycleNumeral(3), 'IV');
  assert.equal(swarmCycleNumeral(4), 'V');
  assert.equal(swarmCycleNumeral(7), 'VIII');
  assert.equal(swarmCycleNumeral(0), 'I');
});

test('wave 145 is Iron Maw II — the same fight machinery wearing the escalation', () => {
  const boss = swarmBossFor(145);
  const base = SWARM_BOSS_ROTATION[0];
  assert.equal(boss.id, 'iron_maw');
  assert.equal(boss.cycle, 1, 'the second pass names itself');
  assert.equal(boss.label, `${base.label} II`, 'the versus card names the pass');
  // The fight is the same: score, hull, room, line and (absent) trick all carry over.
  assert.equal(boss.scoreId, base.scoreId);
  assert.equal(boss.enemyId, base.enemyId);
  assert.equal(boss.room, base.room);
  assert.equal(boss.line, base.line);
  assert.equal(boss.trickId, undefined, 'a capital row still carries no hunter trick');
  // The escalation is bodies, not numbers: the capital hull plus one warden honor guard.
  const escort = escortPackage(boss);
  assert.ok(escort, 'the wrap folds an escort into the row packages');
  assert.equal(escort.count, 1);
  assert.equal(escort.sameGate, true, 'the guard arrives on the champion\'s own gate');

  const plan = planFor(145);
  assert.equal(plan.swarm.bossCycle, 1);
  assert.equal(plan.swarm.bossLabel, `${base.label} II`, 'the announce path carries the numeral');
  const champions = plan.packages.filter((pkg) => pkg.champion === true);
  assert.equal(champions.length, 2, 'the hull and its guard are both owed champions');
  assert.deepEqual(champions.map((p) => p.enemyId), ['dreadnought_boss', SWARM_WRAP_ESCORT_ENEMY]);
  for (const pkg of champions) {
    assert.equal(pkg.atTick, 0, 'the guard lands with the champion, not after');
    assert.equal(pkg.gateGroup, champions[0].gateGroup, 'one bearing — the rematch arrives as one beat');
  }
});

test('the guard materializes as owed champion bodies and the card wears the numeral', () => {
  const h = boot(145);
  startWave(h, 145);
  const bodies = cohort(h);
  const maw = bodies.find((e) => e.data.missionTag === 'capital_boss');
  assert.ok(maw, 'the Iron Maw hull landed under its score stamp');
  assert.equal(maw.data.swarmChampion, true);
  const guard = bodies.filter((e) => e.data.lootTableId === SWARM_WRAP_ESCORT_ENEMY);
  assert.equal(guard.length, 1, 'one warden rides shotgun on the second pass');
  for (const e of guard) {
    assert.equal(e.data.swarmChampion, true, 'the guard is owed exactly like the hull');
    assert.equal(e.data.runWave, 145);
    assert.equal(e.data.missionTag, undefined, 'the guard is a champion body, not the score\'s hull');
  }
  // The player-facing intro names the pass — swarmJuice reads the same row the planner did.
  const intro = h.emitted.filter((e) => e.event === 'swarm:bossIntro');
  assert.equal(intro.length, 1, 'one versus card');
  assert.ok(intro[0].payload.name.endsWith(' II'), `the card reads ${intro[0].payload.name}`);
});

test('deeper wraps escalate monotonically — more pass, more guard, never hull', () => {
  let lastGuard = 0;
  for (const [wave, cycle, numeral] of [[145, 1, 'II'], [285, 2, 'III'], [425, 3, 'IV'], [565, 4, 'V'], [705, 5, 'VI']]) {
    assert.equal(wave, champWave(cycle * SWARM_BOSS_ROTATION.length), `pass ${cycle} re-lands the Iron Maw on wave ${wave}`);
    const boss = swarmBossFor(wave);
    assert.equal(boss.id, 'iron_maw', `wave ${wave} keeps landing on the same base row`);
    assert.equal(boss.cycle, cycle, `wave ${wave}`);
    assert.ok(boss.label.endsWith(` ${numeral}`), `wave ${wave} label ${boss.label}`);
    const guard = escortPackage(boss);
    assert.ok(guard, `wave ${wave} fields its guard`);
    assert.ok(guard.count > lastGuard || guard.count === SWARM_WRAP_ESCORT_MAX,
      `wave ${wave} guard ${guard.count} never shrinks below pass ${cycle - 1}`);
    lastGuard = guard.count;
  }
  assert.equal(escortPackage(swarmBossFor(285)).count, 2, 'cycle two doubles the guard');
  assert.equal(escortPackage(swarmBossFor(705)).count, SWARM_WRAP_ESCORT_MAX,
    'the guard caps at a screen, never a second wing');
  // And the boss hull itself is untouched — escalation lives in bodies, not hull numbers.
  const lead = bossPackagesFor(swarmBossFor(705))[0];
  assert.equal(lead.enemyId, 'dreadnought_boss');
  assert.equal(lead.count, 1, 'still one capital hull — the same fight, deeper');
});

test('a wrapped compositional row keeps its trick and gains the same guard', () => {
  const boss = swarmBossFor(175);
  const base = SWARM_BOSS_ROTATION.find((b) => b.id === 'corsair_wing');
  assert.equal(boss.id, 'corsair_wing');
  assert.equal(boss.cycle, 1);
  assert.equal(boss.label, `${base.label} II`);
  assert.equal(boss.trickId, 'phase-jammer', 'the wing\'s trick rides the wrap');
  const packages = bossPackagesFor(boss);
  assert.equal(packages.filter((p) => p.enemyId === 'corsair_raider').reduce((s, p) => s + p.count, 0), 3,
    'the three aces are still the wing');
  assert.equal(escortPackage(boss).count, 1, 'plus the honor guard');
});

test('wrapped plans stay deterministic — same seed, same escalation', () => {
  for (const wave of [145, 175, 285]) {
    const a = planFor(wave);
    const b = planFor(wave);
    assert.deepEqual(a.packages, b.packages, `wave ${wave} packages drifted`);
    assert.equal(a.swarm.bossLabel, b.swarm.bossLabel);
  }
});
