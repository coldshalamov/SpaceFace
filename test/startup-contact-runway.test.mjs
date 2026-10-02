import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  authoredCriticalVisualReadiness,
  isInitialAuthoredCompositionEntity,
  waitForOpeningGraphPublicationRelease,
} from '../src/render/partsLibrary.js';
import { FLIGHT_READY_ROLE } from '../src/render/flightReadySet.js';

const RENDERER_SOURCE = readFileSync(
  new URL('../src/render/renderer.js', import.meta.url), 'utf8',
);

function authoredEntity(entity, status) {
  entity.mesh = { userData: { authoredAssetState: status } };
  return entity;
}

function makeLoadingState(entityList = [], extra = {}) {
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true, maxSpeed: 174,
    pos: { x: 0, z: 0 },
    mesh: { userData: { authoredAssetState: 'authored' } },
  };
  const list = [player, ...entityList];
  return {
    mode: 'loading',
    playerId: 1,
    simTime: 0,
    entities: new Map(list.map((entity) => [entity.id, entity])),
    entityList: list,
    camera: { zoom: 144 },
    render: {},
    world: { currentSectorId: 'sector_helios_prime' },
    ...extra,
  };
}

test('a runway wreck/drone holds loading readiness until its packaged body is authored', () => {
  const wreck = authoredEntity(
    { id: 331, type: 'wreck', alive: true, pos: { x: 800, z: 0 }, radius: 14, data: {} },
    'compiling-pipelines',
  );
  const drone = authoredEntity(
    { id: 349, type: 'drone', alive: true, pos: { x: 0, z: -800 }, radius: 4, data: {} },
    'loading',
  );
  for (const status of ['missing', 'loading', 'awaiting-authored-admission', 'compiling-pipelines']) {
    wreck.mesh.userData.authoredAssetState = status;
    const readiness = authoredCriticalVisualReadiness(makeLoadingState([wreck]));
    assert.equal(readiness.ready, false, `runway wreck at '${status}' must block first flight`);
    const blocker = readiness.flightReadyBlockers.find((entry) => entry.metadata
      && entry.metadata.id === wreck.id);
    assert.ok(blocker, 'blocker must name the wreck');
    assert.equal(blocker.role, FLIGHT_READY_ROLE.GLASS_ACTORS);
  }
  drone.mesh.userData.authoredAssetState = 'compiling-pipelines';
  const droneReadiness = authoredCriticalVisualReadiness(makeLoadingState([drone]));
  assert.equal(droneReadiness.ready, false);
  const droneBlocker = droneReadiness.flightReadyBlockers.find((entry) => entry.metadata
    && entry.metadata.id === drone.id);
  assert.ok(droneBlocker && droneBlocker.role === FLIGHT_READY_ROLE.GLASS_ACTORS);

  wreck.mesh.userData.authoredAssetState = 'authored';
  const ready = authoredCriticalVisualReadiness(makeLoadingState([wreck]));
  assert.equal(ready.flightReadyBlockers.some((entry) => entry.metadata
    && entry.metadata.id === wreck.id), false, 'an authored runway wreck releases the gate');
});

test('the runway gate is loading-only: post-picture flight contacts never re-block startup', () => {
  const wreck = authoredEntity(
    { id: 331, type: 'wreck', alive: true, pos: { x: 800, z: 0 }, radius: 14, data: {} },
    'compiling-pipelines',
  );
  const flying = makeLoadingState([wreck], {
    mode: 'flight',
    render: { firstPlayableFrameAt: 1000 },
  });
  const readiness = authoredCriticalVisualReadiness(flying);
  assert.equal(readiness.flightReadyBlockers.some((entry) => entry.metadata
    && entry.metadata.id === wreck.id), false,
  'a compiling wreck after the first picture must not hold a startup verdict');
});

test('far metadata wrecks stay out of the startup gate entirely', () => {
  const far = authoredEntity(
    { id: 410, type: 'wreck', alive: true, pos: { x: 7000, z: 0 }, radius: 14, data: {} },
    'missing',
  );
  const state = makeLoadingState([far]);
  const readiness = authoredCriticalVisualReadiness(state);
  assert.equal(readiness.ready, true);
  assert.equal(readiness.flightReadyBlockers.some((entry) => entry.metadata
    && entry.metadata.id === far.id), false);
  assert.equal(isInitialAuthoredCompositionEntity(far, state), false);
});

test('an explicit flight-ready role outranks the implicit runway glass role', () => {
  const wreck = authoredEntity({
    id: 331,
    type: 'wreck',
    alive: true,
    pos: { x: 800, z: 0 },
    radius: 14,
    data: { flightReadyRole: FLIGHT_READY_ROLE.FIRST_FRAME_BACKGROUND },
  }, 'compiling-pipelines');
  const readiness = authoredCriticalVisualReadiness(makeLoadingState([wreck]));
  const blocker = readiness.flightReadyBlockers.find((entry) => entry.metadata
    && entry.metadata.id === wreck.id);
  assert.equal(blocker && blocker.role, FLIGHT_READY_ROLE.FIRST_FRAME_BACKGROUND);
});

test('the live-sector cook promotes decode-runway contacts and enumerates the wreck bucket', () => {
  const prepareStart = RENDERER_SOURCE.indexOf('state.render.prepareLiveSectorBeforeFlight = async');
  const cookStart = RENDERER_SOURCE.indexOf('state.render.cookLiveSceneGpu = async');
  assert.ok(prepareStart > 0 && cookStart > prepareStart);
  const block = RENDERER_SOURCE.slice(prepareStart, cookStart);
  const promoteAt = block.indexOf('requestDecodeRunwayPromote(state, this._simHelpers)');
  const enumerateAt = block.indexOf('indexedShipLikeScan(state)');
  assert.ok(promoteAt > 0 && enumerateAt > promoteAt,
    'decode-runway rows must become live entities before the opening enumeration runs');
  assert.match(block, /indexedTypeScan\(state, 'wrecks'\)/,
    'indexed shipLike excludes wrecks; the opening set must scan the wreck bucket itself');
});

function withSfState(state, fn) {
  const previousWindow = globalThis.window;
  const previousRaf = globalThis.requestAnimationFrame;
  globalThis.window = { ...(previousWindow || {}), SF: { state } };
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.window = previousWindow;
      globalThis.requestAnimationFrame = previousRaf;
    });
}

function makePublicationFixture(entityPos) {
  const player = { id: 1, type: 'ship', alive: true, isPlayer: true, pos: { x: 0, z: 0 } };
  const wreck = {
    id: 331, type: 'wreck', alive: true, pos: entityPos, radius: 14, data: {},
  };
  const gate = {};
  gate.promise = new Promise((resolve) => { gate.release = resolve; });
  const state = {
    mode: 'flight',
    playerId: 1,
    entities: new Map([[1, player], [331, wreck]]),
    entityList: [player, wreck],
    camera: { zoom: 144 },
    render: {
      openingGraphPublicationFrozen: true,
      waitForOpeningGraphPublicationRelease: () => gate.promise,
      firstPlayableFrameAt: 1000,
      activityFrame: null,
    },
    world: { currentSectorId: 'sector_helios_prime' },
  };
  return { state, wreck, gate };
}

test('an on-glass packaged contact publishes without waiting on the frozen first-flight gate', async () => {
  const { state, wreck, gate } = makePublicationFixture({ x: 60, z: 0 });
  wreck.activity = { presentationTier: 'R0_GLASS' };
  await withSfState(state, async () => {
    assert.equal(waitForOpeningGraphPublicationRelease({ entity: wreck }), null,
      'an on-glass contact must commit, not park on the ~20 s latch');
    const frame = makePublicationFixture({ x: 9000, z: 9000 });
    frame.state.render.activityFrame = { renderGlassIds: new Set([331]) };
    const previousState = state.render;
    state.render = frame.state.render;
    try {
      assert.equal(waitForOpeningGraphPublicationRelease({ entity: wreck }), null,
        'published activity-frame glass membership also clears the gate');
    } finally {
      state.render = previousState;
    }
    const geometric = makePublicationFixture({ x: 60, z: 0 });
    const geometricEntity = { ...geometric.wreck };
    const previousRender = state.render;
    const previousEntities = state.entities;
    state.render = geometric.state.render;
    state.entities = geometric.state.entities;
    try {
      assert.equal(waitForOpeningGraphPublicationRelease({ entity: geometricEntity }), null,
        'a just-promoted contact inside the geometric glass publishes at once');
    } finally {
      state.render = previousRender;
      state.entities = previousEntities;
    }
  });
});

test('an off-glass parked boundary releases when its contact drifts onto the glass', async () => {
  const { state, wreck, gate } = makePublicationFixture({ x: 9000, z: 9000 });
  const rafQueue = [];
  const realRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
  try {
    await withSfState(state, async () => {
      const wait = waitForOpeningGraphPublicationRelease({ entity: wreck });
      assert.ok(wait instanceof Promise, 'an off-glass boundary still parks on the gate');
      let resolved = false;
      wait.then(() => { resolved = true; });
      await Promise.resolve();
      assert.equal(resolved, false, 'parked while off the glass');
      wreck.pos = { x: 60, z: 0 };
      while (rafQueue.length) rafQueue.shift()();
      await wait;
      assert.equal(resolved, true,
        'reaching the readable glass must publish the parked body without the latch');
      gate.release();
    });
  } finally {
    globalThis.requestAnimationFrame = realRaf;
  }
});

test('the gate still owns ambiguous waits: no entity and pre-picture both park', async () => {
  const { state, wreck, gate } = makePublicationFixture({ x: 60, z: 0 });
  wreck.activity = { presentationTier: 'R0_GLASS' };
  await withSfState(state, async () => {
    const anonymous = waitForOpeningGraphPublicationRelease();
    assert.ok(anonymous instanceof Promise, 'no entity means the legacy parked wait');
    const loading = makePublicationFixture({ x: 60, z: 0 });
    const previousRender = state.render;
    state.render = { ...loading.state.render, firstPlayableFrameAt: undefined };
    try {
      const prePicture = waitForOpeningGraphPublicationRelease({ entity: wreck });
      assert.ok(prePicture instanceof Promise,
        'before the first picture the gate batches publications exactly as before');
      gate.release();
      loading.gate.release();
      await anonymous;
      await prePicture;
    } finally {
      state.render = previousRender;
    }
  });
});

test('a parked on-glass poll rejects on a stale generation instead of publishing', async () => {
  const { state, wreck, gate } = makePublicationFixture({ x: 9000, z: 9000 });
  state.render.admissionRunGeneration = 7;
  state.render.renderer = {};
  const rafQueue = [];
  const realRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
  try {
    await withSfState(state, async () => {
      const wait = waitForOpeningGraphPublicationRelease({ entity: wreck });
      assert.ok(wait instanceof Promise, 'an off-glass boundary parks on the gate');
      let fulfilled = false;
      wait.then(() => { fulfilled = true; }, () => {});
      state.render.admissionRunGeneration = 8;
      while (rafQueue.length) rafQueue.shift()();
      await assert.rejects(wait, (error) => error.name === 'AbortError');
      await Promise.resolve();
      assert.equal(fulfilled, false, 'a stale generation must never publish the body');
      gate.release();
    });
  } finally {
    globalThis.requestAnimationFrame = realRaf;
  }
});

test('a parked on-glass poll rejects when the native renderer is replaced', async () => {
  const { state, wreck, gate } = makePublicationFixture({ x: 9000, z: 9000 });
  state.render.admissionRunGeneration = 7;
  state.render.renderer = { tag: 'original' };
  const rafQueue = [];
  const realRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (fn) => { rafQueue.push(fn); return rafQueue.length; };
  try {
    await withSfState(state, async () => {
      const wait = waitForOpeningGraphPublicationRelease({ entity: wreck });
      assert.ok(wait instanceof Promise, 'an off-glass boundary parks on the gate');
      let fulfilled = false;
      wait.then(() => { fulfilled = true; }, () => {});
      state.render.renderer = { tag: 'replaced' };
      while (rafQueue.length) rafQueue.shift()();
      await assert.rejects(wait, (error) => error.name === 'AbortError');
      await Promise.resolve();
      assert.equal(fulfilled, false, 'a retired renderer must never publish the body');
      gate.release();
    });
  } finally {
    globalThis.requestAnimationFrame = realRaf;
  }
});
