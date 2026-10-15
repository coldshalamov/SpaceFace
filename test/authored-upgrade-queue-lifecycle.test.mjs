import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  buildAuthoredStationArchetype,
  cancelAuthoredUpgradeQueue,
  describeAuthoredUpgradeQueue,
  enqueueBoundaryUpgrade,
  inspectAuthoredBoundaryRegistrations,
} from '../src/render/partsLibrary.js';
import { AUTHORED_UPGRADE_OPENING_LIMIT } from '../src/render/authoredUpgradePolicy.js';

function deferred() {
  let resolve;
  const promise = new Promise((res) => { resolve = res; });
  return { promise, resolve };
}

async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

function stationFixture(loadPart) {
  const entity = {
    id: 'queue_station', type: 'station', alive: true, radius: 34,
    pos: { x: 0, z: 0 },
    data: { stationId: 'station_helios', placeId: 'place_station_trade_hub', dockRadius: 72 },
  };
  const record = {
    url: 'assets/ships/release/parts/places/place_station_trade_hub.glb',
    assetId: 'place_station_trade_hub', slot: 'place',
    bounds: { size: [28, 18, 28], center: [0, 0, 0] },
    primitives: [{ key: 'lod0:station', name: 'LOD0_Station',
      geometry: new THREE.BoxGeometry(28, 18, 28), material: new THREE.MeshStandardMaterial(),
      matrix: new THREE.Matrix4(), tags: { lod: 'lod0' } }], markers: [],
  };
  const boundary = buildAuthoredStationArchetype(entity, {
    releaseMode: true, loadAuthoredPart: (...args) => loadPart(record, ...args),
  });
  const scene = new THREE.Scene();
  scene.add(boundary);
  return { scene, boundary, entity, renderer: {} };
}

function framePump() {
  const oldRaf = globalThis.requestAnimationFrame;
  const frames = [];
  globalThis.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  return {
    frame() { for (const fn of frames.splice(0)) fn(); },
    restore() {
      if (oldRaf === undefined) delete globalThis.requestAnimationFrame;
      else globalThis.requestAnimationFrame = oldRaf;
    },
  };
}

test('the live station request cancels its decode continuation before a fresh body publishes', async () => {
  const pump = framePump();
  const oldDecode = deferred();
  let calls = 0;
  let oldOptions;
  const fixture = stationFixture((record, _url, options) => {
    if (++calls === 1) {
      oldOptions = options;
      return oldDecode.promise.then(() => record);
    }
    return Promise.resolve(record);
  });
  try {
    const oldCompletion = fixture.boundary.userData.requestAuthoredUpgrade(fixture.renderer, fixture.scene);
    pump.frame();
    await flush();
    assert.equal(calls, 1);
    assert.equal(cancelAuthoredUpgradeQueue(fixture.scene), true);
    assert.equal((await oldCompletion).status, 'awaiting-authored-admission');
    assert.equal(oldOptions.signal.aborted, true, 'the actual loader consumer receives the job lifetime');

    const freshCompletion = fixture.boundary.userData.requestAuthoredUpgrade(fixture.renderer, fixture.scene);
    pump.frame();
    const fresh = await freshCompletion;
    assert.equal(fresh.result, true);
    const freshRoot = fixture.boundary.userData.hull;
    oldDecode.resolve();
    await flush();
    assert.equal(fixture.boundary.userData.hull, freshRoot);
    assert.equal(fixture.boundary.userData.authoredAssetState, 'authored');
    assert.equal(fixture.entity.presentationAdmission, 'ready');
  } finally {
    cancelAuthoredUpgradeQueue(fixture.scene);
    pump.restore();
  }
});

test('a station parked at opening publication cancels and releases its detached prepared root', async () => {
  const pump = framePump();
  const previousWindow = globalThis.window;
  const publication = deferred();
  const render = { admissionRunGeneration: 1, openingGraphPublicationFrozen: true,
    waitForOpeningGraphPublicationRelease: () => publication.promise };
  globalThis.window = { SF: { state: { render, entities: new Map(), world: {}, camera: {} } } };
  const fixture = stationFixture((record) => Promise.resolve(record));
  try {
    const completion = fixture.boundary.userData.requestAuthoredUpgrade(fixture.renderer, fixture.scene);
    pump.frame();
    await flush();
    assert.equal(fixture.boundary.userData.authoredPreparePhase, 'awaiting-publication');
    assert.ok(inspectAuthoredBoundaryRegistrations(fixture.scene, fixture.boundary).preparedRoots > 0);
    cancelAuthoredUpgradeQueue(fixture.scene);
    assert.equal((await completion).status, 'awaiting-authored-admission');
    await flush();
    assert.equal(inspectAuthoredBoundaryRegistrations(fixture.scene, fixture.boundary).preparedRoots, 0);

    render.openingGraphPublicationFrozen = false;
    const freshCompletion = fixture.boundary.userData.requestAuthoredUpgrade(fixture.renderer, fixture.scene);
    pump.frame();
    assert.equal((await freshCompletion).result, true);
    const freshRoot = fixture.boundary.userData.hull;
    publication.resolve();
    await flush();
    assert.equal(fixture.boundary.userData.hull, freshRoot);
    assert.equal(fixture.boundary.userData.authoredAssetState, 'authored');
  } finally {
    cancelAuthoredUpgradeQueue(fixture.scene);
    pump.restore();
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

for (const cancel of [false, true]) {
  test(`overlapping GPU tails keep phase-correct slot counts through ${cancel ? 'cancellation' : 'completion'}`, async () => {
    const pump = framePump();
    const previousWindow = globalThis.window;
    const scene = new THREE.Scene();
    const state = { mode: 'loading', render: { scene }, entities: new Map(), world: {}, camera: {} };
    globalThis.window = { SF: { state } };
    const stages = [], gates = [], completions = [];
    try {
      for (let index = 0; index < 8; index++) {
        const boundary = new THREE.Group();
        scene.add(boundary);
        const entity = { id: index + 1, type: 'ship', alive: true, mesh: boundary };
        state.entities.set(entity.id, entity);
        const gate = deferred();
        gates.push(gate);
        completions.push(enqueueBoundaryUpgrade(scene, {
          key: `phase-slot:${index}`, boundary, entity, renderer: {},
          options: { overlapAuthoredPipelineCompile: true },
          run({ options }) {
            stages.push(options.onAuthoredPipelineStaged);
            return gate.promise.then(() => true);
          },
        }));
      }
      for (let index = 0; index < AUTHORED_UPGRADE_OPENING_LIMIT; index++) {
        pump.frame();
        await flush();
      }
      const diagnostics = scene.userData.authoredUpgradeDiagnostics;
      assert.equal(stages.length, AUTHORED_UPGRADE_OPENING_LIMIT);
      assert.equal(diagnostics.activeAdmissionSlots, AUTHORED_UPGRADE_OPENING_LIMIT);
      pump.frame();
      await flush();
      assert.equal(stages.length, AUTHORED_UPGRADE_OPENING_LIMIT, 'the next job waits for a real slot release');
      for (let index = 0; stages.length < gates.length; index++) {
        assert.equal(stages[index](), true);
        assert.equal(stages[index](), false, 'staging releases its semaphore slot only once');
        pump.frame();
        await flush();
        assert.equal(diagnostics.activeAdmissionSlots, describeAuthoredUpgradeQueue(scene).inFlight);
        assert.ok(diagnostics.activeAdmissionSlots <= AUTHORED_UPGRADE_OPENING_LIMIT);
      }
      assert.equal(diagnostics.activeJobs, 8, 'all eight whole lifetimes still await their GPU tail');
      assert.equal(diagnostics.maxConcurrentJobs, 8, 'raw lifecycle concurrency remains truthful');
      assert.equal(diagnostics.maxConcurrentAdmissionSlots, AUTHORED_UPGRADE_OPENING_LIMIT);
      if (cancel) {
        assert.equal(cancelAuthoredUpgradeQueue(scene), true);
        assert.equal(cancelAuthoredUpgradeQueue(scene), false);
      } else {
        for (const gate of gates) gate.resolve();
      }
      await Promise.all(completions);
      await flush();
      assert.equal(diagnostics.activeJobs, 0);
      assert.equal(diagnostics.activeAdmissionSlots, 0);
      assert.equal(diagnostics.maxConcurrentAdmissionSlots, AUTHORED_UPGRADE_OPENING_LIMIT);
      for (const release of stages) assert.equal(release(), false, 'late callbacks cannot decrement settled slots');
      for (const gate of gates) gate.resolve();
      await flush();
      assert.equal(diagnostics.activeJobs, 0, 'late GPU settlement cannot close the lifetime twice');
      assert.equal(diagnostics.activeAdmissionSlots, 0, 'late GPU settlement cannot make slots negative');
    } finally {
      for (const gate of gates) gate.resolve();
      cancelAuthoredUpgradeQueue(scene);
      await flush();
      pump.restore();
      if (previousWindow === undefined) delete globalThis.window;
      else globalThis.window = previousWindow;
    }
  });
}
