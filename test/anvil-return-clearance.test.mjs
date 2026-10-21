import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { anvilReceiverFixture } from './fixtures/anvil-receiver-native.mjs';
import { ANVIL_WORK, anvilArcTarget, anvilBandExitTarget, anvilCollectionTarget } from '../src/systems/anvilWork.js';
import { proxyOuterRadiusWu, resolveCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';

// Three-tick production fixture supplies real actor/catalog proxy definitions.
// Poses below are explicit controller inputs, not an earned fullshift route proof.
let f, original, gate, center, gateAngle, clearance;
before(async () => {
  f = await anvilReceiverFixture(); original = f.actor('collector'); gate = f.state.entities.get(3);
  assert.equal(gate.data.stationId, 'station_customs');
  center = original.data.itinerary.center;
  gateAngle = Math.atan2(gate.pos.z - center.z, gate.pos.x - center.x);
  clearance = proxyOuterRadiusWu(resolveCollisionProxyManifest(original), original)
    + proxyOuterRadiusWu(resolveCollisionProxyManifest(gate), gate);
});
after(() => f?.close());
const point = (angle, radius) => ({ x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius });
const worker = (angle = gateAngle + .3, radius = ANVIL_WORK.berthRadius) => ({ ...original,
  pos: point(angle, radius), vel: { x: 0, z: 0 }, data: { ...original.data,
    itinerary: { ...original.data.itinerary, phase: 'return' } } });
const state = (...entities) => ({ ...f.state, entityList: entities });
function segmentMiss(a, b, p) {
  const dx = b.x-a.x, dz = b.z-a.z, n = dx*dx+dz*dz;
  const t = n ? Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.z-a.z)*dz)/n)) : 0;
  return Math.hypot(a.x+t*dx-p.x,a.z+t*dz-p.z);
}

test('actual return controller steers outside the Customs Gate hull instead of through it', () => {
  const c = original, angle = gateAngle + .3;
  c.pos = point(angle, ANVIL_WORK.berthRadius); c.vel = { x: 0, z: 0 };
  c.rot = angle - Math.PI/2; c.data.itinerary.phase = 'return';
  const pose = JSON.stringify(c.pos), cargo = JSON.stringify(c.data.cargoManifest);
  f.owner._stepAnvilWork(1/60, f.state);
  const aim = c.data.intent.aimAngle;
  const target = { x: c.pos.x + Math.cos(aim)*1200, z: c.pos.z + Math.sin(aim)*1200 };
  assert.ok(segmentMiss(c.pos, target, gate.pos) > clearance);
  assert.equal(JSON.stringify(c.pos), pose); assert.equal(JSON.stringify(c.data.cargoManifest), cargo);
  assert.equal(c.data.itinerary.phase, 'return');
});

for (const sign of [-1, 1]) test(`outer arc's incoming chords clear the gate in direction ${sign}`, () => {
  const c = worker(gateAngle - sign*.8);
  for (let step=0;step<=16;step++) {
    const angle = gateAngle + sign*(-.8 + step*.1);
    c.pos = anvilArcTarget(state(gate), c, angle, 2800);
    const target = anvilArcTarget(state(gate), c, angle + sign*.22, 2800);
    assert.ok(segmentMiss(c.pos, target, gate.pos) > clearance, `angle ${angle}`);
  }
});

test('unobstructed lanes and the receiving forecourt retain their exact authored radii', () => {
  const c = worker(0,980);
  assert.deepEqual(anvilBandExitTarget(c,state()),point(0,2640));
  assert.deepEqual(anvilArcTarget(state(),c,1.2,2800),point(1.2,2800));
  assert.deepEqual(anvilCollectionTarget(state(),c),point(-.22,980));
});

test('radial clear-band exit goes around the gate rather than targeting beyond it', () => {
  const c = worker(gateAngle,980), target = anvilBandExitTarget(c,state(gate));
  assert.ok(Math.abs(Math.hypot(target.x-center.x,target.z-center.z)-980)<1e-8);
  assert.ok(Math.atan2(target.z-center.z,target.x-center.x)<gateAngle);
  assert.ok(segmentMiss(c.pos,target,gate.pos)>clearance);
  c.pos=point(gateAngle-.3,980);
  assert.deepEqual(anvilBandExitTarget(c,state(gate)),point(gateAngle-.3,2800));
});

test('admitted native fixed pose and frame origin win over stale entity pose', () => {
  const c=worker(), stale={...gate,pos:point(0,8000)}, origin={x:10000,z:4000};
  const native={getFrameOrigin:()=>origin,records:new Map([[stale.id,{entity:stale,body:{isDynamic:()=>false,
    translation:()=>({x:gate.pos.x-origin.x,z:gate.pos.z-origin.z}),isEnabled:()=>true,isValid:()=>true}}]])};
  assert.deepEqual(anvilArcTarget(state(stale),c,gateAngle,2800,native),anvilArcTarget(state(gate),c,gateAngle,2800));
  native.records.get(stale.id).entity={...stale};
  assert.deepEqual(anvilArcTarget(state(stale),c,gateAngle,2800,native),point(gateAngle,2800));
});

test('dead, noncolliding and native dynamic obstacles do not create fixed detours', () => {
  const c=worker();
  for(const flag of [{alive:false},{collides:false}])
    assert.deepEqual(anvilArcTarget(state({...gate,...flag}),c,gateAngle,2800),point(gateAngle,2800));
  const native={records:new Map([[gate.id,{entity:gate,body:{isDynamic:()=>true,translation:()=>gate.pos}}]])};
  assert.deepEqual(anvilArcTarget(state(gate),c,gateAngle,2800,native),point(gateAngle,2800));
});

test('overlapping fixed envelopes blend by max, independent of entity order', () => {
  const c=worker(), other={...gate,id:987,pos:point(gateAngle+.15,2860)};
  assert.deepEqual(anvilArcTarget(state(gate,other),c,gateAngle,2800),anvilArcTarget(state(other,gate),c,gateAngle,2800));
});

test('return from an outer detour also sees solids between the worker and nominal lane', () => {
  const c=worker(gateAngle+.3,3250), other={...gate,pos:point(gateAngle,3100)};
  const target=anvilArcTarget(state(other),c,gateAngle,2800);
  assert.ok(Math.hypot(target.x-center.x,target.z-center.z)>3100+clearance);
});

test('invalid arc input refuses a target without mutating entities', () => {
  const c=worker(), before=JSON.stringify(c);
  for(const radius of [NaN,Infinity,0,-1]) assert.equal(anvilArcTarget(state(gate),c,gateAngle,radius),null);
  assert.equal(anvilArcTarget(state(gate),c,NaN,2800),null);
  assert.equal(JSON.stringify(c),before);
});


test('an outward detour cannot target inside a second fixed landmark', () => {
 const c=worker(), outer={...gate,id:987,pos:point(gateAngle,3100)};
 const target=anvilArcTarget(state(gate,outer),c,gateAngle,2800);
 assert.ok(Math.hypot(target.x-outer.pos.x,target.z-outer.pos.z)>clearance);
 assert.deepEqual(target,anvilArcTarget(state(outer,gate),c,gateAngle,2800));
});

test('a safe detoured start cannot cut through an intermediate fixed landmark', () => {
 const c=worker(0,3000), obstacle={...gate,pos:point(-.05,3000)};
 const target=anvilArcTarget(state(obstacle),c,-.22,2800);
 assert.ok(segmentMiss(c.pos,target,obstacle.pos)>clearance);
});

test('an intermediate clear-band waypoint cannot complete the radial exit', () => {
 const c=original;c.pos=point(gateAngle,980);c.vel={x:0,z:0};c.data.itinerary.phase='clear_band';
 const lateral=anvilBandExitTarget(c,state(gate));
 c.pos={...lateral}; // Explicit arrival-at-waypoint controller input, not gameplay movement.
 f.owner._stepAnvilWork(1/60,f.state);
 assert.equal(c.data.itinerary.phase,'clear_band');
 assert.ok(Math.hypot(c.pos.x-center.x,c.pos.z-center.z)<1100);
 assert.equal(c.data.cargoManifest.totalQty,0);
});

test('no clear local segment returns no target instead of forcing a crossing', () => {
 const c=worker(), occupied={...gate,pos:{...c.pos}};
 assert.equal(anvilArcTarget(state(occupied),c,gateAngle,2800),null);
});
