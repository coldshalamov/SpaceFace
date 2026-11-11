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
//
// C01-01: every strain gate (83/97/111) sits past round 30 — the marks are unreachable
// and the deep-draw cases are retired (see test/RETIRED_SWARM_ENDLESS.md). What remains
// is the in-course truth: no wave a run can reach hatches a mark, champion rows stay
// clean, the Hive keeps its own lane, and the validator honestly flags the authored
// rows it can no longer field.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import {
  SWARM_BROOD_MAX,
  swarmBroodPopulation,
} from '../src/data/swarmBrood.js';
import {
  SWARM_BROOD_STRAIN_COMMANDER_FROM_WAVE,
  SWARM_BROOD_STRAIN_FROM_WAVE,
  SWARM_BROOD_STRAIN_PLATED_FROM_WAVE,
  swarmBroodLateIssues,
  swarmBroodStrainFor,
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
  // C01-03: the deep course is reachable again — the strain gates (83/97/111) hatch their
  // marks on real waves. What still holds: no pre-debut wave hatches a mark, champion
  // rows stay clean, and a mite row too thin to mark stays clean at any depth.
  for (let w = 1; w < SWARM_BROOD_STRAIN_FROM_WAVE; w++) {
    assert.equal(swarmBroodStrainFor(w, 200, () => 0.5), null,
      `pre-debut wave ${w} hatches a mark`);
  }
  for (const w of [90, 100, 110, 140]) {
    assert.ok(isSwarmBossWave(w));
    assert.equal(swarmBroodStrainFor(w, 200, () => 0.5), null, `champion wave ${w} hatches clean`);
  }
  for (const w of [SWARM_BROOD_STRAIN_FROM_WAVE, SWARM_BROOD_STRAIN_PLATED_FROM_WAVE,
    SWARM_BROOD_STRAIN_COMMANDER_FROM_WAVE]) {
    assert.ok(swarmBroodStrainFor(w, 200, () => 0.5),
      `the strain gate ${w} debuts its cooking`);
    assert.equal(swarmBroodStrainFor(w, 1, () => 0.5), null, `wave ${w} one-mite wave hatches clean`);
    assert.equal(swarmBroodStrainFor(w, 0, () => 0.5), null, `wave ${w} no mite row, no mark`);
  }
  // Deterministic: same stream position, same pick.
  const rngA = () => 0.314;
  assert.deepEqual(swarmBroodStrainFor(83, 180, rngA), swarmBroodStrainFor(83, 180, rngA));
});

// (a cont.) The late table's authoring check passes clean — every debut sits on a real
// non-champion row of the deep course.
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

// (g) The Hive is untouched: its sac tide still owns the hold-back lane — and with the
// strains unreachable its mites field clean like every other in-course room.
test('the Hive keeps its sac reserve and its mites carry no mark', () => {
  const h = boot(29, HIVE_ARENA_ID);
  h.engine.prepareWave(h.state.run, 29);
  assert.ok(h.engine._hive().sacBudget > 0, 'the Hive lost its sac reserve');
  assert.equal(h.engine._reserve().left, 0, 'the Hive grew a late reserve');
  // The strain lane is silent inside the course — Hive mites carry no mark either.
  assert.equal(h.engine._strain().id, null);
  h.engine.spawnWave(h.state);
  assert.equal(markedSlots(h.engine).length, 0, 'the Hive fielded a mark');
  assert.equal(budget(h.engine), swarmBroodPopulation(29));
});

// Retired with C01-01 — the strain marks debut at waves 83/97/111, all past the finish
// (see test/RETIRED_SWARM_ENDLESS.md):
//   - a wave-83 room hatches a marked mite share inside its own plan
//   - the whole plateau hatches the strain every non-champion wave
//   - the strain never spends a telegraph line — standing property, card debut
//   - a marked body pops where it dies: signature shove + chip damage, pack shoved not killed
//   - a marked body dying far out shoves the pack but touches no signature
//   - an explosion kill on a marked body still pops the strain
//   - the strain never changes the wave population
//   - the strain debuts on the card seam at its gate wave and only there
//   - a plated room hatches a marked mite share under the second mark byte
//   - a plated body refuses everything but mass — and pops nothing when it cracks
//   - a blast scatters the plated body it cannot crack
//   - the plated strain never changes the wave population
//   - a commander room hatches one or two marked leaders under its own count band
//   - a live leader's aura buffs its pack — and the buff dies with the leader
//   - a commander death pops nothing, gates nothing, and the room never grows
