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
    // A metadata-tier ship parked on the player's own position is geometrically on the
    // readable glass — 'distant' must actually be distant for the hold to defer it.
    add('distant-ship', 'ship', 'R2_METADATA', false, 4000);
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
      run: (context) => {
        shipStarted = true;
        context.options.onAuthoredPipelineStaged();
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

test('a non-ship job stalled in flight past the stall bound lets one queued ship pass', async (t) => {
  const scheduled = [];
  const previousRaf = globalThis.requestAnimationFrame;
  const previousWindow = globalThis.window;
  const previousNow = performance.now.bind(performance);
  let fakeNow = 0;
  t.mock.timers.enable({ apis: ['setTimeout'], now: 0 });
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
    t.mock.timers.tick(5_000);
    for (let i = 0; i < 8 && !shipStarted && scheduled.length; i++) {
      scheduled.shift()(0);
      await new Promise((resolve) => setImmediate(resolve));
    }
    await new Promise((resolve) => setImmediate(resolve));
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

test('first-flight hold admits readable authored contacts of every kind before the +20 release', async () => {
  const scheduled = [];
  const previousRaf = globalThis.requestAnimationFrame;
  const previousWindow = globalThis.window;
  globalThis.requestAnimationFrame = (callback) => scheduled.push(callback);
  globalThis.window = { SF: { state: {
    mode: 'flight',
    render: { firstPlayableFrameAt: 1, sectorShellAdmission: false },
    playerId: 'player',
    entities: new Map([['player', { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } }]]),
  } } };
  const scene = new THREE.Scene();
  const started = [];
  const add = (id, type, tier, submitted = tier === 'R0_GLASS', x = 0, data = {}) => {
    const boundary = new THREE.Group();
    boundary.visible = submitted;
    boundary.userData.authoredAssetState = 'loading';
    scene.add(boundary);
    const entity = {
      id, type, alive: true, mesh: boundary, pos: { x, z: 0 }, vel: { x: 0, z: 0 },
      activity: { presentationTier: tier },
      data,
    };
    globalThis.window.SF.state.entities.set(id, entity);
    enqueueBoundaryUpgrade(scene, {
      boundary, entity, options: {},
      run: () => { started.push(id); boundary.userData.authoredAssetState = 'authored'; },
    });
  };

  try {
    void enqueueBoundaryUpgrade(scene, { boundary: new THREE.Group() });
    await prepareFirstQueuedAuthoredBoundaryForOpening(scene);
    assert.equal(holdAuthoredUpgradeQueueForFirstFlight(scene), true);
    add('glass-station', 'station', 'R0_GLASS', true, 0, { stationTypeId: 'trade_hub' });
    add('glass-wreck', 'wreck', 'R0_GLASS');
    add('runway-wreck', 'wreck', 'R1_RUNWAY', false, 650);
    add('runway-drone', 'drone', 'R1_RUNWAY', false, 660);
    add('far-ship', 'ship', 'R2_METADATA', false, 4000);
    add('far-wreck', 'wreck', 'R2_METADATA', false, 4000);
    add('artless-place', 'place', 'R0_GLASS');
    for (let i = 0; i < 8 && scheduled.length; i++) {
      scheduled.shift()(0);
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.ok(started.includes('glass-station'),
      'an on-glass station can never be parked behind the hold');
    assert.ok(started.includes('glass-wreck'),
      'an on-glass wreck can never be parked behind the hold');
    assert.ok(started.includes('runway-wreck'),
      'a runway wreck inside the admission radius enters during the hold');
    assert.ok(started.includes('runway-drone'),
      'a runway drone inside the admission radius enters during the hold');
    assert.equal(started.includes('far-ship'), false,
      'a metadata-tier ship stays deferred until the hold releases');
    assert.equal(started.includes('far-wreck'), false,
      'a metadata-tier wreck stays deferred until the hold releases');
    assert.equal(started.includes('artless-place'), false,
      'a place with no authored asset of its own stays deferred');
  } finally {
    resumeAuthoredUpgradeQueueAfterOpening(scene);
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('first-flight hold admits the live authored FX POI on glass, not ambient or invalid owners', async () => {
  const scheduled = [];
  const oldRaf = globalThis.requestAnimationFrame;
  const oldWindow = globalThis.window;
  globalThis.requestAnimationFrame = (callback) => scheduled.push(callback);
  const live = { mode: 'flight', simTime: 10, playerId: 1,
    world: { currentSectorId: 'sector_charon_expanse' },
    render: { firstPlayableFrameAt: 1, sectorShellAdmission: false },
    camera: { liveZoom: 144 }, entities: new Map([[1, { pos: { x: 0, z: 0 } }]]) };
  globalThis.window = { SF: { state: live } };
  const scene = new THREE.Scene();
  const started = [];
  const jobs = [];
  const add = (id, alter = () => {}) => {
    const boundary = new THREE.Group();
    boundary.visible = false;
    boundary.userData.authoredAssetState = 'loading';
    boundary.userData.admissionEpoch = 1;
    scene.add(boundary);
    // world.js POI spawn and dressing-table rows both use this fx vocabulary.
    const entity = { id, type: 'fx', alive: true, mesh: boundary,
      pos: { x: 0, z: 20 }, activity: { presentationTier: 'R0_GLASS' },
      data: { poi: true, poiId: 'poi_colony', landmark: true,
        landmarkGlb: 'place_charon_colony_service_barge',
        placeId: 'place_charon_colony_service_barge',
        sectorId: live.world.currentSectorId, homeSectorId: live.world.currentSectorId } };
    const options = { admissionEpoch: 1 };
    live.entities.set(id, entity);
    alter(entity, boundary, options);
    jobs.push(enqueueBoundaryUpgrade(scene, { boundary, entity, options,
      run: () => {
        assert.equal(boundary.visible, false, 'eligibility never publishes the hidden boundary');
        assert.equal(boundary.userData.authoredAssetState, 'loading');
        started.push(id); boundary.userData.authoredAssetState = 'authored';
      } }));
  };
  try {
    void enqueueBoundaryUpgrade(scene, { boundary: new THREE.Group() });
    await prepareFirstQueuedAuthoredBoundaryForOpening(scene);
    holdAuthoredUpgradeQueueForFirstFlight(scene);
    add('colony');
    add('ambient', (e) => { delete e.data.poi; delete e.data.landmark; });
    add('non-poi-landmark', (e) => { delete e.data.poi; });
    add('unanchored', (e) => { delete e.data.poiId; });
    add('artless', (e) => { delete e.data.placeId; delete e.data.landmarkGlb; });
    add('unknown', (e) => { e.data.placeId = e.data.landmarkGlb = 'not-a-place'; });
    add('far', (e) => { e.pos.x = 4000; e.activity.presentationTier = 'R2_METADATA'; });
    add('dead', (e) => { e.alive = false; });
    add('stale', (e) => { live.entities.set(e.id, { ...e }); });
    add('foreign', (e) => { e.data.homeSectorId = e.data.sectorId = 'sector_elsewhere'; });
    add('retired', (_e, _b, o) => { o.isResidencyOwnerActive = () => false; });
    add('old-epoch', (_e, _b, o) => { o.admissionEpoch = 0; });
    add('aborted', (_e, _b, o) => { o.signal = AbortSignal.abort(); });
    add('throwing-owner', (_e, _b, o) => { o.isResidencyOwnerActive = () => { throw new Error('retired'); }; });
    add('detached', (_e, b) => { b.removeFromParent(); });
    add('replaced-boundary', (e) => { e.mesh = new THREE.Group(); });
    for (let i = 0; i < 20 && scheduled.length; i++) {
      scheduled.shift()(0);
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(started, ['colony']);
    const queue = describeAuthoredUpgradeQueue(scene);
    assert.equal(queue.firstFlightHeld, true, 'selective hold is not released');
    assert.equal(queue.inFlight, 0);
    assert.equal(queue.frameScheduled, false);
    assert.ok(queue.pending > 0, 'unrelated FX remain parked');
  } finally {
    // Retire without releasing the held negative fixtures into production work.
    const { cancelAuthoredUpgradeQueue } = await import('../src/render/partsLibrary.js');
    cancelAuthoredUpgradeQueue(scene);
    await Promise.all(jobs);
    if (oldRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = oldRaf;
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
  }
});

for (const gate of ['loading', 'shell', 'gpu']) {
  test(`authored FX POI does not bypass ${gate} admission`, async () => {
    const scheduled = [];
    const oldRaf = globalThis.requestAnimationFrame;
    const oldWindow = globalThis.window;
    globalThis.requestAnimationFrame = (callback) => scheduled.push(callback);
    const scene = new THREE.Scene();
    const boundary = new THREE.Group();
    scene.add(boundary);
    boundary.visible = false;
    boundary.userData.authoredAssetState = 'loading';
    const entity = { id: 542, type: 'fx', alive: true, mesh: boundary,
      pos: { x: 0, z: 0 }, activity: { presentationTier: 'R0_GLASS' },
      data: { poi: true, poiId: 'poi_colony', placeId: 'place_charon_colony_service_barge' } };
    globalThis.window = { SF: { state: {
      mode: gate === 'loading' ? 'loading' : 'flight', playerId: 1,
      entities: new Map([[542, entity], [1, { pos: { x: 0, z: 0 } }]]),
      render: { firstPlayableFrameAt: 1, sectorShellAdmission: gate === 'shell',
        liveSectorGpuAdmission: gate === 'gpu' },
    } } };
    let ran = false;
    let completion;
    try {
      void enqueueBoundaryUpgrade(scene, { boundary: new THREE.Group() });
      holdAuthoredUpgradeQueueForFirstFlight(scene);
      completion = enqueueBoundaryUpgrade(scene, { boundary, entity, options: {}, run: () => { ran = true; } });
      for (let i = 0; i < 8 && scheduled.length; i++) {
        scheduled.shift()(0); await new Promise((resolve) => setImmediate(resolve));
      }
      assert.equal(ran, false);
      assert.equal(boundary.visible, false);
      assert.equal(describeAuthoredUpgradeQueue(scene).firstFlightHeld, true);
    } finally {
      const { cancelAuthoredUpgradeQueue } = await import('../src/render/partsLibrary.js');
      cancelAuthoredUpgradeQueue(scene); await completion;
      if (oldRaf === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = oldRaf;
      if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    }
  });
}
