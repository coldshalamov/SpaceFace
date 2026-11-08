import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { frontierHomesteads } from '../src/systems/faction_frontier.js';
import { missions } from '../src/systems/missions.js';
import { ensureCampaign47aState, recordBeatStep } from '../src/story/campaign47a/index.js';
import { tickBarnReceivingContact } from '../src/missions/barnReceivingContact.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
function fixture(){
 const sim=createSimulation({seed:47,systems:[frontierHomesteads,missions],updateOrder:[]}),s=sim.state;
 s.mode='flight';s.run.kind='adventure';s.world.currentSectorId='sector_io_reach';
 const p=sim.spawn({type:'ship',team:'player',pos:sectorGlobalOrigin('sector_io_reach'),radius:22,hull:100,hullMax:100});s.playerId=p.id;
 s.story={beatIndex:4,branch:'free',flags:{embodied_route:'book',elroy_outcome:'force'}};ensureCampaign47aState(s);
 assert.equal(recordBeatStep(s,'mission:accepted',{type:'smuggling_run',storyTag:'story.branch_intro',branch:'free',factionId:'faction_free'},s.simTime).ok,true);
 const missionOwner=sim.registry.get('missions'),offer=missionOwner.ensureBoard('station_helios').slots.find(m=>m?.storyTag==='campaign47a:b4:operation');assert.ok(offer);assert.equal(missionOwner.acceptMission(offer.id),true);
 const owner=sim.registry.get('frontierHomesteads'),a=s.frontier.barnAttempt,frame=s.entities.get(a.frameId);p.pos.x=frame.pos.x+400;p.pos.z=frame.pos.z;
 const pop=[];sim.bus.on('comms:popup',e=>{if(e.id?.startsWith('barn_receiving:'))pop.push(e);});
 return {sim,s,p,owner,a,frame,pop,ring:()=>s.entityList.find(e=>e.alive&&e.data?.barnReceivingGuide),tick:()=>owner.update(1/60,s)};
}
test('ordinary Free branch board reaches nonphysical receiving ring and truthful staging instruction',()=>{
 const h=fixture();h.tick();const r=h.ring();assert.ok(r);assert.equal(r.physicsBody,false);assert.notEqual(r.flags?.persistent,true);assert.equal(r.data.ringRadius,130);assert.match(r.data.scanLabel,/0\/6/);assert.equal(h.pop.length,1);assert.match(h.pop[0].text,/first snap starts/);assert.equal(h.frame.data.raiseDeadline,undefined);h.tick();assert.equal(h.pop.length,1);
});
test('real raising owner snaps at130, starts clock, and contact follows committed slot rather than a forged event',()=>{
 const h=fixture();h.tick();h.sim.bus.emit('frontier:moduleSnapped',{missionId:h.a.missionId,count:6});h.tick();assert.equal(h.pop.length,1);
 const body=h.s.entities.get(h.a.moduleIds.habitat);body.pos.x=h.frame.pos.x+131;body.pos.z=h.frame.pos.z;h.tick();assert.notEqual(body.data.snapped,true);
 body.pos.x=h.frame.pos.x+130;h.tick();assert.equal(body.data.snapped,true);assert.match(h.ring().data.scanLabel,/1\/6/);assert.match(h.pop.at(-1).text,/240 seconds/);assert.match(h.pop.at(-1).text,/Tank, Solar, Dock, Garden, Mast/);assert.equal(h.pop.length,2);h.tick();assert.equal(h.pop.length,2);
});
test('docked and far pilot do not consume contact; stale frame generation and sector transitions remove guide',()=>{
 const h=fixture();h.s.ui.docked=true;h.tick();assert.equal(h.pop.length,0);h.s.ui.docked=false;h.p.pos.x+=1000;h.tick();assert.equal(h.pop.length,0);h.p.pos.x-=1000;h.tick();assert.equal(h.pop.length,1);
 h.frame.occupantGeneration+=1;tickBarnReceivingContact(h.owner);assert.equal(h.ring(),undefined);h.frame.occupantGeneration-=1;tickBarnReceivingContact(h.owner);assert.ok(h.ring());h.s.world.currentSectorId='sector_tethys_junction';h.tick();assert.equal(h.ring(),undefined);
});
test('mission completion and mode changes clean guides without granting or writing objective progress',()=>{
 const h=fixture();let grants=0;h.sim.bus.on('economy:grantCredits',()=>grants++);h.tick();h.s.mode='menu';h.tick();assert.equal(h.ring(),undefined);h.s.mode='flight';h.tick();assert.ok(h.ring());
 h.s.missions.active.find(m=>m.id===h.a.missionId).status='completed';h.tick();assert.equal(h.ring(),undefined);assert.equal(grants,0);
});
test('frontier serializer retains one-shot contact and malformed memory is repaired',()=>{
 const h=fixture();h.a.receivingContact='old';h.tick();assert.equal(h.pop.length,1);const snapshot=h.owner.serialize();assert.equal(snapshot.barnAttempt.receivingContact.arrived,true);
 h.owner.deserialize(structuredClone(snapshot));tickBarnReceivingContact(h.owner);assert.equal(h.pop.length,1);assert.equal(h.ring().data.ringRadius,130);
});

test('first local arrival after a seated module is lost reports the already-running clock',()=>{
 const h=fixture();h.p.pos.x+=1000;h.tick();const body=h.s.entities.get(h.a.moduleIds.habitat);body.pos.x=h.frame.pos.x+130;body.pos.z=h.frame.pos.z;h.tick();assert.equal(body.data.snapped,true);body.alive=false;h.s.simTime+=10;h.tick();h.p.pos.x-=1000;h.tick();assert.equal(h.pop.length,1);assert.match(h.pop[0].text,/0 of six are seated; 230 seconds remain/);assert.doesNotMatch(h.pop[0].text,/first snap starts/);
});
