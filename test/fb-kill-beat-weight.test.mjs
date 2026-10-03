// FB-084 — the kill camera beat scales with victim weight and agrees with the ear.
//
// Pins the weight-keyed beat table beside CAMERA_TRAUMA_TUNING (src/render/camera.js): tier
// boundaries are the same acoustic-mass law COLLISION_CUE pitches by (wasps light, bruisers
// medium, capitals capital), the medium tier is the authored 0.96x/250 ms kiss verbatim, the
// camera fires no beat on light victims, and reduced motion keeps the hold and drops the zoom.
import assert from 'node:assert/strict';
import test from 'node:test';

import { COLLISION_CUE } from '../src/audio/audioSystem.js';
import {
  CHASE_ZOOM_DEFAULT,
  KILL_BEAT_LOG_CAP,
  KILL_BEAT_TUNING,
  createChaseCamera,
  resolveKillBeat,
  resolveKillBeatTier,
} from '../src/render/camera.js';

function massState({ motionReduce = false } = {}) {
  if (!globalThis.window) globalThis.window = { innerWidth: 1600, innerHeight: 900 };
  const player = {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 14, maxSpeed: 172.07,
  };
  const state = {
    playerId: player.id,
    tick: 120,
    entities: new Map([[player.id, player]]),
    player: { tether: { active: false, targetId: null } },
    camera: { zoom: CHASE_ZOOM_DEFAULT, tilt: 60, lookAhead: 0, lerp: 6, trauma: 0 },
    settings: { video: { fov: 50, motionReduce } },
    render: {},
    world: { frameOrigin: { x: 0, z: 0 }, frameOriginSeq: 0 },
    input: { aimWorld: null },
  };
  return state;
}

test('the tier law is the collision-cue acoustic-mass law, so beat and ear cannot disagree', () => {
  // The whole light swarm class (enemies.js: wasp 16 and the throw-weight darts below the law's
  // unknown-mass nominal) — the packet's "none on wasps".
  for (const mass of [16, 17, 20, 22, 24]) assert.equal(resolveKillBeatTier(mass), 'light');
  // Bruisers and specialists. 32 is the top of the light class (enemies.js); 48 is the law's
  // unknown-mass nominal, where the conservative medium beat begins.
  for (const mass of [48, 55, 70, 78, 96, COLLISION_CUE.TIER_HEAVY_MASS - 1]) {
    assert.equal(resolveKillBeatTier(mass), 'medium');
  }
  assert.equal(resolveKillBeatTier(COLLISION_CUE.TIER_HEAVY_MASS), 'heavy');
  // Station-weight and capital hulls; the capital flag forces the tier outright.
  assert.equal(resolveKillBeatTier(COLLISION_CUE.MASS_HEAVY), 'capital');
  assert.equal(resolveKillBeatTier(2000), 'capital');
  assert.equal(resolveKillBeatTier(16, true), 'capital');
  // Unknown mass resolves through the law's own unknown (never NaN-driven).
  assert.equal(resolveKillBeatTier(undefined), 'medium');
  assert.equal(resolveKillBeatTier(Number.NaN), 'medium');
  assert.equal(COLLISION_CUE.ACOUSTIC_MASS_UNKNOWN, 48);
});

test('the table keeps the authored kiss as medium and escalates push and hold with weight', () => {
  assert.deepEqual(KILL_BEAT_TUNING.tiers.light, { factor: 0, durationS: 0, holdS: 0 });
  // The old one-size kiss, verbatim.
  assert.equal(KILL_BEAT_TUNING.tiers.medium.factor, -0.04);
  assert.equal(KILL_BEAT_TUNING.tiers.medium.durationS, 0.25);
  // Deeper and longer as the mass climbs; capital holds longest (the ear's hush tier).
  assert.ok(KILL_BEAT_TUNING.tiers.heavy.factor < KILL_BEAT_TUNING.tiers.medium.factor);
  assert.ok(KILL_BEAT_TUNING.tiers.heavy.durationS > KILL_BEAT_TUNING.tiers.medium.durationS);
  assert.ok(KILL_BEAT_TUNING.tiers.capital.factor < KILL_BEAT_TUNING.tiers.heavy.factor);
  assert.ok(KILL_BEAT_TUNING.tiers.capital.durationS > KILL_BEAT_TUNING.tiers.heavy.durationS);
  assert.ok(KILL_BEAT_TUNING.tiers.capital.holdS > KILL_BEAT_TUNING.tiers.heavy.holdS);
});

test('the live camera beats nothing on a wasp and three distinct beats on bruiser tiers', () => {
  const state = massState();
  const cam = createChaseCamera(state);
  cam.snapToPlayer();

  // Wasp kill: the kiss is gone, not stacked — no zoom, no hold, nothing logged.
  assert.equal(cam.killCam(16, {}), null);
  assert.equal(cam.killBeatLog().length, 0);
  for (let i = 0; i < 30; i++) cam.follow(1 / 60);
  assert.equal(cam.zoomDiagnostics().pushZoom, 0, 'a light kill must not move the camera');

  // Medium (bruiser), heavy and capital each land a distinct, deeper, longer beat.
  const seen = [];
  for (const [mass, opts] of [[70, {}], [240, {}], [2000, {}]]) {
    const beat = cam.killCam(mass, opts);
    assert.ok(beat, `mass ${mass} must beat`);
    assert.ok(beat.zoom, 'full-motion kill beats carry the push');
    seen.push(beat.tier);
    cam.follow(1 / 60);
    const push = cam.zoomDiagnostics().pushZoom;
    assert.ok(push < 0, `mass ${mass} must tighten the frame (pushZoom ${push})`);
    // Let the push decay before the next beat so each reading is its own tier's.
    for (let i = 0; i < 240; i++) cam.follow(1 / 60);
  }
  assert.deepEqual(seen, ['medium', 'heavy', 'capital']);
  const log = cam.killBeatLog();
  assert.deepEqual(log.map((b) => b.tier), ['medium', 'heavy', 'capital']);
  assert.ok(new Set(log.map((b) => b.tier)).size === 3, 'three distinct kill beats in the log');
});

test('a capital receipt beats through the feel-shaped capital flag and the hold freezes distance', () => {
  const state = massState();
  const cam = createChaseCamera(state);
  cam.snapToPlayer();
  const beat = cam.killCam(16, { capital: true });
  assert.equal(beat.tier, 'capital');
  cam.follow(1 / 60);
  assert.ok(cam.zoomDiagnostics().pushZoom < 0);
  assert.ok(cam.holdRemaining() > 0, 'capital beat holds the frame');
});

test('reduced motion keeps the hold and drops the zoom', () => {
  const state = massState({ motionReduce: true });
  const cam = createChaseCamera(state);
  cam.snapToPlayer();
  // Medium carries no hold, so with the zoom dropped nothing of it remains.
  assert.equal(cam.killCam(70, {}), null);
  assert.equal(cam.zoomDiagnostics().pushZoom, 0);
  // The hold tiers keep their hold (a freeze is not vestibular motion) and lose the zoom.
  const beat = cam.killCam(240, {});
  assert.equal(beat.tier, 'heavy');
  assert.equal(beat.zoom, false, 'reduced motion drops the zoom');
  assert.equal(beat.reducedMotion, true);
  cam.follow(1 / 60);
  assert.equal(cam.zoomDiagnostics().pushZoom, 0, 'no push is scheduled under reduced motion');
  assert.ok(cam.holdRemaining() > 0, 'the hold survives reduce');
  const cap = cam.killCam(2000, {});
  assert.equal(cap.zoom, false);
  assert.ok(cap.holdS > 0);
});

test('the kill-beat log is bounded', () => {
  const state = massState();
  const cam = createChaseCamera(state);
  cam.snapToPlayer();
  for (let i = 0; i < KILL_BEAT_LOG_CAP + 6; i++) cam.killCam(70, {});
  assert.equal(cam.killBeatLog().length, KILL_BEAT_LOG_CAP);
});
