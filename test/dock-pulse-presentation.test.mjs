import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createInfrastructureMotionTracker,
  resolveDockRingRate,
  resolveDockScalePing,
  resolveRingSizeFactor,
} from '../src/render/infrastructureMotion.js';

function createMockStationMesh(scale = 1) {
  return {
    userData: { ring1: { rotation: { z: 0 } } },
    children: [],
    scale: {
      x: scale, y: scale, z: scale,
      set(x, y, z) { this.x = x; this.y = y; this.z = z; },
      setScalar(s) { this.x = s; this.y = s; this.z = s; },
    },
  };
}

function createFakeBus() {
  const handlers = new Map();
  return {
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
      return () => {};
    },
    emit(event, payload) {
      for (const fn of handlers.get(event) || []) fn(payload);
    },
  };
}

test('dock ring rate: berth seats slow, clamps release fast, then baseline', () => {
  const base = 0.05;
  assert.equal(resolveDockRingRate(base, 'docked', 0), base);
  assert.ok(Math.abs(resolveDockRingRate(base, 'docked', 0.3) - base * 0.25) < 1e-9,
    'ring holds at quarter speed while the berth seats');
  assert.equal(resolveDockRingRate(base, 'docked', 1.2), base);
  assert.equal(resolveDockRingRate(base, 'docked', 9), base);

  assert.ok(Math.abs(resolveDockRingRate(base, 'undocked', 0) - base * 1.6) < 1e-9,
    'clamp release surges the ring');
  const mid = resolveDockRingRate(base, 'undocked', 0.3);
  assert.ok(mid > base && mid < base * 1.6, 'surge decays');
  assert.equal(resolveDockRingRate(base, 'undocked', 0.8), base);

  assert.equal(resolveDockRingRate(base, 'warping', 0.2), base);
  assert.equal(resolveDockRingRate(base, 'docked', -1), base);
  assert.equal(resolveDockRingRate(NaN, 'docked', 0.2), 0);
});

test('dock scale ping: thump on seat, dip on release, 1 outside', () => {
  assert.equal(resolveDockScalePing('docked', -0.1), 1);
  assert.equal(resolveDockScalePing('docked', 0.5), 1);
  assert.ok(Math.abs(resolveDockScalePing('docked', 0.25) - 1.008) < 1e-9);
  assert.equal(resolveDockScalePing('undocked', 0.4), 1);
  assert.ok(Math.abs(resolveDockScalePing('undocked', 0.2) - 0.994) < 1e-9);
  assert.equal(resolveDockScalePing('warping', 0.1), 1);
  assert.equal(resolveDockScalePing('docked', NaN), 1);
});

test('ring size factor: big rings turn slower (centrifuge gravity), clamped', () => {
  assert.equal(resolveRingSizeFactor(60), 1);
  assert.ok(Math.abs(resolveRingSizeFactor(240) - 0.5) < 1e-9);
  assert.equal(resolveRingSizeFactor(1e6), 0.4);
  assert.equal(resolveRingSizeFactor(1), 1.6);
  assert.equal(resolveRingSizeFactor(NaN), 1);
  assert.equal(resolveRingSizeFactor(0), 1);
  assert.equal(resolveRingSizeFactor(-3), 1);
});

test('dock pulse: the berthed station eases its ring and thumps, others ignore it', () => {
  const tracker = createInfrastructureMotionTracker();
  const bus = createFakeBus();
  tracker.bindEvents(bus);
  const mesh = createMockStationMesh(2);
  const other = createMockStationMesh(2);
  const station = { id: 7, radius: 60, pos: { x: 0, z: 0 }, data: { stationId: 'station_helios' } };
  const neighbor = { id: 8, radius: 60, pos: { x: 500, z: 0 }, data: { stationId: 'station_vesta' } };

  // Baseline step over dt=0.1 with no pulse (fresh tracker, same station).
  const plain = createInfrastructureMotionTracker();
  const plainMesh = createMockStationMesh(2);
  plain.updateStationMotion(station, plainMesh, 10.0, 0.016);
  const plainBefore = plainMesh.userData.ring1.rotation.z;
  plain.updateStationMotion(station, plainMesh, 10.1, 0.1);
  const plainStep = plainMesh.userData.ring1.rotation.z - plainBefore;

  // Same step mid-hold after a dock: the ring advances far less.
  tracker.updateStationMotion(station, mesh, 10.0, 0.016);
  bus.emit('dock:docked', { stationId: 'station_helios' });
  const before = mesh.userData.ring1.rotation.z;
  tracker.updateStationMotion(station, mesh, 10.4, 0.1);
  const pulsedStep = mesh.userData.ring1.rotation.z - before;
  assert.ok(pulsedStep < plainStep * 0.5, `ring eases mid-hold: ${pulsedStep} vs ${plainStep}`);

  // Contact thump lands on the berthed station only.
  assert.ok(mesh.scale.x > 2, `berthed station thumps: ${mesh.scale.x}`);
  tracker.updateStationMotion(neighbor, other, 10.4, 0.1);
  assert.equal(other.scale.x, 2, 'neighbor station untouched');
  tracker.unbindEvents();
});

test('dock pulse: undock reuses the last berth and surges the ring', () => {
  const tracker = createInfrastructureMotionTracker();
  const bus = createFakeBus();
  tracker.bindEvents(bus);
  const mesh = createMockMeshWithScale();
  const station = { id: 7, radius: 60, pos: { x: 0, z: 0 }, data: { stationId: 'station_helios' } };
  tracker.updateStationMotion(station, mesh, 20.0, 0.016);
  bus.emit('dock:docked', { stationId: 'station_helios' });
  tracker.updateStationMotion(station, mesh, 21.5, 0.1); // pulse expired
  const settled = mesh.userData.ring1.rotation.z;

  bus.emit('dock:undocked', {}); // no station id — berth remembered
  tracker.updateStationMotion(station, mesh, 21.6, 0.1);
  const surgeStep = mesh.userData.ring1.rotation.z - settled;

  const plain = createInfrastructureMotionTracker();
  const plainMesh = createMockMeshWithScale();
  plain.updateStationMotion(station, plainMesh, 21.5, 0.016);
  const plainBefore = plainMesh.userData.ring1.rotation.z;
  plain.updateStationMotion(station, plainMesh, 21.6, 0.1);
  const plainStep = plainMesh.userData.ring1.rotation.z - plainBefore;
  assert.ok(surgeStep > plainStep * 1.2, `release surges the ring: ${surgeStep} vs ${plainStep}`);
  assert.ok(mesh.scale.x < 2, `release dips the hull: ${mesh.scale.x}`);
  tracker.unbindEvents();
});

function createMockMeshWithScale() {
  return createMockStationMesh(2);
}

test('dock pulse: reduced motion skips ring and thump', () => {
  const tracker = createInfrastructureMotionTracker();
  const bus = createFakeBus();
  tracker.bindEvents(bus);
  const mesh = createMockStationMesh(2);
  const station = { id: 7, radius: 60, pos: { x: 0, z: 0 }, data: { stationId: 'station_helios' } };
  tracker.updateStationMotion(station, mesh, 30.0, 0.016, { motionReduce: true });
  bus.emit('dock:docked', { stationId: 'station_helios' });
  tracker.updateStationMotion(station, mesh, 30.4, 0.1, { motionReduce: true });
  assert.equal(mesh.userData.ring1.rotation.z, 0);
  assert.equal(mesh.scale.x, 2);
  tracker.unbindEvents();
});
