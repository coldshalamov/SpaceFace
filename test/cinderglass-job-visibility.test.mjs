// Isolated positions initialize the scene; these exercise production scanner,
// shared LOS/witness readers and quiet gates, not an ordinary earned operation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { scanner } from '../src/systems/scanner.js';
import { createCinderglassJobState } from '../src/features/cinderglassJob/operation.js';
import { bindRole } from '../src/features/cinderglassJob/identity.js';
import { CINDERGLASS_JOB_POD_ID, CINDERGLASS_JOB_SECTOR_ID } from '../src/features/cinderglassJob/definition.js';
import { cinderglassJobObserveScan, cinderglassJobObserveMarkings, cinderglassJobWatched,
  cinderglassJobServiceGate, cinderglassJobServiceProgress, cinderglassJobServiceAbort,
  latchWorld } from '../src/features/cinderglassJob/interception.js';

function fixture() {
  const make = (id, type, x, z, data = {}) => ({ id, type, pos: { x, z }, vel: { x: 0, z: 0 },
    rot: 0, alive: true, collides: true, radius: 3, hull: 60, hullMax: 60,
    data: { ...data, cinderglassOperationId: 'op' }, occupantGeneration: 1 });
  const player = Object.assign(make(1, 'ship', 0, 0), { isPlayer: true, team: 1 });
  const pod = make(2, 'payload', 30, 0, { worldRecordId: CINDERGLASS_JOB_POD_ID, cinderglassRole: 'pod' });
  const latch = make(3, 'drone', 35, 20, { cinderglassRole: 'latch', cinderglassOperationId: 'op',
    cinderglassAccessPoint: { x: 1, z: 0 } });
  const carrier = make(4, 'ship', -1000, 0, { cinderglassRole: 'carrier' });
  const st = createCinderglassJobState();
  Object.assign(st, { phase: 'recon', operationId: 'op', atLayby: true, laybyHoldActive: true });
  Object.assign(st.entities, { podId: 2, latchId: 3, carrierId: 4 });
  const state = { simTime: 10, tick: 600, mode: 'flight', world: { currentSectorId: CINDERGLASS_JOB_SECTOR_ID, cinderglassJob: st },
    entities: new Map([player, pod, latch, carrier].map(e => [e.id, e])), playerId: 1,
    player: { docked: false }, input: { actions: {} }, entityList: [player, pod, latch, carrier] };
  const bus = createBus();
  const sys = { _cg: st, state, bus, helpers: {}, _serviceActionId: 7 };
  for (const [key, e] of [['podId', pod], ['carrierId', carrier], ['latchId', latch]]) bindRole(sys, key, e);
  const scan = Object.create(scanner); scan.init({ state, bus, helpers: {} });
  bus.on('scan:pulse', payload => cinderglassJobObserveScan(sys, state, payload));
  return { make, state, st, sys, player, pod, latch, bus, scan };
}

test('visible markings do not complete hardware scan; actual production pulse does', () => {
  const f = fixture();
  assert.equal(cinderglassJobObserveMarkings(f.sys, f.state), true);
  assert.equal(f.st.podMarked, true); assert.equal(f.st.scanDone, false);
  assert.equal(cinderglassJobObserveScan(f.sys, f.state, { targetId: null }), false);
  assert.equal(cinderglassJobObserveScan(f.sys, f.state, { targetId: 4 }), false);
  f.scan._pulse(f.state, f.player, f.state.simTime);
  assert.equal(f.st.scanDone, true);
  assert.equal(f.st.receipts.filter(r => r.kind === 'scan').length, 1);
  f.scan._pulse(f.state, f.player, f.state.simTime);
  assert.equal(f.st.receipts.filter(r => r.kind === 'scan').length, 1);
});

test('scanner range/occlusion and foreign or stale pulses cannot reveal original hardware', () => {
  const f = fixture();
  const pulse = { source: 'player-scanner', scannerId: 1, scannerGeneration: 1, seq: 1, simTime: 10, pos: { x: 0, z: 0 }, radius: 1200 };
  assert.equal(cinderglassJobObserveScan(f.sys, f.state, { ...pulse, scannerGeneration: 2 }), false);
  assert.equal(cinderglassJobObserveScan(f.sys, f.state, { ...pulse, scannerId: 99 }), false);
  assert.equal(cinderglassJobObserveScan(f.sys, f.state, { ...pulse, simTime: 9 }), false);
  const wall = f.make(8, 'station', 15, 0); wall.radius = 6;
  f.state.entities.set(8, wall);
  assert.equal(cinderglassJobObserveScan(f.sys, f.state, pulse), false);
  assert.equal(f.st.scanDone, false);
  f.state.entities.delete(8);
  assert.equal(cinderglassJobObserveScan(f.sys, f.state, pulse), false, 'blocked pulse sequence cannot replay');
  f.state.world.hazardPresence = { nebula: true };
  f.pod.pos.x = 600;
  assert.equal(cinderglassJobObserveScan(f.sys, f.state, { ...pulse, seq: 2 }), false, 'existing scanner wash shortens permitted range');
  f.pod.pos.x = 30;
  assert.equal(cinderglassJobObserveScan(f.sys, f.state, { ...pulse, seq: 3 }), true);
});

test('quiet gate uses actual latch access, existing witnesses/occlusion, speed and inspection hold', () => {
  const f = fixture(); f.st.scanDone = true; f.st.phase = 'decide';
  assert.deepEqual({ x: latchWorld(f.sys, f.state).x, z: latchWorld(f.sys, f.state).z }, { x: 36, z: 20 });
  assert.equal(cinderglassJobServiceGate(f.sys, f.state).ok, true);
  f.st.laybyHoldActive = false;
  assert.equal(cinderglassJobServiceGate(f.sys, f.state).reason, 'not_at_layby'); f.st.laybyHoldActive = true;
  const witness = f.make(8, 'ship', 0, 100, { lawWitness: true, displayName: 'Actual witness' });
  f.state.entities.set(8, witness);
  f.state.entityList.push(witness);
  assert.equal(cinderglassJobWatched(f.sys, f.state).watched, true);
  assert.equal(cinderglassJobServiceGate(f.sys, f.state).reason, 'watched');
  const cover = f.make(9, 'station', 0, 50); cover.radius = 8;
  f.state.entities.set(9, cover);
  f.state.entityList.push(cover);
  assert.equal(cinderglassJobWatched(f.sys, f.state).watched, false, 'real body blocks witness sightline');
  f.player.vel.x = 6;
  f.st.serviceProgressS = 3;
  const end = cinderglassJobServiceProgress(f.sys, f.state, 7, 1 / 60);
  assert.equal(end.status, 'interrupted'); assert.equal(end.reason, 'too_fast');
  cinderglassJobServiceAbort(f.sys, f.state, end.reason);
  assert.equal(f.st.serviceProgressS, 0); assert.equal(f.st.custody, 'carried');
  f.player.vel.x = 0;
  assert.equal(cinderglassJobServiceGate(f.sys, f.state).ok, true);
  assert.equal(cinderglassJobServiceProgress(f.sys, f.state, 6, 1).reason, 'stale_service');
  assert.equal(cinderglassJobServiceProgress(f.sys, f.state, 7, 1).status, 'running');
  assert.equal(f.st.serviceProgressS, 1);
});
