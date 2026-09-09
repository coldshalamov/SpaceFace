import test from 'node:test';
import assert from 'node:assert/strict';

import { generateDrillField, tileIndex } from '../src/systems/drill.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { SITE_BALANCE } from '../src/data/sites.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { machineStatusRow, tileLensModel } from '../src/ui/asteroid/inspector.js';

const EMPTY = () => ({ type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1, hardness: 0 });
const POCKET = [[14, 2], [14, 0], [14, 1], [13, 2], [15, 2], [13, 1], [15, 1], [13, 3], [14, 3]];

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
    simTime: 0,
    tick: 0,
    meta: { seed: 14501 },
    entities,
    playerId: 1,
    player: {
      cargo: {
        items: {
          cmdty_regocrete: 40,
          cmdty_control_unit: 8,
          cmdty_refined_metals: 12,
          cmdty_electronics: 8,
        },
        usedVolume: 0,
        usedMass: 0,
        capVolume: 900,
        capMass: 1400,
      },
    },
    world: { currentSectorId: 'sector_helios_prime' },
    content: { commodities: COMMODITIES },
  };
  let nextId = 100;
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const ent = { id: nextId++, alive: true, ...spec };
      ent.data = spec.data || {};
      entities.set(ent.id, ent);
      spawned.push(ent);
      return ent;
    },
  };
  const passiveCalls = [];
  const jobs = Object.create(npcJobsRuntime);
  jobs.init({ state, bus, helpers, registry: null });
  jobs.newGame();
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
      if (name === 'npcJobs') return jobs;
      return null;
    },
  };
  const sys = Object.create(asteroidSites);
  sys.init({ state, bus, helpers, registry });
  return { sys, jobs, state, bus, entities, spawned, passiveCalls };
}

function addAsteroid(h, id = 42) {
  const ent = {
    id,
    type: 'asteroid',
    alive: true,
    pos: { x: 120, z: -40 },
    radius: 9,
    data: { typeId: 'ast_common_rock', yieldU: 18, drillCleared: [], fieldId: 'field_1' },
  };
  h.entities.set(id, ent);
  return ent;
}

function openSession(h, asteroidId, cells) {
  const field = generateDrillField(asteroidId);
  for (const [c, r] of cells) field[c][r] = EMPTY();
  const ent = h.entities.get(asteroidId);
  ent.data.drillCleared = cells.map(([c, r]) => tileIndex(c, r));
  h.state.drill = { active: true, asteroidId, field, avatar: { col: cells[0][0], row: cells[0][1] } };
  return field;
}

function buildFirstLoop(h) {
  addAsteroid(h);
  openSession(h, 42, POCKET);
  const extractor = h.sys.installMachine({ asteroidId: 42, defId: 'sm_extractor', col: 13, row: 2 });
  assert.equal(extractor.ok, true, extractor.reason);
  h.state.drill.avatar = { col: 14, row: 2 };
  const port = h.sys.installMachine({ asteroidId: 42, defId: 'sm_cargo_port', col: 14, row: 3 });
  assert.equal(port.ok, true, port.reason);
  const site = h.sys.getSite(extractor.siteId);
  return { site, extractor, port };
}

test('PQ-145.01 the first machine stakes the claim and save keeps it', () => {
  const h = makeHarness();
  addAsteroid(h);
  openSession(h, 42, POCKET);
  const res = h.sys.installMachine({ asteroidId: 42, defId: 'sm_extractor', col: 13, row: 2 });
  const site = h.sys.getSite(res.siteId);
  assert.equal(site.anchored, true);
  assert.equal(site.survey.lifecycle, 'committed');
  const blob = JSON.parse(JSON.stringify(h.sys.serialize()));
  assert.ok(blob.byId[site.id]);
  h.sys.deserialize(blob);
  assert.equal(h.sys.getSite(site.id).anchored, true);
  assert.equal(h.sys.getSite(site.id).machines.length, 1);
});

test('PQ-145.01 cut-preview names the sacrifice on a face next to the extractor', () => {
  const h = makeHarness();
  const { site } = buildFirstLoop(h);
  const preview = h.sys.previewBreak(site.id, 12, 2);
  assert.ok(preview, 'a solid neighbour of the extractor is a real sacrifice');
  assert.ok(preview.contactsLost >= 1);
  assert.ok(preview.rateLost > 0);
  const lens = tileLensModel({
    tile: { type: 'dirt', hp: 4, maxHp: 4, ore: null },
    appearance: { material: 'dirt' },
    cutPreview: preview,
  });
  assert.match(lens.body, /Cuts/);
  assert.match(lens.body, /min/);
});

test('PQ-145.01 one buffer and one export reach the flight economy exactly once', () => {
  const h = makeHarness();
  const { site } = buildFirstLoop(h);
  assert.equal(site.fleet.podsReady, 1, 'the port berths a starter courier');
  site.exportBuffer.cmdty_silicate = SITE_BALANCE.podCapacity;
  site.fleet.lastLaunchT = -1e9;
  h.sys._tryLaunch(site, h.state, {});
  assert.equal(site.fleet.launches, 1);
  assert.equal(site.fleet.inFlight.length, 1);
  const pod = site.fleet.inFlight[0];
  assert.ok(pod.intentId);
  assert.ok(h.state.npcJobs.siteCouriers[pod.worldRecordId]);

  const midSites = JSON.parse(JSON.stringify(h.sys.serialize()));
  const midJobs = JSON.parse(JSON.stringify(h.jobs.serialize()));

  const h2 = makeHarness();
  h2.sys.deserialize(midSites);
  h2.jobs.deserialize(midJobs);
  const restored = h2.sys.getSite(site.id);
  const restoredPod = restored.fleet.inFlight[0];
  h2.state.simTime = restoredPod.arriveT + 1;
  h2.sys._resolvePods(restored, h2.state);
  const receipt = restored.saleReceipts[restoredPod.intentId].receipt;
  assert.equal(receipt.quantity, SITE_BALANCE.podCapacity);
  assert.ok(receipt.destination);
  assert.ok(Number.isFinite(receipt.operatingCost));
  if (restoredPod.lost) {
    assert.equal(restored.fleet.lost, 1);
    assert.equal(receipt.loss, SITE_BALANCE.podCapacity);
    assert.equal(h2.passiveCalls.length, 0);
  } else {
    assert.equal(restored.fleet.delivered, 1);
    assert.equal(h2.passiveCalls.length, 1);
    assert.ok(receipt.realisedPrice > 0);
  }
  const credited = restored.stats.creditedCr;
  restored.fleet.inFlight.push({ ...restoredPod, arriveT: h2.state.simTime });
  h2.sys._resolvePods(restored, h2.state);
  assert.equal(h2.passiveCalls.length, restoredPod.lost ? 0 : 1, 'the same intent never pays twice');
  assert.equal(restored.stats.creditedCr, credited);
});

test('PQ-145.01 a blocked machine names the cause and the corrective action', () => {
  assert.match(machineStatusRow({ state: 'no-power' }).body, /paint a cable/);
  assert.match(machineStatusRow({ state: 'backlogged' }).body, /clear the port/);
  assert.match(machineStatusRow({ state: 'no-geology' }).body, /keep a face/);
  assert.match(machineStatusRow({ state: 'no-network' }).body, /paint a lane/);
});

test('PQ-145.01 a blocked mill survives Continue still blocked and unpaid', () => {
  const h = makeHarness();
  const { site, extractor } = buildFirstLoop(h);
  h.state.drill = null;
  h.state.simTime += 1;
  h.sys.update(1, h.state);
  const mill = h.sys.projection(site.id).machines.find((m) => m.id === extractor.machineId);
  assert.equal(mill.status.state, 'no-power');
  assert.match(machineStatusRow(mill.status).body, /paint a cable/);
  const blob = JSON.parse(JSON.stringify(h.sys.serialize()));
  const h2 = makeHarness();
  h2.sys.deserialize(blob);
  const restored = h2.sys.getSite(site.id);
  h2.state.simTime += 1;
  h2.sys.update(1, h2.state);
  const mill2 = h2.sys.projection(restored.id).machines.find((m) => m.defId === 'sm_extractor');
  assert.equal(mill2.status.state, 'no-power');
  assert.equal(restored.stats.creditedCr, 0);
  assert.equal(h2.passiveCalls.length, 0);
});

test('PQ-145.01 cutting a face after a sale does not replay the receipt', () => {
  const h = makeHarness();
  const { site } = buildFirstLoop(h);
  site.exportBuffer.cmdty_silicate = SITE_BALANCE.podCapacity;
  site.fleet.lastLaunchT = -1e9;
  h.sys._tryLaunch(site, h.state, {});
  const pod = site.fleet.inFlight[0];
  h.state.simTime = pod.arriveT + 1;
  h.sys._resolvePods(site, h.state);
  const credited = site.stats.creditedCr;
  const intent = pod.intentId;
  const sacrifice = h.sys.previewBreak(site.id, 12, 2);
  assert.ok(sacrifice && sacrifice.contactsLost >= 1, 'the face is still a live contact before the cut');
  const idx = tileIndex(12, 2);
  if (!site.cleared.includes(idx)) site.cleared.push(idx);
  h.sys._rt.delete(site.id);
  const blob = JSON.parse(JSON.stringify(h.sys.serialize()));
  const h2 = makeHarness();
  h2.sys.deserialize(blob);
  const restored = h2.sys.getSite(site.id);
  h2.sys._resolvePods(restored, h2.state);
  assert.equal(restored.stats.creditedCr, credited, 'a geometry change does not replay the sale');
  assert.ok(restored.saleReceipts[intent]);
  assert.equal(h2.sys.previewBreak(restored.id, 12, 2), null, 'the cut face is gone after Continue');
  assert.equal(h2.passiveCalls.length, 0, 'Continue after the cut does not pay again');
});

test('PQ-145.01 leaving a staked claim idle destroys nothing', () => {
  const h = makeHarness();
  const { site } = buildFirstLoop(h);
  const machineCount = site.machines.length;
  h.state.drill = null;
  for (let i = 0; i < 30; i++) {
    h.state.simTime += 1;
    h.sys.update(1, h.state);
  }
  assert.equal(h.sys.getSite(site.id).machines.length, machineCount);
  assert.equal(h.sys.getSite(site.id).anchored, true);
});
