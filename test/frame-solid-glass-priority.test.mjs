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
import {
  compilePipelineSubject,
  hoistDeadlineGlassMeshBuilds,
  preparePipelineSubjectResidency,
  promoteOnGlassPipelineLatch,
  render,
} from '../src/render/renderer.js';
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

test('pipeline latch promotion: a measured on-glass pending root re-fires urgent and folds its queued ambient admission', async () => {
  // D38 — asteroid 30 sat 14 frames hidden behind `pipelinesPending` on R0_GLASS: its compile
  // was queued ambient before the rock crossed the glass, and no lane re-graded it. The submit
  // pass now re-fires the latched root at the deadline class; the tracker folds the still-queued
  // ambient entry into the urgent run so both latches settle on one link.
  const { tracker, order, resumed, gates } = makeTracker();
  tracker.resumeAutoFlush();

  const mesh = { userData: { pipelinesPending: true }, name: 'asteroid-30' };
  const owner = {
    state: {
      render: {
        compileObjectPipelines: (subject, options) => tracker.compile(subject, options),
      },
    },
  };

  // Ambient admission queued while the rock was still off-glass.
  const ambient = tracker.compile(mesh);
  assert.equal(tracker.queuedCount, 1);

  // The submit pass measures the latch on the live glass and promotes it.
  assert.equal(promoteOnGlassPipelineLatch(owner, mesh), true);
  assert.equal(tracker.queuedCount, 0,
    'the still-queued ambient entry folds into the urgent run instead of waiting FIFO');

  await Promise.resolve();
  assert.equal(gates.length, 1, 'one link serves both the ambient latch and the promotion');
  assert.deepEqual(order[0].subjects, [mesh]);

  // A second promote while the urgent run is outstanding joins it — no duplicate link.
  assert.equal(promoteOnGlassPipelineLatch(owner, mesh), true);
  assert.equal(gates.length, 1, 'the outstanding urgent run is joined, never duplicated');
  assert.equal(resumed.length, 1, 'the ambient beat stays armed but has nothing left');

  gates[0].resolve({ compiled: 'urgent' });
  assert.deepEqual(await ambient, { compiled: 'urgent' });
});

test('pipeline latch promotion: only a latched root re-fires, and only through a live compile port', () => {
  const calls = [];
  const owner = {
    state: {
      render: {
        compileObjectPipelines: (subject, options) => {
          calls.push({ subject, options });
          return Promise.resolve({ skipped: false });
        },
      },
    },
  };
  const latched = { userData: { pipelinesPending: true } };
  assert.equal(promoteOnGlassPipelineLatch(owner, latched), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.urgent, true,
    'the caller measured the glass — urgency is explicit, not re-derived');
  assert.equal(calls[0].options.joinOutstanding, true,
    'an outstanding urgent admission is joined, not recompiled');

  const unlatched = { userData: {} };
  assert.equal(promoteOnGlassPipelineLatch(owner, unlatched), false,
    'a root with no pending latch never queues a promotion admission');
  assert.equal(calls.length, 1);

  assert.equal(promoteOnGlassPipelineLatch({ state: { render: {} } }, latched), false,
    'no compile port means no promotion (pre-setup render state)');
  assert.equal(calls.length, 1);

  const throwing = {
    state: {
      render: {
        compileObjectPipelines: () => { throw new Error('stale owner'); },
      },
    },
  };
  assert.equal(promoteOnGlassPipelineLatch(throwing, latched), false,
    'a refused promotion reports false and retries next frame instead of throwing in the submit walk');
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
  // The return is the deadline-glass work count in the tail (callers gate a refused
  // late-present drain on "does glass work exist", not "did the partition permute").
  assert.equal(hoistDeadlineGlassMeshBuilds(owner), 2);
  assert.deepEqual(owner._meshBuildQueue, [g1, g2, 'a1', 'a2', 'a3'],
    'on-glass ids drain ahead of the whole off-glass backlog');
  assert.equal(hoistDeadlineGlassMeshBuilds(owner), 2,
    'an already-partitioned tail still reports its queued glass work');

  // Entries before the queue head are never touched.
  const done = mk('done', R3);
  const g3 = mk('g3', R0);
  mk('a4', R3);
  const owner2 = {
    state,
    _meshBuildQueue: [done, 'a4', g3],
    _meshBuildQueueHead: 1,
  };
  assert.equal(hoistDeadlineGlassMeshBuilds(owner2), 1);
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

test('live mesh builds send on-glass pipelines to the urgent lane and discard stale render callbacks', async () => {
  const frames = [];
  const priorRaf = globalThis.requestAnimationFrame;
  const priorScheduler = globalThis.scheduler;
  globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  globalThis.scheduler = { postTask: (callback) => Promise.resolve().then(callback) };
  try {
    const calls = [];
    const state = {
      mode: 'flight', simTime: 10, entities: new Map(), entityList: [],
      render: {
        firstPlayableFrameAt: 1, lastPresentDtMs: 0,
        compileObjectPipelines: (root, options) => { calls.push({ root, options }); },
      },
    };
    const makeOwner = (id) => {
      const entity = { id, type: 'wreck', alive: true, pos: { x: 5000, z: 5000 }, rot: 0,
        radius: 20, data: {}, activity: { presentationTier: R0 } };
      state.entities.set(id, entity);
      return {
        state, scene: new THREE.Scene(), _initialMeshReconcileComplete: true,
        _meshBuildLateSkips: 0, _meshBuildQueue: [id], _meshBuildQueueHead: 0,
        _meshBuildQueuedIds: new Set([id]), _meshes: new Map(), _meshesVersion: 0,
        vf: { build: () => new THREE.Group() }, _bindPresentationMesh() {},
        _frameMembrane: { toLocal: (pos, out) => Object.assign(out, pos) },
      };
    };
    const owner = makeOwner('glass');
    assert.equal(render._drainMeshBuildQueue.call(owner, 1), 1);
    assert.equal(calls.length, 0, 'pipeline work waits until after the displayed frame');
    frames.shift()(0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options?.urgent, true,
      'a body already on camera must not wait behind ambient pipeline admissions');

    const staleOwner = makeOwner('stale');
    assert.equal(render._drainMeshBuildQueue.call(staleOwner, 1), 1);
    state.render = { ...state.render, compileObjectPipelines: () => assert.fail('stale build reached a replacement renderer') };
    frames.shift()(0);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls.length, 1);
  } finally {
    if (priorRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = priorRaf;
    if (priorScheduler === undefined) delete globalThis.scheduler;
    else globalThis.scheduler = priorScheduler;
  }
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
    const ambientCompileOptions = compileCalls.at(-1).options;
    assert.notEqual(ambientCompileOptions && ambientCompileOptions.urgent, true,
      'an off-glass boundary keeps the ambient lane');
    assert.equal(typeof ambientCompileOptions.isActive, 'function',
      'an off-glass boundary compile still carries the owner lifetime guard');
    assert.equal(ambientCompileOptions.isActive(ambientBoundary), true,
      'the lifetime guard answers true while its render owner is live');
    await ambientOptions.prepareAuthoredGpuResidency(ambientBoundary, { isResidencyOwnerActive: () => true });
    assert.equal(residencyCalls.at(-1).options.unSliced, false,
      'an off-glass boundary keeps the sliced ambient residency chain');
    runtimeState.render = {};
    assert.equal(ambientCompileOptions.isActive(ambientBoundary), false,
      'the lifetime guard answers false once its captured render owner is stale');
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('authored GPU gate reports its sub-phase timings without changing admission results', async () => {
  // The D38 residual is the job's own GPU gate (pipeline phase 100% of one measured ship job,
  // 2026-09-25/26 probes). The per-stage instrument must name where that gate's time goes —
  // policies/compile/residency — and must leave the admission outcome and hook sequence intact.
  const root = new THREE.Group();
  root.add(new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial(),
  ));
  const hooks = [];
  const options = {
    prepareAuthoredPipelines: async (subject) => {
      hooks.push('compile');
      assert.equal(subject, root);
      await new Promise((resolve) => setTimeout(resolve, 8));
      return { skipped: false, programs: 3 };
    },
    prepareAuthoredGpuResidency: async (subject) => {
      hooks.push('residency');
      assert.equal(subject, root);
      return { skipped: false, uploads: 2 };
    },
  };

  const result = await partsLibrary.prepareAuthoredVisualPipelines(root, options);
  assert.deepEqual(hooks, ['compile', 'residency'],
    'the gate compiles before it uploads');
  assert.equal(result.skipped, false);
  assert.equal(result.pipelines.programs, 3, 'the compile outcome rides through unchanged');
  assert.equal(result.gpuResidency.uploads, 2, 'the residency outcome rides through unchanged');
  for (const key of ['policiesMs', 'compileMs', 'residencyMs']) {
    assert.equal(typeof result[key], 'number', `${key} is reported`);
    assert.ok(result[key] >= 0, `${key} is non-negative`);
  }
  assert.ok(result.compileMs > 0, 'a awaited compile hook reports nonzero compile time');

  // No hooks (preview/test harness): still skipped, no timing surface promised.
  const skipped = await partsLibrary.prepareAuthoredVisualPipelines(root, {});
  assert.equal(skipped.skipped, true);
});

test('pipeline residency: the first chained prepare forwards urgency and joins pending work', async () => {
  const prepared = [];
  const pending = new Map();
  const tracker = {
    pendingFor(subject) {
      return pending.get(subject) || null;
    },
    prepare(subject, options) {
      prepared.push({ subject, options });
      const gate = Promise.resolve(options);
      pending.set(subject, gate);
      return gate;
    },
  };
  const subject = { name: 'residency-subject' };
  let live = true;
  const admissionOptions = { isActive: (s) => live === true && s === subject };

  const urgentPromise = preparePipelineSubjectResidency(tracker, subject, admissionOptions, true);
  assert.equal(prepared.length, 1, 'no pending entry means one real prepare call');
  assert.equal(prepared[0].options.unSliced, true,
    'urgent residency rides the unSliced upload lane');
  assert.equal(typeof prepared[0].options.isActive, 'function',
    'the lifetime guard stays callable');
  assert.equal(prepared[0].options.isActive(subject), true,
    'the live owner is active');
  live = false;
  assert.equal(prepared[0].options.isActive(subject), false,
    'a stale owner is rejected by the same guard');
  await urgentPromise;

  const ambientSubject = { name: 'ambient-subject' };
  await preparePipelineSubjectResidency(tracker, ambientSubject, {}, false);
  assert.equal(prepared.length, 2);
  assert.equal(prepared[1].options.unSliced, false,
    'ambient residency stays on the sliced upload lane');
  assert.equal(prepared[1].options.isActive, undefined,
    'no lifetime guard forwards as undefined');

  const held = { name: 'held-subject' };
  const shared = Promise.resolve('joined');
  pending.set(held, shared);
  const joined = preparePipelineSubjectResidency(tracker, held, { isActive: () => true }, true);
  assert.equal(joined, shared, 'a pending entry is joined, not re-prepared');
  assert.equal(prepared.length, 2, 'joining never calls prepare twice');
});

test('an urgent pipeline admission reaches the batch as a lone urgent subject', async () => {
  const batches = [];
  const tracker = createPipelineAdmissionTracker((subjects, options) => {
    batches.push({ count: subjects.length, urgent: options && options.urgent === true });
    return Promise.resolve({ ok: true });
  }, { quietMs: 0, maxWaitMs: 10 });

  await tracker.compile({ name: 'on-glass' }, { urgent: true });
  assert.equal(batches.length, 1);
  assert.equal(batches[0].count, 1,
    'urgent admission serializes as a single-subject batch — the whole-root branch applies');
  assert.equal(batches[0].urgent, true, 'the urgent flag reaches the compile batch');

  await Promise.all([tracker.compile({ name: 'a' }), tracker.compile({ name: 'b' })]);
  const ambient = batches.slice(1);
  assert.equal(ambient.length, 1, 'ambient compiles still coalesce into one batch');
  assert.equal(ambient[0].count, 2);
  assert.equal(ambient[0].urgent, false,
    'ambient batches carry no urgent flag — they keep the sliced lane');
});

test('pipeline admission selection: an on-glass explicit admission rides the urgent lane', async () => {
  const { tracker, order, resumed, gates } = makeTracker();
  tracker.resumeAutoFlush();

  const ambient = { name: 'ambient' };
  const glass = { name: 'on-glass-explicit' };
  const cA = tracker.compile(ambient);
  assert.equal(tracker.queuedCount, 1);

  const guard = (subject) => subject === glass;
  const options = { explicit: true, skipSharedBatch: true, isActive: guard };
  const cG = compilePipelineSubject(tracker, glass, options, true);
  await Promise.resolve();

  assert.equal(gates.length, 1, 'the urgent link is invoked immediately on the tail');
  assert.deepEqual(order[0].subjects, [glass],
    'urgent outranks explicit: the subject serializes alone instead of folding the ambient queue');
  assert.equal(order[0].options.urgent, true);
  assert.equal(order[0].options.explicit, true,
    'caller-supplied fields survive the urgent wrap');
  assert.equal(order[0].options.skipSharedBatch, true);
  assert.equal(order[0].options.isActive, guard,
    'the lifetime guard forwards verbatim');
  assert.equal(tracker.queuedCount, 1, 'ambient work is untouched by the urgent link');

  gates[0].resolve({ urgent: true });
  assert.deepEqual(await cG, { urgent: true });

  const beat = resumed.shift();
  assert.equal(typeof beat, 'function', 'the ambient batch still needs its own scheduled beat');
  beat();
  await Promise.resolve();
  assert.equal(gates.length, 2);
  gates[1].resolve({ ok: true });
  await cA;
});

test('pipeline admission selection: off-glass explicit and ambient keep their lanes', async () => {
  const { tracker, order, gates } = makeTracker();
  tracker.resumeAutoFlush();

  const ambient = { name: 'ambient' };
  const explicitSubject = { name: 'off-glass-explicit' };
  const cA = tracker.compile(ambient);
  assert.equal(tracker.queuedCount, 1);

  const options = { explicit: true, skipSharedBatch: true, isActive: () => true };
  const cE = compilePipelineSubject(tracker, explicitSubject, options, false);
  await Promise.resolve();
  assert.equal(gates.length, 1,
    'an off-glass explicit admission folds the queued ambient set into its own link');
  assert.deepEqual(order[0].subjects, [explicitSubject, ambient]);
  gates[0].resolve({ folded: true });
  assert.deepEqual(await cE, { folded: true });
  assert.deepEqual(await cA, { folded: true });

  const calls = [];
  const mock = {
    compile(subject, opts) { calls.push({ method: 'compile', opts }); return Promise.resolve(); },
    compileExplicit(subject, opts) { calls.push({ method: 'compileExplicit', opts }); return Promise.resolve(); },
  };
  const ambientOptions = { isActive: () => true };
  compilePipelineSubject(mock, ambient, ambientOptions, false);
  assert.equal(calls[0].method, 'compile', 'ambient stays on the plain compile lane');
  assert.strictEqual(calls[0].opts, ambientOptions,
    'ambient admission forwards the same options object');

  const explicitOptions = { explicit: true, isActive: () => true };
  compilePipelineSubject(mock, explicitSubject, explicitOptions, false);
  assert.equal(calls[1].method, 'compileExplicit',
    'a non-urgent explicit admission keeps the fold lane');
  assert.strictEqual(calls[1].opts, explicitOptions);

  const urgentOptions = { explicit: true, isActive: () => true };
  compilePipelineSubject(mock, explicitSubject, urgentOptions, true);
  assert.equal(calls[2].method, 'compile', 'urgent wins over explicit');
  assert.equal(calls[2].opts.urgent, true);
  assert.equal(calls[2].opts.explicit, true);
  assert.notStrictEqual(calls[2].opts, urgentOptions,
    'the urgent wrap copies rather than mutating the caller options');
});
