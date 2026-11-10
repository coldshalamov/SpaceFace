// SWARM B5 — the late reserve: from wave 25 a non-Hive, non-champion wave holds one
// small late-band specialist group back out of the wave's OWN mite share and drops it
// mid-wave through the ordinary gate ring — the Hive's sac axis in miniature, for every
// other room. The population law is untouched (immediate + held = the authored total),
// the Hive is untouched (sacMode wins the reserve lane), and the drop speaks the held
// family's authored telegraph line so it never arrives silent.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import {
  SWARM_BROOD_FAMILIES,
  SWARM_BROOD_MAX,
  swarmBroodPopulation,
} from '../src/data/swarmBrood.js';
import {
  SWARM_BROOD_LATE_FAMILIES,
  SWARM_BROOD_RESERVE_DELAY_S,
  SWARM_BROOD_RESERVE_FROM_WAVE,
  SWARM_BROOD_RESERVE_MAX,
  swarmBroodLateFamily,
  swarmBroodLateReserve,
} from '../src/data/swarmBroodLate.js';
import { isSwarmBossWave } from '../src/data/swarmMode.js';
import { createBroodEngine } from '../src/systems/swarmBrood.js';
import { HIVE_ARENA_ID } from '../src/systems/theHiveArena.js';

const DT = 1 / 60;
const SEED = 4242;

function boot(wave, arenaId = null) {
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
  state.entityIndex = {
    __spacefaceEntityIndexV1: true, ready: true,
    shipLike: [player], asteroids: [],
  };
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED });
  state.run.arenaId = arenaId;
  state.run.phase = 'active';
  state.run.wave = wave;
  state.mode = 'flight';
  state.player = state.player || { tether: null };
  const engine = createBroodEngine({ bus, getState: () => state, fieldList: () => [] });
  return { state, emitted, engine, player };
}

function step(h, ticks) {
  for (let i = 0; i < ticks; i++) {
    h.state.simTime += DT;
    h.state.tick += 1;
    h.engine.step(h.state);
  }
}

function familyIndex(id) {
  const i = SWARM_BROOD_FAMILIES.findIndex((f) => f.id === id);
  if (i >= 0) return i;
  const j = SWARM_BROOD_LATE_FAMILIES.findIndex((f) => f.id === id);
  return j < 0 ? -1 : SWARM_BROOD_FAMILIES.length + j;
}

function countFamily(engine, famIdx) {
  let n = 0;
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    if (engine._bodies.alive[i] && engine._bodies.family[i] === famIdx) n += 1;
  }
  return n;
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

// (a) The band law: below the gate, on champion waves, and in the Hive the picker is
// silent — and it never spends the stream for a wave it rejects.
test('the picker gates on band, champion and eligibility law', () => {
  for (const w of [1, 20, SWARM_BROOD_RESERVE_FROM_WAVE - 1]) {
    assert.equal(swarmBroodLateReserve(w, () => 0.5), null, `wave ${w} keeps no reserve`);
  }
  for (const w of [30, 40, 70, 80]) {
    assert.ok(isSwarmBossWave(w));
    assert.equal(swarmBroodLateReserve(w, () => 0.5), null, `champion wave ${w} keeps no reserve`);
  }
  for (const w of [SWARM_BROOD_RESERVE_FROM_WAVE, 31, 37, 55]) {
    const pick = swarmBroodLateReserve(w, () => 0.9);
    assert.ok(pick, `wave ${w} holds a reserve`);
    const fam = swarmBroodLateFamily(pick.familyId);
    assert.ok(fam && fam.fromWave <= w, `${pick.familyId} not unlocked at wave ${w}`);
    assert.ok(!fam.births && !fam.splits, `${fam.id} owns a hold-back already`);
    assert.ok(pick.count >= 1 && pick.count <= Math.min(SWARM_BROOD_RESERVE_MAX, fam.cohort || SWARM_BROOD_RESERVE_MAX),
      `wave ${w} reserve size ${pick.count} outside the authored band`);
  }
  // Deterministic: same stream position, same pick.
  const rngA = () => 0.314;
  assert.deepEqual(swarmBroodLateReserve(31, rngA), swarmBroodLateReserve(31, rngA));
});

// (a cont.) Engine-side: a pre-band non-Hive wave spends its whole plan at the open.
test('pre-band wave in a plain arena keeps no reserve and drops nothing mid-wave', () => {
  const h = boot(24);
  h.engine.prepareWave(h.state.run, 24);
  assert.equal(h.engine._reserve().family, null);
  assert.equal(h.engine._reserve().left, 0);
  h.engine.spawnWave(h.state);
  assert.equal(budget(h.engine), swarmBroodPopulation(24), 'the whole plan is accounted for');
  step(h, Math.ceil((SWARM_BROOD_RESERVE_DELAY_S + 5) * 60));
  assert.equal(h.emitted.filter((e) => e.event === 'swarm:broodReserve').length, 0,
    'a pre-band wave dropped a reserve');
});

// (b)+(c)+(e) A band wave in a non-Hive arena: one bounded specialist group drops
// mid-wave, inside the wave's own budget, speaking the family's authored line.
test('a wave-31 room drops one bounded late group mid-wave, inside the plan', () => {
  const h = boot(31);
  const h2 = boot(31);
  h.engine.prepareWave(h.state.run, 31);
  h2.engine.prepareWave(h2.state.run, 31);

  // Deterministic pick across two engines on the same (seed, wave) stream.
  const res = h.engine._reserve();
  assert.deepEqual(h2.engine._reserve(), res, 'the reserve pick is not deterministic');
  const fam = swarmBroodLateFamily(res.family);
  assert.ok(fam && fam.fromWave <= 31 && !fam.births && !fam.splits,
    `reserve family ${res.family} breaks the eligibility law`);
  assert.ok(res.left >= 1 && res.left <= Math.min(SWARM_BROOD_RESERVE_MAX, fam.cohort),
    `reserve size ${res.left} outside the authored band`);
  assert.equal(res.releaseAt, Infinity, 'the drop clock arms at wave start, not at plan');

  const spawned = h.engine.spawnWave(h.state);
  assert.ok(spawned > 0);
  assert.ok(Number.isFinite(h.engine._reserve().releaseAt), 'the drop clock never armed');
  // (c) The reserve spent from the wave budget: alive + still-held = the population law.
  assert.equal(budget(h.engine), swarmBroodPopulation(31),
    'immediate + held bodies moved off the authored population');

  // Before the clock: nothing drops early.
  step(h, Math.floor((SWARM_BROOD_RESERVE_DELAY_S - 5) * 60));
  assert.equal(h.engine._reserve().left, res.left, 'the reserve dropped ahead of its beat');
  assert.equal(h.emitted.filter((e) => e.event === 'swarm:broodReserve').length, 0);

  // Past the clock: exactly one group lands, all of it, speaking the family's line.
  step(h, Math.ceil(10 * 60));
  assert.equal(h.engine._reserve().left, 0, 'the reserve never landed');
  const drops = h.emitted.filter((e) => e.event === 'swarm:broodReserve');
  assert.ok(drops.length >= 1, 'no reserve drop receipt');
  assert.equal(drops.reduce((s, e) => s + e.payload.count, 0), res.left,
    'the drop did not land the whole held group');
  assert.ok(drops.every((e) => e.payload.familyId === res.family && e.payload.wave === 31));
  // (c) After the drop the room still sits inside the authored population.
  assert.ok(h.engine.census().alive <= swarmBroodPopulation(31));
  assert.ok(budget(h.engine) <= swarmBroodPopulation(31));

  // (e) The arrival is not silent: the held family's authored {bark,line,cue} spoke at
  // the drop point through the ordinary telegraph seam.
  const dropPos = drops[0].payload.pos;
  const tell = h.emitted.find((e) => e.event === 'swarm:broodTelegraph'
    && e.payload.familyId === res.family
    && e.payload.pos.x === dropPos.x && e.payload.pos.z === dropPos.z);
  assert.ok(tell, 'the reserve landed without its telegraph line');
  assert.equal(tell.payload.bark, fam.telegraph.bark);
  assert.equal(tell.payload.line, fam.telegraph.line);
  assert.equal(tell.payload.cue, fam.telegraph.cue);
});

// (d) The Hive is untouched: its sac reserve still owns the hold-back lane.
test('the Hive keeps its sac reserve and fields no late drop', () => {
  const h = boot(31, HIVE_ARENA_ID);
  h.engine.prepareWave(h.state.run, 31);
  assert.ok(h.engine._hive().sacBudget > 0, 'the Hive lost its sac reserve');
  assert.equal(h.engine._reserve().left, 0, 'the Hive grew a second reserve lane');
  assert.equal(h.engine._reserve().family, null);
  const spawned = h.engine.spawnWave(h.state);
  assert.equal(budget(h.engine), swarmBroodPopulation(31));
  step(h, Math.ceil((SWARM_BROOD_RESERVE_DELAY_S + 5) * 60));
  assert.equal(h.emitted.filter((e) => e.event === 'swarm:broodReserve').length, 0,
    'a Hive wave dropped a late reserve');
  // The sac budget is only spent by the arena's sac pulses — the engine never bleeds it.
  assert.ok(h.engine._hive().sacBudget > 0);
  void spawned;
});

// (b cont.) The drop reads as one gate-ring group: bounded, family-true, cap-safe.
test('the dropped group lands on the gate ring inside the population cap', () => {
  const h = boot(37);
  h.engine.prepareWave(h.state.run, 37);
  const res = h.engine._reserve();
  assert.ok(res.left > 0, 'wave 37 holds a reserve');
  h.engine.spawnWave(h.state);
  // Serials minted so far belong to the open cohort; anything above them is the drop's.
  let maxSerial = 0;
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    if (h.engine._bodies.alive[i]) maxSerial = Math.max(maxSerial, h.engine._bodies.serial[i]);
  }
  let dropped = false;
  const ticks = Math.ceil((SWARM_BROOD_RESERVE_DELAY_S + 5) * 60);
  for (let t = 0; t < ticks && !dropped; t++) {
    step(h, 1);
    dropped = h.emitted.some((e) => e.event === 'swarm:broodReserve');
  }
  assert.ok(dropped, 'the reserve never landed');
  const famIdx = familyIndex(res.family);
  let landed = 0;
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    // Serials above the open cohort's mark are mid-wave births: the mother drops mites
    // on her own cadence — the reserve group is exactly the late-family subset.
    if (!h.engine._bodies.alive[i] || h.engine._bodies.serial[i] <= maxSerial
      || h.engine._bodies.family[i] !== famIdx) continue;
    landed += 1;
    const d = Math.hypot(
      h.engine._bodies.px[i] - h.player.pos.x,
      h.engine._bodies.pz[i] - h.player.pos.z,
    );
    assert.ok(d > 60 && d < 240, `reserve body landed ${d.toFixed(1)}wu off the player — off the gate ring`);
  }
  assert.equal(landed, res.left, 'the whole held group did not land in one beat');
  assert.ok(h.engine.census().alive <= SWARM_BROOD_MAX);
});
