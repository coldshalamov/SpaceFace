// Site pod destination — the factory's customer is player-selectable, named, and honest.
// Harness pattern from test/asteroid-sites.test.mjs (bus/entities/registry stubs, no DOM, no wall
// clock). Seed 4242, sector_helios_prime (station_helios = auto lane, station_coalition = pick).
import test from 'node:test';
import assert from 'node:assert/strict';

import { generateDrillField, tileIndex, DRILL_CONST } from '../src/systems/drill.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { SITE_BALANCE } from '../src/data/sites.js';
import { COMMODITIES } from '../src/data/commodities.js';

const { COLS, ROWS } = DRILL_CONST;

const EMPTY = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });

// ------------------------------------------------------------------ harness

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
      for (const fn of handlers.get(name) || []) fn(payload);
    },
  };
}

function makeHarness() {
  const bus = makeBus();
  const entities = new Map();
  const state = {
    simTime: 0, tick: 0, meta: { seed: 4242 },
    entities, playerId: 1,
    player: {
      cargo: {
        items: { cmdty_regocrete: 40, cmdty_control_unit: 8, cmdty_refined_metals: 12, cmdty_electronics: 8, cmdty_purified_silica: 6 },
        usedVolume: 0, usedMass: 0, capVolume: 900, capMass: 1400,
      },
    },
    world: { currentSectorId: 'sector_helios_prime' },
    content: { commodities: COMMODITIES },
  };
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const ent = { id: nextId++, alive: true, ...spec };
      ent.data = spec.data || {};
      entities.set(ent.id, ent);
      return ent;
    },
  };
  const siteCourierNotes = [];
  const registry = {
    get(name) {
      if (name === 'automation') {
        return {
          creditPassive(gross) {
            const credited = Math.round(gross * 0.5); // mirror automation's numeric return contract
            return credited;
          },
        };
      }
      if (name === 'npcJobs') {
        return { noteSiteCourier(spec) { siteCourierNotes.push(spec); return spec; } };
      }
      return null;
    },
  };
  const sys = Object.create(asteroidSites);
  sys.init({ state, bus, helpers, registry });
  return { sys, state, bus, entities, siteCourierNotes };
}

function addAsteroid(h, id = 42) {
  const ent = {
    id, type: 'asteroid', alive: true, pos: { x: 120, z: -40 }, radius: 9,
    data: { typeId: 'ast_common_rock', yieldU: 18, drillCleared: [], fieldId: 'field_1' },
  };
  h.entities.set(id, ent);
  return ent;
}

/** Open a live drill session with a hand-carved pocket so installs validate. */
function openSession(h, asteroidId, cells) {
  const field = generateDrillField(asteroidId);
  for (const [c, r] of cells) field[c][r] = EMPTY();
  const ent = h.entities.get(asteroidId);
  ent.data.drillCleared = cells.map(([c, r]) => tileIndex(c, r));
  h.state.drill = { active: true, asteroidId, field, avatar: { col: cells[0][0], row: cells[0][1] } };
  return field;
}

const POCKET = [[14, 2], [14, 0], [14, 1], [13, 2], [15, 2], [13, 1], [15, 1], [13, 3], [14, 3]];

/**
 * Minimal launch-capable site in sector_helios_prime: extractor stakes the claim, the Massline
 * Core powers it, the cargo port launches; one shared spine bolts all three onto one network.
 */
function buildLaunchSite(h) {
  addAsteroid(h);
  openSession(h, 42, POCKET);
  let r = h.sys.installMachine({ asteroidId: 42, defId: 'sm_extractor', col: 13, row: 2 });
  const siteId = r.siteId;
  h.state.drill.avatar = { col: 14, row: 1 };
  r = h.sys.installMachine({ asteroidId: 42, defId: 'sm_massline_core', col: 14, row: 0 });
  assert.equal(r.ok, true);
  r = h.sys.installMachine({ asteroidId: 42, defId: 'sm_cargo_port', col: 14, row: 3 });
  assert.equal(r.ok, true);
  const site = h.sys.getSite(siteId);
  for (const [c, row] of [[14, 1], [14, 2]]) {
    h.sys.setOverlay(siteId, 'power', c, row, true);
    h.sys.setOverlay(siteId, 'lane', c, row, true);
  }
  h.state.drill = null; // player retracts; production runs on sim time
  return { siteId, site };
}

/** Seed a full pod plus crew and run simTime past podTravelS so the pod launches AND settles. */
function launchAndSettle(h, site, { pods = 1 } = {}) {
  site.fleet.podsReady = pods;
  site.exportBuffer.cmdty_silicate = SITE_BALANCE.podCapacity;
  for (let i = 0; i < 120; i++) {
    h.state.simTime += 1;
    h.state.tick += 1;
    h.sys.update(1, h.state);
  }
}

const receiptsOf = (site) => Object.values(site.saleReceipts).map((entry) => entry.receipt);

// ------------------------------------------------------------------ cases

test('setPodDestination re-addresses the pod: launch, receipt, freight and job note all name it', () => {
  const h = makeHarness();
  const { siteId, site } = buildLaunchSite(h);

  // The projection exposes the pick and its options so the UI never imports sector data itself.
  assert.equal(h.sys.projection(siteId).courier.destinationId, null);
  assert.deepEqual(h.sys.projection(siteId).courier.stations, [
    { id: 'station_helios', name: 'Helios Station' },
    { id: 'station_coalition', name: 'Coalition HQ' },
  ]);

  assert.deepEqual(h.sys.setPodDestination(siteId, 'station_coalition'), { ok: true, reason: null });
  assert.equal(h.sys.projection(siteId).courier.destinationId, 'station_coalition');
  assert.equal(site.podDestinationId, 'station_coalition');

  launchAndSettle(h, site);

  assert.equal(site.fleet.launches, 1);
  const launched = h.bus.events.filter((e) => e.name === 'site:courierLaunched');
  assert.equal(launched.length, 1);
  assert.equal(launched[0].payload.destinationStationId, 'station_coalition');
  // The job runtime's haul record names the same customer.
  assert.equal(h.siteCourierNotes.length, 1);
  assert.equal(h.siteCourierNotes[0].destinationId, 'station_coalition');
  // The settled sale receipt names that station.
  const receipts = receiptsOf(site);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].stationId, 'station_coalition');
  assert.equal(receipts[0].destination, 'Coalition HQ');
  // The freight-side fact (cargo:delivered) names it too.
  const freight = h.bus.events.filter((e) => e.name === 'cargo:delivered');
  assert.ok(freight.length >= 1, 'the sale landed through the canonical freight fact');
  for (const f of freight) assert.equal(f.payload.stationId, 'station_coalition');
  assert.equal(h.bus.events.some((e) => e.name === 'site:courierDelivered'), true);
});

test('a site with no destination still sells to the sector\u2019s first station (back-compat)', () => {
  const h = makeHarness();
  const { siteId, site } = buildLaunchSite(h);
  assert.equal(site.podDestinationId, null);
  // Null is also a legal explicit pick — the auto lane.
  assert.deepEqual(h.sys.setPodDestination(siteId, null), { ok: true, reason: null });

  launchAndSettle(h, site);

  const launched = h.bus.events.filter((e) => e.name === 'site:courierLaunched');
  assert.equal(launched.length, 1);
  assert.equal(launched[0].payload.destinationStationId, 'station_helios');
  const receipts = receiptsOf(site);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].stationId, 'station_helios');
  for (const f of h.bus.events.filter((e) => e.name === 'cargo:delivered')) {
    assert.equal(f.payload.stationId, 'station_helios');
  }
});

test('a bogus destination is refused by the setter and repaired to the auto lane by the sweep', () => {
  const h = makeHarness();
  const { siteId, site } = buildLaunchSite(h);

  assert.deepEqual(h.sys.setPodDestination(siteId, 'station_nowhere'), { ok: false, reason: 'bad-station' });
  assert.equal(site.podDestinationId, null, 'the setter never stores an unlisted station');

  // A stale record that arrived anyway (old save, moved claim) is repaired by the normalize sweep.
  site.podDestinationId = 'station_nowhere';
  h.sys._normalize(h.state.sites);
  assert.equal(site.podDestinationId, null);

  launchAndSettle(h, site);
  const launched = h.bus.events.filter((e) => e.name === 'site:courierLaunched');
  assert.equal(launched[0].payload.destinationStationId, 'station_helios', 'repaired sites use stations[0]');
  assert.equal(receiptsOf(site)[0].stationId, 'station_helios');
});

test('determinism: two identical seed-4242 runs produce identical receipts', () => {
  const run = () => {
    const h = makeHarness();
    const { siteId, site } = buildLaunchSite(h);
    h.sys.setPodDestination(siteId, 'station_coalition');
    launchAndSettle(h, site);
    return JSON.stringify({
      receipts: site.saleReceipts,
      stats: site.stats,
      launches: site.fleet.launches,
      delivered: site.fleet.delivered,
      lost: site.fleet.lost,
      freight: h.bus.events.filter((e) => e.name === 'cargo:delivered').map((e) => e.payload),
      notes: h.siteCourierNotes,
      rng: h.state.sites.meta.rngSeed,
    });
  };
  assert.equal(run(), run());
});
