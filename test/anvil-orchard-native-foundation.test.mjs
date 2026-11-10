import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createOrchardCollarState, orchardPartPose, orchardFrameRootMatches } from '../src/core/anvilOrchardNative.js';
import { orchardFrameBodySpec, ORCHARD_GEOMETRY as G } from '../src/data/anvilOrchardBody.js';
import { physics, readOrchardNativePose } from '../src/core/physics.js';
import { save } from '../src/save/saveSystem.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { ensurePhysicsBodySpec, preparePhysicsBodyNormalizationAdoption } from '../src/core/physicsAuthority.js';

function spawn(sim, progress = [0, 0, 0]) {
  return sim.spawn({ type: 'wreck', pos: { x: 13200, z: 8300 }, rot: 0.713,
    radius: G.radius, mass: 1e6, hull: 300, hullMax: 300, flags: { persistent: true }, physicsBody: orchardFrameBodySpec(),
    data: { orchardId: 'anvil_storm_orchard', orchardKind: 'frame', worldRecordId: G.worldRecordId,
      placeId: 'place_anvil_storm_orchard', authoredAssetId: G.assetId, authoredPayloadAssetId: G.assetId,
      masslineTetherable: false, orchardCollars: createOrchardCollarState(progress) } });
}

test('actual normal owner constructs the full authored compound and exact saved jaw poses', async () => {
  const sim = createSimulation(), frame = spawn(sim, [0, 14, 30]);
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  owner.syncFromEntities([frame]);
  assert.equal(owner._pendingNativeRebuilds.size, 0);
  const record = owner.records.get(frame.id);
  assert.equal(record.colliders.length, G.parts.length); assert.ok(record.colliders.length <= 32);
  const pose = owner.readOrchardFramePose(frame); assert.deepEqual(pose?.progress, [0, 14, 30]);
  assert.equal(pose.kind, 'pose-only'); assert.equal(pose.completedNativeTick, null);
  for (let i = 0; i < record.colliders.length; i++) {
    const actual = record.colliders[i].translationWrtParent(), expected = orchardPartPose(i, [0, 14, 30]).translation;
    assert.ok(Math.hypot(actual.x - expected.x, actual.z - expected.z) < 0.00002);
  }
  owner.dispose(); sim.dispose();
});

test('native snapshot cold adoption preserves source pose and rejects a mismatched saved pose', async () => {
  const sim = createSimulation(), frame = spawn(sim, [0, 14, 0]);
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false }); owner.syncFromEntities([frame]);
  owner.step(); owner.drainContactImpacts();
  const snapshot = owner.exportWorldSnapshot(); assert.ok(snapshot);
  assert.equal(owner.adoptWorldSnapshot(snapshot, [frame]), true);
  assert.deepEqual(owner.readOrchardFramePose(frame)?.progress, [0, 14, 0]);
  const world = owner.world, record = owner.records.get(frame.id);
  frame.data.orchardCollars.progress[1] = 15;
  assert.equal(owner.adoptWorldSnapshot(snapshot, [frame]), false);
  assert.equal(owner.world, world); assert.equal(owner.records.get(frame.id), record);
  frame.data.orchardCollars.progress[1] = 14; assert.ok(owner.readOrchardFramePose(frame));
  owner.dispose(); sim.dispose();
});

test('real scalar Save → JSON → Continue → prepareBackend → first sync keeps the cold source lease', async () => {
  const sim = createSimulation({ seed: 424213, systems: [asteroidSites, physics, save] });
  sim.state.mode = 'flight'; sim.state.world.currentSectorId = 'sector_tethys_junction';
  const player = sim.spawn({ type: 'ship', pos: { x: 13400, z: 8300 }, hull: 100, radius: 6,
    data: { defId: 'ship_kestrel', fittings: [] } }); sim.state.playerId = player.id;
  const frame = spawn(sim, [0, 14, 0]);
  const facade = sim.registry.get('physics'), saves = sim.registry.get('save');
  assert.equal(await facade.prepareBackend(sim.state), true);
  assert.ok(facade._sg02.readOrchardFramePose(frame));
  const envelope = JSON.parse(JSON.stringify(saves.serialize('orchard-cold')));
  // Native bytes are optional; this deliberately exercises the public scalar continuation.
  delete envelope.data.physics; delete envelope.checksum;
  assert.equal(saves.loadEnvelope(envelope), true);
  assert.equal(await facade.prepareBackend(sim.state), true);
  assert.equal(sim.state.physicsRuntime.nativeRestore.mode, 'scalar');
  const restored = sim.state.entityList.find(e => e.data?.orchardKind === 'frame'); assert.ok(restored);
  const spec = restored.physicsBody;
  assert.deepEqual(facade._sg02.readOrchardFramePose(restored)?.progress, [0, 14, 0]);
  facade._syncSg02DynamicAuthorityEntities(sim.state);
  assert.equal(restored.physicsBody, spec); assert.deepEqual(facade._sg02.readOrchardFramePose(restored)?.progress, [0, 14, 0]);
  sim.dispose();
});

test('native root validation refuses nearby wrong yaw/translation and source getter instrumentation', async () => {
  const sim = createSimulation(), frame = spawn(sim), owner = await createSg02DynamicBodyOwner();
  owner.syncFromEntities([frame]); const rec = owner.records.get(frame.id), p = rec.body.translation(), q = rec.body.rotation();
  assert.equal(orchardFrameRootMatches(owner, rec.body, frame), true);
  rec.body.setTranslation({ x: p.x + 0.002, y: 0, z: p.z }, false);
  assert.equal(orchardFrameRootMatches(owner, rec.body, frame), false); assert.equal(owner.readOrchardFramePose(frame), null);
  rec.body.setTranslation(p, false); rec.body.setRotation({ x: 0, y: -Math.sin((frame.rot + 0.00001) / 2), z: 0, w: Math.cos((frame.rot + 0.00001) / 2) }, false);
  assert.equal(orchardFrameRootMatches(owner, rec.body, frame), false);
  rec.body.setRotation(q, false); let getterCalls = 0;
  Object.defineProperty(frame, 'hull', { configurable: true, get() { getterCalls++; return 300; } });
  assert.equal(owner.readOrchardFramePose(frame), null); assert.equal(getterCalls, 0);
  Object.defineProperty(frame, 'hull', { value: 300, writable: true, configurable: true });
  owner.dispose(); sim.dispose();
});

test('retiring an externally removed body refuses reads and ordinary owner cleanup remains safe', async () => {
  const sim = createSimulation(), frame = spawn(sim), owner = await createSg02DynamicBodyOwner();
  owner.syncFromEntities([frame]); const rec = owner.records.get(frame.id);
  owner.world.removeRigidBody(rec.body);
  assert.equal(owner.readOrchardFramePose(frame), null);
  assert.doesNotThrow(() => owner.dispose()); sim.dispose();
});

test('source claims cannot be erased from an existing frame lease', async () => {
  const sim = createSimulation(), frame = spawn(sim), owner = await createSg02DynamicBodyOwner();
  owner.syncFromEntities([frame]); delete frame.data.orchardCollars; delete frame.physicsBody.collisionProxyManifest;
  assert.equal(owner.readOrchardFramePose(frame), null); assert.equal(owner.exportWorldSnapshot(), null);
  owner.dispose(); sim.dispose();
});

test('failed cold mirror publication preserves the prior owner and normalization lease', async () => {
  const sim = createSimulation(), frame = spawn(sim), owner = await createSg02DynamicBodyOwner();
  owner.syncFromEntities([frame]); const world = owner.world, rec = owner.records.get(frame.id), spec = frame.physicsBody;
  Object.defineProperty(frame, 'physicsSleeping', { configurable: true, value: true, writable: false });
  assert.throws(() => owner.rebuildWorldFromEntities([frame]), /entity_mirror_not_writable/);
  assert.equal(owner.world, world); assert.equal(owner.records.get(frame.id), rec); assert.equal(frame.physicsBody, spec);
  assert.ok(owner.readOrchardFramePose(frame));
  Object.defineProperty(frame, 'physicsSleeping', { configurable: true, value: false, writable: true });
  owner.syncFromEntities([frame]); assert.equal(frame.physicsBody, spec); assert.ok(owner.exportWorldSnapshot());
  owner.dispose(); sim.dispose();
});

test('actual Save/Continue inside candidate native allocation supersedes the old cold stack', async () => {
  const sim = createSimulation({ seed: 424213, systems: [asteroidSites, physics, save] });
  sim.state.mode = 'flight'; sim.state.world.currentSectorId = 'sector_tethys_junction';
  const player = sim.spawn({ type: 'ship', pos: { x: 13400, z: 8300 }, hull: 100, radius: 6,
    data: { defId: 'ship_kestrel', fittings: [] } }); sim.state.playerId = player.id;
  const frame = spawn(sim, [0, 14, 0]), facade = sim.registry.get('physics'), saves = sim.registry.get('save');
  assert.equal(await facade.prepareBackend(sim.state), true);
  const owner = facade._sg02, oldWorld = owner.world;
  const envelope = JSON.parse(JSON.stringify(saves.serialize('nested-cold'))); delete envelope.data.physics; delete envelope.checksum;
  const prototype = owner.RAPIER.World.prototype, create = prototype.createCollider; let fired = false, restored;
  prototype.createCollider = function(...args) {
    const collider = create.apply(this, args);
    if (!fired && this !== oldWorld) {
      fired = true; assert.equal(saves.loadEnvelope(envelope), true); facade._finishNativeRestore();
      restored = sim.state.entityList.find(e => e.data?.orchardKind === 'frame');
    }
    return collider;
  };
  try { assert.throws(() => owner.rebuildWorldFromEntities([frame]), /superseded|replaced/); }
  finally { prototype.createCollider = create; }
  assert.equal(fired, true); assert.notEqual(owner.world, oldWorld);
  assert.deepEqual(owner.readOrchardFramePose(restored)?.progress, [0, 14, 0]);
  facade._syncSg02DynamicAuthorityEntities(sim.state); assert.ok(owner.exportWorldSnapshot());
  sim.dispose();
});

test('prepared normalization refuses frozen storage and stale source replacement without changing ordinary ensure', () => {
  const sim = createSimulation(), frame = spawn(sim);
  const scratch = { ...frame, physicsBody: frame.physicsBody };
  const normalized = ensurePhysicsBodySpec(scratch);
  const transfer = preparePhysicsBodyNormalizationAdoption(frame, normalized); assert.ok(transfer?.current());
  frame.physicsBody = structuredClone(frame.physicsBody); assert.equal(transfer.current(), false);
  Object.defineProperty(normalized.thrusters, 'length', { writable: false });
  assert.equal(preparePhysicsBodyNormalizationAdoption(frame, normalized), null);
  const authored = frame.physicsBody; const next = ensurePhysicsBodySpec(frame);
  assert.notEqual(next, authored); assert.equal(Object.getOwnPropertyDescriptor(next.thrusters, 'length').writable, true);
  sim.dispose();
});

test('copied state or a fixed→kinematic body cannot retain a source pose lease or export', async () => {
  const sim = createSimulation(), frame = spawn(sim);
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false }); owner.syncFromEntities([frame]);
  const state = frame.data.orchardCollars;
  frame.data.orchardCollars = structuredClone(state);
  assert.equal(owner.readOrchardFramePose(frame), null); assert.equal(owner.exportWorldSnapshot(), null);
  frame.data.orchardCollars = state;
  const record = owner.records.get(frame.id);
  record.body.setBodyType(owner.RAPIER.RigidBodyType.KinematicPositionBased, false);
  assert.equal(owner.readOrchardFramePose(frame), null); assert.equal(owner.exportWorldSnapshot(), null);
  owner.dispose(); sim.dispose();
});

test('construction rejects altered source metadata without leaking a native body', async () => {
  const sim = createSimulation(), frame = spawn(sim);
  frame.physicsBody.collisionProxyManifest.convexParts[0].points[0].x += 0.01;
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false }); owner.syncFromEntities([frame]);
  assert.equal(owner.records.size, 0); assert.equal(owner.world.bodies.len(), 0);
  assert.equal(owner._pendingNativeRebuilds.size, 1);
  owner.dispose(); sim.dispose();
});

test('scalar cold reconstruction keeps the exact pose lease through the first normal sync', async () => {
  const sim = createSimulation(), frame = spawn(sim, [0, 14, 0]);
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  owner.rebuildWorldFromEntities([frame]);
  const spec = frame.physicsBody;
  assert.deepEqual(owner.readOrchardFramePose(frame)?.progress, [0, 14, 0]);
  owner.syncFromEntities([frame]);
  assert.equal(frame.physicsBody, spec); assert.deepEqual(owner.readOrchardFramePose(frame)?.progress, [0, 14, 0]);
  owner.dispose(); sim.dispose();
});

test('noninteger global root survives normal rebases and exact native snapshot adoption', async () => {
  const sim = createSimulation(), frame = spawn(sim, [0, 14, 30]);
  frame.pos.x = 13200.321; frame.pos.z = 8300.789;
  const owner = await createSg02DynamicBodyOwner(); owner.syncFromEntities([frame]);
  for (const [x, z, seq] of [[13000.125, 8200.321, 1], [-5000.75, 29000.5, 2], [0, 0, 3]]) {
    owner.setFrameOrigin({ x, z }, seq);
    assert.deepEqual(owner.readOrchardFramePose(frame)?.progress, [0, 14, 30]);
    assert.equal(orchardFrameRootMatches(owner, owner.records.get(frame.id).body, frame), true);
    const snapshot = owner.exportWorldSnapshot(); assert.ok(snapshot);
    assert.equal(owner.adoptWorldSnapshot(snapshot, [frame]), true);
  }
  owner.dispose(); sim.dispose();
});

for (const lookup of ['getRigidBody', 'getCollider']) test(`${lookup} callback replacement stops before another old-body read`, async () => {
  const sim = createSimulation(), frame = spawn(sim, [0, 14, 0]), owner = await createSg02DynamicBodyOwner();
  owner.syncFromEntities([frame]); const oldWorld = owner.world, oldBody = owner.records.get(frame.id).body;
  const prototype = owner.RAPIER.World.prototype, original = prototype[lookup];
  const bodyPrototype = owner.RAPIER.RigidBody.prototype, translation = bodyPrototype.translation;
  let fired = false, lateReads = 0;
  bodyPrototype.translation = function(...args) { if (fired && this === oldBody) lateReads++; return translation.apply(this, args); };
  prototype[lookup] = function(...args) {
    const value = original.apply(this, args);
    if (!fired && this === oldWorld) { fired = true; owner.rebuildWorldFromEntities([frame]); }
    return value;
  };
  try { assert.equal(owner.readOrchardFramePose(frame), null); }
  finally { prototype[lookup] = original; bodyPrototype.translation = translation; }
  assert.equal(fired, true); assert.equal(lateReads, 0); assert.notEqual(owner.world, oldWorld);
  assert.deepEqual(owner.readOrchardFramePose(frame)?.progress, [0, 14, 0]); assert.ok(owner.exportWorldSnapshot());
  owner.step(); owner.dispose(); sim.dispose();
});

test('own membership wrappers refuse without calling the wrapper; material and copied spec refuse', async () => {
  const sim = createSimulation(), frame = spawn(sim), owner = await createSg02DynamicBodyOwner(); owner.syncFromEntities([frame]);
  let calls = 0; owner.world.getRigidBody = () => { calls++; throw new Error('must not dispatch'); };
  assert.equal(owner.readOrchardFramePose(frame), null); assert.equal(calls, 0); delete owner.world.getRigidBody;
  const collider = owner.records.get(frame.id).collider;
  collider.setContactSkin(0.01); assert.equal(owner.readOrchardFramePose(frame), null); collider.setContactSkin(0);
  collider.setCollisionGroups(0); assert.equal(owner.exportWorldSnapshot(), null); collider.setCollisionGroups(0x0004000f);
  const spec = frame.physicsBody; frame.physicsBody = structuredClone(spec);
  assert.equal(owner.readOrchardFramePose(frame), null); frame.physicsBody = spec; assert.ok(owner.readOrchardFramePose(frame));
  owner.dispose(); sim.dispose();
});

test('constructor callback generation change refuses before another allocation and cleans the private body', async () => {
  const sim = createSimulation(), frame = spawn(sim), owner = await createSg02DynamicBodyOwner();
  const prototype = owner.RAPIER.World.prototype, create = prototype.createCollider; let calls = 0;
  prototype.createCollider = function(...args) {
    const result = create.apply(this, args);
    if (this === owner.world) { calls++; Object.defineProperty(frame, 'occupantGeneration', { value: frame.occupantGeneration + 1, configurable: true }); }
    return result;
  };
  try { owner.syncFromEntities([frame]); } finally { prototype.createCollider = create; }
  assert.equal(calls, 1); assert.equal(owner.records.size, 0); assert.equal(owner.world.bodies.len(), 0);
  assert.equal(owner.world.colliders.len(), 0); assert.equal(owner._colliderOwners.size, 0);
  owner.dispose(); sim.dispose();
});

test('source serialization hook is refused before invocation', async () => {
  const sim = createSimulation(), frame = spawn(sim), owner = await createSg02DynamicBodyOwner(); owner.syncFromEntities([frame]);
  let calls = 0; Object.defineProperty(frame.physicsBody, 'toJSON', { configurable: true, value() { calls++; return {}; } });
  assert.equal(owner.readOrchardFramePose(frame), null); assert.equal(calls, 0);
  delete frame.physicsBody.toJSON; owner.dispose(); sim.dispose();
});

test('full prism validation rejects a tapered hull with the same XZ hull and Y bounds',async()=>{
 const {sim,frame,owner,rec}=await foundationFixture();const collider=rec.colliders[0],original=collider.vertices();const top=[];let halfY=0;
 for(let i=0;i<original.length;i+=3)if(original[i+1]>0){top.push(original[i],original[i+1],original[i+2]);halfY=original[i+1];}
 const n=top.length/3,cx=top.filter((_,i)=>i%3===0).reduce((a,b)=>a+b,0)/n,cz=top.filter((_,i)=>i%3===2).reduce((a,b)=>a+b,0)/n;
 const tapered=new Float32Array([...top,cx,-halfY,cz]);
 collider.setShape(new owner.RAPIER.ConvexPolyhedron(tapered));
 try {assert.equal(collider.shapeType(),owner.RAPIER.ShapeType.ConvexPolyhedron);assert.equal(owner.readOrchardFramePose(frame),null);} finally {owner.dispose();sim.dispose();}
});


for(const claim of ['record','collider-map']) test(`failed construction preserves a staged allocation claimed by a current ${claim}`,async()=>{
 const sim=createSimulation(),frame=spawn(sim),owner=await createSg02DynamicBodyOwner({publishTelemetry:false});
 const peer=sim.spawn({type:'ship',pos:{x:13300,z:8400},hull:100,radius:6,data:{defId:'ship_kestrel',fittings:[]}});
 owner.syncFromEntities([peer]);ensurePhysicsBodySpec(frame);const peerRec=owner.records.get(peer.id),oldBody=peerRec.body,wp=owner.RAPIER.World.prototype,create=wp.createCollider;
 let stagedBody,stagedCollider,foreignEntry;
 wp.createCollider=function(desc,body){const collider=create.call(this,desc,body);if(this===owner.world&&!stagedBody){stagedBody=body;stagedCollider=collider;foreignEntry={rec:peerRec,collider};if(claim==='record')peerRec.body=body;else owner._colliderOwners.set(collider.handle,foreignEntry);frame.data.orchardCollars=structuredClone(frame.data.orchardCollars);}return collider;};
 try {assert.throws(()=>owner._createRecord(frame,frame.physicsBody));assert.ok(stagedBody);assert.equal(owner.world.getRigidBody(stagedBody.handle),stagedBody);if(claim==='record')assert.equal(peerRec.body,stagedBody);else assert.equal(owner._colliderOwners.get(stagedCollider.handle),foreignEntry);}
 finally {wp.createCollider=create;peerRec.body=oldBody;if(stagedCollider)owner._colliderOwners.delete(stagedCollider.handle);if(stagedBody&&owner.world.getRigidBody(stagedBody.handle)===stagedBody)owner.world.removeRigidBody(stagedBody);owner.dispose();sim.dispose();}
});

for(const change of ['replace','mutate'])test(`pose read refuses ${change} of a collider owner entry during membership callback`,async()=>{
 const sim=createSimulation(),frame=spawn(sim),owner=await createSg02DynamicBodyOwner();owner.syncFromEntities([frame]);const rec=owner.records.get(frame.id),collider=rec.colliders[0],entry=owner._colliderOwners.get(collider.handle),wp=owner.RAPIER.World.prototype,lookup=wp.getRigidBody;let fired=false;
 wp.getRigidBody=function(h){if(!fired&&this===owner.world&&h===rec.body.handle){fired=true;if(change==='replace')owner._colliderOwners.set(collider.handle,{rec:{...rec},collider});else entry.rec={...rec};}return lookup.call(this,h);};
 try{assert.equal(owner.readOrchardFramePose(frame),null);assert.equal(fired,true);}finally{wp.getRigidBody=lookup;entry.rec=rec;owner._colliderOwners.set(collider.handle,entry);owner.dispose();sim.dispose();}
});
test('failed factory keeps a staged body already attached by an actual native joint',async()=>{
 const sim=createSimulation(),frame=spawn(sim),owner=await createSg02DynamicBodyOwner();const peer=sim.spawn({type:'ship',pos:{x:13400,z:8400},hull:100,radius:6,data:{defId:'ship_kestrel',fittings:[]}});owner.syncFromEntities([peer]);ensurePhysicsBodySpec(frame);
 const wp=owner.RAPIER.World.prototype,create=wp.createCollider;let body,joint;
 wp.createCollider=function(desc,b){const c=create.call(this,desc,b);if(this===owner.world&&!body){body=b;joint=owner.world.createImpulseJoint(owner.RAPIER.JointData.rope(10,{x:0,y:0,z:0},{x:0,y:0,z:0}),owner.records.get(peer.id).body,b,true);frame.data.orchardCollars=structuredClone(frame.data.orchardCollars);}return c;};
 try{assert.throws(()=>owner._createRecord(frame,frame.physicsBody));assert.ok(body);assert.ok(owner.world.getRigidBody(body.handle)===body,'claimed body survives');assert.ok(owner.world.getImpulseJoint(joint.handle)===joint,'foreign native joint survives');}finally{wp.createCollider=create;if(joint&&owner.world.getImpulseJoint(joint.handle)===joint)owner.world.removeImpulseJoint(joint,true);if(body&&owner.world.getRigidBody(body.handle)===body)owner.world.removeRigidBody(body);owner.dispose();sim.dispose();}
});

test('last cold native validation cannot publish a replaced original source',async()=>{
 const sim=createSimulation(),frame=sim.spawn({type:'wreck',pos:{x:13200.13,z:8300.29},rot:.713,radius:G.radius,mass:1e6,hull:300,hullMax:300,physicsBody:orchardFrameBodySpec(),data:{orchardId:'anvil_storm_orchard',orchardKind:'frame',worldRecordId:G.worldRecordId,masslineTetherable:false,orchardCollars:createOrchardCollarState([0,14,30])}}),owner=await createSg02DynamicBodyOwner();owner.syncFromEntities([frame]);
 const oldWorld=owner.world,oldRec=owner.records.get(frame.id),oldData=frame.data,cp=owner.RAPIER.Collider.prototype,vertices=cp.vertices;let calls=0,fired=false;
 cp.vertices=function(...args){const value=vertices.apply(this,args);if(++calls===G.parts.length*3){fired=true;frame.data=structuredClone(oldData);}return value;};
 let error;
 try{try{owner.rebuildWorldFromEntities([frame]);}catch(e){error=e;}assert.equal(fired,true,`triggered after ${calls} native reads`);assert.ok(error,'cold publication refuses the replaced original source');assert.equal(owner.world,oldWorld);assert.equal(owner.records.get(frame.id),oldRec);}
 finally{cp.vertices=vertices;frame.data=oldData;owner.dispose();sim.dispose();}
});

async function foundationFixture() {
  const sim = createSimulation(), frame = spawn(sim, [0, 14, 30]);
  const owner = await createSg02DynamicBodyOwner(); owner.syncFromEntities([frame]);
  assert.ok(owner.readOrchardFramePose(frame)); return { sim, frame, owner, rec: owner.records.get(frame.id) };
}

test('state-bound pose facade refuses restore, pending rebuild, changed identity and replaced world', async () => {
  const sim = createSimulation({ systems: [physics] }); sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_tethys_junction';
  const player = sim.spawn({ type: 'ship', pos: { x: 13400, z: 8300 }, hull: 100, radius: 6, data: { defId: 'ship_kestrel', fittings: [] } });
  sim.state.playerId = player.id;
  const frame = spawn(sim, [0, 14, 0]), facade = sim.registry.get('physics');
  assert.equal(await facade.prepareBackend(sim.state), true);
  assert.deepEqual(readOrchardNativePose(sim.state, frame)?.progress, [0, 14, 0]);
  facade._nativeRestorePending = true; assert.equal(readOrchardNativePose(sim.state, frame), null);
  facade._nativeRestorePending = false; facade._nativeRestoreDeferred = true;
  assert.equal(readOrchardNativePose(sim.state, frame), null); facade._nativeRestoreDeferred = false;
  const owner = facade._sg02; owner._pendingNativeRebuilds.set(-1, {});
  assert.equal(readOrchardNativePose(sim.state, frame), null); owner._pendingNativeRebuilds.delete(-1);
  sim.state.entities.set(frame.id, { ...frame }); assert.equal(readOrchardNativePose(sim.state, frame), null);
  sim.state.entities.set(frame.id, frame); assert.ok(readOrchardNativePose(sim.state, frame));
  const previousWorld = owner.world, wp = owner.RAPIER.World.prototype, get = wp.getRigidBody; let fired = false;
  wp.getRigidBody = function(...args) {
    const body = get.apply(this, args);
    if (!fired && this === previousWorld) { fired = true; owner.rebuildWorldFromEntities([frame]); }
    return body;
  };
  try { assert.equal(readOrchardNativePose(sim.state, frame), null); }
  finally { wp.getRigidBody = get; }
  assert.equal(fired, true); assert.ok(readOrchardNativePose(sim.state, frame)); owner.dispose();
  assert.equal(readOrchardNativePose(sim.state, frame), null); sim.dispose();
});

test('disposal during source allocation stops before using the retired native world', async () => {
  const sim = createSimulation(), frame = spawn(sim), owner = await createSg02DynamicBodyOwner();
  ensurePhysicsBodySpec(frame);
  const wp = owner.RAPIER.World.prototype, create = wp.createRigidBody, collider = wp.createCollider;
  let disposed = false, lateCalls = 0;
  wp.createRigidBody = function(...args) {
    const body = create.apply(this, args);
    if (!disposed && this === owner.world) { disposed = true; owner.dispose(); }
    return body;
  };
  wp.createCollider = function(...args) { if (disposed) lateCalls++; return collider.apply(this, args); };
  try { assert.throws(() => owner._createRecord(frame, frame.physicsBody)); }
  finally { wp.createRigidBody = create; wp.createCollider = collider; }
  assert.equal(disposed, true); assert.equal(lateCalls, 0); assert.equal(owner._eventQueue, null); sim.dispose();
});
