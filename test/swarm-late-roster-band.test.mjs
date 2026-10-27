// LATE-BAND — the wave-24+ plateau break. Ship silhouettes stop arriving at w22 and the
// brood family clock stopped at w23, so deep runs only ever grew counts. The catalog's one
// unfielded ship silhouette (the scissorwake) cannot join: at stock stats it out-runs and
// out-turns every starter hull, which the swarm handling law forbids — so the band lives in
// the brood lane, where five veteran variants gate across w31–w55 through flag recipes the
// engine already runs. Everything folds out of the mite share: same population band, same
// quota, same caps, stock stats — a different fight, not a bigger one.
import test from 'node:test';
import assert from 'node:assert/strict';

import { mulberry32 } from '../src/core/rng.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import {
  BROOD_PHASE_BURIED,
  BROOD_PHASE_WINDUP,
  createBroodEngine,
} from '../src/systems/swarmBrood.js';
import {
  SWARM_BROOD_FAMILIES,
  SWARM_BROOD_MAX,
  SWARM_BROOD_MIN,
  swarmBroodPlan,
  swarmBroodPopulation,
  swarmBroodRosterFor,
} from '../src/data/swarmBrood.js';
import {
  foldBroodLatePlan,
  swarmBroodLateFamily,
  swarmBroodLateIssues,
} from '../src/data/swarmBroodLate.js';
import {
  SWARM_ROSTER,
  SWARM_RULESET,
  SWARM_SPAWN_CAP,
  isSwarmBossWave,
  swarmCatalogIssues,
  swarmNewcomerFor,
  swarmOpeningCount,
  swarmQuota,
  swarmRosterFor,
} from '../src/data/swarmMode.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';

const ARENA_ID = 'helios_core';
const SEED = 9;
const DT = 1 / 60;

// The roster ids that already owned their waves before the band — pinned so the early run
// can never quietly drift while the late table grows.
const PRE_BAND_ROSTER_IDS = [
  'wasp_swarmer', 'reaver_pirate', 'choir_zealot', 'detonator_dart', 'mine_layer_jackal',
  'lancer_sniper', 'warden_escort', 'corsair_raider', 'customs_cutter', 'quiet_ghost',
  'pd_screen_escort', 'patrol_lawman', 'tether_control_raider', 'bruiser_brawler',
  'field_anchor_controller',
];
const BROOD_BAND = [
  { id: 'remora', fromWave: 31, cohort: 5 },
  { id: 'gloomcap', fromWave: 37, cohort: 3 },
  { id: 'ashwisp', fromWave: 43, cohort: 4 },
  { id: 'keelback', fromWave: 49, cohort: 3 },
  { id: 'undertow', fromWave: 55, cohort: 4 },
];
const BAND_IDS = new Set(BROOD_BAND.map((f) => f.id));

function swarmPlan(wave, seed = SEED) {
  return planWave({ seed, arenaId: ARENA_ID, wave, mode: SWARM_RULESET });
}

function broodFold(wave, seed = 4242) {
  return foldBroodLatePlan(swarmBroodPlan(wave, mulberry32(seed + wave)), wave);
}

// --- the engine seam: a real wave's cohort through the runtime owner ---------------------

function bootEngine({ wave = 55, seed = 4242 } = {}) {
  const state = createGameState(seed);
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
  const rock = {
    id: state.nextEntityId++, alive: true, type: 'asteroid', collides: true,
    pos: { x: 500, z: 0 }, vel: { x: 0, z: 0 }, radius: 18,
  };
  state.entities.set(player.id, player);
  state.entities.set(rock.id, rock);
  state.entityList.push(player, rock);
  state.playerId = player.id;
  state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true, shipLike: [player], asteroids: [rock] };
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed });
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
  return { state, bus, emitted, player, rock, engine };
}

function familyIndexOf(id) {
  const late = ['burrower', 'splitter', 'brood_mother', ...BROOD_BAND.map((b) => b.id)];
  const i = late.indexOf(id);
  return i < 0 ? -1 : SWARM_BROOD_FAMILIES.length + i;
}

function slotsOf(engine, familyIndex) {
  const out = [];
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    if (engine._bodies.alive[i] && engine._bodies.family[i] === familyIndex) out.push(i);
  }
  return out;
}

test('the tables stay honest: catalog and late-family validators are clean', () => {
  assert.deepEqual(swarmCatalogIssues(), []);
  assert.deepEqual(swarmBroodLateIssues(), []);
});

test('waves below 24 keep the pre-band roster and cohort, identically, for a fixed seed', () => {
  assert.deepEqual(
    swarmRosterFor(23).map((e) => e.enemyId),
    PRE_BAND_ROSTER_IDS,
    'the wave-23 ship table is exactly the pre-band roster',
  );
  for (let w = 1; w <= 23; w++) {
    // A fixed seed reproduces the same plan twice — the band changed nothing the early
    // waves can reach, on either roster lane.
    const a = swarmPlan(w, 17);
    const b = swarmPlan(w, 17);
    assert.deepEqual(a, b, `wave ${w} is not deterministic`);
    assert.ok(!a.error, `wave ${w} plan valid`);
    for (const part of broodFold(w)) {
      assert.ok(!BAND_IDS.has(part.id), `wave ${w} folds ${part.id} before its gate`);
    }
  }
  assert.deepEqual(
    swarmBroodRosterFor(23).map((f) => f.id),
    ['mite', 'spitter', 'spore_drift', 'charger', 'lantern_cyst', 'leecher', 'glassback', 'wake_eel', 'bellows'],
    'the base brood clock is untouched',
  );
});

test('each band family folds into the cohort at its authored wave — and stays', () => {
  for (const band of BROOD_BAND) {
    assert.ok(!broodFold(band.fromWave - 1).some((p) => p.id === band.id),
      `${band.id} fields before wave ${band.fromWave}`);
    for (const w of [band.fromWave, band.fromWave + 3]) {
      const row = broodFold(w).find((p) => p.id === band.id);
      assert.ok(row, `wave ${w} plans no ${band.id}`);
      assert.ok(row.count >= 1 && row.count <= band.cohort,
        `wave ${w} ${band.id} count ${row.count} outside its cohort`);
    }
  }
});

test('the runtime owner fields every band family on a deep wave', () => {
  const h = bootEngine({ wave: 55 });
  h.engine.prepareWave(h.state.run, 55);
  h.engine.spawnWave(h.state);
  for (const band of BROOD_BAND) {
    const slots = slotsOf(h.engine, familyIndexOf(band.id));
    assert.ok(slots.length >= 1, `wave 55 spawns no ${band.id}`);
    assert.ok(slots.length <= band.cohort, `${band.id} exceeds its cohort`);
  }
});

test('the debut tell fires through the lane’s own machinery: the gloomcap telegraphs out of the rock', () => {
  const h = bootEngine({ wave: 37 });
  const fam = swarmBroodLateFamily('gloomcap');
  const idx = familyIndexOf('gloomcap');
  h.engine.prepareWave(h.state.run, 37);
  h.engine.spawnWave(h.state);
  const slot = slotsOf(h.engine, idx)[0];
  assert.ok(slot != null, 'wave 37 fields a gloomcap');
  assert.equal(h.engine._bodies.phase[slot], BROOD_PHASE_BURIED, 'it sleeps in the rock first');

  // A far pilot walks past: nothing yet. Then one step inside burstRange — the eruption IS
  // the debut telegraph, and it names the family in the lane's own {bark,line,cue} card.
  for (let t = 0; t < 30; t++) {
    h.state.simTime += DT;
    h.state.tick += 1;
    h.engine.step(h.state);
  }
  assert.ok(
    !h.emitted.some((e) => e.event === 'swarm:broodTelegraph' && e.payload.familyId === 'gloomcap'),
    'the sac telegraphed before the pilot was in range',
  );
  h.player.pos.x = h.rock.pos.x;
  h.player.pos.z = h.rock.pos.z + 20;
  h.state.simTime += DT;
  h.state.tick += 1;
  h.engine.step(h.state);
  const tele = h.emitted.find(
    (e) => e.event === 'swarm:broodTelegraph' && e.payload.familyId === 'gloomcap',
  );
  assert.ok(tele, 'the gloomcap never telegraphed its eruption');
  assert.equal(tele.payload.line, fam.telegraph.line, 'the tell carries the family’s authored line');
  assert.equal(tele.payload.bark, fam.telegraph.bark);
  assert.equal(tele.payload.cue, fam.telegraph.cue);
  assert.equal(h.engine._bodies.phase[slot], BROOD_PHASE_WINDUP, 'the tell commits the eruption');
});

test('the announce data carries each new arrival’s identity — per-family authored tells', () => {
  // The brood lane's debut card is the family telegraph + counter line, authored per entry.
  const lines = new Set();
  for (const band of BROOD_BAND) {
    const fam = swarmBroodLateFamily(band.id);
    assert.ok(fam, `${band.id} is not in the late table`);
    assert.ok(fam.name && typeof fam.name === 'string', `${band.id} has no display name`);
    const tele = fam.telegraph || {};
    for (const key of ['bark', 'line', 'cue']) {
      assert.ok(typeof tele[key] === 'string' && tele[key].length > 0,
        `${band.id} telegraph.${key} is empty`);
    }
    assert.ok(!lines.has(tele.line), `${band.id} reuses another family's tell`);
    lines.add(tele.line);
    assert.ok(typeof fam.counter === 'string' && fam.counter.length >= 10,
      `${band.id} has no counter line`);
  }
});

test('the band sits inside the authored quota, cap and population laws', () => {
  for (const w of [31, 37, 43, 49, 55]) {
    const plan = swarmPlan(w);
    assert.ok(!plan.error, `wave ${w}`);
    // The ship side is untouched: opening burst is exactly the authored pressure (a mass-gap
    // wall is the only lawful +N on the table), quota and concurrency hold their curves.
    const wall = plan.packages.filter((p) => p.wall === true).reduce((s, p) => s + p.count, 0);
    assert.equal(
      swarmOpeningCount(plan.packages),
      plan.swarm.openingPressure + wall,
      `wave ${w} opening budget grew`,
    );
    assert.equal(plan.swarm.killTarget, swarmQuota(w), `wave ${w} quota moved`);
    assert.ok(plan.swarm.concurrent <= SWARM_SPAWN_CAP, `wave ${w} concurrency exceeds the cap`);
    assert.equal(plan.swarm.newcomer, null, `wave ${w} ship slam is quiet — the band is brood-lane`);
  }
  for (const w of [...BROOD_BAND.map((b) => b.fromWave), 60]) {
    // The fodder-floor law lives on the base plan: specialists never exceed their authored
    // share, so the mite holds at least half the room before the late fold spends it.
    const base = swarmBroodPlan(w, mulberry32(4242 + w));
    const baseTotal = base.reduce((s, p) => s + p.count, 0);
    const baseMite = base.find((p) => p.id === 'mite');
    assert.ok(baseMite && baseMite.count >= baseTotal * 0.5, `wave ${w} lost the fodder floor`);
    // The late fold then spends mites — the population law it must honor is that the total
    // never grows and the fodder id never leaves the room entirely.
    const fold = foldBroodLatePlan(base, w);
    const total = fold.reduce((s, p) => s + p.count, 0);
    assert.equal(total, baseTotal, `wave ${w} brood population moved`);
    assert.equal(total, swarmBroodPopulation(w), `wave ${w} brood population law moved`);
    assert.ok(total >= SWARM_BROOD_MIN && total <= SWARM_BROOD_MAX,
      `wave ${w} brood total ${total} outside the band`);
    const mite = fold.find((p) => p.id === 'mite');
    assert.ok(mite && mite.count >= 1, `wave ${w} folded every last mite away`);
  }
});

test('nothing in the band scales: stock stats only, no multipliers', () => {
  assert.equal(SWARM_ROSTER.length, PRE_BAND_ROSTER_IDS.length,
    'the ship roster is exactly the pre-band table — no late hull was added');
  for (const band of BROOD_BAND) {
    const fam = swarmBroodLateFamily(band.id);
    const statLike = Object.keys(fam).filter((k) => /mult|scale|perwave|bonus|damage/i.test(k));
    assert.deepEqual(statLike, [], `${band.id} carries a scaling field: ${statLike}`);
    for (const key of ['hull', 'mass', 'speed', 'radius']) {
      assert.ok(Number.isFinite(fam[key]) && fam[key] > 0, `${band.id}.${key} is not a flat stat`);
    }
  }
});

test('the ten-clock stays clean: no band gate lands on a champion row', () => {
  for (const band of BROOD_BAND) {
    assert.ok(!isSwarmBossWave(band.fromWave),
      `${band.id} gates at wave ${band.fromWave}, a champion row`);
  }
  for (const w of [30, 40, 50, 60]) {
    const plan = swarmPlan(w);
    assert.ok(!plan.error, `wave ${w}`);
    assert.equal(plan.swarm.boss, true, `wave ${w} lost its champion`);
    assert.equal(swarmNewcomerFor(w), null, `wave ${w} shares its slam with a ship debut`);
  }
});
