import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {MODULES} from '../src/data/modules.js';
import {SABLE_VENN as S,freshSableVenn,normalizeSableVenn} from '../src/data/sableVenn.js';
import {validateMotionBank} from '../src/contracts/motionBank.js';
import {attachAuthoredMotionDriver} from '../src/render/authoredMotion.js';
import {createSableVennVisualDriver,SABLE_PATCHWORK_MOTION_NODES} from '../src/render/sableVennVisuals.js';
const moduleId=MODULES[0].id;
function fixture(){
  const root=new THREE.Group(),scene=new THREE.Scene(),nodes={};
  for(const name of SABLE_PATCHWORK_MOTION_NODES){const node=new THREE.Group();node.name=name;root.add(node);nodes[name]=node;}
  nodes.MOTION_SABLE_ARM_BASE.add(nodes.MOTION_SABLE_ARM_ELBOW);
  nodes.MOTION_SABLE_ARM_ELBOW.add(nodes.MOTION_SABLE_CLAMP_PORT,nodes.MOTION_SABLE_CLAMP_STARBOARD);
  root.userData.sableVennAuthoredSource={assetId:'SF_SHIP_SABLE_PATCHWORK',file:'assets/ships/release/parts/wholeships/sable_patchwork.glb'};scene.add(root);
  const entity={id:31,occupantGeneration:8,alive:true,mesh:root,pos:{x:200,z:70},data:{worldRecordId:S.worldRecordId,sectorId:S.sectorId,role:'shipwright',sableVenn:{phase:'available',tick:100}}};
  const station={id:2,alive:true,type:'station',radius:110,pos:{x:0,z:0},data:{stationId:S.stationId}};
  const state={tick:100,simTime:2,entities:new Map([[entity.id,entity],[station.id,station]]),entityList:[entity,station],world:{currentSectorId:S.sectorId},render:{scene},
    sableVenn:{...freshSableVenn(),met:true},spawnBudget:{entityOwners:new Map([[String(entity.id),S.worldRecordId]]),entityRefs:new Map([[String(entity.id),entity]])}};
  return {root,scene,nodes,entity,state,step(driver,now,a11y={}){driver.update(entity,now,a11y,state);},
    demonstrate(){state.tick++;state.sableVenn=normalizeSableVenn({...state.sableVenn,demonstratedItemIds:[moduleId]});entity.data.sableVenn={phase:'demonstrate',tick:state.tick,moduleId};},
    purchase(id='module:actual:1'){state.tick++;state.sableVenn.lastReceiptId=id;entity.data.sableVenn={phase:'receipt',tick:state.tick,receiptId:id};},
  };
}
const yaw=node=>new THREE.Euler().setFromQuaternion(node.quaternion,'YXZ').y;
const pitch=node=>new THREE.Euler().setFromQuaternion(node.quaternion).x;
const near=(value,expected)=>assert(Math.abs(value-expected)<1e-8,`${value} != ${expected}`);
test('Patchwork sealed bank matches source and the actual nested four-pivot hierarchy',()=>{
  const bytes=readFileSync(new URL('../assets/ships/parts/wholeships/sable_patchwork.glb',import.meta.url));
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
  const bank=JSON.parse(readFileSync(new URL('../assets/ships/motions/sable-patchwork.motion.json',import.meta.url),'utf8'));validateMotionBank(bank);
  assert.equal(bank.sourceGlbSha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(bank.bindings.length,4);
  for(const binding of bank.bindings){const index=doc.nodes.findIndex(n=>n.name===binding.node),node=doc.nodes[index];assert(node);
    assert.deepEqual(binding.restPose.translation,node.translation||[0,0,0]);assert.deepEqual(binding.restPose.rotation,node.rotation||[0,0,0,1]);
    if(binding.parent){const parent=bank.bindings.find(b=>b.id===binding.parent);assert(doc.nodes.find(n=>n.name===parent.node).children.includes(index));}
  }
});
test('only exact Patchwork source/berth owner accepted trial can unfold; parking is continuous and finite',()=>{
  const h=fixture(),driver=createSableVennVisualDriver(h.root,h.entity);assert(driver);h.step(driver,0);
  h.entity.data.sableVenn={phase:'demonstrate',tick:100,moduleId};h.step(driver,1);h.step(driver,1.9);near(yaw(h.nodes.MOTION_SABLE_ARM_BASE),0);
  h.demonstrate();h.step(driver,2);h.step(driver,2.9);near(yaw(h.nodes.MOTION_SABLE_ARM_BASE),-30*Math.PI/180);
  h.entity.data.sableVenn={phase:'available',tick:h.state.tick};h.step(driver,2.9);near(yaw(h.nodes.MOTION_SABLE_ARM_BASE),-30*Math.PI/180);
  h.step(driver,4.5);near(yaw(h.nodes.MOTION_SABLE_ARM_BASE),0);
  h.demonstrate();h.step(driver,5);h.step(driver,6.8);near(yaw(h.nodes.MOTION_SABLE_ARM_BASE),-60*Math.PI/180);
  h.step(driver,7.4);h.step(driver,9);near(yaw(h.nodes.MOTION_SABLE_ARM_BASE),0);
  h.root.userData.sableVennAuthoredSource.assetId='foreign';assert.equal(createSableVennVisualDriver(h.root,h.entity),null);
});
test('only actual accepted purchase works jaws once; cold old receipts and reduced motion do not replay',()=>{
  const h=fixture(),driver=createSableVennVisualDriver(h.root,h.entity);h.step(driver,0);
  h.entity.data.sableVenn={phase:'receipt',tick:h.state.tick,receiptId:'module:denied'};h.step(driver,1);h.step(driver,1.3);near(pitch(h.nodes.MOTION_SABLE_CLAMP_PORT),0);
  h.purchase();h.step(driver,2);h.step(driver,2.3);near(pitch(h.nodes.MOTION_SABLE_CLAMP_PORT),25*Math.PI/180);
  h.step(driver,2.8);h.step(driver,3.3);near(pitch(h.nodes.MOTION_SABLE_CLAMP_PORT),0);
  driver.dispose();const reopened=createSableVennVisualDriver(h.root,h.entity);h.step(reopened,4);h.step(reopened,4.3);near(pitch(h.nodes.MOTION_SABLE_CLAMP_PORT),0);
  h.purchase('module:actual:2');h.step(reopened,5,{reducedMotion:true});h.step(reopened,5.3);near(pitch(h.nodes.MOTION_SABLE_CLAMP_PORT),0);
});
test('lost budget identity, future stamp and hidden/retired bodies park without simulation mutation',()=>{
  const h=fixture(),driver=createSableVennVisualDriver(h.root,h.entity);h.step(driver,0);h.demonstrate();h.step(driver,1);h.step(driver,1.9);
  const before=JSON.stringify({memory:h.state.sableVenn,data:h.entity.data});h.step(driver,1.9,{reducedMotion:true});h.step(driver,3.5,{reducedMotion:true});near(yaw(h.nodes.MOTION_SABLE_ARM_BASE),0);
  assert.equal(JSON.stringify({memory:h.state.sableVenn,data:h.entity.data}),before);
  h.demonstrate();h.entity.data.sableVenn.tick++;h.step(driver,4);h.step(driver,4.9);near(yaw(h.nodes.MOTION_SABLE_ARM_BASE),0);
  h.entity.data.sableVenn.tick=h.state.tick;h.state.spawnBudget.entityRefs.set(String(h.entity.id),{...h.entity});h.step(driver,5);h.step(driver,6.6);near(yaw(h.nodes.MOTION_SABLE_ARM_BASE),0);
  h.root.visible=false;h.step(driver,7);driver.dispose();near(yaw(h.nodes.MOTION_SABLE_ARM_BASE),0);
});
test('a presentation clock restart parks from the visible current pose without replaying the trial',()=>{
  const h=fixture(),driver=createSableVennVisualDriver(h.root,h.entity);h.step(driver,0);h.demonstrate();h.step(driver,1);h.step(driver,1.9);
  const before=yaw(h.nodes.MOTION_SABLE_ARM_BASE);h.step(driver,.5);near(yaw(h.nodes.MOTION_SABLE_ARM_BASE),before);
  h.step(driver,2.1);near(yaw(h.nodes.MOTION_SABLE_ARM_BASE),0);h.step(driver,2.9);near(yaw(h.nodes.MOTION_SABLE_ARM_BASE),0);
});
test('existing authored owner forwards real Sable state and restores all nested groups on detach',()=>{
  const h=fixture(),detach=attachAuthoredMotionDriver(h.root,h.entity,[]);assert.equal(typeof detach,'function');
  h.root.userData.updateAuthoredMotion(h.entity,0,{},h.state);h.demonstrate();h.root.userData.updateAuthoredMotion(h.entity,1,{},h.state);h.root.userData.updateAuthoredMotion(h.entity,1.9,{},h.state);
  assert(yaw(h.nodes.MOTION_SABLE_ARM_BASE)<0);detach();near(yaw(h.nodes.MOTION_SABLE_ARM_BASE),0);assert.equal(h.root.userData.updateAuthoredMotion,undefined);
});
