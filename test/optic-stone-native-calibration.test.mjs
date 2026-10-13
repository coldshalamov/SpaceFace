import assert from 'node:assert/strict';
import test from 'node:test';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { physics } from '../src/core/physics.js';
import { queuePhysicsImpulse, resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { asteroidColliderRadius } from '../src/data/asteroidColliders.js';
import { OPTIC_LATTICE_SPACING } from '../src/combat/opticField.js';
import { compileOpticCells, compileOpticStructure, opticScatterFuseCells, CERES_PRISM_GALLERY_ID } from '../src/data/opticStructures.js';
import { world as worldSystem } from '../src/systems/world.js';
import { ensureAsteroidField, insertAsteroidFieldRock, promoteAsteroidFieldRock } from '../src/world/asteroidField.js';

function fixture() {
  const state = { tick: 0, simTime: 0, meta: { seed: 4242 }, world: {}, entities: new Map(), entityList: [] };
  const helpers = { spawnEntity(spec) {
    const e = { alive: true, rot: 0, angVel: 0, ...spec, vel: { x: 0, z: 0, ...spec.vel } };
    state.entities.set(e.id, e); state.entityList.push(e); return e;
  } };
  return { state, helpers };
}

function insertBodies(h, bodies, id = 'fixture-lattice') {
  for (const body of bodies) insertAsteroidFieldRock(h.state, {
    id: 110 + body.index, pos: { x: 155.8 + body.x, z: -726.9 + body.z },
    radius: body.radius, mass: 200 + body.radius * 40, angVel: 0, hull: 1e6, hullMax: 1e6,
    data: { typeId: body.typeId, opticMaterial: body.material, opticStructureId: id,
      opticCell: `${body.ix},${body.iz}`, opticLatticeSpacing: body.latticeSpacing },
  });
}

test('canonical compiler pitch reaches world field records and is regenerated without altering recipe geometry', () => {
  const h = fixture(); const cells = opticScatterFuseCells(() => 0.99);
  const spec = { id: 'fixture-world-fuse', origin: { x: 155.8, z: -726.9 }, heading: Math.PI, cells };
  const system = Object.create(worldSystem); system.state = h.state;
  system._toGlobal = p => p; system._opticScatterSpecs = () => [spec];
  const stamp = () => system._ensureOpticStructures({ id: 'fixture-sector' }, { fields: [{}] });
  stamp();
  const bodies = compileOpticStructure(spec);
  assert.equal(h.state.world.asteroidField.rocks.length, bodies.length);
  for (const row of h.state.world.asteroidField.rocks) assert.equal(row.data.opticLatticeSpacing, OPTIC_LATTICE_SPACING);
  const positions = h.state.world.asteroidField.rocks.map(row => row.pos);
  h.state.world.asteroidField = undefined;
  stamp();
  assert.deepEqual(h.state.world.asteroidField.rocks.map(row => row.pos), positions);
  for (const row of h.state.world.asteroidField.rocks) assert.equal(row.data.opticLatticeSpacing, OPTIC_LATTICE_SPACING,
    'recipe re-entry recreates pitch; world saves regenerate these field bodies');
});

test('compiled, field-restored optic stones start without penetration or solver launch and still answer impulses', async () => {
  for (const pitch of [OPTIC_LATTICE_SPACING, 56, 96]) {
    const h = fixture(); const cells = opticScatterFuseCells(() => 0.99);
    const bodies = compileOpticCells(cells, pitch, Math.PI);
    insertBodies(h, bodies);
    // Compact field rows are plain save-safe records; hydration reconstructs runtime maps.
    h.state.world.asteroidField = JSON.parse(JSON.stringify({ schema: h.state.world.asteroidField.schema,
      rocks: h.state.world.asteroidField.rocks, version: h.state.world.asteroidField.version }));
    ensureAsteroidField(h.state);
    for (const row of h.state.world.asteroidField.rocks) {
      assert.equal(row.data.opticLatticeSpacing, pitch);
      promoteAsteroidFieldRock(h.state, row.id, h.helpers, 'optic-approach');
    }
    const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
    try {
      owner.syncFromEntities(h.state.entityList);
      const masses = new Map(h.state.entityList.map(e => [e.id, owner.records.get(e.id).body.mass()]));
      for (const e of h.state.entityList) {
        const body = bodies.find(b => b.index === e.id - 110);
        assert.equal(e.radius, body.radius, 'visual/reference radius remains authored');
        assert.equal(e.mass, 200 + body.radius * 40); assert.equal(e.data.opticMaterial, body.material);
        assert.equal(resolvePhysicsBodySpec(e).dynamic, true, 'stones remain physical moving bodies');
        assert.equal(e.physicsBody.radius, body.material === 'stone' ? Math.min(body.radius, pitch / 2) : body.radius);
        const oldSpec = resolvePhysicsBodySpec({ type: 'asteroid', radius: body.radius, mass: e.mass,
          data: e.data, physicsBody: { radius: body.radius } });
        assert.equal(e.physicsBody.mass, oldSpec.mass, 'solver mass retains the previous authored stone policy');
        assert.equal(e.physicsBody.inertiaY, oldSpec.inertiaY, 'solver inertia retains the previous authored stone policy');
        assert.ok(Math.abs(masses.get(e.id) - oldSpec.mass) < 1e-4, 'actual native mass is preserved too');
      }
      for (let i = 0; i < h.state.entityList.length; i++) for (let j = i + 1; j < h.state.entityList.length; j++) {
        const a = h.state.entityList[i], b = h.state.entityList[j];
        assert.ok(Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) + 1e-8 >= a.physicsBody.radius + b.physicsBody.radius,
          'initial native colliders do not interpenetrate');
      }
      for (let tick = 1; tick <= 20; tick++) owner.step(1 / 60, tick);
      for (const e of h.state.entityList) assert.ok(Math.hypot(e.vel.x, e.vel.z) < 1e-4,
        `pitch ${pitch}: no uncommanded native launch for ${e.id}`);
      const stone = h.state.entityList.find(e => e.data.opticMaterial === 'stone');
      queuePhysicsImpulse(stone, { x: 0, z: masses.get(stone.id) * 5 }, { kind: 'weapon', tick: 21 });
      owner.step(1 / 60, 21);
      assert.ok(Math.hypot(stone.vel.x, stone.vel.z) > 1, 'later external impulse still moves the stone');
      assert.equal(owner.records.get(stone.id).body.mass(), masses.get(stone.id), 'native mass remains unchanged');
    } finally { owner.dispose(); }
  }
});

test('canonical older caches calibrate while unknown caches, generic ore and nonstone optics retain their collider policy', () => {
  const rows = [
    { opticStructureId: CERES_PRISM_GALLERY_ID, opticMaterial: 'stone', expected: 32 },
    { opticStructureId: 'scatter:sector_helios_core:0', opticMaterial: 'stone', expected: 32 },
    { opticStructureId: 'custom-unknown', opticMaterial: 'stone', expected: 34 },
    { opticStructureId: 'custom', opticLatticeSpacing: 90, opticMaterial: 'stone', expected: 34 },
    { opticStructureId: 'custom', opticLatticeSpacing: 50, opticMaterial: 'stone', expected: 25 },
    { opticStructureId: 'custom', opticLatticeSpacing: 50, opticMaterial: 'metal', expected: 34 },
    { opticStructureId: 'custom', opticLatticeSpacing: 50, opticMaterial: 'diamond', expected: 34 },
    { opticMaterial: 'stone', expected: asteroidColliderRadius('ast_common_rock', 34) },
  ];
  for (const { expected, ...data } of rows) {
    const h = fixture(); const row = insertAsteroidFieldRock(h.state, { id: 1, radius: 34, pos: { x: 0, z: 0 },
      data: { typeId: 'ast_common_rock', ...data } });
    const e = promoteAsteroidFieldRock(h.state, row.id, h.helpers);
    assert.equal(e.physicsBody.radius, expected); assert.equal(e.radius, 34);
  }
});

test('only actual optic projectiles use the authored structure receiver; ore and kinetic shots retain asset proxies', () => {
  const target = makeEntity({ id: 117, type: 'asteroid', pos: { x: 0, z: 0 }, radius: 16, collides: true,
    data: { typeId: 'ast_metallic', opticStructureId: 'fixture-mirror', opticMaterial: 'metal' } });
  const projectile = makeEntity({ id: 400, type: 'projectile', pos: { x: 15, z: 0 }, radius: 0.7,
    vel: { x: 0, z: 300 }, ownerId: 900, collides: true, data: { damageType: 'energy' } });
  const host = Object.create(physics); const state = { world: {}, entities: new Map(), entityList: [] };
  host.init({ state, bus: createBus(), helpers: {} });
  const start = { x: 15, z: -20 }, end = { x: 15, z: 0 };
  const hit = () => {
    assert.equal(host._bestProjectileTarget(projectile, start, end, [target], null, true), target);
    return { ...host._bestSegmentHitScratch };
  };
  const circleZ = -Math.sqrt((16 + 0.7) ** 2 - 15 ** 2);
  assert.ok(Math.abs(hit().z - circleZ) < 1e-6, 'optic energy contact uses the recipe reference circle');
  projectile.data = { kind: 'missile', damageType: 'kinetic' };
  assert.ok(Math.abs(hit().z - circleZ) < 1e-6, 'ordnance uses the existing optic grammar too');
  for (const [data, projectileData] of [
    [{ typeId: 'ast_metallic' }, { damageType: 'energy' }],
    [{ typeId: 'ast_metallic', opticMaterial: 'metal' }, { damageType: 'energy' }],
    [{ typeId: 'ast_metallic', opticStructureId: 'fixture-mirror', opticMaterial: 'metal' }, { damageType: 'kinetic' }],
    [{ typeId: 'ast_metallic', opticStructureId: 'fixture-mirror', opticMaterial: 'unknown' }, { damageType: 'energy' }],
  ]) {
    target.data = data; projectile.data = projectileData;
    assert.ok(Math.abs(hit().z - circleZ) > 1, 'generic/tag-only/kinetic targets keep the exact asset proxy');
  }
});
