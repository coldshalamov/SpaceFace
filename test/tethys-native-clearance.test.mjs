// Qualification probe: real native physics, authored cast, no actor pose writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { traffic } from '../src/systems/traffic.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { SECTORS } from '../src/data/sectors.js';
import { SECTOR_ANCHORS } from '../src/data/sectorAnchors.js';
import { TETHYS_ACTIVITY_SECTOR_ID as TETHYS } from '../src/data/sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';

test('native Tethys physical clearance observation', async () => {
  const modules = { physics, flightSlot: flightV3, aiSlot: createTacticalAISystem(), aiPorts, traffic, npcJobsRuntime, spawnBudget };
  const sim = createSimulation({seed:4242,
    systems:PRODUCTION_INIT_ORDER.filter(k=>modules[k]).map(k=>modules[k]),
    updateOrder:PRODUCTION_UPDATE_ORDER.filter(k=>modules[k]).map(k=>modules[k])});
  const {state,bus}=sim;state.mode='flight';state.world.currentSectorId=TETHYS;
  const player=sim.spawn({type:'ship',team:0,pos:sectorLocalToGlobalForSector({x:0,z:-3000},TETHYS),radius:6,mass:100,hull:200,hullMax:200});
  state.playerId=player.id;state.onboarding={active:false,finished:true};
  for(const station of SECTOR_ANCHORS[TETHYS].stations)sim.spawn({type:'station',team:2,
    pos:sectorLocalToGlobalForSector(station.pos,TETHYS),radius:42,mass:1e6,data:{stationId:station.id}});
  await sim.registry.get('physics').prepareBackend(state);
  const owner=sim.registry.get('traffic');
  const observed=[];
  console.log('TETHYS_SYSTEMS '+JSON.stringify({init:PRODUCTION_INIT_ORDER.filter(k=>modules[k]),update:PRODUCTION_UPDATE_ORDER.filter(k=>modules[k])}));
  bus.on('entity:spawned',({entity:e})=>{
    const spec=e;
    if(e&&(spec.data?.tethysHandoff||spec.data?.tethysJettison)){
      const actors=state.entityList.filter(a=>a.alive!==false&&['tethys_quiet_runner','tethys_quiet_keeper'].includes(a.data?.activityActorSlotId));
      observed.push({phase:spec.data.tethysHandoff?'handoff':'jettison',time:state.simTime,pod:{id:e.id,pos:{...e.pos},vel:{...e.vel},rot:e.rot,radius:e.radius,data:{...e.data}},actors:actors.map(a=>({id:a.id,slot:a.data.activityActorSlotId,pos:{...a.pos},vel:{...a.vel},rot:a.rot,radius:a.radius,defId:a.data.defId,collisionProxy:a.data.collisionProxy,role:a.data.trafficRole,worldRecordId:a.data.worldRecordId,shipId:a.shipId,data:{factionId:a.data.factionId,hostileId:a.data.hostileId||null,silhouette:a.data.silhouette||null,assetRef:a.data.assetRef||null,appearance:a.data.appearance||null},model:a.data.model||null,modelId:a.data.modelId||null,style:a.data.style||null})),
        actorClearances:actors.map(a=>({slot:a.data.activityActorSlotId,radius:a.radius,
          clearance:Math.hypot(e.pos.x-a.pos.x,e.pos.z-a.pos.z)-(e.radius||2.4)-(a.radius||0)}))});
    }
  });
  bus.emit('sector:enter',{sectorId:TETHYS,sector:SECTORS.find(s=>s.id===TETHYS)});
  const nativeClearances=[];
  for(let tick=0;tick<175*60;tick++) {
    sim.runTicks(1);
    for(const row of observed) {
      if(row.nativeChecked || state.simTime <= row.time) continue;
      const native=sim.registry.get('physics')._sg02;
      const pod=state.entities.get(row.pod.id);
      if(!pod || pod.alive===false) continue;
      row.nativeChecked=true;
      for(const actor of row.actors) {
        const hull=native.records.get(actor.id);assert.ok(hull);
        let min=Infinity, contacts=0;
        const origin=native.getFrameOrigin();
        for(const b of hull.colliders) {
          const proximity=b.contactShape(new native.RAPIER.Ball(pod.radius),{x:pod.pos.x-origin.x,y:pod.pos.y||0,z:pod.pos.z-origin.z},{x:0,y:0,z:0,w:1},300);
          if(proximity) min=Math.min(min,proximity.distance);
          if(proximity?.distance<0) contacts++;
        }
        assert.ok(Number.isFinite(min),'native shape proximity was evaluated');
        assert.ok(min>=0,`native pod/hull penetration ${min}`);
        nativeClearances.push({phase:row.phase,pod:row.pod.id,actor:actor.id,min,contacts,pickupShape:'collection sphere (not a native rigid body)',hullColliders:hull.colliders.length});
      }
    }
  }
  assert.equal(nativeClearances.length,12);
  console.log('TETHYS_NATIVE_SHAPES '+JSON.stringify(nativeClearances));
  console.log('TETHYS_NATIVE_CLEARANCE '+JSON.stringify(observed));
  for(const row of observed) for(const clearance of row.actorClearances) assert.ok(clearance.clearance>=4);
  const cache=owner._tethysQuietCacheCenter();
  for(const row of observed.filter(r=>r.phase==='handoff')) for(const actor of row.actors) assert.ok(Math.hypot(actor.pos.x-cache.x,actor.pos.z-cache.z)<130);
  assert.equal(observed.length,6,'authored three-plus-three remains present on selected native systems');
  sim.dispose();
});
