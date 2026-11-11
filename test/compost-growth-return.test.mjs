import { compostRouteFocus } from '../src/missions/compostRoute.js';
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

function partial(h) {
 h.tick();const load=h.pod(15);h.attach(load);load.pos={...h.garden.pos};h.owner.update(1/60,h.state);
 h.state.simTime+=9;h.tick();assert.equal(h.garden.data.compostFedMass,12);assert.equal(h.garden.data.gardenBiomass,59.2);
 h.state.player.tether.active=false;
}
function route(h) { return compostRouteFocus({state:h.state,registry:h.owner.ctx.registry}); }
function ironFace(h) {
 h.player.data.miningBeam={tierId:'beam_mk1',dps:18,range:240};
 const face={id:'ordinary-iron-face',type:'asteroid',alive:true,fieldResident:true,pos:{x:h.player.pos.x-300,z:h.player.pos.z},radius:10,mass:100,hull:100,
 data:{typeId:'ast_metallic',oreHP:100,oreHPMax:100,sectorId:UNDERSTORY_RECEIVER.sectorId}};
 h.state.world.asteroidField={schema:'spaceface.asteroidField.v1',rocks:[face]};return face;
}
test('partial hold offers a real ordinary acquisition route and preserves the choice to feed the part',()=>{
 const h=fixture();try{partial(h);addCargo(h.state,'cmdty_silicate',1);const face=ironFace(h);
 const before=JSON.stringify({cargo:h.state.player.cargo,garden:h.garden.data,field:h.state.world.asteroidField,credits:h.state.player.credits});
 const read=route(h);assert.equal(read.label,'Compost Run — Charon iron face');assert.deepEqual(read.pos,face.pos);
 assert.match(read.reason,/1u Silicate Rock is 0.6t, short.*feed it at Rookside now.*Mine ordinary iron.*2u.*1.4t/);
 assert.match(read.reason,/Only actual ore collected counts; keep enough unsold/);
 assert.equal(JSON.stringify({cargo:h.state.player.cargo,garden:h.garden.data,field:h.state.world.asteroidField,credits:h.state.player.credits}),before);
 assert.equal(h.state.entities.has(face.id),false);
 }finally{h.close();}
});
for(const missing of ['beam','space','face','mode'])test(`partial cargo remains usable without an eligible mining route: ${missing}`,()=>{
 const h=fixture();try{partial(h);addCargo(h.state,'cmdty_silicate',1);const face=ironFace(h);
 if(missing==='beam'){delete h.player.data.miningBeam;h.state.player.miningBeam=null;}if(missing==='space')h.state.player.cargo.capVolume=h.state.player.cargo.usedVolume;
 if(missing==='face')face.data.oreHP=0;if(missing==='mode')h.state.ui.beamMode='repair';
 const read=route(h);assert.match(read.label,/west outside-mouth approach/);assert.match(read.reason,/jettison 1u \(0.6t feed\).*0.8t would still be needed/);
 assert.match(read.reason,/Line attached until intake; releasing near a station can sell/);assert.doesNotMatch(read.reason,/Mine ordinary iron/);
 }finally{h.close();}
});
test('a sufficient free commodity wins over the first catalog partial lot',()=>{
 const h=fixture();try{partial(h);addCargo(h.state,'cmdty_ore_iron',1);addCargo(h.state,'cmdty_silicate',3);ironFace(h);
 const read=route(h);assert.match(read.reason,/free Silicate Rock: jettison 3u \(1.8t feed\)/);assert.match(read.reason,/enough for the next growth/);assert.doesNotMatch(read.reason,/Mine ordinary iron/);
 }finally{h.close();}
});
test('resupply and new-load conversation reads kept feed, then real growth; no extra rewards or repeats',()=>{
 const h=fixture();try{partial(h);addCargo(h.state,'cmdty_silicate',1);ironFace(h);h.state.simTime+=9;
 const before=JSON.stringify({cargo:h.state.player.cargo,garden:h.garden.data});h.tick();assert.equal(h.events.at(-1).id,'compost_arrival_resupply');assert.match(h.events.at(-1).text,/12t is still here.*2u.*Nothing has been added/);assert.equal(JSON.stringify({cargo:h.state.player.cargo,garden:h.garden.data}),before);
 h.state.story.flags=JSON.parse(JSON.stringify(h.state.story.flags));h.state.simTime+=9;h.tick();assert.equal(h.events.filter(e=>e.id==='compost_arrival_resupply').length,1);
 const load=h.pod(2);h.attach(load);h.state.simTime+=9;h.tick();assert.equal(h.events.at(-1).id,'compost_arrival_returnLoad');assert.match(h.events.at(-1).text,/1.6t of new edible material.*can make the first growth/);assert.equal(h.garden.data.gardenStage,1);
 h.state.simTime+=9;load.pos={...h.garden.pos};h.owner.update(1/60,h.state);assert.equal(h.garden.data.gardenStage,2);assert.ok(Math.abs(h.garden.data.compostFedMass-13.6)<1e-8);assert.equal(h.events.at(-1).id,'compost_arrival_growth');assert.equal(h.events.filter(e=>e.credit).length,0);
 }finally{h.close();}
});
test('a short new load cannot be described as a guaranteed first growth',()=>{
 const h=fixture();try{partial(h);const load=h.pod(1);h.attach(load);h.state.simTime+=9;h.tick();assert.equal(h.events.at(-1).id,'compost_arrival_returnLoad');assert.match(h.events.at(-1).text,/0.6t more would still be needed/);assert.doesNotMatch(h.events.at(-1).text,/can make the first growth/);
 }finally{h.close();}
});
