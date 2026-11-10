// THE WORLD ANSWERS — C12 mining × pirates.
//
// A worked-out seam makes the lanes hungry: encounterDirector._accrue adds scarcityTerm * 0.35 to
// the combat pressure rate (scarcityTerm = the sector's weighted mean field depletion, 0..1, a
// pure function of state) and queues ONE rumor the first time the term crosses 0.5 in a sector.
//
//   node --test test/world-answers-c12-scarcity-ambush.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { sectorScarcityTerm, ensureFieldDepletionState } from '../src/systems/fieldDepletion.js';
import { tensionAccrualScale } from '../src/ai/tensionPolicy.js';

const SECTOR = 'sector_pallas_drift';
const OTHER = 'sector_ceres_belt';

function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [encounterDirector] });
  const { state, bus } = sim;
  const director = sim.registry.get('encounterDirector');
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 40,
    hull: 100, hullMax: 100, data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  const rumors = [];
  bus.on('encounter:scarcityRumor', (p) => rumors.push(p));
  return { sim, state, bus, director, player, rumors };
}

function deplete(state, sectorId, depletion, fieldId = `field_${sectorId}`) {
  const own = ensureFieldDepletionState(state);
  own.fields[fieldId] = { fieldId, sectorId, depletion, extractedU: 100 };
}

/** One accrual window: baseline update, then a single `stepS` second tick from a drained pool. */
function accrue(h, stepS = 5) {
  const dir = h.state.encounterDirector;
  h.state.simTime = 0;
  h.director.update(1, h.state); // baseline publish (director is a ~1 Hz calendar-clock owner)
  dir.pending = [];
  dir.pressure.combat = 0;
  h.state.simTime = stepS;
  h.director.update(1, h.state);
  return dir.pressure.combat;
}

test('scarcity term is a pure 0..1 read: zero without depletion, mean depletion with it', () => {
  const h = boot();
  assert.equal(sectorScarcityTerm(h.state, SECTOR), 0, 'no depletion container → exactly 0');
  assert.equal(h.state.fieldDepletion === undefined || Object.keys(h.state.fieldDepletion.fields || {}).length === 0, true);
  deplete(h.state, SECTOR, 0.8);
  assert.ok(Math.abs(sectorScarcityTerm(h.state, SECTOR) - 0.8) < 1e-9);
  assert.equal(sectorScarcityTerm(h.state, OTHER), 0, 'another sector is untouched');
  assert.equal(sectorScarcityTerm(h.state, SECTOR), sectorScarcityTerm(h.state, SECTOR), 'pure');
  deplete(h.state, SECTOR, 7); // out-of-range input clamps
  assert.equal(sectorScarcityTerm(h.state, SECTOR), 1);
  assert.equal(sectorScarcityTerm(null, SECTOR), 0);
  assert.equal(sectorScarcityTerm(h.state, null), 0);
});

test('a depleted sector accrues combat pressure faster than a fresh one by exactly term * 0.35', () => {
  const fresh = boot();
  const worked = boot();
  deplete(worked.state, SECTOR, 0.8);
  const stepS = 5;
  const a = accrue(fresh, stepS);
  const b = accrue(worked, stepS);
  assert.ok(b > a, `depleted ${b} > fresh ${a}`);
  const scale = tensionAccrualScale(worked.state, 'combat');
  assert.ok(Math.abs((b - a) - 0.8 * 0.35 * stepS * scale) < 1e-9,
    `delta ${b - a} == term*0.35*step*scale ${0.8 * 0.35 * stepS * scale}`);
});

test('with no depletion the term is exactly zero: a fresh run is untouched by C12', () => {
  const plain = boot();
  const empty = boot();
  ensureFieldDepletionState(empty.state); // container exists, no fields
  assert.equal(accrue(plain), accrue(empty), 'bit-identical pressure');
  assert.equal(plain.rumors.length + empty.rumors.length, 0);
});

test('the rumor fires once per sector, the first time the term crosses 0.5', () => {
  const h = boot();
  deplete(h.state, SECTOR, 0.4);
  accrue(h);
  assert.equal(h.rumors.length, 0, 'below 0.5 stays quiet');

  deplete(h.state, SECTOR, 0.6);
  accrue(h);
  assert.equal(h.rumors.length, 1);
  assert.equal(h.rumors[0].sectorId, SECTOR);
  assert.equal(h.rumors[0].text, 'Belts are worked out around here \u2014 the lanes are hungry.');
  assert.equal(h.state.encounterDirector.stats.scarcityRumored[SECTOR], true);

  accrue(h);
  accrue(h);
  assert.equal(h.rumors.length, 1, 'once, not every tick');

  // A second sector gets its own first crossing.
  h.state.world.currentSectorId = OTHER;
  deplete(h.state, OTHER, 0.9);
  accrue(h);
  assert.equal(h.rumors.length, 2);
  assert.equal(h.rumors[1].sectorId, OTHER);
});

test('same seed twice → same pressure and same rumor timing', () => {
  const run = () => {
    const h = boot(4242);
    deplete(h.state, SECTOR, 0.7);
    const p = accrue(h);
    return { p, rumors: h.rumors.map((r) => ({ ...r })), stats: structuredClone(h.state.encounterDirector.stats.scarcityRumored) };
  };
  assert.deepEqual(run(), run());
});

test('the rumor flag survives a malformed save (non-object ledger is dropped, not trusted)', () => {
  const h = boot();
  h.state.encounterDirector.stats.scarcityRumored = 'garbage';
  deplete(h.state, SECTOR, 0.9);
  assert.doesNotThrow(() => accrue(h));
  assert.equal(h.rumors.length, 1);
});
