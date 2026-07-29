#!/usr/bin/env node
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
  await page.goto(`${server.baseUrl}test/trail-streak-instancing-webgl.html`, {
    waitUntil: 'domcontentloaded',
  });

  const report = await page.evaluate(async () => {
    const THREE = await import('three');
    const { createVfxPrecompileSalvo } = await import('/src/render/vfx.js');
    const { createDynamicBufferCoordinator } = await import('/src/render/dynamicBufferRanges.js');
    const {
      initTrailStreakPool,
      updateTrailStreakInstance,
      commitTrailStreakInstances,
    } = await import('/src/render/engineTrailSurfaces.js');

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    renderer.setSize(96, 96, false);
    const target = new THREE.WebGLRenderTarget(96, 96);
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 1);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0, 10, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);

    const salvo = createVfxPrecompileSalvo();
    scene.add(salvo);
    await renderer.compileAsync(scene, camera, scene);
    const staged = salvo.getObjectByName('SF_Precompile_TrailStreak');
    const programsAfterPrecompile = renderer.info.programs.length;
    scene.remove(salvo);

    const dynamicBuffers = createDynamicBufferCoordinator(scene);
    const pool = initTrailStreakPool(scene, 96);
    updateTrailStreakInstance(pool, 0, {
      x: 0, y: 0, z: 0, vx: 1, vz: 0,
      width: 5, length: 12, opacity: 1,
      color: { r: 1, g: 0.6, b: 0.2 },
    });
    commitTrailStreakInstances(pool, 1, { scroll: 0.17, time: 0.8 });
    renderer.clear();
    let epoch = dynamicBuffers.arm();
    try {
      renderer.render(scene, camera);
    } finally {
      dynamicBuffers.disarm(epoch);
    }

    updateTrailStreakInstance(pool, 0, {
      x: 1, y: 0, z: 0, vx: 1, vz: 0,
      width: 5, length: 12, opacity: 0.9,
      color: { r: 1, g: 0.5, b: 0.2 },
    });
    commitTrailStreakInstances(pool, 1, { scroll: 0.2, time: 1.0 });
    epoch = dynamicBuffers.arm();
    try {
      renderer.render(scene, camera);
    } finally {
      dynamicBuffers.disarm(epoch);
    }

    const programsAfterFirstLiveTrail = renderer.info.programs.length;
    const materialProperties = renderer.properties.get(pool.mesh.material);
    const currentProgram = materialProperties && materialProperties.currentProgram;
    const gl = renderer.getContext();
    const handle = currentProgram && currentProgram.program;
    const activeAttributes = [];
    if (handle) {
      const count = gl.getProgramParameter(handle, gl.ACTIVE_ATTRIBUTES);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveAttrib(handle, i);
        if (info) activeAttributes.push(info.name);
      }
    }
    const pixels = new Uint8Array(96 * 96 * 4);
    renderer.readRenderTargetPixels(target, 0, 0, 96, 96, pixels);
    let litPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] || pixels[i + 1] || pixels[i + 2]) litPixels++;
    }
    const glError = gl.getError();
    const dynamicDiagnostics = dynamicBuffers.getDiagnostics().owners[0];

    target.dispose();
    renderer.dispose();
    return {
      stagedIsInstancedMesh: !!(staged && staged.isInstancedMesh),
      stagedCount: staged && staged.count,
      stagedColorAttribute: !!(staged && staged.geometry.getAttribute('aTrailColor')),
      stagedOpacityAttribute: !!(staged && staged.geometry.getAttribute('aTrailOpacity')),
      programsAfterPrecompile,
      programsAfterFirstLiveTrail,
      activeAttributes,
      litPixels,
      glError,
      dynamicForceFullUploads: dynamicDiagnostics.forceFullUploads,
      dynamicPartialUploads: dynamicDiagnostics.partialUploads,
      dynamicAcknowledgements: dynamicDiagnostics.acknowledgements,
    };
  });

  assert.equal(report.stagedIsInstancedMesh, true,
    'precompile WebGL scene must contain the live InstancedMesh');
  assert.equal(report.stagedCount, 1, 'precompile must compile one initialized trail instance');
  assert.equal(report.stagedColorAttribute, true);
  assert.equal(report.stagedOpacityAttribute, true);
  assert.equal(report.programsAfterFirstLiveTrail, report.programsAfterPrecompile,
    'the first live trail must reuse the precompiled program');
  for (const name of ['instanceMatrix', 'aTrailColor', 'aTrailOpacity']) {
    assert(report.activeAttributes.includes(name),
      `linked WebGL trail program must consume ${name}; active=${report.activeAttributes.join(',')}`);
  }
  assert(report.litPixels > 0, 'the instanced trail must produce visible render-target pixels');
  assert.equal(report.glError, 0, 'instanced trail draw must complete without a WebGL error');
  assert.equal(report.dynamicForceFullUploads, 3,
    'first processing must publish the complete matrix/color/opacity generation');
  assert.equal(report.dynamicPartialUploads, 3,
    'the next draw must publish one packed prefix per changed trail attribute');
  assert.equal(report.dynamicAcknowledgements, 6,
    'Three upload callbacks must acknowledge both trail generations');

  console.log('trail-streak-instancing-webgl PASS', JSON.stringify(report));
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

async function startFreshServer() {
  const port = await findFreePort(8560);
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
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  child.kill();
  throw new Error(`server did not become reachable at ${baseUrl}`);
}

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
    if (await isPortFree(port)) return port;
  }
  throw new Error('no free port for trail WebGL check');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}
