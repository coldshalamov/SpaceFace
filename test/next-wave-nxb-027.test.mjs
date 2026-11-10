// NXB-027 — one physical freight transaction settles once across the receiver, the market, and
// station growth. The public route is missions._deliverCargo: cargo leaves the hold through the
// cargo single-writer (removeCargo) and the delivery lands on the bus as `cargo:delivered` with
// { commodityId, qty: <actual removed>, missionId, stationId } (missions.js). Economy commits the
// accepted lot under the persisted committed-intents journal in a `freight:` namespace and
// publishes the canonical `economy:freightAccepted` fact; claims consumes that fact (and the
// stable receiptId on `economy:tradeCompleted` / convoy settles) into station throughput — each
// dependent owner dedupes only its own effect.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { claims as claimsBase } from '../src/systems/claims.js';
import { addCargo, removeCargo } from '../src/systems/cargo.js';

const SEED = 4242;
const STATION = 'station_ceres';      // refinery, faction_dmc, sector_ceres_belt — authored
const ORE = 'cmdty_ore_iron';
const REFINED = 'cmdty_refined_metals';

function boot({ systems } = {}) {
  const sim = createSimulation({ seed: SEED, systems: systems || [economy, claimsBase] });
  const { state } = sim;
  state.simTime = 1000;
  state.world.currentSectorId = 'sector_ceres_belt';
  state.player.credits = 200000;
  state.player.researchedNodes = ['tech_outpost_charter', 'tech_deep_core_mining', 'tech_graviton_drives'];
  state.player.cargo.capVolume = 400;
  state.player.cargo.capMass = 400;
  const econ = sim.registry.get('economy');
  econ.ensureMarket(STATION);
  const events = [];
  for (const name of [
    'economy:freightAccepted', 'economy:tradeCompleted', 'economy:tradeFailed',
    'station:throughput', 'station:moduleGained', 'economy:grantCredits',
  ]) {
    sim.bus.on(name, (payload) => events.push({ name, payload }));
  }
  return { sim, state, bus: sim.bus, econ, claims: sim.registry.get('claims'), events };
}

const evs = (h, name) => h.events.filter((e) => e.name === name);
const freightAccepted = (h) => evs(h, 'economy:freightAccepted');
const ironStock = (h) => h.econ.getMarket(STATION)[ORE].stock;

test('an accepted mission delivery settles once — stock and growth move a single time', () => {
  const h = boot();
  try {
    const stock0 = ironStock(h);
    const credits0 = h.state.player.credits;
    const cargo0 = (h.state.player.cargo.items[ORE] || 0);

    // The public route end-state: the cargo single-writer removed the lot, and missions emits
    // cargo:delivered with exactly the removed units (missions._deliverCargo).
    addCargo(h.state, ORE, 30);
    const removed = removeCargo(h.state, ORE, 30);
    assert.equal(removed, 30);
    const delivered = { commodityId: ORE, qty: removed, missionId: 'm-relief-1', stationId: STATION };
    h.bus.emit('cargo:delivered', delivered);

    assert.equal(ironStock(h), stock0 + 30, 'the delivered lot lands in the market once');
    assert.equal((h.state.player.cargo.items[ORE] || 0), cargo0, 'the hold keeps what was removed');
    assert.equal(h.state.player.credits, credits0, 'a delivery is not a sale — nothing is paid');

    const accepted = freightAccepted(h);
    assert.equal(accepted.length, 1, 'one canonical freight fact is published');
    assert.equal(accepted[0].payload.receiptId, 'mission-delivery:m-relief-1');
    assert.equal(accepted[0].payload.stationId, STATION);
    assert.equal(accepted[0].payload.commodityId, ORE);
    assert.equal(accepted[0].payload.qty, 30);
    assert.equal(accepted[0].payload.source, 'mission_delivery');

    const rec = h.claims.stationGrowth(STATION);
    assert.ok(rec, 'player-supplied freight grew the station ledger');
    assert.equal(rec.throughputU, 30);
    assert.equal(rec.sources.market_sell, 30);

    // The identical completion notification repeats (reload/retry boundary): the lot does not
    // move again and growth does not recount, but the canonical fact republishes so a dependent
    // owner that missed it can still finish its own effect.
    h.bus.emit('cargo:delivered', { ...delivered });
    assert.equal(ironStock(h), stock0 + 30, 'a matching retry moves no stock');
    assert.equal(h.claims.stationGrowth(STATION).throughputU, 30, 'growth counts the lot once');
    assert.equal(freightAccepted(h).length, 2, 'the canonical fact republishes on retry');
    assert.equal(h.state.player.credits, credits0);
    assert.equal(evs(h, 'station:throughput').length, 1, 'throughput is reported once');
  } finally { h.sim.dispose(); }
});

test('the committed receipt survives serialize/deserialize — a post-reload retry settles nothing twice', () => {
  const h = boot();
  try {
    const stock0 = ironStock(h);
    addCargo(h.state, ORE, 25);
    const removed = removeCargo(h.state, ORE, 25);
    const delivered = { commodityId: ORE, qty: removed, missionId: 'm-persisted', stationId: STATION };
    h.bus.emit('cargo:delivered', delivered);
    assert.equal(ironStock(h), stock0 + 25);
    assert.equal(h.claims.stationGrowth(STATION).throughputU, 25);

    const snapEcon = JSON.parse(JSON.stringify(h.econ.serialize()));
    const snapClaims = JSON.parse(JSON.stringify(h.claims.serialize()));

    const cold = boot();
    try {
      cold.econ.deserialize(snapEcon);
      cold.claims.deserialize(snapClaims);
      assert.equal(ironStock(cold), stock0 + 25, 'the market restores the landed lot');
      assert.equal(cold.claims.stationGrowth(STATION).throughputU, 25, 'growth restores');

      cold.bus.emit('cargo:delivered', { ...delivered });
      assert.equal(ironStock(cold), stock0 + 25, 'the journaled receipt blocks a second settle');
      assert.equal(cold.claims.stationGrowth(STATION).throughputU, 25, 'growth dedup survives reload');
      assert.equal(freightAccepted(cold).length, 1, 'the canonical fact still republishes');

      // A genuinely new shipment of the same good still settles normally.
      addCargo(cold.state, ORE, 10);
      const removed2 = removeCargo(cold.state, ORE, 10);
      cold.bus.emit('cargo:delivered', {
        commodityId: ORE, qty: removed2, missionId: 'm-persisted-2', stationId: STATION,
      });
      assert.equal(ironStock(cold), stock0 + 35, 'a distinct later delivery lands');
      assert.equal(cold.claims.stationGrowth(STATION).throughputU, 35);
    } finally { cold.sim.dispose(); }
  } finally { h.sim.dispose(); }
});

test('a retry completes the growth effect a missing consumer never saw — without moving stock again', () => {
  // First world: economy alone. The delivery lands, the receipt commits, and the canonical fact
  // publishes to nobody.
  const first = boot({ systems: [economy] });
  let stock0;
  try {
    stock0 = ironStock(first);
    first.bus.emit('cargo:delivered', { commodityId: ORE, qty: 20, missionId: 'm-late', stationId: STATION });
    assert.equal(ironStock(first), stock0 + 20);
    assert.equal(freightAccepted(first).length, 1);
  } finally {
    var snap = JSON.parse(JSON.stringify(first.econ.serialize()));
    first.sim.dispose();
  }

  // Second world: claims is back. The same completion retry must finish growth exactly once.
  const second = boot();
  try {
    second.econ.deserialize(snap);
    assert.equal(second.claims.stationGrowth(STATION), null, 'no consumer heard the first fact');
    second.bus.emit('cargo:delivered', { commodityId: ORE, qty: 20, missionId: 'm-late', stationId: STATION });
    assert.equal(ironStock(second), stock0 + 20, 'the retry does not move the lot again');
    const rec = second.claims.stationGrowth(STATION);
    assert.ok(rec && rec.throughputU === 20, 'the dependent owner finishes its own effect on retry');
    assert.equal(second.claims.stationGrowth(STATION).throughputU, 20);

    second.bus.emit('cargo:delivered', { commodityId: ORE, qty: 20, missionId: 'm-late', stationId: STATION });
    assert.equal(second.claims.stationGrowth(STATION).throughputU, 20, 'a further retry is inert');
  } finally { second.sim.dispose(); }
});

test('conflicting receipt reuse and non-positive quantities are refused outright', () => {
  const h = boot();
  try {
    const stock0 = ironStock(h);
    h.bus.emit('cargo:delivered', { commodityId: ORE, qty: 12, missionId: 'm-a', stationId: STATION });
    assert.equal(ironStock(h), stock0 + 12);

    const res = h.econ.applyFreightDelivery({
      commodityId: ORE, qty: 13, missionId: 'm-a', stationId: STATION,
    });
    assert.equal(res.ok, false, 'same receipt, different quantity — a collision, not a retry');
    assert.equal(ironStock(h), stock0 + 12, 'the colliding delivery moves nothing');
    assert.equal(freightAccepted(h).length, 1, 'no canonical fact publishes for a conflict');

    const resOtherStation = h.econ.applyFreightDelivery({
      commodityId: ORE, qty: 12, missionId: 'm-a', stationId: 'station_beltout',
    });
    assert.equal(resOtherStation.ok, false, 'same receipt at another station is a collision');

    for (const qty of [0, -30, 2.5, 'abc']) {
      const rejected = h.econ.applyFreightDelivery({
        commodityId: ORE, qty, missionId: 'm-bad-' + String(qty), stationId: STATION,
      });
      assert.equal(rejected.ok, false, 'qty ' + JSON.stringify(qty) + ' cannot be laundered');
    }
    assert.equal(ironStock(h), stock0 + 12, 'refusals never move stock');

    // Anonymous internal/test events keep the legacy stock-only path — no dedup promise, no
    // canonical fact, no growth.
    h.bus.emit('cargo:delivered', { commodityId: ORE, qty: 8, stationId: STATION });
    h.bus.emit('cargo:delivered', { commodityId: ORE, qty: 8, stationId: STATION });
    assert.equal(ironStock(h), stock0 + 28, 'anonymous deliveries still land as stock');
    assert.equal(freightAccepted(h).length, 1);
    assert.equal(h.claims.stationGrowth(STATION).throughputU, 12,
      'anonymous stock-only events are not throughput facts');
  } finally { h.sim.dispose(); }
});

test('trade completions dedupe on the stable receipt; distinct same-good settles still count', () => {
  const h = boot();
  try {
    const sell = (receiptId, qty) => h.bus.emit('economy:tradeCompleted', {
      stationId: STATION, commodityId: ORE, side: 'sell', qty, unitAvg: 28, total: qty * 28,
      receiptId, tradeSequence: 1,
    });
    sell('trade:4242:1', 10);
    sell('trade:4242:1', 10); // the same settled sale reported again
    assert.equal(h.claims.stationGrowth(STATION).throughputU, 10, 'one receipt counts once');
    assert.equal(evs(h, 'station:throughput').length, 1);

    sell('trade:4242:2', 5);
    sell('trade:4242:3', 5);
    assert.equal(h.claims.stationGrowth(STATION).throughputU, 20,
      'later same-good transactions are distinct freight, not suppressed');

    // The same receipt id carrying a different lot is a collision — never new freight.
    sell('trade:4242:2', 99);
    assert.equal(h.claims.stationGrowth(STATION).throughputU, 20);

    // Anonymous legacy completions (no stable receipt) keep counting as before.
    h.bus.emit('economy:tradeCompleted', {
      stationId: STATION, commodityId: ORE, side: 'sell', qty: 7, unitAvg: 28, total: 196,
    });
    assert.equal(h.claims.stationGrowth(STATION).throughputU, 27);
  } finally { h.sim.dispose(); }
});

test('a rejected trade grows nothing', () => {
  const h = boot();
  try {
    // The real path: execute a sell with an empty hold — it fails before any completion exists.
    const res = h.econ.execute(STATION, ORE, 'sell', 10);
    assert.equal(res.ok, false);
    assert.equal(evs(h, 'economy:tradeCompleted').length, 0, 'a refused sale never completes');
    assert.equal(h.claims.stationGrowth(STATION), null, 'no growth from a rejected trade');
  } finally { h.sim.dispose(); }
});

test('a convoy berth unload settles its sale once; a later distinct leg still sells', () => {
  const h = boot();
  try {
    const claims = h.claims;
    assert.equal(claims.claim({ id: 'poi_nxb027_rock', name: 'Ledger Rock', size: 'M', pos: { x: 100, z: 100 } }), true);
    const body = h.state.claims.bodies.at(-1);
    assert.equal(claims.buildModule(body.id, 'mod_depot'), true);
    assert.equal(claims.specialize(body.id, 'spec_relay'), true);
    addCargo(h.state, REFINED, 150);
    assert.equal(claims.deliverToClaim(body.id, REFINED, 150), 150);

    // Wait for the first real dispatch (spec_relay dispatches on its authored schedule).
    for (let guard = 0; guard < 600 && !body.spec.convoy; guard++) h.sim.step(1);
    const convoy = body.spec.convoy;
    assert.ok(convoy && convoy.convoyId, 'a convoy leg is flying');
    assert.equal(convoy.destStationId, STATION, 'the relay ships to the sector station');

    const credits0 = h.state.player.credits;
    const docked = { bodyId: body.id, convoyId: convoy.convoyId, stationId: convoy.destStationId, qty: convoy.qty };
    h.bus.emit('claim:convoyDocked', docked);
    const creditsAfterFirst = h.state.player.credits;
    assert.ok(creditsAfterFirst > credits0, 'the unload pays the relay sale once');
    const throughputAfterFirst = h.claims.stationGrowth(STATION).throughputU;
    assert.equal(throughputAfterFirst, convoy.qty, 'the leg counts once as throughput');

    // The same berth notification arriving again cannot re-pay or re-count.
    h.bus.emit('claim:convoyDocked', { ...docked });
    assert.equal(h.state.player.credits, creditsAfterFirst, 'the duplicate unload pays nothing');
    assert.equal(h.claims.stationGrowth(STATION).throughputU, throughputAfterFirst);

    // And the surviving freight launches a genuinely new leg that sells on its own receipt.
    for (let guard = 0; guard < 600 && !body.spec.convoy; guard++) h.sim.step(1);
    const convoy2 = body.spec.convoy;
    assert.ok(convoy2 && convoy2.convoyId !== convoy.convoyId, 'a distinct leg dispatched');
    h.bus.emit('claim:convoyDocked', {
      bodyId: body.id, convoyId: convoy2.convoyId, stationId: convoy2.destStationId, qty: convoy2.qty,
    });
    assert.ok(h.state.player.credits > creditsAfterFirst, 'the new convoy settles its own sale');
    assert.equal(h.claims.stationGrowth(STATION).throughputU, throughputAfterFirst + convoy2.qty,
      'later legs still supply the station');
  } finally { h.sim.dispose(); }
});
