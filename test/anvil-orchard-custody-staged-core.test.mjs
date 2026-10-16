import test from 'node:test';import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {save} from '../src/save/saveSystem.js';
import {ensureDirtyJournal} from '../src/core/dirtyJournal.js';
const spec=()=>({type:'payload',pos:{x:7,z:9},radius:2,hull:10,physicsBody:{dynamic:false,shape:'ball',radius:2,mass:10,inertiaY:10,material:'pod'},data:{worldRecordId:'stage-proof',amount:4}});
const accepted=()=>({preflight(){return true;},commit(){return true;},abort(){assert.fail('unexpected abort');}});
test('staged core entity is private until one native-custody commit publishes all ordinary membership',()=>{
 const sim=createSimulation();try {const events=[];sim.bus.on('entity:spawned',e=>events.push(e));const stage=sim.helpers.stageEntitySpawn(spec()),e=stage.entity;
  assert.equal(sim.state.entities.has(e.id),false);assert.equal(sim.state.entityList.includes(e),false);assert.equal(events.length,0);
  const contract=accepted();contract.commit=function(){assert.equal(this,contract);assert.equal(sim.state.entities.has(e.id),false);return true;};
  assert.equal(stage.commit(contract),true);assert.equal(stage.committed,true);assert.equal(stage.current(),true);assert.equal(sim.state.entities.get(e.id),e);
  assert.equal(sim.state.entityList.filter(x=>x===e).length,1);assert.equal(sim.state.entityIndex.payloads.filter(x=>x===e).length,1);assert.equal(events.length,1);
  assert.equal(stage.commit(accepted()),false);assert.equal(stage.abort(),false);
 }finally{sim.dispose();}
});
test('abort consumes the reserved allocation without rewinding allocator or life stamps',()=>{
 const sim=createSimulation();try {const stage=sim.helpers.stageEntitySpawn(spec()),id=stage.entity.id,life=stage.entity.occupantGeneration,next=sim.state.nextEntityId,generation=sim.state.nextOccupantGeneration;
  assert.equal(stage.abort(),true);assert.equal(stage.abort(),false);assert.equal(sim.state.nextEntityId,next);assert.equal(sim.state.nextOccupantGeneration,generation);
  const e=sim.spawn(spec());assert.notEqual(e.id,id);assert.ok(e.occupantGeneration>life);
 }finally{sim.dispose();}
});
test('an explicit same-ID public claim wins and is never deleted by refused staging',()=>{
 const sim=createSimulation();try {const stage=sim.helpers.stageEntitySpawn(spec());let claimant,aborts=0;
  assert.equal(stage.commit({preflight(){claimant=sim.spawn({...spec(),id:stage.entity.id});return true;},commit(){assert.fail('stale native commit');},abort(){aborts++;}}),false);
  assert.equal(sim.state.entities.get(stage.entity.id),claimant);assert.equal(aborts,1);assert.equal(sim.state.entityList.includes(stage.entity),false);
 }finally{sim.dispose();}
});
for(const seam of ['preflight','commit'])test(`${seam} replacement cannot publish into successor containers`,()=>{
 const sim=createSimulation();try {const stage=sim.helpers.stageEntitySpawn(spec()),old=sim.state.entities;let aborts=0;
  const replacement=()=>{sim.state.entities=new Map();sim.state.entityList=[];return true;};
  const contract={preflight:seam==='preflight'?replacement:()=>true,commit:seam==='commit'?replacement:()=>assert.fail('stale commit'),abort(){aborts++;}};
  assert.equal(stage.commit(contract),false);assert.equal(aborts,1);assert.equal(sim.state.entities.size,0);assert.equal(old.has(stage.entity.id),false);
 }finally{sim.dispose();}
});
test('prepared method accessors are refused without invoking them',()=>{
 const sim=createSimulation();try {const stage=sim.helpers.stageEntitySpawn(spec());let calls=0;const contract=accepted();Object.defineProperty(contract,'commit',{get(){calls++;return()=>true;}});
  assert.equal(stage.commit(contract),false);assert.equal(calls,0);assert.equal(sim.state.entities.has(stage.entity.id),false);
 }finally{sim.dispose();}
});
test('an abort exception is attempted once and never repeats from the catch path',()=>{
 const sim=createSimulation();try {const stage=sim.helpers.stageEntitySpawn(spec());let aborts=0;
  assert.throws(()=>stage.commit({preflight(){return false;},commit(){assert.fail();},abort(){aborts++;throw Error('cleanup retained');}}),/cleanup retained/);
  assert.equal(aborts,1);assert.equal(stage.abort(),false);assert.equal(sim.state.entities.has(stage.entity.id),false);
 }finally{sim.dispose();}
});
test('presentation replacement stops stale entity:spawned after membership already committed',()=>{
 let sim,presented=0,emitted=0;const journal={recordSpawn(){presented++;sim.state.entities.clear();sim.state.entityList.length=0;sim.bus.emit('save:restoring');}};
 sim=createSimulation({presentationJournal:journal});try {sim.bus.on('entity:spawned',()=>emitted++);const stage=sim.helpers.stageEntitySpawn(spec());
  assert.equal(stage.commit(accepted()),true);assert.equal(stage.committed,true);assert.equal(stage.current(),false);assert.equal(presented,1);assert.equal(emitted,0);
 }finally{sim.dispose();}
});
test('an entity:spawned replacement stops producer continuation without undoing a completed publication',()=>{
 const sim=createSimulation();try {sim.bus.on('entity:spawned',()=>{sim.state.entities.clear();sim.state.entityList.length=0;sim.bus.emit('save:restoring');});const stage=sim.helpers.stageEntitySpawn(spec());
  assert.equal(stage.commit(accepted()),true);assert.equal(stage.committed,true);assert.equal(stage.current(),false);
 }finally{sim.dispose();}
});
test('real Save JSON Continue invalidates a private stage even when the entity Map/list are reused',()=>{
 const sim=createSimulation({systems:[save]});sim.state.mode='flight';const player=sim.spawn({type:'ship',hull:100,data:{defId:'ship_kestrel',fittings:[]}});sim.state.playerId=player.id;
 try {const saves=sim.registry.get('save'),envelope=JSON.parse(JSON.stringify(saves.serialize('staged-core'))),stage=sim.helpers.stageEntitySpawn(spec()),map=sim.state.entities,list=sim.state.entityList;delete envelope.checksum;
  assert.equal(saves.loadEnvelope(envelope),true);assert.equal(sim.state.entities,map);assert.equal(sim.state.entityList,list);
  let aborted=0;assert.equal(stage.commit({preflight(){assert.fail('stale preflight');},commit(){assert.fail('stale commit');},abort(){aborted++;}}),false);assert.equal(aborted,1);
  assert.equal(sim.state.entityList.includes(stage.entity),false);
 }finally{sim.dispose();}
});
test('unsupported classifier getters and lane overrides refuse before native commit without invocation',()=>{
 for(const seam of ['source','lane','journal']){const sim=createSimulation();try{const stage=sim.helpers.stageEntitySpawn(spec());let calls=0,commits=0;
  if(seam==='source')Object.defineProperty(stage.entity.data,'machine',{get(){calls++;return true;},configurable:true});
  if(seam==='lane')sim.state.entityIndex.payloads.push=()=>{calls++;throw Error('must not dispatch');};
  if(seam==='journal')Object.defineProperty(ensureDirtyJournal(sim.state),'count',{get(){calls++;return 0;},configurable:true});
  assert.equal(stage.commit({preflight(){return true;},commit(){commits++;return true;},abort(){}}),false);
  assert.equal(calls,0);assert.equal(commits,0);assert.equal(sim.state.entities.has(stage.entity.id),false);
 }finally{delete sim.state.entityIndex.payloads.push;sim.dispose();}}
});
for(const seam of ['preflight','commit'])test(`changed classifier source during ${seam} refuses the prepared delta`,()=>{
 const sim=createSimulation();try{const stage=sim.helpers.stageEntitySpawn(spec());let commits=0,aborts=0;const change=()=>{stage.entity.data.worldRecordId='foreign';return true;};
  assert.equal(stage.commit({preflight:seam==='preflight'?change:()=>true,commit(){commits++;return seam==='commit'?change():true;},abort(){aborts++;}}),false);
  assert.equal(commits,seam==='commit'?1:0);assert.equal(aborts,1);assert.equal(sim.state.entityList.includes(stage.entity),false);assert.equal(sim.state.entityIndex.byWorldRecordId.has('stage-proof'),false);
 }finally{sim.dispose();}
});
for(const kind of ['lane','keyedSet','dirty'])test(`foreign ${kind} changes during preparation survive refusal`,()=>{
 const sim=createSimulation();try{const existing=sim.spawn({...spec(),data:{worldSiteId:'site'}}),stage=sim.helpers.stageEntitySpawn(spec());let commits=0;
  const index=sim.state.entityIndex,journal=sim.state.dirtyJournal,oldCount=journal.count;
  assert.equal(stage.commit({preflight(){if(kind==='lane')index.payloads.push('foreign');if(kind==='keyedSet')index.byWorldSiteId.get('site').add('foreign');if(kind==='dirty')journal.count++;return true;},commit(){commits++;return true;},abort(){}}),false);
  assert.equal(commits,0);assert.equal(sim.state.entities.has(stage.entity.id),false);
  if(kind==='lane')assert.equal(index.payloads.at(-1),'foreign');if(kind==='keyedSet')assert.ok(index.byWorldSiteId.get('site').has('foreign'));if(kind==='dirty')assert.equal(journal.count,oldCount+1);
 }finally{sim.dispose();}
});
test('private classification and dirty delta preserve normal typed/keyed index and journal semantics',()=>{
 const normal=createSimulation(),staged=createSimulation();try{
  const inputs=[{...spec(),data:{worldRecordId:'first',worldSiteId:'site',activityObjectSlotId:'object',activityActorSlotId:'actor',machine:true,capitalBossActorKey:'boss'}},
    {...spec(),type:'station',data:{stationId:'dock',isGate:true,worldSiteId:'site'}},
    {...spec(),type:'ship',data:{ai:{},weapons:['one']}},
    {...spec(),type:'asteroid',data:{respawnAt:3}},
    {...spec(),type:'fauna',physicsBody:false,collides:false,data:{}}];
  for(const input of inputs){normal.spawn(input);const stage=staged.helpers.stageEntitySpawn(input);assert.equal(stage.commit(accepted()),true);}
  const project=index=>Object.fromEntries(Object.entries(index).filter(([key])=>key!=='_sourceList').map(([key,value])=>[key,
    Array.isArray(value)?value.map(e=>e.id):value instanceof Set?[...value].map(e=>typeof e==='object'?e.id:e):value instanceof Map?[...value].map(([k,v])=>[k,v instanceof Set?[...v].map(e=>e.id):typeof v==='object'?v.id:v]):value]));
  assert.deepEqual(project(staged.state.entityIndex),project(normal.state.entityIndex));
  assert.deepEqual(staged.state.dirtyJournal,normal.state.dirtyJournal);
 }finally{normal.dispose();staged.dispose();}
});
test('dirty growth is fully prepared before native commit and preserves existing journal identity',()=>{
 const sim=createSimulation();try{const journal=ensureDirtyJournal(sim.state),stage=sim.helpers.stageEntitySpawn({...spec(),id:5000}),before=journal.capacity;
  assert.equal(stage.commit({preflight(){assert.equal(journal.capacity,before);return true;},commit(){assert.equal(journal.capacity,before);return true;},abort(){assert.fail();}}),true);
  assert.equal(sim.state.dirtyJournal,journal);assert.ok(journal.capacity>5000);assert.equal(journal.entityBits[5000],3);assert.equal(journal.ids[journal.count-1],5000);
 }finally{sim.dispose();}
});

for(const seam of ['preflight','commit'])test(`reentrant ${seam} abort is terminal before any public membership`,()=>{
 const sim=createSimulation();try{const stage=sim.helpers.stageEntitySpawn(spec());let commits=0,aborts=0;
  assert.equal(stage.commit({preflight(){if(seam==='preflight')assert.equal(stage.abort(),true);return true;},commit(){commits++;if(seam==='commit')assert.equal(stage.abort(),true);return true;},abort(){aborts++;}}),false);
  assert.equal(commits,seam==='commit'?1:0);assert.equal(aborts,1);assert.equal(stage.committed,false);assert.equal(stage.current(),false);assert.equal(sim.state.entities.has(stage.entity.id),false);assert.equal(sim.state.entityList.includes(stage.entity),false);
 }finally{sim.dispose();}
});
