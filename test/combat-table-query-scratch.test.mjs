import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createGameState} from '../src/core/gameState.js';
import {createBus} from '../src/core/eventBus.js';
import {SpatialHash} from '../src/core/spatialHash.js';
import {packCombatTable,queryCombatTableEntities,COMBAT_TABLE_FLAGS as FLAGS} from '../src/core/combatTable.js';
import {createSg02DynamicBodyOwner} from '../src/core/sg02DynamicBodyOwner.js';
import {fields} from '../src/systems/fields.js';
import {weapons} from '../src/systems/weapons.js';
const DT=1/60;
function fixture(count=64){
 const state=createGameState(17),ships=Array.from({length:count},(_,i)=>({id:i+1,occupantGeneration:i+1,type:'ship',alive:true,collides:true,
  pos:{x:8*(i%8)+8,z:8*Math.floor(i/8)},vel:{x:0,z:0},rot:0,angVel:0,radius:1,mass:100,hull:100,team:1,data:{},
  physicsBody:{schemaVersion:1,dynamic:true,mass:100,radius:1,inertiaY:40,shape:'ball',useMeasuredSkin:false,material:'ship',ccd:true}}));
 state.tick=1;state.simTime=DT;state.entities=new Map(ships.map(e=>[e.id,e]));state.entityList=ships;
 state.entityIndex={shipLike:ships,ships,projectiles:[],wrecks:[]};state.spatialHash=new SpatialHash(32);state.spatialHash.rebuild(ships);packCombatTable(state);
 return {state,ships};
}
const ids=items=>items.map(e=>e.id);
test('repeated hash-backed queries own bounded scratch and one ordered occurrence per current body',()=>{
 const {state,ships}=fixture(),out=[];
 const first=ids(queryCombatTableEntities(state,0,0,100,out,FLAGS.SHIP));assert.equal(first.length,64);
 for(let i=0;i<5000;i++){
  assert.equal(queryCombatTableEntities(state,0,0,100,out,FLAGS.SHIP),out);
  assert.deepEqual(ids(out),first);assert.ok(state.combatTable._hashScratch.length<=ships.length);
 }
});
test('query changes, flag masks, removal and same-ID replacement match a fresh-scratch oracle',()=>{
 const {state,ships}=fixture(),out=[];
 for(const [x,z,r,mask] of [[0,0,100,FLAGS.SHIP],[64,56,20,FLAGS.SHIP],[0,0,100,FLAGS.PROJECTILE],[8,0,1,0]]){
  const oracle=[];state.combatTable._hashScratch=[];
  queryCombatTableEntities(state,x,z,r,oracle,mask);const expected=ids(oracle);
  for(let i=0;i<20;i++)assert.deepEqual(ids(queryCombatTableEntities(state,x,z,r,out,mask)),expected);
 }
 const old=ships[0],fresh={...old,occupantGeneration:999,pos:{...old.pos}};old.alive=false;ships[0]=fresh;state.entities.set(fresh.id,fresh);
 state.tick++;state.combatTable.packedOnce=false;state.spatialHash.rebuild(ships);packCombatTable(state);
 const result=queryCombatTableEntities(state,8,0,1,out,FLAGS.SHIP);assert.deepEqual(result,[fresh]);assert.ok(!state.combatTable._hashScratch.includes(old));
});
test('fallback and empty queries release prior owned scratch references without changing output identity',()=>{
 const {state}=fixture(),out=[];queryCombatTableEntities(state,0,0,100,out,FLAGS.SHIP);const scratch=state.combatTable._hashScratch;
 state.spatialHash=null;assert.equal(queryCombatTableEntities(state,0,0,100,out,FLAGS.SHIP),out);assert.equal(out.length,64);assert.equal(scratch.length,0);
 state.combatTable.count=0;queryCombatTableEntities(state,0,0,100,out);assert.equal(out.length,0);assert.equal(scratch.length,0);
});
test('a throwing append-style query cannot contaminate the next successful query',()=>{
 const {state}=fixture(),out=[];const hash=state.spatialHash,original=hash.queryRadius;
 hash.queryRadius=function(x,z,r,scratch){scratch.push(state.entities.get(1));throw new Error('injected query failure');};
 assert.throws(()=>queryCombatTableEntities(state,0,0,100,out),/injected/);assert.equal(out.length,0);
 hash.queryRadius=original;const hits=queryCombatTableEntities(state,0,0,100,out);assert.equal(hits.length,64);assert.equal(new Set(hits).size,64);
});
for(const warmups of [0,2,100])test(`ordinary vector mine issues exactly one authored impulse per target after ${warmups} earlier queries`,()=>{
 const {state}=fixture(),calls=[];
 for(let i=0;i<warmups;i++)queryCombatTableEntities(state,0,0,100,[],FLAGS.SHIP);
 weapons._detonateVectorMine.call({helpers:{combatPhysics:{applyImpulse:r=>{calls.push(r);return false;}}}},
  {id:1000,alive:true,pos:{x:0,z:0}},{blastRadius:100,impulse:10,ownerId:1,weaponId:'test-vector-mine'},state);
 assert.equal(calls.length,64);assert.equal(new Set(calls.map(c=>c.entityId)).size,64);
 for(const call of calls){const e=state.entities.get(call.entityId),expected=10*(1-Math.hypot(e.pos.x,e.pos.z)/100);assert.ok(Math.abs(Math.hypot(call.impulse.x,call.impulse.z)-expected)<1e-12);}
});
async function nativeMine(warmups,freshScratch){
 const {state,ships}=fixture(),native=await createSg02DynamicBodyOwner({publishTelemetry:false,fixedDt:DT}),calls=[];
 try{
  native.syncFromEntities(ships);for(let i=0;i<warmups;i++)queryCombatTableEntities(state,0,0,100,[],FLAGS.SHIP);
  if(freshScratch)state.combatTable._hashScratch=[];
  weapons._detonateVectorMine.call({helpers:{combatPhysics:{applyImpulse:r=>{calls.push(r);return native.applyImpulse(r);}}}},
   {id:1000,alive:true,pos:{x:0,z:0}},{blastRadius:100,impulse:10,ownerId:1,weaponId:'test-vector-mine'},state);
  const result=[];for(let i=0;i<30;i++){native.step(DT);result.push({poses:ships.map(e=>[e.pos.x,e.pos.z,e.vel.x,e.vel.z,e.rot,e.angVel]),native:createHash('sha256').update(JSON.stringify(native.exportWorldSnapshot())).digest('hex')});}
  return {calls: calls.map(c=>({entityId:c.entityId,impulse:c.impulse})),trace:result};
 }finally{native.dispose();}
}
test('ordinary mine native impulses and every scalar/native frame equal the nonaccumulating baseline',async()=>{
 assert.deepEqual(await nativeMine(100,false),await nativeMine(100,true));
});
async function fieldTrace(freshScratch){
 const {state,ships}=fixture(),native=await createSg02DynamicBodyOwner({publishTelemetry:false,fixedDt:DT}),owner=Object.create(fields),bus=createBus();
 const helpers={queryRadius(pos,r,out){out.length=0;return state.spatialHash.queryRadius(pos.x,pos.z,r,out);},getEntity:id=>state.entities.get(id)};
 owner.init({state,bus,helpers});owner.registerEnvironmental({id:'test-repulsor',kind:'repulsor',center:{x:0,z:0},radius:100,strength:2,falloff:1,maxAffected:16});
 try{
  native.syncFromEntities(ships);const trace=[];
  for(let i=0;i<120;i++){
   state.tick++;state.simTime+=DT;state.combatTable.packedOnce=false;state.spatialHash.rebuild(ships);packCombatTable(state);
   if(freshScratch)state.combatTable._hashScratch=[];
   const result=owner._applyForces(DT,state,state.fields);native.step(DT);
   trace.push({result,poses:ships.map(e=>[e.pos.x,e.pos.z,e.vel.x,e.vel.z]),native:createHash('sha256').update(JSON.stringify(native.exportWorldSnapshot())).digest('hex')});
   assert.ok(owner._combatTableScratch.length<=64);assert.ok(state.combatTable._hashScratch.length<=64);
  }
  return trace;
 }finally{owner.destroy?.();native.dispose();bus.clear?.();}
}
test('ordinary bounded field consumer keeps force/order/maxAffected and native scalar trace equal to fresh scratch',async()=>{
 assert.deepEqual(await fieldTrace(false),await fieldTrace(true));
});
