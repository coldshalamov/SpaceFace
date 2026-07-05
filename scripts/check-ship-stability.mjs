#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PROBE = fileURLToPath(new URL('./probe-ship-visual-stability.mjs', import.meta.url));
const MIN_INSPECTED_FRAMES = 300;
const args = process.argv.slice(2);
const probeArgs = [
  PROBE,
  ...defaultArg('--frames', '360'),
  ...defaultArg('--warmup-frames', '45'),
  ...args,
];

const result = spawnSync(process.execPath, probeArgs, {
  cwd: ROOT,
  env: process.env,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.error) {
  console.error(`[ship-stability] failed to launch probe: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status || 1);

const report = parseJsonReport(result.stdout || '');
const failures = validateReport(report);
if (failures.length) {
  console.error('[ship-stability] evidence contract failed:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

const stability = report.stability;
const visibleTracks = stability.trackedShips.filter((track) => track.inViewFrames > 0);
console.log(`[ship-stability] pass inspectedFrames=${stability.inspectedFrameCount} trackedShips=${stability.trackedShips.length} visibleTracks=${visibleTracks.length} maxShips=${stability.maxShipCount}`);

function defaultArg(name, value) {
  return args.some((arg) => arg === name || arg.startsWith(`${name}=`)) ? [] : [`${name}=${value}`];
}

function parseJsonReport(output) {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start < 0 || end < start) {
    throw new Error('probe did not print a JSON report');
  }
  return JSON.parse(output.slice(start, end + 1));
}

function validateReport(report) {
  const failures = [];
  const stability = report && report.stability;
  if (!report || report.ok !== true) failures.push('top-level report.ok must be true');
  if (!stability || stability.ok !== true) failures.push('stability.ok must be true');
  if (!stability) return failures;

  if (!Number.isFinite(stability.inspectedFrameCount) || stability.inspectedFrameCount < MIN_INSPECTED_FRAMES) {
    failures.push(`expected at least ${MIN_INSPECTED_FRAMES} inspected post-warmup frames; got ${stability.inspectedFrameCount}`);
  }
  if (!Number.isFinite(stability.maxShipCount) || stability.maxShipCount < 1) {
    failures.push('expected at least one live ship in the stability probe');
  }
  if (stability.failureCount !== 0 || (Array.isArray(stability.failures) && stability.failures.length > 0)) {
    failures.push(`expected zero stability failures; got ${stability.failureCount}`);
  }

  const trackedShips = Array.isArray(stability.trackedShips) ? stability.trackedShips : [];
  const finalShips = Array.isArray(stability.finalShips) ? stability.finalShips : [];
  if (!trackedShips.length) failures.push('expected trackedShips evidence');
  if (!finalShips.length) failures.push('expected finalShips evidence');

  const visibleTracks = trackedShips.filter((track) => Number(track.inViewFrames) > 0);
  if (!visibleTracks.length) failures.push('expected at least one on-screen tracked ship');
  for (const track of visibleTracks) {
    if (Number(track.framesSeen) < MIN_INSPECTED_FRAMES) {
      failures.push(`visible track ${track.id || 'unknown'} only recorded ${track.framesSeen} frames`);
    }
    if (Number(track.missingMeshFrames) > 0) {
      failures.push(`visible track ${track.id || 'unknown'} had ${track.missingMeshFrames} missing-mesh frames`);
    }
  }

  const requiredShipFields = [
    'id',
    'defId',
    'meshExists',
    'authoredState',
    'compositionId',
    'lodLevel',
    'inView',
    'meshCount',
    'visibleRenderableCount',
    'authoredSurfaceCount',
    'visibleAuthoredSurfaceCount',
    'staticBatchCount',
    'visibleStaticBatchCount',
    'maxWorldPrimitiveRadius',
    'screenRadiusPx',
  ];
  for (const [index, ship] of finalShips.entries()) {
    for (const field of requiredShipFields) {
      if (!Object.hasOwn(ship, field)) failures.push(`finalShips[${index}] missing ${field}`);
    }
  }

  return failures;
}
