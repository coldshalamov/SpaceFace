// R6-partial — mission bookkeeping only needs to be RECENT, so the step's mission:updated
// publications fold to one per mission per tick. The drives and the mixed-in ops can publish
// the same mission several times in a step (progress, nav, twist, retry); every publication
// fans out to the sim-side observers and replays to main where the UI listeners re-run per
// emit. update() arms a coalescing façade (createMissionStepBus in src/systems/missions.js)
// around the whole step: repeat publishes of one mission merge (payloads union, last write
// wins per field) and flush when the step returns. Board-level publishes (missionId == null,
// which contractClauses answers with board writes), emissions outside the step window, and
// toasts (eventBus's STEP_DEFERRED_EVENTS ruling keeps them same-tick synchronous) all pass
// through untouched. These tests pin that contract at the system boundary.
import test from 'node:test';
import assert from 'node:assert/strict';

import { missions as missionsBase } from '../src/systems/missions.js';
import { createBus } from '../src/core/eventBus.js';
import { MISSION_TUNING } from '../src/data/missions.js';

class RecordingBus {
  constructor() {
    this.events = [];
  }

  on() { return () => {}; }

  off() {}

  emit(type, payload) {
    this.events.push({ type, payload });
  }
}

function bootSystem(stepBody) {
  const state = {
    meta: { seed: 'mission-step-coalescing' },
    mode: 'flight',
    simTime: 10,
    tick: 1,
    missions: {
      nextId: 3,
      active: [
        {
          id: 'm_1', status: 'active', type: 'escort', title: 'First', stationId: 'station_helios',
          destStationId: 'station_helios', params: {}, objectiveProgress: 0, objectiveTarget: 2,
          targetEntityIds: [],
        },
        {
          id: 'm_2', status: 'active', type: 'escort', title: 'Second', stationId: 'station_helios',
          destStationId: 'station_helios', params: {}, objectiveProgress: 0, objectiveTarget: 2,
          targetEntityIds: [],
        },
      ],
      boards: {},
      receipts: [],
      completedLog: [],
      config: { ...MISSION_TUNING, maxActive: 8 },
    },
    player: {
      credits: 1000,
      reputation: {},
      uniqueWrecks: { bearings: {} },
      cargo: { items: {}, capVolume: 100, usedVolume: 0, capMass: 100, usedMass: 0, richLots: [] },
    },
    playerId: 1,
    entities: new Map(),
    entityList: [],
    nav: { waypoint: null },
    ui: { trackedMissionId: null },
    story: {},
  };
  const bus = new RecordingBus();
  const system = Object.create(missionsBase);
  system.init({ state, bus, helpers: {}, registry: null });
  // The step body stands for whatever the real drives publish through this.bus; the contract
  // under test is the delivery cadence, not any one drive.
  system._updateStep = stepBody;
  return { system, bus, state };
}

test('repeat mission:updated publishes in one step land once per mission, merged', () => {
  const { system, bus } = bootSystem(() => {
    system.bus.emit('mission:updated', { missionId: 'm_1', objectiveProgress: 1 });
    system.bus.emit('mission:updated', { missionId: 'm_2', objectiveProgress: 1 });
    system.bus.emit('mission:updated', { missionId: 'm_1', twist: 'spooked' });
    system.bus.emit('mission:updated', { missionId: 'm_1', objectiveProgress: 2 });
  });

  system.update(1 / 60, system.state);

  const updates = bus.events.filter((e) => e.type === 'mission:updated');
  assert.equal(updates.length, 2, 'one emit per mission, not per publication');
  assert.deepEqual(
    updates.map((e) => e.payload.missionId),
    ['m_1', 'm_2'],
    'flush order is first-publication order',
  );
  assert.equal(updates[0].payload.objectiveProgress, 2, 'last write wins per field');
  assert.equal(updates[0].payload.twist, 'spooked', 'earlier fields survive the merge');
  assert.equal(updates[1].payload.objectiveProgress, 1);
});

test('board-level publishes, toasts and other events stay inline during the step', () => {
  const seen = [];
  const { system, bus } = bootSystem(() => {
    system.bus.emit('mission:updated', { missionId: 'm_1', objectiveProgress: 1 });
    system.bus.emit('mission:updated', { missionId: null, stationId: 'station_helios' });
    system.bus.emit('toast', { text: 'Objective updated', kind: 'success', ttl: 3 });
    seen.push('step-end');
  });

  system.update(1 / 60, system.state);

  const board = bus.events.filter((e) => e.type === 'mission:updated' && e.payload && e.payload.missionId == null);
  const toasts = bus.events.filter((e) => e.type === 'toast');
  assert.equal(board.length, 1, 'board publishes are not held');
  assert.equal(bus.events.indexOf(board[0]) < bus.events.findIndex((e, i) => e.type === 'mission:updated' && e.payload && e.payload.missionId === 'm_1'), true,
    'the board publish lands before the step-end flush');
  assert.equal(toasts.length, 1, 'toasts are never queued by this system');
  const flushedMission = bus.events.findIndex((e) => e.type === 'mission:updated' && e.payload && e.payload.missionId === 'm_1');
  assert.equal(bus.events.indexOf(toasts[0]) < flushedMission, true,
    'a toast published mid-step delivers mid-step, ahead of the flush');
});

test('emissions outside the step window publish immediately', () => {
  const { system, bus } = bootSystem(() => {});

  system.bus.emit('mission:updated', { missionId: 'm_1', objectiveProgress: 1 });

  const updates = bus.events.filter((e) => e.type === 'mission:updated');
  assert.equal(updates.length, 1, 'accept/refresh flows keep their immediate publish');
  assert.equal(updates[0].payload.missionId, 'm_1');
});

test('a listener publishing during the flush delivers inline, not chained', () => {
  // The flush disarms before its first emit: a reaction publish goes straight out (the
  // pre-façade behaviour) instead of queueing another flush round. Needs the real bus —
  // the recording stub does not dispatch to listeners.
  const state = {
    meta: { seed: 'mission-flush-reentrancy' },
    missions: { nextId: 1, active: [], boards: {}, receipts: [], completedLog: [], config: {} },
    player: { credits: 0, reputation: {}, cargo: { items: {}, capVolume: 1, usedVolume: 0, capMass: 1, usedMass: 0, richLots: [] } },
    entities: new Map(),
    entityList: [],
    nav: { waypoint: null },
    ui: {},
    story: {},
  };
  const realBus = createBus();
  const system = Object.create(missionsBase);
  system.init({ state, bus: realBus, helpers: {}, registry: null });
  system._updateStep = () => {
    system.bus.emit('mission:updated', { missionId: 'm_1', objectiveProgress: 1 });
  };
  const seen = [];
  const off = realBus.on('mission:updated', (payload) => {
    seen.push(payload.missionId);
    if (payload.missionId === 'm_1') {
      system.bus.emit('mission:updated', { missionId: 'm_2', objectiveProgress: 1 });
    }
  });

  system.update(1 / 60, state);
  off();

  assert.deepEqual(seen, ['m_1', 'm_2'], 'the reaction publishes inline, in dispatch order');
});

test('a mid-step fault still flushes what the step already published', () => {
  const { system, bus } = bootSystem(() => {
    system.bus.emit('mission:updated', { missionId: 'm_1', objectiveProgress: 1 });
    throw new Error('drive fault');
  });

  assert.throws(() => system.update(1 / 60, system.state), /drive fault/);
  const updates = bus.events.filter((e) => e.type === 'mission:updated');
  assert.equal(updates.length, 1, 'try/finally delivers the made publication, then rethrows');
});

test('a bus without the façade (the pre-change test pattern) still runs the step', () => {
  const state = {
    meta: { seed: 'raw-bus' },
    missions: { nextId: 1, active: [], boards: {}, receipts: [], completedLog: [], config: { ...MISSION_TUNING } },
    player: { credits: 0, reputation: {}, cargo: { items: {}, capVolume: 1, usedVolume: 0, capMass: 1, usedMass: 0, richLots: [] } },
    entities: new Map(),
    entityList: [],
    nav: { waypoint: null },
    ui: {},
    story: {},
  };
  const bus = new RecordingBus();
  const system = Object.create(missionsBase);
  system.state = state;
  system.bus = bus; // direct assignment, no init: no armMissionStep on this bus
  let ran = false;
  system._updateStep = () => { ran = true; };

  system.update(1 / 60, state);
  assert.equal(ran, true, 'the collar steps aside for a plain bus');
});
