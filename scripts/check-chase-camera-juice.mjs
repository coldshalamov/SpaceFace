/**
 * Recovery R1 chase-framing contract.
 *
 * This remains a compact source-adjacent check, but its assertions describe shipped behavior: the
 * selected fresh-run framing, exact manual choices across the game:new lifecycle, bounded ordinary
 * speed zoom, and the larger envelope reserved for real physics-earned momentum.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGameState } from '../src/core/gameState.js';
import {
  CAMERA_ZOOM_MIN,
  CHASE_ZOOM_CLOSE,
  CHASE_ZOOM_DEFAULT,
  PHYSICS_EARNED_SPEED_ZOOM_MAX,
  SPEED_ZOOM_MAX,
  createChaseCamera,
  resolveExceptionalSpeedZoomFactor,
  resolveInitialChaseZoom,
  resolveSpeedZoomFactor,
} from '../src/render/camera.js';
import { VL_EXCEPTIONAL_SPEED_RATIO_MAX } from '../src/render/velocityLanguage.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CAM = resolve(ROOT, 'src/render/camera.js');
const OUT = resolve(ROOT, '.devshots/slice-A');
const REPORT = resolve(OUT, 'chase_camera_verify.json');

const failures = [];
const assert = (c, m) => { if (!c) failures.push(m); };
const camSrc = readFileSync(CAM, 'utf8');
const near = (actual, expected, tolerance = 1e-9) => Math.abs(actual - expected) <= tolerance;
const ordinaryMax = resolveSpeedZoomFactor(120, 120, false);
const earnedTwiceMax = resolveExceptionalSpeedZoomFactor(0.5);
globalThis.window = { innerWidth: 1600, innerHeight: 1000 };
const lifecyclePlayer = {
  id: 1,
  type: 'ship',
  alive: true,
  hull: 100,
  team: 0,
  pos: { x: 0, z: 0 },
  vel: { x: 0, z: 0 },
  radius: 7,
  maxSpeed: 120,
  bank: 0,
};
const lifecycleState = createGameState(1);
lifecycleState.entities = new Map([[1, lifecyclePlayer]]);
lifecycleState.playerId = 1;
lifecycleState.player.cruise = null;
lifecycleState.player.tether = { active: false, targetId: null };
const lifecycleCamera = createChaseCamera(lifecycleState);
const schemaBootZoom = lifecycleState.camera.zoom;
lifecycleCamera.setZoom(72);
const explicitRuntimeZoom = lifecycleState.camera.zoom;

// Mirrors the camera-relevant ordering in main.js resetRunState(): replace meta first, then assign
// the fresh GameState camera record while retaining Three.js runtime objects owned by the controller.
function resetCameraLikeGameNew(seed) {
  const fresh = createGameState(seed);
  const cameraObj = lifecycleState.camera.obj;
  const cameraFocus = lifecycleState.camera.focus;
  const cameraShake = lifecycleState.camera.shakeOffset;
  lifecycleState.meta = fresh.meta;
  Object.assign(lifecycleState.camera, fresh.camera, {
    obj: cameraObj || null,
    focus: cameraFocus || fresh.camera.focus,
    shakeOffset: cameraShake || fresh.camera.shakeOffset,
  });
  lifecycleState.camera.focus?.set(0, 0, 0);
  lifecycleState.camera.shakeOffset?.set(0, 0, 0);
}

resetCameraLikeGameNew(2);
const freshRunSchemaZoom = lifecycleState.camera.zoom;
// R0's game:started hook can apply a Sandbox candidate before the next follow. This explicit choice
// must win even when it happens immediately after resetRunState replaces the run metadata.
lifecycleCamera.setZoom(72);
lifecycleCamera.snapToPlayer();
lifecycleCamera.follow(1 / 60);
const explicitFreshRunZoom = lifecycleState.camera.zoom;
resetCameraLikeGameNew(3);
lifecycleCamera.snapToPlayer();
lifecycleCamera.follow(1 / 60);
const untouchedNewGameZoom = lifecycleState.camera.zoom;

const cycles = [
  { id: 1, name: 'selected normal gameplay framing is 144 WU', ok: CHASE_ZOOM_DEFAULT === 144 },
  { id: 2, name: 'CHASE_ZOOM_CLOSE exported', ok: CHASE_ZOOM_CLOSE < CHASE_ZOOM_DEFAULT },
  { id: 3, name: 'resolveBaseZoom chaseClose', ok: /chaseClose/.test(camSrc) },
  { id: 4, name: 'fresh GameState starts at selected framing', ok: schemaBootZoom === CHASE_ZOOM_DEFAULT },
  { id: 5, name: 'explicit runtime camera choices remain exact', ok: explicitRuntimeZoom === 72 },
  { id: 6, name: 'game:new reset receives the fresh schema framing', ok: freshRunSchemaZoom === CHASE_ZOOM_DEFAULT },
  { id: 7, name: 'explicit Sandbox 72 after game:new reset wins before first follow', ok: explicitFreshRunZoom === 72 },
  { id: 8, name: 'untouched game:new reset keeps selected framing', ok: untouchedNewGameZoom === CHASE_ZOOM_DEFAULT },
  { id: 9, name: 'explicit 72 is never inferred as a legacy sentinel', ok: resolveInitialChaseZoom(72) === 72 },
  { id: 10, name: 'ordinary hull max reaches only the ordinary cap', ok: near(ordinaryMax, SPEED_ZOOM_MAX) },
  { id: 11, name: 'unearned overspeed remains at ordinary cap', ok: near(resolveSpeedZoomFactor(240, 120, false), ordinaryMax) },
  { id: 12, name: 'earned 2x overspeed opens at least 12% farther', ok: earnedTwiceMax >= ordinaryMax * 1.12 },
  {
    id: 13,
    name: 'earned envelope reaches its bounded cap',
    ok: near(resolveExceptionalSpeedZoomFactor(1), PHYSICS_EARNED_SPEED_ZOOM_MAX),
  },
  { id: 14, name: 'zoom min still supports an explicit close view', ok: CAMERA_ZOOM_MIN < CHASE_ZOOM_CLOSE },
  {
    id: 15,
    name: 'camera consumes owner-bound shared exceptional speed',
    ok: /readOwnedExceptionalSpeed\(state\)/.test(camSrc)
      && !/_flightFrame\.governor[\s\S]*physicsEarned/.test(camSrc),
  },
  { id: 16, name: 'fixed-heading follow remains focus-based', ok: /cam\.lookAt\(c\.focus\.x, 0, c\.focus\.z\)/.test(camSrc) },
];

const cycleResults = cycles.map((c) => {
  assert(c.ok, `cycle ${c.id}: ${c.name}`);
  return { id: c.id, name: c.name, ok: c.ok };
});

mkdirSync(OUT, { recursive: true });
const report = {
  schema: 'spaceface.chaseCameraVerify.v2',
  pack: 'recovery_r1_camera_scale',
  values: {
    CHASE_ZOOM_DEFAULT,
    CHASE_ZOOM_CLOSE,
    CAMERA_ZOOM_MIN,
    SPEED_ZOOM_MAX,
    PHYSICS_EARNED_SPEED_ZOOM_MAX,
    VL_EXCEPTIONAL_SPEED_RATIO_MAX,
    earnedTwiceMax,
  },
  cycles: cycleResults,
  cyclesPassed: cycleResults.filter((c) => c.ok).length,
  failures,
  ok: failures.length === 0,
};
writeFileSync(REPORT, JSON.stringify(report, null, 2));
writeFileSync(resolve(OUT, 'chase-camera-note.txt'), [
  'Recovery R1 chase camera',
  `defaultZoom=${CHASE_ZOOM_DEFAULT} close=${CHASE_ZOOM_CLOSE}`,
  `ordinaryMax=${ordinaryMax.toFixed(3)} earned2x=${earnedTwiceMax.toFixed(3)}`,
  `cycles: ${report.cyclesPassed}/${cycles.length} ok=${report.ok}`,
].join('\n'));

if (!report.ok) {
  console.error('FAIL', failures);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, cycles: report.cyclesPassed, report: REPORT }, null, 2));
