import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { pirateDisguise } from '../src/systems/pirateDisguise.js';
import { spawnJettisonedCargoPod } from '../src/systems/lootShards.js';
import { world } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';
const STATION='station_eunomia';
function boot(realWorld=false) {
 const sim=createSimulation({seed:15120,systems:realWorld?[economy,pirateDisguise,world,save]:[economy,pirateDisguise]});
 const {state,bus}=sim;state.mode='flight';state.player.credits=5000;
 if(realWorld)sim.registry.get('world').enterSector('sector_eunomia_gulf');
 else state.world.currentSectorId='sector_eunomia_gulf';
 const player=sim.spawn({type:'ship',pos:{x:0,z:0},vel:{x:0,z:0},hull:100,hullMax:100,radius:6});state.playerId=player.id;
 if(!realWorld)sim.spawn({type:'station',pos:{x:0,z:0},radius:20,data:{stationId:STATION}});
 state.ui.docked=true;state.ui.dockedStationId=STATION;
 const pod=spawnJettisonedCargoPod(state,{pos:{x:12,z:8},commodityId:'cmdty_narcotics',amount:8,unitMass:1,ownerId:'foreign-merchant',factionId:'faction_mts'},sim.helpers);
 const receipts=[];bus.on('cargo:laundered',r=>receipts.push(r));
 let seq=0;
 function request(action,extra={}) {let result;const event=action==='quote'?'cargo:launderQuoted':'cargo:laundered';const off=bus.on(event,r=>result=r);bus.emit('dock:launder',{action,stationId:STATION,contextId:'case',requestId:'r'+(++seq),...extra});off();return result;}
 return {sim,state,bus,player,pod,receipts,request,owner:sim.registry.get('pirateDisguise')};
}
function snapshot(t){return JSON.stringify({economy:t.state.economy,player:t.state.player,pod:t.pod.data});}
test('Eunomia docking/open/quote are read-only; explicit foreign-title pod confirmation pays once',()=>{
 const t=boot();try{t.bus.emit('dock:docked',{stationId:STATION});assert.equal(t.state.player.credits,5000);assert.equal(t.pod.data.laundered,undefined);const before=snapshot(t);t.bus.emit('dock:launder',{stationId:STATION});const q=t.request('quote');assert.equal(snapshot(t),before);assert.equal(q.quotes.length,1);assert.equal(q.quotes[0].cut,1613);const r=t.request('confirm',{quoteId:q.quotes[0].quoteId,cut:0,ownerId:t.player.id});assert.equal(r.accepted,true);assert.equal(t.state.player.credits,3387);assert.equal(t.pod.data.ownerId,'foreign-merchant');assert.equal(t.pod.data.legality,'legal');assert.equal(t.state.player.launderLedger.length,1);const after=snapshot(t);assert.equal(t.request('confirm',{quoteId:q.quotes[0].quoteId}).reason,'stale_quote');assert.equal(snapshot(t),after);}finally{t.sim.dispose();}
});
test('confirmation affects only its named pod, not another nearby hot pod; hold capacity irrelevant',()=>{const t=boot();try{const second=spawnJettisonedCargoPod(t.state,{pos:{x:20,z:0},commodityId:'cmdty_narcotics',amount:8,ownerId:123},t.sim.helpers);t.state.player.cargo.capVolume=0;const q=t.request('quote');assert.equal(q.quotes.length,2);t.request('confirm',{quoteId:q.quotes[0].quoteId});assert.equal(second.data.laundered,undefined);assert.equal(t.state.player.credits,3387);}finally{t.sim.dispose();}});
for(const [label,mutate,reason]of [
 ['changed fallback label',t=>t.pod.name='Different cargo','cargo_changed'],
 ['changed amount',t=>t.pod.data.amount=7,'cargo_changed'],
 ['changed commodity',t=>t.pod.data.commodityId='cmdty_classified_salvage','cargo_changed'],
 ['changed title',t=>t.pod.data.ownerId='someone-else','cargo_changed'],
 ['changed legality',t=>t.pod.data.legality='legal','cargo_changed'],
 ['changed price',t=>t.state.factions.faction_understory={rep:700},'price_changed'],
 ['out of range',t=>t.pod.pos.x=201,'out_of_range'],
 ['short credits',t=>t.state.player.credits=10,'short'],
 ['recycled pod generation',t=>t.pod.occupantGeneration++,'cargo_changed'],
 ['replaced pod same id/generation',t=>t.state.entities.set(t.pod.id,{...t.pod}),'cargo_changed'],
 ['replaced player same id/generation',t=>t.state.entities.set(t.player.id,{...t.player,occupantGeneration:t.player.occupantGeneration}),'cargo_changed'],
 ['replaced station same id/generation',t=>{const e=t.state.entityList.find(e=>e.type==='station');const copy={...e};t.state.entities.set(e.id,copy);t.state.entityList[t.state.entityList.indexOf(e)]=copy;},'station_changed'],
 ['different berth',t=>t.state.ui.dockedStationId='station_helios','not_docked'],
 ['undocked',t=>t.state.ui.docked=false,'not_docked'],
])test(label+' refuses without partial effects',()=>{const t=boot();try{const q=t.request('quote').quotes[0];mutate(t);const before=snapshot(t);const r=t.request('confirm',{quoteId:q.quoteId});assert.equal(r.reason,reason);assert.equal(snapshot(t),before);}finally{t.sim.dispose();}});
for(const event of ['dock:docked','dock:undocked','sector:exit','game:new','game:newGame','save:restoring','save:loaded'])test(event+' invalidates tokens without reusing them',()=>{const t=boot();try{const q=t.request('quote').quotes[0];t.bus.emit(event,{stationId:STATION});const q2=t.request('quote').quotes[0];assert.notEqual(q.quoteId,q2.quoteId);assert.equal(t.request('confirm',{quoteId:q.quoteId}).reason,'stale_quote');assert.equal(t.state.player.credits,5000);}finally{t.sim.dispose();}});
test('close/reopen and context mismatch cannot confirm the old quote',()=>{const t=boot();try{const q=t.request('quote').quotes[0];t.request('close');const q2=t.request('quote',{contextId:'new-context'}).quotes[0];assert.notEqual(q.quoteId,q2.quoteId);assert.equal(t.request('confirm',{quoteId:q.quoteId}).accepted,false);assert.equal(t.request('confirm',{quoteId:q2.quoteId,contextId:'wrong'}).accepted,false);assert.equal(t.state.player.credits,5000);}finally{t.sim.dispose();}});
test('real Save/Continue and repeated save preserve stamps/ledger; fresh explicit quote handles legacy owner IDs',async()=>{
 const storage=new Map();globalThis.localStorage={get length(){return storage.size},key(i){return [...storage.keys()][i]??null},getItem(k){return storage.get(k)??null},setItem(k,v){storage.set(k,String(v))},removeItem(k){storage.delete(k)}};
 const t=boot(true);try{t.pod.data.ownerId=t.player.id;const oldOwner=t.player.id;const stale=t.request('quote').quotes[0];const saver=t.sim.registry.get('save');assert.equal(saver.save('quick'),true);assert.equal(await saver.load('latest'),true);assert.notEqual(t.state.playerId,oldOwner);assert.equal(saver.save('quick'),true);assert.equal(await saver.load('latest'),true);t.state.ui.docked=true;t.state.ui.dockedStationId=STATION;assert.equal(t.request('confirm',{quoteId:stale.quoteId}).accepted,false);const pod=t.state.entityList.find(e=>e.data?.jettisonedCargo);assert.equal(pod.data.ownerId,oldOwner);const p=t.state.entities.get(t.state.playerId);Object.assign(p.pos,pod.pos);const q=t.request('quote').quotes[0];assert.ok(q);assert.equal(t.request('confirm',{quoteId:q.quoteId}).accepted,true);const ledger=JSON.stringify(t.state.player.launderLedger);assert.equal(saver.save('quick'),true);assert.equal(await saver.load('latest'),true);assert.equal(JSON.stringify(t.state.player.launderLedger),ledger);assert.equal(t.state.entityList.find(e=>e.data?.jettisonedCargo).data.laundered,true);t.sim.registry.get('world').enterSector('sector_helios_prime');t.sim.registry.get('world').enterSector('sector_eunomia_gulf');assert.equal(t.state.player.credits,3387);}finally{t.sim.dispose();delete globalThis.localStorage;}
});

test('actual core removal and recycled spawn cannot redeem the old occupant quote',()=>{const t=boot();try{const q=t.request('quote').quotes[0],id=t.pod.id,g=t.pod.occupantGeneration;t.sim.helpers.removeEntity(id,{immediate:true});const replacement=spawnJettisonedCargoPod(t.state,{pos:{x:12,z:8},commodityId:'cmdty_narcotics',amount:8,ownerId:'foreign-merchant'},t.sim.helpers);assert.equal(replacement.id,id);assert.notEqual(replacement.occupantGeneration,g);assert.equal(t.request('confirm',{quoteId:q.quoteId}).accepted,false);assert.equal(replacement.data.laundered,undefined);assert.equal(t.state.player.credits,5000);}finally{t.sim.dispose();}});
for(const unavailable of ['missing','rejected'])test(unavailable+' exact-payment owner cannot grant a free stamp',()=>{const t=boot();try{const q=t.request('quote').quotes[0];const original=t.owner._emit;t.owner._emit=function(type,p){if(type==='economy:chargeCredits'){if(unavailable==='rejected')p.result=false;return;}return original.call(this,type,p);};const before=snapshot(t);assert.equal(t.request('confirm',{quoteId:q.quoteId}).reason,'payment_unavailable');assert.equal(snapshot(t),before);}finally{t.sim.dispose();}});

test('quotes are nearest-first, capped and explicitly disclose hidden eligible pods',()=>{const t=boot();try{for(let i=0;i<34;i++)spawnJettisonedCargoPod(t.state,{pos:{x:20+i,z:0},commodityId:'cmdty_narcotics',amount:1,ownerId:'foreign'},t.sim.helpers);const q=t.request('quote');assert.equal(q.quotes.length,32);assert.equal(q.truncated,true);assert.equal(q.quotes[0].podId,t.pod.id);assert.ok(q.quotes.every((q,i,a)=>i===0||q.distance>=a[i-1].distance));assert.equal(t.state.player.credits,5000);}finally{t.sim.dispose();}});

test('computed fallback owner title is bound even when data is otherwise unchanged',()=>{const t=boot();try{delete t.pod.data.cargoIdentity;delete t.pod.data.ownerId;t.pod.ownerName='First title';const q=t.request('quote').quotes[0];assert.equal(q.ownerName,'First title');t.pod.ownerName='Different title';const before=snapshot(t);assert.equal(t.request('confirm',{quoteId:q.quoteId}).reason,'cargo_changed');assert.equal(snapshot(t),before);}finally{t.sim.dispose();}});
