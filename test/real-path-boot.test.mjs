// The shared real-path boot for every fun-loop bench scenario.
//
// THE REAL-PATH LAW: "A scenario that integrates its own physics is not a measurement." These
// tests exist so that a bench scenario built on `bootRealPath` provably ran the game's real path —
// the authoritative runtime on the live `rapier-dynamic` physics authority — and so that the
// `proof()` field it publishes cannot read "ready" for a stand-in.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REAL_PATH_DT,
  REAL_PATH_SYSTEM_NAMES,
  bootRealPath,
  writeRealPathInput,
} from '../scripts/lib/bench/realPath.mjs';

const SEED = 13502;

async function bootFlight(seed = SEED) {
  return bootRealPath({
    seed,
    systems: ['actions', 'flightV3', 'physics'],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: 0, z: 0 }, rot: 0, isPlayer: true, factionId: 'faction_free' }],
  });
}

test('bootRealPath stands up the live rapier-dynamic authority, and proof() says so', async () => {
  const host = await bootFlight();
  try {
    const proof = host.proof();
    assert.equal(
      proof.physicsBackend,
      'rapier-dynamic',
      'A scenario that integrates its own physics is not a measurement: the bench must run the live physics authority',
    );
    assert.equal(proof.flightBackend, 'v3', 'the real flight path is flightV3, not the compatibility controller');
    assert.equal(proof.profileId, 'production', 'the bench must boot the production runtime profile');
    // The backend only reports itself once physics has stepped; step one tick first.
    host.step(1);
    const stepped = host.proof();
    assert.equal(stepped.backend, 'rapier-dynamic', 'physics must report the rapier-dynamic backend after a real step');
    assert.equal(stepped.sg02Ready, true, 'SG-02 dynamic authority must be ready — a stand-in would report false');
    assert.ok(stepped.sg02DynamicBodies >= 1, `the player hull must own a dynamic body (got ${stepped.sg02DynamicBodies})`);
  } finally {
    host.dispose();
  }
});

test('a hull spawned through bootRealPath accelerates under the real flight system', async () => {
  const host = await bootFlight();
  try {
    const player = host.player;
    assert.ok(player, 'isPlayer hull must be returned as host.player');
    assert.equal(host.state.playerId, player.id, 'the player hull must own state.playerId');
    const startSpeed = Math.hypot(player.vel.x, player.vel.z);
    host.step(180, { before: ({ state }) => { writeRealPathInput(state, { moveZ: 1 }); } });
    const endSpeed = Math.hypot(player.vel.x, player.vel.z);
    assert.ok(
      endSpeed > startSpeed + 10,
      `three seconds of full forward input must actually move the hull through the real path (${startSpeed} -> ${endSpeed} WU/s)`,
    );
  } finally {
    host.dispose();
  }
});

test('two boots of the same seed produce identical motion (fixed seeds or it did not happen)', async () => {
  const runOnce = async () => {
    const host = await bootFlight();
    try {
      host.step(240, {
        before: ({ index, state }) => {
          writeRealPathInput(state, { moveZ: 1, turnIntent: index > 120 ? 0.6 : 0 });
        },
      });
      const p = host.player;
      return { x: p.pos.x, z: p.pos.z, vx: p.vel.x, vz: p.vel.z, rot: p.rot };
    } finally {
      host.dispose();
    }
  };
  const a = await runOnce();
  const b = await runOnce();
  assert.deepEqual(b, a, 'the same seed and the same input tape must produce the same run');
});

test('bootRealPath refuses an unseeded run and an unknown system name', async () => {
  await assert.rejects(() => bootRealPath({ systems: ['physics'] }), /seed/, 'an unseeded run is an anecdote');
  await assert.rejects(
    () => bootRealPath({ seed: SEED, systems: ['not_a_system'] }),
    /unknown system/,
    'a typo in a system name must fail loudly, not silently measure a smaller game',
  );
});

test('the named-system table and the fixed timestep are stable', () => {
  assert.equal(REAL_PATH_DT, 1 / 60, 'the sim is a 60 Hz fixed timestep');
  for (const name of ['actions', 'aiPorts', 'collisionConsequences', 'flightV3', 'physics', 'tacticalAI', 'weapons']) {
    assert.ok(REAL_PATH_SYSTEM_NAMES.includes(name), `${name} must be addressable by name for the other lanes`);
  }
});
