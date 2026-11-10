import test from 'node:test';
import assert from 'node:assert/strict';
import {captureProductionWorkfleet,allowProductionRecovery} from './ceres-production-recovery-budget.mjs';
const C={identities:{worker:'w',cutterHead:'h',payload:'s',cradle:'c'}};
const pose=(x=0,z=0,rot=0)=>({x,z,rot});
function fixture(){
 const entities=['w','h','s','c'].map((r,i)=>({id:i+1,occupantGeneration:10+i,alive:true,hull:100,pos:{x:i===0?10:0,z:0},vel:{x:0,z:0},rot:0,angVel:0,data:{worldRecordId:r},physicsBody:{schemaVersion:1,dynamic:true}}));
 const plan={schemaVersion:1,kind:'approach',startedTick:11900,deadlineTick:12010,start:pose(10),plate:pose(),turn:pose(10),stage:pose(),leg:'approach'};
 const mount={state:'active',ownerId:2,targetId:1,ownerGeneration:11,targetGeneration:10};
 const job={phase:'reacquire',reacquire:plan,mountId:'mount',blockedReason:null};
 const state={tick:12000,playerId:99,entityList:entities,entities:new Map(entities.map(e=>[e.id,e])),npcJobs:{ceresWorkfleet:job},combat:{attachments:{byId:{mount}}},world:{records:{byId:{}}}};
 const native={records:new Map(entities.map(e=>[e.id,{entity:e,body:{isEnabled:()=>true}}]))};
 // The integration supplies the real production restorers. This pure fixture
 // validates the boundary contract without importing or initializing a world.
 const restorePlan=p=>p?.schemaVersion===1&&Number.isSafeInteger(p.startedTick)&&Number.isSafeInteger(p.deadlineTick)&&p.deadlineTick>p.startedTick&&['start','plate','turn','stage'].every(k=>p[k]&&Object.values(p[k]).every(Number.isFinite))&&['turn','approach'].includes(p.leg)?structuredClone(p):null;
 const restoreReturnBudget=p=>p?.schemaVersion===1&&Number.isSafeInteger(p.startedTick)&&Number.isSafeInteger(p.deadlineTick)&&p.deadlineTick>p.startedTick?{...p}:null;
 const atPose=(e,p)=>Math.hypot(e.pos.x-p.x,e.pos.z-p.z)<=.2;
 const args={state,native,originalBodies:captureProductionWorkfleet(state,C),restorePlan,restoreReturnBudget,atPose,settleTicks:3};
 return {state,job,plan,entities,native,args,mount,open:()=>allowProductionRecovery(args)};
}
test('ordinary commissioning capture waits for complete roles',()=>{const f=fixture();assert.equal(captureProductionWorkfleet({...f.state,entityList:f.entities.slice(0,3)},C),null);assert.equal(f.args.originalBodies.length,4);});
test('valid finite approach finishes only with original physical stage and tow',()=>{const f=fixture(),a=f.open();assert.equal(a.deadline,12010);f.state.tick++;f.entities[0].pos.x=0;f.job.phase='extract';f.job.reacquire=null;f.job.towId='tow';f.state.combat.attachments.byId.tow={state:'active',ownerId:1,targetId:3,ownerGeneration:10,targetGeneration:12};assert.equal(a.check(),true);});
for(const [name,change] of Object.entries({
 'no active phase':f=>f.job.phase='head_retract','missing plan':f=>f.job.reacquire=null,'malformed plan':f=>f.plan.schemaVersion=2,
 'future plan':f=>f.plan.startedTick=12001,'expired plan':f=>f.plan.deadlineTick=12000,'nonfinite pose':f=>f.entities[0].pos.x=NaN,
 'nonfinite velocity':f=>f.entities[1].vel.z=Infinity,'changed life':f=>f.entities[0].occupantGeneration++,
 'replaced native entity':f=>f.native.records.get(1).entity={...f.entities[0]},'disabled native':f=>f.native.records.get(1).body.isEnabled=()=>false,
 'player custody':f=>f.entities[2].data.playerOwned=true,'world custody':f=>f.state.world.records.byId.s={playerOwned:true},
 'dead body':f=>f.entities[1].hull=0,'foreign control':f=>f.entities[0].data.controlLease={},
 'stale mount generation':f=>f.mount.ownerGeneration++,'missing mount':f=>delete f.state.combat.attachments.byId.mount,
 'foreign line':f=>f.state.combat.attachments.byId.foreign={state:'active',ownerId:99,targetId:3},
 'blocked plan':f=>f.job.blockedReason='reacquire-obstructed','malformed return budget':f=>f.job.reacquireReturnBudget={},
 'future return budget':f=>f.job.reacquireReturnBudget={schemaVersion:1,startedTick:12001,deadlineTick:12005},
 'expired return budget':f=>f.job.reacquireReturnBudget={schemaVersion:1,startedTick:11900,deadlineTick:12000},
 'wrong cutoff':f=>f.state.tick=12001,
}))test('reject '+name,()=>{const f=fixture();change(f);assert.throws(f.open);});
for(const [name,change] of Object.entries({
 'deadline extension':f=>f.plan.deadlineTick++,'deadline shortening':f=>f.plan.deadlineTick--,'plan restart':f=>f.plan.startedTick++,
 'plan replacement':f=>f.job.reacquire={...f.plan},'plan cleared':f=>f.job.reacquire=null,'geometry drift':f=>f.plan.stage.x++,
 'life reuse':f=>f.entities[0].occupantGeneration++,'job replacement':f=>f.state.npcJobs.ceresWorkfleet={...f.job},
 'return budget added':f=>f.job.reacquireReturnBudget={schemaVersion:1,startedTick:11900,deadlineTick:12009},
 'premature extract':f=>f.job.phase='extract',
}))test('reject later '+name,()=>{const f=fixture(),a=f.open();f.state.tick++;change(f);assert.throws(()=>a.check());});
test('freezes minimum original return deadline',()=>{const f=fixture();f.job.reacquireReturnBudget={schemaVersion:1,startedTick:11900,deadlineTick:12005};assert.equal(f.open().deadline,12005);});
test('rejects stationary and oscillating nonprogress within settling window',()=>{for(const oscillate of [false,true]){const f=fixture(),a=f.open();for(let i=1;i<=2;i++){f.state.tick++;f.entities[0].pos.x=oscillate?(i===1?9:10):10;a.check();}f.state.tick++;assert.throws(()=>a.check(),/physical progress/);}});
test('sustained progress still fails at unchanged deadline without extract',()=>{const f=fixture(),a=f.open();for(let i=1;i<10;i++){f.state.tick++;f.entities[0].pos.x-=.1;assert.equal(a.check(),false);}f.state.tick++;assert.throws(()=>a.check(),/without extract/);});
test('turn uses wrapped angle and permits forward transition only',()=>{const f=fixture();f.plan.leg='turn';f.entities[0].rot=-Math.PI+.1;f.plan.turn.rot=Math.PI-.1;const a=f.open();for(let i=1;i<=3;i++){f.state.tick++;f.entities[0].rot-=.03;a.check();}f.state.tick++;f.plan.leg='approach';a.check();f.state.tick++;f.plan.leg='turn';assert.throws(()=>a.check(),/forward leg/);});
test('skipped or backwards ticks cannot create progress credit',()=>{for(const tick of [11999,12002]){const f=fixture(),a=f.open();f.state.tick=tick;assert.throws(()=>a.check());}});

for(const life of [0,-1,1.5,NaN])test('reject invalid original generation '+life,()=>{const f=fixture();f.entities[0].occupantGeneration=life;f.args.originalBodies=captureProductionWorkfleet(f.state,C);assert.throws(f.open);});
for(const [name,change] of Object.entries({
 'missing native record':f=>f.native.records.delete(1),'section schema replacement':f=>f.entities[2].physicsBody={schemaVersion:1,dynamic:true},
 'section schema mutation':f=>f.entities[2].physicsBody.schemaVersion=2,'section ghost physical custody':f=>f.entities[2].collides=false,
 'section static physical custody':f=>f.entities[2].physicsBody.dynamic=false,'section structural mutation':f=>f.entities[2].data.worldSitePayloadId='other',
 'duplicate section':f=>f.state.entityList.push({...f.entities[2],id:99}),'duplicate worker':f=>f.state.entityList.push({...f.entities[0],id:99}),
 'native record replacement':f=>f.native.records.set(1,{...f.native.records.get(1)}),
}))test('reject later '+name,()=>{const f=fixture(),a=f.open();f.state.tick++;change(f);assert.throws(()=>a.check());});
test('duplicate live role rejected during original capture',()=>{const f=fixture();f.state.entityList.push({...f.entities[2],id:99});assert.throws(()=>captureProductionWorkfleet(f.state,C));});

test('return-to-work/replan cycles cannot claim final approach allowance',()=>{const f=fixture();f.plan.kind='return-to-work';assert.throws(f.open,/final approach/);});
