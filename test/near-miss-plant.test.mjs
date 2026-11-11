// PL-01 Near miss plant tests (focused behavior check for owner invariants)
//
// 1. Pass within a ship-length at speed triggers swerve, lamp flash, and "Lane's not yours, pal!".
// 2. Escalation on repeat: count climbs inside memory window; the 3rd pass reports you to Control.
// 3. Negative checks: wrong distance (> ship-length), wrong target (police, hostile, disabled),
//    parked/slow player, and too soon (inside cooldown) do NOT trigger the plant reaction.
import test from 'node:test';
import assert from 'node:assert/strict';

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
