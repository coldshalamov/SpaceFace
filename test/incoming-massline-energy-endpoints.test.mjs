import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {vfx} from '../src/render/vfx.js';
import {createAttachmentService} from '../src/combat/attachments.js';
import {createCombatCatalog,ensureCombatState} from '../src/combat/runtime.js';
import {createBus} from '../src/core/eventBus.js';
import {createGameState} from '../src/core/gameState.js';

test('incoming canonical attachment energy volume connects its actual endpoints',()=>{
  const state=createGameState(47), makeShip=(id,x,z)=>({id,type:'ship',team:id===1?0:2,alive:true,
    pos:{x,z},vel:{x:0,z:0},rot:0,radius:8,mass:20,hull:100,hullMax:100,flags:{},data:{}});
  const player=makeShip(1,0,0),enemy=makeShip(2,40,30);
  state.playerId=1;state.entities=new Map([[1,player],[2,enemy]]);state.entityList=[player,enemy];ensureCombatState(state);
  const bus=createBus(),helpers={combatPhysics:{createAttachment(input){return{id:input.attachmentId}},cutAttachment(){return true;}}};
  const service=createAttachmentService({state,catalog:createCombatCatalog(),helpers,bus});
  const created=service.create({defId:'attachment_massline',ownerId:enemy.id,targetId:player.id});
  assert.equal(created.ok,true,created.reason);
  const scene=new THREE.Scene();state.render={scene};
  const host=Object.create(vfx);host.init({state,bus:{on(){return()=>{};}},helpers:{}});host._initEnergy();
  const ribbon=host._energy.ribbon,core=ribbon.userData.energyCore,halo=ribbon.userData.energyHalo;
  const coreMat=core.material,haloMat=halo.material;
  const geometry=core.geometry;geometry.computeBoundingBox();
  assert.ok(Math.abs(geometry.boundingBox.min.z)<1e-6 && Math.abs(geometry.boundingBox.max.z-1)<1e-6,
    'actual cylinder axis runs from local +Z 0 to 1');
  try {
    assert.equal(state.settings.video.energyMaterials,true);
    assert.equal(host._energyMasslineRelevant(),true);
    for(const [x,z] of [[40,30],[40,-30],[-40,30],[-40,-30],[40,0],[0,40]]) {
      enemy.pos.x=x;enemy.pos.z=z;
      host._updateEnergyMassline(1/60);assert.equal(ribbon.visible,true);
      ribbon.updateMatrixWorld(true);
      const start=new THREE.Vector3(0,0,0).applyMatrix4(ribbon.matrixWorld);
      const end=new THREE.Vector3(0,0,1).applyMatrix4(ribbon.matrixWorld);
      assert.ok(Math.hypot(start.x-player.pos.x,start.z-player.pos.z)<1e-5);
      assert.ok(Math.hypot(end.x-x,end.z-z)<1e-5,`end (${end.x},${end.z}) should reach (${x},${z})`);
      assert.equal(core.material,coreMat);assert.equal(halo.material,haloMat);
    }
    assert.equal(service.cut(created.attachment.id,enemy.id).ok,true);
    host._updateEnergyMassline(1/60);assert.equal(ribbon.visible,false,'cut retires the visual');
  } finally {host.destroy();}
});
