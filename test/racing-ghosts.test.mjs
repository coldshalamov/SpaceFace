import test from 'node:test';
import assert from 'node:assert/strict';
import { racingLoadoutCategory } from '../src/systems/racingSteer.js';
import { RACING_GHOST_STORAGE_KEY, RACING_GHOST_LIMITS, observeRacingGhost, readRacingGhost,
  getRacingGhostPlayback, resetRacingGhostSession, invalidateRacingGhost, sampleRacingGhost,
  validateRacingGhost, rememberRacingGhost, raceGhostSplitDelta, listRacingGhosts,
  exportRacingGhostByKey, clearRacingGhostByKey } from '../src/systems/racingGhosts.js';

function storage(){const rows=new Map();return {rows,getItem:k=>rows.get(k)||null,setItem:(k,v)=>rows.set(k,v)};}
function fixture(store=storage()){
  const params={racingContractId:'test_contract',courseId:'test_course',courseRevision:2,courseSectorId:'sector_a',
    gates:[{x:0,z:0},{x:100,z:0},{x:200,z:0}],laps:1,raceStartSimS:0,gridUntilSimS:0};
  const player={id:1,alive:true,pos:{x:100000,z:-200000,y:2},vel:{x:100,z:0},rot:3.1,mass:10,data:{shipDefId:'ship_kestrel'}};
  const state={mode:'flight',simTime:0,playerId:1,entities:new Map([[1,player]]),
    player:{alive:true},input:{flightMode:'assisted'},settings:{gameplay:{}},world:{frameOrigin:{x:0,z:0}}};
  params.raceCategory=racingLoadoutCategory(state,player);
  return {params,player,state,store};
}
function run(f,{duration=1,change}={}){
  let result;
  for(let i=0;i<=60;i++){
    const t=duration*i/60;f.state.simTime=t;f.player.pos.x=100000+t*100;
    f.player.rot=Math.atan2(Math.sin(3.1+t*.1),Math.cos(3.1+t*.1));
    change?.(f,i);
    const events=i===1?[{lap:0,gateIndex:0,elapsedS:t}]
      :i===30?[{lap:0,gateIndex:1,elapsedS:t-.003}]
      :i===60?[{lap:0,gateIndex:2,elapsedS:t,finished:true}]:[];
    if(i===60)f.params.raceClean=true;
    result=observeRacingGhost(f.params,f.player,f.state,{events,finish:i===60,storage:f.store});
  }
  return result;
}
const copy=value=>JSON.parse(JSON.stringify(value));

test('authoritative poses and exact gate stamps round-trip; heading interpolates across pi',()=>{
  const f=fixture();assert.equal(run(f).reason,'saved');
  const tape=readRacingGhost(f.store,f.params,f.state);
  assert.ok(validateRacingGhost(tape));assert.equal(tape.samples.length,11);
  assert.equal(tape.gates[1][2],.497);assert.ok(Math.abs(raceGhostSplitDelta(tape,{lap:0,gateIndex:1,elapsedS:.55})-.053)<1e-9);
  assert.equal(raceGhostSplitDelta(tape,{lap:4,gateIndex:1,elapsedS:.55}),null);
  const pose={};assert.equal(sampleRacingGhost(tape,.55,pose),pose);
  assert.ok(Math.abs(pose.x-100055)<1e-6);assert.equal(pose.z,-200000);assert.equal(pose.y,2);
  assert.ok(Math.abs(pose.heading)>3,'rotation follows the short arc, never through zero');
  f.state.world.frameOrigin={x:100000,z:-200000};assert.equal(sampleRacingGhost(tape,.55).x,100055);
  assert.equal(sampleRacingGhost(tape,-.01),null);assert.equal(sampleRacingGhost(tape,1.01),null);
  assert.equal(f.state.entities.size,1,'the observer never creates a ghost entity');
  assert.equal(f.params.raceCategory,racingLoadoutCategory(f.state,f.player));
});

test('only a faster complete clean run can replace a compatible personal ghost',()=>{
  const store=storage();const first=fixture(store);run(first);
  assert.equal(run(fixture(store),{duration:1.5}).reason,'slower');
  assert.equal(run(fixture(store),{duration:.8}).reason,'saved');
  assert.equal(readRacingGhost(store,first.params,first.state).duration,.8);
  for(const mutate of [f=>f.params.resetCount=1,f=>f.params.raceFitChanged=true,
    f=>f.player.mass+=1,f=>invalidateRacingGhost(f.state,'debug_relocation')]){
    const candidate=fixture(store);run(candidate,{duration:.6,change:(f,i)=>{if(i===20)mutate(f);}});
    assert.equal(readRacingGhost(store,first.params,first.state).duration,.8);
  }
});

test('ordinary pause samples preserve the run, and closed laps retain distinct gate stamps',()=>{
  const f=fixture();f.params.laps=2;f.params.closedCircuit=true;
  let result;
  const crossings=new Map([[1,[0,0]],[12,[0,1]],[24,[0,2]],[36,[1,1]],[60,[1,2]]]);
  for(let i=0;i<=60;i++){
    f.state.simTime=i/60;f.player.pos.x=100000+100*i/60;f.player.rot=Math.PI;
    if(i===30){
      f.state.paused=true;
      for(let j=0;j<10;j++)assert.equal(observeRacingGhost(f.params,f.player,f.state,{storage:f.store}).ok,true);
      f.state.paused=false;
    }
    const crossing=crossings.get(i),events=crossing?[{lap:crossing[0],gateIndex:crossing[1],elapsedS:i/60,finished:i===60}]:[];
    if(i===60)f.params.raceClean=true;
    result=observeRacingGhost(f.params,f.player,f.state,{events,finish:i===60,storage:f.store});
  }
  assert.equal(result.reason,'saved');const tape=readRacingGhost(f.store,f.params,f.state);
  assert.equal(tape.gates.length,5);assert.ok(Math.abs(raceGhostSplitDelta(tape,{lap:1,gateIndex:1,elapsedS:.65})-.05)<1e-9);
  assert.equal(raceGhostSplitDelta(tape,{lap:1,gateIndex:0,elapsedS:.6}),null,'closed laps skip the already crossed start');
  assert.ok(Math.abs(sampleRacingGhost(tape,.5).heading)>3.14,'exact pi remains valid after quantization');
});

test('course revision, geometry, branch, laps, hull/loadout and physics are incompatible',()=>{
  const f=fixture();run(f);
  for(const mutate of [g=>g.params.courseRevision++,g=>g.params.gates[1].z++,g=>g.params.routeBranch='alternate',
    g=>g.params.laps=2,g=>g.player.mass++,g=>g.player.data.shipDefId='other_hull',
    g=>g.state.settings.gameplay.physicsBackend='legacy']){
    const g=fixture(f.store);mutate(g);assert.equal(readRacingGhost(g.store,g.params,g.state),null);
  }
});

test('missing beginnings, clock reversal, relocation and missing gates fail closed',()=>{
  for(const action of ['late','rewind','jump','missing']){
    const f=fixture();
    if(action==='late')f.state.simTime=.5;
    observeRacingGhost(f.params,f.player,f.state,{storage:f.store});
    if(action==='rewind')f.state.simTime=-1;
    if(action==='jump'){f.state.simTime=.01;f.player.pos.x+=100000;}
    if(action==='missing')f.state.simTime=.1;
    f.params.raceClean=true;
    const result=observeRacingGhost(f.params,f.player,f.state,{events:[{lap:0,gateIndex:2,elapsedS:.1,finished:true}],finish:true,storage:f.store});
    assert.equal(result.ok,false);assert.equal(f.store.rows.size,0);
  }
});

test('malformed, wrong-version and oversized local data never reaches playback',()=>{
  const f=fixture();run(f);const tape=readRacingGhost(f.store,f.params,f.state);
  const mutations=[t=>t.version=99,t=>t.meta.laps=100000,t=>t.meta.key='__proto__',
    t=>t.samples[1][0]=t.samples[0][0],t=>t.samples[0][1]=Infinity,t=>t.samples[0].push(7),
    t=>t.gates.pop(),t=>t.gates[1][1]=0,t=>t.samples=Array(RACING_GHOST_LIMITS.samples+1).fill(t.samples[0]),
    t=>t.extra='untrusted',t=>t.meta.tuning='other_version'];
  for(const mutate of mutations){
    const changed=copy(tape);mutate(changed);
    f.store.setItem(RACING_GHOST_STORAGE_KEY,JSON.stringify({version:1,tapes:[changed]}));
    assert.equal(readRacingGhost(f.store,f.params,f.state),null);
  }
  for(const raw of ['{','null','[]',JSON.stringify({version:2,tapes:[tape]}),' '.repeat(RACING_GHOST_LIMITS.bytes+1)]){
    f.store.setItem(RACING_GHOST_STORAGE_KEY,raw);assert.deepEqual(listRacingGhosts(f.store),[]);
  }
});

test('storage failure stays optional and menu delete/export work without a live player',()=>{
  const f=fixture();run(f);const [row]=listRacingGhosts(f.store);
  const json=exportRacingGhostByKey(f.store,row.key),tape=JSON.parse(json);
  assert.equal(row.hullId,'ship_kestrel');assert.equal(row.elapsedS,1);assert.ok(validateRacingGhost(tape));
  assert.equal(exportRacingGhostByKey(f.store,'__proto__'),null);
  const blocked={getItem:()=>null,setItem:()=>{throw new Error('quota');}};
  assert.equal(rememberRacingGhost(blocked,tape).reason,'storage_failed');
  assert.equal(clearRacingGhostByKey(blocked,row.key).reason,'storage_failed');
  assert.deepEqual(listRacingGhosts({getItem:()=>{throw new Error('denied');}}),[]);
  const playback=fixture(f.store);assert.ok(getRacingGhostPlayback(playback.state,playback.params,f.store));
  assert.equal(clearRacingGhostByKey(f.store,row.key).ok,true);
  assert.equal(getRacingGhostPlayback(playback.state,playback.params,f.store),null,'delete invalidates active playback cache');
  assert.deepEqual(listRacingGhosts(f.store),[]);
});

test('bounded restarts replace observer state and retain at most eight tapes',()=>{
  const f=fixture();run(f);const tape=readRacingGhost(f.store,f.params,f.state);
  for(let i=0;i<20;i++){
    const next=copy(tape);next.meta.contract=`contract_${i}`;
    next.meta.key=`${next.meta.course}@${next.meta.revision}:${next.meta.contract}:1L:${next.meta.category}`;
    assert.equal(rememberRacingGhost(f.store,next).ok,true);
    resetRacingGhostSession(f.state);
  }
  assert.equal(listRacingGhosts(f.store).length,8);
  assert.ok(f.store.getItem(RACING_GHOST_STORAGE_KEY).length<=RACING_GHOST_LIMITS.bytes);
  for(let i=0;i<15;i++){
    const next=fixture(f.store);Object.assign(f,{params:next.params,player:next.player,state:next.state});
    assert.ok(['saved','slower'].includes(run(f).reason));
  }
  assert.equal(listRacingGhosts(f.store).length,8);
});
