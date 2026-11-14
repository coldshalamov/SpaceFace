import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {economy} from '../src/systems/economy.js';
import {cargo,addCargo} from '../src/systems/cargo.js';
import {mining} from '../src/systems/mining.js';
import {combat} from '../src/systems/combat.js';
import {makeShipEntitySpec} from '../src/systems/ships.js';
import {beamRepairReserve,applyFundedBeamRepair} from '../src/systems/beamRepairResources.js';
import {resolveBeamVerb} from '../src/combat/industrialBeam.js';
import {save} from '../src/save/saveSystem.js';
import {CURRENT_VERSION} from '../src/save/migrations.js';
function boot(credits=0,scrap=0) {
  const sim=createSimulation({seed:91,systems:[economy,cargo,mining,combat],updateOrder:[]}),s=sim.state;
  s.mode='flight';s.run.kind='adventure';s.player.credits=credits;
  const p=sim.spawn(makeShipEntitySpec('ship_pelican',{isPlayer:true,player:s.player,team:0,pos:{x:0,z:0}}));s.playerId=p.id;
  const e=sim.spawn(makeShipEntitySpec('ship_hawser',{team:2,pos:{x:50,z:0}}));e.hull=100;e.hullMax=200;e.armorHp=0;e.armorMax=100;
  if(scrap)addCargo(s,'cmdty_scrap_metal',scrap);
  const o=sim.registry.get('mining'), receipts=[];sim.bus.on('beam:repaired',r=>receipts.push(r));
  return {sim,s,p,e,o,receipts,step(n=1){o._applyRepair(p,e,{},n/2,1);},close(){sim.dispose();}};
}
test('credit payment is exact, capped to affordability and combined actual missing HP',()=>{
 const h=boot(3);try{h.step(20);assert.equal(h.e.hull,102);assert.equal(h.e.armorHp,0);assert.equal(h.s.player.credits,0);h.step(20);assert.equal(h.e.hull,102);assert.equal(h.receipts.length,1);assert.equal(h.receipts[0].healAmount,2);}finally{h.close();}
 const g=boot(100);try{g.e.hull=199.5;g.e.armorHp=99.5;g.step(20);assert.equal(g.e.hull,200);assert.equal(g.e.armorHp,100);assert.equal(g.s.player.credits,98);assert.equal(g.receipts[0].healAmount,1);}finally{g.close();}
});
test('one unsealed scrap buys twenty combined HP, not twenty per beam frame',()=>{
 const h=boot(0,1);try{for(let i=0;i<40;i++)h.step(.5);assert.equal(h.e.hull,120);assert.equal(h.s.player.cargo.items.cmdty_scrap_metal,undefined);assert.equal(beamRepairReserve(h.s),0);h.step();assert.equal(h.e.hull,120);assert.equal(h.receipts.reduce((n,r)=>n+r.healAmount,0),20);}finally{h.close();}
});
test('mixed holdings use funded credit ticks then finite scrap; sealed scrap never funds repair',()=>{
 const h=boot(3,1);try{h.step(2);assert.equal(h.s.player.cargo.items.cmdty_scrap_metal,1);h.step(5);assert.equal(h.e.hull,107);assert.equal(beamRepairReserve(h.s),15);assert.equal(h.s.player.credits,0);}finally{h.close();}
 const g=boot(0,1);try{g.s.fixtureSealed=['cmdty_scrap_metal'];g.step(5);assert.equal(g.e.hull,100);assert.equal(g.s.player.cargo.items.cmdty_scrap_metal,1);assert.equal(beamRepairReserve(g.s),0);}finally{g.close();}
});
test('material callback observes matching debit/reserve, cannot reenter; interruption keeps unused work',()=>{
 const h=boot(0,2);try{let observed;h.sim.bus.on('cargo:changed',()=>{observed={scrap:h.s.player.cargo.items.cmdty_scrap_metal,reserve:beamRepairReserve(h.s)};h.step(10);h.s.mode='menu';});h.step(5);assert.deepEqual(observed,{scrap:1,reserve:20});assert.equal(h.e.hull,100);assert.equal(beamRepairReserve(h.s),20);h.s.mode='flight';h.step(5);assert.equal(h.e.hull,105);assert.equal(beamRepairReserve(h.s),15);}finally{h.close();}
});
test('credit callback observes paid repair and cannot reenter; unavailable owner never heals',()=>{
 const h=boot(10);try{let once=false;h.sim.bus.on('credits:changed',()=>{assert.equal(h.e.hull,102);if(!once){once=true;h.step(2);}});h.step(2);assert.equal(h.e.hull,102);assert.equal(h.s.player.credits,7);}finally{h.close();}
 const g=boot(10);try{const o={state:g.s,bus:{emit(){}},registry:g.sim.registry};assert.equal(applyFundedBeamRepair(o,g.p,g.e,null,2),0);assert.equal(g.e.hull,100);assert.equal(g.s.player.credits,10);}finally{g.close();}
});
test('actual player serializer and restore preserve unused material; old saves and malformed pools cannot inherit credit',()=>{
 const h=boot(0,1),g=boot();try{h.step(6.75);const saver=Object.assign(Object.create(save),{state:h.s});const record=JSON.parse(JSON.stringify(saver._serializePlayer()));const loader=Object.assign(Object.create(save),{state:g.s});const prepared=loader._prepareEnvelope({fmt:'spaceface-save',version:CURRENT_VERSION,data:{player:record,world:{},entities:{player:{id:1,type:'ship',alive:true,pos:{x:0,z:0},vel:{x:0,z:0},hull:100,hullMax:100,data:{defId:'ship_kestrel',fittings:[],weapons:[]}}}}});assert.equal(prepared.ok,true,prepared.reason);loader._restorePlayer(prepared.data.player);assert.equal(beamRepairReserve(g.s),13.25);g.step(3.25);assert.equal(beamRepairReserve(g.s),10);delete record.beamRepairMaterialHp;loader._restorePlayer(record);assert.equal(beamRepairReserve(g.s),0);for(const x of [NaN,Infinity,-1,21,'20',{}]){g.s.player.beamRepairMaterialHp=x;g.step();assert.equal(g.e.hull,103.25);}}finally{h.close();g.close();}
});
test('resolver accepts paid remainder without raw scrap, and respects authoritative unsealed quantity',()=>{
 const desc={type:'ship',alive:true,hull:50,hullMax:100,data:{},capabilities:{repairable:true}};
 assert.equal(resolveBeamVerb(desc,{mode:'repair',credits:0,repairReserveHp:10,cargo:{}}).ok,true);
 assert.equal(resolveBeamVerb(desc,{mode:'repair',credits:0,repairScrapUnits:0,cargo:{cmdty_scrap_metal:1}}).reason,'insufficient-resources');
});

test('native held beam stops at purchased work, retains material across released input, and never free-heals',async()=>{
 const {bootRealPath}=await import('../scripts/lib/bench/realPath.mjs');
 const h=await bootRealPath({seed:91,systems:[economy,cargo,mining,'tacticalAI','aiPorts','flightV3','physics'],hulls:[
  {hullId:'ship_pelican',isPlayer:true,pos:{x:0,z:0},rot:0},
  {hullId:'ship_hawser',team:2,pos:{x:120,z:0},rot:0}]});
 try{const s=h.state,n=h.hulls[1];s.mode='flight';s.run.kind='adventure';s.player.credits=1;s.player.miningBeam={tierId:'beam_mk1'};
 n.hull=266;n.hullMax=380;n.armorHp=n.armorMax; n.data.ai={...n.data.ai,passive:true,holdFire:true};addCargo(s,'cmdty_scrap_metal',1);
 const fire=()=>{s.input.fireGroup=2;s.input.aimAngle=Math.atan2(n.pos.z-h.player.pos.z,n.pos.x-h.player.pos.x);h.step(1);};
 let ticks=0;while(n.hull<270&&ticks++<600)fire();assert.ok(n.hull>=270);s.input.fireGroup=null;h.step(2);
 const paused={hp:n.hull,reserve:beamRepairReserve(s),credits:s.player.credits};h.step(120);assert.deepEqual({hp:n.hull,reserve:beamRepairReserve(s),credits:s.player.credits},paused);
 for(let i=0;i<600;i++)fire();assert.ok(Math.abs(n.hull-(266+20+.6))<1e-6,JSON.stringify({hp:n.hull,reserve:beamRepairReserve(s),cr:s.player.credits,scrap:s.player.cargo.items.cmdty_scrap_metal}));assert.equal(s.player.credits,0);assert.equal(s.player.cargo.items.cmdty_scrap_metal,undefined);assert.equal(beamRepairReserve(s),0);
 const end=n.hull;for(let i=0;i<120;i++)fire();assert.equal(n.hull,end);
 console.log('FUNDED_REPAIR_NATIVE',JSON.stringify({hull:n.hull,credits:s.player.credits,reserve:beamRepairReserve(s),elapsed:s.simTime}));
 }finally{h.dispose();}
});

test('material callbacks cannot spend reserve repairing a replaced life or changed pilot',()=>{
 for(const change of [h=>h.e.occupantGeneration++,h=>h.p.occupantGeneration++,h=>h.s.playerId=h.e.id,h=>h.s.save={restoring:true},h=>h.s.ui.docked=true]){
  const h=boot(0,1);try{h.sim.bus.on('cargo:changed',()=>change(h));h.step(5);assert.equal(h.e.hull,100);assert.equal(beamRepairReserve(h.s),20);assert.equal(h.s.player.cargo.items.cmdty_scrap_metal,undefined);}finally{h.close();}
 }
});
test('subsystem repairs route to actual combat kernel, cap to missing health and debit only applied work',()=>{
 const h=boot(10);try{const kernel=h.sim.registry.get('combat').kernel;kernel.repair(h.e.id,'subsystem_drive',1,'setup');
 const row=h.s.combat.entities[String(h.e.id)].subsystems.subsystem_drive;assert.ok(row);row.health=row.maxHealth-2;
 h.o._applyRepair(h.p,h.e,{componentId:'subsystem_drive'},10,1);assert.equal(row.health,row.maxHealth);assert.equal(h.s.player.credits,7);assert.equal(h.receipts.at(-1).healAmount,2);
 const before=h.s.player.credits;h.o._applyRepair(h.p,h.e,{componentId:'missing'},10,1);assert.equal(h.s.player.credits,before);
 }finally{h.close();}
});

test('actual preloaded freight stays sealed while only an extra unsealed scrap can fund work',()=>{
 const h=boot(0,2);try{h.s.missions.active=[{id:'sealed',status:'active',preloadedCargo:true,params:{cmdtyId:'cmdty_scrap_metal',qty:1}}];
 h.step(20);assert.equal(h.e.hull,120);assert.equal(h.s.player.cargo.items.cmdty_scrap_metal,1);h.step(20);assert.equal(h.e.hull,120);assert.equal(h.s.player.cargo.items.cmdty_scrap_metal,1);
 }finally{h.close();}
});

test('post-payment credit and material notices cannot attribute repair receipt to a replacement life',()=>{
 for(const material of [false,true]){const h=boot(material?0:10,material?1:0);try{
  h.sim.bus.on(material?'toast':'credits:changed',()=>{h.e.occupantGeneration++;});
  h.step(2);assert.equal(h.e.hull,102);assert.equal(h.receipts.length,0);
  assert.equal(material?beamRepairReserve(h.s):h.s.player.credits,material?18:7);
 }finally{h.close();}}
});
