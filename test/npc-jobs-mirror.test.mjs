import assert from 'node:assert/strict';
import test from 'node:test';

import { buildClaimOwnershipMarkers } from '../src/ui/galaxyMap.js';
import { careersForSector } from '../src/ui/map/careersReadout.js';
import { towAssistWorkerEntry } from '../src/data/contactHail.js';
import {
  applyDomainPathUpdate,
  canonicalSignature,
  configureDomainMirroring,
  createDomainDiffer,
  createDomainProbeChecker,
} from '../scripts/lib/simReadModel.mjs';
import { projectNpcJobsById } from '../scripts/lib/npcJobsMirror.mjs';

const SECTOR = 'sector_ceres_belt';

function fullEntry({ jobId = 'job:mirror', kind = 'hauler', bodyId = 'claim:mirror' } = {}) {
  return {
    kind,
    sectorId: SECTOR,
    worldRecordId: 'ceres:activity:mirror',
    entityId: 42,
    control: { claimId: 'transient-control', holder: 77 },
    towAssist: { targetId: 91, feeCr: 12 },
    lastAdvanceSimT: 16.5,
    threatId: 'threat:transient',
    towAttachmentId: 'attachment:transient',
    towTargetId: 91,
    towOwnerRef: { id: 42 },
    towTargetRef: { id: 91 },
    towNextScanSimT: 17,
    job: {
      schema: 'npc_jobs_v1',
      id: jobId,
      kind,
      phase: 'transit',
      progress: 0.25,
      routeIndex: 1,
      loopCount: 3,
      sequence: 7,
      simTime: 12,
      materialized: true,
      corrupt: false,
      heading: 1.2,
      rngSeed: 9123,
      speed: 44,
      commissionS: 2,
      departS: 3,
      approachS: 4,
      workS: 5,
      loadS: 6,
      unloadS: 7,
      dwellS: 8,
      interrupted: false,
      preInterruptPhase: null,
      healed: [],
      payload: {
        role: 'hauler',
        activityRunSeq: 4,
        claimDepot: { bodyId, legSeq: 2 },
        manifest: { iron: 18, silicate: 9, hiddenPlannerBlob: 'x'.repeat(500) },
        workerOnly: { lease: 'private', control: Array(32).fill('x') },
      },
      route: [
        {
          id: 'from',
          pos: { x: -100, z: -200 },
          label: 'Origin Berth',
          targetRef: 'dest:station_ceres',
          workerOnly: 'drop',
        },
        {
          id: 'to',
          pos: { x: 300, z: 500 },
          label: 'Claim Depot',
          targetRef: 'field:slot:claim_mirror',
          workerOnly: 'drop',
        },
      ],
    },
  };
}

function applyAll(domains, result) {
  for (const update of result.updates) applyDomainPathUpdate(domains, update, new Set());
}

test('npc job projector keeps the named presentation contract and drops worker-only bulk', () => {
  const source = { 'job:mirror': fullEntry() };
  const before = structuredClone(source);
  const projected = projectNpcJobsById(source);
  const entry = projected['job:mirror'];
  const job = entry.job;

  assert.deepEqual(source, before, 'projection must not mutate worker authority');
  assert.deepEqual({
    kind: entry.kind,
    sectorId: entry.sectorId,
    worldRecordId: entry.worldRecordId,
    entityId: entry.entityId,
    control: entry.control,
    towAssist: entry.towAssist,
  }, {
    kind: 'hauler', sectorId: SECTOR, worldRecordId: 'ceres:activity:mirror', entityId: 42,
    control: true, towAssist: true,
  });
  assert.deepEqual({
    schema: job.schema, id: job.id, kind: job.kind, phase: job.phase,
    progress: job.progress, routeIndex: job.routeIndex, loopCount: job.loopCount,
    sequence: job.sequence, simTime: job.simTime, materialized: job.materialized, corrupt: job.corrupt,
  }, {
    schema: 'npc_jobs_v1', id: 'job:mirror', kind: 'hauler', phase: 'transit',
    progress: 0.25, routeIndex: 1, loopCount: 3, sequence: 7, simTime: 12,
    materialized: true, corrupt: false,
  });
  assert.deepEqual(job.route, [
    { id: 'from', pos: { x: -100, z: -200 }, label: 'Origin Berth', targetRef: 'dest:station_ceres' },
    { id: 'to', pos: { x: 300, z: 500 }, label: 'Claim Depot', targetRef: 'field:slot:claim_mirror' },
  ]);
  assert.deepEqual(job.payload, {
    role: 'hauler', activityRunSeq: 4, claimDepot: { bodyId: 'claim:mirror', legSeq: 2 },
  });
  assert.equal(Object.hasOwn(job, 'speed'), false);
  assert.equal(Object.hasOwn(job.payload, 'manifest'), false);
  assert.equal(Object.hasOwn(entry, 'lastAdvanceSimT'), false);

  const sourceBytes = canonicalSignature(source).length;
  const projectedBytes = canonicalSignature(projected).length;
  assert.ok(projectedBytes < sourceBytes / 2,
    `bounded projection should materially reduce canonical bytes (${sourceBytes} -> ${projectedBytes})`);
});

test('default differ signs and ships the projected npcJobs leaf with deletion and probe parity', () => {
  configureDomainMirroring({});
  const state = { npcJobs: { revision: 0, byId: { 'job:mirror': fullEntry() } } };
  const domains = new Map();
  const differ = createDomainDiffer({ probe: true });
  const checker = createDomainProbeChecker(domains);

  const first = differ.diff(state, 0);
  const update = first.updates.find((row) => row.segs.join('.') === 'npcJobs.byId');
  assert.ok(update, 'the default wire must include the npcJobs leaf');
  assert.deepEqual(update.v, projectNpcJobsById(state.npcJobs.byId));
  assert.ok(update.bytes < canonicalSignature(state.npcJobs.byId).length / 2);
  applyAll(domains, first);
  assert.deepEqual(checker.consume(first.probe).events, []);
  assert.deepEqual(domains.get('npcJobs.byId'), update.v);
  assert.equal(domains.get('npcJobs.revision'), 0);

  delete state.npcJobs.byId['job:mirror'];
  state.npcJobs.revision = 1;
  const removed = differ.diff(state, 1);
  const removedUpdate = removed.updates.find((row) => row.segs.join('.') === 'npcJobs.byId');
  assert.ok(removedUpdate, 'removing a job must replace the leaf immediately');
  applyAll(domains, removed);
  assert.deepEqual(domains.get('npcJobs.byId'), {});
  assert.deepEqual(checker.consume(removed.probe).events, []);

  state.npcJobs.byId['job:replacement'] = fullEntry({ jobId: 'job:replacement', kind: 'salvor' });
  state.npcJobs.revision = 2;
  const added = differ.diff(state, 2);
  applyAll(domains, added);
  assert.equal(domains.get('npcJobs.byId')['job:replacement'].job.kind, 'salvor');
  assert.deepEqual(checker.consume(added.probe).events, []);
});

test('projected fields preserve careers, claim route, and tow-assist readers', () => {
  const entry = fullEntry();
  const projected = projectNpcJobsById({ 'job:mirror': entry })['job:mirror'];
  const entity = {
    id: 42,
    alive: true,
    type: 'ship',
    team: 2,
    pos: { x: -100, z: -200 },
    data: { name: 'Mirror Hauler', factionId: 'faction_helios', defId: 'ship_mule', jobId: 'job:mirror' },
  };
  const state = {
    world: { currentSectorId: SECTOR },
    entities: new Map([[entity.id, entity]]),
    entityList: [entity],
    npcJobs: { byId: { 'job:mirror': projected } },
    claims: { bodies: [{
      id: 'claim:mirror', name: 'Mirror Relay', owned: true, sectorId: SECTOR,
      x: 0, z: 0, spec: { id: 'spec_relay', status: 'active' },
    }] },
  };

  const career = careersForSector(state, SECTOR);
  assert.equal(career.status, 'ready');
  assert.equal(career.rows[0].jobId, 'job:mirror');
  assert.equal(career.rows[0].siteLabel, 'Claim Depot');
  assert.equal(career.rows[0].loopCount, 3);

  const marker = buildClaimOwnershipMarkers(state, SECTOR)
    .find((row) => row.travelRoute?.claimId === 'claim:mirror');
  assert.ok(marker?.travelRoute, 'claim map still receives the depot route');
  assert.deepEqual(marker.travelRoute.from, entry.job.route[0].pos);
  assert.deepEqual(marker.travelRoute.to, entry.job.route[1].pos);

  const towState = {
    entities: new Map([[entity.id, entity]]),
    npcJobs: { byId: { 'job:mirror': projected } },
  };
  // The fixture starts with both sidecars controlled, so the compact booleans preserve refusal.
  assert.equal(towAssistWorkerEntry(towState, entity), null);
  const available = structuredClone(projected);
  available.control = false;
  available.towAssist = false;
  assert.equal(towAssistWorkerEntry({ ...towState, npcJobs: { byId: { 'job:mirror': available } } }, entity).entry, available);
  const controlled = structuredClone(available);
  controlled.control = true;
  assert.equal(towAssistWorkerEntry({ ...towState, npcJobs: { byId: { 'job:mirror': controlled } } }, entity), null);
});
