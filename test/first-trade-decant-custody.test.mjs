// Actual authored first-trade acceptance, service request, mission delivery, economy and Save.
// Board posting and docking/time are fixture inputs, not player flight or rendered UI proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {missions} from '../src/systems/missions.js';
import {economy} from '../src/systems/economy.js';
import {stationServices} from '../src/systems/stationServices.js';
import {save} from '../src/save/saveSystem.js';
import {buildFirstTradeOffer} from '../src/data/economyContractTemplates.js';
import {addCargo,removeCargo,sellableCargoQty} from '../src/systems/cargo.js';
const CELL='cmdty_fuel_cells';
function boot(){
 const storage=new Map();globalThis.localStorage={get length(){return storage.size},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 const sim=createSimulation({seed:4242,systems:[missions,economy,stationServices,save]});const{state,bus}=sim;state.mode='flight';state.world.currentSectorId='sector_helios_prime';state.playerId=sim.spawn({type:'ship',team:0,pos:{x:0,z:0},hull:100}).id;Object.assign(state.player.cargo,{capVolume:100,capMass:100});state.player.credits=20000;Object.assign(state.ui,{docked:true,dockedStationId:'station_helios'});state.fuel={current:0,max:100};state.onboarding={active:false,finished:true};
 const notices=[],decanted=[],completed=[];bus.on('toast',p=>notices.push(p.text));bus.on('service:decanted',p=>decanted.push(p));bus.on('mission:completed',p=>completed.push(p));const m=sim.registry.get('missions'),yard=sim.registry.get('stationServices');
 const accept=()=>{const offer=buildFirstTradeOffer(4242);state.missions.boards.station_helios={slots:[offer]};assert.equal(m.acceptMission(offer.id),true);return state.missions.active.find(x=>x.sourceOfferId===offer.id);};
 const reload=async()=>{const s=sim.registry.get('save');assert.equal(s.save('quick'),true);assert.equal(await s.load('latest'),true);Object.assign(state.ui,{docked:true,dockedStationId:'station_helios'});state.world.currentSectorId='sector_helios_prime';bus.emit('dock:docked',{stationId:'station_helios'});};
 const deliver=()=>{state.world.currentSectorId='sector_ceres_belt';state.ui.dockedStationId='station_ceres';bus.emit('dock:docked',{stationId:'station_ceres'});};
 return{sim,state,bus,m,yard,notices,decanted,completed,accept,reload,deliver,close(){sim.dispose();delete globalThis.localStorage;}};
}
test('first trade keeps all eight sealed cells and full760cr after station Decant request',()=>{
 const t=boot();try{t.accept();const credits=t.state.player.credits;assert.equal(sellableCargoQty(t.state,CELL),0);t.bus.emit('service:decantRequest',{});assert.equal(t.state.player.cargo.items[CELL],8);assert.equal(t.state.fuel.current,0);assert.equal(t.state.player.credits,credits);assert.equal(t.decanted.length,0);assert.ok(t.notices.includes('No unreserved whole fuel cells are available to decant.'));t.deliver();assert.equal(t.completed.length,1);assert.equal(t.state.player.credits,credits+760);assert.ok(!t.notices.some(s=>/Short delivery/.test(s)));}finally{t.close();}
});
test('sealed-only refusal survives repeated Save/Continue and still delivers full manifest',async()=>{
 const t=boot();try{const id=t.accept().id;await t.reload();await t.reload();assert.equal(t.state.missions.active.find(m=>m.id===id).params.sealedRemaining,8);const before=structuredClone(t.state.player.cargo);for(let i=0;i<3;i++)assert.equal(t.yard.decantFuelCells().reason,'no_free_cells');assert.deepEqual(t.state.player.cargo,before);assert.equal(t.state.fuel.current,0);await t.reload();t.deliver();assert.equal(t.completed.length,1);assert.equal(t.state.player.credits,20760);}finally{t.close();}
});
test('mixed free and sealed cells decant only the free surplus across Continue',async()=>{
 const t=boot();try{t.accept();assert.equal(addCargo(t.state,CELL,2),2);assert.equal(sellableCargoQty(t.state,CELL),2);const r=t.yard.decantFuelCells();assert.equal(r.cells,2);assert.equal(r.units,48);assert.equal(t.state.player.cargo.items[CELL],8);assert.equal(t.state.missions.active[0].params.sealedRemaining,8);await t.reload();assert.equal(t.yard.decantFuelCells().reason,'no_free_cells');t.deliver();assert.equal(t.state.player.credits,20760);}finally{t.close();}
});
for(const mode of ['legacy-counted','legacy-ambiguous','partially-delivered'])test(`existing ${mode} reservation is honored without rewriting its ledger`,()=>{
 const t=boot();try{const m=t.accept();if(mode==='legacy-counted'){delete m.params.sealAccounted;delete m.params.sealedRemaining;}if(mode==='legacy-ambiguous'){delete m.params.sealAccounted;delete m.params.sealedRemaining;delete m.params.qty;}if(mode==='partially-delivered'){m.params.sealedRemaining=5;m.params.sealedDelivered=3;}const before=structuredClone(m.params);const free=sellableCargoQty(t.state,CELL);const r=t.yard.decantFuelCells();assert.equal(r.cells,free);assert.equal(t.state.player.cargo.items[CELL],8-free);assert.deepEqual(m.params,before);}finally{t.close();}
});
test('abandoned contract releases its claim through the mission owner; newly free cells remain usable',()=>{
 const t=boot();try{const m=t.accept();addCargo(t.state,CELL,2);t.m.abandonMission(m.id);assert.equal(t.state.missions.active.some(x=>x.id===m.id),false);const before=t.state.player.cargo.items[CELL]||0;assert.equal(before,2,'mission owner removes only its eight sealed cells');const free=sellableCargoQty(t.state,CELL);const r=t.yard.decantFuelCells();assert.equal(r.cells,Math.min(free,4));assert.equal((t.state.player.cargo.items[CELL]||0),before-r.cells);}finally{t.close();}
});
test('completed contract leaves purchased surplus available for later emergency fuel',()=>{
 const t=boot();try{t.accept();addCargo(t.state,CELL,2);t.deliver();assert.equal(t.state.player.cargo.items[CELL],2);assert.equal(t.yard.decantFuelCells().cells,2);assert.equal(t.state.fuel.current,48);assert.equal(t.yard.decantFuelCells().ok,false);}finally{t.close();}
});
test('free cells retain whole-cell room,8-cell cap,no-service berth and repeated-pass behavior',()=>{
 const t=boot();try{t.state.ui.dockedStationId='station_beltout';t.state.world.currentSectorId='sector_ceres_belt';t.state.fuel.max=300;addCargo(t.state,CELL,9);assert.equal(t.yard.decantFuelCells().cells,8);assert.equal(t.yard.decantFuelCells().cells,1);assert.equal(t.state.fuel.current,216);assert.equal(t.yard.decantFuelCells().reason,'no_cells');addCargo(t.state,CELL,1);t.state.fuel.current=290;assert.equal(t.yard.decantFuelCells().reason,'tank_full');assert.equal(t.state.player.cargo.items[CELL],1);t.state.ui.docked=false;assert.equal(t.yard.decantFuelCells().reason,'not_docked');}finally{t.close();}
});
test('expired first trade removes its sealed stock, not purchased surplus, through the existing owner',async()=>{
 const t=boot();try{const m=t.accept();addCargo(t.state,CELL,2);t.state.simTime=m.deadline_s+1;t.m._expireMission(m,t.state.missions.active.indexOf(m));assert.equal(t.state.missions.active.some(x=>x.id===m.id),false);assert.equal(t.state.player.cargo.items[CELL],2);await t.reload();assert.equal(t.yard.decantFuelCells().cells,2);assert.equal(t.state.fuel.current,48);assert.equal(t.state.player.credits,20000);}finally{t.close();}
});
test('unrelated real cargo loss still uses existing short-delivery write-off and380cr policy',()=>{
 const t=boot();try{t.accept();assert.equal(removeCargo(t.state,CELL,4),4);t.deliver();assert.equal(t.completed.length,1);assert.equal(t.state.player.credits,20380);assert.ok(t.notices.some(s=>/Short delivery: 4\/8u/.test(s)));}finally{t.close();}
});
test('already-booked pump room is preserved while free cargo remains unspent',()=>{
 const t=boot();try{addCargo(t.state,CELL,3);assert.equal(t.yard.enqueuePlayerJob({type:'refuel',units:90,stationId:'station_helios'}),true);assert.equal(t.yard.decantFuelCells().reason,'tank_full');assert.equal(t.state.player.cargo.items[CELL],3);assert.equal(t.state.fuel.current,0);}finally{t.close();}
});
