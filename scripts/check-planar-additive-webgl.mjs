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
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });

  const report = await page.evaluate(async () => {
    const THREE = await import('three');
    const { configurePlanarAdditiveMaterial } = await import('/src/render/planarAdditivePolicy.js');
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false });
    renderer.setSize(128, 128, false);
    renderer.setClearColor(0x000000, 1);
    const target = new THREE.WebGLRenderTarget(128, 128);
    renderer.setRenderTarget(target);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.set(0, 0, 2);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const geometry = new THREE.CircleGeometry(0.82, 64);

    const render = (singlePass) => {
      const material = new THREE.MeshBasicMaterial({
        color: 0x55d8ff,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      if (singlePass) configurePlanarAdditiveMaterial(material);
      const scene = new THREE.Scene();
      scene.add(new THREE.Mesh(geometry, material));
      renderer.info.reset();
      renderer.clear();
      renderer.render(scene, camera);
      const pixels = new Uint8Array(128 * 128 * 4);
      renderer.readRenderTargetPixels(target, 0, 0, 128, 128, pixels);
      return {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        pixels: Array.from(pixels),
      };
    };

    const baseline = render(false);
    const optimized = render(true);
    let changedBytes = 0;
    for (let i = 0; i < baseline.pixels.length; i++) {
      if (baseline.pixels[i] !== optimized.pixels[i]) changedBytes += 1;
    }
    const result = {
      baseline: { calls: baseline.calls, triangles: baseline.triangles },
      optimized: { calls: optimized.calls, triangles: optimized.triangles },
      changedBytes,
      glError: renderer.getContext().getError(),
    };
    geometry.dispose();
    target.dispose();
    renderer.dispose();
    return result;
  });

  assert.equal(report.baseline.calls, 2, 'Three.js baseline submits transparent DoubleSide twice');
  assert.equal(report.optimized.calls, 1, 'planar policy submits the surface once');
  assert.equal(report.optimized.triangles * 2, report.baseline.triangles);
  assert.equal(report.changedBytes, 0, 'single-pass and baseline render-target pixels must match exactly');
  assert.equal(report.glError, 0);
  console.log('planar-additive-webgl PASS', JSON.stringify(report));
} finally {
  if (browser) await browser.close();
  if (server && server.kill) server.kill();
}

async function startFreshServer() {
  const port = await findFreePort(8640);
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
  throw new Error('no free port for planar-additive WebGL check');
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}
