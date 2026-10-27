// THIRD-BAND — the wave-56+ plateau's second leg. The deep band's clock stops at 55 and
// nothing new answers until the wrapped champions at 140. Three more families keep the
// band's own law — flag recipes the engine already runs, folded out of the mite share on
// the same 6-8 wave cadence — each a problem the roster does not already pose:
//   * mirebulb (w61): hazard+slowRadius + primeRange/primeS + burst — the brake IS the bomb.
//   * clutchstone (w67): massOnly + splits — an egg only mass can hatch.
//   * poxsac (w75): blastOnly + births — a mother only a blast can stop.
// The engine's only new work: the split and mother hold-backs fund by FLAG, not by id,
// so these families reuse the same budget law instead of growing new machinery.
import test from 'node:test';
import assert from 'node:assert/strict';

import { mulberry32 } from '../src/core/rng.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createBroodEngine, broodStreamSeed } from '../src/systems/swarmBrood.js';
import { swarmJuice } from '../src/systems/swarmJuice.js';
import {
  SWARM_BROOD_FAMILIES,
  SWARM_BROOD_MAX,
  SWARM_BROOD_MIN,
  swarmBroodIssues,
  swarmBroodNewcomerFor,
  swarmBroodPlan,
  swarmBroodPopulation,
} from '../src/data/swarmBrood.js';
import {
  SWARM_BROOD_LATE_FAMILIES,
  foldBroodLatePlan,
  swarmBroodLateFamily,
  swarmBroodLateIssues,
  swarmBroodLateReserve,
} from '../src/data/swarmBroodLate.js';
import {
  isSwarmBossWave,
  swarmNewcomerFor,
} from '../src/data/swarmMode.js';

const SEED = 4242;
const DT = 1 / 60;

const BAND3 = [
  { id: 'mirebulb', fromWave: 61, cohort: 4 },
  { id: 'clutchstone', fromWave: 67, cohort: 3 },
  { id: 'poxsac', fromWave: 75, cohort: 1 },
];
const BAND3_IDS = new Set(BAND3.map((b) => b.id));
// Every late gate before this band — pinned so the first two bands can never quietly drift.
const EARLIER_LATE = [
  { id: 'burrower', fromWave: 19 },
  { id: 'splitter', fromWave: 21 },
  { id: 'brood_mother', fromWave: 23 },
  { id: 'remora', fromWave: 31 },
  { id: 'gloomcap', fromWave: 37 },
  { id: 'ashwisp', fromWave: 43 },
  { id: 'keelback', fromWave: 49 },
  { id: 'undertow', fromWave: 55 },
];

function broodFold(wave, seed = 4242) {
  return foldBroodLatePlan(swarmBroodPlan(wave, mulberry32(seed + wave)), wave);
}

function boot(wave) {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const player = {
    id: state.nextEntityId++, alive: true, type: 'ship',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6, mass: 400, hull: 200, hullMax: 200,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true, shipLike: [player], asteroids: [] };
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED });
  state.run.phase = 'active';
  state.run.wave = wave;
  state.mode = 'flight';
  state.player = state.player || { tether: null };
  const engine = createBroodEngine({
    bus,
    getState: () => state,
    fieldList: () => [],
    routeDamage: () => ({ ok: true }),
  });
  return { state, bus, emitted, player, engine };
}

function step(h, ticks) {
  for (let i = 0; i < ticks; i++) {
    h.state.simTime += DT;
    h.state.tick = (h.state.tick || 0) + 1;
    h.engine.step(h.state);
  }
}

function slotOf(engine, familyId) {
  const idx = engine._bodies.liveFamilyId.indexOf(familyId);
  if (idx < 0) return -1;
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    if (engine._bodies.alive[i] && engine._bodies.family[i] === idx) return i;
  }
  return -1;
}

function countFamily(engine, familyId) {
  const idx = engine._bodies.liveFamilyId.indexOf(familyId);
  if (idx < 0) return 0;
  let n = 0;
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    if (engine._bodies.alive[i] && engine._bodies.family[i] === idx) n += 1;
  }
  return n;
}

function telegraphs(h, familyId) {
  return h.emitted.filter((e) => e.event === 'swarm:broodTelegraph'
    && e.payload.familyId === familyId);
}

/** Every body the wave is still owed: live + deferred + every held reserve lane. */
function budget(engine) {
  return engine.census().alive
    + engine.view.pendingCount
    + engine._hive().sacBudget
    + engine._splitter().reserve
    + engine._mother().reserve
    + engine._reserve().left;
}

/**
 * Move the subject far away, then kill every other live cell — isolation without chains.
 * Two kill causes cover the kill-gates: 'explosive' answers blastOnly cells (and ordinary
 * ones), 'terrain' answers the massOnly shells the blast pings off.
 */
function isolate(h, keep) {
  h.engine._bodies.px[keep] = 5000;
  h.engine._bodies.pz[keep] = 0;
  for (let k = 0; k < SWARM_BROOD_MAX; k++) {
    if (!h.engine._bodies.alive[k] || k === keep) continue;
    h.engine._killDirectForTest(k, 'explosive');
    if (h.engine._bodies.alive[k]) h.engine._killDirectForTest(k, 'terrain');
  }
}

// --- the tables stay honest and the clock keeps its cadence ------------------------------

test('the tables stay honest: base, late and the ten-clock all clean', () => {
  assert.deepEqual(swarmBroodIssues(), []);
  assert.deepEqual(swarmBroodLateIssues(), []);
  for (const band of BAND3) {
    const fam = swarmBroodLateFamily(band.id);
    assert.ok(fam, `${band.id} is not in the late table`);
    assert.equal(fam.fromWave, band.fromWave, `${band.id} gate moved`);
    assert.ok(!isSwarmBossWave(band.fromWave),
      `${band.id} gates at wave ${band.fromWave}, a champion row`);
    assert.equal(swarmNewcomerFor(band.fromWave), null,
      `wave ${band.fromWave} shares its slam with a ship debut — the brood card must show`);
  }
  // The band's own cadence: at least 6 and at most 8 waves between consecutive gates,
  // measured from the deep band's last gate (undertow, 55).
  const gates = [55, ...BAND3.map((b) => b.fromWave)];
  for (let i = 1; i < gates.length; i++) {
    const gap = gates[i] - gates[i - 1];
    assert.ok(gap >= 6 && gap <= 8, `gate spacing ${gates[i - 1]}->${gates[i]} is ${gap}, outside 6-8`);
  }
});

// --- (a) each family debuts at its fromWave, with the folded-roster card ------------------

test('each third-band family resolves its debut through the folded roster', () => {
  for (const band of BAND3) {
    const newcomer = swarmBroodNewcomerFor(band.fromWave);
    assert.ok(newcomer, `wave ${band.fromWave} resolves no brood newcomer`);
    assert.equal(newcomer.id, band.id,
      `wave ${band.fromWave} names ${newcomer && newcomer.id}, not ${band.id}`);
    const before = swarmBroodNewcomerFor(band.fromWave - 1);
    assert.ok(before == null || before.id !== band.id, `${band.id} arrives before its gate`);
  }
});

test('each debut wave deals the brood slam card with the authored counter', () => {
  for (const band of BAND3) {
    const state = createGameState(SEED);
    const raw = createBus();
    const emitted = [];
    const bus = {
      on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw),
      emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
    };
    state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED });
    state.run.phase = 'active';
    state.run.wave = band.fromWave;
    state.simTime = 0;
    swarmJuice.init({ state, bus, helpers: {} });
    bus.emit('run:wavePlanned', { wave: band.fromWave, plan: {} });
    swarmJuice.destroy();
    const slams = emitted.filter((e) => e.event === 'swarm:roundSlam');
    assert.equal(slams.length, 1, `wave ${band.fromWave} dealt no slam`);
    const card = slams[0].payload.newcomer;
    const fam = swarmBroodLateFamily(band.id);
    assert.ok(card, `wave ${band.fromWave} debut card missing — ship lane should be quiet`);
    assert.equal(card.enemyId, band.id);
    assert.equal(card.name, fam.name);
    assert.equal(card.counter, fam.counter, `${band.id} counter line did not ride the card verbatim`);
    assert.equal(card.brood, true, 'the brood lane marks its own card');
  }
});

// --- fold law: present at the gate, absent before it, earlier bands unchanged -------------

test('each third-band family folds into the cohort at its authored wave — and stays', () => {
  for (const band of BAND3) {
    assert.ok(!broodFold(band.fromWave - 1).some((p) => p.id === band.id),
      `${band.id} fields before wave ${band.fromWave}`);
    for (const w of [band.fromWave, band.fromWave + 2]) {
      const row = broodFold(w).find((p) => p.id === band.id);
      assert.ok(row, `wave ${w} plans no ${band.id}`);
      assert.ok(row.count >= 1 && row.count <= band.cohort,
        `wave ${w} ${band.id} count ${row.count} outside its cohort`);
    }
  }
});

test('no third-band id reaches any wave below the band — earlier bands unchanged', () => {
  for (let w = 1; w <= 60; w++) {
    for (const part of broodFold(w)) {
      assert.ok(!BAND3_IDS.has(part.id), `wave ${w} folds ${part.id} before the band`);
    }
  }
  // Waves between the new gates only carry families already unlocked: a wave-66 room has
  // mirebulb but no clutchstone, and the wave-55 plateau crest is untouched.
  assert.ok(broodFold(66).some((p) => p.id === 'mirebulb'));
  assert.ok(!broodFold(66).some((p) => p.id === 'clutchstone'));
  assert.ok(!broodFold(74).some((p) => p.id === 'poxsac'));
  for (const gate of EARLIER_LATE) {
    assert.ok(broodFold(gate.fromWave).some((p) => p.id === gate.id),
      `wave ${gate.fromWave} no longer folds ${gate.id}`);
  }
});

// --- (b) every authored flag is honored by the runtime — no dead spec ----------------------

test('mirebulb: the hazard brake bites a moving hull, then the prime fuse detonates it', () => {
  const h = boot(61);
  h.engine.prepareWave(h.state.run, 61);
  h.engine.spawnWave(h.state);
  const i = slotOf(h.engine, 'mirebulb');
  assert.ok(i >= 0, 'wave 61 fields the mirebulb');
  const fam = swarmBroodLateFamily('mirebulb');
  isolate(h, i);

  // Inside slowRadius, outside primeRange: a moving signature is decelerated — the grip
  // is real drag, and it speaks the family line once per hold.
  h.player.vel.x = 40;
  h.player.vel.z = 0;
  for (let t = 0; t < 20; t++) {
    h.engine._bodies.px[i] = 70; // 70 < slowRadius 80, > primeRange 56
    h.engine._bodies.pz[i] = 0;
    h.state.simTime += DT;
    h.state.tick = (h.state.tick || 0) + 1;
    h.engine.step(h.state);
  }
  const speedAfter = Math.hypot(h.player.vel.x, h.player.vel.z);
  assert.ok(speedAfter < 40, `the pitch did not brake the hull (${speedAfter})`);
  assert.ok(telegraphs(h, 'mirebulb').length >= 1, 'the grip never spoke');
  assert.equal(telegraphs(h, 'mirebulb')[0].payload.line, fam.telegraph.line,
    'the grip does not carry the authored line');

  // Inside primeRange the fuse arms — a real windup beat — and the body pops 'explosive',
  // shoving the pack through its authored burst.
  const grips = telegraphs(h, 'mirebulb').length;
  for (let t = 0; t < 3; t++) {
    h.engine._bodies.px[i] = 40;
    h.engine._bodies.pz[i] = 0;
    h.state.simTime += DT;
    h.state.tick = (h.state.tick || 0) + 1;
    h.engine.step(h.state);
  }
  assert.ok(telegraphs(h, 'mirebulb').length > grips, 'the armed fuse never spoke');
  step(h, Math.ceil(fam.primeS / DT) + 30);
  assert.equal(h.engine._bodies.alive[i], 0, 'the fuse never detonated the mirebulb');
  const bursts = h.emitted.filter((e) => e.event === 'swarm:broodBurst'
    && e.payload.familyId === 'mirebulb');
  assert.ok(bursts.length >= 1, 'the authored death burst never fired');
  assert.equal(bursts[0].payload.radius, fam.burstRadius);
  const pops = h.emitted.filter((e) => e.event === 'swarm:broodKills'
    && e.payload.cause === 'explosive');
  assert.ok(pops.length >= 1, 'the fuse kill does not read explosive');
});

test('clutchstone: massOnly armor — a collision is the only hatch, paying three held mites', () => {
  const h = boot(67);
  h.engine.prepareWave(h.state.run, 67);
  assert.equal(budget(h.engine), swarmBroodPopulation(67),
    'the wave opens off its authored population');
  h.engine.spawnWave(h.state);
  assert.equal(budget(h.engine), swarmBroodPopulation(67),
    'spawn + held lanes moved off the authored population');
  const i = slotOf(h.engine, 'clutchstone');
  assert.ok(i >= 0, 'wave 67 fields the clutchstone');
  const fam = swarmBroodLateFamily('clutchstone');

  // The splits hold-back funds by flag: every splits family in the plan (splitter AND
  // clutchstone) paid two held mites each out of the same mite share.
  const splitsAlive = countFamily(h.engine, 'splitter') + countFamily(h.engine, 'clutchstone');
  assert.ok(splitsAlive > 1, 'wave 67 fields both splits families');
  assert.equal(h.engine._splitter().reserve, splitsAlive * 2,
    'the splits reserve does not cover every splits family by flag');

  isolate(h, i);
  // Guns and blasts ping off the egg — massOnly admits only collision or terrain.
  h.engine._killDirectForTest(i, 'direct');
  assert.equal(h.engine._bodies.alive[i], 1, 'a gun cracked the egg');
  h.engine._killDirectForTest(i, 'explosive');
  assert.equal(h.engine._bodies.alive[i], 1, 'a blast cracked the egg');
  const mitesBefore = countFamily(h.engine, 'mite');
  const heldBefore = h.engine._splitter().reserve;
  const owedBefore = budget(h.engine);
  h.engine._killDirectForTest(i, 'collision');
  assert.equal(h.engine._bodies.alive[i], 0, 'mass did not hatch the egg');
  assert.equal(countFamily(h.engine, 'clutchstone'), 0);
  assert.equal(countFamily(h.engine, 'mite'), mitesBefore + 3,
    'the hatch did not pay its three mites');
  assert.equal(h.engine._splitter().reserve, heldBefore - 2,
    'the hatch did not draw the held share');
  assert.equal(budget(h.engine), owedBefore,
    'the hatch grew the wave — the egg and its children spend the same budget');
  const tells = telegraphs(h, 'clutchstone');
  assert.ok(tells.length >= 1, 'the hatch never spoke');
  assert.equal(tells[0].payload.line, fam.telegraph.line);
});

test('poxsac: births funded by flag — only an explosive cause stops her tide', () => {
  const h = boot(75);
  h.engine.prepareWave(h.state.run, 75);
  h.engine.spawnWave(h.state);
  const i = slotOf(h.engine, 'poxsac');
  assert.ok(i >= 0, 'wave 75 fields the pox sac');
  const fam = swarmBroodLateFamily('poxsac');

  // The mother hold-back funds by flag: brood_mother (12) and poxsac (10) both spend out
  // of the mite share — never above the authored total.
  const mothersAlive = countFamily(h.engine, 'brood_mother') + countFamily(h.engine, 'poxsac');
  assert.ok(mothersAlive >= 2, 'wave 75 fields both mothers');
  assert.ok(h.engine._mother().reserve >= fam.birthBudget,
    'her tide was never held back from the mite share');
  // Her own share honors her authored tide: she never walks with more than birthBudget.
  assert.ok(h.engine._bodies.birthLeft[i] <= fam.birthBudget,
    'she walks with more than her authored tide');

  isolate(h, i);
  // Guns, rams and walls all ping off — blastOnly admits only 'explosive'.
  for (const cause of ['direct', 'collision', 'terrain']) {
    h.engine._killDirectForTest(i, cause);
    assert.equal(h.engine._bodies.alive[i], 1, `${cause} popped the sac — blastOnly broken`);
  }
  h.engine._killDirectForTest(i, 'explosive');
  assert.equal(h.engine._bodies.alive[i], 0, 'a blast did not pop the sac');
});

test('poxsac births mites on her own cadence, speaking her authored line once', () => {
  const h = boot(75);
  h.engine.prepareWave(h.state.run, 75);
  h.engine.spawnWave(h.state);
  const i = slotOf(h.engine, 'poxsac');
  assert.ok(i >= 0, 'wave 75 fields the pox sac');
  const fam = swarmBroodLateFamily('poxsac');
  isolate(h, i);
  const left0 = h.engine._bodies.birthLeft[i];
  assert.ok(left0 > 0, 'she was assigned no tide');
  const heldBefore = h.engine._mother().reserve;
  step(h, Math.ceil((fam.birthEveryS + 0.4) / DT));
  assert.ok(h.engine._bodies.birthLeft[i] < left0, 'she never birthed a mite');
  const spent = heldBefore - h.engine._mother().reserve;
  assert.ok(spent >= 1, 'the tide did not spend the held share');
  assert.ok(h.engine._bodies.birthTold[i] === 1, 'her first birth stayed silent');
  const tells = telegraphs(h, 'poxsac');
  assert.ok(tells.length >= 1, 'her first birth never spoke');
  assert.equal(tells[0].payload.line, fam.telegraph.line,
    'the birth does not carry the authored line');
});

// --- (c) population conservation across every held lane -----------------------------------

test('third-band waves conserve the wave budget across every held lane', () => {
  for (const w of [61, 67, 75]) {
    const fold = broodFold(w);
    const total = fold.reduce((s, p) => s + p.count, 0);
    assert.equal(total, swarmBroodPopulation(w), `wave ${w} fold moved the population`);
    assert.ok(total >= SWARM_BROOD_MIN && total <= SWARM_BROOD_MAX,
      `wave ${w} total ${total} outside the band`);
    const mite = fold.find((p) => p.id === 'mite');
    assert.ok(mite && mite.count >= 1, `wave ${w} folded every last mite away`);
    const h = boot(w);
    h.engine.prepareWave(h.state.run, w);
    h.engine.spawnWave(h.state);
    assert.equal(budget(h.engine), swarmBroodPopulation(w),
      `wave ${w} alive + held lanes moved off the authored population`);
    assert.ok(h.engine.census().alive <= SWARM_BROOD_MAX);
  }
});

// --- the reserve picker: eligibility by flag, determinism --------------------------------

test('the late reserve takes mirebulb but never a hold-back owner', () => {
  const pick = swarmBroodLateReserve(75, () => 0.9);
  assert.ok(pick, 'wave 75 keeps a reserve');
  assert.equal(pick.familyId, 'mirebulb', 'the newest eligible family never joins the draw');
  assert.ok(pick.count >= 1 && pick.count <= swarmBroodLateFamily('mirebulb').cohort);
  // Sweep the whole draw: the picker can never land on a splits or births family —
  // their unbudgeted children would grow the plan.
  const eligibleSeen = new Set();
  for (let d = 0; d < 1000; d++) {
    const p = swarmBroodLateReserve(75, () => d / 1000);
    assert.ok(p);
    eligibleSeen.add(p.familyId);
    const fam = swarmBroodLateFamily(p.familyId);
    assert.ok(!fam.births && !fam.splits, `${p.familyId} owns a hold-back and must stay out`);
    assert.ok(fam.fromWave <= 75, `${p.familyId} picked before its gate`);
  }
  assert.ok(eligibleSeen.has('mirebulb'), 'the sweep never drew the mirebulb');
  assert.ok(!eligibleSeen.has('poxsac') && !eligibleSeen.has('clutchstone'));
  // Deterministic: the same (seed, wave) always picks the same group.
  assert.deepEqual(swarmBroodLateReserve(67, () => 0.314), swarmBroodLateReserve(67, () => 0.314));
});

test('the runtime fields the whole late roster on a deep wave — mirror sized for all of it', () => {
  const h = boot(75);
  h.engine.prepareWave(h.state.run, 75);
  h.engine.spawnWave(h.state);
  for (const gate of [...EARLIER_LATE, ...BAND3]) {
    const n = countFamily(h.engine, gate.id);
    assert.ok(n >= 1, `wave 75 spawns no ${gate.id}`);
    const fam = swarmBroodLateFamily(gate.id);
    assert.ok(n <= fam.cohort, `${gate.id} fields ${n}, past its cohort ${fam.cohort}`);
  }
  assert.equal(
    SWARM_BROOD_LATE_FAMILIES.length,
    EARLIER_LATE.length + BAND3.length,
    'the late table grew past the band — update the pin when a fourth band lands',
  );
});

// --- determinism: identical seeds reproduce the fold byte-for-byte -------------------------

test('the fold stays deterministic — same seed, byte-identical cohort', () => {
  for (const w of [61, 67, 75]) {
    const a = foldBroodLatePlan(swarmBroodPlan(w, mulberry32(broodStreamSeed(SEED, w))), w);
    const b = foldBroodLatePlan(swarmBroodPlan(w, mulberry32(broodStreamSeed(SEED, w))), w);
    assert.deepEqual(a, b, `wave ${w} fold is not deterministic`);
  }
  const famIds = new Set(SWARM_BROOD_FAMILIES.map((f) => f.id));
  for (const band of BAND3) assert.ok(!famIds.has(band.id), `${band.id} collides with a base id`);
});
