/**
 * Primary KPI: canonicalDiagnostics under quiet residency polls.
 * Before = rebuild frozen sorted asset rows every call (pre-cache).
 * After  = return cached snapshot while registry is unchanged.
 * Quiet settled flight: reconcileMeshResidency publishes every ~250 ms with
 * no retain/release — the prepareFrame → serviceRenderMeshResidency residual.
 * Soft-GPU fps not claimed.
 */
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import * as THREE from 'three';
import { createAssetResidencyRegistry } from '../src/render/assetResidency.js';

function seedRegistry(assetCount) {
  const registry = createAssetResidencyRegistry({ maxGpuBytes: 1e12 });
  const owners = [];
  for (let i = 0; i < assetCount; i++) {
    const tex = new THREE.DataTexture(
      new Uint8Array(64 * 64 * 4),
      64,
      64,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    tex.needsUpdate = true;
    const key = `package:quiet-${i}`;
    registry.registerAsset(key, [tex], { cpuPackageBytes: 4096 });
    const owner = { type: 'live-boundary', name: `owner-${i}` };
    owners.push(owner);
    registry.retain(key, owner, { role: 'glass', presentationTier: 'R0_GLASS', sectorId: 'ceres' });
    if (i % 3 === 0) {
      const cacheOwner = { type: 'render-package-cache', contentHash: `h-${i}` };
      registry.retain(key, cacheOwner, { role: 'render-package-cache' });
    }
  }
  return registry;
}

function benchForceRebuild(registry, iterations) {
  // Simulate pre-cache by calling diagnostics() directly (never hits canonical cache).
  let sink = 0;
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    const snap = registry.diagnostics({ canonical: true, includeEvents: false });
    sink += snap.residentAssets + snap.residentBytes;
  }
  const ms = performance.now() - t0;
  return { ms, sink };
}

function benchCached(registry, iterations) {
  // Warm once, then quiet republish like reconcileMeshResidency every poll.
  registry.canonicalDiagnostics();
  let sink = 0;
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) {
    const snap = registry.canonicalDiagnostics();
    sink += snap.residentAssets + snap.residentBytes;
  }
  const ms = performance.now() - t0;
  return { ms, sink };
}

function runScenario(assetCount, iterations) {
  const registryBefore = seedRegistry(assetCount);
  const registryAfter = seedRegistry(assetCount);
  // Warm JIT
  benchForceRebuild(registryBefore, 20);
  benchCached(registryAfter, 20);
  const before = benchForceRebuild(registryBefore, iterations);
  const after = benchCached(registryAfter, iterations);
  const speedup = before.ms / Math.max(after.ms, 1e-9);
  return {
    assetCount,
    iterations,
    beforeMs: Math.round(before.ms * 100) / 100,
    afterMs: Math.round(after.ms * 100) / 100,
    speedup: Math.round(speedup * 100) / 100,
    sinkBefore: before.sink,
    sinkAfter: after.sink,
  };
}

const scenarios = [
  runScenario(40, 4000),
  runScenario(80, 4000),
  runScenario(160, 2000),
];

// Correctness: cache returns identical content while quiet; mutates after retain.
const verify = seedRegistry(24);
const a = verify.canonicalDiagnostics();
const b = verify.canonicalDiagnostics();
const sameRef = a === b;
const tex = new THREE.DataTexture(new Uint8Array(16), 2, 2, THREE.RGBAFormat, THREE.UnsignedByteType);
verify.registerAsset('package:new', [tex], { cpuPackageBytes: 16 });
verify.retain('package:new', { type: 'live-boundary' }, { role: 'glass' });
const c = verify.canonicalDiagnostics();
const mutated = c !== a && c.residentAssets === a.residentAssets + 1;

const report = {
  title: 'asset-residency-diagnostics-cache',
  scenarios,
  verify: { sameRef, mutated, beforeAssets: a.residentAssets, afterAssets: c.residentAssets },
  primary: scenarios.find((s) => s.assetCount === 80) || scenarios[0],
};
console.log(JSON.stringify(report, null, 2));
writeFileSync(
  new URL('./asset-residency-diagnostics-cache-microbench.json', import.meta.url),
  JSON.stringify(report, null, 2),
);
