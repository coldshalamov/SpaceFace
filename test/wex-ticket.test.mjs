import test from 'node:test';
import assert from 'node:assert/strict';
import { createWexTicket, WEX_TICKET, wexTicketSpec } from '../src/systems/wexTicket.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { drainDeferredEnterMaterializers } from '../src/core/sectorEnterDefer.js';
import { signalKindForPoi } from '../src/systems/scanner.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';

function fixture() {
  const bus=createBus(), events=[];
  const state={simTime:0, tick:0, mode:'flight', run:{kind:'adventure'}, render:{},
    world:{currentSectorId:WEX_TICKET.sectorId}, entities:new Map(),entityList:[],
    story:{flags:{}},playerId:7};
  let id=10;
  const helpers={spawnEntity(spec){ const e=makeEntity({...spec,id:++id});state.entities.set(e.id,e);state.entityList.push(e);return e; },
    removeEntity(rid){ const e=state.entities.get(rid);if(e)e.alive=false; }};
  helpers.spawnEntity({type:'ship',id:7,pos:{x:0,z:0},vel:{x:0,z:0},radius:4,mass:12,hull:50,hullMax:50,isPlayer:true});
  for(const type of ['comms:popup','wexTicket:found'])bus.on(type,p=>events.push([type,p]));
  const system=createWexTicket();system.init({state,bus,helpers});
  const ticket=()=>state.entityList.filter(e=>e.alive&&e.data?.wexTicket===true);
  return {bus,state,helpers,system,events,ticket};
}

test('registered on the production init path only — the ticket is event-driven, no tick',()=>{
  assert.equal(PRODUCTION_INIT_ORDER.filter(x=>x==='wexTicket').length,1);
  assert.equal(PRODUCTION_UPDATE_ORDER.includes('wexTicket'),false);
});
test('the slip waits at the empty rack, once, only in Helios adventure',()=>{
  const f=fixture();assert.equal(f.ticket().length,1);
  const e=f.ticket()[0];
  assert.equal(e.type,'pickup');assert.equal(e.data.kind,WEX_TICKET.kind);
  const d=Math.hypot(e.pos.x-1410,e.pos.z+310); // beside poi_helios_bay7, not inside it
  assert.ok(d>8&&d<40,`ticket sits off the rack (${d.toFixed(1)} WU)`);
  f.system._sync();f.system._sync();assert.equal(f.ticket().length,1,'re-entry must not duplicate');
});
test('absent in survival, lab, and another sector',()=>{
  for(const [kind,sector] of [['survival',WEX_TICKET.sectorId],['lab',WEX_TICKET.sectorId],['adventure','sector_io_reach']]){
    const f=fixture();f.state.run.kind=kind;f.state.world.currentSectorId=sector;
    f.bus.emit('sector:enter',{});assert.equal(f.ticket().length,0,`${kind}/${sector}`);
  }
});
test('collection files the flag, the receipt, and the find event exactly once',()=>{
  const f=fixture();const e=f.ticket()[0];e.alive=false; // the magnet's full-consume kills it
  f.bus.emit('pickup:collected',{pickupId:e.id,collectorId:7,kind:WEX_TICKET.kind,amount:1,pos:{...e.pos}});
  assert.equal(f.state.story.flags.wex_ticket_found,true);
  assert.equal(f.events.filter(x=>x[0]==='wexTicket:found').length,1);
  const comms=f.events.filter(x=>x[0]==='comms:popup');assert.equal(comms.length,1);
  assert.equal(comms[0][1].sender,'HELIOS MAINTENANCE');assert.equal(comms[0][1].persist,true);
  // A duplicate/late event cannot re-file or re-fire.
  f.bus.emit('pickup:collected',{pickupId:e.id,collectorId:7,kind:WEX_TICKET.kind,amount:1});
  assert.equal(f.events.filter(x=>x[0]==='comms:popup').length,1);
});
test('NPC collection and foreign kinds are ignored',()=>{
  const f=fixture();
  f.bus.emit('pickup:collected',{pickupId:999,collectorId:42,kind:WEX_TICKET.kind,amount:1});
  f.bus.emit('pickup:collected',{pickupId:999,collectorId:7,kind:'ore',amount:5});
  assert.equal(f.state.story.flags.wex_ticket_found,undefined);
  assert.equal(f.events.length,0);
});
test('the slip is player-reserved and pingable — an NPC hull cannot eat the find',()=>{
  const spec=wexTicketSpec();
  // physics.collectPickups refuses non-player collectors outright on playerCollectOnly —
  // the only contact path that could have consumed the slip without filing the flag.
  assert.equal(spec.data.playerCollectOnly,true);
  // The scanner's kind table is module-private; signalKindForPoi runs the same hasOwn gate
  // the entity path uses. An unrecognized kind (the landed 'artifact') resolves null there.
  assert.equal(spec.data.scannerSignalKind,'archive');
  assert.equal(signalKindForPoi({scannerSignalKind:spec.data.scannerSignalKind}),'archive');
  assert.equal(signalKindForPoi({scannerSignalKind:'artifact'}),null,'unknown kinds resolve no signal');
  assert.equal(spec.homeSectorId,WEX_TICKET.sectorId);
  assert.equal(spec.data.homeSectorId,WEX_TICKET.sectorId);
});
test('a deferred sector enter materializes the slip under the cook drain',()=>{
  const f=fixture();
  f.state.render.sectorEnterCookWillRun=()=>true;
  f.state.render.deferredEnterMaterializers=[];
  f.state.world.enterSerial=3;
  f.ticket()[0].alive=false;
  f.bus.emit('sector:enter',{});
  assert.equal(f.ticket().length,0,'the emit itself spawns nothing while the cook owns materialization');
  assert.equal(f.state.render.deferredEnterMaterializers.length,1);
  drainDeferredEnterMaterializers(f.state);
  assert.equal(f.ticket().length,1,'the drain runs the provider and the slip lands');
});
test('re-init retires the old mount — one provider, one listener set, one slip',()=>{
  const f=fixture();
  assert.equal(f.helpers.sectorCookProviders.length,1);
  f.system.init({state:f.state,bus:f.bus,helpers:f.helpers});
  assert.equal(f.helpers.sectorCookProviders.length,1,'second init must not stack a provider');
  f.bus.emit('sector:enter',{});
  assert.equal(f.ticket().length,1);
  f.bus.emit('pickup:collected',{pickupId:f.ticket()[0].id,collectorId:7,kind:WEX_TICKET.kind,amount:1});
  assert.equal(f.events.filter(x=>x[0]==='wexTicket:found').length,1,'old listeners were unsubscribed');
});
test('destroy purges a queued deferred-enter entry before unmounting',()=>{
  const f=fixture();
  f.state.render.deferredEnterMaterializers=[
    {epoch:null,provider:f.system._cookProvider,clock:null,tick:null,iterator:null,done:false}];
  f.system.destroy();
  assert.equal(f.state.render.deferredEnterMaterializers.length,0);
  assert.equal(f.system._cookProvider,null);
});
test('a found flag means the rack stays empty across sector leave and save restore',()=>{
  const f=fixture();
  f.state.world.currentSectorId='sector_ceres_belt';f.bus.emit('sector:enter',{});
  assert.equal(f.ticket().length,0,'leaving Helios removes the slip');
  f.state.world.currentSectorId=WEX_TICKET.sectorId;f.bus.emit('sector:enter',{});
  assert.equal(f.ticket().length,1,'returning re-places it while unfound');
  f.state.story.flags.wex_ticket_found=true;
  f.bus.emit('save:loaded',{});assert.equal(f.ticket().length,0,'found stays found through restore');
});
test('destroy drops the slip and unmounts cleanly',()=>{
  const f=fixture();assert.equal(f.ticket().length,1);
  f.system.destroy();assert.equal(f.ticket().length,0);
  f.bus.emit('sector:enter',{});assert.equal(f.ticket().length,0,'no zombie listeners respawn it');
});
