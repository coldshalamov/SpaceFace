import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { makeEntity, allocateEntityId } from '../src/core/entity.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { resolvePhysicsBodySpec, queuePhysicsImpulse, readExternalPhysicsFeedback } from '../src/core/physicsAuthority.js';
import { PLAYER_EXTERNAL_RESPONSE } from '../src/core/physicalResponse.js';
import { deliverPhysicalAcceleration, deliverPhysicalImpulse, queryPhysicalBodies } from '../src/combat/physicalEffects.js';
import { normalizeField, sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { FIELD_DEFS } from '../src/data/fields.js';
import { insertAsteroidFieldRock } from '../src/world/asteroidField.js';
const DT = 1 / 60;
function spawn(state, spec = {}) {
  const entity = makeEntity({ id: allocateEntityId(state), type: 'asteroid', radius: 30, pos: { x: 80, z: 0 }, vel: { x: 0, z: 0 }, alive: true, collides: true, data: {}, ...spec });
  state.entityList.push(entity); state.entities.set(entity.id, entity); return entity;
}
async function lab(callback) {
  const state = createGameState(2468); state.mode = 'flight'; state.playerId = -1;
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT, publishTelemetry: false });
  const step = (before) => { state.tick++; state.simTime = state.tick * DT; before?.(); owner.syncFromEntities(state.entityList); owner.step(DT); };
  try { await callback(state, owner, step); } finally { owner.dispose(); }
}
test('cone clears production rocks and released rocks retain their earned momentum', async () => {
  for (const [radius, minimum] of [[16, 60], [30, 40], [44, 35]]) await lab((state, owner, step) => {
    const rock = spawn(state, { radius }); const field = normalizeField({ ...FIELD_DEFS.cone, center: { x: 0, z: 0 }, dir: { x: 1, z: 0 } });
    for (let i = 0; i < 30; i++) step(() => {
      const profile = { type: rock.type, radius, mass: resolvePhysicsBodySpec(rock).mass };
      const a = sampleFieldAcceleration(rock.pos, rock.vel, [field], state.simTime, profile);
      deliverPhysicalAcceleration(state, rock, { x: a.ax, z: a.az }, DT, null, { coupleEnvironment: false });
    });
    assert.ok(rock.vel.x >= minimum, `r${radius}: ${rock.vel.x}`);
    const release = rock.pos.x; for (let i = 0; i < 120; i++) step();
    assert.ok(rock.pos.x - release >= radius * 2);
  });
});
test('overlapping external effects obey the player budget and deliberate propulsion bypasses it', async () => lab((state, owner, step) => {
  const player = spawn(state, { type: 'ship', radius: 4, mass: 16, isPlayer: true, pos: { x: 0, z: 0 } }); state.playerId = player.id;
  step(() => { for (let i = 0; i < 10; i++) deliverPhysicalImpulse(state, player, { x: 1600, z: 0 }); });
  assert.ok(player.vel.x <= PLAYER_EXTERNAL_RESPONSE.impulseBudget + 0.001);
  assert.ok(player.vel.x >= 23.99, 'a blast must produce a noticeable backward shove');
  assert.equal(readExternalPhysicsFeedback(player).deltaX, 24);
  assert.equal(player.angVel, 0);
  const before = player.vel.x; step(() => queuePhysicsImpulse(player, { x: 160, z: 0 }, { motionIntent: 'player_maneuver' }));
  assert.ok(player.vel.x >= before + 9.99);
}));
test('continuous external acceleration is capped jointly while leaving fields noticeable', async () => lab((state, owner, step) => {
  const player = spawn(state, { type: 'ship', radius: 4, mass: 16, isPlayer: true, pos: { x: 0, z: 0 } }); state.playerId = player.id;
  step(() => { for (let i = 0; i < 5; i++) deliverPhysicalAcceleration(state, player, { x: 1000, z: 0 }, DT); });
  assert.ok(player.vel.x <= PLAYER_EXTERNAL_RESPONSE.maxAcceleration * DT + 0.001);
  assert.ok(player.vel.x >= 0.79);
}));
test('anchored recoil uses the native pose, respects limits and settles', async () => lab((state, owner, step) => {
  const station = spawn(state, { type: 'station', radius: 40, pos: { x: 0, z: 0 } });
  step(() => deliverPhysicalImpulse(state, station, { x: 1600, z: 0 }));
  assert.ok(station.pos.x > 0); let maxOffset = 0, maxSpeed = 0;
  for (let i = 0; i < 90; i++) { step(); maxOffset = Math.max(maxOffset, Math.hypot(station.pos.x, station.pos.z)); maxSpeed = Math.max(maxSpeed, Math.hypot(station.vel.x, station.vel.z)); }
  assert.ok(maxOffset <= 3.001); assert.ok(maxSpeed <= 8.001); assert.ok(Math.abs(station.pos.x) < 0.02);
  const rec = owner.records.get(station.id); assert.ok(Math.abs(rec.body.translation().x - station.pos.x) < 0.001);
  assert.equal(station.rot, 0);
}));
test('fallback physical query rejects off-volume bodies and accepts skin intersections', () => {
  const state = createGameState(1); const near = spawn(state, { pos: { x: 120, z: 0 } }); spawn(state, { pos: { x: 1000, z: 0 } });
  assert.deepEqual(queryPhysicalBodies(state, { x: 0, z: 0 }, 100, {}, []).map(e => e.id), [near.id]);
});

test('indexed physical query never scans entityList: hash bodies, a loose pickup, a compact rock', () => {
  const state = createGameState(7); state.playerId = -1;
  const mint = (spec) => {
    const entity = makeEntity({ alive: true, collides: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {}, ...spec });
    state.entities.set(entity.id, entity);
    return entity;
  };
  const ship = mint({ id: allocateEntityId(state), type: 'ship', radius: 3, mass: 16, pos: { x: 5, z: 0 } });
  const outlier = mint({ id: allocateEntityId(state), type: 'ship', radius: 3, mass: 16, pos: { x: 500, z: 0 } });
  const pickup = mint({ id: allocateEntityId(state), type: 'pickup', radius: 1, collides: false, pos: { x: 50, z: 0 } });
  const rockId = allocateEntityId(state);
  insertAsteroidFieldRock(state, { id: rockId, pos: { x: 30, z: 0 }, radius: 6 });
  state.spatialHash = {
    diagnostics: { activeBuckets: 1 },
    queryRadius(x, z, radius, out) { out.push(ship, outlier); return out; },
  };
  state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true,
    pickups: [pickup], wrecks: [], payloads: [], mines: [], ships: [ship, outlier] };
  const scanned = [];
  Object.defineProperty(state, 'entityList', {
    configurable: true,
    get() {
      return new Proxy([], {
        get(target, prop) {
          if (prop === Symbol.iterator) throw new Error('entityList must not be scanned');
          scanned.push(prop);
          return Reflect.get(target, prop);
        },
      });
    },
  });
  const helpers = { spawnEntity(spec) { const entity = makeEntity(spec); state.entities.set(entity.id, entity); return entity; } };
  const bodies = queryPhysicalBodies(state, { x: 0, z: 0 }, 100, helpers, []);
  assert.deepEqual(bodies.map(e => e.id), [ship.id, rockId, pickup.id]);
});
