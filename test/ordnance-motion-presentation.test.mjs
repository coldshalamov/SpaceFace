import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createOrdnanceMotionTracker,
  resolveBeaconSway,
  resolveBurndownShrink,
  resolveDeployUnfold,
  resolveOrdnanceKindConfig,
  resolveProximityTremor,
  resolveSizeTumbleFactor,
  resolveStrobePulse,
  resolveWarningStrobeHz,
} from '../src/render/ordnanceMotionPresentation.js';

function createMockMesh(scale = 1) {
  return {
    rotation: { x: 0, y: 0, z: 0 },
    scale: {
      x: scale, y: scale, z: scale,
      set(x, y, z) { this.x = x; this.y = y; this.z = z; },
      setScalar(s) { this.x = s; this.y = s; this.z = s; },
    },
    userData: {},
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

test('ordnance kinds each have a distinct body language', () => {
  const bomb = resolveOrdnanceKindConfig('bomb');
  const mine = resolveOrdnanceKindConfig('mine');
  const charge = resolveOrdnanceKindConfig('charge');
  const beacon = resolveOrdnanceKindConfig('beacon');
  assert.ok(bomb && mine && charge && beacon);
  // Thrown plates spin fastest; anchored mines barely turn; buoys don't tumble at all.
  assert.ok(charge.tumble > bomb.tumble);
  assert.ok(bomb.tumble > mine.tumble);
  assert.equal(beacon.tumble, 0);
  assert.equal(resolveOrdnanceKindConfig('ship'), null);
  assert.equal(resolveOrdnanceKindConfig(''), null);
});

test('size tumble factor: big bodies turn slower, clamped, NaN-safe', () => {
  assert.equal(resolveSizeTumbleFactor(1.4, 1.4), 1);
  assert.ok(Math.abs(resolveSizeTumbleFactor(2.8, 1.4) - 0.5) < 1e-9);
  assert.equal(resolveSizeTumbleFactor(100, 1.4), 0.3);
  assert.equal(resolveSizeTumbleFactor(0.1, 1.4), 2.2);
  assert.equal(resolveSizeTumbleFactor(NaN, 1.4), 1);
  assert.equal(resolveSizeTumbleFactor(0, 1.4), 1);
  assert.equal(resolveSizeTumbleFactor(-5, 1.4), 1);
  assert.equal(resolveSizeTumbleFactor(3, NaN), 1);
});

test('deploy unfold: 0.55 ramp with a mid breath, exactly 1 outside the window', () => {
  assert.equal(resolveDeployUnfold(-0.1, 0.4), 1);
  assert.equal(resolveDeployUnfold(0.4, 0.4), 1);
  assert.equal(resolveDeployUnfold(9, 0.4), 1);
  assert.equal(resolveDeployUnfold(NaN, 0.4), 1);
  assert.ok(Math.abs(resolveDeployUnfold(0, 0.4) - 0.55) < 1e-9);
  const mid = resolveDeployUnfold(0.2, 0.4);
  assert.ok(mid > 0.9 && mid < 1.05, `mid-ramp swell reads: ${mid}`);
  // Monotonic-ish climb: later is never much smaller than earlier.
  let prev = 0;
  for (let t = 0; t < 0.4; t += 0.02) {
    const v = resolveDeployUnfold(t, 0.4);
    assert.ok(v > prev - 0.02, `ramp climbs at t=${t}: ${v} vs ${prev}`);
    prev = v;
  }
});

test('warning strobe accelerates 2Hz to 9Hz into detonation', () => {
  assert.equal(resolveWarningStrobeHz(10), 2);
  assert.equal(resolveWarningStrobeHz(3), 2);
  assert.equal(resolveWarningStrobeHz(0), 9);
  assert.equal(resolveWarningStrobeHz(NaN), 2);
  assert.ok(resolveWarningStrobeHz(0.5) > resolveWarningStrobeHz(1.5));
  assert.ok(resolveWarningStrobeHz(1.5) > resolveWarningStrobeHz(2.5));
});

test('strobe pulse shapes: warning cracks sharp, heart thumps soft', () => {
  assert.equal(resolveStrobePulse(NaN, 'warning'), 0);
  assert.ok(Math.abs(resolveStrobePulse(0.25, 'warning') - 1) < 1e-9);
  assert.equal(resolveStrobePulse(0.75, 'warning'), 0);
  const heart = resolveStrobePulse(0.25, 'heart');
  assert.ok(heart > 0.3 && heart <= 1, `heartbeat reads: ${heart}`);
  assert.equal(resolveStrobePulse(0.25, 'warning'), resolveStrobePulse(1.25, 'warning'));
});

test('burndown shrink retires bodies by shrinking, never popping', () => {
  assert.equal(resolveBurndownShrink(1), 1);
  assert.equal(resolveBurndownShrink(0.35), 1);
  assert.equal(resolveBurndownShrink(NaN), 1);
  assert.ok(Math.abs(resolveBurndownShrink(0.175) - 0.5) < 1e-9);
  assert.equal(resolveBurndownShrink(0), 0.05);
  assert.equal(resolveBurndownShrink(-1), 0.05);
});

test('proximity tremor is quadratic: calm at the edge, urgent at the line', () => {
  assert.equal(resolveProximityTremor(0, 0.02), 0);
  assert.equal(resolveProximityTremor(1, 0.02), 0.02);
  assert.ok(Math.abs(resolveProximityTremor(0.5, 0.02) - 0.005) < 1e-9);
  assert.equal(resolveProximityTremor(NaN, 0.02), 0);
  assert.equal(resolveProximityTremor(1, NaN), 0);
});

test('beacon sway: claim buoys rock livelier, warning doubles the rock', () => {
  // Amplitudes compared as sweep maxima: warn also quickens the cadence, so a single
  // instantaneous sample can catch either curve near a zero crossing.
  let laneMax = 0;
  let claimMax = 0;
  let warnMax = 0;
  for (let t = 0; t < 4; t += 0.05) {
    const lane = resolveBeaconSway(t, 1.2, false, false);
    const claim = resolveBeaconSway(t, 1.2, true, false);
    const warn = resolveBeaconSway(t, 1.2, true, true);
    laneMax = Math.max(laneMax, Math.hypot(lane.x, lane.z));
    claimMax = Math.max(claimMax, Math.hypot(claim.x, claim.z));
    warnMax = Math.max(warnMax, Math.hypot(warn.x, warn.z));
  }
  assert.ok(claimMax > laneMax, `claim livelier than lane: ${claimMax} vs ${laneMax}`);
  assert.ok(warnMax > claimMax * 1.5, `warning doubles the rock: ${warnMax} vs ${claimMax}`);
  const again = resolveBeaconSway(10, 1.2, true, true);
  assert.deepEqual(again, resolveBeaconSway(10, 1.2, true, true));
  const out = {};
  assert.equal(resolveBeaconSway(10, 0, false, false, out), out);
});

test('ordnance tracker: bombs tumble off-axis, never touch sim yaw', () => {
  const tracker = createOrdnanceMotionTracker();
  const mesh = createMockMesh(1.4);
  const bomb = { id: 'bomb_1', type: 'bomb', radius: 1.4, rot: 0.7, data: { phase: 'drift' } };
  tracker.updateOrdnanceMotion(bomb, mesh, 1.0, 0.016);
  const x1 = mesh.rotation.x;
  const z1 = mesh.rotation.z;
  tracker.updateOrdnanceMotion(bomb, mesh, 1.05, 0.05);
  assert.notEqual(mesh.rotation.x, x1, 'tumbles on x');
  assert.notEqual(mesh.rotation.z, z1, 'tumbles on z');
  assert.equal(mesh.rotation.y, 0, 'sim yaw untouched');
});

test('ordnance tracker: thrown charges spin fast, stuck charges go rigid', () => {
  const tracker = createOrdnanceMotionTracker();
  const mesh = createMockMesh(1.2);
  const flying = { id: 'charge_9', type: 'charge', radius: 1.2, data: { hostId: null, armed: true } };
  tracker.updateOrdnanceMotion(flying, mesh, 1.0, 0.016);
  tracker.updateOrdnanceMotion(flying, mesh, 1.05, 0.05);
  const flightDelta = Math.abs(mesh.rotation.x) + Math.abs(mesh.rotation.z);
  assert.ok(flightDelta > 0.01, `flying plate tumbles hard: ${flightDelta}`);

  // Stick it: tumble must decay to ~nothing within the settle window.
  const stuck = { id: 'charge_9', type: 'charge', radius: 1.2, data: { hostId: 42, armed: true } };
  for (let i = 0; i < 20; i++) {
    tracker.updateOrdnanceMotion(stuck, mesh, 1.05 + (i + 1) * 0.05, 0.05);
  }
  const xBefore = mesh.rotation.x;
  tracker.updateOrdnanceMotion(stuck, mesh, 2.2, 0.05);
  tracker.updateOrdnanceMotion(stuck, mesh, 2.25, 0.05);
  const stuckDelta = Math.abs(mesh.rotation.x - xBefore);
  assert.ok(stuckDelta < flightDelta / 5, `bolted plate holds still: ${stuckDelta} vs ${flightDelta}`);
});

test('ordnance tracker: armed mines tremble as the player closes', () => {
  const near = createOrdnanceMotionTracker();
  const far = createOrdnanceMotionTracker();
  const meshNear = createMockMesh(6);
  const meshFar = createMockMesh(6);
  const mine = { id: 'mine_3', type: 'mine', radius: 6, pos: { x: 0, z: 0 }, data: { armed: true, triggerRadius: 60 } };
  const playerNear = { pos: { x: 30, z: 0 } };
  const playerFar = { pos: { x: 900, z: 0 } };
  // Same frames, same mine: only the player distance differs, so any pose delta is tremor.
  let maxDelta = 0;
  for (let t = 0; t < 5; t++) {
    near.updateOrdnanceMotion(mine, meshNear, 5 + t * 0.05, 0.05, playerNear);
    far.updateOrdnanceMotion(mine, meshFar, 5 + t * 0.05, 0.05, playerFar);
    maxDelta = Math.max(maxDelta,
      Math.abs(meshNear.rotation.x - meshFar.rotation.x)
      + Math.abs(meshNear.rotation.z - meshFar.rotation.z));
  }
  assert.ok(maxDelta > 0.0005, `close mine trembles: ${maxDelta}`);
});

test('ordnance tracker: spawn unfolds instead of popping in', () => {
  const tracker = createOrdnanceMotionTracker();
  const bus = createFakeBus();
  tracker.bindEvents(bus);
  const mesh = createMockMesh(3);
  const pod = { id: 'pod_12', type: 'payload', radius: 3, data: {} };
  tracker.updateOrdnanceMotion(pod, mesh, 10.0, 0.016);
  bus.emit('entity:spawned', { id: 'pod_12', type: 'payload' });
  tracker.updateOrdnanceMotion(pod, mesh, 10.01, 0.016);
  assert.ok(mesh.scale.x < 3, `unfold starts small: ${mesh.scale.x}`);
  for (let i = 0; i < 30; i++) {
    tracker.updateOrdnanceMotion(pod, mesh, 10.01 + (i + 1) * 0.05, 0.05);
  }
  assert.ok(Math.abs(mesh.scale.x - 3) < 1e-6, `unfold settles exactly at base: ${mesh.scale.x}`);
  tracker.unbindEvents();
});

test('ordnance tracker: expiring bodies shrink out via dieAt', () => {
  const tracker = createOrdnanceMotionTracker();
  const mesh = createMockMesh(1.6);
  const vmine = { id: 'vm_2', type: 'vectormine', radius: 1.6, data: { kind: 'vector_mine', dieAt: 20.2 } };
  tracker.updateOrdnanceMotion(vmine, mesh, 20.0, 0.016);
  const full = mesh.scale.x;
  tracker.updateOrdnanceMotion(vmine, mesh, 20.1, 0.05);
  assert.ok(mesh.scale.x < full, `burndown shrinks: ${mesh.scale.x} vs ${full}`);
});

test('ordnance tracker: reduced motion freezes tumble, unknown types ignored', () => {
  const tracker = createOrdnanceMotionTracker();
  const mesh = createMockMesh(1.4);
  const bomb = { id: 'bomb_rm', type: 'bomb', radius: 1.4, data: { phase: 'drift' } };
  tracker.updateOrdnanceMotion(bomb, mesh, 1.0, 0.016, null, { reducedMotion: true });
  const x1 = mesh.rotation.x;
  tracker.updateOrdnanceMotion(bomb, mesh, 1.5, 0.05, null, { motionReduce: true });
  assert.equal(mesh.rotation.x, x1, 'tumble frozen under reduced motion');

  const shipMesh = createMockMesh(12);
  tracker.updateOrdnanceMotion({ id: 1, type: 'ship' }, shipMesh, 2.0, 0.016);
  assert.equal(shipMesh.rotation.x, 0);
  assert.equal(shipMesh.scale.x, 12);
});
