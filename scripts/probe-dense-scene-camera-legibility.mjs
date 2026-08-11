/**
 * PACKET U13 — dense-scene camera/feedback legibility probe (WF-15).
 *
 * Deterministic headless measurement of chase-camera cause/effect readability at swarm density
 * with velocity-language trails "live" (published record) and weapons-fire FOV punches active.
 *
 * Measuring stick (design readability bands):
 *   - design/graphics-sprints/CAMERA_VISIBLE_BUBBLE.md — 0–95 / 95–125 / 125–165 WU density bands
 *   - design/GDD_2_0.md §4 (flight feel) + §9.3 (readability) — battlefield at a glance
 *   - design/VISION.md — "The world can be messy. The player's understanding cannot be."
 *
 * Metrics (per frame @ 60 Hz, seeded scenario, 8+ ships, player dodge + fire):
 *   - focusJerkWuS2     — |d²focus/dt²| spikes (camera fighting dodge)
 *   - angularJerkRadS2  — camera quaternion angular acceleration spikes
 *   - fovRateDegS       — FOV punch thrash under dense fire
 *   - playerContainNdc  — player hull fraction inside NDC ±0.80 safe frame (pair contract)
 *   - threatContainNdc  — nearest active attacker inside NDC ±0.80
 *   - threatSwitchRate  — composed-threat identity thrash per second
 *
 * Usage:
 *   node scripts/probe-dense-scene-camera-legibility.mjs
 *   node scripts/probe-dense-scene-camera-legibility.mjs --json
 *
 * Presentation-only: does not touch sim goldens. Does not edit bloom.js (flags only).
 */
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CHASE_ZOOM_DEFAULT,
  createChaseCamera,
  resolveChaseComposition,
} from '../src/render/camera.js';
import {
  addFovPunch,
  FOV_PUNCH_CAP,
  stepFovPunch,
} from '../src/render/feel.js';
import {
  publishVelocityLanguage,
  velocityBandDrive,
} from '../src/render/velocityLanguage.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, '.devshots/u13-camera');
const DT = 1 / 60;
const SEED = 0x55c15e; // fixed — every sample must be reproducible
const DURATION_S = 6.0;
const FOV_BASE = 50;
const TILT = 60;
const ASPECT = 16 / 9;
const SAFE_NDC = 0.80; // cameraDirector pair contract (10% margin each side)
// GDX/CAMERA_VISIBLE_BUBBLE measuring stick — player + threat should stay in the normal play band.
const BAND_NORMAL_FWD_WU = 125;
const BAND_IDLE_FWD_WU = 95;

// feel.js FOV punch amplitudes (headless fire simulation shares stepFovPunch with the live path).
const RECOIL_FOV = 0.9;
const HIT_FOV = 2.2;

const jsonMode = process.argv.includes('--json');
const label = process.argv.find((a) => a.startsWith('--label='))?.slice('--label='.length) || 'run';

// ── deterministic RNG (mulberry32) ──────────────────────────────────────────
function mulberry32(a) {
  return function next() {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ship(id, x, z, team, extras = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    hull: 100,
    team,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    radius: extras.radius ?? 6,
    maxSpeed: extras.maxSpeed ?? 120,
    bank: 0,
    data: {
      encounter: team !== 0 ? { id: `u13-hostile-${id}` } : undefined,
      combat: extras.combat || (team !== 0 ? { targetId: 1, lockTarget: 1 } : null),
    },
    ...extras,
  };
}

/**
 * Dense combat pocket inside the R1 visible bubble:
 *   - player at origin, dodging laterally
 *   - 1 primary attacker at ~70 WU (0–95 idle band)
 *   - 4 flankers in the 95–125 moving-play band
 *   - 3 outer pressure ships near 125–165 speed-revealed edge
 * Total hostiles: 8. Trails "active" via velocity-language publish.
 */
function buildScene(rng) {
  const player = ship(1, 0, 0, 0, { radius: 7, maxSpeed: 120 });
  const hostiles = [];
  // Primary attacker — close, locked on player.
  hostiles.push(ship(2, 55, 18, 1, { combat: { targetId: 1, lockTarget: 1 }, radius: 6 }));
  // Flank swarm in the normal moving-play band (CAMERA_VISIBLE_BUBBLE 95–125).
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const r = 88 + rng() * 28;
    hostiles.push(ship(10 + i, Math.cos(a) * r, Math.sin(a) * r, 1, {
      combat: { targetId: 1, lockTarget: 1 },
      radius: 5 + rng() * 2,
    }));
  }
  // Outer pressure near the speed-revealed edge.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 1.1;
    const r = 130 + rng() * 30;
    hostiles.push(ship(20 + i, Math.cos(a) * r, Math.sin(a) * r, 1, {
      combat: { targetId: 1, lockTarget: rng() > 0.4 ? 1 : null },
      radius: 7,
    }));
  }
  assert.ok(hostiles.length >= 8, `need 8+ hostiles, got ${hostiles.length}`);

  const entities = new Map([[player.id, player], ...hostiles.map((h) => [h.id, h])]);
  const state = {
    playerId: 1,
    entities,
    player: {
      cruise: null,
      tether: { active: false, targetId: null },
      flybyFocus: { active: false, targetId: null },
    },
    settings: {
      video: {
        fov: FOV_BASE,
        motionReduce: false,
        bloom: true,
        bloomStrength: 0.52,
        bloomThreshold: 1.0,
        engineTrails: true,
      },
    },
    camera: {
      zoom: CHASE_ZOOM_DEFAULT,
      tilt: TILT,
      lookAhead: 18,
      lerp: 6,
      trauma: 0,
      focus: null,
      shakeOffset: null,
      obj: null,
    },
    input: { aimWorld: { x: 55, z: 18 } },
    world: { frameOrigin: { x: 0, z: 0 }, frameOriginSeq: 0 },
    combat: { attachments: { byId: {} } },
    mode: 'flight',
    tick: 0,
    render: {},
  };

  // Trails active: publish velocity-language at combat cruise so camera lead + shakeScale are live.
  const drive = velocityBandDrive(70, 120, false, false, false);
  publishVelocityLanguage(state, drive, null);
  state.render.velocityLanguage.ownerId = 1;

  return { state, player, hostiles };
}

function projectNdc(entity, focusX, focusZ, zoom, fovDeg, aspect, tiltDeg) {
  const tilt = tiltDeg * Math.PI / 180;
  const tanHalf = Math.tan((fovDeg * Math.PI / 180) * 0.5);
  const dx = entity.pos.x - focusX;
  const dz = entity.pos.z - focusZ;
  const r = Math.max(0, entity.radius || 0);
  const nearestDepth = Math.max(8, zoom - (Math.cos(tilt) * Math.abs(dz) + r));
  const ndcX = (Math.abs(dx) + r) / (nearestDepth * tanHalf * aspect);
  const ndcY = (Math.sin(tilt) * Math.abs(dz) + r) / (nearestDepth * tanHalf);
  return Math.max(ndcX, ndcY);
}

function quatAngle(a, b) {
  // Shortest angle between two unit quaternions.
  let d = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  d = Math.min(1, Math.max(-1, d));
  return 2 * Math.acos(d);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - i) + sorted[hi] * (i - lo);
}

function summarize(samples) {
  if (!samples.length) return { n: 0, mean: 0, p50: 0, p95: 0, max: 0 };
  const sorted = samples.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    n: sorted.length,
    mean: sum / sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1],
  };
}

function runProbe() {
  globalThis.window = { innerWidth: 1600, innerHeight: 1000 };
  const rng = mulberry32(SEED);
  const { state, player, hostiles } = buildScene(rng);
  const camera = createChaseCamera(state);
  state.render.camera = camera.obj;
  state.render.cameraCtrl = camera;
  camera.snapToPlayer();

  // Settle framing before the stress window so startup snap is not counted as jerk.
  for (let i = 0; i < 90; i++) camera.follow(DT);

  let fovEnvelope = 0;
  let fovApplied = 0;
  let prevFocusX = state.camera.focus.x;
  let prevFocusZ = state.camera.focus.z;
  let prevFocusVx = 0;
  let prevFocusVz = 0;
  let prevQuat = camera.obj.quaternion.clone();
  let prevAngVel = 0;
  let prevFov = camera.obj.fov;
  let prevThreatId = null;
  let threatSwitches = 0;

  const focusJerk = [];
  const angJerk = [];
  const fovRates = [];
  const playerContain = [];
  const threatContain = [];
  const playerInFrame = [];
  const threatInFrame = [];
  const zoomSamples = [];
  const composedThreatIds = [];

  const frames = Math.round(DURATION_S / DT);
  for (let f = 0; f < frames; f++) {
    const t = f * DT;
    state.tick = f;

    // ── player dodge pattern: figure-8 lateral + surge (cause the camera must not fight) ──
    const dodgePhase = t * 2.4;
    const surge = 55 + 35 * Math.sin(t * 1.7);
    player.vel.x = Math.cos(dodgePhase) * 95;
    player.vel.z = Math.sin(dodgePhase * 0.5) * 70 + surge * 0.15;
    player.pos.x += player.vel.x * DT;
    player.pos.z += player.vel.z * DT;
    player.bank = Math.max(-0.45, Math.min(0.45, -player.vel.x * 0.004));

    // ── hostiles orbit + press (nearest-threat thrash source) ──
    for (let i = 0; i < hostiles.length; i++) {
      const h = hostiles[i];
      const orbit = 0.55 + (i % 3) * 0.18;
      const ang = Math.atan2(h.pos.z - player.pos.z, h.pos.x - player.pos.x) + orbit * DT;
      const dist = Math.hypot(h.pos.x - player.pos.x, h.pos.z - player.pos.z);
      // Cross distances so "nearest" identity flips under the player dodge.
      const targetDist = 50 + ((i * 17 + f) % 90);
      const radial = (targetDist - dist) * 0.8;
      h.vel.x = Math.cos(ang + Math.PI / 2) * 40 + Math.cos(ang) * radial;
      h.vel.z = Math.sin(ang + Math.PI / 2) * 40 + Math.sin(ang) * radial;
      h.pos.x += h.vel.x * DT;
      h.pos.z += h.vel.z * DT;
      // Flip lock every ~0.7s among the closest three to stress active-attacker selection.
      if (i < 5 && f % 42 === i * 7) {
        h.data.combat = { targetId: 1, lockTarget: 1 };
      } else if (i < 5 && f % 42 === i * 7 + 21) {
        // Briefly drop lock so nearestThreat (passive) competes with activeAttacker.
        h.data.combat = { targetId: null, lockTarget: null };
      }
    }

    // Aim follows primary contact (composition + aim bias).
    const primary = hostiles[0];
    state.input.aimWorld = { x: primary.pos.x, z: primary.pos.z };

    // ── weapons fire FOV punches (shared feel.js integrator — live path + probe) ──
    // Player fires every 6 frames (~10 Hz pulse); hits every 18 frames (shield-break weight).
    if (f % 6 === 0) fovEnvelope = addFovPunch(fovEnvelope, RECOIL_FOV, FOV_PUNCH_CAP);
    if (f % 18 === 0) fovEnvelope = addFovPunch(fovEnvelope, HIT_FOV, FOV_PUNCH_CAP);
    if (f % 45 === 0) {
      // Trauma from impacts — camera shake under dense fire.
      camera.addTrauma(0.12);
    }
    const fovStep = stepFovPunch(fovEnvelope, fovApplied, DT);
    fovEnvelope = fovStep.envelope;
    fovApplied = fovStep.applied;
    camera.obj.fov = FOV_BASE + fovApplied;
    camera.obj.updateProjectionMatrix();

    // Keep velocity-language live (trails active) at current speed.
    const spd = Math.hypot(player.vel.x, player.vel.z);
    publishVelocityLanguage(state, velocityBandDrive(spd, player.maxSpeed, false, false, false), null);
    state.render.velocityLanguage.ownerId = 1;

    camera.follow(DT);

    // ── metrics ──
    const fx = state.camera.focus.x;
    const fz = state.camera.focus.z;
    const focusVx = (fx - prevFocusX) / DT;
    const focusVz = (fz - prevFocusZ) / DT;
    const focusAx = (focusVx - prevFocusVx) / DT;
    const focusAz = (focusVz - prevFocusVz) / DT;
    const jerk = Math.hypot(focusAx, focusAz);
    focusJerk.push(jerk);

    const ang = quatAngle(prevQuat, camera.obj.quaternion);
    const angVel = ang / DT;
    const angAcc = Math.abs(angVel - prevAngVel) / DT;
    angJerk.push(angAcc);
    prevQuat = camera.obj.quaternion.clone();
    prevAngVel = angVel;

    const fovRate = Math.abs(camera.obj.fov - prevFov) / DT;
    fovRates.push(fovRate);
    prevFov = camera.obj.fov;

    // Effective zoom from camera pose (distance to focus along offset).
    const zoom = Math.hypot(
      camera.obj.position.x - fx,
      camera.obj.position.y,
      camera.obj.position.z - fz,
    );
    zoomSamples.push(zoom);

    const playerNdc = projectNdc(player, fx, fz, zoom, camera.obj.fov, ASPECT, TILT);
    playerContain.push(playerNdc);
    playerInFrame.push(playerNdc <= SAFE_NDC ? 1 : 0);

    // Resolve composed threat the same way the chase camera does for this frame.
    const composition = resolveChaseComposition(state, player, { x: fx, z: fz }, {
      fov: camera.obj.fov,
      aspect: ASPECT,
      tiltDeg: TILT,
    });
    // Find the entity the composition is actually biased toward (active attacker preferred).
    let threat = null;
    let threatD2 = Infinity;
    for (const h of hostiles) {
      if (!h.alive || h.hull <= 0) continue;
      const d2 = (h.pos.x - player.pos.x) ** 2 + (h.pos.z - player.pos.z) ** 2;
      const combat = h.data && h.data.combat;
      const attacks = !!(combat && (combat.targetId === 1 || combat.lockTarget === 1));
      if (attacks && d2 < threatD2) {
        threat = h;
        threatD2 = d2;
      }
    }
    if (!threat) {
      for (const h of hostiles) {
        const d2 = (h.pos.x - player.pos.x) ** 2 + (h.pos.z - player.pos.z) ** 2;
        if (d2 < threatD2) {
          threat = h;
          threatD2 = d2;
        }
      }
    }
    if (threat) {
      const tNdc = projectNdc(threat, fx, fz, zoom, camera.obj.fov, ASPECT, TILT);
      threatContain.push(tNdc);
      threatInFrame.push(tNdc <= SAFE_NDC ? 1 : 0);
      composedThreatIds.push(threat.id);
      if (prevThreatId != null && threat.id !== prevThreatId) threatSwitches += 1;
      prevThreatId = threat.id;
    } else {
      threatContain.push(0);
      threatInFrame.push(0);
    }

    // Keep composition field referenced so a future dead-code strip cannot drop the export use.
    void composition;

    prevFocusX = fx;
    prevFocusZ = fz;
    prevFocusVx = focusVx;
    prevFocusVz = focusVz;
  }

  const playerInFramePct = (playerInFrame.reduce((a, b) => a + b, 0) / playerInFrame.length) * 100;
  const threatInFramePct = (threatInFrame.reduce((a, b) => a + b, 0) / threatInFrame.length) * 100;
  const threatSwitchRate = threatSwitches / DURATION_S;

  // Focus jerk spikes: count frames where acceleration exceeds a hard "readable" band.
  // 900 wu/s² ≈ a 1.5 wu focus step discontinuity at 60 Hz — above this the eye loses the ship.
  const JERK_SPIKE_WU = 900;
  const ANG_JERK_SPIKE = 8.0; // rad/s² — angular rattle
  const FOV_RATE_SPIKE = 40; // deg/s — FOV thrash under dense fire
  const focusJerkSpikes = focusJerk.filter((v) => v >= JERK_SPIKE_WU).length;
  const angJerkSpikes = angJerk.filter((v) => v >= ANG_JERK_SPIKE).length;
  const fovRateSpikes = fovRates.filter((v) => v >= FOV_RATE_SPIKE).length;

  const report = {
    schema: 'spaceface.denseSceneCameraLegibility.v1',
    packet: 'U13',
    workflow: 'WF-15',
    label,
    seed: SEED,
    durationS: DURATION_S,
    hostiles: hostiles.length,
    trailsActive: true,
    weaponsFireSimulated: true,
    measuringStick: {
      safeNdc: SAFE_NDC,
      bandIdleWu: BAND_IDLE_FWD_WU,
      bandNormalWu: BAND_NORMAL_FWD_WU,
      source: [
        'design/graphics-sprints/CAMERA_VISIBLE_BUBBLE.md',
        'design/GDD_2_0.md §4 / §9.3',
        'design/VISION.md (messy world, legible understanding)',
      ],
    },
    // Bloom flag (READ-ONLY — do not edit bloom.js). Default threshold 1.0 vs luminous HDR trails.
    bloomFlag: {
      defaultThreshold: 1.0,
      defaultStrength: 0.52,
      note: 'New additive trail radiance may sit near/above the bright-pass knee. If headed review shows washout, raise bloomThreshold or soft-knee in bloom.js (separate packet). Not a camera fix.',
    },
    metrics: {
      focusJerkWuS2: summarize(focusJerk),
      angularJerkRadS2: summarize(angJerk),
      fovRateDegS: summarize(fovRates),
      playerContainNdc: summarize(playerContain),
      threatContainNdc: summarize(threatContain),
      zoomWu: summarize(zoomSamples),
      playerInFramePct,
      threatInFramePct,
      threatSwitchRatePerS: threatSwitchRate,
      focusJerkSpikes,
      angularJerkSpikes: angJerkSpikes,
      fovRateSpikes,
    },
    // Pass bands: cause/effect stays readable. These are probe gates, not sim goldens.
    gates: {
      playerInFramePctMin: 98,
      threatInFramePctMin: 85,
      focusJerkP95Max: 700,
      focusJerkSpikeMax: 12,
      angularJerkP95Max: 6,
      fovRateP95Max: 35,
      threatSwitchRateMax: 4.5,
    },
  };

  const g = report.gates;
  const m = report.metrics;
  const failures = [];
  if (m.playerInFramePct < g.playerInFramePctMin) {
    failures.push(`playerInFramePct ${m.playerInFramePct.toFixed(1)} < ${g.playerInFramePctMin}`);
  }
  if (m.threatInFramePct < g.threatInFramePctMin) {
    failures.push(`threatInFramePct ${m.threatInFramePct.toFixed(1)} < ${g.threatInFramePctMin}`);
  }
  if (m.focusJerkWuS2.p95 > g.focusJerkP95Max) {
    failures.push(`focusJerk p95 ${m.focusJerkWuS2.p95.toFixed(1)} > ${g.focusJerkP95Max}`);
  }
  if (m.focusJerkSpikes > g.focusJerkSpikeMax) {
    failures.push(`focusJerkSpikes ${m.focusJerkSpikes} > ${g.focusJerkSpikeMax}`);
  }
  if (m.angularJerkRadS2.p95 > g.angularJerkP95Max) {
    failures.push(`angularJerk p95 ${m.angularJerkRadS2.p95.toFixed(2)} > ${g.angularJerkP95Max}`);
  }
  if (m.fovRateDegS.p95 > g.fovRateP95Max) {
    failures.push(`fovRate p95 ${m.fovRateDegS.p95.toFixed(1)} > ${g.fovRateP95Max}`);
  }
  if (m.threatSwitchRatePerS > g.threatSwitchRateMax) {
    failures.push(`threatSwitchRate ${m.threatSwitchRatePerS.toFixed(2)} > ${g.threatSwitchRateMax}`);
  }
  report.ok = failures.length === 0;
  report.failures = failures;

  return report;
}

const report = runProbe();
mkdirSync(OUT_DIR, { recursive: true });
const outPath = resolve(OUT_DIR, `dense-scene-${label}.json`);
writeFileSync(outPath, JSON.stringify(report, null, 2));

if (jsonMode) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const m = report.metrics;
  console.log(`U13 dense-scene camera legibility [${label}] seed=${SEED}`);
  console.log(`  hostiles=${report.hostiles} trails=on fire=on duration=${DURATION_S}s`);
  console.log(`  focusJerk wu/s²  mean=${m.focusJerkWuS2.mean.toFixed(1)} p95=${m.focusJerkWuS2.p95.toFixed(1)} max=${m.focusJerkWuS2.max.toFixed(1)} spikes=${m.focusJerkSpikes}`);
  console.log(`  angularJerk r/s² mean=${m.angularJerkRadS2.mean.toFixed(2)} p95=${m.angularJerkRadS2.p95.toFixed(2)} max=${m.angularJerkRadS2.max.toFixed(2)} spikes=${m.angularJerkSpikes}`);
  console.log(`  fovRate deg/s    mean=${m.fovRateDegS.mean.toFixed(1)} p95=${m.fovRateDegS.p95.toFixed(1)} max=${m.fovRateDegS.max.toFixed(1)} spikes=${m.fovRateSpikes}`);
  console.log(`  playerContain ndc p95=${m.playerContainNdc.p95.toFixed(3)} inFrame=${m.playerInFramePct.toFixed(1)}%`);
  console.log(`  threatContain ndc p95=${m.threatContainNdc.p95.toFixed(3)} inFrame=${m.threatInFramePct.toFixed(1)}%`);
  console.log(`  threatSwitchRate=${m.threatSwitchRatePerS.toFixed(2)}/s  zoom p50=${m.zoomWu.p50.toFixed(1)} p95=${m.zoomWu.p95.toFixed(1)}`);
  console.log(`  bloomFlag: threshold=${report.bloomFlag.defaultThreshold} (read-only; trail washout is a separate packet)`);
  console.log(`  report: ${outPath}`);
  if (report.ok) {
    console.log('PASS dense-scene camera legibility');
  } else {
    console.log('FAIL dense-scene camera legibility');
    for (const f of report.failures) console.log(`  - ${f}`);
  }
}

process.exit(report.ok ? 0 : 1);
