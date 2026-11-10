import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { RED_KITE as C } from '../src/data/redKite.js';
import { redKite, redKiteCourierSpec } from '../src/systems/redKite.js';
import { markPhysicsBodyNativeFailure } from '../src/core/physicsAuthority.js';
import { validateMotionBank } from '../src/contracts/motionBank.js';
import { attachAuthoredMotionDriver } from '../src/render/authoredMotion.js';
import { createRedKiteVisualDriver, RED_KITE_MOTION_NODES } from '../src/render/redKiteVisuals.js';

function fixture() {
  const root=new THREE.Group(),scene=new THREE.Scene(),nodes={};
  for(const name of RED_KITE_MOTION_NODES){const node=new THREE.Group();node.name=name;root.add(node);nodes[name]=node;}
  root.userData.redKiteAuthoredSource={assetId:C.assetId,file:'assets/ships/release/parts/wholeships/red_kite.glb'};
  scene.add(root);
  const entity={...redKiteCourierSpec(),id:41,occupantGeneration:9,alive:true,rot:0,mesh:root};
  const state={meta:{seed:4242},mode:'flight',tick:100,entities:new Map([[entity.id,entity]]),entityList:[entity],
    world:{currentSectorId:C.sectorId},render:{scene},settings:{},player:{}};
  const record={entity,body:{handle:42},effectiveInertiaY:3000,spec:{inertiaY:3000}};
  const nativeOwner={tick:714,_simTick:state.tick,records:new Map([[entity.id,record]])};
  const physics={_diag:{backend:'rapier-dynamic',sg02Ready:true},_sg02:nativeOwner};
  const owner=Object.create(redKite);owner.init({state,bus:{on(){return()=>{};},emit(){}},helpers:{},
    registry:{get(name){return name==='physics'?physics:null;}}});
  owner._courier=entity;owner._courierLife=entity.occupantGeneration;owner._phase='race';
  const native=(force=0,acceleration=0,tick=state.tick)=>{
    nativeOwner.tick++;nativeOwner._simTick=tick;record._postStepReadTick=nativeOwner.tick;
    record.appliedForce={x:C.mass*C.mainAccel*force,y:0,z:0};record.appliedTorque={y:3000*acceleration};
  };
  native();
  return {root,scene,nodes,entity,state,owner,native,
    receipt(sequence=1,index=0){owner._handoff={id:`${C.courseId}:run:${sequence}:courier:${index}`,gateIndex:index,atTick:state.tick,life:entity.occupantGeneration};},
    step(driver,time,a11y={}){driver.update(entity,time,a11y,state);},
    destroy(){owner.destroy();},
  };
}
const pitch=node=>new THREE.Euler().setFromQuaternion(node.quaternion).x;
const near=(value,expected)=>assert(Math.abs(value-expected)<1e-8,`${value} != ${expected}`);

test('Red Kite sealed bank matches the actual source hash and exported three rigid rest poses',()=>{
  const bytes=readFileSync(new URL('../assets/ships/parts/wholeships/red_kite.glb',import.meta.url));
  const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
  const bank=JSON.parse(readFileSync(new URL('../assets/ships/motions/red-kite.motion.json',import.meta.url),'utf8'));
  validateMotionBank(bank);
  assert.equal(bank.sourceGlbSha256,createHash('sha256').update(bytes).digest('hex'));
  assert.equal(bank.sourceAssetId,C.assetId);assert.deepEqual(bank.bindings.map(b=>b.node).sort(),[...RED_KITE_MOTION_NODES].sort());
  for(const binding of bank.bindings){const node=doc.nodes.find(n=>n.name===binding.node);assert(node);
    assert.deepEqual(binding.restPose.translation,node.translation||[0,0,0]);
    assert.deepEqual(binding.restPose.rotation,node.rotation||[0,0,0,1]);
    assert.deepEqual(binding.restPose.scale,node.scale||[1,1,1]);
    assert.deepEqual(binding.requiredAtLod,[0,1,2]);
  }
});

test('only the exact source courier can bind; native applied force and angular acceleration drive bounded trim',()=>{
  const h=fixture(),driver=createRedKiteVisualDriver(h.root,h.entity);assert(driver);
  assert.equal(createRedKiteVisualDriver(h.root,{...h.entity,data:{...h.entity.data,redKiteActorId:'foreign'}}),null);
  h.root.userData.redKiteAuthoredSource.assetId='foreign';assert.equal(createRedKiteVisualDriver(h.root,h.entity),null);
  h.root.userData.redKiteAuthoredSource.assetId=C.assetId;
  h.step(driver,0);h.native(.5,C.yawAccel);h.step(driver,.1);
  assert(pitch(h.nodes.MOTION_RED_KITE_FLAP)>0);assert(pitch(h.nodes.MOTION_RED_KITE_FLAP)<12*Math.PI/180);
  h.native(1,-C.yawAccel);h.step(driver,.2);assert(pitch(h.nodes.MOTION_RED_KITE_FLAP)<0);
  h.state.tick+=3;h.step(driver,.3);near(pitch(h.nodes.MOTION_RED_KITE_FLAP),0,'stale native frame rests');
  h.native(1,C.yawAccel);markPhysicsBodyNativeFailure(h.entity,{});h.step(driver,.4);near(pitch(h.nodes.MOTION_RED_KITE_FLAP),0);
  h.destroy();
});

test('one accepted gate handoff opens unequal-source clamps once; saved/cold receipts never replay',()=>{
  const h=fixture(),driver=createRedKiteVisualDriver(h.root,h.entity);
  h.step(driver,0);h.receipt();h.step(driver,1);h.step(driver,1.35);
  near(pitch(h.nodes.MOTION_RED_KITE_CLAMP_PORT),-35*Math.PI/180);
  near(pitch(h.nodes.MOTION_RED_KITE_CLAMP_STARBOARD),35*Math.PI/180);
  h.step(driver,1.8);h.step(driver,2.35);near(pitch(h.nodes.MOTION_RED_KITE_CLAMP_PORT),0);
  driver.dispose();const reopened=createRedKiteVisualDriver(h.root,h.entity);h.step(reopened,3);h.step(reopened,3.35);
  near(pitch(h.nodes.MOTION_RED_KITE_CLAMP_PORT),0);
  h.receipt(2);h.step(reopened,4);h.step(reopened,4.35);assert(pitch(h.nodes.MOTION_RED_KITE_CLAMP_PORT)<0);
  h.destroy();
});

test('future/foreign receipts, reduced motion and replaced occupants cannot gesture or write simulation',()=>{
  const h=fixture(),driver=createRedKiteVisualDriver(h.root,h.entity);h.step(driver,0);
  h.receipt();h.owner._handoff.atTick++;h.step(driver,1);h.step(driver,1.35);near(pitch(h.nodes.MOTION_RED_KITE_CLAMP_PORT),0);
  h.owner._handoff.atTick=h.state.tick;h.owner._handoff.life++;h.step(driver,2);h.step(driver,2.35);near(pitch(h.nodes.MOTION_RED_KITE_CLAMP_PORT),0);
  h.receipt(2);const before=JSON.stringify({data:h.entity.data,memory:h.state.redKite,handoff:h.owner._handoff});
  h.step(driver,3,{reducedMotion:true});h.step(driver,3.35);near(pitch(h.nodes.MOTION_RED_KITE_CLAMP_PORT),0);
  assert.equal(JSON.stringify({data:h.entity.data,memory:h.state.redKite,handoff:h.owner._handoff}),before);
  h.receipt(3);h.step(driver,4);h.step(driver,4.35);assert(pitch(h.nodes.MOTION_RED_KITE_CLAMP_PORT)<0);
  h.state.entities.set(h.entity.id,{...h.entity,occupantGeneration:10});h.step(driver,5);near(pitch(h.nodes.MOTION_RED_KITE_CLAMP_PORT),0);
  h.state.entities.set(h.entity.id,h.entity);h.root.removeFromParent();h.step(driver,6);near(pitch(h.nodes.MOTION_RED_KITE_FLAP),0);
  driver.dispose();h.destroy();
});

test('the existing authored-motion owner forwards current state and detaches Red Kite back to rest',()=>{
  const h=fixture(),detach=attachAuthoredMotionDriver(h.root,h.entity,[]);assert.equal(typeof detach,'function');
  h.root.userData.updateAuthoredMotion(h.entity,0,{},h.state);h.native(.5,C.yawAccel);
  h.root.userData.updateAuthoredMotion(h.entity,.1,{},h.state);assert(pitch(h.nodes.MOTION_RED_KITE_FLAP)>0);
  detach();near(pitch(h.nodes.MOTION_RED_KITE_FLAP),0);assert.equal(h.root.userData.updateAuthoredMotion,undefined);h.destroy();
});
