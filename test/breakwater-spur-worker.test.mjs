import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {createSimHost} from '../scripts/lib/simWorkerHost.mjs';
import {createSimCommandRing,pushLaneCommand} from '../scripts/lib/simCommandChannel.mjs';
import {applyDomainPathUpdate} from '../scripts/lib/simReadModel.mjs';
import {breakwaterSiteGlobal,getBreakwaterSpurMapMarkers} from '../src/features/breakwaterSpur/readModel.js';
import {partitionUpdateSystems} from '../src/core/catchupPolicy.js';
import {resetFreshRunSystems} from '../src/core/runReset.js';

test('production worker projects bounded Breakwater view, handles actions and restores its real save',async()=>{
 const lane=createSimHost(), domains=new Map();let tick=0;
 try {
  const init=await lane.init({profile:'production',seed:4242,scenarioContract:JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json',import.meta.url)))});
  const {state,registry,runtime,bus}=lane.host; state.mode='flight';state.world.currentSectorId='sector_ceres_belt';
  const site=breakwaterSiteGlobal(),player=runtime.spawn({type:'ship',isPlayer:true,team:0,pos:{x:site.x+40,z:site.z},vel:{x:0,z:0},hull:100,hullMax:100,collides:false,physicsBody:false,data:{defId:'ship_kestrel',fittings:[],intent:{},ai:{}}});state.playerId=player.id;
  const owner=registry.get('breakwaterSpur');assert.ok(owner,'production Node registry includes owner');
  for(const queue of Object.values(partitionUpdateSystems(runtime.manifest.authoritativeUpdateOrder.map(def=>runtime.getSystem(def.name)||def))).filter(Array.isArray)) {
    const names=queue.map(s=>s.name);if(names.includes('breakwaterSpur'))assert.ok(names.indexOf('physics')<names.indexOf('breakwaterSpur'));
  }
  owner.update(1/60);
  const consoleBody=state.entityList.find(e=>e.data?.siteRole==='console'&&e.data?.siteId==='site_breakwater_spur');assert.ok(consoleBody);
  bus.emit('scan:completed',{targetId:consoleBody.id});
  const send=async(...commands)=>{const ring=createSimCommandRing();for(const cmd of commands)pushLaneCommand(ring,cmd);
    const reply=await lane.tick({tick:++tick,steps:0,ackEnd:init.initRebuild?.end??0,commands:structuredClone(ring.drain())});
    for(const update of reply.domainUpdates)applyDomainPathUpdate(domains,structuredClone(update),new Set());return reply;};
  await send();const view=domains.get('breakwaterSpurView'),offer=domains.get('breakwaterSpurOffer');
  assert.equal(view.phase,'signaled');assert.ok(offer.actions.some(a=>a.id==='course'));
  assert.equal(Object.hasOwn(view,'bodySnapshots'),false);assert.equal(domains.has('world.breakwaterSpur'),false);
  assert.equal(getBreakwaterSpurMapMarkers({world:{},breakwaterSpurView:view},'sector_ceres_belt').length,1);
  const refused=await send({kind:'busEmit',emit:'breakwaterSpur:action',payload:{actionId:'course',revision:'stale'}});
  assert.ok(refused.events?.some(e=>e.t==='breakwaterSpur:receipt'), 'stale action refusal projected');
  await send({kind:'busEmit',emit:'breakwaterSpur:action',payload:{actionId:'close',revision:offer.revision}});
  assert.equal(domains.get('breakwaterSpurOffer'),null);
  const original=state.entityList.find(e=>e.data?.cartridgeRole==='drive');assert.ok(original);original.hull=333;
  const recordId=original.data.worldRecordId;
  const save=registry.get('save'), envelope=save.serialize('breakwater-worker');
  assert.equal(save.loadEnvelope(envelope,'breakwater-worker'),true);
  await send(); assert.ok(state.world.breakwaterSpur); assert.equal(state.world.breakwaterSpur.phase,'signaled');
  assert.equal(state.entityList.filter(e=>e.alive && e.data?.worldRecordId===recordId).length,1);
  assert.equal(state.entityList.find(e=>e.alive && e.data?.worldRecordId===recordId).hull,333);
  assert.equal(resetFreshRunSystems(registry),true);await send();
  assert.equal(state.world.breakwaterSpur.phase,'dark');assert.equal(domains.get('breakwaterSpurView'),null);
  lane.shutdown();
  const reattached=createSimHost();
  try {
    const fresh=await reattached.init({profile:'production',seed:4242,scenarioContract:JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json',import.meta.url)))});
    assert.equal(reattached.host.registry.get('save').loadEnvelope(envelope,'breakwater-reattach'),true);
    const snapshot=await reattached.tick({tick:1,steps:0,ackEnd:fresh.initRebuild?.end??0,commands:[]});
    const mapped=new Map();for(const update of snapshot.domainUpdates)applyDomainPathUpdate(mapped,structuredClone(update),new Set());
    assert.equal(reattached.host.state.world.breakwaterSpur.phase,'signaled');
    assert.equal(reattached.host.state.entityList.filter(e=>e.alive && e.data?.worldRecordId===recordId).length,1);
    assert.equal(reattached.host.state.entityList.find(e=>e.alive && e.data?.worldRecordId===recordId).hull,333);
    assert.equal(mapped.get('breakwaterSpurView')?.phase,'signaled');
    assert.equal(mapped.has('world.breakwaterSpur'),false);
  } finally {reattached.shutdown();}
 } finally {lane.shutdown();}
});
