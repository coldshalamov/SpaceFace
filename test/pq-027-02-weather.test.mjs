// PQ-027.02 — weather that shapes fights. One storm sheet and one radiation
// belt per affected sector: shots bend, sensors shrink, a stacked well reads
// louder, ordinary traffic is shoved off. Neither is a hull-drain aura.
// `radiation` zone type is forbidden — world.js would chew hull.
import assert from 'node:assert/strict';
import test from 'node:test';

import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import {
  normalizeField,
  projectFieldTrajectory,
  sampleFieldAcceleration,
} from '../src/core/fields/fieldKernel.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { hazardHints } from '../src/data/hazardLanguage.js';
import {
  VEIL_WEATHER_SECTOR_ID,
  VESTA_WEATHER_SECTOR_ID,
  WEATHER_SCAN_SCALE_INSIDE,
  WEATHER_VOLUMES,
  pointInsideWeatherVolume,
  weatherPhase,
  weatherScanScale,
  weatherWindowAt,
} from '../src/data/environmentalMachinery.js';
import { environmentalMachinery } from '../src/systems/environmentalMachinery.js';
import { fields } from '../src/systems/fields.js';

const LONG = { timeout: 180_000 };
const SEED = 2702;
const PLAYER_HULL_ID = 'ship_kestrel';
const HAULER_HULL_ID = 'ship_mule';
const WASP_HULL_ID = 'ship_wasp';
const SHOT_TICKS = 45;
const FIGHT_SHOT_TICKS = 50;
const HAUL_TICKS = 90;
const SHOT_SPEED = 140;
const PROFILE_ID = 'production';

const STORM = WEATHER_VOLUMES.find((row) => row.id === 'veil_storm_lane');
const BELT = WEATHER_VOLUMES.find((row) => row.id === 'veil_radiation_belt');
const SURGE_S = STORM.cycle.warningS + 0.4;
const CALM_S = STORM.cycle.warningS + STORM.cycle.surgeS + 0.4;

function perpOf(dir) {
  return { x: -dir.z, z: dir.x };
}

function alongPoint(volume, along, across) {
  const dir = volume.field.dir;
  const perp = perpOf(dir);
  return {
    x: volume.field.center.x + dir.x * along + perp.x * across,
    z: volume.field.center.z + dir.z * along + perp.z * across,
  };
}

function lateralOf(volume, pos) {
  const origin = volume.field.center;
  const dir = volume.field.dir;
  const dx = pos.x - origin.x;
  const dz = pos.z - origin.z;
  const along = dx * dir.x + dz * dir.z;
  return Math.hypot(dx - dir.x * along, dz - dir.z * along);
}

function formatRow(row) {
  return [
    `PQ-027.02 seed=${SEED}`,
    `shotBend=${row.shotBend.toFixed(2)}`,
    `shotTowardRail=${row.shotTowardRail.toFixed(1)}`,
    `scanScale=${row.scanScale}`,
    `trafficMoved=${row.trafficMoved}`,
    `trafficSteersAround=${row.trafficSteersAround}`,
    `haulLateral0=${row.haulLateral0.toFixed(1)}`,
    `haulLateral=${row.haulLateral.toFixed(1)}`,
    `haulDelta=${row.haulDelta.toFixed(1)}`,
    `wellOnly=${row.wellOnly.toFixed(1)}`,
    `stacked=${row.stacked.toFixed(1)}`,
    `stormType=${row.stormType}`,
    `beltType=${row.beltType}`,
    `windowPhase=${row.windowPhase}`,
    `windowRemainingS=${row.windowRemainingS.toFixed(2)}`,
    `backend=${row.proof.backend}`,
  ].join(' ');
}

function kernelShot() {
  const field = normalizeField({ ...STORM.field, strength: STORM.field.strength });
  const pos = alongPoint(STORM, 90, 36);
  const dir = STORM.field.dir;
  const vel = { x: dir.x * SHOT_SPEED, z: dir.z * SHOT_SPEED };
  const shotAccel = sampleFieldAcceleration(pos, vel, [field], SURGE_S, {
    mass: 0.4, type: 'projectile', marked: false,
  }, { ax: 0, az: 0 });
  const towardRail = -(shotAccel.ax * perpOf(dir).x + shotAccel.az * perpOf(dir).z);
  const vacuum = projectFieldTrajectory(pos, vel, [], { mass: 0.4, type: 'projectile' }, {
    dt: 1 / 60, steps: SHOT_TICKS, simTime: SURGE_S,
  });
  const storm = projectFieldTrajectory(pos, vel, [field], { mass: 0.4, type: 'projectile' }, {
    dt: 1 / 60, steps: SHOT_TICKS, simTime: SURGE_S,
  });
  return {
    towardRail,
    bend: Math.hypot(storm.end.x - vacuum.end.x, storm.end.z - vacuum.end.z),
  };
}

function kernelBelt() {
  const belt = normalizeField({ ...BELT.field, strength: BELT.field.strength });
  const pos = { x: BELT.field.center.x + 120, z: BELT.field.center.z };
  const playerWell = normalizeField({
    id: 'player_well',
    kind: 'well',
    center: { x: BELT.field.center.x, z: BELT.field.center.z },
    radius: 200,
    strength: 240,
    falloff: 1.6,
  });
  const wellOnly = sampleFieldAcceleration(pos, { x: 0, z: 0 }, [playerWell], SURGE_S, {
    mass: 8, type: 'pickup', marked: false,
  }, { ax: 0, az: 0 });
  const stacked = sampleFieldAcceleration(pos, { x: 0, z: 0 }, [playerWell, belt], SURGE_S, {
    mass: 8, type: 'pickup', marked: false,
  }, { ax: 0, az: 0 });
  return {
    wellOnly: Math.hypot(wellOnly.ax, wellOnly.az),
    stacked: Math.hypot(stacked.ax, stacked.az),
    scanScale: weatherScanScale(VEIL_WEATHER_SECTOR_ID, pos, SURGE_S),
    calmScan: weatherScanScale(VEIL_WEATHER_SECTOR_ID, pos, CALM_S),
    holeScan: weatherScanScale(VEIL_WEATHER_SECTOR_ID, BELT.field.center, SURGE_S),
    inside: pointInsideWeatherVolume(BELT, pos),
  };
}

function spawnShot(host, pos, vel) {
  return host.runtime.spawn({
    type: 'projectile',
    pos: { x: pos.x, z: pos.z },
    vel: { x: vel.x, z: vel.z },
    rot: Math.atan2(vel.z, vel.x),
    radius: 0.7,
    mass: 0.4,
    collides: true,
    ttl: 2,
    team: 0,
    ownerId: host.player.id,
    physicsBody: {
      schemaVersion: 1,
      radius: 0.7,
      mass: 0.4,
      inertiaY: 0.1,
      dynamic: true,
      ccd: true,
      material: 'projectile',
      revision: 0,
    },
    data: { kind: 'bullet', maxDistance: 600, ownerId: host.player.id },
  });
}

async function runLive({ simTime, ticks, withHauler, withShot }) {
  const lanePos = alongPoint(STORM, 90, 36);
  const dir = STORM.field.dir;
  const vel = { x: dir.x * SHOT_SPEED, z: dir.z * SHOT_SPEED };
  const playerPos = alongPoint(STORM, 90, -28);
  const previousFields = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const hulls = [{
    hullId: PLAYER_HULL_ID,
    pos: playerPos,
    rot: 0,
    isPlayer: true,
    factionId: 'faction_free',
  }];
  if (withHauler) {
    hulls.push({
      hullId: HAULER_HULL_ID,
      pos: lanePos,
      rot: Math.atan2(dir.z, dir.x),
      team: 1,
      factionId: 'faction_dmc',
    });
  }
  const host = await bootRealPath({
    seed: SEED,
    profileId: PROFILE_ID,
    systems: [
      'actions',
      'flightV3',
      environmentalMachinery,
      fields,
      hazardHints,
      'physics',
    ],
    hulls,
  });
  try {
    host.state.world = host.state.world || {};
    host.state.world.currentSectorId = VEIL_WEATHER_SECTOR_ID;
    host.state.simTime = simTime;
    const hauler = withHauler ? host.hulls[1] : null;
    host.step(1, {
      before({ state }) {
        state.world.currentSectorId = VEIL_WEATHER_SECTOR_ID;
        state.simTime = simTime;
      },
    });
    const fieldsSys = host.runtime.getSystem('fields');
    const stormLive = fieldsSys && typeof fieldsSys.hasExternal === 'function'
      ? fieldsSys.hasExternal(STORM.field.id)
      : false;
    const bodies = hauler ? [host.player, hauler] : [host.player];
    host.assertBodies(bodies, 'weather bodies');
    const shot = withShot ? spawnShot(host, lanePos, vel) : null;
    const haulLateral0 = hauler ? lateralOf(STORM, hauler.pos) : 0;
    const shot0 = shot ? { x: shot.pos.x, z: shot.pos.z } : null;
    host.step(ticks, {
      before({ state }) {
        state.world.currentSectorId = VEIL_WEATHER_SECTOR_ID;
        state.simTime = simTime;
      },
    });
    return {
      phase: weatherPhase(STORM, simTime).phase,
      stormLive,
      shotEnd: shot ? { x: shot.pos.x, z: shot.pos.z } : null,
      shotTravel: shot && shot0 ? Math.hypot(shot.pos.x - shot0.x, shot.pos.z - shot0.z) : 0,
      shotLateral: shot ? lateralOf(STORM, shot.pos) : 0,
      haulLateral0,
      haulLateral: hauler ? lateralOf(STORM, hauler.pos) : 0,
      haulAlive: hauler ? hauler.alive !== false : true,
      proof: host.proof(),
    };
  } finally {
    host.dispose();
    FIELD_FLAGS.enabled = previousFields;
  }
}

test('PQ-027.02 Veil and Vesta each carry one storm and one nebula belt', () => {
  const roles = WEATHER_VOLUMES.map((row) => `${row.sectorId}:${row.role}:${row.hazardType}`).sort();
  assert.deepEqual(roles, [
    'sector_veil_nebula:radiation_belt:nebula',
    'sector_veil_nebula:storm:debris_current',
    'sector_vesta_forge:radiation_belt:nebula',
    'sector_vesta_forge:storm:debris_current',
  ]);
  assert.equal(weatherPhase(STORM, 0).phase, 'warning');
  assert.equal(weatherPhase(STORM, SURGE_S).phase, 'surge');
  assert.equal(weatherPhase(STORM, CALM_S).phase, 'calm');
  assert.ok(!WEATHER_VOLUMES.some((row) => row.hazardType === 'radiation'));
  assert.equal(STORM.sectorId, VEIL_WEATHER_SECTOR_ID);
  assert.equal(BELT.sectorId, VEIL_WEATHER_SECTOR_ID);
  assert.ok(WEATHER_VOLUMES.some((row) => row.sectorId === VESTA_WEATHER_SECTOR_ID && row.role === 'storm'));
  assert.ok(WEATHER_VOLUMES.some((row) => row.sectorId === VESTA_WEATHER_SECTOR_ID && row.role === 'radiation_belt'));
  const window = weatherWindowAt(VEIL_WEATHER_SECTOR_ID, alongPoint(STORM, 90, 36), SURGE_S);
  assert.equal(window && window.phase, 'surge');
  assert.ok(window.remainingS > 0, 'surge names how long the window still has');
});

test('PQ-027.02 seed 2702 storm bends the shot, belt shrinks scan, traffic is scooped onto the rail', LONG, async () => {
  const shot = kernelShot();
  const belt = kernelBelt();
  assert.equal(belt.inside, true, 'sample point sits in the belt annulus');
  assert.equal(belt.scanScale, WEATHER_SCAN_SCALE_INSIDE);
  assert.equal(belt.calmScan, 1, 'calm restores scan');
  assert.equal(belt.holeScan, 1, 'the hole inside the belt is not the sensor wash');
  assert.ok(shot.towardRail > 40, `storm must bend the shot toward the rail (got ${shot.towardRail.toFixed(1)})`);
  assert.ok(shot.bend > 8, `a blind reviewer can name the storm from the bent shot (bend ${shot.bend.toFixed(1)} wu)`);
  assert.ok(belt.stacked > belt.wellOnly + 8,
    `the belt amplifies a stacked well (${belt.wellOnly.toFixed(1)} → ${belt.stacked.toFixed(1)})`);

  const surgeHaul = await runLive({ simTime: SURGE_S, ticks: HAUL_TICKS, withHauler: true });
  const calmHaul = await runLive({ simTime: CALM_S, ticks: HAUL_TICKS, withHauler: true });
  const surgeShot = await runLive({
    simTime: SURGE_S, ticks: SHOT_TICKS, withShot: true,
  });
  const calmShot = await runLive({
    simTime: CALM_S, ticks: SHOT_TICKS, withShot: true,
  });
  const haulDelta = surgeHaul.haulLateral - surgeHaul.haulLateral0;
  const calmDelta = calmHaul.haulLateral - calmHaul.haulLateral0;
  const trafficMoved = haulDelta < -6 && haulDelta < calmDelta - 4;
  const liveShotBend = Math.hypot(
    surgeShot.shotEnd.x - calmShot.shotEnd.x,
    surgeShot.shotEnd.z - calmShot.shotEnd.z,
  );

  const row = {
    shotBend: shot.bend,
    shotTowardRail: shot.towardRail,
    scanScale: belt.scanScale,
    trafficMoved,
    trafficSteersAround: false,
    haulLateral0: surgeHaul.haulLateral0,
    haulLateral: surgeHaul.haulLateral,
    haulDelta,
    wellOnly: belt.wellOnly,
    stacked: belt.stacked,
    stormType: STORM.hazardType,
    beltType: BELT.hazardType,
    windowPhase: weatherWindowAt(VEIL_WEATHER_SECTOR_ID, alongPoint(STORM, 90, 36), SURGE_S).phase,
    windowRemainingS: weatherWindowAt(VEIL_WEATHER_SECTOR_ID, alongPoint(STORM, 90, 36), SURGE_S).remainingS,
    proof: surgeHaul.proof,
  };
  console.log(formatRow(row));
  console.log([
    `PQ-027.02 seed=${SEED}`,
    `calmHaulDelta=${calmDelta.toFixed(1)}`,
    `surgeStormLive=${surgeHaul.stormLive}`,
    `calmStormLive=${calmHaul.stormLive}`,
    `liveShotBend=${liveShotBend.toFixed(2)}`,
    `kernelShotBend=${shot.bend.toFixed(2)}`,
    `surgeShotTravel=${surgeShot.shotTravel.toFixed(1)}`,
    `calmShotTravel=${calmShot.shotTravel.toFixed(1)}`,
    `surgeShotLateral=${surgeShot.shotLateral.toFixed(1)}`,
    `calmShotLateral=${calmShot.shotLateral.toFixed(1)}`,
  ].join(' '));

  assert.equal(surgeHaul.proof.backend, 'rapier-dynamic', 'weather proof stays on Rapier');
  assert.equal(surgeHaul.phase, 'surge');
  assert.equal(calmHaul.phase, 'calm');
  assert.equal(surgeHaul.stormLive, true, 'surge registers the storm sheet');
  assert.equal(calmHaul.stormLive, false, 'calm removes the storm sheet');
  assert.equal(trafficMoved, true, 'the storm scoops ordinary traffic onto the rail');
  assert.ok(calmDelta > -2 && calmDelta < 2, 'calm leaves the hauler on its line');
  assert.ok(liveShotBend > 8, `live Rapier shot must bend (got ${liveShotBend.toFixed(1)} wu)`);
  assert.equal(STORM.hazardType, 'debris_current');
  assert.equal(BELT.hazardType, 'nebula');
});

function dist2d(a, b) {
  return Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0));
}

async function runPlayerFight(simTime) {
  const dir = STORM.field.dir;
  // Player fires down the offset lane. A wasp sits on the rail, off the aim line.
  // Calm: the round stays on the aim line and misses. Surge: the sheet bends the
  // player's own shot onto the rail and finishes the hit.
  const playerPos = alongPoint(STORM, 90, 36);
  const muzzle = alongPoint(STORM, 108, 36);
  const waspPos = alongPoint(STORM, 210, 0);
  const vel = { x: dir.x * SHOT_SPEED, z: dir.z * SHOT_SPEED };
  const previousFields = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const host = await bootRealPath({
    seed: SEED,
    profileId: PROFILE_ID,
    systems: [
      'actions',
      'flightV3',
      environmentalMachinery,
      fields,
      hazardHints,
      'physics',
    ],
    hulls: [{
      hullId: PLAYER_HULL_ID,
      pos: playerPos,
      rot: Math.atan2(dir.z, dir.x),
      isPlayer: true,
      factionId: 'faction_free',
    }, {
      hullId: WASP_HULL_ID,
      pos: waspPos,
      rot: Math.atan2(dir.z, dir.x) + Math.PI,
      team: 1,
      factionId: 'faction_dmc',
    }],
  });
  try {
    host.state.world = host.state.world || {};
    host.state.world.currentSectorId = VEIL_WEATHER_SECTOR_ID;
    host.state.simTime = simTime;
    const phases = [];
    host.bus.on('environmentalMachinery:phaseChanged', (payload) => {
      if (payload && payload.siteId === STORM.id) phases.push(payload);
    });
    host.step(1, {
      before({ state }) {
        state.world.currentSectorId = VEIL_WEATHER_SECTOR_ID;
        state.simTime = simTime;
      },
    });
    const wasp = host.hulls[1];
    host.assertBodies([host.player, wasp], 'player fight bodies');
    const shot = spawnShot(host, muzzle, vel);
    host.step(1, {
      before({ state }) {
        state.world.currentSectorId = VEIL_WEATHER_SECTOR_ID;
        state.simTime = simTime;
      },
    });
    host.assertBodies([shot], 'player shot body');
    let missMin = dist2d(shot.pos, wasp.pos);
    host.step(FIGHT_SHOT_TICKS, {
      before({ state }) {
        state.world.currentSectorId = VEIL_WEATHER_SECTOR_ID;
        state.simTime = simTime;
      },
      after() {
        missMin = Math.min(missMin, dist2d(shot.pos, wasp.pos));
      },
    });
    const machinery = host.runtime.getSystem('environmentalMachinery');
    const weather = machinery && typeof machinery.diagnostics === 'function'
      ? (machinery.diagnostics(host.state).weather || []).find((row) => row.id === STORM.id)
      : null;
    const read = host.state.ui && host.state.ui.hazardRead;
    return {
      missMin,
      shotLateral: lateralOf(STORM, shot.pos),
      waspLateral: lateralOf(STORM, wasp.pos),
      remainingS: weather && weather.remainingS,
      phase: weather && weather.phase,
      hazardRemainingS: read && read.remainingS,
      hazardPhase: read && read.phase,
      playerInside: weather && weather.playerInside,
      phaseEvents: phases.length,
      ownerId: shot.data && shot.data.ownerId,
      proof: host.proof(),
    };
  } finally {
    host.dispose();
    FIELD_FLAGS.enabled = previousFields;
  }
}

test('PQ-027.02 seed 2702 the player fires: calm misses the rail, surge finishes the hit', LONG, async () => {
  const surge = await runPlayerFight(SURGE_S);
  const calm = await runPlayerFight(CALM_S);
  console.log([
    `PQ-027.02 seed=${SEED} player-fight`,
    `calmMiss=${calm.missMin.toFixed(2)}`,
    `surgeMiss=${surge.missMin.toFixed(2)}`,
    `calmShotLat=${calm.shotLateral.toFixed(1)}`,
    `surgeShotLat=${surge.shotLateral.toFixed(1)}`,
    `calmWaspLat=${calm.waspLateral.toFixed(1)}`,
    `surgeWaspLat=${surge.waspLateral.toFixed(1)}`,
    `window=${surge.phase}/${Number(surge.remainingS).toFixed(2)}s`,
    `hazardRead=${surge.hazardPhase}/${surge.hazardRemainingS}`,
    `playerInside=${surge.playerInside}`,
    `owner=${surge.ownerId}`,
    `backend=${surge.proof.backend}`,
  ].join(' '));

  assert.equal(surge.proof.backend, 'rapier-dynamic');
  assert.equal(surge.ownerId, calm.ownerId);
  assert.ok(surge.ownerId, 'the round is the player\'s');
  assert.equal(surge.phase, 'surge');
  assert.ok(surge.remainingS > 0, 'the player can read how long the surge still has');
  assert.equal(surge.playerInside, true, 'the player is in the storm, not a spectator');
  assert.equal(surge.hazardPhase, 'surge');
  assert.ok(Number(surge.hazardRemainingS) > 0, 'hazard language carries the remaining window');
  assert.ok(calm.missMin > 20, `calm leaves the offset shot off the wasp (miss ${calm.missMin.toFixed(2)} wu)`);
  assert.ok(surge.missMin < 16,
    `surge bends the player's shot onto the wasp (calm ${calm.missMin.toFixed(2)} → surge ${surge.missMin.toFixed(2)} wu)`);
  assert.ok(surge.missMin < calm.missMin - 8, 'the best shot changes with the weather window');
});
