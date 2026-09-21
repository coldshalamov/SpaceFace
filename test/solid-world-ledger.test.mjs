import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  residencyPrefetchRadius,
  tableLookAtDelta,
  tableLookAtOrigin,
  tableTravelSpeed,
} from '../src/render/tabletopPolicy.js';
import { isEntityRenderRelevant } from '../src/render/renderer.js';
import { createLiveGeometryAdmissionQueue } from '../src/render/liveGeometryAdmission.js';
import { insertAsteroidFieldRock } from '../src/world/asteroidField.js';
import { collectMeshPresentationEntities } from '../src/world/presentationSources.js';

// PQ-210.03 — "the world is solid": the ledger collect disc and the keep
// radius share one origin (the live look-at); nothing on the live glass may
// lose its mesh (onGlassDisposals stays 0); a geometryPending root on the
// live glass resolves inside ~0.25 s.

function flightState({ focus = null, playerPos = { x: 0, z: 0 } } = {}) {
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true,
    pos: { x: playerPos.x, z: playerPos.z }, vel: { x: 0, z: 0 },
    maxSpeed: 160, radius: 8, data: {},
  };
  const camera = { zoom: 144, liveZoom: 144, tilt: 60, fov: 50, aspect: 16 / 9 };
  if (focus) camera.focus = { x: focus.x, z: focus.z };
  return {
    mode: 'flight',
    playerId: 1,
    player: { targetId: null },
    entities: new Map([[1, player]]),
    entityList: [player],
    world: { frameOrigin: { x: 0, z: 0 } },
    camera,
    settings: { video: { fov: 50 } },
    simTime: 10,
    tick: 600,
    nextEntityId: 100,
    freeIds: [],
    render: {},
  };
}

test('collect origin and keep-radius origin are the same point', () => {
  const state = flightState({ focus: { x: 300, z: -80 } });
  // Velocity-lead pushes the camera look-at ahead of the hull. The keep radius
  // (tableLookAtDelta) already measures from there; the collect disc must too.
  assert.deepEqual(tableLookAtOrigin(state, { x: 0, z: 0 }), { x: 300, z: -80 });
  const delta = tableLookAtDelta(state, { x: 0, z: 0 }, { x: 300, z: -80 });
  assert.equal(delta.x, 0);
  assert.equal(delta.z, 0);
  // Focus is frame-local; world positions are global — the origin rebases.
  state.world.frameOrigin = { x: 1000, z: 0 };
  assert.deepEqual(tableLookAtOrigin(state, { x: 0, z: 0 }), { x: 1300, z: -80 });
  // No live focus -> the fallback (player) owns both discs, as before.
  delete state.camera.focus;
  assert.deepEqual(tableLookAtOrigin(state, { x: 7, z: 9 }), { x: 7, z: 9 });
});

test('the ledger collect disc centers on the look-at so collect stays inside keep', () => {
  const LEAD = 4000;
  const state = flightState({ focus: { x: LEAD, z: 0 } });
  const collectR = residencyPrefetchRadius(tableTravelSpeed(state), 144, 50, 16 / 9, 60);
  // Inside the look-at disc but far outside any player-centered disc: the keep
  // radius holds this row resident, so collect must feed it or the mesh never builds.
  const nearLookAt = insertAsteroidFieldRock(state, {
    id: 201, pos: { x: LEAD + collectR * 0.5, z: 0 }, radius: 10,
  });
  // Hugging the player but far behind the led look-at: keep has already dropped
  // it, so collect feeding it would only build-then-evict on every poll.
  const nearPlayer = insertAsteroidFieldRock(state, {
    id: 202, pos: { x: -collectR * 0.5, z: 0 }, radius: 10,
  });

  const ids = collectMeshPresentationEntities(state).map((row) => row.id);
  assert.ok(ids.includes(nearLookAt.id),
    'a row inside the look-at collect disc must be fed to the mesh pass');
  assert.ok(!ids.includes(nearPlayer.id),
    'a row outside the keep radius must not be collected just because it sits near the player');

  // The leaf's real invariant: nothing the disc feeds is immediately dropped by
  // the residency policy measuring from the other origin.
  assert.equal(isEntityRenderRelevant(nearLookAt, state), true,
    'collected rows must survive the keep-radius test on the same origin');
  assert.equal(isEntityRenderRelevant(nearPlayer, state), false,
    'uncollected rows must also fail keep — collect and keep cannot disagree');
});

test('a live-glass entity survives the residency poll even when the activity frame omits it', () => {
  const state = flightState({ focus: { x: 0, z: 0 } });
  const onGlass = {
    id: 55, type: 'asteroid', alive: true,
    pos: { x: 20, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, data: {},
  };
  const offGlass = {
    id: 56, type: 'asteroid', alive: true,
    pos: { x: 6000, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, data: {},
  };
  state.entities.set(55, onGlass);
  state.entities.set(56, offGlass);
  state.entityList.push(onGlass, offGlass);
  // A complete sim-side frame that names neither body — the exact hole that used
  // to dispose on-screen meshes ("fly kind of away and it pops out of existence").
  state.render = {
    activityFrame: {
      complete: true,
      renderGlassIds: new Set([1]),
      renderRunwayIds: new Set(),
    },
  };
  assert.equal(isEntityRenderRelevant(onGlass, state), true,
    'the live screen outranks the classifier — this is what keeps onGlassDisposals at 0');
  assert.equal(isEntityRenderRelevant(offGlass, state), false);
});

test('on-glass pending roots drain as one deadline batch, not one present each', async () => {
  const compileCalls = [];
  const prepareCalls = [];
  const prepareBatchCalls = [];
  const readied = [];
  const queue = createLiveGeometryAdmissionQueue({
    compile: async (root) => { compileCalls.push(root.id); },
    prepare: async (root, options) => {
      prepareCalls.push({ id: root.id, unSliced: options && options.unSliced === true });
      return { skipped: false };
    },
    prepareBatch: async (roots, options) => {
      prepareBatchCalls.push({ ids: roots.map((root) => root.id), unSliced: options && options.unSliced === true });
      return { skipped: false };
    },
    yieldToMain: async () => {},
    isActive: () => true,
    isUrgent: (entity) => entity.onGlass === true,
    onReady: (entity, root) => readied.push(root.id),
    onError: (error) => { throw error; },
    priorityOf: () => 1,
  });
  // An ambient (off-glass) entry drains first — it was enqueued first — then the
  // urgent burst must clear through per-root deadline compiles (each root's
  // pipelinesPending clears on ITS OWN link, never a sibling's, and no staging
  // detach) + ONE merged residency pass, not N serialized per-present drains.
  // 0.25 s cannot absorb 16 serialized roots.
  const ambient = { entity: { id: 9, alive: true, onGlass: false }, root: { id: 9 } };
  const urgent = [1, 2, 3].map((id) => ({ entity: { id, alive: true, onGlass: true }, root: { id } }));
  await Promise.all([
    queue.enqueue(ambient.entity, ambient.root),
    ...urgent.map((item) => queue.enqueue(item.entity, item.root)),
  ]);
  assert.deepEqual([...compileCalls].sort((a, b) => a - b), [1, 2, 3, 9],
    'every urgent root gets its own floated deadline compile — a merged compile '
    + 'would hold all latches for the slowest link and detach roots into staging');
  assert.deepEqual(prepareBatchCalls, [{ ids: [1, 2, 3], unSliced: true }],
    'the urgent burst pays one merged residency pass — un-sliced, one chain link');
  assert.deepEqual(prepareCalls.filter((p) => !p.unSliced).map((p) => p.id), [9]);
  assert.deepEqual([...readied].sort(), [1, 2, 3, 9]);
});

test('a floating program link does not hold the on-glass latch', async () => {
  // The pending latch covers geometry residency; program links are driver-bound
  // and can take seconds. The urgent batch must ready roots once uploads land —
  // the compile stays in flight as background warming.
  let releaseCompile;
  const compileGate = new Promise((resolve) => { releaseCompile = resolve; });
  const readied = [];
  const queue = createLiveGeometryAdmissionQueue({
    compile: () => compileGate, // link never settles inside the test window
    prepareBatch: async () => ({ skipped: false }),
    prepare: async () => ({ skipped: false }),
    yieldToMain: async () => {},
    isActive: () => true,
    isUrgent: (entity) => entity.onGlass === true,
    onReady: (entity, root) => readied.push(root.id),
    onError: (error) => { throw error; },
    priorityOf: () => 1,
  });
  const urgent = { entity: { id: 7, alive: true, onGlass: true }, root: { id: 7 } };
  const completion = queue.enqueue(urgent.entity, urgent.root);
  await completion;
  assert.deepEqual(readied, [7],
    'the root shows once geometry is resident — it must not wait on the program link');
  releaseCompile();
  await compileGate;
});

test('an ambient entry that lands on-glass mid-link stops waiting for it', async () => {
  // Picked off-glass, the entry honors compile-before-show — but if the entity
  // crosses onto the glass while the program link is still running, the latch
  // must clear at residency within a yield, not after the multi-second link.
  let releaseCompile;
  const compileGate = new Promise((resolve) => { releaseCompile = resolve; });
  const readied = [];
  const prepares = [];
  let yields = 0;
  const queue = createLiveGeometryAdmissionQueue({
    compile: () => compileGate, // link never settles inside the test window
    prepare: async (root, options) => {
      prepares.push({ id: root.id, unSliced: options && options.unSliced === true });
      return { skipped: false };
    },
    yieldToMain: async () => { if (++yields === 2) drifter.entity.onGlass = true; },
    isActive: () => true,
    isUrgent: (entity) => entity.onGlass === true,
    onReady: (entity, root) => readied.push(root.id),
    onError: (error) => { throw error; },
    priorityOf: () => 1,
  });
  const drifter = { entity: { id: 8, alive: true, onGlass: false }, root: { id: 8 } };
  const completion = queue.enqueue(drifter.entity, drifter.root);
  await completion;
  assert.deepEqual(readied, [8],
    'the latch clears at residency once the root is on the glass — the link floats on');
  assert.deepEqual(prepares, [{ id: 8, unSliced: true }],
    'the escalated residency pass runs un-sliced like an urgent pick');
  releaseCompile();
  await compileGate;
});

test('an urgent batch member that dies mid-drain is skipped, not readied', async () => {
  const readied = [];
  const compileCalls = [];
  const queue = createLiveGeometryAdmissionQueue({
    compile: async (root) => { compileCalls.push(root.id); },
    prepare: async () => ({ skipped: false }),
    // The kill lands inside the residency pass — the real mid-drain window.
    prepareBatch: async () => { dying.entity.alive = false; return { skipped: false }; },
    yieldToMain: async () => {},
    isActive: (entity) => entity.alive !== false,
    isUrgent: (entity) => entity.onGlass === true,
    onReady: (entity, root) => readied.push(root.id),
    onError: (error) => { throw error; },
    priorityOf: () => 1,
  });
  const ambient = { entity: { id: 9, alive: true, onGlass: false }, root: { id: 9 } };
  const dying = { entity: { id: 4, alive: true, onGlass: true }, root: { id: 4 } };
  const live = { entity: { id: 5, alive: true, onGlass: true }, root: { id: 5 } };
  const completions = [
    queue.enqueue(ambient.entity, ambient.root),
    queue.enqueue(dying.entity, dying.root),
    queue.enqueue(live.entity, live.root),
  ];
  await Promise.all(completions);
  assert.deepEqual(compileCalls.filter((id) => id !== 9).sort(), [4, 5],
    'both urgent entries collect into one deadline pass while alive');
  assert.deepEqual([...readied].sort((a, b) => a - b), [5, 9],
    'only live roots are readied — the evicted one is skipped after uploads land');
});

test('both residency evict paths count on-glass disposals and publish the gauges', () => {
  const renderer = readFileSync(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const calls = renderer.match(/noteOnGlassResidencyEviction\(state, \w+\)/g) || [];
  assert.ok(calls.length >= 2,
    'reconcileMeshes and reconcileMeshResidency must both count on-glass evictions');
  assert.match(renderer, /onGlassDisposals = \(renderState\.onGlassDisposals \| 0\) \+ 1/);
  assert.match(renderer,
    /function noteOnGlassResidencyEviction[\s\S]{0,500}firstPlayableFrameAt/,
    'the counter must gate on the live screen — a route transition carries a stale '
    + 'camera focus and legitimately evicts off-screen roots');
  assert.match(renderer, /diagnostics\.onGlassDisposals/);
  assert.match(renderer, /diagnostics\.onGlassPendingMaxS/,
    'the on-glass pending gauge must reach entityViewSync for live probes');
  assert.doesNotMatch(renderer, /compileObjectPipelinesBatch/,
    'no batched deadline compile may stay wired: it detaches live roots into a '
    + 'staging group and holds every pipelinesPending latch for the slowest link');
  const sources = readFileSync(new URL('../src/world/presentationSources.js', import.meta.url), 'utf8');
  assert.match(sources, /tableLookAtOrigin\(state, player\.pos/,
    'the ledger collect disc must measure from the keep-radius origin');
});
