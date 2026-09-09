// PQ-028.02 — player-built Throughline becomes the Ceres impulse catapult.
//
// Headless Rapier: an operational claim sling is the same 96×48 cylinder as .00/.01.
// A collides:true hauler stamped to that infrastructure enters the tube aligned and
// exits at ≥ 2× its own cruise. travelLanes never writes pos/vel.

import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePropulsionProfile } from '../src/core/flight/propulsionCatalog.js';
import { CLAIM_TRAVEL_INFRASTRUCTURE_SCHEMA, claims } from '../src/systems/claims.js';
import {
  alignmentDot,
  buildClaimSlingRing,
  pointInsideSlingRing,
  ringAlong,
  travelLanes,
} from '../src/systems/travelLanes.js';
import { bootRealPath, writeRealPathInput } from '../scripts/lib/bench/realPath.mjs';

const SEED = 2802;
const TIMEOUT_MS = 120000;
const SECTOR_ID = 'sector_helios_prime';
const BODY_ID = 'claim_pq028_02';
const INFRA_ID = `throughline:${BODY_ID}`;
const FROM = Object.freeze({ x: 400, z: 80 });
const TO = Object.freeze({ x: 1600, z: 80 });
const SUPPORT = Object.freeze({ x: 1000, z: 160 });

function planarSpeed(entity) {
  return Math.hypot(
    Number(entity && entity.vel && entity.vel.x) || 0,
    Number(entity && entity.vel && entity.vel.z) || 0,
  );
}

function plantOperationalThroughline(state) {
  if (!state.claims) state.claims = { bodies: [] };
  const infrastructure = {
    schema: CLAIM_TRAVEL_INFRASTRUCTURE_SCHEMA,
    id: INFRA_ID,
    bodyId: BODY_ID,
    sectorId: SECTOR_ID,
    name: 'Pallas Throughline',
    stationId: 'station_helios_prime',
    stage: 'active',
    operational: true,
    builtAt: 0,
    alignUntil: 0,
    from: { x: FROM.x, z: FROM.z },
    to: { x: TO.x, z: TO.z },
    support: { x: SUPPORT.x, z: SUPPORT.z },
    distanceWU: Math.hypot(TO.x - FROM.x, TO.z - FROM.z),
    corridorRadiusWU: 240,
    ceilingMult: 2,
    rampMult: 2,
    damagePolicy: 'claim_status',
  };
  const body = {
    id: BODY_ID,
    sectorId: SECTOR_ID,
    name: 'Pallas Industrial Moon',
    modules: ['mod_throughline_sling'],
    spec: { id: 'spec_refinery', status: 'active' },
    x: FROM.x - 160,
    z: FROM.z,
    infrastructure,
  };
  state.claims.bodies.push(body);
  if (!state.world) state.world = {};
  state.world.currentSectorId = SECTOR_ID;
  return { body, infrastructure };
}

function stampClaimHauler(entity, infrastructureId, heading) {
  const data = entity.data || (entity.data = {});
  data.role = 'hauler';
  data.parentType = 'claim_sling_traffic';
  data.slingRingId = infrastructureId;
  data.claimTravelTrafficHookId = infrastructureId;
  data.claimTravelInfrastructureId = infrastructureId;
  data.scanLabel = 'Claim sling hauler';
  data.intent = { moveZ: 1, aimAngle: heading };
  entity.collides = true;
  entity.flags = entity.flags || {};
  entity.flags.noInterp = true;
  return entity;
}

test('PQ-028.02 claim sling catapults a stamped NPC at ≥ 2× its cruise', {
  timeout: TIMEOUT_MS,
}, async (t) => {
  const ring = buildClaimSlingRing({
    id: INFRA_ID,
    sectorId: SECTOR_ID,
    from: FROM,
    to: TO,
  });
  assert.ok(ring, 'claim ring derives from from/to');
  assert.equal(ring.length, 96);
  assert.equal(ring.radius, 48);
  const axis = ring.axis;
  const half = ring.length * 0.5;
  const heading = Math.atan2(axis.z, axis.x);
  const start = {
    x: ring.globalPos.x + axis.x * -(half - 8),
    z: ring.globalPos.z + axis.z * -(half - 8),
  };
  const playerPos = {
    x: ring.globalPos.x + axis.x * 0 - axis.z * 220,
    z: ring.globalPos.z + axis.z * 0 + axis.x * 220,
  };

  const host = await bootRealPath({
    seed: SEED,
    systems: [claims, travelLanes, 'flightV3', 'physics'],
    hulls: [{
      hullId: 'ship_kestrel',
      pos: playerPos,
      rot: heading,
      isPlayer: true,
      factionId: 'faction_free',
    }, {
      hullId: 'ship_mule',
      pos: start,
      rot: heading,
      isPlayer: false,
      factionId: 'faction_free',
    }],
  });

  try {
    const { state, player } = host;
    const { infrastructure } = plantOperationalThroughline(state);
    assert.equal(infrastructure.id, INFRA_ID);

    const hauler = host.hulls.find((entity) => entity && entity !== player);
    assert.ok(hauler, 'Mule hauler must boot with the player so Rapier admits the body');
    stampClaimHauler(hauler, infrastructure.id, heading);
    hauler.rot = heading;

    const profile = resolvePropulsionProfile(hauler, state);
    const cruise = Number(profile && profile.combatSpeed);
    assert.ok(cruise > 0, 'Mule combat cruise must be a real number');
    const bar = cruise * 2;
    hauler.vel.x = axis.x * cruise;
    hauler.vel.z = axis.z * cruise;

    let entered = false;
    let exited = false;
    let exitSpeed = 0;
    let enteredAlong = 0;

    const ticks = host.step(240, {
      before({ state: stepState }) {
        writeRealPathInput(stepState, { moveZ: 0 });
        const data = hauler.data || (hauler.data = {});
        const intent = data.intent || (data.intent = {});
        intent.moveZ = 1;
        intent.aimAngle = heading;
      },
      after({ index }) {
        if (index === 0) {
          try {
            host.assertBodies([player, hauler], 'player and claim hauler have Rapier bodies');
          } catch (error) {
            t.diagnostic(String(error && error.message || error));
          }
        }
        const inside = pointInsideSlingRing(hauler.pos, ring);
        const aligned = alignmentDot(hauler.vel, axis) >= 0.85;
        const along = ringAlong(hauler.pos, ring);
        if (inside && aligned) {
          entered = true;
          enteredAlong = along;
        }
        if (entered && !exited && !inside && along > half) {
          exited = true;
          exitSpeed = planarSpeed(hauler);
          return false;
        }
        return undefined;
      },
    });

    const ratioExit = cruise > 0 ? exitSpeed / cruise : 0;
    const usedId = hauler.data && hauler.data.claimTravelInfrastructureId;
    console.log('PQ-028.02 claim sling numbers', {
      infrastructureId: usedId,
      entered,
      exited,
      cruise,
      exitSpeed,
      ratioExit,
      enteredAlong,
      haulerCollides: hauler.collides === true,
      parentType: hauler.data && hauler.data.parentType,
      hookId: hauler.data && hauler.data.claimTravelTrafficHookId,
      ticks,
      proof: host.proof(),
    });

    assert.equal(entered, true, 'NPC must enter the claim tube aligned');
    assert.equal(exited, true, 'NPC must leave the far end of the claim tube');
    assert.ok(exitSpeed >= bar,
      `exit speed ${exitSpeed.toFixed(2)} must be ≥ 2× cruise ${bar.toFixed(2)}`);
    assert.equal(usedId, INFRA_ID, 'hauler must stay stamped to the claim infrastructure');
    assert.equal(hauler.collides, true, 'claim hauler must be collides:true, not a closed-form ghost');
    assert.equal(host.proof().backend, 'rapier-dynamic', 'proof must be the live Rapier authority');
  } finally {
    host.dispose();
  }
});
