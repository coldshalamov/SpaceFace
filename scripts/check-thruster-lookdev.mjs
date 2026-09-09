#!/usr/bin/env node
/**
 * Hard visual gate for player plasma thruster look-dev.
 *
 * Does NOT trust unit tests alone. Captures headless rear + rear¾ shots, then
 * asserts from live PlasmaStreamSystem geometry:
 *   1) trail tip is aft of the nozzle (not nose-forward / backwards)
 *   2) history path has enough samples for a real wake (not a nozzle stub)
 *   3) drawn strip span is long enough to read as a trail
 *   4) the exhaust volume itself is live, aft-facing, and marching a real budget
 *
 * (4) exists because 1-3 only ever measured the history filament, which is the thin stylistic
 * thread — not the exhaust. Every one of them would stay green with the plume entirely missing.
 *
 * Exit 0 = shippable on structure gates. Exit 1 = do not claim thruster done.
 *
 * Usage:
 *   node scripts/check-thruster-lookdev.mjs
 *   node scripts/check-thruster-lookdev.mjs --out <dir>
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import * as THREE from 'three';
import { PlasmaStreamSystem } from '../src/render/thruster/systems/plasmaStream.js';
import { PLAYER_PLASMA_STREAM_RECIPE } from '../src/render/thruster/recipes/plasmaStreamRecipe.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
function arg(name, fallback = '') {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}

const OUT = path.resolve(
  arg('out', path.join(ROOT, '.devshots', 'graphics', 'thruster-lookdev-gate')),
);
const ITER = 'gate';
const GATE_DIR = path.join(OUT, `iter-${ITER}`);

const MIN_HISTORY = 24;
const MIN_POINT_COUNT = 32;
const MIN_AFT_SPAN_WU = 8; // tip must be at least this far aft of nozzle
const MIN_TIP_BEHIND_ROOT_WU = 3;
const MIN_VOLUME_STEPS = 16; // a march this coarse cannot resolve filaments at close framing
const MIN_PLUME_LEN_WU = 6; // proxy must actually span a plume, not sit as a nub on the bell

function run(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit', shell: true });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}`))));
  });
}

function measureStreamGeometry() {
  const scene = new THREE.Scene();
  const stream = new PlasmaStreamSystem(THREE, PLAYER_PLASMA_STREAM_RECIPE);
  stream.attach(scene);
  // Production ContinuousPlume convention: ax opposite exhaust.
  // Ship flies +X; exhaust aft = -X; ax = +1.
  const sockets = [{ x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 }];
  const drive = { drive: 1, throttle: 1, boost: 0.2, speed: 180 };
  const owner = { id: 'thruster-lookdev-gate' };
  for (let i = 0; i < 80; i++) {
    sockets[0].x = i * 2.0;
    stream.setCameraPosition(sockets[0].x + 12, 6, 14);
    stream.update(1 / 60, sockets, drive, { reducedMotion: false }, owner);
  }
  const info = stream.inspect();
  const liveX = sockets[0].x;

  const fails = [];
  if (!info.active) fails.push('stream not active under thrust');

  const rib = info.ribbon;
  if (!rib || rib.element !== 'plume') {
    fails.push('plume element is missing or not live');
  } else {
    if (!rib.visible) fails.push('plume ribbon mesh is not visible under thrust');
    if (!(rib.jetLength >= MIN_PLUME_LEN_WU)) {
      fails.push(`plume jetLength ${rib.jetLength.toFixed(2)} WU < ${MIN_PLUME_LEN_WU}`);
    }
  }

  const con = info.contrail;
  if (!con || con.element !== 'contrail') {
    fails.push('contrail element is missing or not live');
  } else {
    if (!con.visible) fails.push('contrail trail mesh is not visible under thrust');
    if (!(con.liveSamples >= 8)) {
      fails.push(`contrail liveSamples ${con.liveSamples} < 8 (no real wake)`);
    }
    if (!(con.spanWU >= MIN_AFT_SPAN_WU)) {
      fails.push(`contrail span ${con.spanWU.toFixed(2)} < ${MIN_AFT_SPAN_WU} WU (trail too short)`);
    }
  }

  stream.dispose();

  return {
    ok: fails.length === 0,
    fails,
    info,
    liveX,
    span: con ? con.spanWU : 0,
    plumeLen: rib ? rib.jetLength : 0,
    recipeId: PLAYER_PLASMA_STREAM_RECIPE.id,
  };
}

await mkdir(GATE_DIR, { recursive: true });

// 1) Headless captures (must succeed — no "claimed done" without screenshots)
console.log('capturing thruster look-dev (headless)...');
await run('node', [
  'scripts/capture-thruster-lookdev.mjs',
  '--out', OUT,
  '--iter', ITER,
  '--frames', '120',
]);

const needShots = ['rear.png', 'rear34.png', 'rear34-bloom-off.png', 'capture.json'];
for (const f of needShots) {
  if (!existsSync(path.join(GATE_DIR, f))) {
    console.error(`GATE FAIL: missing capture ${f}`);
    process.exit(1);
  }
}

// 2) Geometry / history structure gate (would have caught backwards + no trail)
const measure = measureStreamGeometry();
const captureJson = JSON.parse(await readFile(path.join(GATE_DIR, 'capture.json'), 'utf8'));

const report = {
  gate: 'check-thruster-lookdev',
  recipeId: measure.recipeId,
  ok: measure.ok,
  fails: measure.fails,
  measure: {
    liveX: measure.liveX,
    rootX: measure.rootX,
    tipX: measure.tipX,
    span: measure.span,
    plumeTipX: measure.plumeTipX,
    plumeLen: measure.plumeLen,
    volumeSteps: measure.volumeSteps,
    volumeLive: measure.volumeLive,
    historyCount: measure.info?.path?.historyCount,
    pointCount: measure.info?.pointCount,
    active: measure.info?.active,
  },
  captureInspect: {
    rearHistory: captureJson?.rear?.path?.historyCount,
    rear34History: captureJson?.rear34?.path?.historyCount,
    bloomOffHistory: captureJson?.bloomOff?.path?.historyCount,
    rearPoints: captureJson?.rear?.pointCount,
    rear34Points: captureJson?.rear34?.pointCount,
  },
  shots: needShots.map((f) => path.join(GATE_DIR, f)),
  thresholds: {
    MIN_HISTORY,
    MIN_POINT_COUNT,
    MIN_AFT_SPAN_WU,
    MIN_TIP_BEHIND_ROOT_WU,
    MIN_VOLUME_STEPS,
    MIN_PLUME_LEN_WU,
  },
};

// Capture path must also show history (lab moves the ship)
if ((captureJson?.rear34?.path?.historyCount ?? 0) < MIN_HISTORY) {
  measure.ok = false;
  measure.fails.push(
    `capture rear34 historyCount ${captureJson?.rear34?.path?.historyCount ?? 0} < ${MIN_HISTORY}`,
  );
  report.ok = false;
  report.fails = measure.fails;
}

await writeFile(path.join(GATE_DIR, 'GATE_REPORT.json'), JSON.stringify(report, null, 2));
await writeFile(
  path.join(GATE_DIR, 'GATE_REPORT.md'),
  [
    `# Thruster look-dev gate`,
    ``,
    `**Result:** ${report.ok ? 'PASS' : 'FAIL'}`,
    `**Recipe:** \`${report.recipeId}\``,
    ``,
    report.ok
      ? `Trail is aft of nozzle, history is present, captures written.`
      : `Do **not** claim thruster done. Fix fails below, re-run this gate, re-read the PNGs.`,
    ``,
    `## Fails`,
    ...(report.fails.length ? report.fails.map((f) => `- ${f}`) : ['- (none)']),
    ``,
    `## Measure`,
    `- liveX=${report.measure.liveX}`,
    `- rootX=${report.measure.rootX}`,
    `- tipX=${report.measure.tipX}`,
    `- span=${report.measure.span}`,
    `- plumeTipX=${report.measure.plumeTipX}`,
    `- plumeLen=${report.measure.plumeLen}`,
    `- volumeSteps=${report.measure.volumeSteps} (live nozzles: ${report.measure.volumeLive})`,
    `- historyCount=${report.measure.historyCount}`,
    `- pointCount=${report.measure.pointCount}`,
    ``,
    `## Shots (must be opened and reviewed by the agent before any "done" claim)`,
    ...report.shots.map((s) => `- ${s}`),
    ``,
  ].join('\n'),
);

if (!report.ok) {
  console.error('THRUSTER LOOKDEV GATE FAIL');
  for (const f of report.fails) console.error(' -', f);
  console.error(`report: ${path.join(GATE_DIR, 'GATE_REPORT.md')}`);
  console.error('Open rear34-bloom-off.png and rear.png before claiming thruster work is done.');
  process.exit(1);
}

console.log('THRUSTER LOOKDEV GATE PASS');
console.log(`shots: ${GATE_DIR}`);
console.log(`tip aft of nozzle: tipX=${report.measure.tipX?.toFixed?.(2)} liveX=${report.measure.liveX}`);
console.log(`historyCount=${report.measure.historyCount} pointCount=${report.measure.pointCount}`);
console.log(`plume: ${report.measure.plumeLen?.toFixed?.(2)} WU aft, ${report.measure.volumeSteps} march steps`);
process.exit(0);
