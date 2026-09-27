// ZERO_TO_HERO 7.3 - the belt tail. After the results-to-belt bridge the ~8 bodies the
// opening frame showed still compiled at 10-20 s on a busy host: the sector was loading, so
// the flight-only rungs never applied and the arrival distance grade (distance to the player)
// was the only ordering left. On a composed arrival the camera opens toward the belt while the
// staged furniture clings to the player's wake - so near-graded dressing behind the player
// buried the visible set that was graded farther. The law (ZERO_TO_HERO 5.12): what the
// opening frame shows admits first.
//
//   1. load window (the post-bridge sector): shown bodies dequeue before nearer-graded
//      off-frame furniture - proven against the composed camera, not the flight rungs.
//   2. fail closed: with no composed camera the arrival distance grades survive untouched.
//   3. flight window: a shown body still outranks a locked target off the glass.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import * as partsLibrary from '../src/render/partsLibrary.js';

function beltArrivalRuntimeState({ mode = 'loading', composedCamera = true } = {}) {
  const player = { id: 'player', team: 0, alive: true, pos: { x: 0, z: 0 } };
  return {
    mode,
    playerId: player.id,
    player: { targetId: null },
    entities: new Map([[player.id, player]]),
    entityList: [player],
    settings: { video: {} },
    world: { frameOrigin: { x: 0, z: 0 }, currentSectorId: 'sector_ceres_belt' },
    // The composed arrival: the camera opens toward the belt while the player's wake
    // (and its staged furniture) sits behind. Zoom ~380 composes glass about
    // +/-431 x +/-280 WU around the look-at.
    camera: composedCamera
      ? {
        liveZoom: 380,
        composedZoom: 380,
        fov: 50,
        aspect: 16 / 9,
        tilt: 60,
        focus: { x: 400, z: 0 },
      }
      : { zoom: 380, fov: 50, aspect: 16 / 9, tilt: 60, focus: { x: 400, z: 0 } },
    render: {},
  };
}

function makeHarness(runtimeState) {
  const scheduledFrames = [];
  const previousRaf = globalThis.requestAnimationFrame;
  const previousWindow = globalThis.window;
  globalThis.requestAnimationFrame = (callback) => {
    scheduledFrames.push(callback);
    return scheduledFrames.length;
  };
  globalThis.window = { SF: { state: runtimeState } };
  const scene = new THREE.Scene();
  const starts = [];
  const releases = new Map();
  const enqueue = ({ id, type = 'ship', team = 0, pos, options = undefined }) => {
    const boundary = new THREE.Group();
    boundary.visible = false;
    boundary.userData.authoredAssetState = 'loading';
    scene.add(boundary);
    const entity = {
      id,
      type,
      team,
      alive: true,
      pos,
      mesh: boundary,
      data: type === 'ship' ? { defId: 'ship_wasp' } : {},
    };
    runtimeState.entities.set(id, entity);
    partsLibrary.enqueueBoundaryUpgrade(scene, {
      boundary,
      entity,
      assetUrls: [`assets/${id}.glb`],
      options,
      run: () => new Promise((resolve) => {
        starts.push(id);
        releases.set(id, () => resolve());
      }),
    });
  };
  const runNextFrame = async () => {
    const callback = scheduledFrames.shift();
    assert.equal(typeof callback, 'function', 'the queue schedules its next admission frame');
    callback(0);
    await new Promise((resolve) => setImmediate(resolve));
  };
  const cleanup = () => {
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  };
  return { scene, starts, releases, enqueue, runNextFrame, cleanup };
}

const ARRIVAL_BODY = { sectorArrivalBody: true };

test('the bodies the opening frame shows admit first during the post-bridge load', async () => {
  const runtimeState = beltArrivalRuntimeState({ mode: 'loading' });
  const harness = makeHarness(runtimeState);
  try {
    // Worst case first: every staged job enqueues before the visible set. The furniture
    // clings to the player's wake and grades near on the arrival ramp (distance to the
    // player), while the bodies the opening frame shows sit ahead of the camera lead and
    // grade farther - without the opening-frame rung the picture waits for dressing that
    // is not even in frame.
    harness.enqueue({ id: 'dock-furniture-a', type: 'place', pos: { x: -350, z: 0 }, options: ARRIVAL_BODY });
    harness.enqueue({ id: 'dock-furniture-b', type: 'station', pos: { x: -200, z: 0 }, options: ARRIVAL_BODY });
    harness.enqueue({ id: 'ambient-filler', type: 'fx', pos: { x: -1000, z: 0 } });
    harness.enqueue({ id: 'shown-hull', type: 'ship', team: 0, pos: { x: 600, z: 0 }, options: ARRIVAL_BODY });
    harness.enqueue({ id: 'shown-rock', type: 'asteroid', pos: { x: 750, z: 0 }, options: ARRIVAL_BODY });

    // The production post-bridge window runs the hulls-only hold (the jump/'take it to
    // the belt' cook calls resumeAuthoredUpgradeQueueForLoadingHulls): restored hulls
    // admit while leftover fx compiles stay held. Drive it so the pin proves the regime
    // the game actually runs - where the hold must not bury shown non-hull bodies.
    partsLibrary.resumeAuthoredUpgradeQueueForLoadingHulls(harness.scene);

    const expectedOrder = [
      'shown-hull',
      'shown-rock',
      'dock-furniture-b',
      'dock-furniture-a',
    ];
    for (const expected of expectedOrder) {
      await harness.runNextFrame();
      const started = harness.starts[harness.starts.length - 1];
      assert.equal(started, expected,
        `${expected} must admit before the off-frame backlog`);
      harness.releases.get(started)();
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(harness.starts, expectedOrder,
      'what the opening frame shows admits first; the off-frame tail keeps its distance grades');

    // The leftover-fx hold still holds: ambient dressing is exactly what the
    // hulls-only cohort exists to defer. The parked admit schedules no further
    // frame - a queued frame here would mean the hold let a leftover through.
    await harness.runNextFrame();
    assert.deepEqual(harness.starts, expectedOrder,
      'unshown ambient fx stays deferred through the hulls-only hold');
  } finally {
    harness.cleanup();
  }
});

test('without a composed camera the arrival distance grades survive untouched', async () => {
  // Fail closed is the regression pin: an uncomposed camera must reorder nothing, or the
  // opening-frame rung would flatten the arrival grade into plain FIFO exactly where it
  // does its work. Driven with the hulls-only hold off - this pins the grade order
  // itself, whatever hold the caller runs.
  const runtimeState = beltArrivalRuntimeState({ mode: 'loading', composedCamera: false });
  const harness = makeHarness(runtimeState);
  try {
    harness.enqueue({ id: 'dock-furniture-a', type: 'place', pos: { x: -350, z: 0 }, options: ARRIVAL_BODY });
    harness.enqueue({ id: 'dock-furniture-b', type: 'station', pos: { x: -200, z: 0 }, options: ARRIVAL_BODY });
    harness.enqueue({ id: 'ambient-filler', type: 'fx', pos: { x: -1000, z: 0 } });
    harness.enqueue({ id: 'shown-hull', type: 'ship', team: 0, pos: { x: 600, z: 0 }, options: ARRIVAL_BODY });
    harness.enqueue({ id: 'shown-rock', type: 'asteroid', pos: { x: 750, z: 0 }, options: ARRIVAL_BODY });

    // Distance to the player grades: -200 (2.39) before -350 (2.68) before 600 (3.18)
    // before 750 (3.47), then the un-graded ambient job - the exact burial the belt tail
    // was: the visible set graded behind the furniture clinging to the player's wake.
    const expectedOrder = [
      'dock-furniture-b',
      'dock-furniture-a',
      'shown-hull',
      'shown-rock',
      'ambient-filler',
    ];
    for (const expected of expectedOrder) {
      await harness.runNextFrame();
      const started = harness.starts[harness.starts.length - 1];
      assert.equal(started, expected,
        `${expected} keeps its arrival distance grade`);
      harness.releases.get(started)();
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(harness.starts, expectedOrder);
  } finally {
    harness.cleanup();
  }
});

test('the shown set admits as one rung; inside it the queue keeps its FIFO', async () => {
  // Documented decision: the opening-frame rung ranks the shown SET against everything
  // else - it does not re-weight shown dressing against shown bodies. "The bodies you
  // are fighting" keep their own guarantee via the combatant rung (0.5); two shown
  // owners stand or fall in enqueue order together.
  const runtimeState = beltArrivalRuntimeState({ mode: 'loading' });
  const harness = makeHarness(runtimeState);
  try {
    harness.enqueue({ id: 'shown-prop', type: 'place', pos: { x: 600, z: 0 } });
    harness.enqueue({ id: 'shown-hull', type: 'ship', team: 0, pos: { x: 610, z: 0 } });
    harness.enqueue({ id: 'dock-furniture-b', type: 'station', pos: { x: -200, z: 0 }, options: ARRIVAL_BODY });

    const expectedOrder = ['shown-prop', 'shown-hull', 'dock-furniture-b'];
    for (const expected of expectedOrder) {
      await harness.runNextFrame();
      const started = harness.starts[harness.starts.length - 1];
      assert.equal(started, expected,
        `${expected} must admit in the pinned shown-set order`);
      harness.releases.get(started)();
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(harness.starts, expectedOrder);
  } finally {
    harness.cleanup();
  }
});

test('in flight a shown body still outranks a locked target off the glass', async () => {
  const runtimeState = beltArrivalRuntimeState({ mode: 'flight' });
  runtimeState.player.targetId = 'locked-target';
  const harness = makeHarness(runtimeState);
  try {
    harness.enqueue({ id: 'locked-target', type: 'wreck', pos: { x: -2000, z: 0 } });
    harness.enqueue({ id: 'dock-furniture-a', type: 'place', pos: { x: -350, z: 0 }, options: ARRIVAL_BODY });
    harness.enqueue({ id: 'shown-hull', type: 'ship', team: 0, pos: { x: 600, z: 0 } });

    const expectedOrder = ['shown-hull', 'locked-target', 'dock-furniture-a'];
    for (const expected of expectedOrder) {
      await harness.runNextFrame();
      const started = harness.starts[harness.starts.length - 1];
      assert.equal(started, expected,
        `${expected} must admit in the law-of-the-glass order`);
      harness.releases.get(started)();
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(harness.starts, expectedOrder);
  } finally {
    harness.cleanup();
  }
});
