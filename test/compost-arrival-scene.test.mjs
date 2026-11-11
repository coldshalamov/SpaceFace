import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity, stampOccupantGeneration } from '../src/core/entity.js';
import { understoryGardens } from '../src/systems/faction_understory.js';
import { syncCompostArrival, clearCompostArrival } from '../src/missions/compostArrivalScene.js';
import { UNDERSTORY_RECEIVER, receiverPosition, gardenGrowthRadius } from '../src/data/understoryReceiver.js';
import { cargo, addCargo } from '../src/systems/cargo.js';
import { lootShards } from '../src/systems/lootShards.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';

function fixture() {
 const state=createGameState(8008),bus=createBus(),events=[],admitted=[];let next=100;
 state.mode='flight';state.run={kind:'adventure'};state.world.currentSectorId=UNDERSTORY_RECEIVER.sectorId;
 state.story.beatIndex=2;state.story.campaign47a={stepProgress:{'2':{completed:['cinder_board']}}};state.simTime=100;
 const helpers={spawnEntity(spec){const e=makeEntity({...spec,id:next++});stampOccupantGeneration(state,e);state.entities.set(e.id,e);state.entityList.push(e);if(e.data?.compostArrivalMouth)admitted.push({id:e.id,visual:createVisualFactory().build(e)});return e;},
 removeEntity(id){const e=state.entities.get(id);if(e)e.alive=false;state.entities.delete(id);state.entityList=state.entityList.filter(e=>e.id!==id);},combatPhysics:{createAttachment:()=>({id:next++}),cutAttachment:()=>true}};
 const pos=receiverPosition(),player=helpers.spawnEntity({type:'ship',isPlayer:true,hull:100,mass:18,radius:12,pos:{x:pos.x-600,z:pos.z},vel:{x:0,z:0},data:{derived:{mass:18,operationalMass:18,propulsion:{mainAccel:100}}}});state.playerId=player.id;
 const owner=Object.create(understoryGardens),co=Object.create(cargo),lo=Object.create(lootShards),registry={get:n=>({understoryGardens:owner,cargo:co,lootShards:lo}[n])};
 for(const sys of [co,lo,owner])sys.init({state,bus,helpers,registry});
 bus.on('comms:popup',e=>events.push(e));bus.on('economy:grantCredits',e=>events.push({credit:e}));
 const garden=owner.ensureAuthoredReceiver();assert.ok(garden);ensureCombatState(state);
 const service=createAttachmentService({state,bus,helpers,catalog:createCombatCatalog()});
 const tick=()=>syncCompostArrival(owner,[garden]);
 const pod=(qty=1)=>{addCargo(state,'cmdty_ore_iron',qty);assert.equal(co.jettison('cmdty_ore_iron',qty),qty);return [...state.entityList].reverse().find(e=>e.alive&&e.data?.jettisonedCargo);};
 const attach=load=>{if(state.player.tether?.attachmentId!=null)service.cut(state.player.tether.attachmentId,player.id,'change-load');const result=service.create({defId:'tether_standard',ownerId:player.id,targetId:load.id});assert.equal(result.ok,true);const a=result.attachment||service.get(result.attachmentId);state.player.tether={active:true,targetId:load.id,attachmentId:a.id};return a;};
 return {state,bus,events,admitted,owner,garden,player,helpers,co,lo,pod,attach,tick,close(){for(const s of [owner,co,lo])s.destroy?.();}};
}
test('real close arrival uses receipt lane, no free feed/pay and no repeat after serialized conversation memory',()=>{
 const h=fixture();try{const before=JSON.stringify({data:h.garden.data,credits:h.state.player.credits,cargo:h.state.player.cargo});h.tick();
 assert.equal(h.events.length,1);assert.equal(h.events[0].id,'compost_arrival_arrival');assert.equal(h.events[0].storyReceipt,true);assert.match(h.events[0].text,/nothing is owed for arriving/);
 assert.equal(JSON.stringify({data:h.garden.data,credits:h.state.player.credits,cargo:h.state.player.cargo}),before);
 h.state.story.flags=JSON.parse(JSON.stringify(h.state.story.flags));h.state.simTime+=20;h.tick();assert.equal(h.events.length,1);
 }finally{h.close();}
});
for(const boundary of ['far','docked','other_sector','wrong_beat','no_cinder','survival','restoring','dead','fake_garden'])test(`no arrival or marker at ${boundary}`,()=>{
 const h=fixture();try{const load=h.pod(17);h.attach(load);h.tick();assert.ok(h.owner._compostArrivalMark);h.events.length=0;
 if(boundary==='far')h.player.pos.x-=1500;if(boundary==='docked')h.state.ui.docked=true;if(boundary==='other_sector')h.state.world.currentSectorId='sector_ceres_belt';if(boundary==='wrong_beat')h.state.story.beatIndex=3;if(boundary==='no_cinder')h.state.story.campaign47a.stepProgress['2'].completed=[];if(boundary==='survival')h.state.run.kind='survival';if(boundary==='restoring')h.bus.emit('save:restoring',{});if(boundary==='dead')h.player.alive=false;if(boundary==='fake_garden')h.state.entities.delete(h.garden.id);
 h.tick();assert.equal(h.owner._compostArrivalMark,null);assert.equal(h.events.length,0);
 }finally{h.close();}
});
test('ring follows actual load radius and edible cargo mass, with no solid or tether affordance',()=>{
 const h=fixture();try{const load=h.pod(17);h.attach(load);const before=JSON.stringify(h.garden.data);h.tick();const m=h.owner._compostArrivalMark;
 assert.ok(m);assert.equal(m.physicsBody,false);assert.equal(m.data.tetherable,false);assert.equal(m.flags.persistent,undefined);
 assert.equal(m.data.ringRadius,gardenGrowthRadius(h.garden)*1.15+load.radius);assert.ok(Math.abs(m.data.compostArrivalRead.feedMass-13.6)<1e-8);assert.equal(load.mass,20);
 assert.match(m.data.scanLabel,/13.6t edible feed.*enough for next growth/);assert.equal(JSON.stringify(h.garden.data),before);
 assert.equal(h.admitted[0].visual.getObjectByName('circuit-zone').geometry.parameters.outerRadius,m.data.ringRadius);
 const firstRadius=m.data.ringRadius;load.radius+=5;h.tick();const replacement=h.owner._compostArrivalMark;assert.notEqual(replacement,m);assert.equal(h.state.entities.has(m.id),false);
 assert.equal(h.admitted[1].visual.getObjectByName('circuit-zone').geometry.parameters.outerRadius,firstRadius+5);
 h.tick();assert.equal(h.owner._compostArrivalMark,replacement);assert.equal(h.admitted.length,2);
 h.state.simTime+=9;h.tick();assert.equal(h.events.at(-1).id,'compost_arrival_load');assert.match(h.events.at(-1).text,/Keep the Line attached.*Dump Chute instead/);
 h.state.player.tether.active=false;h.tick();assert.equal(h.owner._compostArrivalMark,null);assert.equal(h.state.entities.has(m.id),false);
 }finally{h.close();}
});
for(const boundary of ['owner_generation','target_generation','retired','foreign_mass'])test(`stale or ineligible held load loses its guide: ${boundary}`,()=>{
 const h=fixture();try{const load=h.pod(17),a=h.attach(load);h.tick();assert.ok(h.owner._compostArrivalMark);
 if(boundary==='owner_generation')a.ownerGeneration++;if(boundary==='target_generation')a.targetGeneration++;if(boundary==='retired')a.state='cut';if(boundary==='foreign_mass')load.data.jettisonedCargo=false;
 h.tick();assert.equal(h.owner._compostArrivalMark,null);
 }finally{h.close();}
});
test('real intake reports partial feed, then canonical growth once; never credits the collider floor or pays a short run',()=>{
 const h=fixture();try{h.tick();const one=h.pod(1);h.attach(one);one.pos={...h.garden.pos};h.owner.update(1/60,h.state);assert.equal(one.alive,false);h.state.simTime+=9;h.tick();
 assert.equal(h.events.at(-1).id,'compost_arrival_partial');assert.match(h.events.at(-1).text,/records 0.8t.*12.6t more feed/);assert.equal(h.garden.data.gardenStage,1);
 const rest=h.pod(16);h.attach(rest);rest.pos={...h.garden.pos};h.state.simTime+=9;h.owner.update(1/60,h.state);
 assert.equal(rest.alive,false);assert.equal(h.garden.data.gardenStage,2);assert.equal(h.events.at(-1).id,'compost_arrival_growth');assert.match(h.events.at(-1).text,/stage 1 to 2.*13.6\/240t/);
 assert.equal(h.events.filter(e=>e.credit).length,0);assert.equal(h.owner._compostArrivalMark,null);
 h.state.story.campaign47a.stepProgress['2'].completed.push('compost');h.state.story.flags=JSON.parse(JSON.stringify(h.state.story.flags));h.state.simTime+=20;h.tick();assert.equal(h.events.filter(e=>e.id==='compost_arrival_growth').length,1);
 }finally{h.close();}
});
test('synchronous restore after dialogue does not publish a stale cue, and destroy is idempotent',()=>{
 const h=fixture();try{let cues=0;h.bus.on('toast',()=>cues++);h.bus.on('comms:popup',()=>h.bus.emit('save:restoring',{}));h.tick();assert.equal(cues,0);clearCompostArrival(h.owner);clearCompostArrival(h.owner);
 }finally{h.close();}
});

test('saturated legacy garden never promises a nonexistent next growth',()=>{
 const h=fixture();try{h.garden.data.gardenBiomass=900;h.garden.data.gardenStage=5;const load=h.pod(17);h.attach(load);h.tick();
 assert.match(h.events.at(-1).text,/last stage; no further growth/);assert.match(h.owner._compostArrivalMark.data.scanLabel,/last stage; no further growth/);
 h.state.simTime+=9;h.tick();assert.equal(h.events.at(-1).id,'compost_arrival_load');assert.match(h.events.at(-1).text,/cannot produce a new growth here/);assert.doesNotMatch(h.events.at(-1).text,/enough for the next growth/);
 h.garden.data.compostFedMass=1;h.state.simTime+=9;h.tick();assert.equal(h.events.at(-1).id,'compost_arrival_partial');assert.match(h.events.at(-1).text,/last stage; no further growth/);assert.doesNotMatch(h.events.at(-1).text,/0t more feed reaches/);
 }finally{h.close();}
});
