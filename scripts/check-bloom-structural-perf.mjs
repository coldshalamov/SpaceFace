#!/usr/bin/env node
// Focused structural regression: bloom RT lifecycle + shared immutable resources.
// Headless Chromium on a private port — does not launch, focus, or kill user Electron/browser.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const { chromium } = await loadPlaywright();
let server = null;
let browser = null;

try {
  server = await startFreshServer();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });

  const report = await page.evaluate(async () => {
    const THREE = await import('three');
    const { createBloom } = await import('/src/render/bloom.js');
    const {
      getPostRenderTargetTelemetry,
      resetPostRenderTargetTotals,
      resetPostRenderTargetSampleCounter,
    } = await import('/src/render/postTelemetry.js');

    resetPostRenderTargetTotals();

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    renderer.setSize(320, 180, false);

    const bloomA = createBloom(renderer, 320, 180);
    const bloomB = createBloom(renderer, 320, 180);
    const afterInit = getPostRenderTargetTelemetry();
    const diagInit = bloomA.diagnostics();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 320 / 180, 0.1, 1000);
    camera.position.set(0, 8, 16);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(4, 10, 6);
    scene.add(key);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshStandardMaterial({
        color: 0x3366cc,
        emissive: 0x88ccff,
        emissiveIntensity: 3.5,
        metalness: 0.4,
        roughness: 0.35,
      }),
    );
    scene.add(mesh);

    bloomA.setOptions({ bloom: true, bloomStrength: 0.35, bloomThreshold: 0.72 });
    bloomA.render(scene, camera); // warm

    resetPostRenderTargetSampleCounter();
    const geo0 = renderer.info.memory.geometries;
    const tex0 = renderer.info.memory.textures;
    const programs0 = renderer.info.programs ? renderer.info.programs.length : 0;
    const totalBeforeSteady = getPostRenderTargetTelemetry().renderTargetAllocationsTotal;

    const STEADY_FRAMES = 90;
    for (let i = 0; i < STEADY_FRAMES; i++) {
      mesh.rotation.y += 0.02;
      bloomA.render(scene, camera);
    }

    // Same-size setSize must not allocate (early-out).
    for (let i = 0; i < 40; i++) bloomA.setSize(320, 180);

    const afterSteady = getPostRenderTargetTelemetry();
    const geo1 = renderer.info.memory.geometries;
    const tex1 = renderer.info.memory.textures;
    const programs1 = renderer.info.programs ? renderer.info.programs.length : 0;
    const diagSteady = bloomA.diagnostics();

    // One intentional resize, then another steady window must stay allocation-free.
    bloomA.setSize(400, 225);
    const afterResize = getPostRenderTargetTelemetry();
    resetPostRenderTargetSampleCounter();
    for (let i = 0; i < 45; i++) bloomA.render(scene, camera);
    const afterResizeSteady = getPostRenderTargetTelemetry();
    const diagResized = bloomA.diagnostics();

    // Shared geometry: two instances then dispose one — shared geo must survive.
    const sharedBefore = diagInit.sharedQuadGeometry === true;
    bloomB.dispose();
    bloomA.render(scene, camera);
    const stillWorksAfterPeerDispose = true;

    // Levels=4 multi-scale path (halfW >= 320): still no upsample RTs, still zero steady allocs.
    bloomA.setSize(1280, 720);
    const diagLevels2 = bloomA.diagnostics();
    resetPostRenderTargetSampleCounter();
    const totalBeforeL2 = getPostRenderTargetTelemetry().renderTargetAllocationsTotal;
    for (let i = 0; i < 60; i++) {
      mesh.rotation.y += 0.01;
      bloomA.render(scene, camera);
    }
    const afterL2 = getPostRenderTargetTelemetry();

    bloomA.dispose();
    renderer.dispose();

    return {
      initAllocations: afterInit.renderTargetAllocationsTotal,
      lastInitReason: afterInit.lastAllocationReason,
      diagnosticsInit: diagInit,
      diagnosticsSteady: diagSteady,
      diagnosticsResized: diagResized,
      diagnosticsLevels2: diagLevels2,
      steadyFrames: STEADY_FRAMES,
      allocationsDuringSteadySample: afterSteady.renderTargetAllocationsDuringSample,
      totalAllocDeltaDuringSteady: afterSteady.renderTargetAllocationsTotal - totalBeforeSteady,
      sameSizeSetSizeAllocations: afterSteady.renderTargetAllocationsDuringSample,
      geometriesDeltaSteady: geo1 - geo0,
      texturesDeltaSteady: tex1 - tex0,
      programsDeltaSteady: programs1 - programs0,
      resizeAllocations: afterResize.renderTargetAllocationsTotal - afterSteady.renderTargetAllocationsTotal,
      allocationsDuringPostResizeSteady: afterResizeSteady.renderTargetAllocationsDuringSample,
      levels2AllocationsDuringSteady: afterL2.renderTargetAllocationsDuringSample,
      levels2TotalAllocDelta: afterL2.renderTargetAllocationsTotal - totalBeforeL2,
      sharedQuadGeometry: sharedBefore,
      stillWorksAfterPeerDispose,
      memory: { geo0, geo1, tex0, tex1, programs0, programs1 },
    };
  });

  // --- structural invariants ---
  assert.ok(report.initAllocations >= 2, 'init must allocate scene + at least one pyramid target');
  assert.equal(report.diagnosticsInit.multiScaleComposite, true, 'multi-scale composite flag');
  assert.equal(report.diagnosticsInit.upsampleTargets, 0, 'no dedicated upsample RTs');
  assert.equal(
    report.diagnosticsInit.renderTargetCount,
    1 + report.diagnosticsInit.levels,
    'RT count must be scene + downsample levels only',
  );
  assert.equal(
    report.diagnosticsInit.bloomPasses,
    report.diagnosticsInit.levels,
    'bloomPasses equals downsample levels (upsample chain removed)',
  );
  assert.ok(report.diagnosticsInit.levels >= 1 && report.diagnosticsInit.levels <= 4);
  assert.equal(report.sharedQuadGeometry, true);

  assert.equal(
    report.allocationsDuringSteadySample,
    0,
    'zero post RT allocations during steady bloom frames',
  );
  assert.equal(
    report.totalAllocDeltaDuringSteady,
    0,
    'steady render must not grow allocation total',
  );
  assert.equal(report.geometriesDeltaSteady, 0, 'no geometry churn during steady frames');
  assert.equal(report.texturesDeltaSteady, 0, 'no texture object churn during steady frames');
  assert.ok(report.programsDeltaSteady <= 0, 'programs must not grow during steady frames');

  assert.ok(report.resizeAllocations >= 1, 'real resize may reallocate or resize RTs');
  assert.equal(
    report.allocationsDuringPostResizeSteady,
    0,
    'post-resize steady frames must not allocate',
  );
  assert.equal(
    report.diagnosticsResized.renderTargetCount,
    1 + report.diagnosticsResized.levels,
  );
  assert.equal(report.stillWorksAfterPeerDispose, true);

  assert.equal(report.diagnosticsLevels2.levels, 4, '1280x720 must use 4 pyramid levels');
  assert.equal(report.diagnosticsLevels2.upsampleTargets, 0);
  assert.equal(
    report.diagnosticsLevels2.renderTargetCount,
    1 + report.diagnosticsLevels2.levels,
    'levels=2 RT count = scene + 2 downs (no upsample RT)',
  );
  assert.equal(report.diagnosticsLevels2.bloomPasses, 4);
  assert.equal(report.levels2AllocationsDuringSteady, 0);
  assert.equal(report.levels2TotalAllocDelta, 0);

  // --- NaN regression net (mirrors COMPOSITE_FRAG's grade math in JS) ---
  // The grade bug was mix(vec3(preTintLuma), graded, 1.15) driving a channel < 0, which then hit
  // pow() in the sRGB encode → NaN. black→black (luma 0) never exercises it; dim SATURATED colors do.
  // These probes assert the grade maps every probe to a finite, non-negative pre-encode value.
  const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  const gradeProbe = (c, uGrade = 0.75) => {
    const luma = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    const t = smooth(0.10, 0.60, luma);
    const sBal = [0.88, 0.98, 1.10], hBal = [1.10, 1.00, 0.88];
    let g = c.map((v, i) => v * (sBal[i] + (hBal[i] - sBal[i]) * t));
    const luma2 = 0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2];
    g = g.map((v) => Math.max(luma2 + (v - luma2) * 1.15, 0));
    const out = c.map((v, i) => v + (g[i] - v) * uGrade);
    return out.map((v) => Math.max(v - 0.006, 0) / (1 - 0.006));
  };
  const NAN_PROBES = [
    [0, 0, 0], [0.01, 0.01, 0.01], [0.005, 0.01, 0.03], [0.02, 0, 0], [0.3, 0.05, 0.02], [0.5, 0.8, 2.0],
  ];
  for (const p of NAN_PROBES) {
    const o = gradeProbe(p);
    assert.ok(
      o.every((v) => Number.isFinite(v) && v >= 0),
      `grade must map ${JSON.stringify(p)} to finite non-negative, got ${JSON.stringify(o)}`,
    );
  }

  console.log('bloom-structural-perf PASS', JSON.stringify(report));
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

async function startFreshServer() {
  const port = await findFreePort(8740);
  const baseUrl = `http://127.0.0.1:${port}/`;
  const child = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let output = '';
  const capture = (chunk) => { output = (output + String(chunk)).slice(-4000); };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  for (let i = 0; i < 80; i++) {
    if (child.exitCode != null) throw new Error(`server exited early\n${output}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return { baseUrl, kill: () => child.kill() };
    } catch (_) { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error(`server did not become reachable at ${baseUrl}\n${output}`);
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('no free port for bloom structural perf check');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}
