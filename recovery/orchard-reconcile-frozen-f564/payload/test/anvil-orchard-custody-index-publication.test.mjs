import test from 'node:test';import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {prepareEntityPhysicsIndexPublication,refreshEntityPhysicsIndex} from '../src/core/coreSystem.js';
const make=sim=>sim.spawn({type:'payload',pos:{x:7,z:9},radius:2,hull:10,physicsBody:{dynamic:false,shape:'ball',radius:2,mass:10,inertiaY:10,material:'pod',revision:1},data:{worldRecordId:'transition-proof',amount:4,masslineTetherable:false}});
const lanes=['collidables','spatialStatics','spatialDynamics','physicsBodies','physicsStatics','physicsDynamics','movables'];
test('prepared same-life physics index publication matches the ordinary classifier and preserves every lane identity',()=>{
 const a=createSimulation(),b=createSimulation();try{const ea=make(a),eb=make(b),body={...ea.physicsBody,dynamic:true,revision:2};const refs=lanes.map(k=>a.state.entityIndex[k]);
 const plan=prepareEntityPhysicsIndexPublication(a.state,ea,body);assert.ok(plan);assert.equal(plan.current(),true);assert.equal(ea.physicsBody.dynamic,false);assert.ok(a.state.entityIndex.physicsStatics.includes(ea));
 ea.physicsBody=body;assert.equal(plan.publish(),true);assert.equal(plan.publish(),false);eb.physicsBody={...eb.physicsBody,dynamic:true,revision:2};assert.equal(refreshEntityPhysicsIndex(b.state,eb,eb.occupantGeneration),true);
 for(let i=0;i<lanes.length;i++){const k=lanes[i];assert.equal(a.state.entityIndex[k],refs[i]);assert.deepEqual(a.state.entityIndex[k].map(e=>e.id),b.state.entityIndex[k].map(e=>e.id));}
 for(const k of ['version','physicsStaticVersion','spatialStaticVersion'])assert.equal(a.state.entityIndex[k],b.state.entityIndex[k]);assert.equal(a.state.entities.get(ea.id),ea);assert.equal(a.state.entityList.filter(e=>e===ea).length,1);
 }finally{a.dispose();b.dispose();}
});
for(const seam of ['body','revision','data','life','lane','index','map','journal'])test(`prepared physics index refuses ${seam} changes while preserving foreign state`,()=>{const sim=createSimulation();try{const e=make(sim),body={...e.physicsBody,dynamic:true,revision:2},plan=prepareEntityPhysicsIndexPublication(sim.state,e,body);assert.ok(plan);
 if(seam==='body')e.physicsBody={...e.physicsBody};if(seam==='revision')e.physicsBody.revision++;if(seam==='data')e.data={...e.data};if(seam==='life')Object.defineProperty(e,'occupantGeneration',{value:e.occupantGeneration+1});if(seam==='lane')sim.state.entityIndex.physicsStatics.push('foreign');if(seam==='index')sim.state.entityIndex={...sim.state.entityIndex};if(seam==='map')sim.state.entities=new Map(sim.state.entities);if(seam==='journal')sim.state.dirtyJournal.count++;
 assert.equal(plan.current(),false);assert.equal(e.physicsBody.dynamic,false);if(seam==='lane')assert.equal(sim.state.entityIndex.physicsStatics.at(-1),'foreign');
 }finally{sim.dispose();}});
for(const seam of ['body','data','slot','target'])test(`prepared physics index refuses consumed ${seam} accessors without dispatch`,()=>{const sim=createSimulation();let restore=()=>{};try{const e=make(sim),body={...e.physicsBody,dynamic:true,revision:2};let calls=0;const target=seam==='body'?e.physicsBody:seam==='data'?e.data:seam==='slot'?sim.state.entityIndex.physicsStatics:body,key=seam==='body'?'dynamic':seam==='data'?'machine':seam==='slot'?'0':'revision',d=Object.getOwnPropertyDescriptor(target,key);Object.defineProperty(target,key,{configurable:true,get(){calls++;throw Error('getter');}});restore=()=>d?Object.defineProperty(target,key,d):delete target[key];assert.equal(prepareEntityPhysicsIndexPublication(sim.state,e,body),null);assert.equal(calls,0);
 }finally{restore();sim.dispose();}});
test('a copied same-ID entity cannot prepare current physics membership',()=>{const sim=createSimulation();try{const e=make(sim);assert.equal(prepareEntityPhysicsIndexPublication(sim.state,{...e},{...e.physicsBody,dynamic:true}),null);}finally{sim.dispose();}});
