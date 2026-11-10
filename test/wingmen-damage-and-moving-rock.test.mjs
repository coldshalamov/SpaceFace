import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { wingmen } from '../src/systems/wingmen.js';
import { movementForActivity } from '../src/ai/doctrine.js';
import { ManeuverKind } from '../src/ai/contracts.js';

function boot(fleet = []) {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  state.automation.fleet = fleet;
  const bus = createBus();
  let nextId = 1;
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = nextId++;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const player = helpers.spawnEntity({ type: 'ship', pos: { x: 0, z: 0 } });
  state.playerId = player.id;
  const system = Object.create(wingmen);
  system.init({ state, bus, helpers, registry: { get() { return null; } } });
  return { state, bus, system, helpers, player };
}

test('hard sector changes preserve the last live wingman damage', () => {
  const fleet = [{ id: 'wing', shipDefId: 'ship_wasp', order: 'escort', hullPct: 1, hp: 1 }];
  const { state, bus, system } = boot(fleet);
  bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  const before = state.entities.get(fleet[0]._liveId);
  before.hull = before.hullMax * 0.4;
  // A hard jump may occur after damage but before wingmen's next synchronization tick.
  bus.emit('sector:exit', { sectorId: 'sector_helios_prime' });
  assert.equal(before.alive, false);
  bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
  const after = state.entities.get(fleet[0]._liveId);
  assert.notEqual(after.id, before.id);
  assert.ok(Math.abs(after.hull / after.hullMax - 0.4) < 1e-12, 'a sector hop must not repair the fleet');
  system.update(1 / 60, state);
  assert.equal(fleet[0].hullPct, 0.4);
  assert.equal(fleet[0].hp, 0.4);
});

test('restored damaged fleet rows materialize at their persisted hull fraction', () => {
  const fleet = [
    { id: 'current', shipDefId: 'ship_wasp', order: 'escort', hullPct: 0.3, hp: 0.3 },
    { id: 'legacy', shipDefId: 'ship_wasp', order: 'escort', hp: 0.6 },
    { id: 'fresh', shipDefId: 'ship_wasp', order: 'escort' },
  ];
  const { state, bus } = boot(structuredClone(fleet));
  bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  for (const [index, fraction] of [0.3, 0.6, 1].entries()) {
    const entity = state.entities.get(state.automation.fleet[index]._liveId);
    assert.ok(Math.abs(entity.hull / entity.hullMax - fraction) < 1e-12);
  }
});

test('a mining wingman steers toward the current pose of its sticky moving rock', () => {
  const fleet = [{ id: 'miner', shipDefId: 'ship_wasp', order: 'mine', hullPct: 1 }];
  const { state, bus, system, helpers } = boot(fleet);
  bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
  const worker = state.entities.get(fleet[0]._liveId);
  const rock = helpers.spawnEntity({
    type: 'asteroid', pos: { x: 250, z: 0 }, radius: 10,
    data: { oreHP: 400, oreHPMax: 400 },
  });
  system.update(1 / 60, state);
  assert.equal(fleet[0]._mineRockId, rock.id);
  const before = worker.data.ai.activity;
  system.update(1 / 60, state);
  assert.equal(worker.data.ai.activity, before, 'a stationary workface reuses its doctrine');

  rock.pos.x += 500;
  rock.pos.z += 70;
  state.tick++;
  system.update(1 / 60, state);
  assert.equal(fleet[0]._mineRockId, rock.id, 'the moving face stays selected');
  const activity = worker.data.ai.activity;
  const maneuver = movementForActivity({ kind: ManeuverKind.SCREEN }, activity, null);
  assert.deepEqual(maneuver.formationSlot, { x: rock.pos.x, z: rock.pos.z }, 'the live AI follows the rock, not its abandoned pose');
  system.update(1 / 60, state);
  assert.equal(worker.data.ai.activity, activity, 'the settled pose does not allocate another activity');
});
