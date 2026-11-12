// Regression for the reported "world freezes while the CSS HUD stays smooth" tether failure:
// a standard Massline latched onto a box that is SPINNING (anchor orbits off-centre), reeled
// through the real attachment service and the real Rapier owner. The tick must keep producing
// finite transforms and bounded velocities, and an ordinary latch → reel → cut cycle must
// complete with a clean release. A per-step throw, NaN transform, or runaway impulse is what
// freezes world position updates while DOM presentation keeps animating.
import assert from 'node:assert/strict';
import test from 'node:test';

import { mulberry32 } from '../src/core/rng.js';
import { createBus } from '../src/core/eventBus.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';

const DT = 1 / 60;
const STEPS = 240;

function makeBody(id, type, x, z, extra = {}) {
  return {
    id, type, alive: true,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: extra.rot ?? 0,
    angVel: extra.angVel ?? 0,
    radius: extra.radius ?? 10,
    mass: extra.mass ?? 500,
    isPlayer: extra.isPlayer === true,
    physicsBody: extra.physicsBody
      ?? { dynamic: true, radius: extra.radius ?? 10, mass: extra.mass ?? 500 },
    data: extra.data || {},
  };
}

async function rig({ angVel, boxMass, boxRadius }) {
  const player = makeBody(1, 'ship', 0, 0, {
    radius: 8, mass: 120, isPlayer: true,
    physicsBody: { dynamic: true, radius: 8, mass: 120 },
  });
  const box = makeBody(2, 'pickup', 40, 0, {
    radius: boxRadius, mass: boxMass, angVel,
    physicsBody: { shape: 'box', radius: boxRadius, mass: boxMass, dynamic: true },
  });
  const state = {
    mode: 'flight', tick: 0, simTime: 0, seed: 4242, rng: mulberry32(4242),
    playerId: player.id,
    runtime: { features: PRODUCTION_FEATURES },
    world: { currentSectorId: 'sector_helios_prime' },
    entities: new Map([[player.id, player], [box.id, box]]),
    entityList: [player, box],
    input: { actions: {} },
    player: { tether: null },
  };
  ensureCombatState(state);
  const bus = createBus();
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  const attachments = createAttachmentService({
    state, catalog: createCombatCatalog(), helpers: { combatPhysics: owner }, bus,
  });
  return { state, bus, owner, attachments, player, box };
}

function assertFinite(entity, tick) {
  for (const key of ['pos', 'vel']) {
    assert.ok(Number.isFinite(entity[key].x) && Number.isFinite(entity[key].z),
      `entity ${entity.id} ${key} non-finite at tick ${tick}: ${JSON.stringify(entity[key])}`);
  }
  assert.ok(Number.isFinite(entity.rot) && Number.isFinite(entity.angVel),
    `entity ${entity.id} rotation non-finite at tick ${tick}`);
}

test('a standard tether reeled onto a spinning box stays finite and releases cleanly', async () => {
  const { state, owner, attachments, player, box } = await rig({ angVel: 6, boxMass: 8, boxRadius: 6 });
  try {
    owner.syncFromEntities([player, box]);
    const targetWorld = { x: box.pos.x + box.radius * 0.8, z: box.pos.z };
    const created = attachments.create({
      defId: 'tether_standard', ownerId: player.id, targetId: box.id,
      sourceWorld: { x: player.pos.x, z: player.pos.z }, targetWorld,
    });
    assert.equal(created.ok, true, `latch rejected: ${created.reason}`);

    let maxSpeed = 0, maxAng = 0;
    for (let tick = 0; tick < STEPS; tick++) {
      state.tick = tick;
      state.simTime = tick / 60;
      if (tick >= 30) attachments.reel(created.attachment.id, -0.5);
      attachments.reconcilePhysics();
      attachments.updateTelemetryAndBreak();
      owner.step(DT);
      for (const entity of [player, box]) {
        assertFinite(entity, tick);
        maxSpeed = Math.max(maxSpeed, Math.hypot(entity.vel.x, entity.vel.z));
        maxAng = Math.max(maxAng, Math.abs(entity.angVel));
      }
      const telemetry = created.attachment;
      if (telemetry.lastTension != null) assert.ok(Number.isFinite(telemetry.lastTension), 'tension NaN');
      if (telemetry.lastYank != null) assert.ok(Number.isFinite(telemetry.lastYank), 'yank NaN');
    }
    assert.equal(created.attachment.state, 'active',
      `the standard line must not fail-closed-break under a spinning load; state=${created.attachment.state}`);
    assert.ok(maxSpeed < 600, `runaway velocity from the spinning anchor: ${maxSpeed}`);
    assert.ok(maxAng <= 6.25, `the yaw-rate ceiling must hold; got ${maxAng}`);

    const released = attachments.cut(created.attachment.id, player.id, 'pilot_cut');
    assert.equal(released.ok, true, `pilot cut failed: ${released.reason}`);
    for (let tick = STEPS; tick < STEPS + 30; tick++) {
      state.tick = tick;
      state.simTime = tick / 60;
      attachments.reconcilePhysics();
      attachments.updateTelemetryAndBreak();
      owner.step(DT);
      assertFinite(player, tick);
      assertFinite(box, tick);
    }
    assert.notEqual(created.attachment.state, 'active',
      'the cut line must leave the active set');
    assert.ok(Math.hypot(player.vel.x, player.vel.z) < 600,
      'release must not invent launch velocity');
  } finally {
    owner.dispose();
  }
});

test('a heavy spinning box on the same line stays bounded', async () => {
  const { state, owner, attachments, player, box } = await rig({ angVel: 5, boxMass: 60, boxRadius: 6 });
  try {
    owner.syncFromEntities([player, box]);
    const created = attachments.create({
      defId: 'tether_standard', ownerId: player.id, targetId: box.id,
      sourceWorld: { x: player.pos.x, z: player.pos.z },
      targetWorld: { x: box.pos.x + box.radius * 0.8, z: box.pos.z },
    });
    assert.equal(created.ok, true, `latch rejected: ${created.reason}`);
    for (let tick = 0; tick < STEPS; tick++) {
      state.tick = tick;
      state.simTime = tick / 60;
      if (tick >= 60) attachments.reel(created.attachment.id, -0.5);
      attachments.reconcilePhysics();
      attachments.updateTelemetryAndBreak();
      owner.step(DT);
      assertFinite(player, tick);
      assertFinite(box, tick);
    }
    assert.equal(created.attachment.state, 'active');
    assert.ok(Math.abs(box.angVel) <= 6.25, `spin runaway: ${box.angVel}`);
  } finally {
    owner.dispose();
  }
});
