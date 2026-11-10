// LW-04 — the second three-round act (waves 32–34, 'breaker_yard') + authored shooterCap.
//
// The ticket's acceptance asks, pinned against the real plan output and the real wave owner:
//   1. Each round asks a different tactical question — a guard link, a mine lane, then the
//      composition under a finite simultaneous-fire budget — not a different enemy count.
//   2. The authored recipe stays inside the wave's own contract: roster unlocks, the shared
//      spawn budget, a surviving opening lane, the cohort rule, the draft interval.
//   3. `shooterCap` rides the plan's swarm block into _shapeSwarmFire: wave 34 opens at most
//      three cohort guns at once while wave 33 uses the wave table's number — and absent the
//      field every other wave is byte-identical to legacy.
//   4. Staged act bodies ride the owed-body law: refused seats re-queue, pending blocks the
//      clear, and the specialists actually materialize under the act.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { waveOpeningLine } from '../src/systems/survivalAnnounce.js';
import { SPAWN_BUDGET_DEFAULT_MAX } from '../src/data/survivalActs.js';
import {
  SWARM_ACT_BREAKER_YARD_ID,
  SWARM_ACT_ROUNDS,
  SWARM_ACT_STAGED_TICKS,
  SWARM_RULESET,
  swarmActFor,
  swarmActIssues,
  swarmOpeningCount,
  resetSwarmPressureState,
  bindSwarmPressureContext,
} from '../src/data/swarmMode.js';

const SEED = 4242;
const ARENA = 'helios_core';
const DT = 1 / 60;

function swarmPlan(wave, opts = {}) {
  return planWave({ seed: SEED, arenaId: ARENA, wave, mode: SWARM_RULESET, ...opts });
}

function stagedPackages(plan) {
  return plan.packages.filter((pkg) => pkg.staged === true);
}

function openingPackages(plan) {
  return plan.packages.filter((pkg) => pkg.staged !== true);
}

test('the three adjacent swarm slots carry the breaker_yard act; neighbours do not', () => {
  const questions = [];
  for (const [wave, round, phase] of [[32, 1, 'furnace_active'], [33, 2, 'shutter_slow'], [34, 3, 'shutter_lane_close']]) {
    const plan = swarmPlan(wave);
    assert.ok(!plan.error, `wave ${wave} plans clean: ${JSON.stringify(plan.issues)}`);
    assert.equal(plan.swarm.act.id, SWARM_ACT_BREAKER_YARD_ID);
    assert.equal(plan.swarm.act.id, 'breaker_yard');
    assert.equal(plan.swarm.act.round, round);
    assert.equal(plan.swarm.act.rounds, SWARM_ACT_ROUNDS);
    assert.equal(plan.arenaPhase, phase, `wave ${wave} carries the act's authored room`);
    assert.equal(typeof plan.swarm.act.question, 'string');
    assert.ok(plan.swarm.act.question.length > 20, `wave ${wave} names its question`);
    questions.push(plan.swarm.act.question);
  }
  assert.equal(new Set(questions).size, 3, 'each round asks a different question');
  // 31 is a character (Kraken) wave, 35 an ordinary generated wave — neither is an act.
  for (const wave of [31, 35, 36]) {
    const plan = swarmPlan(wave);
    assert.ok(!plan.error);
    assert.equal(plan.swarm.act, undefined, `wave ${wave} stays its own wave`);
  }
});

test('swarmActIssues passes the shipped table for all three rounds', () => {
  for (const wave of [32, 33, 34]) {
    assert.deepEqual(swarmActIssues(wave), [], `wave ${wave} act is honest`);
    const act = swarmActFor(wave);
    assert.equal(act.id, SWARM_ACT_BREAKER_YARD_ID);
  }
});

test('round 1 (wave 32): the guard link — warden arrives with its ward as one event', () => {
  const plan = swarmPlan(32);
  const opening = openingPackages(plan);
  const openingIds = opening.map((pkg) => pkg.enemyId);
  assert.deepEqual(openingIds, ['wasp_swarmer', 'reaver_pirate', 'choir_zealot']);
  assert.deepEqual(opening.map((pkg) => pkg.count), [6, 5, 4]);
  const staged = stagedPackages(plan);
  assert.equal(staged.length, 2);
  const warden = staged.find((pkg) => pkg.enemyId === 'warden_escort');
  const ward = staged.find((pkg) => pkg.enemyId === 'corsair_raider');
  assert.ok(warden, 'the guard arrives staged, like a debut');
  assert.ok(ward, 'the ward arrives with it — the link has a target');
  assert.equal(warden.count, 1);
  assert.equal(ward.count, 1);
  assert.equal(warden.gateGroup, ward.gateGroup, 'guard and ward land on one bearing');
  assert.equal(warden.atTick, ward.atTick);
  assert.ok(warden.atTick > Math.max(...opening.map((pkg) => pkg.atTick)),
    'the link lands after the ammunition is already on the board');
  assert.ok(!opening.some((pkg) => pkg.gateGroup === warden.gateGroup),
    'the pair takes a bearing the opening burst does not crowd');
});

test('round 2 (wave 33): the mine lane — jackal sows it, brawler guards the bearing', () => {
  const plan = swarmPlan(33);
  const opening = openingPackages(plan);
  assert.deepEqual(opening.map((pkg) => pkg.enemyId), ['wasp_swarmer', 'detonator_dart', 'reaver_pirate']);
  assert.deepEqual(opening.map((pkg) => pkg.count), [5, 5, 5]);
  const staged = stagedPackages(plan);
  assert.equal(staged.length, 2);
  const jackal = staged.find((pkg) => pkg.enemyId === 'mine_layer_jackal');
  const bruiser = staged.find((pkg) => pkg.enemyId === 'bruiser_brawler');
  assert.ok(jackal, 'the sower arrives staged');
  assert.ok(bruiser, 'the lane guard rides the same bearing');
  assert.equal(jackal.gateGroup, bruiser.gateGroup);
  assert.equal(jackal.atTick, bruiser.atTick);
  assert.ok(!opening.some((pkg) => pkg.gateGroup === jackal.gateGroup));
});

test('round 3 (wave 34): two linked pairs on two bearings', () => {
  const plan = swarmPlan(34);
  const opening = openingPackages(plan);
  assert.deepEqual(opening.map((pkg) => pkg.enemyId), ['wasp_swarmer', 'choir_zealot']);
  assert.deepEqual(opening.map((pkg) => pkg.count), [5, 4]);
  const staged = stagedPackages(plan);
  assert.equal(staged.length, 4, 'four specialists, two links');
  const pairA = staged.filter((pkg) => ['warden_escort', 'field_anchor_controller'].includes(pkg.enemyId));
  const pairB = staged.filter((pkg) => ['mine_layer_jackal', 'tether_control_raider'].includes(pkg.enemyId));
  assert.equal(pairA.length, 2);
  assert.equal(pairB.length, 2);
  assert.equal(pairA[0].gateGroup, pairA[1].gateGroup, 'warden + anchor arrive as one event');
  assert.equal(pairA[0].atTick, pairA[1].atTick);
  assert.equal(pairB[0].gateGroup, pairB[1].gateGroup, 'jackal + tether arrive as one event');
  assert.equal(pairB[0].atTick, pairB[1].atTick);
  assert.notEqual(pairA[0].gateGroup, pairB[0].gateGroup, 'the two pairs land on different bearings');
  assert.ok(pairB[0].atTick > pairA[0].atTick, 'the lane crew lands a breath after the guard link');
  const openingGates = new Set(opening.map((pkg) => pkg.gateGroup));
  assert.ok(!openingGates.has(pairA[0].gateGroup) && !openingGates.has(pairB[0].gateGroup),
    'both pairs take bearings the burst does not crowd');
});

test('the act stays inside the wave contracts — budget, quota, cohort rule, draft', () => {
  for (const wave of [32, 33, 34]) {
    const plan = swarmPlan(wave);
    assert.ok(swarmOpeningCount(plan.packages) <= SPAWN_BUDGET_DEFAULT_MAX,
      `wave ${wave} burst inside the shared spawn budget`);
    assert.equal(plan.completionRules.kind, 'cohort');
    assert.equal(plan.completionRules.requiredPackagesMaterialized, true,
      'the wave owes every scheduled body — a key kill early is a kill, not a skip');
    assert.equal(plan.swarm.concurrent, 30, 'act rewrote the recipe, not the room size');
    assert.equal(plan.draftExpectation.kind, 'draft');
    // NXI-065 — a useful opening lane survives: distinct bearings, never every gate.
    const used = new Set(plan.packages.map((pkg) => pkg.gateGroup));
    assert.ok(used.size >= 2, `wave ${wave} does not stack its opening on one bearing`);
    assert.ok(used.size < 8, `wave ${wave} leaves at least one gate free`);
    // Every staged body is owed through the schedule, never inside the burst.
    for (const entry of plan.schedule.filter((row) => row.staged === true)) {
      assert.ok(entry.atTick >= SWARM_ACT_STAGED_TICKS,
        `wave ${wave} staged bodies arrive on the readable beat, not inside the burst`);
    }
  }
});

test('plans are deterministic — same seed, same package list, any seed', () => {
  for (const wave of [32, 33, 34]) {
    const a = swarmPlan(wave);
    const b = swarmPlan(wave);
    assert.equal(JSON.stringify(a.packages), JSON.stringify(b.packages),
      `wave ${wave} same seed -> identical packages`);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), a, `wave ${wave} plan is pure JSON`);
    // The act authors the recipe outright: a different run seed plans the same act packages.
    const other = swarmPlan(wave, { seed: SEED + 1 });
    assert.equal(JSON.stringify(other.packages), JSON.stringify(a.packages),
      `wave ${wave} act packages are authored, not rolled`);
  }
});

test('shooterCap rides the plan: wave 34 caps at 3, the other rounds carry none', () => {
  assert.equal(swarmPlan(34).swarm.shooterCap, 3);
  assert.equal(swarmPlan(32).swarm.shooterCap, undefined, 'r1 uses the wave table cap');
  assert.equal(swarmPlan(33).swarm.shooterCap, undefined, 'r2 uses the wave table cap');
  for (const wave of [25, 30, 31, 35]) {
    assert.equal(swarmPlan(wave).swarm.shooterCap, undefined,
      `wave ${wave} untouched — absent means legacy`);
  }
});

test('a dishonest act spec is rejected before it plans (validator negative control)', () => {
  // An enemy the wave has not unlocked cannot be authored in: field_anchor_controller
  // unlocks at wave 22, so a wave-16 act fielding it must produce an issue.
  const earlyDebut = {
    id: SWARM_ACT_BREAKER_YARD_ID, round: 1,
    packages: [{ enemyId: 'field_anchor_controller', count: 1, gateIndex: 0, atTick: 0 }],
  };
  const earlyIssues = swarmActIssues(16, earlyDebut);
  assert.ok(earlyIssues.some((issue) => /before its wave/.test(issue.message)),
    `expected an unlock-timing issue, got ${JSON.stringify(earlyIssues)}`);

  const unknown = {
    id: SWARM_ACT_BREAKER_YARD_ID, round: 1,
    packages: [{ enemyId: 'not_a_hull', count: 1, gateIndex: 0, atTick: 0 }],
  };
  assert.ok(swarmActIssues(32, unknown).some((issue) => /unknown enemy/.test(issue.message)));

  const overBudget = {
    id: SWARM_ACT_BREAKER_YARD_ID, round: 1,
    packages: [{ enemyId: 'wasp_swarmer', count: SPAWN_BUDGET_DEFAULT_MAX + 1, gateIndex: 0, atTick: 0 }],
  };
  assert.ok(swarmActIssues(32, overBudget).some((issue) => /exceeds budget/.test(issue.message)));
});

test('the opening line names the round question inside the wave banner', () => {
  const plan = swarmPlan(32);
  const line = waveOpeningLine(32, plan);
  assert.ok(line.includes(plan.swarm.act.question), `banner carries the question: ${line}`);
  const plain = swarmPlan(35);
  assert.ok(!waveOpeningLine(35, plain).includes(plan.swarm.act.question),
    'ordinary waves carry no act line');
});

test('heavies_only still owns the room outright — the act is suppressed', () => {
  const plan = swarmPlan(34, { mutators: ['heavies_only'] });
  assert.ok(!plan.error);
  assert.equal(plan.swarm.act, undefined, 'an authored composition cannot survive a room the mutator owns');
  assert.equal(plan.swarm.shooterCap, undefined, 'a suppressed act cannot stamp its fire cap');
});

// ── live wave-owner check ────────────────────────────────────────────────────
// A light harness on the production route: run:wavePlanned → survivalWave owns the
// schedule, materializes bodies through the shared spawn budget, and _shapeSwarmFire
// clears the nearest N cohort hulls to fire. No tactical AI runs here — the check pins
// the FIRE BUDGET seam this ticket changes, not doctrine cycles (unchanged engine work).

function waveHarness(wave) {
  resetSwarmPressureState();
  bindSwarmPressureContext(null);
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const spawned = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  state.run = createRunState({ kind: 'survival', ruleset: SWARM_RULESET, seed: SEED });
  Object.assign(state.run, { arenaId: ARENA, phase: 'active', wave });
  const player = {
    id: state.nextEntityId++, alive: true, type: 'ship', team: 0,
    pos: { x: 0, z: 0 }, rot: 0, radius: 14, hull: 200, hullMax: 200, data: {},
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const budget = makeBudgetApi(state);
  budget.setMax(38); // the arena's own run-time ceiling, SWARM_SPAWN_CAP
  const helpers = {
    spawnBudget: budget,
    routeCombatDamage() {},
    spawnEntity(spec) {
      const e = { ...spec, id: state.nextEntityId++, alive: true, pos: { ...spec.pos } };
      state.entities.set(e.id, e);
      state.entityList.push(e);
      spawned.push(e);
      return e;
    },
  };
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));
  const waveSystem = Object.create(survivalWave);
  waveSystem.init({ state, bus, helpers });
  noteSwarmPilotAction(state); // the pilot has acted — fire shaping is live, not quiet
  const plan = swarmPlan(wave);
  assert.ok(!plan.error);
  bus.emit('run:wavePlanned', { wave, plan });
  bus.emit('run:waveStarted', { wave });
  const h = {
    state, bus, emitted, spawned, waveSystem, plan,
    tick(count = 1) {
      for (let i = 0; i < count; i++) {
        state.tick += 1;
        state.simTime += DT;
        waveSystem.update(DT);
      }
    },
    shooters() {
      return [...waveSystem._cohort.values()]
        .filter((m) => m.entity && m.entity.alive !== false && m.entity.data?.ai?.swarmFireHeld === false);
    },
    liveCohort() {
      return [...waveSystem._cohort.values()].filter((m) => m.entity && m.entity.alive !== false);
    },
    close() { waveSystem.destroy(); },
  };
  return h;
}

test('sim: the act materializes its specialists and honors the authored fire cap', () => {
  const h34 = waveHarness(34);
  try {
    h34.tick(900); // opening burst + both staged pairs land, then the 2.5 s arm grace
    const ids = new Set(h34.spawned.map((e) => e.data && e.data.lootTableId));
    for (const enemyId of ['warden_escort', 'field_anchor_controller', 'mine_layer_jackal', 'tether_control_raider']) {
      assert.ok(ids.has(enemyId), `wave 34 actually fields its staged ${enemyId}`);
    }
    assert.ok(h34.liveCohort().length > 3, 'the room holds more hulls than the cap');
    const released = h34.shooters().length;
    assert.equal(released, 3, `wave 34 holds fire to the authored cap (got ${released})`);
    // Deterministic across a replay: the same plan, the same living room, the same cap.
    assert.equal(h34.plan.swarm.shooterCap, 3);
  } finally { h34.close(); }

  const h33 = waveHarness(33);
  try {
    h33.tick(900);
    const ids = new Set(h33.spawned.map((e) => e.data && e.data.lootTableId));
    for (const enemyId of ['mine_layer_jackal', 'bruiser_brawler']) {
      assert.ok(ids.has(enemyId), `wave 33 actually fields its staged ${enemyId}`);
    }
    assert.ok(h33.liveCohort().length > 8, 'the uncapped room is full enough to read the difference');
    const released = h33.shooters().length;
    assert.ok(released > 3, `wave 33 without the field uses the wave table (got ${released})`);
    assert.ok(released <= 8, `wave 33 never exceeds the wave table cap (got ${released})`);
  } finally { h33.close(); }
});
