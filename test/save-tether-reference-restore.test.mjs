import test from 'node:test';
import assert from 'node:assert/strict';
import {CERES_WORKFLEET_CONTRACT as C} from '../src/data/ceresWorkfleet.js';
import {ceresWorkfleetHardwareSpec} from '../src/data/ceresWorkfleetHardware.js';
import {captureEntityRecord} from '../src/world/worldRecords.js';
import {save} from '../src/save/saveSystem.js';
import {isThrowArmPayload} from '../src/systems/input.js';
import {PRODUCTION_UPDATE_ORDER} from '../src/runtime/authoritativeSystemManifest.js';
function fixture(){
 const player={id:1,occupantGeneration:4,alive:true,type:'ship'},target={id:8,occupantGeneration:7,alive:true,type:'payload'};
 const state={playerId:1,player:{tether:{active:true,targetId:2,attachmentId:'att_3',restLength:33.1,phase:'loaded',cadence:{phase:'coast',appliedWork:9},storedEnergy:6}},entities:new Map([[1,player],[8,target],[2,{id:2,occupantGeneration:10,alive:true,type:'asteroid'}]]),combat:{attachments:{byId:{att_3:{id:'att_3',state:'active',ownerId:1,targetId:8,ownerGeneration:4,targetGeneration:7}}}}};
 const data={attachments:{byId:{att_3:{id:'att_3',ownerRef:{kind:'player'},targetRef:{kind:'persistent',saveId:'2'}}}}};
 return {state,data,map:new Map([['player',1],['1',1],['2',8]]),target,player};
}
const restore=f=>save._restorePlayerTetherReference.call({state:f.state},f.data,f.map);
test('save remap binds exact canonical line before input can resolve a reused raw id',()=>{const f=fixture(),saved=structuredClone(f.state.player.tether);assert.equal(isThrowArmPayload(f.state),false);restore(f);assert.deepEqual(f.state.player.tether,{...saved,targetId:8});assert.equal(isThrowArmPayload(f.state),true);});
test('idempotent reference restoration preserves all non-reference mirror fields',()=>{const f=fixture();restore(f);const once=structuredClone(f.state.player.tether);restore(f);assert.deepEqual(f.state.player.tether,once);});
for(const [name,mutate] of Object.entries({
 wrongAttachmentId:f=>f.state.combat.attachments.byId.att_3.id='att_other',
 wrongSavedId:f=>f.data.attachments.byId.att_3.id='att_other',
 missing:f=>delete f.state.combat.attachments.byId.att_3,
 inactive:f=>f.state.combat.attachments.byId.att_3.state='broken',
 foreignOwner:f=>f.state.combat.attachments.byId.att_3.ownerId=6,
 staleOwnerLife:f=>f.player.occupantGeneration++,
 staleTargetLife:f=>f.target.occupantGeneration++,
 wrongMirror:f=>f.state.player.tether.targetId=6,
 wrongMap:f=>f.map.set('2',2),
 noMap:f=>f.map=null,
 absentTarget:f=>f.state.entities.delete(8),
 deadTarget:f=>f.target.alive=false,
 foreignSavedOwner:f=>f.data.attachments.byId.att_3.ownerRef={kind:'persistent',saveId:'6'},
}))test('unproven active mirror refuses '+name,()=>{const f=fixture();mutate(f);restore(f);assert.equal(f.state.player.tether.active,false);assert.equal(f.state.player.tether.targetId,null);assert.equal(f.state.player.tether.attachmentId,null);assert.equal(f.state.player.tether.storedEnergy,6);});
test('inactive mirror is not adopted or rewritten',()=>{const f=fixture();f.state.player.tether.active=false;const before=structuredClone(f.state.player.tether);restore(f);assert.deepEqual(f.state.player.tether,before);});
function semanticFixture(kind){const f=fixture();
 if(kind==='worldRecord'){
  Object.assign(f.target,ceresWorkfleetHardwareSpec('cradle'),{id:8,occupantGeneration:7,alive:true});
  const record=captureEntityRecord(f.target,{sectorId:C.sectorId,tick:0});
  f.state.world={records:{byId:{[record.recordId]:record}}};
  f.data.attachments.byId.att_3.targetRef={kind:'worldRecord',recordId:C.identities.cradle};
 }else{
  Object.assign(f.target,{type:'wreck',mass:C.existing.section.mass,hull:80,data:{worldRecordId:C.identities.payload,worldSiteId:C.siteId,worldSitePayloadId:C.existing.section.payloadId,worldSiteStructural:true,persistenceOwner:'asteroidSites'}});
  f.state.sites={worldById:{[C.siteId]:{manifestId:C.siteId,sectorId:C.sectorId,payloads:{[C.existing.section.payloadId]:{status:'released',remainingHull:80}}}}};
  f.data.attachments.byId.att_3.targetRef={kind:'worldSite',siteId:C.siteId,payloadId:C.existing.section.payloadId,worldObjectId:C.identities.payload};
 }
 return f;
}
for(const kind of ['worldRecord','worldSite'])test('canonical semantic resolver preserves '+kind+' across ID collisions and absent legacy mapping',()=>{const f=semanticFixture(kind);restore(f);assert.equal(f.state.player.tether.targetId,8);f.map.set('8',9);restore(f);assert.equal(f.state.player.tether.targetId,8);f.state.player.tether.targetId=2;f.map.delete('2');restore(f);assert.equal(f.state.player.tether.targetId,8);});
test('two player lines preserve the exact saved attachment selection',()=>{const f=fixture();f.state.combat.attachments.byId.att_1={...f.state.combat.attachments.byId.att_3,id:'att_1',targetId:2};restore(f);assert.equal(f.state.player.tether.attachmentId,'att_3');assert.equal(f.state.player.tether.targetId,8);});
test('self-target cannot be a live player tow mirror',()=>{const f=fixture();f.map.set('2',1);f.state.combat.attachments.byId.att_3.targetId=1;f.state.combat.attachments.byId.att_3.targetGeneration=4;restore(f);assert.equal(f.state.player.tether.active,false);});
for(const value of [undefined,null])test('missing legacy mirror remains absent: '+value,()=>{const f=fixture();f.state.player.tether=value;restore(f);assert.equal(f.state.player.tether,value);});
test('input and flight precede the tether mirror refresh in production',()=>{assert(PRODUCTION_UPDATE_ORDER.indexOf('input')<PRODUCTION_UPDATE_ORDER.indexOf('flightSlot'));assert(PRODUCTION_UPDATE_ORDER.indexOf('flightSlot')<PRODUCTION_UPDATE_ORDER.indexOf('tetherGameplay'));});
