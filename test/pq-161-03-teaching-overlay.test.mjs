// PQ-161.03 — teaching overlay. Trajectory and force ribbons belong on the Range
// and the draw-to-fly stroke preview. Ordinary flight stays clean.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getForcePaletteHex } from '../src/data/palettes.js';
import { DEFAULT_RUNTIME_PROFILE_ID } from '../src/runtime/runtimeProfiles.js';
import { paintRangeTeachingOverlay, rangeScreen } from '../src/ui/screens/range.js';
import {
  DEFAULT_FLIGHT_ROUTE,
  TEACHING_OVERLAY_SURFACES,
  TRAJECTORY_RIBBON_HEX,
  drawTeachingOverlay,
  isDefaultFlightRoute,
  planTeachingOverlay,
  teachingOverlayAllowed,
} from '../src/ui/teachingOverlay.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEED = 16103;
const ROPE_HEX = getForcePaletteHex('rope');
const WELL_HEX = getForcePaletteHex('wells');
const PUNCH_HEX = getForcePaletteHex('impulses');
const FLIGHT_OWNERS = [
  'src/ui/hud.js',
  'src/ui/uiRoot.js',
  'src/render/renderer.js',
  'src/render/vfx.js',
  'src/systems/flightV3.js',
];

function recordingContext() {
  const strokes = [];
  const ctx = {
    strokes,
    lineWidth: 1,
    globalAlpha: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    fillStyle: '',
    strokeStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    save() {},
    restore() {},
    clearRect() {},
    strokeRect() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    fill() {},
    fillText() {},
    translate() {},
    rotate() {},
    setLineDash() {},
    stroke() {
      strokes.push(String(this.strokeStyle || ''));
    },
  };
  return ctx;
}

function strokeSim() {
  return {
    id: 'draw_the_stroke',
    bounds: { minX: -620, maxX: 680, minZ: -340, maxZ: 340 },
    ghostTrail: [],
    trail: [{ x: -480, z: 0 }, { x: -400, z: 10 }],
    player: { x: -400, z: 10, vx: 48, vz: 6, rot: 0.12, radius: 10, mass: 12 },
    drone: { x: 160, z: -120, rot: 0, radius: 12, shortName: 'DRONE' },
    weakPoint: null,
    gates: [{ x: 360, centerZ: 80, tol: 100, state: 'pending' }],
    stroke: {
      allowed: true,
      drawing: true,
      flying: false,
      followIndex: 0,
      points: [
        { x: -480, z: 0 },
        { x: -200, z: 40 },
        { x: 100, z: 70 },
        { x: 360, z: 80 },
      ],
    },
  };
}

function swingSim() {
  return {
    id: 'swing_do_not_pull',
    bounds: { minX: -520, maxX: 420, minZ: -360, maxZ: 360 },
    player: { x: -220, z: 0, vx: 90, vz: 12, rot: 0, radius: 10, mass: 14 },
    anchor: { x: 0, z: 0 },
    tether: { active: true, allowed: true },
  };
}

function wellSim() {
  return {
    id: 'well_pulls_light',
    bounds: { minX: -620, maxX: 680, minZ: -340, maxZ: 340 },
    player: { x: -220, z: 40, vx: 0, vz: 0, rot: 0, radius: 10, mass: 12 },
    scrap: { x: 220, z: -20 },
    well: { x: 80, z: 10, radius: 170 },
  };
}

function defaultFlightContext(extra = {}) {
  return {
    surface: 'flight',
    profile: DEFAULT_RUNTIME_PROFILE_ID,
    assistMode: 'assisted',
    autoFire: false,
    autoTargetPath: { active: false, drawing: false, points: [] },
    player: { x: 0, z: 0, vx: 120, vz: 0, rot: 0 },
    ...extra,
  };
}

function channels(plan) {
  return (plan.ribbons || []).map((row) => row.channel);
}

test('PQ-161.03: Range stroke rung paints a trajectory ribbon', () => {
  const sim = strokeSim();
  const plan = paintRangeTeachingOverlay(recordingContext(), sim, 640, 360);
  assert.equal(plan.allowed, true);
  assert.equal(plan.surface, TEACHING_OVERLAY_SURFACES.RANGE);
  assert.equal(plan.ribbons.some((row) => row.kind === 'trajectory'), true);
  assert.equal(plan.ribbons[0].hex, TRAJECTORY_RIBBON_HEX);
  assert.ok(plan.ribbons[0].points.length >= 4);

  const ctx = recordingContext();
  rangeScreen._els = {
    canvas: {
      width: 640,
      height: 360,
      getBoundingClientRect: () => ({ width: 640, height: 360 }),
    },
    canvasCtx: ctx,
  };
  rangeScreen._sim = sim;
  rangeScreen._forcedColors = false;
  rangeScreen._reducedMotion = false;
  rangeScreen._render();
  assert.equal(ctx.strokes.includes(TRAJECTORY_RIBBON_HEX), true, 'Range _render must ink the trajectory ribbon');
});

test('PQ-161.03: Range force rungs paint rope and well ribbons', () => {
  const swing = paintRangeTeachingOverlay(recordingContext(), swingSim(), 640, 360);
  assert.equal(swing.allowed, true);
  assert.equal(channels(swing).includes('rope'), true);
  assert.equal(swing.ribbons.find((row) => row.channel === 'rope').hex, ROPE_HEX);

  const well = paintRangeTeachingOverlay(recordingContext(), wellSim(), 640, 360);
  assert.equal(well.allowed, true);
  assert.equal(channels(well).includes('wells'), true);
  assert.equal(well.ribbons.some((row) => row.hex === WELL_HEX), true);

  const boost = paintRangeTeachingOverlay(recordingContext(), {
    id: 'boost_keep_speed',
    boosted: true,
    player: { x: -200, z: 0, vx: 140, vz: 0, rot: 0 },
  }, 640, 360);
  assert.equal(channels(boost).includes('impulses'), true);
  assert.equal(boost.ribbons.find((row) => row.channel === 'impulses').hex, PUNCH_HEX);
});

test('PQ-161.03: draw-to-fly stroke preview paints; default flight does not', () => {
  const previewCtx = {
    surface: TEACHING_OVERLAY_SURFACES.DRAW_TO_FLY_PREVIEW,
    autoTargetPath: {
      active: true,
      drawing: true,
      points: [
        { x: 0, z: 0 },
        { x: 80, z: 24 },
        { x: 160, z: 10 },
      ],
    },
  };
  assert.equal(teachingOverlayAllowed(previewCtx), true);
  const preview = planTeachingOverlay(previewCtx);
  assert.equal(preview.allowed, true);
  assert.equal(preview.surface, TEACHING_OVERLAY_SURFACES.DRAW_TO_FLY_PREVIEW);
  assert.equal(preview.ribbons[0].kind, 'trajectory');
  const previewCanvas = recordingContext();
  const drawn = drawTeachingOverlay(previewCanvas, preview);
  assert.ok(drawn >= 1);
  assert.equal(previewCanvas.strokes.includes(TRAJECTORY_RIBBON_HEX), true);

  const flight = defaultFlightContext();
  assert.equal(DEFAULT_RUNTIME_PROFILE_ID, 'production');
  assert.equal(isDefaultFlightRoute(flight), true);
  assert.equal(isDefaultFlightRoute(DEFAULT_FLIGHT_ROUTE), true);
  assert.equal(teachingOverlayAllowed(flight), false);
  const flightPlan = planTeachingOverlay(flight);
  assert.equal(flightPlan.allowed, false);
  assert.equal(flightPlan.ribbons.length, 0);
  assert.equal(drawTeachingOverlay(recordingContext(), flightPlan), 0);

  const arcadeArmed = planTeachingOverlay(defaultFlightContext({
    autoFire: true,
    autoTargetPath: {
      active: true,
      drawing: false,
      points: [{ x: 0, z: 0 }, { x: 40, z: 8 }],
    },
  }));
  assert.equal(arcadeArmed.allowed, false);
  assert.equal(arcadeArmed.ribbons.length, 0);

  const sneak = planTeachingOverlay(defaultFlightContext({
    autoFire: true,
    autoTargetPath: {
      active: true,
      drawing: true,
      points: [{ x: 0, z: 0 }, { x: 40, z: 8 }],
    },
  }));
  assert.equal(sneak.allowed, false, 'default flight surface cannot opt into the overlay by drawing');
  assert.equal(sneak.ribbons.length, 0);

  console.log([
    `PQ-161.03 seed ${SEED}`,
    `Range yes: trajectory=${TRAJECTORY_RIBBON_HEX} rope=${ROPE_HEX} wells=${WELL_HEX}`,
    `draw-to-fly preview yes: ${drawn} ribbon(s)`,
    `default flight (${DEFAULT_RUNTIME_PROFILE_ID}/${flight.assistMode}) no: ribbons=${flightPlan.ribbons.length}`,
  ].join('\n'));
});

test('PQ-161.03: default flight owners never import the overlay', () => {
  const rangeSource = readFileSync(resolve(ROOT, 'src/ui/screens/range.js'), 'utf8');
  assert.match(rangeSource, /from '\.\.\/teachingOverlay\.js'/);
  assert.match(rangeSource, /paintRangeTeachingOverlay\(/);

  for (const rel of FLIGHT_OWNERS) {
    const text = readFileSync(resolve(ROOT, rel), 'utf8');
    assert.doesNotMatch(
      text,
      /teachingOverlay/,
      `${rel} must not import or name the teaching overlay`,
    );
  }
});
