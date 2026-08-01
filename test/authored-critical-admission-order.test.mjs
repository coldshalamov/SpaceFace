import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import * as partsLibrary from '../src/render/partsLibrary.js';
import { ensurePerfRuntime } from '../src/core/perfRuntime.js';
import { waitForAuthoredAssetDeadline } from '../scripts/lib/authoredAssetDeadline.mjs';

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
