import test from 'node:test';
import assert from 'node:assert/strict';
import { ninthMouthBodySpec, isNinthMouthBodyEligible, isNinthMouthBody, NINTH_MOUTH_ROLES, ninthMouthRoleForRecord } from '../src/world/ceresNinthMouthBodies.js';
import { captureEntityRecord, spawnSpecFromRecord, normalizeRecord, normalizeRecordsBag, serializeRecordsBag, entityIsDurableCandidate, recordShouldRematerialize } from '../src/world/worldRecords.js';
import { advanceWorldRecord, advanceWorldRecordInto } from '../src/world/worldCatchup.js';
import { makeEntity } from '../src/core/entity.js';
import { ensurePhysicsBodySpec } from '../src/core/physicsAuthority.js';
const clone = x => JSON.parse(JSON.stringify(x));
function body(role) { const e=ninthMouthBodySpec(role);e.id=`live:${role}`;e.alive=true;ensurePhysicsBodySpec(e);return e; }
test('every finite original keeps identity, canonical hardware, pose and damaged vitals through records JSON',()=>{
  const byId={};
  for(const role of NINTH_MOUTH_ROLES){
    const e=body(role);e.pos.x+=3;e.rot=.7;e.vel={x:2,z:-3};e.angVel=.1;e.hull-=9;
    assert.equal(entityIsDurableCandidate(e,'player'),true);
    const r=captureEntityRecord(e);assert.equal(r.kind,'npc');assert.equal(r.intent,null);assert.equal(ninthMouthRoleForRecord(r),role);byId[r.recordId]=r;
  }
  const saved=clone(serializeRecordsBag(normalizeRecordsBag({byId})));
  const restored=normalizeRecordsBag(saved);
  assert.equal(Object.keys(restored.byId).length,NINTH_MOUTH_ROLES.length);
  for(const r of Object.values(restored.byId)){
    const e=spawnSpecFromRecord(r);assert.ok(e,r.recordId);
    assert.equal(e.data.worldRecordId,r.recordId);assert.equal(e.data.identityKey,r.recordId);
    assert.deepEqual(e.physicsBody,r.itinerary.ninthMouth.physicsBody);
    for(const k of ['pos','vel','rot','angVel','hull','hullMax'])assert.deepEqual(e[k],r[k]);
    assert.equal(e.data.persistenceOwner,'worldRecords');
    assert.equal(captureEntityRecord(e).recordId,r.recordId);
  }
});
test('lamps keep independent light and installation state; fixed custody never drifts',()=>{
  for(const role of ['lamp:0','receiver','shoulder_north']){
    const e=body(role);e.vel={x:20,z:0};
    if(role==='lamp:0'){assert.equal(e.data.ninthMouthLight,true);e.data.ninthMouthInstalled=true;e.data.ninthMouthLight=false;e.physicsBody.dynamic=false;}
    if(role==='receiver')e.data.ninthMouthTag=true;
    const r=captureEntityRecord(e), back=spawnSpecFromRecord(r);assert.ok(back);
    assert.equal(back.data.ninthMouthLight,e.data.ninthMouthLight);assert.equal(back.data.ninthMouthTag,e.data.ninthMouthTag===true);
    assert.deepEqual(advanceWorldRecord(r,0,60).pos,r.pos);
    const mutable=clone(r);advanceWorldRecordInto(mutable,0,60);assert.deepEqual(mutable.pos,r.pos);
  }
  const loose=captureEntityRecord(body('fallen_rock'));loose.vel={x:2,z:0};
  assert.notDeepEqual(advanceWorldRecord(loose,0,10).pos,loose.pos);
});
test('barge restores canonical hull and passive crew without minted cargo',()=>{
  const e=body('barge');const r=captureEntityRecord(e),back=spawnSpecFromRecord(r);
  assert.equal(back.data.defId,'ship_ironback');assert.equal(back.data.ai.passive,true);
  assert.equal(back.data.ai.allowPassiveManeuver,false);assert.equal(back.data.ai.roe,'hold_fire');
  assert.equal(back.data.cargoManifest,null);assert.equal(back.mass,e.mass);
  e.data.cargoManifest={lotId:'existing-lot',totalQty:2,lines:[{commodityId:'cmdty_ore',qty:2}]};
  assert.deepEqual(spawnSpecFromRecord(captureEntityRecord(e)).data.cargoManifest,e.data.cargoManifest);
});
test('destroyed and malformed originals remain occupied and never become generic ships',()=>{
  const r=captureEntityRecord(body('lamp:1'));
  for(const edit of [x=>{x.kind='wrong'},x=>{x.sectorId=17},x=>{x.itinerary=null},x=>{x.enemyTypeId='enemy_pirate'},x=>{x.pos.x=NaN},x=>{x.identityKey='wrong'},x=>{x.itinerary.ninthMouth.physicsBody.dynamic=false},x=>{x.itinerary.ninthMouth.version=9}]){
    const bad=clone(r);edit(bad);const n=normalizeRecord(bad);
    assert.ok(n);assert.equal(spawnSpecFromRecord(n),null);assert.equal(recordShouldRematerialize(n,'FULL'),false);
    assert.equal(spawnSpecFromRecord(normalizeRecord(clone(n))),null);
  }
  for(const bad of [null,[],17,{recordId:'foreign'}]){
    const bag=normalizeRecordsBag({byId:{[r.recordId]:bad}});assert.ok(bag.byId[r.recordId]);assert.equal(spawnSpecFromRecord(bag.byId[r.recordId]),null);
  }
  const dead=body('barge');dead.alive=false;dead.hull=0;
  const tombstone=captureEntityRecord(dead);assert.equal(tombstone.alive,false);assert.equal(spawnSpecFromRecord(tombstone),null);
  const unknown=normalizeRecord({...r,recordId:'lw_ceres_ninth_mouth:unknown'});assert.ok(unknown);assert.equal(spawnSpecFromRecord(unknown),null);
});

test('runtime eligibility rejects copied tags with wrong physical contract or owner',()=>{
  for(const role of NINTH_MOUTH_ROLES){
    const e=makeEntity(ninthMouthBodySpec(role));ensurePhysicsBodySpec(e);
    assert.equal(isNinthMouthBodyEligible(e),true,role);
    for(const edit of [x=>{x.type='ship'},x=>{x.mass+=1},x=>{x.radius+=1},x=>{x.data.persistenceOwner='other'},
      x=>{x.pos.x=NaN},x=>{x.hullMax+=1},x=>{x.physicsBody.shape='ball'},x=>{x.physicsBody.dynamic=!x.physicsBody.dynamic}]){
      const bad=clone(e);edit(bad);
      if(role==='barge' && bad.type==='ship' && JSON.stringify(bad)===JSON.stringify(e))continue;
      assert.equal(isNinthMouthBody(bad),true);assert.equal(isNinthMouthBodyEligible(bad),false,role);
    }
  }
  const lamp=makeEntity(ninthMouthBodySpec('lamp:0'));lamp.data.ninthMouthInstalled=true;lamp.physicsBody.dynamic=false;
  assert.equal(isNinthMouthBodyEligible(lamp),true);
  const wrongShip=makeEntity(ninthMouthBodySpec('barge'));wrongShip.data.defId='ship_mule';
  assert.equal(isNinthMouthBodyEligible(wrongShip),false);
});
