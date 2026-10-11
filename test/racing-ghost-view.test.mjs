import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRacingGhostView, RACING_GHOST_OPACITY } from '../src/render/racingGhostView.js';
import { createRacingCourseView } from '../src/render/racingCourseView.js';
import { observeRacingGhost, readRacingGhost } from '../src/systems/racingGhosts.js';
import { racingLoadoutCategory } from '../src/systems/racingSteer.js';

function fixture(){
  const rows=new Map(),storage={getItem:k=>rows.get(k)||null,setItem:(k,v)=>rows.set(k,v)};
  const params={racingContractId:'contract_ghost_view',courseId:'ghost_view',courseRevision:1,
    courseSectorId:'helios',gates:[{x:0,z:0},{x:100,z:0}],laps:1,raceStartSimS:0,gridUntilSimS:0};
  const player={id:1,alive:true,pos:{x:10000,y:3,z:20000},vel:{x:100,z:0},rot:0,mass:10,data:{shipDefId:'ship_kestrel'}};
  const race={type:'race',status:'active',params};
  const state={mode:'flight',simTime:0,playerId:1,entities:new Map([[1,player]]),player:{alive:true},
    world:{currentSectorId:'helios',frameOrigin:{x:0,z:0}},missions:{active:[race]},render:{interpolationAlpha:1},settings:{gameplay:{}}};
  params.raceCategory=racingLoadoutCategory(state,player);
  for(let i=0;i<=60;i++){
    state.simTime=i/60;player.pos.x=10000+100*i/60;
    const events=i===1?[{lap:0,gateIndex:0,elapsedS:i/60}]:i===60?[{lap:0,gateIndex:1,elapsedS:1,finished:true}]:[];
    if(i===60)params.raceClean=true;
    observeRacingGhost(params,player,state,{events,finish:i===60,storage});
  }
  const tape=readRacingGhost(storage,params,state);assert.ok(tape);
  state.simTime=.5;
  const source=new THREE.Group();source.userData.authoredAssetState='authored';source.matrixAutoUpdate=false;
  const geometry=new THREE.BoxGeometry(10,2,5),material=new THREE.MeshStandardMaterial({color:0xe0f0ff});
  const body=new THREE.Mesh(geometry,material);body.userData.presentationEntityId=1;
  source.add(body);source.userData.circular=source;material.userData.circular=material;
  const sourceData=source.userData,materialData=material.userData;
  player.mesh=source;
  const scene=new THREE.Scene();scene.add(source);
  return {state,player,race,params,storage,source,geometry,material,scene,sourceData,materialData};
}

test('ghost clones the admitted hull geometry without target identity or simulation registration',()=>{
  const f=fixture(),view=createRacingGhostView(f.scene,f.state,{storage:f.storage});
  let warm=0;f.state.render.touchSubjectExactTarget=()=>warm++;
  view.frame(f.race);const ghost=view.root,body=ghost.children[0];
  assert.equal(ghost.visible,true);assert.equal(ghost.position.x,10050);assert.equal(ghost.position.z,20000);assert.equal(ghost.position.y,3);
  assert.equal(ghost.matrixAutoUpdate,true);assert.equal(body.geometry,f.geometry,'authored mesh geometry is reused');
  assert.notEqual(body.material,f.material);assert.equal(body.material.opacity,RACING_GHOST_OPACITY);
  assert.equal(body.material.depthWrite,false);assert.equal(body.castShadow,false);
  assert.equal(body.userData.presentationEntityId,undefined);assert.deepEqual(ghost.userData,{racingGhost:true,presentationOnly:true});
  const intersections=[];body.raycast({},intersections);assert.deepEqual(intersections,[]);
  assert.equal(f.source.userData,f.sourceData);assert.equal(f.material.userData,f.materialData);
  assert.equal(f.material.opacity,1);assert.equal(f.state.entities.size,1);assert.equal(warm,1);
  for(let i=0;i<10;i++)view.frame(f.race);assert.equal(view.root,ghost);assert.equal(warm,1,'steady frames reuse the admitted clone');
  f.state.world.frameOrigin={x:8192,z:16384};view.frame(f.race);
  assert.equal(ghost.position.x,10050-8192);assert.equal(ghost.position.z,20000-16384);
  assert.equal(f.player.pos.x,10100,'frame rebases never move authoritative poses');view.dispose();
});

test('disabled and incompatible playback creates no substitute ship; changing settings resumes the saved ghost',()=>{
  const f=fixture(),view=createRacingGhostView(f.scene,f.state,{storage:f.storage});
  f.state.settings.gameplay.racingGhost=false;view.frame(f.race);assert.equal(view.root,null);
  f.state.settings.gameplay.racingGhost=true;f.params.raceGhostEnabled=false;view.frame(f.race);assert.equal(view.root,null);
  f.params.raceGhostEnabled=true;f.source.userData.authoredAssetState='loading';view.frame(f.race);
  assert.equal(view.root,null,'wait for authored admission rather than build a fake hull');
  f.source.userData.authoredAssetState='authored';view.frame(f.race);assert.equal(view.root.visible,true);
  f.params.raceFitChanged=true;view.frame(f.race);assert.equal(view.root.visible,false);
  delete f.params.raceFitChanged;f.state.simTime=2;view.frame(f.race);assert.equal(view.root.visible,false,'the ghost stops at its recorded finish');
  view.dispose();
});

test('restarts and authored swaps dispose only ghost materials, never shared hull geometry or textures',()=>{
  const f=fixture(),view=createRacingGhostView(f.scene,f.state,{storage:f.storage});
  let originalsDisposed=0,ghostsDisposed=0;
  f.geometry.addEventListener('dispose',()=>originalsDisposed++);f.material.addEventListener('dispose',()=>originalsDisposed++);
  for(let i=0;i<20;i++){
    const race={...f.race,params:{...f.params}};view.frame(race);
    assert.equal(view.root.visible,true);view.root.children[0].material.addEventListener('dispose',()=>ghostsDisposed++);
    assert.equal(f.scene.children.length,2);view.frame(null);assert.equal(f.scene.children.length,1);
  }
  assert.equal(ghostsDisposed,20);assert.equal(originalsDisposed,0);
  view.frame(f.race);const old=view.root;
  f.source.add(new THREE.Mesh(f.geometry,f.material));view.frame(f.race);
  assert.notEqual(view.root,old);assert.equal(view.root.children.length,2);
  assert.equal(view.root.children[0].material,view.root.children[1].material,'shared source materials stay shared in the clone');
  view.dispose();view.dispose();assert.equal(f.scene.children.length,1);assert.equal(originalsDisposed,0);
});

test('course presentation owns ghost frame and disposal on its normal route',()=>{
  const f=fixture(),old=globalThis.localStorage;globalThis.localStorage=f.storage;
  try{
    const view=createRacingCourseView(f.scene,f.state);view.frame();
    assert.ok(f.scene.getObjectByName('Personal racing ghost')?.visible);
    f.state.missions.active=[];view.frame();assert.equal(f.scene.getObjectByName('Personal racing ghost'),undefined);
    view.dispose();assert.equal(f.scene.children.length,1);
  }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});
