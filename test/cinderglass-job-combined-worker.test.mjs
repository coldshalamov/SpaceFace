import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSimHost} from '../scripts/lib/simWorkerHost.mjs';
import {createSimCommandRing,pushLaneCommand} from '../scripts/lib/simCommandChannel.mjs';
import {applyDomainPathUpdate} from '../scripts/lib/simReadModel.mjs';
import {breakwaterSiteGlobal} from '../src/features/breakwaterSpur/readModel.js';
import {resetFreshRunSystems} from '../src/core/runReset.js';
import {fnv1a} from '../src/save/checksum.js';

test('three registered owners share real worker action, save validation, Continue and reset',async()=>{
 const lane=createSimHost(),domains=new Map();let tick=0;
 try {
  const init=await lane.init({profile:'production',seed:4242,scenarioContract:JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json',import.meta.url)))});
  const {state,registry,runtime}=lane.host;
  for(const id of ['breakwaterSpur','counterweightCircuit','cinderglassJob'])assert.ok(registry.get(id),id);
  state.mode='flight';state.run={kind:'adventure'};state.world.currentSectorId='sector_ceres_belt';
  const site=breakwaterSiteGlobal(),player=runtime.spawn({type:'ship',isPlayer:true,team:0,pos:{x:site.x+40,z:site.z},vel:{x:0,z:0},hull:100,hullMax:100,collides:false,physicsBody:false,data:{defId:'ship_kestrel',fittings:[],intent:{},ai:{}}});state.playerId=player.id;
  const bw=registry.get('breakwaterSpur'),cw=registry.get('counterweightCircuit'),cg=registry.get('cinderglassJob');
  bw.update(1/60);cg.update(1/60,state);
  const original=state.entityList.find(e=>e.data?.cartridgeRole==='drive');assert.ok(original);original.hull=345;
  state.world.counterweightCircuit.discovered=true;state.world.counterweightCircuit.records.soft_berth={paid:true,completions:1,attempts:1};
  const send=async(...cmds)=>{const ring=createSimCommandRing();for(const c of cmds)pushLaneCommand(ring,c);
    const reply=await lane.tick({tick:++tick,steps:0,ackEnd:init.initRebuild?.end??0,commands:structuredClone(ring.drain())});
    for(const update of reply.domainUpdates)applyDomainPathUpdate(domains,structuredClone(update),new Set());return reply;};
  await send();assert.ok(domains.get('breakwaterSpurView'));assert.ok(domains.get('cinderglassJobView'),JSON.stringify({view:state.cinderglassJobView,keys:[...domains.keys()].filter(k=>String(k).includes('cinderglass'))}));
  assert.equal(domains.has('world.breakwaterSpur'),false);assert.equal(domains.has('world.cinderglassJob'),false);
  const reply=await send({kind:'busEmit',emit:'cinderglassJob:action',payload:{action:'contact',token:'wrong-life'}});
  assert.ok(reply.events.some(e=>e.t==='cinderglassJob:refused'));
  const save=registry.get('save'),envelope=save.serialize('combined');
  assert.ok(envelope.data.world.breakwaterSpur);assert.ok(envelope.data.world.counterweightCircuit);assert.ok(envelope.data.world.cinderglassJob);
  const bad=structuredClone(envelope);bad.data.world.cinderglassJob={version:99,phase:'bogus',custody:'bogus'};bad.checksum=fnv1a(JSON.stringify(bad.data));
  let destructive=0;const off=lane.host.bus.on('save:restoring',()=>destructive++);
  assert.equal(save.loadEnvelope(bad,'bad-combined'),false);assert.equal(destructive,0);off();
  const token=cg.token(),id=original.data.worldRecordId;assert.equal(save.loadEnvelope(envelope,'combined'),true);
  assert.notEqual(cg.token(),token,'Continue invalidates old action life');
  const credits=state.player.credits;const stale=await send({kind:'busEmit',emit:'cinderglassJob:action',payload:{action:'contact',token}});
  assert.ok(stale.events.some(e=>e.t==='cinderglassJob:refused'));assert.equal(state.player.credits,credits);
  assert.equal(state.world.counterweightCircuit.records.soft_berth.paid,true);
  const bodies=state.entityList.filter(e=>e.alive && e.data?.worldRecordId===id);assert.equal(bodies.length,1);assert.equal(bodies[0].hull,345);
  assert.equal(resetFreshRunSystems(registry),true);
  assert.equal(state.world.breakwaterSpur.phase,'dark');assert.equal(state.world.counterweightCircuit.discovered,false);
  assert.equal(state.world.cinderglassJob.operationId,null);
 } finally {lane.shutdown();}
});
