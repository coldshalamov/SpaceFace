// A full hangar depot and a jammed aperture must dispatch real hauler jobs.
// A ledger flag with no job is the defect, not the fix.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import {
  APERTURE_GLOBAL_POS,
  APERTURE_ID,
  APERTURE_RECEIVER,
  APERTURE_STATION_ID,
  CINDER_SLUICE_SECTOR_ID,
  aperturePoint,
} from '../src/data/environmentalMachinery.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { traffic } from '../src/systems/traffic.js';

const STATION_POS = { x: 2500, z: -1800 };

function haulJobs(state) {
  const byId = state.npcJobs && state.npcJobs.byId || {};
  return Object.values(byId).filter((entry) => entry && entry.job
    && entry.job.kind === 'hauler' && entry.job.corrupt !== true);
}

function jobAimedAt(entry, destinationId, pos) {
  const route = entry && entry.job && entry.job.route;
  const last = route && route[route.length - 1];
  if (!last || last.id !== `dest:${destinationId}` || !last.pos) return false;
  return Math.hypot(last.pos.x - pos.x, last.pos.z - pos.z) <= 1;
}

function makeHauler(id, worldRecordId, pos) {
  return {
    id,
    type: 'ship',
    alive: true,
    pos: { x: pos.x, z: pos.z },
    vel: { x: 0, z: 0 },
    data: {
      trafficRole: 'hauler',
      jobKind: 'hauler',
      worldRecordId,
    },
  };
}

function boot({ haulers = true } = {}) {
  const station = {
    id: 11,
    type: 'station',
    alive: true,
    pos: { x: STATION_POS.x, z: STATION_POS.z },
    data: { stationId: APERTURE_STATION_ID, name: 'Ceres Refinery' },
  };
  const redirectHauler = makeHauler(21, 'wr-depot-a', { x: 40, z: 20 });
  const repairHauler = makeHauler(22, 'wr-depot-b', { x: 80, z: 20 });
  const ships = haulers ? [redirectHauler, repairHauler] : [];
  const entities = new Map([[station.id, station]]);
  for (const ship of ships) entities.set(ship.id, ship);
  const state = {
    mode: 'flight',
    tick: 180,
    simTime: 3,
    playerId: 1,
    meta: { seed: 4242 },
    entities,
    entityList: [station, ...ships],
    world: { currentSectorId: CINDER_SLUICE_SECTOR_ID },
    traffic: {
      freighters: ships.map((ship) => ({
        id: ship.id,
        role: 'hauler',
        targetId: null,
        waitT: 0,
        nextTradeT: 0,
        dockSeq: 0,
        manifest: null,
      })),
    },
    economy: { markets: {} },
    player: { pos: { x: 0, z: 0 } },
  };
  const bus = createBus();
  const helpers = {};
  npcJobsRuntime.init({ state, bus, helpers, registry: null });
  traffic.init({ state, bus, helpers, registry: null });
  environmentalMachinery.init({ state, bus, registry: null });
  return { state, station, redirectHauler, repairHauler, helpers };
}

function oreAtMouth(amount) {
  return {
    id: 'ore-load',
    alive: true,
    type: 'pickup',
    pos: aperturePoint(0, 0),
    vel: { x: 0, z: 0 },
    radius: 4,
    mass: 20,
    data: { amount, commodityId: 'cmdty_ore_iron', cargoClass: 'ore' },
  };
}

function releaseMachinery() {
  environmentalMachinery.bus = null;
  environmentalMachinery._industryLedger = null;
  environmentalMachinery._industrySiteResult = null;
  environmentalMachinery._apertureDeliveryCandidate = null;
  environmentalMachinery._apertureLastOccupant = null;
}

test('a full depot redirects a hauler and a jam dispatches repair parts', () => {
  const { state, redirectHauler, repairHauler } = boot();
  const redirectStart = { x: redirectHauler.pos.x, z: redirectHauler.pos.z };
  const repairStart = { x: repairHauler.pos.x, z: repairHauler.pos.z };
  try {
    environmentalMachinery._apertureDeliveryCandidate = oreAtMouth(12);
    environmentalMachinery._publishApertureIndustry(state, { phase: 'open', occupied: false });
    const ledger = environmentalMachinery._industryLedger;
    assert.equal(ledger.worker.stage, 'redirect');
    assert.equal(ledger.worker.destinationId, APERTURE_STATION_ID);
    assert.equal(ledger.worker.ownerNotCalled, undefined);
    const redirect = haulJobs(state).find((entry) => entry.job.payload
      && entry.job.payload.haulKind === 'redirect');
    assert.ok(redirect, 'full-depot redirect must create a hauler job');
    assert.equal(redirect.entityId, redirectHauler.id);
    assert.equal(jobAimedAt(redirect, APERTURE_STATION_ID, STATION_POS), true);
    assert.equal(redirect.job.payload.commodityId, 'cmdty_ore_iron');
    assert.equal(redirect.job.payload.qty, 4);
    assert.equal(redirect.job.route[0].id, `origin:${APERTURE_ID}`);
    assert.deepEqual(redirectHauler.pos, redirectStart);
    assert.equal(redirectHauler.data.cargoManifest, undefined);

    environmentalMachinery._apertureLastOccupant = {
      id: 'jam-body',
      alive: true,
      type: 'ship',
      pos: aperturePoint(0, 0),
      vel: { x: 0, z: 0 },
      radius: 12,
      data: { amount: 2, commodityId: 'cmdty_scrap', cargoClass: 'scrap' },
    };
    environmentalMachinery._publishApertureIndustry(state, { phase: 'jam', occupied: true });
    const repair = haulJobs(state).find((entry) => entry.job.payload
      && entry.job.payload.haulKind === 'repair-parts');
    assert.ok(repair, 'repair reservation must create a parts haul');
    assert.equal(repair.entityId, repairHauler.id);
    assert.equal(jobAimedAt(repair, APERTURE_ID, APERTURE_GLOBAL_POS), true);
    assert.equal(repair.job.route[0].id, `origin:${APERTURE_STATION_ID}`);
    assert.equal(repair.job.payload.commodityId, APERTURE_RECEIVER.repairCommodityId);
    assert.equal(repair.job.payload.qty, APERTURE_RECEIVER.repairQty);
    assert.equal(environmentalMachinery._industryLedger.repair.spawned, true);
    assert.equal(environmentalMachinery._industryLedger.repair.trafficIntent.ownerNotCalled, undefined);
    assert.equal(environmentalMachinery._industrySiteResult.repairOffer.spawned, true);
    assert.equal(environmentalMachinery._industrySiteResult.repairOffer.ownerNotCalled, null);
    assert.deepEqual(repairHauler.pos, repairStart);
    assert.equal(repairHauler.data.cargoManifest, undefined);
    assert.equal(haulJobs(state).length, 2);

    environmentalMachinery._publishApertureIndustry(state, { phase: 'jam', occupied: true });
    assert.equal(haulJobs(state).length, 2);
    assert.equal(jobAimedAt(redirect, APERTURE_STATION_ID, STATION_POS), true);
  } finally {
    releaseMachinery();
  }
});

function stampOldRun(helpers, entity) {
  const jobId = helpers.npcJobs.assign(entity, {
    kind: 'hauler',
    sectorId: CINDER_SLUICE_SECTOR_ID,
    route: [
      { id: 'origin:station_beltout', pos: { x: 1, z: 1 }, label: 'Old origin' },
      { id: 'dest:station_beltout', pos: { x: 12, z: 4 }, label: 'Old dest' },
    ],
    payload: { commodityId: 'cmdty_food', qty: 1, sourceId: 'station_beltout', destinationId: 'station_beltout' },
  });
  assert.equal(jobId, `job:${entity.data.worldRecordId}`);
  assert.equal(entity.data.jobId, jobId);
}

test('a hauler already on a run is not pulled off it', () => {
  const { state, helpers, redirectHauler, repairHauler } = boot();
  stampOldRun(helpers, redirectHauler);
  stampOldRun(helpers, repairHauler);
  try {
    environmentalMachinery._apertureDeliveryCandidate = oreAtMouth(12);
    environmentalMachinery._publishApertureIndustry(state, { phase: 'open', occupied: false });
    const redirect = haulJobs(state).find((entry) => entry.job.payload
      && entry.job.payload.haulKind === 'redirect');
    assert.equal(redirect, undefined);
    assert.equal(redirectHauler.data.jobId, `job:${redirectHauler.data.worldRecordId}`);
    assert.equal(environmentalMachinery._industryLedger.worker.ownerNotCalled, 'src/systems/traffic.js');
    assert.equal(repairHauler.data.jobId, `job:${repairHauler.data.worldRecordId}`);
  } finally {
    releaseMachinery();
  }
});

test('a ledger marker with no hauler job is not a dispatch', () => {
  const { state } = boot({ haulers: false });
  try {
    environmentalMachinery._apertureDeliveryCandidate = oreAtMouth(12);
    environmentalMachinery._publishApertureIndustry(state, { phase: 'open', occupied: false });
    assert.equal(environmentalMachinery._industryLedger.worker.stage, 'redirect');
    assert.equal(environmentalMachinery._industryLedger.worker.ownerNotCalled, 'src/systems/traffic.js');
    assert.equal(haulJobs(state).length, 0);

    environmentalMachinery._apertureLastOccupant = {
      id: 'jam-body',
      alive: true,
      type: 'ship',
      pos: aperturePoint(0, 0),
      vel: { x: 0, z: 0 },
      radius: 12,
      data: { amount: 2, commodityId: 'cmdty_scrap', cargoClass: 'scrap' },
    };
    environmentalMachinery._publishApertureIndustry(state, { phase: 'jam', occupied: true });
    assert.equal(environmentalMachinery._industryLedger.repair.spawned, false);
    assert.equal(
      environmentalMachinery._industryLedger.repair.trafficIntent.ownerNotCalled,
      'src/systems/traffic.js',
    );
    assert.equal(environmentalMachinery._industrySiteResult.repairOffer.spawned, false);
    assert.equal(haulJobs(state).length, 0);
  } finally {
    releaseMachinery();
  }
});
