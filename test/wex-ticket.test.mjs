import test from 'node:test';
import assert from 'node:assert/strict';
import { createWexTicket, WEX_TICKET, wexTicketSpec } from '../src/systems/wexTicket.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';

function fixture() {
  const bus=createBus(), events=[];
  const state={simTime:0, tick:0, mode:'flight', run:{kind:'adventure'},
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
