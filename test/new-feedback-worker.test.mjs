import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSimHost} from '../scripts/lib/simWorkerHost.mjs';
import {createReadModel,applySpawnInfos,applyEntityVitals} from '../scripts/lib/simReadModel.mjs';
import {createSimCommandRing,pushLaneCommand} from '../scripts/lib/simCommandChannel.mjs';
import {resolveBeaconLampPlan} from '../src/render/beaconLampLife.js';
import {stationMarketLine} from '../src/data/stationLife.js';
import {COMMODITIES} from '../src/data/commodities.js';

test('production worker carries a deployed beacon lease and its accepted renewal to the same view', async()=>{
 const lane=createSimHost();
 try {
  const init=await lane.init({profile:'production',seed:4242,scenarioContract:JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json',import.meta.url)))});
  const {state,registry,runtime}=lane.host;state.mode='flight';state.player.credits=10000;
  const player=runtime.spawn({type:'ship',team:0,isPlayer:true,pos:{x:0,z:0},vel:{x:0,z:0},radius:8,hull:100,hullMax:100,data:{}});state.playerId=player.id;
  const owner=registry.get('beacons');assert.equal(owner.deploy(),true);
  const rec=state.beacons[0], original=state.entities.get(rec.entityId), main=createReadModel();
  let reply=await lane.tick({tick:1,steps:0,ackEnd:init.journalSequence});
  applySpawnInfos(main,reply.spawnInfos);applyEntityVitals(main,reply.entityVitals);
  const mirror=main.entities.get(original.id);assert.equal(mirror.data.expireAt,rec.expireAt);
  assert.equal(resolveBeaconLampPlan(mirror,rec.expireAt-1).mode,'warn');
  runtime.spawn({type:'ship',team:1,pos:{x:rec.x+100,z:rec.z},vel:{x:0,z:0},radius:8,hull:100,hullMax:100,data:{ai:{}}});
  state.simTime=rec.expireAt;owner.update(1/60,state);assert.ok(rec.expireAt>state.simTime);
  reply=await lane.tick({tick:2,steps:0,ackEnd:init.journalSequence});applyEntityVitals(main,reply.entityVitals);
  assert.equal(main.entities.get(original.id),mirror);assert.equal(mirror.data.expireAt,rec.expireAt);
  assert.equal(resolveBeaconLampPlan(mirror,state.simTime).mode,'working');
 } finally {lane.shutdown();}
});

test('production market RPC exposes observed points only and the PA reads their supported interval',async()=>{
 const lane=createSimHost();
 try {
  const init=await lane.init({profile:'production',seed:4242,scenarioContract:JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json',import.meta.url)))});
  const {state,registry}=lane.host;state.ui.docked=true;state.ui.dockedStationId='station_helios';
  const econ=registry.get('economy'),market=econ.ensureMarket('station_helios'),def=COMMODITIES.find(x=>x.id==='cmdty_food'),entry=market[def.id];
  state.simTime=100;econ.recordLivePriceHistory(entry,def,'station_helios',def.id,true);
  const observed=entry.history.find(p=>p.origin==='observed'&&p.t===100);assert.ok(observed);
  state.simTime=400;entry.lastMid=observed.mid+20;
  const ring=createSimCommandRing();pushLaneCommand(ring,{kind:'rpc',id:'desk',op:'marketHistory',args:{stationId:'station_helios',includeObservedComparisons:true}});
  const reply=await lane.tick({tick:1,steps:0,ackEnd:init.journalSequence,commands:structuredClone(ring.drain())});
  const ack=reply.rpcAcks.find(a=>a.id==='desk');const body=ack.result.result || ack.result;const dto=body.observedComparisons;
  assert.equal(dto.comparisons[def.id].observedAt,100);assert.equal(body.histories,undefined);
  assert.match(stationMarketLine(state,'station_helios',dto).text,/compared with 300 seconds ago/);
  entry.history=JSON.parse(JSON.stringify(entry.history));
  const ring2=createSimCommandRing();pushLaneCommand(ring2,{kind:'rpc',id:'restored',op:'marketHistory',args:{stationId:'station_helios',includeObservedComparisons:true}});
  const second=await lane.tick({tick:2,steps:0,ackEnd:init.journalSequence,commands:structuredClone(ring2.drain())});
  const restored=second.rpcAcks.find(a=>a.id==='restored').result;
  assert.equal((restored.result || restored).observedComparisons.comparisons[def.id],undefined);
 } finally {lane.shutdown();}
});
