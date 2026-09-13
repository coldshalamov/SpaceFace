// PQ-151.03 — impound is a yard with a bill. Pay it, work it off, or steal the hull.
// Clerk flies from a reserve. Leaving the search zone is not the escape.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { reserveArrivalPoint } from '../src/law/authorityResponse.js';
import {
  IMPOUND_RESTITUTION_CR,
  IMPOUND_WORK_S,
  custodyConsequences,
  impoundBillFor,
  quoteImpoundBill,
} from '../src/systems/custodyConsequences.js';
import { economy } from '../src/systems/economy.js';
import {
  heat,
  wantedTierFor,
  WANTED_TIER,
  WANTED_TIER_INFO,
} from '../src/systems/heat.js';
import {
  WANTED_IMPOUND_STANDOFF,
  lawSecurity,
  wantedImpoundFor,
} from '../src/systems/lawSecurity.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';

const SEED = 15130;
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
  const posted = [];
  const recovered = [];
  const refused = [];
  const charges = [];
  bus.on('law:impoundPosted', (p) => posted.push(p));
  bus.on('law:impoundRecovered', (p) => recovered.push(p));
  bus.on('law:impoundPayRefused', (p) => refused.push(p));
  bus.on('credits:changed', (p) => charges.push(p));
  return { sim, state, bus, player, posted, recovered, refused, charges };
}

function killLawman(bus, state, id) {
  bus.emit('entity:killed', {
    id,
    killerId: state.playerId,
    type: 'ship',
    victimClass: 'ship',
    factionId: 'faction_scn',
    factionLawful: true,
    targetHostileToPlayer: false,
  });
}

function raiseToImpound(bus, state) {
  // SCAN → NETS → IMPOUND. A first lawful kill alone lands in bounty and would
  // post a warrant hunter; start with the faction-hostile chip so the band
  // never sits on bounty.
  bus.emit('faction:aggro', { isAggro: true, factionId: 'faction_scn' });
  killLawman(bus, state, 701);
  killLawman(bus, state, 702);
}

function liveYard(state) {
  return (state.entityList || []).find((e) => (
    e && e.alive !== false && e.data && e.data.wantedImpoundYard === true
  ));
}

function liveLock(state) {
  return (state.entityList || []).find((e) => (
    e && e.alive !== false && e.data && e.data.wantedImpoundLock === true
  ));
}

function liveClerk(state) {
  return (state.entityList || []).find((e) => (
    e && e.alive !== false && e.data && e.data.wantedImpoundClerk === true
  ));
}

function snapshotMidPath(state) {
  return {
    heat: state.player.heat,
    credits: state.player.credits,
    ledger: structuredClone(state.player.custodyLedger),
  };
}

function restoreMidPath(state, snap) {
  state.player.heat = snap.heat;
  state.player.credits = snap.credits;
  state.player.custodyLedger = structuredClone(snap.ledger);
}

test('impound band is playable and names steal_ship_back as the escape', () => {
  assert.equal(WANTED_TIER_INFO.impound.playable, true);
  assert.equal(WANTED_TIER_INFO.impound.escape, 'steal_ship_back');
  assert.equal(wantedTierFor(0.81), WANTED_TIER.IMPOUND);
  assert.equal(IMPOUND_WORK_S > 0, true);
  assert.equal(IMPOUND_RESTITUTION_CR > 0, true);
});

test(`seed ${SEED}: impound posts a yard and a clerk from reserve`, () => {
  const { sim, state, player, posted } = boot(SEED);
  raiseToImpound(sim.bus, state);
  sim.step();

  assert.equal(state.player.wantedTier, WANTED_TIER.IMPOUND);
  const pound = wantedImpoundFor(state);
  assert.ok(pound, 'lawSecurity posts an impound yard in the impound band');
  assert.equal(pound.tier, WANTED_TIER.IMPOUND);
  assert.equal(pound.open, true);
  assert.equal(posted.length, 1);

  const yard = liveYard(state);
  assert.ok(yard, 'a physical yard sits in the world');
  assert.equal(yard.id, pound.yardId);
  const yardDist = Math.hypot(yard.pos.x - player.pos.x, yard.pos.z - player.pos.z);
  assert.ok(yardDist >= 200, `yard must be a place (dist ${yardDist}), not on the player`);
  assert.ok(Math.abs(yardDist - WANTED_IMPOUND_STANDOFF) < 1e-6);

  const clerk = liveClerk(state);
  assert.ok(clerk, 'a pound clerk staffs the yard');
  assert.equal(clerk.id, pound.clerkId);
  const expected = reserveArrivalPoint({
    anchor: state.player.heatZone.center,
    aggressorPos: player.pos,
    jurisdictionRadius: state.player.heatZone.radius,
    seed: SEED,
    incidentId: pound.poundId,
  });
  assert.deepEqual({ x: clerk.pos.x, z: clerk.pos.z }, expected);
  const clerkDist = Math.hypot(clerk.pos.x - player.pos.x, clerk.pos.z - player.pos.z);
  assert.ok(clerkDist >= 900, `clerk must fly from somewhere (dist ${clerkDist}), not spawn on the player`);
  assert.equal(clerk.vel.x, 0);
  assert.equal(clerk.vel.z, 0);

  const bill = impoundBillFor(state);
  assert.ok(bill, 'collateral has a bill');
  assert.equal(bill.status, 'open');
  assert.equal(bill.owedCr, quoteImpoundBill(state.player));
  assert.equal(bill.remainingCr, bill.owedCr);
  assert.ok(bill.owedCr >= 500, 'bill uses the insurance deductible as the floor');

  const hunters = (state.entityList || []).filter((e) => (
    e && e.data && e.data.wantedWarrant === true && e.data.bountyHunt && e.data.bountyHunt.pursuing
  ));
  assert.equal(hunters.length, 0, 'impound posts a yard, not a pursuing warrant hunter');
  sim.dispose();
});

test(`seed ${SEED}: leaving the search zone does not drop the impound band`, () => {
  const { sim, state, player } = boot(SEED);
  raiseToImpound(sim.bus, state);
  sim.step();
  const raised = state.player.heat;
  const zone = state.player.heatZone;
  player.pos.x = zone.center.x + zone.radius + 80;
  player.pos.z = zone.center.z;
  const waitS = (zone.clearAfterS || 10) + 2;
  for (let i = 0; i < Math.ceil(waitS / SIM_DT) + 2; i++) sim.step();

  assert.equal(state.player.wantedTier, WANTED_TIER.IMPOUND, 'the pound is not a cone you slip');
  assert.equal(state.player.heat, raised);
  assert.equal(impoundBillFor(state).status, 'open');
  sim.dispose();
});

test(`seed ${SEED}: pay the bill at the clerk — economy writes credits, heat clears`, () => {
  const { sim, state, player, recovered, charges } = boot(SEED);
  raiseToImpound(sim.bus, state);
  sim.step();
  const bill = impoundBillFor(state);
  const owed = bill.owedCr;
  const clerk = liveClerk(state);
  player.pos.x = clerk.pos.x;
  player.pos.z = clerk.pos.z;
  sim.bus.emit('law:impoundPay', {});
  sim.step();

  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].accepted, true);
  assert.equal(recovered[0].source, 'lawSecurity');
  assert.equal(recovered[0].method, 'pay');
  assert.equal(state.player.credits, START_CREDITS - owed);
  assert.ok(charges.some((c) => c.reason === 'impound:pay' && c.delta === -owed));
  assert.equal(impoundBillFor(state).status, 'paid');
  assert.equal(state.player.wantedTier, WANTED_TIER.NONE);
  assert.equal(state.player.heat, 0);
  sim.dispose();
});

test(`seed ${SEED}: short credits at the clerk refuse — hull stays in the pound`, () => {
  const { sim, state, player, recovered, refused } = boot(SEED, { credits: 10 });
  raiseToImpound(sim.bus, state);
  sim.step();
  const clerk = liveClerk(state);
  player.pos.x = clerk.pos.x;
  player.pos.z = clerk.pos.z;
  sim.bus.emit('law:impoundPay', {});
  sim.step();

  assert.equal(recovered.length, 0);
  assert.equal(refused.length, 1);
  assert.equal(refused[0].reason, 'short');
  assert.equal(state.player.credits, 10);
  assert.equal(state.player.wantedTier, WANTED_TIER.IMPOUND);
  assert.equal(impoundBillFor(state).status, 'open');
  sim.dispose();
});

test(`seed ${SEED}: work the bill off at the yard — credits untouched, heat clears`, () => {
  const { sim, state, player, recovered } = boot(SEED);
  raiseToImpound(sim.bus, state);
  sim.step();
  const yard = liveYard(state);
  player.pos.x = yard.pos.x;
  player.pos.z = yard.pos.z;
  const credits = state.player.credits;
  const steps = Math.ceil(IMPOUND_WORK_S / SIM_DT) + 2;
  for (let i = 0; i < steps; i++) sim.step();

  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].method, 'work');
  assert.equal(state.player.credits, credits, 'labor is not a purchase');
  assert.equal(impoundBillFor(state).status, 'worked');
  assert.equal(state.player.wantedTier, WANTED_TIER.NONE);
  assert.equal(state.player.heat, 0);
  sim.dispose();
});

test(`seed ${SEED}: steal the hull at the lock — escape is a verb, clerk never teleports`, () => {
  const { sim, state, player, recovered } = boot(SEED);
  raiseToImpound(sim.bus, state);
  sim.step();
  const clerk = liveClerk(state);
  const clerkStart = { x: clerk.pos.x, z: clerk.pos.z };
  const lock = liveLock(state);
  assert.ok(lock, 'the pound has a clamp lock to cut');
  player.pos.x = lock.pos.x;
  player.pos.z = lock.pos.z;
  const credits = state.player.credits;
  sim.step();

  assert.equal(recovered.length, 1);
  assert.equal(recovered[0].method, 'steal');
  assert.equal(recovered[0].accepted, true);
  assert.equal(state.player.credits, credits, 'the heist does not buy the hull');
  assert.equal(impoundBillFor(state).status, 'stolen');
  assert.notEqual(state.player.wantedTier, WANTED_TIER.IMPOUND);
  assert.ok(state.player.heat < 0.81, 'steal-back leaves the impound band');
  const clerkNow = state.entities.get(clerk.id);
  assert.ok(clerkNow && clerkNow.alive !== false);
  assert.deepEqual({ x: clerkNow.pos.x, z: clerkNow.pos.z }, clerkStart);
  const stillOnNose = Math.hypot(clerkNow.pos.x - player.pos.x, clerkNow.pos.z - player.pos.z);
  assert.ok(stillOnNose >= 900, `clerk stays at reserve (dist ${stillOnNose}), never teleports onto the player`);
  sim.dispose();
});

test(`seed ${SEED}: save round-trips mid-pay, then the clerk still takes the bill`, () => {
  const first = boot(SEED);
  raiseToImpound(first.sim.bus, first.state);
  first.sim.step();
  const clerk = liveClerk(first.state);
  first.player.pos.x = clerk.pos.x;
  first.player.pos.z = clerk.pos.z;
  first.sim.step();
  const snap = snapshotMidPath(first.state);
  assert.equal(snap.ledger.impound.status, 'open');
  assert.equal(first.recovered.length, 0);
  first.sim.dispose();

  const second = boot(SEED);
  restoreMidPath(second.state, snap);
  second.sim.step();
  const clerk2 = liveClerk(second.state);
  assert.ok(clerk2, 'the pound re-posts after Continue');
  second.player.pos.x = clerk2.pos.x;
  second.player.pos.z = clerk2.pos.z;
  second.sim.bus.emit('law:impoundPay', {});
  second.sim.step();

  assert.equal(second.recovered.length, 1);
  assert.equal(second.recovered[0].method, 'pay');
  assert.equal(impoundBillFor(second.state).status, 'paid');
  assert.equal(second.state.player.wantedTier, WANTED_TIER.NONE);
  second.sim.dispose();
});

test(`seed ${SEED}: save round-trips mid-shift, then the remaining labor finishes`, () => {
  const first = boot(SEED);
  raiseToImpound(first.sim.bus, first.state);
  first.sim.step();
  const yard = liveYard(first.state);
  first.player.pos.x = yard.pos.x;
  first.player.pos.z = yard.pos.z;
  const half = Math.ceil((IMPOUND_WORK_S * 0.5) / SIM_DT);
  for (let i = 0; i < half; i++) first.sim.step();
  const snap = snapshotMidPath(first.state);
  assert.ok(snap.ledger.impound.workS > 0, 'the shift has started');
  assert.ok(snap.ledger.impound.workS < IMPOUND_WORK_S, 'the shift is not finished');
  assert.equal(snap.ledger.impound.status, 'open');
  first.sim.dispose();

  const second = boot(SEED);
  restoreMidPath(second.state, snap);
  second.sim.step();
  const yard2 = liveYard(second.state);
  assert.ok(yard2, 'the yard is still a place after Continue');
  assert.deepEqual(
    { x: yard2.pos.x, z: yard2.pos.z },
    { x: snap.ledger.impound.yard.x, z: snap.ledger.impound.yard.z },
  );
  second.player.pos.x = yard2.pos.x;
  second.player.pos.z = yard2.pos.z;
  const rest = Math.ceil(IMPOUND_WORK_S / SIM_DT) + 2;
  for (let i = 0; i < rest; i++) second.sim.step();

  assert.equal(second.recovered.length, 1);
  assert.equal(second.recovered[0].method, 'work');
  assert.equal(impoundBillFor(second.state).status, 'worked');
  assert.equal(second.state.player.wantedTier, WANTED_TIER.NONE);
  second.sim.dispose();
});

test(`seed ${SEED}: save round-trips at the lock, then the heist still cuts`, () => {
  const first = boot(SEED);
  raiseToImpound(first.sim.bus, first.state);
  first.sim.step();
  const lock = liveLock(first.state);
  const snap = snapshotMidPath(first.state);
  assert.equal(snap.ledger.impound.status, 'open');
  first.sim.dispose();

  const second = boot(SEED);
  restoreMidPath(second.state, snap);
  second.sim.step();
  const lock2 = liveLock(second.state);
  assert.ok(lock2);
  second.player.pos.x = lock2.pos.x;
  second.player.pos.z = lock2.pos.z;
  second.sim.step();

  assert.equal(second.recovered.length, 1);
  assert.equal(second.recovered[0].method, 'steal');
  assert.equal(impoundBillFor(second.state).status, 'stolen');
  assert.notEqual(second.state.player.wantedTier, WANTED_TIER.IMPOUND);
  second.sim.dispose();
});
