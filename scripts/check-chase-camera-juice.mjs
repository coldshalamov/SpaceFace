/**
 * Structural verify for Top-50 rank-13 chase camera juice.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHASE_ZOOM_DEFAULT, CHASE_ZOOM_CLOSE, CAMERA_ZOOM_MIN } from '../src/render/camera.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CAM = resolve(ROOT, 'src/render/camera.js');
const GS = resolve(ROOT, 'src/core/gameState.js');
const OUT = resolve(ROOT, '.devshots/slice-A');
const REPORT = resolve(OUT, 'chase_camera_verify.json');

const failures = [];
const assert = (c, m) => { if (!c) failures.push(m); };
const camSrc = readFileSync(CAM, 'utf8');
const gsSrc = readFileSync(GS, 'utf8');

const cycles = [
  { id: 1, name: 'DEFAULT_ZOOM closer than 80', ok: CHASE_ZOOM_DEFAULT <= 75 },
  { id: 2, name: 'CHASE_ZOOM_CLOSE exported', ok: CHASE_ZOOM_CLOSE < CHASE_ZOOM_DEFAULT },
  { id: 3, name: 'resolveBaseZoom chaseClose', ok: /chaseClose/.test(camSrc) },
  { id: 4, name: 'bank lean stronger', ok: /0\.068/.test(camSrc) },
  { id: 5, name: 'ROLL_MAX raised', ok: /ROLL_MAX = 0\.052/.test(camSrc) },
  { id: 6, name: 'gameState zoom matches default', ok: /zoom:\s*72/.test(gsSrc) },
  { id: 7, name: 'bank counter-lean present', ok: /bankForLean/.test(camSrc) },
  { id: 8, name: 'speed zoom retained', ok: /resolveSpeedZoomFactor/.test(camSrc) },
  { id: 9, name: 'zoom min still usable', ok: CAMERA_ZOOM_MIN < CHASE_ZOOM_CLOSE },
  { id: 10, name: 'createChaseCamera export', ok: /export function createChaseCamera/.test(camSrc) },
];

const cycleResults = cycles.map((c) => {
  assert(c.ok, `cycle ${c.id}: ${c.name}`);
  return { id: c.id, name: c.name, ok: c.ok };
});

mkdirSync(OUT, { recursive: true });
const report = {
  schema: 'spaceface.chaseCameraVerify.v1',
  pack: 'chase_camera_juice',
  rank: 13,
  values: { CHASE_ZOOM_DEFAULT, CHASE_ZOOM_CLOSE, CAMERA_ZOOM_MIN },
  cycles: cycleResults,
  cyclesPassed: cycleResults.filter((c) => c.ok).length,
  failures,
  ok: failures.length === 0,
};
writeFileSync(REPORT, JSON.stringify(report, null, 2));
writeFileSync(resolve(OUT, 'chase-camera-note.txt'), [
  'Chase camera juice (rank 13)',
  `defaultZoom=${CHASE_ZOOM_DEFAULT} close=${CHASE_ZOOM_CLOSE}`,
  `cycles: ${report.cyclesPassed}/10 ok=${report.ok}`,
].join('\n'));

if (!report.ok) {
  console.error('FAIL', failures);
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, cycles: report.cyclesPassed, report: REPORT }, null, 2));
