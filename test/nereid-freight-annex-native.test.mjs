// Selected world/economy/claims/Save/physics owners, not a full production boot.
// Cargo stock, dock latch, player spawn and sector entry are explicit fixture inputs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { economy } from '../src/systems/economy.js';
import { claims } from '../src/systems/claims.js';
import { addCargo } from '../src/systems/cargo.js';
import { save } from '../src/save/saveSystem.js';

const SECTOR = 'sector_nereid_shoal';
const STATION = 'station_nereid';
const EXPECTED = {
  place_freight_platform: { x: 37912, z: 12128, colliders: 12, width: 22.1701, depth: 11.1285 },
  place_container_rack: { x: 37962, z: 12108, colliders: 24, width: 13.7653, depth: 8.7794 },
};

function closeTo(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 0.01, `${label}: ${actual} versus ${expected}`);
}

function capsuleBounds(colliders) {
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const collider of colliders) {
    const p = collider.translation(), q = collider.rotation(), shape = collider.shape;
    assert.equal(typeof shape.halfHeight, 'number');
    assert.equal(typeof shape.radius, 'number');
    // Rapier capsules extend along local +Y; rotate their spine into the world frame.
    const ex = Math.abs(2 * (q.x * q.y - q.z * q.w)) * shape.halfHeight + shape.radius;
    const ez = Math.abs(2 * (q.y * q.z + q.x * q.w)) * shape.halfHeight + shape.radius;
    bounds.minX = Math.min(bounds.minX, p.x - ex);
    bounds.maxX = Math.max(bounds.maxX, p.x + ex);
    bounds.minZ = Math.min(bounds.minZ, p.z - ez);
    bounds.maxZ = Math.max(bounds.maxZ, p.z + ez);
  }
  return bounds;
}

function fixture() {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    get length() { return storage.size; },
    key: i => [...storage.keys()][i] ?? null,
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: key => storage.delete(key),
  } });
  const sim = createSimulation({ seed: 4242, systems: [world, economy, claims, physics, save] });
  const { state } = sim;
  state.mode = 'flight';
  state.onboarding = { active: false, finished: true };
  state.playerId = sim.spawn({ type: 'ship', team: 0, hull: 100, pos: { x: 0, z: 0 } }).id;
  Object.assign(state.player.cargo, { capVolume: 1000, capMass: 1000 });
  sim.registry.get('world').enterSector(SECTOR);
  Object.assign(state.ui, { docked: true, dockedStationId: STATION });
  return {
    sim, state,
    annex: () => state.world.dressing.rows.filter(row => row.alive !== false && row.data?.nereidFreightAnnex),
    close() {
      try { sim.dispose(); } finally {
        if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
        else delete globalThis.localStorage;
      }
    },
  };
}

const annexRecords = native => [...native.records.values()].filter(record => record.entity?.data?.nereidFreightAnnex);

test('earned Nereid annex has measured native fixed bodies, deduplicates and disappears on older Save', async () => {
  const t = fixture();
  try {
    const physicsOwner = t.sim.registry.get('physics');
    const saveOwner = t.sim.registry.get('save');
    const claimsOwner = t.sim.registry.get('claims');
    assert.equal(await physicsOwner.prepareBackend(t.state), true);
    assert.ok(physicsOwner._sg02, 'selected Rapier backend exists');
    assert.equal(t.annex().length, 0);
    assert.equal(saveOwner.save('quick'), true, 'save the pre-earn world');

    assert.equal(addCargo(t.state, 'cmdty_food', 150), 150);
    assert.equal(t.sim.registry.get('economy').handleTrade('cmdty_food', 'sell', 150).ok, true);
    // Docking freezes full-tick systems. Resume ordinary physics through the fixture's undock input.
    t.state.ui.docked = false;
    t.sim.step();
    const rows = t.annex();
    assert.equal(rows.length, 2);
    const native = physicsOwner._sg02;
    const measurements = [];
    for (const row of rows) {
      const expected = EXPECTED[row.data.placeId];
      assert.ok(expected, 'only the two authored annex parts exist');
      const record = native.records.get(row.id);
      assert.ok(record, 'dressing row entered the actual native registry');
      assert.equal(record.spec.dynamic, false);
      assert.equal(record.body.isFixed(), true);
      assert.equal(record.colliders.length, expected.colliders);
      assert.equal(record.proxyId, row.data.collisionProxy);
      closeTo(row.pos.x, expected.x, 'authored global X');
      closeTo(row.pos.z, expected.z, 'authored global Z');
      const at = record.body.translation(), frame = native.getFrameOrigin();
      closeTo(at.x + frame.x, row.pos.x, 'native global X');
      closeTo(at.z + frame.z, row.pos.z, 'native global Z');
      const bounds = capsuleBounds(record.colliders);
      closeTo(bounds.maxX - bounds.minX, expected.width, 'native capsule union width');
      closeTo(bounds.maxZ - bounds.minZ, expected.depth, 'native capsule union depth');
      assert.ok(bounds.minX >= at.x - row.radius && bounds.maxX <= at.x + row.radius);
      assert.ok(bounds.minZ >= at.z - row.radius && bounds.maxZ <= at.z + row.radius);
      measurements.push({ placeId: row.data.placeId, pos: row.pos, colliders: record.colliders.length, bounds });
    }

    const ids = rows.map(row => row.id);
    for (let i = 0; i < 3; i++) {
      claimsOwner._stampAllStationGrowth();
      t.sim.step();
    }
    assert.deepEqual(t.annex().map(row => row.id), ids);
    assert.equal(annexRecords(native).length, 2);
    assert.equal(annexRecords(native).reduce((count, record) => count + record.colliders.length, 0), 36);

    assert.equal(await saveOwner.load('quick'), true);
    assert.equal(t.annex().length, 0);
    assert.equal(await physicsOwner.prepareBackend(t.state), true);
    t.state.ui.docked = false;
    t.sim.step();
    assert.equal(annexRecords(physicsOwner._sg02).length, 0, 'older Save removes native projection bodies');
    console.log('NEREID_NATIVE_PROOF ' + JSON.stringify({ measurements, postOldSaveBodies: 0 }));
  } finally {
    t.close();
  }
});
