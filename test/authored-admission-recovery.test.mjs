import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { admitAuthoredAssetTask } from '../src/render/assetLoader.js';
import {
  AUTHORED_ADMISSION_RETRY_BASE_DELAY_MS,
  AUTHORED_ADMISSION_RETRY_MAX,
  retryFailedAuthoredAdmission,
} from '../src/render/partsLibrary.js';
import { shouldSubmitEntityMesh } from '../src/render/entityMeshVisibility.js';
import {
  createChaseCamera,
  CAMERA_CLEARANCE_ADOPT_S,
  CAMERA_CLEARANCE_RELEASE_WU_S,
} from '../src/render/camera.js';
import { vfx } from '../src/render/vfx.js';

function freshRuntime() {
  return { assets: new Map(), failures: new Map(), retiring: false };
}

test('a settled-null authored task evicts itself so the next request refetches', async () => {
  const runtime = freshRuntime();
  let calls = 0;
  const first = admitAuthoredAssetTask(runtime, 'u::s', () => {
    calls++;
    runtime.failures.set('u::s', new Error('transient fetch'));
    return Promise.resolve(null);
  });
  assert.equal(await first, null);
  assert.equal(runtime.assets.has('u::s'), false,
    'a failed task must not stay cached — it would resolve null for every later owner');

  const second = admitAuthoredAssetTask(runtime, 'u::s', () => {
    calls++;
    return Promise.resolve({ ok: true });
  });
  assert.deepEqual(await second, { ok: true });
  assert.equal(calls, 2, 'the re-request runs a fresh task instead of inheriting the miss');
  assert.equal(runtime.assets.get('u::s'), second, 'a successful task stays cached');
  assert.equal(runtime.failures.has('u::s'), false,
    'a healed key clears its recorded failure diagnostic');
});

test('a late-settling stale task cannot evict a newer admission under the same key', async () => {
  const runtime = freshRuntime();
  let resolveA;
  const a = admitAuthoredAssetTask(runtime, 'k::*', () => new Promise((resolve) => {
    resolveA = resolve;
  }));
  await Promise.resolve(); // admit defers the factory one microtask so retirement owns it first
  runtime.assets.delete('k::*'); // invalidation re-admits under the same key
  const b = admitAuthoredAssetTask(runtime, 'k::*', () => Promise.resolve('fresh'));
  resolveA(null);
  await a;
  await Promise.resolve();
  assert.equal(runtime.assets.get('k::*'), b,
    'only the exact cached task may evict itself — a stale miss must not erase a re-admission');
});

function failedBoundary(status) {
  const boundary = new THREE.Group();
  boundary.userData.authoredAssetState = status;
  boundary.userData.authoredVisualRoot = 'none-build-failed';
  boundary.userData.authoredUpgradePromise = Promise.resolve({ status });
  return boundary;
}

test('an invisible terminal admission rearms once per backoff window', () => {
  const boundary = failedBoundary('unavailable');
  assert.equal(retryFailedAuthoredAdmission(boundary, 1000), true);
  assert.equal(boundary.userData.authoredAssetState, 'awaiting-authored-admission');
  assert.equal(boundary.userData.authoredUpgradePromise, undefined,
    'the settled promise must clear or requestAuthoredUpgrade would replay it verbatim');
  assert.equal(boundary.userData.authoredAdmissionRetryCount, 1);

  boundary.userData.authoredAssetState = 'unavailable';
  assert.equal(retryFailedAuthoredAdmission(boundary, 1500), false,
    'inside the backoff window the boundary stays terminal');
  assert.equal(
    retryFailedAuthoredAdmission(boundary, 1000 + AUTHORED_ADMISSION_RETRY_BASE_DELAY_MS + 1),
    true,
    'after the window the poll rearms it for another attempt',
  );
  assert.equal(boundary.userData.authoredAdmissionRetryCount, 2);
});

test('admission retries are bounded and never churn a visible fallback', () => {
  const boundary = failedBoundary('unavailable');
  let t = 0;
  for (let i = 0; i < AUTHORED_ADMISSION_RETRY_MAX; i++) {
    assert.equal(retryFailedAuthoredAdmission(boundary, t), true, `attempt ${i + 1}`);
    boundary.userData.authoredAssetState = 'unavailable';
    t += AUTHORED_ADMISSION_RETRY_BASE_DELAY_MS * (2 ** i) + 1;
  }
  assert.equal(retryFailedAuthoredAdmission(boundary, t + 1e9), false,
    'after the cap the verdict stays terminal — a missing asset is not a spinner');

  const readable = failedBoundary('fallback-after-error');
  readable.userData.authoredReadableFallbackRetained = true;
  assert.equal(retryFailedAuthoredAdmission(readable, 0), false,
    'a procedural hull already on screen is never swapped in late by the retry path');

  const authored = failedBoundary('authored');
  assert.equal(retryFailedAuthoredAdmission(authored, 0), false);
});

test('a pending authored boundary with a resolving marker still submits', () => {
  assert.equal(shouldSubmitEntityMesh({ authoredPending: true }), false,
    'a pending root with no placeholder stays out of bloomScene');
  assert.equal(shouldSubmitEntityMesh({ authoredPending: true, resolvingMarker: true }), true,
    'the shared-material marker carries no compile brick, so a pending contact stays visible');
  assert.equal(shouldSubmitEntityMesh({ authoredPending: true, resolvingMarker: true, isPlayer: true }), true);
});

const DT = 1 / 60;

function plumeFleetStub() {
  return {
    findShip: () => ({
      alive: true, isPlayer: true, socketCount: 1, entityId: 1, profileId: 'p',
      driveState: { plumeDrive: 1, boostBlend: 0 },
      sockets: [{}],
    }),
    familyPlume: () => ({
      eventLights: { updateMain: () => ({ lights: [{}] }) },
      pool: { _presentation: { eventLightScale: 1 } },
    }),
  };
}

function plumePlayer(visualRoot) {
  return {
    id: 1, type: 'ship', alive: true,
    view: { root: { userData: { authoredVisualRoot: visualRoot } } },
  };
}

test('the player plume event light only runs while a hull is published', () => {
  let released = 0;
  const fake = {
    _energy: { fleet: plumeFleetStub() },
    _releasePlayerPlumeEventLight() { released++; },
    _upsertPlayerPlumeEventLight: (light) => !!light,
  };
  // Pending and failed admissions publish no hull — the light must not burn at the entity pose.
  for (const root of ['none-pending-admission', 'none-build-failed']) {
    assert.equal(vfx._syncPlayerPlumeEventLight.call(fake, plumePlayer(root)), false, root);
  }
  assert.equal(released, 2, 'each unpublished frame releases the pooled light slot');
  // A committed hull drives the light normally.
  assert.equal(vfx._syncPlayerPlumeEventLight.call(fake, plumePlayer('authored-root')), true);
  assert.equal(released, 2, 'a published hull is not gated off');
});

function clearanceState() {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, hull: 100, maxSpeed: 120,
  };
  return {
    playerId: 1,
    mode: 'flight',
    simTime: 0,
    entities: new Map([[1, player]]),
    settings: { video: { fov: 50, motionReduce: false } },
    camera: { zoom: 144, tilt: 60, lookAhead: 18, lerp: 6, trauma: 0 },
    input: { aimWorld: null },
    player: { tether: { active: false }, remoteMassline: { active: false } },
  };
}

test('the chase camera eases over a roof that stays, and ignores one that flickers', () => {
  globalThis.window = { innerWidth: 1600, innerHeight: 900 };
  const camera = createChaseCamera(clearanceState(), { innerWidth: 1600, innerHeight: 900 });
  camera.snapToPlayer();
  // Dynamic zoom breathes for a while after a snap — let it converge before measuring heights.
  for (let i = 0; i < 240; i++) camera.follow(DT);
  const baseY = camera.obj.position.y;
  assert.ok(baseY > 0 && baseY < 200, `expected the ordinary chase height, got ${baseY}`);

  // One frame of a roof is a loading lie. The camera does not move.
  camera.follow(DT, 1, null, () => 300);
  assert.ok(Math.abs(camera.obj.position.y - baseY) < 0.5, 'a one-frame roof does not lift the camera');

  // A roof that holds still is believed. The ridden floor starts under the chase
  // height, so the picture does not move until the floor climbs past it. The first
  // frame that does move climbs at the fixed rate.
  const adoptFrames = Math.ceil(CAMERA_CLEARANCE_ADOPT_S / DT);
  for (let i = 0; i < adoptFrames; i++) camera.follow(DT, 1, null, () => 300);
  assert.ok(Math.abs(camera.obj.position.y - baseY) < 0.5,
    'the adopt window itself does not move the camera');
  let ticks = 0;
  while (camera.obj.position.y <= baseY + 1 && ticks++ < 240) {
    camera.follow(DT, 1, null, () => 300);
  }
  assert.ok(camera.obj.position.y > baseY + 1, 'a held roof eventually lifts the camera');
  const beforeStep = camera.obj.position.y;
  camera.follow(DT, 1, null, () => 300);
  assert.ok(Math.abs((camera.obj.position.y - beforeStep) - CAMERA_CLEARANCE_RELEASE_WU_S * DT) < 1e-6,
    'a believed roof eases up at the same rate the camera eases down');

  ticks = 0;
  while (camera.obj.position.y < 300 - 0.05 && ticks++ < 600) {
    camera.follow(DT, 1, null, () => 300);
  }
  assert.ok(Math.abs(camera.obj.position.y - 300) < 0.5, 'a held roof is eventually cleared');
  const held = camera.obj.position.y;
  camera.follow(DT, 1, null, () => 300);
  assert.ok(Math.abs(camera.obj.position.y - held) < 1e-6, 'holding a constant floor must not jitter');

  // One frame of "no roof" does not drop the camera.
  camera.follow(DT, 1, null, () => -Infinity);
  assert.ok(Math.abs(camera.obj.position.y - held) < 1e-6, 'a one-frame gap does not release the camera');

  // The roof is actually gone: wait out the adopt window, then descend at the fixed rate.
  for (let i = 0; i < adoptFrames; i++) camera.follow(DT, 1, null, () => -Infinity);
  const beforeDrop = camera.obj.position.y;
  camera.follow(DT, 1, null, () => -Infinity);
  const descending = camera.obj.position.y;
  assert.ok(Math.abs((beforeDrop - descending) - CAMERA_CLEARANCE_RELEASE_WU_S * DT) < 1e-6,
    'the release is a fixed-rate descent, not an exponential tail');

  ticks = 0;
  while (camera.obj.position.y > baseY + 0.05 && ticks++ < 900) {
    camera.follow(DT, 1, null, () => -Infinity);
  }
  assert.ok(Math.abs(camera.obj.position.y - baseY) < 0.5,
    `the camera fully releases back to the chase pose (got ${camera.obj.position.y}, want ~${baseY})`);

  // A floor below the chase height is never a ceiling — the camera stays on its normal plane.
  for (let i = 0; i < adoptFrames + 2; i++) camera.follow(DT, 1, null, () => 50);
  assert.ok(Math.abs(camera.obj.position.y - baseY) < 0.5);

  // A teleport clears the memory so a destination roof is not still lifting the camera.
  ticks = 0;
  while (camera.obj.position.y < baseY + 10 && ticks++ < 400) {
    camera.follow(DT, 1, null, () => 400);
  }
  assert.ok(camera.obj.position.y > baseY + 10, 'a held destination roof does lift');
  camera.snapToPlayer();
  camera.follow(DT, 1, null, () => -Infinity);
  assert.ok(camera.obj.position.y < 200, 'snap resets the clearance floor');
});
