import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { installRealmFs } from '../scripts/lib/simRealm.mjs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';

test('a player thrusting against the authored compound tanker publishes actual native stop/slide motion', async () => {
  installRealmFs({ readFileSync, resolve });
  const sim = createSimHost();
  try {
    await sim.init({ profile: 'production', seed: 4242, viewport: { w: 1280, h: 720 } });
    await sim.tick({ steps: 0, commands: [{ t: 'rpc', seq: 1, p: {
      id: 'boot', op: 'newGameBoot', payload: { opts: { seed: 4242 } },
    } }] });
    await sim.tick({ steps: 2, commands: [
      { t: 'settings', seq: 2, p: { path: 'timeScale', value: 1 } },
      { t: 'mode', seq: 3, p: { mode: 'flight' } },
    ] });
    const state = sim.host.state;
    const owner = sim.host.registry.get('physics')._sg02;
    const player = state.entities.get(state.playerId);
    // Solid dressing is admitted independently of entityList, including this real fixed FX.
    const tanker = [...owner.records.values()].find(rec => rec.entity.data?.placeId
      === 'place_aftermath_wreck_ore_freighter_bow__derelict');
    assert.ok(tanker && tanker.entity.collides === true && !tanker.spec.dynamic);
    assert.ok(tanker.colliders.length > 1, 'exercise the authored compound hull rather than a bounding sphere');
    player.pos.x = -221.703857421875;
    player.pos.z = 532.8331909179688;
    player.vel.x = -65.27440643310547;
    player.vel.z = 41.06315994262695;
    player.rot = 2.5800610852663133;
    player.angVel = 0;
    owner.syncFromEntities([player, tanker.entity]);
    const rec = owner.records.get(player.id);
    const heading = player.rot;
    const mass = rec.spec.mass;
    let traveled = 0, velocityTravel = 0, contacts = 0;
    for (let n = 0; n < 60; n++) {
      const before = { ...player.pos };
      if (n < 30) writePhysicsControl(player, { force: {
        x: Math.cos(heading) * 130 * mass, z: Math.sin(heading) * 130 * mass,
      } });
      owner.step(1 / 60, 1800 + n);
      if (owner.drainContactImpacts().some(row => row.aId === player.id || row.bId === player.id)) contacts++;
      const nativePos = rec.body.translation(), nativeVel = rec.body.linvel();
      assert.equal(player.pos.x, nativePos.x);
      assert.equal(player.pos.z, nativePos.z);
      assert.equal(player.vel.x, nativeVel.x);
      assert.equal(player.vel.z, nativeVel.z);
      assert.ok(Math.abs(player.rot - heading) < 1e-6, 'wall contact does not take control of the player heading');
      traveled += Math.hypot(player.pos.x - before.x, player.pos.z - before.z);
      velocityTravel += Math.hypot(player.vel.x, player.vel.z) / 60;
    }
    assert.ok(contacts > 0, 'native contacts, including the fixed FX hull, actually occur');
    assert.ok(traveled >= velocityTravel * 0.5,
      `reported native velocity must describe real stop/slide motion: ${traveled} WU traveled vs ${velocityTravel} WU reported`);
    const releasePos = { ...player.pos };
    for (let n = 0; n < 30; n++) {
      writePhysicsControl(player, { force: {
        x: -Math.cos(heading) * 130 * mass, z: -Math.sin(heading) * 130 * mass,
      } });
      owner.step(1 / 60, 1860 + n);
      owner.drainContactImpacts();
    }
    assert.ok(Math.hypot(player.pos.x - releasePos.x, player.pos.z - releasePos.z) > 10,
      'reverse control releases the ship from the hull through native motion');
  } finally { sim.shutdown(); }
});
