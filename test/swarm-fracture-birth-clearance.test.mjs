// Bounded CPU/native birth fixtures, not a full Swarm run or performance claim.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { mulberry32 } from '../src/core/rng.js';
import { createRunState } from '../src/core/runState.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { articulatedColliderRadius } from '../src/core/articulatedColliderBounds.js';
import { swarmArena, SWARM_DEBRIS_TAG } from '../src/systems/swarmArena.js';

const DT = 1 / 60;
function fixture(seed = 4242) {
  const sim = createSimulation({ seed, systems: [], updateOrder: [] });
  sim.state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed });
  sim.state.run.phase = 'active'; sim.state.run.wave = 1;
  const parent = sim.spawn({ type: 'asteroid', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 30, mass: 5000, hull: 3, hullMax: 400, collides: true, angVel: 0,
    physicsBody: { radius: 34.8 }, data: { typeId: 'ast_common_rock', size: 30,
      oreHP: 3, miningWear: 0.75, [SWARM_DEBRIS_TAG]: true } });
  sim.state.rng = mulberry32(seed); // ordinary seeded stream at this explicit fracture edge
  const arena = Object.create(swarmArena);
  Object.assign(arena, { state: sim.state, bus: sim.bus, helpers: sim.helpers, _ids: [], registry: null });
  const children = () => sim.state.entityList.filter(e => e.alive && e.data?.isChunk);
  return { sim, parent, arena, children };
}

// The pre-existing authored RNG recipe: six draws, two size/mass/spin intents.
function authoredBirth(seed) {
  const rng = mulberry32(seed), rows = [];
  for (let i = 0; i < 2; i++) {
    const a = rng() * Math.PI * 2, radius = Math.max(6, 30 * (0.42 + rng() * 0.08));
    const distance = 30 * 0.55 + radius;
    rows.push({ pos: { x: Math.cos(a) * distance, z: Math.sin(a) * distance },
      radius, mass: Math.round(radius * radius * 5), spin: (rng() - 0.5) * 0.3 });
  }
  return { rows, rng: rng.getState() };
}

test('two actual native fragments start clear without a solver impulse; authored physical intents remain', async () => {
  const h = fixture(), expected = authoredBirth(4242);
  const native = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    assert.equal(h.arena._fractureDebris(h.parent), true);
    const children = h.children(); assert.equal(children.length, 2);
    assert.deepEqual(h.sim.state.rng.getState(), expected.rng);
    children.forEach((e, i) => {
      assert.equal(e.radius, expected.rows[i].radius); assert.equal(e.mass, expected.rows[i].mass);
      assert.equal(e.angVel, expected.rows[i].spin);
      assert.equal(e.vel.x, 0); assert.equal(e.vel.z, 0);
      assert.equal(e.data.yieldU, 2); assert.equal(e.data.tetherPayload, true);
    });
    native.syncFromEntities(children);
    const records = children.map(e => native.records.get(e.id));
    for (const a of records[0].colliders) for (const b of records[1].colliders) {
      assert.equal(a.contactCollider(b, 0), null, 'actual measured native shapes do not penetrate at birth');
    }
    let impacts = 0, maxSpeed = 0;
    for (let tick = 1; tick <= 12; tick++) {
      native.step(DT, tick); impacts += native.drainContactImpacts().length;
      for (const e of children) maxSpeed = Math.max(maxSpeed, Math.hypot(e.vel.x, e.vel.z));
    }
    assert.equal(impacts, 0); assert.equal(maxSpeed, 0);
    assert.ok(children.some(e => Math.abs(e.angVel) > 0.05), 'the repair does not suppress authored spin');
  } finally { native.dispose(); h.sim.dispose(); }
});

test('already-clear original fragment poses and six-draw RNG state are retained', () => {
  const h = fixture(1), expected = authoredBirth(1);
  try {
    assert.equal(h.arena._fractureDebris(h.parent), true);
    h.children().forEach((e, i) => {
      assert.equal(e.pos.x, expected.rows[i].pos.x); assert.equal(e.pos.z, expected.rows[i].pos.z);
    });
    assert.deepEqual(h.sim.state.rng.getState(), expected.rng);
  } finally { h.sim.dispose(); }
});

test('fresh native crowd bounds refuse the pair atomically; ordinary later contact can retry', async () => {
  const h = fixture(), native = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const blocker = h.sim.spawn({ type: 'wreck', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      radius: 1, mass: 1e6, hull: 1000, collides: true,
      physicsBody: { schemaVersion: 1, shape: 'ball', radius: 1, dynamic: false, mass: 1e6 }, data: {} });
    native.syncFromEntities([h.parent, blocker]);
    h.arena.registry = { get: name => name === 'physics' ? { _sg02: native } : null };
    const record = native.records.get(blocker.id), collider = record.colliders[0];
    assert.ok(articulatedColliderRadius(record) < 2);
    const cachedShape = collider.shape;
    const cachedRadius = cachedShape.radius;
    // Explicit native-geometry fixture: cold metadata and the collector cache are
    // deliberately stale; the birth owner must use the actual current SDK shape.
    collider.setRadius(240);
    assert.equal(cachedShape.radius, cachedRadius);
    const before = { hull: h.parent.hull, oreHP: h.parent.data.oreHP,
      wear: h.parent.data.miningWear, life: h.parent.occupantGeneration };
    const impact = tick => h.arena._onDebrisImpact({ aId: h.parent.id, bId: blocker.id,
      dp: 99999, preSolveClosingSpeed: 80, tick }); // staged real-handler receipt
    impact(100);
    assert.equal(h.parent.alive, true); assert.equal(h.children().length, 0);
    assert.deepEqual({ hull: h.parent.hull, oreHP: h.parent.data.oreHP,
      wear: h.parent.data.miningWear, life: h.parent.occupantGeneration }, before);
    assert.equal(h.arena._ids.length, 0, 'no single child is dropped into a refused pair');
    blocker.alive = false; native.syncFromEntities([h.parent]);
    impact(111);
    assert.equal(h.parent.alive, false); assert.equal(h.children().length, 2);
    native.syncFromEntities(h.children());
    const [a, b] = h.children().map(e => native.records.get(e.id));
    for (const ca of a.colliders) for (const cb of b.colliders) assert.equal(ca.contactCollider(cb, 0), null);
  } finally { native.dispose(); h.sim.dispose(); }
});
