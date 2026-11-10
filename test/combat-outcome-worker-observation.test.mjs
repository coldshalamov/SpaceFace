import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSimHost} from '../scripts/lib/simWorkerHost.mjs';
import {applyLaneInputWrites} from '../src/core/simLaneCommands.js';
import {createBus} from '../src/core/eventBus.js';
import {createAftermathChoicePrompt} from '../src/ui/aftermathChoicePrompt.js';
import {makeShipEntitySpec} from '../src/systems/ships.js';
const contract=JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json',import.meta.url),'utf8'));

test('real worker outcome retains selected victim life and death-time position after removal',async()=>{
 const host=createSimHost();
 try {
  await host.init({profile:'production',seed:10,scenarioContract:contract,bridgeAll:true});
  const {state,runtime,bus,registry}=host.host;
  const helpers=runtime.getHelpers();
  state.mode='flight';state.world.currentSectorId='sector_ceres_belt';
  const player=runtime.spawn({...makeShipEntitySpec('ship_kestrel',{pos:{x:0,z:0}}),isPlayer:true,team:0});state.playerId=player.id;
  const victim=runtime.spawn({...makeShipEntitySpec('ship_kestrel',{pos:{x:250,z:40}}),team:1,data:{ai:{hostileTeams:[0]}}});
  const life=victim.occupantGeneration,id=victim.id;
  applyLaneInputWrites(state,[{path:'player.targetId',value:id}]);
  victim.alive=false;
  bus.emit('entity:killed',{id,killerId:999,type:'ship',pos:{...victim.pos}});
  helpers.removeEntity(id,{immediate:true});
  assert.equal(state.entities.has(id),false);
  assert.equal(state.player.targetId,null);
  const result=await host.tick({tick:1,steps:0,commands:[]});
  const event=result.events.find(e=>e.t==='combat:outcome' && e.p.entityId===id);
  assert.ok(event,'production bridge forwards the actual outcome');
  assert.deepEqual(event.p.observedSelection,{entityId:id,occupantGeneration:life,pos:{x:250,z:40},playerPos:{x:0,z:0}});
  assert.equal(state.combatOutcome.byEntity[id].observedSelection,undefined,'saved combat record remains unchanged');
  const mainBus=createBus(),main={mode:'flight',world:{currentSectorId:'sector_ceres_belt'},playerId:player.id,player:{targetId:null},entities:new Map([[player.id,player]])};
  const cards=new Map(),deck={offerDecision(spec){cards.set(spec.id,spec);return true},resolveDecision(key){cards.delete(key)}};
  const prompt=createAftermathChoicePrompt({state:main,bus:mainBus,deck});
  mainBus.emit('combat:outcome',structuredClone(event.p));
  mainBus.emit('combat:aftermathChoices',{sectorId:'sector_ceres_belt',choices:[{id:'salvage',label:'Salvage'},{id:'escape',label:'Leave'}]});
  assert.ok(cards.has('aftermath:field'),'selected local incident remains actionable after the target was removed');
  prompt.destroy();
  const replacement=runtime.spawn({...makeShipEntitySpec('ship_kestrel',{pos:{x:280,z:30}}),team:1,data:{ai:{hostileTeams:[0]}}});
  applyLaneInputWrites(state,[{path:'player.targetId',value:replacement.id}]);
  replacement.occupantGeneration += 1; // the numeric slot now names another life
  replacement.alive=false;
  bus.emit('entity:killed',{id:replacement.id,killerId:999,type:'ship',pos:{...replacement.pos}});
  const later=await host.tick({tick:2,steps:0,commands:[]});
  const recycled=later.events.find(e=>e.t==='combat:outcome' && e.p.entityId===replacement.id);
  assert.ok(recycled);assert.equal(recycled.p.observedSelection,undefined,'a recycled selected id cannot impersonate the old observed hull');
 } finally {host.shutdown();}
});
