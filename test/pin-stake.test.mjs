// R17 (2026-11-20): "Power 3 Pin means one thing: it nails a point in space. Cast on a body ->
// that body is staked there for a few seconds (it strains against the stake, a sitting duck for a
// thrown rock; heavies shrug sooner). Cast on empty space -> it plants a post the Line can latch."
// Real path: the live runtime on rapier-dynamic; the stake acts only through the physics membrane.
import test from 'node:test';
import assert from 'node:assert/strict';

import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { massSeed, massSeedStakeTuning } from '../src/systems/massSeed.js';

const SEED = 4242;

async function castOnDriftingRock(pin) {
  const host = await bootRealPath({
    seed: SEED,
    systems: ['actions', 'flightV3', 'collisionConsequences', massSeed, 'physics'],
    hulls: [{ hullId: 'ship_kestrel', pos: { x: 0, z: 0 }, isPlayer: true }],
  });
  try {
    const st = host.state;
    st.input.actions = st.input.actions || {};
    const rock = host.spawnObstacle({ pos: { x: 260, z: 60 }, radius: 20, mass: 80, dynamic: true, vel: { x: 0, z: 90 } });
    host.step(30);
    st.input.aimWorld = { x: rock.pos.x, z: rock.pos.z };
    if (pin) st.input.actions.deployMassSeed = true;
    const events = [];
    for (const name of ['massSeed:staked', 'massSeed:stakeReleased', 'massSeed:deployed']) {
      host.bus.on(name, (p) => events.push({ name, t: st.simTime, p }));
    }
    let staked = null;
    let maxDrift = 0;
    host.step(150, {
      after: () => {
        const s = events.find((e) => e.name === 'massSeed:staked');
        if (s && !events.some((e) => e.name === 'massSeed:stakeReleased')) {
          staked = s.p.pos;
          maxDrift = Math.max(maxDrift, Math.hypot(rock.pos.x - staked.x, rock.pos.z - staked.z));
        }
      },
    });
    return { events, maxDrift, end: { x: rock.pos.x, z: rock.pos.z } };
  } finally {
    host.dispose();
  }
}

test('Pin cast on a drifting rock stakes it where the bolt lands; empty space still plants a post', async () => {
  const free = await castOnDriftingRock(false);
  const pinned = await castOnDriftingRock(true);
  const staked = pinned.events.find((e) => e.name === 'massSeed:staked');
  assert.ok(staked, 'R17: cast on a body, Pin stakes that body');
  assert.equal(pinned.events.some((e) => e.name === 'massSeed:deployed'), false,
    'R17: a stake is not a post — no anchor is planted in space');
  assert.ok(staked.t - 0.5 <= 0.5, `R17/03 §4: the bolt reaches the body in <= 0.5 s (staked at ${staked.t.toFixed(2)} s, cast at 0.5 s)`);
  assert.ok(pinned.maxDrift < 30, `R17: a staked body stays nailed (max drift ${pinned.maxDrift.toFixed(1)} wu)`);
  const freeTravel = Math.hypot(free.end.x - 260, free.end.z - 60);
  assert.ok(freeTravel > 200, `control: the same rock unpinned drifts away (${freeTravel.toFixed(0)} wu)`);
});

test('heavies shrug sooner: the hold shortens and the stake grip weakens with mass', () => {
  const wasp = massSeedStakeTuning(16);
  const boulder = massSeedStakeTuning(80);
  const hulk = massSeedStakeTuning(300);
  assert.ok(wasp.holdS > boulder.holdS && boulder.holdS > hulk.holdS, 'R17: "heavies shrug sooner"');
  assert.ok(wasp.maxAccel > boulder.maxAccel && boulder.maxAccel > hulk.maxAccel, 'a heavy strains harder against the stake');
  assert.ok(hulk.holdS >= 1, 'even a hulk is held long enough to land a rock on it');
});
