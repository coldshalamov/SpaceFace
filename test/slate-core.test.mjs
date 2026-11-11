import test from 'node:test';
import assert from 'node:assert/strict';
import { isSlateCore, slateCoreLayout, syncSlateCore, slateCoreAtReceiver, prepareSlateReceipt, retireSlateCore,
 snapshotSlateCore, restoreSlateCore, parkSlateCore, materializeSlateAftermath } from '../src/missions/slateCoreWorksite.js';
function fixture() {
 const m = { id: 'earned-7', type:'tow_recovery', storyTag:'campaign47a:b3:berth', destSectorId:'sector_ceres_belt', status:'active', params:{slateCoreVersion:1}, targetEntityIds:[] };
 const state = { playerId:1, player:{tether:{}}, simTime:42, world:{currentSectorId:m.destSectorId}, entities:new Map(), entityList:[], missions:{active:[m]} };
 let id=10; const owner={state, helpers:{spawnEntity(spec){const e={...spec,id:id++,alive:true};state.entities.set(e.id,e);state.entityList.push(e);return e;},removeEntity(id){state.entities.delete(id);state.entityList=state.entityList.filter(e=>e.id!==id);}}, _failMission(m,i,reason){m.status='failed';m.reason=reason;}, _completePhysical(m,i,method){if(!prepareSlateReceipt(owner,m,method))return; m.status='completed';retireSlateCore(owner,m);}};
 return {owner,m,state};
}
test('fresh exact body and fixed reachable geometry; legacy untouched; idempotent spawn',()=>{
 const {owner,m,state}=fixture();assert.equal(isSlateCore({...m,params:{}}),false);syncSlateCore(owner,m);syncSlateCore(owner,m);
 assert.equal(state.entityList.length,2);const core=state.entities.get(m.targetEntityIds[0]);assert.equal(core.mass,36);assert.equal(core.physicsBody.mass,36);
 const l=slateCoreLayout();assert.equal(Math.hypot(l.receiver.x-l.staging.x,l.receiver.z-l.staging.z),110);assert.deepEqual(core.pos,l.staging);
});
test('only handled authentic live core under arrival speed qualifies; canonical receipt stable',()=>{
 const {owner,m,state}=fixture();syncSlateCore(owner,m);const core=state.entities.get(m.targetEntityIds[0]);core.pos={...slateCoreLayout().receiver};
 assert.equal(slateCoreAtReceiver(owner,m,core),false);m.params.slateCore.handled=true;core.vel={x:19,z:0};assert.equal(prepareSlateReceipt(owner,m,'sling_in'),false);
 core.vel.x=17;assert.equal(slateCoreAtReceiver(owner,m,{...core,data:{}}),false);assert.equal(prepareSlateReceipt(owner,m,'sling_in'),true);
 const receipt=structuredClone(m.params.slateReceipt);syncSlateCore(owner,m);assert.equal(m.status,'completed');assert.equal(core.alive,true);assert.deepEqual(m.params.slateReceipt,receipt);
 const saved=JSON.parse(JSON.stringify(state.missions.slateCoreAftermath));restoreSlateCore(saved);state.entities.clear();state.entityList=[];state.missions.slateCoreAftermath=saved;
 materializeSlateAftermath(owner);materializeSlateAftermath(owner);assert.equal(state.entityList.length,2);assert.deepEqual(saved.params.slateReceipt,receipt);assert.equal(saved.status,'completed');
});
test('mid-carry Continue preserves physical state and handling, not runtime ids',()=>{
 const {owner,m,state}=fixture();syncSlateCore(owner,m);const core=state.entities.get(m.targetEntityIds[0]);core.pos.x+=8;core.vel.x=-9;core.hull=120;m.params.slateCore.handled=true;
 snapshotSlateCore(owner,m);const saved=JSON.parse(JSON.stringify(m));restoreSlateCore(saved);assert.equal(saved.params.slateCore.entityId,undefined);
 state.entities.clear();state.entityList=[];state.missions.active=[saved];syncSlateCore(owner,saved);const restored=state.entities.get(saved.targetEntityIds[0]);assert.equal(restored.hull,120);assert.equal(restored.vel.x,-9);assert.equal(saved.params.slateCore.handled,true);
});
test('loss and malformed ledger fail closed, sector retirement is not loss',()=>{
 const {owner,m,state}=fixture();syncSlateCore(owner,m);parkSlateCore(owner,m);syncSlateCore(owner,m);assert.equal(m.status,'active');
 state.entities.get(m.targetEntityIds[0]).hull=0;syncSlateCore(owner,m);assert.equal(m.status,'failed');assert.equal(m.reason,'core_lost');
 const f=fixture();f.m.params.slateCore={pos:{x:NaN,z:0}};restoreSlateCore(f.m);syncSlateCore(f.owner,f.m);assert.equal(f.m.reason,'slate_record_invalid');assert.equal(f.state.entityList.length,0);
});
test('foreign and stale same-lineage targets, off-sector delivery, terminal aftermath loss',()=>{
 const {owner,m,state}=fixture();syncSlateCore(owner,m);const core=state.entities.get(m.targetEntityIds[0]);m.params.slateCore.handled=true;core.pos={...slateCoreLayout().receiver};
 assert.equal(slateCoreAtReceiver(owner,m,{...core,id:999}),false);
 assert.equal(slateCoreAtReceiver(owner,m,{...core,data:{...core.data,slateMissionId:'other'}}),false);
 state.world.currentSectorId='sector_tethys_junction';assert.equal(prepareSlateReceipt(owner,m,'tow_in'),false);syncSlateCore(owner,m);assert.equal(m.status,'active');
 state.world.currentSectorId=m.destSectorId;syncSlateCore(owner,m);assert.equal(m.status,'completed');const aftermath=state.missions.slateCoreAftermath;
 const receipt=JSON.stringify(aftermath.params.slateReceipt);core.hull=0;snapshotSlateCore(owner,aftermath);assert.equal(aftermath.params.slateCore.lost,true);
 for(let i=0;i<3;i++) { const saved=JSON.parse(JSON.stringify(aftermath));restoreSlateCore(saved);state.missions.slateCoreAftermath=saved;state.entities.clear();state.entityList=[];materializeSlateAftermath(owner);assert.equal(state.entityList.length,0);assert.equal(JSON.stringify(saved.params.slateReceipt),receipt); }
});
test('completed aftermath cannot mint missing ledger; parking preserves fragments',()=>{
 const {owner,m,state}=fixture();m.status='completed';m.params.slateReceipt={missionId:m.id};state.missions.slateCoreAftermath=m;
 restoreSlateCore(m);materializeSlateAftermath(owner);assert.equal(state.entityList.length,0);
 const f=fixture();syncSlateCore(f.owner,f.m);const core=f.state.entities.get(f.m.targetEntityIds[0]);
 const fragment=f.owner.helpers.spawnEntity({...core,data:{...core.data,materialFragment:true}});
 parkSlateCore(f.owner,f.m);assert.equal(fragment.alive,true);assert.equal(core.alive,false);
});
