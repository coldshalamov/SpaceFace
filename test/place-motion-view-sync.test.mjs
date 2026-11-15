import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSimulation} from '../src/core/sim.js';
import {render, disposeRendererOwnedResources} from '../src/render/renderer.js';
import {createRenderEntityFrame} from '../src/render/renderEntityFrame.js';
import {createPersistentSubmitLanes} from '../src/render/persistentSubmitLanes.js';

test('awake non-gate place completes each view sync and runs authored motion once', () => {
  const sim = createSimulation({seed: 621, systems: []}), state = sim.state;
  const entity = sim.spawn({type:'place', alive:true, pos:{x:0,z:0}, radius:10, data:{}});
  const scene = new THREE.Scene(), renderer = {}, mesh = new THREE.Group();
  state.render = {scene, renderer, admissionRunGeneration:1};
  const view = Object.create(render);
  let clears = 0, authored = 0, worldSite = 0;
  mesh.userData.updateWorldSitePresentation = () => worldSite++;
  mesh.userData.updateAuthoredMotion = () => authored++;
  mesh.userData.lod={level:'lod0',resolve:()=> 'lod0'};
  mesh.userData.updateLod=()=>{}; mesh.userData._appliedLodLevel='lod0';
  const world={alive:[1],slotGenerations:[1],meshRefs:[mesh],entityIds:[entity.id],flags:[0],entityRefs:[entity],
    dirtyMasks:[0],radii:[entity.radius],boundCount:1,refreshVisibleEntity(){},clearDirty(){clears++;},poseHasDelta:()=>false};
  Object.assign(view,{state,scene,renderer,_meshes:new Map([[entity.id,mesh]]),_meshesVersion:0,
    _frameMembrane:{toLocal:p=>p,origin:{x:0,z:0}},_shadowPolicyOptions:()=>({}),_presentationWorld:world,
    _presentationQueryOptions:{},_presentationQueries:{query:()=>({visibleCount:1,visibleSlots:[0],visibleGenerations:[1],hiddenCount:0,candidateCount:1,culledCount:0,newlyVisibleCount:0})},
    _entityViewCullBounds:()=>({x:0,z:0,halfX:10000,halfZ:10000,glassHalfX:10000,glassHalfZ:10000}),
    _hasCompletedPresentationPose:()=>true,_entityFrame:createRenderEntityFrame(),_entityViewDiagnostics:{},
    _hlodDiagnostics:{},_persistentSubmitLanes:createPersistentSubmitLanes(),viewport:{width:1280,height:720},_presentationFrameDt:1/60});
  try {
    view.syncEntityViews(1);
    assert.equal(mesh.userData.sfRowFaultedEpoch, undefined, 'place must not fault');
    assert.equal(clears, 1); assert.equal(authored, 1); assert.equal(worldSite, 1);
    view.syncEntityViews(1);
    assert.equal(clears, 2); assert.equal(authored, 2); assert.equal(worldSite, 2);
    // The station route must pass the renderer's accessibility object as the fifth argument.
    entity.type = 'station';
    const ring = { rotation: { z: 0 } };
    mesh.userData.ring1 = ring;
    state.settings ||= {}; state.settings.video ||= {}; state.settings.video.motionReduce = true;
    view.syncEntityViews(1);
    const calm = ring.rotation.z;
    view.syncEntityViews(1);
    assert.equal(ring.rotation.z, calm, 'reduced motion freezes station ring');
    state.settings.video.motionReduce = false;
    view.syncEntityViews(1);
    assert.notEqual(ring.rotation.z, calm, 'station ring resumes');
  } finally {disposeRendererOwnedResources(view);sim.dispose();}
});
