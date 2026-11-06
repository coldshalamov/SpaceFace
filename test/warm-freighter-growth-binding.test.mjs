import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse } from '../src/core/physicsAuthority.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { materializeAlienEcology, tickAlienEcology, resolveWarmFreighterHost } from '../src/systems/alienEcology.js';
import { ALIEN_SITES, planInfestationModules, planAmbientGrowth, planFaunaCast } from '../src/data/alienEcology.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { WARM_FREIGHTER_HOST as C } from '../src/data/warmFreighter.js';
import { mapWarmFreighterGrowth } from '../src/data/warmFreighterLayout.js';
import { sectorGlobalOrigin, sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { armAuxJournal } from '../src/world/auxRowJournal.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';
import { render } from '../src/render/renderer.js';
import { createSnapshotFence } from '../src/render/snapshotFence.js';
import { isPhysicsBoundWholeHulk } from '../src/data/wholeShipVisualIdentity.js';

function boot() {
  const modules = { physics, aftermathWrecks };
  const sim = createSimulation({ seed: 47, systems: PRODUCTION_INIT_ORDER.filter(id => modules[id]).map(id => modules[id]),
    updateOrder: PRODUCTION_UPDATE_ORDER.filter(id => modules[id]).map(id => modules[id]) });
  const state = sim.state; state.mode = 'flight'; state.world.currentSectorId = C.sectorId;
  state.world.frameOrigin = { ...sectorGlobalOrigin(C.sectorId) }; state.world.frameOriginSeq = 1;
  const center = sectorLocalToGlobalForSector(C.center, C.sectorId);
  const player = sim.spawn({ type: 'ship', hull: 100, mass: 28, radius: 6, physicsBody: false,
    pos: { x: center.x + 200, z: center.z }, data: {} }); state.playerId = player.id;
  const active = { dressing: [], pois: [] }; state.world.activeSector = active;
  const world = { state, bus: sim.bus, helpers: sim.helpers, registry: sim.registry,
    _toGlobal: (p, sector) => sectorLocalToGlobalForSector(p, sector), _toLocal: p => ({x: p.x-center.x+C.center.x, z:p.z-center.z+C.center.z}) };
  return { sim, state, world, active, owner: sim.registry.get('aftermathWrecks') };
}
const materialize = h => materializeAlienEcology(h.world, {id:C.sectorId}, h.active, [ALIEN_SITES.warm_freighter]);
const rows = h => (h.state.world.dressing?.rows || []).filter(r => r.data?.warmFreighterHostMarkerId === C.markerId);
const close = h => h.sim.dispose();
const datum = {center:[C.assetCenter.x,C.assetCenter.y,C.assetCenter.z],envelope:C.assetSize.x};
const eq = (a,b) => assert.ok(Math.abs(a-b)<1e-7, `${a} != ${b}`);

test('ordinary materializer preserves bloom rows and the shared RNG stream while mapping to the live global host', () => {
  const h=boot(); try {
    const ae=ensureAlienEcologyState(h.state);
    ae.sites[C.siteId]={state:'bloom',beats:{},deadFauna:{},signals:[],offersEmitted:{}};
    const rng=h.world.helpers.mulberry32(h.world.helpers.hash32(h.state.meta.seed || 1,C.sectorId,0,'alien-ecology',C.siteId));
    const base=planInfestationModules(ALIEN_SITES[C.siteId],rng,'bloom');
    const ambient=planAmbientGrowth(h.state,ALIEN_SITES[C.siteId],rng);
    const cast=planFaunaCast(ALIEN_SITES[C.siteId],rng);
    materialize(h); const b=resolveWarmFreighterHost(h.world);
    const rawHost={pos:b.pose,rot:b.pose.rot,radius:b.radius,bank:b.host.bank||0,pitch:b.host.pitch||0};
    const expected=[...mapWarmFreighterGrowth(base,rawHost,datum,'base'),...mapWarmFreighterGrowth(base.slice(0,8),rawHost,datum,'bloom'),...mapWarmFreighterGrowth(ambient,rawHost,datum,'ambient')];
    const actual=rows(h); assert.equal(actual.length,26);
    for(let i=0;i<actual.length;i++) { eq(actual[i].pos.x,expected[i].pos.x);eq(actual[i].pos.z,expected[i].pos.z);eq(actual[i].rot,expected[i].rot);eq(actual[i].data.warmFreighterVisualPose.height,expected[i].height);eq(actual[i].data.scale,expected[i].scale); }
    assert.deepEqual(actual.slice(0,12).map(r=>r.data.moduleId),base.map(r=>r.moduleId));
    assert.deepEqual(h.state.entityList.filter(e=>e.type==='fauna').map(e=>e.data.ecology.faunaKey),cast.map(m=>m.faunaKey));
  } finally {close(h);}
});

test('native host motion updates the bounded rows, pose dirty journal and auxiliary spatial channel', async () => {
  const h=boot(); try {
    materialize(h); const b=resolveWarmFreighterHost(h.world), row=rows(h)[0];
    const before={...row.pos}, table=h.state.world.dressing, j=armAuxJournal(table);j.armed=true;j.dirty.clear();table.dirtyPoseIds.clear();
    assert.equal(await h.sim.registry.get('physics').prepareBackend(h.state),true);
    queuePhysicsImpulse(b.host,{x:5.5,y:0,z:2.75});queuePhysicsTorqueImpulse(b.host,{x:0,y:.05,z:0});
    for(let i=0;i<12;i++) h.sim.step(1/60);
    tickAlienEcology(h.world,1/60);
    assert.ok(Math.hypot(row.pos.x-before.x,row.pos.z-before.z)>.005);
    assert.ok(table.dirtyPoseIds.has(row.id));assert.ok(j.dirty.has(row.id));
    const again=resolveWarmFreighterHost(h.world), rng=h.world.helpers.mulberry32(h.world.helpers.hash32(h.state.meta.seed||1,C.sectorId,0,'alien-ecology',C.siteId));
    const base=planInfestationModules(ALIEN_SITES[C.siteId],rng,'dormant');
    const p=mapWarmFreighterGrowth(base,{pos:again.pose,rot:again.pose.rot,radius:again.radius,bank:again.host.bank||0,pitch:again.host.pitch||0},datum)[0];
    eq(row.pos.x,p.pos.x);eq(row.pos.z,p.pos.z);eq(row.data.warmFreighterVisualPose.height,p.height);
  } finally {close(h);}
});

test('missing and recycled hosts retire cached growth without admitting a replacement', () => {
  for(const kind of ['missing','recycled']) { const h=boot(); try {
    materialize(h);const host=resolveWarmFreighterHost(h.world).host;
    if(kind==='missing')h.state.entities.delete(host.id);else host.occupantGeneration++;
    tickAlienEcology(h.world,1/60);assert.equal(rows(h).length,0,kind);
    assert.equal(h.active.dressing.filter(r=>r.placeId?.startsWith('alien_growth_')).length,0);
    assert.equal(resolveWarmFreighterHost(h.world),null);
  } finally {close(h);} }
});

test('a different ecology site retains its original seeded ring and fauna stream', () => {
  const h=boot();try {
    const site=ALIEN_SITES.quiet_ice, sector=site.sectorId;
    const rng=h.world.helpers.mulberry32(h.world.helpers.hash32(h.state.meta.seed||1,sector,0,'alien-ecology',site.siteId));
    const base=planInfestationModules(site,rng,'dormant');planAmbientGrowth(h.state,site,rng);
    const cast=planFaunaCast(site,rng);
    materializeAlienEcology(h.world,{id:sector},h.active,[site]);
    const actual=h.state.world.dressing.rows.filter(r=>r.data.siteId===site.siteId && !r.data.ambient);
    assert.equal(actual.length,base.length);
    for(let i=0;i<base.length;i++) {
      const p=sectorLocalToGlobalForSector({x:site.center.x+base[i].dx,z:site.center.z+base[i].dz},sector);
      eq(actual[i].pos.x,p.x);eq(actual[i].pos.z,p.z);eq(actual[i].rot,base[i].rot);
      assert.equal(actual[i].data.moduleId,base[i].moduleId);
    }
    assert.deepEqual(h.state.entityList.filter(e=>e.type==='fauna').map(e=>e.data.ecology.faunaKey),cast.map(m=>m.faunaKey));
  } finally {close(h);}
});

test('Continue retries only dressing against the restored host pose', () => {
  const source=boot();let saved;
  try {
    materialize(source);const host=resolveWarmFreighterHost(source.world).host;
    host.pos.x+=29;host.pos.z-=17;host.rot=.6;
    saved=source.owner.serialize();
  } finally {close(source);}
  const h=boot();try {
    h.sim.bus.emit('save:restoring',{});materialize(h);
    assert.equal(rows(h).length,0);
    const fauna=h.state.entityList.filter(e=>e.type==='fauna').map(e=>e.id);
    h.owner.deserialize(saved);h.sim.bus.emit('save:loaded',{});
    const b=resolveWarmFreighterHost(h.world);assert.ok(b);
    assert.equal(rows(h).length,12);
    assert.deepEqual(h.state.entityList.filter(e=>e.type==='fauna').map(e=>e.id),fauna);
    const rng=h.world.helpers.mulberry32(h.world.helpers.hash32(h.state.meta.seed||1,C.sectorId,0,'alien-ecology',C.siteId));
    const base=planInfestationModules(ALIEN_SITES[C.siteId],rng,'dormant');
    const p=mapWarmFreighterGrowth(base,{pos:b.pose,rot:b.pose.rot,radius:b.radius,bank:b.host.bank||0,pitch:b.host.pitch||0},datum)[0];
    eq(rows(h)[0].pos.x,p.pos.x);eq(rows(h)[0].pos.z,p.pos.z);
    eq(rows(h)[0].data.warmFreighterVisualPose.height,p.height);
  } finally {close(h);}
});

test('actual worker dressing delta reaches the main facade and mounted renderer matrix, then retires', async () => {
  // Save genuine nonplanar source fields; the visible physics-bound hull is planar.
  const source=boot();let saved;
  try {
    materialize(source);const sourceHost=resolveWarmFreighterHost(source.world).host;
    sourceHost.bank=.16;sourceHost.pitch=-.11;
    saved=source.owner.serialize();
    const marker=saved.bySector[C.sectorId].find(r=>r.markerId===C.markerId);
    assert.equal(marker.victimBank,.16);assert.equal(marker.victimPitch,-.11);
  } finally {close(source);}
  const worker=createSimHost(), main=createGameState(47);let receive, initRequest, tick=0;
  const lane=createSimLaneRuntime({state:main,bus:createBus(),registry:{},helpers:{},flags:{lane:'worker',sab:false,warnings:[]},clockMode:'worker-local',
    channelFactory:()=>({onMessage(fn){receive=fn;},post(msg){if(msg.kind==='init')initRequest=msg;},terminate(){}})});
  try {
    const scenarioContract=JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json',import.meta.url),'utf8'));
    const init=await worker.init({...initRequest,scenarioContract});
    receive(structuredClone({kind:'ready',seq:initRequest.seq,...init}));await lane.readyPromise;
    const {state,registry,runtime}=worker.host, world=registry.get('world');
    registry.get('aftermathWrecks').deserialize(saved);
    const player=runtime.spawn({type:'ship',isPlayer:true,hull:100,mass:28,radius:6,physicsBody:false,
      pos:world._toGlobal({x:C.center.x+200,z:C.center.z},C.sectorId),data:{defId:'ship_kestrel'}});
    state.playerId=player.id;state.mode='flight';
    world.enterSector(C.sectorId,{continuous:true,noTeleport:true,placePlayer:false});
    tickAlienEcology(world,1/60);
    const step=async()=>{const reply=await worker.tick({tick:++tick,steps:0,commands:[],generation:0});receive(structuredClone({kind:'clockTick',...reply}));return reply;};
    let reply=await step();
    const actual=state.world.dressing.rows.find(r=>r.data?.warmFreighterHostMarkerId===C.markerId);
    assert.ok(actual,`ordinary world sector materialization created growth: ${JSON.stringify({current:state.world.currentSectorId, binding:!!resolveWarmFreighterHost(world), pending:state.world.dressing?.rows?.filter(r=>r.data?.siteId===C.siteId).length, ready:world._activeSector?.id})}`);
    assert.ok(reply.auxUpserts.some(r=>r.id===actual.id && r.warmFreighterPose),'actual worker aux packet includes the pose');
    const facade=main.entities.get(actual.id);assert.ok(facade,'actual main lane spawned the dressing facade');
    const bound=resolveWarmFreighterHost(world), physical=bound.host;
    assert.equal(isPhysicsBoundWholeHulk(physical),true);
    assert.equal(physical.bank,.16);assert.equal(physical.pitch,-.11,'Continue retains the saved simulation tilt');
    assert.equal(facade.data.warmFreighterVisualPose.bank,0);
    assert.equal(facade.data.warmFreighterVisualPose.pitch,0);
    const vf=installVisualOverrides(createVisualFactory()), mesh=vf.build(facade);
    assert.ok(mesh);let draws=0,instances=0;mesh.traverse(n=>{if(n.isMesh)draws++;if(n.isInstancedMesh)instances++;});
    assert.ok(draws>0,'normal growth builder provides the procedural geometry');assert.equal(instances,0,'this growth path has no instanced mesh');
    mesh.matrixAutoUpdate=false;
    const origin={x:8192,y:0,z:28672};
    const frame={origin,toLocal(p,out){out.x=p.x-origin.x;out.z=p.z-origin.z;return out;}};
    const fence=createSnapshotFence({capacity:2});
    const snap=fence.beginPack(1,0,0), idx=snap.write(actual.id,0,actual.pos.x,0,actual.pos.z,0,0,0,1,1,1,1,0);
    snap.setGeneration(idx,0);fence.commit();
    const mounted={...render,state:main,_presentationWorld:{entityIds:Uint32Array.of(actual.id),slotGenerations:Uint32Array.of(0)},
      _snapshotFence:fence,_frameMembrane:frame};
    assert.equal(mounted._applyPresentationPose(0,mesh,1,true),true);
    // Exercise the actual renderer hulk policy, then compare the sampled asset
    // contact through its fitted child matrix to the actual growth mesh origin.
    const hulkFacade=main.entities.get(physical.id);assert.ok(hulkFacade);
    assert.equal(isPhysicsBoundWholeHulk(hulkFacade),true);
    const hostMesh=new THREE.Group(), hull=new THREE.Group();
    const fit=physical.radius*2/C.assetSize.x;
    hull.scale.setScalar(fit);hull.position.set(-C.assetCenter.x*fit,-C.assetCenter.y*fit,-C.assetCenter.z*fit);
    hull.rotation.set(.16,0,-.11);hostMesh.add(hull);hostMesh.userData.hull=hull;
    const hostFence=createSnapshotFence({capacity:2}), hostSnap=hostFence.beginPack(1,0,0);
    const hi=hostSnap.write(physical.id,0,physical.pos.x,0,physical.pos.z,0,Math.sin(physical.rot/2),0,Math.cos(physical.rot/2),1,1,1,0);
    hostSnap.setLean(hi,physical.bank,physical.pitch);hostSnap.setGeneration(hi,0);hostFence.commit();
    const hostMounted={...render,state:main,_presentationWorld:{entityIds:Uint32Array.of(physical.id),slotGenerations:Uint32Array.of(0)},
      _snapshotFence:hostFence,_frameMembrane:frame};
    const verifyHostContact=()=>{
      assert.equal(hostMounted._applyPresentationPose(0,hostMesh,1,true),true);
      assert.equal(hull.rotation.x,0);assert.equal(hull.rotation.z,0);
      hostMesh.updateMatrixWorld(true);mesh.updateMatrixWorld(true);
      const contact=hull.localToWorld(new THREE.Vector3(-2.75,1,1.45));
      eq(mesh.position.x,contact.x);eq(mesh.position.y,contact.y);eq(mesh.position.z,contact.z);
      const normal=new THREE.Vector3(0,1,0).applyQuaternion(mesh.quaternion);
      const hostNormal=new THREE.Vector3(0,1,0).transformDirection(hull.matrixWorld);
      assert.ok(normal.distanceTo(hostNormal)<1e-7,'growth up follows the visible hulk surface frame');
    };
    const verify=()=>{
      const p=facade.data.warmFreighterVisualPose;
      eq(mesh.position.x,facade.pos.x-origin.x);eq(mesh.position.z,facade.pos.z-origin.z);eq(mesh.position.y,p.height);
      const q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-(facade.rot-p.localYaw))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),p.bank))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),p.pitch))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-p.localYaw));
      assert.ok(Math.abs(mesh.quaternion.dot(q))>1-1e-10);mesh.updateMatrix();eq(mesh.matrix.elements[13],p.height);
    };
    verify();verifyHostContact();
    const localMesh=vf.build(actual);localMesh.matrixAutoUpdate=false;
    const direct={...render,state,_meshes:new Map([[actual.id,localMesh]]),_frameMembrane:frame};
    direct._syncWorldPresentationTableMeshes();
    eq(localMesh.position.y,actual.data.warmFreighterVisualPose.height);
    eq(localMesh.matrix.elements[13],actual.data.warmFreighterVisualPose.height);
    bound.host.pos.x+=10;bound.host.pos.z-=7;
    bound.host.rot=.42;bound.host.bank=.16;bound.host.pitch=-.11;
    tickAlienEcology(world,1/60);reply=await step();
    assert.ok(reply.auxUpserts.some(r=>r.id===actual.id && r.warmFreighterPose));
    assert.strictEqual(main.entities.get(actual.id),facade,'main facade identity stays stable');
    assert.equal(facade.data.warmFreighterVisualPose.bank,0);assert.equal(facade.data.warmFreighterVisualPose.pitch,0);
    assert.equal(bound.host.bank,.16);assert.equal(bound.host.pitch,-.11);
    assert.equal(mounted._applyPresentationPose(0,mesh,1,true),true);verify();
    const movedSnap=hostFence.beginPack(1,1,0);
    const movedIndex=movedSnap.write(physical.id,0,physical.pos.x,0,physical.pos.z,0,
      Math.sin(physical.rot/2),0,Math.cos(physical.rot/2),1,1,1,0);
    movedSnap.setLean(movedIndex,physical.bank,physical.pitch);movedSnap.setGeneration(movedIndex,0);hostFence.commit();
    verifyHostContact();
    direct._syncWorldPresentationTableMeshes();
    eq(localMesh.position.x,actual.pos.x-origin.x);eq(localMesh.position.y,actual.data.warmFreighterVisualPose.height);
    assert.ok(Math.abs(localMesh.quaternion.dot(mesh.quaternion))>1-1e-10);
    bound.host.data.playerOwned=true;tickAlienEcology(world,1/60);reply=await step();
    assert.ok(reply.auxRemovals.includes(actual.id));assert.equal(main.entities.has(actual.id),false);
    const again=await step();assert.ok(!again.auxRemovals.includes(actual.id),'the row retires once');
  } finally {lane.close();worker.shutdown();}
});

test('ordinary dressing retains zero height and yaw-only pose', () => {
  const row={id:901,alive:true,pos:{x:105,z:198},rot:.3,data:{}}, mesh=new THREE.Group();mesh.position.y=7;mesh.rotation.x=.2;
  // A normal mounted root starts with no tilt; pose synchronization preserves its existing yaw contract.
  mesh.rotation.x=0;mesh.matrixAutoUpdate=false;
  const table={version:1,rows:[row],byId:new Map([[row.id,row]]),dirtyPoseIds:new Set([row.id])};
  const frame={origin:{x:100,y:0,z:200},toLocal(p,out){out.x=p.x-100;out.z=p.z-200;return out;}};
  const owner={...render,state:{world:{dressing:table,frameOriginSeq:1}},_meshes:new Map([[row.id,mesh]]),_frameMembrane:frame};
  owner._syncWorldPresentationTableMeshes();
  eq(mesh.position.x,5);eq(mesh.position.y,0);eq(mesh.position.z,-2);eq(mesh.rotation.y,-.3);eq(mesh.rotation.x,0);
});
