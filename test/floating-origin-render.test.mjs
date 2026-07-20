// M2 render boundary: galactic-global entity XZ → Three.js frame-local via world.frameOrigin.
// Proves far-global placement, continuous rebase, worldToScreen/raycast round-trip, seq cache
// invalidation, and identity Helios origin-zero path. Does not touch sim/physics/saves.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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
import { attachStationHlod } from '../src/render/hlod.js';
import { evaluatePresentationContinuity, frameSeriesSettleIndex } from '../scripts/lib/presentationContinuity.mjs';

const LARGE_ORIGIN = Object.freeze({ x: 12_000_000, z: -8_000_000 });
const LARGE_GLOBAL = Object.freeze({ x: 12_000_120.5, z: -8_000_040.25 });
const NEARBY_GLOBAL = Object.freeze({ x: 12_000_180.5, z: -8_000_010.25 });
const REBASE_ORIGIN = Object.freeze({ x: 12_008_192, z: -8_004_096 });
const LOCAL_BOUND = 50_000;
const M2_SEAMLESS_SOURCE = await readFile(
  new URL('../scripts/check-m2-seamless-world.mjs', import.meta.url),
  'utf8',
);

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
    data: opts.data || {},
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
  const target = makeShip(9, NEARBY_GLOBAL, {
    team: 1,
    radius: 8,
    data: { encounter: { id: 'floating-origin-hostile' } },
  });
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

// ---------------------------------------------------------------------------
// Player-facing presentation continuity acceptance math
// ---------------------------------------------------------------------------

test('presentation continuity permits authored admission and Continue identity rebuild but pins spatial truth', () => {
  const base = {
    route: 'unit',
    entityId: 17,
    entityType: 'ship',
    role: 'player',
    semanticIdentity: 'ship:ship_kestrel',
    authoredSemanticIdentity: 'SF_K0_KESTREL',
    worldIdentity: 'ship:17',
    rootUuid: 'root-a',
    hullUuid: 'hull-a',
    presentationAdmission: 'ready',
    authoredAssetState: 'authored',
    visibleDrawableCount: 4,
    authoredVisibleCount: 4,
    fallbackVisibleCount: 0,
    frameOriginSeq: 8,
    contextEpoch: 0,
    projected: { x: 500, y: 300, diameter: 48, onScreen: true },
  };
  const samples = [
    {
      ...base,
      sequence: 0,
      frame: 0,
      phase: 'initial-admission',
      rootUuid: 'pending-root',
      hullUuid: null,
      presentationAdmission: 'pending',
      authoredAssetState: 'awaiting-authored-admission',
      visibleDrawableCount: 0,
      authoredVisibleCount: 0,
      projected: { x: NaN, y: NaN, diameter: NaN, onScreen: false },
    },
    { ...base, sequence: 1, frame: 1, phase: 'initial-admission' },
    { ...base, sequence: 2, frame: 2, phase: 'stable' },
    {
      ...base,
      sequence: 3,
      frame: 3,
      phase: 'stable',
      projected: { x: 500.16, y: 300.08, diameter: 48.2, onScreen: true },
    },
    {
      ...base,
      sequence: 4,
      frame: 4,
      phase: 'continue',
      transitionKind: 'continue',
      rootUuid: 'root-after-load',
      hullUuid: 'hull-after-load',
      projected: { x: 500.20, y: 300.10, diameter: 48.22, onScreen: true },
    },
    {
      ...base,
      sequence: 5,
      frame: 5,
      phase: 'continue',
      rootUuid: 'root-after-load',
      hullUuid: 'hull-after-load',
      projected: { x: 500.22, y: 300.11, diameter: 48.23, onScreen: true },
    },
  ];
  const result = evaluatePresentationContinuity(samples);
  assert.equal(result.pass, true, JSON.stringify(result.failures));
  assert.equal(result.counters.pendingSamples, 1);
  assert.equal(result.counters.continuePairs, 2);
  assert.equal(result.coverage.stable, true);
  assert.equal(result.coverage.continue, true);
});

test('presentation continuity classifies delayed Continue frames and rejects late swaps or semantic drift', () => {
  const base = {
    route: 'unit',
    entityId: 17,
    entityType: 'ship',
    role: 'player',
    semanticIdentity: 'ship:ship_kestrel',
    authoredSemanticIdentity: 'SF_K0_KESTREL',
    worldIdentity: 'ship:17',
    presentationAdmission: 'ready',
    authoredAssetState: 'authored',
    visibleDrawableCount: 4,
    authoredVisibleCount: 4,
    fallbackVisibleCount: 0,
    rootUuid: 'root-before',
    hullUuid: 'hull-before',
    frameOriginSeq: 4,
    contextEpoch: 0,
    projected: { x: 300, y: 220, diameter: 40, onScreen: true },
  };
  const result = evaluatePresentationContinuity([
    { ...base, sequence: 0, frame: 0, phase: 'pre-continue' },
    {
      ...base,
      sequence: 1,
      frame: 1,
      phase: 'continue',
      transitionKind: 'continue',
      rootUuid: 'root-after',
      hullUuid: 'hull-after',
    },
    {
      ...base,
      sequence: 2,
      frame: 2,
      phase: 'continue',
      rootUuid: 'late-replacement',
      hullUuid: 'late-hull',
      authoredSemanticIdentity: 'WRONG_ASSET',
      worldIdentity: 'ship:reallocated',
      projected: { x: 306, y: 220, diameter: 40, onScreen: true },
    },
  ]);
  const codes = new Set(result.failures.map((failure) => failure.code));
  // Identity pins still reject a late swap on the delayed (non-boundary) Continue pair.
  assert.ok(codes.has('continue-root-identity-changed'));
  assert.ok(codes.has('continue-authoredSemanticIdentity-changed'));
  assert.ok(codes.has('continue-worldIdentity-changed'));
  // The 6px drift no longer settles to the pre-continue baseline; under the settle contract that is a
  // continue-composition-never-settled report, not a raw pairwise discontinuity.
  assert.ok(codes.has('continue-composition-never-settled'));
  assert.ok(!codes.has('continue-center-discontinuity'),
    'strict pairwise spatial is deferred inside the settle window');
  assert.equal(result.counters.continuePairs, 2, 'boundary and delayed same-phase Continue pairs are classified');
});

test('presentation continuity rejects fallback overlap, wrong instance owner, identity churn, and real jumps', () => {
  const base = {
    route: 'unit',
    entityId: 44,
    entityType: 'asteroid',
    role: 'ordinary-asteroid',
    semanticIdentity: 'asteroid:rock-common',
    authoredSemanticIdentity: 'non-authored',
    worldIdentity: 'asteroid:44',
    phase: 'interpolation',
    presentationAdmission: 'ready',
    authoredAssetState: 'authored',
    visibleDrawableCount: 1,
    authoredVisibleCount: 1,
    fallbackVisibleCount: 0,
    rootUuid: 'root-a',
    hullUuid: 'hull-a',
    instancePoolUuid: 'pool-a',
    instanceId: 3,
    instanceEntityId: 44,
    frameOriginSeq: 2,
    contextEpoch: 0,
    projected: { x: 100, y: 100, diameter: 8, onScreen: true },
  };
  const result = evaluatePresentationContinuity([
    { ...base, sequence: 0, frame: 0 },
    {
      ...base,
      sequence: 1,
      frame: 1,
      fallbackVisibleCount: 1,
      instanceEntityId: 999,
      rootUuid: 'root-b',
      projected: { x: 105, y: 100, diameter: 8, onScreen: true },
    },
  ]);
  assert.equal(result.pass, false);
  const codes = new Set(result.failures.map((failure) => failure.code));
  assert.ok(codes.has('fallback-authored-overlap'));
  assert.ok(codes.has('instance-owner-mismatch'));
  assert.ok(codes.has('interpolation-root-identity-changed'));
  assert.ok(codes.has('interpolation-isolated-jump'));
});

test('presentation continuity uses conjunctive interpolation threshold and pins context UUIDs', () => {
  const base = {
    route: 'unit',
    entityId: 7,
    entityType: 'station',
    role: 'helios',
    semanticIdentity: 'station:station_helios_exchange',
    authoredSemanticIdentity: 'GLTFKIT_place_station_trade_hub',
    worldIdentity: 'station:7',
    presentationAdmission: 'ready',
    authoredAssetState: 'authored',
    visibleDrawableCount: 2,
    authoredVisibleCount: 2,
    fallbackVisibleCount: 0,
    rootUuid: 'station-root',
    hullUuid: 'station-hull',
    frameOriginSeq: 0,
    contextEpoch: 0,
    projected: { x: 200, y: 180, diameter: 20, onScreen: true },
  };
  const smallRelativeJump = evaluatePresentationContinuity([
    { ...base, sequence: 0, frame: 0, phase: 'interpolation' },
    {
      ...base,
      sequence: 1,
      frame: 1,
      phase: 'interpolation',
      projected: { x: 205, y: 180, diameter: 20, onScreen: true },
    },
  ]);
  assert.equal(smallRelativeJump.pass, true, '5px is not a >0.5-diameter jump on a 20px object');

  const contextChurn = evaluatePresentationContinuity([
    { ...base, sequence: 0, frame: 0, phase: 'stable' },
    {
      ...base,
      sequence: 1,
      frame: 1,
      phase: 'stable',
      contextEpoch: 1,
      rootUuid: 'replacement-after-context',
    },
  ]);
  assert.equal(contextChurn.pass, false);
  assert.ok(contextChurn.failures.some((failure) => failure.code === 'context-recovery-root-identity-changed'));
});

test('presentation continuity rejects abrupt interpolation scale pops independently of center motion', () => {
  const base = {
    route: 'unit',
    entityId: 33,
    entityType: 'asteroid',
    role: 'authored-asteroid',
    semanticIdentity: 'asteroid:place_asteroid_rock_a',
    authoredSemanticIdentity: 'GLTFKIT_place_asteroid_rock_a',
    worldIdentity: 'asteroid:33',
    phase: 'interpolation',
    presentationAdmission: 'ready',
    authoredAssetState: 'authored',
    visibleDrawableCount: 1,
    authoredVisibleCount: 1,
    fallbackVisibleCount: 0,
    rootUuid: 'rock-root',
    hullUuid: 'rock-hull',
    frameOriginSeq: 1,
    contextEpoch: 0,
    projected: { x: 120, y: 90, diameter: 10, onScreen: true },
  };
  const result = evaluatePresentationContinuity([
    { ...base, sequence: 0, frame: 0 },
    { ...base, sequence: 1, frame: 1, projected: { x: 120, y: 90, diameter: 14, onScreen: true } },
  ]);
  assert.ok(result.failures.some((failure) => failure.code === 'interpolation-diameter-pop'));
});

test('presentation continuity applies the quarter-pixel rule to rebase and HLOD boundaries', () => {
  const base = {
    route: 'unit',
    entityId: 88,
    entityType: 'station',
    role: 'helios',
    semanticIdentity: 'station:station_helios_exchange',
    authoredSemanticIdentity: 'GLTFKIT_place_station_trade_hub',
    worldIdentity: 'station:88',
    presentationAdmission: 'ready',
    authoredAssetState: 'authored',
    visibleDrawableCount: 3,
    authoredVisibleCount: 3,
    fallbackVisibleCount: 0,
    rootUuid: 'station-root',
    hullUuid: 'station-hull',
    contextEpoch: 0,
    projected: { x: 400, y: 240, diameter: 80, onScreen: true },
  };
  const accepted = evaluatePresentationContinuity([
    { ...base, sequence: 0, frame: 0, phase: 'stable', frameOriginSeq: 2 },
    {
      ...base,
      sequence: 1,
      frame: 1,
      phase: 'rebase',
      transitionKind: 'rebase',
      frameOriginSeq: 3,
      projected: { x: 400.2, y: 240, diameter: 80.2, onScreen: true },
    },
    {
      ...base,
      sequence: 2,
      frame: 2,
      phase: 'hlod',
      transitionKind: 'hlod',
      frameOriginSeq: 3,
      // Real Helios (place_station_trade_hub) is lod0-only: a forced 'lod2' legitimately applies the
      // closest available level 'lod0'. matched is derived from the visible tagged-bucket census
      // (offExpectedVisible === 0), never from the stale selector.
      lodRequest: {
        requested: 'lod2',
        stage: 'immediate-request',
        selectorLevel: 'lod0',
        applied: {
          visibleBuckets: { lod0: 3, lod1: 0, lod2: 0 },
          availableLevels: ['lod0'],
          taggedVisible: 3,
          offExpectedVisible: 0,
          dynamicDetailVisible: 0,
        },
      },
      projected: { x: 400.22, y: 240, diameter: 80.22, onScreen: true },
    },
  ]);
  assert.equal(accepted.pass, true, JSON.stringify(accepted.failures));
  assert.equal(accepted.coverage.rebase, true);
  assert.equal(accepted.coverage.lod, true);
  assert.equal(accepted.coverage.roles.helios.immediateLodMatches, 1);
  assert.equal(accepted.coverage.roles.helios.immediateLodRequestSamples, 1);

  const rejected = evaluatePresentationContinuity([
    { ...base, sequence: 0, frame: 0, phase: 'stable', frameOriginSeq: 2 },
    {
      ...base,
      sequence: 1,
      frame: 1,
      phase: 'rebase',
      transitionKind: 'rebase',
      frameOriginSeq: 3,
      projected: { x: 400.26, y: 240, diameter: 80.3, onScreen: true },
    },
  ]);
  const codes = new Set(rejected.failures.map((failure) => failure.code));
  assert.ok(codes.has('rebase-center-discontinuity'));
  assert.ok(codes.has('rebase-diameter-discontinuity'));
});

test('presentation continuity fails closed when pending admission draws anything', () => {
  const result = evaluatePresentationContinuity([{
    route: 'unit',
    sequence: 0,
    frame: 0,
    phase: 'initial-admission',
    entityId: 91,
    entityType: 'ship',
    role: 'player',
    semanticIdentity: 'ship:ship_kestrel',
    authoredSemanticIdentity: 'pending-kestrel',
    worldIdentity: 'ship:91',
    presentationAdmission: 'pending',
    authoredAssetState: 'awaiting-authored-admission',
    visibleDrawableCount: 1,
    authoredVisibleCount: 0,
    fallbackVisibleCount: 1,
    projected: { x: 0, y: 0, diameter: 0, onScreen: false },
  }]);
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((failure) => failure.code === 'pending-admission-visible-drawables'));
});

// Defect 1 (fail-closed admission). NOTE: two earlier WIP tests here pinned an unimplemented
// admission-*evidence* design (codes `presentation-admission-evidence-invalid` /
// `visible-fallback-not-terminal` / `terminalSemanticFallbackSamples`). That design diverges from the
// PQ-001.b brief, which specifies a `requiredAdmissionRoles` token contract. They were rewritten to
// the brief's contract; see the packet receipt findings.
test('presentation continuity fails closed on a missing or unavailable required-admission token', () => {
  const base = {
    route: 'unit',
    entityId: 91,
    entityType: 'ship',
    role: 'player',
    semanticIdentity: 'ship:ship_kestrel',
    authoredSemanticIdentity: 'SF_K0_KESTREL',
    worldIdentity: 'ship:91',
    rootUuid: 'ship-root',
    hullUuid: 'ship-hull',
    authoredAssetState: 'authored',
    visibleDrawableCount: 4,
    authoredVisibleCount: 4,
    fallbackVisibleCount: 0,
    frameOriginSeq: 0,
    contextEpoch: 0,
    projected: { x: 100, y: 100, diameter: 30, onScreen: true },
  };
  // A null/missing token on a required-admission role is a rejection, not a silent pass. This is the
  // exact fail-open hole the brief closes: a refactor that renames or stops publishing the token
  // must turn the harness red.
  const missing = evaluatePresentationContinuity([
    { ...base, sequence: 0, frame: 0, phase: 'initial-admission', presentationAdmission: null },
    { ...base, sequence: 1, frame: 1, phase: 'stable', presentationAdmission: 'ready' },
  ], { requiredAdmissionRoles: ['player'] });
  assert.equal(missing.pass, false);
  assert.ok(missing.failures.some((failure) => failure.code === 'admission-token-missing'));
  assert.ok(!missing.failures.some((failure) => failure.code === 'admission-never-ready'),
    'the role reached ready on the stable sample');

  // 'unavailable' is an explicit refusal, distinguished from a missing token.
  const unavailable = evaluatePresentationContinuity([
    { ...base, sequence: 0, frame: 0, phase: 'initial-admission', presentationAdmission: 'unavailable' },
    { ...base, sequence: 1, frame: 1, phase: 'stable', presentationAdmission: 'ready' },
  ], { requiredAdmissionRoles: ['player'] });
  assert.equal(unavailable.pass, false);
  assert.ok(unavailable.failures.some((failure) => failure.code === 'admission-unavailable'));
});

test('presentation continuity requires a required-admission role to reach ready', () => {
  const pending = {
    route: 'unit',
    entityId: 7,
    entityType: 'station',
    role: 'helios',
    semanticIdentity: 'station:station_helios_exchange',
    authoredSemanticIdentity: 'GLTFKIT_place_station_trade_hub',
    worldIdentity: 'station:7',
    authoredAssetState: 'authored',
    presentationAdmission: 'pending',
    // A pending admission must not draw yet, so keep it off-screen with no visible drawables.
    visibleDrawableCount: 0,
    authoredVisibleCount: 0,
    fallbackVisibleCount: 0,
    frameOriginSeq: 0,
    contextEpoch: 0,
    projected: { x: null, y: null, diameter: null, onScreen: false },
  };
  const result = evaluatePresentationContinuity([
    { ...pending, sequence: 0, frame: 0, phase: 'initial-admission' },
    { ...pending, sequence: 1, frame: 1, phase: 'stable' },
  ], { requiredAdmissionRoles: ['helios'] });
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((failure) => failure.code === 'admission-never-ready'));
  assert.ok(!result.failures.some((failure) => failure.code === 'admission-token-missing'),
    'pending is a recognized token, not a missing one');
});

test('presentation continuity leaves a null token alone for a non-required-admission role', () => {
  // The ordinary asteroid legitimately has NO admission token. With 'player' the only required-
  // admission role (and satisfied), the ordinary-asteroid's null token must not fail — it is not
  // swept into the fail-closed contract.
  const rock = {
    route: 'unit',
    entityId: 44,
    entityType: 'asteroid',
    role: 'ordinary-asteroid',
    semanticIdentity: 'asteroid:rock-common',
    authoredSemanticIdentity: 'non-authored',
    worldIdentity: 'asteroid:44',
    phase: 'interpolation',
    presentationAdmission: null,
    authoredAssetState: null,
    visibleDrawableCount: 1,
    authoredVisibleCount: 0,
    fallbackVisibleCount: 0,
    rootUuid: 'root-a',
    instancePoolUuid: 'pool-a',
    instanceId: 3,
    instanceEntityId: 44,
    frameOriginSeq: 2,
    contextEpoch: 0,
    projected: { x: 100, y: 100, diameter: 8, onScreen: true },
  };
  const player = {
    route: 'unit',
    entityId: 1,
    entityType: 'ship',
    role: 'player',
    semanticIdentity: 'ship:ship_kestrel',
    authoredSemanticIdentity: 'SF_K0_KESTREL',
    worldIdentity: 'ship:1',
    phase: 'stable',
    presentationAdmission: 'ready',
    authoredAssetState: 'authored',
    visibleDrawableCount: 4,
    authoredVisibleCount: 4,
    fallbackVisibleCount: 0,
    rootUuid: 'ship-root',
    frameOriginSeq: 2,
    contextEpoch: 0,
    projected: { x: 300, y: 220, diameter: 40, onScreen: true },
  };
  const result = evaluatePresentationContinuity([
    { ...rock, sequence: 0, frame: 0 },
    { ...rock, sequence: 1, frame: 1, projected: { x: 100.1, y: 100, diameter: 8, onScreen: true } },
    { ...player, sequence: 2, frame: 2 },
  ], { requiredAdmissionRoles: ['player'] });
  const codes = new Set(result.failures.map((failure) => failure.code));
  assert.ok(!codes.has('admission-token-missing'));
  assert.ok(!codes.has('admission-unavailable'));
  assert.ok(!codes.has('admission-never-ready'));
  assert.equal(result.pass, true, JSON.stringify(result.failures));
});

test('presentation continuity distinguishes explicit offscreen samples from missing telemetry', () => {
  const missing = evaluatePresentationContinuity([{
    route: 'unit',
    sequence: 0,
    frame: 0,
    phase: 'stable',
    entityId: 1,
    role: 'player',
  }]);
  const missingCodes = new Set(missing.failures.map((failure) => failure.code));
  assert.ok(missingCodes.has('entity-identity-evidence-missing'));
  assert.ok(missingCodes.has('drawable-count-evidence-missing'));
  assert.ok(missingCodes.has('projection-evidence-missing'));

  const offscreen = evaluatePresentationContinuity([{
    route: 'unit',
    sequence: 0,
    frame: 0,
    phase: 'stable',
    entityId: 2,
    entityType: 'asteroid',
    role: 'ordinary-asteroid',
    semanticIdentity: 'asteroid:common',
    authoredSemanticIdentity: 'non-authored',
    worldIdentity: 'asteroid:2',
    visibleDrawableCount: 0,
    authoredVisibleCount: 0,
    fallbackVisibleCount: 0,
    projected: { x: null, y: null, diameter: null, onScreen: false },
  }]);
  assert.equal(offscreen.pass, true, JSON.stringify(offscreen.failures));
  assert.equal(offscreen.coverage.roles['ordinary-asteroid'].explicitOffscreenSamples, 1);
});

test('presentation continuity required-role coverage fails closed; ownership stays conditional when uninstanced', () => {
  const player = {
    route: 'unit',
    sequence: 0,
    frame: 0,
    phase: 'initial-admission',
    entityId: 1,
    entityType: 'ship',
    role: 'player',
    semanticIdentity: 'ship:ship_kestrel',
    authoredSemanticIdentity: 'SF_K0_KESTREL',
    worldIdentity: 'ship:1',
    presentationAdmission: 'ready',
    authoredAssetState: 'authored',
    visibleDrawableCount: 1,
    authoredVisibleCount: 1,
    fallbackVisibleCount: 0,
    projected: { x: 100, y: 100, diameter: 20, onScreen: true },
  };
  const result = evaluatePresentationContinuity([player], {
    requiredRoles: ['player', 'helios', 'authored-asteroid', 'ordinary-asteroid'],
    requirePlayerInitialAdmission: true,
    requireInstanceOwnershipWhenInstanced: true,
  });
  const codes = new Set(result.failures.map((failure) => failure.code));
  assert.ok(codes.has('required-role-not-sampled'));
  assert.ok(codes.has('required-role-continuity-unmeasured'));
  // No instanced samples were recorded (dormant pool), so ownership proof must NOT be demanded.
  assert.ok(!codes.has('instance-ownership-unproven'),
    'conditional ownership must not fire when no instanced samples exist');
});

test('presentation continuity accepts an authored-upgraded ordinary asteroid with no instance fields', () => {
  // The healthy near-spawn case: the rock draws as an authored boundary, the shared pool is dormant,
  // so the ordinary-asteroid role carries NO instance fields. It must satisfy coverage on its own.
  const base = {
    route: 'unit',
    entityId: 60,
    entityType: 'asteroid',
    role: 'ordinary-asteroid',
    semanticIdentity: 'asteroid:ast_common_rock',
    authoredSemanticIdentity: 'GLTFKIT_place_asteroid_rock_a',
    worldIdentity: 'asteroid:60',
    phase: 'interpolation',
    presentationAdmission: 'ready',
    authoredAssetState: 'authored',
    visibleDrawableCount: 1,
    authoredVisibleCount: 1,
    fallbackVisibleCount: 0,
    rootUuid: 'rock-root',
    hullUuid: 'rock-hull',
    frameOriginSeq: 2,
    contextEpoch: 0,
    projected: { x: 140, y: 110, diameter: 12, onScreen: true },
  };
  const result = evaluatePresentationContinuity([
    { ...base, sequence: 0, frame: 0 },
    { ...base, sequence: 1, frame: 1, projected: { x: 140.1, y: 110, diameter: 12, onScreen: true } },
  ], {
    requiredRoles: ['ordinary-asteroid'],
    requiredOnScreenRoles: ['ordinary-asteroid'],
    requireInstanceOwnershipWhenInstanced: true,
  });
  assert.equal(result.pass, true, JSON.stringify(result.failures));
  assert.equal(result.counters.instanceSamples, 0, 'no instance fields → not an instanced sample');
  assert.ok(result.coverage.roles['ordinary-asteroid'].pairs > 0);
});

test('presentation continuity flags instanced samples that never prove exact ownership', () => {
  // A submitted pool instance whose resolved owner does not match the sampled entity: the per-sample
  // instance-owner-mismatch still fires, AND the conditional coverage rule reports it was never proven.
  const base = {
    route: 'unit',
    entityId: 71,
    entityType: 'asteroid',
    role: 'ordinary-asteroid',
    semanticIdentity: 'asteroid:ast_common_rock',
    authoredSemanticIdentity: 'non-authored',
    worldIdentity: 'asteroid:71',
    phase: 'interpolation',
    presentationAdmission: 'ready',
    authoredAssetState: 'authored',
    visibleDrawableCount: 1,
    authoredVisibleCount: 1,
    fallbackVisibleCount: 0,
    rootUuid: 'rock-root',
    hullUuid: 'rock-hull',
    instancePoolUuid: 'pool-x',
    instanceId: 5,
    instanceEntityId: 999, // resolves to the wrong owner every frame
    expectsInstanceOwner: true,
    frameOriginSeq: 2,
    contextEpoch: 0,
    projected: { x: 100, y: 100, diameter: 8, onScreen: true },
  };
  const result = evaluatePresentationContinuity([
    { ...base, sequence: 0, frame: 0 },
    { ...base, sequence: 1, frame: 1, projected: { x: 100.1, y: 100, diameter: 8, onScreen: true } },
  ], { requireInstanceOwnershipWhenInstanced: true });
  assert.equal(result.pass, false);
  const codes = new Set(result.failures.map((failure) => failure.code));
  assert.ok(codes.has('instance-owner-mismatch'), 'per-sample instance failure is untouched');
  assert.ok(codes.has('instance-ownership-unproven'), 'instanced samples without a valid owner fail coverage');
  assert.ok(result.counters.instanceSamples > 0);
  assert.equal(result.counters.validInstanceOwnershipSamples, 0);
});

test('M2 Electron continuity route uses the isolated evidence profile and validates its loopback URL', () => {
  assert.match(M2_SEAMLESS_SOURCE, /createIsolatedElectronLaunch\(\{ root: ROOT, taskId: 'm2-seamless-world' \}\)/);
  assert.match(M2_SEAMLESS_SOURCE, /electron\.launch\(isolatedLaunch\.options\)/);
  assert.match(M2_SEAMLESS_SOURCE, /assertIsolatedElectronRootUrl\([\s\S]*canonicalUrlTracker\.waitForCanonicalRoot/);
  assert.match(M2_SEAMLESS_SOURCE, /isolatedLaunch\.cleanup\(\{ runtimeClosed \}\)/);
  assert.doesNotMatch(M2_SEAMLESS_SOURCE, /electron\.launch\(\{ args: \['\.'\], cwd: ROOT/);
  assert.match(
    M2_SEAMLESS_SOURCE,
    /updateLod\('lod2'\);[\s\S]*capture\(phase, phase, \{ role, requested: 'lod2', stage: 'immediate-request' \}\);[\s\S]*requestAnimationFrame/,
    'forced LOD must be captured synchronously before the next renderer frame can re-resolve it',
  );
});

test('M2 LOD receipt observes tagged visible station LOD instead of the stale resolver', async () => {
  assert.match(
    M2_SEAMLESS_SOURCE,
    /export function installPresentationContinuityRecorderInPage/,
    'the CPU regression must exercise the exact recorder installed on the live page',
  );
  const { installPresentationContinuityRecorderInPage } = await import('../scripts/check-m2-seamless-world.mjs');
  const station = new THREE.Group();
  const lod0 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  const lod2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  lod0.userData.spacefaceTags = { lod: 'lod0' };
  lod2.userData.spacefaceTags = { lod: 'lod2' };
  lod2.visible = false;
  station.add(lod0, lod2);
  station.userData.updateLod = (level) => {
    lod0.visible = level === 'lod0';
    lod2.visible = level === 'lod2';
  };
  const wrapped = attachStationHlod(station, {
    type: 'station',
    radius: 72,
    data: { stationId: 'station_helios_exchange', dockRadius: 72 },
  });

  const priorWindow = globalThis.window;
  const priorDocument = globalThis.document;
  try {
    globalThis.window = {};
    globalThis.document = { querySelector: () => null };
    installPresentationContinuityRecorderInPage();
    wrapped.userData.updateLod('lod2');
    const applied = globalThis.window.__SFPresentationContinuity.inspectAppliedVisualLod(wrapped);
    const receipt = {
      requested: 'lod2',
      applied: applied.level,
      source: applied.source,
      resolver: wrapped.userData.lod.level,
      matched: applied.level === 'lod2',
    };
    assert.deepEqual(receipt, {
      requested: 'lod2',
      applied: 'lod2',
      source: 'tagged-visible-geometry',
      resolver: 'lod0',
      matched: true,
    });
  } finally {
    globalThis.window?.__SFPresentationContinuity?.dispose?.();
    globalThis.window = priorWindow;
    globalThis.document = priorDocument;
    lod0.geometry.dispose();
    lod0.material.dispose();
    lod2.geometry.dispose();
    lod2.material.dispose();
  }
});

test('presentation continuity derives immediate LOD matches from the visible census, not the stale selector', () => {
  const base = {
    route: 'unit',
    entityType: 'ship',
    role: 'player',
    semanticIdentity: 'ship:ship_kestrel',
    authoredSemanticIdentity: 'SF_K0_KESTREL',
    worldIdentity: 'ship:1',
    presentationAdmission: 'ready',
    authoredAssetState: 'authored',
    visibleDrawableCount: 4,
    authoredVisibleCount: 4,
    fallbackVisibleCount: 0,
    frameOriginSeq: 0,
    contextEpoch: 0,
    projected: { x: 300, y: 220, diameter: 40, onScreen: true },
  };
  // Selector says 'lod0' (the resolve()-owned getter a forced updateLod never wrote) but the visible
  // tagged census is exclusively the lod2 bucket → truthfully matched. The old tautology
  // (selectorLevel === requested) would have wrongly called this a miss.
  const applied = evaluatePresentationContinuity([{
    ...base, entityId: 1, sequence: 0, frame: 0, phase: 'lod', transitionKind: 'lod',
    lodRequest: {
      requested: 'lod2', stage: 'immediate-request', selectorLevel: 'lod0',
      applied: {
        visibleBuckets: { lod0: 0, lod1: 0, lod2: 2 },
        availableLevels: ['lod0', 'lod1', 'lod2'],
        taggedVisible: 2, offExpectedVisible: 0, dynamicDetailVisible: 0,
      },
    },
  }]);
  assert.equal(applied.coverage.roles.player.immediateLodRequestSamples, 1);
  assert.equal(applied.coverage.roles.player.immediateLodMatches, 1);

  // Selector says 'lod2' (== requested, so the old tautology WOULD have called it matched) but the
  // visible census is still the lod0 bucket → the forced level was never applied → NOT matched.
  const stale = evaluatePresentationContinuity([{
    ...base, entityId: 2, sequence: 0, frame: 0, phase: 'lod', transitionKind: 'lod',
    lodRequest: {
      requested: 'lod2', stage: 'immediate-request', selectorLevel: 'lod2',
      applied: {
        visibleBuckets: { lod0: 2, lod1: 0, lod2: 0 },
        availableLevels: ['lod0', 'lod1', 'lod2'],
        taggedVisible: 2, offExpectedVisible: 2, dynamicDetailVisible: 0,
      },
    },
  }]);
  assert.equal(stale.coverage.roles.player.immediateLodRequestSamples, 1);
  assert.equal(stale.coverage.roles.player.immediateLodMatches, 0);
});

test('applied-LOD census matches per part on a heterogeneous assembly (live player trap)', async () => {
  const { installPresentationContinuityRecorderInPage } = await import('../scripts/check-m2-seamless-world.mjs');
  // Mirror the live player Kestrel: a full-LOD hull part (lod0/lod1/lod2) plus a lod0-only engine
  // part. Forcing 'lod2' shows the hull LOD2 silhouette while the engine legitimately stays on LOD0.
  // A naive global "census is exactly the expectedApplied bucket" rule would falsely reject this.
  const assembly = new THREE.Group();
  const meshes = [];
  const makePart = (url, level) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
    mesh.userData.spacefacePartUrl = url;
    mesh.userData.spacefaceTags = { lod: level };
    assembly.add(mesh);
    meshes.push(mesh);
    return mesh;
  };
  const hullLod0 = makePart('hulls/hull_starter.glb', 'lod0');
  const hullLod1 = makePart('hulls/hull_starter.glb', 'lod1');
  const hullLod2 = makePart('hulls/hull_starter.glb', 'lod2');
  const engineLod0 = makePart('engines/engine_ion_small.glb', 'lod0');

  const priorWindow = globalThis.window;
  const priorDocument = globalThis.document;
  try {
    globalThis.window = {};
    globalThis.document = { querySelector: () => null };
    installPresentationContinuityRecorderInPage();
    const api = globalThis.window.__SFPresentationContinuity;

    // Correct per-part application of 'lod2': hull → LOD2, engine → closest-available LOD0.
    hullLod0.visible = false; hullLod1.visible = false; hullLod2.visible = true; engineLod0.visible = true;
    const hetero = api.inspectAppliedVisualLod(assembly, 'lod2');
    assert.equal(hetero.matched, true, 'hull at lod2 + engine at its closest lod0 → matched');
    assert.equal(hetero.expectedApplied, 'lod2');
    assert.equal(hetero.offExpectedVisible, 0);
    assert.deepEqual(hetero.visibleBuckets, { lod0: 1, lod1: 0, lod2: 1 });
    assert.deepEqual(hetero.availableLevels, ['lod0', 'lod1', 'lod2']);

    // Stale: hull never left LOD0 while lod2 was requested → its LOD0 bucket is off its expected LOD2.
    hullLod0.visible = true; hullLod1.visible = false; hullLod2.visible = false; engineLod0.visible = true;
    const stale = api.inspectAppliedVisualLod(assembly, 'lod2');
    assert.equal(stale.matched, false, 'hull visible at lod0 when lod2 requested → off-expected');
    assert.ok(stale.offExpectedVisible >= 1);
  } finally {
    globalThis.window?.__SFPresentationContinuity?.dispose?.();
    globalThis.window = priorWindow;
    globalThis.document = priorDocument;
    for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); }
  }
});

test('applied-LOD census honors closest-available on a two-level asset', async () => {
  const { installPresentationContinuityRecorderInPage } = await import('../scripts/check-m2-seamless-world.mjs');
  // Only {lod0, lod1} authored: a 'lod2' request resolves to expectedApplied 'lod1'.
  const asset = new THREE.Group();
  const lod0 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  const lod1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
  lod0.userData.spacefacePartUrl = 'hulls/two_level.glb'; lod0.userData.spacefaceTags = { lod: 'lod0' };
  lod1.userData.spacefacePartUrl = 'hulls/two_level.glb'; lod1.userData.spacefaceTags = { lod: 'lod1' };
  asset.add(lod0, lod1);

  const priorWindow = globalThis.window;
  const priorDocument = globalThis.document;
  try {
    globalThis.window = {};
    globalThis.document = { querySelector: () => null };
    installPresentationContinuityRecorderInPage();
    const api = globalThis.window.__SFPresentationContinuity;

    lod0.visible = false; lod1.visible = true; // closest-available applied lod1
    const applied = api.inspectAppliedVisualLod(asset, 'lod2');
    assert.equal(applied.expectedApplied, 'lod1');
    assert.equal(applied.matched, true, 'lod1 census exclusive → matched against expectedApplied lod1');
    assert.deepEqual(applied.availableLevels, ['lod0', 'lod1']);

    lod0.visible = true; lod1.visible = false; // lod0 is off the closest-available lod1
    const wrong = api.inspectAppliedVisualLod(asset, 'lod2');
    assert.equal(wrong.matched, false);
    assert.ok(wrong.offExpectedVisible >= 1);
  } finally {
    globalThis.window?.__SFPresentationContinuity?.dispose?.();
    globalThis.window = priorWindow;
    globalThis.document = priorDocument;
    lod0.geometry.dispose(); lod0.material.dispose();
    lod1.geometry.dispose(); lod1.material.dispose();
  }
});

// ---------------------------------------------------------------------------
// Cluster repairs (M2 run-3 measurement-design fixes)
// ---------------------------------------------------------------------------

test('frameSeriesSettleIndex finds the settle point and reports never-settled (Cluster 1)', () => {
  // The rebase precondition: the zoom spring decays then holds within tolerance.
  const settling = [
    { x: 500, y: 300, diameter: 376, onScreen: true },
    { x: 500, y: 300, diameter: 360, onScreen: true },
    { x: 500, y: 300, diameter: 350, onScreen: true },
    { x: 500, y: 300, diameter: 344, onScreen: true },
    { x: 500, y: 300, diameter: 342.00, onScreen: true },
    { x: 500, y: 300, diameter: 342.05, onScreen: true },
    { x: 500, y: 300, diameter: 342.10, onScreen: true },
    { x: 500, y: 300, diameter: 342.12, onScreen: true },
    { x: 500, y: 300, diameter: 342.13, onScreen: true },
    { x: 500, y: 300, diameter: 342.14, onScreen: true },
    { x: 500, y: 300, diameter: 342.15, onScreen: true },
  ];
  assert.ok(frameSeriesSettleIndex(settling, { stableFrames: 6, tolerancePx: 0.25 }) >= 0);

  // A composition that keeps oscillating never settles -> harness reports rebase-precondition-never-settled.
  const oscillating = Array.from({ length: 20 }, (_, i) => ({
    x: 500 + (i % 2 === 0 ? 0 : 3), y: 300, diameter: 342, onScreen: true,
  }));
  assert.equal(frameSeriesSettleIndex(oscillating, { stableFrames: 6, tolerancePx: 0.25 }), -1);

  // Offscreen frames break the run.
  const offscreen = [
    { x: 500, y: 300, diameter: 342, onScreen: true },
    { x: null, y: null, diameter: null, onScreen: false },
    { x: 500, y: 300, diameter: 342, onScreen: true },
  ];
  assert.equal(frameSeriesSettleIndex(offscreen, { stableFrames: 4, tolerancePx: 0.25 }), -1);
});

test('presentation continuity settles Continue against the pre-continue baseline (Cluster 2)', () => {
  const base = {
    route: 'unit',
    entityId: 17,
    entityType: 'ship',
    role: 'player',
    semanticIdentity: 'ship:ship_kestrel',
    authoredSemanticIdentity: 'SF_K0_KESTREL',
    worldIdentity: 'ship:17',
    presentationAdmission: 'ready',
    authoredAssetState: 'authored',
    visibleDrawableCount: 4,
    authoredVisibleCount: 4,
    fallbackVisibleCount: 0,
    rootUuid: 'root-pre',
    hullUuid: 'hull-pre',
    frameOriginSeq: 3,
    contextEpoch: 0,
    projected: { x: 500, y: 300, diameter: 48, onScreen: true },
  };
  const post = { rootUuid: 'root-post', hullUuid: 'hull-post', worldIdentity: 'ship:900' };
  const converged = { ...base, ...post };
  const settled = evaluatePresentationContinuity([
    { ...base, sequence: 0, frame: 0, phase: 'pre-continue' },
    { ...base, ...post, sequence: 1, frame: 1, phase: 'continue', transitionKind: 'continue',
      projected: { x: 512, y: 300, diameter: 49, onScreen: true } },
    { ...base, ...post, sequence: 2, frame: 2, phase: 'continue', projected: { x: 505, y: 300, diameter: 48.4, onScreen: true } },
    { ...base, ...post, sequence: 3, frame: 3, phase: 'continue', projected: { x: 501, y: 300, diameter: 48.1, onScreen: true } },
    { ...converged, sequence: 4, frame: 4, phase: 'continue' },
    { ...converged, sequence: 5, frame: 5, phase: 'continue' },
    { ...converged, sequence: 6, frame: 6, phase: 'continue' },
    { ...converged, sequence: 7, frame: 7, phase: 'continue' },
  ]);
  assert.equal(settled.pass, true, JSON.stringify(settled.failures));
  assert.ok(!settled.failures.some((f) => f.code === 'continue-composition-never-settled'));
  assert.ok(!settled.failures.some((f) => f.code === 'continue-center-discontinuity'),
    'the 12px reload spring is inside the settle window, not a raw discontinuity');
  assert.equal(settled.counters.continuePairs, 7);

  // A composition that never reconverges to the baseline within the window is reported once.
  const drifted = { ...base, ...post, projected: { x: 512, y: 300, diameter: 49, onScreen: true } };
  const never = evaluatePresentationContinuity([
    { ...base, sequence: 0, frame: 0, phase: 'pre-continue' },
    { ...drifted, sequence: 1, frame: 1, phase: 'continue', transitionKind: 'continue' },
    { ...drifted, sequence: 2, frame: 2, phase: 'continue' },
    { ...drifted, sequence: 3, frame: 3, phase: 'continue' },
    { ...drifted, sequence: 4, frame: 4, phase: 'continue' },
    { ...drifted, sequence: 5, frame: 5, phase: 'continue' },
  ]);
  assert.equal(never.pass, false);
  const neverCodes = never.failures.filter((f) => f.code === 'continue-composition-never-settled');
  assert.equal(neverCodes.length, 1, 'reported once with the measured tail');
});

test('presentation continuity treats a released mesh as a segment break, not identity churn (Cluster 3)', () => {
  const base = {
    route: 'unit',
    entityId: 2,
    entityType: 'station',
    role: 'helios',
    semanticIdentity: 'station:station_helios',
    authoredSemanticIdentity: 'GLTFKIT_place_station_trade_hub',
    worldIdentity: 'station:2',
    presentationAdmission: 'ready',
    authoredAssetState: 'authored',
    visibleDrawableCount: 3,
    authoredVisibleCount: 3,
    fallbackVisibleCount: 0,
    rootUuid: 'station-root',
    hullUuid: 'station-hull',
    authoredCompositionId: 'GLTFKIT_place_station_trade_hub',
    frameOriginSeq: 2,
    contextEpoch: 0,
    projected: { x: 200, y: 180, diameter: 20, onScreen: true },
  };
  const released = {
    // A live released mesh yields mesh=null -> userData={} -> these all fall to null/non-authored.
    rootUuid: null,
    hullUuid: null,
    authoredAssetState: null,
    authoredCompositionId: null,
    authoredSemanticIdentity: 'non-authored',
    visibleDrawableCount: 0,
    authoredVisibleCount: 0,
    projected: { x: null, y: null, diameter: null, onScreen: false },
  };
  const result = evaluatePresentationContinuity([
    { ...base, sequence: 0, frame: 0, phase: 'rebase', transitionKind: 'rebase', frameOriginSeq: 2 },
    { ...base, ...released, sequence: 1, frame: 1, phase: 'rebase', transitionKind: 'rebase', frameOriginSeq: 3 },
    { ...base, ...released, sequence: 2, frame: 2, phase: 'rebase', frameOriginSeq: 3 },
    // reacquired root after streaming back — a NEW object; its first sample is a fresh baseline.
    { ...base, sequence: 3, frame: 3, phase: 'rebase', frameOriginSeq: 3, rootUuid: 'station-root-2', hullUuid: 'station-hull-2' },
    { ...base, sequence: 4, frame: 4, phase: 'rebase', frameOriginSeq: 3, rootUuid: 'station-root-2', hullUuid: 'station-hull-2' },
  ]);
  const codes = new Set(result.failures.map((f) => f.code));
  assert.ok(!codes.has('rebase-root-identity-changed'), 'streaming unload is not identity churn');
  assert.ok(!codes.has('rebase-hull-identity-changed'));
  assert.ok(!codes.has('rebase-authored-composition-changed'));
  assert.ok(!codes.has('rebase-authoredSemanticIdentity-changed'));
  assert.ok(result.counters.unloadedPairs >= 1, 'the unload pair(s) are counted as segment breaks');
  assert.equal(result.pass, true, JSON.stringify(result.failures));
});

test('presentation continuity re-binds Continue across reshuffled ids by semantic identity (Cluster 4)', () => {
  const base = {
    route: 'unit',
    entityType: 'station',
    role: 'helios',
    semanticIdentity: 'station:station_helios',
    authoredSemanticIdentity: 'GLTFKIT_place_station_trade_hub',
    authoredCompositionId: 'GLTFKIT_place_station_trade_hub',
    presentationAdmission: 'ready',
    authoredAssetState: 'authored',
    visibleDrawableCount: 3,
    authoredVisibleCount: 3,
    fallbackVisibleCount: 0,
    frameOriginSeq: 3,
    contextEpoch: 0,
    projected: { x: 200, y: 180, diameter: 20, onScreen: true },
  };
  const rebound = evaluatePresentationContinuity([
    { ...base, sequence: 0, frame: 0, phase: 'pre-continue', entityId: 2, worldIdentity: 'station:2', rootUuid: 'st-a', hullUuid: 'hl-a' },
    // Same semantic identity, RESHUFFLED entity id (91) and reconstructed uuids on the boundary.
    { ...base, sequence: 1, frame: 1, phase: 'continue', transitionKind: 'continue', entityId: 91, worldIdentity: 'station:91', rootUuid: 'st-b', hullUuid: 'hl-b' },
    { ...base, sequence: 2, frame: 2, phase: 'continue', entityId: 91, worldIdentity: 'station:91', rootUuid: 'st-b', hullUuid: 'hl-b' },
    { ...base, sequence: 3, frame: 3, phase: 'continue', entityId: 91, worldIdentity: 'station:91', rootUuid: 'st-b', hullUuid: 'hl-b' },
    { ...base, sequence: 4, frame: 4, phase: 'continue', entityId: 91, worldIdentity: 'station:91', rootUuid: 'st-b', hullUuid: 'hl-b' },
  ]);
  const codes = new Set(rebound.failures.map((f) => f.code));
  assert.ok(!codes.has('continue-worldIdentity-changed'), 'entity ids reshuffle across save/load');
  assert.ok(!codes.has('continue-semanticIdentity-changed'), 'semantic identity is the stable key');
  assert.ok(!codes.has('continue-root-identity-changed'), 'the first Continue boundary may reconstruct Three objects');
  assert.equal(rebound.pass, true, JSON.stringify(rebound.failures));

  // When no entity matches the established identity, the recorder sentinel fails honestly (deduped).
  const missing = evaluatePresentationContinuity([
    { route: 'unit', sequence: 0, frame: 0, phase: 'continue', role: 'helios', semanticIdentity: 'station:station_helios', roleTargetMissing: true, projected: { x: null, y: null, diameter: null, onScreen: false } },
    { route: 'unit', sequence: 1, frame: 1, phase: 'continue', role: 'helios', semanticIdentity: 'station:station_helios', roleTargetMissing: true, projected: { x: null, y: null, diameter: null, onScreen: false } },
  ]);
  const missingFailures = missing.failures.filter((f) => f.code === 'role-target-missing-after-continue');
  assert.equal(missingFailures.length, 1, 'one failure per role');
  assert.equal(missingFailures[0].role, 'helios');
  assert.equal(missing.pass, false);

  // Range qualification: absence is a failure only when the target SHOULD be present. A last-known
  // position inside the presence range of the player fires; beyond it, a per-sector reload
  // legitimately omitted the entity (streaming truth) and only the counter moves. Unknown positions
  // stay fail-closed (covered by the sentinel cases above, which carry no positions).
  const inRange = evaluatePresentationContinuity([
    {
      route: 'unit', sequence: 0, frame: 0, phase: 'continue', role: 'helios',
      semanticIdentity: 'station:station_helios', roleTargetMissing: true,
      lastKnownWorld: { x: 150, z: 0 }, playerWorld: { x: 0, z: 0 },
      projected: { x: null, y: null, diameter: null, onScreen: false },
    },
  ]);
  assert.equal(
    inRange.failures.filter((f) => f.code === 'role-target-missing-after-continue').length,
    1,
    'a nearby target that vanished across Continue is a real failure',
  );

  const outOfRange = evaluatePresentationContinuity([
    {
      route: 'unit', sequence: 0, frame: 0, phase: 'continue', role: 'helios',
      semanticIdentity: 'station:station_helios', roleTargetMissing: true,
      lastKnownWorld: { x: 9552, z: 0 }, playerWorld: { x: 0, z: 0 },
      projected: { x: null, y: null, diameter: null, onScreen: false },
    },
  ]);
  assert.equal(
    outOfRange.failures.filter((f) => f.code === 'role-target-missing-after-continue').length,
    0,
    'a far-away target omitted by the per-sector reload is legitimate streaming',
  );
  assert.equal(outOfRange.counters.outOfRangeRoleTargets, 1, 'out-of-range absence is counted, not failed');
});

test('continue settle honors a pose-equivalent baseline slack while frame stability stays strict', () => {
  const base = {
    route: 'unit',
    entityId: 17,
    entityType: 'ship',
    role: 'player',
    semanticIdentity: 'ship:kestrel',
    worldIdentity: 'ship:17',
    authoredSemanticIdentity: 'GLTFKIT_kestrel',
    authoredAssetState: 'authored',
    visibleDrawableCount: 1,
    authoredVisibleCount: 1,
    fallbackVisibleCount: 0,
  };
  const at = (sequence, phase, x, transitionKind = null) => ({
    ...base, sequence, frame: sequence, phase, transitionKind,
    rootUuid: phase === 'pre-continue' ? 'pl-a' : 'pl-b',
    projected: { x, y: 100, diameter: 370, onScreen: true },
  });
  // A constant ~5px offset from the baseline, rock-stable frame-to-frame: within the pose-equivalent
  // slack this is a faithful restore (settles); under the strict default it is not.
  const samples = [
    at(0, 'pre-continue', 100),
    at(1, 'continue', 105, 'continue'),
    at(2, 'continue', 105),
    at(3, 'continue', 105),
    at(4, 'continue', 105),
    at(5, 'continue', 105),
  ];
  const strict = evaluatePresentationContinuity(samples);
  assert.ok(strict.failures.some((f) => f.code === 'continue-composition-never-settled'),
    'strict default keeps the offset a failure');
  const slacked = evaluatePresentationContinuity(samples, { limits: { continueBaselineSlackPx: 38.5 } });
  assert.ok(!slacked.failures.some((f) => f.code === 'continue-composition-never-settled'),
    `pose-equivalent slack accepts the stable offset: ${JSON.stringify(slacked.failures)}`);
  // Oscillation inside the slack band is NOT settled: frame-to-frame stability stays strict.
  const oscillating = evaluatePresentationContinuity([
    at(0, 'pre-continue', 100),
    at(1, 'continue', 105, 'continue'),
    at(2, 'continue', 130),
    at(3, 'continue', 105),
    at(4, 'continue', 130),
    at(5, 'continue', 105),
  ], { limits: { continueBaselineSlackPx: 38.5 } });
  assert.ok(oscillating.failures.some((f) => f.code === 'continue-composition-never-settled'),
    'oscillation inside the slack band never settles');
});

test('continue boundary allows lazy authored re-admission but rejects authored identity churn', () => {
  const base = {
    route: 'unit',
    entityId: 4,
    entityType: 'asteroid',
    role: 'authored-asteroid',
    semanticIdentity: 'asteroid:place_asteroid_seamed',
    worldIdentity: 'asteroid:4',
    visibleDrawableCount: 1,
    authoredVisibleCount: 1,
    fallbackVisibleCount: 0,
    projected: { x: 200, y: 200, diameter: 40, onScreen: true },
  };
  // Off-camera reload: admission restarts lazily; the boundary re-enters awaiting-authored-admission
  // with no authored identity. Deferred re-admission, not churn.
  const lazy = evaluatePresentationContinuity([
    { ...base, sequence: 0, frame: 0, phase: 'pre-continue', authoredAssetState: 'authored', authoredSemanticIdentity: 'GLTFKIT_place_asteroid_seamed', rootUuid: 'rk-a' },
    { ...base, sequence: 1, frame: 1, phase: 'continue', transitionKind: 'continue', authoredAssetState: 'awaiting-authored-admission', authoredSemanticIdentity: 'non-authored', rootUuid: 'rk-b', projected: { x: 205, y: 200, diameter: 40, onScreen: true } },
  ]);
  assert.ok(
    !lazy.failures.some((f) => f.code === 'continue-authoredSemanticIdentity-changed'),
    `lazy re-admission must not be identity churn: ${JSON.stringify(lazy.failures)}`,
  );
  // A STARTED admission that resolves to a different authored identity across the boundary is churn.
  const churn = evaluatePresentationContinuity([
    { ...base, sequence: 0, frame: 0, phase: 'pre-continue', authoredAssetState: 'authored', authoredSemanticIdentity: 'GLTFKIT_place_asteroid_seamed', rootUuid: 'rk-a' },
    { ...base, sequence: 1, frame: 1, phase: 'continue', transitionKind: 'continue', authoredAssetState: 'authored', authoredSemanticIdentity: 'GLTFKIT_place_asteroid_graffiti', rootUuid: 'rk-b', projected: { x: 205, y: 200, diameter: 40, onScreen: true } },
  ]);
  assert.ok(
    churn.failures.some((f) => f.code === 'continue-authoredSemanticIdentity-changed'),
    'a different resolved authored identity across the boundary stays a violation',
  );
});

// ---------------------------------------------------------------------------
// Final repairs (M2 run-4 closing findings)
// ---------------------------------------------------------------------------

test('continue settle distinguishes a baseline-matched rest from a constant offset (Repair A)', () => {
  const base = {
    route: 'unit',
    entityId: 17,
    entityType: 'ship',
    role: 'player',
    semanticIdentity: 'ship:ship_kestrel',
    authoredSemanticIdentity: 'SF_K0_KESTREL',
    worldIdentity: 'ship:17',
    presentationAdmission: 'ready',
    authoredAssetState: 'authored',
    visibleDrawableCount: 4,
    authoredVisibleCount: 4,
    fallbackVisibleCount: 0,
    rootUuid: 'root-pre',
    hullUuid: 'hull-pre',
    frameOriginSeq: 3,
    contextEpoch: 0,
    projected: { x: 500, y: 300, diameter: 48, onScreen: true },
  };
  const post = { rootUuid: 'root-post', hullUuid: 'hull-post', worldIdentity: 'ship:900' };
  // The baseline was captured at rest AND saved (Repair A), so Continue restores exactly it: settles.
  const matched = evaluatePresentationContinuity([
    { ...base, sequence: 0, frame: 0, phase: 'pre-continue' },
    { ...base, ...post, sequence: 1, frame: 1, phase: 'continue', transitionKind: 'continue' },
    { ...base, ...post, sequence: 2, frame: 2, phase: 'continue' },
    { ...base, ...post, sequence: 3, frame: 3, phase: 'continue' },
    { ...base, ...post, sequence: 4, frame: 4, phase: 'continue' },
  ]);
  assert.equal(matched.pass, true, JSON.stringify(matched.failures));
  assert.ok(!matched.failures.some((f) => f.code === 'continue-composition-never-settled'));

  // The spring settled, but to a CONSTANT ~4.9px offset (baseline recorded a pre-drift pose that the
  // save then superseded). The reconstruction is faithful to the saved pose, not the baseline.
  const offset = { ...base, ...post, projected: { x: 504.915, y: 300, diameter: 48.97, onScreen: true } };
  const skewed = evaluatePresentationContinuity([
    { ...base, sequence: 0, frame: 0, phase: 'pre-continue' },
    { ...offset, sequence: 1, frame: 1, phase: 'continue', transitionKind: 'continue' },
    { ...offset, sequence: 2, frame: 2, phase: 'continue' },
    { ...offset, sequence: 3, frame: 3, phase: 'continue' },
    { ...offset, sequence: 4, frame: 4, phase: 'continue' },
    { ...offset, sequence: 5, frame: 5, phase: 'continue' },
  ]);
  assert.equal(skewed.pass, false);
  assert.ok(skewed.failures.some((f) => f.code === 'continue-composition-never-settled'),
    'a constant offset never reconverges to the baseline');
});

test('continue boundary pins authored identity, catching a post-reload admission race (Repair B)', () => {
  const base = {
    route: 'unit',
    entityId: 4,
    entityType: 'asteroid',
    role: 'authored-asteroid',
    semanticIdentity: 'asteroid:place_asteroid_seamed',
    authoredSemanticIdentity: 'GLTFKIT_place_asteroid_seamed',
    authoredCompositionId: 'GLTFKIT_place_asteroid_seamed',
    worldIdentity: 'asteroid:4',
    presentationAdmission: 'ready',
    authoredAssetState: 'authored',
    visibleDrawableCount: 1,
    authoredVisibleCount: 1,
    fallbackVisibleCount: 0,
    rootUuid: 'rock-a',
    hullUuid: 'geo-a',
    frameOriginSeq: 3,
    contextEpoch: 0,
    projected: { x: 300, y: 200, diameter: 18, onScreen: true },
  };
  const reboundAuthored = { entityId: 90, worldIdentity: 'asteroid:90', rootUuid: 'rock-b', hullUuid: 'geo-b' };
  // Ungated race: the re-bound rock is sampled before admission completes -> authored -> non-authored.
  const race = evaluatePresentationContinuity([
    { ...base, sequence: 0, frame: 0, phase: 'pre-continue' },
    {
      ...base, ...reboundAuthored, sequence: 1, frame: 1, phase: 'continue', transitionKind: 'continue',
      authoredAssetState: null, authoredSemanticIdentity: 'non-authored', authoredCompositionId: null,
    },
  ]);
  assert.ok(race.failures.some((f) => f.code === 'continue-authoredSemanticIdentity-changed'),
    'without the readiness gate the boundary compares authored -> non-authored');

  // Repair B waits for authored admission, so the boundary compares authored -> authored and is clean.
  const gated = evaluatePresentationContinuity([
    { ...base, sequence: 0, frame: 0, phase: 'pre-continue' },
    { ...base, ...reboundAuthored, sequence: 1, frame: 1, phase: 'continue', transitionKind: 'continue' },
    { ...base, ...reboundAuthored, sequence: 2, frame: 2, phase: 'continue' },
    { ...base, ...reboundAuthored, sequence: 3, frame: 3, phase: 'continue' },
    { ...base, ...reboundAuthored, sequence: 4, frame: 4, phase: 'continue' },
  ]);
  assert.ok(!gated.failures.some((f) => f.code === 'continue-authoredSemanticIdentity-changed'));
  assert.equal(gated.pass, true, JSON.stringify(gated.failures));
});

test('required on-screen coverage is scoped to the player on this route (Repair C)', () => {
  const player = {
    route: 'unit',
    entityId: 1,
    entityType: 'ship',
    role: 'player',
    semanticIdentity: 'ship:ship_kestrel',
    authoredSemanticIdentity: 'SF_K0_KESTREL',
    worldIdentity: 'ship:1',
    presentationAdmission: 'ready',
    authoredAssetState: 'authored',
    visibleDrawableCount: 4,
    authoredVisibleCount: 4,
    fallbackVisibleCount: 0,
    rootUuid: 'ship-root',
    hullUuid: 'ship-hull',
    frameOriginSeq: 2,
    contextEpoch: 0,
    phase: 'stable',
    projected: { x: 500, y: 300, diameter: 40, onScreen: true },
  };
  const offScreenStation = {
    route: 'unit',
    entityId: 2,
    entityType: 'station',
    role: 'helios',
    semanticIdentity: 'station:station_helios',
    authoredSemanticIdentity: 'GLTFKIT_place_station_trade_hub',
    worldIdentity: 'station:2',
    presentationAdmission: 'ready',
    authoredAssetState: 'authored',
    visibleDrawableCount: 3,
    authoredVisibleCount: 3,
    fallbackVisibleCount: 0,
    rootUuid: 'st-root',
    hullUuid: 'st-hull',
    frameOriginSeq: 2,
    contextEpoch: 0,
    phase: 'stable',
    projected: { x: null, y: null, diameter: null, onScreen: false },
  };
  const samples = [
    { ...player, sequence: 0, frame: 0 },
    { ...player, sequence: 1, frame: 1, projected: { x: 500.1, y: 300, diameter: 40, onScreen: true } },
    { ...offScreenStation, sequence: 2, frame: 2 },
    { ...offScreenStation, sequence: 3, frame: 3 },
  ];
  // Player-only on-screen: the never-framed station still measures identity + pairs off-screen.
  const scoped = evaluatePresentationContinuity(samples, {
    requiredRoles: ['player', 'helios'],
    requiredOnScreenRoles: ['player'],
  });
  assert.ok(!scoped.failures.some((f) => f.code === 'required-role-never-on-screen'));
  assert.ok(scoped.coverage.roles.helios.pairs > 0, 'off-screen identity continuity is still measured');
  assert.equal(scoped.pass, true, JSON.stringify(scoped.failures));

  // Demanding on-screen for a never-framed role still fails closed.
  const demanded = evaluatePresentationContinuity(samples, {
    requiredRoles: ['player', 'helios'],
    requiredOnScreenRoles: ['player', 'helios'],
  });
  assert.ok(demanded.failures.some((f) => f.code === 'required-role-never-on-screen' && f.role === 'helios'));
});
