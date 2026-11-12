import test from 'node:test';
import {tickBarnFirstProvision} from '../src/missions/barnFirstProvision.js';
import {save} from '../src/save/saveSystem.js';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { frontierHomesteads } from '../src/systems/faction_frontier.js';
import { missions } from '../src/systems/missions.js';
import { ensureCampaign47aState, recordBeatStep } from '../src/story/campaign47a/index.js';
import { tickHomesteadProvisionContact } from '../src/missions/homesteadProvisionContact.js';
import { economy } from '../src/systems/economy.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
function fixture(adopted=false){
 const sim=createSimulation({seed:47,systems:[frontierHomesteads,economy,missions],updateOrder:[]}),s=sim.state;
 s.mode='flight';s.run.kind='adventure';s.world.currentSectorId='sector_io_reach';
 const p=sim.spawn({type:'ship',team:'player',pos:sectorGlobalOrigin('sector_io_reach'),radius:22,hull:100,hullMax:100});s.playerId=p.id;
 s.story={beatIndex:4,branch:'free',flags:{embodied_route:'book',elroy_outcome:'force'}};ensureCampaign47aState(s);
 assert.equal(recordBeatStep(s,'mission:accepted',{type:'smuggling_run',storyTag:'story.branch_intro',branch:'free',factionId:'faction_free'},s.simTime).ok,true);
 if(adopted)sim.registry.get('frontierHomesteads')._tickSiteSeeding(s);
 const missionOwner=sim.registry.get('missions'),offer=missionOwner.ensureBoard('station_helios').slots.find(m=>m?.storyTag==='campaign47a:b4:operation');assert.ok(offer);assert.equal(missionOwner.acceptMission(offer.id),true);
 const owner=sim.registry.get('frontierHomesteads'),a=s.frontier.barnAttempt,frame=s.entities.get(a.frameId);p.pos.x=frame.pos.x+400;p.pos.z=frame.pos.z;
 for(const id of Object.values(a.moduleIds)){const b=s.entities.get(id);b.pos.x=frame.pos.x;b.pos.z=frame.pos.z;}owner._tickRaising(s,13);assert.equal(a.status,'completed');
 const pop=[];sim.bus.on('comms:popup',e=>{if(e.id?.startsWith('homestead_provision:'))pop.push(e);});
 return {sim,s,p,owner,a,frame,pop,ring:()=>s.entityList.find(e=>e.alive&&e.data?.homesteadProvisionGuide),tick:()=>owner.update(1/60,s)};
}
const crates=h=>h.s.entityList.filter(e=>e.alive&&e.data?.barnFirstProvision===h.a.missionId);
test('validated new dedicated Barn completion stages one real persistent10t first provision outside intake',()=>{
 const h=fixture();try{assert.equal(h.a.adoptedSite,false);assert.equal(h.a.firstProvisionPending,true);h.tick();const list=crates(h);assert.equal(list.length,1);const c=list[0];assert.equal(c.mass,10);assert.equal(c.physicsBody.mass,10);assert.equal(c.flags.persistent,true);assert.ok(Math.hypot(c.pos.x-h.frame.pos.x,c.pos.z-h.frame.pos.z)>200);assert.equal(h.s.frontier.homesteads[0].supplies,0);h.tick();assert.equal(crates(h).length,1);
 }finally{h.sim.dispose();}
});
test('adopted ordinary site and old completed save never mint a new crate',()=>{
 for(const kind of ['adopted','old']){const h=fixture();try{if(kind==='adopted')h.a.adoptedSite=true;else delete h.a.firstProvisionPending;h.tick();assert.equal(crates(h).length,0);}finally{h.sim.dispose();}}
});
test('canonical intake consumes provision once and existing economy pays normal fee',()=>{
 const h=fixture();try{h.tick();const c=crates(h)[0],before=h.s.player.credits,grants=[];h.sim.bus.on('economy:grantCredits',p=>grants.push(p));c.pos={x:h.frame.pos.x+201,z:h.frame.pos.z};h.tick();assert.equal(c.alive,true);c.pos.x=h.frame.pos.x+200;h.tick();assert.equal(c.alive,false);assert.equal(h.s.frontier.homesteads[0].supplies,1);assert.equal(grants.length,1);assert.equal(h.s.player.credits-before,grants[0].amount);h.tick();assert.equal(crates(h).length,0);assert.equal(grants.length,1);
 }finally{h.sim.dispose();}
});
test('saved issuance and moved real entity persist; missing or recycled crate is never replenished',()=>{
 for(const kind of ['lost','recycled']){const h=fixture();try{h.tick();const c=crates(h)[0];c.pos.x+=50;const entities=save._serializeEntities.call({state:h.s}),saved=h.owner.serialize();assert.ok(entities.persistent.some(e=>e.data?.barnFirstProvision===h.a.missionId&&e.pos.x===c.pos.x));assert.equal(saved.barnAttempt.firstProvisionIssued,true);
 h.owner.deserialize(structuredClone(saved));if(kind==='lost')c.alive=false;else{c.occupantGeneration++;c.data={unrelated:true};}h.tick();assert.equal(h.s.entityList.filter(e=>e.alive&&e.data?.barnFirstProvision).length,0);if(kind==='recycled')assert.equal(c.alive,true);
 }finally{h.sim.dispose();}}
});
test('saved pending request retries only clear space/failed spawn, not stale frame or wrong sector',()=>{
 const h=fixture();try{const saved=h.owner.serialize();h.owner.deserialize(structuredClone(saved));const a=h.s.frontier.barnAttempt;h.s.world.currentSectorId='sector_helios_prime';tickBarnFirstProvision(h.owner);assert.equal(crates(h).length,0);h.s.world.currentSectorId=a.sectorId;
 h.frame.occupantGeneration++;tickBarnFirstProvision(h.owner);assert.equal(crates(h).length,0);h.frame.occupantGeneration--;
 const spawn=h.owner.helpers.spawnEntity;h.owner.helpers.spawnEntity=()=>null;tickBarnFirstProvision(h.owner);assert.equal(a.firstProvisionIssued,false);assert.equal(a.firstProvisionPending,true);h.owner.helpers.spawnEntity=spawn;tickBarnFirstProvision(h.owner);assert.equal(crates(h).length,1);
 }finally{h.sim.dispose();}
});

test('actual ordinary site adoption retains its two existing supply pods without bonus stock',()=>{const h=fixture(true);try{assert.equal(h.a.adoptedSite,true);const before=h.s.entityList.filter(e=>e.alive&&e.data?.supplyCargo).map(e=>e.id);assert.equal(before.length,2);h.tick();assert.deepEqual(h.s.entityList.filter(e=>e.alive&&e.data?.supplyCargo).map(e=>e.id),before);assert.equal(crates(h).length,0);}finally{h.sim.dispose();}});
test('compatible already-issued site stock closes request without duplicating and blocked endpoints wait',()=>{const h=fixture();try{const obstacle=h.sim.spawn({type:'station',pos:{...h.frame.pos},radius:900,hull:100,hullMax:100,collides:true});tickBarnFirstProvision(h.owner);assert.equal(crates(h).length,0);assert.equal(h.a.firstProvisionPending,true);obstacle.alive=false;h.sim.spawn({type:'payload',pos:{x:h.frame.pos.x+300,z:h.frame.pos.z},radius:6,mass:10,hull:10,hullMax:10,data:{supplyCargo:true,frontierSite:h.a.siteId}});tickBarnFirstProvision(h.owner);assert.equal(crates(h).length,0);assert.equal(h.a.firstProvisionIssued,true);}finally{h.sim.dispose();}});
test('native starting Pelican catches first provision and winches it into real homestead intake',{timeout:120000},async()=>{
 const {bootRealPath,writeRealPathInput}=await import('../scripts/lib/bench/realPath.mjs');const {combat}=await import('../src/systems/combat.js');const {tetherGameplay}=await import('../src/systems/tetherGameplay.js');const {lineProgression}=await import('../src/systems/lineProgression.js');
 const origin=sectorGlobalOrigin('sector_io_reach');const h=await bootRealPath({seed:47,systems:[frontierHomesteads,economy,missions,combat,tetherGameplay,lineProgression,'flightV3','physics'],hulls:[{hullId:'ship_pelican',isPlayer:true,pos:origin,rot:0}]});
 try{const s=h.state,owner=h.runtime.getSystem('frontierHomesteads');s.mode='flight';s.run.kind='adventure';s.world.currentSectorId='sector_io_reach';s.story={beatIndex:4,branch:'free',flags:{embodied_route:'book',elroy_outcome:'force'}};ensureCampaign47aState(s);assert.equal(recordBeatStep(s,'mission:accepted',{type:'smuggling_run',storyTag:'story.branch_intro',branch:'free',factionId:'faction_free'},s.simTime).ok,true);
 const mo=h.runtime.getSystem('missions'),offer=mo.ensureBoard('station_helios').slots.find(m=>m.storyTag==='campaign47a:b4:operation');assert.equal(mo.acceptMission(offer.id),true);const a=s.frontier.barnAttempt,frame=s.entities.get(a.frameId);
 for(const id of Object.values(a.moduleIds)){const b=s.entities.get(id);b.pos.x=frame.pos.x;b.pos.z=frame.pos.z;}owner._tickRaising(s,13);tickBarnFirstProvision(owner);const pod=s.entityList.find(e=>e.alive&&e.data?.barnFirstProvision===a.missionId);assert.ok(pod);const dx=pod.pos.x-frame.pos.x,dz=pod.pos.z-frame.pos.z,len=Math.hypot(dx,dz),ux=dx/len,uz=dz/len;
 let impacts=0,grants=[],allGrants=[];h.bus.on('physics:impact',e=>{if([h.player.id,pod.id].includes(e.aId)||[h.player.id,pod.id].includes(e.bId))impacts++;});h.bus.on('economy:grantCredits',e=>{allGrants.push(e);if(e.reason?.startsWith('frontier_supply:'))grants.push(e);});const before=s.player.credits;
 async function fly(goal,speed=15){for(let n=0;n<18000;n++){const p=h.player,x=goal.x-p.pos.x,z=goal.z-p.pos.z;if(Math.hypot(x,z)<2&&Math.hypot(p.vel.x,p.vel.z)<1)return;const scale=Math.min(.5,speed/Math.max(1,Math.hypot(x,z))),ax=(x*scale-p.vel.x)*.12,az=(z*scale-p.vel.z)*.12,co=Math.cos(p.rot),sn=Math.sin(p.rot);writeRealPathInput(s,{moveZ:ax*co+az*sn,moveX:-ax*sn+az*co});h.step(1);}assert.fail('provision approach timed out');}
 // Initial route goes via an outside staging point; no pod or player teleport after boot.
 await fly({x:frame.pos.x+ux*230-uz*350,z:frame.pos.z+uz*230+ux*350});await fly({x:frame.pos.x+ux*230,z:frame.pos.z+uz*230});writeRealPathInput(s,{});s.input.tetherMode='cursor';s.input.aimWorld={x:pod.pos.x,z:pod.pos.z};s.input.actions.tetherFire=true;h.step(2);s.input.actions.tetherFire=false;assert.equal(s.player.tether.targetId,pod.id);const nativeMass=h.runtime.getSystem('physics')._sg02.records.get(pod.id).body.mass();assert.ok(Math.abs(nativeMass-10)<.001);
 await fly({x:frame.pos.x+ux*140,z:frame.pos.z+uz*140},3);writeRealPathInput(s,{});s.input.actions.reelDelta=-1;for(let n=0;n<1200&&pod.alive;n++)h.step(1);s.input.actions.reelDelta=0;
 assert.equal(pod.alive,false);assert.equal(s.frontier.homesteads[0].supplies,1);assert.equal(grants.length,1);assert.equal(s.player.credits-before,allGrants.reduce((n,e)=>n+e.amount,0));h.step(60);assert.equal(grants.length,1);assert.equal(impacts,0);assert.equal(h.proof().backend,'rapier-dynamic');console.log('BARN_FIRST_PROVISION_NATIVE',JSON.stringify({time:s.simTime,impacts,nativeMass,supplyPaid:grants[0].amount,allGrants}));
 }finally{h.dispose();}
});
