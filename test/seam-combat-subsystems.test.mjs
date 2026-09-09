import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createCombatCatalog, ensureCombatant, ensureCombatState } from '../src/combat/runtime.js';
import {
  applyPendingSubsystemTransitions,
  scheduleSubsystemTransition,
} from '../src/combat/subsystems.js';

function bootShip() {
  const catalog = createCombatCatalog();
  const state = { tick: 4, combat: {} };
  ensureCombatState(state);
  const entity = {
    id: 7, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100,
  };
  const runtime = ensureCombatant(state, entity, catalog);
  const bus = createBus();
  const disabled = [];
  bus.on('combat:subsystemDisabled', (p) => disabled.push(p));
  const context = { state, catalog, bus, attachments: null };
  return { state, entity, runtime, context, disabled, bus };
}

test('destroying power disables dependent drive and weapons', () => {
  const { entity, runtime, context, disabled, bus } = bootShip();
  try {
    assert.equal(runtime.capabilities.drive, true);
    assert.equal(runtime.capabilities.weapon, true);
    scheduleSubsystemTransition(runtime.subsystems.subsystem_power, context.state.tick, true, 'core_hit', 1);
    const changed = applyPendingSubsystemTransitions(context, entity, runtime);
    assert.equal(changed, true);
    assert.equal(runtime.subsystems.subsystem_power.destroyed, true);
    assert.equal(runtime.subsystems.subsystem_drive.effectiveDisabled, true);
    assert.equal(runtime.subsystems.subsystem_weapon.effectiveDisabled, true);
    assert.equal(runtime.capabilities.drive, false);
    assert.equal(runtime.capabilities.weapon, false);
    assert.ok(disabled.some((p) => p.subsystemId === 'subsystem_power'));
    assert.ok(disabled.some((p) => p.subsystemId === 'subsystem_drive' && p.dependencyDisabled === true));
  } finally {
    bus.clear();
  }
});

test('a lone weapon kill does not take the drive offline', () => {
  const { entity, runtime, context, bus } = bootShip();
  try {
    scheduleSubsystemTransition(runtime.subsystems.subsystem_weapon, context.state.tick, true, 'gun_hit', 1);
    applyPendingSubsystemTransitions(context, entity, runtime);
    assert.equal(runtime.subsystems.subsystem_weapon.destroyed, true);
    assert.equal(runtime.capabilities.weapon, false);
    assert.equal(runtime.capabilities.drive, true);
    assert.equal(runtime.subsystems.subsystem_drive.effectiveDisabled, false);
  } finally {
    bus.clear();
  }
});
