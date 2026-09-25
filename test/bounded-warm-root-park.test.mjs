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
  };

  applyFirstPlayablePaintRelease(owner);

  assert.equal(opening.parent, null, 'the opening species warm root is off the graph in flight');
  assert.equal(deferred.parent, null, 'a mounted deferred warm cannot outlive the flight boundary');
  assert.equal(other.parent, scene, 'roots the park does not own stay mounted');
  assert.deepEqual(owner.state.render.parkedWarmRoots, [opening, deferred],
    'parked roots stay reachable for probes and the run-end release');
  assert.ok(Number.isFinite(owner.state.render.firstPlayableFrameAt), 'the flight latch still stamps');

  applyFirstPlayablePaintRelease(owner);
  assert.equal(opening.parent, null, 're-running the release keeps the warm roots parked');
  assert.equal(other.parent, scene, 're-running the release leaves foreign roots alone');
});

test('the warm roots are parked after the last pass that draws them and before the census', () => {
  const postOpening = RENDERER_SOURCE.indexOf("'live.postOpeningPipelines', postStarted");
  const park = RENDERER_SOURCE.indexOf('this._parkBoundedWarmRoots()', postOpening);
  const census = RENDERER_SOURCE.indexOf("'live.firstFramePoolCensus'", postOpening);
  assert.ok(postOpening > 0 && park > postOpening, 'park follows the post-opening touches');
  assert.ok(census > park, 'park precedes the first-frame census');
});
