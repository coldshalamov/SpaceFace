import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WORLD_CUE_ACTION_RECIPE, resolveWorldCueReceipt, isComposedTravelCue } from '../src/render/vfx/worldCueRecipes.js';
import { PRESENTATION_RECIPES } from '../src/presentation/cueRecipes.js';
import { ActionVfx } from '../src/render/actionVfx.js';
import { createGameplayExplosion } from '../scripts/lib/vfxGameplayExplosion.mjs';

function fixture(){return {simTime:1,playerId:1,entities:new Map([
  [1,{id:1,alive:true,type:'ship',pos:{x:80,z:-12},radius:7,rot:.5}],
  [2,{id:2,alive:true,type:'asteroid',pos:{x:140,z:32},radius:13,rot:1}],
]),settings:{video:{}}};}
function cue(id,extra={}){return {id,sourceId:1,targetId:2,position:{x:137,y:2,z:28},...extra};}

test('whitelist covers twenty work cues and nine composed travel handoffs',()=>{
  const entries=Object.entries(WORLD_CUE_ACTION_RECIPE.variants);assert.equal(entries.length,29);
  for(const [id,recipe] of entries){
    assert.ok(PRESENTATION_RECIPES[id],id);assert.ok(isComposedTravelCue(id)||PRESENTATION_RECIPES[id].lanes.vfx.startsWith('vfx.direct_'),id);
    assert.equal(resolveWorldCueReceipt(cue(id),fixture()).kind,id);
    assert.ok(recipe.life>0&&recipe.life<1.2);assert.equal(recipe.continuous,false);
  }
  assert.equal(WORLD_CUE_ACTION_RECIPE.variants['mining.survey.pulse'].primitive,'pressure');
  assert.equal(WORLD_CUE_ACTION_RECIPE.variants['mining.survey.resolved'].verb,'cool');
  assert.equal(WORLD_CUE_ACTION_RECIPE.variants['mining.survey.classified'].primitive,'induction');
  assert.equal(WORLD_CUE_ACTION_RECIPE.variants['mining.drill.contact'].primitive,'deposition');
  assert.equal(WORLD_CUE_ACTION_RECIPE.variants['mining.drill.gas_hazard'].primitive,'capture');
  assert.equal(WORLD_CUE_ACTION_RECIPE.variants['mining.vent.ready'].verb,'cool');
});

test('already owned effects, bookkeeping and arbitrary cue kinds cannot enter the world consumer',()=>{
  for(const id of ['mining.seam.quality','mining.rich_core.completed','mining.drill.aborted','mining.drill.retry',
    'travel.discovery.mapped','combat.bounce','ui.open','constructor','__proto__'])
    assert.equal(resolveWorldCueReceipt(cue(id),fixture()),null,id);
  assert.equal(resolveWorldCueReceipt({kind:'mining.drill.contact'},fixture()),null);
});

test('native drill tile coordinates never become world positions or invented offsets',()=>{
  const state=fixture(),raw={col:87,row:13,pos:{col:87,row:13},radius:6};
  const payload=cue('mining.drill.contact',{position:null,payload:raw});
  const resolved=resolveWorldCueReceipt(payload,state);
  assert.deepEqual(resolved.pos,{x:140,y:0,z:32});assert.equal(resolved.targetId,2);
  assert.equal(resolved.attachToTarget,true);
  state.entities.delete(2);assert.equal(resolveWorldCueReceipt(payload,state),null,'known player is not a substitute for the missing drill body');
  payload.position={col:87,row:13};assert.equal(resolveWorldCueReceipt(payload,state),null);
  payload.position={x:137,y:2,z:28};assert.deepEqual(resolveWorldCueReceipt(payload,state).pos,payload.position,'real envelope contact survives removed body');
});

test('scanner return is local and classified virtual signals require their actual receipt position',()=>{
  const state=fixture();
  const resolved=resolveWorldCueReceipt(cue('mining.survey.resolved',{
    position:null,targetId:null,payload:{found:{asteroids:8},signalCount:0},
  }),state);
  assert.equal(resolved.targetId,1);assert.deepEqual(resolved.pos,{x:80,y:0,z:-12});
  const classified=cue('mining.survey.classified',{targetId:'signal:deep',position:{x:980,z:630},payload:{total:9}});
  const answer=resolveWorldCueReceipt(classified,state);assert.equal(answer.targetId,'signal:deep');
  assert.deepEqual(answer.pos,{x:980,y:0,z:630});assert.equal(answer.attachToTarget,false);
  classified.position=null;assert.equal(resolveWorldCueReceipt(classified,state),null);
});

test('heat, vent and capacity edges stay on the miner when the context names the mined rock',()=>{
  const state=fixture();
  for(const id of ['mining.heat.overheated','mining.vent.ready','mining.cargo.full']){
    const p=cue(id,{position:{x:140,z:32},targetId:2,sourceId:1});
    const result=resolveWorldCueReceipt(p,state);
    assert.equal(result.targetId,1);assert.deepEqual(result.pos,{x:80,y:0,z:-12});
    p.sourceId=99;assert.equal(resolveWorldCueReceipt(p,state),null,'absent tool cannot borrow the mined rock');
  }
});

test('native cargo-full cue draws a local closed clamp without faking a yield',()=>{
  const state=fixture(),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,16/9,.1,1000);
  camera.position.set(80,90,65);camera.lookAt(80,0,-12);camera.updateMatrixWorld();
  Object.assign(state,{mode:'flight',tick:60,player:{},world:{},drill:{asteroidId:2},render:{scene,camera}});
  const owner=createGameplayExplosion({scene,camera,state});
  try{
    owner.fireEvent('drill:cargoFull',{commodityId:'cmdty_ore_iron',qty:3,pos:{col:3,row:4}});
    state.simTime=1.16;state.tick=70;owner.update(.16);
    const action=owner.inspect().action;
    assert.equal(action.active,1);assert.ok(action.surfaces>0,'actual native material geometry is admitted');
    const s=action.instances[0];assert.equal(s.kind,'mining.cargo.full');assert.equal(s.primitive,'capture');
    assert.equal(s.id,1);assert.equal(s.sourceId,1);assert.equal(s.x,80);assert.equal(s.z,-12);
    assert.equal(WORLD_CUE_ACTION_RECIPE.variants[s.kind].verb,'prime','warning does not use harvest or collection');
    state.simTime=2.5;state.tick=150;owner.update(1.34);assert.equal(owner.inspect().action.active,0);
  }finally{owner.dispose();}
});

test('resolver snapshots anchors without mutating envelopes, simulation or borrowed identities',()=>{
  const state=fixture(),p=cue('mining.seam.reward'),snapshot=JSON.stringify(p),entities=JSON.stringify([...state.entities]);
  state.rng=()=>{throw Error('presentation requested RNG');};
  const result=resolveWorldCueReceipt(p,state);assert.notEqual(result.pos,p.position);
  assert.notEqual(result.sourcePos,state.entities.get(1).pos);assert.deepEqual(result.direction,{x:57,z:40});
  assert.equal(JSON.stringify(p),snapshot);assert.equal(JSON.stringify([...state.entities]),entities);
  const absent=cue('mining.survey.pulse',{sourceId:null,targetId:null,position:null});
  assert.equal(resolveWorldCueReceipt(absent,state),null,'state.playerId is not authority to invent a source');
});

test('same-tick pulse and return keep their separate variants on the automatic production subscription',()=>{
  const state=fixture(),owner=new ActionVfx(new THREE.Scene());
  const pulse=cue('mining.survey.pulse',{targetId:null,position:{x:80,z:-12}});
  const returned=cue('mining.survey.resolved',{targetId:null,position:{x:80,z:-12}});
  assert.equal(owner.emit('presentation:cue',pulse,state),true);
  assert.equal(owner.emit('presentation:cue',returned,state),true);
  assert.equal(owner.live,2);
  const slots=owner.slots.filter(s=>s.alive);
  assert.deepEqual(slots.map(s=>s.recipe.primitive),['pressure','deposition']);
  assert.notEqual(slots[0].seed,slots[1].seed);
  assert.equal(owner.emit('presentation:cue',returned,state),false,'same semantic cue still coalesces');
  assert.equal(owner.emit('presentation:cue',cue('combat.bounce'),state),false);
  state.simTime=1.2;owner.update(state);assert.ok(owner.batch.count>0);
  state.simTime=3;owner.update(state);assert.equal(owner.live,0);owner.dispose();
});


test('travel follows the named hull, never the destination sector or arbitrary cue position',()=>{
  const state=fixture(),owner=new ActionVfx(new THREE.Scene());
  for(const id of Object.keys(WORLD_CUE_ACTION_RECIPE.variants).filter(isComposedTravelCue)){
    const p=cue(id,{targetId:'destination-sector',position:{x:999,z:999}});
    const resolved=resolveWorldCueReceipt(p,state);
    assert.equal(resolved.targetId,1);assert.deepEqual(resolved.pos,{x:80,y:0,z:-12});
    assert.equal(owner.emit('presentation:cue',p,state),true);
  }
  state.simTime=1.3;owner.update(state);assert.ok(owner.batch.count>=36);
  const first=owner.slots[0],oldX=first.x;state.entities.get(1).pos.x+=12;
  state.simTime=1.4;owner.update(state);assert.equal(first.x,oldX+12);
  assert.equal(resolveWorldCueReceipt(cue('travel.jump.failed',{sourceId:99}),state),null);
  state.simTime=3;owner.update(state);assert.equal(owner.live,0);owner.dispose();
});


test('surface work meets the drawn receiver and accepted pickups enter the real collector',()=>{
  const state=fixture(),owner=new ActionVfx(new THREE.Scene());
  const root=new THREE.Mesh(new THREE.BoxGeometry(24,12,20),new THREE.MeshBasicMaterial());
  root.position.set(140,0,32);state.entities.get(2).view={root};
  const p=cue('mining.rich_core.exposed',{position:{x:140,z:32}});
  assert.equal(owner.emit('presentation:cue',p,state),true);
  const slot=owner.slots.find(s=>s.alive);
  assert.equal(slot.provenance,'model-bounds-surface');assert.ok(slot.y>0);
  assert.ok(Math.abs(slot.x-140)>=12||Math.abs(slot.z-32)>=10);
  assert.equal(owner.emit('pickup:collected',{pickupId:2,collectorId:1,pos:{x:140,z:32},amount:0},state),false);
  assert.equal(owner.emit('pickup:collected',{pickupId:2,collectorId:1,pos:{x:140,z:32},amount:3},state),true);
  const pickup=owner.slots.find(s=>s.event==='pickup:collected');
  assert.equal(pickup.id,1);assert.equal(pickup.sx,140);assert.equal(pickup.sz,32);
  assert.ok(Math.abs(Math.hypot(pickup.x-80,pickup.z+12)-7)<1e-6);
  state.entities.delete(2);state.simTime+=.2;owner.update(state);
  assert.ok(owner.batch.count>0);owner.dispose();root.geometry.dispose();root.material.dispose();
});
