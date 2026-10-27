import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../../src/runtime/createAuthoritativeRuntime.js';
import { applyFeatureConfigToMaps, snapshotFeatureMaps, restoreFeatureMaps } from '../../src/data/featureFlags.js';
import { makeShipEntitySpec } from '../../src/systems/ships.js';

// Full production factory, not a selected-owner simulation: machinery and terrain
// producers must participate so a station-clear spawn cannot overlap a late anvil.
// No tender/client pose edits. Player relocation uses the ordinary world entry API.
export async function ceresTenderClearanceFixture() {
  const flags = snapshotFeatureMaps();
  const runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 47 });
  applyFeatureConfigToMaps(runtime.config.features);
  const state = runtime.state;
  state.mode = 'flight';
  state.ui.screenStack = [];
  const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true, player: state.player, team: 0, pos: { x: 0, z: 0 }
  }));
  state.playerId = player.id;
  const world = runtime.getSystem('world');
  world.enterSector('sector_ceres_belt');
  const station = state.entityList.find(e => e.data?.stationId === 'station_ceres');
  world.relocatePlayerInSector({ x: station.pos.x + 500, z: station.pos.z, heading: 0 },
    { reason: 'ceres-tender-clearance-proof' });
  const physics = runtime.getSystem('physics');
  try {
    assert.ok(runtime.getSystem('environmentalMachinery') && runtime.getSystem('terrainAnchors'));
    assert.equal(await physics.prepareBackend(state), true);
  } catch (error) {
    runtime.dispose();
    restoreFeatureMaps(flags);
    throw error;
  }
  return {
    sim: { registry: { get: id => runtime.getSystem(id) } },
    runtime, state, owner: runtime.getSystem('traffic'), player, physics,
    step(n = 1) { for (let i = 0; i < n; i++) runtime.step(1 / 60); },
    close() { runtime.dispose(); restoreFeatureMaps(flags); }
  };
}

// Conservative planar envelope from the actual compiled native shapes. Unknown
// shapes return Infinity so broadphase filtering cannot silently drop a large hull.
export function compiledNativeRadius(record) {
  let radius = 0;
  for(const c of record.colliders) {
    const p=c.translationWrtParent(),q=c.rotationWrtParent(),shape=c.shape;
    if(shape.vertices?.length) {
      for(let i=0;i<shape.vertices.length;i+=3) {
        const x=shape.vertices[i],y=shape.vertices[i+1],z=shape.vertices[i+2];
        const tx=2*(q.y*z-q.z*y),ty=2*(q.z*x-q.x*z),tz=2*(q.x*y-q.y*x);
        radius=Math.max(radius,Math.hypot(p.x+x+q.w*tx+q.y*tz-q.z*ty,
          p.z+z+q.w*tz+q.x*ty-q.y*tx));
      }
    } else if(shape.halfExtents) {
      const h=shape.halfExtents;
      radius=Math.max(radius,Math.hypot(p.x,p.z)+Math.hypot(h.x,h.y,h.z));
    } else if(Number.isFinite(shape.radius)) {
      radius=Math.max(radius,Math.hypot(p.x,p.z)+shape.radius+(shape.halfHeight||0));
    } else return Infinity;
  }
  return radius;
}


// Read-only observer shared with the existing production cargo run. No phase/pose
// edits: the real producer, ordinary job owner and native physics must do the work.
export function observeProductionTender(runtime) {
  const state=runtime.state;
  const actor=state.entityList.find(e=>e.data?.activityActorSlotId==='ceres_refinery_tender');
  const client=state.entityList.find(e=>e.data?.activityObjectSlotId==='ceres_refinery_disabled_hull');
  assert.ok(actor&&client);
  const identity={id:actor.id,life:actor.occupantGeneration,record:actor.data.worldRecordId,job:actor.data.jobId};
  const phases=[];
  let pulseCount=0;
  runtime.bus.on('propulsion:pulse',event=>{if(event.shipId===actor.id)pulseCount++;});
  let lastPhase=null,minVisualGap=Infinity,minContact=Infinity,sawService=false,sawReturn=false,maxTravel=0;
  const start={...actor.pos};
  return {
    step() {
      assert.strictEqual(state.entities.get(identity.id),actor);
      assert.equal(actor.alive,true);
      assert.equal(actor.occupantGeneration,identity.life);
      assert.equal(actor.data.worldRecordId,identity.record);
      assert.equal(actor.data.jobId,identity.job);
      assert.equal(pulseCount,0,'delicate ordinary service must use RCS, not fire PulsePlate');
      const job=state.npcJobs.byId[identity.job]?.job;
      assert.ok(job);
      const phase=job.phase+':'+job.routeIndex;
      if(phase!==lastPhase){phases.push({tick:state.tick,phase,pos:{...actor.pos}});lastPhase=phase;}
      const native=runtime.getSystem('physics')._sg02,record=native.records.get(actor.id);
      assert.ok(record,'ordinary tender remains native during the resident production proof');
      const distance=Math.hypot(actor.pos.x-client.pos.x,actor.pos.z-client.pos.z);
      const gap=distance-client.data.visualRadius-compiledNativeRadius(record);
      minVisualGap=Math.min(minVisualGap,gap);
      // This circle overapproximates visible meshes; report it, do not infer penetration.
      const standoff=Math.max(56,actor.radius+client.radius+12);
      if(job.phase==='work'&&Math.abs(distance-standoff)<3)sawService=true;
      const berth=job.route[0].pos;
      if(sawService&&job.routeIndex===0&&Math.hypot(actor.pos.x-berth.x,actor.pos.z-berth.z)<5)sawReturn=true;
      maxTravel=Math.max(maxTravel,Math.hypot(actor.pos.x-start.x,actor.pos.z-start.z));
      const contact=assertTenderNativeContacts(native,record,state.tick);
      minContact=Math.min(minContact,contact.depth);
    },
    finish() {
      const evidence={identity,phases,pulseCount,minVisualGap,minContact:Number.isFinite(minContact)?minContact:null,sawService,sawReturn,maxTravel};
      console.log('CERES_TENDER_ORDINARY_ROUTE',JSON.stringify(evidence));
      assert.ok(sawService,'ordinary native tender reaches its actual client service standoff');
      assert.ok(sawReturn,'ordinary native tender returns to its authored berth after service');
      assert.ok(maxTravel>5,'route evidence requires actual native motion');
      return evidence;
    }
  };
}

// Rapier may catch callback exceptions. Collect first, assert after returning to JS.
export function assertTenderNativeContacts(native, record, tick) {
  let worst={depth:Infinity,actorId:record.entity.id,targetId:null};
  for(const collider of record.colliders)native.world.contactPairsWith(collider,other=>{
    const target=native._colliderOwners.get(other.handle)?.rec;
    if(!target||target===record||other.isSensor())return;
    native.world.contactPair(collider,other,manifold=>{
      for(let i=0;i<manifold.numContacts();i++){
        const depth=manifold.contactDist(i);
        if(depth<worst.depth)worst={depth,actorId:record.entity.id,targetId:target.entity.id};
      }
    });
  });
  assert.ok(worst.depth>=-.05,`tick ${tick}: tender native contact ${worst.actorId}/${worst.targetId} depth ${worst.depth}`);
  return worst;
}
