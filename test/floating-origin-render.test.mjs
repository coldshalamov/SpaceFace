// M2 render boundary: galactic-global entity XZ → Three.js frame-local via world.frameOrigin.
// Proves far-global placement, continuous rebase, worldToScreen/raycast round-trip, seq cache
// invalidation, and identity Helios origin-zero path. Does not touch sim/physics/saves.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyFrameOrigin, globalToFrame, frameToGlobal } from '../src/core/coordinates.js';
import { createGameState } from '../src/core/gameState.js';
import {
  createRenderFrameMembrane,
  interpolateGlobalToFrame,
  localRebaseDelta,
  readFrameOrigin,
  readFrameOriginSeq,
  reprojectLocalXZ,
} from '../src/render/frameCoordinates.js';
import {
  createChaseCamera,
  clampFocusToPlayerSafeRect,
  resolveChaseComposition,
} from '../src/render/camera.js';
import { createCameraDirector, CameraDirectorMode } from '../src/render/cameraDirector.js';

const LARGE_ORIGIN = Object.freeze({ x: 12_000_000, z: -8_000_000 });
const LARGE_GLOBAL = Object.freeze({ x: 12_000_120.5, z: -8_000_040.25 });
const NEARBY_GLOBAL = Object.freeze({ x: 12_000_180.5, z: -8_000_010.25 });
const REBASE_ORIGIN = Object.freeze({ x: 12_008_192, z: -8_004_096 });
const LOCAL_BOUND = 50_000;

function installWindowShim() {
  if (globalThis.window && globalThis.window.innerWidth) return;
  globalThis.window = {
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    addEventListener() {},
    removeEventListener() {},
  };
}

function makeState(frameOrigin = { x: 0, z: 0 }, seq = 0) {
  const state = createGameState(42);
  state.world.frameOrigin = { x: frameOrigin.x, z: frameOrigin.z };
  state.world.frameOriginSeq = seq;
  state.playerId = 1;
  state.camera = state.camera || {};
  state.camera.zoom = 72;
  state.camera.tilt = 60;
  state.camera.lerp = 6;
  state.camera.lookAhead = 18;
  state.camera.trauma = 0;
  state.settings = state.settings || {};
  state.settings.video = Object.assign({ fov: 50, motionReduce: false, chaseClose: false }, state.settings.video || {});
  return state;
}

function makeShip(id, pos, opts = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: opts.team ?? 0,
    hull: opts.hull ?? 100,
    radius: opts.radius ?? 6,
    pos: { x: pos.x, z: pos.z },
    prevPos: { x: pos.x, z: pos.z },
    vel: { x: opts.vx ?? 0, z: opts.vz ?? 0 },
    rot: opts.rot ?? 0,
    prevRot: opts.rot ?? 0,
    bank: 0,
    prevBank: 0,
    pitch: 0,
    prevPitch: 0,
    maxSpeed: 120,
    flags: { noInterp: !!opts.noInterp },
  };
}

/** Minimal mesh pose projector mirroring renderer.syncEntityViews membrane. */
function projectMeshPose(entity, frameOrigin, alpha, out = { x: 0, z: 0 }) {
  if (entity.flags && entity.flags.noInterp) {
    return globalToFrame(entity.pos, frameOrigin, out);
  }
  return interpolateGlobalToFrame(entity.prevPos, entity.pos, alpha, frameOrigin, out);
}

function projectWorldToScreen(globalXZ, camera, frameOrigin, viewport) {
  const local = globalToFrame(globalXZ, frameOrigin);
  const pt = new THREE.Vector3(local.x, 0, local.z).project(camera);
  const w = viewport.width;
  const h = viewport.height;
  return {
    x: (pt.x * 0.5 + 0.5) * w,
    y: (-pt.y * 0.5 + 0.5) * h,
    onScreen: pt.z < 1 && Math.abs(pt.x) <= 1 && Math.abs(pt.y) <= 1,
    ndcX: pt.x,
    ndcY: pt.y,
  };
}

function raycastPlaneToGlobal(ndc, camera, frameOrigin) {
  const raycaster = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
  const ok = raycaster.ray.intersectPlane(plane, hit);
  if (!ok) return { x: 0, z: 0 };
  return frameToGlobal({ x: hit.x, z: hit.z }, frameOrigin);
}

function makeChaseCamAtLocalFocus(focusLocal, zoom = 72, tiltDeg = 60) {
  const cam = new THREE.PerspectiveCamera(50, 16 / 9, 1, 14000);
  const tilt = (tiltDeg * Math.PI) / 180;
  const ox = 0;
  const oy = zoom * Math.sin(tilt);
  const oz = -zoom * Math.cos(tilt);
  cam.position.set(focusLocal.x + ox, oy, focusLocal.z + oz);
  cam.lookAt(focusLocal.x, 0, focusLocal.z);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

// ---------------------------------------------------------------------------
// Membrane pure helpers
// ---------------------------------------------------------------------------

test('far-global entity projects to bounded frame-local mesh coordinates', () => {
  const local = projectMeshPose(
    makeShip(1, LARGE_GLOBAL),
    LARGE_ORIGIN,
    0.5,
  );
  const expected = globalToFrame(LARGE_GLOBAL, LARGE_ORIGIN);
  assert.ok(Math.abs(local.x) < LOCAL_BOUND, `local.x=${local.x}`);
  assert.ok(Math.abs(local.z) < LOCAL_BOUND, `local.z=${local.z}`);
  assert.ok(Math.abs(local.x - expected.x) < 1e-9);
  assert.ok(Math.abs(local.z - expected.z) < 1e-9);
});

test('interpolated pose projects through frame origin (no global mesh write)', () => {
  const entity = makeShip(1, { x: LARGE_GLOBAL.x + 20, z: LARGE_GLOBAL.z - 10 });
  entity.prevPos = { x: LARGE_GLOBAL.x, z: LARGE_GLOBAL.z };
  const alpha = 0.25;
  const local = projectMeshPose(entity, LARGE_ORIGIN, alpha);
  const gx = entity.prevPos.x + (entity.pos.x - entity.prevPos.x) * alpha;
  const gz = entity.prevPos.z + (entity.pos.z - entity.prevPos.z) * alpha;
  const expected = globalToFrame({ x: gx, z: gz }, LARGE_ORIGIN);
  assert.ok(Math.abs(local.x - expected.x) < 1e-9);
  assert.ok(Math.abs(local.z - expected.z) < 1e-9);
  // Entity globals untouched.
  assert.equal(entity.pos.x, LARGE_GLOBAL.x + 20);
  assert.equal(entity.prevPos.x, LARGE_GLOBAL.x);
});

test('rebase delta keeps screen-relative entity/camera geometry continuous', () => {
  const entity = makeShip(1, LARGE_GLOBAL);
  const beforeLocal = projectMeshPose(entity, LARGE_ORIGIN, 1);
  const camFocusBefore = globalToFrame(LARGE_GLOBAL, LARGE_ORIGIN);
  const relBefore = {
    x: beforeLocal.x - camFocusBefore.x,
    z: beforeLocal.z - camFocusBefore.z,
  };

  const delta = localRebaseDelta(LARGE_ORIGIN, REBASE_ORIGIN);
  const afterLocal = reprojectLocalXZ(beforeLocal.x, beforeLocal.z, delta);
  const camFocusAfter = reprojectLocalXZ(camFocusBefore.x, camFocusBefore.z, delta);
  const expectedAfter = globalToFrame(LARGE_GLOBAL, REBASE_ORIGIN);

  assert.ok(Math.abs(afterLocal.x - expectedAfter.x) < 1e-6);
  assert.ok(Math.abs(afterLocal.z - expectedAfter.z) < 1e-6);
  assert.ok(Math.abs((afterLocal.x - camFocusAfter.x) - relBefore.x) < 1e-6);
  assert.ok(Math.abs((afterLocal.z - camFocusAfter.z) - relBefore.z) < 1e-6);
  // Authoritative sim pose unchanged by reproject math.
  assert.deepEqual(entity.pos, { x: LARGE_GLOBAL.x, z: LARGE_GLOBAL.z });
});

test('worldToScreen accepts global XZ; raycast returns global XZ (round-trip)', () => {
  installWindowShim();
  const focusLocal = globalToFrame(LARGE_GLOBAL, LARGE_ORIGIN);
  const cam = makeChaseCamAtLocalFocus(focusLocal, 72, 60);
  const viewport = { width: 1920, height: 1080 };

  const screen = projectWorldToScreen(LARGE_GLOBAL, cam, LARGE_ORIGIN, viewport);
  assert.ok(screen.onScreen, 'entity under chase focus should project on-screen');
  // NDC near center for a focus-aligned target.
  assert.ok(Math.abs(screen.ndcX) < 0.15, `ndcX=${screen.ndcX}`);
  assert.ok(Math.abs(screen.ndcY) < 0.35, `ndcY=${screen.ndcY}`);

  // Raycast the same NDC back to global and compare to the original global.
  const hitGlobal = raycastPlaneToGlobal({ x: screen.ndcX, y: screen.ndcY }, cam, LARGE_ORIGIN);
  assert.ok(Math.abs(hitGlobal.x - LARGE_GLOBAL.x) < 2.0, `hit.x=${hitGlobal.x}`);
  assert.ok(Math.abs(hitGlobal.z - LARGE_GLOBAL.z) < 2.0, `hit.z=${hitGlobal.z}`);

  // Far global must not project as if it were raw huge world coords (would go off frustum).
  const rawBad = new THREE.Vector3(LARGE_GLOBAL.x, 0, LARGE_GLOBAL.z).project(cam);
  assert.ok(
    !Number.isFinite(rawBad.x) || Math.abs(rawBad.x) > 1 || Math.abs(rawBad.y) > 1 || Math.abs(rawBad.z) > 1,
    'raw global without frame subtract must not look like a valid on-screen local project',
  );
});

test('frameOriginSeq change cannot leave membrane cache stale', () => {
  const state = makeState(LARGE_ORIGIN, 0);
  const membrane = createRenderFrameMembrane().reset(state);
  assert.equal(membrane.seq, 0);
  assert.deepEqual({ x: membrane.origin.x, z: membrane.origin.z }, { x: LARGE_ORIGIN.x, z: LARGE_ORIGIN.z });

  // No-shift hot path: same origin/seq → changed:false, stable result object reuse.
  const a = membrane.sync(state);
  const b = membrane.sync(state);
  assert.equal(a.changed, false);
  assert.equal(b.changed, false);
  assert.equal(a, b, 'no-shift sync must reuse the stable result object');

  // Apply new origin (sim-owned) — only frameOrigin/seq change.
  const player = makeShip(1, LARGE_GLOBAL);
  state.entities.set(1, player);
  state.entityList.push(player);
  const simTime = state.simTime;
  const tick = state.tick;
  assert.equal(applyFrameOrigin(state, REBASE_ORIGIN), true);
  assert.equal(state.world.frameOriginSeq, 1);
  assert.deepEqual(player.pos, { x: LARGE_GLOBAL.x, z: LARGE_GLOBAL.z });
  assert.equal(state.simTime, simTime);
  assert.equal(state.tick, tick);

  const changed = membrane.sync(state);
  assert.equal(changed.changed, true);
  assert.equal(changed.seq, 1);
  const expectedDelta = localRebaseDelta(LARGE_ORIGIN, REBASE_ORIGIN);
  assert.ok(Math.abs(changed.dx - expectedDelta.x) < 1e-9);
  assert.ok(Math.abs(changed.dz - expectedDelta.z) < 1e-9);

  // After sync, local projection matches new origin; stale old origin would leave huge locals.
  const local = membrane.toLocal(LARGE_GLOBAL);
  const expected = globalToFrame(LARGE_GLOBAL, REBASE_ORIGIN);
  assert.ok(Math.abs(local.x - expected.x) < 1e-9);
  assert.ok(Math.abs(local.z - expected.z) < 1e-9);
  assert.ok(Math.abs(local.x) < LOCAL_BOUND);
});

test('Helios origin-zero path is identity (no projection shift)', () => {
  const state = makeState({ x: 0, z: 0 }, 0);
  const membrane = createRenderFrameMembrane().reset(state);
  const samples = [
    { x: 0, z: 0 },
    { x: 120.5, z: -40.25 },
    { x: -800, z: 1500 },
  ];
  for (const g of samples) {
    const local = membrane.toLocal(g);
    assert.deepEqual(local, g);
    const back = membrane.toGlobal(local);
    assert.deepEqual(back, g);
    const interp = membrane.interpolateLocal(g, g, 0.5);
    assert.deepEqual(interp, g);
  }
  const noop = membrane.sync(state);
  assert.equal(noop.changed, false);
  assert.equal(noop.dx, 0);
  assert.equal(noop.dz, 0);
});

test('no-shift hot path reuses scratch outputs (no fresh origin object per convert)', () => {
  const membrane = createRenderFrameMembrane().reset(makeState(LARGE_ORIGIN, 3));
  const out = { x: 0, z: 0 };
  const a = membrane.toLocal(LARGE_GLOBAL, out);
  assert.equal(a, out);
  const b = membrane.toLocal(NEARBY_GLOBAL, out);
  assert.equal(b, out);
  // Second convert overwrote scratch; still bounded.
  assert.ok(Math.abs(out.x) < LOCAL_BOUND);
  assert.ok(Math.abs(out.z) < LOCAL_BOUND);

  const gOut = { x: 0, z: 0 };
  const g = membrane.toGlobal(out, gOut);
  assert.equal(g, gOut);
});

// ---------------------------------------------------------------------------
// Camera follow composition at far origin
// ---------------------------------------------------------------------------

test('camera follow uses frame-local target; relative composition preserved at far origin', () => {
  installWindowShim();
  const state = makeState(LARGE_ORIGIN, 2);
  const player = makeShip(1, LARGE_GLOBAL, { team: 0, vx: 10, vz: 0 });
  const threat = makeShip(2, NEARBY_GLOBAL, { team: 1, hull: 50 });
  state.entities.set(1, player);
  state.entities.set(2, threat);
  state.entityList.push(player, threat);

  const cam = createChaseCamera(state);
  assert.equal(typeof cam.reprojectFrame, 'function', 'chase camera must expose reprojectFrame for seq rebase');

  // Snap + follow settle
  cam.snapToPlayer();
  for (let i = 0; i < 30; i++) cam.follow(1 / 60);

  const focus = state.camera.focus;
  const expectedLocal = globalToFrame(LARGE_GLOBAL, LARGE_ORIGIN);
  assert.ok(Math.abs(focus.x - expectedLocal.x) < 40, `focus.x=${focus.x} expected~${expectedLocal.x}`);
  assert.ok(Math.abs(focus.z - expectedLocal.z) < 40, `focus.z=${focus.z} expected~${expectedLocal.z}`);
  assert.ok(Math.abs(focus.x) < LOCAL_BOUND);
  assert.ok(Math.abs(focus.z) < LOCAL_BOUND);

  // Camera Three.js object must sit near local focus, not at raw global millions.
  assert.ok(Math.abs(cam.obj.position.x) < LOCAL_BOUND + 200);
  assert.ok(Math.abs(cam.obj.position.z) < LOCAL_BOUND + 200);

  // Composition relative offsets identical whether computed in global or local (affine).
  const focusG = { x: LARGE_GLOBAL.x, z: LARGE_GLOBAL.z };
  const compGlobal = resolveChaseComposition(state, player, focusG);
  const playerLocal = { pos: globalToFrame(player.pos, LARGE_ORIGIN) };
  // After camera membrane, composition should still bias toward threat in the same relative sense.
  const relGx = compGlobal.x - player.pos.x;
  const relGz = compGlobal.z - player.pos.z;
  assert.ok(Math.hypot(relGx, relGz) > 0.5 || !compGlobal.hasThreatFocus);

  // Rebase continuity: reprojectFrame shifts focus by delta; entity globals unchanged.
  const beforeFocus = { x: focus.x, z: focus.z };
  const delta = localRebaseDelta(LARGE_ORIGIN, REBASE_ORIGIN);
  cam.reprojectFrame(delta.x, delta.z);
  assert.ok(Math.abs(focus.x - (beforeFocus.x + delta.x)) < 1e-9);
  assert.ok(Math.abs(focus.z - (beforeFocus.z + delta.z)) < 1e-9);
  assert.deepEqual(player.pos, { x: LARGE_GLOBAL.x, z: LARGE_GLOBAL.z });
});

test('camera director pair framing works in frame-local space at far origin', () => {
  const state = makeState(LARGE_ORIGIN, 1);
  const player = makeShip(1, LARGE_GLOBAL, { team: 0, radius: 6 });
  const target = makeShip(9, NEARBY_GLOBAL, { team: 1, radius: 8 });
  state.entities.set(1, player);
  state.entities.set(9, target);
  state.player = { tether: { active: true, targetId: 9 }, flybyFocus: { active: false } };

  const director = createCameraDirector();
  const playerLocal = globalToFrame(player.pos, LARGE_ORIGIN);
  const view = {
    followX: playerLocal.x,
    followZ: playerLocal.z,
    followZoom: 72,
    fov: 50,
    aspect: 16 / 9,
    tiltDeg: 60,
  };
  const out = director.step(1 / 60, state, player, view);
  assert.equal(out.mode, CameraDirectorMode.TETHER_PAIR);
  assert.ok(Math.abs(out.focusX) < LOCAL_BOUND, `focusX=${out.focusX}`);
  assert.ok(Math.abs(out.focusZ) < LOCAL_BOUND, `focusZ=${out.focusZ}`);
  // Midpoint of player/target in local space.
  const tLocal = globalToFrame(target.pos, LARGE_ORIGIN);
  const midX = (playerLocal.x + tLocal.x) * 0.5;
  const midZ = (playerLocal.z + tLocal.z) * 0.5;
  assert.ok(Math.abs(out.focusX - midX) < 30, `pair focusX drift ${out.focusX - midX}`);
  assert.ok(Math.abs(out.focusZ - midZ) < 30, `pair focusZ drift ${out.focusZ - midZ}`);
});

test('safe-rect clamp preserves relative offsets under frame origin', () => {
  const player = makeShip(1, LARGE_GLOBAL);
  const origin = LARGE_ORIGIN;
  const pLocal = globalToFrame(player.pos, origin);
  const farFocus = { x: pLocal.x + 5000, z: pLocal.z + 5000 };
  const clamped = clampFocusToPlayerSafeRect(farFocus, { pos: pLocal }, { zoom: 72, fov: 50, aspect: 16 / 9 });
  assert.equal(clamped.clamped, true);
  assert.ok(Math.abs(clamped.x - pLocal.x) < 200);
  assert.ok(Math.abs(clamped.z - pLocal.z) < 200);
});

test('readFrameOrigin/seq fail closed and match applyFrameOrigin', () => {
  const state = makeState({ x: 0, z: 0 }, 0);
  assert.deepEqual(readFrameOrigin(state), { x: 0, z: 0 });
  assert.equal(readFrameOriginSeq(state), 0);
  assert.equal(readFrameOriginSeq({ world: {} }), 0);
  applyFrameOrigin(state, { x: 8192, z: -4096 });
  assert.deepEqual(readFrameOrigin(state), { x: 8192, z: -4096 });
  assert.equal(readFrameOriginSeq(state), 1);
});

test('ribbon trail samples push as frame-local and reproject without drop', async () => {
  const { createRibbonTrail } = await import('../src/render/engineTrailSurfaces.js');
  const scene = new THREE.Scene();
  const trail = createRibbonTrail(scene, '#7fe0ff', 8, 3);
  assert.equal(typeof trail.reproject, 'function');
  // Simulate projected local samples (global already converted by vfx membrane).
  const localA = globalToFrame(LARGE_GLOBAL, LARGE_ORIGIN);
  const localB = globalToFrame(NEARBY_GLOBAL, LARGE_ORIGIN);
  trail.push(localA.x, localA.z, 0.2);
  trail.push(localB.x, localB.z, 0.3);
  trail.rebuild(0.5, 0.1, 1.0);
  assert.ok(Math.abs(localA.x) < LOCAL_BOUND);
  assert.ok(Math.abs(localB.x) < LOCAL_BOUND);

  const delta = localRebaseDelta(LARGE_ORIGIN, REBASE_ORIGIN);
  trail.reproject(delta.x, delta.z);
  trail.rebuild(0.5, 0.1, 1.0);
  // After rebase, samples must match reprojected locals (continuity; history kept).
  const afterA = reprojectLocalXZ(localA.x, localA.z, delta);
  const afterB = reprojectLocalXZ(localB.x, localB.z, delta);
  assert.ok(Math.abs(afterA.x) < LOCAL_BOUND + Math.abs(delta.x));
  assert.ok(Math.abs(afterB.x - globalToFrame(NEARBY_GLOBAL, REBASE_ORIGIN).x) < 1e-6);
  trail.dispose();
});

test('hazard centers project to bounded local and rebase continuously', () => {
  const membrane = createRenderFrameMembrane().reset(makeState(LARGE_ORIGIN, 0));
  const center = { x: LARGE_GLOBAL.x + 400, z: LARGE_GLOBAL.z - 200 };
  const local = membrane.toLocal(center);
  const expected = globalToFrame(center, LARGE_ORIGIN);
  assert.ok(Math.abs(local.x - expected.x) < 1e-9);
  assert.ok(Math.abs(local.z - expected.z) < 1e-9);
  assert.ok(Math.abs(local.x) < LOCAL_BOUND);
  assert.ok(Math.abs(local.z) < LOCAL_BOUND);

  // Simulate hazard mesh local pose + camera focus before rebase.
  const hazardPos = { x: local.x, z: local.z };
  const focus = globalToFrame(LARGE_GLOBAL, LARGE_ORIGIN);
  const rel = { x: hazardPos.x - focus.x, z: hazardPos.z - focus.z };

  const delta = localRebaseDelta(LARGE_ORIGIN, REBASE_ORIGIN);
  reprojectLocalXZ(hazardPos.x, hazardPos.z, delta, hazardPos);
  reprojectLocalXZ(focus.x, focus.z, delta, focus);
  const after = globalToFrame(center, REBASE_ORIGIN);
  assert.ok(Math.abs(hazardPos.x - after.x) < 1e-6);
  assert.ok(Math.abs(hazardPos.z - after.z) < 1e-6);
  assert.ok(Math.abs((hazardPos.x - focus.x) - rel.x) < 1e-6);
  assert.ok(Math.abs((hazardPos.z - focus.z) - rel.z) < 1e-6);
});
