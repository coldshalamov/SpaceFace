// D38 — "first arrival of a body can sit on screen undrawn while it loads/links
// shaders". The solid-world contract means a body on the readable glass must
// not wait behind off-glass runway/prefetch work. These fixtures pin the
// ordering law on each queue in the arrival chain:
//
//   1. pipelineAdmissions (compileObjectPipelines / ambient compile FIFO):
//      an urgent (on-glass) subject serializes on the shared compile tail
//      ahead of everything still queued.
//   2. _meshBuildQueue: a body that crossed the glass inside the enqueue poll
//      window is hoisted to the head of the pending tail once per drain.
//   3. authored upgrade queue: an entity whose activity tier is R0_GLASS is
//      admitted ahead of targets, off-glass hostiles and ambient dressing.
//   4. residencyOptionsForBoundary: an on-glass boundary marks its pipeline
//      admission urgent and its GPU residency un-sliced (the urgent chain).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createPipelineAdmissionTracker } from '../src/render/pipelineReadiness.js';
import { hoistDeadlineGlassMeshBuilds, render } from '../src/render/renderer.js';
import * as partsLibrary from '../src/render/partsLibrary.js';
import { PRESENTATION_TIER } from '../src/world/activityClassification.js';

const R0 = PRESENTATION_TIER.R0_GLASS;
const R1 = PRESENTATION_TIER.R1_RUNWAY;
const R3 = PRESENTATION_TIER.R3_UNLOADED;

function makeTracker() {
  const order = [];
  const resumed = [];
  const gates = [];
  const tracker = createPipelineAdmissionTracker(
    (subjects, compileOptions) => {
      order.push({ subjects: [...subjects], options: compileOptions });
      const gate = { resolve: null };
      gate.promise = new Promise((resolve) => { gate.resolve = resolve; });
      gates.push(gate);
      return gate.promise;
    },
    {
      // Bounded-resume lane (post-opening steady flight): every ambient drain
      // goes through a scheduled callback the test drives by hand.
      scheduleResume: (callback) => { resumed.push(callback); return resumed.length; },
      getLastPresentDtMs: () => 0,
    },
  );
  return { tracker, order, resumed, gates };
}

test('pipeline admission: an on-glass (urgent) compile is serviced before queued off-glass work', async () => {
  const { tracker, order, resumed, gates } = makeTracker();
  tracker.resumeAutoFlush();

  const a = { name: 'ambient-a' };
  const b = { name: 'ambient-b' };
  const c = { name: 'ambient-c' };
  const glass = { name: 'on-glass-arrival' };

  // Three off-glass compiles occupy the ambient queue; none has run.
  const cA = tracker.compile(a);
  const cB = tracker.compile(b);
  const cC = tracker.compile(c);
  assert.equal(tracker.queuedCount, 3);
  assert.equal(resumed.length, 1, 'one bounded resume beat is armed');

  // The first arrival reaches the readable glass while the backlog is queued.
  const cG = tracker.compile(glass, { urgent: true });
  await Promise.resolve();
  assert.equal(gates.length, 1, 'the urgent link is invoked immediately on the tail');
  assert.deepEqual(order[0].subjects, [glass], 'the on-glass subject runs first');
  assert.equal(order[0].options.skipSharedBatch, true,
    'deadline compiles poll their own programs instead of pooling into a foreign batch drain');
  assert.equal(tracker.queuedCount, 3, 'the ambient backlog is untouched by the urgent link');

  gates[0].resolve({ urgent: true });
  const result = await cG;
  assert.deepEqual(result, { urgent: true });

  // The ambient backlog still drains in FIFO order, one batch per resume beat.
  for (const completion of [cA, cB, cC]) {
    const beat = resumed.shift();
    assert.equal(typeof beat, 'function', 'each ambient batch needs its own scheduled beat');
    const gatesBefore = gates.length;
    beat();
    // The batch is invoked on a compileTail microtask — let it land, then
    // release the driver-side link for this beat's gate.
    await Promise.resolve();
    assert.equal(gates.length, gatesBefore + 1);
    gates[gates.length - 1].resolve({ ok: true });
    await completion;
  }
  assert.deepEqual(order.map((call) => call.subjects.map((s) => s.name)),
    [['on-glass-arrival'], ['ambient-a'], ['ambient-b'], ['ambient-c']]);
  assert.equal(tracker.queuedCount, 0);
});

test('pipeline admission: urgent re-request folds a queued ambient admission of the same subject', async () => {
  const { tracker, order, resumed, gates } = makeTracker();
  tracker.resumeAutoFlush();

  const subject = { name: 'crossed-the-glass' };
  const ambient = tracker.compile(subject);
  assert.equal(tracker.queuedCount, 1);

  // The subject crossed the glass while its ambient compile still waited: the
  // urgent request folds it forward — one compile, both latches settle.
  const urgent = tracker.compile(subject, { urgent: true });
  assert.notStrictEqual(urgent, ambient);
  assert.equal(tracker.queuedCount, 0, 'the queued ambient entry folded into the urgent run');

  await Promise.resolve();
  assert.equal(gates.length, 1);
  assert.deepEqual(order[0].subjects, [subject]);
  gates[0].resolve({ compiled: 'urgent' });
  assert.deepEqual(await ambient, { compiled: 'urgent' });
  assert.deepEqual(await urgent, { compiled: 'urgent' });
  assert.equal(resumed.length, 1, 'the armed ambient beat stays armed but has nothing left');
});

test('pipeline admission: urgent compiles join an in-flight or already-urgent admission, never duplicate', async () => {
  const { tracker, order, resumed, gates } = makeTracker();
  tracker.resumeAutoFlush();

  const subject = { name: 'in-flight' };
  const ambient = tracker.compile(subject);
  resumed.shift()(); // first bounded beat hands the subject to compileBatch — it stays in-flight on the gate
  await Promise.resolve();
  assert.equal(tracker.queuedCount, 0);

  const joined = tracker.compile(subject, { urgent: true });
  assert.strictEqual(joined, ambient, 'a flushed in-flight admission is joined, not recompiled');
  assert.equal(gates.length, 1, 'no duplicate compileBatch invocation');
  gates[0].resolve({ joined: true });
  await ambient;

  const again = { name: 'again' };
  const u1 = tracker.compile(again, { urgent: true });
  const u2 = tracker.compile(again, { urgent: true });
  assert.strictEqual(u1, u2, 'a second urgent request joins the outstanding urgent link');
  await Promise.resolve();
  assert.equal(gates.length, 2);
  assert.deepEqual(order[1].subjects, [again]);
  gates[1].resolve({});
  await u1;
});

test('mesh-build drain hoists a body that reached the glass behind FIFO backlog', () => {
  const state = { entities: new Map() };
  const mk = (id, tier) => {
    const entity = { id, alive: true };
    if (tier) entity.activity = { presentationTier: tier };
    state.entities.set(id, entity);
    return id;
  };
  // Stable partition: all deadline-glass ids move ahead of the ambient tail,
  // preserving their relative order.
  const stateMulti = { entities: new Map() };
  const mkMulti = (id, tier) => {
    const entity = { id, alive: true };
    if (tier) entity.activity = { presentationTier: tier };
    stateMulti.entities.set(id, entity);
    return id;
  };
  const g1 = mkMulti('g1', R0);
  const g2 = mkMulti('g2', R0);
  mkMulti('a1', R3); mkMulti('a2', R1); mkMulti('a3', R3);
  const owner = {
    state: stateMulti,
    _meshBuildQueue: ['a1', g1, 'a2', g2, 'a3'],
    _meshBuildQueueHead: 0,
  };
  assert.equal(hoistDeadlineGlassMeshBuilds(owner), true);
  assert.deepEqual(owner._meshBuildQueue, [g1, g2, 'a1', 'a2', 'a3'],
    'on-glass ids drain ahead of the whole off-glass backlog');
  assert.equal(hoistDeadlineGlassMeshBuilds(owner), false,
    'an already-partitioned tail reports nothing to hoist');

  // Entries before the queue head are never touched.
  const done = mk('done', R3);
  const g3 = mk('g3', R0);
  mk('a4', R3);
  const owner2 = {
    state,
    _meshBuildQueue: [done, 'a4', g3],
    _meshBuildQueueHead: 1,
  };
  assert.equal(hoistDeadlineGlassMeshBuilds(owner2), true);
  assert.deepEqual(owner2._meshBuildQueue, [done, g3, 'a4'],
    'consumed history stays ahead of the drain head');
});

test('mesh-build drain admits a hoisted on-glass body inside a refused late-present start', () => {
  // The D38 tail case on a contended host: every present is late, so the
  // heavy-admission throttle refuses a start for ~8 beats. Ambient backlog is
  // right to wait; a body already on the glass is a hole in the picture and
  // must still build.
  const scene = new THREE.Scene();
  const state = {
    mode: 'flight',
    simTime: 10,
    entities: new Map(),
    entityList: [],
    render: { lastPresentDtMs: 300 },
  };
  const mk = (id, tier) => {
    const entity = {
      id, type: 'wreck', alive: true,
      pos: { x: 5000, z: 5000 }, rot: 0, radius: 20, data: {},
    };
    if (tier) entity.activity = { presentationTier: tier };
    state.entities.set(id, entity);
    return id;
  };
  const built = [];
  const makeOwner = (queue) => ({
    state,
    _initialMeshReconcileComplete: true,
    _meshBuildLateSkips: 0,
    _meshBuildQueue: queue.slice(),
    _meshBuildQueueHead: 0,
    _meshBuildQueuedIds: new Set(queue),
    _meshes: new Map(),
    _meshesVersion: 0,
    vf: {
      build: (entity) => {
        built.push(entity.id);
        const root = new THREE.Group();
        root.userData.presentationEntityId = entity.id;
        return root;
      },
    },
    _frameMembrane: { toLocal: (pos, out) => { out.x = pos ? pos.x : 0; out.z = pos ? pos.z : 0; return out; } },
    scene,
    _bindPresentationMesh() {},
  });

  mk('ambient-1', R1);
  mk('ambient-2', R1);
  const ambientOnly = makeOwner(['ambient-1', 'ambient-2']);
  assert.equal(render._drainMeshBuildQueue.call(ambientOnly, 4), 0,
    'a refused late-present start parks ambient work untouched');
  assert.deepEqual(built, []);

  // An on-glass body buried behind the same backlog is hoisted and built
  // inside this drain; the ambient tail keeps waiting for a healthier frame.
  mk('glass-arrival', R0);
  const withGlass = makeOwner(['ambient-1', 'ambient-2', 'glass-arrival']);
  assert.equal(render._drainMeshBuildQueue.call(withGlass, 4), 1,
    'the refused start still admits the on-glass hole');
  assert.deepEqual(built, ['glass-arrival']);
  assert.deepEqual(
    withGlass._meshBuildQueue.slice(withGlass._meshBuildQueueHead),
    ['ambient-1', 'ambient-2'],
    'ambient backlog stays queued behind the hoisted glass build',
  );
});

test('authored upgrade queue: an R0_GLASS owner is admitted ahead of target, hostile and ambient work', async () => {
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
    const player = { id: 'player', team: 0, alive: true };
    const runtimeState = {
      mode: 'flight',
      playerId: player.id,
      player: { targetId: 'selected' },
      entities: new Map([[player.id, player]]),
      entityList: [player],
      settings: { video: {} },
      render: {},
    };
    globalThis.window = { SF: { state: runtimeState } };

    const enqueue = ({ id, team = 0, tier = null }) => {
      const boundary = new THREE.Group();
      // The D38 shape: the authored boundary exists but is undrawn — admission
      // substrate holds it hidden, so the tier is the only on-glass signal.
      boundary.visible = false;
      boundary.userData.authoredAssetState = 'loading';
      scene.add(boundary);
      const entity = { id, type: 'ship', team, alive: true, mesh: boundary, data: { defId: 'ship_wasp' } };
      if (tier) entity.activity = { presentationTier: tier };
      runtimeState.entities.set(id, entity);
      partsLibrary.enqueueBoundaryUpgrade(scene, {
        boundary,
        entity,
        assetUrls: [`assets/${id}.glb`],
        run: () => new Promise((resolve) => {
          starts.push(id);
          inFlight++;
          releases.set(id, () => {
            boundary.userData.authoredAssetState = 'authored';
            inFlight--;
            resolve();
          });
        }),
      });
    };

    // Queued together, worst case first: the on-glass body enqueues LAST.
    enqueue({ id: 'ambient-dressing' });
    enqueue({ id: 'runway-body', tier: R1 });
    enqueue({ id: 'selected' });          // locked target, off-glass
    enqueue({ id: 'hostile', team: 1 });  // off-glass hostile
    enqueue({ id: 'on-glass-arrival', tier: R0 });

    const runNextFrame = async () => {
      const callback = scheduledFrames.shift();
      assert.equal(typeof callback, 'function', 'the queue schedules its next admission frame');
      callback(0);
      await new Promise((resolve) => setImmediate(resolve));
    };

    const expectedOrder = ['on-glass-arrival', 'selected', 'hostile', 'ambient-dressing', 'runway-body'];
    for (let i = 0; i < expectedOrder.length; i++) {
      await runNextFrame();
      const inFlightId = starts[starts.length - 1];
      assert.equal(inFlightId, expectedOrder[i],
        `admission ${i} must be ${expectedOrder[i]}`);
      releases.get(inFlightId)();
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(starts, expectedOrder);
  } finally {
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('authored upgrade queue: an R0_GLASS owner is admitted through a refused late-present gate', async () => {
  // Same escape the mesh-build drain uses: when every present is late the
  // heavy-admission throttle parks ambient dressing for ~8 beats, but a body
  // on the readable glass is a hole — its admission may not wait the throttle
  // out.
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
    const player = { id: 'player', team: 0, alive: true };
    const runtimeState = {
      mode: 'flight',
      playerId: player.id,
      entities: new Map([[player.id, player]]),
      entityList: [player],
      settings: { video: {} },
      render: { lastPresentDtMs: 300 },
    };
    globalThis.window = { SF: { state: runtimeState } };

    const enqueue = ({ id, tier = null }) => {
      const boundary = new THREE.Group();
      boundary.visible = false;
      boundary.userData.authoredAssetState = 'loading';
      scene.add(boundary);
      const entity = { id, type: 'ship', team: 0, alive: true, mesh: boundary, data: { defId: 'ship_wasp' } };
      if (tier) entity.activity = { presentationTier: tier };
      runtimeState.entities.set(id, entity);
      partsLibrary.enqueueBoundaryUpgrade(scene, {
        boundary,
        entity,
        assetUrls: [`assets/${id}.glb`],
        run: () => new Promise((resolve) => {
          starts.push(id);
          releases.set(id, () => resolve());
        }),
      });
    };

    enqueue({ id: 'ambient-dressing' });
    enqueue({ id: 'on-glass-arrival', tier: R0 });

    const runNextFrame = async () => {
      const callback = scheduledFrames.shift();
      assert.equal(typeof callback, 'function', 'the queue schedules its next admission frame');
      callback(0);
      await new Promise((resolve) => setImmediate(resolve));
    };

    // Beat one: the gate refuses, but a queued R0 owner overrides it.
    await runNextFrame();
    assert.deepEqual(starts, ['on-glass-arrival'],
      'the on-glass job is admitted inside the refused start');

    // The queue is serial — release the in-flight job so the next beat arms.
    releases.get('on-glass-arrival')();
    await new Promise((resolve) => setImmediate(resolve));

    // Beat two: nothing on the glass remains queued, so the ambient job waits
    // the throttle out instead of draining behind the priority work.
    await runNextFrame();
    assert.deepEqual(starts, ['on-glass-arrival'],
      'ambient dressing still waits while presents stay late');
  } finally {
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('residencyOptionsForBoundary marks an on-glass boundary urgent on compile and residency', async () => {
  const previousWindow = globalThis.window;
  const glassEntity = {
    id: 'glass-ship', type: 'ship', alive: true,
    activity: { presentationTier: R0 }, data: {},
  };
  const ambientEntity = {
    id: 'ambient-ship', type: 'ship', alive: true,
    activity: { presentationTier: R3 }, data: {},
  };
  const compileCalls = [];
  const residencyCalls = [];
  const runtimeState = {
    mode: 'flight',
    entities: new Map([[glassEntity.id, glassEntity], [ambientEntity.id, ambientEntity]]),
    render: {
      compileObjectPipelines: (root, options) => {
        compileCalls.push({ root, options });
        return Promise.resolve({ skipped: false });
      },
      prepareAuthoredGpuResidency: (root, options) => {
        residencyCalls.push({ root, options });
        return Promise.resolve({ skipped: false });
      },
    },
  };
  globalThis.window = { SF: { state: runtimeState } };

  try {
    const glassBoundary = new THREE.Group();
    glassBoundary.userData.presentationEntityId = glassEntity.id;
    const glassOptions = partsLibrary.residencyOptionsForBoundary(glassEntity, glassBoundary, {});
    assert.equal(typeof glassOptions.prepareAuthoredPipelines, 'function');
    await glassOptions.prepareAuthoredPipelines(glassBoundary);
    assert.equal(compileCalls.at(-1).options && compileCalls.at(-1).options.urgent, true,
      'an on-glass boundary requests the urgent compile lane');
    await glassOptions.prepareAuthoredGpuResidency(glassBoundary, { isResidencyOwnerActive: () => true });
    assert.equal(residencyCalls.at(-1).options.unSliced, true,
      'an on-glass boundary uploads on the urgent (un-sliced) residency chain');

    const ambientBoundary = new THREE.Group();
    ambientBoundary.userData.presentationEntityId = ambientEntity.id;
    const ambientOptions = partsLibrary.residencyOptionsForBoundary(ambientEntity, ambientBoundary, {});
    await ambientOptions.prepareAuthoredPipelines(ambientBoundary);
    assert.equal(compileCalls.at(-1).options, undefined,
      'an off-glass boundary keeps the ambient lane');
    await ambientOptions.prepareAuthoredGpuResidency(ambientBoundary, { isResidencyOwnerActive: () => true });
    assert.equal(residencyCalls.at(-1).options.unSliced, false,
      'an off-glass boundary keeps the sliced ambient residency chain');
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});
