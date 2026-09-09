import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import * as partsLibrary from '../src/render/partsLibrary.js';
import { ensurePerfRuntime } from '../src/core/perfRuntime.js';
import { waitForAuthoredAssetDeadline } from '../scripts/lib/authoredAssetDeadline.mjs';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function makeStubCanvas() {
  const context = {
    canvas: null,
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {},
    bezierCurveTo() {}, quadraticCurveTo() {}, fill() {}, stroke() {}, drawImage() {},
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createImageData(width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    getImageData(_x, _y, width, height) {
      return { data: new Uint8ClampedArray(width * height * 4), width, height };
    },
    putImageData() {}, measureText() { return { width: 10 }; },
    fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, globalAlpha: 1,
  };
  const canvas = {
    width: 256,
    height: 256,
    getContext: () => context,
    style: {},
    addEventListener() {},
  };
  context.canvas = canvas;
  return canvas;
}

function authoredFixtureRecord(url, slot) {
  const geometry = new THREE.BoxGeometry(1, 0.5, 0.5);
  const material = new THREE.MeshStandardMaterial({ color: 0x8090a0 });
  return {
    url,
    slot,
    assetId: url.endsWith('wholeships/kestrel.glb')
      ? 'SF_K0_KESTREL_BORROWED_TIME_V4'
      : 'place_station_trade_hub',
    bounds: {
      min: [-0.5, -0.25, -0.25],
      max: [0.5, 0.25, 0.25],
      size: [1, 0.5, 0.5],
      center: [0, 0, 0],
    },
    primitives: [{
      key: `${url}#fixture`,
      name: 'LOD0_Body_Material_Hull',
      geometry,
      material,
      matrix: new THREE.Matrix4(),
      tags: Object.freeze({ lod: 'lod0', tint: 'hull' }),
    }],
    markers: [],
  };
}

function fallbackShip() {
  const root = new THREE.Group();
  const hull = new THREE.Group();
  hull.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 0.5), new THREE.MeshBasicMaterial()));
  root.add(hull);
  root.userData.hull = hull;
  return root;
}

async function flushMicrotasksUntil(predicate, message) {
  for (let turn = 0; turn < 100; turn++) {
    if (predicate()) return;
    await Promise.resolve();
  }
  assert.fail(message);
}

test('authored boundary admission exposes the runtime queue seam', () => {
  assert.equal(typeof partsLibrary.enqueueBoundaryUpgrade, 'function');
});

test('player and Helios hub outrank NPCs without waiting for queue idle', async () => {
  const scheduledFrames = [];
  const previousRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (callback) => {
    scheduledFrames.push(callback);
    return scheduledFrames.length;
  };

  try {
    const scene = new THREE.Scene();
    const starts = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const entities = [];

    const makeQueuedEntity = ({ id, type = 'ship', data = {}, isPlayer = false, nestedBoundary = false }) => {
      const boundary = new THREE.Group();
      boundary.userData.authoredAssetState = 'loading';
      const publishedMesh = nestedBoundary ? new THREE.Group() : boundary;
      if (nestedBoundary) {
        const detailedRoot = new THREE.Group();
        detailedRoot.add(boundary);
        publishedMesh.add(detailedRoot);
        Object.defineProperty(publishedMesh.userData, 'authoredAssetState', {
          configurable: true,
          enumerable: true,
          get: () => boundary.userData.authoredAssetState,
        });
      }
      scene.add(publishedMesh);
      const entity = { id, type, data, isPlayer, alive: true, mesh: publishedMesh };
      entities.push(entity);
      partsLibrary.enqueueBoundaryUpgrade(scene, {
        boundary,
        entity,
        run: async () => {
          starts.push(id);
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await Promise.resolve();
          boundary.userData.authoredAssetState = 'authored';
          inFlight--;
        },
      });
      return entity;
    };

    const npcs = Array.from({ length: 12 }, (_, index) => makeQueuedEntity({ id: `npc-${index}` }));
    const hub = makeQueuedEntity({
      id: 'station_helios',
      type: 'station',
      data: { archetypeGlb: 'place_station_trade_hub' },
      nestedBoundary: true,
    });
    const player = makeQueuedEntity({ id: 'player-1', isPlayer: true });
    const state = {
      playerId: player.id,
      entities: new Map(entities.map((entity) => [entity.id, entity])),
      entityList: entities,
      world: { currentSectorId: 'sector_helios_prime' },
    };

    const runNextFrame = async () => {
      const callback = scheduledFrames.shift();
      assert.equal(typeof callback, 'function', 'queue must schedule its next admission frame');
      callback(0);
      await new Promise((resolve) => setImmediate(resolve));
    };

    await runNextFrame();
    assert.deepEqual(starts, ['player-1']);
    assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, false,
      'player alone is insufficient while the critical starting hub is loading');

    await runNextFrame();
    assert.deepEqual(starts, ['player-1', 'station_helios']);
    assert.equal(partsLibrary.authoredCriticalVisualReadiness(state).ready, true,
      'critical visual readiness must become ready while ordinary NPC jobs remain queued');
    assert.deepEqual(partsLibrary.getAuthoredUpgradeQueueStats(scene), { pending: 12, running: true });
    assert.equal(starts.some((id) => id.startsWith('npc-')), false,
      'no NPC loader may begin before the player and critical hub complete');

    while (scheduledFrames.length > 0) await runNextFrame();
    assert.deepEqual(starts.slice(2), npcs.map((entity) => entity.id),
      'equal-priority NPC work must retain FIFO order');
    assert.equal(maxInFlight, 1, 'the queue must never overlap authored decodes');
    assert.deepEqual(partsLibrary.getAuthoredUpgradeQueueStats(scene), { pending: 0, running: false });
    assert.equal(hub.mesh.children[0].children[0].userData.authoredAssetState, 'authored');
  } finally {
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
  }
});

test('loading admission releases the CPU slot after staging while exact GPU commits remain pending', async () => {
  const scheduledFrames = [];
  const previousRaf = globalThis.requestAnimationFrame;
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.requestAnimationFrame = (callback) => {
    scheduledFrames.push(callback);
    return scheduledFrames.length;
  };
  globalThis.document = {
    createElement: (tag) => tag === 'canvas'
      ? makeStubCanvas()
      : { style: {}, appendChild() {}, addEventListener() {} },
  };

  const renderer = {};
  const scene = new THREE.Scene();
  const pipelineGates = [deferred(), deferred()];
  const compiledRoots = [];
  const records = new Map();
  const loadAuthoredPart = async (url, options = {}) => {
    if (!records.has(url)) records.set(url, authoredFixtureRecord(url, options.slot));
    return records.get(url);
  };
  const player = {
    id: 'player-loading',
    type: 'ship',
    isPlayer: true,
    alive: true,
    radius: 12,
    data: { defId: 'ship_kestrel', sectorId: 'sector_helios_prime' },
  };
  const hub = {
    id: 'station_helios',
    type: 'station',
    alive: true,
    radius: 72,
    data: {
      stationId: 'station_helios',
      archetypeGlb: 'place_station_trade_hub',
      sectorId: 'sector_helios_prime',
    },
  };
  const runtimeState = {
    mode: 'loading',
    playerId: player.id,
    player,
    entities: new Map([[player.id, player], [hub.id, hub]]),
    entityList: [player, hub],
    world: { currentSectorId: 'sector_helios_prime' },
    render: {
      scene,
      compileObjectPipelines(root) {
        const gate = pipelineGates[compiledRoots.length];
        assert.ok(gate, 'each critical admission must receive one deferred pipeline gate');
        compiledRoots.push(root);
        return gate.promise;
      },
    },
  };
  globalThis.window = { SF: { state: runtimeState } };

  try {
    const playerBoundary = partsLibrary.wrapShipWithAuthoredParts(player, fallbackShip(), {
      releaseMode: true,
      loadAuthoredPart,
    });
    const hubBoundary = partsLibrary.buildAuthoredStationArchetype(hub, {
      releaseMode: true,
      loadAuthoredPart,
    });
    player.mesh = playerBoundary;
    hub.mesh = hubBoundary;
    scene.add(playerBoundary, hubBoundary);

    const hubCompletion = hubBoundary.userData.requestAuthoredUpgrade(renderer, scene);
    const playerCompletion = playerBoundary.userData.requestAuthoredUpgrade(renderer, scene);
    let playerCompletionSettled = false;
    playerCompletion.then(() => { playerCompletionSettled = true; });

    assert.equal(scheduledFrames.length, 1);
    scheduledFrames.shift()(0);
    await flushMicrotasksUntil(
      () => playerBoundary.userData.authoredAssetState === 'compiling-pipelines',
      'the player must finish CPU composition and stage its exact pipeline promise',
    );
    assert.equal(compiledRoots.length, 1);
    assert.equal(playerCompletionSettled, false,
      'queue completion must remain pending until the exact authored commit');
    assert.ok(playerBoundary.userData.authoredPipelineReady instanceof Promise);
    assert.equal(scheduledFrames.length, 1,
      'staging the player must release the serialized CPU slot for the critical hub');

    scheduledFrames.shift()(0);
    await flushMicrotasksUntil(
      () => hubBoundary.userData.authoredAssetState === 'compiling-pipelines',
      'the hub must reach pipeline staging before the player pipeline resolves',
    );
    assert.equal(compiledRoots.length, 2);
    assert.equal(playerBoundary.userData.authoredAssetState, 'compiling-pipelines');
    const stagedReadiness = partsLibrary.authoredCriticalVisualReadiness(runtimeState);
    assert.equal(stagedReadiness.pipelineReady, true);
    assert.equal(stagedReadiness.ready, false,
      'pipeline staging must not satisfy the final committed-authored flight gate');
    assert.deepEqual(partsLibrary.getAuthoredUpgradeQueueStats(scene), { pending: 0, running: true });
    assert.equal(scene.userData.authoredUpgradeDiagnostics.activeJobs, 2,
      'both exact commits remain live diagnostics while the serialized CPU slot is free');

    pipelineGates[0].resolve({ skipped: false });
    pipelineGates[1].resolve({ skipped: false });
    const [playerReceipt, hubReceipt] = await Promise.all([playerCompletion, hubCompletion]);

    assert.equal(playerReceipt.status, 'authored');
    assert.equal(hubReceipt.status, 'authored');
    assert.equal(playerBoundary.userData.authoredAssetState, 'authored');
    assert.equal(hubBoundary.userData.authoredAssetState, 'authored');
    assert.equal(partsLibrary.authoredCriticalVisualReadiness(runtimeState).ready, true);
    assert.deepEqual(partsLibrary.getAuthoredUpgradeQueueStats(scene), { pending: 0, running: false });
  } finally {
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    partsLibrary.invalidatePartsLibraryCaches(renderer);
  }
});

test('post-flight admission is priority-aware, frame-staggered, and serial at composition', async () => {
  const scheduledFrames = [];
  const previousRaf = globalThis.requestAnimationFrame;
  const previousWindow = globalThis.window;
  globalThis.requestAnimationFrame = (callback) => {
    scheduledFrames.push(callback);
    return scheduledFrames.length;
  };

  try {
    const scene = new THREE.Scene();
    const starts = [];
    const releases = new Map();
    let inFlight = 0;
    let maxInFlight = 0;
    const player = { id: 'player', team: 0 };
    const runtimeState = {
      mode: 'flight',
      playerId: player.id,
      player: { targetId: 'selected' },
      entities: new Map([[player.id, player]]),
      entityList: [player],
      settings: { video: {} },
    };
    const perf = ensurePerfRuntime(runtimeState);
    perf.beginFrame(1 / 60);
    perf.beginRenderFrame(31);
    perf.setBackgroundJobTrackingEnabled(true);
    globalThis.window = {
      SF: {
        state: runtimeState,
      },
    };

    const enqueue = ({ id, team = 0, visible = false, estimatedBytes = 512 * 1024 * 1024 }) => {
      const boundary = new THREE.Group();
      boundary.visible = visible;
      boundary.userData.authoredAssetState = 'loading';
      scene.add(boundary);
      const entity = { id, type: 'ship', team, alive: true, mesh: boundary, data: { defId: 'ship_wasp' } };
      window.SF.state.entities.set(id, entity);
      partsLibrary.enqueueBoundaryUpgrade(scene, {
        boundary,
        entity,
        assetUrls: [`assets/${id}.glb`],
        estimatedBytes,
        run: () => new Promise((resolve) => {
          starts.push(id);
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          releases.set(id, () => {
            boundary.userData.authoredAssetState = 'authored';
            inFlight--;
            resolve();
          });
        }),
      });
    };

    enqueue({ id: 'ambient' });
    enqueue({ id: 'onscreen', visible: true });
    enqueue({ id: 'hostile', team: 1 });
    enqueue({ id: 'selected' });

    const runNextFrame = async () => {
      const callback = scheduledFrames.shift();
      assert.equal(typeof callback, 'function');
      callback(0);
      await new Promise((resolve) => setImmediate(resolve));
    };

    await runNextFrame();
    assert.deepEqual(starts, ['selected']);
    assert.equal(scheduledFrames.length, 0, 'shared-library composition must remain single-flight');

    const activeDiagnostics = scene.userData.authoredUpgradeDiagnostics;
    assert.ok(activeDiagnostics, 'queue diagnostics must be published for the live probe');
    assert.equal(activeDiagnostics.jobs[0].backgroundJobId, 1);
    assert.deepEqual(activeDiagnostics.jobs[0].backgroundJobOrigin, {
      displayFrameId: 1,
      renderFrameId: 1,
      simTick: 31,
    });
    assert.equal(activeDiagnostics.maxConcurrentJobs, 1);
    assert.equal(activeDiagnostics.maxConcurrentDecode, 1,
      'distinct asset decode remains serial alongside serial composition');
    assert.equal(activeDiagnostics.peakActivePlannedBytes, 512 * 1024 * 1024,
      'memory proxy must account for the single active composition plan');
    assert.ok(activeDiagnostics.peakActivePlannedBytes < 3 * 1024 * 1024 * 1024);

    releases.get('selected')();
    await new Promise((resolve) => setImmediate(resolve));
    await runNextFrame();
    assert.deepEqual(starts, ['selected', 'hostile']);
    releases.get('hostile')();
    await new Promise((resolve) => setImmediate(resolve));
    await runNextFrame();
    assert.deepEqual(starts, ['selected', 'hostile', 'onscreen']);
    releases.get('onscreen')();
    await new Promise((resolve) => setImmediate(resolve));
    await runNextFrame();
    assert.deepEqual(starts, ['selected', 'hostile', 'onscreen', 'ambient']);

    releases.get('ambient')();
    await new Promise((resolve) => setImmediate(resolve));
    while (scheduledFrames.length > 0) await runNextFrame();
    assert.equal(maxInFlight, 1);
    assert.deepEqual(partsLibrary.getAuthoredUpgradeQueueStats(scene), { pending: 0, running: false });
    assert.deepEqual(
      scene.userData.authoredUpgradeDiagnostics.jobs.map((job) => job.entityId),
      ['selected', 'hostile', 'onscreen', 'ambient'],
    );
    const backgroundJobs = perf.getReport().backgroundJobs;
    assert.deepEqual(backgroundJobs.records.map((job) => job.backgroundJobId), [1, 2, 3, 4]);
    assert.equal(backgroundJobs.records.every((job) => job.terminal === 'authored'), true);
  } finally {
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('authored deadline cannot be extended by a later diagnostic resnapshot', async () => {
  let clock = 0;
  let calls = 0;
  const receipt = await waitForAuthoredAssetDeadline({
    timeoutMs: 45,
    pollIntervalMs: 50,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    sample: async () => {
      calls++;
      if (calls === 1) {
        clock = 44;
        return { shipCount: 12, authoredShipCount: 2 };
      }
      clock = 46;
      return { shipCount: 12, authoredShipCount: 12 };
    },
    isReady: (snapshot) => snapshot.shipCount === 12 && snapshot.authoredShipCount === 12,
  });

  assert.equal(receipt.passed, false);
  assert.equal(receipt.lastOnTimeSnapshot.authoredShipCount, 2,
    'the last sample completed inside the original deadline is authoritative');
  assert.equal(receipt.postDeadlineSnapshot.authoredShipCount, 12,
    'later diagnostics may explain completion but cannot retroactively pass the gate');

  clock = 0;
  const onTime = await waitForAuthoredAssetDeadline({
    timeoutMs: 45,
    now: () => clock,
    sleep: async (ms) => { clock += ms; },
    sample: async () => {
      clock = 44;
      return { shipCount: 12, authoredShipCount: 12 };
    },
    isReady: (snapshot) => snapshot.shipCount === 12 && snapshot.authoredShipCount === 12,
  });
  assert.equal(onTime.passed, true);
  assert.equal(onTime.passedAtMs, 44);
});
