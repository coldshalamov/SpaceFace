// NXB-043 — one local shortage creates competing real jobs without multiplying the population.
//
// The SF-290 seam proved a single starved yard posts one feed run. This file pins the
// competition the packet adds on top:
//   1. when the SAME feedstock starves two reachable yards, one dock evaluation boards TWO
//      rival-tagged rows so the player can read the tradeoff — the freight is real
//      (preloadedCargo:false), so the same physical lot cannot land in both markets;
//   2. delivering to one berth changes that real consumer (stock write across the starvation
//      threshold) and the surviving row admits the duel collapsed through the live demand
//      fact instead of replaying the original emergency (NXI-171);
//   3. a partial relief re-quotes the surviving row's quantity/reward from the live deficit;
//   4. repeated docks — same epoch and later epochs — never multiply rows, and no worker or
//      entity is spawned for the shortage or its relief (NXI-172);
//   5. counterexamples: a single starving yard still posts the lone sealed run (no pair),
//      and a delivery of the WRONG commodity feeds nothing and retires nothing.
//
// Small-yard markets (baseEq 24) keep the numbers legible: the same hopper math, at a scale
// where one delivery can actually fill it. Fixed seed throughout; epochs are simTime/600.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { economy, starvedIndustryNeedFor } from '../src/systems/economy.js';
import { economyContracts } from '../src/systems/economyContracts.js';
import { missions } from '../src/systems/missions.js';
import { addCargo } from '../src/systems/cargo.js';

const SEED = 43430;
const INPUT = 'cmdty_ore_iron';
const YARD_BASE_EQ = 24;
// Belt Outpost (mining) sits in the Ceres Belt region: it can see Ceres Refinery in its own
// sector and the Hyperion Cut refinery one sector over — two existing ore consumers.
const BROKER = 'station_beltout';
const YARD_A = 'station_ceres';        // refinery, tier 1 — refine_iron is its only leg
const YARD_A_TIER = 1;
const YARD_B = 'station_hyperion_cut'; // refinery, tier 2 sector — the same iron leg
const YARD_B_TIER = 2;

function boot(seed = SEED) {
  const sim = createSimulation({ seed, systems: [economy, missions, economyContracts] });
  const { state } = sim;
  state.mode = 'flight';
  state.simTime = 30; // epoch 0 (refreshSec 600)
  state.onboarding = { active: false, finished: true };
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 90, capMass: 90 };
  return sim;
}

function starve(sim, stationId, fill = 0.06) {
  const econ = sim.registry.get('economy');
  const market = econ.ensureMarket(stationId);
  market[INPUT].baseEq = YARD_BASE_EQ; // a small yard's equilibrium — legible hopper math
  market[INPUT].stock = market[INPUT].baseEq * fill;
  return market;
}

function needAt(sim, stationId, tier) {
  return starvedIndustryNeedFor('refinery', tier, sim.state.economy.markets[stationId]);
}

function starvedRows(board) {
  return (board && board.slots || []).filter((o) => o
    && o.source === 'economyContract'
    && o.cause && o.cause.tag === 'industry_starved');
}

function entityCount(sim) {
  let n = 0;
  for (const e of sim.state.entities.values()) if (e && e.alive !== false) n += 1;
  return n;
}

// ── 1. The pair: two real consumers, one finite supply ───────────────────────────────────────

test('one shortage, two starving yards → two competing bids board on one evaluation', () => {
  const sim = boot();
  const { state, bus } = sim;
  starve(sim, YARD_A, 0.05);
  starve(sim, YARD_B, 0.10);

  bus.emit('dock:docked', { stationId: BROKER });
  const rows = starvedRows(state.missions.boards[BROKER]);
  assert.equal(rows.length, 2, 'one evaluation posts both rival bids, no third row');

  const byDest = new Map(rows.map((o) => [o.destStationId, o]));
  assert.ok(byDest.has(YARD_A) && byDest.has(YARD_B),
    'the bids point at the two real starving yards');
  for (const [destId, offer] of byDest) {
    assert.equal(offer.params.cmdtyId, INPUT, 'the bid names the same real input leg');
    assert.equal(offer.preloadedCargo, false,
      'a contested bid calls for REAL freight — sealed cargo would conjure its own supply');
    assert.equal(offer.cause.rivalStationId, destId === YARD_A ? YARD_B : YARD_A,
      'each row names the other berth it is bidding against');
    assert.match(offer.summary, /bidding|wants the same/i, 'the row admits the competition');
    assert.ok(offer.params.qty >= 1 && offer.params.qty <= 20, 'the ask is a bounded lot');
    assert.notEqual(offer.id, byDest.get(destId === YARD_A ? YARD_B : YARD_A).id,
      'the two rows carry distinct stable ids');
  }
  // The posted ask quotes the live deficit — real demand, not a rolled number.
  const deficitA = needAt(sim, YARD_A, YARD_A_TIER).deficitUnits;
  assert.equal(byDest.get(YARD_A).params.qty, Math.min(20, deficitA),
    'yard A\'s ask is its live hopper deficit (capped at the posting bound)');

  // Re-docking inside the same epoch is silent — the pair does not multiply.
  bus.emit('dock:docked', { stationId: BROKER });
  bus.emit('dock:docked', { stationId: BROKER });
  assert.equal(starvedRows(state.missions.boards[BROKER]).length, 2,
    'repeat docks never multiply the pair');
});

// ── 2. The tradeoff resolves through real delivery ───────────────────────────────────────────

test('delivering to one berth feeds that consumer and collapses the rival row\'s bid', () => {
  const sim = boot();
  const { state, bus } = sim;
  starve(sim, YARD_A, 0.05);
  starve(sim, YARD_B, 0.10);
  const entitiesBefore = entityCount(sim);
  const completedEvents = [];
  bus.on('mission:completed', (p) => completedEvents.push(p));

  bus.emit('dock:docked', { stationId: BROKER });
  const board = state.missions.boards[BROKER];
  const offerA = board.slots.find((o) => o && o.destStationId === YARD_A
    && o.cause && o.cause.tag === 'industry_starved');
  const offerB = board.slots.find((o) => o && o.destStationId === YARD_B
    && o.cause && o.cause.tag === 'industry_starved');
  assert.ok(offerA && offerB, 'both bids are live on the broker board');
  const postedQtyB = offerB.params.qty;
  const bSummaryBefore = offerB.summary;

  // Take the A run: the freight is real — load the units the market sold the pilot.
  const missionsSys = sim.registry.get('missions');
  assert.equal(missionsSys.acceptMission(offerA.id), true, 'the A bid accepts');
  addCargo(state, INPUT, offerA.params.qty);
  const ironStockBefore = state.economy.markets[YARD_A][INPUT].stock;

  // Dock at the starving yard — the delivery writes stock through the canonical freight fact.
  bus.emit('dock:docked', { stationId: YARD_A });

  assert.ok(state.economy.markets[YARD_A][INPUT].stock > ironStockBefore,
    'the physical delivery landed in the real market');
  assert.equal(needAt(sim, YARD_A, YARD_A_TIER), null,
    'yard A\'s hopper filled past the starvation threshold — the consumer operation changed');
  assert.equal(completedEvents.length, 1, 'the completed run paid once');
  assert.equal(entityCount(sim), entitiesBefore,
    'no worker or entity is spawned for the delivery (NXI-172 — the waiting worker stays)');

  // The surviving row must reflect the collapsed bid through the live demand fact.
  missionsSys.ensureBoard(BROKER);
  const rowsAfter = starvedRows(state.missions.boards[BROKER]);
  assert.equal(rowsAfter.length, 1, 'yard B\'s bid stands — it is still actually starving');
  const rowB = rowsAfter[0];
  assert.equal(rowB.destStationId, YARD_B);
  assert.equal(rowB.params.qty, postedQtyB, 'B\'s own deficit is unmoved by A\'s relief');
  assert.notEqual(rowB.summary, bSummaryBefore, 'the row admits the duel is over');
  assert.match(rowB.summary, /hopper filled|stands alone/i,
    'the prose says the rival\'s hopper filled — the new actual requirement (NXI-171)');

  // Yard A's row is gone everywhere — accepting it consumed it, and it never re-posts.
  assert.equal(starvedRows(state.missions.boards[BROKER])
    .some((o) => o.destStationId === YARD_A), false, 'yard A\'s bid came down with the shortage');
});

// ── 3. Partial relief re-quotes; full resolution retires — and nothing respawns ──────────────

test('partial relief re-quotes the surviving bid; resolving both ends the pair for good', () => {
  const sim = boot();
  const { state, bus } = sim;
  starve(sim, YARD_A, 0.05);
  starve(sim, YARD_B, 0.10);
  const missionsSys = sim.registry.get('missions');

  bus.emit('dock:docked', { stationId: BROKER });
  const rowB = () => starvedRows(state.missions.boards[BROKER])
    .find((o) => o.destStationId === YARD_B);
  const before = rowB();
  assert.ok(before, 'yard B\'s bid is live');
  const postedQty = before.params.qty;
  const postedReward = before.reward_cr;

  // Part of a hopper of relief lands at yard B through ordinary freight — not the contract.
  const deficit0 = needAt(sim, YARD_B, YARD_B_TIER);
  const partial = deficit0.deficitUnits - 19; // leave a 19u live deficit inside the starved band
  bus.emit('cargo:delivered', {
    commodityId: INPUT, qty: partial, missionId: 'm-test-relief', stationId: YARD_B,
  });
  missionsSys.ensureBoard(BROKER);
  const requoted = rowB();
  assert.ok(requoted, 'a half-fed yard still needs the rest of its feedstock');
  const liveNeed = needAt(sim, YARD_B, YARD_B_TIER);
  assert.ok(liveNeed && liveNeed.inputId === INPUT, 'the same leg is still the hungry one');
  assert.equal(requoted.params.qty, Math.min(20, liveNeed.deficitUnits),
    'the row re-quotes the NEW actual requirement, not the original emergency');
  assert.ok(requoted.params.qty < postedQty, 'the ask shrank with the real deficit');
  assert.ok(requoted.reward_cr < postedReward, 'the payout shrank with it — no memory pay');

  // Feed the rest of both yards — the shortage is resolved; the rows come down and stay down.
  bus.emit('cargo:delivered', {
    commodityId: INPUT, qty: liveNeed.deficitUnits + 2, missionId: 'm-test-relief-2', stationId: YARD_B,
  });
  const needA = needAt(sim, YARD_A, YARD_A_TIER);
  bus.emit('cargo:delivered', {
    commodityId: INPUT, qty: needA.deficitUnits + 2, missionId: 'm-test-relief-3', stationId: YARD_A,
  });
  missionsSys.ensureBoard(BROKER);
  assert.equal(starvedRows(state.missions.boards[BROKER]).length, 0,
    'both yards fed — every bid comes down');

  // Repeated visits — same epoch and a LATER epoch — cannot respawn the pair.
  bus.emit('dock:docked', { stationId: BROKER });
  assert.equal(starvedRows(state.missions.boards[BROKER]).length, 0, 'same epoch stays quiet');
  state.simTime += 700; // roll into the next board epoch
  missionsSys.ensureBoard(BROKER);
  bus.emit('dock:docked', { stationId: BROKER });
  bus.emit('dock:docked', { stationId: BROKER });
  assert.equal(starvedRows(state.missions.boards[BROKER]).length, 0,
    'a fresh epoch re-plans against live needs — nothing starves, nothing posts');
});

// ── 4. Counterexamples ───────────────────────────────────────────────────────────────────────

test('a lone starving yard still posts the single sealed run — no fabricated pair', () => {
  const sim = boot();
  const { state, bus } = sim;
  starve(sim, YARD_A, 0.05); // only one consumer is hungry — Hyperion's hopper is full
  bus.emit('dock:docked', { stationId: BROKER });
  const rows = starvedRows(state.missions.boards[BROKER]);
  assert.equal(rows.length, 1, 'one consumer means one bid — no invented rival');
  assert.equal(rows[0].destStationId, YARD_A);
  assert.equal(rows[0].preloadedCargo, true, 'a lone yard still seals its own client freight');
  assert.equal(rows[0].cause.rivalStationId, undefined, 'no rival tag on a lone bid');
});

test('freight of the wrong commodity feeds nothing and retires nothing', () => {
  const sim = boot();
  const { state, bus } = sim;
  starve(sim, YARD_A, 0.05);
  starve(sim, YARD_B, 0.10);
  const missionsSys = sim.registry.get('missions');
  bus.emit('dock:docked', { stationId: BROKER });
  assert.equal(starvedRows(state.missions.boards[BROKER]).length, 2);

  // A delivery the hopper cannot burn changes no demand fact.
  bus.emit('cargo:delivered', {
    commodityId: 'cmdty_food', qty: 25, missionId: 'm-wrong-goods', stationId: YARD_A,
  });
  missionsSys.ensureBoard(BROKER);
  const rows = starvedRows(state.missions.boards[BROKER]);
  assert.equal(rows.length, 2, 'wrong-cargo freight leaves both bids live and quoted');
  const rowA = rows.find((o) => o.destStationId === YARD_A);
  const needA = needAt(sim, YARD_A, YARD_A_TIER);
  assert.ok(needA && needA.inputId === INPUT, 'yard A still starves for the same real leg');
  assert.equal(rowA.params.qty, Math.min(20, needA.deficitUnits),
    'the row still quotes the live deficit');
});
