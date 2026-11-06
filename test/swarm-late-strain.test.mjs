// B6 — THE STRAIN MARK: the last plateau's brood-affix law. Band 3's clock stops at
// wave 75 and the roster runs silent to the wrapped champions at 140 — and the flag
// matrix has no honest fourth band left (every remaining composition is a kill-gate
// mirror of a family already fielded). Instead the ship-side veteran-affix law lands
// on the brood's own per-body buffers: from wave 83 a seeded share of the wave's MITE
// share hatches marked 'volatile' — one byte per slot, one honored effect (the body
// pops where it dies: a small blast and a shove on the signature, never a kill on the
// pack). From wave 97 a second cooking joins the draw: 'plated' — the keelback's shell
// law on a single body, refusing every cause but mass. From wave 111 the trio closes
// on the last axis — WHO FIRST: 'commander' marks one or two LEADERS (a count band,
// not a share), and a live leader buffs every other body inside its radius — the pack
// steers harder and runs faster until the leader dies. The picker's seeded hand deals
// ONE strain per wave, so the plateau alternates its lessons rather than mixing them.
// The marks ride budgeted bodies and the champion waves stay exempt. The mark is a
// standing property — no telegraph line; the slam card speaks each strain once at its
// own debut wave, the tint keeps saying it, and the field's behavior is the feedback.
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
  SWARM_BROOD_STRAIN_COMMANDER_FROM_WAVE,
  SWARM_BROOD_STRAIN_FROM_WAVE,
  SWARM_BROOD_STRAIN_PLATED_FROM_WAVE,
  SWARM_BROOD_STRAIN_SHARE_MAX,
  SWARM_BROOD_STRAIN_MIN_MARKED,
  SWARM_BROOD_STRAINS,
  swarmBroodLateIssues,
  swarmBroodStrainById,
  swarmBroodStrainDebutFor,
  swarmBroodStrainFor,
  swarmBroodStrainMark,
} from '../src/data/swarmBroodLate.js';
import { isSwarmBossWave } from '../src/data/swarmMode.js';
import { createBroodEngine } from '../src/systems/swarmBrood.js';
import { HIVE_ARENA_ID } from '../src/systems/theHiveArena.js';

const DT = 1 / 60;
const SEED = 4242;
const VOLATILE = SWARM_BROOD_STRAINS[0];
const COMMANDER = swarmBroodStrainById('commander');

/** A deterministic roll stream handing back the listed draws in order. */
function seq(...vals) {
  let n = 0;
  return () => vals[Math.min(n++, vals.length - 1)];
}

function boot(wave, arenaId = null) {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const damage = [];
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
  const engine = createBroodEngine({
    bus,
    getState: () => state,
    fieldList: () => [],
    routeDamage: (request) => { damage.push(request); return { ok: true }; },
  });
  return { state, emitted, engine, player, damage };
}

function step(h, ticks) {
  for (let i = 0; i < ticks; i++) {
    h.state.simTime += DT;
    h.state.tick = (h.state.tick || 0) + 1;
    h.engine.step(h.state);
  }
}

function familyIndex(id) {
  const i = SWARM_BROOD_FAMILIES.findIndex((f) => f.id === id);
  if (i >= 0) return i;
  const j = SWARM_BROOD_LATE_FAMILIES.findIndex((f) => f.id === id);
  return j < 0 ? -1 : SWARM_BROOD_FAMILIES.length + j;
}

function markedSlots(engine, mark = 1) {
  const out = [];
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    if (engine._bodies.alive[i] && engine._bodies.affix[i] === mark) out.push(i);
  }
  return out;
}

/** Every body the wave is still owed: live + deferred + every held lane. */
function budget(engine) {
  return engine.census().alive
    + engine.view.pendingCount
    + engine._hive().sacBudget
    + engine._splitter().reserve
    + engine._mother().reserve
    + engine._machine().reserve
    + engine._reserve().left;
}

// (a) The band law: below the gate, on champion waves, and on a starved mite row the
// picker is silent — and it never spends the stream for a wave it rejects.
test('the strain picker gates on wave band, champion and mite-count law', () => {
  for (const w of [1, 22, 60, 75, SWARM_BROOD_STRAIN_FROM_WAVE - 1]) {
    assert.equal(swarmBroodStrainFor(w, 200, () => 0.5), null, `wave ${w} hatches clean`);
  }
  for (const w of [90, 100, 110, 140]) {
    assert.ok(isSwarmBossWave(w));
    assert.equal(swarmBroodStrainFor(w, 200, () => 0.5), null, `champion wave ${w} hatches clean`);
  }
  assert.equal(swarmBroodStrainFor(85, 1, () => 0.5), null, 'one-mite wave hatches clean');
  assert.equal(swarmBroodStrainFor(85, 0, () => 0.5), null, 'no mite row, no mark');
  // Below the plated gate the draw is all volatile, whatever the roll hands it.
  for (const w of [SWARM_BROOD_STRAIN_FROM_WAVE, 84, 91, SWARM_BROOD_STRAIN_PLATED_FROM_WAVE - 1]) {
    for (const rollV of [0.1, 0.9]) {
      const pick = swarmBroodStrainFor(w, 200, () => rollV);
      assert.ok(pick, `wave ${w} hatches a strain`);
      assert.equal(pick.strain.id, 'volatile');
      assert.ok(pick.count >= SWARM_BROOD_STRAIN_MIN_MARKED && pick.count <= 199,
        `wave ${w} mark count ${pick.count} outside the authored band`);
      assert.ok(pick.count <= Math.round(200 * SWARM_BROOD_STRAIN_SHARE_MAX) + 1,
        `wave ${w} marked above the share ceiling`);
    }
  }
  // From the plated gate the strain draw picks between the unlocked cookings — the
  // seeded hand deals one per wave, never a mix, and a share-band pick keeps the
  // authored band. Between the two gates the hand is the two cookings alone.
  for (const w of [99, 103, 107]) {
    const hot = swarmBroodStrainFor(w, 200, () => 0.9);
    const cold = swarmBroodStrainFor(w, 200, () => 0.1);
    assert.equal(hot.strain.id, 'plated', `wave ${w}: high strain draw should field plated`);
    assert.equal(cold.strain.id, 'volatile', `wave ${w}: low strain draw should field volatile`);
    for (const pick of [hot, cold]) {
      assert.ok(pick.count >= SWARM_BROOD_STRAIN_MIN_MARKED && pick.count <= 199,
        `wave ${w} mark count ${pick.count} outside the authored band`);
      assert.ok(pick.count <= Math.round(200 * SWARM_BROOD_STRAIN_SHARE_MAX) + 1,
        `wave ${w} marked above the share ceiling`);
    }
  }
  // The debut law: a strain's own gate wave fields that cooking under EVERY roll —
  // the slam card's lesson is on the field that wave, whatever the draw says.
  for (const rollV of [0.1, 0.5, 0.9]) {
    assert.equal(swarmBroodStrainFor(SWARM_BROOD_STRAIN_PLATED_FROM_WAVE, 200, () => rollV).strain.id,
      'plated', 'the plated debut wave dealt another cooking');
    assert.equal(swarmBroodStrainFor(SWARM_BROOD_STRAIN_COMMANDER_FROM_WAVE, 200, () => rollV).strain.id,
      'commander', 'the commander debut wave dealt another cooking');
  }
  // From the commander gate the seeded hand deals from the whole trio — one cooking
  // per wave, never a mix. The share-band picks keep the share band; the commander
  // pick keeps its own count law: one or two heads, never a marked fifth.
  for (const w of [112, 113, 127, 139]) {
    if (isSwarmBossWave(w)) continue;
    const cold = swarmBroodStrainFor(w, 200, () => 0.1);
    const mid = swarmBroodStrainFor(w, 200, () => 0.5);
    const hot = swarmBroodStrainFor(w, 200, () => 0.9);
    assert.equal(cold.strain.id, 'volatile', `wave ${w}: low strain draw should field volatile`);
    assert.equal(mid.strain.id, 'plated', `wave ${w}: mid strain draw should field plated`);
    assert.equal(hot.strain.id, 'commander', `wave ${w}: high strain draw should field commander`);
    for (const pick of [cold, mid]) {
      assert.ok(pick.count >= SWARM_BROOD_STRAIN_MIN_MARKED && pick.count <= 199,
        `wave ${w} mark count ${pick.count} outside the authored band`);
      assert.ok(pick.count <= Math.round(200 * SWARM_BROOD_STRAIN_SHARE_MAX) + 1,
        `wave ${w} marked above the share ceiling`);
    }
    assert.ok(hot.count >= 1 && hot.count <= COMMANDER.markMax,
      `wave ${w} leader count ${hot.count} outside the count band`);
    // The second draw still seeds the leader count inside its own band — below the
    // band's midpoint one head, at it two. Both draws are spent either way.
    assert.equal(swarmBroodStrainFor(w, 200, seq(0.9, 0.49)).count, 1,
      `wave ${w} low count draw did not field one leader`);
    assert.equal(swarmBroodStrainFor(w, 200, seq(0.9, 0.5)).count, 2,
      `wave ${w} high count draw did not field two leaders`);
  }
  // Deterministic: same stream position, same pick.
  const rngA = () => 0.314;
  assert.deepEqual(swarmBroodStrainFor(91, 180, rngA), swarmBroodStrainFor(91, 180, rngA));
  assert.deepEqual(swarmBroodStrainFor(131, 180, rngA), swarmBroodStrainFor(131, 180, rngA));
});

// (a cont.) The late table's authoring check stays clean — strains included.
test('the late-table authoring check passes with the strain table', () => {
  assert.deepEqual(swarmBroodLateIssues(), []);
});

// (b) Earlier waves are untouched: pre-gate rooms spawn no mark and publish no strain.
test('pre-gate waves field no mark and publish a clean strain lane', () => {
  for (const wave of [24, 61, 75, 82]) {
    if (isSwarmBossWave(wave)) continue;
    const h = boot(wave);
    h.engine.prepareWave(h.state.run, wave);
    assert.equal(h.engine._strain().id, null, `wave ${wave} grew a strain`);
    assert.equal(h.engine._strain().left, 0);
    const spawned = h.engine.spawnWave(h.state);
    assert.ok(spawned > 0);
    assert.equal(h.engine.view.strain, null);
    assert.equal(markedSlots(h.engine).length, 0, `wave ${wave} fielded a mark`);
    assert.equal(budget(h.engine), swarmBroodPopulation(wave),
      `wave ${wave} moved off its population`);
  }
});

// (b cont.) Champion waves inside the band stay clean: the boss is the wave's story.
test('a champion wave inside the band hatches clean', () => {
  const h = boot(90);
  h.engine.prepareWave(h.state.run, 90);
  assert.equal(h.engine._strain().id, null);
  assert.equal(h.engine._strain().left, 0);
  h.engine.spawnWave(h.state);
  assert.equal(markedSlots(h.engine).length, 0, 'the champion wave fielded a mark');
});

// (c) A band wave: the mark rides budgeted mites — count inside the share band, all
// on the carrier family, population law untouched, deterministic across engines.
test('a wave-83 room hatches a marked mite share inside its own plan', () => {
  const h = boot(83);
  const h2 = boot(83);
  h.engine.prepareWave(h.state.run, 83);
  h2.engine.prepareWave(h2.state.run, 83);
  assert.deepEqual(h2.engine._strain(), h.engine._strain(), 'the strain pick is not deterministic');

  const strain = h.engine._strain();
  assert.equal(strain.id, 'volatile');
  assert.ok(strain.left >= SWARM_BROOD_STRAIN_MIN_MARKED, 'the mark budget never armed');

  const spawned = h.engine.spawnWave(h.state);
  assert.ok(spawned > 0);
  // The marks are spent out of the plan — alive + held bodies never exceed the law.
  assert.equal(budget(h.engine), swarmBroodPopulation(83),
    'the marked wave moved off its authored population');
  assert.ok(h.engine.census().alive <= SWARM_BROOD_MAX);

  const mark = swarmBroodStrainMark('volatile');
  assert.ok(mark > 0);
  const miteIdx = familyIndex('mite');
  const marked = markedSlots(h.engine, mark);
  // Every spent mark is alive on the carrier family; unspent marks ride the deferred
  // spawn lane only — spent + held never exceeds the pick.
  assert.equal(marked.length + h.engine._strain().left, strain.left,
    'marked bodies do not account for the whole mark budget');
  assert.ok(marked.length > 0, 'no marked body landed at the open');
  for (const slot of marked) {
    assert.equal(h.engine._bodies.family[slot], miteIdx, 'a non-mite body took the mark');
  }
  // Two engines on the same (seed, wave) field the same marked slots.
  h2.engine.spawnWave(h2.state);
  assert.deepEqual(markedSlots(h2.engine, mark), marked,
    'the marked cohort is not deterministic across engines');
});

// (c cont.) Later band waves keep marking — the plateau never runs clean again.
// From the plated gate the seeded draw alternates the unlocked cookings: one strain
// per wave, never a mix, and each wave's whole mark budget carries that strain's byte.
test('the whole plateau hatches the strain every non-champion wave', () => {
  // The run-seed deal for these exact waves (probe: seed 4242 through prepareWave):
  // pre-97 every room fields volatile; the plateau then alternates as the draw lands —
  // and from 111 the commander joins the hand (its own debut wave always fields it).
  const dealt = new Map([[87, 'volatile'], [95, 'volatile'], [97, 'plated'],
    [103, 'volatile'], [SWARM_BROOD_STRAIN_COMMANDER_FROM_WAVE, 'commander'],
    [112, 'commander'], [127, 'volatile'], [135, 'commander']]);
  for (const [wave, strainId] of dealt) {
    if (isSwarmBossWave(wave)) continue;
    const h = boot(wave);
    h.engine.prepareWave(h.state.run, wave);
    assert.equal(h.engine._strain().id, strainId,
      `wave ${wave} dealt ${h.engine._strain().id}, not ${strainId}`);
    h.engine.spawnWave(h.state);
    const mark = swarmBroodStrainMark(strainId);
    const marked = markedSlots(h.engine, mark);
    assert.ok(marked.length > 0, `wave ${wave} fielded no ${strainId} mark`);
    // Every marked body on the wave carries the one cooking — the second byte never mixes in.
    for (let i = 0; i < SWARM_BROOD_MAX; i++) {
      if (!h.engine._bodies.alive[i]) continue;
      const a = h.engine._bodies.affix[i];
      assert.ok(a === 0 || a === mark, `wave ${wave} mixed strains on one field`);
    }
    assert.equal(h.engine.view.strain, strainId);
  }
});

// (d) The mark is a STANDING property — the engine's own law keeps it out of the
// telegraph lane (a per-wave bark would starve the two-line brood budget for the
// rest of the run). The strain's voice is the slam card at its debut wave and the
// mark's tint on the field; the burst receipt is its feedback.
test('the strain never spends a telegraph line — standing property, card debut', () => {
  const h = boot(83);
  h.engine.prepareWave(h.state.run, 83);
  h.engine.spawnWave(h.state);
  step(h, 30);
  const mark = swarmBroodStrainMark('volatile');
  const marked = markedSlots(h.engine, mark);
  assert.ok(marked.length > 0);
  h.engine._killDirectForTest(marked[0], 'collision');
  const tells = h.emitted.filter((e) => e.event === 'swarm:broodTelegraph'
    && e.payload.familyId === VOLATILE.id);
  assert.equal(tells.length, 0, 'the strain spent a telegraph line it does not own');
  // The pop itself is the receipt: the burst seam carries it, the card taught it.
  assert.ok(h.emitted.some((e) => e.event === 'swarm:broodBurst' && e.payload.strain === 'volatile'),
    'the marked death emitted no burst receipt');
});

// (e) The honored effect — the pop lands where the marked body dies: the signature
// inside the radius takes the authored chip of damage and a mass-shared shove, the
// pack takes the shove, and NO neighbour dies — the pop never clears the room.
test('a marked body pops where it dies: signature shove + chip damage, pack shoved not killed', () => {
  const h = boot(83);
  h.engine.prepareWave(h.state.run, 83);
  h.engine.spawnWave(h.state);
  step(h, 1); // one step so the signature ref is cached
  const mark = swarmBroodStrainMark('volatile');
  const marked = markedSlots(h.engine, mark);
  assert.ok(marked.length > 0);
  const slot = marked[0];
  // Park the body on the signature — the blast must land.
  const bx = h.player.pos.x + 10;
  const bz = h.player.pos.z;
  h.engine._bodies.px[slot] = bx;
  h.engine._bodies.pz[slot] = bz;
  // A live neighbour inside the radius: shoved, never killed by the pop.
  const neighbour = h.engine._bodies.alive.findIndex((a, i) => a && i !== slot);
  assert.ok(neighbour >= 0);
  h.engine._bodies.px[neighbour] = bx + 8;
  h.engine._bodies.pz[neighbour] = bz;
  h.engine._bodies.vx[neighbour] = 0;
  h.engine._bodies.vz[neighbour] = 0;
  const aliveBefore = h.engine.census().alive;
  h.engine._killDirectForTest(slot, 'collision');
  // The signature: shoved away from the pop, chipped through the damage owner.
  assert.ok(h.player.vel.x < -1e-6 || h.player.vel.z !== 0,
    'the pop never shoved the signature');
  const hit = h.damage.find((d) => d && d.origin && d.origin.id === 'brood_strain_volatile');
  assert.ok(hit, 'the pop routed no damage through the owner');
  // The pack: shoved but alive — no free clearing.
  assert.ok(h.engine._bodies.alive[neighbour], 'the pop killed a neighbour');
  assert.ok(h.engine._bodies.vx[neighbour] > 1e-6, 'the pop never shoved the pack');
  assert.equal(h.engine.census().alive, aliveBefore - 1, 'the pop took a second body with it');
  // The receipt: the ordinary burst seam carries the strain's blast.
  const bursts = h.emitted.filter((e) => e.event === 'swarm:broodBurst'
    && e.payload.strain === 'volatile');
  assert.ok(bursts.length >= 1, 'the pop emitted no burst receipt');
  assert.equal(bursts[0].payload.familyId, 'mite');
  assert.equal(bursts[0].payload.radius, VOLATILE.blastRadius);
  assert.ok(Math.hypot(bursts[0].payload.pos.x - bx, bursts[0].payload.pos.z - bz) < 1e-6,
    'the burst receipt landed off the body');
  // The mark dies with the body — a reused slot never inherits it.
  assert.equal(h.engine._bodies.affix[slot], mark, 'the byte cleared before the body did');
});

// (e cont.) A marked body that dies out of the signature's reach still pops the pack —
// the blast only bites inside the authored radius.
test('a marked body dying far out shoves the pack but touches no signature', () => {
  const h = boot(83);
  h.engine.prepareWave(h.state.run, 83);
  h.engine.spawnWave(h.state);
  step(h, 1);
  const mark = swarmBroodStrainMark('volatile');
  const slot = markedSlots(h.engine, mark)[0];
  h.engine._bodies.px[slot] = h.player.pos.x + 900;
  h.engine._bodies.pz[slot] = h.player.pos.z;
  const damageBefore = h.damage.length;
  h.engine._killDirectForTest(slot, 'terrain');
  assert.equal(h.player.vel.x, 0, 'a far pop shoved the signature');
  assert.equal(h.damage.length, damageBefore, 'a far pop taxed the signature');
  assert.ok(h.emitted.some((e) => e.event === 'swarm:broodBurst' && e.payload.strain === 'volatile'),
    'the far pop emitted no burst receipt');
});

// (e cont.) The mark pops under any lawful cause — an explosion receipt kills the
// marked body through the real event path and the strain still fires.
test('an explosion kill on a marked body still pops the strain', () => {
  const h = boot(83);
  h.engine.prepareWave(h.state.run, 83);
  h.engine.spawnWave(h.state);
  step(h, 1);
  const mark = swarmBroodStrainMark('volatile');
  const slot = markedSlots(h.engine, mark)[0];
  h.engine._bodies.px[slot] = h.player.pos.x + 12;
  h.engine._bodies.pz[slot] = h.player.pos.z;
  h.engine.onExplosion({
    pos: { x: h.engine._bodies.px[slot], z: h.engine._bodies.pz[slot] },
    radius: 60,
    ownerId: h.player.id,
  });
  assert.equal(h.engine._bodies.alive[slot], 0, 'the marked body survived the blast');
  assert.ok(h.emitted.some((e) => e.event === 'swarm:broodBurst' && e.payload.strain === 'volatile'),
    'the explosion path skipped the strain pop');
});

// (f) The mark never grows the room: marks are a property of budgeted bodies.
test('the strain never changes the wave population', () => {
  for (const wave of [83, 91, 99, 117]) {
    if (isSwarmBossWave(wave)) continue;
    const h = boot(wave);
    h.engine.prepareWave(h.state.run, wave);
    h.engine.spawnWave(h.state);
    assert.equal(budget(h.engine), swarmBroodPopulation(wave),
      `wave ${wave} moved off its population once marked`);
    assert.ok(h.engine.census().alive <= SWARM_BROOD_MAX);
  }
});

// (g) The Hive is untouched by a second law: its sac tide still owns the hold-back
// lane — and ITS mites hatch marked the same, since the strain is the flesh itself.
test('the Hive keeps its sac reserve and its own mites still carry the mark', () => {
  const h = boot(85, HIVE_ARENA_ID);
  h.engine.prepareWave(h.state.run, 85);
  assert.ok(h.engine._hive().sacBudget > 0, 'the Hive lost its sac reserve');
  assert.equal(h.engine._reserve().left, 0, 'the Hive grew a late reserve');
  // The strain is the brood's flesh, not a reserve lane — Hive mites carry it too.
  assert.equal(h.engine._strain().id, 'volatile');
  h.engine.spawnWave(h.state);
  assert.equal(budget(h.engine), swarmBroodPopulation(85));
});

// (h) The debut seam: the strain row lands on the slam card exactly at its gate wave,
// through the same newcomer channel a family debut uses.
test('the strain debuts on the card seam at its gate wave and only there', () => {
  assert.equal(swarmBroodStrainDebutFor(82), null);
  const row = swarmBroodStrainDebutFor(SWARM_BROOD_STRAIN_FROM_WAVE);
  assert.ok(row, 'the gate wave carries no strain debut');
  assert.equal(row.id, 'volatile');
  assert.equal(row, swarmBroodStrainById('volatile'));
  assert.ok(typeof row.name === 'string' && row.name.length > 0);
  assert.ok(typeof row.counter === 'string' && row.counter.length >= 10);
  assert.equal(swarmBroodStrainDebutFor(84), null, 'the debut lingers past its wave');
  // The second cooking takes its own card wave — the plateau's later lesson.
  assert.equal(swarmBroodStrainDebutFor(96), null);
  const plated = swarmBroodStrainDebutFor(SWARM_BROOD_STRAIN_PLATED_FROM_WAVE);
  assert.ok(plated, 'the plated gate wave carries no strain debut');
  assert.equal(plated.id, 'plated');
  assert.equal(plated, swarmBroodStrainById('plated'));
  assert.ok(typeof plated.name === 'string' && plated.name.length > 0);
  assert.ok(typeof plated.counter === 'string' && plated.counter.length >= 10);
  assert.equal(swarmBroodStrainDebutFor(98), null, 'the plated debut lingers past its wave');
  // The third cooking takes its own card wave — the trio's last lesson.
  assert.equal(swarmBroodStrainDebutFor(110), null, 'a champion wave carries no strain debut');
  const commander = swarmBroodStrainDebutFor(SWARM_BROOD_STRAIN_COMMANDER_FROM_WAVE);
  assert.ok(commander, 'the commander gate wave carries no strain debut');
  assert.equal(commander.id, 'commander');
  assert.equal(commander, COMMANDER);
  assert.ok(typeof commander.name === 'string' && commander.name.length > 0);
  assert.ok(typeof commander.counter === 'string' && commander.counter.length >= 10);
  assert.equal(swarmBroodStrainDebutFor(SWARM_BROOD_STRAIN_COMMANDER_FROM_WAVE + 1), null,
    'the commander debut lingers past its wave');
});

// (i) A plated wave: the second cooking hatches a marked mite share out of the same
// plan — its own mark byte, the carrier family, the population law, determinism.
test('a plated room hatches a marked mite share under the second mark byte', () => {
  // Wave 97 is the plated debut itself — under the run seed it deals plated.
  const h = boot(SWARM_BROOD_STRAIN_PLATED_FROM_WAVE);
  const h2 = boot(SWARM_BROOD_STRAIN_PLATED_FROM_WAVE);
  h.engine.prepareWave(h.state.run, SWARM_BROOD_STRAIN_PLATED_FROM_WAVE);
  h2.engine.prepareWave(h2.state.run, SWARM_BROOD_STRAIN_PLATED_FROM_WAVE);
  assert.deepEqual(h2.engine._strain(), h.engine._strain(), 'the plated pick is not deterministic');

  const strain = h.engine._strain();
  assert.equal(strain.id, 'plated');
  assert.ok(strain.left >= SWARM_BROOD_STRAIN_MIN_MARKED, 'the plated mark budget never armed');

  const spawned = h.engine.spawnWave(h.state);
  assert.ok(spawned > 0);
  assert.equal(budget(h.engine), swarmBroodPopulation(SWARM_BROOD_STRAIN_PLATED_FROM_WAVE),
    'the plated wave moved off its authored population');

  const mark = swarmBroodStrainMark('plated');
  assert.ok(mark > 0 && mark !== swarmBroodStrainMark('volatile'), 'the strains share a byte');
  const miteIdx = familyIndex('mite');
  const marked = markedSlots(h.engine, mark);
  assert.equal(marked.length + h.engine._strain().left, strain.left,
    'plated bodies do not account for the whole mark budget');
  assert.ok(marked.length > 0, 'no plated body landed at the open');
  for (const slot of marked) {
    assert.equal(h.engine._bodies.family[slot], miteIdx, 'a non-mite body took the plated mark');
  }
  h2.engine.spawnWave(h2.state);
  assert.deepEqual(markedSlots(h2.engine, mark), marked,
    'the plated cohort is not deterministic across engines');
});

// (j) The honored effect is a different law, not a volatile reskin: a plated body
// REFUSES every cause but mass — 'explosive' and 'direct' ping, only
// collision/terrain crack it — and its death pops nothing.
test('a plated body refuses everything but mass — and pops nothing when it cracks', () => {
  const h = boot(SWARM_BROOD_STRAIN_PLATED_FROM_WAVE);
  h.engine.prepareWave(h.state.run, SWARM_BROOD_STRAIN_PLATED_FROM_WAVE);
  h.engine.spawnWave(h.state);
  step(h, 1);
  const mark = swarmBroodStrainMark('plated');
  const marked = markedSlots(h.engine, mark);
  assert.ok(marked.length >= 3, 'too few plated bodies to pin the gate');
  const aliveBefore = h.engine.census().alive;

  // 'explosive' pings: the body stands.
  h.engine._killDirectForTest(marked[0], 'explosive');
  assert.equal(h.engine._bodies.alive[marked[0]], 1, 'a blast cracked the shell');
  // 'direct' pings too — nothing but mass answers.
  h.engine._killDirectForTest(marked[0], 'direct');
  assert.equal(h.engine._bodies.alive[marked[0]], 1, 'a direct hit cracked the shell');

  // Mass cracks it: collision and terrain are the tier's own verbs.
  h.engine._killDirectForTest(marked[0], 'collision');
  assert.equal(h.engine._bodies.alive[marked[0]], 0, 'a collision did not crack the shell');
  h.engine._killDirectForTest(marked[1], 'terrain');
  assert.equal(h.engine._bodies.alive[marked[1]], 0, 'a wall slam did not crack the shell');
  assert.equal(h.engine.census().alive, aliveBefore - 2, 'the gate took extra bodies');

  // And the plated death is NO pop — no burst receipt, no strain blast. The volatile
  // lesson does not ride along; the shell law is the whole effect.
  assert.ok(!h.emitted.some((e) => e.event === 'swarm:broodBurst'
    && e.payload.strain === 'plated'), 'the plated death emitted a pop it does not own');
  // The kill receipts still flow through the ordinary seam with the real causes.
  assert.ok(h.emitted.some((e) => e.event === 'swarm:broodKills' && e.payload.cause === 'collision'),
    'the mass crack emitted no kill receipt');
});

// (j cont.) The refused blast is still a physical blast: a plated body inside the
// kill radius SURVIVES and is THROWN — the detonation scatters what it cannot crack
// — while an unmarked neighbour in the same radius still dies.
test('a blast scatters the plated body it cannot crack', () => {
  const h = boot(SWARM_BROOD_STRAIN_PLATED_FROM_WAVE);
  h.engine.prepareWave(h.state.run, SWARM_BROOD_STRAIN_PLATED_FROM_WAVE);
  h.engine.spawnWave(h.state);
  step(h, 1);
  const mark = swarmBroodStrainMark('plated');
  const slot = markedSlots(h.engine, mark)[0];
  const ex = h.player.pos.x + 400;
  const ez = h.player.pos.z;
  // The marked body 20wu off the blast — inside the kill radius (60*1.05).
  h.engine._bodies.px[slot] = ex + 20;
  h.engine._bodies.pz[slot] = ez;
  h.engine._bodies.vx[slot] = 0;
  h.engine._bodies.vz[slot] = 0;
  // An unmarked MITE at the same offset: it still dies — the gate is the mark's.
  // (A late-family body could carry its own kill-gate, so the contrast row is a mite.)
  const miteIdx = familyIndex('mite');
  const unmarked = h.engine._bodies.alive.findIndex((a, i) => a && i !== slot
    && h.engine._bodies.affix[i] === 0 && h.engine._bodies.family[i] === miteIdx);
  assert.ok(unmarked >= 0, 'no unmarked mite to contrast');
  h.engine._bodies.px[unmarked] = ex - 20;
  h.engine._bodies.pz[unmarked] = ez;

  h.engine.onExplosion({ pos: { x: ex, z: ez }, radius: 60, ownerId: h.player.id });
  assert.equal(h.engine._bodies.alive[unmarked], 0, 'the blast spared an unmarked body');
  assert.equal(h.engine._bodies.alive[slot], 1, 'the blast cracked a plated body');
  assert.ok(Math.hypot(h.engine._bodies.vx[slot], h.engine._bodies.vz[slot]) > 1e-6,
    'the refused blast never threw the body');
});

// (k) The plated gate never grows the room either — the marks ride the same plan.
test('the plated strain never changes the wave population', () => {
  for (const wave of [SWARM_BROOD_STRAIN_PLATED_FROM_WAVE, 102, 105]) {
    if (isSwarmBossWave(wave)) continue;
    const h = boot(wave);
    h.engine.prepareWave(h.state.run, wave);
    if (h.engine._strain().id !== 'plated') continue; // the seed dealt volatile — not this pin's wave
    h.engine.spawnWave(h.state);
    assert.equal(budget(h.engine), swarmBroodPopulation(wave),
      `wave ${wave} moved off its population once marked plated`);
    assert.ok(h.engine.census().alive <= SWARM_BROOD_MAX);
  }
});

// (l) A commander wave: the third cooking marks one or two LEADERS — its own count
// band instead of a share — on the same carrier family, the same mark budget
// machinery, the same population law, deterministic across engines.
test('a commander room hatches one or two marked leaders under its own count band', () => {
  const h = boot(SWARM_BROOD_STRAIN_COMMANDER_FROM_WAVE);
  const h2 = boot(SWARM_BROOD_STRAIN_COMMANDER_FROM_WAVE);
  h.engine.prepareWave(h.state.run, SWARM_BROOD_STRAIN_COMMANDER_FROM_WAVE);
  h2.engine.prepareWave(h2.state.run, SWARM_BROOD_STRAIN_COMMANDER_FROM_WAVE);
  assert.deepEqual(h2.engine._strain(), h.engine._strain(), 'the commander pick is not deterministic');

  const strain = h.engine._strain();
  // The debut wave always fields the debuting cooking — this IS the commander's wave.
  assert.equal(strain.id, 'commander');
  assert.ok(strain.left >= 1 && strain.left <= COMMANDER.markMax,
    `the leader band armed ${strain.left} marks`);

  const spawned = h.engine.spawnWave(h.state);
  assert.ok(spawned > 0);
  assert.equal(budget(h.engine), swarmBroodPopulation(SWARM_BROOD_STRAIN_COMMANDER_FROM_WAVE),
    'the commander wave moved off its authored population');

  const mark = swarmBroodStrainMark('commander');
  assert.ok(mark === 3 && mark !== swarmBroodStrainMark('volatile')
    && mark !== swarmBroodStrainMark('plated'), 'the commander did not take its own byte');
  const miteIdx = familyIndex('mite');
  const marked = markedSlots(h.engine, mark);
  assert.equal(marked.length + h.engine._strain().left, strain.left,
    'leaders do not account for the whole mark budget');
  assert.ok(marked.length >= 1 && marked.length <= COMMANDER.markMax,
    `a commander wave fielded ${marked.length} leaders`);
  for (const slot of marked) {
    assert.equal(h.engine._bodies.family[slot], miteIdx, 'a non-mite body took the commander mark');
  }
  assert.equal(h.engine.view.strain, 'commander');
  h2.engine.spawnWave(h2.state);
  assert.deepEqual(markedSlots(h2.engine, mark), marked,
    'the leader cohort is not deterministic across engines');
});

// (m) The honored effect is a different law again — WHO FIRST: a live leader flags
// every OTHER body inside its authored radius; the flagged pack runs the strain's
// own speed multiplier while the unflagged keep the ordinary law; and killing the
// leader drops the aura the same tick it dies.
test("a live leader's aura buffs its pack — and the buff dies with the leader", () => {
  const h = boot(SWARM_BROOD_STRAIN_COMMANDER_FROM_WAVE);
  h.engine.prepareWave(h.state.run, SWARM_BROOD_STRAIN_COMMANDER_FROM_WAVE);
  h.engine.spawnWave(h.state);
  const mark = swarmBroodStrainMark('commander');
  const leaders = markedSlots(h.engine, mark);
  assert.ok(leaders.length >= 1, 'no leader landed to pin the aura against');
  const b = h.engine._bodies;
  const miteIdx = familyIndex('mite');
  // The aura under test is ONE leader's: park it near the signature with packmates
  // authored-radius in and out, and park every OTHER leader far away.
  const L = leaders[0];
  b.px[L] = h.player.pos.x + 100;
  b.pz[L] = h.player.pos.z;
  for (let k = 1; k < leaders.length; k++) {
    b.px[leaders[k]] = h.player.pos.x + 2000;
    b.pz[leaders[k]] = h.player.pos.z + 2000;
  }
  const probes = [];
  for (let i = 0; i < SWARM_BROOD_MAX && probes.length < 3; i++) {
    if (b.alive[i] && b.affix[i] === 0 && b.family[i] === miteIdx && !leaders.includes(i)) probes.push(i);
  }
  assert.equal(probes.length, 3, 'not enough unmarked mites to pin the aura');
  const [inside, inside2, outside] = probes;
  // Inside the authored radius on both sides; outside it on the signature's far flank.
  b.px[inside] = b.px[L] + COMMANDER.commandRadius - 20;
  b.pz[inside] = b.pz[L];
  b.px[inside2] = b.px[L] - 30;
  b.pz[inside2] = b.pz[L] + 20;
  b.px[outside] = b.px[L] + COMMANDER.commandRadius + 120;
  b.pz[outside] = b.pz[L];
  for (const s of probes) { b.vx[s] = 0; b.vz[s] = 0; }

  step(h, 1);
  assert.equal(b.commandBuff[inside], 1, 'the aura never flagged the pack inside it');
  assert.equal(b.commandBuff[inside2], 1, 'the aura never flagged the pack inside it');
  assert.equal(b.commandBuff[outside], 0, 'the aura leaked past its authored radius');
  assert.equal(b.commandBuff[L], 0, 'the leader flagged itself');
  for (let k = 1; k < leaders.length; k++) {
    assert.equal(b.commandBuff[leaders[k]], 0, 'one leader flagged another');
  }
  // The buff is honored on the flock's own levers: flagged bodies accelerate the
  // strain's factor harder and run the strain's factor faster, so a flagged mite
  // out-runs an unflagged one hunting the same signature.
  step(h, 30);
  const speed = (i) => Math.hypot(b.vx[i], b.vz[i]);
  assert.ok(speed(inside) > speed(outside) * 1.2,
    `flagged ${speed(inside).toFixed(2)} never out-ran unflagged ${speed(outside).toFixed(2)}`);

  // Kill the leader — the aura it owned drops on the very next tick.
  h.engine._killDirectForTest(L, 'collision');
  assert.equal(b.alive[L], 0, 'the leader did not die');
  step(h, 1);
  assert.equal(b.commandBuff[inside], 0, 'the aura outlived its leader');
  assert.equal(b.commandBuff[inside2], 0, 'the aura outlived its leader');
});

// (n) A leader's death is no pop — the aura is the whole effect: no burst receipt,
// no blast on the signature, no kill-gate either (every lawful cause answers). And
// the leader band never grows the room.
test('a commander death pops nothing, gates nothing, and the room never grows', () => {
  const h = boot(SWARM_BROOD_STRAIN_COMMANDER_FROM_WAVE);
  h.engine.prepareWave(h.state.run, SWARM_BROOD_STRAIN_COMMANDER_FROM_WAVE);
  h.engine.spawnWave(h.state);
  step(h, 1);
  const mark = swarmBroodStrainMark('commander');
  const leaders = markedSlots(h.engine, mark);
  assert.ok(leaders.length >= 1);
  const slot = leaders[0];
  // No kill-gate: a blast cracks a leader like any other mite.
  h.engine._killDirectForTest(slot, 'explosive');
  assert.equal(h.engine._bodies.alive[slot], 0, 'the commander grew a kill-gate it does not own');
  // And no pop: the aura is its whole honored effect.
  assert.ok(!h.emitted.some((e) => e.event === 'swarm:broodBurst'
    && e.payload.strain === 'commander'), 'the commander death emitted a pop it does not own');
  assert.ok(h.emitted.some((e) => e.event === 'swarm:broodKills'),
    'the leader death emitted no kill receipt');

  for (const wave of [SWARM_BROOD_STRAIN_COMMANDER_FROM_WAVE, 112, 139]) {
    if (isSwarmBossWave(wave)) continue;
    const h2 = boot(wave);
    h2.engine.prepareWave(h2.state.run, wave);
    if (h2.engine._strain().id !== 'commander') continue; // the seed dealt elsewhere — not this pin's wave
    h2.engine.spawnWave(h2.state);
    assert.equal(budget(h2.engine), swarmBroodPopulation(wave),
      `wave ${wave} moved off its population once marked commander`);
    assert.ok(h2.engine.census().alive <= SWARM_BROOD_MAX);
  }
});
