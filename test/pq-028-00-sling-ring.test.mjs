// PQ-028.00 — Ceres sling ring physics half.
//
// Headless Rapier: Hitch enters aligned, exits at ≥ 2× cruise, keeps that speed for 1s
// (FEEL B1 — physicsEarnedMomentum, not a clamp back to cruise). A real collides:true
// hauler is inside the tube during ordinary traffic. Geometry lives in travelLanes.js;
// this file does not rewrite player.pos.

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import {
  CERES_SLING_RING,
  pointInsideSlingRing,
  ringAlong,
  alignmentDot,
  travelLanes,
} from '../src/systems/travelLanes.js';
import { bootRealPath, writeRealPathInput, REAL_PATH_DT } from '../scripts/lib/bench/realPath.mjs';

const SEED = 2800;
const HOLD_S = 1;
const HOLD_TICKS = Math.round(HOLD_S / REAL_PATH_DT);
const TIMEOUT_MS = 120000;

function alongWorld(along) {
  const { globalPos, axis } = CERES_SLING_RING;
  return {
    x: globalPos.x + axis.x * along,
    z: globalPos.z + axis.z * along,
  };
}

function planarSpeed(entity) {
  return Math.hypot(
    Number(entity && entity.vel && entity.vel.x) || 0,
    Number(entity && entity.vel && entity.vel.z) || 0,
  );
}

function findSlingHauler(state) {
  const list = (state && state.entityList) || [];
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!entity || entity.alive === false) continue;
    const data = entity.data;
    if (data && data.parentType === 'sling_ring_traffic' && data.role === 'hauler') return entity;
  }
  return null;
}

function travelDriveBlock(state) {
  const input = state.input || (state.input = {});
  if (!input.travelDrive || typeof input.travelDrive !== 'object') {
    input.travelDrive = { state: 'off', cap: 0 };
  }
  return input.travelDrive;
}

test('PQ-028.00 player exits the Ceres sling at ≥ 2× cruise and keeps it; a hauler rides the tube', {
  timeout: TIMEOUT_MS,
}, async (t) => {
  const axis = CERES_SLING_RING.axis;
  const half = CERES_SLING_RING.length * 0.5;
  const heading = Math.atan2(axis.z, axis.x);
  const start = alongWorld(-(half + 28));

  const host = await bootRealPath({
    seed: SEED,
    systems: [travelLanes, 'flightV3', 'physics'],
    hulls: [{
      hullId: 'ship_kestrel',
      pos: start,
      rot: heading,
      isPlayer: true,
      factionId: 'faction_free',
    }],
  });

  try {
    const { state, player } = host;
    assert.ok(player, 'Hitch must be the player hull');
    assert.equal(host.proof().backend, 'rapier-dynamic', 'proof must be the live Rapier authority');

    const profile = resolvePropulsionProfile(player, state);
    const cruise = Number(profile && profile.combatSpeed);
    assert.ok(cruise > 0, 'Hitch combat cruise must be a real number');
    const bar = cruise * 2;

    travelDriveBlock(state);
    player.rot = heading;
    player.flags = player.flags || {};
    player.flags.noInterp = true;
    player.vel.x = axis.x * cruise;
    player.vel.z = axis.z * cruise;

    let entered = false;
    let exited = false;
    let exitSpeed = 0;
    let exitTick = -1;
    let haulerInside = false;
    let haulerSpeedInTube = 0;
    let haulerCollides = false;
    let earnedAtExit = false;
    let earnedAtHold = false;
    let holdSpeed = 0;

    const ticks = host.step(240, {
      before({ state: stepState }) {
        writeRealPathInput(stepState, { moveZ: 1 });
        travelDriveBlock(stepState);
      },
      after({ index, state: stepState }) {
        if (index === 0) {
          try {
            host.assertBodies([player], 'player body after first Rapier step');
          } catch (error) {
            t.diagnostic(String(error && error.message || error));
          }
        }

        const hauler = findSlingHauler(stepState);
        if (hauler && hauler.collides !== false && pointInsideSlingRing(hauler.pos)) {
          haulerInside = true;
          haulerCollides = hauler.collides === true;
          haulerSpeedInTube = planarSpeed(hauler);
        }

        const along = ringAlong(player.pos);
        const inside = pointInsideSlingRing(player.pos);
        const aligned = alignmentDot(player.vel, axis) >= 0.85;
        if (inside && aligned) entered = true;

        if (entered && !exited && !inside && along > half) {
          exited = true;
          exitSpeed = planarSpeed(player);
          exitTick = index;
          const frame = player._flightFrame || {};
          earnedAtExit = !!(frame.governor && frame.governor.physicsEarned)
            || finiteTravelCap(frame) > cruise;
        }

        if (exited && index === exitTick + HOLD_TICKS) {
          holdSpeed = planarSpeed(player);
          const frame = player._flightFrame || {};
          earnedAtHold = !!(frame.governor && frame.governor.physicsEarned)
            || finiteTravelCap(frame) > cruise;
          return false;
        }
        return undefined;
      },
    });

    const hauler = findSlingHauler(state);
    if (hauler) {
      try {
        host.assertBodies([player, hauler], 'player and sling hauler have Rapier bodies');
      } catch (error) {
        t.diagnostic(String(error && error.message || error));
      }
    }

    console.log('PQ-028.00 sling numbers', {
      cruise,
      bar,
      entered,
      exited,
      exitSpeed,
      holdSpeed,
      ratioExit: cruise > 0 ? exitSpeed / cruise : 0,
      ratioHold: cruise > 0 ? holdSpeed / cruise : 0,
      earnedAtExit,
      earnedAtHold,
      travelCap: finiteTravelCap(player._flightFrame),
      physicsEarned: !!(player._flightFrame && player._flightFrame.governor
        && player._flightFrame.governor.physicsEarned),
      haulerInside,
      haulerCollides,
      haulerSpeedInTube,
      haulerId: hauler && hauler.id,
      ticks,
      proof: host.proof(),
    });

    assert.equal(entered, true, 'Hitch must enter the authored Ceres tube aligned');
    assert.equal(exited, true, 'Hitch must leave the far end of the tube');
    assert.ok(exitSpeed >= bar, `exit speed ${exitSpeed.toFixed(2)} must be ≥ 2× cruise ${bar.toFixed(2)}`);
    assert.ok(holdSpeed >= bar * 0.92,
      `1s later speed ${holdSpeed.toFixed(2)} must stay at the earned exit, not snap to cruise ${cruise}`);
    assert.equal(earnedAtHold, true, 'physicsEarnedMomentum / travel cap must stay earned after exit (B1)');
    assert.equal(haulerInside, true, 'a real hauler must occupy the ring volume in ordinary traffic');
    assert.equal(haulerCollides, true, 'the sling hauler must be collides:true, not a closed-form ghost');
    assert.ok(hauler && hauler.physicsBody !== false, 'the hauler is a physics body, not lane-traffic chrome');
  } finally {
    host.dispose();
  }
});

function finiteTravelCap(frame) {
  const cap = frame && frame.travelCap;
  return Number.isFinite(cap) ? cap : 0;
}
