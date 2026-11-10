// Real fence, mission-board, law-wave and Save owners; docking/time are supplied
// fixture inputs, not player-flown docking or full production-world acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {encounterDirector} from '../src/systems/encounterDirector.js';
import {lawSecurity} from '../src/systems/lawSecurity.js';
import {spawnBudget} from '../src/systems/spawnBudget.js';
import {missions} from '../src/systems/missions.js';
import {economyContracts} from '../src/systems/economyContracts.js';
import {save} from '../src/save/saveSystem.js';
import {SECTORS} from '../src/data/sectors.js';
import {FENCES,FENCE_BY_ID,fenceRowOf,fenceTipRoll,fenceAmbushChance,fenceDealShape} from '../src/data/fences.js';
import {fenceBarContact,fenceBarReply} from '../src/ui/station/fenceContact.js';
import {WARRANT_WAVE_UNDOCK_DELAY_S} from '../src/data/warrantHunters.js';
const NYX=FENCE_BY_ID.get('fence_hesper_quill');
function boot(seed=4242){
 const storage=new Map();globalThis.localStorage={get length(){return storage.size},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 const sim=createSimulation({seed,systems:[missions,economyContracts,encounterDirector,lawSecurity,spawnBudget,save]});const {state,bus}=sim;
 state.mode='flight';state.world.currentSectorId='sector_nyx_march';state.player.heat=.8;state.player.credits=20000;state.onboarding={active:false,finished:true};
 state.playerId=sim.spawn({type:'ship',team:0,pos:{x:0,z:0},hull:200,hullMax:200,radius:8}).id;
 const lines=[],tips=[],waves=[];sim.helpers.voice={say:p=>{lines.push(p);return true;}};bus.on('law:fenceTip',p=>tips.push(p));bus.on('warrant:waveSpawned',p=>waves.push(p));
 const epoch=n=>{state.simTime=n*600+5;state.tick++;};
 const dock=f=>{state.world.currentSectorId=SECTORS.find(s=>s.stations.some(x=>x.id===f.stationId)).id;bus.emit('dock:docked',{stationId:f.stationId});};
 const reload=async()=>{const s=sim.registry.get('save');assert.equal(s.save('quick'),true);assert.equal(await s.load('latest'),true);};
 return {sim,state,bus,lines,tips,waves,epoch,dock,reload,close(){sim.dispose();delete globalThis.localStorage;}};
}
for(const seed of [4242,8008])test(`Nyx's first meeting keeps its no-sell promise at hot eligible epochs (${seed})`,()=>{
 const t=boot(seed);try{let eligible=0;for(let e=0;e<40;e++){t.epoch(e);if(fenceTipRoll(seed,NYX.id,e,0))eligible++;t.dock(NYX);t.dock(NYX);}assert.ok(eligible>0);assert.equal(t.tips.length,0);assert.equal(fenceRowOf(t.state,NYX.id).met,true);assert.equal(fenceRowOf(t.state,NYX.id).trust,0);assert.ok(t.lines.some(p=>p.text.includes(NYX.lines.first)));}finally{t.close();}
});
test('Nyx first dock does not force a hunter wave through the ordinary arrival gap',()=>{
 const t=boot();try{t.epoch(0);t.dock(NYX);assert.equal(t.sim.registry.get('lawSecurity')._warrantWaves._view().pending,null);t.bus.emit('dock:undocked',{});t.state.simTime+=WARRANT_WAVE_UNDOCK_DELAY_S+1;t.sim.step();t.sim.step();assert.equal(t.waves.length,0);}finally{t.close();}
});
test('other cold fences still sell a hot pilot once per epoch and arm the existing hunter owner',()=>{
 for(const f of FENCES.filter(f=>!f.quirk.noSetup)){const t=boot();try{let e=0;while(!fenceTipRoll(4242,f.id,e,0))e++;t.epoch(e);t.dock(f);t.dock(f);assert.equal(t.tips.length,1,f.name);assert.equal(t.tips[0].fenceId,f.id);assert.equal(t.sim.registry.get('lawSecurity')._warrantWaves._view().pending.tippedBy,f.id);t.bus.emit('dock:undocked',{});t.state.simTime+=WARRANT_WAVE_UNDOCK_DELAY_S+1;t.sim.step();t.sim.step();assert.equal(t.waves.length,1,f.name);assert.equal(t.waves[0].tippedBy,f.id);}finally{t.close();}}
});
test('Nyx protection is not immunity from ordinary wanted arrival pressure',()=>{
 const t=boot();try{for(let i=0;i<6&&!t.sim.registry.get('lawSecurity')._warrantWaves._view().pending;i++){t.state.tick++;t.dock(NYX);}const p=t.sim.registry.get('lawSecurity')._warrantWaves._view().pending;assert.ok(p);assert.equal(p.tippedBy??null,null);assert.equal(t.state.player.heat,.8);assert.equal(t.tips.length,0);}finally{t.close();}
});
test('Nyx food/medicine job, lower pay and first-contact teaching remain authored',()=>{
 const t=boot();try{t.epoch(0);t.dock(NYX);const c=fenceBarContact(NYX.stationId,t.state);assert.equal(c.name,'Hesper Quill');assert.match(c.line,/do not sell my carriers/);assert.deepEqual(fenceDealShape(NYX,0).cargoPool,['cmdty_medical','cmdty_food']);assert.equal(fenceDealShape(NYX,0).payScale,1.4);assert.equal(fenceAmbushChance(t.state,NYX.stationId,4,1),0);const board=t.state.missions.boards[NYX.stationId];const job=board.slots.find(o=>o.cause?.tag==='wanted_deniable');assert.ok(job);assert.ok(['cmdty_medical','cmdty_food'].includes(job.params.cmdtyId));assert.ok(fenceBarReply(c,'fence_work',t.state,NYX.stationId).missionOffer);assert.equal(t.state.player.credits,20000);}finally{t.close();}
});
test('Save/Continue preserves Nyx trust and epoch without creating a saved sell-out',async()=>{
 const t=boot();try{t.epoch(7);t.bus.emit('deniable:fenceEmboldened',{stationId:NYX.stationId});const before=fenceRowOf(t.state,NYX.id);assert.equal(before.trust,-1);await t.reload();assert.equal(t.state.simTime,4205);assert.deepEqual(fenceRowOf(t.state,NYX.id),before);t.dock(NYX);assert.equal(t.tips.length,0);await t.reload();t.dock(NYX);assert.equal(t.tips.length,0);assert.equal(t.state.player.heat,.8);}finally{t.close();}
});
test('other-fence last-tip memory survives Continue and still suppresses same-epoch duplicates',async()=>{
 const t=boot();const f=FENCE_BY_ID.get('fence_oriel_pask');try{let e=0;while(!fenceTipRoll(4242,f.id,e,0))e++;t.epoch(e);t.dock(f);assert.equal(t.tips.length,1);const row=fenceRowOf(t.state,f.id);await t.reload();assert.deepEqual(fenceRowOf(t.state,f.id),row);t.dock(f);assert.equal(t.tips.length,1);do{e++;}while(!fenceTipRoll(4242,f.id,e,0));t.epoch(e);t.dock(f);assert.equal(t.tips.length,2);}finally{t.close();}
});
test('Nyx does not erase a legacy sell-out memory or waive loss and forgiveness rules',async()=>{
 const t=boot();try{t.epoch(3);t.bus.emit('deniable:fenceEmboldened',{stationId:NYX.stationId});const row=t.state.encounterDirector.stats.fences.byId[NYX.id];row.lastTipEpoch=2;const before=structuredClone(row);await t.reload();assert.deepEqual(t.state.encounterDirector.stats.fences.byId[NYX.id],before);t.dock(NYX);assert.equal(fenceRowOf(t.state,NYX.id).trust,-1);assert.equal(fenceRowOf(t.state,NYX.id).lastTipEpoch,2);assert.equal(fenceRowOf(t.state,NYX.id).jobsLost,1);t.epoch(100);t.dock(NYX);assert.equal(fenceRowOf(t.state,NYX.id).trust,0);assert.equal(fenceRowOf(t.state,NYX.id).lastTipEpoch,2);assert.equal(t.tips.length,0);}finally{t.close();}
});
test('other-fence trusted and lower-heat visits retain their existing no-tip rules',()=>{
 const f=FENCE_BY_ID.get('fence_oriel_pask');for(const trusted of [false,true]){const t=boot();try{if(trusted)t.bus.emit('deniable:fenceThanked',{stationId:f.stationId});else t.state.player.heat=.5;for(let e=0;e<12;e++){t.epoch(e);t.dock(f);}assert.equal(t.tips.length,0);}finally{t.close();}}
});
