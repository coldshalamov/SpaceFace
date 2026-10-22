import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { makeShipEntitySpec, fittingsFromDefaultModules, getDerivedStats } from '../src/systems/ships.js';
import { shipjack } from '../src/systems/shipjack.js';
import { admitVessel, normalizeShipjack, vesselHistory, isBlackFlagAdventure } from '../src/shipjack/model.js';
import { save } from '../src/save/saveSystem.js';
import { inspectVessel, valuationBreakdown } from '../src/shipjack/market.js';

test('unused coordinator stays lazy and excluded modes create no campaign facts',()=>{
  const state=createGameState(4242),bus=createBus(),system=Object.create(shipjack);
  system.init({state,bus,helpers:{},registry:{get:()=>null}});state.mode='flight';
  const start=performance.now();for(let i=0;i<100000;i++)system.update(1/60,state);
  const elapsed=performance.now()-start;
  assert.equal(state.player.shipjack,undefined);assert.equal(state.shipjack,undefined);
  console.log(`BLACK FLAG diagnostic idle coordinator: 100000 calls ${elapsed.toFixed(2)}ms; optional save bytes 0 (contended host, not full-frame performance).`);
  for(const kind of ['survival','lab']){state.run.kind=kind;assert.equal(isBlackFlagAdventure(state),false);assert.equal(system.command({action:'scan'}).ok,false);assert.equal(state.player.shipjack,undefined);}
  system.destroy();
});

test('vessel identity rejects a second simultaneously materialized copy and recycled generation',()=>{
  const state=createGameState(4242),a=makeEntity(makeShipEntitySpec('ship_wasp'));
  a.id=1;state.entities.set(1,a);state.entityList.push(a);
  const v=admitVessel(state,a,{origin:'fixture:route'});assert.ok(v);
  const b=makeEntity(makeShipEntitySpec('ship_wasp'));b.id=2;b.data={...a.data};state.entities.set(2,b);
  assert.equal(admitVessel(state,b),null);assert.equal(Object.keys(state.player.shipjack.vesselsById).length,1);
  a.data.shipjackGeneration='obsolete';assert.equal(admitVessel(state,a),null);
});

test('10000 incoming records and events normalize within finite budgets without importing nonfinite facts',()=>{
  const raw={version:1,vesselsById:{},yards:{},fleetOperations:{},receipts:[],retiredIds:[]};
  for(let i=0;i<10000;i++){
    raw.vesselsById[`vessel:${i}`]={defId:'ship_wasp',name:'Lost frame',generation:`g:${i}`,location:{kind:'remote',sectorId:'sector_helios_prime',pos:{x:Infinity,z:NaN}},condition:{hull:Infinity},history:Array(20).fill({at:NaN,text:'Old deed'})};
    raw.receipts.push({operationId:`op:${i}`,ok:true,at:Infinity});raw.retiredIds.push(`terminal:${i}`);
  }
  const normalized=normalizeShipjack(raw),state=createGameState(4242);
  const v=normalized.vesselsById['vessel:0'];for(let i=0;i<10000;i++)vesselHistory(state,v,'test','One bounded history event.');
  assert.equal(Object.keys(normalized.vesselsById).length,96);assert.equal(normalized.receipts.length,96);assert.equal(normalized.retiredIds.length,2048);assert.equal(v.history.length,12);
  const json=JSON.stringify(normalized);assert.ok(json.length<350000);assert.ok(!json.includes('Infinity'));
  console.log(`BLACK FLAG 10000-event import: ${json.length} JSON bytes, 96 vessels, 12 history entries per vessel, 96 receipts, 2048 terminal identities.`);
});

test('older save replacement drops later custody and transfer receipts without wiping other player fields',()=>{
  const state=createGameState(4242);state.player.shipjack={version:1,vesselsById:{later:{}}};state.player.shipControlTransfers={version:1,receipts:[]};state.shipjack=state.player.shipjack;
  const owner=Object.create(save);owner.state=state;const cargo=state.player.cargo;
  owner._restorePlayer({credits:123,ownedShips:[{defId:'ship_kestrel',fittings:[]}],activeShipIndex:0});
  assert.equal(state.player.credits,123);assert.equal(state.player.cargo,cargo);assert.equal(state.player.shipjack,undefined);assert.equal(state.player.shipControlTransfers,undefined);assert.equal(state.shipjack,undefined);
});

test('capture tools occupy real mass/power budgets and proof changes only documented recovery service value',()=>{
  const empty=getDerivedStats('ship_kestrel',[]),fit=fittingsFromDefaultModules('ship_kestrel',['mod_claw_anchor_s']);
  const tug=getDerivedStats('ship_kestrel',fit);assert.ok(tug.mass>empty.mass);assert.ok(tug.continuousDrain>empty.continuousDrain);
  const v={defId:'ship_mule',condition:{hull:.7},title:'disputed',signature:{forged:true},crewSafe:true};
  assert.equal(inspectVessel(v,{grade:1}).accepted,true);assert.equal(inspectVessel(v,{grade:3}).accepted,false);
  const before=valuationBreakdown(v,{defId:v.defId,fittings:[]});v.proofRecorded=true;const after=valuationBreakdown(v,{defId:v.defId,fittings:[]});
  assert.ok(after.returnFee>before.returnFee);assert.equal(after.intact,before.intact);assert.equal(v.title,'disputed');
});
