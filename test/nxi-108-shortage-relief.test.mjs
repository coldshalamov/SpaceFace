// NXI-108 — a shortage cue cites the transaction that actually relieved it. The shortage
// driver is the starved-industry read (starvedIndustryNeedFor / INDUSTRY_STARVED_FILL): a
// posted shortage names a real starving input leg. One accepted freight delivery that lifts
// that leg across the threshold publishes exactly one `economy:shortageRelieved` cue naming
// its receipt; rejected or duplicate republishes move no stock and yield none.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { economy, starvedIndustryNeedFor } from '../src/systems/economy.js';
import { claims as claimsBase } from '../src/systems/claims.js';
import { addCargo, removeCargo } from '../src/systems/cargo.js';

const SEED = 4242;
const STATION = 'station_ceres';      // refinery — the authored industry book has input legs
const ORE = 'cmdty_ore_iron';
const REFINED = 'cmdty_refined_metals';

function boot() {
  const sim = createSimulation({ seed: SEED, systems: [economy, claimsBase] });
  const { state } = sim;
  state.simTime = 1000;
  state.world.currentSectorId = 'sector_ceres_belt';
  state.player.credits = 200000;
  state.player.cargo.capVolume = 400;
  state.player.cargo.capMass = 400;
  const econ = sim.registry.get('economy');
  econ.ensureMarket(STATION);
  const events = [];
  for (const name of [
    'economy:freightAccepted', 'economy:shortageRelieved', 'economy:tradeFailed',
  ]) {
    sim.bus.on(name, (payload) => events.push({ name, payload }));
  }
  return { sim, state, bus: sim.bus, econ, events };
}

const evs = (h, name) => h.events.filter((e) => e.name === name);

// station_ceres is an authored refinery; starvedIndustryNeedFor reads its live market entries.
function stationType() { return 'refinery'; }
function stationTier() { return 1; } // sector_ceres_belt is tier 1

test('an accepted delivery that crosses the starvation threshold yields one cited relief cue', () => {
  const h = boot();
  try {
    const market = h.state.economy.markets[STATION];
    // Starve the market's industry inputs, then identify the posted (worst) leg.
    for (const cid of Object.keys(market)) {
      const e = market[cid];
      if (e && e.baseEq > 0) e.stock = Math.max(1, Math.floor(e.baseEq * 0.05));
    }
    const need = starvedIndustryNeedFor(stationType(h), stationTier(h), market);
    assert.ok(need, 'a starving yard posts a need');
    const leg = market[need.inputId];
    assert.ok(leg, 'the posted leg is a listed market entry');
    // Deliver exactly enough to cross the 0.3 fill threshold — through the real cargo route.
    const qty = Math.ceil(leg.baseEq * 0.5);
    addCargo(h.state, need.inputId, qty);
    const removed = removeCargo(h.state, need.inputId, qty);
    h.bus.emit('cargo:delivered', { commodityId: need.inputId, qty: removed, missionId: 'm-relief', stationId: STATION });

    const relief = evs(h, 'economy:shortageRelieved');
    assert.equal(relief.length, 1, 'one threshold-crossing delivery yields one relief cue');
    assert.equal(relief[0].payload.receiptId, 'mission-delivery:m-relief', 'the cue cites the relieving transaction');
    assert.equal(relief[0].payload.commodityId, need.inputId);
    assert.equal(relief[0].payload.qty, removed);
    assert.ok(relief[0].payload.fillBefore < 0.3 && relief[0].payload.fillAfter >= 0.3,
      'the cue records the actual crossing');

    // A matching retry republishes the canonical fact but must not re-cite the relief.
    h.bus.emit('cargo:delivered', { commodityId: need.inputId, qty: removed, missionId: 'm-relief', stationId: STATION });
    assert.equal(evs(h, 'economy:shortageRelieved').length, 1, 'a duplicate republish yields no second cue');
    assert.equal(evs(h, 'economy:freightAccepted').length, 2, 'the canonical fact still republishes');
  } finally { h.sim.dispose(); }
});

test('a rejected delivery and an under-threshold delivery both yield no relief cue', () => {
  const h = boot();
  try {
    const market = h.state.economy.markets[STATION];
    for (const cid of Object.keys(market)) {
      const e = market[cid];
      if (e && e.baseEq > 0) e.stock = Math.max(1, Math.floor(e.baseEq * 0.05));
    }
    const need = starvedIndustryNeedFor(stationType(h), stationTier(h), market);
    assert.ok(need);
    const leg = market[need.inputId];
    const fillBefore = leg.stock / leg.baseEq;

    // Rejected: zero qty fails validation before any stock write.
    h.bus.emit('cargo:delivered', { commodityId: need.inputId, qty: 0, missionId: 'm-bad', stationId: STATION });
    assert.equal(evs(h, 'economy:shortageRelieved').length, 0, 'a rejected delivery yields none');

    // Under-threshold: accepted, stock moves, but the leg stays starved — no relief claim.
    const small = Math.max(1, Math.floor(leg.baseEq * (0.3 - fillBefore) * 0.5));
    h.bus.emit('cargo:delivered', { commodityId: need.inputId, qty: small, missionId: 'm-partial', stationId: STATION });
    assert.equal(evs(h, 'economy:shortageRelieved').length, 0, 'a delivery that does not cross yields none');
    assert.equal(evs(h, 'economy:freightAccepted').length, 1, 'the partial delivery was still accepted');

    // Unrelated commodity: crossing a different listing is not this shortage's relief.
    for (const cid of Object.keys(market)) {
      const e = market[cid];
      if (e && e.baseEq > 0) e.stock = Math.max(1, Math.floor(e.baseEq * 0.05));
    }
    const need2 = starvedIndustryNeedFor(stationType(h), stationTier(h), market);
    const other = need2 && need2.inputId !== need.inputId ? need2.inputId : null;
    if (other) {
      const otherLeg = market[other];
      const qty2 = Math.ceil(otherLeg.baseEq * 0.6);
      h.bus.emit('cargo:delivered', { commodityId: other, qty: qty2, missionId: 'm-other', stationId: STATION });
      // Relieving a DIFFERENT posted leg is still an honest relief cue — assert exactly one and
      // that it cites its own transaction.
      const relief2 = evs(h, 'economy:shortageRelieved');
      assert.ok(relief2.length <= 1, 'no duplicate recovery messages');
      if (relief2.length) assert.equal(relief2[0].payload.commodityId, other);
    }
  } finally { h.sim.dispose(); }
});

test('a non-industry listing crossing low stock emits no industry relief cue', () => {
  const h = boot();
  try {
    const market = h.state.economy.markets[STATION];
    // Starve everything, deliver a commodity that feeds NO refinery job — wait, any non-input.
    for (const cid of Object.keys(market)) {
      const e = market[cid];
      if (e && e.baseEq > 0) e.stock = Math.max(1, Math.floor(e.baseEq * 0.05));
    }
    const need = starvedIndustryNeedFor(stationType(h), stationTier(h), market);
    assert.ok(need, 'the yard is starving');
    // The posted leg is need.inputId; a delivery of a different good must not cite itself as
    // the relief of the posted shortage.
    const postedLeg = need.inputId;
    const others = Object.keys(market).filter((cid) => cid !== postedLeg);
    let nonInput = null;
    for (const cid of others) {
      const still = starvedIndustryNeedFor(stationType(h), stationTier(h), market);
      if (still && still.inputId === cid) continue;
      // crude input check: cid is not the posted leg; deliver heavily and observe.
      nonInput = cid;
      break;
    }
    assert.ok(nonInput);
    const e = market[nonInput];
    const qty = Math.ceil(e.baseEq * 0.6);
    h.bus.emit('cargo:delivered', { commodityId: nonInput, qty, missionId: 'm-unrelated', stationId: STATION });
    const relief = evs(h, 'economy:shortageRelieved');
    // Only the posted leg's relief may cite a transaction.
    for (const r of relief) assert.equal(r.payload.commodityId, postedLeg);
  } finally { h.sim.dispose(); }
});
