import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { fieldAffectsBody } from '../src/core/fields/fieldKernel.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { resetLineageIds } from '../src/combat/attackLineage.js';
import { CRYO_LOCK_STATUS_ID } from '../src/combat/cryoLock.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { fields } from '../src/systems/fields.js';

function withFieldsEnabled(fn) {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    return fn();
  } finally {
    FIELD_FLAGS.enabled = previous;
  }
}

function spawnCraft(sim, overrides = {}) {
  return sim.spawn({
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 10,
    collides: true,
    hull: 100,
    hullMax: 100,
    physicsBody: {
      schemaVersion: 1,
      radius: 10,
      mass: 20,
      inertiaY: 50,
      dynamic: true,
      material: 'ship',
      revision: 0,
    },
    data: { combatProfileId: 'combat_profile_standard_ship' },
    ...overrides,
  });
}

function bootOrbitScenario() {
  resetLineageIds(1);
  const sim = createSimulation({ seed: 1330601, bus: createBus(), systems: [fields] });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  const host = spawnCraft(sim, {
    vel: { x: 40, z: 0 },
    data: {
      combatProfileId: 'combat_profile_standard_ship',
      fittings: ['mod_cryo_gyros'],
      weapons: [{ defId: 'wpn_pulse_laser_s' }],
    },
  });
  state.playerId = host.id;
  return { sim, state, host, fieldsSys: sim.registry.get('fields') };
}

test('orbit fields inherit their host team and exclude allied craft', () => {
  withFieldsEnabled(() => {
    const t = bootOrbitScenario();
    t.sim.step();
    const field = t.fieldsSys._kernel.list().find((entry) => entry.tag === 'orbit_node');
    assert.ok(field, 'the fitted host must register an orbit field');
    assert.equal(field.team, t.host.team);
    assert.equal(field.filters.excludeSourceTeam, true);
    assert.equal(fieldAffectsBody(field, { id: 'ally', type: 'ship', team: t.host.team }), false);
    assert.equal(fieldAffectsBody(field, { id: 'hostile', type: 'ship', team: 1 }), true);
  });
});

test('orbit contact does not schedule Cryo Lock on allied craft', () => {
  withFieldsEnabled(() => {
    const t = bootOrbitScenario();
    const ally = spawnCraft(t.sim, { pos: { x: 1000, z: 1000 } });
    t.sim.step();
    const node = t.fieldsSys._orbitWorld.nodes[0];
    ally.pos.x = node.x;
    ally.pos.z = node.z;
    t.sim.step();
    assert.equal(
      t.fieldsSys._orbitWorld.contacts.some((event) => event.targetId === ally.id),
      false,
      'an ally must not enter the orbit contact pipeline',
    );
    t.fieldsSys._combatKernel.prePhysics(SIM_DT);

    const allyRuntime = t.state.combat.entities[String(ally.id)];
    assert.equal(
      !!allyRuntime && allyRuntime.pendingStatuses.some((status) => status.id === CRYO_LOCK_STATUS_ID),
      false,
      'an allied contact must not even queue Cryo Lock for a later combat tick',
    );
    assert.equal(allyRuntime && allyRuntime.statuses[CRYO_LOCK_STATUS_ID], undefined);
  });
});
