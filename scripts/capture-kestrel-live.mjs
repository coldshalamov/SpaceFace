#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 41731);
assert.ok(Number.isInteger(PORT) && PORT > 0 && PORT <= 65_535, `invalid capture port: ${PORT}`);
const BASE = `http://127.0.0.1:${PORT}/`;
const OUT = resolve(ROOT, process.env.SF_KESTREL_CAPTURE_DIR || '.devshots/k0-kestrel');
const shots = [
  { name: 'live-3q-close.png', distance: 33, height: 15, lod: 'lod0' },
  { name: 'live-3q-120px.png', distance: 120, height: 44, lod: 'lod1' },
  { name: 'live-3q-under45px.png', distance: 420, height: 140, lod: 'lod2' },
];

await mkdir(OUT, { recursive: true });
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
let browser;
try {
  await waitForServer();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => sessionStorage.setItem('sf.cinematicSeen', '1'));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).search, '', 'three-scale proof must use the canonical player route');
  await page.waitForFunction(() => window.SF && window.SF.bus && window.SF.state, null, { timeout: 20_000 });
  await page.evaluate(() => {
    window.SF.bus.emit('game:new', { name: 'K0 Kestrel Live Capture', seed: 47 });
    window.SF.bus.emit('ui:closeAll', {});
  });
  await page.waitForFunction(() => {
    const state = window.SF?.state;
    const player = state?.entityList?.find((entity) => entity?.id === state.playerId);
    const data = player?.mesh?.userData || {};
    return state?.mode === 'flight'
      && data.authoredAssetState === 'authored'
      && data.authoredVisualRoot === 'authored-root'
      && data.authoredReadableFallbackRetained === false
      && Object.values(data.authoredSlots || {}).flat().some((url) => String(url).includes('/wholeships/kestrel.glb'));
  }, null, { timeout: 90_000 });

  const report = [];
  for (const shot of shots) {
    const capture = await page.evaluate(({ distance, height, lod }) => {
      const state = window.SF.state;
      const player = state.entityList.find((entity) => entity?.id === state.playerId);
      for (const entity of state.entityList) {
        if (entity?.type === 'ship' && entity.id !== player.id && entity.mesh) entity.mesh.visible = false;
      }
      const root = player.mesh;
      const camera = state.render.camera;
      const Vector3 = camera.position.constructor;
      const target = new Vector3();
      root.getWorldPosition(target);
      const yaw = -(Number(player.rot) || 0);
      const offset = new Vector3(distance * 0.72, height, distance * 0.58)
        .applyAxisAngle(new Vector3(0, 1, 0), yaw);
      camera.position.copy(target).add(offset);
      camera.up.set(0, 1, 0);
      camera.lookAt(target);
      camera.near = 0.1;
      camera.far = Math.max(camera.far || 0, 5000);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      root.traverse((object) => {
        if (typeof object.userData?.updateLod === 'function') object.userData.updateLod(lod);
      });
      if (typeof state.render.warmPostProcess === 'function') state.render.warmPostProcess();
      else state.render.renderer.render(state.render.scene, camera);
      const dataUrl = state.render.renderer.domElement.toDataURL('image/png');
      return {
        dataUrl,
        mode: state.mode,
        lod,
        authoredAssetState: root.userData.authoredAssetState,
        authoredVisualRoot: root.userData.authoredVisualRoot,
        authoredReadableFallbackRetained: root.userData.authoredReadableFallbackRetained,
        authoredSlots: root.userData.authoredSlots,
        fallbackParts: root.userData.proceduralFallbackParts,
        cameraDistance: camera.position.distanceTo(target),
      };
    }, shot);
    assert.match(capture.dataUrl, /^data:image\/png;base64,/);
    const bytes = Buffer.from(capture.dataUrl.slice(capture.dataUrl.indexOf(',') + 1), 'base64');
    await writeFile(resolve(OUT, shot.name), bytes);
    delete capture.dataUrl;
    report.push({ file: `.devshots/k0-kestrel/${shot.name}`, bytes: bytes.length, ...capture });
  }
  await writeFile(resolve(OUT, 'live-capture.json'), `${JSON.stringify({
    schema: 'spaceface.k0KestrelLiveCapture.v1',
    route: BASE,
    viewport: [1440, 900],
    captures: report,
  }, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(BASE);
      if (response.ok) return;
    } catch (_) {}
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error(`server did not become ready at ${BASE}`);
}
