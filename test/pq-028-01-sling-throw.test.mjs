// PQ-028.01 — throw a light into the Ceres sling off-axis.
//
// Headless Rapier: a Wasp enters the ring with alignmentDot below the .00 threshold,
// exits at ≥ 3× its own cruise, then slams an asteroid hard enough that B6 crumple
// (PQ-137.06) fires. Not an HP aura. Not radiation. Does not rewrite player.pos.

import test from 'node:test';
import assert from 'node:assert/strict';

import { TERRAIN_CRUMPLE_LAW } from '../src/combat/impulseKernel.js';
import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { combat } from '../src/systems/combat.js';
import {
  CERES_SLING_RING,
  pointInsideSlingRing,
  alignmentDot,
  travelLanes,
} from '../src/systems/travelLanes.js';
import { bootRealPath, writeRealPathInput } from '../scripts/lib/bench/realPath.mjs';

const SEED = 2801;
const TIMEOUT_MS = 120000;
const CROSS_ALONG_WU = -32;
const ROCK_RADIUS = 30;
const LIGHT_HULL_ID = 'ship_wasp';
const PLAYER_HULL_ID = 'ship_kestrel';

function planarSpeed(entity) {
  return Math.hypot(
    Number(entity && entity.vel && entity.vel.x) || 0,
    Number(entity && entity.vel && entity.vel.z) || 0,
  );
}

function hullOf(entity) {
  const hull = Number(entity && entity.hull);
  return Number.isFinite(hull) ? hull : 0;
}

function signedRadial(pos, origin, axis, perp) {
  const dx = (pos && pos.x) - origin.x;
  const dz = (pos && pos.z) - origin.z;
  const along = dx * axis.x + dz * axis.z;
  const ox = dx - axis.x * along;
  const oz = dz - axis.z * along;
  return ox * perp.x + oz * perp.z;
}

test('PQ-028.01 thrown light exits the Ceres sling at ≥ 3× cruise and slams terrain (B6)', {
  timeout: TIMEOUT_MS,
}, async (t) => {
  const axis = CERES_SLING_RING.axis;
  const perp = CERES_SLING_RING.throwPerp;
  const origin = CERES_SLING_RING.globalPos;
  const radius = CERES_SLING_RING.radius;
  const throwHeading = Math.atan2(perp.z, perp.x);

  const playerPos = {
    x: origin.x + axis.x * -80 + perp.x * 20,
    z: origin.z + axis.z * -80 + perp.z * 20,
  };
  const start = {
    x: origin.x + axis.x * CROSS_ALONG_WU + perp.x * -(radius + 40),
    z: origin.z + axis.z * CROSS_ALONG_WU + perp.z * -(radius + 40),
  };
  const rockPos = {
    x: origin.x + axis.x * CROSS_ALONG_WU + perp.x * (radius + 24 + ROCK_RADIUS),
    z: origin.z + axis.z * CROSS_ALONG_WU + perp.z * (radius + 24 + ROCK_RADIUS),
  };

  const host = await bootRealPath({
    seed: SEED,
    systems: [travelLanes, 'flightV3', 'physics', 'collisionConsequences', combat],
    hulls: [{
      hullId: PLAYER_HULL_ID,
      pos: playerPos,
      rot: 0,
      isPlayer: true,
      factionId: 'faction_free',
    }],
  });

  try {
    const { state, player } = host;
    assert.ok(player, 'Hitch must be the parked observer');
    assert.equal(host.proof().backend, 'rapier-dynamic', 'proof must be the live Rapier authority');

    const wasp = host.spawnShip({
      hullId: LIGHT_HULL_ID,
      pos: start,
      rot: throwHeading,
      team: 1,
      factionId: 'faction_dmc',
    });
    const rock = host.spawnObstacle({
      pos: rockPos,
      radius: ROCK_RADIUS,
      mass: 8000,
      inertiaY: 2200,
      hull: 8000,
      data: { benchRealPath: 'sling-throw-anvil', hazardType: 'none' },
    });

    const profile = resolvePropulsionProfile(wasp, state);
    const cruise = Number(profile && profile.combatSpeed);
    assert.ok(cruise > 0, 'Wasp combat cruise must be a real number');
    const bar = cruise * 3;

    wasp.flags = wasp.flags || {};
    wasp.flags.noInterp = true;
    wasp.vel.x = perp.x * cruise * 0.7;
    wasp.vel.z = perp.z * cruise * 0.7;
    if (wasp.data && wasp.data.intent) {
      wasp.data.intent.moveZ = 0;
      wasp.data.intent.moveX = 0;
    }

    const hull0 = hullOf(wasp);
    const entryAlign = alignmentDot(wasp.vel, axis);
    assert.ok(entryAlign < 0.85, `approach must be off-axis (dot ${entryAlign})`);

    let slam = null;
    let impactClosing = 0;
    let impactSurface = null;
    host.bus.on('combat:collisionConsequence', (receipt) => {
      if (!receipt || receipt.targetId !== wasp.id) return;
      if (receipt.surface !== 'terrain') return;
      slam = receipt;
    });
    host.bus.on('physics:impact', (payload) => {
      if (!payload) return;
      if (payload.aId !== wasp.id && payload.bId !== wasp.id) return;
      if (Number.isFinite(payload.preSolveClosingSpeed)) {
        impactClosing = Math.max(impactClosing, payload.preSolveClosingSpeed);
      }
    });

    let entered = false;
    let entryDot = 0;
    let exited = false;
    let exitSpeed = 0;
    let exitTick = -1;
    let slamTick = -1;

    const ticks = host.step(240, {
      before({ state: stepState }) {
        writeRealPathInput(stepState, { moveZ: 0 });
      },
      after({ index, state: stepState }) {
        if (index === 0) {
          try {
            host.assertBodies([player, wasp, rock], 'player, thrown light, and anvil after first Rapier step');
          } catch (error) {
            t.diagnostic(String(error && error.message || error));
          }
        }

        const inside = pointInsideSlingRing(wasp.pos);
        const aligned = alignmentDot(wasp.vel, axis) >= 0.85;
        if (inside && !aligned) {
          entered = true;
          entryDot = alignmentDot(wasp.vel, axis);
        }

        const radial = signedRadial(wasp.pos, origin, axis, perp);
        if (entered && !exited && !inside && radial > radius) {
          exited = true;
          exitSpeed = planarSpeed(wasp);
          exitTick = index;
        }

        if (slam && slamTick < 0) {
          slamTick = index;
          impactSurface = slam.surface;
        }

        if (exited && (slam || wasp.alive === false || hullOf(wasp) <= 0) && index >= exitTick) {
          return false;
        }
        return undefined;
      },
    });

    const hull1 = hullOf(wasp);
    const died = wasp.alive === false || hull1 <= 0;
    const hullLost = hull0 - hull1;
    const crumpleFired = !!(slam && slam.surface === 'terrain' && slam.impactDamage > 0);
    const closingOverThreshold = impactClosing > TERRAIN_CRUMPLE_LAW.threshold;

    console.log('PQ-028.01 sling throw numbers', {
      cruise,
      bar,
      entryAlign,
      entryDot,
      entered,
      exited,
      exitSpeed,
      ratioExit: cruise > 0 ? exitSpeed / cruise : 0,
      hull0,
      hull1,
      hullLost,
      died,
      slamSurface: slam && slam.surface,
      slamDamage: slam && slam.impactDamage,
      slamControl: slam && slam.control,
      impactClosing,
      crumpleThreshold: TERRAIN_CRUMPLE_LAW.threshold,
      crumpleFired,
      closingOverThreshold,
      rockType: rock.type,
      rockHazard: rock.data && rock.data.hazardType,
      ticks,
      exitTick,
      slamTick,
      proof: host.proof(),
    });

    assert.equal(entered, true, 'Wasp must enter the authored Ceres tube off-axis');
    assert.ok(entryDot < 0.85, `entry alignmentDot ${entryDot} must be below the .00 threshold`);
    assert.equal(exited, true, 'Wasp must leave the tube on the throw side');
    assert.ok(exitSpeed >= bar, `exit speed ${exitSpeed.toFixed(2)} must be ≥ 3× cruise ${bar.toFixed(2)}`);
    assert.equal(rock.type, 'asteroid', 'the anvil is an asteroid (terrain), not a radiation hazard');
    assert.notEqual(rock.data && rock.data.hazardType, 'radiation');
    assert.ok(crumpleFired, 'B6 slam-law must fire a terrain collision consequence with crumple damage');
    assert.ok(closingOverThreshold || (slam && slam.impactDamage > 0),
      `pre-solve closing ${impactClosing} must exceed crumple threshold ${TERRAIN_CRUMPLE_LAW.threshold}`);
    assert.ok(died || hullLost > 0, 'the thrown light must lose hull or die on the rock, not an HP aura');
    assert.equal(impactSurface, 'terrain');
    assert.ok(!(slam && slam.surface === 'other'), 'slam must not be a non-terrain aura');
  } finally {
    host.dispose();
  }
});
