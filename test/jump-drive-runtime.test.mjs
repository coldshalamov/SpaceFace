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
