import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TALLY_THREE } from '../src/data/tallyThree.js';
import { attachAuthoredMotionDriver } from '../src/render/authoredMotion.js';
import { createTallyThreeVisualDriver, TALLY_THREE_MOTION_NODES } from '../src/render/tallyThreeVisuals.js';

const PAID_RECEIPT = `tally-three:${TALLY_THREE.worldRecordId}`;

function fixture() {
  const root = new THREE.Group(), scene = new THREE.Scene(), nodes = {};
  for (const name of TALLY_THREE_MOTION_NODES) {
    const node = new THREE.Group(); node.name = name; root.add(node); nodes[name] = node;
  }
  nodes.MOTION_TALLY_STAMP.position.set(-7.07, 2.5, 0);
  root.userData.tallyThreeAuthoredSource = {assetId:'SF_PLACE_TALLY_3',file:'assets/ships/release/parts/places/place_tally_three.glb'};
  scene.add(root);
  const entity = {id:19,occupantGeneration:7,alive:true,mesh:root,data:{worldRecordId:TALLY_THREE.assessorId,
    role:'claim_assessor',tallyThree:{phase:'patrol',tick:1}}};
  const source = {sourceKey:TALLY_THREE.sourceKey,extracted:false,evidenceObserved:false,evidenceRevision:0};
  const state = {entities:new Map([[entity.id,entity]]),world:{currentSectorId:TALLY_THREE.sectorId},render:{scene},
    salvage:{sources:{[TALLY_THREE.sourceKey]:source}},player:{credits:31},economy:{committedIntents:{}}};
  const receipt = receiptId => ({receiptId,sourceKey:TALLY_THREE.sourceKey,worldRecordId:TALLY_THREE.worldRecordId,
    stationId:TALLY_THREE.homeStationId,commodityId:'cmdty_salvage_electronics',qty:4,quoteCr:18,
    claimId:TALLY_THREE.claimId,manifestId:TALLY_THREE.manifestId,tick:2});
  return {root,nodes,entity,state,source,receipt,
    accept(creditedCr=18) {
      const accepted=source.delivery;
      state.economy.committedIntents[accepted.receiptId]={receipt:{...accepted},
        result:{receiptId:accepted.receiptId,qty:accepted.qty,stationId:accepted.stationId,creditedCr}};
    },
    step(driver,time,a11y={}) {driver.update(entity,time,a11y,state);},
  };
}
const yaw = node => new THREE.Euler().setFromQuaternion(node.quaternion,'YXZ').y;
const near = (value,expected) => assert(Math.abs(value-expected)<1e-8,`${value} != ${expected}`);

test('only the authored Tally assessor source can acquire the four instrument groups',()=>{
  const h=fixture();assert(createTallyThreeVisualDriver(h.root,h.entity));
  assert.equal(createTallyThreeVisualDriver(h.root,{...h.entity,data:{...h.entity.data,worldRecordId:'foreign'}}),null);
  h.root.userData.tallyThreeAuthoredSource.assetId='SF_PLACE_OTHER';
  assert.equal(createTallyThreeVisualDriver(h.root,h.entity),null);
  h.root.userData.tallyThreeAuthoredSource.assetId='SF_PLACE_TALLY_3';h.nodes.MOTION_TALLY_SCAN.removeFromParent();
  assert.throws(()=>createTallyThreeVisualDriver(h.root,h.entity),/four authored/);
});

test('real assessment and dispute phases open unequal arms with continuous finite travel',()=>{
  const h=fixture(),driver=createTallyThreeVisualDriver(h.root,h.entity);
  h.step(driver,0);near(yaw(h.nodes.MOTION_TALLY_ARM_LEFT),0);
  h.entity.data.tallyThree={phase:'assess',tick:2};h.step(driver,1);h.step(driver,1.7);
  const halfway=yaw(h.nodes.MOTION_TALLY_ARM_LEFT);near(halfway,55*Math.PI/360);
  h.entity.data.tallyThree={phase:'disputed',tick:3};h.step(driver,1.7);
  near(yaw(h.nodes.MOTION_TALLY_ARM_LEFT),halfway);
  h.step(driver,3.1);near(yaw(h.nodes.MOTION_TALLY_ARM_LEFT),62*Math.PI/180);
  near(yaw(h.nodes.MOTION_TALLY_ARM_RIGHT),-39*Math.PI/180);
  h.entity.data.tallyThree={phase:'patrol',tick:4};h.step(driver,4);h.step(driver,5.4);
  near(yaw(h.nodes.MOTION_TALLY_ARM_LEFT),0);near(yaw(h.nodes.MOTION_TALLY_ARM_RIGHT),0);
});

test('stamp strokes once only for the actor phase naming the accepted source settlement',()=>{
  const h=fixture(),driver=createTallyThreeVisualDriver(h.root,h.entity),stamp=h.nodes.MOTION_TALLY_STAMP;
  h.step(driver,0);h.entity.data.tallyThree={phase:'receipt',tick:2,receiptId:PAID_RECEIPT};
  h.step(driver,1);h.step(driver,1.225);near(stamp.position.y,2.5);
  h.source.delivery=h.receipt('foreign');h.source.delivery.stationId='wrong';h.source.extracted=true;
  h.step(driver,2);h.step(driver,2.225);near(stamp.position.y,2.5);
  h.source.delivery=h.receipt(PAID_RECEIPT);h.accept();h.step(driver,3);h.step(driver,3.225);near(stamp.position.y,2.15);
  h.step(driver,3.6);near(stamp.position.y,2.5);
  h.entity.data.tallyThree.tick++;h.step(driver,4);h.step(driver,4.225);near(stamp.position.y,2.5);
  driver.dispose();
  const reopened=createTallyThreeVisualDriver(h.root,h.entity);h.step(reopened,5);h.step(reopened,5.225);
  near(stamp.position.y,2.5,'existing settlement cannot replay on a rebuilt model');
});

test('pending custody cannot consume the later accepted payment or its matching actor phase',()=>{
  const h=fixture(),driver=createTallyThreeVisualDriver(h.root,h.entity),stamp=h.nodes.MOTION_TALLY_STAMP;
  h.source.extracted=true;h.source.delivery=h.receipt(PAID_RECEIPT);
  h.entity.data.tallyThree={phase:'assess',tick:2};
  h.step(driver,0);h.step(driver,.225);near(stamp.position.y,2.5);
  h.entity.data.tallyThree={phase:'receipt',tick:3,receiptId:PAID_RECEIPT};
  h.step(driver,1);h.step(driver,1.225);near(stamp.position.y,2.5,'custody alone is not paid');
  h.entity.data.tallyThree={phase:'assess',tick:4};h.accept(0);
  h.step(driver,2);h.step(driver,2.225);near(stamp.position.y,2.5,'commit alone waits for the actor receipt');
  h.entity.data.tallyThree={phase:'receipt',tick:5,receiptId:PAID_RECEIPT};
  h.step(driver,3);h.step(driver,3.225);near(stamp.position.y,2.15);
  h.step(driver,3.6);h.entity.data.tallyThree.tick++;h.step(driver,4);h.step(driver,4.225);near(stamp.position.y,2.5);
});

test('scan sweep follows new observed manifest evidence and does not loop on saved facts',()=>{
  const h=fixture(),driver=createTallyThreeVisualDriver(h.root,h.entity),scan=h.nodes.MOTION_TALLY_SCAN;
  h.step(driver,0);h.entity.data.tallyThree={phase:'assess',tick:2};h.step(driver,1);h.step(driver,1.7);near(yaw(scan),0);
  h.source.evidenceObserved=true;h.source.evidenceRevision=1;
  h.step(driver,2);h.step(driver,2.7);near(yaw(scan),8*Math.PI/180);
  h.step(driver,3.5);near(yaw(scan),0);h.step(driver,4.7);near(yaw(scan),0);
  driver.dispose();const restored=createTallyThreeVisualDriver(h.root,h.entity);
  h.step(restored,5);h.step(restored,5.7);near(yaw(scan),0);
});

test('reduced motion, stale occupants, scene detachment and disposal retain truthful rest and never change game state',()=>{
  const h=fixture(),driver=createTallyThreeVisualDriver(h.root,h.entity);
  h.step(driver,0);h.entity.data.tallyThree={phase:'receipt',tick:2,receiptId:PAID_RECEIPT};
  h.source.delivery=h.receipt(PAID_RECEIPT);h.source.extracted=true;h.accept();
  const before=JSON.stringify({source:h.source,entity:h.entity.data,player:h.state.player});
  h.step(driver,1,{reducedMotion:true});h.step(driver,1.225);near(h.nodes.MOTION_TALLY_STAMP.position.y,2.5);
  assert.equal(JSON.stringify({source:h.source,entity:h.entity.data,player:h.state.player}),before);
  h.entity.data.tallyThree={phase:'assess',tick:3};h.step(driver,2);h.step(driver,2.7);
  assert(yaw(h.nodes.MOTION_TALLY_ARM_LEFT)>0);
  h.state.entities.set(h.entity.id,{...h.entity,occupantGeneration:8});h.step(driver,3);near(yaw(h.nodes.MOTION_TALLY_ARM_LEFT),0);
  h.state.entities.set(h.entity.id,h.entity);h.root.removeFromParent();h.step(driver,4);near(yaw(h.nodes.MOTION_TALLY_ARM_LEFT),0);
  driver.dispose();h.step(driver,5);near(yaw(h.nodes.MOTION_TALLY_ARM_LEFT),0);
});

test('existing authored-motion owner forwards real state to a bank-free Tally driver and retires it',()=>{
  const h=fixture(),detach=attachAuthoredMotionDriver(h.root,h.entity,[]);
  assert.equal(typeof detach,'function');
  h.root.userData.updateAuthoredMotion(h.entity,0,{},h.state);
  h.entity.data.tallyThree={phase:'assess',tick:2};
  h.root.userData.updateAuthoredMotion(h.entity,1,{},h.state);h.root.userData.updateAuthoredMotion(h.entity,1.7,{},h.state);
  assert(yaw(h.nodes.MOTION_TALLY_ARM_LEFT)>0);
  detach();near(yaw(h.nodes.MOTION_TALLY_ARM_LEFT),0);assert.equal(h.root.userData.updateAuthoredMotion,undefined);
});
