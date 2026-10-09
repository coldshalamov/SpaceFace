// FB-076 — station arms, cranes and loaders articulate on the station:sideEvent seam. Each of
// the six side events produces one articulation record keyed by the same stationId the dock
// pulse uses, with a start and a settle; the pose is written only while the event is live.
// Reduced motion halves amplitude but keeps the reach direction.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  createInfrastructureMotionTracker,
  resolveStationArmArticulation,
  resolveStationArmReach,
  resolveStationArmPose,
} from '../src/render/infrastructureMotion.js';
import {
  STATION_SIDE_EVENT_VFX_PROFILES,
  resolveStationSideEventVfxProfile,
} from '../src/render/stationSideEventVfx.js';

const SIX_KINDS = ['hauler_dock', 'patrol_launch', 'repair_drone', 'cargo_tractor', 'sensor_sweep', 'quiet_dock'];

function stationMesh() {
  const g = new THREE.Group();
  const arm = new THREE.Object3D();
  arm.name = 'DockArm_Port_01';
  arm.rotation.y = 0.1;
  arm.position.x = 4;
  g.add(arm);
  const crane = new THREE.Object3D();
  crane.name = 'CargoCrane_Spine';
  g.add(crane);
  const ring = new THREE.Object3D();
  ring.name = 'ring_deco'; // matches nothing — decorative nodes never articulate
  g.add(ring);
  return { g, arm, crane, ring };
}

function station() {
  return {
    id: 'st_ceres', type: 'station', radius: 60, rot: 0,
    pos: { x: 0, z: 0 }, data: { stationId: 'ceres' },
  };
}

function bus() {
  const handlers = new Map();
  return {
    handlers,
    on(name, fn) { handlers.set(name, fn); return () => handlers.delete(name); },
    emit(name, p) { const fn = handlers.get(name); if (fn) fn(p); },
  };
}

test('every side-event kind maps to exactly one articulation', () => {
  for (const kind of SIX_KINDS) {
    const articulation = resolveStationArmArticulation(kind);
    assert.ok(articulation, `${kind} must articulate`);
    assert.equal(articulation, resolveStationSideEventVfxProfile(kind).arm,
      `${kind}: the profile row owns the arm mapping`);
    assert.ok(articulation.amplitude > 0 && articulation.amplitude <= 1);
    assert.ok(['reach-and-return', 'release-and-return', 'slide-track', 'stroke-and-return', 'sweep']
      .includes(articulation.duty), `${kind} duty ${articulation.duty}`);
  }
  assert.equal(resolveStationArmArticulation('not_a_work_event'), null, 'unknown kinds never articulate');
});

test('the reach envelope starts at zero, holds through the work, and settles home', () => {
  const duration = 40;
  assert.equal(resolveStationArmReach(0, duration), 0, 'armed but not yet moving');
  const mid = resolveStationArmReach(duration * 0.5, duration);
  assert.equal(mid, 1, 'holding on target mid-event');
  const late = resolveStationArmReach(duration * 0.9, duration);
  assert.ok(late < 0.6, 'settling back');
  assert.equal(resolveStationArmReach(duration + 1, duration), 0, 'fully home at the end');
  assert.equal(resolveStationArmReach(NaN, duration), 0, 'NaN-safe');
});

test('each of the six events produces one articulation record with a start and a settle', () => {
  const tracker = createInfrastructureMotionTracker();
  const b = bus();
  tracker.bindEvents(b);
  const { g, arm } = stationMesh();
  const ent = station();
  let t = 100;
  try {
    for (const kind of SIX_KINDS) {
      const durationS = STATION_SIDE_EVENT_VFX_PROFILES[kind].defaultDurationS;
      // In production the tracker ticks every frame, so an event landing between frames reads the
      // latest simTime. Tick once at t so the emit below carries that clock, same as a live frame.
      tracker.updateStationMotion(ent, g, t, 0.016, { motionReduce: false });
      b.emit('station:sideEvent', {
        eventId: `ev_${kind}`, kind, stationId: 'ceres', durationS,
        bearing: 0.6, from: { x: 40, z: 0 }, to: { x: 8, z: 0 }, entityIds: [],
      });
      const record = tracker.stationArmRecord('ceres');
      assert.ok(record, `${kind}: articulation record armed`);
      assert.equal(record.articulationId, resolveStationArmArticulation(kind).id);
      assert.equal(record.startedS, t, 'the record knows when work started');
      assert.equal(record.settledS, -1, 'the record has not settled yet');

      // Mid-event: the arm node is off its base pose toward the work bearing. Probe at 30%
      // progress — every duty is deflected there (stroke/sweep hit a zero crossing at exactly
      // half-cycle) — and measure all three channels the pose writer touches: yaw, pitch, slide.
      tracker.updateStationMotion(ent, g, t + durationS * 0.3, 0.016, { motionReduce: false });
      const posed = Math.abs(arm.rotation.y - 0.1) + Math.abs(arm.rotation.z)
        + Math.abs(arm.position.x - 4);
      assert.ok(posed > 0.02, `${kind}: the arm is posed, rot.y=${arm.rotation.y.toFixed(3)}`);

      // Past the event: the arm settles home and the record closes.
      tracker.updateStationMotion(ent, g, t + durationS + 0.5, 0.016, { motionReduce: false });
      assert.ok(Math.abs(arm.rotation.y - 0.1) < 1e-6 && Math.abs(arm.rotation.z) < 1e-6
        && Math.abs(arm.position.x - 4) < 1e-6,
        `${kind}: the arm settled back to base`);
      assert.equal(tracker.stationArmRecord('ceres'), null, `${kind}: record closed after settle`);

      t += 300;
    }
  } finally {
    tracker.unbindEvents();
  }
});

test('reduced motion halves amplitude but keeps the reach direction', () => {
  const full = resolveStationArmPose(resolveStationArmArticulation('hauler_dock'), 10, 45, 0.6, false);
  const half = resolveStationArmPose(resolveStationArmArticulation('hauler_dock'), 10, 45, 0.6, true);
  assert.ok(full.yaw > 0 && half.yaw > 0, 'the reach direction is identical');
  assert.ok(Math.abs(half.yaw * 2 - full.yaw) < 1e-6, `half amplitude: ${half.yaw} vs ${full.yaw}`);
});

test('no live event, no motion — arms hold their captured base', () => {
  const tracker = createInfrastructureMotionTracker();
  tracker.bindEvents(bus());
  const { g, arm, crane, ring } = stationMesh();
  const ent = station();
  tracker.updateStationMotion(ent, g, 50, 0.016, { motionReduce: false });
  tracker.updateStationMotion(ent, g, 51, 0.016, { motionReduce: false });
  assert.equal(arm.rotation.y, 0.1);
  assert.equal(crane.rotation.y, 0);
  assert.equal(ring.rotation.y, 0);
  tracker.unbindEvents();
});

test('a side event for a different station does not articulate this one', () => {
  const tracker = createInfrastructureMotionTracker();
  const b = bus();
  tracker.bindEvents(b);
  const { g, arm } = stationMesh();
  const ent = station();
  try {
    b.emit('station:sideEvent', {
      eventId: 'ev_other', kind: 'cargo_tractor', stationId: 'helios',
      durationS: 40, bearing: 0, from: { x: 40, z: 0 }, to: { x: 8, z: 0 }, entityIds: [],
    });
    tracker.updateStationMotion(ent, g, 5, 0.016, { motionReduce: false });
    assert.equal(arm.rotation.y, 0.1, 'foreign work never moves this station');
    assert.equal(tracker.stationArmRecord('helios') !== null, true, 'the record belongs to the other station');
    assert.equal(tracker.stationArmRecord('ceres'), null);
  } finally {
    tracker.unbindEvents();
  }
});
