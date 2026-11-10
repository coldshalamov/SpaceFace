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

const QUIET=rookMarketPadSpec('quietline').pos;
function approach(h){h.hull.pos={x:QUIET.x+180,z:QUIET.z};h.player.pos={x:QUIET.x+230,z:QUIET.z};h.hull.vel={x:-12,z:0};}

// Staged canonical-owner integration: the fixture creates real targets, kills and wreck
// receipts, but moves bodies for bounded intake checks. This is not an earned flight.
test('marked hull receives advance rival choice once without a sale or proof grant',()=>{const h=fixture(),lines=[];h.bus.on('comms:popup',p=>lines.push(p));approach(h);h.rook.update(1/60,h.state);const warnings=()=>lines.filter(p=>p.id.startsWith('cinder_receiving_'));assert.equal(warnings().length,1);assert.match(warnings()[0].text,/no Rook delivery slip/);assert.equal(h.hull.alive,true);assert.equal(h.m.params.cinderDeliveredMarkerId,undefined);h.rook.update(1/60,h.state);assert.equal(warnings().length,1);});
test('same real hull can be kept for Rook, or sold to Quiet without Rook proof',()=>{for(const quiet of [true,false]){const h=fixture(),sales=[];h.bus.on('rookWreck:delivered',p=>sales.push(p));approach(h);h.rook.update(1/60,h.state);h.hull.pos={...(quiet?QUIET:PAD)};h.hull.vel={x:0,z:0};h.player.pos={x:h.hull.pos.x+130,z:h.hull.pos.z};h.rook.update(1/60,h.state);assert.equal(sales.length,1);assert.equal(h.hull.alive,false);assert.equal(sales[0].source,quiet?'rook:booth:quietline':'rook:booth');assert.equal(h.m.status==='completed',!quiet);if(quiet)assert.equal(h.m.params.cinderDeliveredMarkerId,undefined);h.rook.update(1/60,h.state);assert.equal(sales.length,1);}});
test('WANTED arrival warns early and actual pad refuses without forgiving law or consuming proof',()=>{const h=fixture(),lines=[],sales=[];h.state.player.heat=0.2;h.hull.pos={x:PAD.x+220,z:PAD.z};h.player.pos={x:PAD.x+250,z:PAD.z};h.bus.on('comms:popup',p=>lines.push(p));h.bus.on('rookWreck:delivered',p=>sales.push(p));h.rook.update(1/60,h.state);assert.match(lines.find(p=>p.id.endsWith('_wanted')).text,/pad stays dark.*same hull back/);assert.match(cinderRouteFocus(h.m,h.state).reason,/ROOK REFUSES WHILE WANTED/);h.hull.pos={...PAD};h.hull.vel={x:0,z:0};h.rook.update(1/60,h.state);assert.equal(sales.length,0);assert.equal(h.hull.alive,true);assert.equal(h.state.player.heat,0.2);});
test('wrong owner, released line, stale generation, unrelated marker and hidden/mode contexts cannot announce',()=>{for(const mutate of [h=>h.a.ownerId=999,h=>h.state.player.tether.active=false,h=>h.a.targetGeneration=-1,h=>h.hull.data.provenance.markerId='wrong',h=>h.state.ui.docked=true,h=>h.state.world.currentSectorId='sector_ceres_belt',h=>h.state.save={restoring:true},h=>h.state.run.kind='swarm']){const h=fixture(),lines=[];h.bus.on('comms:popup',p=>lines.push(p));approach(h);mutate(h);h.rook.update(1/60,h.state);assert.equal(lines.filter(p=>p.id.startsWith('cinder_receiving_')).length,0);}});
test('actual story serialization retains receiving voice memory on owner reinit',async()=>{const{save}=await import('../src/save/saveSystem.js');const h=fixture();approach(h);h.rook.update(1/60,h.state);const flags=save._serializeMissions.call({state:h.state}).story.flags;const g=fixture(),lines=[];g.state.story.flags=structuredClone(flags);g.bus.on('comms:popup',p=>lines.push(p));approach(g);g.rook.init({state:g.state,bus:g.bus,helpers:g.helpers});g.rook.update(1/60,g.state);assert.equal(lines.filter(p=>p.id.startsWith('cinder_receiving_')).length,0);});
test('Quiet ring is visibly sized by its owner radius, nonphysical and cannot itself be towed',()=>{const s=rookMarketPadSpec('quietline');assert.equal(s.physicsBody,false);assert.equal(s.data.circuitMark,true);assert.equal(s.data.ringRadius,70);assert.equal(s.data.visualRadius,70);assert.equal(s.data.tetherable,false);assert.equal(s.data.masslineTetherable,false);});

// Staged native Rapier acceptance of the authored ring; not a campaign start or earned hull.
test('native pilot crosses open Quiet ring; real market buys a native wreck once',{timeout:120000},async()=>{
 const{bootRealPath,writeRealPathInput}=await import('../scripts/lib/bench/realPath.mjs');const{economy}=await import('../src/systems/economy.js');const h=await bootRealPath({seed:4455,systems:[economy,createRookBooth(),'flightV3','physics'],hulls:[{hullId:'ship_pelican',isPlayer:true,pos:{x:QUIET.x-120,z:QUIET.z},rot:0}]});
 try{const s=h.state;s.world.currentSectorId=SECTOR;s.mode='flight';h.bus.emit('sector:enter',{sectorId:SECTOR});let impacts=0;h.bus.on('physics:impact',p=>{if(p.aId===h.player.id||p.bId===h.player.id)impacts++;});let crossed=false;for(let i=0;i<3600;i++){const dx=QUIET.x+120-h.player.pos.x,dz=QUIET.z-h.player.pos.z,scale=Math.min(.5,20/Math.max(1,Math.hypot(dx,dz))),ax=(dx*scale-h.player.vel.x)*.12,az=(dz*scale-h.player.vel.z)*.12,c=Math.cos(h.player.rot),sn=Math.sin(h.player.rot);writeRealPathInput(s,{moveZ:ax*c+az*sn,moveX:-ax*sn+az*c,turnIntent:0});h.step(1);if(h.player.pos.x>QUIET.x+100){crossed=true;break;}}assert.equal(crossed,true);assert.equal(impacts,0);const marker=s.entityList.find(e=>e.alive&&e.data?.rookMarketPad==='quietline');assert.equal(marker.physicsBody,false);const sales=[];h.bus.on('rookWreck:delivered',p=>sales.push(p));const before=s.player.credits;const wreck=h.runtime.spawn({type:'wreck',pos:{...QUIET},vel:{x:0,z:0},radius:8,mass:100,hull:100,hullMax:100,physicsBody:{dynamic:true,radius:8,mass:100},data:{}});h.step(60);assert.equal(wreck.alive,false);assert.equal(sales.length,1);assert.equal(sales[0].source,'rook:booth:quietline');assert.ok(s.player.credits>before);const credits=s.player.credits;h.step(60);assert.equal(s.player.credits,credits);assert.equal(sales.length,1);assert.equal(h.proof().backend,'rapier-dynamic');console.log('CINDER_QUIET_NATIVE',JSON.stringify({time:s.simTime,impacts,payout:credits-before}));
 }finally{h.dispose();}
});
