import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity, stampOccupantGeneration } from '../src/core/entity.js';
import { missions } from '../src/systems/missions.js';
import { combat } from '../src/systems/combat.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { createRookBooth } from '../src/systems/rookBooth.js';
import { createCampaign47aState } from '../src/story/campaign47a/campaignSchema.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { rookPadPosition } from '../src/characters/rookRules.js';
import { cinderPlayerTow, cinderRouteFocus } from '../src/missions/cinderRoute.js';
import { flightDestinationSurface, resolveFlightObjectiveCommand } from '../src/ui/hud.js';
const SECTOR = 'sector_charon_expanse', PAD = rookPadPosition();

function fixture() {
  const state = createGameState(47), bus = createBus();
  state.mode = 'flight'; state.run = { kind: 'adventure' };
  state.world.currentSectorId = 'sector_tethys_junction';
  state.story.beatIndex = 2; state.story.campaign47a = createCampaign47aState();
  state.onboarding = { active: false, finished: true };
  state.player.credits = 5000; state.player.heat = 0;
  let next = 100;
  const helpers = {
    voice: { say: () => true },
    spawnEntity(spec) {
      const e = makeEntity({ ...spec, id: next++ }); stampOccupantGeneration(state,e);
      state.entities.set(e.id,e); state.entityList.push(e); return e;
    },
    removeEntity(id) { const e=state.entities.get(id); if(e)e.alive=false;state.entities.delete(id);state.entityList=state.entityList.filter(e=>e.id!==id); },
    combatPhysics: { createAttachment: () => ({ id: next++ }), cutAttachment: () => true },
  };
  const player=helpers.spawnEntity({type:'ship',isPlayer:true,team:1,pos:PAD,vel:{x:0,z:0},mass:18,radius:12,hull:100,data:{}});
  state.playerId=player.id;
  const owner=Object.create(missions), aftermath=Object.create(aftermathWrecks), rook=createRookBooth();
  const registry={get:name=>({missions:owner,aftermathWrecks:aftermath,rookBooth:rook}[name]||null)};
  owner.init({state,bus,helpers,registry}); aftermath.init({state,bus,helpers,registry}); rook.init({state,bus,helpers,registry});
  const board=owner.ensureBoard('station_tethys');
  const offer=board.slots.find(m=>m.storyTag==='campaign47a:b2:cinder');assert.ok(offer);
  assert.equal(owner.acceptMission(offer.id),true);
  const m=state.missions.active.find(m=>m.storyTag===offer.storyTag);
  state.world.currentSectorId=SECTOR;bus.emit('sector:enter',{sectorId:SECTOR});owner.spawnTargetsForSector(SECTOR);
  assert.equal(m.targetEntityIds.length,3);
  const killer=Object.assign(Object.create(combat),{state,bus,helpers});
  for(const id of [...m.targetEntityIds])killer.kill(state.entities.get(id),state.playerId);
  const hull=aftermath._resolveBoundWreck(m.params.cinderMarkedWrecks[0].markerId);assert.ok(hull);
  ensureCombatState(state);
  const service=createAttachmentService({state,bus,helpers,catalog:createCombatCatalog()});
  function attach(body=hull) {
    const result=service.create({defId:'tether_standard',ownerId:player.id,targetId:body.id});assert.equal(result.ok,true,JSON.stringify(result));
    const a=result.attachment || service.get(result.attachmentId);
    assert.ok(a);
    state.player.tether={active:true,targetId:body.id,attachmentId:a.id};return a;
  }
  const a=attach();state.ui.trackedMissionId=m.id;
  function read(){owner.update(1/60,state);return flightDestinationSurface(state,resolveFlightObjectiveCommand(state)).line;}
  return {state,bus,owner,aftermath,rook,player,hull,m,a,service,attach,read,helpers};
}

test('ordinary Cinder kill and canonical wreck, real attachment, native update and visible flight reader show load arrival gates',()=>{
 const h=fixture();h.hull.pos={x:PAD.x+134,z:PAD.z};h.hull.vel={x:12,z:0};h.player.vel={x:12,z:0};
 let line=h.read();assert.match(line,/HULL 34 WU OUTSIDE RING/);assert.match(line,/12.0 \/ 8 WU\/s/);assert.match(line,/BRAKE THE HULL/);
 h.hull.pos.x=PAD.x+80;line=h.read();assert.match(line,/HULL INSIDE RING/);assert.match(line,/BRAKE THE HULL/);
 h.hull.vel.x=8;line=h.read();assert.match(line,/Inside and slow enough — hold for Rook/);
 assert.equal(h.m.status,'active');assert.equal(h.m.params.cinderDeliveredMarkerId,undefined);
 h.rook.update(1/60,h.state);assert.equal(h.m.status,'completed');assert.equal(h.hull.alive,false);
 assert.equal(cinderPlayerTow(h.m,h.state),null);
});

test('hull gate is not cockpit position; fractional outside and over-speed never imply accepted',()=>{
 const h=fixture();h.player.pos={...PAD};h.hull.pos={x:PAD.x+100.01,z:PAD.z};h.hull.vel={x:8.04,z:0};
 assert.match(h.read(),/HULL 1 WU OUTSIDE RING.*8.1 \/ 8 WU\/s.*BRAKE THE HULL/);
 h.hull.vel={x:0,z:0};assert.match(h.read(),/Bring the hull into the ring/);
});

test('released, NPC-owned, broken, recycled or malformed lines cannot claim player intake',()=>{
 for(const mutate of [h=>h.state.player.tether.active=false,h=>h.a.ownerId=999,h=>h.a.state='broken',h=>h.a.targetGeneration='old',h=>h.a.ownerGeneration='old',h=>delete h.state.player.tether.attachmentId,h=>h.hull.data.markerId='unrelated',h=>h.hull.data.provenance.markerId='unrelated',h=>delete h.hull.occupantGeneration,h=>h.m.params.cinderMarkedWrecks[0].disposition='stripped',h=>h.hull.data.rookClaimed=true,h=>h.m.params.cinderEvidenceInvalid=true]) {
   const h=fixture();h.hull.pos={...PAD};h.hull.flags.tethered=true;mutate(h);
   assert.equal(cinderPlayerTow(h.m,h.state),null);assert.doesNotMatch(h.read(),/HULL INSIDE RING|hull speed/);
 }
});

test('finite local telemetry only; unknown velocities and remote or docked contexts stay instructional',()=>{
 for(const mutate of [h=>h.hull.vel.x=NaN,h=>h.hull.pos.x=NaN,h=>h.hull.pos.x=PAD.x+601,h=>h.state.ui.docked=true,h=>h.state.world.currentSectorId='sector_tethys_junction',h=>h.state.run.kind='survival']) {
   const h=fixture();h.hull.pos={...PAD};mutate(h);
   assert.doesNotMatch(cinderRouteFocus(h.m,h.state).reason,/HULL INSIDE RING|hull speed/);
 }
});

test('Continue-style rematerialization requires fresh authenticated attachment, never persisted old runtime ids',()=>{
 const h=fixture();const old=h.hull;old.pos={...PAD};old.vel={x:9,z:0};
 const markerId=old.data.markerId;
 const saved=JSON.parse(JSON.stringify(h.aftermath.serialize()));
 h.service.cut(h.a.id,h.player.id,'test');
 for(const e of [...h.state.entityList])if(e.data?.persistenceOwner==='aftermathWrecks')h.helpers.removeEntity(e.id);
 h.aftermath.deserialize(saved);h.aftermath._spawnForSector(SECTOR);
 const restored=h.aftermath._resolveBoundWreck(markerId);
 assert.ok(restored);assert.notEqual(restored.id,old.id);
 assert.equal(cinderPlayerTow(h.m,h.state),null);
 h.attach(restored);assert.equal(cinderPlayerTow(h.m,h.state),restored);
 assert.match(h.read(),/HULL INSIDE RING.*9.0 \/ 8 WU\/s.*BRAKE THE HULL/);
});

test('active held-load projection needs no entity-list sweep and does not mutate material or money',()=>{
 const h=fixture();h.hull.pos={...PAD};h.hull.vel={x:10,z:0};
 const before=JSON.stringify({m:h.m,credits:h.state.player.credits,aftermath:h.state.aftermathWrecks});
 const list=h.state.entityList;h.state.entityList=new Proxy(list,{get(t,k){if(k===Symbol.iterator||k==='find'||k==='filter')throw Error('entity sweep');return Reflect.get(t,k);}});
 assert.match(cinderRouteFocus(h.m,h.state).reason,/BRAKE THE HULL/);
 assert.equal(JSON.stringify({m:h.m,credits:h.state.player.credits,aftermath:h.state.aftermathWrecks}),before);
});
