// SF-164 / PB-CONS-D — a debt that can be paid through an appropriate job.
// The impound bill is the debt; the yard shift is the job. Working part of it and
// abandoning midway leaves an exact partial debt, the same labor cannot settle a
// different obligation, and the remainder still settles in credits at the clerk.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  IMPOUND_WORK_S,
  custodyConsequences,
  applyImpoundWork,
  impoundBillFor,
} from '../src/systems/custodyConsequences.js';
import { economy } from '../src/systems/economy.js';
import { heat, WANTED_TIER } from '../src/systems/heat.js';
import { lawSecurity, wantedImpoundFor } from '../src/systems/lawSecurity.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';

const SEED = 16400;
const SECTOR = 'sector_helios_prime';
const START_CREDITS = 5000;

function boot(seed = SEED, extra = {}) {
  const sim = createSimulation({
    seed,
    systems: [economy, heat, lawSecurity, custodyConsequences, spawnBudget],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  if (!state.world.sectors) state.world.sectors = {};
  state.world.sectors[SECTOR] = { id: SECTOR, factionId: 'faction_scn', security: 0.9, tier: 0 };
  state.player.heat = 0;
  state.player.credits = extra.credits != null ? extra.credits : START_CREDITS;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    rot: 0, hull: 200, hullMax: 200, radius: 8, mass: 28,
  });
  state.playerId = player.id;
  const recovered = [];
  const refused = [];
  const charges = [];
  bus.on('law:impoundRecovered', (p) => recovered.push(p));
  bus.on('law:impoundPayRefused', (p) => refused.push(p));
  bus.on('credits:changed', (p) => charges.push(p));
  return { sim, state, bus, player, recovered, refused, charges };
}

function killLawman(sim, state, id) {
  const player = state.entities && state.entities.get(state.playerId);
  const pos = player && player.pos ? player.pos : { x: 0, z: 0 };
  const eye = sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_scn',
    pos: { x: pos.x + 30, z: pos.z },
    hull: 80, hullMax: 80, radius: 8,
    data: { ai: { lawful: true }, witnessEye: true },
  });
  sim.bus.emit('entity:killed', {
    id,
    killerId: state.playerId,
    type: 'ship',
    victimClass: 'ship',
    factionId: 'faction_scn',
    factionLawful: true,
    targetHostileToPlayer: false,
  });
  eye.alive = false;
  eye.hull = 0;
}

function raiseToImpound(sim, state) {
  sim.bus.emit('faction:aggro', { isAggro: true, factionId: 'faction_scn' });
  killLawman(sim, state, 801);
  killLawman(sim, state, 802);
}

function liveEntity(state, flag) {
  return (state.entityList || []).find((e) => (
    e && e.alive !== false && e.data && e.data[flag] === true
  ));
}

test('SF-164: pay by service — abandon midway leaves an exact partial debt', () => {
  const t = boot(SEED);
  raiseToImpound(t.sim, t.state);
  t.sim.step();
  const bill = impoundBillFor(t.state);
  const owed = bill.owedCr;

  const yard = liveEntity(t.state, 'wantedImpoundYard');
  t.player.pos.x = yard.pos.x;
  t.player.pos.z = yard.pos.z;
  const quarterSteps = Math.round((IMPOUND_WORK_S * 0.25) / SIM_DT);
  for (let i = 0; i < quarterSteps; i++) t.sim.step();

  // Abandoned midway: walk off the pad. The debt stays open and says exactly
  // what is still owed — the relationship is not reset, not forgotten.
  t.player.pos.x = yard.pos.x + 5000;
  t.player.pos.z = yard.pos.z;
  for (let i = 0; i < 10; i++) t.sim.step();

  assert.equal(bill.status, 'open');
  const expected = owed - Math.round(owed * (bill.workS / bill.workNeedS));
  assert.equal(bill.remainingCr, expected, 'the outstanding obligation is exact');
  assert.ok(bill.remainingCr > 0 && bill.remainingCr < owed);
  assert.equal(t.state.player.credits, START_CREDITS, 'work is never a payout');
  assert.equal(wantedImpoundFor(t.state).open, true, 'the yard still holds the debt');
  t.sim.dispose();
});

test('SF-164: the same work cannot settle an unrelated debt', () => {
  const t = boot(SEED);
  raiseToImpound(t.sim, t.state);
  t.sim.step();
  const law = t.sim.registry.get('lawSecurity');
  const other = law.noteComposedObligation({
    kind: 'warrant', causeId: 'wanted:elsewhere:bounty', amountCr: 300, label: 'other warrant',
  });
  assert.equal(other.accepted, true);

  const yard = liveEntity(t.state, 'wantedImpoundYard');
  t.player.pos.x = yard.pos.x;
  t.player.pos.z = yard.pos.z;
  const steps = Math.ceil(IMPOUND_WORK_S / SIM_DT) + 2;
  for (let i = 0; i < steps; i++) t.sim.step();

  assert.equal(t.recovered.length, 1);
  assert.equal(t.recovered[0].method, 'work');
  const standing = law.composedDisposition().find((row) => row.causeId === 'wanted:elsewhere:bounty');
  assert.equal(standing.remainingCr, 300, 'impound labor only settles the impound bill');
  assert.equal(standing.status, 'open');
  t.sim.dispose();
});

test('SF-164: a shift event naming a different bill credits nothing', () => {
  const t = boot(SEED);
  raiseToImpound(t.sim, t.state);
  t.sim.step();
  const bill = impoundBillFor(t.state);
  const before = bill.remainingCr;
  applyImpoundWork(t.state, { dt: IMPOUND_WORK_S, billId: 'impound:somebody-else' });
  assert.equal(bill.remainingCr, before);
  assert.equal(bill.workS, 0);
  applyImpoundWork(t.state, { dt: 1, billId: bill.billId });
  assert.ok(bill.remainingCr < before, 'its own labor still credits');
  t.sim.dispose();
});

test('SF-164: partial work plus partial credits closes the debt once', () => {
  const t = boot(SEED, { credits: 400 });
  raiseToImpound(t.sim, t.state);
  t.sim.step();
  const bill = impoundBillFor(t.state);
  const owed = bill.owedCr;
  assert.ok(owed > 400, 'the fixture owes more than the pilot holds — money alone cannot cover it');

  // Money alone refuses: the pilot is short of the posted bill.
  const clerk = liveEntity(t.state, 'wantedImpoundClerk');
  t.player.pos.x = clerk.pos.x;
  t.player.pos.z = clerk.pos.z;
  t.sim.bus.emit('law:impoundPay', {});
  t.sim.step();
  assert.equal(t.refused.length, 1);
  assert.equal(t.refused[0].reason, 'short');
  assert.equal(t.recovered.length, 0);

  // Work the debt down until the held credits cover the remainder, then pay.
  const yard = liveEntity(t.state, 'wantedImpoundYard');
  t.player.pos.x = yard.pos.x;
  t.player.pos.z = yard.pos.z;
  let guard = Math.ceil(IMPOUND_WORK_S / SIM_DT) + 2;
  while (bill.remainingCr > t.state.player.credits && guard-- > 0 && bill.status === 'open') {
    t.sim.step();
  }
  assert.equal(bill.status, 'open', 'partial work does not close the debt early');
  const remainder = bill.remainingCr;
  assert.ok(remainder > 0 && remainder <= 400, 'the remainder is what the credits can cover');

  t.player.pos.x = clerk.pos.x;
  t.player.pos.z = clerk.pos.z;
  t.sim.bus.emit('law:impoundPay', {});
  t.sim.step();
  assert.equal(t.recovered.length, 1);
  assert.equal(t.recovered[0].method, 'pay');
  assert.equal(t.state.player.credits, 400 - remainder, 'only the unsettled remainder is charged');
  assert.equal(impoundBillFor(t.state).status, 'paid');
  assert.equal(t.state.player.wantedTier, WANTED_TIER.NONE);
  t.sim.dispose();
});
