import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { core as corePrototype } from '../src/core/coreSystem.js';
import { createGameState } from '../src/core/gameState.js';
import { MODULES } from '../src/data/modules.js';
import {
  fittingsFromDefaultModules,
  getDerivedStats,
  makeShipEntitySpec,
  ships as shipsPrototype,
} from '../src/systems/ships.js';
import { world as worldPrototype } from '../src/systems/world.js';

const SHIP_ID = 'ship_drifter';
const DRIVE_ID = 'mod_jump_drive_m';

function cloneSystem(prototype) {
  return Object.assign({}, prototype);
}

function buildHarness({ fitted = false } = {}) {
  const state = createGameState(9871);
  state.mode = 'flight';
  state.player.ownedShips = [{
    defId: SHIP_ID,
    fittings: fitted ? fittingsFromDefaultModules(SHIP_ID, [DRIVE_ID]) : [],
  }];
  state.player.activeShipIndex = 0;
  state.fuel.current = state.fuel.max = 1000;

  const bus = createBus();
  const helpers = {};
  const core = cloneSystem(corePrototype);
  const ships = cloneSystem(shipsPrototype);
  const world = cloneSystem(worldPrototype);
  const registry = { get: (name) => (name === 'ships' ? ships : null) };
  const ctx = { state, bus, helpers, registry };
  core.init(ctx);
  ships.init(ctx);
  world.init(ctx);

  const player = helpers.spawnEntity(makeShipEntitySpec(SHIP_ID, {
    isPlayer: true,
    fittings: state.player.ownedShips[0].fittings,
    player: state.player,
  }));
  state.playerId = player.id;
  world._resolveShipModules();
  state.world.currentSectorId = 'sector_helios_prime';
  return { state, bus, ships, world, player };
}

function startDriveJump(h) {
  h.bus.emit('world:requestJump', {
    targetSectorId: 'sector_ceres_belt',
    via: 'drive',
  });
  assert.equal(h.state.jump.state, 'CHARGING');
  return { charge: h.state.jump.chargeNeeded, fuel: h.state.jump._fuelCost };
}

function completeJump(h, via) {
  h.bus.emit('world:requestJump', {
    targetSectorId: 'sector_ceres_belt',
    via,
  });
  assert.equal(h.state.jump.state, 'CHARGING');
  h.world._tickCharging(h.state.jump.chargeNeeded, h.state);
  assert.equal(h.state.jump.state, 'JUMPING');
  h.world._tickJumping(1.2, h.state);
  return h.state.jump.cooldownT;
}

function completeGateJump(h) {
  h.state.jump.state = 'JUMPING';
  h.state.jump.targetSectorId = 'sector_ceres_belt';
  h.state.jump.via = 'gate';
  h.state.jump._jumpT = 0;
  h.world._tickJumping(1.2, h.state);
  return h.state.jump.cooldownT;
}

test('Jump Drive T2 M publishes a compatible derived tier and changes normal drive preflight', () => {
  const bare = buildHarness();
  assert.equal(bare.player.data.derived.jumpDriveTier, 'jump_t1');
  assert.equal(bare.world._activeDrive().driveStealth, 0);
  const bareJump = startDriveJump(bare);

  const fitted = buildHarness({ fitted: true });
  assert.equal(fitted.player.data.derived.jumpDriveTier, 'jump_t2',
    'initial ship entity receives the fitted canonical drive tier');
  assert.equal(fitted.world._activeDrive().driveStealth, 0.15);
  const t2Jump = startDriveJump(fitted);
  assert.ok(t2Jump.charge < bareJump.charge, 'T2 shortens the ordinary drive charge');
  assert.ok(t2Jump.fuel < bareJump.fuel, 'T2 lowers ordinary drive fuel cost');
});

test('Jump Drive resolution resets to T1 on unfit or malformed/incompatible data', () => {
  const h = buildHarness({ fitted: true });
  const bareFittings = [];
  h.state.player.ownedShips[0].fittings = bareFittings;
  h.ships.recomputeEntity(h.player.id);
  assert.equal(h.player.data.derived.jumpDriveTier, 'jump_t1');
  assert.equal(h.world._activeDrive().baseCharge, 8);

  h.player.data.derived = { jumpDriveTier: 'jump_t999' };
  h.world._resolveShipModules();
  assert.equal(h.world._activeDrive().baseCharge, 8,
    'invalid derived keys cannot preserve a stale T2 drive');

  const catalogDrive = MODULES.find((module) => module.id === DRIVE_ID);
  const catalogSnapshot = JSON.stringify(catalogDrive);
  assert.equal(getDerivedStats('ship_kestrel', [DRIVE_ID]).jumpDriveTier, 'jump_t1',
    'an M utility module cannot upgrade an incompatible manual fitting');
  assert.equal(getDerivedStats(SHIP_ID, [{ id: DRIVE_ID }]).jumpDriveTier, 'jump_t1',
    'non-catalog manual fitting values fail closed');
  assert.equal(JSON.stringify(catalogDrive), catalogSnapshot,
    'derived resolution never mutates the module catalog');
});

test('Advanced Navigation reduces only valid drive-jump cooldowns', () => {
  const baseline = buildHarness();
  assert.equal(completeJump(baseline, 'drive'), 6.0);

  const researched = buildHarness();
  researched.state.player.efficiencyMods.jumpCooldownMult = 0.85;
  assert.equal(completeJump(researched, 'drive'), 5.1);

  const gate = buildHarness();
  gate.state.player.efficiencyMods.jumpCooldownMult = 0.85;
  assert.equal(completeGateJump(gate), 0, 'gate cooldown remains unchanged');
  assert.equal(gate.state.jump.state, 'IDLE');

  for (const multiplier of [null, '0.85', NaN, 0, -0.15, 1.01, Infinity]) {
    const malformed = buildHarness();
    malformed.state.player.efficiencyMods.jumpCooldownMult = multiplier;
    assert.equal(completeJump(malformed, 'drive'), 6.0,
      `invalid multiplier ${String(multiplier)} fails closed`);
  }
});
