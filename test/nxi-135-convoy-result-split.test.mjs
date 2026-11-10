// NXI-135 — the convoy result names the actual unsold remainder.
// Contract: a berth unload that arrives short must book sold / returned / recovered / lost
// units as distinct quantities in the existing bounded receipt ring, and only the sold lot
// may ever reach revenue. Driven through the real claims owner — the same 'claim:convoyDocked'
// event traffic publishes at a berth — no private reimplementation.
import test from 'node:test';
import assert from 'node:assert/strict';

import { claims as claimsBase } from '../src/systems/claims.js';
import { BODY_SPECIALIZATION_BY_ID } from '../src/data/claimableBodies.js';
import { SECTORS } from '../src/data/sectors.js';
import { addCargo } from '../src/systems/cargo.js';

const FRONTIER = 'sector_io_reach';
const GOOD = 'cmdty_refined_metals';
const UNIT = 80;
const RELAY_DEF = BODY_SPECIALIZATION_BY_ID.get('spec_relay');

function makeBus() {
  const handlers = new Map();
  const emitLog = [];
  return {
    emitLog,
    on(evt, fn) {
      if (!handlers.has(evt)) handlers.set(evt, []);
      handlers.get(evt).push(fn);
    },
    off() {},
    emit(evt, payload) {
      emitLog.push({ evt, payload });
      for (const fn of (handlers.get(evt) || []).slice()) fn(payload);
    },
  };
}

function makeState({ seed = 47, sectorId = FRONTIER, credits = 200000 } = {}) {
  return {
    simTime: 1000,
    meta: { seed },
    playerId: 'player',
    mode: 'flight',
    player: {
      credits,
      heat: 0,
      stats: {},
      researchedNodes: ['tech_outpost_charter', 'tech_deep_core_mining', 'tech_graviton_drives'],
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 400, capMass: 400 },
      ownedShips: [],
    },
    factions: Object.freeze({}),
    world: { currentSectorId: sectorId, activeSector: null },
    entities: new Map(),
    entityList: [],
    claims: null,
  };
}

// Mirror of the shared claims-test economy stub: every station lists the quoted good so the
// settle path sees real market truth (or a real absence of it).
function makeEconomyStub(priceTable = {}) {
  const markets = {};
  for (const sector of SECTORS) {
    for (const st of sector.stations || []) {
      const row = {};
      for (const [key, price] of Object.entries(priceTable)) {
        const parts = key.split('|');
        if (parts.length === 3) {
          if (parts[0] === st.id && parts[2] === 'sell') row[parts[1]] = { lastSell: price };
        } else row[key] = { lastSell: price };
      }
      markets[st.id] = row;
    }
  }
  return {
    name: 'economy',
    prices: priceTable,
    markets,
    priceOf(stationId, goodId, side) {
      const key = stationId + '|' + goodId + '|' + side;
      if (key in this.prices) return this.prices[key];
      return this.prices[goodId] != null ? this.prices[goodId] : 50;
    },
  };
}

function boot({ seed = 47, economy = makeEconomyStub({ [GOOD]: UNIT }) } = {}) {
  const state = makeState({ seed });
  const bus = makeBus();
  const peers = new Map();
  const registry = { get: (name) => peers.get(name) || null };
  const ctx = { state, bus, helpers: {}, registry };
  bus.on('economy:chargeCredits', (p) => {
    state.player.credits = Math.max(0, state.player.credits - Math.max(0, Math.round(p.amount || 0)));
  });
  bus.on('economy:grantCredits', (p) => {
    state.player.credits += Math.max(0, Math.round(p.amount || 0));
  });
  peers.set('economy', economy);
  if (economy.markets) state.economy = { markets: economy.markets };
  const sys = { ...claimsBase };
  sys.init(ctx);
  if (!state.claims) state.claims = { bodies: [] };
  return { state, bus, sys, registry };
}

function runSim(h, seconds, dt = 0.1) {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    h.state.simTime += dt;
    h.sys.update(dt, h.state);
  }
}

function commissionRelay(h) {
  assert.equal(h.sys.claim({ id: 'poi_claim_pallas', name: 'Pallas Industrial Moon', size: 'M', pos: { x: 20, z: 0 } }), true);
  const body = h.state.claims.bodies.at(-1);
  assert.equal(h.sys.buildModule(body.id, RELAY_DEF.requiresModule), true);
  assert.equal(h.sys.specialize(body.id, 'spec_relay'), true);
  addCargo(h.state, GOOD, 60);
  assert.equal(h.sys.deliverToClaim(body.id, GOOD, 60), 60, 'site accepted the freight');
  return body;
}

function dispatchConvoy(h, body) {
  body.spec.nextDispatchAt = h.state.simTime;
  runSim(h, 0.2, 0.1);
  assert.ok(body.spec.convoy && body.spec.convoy.convoyId, 'a convoy leg departed');
  return body.spec.convoy;
}

// The exact berth path the claims owner consumes: traffic manifests the hull, then the same
// hull's unload reports how much freight is still aboard and how much was recovered loose.
function berth(h, body, convoy, { aboard, recoverable = 0 }) {
  h.bus.emit('claim:convoyManifested', {
    bodyId: body.id,
    convoyId: convoy.convoyId,
    entityId: 991001,
    worldRecordId: convoy.worldRecordId,
  });
  h.bus.emit('claim:convoyDocked', {
    bodyId: body.id,
    convoyId: convoy.convoyId,
    stationId: convoy.destStationId,
    goodId: convoy.goodId,
    qty: aboard,
    recoverableQty: recoverable,
    entityId: 991001,
  });
}

const receiptsOf = (body, kind) => (body.spec.receipts || []).filter((r) => r.kind === kind);
const grants = (h, reason) =>
  h.bus.emitLog.filter((e) => e.evt === 'economy:grantCredits' && (!reason || e.payload.reason === reason));

test('a short convoy names sold, recovered and lost units — revenue covers only the sold lot', () => {
  const h = boot();
  const body = commissionRelay(h);
  const convoy = dispatchConvoy(h, body);
  const departed = convoy.qty;
  const aboard = departed - 14;
  const recoverable = 4;
  const expectedLost = departed - aboard - recoverable; // 10
  const creditsBefore = h.state.player.credits;
  const soldBefore = body.spec.totals.soldTotalCr;

  berth(h, body, convoy, { aboard, recoverable });

  const recovered = receiptsOf(body, 'convoy_recovered');
  const lost = receiptsOf(body, 'convoy_partial_loss');
  const sold = receiptsOf(body, 'convoy_sold');
  const returned = receiptsOf(body, 'convoy_returned');
  assert.equal(recovered.length, 1, 'recovered freight is its own named result');
  assert.equal(lost.length, 1, 'lost freight is its own named result');
  assert.equal(sold.length, 1, 'the sold lot is its own named result');
  assert.equal(returned.length, 0, 'a priced destination never fabricates a return');
  assert.equal(recovered[0].data.qty, recoverable);
  assert.equal(lost[0].data.qty, expectedLost);
  assert.equal(sold[0].data.qty, aboard);

  // The result reconciles to the shipment that departed — no unit vanishes unnamed and no
  // remainder unit is counted twice.
  const namedTotal = sold[0].data.qty + recovered[0].data.qty + lost[0].data.qty;
  assert.equal(namedTotal, departed, 'sold + recovered + lost names every departed unit');

  // Revenue is the sold lot only — the recovered and lost units are never booked as profit.
  const expectedRevenue = Math.round(aboard * UNIT * (1 - RELAY_DEF.saleFee));
  assert.equal(sold[0].data.revenueCr, expectedRevenue);
  assert.notEqual(sold[0].data.revenueCr, Math.round(departed * UNIT * (1 - RELAY_DEF.saleFee)),
    'the lost and recovered units do not inflate the sale');
  assert.equal(body.spec.totals.soldTotalCr - soldBefore, expectedRevenue);
  assert.equal(body.spec.totals.lostU, expectedLost, 'lost units book to the loss column');
  assert.equal(h.state.player.credits - creditsBefore, expectedRevenue);
  const saleGrants = grants(h, 'claim_relay_sale');
  assert.equal(saleGrants.length, 1, 'exactly one sale grant');
  assert.equal(saleGrants[0].payload.amount, expectedRevenue);

  // Recovered freight lands back in the site store — it is stock again, not revenue.
  assert.equal(body.spec.store.input[GOOD] || 0, recoverable);
  assert.equal(body.spec.convoy, null, 'the leg is closed after the berth result');
});

test('an unsellable remainder is named returned — never profit', () => {
  const h = boot({ economy: makeEconomyStub({}) }); // no station lists the good
  const body = commissionRelay(h);
  const convoy = dispatchConvoy(h, body);
  const departed = convoy.qty;
  const aboard = departed - 5;
  const creditsBefore = h.state.player.credits;

  berth(h, body, convoy, { aboard, recoverable: 0 });

  const returned = receiptsOf(body, 'convoy_returned');
  const lost = receiptsOf(body, 'convoy_partial_loss');
  const sold = receiptsOf(body, 'convoy_sold');
  assert.equal(returned.length, 1, 'the unsold remainder is named returned');
  assert.equal(lost.length, 1, 'the en-route spill is named lost');
  assert.equal(sold.length, 0, 'nothing was sold — no sale receipt');
  assert.equal(returned[0].data.qty, aboard);
  assert.equal(returned[0].data.missingPrice, true, 'the return names the missing price');
  assert.equal(lost[0].data.qty, 5);
  assert.equal(returned[0].data.qty + lost[0].data.qty, departed,
    'returned + lost reconciles the whole shipment');

  // Returned freight goes back to the site store once — it is inventory, not income.
  assert.equal(body.spec.store.input[GOOD] || 0, aboard);
  assert.equal(grants(h, 'claim_relay_sale').length, 0, 'no sale grant was fabricated');
  assert.equal(h.state.player.credits, creditsBefore, 'returned freight never earns');
  assert.equal(body.spec.totals.soldTotalCr, 0, 'no revenue was booked');
  assert.equal(body.spec.totals.lostU, 5);
});

test('a clean full arrival still sells the whole lot — neighboring success', () => {
  const h = boot();
  const body = commissionRelay(h);
  const convoy = dispatchConvoy(h, body);
  const departed = convoy.qty;

  berth(h, body, convoy, { aboard: departed, recoverable: 0 });

  const sold = receiptsOf(body, 'convoy_sold');
  assert.equal(sold.length, 1);
  assert.equal(sold[0].data.qty, departed, 'every unit sold');
  assert.equal(receiptsOf(body, 'convoy_partial_loss').length, 0);
  assert.equal(receiptsOf(body, 'convoy_recovered').length, 0);
  assert.equal(receiptsOf(body, 'convoy_returned').length, 0);
  assert.equal(body.spec.totals.lostU, 0, 'no loss on a clean run');
  assert.equal(body.spec.store.input[GOOD] || 0, 0, 'sold freight does not come back as stock');
  const expectedRevenue = Math.round(departed * UNIT * (1 - RELAY_DEF.saleFee));
  assert.equal(body.spec.totals.soldTotalCr, expectedRevenue);
});
