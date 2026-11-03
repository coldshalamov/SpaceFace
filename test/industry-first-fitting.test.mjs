import test from 'node:test';
import assert from 'node:assert/strict';
import { BLUEPRINT_BY_ID } from '../src/data/blueprints.js';
import { SECTORS } from '../src/data/sectors.js';
import { industryReadiness } from '../src/ui/station/screens/industry.js';

const station = id => SECTORS.flatMap(s=>s.stations||[]).find(s=>s.id===id);
test('the foundry can refine its ore and fabricate a starter hold upgrade',()=>{
 const state={player:{researchedNodes:[],cargo:{items:{cmdty_ore_iron:20,cmdty_silicate:20,cmdty_volatiles:20}},moduleInventory:[],ownedShips:[]}};
 const foundry=station('station_forge');
 assert.equal(industryReadiness(BLUEPRINT_BY_ID.get('bp_refine_metals'),state,foundry).state,'ready');
 assert.ok(BLUEPRINT_BY_ID.has('bp_build_cargo_net_s'),'starter-compatible build exists');
});

test('collected ore becomes a small fitting, survives Continue, and fits the Hitch', async () => {
 const {createSimulation}=await import('../src/core/sim.js');
 const {ships:shipsProto,buildSlotList,makeShipEntitySpec}=await import('../src/systems/ships.js');
 const {SHIPS}=await import('../src/data/ships.js');
 const {crafting:craftingProto}=await import('../src/systems/crafting.js');
 const {cargo}=await import('../src/systems/cargo.js');
 const {mining}=await import('../src/systems/mining.js');
 const {attemptIndustryBuild,industryOwnedFitting}=await import('../src/ui/station/screens/industry.js');
 const sim=createSimulation({seed:4242,systems:[shipsProto,cargo,mining,craftingProto]});
 const {state,bus}=sim;state.mode='flight';
 state.ui.docked=true;state.ui.dockedStationId='station_forge';
 const player=sim.spawn({...makeShipEntitySpec('ship_kestrel'),isPlayer:true});state.playerId=player.id;
 state.player.credits=0;state.player.researchedNodes=[];state.player.moduleInventory=[];
 const hitch=SHIPS.find(s=>s.id==='ship_kestrel'),slots=buildSlotList(hitch);
 state.player.ownedShips=[{defId:hitch.id,fittings:Array(slots.length).fill(null)}];state.player.activeShipIndex=0;
 const ships=sim.registry.get('ships'),craft=sim.registry.get('crafting');
 ships.recomputeEntity(player.id,state.player.ownedShips[0].fittings);
 const foundry=station('station_forge'),yard=station('station_vesta_outlying_yard');
 const stock={cmdty_ore_iron:4,cmdty_silicate:4,cmdty_volatiles:2};
 const miner=sim.registry.get('mining');
 for(const [id,qty] of Object.entries(stock)) {
   const pickup=sim.spawn({type:'pickup',pos:{...player.pos},radius:2.2,
     data:{kind:'ore',commodityId:id,amount:qty}});
   const result=miner._collectPickupViaEvent(pickup,player);
   assert.equal(result.accepted,qty);assert.equal(pickup.alive,false);
 }
 const build=id=>attemptIndustryBuild({crafting:craft,bpId:id,stationId:foundry.id});
 for(let i=0;i<2;i++) {assert.equal(industryReadiness(BLUEPRINT_BY_ID.get('bp_refine_metals'),state,foundry).state,'ready');assert.equal(build('bp_refine_metals'),true);}
 assert.equal(build('bp_refine_polymers'),true);
 const bp=BLUEPRINT_BY_ID.get('bp_build_cargo_net_s');
 assert.equal(industryReadiness(bp,state,foundry).state,'ready');
 assert.equal(industryReadiness(bp,state,yard).state,'station','refining-only outlying yard cannot assemble');
 const before=structuredClone(state.player.cargo.items);
 assert.equal(build(bp.id),true);
 assert.equal(state.player.cargo.items.cmdty_refined_metals||0,(before.cmdty_refined_metals||0)-2);
 assert.equal(state.player.cargo.items.cmdty_silicate||0,(before.cmdty_silicate||0)-2);
 assert.equal(state.player.cargo.items.cmdty_polymers||0,(before.cmdty_polymers||0)-1);
 assert.equal(state.player.credits,0);assert.equal(state.player.moduleInventory.length,0);
 craft.update(10,state);const saved=craft.serialize();craft.deserialize(structuredClone(saved));
 assert.equal(state.crafting.queues[foundry.id].elapsed,10);
 craft.update(10,state);
 const item=state.player.moduleInventory.find(m=>m.defId===bp.outputs.id);
 assert.ok(item?.instanceId);assert.equal(industryOwnedFitting(bp,state,foundry),true);
 const cargoSlot=slots.findIndex(s=>s.type==='cargo');const beforeCap=state.player.cargo.capVolume;
 bus.emit('ui:fitModule',{shipIndex:0,slotIndex:cargoSlot,instanceId:item.instanceId});
 assert.equal(state.player.ownedShips[0].fittings[cargoSlot],bp.outputs.id);
 assert.equal(state.player.moduleInventory.some(m=>m.instanceId===item.instanceId),false);
 assert.equal(state.player.cargo.capVolume,beforeCap+20);
 assert.equal(industryOwnedFitting(bp,state,foundry),false);
 assert.equal(build(bp.id),false,'spent stock cannot fund another run');
 sim.dispose();
});
