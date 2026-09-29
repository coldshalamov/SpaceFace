// Model substance truth (Rapier SG-02 live collider truth): MODEL_SUBSTANCE_TABLE in
// src/data/modelTruth.js must match the live defaults in src/core/physicsAuthority.js
// (defaultDynamic/defaultMaterial/ensurePhysicsBodySpec) and the verified ghost bits
// (sg02 CONTACT_MATERIALS + contactMaterialFor: debris false, rock false, pickup true).
// Pure-data contract: frozen rows, no rng, no side effects.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODEL_SUBSTANCE_TABLE,
} from '../src/data/modelTruth.js';
import {
  ensurePhysicsBodySpec,
  isDynamicPhysicsBodyEntity,
  substanceFor,
} from '../src/core/physicsAuthority.js';

function entityFor(type, data = {}) {
  return {
    type,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    radius: 7,
    mass: type === 'pickup' ? 0.1 : 24,
    data,
  };
}

// Expected live substance per table row, expressed as entity fixtures. The chunk row is
// the isChunk asteroid; the plain rock row is the non-chunk asteroid.
const EXPECTED = {
  ship_light: { entity: entityFor('ship'), shape: 'capsule', material: 'ship', dynamic: true, sensor: false },
  ship_medium: { entity: entityFor('ship'), shape: 'capsule', material: 'ship', dynamic: true, sensor: false },
  ship_heavy: { entity: entityFor('ship'), shape: 'capsule', material: 'ship', dynamic: true, sensor: false },
  drone: { entity: entityFor('drone'), shape: 'capsule', material: 'ship', dynamic: true, sensor: false },
  rock: { entity: entityFor('asteroid'), shape: 'ball', material: 'rock', dynamic: true, sensor: false },
  chunk: { entity: entityFor('asteroid', { isChunk: true }), shape: 'ball', material: 'rock', dynamic: true, sensor: false },
  wreck: { entity: entityFor('wreck'), shape: 'ball', material: 'debris', dynamic: true, sensor: false },
  pickup: { entity: entityFor('pickup'), shape: 'ball', material: 'sensor', dynamic: true, sensor: true },
  station: { entity: entityFor('station'), shape: 'ball', material: 'station', dynamic: false, sensor: false },
  payload: { entity: entityFor('payload'), shape: 'ball', material: 'payload', dynamic: true, sensor: false },
  projectile: { entity: entityFor('projectile'), shape: 'ball', material: 'projectile', dynamic: true, sensor: false },
};

test('MODEL_SUBSTANCE_TABLE matches live physicsAuthority defaults per type', () => {
  for (const [key, expected] of Object.entries(EXPECTED)) {
    const row = MODEL_SUBSTANCE_TABLE[key];
    assert.ok(row, `table has row ${key}`);
    const live = substanceFor(expected.entity);
    assert.equal(live.shape, row.shape, `${key} shape`);
    assert.equal(live.material, row.material, `${key} material`);
    assert.equal(live.dynamic, row.dynamic, `${key} dynamic`);
    assert.equal(live.sensor, row.sensor, `${key} sensor`);
    assert.equal(live.shape, expected.shape, `${key} expected shape`);
    assert.equal(live.material, expected.material, `${key} expected material`);
    assert.equal(live.dynamic, expected.dynamic, `${key} expected dynamic`);
    assert.equal(live.sensor, expected.sensor, `${key} expected sensor`);
  }
});

test('stamped wreck spawn resolves capsule debris like the live fracture body', () => {
  const stamped = entityFor('wreck');
  stamped.physicsBody = { shape: 'capsule' };
  const live = substanceFor(stamped);
  assert.equal(live.shape, 'capsule');
  assert.equal(live.material, 'debris');
  assert.equal(live.dynamic, true);
  assert.equal(live.sensor, false);
});

test('substanceFor agrees with ensurePhysicsBodySpec and isDynamicPhysicsBodyEntity', () => {
  for (const expected of Object.values(EXPECTED)) {
    const entity = expected.entity;
    const viaReader = substanceFor(entity);
    const spec = ensurePhysicsBodySpec({ ...entity, physicsBody: entity.physicsBody });
    assert.equal(spec.shape, viaReader.shape, `${entity.type} shape matches spec`);
    assert.equal(spec.material, viaReader.material, `${entity.type} material matches spec`);
    assert.equal(spec.dynamic, viaReader.dynamic, `${entity.type} dynamic matches spec`);
    assert.equal(isDynamicPhysicsBodyEntity(entity), viaReader.dynamic, `${entity.type} dynamic matches predicate`);
  }
});

test('MODEL_SUBSTANCE_TABLE is frozen pure data', () => {
  assert.ok(Object.isFrozen(MODEL_SUBSTANCE_TABLE));
  for (const row of Object.values(MODEL_SUBSTANCE_TABLE)) {
    assert.ok(Object.isFrozen(row));
  }
});

// CHUNK-RETIREMENT INVARIANT (documented, no behavior change — mining.js is outside this
// packet's edit list, so this lives here as the contract a future hook must satisfy):
// a mined-out asteroid parent corpse (alive:false + data.respawnAt, set in mining.js
// _releaseOre → world respawn-timer repopulation) coexists with its fracture chunks, which
// carry isChunk:true but no respawnAt and no parent link — they persist as ordinary mineable
// asteroids until mined out themselves. Intended hook signature, if ever wired at the
// fracture site BEFORE data.respawnAt is set:
//   retireAsteroidChunks(state, parentEntity) => void
// must not touch the parent corpse or its respawn timer, and must no-op when the parent has
// no live isChunk children. Wiring it needs a focused test: parent respawns on timer AND no
// orphan chunk survives the window.
test('chunk fixtures carry no respawn timer or parent link (retirement invariant)', () => {
  const chunk = entityFor('asteroid', { isChunk: true });
  assert.equal(chunk.data.respawnAt, undefined);
  assert.equal(chunk.data.parentId, undefined);
  assert.equal(substanceFor(chunk).dynamic, true);
});

test('landmark rocks, gates, and giant asteroids (>90 WU) resolve as fixed bodies', () => {
  const landmarkRock = entityFor('asteroid', { isLandmark: true });
  assert.equal(substanceFor(landmarkRock).dynamic, false);
  assert.equal(isDynamicPhysicsBodyEntity(landmarkRock), false);

  const giantRock = { ...entityFor('asteroid'), radius: 110 };
  assert.equal(substanceFor(giantRock).dynamic, false);
  assert.equal(isDynamicPhysicsBodyEntity(giantRock), false);

  const gate = entityFor('station', { isGate: true, placeId: 'place_gate_jump_ring' });
  assert.equal(substanceFor(gate).dynamic, false);
  assert.equal(isDynamicPhysicsBodyEntity(gate), false);
});

test('volume-proportional mass table scales dynamic bodies with volume', () => {
  const smallRock = entityFor('asteroid');
  smallRock.radius = 4;
  delete smallRock.mass;
  const smallSpec = ensurePhysicsBodySpec(smallRock);
  assert.equal(smallSpec.mass, 16); // 0.25 * 4^3

  const medRock = entityFor('asteroid');
  medRock.radius = 8;
  delete medRock.mass;
  const medSpec = ensurePhysicsBodySpec(medRock);
  assert.equal(medSpec.mass, 128); // 0.25 * 8^3

  const standardRock = entityFor('asteroid');
  standardRock.radius = 12;
  delete standardRock.mass;
  const stdSpec = ensurePhysicsBodySpec(standardRock);
  assert.equal(stdSpec.mass, 432); // 0.25 * 12^3
});

