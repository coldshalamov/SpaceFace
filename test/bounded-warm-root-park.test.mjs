// The bounded warm roots (Crucible roster warm, opening species warm) exist only so their
// programs link and buffers upload behind the loading shell. Left mounted for the run they were
// 13,845 of 16,506 scene nodes in a seed-4242 Crucible fight, and three walks hidden subtrees in
// every scene.updateMatrixWorld(): ~11 ms a frame on the owner's iGPU, 22 fps -> 40+ fps once parked.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';

import { applyFirstPlayablePaintRelease, render } from '../src/render/renderer.js';

const RENDERER_SOURCE = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');

function warmRoot(tag, children = 3) {
  const root = new THREE.Group();
  root.visible = false;
  root.userData.rosterPrewarm = tag;
  for (let i = 0; i < children; i++) root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
  return root;
}

test('bounded warm roots leave the scene graph but stay owned for run-end release', () => {
  const scene = new THREE.Scene();
  const crucible = warmRoot('bounded-cook');
  const opening = warmRoot('opening-species-warm', 1);
  const other = warmRoot('some-other-prewarm');
  scene.add(crucible, opening, other);
  const owner = { scene, _rosterPrewarmRoots: [crucible, opening, other] };

  const parked = render._parkBoundedWarmRoots.call(owner);

  assert.equal(parked.roots, 2);
  assert.equal(parked.nodes, 4 + 2, 'node count covers each parked subtree');
  assert.equal(crucible.parent, null, 'the crucible warm root is off the graph');
  assert.equal(opening.parent, null, 'the opening species warm root is off the graph');
  assert.equal(other.parent, scene, 'roots this pass does not own stay where they are');
  assert.deepEqual(owner._rosterPrewarmRoots, [crucible, opening, other],
    'parked roots stay listed so the rock re-skin sweep and run-end release still reach them');
  assert.equal(crucible.children.length, 3, 'parking disposes nothing');

  assert.equal(render._parkBoundedWarmRoots.call(owner).roots, 0, 'a second park is a no-op');
});

test('the flight boundary parks bounded warm roots the skipped live-sector cook never reached', () => {
  // The defect this guards: waitForOpeningGpuResources only invokes
  // prepareLiveSectorBeforeFlight while mode is still 'loading', and the software-WebGL
  // route does not await the opening prepare — mode can already be 'flight' when the
  // prepare settles, so the whole post-opening block (warm claim, finish, both parks)
  // is skipped and the mounted SF_OpeningSpeciesWarm walks its hidden subtree through
  // every frame's updateMatrixWorld for the whole session.
  const scene = new THREE.Scene();
  const opening = warmRoot('opening-species-warm', 2);
  const deferred = warmRoot('deferred-warm', 1);
  const other = warmRoot('some-other-prewarm');
  scene.add(opening, deferred, other);
  const owner = {
    scene,
    state: { mode: 'flight', render: {}, simTime: 1 },
    _rosterPrewarmRoots: [opening, deferred, other],
    _parkBoundedWarmRoots() { return render._parkBoundedWarmRoots.call(this); },
    _releaseOrdinaryOpeningWarm(reason) {
      return render._releaseOrdinaryOpeningWarm.call(this, reason);
    },
  };

  applyFirstPlayablePaintRelease(owner);

  assert.equal(opening.parent, null, 'the opening species warm root is off the graph in flight');
  assert.equal(deferred.parent, null, 'a mounted deferred warm cannot outlive the flight boundary');
  assert.equal(other.parent, scene, 'roots the park does not own stay mounted');
  assert.deepEqual(owner.state.render.parkedWarmRoots, [deferred],
    'the ordinary opening root is released after first paint; deferred roots stay reachable');
  assert.deepEqual(owner._rosterPrewarmRoots, [deferred, other],
    'ordinary opening teardown removes only its own root from shared ownership');
  assert.equal(owner._warmDisposeQueue.length, 1,
    'the released opening root uses the existing paced disposal lane');
  assert.ok(Number.isFinite(owner.state.render.firstPlayableFrameAt), 'the flight latch still stamps');

  applyFirstPlayablePaintRelease(owner);
  assert.equal(opening.parent, null, 're-running the release keeps the warm roots parked');
  assert.equal(other.parent, scene, 're-running the release leaves foreign roots alone');
});

test('ordinary opening warm waits for late attachments, then releases without touching Crucible roots', () => {
  const scene = new THREE.Scene();
  const opening = warmRoot('opening-species-warm', 1);
  const crucible = warmRoot('bounded-cook', 1);
  scene.add(opening, crucible);
  opening.userData.warmBuilding = true;
  const owner = {
    scene,
    state: { mode: 'flight', render: { firstPlayableFrameAt: 1, parkedWarmRoots: [opening] } },
    _rosterPrewarmRoots: [opening, crucible],
    _releaseOrdinaryOpeningWarm(reason) {
      return render._releaseOrdinaryOpeningWarm.call(this, reason);
    },
  };

  assert.deepEqual(owner._releaseOrdinaryOpeningWarm('first-paint'), { released: 0, pending: 1 });
  assert.equal(opening.parent, scene, 'a still-building opening root remains mounted for late attaches');
  assert.deepEqual(owner._rosterPrewarmRoots, [opening, crucible]);

  opening.userData.warmBuilding = false;
  const released = owner._releaseOrdinaryOpeningWarm('settled');
  assert.deepEqual(released, { released: 1, pending: 0 });
  assert.equal(opening.parent, null, 'the settled opening root is detached');
  assert.equal(crucible.parent, scene, 'Crucible warm ownership remains mounted');
  assert.deepEqual(owner._rosterPrewarmRoots, [crucible]);
  assert.deepEqual(owner.state.render.parkedWarmRoots, [], 'released roots leave parked diagnostics');
  assert.equal(owner._warmDisposeQueue.length, 1, 'disposal uses the existing warm queue');
});

test('opening warm release fence survives a settle during census and drains residency once finish resumes', async () => {
  const scene = new THREE.Scene();
  const opening = warmRoot('opening-species-warm', 1);
  scene.add(opening);
  let resolveAttachment;
  const attachment = new Promise((resolve) => { resolveAttachment = resolve; });
  const liveResource = { disposed: false };
  let residencyReleases = 0;
  opening.userData.warmCensusManaged = true;
  opening.userData.warmCensusActive = true;
  opening.userData.warmCensusSettled = false;
  opening.userData.warmCensusFinished = false;
  opening.userData.warmResidencyHookInstalled = true;
  opening.userData.warmBuilding = true;
  opening.userData.releaseAuthoredAssetResidency = () => {
    assert.equal(liveResource.disposed, false, 'the live authored resource is valid at lease release');
    residencyReleases += 1;
    liveResource.disposed = true;
  };
  // The production authored disposer invokes the residency hook while tearing down the
  // prepared boundary. Keep the test at that same boundary without constructing a GLTF package.
  opening.userData.__disposePreparedAuthoredBoundary = () => {
    opening.userData.releaseAuthoredAssetResidency();
    return Promise.resolve(true);
  };
  const warm = {
    root: opening,
    profile: 'opening',
    building: true,
    pendingAttachments: [attachment],
    censusActive: true,
    censusSettled: false,
    censusFinished: false,
    residencyHookInstalled: true,
    settleDeadlineAt: Date.now() + 20,
  };
  const owner = {
    scene,
    state: { mode: 'flight', render: {}, simTime: 1 },
    _rosterPrewarmRoots: [opening],
    _parkBoundedWarmRoots() {
      return render._parkBoundedWarmRoots.call(this);
    },
    _releaseOrdinaryOpeningWarm(reason) {
      return render._releaseOrdinaryOpeningWarm.call(this, reason);
    },
  };

  render._armCrucibleWarmBuildingSettle.call(owner, warm);
  applyFirstPlayablePaintRelease(owner);
  assert.equal(opening.parent, scene, 'first paint cannot detach while census and attachment settle are active');
  assert.deepEqual(owner._releaseOrdinaryOpeningWarm('first-paint'), { released: 0, pending: 1 });

  resolveAttachment();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(warm.censusSettled, true, 'the attachment settle is recorded');
  applyFirstPlayablePaintRelease(owner);
  assert.equal(opening.parent, scene, 'settle alone cannot detach before census finish');
  assert.deepEqual(owner._releaseOrdinaryOpeningWarm('settled-before-finish'),
    { released: 0, pending: 1 },
    'the finished-census latch remains the second required release condition');

  warm.censusActive = false;
  warm.censusFinished = true;
  opening.userData.warmCensusActive = false;
  opening.userData.warmCensusFinished = true;
  assert.deepEqual(owner._releaseOrdinaryOpeningWarm('census-finished'),
    { released: 1, pending: 0 });
  assert.equal(opening.parent, null, 'finish resumes and releases the warm root');
  assert.equal(residencyReleases, 1, 'warm residency is released exactly once');
  assert.equal(liveResource.disposed, true, 'the warm lease drain completed');

  assert.deepEqual(owner._releaseOrdinaryOpeningWarm('repeat'),
    { released: 0, pending: 0 }, 'a repeated release is a no-op');
  assert.equal(residencyReleases, 1, 'repeated release cannot double-drain leases');
});

test('the warm roots are parked after the last pass that draws them and before the census', () => {
  const postOpening = RENDERER_SOURCE.indexOf("'live.postOpeningPipelines', postStarted");
  const park = RENDERER_SOURCE.indexOf('this._parkBoundedWarmRoots()', postOpening);
  const census = RENDERER_SOURCE.indexOf("'live.firstFramePoolCensus'", postOpening);
  assert.ok(postOpening > 0 && park > postOpening, 'park follows the post-opening touches');
  assert.ok(census > park, 'park precedes the first-frame census');
});
