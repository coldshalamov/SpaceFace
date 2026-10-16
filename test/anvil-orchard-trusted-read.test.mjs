import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRapierCompatRuntime, orchardRapierBaseline } from '../src/core/rapierCompatRuntime.js';
import { createOrchardNativeLane, prepareOrchardNativeObservation, orchardColliderProjection, orchardPairClearance } from '../src/core/anvilOrchardCollarQuery.js';

import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createOrchardCollarState, orchardPartPose } from '../src/core/anvilOrchardNative.js';
import { orchardFrameBodySpec, ORCHARD_GEOMETRY as G } from '../src/data/anvilOrchardBody.js';

const R = await loadRapierCompatRuntime();
function fixture() {
  const world = new R.World({ x: 0, y: 0, z: 0 });
  const body = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(7.25, 0, -12.5));
  const collider = world.createCollider(R.ColliderDesc.ball(2), body);
  const lane = createOrchardNativeLane(R, world, orchardRapierBaseline(R));
  return { world, body, collider, lane };
}

test('default initialization seals the native lane, with actual raw poses and vertices', () => {
  const { world, body, collider, lane } = fixture();
  try {
    assert.equal(orchardRapierBaseline(R)?.observationEnabled,true);
    assert.ok(lane?.verify());
    assert.deepEqual(lane.converted('bodies', 'rbTranslation', body.handle), { x: 7.25, y: 0, z: -12.5 });
    assert.equal(lane.rawRead('colliders', 'coParent', collider.handle), body.handle);
    assert.equal(lane.rawRead('colliders', 'coRadius', collider.handle), 2);
  } finally { world.free(); }
});

for (const [label, select, key] of [
  ['body getter', () => R.RigidBody.prototype, 'translation'],
  ['Coarena index', f => Object.getPrototypeOf(f.world.bodies.map), 'index'],
  ['Coarena len', f => Object.getPrototypeOf(f.world.colliders.map), 'len'],
  ['joint axis', () => R.RevoluteImpulseJoint.prototype, 'rawAxis'],
  ['raw body getter', f => Object.getPrototypeOf(f.world.bodies.raw), 'rbTranslation'],
  ['raw vector conversion', () => orchardRapierBaseline(R).vectorPrototype.constructor, '__wrap'],
]) test(`wrapped ${label} refuses before any trusted bypass`, () => {
  const f = fixture(), target = select(f), descriptor = Object.getOwnPropertyDescriptor(target, key); let calls = 0;
  Object.defineProperty(target, key, { ...descriptor, value(...args) { calls++; return descriptor.value.apply(this, args); } });
  try { assert.equal(f.lane.verify(), false); assert.equal(calls, 0); }
  finally { Object.defineProperty(target, key, descriptor); f.world.free(); }
});

test('caller-owned World allocation wrapper is preserved and disables the native lane', () => {
  const world = new R.World({ x: 0, y: 0, z: 0 }), create = world.createRigidBody;
  const wrapper = function(...args) { return create.apply(this, args); }; world.createRigidBody = wrapper;
  try { assert.equal(createOrchardNativeLane(R, world, orchardRapierBaseline(R)), null); assert.equal(world.createRigidBody, wrapper); }
  finally { world.free(); }
});

test('ordinary custom importer remains successful without gaining loader trust', async () => {
  const loader = await import('../src/core/rapierCompatRuntime.js?orchard_custom_importer');
  const fake = { init: async () => {} };
  assert.equal(await loader.loadRapierCompatRuntime({ importModule: async () => ({ default: fake }) }), fake);
  assert.equal(loader.orchardRapierBaseline(fake), null);
});

test('optional observation refusal preserves a foreign wrapper and ordinary bootstrap', async () => {
  const prototype=R.Collider.prototype,original=prototype.setShape;
  let calls=0,world;
  const foreign=function(...args){calls++;return original.apply(this,args);};
  prototype.setShape=foreign;
  try {
    const loader=await import('../src/core/rapierCompatRuntime.js?orchard_observer_refusal');
    assert.equal(await loader.loadRapierCompatRuntime(),R);
    assert.equal(loader.orchardRapierBaseline(R),null);
    assert.equal(prototype.setShape,foreign);
    world=new R.World({x:0,y:0,z:0});
    const body=world.createRigidBody(R.RigidBodyDesc.fixed());
    const collider=world.createCollider(R.ColliderDesc.ball(1),body);
    assert.equal(collider.setShape(new R.Ball(2)),undefined);
    assert.equal(calls,1);assert.equal(collider.radius(),2);
  } finally {prototype.setShape=original;world?.free();}
});

test('retired world refuses before a raw native call', () => {
  const { world, body, lane } = fixture(), handle = body.handle;
  world.free();
  assert.throws(() => lane.rawRead('bodies', 'rbTranslation', handle), /orchard_native/);
});

test('baseline records are immutable and the observation lane rejects mutators', () => {
  const { world, body, lane } = fixture(), baseline = orchardRapierBaseline(R);
  try {
    assert.throws(() => { baseline.rows[0].descriptors = {}; }, TypeError);
    assert.throws(() => { baseline.rawMethods.bodies.rbTranslation = () => null; }, TypeError);
    assert.throws(() => lane.rawRead('bodies', 'rbSetTranslation', body.handle, 0, 0, 0, false), /read_only/);
    assert.deepEqual(lane.converted('bodies', 'rbTranslation', body.handle), { x: 7.25, y: 0, z: -12.5 });
  } finally { world.free(); }
});

test('runtime class accessors are refused without invoking the accessor', () => {
  const f = fixture(), copy = { ...R }; let calls = 0;
  assert.equal(Object.getOwnPropertyDescriptor(R, 'World').configurable, false);
  Object.defineProperty(copy, 'World', { configurable: true, get() { calls++; return R.World; } });
  try { assert.equal(createOrchardNativeLane(copy, f.world, orchardRapierBaseline(R)), null); assert.equal(calls, 0); }
  finally { f.world.free(); }
});

test('native object membership refuses an own getter surface without calling it', () => {
  const { world, body, lane } = fixture(); let calls = 0;
  body.translation = () => { calls++; return { x: 0, y: 0, z: 0 }; };
  try { assert.equal(lane.matchesObject('bodies', body, body.handle), false); assert.equal(calls, 0); }
  finally { delete body.translation; world.free(); }
});


test('actual normal owner inventory uses current local transforms after a jaw setter', async () => {
  const sim = createSimulation(), frame = sim.spawn({ type: 'wreck', pos: { x: 13200, z: 8300 }, rot: 0.713,
    radius: G.radius, hull: 300, physicsBody: orchardFrameBodySpec(), data: { orchardId: 'anvil_storm_orchard',
      orchardKind: 'frame', worldRecordId: G.worldRecordId, masslineTetherable: false, orchardCollars: createOrchardCollarState() } });
  const owner = await createSg02DynamicBodyOwner(); owner.syncFromEntities([frame]);
  const lane = createOrchardNativeLane(R, owner.world, orchardRapierBaseline(R));
  try {
    const observation = prepareOrchardNativeObservation(owner, lane), first = observation.scan();
    assert.equal(first.bodies.length, 1); assert.equal(first.bodies[0].colliders.length, 31);
    const collider = owner.records.get(frame.id).colliders.at(-1), last = first.bodies[0].colliders.at(-1);
    assert.ok(orchardColliderProjection(last, lane.constants, true).points.length >= 6);
    collider.setTranslationWrtParent({ x: 0.5, y: 0, z: 0.75 });
    const second = observation.scan();
    assert.deepEqual(second.bodies[0].colliders.at(-1).local, { x: 0.5, y: 0, z: 0.75 });
    assert.notDeepEqual(second.bodies[0].colliders.at(-1).local, last.local);
  } finally { owner.dispose(); sim.dispose(); }
});

for (const [x,z,yaw] of [[0,0,0],[13200,8300,0.713]]) test(`31-part source has thirty conservative paired slices at ${x},${z},${yaw}`, async () => {
  const sim=createSimulation(), frame=sim.spawn({type:'wreck',pos:{x,z},rot:yaw,radius:G.radius,hull:300,
    physicsBody:orchardFrameBodySpec(),data:{orchardId:'anvil_storm_orchard',orchardKind:'frame',worldRecordId:G.worldRecordId,
      masslineTetherable:false,orchardCollars:createOrchardCollarState()}});
  const owner=await createSg02DynamicBodyOwner(); owner.syncFromEntities([frame]);
  const lane=createOrchardNativeLane(R,owner.world,orchardRapierBaseline(R)), rec=owner.records.get(frame.id);
  try {
    let minimum=Infinity;
    for(let progress=1;progress<=30;progress++) {
      const moves=G.rigs.filter(r=>r.socket===1).map(r=>{
        const index=G.parts.findIndex(p=>p.id===r.partId),pose=orchardPartPose(index,[0,progress,0]);
        return {index,...pose,pivot:r.pivot,angle:r.yawSign*Math.PI/60};
      });
      const proof=orchardPairClearance(prepareOrchardNativeObservation(owner,lane).scan(),rec.body.handle,moves,lane.constants,G);
      assert.equal(proof.clear,true,JSON.stringify({progress,...proof})); minimum=Math.min(minimum,proof.minimum);
      for(const move of moves) {rec.colliders[move.index].setTranslationWrtParent(move.translation);rec.colliders[move.index].setRotationWrtParent(move.rotation);}
    }
    assert.ok(minimum>0);
  } finally {owner.dispose();sim.dispose();}
});


test('the final native scan never dispatches owner Map.get callbacks',async()=>{
 const sim=createSimulation(),frame=sim.spawn({type:'wreck',pos:{x:0,z:0},rot:0,radius:G.radius,hull:300,physicsBody:orchardFrameBodySpec(),data:{orchardId:'anvil_storm_orchard',orchardKind:'frame',worldRecordId:G.worldRecordId,masslineTetherable:false,orchardCollars:createOrchardCollarState()}});
 const owner=await createSg02DynamicBodyOwner();owner.syncFromEntities([frame]);
 const lane=createOrchardNativeLane(R,owner.world,orchardRapierBaseline(R)),prepared=prepareOrchardNativeObservation(owner,lane);let calls=0;
 const recordGet=owner.records.get,colliderGet=owner._colliderOwners.get;
 owner.records.get=function(...args){calls++;frame.hull=0;return recordGet.apply(this,args);};
 owner._colliderOwners.get=function(...args){calls++;frame.hull=0;return colliderGet.apply(this,args);};
 try {assert.equal(prepared.scan().bodies.length,1);assert.equal(calls,0);assert.equal(frame.hull,300);}
 finally{delete owner.records.get;delete owner._colliderOwners.get;owner.dispose();sim.dispose();}
});
