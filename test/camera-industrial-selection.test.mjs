import test from 'node:test';
import assert from 'node:assert/strict';
import { createCameraDirector, CameraDirectorMode, resolveIndustrialWorkpoint, projectBodyNdc } from '../src/render/cameraDirector.js';
import { createChaseCamera } from '../src/render/camera.js';
import { tableWorldToScreen } from '../src/render/tabletopPolicy.js';
import { ORCHARD_GEOMETRY } from '../src/data/anvilOrchardBody.js';
import * as THREE from 'three';
import { CERES_WORKFLEET_CONTRACT as C } from '../src/data/ceresWorkfleet.js';
import { ceresWorkfleetHardwareSpec } from '../src/data/ceresWorkfleetHardware.js';
import { bindMachineryPresentation, markMachineryEffective, recordCeresWorkfleetAuthoredSource } from '../src/core/machineryPresentation.js';

const dt = 1 / 60, view = { followX: 0, followZ: 0, followZoom: 144, fov: 50, aspect: 16 / 9, tiltDeg: 60 };
function fixture() {
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, team: 0, data: {} };
  const clamp = { id: 2, occupantGeneration: 1, type: 'wreck', alive: true, pos: { x: 170, z: 20 }, vel: { x: 0, z: 0 }, radius: 12,
    data: { role: 'world_site_component', worldSiteId: 'site', worldSiteComponentId: 'brace', worldSiteTargetable: true } };
  const state = { mode: 'flight', playerId: 1, player: { targetId: 2 }, ui: {}, entities: new Map([[1, player], [2, clamp]]), entityList: [player, clamp] };
  return { state, player, clamp, director: createCameraDirector() };
}
function advance(h, seconds, options = view) { let f; for (let n=0;n<Math.ceil(seconds/dt);n++) f=h.director.step(dt,h.state,h.player,options); return f; }

test('a deliberate stationary site selection eases both real points into view and exits on deselect', () => {
  const h=fixture();
  assert.equal(advance(h,.5).mode, CameraDirectorMode.FOLLOW);
  const entered=advance(h,.5); assert.equal(entered.mode,CameraDirectorMode.INDUSTRIAL);
  const settled=advance(h,3);
  const playerNdc=projectBodyNdc(h.player,settled,view), workNdc=projectBodyNdc(h.clamp,settled,view);
  assert.ok(Math.abs(playerNdc.x)<.8 && Math.abs(playerNdc.y)<.8);
  assert.ok(Math.abs(workNdc.x)<.8 && Math.abs(workNdc.y)<.8);
  assert.ok(settled.zoom>=144 && settled.zoom<=330);
  h.state.player.targetId=null;
  assert.equal(advance(h,dt).mode,CameraDirectorMode.RECOVER);
  assert.equal(advance(h,.6).mode,CameraDirectorMode.FOLLOW);
});

test('only stable industrial identities can acquire, and movement, combat and manual zoom retain priority', () => {
  const h=fixture(); h.clamp.data.worldSiteTargetable=false;
  assert.equal(advance(h,2).mode,CameraDirectorMode.FOLLOW);
  h.clamp.data.worldSiteTargetable=true; h.player.vel.x=80;
  assert.equal(advance(h,2).mode,CameraDirectorMode.FOLLOW);
  h.player.vel.x=0; assert.equal(advance(h,2,{...view,industrialBlocked:true}).mode,CameraDirectorMode.FOLLOW);
  assert.equal(advance(h,2,{...view,manualZoomRevision:0}).mode,CameraDirectorMode.INDUSTRIAL);
  assert.equal(advance(h,dt,{...view,manualZoomRevision:1}).mode,CameraDirectorMode.RECOVER);
  assert.equal(advance(h,2,{...view,manualZoomRevision:1}).mode,CameraDirectorMode.FOLLOW, 'same selection cannot retake manual zoom');
  h.state.player.targetId=null; advance(h,.5,{...view,manualZoomRevision:1});
  h.state.player.targetId=2; assert.equal(advance(h,2,{...view,manualZoomRevision:1}).mode,CameraDirectorMode.INDUSTRIAL);
  h.player.vel.x=76; assert.equal(advance(h,dt,{...view,manualZoomRevision:1}).mode,CameraDirectorMode.RECOVER);
});

test('cycling targets does not flap the view, and range hysteresis does not trap it', () => {
  const h=fixture(), other={...h.clamp,id:4,pos:{x:200,z:20},data:{...h.clamp.data,worldSiteComponentId:'other'}};
  h.state.entities.set(4,other);h.state.entityList.push(other);
  for(let i=0;i<4;i++){h.state.player.targetId=i%2?2:4;assert.equal(advance(h,.4).mode,CameraDirectorMode.FOLLOW);}
  h.state.player.targetId=2;assert.equal(advance(h,2).mode,CameraDirectorMode.INDUSTRIAL);
  h.clamp.pos.x=350;assert.equal(advance(h,.2).mode,CameraDirectorMode.INDUSTRIAL,'exit radius exceeds entry radius');
  h.clamp.pos.x=390;assert.equal(advance(h,dt).mode,CameraDirectorMode.RECOVER);
  const replacement={...h.clamp,occupantGeneration:2,pos:{x:150,z:20}};h.state.entities.set(2,replacement);
  assert.notEqual(advance(h,.4).mode,CameraDirectorMode.INDUSTRIAL,'recycled occupant must settle again');
  assert.equal(advance(h,2).mode,CameraDirectorMode.INDUSTRIAL);
});

test('Orchard uses the chosen authored socket and rejects a stale selection', () => {
  const h=fixture(), frame=h.clamp;
  frame.pos={x:130,z:40};frame.rot=Math.PI/2;frame.data={orchardId:'anvil_storm_orchard',orchardKind:'frame',
    worldRecordId:ORCHARD_GEOMETRY.worldRecordId,placeId:'place_anvil_storm_orchard',worldSiteTargetable:true};
  assert.equal(resolveIndustrialWorkpoint(h.state,h.player),null,'a frame alone does not take the view');
  h.state.ui.componentSelection={targetId:2,stableKey:`wr:${frame.data.worldRecordId}`,componentId:'orchard_socket_0'};
  const point=resolveIndustrialWorkpoint(h.state,h.player);
  assert.ok(Math.abs(point.x-170)<1e-8 && Math.abs(point.z-47.5)<1e-8,'rotated authored socket, not frame centre');
  assert.equal(advance(h,2).mode,CameraDirectorMode.INDUSTRIAL);
  h.state.ui.componentSelection.stableKey='wr:stale';
  assert.equal(advance(h,dt).mode,CameraDirectorMode.RECOVER);
});

test('a real held payload edge widens only its active industrial context; narrow views keep the pilot visible', () => {
  const h=fixture(), load={id:3,type:'payload',alive:true,pos:{x:190,z:140},radius:20,data:{tetherPayload:true}};
  h.state.entities.set(3,load);h.state.entityList.push(load);
  const baseline=advance(h,3).requiredZoom;
  h.state.player.tether={active:true,targetId:3};
  const withLoad=advance(h,3); assert.ok(withLoad.requiredZoom>baseline);
  load.pos={x:900,z:900}; assert.equal(advance(h,3).requiredZoom,baseline,'unrelated distant body does not widen view');
  const narrow={...view,aspect:.35}; const f=advance(h,3,narrow);
  assert.ok(f.zoom<=330);
  const p=projectBodyNdc(h.player,f,narrow); assert.ok(Math.abs(p.x)<=.8 && Math.abs(p.y)<=.8);
});

test('nearby admitted Ceres cutter joins only a fitting selected work view', () => {
  const h=fixture();h.clamp.data.worldSiteId=C.siteId;
  const head={id:7,occupantGeneration:1,...ceresWorkfleetHardwareSpec('cutterHead')};
  head.pos={x:170,z:150};h.state.entities.set(7,head);h.state.entityList.push(head);
  const scene=new THREE.Scene(), root=new THREE.Group();root.userData.authoredAssetState='authored';scene.add(root);head.mesh=root;
  h.state.render={scene,renderer:{},admissionRunGeneration:1,contextRecovery:{pending:false,generation:1}};
  const without=advance(h,3).requiredZoom;
  recordCeresWorkfleetAuthoredSource(root,C.assets.cutterHead);
  bindMachineryPresentation(head,root,h.state);markMachineryEffective(head,h.state,C.assets.cutterHead.id);
  const included=advance(h,3).requiredZoom;
  assert.ok(included>without,'actual admitted machine enriches the view');
  head.pos.z=800;
  assert.equal(advance(h,3).requiredZoom,without,'displaced machine cannot drag the view away');
});

test('live chase publishes the displayed industrial pose for the worker projector', () => {
  const h=fixture();h.state.settings={video:{fov:50},gameplay:{steeringView:'overhead'}};
  h.state.camera={zoom:144,tilt:60,lookAhead:18,lerp:6,trauma:0};h.state.input={aimWorld:null};
  const camera=createChaseCamera(h.state,{innerWidth:1600,innerHeight:900});camera.snapToPlayer();
  for(let i=0;i<240;i++) camera.follow(dt);
  assert.equal(camera.composition().mode,CameraDirectorMode.INDUSTRIAL);
  assert.ok(h.state.camera.composedZoom>=h.state.camera.displayedZoom);
  const shot=tableWorldToScreen(h.state,{width:1600,height:900},h.clamp.pos,{});
  assert.equal(shot.onScreen,true);
  const drawn=new THREE.Vector3(h.clamp.pos.x,0,h.clamp.pos.z).project(camera.obj);
  assert.ok(Math.abs(shot.x-(drawn.x+1)*800)<1 && Math.abs(shot.y-(1-drawn.y)*450)<1,
    'worker projection follows the actual displayed camera, not a separate estimate');
  const raisedCue=new THREE.Vector3(h.clamp.pos.x,20,h.clamp.pos.z).project(camera.obj);
  assert.ok(Math.abs(raisedCue.x)<.8 && Math.abs(raisedCue.y)<.8, 'visible raised fixture stays in view');
  camera.setZoom(180);camera.follow(dt);
  assert.notEqual(camera.composition().mode,CameraDirectorMode.INDUSTRIAL);
});

test('reduced-motion work framing remains continuous and returns to ordinary flight', () => {
  const h=fixture();h.state.settings={video:{fov:50,motionReduce:true},gameplay:{steeringView:'overhead'}};
  h.state.camera={zoom:144,tilt:60,lookAhead:18,lerp:6,trauma:0};h.state.input={aimWorld:null};
  const camera=createChaseCamera(h.state,{innerWidth:1600,innerHeight:900});camera.snapToPlayer();
  let x=h.state.camera.focus.x,z=h.state.camera.focus.z,maxStep=0;
  for(let i=0;i<240;i++) {camera.follow(dt);maxStep=Math.max(maxStep,Math.hypot(h.state.camera.focus.x-x,h.state.camera.focus.z-z));x=h.state.camera.focus.x;z=h.state.camera.focus.z;}
  assert.equal(camera.composition().mode,CameraDirectorMode.INDUSTRIAL);
  assert.ok(maxStep<4, `no single-frame worksite cut (${maxStep})`);
  h.state.player.targetId=null;for(let i=0;i<60;i++)camera.follow(dt);
  assert.equal(camera.composition().mode,CameraDirectorMode.FOLLOW);
});
