import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import {
  ORRIN_WITNESS_MARKER_ID,
  ORRIN_WITNESS_PERSISTENCE_OWNER,
  ORRIN_WITNESS_SOURCE_SHAPE_ID,
  ORRIN_WITNESS_SUBMISSION_EVENT,
  orrinWitnessSourceIdForRecord,
} from '../src/data/orrinWitnessCase.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { story } from '../src/systems/story.js';
import { world } from '../src/systems/world.js';
import { applyMapOpenIntentToView, buildSystemModel } from '../src/ui/galaxyMap.js';
import { emitBarContactChoice } from '../src/ui/station/barContacts.js';

const H5 = ORRIN_WITNESS_SOURCE_SHAPE_ID;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function publishedRecord(overrides = {}) {
  return {
    outcome: 'published',
    sectorId: 'sector_io_reach',
    seed: 4818,
    tick: 88,
    sourceAnchor: { x: 211, z: -73 },
    ...overrides,
  };
}

function protectedOwners(state) {
  return clone({
    credits: state.player.credits,
    cargo: state.player.cargo,
    factions: state.factions,
    heat: state.heat,
    missions: state.missions,
    stationContacts: state.stationContacts,
  });
}

function recorderRecords(state) {
  return Object.values(state.world.records.byId)
    .filter((record) => record.markerId === ORRIN_WITNESS_MARKER_ID);
}

function boot(record = publishedRecord(), saved = null, { withStationContacts = false } = {}) {
  const sim = createSimulation({
    seed: 4818,
    systems: withStationContacts ? [world, stationContacts, story] : [world, story],
    updateOrder: [],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.simTime = 31;
  state.tick = 88;
  state.world.currentSectorId = 'sector_io_reach';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100, data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  state.story.depthProgramEncounters = { completed: { [H5]: clone(record) }, history: [] };
  if (saved) {
    state.story = clone(saved.story);
    state.world.records = clone(saved.records);
  }
  const events = [];
  for (const name of ['orrinWitness:evidenceRecovered', 'orrinWitness:submitted', 'ui:pushScreen']) {
    bus.on(name, (payload) => events.push({ name, payload }));
  }
  return { sim, state, bus, player, events };
}

function activate(h) {
  h.bus.emit('encounter:resolved', { shape: H5, outcome: 'published' });
  const records = recorderRecords(h.state);
  assert.equal(records.length, 1, 'one qualifying source produces one durable aftermath record');
  const entity = h.state.entityList.find((candidate) => candidate.data
    && candidate.data.worldRecordId === records[0].recordId);
  assert.ok(entity && entity.alive, 'the durable record materializes as a live physical recorder');
  return { record: records[0], entity };
}

test('fresh and reset story state omit the lazy Orrin case key', () => {
  const sim = createSimulation({ seed: 4818, systems: [story], updateOrder: [] });
  assert.equal(Object.hasOwn(sim.state.story, 'orrinWitnessCase'), false);
  sim.state.story.orrinWitnessCase = { sourceId: 'stale', phase: 'referral' };
  sim.bus.emit('game:started', {});
  assert.equal(Object.hasOwn(sim.state.story, 'orrinWitnessCase'), false,
    'new-game reset deletes a stale prior case without adding a default null');
});

test('published H5 is the only source for one conserved physical Orrin recorder', () => {
  const h = boot();
  const before = protectedOwners(h.state);
  const { record, entity } = activate(h);

  assert.equal(record.kind, 'aftermath');
  assert.equal(record.sectorId, 'sector_io_reach');
  assert.deepEqual(record.pos, { x: 211, z: -73 });
  assert.equal(entity.data.markerId, ORRIN_WITNESS_MARKER_ID);
  assert.equal(entity.data.persistenceOwner, ORRIN_WITNESS_PERSISTENCE_OWNER);
  assert.equal(entity.data.scannerSignalKind, 'archive');
  assert.equal(h.state.story.orrinWitnessCase.phase, 'unrecovered');
  assert.equal(h.state.story.orrinWitnessCase.evidence, 'unrecovered');

  h.bus.emit('encounter:resolved', { shape: H5, outcome: 'published' });
  h.bus.emit('orrinWitness:ensureEvidence', { sourceId: 'spoofed-source' });
  assert.equal(recorderRecords(h.state).length, 1, 'replay and spoofed ensure cannot duplicate the body');
  assert.deepEqual(protectedOwners(h.state), before, 'the route does not write protected owner state');
});

test('wrong completed outcome, sector, and flags fail closed', () => {
  for (const record of [
    publishedRecord({ outcome: 'fled' }),
    publishedRecord({ sectorId: 'sector_tethys_junction' }),
  ]) {
    const h = boot(record);
    h.state.story.flags.orrinPathOpen = true;
    h.bus.emit('encounter:resolved', { shape: H5, outcome: 'published' });
    assert.equal(recorderRecords(h.state).length, 0);
    assert.equal(h.state.story.orrinWitnessCase, undefined);
  }
});

test('only the exact recorder investigation recovers evidence, and the object remains', () => {
  const h = boot();
  const { entity } = activate(h);
  const impostor = h.sim.spawn({
    type: 'wreck', team: 2, pos: { x: 1, z: 1 }, vel: { x: 0, z: 0 },
    radius: 5, mass: 20, hull: 1, hullMax: 1,
    data: { markerId: ORRIN_WITNESS_MARKER_ID, worldRecordId: 'not-the-source' },
  });

  h.bus.emit('signal:investigated', {
    outcome: 'investigated', sectorId: 'sector_io_reach', entityId: impostor.id,
  });
  assert.equal(h.state.story.orrinWitnessCase.evidence, 'unrecovered');

  const copiedIds = h.sim.spawn({
    type: 'wreck', team: 2, pos: { x: 2, z: 2 }, vel: { x: 0, z: 0 },
    radius: 5, mass: 20, hull: 1, hullMax: 1,
    data: {
      markerId: entity.data.markerId,
      worldRecordId: entity.data.worldRecordId,
      orrinWitnessSourceId: entity.data.orrinWitnessSourceId,
      persistenceOwner: 'transient',
    },
  });
  h.bus.emit('signal:investigated', {
    outcome: 'investigated', sectorId: 'sector_io_reach', entityId: copiedIds.id,
  });
  assert.equal(h.state.story.orrinWitnessCase.evidence, 'unrecovered',
    'copied public ids with the wrong owner cannot recover evidence');

  const wrongSource = h.sim.spawn({
    type: 'wreck', team: 2, pos: { x: 3, z: 3 }, vel: { x: 0, z: 0 },
    radius: 5, mass: 20, hull: 1, hullMax: 1,
    data: {
      markerId: entity.data.markerId,
      worldRecordId: entity.data.worldRecordId,
      orrinWitnessSourceId: `${entity.data.orrinWitnessSourceId}:copied`,
      persistenceOwner: ORRIN_WITNESS_PERSISTENCE_OWNER,
    },
  });
  h.bus.emit('signal:investigated', {
    outcome: 'investigated', sectorId: 'sector_io_reach', entityId: wrongSource.id,
  });
  assert.equal(h.state.story.orrinWitnessCase.evidence, 'unrecovered',
    'the world owner stamp cannot substitute for the exact source identity');

  h.bus.emit('signal:investigated', {
    outcome: 'investigated', sectorId: 'sector_io_reach', entityId: entity.id,
  });
  assert.equal(h.state.story.orrinWitnessCase.phase, 'recovered');
  assert.equal(h.state.story.orrinWitnessCase.evidence, 'recovered');
  assert.equal(entity.alive, true, 'investigation never consumes the evidence body');
  assert.equal(recorderRecords(h.state).length, 1);
});

test('dedicated Orrin Bar intent submits once without station-contact memory writes', () => {
  const h = boot(publishedRecord(), null, { withStationContacts: true });
  const { entity } = activate(h);
  h.bus.emit('signal:investigated', {
    outcome: 'investigated', sectorId: 'sector_io_reach', entityId: entity.id,
  });
  const stationMemoryBefore = clone(h.state.player.stationContacts);
  for (const payload of [
    { contactId: 'contact_orrin', stationId: 'station_coalition', choiceId: 'rumor' },
    { contactId: 'contact_wrong', stationId: 'station_coalition', choiceId: 'evidence' },
    { contactId: 'contact_orrin', stationId: 'station_customs', choiceId: 'evidence' },
  ]) h.bus.emit(ORRIN_WITNESS_SUBMISSION_EVENT, payload);
  assert.equal(h.state.story.orrinWitnessCase.submittedAt, null);

  const submission = {
    contactId: 'contact_orrin', stationId: 'station_coalition', choiceId: 'evidence',
  };
  assert.equal(emitBarContactChoice(h.bus, submission), ORRIN_WITNESS_SUBMISSION_EVENT);
  const submittedAt = h.state.story.orrinWitnessCase.submittedAt;
  assert.equal(h.state.story.orrinWitnessCase.phase, 'referral');
  assert.equal(h.state.story.orrinWitnessCase.routeReferredAt, submittedAt);
  const referral = h.events.find((event) => event.name === 'ui:pushScreen');
  assert.deepEqual(referral && referral.payload, {
    id: 'galaxyMap', focus: 'galaxy', sectorId: 'sector_tethys_junction',
    stationId: 'station_customs', source: 'orrinWitness:referral',
  });
  emitBarContactChoice(h.bus, submission);
  assert.equal(h.events.filter((event) => event.name === 'orrinWitness:submitted').length, 1);
  assert.deepEqual(h.state.player.stationContacts, stationMemoryBefore,
    'full stationContacts registration observes no generic talk event or contact memory write');

  const model = buildSystemModel(h.state, 'sector_tethys_junction');
  const customs = model.points.find((point) => point.stationId === 'station_customs');
  assert.equal(customs.statusLine, 'ORRIN CASE · CHAIN-OF-CUSTODY INTAKE');
  const view = applyMapOpenIntentToView({}, referral.payload, h.state);
  assert.equal(view.openTarget.stationId, 'station_customs');
  assert.equal(h.state.nav && h.state.nav.waypoint, null, 'referral does not arm a course');
});

test('source identity, recovered state, and one recorder survive a save/load replay', () => {
  const h = boot();
  const { entity } = activate(h);
  h.bus.emit('signal:investigated', {
    outcome: 'investigated', sectorId: 'sector_io_reach', entityId: entity.id,
  });
  const saved = { story: clone(h.state.story), records: clone(h.state.world.records) };
  const resumed = boot(publishedRecord(), saved);
  resumed.bus.emit('save:loaded');
  assert.equal(recorderRecords(resumed.state).length, 1);
  assert.equal(resumed.state.story.orrinWitnessCase.evidence, 'recovered');
  assert.equal(resumed.state.story.orrinWitnessCase.sourceId,
    orrinWitnessSourceIdForRecord(resumed.state.story.depthProgramEncounters.completed[H5], resumed.state));
  const restored = resumed.state.entityList.find((candidate) => candidate.data
    && candidate.data.markerId === ORRIN_WITNESS_MARKER_ID);
  assert.ok(restored && restored.alive, 'Continue rematerializes the same conserved recorder');
});

test('destroyed recorder remains terminal across reconcile and Continue', () => {
  const h = boot();
  const { record, entity } = activate(h);
  entity.alive = false;
  h.sim.registry.get('world').markWorldRecordDestroyed(record.recordId, { outcome: 'destroyed' });
  const terminal = clone(h.state.world.records.byId[record.recordId]);

  h.bus.emit('save:loaded');
  assert.deepEqual(h.state.world.records.byId[record.recordId], terminal,
    'reconcile cannot overwrite terminal outcome or position');
  assert.equal(h.state.entityList.some((candidate) => candidate.alive
    && candidate.data && candidate.data.worldRecordId === record.recordId), false);
  assert.equal(h.state.story.orrinWitnessCase.phase, 'unrecovered',
    'the case remains truthful: source exists but physical evidence was not recovered');

  const saved = { story: clone(h.state.story), records: clone(h.state.world.records) };
  const resumed = boot(publishedRecord(), saved);
  resumed.bus.emit('save:loaded');
  assert.equal(recorderRecords(resumed.state)[0].outcome, 'destroyed');
  assert.equal(recorderRecords(resumed.state)[0].alive, false);
  assert.equal(resumed.state.entityList.some((candidate) => candidate.alive
    && candidate.data && candidate.data.worldRecordId === record.recordId), false,
  'Continue cannot resurrect terminal evidence');
  assert.equal(resumed.state.story.orrinWitnessCase.evidence, 'unrecovered');
});
