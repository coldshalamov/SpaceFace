import test from 'node:test';
import assert from 'node:assert/strict';
import { BLACK_FLAG_ENCOUNTERS, BLACK_FLAG_YARDS } from '../src/data/blackFlag.js';
import { SHIPS } from '../src/data/ships.js';
import { SECTORS } from '../src/data/sectors.js';
import { MODULES } from '../src/data/modules.js';
import { WEAPONS } from '../src/data/weapons.js';
import { buildSlotList, fits } from '../src/systems/ships.js';
import { freshShipjack, queryShipjack } from '../src/shipjack/model.js';
import { createBlackFlagPrompt, shipjackPromptActions, shipjackPromptDetail } from '../src/ui/blackFlag.js';
import { registryVesselModel, vesselLocationText, yardQuotePreview } from '../src/ui/blackFlagRegistry.js';
import { quoteFleetOperation } from '../src/shipjack/fleetOperations.js';

test('authored opportunities have real local world anchors and installable canonical fittings', () => {
  const parts = new Map([...MODULES, ...WEAPONS].map(row => [row.id,row]));
  const seen = new Set();
  for (const row of BLACK_FLAG_ENCOUNTERS) {
    assert.equal(seen.has(row.id),false); seen.add(row.id);
    const sector = SECTORS.find(sector => sector.id === row.sectorId);
    assert.ok(sector, row.sectorId);
    assert.ok(sector.pois.some(poi => poi.id === row.anchorPoiId), row.anchorPoiId);
    const receiver=sector.stations.find(station => station.id === row.stationId);
    assert.ok(receiver,row.stationId);
    assert.ok(receiver.services.some(service=>['shipyard','repair','black_market'].includes(service)),`${row.name}: receiving port must actually service the hull`);
    const hull = SHIPS.find(hull => hull.id === row.defId); assert.ok(hull,row.defId);
    const slots = buildSlotList(hull); const used = new Set();
    for (const id of row.fitted) {
      const part = parts.get(id); assert.ok(part,id);
      const index = slots.findIndex((slot,i) => !used.has(i) && fits(slot,part));
      assert.notEqual(index,-1, `${row.name}: ${id} has no compatible unused socket`); used.add(index);
    }
    assert.ok(row.condition > 0 && row.condition <= 1);
  }
  for (const yard of BLACK_FLAG_YARDS) {
    const station=SECTORS.find(sector => sector.id === yard.sectorId)?.stations.find(station => station.id === yard.stationId);
    assert.ok(station);
    assert.ok(station.services.some(service=>['shipyard','repair','black_market'].includes(service)),`${yard.name}: no actual receiving service`);
  }
});

function fixture() {
  const callbacks = new Map(), emissions = [];
  const bus = {
    on(event,fn) { if (!callbacks.has(event)) callbacks.set(event,new Set()); callbacks.get(event).add(fn); return () => callbacks.get(event)?.delete(fn); },
    emit(event,payload) { emissions.push({event,payload}); for (const fn of callbacks.get(event) || []) fn(payload); },
  };
  const player = {id:1,alive:true,type:'ship',pos:{x:0,z:0},vel:{x:0,z:0},data:{defId:'ship_kestrel'}};
  const target = {id:2,alive:true,type:'ship',pos:{x:80,z:0},vel:{x:4,z:0},angVel:0.2,shield:0,data:{defId:'ship_mule',name:'Empty Seat',vesselId:'vessel:test:1',shipjackGeneration:'gen:1',shipjackUncrewed:true}};
  const state = {mode:'flight',simTime:10,playerId:1,run:{kind:'adventure'},player:{targetId:2,activeShipIndex:0,ownedShips:[],shipjack:freshShipjack()},ui:{docked:false},entities:new Map([[1,player],[2,target]])};
  state.player.shipjack.vesselsById['vessel:test:1'] = {vesselId:'vessel:test:1',defId:'ship_mule',name:'Empty Seat',revision:2,generation:'gen:1',custodian:'captain',title:'disputed',location:{kind:'field',sectorId:'sector_helios_prime',pos:{x:80,z:0}},condition:{hull:.68},signature:{},history:[{text:'Crew evacuated safely.'}]};
  const offers = new Map();
  const deck = {offerDecision(spec){offers.set(spec.id,spec);return true;},updateDecision(id,spec){if(!offers.has(id))return false;offers.set(id,spec);return true;},resolveDecision(id){return offers.delete(id);}};
  return {state,bus,emissions,offers,deck,target,callbacks};
}

test('flight choices use actual capture readiness and preserve exact occupant in emitted intent', () => {
  const f = fixture();
  const view = queryShipjack(f.state,2);
  assert.ok(view.readiness.reasons.some(reason => reason.includes('Massline')));
  const prompt = createBlackFlagPrompt(f,{deck:()=>f.deck}); prompt.open();
  const offer = f.offers.get('black-flag:acquisition'); assert.ok(offer);
  offer.onChoose('scan','touch'); offer.onChoose('scan','touch');
  const intents = f.emissions.filter(row => row.event === 'ui:shipjack');
  assert.equal(intents.length,1,'UI repeat before owner receipt must not transmit twice');
  assert.equal(intents[0].payload.targetId,2); assert.equal(intents[0].payload.generation,'gen:1');
  assert.equal(intents[0].payload.vesselId,'vessel:test:1');
  f.bus.emit('shipjack:result',{ok:false,reason:'Close within scan range.'});
  prompt.open(); f.offers.get('black-flag:acquisition').onChoose('scan','gamepad');
  assert.equal(f.emissions.filter(row => row.event==='ui:shipjack').length,2);
  prompt.dispose(); assert.equal(f.offers.size,0);
  for (const set of f.callbacks.values()) assert.equal(set.size,0,'dispose removes subscriptions');
});

test('a stale target callback and closed panel cannot steal flight input', () => {
  const f = fixture(); const prompt = createBlackFlagPrompt(f,{deck:()=>f.deck}); prompt.open();
  const old = f.offers.get('black-flag:acquisition');
  f.state.player.targetId=3; old.onChoose('scan','keyboard');
  assert.equal(f.emissions.filter(row=>row.event==='ui:shipjack').length,0);
  f.state.player.targetId=2; prompt.open();
  f.offers.get('black-flag:acquisition').onChoose('$close','gamepad');
  for(let i=0;i<16;i++)prompt.frame();
  assert.equal(f.offers.size,0,'closed stays closed until reselection or explicit open');
  f.bus.emit('game:load'); prompt.dispose();
});

test('world opportunity is acquired through the shared deck, with no stale-mode or occupant shortcut', () => {
  const f=fixture(); f.state.player.targetId=null;
  const prompt=createBlackFlagPrompt(f,{deck:()=>f.deck});
  f.bus.emit('shipjack:opportunity',{entityId:2,vesselId:'vessel:test:1',encounterId:'black_flag_empty_seat'});
  for(let i=0;i<8;i++)prompt.frame();
  const offer=f.offers.get('black-flag:opportunity'); assert.ok(offer);
  assert.match(offer.detail,/Crew got clear/);
  offer.onChoose('target'); assert.equal(f.state.player.targetId,2);
  assert.ok(f.offers.has('black-flag:acquisition'));
  f.bus.emit('game:new');f.state.run.kind='crucible';
  f.bus.emit('shipjack:opportunity',{entityId:2,vesselId:'vessel:test:1'});
  for(let i=0;i<8;i++)prompt.frame();
  assert.equal(f.offers.size,0); prompt.dispose();
});

test('Back cancels an actual vulnerable airlock crossing but ordinary dismissal is presentation only', () => {
  const f=fixture();let crossing=true;
  const prompt=createBlackFlagPrompt(f,{deck:()=>f.deck,read:(state,id)=>({...queryShipjack(state,id),transferPending:crossing})});
  prompt.open();f.offers.get('black-flag:acquisition').onChoose('$close','keyboard');
  assert.equal(f.emissions.filter(row=>row.event==='ui:shipjack' && row.payload.action==='abort').length,1);
  crossing=false;prompt.open();f.offers.get('black-flag:acquisition').onChoose('$close','gamepad');
  assert.equal(f.emissions.filter(row=>row.event==='ui:shipjack').length,1);
  prompt.dispose();
});

test('disabled acquired pilot has a public distress route with scanner reopening and stale-body protection',()=>{
  const f=fixture(),pilot=f.state.entities.get(1);
  pilot.data.shipjackGeneration='pilot:1';
  f.state.player.ownedShips=[{defId:'ship_kestrel',vesselId:'vessel:pilot'}];
  f.state.combat={entities:{1:{capabilities:{drive:false}}}};
  const prompt=createBlackFlagPrompt(f,{deck:()=>f.deck});
  for(let i=0;i<8;i++)prompt.frame();
  const offer=f.offers.get('black-flag:distress');assert.ok(offer);
  offer.onChoose('leave','touch');assert.equal(f.offers.has('black-flag:distress'),false);
  for(let i=0;i<8;i++)prompt.frame();assert.equal(f.offers.has('black-flag:distress'),false,'dismissal stays quiet');
  f.bus.emit('scanner:pulse');const retry=f.offers.get('black-flag:distress');assert.ok(retry);
  retry.onChoose('distress','gamepad');assert.equal(f.emissions.filter(row=>row.event==='ui:shipjack'&&row.payload.action==='distress').length,1);
  f.state.playerId=2;retry.onChoose('distress','keyboard');
  assert.equal(f.emissions.filter(row=>row.event==='ui:shipjack'&&row.payload.action==='distress').length,1);
  f.state.run.kind='crucible';f.bus.emit('game:new');f.bus.emit('scanner:pulse');assert.equal(f.offers.size,0);
  prompt.dispose();
});

test('handoff offers the real previous body after the mirror arrives and rejects recycled occupants', () => {
  const f=fixture();const prompt=createBlackFlagPrompt(f,{deck:()=>f.deck});
  const prior=f.state.entities.get(1);prior.data.vesselId='vessel:starter:1';prior.data.shipjackGeneration='starter:gen';
  const receipt={ok:true,fromId:1,toId:2,fromVesselId:'vessel:starter:1'};
  f.bus.emit('ship:controlTransferred',receipt);
  for(let i=0;i<8;i++)prompt.frame();
  assert.equal(f.offers.has('black-flag:prior-hull'),false,'event can arrive before player mirror');
  f.state.playerId=2;f.state.player.targetId=null;
  for(let i=0;i<8;i++)prompt.frame();
  const offer=f.offers.get('black-flag:prior-hull');assert.ok(offer);
  assert.ok(offer.choices.some(row=>row.cancel && row.label==='Keep flying'));
  offer.onChoose('target','touch');assert.equal(f.state.player.targetId,1);
  assert.equal(f.emissions.filter(row=>row.event==='ui:shipjack').length,0,'selects only; never starts a transfer');
  f.state.player.targetId=null;prior.data.shipjackGeneration='recycled';offer.onChoose('target','gamepad');
  assert.equal(f.state.player.targetId,null);
  f.bus.emit('game:load');assert.equal(f.offers.has('black-flag:prior-hull'),false);prompt.dispose();
});

test('release/abort remains a real action and every page provides safe cancel', () => {
  const view = {actions:[{action:'transfer',enabled:false,reason:'Moving too fast'},{action:'tow'},{action:'abort'}]};
  const first=shipjackPromptActions(view,0), second=shipjackPromptActions(view,1);
  assert.equal(first[0].disabled,true); assert.equal(first[0].reason,'Moving too fast');
  assert.ok(second.some(row=>row.id==='abort'));
  assert.ok(first.some(row=>row.cancel && row.id==='$close')); assert.ok(second.some(row=>row.cancel));
});

test('Adventure-only query and truthful, stable station presentation keep custody separate from title', () => {
  const f=fixture(); f.state.run.kind='crucible';
  assert.equal(queryShipjack(f.state,2).eligible,false);
  f.state.run.kind='adventure';
  const read=registryVesselModel(f.state,'vessel:test:1');
  assert.equal(read.title,'Contested title'); assert.equal(read.owned,undefined);
  assert.match(read.location,/Helios/); assert.match(read.inspection.findings.join(' '),/Title/);
  assert.match(vesselLocationText({location:{kind:'berth',stationId:'station_helios'}}),/Helios/);
  const detail=shipjackPromptDetail({titleStatus:'disputed',readiness:{relativeSpeed:12.001,dwell:1.26,reasons:['Match motion.']}});
  assert.match(detail,/12 wu\/s/); assert.match(detail,/steady 1s/); assert.doesNotMatch(detail,/12\.001/);
});

test('yard confirmation names consumed material, remaining forensic exposure and disabled output', () => {
  const spare=yardQuotePreview({action:'module_sell',defId:'mod_engine_ion_m',condition:.6,amount:420,fenceId:'fence_test'});
  assert.match(spare,/60% condition/);assert.match(spare,/420 credits after the fence cut/);assert.match(spare,/exact part leaves/);
  assert.match(yardQuotePreview({action:'forge_broadcast',amount:-900}),/Consumes one Cargo Scanner S/);
  assert.match(yardQuotePreview({action:'forge_broadcast',amount:-900}),/title checks still expose/);
  const preview=yardQuotePreview({action:'extract',slotIndex:3,amount:-280,value:{parts:[{slotIndex:3,defId:'mod_engine_ion_m',family:'engine',condition:.5}]}});
  assert.match(preview,/retaining its identity and 50% condition/); assert.match(preview,/strands this hull/);
  assert.match(yardQuotePreview({action:'return',amount:950}),/not the hull/);
});

test('remote retrieval preview uses the real finite route, fee, deadline and grounded risk quote', () => {
  const f=fixture(); f.state.ui={docked:true,dockedStationId:'station_helios'};
  const vessel=f.state.player.shipjack.vesselsById['vessel:test:1'];vessel.custodian='player';vessel.location.entityId=2;
  f.state.player.ownedShips=[{defId:'ship_kestrel'},{defId:'ship_mule',vesselId:vessel.vesselId}];
  const result=quoteFleetOperation(f.state,{vesselId:vessel.vesselId,action:'recover'});
  assert.equal(result.ok,true,result.reason);assert.ok(result.quote.arrivalAt>result.quote.pickupAt);
  const preview=yardQuotePreview(result.quote);
  assert.match(preview,/Helios Station/);assert.ok(preview.includes(String(result.quote.feeCr)));
  assert.match(preview,/25% travel/);assert.match(preview,/title and warrants remain/);
  assert.match(vesselLocationText({location:{kind:'in_transit'}}),/Recovery tug/);
});
