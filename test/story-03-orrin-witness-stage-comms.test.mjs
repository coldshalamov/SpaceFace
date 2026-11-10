// STORY-03: each orrinWitness:* stage produces exactly one comms popup. The case opens on the
// published H5 transition, the world confirms the recorder body, recovery and submission already
// spoke — this pins one line per stage and durable dedupe across reconcile/save-load replays.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { story } from '../src/systems/story.js';
import { orrinWitnessRecordId } from '../src/data/orrinWitnessCase.js';

const SHAPE = 'depth_h5_corridor_massacre';
const SOURCE_ID = 'orrin-witness:depth_h5_corridor_massacre:published:4242:10';
const RECORD_ID = orrinWitnessRecordId(SOURCE_ID);

function harness() {
  const state = {
    meta: { seed: 4242 },
    simTime: 1000,
    story: {
      depthProgramEncounters: {
        completed: {
          [SHAPE]: { outcome: 'published', sectorId: 'sector_io_reach', seed: 4242, tick: 10 },
        },
      },
    },
    entities: new Map(),
    world: { currentSectorId: 'sector_helios', records: { byId: {} } },
  };
  const bus = createBus();
  const popups = [];
  bus.on('comms:popup', (p) => popups.push(p));
  const sys = Object.create(story);
  sys.init({ state, bus, helpers: {}, registry: null });
  return { state, bus, popups, sys };
}

function placeRecorder(state) {
  const entity = {
    id: 'rec_1', alive: true, type: 'wreck',
    data: {
      markerId: 'orrin_witness_corridor_original',
      worldRecordId: RECORD_ID,
      orrinWitnessSourceId: SOURCE_ID,
      persistenceOwner: 'worldRecords',
    },
  };
  state.entities.set('rec_1', entity);
  state.world.records.byId[RECORD_ID] = {
    recordId: RECORD_ID,
    markerId: 'orrin_witness_corridor_original',
    identityKey: `orrin_witness_corridor_original:${SOURCE_ID}`,
  };
  return entity;
}

test('STORY-03: the published H5 transition opens the case with one comms line', () => {
  const h = harness();
  h.bus.emit('encounter:resolved', { shape: SHAPE, outcome: 'published' });
  assert.equal(h.popups.length, 1);
  assert.equal(h.popups[0].id, 'orrin_witness_stage_case_open');
  assert.equal(h.popups[0].sender, 'WARRANT ORRIN');
  assert.match(h.popups[0].text, /Corridor Massacre/);
});

test('STORY-03: the world-confirmed recorder stage speaks once', () => {
  const h = harness();
  h.bus.emit('encounter:resolved', { shape: SHAPE, outcome: 'published' });
  h.bus.emit('orrinWitness:evidenceEnsured', { sourceId: SOURCE_ID, recordId: RECORD_ID, sectorId: 'sector_io_reach' });
  const ensured = h.popups.filter((p) => p.id === 'orrin_witness_stage_recorder_confirmed');
  assert.equal(ensured.length, 1);
  assert.equal(ensured[0].sender, 'WARRANT ORRIN');
  // The ensure emit refires on every reconcile; a stale source id never speaks.
  h.bus.emit('orrinWitness:evidenceEnsured', { sourceId: SOURCE_ID, recordId: RECORD_ID, sectorId: 'sector_io_reach' });
  h.bus.emit('orrinWitness:evidenceEnsured', { sourceId: 'orrin-witness:other:1:1', recordId: 'x', sectorId: 'sector_io_reach' });
  assert.equal(h.popups.filter((p) => p.id === 'orrin_witness_stage_recorder_confirmed').length, 1);
});

test('STORY-03: recovery and submission each speak once — four stages, four lines', () => {
  const h = harness();
  h.bus.emit('encounter:resolved', { shape: SHAPE, outcome: 'published' });
  h.bus.emit('orrinWitness:evidenceEnsured', { sourceId: SOURCE_ID, recordId: RECORD_ID, sectorId: 'sector_io_reach' });
  placeRecorder(h.state);
  h.sys._onOrrinWitnessEvidence({ outcome: 'investigated', sectorId: 'sector_io_reach', entityId: 'rec_1' });
  h.sys._onOrrinWitnessSubmission({ contactId: 'contact_orrin', stationId: 'station_coalition', choiceId: 'evidence' });
  const ids = h.popups.map((p) => p.id);
  assert.deepEqual(ids, [
    'orrin_witness_stage_case_open',
    'orrin_witness_stage_recorder_confirmed',
    'orrin_witness_corridor_original',
    'orrin_witness_chain_referral',
  ]);
});

test('STORY-03: reconcile replays never re-voice an already-spoken stage', () => {
  const h = harness();
  h.bus.emit('encounter:resolved', { shape: SHAPE, outcome: 'published' });
  h.bus.emit('orrinWitness:evidenceEnsured', { sourceId: SOURCE_ID, recordId: RECORD_ID });
  // A save load reconciles again and both stage events refire.
  h.bus.emit('save:loaded');
  h.bus.emit('orrinWitness:evidenceEnsured', { sourceId: SOURCE_ID, recordId: RECORD_ID });
  assert.equal(h.popups.length, 2, 'still exactly one popup per stage');
});
