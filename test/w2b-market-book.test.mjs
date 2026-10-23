// W2-B O16 / O43 — the market-play book settles on its real deadlines, finds inbound freight by
// the station's canonical id, and the Dump Chute no longer grows the save one receipt per pod.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { buildArrivalIntent, buildCargoManifest, POD_INTAKE_LAW } from '../src/economy/freightCausality.js';

const SEED = 4242;
const STATION = 'station_ceres';
const ORE = 'cmdty_ore_iron';

function boot(t, { numericTarget = false } = {}) {
  const sim = createSimulation({ seed: SEED, systems: [economy, cargo] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_ceres_belt';
  state.player.credits = 200000;
  const player = sim.spawn({ type: 'ship', pos: { x: 0, z: 0 }, team: 0 });
  state.playerId = player.id;
  const station = sim.spawn({ type: 'station', pos: { x: 100, z: 0 }, data: { stationId: STATION } });
  const econ = sim.registry.get('economy');
  econ.ensureMarket(STATION);
  bus.emit('dock:docked', { stationId: STATION });
  const freighterKey = 'w2b-freighter-4242';
  const manifest = buildCargoManifest({ seed: SEED, freighterKey, role: 'hauler', marketKeys: [ORE] });
  // Live traffic records name their destination by the station's numeric ENTITY id.
  state.traffic = { ...(state.traffic || {}), freighters: [
    { id: freighterKey, role: 'hauler', targetId: numericTarget ? station.id : STATION, dockSeq: 0, manifest },
  ] };
  const order = { stationId: STATION, freighterKey, dockSeq: 0 };
  const buy = () => {
    const intent = { ...order };
    bus.emit('ui:convoyShareBuy', intent);
    assert.equal(intent.result?.ok, true, intent.result && intent.result.reason);
    return intent.result.share;
  };
  const arrival = buildArrivalIntent({
    seed: SEED, ...order, freighterId: freighterKey, manifest, sectorId: state.world.currentSectorId,
  });
  return { sim, state, bus, econ, station, order, buy, arrival, manifest };
}

// -- O16: expiry sweep -------------------------------------------------------------------

test('an open share with a future deadline survives the sweep; a past one expires worthless', (t) => {
  const h = boot(t);
  const share = h.buy();
  const book = h.state.economy.convoyShares;
  assert.ok(share.expiresAt > h.state.simTime);
  h.econ._sweepMarketPlay(h.state);
  assert.equal(book.open.length, 1, 'a future-deadline share stays open across a sweep');
  assert.equal(book.settled.length, 0);

  h.state.simTime = share.expiresAt + 1;
  const credits = h.state.player.credits;
  h.econ._sweepMarketPlay(h.state);
  assert.equal(book.open.length, 0, 'a past-deadline share leaves the open book');
  assert.equal(book.settled.length, 1);
  assert.equal(book.settled[0].outcome, 'expired');
  assert.equal(book.settled[0].payoutCr, 0);
  assert.equal(h.state.player.credits, credits, 'expiry pays nothing');
});

test('a restored open share and slip keep their future deadlines through the 5 s sweep', (t) => {
  const h = boot(t);
  const share = h.buy();
  const now = h.state.simTime;
  h.state.economy.forwardSlips.open.push({
    id: 'slip-w2b', stationId: STATION, freighterKey: 'w2b-freighter-4242', manifestId: null, dockSeq: 0,
    commodityId: ORE, qty: 5, lockedBuyCr: 10, feeCr: 3, boughtAt: now, expiresAt: now + 600,
  });
  const saved = JSON.parse(JSON.stringify(h.econ.serialize()));
  const cold = boot(t);
  cold.econ.deserialize(saved);
  cold.state.simTime = now + 10;
  cold.econ._sweepMarketPlay(cold.state);
  assert.equal(cold.state.economy.convoyShares.open.length, 1);
  assert.equal(cold.state.economy.convoyShares.open[0].id, share.id);
  assert.equal(cold.state.economy.forwardSlips.open.length, 1);
  assert.equal(cold.state.economy.forwardSlips.settled.length, 0);
  // ...and the real economy tick path (not just the direct call) leaves them open too.
  cold.sim.runTicks(60 * 6);
  assert.equal(cold.state.economy.convoyShares.open.length, 1);
});

test('malformed book rows are discarded, rows without a usable deadline settle as expired', (t) => {
  const h = boot(t);
  const book = h.state.economy.convoyShares;
  book.open.push(null, 'junk', { id: 'no-deadline', stationId: STATION, stakeCr: 5, payoutCr: 9 });
  h.econ._sweepMarketPlay(h.state);
  assert.equal(book.open.length, 0);
  assert.deepEqual(book.settled.map((row) => row.id), ['no-deadline']);
  assert.equal(book.settled[0].outcome, 'expired');
});

test('an arrival after the deadline but before the next sweep expires the share and slip instead of paying', (t) => {
  const h = boot(t);
  const share = h.buy();
  const now = h.state.simTime;
  const slip = {
    id: 'slip-w2b-late', stationId: STATION, freighterKey: 'w2b-freighter-4242', manifestId: null, dockSeq: 0,
    commodityId: ORE, qty: 5, lockedBuyCr: 1000, feeCr: 3, boughtAt: now, expiresAt: now + 600,
  };
  h.state.economy.forwardSlips.open.push(slip);
  // The deadline passes at share.expiresAt; the freighter lands one second later, before any sweep.
  h.state.simTime = Math.max(share.expiresAt, slip.expiresAt) + 1;
  const credits = h.state.player.credits;
  const expired = [];
  h.bus.on('economy:marketContractExpired', (p) => expired.push(p));
  h.bus.emit('freight:arrival', h.arrival);
  assert.equal(h.state.player.credits, credits, 'an overdue position pays nothing on arrival');
  assert.equal(h.state.economy.convoyShares.open.length, 0);
  assert.equal(h.state.economy.convoyShares.settled.at(-1).outcome, 'expired');
  assert.equal(h.state.economy.convoyShares.settled.at(-1).payoutCr, 0);
  assert.ok(expired.some((p) => p.kind === 'convoy-share' && p.id === share.id));
  const slipRow = h.state.economy.forwardSlips.settled.find((r) => r.id === slip.id);
  assert.ok(slipRow, 'the arrival carries an ore trade, so the slip is settled by it');
  assert.equal(slipRow.outcome, 'expired', 'a slip the arrival would have landed settles as expired');
  assert.equal(slipRow.payoutCr, 0);
  assert.equal(h.state.economy.forwardSlips.open.length, 0);
  h.bus.emit('freight:arrival', { ...h.arrival });
  assert.equal(h.state.player.credits, credits, 'a replay still pays nothing');
});

test('an arrival inside the deadline still pays the share once', (t) => {
  const h = boot(t);
  const share = h.buy();
  h.state.simTime = share.expiresAt - 1;
  const credits = h.state.player.credits;
  h.bus.emit('freight:arrival', h.arrival);
  assert.equal(h.state.player.credits, credits + share.payoutCr);
  assert.equal(h.state.economy.convoyShares.settled.at(-1).outcome, 'arrived');
});

// -- O43b: canonical station id finds the lane -------------------------------------------

test('a freighter targeted at the station entity is found by the canonical station id', (t) => {
  const h = boot(t, { numericTarget: true });
  assert.equal(typeof h.state.traffic.freighters[0].targetId, 'number');
  const lanes = h.econ.convoyShareLanes(STATION);
  assert.equal(lanes.length, 1, 'inbound freight is found');
  assert.equal(lanes[0].freighterKey, 'w2b-freighter-4242');
  assert.deepEqual(h.econ.convoyShareLanes('station_helios'), [], 'another berth sees no such lane');
  const share = h.buy();
  assert.ok(share.stakeCr > 0, 'the purchase API can price the lane');
});

// -- O43c: Dump Chute journal ------------------------------------------------------------

function intake(h, i, qty = 1) {
  const p = { intakeId: `w2b-pod-${i}`, stationId: STATION, commodityId: ORE, qty };
  h.bus.emit('cargo:podIntake', p);
  return p;
}

test('500 dumps keep the committed-intent journal and the save bounded', (t) => {
  const h = boot(t);
  const saveSize = () => JSON.stringify(h.econ.serialize()).length;
  for (let i = 0; i < 200; i++) assert.equal(intake(h, i).result?.ok, true);
  const at200 = saveSize();
  for (let i = 200; i < 500; i++) assert.equal(intake(h, i).result?.ok, true);
  const journal = h.state.economy.committedIntents || {};
  assert.equal(Object.keys(journal).filter((k) => k.startsWith('pod-intake:')).length, 0,
    'no per-pod rows in the unbounded journal');
  assert.ok(Object.keys(journal).length < 8, 'the journal is not growing with dumps');
  assert.ok(h.state.economy.podIntakeReceipts.length <= POD_INTAKE_LAW.maxAccepted);
  const at500 = saveSize();
  assert.ok(at500 <= at200 + 64, `save size is flat after the ring fills (${at200} -> ${at500})`);
});

test('duplicate pod intakes are still rejected, before and after a reload', (t) => {
  const h = boot(t);
  const credits0 = h.state.player.credits;
  const first = intake(h, 1, 3);
  assert.equal(first.result.ok, true);
  const paid = h.state.player.credits - credits0;
  assert.ok(paid > 0);

  const replay = intake(h, 1, 3);
  assert.equal(replay.result.ok, true);
  assert.equal(replay.result.duplicate, true);
  assert.equal(h.state.player.credits, credits0 + paid, 'a replay pays nothing');

  const conflict = intake(h, 1, 4);
  assert.equal(conflict.result.ok, false);
  assert.equal(conflict.result.reason, 'receipt_conflict');

  const saved = JSON.parse(JSON.stringify(h.econ.serialize()));
  const cold = boot(t);
  cold.state.player.credits = credits0 + paid;
  cold.econ.deserialize(saved);
  const again = intake(cold, 1, 3);
  assert.equal(again.result.duplicate, true, 'the receipt ring survives the save');
  assert.equal(cold.state.player.credits, credits0 + paid);
});

test('an old save with one journal row per dumped pod sheds them on load', (t) => {
  const h = boot(t);
  intake(h, 1);
  const saved = JSON.parse(JSON.stringify(h.econ.serialize()));
  saved.committedIntents = { 'other:keep': { receipt: { id: 1 } } };
  for (let i = 0; i < 300; i++) saved.committedIntents[`pod-intake:legacy-${i}`] = { receipt: { i }, result: { ok: true } };
  const cold = boot(t);
  cold.econ.deserialize(saved);
  assert.deepEqual(Object.keys(cold.state.economy.committedIntents), ['other:keep']);
  assert.ok(cold.state.economy.podIntakeReceipts.length <= POD_INTAKE_LAW.maxAccepted);
});
