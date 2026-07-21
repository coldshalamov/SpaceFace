// PQ-015 / SF-17 — Component targeting integration: a player's sub-selected subsystem concentrates
// weapon hits on it (focus fire) through the REAL damage router, and the mechanic is inert for NPC
// fire, wrong targets, destroyed components, and (critically) when no selection exists — the last
// case is the determinism guarantee for the 47a golden.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createDamageRouter, scalarHitToDamagePacket } from '../src/combat/damage.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { stableEntityKey } from '../src/data/interactionDescriptorCatalog.js';

function harness({ attackerId = 1, selection = undefined, targetLock = 2 } = {}) {
  const catalog = createCombatCatalog();
  const state = { tick: 0, playerId: 1, player: { targetId: targetLock }, combat: { traces: [] }, entities: new Map(), ui: {} };
  const attacker = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, radius: 12 };
  const npc = { id: 3, type: 'ship', alive: true, team: 0, pos: { x: 1, z: 0 }, radius: 12 };
  const target = { id: 2, type: 'ship', alive: true, team: 1, hull: 500, hullMax: 500, shield: 0, armorHp: 0, radius: 14, pos: { x: 0, z: 0 } };
  state.entities.set(1, attacker);
  state.entities.set(2, target);
  state.entities.set(3, npc);
  if (selection !== undefined) state.ui.componentSelection = selection;
  const context = { state, catalog, bus: { emit: () => {} }, attachments: null, helpers: {} };
  const router = createDamageRouter(context, { schedule: () => {} });
  // No hit.pos → geometric subsystem selection returns null, isolating the focus-fire injection.
  const route = () => router({ attackerId, targetId: 2, packet: { ...scalarHitToDamagePacket({ damage: 20, damageType: 'kinetic' }), subsystemShare: 1.0 } });
  return { state, target, route };
}

const selFor = (targetId, componentId, extra = {}) => ({
  targetId, componentId, kind: 'subsystem', verb: 'damage',
  stableKey: `id:${targetId}`, ...extra,
});

test('focus fire: player hit routes to the selected subsystem', () => {
  const { route } = harness({ attackerId: 1, selection: selFor(2, 'subsystem_weapon') });
  const res = route();
  assert.equal(res.ok, true);
  assert.equal(res.subsystemId, 'subsystem_weapon', 'player focus-fire concentrates on the selected subsystem');
});

test('no selection → geometric selection (null with no hit pos) — determinism-safe default', () => {
  const { route } = harness({ attackerId: 1, selection: undefined });
  const res = route();
  assert.equal(res.subsystemId, null, 'without a selection the hit resolves as before (no forced subsystem)');
});

test('NPC fire ignores the player component selection', () => {
  const { route } = harness({ attackerId: 3, selection: selFor(2, 'subsystem_weapon') });
  const res = route();
  assert.equal(res.subsystemId, null, 'only the local player focus-fires');
});

test('selection for a different target does not leak to this hit', () => {
  const { route } = harness({ attackerId: 1, selection: selFor(99, 'subsystem_weapon') });
  const res = route();
  assert.equal(res.subsystemId, null, 'a selection made on another target is ignored');
});

test('selection ignored when the player has locked a different target', () => {
  const { route } = harness({ attackerId: 1, selection: selFor(2, 'subsystem_weapon'), targetLock: 99 });
  const res = route();
  assert.equal(res.subsystemId, null, 'focus fire only applies to the currently locked target');
});

test('destroyed subsystem is not serviceable → geometric fallback (truthful denial)', () => {
  const { state, route } = harness({ attackerId: 1, selection: selFor(2, 'subsystem_drive') });
  // Pre-destroy the selected subsystem in the live runtime by routing lethal damage to it first.
  const catalog = createCombatCatalog();
  // Simpler: mark the runtime subsystem destroyed directly on the router's ensured runtime.
  // First route once to materialize the combatant runtime.
  route();
  state.combat.entities['2'].subsystems.subsystem_drive.destroyed = true;
  const res = route();
  assert.notEqual(res.subsystemId, 'subsystem_drive', 'a destroyed component is not force-targeted');
});

test('an explicit projectile subsystemId is never overridden by the selection', () => {
  const catalog = createCombatCatalog();
  const state = { tick: 0, playerId: 1, player: { targetId: 2 }, combat: { traces: [] }, entities: new Map(), ui: {} };
  state.entities.set(1, { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, radius: 12 });
  const target = { id: 2, type: 'ship', alive: true, team: 1, hull: 500, hullMax: 500, shield: 0, armorHp: 0, radius: 14, pos: { x: 0, z: 0 } };
  state.entities.set(2, target);
  state.ui.componentSelection = selFor(2, 'subsystem_weapon');
  const context = { state, catalog, bus: { emit: () => {} }, attachments: null, helpers: {} };
  const router = createDamageRouter(context, { schedule: () => {} });
  const res = router({ attackerId: 1, targetId: 2, packet: { ...scalarHitToDamagePacket({ damage: 20, damageType: 'kinetic' }), subsystemShare: 1.0, hit: { subsystemId: 'subsystem_sensor' } } });
  assert.equal(res.subsystemId, 'subsystem_sensor', 'an explicit projectile-carried subsystem wins over the selection');
});
