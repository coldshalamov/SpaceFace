// D186 — the 47-A handoff zone must never move before the player's first input.
//
// The public Adventure trace (seed 4242) caught beacon 378 at 11.65 WU/s at sim 0.567 s, 345 WU
// from the player: an unowned physicsBody defaults to a dynamic ball with real SG-02 contacts,
// so anything brushing the 1-mass zone shoves it away from where the scene authored it. The fix
// authors physicsBody: false — the scripted-pose opt-out shouldSyncPhysicsBodyEntity exists for.
// This fixture pins that contract through the production reader, so a future revert to an
// owned/default body fails here instead of drifting on the public route.
import assert from 'node:assert/strict';
import test from 'node:test';

import { spawn47aScenarioCast } from '../src/data/scenarios/47aLiveScene.js';
import { shouldSyncPhysicsBodyEntity } from '../src/core/physicsAuthority.js';

function spawnColdCast() {
  let id = 10;
  const spawned = [];
  const cast = spawn47aScenarioCast({
    state: { playerId: 1 },
    liveColdStartSafe: true,
    spawn(spec) {
      const entity = structuredClone(spec);
      entity.id = id++;
      entity.prevPos = { ...entity.pos };
      spawned.push(entity);
      return entity;
    },
  });
  return { cast, spawned };
}

test('the kessler handoff zone is a scripted marker physics never owns', () => {
  const { cast } = spawnColdCast();
  const beacon = cast.handoffBeacon;
  assert.ok(beacon, 'the cold cast spawns the handoff beacon');
  assert.equal(beacon.data?.handoffZone, true);
  // Authored contract: no SG-02 body — pose stays with the scene.
  assert.equal(beacon.physicsBody, false, 'physicsBody: false is the scripted-pose opt-out');
  assert.equal(
    shouldSyncPhysicsBodyEntity(beacon),
    false,
    'the physics authority must not sync the handoff zone as a body',
  );
  // The zone the contact flies to is where the scene authored it.
  assert.deepEqual(beacon.pos, { x: 282, z: -198 });
  assert.deepEqual(beacon.vel, { x: 0, z: 0 });
});

test('the opt-out is targeted: the rest of the cast keeps default body ownership', () => {
  const { spawned } = spawnColdCast();
  const optOuts = spawned.filter((entity) => entity.physicsBody === false);
  assert.equal(optOuts.length, 1, 'only the handoff beacon opts out of physics sync');
  assert.equal(optOuts[0].data?.handoffZone, true);
});
