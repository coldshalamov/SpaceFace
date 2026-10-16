// Cargo loss had words and no ear: a cracked fragile hold, a vented volatile pod and a netted pod
// reached the player as text. Seed 4242, no AudioContext; real createBus + audio.init, play stubbed.
//
// What the live emitters already do (measured here, not assumed):
//  - volatileExposure publishes the 'venting' stage (sfx_explosion_small, worldFeelSeams) BEFORE it
//    vents or ruptures, and a rupture also sends audio:cue sfx_explosion_small. So a rupture is
//    already two explosions and a vent already has its pop; this unit adds the gas hiss to the
//    vent and ONLY a caption to the rupture (a third explosion would stutter).
import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import { createBus } from '../src/core/eventBus.js';
import { audio } from '../src/audio/audioSystem.js';
import {
  CARGO_LOSS_SEAM_IDS,
  WORLD_FEEL_SEAM_IDS,
  admitCargoLossSeam,
  cargoLossCue,
  cargoLossRelevant,
} from '../src/audio/worldFeelSeams.js';

const SEED = 4242;
const RECIPE_IDS = new Set(RECIPES.map((row) => row.id));

function boot() {
  const pilot = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } };
  const pod = { id: 9, type: 'payload', alive: true, pos: { x: 30, z: 10 } };
  const farPod = { id: 10, type: 'payload', alive: true, pos: { x: 2000, z: 0 } };
  const state = {
    tick: 600,
    simTime: 10,
    mode: 'flight',
    playerId: 1,
    player: { heat: 0 },
    meta: { seed: SEED },
    settings: { video: {}, accessibility: { captions: true } },
    world: { currentSectorId: 'sector_helios', sectors: {} },
    entities: new Map([[1, pilot], [9, pod], [10, farPod]]),
    entityList: [pilot, pod, farPod],
  };
  const bus = createBus();
  const ear = Object.create(audio);
  const plays = [];
  const captions = [];
  bus.on('presentation:caption', (p) => captions.push(p));
  ear.init({ state, bus, helpers: {} });
  ear.play = (recipeId, opts) => { plays.push({ recipeId, opts }); return { recipeId }; };
  return { state, bus, ear, plays, captions };
}

const FRAGILE = Object.freeze({
  items: [{ commodityId: 'cmdty_glass', name: 'Glass', qty: 4, valueCr: 200 }],
  totalQty: 4,
  totalValueCr: 200,
  totalSpilledQty: 2,
});

test('the four loss events are their own list and the three original seams are untouched', () => {
  assert.deepEqual([...CARGO_LOSS_SEAM_IDS], [
    'cargo:fragileLost', 'cargo:volatileVent', 'cargo:volatileRupture', 'cargo:caughtByNet',
  ]);
  assert.deepEqual([...WORLD_FEEL_SEAM_IDS], ['mining:beamLocked', 'flight:sweptHull', 'cargo:volatileExposed']);
  for (const id of CARGO_LOSS_SEAM_IDS) {
    const cue = cargoLossCue(id);
    assert.ok(cue, id);
    if (cue.recipeId) assert.ok(RECIPE_IDS.has(cue.recipeId), `${id} -> ${cue.recipeId} is authored`);
    assert.ok(cue.caption && !/[a-z]+[A-Z_]/.test(cue.caption), `${id} caption is plain words`);
  }
});

test('a cracked fragile hold plays the crack once and captions it', () => {
  const { bus, ear, plays, captions } = boot();
  try {
    bus.emit('cargo:fragileLost', FRAGILE);
    bus.flush();
    assert.deepEqual(plays.map((row) => row.recipeId), ['sfx_swarm_chain_shatter']);
    assert.equal(plays[0].opts.gain, 0.55);
    assert.equal(plays[0].opts.position, null, 'it is the pilot own hold, heard at the hull');
    assert.deepEqual(captions.map((row) => row.text), ['Fragile cargo cracked.']);
    assert.equal(captions[0].assertive, true);
  } finally {
    ear.destroy();
  }
});

test('fragile receipts are throttled per hold, then speak again', () => {
  const { state, bus, ear, plays } = boot();
  try {
    bus.emit('cargo:fragileLost', FRAGILE);
    bus.flush();
    state.tick += 10;
    bus.emit('cargo:fragileLost', FRAGILE);
    bus.flush();
    assert.equal(plays.length, 1, 'inside the gap');
    state.tick += 15;
    bus.emit('cargo:fragileLost', FRAGILE);
    bus.flush();
    assert.equal(plays.length, 2, 'after the gap');
    state.tick = 5; // a restore rewinds the sim clock: fresh book
    bus.emit('cargo:fragileLost', FRAGILE);
    bus.flush();
    assert.equal(plays.length, 3);
  } finally {
    ear.destroy();
  }
});

test('silence: an empty or malformed fragile receipt', () => {
  const { bus, ear, plays } = boot();
  try {
    bus.emit('cargo:fragileLost', { items: [], totalQty: 0 });
    bus.emit('cargo:fragileLost', null);
    bus.emit('cargo:fragileLost', {});
    bus.flush();
    assert.deepEqual(plays, []);
  } finally {
    ear.destroy();
  }
});

test('a vent adds the gas hiss at the pod, once, under the existing venting pop', () => {
  const { state, bus, ear, plays, captions } = boot();
  try {
    // The exact order volatileExposure emits: stage first, then the vent receipt.
    bus.emit('cargo:volatileExposed', { podId: 9, commodityId: 'cmdty_fuel_cells', amount: 12, load: 0.9, stage: 'venting', cause: 'shock', t: 10 });
    bus.emit('cargo:volatileVent', { podId: 9, ventedPodId: 20, commodityId: 'cmdty_fuel_cells', ventedQty: 4, remainingQty: 8, load: 0.5, vents: 1, pos: { x: 30, z: 10 } });
    bus.emit('cargo:volatileVent', { podId: 9, ventedPodId: 20, commodityId: 'cmdty_fuel_cells', ventedQty: 4, remainingQty: 8, load: 0.5, vents: 1, pos: { x: 30, z: 10 } });
    bus.flush();
    assert.deepEqual(plays.map((row) => row.recipeId), ['sfx_explosion_small', 'sfx_mining_gas_hazard']);
    const hiss = plays[1];
    assert.equal(hiss.opts.gain, 0.5);
    assert.deepEqual(hiss.opts.position, { x: 30, z: 10 });
    assert.deepEqual(captions.map((row) => row.text), ['Volatile cargo venting.', 'Cargo gas boiling off.']);
    state.tick += 40;
    bus.emit('cargo:volatileVent', { podId: 9, pos: { x: 30, z: 10 } });
    bus.flush();
    assert.equal(plays.length, 3, 'a later vent of the same pod is a new event');
  } finally {
    ear.destroy();
  }
});

test('a rupture adds a caption and NO extra voice: it is already voiced twice upstream', () => {
  const { bus, ear, plays, captions } = boot();
  try {
    // The exact emit shapes in volatileExposure._rupturePod: stage, receipt, then audio:cue.
    bus.emit('cargo:volatileExposed', { podId: 9, commodityId: 'cmdty_fuel_cells', amount: 8, load: 0.95, stage: 'venting', cause: 'shock', t: 12 });
    bus.emit('cargo:volatileRupture', { podId: 9, class: 'explosive', commodityId: 'cmdty_fuel_cells', destroyedQty: 8, pos: { x: 30, z: 10 }, cause: 'exposure' });
    bus.emit('audio:cue', { id: 'sfx_explosion_small', gain: 0.45 });
    bus.flush();
    const ids = plays.map((row) => row.recipeId);
    assert.deepEqual(ids, ['sfx_explosion_small', 'sfx_explosion_small'],
      'the venting pop and the rupture audio:cue are the only voices; worldFeel adds none');
    assert.deepEqual(captions.map((row) => row.text), ['Volatile cargo venting.', 'Volatile cargo ruptured.']);
    assert.equal(captions[1].assertive, true);
    assert.equal(cargoLossCue('cargo:volatileRupture').recipeId, null);
  } finally {
    ear.destroy();
  }
});

test('a netted pod plays a low collected tick at the pod and captions it', () => {
  const { state, bus, ear, plays, captions } = boot();
  try {
    bus.emit('cargo:caughtByNet', { podId: 9, netId: 77 });
    bus.emit('cargo:caughtByNet', { podId: 9, netId: 77 });
    bus.flush();
    assert.deepEqual(plays.map((row) => row.recipeId), ['sfx_loot_collect']);
    assert.equal(plays[0].opts.gain, 0.3);
    assert.deepEqual(plays[0].opts.position, { x: 30, z: 10 });
    assert.deepEqual(captions.map((row) => row.text), ['Cargo pod netted.']);
    assert.equal(state.entities.get(9).alive, true);
  } finally {
    ear.destroy();
  }
});

test('far pods are not the pilot ear; a tethered pod always is', () => {
  const { state, bus, ear, plays } = boot();
  try {
    bus.emit('cargo:caughtByNet', { podId: 10, netId: 77 });
    bus.emit('cargo:volatileVent', { podId: 10, pos: { x: 2000, z: 0 } });
    bus.emit('cargo:volatileRupture', { podId: 10, pos: { x: 2000, z: 0 } });
    bus.emit('cargo:caughtByNet', { podId: 404, netId: 1 });
    bus.emit('cargo:volatileVent', {});
    bus.flush();
    assert.deepEqual(plays, [], 'remote, unknown, and pod-less receipts are silent');
    state.player.tether = { active: true, targetId: 10 };
    assert.equal(cargoLossRelevant(state, 'cargo:volatileVent', { podId: 10, pos: { x: 2000, z: 0 } }), true);
  } finally {
    ear.destroy();
  }
});

test('admission is tick-based, keyed per pod, and refuses a non-finite tick', () => {
  const book = Object.create(null);
  assert.equal(admitCargoLossSeam(book, 'cargo:volatileVent', { podId: 1 }, NaN), false);
  assert.equal(admitCargoLossSeam(book, 'cargo:volatileVent', { podId: 1 }, 100), true);
  assert.equal(admitCargoLossSeam(book, 'cargo:volatileVent', { podId: 1 }, 110), false);
  assert.equal(admitCargoLossSeam(book, 'cargo:volatileVent', { podId: 2 }, 110), true, 'another pod');
  assert.equal(admitCargoLossSeam(book, 'cargo:volatileRupture', { podId: 1 }, 110), true, 'another event, same pod');
  assert.equal(admitCargoLossSeam(book, 'cargo:volatileVent', { podId: 1 }, 130), true);
  assert.equal(admitCargoLossSeam(book, 'cargo:volatileExposed', { podId: 1, stage: 'venting' }, 200), false,
    'the original seams are not admitted through this list');
});

test('volatileExposed keeps its stage ladder exactly as before', () => {
  const { state, bus, ear, plays } = boot();
  try {
    for (const stage of ['warming', 'critical', 'venting']) {
      state.tick += 20;
      bus.emit('cargo:volatileExposed', { podId: 9, stage });
      bus.flush();
    }
    assert.deepEqual(plays.map((row) => row.recipeId), [
      'sfx_mining_fracture_warning',
      'sfx_mining_fracture_break',
      'sfx_explosion_small',
    ]);
  } finally {
    ear.destroy();
  }
});
