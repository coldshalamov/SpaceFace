import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSimHost} from '../scripts/lib/simWorkerHost.mjs';
import {createSimCommandRing,pushLaneCommand} from '../scripts/lib/simCommandChannel.mjs';
import {spawnJettisonedCargoPod} from '../src/systems/lootShards.js';
import {MAIN_TO_SIM_BUS_EVENTS} from '../src/core/mainToSimEventSurface.js';
test('production host routes serialized quote/confirm through actual command drain and reply capture',async()=>{
 assert.ok(MAIN_TO_SIM_BUS_EVENTS.has('dock:launder'));
 const lane=createSimHost();try{
 const init=await lane.init({profile:'production',seed:15120,bridgeAll:true,scenarioContract:JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json',import.meta.url),'utf8'))});
 const {state,registry}=lane.host;const helpers=lane.host.runtime.getHelpers();
 assert.ok(registry.get('pirateDisguise'));
 registry.get('world').enterSector('sector_eunomia_gulf');
 const player=helpers.spawnEntity({type:'ship',pos:{x:0,z:0},vel:{x:0,z:0},hull:100,radius:6});state.playerId=player.id;state.mode='flight';state.player.credits=5000;state.ui.docked=true;state.ui.dockedStationId='station_eunomia';
 const pod=spawnJettisonedCargoPod(state,{pos:{x:player.pos.x+12,z:player.pos.z+8},commodityId:'cmdty_narcotics',amount:8,ownerId:'foreign-merchant'},helpers);
 let tick=0;const send=async payload=>{const ring=createSimCommandRing();pushLaneCommand(ring,{kind:'busEmit',emit:'dock:launder',payload});return lane.tick({tick:++tick,steps:0,generation:0,ackEnd:init.initRebuild?.end??0,commands:structuredClone(ring.drain())});};
 const req={stationId:'station_eunomia',contextId:'worker-case',requestId:'quote',action:'quote'};
 const reply=await send(req);const event=reply.events.find(e=>e.t==='cargo:launderQuoted');assert.ok(event,JSON.stringify(reply.events.map(e=>e.t)));const q=event.p;assert.equal(q.accepted,true);assert.equal(state.player.credits,5000);assert.ok(q.quotes.some(q=>q.podId===pod.id));
 const token=q.quotes.find(q=>q.podId===pod.id).quoteId;
 const result=await send({...req,action:'confirm',requestId:'confirm',quoteId:token});assert.equal(result.events.find(e=>e.t==='cargo:laundered').p.accepted,true);assert.equal(state.player.credits,3387);assert.equal(pod.data.laundered,true);
 const repeat=await send({...req,action:'confirm',requestId:'repeat',quoteId:token});assert.equal(repeat.events.find(e=>e.t==='cargo:laundered').p.accepted,false);assert.equal(state.player.credits,3387);
 }finally{lane.shutdown();}
});
