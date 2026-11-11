import test from 'node:test';
import assert from 'node:assert/strict';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { mountLawFineDesk } from '../src/ui/station/lawFineDesk.js';
import { fakeDom } from './helpers/fake-dom.mjs';
function fixture(credits = 1000) {
  const events = [], handlers = new Map();
  const bus = {
    on(k, f) { if (!handlers.has(k)) handlers.set(k, []); handlers.get(k).push(f); },
    off(k, f) { handlers.set(k, (handlers.get(k)||[]).filter(x=>x!==f)); },
    emit(k,p) { events.push([k,p]); for (const f of [...handlers.get(k)||[]]) f(p); },
  };
  const station = {id:'station_tethys',type:'station',alive:true,factionId:'faction_mts',pos:{x:0,z:0},data:{stationId:'station_tethys'}};
  const state = {meta:{seed:4242},simTime:40,tick:80,mode:'flight',playerId:'player',player:{heat:.2,credits,cargo:{items:{}}},world:{currentSectorId:'sector_tethys_junction'},entities:new Map([[station.id,station]]),entityList:[station],ui:{docked:true,dockedStationId:station.id}};
  const law = Object.create(lawSecurity);
  law.init({state,bus,helpers:{},registry:{get(){return null;}}});
  const document = fakeDom();
  const host = document.createElement('div'); host.ownerDocument=document;
  const desk=mountLawFineDesk(host,{state,bus});
  bus.emit('dock:docked',{stationId:station.id});
  const button=choice=>desk.el.children.find(n=>n.getAttribute('data-law-fine-choice')===choice);
  const count=name=>events.filter(([n])=>n===name).length;
  return {state,bus,law,desk,button,count};
}
test('mounted Pay reaches production law listener, charges once, and never writes heat or credits itself',()=>{
 const r=fixture(); assert.equal(r.desk.el.hidden,false);r.button('pay').click();r.button('pay').click();
 assert.equal(r.count('economy:chargeCredits'),1);assert.equal(r.count('heat:clear'),1);
 assert.equal(r.state.player.credits,1000);assert.equal(r.state.player.heat,.2);assert.equal(r.desk.el.hidden,true);
});
test('mounted Work accrues actual keepalive time only at berth and continues on return',()=>{
 const r=fixture(0);assert.equal(r.button('pay').disabled,true);r.button('work').click();r.button('work').click();
 assert.equal(r.state.lawSecurity.fineOffer.status,'working');r.law.keepalive(2);r.desk.refresh();
 assert.match(r.desk.el.children[0].textContent,/2.0 \/ 4s/);assert.equal(r.count('heat:clear'),0);
 r.state.ui.docked=false;r.law.keepalive(10);assert.equal(r.count('heat:clear'),0);
 r.state.ui.docked=true;r.law.keepalive(2);assert.equal(r.count('heat:clear'),1);assert.equal(r.count('economy:chargeCredits'),0);
 assert.equal(r.desk.el.hidden,true);
});
test('mounted Leave retains warrant, redock reoffers, stale berth click cannot answer',()=>{
 const r=fixture();r.button('leave').click();assert.equal(r.state.lawSecurity.fineOffer.status,'left');assert.equal(r.count('heat:clear'),0);
 r.bus.emit('dock:docked',{stationId:'station_tethys'});assert.equal(r.desk.el.hidden,false);
 r.state.ui.dockedStationId='station_expanse';r.button('work').click();assert.equal(r.state.lawSecurity.fineOffer.status,'offered');
 assert.equal(r.count('law:fineChoice'),1);
});
test('old control cannot settle replacement offer; mounted adapter is subscription-clean',()=>{
 const r=fixture();r.state.lawSecurity.fineOffer={...r.state.lawSecurity.fineOffer,causeId:'replacement'};
 r.button('pay').click();assert.equal(r.count('economy:chargeCredits'),0);
 r.desk.setActive(false);r.button('work').click();assert.equal(r.count('law:fineChoice'),0);
});

import { createReadModel, configureDomainMirroring, createDomainDiffer, applyDomainPathUpdate } from '../scripts/lib/simReadModel.mjs';
import { MAIN_TO_SIM_BUS_EVENTS } from '../src/core/mainToSimEventSurface.js';
import { createSimCommandRing, pushLaneCommand, applySimCommandEnvelope } from '../scripts/lib/simCommandChannel.mjs';
import { installSimCommandSink, uninstallSimCommandSink, laneBusEmit } from '../src/core/simLaneCommands.js';
test('default worker projection and production command ring carry mounted work intent and progress',()=>{
 const r=fixture(0);configureDomainMirroring({});const differ=createDomainDiffer();const model=createReadModel();
 let tick=0;
 function project(){for(const u of differ.diff(r.state,tick++).updates)applyDomainPathUpdate(model.domains,u,new Set());}
 project();
 const facade={get player(){return model.domains.get('player');},get ui(){return {docked:model.domains.get('ui.docked'),dockedStationId:model.domains.get('ui.dockedStationId')};},get lawSecurity(){return {fineOffer:model.domains.get('lawSecurity.fineOffer')};}};
 assert.deepEqual(facade.lawSecurity.fineOffer,r.state.lawSecurity.fineOffer);
 assert.notEqual(facade.lawSecurity.fineOffer,r.state.lawSecurity.fineOffer);
 const ring=createSimCommandRing();installSimCommandSink(d=>pushLaneCommand(ring,d));
 const mainBus={on(){},off(){},emit(type,payload){assert.ok(MAIN_TO_SIM_BUS_EVENTS.has(type));laneBusEmit(type,structuredClone(payload));}};
 const document=fakeDom(),host=document.createElement('div');host.ownerDocument=document;
 const desk=mountLawFineDesk(host,{state:facade,bus:mainBus});
 try {
  const work=desk.el.children.find(n=>n.getAttribute('data-law-fine-choice')==='work');
  assert.equal(desk.el.hidden,false);work.click();work.click();
  assert.equal(r.state.lawSecurity.fineOffer.status,'offered','presentation cannot mutate worker');
  const pending=ring.drain();assert.equal(pending.length,1,'duplicate click held until owner responds');
  for(const e of pending)applySimCommandEnvelope(structuredClone(e),{state:r.state,bus:r.bus});
  assert.equal(r.state.lawSecurity.fineOffer.status,'working');r.law.keepalive(2);project();desk.refresh();
  assert.match(desk.el.children[0].textContent,/2.0 \/ 4s/);
  r.state.ui.docked=false;project();desk.refresh();assert.equal(desk.el.hidden,true);r.law.keepalive(9);assert.equal(r.count('heat:clear'),0);
  r.state.ui.docked=true;r.law.keepalive(2);project();desk.refresh();assert.equal(desk.el.hidden,true);assert.equal(r.count('heat:clear'),1);
 }finally{uninstallSimCommandSink();}
});

import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';
test('real response projector releases rejected Pay and stale Work without unrelated-credit duplicate release',()=>{
 const r=fixture(1000);const document=fakeDom(),host=document.createElement('div');host.ownerDocument=document;
 const handlers=new Map(), queued=[];
 const mainBus={on(k,f){if(!handlers.has(k))handlers.set(k,[]);handlers.get(k).push(f);},off(k,f){handlers.set(k,(handlers.get(k)||[]).filter(x=>x!==f));},emit(k,p){queued.push([k,p]);}};
 function replay(type,payload){const projected=projectBridgeEvent(type,payload);assert.equal(projected.dropped,false);assert.equal(projected.lane,'sim');for(const f of handlers.get(type)||[])f(structuredClone(projected.flat));}
 // Keep separate main/worker snapshots, just as production projects before dispatching replies.
 const facade=structuredClone({ui:r.state.ui,player:r.state.player,lawSecurity:r.state.lawSecurity});
 const desk=mountLawFineDesk(host,{state:facade,bus:mainBus});
 const button=c=>desk.el.children.find(n=>n.getAttribute('data-law-fine-choice')===c);
 r.bus.on('law:fineAssessed',p=>{facade.lawSecurity=structuredClone(r.state.lawSecurity);facade.player=structuredClone(r.state.player);replay('law:fineAssessed',p);});
 r.bus.on('law:fineRefused',p=>replay('law:fineRefused',p));
 button('pay').click();assert.equal(queued.length,1);
 for(const f of handlers.get('credits:changed')||[])f({credits:1000});button('pay').click();assert.equal(queued.length,1);
 r.state.player.credits=0; // Worker balance changed before draining a stale, previously affordable click.
 const [event,payload]=queued.shift();r.bus.emit(event,payload);
 assert.equal(r.state.lawSecurity.fineOffer.status,'offered');assert.equal(button('work').disabled,false);assert.equal(button('pay').disabled,true);
 button('work').click();r.state.ui.docked=false;
 const [event2,payload2]=queued.shift();r.bus.emit(event2,payload2);
 assert.equal(button('work').disabled,false,'real not_at_berth reply releases pending');assert.equal(r.state.lawSecurity.fineOffer.status,'offered');
 let removals=0;desk.el.remove=()=>{removals++;host.children=host.children.filter(n=>n!==desk.el);};
 desk.setActive(false);assert.equal(desk.el.hidden,true);desk.setActive(true);assert.equal(desk.el.hidden,false);desk.setActive(false);desk.setActive(true);
 desk.dispose();desk.dispose();assert.equal(removals,1);assert.equal([...handlers.values()].flat().length,0);
 button('work').click();assert.equal(queued.length,0,'disposed click cannot send');
});

for (const change of ['new-price', 'live-price-no-redock', 'same-price-new-offer', 'cleared', 'nets']) {
 test(`delayed production ring rejects bound Pay after ${change} and releases pending`,()=>{
  const r=fixture(1000);const document=fakeDom(),host=document.createElement('div');host.ownerDocument=document;
  const facade=structuredClone({ui:r.state.ui,player:r.state.player,lawSecurity:r.state.lawSecurity});
  const handlers=new Map(),ring=createSimCommandRing();
  const mainBus={on(k,f){if(!handlers.has(k))handlers.set(k,[]);handlers.get(k).push(f);},off(k,f){handlers.set(k,(handlers.get(k)||[]).filter(x=>x!==f));},emit(k,p){assert.ok(MAIN_TO_SIM_BUS_EVENTS.has(k));laneBusEmit(k,structuredClone(p));}};
  const desk=mountLawFineDesk(host,{state:facade,bus:mainBus});
  const pay=desk.el.children.find(n=>n.getAttribute('data-law-fine-choice')==='pay');
  installSimCommandSink(d=>pushLaneCommand(ring,d));
  try {
   pay.click();desk.setActive(false);desk.setActive(true);pay.click();
   const queued=ring.drain();assert.equal(queued.length,1,'hide/show must not duplicate pending choice');
   assert.equal(queued[0].p.payload.expectedFine.amount,250);
   if(change==='new-price'){r.state.player.heat=.4;r.bus.emit('dock:docked',{stationId:'station_tethys'});}
   if(change==='live-price-no-redock') r.state.player.heat=.4;
   if(change==='same-price-new-offer'){
    r.bus.emit('law:fineChoice',{choice:'leave',stationId:'station_tethys'});
    r.bus.emit('dock:docked',{stationId:'station_tethys'});
    assert.notEqual(r.state.lawSecurity.fineOffer.offerSerial,queued[0].p.payload.expectedFine.offerSerial);
   }
   if(change==='cleared')r.state.player.heat=0;
   if(change==='nets')r.state.player.heat=.6;
   function replayReply(event,payload){
    facade.player=structuredClone(r.state.player);facade.lawSecurity=structuredClone(r.state.lawSecurity);
    const projected=projectBridgeEvent(event,payload);assert.equal(projected.dropped,false);
    for(const fn of handlers.get(event)||[])fn(structuredClone(projected.flat));
   }
   r.bus.on('law:fineAssessed',payload=>replayReply('law:fineAssessed',payload));
   r.bus.on('law:fineRefused',payload=>{
    facade.player=structuredClone(r.state.player);facade.lawSecurity=structuredClone(r.state.lawSecurity);
    const projected=projectBridgeEvent('law:fineRefused',payload);assert.equal(projected.dropped,false);
    for(const fn of handlers.get('law:fineRefused')||[])fn(structuredClone(projected.flat));
   });
   for(const envelope of queued)applySimCommandEnvelope(structuredClone(envelope),{state:r.state,bus:r.bus});
   assert.equal(r.count('economy:chargeCredits'),0);assert.equal(r.count('heat:clear'),0);
   assert.equal(r.count('law:fineRefused'),1);
   if(change==='cleared'||change==='nets') assert.equal(desk.el.hidden,true,'obsolete fine is not a phantom actionable bill');
   else assert.equal(pay.disabled,false,'rejection acknowledges pending answer');
   if(change==='live-price-no-redock'){
    assert.equal(r.state.lawSecurity.fineOffer.amount,350);assert.equal(pay.textContent,'Pay 350 cr');
    pay.click();for(const envelope of ring.drain())applySimCommandEnvelope(structuredClone(envelope),{state:r.state,bus:r.bus});
    assert.equal(r.count('economy:chargeCredits'),1,'only fresh reassessed click authorizes charge');
   }
  } finally {uninstallSimCommandSink();}
 });
}
