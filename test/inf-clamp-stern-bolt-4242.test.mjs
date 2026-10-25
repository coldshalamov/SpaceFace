import test from 'node:test';
import assert from 'node:assert/strict';

import { selectHitSubsystem } from '../src/combat/geometry.js';
import { sweepCollisionProxyInto } from '../src/core/collisionProxySweep.js';
import { createCombatCatalog, ensureCombatant, ensureCombatState } from '../src/combat/runtime.js';
import { applyPendingSubsystemTransitions, scheduleSubsystemTransition } from '../src/combat/subsystems.js';
import { SUBSYSTEM_DEFS } from '../src/data/combatDefs.js';
import { resolveCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';
import {
  modelTruthBoltRadius,
  modelTruthHitVolume,
  modelTruthRow,
  modelTruthRows,
  modelTruthSocketWorld,
} from '../src/data/modelTruth.js';

function hawser() {
  const row = modelTruthRow('ship_hawser');
  assert.ok(row, 'ship_hawser is a measured hull');
  const entity = {
    id: 4242,
    type: 'ship',
    alive: true,
    collides: true,
    team: 2,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: row.gameplay.entityRadius,
    hull: 80,
    hullMax: 80,
    data: { defId: 'ship_hawser', combatProfileId: 'combat_profile_heist_carrier' },
  };
  const catalog = createCombatCatalog();
  const state = { tick: 4, simTime: 4 / 60, combat: {}, rng: { next: () => 0.4242 } };
  ensureCombatState(state);
  const runtime = ensureCombatant(state, entity, catalog);
  return { entity, catalog, state, runtime, row };
}

test('a dead-aft shot on the hauler tug hits the clamp and lets the load go', () => {
  const { entity, catalog, state, runtime } = hawser();
  assert.equal(runtime.profileId, 'combat_profile_heist_carrier');
  assert.ok(runtime.subsystems.subsystem_transport_clamp);

  const volume = modelTruthHitVolume(entity, 'subsystem_transport_clamp');
  assert.equal(volume && volume.measured, true);
  const nozzle = modelTruthSocketWorld(entity, 'SOCKET_Engine_Main');
  const gun = modelTruthSocketWorld(entity, 'SOCKET_Weapon_Front');
  const winch = modelTruthSocketWorld(entity, 'SOCKET_Tether_Massline');
  assert.equal(selectHitSubsystem(entity, runtime, catalog, { pos: { x: nozzle.x, z: nozzle.z } }), 'subsystem_drive');
  assert.equal(selectHitSubsystem(entity, runtime, catalog, { pos: { x: gun.x, z: gun.z } }), 'subsystem_weapon');
  assert.equal(selectHitSubsystem(entity, runtime, catalog, { pos: { x: winch.x, z: winch.z } }), 'subsystem_drive');

  const manifest = resolveCollisionProxyManifest(entity);
  assert.ok(manifest, 'the tug has a measured collision skin');
  const bolt = modelTruthBoltRadius(entity);
  for (const z of [0, bolt * 0.4]) {
    const contact = {};
    const struck = sweepCollisionProxyInto(
      contact,
      entity,
      manifest,
      { x: -entity.radius * 2, z },
      { x: entity.radius, z },
      bolt,
    );
    assert.equal(struck, true, `dead-aft ray at z=${z} hits the skin`);
    assert.equal(
      selectHitSubsystem(entity, runtime, catalog, { pos: { x: contact.x, z: contact.z } }),
      'subsystem_transport_clamp',
      `dead-aft ray at z=${z} hits the clamp`,
    );
  }

  const breaks = [];
  const attachments = {
    breakOwnedBy(id, reason) { breaks.push([id, reason]); },
  };
  scheduleSubsystemTransition(runtime.subsystems.subsystem_transport_clamp, state.tick, true, 'bolt_hit', 1, runtime);
  const changed = applyPendingSubsystemTransitions({ state, catalog, attachments }, entity, runtime);
  assert.equal(changed, true);
  assert.deepEqual(breaks, [[entity.id, 'subsystem_disabled']]);
  assert.equal(runtime.subsystems.subsystem_transport_clamp.destroyed, true);
  assert.equal(runtime.capabilities.transport_clamp, false);
  assert.equal(runtime.capabilities.drive, true);
  assert.equal(runtime.capabilities.tether, true);

  const clamp = SUBSYSTEM_DEFS.find((def) => def.id === 'subsystem_transport_clamp');
  assert.equal(clamp.health, 34);
  assert.equal(clamp.armor.flat, 1);

  const bare = modelTruthRows().find((row) => row.solid === true
    && !(row.sockets || []).some((socket) => String(socket.name || '').startsWith('SOCKET_Engine_')));
  assert.ok(bare);
  const bareEntity = {
    id: bare.id,
    type: 'ship',
    pos: { x: 0, z: 0 },
    rot: 0,
    radius: (bare.gameplay && bare.gameplay.entityRadius) || 10,
    data: { defId: bare.id },
  };
  assert.equal(modelTruthHitVolume(bareEntity, 'subsystem_transport_clamp'), null);
});
