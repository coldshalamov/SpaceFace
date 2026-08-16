// Physical claim-carrier custody (schema claim_carrier_v1).
//
// The lock this proves: ONE shipment record owns the freight from the moment it leaves the site
// store until exactly one settlement puts it somewhere real. Nothing abstract may take it — a
// seeded danger roll may only SCHEDULE a telegraphed cut; the cargo can only actually be lost to
// a physical outcome the player could be present for (a destroyed hull, an encounter that really
// began, or a manifest stripped to zero).
import test from 'node:test';
import assert from 'node:assert/strict';

import { claims as claimsBase, CARRIER_INTERCEPT_WARNING_S } from '../src/systems/claims.js';

const FRONTIER = 'sector_io_reach';        // low security — the only place a cut can be rolled
const STATION_ID = 'station_io_anchor';
const STATION_POS = { x: 2200, z: -120 };

function busHarness() {
  const handlers = new Map();
  const log = [];
  return {
    log,
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    off() {},
    emit(name, payload) {
      log.push({ name, payload });
      for (const fn of (handlers.get(name) || []).slice()) fn(payload);
    },
  };
}

function relayBody() {
  return {
    id: 'claim_relay',
    sectorId: FRONTIER,
    poiId: 'poi_claim_relay',
    name: 'Pallas Depot',
    size: 'M',
    slots: 3,
    modules: ['mod_depot'],
    linkedStationId: STATION_ID,
    x: 200,
    z: -120,
    claimedAt: 100,
    owned: true,
    spec: {
      id: 'spec_relay',
      since: 100,
      status: 'active',
      statusUntil: 0,
      store: { input: { cmdty_ore_iron: 60 }, output: {} },
      convoy: null,
      acc: 0,
      nextDispatchAt: 0,
      destStationId: STATION_ID,
      upkeepDebt: 0,
      deterrenceUntil: 0,
      outputFull: false,
      receipts: [],
      defense: null,
      totals: { refinedTotalU: 0, soldTotalCr: 0, lostU: 0, upkeepPaidCr: 0, raidsRepelled: 0, raidsSuffered: 0 },
    },
  };
}

// A minimal world: one player, one real station entity (the carrier route only resolves against a
// live station), and spawn/remove helpers that behave like the sim's — notably removeEntity does
// NOT emit entity:killed, so releasing a hull can never be mistaken for losing one.
function boot({ price = 40, director = null, sectorId = FRONTIER } = {}) {
  const bus = busHarness();
  const state = {
    simTime: 1000,
    tick: 60000,
    mode: 'flight',
    meta: { seed: 47 },
    playerId: 'player',
    player: { credits: 5000, stats: {}, cargo: { items: {} } },
    onboarding: { active: false, finished: true },
    world: { currentSectorId: sectorId },
    nav: { waypoint: null },
    entities: new Map(),
    entityList: [],
    claims: { bodies: [relayBody()], specVersion: 1, meta: { rngSeed: 5, upkeepAccum: 0, raidAccum: 0, nextRaidId: 1, nextCarrierId: 1 } },
    factions: Object.freeze({}),
  };
  const player = { id: 'player', alive: true, type: 'ship', pos: { x: -4000, z: -4000 }, vel: { x: 0, z: 0 }, data: {} };
  state.entities.set('player', player);
  state.entityList.push(player);
  const station = {
    id: 'station_1', alive: true, type: 'station',
    pos: { ...STATION_POS }, data: { stationId: STATION_ID, name: 'Io Anchor' },
  };
  state.entities.set(station.id, station);
  state.entityList.push(station);

  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const entity = Object.assign({ id: `e_${nextId++}`, alive: true, vel: { x: 0, z: 0 } }, spec);
      entity.pos = { ...(spec.pos || { x: 0, z: 0 }) };
      entity.data = Object.assign({}, spec.data);
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (!entity) return false;
      entity.alive = false;
      state.entities.delete(id);
      const i = state.entityList.indexOf(entity);
      if (i >= 0) state.entityList.splice(i, 1);
      return true;                                  // deliberately silent: a release is not a kill
    },
  };
  const peers = new Map();
  const sold = [];
  peers.set('economy', {
    priceOf(stationId, goodId, side) {
      sold.push({ stationId, goodId, side });
      return price;
    },
  });
  if (director) peers.set('encounterDirector', director);

  const sys = Object.create(claimsBase);
  sys.init({ state, bus, helpers, registry: { get: (name) => peers.get(name) || null } });
  return { state, bus, sys, helpers, player, station, sold, body: state.claims.bodies[0] };
}

function emitted(h, name) {
  return h.bus.log.filter((event) => event.name === name);
}

function step(h, dt = 1) {
  h.state.simTime += dt;
  h.sys.update(dt, h.state);
}

/** Drive the relay until it has a carrier away, then hand back that one record. */
function dispatchOne(h) {
  step(h, 1);
  const carrier = h.body.spec.convoy;
  assert.ok(carrier, 'relay dispatched a carrier');
  return carrier;
}

/** Arm a telegraphed cut on the live record without depending on the danger roll landing. */
function armCut(h, carrier) {
  const cut = carrier.intercept;
  cut.rolled = true;
  cut.phase = 'telegraphed';
  cut.warnedAt = h.state.simTime;
  cut.strikeAt = h.state.simTime + CARRIER_INTERCEPT_WARNING_S;
  cut.attackerFactionId = 'faction_reach';
  cut.attackerName = 'Reach cutters';
  cut.attackerCount = 3;
  carrier.holdSince = h.state.simTime;
  return cut;
}

function carrierHulls(h, carrierId) {
  return h.state.entityList.filter((e) => e && e.data && e.data.claimCarrierId === carrierId);
}

// ── 1. Custody transfers exactly once ────────────────────────────────────────────────────────
test('dispatch moves freight out of the site store into one manifest, once', () => {
  const h = boot();
  const before = h.body.spec.store.input.cmdty_ore_iron;
  const carrier = dispatchOne(h);

  assert.equal(carrier.schema, 'claim_carrier_v1');
  assert.equal(carrier.custody, 'carrier');
  assert.equal(carrier.qty, 60);
  assert.deepEqual(carrier.manifest, [{ goodId: 'cmdty_ore_iron', qty: 60 }]);
  assert.equal(h.body.spec.store.input.cmdty_ore_iron, undefined, 'units left the store, not copied');
  assert.equal(before, 60);
  assert.equal(emitted(h, 'claim:carrierDispatched').length, 1);

  // ticking does not re-dispatch or re-charge the store while a carrier is away
  const storeSnapshot = JSON.stringify(h.body.spec.store);
  for (let i = 0; i < 20; i++) step(h, 1);
  assert.equal(h.body.spec.convoy, carrier, 'the same record is still the one in flight');
  assert.equal(carrier.qty, 60);
  assert.equal(JSON.stringify(h.body.spec.store), storeSnapshot);
  assert.equal(emitted(h, 'claim:carrierDispatched').length, 1);
});

// ── 2. An off-sector cut may warn, never delete ──────────────────────────────────────────────
test('a strike that comes due with the player elsewhere holds the freight instead of taking it', () => {
  const h = boot();
  const carrier = dispatchOne(h);
  armCut(h, carrier);
  h.state.world.currentSectorId = 'sector_earth_orbit';   // player is a sector away
  h.bus.emit('sector:exit', { sectorId: FRONTIER });

  // run well past the strike AND well past the original arrival time
  for (let i = 0; i < 400; i++) step(h, 1);

  assert.equal(h.body.spec.convoy, carrier, 'the same shipment record survives');
  assert.equal(carrier.settlement, null, 'nothing settled off-screen');
  assert.equal(carrier.qty, 60);
  assert.deepEqual(carrier.manifest, [{ goodId: 'cmdty_ore_iron', qty: 60 }]);
  assert.equal(carrier.custody, 'carrier');
  assert.equal(h.body.spec.totals.lostU, 0, 'no abstract loss was booked');
  assert.equal(h.body.spec.totals.soldTotalCr, 0, 'and it did not sneak an arrival either');
  assert.equal(emitted(h, 'claim:carrierSettled').length, 0);
  assert.equal(emitted(h, 'economy:grantCredits').length, 0);
  assert.equal(carrierHulls(h, carrier.id).length, 0, 'no hull exists while out of sector');

  // the threat is still announced — it is a warning, and it announces itself only once
  const held = emitted(h, 'claim:carrierHeld');
  assert.equal(held.length, 1);
  assert.equal(held[0].payload.carrierId, carrier.id);
  assert.equal(held[0].payload.qty, 60);
  assert.equal(carrier.intercept.phase, 'telegraphed', 'the cut is still pending a real outcome');
  assert.equal(carrier.progress < 1, true, 'the held run never coasts to arrival');
});

test('an in-sector strike the player is nowhere near also holds rather than settling', () => {
  const h = boot();
  const carrier = dispatchOne(h);
  armCut(h, carrier);
  h.player.pos = { x: 9000, z: 9000 };                    // in sector, far from the freight

  for (let i = 0; i < 200; i++) step(h, 1);

  assert.equal(h.body.spec.convoy, carrier);
  assert.equal(carrier.settlement, null);
  assert.equal(carrier.qty, 60);
  assert.equal(h.body.spec.totals.lostU, 0);
  assert.equal(emitted(h, 'claim:carrierSettled').length, 0);
});

// ── 3. Entering the sector binds the record to exactly one hull ──────────────────────────────
test('sharing the carrier sector materializes exactly one hull, and re-entry never duplicates it', () => {
  const h = boot();
  const carrier = dispatchOne(h);
  step(h, 20);

  const hulls = carrierHulls(h, carrier.id);
  assert.equal(hulls.length, 1, 'one record, one body');
  assert.equal(carrier.materialized, true);
  assert.equal(carrier.entityId, hulls[0].id);
  assert.equal(hulls[0].data.claimId, h.body.id);
  // the hull is a display body: its manifest copy is not custody
  assert.deepEqual(hulls[0].data.claimCarrierManifest, [{ goodId: 'cmdty_ore_iron', qty: 60 }]);
  assert.equal(emitted(h, 'claim:carrierMaterialized').length, 1);

  // many more ticks in-sector still bind one hull
  for (let i = 0; i < 30; i++) step(h, 1);
  assert.equal(carrierHulls(h, carrier.id).length, 1);
  assert.equal(emitted(h, 'claim:carrierMaterialized').length, 1);

  // leaving releases the body without touching the record or the cargo
  h.state.world.currentSectorId = 'sector_earth_orbit';
  h.bus.emit('sector:exit', { sectorId: FRONTIER });
  assert.equal(carrierHulls(h, carrier.id).length, 0);
  assert.equal(carrier.entityId, null);
  assert.equal(carrier.materialized, false);
  assert.equal(h.body.spec.convoy, carrier, 'release is not a kill');
  assert.equal(carrier.settlement, null);
  assert.equal(carrier.qty, 60);

  // coming back re-binds the SAME record to ONE new hull
  h.state.world.currentSectorId = FRONTIER;
  step(h, 1);
  assert.equal(carrierHulls(h, carrier.id).length, 1);
  assert.equal(emitted(h, 'claim:carrierMaterialized').length, 2);
  assert.equal(h.body.spec.convoy, carrier);
});

// ── 4. One settlement, whatever fires twice ──────────────────────────────────────────────────
test('a destroyed hull settles the freight lost exactly once, and a repeat kill event changes nothing', () => {
  const h = boot();
  const carrier = dispatchOne(h);
  step(h, 20);
  const hull = carrierHulls(h, carrier.id)[0];
  assert.ok(hull);

  h.bus.emit('entity:killed', { id: hull.id });
  assert.equal(h.body.spec.convoy, null, 'the record settled and left the site');
  assert.equal(h.body.spec.totals.lostU, 60);
  const settled = emitted(h, 'claim:carrierSettled');
  assert.equal(settled.length, 1);
  assert.equal(settled[0].payload.outcome, 'lost');
  assert.equal(settled[0].payload.cause, 'hull_destroyed');
  assert.equal(settled[0].payload.lostU, 60);
  assert.equal(h.body.spec.lastCarrierSettlement.carrierId, carrier.id);

  h.bus.emit('entity:killed', { id: hull.id });
  h.bus.emit('entity:killed', { id: hull.id });
  assert.equal(h.body.spec.totals.lostU, 60, 'a duplicate kill cannot book the loss twice');
  assert.equal(emitted(h, 'claim:carrierSettled').length, 1);
  assert.equal(h.body.spec.convoy, null);
});

test('arrival settles once — later ticks cannot sell the same shipment again', () => {
  const h = boot({ price: 40 });
  const carrier = dispatchOne(h);
  for (let i = 0; i < 200; i++) step(h, 1);          // transitS is 90s; run far past it

  assert.equal(h.body.spec.convoy, null);
  const settled = emitted(h, 'claim:carrierSettled');
  assert.equal(settled.length, 1);
  assert.equal(settled[0].payload.outcome, 'arrived');
  const grants = emitted(h, 'economy:grantCredits');
  assert.equal(grants.length, 1, 'sold exactly once');
  assert.equal(grants[0].payload.amount, Math.round(60 * 40 * 0.8));
  assert.equal(h.body.spec.totals.soldTotalCr, grants[0].payload.amount);
  assert.equal(emitted(h, 'economy:applyTradePressure').length, 1);
  assert.equal(carrierHulls(h, carrier.id).length, 0, 'the hull leaves with the record');

  // the settled record cannot be re-settled by anything
  assert.equal(h.sys._settleCarrier(h.body, 'arrived', {}), false);
  h.bus.emit('entity:killed', { id: carrier.entityId || 'e_missing' });
  assert.equal(emitted(h, 'economy:grantCredits').length, 1);
  assert.equal(emitted(h, 'claim:carrierSettled').length, 1);
  assert.equal(h.body.spec.totals.lostU, 0);
});

test('a duplicate encounter verdict cannot strip the manifest twice or settle twice', () => {
  const requests = [];
  const director = {
    requestClaimDefense(payload) {
      requests.push(payload);
      return { ok: true, encounterId: payload.encounterId };
    },
  };
  const h = boot({ director });
  const carrier = dispatchOne(h);
  step(h, 20);
  const cut = armCut(h, carrier);
  h.player.pos = { x: carrier.pos.x + 30, z: carrier.pos.z };
  h.state.simTime = cut.strikeAt;
  h.sys.update(1, h.state);

  assert.equal(cut.phase, 'engaged', 'presence at the freight turns the cut into a real fight');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].defenseId, carrier.id);

  const verdict = { encounterId: cut.encounterId, shape: 'claim_threat', outcome: 'partial', sectorId: FRONTIER };
  h.bus.emit('encounter:resolved', verdict);
  const afterFirst = carrier.qty;
  const lostAfterFirst = h.body.spec.totals.lostU;
  assert.ok(afterFirst > 0 && afterFirst < 60, 'a mauled run bleeds but keeps flying');
  assert.equal(lostAfterFirst, 60 - afterFirst);
  assert.equal(carrier.settlement, null);

  h.bus.emit('encounter:resolved', verdict);
  h.bus.emit('encounter:resolved', verdict);
  assert.equal(carrier.qty, afterFirst, 'a repeated verdict cannot strip the manifest again');
  assert.equal(h.body.spec.totals.lostU, lostAfterFirst);
  assert.equal(h.body.spec.convoy, carrier);
  assert.equal(emitted(h, 'claim:carrierSettled').length, 0);
});

// ── 5. Arrival: sell once, or bring the goods home ───────────────────────────────────────────
test('with no market truth at the destination the freight comes home instead of being priced', () => {
  const h = boot();
  // the destination has no sell price — the system must never fabricate one
  h.sys.ctx.registry.get('economy').priceOf = () => null;
  dispatchOne(h);
  for (let i = 0; i < 200; i++) step(h, 1);

  assert.equal(h.body.spec.convoy, null);
  assert.equal(emitted(h, 'economy:grantCredits').length, 0, 'no invented revenue');
  assert.equal(h.body.spec.store.input.cmdty_ore_iron, 60, 'every unit returned to the site store');
  assert.equal(h.body.spec.totals.lostU, 0);
  assert.equal(h.body.spec.totals.soldTotalCr, 0);
  const settled = emitted(h, 'claim:carrierSettled');
  assert.equal(settled.length, 1);
  assert.equal(settled[0].payload.outcome, 'arrived');
  assert.equal(settled[0].payload.returnedU, 60);
  assert.equal(h.body.spec.lastCarrierSettlement.returnedU, 60);
});

// ── 6. Save / load continues the same shipment ───────────────────────────────────────────────
test('save and reload resume the one record without duplicating the entity or the manifest', () => {
  const h = boot();
  const carrier = dispatchOne(h);
  step(h, 20);
  assert.equal(carrierHulls(h, carrier.id).length, 1, 'a hull is live at save time');
  const snap = h.sys.serialize();
  const expected = {
    id: carrier.id,
    manifest: carrier.manifest.map((line) => ({ ...line })),
    qty: carrier.qty,
    destStationId: carrier.destStationId,
    departedAt: carrier.departedAt,
    transitS: carrier.transitS,
  };

  const h2 = boot();
  h2.sys.deserialize(snap);
  const restoredBody = h2.state.claims.bodies[0];
  const restored = restoredBody.spec.convoy;
  assert.ok(restored, 'the shipment resumed');
  assert.equal(restored.id, expected.id, 'the SAME record, not a new one');
  assert.deepEqual(restored.manifest, expected.manifest, 'the manifest is continued, not re-created');
  assert.equal(restored.qty, expected.qty);
  assert.equal(restored.destStationId, expected.destStationId);
  assert.equal(restored.departedAt, expected.departedAt);
  assert.equal(restored.transitS, expected.transitS);
  assert.equal(restored.settlement, null);
  assert.equal(restored.entityId, null, 'no entity id survives the load');
  assert.equal(restored.materialized, false);
  assert.equal(restoredBody.spec.store.input.cmdty_ore_iron, undefined, 'freight was not refunded on load');
  assert.equal(carrierHulls(h2, restored.id).length, 0, 'load alone spawns nothing');

  // resuming in-sector re-binds ONE hull to the restored record, and the run still completes once
  step(h2, 1);
  assert.equal(carrierHulls(h2, restored.id).length, 1);
  assert.equal(restoredBody.spec.convoy, restored);
  for (let i = 0; i < 200; i++) step(h2, 1);
  assert.equal(restoredBody.spec.convoy, null);
  assert.equal(emitted(h2, 'claim:carrierSettled').length, 1);
  assert.equal(emitted(h2, 'economy:grantCredits').length, 1, 'the resumed shipment sells exactly once');
  assert.equal(carrierHulls(h2, restored.id).length, 0);
});

test('a save taken mid-threat reloads still holding the freight, not settled', () => {
  const h = boot();
  const carrier = dispatchOne(h);
  armCut(h, carrier);
  h.state.world.currentSectorId = 'sector_earth_orbit';
  h.bus.emit('sector:exit', { sectorId: FRONTIER });
  for (let i = 0; i < 300; i++) step(h, 1);
  assert.equal(h.body.spec.convoy, carrier, 'still held before the save');

  const h2 = boot({ sectorId: 'sector_earth_orbit' });
  h2.sys.deserialize(h.sys.serialize());
  const restored = h2.state.claims.bodies[0].spec.convoy;
  assert.ok(restored);
  assert.equal(restored.qty, 60);
  assert.equal(restored.settlement, null);

  for (let i = 0; i < 300; i++) step(h2, 1);
  assert.equal(h2.state.claims.bodies[0].spec.convoy, restored, 'still nobody there, still not taken');
  assert.equal(restored.qty, 60);
  assert.equal(h2.state.claims.bodies[0].spec.totals.lostU, 0);
  assert.equal(emitted(h2, 'claim:carrierSettled').length, 0);
});
