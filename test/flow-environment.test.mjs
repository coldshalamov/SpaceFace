import test from 'node:test';
import assert from 'node:assert/strict';
import { FlowEnvironment } from '../src/render/forceLanguage/flowEnvironment.js';
import { SpatialHash } from '../src/core/spatialHash.js';

const body = (id, x, z, extra = {}) => ({ id, type: 'asteroid', alive: true, collides: true,
  pos: { x, z }, radius: 5, vel: { x: 0, z: 0 }, data: {}, ...extra });
const stateFor = bodies => ({ simTime: 0, world: { frameOrigin: { x: 0, z: 0 } },
  entityList: bodies, entities: new Map(bodies.map(e => [e.id, e])) });
const ids = env => env.records.slice(0, env.count).map(r => r.id);

test('nearest surfaces select only three alive solids with stable identity ties', () => {
  const bodies = [body(9, 15, 0), body(3, -15, 0), body(5, 0, 15), body(1, 0, -15),
    body(40, 1, 0, { type: 'projectile' }), body(41, 1, 0, { type: 'bomb' }),
    body(42, 1, 0, { alive: false }), body(43, 1, 0, { radius: 0 }),
    body(44, 1, 0, { collides: false }), body(45, 1, 0, { active: false }), body(46, 500, 0)];
  const state = stateFor(bodies), env = new FlowEnvironment();
  const before = JSON.stringify(bodies);
  assert.equal(env.update(state, 0, 0, 40, 99), env);
  assert.deepEqual(ids(env), [1, 3, 5]);
  env.update(stateFor([...bodies].reverse()), 0, 0, 40, 99);
  assert.deepEqual(ids(env), [1, 3, 5]);
  env.update(state, 0, 0, 40, 1);
  assert.deepEqual(ids(env), [3, 5, 9]);
  assert.equal(JSON.stringify(bodies), before, 'presentation never mutates bodies');
});

test('spatial query uses world coordinates and catches a large body whose surface overlaps the field', () => {
  const bodies = [body(2, 1150, -2000, { radius: 140 }), body(3, 1040, -2000)];
  const state = stateFor(bodies);
  state.world.frameOrigin = { x: 1000, z: -2000 };
  state.spatialHash = new SpatialHash(64);
  state.spatialHash.rebuild(bodies);
  const env = new FlowEnvironment();
  env.update(state, 0, 0, 20, null);
  assert.deepEqual(ids(env), [2]);
  assert.equal(env.records[0].x, 150); assert.equal(env.records[0].z, 0);
  const calls = env.queryCount;
  env.update(state, 0, 0, 20, null);
  assert.equal(env.queryCount, calls, 'paused spatial selection sleeps');
});

test('cached selected anchors follow interpolation while selection stays cadenced', () => {
  const ship = body(2, 20, 0, { type: 'ship', prevPos: { x: 10, z: 0 }, vel: { x: 8, z: -2 } });
  const state = stateFor([ship]), env = new FlowEnvironment();
  env.update(state, 0, 0, 40, null, 0.25);
  const record = env.records[0];
  assert.equal(record.x, 12.5); assert.equal(record.material, 0);
  state.simTime = 0.03;
  env.update(state, 0, 0, 40, null, 0.75);
  assert.equal(env.queryCount, 1); assert.equal(env.records[0], record); assert.equal(record.x, 17.5);
  assert.deepEqual([record.vx, record.vz], [8, -2]);
  state.simTime = 0.09; env.update(state, 0, 0, 40, null, 1);
  assert.equal(env.queryCount, 2);
  ship.alive = false; env.update(state, 0, 0, 40, null, 1);
  assert.equal(env.count, 0, 'death removes cached influence immediately');
});

test('rebasing and rewind preserve world-space surface contact without stale influence', () => {
  const state = stateFor([body(7, 1015, 2040, { radius: 10, vel: { x: 0, z: 12 } })]);
  state.world.frameOrigin = { x: 1000, z: 2000 };
  const env = new FlowEnvironment(), a = {}, b = {};
  state.simTime = 10; env.update(state, 15, 40, 30, null);
  env.samplePoint(25, 40, a);
  assert.ok(a.dx > 0 && a.contact > 0 && a.dz > 0, 'normal push and tangent velocity both answer the surface');
  state.world.frameOrigin = { x: 1100, z: 2050 };
  env.update(state, -85, -10, 30, null);
  env.samplePoint(-75, -10, b);
  assert.deepEqual(a, b);
  state.simTime = 0; env.update(state, -85, -10, 30, null);
  assert.deepEqual(ids(env), [7]);
  assert.equal(env.queryCount, 3);
  env.update(state, 10000, 10000, 30, null);
  assert.equal(env.count, 0);
  assert.deepEqual(env.samplePoint(10000, 10000, b), { dx: 0, dz: 0, lift: 0, contact: 0, vx: 0, vz: 0 });
});

test('type-index and Map-only laboratory paths preserve materials and recycled identity', () => {
  const rock = body(3, 12, 0), ice = body(2, -12, 0, { data: { typeId: 'ast_icy' } });
  const station = body(1, 0, 12, { type: 'station' }), state = stateFor([rock, ice, station]);
  state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true,
    asteroids: [rock, ice], stations: [station], ships: [], wrecks: [] };
  Object.defineProperty(state, 'entityList', { get() { throw new Error('must use ready type index'); } });
  const env = new FlowEnvironment(); env.update(state, 0, 0, 30, null);
  assert.deepEqual(ids(env), [1, 2, 3]);
  assert.deepEqual(env.records.map(r => r.material), [3, 2, 1]);
  const replacement = body(1, 1000, 1000, { type: 'station' });
  state.entities.set(1, replacement); env.update(state, 0, 0, 30, null);
  assert.deepEqual(ids(env), [2, 3], 'stale type-array object cannot survive ID recycling');
  const mapOnly = { simTime: 0, entities: new Map([[3, rock], [2, ice]]) };
  env.update(mapOnly, 0, 0, 30, null);
  assert.deepEqual(ids(env), [2, 3]);
});

test('surface influence stays local and output records are reused through empty updates', () => {
  const env = new FlowEnvironment(), state = stateFor([body(1, 0, 0, { radius: 10 })]);
  env.update(state, 0, 0, 30, null);
  const records = env.records.slice(), out = {};
  assert.equal(env.samplePoint(10, 0, out), out);
  assert.ok(out.contact > 0 && out.dx > 0 && out.lift > 0);
  env.samplePoint(100, 0, out);
  assert.deepEqual(out, { dx: 0, dz: 0, lift: 0, contact: 0, vx: 0, vz: 0 });
  env.update(state, NaN, 0, 10, null);
  assert.equal(env.count, 0);
  for (let i = 0; i < records.length; i++) assert.equal(env.records[i], records[i]);
  assert.equal(env.clear(), env);
});
