// Actual board, bar projection, missions, economy, factions, director and Save owners.
// Docking/time and travel are fixture inputs, not native flight or rendered UI acceptance.
import test from 'node:test';import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {missions} from '../src/systems/missions.js';
import {economy} from '../src/systems/economy.js';
import {economyContracts} from '../src/systems/economyContracts.js';
import {encounterDirector} from '../src/systems/encounterDirector.js';
import {factions} from '../src/systems/factions.js';
import {lawSecurity} from '../src/systems/lawSecurity.js';
import {spawnBudget} from '../src/systems/spawnBudget.js';
import {save} from '../src/save/saveSystem.js';
import {generateContacts,buildReply} from '../src/ui/station/barContacts.js';
import {fenceRowOf,FENCES} from '../src/data/fences.js';
import {SECTORS} from '../src/data/sectors.js';
import {sellableCargoQty,removeCargo} from '../src/systems/cargo.js';
const NYX='station_nyx_march',HESPER='fence_hesper_quill';
function boot(){const storage=new Map();globalThis.localStorage={get length(){return storage.size},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 const sim=createSimulation({seed:4242,systems:[missions,economy,economyContracts,encounterDirector,factions,lawSecurity,spawnBudget,save]}),{state,bus}=sim;state.mode='flight';state.player.heat=.5;state.player.credits=20000;state.onboarding={active:false,finished:true};state.playerId=sim.spawn({type:'ship',team:0,hull:200,hullMax:200,pos:{x:0,z:0}}).id;Object.assign(state.player.cargo,{capVolume:100,capMass:100});
 const lines=[],completed=[],rewards=[];sim.helpers.voice={say:p=>{lines.push(p.text);return true;}};bus.on('mission:completed',p=>completed.push(p));bus.on('faction:repDelta',p=>{if(p.reason==='fence_route')rewards.push(p)});
 const dock=(id=NYX)=>{state.world.currentSectorId=SECTORS.find(s=>s.stations.some(st=>st.id===id)).id;Object.assign(state.ui,{docked:true,dockedStationId:id});bus.emit('dock:docked',{stationId:id});};
 const contact=()=>generateContacts(NYX,state).find(c=>c.fenceId===HESPER);
 const work=()=>{const c=contact();assert.ok(c,'Hesper is present');return buildReply(c.role,'fence_work',{state,bus},NYX,c)};
 const offer=(id=NYX)=>state.missions.boards[id]?.slots.find(o=>['wanted_deniable','fence_route'].includes(o.cause?.tag));
 const accept=o=>{assert.ok(o,'clinic offer exists');assert.equal(sim.registry.get('missions').acceptMission(o.id),true);return state.missions.active.find(m=>m.sourceOfferId===o.id);};
 const next=()=>{state.simTime=(Math.floor((state.simTime||0)/600)+1)*600+5;state.tick++;dock();};
 const reload=async()=>{const id=state.ui.dockedStationId;const s=sim.registry.get('save');assert.equal(s.save('quick'),true);assert.equal(await s.load('latest'),true);dock(id);};
 return{sim,state,bus,lines,completed,rewards,dock,contact,work,offer,accept,next,reload,row:()=>fenceRowOf(state,HESPER),close(){sim.dispose();delete globalThis.localStorage}};
}

import {stationBroadcast} from '../src/systems/stationBroadcast.js';
import {VoiceQueue} from '../src/ui/voiceArbiter.js';
const CUT='station_hyperion_cut';
function deliver(t,partial=false){t.dock();const m=t.accept(t.offer());if(partial)removeCargo(t.state,m.params.cmdtyId,m.params.qty-1);t.dock(m.destStationId);return m;}
function route(t,partial=false){deliver(t);t.next();deliver(t);t.next();const m=deliver(t,partial);assert.equal(m.destStationId,CUT);return m;}
function radio(t){t.state.mode='flight';t.state.world.currentSectorId='sector_hyperion_cut';const p=t.state.entities.get(t.state.playerId);const station=t.sim.spawn({type:'station',pos:{...p.pos},data:{stationId:CUT,stationTypeId:'refinery',factionId:'faction_dmc'}});const calls=[],b=Object.create(stationBroadcast);b.init({state:t.state,bus:t.bus,registry:t.sim.registry,helpers:{voice:{say:m=>{calls.push(m);return true}}}});t.state.simTime=(Math.floor(t.state.simTime/80)+1)*80+40;return{b,calls,station};}
test('actual wanted trusted clinic delivery reaches ordinary Cut flight radio',()=>{const t=boot();let r;try{const m=route(t,true);r=radio(t);r.b._tick();assert.match(r.calls.at(-1).text,/Cut intake: Nyx shipment accepted/);assert.match(r.calls.at(-1).text,/1 unit/);}finally{r?.b.destroy();t.close()}});
import {clinicReceivingBroadcast} from '../src/data/clinicReceivingBroadcast.js';
import {clinicFreightReadout} from '../src/data/clinicFreightReadout.js';
const project=(t,r)=>clinicReceivingBroadcast(t.state,r.station);
function ready(){const t=boot();const m=route(t,true),r=radio(t);return{t,m,r,close(){r.b.destroy();t.close()}};}
test('real market buy and sell change count, cargo and credits but not accepted shipment',()=>{const x=ready(),{t,r}=x;try{const econ=t.sim.registry.get('economy'),entry=t.state.economy.markets[CUT].cmdty_medical,before=project(t,r),stock=entry.stock,credits=t.state.player.credits;const buy=econ.execute(CUT,'cmdty_medical','buy',2);assert.equal(buy.ok,true);assert.equal(buy.qty,2);assert.equal(entry.stock,stock-2);assert.ok(t.state.player.credits<credits);assert.equal(sellableCargoQty(t.state,'cmdty_medical'),2);assert.notEqual(project(t,r).id,before.id);assert.equal(clinicFreightReadout(t.state).acceptedQty,1);const sell=econ.execute(CUT,'cmdty_medical','sell',1);assert.equal(sell.ok,true);assert.equal(entry.stock,stock-1);assert.equal(sellableCargoQty(t.state,'cmdty_medical'),1);assert.equal(clinicFreightReadout(t.state).acceptedQty,1);}finally{x.close()}});
test('Save/Continue preserves freight and current count but permanently expires pre-restore speech',async()=>{const x=ready(),{t,r}=x;try{r.b._tick();const old=r.calls.at(-1),before=clinicFreightReadout(t.state);assert.equal(old.valid(),true);await t.reload();assert.equal(old.valid(),false);assert.deepEqual(clinicFreightReadout(t.state),before);const fresh=radio(t);try{fresh.b._tick();assert.match(fresh.calls.at(-1).text,/Cut intake/);assert.equal(fresh.calls.at(-1).valid(),true);}finally{fresh.b.destroy()}}finally{x.close()}});
test('actual VoiceQueue rejects pending and retracts active after a real trade',()=>{const x=ready(),{t,r}=x;try{r.b._tick();const msg=r.calls.at(-1),q=new VoiceQueue();q.enqueue({channel:'story',text:'Mission owns the floor',ttl:1},0);q.step(0);q.enqueue(msg,0);assert.equal(t.sim.registry.get('economy').execute(CUT,'cmdty_medical','buy',1).ok,true);assert.equal(q.step(1001),null);assert.equal(q.pending.length,0);t.state.simTime+=80;r.b._tick();const next=r.calls.at(-1);q.enqueue(next,1002);assert.equal(q.step(1002)?.id,next.id);assert.equal(t.sim.registry.get('economy').execute(CUT,'cmdty_medical','buy',1).ok,true);q.step(1003);assert.equal(q.active,null);}finally{x.close()}});
for(const change of ['newGame','restore','destroy','raw fractional stock','sector','station map identity','faction','dockless','dead','station type','receipt aging','newer invalid','newer elsewhere','combat','onboarding','mode','restoring'])test('queued clinic fact rejects '+change,()=>{const x=ready(),{t,r}=x;try{const entry=t.state.economy.markets[CUT].cmdty_medical;if(change==='raw fractional stock')entry.stock=4.21;r.b._tick();const msg=r.calls.at(-1);assert.equal(msg.valid(),true);
 if(change==='newGame')t.bus.emit('game:newGame',{});
 if(change==='restore')t.bus.emit('save:restoring',{});
 if(change==='destroy')r.b.destroy();
 if(change==='raw fractional stock')entry.stock=4.22;
 if(change==='sector')t.state.world.currentSectorId='sector_ceres_belt';
 if(change==='station map identity')t.state.entities.set(r.station.id,{...r.station});
 if(change==='faction')r.station.data.factionId='faction_quiet';
 if(change==='dockless')r.station.data.dockless=true;
 if(change==='dead')r.station.alive=false;
 if(change==='station type')r.station.data.stationTypeId='mining';
 if(change==='receipt aging'){for(let i=0;i<10;i++){t.state.simTime++;t.sim.registry.get('missions')._recordMissionReceipt({id:'other'+i,type:'recon_scan',params:{}},'completed',null,{});}}
 if(change==='newer invalid'){t.state.missions.receipts.unshift({...t.state.missions.receipts[0],id:'bad:failed',missionId:'bad',outcome:'failed',at_s:t.state.simTime});}
 if(change==='newer elsewhere'){const m=t.accept(t.offer(CUT));t.state.simTime++;t.dock(m.destStationId);t.state.world.currentSectorId='sector_hyperion_cut';t.state.mode='flight';}
 if(change==='combat')t.bus.emit('combat:damage',{targetId:t.state.playerId});
 if(change==='onboarding')t.state.onboarding={active:true,finished:false};
 if(change==='mode')t.state.mode='station';
 if(change==='restoring')t.sim.registry.get('save')._restoring=true;
 assert.equal(msg.valid(),false);
 if(change==='restoring')t.sim.registry.get('save')._restoring=false;
 }finally{x.close()}});
test('unknown stock reports uncertainty; exact zero is current market fact not medical outcome',()=>{const x=ready(),{t,r}=x;try{const e=t.state.economy.markets[CUT].cmdty_medical;e.stock=0;assert.match(project(t,r).text,/Market count: 0/);assert.doesNotMatch(project(t,r).text,/again|patients|died|cured|emergency/);delete e.stock;assert.match(project(t,r).text,/Current market count unavailable/);assert.match(project(t,r).text,/1 unit/);}finally{x.close()}});
test('ordinary cadence preserves three non-clinic buckets and does not mutate history or RNG',()=>{const x=ready(),{t,r}=x;try{const receipt=JSON.stringify(t.state.missions.receipts),freight=JSON.stringify(t.state.economy.committedIntents);t.state.rng=()=>{throw Error('shared RNG')};for(let i=0;i<4;i++){r.b._tick();assert.equal(/Cut intake/.test(r.calls.at(-1).text),i===0);t.state.simTime+=20;}assert.equal(JSON.stringify(t.state.missions.receipts),receipt);assert.equal(JSON.stringify(t.state.economy.committedIntents),freight);}finally{x.close()}});
for(const gate of ['no receipt','foreign latest','malformed latest','out of range','voice busy','onboarding','combat','station mode'])test('ordinary emitter respects '+gate,()=>{const x=ready(),{t,r}=x;try{
 if(gate==='no receipt')t.state.missions.receipts=[];
 if(gate==='foreign latest'){const m=t.accept(t.offer(CUT));t.state.simTime++;t.dock(m.destStationId);t.state.world.currentSectorId='sector_hyperion_cut';t.state.mode='flight';t.state.simTime=(Math.floor(t.state.simTime/80)+1)*80+40;}
 if(gate==='malformed latest')t.state.missions.receipts[0].source='invalid';
 if(gate==='out of range')t.state.entities.get(t.state.playerId).pos.x+=1000;
 if(gate==='voice busy')r.b._ctx.registry={get:n=>n==='voiceArbiter'?{queue:{active:{}}}:t.sim.registry.get(n)};
 if(gate==='onboarding')t.state.onboarding={active:true,finished:false};
 if(gate==='combat')t.bus.emit('combat:damage',{targetId:t.state.playerId});
 if(gate==='station mode')t.state.mode='station';
 r.b._tick();assert.ok(r.calls.every(m=>!m.text.includes('Cut intake')));if(['no receipt','foreign latest','malformed latest'].includes(gate))assert.equal(r.calls.length,1);else assert.equal(r.calls.length,0);
 }finally{x.close()}});
