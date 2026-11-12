import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameState} from '../src/core/gameState.js';
import {createBus} from '../src/core/eventBus.js';
import {makeBudgetApi} from '../src/systems/spawnBudget.js';
import {materializeWaveBatch} from '../src/systems/waveMaterialization.js';
import {survivalWave} from '../src/systems/survivalWave.js';
import {planWave} from '../src/systems/survivalWavePlanner.js';
import {createRunState} from '../src/core/runState.js';
function fixture(pos={x:0,z:300},policy=null){
 const state=createGameState(73311),bus=createBus();state.mode='flight';
 state.run={...createRunState({kind:'survival',ruleset:'swarm',seed:73311}),arenaId:'helios_core',wave:24,phase:'wave_intro'};
 const player={id:state.nextEntityId++,type:'ship',alive:true,pos:{...pos},vel:{x:0,z:0},radius:8};state.playerId=player.id;state.entities.set(player.id,player);state.entityList.push(player);
 const spawned=[],helpers={spawnBudget:makeBudgetApi(state),spawnEntity(spec){const e={...spec,id:state.nextEntityId++,alive:true};spawned.push(e);state.entities.set(e.id,e);state.entityList.push(e);return e;}};
 return {state,player,spawned,ctx:{state,bus,helpers,registry:{get:()=>policy?{getIngressPolicy:()=>policy}:null}}};
}
const request={ownerId:'survival-wave:wall',swarm:true,wall:true,roomAnchor:{x:0,z:0},enemyId:'anchor',count:2,seed:73311,wave:24,packageIndex:9,batchIndex:0,gateGroup:'front',distance:310,level:1};
// Use the current canonical enemy chosen by the wave rather than invent a fixture archetype.
request.enemyId=planWave({seed:73311,wave:24,arenaId:'helios_core',ruleset:'swarm'}).packages.find(p=>p.wall).enemyId;
function positions(f,overrides={}){const r=materializeWaveBatch(f.ctx,{...request,...overrides});return {r,p:f.spawned.map(e=>({x:e.pos.x,z:e.pos.z}))};}
test('retreat and sidestep do not drag the wall muscle away from its original chord',()=>{
 const a=positions(fixture({x:0,z:300})),b=positions(fixture({x:220,z:300}));
 assert.equal(a.r.admitted,2);assert.equal(b.r.admitted,2);assert.deepEqual(a.p,b.p);
 for(const p of a.p)assert.ok(p.z < -250,'muscle remains beyond the original wall');
});
test('the original room anchor translates the whole gate',()=>{
 const a=positions(fixture()),b=positions(fixture({x:900,z:1000}),{roomAnchor:{x:900,z:700}});
 for(let i=0;i<2;i++){assert.ok(Math.abs(b.p[i].x-a.p[i].x-900)<1e-8);assert.ok(Math.abs(b.p[i].z-a.p[i].z-700)<1e-8);}
});
test('current pilot clearance defers a wall batch rather than spawning onto a crossing pilot',()=>{
 const a=positions(fixture());const f=fixture(a.p[0]);const b=positions(f);
 for(const p of b.p)assert.ok(Math.hypot(p.x-f.player.pos.x,p.z-f.player.pos.z)>=215);
 assert.equal(b.r.admitted+b.r.deferred,2,'unsafe seats must be repositioned safely or deferred');
});
test('ordinary non-wall batches ignore a supplied room anchor',()=>{
 const a=positions(fixture(),{wall:false}),b=positions(fixture(),{wall:false,roomAnchor:null});assert.deepEqual(a.p,b.p);
});
test('non-swarm materialization ignores the room anchor',()=>{
 const a=positions(fixture(),{swarm:false}),b=positions(fixture(),{swarm:false,roomAnchor:null});assert.deepEqual(a.p,b.p);
});
test('invalid room anchors fall back to ordinary gates',()=>{
 for(const roomAnchor of [null,{x:NaN,z:0},{x:0,z:Infinity}])assert.deepEqual(positions(fixture(),{roomAnchor}).p,positions(fixture(),{roomAnchor:null}).p);
});
test('Fortify retains authority over its fixed corridors',()=>{
 const policy={gateGroupPolicy:'fortify-three-corridor-v1',anchor:{x:120,z:40,rotation:.2}};
 assert.deepEqual(positions(fixture(undefined,policy)).p,positions(fixture(undefined,policy),{roomAnchor:{x:-900,z:-800}}).p);
});
test('wave owner snapshots the chord origin, duplicate planning cannot follow the pilot, and next wave resets it',()=>{
 const f=fixture({x:20,z:30});survivalWave.init(f.ctx);
 try{const plan=planWave({seed:73311,wave:24,arenaId:'helios_core',ruleset:'swarm'});f.ctx.bus.emit('run:wavePlanned',{wave:24,plan});assert.deepEqual(survivalWave._massGapAnchor,{x:20,z:30});
 f.player.pos.x=400;f.ctx.bus.emit('run:wavePlanned',{wave:24,plan});assert.deepEqual(survivalWave._massGapAnchor,{x:20,z:30});
 f.state.run.wave=25;f.ctx.bus.emit('run:wavePlanned',{wave:25,plan:planWave({seed:73311,wave:25,arenaId:'helios_core',ruleset:'swarm'})});assert.equal(survivalWave._massGapAnchor,null);
 }finally{survivalWave.dispose?.();}
});
