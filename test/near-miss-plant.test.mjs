// PL-01 Near miss plant tests (focused behavior check for owner invariants)
//
// 1. Pass within a ship-length at speed triggers swerve, lamp flash, and "Lane's not yours, pal!".
// 2. Escalation on repeat: count climbs inside memory window; the 3rd pass reports you to Control.
// 3. Negative checks: wrong distance (> ship-length), wrong target (police, hostile, disabled),
//    parked/slow player, and too soon (inside cooldown) do NOT trigger the plant reaction.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import '../src/systems/traffic.js';
import {
  NEAR_MISS_PLANT_EVENT,
  NEAR_MISS_FLASH_EVENT,
  NEAR_MISS_REPORT_EVENT,
  NEAR_MISS_PLANT_TUNING,
  NEAR_MISS_PLANT_BARK,
  NEAR_MISS_REPORT_BARK,
  NEAR_MISS_CONTROL_LOG,
  isNearMissPlantEligible,
  predictNearMissPlantPass,
  swerveForNearMissPlant,
  nearMissPlantOps,
} from '../src/systems/nearMissPlant.js';
import {
  computeNearMissLampFlash,
  createShipAuxPool,
  syncShipAuxPools,
} from '../src/render/renderer.js';

function makeCivilian(id = 'civ_hauler_1', { x = 0, z = 30, role = 'hauler', team = 2, radius = 6 } = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius,
    data: {
      trafficRole: role,
      intent: { moveX: 0, moveZ: 0, boost: false, fire: false, fireGroup: null, aimAngle: 0, brake: false },
      ai: { passive: true },
    },
    flags: {},
  };
}

function makePlayer({ x = 0, z = 120, vx = 0, vz = -300, radius = 6 } = {}) {
  return {
    id: 'player_hero',
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x, z },
    vel: { x: vx, z: vz },
    rot: 0,
    radius,
    data: {},
  };
}

function makeHarness() {
  const events = [];
  const voiceCalls = [];
  const ops = Object.create(nearMissPlantOps);
  ops.bus = {
    emit: (name, payload) => events.push({ name, payload }),
  };
  ops.helpers = {
    voice: {
      say: (call) => {
        voiceCalls.push(call);
        return true;
      },
    },
  };
  ops._initNearMissPlant();
  return { ops, events, voiceCalls };
}

test('isNearMissPlantEligible allows neutral civilian ships and excludes player, lawful, and hostiles', () => {
  const civ = makeCivilian('civ_1', { role: 'courier' });
  assert.equal(isNearMissPlantEligible(civ), true, 'civilian courier is eligible');

  const player = makePlayer();
  assert.equal(isNearMissPlantEligible(player, null, { playerId: player.id }), false, 'player is never eligible');

  const patrol = makeCivilian('patrol_1', { role: 'patrol' });
  assert.equal(isNearMissPlantEligible(patrol), false, 'patrol role is not eligible');

  const lawful = makeCivilian('lawful_1', { role: 'hauler' });
  lawful.data.ai = { lawful: true };
  assert.equal(isNearMissPlantEligible(lawful), false, 'lawful AI is not eligible');

  const pirate = makeCivilian('pirate_1', { role: 'raider', team: 1 });
  assert.equal(isNearMissPlantEligible(pirate), false, 'team 1 hostile is not eligible');

  const disabled = makeCivilian('dead_1', { role: 'hauler' });
  disabled.data.disabled = true;
  assert.equal(isNearMissPlantEligible(disabled), false, 'disabled hull is not eligible');
});

test('predictNearMissPlantPass: triggers only within a ship-length at speed', () => {
  const civ = makeCivilian('civ_1', { x: 0, z: 30, radius: 6 });

  // 1. Rip past at 300 wu/s with clearance of 8 wu (inside ship-length 24 wu)
  const closePassPlayer = makePlayer({ x: 20, z: 120, vx: 0, vz: -300, radius: 6 });
  const pass = predictNearMissPlantPass(closePassPlayer, civ);
  assert.ok(pass, 'fast close pass is detected');
  assert.equal(pass.relSpeed, 300);
  assert.ok(pass.clearanceWu <= NEAR_MISS_PLANT_TUNING.shipLengthWu, 'clearance is within a ship length');

  // 2. Pass outside a ship-length: clearance 38 wu (> 24 wu)
  const farPlayer = makePlayer({ x: 50, z: 120, vx: 0, vz: -300, radius: 6 });
  assert.equal(predictNearMissPlantPass(farPlayer, civ), null,
    'pass farther than a ship-length does not trigger near miss plant');

  // 3. Slow pass: player speed 50 wu/s (< 80 wu/s threshold)
  const slowPlayer = makePlayer({ x: 20, z: 120, vx: 0, vz: -50, radius: 6 });
  assert.equal(predictNearMissPlantPass(slowPlayer, civ), null,
    'slow pass does not trigger plant');

  // 4. Parked player (vx = 0, vz = 0)
  const parkedPlayer = makePlayer({ x: 20, z: 30, vx: 0, vz: 0, radius: 6 });
  assert.equal(predictNearMissPlantPass(parkedPlayer, civ), null,
    'parked player cannot buzz traffic');
});

test('swerveForNearMissPlant jinks away from the pass vector, deterministic on hull identity', () => {
  const hull = makeCivilian('civ_1', { x: 0, z: 0 });
  const a = swerveForNearMissPlant(hull, { cx: 10, cz: 0, vx: 0, vz: -300 }, 42);
  assert.equal(a.strafe, 1, 'strafe kicks away from offset');
  assert.ok(Math.abs(a.aim) <= NEAR_MISS_PLANT_TUNING.swerveYawRad + 1e-9, 'yaw turn clamped');

  const b = swerveForNearMissPlant(hull, { cx: 0, cz: 0, vx: 0, vz: -300 }, 42);
  const c = swerveForNearMissPlant(hull, { cx: 0, cz: 0, vx: 0, vz: -300 }, 42);
  assert.equal(b.strafe, c.strafe, 'head-on pass side choice is deterministic');
  assert.equal(b.aim, c.aim, 'head-on pass yaw turn is deterministic');
});

test('integrated plant reaction: first pass swerves, flashes lamps and says "Lane\'s not yours, pal!"', () => {
  const { ops, events, voiceCalls } = makeHarness();
  const state = {
    mode: 'flight',
    simTime: 1000,
    world: { currentSectorId: 'sector_helios' },
    playerId: 'player_hero',
  };
  const civ = makeCivilian('civ_1', { x: 0, z: 30, radius: 6 });
  const player = makePlayer({ x: 15, z: 120, vx: 0, vz: -300, radius: 6 });

  const handled = ops._reactNearMissPlant(civ, { role: 'hauler' }, [], state, player);
  assert.equal(handled, true, 'ambient civilian handled by near miss plant');

  // 1. Physical swerve
  assert.ok(civ.data.intent.moveZ === 1 || civ.data.intent.moveX !== 0, 'civilian jinks');
  assert.equal(civ.data.intent.brake, false, 'does not brake while jinking');

  // 2. Lamp flash
  assert.equal(civ.data.lampsFlashing, true, 'lamps are flashing');
  assert.equal(civ.data.lampFlashUntil, 1000 + NEAR_MISS_PLANT_TUNING.flashDurationS);
  const flashEvent = events.find((e) => e.name === NEAR_MISS_FLASH_EVENT);
  assert.ok(flashEvent, 'traffic:nearMissFlash emitted');
  assert.equal(flashEvent.payload.entityId, 'civ_1');
  assert.equal(flashEvent.payload.duration, NEAR_MISS_PLANT_TUNING.flashDurationS);

  // 3. Spoken dialogue: "Lane's not yours, pal!"
  const plantEvent = events.find((e) => e.name === NEAR_MISS_PLANT_EVENT);
  assert.ok(plantEvent, 'traffic:nearMissPlant emitted');
  assert.equal(plantEvent.payload.count, 1);
  assert.equal(plantEvent.payload.barkText, NEAR_MISS_PLANT_BARK);
  assert.equal(plantEvent.payload.reported, false);

  const barkEvent = events.find((e) => e.name === 'bark:triggered');
  assert.ok(barkEvent, 'bark:triggered emitted');
  assert.equal(barkEvent.payload.text, NEAR_MISS_PLANT_BARK);

  const voiceCall = voiceCalls.find((c) => c.text === NEAR_MISS_PLANT_BARK);
  assert.ok(voiceCall, 'voice.say called with exact authored dialogue');
  assert.equal(voiceCall.text, "Lane's not yours, pal!");

  // Inside swerve duration (0.5 s later), swerve continues flying, no duplicate bark
  state.simTime += 0.5;
  const swerving = ops._reactNearMissPlant(civ, { role: 'hauler' }, [], state, player);
  assert.equal(swerving, true, 'still flying the swerve jink');
  assert.equal(events.filter((e) => e.name === NEAR_MISS_PLANT_EVENT).length, 1, 'no second bark during same beat');

  // Past swerve and cooldown, but lamps flashing flag clears after duration
  state.simTime += NEAR_MISS_PLANT_TUNING.flashDurationS + 0.1;
  ops._reactNearMissPlant(civ, { role: 'hauler' }, [], state, player);
  assert.equal(civ.data.lampsFlashing, false, 'lamp flashing expires cleanly');
});

test('escalation on repeat: second pass barks again; third pass reports you to Control', () => {
  const { ops, events } = makeHarness();
  const state = {
    mode: 'flight',
    simTime: 500,
    world: { currentSectorId: 'sector_helios' },
    playerId: 'player_hero',
  };
  const civ = makeCivilian('civ_2', { x: 0, z: 30, radius: 6 });
  const player = makePlayer({ x: 15, z: 120, vx: 0, vz: -300, radius: 6 });

  // Pass 1:
  ops._reactNearMissPlant(civ, { role: 'hauler' }, [], state, player);
  const firstPasses = events.filter((e) => e.name === NEAR_MISS_PLANT_EVENT);
  assert.equal(firstPasses.length, 1);
  assert.equal(firstPasses[0].payload.count, 1);
  assert.equal(firstPasses[0].payload.reported, false);

  // Pass 2: after cooldown (4 s later)
  state.simTime += 4.0;
  ops._reactNearMissPlant(civ, { role: 'hauler' }, [], state, player);
  const secondPasses = events.filter((e) => e.name === NEAR_MISS_PLANT_EVENT);
  assert.equal(secondPasses.length, 2);
  const second = secondPasses[1].payload;
  assert.equal(second.count, 2);
  assert.equal(second.barkText, NEAR_MISS_PLANT_BARK);
  assert.equal(second.reported, false);

  // Pass 3: the third time they report you!
  state.simTime += 4.0;
  ops._reactNearMissPlant(civ, { role: 'hauler' }, [], state, player);
  const thirdPasses = events.filter((e) => e.name === NEAR_MISS_PLANT_EVENT);
  assert.equal(thirdPasses.length, 3);
  const third = thirdPasses[2].payload;
  assert.equal(third.count, 3);
  assert.equal(third.barkText, NEAR_MISS_REPORT_BARK);
  assert.equal(third.reported, true);

  // Asserts the report event fired
  const reportEvent = events.find((e) => e.name === NEAR_MISS_REPORT_EVENT);
  assert.ok(reportEvent, 'traffic:nearMissReported emitted on 3rd pass');
  assert.equal(reportEvent.payload.reportingEntityId, 'civ_2');
  assert.equal(reportEvent.payload.targetEntityId, 'player_hero');
  assert.equal(reportEvent.payload.count, 3);

  // Asserts law distress raised
  const distressEvent = events.find((e) => e.name === 'law:distressRaised');
  assert.ok(distressEvent, 'law:distressRaised emitted for reckless flying');
  assert.equal(distressEvent.payload.cause, 'reckless_flying');
  assert.equal(distressEvent.payload.victimId, 'civ_2');
  assert.equal(distressEvent.payload.attackerId, 'player_hero');

  // Asserts Control acknowledgment
  const controlBark = events.find((e) => e.payload && e.payload.text === NEAR_MISS_CONTROL_LOG);
  assert.ok(controlBark, 'Control logs the report');
});

test('memory window expiry: a pass after 50s (memoryS = 45s) resets count back to 1', () => {
  const { ops, events } = makeHarness();
  const state = {
    mode: 'flight',
    simTime: 100,
    world: { currentSectorId: 'sector_helios' },
    playerId: 'player_hero',
  };
  const civ = makeCivilian('civ_3', { x: 0, z: 30, radius: 6 });
  const player = makePlayer({ x: 15, z: 120, vx: 0, vz: -300, radius: 6 });

  // Pass 1
  ops._reactNearMissPlant(civ, { role: 'hauler' }, [], state, player);
  const plantEvents1 = events.filter((e) => e.name === NEAR_MISS_PLANT_EVENT);
  assert.equal(plantEvents1.length, 1);
  assert.equal(plantEvents1[0].payload.count, 1);

  // Pass after memory window expired (60 s later)
  state.simTime += 60.0;
  ops._reactNearMissPlant(civ, { role: 'hauler' }, [], state, player);
  const plantEvents2 = events.filter((e) => e.name === NEAR_MISS_PLANT_EVENT);
  assert.equal(plantEvents2.length, 2);
  assert.equal(plantEvents2[1].payload.count, 1, 'count reset to 1 after memory window expired');
  assert.equal(plantEvents2[1].payload.reported, false, 'not reported');
});

test('near-miss lamp presentation: two flashes, respecting reduced flash, and cleanly expires (PL-01)', () => {
  const civ = makeCivilian('civ_flash_1');
  civ.data.lampsFlashing = true;
  civ.data.lampFlashUntil = 102.0;

  // 1. Not flashing returns neutral multiplier
  const calmCiv = makeCivilian('civ_calm');
  assert.equal(computeNearMissLampFlash(calmCiv, 100.0, false), 1.0);

  // 2. Pulse 1 (elapsed 0.1 s): full flash gain
  const flash1 = computeNearMissLampFlash(civ, 100.1, false);
  assert.ok(flash1 > 3.0, 'pulse 1 delivers bright lamp flash');

  // 3. Gap between pulses (elapsed 0.3 s): returns to resting floor
  const gap = computeNearMissLampFlash(civ, 100.3, false);
  assert.equal(gap, 1.0, 'gap between flashes is resting floor');

  // 4. Pulse 2 (elapsed 0.5 s): second flash
  const flash2 = computeNearMissLampFlash(civ, 100.5, false);
  assert.ok(flash2 > 3.0, 'pulse 2 delivers second lamp flash');

  // 5. After pulse 2 (elapsed 1.0 s, before expiry): resting floor
  const afterPulses = computeNearMissLampFlash(civ, 101.0, false);
  assert.equal(afterPulses, 1.0, 'after second flash stays resting until window ends');

  // 6. Reduced flash: calm gain, no harsh strobe spike
  const reducedPulse = computeNearMissLampFlash(civ, 100.1, true);
  assert.ok(reducedPulse < flash1, 'reduced flash is strictly dimmer than normal flash');
  assert.ok(reducedPulse > 1.2, 'reduced flash still visibly indicates the flash');

  // 7. Expiry at or past lampFlashUntil: flag cleared, multiplier 1.0
  const expired = computeNearMissLampFlash(civ, 102.0, false);
  assert.equal(expired, 1.0, 'expired lamp returns to resting multiplier');
  assert.equal(civ.data.lampsFlashing, false, 'lampsFlashing cleared upon expiry');
});

test('aux nav pool sync modulates drawn nav-light intensity on near-miss flash', () => {
  const root = new THREE.Group();
  const navSource = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.2, 0.2, 0.2),
    new THREE.MeshStandardMaterial({ color: 0x88eeff, emissive: new THREE.Color(0x88eeff), emissiveIntensity: 1.0 }),
    2,
  );
  navSource.name = 'GLTFKit_Nav_Lights';
  navSource.userData.damageRole = 'navLight';
  navSource.count = 2;
  root.add(navSource);

  const scene = new THREE.Scene();
  scene.add(root);
  root.updateWorldMatrix(true, true);

  const pool = createShipAuxPool(scene);
  const entity = {
    id: 'civ_nav_1',
    type: 'ship',
    alive: true,
    radius: 12,
    shield: 0,
    data: {
      lampsFlashing: true,
      lampFlashUntil: 102.0,
    },
  };
  const meshes = new Map([['civ_nav_1', root]]);
  const state = {
    simTime: 100.1, // inside pulse 1
    settings: { video: { flashReduce: false } },
  };

  syncShipAuxPools(pool, [entity], meshes, state);
  assert.equal(pool.nav.mesh.visible, true);
  assert.equal(pool.nav.mesh.count, 2);

  // The drawn color attribute should carry the boosted flash
  const rFlash = pool.nav.mesh.instanceColor.getX(0);
  assert.ok(rFlash > 0.8, 'drawn nav light color is boosted during near-miss flash');

  // At gap time (elapsed 0.3 s):
  state.simTime = 100.3;
  syncShipAuxPools(pool, [entity], meshes, state);
  const rGap = pool.nav.mesh.instanceColor.getX(0);
  assert.ok(rFlash > rGap * 3.5, 'pulse 1 is more than 3.5x resting gap intensity');
  assert.ok(rGap < rFlash, 'drawn nav light returns to lower resting intensity between pulses');

  // At pulse 2 time (elapsed 0.5 s):
  state.simTime = 100.5;
  syncShipAuxPools(pool, [entity], meshes, state);
  const rFlash2 = pool.nav.mesh.instanceColor.getX(0);
  assert.ok(rFlash2 > 0.8, 'pulse 2 boosts drawn nav light color');

  // Reduced flash:
  state.simTime = 100.1;
  state.settings.video.flashReduce = true;
  syncShipAuxPools(pool, [entity], meshes, state);
  const rReduced = pool.nav.mesh.instanceColor.getX(0);
  assert.ok(rReduced < rFlash, 'reduced flash produces lower radiance than standard flash');
  assert.ok(rReduced > rGap, 'reduced flash still indicates the event');
});
