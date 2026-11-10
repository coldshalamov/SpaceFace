import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation,SIM_DT} from '../src/core/sim.js';
import {occupantGenerationOf,stampOccupantGeneration} from '../src/core/entity.js';
import {planetRuntime} from '../src/systems/planetRuntime.js';
import {fields} from '../src/systems/fields.js';
import {traffic} from '../src/systems/traffic.js';
import {world} from '../src/systems/world.js';
import {npcJobsRuntime} from '../src/systems/npcJobsRuntime.js';
import {save} from '../src/save/saveSystem.js';
import {PLANET_SITE} from '../src/data/planets.js';
import {PRODUCTION_FEATURES} from '../src/runtime/runtimeProfiles.js';
import {snapshotFeatureMaps,applyFeatureConfigToMaps,restoreFeatureMaps} from '../src/data/featureFlags.js';
function fixture(t,systems=[fields,planetRuntime]){
 const prior=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);
 const sim=createSimulation({seed:424213,systems,updateOrder:[]});t.after(()=>{sim.dispose();restoreFeatureMaps(prior);});
 const state=sim.state;state.mode='flight';state.world.currentSectorId=PLANET_SITE.sectorId;
 const owner=sim.registry.get('planetRuntime');owner.update(0,state);
 return{sim,state,owner,rt:state.planet,planet:state.entities.get(state.planet.entityId),witness:state.entities.get(state.planet.witnessId)};
}
function replace(t,old,type='ship'){
 t.owner.helpers.removeEntity(old.id,{immediate:true,reason:'test_recycle'});
 return t.sim.spawn({id:old.id,type,alive:true,hull:200,hullMax:200,pos:{x:1,z:2},data:{stormshiftCollectorOn:true}});
}
test('owned planet and coasting witness retire normally with their live generation',t=>{
 const f=fixture(t);assert(f.planet&&f.witness);assert.equal(f.rt.entityGeneration,occupantGenerationOf(f.planet));assert.equal(f.rt.witnessGeneration,occupantGenerationOf(f.witness));
 f.owner._unwind('sector_exit');assert.equal(f.planet.alive,false);assert.equal(f.witness.alive,false);assert.equal(f.state.planet.active,false);assert.equal(f.sim.registry.get('fields').hasExternal(f.rt.fieldId),false);
});
test('recycled planet and witness IDs do not kill or mutate their new occupants',t=>{
 const f=fixture(t),newPlanet=replace(f,f.planet),newWitness=replace(f,f.witness,'payload');
 f.owner._unwind('save_loaded');assert.equal(newPlanet.alive,true);assert.equal(newWitness.alive,true);assert.equal(newWitness.data.stormshiftCollectorOn,true);
});
test('re-stamping the same object creates a new life that old planet ownership cannot retire',t=>{
 const f=fixture(t);stampOccupantGeneration(f.state,f.planet);stampOccupantGeneration(f.state,f.witness);f.owner._unwind('save_loaded');assert.equal(f.planet.alive,true);assert.equal(f.witness.alive,true);
});
test('an unstamped historical runtime has no entity teardown authority',t=>{
 const f=fixture(t);delete f.rt.entityGeneration;delete f.rt.witnessGeneration;f.owner._unwind('save_loaded');assert.equal(f.planet.alive,true);assert.equal(f.witness.alive,true);
});
test('stale witness harvest refuses before clearing collector flags on a reused occupant',t=>{
 const f=fixture(t),newWitness=replace(f,f.witness);newWitness.data.anvilSlingWitness=true;newWitness.data.itinerary={kind:'anvil_work',role:'collector',phase:'collect'};newWitness.vel={x:70,z:0};f.rt.ships[newWitness.id]={region:'skim',pendingShallow:0};f.owner._scratchIds.push(newWitness.id);
 let accepts=0;f.owner.registry={get(){return{acceptAnvilHarvest(){accepts++;return 1;}};}};
 f.owner._tickWorkerHarvest(SIM_DT,f.state,f.rt,PLANET_SITE);assert.equal(newWitness.data.stormshiftCollectorOn,true);assert.equal(accepts,0);assert.equal(f.rt.ships[newWitness.id].pendingShallow,0);
});
test('unregistered callbacks can publish a successor runtime without a late old reset',t=>{
 const f=fixture(t);let next;f.sim.bus.on('planet:unregistered',()=>{next={...f.state.planet,active:true,siteId:'successor'};f.state.planet=next;});
 f.owner._unwind('sector_exit');assert.equal(f.state.planet,next);assert.equal(f.state.planet.siteId,'successor');
});
test('ordinary traffic refresh pairs a replacement collector ID with its actual generation',t=>{
 const f=fixture(t,[world,npcJobsRuntime,traffic,fields,planetRuntime]);const owner=f.sim.registry.get('traffic'),old=f.witness,recordId=old.data.worldRecordId;
 const spec={type:'ship',hull:200,hullMax:200,pos:{...old.pos},vel:{x:0,z:0},data:{...old.data,itinerary:{...old.data.itinerary}}};f.owner.helpers.removeEntity(old.id,{immediate:true,reason:'test_promotion'});const current=f.sim.spawn(spec);assert.equal(current.data.worldRecordId,recordId);
 owner._stepAnvilWork(SIM_DT,f.state);assert.equal(f.state.planet.witnessId,current.id);assert.equal(f.state.planet.witnessGeneration,occupantGenerationOf(current));current.data.stormshiftCollectorOn=true;f.owner._unwind('sector_exit');assert.equal(current.alive,true,'traffic retains its durable worker');assert.equal(current.data.stormshiftCollectorOn,false);
});
test('real save/load does not retire foreign convoy or cargo that reused old site IDs',t=>{
 const prior=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);const sim=createSimulation({seed:424213,systems:[world,npcJobsRuntime,traffic,fields,planetRuntime,save]});t.after(()=>{sim.dispose();restoreFeatureMaps(prior);});const s=sim.state;s.mode='flight';const player=sim.spawn({type:'ship',team:0,hull:100,hullMax:100,pos:{x:0,z:0},radius:6,flags:{persistent:true}});s.playerId=player.id;sim.registry.get('world').enterSector(PLANET_SITE.sectorId);sim.step();const oldPlanet=s.entities.get(s.planet.entityId),oldWitness=s.entities.get(s.planet.witnessId);assert(oldPlanet&&oldWitness);
 const saver=sim.registry.get('save'),envelope=saver.serialize('planet-lifetime');assert.equal(saver.loadEnvelope(JSON.parse(JSON.stringify(envelope)),'planet-lifetime'),true);
 const foreignPlanet=s.entities.get(oldPlanet.id),foreignWitness=s.entities.get(oldWitness.id);assert(foreignPlanet&&foreignWitness);assert.notEqual(foreignPlanet,oldPlanet);assert.notEqual(foreignWitness,oldWitness);assert.notEqual(foreignPlanet.type,'planet');assert.equal(foreignPlanet.alive,true);assert.equal(foreignWitness.alive,true);assert.notEqual(occupantGenerationOf(foreignPlanet),occupantGenerationOf(oldPlanet));assert.notEqual(occupantGenerationOf(foreignWitness),occupantGenerationOf(oldWitness));
});
