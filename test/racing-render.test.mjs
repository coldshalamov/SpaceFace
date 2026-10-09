import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createChaseCamera } from '../src/render/camera.js';
import { createRacingCourseView } from '../src/render/racingCourseView.js';
import { racingOfferFor, raceGateGlobals } from '../src/data/raceLevels.js';
import { circuitPacePoint, gateApproach } from '../src/systems/racingGeometry.js';

function chaseHarness(view = 'racing') {
  const player = { id:1,type:'ship',alive:true,pos:{x:0,z:0},prevPos:{x:0,z:0},vel:{x:0,z:0},
    rot:0,bank:0,radius:6,mass:24,flags:{boosting:false},maxSpeed:320 };
  const state = { mode:'flight',settings:{video:{fov:50,motionReduce:false},gameplay:{steeringView:view}},
    camera:{zoom:144,tilt:60,lerp:18,lookAhead:0},input:{actions:{}},entities:new Map([[1,player]]),
    playerId:1,player:{tether:null},render:{interpolationAlpha:1},combat:{},missions:{active:[]} };
  const cam = createChaseCamera(state,{innerWidth:1280,innerHeight:720});
  return {state,player,cam};
}

test('live chase owner settles behind the presented hull without writing FOV or player state',()=>{
  const {state,player,cam}=chaseHarness();
  const before=JSON.stringify(player),anchor={x:7,z:9};
  for(let i=0;i<300;i++)cam.follow(1/60,1,anchor);
  assert.ok(Math.abs(cam.obj.position.x-(anchor.x-58))<.1,`stern x ${cam.obj.position.x}`);
  assert.ok(Math.abs(cam.obj.position.z-anchor.z)<.1);
  assert.ok(Math.abs(cam.obj.position.y-22)<.1);
  assert.equal(cam.obj.fov,50);assert.equal(JSON.stringify(player),before);
  state.settings.gameplay.steeringView='overhead';
  for(let i=0;i<300;i++)cam.follow(1/60,1,anchor);
  assert.ok(cam.obj.position.y>100,'returns to overhead framing');
});

test('live stern rig consults solid roofs instead of bypassing camera clearance',()=>{
  const {cam}=chaseHarness();
  let calls=0;const roof=()=>{calls++;return 180;};
  const clearance=()=>180;clearance.roofAt=roof;
  for(let i=0;i<300;i++){
    cam.follow(1/60,1,undefined,clearance);
    assert.ok(cam.obj.position.y>=180-1e-3,`inside roof at frame ${i}: ${cam.obj.position.y}`);
  }
  assert.ok(calls>0);
});

test('phase-scoped mission view restores the preference in the real camera owner',()=>{
  const {state,cam}=chaseHarness('overhead');
  const mission={status:'active',phase:'run',params:{steerLock:'racing',steerLockPhases:['run']}};
  state.missions.active=[mission];
  for(let i=0;i<300;i++)cam.follow(1/60,1);
  assert.ok(cam.obj.position.y<30);
  mission.phase='handoff';
  for(let i=0;i<300;i++)cam.follow(1/60,1);
  assert.ok(cam.obj.position.y>100);
  assert.equal(state.settings.gameplay.steeringView,'overhead');
});

test('course view uses vertical apertures and the same pace sampler, survives rebases, disposes idempotently',()=>{
  const offer=racingOfferFor('contract_junction_draft');offer.status='active';offer.params.raceStartSimS=0;
  const state={mode:'flight',simTime:2,ui:{},world:{currentSectorId:offer.params.courseSectorId,frameOrigin:{x:0,z:0}},missions:{active:[offer]}};
  const scene=new THREE.Scene(),view=createRacingCourseView(scene,state);view.frame();
  assert.equal(view.root.visible,true);
  const rings=view.root.getObjectByName('Checkpoint apertures'),pace=view.root.getObjectByName('Draft pace beacon');
  assert.equal(rings.count,offer.params.gates.length-1,'one start/finish aperture');
  const matrix=new THREE.Matrix4();rings.getMatrixAt(0,matrix);
  const normal=new THREE.Vector3(0,0,1).transformDirection(matrix),a=gateApproach(offer.params.gates,0);
  assert.ok(Math.abs(normal.x-a.nx)<1e-6&&Math.abs(normal.z-a.nz)<1e-6&&Math.abs(normal.y)<1e-6);
  const globals=raceGateGlobals(offer.params),point=circuitPacePoint(globals,2*640+70);
  assert.ok(Math.abs(pace.position.x+view.root.position.x-point.x)<1e-6);
  assert.ok(Math.abs(pace.position.z+view.root.position.z-point.z)<1e-6);
  const initial=view.root.position.clone();state.world.frameOrigin={x:5000,z:-3000};view.frame();
  assert.equal(view.root.position.x,initial.x-5000);assert.equal(view.root.position.z,initial.z+3000);
  let geometries=0;view.root.traverse(o=>{if(o.geometry)o.geometry.addEventListener('dispose',()=>geometries++);});
  view.dispose();const count=geometries;view.dispose();assert.equal(geometries,count);assert.ok(count>=3);
  assert.equal(scene.children.length,0);
});
