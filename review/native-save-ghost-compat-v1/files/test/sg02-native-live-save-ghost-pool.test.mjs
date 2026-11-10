import test from 'node:test';
import assert from 'node:assert/strict';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { save } from '../src/save/saveSystem.js';
const clone = x => JSON.parse(JSON.stringify(x)), DT = 1 / 60;
function actor(id = 1, x = 0, life = id) {
  return { id, occupantGeneration: life, type: 'ship', alive: true, isPlayer: id === 1,
    hull: 100, hullMax: 100, radius: 3, mass: 24, pos: { x, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 }, rot: 0, angVel: 0,
    data: { defId: 'ship_kestrel' }, flags: { persistent: true },
    physicsBody: { schemaVersion: 1, radius: 3, mass: 24, inertiaY: 48,
      dynamic: true, shape: 'ball', ccd: false, revision: 0 } };
}
function projectile(id, life = id) {
  const e = actor(id, 500 + id, life);
  e.type = 'projectile'; e.isPlayer = false; e.data = {}; e.flags = {};
  e.physicsBody.material = 'projectile'; e.vel.x = 10;
  return e;
}
async function fixture({ retired = 2, stepped = true } = {}) {
  const live = actor(), shots = Array.from({ length: retired }, (_, i) => projectile(2 + i, 11 + i));
  const source = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  source.syncFromEntities([live, ...shots]); source.step(DT);
  for (const shot of shots) shot.alive = false;
  source.syncFromEntities([live]);
  if (stepped) source.step(DT);
  return { source, live, shots, payload: clone(source.exportWorldSnapshot()) };
}
const pools = owner => [...owner._ghostProjectilePool].map(([key, entries]) => ({ key,
  entries: entries.map(e => ({handle:String(e.body.handle), colliderHandles:e.colliders.map(c=>String(c.handle)), origin:clone(e.origin)})) }));

for (const stepped of [false, true]) test(`retired pool keeps exact native handles, lives, LIFO order and reuse (${stepped ? 'propagated' : 'pending'} disable)`, async () => {
  const f = await fixture({ stepped }), target = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const current = clone(f.live);
    assert.equal(target.adoptWorldSnapshot(f.payload, [current]), true);
    assert.deepEqual(pools(target), pools(f.source));
    assert.equal(target.world.bodies.len(), 3); assert.equal(target.records.size, 1);
    assert.equal(target._colliderOwners.size, 1);
    assert.equal(f.source.canonicalizeWorldSnapshot(f.payload), true);
    const handles = f.payload.ghostPools[0].entries.map(e => e.handle);
    const a = projectile(2, 40), b = projectile(3, 41), ca = clone(a), cb = clone(b);
    f.source.syncFromEntities([f.live, a]); target.syncFromEntities([current, ca]);
    assert.equal(String(target.records.get(2).body.handle), handles[1]);
    f.source.syncFromEntities([f.live, a, b]); target.syncFromEntities([current, ca, cb]);
    assert.equal(String(target.records.get(3).body.handle), handles[0]);
    for (let i=0;i<30;i++) { f.source.step(DT); target.step(DT); }
    assert.deepEqual(target.quantizedSnapshot(), f.source.quantizedSnapshot());
    assert.deepEqual([current,ca,cb].map(e=>[e.pos,e.vel,e.rot]),[f.live,a,b].map(e=>[e.pos,e.vel,e.rot]));
    a.alive = ca.alive = false;
    f.source.syncFromEntities([f.live,b]); target.syncFromEntities([current,cb]);
    assert.equal(pools(target)[0].entries[0].origin.life, 40, 'reused handle must retire with its new occupant life');
    assert.deepEqual(pools(target), pools(f.source));
  } finally { f.source.dispose(); target.dispose(); }
});

for (const [name, mutate] of [
  ['missing descriptor', p => delete p.ghostPools],
  ['non-array descriptor', p => p.ghostPools = {}],
  ['duplicate bucket', p => p.ghostPools.push(clone(p.ghostPools[0]))],
  ['duplicate native handle', p => p.ghostPools[0].entries[1].handle=p.ghostPools[0].entries[0].handle],
  ['invalid generation', p => p.ghostPools[0].entries[0].origin.life=-1],
  ['missing provenance', p => delete p.ghostPools[0].entries[0].origin],
  ['active native handle alias', p => p.ghostPools[0].entries[0].handle=p.bodies['1'].handle],
  ['wrong bucket shape', p => p.ghostPools[0].key='forged'],
  ['wrong collider handle', p => p.ghostPools[0].entries[0].colliderHandles=['999']],
  ['forged solid material', p => p.ghostPools[0].entries[0].origin.contract.spec.material='default'],
  ['forged current policy', p => p.ghostPools[0].entries[0].origin.contract.material.ghost=false],
]) test(`malformed pool ${name} refuses atomically`, async () => {
  const f = await fixture(), target = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const sentinel = actor(90,900,90); target.syncFromEntities([sentinel]);
    const oldWorld = target.world, oldRecords = target.records, oldPools=target._ghostProjectilePool;
    mutate(f.payload);
    assert.equal(target.adoptWorldSnapshot(f.payload, [clone(f.live)]), false);
    assert.equal(target.world,oldWorld);assert.equal(target.records,oldRecords);assert.equal(target._ghostProjectilePool,oldPools);
    target.step(DT); assert.equal(target.records.get(90).body.isValid(),true);
  } finally { f.source.dispose(); target.dispose(); }
});

test('a genuinely foreign disabled native body is never accepted as a retired pool member',async()=>{
  const f=await fixture(), target=await createSg02DynamicBodyOwner({publishTelemetry:false});
  try {
    const foreign=f.source.world.createRigidBody(f.source.RAPIER.RigidBodyDesc.dynamic().setEnabled(false));
    const payload=f.source.exportWorldSnapshot(); assert.ok(payload);
    assert.equal(target.adoptWorldSnapshot(payload,[clone(f.live)]),false);
    assert.equal(f.source.canonicalizeWorldSnapshot(payload),false);
    assert.equal(foreign.isValid(),true,'refusal may not discard unknown native ownership');
  }finally{f.source.dispose();target.dispose();}
});

test('same-life spec replacement preserves both retired native generations with their creation contracts',async()=>{
  const source=await createSg02DynamicBodyOwner({publishTelemetry:false}),target=await createSg02DynamicBodyOwner({publishTelemetry:false});
  try{
    const e=projectile(2,9);source.syncFromEntities([e]);
    const first=String(source.records.get(2).body.handle);
    e.physicsBody.radius=4;e.physicsBody.revision=1;source.syncFromEntities([e]);
    const second=String(source.records.get(2).body.handle);assert.notEqual(second,first);
    e.physicsBody.radius=5;e.physicsBody.revision=2;source.syncFromEntities([e]);
    const payload=source.exportWorldSnapshot();assert.equal(payload.ghostPools.flatMap(p=>p.entries).length,2);
    assert.equal(target.adoptWorldSnapshot(payload,[clone(e)]),true);
    assert.deepEqual(pools(target),pools(source));
    assert.equal(source.canonicalizeWorldSnapshot(payload),true);
  }finally{source.dispose();target.dispose();}
});

test('retirement preserves creation-time source life despite in-place reuse of the mutable entity object',async()=>{
  const source=await createSg02DynamicBodyOwner({publishTelemetry:false});
  try{
    const e=projectile(2,9);source.syncFromEntities([e]);
    e.id=99;e.occupantGeneration=100;e.data.defId='changed-after-native-creation';
    source.syncFromEntities([]);
    const origin=[...source._ghostProjectilePool.values()].flat()[0].origin;
    assert.equal(origin.entityId,'2');assert.equal(origin.life,9);assert.equal(origin.identity.defId,null);
  }finally{source.dispose();}
});

test('in-place projectile mass update retires into the matching pool with refreshed contract and unchanged origin life',async()=>{
  const source=await createSg02DynamicBodyOwner({publishTelemetry:false}),target=await createSg02DynamicBodyOwner({publishTelemetry:false});
  try{
    const ship=actor(),e=projectile(2,9);source.syncFromEntities([ship,e]);
    const handle=source.records.get(2).body.handle;
    e.physicsBody.mass=30;e.physicsBody.inertiaY=60;e.physicsBody.revision=1;source.syncFromEntities([ship,e]);
    assert.equal(source.records.get(2).body.handle,handle);
    e.alive=false;source.syncFromEntities([ship]);
    const payload=source.exportWorldSnapshot(),entry=payload.ghostPools.find(p=>p.entries.length).entries[0];
    assert.equal(entry.origin.life,9);assert.equal(entry.origin.contract.spec.mass,30);
    assert.equal(target.adoptWorldSnapshot(payload,[clone(ship)]),true);
    const next=projectile(3,10);next.physicsBody.mass=30;next.physicsBody.inertiaY=60;next.physicsBody.revision=1;
    target.syncFromEntities([clone(ship),next]);assert.equal(target.records.get(3).body.handle,handle);
  }finally{source.dispose();target.dispose();}
});

test('failed publication after pool validation keeps old native owner and every pool entry alive',async()=>{
  const f=await fixture();try{
    const old=f.source.world, before=pools(f.source), original=f.source._commitNativeOwner;
    f.source._commitNativeOwner=()=>{throw new Error('publication refused');};
    assert.equal(f.source.canonicalizeWorldSnapshot(f.payload),false);
    f.source._commitNativeOwner=original;
    assert.equal(f.source.world,old);assert.deepEqual(pools(f.source),before);
    assert.ok([...f.source._ghostProjectilePool.values()].flat().every(e=>e.body.isValid()));
  }finally{f.source.dispose();}
});

async function liveFixture() {
  const sim=createSimulation({seed:47,systems:[physics,combat,save]});sim.state.mode='flight';
  sim.state.settings.gameplay.physicsBackend='rapier-dynamic';
  const player=sim.spawn(actor());sim.state.playerId=player.id;
  const shots=[sim.spawn(projectile(2)),sim.spawn(projectile(3))];
  const phys=sim.registry.get('physics'),saver=sim.registry.get('save');
  assert.equal(await phys.prepareBackend(sim.state),true);
  sim.step(DT);
  for(const shot of shots)shot.alive=false;
  sim.step(DT);sim.step(DT);
  assert.equal([...phys._sg02._ghostProjectilePool.values()].flat().length,2);
  return {sim,phys,saver};
}
test('actual Save/Continue preserves allocator free-list, fresh lives, reused ghost handles and exact continuation',async()=>{
  const a=await liveFixture(),b=await liveFixture();
  try {
    const savedA=a.saver.serialize('continue'),savedB=b.saver.serialize('reload');
    assert.ok(savedA.data.physics);assert.ok(savedB.data.physics);
    assert.equal(savedB.data.physics.ghostPools[0].entries.length,2);
    assert.equal(b.saver.loadEnvelope(savedB,'reload'),true);
    assert.deepEqual(b.sim.state.physicsRuntime.nativeRestore,{mode:'native',exact:true,reason:null});
    assert.deepEqual(b.sim.state.freeIds,a.sim.state.freeIds);
    assert.equal(b.sim.state.nextEntityId,a.sim.state.nextEntityId);
    assert.equal(b.sim.state.nextOccupantGeneration,a.sim.state.nextOccupantGeneration);
    assert.deepEqual(pools(b.phys._sg02),pools(a.phys._sg02));
    const newA=[a.sim.spawn(projectile(8)),a.sim.spawn(projectile(9))];
    const newB=[b.sim.spawn(projectile(8)),b.sim.spawn(projectile(9))];
    assert.deepEqual(newB.map(e=>[e.id,e.occupantGeneration]),newA.map(e=>[e.id,e.occupantGeneration]));
    for(let i=0;i<30;i++){a.sim.step(DT);b.sim.step(DT);}
    assert.deepEqual(b.phys._sg02.quantizedSnapshot(),a.phys._sg02.quantizedSnapshot());
    assert.deepEqual(newB.map(e=>[e.pos,e.vel,e.rot]),newA.map(e=>[e.pos,e.vel,e.rot]));
    assert.deepEqual(newB.map(e=>b.phys._sg02.records.get(e.id).body.handle),newA.map(e=>a.phys._sg02.records.get(e.id).body.handle));
  }finally{a.phys._sg02?.dispose();b.phys._sg02?.dispose();a.sim.dispose();b.sim.dispose();}
});

test('live Save forwards current attachment policy and refused canonicalization cannot publish exact native state',async()=>{
  const a=await liveFixture();try{
    const target=a.sim.spawn({...actor(9,60,9),isPlayer:false});a.sim.step(DT);
    const result=a.sim.registry.get('combat').kernel.attachments.create({defId:'tether_standard',ownerId:a.sim.state.playerId,targetId:target.id});
    assert.equal(result.ok,true);
    const before=a.phys._sg02.world,payload=a.saver.serialize('live-policy');
    assert.ok(payload.data.physics);assert.notEqual(a.phys._sg02.world,before);
    assert.equal(a.phys._sg02.attachments.size,1);
    const good=a.phys._sg02.world,helper=a.phys.helpers.describeCombatPhysicsAttachment;
    a.phys.helpers.describeCombatPhysicsAttachment=()=>null;
    assert.equal(a.phys.serialize(),null);assert.equal(a.phys._sg02.world,good);
    a.phys.helpers.describeCombatPhysicsAttachment=helper;
    assert.equal(a.saver.loadEnvelope(payload,'live-policy'),true);
    assert.equal(a.sim.state.physicsRuntime.nativeRestore.exact,true);
  }finally{a.phys._sg02?.dispose();a.sim.dispose();}
});
