import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  describeAuthoredUpgradeQueue,
  enqueueBoundaryUpgrade,
  holdAuthoredUpgradeQueueForFirstFlight,
  prepareFirstQueuedAuthoredBoundaryForOpening,
  resumeAuthoredUpgradeQueueAfterOpening,
} from '../src/render/partsLibrary.js';

test('first-flight hold admits a readable ship while leaving place and distant ship work parked', async () => {
  const scheduled = [];
  const previousRaf = globalThis.requestAnimationFrame;
  const previousWindow = globalThis.window;
  globalThis.requestAnimationFrame = (callback) => scheduled.push(callback);
  globalThis.window = { SF: { state: {
    mode: 'flight',
    render: { firstPlayableFrameAt: 1, sectorShellAdmission: false },
    playerId: 'player',
    entities: new Map([['player', { pos: { x: 0, z: 0 } }]]),
  } } };
  const scene = new THREE.Scene();
  const started = [];
  const add = (id, type, tier, submitted = tier === 'R0_GLASS', x = 0) => {
    const boundary = new THREE.Group();
    boundary.visible = submitted;
    boundary.userData.authoredAssetState = 'loading';
    scene.add(boundary);
    const entity = {
      id, type, alive: true, mesh: boundary, pos: { x, z: 0 },
      activity: { presentationTier: tier },
      data: {},
    };
    globalThis.window.SF.state.entities.set(id, entity);
    enqueueBoundaryUpgrade(scene, {
      boundary, entity, options: {},
      run: () => { started.push(id); boundary.userData.authoredAssetState = 'authored'; },
    });
  };

  try {
    // The real first-picture cohort leaves openingHandoffHold armed before flight takes over.
    void enqueueBoundaryUpgrade(scene, { boundary: new THREE.Group() });
    await prepareFirstQueuedAuthoredBoundaryForOpening(scene);
    assert.equal(holdAuthoredUpgradeQueueForFirstFlight(scene), true);
    add('place', 'place', 'R0_GLASS');
    add('distant-ship', 'ship', 'R2_METADATA');
    add('beyond-runway-ship', 'ship', 'R1_RUNWAY', false, 900);
    add('far-runway-ship', 'ship', 'R1_RUNWAY', false, 680);
    add('near-runway-ship', 'ship', 'R1_RUNWAY', false, 100);
    // The live frustum may submit a ship at the edge while the activity tier still says runway.
    add('visible-ship', 'ship', 'R1_RUNWAY', true);
    for (let i = 0; i < 6 && scheduled.length; i++) {
      scheduled.shift()(0);
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(started, ['visible-ship', 'near-runway-ship', 'far-runway-ship']);
    assert.equal(describeAuthoredUpgradeQueue(scene).pending, 3);
    assert.equal(describeAuthoredUpgradeQueue(scene).held, true);
  } finally {
    resumeAuthoredUpgradeQueueAfterOpening(scene);
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('a slow station cannot occupy the only slot for a first-flight ship contact', async () => {
  const scheduled = [];
  const previousRaf = globalThis.requestAnimationFrame;
  const previousWindow = globalThis.window;
  globalThis.requestAnimationFrame = (callback) => scheduled.push(callback);
  globalThis.window = { SF: { state: {
    mode: 'flight', playerId: 'player',
    entities: new Map([['player', { pos: { x: 0, z: 0 } }]]),
    render: { firstPlayableFrameAt: 1, sectorShellAdmission: false },
  } } };
  const scene = new THREE.Scene();
  let finishStation;
  const station = new THREE.Group();
  station.userData.authoredAssetState = 'loading';
  scene.add(station);
  const stationEntity = { id: 'station', type: 'station', alive: true, mesh: station };
  const ship = new THREE.Group();
  ship.userData.authoredAssetState = 'loading';
  scene.add(ship);
  const shipEntity = {
    id: 'ship', type: 'ship', alive: true, mesh: ship,
    pos: { x: 100, z: 0 }, activity: { presentationTier: 'R0_GLASS' },
    data: { defId: 'ship_wasp' },
  };
  globalThis.window.SF.state.entities.set('ship', shipEntity);
  let shipStarted = false;
  let finishShip;
  try {
    enqueueBoundaryUpgrade(scene, {
      boundary: station, entity: stationEntity, options: {},
      run: () => new Promise((resolve) => { finishStation = resolve; }),
    });
    scheduled.shift()(0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(describeAuthoredUpgradeQueue(scene).inFlight, 1);
    holdAuthoredUpgradeQueueForFirstFlight(scene);
    let prefetchLoads = 0;
    const shipOptions = {
      overlapAuthoredPipelineCompile: true,
      requiredWholeShip: true,
      loadAuthoredPart: async () => { prefetchLoads++; return null; },
    };
    enqueueBoundaryUpgrade(scene, {
      boundary: ship, entity: shipEntity, renderer: {}, options: shipOptions,
      run: () => {
        shipStarted = true;
        shipOptions.onAuthoredPipelineStaged?.();
        return new Promise((resolve) => { finishShip = resolve; });
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(prefetchLoads > 0, 'the close ship starts its asset request before a composition slot opens');
    assert.equal(shipStarted, false, 'asset lookahead does not construct the ship early');
    scheduled.shift()(0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(shipStarted, true, 'the ship must start before the station settles');
    assert.equal(describeAuthoredUpgradeQueue(scene).inFlight, 1,
      'the first ship released its CPU slot while its GPU work remains in flight');
    const second = new THREE.Group();
    scene.add(second);
    const secondEntity = {
      id: 'second-ship', type: 'ship', alive: true, mesh: second,
      pos: { x: 80, z: 0 }, activity: { presentationTier: 'R0_GLASS' },
    };
    globalThis.window.SF.state.entities.set(secondEntity.id, secondEntity);
    let secondStarted = false;
    enqueueBoundaryUpgrade(scene, {
      boundary: second, entity: secondEntity, options: {},
      run: () => { secondStarted = true; },
    });
    scheduled.shift()(0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(secondStarted, true,
      'a staged ship must not make another close contact wait behind the station');
  } finally {
    finishShip?.();
    finishStation?.();
    resumeAuthoredUpgradeQueueAfterOpening(scene);
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('a non-ship job stalled in flight past the stall bound lets one queued ship pass', async () => {
  const scheduled = [];
  const previousRaf = globalThis.requestAnimationFrame;
  const previousWindow = globalThis.window;
  const previousNow = performance.now.bind(performance);
  let fakeNow = 0;
  globalThis.requestAnimationFrame = (callback) => scheduled.push(callback);
  globalThis.window = { SF: { state: {
    mode: 'flight', playerId: 'player',
    entities: new Map([['player', { pos: { x: 0, z: 0 } }]]),
    render: { firstPlayableFrameAt: 1, sectorShellAdmission: false },
  } } };
  performance.now = () => fakeNow;
  const scene = new THREE.Scene();
  let finishStation;
  const station = new THREE.Group();
  station.userData.authoredAssetState = 'loading';
  scene.add(station);
  const stationEntity = { id: 'station', type: 'station', alive: true, mesh: station };
  const dressing = new THREE.Group();
  dressing.userData.authoredAssetState = 'loading';
  scene.add(dressing);
  const dressingEntity = { id: 'dressing', type: 'place', alive: true, mesh: dressing };
  const ship = new THREE.Group();
  ship.userData.authoredAssetState = 'loading';
  scene.add(ship);
  const shipEntity = {
    id: 'ship', type: 'ship', alive: true, mesh: ship,
    pos: { x: 100, z: 0 }, activity: { presentationTier: 'R0_GLASS' },
    data: { defId: 'ship_wasp' },
  };
  globalThis.window.SF.state.entities.set('ship', shipEntity);
  let shipStarted = false;
  let dressingStarted = false;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    // No first-flight hold: steady flight, serial lane, the station goes in flight and never settles.
    enqueueBoundaryUpgrade(scene, {
      boundary: station, entity: stationEntity, options: {},
      run: () => new Promise((resolve) => { finishStation = resolve; }),
    });
    scheduled.shift()(0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(describeAuthoredUpgradeQueue(scene).inFlight, 1);
    assert.equal(scene.userData.authoredUpgradeDiagnostics.activeJobs, 1);
    // Dressing joins the queue before the ship: enqueued earlier at the same priority it would
    // win the freed slot unless the bypass explicitly hoists a needed ship.
    enqueueBoundaryUpgrade(scene, {
      boundary: dressing, entity: dressingEntity, options: {},
      run: () => { dressingStarted = true; dressing.userData.authoredAssetState = 'authored'; },
    });
    enqueueBoundaryUpgrade(scene, {
      boundary: ship, entity: shipEntity, options: {},
      run: () => { shipStarted = true; ship.userData.authoredAssetState = 'authored'; },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(shipStarted, false, 'the serial lane must not overlap a fresh admission');
    assert.equal(describeAuthoredUpgradeQueue(scene).pending, 2,
      'dressing must actually sit queued ahead of the ship or the hoist assertion is vacuous');
    // The hog crosses the stall bound; the wake poll then releases its diagnostic and bypasses
    // it. Poll instead of sleeping a fixed span — the wake timer is real and a starved host may
    // fire it late.
    fakeNow += 121_000;
    const deadline = Date.now() + 30_000;
    while (!shipStarted && Date.now() < deadline) {
      await sleep(250);
      while (scheduled.length) {
        scheduled.shift()(0);
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
    assert.equal(shipStarted, true, 'a stalled non-ship hog cannot starve the serial ship lane');
    assert.equal(dressingStarted, false,
      'the freed slot belongs to the queued ship, not to earlier dressing work');
    const diagnostics = scene.userData.authoredUpgradeDiagnostics;
    const stationRecord = diagnostics.jobs.find((j) => j.entityId === 'station');
    assert.equal(stationRecord?.status, 'stalled-slot-released',
      'the wedged job keeps its watchdog verdict in the diagnostic record');
    assert.equal(diagnostics.activeJobs, 0,
      'the stalled job diagnostic must not hold upload-quiet gates open');
    // The wedged promise still settles late — bookkeeping must not double-count its release.
    finishStation();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(diagnostics.activeJobs, 0);
    assert.equal(stationRecord.status, 'stalled-slot-released',
      'the late settle must not overwrite the watchdog verdict');
  } finally {
    finishStation?.();
    performance.now = previousNow;
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
