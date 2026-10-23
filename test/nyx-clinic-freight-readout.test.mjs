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
 const sim=createSimulation({seed:4242,systems:[missions,economy,economyContracts,encounterDirector,factions,lawSecurity,spawnBudget,save]}),{state,bus}=sim;state.mode='flight';state.player.heat=0;state.player.credits=20000;state.onboarding={active:false,finished:true};state.playerId=sim.spawn({type:'ship',team:0,hull:200,hullMax:200,pos:{x:0,z:0}}).id;Object.assign(state.player.cargo,{capVolume:100,capMass:100});
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

test('ordinary clean Hesper contact exposes the supply question',()=>{const t=boot();try{t.dock();assert.ok(t.contact().choices.some(c=>c.id==='clinic_freight_report'));assert.match(buildReply(t.contact().role,'clinic_freight_report',{state:t.state,bus:t.bus},NYX,t.contact()).text,/receipt/i);}finally{t.close()}});
import {clinicFreightReadout} from '../src/data/clinicFreightReadout.js';
const read=t=>clinicFreightReadout(t.state);
const reply=t=>buildReply(t.contact().role,'clinic_freight_report',{state:t.state,bus:t.bus},NYX,t.contact()).text;
function completed(t,partial=false){t.dock();const m=t.accept(t.offer());if(partial)removeCargo(t.state,m.params.cmdtyId,m.params.qty-1);t.dock(m.destStationId);return m;}
function fact(){const missionId='clinic-fixture';return{simTime:100,missions:{receipts:[{id:missionId+':completed',missionId,type:'cargo_delivery',source:'economyContract',sourceOfferId:'fenceroute_fence_hesper_quill_1',stationId:NYX,destStationId:'station_hyperion_cut',outcome:'completed',at_s:80}]},economy:{committedIntents:{['freight:mission-delivery:'+missionId]:{receipt:{receiptId:'mission-delivery:'+missionId,stationId:'station_hyperion_cut',commodityId:'cmdty_medical',qty:3,source:'mission_delivery'},result:{ok:true,qty:3}}},markets:{station_hyperion_cut:{cmdty_medical:{stock:4,baseEq:10}}}}};}
const receipt=s=>s.missions.receipts[0];
const freight=s=>s.economy.committedIntents['freight:mission-delivery:clinic-fixture'];
test('actual settlement and ordinary Hesper reply report exactly the accepted commodity and stock',()=>{const t=boot();try{const m=completed(t);t.dock();const result=read(t);assert.equal(result.status,'verified');assert.equal(result.missionId,m.id);assert.equal(result.acceptedQty,m.params.qty);assert.equal(result.stock,t.state.economy.markets[m.destStationId][m.params.cmdtyId].stock);assert.equal(reply(t),result.text);assert.match(result.text,/regular carriers|People eat|names stay/);assert.doesNotMatch(result.text,/patients|cured|recovered|emergency/i);}finally{t.close()}});
test('actual partial settlement reports one accepted unit without inventing full-delivery evidence',()=>{const t=boot();try{const m=completed(t,true);const result=read(t);assert.equal(result.status,'verified');assert.equal(result.acceptedQty,1);assert.equal(result.missionId,m.id);assert.doesNotMatch(result.text,/full|complete|shortfall|out of|\d+\s*\/\s*\d+/i);}finally{t.close()}});
test('ordinary economy stock writes change the reply without changing delivery history or paying again',()=>{const t=boot();try{const m=completed(t);t.dock();const econ=t.sim.registry.get('economy'),entry=t.state.economy.markets[m.destStationId][m.params.cmdtyId],credits=t.state.player.credits;econ.applyStockPressure(m.destStationId,m.params.cmdtyId,'buy',entry.stock);const low=read(t);assert.equal(low.inventory,'below_reference');assert.equal(low.stock,entry.stock);econ.applyStockPressure(m.destStationId,m.params.cmdtyId,'sell',entry.baseEq*2);const high=read(t);assert.equal(high.inventory,'at_reference');assert.notEqual(low.text,high.text);assert.equal(high.acceptedQty,low.acceptedQty);assert.equal(t.state.player.credits,credits);}finally{t.close()}});
test('real Save and Continue preserve the receipt-backed answer and pure reads do not mutate state',async()=>{const t=boot();try{completed(t,true);t.dock();const before=read(t);await t.reload();const after=read(t);assert.deepEqual(after,before);assert.equal(reply(t),after.text);const saved=JSON.stringify({m:t.state.missions,e:t.state.economy,f:t.state.encounterDirector.stats.fences});read(t);reply(t);assert.equal(JSON.stringify({m:t.state.missions,e:t.state.economy,f:t.state.encounterDirector.stats.fences}),saved);}finally{t.close()}});
test('all three actual trusted route legs are recognized without fabricating additional cargo',()=>{const t=boot();try{completed(t);t.next();completed(t);t.next();for(let leg=1;leg<=3;leg++){const o=t.offer(t.state.ui.dockedStationId),m=t.accept(o);assert.equal(o.cause.fenceRoute.leg,leg);t.dock(m.destStationId);const v=read(t);assert.equal(v.status,'verified');assert.equal(v.stationId,m.destStationId);assert.equal(v.acceptedQty,m.params.qty);t.state.simTime+=1;}}finally{t.close()}});
test('a newer failed real clinic run prevents an old successful answer',()=>{const t=boot();try{completed(t);t.next();const m=t.accept(t.offer());t.sim.registry.get('missions').abandonMission(m.id);assert.equal(read(t).status,'unverified');assert.doesNotMatch(read(t).text,/took \d/);}finally{t.close()}});
test('actual ten-receipt retention window ages clinic details out rather than inventing lifetime memory',()=>{const t=boot();try{completed(t);const system=t.sim.registry.get('missions');for(let i=0;i<10;i++){t.state.simTime+=1;system._recordMissionReceipt({id:'unrelated-'+i,type:'recon_scan',params:{},title:'Unrelated'},'completed',null,{});}assert.equal(t.state.missions.receipts.length,10);assert.equal(read(t).status,'unknown');assert.equal(t.row().jobsDone,1);}finally{t.close()}});
test('clean and trusted visibility stays intact; no other fence gains the question',()=>{const t=boot();try{t.dock();assert.ok(t.contact().choices.some(c=>c.id==='clinic_freight_report'));completed(t);t.dock();assert.ok(t.contact().choices.some(c=>c.id==='clinic_freight_report'));for(const f of FENCES.filter(f=>f.id!==HESPER)){assert.equal(generateContacts(f.stationId,t.state).some(c=>c.fenceId===f.id),false);t.bus.emit('deniable:fenceThanked',{stationId:f.stationId});const c=generateContacts(f.stationId,t.state).find(c=>c.fenceId===f.id);assert.ok(c);assert.equal(c.choices.some(x=>x.id==='clinic_freight_report'),false);assert.doesNotMatch(buildReply(c.role,'clinic_freight_report',{state:t.state,bus:t.bus},f.stationId,c).text,/last receipt/);}}finally{t.close()}});
test('missing current inventory does not erase a proven historical delivery',()=>{const s=fact();delete s.economy.markets;const v=clinicFreightReadout(s);assert.equal(v.status,'verified');assert.equal(v.inventory,'unknown');assert.match(v.text,/do not have a current stock count/);});
test('inventory count with missing or invalid reference does not invent a shortage',()=>{for(const bad of [undefined,0,-1,NaN,Infinity,'10']){const s=fact();s.economy.markets.station_hyperion_cut.cmdty_medical.baseEq=bad;const v=clinicFreightReadout(s);assert.equal(v.inventory,'count_only');assert.doesNotMatch(v.text,/usually|usual level/);}});
test('fractional market inventory is displayed without confusing it with accepted whole cargo',()=>{const s=fact();s.economy.markets.station_hyperion_cut.cmdty_medical.stock=4.25;assert.match(clinicFreightReadout(s).text,/4\.3 units now/);assert.equal(clinicFreightReadout(s).acceptedQty,3);});
const corruptions={
 'wrong origin':s=>receipt(s).stationId='station_sker',
 'wrong route destination':s=>receipt(s).destStationId='station_ceres',
 'wrong source':s=>receipt(s).source='encounterAftermath',
 'invalid route leg':s=>receipt(s).sourceOfferId='fenceroute_fence_hesper_quill_4',
 'invalid ordinary epoch':s=>Object.assign(receipt(s),{sourceOfferId:'eco_station_nyx_march_bad_deniable'}),
 'wrong type':s=>receipt(s).type='bounty',
 'wrong terminal identity':s=>receipt(s).id='elsewhere:completed',
 'future receipt':s=>receipt(s).at_s=101,
 'string receipt time':s=>receipt(s).at_s='80',
 'missing freight':s=>s.economy.committedIntents={},
 'wrong freight ID':s=>freight(s).receipt.receiptId='wrong',
 'wrong freight station':s=>freight(s).receipt.stationId='station_ceres',
 'wrong freight source':s=>freight(s).receipt.source='anvil_work',
 'wrong route commodity':s=>freight(s).receipt.commodityId='cmdty_food',
 'zero qty':s=>{freight(s).receipt.qty=0;freight(s).result.qty=0;},
 'fractional qty':s=>{freight(s).receipt.qty=1.2;freight(s).result.qty=1.2;},
 'string qty':s=>{freight(s).receipt.qty='3';freight(s).result.qty='3';},
 'nonfinite qty':s=>{freight(s).receipt.qty=Infinity;freight(s).result.qty=Infinity;},
 'failed acceptance':s=>freight(s).result.ok=false,
 'mismatched acceptance qty':s=>freight(s).result.qty=2,
};
for(const [name,alter] of Object.entries(corruptions))test('fail closed: '+name,()=>{const s=fact();alter(s);assert.equal(clinicFreightReadout(s).status,'unverified');});
test('newest malformed clinic receipt blocks older valid arrival',()=>{const s=fact();s.missions.receipts.push({...receipt(s),missionId:'new',id:'new:completed',at_s:90,stationId:'wrong'});assert.equal(clinicFreightReadout(s).status,'unverified');});
test('contradictory terminal receipts for the same mission fail closed even at different times',()=>{const s=fact();s.missions.receipts.push({...receipt(s),id:'clinic-fixture:failed',outcome:'failed',at_s:70});assert.equal(clinicFreightReadout(s).status,'unverified');});
test('ambiguous timestamp and duplicate receipt fail closed',()=>{for(const id of ['other','clinic-fixture']){const s=fact();s.missions.receipts.push({...receipt(s),missionId:id,id:id+':completed'});assert.equal(clinicFreightReadout(s).status,'unverified');}});
test('no provenance inference from title, unrelated faction, or orphaned committed freight',()=>{const s=fact();receipt(s).sourceOfferId='fenceroute_fence_ilsa_greve_1';receipt(s).title="Hesper clinic run: 12u medicine";assert.equal(clinicFreightReadout(s).status,'unknown');s.missions.receipts=[];assert.equal(clinicFreightReadout(s).status,'unknown');});
test('ordinary Nyx food delivery is eligible only with its own source and destination',()=>{const s=fact();receipt(s).sourceOfferId='eco_station_nyx_march_0_deniable';freight(s).receipt.commodityId='cmdty_food';assert.equal(clinicFreightReadout(s).status,'verified');receipt(s).stationId='station_sker';assert.equal(clinicFreightReadout(s).status,'unverified');});

test('over-cap malformed history cannot revive an aged-out clinic receipt',()=>{const s=fact();s.missions.receipts=[...Array.from({length:10},(_,i)=>({missionId:'other'+i})),receipt(s)];assert.equal(clinicFreightReadout(s).status,'unknown');});
test('oversized ordinary offer epoch is not accepted as provenance',()=>{const s=fact();receipt(s).sourceOfferId='eco_station_nyx_march_999999999999999999999999999_deniable';assert.equal(clinicFreightReadout(s).status,'unverified');});
