// SF-273 — An interrupted cargo handoff conserves the same lot.
// Scope: the asteroid-site courier pod is the player-facing cargo handoff (launch buffer ->
// in-flight custody -> one settled receipt). These tests prove the lot is conserved exactly
// once across save/load — including the malformed/old-save counterexamples the honest route
// cannot reach: unrecoverable pods refund to the buffer, settled intents never pay twice, and
// a seal that cannot complete returns the lot instead of crashing the site tick.
import test from 'node:test';
import assert from 'node:assert/strict';

import { asteroidSites } from '../src/systems/asteroidSites.js';
import { SITE_BALANCE } from '../src/data/sites.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { ensureShipment, shipmentQty } from '../src/systems/cargoCustody.js';
import { storeTotal } from '../src/systems/siteLogistics.js';

const SITE_ID = 'site_7';

function makeBus() {
  const handlers = new Map();
  return {
    events: [],
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
      return () => {};
    },
    emit(name, payload) {
      this.events.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload || {});
    },
  };
}

function makeHarness() {
  const bus = makeBus();
  const entities = new Map();
  const entityList = [];
  const state = {
    simTime: 0,
    tick: 0,
    meta: { seed: 273 },
    entities,
    entityList,
    freeIds: [],
    playerId: 1,
    player: { cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 } },
    world: { currentSectorId: 'sector_helios_prime' },
    content: { commodities: COMMODITIES },
  };
  let nextId = 900;
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, flags: {}, vel: { x: 0, z: 0 }, ...spec };
      entity.data = spec.data || {};
      entities.set(entity.id, entity);
      entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = entities.get(id);
      if (entity) entity.alive = false;
    },
  };
  const passiveCalls = [];
  const registry = {
    get(name) {
      if (name === 'automation') {
        return {
          creditPassive(gross, source) {
            const credited = Math.round(gross);
            passiveCalls.push({ gross, source, credited });
            return credited;
          },
        };
      }
      return null;
    },
  };
  const sys = Object.create(asteroidSites);
  sys.init({ state, bus, helpers, registry });
  return { sys, state, bus, helpers, entities, passiveCalls };
}

function sitePayload(overrides = {}) {
  return {
    id: SITE_ID,
    createdT: 0,
    sectorId: 'sector_helios_prime',
    fieldId: 'field_1',
    anchored: true,
    asteroidId: 42,
    boreSeed: 42,
    anchor: { x: 10, z: 10, radius: 9, typeId: 'ast_common_rock', yieldU: 18 },
    cleared: [],
    machines: [],
    nextMachineNum: 1,
    overlays: { power: [], lane: [] },
    laneStores: [],
    exportOff: {},
    exportBuffer: {},
    fleet: { podsReady: 1, podTarget: 4, inFlight: [], launches: 0, delivered: 0, lost: 0, lastLaunchT: -1e9 },
    ledger: [],
    stats: { grossCr: 0, creditedCr: 0, exportedU: 0 },
    ...overrides,
  };
}

function sitesBlob(sites, extra = {}) {
  return {
    schemaVersion: 1,
    nextSiteNum: 8,
    order: sites.map((s) => s.id),
    byId: Object.fromEntries(sites.map((s) => [s.id, s])),
    meta: { rngSeed: 7 },
    ...extra,
  };
}

function bootSite(h, overrides) {
  h.sys.deserialize(sitesBlob([sitePayload(overrides)]));
  return h.sys.getSite(SITE_ID);
}

function validPod(overrides = {}) {
  return {
    launchT: 10,
    arriveT: 60,
    cargo: { cmdty_silicate: 5 },
    lost: false,
    stationId: 'station_helios',
    stationName: 'Helios Dock',
    intentId: 'site-sale:site_7:1',
    worldRecordId: 'site:site_7:pod:1',
    ...overrides,
  };
}

test('SF-273 a pod launched before the save settles its lot exactly once across two reloads', () => {
  const h = makeHarness();
  const site = bootSite(h, { exportBuffer: { cmdty_silicate: SITE_BALANCE.podCapacity } });
  h.sys._tryLaunch(site, h.state, {});
  assert.equal(site.fleet.inFlight.length, 1);
  assert.equal(storeTotal(site.exportBuffer), 0, 'the lot left the buffer at commit');
  const pod = site.fleet.inFlight[0];
  const lotUnits = storeTotal(pod.cargo);
  assert.equal(shipmentQty(site, '_pod'), lotUnits, 'custody holds the in-flight lot');
  const saved = JSON.parse(JSON.stringify(h.sys.serialize()));

  // First reload: the same pod resolves at arrival — one receipt, one credit event.
  const h2 = makeHarness();
  h2.sys.deserialize(saved);
  const restored = h2.sys.getSite(SITE_ID);
  assert.equal(restored.fleet.inFlight.length, 1, 'the interrupted handoff survives the load');
  assert.equal(shipmentQty(restored, '_pod'), lotUnits);
  h2.state.simTime = restored.fleet.inFlight[0].arriveT + 1;
  h2.sys._resolvePods(restored, h2.state);
  assert.equal(restored.fleet.inFlight.length, 0);
  const receipt = restored.saleReceipts[pod.intentId];
  assert.ok(receipt, 'the settled handoff leaves its receipt');
  assert.equal(receipt.receipt.id, pod.intentId);
  const settled = pod.lost ? 'lost' : 'delivered';
  assert.equal(restored.fleet[settled], 1);
  assert.equal(h2.passiveCalls.length, pod.lost ? 0 : 1, 'the lot pays once, never twice');
  assert.equal(shipmentQty(restored, '_pod'), 0, 'custody is empty after the handoff completes');
  const credited = restored.stats.creditedCr;

  // Second reload: the receipt dedupes — the same lot cannot pay again.
  const h3 = makeHarness();
  h3.sys.deserialize(JSON.parse(JSON.stringify(h2.sys.serialize())));
  const again = h3.sys.getSite(SITE_ID);
  h3.state.simTime += 120;
  h3.sys._resolvePods(again, h3.state);
  assert.equal(h3.passiveCalls.length, 0);
  assert.equal(again.stats.creditedCr, credited);
  assert.equal(storeTotal(again.exportBuffer), 0, 'no phantom lot materialized');
});

test('SF-273 a pod whose intent already settled is retired without refunding its ghost', () => {
  const h = makeHarness();
  // Corrupt save: the sale already paid (receipt exists) AND a copy of the lot still claims to
  // be in flight. Both cannot be real — the settled receipt is durable truth.
  const site = bootSite(h, {
    exportBuffer: { cmdty_ore_iron: 3 },
    fleet: {
      podsReady: 0, podTarget: 4, launches: 1, delivered: 1, lost: 0, lastLaunchT: 10,
      inFlight: [validPod({ intentId: 'site-sale:site_7:1' })],
    },
    shipment: { items: { _pod: 5 } },
    saleReceipts: {
      'site-sale:site_7:1': {
        fingerprint: 'settled',
        receipt: { id: 'site-sale:site_7:1', quantity: 5, credited: 90, total: 90 },
      },
    },
  });
  assert.equal(site.fleet.inFlight.length, 0, 'the ghost pod is retired at restore');
  assert.equal(shipmentQty(site, '_pod'), 0, 'custody reseats to the surviving lot (none)');
  assert.equal(storeTotal(site.exportBuffer), 3,
    'a settled lot is not refunded — refunding would clone goods that were already sold');
  h.state.simTime = 500;
  h.sys.update(1, h.state);
  assert.equal(h.passiveCalls.length, 0, 'no second sale of the same intent');
  assert.equal(site.fleet.delivered, 1);
});

test('SF-273 unrecoverable in-flight records return their lot to the launch buffer', () => {
  const h = makeHarness();
  const site = bootSite(h, {
    fleet: {
      podsReady: 0, podTarget: 4, launches: 3, delivered: 0, lost: 0, lastLaunchT: 10,
      inFlight: [
        { launchT: 5, arriveT: 'whenever', cargo: { cmdty_silicate: 12 }, intentId: 'a' }, // no honest arrive time
        { launchT: 6, arriveT: 70, cargo: {}, intentId: 'b' },                            // no lot recorded
        'not-a-pod',
        { launchT: 7, arriveT: 80, cargo: { cmdty_ore_iron: 4.7 }, intentId: 'c' },        // whole units only
      ],
    },
    shipment: { items: { _pod: 99 } },
  });
  assert.equal(site.fleet.inFlight.length, 1, 'only the recoverable pod resumes');
  const pod = site.fleet.inFlight[0];
  assert.equal(pod.intentId, 'c');
  assert.deepEqual(pod.cargo, { cmdty_ore_iron: 4 }, 'pod cargo floors to honest whole units');
  assert.equal(site.exportBuffer.cmdty_silicate, 12, 'the unrecoverable lot came home, it did not vanish');
  assert.equal(shipmentQty(site, '_pod'), 4, 'custody reseats to the lot still in flight');
});

test('SF-273 custody reseats to the in-flight lot — neither fabricated nor stranded', () => {
  const h = makeHarness();
  // Corrupt: custody claims 9999 in-flight units, only one 5u pod is real.
  const site = bootSite(h, {
    fleet: {
      podsReady: 0, podTarget: 4, launches: 1, delivered: 0, lost: 0, lastLaunchT: 10,
      inFlight: [validPod({ cargo: { cmdty_silicate: 5 } })],
    },
    shipment: { items: { _pod: 9999, cmdty_electronics: 2 } },
  });
  assert.equal(shipmentQty(site, '_pod'), 5, 'phantom custody is not sellable later');
  assert.equal(shipmentQty(site, 'cmdty_electronics'), 2, 'unrelated custody keys are preserved');

  h.state.simTime = 500;
  h.sys._resolvePods(site, h.state);
  const sold = h.passiveCalls.length;
  assert.equal(site.fleet.inFlight.length, 0);
  assert.equal(shipmentQty(site, '_pod'), 0, 'the lot sells once — nothing lingers to sell again');
  assert.equal(site.stats.exportedU, 5);

  // Reload and resolve again: the residue that a corrupt save smuggled in is gone for good.
  const h2 = makeHarness();
  h2.sys.deserialize(JSON.parse(JSON.stringify(h.sys.serialize())));
  const restored = h2.sys.getSite(SITE_ID);
  h2.state.simTime = 1000;
  h2.sys.update(1, h2.state);
  assert.equal(h2.passiveCalls.length, 0, 'no second sale from stranded custody');
  assert.equal(sold, site.lost === 1 ? 0 : 1);
});

test('SF-273 two in-flight records naming one intent collapse to the first lot', () => {
  const h = makeHarness();
  const site = bootSite(h, {
    exportBuffer: { cmdty_ore_iron: 2 },
    fleet: {
      podsReady: 0, podTarget: 4, launches: 2, delivered: 0, lost: 0, lastLaunchT: 10,
      inFlight: [
        validPod({ cargo: { cmdty_silicate: 5 }, intentId: 'shared' }),
        validPod({ cargo: { cmdty_electronics: 7 }, intentId: 'shared', launchT: 11 }),
      ],
    },
    shipment: { items: { _pod: 12 } },
  });
  assert.equal(site.fleet.inFlight.length, 1, 'one intent owns one in-flight lot');
  assert.deepEqual(site.fleet.inFlight[0].cargo, { cmdty_silicate: 5 });
  assert.equal(shipmentQty(site, '_pod'), 5);
  assert.equal(storeTotal(site.exportBuffer), 2,
    'the ghost copy is not refunded — the intent already names the real lot');
});

test('SF-273 a seal that cannot complete refunds the lot instead of crashing the tick', () => {
  const h = makeHarness();
  const site = bootSite(h, { fleet: { podsReady: 0, podTarget: 4, inFlight: [], launches: 0, delivered: 0, lost: 0, lastLaunchT: -1e9 } });
  // Corrupt custody: foreign stock fills the shipment cap so the pod's `_pod` top-up cannot
  // cover the lot — commitShipmentSale must refuse (insufficient_stock). Pre-fix, the missing
  // sealed.receipt crashed _resolvePods with a TypeError every single tick.
  ensureShipment(site).items = { cmdty_ore_iron: 9999 };
  site.fleet.inFlight = [validPod({ cargo: { cmdty_silicate: 5 }, intentId: 'blocked' })];
  h.state.simTime = 500;
  assert.doesNotThrow(() => h.sys._resolvePods(site, h.state));
  assert.equal(site.fleet.inFlight.length, 0, 'the failed handoff retires rather than looping');
  assert.equal(site.exportBuffer.cmdty_silicate, 5, 'the lot returns to its current owner');
  assert.equal(h.passiveCalls.length, 0, 'nothing was fabricated');
  assert.equal(Object.keys(site.saleReceipts).length, 0, 'no phantom receipt');
  // And the same refusal payload is now safe through the normal tick path.
  ensureShipment(site).items = { cmdty_ore_iron: 9999 };
  site.fleet.inFlight = [validPod({ cargo: { cmdty_silicate: 3 }, arriveT: 0, intentId: 'blocked-2' })];
  assert.doesNotThrow(() => h.sys.update(1, h.state));
  assert.equal(site.exportBuffer.cmdty_silicate, 8);
});

test('SF-273 a zero-quantity seal refusal also recovers the pod instead of throwing', () => {
  const h = makeHarness();
  const site = bootSite(h, {});
  ensureShipment(site).items = {};
  site.fleet.inFlight = [{ launchT: 1, arriveT: 0, cargo: { cmdty_silicate: 0 }, lost: false, intentId: 'empty' }];
  h.state.simTime = 500;
  assert.doesNotThrow(() => h.sys._resolvePods(site, h.state));
  assert.equal(site.fleet.inFlight.length, 0);
  assert.equal(h.passiveCalls.length, 0);
});

test('SF-273 a lost pod resolves once across the save boundary', () => {
  const h = makeHarness();
  const site = bootSite(h, {
    fleet: {
      podsReady: 0, podTarget: 4, launches: 1, delivered: 0, lost: 0, lastLaunchT: 10,
      inFlight: [validPod({ lost: true, cargo: { cmdty_silicate: 5 } })],
    },
    shipment: { items: { _pod: 5 } },
  });
  h.state.simTime = 500;
  h.sys._resolvePods(site, h.state);
  assert.equal(site.fleet.lost, 1);
  assert.equal(site.fleet.delivered, 0);
  assert.equal(h.passiveCalls.length, 0, 'a lost lot is never credited');
  const receipt = site.saleReceipts['site-sale:site_7:1'];
  assert.equal(receipt.receipt.loss, 5, 'the loss is a once-only receipt');
  assert.equal(shipmentQty(site, '_pod'), 0);

  const h2 = makeHarness();
  h2.sys.deserialize(JSON.parse(JSON.stringify(h.sys.serialize())));
  const restored = h2.sys.getSite(SITE_ID);
  h2.state.simTime = 1000;
  h2.sys.update(1, h2.state);
  assert.equal(restored.fleet.lost, 1, 'the loss does not replay');
  assert.equal(h2.passiveCalls.length, 0);
});

test('SF-273 a pod whose receiver disappeared still settles its lot once', () => {
  const h = makeHarness();
  const site = bootSite(h, {
    fleet: {
      podsReady: 0, podTarget: 4, launches: 1, delivered: 0, lost: 0, lastLaunchT: 10,
      inFlight: [validPod({ stationId: 'station_removed', cargo: { cmdty_silicate: 5 }, lost: false })],
    },
    shipment: { items: { _pod: 5 } },
  });
  h.state.simTime = 500;
  assert.doesNotThrow(() => h.sys._resolvePods(site, h.state));
  assert.equal(site.fleet.inFlight.length, 0);
  // The fallback destination prices at the commodity base rate: the lot settles once — it is
  // neither duplicated nor silently erased.
  const receipt = site.saleReceipts['site-sale:site_7:1'];
  assert.ok(receipt, 'a missing receiver still leaves the once-only receipt');
  assert.equal(receipt.receipt.quantity, 5);
  assert.equal(site.stats.exportedU, 5);
});
