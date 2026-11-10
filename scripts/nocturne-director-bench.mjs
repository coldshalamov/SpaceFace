#!/usr/bin/env node
// CPU-only diagnostic of the production registry/director. No WebGL context is created;
// these timings cannot certify GPU cost, frame pacing, shader count or visual acceptance.
import { performance } from 'node:perf_hooks';
import { cpus, platform, arch } from 'node:os';
import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as THREE from 'three';
import { NocturneRegistry } from '../src/render/nocturne/registry.js';
import { NocturneDirector } from '../src/render/nocturne/director.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const options = { sources: [128, 512, 1024], frames: 2000, warmup: 200, out: null };
for (const argument of process.argv.slice(2)) {
  if (argument === '--help') {
    process.stdout.write('node scripts/nocturne-director-bench.mjs [--sources=128,512,1024] [--frames=2000] [--warmup=200] [--out=.devshots/nocturne/cpu.json]\n');
    process.exit(0);
  }
  const match = /^--(sources|frames|warmup|out)=(.+)$/.exec(argument);
  if (!match) throw new Error(`Unknown argument: ${argument}`);
  const [, key, value] = match;
  if (key === 'sources') options.sources = value.split(',').map(Number);
  else if (key === 'out') options.out = value;
  else options[key] = Number(value);
}
if (!options.sources.length || options.sources.some(n => !Number.isInteger(n) || n < 1 || n > 8192)
  || !Number.isInteger(options.frames) || options.frames < 120 || options.frames > 100000
  || !Number.isInteger(options.warmup) || options.warmup < 0 || options.warmup > 100000) {
  throw new Error('Sources must be integers 1..8192, frames 120..100000, and warmup 0..100000.');
}

function stats(values) {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  const quantile = fraction => values[Math.min(values.length - 1, Math.floor(fraction * (values.length - 1)))];
  return { samples: values.length, meanMs: values.reduce((a, b) => a + b, 0) / values.length,
    p50Ms: quantile(0.5), p95Ms: quantile(0.95), p99Ms: quantile(0.99), maxMs: values.at(-1) };
}

function measure(count) {
  const scene = new THREE.Scene();
  const registry = new NocturneRegistry({ capacity: count });
  const director = new NocturneDirector(scene, { registry, pointCount: 8, spotCount: 3,
    shadowCount: 0, selectionHz: 8, profile: false });
  const camera = new THREE.PerspectiveCamera(60, 1.6, 1, 3000);
  camera.position.set(0, 300, 400); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const columns = Math.ceil(Math.sqrt(count));
  for (let i = 0; i < count; i++) registry.register(`fixture:${i}`, {
    type: 'point', position: { x: (i % columns) * 22 - columns * 11, y: 8,
      z: Math.floor(i / columns) * 22 - columns * 11 },
    intensity: 4000, range: 150, color: 0xffbd77, priority: i % 3,
  });
  const frameOptions = { enabled: true, shadowEnabled: false };
  for (let i = 0; i < options.warmup; i++) director.update(1 / 60, camera, frameOptions);
  const all = new Array(options.frames), selection = [], held = [];
  const initialSelections = director.getDiagnostics().selections;
  const initialMemory = process.memoryUsage().heapUsed;
  for (let i = 0; i < options.frames; i++) {
    const before = director.getDiagnostics().selections;
    const start = performance.now();
    const diagnostic = director.update(1 / 60, camera, frameOptions);
    const elapsed = performance.now() - start;
    all[i] = elapsed;
    (diagnostic.selections === before ? held : selection).push(elapsed);
  }
  const finalMemory = process.memoryUsage().heapUsed;
  const diagnostic = { ...director.getDiagnostics() };
  director.dispose(); registry.clear();
  return { logicalSources: count, registeredSources: diagnostic.logical,
    eligibleCandidates: diagnostic.candidates, gpuLightStructure: { points: 8, spots: 3, shadowMaps: 0 },
    selectionPasses: diagnostic.selections - initialSelections, allUpdates: stats(all),
    selectionUpdates: stats(selection), retainedSelectionUpdates: stats(held),
    processHeapDeltaBytes: finalMemory - initialMemory,
    heapMeasurement: 'Uncollected process heap delta includes harness samples and JIT; not allocation or residency proof.' };
}

const files = ['src/render/nocturne/registry.js', 'src/render/nocturne/director.js',
  'src/render/nocturne/shadows.js', 'scripts/nocturne-director-bench.mjs'];
const digest = createHash('sha256');
for (const file of files) { digest.update(file); digest.update(readFileSync(resolve(root, file))); }
let gitHead = null;
try { gitHead = (await promisify(execFile)('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim(); } catch { /* exported sources */ }
const report = {
  evidence: 'synthetic-cpu-diagnostic', certifying: false,
  limitations: ['No GPU render, shader compilation, shadow-map draw, atmosphere or full game is measured.',
    'CPU wall time on this host is not an integrated-GPU or desktop-GPU performance acceptance result.',
    'Source digest binds the actual measured working files; gitHead alone does not describe uncommitted edits.'],
  generatedAt: new Date().toISOString(), gitHead, sourceSha256: digest.digest('hex'), sourceFiles: files,
  environment: { node: process.version, threeRevision: THREE.REVISION, platform: platform(), arch: arch(),
    cpuModel: cpus()[0]?.model || 'unknown', logicalCpus: cpus().length },
  configuration: { frames: options.frames, warmup: options.warmup, timestep: 1 / 60, selectionHz: 8,
    camera: { position: [0, 300, 400], target: [0, 0, 0], verticalFov: 60, aspect: 1.6 },
    scene: 'Stationary square grid at 22-unit spacing, 150-unit point-light influence, varied fixture priorities.' },
  runs: options.sources.map(measure),
};
const output = JSON.stringify(report, null, 2) + '\n';
if (options.out) {
  const path = resolve(options.out);
  mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, output);
}
process.stdout.write(output);
