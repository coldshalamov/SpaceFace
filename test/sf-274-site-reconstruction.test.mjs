// SF-274 — Site reconstruction preserves durable player work, not stale machinery phases or
// transient runtime state. Scope: the anchored asteroid-site record is the durable claim —
// machine placement/mode/carry/job, lane stores, buffers, fleet custody and receipts all round-
// trip; `_rt` geo/status caches, world-site materialization and the tick accumulator are rebuilt
// fresh. Counterexample saves (phantom housings, off-grid or colliding placements, corrupt modes/
// jobs/carries, recycled counters) fail closed to safe idle — never a phantom phase replay.
import test from 'node:test';
import assert from 'node:assert/strict';

import { asteroidSites } from '../src/systems/asteroidSites.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { shipmentQty } from '../src/systems/cargoCustody.js';
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
  const state = {
    simTime: 0,
    tick: 0,
    meta: { seed: 274 },
    entities,
    entityList: [],
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
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = entities.get(id);
      if (entity) entity.alive = false;
    },
  };
  const registry = {
    get(name) {
      if (name === 'automation') return { creditPassive: (g) => Math.round(g) };
      return null;
    },
  };
  const sys = Object.create(asteroidSites);
  sys.init({ state, bus, helpers, registry });
  return { sys, state, bus, entities };
}

function sitePayload(overrides = {}) {
  return {
    id: SITE_ID,
    createdT: 5,
    sectorId: 'sector_helios_prime',
    fieldId: 'field_1',
    anchored: true,
    asteroidId: 42,
    boreSeed: 42,
    anchor: { x: 10, z: 10, radius: 9, typeId: 'ast_common_rock', yieldU: 18 },
    cleared: [3, 4, 5],
    machines: [],
    nextMachineNum: 1,
    overlays: { power: [9], lane: [10] },
    laneStores: [],
    exportOff: { cmdty_electronics: true },
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

function busySite() {
  return sitePayload({
    machines: [
      { id: 'm1', defId: 'sm_massline_core', col: 5, row: 5, mode: null, carry: {}, job: null },
      { id: 'm2', defId: 'sm_refinery', col: 7, row: 5, mode: 'sr_fuse_silica', carry: { cmdty_purified_silica: 0.5 }, job: null },
      {
        id: 'm3', defId: 'sm_fabricator', col: 9, row: 5, mode: 'sr_cast_regocrete',
        carry: {}, job: { recipeId: 'sr_cast_regocrete', progressS: 12.5 },
      },
      { id: 'm4', defId: 'sm_cargo_port', col: 11, row: 5, mode: null, carry: {}, job: null },
    ],
    nextMachineNum: 4,
    laneStores: [{ cells: [14, 15], store: { cmdty_ore_iron: 3.5, cmdty_silicate: 1.25 } }],
    exportBuffer: { cmdty_silicate: 9.5 },
    fleet: {
      podsReady: 2, podTarget: 4, launches: 3, delivered: 1, lost: 1, lastLaunchT: 40,
      inFlight: [{
        launchT: 40, arriveT: 120, cargo: { cmdty_ore_iron: 6 }, lost: false,
        stationId: 'station_helios', stationName: 'Helios Dock',
        intentId: 'site-sale:site_7:3', worldRecordId: 'site:site_7:pod:3',
      }],
    },
    shipment: { id: 'shipment:site_7', owner: 'operation:site_7', origin: 'sector_helios_prime', destination: null, items: { _pod: 6 }, deliveryState: 'loading' },
    saleReceipts: {
      'site-sale:site_7:2': {
        fingerprint: 'lost:site-sale:site_7:2',
        receipt: { id: 'site-sale:site_7:2', quantity: 5, credited: 0, total: 0, loss: 5 },
      },
    },
    ledger: [{ t: 40, kind: 'info', text: 'Courier pod away — 6u for Helios Dock.' }],
    stats: { grossCr: 40, creditedCr: 36, exportedU: 5 },
  });
}

test('SF-274 durable site work round-trips byte-for-byte through the save seam', () => {
  const h = makeHarness();
  h.sys.deserialize(sitesBlob([busySite()]));
  const saved = JSON.parse(JSON.stringify(h.sys.serialize()));
  const h2 = makeHarness();
  h2.sys.deserialize(saved);
  const restored = JSON.parse(JSON.stringify(h2.sys.serialize()));
  assert.deepEqual(restored.byId[SITE_ID], saved.byId[SITE_ID],
    'machines, carry, in-flight job, stores, custody and receipts all survive the boundary');
  // And the normalization pass is a fixed point: a second load changes nothing.
  const h3 = makeHarness();
  h3.sys.deserialize(restored);
  const third = JSON.parse(JSON.stringify(h3.sys.serialize()));
  assert.deepEqual(third.byId[SITE_ID], restored.byId[SITE_ID]);

  const site = h3.sys.getSite(SITE_ID);
  const refinery = site.machines.find((m) => m.id === 'm2');
  assert.equal(refinery.carry.cmdty_purified_silica, 0.5, 'the half-built unit is durable work');
  const fab = site.machines.find((m) => m.id === 'm3');
  assert.deepEqual(fab.job, { recipeId: 'sr_cast_regocrete', progressS: 12.5 },
    'the committed batch resumes exactly where it was, it does not restart');
  assert.equal(shipmentQty(site, '_pod'), 6, 'the in-flight lot is still in custody');
});

test('SF-274 transient runtime state is rebuilt, never carried through the save', () => {
  const h = makeHarness();
  h.sys.deserialize(sitesBlob([busySite()]));
  assert.equal(h.sys._rt.size, 0, 'runtime caches start empty after restore');
  const savedJson = JSON.stringify(h.sys.serialize());
  assert.equal(savedJson.includes('"_rt"'), false);
  assert.equal(savedJson.includes('physicsBody'), false, 'collider handles are not durable truth');
  // A tick rebuilds caches lazily from the durable record — no stale phase is replayed.
  h.sys._runtime(h.sys.getSite(SITE_ID));
  const rt = h.sys._rt.get(SITE_ID);
  assert.ok(rt && rt.field, 'geometry is recomputed from the frozen bore, not restored');
  assert.equal(h.sys._accum, 0, 'no burst catch-up: the step accumulator is transient');
});

test('SF-274 unrecoverable machine records drop; survivors idle safe, never replay a phantom phase', () => {
  const h = makeHarness();
  h.sys.deserialize(sitesBlob([sitePayload({
    nextMachineNum: 0,
    machines: [
      { id: 'm1', defId: 'sm_massline_core', col: 5, row: 5, mode: null, carry: {}, job: null },
      { id: 'm9', defId: 'sm_fabricator', col: 7, row: 5, mode: 'sr_cast_regocrete', carry: {}, job: null },
      'ghost-record',                                                                    // not an object
      { id: 'm3', defId: 'sm_turbine_mk9', col: 9, row: 5, mode: null, carry: {}, job: null }, // unknown housing
      { id: 'm4', defId: 'sm_refinery', col: 99, row: 5, mode: 'sr_smelt_iron', carry: {}, job: null }, // off-grid
      { id: 'm5', defId: 'sm_refinery', col: 5, row: 5, mode: 'sr_smelt_iron', carry: {}, job: null },  // cell collision with m1
      { id: 'm1', defId: 'sm_extractor', col: 13, row: 5, mode: null, carry: {}, job: null },           // id collision
      { id: 'm7', defId: 'sm_gas_tap', col: 15, row: 5, mode: 'afterburn', carry: {}, job: null },      // stale mode
      {
        id: 'm8', defId: 'sm_fabricator', col: 17, row: 5, mode: 'sr_fab_electronics',
        carry: { cmdty_electronics: 2.5, junk: Number.NaN },                                          // corrupt carry
        job: { recipeId: '', progressS: Number.NaN },                                                 // stale phase
      },
    ],
  })]));
  const site = h.sys.getSite(SITE_ID);
  const ids = site.machines.map((m) => m.id);
  assert.deepEqual(ids, ['m1', 'm9', 'm7', 'm8'], 'unrecoverable records drop; install order preserved');
  const tap = site.machines.find((m) => m.id === 'm7');
  assert.equal(tap.mode, 'generate', 'a mode the housing never authored resolves to its safe default');
  const fab = site.machines.find((m) => m.id === 'm8');
  assert.equal(fab.job, null, 'an unresumable batch idles — the abandoned-batch rule, not a replay');
  assert.deepEqual(fab.carry, {}, 'a carry that would mint units is dropped');
  assert.equal(site.nextMachineNum, 10, 'the counter can never mint an id a machine already owns');
  // The repaired site ticks without throwing and produces no phantom output.
  h.state.simTime = 10;
  assert.doesNotThrow(() => h.sys.update(1, h.state));
});

test('SF-274 machine custody and store fields repair to conserved states', () => {
  const h = makeHarness();
  h.sys.deserialize(sitesBlob([sitePayload({
    laneStores: 'not-an-array',
    exportBuffer: { cmdty_silicate: 'lots', cmdty_ore_iron: -4, cmdty_electronics: 3.5, '': 9 },
    exportOff: 'everything-off',
    fleet: { podsReady: -3, podTarget: 999, inFlight: 'lost-in-space', lastLaunchT: 'recently' },
    stats: { grossCr: 'rich', creditedCr: -9, exportedU: 'plenty' },
    ledger: 'a very long story',
    shipment: { items: { _pod: 50, cmdty_silicate: -2, '': 4 }, deliveryState: 'stuck' },
    saleReceipts: 'paid-in-full',
    pendingSale: { intentId: 'never' },
  })]));
  const site = h.sys.getSite(SITE_ID);
  assert.deepEqual(site.laneStores, []);
  assert.deepEqual(site.exportBuffer, { cmdty_electronics: 3.5 }, 'only honest positive stock survives');
  assert.deepEqual(site.exportOff, {});
  assert.equal(site.fleet.podsReady, 0);
  assert.equal(site.fleet.podTarget, 24, 'fleet policy clamps to the authored ceiling');
  assert.deepEqual(site.fleet.inFlight, []);
  assert.equal(site.fleet.lastLaunchT, -1e9);
  assert.deepEqual(site.stats, { grossCr: 0, creditedCr: 0, exportedU: 0 });
  assert.deepEqual(site.ledger, []);
  assert.equal(shipmentQty(site, '_pod'), 0, 'custody reseats to the surviving pods (none)');
  assert.equal(site.shipment.deliveryState, 'delivered');
  assert.deepEqual(site.saleReceipts, {});
  assert.equal('pendingSale' in site, false, 'a stale half-committed intent is not replayed');
  h.state.simTime = 10;
  assert.doesNotThrow(() => h.sys.update(1, h.state));
});

test('SF-274 a lane store whose cells are gone returns its stock instead of spilling silently', () => {
  const h = makeHarness();
  h.sys.deserialize(sitesBlob([sitePayload({
    laneStores: [
      { cells: 'corrupt', store: { cmdty_silicate: 8 } },     // no surviving cells
      { cells: [14, 15], store: { cmdty_ore_iron: 2 } },      // honest
      { cells: [99999], store: { cmdty_silicate: 4 } },       // every cell off-grid
    ],
  })]));
  const site = h.sys.getSite(SITE_ID);
  assert.equal(site.laneStores.length, 1);
  assert.deepEqual(site.laneStores[0], { cells: [14, 15], store: { cmdty_ore_iron: 2 } });
  assert.equal(site.exportBuffer.cmdty_silicate, 12, 'orphaned stock rejoins the launch buffer');
});

test('SF-274 a corrupt site counter cannot mint an id a surviving claim already owns', () => {
  const h = makeHarness();
  h.sys.deserialize(sitesBlob(
    [sitePayload({ id: 'site_3' }), sitePayload({ id: 'site_7' })],
    { nextSiteNum: -50 },
  ));
  assert.equal(h.state.sites.nextSiteNum, 8, 'the counter is at least max(claim)+1');
  const order = h.state.sites.order.slice().sort();
  assert.deepEqual(order, ['site_3', 'site_7']);
});

test('SF-274 an unanchored legacy record still dies with its rock — and reused entity ids do not resurrect it', () => {
  const h = makeHarness();
  h.sys.deserialize(sitesBlob([sitePayload({
    anchored: false,
    asteroidId: 42,
    fleet: { podsReady: 0, podTarget: 4, inFlight: [], launches: 0, delivered: 0, lost: 0, lastLaunchT: -1e9 },
  })]));
  // An entity recycling the old rock id with no site stamp is NOT the claim's rock.
  h.entities.set(42, { id: 42, type: 'asteroid', alive: true, pos: { x: 0, z: 0 }, radius: 9, data: {} });
  h.state.simTime = 10;
  assert.doesNotThrow(() => h.sys.update(1, h.state));
  assert.equal(h.sys.getSite(SITE_ID), null, 'unanchored work was never durable — it dies clean');
  assert.ok(h.bus.events.some((e) => e.name === 'site:lost' && e.payload.siteId === SITE_ID));

  // An anchored claim in the CURRENT sector re-materializes its rock instead.
  const h2 = makeHarness();
  h2.sys.deserialize(sitesBlob([sitePayload({ anchored: true, asteroidId: 42 })]));
  h2.state.simTime = 10;
  h2.sys.update(1, h2.state);
  const site = h2.sys.getSite(SITE_ID);
  assert.ok(site, 'the anchored claim survives');
  assert.ok(h2.bus.events.some((e) => e.name === 'site:rematerialized' && e.payload.siteId === SITE_ID),
    'the durable record respawns its rock from the frozen anchor recipe');
});

test('SF-274 malformed site sections fail closed to an empty playable state', () => {
  const h = makeHarness();
  assert.doesNotThrow(() => h.sys.deserialize(null));
  assert.doesNotThrow(() => h.sys.deserialize(42));
  assert.doesNotThrow(() => h.sys.deserialize('blob'));
  assert.doesNotThrow(() => h.sys.deserialize({ order: ['site_7'], byId: { site_7: 'junk' } }));
  assert.equal(h.sys.getSite(SITE_ID), null);
  assert.doesNotThrow(() => h.sys.deserialize({
    order: [SITE_ID],
    byId: { [SITE_ID]: sitePayload({ cleared: 'all-of-it', overlays: null, machines: 'many' }) },
  }));
  const site = h.sys.getSite(SITE_ID);
  assert.ok(site, 'the record repairs rather than rejects');
  assert.deepEqual(site.machines, []);
  h.state.simTime = 10;
  assert.doesNotThrow(() => h.sys.update(1, h.state));
});

test('SF-274 a settled sale receipt is the durable truth — resimulating the site cannot replay it', () => {
  const h = makeHarness();
  const receipt = {
    fingerprint: 'lost:site-sale:site_7:9',
    receipt: { id: 'site-sale:site_7:9', quantity: 4, credited: 0, total: 0, loss: 4 },
  };
  h.sys.deserialize(sitesBlob([sitePayload({
    saleReceipts: { 'site-sale:site_7:9': receipt },
    fleet: { podsReady: 0, podTarget: 4, inFlight: [], launches: 9, delivered: 0, lost: 1, lastLaunchT: 50 },
  })]));
  const site = h.sys.getSite(SITE_ID);
  assert.deepEqual(site.saleReceipts['site-sale:site_7:9'], receipt);
  // Resimulating many ticks cannot re-issue the settled outcome.
  h.state.simTime = 1000;
  for (let i = 0; i < 5; i += 1) h.sys.update(1, h.state);
  assert.equal(site.fleet.lost, 1);
  assert.equal(storeTotal(site.exportBuffer), 0, 'no phantom lot materialized from the receipt');
});
