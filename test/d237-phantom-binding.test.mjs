/**
 * D237 — latent phantom-binding siblings of the SWP-CLAIM fix: `point.entityId` is a bare
 * id, not a world-ledger pin, and entity ids recycle. A point honoring whatever currently
 * occupies the id can stamp pod records onto — or surface offers from — a foreign body.
 *
 * survivorPod.entityForPoint and salvage._onScan now apply the same verify-then-drop guard
 * as salvage._entityForPoint: the occupant must still carry the point's own binding
 * (data.salvagePointId === point.id, or markerId for marker-bound wrecks); anything else
 * drops the stale pin.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { survivorPod } from '../src/systems/survivorPod.js';
import { salvage } from '../src/systems/salvage.js';

function fakeState() {
  return {
    entities: new Map(),
    salvage: { points: [], plannedSectorId: null, sources: {} },
    missions: { receipts: [], active: [], boards: {} },
    world: { currentSectorId: 'sector_test_phantom' },
    simTime: 10,
    meta: { seed: 4242 },
    factions: {},
    player: { stats: {} },
    ui: {},
  };
}

function fakeBus() {
  const emitted = [];
  return {
    emitted,
    emit(name, payload) { emitted.push({ name, payload }); },
    on() {},
  };
}

test('survivorPod reconcile never stamps a recycled foreign occupant', () => {
  const state = fakeState();
  const point = {
    id: 'zone_a:sal0', sectorId: 'sector_test_phantom', zoneId: 'zone_a',
    pos: { x: 10, z: 20 }, entityId: 42, isCommunicator: false, offered: false,
  };
  state.salvage.points.push(point);
  // The freed id 42 is recycled onto an unrelated pirate — no salvagePointId binding.
  const foreign = { id: 42, type: 'ship', alive: true, pos: { x: 10, z: 20 }, data: {} };
  state.entities.set(42, foreign);

  const rec = {
    salvagePointId: point.id, entityId: 42, sectorId: point.sectorId,
    destStationId: 'station_x', wreckMissionId: 'wreck_test', oxygenDueAt: 100,
    stripPool: {}, stripCredits: 0, rescueSelected: false, stripped: false,
  };
  const ok = survivorPod._reconcilePointRecord(state, rec);
  assert.equal(ok, true, 'reconcile still records the point metadata');
  assert.equal(point.entityId, null, 'the stale pin is dropped, not honored');
  assert.deepEqual(foreign.data, {},
    'the foreign occupant is never stamped with pod identity');
});

test('survivorPod reconcile stamps the bound carrier (control)', () => {
  const state = fakeState();
  const point = {
    id: 'zone_a:sal1', sectorId: 'sector_test_phantom', zoneId: 'zone_a',
    pos: { x: 10, z: 20 }, entityId: 77, isCommunicator: false, offered: false,
  };
  state.salvage.points.push(point);
  const carrier = {
    id: 77, type: 'wreck', alive: true, pos: { x: 10, z: 20 },
    data: { salvagePointId: point.id },
  };
  state.entities.set(77, carrier);

  const rec = {
    salvagePointId: point.id, entityId: 77, sectorId: point.sectorId,
    destStationId: 'station_x', wreckMissionId: 'wreck_test', oxygenDueAt: 100,
    stripPool: {}, stripCredits: 0, rescueSelected: false, stripped: false,
  };
  const ok = survivorPod._reconcilePointRecord(state, rec);
  assert.equal(ok, true);
  assert.equal(point.entityId, 77, 'a verified binding is kept');
  assert.equal(carrier.data.survivorPod != null, true,
    'the bound carrier receives the pod mirror');
  assert.equal(carrier.data.salvagePointId, point.id);
});

test('salvage scan on a recycled id never offers a foreign body', () => {
  const state = fakeState();
  const point = {
    id: 'zone_b:sal0', sectorId: 'sector_test_phantom', zoneId: 'zone_b',
    pos: { x: 0, z: 0 }, entityId: 9, isCommunicator: true, offered: false,
    wreckMissionId: null,
  };
  state.salvage.points.push(point);
  const foreign = { id: 9, type: 'ship', alive: true, pos: { x: 0, z: 0 }, data: {} };
  state.entities.set(9, foreign);
  const bus = fakeBus();
  salvage.state = state;
  salvage.bus = bus;

  salvage._onScan({ targetId: 9 });
  assert.equal(point.offered, false, 'no offer fires off a phantom id hit');
  assert.equal(point.entityId, null, 'the stale pin is dropped for the next rebuild');
  assert.equal(bus.emitted.some((e) => e.name === 'salvage:communicatorFound'), false,
    'no communicator-found event is emitted');
});

test('salvage scan on the verified bound carrier still offers (control)', () => {
  const state = fakeState();
  const point = {
    id: 'zone_b:sal1', sectorId: 'sector_test_phantom', zoneId: 'zone_b',
    pos: { x: 0, z: 0 }, entityId: 11, isCommunicator: true, offered: false,
    wreckMissionId: null,
  };
  state.salvage.points.push(point);
  const carrier = {
    id: 11, type: 'wreck', alive: true, pos: { x: 0, z: 0 },
    data: { salvagePointId: point.id },
  };
  state.entities.set(11, carrier);
  const bus = fakeBus();
  salvage.state = state;
  salvage.bus = bus;

  salvage._onScan({ targetId: 11 });
  assert.equal(point.offered, true,
    'the offer fires when the scanned entity is the verified bound carrier');
  assert.equal(point.entityId, 11, 'a verified pin survives');
});
