// INF-039 — a practice room with clear edges.
//
// One anchor, two targets, the default physical kit, one fixed seed: a bounded sling room
// on the player door. The preset grants nothing, inert targets pay nothing, and no survival
// run means no results settle and no records file. Relaunching rebuilds the identical room.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  buildSandboxLaunchConfig,
  SCENARIO_PRESETS,
  spawnTargetsNow,
} from '../src/ui/sandbox/sandboxSetup.js';

const DOOR_SOURCE = readFileSync(
  fileURLToPath(new URL('../src/ui/screens/crucible.js', import.meta.url)),
  'utf8',
);

function preset() {
  const found = SCENARIO_PRESETS.find((item) => item && item.id === 'sling_practice');
  assert.ok(found, 'the practice preset exists');
  return found;
}

test('INF-039: the room is one anchor, two targets, the physics kit, one seed', () => {
  const room = preset();
  assert.equal(room.config.seed, 39039);
  assert.ok(Number.isInteger(room.config.seed) && room.config.seed >= 1);
  assert.equal(room.config.shipId, 'ship_hornet');
  assert.equal(room.config.physicsLoadout, 'physics_toolkit');
  assert.equal(room.config.targetDrones.count, 2);
  assert.ok(room.config.masslineRange, 'the heavy anchor travels with the room');
  assert.equal(room.config.cameraCandidate, 'wide_gameplay');
});

test('INF-039: the room grants nothing and unlocks nothing', () => {
  const { config } = preset();
  for (const key of ['credits', 'unlockAllTech', 'techIds', 'moduleIds', 'enemyPackages', 'physicsSwarm', 'maxReputation']) {
    assert.equal(config[key] == null || config[key] === false, true, `${key} stays off`);
  }
  const built = buildSandboxLaunchConfig(config);
  assert.equal(built.seed, config.seed, 'the fixed seed survives the launch builder');
  assert.equal(built.physicsLoadout, 'physics_toolkit');
});

test('INF-039: the two targets are inert, pay nothing, and land identically every time', () => {
  function arrange() {
    const collected = [];
    let nextId = 101;
    const ctx = {
      helpers: { spawnEntity: (spec) => { collected.push(spec); return { id: nextId++ }; } },
      state: { playerId: 1, entities: { get: () => ({ pos: { x: 0, z: 0 } }) } },
    };
    spawnTargetsNow(ctx, 2);
    return { collected };
  }
  const first = arrange();
  const second = arrange();
  assert.equal(first.collected.length, 2, 'exactly two targets');
  for (const spec of first.collected) {
    assert.equal(spec.data.bountyCr, 0, 'no bounty on a practice target');
    assert.equal(spec.data.lootTableId, null, 'no loot on a practice target');
    assert.equal(spec.team, 2, 'neutral to the player');
    assert.equal(spec.data.ai, null, 'no mind behind them');
    assert.equal(spec.vel, undefined, 'no initial velocity — dead still until touched');
  }
  assert.deepEqual(
    first.collected.map((spec) => spec.pos),
    second.collected.map((spec) => spec.pos),
    'the same seed arranges the same room — reset by relaunch',
  );
});

test('INF-039: the door carries the practice room', () => {
  assert.match(DOOR_SOURCE, /Practice room/, 'a clear place on the entry surface');
  assert.match(DOOR_SOURCE, /sling_practice/, 'wired to the fixed preset');
  assert.match(DOOR_SOURCE, /No records, no rewards/, 'the edges said out loud');
});
