// PB-PIC-B (build_map §1C row 136) — SF-218 + SF-219, seam src/render/camera.js.
//
// SF-218 "Camera context during a real throw": releasing a hostile tether near a second attacker
// used to hand the picture a 0.35 s RECOVER window at exactly zero containment — the chase
// composition channels were zeroed for every director-owned frame, so the released-into fight
// started opening only after the ease. Measured before this row: the second attacker sat past the
// pair margin for ~85 frames after release (contextMinZoom still 0 when RECOVER handed over).
// Now the ordinary composition runs ON TOP of the recover ease (seeded at the eased focus, so the
// FOLLOW handover is continuous) and its containment floor already binds the zoom during RECOVER.
//
// SF-219 "A large place that stays usable during combat": the landmark contract is carried by the
// camera glide over the landmark's real roof bounds plus threat containment beside it, and the
// landmark body itself must never become composition context. Pinned here with the live
// clearanceAt shape the renderer feeds (a function with an attached roofAt).
//
// Fixed constants, no RNG (trauma stays 0), no GPU, no screenshots — sim-side numbers only.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CameraDirectorMode } from '../src/render/cameraDirector.js';
import {
  createChaseCamera,
  playerHasActiveAttackerFraming,
  resolveChaseComposition,
} from '../src/render/camera.js';

// The chase camera constructor reads a viewport for aspect; the pure policy under test does not.
globalThis.window = { innerWidth: 1600, innerHeight: 1000 };

const DT = 1 / 60;
const FOV = 50;
const ASPECT = 16 / 9;
const TILT = 60;
const VIEW = { fov: FOV, baseFov: FOV, aspect: ASPECT, tiltDeg: TILT };

function ship(id, x, z, team, extras = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    hull: extras.hull ?? 100,
    team,
    pos: { x, z },
    vel: extras.vel ?? { x: 0, z: 0 },
    radius: extras.radius ?? 6,
    maxSpeed: 120,
    bank: 0,
    data: { combat: extras.combat ?? null },
  };
}

function stateWith(player, others = []) {
  return {
    playerId: player.id,
    entities: new Map([[player.id, player], ...others.map((o) => [o.id, o])]),
    player: {
      cruise: null,
      tether: { active: false, targetId: null },
      flybyFocus: { active: false, targetId: null },
    },
    settings: { video: { fov: FOV, motionReduce: false } },
    camera: { zoom: 144, tilt: TILT, lookAhead: 18, lerp: 6, trauma: 0 },
    input: { aimWorld: null },
    world: { frameOrigin: { x: 0, z: 0 }, frameOriginSeq: 0 },
    combat: { attachments: { byId: {} } },
  };
}

/** Shipping-camera NDC extent of a body: the same geometry the U13 pair contract is pinned with. */
function bodyNdc(camera, focus, entity) {
  const zoom = Math.hypot(
    camera.position.x - focus.x,
    camera.position.y,
    camera.position.z - focus.z,
  );
  const tilt = TILT * Math.PI / 180;
  const tanHalf = Math.tan(FOV * Math.PI / 360);
  const dx = Math.abs(entity.pos.x - focus.x) + entity.radius;
  const dz = Math.abs(entity.pos.z - focus.z);
  const depth = Math.max(8, zoom - (Math.cos(tilt) * dz + entity.radius));
  return {
    zoom,
    ndc: Math.max(
      dx / (depth * tanHalf * ASPECT),
      (Math.sin(tilt) * dz + entity.radius) / (depth * tanHalf),
    ),
  };
}

// ── SF-218: release near another threat keeps attacker context ───────────────

test('SF-218: containment warms during the recover ease after a hostile release', () => {
  const player = ship(1, 0, 0, 0, { radius: 7 });
  const tethered = ship(2, 90, 0, 1, { combat: { targetId: 1, lockTarget: 1 } });
  const second = ship(3, 120, 15, 1, { combat: { targetId: 1, lockTarget: 1 } });
  const state = stateWith(player, [tethered, second]);
  state.player.tether.active = true;
  state.player.tether.targetId = tethered.id;
  state.player.tether.phase = 'loaded';
  const camera = createChaseCamera(state);
  camera.snapToPlayer();
  for (let i = 0; i < 40; i++) camera.follow(DT); // the hostile throw holds the pair
  state.player.tether.active = false; // RELEASE beside the second attacker

  let recoverFrames = 0;
  let minZoomAtRecoverEnd = 0;
  let ndcAtRecoverEnd = 0;
  for (let i = 0; i < 240; i++) {
    camera.follow(DT);
    const diag = camera.zoomDiagnostics();
    const mode = diag.director ? diag.director.mode : null;
    if (mode === CameraDirectorMode.RECOVER) {
      recoverFrames++;
      minZoomAtRecoverEnd = diag.contextMinZoom;
      ndcAtRecoverEnd = bodyNdc(camera.obj, state.camera.focus, second).ndc;
    }
  }
  assert.ok(recoverFrames >= 15, `release eases through RECOVER (got ${recoverFrames} frames)`);
  assert.ok(
    minZoomAtRecoverEnd > 40,
    `containment must already be warming when RECOVER hands over (got ${minZoomAtRecoverEnd.toFixed(1)}; ` +
      'the pre-fix dead window held it at exactly 0)',
  );
  assert.ok(
    ndcAtRecoverEnd < 1.25,
    `attacker closer to the frame at handover than the pre-fix 1.337 (got ${ndcAtRecoverEnd.toFixed(3)})`,
  );
});

test('SF-218: release-into-attacker spends fewer frames past the pair margin than the old dead window', () => {
  const player = ship(1, 0, 0, 0, { radius: 7 });
  const tethered = ship(2, 90, 0, 1, { combat: { targetId: 1, lockTarget: 1 } });
  const second = ship(3, 120, 15, 1, { combat: { targetId: 1, lockTarget: 1 } });
  const state = stateWith(player, [tethered, second]);
  state.player.tether.active = true;
  state.player.tether.targetId = tethered.id;
  state.player.tether.phase = 'loaded';
  const camera = createChaseCamera(state);
  camera.snapToPlayer();
  for (let i = 0; i < 40; i++) camera.follow(DT);
  state.player.tether.active = false;

  let offMargin = 0;
  let maxFocusStep = 0;
  let prevFocus = null;
  for (let i = 0; i < 240; i++) {
    camera.follow(DT);
    const focus = state.camera.focus;
    if (prevFocus) {
      maxFocusStep = Math.max(maxFocusStep, Math.hypot(focus.x - prevFocus.x, focus.z - prevFocus.z));
    }
    prevFocus = { x: focus.x, z: focus.z };
    if (i >= 20 && bodyNdc(camera.obj, focus, second).ndc > 0.85) offMargin++;
  }
  // Before this row the same run counted ~85 such frames (measured pre-fix): 20 recover frames at
  // zero containment plus a containment ramp that started only after the ease.
  assert.ok(
    offMargin <= 60,
    `frames past the 0.85 pair margin after release must stay well under the pre-fix ~85 (got ${offMargin})`,
  );
  assert.ok(
    maxFocusStep < 6,
    `release and handover stay continuous, no cut (max per-frame focus step ${maxFocusStep.toFixed(2)} wu)`,
  );
});

test('SF-218: releasing with no threat nearby relaxes to the old quiet behavior', () => {
  const player = ship(1, 0, 0, 0, { radius: 7 });
  const state = stateWith(player); // empty space: nothing to compose
  state.player.tether.active = true;
  state.player.tether.targetId = 999; // dangling latch, no pair authority
  state.player.tether.phase = 'loaded';
  const camera = createChaseCamera(state);
  camera.snapToPlayer();
  for (let i = 0; i < 40; i++) camera.follow(DT);
  state.player.tether.active = false;

  for (let i = 0; i < 60; i++) {
    camera.follow(DT);
    const diag = camera.zoomDiagnostics();
    assert.equal(diag.contextMinZoom, 0, 'no threat, no containment floor');
    assert.equal(diag.contextZoomBias, 0, 'no threat, no context zoom bias');
  }
});

// ── SF-219: a large place stays usable during combat ─────────────────────────

const STATION = { x: 40, z: -150, radius: 150, top: 220 };
function stationClearance() {
  // Live route shape: a function with the roof query attached (renderer feeds _cameraClearanceAt).
  const clearanceAt = () => -Infinity;
  clearanceAt.roofAt = (x, z) =>
    Math.hypot(x - STATION.x, z - STATION.z) < STATION.radius ? STATION.top : -Infinity;
  return clearanceAt;
}

test('SF-219: fighting beside the landmark never buries the camera or the attacker', () => {
  const player = ship(1, 0, 0, 0, { radius: 7 });
  const attacker = ship(2, 140, 20, 1, { combat: { targetId: 1, lockTarget: 1 } });
  const station = {
    id: 9, type: 'station', alive: true, hull: 10000, team: 2,
    pos: { x: STATION.x, z: STATION.z }, radius: STATION.radius, vel: { x: 0, z: 0 }, data: {},
  };
  const state = stateWith(player, [attacker, station]);
  const camera = createChaseCamera(state);
  camera.snapToPlayer();
  const clearanceAt = stationClearance();

  let roofViolation = 0;
  let worstAttackerNdc = 0;
  for (let i = 0; i < 240; i++) {
    camera.follow(DT, 1, null, clearanceAt);
    const camX = camera.obj.position.x;
    const camZ = camera.obj.position.z;
    const camY = camera.obj.position.y;
    const roof = clearanceAt.roofAt(camX, camZ, 0);
    if (roof > camY) roofViolation = Math.max(roofViolation, roof - camY);
    worstAttackerNdc = Math.max(worstAttackerNdc, bodyNdc(camera.obj, state.camera.focus, attacker).ndc);
  }
  assert.equal(
    roofViolation, 0,
    `the glide keeps the camera out of the landmark body (worst violation ${roofViolation.toFixed(1)} wu)`,
  );
  assert.ok(
    worstAttackerNdc <= 1.0,
    `the immediate danger stays inside the full frame beside the place (worst ndc ${worstAttackerNdc.toFixed(3)})`,
  );
});

test('SF-219: the landmark body never becomes threat composition', () => {
  const player = ship(1, 0, 0, 0, { radius: 7 });
  const attacker = ship(2, 140, 20, 1, { combat: { targetId: 1, lockTarget: 1 } });
  const station = {
    id: 9, type: 'station', alive: true, hull: 10000, team: 2,
    pos: { x: STATION.x, z: STATION.z }, radius: STATION.radius, vel: { x: 0, z: 0 }, data: {},
  };
  const withPlace = stateWith(player, [attacker, station]);
  const withoutPlace = stateWith(player, [attacker]);

  const composedWith = resolveChaseComposition(withPlace, player, { x: 0, z: 0 }, VIEW);
  const composedWithout = resolveChaseComposition(withoutPlace, player, { x: 0, z: 0 }, VIEW);

  assert.equal(composedWith.composedThreatId, attacker.id, 'only the attacker composes');
  assert.equal(composedWith.nearbyEnemies, 1, 'the station is not counted as an enemy');
  assert.deepEqual(
    {
      x: composedWith.x, z: composedWith.z,
      minZoom: composedWith.minZoom, zoomBias: composedWith.zoomBias,
    },
    {
      x: composedWithout.x, z: composedWithout.z,
      minZoom: composedWithout.minZoom, zoomBias: composedWithout.zoomBias,
    },
    'composition is bit-identical with the landmark present — no decorative centering on the place',
  );
});

// ── D86(b) carry: the attacker-framing channel answers a real contact ────────

test('D86(b): attacker framing publishes a real armed lock as live combat context', () => {
  const player = ship(1, 0, 0, 0, { radius: 7 });
  const armed = ship(2, 120, 15, 1, { combat: { targetId: 1, lockTarget: 1 } });
  const ambient = ship(3, 130, 15, 1, { combat: { targetId: null, lockTarget: null } });

  const combatState = stateWith(player, [armed]);
  assert.equal(playerHasActiveAttackerFraming(combatState, player), true, 'armed lock is live framing');
  const composed = resolveChaseComposition(combatState, player, { x: 0, z: 0 }, VIEW);
  assert.equal(composed.hasActiveAttacker, true);
  assert.equal(composed.composedThreatId, armed.id);
  assert.ok(composed.minZoom > 0, 'a real attacker demands its containment floor');

  const ambientState = stateWith(player, [ambient]);
  assert.equal(playerHasActiveAttackerFraming(ambientState, player), false, 'quiet traffic is not framing');
  assert.equal(resolveChaseComposition(ambientState, player, { x: 0, z: 0 }, VIEW).hasActiveAttacker, false);
});
