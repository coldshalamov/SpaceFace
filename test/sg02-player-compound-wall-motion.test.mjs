import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { installRealmFs } from '../scripts/lib/simRealm.mjs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';

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

test('a player thrusting into Coalition HQ keeps native wall braking and backs out under reverse control', async () => {
  installRealmFs({ readFileSync, resolve });
  const sim = createSimHost();
  try {
    const seed = 2327391364;
    await sim.init({ profile: 'production', seed, viewport: { w: 1280, h: 720 } });
    await sim.tick({ steps: 0, commands: [{ t: 'rpc', seq: 1, p: {
      id: 'boot', op: 'newGameBoot', payload: { opts: { seed } },
    } }] });
    await sim.tick({ steps: 2, commands: [
      { t: 'settings', seq: 2, p: { path: 'timeScale', value: 1 } },
      { t: 'mode', seq: 3, p: { mode: 'flight' } },
    ] });
    const state = sim.host.state;
    const owner = sim.host.registry.get('physics')._sg02;
    const player = state.entities.get(state.playerId);
    const station = [...state.entities.values()].find(entity => entity.type === 'station'
      && entity.data?.stationId === 'station_coalition');
    assert.ok(station, 'the production station anchor is present');
    player.pos.x = -1040;
    player.pos.z = 1093;
    player.vel.x = 194;
    player.vel.z = 5.75;
    player.rot = 0.0297;
    player.angVel = 0;
    owner.syncFromEntities([player, station]);
    const rec = owner.records.get(player.id);
    const stationRec = owner.records.get(station.id);
    assert.ok(stationRec && stationRec.spec.dynamic === false);
    assert.equal(stationRec.colliders.length, 22, 'the real compound station proxy remains in the fixture');

    const heading = player.rot;
    const mass = rec.spec.mass;
    let contactTicks = 0;
    let minimumSpeed = Infinity;
    let travelled = 0;
    let velocityTravel = 0;
    for (let n = 0; n < 180; n++) {
      const before = { x: player.pos.x, z: player.pos.z };
      writePhysicsControl(player, { force: {
        x: Math.cos(heading) * 130 * mass,
        z: Math.sin(heading) * 130 * mass,
      }, maxSpeed: 195 });
      owner.step(1 / 60, 8020 + n);
      const impacts = owner.drainContactImpacts();
      if (impacts.some(row => row.aId === player.id || row.bId === player.id)) contactTicks++;
      const nativePos = rec.body.translation();
      const nativeVel = rec.body.linvel();
      assert.equal(player.pos.x, nativePos.x);
      assert.equal(player.pos.z, nativePos.z);
      assert.ok(Math.abs(player.vel.x - nativeVel.x) < 1e-4);
      assert.ok(Math.abs(player.vel.z - nativeVel.z) < 1e-4);
      assert.ok(Math.abs(player.rot - heading) < 1e-6,
        'compound wall response does not take control of the player heading');
      const speed = Math.hypot(player.vel.x, player.vel.z);
      minimumSpeed = Math.min(minimumSpeed, speed);
      travelled += Math.hypot(player.pos.x - before.x, player.pos.z - before.z);
      velocityTravel += speed / 60;
    }
    assert.ok(contactTicks > 0, 'the native Coalition HQ compound records player contact');
    assert.ok(minimumSpeed < 20,
      `native wall braking must reach a stop/slide state instead of restoring thrust (${minimumSpeed})`);
    assert.ok(travelled >= velocityTravel * 0.5,
      `published velocity must describe actual stop/slide motion (${travelled} WU vs ${velocityTravel} WU)`);

    const releasePos = { x: player.pos.x, z: player.pos.z };
    for (let n = 0; n < 60; n++) {
      writePhysicsControl(player, { force: {
        x: -Math.cos(heading) * 130 * mass,
        z: -Math.sin(heading) * 130 * mass,
      }, maxSpeed: 195 });
      owner.step(1 / 60, 8200 + n);
      owner.drainContactImpacts();
    }
    const reverseDistance = Math.hypot(player.pos.x - releasePos.x, player.pos.z - releasePos.z);
    assert.ok(reverseDistance > 10,
      `reverse control escapes the native station wall (${reverseDistance} WU)`);
  } finally { sim.shutdown(); }
});

test('a fixed-wall stop survives a simultaneous dynamic shove without spending extra give budget', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: 1 / 60 });
  try {
    const player = makeContactFixtureEntity(1, { isPlayer: true, vx: 100, vz: -1 });
    const wall = makeContactFixtureEntity(2, { dynamic: false, x: 20, z: 0 });
    const traffic = makeContactFixtureEntity(3, { dynamic: true, x: 20, z: 20 });
    owner.syncFromEntities([player, wall, traffic]);
    owner.step(1 / 60);
    owner.drainContactImpacts();
    const rec = owner.records.get(player.id);
    // Exact mixed-contact method fixture: the fixed wall removes 1 WU/s of incoming Z motion,
    // while a dynamic partner adds 30 WU/s in X. The receipts are the production orientation:
    // the helper flips aId→bId into the fixed body's outward normal for player A.
    rec.body.setLinvel({ x: 130, y: 0, z: 0 }, true);
    rec.postStep.vDirty = true;
    owner._stepContactReceipts = [
      {
        aId: player.id, bId: wall.id, normal: { x: 0, z: -1 },
        preSolveClosingNormal: { x: 0, z: -1 }, preSolveClosingSpeed: 1,
      },
      {
        aId: player.id, bId: traffic.id, normal: { x: 1, z: 0 },
        preSolveClosingNormal: { x: 1, z: 0 }, preSolveClosingSpeed: 0,
      },
    ];
    rec._playerContactCumulativeDeltaV = 0;
    owner._applyPlayerStructuralGive(rec);
    const velocity = rec.body.linvel();
    assert.ok(Math.abs(velocity.z) < 1e-5,
      `native wall stopping survives the mixed response (z=${velocity.z})`);
    assert.ok(velocity.x <= 105 + 1e-5,
      `dynamic shove stays inside the 5 WU/s give budget (x=${velocity.x})`);
    assert.ok(Math.abs(velocity.x - 105) < 1e-5,
      `the fixed stop is preserved while the dynamic shove admits exactly its budget (x=${velocity.x})`);
    assert.ok((rec._playerContactCumulativeDeltaV || 0) <= 5 + 1e-5,
      `only unrelated solver motion draws on the episode budget (got ${rec._playerContactCumulativeDeltaV})`);
    assert.equal(rec.expected.vx, 100, 'the trusted expected velocity remains untouched');
    assert.equal(rec.expected.vz, -1, 'the trusted expected normal motion remains untouched');
  } finally {
    owner._stepContactReceipts = null;
    owner.dispose();
  }
});

test('a glancing fixed-wall stop keeps a small finite rebound when the pose rewrite is forced', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: 1 / 60 });
  try {
    const player = makeContactFixtureEntity(1, { isPlayer: true, vx: 100, vz: -50 });
    const wall = makeContactFixtureEntity(2, { dynamic: false, x: 20, z: 0 });
    owner.syncFromEntities([player, wall]);
    owner.step(1 / 60);
    owner.drainContactImpacts();
    const rec = owner.records.get(player.id);
    // Native response: the wall cancels the 50 WU/s incoming normal component and leaves a
    // 1 WU/s rebound. raw Δv is 51 (> MAX_CONTACT_DV), while the residual 1 fits the 5 WU/s
    // event budget, so the fixed-wall pose rewrite runs with an infinite budget sentinel.
    rec.body.setLinvel({ x: 100, y: 0, z: 1 }, true);
    rec.postStep.vDirty = true;
    owner._stepContactReceipts = [{
      aId: player.id, bId: wall.id, normal: { x: 0, z: -1 },
      preSolveClosingNormal: { x: 0, z: -1 }, preSolveClosingSpeed: 50,
    }];
    rec._playerContactCumulativeDeltaV = 0;
    owner._applyPlayerStructuralGive(rec);
    const velocity = rec.body.linvel();
    const pose = rec.body.translation();
    assert.equal(velocity.x, 100);
    assert.ok(Math.abs(velocity.z - 1) < 1e-5,
      `the small rebound remains finite and unamplified (z=${velocity.z})`);
    assert.ok(Number.isFinite(pose.x) && Number.isFinite(pose.z),
      `forced wall pose rewrite remains finite (${pose.x},${pose.z})`);
    assert.equal(rec._playerContactCumulativeDeltaV, 1,
      'only the 1 WU/s residual is charged to the contact episode');
  } finally {
    owner._stepContactReceipts = null;
    owner.dispose();
  }
});

function makeContactFixtureEntity(id, options = {}) {
  const dynamic = options.dynamic !== false;
  const radius = 6;
  const mass = dynamic ? 24 : 1_000_000;
  return {
    id,
    type: dynamic ? 'ship' : 'asteroid',
    alive: true,
    isPlayer: options.isPlayer === true,
    collides: true,
    radius,
    mass,
    combatSpeed: 50,
    maxSpeed: 50,
    pos: { x: options.x || 0, z: options.z || 0 },
    vel: { x: options.vx || 0, z: options.vz || 0 },
    rot: 0,
    angVel: 0,
    physicsBody: {
      schemaVersion: 1,
      radius,
      mass,
      inertiaY: dynamic ? 48 : 1_000_000,
      dynamic,
      ccd: dynamic,
      revision: 0,
    },
    data: {},
  };
}
