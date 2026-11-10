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
  assert.equal(entities.player.flags.boosting, true,
    'boosting is sim state (thrust engaged) — scrubbing it silently killed a mid-boost burn on restore');
  assert.equal(entities.player.flags.noInterp, undefined);
  assert.equal(entities.player.flags.docked, undefined);

  assert.equal(entities.persistent.length, 1);
  assert.equal(entities.persistent[0].flags.persistent, true);
  assert.equal(entities.persistent[0].flags.invuln, true,
    'persistent non-player invulnerability is meaningful authored gameplay state');
  assert.equal(entities.persistent[0].flags.boosting, true,
    'boosting is sim state (thrust engaged) — scrubbing it silently killed a mid-boost burn on restore');
  assert.equal(entities.persistent[0].flags.noInterp, undefined);
  assert.equal(entities.persistent[0].flags.docked, undefined);
});

test('a serialized gyre ball rides the save but restores transient — never flagged persistent', () => {
  const state = makeState();
  // A mid-flight gyre ball: marked body, own deadline, kill-credit meta. It serializes
  // through the same live-projectile clause but is a different type — and the whole
  // sim (snag/pull/suck guards, sector-regen wipe) relies on live bodies lacking
  // flags.persistent, so restore must not stamp it.
  const ball = {
    id: 9,
    type: 'asteroid',
    alive: true,
    pos: { x: 200, z: 0 },
    vel: { x: 400, z: 0 },
    radius: 20,
    mass: 300,
    ttl: 18,
    flags: {},
    data: {
      gyreLaunched: true,
      despawnAt: 30,
      gyreLaunchMeta: { actorId: 7, absorbs: 3, clumpRadius: 18, members: [{ type: 'asteroid', mass: 5, radius: 2, nx: 0, nz: 0 }] },
    },
  };
  state.entityList.push(ball);
  state.entities.set(ball.id, ball);
  save.state = state;
  save.registry = { get: () => null };

  const entities = save.serializeData().entities;
  const savedBall = entities.persistent.find((e) => e.id === ball.id);
  assert.ok(savedBall, 'a launched ball mid-flight rides the save');
  assert.equal(savedBall.data.gyreLaunched, true);

  // Restore into a fresh state and inspect what the spawn helper receives.
  const spawned = [];
  const fresh = makeState();
  fresh.entities.clear();
  fresh.entityList.length = 0;
  fresh.nextEntityId = 0;
  save.state = fresh;
  save.helpers = {
    spawnEntity: (spec) => {
      const e = Object.assign({ alive: true }, spec);
      spawned.push(e);
      return e;
    },
  };
  save._spawnPersistentEntities(JSON.parse(JSON.stringify(entities.persistent)), new Map());
  const restored = spawned.find((e) => e.data && e.data.gyreLaunched);
  assert.ok(restored, 'the ball respawns on continue');
  assert.equal(restored.flags.persistent, false,
    'a restored gyre ball stays transient like a projectile — a persistent flag would let it survive sector regen as an out-of-timeline marked body and stick forever on a handed-back core');
  assert.equal(restored.flags.noInterp, true);
});
