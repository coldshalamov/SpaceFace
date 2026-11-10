import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { allocateEntityId, makeEntity } from '../src/core/entity.js';
import { createBus } from '../src/core/eventBus.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { emergentWeaponByKind } from '../src/data/emergentPrimitives.js';
import { emergentPrimitives, ensureEmergent, launchEmergent } from '../src/systems/emergentPrimitives.js';
const DT = 1 / 60;
function spawn(state, spec) {
  const body = makeEntity({ id: allocateEntityId(state), type: 'asteroid', pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, alive: true, collides: true, radius: 30, hull: 100, hullMax: 100,
    data: {}, flags: {}, ...spec });
  state.entities.set(body.id, body); state.entityList.push(body); return body;
}
async function fixture(run) {
  const state = createGameState(4242); state.mode = 'flight'; state.playerId = -1;
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT, publishTelemetry: false });
  emergentPrimitives.init({ state, bus: createBus(), helpers: {} });
  const step = count => { for (let i = 0; i < count; i++) { state.tick++; state.simTime = state.tick * DT;
    emergentPrimitives.update(DT, state); owner.syncFromEntities(state.entityList); owner.step(DT); } };
  try { await run(state, step); } finally { owner.dispose(); emergentPrimitives.destroy(); }
}
test('Mass Driver adds at least 100 WU/s to a radius-30 production rock', async () => fixture(async (state, step) => {
  const shooter = spawn(state, { type: 'ship', radius: 4, mass: 16, pos: { x: -100, z: 0 } });
  const rock = spawn(state, {}); assert.equal(resolvePhysicsBodySpec(rock).mass, 6750);
  launchEmergent(state, shooter, emergentWeaponByKind('mass'), 0);
  step(30); const speed = Math.hypot(rock.vel.x, rock.vel.z);
  assert.ok(speed >= 100, `Mass Driver produced ${speed}`);
}));
for (const kind of ['grav', 'polarity']) test(`${kind} halves a real rock pair's 100-unit gap in two seconds`, async () => fixture(async (state, step) => {
  const a = spawn(state, { pos: { x: -80, z: 0 } }); const b = spawn(state, { pos: { x: 80, z: 0 } });
  const world = ensureEmergent(state); world.hot = true;
  if (kind === 'grav') world.springs.push({ aId: a.id, bId: b.id, rest: 67.2, k: 48 });
  else { a.magneticCharge = 1; b.magneticCharge = -1; world.polarities.push({ hostId: a.id, charge: 1 }, { hostId: b.id, charge: -1 }); }
  step(120); const gap = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
  // A 100-unit skin-to-skin gap is 160 center-to-center for radius-30 rocks.
  assert.ok(gap <= 110, `${kind} center distance ${gap}`);
}));
test('Sticky Detonator throws a radius-30 rock rather than delivering a fighter-sized twitch', async () => fixture(async (state, step) => {
  const rock = spawn(state, {}); const world = ensureEmergent(state); world.hot = true;
  world.stickies.push({ hostId: rock.id, ox: -30, oz: 0, ownerId: -1, armed: true });
  state.input.actions = { chargeDetonate: true }; step(1); state.input.actions.chargeDetonate = false;
  assert.ok(Math.hypot(rock.vel.x, rock.vel.z) >= 40);
}));

for (const kind of ['grav', 'polarity']) test(`${kind} closes half a 100-unit rock-to-hull gap`, async () => fixture(async (state, step) => {
  const a = spawn(state, { pos: { x: -65, z: 0 } });
  const b = spawn(state, { type: 'ship', radius: 6, mass: 16, pos: { x: 71, z: 0 } });
  const world = ensureEmergent(state); world.hot = true;
  if (kind === 'grav') world.springs.push({ aId: a.id, bId: b.id, rest: 57.12, k: 48 });
  else { a.magneticCharge = 1; b.magneticCharge = -1; world.polarities.push({ hostId: a.id, charge: 1 }, { hostId: b.id, charge: -1 }); }
  step(120); const gap = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
  assert.ok(gap <= 86, `${kind} rock/hull center distance ${gap}`);
}));
