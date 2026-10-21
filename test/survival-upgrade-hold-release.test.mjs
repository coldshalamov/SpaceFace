// A Crucible cook warms the whole roster and drains the authored upgrade queue to idle before the
// shell releases, so the first-flight queue hold only parked mid-round spawns: a wasp reinforcement
// drew its procedural stand-in for ~16 s before the hold's 20 s window let its authored hull compose
// (seed 4242, 2026-09-22). The open route keeps the hold: its leftover compiles are what it defers.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  describeAuthoredUpgradeQueue,
  prepareFirstQueuedAuthoredBoundaryForOpening,
  cancelAuthoredUpgradeQueue,
  resumeAuthoredUpgradeQueueAfterOpening,
  enqueueBoundaryUpgrade,
  holdAuthoredUpgradeQueueForFirstFlight,
} from '../src/render/partsLibrary.js';
import { applyFirstPlayablePaintRelease } from '../src/render/renderer.js';

function heldScene() {
  const scene = new THREE.Scene();
  // A detached boundary is refused before queueing, but the refusal still creates the queue state
  // the hold lives on.
  void enqueueBoundaryUpgrade(scene, { boundary: new THREE.Group() });
  assert.equal(holdAuthoredUpgradeQueueForFirstFlight(scene), true);
  assert.equal(describeAuthoredUpgradeQueue(scene).held, true);
  return scene;
}

function owner(scene, run) {
  return {
    scene,
    state: {
      mode: 'flight',
      simTime: 0.1,
      run,
      render: { resumeDeferredPipelineAdmissions: () => ({ skipped: true }) },
    },
    _deferNoncriticalMeshStreaming: true,
    _openingFirstPicturePrepared: true,
  };
}

test('a survival run releases the first-flight upgrade hold at the first paint', () => {
  const scene = heldScene();
  applyFirstPlayablePaintRelease(owner(scene, { kind: 'survival', phase: 'wave' }));
  assert.equal(describeAuthoredUpgradeQueue(scene).held, false,
    'mid-round spawns must compose their authored hull without waiting out the 20 s window');
});

test('the open route keeps the first-flight upgrade hold through the first paint', () => {
  const scene = heldScene();
  applyFirstPlayablePaintRelease(owner(scene, null));
  assert.equal(describeAuthoredUpgradeQueue(scene).held, true,
    'leftover opening compiles stay deferred through the first-flight window');
});

for (const cooked of [false, true]) {
 test(`first paint transfers ${cooked?'cooked':'software cook-skipped'} opening hold to selective policy`, async()=>{
  const oldWindow=globalThis.window,oldRaf=globalThis.requestAnimationFrame;
  const frames=[];globalThis.requestAnimationFrame=fn=>frames.push(fn);
  const scene=new THREE.Scene(),o=owner(scene,null);
  const player={id:1,alive:true,pos:{x:0,z:0}};
  const glass={id:2,type:'ship',alive:true,pos:{x:10,z:0},activity:{presentationTier:'R0_GLASS'}};
  const ambient={id:3,type:'fx',alive:true,pos:{x:50000,z:0},activity:{presentationTier:'R2_METADATA'}};
  Object.assign(o.state,{playerId:1,entities:new Map([[1,player],[2,glass],[3,ambient]]),world:{},camera:{zoom:144}});
  globalThis.window={SF:{state:o.state}};
  try {
   // The real opening cohort leaves a blanket hold, even when no queued body remains.
   const cohort=await prepareFirstQueuedAuthoredBoundaryForOpening(scene);assert.equal(cohort.prepared,false);
   assert.equal(describeAuthoredUpgradeQueue(scene).openingHeld,true);
   if(cooked){o.state.render.firstPlayableFrameAt=1;holdAuthoredUpgradeQueueForFirstFlight(scene);}
   let glassRuns=0,ambientRuns=0;
   const enqueue=(entity,run)=>{const boundary=new THREE.Group();boundary.visible=false;scene.add(boundary);return enqueueBoundaryUpgrade(scene,{boundary,entity,run,options:{deferBoundaryPublication:true}});};
   const glassDone=enqueue(glass,()=>{glassRuns++;return true;});
   const ambientDone=enqueue(ambient,()=>{ambientRuns++;return true;});
   // Production resumeDeferredPipelineAdmissions skips before sim20. First paint must
   // still transfer queue ownership; it must not force that callback or release all FX.
   let resumeCalls=0;o.state.render.resumeDeferredPipelineAdmissions=options=>{resumeCalls++;assert.equal(options,undefined);return {skipped:true,reason:'hold-deferred-through-first-flight'};};
   applyFirstPlayablePaintRelease(o);
   let q=describeAuthoredUpgradeQueue(scene);assert.equal(q.openingHeld,false);assert.equal(q.firstFlightHeld,true);
   assert.equal(q.frameScheduled,true);assert.equal(resumeCalls,1);
   const frameCount=frames.length;applyFirstPlayablePaintRelease(o);
   assert.equal(frames.length,frameCount,'repeat paint must not invalidate or duplicate the pending callback');
   for(const fn of frames.splice(0))fn();for(let i=0;i<40;i++)await Promise.resolve();
   assert.equal(glassRuns,1);assert.equal(ambientRuns,0);await glassDone;
   q=describeAuthoredUpgradeQueue(scene);assert.equal(q.pending,1);assert.equal(q.firstFlightHeld,true);
   cancelAuthoredUpgradeQueue(scene,'test-reset');await ambientDone;
   assert.equal(describeAuthoredUpgradeQueue(scene).present,false);
  }finally{cancelAuthoredUpgradeQueue(scene);if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;if(oldRaf===undefined)delete globalThis.requestAnimationFrame;else globalThis.requestAnimationFrame=oldRaf;}
 });
}

test('nonflight first paint never arms a first-flight queue hold',async()=>{
 const scene=new THREE.Scene(),o=owner(scene,null);o.state.mode='menu';
 await prepareFirstQueuedAuthoredBoundaryForOpening(scene);
 applyFirstPlayablePaintRelease(o);
 assert.equal(describeAuthoredUpgradeQueue(scene).firstFlightHeld,false);
 cancelAuthoredUpgradeQueue(scene);
});

test('later paints and reset do not re-arm a released queue',async()=>{
 const scene=new THREE.Scene(),o=owner(scene,null);
 await prepareFirstQueuedAuthoredBoundaryForOpening(scene);applyFirstPlayablePaintRelease(o);
 resumeAuthoredUpgradeQueueAfterOpening(scene);applyFirstPlayablePaintRelease(o);
 assert.equal(describeAuthoredUpgradeQueue(scene).held,false);
 cancelAuthoredUpgradeQueue(scene,'continue-reset');applyFirstPlayablePaintRelease(o);
 assert.equal(describeAuthoredUpgradeQueue(scene).present,false);
});
