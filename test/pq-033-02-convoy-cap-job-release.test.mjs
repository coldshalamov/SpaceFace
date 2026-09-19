// PQ-033.02 — a convoy hull refused by the alive-convoy ledger cap must not leave a phantom job.
//
// The release soak found this: every save/load roundtrip minted fresh ambient convoy identities,
// the ledger cap refused their records (by design — "excess live haulers stay ambient"), and the
// job keyed on the refused record stayed in state.npcJobs forever. The bag grew ~+4 jobs per
// roundtrip until localStorage refused the quick save at 5 MB (soak cycle 42). A job re-enters the
// world only through a persisted record — npcJobsRuntime restores every job VIRTUAL and re-links it
// by worldRecordId — so the refusal must release the job in the same breath as the phantom id.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { world as worldSystem } from '../src/systems/world.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import {
  MAX_ALIVE_CONVOY_RECORDS_PER_SECTOR,
  RECORD_KIND,
  recordsForSector,
  stableRecordId,
} from '../src/world/worldRecords.js';

const SECTOR = 'sector_helios_prime';
const SEED = 47;

const HAULER_ROUTE = [
  { id: 'origin', pos: { x: 0, z: 0 }, label: 'Helios Station' },
  { id: 'dest', pos: { x: 900, z: 120 }, label: 'Ceres Depot' },
];

function boot() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.meta.seed = SEED;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, radius: 4, mass: 12, hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  const world = Object.assign(Object.create(worldSystem), {});
  world.init(ctx);
  const npcJobs = Object.assign(Object.create(npcJobsRuntime), {});
  npcJobs.init(ctx);
  return { state, bus, helpers, world, npcJobs };
}

function convoyHull(helpers, index) {
  const entity = helpers.spawnEntity({
    type: 'ship', pos: { x: 1200 + index * 40, z: 300 }, radius: 6, mass: 20,
    hull: 60, hullMax: 60, collides: true,
  });
  const identityKey = `traffic:hauler:${index}:1200:300`;
  entity.data = entity.data || {};
  entity.homeSectorId = SECTOR;
  entity.data.homeSectorId = SECTOR;
  entity.data.sectorId = SECTOR;
  entity.data.trafficRole = 'hauler';
  entity.data.identityKey = identityKey;
  entity.data.worldRecordId = stableRecordId(SEED, SECTOR, RECORD_KIND.CONVOY, identityKey);
  entity.flags = Object.assign({}, entity.flags, { persistent: true });
  return entity;
}

function assignHauler(helpers, entity) {
  return helpers.npcJobs.assign(entity, {
    kind: 'hauler', sectorId: SECTOR, route: HAULER_ROUTE, speed: 120,
    payload: { manifest: { lines: [], totalQty: 0, totalValue: 0 } },
  });
}

test('a convoy hull refused by the alive-convoy cap releases its job and its phantom record id', () => {
  const { state, helpers, world } = boot();
  const kept = [];
  for (let i = 0; i < MAX_ALIVE_CONVOY_RECORDS_PER_SECTOR; i += 1) {
    const hull = convoyHull(helpers, i);
    kept.push({ hull, jobId: assignHauler(helpers, hull) });
  }
  for (const { jobId } of kept) assert.ok(jobId, 'a stamped convoy hull gets a durable job');

  world._captureSectorDurableRecords(SECTOR, { reason: 'serialize' });
  const convoyRecords = recordsForSector(state.world.records, SECTOR)
    .filter((rec) => rec.kind === RECORD_KIND.CONVOY && rec.alive !== false);
  assert.equal(convoyRecords.length, MAX_ALIVE_CONVOY_RECORDS_PER_SECTOR, 'the ledger fills to the cap');
  for (const { hull, jobId } of kept) {
    assert.equal(state.npcJobs.byId[jobId]?.worldRecordId, hull.data.worldRecordId,
      'a hull captured under the cap keeps its job');
  }

  const refused = convoyHull(helpers, MAX_ALIVE_CONVOY_RECORDS_PER_SECTOR);
  const refusedRecordId = refused.data.worldRecordId;
  const refusedJobId = assignHauler(helpers, refused);
  assert.ok(refusedJobId, 'the refused hull is job-driven before capture');
  assert.equal(state.npcJobs.byId[refusedJobId].entityId, refused.id);

  world._captureSectorDurableRecords(SECTOR, { reason: 'serialize' });

  assert.equal(state.world.records.byId[refusedRecordId], undefined,
    'the cap refuses the over-cap convoy record');
  assert.equal(refused.data.worldRecordId, undefined, 'the refused hull drops its phantom record id');
  assert.equal(state.npcJobs.byId[refusedJobId], undefined,
    'the refused hull releases its job — it could never re-link without a record');
  assert.equal(refused.data.jobId, undefined, 'the live hull is handed back to its ambient stepper');
  assert.equal(recordsForSector(state.world.records, SECTOR).length, MAX_ALIVE_CONVOY_RECORDS_PER_SECTOR,
    'the ledger stays at the cap');
  for (const { jobId } of kept) assert.ok(state.npcJobs.byId[jobId], 'kept hulls keep their jobs');
});

test('an over-cap refusal does not disturb an already-persisted convoy identity', () => {
  const { state, helpers, world } = boot();
  const first = convoyHull(helpers, 0);
  const jobId = assignHauler(helpers, first);
  world._captureSectorDurableRecords(SECTOR, { reason: 'serialize' });
  assert.ok(state.world.records.byId[first.data.worldRecordId], 'the first convoy persists');

  for (let i = 1; i < MAX_ALIVE_CONVOY_RECORDS_PER_SECTOR; i += 1) {
    const hull = convoyHull(helpers, i);
    assignHauler(helpers, hull);
  }
  world._captureSectorDurableRecords(SECTOR, { reason: 'serialize' });

  const extra = convoyHull(helpers, MAX_ALIVE_CONVOY_RECORDS_PER_SECTOR);
  assignHauler(helpers, extra);
  world._captureSectorDurableRecords(SECTOR, { reason: 'serialize' });

  assert.ok(state.world.records.byId[first.data.worldRecordId], 'an existing identity always refreshes');
  assert.equal(state.npcJobs.byId[jobId]?.entityId, first.id, 'the persisted hull keeps its live job link');
  assert.equal(state.world.records.byId[extra.data.worldRecordId], undefined, 'only the over-cap hull is refused');
});
