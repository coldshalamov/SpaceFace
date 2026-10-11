// STEP C — station recoil preserves collision and docking behavior on the production route.
//
// A generated station (world.js spawn path, real collisionProxy skin) is an anchored body: a
// blast beside it feeds the recoil spring (bounded offset/velocity, exact settle back to the
// authored rest pose), never the free body integrator. While the station is mid-recoil the
// docking corridor reads the live entity pose — the same scripted approach path the corridor
// tests use must still berth — and a hull driven into the recoiling silhouette must stay
// solver-separated with no collision-consequence damage on the player (NPC-only by contract).
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { dockingCorridor } from '../src/systems/dockingCorridor.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { resolveAutopilotTarget } from '../src/systems/flightV3.js';
import { schedulePhysicalBlast, deliverPhysicalImpulse } from '../src/combat/physicalEffects.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import {
  proxyOuterRadiusWu,
  proxyWorldPrimitives,
  resolveBerthWorld,
  resolveCollisionProxyManifest,
  resolveCorridorAxisWorld,
} from '../src/data/collisionProxyManifests.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';

const DT = SIM_DT;
const SECTOR = 'sector_helios_prime';

async function bootSector(seed = 4242, systems = [dockingCorridor, physics, world]) {
  const bus = createBus();
  const sim = createSimulation({ seed, bus, systems });
  const { state } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 14, mass: 32, collides: true,
    vel: { x: 0, z: 0 }, rot: 0, angVel: 0, hull: 200, hullMax: 200, flags: {}, data: {},
  });
  state.playerId = player.id;
  player.isPlayer = true;
  sim.registry.get('world').enterSector(SECTOR);
  const ready = await sim.registry.get('physics').prepareBackend(state);
  assert.equal(ready, true, 'the production Rapier owner boots headless');
  const station = state.entityList.find(
    (e) => e.alive && e.type === 'station' && e.data && e.data.stationId === 'station_helios');
  assert.ok(station, 'the generated Helios sector spawns its trade-hub station');
  assert.ok(station.data.collisionProxy, 'the production spawn path carries the compound proxy');
  return { sim, state, bus, player, station };
}

/** Radial shove through the shared blast adapter — the same delivery a detonation uses. */
function blastBeside(state, helpers, center, radius, impulse) {
  schedulePhysicalBlast(state, {
    center, radius, helpers,
    onBody: (body) => {
      const dx = body.pos.x - center.x, dz = body.pos.z - center.z;
      const d = Math.hypot(dx, dz) || 1;
      deliverPhysicalImpulse(state, body, { x: (dx / d) * impulse, z: (dz / d) * impulse },
        { kind: 'test_blast', tick: state.tick });
    },
  });
}

function recoilOffset(station) {
  const r = station.physicsBody && station.physicsBody.anchorRecoil;
  return r ? Math.hypot(r.x, r.z) : 0;
}

test('a blast beside a generated station drives bounded recoil that settles exactly to rest', async () => {
  const t = await bootSector(4242, [physics, world]);
  try {
    const { sim, state, station } = t;
    const rest = { x: station.pos.x, z: station.pos.z };
    blastBeside(state, sim.helpers, { x: rest.x + 300, z: rest.z }, 340, 1600);
    assert.ok(station.physicsBody.anchorRecoil, 'the anchored station took the recoil record');
    let maxOffset = 0;
    let sawMoved = false;
    for (let i = 0; i < 90; i++) {
      sim.step(DT);
      maxOffset = Math.max(maxOffset, recoilOffset(station));
      if (Math.hypot(station.pos.x - rest.x, station.pos.z - rest.z) > 0.01) sawMoved = true;
    }
    assert.ok(sawMoved, 'the recoiled pose reaches the entity — colliders and docking follow it');
    assert.ok(maxOffset > 0.05 && maxOffset <= 3 + 1e-6,
      `offset stays inside the recoil clamp (got ${maxOffset.toFixed(3)})`);
    assert.ok(station.rot === 0 && (station.angVel || 0) === 0, 'no rotation is ever driven');
    sim.runTicks(600, DT);
    const recoil = station.physicsBody.anchorRecoil;
    assert.equal(recoil.settled, true, 'the spring runs to rest');
    assert.equal(station.pos.x, rest.x);
    assert.equal(station.pos.z, rest.z, 'the station returns to the exact authored pose');
    assert.equal(Math.hypot(station.vel.x, station.vel.z), 0);
  } finally { t.sim.dispose(); }
});

test('the scripted dock approach berths while the station is mid-recoil', async () => {
  const t = await bootSector(4343);
  try {
    const { sim, state, player, station } = t;
    const manifest = resolveCollisionProxyManifest(station);
    assert.ok(manifest && manifest.docking, 'the generated station resolves its docking manifest');
    const axis = resolveCorridorAxisWorld(station, manifest);
    const berth = resolveBerthWorld(station, manifest);
    // Start inbound on the corridor lane — the same scripted driver the corridor tests use.
    const along = manifest.docking.corridor.mouthRadius * station.data.dockRadius + 30;
    player.pos.x = station.pos.x + axis.x * along;
    player.pos.z = station.pos.z + axis.z * along;
    player.vel.x = -axis.x * 20;
    player.vel.z = -axis.z * 20;
    const autopilot = {
      active: true, targetEntityId: station.id,
      target: { x: station.pos.x, z: station.pos.z },
      label: 'Helios Station', arrivalRadius: station.data.dockRadius,
    };
    const blastCenter = { x: station.pos.x - axis.z * 240, z: station.pos.z + axis.x * 240 };
    let blasted = false;
    let berthed = false;
    for (let i = 0; i < 3600; i++) {
      if (i === 30) {
        blastBeside(state, sim.helpers, blastCenter, 320, 1600);
        blasted = true;
      }
      const target = resolveAutopilotTarget(state, autopilot);
      if (!target) break;
      const ax = target.x - player.pos.x, az = target.z - player.pos.z;
      const d = Math.hypot(ax, az) || 1;
      const speed = Math.hypot(player.vel.x, player.vel.z);
      if (d > target.arrivalRadius && speed < 45) {
        queuePhysicsImpulse(player,
          { x: (ax / d) * 80 * player.mass * DT, y: 0, z: (az / d) * 80 * player.mass * DT });
      } else if (speed > 8) {
        queuePhysicsImpulse(player,
          { x: -player.vel.x * player.mass * 0.05, y: 0, z: -player.vel.z * player.mass * 0.05 });
      }
      sim.step(DT);
      if (state.dockingCorridor && state.dockingCorridor.phase === 'berthed') { berthed = true; break; }
    }
    assert.ok(blasted, 'the recoil ran during the approach');
    assert.ok(berthed, 'the corridor follows the recoiling station to a berth');
    const distToBerth = Math.hypot(player.pos.x - berth.x, player.pos.z - berth.z);
    assert.ok(distToBerth <= manifest.docking.berth.dockRadius + 3,
      `settled inside the berth gate (d=${distToBerth.toFixed(2)})`);
  } finally { t.sim.dispose(); }
});

test('a hull driven into the recoiling station stays separated and takes no consequence damage', async () => {
  const t = await bootSector(4545, [physics, world, collisionConsequences]);
  try {
    const { sim, state, player, station } = t;
    const prevConsequences = COMBAT_FLAGS.weaponImpulseConsequences;
    COMBAT_FLAGS.weaponImpulseConsequences = true;
    try {
      const manifest = resolveCollisionProxyManifest(station);
      // Drive the hull straight through the largest solid primitive — an off-corridor bearing,
      // guaranteed silhouette contact.
      const primitives = proxyWorldPrimitives(station, manifest);
      const solid = primitives.filter((p) => p.kind === 'circle')
        .sort((a, b) => b.r - a.r)[0];
      assert.ok(solid, 'the compound proxy has a solid face to hit');
      player.pos.x = solid.x + solid.r + player.radius + 70;
      player.pos.z = solid.z;
      player.vel.x = -50; player.vel.z = 0;
      blastBeside(state, sim.helpers, { x: station.pos.x + 300, z: station.pos.z }, 340, 1600);
      let maxOverlap = 0;
      for (let i = 0; i < 300; i++) {
        sim.step(DT);
        const live = proxyWorldPrimitives(station, manifest);
        for (const p of live) {
          if (p.kind !== 'circle') continue;
          const gap = Math.hypot(player.pos.x - p.x, player.pos.z - p.z) - p.r - player.radius;
          if (-gap > maxOverlap) maxOverlap = -gap;
        }
      }
      const outer = proxyOuterRadiusWu(manifest, station);
      const distCenter = Math.hypot(player.pos.x - station.pos.x, player.pos.z - station.pos.z);
      assert.ok(maxOverlap < 3,
        `solver separation holds against the recoiling hull (overlap ${maxOverlap.toFixed(2)} wu)`);
      assert.ok(distCenter < outer + 400,
        'the hull never tunnels through to the far side of the silhouette');
      assert.equal(player.hull, 200, 'the player never takes collision-consequence damage');
      assert.equal(player.alive, true);
      sim.runTicks(600, DT);
      assert.equal(station.physicsBody.anchorRecoil.settled, true, 'the recoil still settles');
    } finally { COMBAT_FLAGS.weaponImpulseConsequences = prevConsequences; }
  } finally { t.sim.dispose(); }
});
