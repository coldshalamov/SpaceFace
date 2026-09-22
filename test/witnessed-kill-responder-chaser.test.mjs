// test/witnessed-kill-responder-chaser.test.mjs
// §22 Wave A4 fixture: A witnessed kill puts one responder on the wreck and one chaser
// inside the composed frame within 10 seconds.
// Pinned on fixed seeds 4242 and 8008.

import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import {
  applyFeatureConfigToMaps,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../src/data/featureFlags.js';
import { resolveChaseComposition } from '../src/render/camera.js';

const SEEDS = [4242, 8008];
const DT = 1 / 60;
const SECTOR_ID = 'sector_helios_prime';
const ASPECT = 16 / 9;
const FOV = 50;
const TILT = 60;

function perspectiveCameraForFocus(focus, zoom, aspect = ASPECT) {
  const tilt = (TILT * Math.PI) / 180;
  const camera = new THREE.PerspectiveCamera(FOV, aspect, 1, 14000);
  camera.position.set(focus.x, Math.sin(tilt) * zoom, focus.z - Math.cos(tilt) * zoom);
  camera.lookAt(focus.x, 0, focus.z);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

function isPointInFrame(camera, point) {
  const v = new THREE.Vector3(point.x, 0, point.z);
  const ndc = v.project(camera);
  return (
    Math.abs(ndc.x) <= 1.0 + 1e-3 &&
    Math.abs(ndc.y) <= 1.0 + 1e-3 &&
    ndc.z >= -1.0 &&
    ndc.z <= 1.0
  );
}

function withFeatures(runtime, fn) {
  const previous = snapshotFeatureMaps();
  applyFeatureConfigToMaps(runtime?.config?.features);
  try {
    return fn();
  } finally {
    restoreFeatureMaps(previous);
  }
}

async function runWitnessedKillSplit(seed) {
  const runtime = await createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed,
  });
  const state = runtime.state;
  const bus = runtime.bus;

  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  if (!state.input.actions) state.input.actions = { brake: false, autopursuit: false };

  const player = runtime.spawn(
    makeShipEntitySpec('ship_hornet', {
      isPlayer: true,
      player: state.player,
      pos: { x: 0, z: 0 },
      fittings: [],
    })
  );
  state.playerId = player.id;

  const world = runtime.getSystem('world');
  world.enterSector(SECTOR_ID);

  const physics = runtime.getSystem('physics');
  await withFeatures(runtime, () => physics.prepareBackend(state, { reset: true }));

  const stations = (state.entityList || []).filter((e) => e && e.type === 'station');
  const station = stations.find((s) => s.data?.stationId === 'station_helios') || stations[0];
  assert.ok(station, 'Helios station must be present in sector');

  player.pos.x = station.pos.x + 120;
  player.pos.z = station.pos.z + 40;
  player.vel.x = 0;
  player.vel.z = 0;
  runtime.runTicks(120, DT);

  const victim = runtime.spawn(
    makeShipEntitySpec('ship_mule', {
      pos: { x: station.pos.x + 200, z: station.pos.z + 90 },
      team: 2,
      factionId: 'faction_scn',
      fittings: [],
    })
  );
  victim.data.trafficRole = 'hauler';
  victim.data.role = 'hauler';
  victim.vel.x = 0;
  victim.vel.z = 0;
  runtime.runTicks(30, DT);

  const victimKillPos = { x: victim.pos.x, z: victim.pos.z };

  withFeatures(runtime, () => {
    bus.emit('combat:damage', {
      id: victim.id,
      targetId: victim.id,
      attackerId: player.id,
      sourceId: player.id,
      applied: 40,
      amount: 40,
      pos: victimKillPos,
    });
  });
  runtime.runTicks(6, DT);
  victim.hull = 0;
  victim.alive = false;

  const deathSimT = state.simTime;
  withFeatures(runtime, () => {
    bus.emit('entity:killed', {
      id: victim.id,
      killerId: player.id,
      type: victim.type,
      pos: victimKillPos,
      factionId: victim.factionId,
      victimClass: 'civilian',
    });
  });

  let splitT = null;
  let chaserInFrameAt = null;
  let chaserIdInFrame = null;
  let holderId = null;
  let holderOnWreckAt = null;
  let minHolderDistToWreck = Infinity;
  let minChaserDistToPlayer = Infinity;

  // Simulate 10 seconds of game time (600 ticks at 60 Hz)
  for (let tick = 0; tick < 600; tick++) {
    runtime.runTicks(1, DT);
    const elapsed = state.simTime - deathSimT;

    const law = state.lawSecurity;
    const incident = Object.values(law.incidents || {})[0];
    if (!incident) continue;

    const wreckId = incident.victimAnchor?.wreckEntityId;
    const liveWreck = wreckId != null ? state.entities.get(wreckId) : null;
    const wreckPos = liveWreck ? liveWreck.pos : incident.victimAnchor || victimKillPos;

    const dispatched = incident.responderIds
      .map((id) => state.entities.get(id))
      .filter(Boolean);
    const holder = dispatched.find((e) => e.data?.ai?.witnessRole === 'hold');
    const chasers = dispatched.filter((e) => e.data?.ai?.witnessRole === 'chase');

    if (holder && chasers.length > 0 && splitT === null) {
      splitT = elapsed;
      holderId = holder.id;
    }

    if (holder && wreckPos) {
      const dHolder = Math.hypot(holder.pos.x - wreckPos.x, holder.pos.z - wreckPos.z);
      if (dHolder < minHolderDistToWreck) minHolderDistToWreck = dHolder;
      if (dHolder <= 90 || holder.data?.ai?.activity?.kind === 'loiter') {
        if (holderOnWreckAt === null) {
          holderOnWreckAt = elapsed;
        }
      }
    }

    const focus = resolveChaseComposition(state, player, player.pos, { followZoom: 72 });
    const camera = perspectiveCameraForFocus(focus, focus.minZoom || 72);

    for (const chaser of chasers) {
      const d = Math.hypot(chaser.pos.x - player.pos.x, chaser.pos.z - player.pos.z);
      if (d < minChaserDistToPlayer) minChaserDistToPlayer = d;
      if (isPointInFrame(camera, chaser.pos)) {
        if (chaserInFrameAt === null) {
          chaserInFrameAt = elapsed;
          chaserIdInFrame = chaser.id;
        }
      }
    }
  }

  await runtime.dispose();

  return {
    seed,
    splitT: splitT !== null ? Number(splitT.toFixed(3)) : null,
    holderId,
    holderOnWreckAt: holderOnWreckAt !== null ? Number(holderOnWreckAt.toFixed(3)) : null,
    minHolderDistToWreck: Number(minHolderDistToWreck.toFixed(1)),
    chaserId: chaserIdInFrame,
    chaserInFrameAt: chaserInFrameAt !== null ? Number(chaserInFrameAt.toFixed(3)) : null,
    minChaserDistToPlayer: Number(minChaserDistToPlayer.toFixed(1)),
  };
}

for (const seed of SEEDS) {
  test(`Row A4: witnessed kill puts 1 responder on wreck and 1 chaser in composed frame within 10s (seed ${seed})`, async () => {
    const result = await runWitnessedKillSplit(seed);

    console.log(
      `[Row A4 seed ${seed}] splitAt=${result.splitT}s, holder#${result.holderId} on wreck at ${result.holderOnWreckAt}s (minDist=${result.minHolderDistToWreck} WU), chaser#${result.chaserId} in composed frame at ${result.chaserInFrameAt}s (minDistToPlayer=${result.minChaserDistToPlayer} WU)`
    );

    assert.ok(result.splitT !== null, 'stay-versus-chase split must occur');
    assert.ok(
      result.splitT <= 10,
      `stay-versus-chase split must occur within 10s (got ${result.splitT}s)`
    );

    assert.ok(
      result.holderOnWreckAt !== null,
      'responder must reach and hold station on the wreck'
    );
    assert.ok(
      result.holderOnWreckAt <= 10,
      `responder must hold on wreck within 10s (got ${result.holderOnWreckAt}s)`
    );
    assert.ok(
      result.minHolderDistToWreck <= 90,
      `responder must approach wreck within standoff radius 90 WU (got ${result.minHolderDistToWreck} WU)`
    );

    assert.ok(
      result.chaserInFrameAt !== null,
      'chaser must enter the composed chase camera frame'
    );
    assert.ok(
      result.chaserInFrameAt <= 10,
      `chaser must enter composed frame within 10s (got ${result.chaserInFrameAt}s)`
    );
    assert.ok(
      result.minChaserDistToPlayer <= 200,
      `chaser must close within hail/pursuit range (got ${result.minChaserDistToPlayer} WU)`
    );
  });
}
