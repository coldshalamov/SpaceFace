import assert from 'node:assert/strict';
import test from 'node:test';

import { save } from '../src/save/saveSystem.js';

function makeState() {
  const player = {
    id: 7,
    type: 'ship',
    alive: true,
    pos: { x: 10, z: -5 },
    vel: { x: 0, z: 0 },
    flags: { persistent: true, invuln: true, boosting: true, noInterp: true, docked: true },
    data: { defId: 'ship_kestrel' },
  };
  const protectedFixture = {
    id: 8,
    type: 'ship',
    alive: true,
    pos: { x: 30, z: 4 },
    vel: { x: 0, z: 0 },
    flags: { persistent: true, invuln: true, boosting: true, noInterp: true, docked: true },
    data: { role: 'protected_fixture' },
  };
  return {
    meta: { seed: 91, playtimeS: 5, createdAt: 'test' },
    save: { currentSlot: null },
    playerId: player.id,
    player: { credits: 0, cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 10, capMass: 10 } },
    economy: {},
    factions: {},
    world: { currentSectorId: 'sector_helios_prime', sectors: {} },
    missions: { boards: {}, active: [], completedLog: [], nextId: 1 },
    story: { beatIndex: 0 },
    automation: { drones: [], meta: {} },
    crafting: { queues: {} },
    settings: {},
    entityList: [player, protectedFixture],
    entities: new Map([[player.id, player], [protectedFixture.id, protectedFixture]]),
    simTime: 12,
    tick: 4,
  };
}

test('save scrubs player flight grace but preserves persistent entity gameplay protection', () => {
  const state = makeState();
  save.state = state;
  save.registry = { get: () => null };

  const entities = save.serializeData().entities;
  assert.equal(entities.player.flags.persistent, true);
  assert.equal(entities.player.flags.invuln, undefined, 'player invulnerability is dock/launch runtime grace');
  assert.equal(entities.player.flags.boosting, undefined);
  assert.equal(entities.player.flags.noInterp, undefined);
  assert.equal(entities.player.flags.docked, undefined);

  assert.equal(entities.persistent.length, 1);
  assert.equal(entities.persistent[0].flags.persistent, true);
  assert.equal(entities.persistent[0].flags.invuln, true,
    'persistent non-player invulnerability is meaningful authored gameplay state');
  assert.equal(entities.persistent[0].flags.boosting, undefined);
  assert.equal(entities.persistent[0].flags.noInterp, undefined);
  assert.equal(entities.persistent[0].flags.docked, undefined);
});
