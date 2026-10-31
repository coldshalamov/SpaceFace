import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
// Default: this repository. An explicit root supports external proof loaders only.
const base = process.env.SF_TEST_SOURCE_ROOT
 ? pathToFileURL(resolve(process.env.SF_TEST_SOURCE_ROOT) + '/').href
 : new URL('../', import.meta.url).href;
const {swarmArena,SWARM_DEBRIS_TAG,SWARM_DEBRIS_MAX}=await import(base+'src/systems/swarmArena.js');
const {swarmArenaTierForRun,swarmArenaDebrisLayout}=await import(base+'src/data/swarmArenaLadder.js');
const {swarmOpeningTerrainStage,planSwarmOpeningTerrain}=await import(base+'src/data/swarmOpeningTerrain.js');
function fixture({ratingT=0,indexed=false}={}) {
 const state={entities:new Map(),entityList:[],playerId:1,rockCore:{ratingT},simTime:1};
 let id=1; const events=[],fields=[];
 const spawnEntity=spec=>{const e={id:id++,alive:true,...spec};state.entities.set(e.id,e);state.entityList.push(e);if(indexed){const list=state.entityIndex[e.type==='asteroid'?'asteroids':e.type==='wreck'?'wrecks':e.type==='station'?'stations':'ships'];list?.push(e);}return e;};
 if(indexed)state.entityIndex={__spacefaceEntityIndexV1:true,ready:true,asteroids:[],wrecks:[],stations:[],ships:[]};
 spawnEntity({type:'ship',pos:{x:0,z:0},vel:{x:0,z:0},radius:8,rot:0});
 const owner=Object.assign(Object.create(swarmArena),{state,helpers:{spawnEntity},_ids:[],_wellIds:[],_opticIds:[],bus:{emit:(...a)=>events.push(a)},registry:{get:n=>n==='fields'?{registerEnvironmental:s=>(fields.push(s),s.id)}:null}});
 const run={arenaId:'helios_core',seed:4242,arenaMutators:[]};
 return {state,owner,run,spawnEntity,events,fields,banks:()=>state.entityList.filter(e=>e.alive!==false&&e.data?.openingTerrainSlot!=null),ours:()=>state.entityList.filter(e=>e.alive!==false&&e.data?.[SWARM_DEBRIS_TAG])};
}
for(const indexed of [false,true])test(`actual topUp + lesson + pocket, stages and repeated census (indexed=${indexed})`,()=>{
 const h=fixture({indexed});
 h.owner._topUp(h.run,1);h.owner._installOpeningLesson({});h.owner._installOpeningPocket(h.run);
 const teaching=h.ours().filter(e=>e.data.openingPocket||e.data.openingLesson);
 assert.equal(teaching.length,6);assert.equal(h.banks().length,8);
 assert.equal(h.fields.length,1);assert.equal(h.fields[0].strength,0);
 assert.equal(h.state.entityList.filter(e=>e.data?.opticStructureId).length,12);
 const identities=h.banks().map(e=>[e.id,{...e.pos}]);
 for(const [wave,count]of [[1,8],[2,11],[3,14]]){
  for(let i=0;i<10;i++)h.owner._topUp(h.run,wave);
  assert.equal(h.banks().length,count);assert.equal(h.ours().length,count+teaching.length);assert.ok(h.ours().length<=SWARM_DEBRIS_MAX);
  for(const [id,pos]of identities)assert.deepEqual(h.state.entities.get(id).pos,pos);
 }
 for(const e of h.banks()){assert.ok(Math.abs(e.pos.z)-e.radius>=48);assert.ok(Math.hypot(e.pos.x,e.pos.z)<=300);}
});
test('retained eligibility reads the real ladder schema; ratings and variants retain ordinary planner',()=>{
 for(const [ratingT,eligible] of [[0,true],[24,true],[25,false],[80,false],[180,false]]){
  const tier=swarmArenaTierForRun({wave:1,ratingT});
  assert.equal(!!swarmOpeningTerrainStage({arenaId:'helios_core',wave:1,lineTier:tier.ratingTierMin}),eligible);
  const h=fixture({ratingT});h.owner._topUp(h.run,1);assert.equal(h.banks().length>0,eligible);
 }
 for(const config of [{arenaId:'other'},{arenaMutators:['reef']},{arenaMutators:['wreck_ballast']},{arenaMutators:['gravity_slalom']}]){
  const h=fixture();Object.assign(h.run,config);h.owner._topUp(h.run,1);assert.equal(h.banks().length,0);
 }
});
test('blocked authored positions never fall back; live swept ship checks refuse a slot and retry',()=>{
 const h=fixture();
 h.spawnEntity({type:'ship',pos:{x:150,z:-160},vel:{x:0,z:100},radius:8});
 h.owner._topUp(h.run,1);assert.equal(h.banks().length,7);assert.equal(h.owner._terrainRetry,true);
 for(let i=0;i<5;i++)h.owner._topUp(h.run,1);
 assert.equal(h.banks().length,7);assert.equal(h.ours().length,7);
 h.state.entityList[1].pos={x:1000,z:1000};h.owner._topUp(h.run,1);assert.equal(h.banks().length,8);
});
test('drift within fight band does not duplicate an empty original slot or reposition survivors',()=>{
 const h=fixture();h.owner._topUp(h.run,1);const e=h.banks()[0];e.pos={x:340,z:0};
 h.owner._topUp(h.run,1);assert.equal(h.banks().length,8);assert.deepEqual(e.pos,{x:340,z:0});
 h.owner._topUp(h.run,2);assert.equal(h.banks().length,11);assert.deepEqual(e.pos,{x:340,z:0});
 assert.equal(new Set(h.banks().map(e=>e.data.openingTerrainSlot)).size,11);
});
for(const ratingT of [25,80,180])test(`wide ladder ${ratingT}: outer band is counted and materials do not cause runaway births`,()=>{
 const h=fixture({ratingT});const layout=swarmArenaDebrisLayout(swarmArenaTierForRun({wave:1,ratingT}));
 for(let i=0;i<layout.target;i++)h.spawnEntity({type:'asteroid',pos:{x:Math.cos(i*2*Math.PI/layout.target)*(layout.outer+30),z:Math.sin(i*2*Math.PI/layout.target)*(layout.outer+30)},vel:{x:0,z:0},radius:5,data:{[SWARM_DEBRIS_TAG]:true}});
 const before=h.state.entityList.length;for(let i=0;i<20;i++)h.owner._topUp(h.run,1);
 assert.equal(h.ours().length,layout.target);assert.ok(h.ours().every(e=>e.data.despawnAt>h.state.simTime+100));
});
test('pickup rating changes use same owner without erasing existing bank identities',()=>{
 const h=fixture();h.owner._topUp(h.run,1);const initial=h.banks().map(e=>e.id);
 h.state.rockCore.ratingT=25;h.owner._topUp(h.run,2);
 assert.deepEqual(h.banks().map(e=>e.id),initial);assert.ok(h.ours().length>=8);
 h.state.rockCore.ratingT=0;h.owner._topUp(h.run,3);assert.deepEqual(h.banks().slice(0,8).map(e=>e.id),initial);
});
test('every authored slot blocked by solids means no random fallback, including material fallback',()=>{
 const h=fixture();const layout=swarmArenaDebrisLayout(swarmArenaTierForRun({wave:1,ratingT:0}));
 const stage=swarmOpeningTerrainStage({arenaId:'helios_core',wave:3,lineTier:0});
 const spots=planSwarmOpeningTerrain({stage,anchor:{x:0,z:0},want:14,layout});assert.equal(spots.length,14);
 for(const p of spots)h.spawnEntity({type:'station',pos:{x:p.x,z:p.z},radius:12});
 for(let i=0;i<20;i++)h.owner._topUp(h.run,3);
 assert.equal(h.ours().length,0);assert.equal(h.owner._terrainRetry,true);
});
test('out-of-fight drift keeps release lifetime without teleport; dead body may refill its station',()=>{
 const h=fixture();h.owner._topUp(h.run,1);const original=h.banks()[0];original.pos={x:800,z:0};
 h.owner._topUp(h.run,1);assert.deepEqual(original.pos,{x:800,z:0});assert.equal(h.banks().length,9);
 assert.ok(original.data.despawnAt<h.state.simTime+100);
 const other=h.banks().find(e=>e.id!==original.id&&e.data.openingTerrainSlot===0);
 assert.ok(other);other.alive=false;h.owner._topUp(h.run,1);assert.equal(h.banks().length,9);
});
