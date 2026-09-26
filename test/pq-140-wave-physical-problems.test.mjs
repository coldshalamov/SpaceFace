// PQ-140 — "the roster is a set of physical problems", wave-catalog lane.
//
// The question each wave names (PQ-175.00 data) must be TRUE of the composition that ships with
// it, the named physical answer must close as PHYSICS with the live collision law (not as an
// arithmetic promise), and no wave may demand a gun-only DPS check above the starter kit's floor.
// Every assertion here is a pure function of authored data plus the live law at
// src/combat/impulseKernel.js — no simulation, no RNG, no wall clock.
//
// Contact model (the one idealization, used identically for every pair): the solver exchanges the
// reduced-mass share of a committed closing line, J = mu * vClose with mu = mA*mB/(mA+mB). This is
// the same idealization the PQ-140.03 fodder-ammunition receipt used; post-impulse coast delivers
// at least this much on a committed line. Committed-shove reference speed is 80 wu/s — below the
// governed cruise of the roster's lights (105-118), mid-ramp on the 8..150 debris axis, and
// deliberately conservative.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import { WEAPONS } from '../src/data/weapons.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import {
  HEAVY_TERRAIN_MIN_MASS,
  SURVIVAL_TEMPLATE_QUESTIONS,
  SURVIVAL_WAVES,
  WAVE_10_FOUNDRY_QUESTION,
  WAVE_20_QUESTION_PROPS,
  catalogQuestionIssues,
  physicalProblemFromPackages,
  questionPropsIssues,
  templateQuestionOf,
} from '../src/data/survivalWaves.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  COLLISION_CONSEQUENCE_LIMITS,
  resolveCollisionConsequence,
} from '../src/combat/impulseKernel.js';
import { survivalAnnounce } from '../src/systems/survivalAnnounce.js';

const ARENA = 'helios_core';
const SEED = 14001;

const ENEMY_BY_ID = new Map(ENEMY_TYPES.map((def) => [def.id, def]));
const MASS_OF = (id) => ENEMY_BY_ID.get(id).mass;

// Starter kit floor (src/data/weapons.js / src/data/newGameDefaults.js): Pulse Laser S.
const PULSE = WEAPONS.find((w) => w.id === 'wpn_pulse_laser_s');
const PULSE_DPS = PULSE.dps; // 44 authored sustained damage
// Starter momentum budget: Concussion Cannon S is the light-hardpoint starter kicker
// (impulsePerHit 520 at rof 1.2). The pulse's own push (84 per hit at 5.5/s = 462/s) and any hull
// contact or rope add on top; the cannon alone is the conservative budget.
const CONCUSSION = WEAPONS.find((w) => w.id === 'wpn_concussion_cannon_s');
const STARTER_IMPULSE_PER_SECOND = CONCUSSION.impulsePerHit * CONCUSSION.rof; // 624

// Per-body gun time at the starter floor: shield + armor + hull pool, with armorFlat taking its
// authored per-hit bite every shot (per-second flat = armorFlat * rof). Shield regen is ignored —
// it only makes the gun slower, and the ceilings below already hold with that generosity.
function gunFloorSeconds(enemyId) {
  const def = ENEMY_BY_ID.get(enemyId);
  const pool = def.shield + def.armor + def.hull;
  const perSecond = Math.max(1, PULSE_DPS - (def.armorFlat || 0) * PULSE.rof);
  return pool / perSecond;
}

const CONTACT_STUB = (id, enemyId) => ({
  id,
  type: 'ship',
  mass: MASS_OF(enemyId),
  ...pickPools(enemyId),
});

function pickPools(enemyId) {
  const def = ENEMY_BY_ID.get(enemyId);
  return { shield: def.shield, armor: def.armor, hull: def.hull };
}

function poolOf(enemyId) {
  const def = ENEMY_BY_ID.get(enemyId);
  return def.shield + def.armor + def.hull;
}

/** The live law, aimed at a stub victim. surface 'craft' when the other body is a ship. */
function impactDamage(victimEnemyId, otherEnemyId, exchangedMomentum, opts = {}) {
  const receipt = resolveCollisionConsequence({
    target: CONTACT_STUB('victim', victimEnemyId),
    other: opts.terrain
      ? { id: 'rock', type: 'asteroid', mass: 1e9 }
      : CONTACT_STUB('other', otherEnemyId),
    exchangedMomentum,
    tick: 0,
    preSolveClosingSpeed: opts.closingSpeed,
  });
  assert.ok(receipt, 'the live law must read the contact');
  return receipt;
}

const reducedMass = (a, b) => (MASS_OF(a) * MASS_OF(b)) / (MASS_OF(a) + MASS_OF(b));

/**
 * Smallest committed closing speed at which the live law closes the pair's loop: the receiver
 * dies, or the mover dies (spending the thrown hull on the receiver). Deterministic bisection.
 */
function loopClosingSpeed(moverId, receiverId) {
  const mu = reducedMass(moverId, receiverId);
  const closes = (v) => {
    const j = mu * v;
    const onReceiver = impactDamage(receiverId, moverId, j);
    const onMover = impactDamage(moverId, receiverId, j);
    return onReceiver.impactDamage >= poolOf(receiverId)
      || onMover.impactDamage >= poolOf(moverId);
  };
  assert.ok(closes(150), `${moverId} -> ${receiverId} never closes by 150 wu/s`);
  let lo = 8;
  let hi = 150;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (closes(mid)) hi = mid; else lo = mid;
  }
  return hi;
}

// ── 1. Every wave's question is true of its composition ────────────────────────────────────────

test('PQ-140: every catalog recipe answers the question it names', () => {
  assert.deepEqual(catalogQuestionIssues(), []);
  for (const recipe of SURVIVAL_WAVES) {
    assert.deepEqual(questionPropsIssues(recipe), [], recipe.id);
  }
});

test('PQ-140: each template question names bodies the wave actually fields', () => {
  for (let wave = 1; wave <= 10; wave++) {
    const recipe = SURVIVAL_WAVES.find((r) => r.arenaId === ARENA && r.wave === wave);
    const asked = wave === 10 ? WAVE_10_FOUNDRY_QUESTION : templateQuestionOf(wave);
    assert.equal(recipe.questionId, asked.id, `template ${wave}`);
    const shipped = new Set(recipe.packages.flatMap((pkg) => (pkg.count > 0 ? [pkg.enemyId] : [])));
    for (const enemyId of shipped) {
      assert.ok(ENEMY_BY_ID.has(enemyId), `${recipe.id} ships unknown ${enemyId}`);
    }
    // The question's answer verb is one of the four starter-kit verbs (PQ-174.03 vocabulary).
    assert.ok(['well', 'rope', 'shove', 'throw'].includes(asked.answerVerb), asked.id);
  }
});

test('PQ-140: the Foundry wave-ten override is named once and ships once', () => {
  const foundry = SURVIVAL_WAVES.find((r) => r.arenaId === ARENA && r.wave === 10);
  assert.equal(foundry.questionId, WAVE_10_FOUNDRY_QUESTION.id);
  assert.equal(foundry.answerVerb, 'throw');
  for (const recipe of SURVIVAL_WAVES.filter((r) => r.wave === 10 && r.arenaId !== ARENA)) {
    assert.equal(recipe.questionId, SURVIVAL_TEMPLATE_QUESTIONS[10].id, recipe.id);
  }
  // The fortress question's props hold for the override too: escorts to throw, a heavy to lose them on.
  assert.deepEqual(
    questionPropsIssues({ ...foundry, wave: 10 }),
    [],
    'foundry override still fields the fortress props',
  );
  assert.equal(WAVE_20_QUESTION_PROPS.id, 'plate_theft');
});

// ── 2. Shove rooms close as physics ────────────────────────────────────────────────────────────

test('PQ-140: wave 2 — a shoved reaver kills a wasp on one contact, and the reaver rides on', () => {
  const mu = reducedMass('reaver_pirate', 'wasp_swarmer');
  const j = mu * 80;
  const onWasp = impactDamage('wasp_swarmer', 'reaver_pirate', j);
  assert.ok(
    onWasp.impactDamage >= poolOf('wasp_swarmer'),
    `one committed contact must kill the wasp: ${onWasp.impactDamage} vs ${poolOf('wasp_swarmer')}`,
  );
  const onReaver = impactDamage('reaver_pirate', 'wasp_swarmer', j);
  assert.ok(
    onReaver.impactDamage < poolOf('reaver_pirate'),
    'the hammer survives the swing — one shoved hull sweeps the pack',
  );
});

test('PQ-140: wave 4 — the miner-brawler pair closes: the miner dies in the exchange, the brawler goes hollow', () => {
  const mu = reducedMass('mine_layer_jackal', 'bruiser_brawler');
  const j = mu * 80;
  const onJackal = impactDamage('mine_layer_jackal', 'bruiser_brawler', j);
  assert.ok(
    onJackal.impactDamage >= poolOf('mine_layer_jackal'),
    `the shoved miner dies on the brawler: ${onJackal.impactDamage} vs ${poolOf('mine_layer_jackal')}`,
  );
  const onBrawler = impactDamage('bruiser_brawler', 'mine_layer_jackal', j);
  const brawler = ENEMY_BY_ID.get('bruiser_brawler');
  assert.ok(
    onBrawler.impactDamage >= brawler.shield + brawler.armor * 0.9,
    `the exchange strips shield and most armor: ${onBrawler.impactDamage}`,
  );
});

test('PQ-140: shove pairs arm inside the pair’s own gun time — physics is the smart answer, guns the floor', () => {
  const pairs = [
    ['wasp_swarmer', 'reaver_pirate', 'wasp_swarmer'], // wave 2: mover, receiver, question id anchor
    ['mine_layer_jackal', 'bruiser_brawler', 'mine_layer_jackal'], // wave 4
  ];
  for (const [moverId, receiverId] of pairs) {
    const v = loopClosingSpeed(moverId, receiverId);
    const armSeconds = (MASS_OF(moverId) * v) / STARTER_IMPULSE_PER_SECOND;
    const pairGunSeconds = gunFloorSeconds(moverId) + gunFloorSeconds(receiverId);
    assert.ok(
      v < 105,
      `${moverId}->${receiverId} closes at ${v.toFixed(1)} wu/s, under governed cruise`,
    );
    assert.ok(
      armSeconds <= pairGunSeconds,
      `${moverId}->${receiverId}: arming the shove (${armSeconds.toFixed(1)}s) must beat grinding the pair (${pairGunSeconds.toFixed(1)}s)`,
    );
    // The gun floor stays viable on the same pair: each body is a bounded gun kill, never a sponge.
    for (const id of [moverId, receiverId]) {
      assert.ok(gunFloorSeconds(id) <= 25, `${id} gun floor ${gunFloorSeconds(id).toFixed(1)}s`);
    }
  }
});

// ── 3. Throw rooms: the light is ammunition; terrain and heavies do the killing ────────────────

test('PQ-140: a committed throw folds any light fodder on terrain — the wreckage is the next answer', () => {
  const closingSpeed = 80;
  const j = MASS_OF('wasp_swarmer') * closingSpeed; // into static terrain, all momentum exchanges
  const receipt = impactDamage('wasp_swarmer', 'wasp_swarmer', j, { terrain: true, closingSpeed });
  assert.ok(
    receipt.impactDamage >= poolOf('wasp_swarmer'),
    `terrain crumple kills a thrown wasp: ${receipt.impactDamage} vs ${poolOf('wasp_swarmer')}`,
  );
});

test('PQ-140: wave 10 — the thrown escort dies on the fortress hull; the fortress shrugs it (B11)', () => {
  const bosses = ['dreadnought_boss', 'mirrorjaw_foreman'];
  for (const bossId of bosses) {
    assert.ok(MASS_OF(bossId) >= HEAVY_TERRAIN_MIN_MASS, `${bossId} is terrain`);
    const mu = reducedMass('wasp_swarmer', bossId);
    const j = mu * 80;
    // Victim-side: the escort meets terrain (mass >= 150 craft reads as terrain, impulseKernel:215).
    const onEscort = impactDamage('wasp_swarmer', bossId, j, { closingSpeed: 80 });
    assert.ok(
      onEscort.impactDamage >= poolOf('wasp_swarmer'),
      `${bossId}: the thrown escort is spent on the hull (${onEscort.impactDamage})`,
    );
    // Receiver-side: the fortress loses nothing a gun-scale throw can reach.
    const onBoss = impactDamage(bossId, 'wasp_swarmer', j);
    assert.ok(
      onBoss.impactDamage < 1,
      `${bossId} takes ${onBoss.impactDamage}: gun-scale impulses do nothing to a heavy`,
    );
  }
});

test('PQ-140: wave 5 — the corsair is ammunition-class, and a committed rope throw hurts it honestly', () => {
  // INF-026 re-massed the corsair to 32 on exactly this argument; the wave's named answer is a throw.
  assert.ok(MASS_OF('corsair_raider') <= 32, 'corsair must stay throwable');
  // 150 wu/s is inside the tether throw's authored meeting envelope (masslineThrow.js
  // TANGENT_MEETING_MAX_SPEED = 180) — a rope-flung wasp, not a concussion shove.
  const closingSpeed = 150;
  const mu = reducedMass('wasp_swarmer', 'corsair_raider');
  const j = mu * closingSpeed;
  const onCorsair = impactDamage('corsair_raider', 'wasp_swarmer', j);
  const corsair = ENEMY_BY_ID.get('corsair_raider');
  assert.ok(
    onCorsair.impactDamage >= corsair.shield + corsair.armor,
    `a rope-flung light strips shield and armor: ${onCorsair.impactDamage}`,
  );
});

// ── 4. Rope rooms lean on real terrain; well rooms have a real cluster ─────────────────────────

test('PQ-140: the anchor hull is moving terrain and carries the snare the rope answer moves', () => {
  const anchor = ENEMY_BY_ID.get('field_anchor_controller');
  assert.ok(anchor.mass >= HEAVY_TERRAIN_MIN_MASS);
  assert.ok(anchor.fieldAnchor && anchor.fieldAnchor.radius > 0, 'the snare is authored');
  const recipe = SURVIVAL_WAVES.find((r) => r.arenaId === ARENA && r.wave === 6);
  assert.equal(recipe.packages[0].enemyId, 'field_anchor_controller');
});

test('PQ-140: well rooms field a co-gate cluster for the well to share one hole through', () => {
  const cases = [
    { wave: 7, enemyId: 'choir_zealot', min: 3 },
    { wave: 8, enemyId: 'choir_zealot', min: 3 },
    { wave: 9, enemyId: 'pd_screen_escort', min: 2 },
  ];
  for (const { wave, enemyId, min } of cases) {
    const recipe = SURVIVAL_WAVES.find((r) => r.arenaId === ARENA && r.wave === wave);
    const biggest = recipe.packages
      .filter((pkg) => pkg.enemyId === enemyId)
      .reduce((best, pkg) => Math.max(best, pkg.count), 0);
    assert.ok(biggest >= min, `wave ${wave} fields ${enemyId} x${biggest}, need ${min}`);
  }
});

// ── 5. No wave demands a gun-only DPS check above the starter floor ────────────────────────────

test('PQ-140: every non-heavy body in the catalog is a bounded starter-pulse kill; heavies are never a DPS check', () => {
  const seen = new Set();
  for (const recipe of SURVIVAL_WAVES) {
    let waveGunSeconds = 0;
    for (const pkg of recipe.packages) {
      const def = ENEMY_BY_ID.get(pkg.enemyId);
      const seconds = gunFloorSeconds(pkg.enemyId) * pkg.count;
      if (def.mass >= HEAVY_TERRAIN_MIN_MASS) {
        // Heavy hulls are terrain (PQ-140.01): the packet forbids grading them by hit points, so
        // they are exempt from the gun floor by design, not by oversight.
        continue;
      }
      assert.ok(seconds <= 25, `${recipe.id}: ${pkg.enemyId} x${pkg.count} = ${seconds.toFixed(1)}s of starter gun`);
      waveGunSeconds += seconds;
      seen.add(pkg.enemyId);
    }
    assert.ok(waveGunSeconds <= 120, `${recipe.id}: ${waveGunSeconds.toFixed(1)}s of starter gun`);
  }
  assert.ok(seen.size >= 10, 'the roster sweep actually crossed the roster');
});

// ── 6. The combat net names the problem ─────────────────────────────────────────────────────────

function bootRun() {
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
  const run = createRunState({ kind: 'survival', seed: SEED });
  run.arenaId = ARENA;
  run.phase = 'active';
  state.run = run;
  survivalAnnounce.init({ state, bus, helpers: {} });
  return { state, emitted, reset: () => { emitted.length = 0; } };
}

function openWave(harness, wave, plan) {
  harness.state.run.wave = wave;
  harness.emitted.length = 0;
  harness.state.bus; // bus is closed over inside survivalAnnounce; events flow through init's bus
  return plan;
}

function waveStartLines(wave, plan) {
  const harness = bootRun();
  // Drive the same seam survivalRun uses: planned, then started.
  const raw = harness;
  raw.state.run.wave = wave;
  survivalAnnounce._onWavePlanned({ wave, plan });
  survivalAnnounce._onWaveStarted({ wave, tick: 1 });
  const lines = harness.emitted.filter((e) => e.event === 'voice:say');
  survivalAnnounce.destroy();
  return lines.map((l) => ({ id: l.payload.id, text: l.payload.text }));
}

test('PQ-140: the net names each Act I wave its authored question, in its own line', () => {
  for (let wave = 1; wave <= 10; wave++) {
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave });
    const lines = waveStartLines(wave, plan);
    const opener = lines.find((l) => l.id === `survival:w${wave}:open`);
    const why = lines.find((l) => l.id === `survival:w${wave}:why`);
    assert.ok(opener, `wave ${wave} opens`);
    assert.ok(why, `wave ${wave} names its problem`);
    const asked = wave === 10 ? WAVE_10_FOUNDRY_QUESTION : SURVIVAL_TEMPLATE_QUESTIONS[wave];
    assert.equal(why.text, asked.question);
    assert.ok(why.text.length < 160, `wave ${wave} question is one line (${why.text.length})`);
    assert.ok(!why.text.includes('\n'), 'one line');
  }
});

test('PQ-140: swapped and generated compositions name the problem their bodies actually pose', () => {
  const cases = [
    { wave: 24, label: 'act III re-rolls template 4' },
    { wave: 38, label: 'endless overlay' },
  ];
  for (const { wave } of cases) {
    const plan = planWave({
      seed: SEED,
      arenaId: ARENA,
      wave,
      ruleset: wave > 30 ? 'endless' : 'arc',
    });
    const lines = waveStartLines(wave, plan);
    const why = lines.find((l) => l.id === `survival:w${wave}:why`);
    assert.ok(why, `${wave} names a problem`);
    const derived = physicalProblemFromPackages(plan.packages);
    assert.equal(why.text, derived.question, `wave ${wave} reads the shipped bodies, not the template row`);
  }
});

test('PQ-140: a swarm wave names the problem its opening poses; the boss circuit stays silent', () => {
  const SWARM_RULESET = 'swarm';
  const plan = planWave({ seed: SEED, arenaId: ARENA, wave: 3, ruleset: SWARM_RULESET });
  const lines = waveStartLines(3, plan);
  const why = lines.find((l) => l.id === 'survival:w3:why');
  assert.ok(why, 'swarm wave names its problem');
  const derived = physicalProblemFromPackages(plan.packages);
  assert.equal(why.text, derived.question);

  const circuit = planWave({ seed: SEED, arenaId: ARENA, wave: 1, ruleset: 'boss_circuit' });
  const circuitLines = waveStartLines(1, circuit);
  assert.ok(!circuitLines.some((l) => l.id.endsWith(':why')), 'boss circuit: the boss names itself');
});

test('PQ-140: the question beat stays inside the per-wave line budget', () => {
  // Arc boss wave is the worst authored case: opener + question + arrival + cleared + levelUp = 5.
  const plan = planWave({ seed: SEED, arenaId: ARENA, wave: 10 });
  const harness = bootRun();
  harness.state.run.wave = 10;
  survivalAnnounce._onWavePlanned({ wave: 10, plan });
  survivalAnnounce._onWaveStarted({ wave: 10, tick: 1 });
  survivalAnnounce._onWaveMaterialized({ wave: 10, admitted: 1, enemyId: 'mirrorjaw_foreman' });
  survivalAnnounce._onLevelUp({ level: 2 });
  const lines = harness.emitted.filter((e) => e.event === 'voice:say' || e.event === 'alert');
  assert.ok(lines.length <= 5, `worst wave spends ${lines.length}/5`);
  survivalAnnounce.destroy();
});
