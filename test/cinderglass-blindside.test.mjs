import test from 'node:test';
import assert from 'node:assert/strict';
import {candidateScene,placeBody} from './cinderglass-job-fixture.mjs';
import {podSpec} from '../src/features/cinderglassJob/convoy.js';
import {lawWitnessesNear} from '../src/systems/lawSecurity.js';
import {witnessLineOfSight} from '../src/combat/lineOfSight.js';
import {CINDERGLASS_JOB_POINTS as P} from '../src/features/cinderglassJob/definition.js';

test('sealed original screens a real witness only on its physical blind side',async()=>{
 const t=await candidateScene({withLaw:true});try{await t.accept();
 const pos={x:P.pullOff.x+2000,z:P.pullOff.z+2000};
 placeBody(t,t.player,{x:pos.x+30,z:pos.z});
 const w=t.sim.spawn({type:'ship',pos,vel:{x:0,z:0},radius:2,hull:100,collides:true,data:{lawWitness:true}});
 const pod=t.sim.spawn(podSpec({x:pos.x+15,z:pos.z},0,'cover-fixture'));
 t.step(2);
 assert.equal(lawWitnessesNear(t.state,{pos:t.player.pos,offenderEntityId:t.player.id,radius:100}).some(x=>x.entityId===w.id),false);
 assert.equal(witnessLineOfSight(t.state,w,t.player.pos,[t.player.id]),false);
 placeBody(t,t.player,{x:pos.x+30,z:pos.z+30});t.step();
 assert.equal(lawWitnessesNear(t.state,{pos:t.player.pos,offenderEntityId:t.player.id,radius:100}).some(x=>x.entityId===w.id),true);
 assert.equal(witnessLineOfSight(t.state,w,t.player.pos,[t.player.id]),true);
 assert.equal(pod.mass,18);
 }finally{t.sim.dispose();}
});
test('Continue preserves new original cover and outer escort routes',async()=>{
 const t=await candidateScene();try{await t.accept();
 const saved=t.sim.registry.get('save').serializeData();t.restore(saved);
 assert.equal(t.body('podId').data.sensorBlocking,true);
 assert.equal(t.originalCount(),1);
 for(const [key,point] of [['escortAJobId',P.escortBuoyA],['escortBJobId',P.escortBuoyB]]){
  const route=t.state.npcJobs.byId[t.cg().entities[key]].job.route;
  assert.deepEqual(route[1].pos,point);
 }
 }finally{t.sim.dispose();}
});
test('rebind does not rewrite an already-running old original or its saved itinerary',async()=>{
 const t=await candidateScene();try{await t.accept();const pod=t.body('podId');delete pod.data.sensorBlocking;
 const j=t.state.npcJobs.byId[t.cg().entities.escortAJobId].job;
 j.route[1].pos={x:P.pullOff.x-120,z:P.pullOff.z+160};const before=structuredClone(j.route);
 t.sys._rebind(t.state);assert.equal(pod.data.sensorBlocking,undefined);assert.deepEqual(j.route,before);
 }finally{t.sim.dispose();}
});
