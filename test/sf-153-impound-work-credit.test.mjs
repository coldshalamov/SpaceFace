// SF-153 / PB-CONS-D — restitution that repairs something real.
// The impound bill is a visible recovery at the pound: pay it, work it off, or mix
// them. Work credits the bill as it accrues — half a shift owes half the price —
// so the clerk's money door stays open on the remainder. The bill closes once,
// and repeating the shift or reloading the ledger cannot mint credit past the debt.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  IMPOUND_WORK_S,
  custodyConsequences,
  applyImpoundWork,
  impoundBillFor,
  quoteImpoundBill,
} from '../src/systems/custodyConsequences.js';
import { economy } from '../src/systems/economy.js';
import { heat, wantedTierFor, WANTED_TIER } from '../src/systems/heat.js';
import { lawSecurity, wantedImpoundFor } from '../src/systems/lawSecurity.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';

const SEED = 15300;
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
  const charges = [];
  bus.on('law:impoundRecovered', (p) => recovered.push(p));
  bus.on('credits:changed', (p) => charges.push(p));
  return { sim, state, bus, player, recovered, charges };
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
  killLawman(sim, state, 701);
  killLawman(sim, state, 702);
}

function liveEntity(state, flag) {
  return (state.entityList || []).find((e) => (
    e && e.alive !== false && e.data && e.data[flag] === true
  ));
}

function workYardSeconds(t, seconds) {
  const steps = Math.round(seconds / SIM_DT);
  for (let i = 0; i < steps; i++) t.sim.step();
}

test('SF-153: half a shift credits half the bill — the remainder is still payable', () => {
  const t = boot(SEED);
  raiseToImpound(t.sim, t.state);
  t.sim.step();
  const bill = impoundBillFor(t.state);
  const owed = bill.owedCr;
  assert.equal(bill.remainingCr, owed);

  const yard = liveEntity(t.state, 'wantedImpoundYard');
  t.player.pos.x = yard.pos.x;
  t.player.pos.z = yard.pos.z;
  workYardSeconds(t, IMPOUND_WORK_S / 2);

  // Accepted work is visible on the debt itself: the outstanding amount is exact,
  // not a binary open-or-closed flag.
  assert.ok(bill.workS > 0 && bill.workS < bill.workNeedS, 'the shift is genuinely part-done');
  assert.ok(bill.remainingCr < owed, 'work credits the bill as it accrues');
  assert.ok(bill.remainingCr > 0, 'a half shift is not a paid bill');
  const remaining = bill.remainingCr;
  assert.equal(remaining, owed - Math.round(owed * (bill.workS / bill.workNeedS)));

  // Combine work with money: the clerk charges the remainder, not the posted price.
  const clerk = liveEntity(t.state, 'wantedImpoundClerk');
  t.player.pos.x = clerk.pos.x;
  t.player.pos.z = clerk.pos.z;
  t.sim.bus.emit('law:impoundPay', {});
  t.sim.step();

  assert.equal(t.recovered.length, 1, 'the bill closes once');
  assert.equal(t.recovered[0].method, 'pay');
  assert.equal(t.state.player.credits, START_CREDITS - remaining, 'only the worked-off remainder is charged');
  assert.equal(impoundBillFor(t.state).status, 'paid');
  assert.equal(t.state.player.heat, 0);
  t.sim.dispose();
});

test('SF-153: a finished shift still closes the bill with no credits touched', () => {
  const t = boot(SEED);
  raiseToImpound(t.sim, t.state);
  t.sim.step();
  const yard = liveEntity(t.state, 'wantedImpoundYard');
  t.player.pos.x = yard.pos.x;
  t.player.pos.z = yard.pos.z;
  const steps = Math.ceil(IMPOUND_WORK_S / SIM_DT) + 2;
  for (let i = 0; i < steps; i++) t.sim.step();

  assert.equal(t.recovered.length, 1);
  assert.equal(t.recovered[0].method, 'work');
  assert.equal(t.state.player.credits, START_CREDITS, 'labor is not a purchase');
  assert.equal(impoundBillFor(t.state).remainingCr, 0);
  assert.equal(t.state.player.wantedTier, WANTED_TIER.NONE);
  t.sim.dispose();
});

test('SF-153: replayed work on a closed bill cannot mint credit — neither can a reload', () => {
  const t = boot(SEED);
  raiseToImpound(t.sim, t.state);
  t.sim.step();
  const yard = liveEntity(t.state, 'wantedImpoundYard');
  t.player.pos.x = yard.pos.x;
  t.player.pos.z = yard.pos.z;
  const steps = Math.ceil(IMPOUND_WORK_S / SIM_DT) + 2;
  for (let i = 0; i < steps; i++) t.sim.step();
  assert.equal(impoundBillFor(t.state).status, 'worked');

  // The shift keeps firing while the hull stands on the pad; a closed bill does not move.
  const settled = impoundBillFor(t.state);
  applyImpoundWork(t.state, { dt: 1, billId: settled.billId });
  applyImpoundWork(t.state, { dt: 1 });
  assert.equal(settled.remainingCr, 0);
  assert.equal(settled.status, 'worked');
  assert.equal(t.state.player.credits, START_CREDITS);
  t.sim.dispose();
});

test('SF-153: a mid-shift reload keeps the exact remainder — work resumes, never restarts', () => {
  const first = boot(SEED);
  raiseToImpound(first.sim, first.state);
  first.sim.step();
  const yard = liveEntity(first.state, 'wantedImpoundYard');
  first.player.pos.x = yard.pos.x;
  first.player.pos.z = yard.pos.z;
  workYardSeconds(first, IMPOUND_WORK_S * 0.5);
  const snap = {
    heat: first.state.player.heat,
    credits: first.state.player.credits,
    ledger: structuredClone(first.state.player.custodyLedger),
  };
  const earnedRemaining = snap.ledger.impound.remainingCr;
  assert.ok(earnedRemaining > 0 && earnedRemaining < snap.ledger.impound.owedCr,
    'the saved ledger carries the exact partial debt');
  first.sim.dispose();

  const second = boot(SEED);
  second.state.player.heat = snap.heat;
  second.state.player.credits = snap.credits;
  second.state.player.custodyLedger = structuredClone(snap.ledger);
  second.sim.step();
  const bill2 = impoundBillFor(second.state);
  assert.equal(bill2.remainingCr, earnedRemaining, 'reload cannot re-raise the debt');
  assert.equal(bill2.workS, snap.ledger.impound.workS, 'the shift is not restarted');
  const yard2 = liveEntity(second.state, 'wantedImpoundYard');
  second.player.pos.x = yard2.pos.x;
  second.player.pos.z = yard2.pos.z;
  const rest = Math.ceil(IMPOUND_WORK_S / SIM_DT) + 2;
  for (let i = 0; i < rest; i++) second.sim.step();
  assert.equal(second.recovered.length, 1);
  assert.equal(second.recovered[0].method, 'work');
  assert.equal(impoundBillFor(second.state).status, 'worked');
  assert.equal(second.state.player.credits, START_CREDITS);
  second.sim.dispose();
});

test('SF-153: the debt does not outgrow the obligation — credit is capped at the bill', () => {
  const t = boot(SEED);
  raiseToImpound(t.sim, t.state);
  t.sim.step();
  const bill = impoundBillFor(t.state);
  // Direct owner-level exercise: work applied past completion can never go negative
  // or produce payout — the cap is the obligation itself.
  bill.workS = bill.workNeedS;
  applyImpoundWork(t.state, { dt: 5, billId: bill.billId });
  assert.equal(bill.remainingCr, 0);
  assert.equal(bill.workS, bill.workNeedS);
  assert.equal(t.state.player.credits, START_CREDITS);
  t.sim.dispose();
});
