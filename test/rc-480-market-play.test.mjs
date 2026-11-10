import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { cargo, addCargo } from '../src/systems/cargo.js';
import { rateRelease } from '../src/systems/tetherGameplay.js';
import {
  buildCargoManifest, buildArrivalIntent, buildLossIntent, POD_INTAKE_LAW,
} from '../src/economy/freightCausality.js';

const SEED = 4242;
const STATION = 'station_ceres';
const ORE = 'cmdty_ore_iron';

// Focused owner/event-boundary tests, without renderer or physics claims. Physical pods are
// created by cargo.jettison and consumed through the real core removeEntity helper.
function boot(t) {
  const sim = createSimulation({ seed: SEED, systems: [economy, cargo] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_ceres_belt';
  state.player.credits = 200000;
  const player = sim.spawn({ type: 'ship', pos: { x: 0, z: 0 }, team: 0 });
  state.playerId = player.id;
  sim.spawn({ type: 'station', pos: { x: 100, z: 0 }, data: { stationId: STATION } });
  const econ = sim.registry.get('economy');
  econ.ensureMarket(STATION);
  bus.emit('dock:docked', { stationId: STATION });
  const freighterKey = 'r480-freighter-4242';
  const manifest = buildCargoManifest({ seed: SEED, freighterKey, role: 'hauler', marketKeys: [ORE] });
  state.traffic = { ...(state.traffic || {}), freighters: [
    { id: freighterKey, role: 'hauler', targetId: STATION, dockSeq: 0, manifest },
  ] };
  const order = { stationId: STATION, freighterKey, dockSeq: 0 };
  const arrival = buildArrivalIntent({
    seed: SEED, ...order, freighterId: freighterKey, manifest,
    sectorId: state.world.currentSectorId,
  });
  const stock = () => econ.getMarket(STATION)[ORE].stock;
  const buy = () => {
    const intent = { ...order };
    bus.emit('ui:convoyShareBuy', intent);
    assert.equal(intent.result?.ok, true);
    return intent.result.share;
  };
  return { sim, state, bus, econ, order, arrival, manifest, stock, buy };
}

function dump(h, qty) {
  addCargo(h.state, ORE, qty);
  const before = new Set(h.state.entities.keys());
  assert.equal(h.sim.registry.get('cargo').jettison(ORE, qty), qty);
  const pods = [...h.state.entities.values()].filter((e) => !before.has(e.id));
  assert.equal(pods.length, 1, 'one actual physical pod leaves the hold');
  return pods[0];
}

test('seed 4242: stake debits once; simulation time alone never pays a share', (t) => {
  const h = boot(t);
  const credits0 = h.state.player.credits;
  const share = h.buy();
  assert.equal(h.state.player.credits, credits0 - share.stakeCr);
  h.buy();
  assert.equal(h.state.player.credits, credits0 - share.stakeCr, 'retry does not debit twice');
  h.sim.runTicks(120);
  assert.equal(h.state.player.credits, credits0 - share.stakeCr, 'no timer payout');
});

test('seed 4242: wrong hull, destination or dock sequence cannot pay; matching arrival pays once', (t) => {
  const h = boot(t);
  const share = h.buy();
  const credits0 = h.state.player.credits;
  const stock0 = h.stock();
  for (const change of [
    { freighterKey: 'other', freighterId: 'other' },
    { stationId: 'station_beltout' },
    { dockSeq: 1 },
  ]) {
    h.bus.emit('freight:arrival', { ...h.arrival, ...change });
    assert.equal(h.state.player.credits, credits0);
  }
  h.bus.emit('freight:arrival', h.arrival);
  assert.equal(h.state.player.credits, credits0 + share.payoutCr);
  h.bus.emit('freight:arrival', { ...h.arrival });
  assert.equal(h.state.player.credits, credits0 + share.payoutCr, 'replay pays nothing');
  assert.equal(h.stock(), stock0, 'share settlement does not repeat traffic stock movement');
});

test('seed 4242: a different manifest on the same hull is not the purchased lot', (t) => {
  const h = boot(t);
  h.buy();
  const credits0 = h.state.player.credits;
  h.bus.emit('freight:arrival', { ...h.arrival, manifestId: 'a-different-lot' });
  assert.equal(h.state.player.credits, credits0, 'identity includes the named manifest');
});

test('seed 4242: loss consumes the stake and a later arrival cannot resurrect it', (t) => {
  const h = boot(t);
  h.buy();
  const credits0 = h.state.player.credits;
  h.bus.emit('freight:loss', buildLossIntent({ seed: SEED, ...h.order, manifest: h.manifest }));
  h.bus.emit('freight:arrival', h.arrival);
  assert.equal(h.state.player.credits, credits0);
  assert.equal(h.state.economy.convoyShares.open.length, 0);
  assert.equal(h.state.economy.convoyShares.settled[0].outcome, 'lost');
});

for (const settled of [false, true]) {
  test(`seed 4242: ${settled ? 'settled' : 'open'} shares survive reload and pay once total`, (t) => {
    const h = boot(t);
    const share = h.buy();
    const afterStake = h.state.player.credits;
    if (settled) h.bus.emit('freight:arrival', h.arrival);
    const saved = JSON.parse(JSON.stringify(h.econ.serialize()));
    const cold = boot(t);
    cold.state.player.credits = h.state.player.credits; // player chunk has its own save owner
    cold.econ.deserialize(saved);
    cold.bus.emit('freight:arrival', h.arrival);
    cold.bus.emit('freight:arrival', h.arrival);
    assert.equal(cold.state.player.credits, afterStake + share.payoutCr);
  });
}

test('seed 4242: five physical pod intakes pay the discount, add exact goods and dedupe', (t) => {
  const h = boot(t);
  let expectedCredits = h.state.player.credits;
  const stock0 = h.stock();
  const payloads = [];
  let units = 0;
  for (let i = 0; i < 5; i++) {
    const qty = i + 1;
    const pod = dump(h, qty);
    const unitPrice = h.econ.getMarket(STATION)[ORE].lastSell;
    assert.ok(unitPrice > 0);
    const p = { intakeId: `r480-pod-${i}`, podId: String(pod.id), stationId: STATION, commodityId: ORE, qty };
    h.bus.emit('cargo:podIntake', p);
    assert.equal(p.result?.ok, true);
    expectedCredits += Math.round(unitPrice * qty * POD_INTAKE_LAW.payFrac);
    units += qty;
    assert.equal(h.state.player.credits, expectedCredits);
    assert.equal(h.stock(), stock0 + units);
    assert.equal(h.state.entities.has(pod.id), false, 'physical custody leaves the world');
    payloads.push(p);
    h.bus.emit('cargo:podIntake', { ...p });
    assert.equal(h.state.player.credits, expectedCredits);
    assert.equal(h.stock(), stock0 + units);
  }
  const saved = JSON.parse(JSON.stringify(h.econ.serialize()));
  const cold = boot(t);
  cold.state.player.credits = expectedCredits;
  cold.econ.deserialize(saved);
  for (const p of payloads) cold.bus.emit('cargo:podIntake', { ...p });
  assert.equal(cold.state.player.credits, expectedCredits, 'reload cannot pay accepted pods again');
  assert.equal(cold.stock(), stock0 + units);
});

test('seed 4242: rejected pod intake preserves credits, market stock and the physical pod', (t) => {
  const h = boot(t);
  const pod = dump(h, 2);
  const credits0 = h.state.player.credits;
  const stock0 = h.stock();
  for (const change of [{ qty: 0 }, { stationId: 'missing-station' }, { podId: 'missing-pod' }]) {
    const p = { intakeId: 'r480-rejected', podId: String(pod.id), stationId: STATION, commodityId: ORE, qty: 2, ...change };
    h.bus.emit('cargo:podIntake', p);
    assert.equal(p.result?.ok, false);
    assert.equal(h.state.player.credits, credits0);
    assert.equal(h.stock(), stock0);
    assert.equal(h.state.entities.has(pod.id), true);
  }
});

test('seed 4242: five deliberate release receipts route physical pods into the nearby chute', (t) => {
  const h = boot(t);
  const credits0 = h.state.player.credits;
  const stock0 = h.stock();
  for (let i = 0; i < 5; i++) {
    const pod = dump(h, 1);
    // Exercise the real release-rating payload and receiver boundary. This does not certify
    // tether dynamics or a full browser route; no synthetic cargo:podIntake bridges the gap.
    h.bus.emit('tether:releaseRated', rateRelease(h.state, pod.id, { deliberate: true }));
  }
  h.sim.runTicks(60);
  assert.equal(h.stock(), stock0 + 5, 'deliberate releases must reach the intake owner');
  assert.ok(h.state.player.credits > credits0, 'five slung pods must pay');
});

test('seed 4242: old economy saves restore empty additive defaults without creating value', (t) => {
  const h = boot(t);
  const credits0 = h.state.player.credits;
  const stock0 = h.stock();
  const saved = JSON.parse(JSON.stringify(h.econ.serialize()));
  delete saved.marketPlay;
  h.buy(); // restoring a pre-feature save must also clear newer in-memory contracts
  h.econ.deserialize(saved);
  assert.deepEqual(h.state.economy.convoyShares.open, []);
  assert.deepEqual(h.state.economy.convoyShares.settled, []);
  assert.deepEqual(h.state.economy.forwardSlips.open, []);
  assert.deepEqual(h.state.economy.forwardSlips.settled, []);
  assert.deepEqual(h.state.economy.podIntakeReceipts, []);
  assert.deepEqual(h.state.economy.coldChain, {});
  assert.deepEqual(h.state.economy.auditorPenn.byStation, {});
  // Economy restoration must not manufacture credits (the separately restored player owner
  // supplies the wallet). No arrival from the replaced timeline may pay an erased contract.
  const beforeArrival = h.state.player.credits;
  h.bus.emit('freight:arrival', h.arrival);
  assert.equal(h.state.player.credits, beforeArrival);
  assert.ok(h.state.player.credits <= credits0);
  assert.equal(h.stock(), stock0);
});
