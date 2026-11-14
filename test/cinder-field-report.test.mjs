import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity, stampOccupantGeneration } from '../src/core/entity.js';
import { missions } from '../src/systems/missions.js';
import { combat } from '../src/systems/combat.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { createRookBooth, rookMarketPadSpec } from '../src/systems/rookBooth.js';
import { createCampaign47aState } from '../src/story/campaign47a/campaignSchema.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { rookPadPosition } from '../src/characters/rookRules.js';
import { cinderPlayerTow, cinderRouteFocus, cinderFieldReport, cinderJournalAction } from '../src/missions/cinderRoute.js';
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
  return {state,bus,owner,aftermath,rook,player,hull,m,a,service,attach,read,helpers,killer};
}


import { storyActionForBeat, missionLogScreen, recommendedActions } from '../src/ui/screens/missionLog.js';
function consume(h, body) { h.bus.emit('salvage:completed',{wreckId:body.id,markerId:body.data.markerId,source:'mining:beam'});h.helpers.removeEntity(body.id); }
function otherHull(h,n=1){return h.aftermath._resolveBoundWreck(h.m.params.cinderMarkedWrecks[n].markerId);}

test('actual owner retirements become a finite field report and name the remaining hull',()=>{
 const h=fixture();h.service.cut(h.a.id,'test-release');h.state.player.tether.active=false;
 h.aftermath._retireDestroyedMarker(h.aftermath._markerById(otherHull(h,1).data.markerId),otherHull(h,1).id);consume(h,otherHull(h,2));
 const r=cinderFieldReport(h.m,h.state);assert.equal(r.destroyed,1);assert.equal(r.consumed,1);assert.equal(r.recorded,1);assert.equal(r.pending,0);
 assert.match(r.text,/last recorded hull.*forfeits the contract pay/);assert.match(cinderRouteFocus(h.m,h.state).label,/Cinder One/);
 const before=JSON.stringify(h.m);const a=storyActionForBeat({beat:2},h.state);assert.equal(a.label,'CINDER FIELD REPORT');assert.match(a.body,/1 marked hull destroyed/);assert.match(a.body,/1 marked hull stripped or sold elsewhere/);assert.equal(JSON.stringify(h.m),before);
});
test('missing streamed body or missing marker never silently becomes a lost hull',()=>{
 const h=fixture();h.helpers.removeEntity(h.hull.id);let r=cinderFieldReport(h.m,h.state);assert.equal(r.recorded,3);assert.equal(r.destroyed,0);
 for(const key of Object.keys(h.state.aftermathWrecks.bySector))h.state.aftermathWrecks.bySector[key]=[];
 r=cinderFieldReport(h.m,h.state);assert.equal(r.recorded,3);assert.equal(r.destroyed,0);assert.equal(r.consumed,0);
});
test('clearance without a received marker remains pending, not an invented hull or terminal loss',()=>{
 const h=fixture();h.m.params.cinderMarkedWrecks=[];h.m.params.cinderEscapedSlots=[0];
 const r=cinderFieldReport(h.m,h.state);assert.equal(r.drivenOff,1);assert.equal(r.pending,2);assert.equal(r.recorded,0);assert.match(r.text,/missing is not lost/);assert.doesNotMatch(r.text,/last recorded hull/);
});
test('WANTED means refusal in and far outside Rook ring, never hold for an impossible sale',()=>{
 const h=fixture();h.state.player.heat=.2;
 for(const dx of [0,500,1400]){h.hull.pos={x:PAD.x+dx,z:PAD.z};h.hull.vel={x:0,z:0};let f=cinderRouteFocus(h.m,h.state);assert.match(f.label,/WANTED blocks intake/);assert.match(f.reason,/ROOK REFUSES WHILE WANTED/);assert.doesNotMatch(f.reason,/hold for Rook|Bring the hull into the ring/);}
 h.state.player.heat=0;h.hull.pos={...PAD};assert.match(cinderRouteFocus(h.m,h.state).reason,/hold for Rook/);
});
test('Quiet sale spends the original proof and its 15cr cannot stand in for the 700cr contract',()=>{
 const h=fixture();const quiet=rookMarketPadSpec('quietline').pos;h.hull.pos={...quiet};h.hull.vel={x:0,z:0};const events=[];h.bus.on('rookWreck:delivered',p=>events.push(p));h.rook.update(1/60,h.state);
 assert.equal(events.length,1);assert.equal(events[0].standId,'quietline');assert.equal(h.hull.alive,false);assert.equal(h.m.status,'active');assert.equal(h.m.params.cinderDeliveredMarkerId,undefined);
 const r=cinderFieldReport(h.m,h.state);assert.equal(r.consumed,1);assert.equal(r.recorded,2);assert.equal(r.delivered,false);assert.match(cinderJournalAction(h.state).body,/no Rook proof/);
 h.rook.update(1/60,h.state);assert.equal(events.length,1);
});
test('Rook receipt wins over disposal and the Journal advances only after the canonical completion',()=>{
 const h=fixture();h.hull.pos={...PAD};h.hull.vel={x:0,z:0};h.rook.update(1/60,h.state);
 assert.equal(h.m.status,'completed');const r=cinderFieldReport(h.m,h.state);assert.equal(r.delivered,true);assert.equal(r.consumed,0);assert.equal(cinderJournalAction(h.state),null);assert.equal(storyActionForBeat({beat:2},h.state).label,'COMPOST');
});
test('owner serialization keeps casualty accounting and body absence distinct on Continue',()=>{
 const h=fixture();h.aftermath._retireDestroyedMarker(h.aftermath._markerById(otherHull(h,1).data.markerId),otherHull(h,1).id);consume(h,otherHull(h,2));const a=cinderFieldReport(h.m,h.state);
 const saved=h.owner.serialize();h.owner.deserialize(JSON.parse(JSON.stringify(saved)));const m=h.state.missions.active.find(x=>x.id===h.m.id);assert.ok(m);assert.deepEqual(cinderFieldReport(m,h.state),a);
});
test('unaccepted, ambiguous, malformed and wrong-mode jobs cannot acquire a field report action',()=>{
 const h=fixture();h.state.missions.active=[];assert.equal(cinderJournalAction(h.state),null);h.state.missions.active=[h.m,h.m];assert.equal(cinderJournalAction(h.state),null);h.state.missions.active=[h.m];h.state.run.kind='swarm';assert.equal(cinderJournalAction(h.state),null);h.state.run.kind='adventure';h.m.params.cinderTargetOwnerId='';assert.equal(cinderJournalAction(h.state),null);
});


test('ordinary mounted recommendation paints the field report for tracked and untracked Cinder',()=>{
 for(const tracked of [true,false]){const h=fixture();h.aftermath._retireDestroyedMarker(h.aftermath._markerById(otherHull(h,1).data.markerId),otherHull(h,1).id);consume(h,otherHull(h,2));
  h.state.ui.trackedMissionId=tracked?h.m.id:null;const screen={_recommendEl:{innerHTML:''}};
  missionLogScreen._renderRecommendations.call(screen,h.state,h.state.missions.active,h.state.ui.trackedMissionId);
  assert.match(screen._recommendEl.innerHTML,/1 marked hull destroyed/);assert.match(screen._recommendEl.innerHTML,/last recorded hull/);assert.equal((screen._recommendEl.innerHTML.match(/data-current-action="true"/g)||[]).length,1);
  if(!tracked)assert.match(screen._recommendEl.innerHTML,/data-rec-act="track"/);
 }
});
test('rendered opening and pending evidence do not direct the pilot to a nonexistent hull',()=>{
 for(const pending of [false,true]){const h=fixture();h.state.player.tether.active=false;h.m.completedTargetSlots=pending?[0,1,2]:[];h.m.objectiveProgress=pending?3:0;h.m.params.cinderMarkedWrecks=[];
  const screen={_recommendEl:{innerHTML:''}};missionLogScreen._renderRecommendations.call(screen,h.state,[h.m],h.m.id);const text=screen._recommendEl.innerHTML;
  assert.doesNotMatch(text,/Tow the original hull|reattach the Line to the recorded hull|Keep the original hull on the Line/);
  assert.match(text,pending?/Aftermath evidence is pending/:/Clear the remaining marked Wasps/);
 }
});
test('tracking unrelated work keeps its command without stealing it for the Cinder report',()=>{
 const h=fixture(),other={id:'other',status:'active',title:'Other work',type:'cargo_delivery',params:{qty:1}};h.state.missions.active.push(other);
 const screen={_recommendEl:{innerHTML:''}};missionLogScreen._renderRecommendations.call(screen,h.state,h.state.missions.active,other.id);
 assert.doesNotMatch(screen._recommendEl.innerHTML,/lane clearances|marked hull remains|last recorded hull/);assert.equal(recommendedActions(h.state,h.state.missions.active,other.id)[0].missionId,other.id);
});

test('unresolved original proof stays protected from Compost across mission Continue, then releases once Rook settles',()=>{
 const h=fixture(),second=otherHull(h,1),sales=[],completed=[];h.bus.on('rookWreck:delivered',p=>sales.push(p));h.bus.on('mission:completed',p=>completed.push(p));
 assert.equal(h.aftermath.gardenFeedMass(h.hull),null);const saved=h.owner.serialize();h.owner.deserialize(JSON.parse(JSON.stringify(saved)));assert.equal(h.aftermath.gardenFeedMass(h.hull),null);
 h.hull.pos={...PAD};h.hull.vel={x:0,z:0};h.rook.update(1/60,h.state);assert.equal(sales.length,1);assert.equal(completed.length,1);assert.equal(completed[0].rewardCr,700);assert.equal(sales[0].payoutCr,25);assert.equal(h.aftermath.gardenFeedMass(second),second.mass);
 h.rook.update(1/60,h.state);assert.equal(sales.length,1);assert.equal(completed.length,1);
});

test('retained identities without physical evidence do not promise a recorded recovery position',()=>{
 const h=fixture();h.state.player.tether.active=false;
 for(const ref of h.m.params.cinderMarkedWrecks){const body=h.aftermath._resolveBoundWreck(ref.markerId);h.helpers.removeEntity(body.id);}
 for(const key of Object.keys(h.state.aftermathWrecks.bySector))h.state.aftermathWrecks.bySector[key]=[];
 assert.equal(cinderFieldReport(h.m,h.state).recorded,3);const focus=cinderRouteFocus(h.m,h.state);assert.equal(focus.targetEntityId,null);assert.equal(focus.label,'Cinder wreck evidence pending');
 for(const tracked of [true,false]){h.state.ui.trackedMissionId=tracked?h.m.id:null;const screen={_recommendEl:{innerHTML:''}};missionLogScreen._renderRecommendations.call(screen,h.state,[h.m],h.state.ui.trackedMissionId);
  assert.match(screen._recommendEl.innerHTML,/original marked identity is retained.*physical position is not available/);
  assert.doesNotMatch(screen._recommendEl.innerHTML,/Track follows the original|Reattach after Continue|tow it to Rook/);
 }
});
