// PQ-210.02 — the opening is as smooth as minute two. The loading shell used to release with the
// opening composition's serial lane still working (measured 2026-09-25: `live.leftoverUpgradeIdle
// 460ms timeout (pending=3,inFlight=2,compiling=true)`), and flight paid the leftover composes as
// mid-flight NOVEL program links and first-draw upload bursts. The tail settle (boot-order fix)
// lifts the first-flight queue hold while loading still owns the picture, kicks still-waiting
// opening boundaries, and waits — bounded, fail-open — for the lane to reach a terminal state.
// These tests pin that contract against the REAL upgrade queue in partsLibrary.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  describeAuthoredUpgradeQueue,
  enqueueBoundaryUpgrade,
  holdAuthoredUpgradeQueueForFirstFlight,
} from '../src/render/partsLibrary.js';
import { settleOpeningCompositionTail } from '../src/render/precompile.js';

const yieldTick = () => new Promise((resolve) => setTimeout(resolve, 0));

function openingState({ scene, meshes }) {
  const player = { id: 'p1', isPlayer: true, alive: true, pos: { x: 0, z: 0 } };
  const relay = {
    id: 'r1',
    type: 'fx',
    alive: true,
    pos: { x: 40, z: 0 },
    data: { placeId: 'place_claim_outpost_relay' },
  };
  const state = {
    mode: 'loading',
    playerId: 'p1',
    entities: new Map([['p1', player], ['r1', relay]]),
    entityList: [player, relay],
    camera: { zoom: 144 },
    settings: {},
    render: { scene, renderer: {}, meshes },
  };
  return { state, player, relay };
}

function relayBoundary(scene, entity) {
  const boundary = {
    name: 'place_claim_outpost_relay_AuthoredAssetBoundary',
    parent: scene,
    visible: true,
    userData: { authoredAssetState: 'awaiting-authored-admission' },
  };
  boundary.userData.requestAuthoredUpgrade = (renderer, sceneRef) => {
    const completion = enqueueBoundaryUpgrade(sceneRef, {
      boundary,
      fallbackRoot: null,
      entity,
      renderer,
      scene: sceneRef,
      options: {},
      setActive: null,
      prefetchPromise: null,
      // Real runs compose through upgradeBoundary; the queue contract under test is the
      // scheduling/hold/idle behaviour, so the job body is the status flip itself.
      run: async () => {
        await yieldTick();
        boundary.userData.authoredAssetState = 'authored';
        return { status: 'completed' };
      },
    });
    boundary.userData.authoredUpgradePromise = completion;
    boundary.userData.authoredUpgradeRequestedAt = 0;
    return completion;
  };
  return boundary;
}

test('the tail settle kicks a waiting opening boundary, drains the serial lane, and re-arms the first-flight hold', async () => {
  const scene = { name: 'scene' };
  const meshes = new Map();
  const { state, relay } = openingState({ scene, meshes });
  const boundary = relayBoundary(scene, relay);
  meshes.set('r1', boundary);
  // A second, already-queued compose gives the scene real queue state — the shape the shell
  // actually releases in (leftoverUpgradeIdle: pending=3, inFlight=2). The settle must lift the
  // armed hold so this job too finishes behind the shell, then leave the hold armed again.
  const slowBoundary = {
    name: 'slow_leftover_AuthoredAssetBoundary',
    parent: scene,
    visible: true,
    userData: { authoredAssetState: 'loading' },
  };
  enqueueBoundaryUpgrade(scene, {
    boundary: slowBoundary,
    fallbackRoot: null,
    entity: { id: 'x1', type: 'fx', alive: true, pos: { x: 900, z: 0 }, data: { placeId: 'place_mining_drone' } },
    renderer: {},
    scene,
    options: {},
    setActive: null,
    prefetchPromise: null,
    run: async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      slowBoundary.userData.authoredAssetState = 'authored';
      return { status: 'completed' };
    },
  });

  // The live-sector cook's finally always arms this hold before handing over; the tail must
  // prove it can drain through an armed hold and leave it armed again.
  assert.equal(holdAuthoredUpgradeQueueForFirstFlight(scene), true);
  assert.equal(describeAuthoredUpgradeQueue(scene).firstFlightHeld, true);

  const receipt = await settleOpeningCompositionTail(state, {
    budgetMs: 5000,
    yieldToMain: async () => {
      await yieldTick();
    },
  });

  assert.equal(receipt.skipped, false);
  assert.equal(receipt.settled, true, `expected a settled exit, got ${JSON.stringify(receipt)}`);
  assert.ok(receipt.kicked >= 1, 'the still-waiting opening boundary must be requested');
  assert.equal(receipt.pending, 0);
  assert.equal(receipt.inFlight, 0);
  assert.equal(boundary.userData.authoredAssetState, 'authored');
  assert.equal(slowBoundary.userData.authoredAssetState, 'authored');
  // The guard's purpose is the flight boundary; the settle leaves the queue exactly as the
  // cook's finally left it.
  assert.equal(describeAuthoredUpgradeQueue(scene).firstFlightHeld, true);
});

test('the tail settle fails open on budget expiry while work remains in flight', async () => {
  const scene = { name: 'scene' };
  const meshes = new Map();
  const { state, relay } = openingState({ scene, meshes });
  const boundary = relayBoundary(scene, relay);
  meshes.set('r1', boundary);
  // Override the composed status so the lane never reaches a terminal state inside the budget.
  boundary.userData.requestAuthoredUpgrade = (renderer, sceneRef) => enqueueBoundaryUpgrade(sceneRef, {
    boundary,
    fallbackRoot: null,
    entity: relay,
    renderer,
    scene: sceneRef,
    options: {},
    setActive: null,
    prefetchPromise: null,
    run: () => new Promise(() => { /* a compose the budget must not wait on forever */ }),
  });
  holdAuthoredUpgradeQueueForFirstFlight(scene);

  const receipt = await settleOpeningCompositionTail(state, {
    budgetMs: 120,
    yieldToMain: async () => {
      await yieldTick();
    },
  });

  assert.equal(receipt.skipped, false);
  assert.equal(receipt.settled, false, 'a never-settling lane must not be reported settled');
  assert.ok(receipt.waitedMs >= 100, 'the settle must actually spend its budget waiting');
  assert.ok(receipt.waitedMs < 5000, 'the settle must fail open instead of hanging the shell');
  assert.equal(describeAuthoredUpgradeQueue(scene).firstFlightHeld, true);
});

test('the tail settle is a no-op guard when the run already left loading', async () => {
  const scene = { name: 'scene' };
  const { state } = openingState({ scene, meshes: new Map() });
  state.mode = 'flight';
  const receipt = await settleOpeningCompositionTail(state, { budgetMs: 1000 });
  assert.equal(receipt.skipped, false);
  assert.equal(receipt.polls, 0, 'flight owns the frame; the settle must not poll');
});

test('the tail settle skips cleanly without render state', async () => {
  const receipt = await settleOpeningCompositionTail({});
  assert.deepEqual(receipt, { skipped: true, reason: 'render-state-unavailable' });
});
