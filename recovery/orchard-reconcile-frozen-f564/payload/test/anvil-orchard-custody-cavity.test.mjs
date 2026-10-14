import test from 'node:test';import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {createSg02DynamicBodyOwner} from '../src/core/sg02DynamicBodyOwner.js';
import {createOrchardCollarState} from '../src/core/anvilOrchardNative.js';
import {ORCHARD_GEOMETRY as G,orchardFrameBodySpec,orchardPodBodySpec} from '../src/data/anvilOrchardBody.js';
async function setup(config={x:13200,z:8300,yaw:.713}){
 const sim=createSimulation(),owner=await createSg02DynamicBodyOwner({publishTelemetry:false});
 if(config.origin)owner.setFrameOrigin(config.origin,1);
 const frame=sim.spawn({type:'wreck',pos:{x:config.x,z:config.z},rot:config.yaw,radius:G.radius,mass:1e6,hull:300,physicsBody:orchardFrameBodySpec(),data:{orchardId:'anvil_storm_orchard',orchardKind:'frame',worldRecordId:G.worldRecordId,masslineTetherable:false,orchardCollars:createOrchardCollarState()}});
 owner.syncFromEntities([frame]);
 return {sim,owner,frame,dispose(){owner.dispose();sim.dispose();},pod(socket=1){const slot=G.pods[socket],c=Math.cos(frame.rot),s=Math.sin(frame.rot);return sim.spawn({type:'payload',pos:{x:frame.pos.x+c*slot.pos.x-s*slot.pos.z,z:frame.pos.z+s*slot.pos.x+c*slot.pos.z},rot:frame.rot,radius:G.pod.radius,hull:100,physicsBody:orchardPodBodySpec(),data:{}});}};
}
for(const config of [{x:0,z:0,yaw:0},{x:13200,z:8300,yaw:.713},{x:13200,z:8300,yaw:.713,origin:{x:13000,z:8000}}])test(`future canonical pod fits all sockets at ${JSON.stringify(config)}`,async()=>{
 const h=await setup(config);try{for(let s=0;s<3;s++){const r=h.owner.queryOrchardPodCavity(h.frame,s);assert.equal(r?.clear,true);assert.ok(r.minimum>.14);assert.equal(r.sourceSha,G.sourceSha);}}finally{h.dispose();}
});
test('actual fixed pod blocks its exact future cavity while the other sockets remain clear',async()=>{
 const h=await setup();try{const pod=h.pod();h.owner.syncFromEntities([h.frame,pod]);assert.equal(h.owner.queryOrchardPodCavity(h.frame,1)?.clear,false);assert.equal(h.owner.queryOrchardPodCavity(h.frame,0)?.clear,true);assert.equal(h.owner.queryOrchardPodCavity(h.frame,2)?.clear,true);}finally{h.dispose();}
});
test('source pose tampering and copied source entities cannot authorize readiness',async()=>{
 const h=await setup();try{assert.equal(h.owner.queryOrchardPodCavity({...h.frame},1),null);const r=h.owner.records.get(h.frame.id);r.colliders[25].setTranslationWrtParent({x:5,y:0,z:0});assert.equal(h.owner.queryOrchardPodCavity(h.frame,1),null);}finally{h.dispose();}
});
test('origin changes during source-map validation refuse before reporting readiness',async()=>{
 const h=await setup();try{const entries=h.owner._colliderOwners,get=entries.get;let fired=false;entries.get=function(...args){if(!fired){fired=true;h.owner.setFrameOrigin({x:13000,z:8000},1);}return get.apply(this,args);};assert.equal(h.owner.queryOrchardPodCavity(h.frame,1),null);assert.equal(fired,true);delete entries.get;}finally{h.dispose();}
});
test('wrapped native reads are refused without invocation by cavity observation',async()=>{
 const h=await setup();try{const rec=h.owner.records.get(h.frame.id);let calls=0;rec.body.translation=()=>{calls++;throw Error('wrapped');};assert.equal(h.owner.queryOrchardPodCavity(h.frame,1),null);assert.equal(calls,0);delete rec.body.translation;}finally{h.dispose();}
});
