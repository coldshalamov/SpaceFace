import assert from 'node:assert/strict';
import test from 'node:test';
import { createCombatKernel } from '../src/combat/kernel.js';
import { createCombatCatalog, ensureCombatant, ensureCombatState } from '../src/combat/runtime.js';
import { playerSubsystemNotice, stepFieldRepair } from '../src/combat/subsystems.js';
import { createGameState } from '../src/core/gameState.js';

function pilot() {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  state.tick = 0;
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: { x: 0, y: 0, z: 0 },
    data: { combatProfileId: 'combat_profile_heist_carrier' },
    flags: {},
  };
  state.playerId = 1;
  state.entities.set(1, player);
  state.ui = state.ui || {};
  state.ui.docked = false;
  return { state, player };
}

function eventsBus() {
  const log = [];
  return {
    log,
    on() { return () => {}; },
    off() {},
    emit(name, payload) { log.push({ name, payload }); },
  };
}

function killPart(row) {
  row.health = 0;
  row.destroyed = true;
  row.effectiveDisabled = true;
  row.pendingTransition = null;
}

test('seed 4242 a dead drive knits at the sheet rate and a clamp stays broken', () => {
  const { state, player } = pilot();
  const catalog = createCombatCatalog();
  ensureCombatState(state);
  const runtime = ensureCombatant(state, player, catalog);
  const drive = runtime.subsystems.subsystem_drive;
  const clamp = runtime.subsystems.subsystem_transport_clamp;
  const power = runtime.subsystems.subsystem_power;
  assert.ok(drive && clamp && power);
  const powerFull = power.health;
  killPart(drive);
  killPart(clamp);
  runtime.pendingSubsystemTransitionCount = 0;

  const bus = eventsBus();
  const context = { state, catalog, bus, attachments: null };
  let healed = 0;
  for (let i = 0; i < 4; i += 1) {
    const step = stepFieldRepair(context, player, runtime);
    healed += step.healed;
    assert.equal(step.enabled, false);
  }
  assert.equal(drive.health, 1);
  assert.equal(healed, 1);
  assert.equal(clamp.health, 0);
  assert.equal(clamp.destroyed, true);
  assert.equal(drive.destroyed, true);
  assert.equal(drive.pendingTransition.atTick, 1);
  assert.equal(drive.pendingTransition.destroyed, false);
  assert.equal(power.health, powerFull);

  state.tick = 1;
  const back = stepFieldRepair(context, player, runtime);
  assert.equal(back.enabled, true);
  assert.equal(drive.destroyed, false);
  assert.equal(drive.effectiveDisabled, false);
  assert.equal(drive.health, 1.25);
  assert.equal(clamp.health, 0);
  assert.equal(clamp.destroyed, true);
  const enabled = bus.log.filter((event) => event.name === 'combat:subsystemEnabled');
  assert.equal(enabled.length, 1);
  assert.equal(enabled[0].payload.targetId, player.id);
  assert.equal(enabled[0].payload.subsystemId, 'subsystem_drive');
  assert.equal(playerSubsystemNotice('enabled', enabled[0].payload.subsystemId), 'Drive is back');
  assert.equal(playerSubsystemNotice('disabled', 'subsystem_drive'), 'Drive is out');
  assert.equal(playerSubsystemNotice('enabled', 'subsystem_weapon'), 'Guns are back');
  assert.equal(playerSubsystemNotice('disabled', 'subsystem_sensor'), 'Sensors are out');
  assert.equal(playerSubsystemNotice('enabled', 'subsystem_tether_spool'), 'Line spool is back');
  assert.equal(playerSubsystemNotice('disabled', 'subsystem_power'), 'Power is out');
  assert.equal(playerSubsystemNotice('enabled', 'subsystem_transport_clamp'), null);

  const before = drive.health;
  state.ui.docked = true;
  const docked = stepFieldRepair(context, player, runtime);
  assert.equal(docked.healed, 0);
  assert.equal(drive.health, before);
});

test('seed 4242 only the player hull knits through the combat kernel', () => {
  const { state, player } = pilot();
  const foe = {
    id: 2,
    type: 'ship',
    alive: true,
    pos: { x: 80, y: 0, z: 0 },
    data: { combatProfileId: 'combat_profile_heist_carrier' },
  };
  state.entities.set(2, foe);
  const bus = eventsBus();
  const kernel = createCombatKernel({
    state,
    bus,
    helpers: {},
    registry: { get() { return null; } },
  });
  const catalog = createCombatCatalog();
  const playerRuntime = ensureCombatant(state, player, catalog);
  const foeRuntime = ensureCombatant(state, foe, catalog);
  killPart(playerRuntime.subsystems.subsystem_drive);
  killPart(foeRuntime.subsystems.subsystem_drive);
  playerRuntime.pendingSubsystemTransitionCount = 0;
  foeRuntime.pendingSubsystemTransitionCount = 0;
  state.tick = 0;

  const step = kernel.stepPlayerFieldRepair();
  assert.equal(playerRuntime.subsystems.subsystem_drive.health, 0.25);
  assert.equal(foeRuntime.subsystems.subsystem_drive.health, 0);
  assert.equal(step.healed, 0.25);
  const again = kernel.stepPlayerFieldRepair();
  assert.equal(again.healed, 0.25);
  assert.equal(playerRuntime.subsystems.subsystem_drive.health, 0.5);
  assert.equal(foeRuntime.subsystems.subsystem_drive.health, 0);
});
