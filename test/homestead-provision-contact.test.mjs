import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { frontierHomesteads } from '../src/systems/faction_frontier.js';
import { missions } from '../src/systems/missions.js';
import { ensureCampaign47aState, recordBeatStep } from '../src/story/campaign47a/index.js';
import { tickHomesteadProvisionContact } from '../src/missions/homesteadProvisionContact.js';
import { economy } from '../src/systems/economy.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
function fixture(){
 const sim=createSimulation({seed:47,systems:[frontierHomesteads,economy,missions],updateOrder:[]}),s=sim.state;
 s.mode='flight';s.run.kind='adventure';s.world.currentSectorId='sector_io_reach';
 const p=sim.spawn({type:'ship',team:'player',pos:sectorGlobalOrigin('sector_io_reach'),radius:22,hull:100,hullMax:100});s.playerId=p.id;
 s.story={beatIndex:4,branch:'free',flags:{embodied_route:'book',elroy_outcome:'force'}};ensureCampaign47aState(s);
 assert.equal(recordBeatStep(s,'mission:accepted',{type:'smuggling_run',storyTag:'story.branch_intro',branch:'free',factionId:'faction_free'},s.simTime).ok,true);
 const missionOwner=sim.registry.get('missions'),offer=missionOwner.ensureBoard('station_helios').slots.find(m=>m?.storyTag==='campaign47a:b4:operation');assert.ok(offer);assert.equal(missionOwner.acceptMission(offer.id),true);
 const owner=sim.registry.get('frontierHomesteads'),a=s.frontier.barnAttempt,frame=s.entities.get(a.frameId);p.pos.x=frame.pos.x+400;p.pos.z=frame.pos.z;
 for(const id of Object.values(a.moduleIds)){const b=s.entities.get(id);b.pos.x=frame.pos.x;b.pos.z=frame.pos.z;}owner._tickRaising(s,13);assert.equal(a.status,'completed');
 const pop=[];sim.bus.on('comms:popup',e=>{if(e.id?.startsWith('homestead_provision:'))pop.push(e);});
 return {sim,s,p,owner,a,frame,pop,ring:()=>s.entityList.find(e=>e.alive&&e.data?.homesteadProvisionGuide),tick:()=>owner.update(1/60,s)};
}
test('completed actual Barn job opens provision range with one real first provision',()=>{
 const h=fixture();h.tick();assert.equal(h.ring().data.ringRadius,200);assert.equal(h.ring().physicsBody,false);assert.match(h.pop[0].text,/There are Homestead Supplies nearby/);assert.match(h.ring().data.scanLabel,/0 deliveries recorded/);h.tick();assert.equal(h.pop.length,1);
});
test('real homestead owner consumes only supply pod inside200 and pays once; feedback reads ledger',()=>{
 const h=fixture();h.tick();const credits=h.s.player.credits,grants=[];h.sim.bus.on('economy:grantCredits',e=>grants.push(e));
 const pod=h.sim.spawn({type:'payload',pos:{x:h.frame.pos.x+201,z:h.frame.pos.z},radius:6,mass:10,hull:10,hullMax:10,data:{supplyCargo:true}});h.tick();assert.equal(pod.alive,true);assert.equal(h.s.player.credits,credits);
 pod.pos.x=h.frame.pos.x+200;h.tick();assert.equal(pod.alive,false);assert.equal(grants.length,1);assert.equal(h.s.player.credits,credits+grants[0].amount);assert.match(h.ring().data.scanLabel,/1 deliveries recorded/);assert.match(h.pop.at(-1).text,/recorded a supply delivery/);h.tick();assert.equal(grants.length,1);assert.equal(h.pop.length,2);
});
test('elapsed time and return report open supply request despite cumulative prior deliveries',()=>{
 const h=fixture();h.tick();const pod=h.sim.spawn({type:'payload',pos:{...h.frame.pos},radius:6,mass:10,hull:10,hullMax:10,data:{supplyCargo:true}});h.tick();assert.equal(pod.alive,false);h.p.pos.x+=1000;h.s.simTime+=301;h.tick();assert.match(h.ring().data.scanLabel,/SUPPLY REQUEST OPEN/);h.p.pos.x-=1000;h.tick();assert.match(h.pop.at(-1).text,/stores need attention/);assert.equal(h.s.frontier.homesteads[0].supplies,1);
});
test('locality, generation, mode and serializer boundaries do not replay contact',()=>{
 const h=fixture();h.s.ui.docked=true;h.tick();assert.equal(h.pop.length,0);h.s.ui.docked=false;h.tick();const saved=h.owner.serialize();h.owner.deserialize(structuredClone(saved));tickHomesteadProvisionContact(h.owner);assert.equal(h.pop.length,1);
 h.frame.occupantGeneration++;tickHomesteadProvisionContact(h.owner);assert.equal(h.ring(),undefined);h.frame.occupantGeneration--;h.s.mode='menu';h.tick();assert.equal(h.ring(),undefined);h.s.mode='flight';h.tick();assert.ok(h.ring());h.s.world.currentSectorId='sector_tethys_junction';h.tick();assert.equal(h.ring(),undefined);
});
test('nearby existing supplies are described but arbitrary module and forged receipt do not count',()=>{
 const h=fixture();h.sim.spawn({type:'payload',pos:{x:h.frame.pos.x+250,z:h.frame.pos.z},radius:6,hull:10,hullMax:10,data:{supplyCargo:true}});h.tick();assert.match(h.pop[0].text,/There are Homestead Supplies nearby/);
 h.sim.spawn({type:'payload',pos:{...h.frame.pos},radius:6,hull:10,hullMax:10,data:{homesteadModule:'garden'}});h.sim.bus.emit('frontier:supplyDelivered',{homesteadId:h.frame.id,supplies:9});h.tick();assert.equal(h.pop.length,1);assert.match(h.ring().data.scanLabel,/0 deliveries/);
});
test('actual frame loss removes receiving guide and invalid contact memory normalizes safely',()=>{
 const h=fixture();const rec=h.s.frontier.homesteads[0];rec.provisionContact='old';h.tick();assert.equal(h.pop.length,1);assert.equal(rec.provisionContact.welcomed,true);rec.provisionContact=[];h.tick();assert.equal(Array.isArray(rec.provisionContact),false);
 const before=h.s.player.credits;h.frame.alive=false;h.tick();assert.equal(rec.gone,true);assert.equal(h.ring(),undefined);h.tick();assert.equal(h.s.player.credits,before);assert.equal(h.pop.length,2);
});
