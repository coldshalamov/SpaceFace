import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CAMERA_DIRECTOR_EASE_S,
  CAMERA_DIRECTOR_FOCUS_SAFE_NDC,
  CAMERA_DIRECTOR_MAX_ZOOM,
  CAMERA_DIRECTOR_MIN_ZOOM,
  CAMERA_DIRECTOR_SAFE_NDC,
  CameraDirectorMode,
  createCameraDirector,
} from '../src/render/cameraDirector.js';
import { createChaseCamera } from '../src/render/camera.js';

const FOV = 50;
const ASPECT = 16 / 9;
const TILT = 60;

function entity(id, x, z, radius = 6, extra = {}) {
  return { id, type: 'ship', alive: true, hull: 100, pos: { x, z }, radius, ...extra };
}

function stateFor(player, others = [], options = {}) {
  return {
    playerId: player.id,
    entities: new Map([player, ...others].map((item) => [item.id, item])),
    player: {
      targetId: options.targetId ?? null,
      flybyFocus: {
        active: !!options.focusActive,
        targetId: options.focusTargetId ?? null,
      },
      tether: {
        active: !!options.tetherActive,
        targetId: options.tetherTargetId ?? null,
      },
    },
  };
}

function view(overrides = {}) {
  return {
    followX: 0,
    followZ: 0,
    followZoom: 72,
    fov: FOV,
    aspect: ASPECT,
    tiltDeg: TILT,
    ...overrides,
  };
}

function assertCameraConsumesComposition(state, camera, label) {
  const frame = camera.composition();
  const cam = camera.obj;
  const focus = state.camera.focus;
  const effectiveZoom = Math.hypot(
    cam.position.x - focus.x,
    cam.position.y,
    cam.position.z - focus.z,
  );
  const direction = cam.getWorldDirection(cam.position.clone().set(0, 0, 0));
  const groundT = -cam.position.y / direction.y;
  const lookX = cam.position.x + direction.x * groundT;
  const lookZ = cam.position.z + direction.z * groundT;

  assert.ok(Math.abs(focus.x - frame.focusX) < 1e-9, `${label}: applied target X consumes director output`);
  assert.ok(Math.abs(focus.z - frame.focusZ) < 1e-9, `${label}: applied target Z consumes director output`);
  assert.ok(Math.abs(effectiveZoom - frame.zoom) < 1e-9, `${label}: Three.js position consumes director zoom`);
  assert.ok(Math.abs(lookX - frame.focusX) < 1e-8, `${label}: Three.js quaternion targets director X`);
  assert.ok(Math.abs(lookZ - frame.focusZ) < 1e-8, `${label}: Three.js quaternion targets director Z`);
}

function projectedBounds(item, frame) {
  const tilt = TILT * Math.PI / 180;
  const tanHalf = Math.tan(FOV * Math.PI / 360);
  const dx = item.pos.x - frame.focusX;
  const dz = item.pos.z - frame.focusZ;
  // A sphere may extend toward the camera in both ground-Z and world-Y. Using a full radius for
  // camera-depth and camera-vertical support keeps the proof conservative for real ship bounds.
  const nearestDepth = frame.zoom - (Math.cos(tilt) * Math.abs(dz) + item.radius);
  return {
    x: (Math.abs(dx) + item.radius) / (nearestDepth * tanHalf * ASPECT),
    y: (Math.sin(tilt) * Math.abs(dz) + item.radius) / (nearestDepth * tanHalf),
  };
}

function runFor(director, seconds, dt, state, player, cameraView = view()) {
  let frame = null;
  for (let elapsed = 0; elapsed < seconds - 1e-12; elapsed += dt) {
    frame = director.step(Math.min(dt, seconds - elapsed), state, player, cameraView);
  }
  return frame;
}

assert.equal(CAMERA_DIRECTOR_MIN_ZOOM, 58, 'pair camera minimum is locked to 58');
assert.equal(CAMERA_DIRECTOR_MAX_ZOOM, 180, 'pair camera preferred maximum is locked to 180');
assert.equal(CAMERA_DIRECTOR_SAFE_NDC, 0.8, 'standard pair threat context uses 10 percent margins (NDC +/-0.80)');
assert.ok(CAMERA_DIRECTOR_FOCUS_SAFE_NDC <= 0.7 + 1e-12, 'Focus context margin is at least ~15% per side');
assert.ok(CAMERA_DIRECTOR_FOCUS_SAFE_NDC >= 0.6 - 1e-12, 'Focus context margin stays within ~20% per side');
assert.equal(CAMERA_DIRECTOR_EASE_S, 0.35, 'composition ease is locked to 0.35 seconds');

const player = entity(1, 0, 0, 7, { team: 0 });
const exact = entity(9, 150, 0, 8, { team: 1 });
const nearer = entity(2, 25, 0, 6, { team: 1 });
const focusState = stateFor(player, [nearer, exact], {
  targetId: exact.id,
  focusActive: true,
  focusTargetId: exact.id,
});
const director = createCameraDirector();
const first = director.step(1 / 60, focusState, player, view());
assert.equal(first.mode, CameraDirectorMode.FOCUS_PAIR, 'active Focus enters exact two-ship composition');
assert.equal(first.targetId, exact.id, 'authoritative Focus target beats a nearer hostile');
assert.equal(first.overflow, false, '150-unit acquisition boundary fits inside the zoom ceiling');
for (const item of [player, exact]) {
  const bounds = projectedBounds(item, first);
  assert.ok(bounds.x <= CAMERA_DIRECTOR_FOCUS_SAFE_NDC + 1e-9, `${item.id} horizontal bounds remain in the Focus safe frame`);
  assert.ok(bounds.y <= CAMERA_DIRECTOR_FOCUS_SAFE_NDC + 1e-9, `${item.id} vertical bounds remain in the Focus safe frame`);
}
assert.ok(first.zoom >= CAMERA_DIRECTOR_MIN_ZOOM && first.zoom <= 330,
  'lateral pair stays inside legal chase zoom (preferred band may yield to Focus context margin)');
assert.equal(first.preferredBandExceeded, first.zoom > CAMERA_DIRECTOR_MAX_ZOOM + 1e-9,
  'preferred-band flag matches actual zoom vs 180');

for (let i = 0; i < 16; i++) {
  const angle = i * Math.PI * 2 / 16;
  const sweepTarget = entity(200 + i, Math.cos(angle) * 150, Math.sin(angle) * 150, 8);
  const sweepState = stateFor(player, [sweepTarget], {
    targetId: sweepTarget.id,
    focusActive: true,
    focusTargetId: sweepTarget.id,
  });
  const sweepFrame = createCameraDirector().step(1 / 60, sweepState, player, view());
  assert.equal(sweepFrame.overflow, false, `150-unit acquisition azimuth ${i} must fit engine geometry`);
  assert.ok(sweepFrame.zoom >= CAMERA_DIRECTOR_MIN_ZOOM && sweepFrame.zoom <= 330,
    `150-unit acquisition azimuth ${i} stays inside legal chase zoom`);
  for (const item of [player, sweepTarget]) {
    const bounds = projectedBounds(item, sweepFrame);
    assert.ok(bounds.x <= CAMERA_DIRECTOR_FOCUS_SAFE_NDC + 1e-9,
      `azimuth ${i} entity ${item.id} horizontal bounds remain in the Focus safe frame`);
    assert.ok(bounds.y <= CAMERA_DIRECTOR_FOCUS_SAFE_NDC + 1e-9,
      `azimuth ${i} entity ${item.id} vertical bounds remain in the Focus safe frame`);
  }
  assert.equal(sweepFrame.preferredBandExceeded, sweepFrame.zoom > CAMERA_DIRECTOR_MAX_ZOOM + 1e-9,
    `azimuth ${i} truthfully reports preferred-band use`);
}

const sameFrame = director.step(1 / 60, focusState, player, view());
assert.equal(sameFrame, first, 'render hot path reuses one output object');

const stateBefore = JSON.stringify(focusState.player);
director.step(1 / 60, focusState, player, view());
assert.equal(JSON.stringify(focusState.player), stateBefore, 'director never writes gameplay or sim state');

const fine = createCameraDirector();
const coarse = createCameraDirector();
const fineFrame = runFor(fine, 0.2, 1 / 60, focusState, player);
const coarseFrame = runFor(coarse, 0.2, 0.05, focusState, player);
assert.ok(Math.abs(fineFrame.focusX - coarseFrame.focusX) < 1e-9, 'focus ease is frame-rate independent');
assert.ok(Math.abs(fineFrame.focusZ - coarseFrame.focusZ) < 1e-9, 'focus Z ease is frame-rate independent');
assert.ok(Math.abs(fineFrame.zoom - coarseFrame.zoom) < 1e-9, 'fit-preserving zoom ease is frame-rate independent');

const reduced = createCameraDirector();
const standard = createCameraDirector();
const reducedFrame = runFor(reduced, 0.2, 1 / 60, focusState, player, view());
const standardFrame = runFor(standard, 0.2, 1 / 60, focusState, player, view());
assert.deepEqual(
  { x: reducedFrame.focusX, z: reducedFrame.focusZ, zoom: reducedFrame.zoom, overflow: reducedFrame.overflow },
  { x: standardFrame.focusX, z: standardFrame.focusZ, zoom: standardFrame.zoom, overflow: standardFrame.overflow },
  'reduced motion preserves identical functional geometry',
);

const tetherState = stateFor(player, [nearer, exact], {
  targetId: exact.id,
  focusActive: true,
  focusTargetId: exact.id,
  tetherActive: true,
  tetherTargetId: exact.id,
});
const handoffDirector = createCameraDirector();
const focusControl = createCameraDirector();
runFor(handoffDirector, 0.2, 1 / 60, focusState, player);
runFor(focusControl, 0.2, 1 / 60, focusState, player);
const afterHandoff = handoffDirector.step(1 / 60, tetherState, player, view());
const withoutHandoff = focusControl.step(1 / 60, focusState, player, view());
assert.equal(afterHandoff.mode, CameraDirectorMode.TETHER_PAIR, 'active tether takes pair ownership after Focus latch');
assert.equal(afterHandoff.targetId, exact.id, 'tether pair keeps the attached entity authoritative');
assert.ok(Math.abs(afterHandoff.focusX - withoutHandoff.focusX) < 1e-9, 'same-target Focus-to-tether handoff has no focus discontinuity');
assert.ok(Math.abs(afterHandoff.focusZ - withoutHandoff.focusZ) < 1e-9, 'same-target handoff has no lateral discontinuity');
assert.ok(Math.abs(afterHandoff.zoom - withoutHandoff.zoom) < 1e-9, 'same-target handoff has no zoom discontinuity');

exact.alive = false;
const recover = handoffDirector.step(1 / 60, tetherState, player, view({ followX: 12, followZ: -4, followZoom: 68 }));
assert.equal(recover.mode, CameraDirectorMode.RECOVER, 'invalid tether target enters recovery instead of retaining stale geometry');
const recovered = runFor(handoffDirector, 0.5, 1 / 60, tetherState, player, view({ followX: 12, followZ: -4, followZoom: 68 }));
assert.equal(recovered.mode, CameraDirectorMode.FOLLOW, 'recovery returns to normal follow after its ease');

const recoverPlayer = entity(301, 0, 0, 7);
const recoverTarget = entity(302, 150, 0, 8);
const recoverState = stateFor(recoverPlayer, [recoverTarget], {
  targetId: recoverTarget.id,
  focusActive: true,
  focusTargetId: recoverTarget.id,
});
const recoverFine = createCameraDirector();
const recoverCoarse = createCameraDirector();
runFor(recoverFine, 0.2, 1 / 60, recoverState, recoverPlayer);
runFor(recoverCoarse, 0.2, 0.05, recoverState, recoverPlayer);
recoverTarget.alive = false;
const highFine = runFor(recoverFine, 0.2, 1 / 60, recoverState, recoverPlayer, view({ followZoom: 220 }));
const highCoarse = runFor(recoverCoarse, 0.2, 0.05, recoverState, recoverPlayer, view({ followZoom: 220 }));
assert.equal(highFine.mode, CameraDirectorMode.RECOVER, 'high ordinary follow zoom remains in smooth recovery mid-ease');
assert.ok(Math.abs(highFine.zoom - highCoarse.zoom) < 1e-9, 'high-zoom recovery is frame-rate independent');
assert.ok(highFine.zoom > CAMERA_DIRECTOR_MAX_ZOOM, 'recovery may cross the preferred pair band toward ordinary follow');
assert.equal(highFine.preferredBandExceeded, true, 'mid-recovery reports use above the preferred pair band');
const highRecovered = runFor(recoverFine, 0.15, 1 / 60, recoverState, recoverPlayer, view({ followZoom: 220 }));
assert.equal(highRecovered.mode, CameraDirectorMode.FOLLOW, 'high-zoom recovery returns to FOLLOW');
assert.equal(highRecovered.zoom, 220, 'recovery reaches the legal ordinary follow zoom without clamping');
assert.equal(highRecovered.preferredBandExceeded, false, 'ordinary FOLLOW zoom is not mislabeled as a pair-band exception');
const afterHighRecovery = recoverFine.step(1 / 60, recoverState, recoverPlayer, view({ followZoom: 220 }));
assert.equal(afterHighRecovery.zoom, highRecovered.zoom, 'FOLLOW has no post-recovery zoom jump');

const impossible = entity(99, 900, 0, 20);
const impossibleState = stateFor(player, [impossible], {
  targetId: impossible.id,
  focusActive: true,
  focusTargetId: impossible.id,
});
const overflow = createCameraDirector().step(1 / 60, impossibleState, player, view());
assert.equal(overflow.mode, CameraDirectorMode.FOCUS_PAIR, 'valid distant target still produces pair intent');
assert.equal(overflow.zoom, 330, 'impossible geometry clamps to the legal chase zoom ceiling');
assert.equal(overflow.overflow, true, 'impossible geometry is reported instead of silently claiming fit');
assert.ok(overflow.requiredZoom > 330, 'overflow exposes the zoom actually required to fit');

const follow = createCameraDirector().step(1 / 60, stateFor(player), player, view({ followX: 5, followZ: 3, followZoom: 70 }));
assert.equal(follow.mode, CameraDirectorMode.FOLLOW, 'no authoritative pair remains normal follow');
assert.equal(follow.targetId, null, 'follow mode has no stale target');

function chaseState(reducedMotion) {
  const chasePlayer = entity(101, 0, 0, 7, { team: 0, vel: { x: 0, z: 0 }, maxSpeed: 120 });
  const chaseNearer = entity(102, 24, 0, 6, { team: 1, vel: { x: 0, z: 0 } });
  const chaseExact = entity(109, 150, 0, 8, { team: 1, vel: { x: -100, z: 0 } });
  const state = stateFor(chasePlayer, [chaseNearer, chaseExact], {
    targetId: chaseExact.id,
    focusActive: true,
    focusTargetId: chaseExact.id,
  });
  state.settings = { video: { fov: FOV, motionReduce: reducedMotion } };
  state.camera = { zoom: 72, tilt: TILT, lookAhead: 18, lerp: 6, trauma: 0 };
  state.input = { aimWorld: null };
  return { state, player: chasePlayer, exact: chaseExact };
}

function transitioningChaseState(reducedMotion) {
  const chasePlayer = entity(401, 0, 0, 7, { team: 0, vel: { x: 100, z: 0 }, maxSpeed: 120 });
  const chaseExact = entity(409, 40, 0, 8, { team: 1, vel: { x: 0, z: 0 } });
  const state = stateFor(chasePlayer, [chaseExact], {
    targetId: null,
    focusActive: false,
    focusTargetId: null,
  });
  state.settings = { video: { fov: FOV, motionReduce: reducedMotion } };
  state.camera = { zoom: 98, tilt: TILT, lookAhead: 18, lerp: 6, trauma: 0 };
  state.input = { aimWorld: null };
  return { state, player: chasePlayer, exact: chaseExact };
}

globalThis.window = { innerWidth: 1600, innerHeight: 900 };
const liveStandard = chaseState(false);
const liveReduced = chaseState(true);
const standardCamera = createChaseCamera(liveStandard.state);
const reducedCamera = createChaseCamera(liveReduced.state);
standardCamera.snapToPlayer();
reducedCamera.snapToPlayer();
for (let i = 0; i < 12; i++) {
  standardCamera.follow(1 / 60);
  reducedCamera.follow(1 / 60);
  assertCameraConsumesComposition(liveStandard.state, standardCamera, `standard transition frame ${i}`);
  assertCameraConsumesComposition(liveReduced.state, reducedCamera, `reduced transition frame ${i}`);
}
assert.equal(typeof standardCamera.composition, 'function', 'live chase camera exposes the installed director output');
assert.equal(typeof reducedCamera.composition, 'function', 'reduced-motion chase camera exposes the same director seam');
const standardComposition = standardCamera.composition();
const reducedComposition = reducedCamera.composition();
assert.equal(standardComposition.mode, CameraDirectorMode.FOCUS_PAIR, 'live chase camera installs the Focus pair director');
assert.equal(standardComposition.targetId, liveStandard.exact.id, 'live chase camera frames the exact Focus target');
assert.equal(standardComposition.overflow, false, 'live 150-unit Focus pair fits without overflow');
assert.deepEqual(
  {
    x: standardComposition.focusX,
    z: standardComposition.focusZ,
    zoom: standardComposition.zoom,
    targetId: standardComposition.targetId,
  },
  {
    x: reducedComposition.focusX,
    z: reducedComposition.focusZ,
    zoom: reducedComposition.zoom,
    targetId: reducedComposition.targetId,
  },
  'live reduced-motion camera preserves the same Focus composition geometry',
);

const transitionLive = transitioningChaseState(false);
const transitionCamera = createChaseCamera(transitionLive.state);
transitionCamera.snapToPlayer();
for (let i = 0; i < 8; i++) transitionCamera.follow(1 / 60);
const beforePair = {
  x: transitionLive.state.camera.focus.x,
  z: transitionLive.state.camera.focus.z,
  zoom: Math.hypot(
    transitionCamera.obj.position.x - transitionLive.state.camera.focus.x,
    transitionCamera.obj.position.y,
    transitionCamera.obj.position.z - transitionLive.state.camera.focus.z,
  ),
};
transitionLive.state.player.flybyFocus.active = true;
transitionLive.state.player.flybyFocus.targetId = transitionLive.exact.id;
transitionCamera.follow(1 / 60);
const enteredPair = transitionCamera.composition();
const firstEaseT = (1 / 60) / CAMERA_DIRECTOR_EASE_S;
const firstEase = firstEaseT * firstEaseT * (3 - 2 * firstEaseT);
const desiredPairX = 20.5;
const expectedFirstX = beforePair.x + (desiredPairX - beforePair.x) * firstEase;
// Predict the first pair frame from the same pose the chase camera just applied.
const predictedPair = createCameraDirector();
predictedPair.syncFollow(beforePair.x, beforePair.z, beforePair.zoom);
const predictedFrame = predictedPair.step(1 / 60, transitionLive.state, transitionLive.player, {
  followX: beforePair.x,
  followZ: beforePair.z,
  followZoom: beforePair.zoom,
  fov: FOV,
  aspect: ASPECT,
  tiltDeg: TILT,
});
assert.equal(enteredPair.mode, CameraDirectorMode.FOCUS_PAIR, 'live FOLLOW enters pair mode');
assert.ok(Math.abs(enteredPair.focusX - expectedFirstX) < 1e-9,
  'FOLLOW-to-pair transition seeds from the actually applied damped focus');
assert.ok(Math.abs(enteredPair.focusX - predictedFrame.focusX) < 1e-6,
  'live first pair focus matches director prediction from applied pose');
assert.ok(Math.abs(enteredPair.zoom - predictedFrame.zoom) < 1e-3,
  'FOLLOW-to-pair zoom eases from the applied pose toward Focus context fit');
assert.ok(enteredPair.requiredZoom >= CAMERA_DIRECTOR_MIN_ZOOM,
  'first pair frame reports a legal required zoom');
assert.ok(Math.abs(enteredPair.zoom - beforePair.zoom) <= Math.abs(beforePair.zoom - enteredPair.requiredZoom) * firstEase + 0.5,
  'first pair zoom does not snap beyond one ease step from the applied pose');
assertCameraConsumesComposition(transitionLive.state, transitionCamera, 'first live pair frame');

const directorSource = readFileSync(new URL('../src/render/cameraDirector.js', import.meta.url), 'utf8');
const cameraSource = readFileSync(new URL('../src/render/camera.js', import.meta.url), 'utf8');
assert.doesNotMatch(directorSource, /reducedMotion/,
  'pair framing API is motion-invariant and has no dead reduced-motion flag');
assert.doesNotMatch(cameraSource, /_directorView\.reducedMotion/,
  'live camera does not pass a dead reduced-motion flag into pair framing');

console.log('Camera director checks OK');
