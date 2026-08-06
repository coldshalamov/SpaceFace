import assert from 'node:assert/strict';
import test from 'node:test';

import { createCombatCatalog } from '../src/combat/runtime.js';
import { restoreCombatState, serializeCombatState } from '../src/combat/persistence.js';
import { validateCombatCatalog } from '../src/combat/validate.js';
import { createBus } from '../src/core/eventBus.js';
import {
  normalizePhysicsBodyResponse,
  readPhysicsTelemetry,
  writePhysicsBodyResponse,
} from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  PINNED_STATUS_ID,
  STATUS_DEFS,
  UNMOORED_STATUS_ID,
} from '../src/data/combatDefs.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { actions } from '../src/systems/actions.js';
import { fields } from '../src/systems/fields.js';
import { physics } from '../src/core/physics.js';

test('SG-02 applies and restores transient mass response without changing authored motion state', async () => {
  const entity = bodyEntity(1, 20, 100, { x: 11, z: -4 });
  const owner = await createSg02DynamicBodyOwner({ fixedDt: SIM_DT, quantum: 1e-5 });
  try {
    owner.syncFromEntities([entity]);
    owner.step(SIM_DT);
    const record = owner.records.get(entity.id);
    const body = record.body;
    const earnedVelocity = { ...entity.vel };

    assert.deepEqual(normalizePhysicsBodyResponse({ massScale: 99, inertiaScale: 0.01 }), {
      massScale: 8,
      inertiaScale: 0.25,
    }, 'the membrane bounds authored response without inventing a movement command');

    writePhysicsBodyResponse(entity, { massScale: 6, inertiaScale: 6 });
    owner.step(SIM_DT);
    assert.equal(owner.records.get(entity.id).body, body, 'mass response preserves the live body');
    assert.ok(Math.abs(body.mass() - 120) < 1e-4);
    assert.ok(Math.abs(body.principalInertia().y - 600) < 1e-4);
    assert.equal(entity.physicsBody.mass, 20, 'transient response does not rewrite authored/save mass');
    assert.equal(entity.physicsBody.inertiaY, 100);
    assert.deepEqual(entity.vel, earnedVelocity, 'changing effective mass does not rewrite velocity');

    owner.step(SIM_DT);
    assert.ok(Math.abs(body.mass() - 20) < 1e-4, 'the first tick without a response restores authored mass');
    assert.ok(Math.abs(body.principalInertia().y - 100) < 1e-4);
    assert.deepEqual(entity.vel, earnedVelocity, 'restoring mass also preserves earned velocity');
  } finally {
    owner.dispose();
  }
});

test('Pinned and Unmoored are mutually exclusive, bounded physics-response status definitions', () => {
  const pinned = STATUS_DEFS.find((entry) => entry.id === PINNED_STATUS_ID);
  const unmoored = STATUS_DEFS.find((entry) => entry.id === UNMOORED_STATUS_ID);
  assert.ok(pinned && unmoored);
  assert.deepEqual(pinned.effects.physicsResponse, { massScale: 6, inertiaScale: 6 });
  assert.deepEqual(unmoored.effects.physicsResponse, { massScale: 0.3, inertiaScale: 0.3 });
  assert.deepEqual(pinned.effects.blockedActionTags, undefined, 'Pinned does not suppress controls');
  assert.deepEqual(unmoored.effects.blockedActionTags, undefined, 'Unmoored does not suppress controls');
  assert.ok(pinned.interactions.some((entry) => entry.with === UNMOORED_STATUS_ID && entry.consumeWith));
  assert.ok(unmoored.interactions.some((entry) => entry.with === PINNED_STATUS_ID && entry.consumeWith));
  assert.equal(validateCombatCatalog(createCombatCatalog()).ok, true);

  const invalidStatuses = STATUS_DEFS.map((entry) => entry.id === PINNED_STATUS_ID
    ? { ...entry, effects: { physicsResponse: { massScale: 0 } } }
    : entry);
  const invalid = validateCombatCatalog(createCombatCatalog({ statuses: invalidStatuses }));
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((error) => error.includes('physicsResponse.massScale')));
});

test('player Well pins and Repulsor unmoors a non-owner through the production status/physics route', async () => {
  await withFieldsEnabled(async () => {
    const sim = createSimulation({
      seed: 26029,
      bus: createBus(),
      systems: [actions, fields, physics],
    });
    const { state } = sim;
    state.mode = 'flight';
    state.input.actions = {};
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    const player = sim.spawn(shipSpec(1, 0, 0, 28, 88));
    const target = sim.spawn(shipSpec(2, 300, 80, 40, 160));
    target.flags.persistent = true;
    state.playerId = player.id;
    const physicsSystem = sim.registry.get('physics');
    assert.equal(await physicsSystem.prepareBackend(state), true);

    try {
      state.input.aimWorld = { x: 300, z: 0 };
      state.input.actions.deployWell = true;
      sim.step();
      sim.step();

      let targetRuntime = state.combat.entities[String(target.id)];
      let playerRuntime = state.combat.entities[String(player.id)];
      assert.ok(targetRuntime.statuses[PINNED_STATUS_ID], 'the landed Well creates a simulation state');
      assert.equal(targetRuntime.statuses[PINNED_STATUS_ID].attackerId, player.id);
      assert.equal(targetRuntime.statuses[UNMOORED_STATUS_ID], undefined);
      assert.equal(playerRuntime.statuses[PINNED_STATUS_ID], undefined, 'the deploying owner is not secretly pinned');
      assert.ok(Math.abs(readPhysicsTelemetry(target).mass - 240) < 1e-4);

      const saved = serializeCombatState(state);
      const restoredPlayer = bodyEntity(player.id, 28, 88);
      const restoredTarget = bodyEntity(target.id, 40, 160);
      restoredTarget.flags.persistent = true;
      const restored = stateFor(restoredPlayer, restoredTarget, state.tick);
      restoreCombatState(restored, saved, (ref) => {
        if (ref && ref.kind === 'player') return restoredPlayer.id;
        if (ref && ref.kind === 'persistent' && ref.saveId === String(restoredTarget.id)) return restoredTarget.id;
        return null;
      });
      assert.ok(restored.combat.entities[String(restoredTarget.id)].statuses[PINNED_STATUS_ID],
        'the explicit state survives Continue on a persistent body');

      target.pos.x = 60;
      target.pos.z = 0;
      target.vel.x = 0;
      target.vel.z = 0;
      target.flags.noInterp = true;
      state.fields.cooldowns.repulsor = 0;
      state.input.actions.deployRepulsor = true;
      sim.step();
      sim.step();

      targetRuntime = state.combat.entities[String(target.id)];
      playerRuntime = state.combat.entities[String(player.id)];
      assert.equal(targetRuntime.statuses[PINNED_STATUS_ID], undefined, 'opposite polarity removes Pinned');
      assert.ok(targetRuntime.statuses[UNMOORED_STATUS_ID]);
      assert.equal(playerRuntime.statuses[UNMOORED_STATUS_ID], undefined, 'the deploying owner is not secretly lightened');
      assert.ok(Math.abs(readPhysicsTelemetry(target).mass - 12) < 1e-4);
    } finally {
      if (typeof physicsSystem._disableSg02DynamicAuthority === 'function') {
        physicsSystem._disableSg02DynamicAuthority();
      }
    }
  });
});

function bodyEntity(id, mass, inertiaY, vel = { x: 0, z: 0 }) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: id === 1 ? 0 : 1,
    collides: true,
    radius: 10,
    mass,
    pos: { x: 0, z: 0 },
    vel: { x: vel.x, z: vel.z },
    rot: 0,
    angVel: 0,
    hull: 200,
    hullMax: 200,
    shield: 0,
    shieldMax: 0,
    armorHp: 0,
    armorMax: 0,
    cap: 100,
    capMax: 100,
    flags: {},
    physicsBody: {
      schemaVersion: 1,
      radius: 10,
      mass,
      inertiaY,
      dynamic: true,
      ccd: true,
      material: 'ship',
      revision: 0,
    },
    data: { combatProfileId: 'combat_profile_standard_ship' },
  };
}

function shipSpec(id, x, z, mass, inertiaY) {
  const entity = bodyEntity(id, mass, inertiaY);
  entity.pos = { x, z };
  return entity;
}

function stateFor(player, target, tick) {
  return {
    tick,
    simTime: tick * SIM_DT,
    mode: 'flight',
    playerId: player.id,
    entities: new Map([[player.id, player], [target.id, target]]),
    entityList: [player, target],
    combat: { beams: [], threatTables: new Map() },
    meta: { seed: 26029 },
  };
}

async function withFieldsEnabled(fn) {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    return await fn();
  } finally {
    FIELD_FLAGS.enabled = previous;
  }
}
