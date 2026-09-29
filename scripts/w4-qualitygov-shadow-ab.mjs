// W4 Invisible Quality Governor A/B: realtime shadow-map refresh rate with view-scoped
// asteroid instance uploads. Spawns ast_common_rock at the view edge (inside the live
// glass at max zoom, outside the ±300 shadow ortho) so baseline marks the map dirty every
// frame while the patch scopes dirty to ortho-covered uploads only.
// Usage: node scripts/w4-qualitygov-shadow-ab.mjs [--headless] [--out <path>]
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const args = process.argv.slice(2);
const HEADLESS = args.includes('--headless');
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const ROCK_SPEC = (x, z) => ({
  type: 'asteroid', pos: { x, z }, radius: 12, mass: 500, hull: 240, hullMax: 240,
  data: { typeId: 'ast_common_rock', oreHP: 240, oreHPMax: 240 },
});

async function findFreePort(start) {
  for (let port = start; port < start + 60; port++) {
    if (await new Promise((resolve) => {
      const s = createNetServer();
      s.once('error', () => resolve(false));
      s.once('listening', () => s.close(() => resolve(true)));
      s.listen(port, '127.0.0.1');
    })) return port;
  }
  throw new Error('no port');
}

const port = await findFreePort(8260);
const child = spawn(process.execPath, ['server.js', String(port)], { cwd: ROOT, stdio: 'ignore' });
const url = `http://127.0.0.1:${port}/`;
for (let i = 0; i < 80; i++) {
  try { const r = await fetch(url); if (r.ok) break; } catch (_) {}
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch({
  headless: HEADLESS,
  executablePath: 'C:/devin/chrome/chrome-win64/chrome.exe',
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const result = { headless: HEADLESS, phases: {} };
try {
  await page.goto(`${url}?debug=flight`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 20000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'W4 Shadow AB' }));
  await page.waitForFunction(() => window.SF.state.mode === 'flight' && window.SF.state.playerId, null, { timeout: 90000 });
  // Push a wide frame immediately — liveZoom follows _dynamicZoom toward the pushed
  // target (setZoom 330 * speedZoom * pushZoom) over a few seconds.
  await page.evaluate(() => {
    window.SF.bus.emit('camera:zoom', { level: 330 });
    window.SF.state.render?.cameraCtrl?.pushZoom?.(0.5, 90);
  });
  await page.waitForTimeout(3000);

  result.env = await page.evaluate(() => {
    const st = window.SF.state;
    return {
      shadows: st.settings?.video?.shadows,
      zoom: st.camera?.zoom,
      pool: st.render?.asteroidInstancePool ? { registered: st.render.asteroidInstancePool.registered } : null,
      hasRenderer: !!st.render?.renderer,
    };
  });

  // Force realtime shadows on (stock preset may have them off).
  await page.evaluate(() => {
    const st = window.SF.state;
    if (st.settings?.video) st.settings.video.shadows = true;
    window.SF.bus.emit('settings:changed', { section: 'video', key: 'shadows' });
  });

  // Park the ship at the sector: keeps the ortho live (receivers stay in tally) while
  // the caster pose stays quiet so it never latches _shadowMapDirty on its own.
  await page.evaluate(() => {
    const p = window.SF.state.entities.get(window.SF.state.playerId);
    if (p) {
      if (p.vel) { p.vel.x = 0; p.vel.z = 0; }
      if ('vx' in p) p.vx = 0;
      if ('vz' in p) p.vz = 0;
    }
  });

  // The glass only covers the edge rocks once liveZoom actually opens past ~330
  // (pushZoom decays slowly over the 90s duration so the frame stays wide).
  await page.waitForFunction(
    () => Number(window.SF.state.camera?.liveZoom ?? window.SF.state.camera?.zoom) >= 360,
    null, { timeout: 60000 });
  await page.waitForTimeout(2000);

  // View-edge rocks: inside the live glass but outside the shadow ortho. The band's
  // shape depends on the key light's azimuth + zoom, so scan a polar grid in-page and
  // spawn only where a rock's sphere is in-view AND outside the real shadow frustum.
  await page.evaluate((specSrc) => { window.__ROCK_SPEC = eval(specSrc); },
    `(${ROCK_SPEC.toString()})`);
  result.candidates = await page.evaluate(() => {
    const st = window.SF.state;
    const svc = window.SF.registry.get('render');
    const THREE = window.SF.THREE;
    const shadowCam = svc._activeShadowCamera;
    if (!shadowCam) return { points: 0, reason: 'no activeShadowCamera' };
    const shFr = new THREE.Frustum();
    shFr.setFromProjectionMatrix(new THREE.Matrix4()
      .multiplyMatrices(shadowCam.projectionMatrix, shadowCam.matrixWorldInverse));
    const viewCam = st.render.camera;
    const viFr = new THREE.Frustum();
    viFr.setFromProjectionMatrix(new THREE.Matrix4()
      .multiplyMatrices(viewCam.projectionMatrix, viewCam.matrixWorldInverse));
    const p = st.entities.get(st.playerId);
    const px = p?.pos?.x || 0, pz = p?.pos?.z || 0;
    window.__abOrigin = { x: px, z: pz };
    const sphere = new THREE.Sphere(new THREE.Vector3(), 26);
    const pts = [];
    for (let r = 150; r <= 660 && pts.length < 24; r += 18) {
      for (let a = 0; a < Math.PI * 2 && pts.length < 24; a += Math.PI / 30) {
        sphere.center.set(px + Math.cos(a) * r, 0, pz + Math.sin(a) * r);
        if (viFr.intersectsSphere(sphere) && !shFr.intersectsSphere(sphere)) {
          pts.push([Math.round(sphere.center.x), Math.round(sphere.center.z)]);
        }
      }
    }
    window.__abCandidates = pts;
    return { points: pts.length };
  });
  await page.evaluate(() => {
    let n = 0;
    for (const [x, z] of (window.__abCandidates || [])) {
      window.SF.bus.emit('entity:spawnRequest', { spec: window.__ROCK_SPEC(x, z) });
      n++;
    }
    window.__abSpawned = n;
  });
  // Wait until pool-adopted records exist.
  await page.waitForFunction(
    () => (window.SF.state.render?.asteroidInstancePool?.registered || 0) > 0,
    null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // The shadow ortho is axis-aligned in LIGHT space, so world-x alone does not clear it.
  // Sweep every nearby asteroid against the real shadow frustum and push intersecting
  // ones outward along their radial from the player until they clear the box.
  result.sweep = await page.evaluate(() => {
    const st = window.SF.state;
    const svc = window.SF.registry.get('render');
    const THREE = window.SF.THREE;
    const cam = svc._activeShadowCamera;
    if (!cam) return { activeShadowCamera: false, moved: 0, remaining: -1 };
    const frustum = new THREE.Frustum();
    frustum.setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const p = st.entities.get(st.playerId);
    const px = p?.pos?.x || 0, pz = p?.pos?.z || 0;
    const sphere = new THREE.Sphere(new THREE.Vector3(), 0);
    let moved = 0, remaining = 0;
    for (const e of st.entities.values()) {
      if (e.type !== 'asteroid' || !e.pos) continue;
      const dx = e.pos.x - px, dz = e.pos.z - pz;
      if (dx * dx + dz * dz > 700 * 700) continue;
      const r = Math.max(20, (e.radius || 12) * 2);
      sphere.center.set(e.pos.x, 0, e.pos.z);
      sphere.radius = r;
      let guard = 0;
      while (frustum.intersectsSphere(sphere) && guard++ < 200) {
        const len = Math.hypot(dx, dz) || 1;
        e.pos.x += (dx / len) * 10;
        e.pos.z += (dz / len) * 10;
        sphere.center.set(e.pos.x, 0, e.pos.z);
        moved++;
      }
      sphere.center.set(e.pos.x, 0, e.pos.z);
      if (frustum.intersectsSphere(sphere)) remaining++;
      // Mirror the render mesh root so pose sync does not pull it back first.
      const mesh = st.render.meshes && st.render.meshes.get(e.id);
      if (mesh && mesh.position) mesh.position.set(e.pos.x, e.pos.y || 0, e.pos.z);
    }
    // How many asteroids remain in the view frustum but outside the shadow box —
    // the view-only union subset this patch scopes away from the dirty flag.
    const viewCam = st.render.camera;
    const viewFrustum = new THREE.Frustum();
    viewFrustum.setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(viewCam.projectionMatrix, viewCam.matrixWorldInverse));
    let viewOnly = 0, inOrtho = 0;
    for (const e of st.entities.values()) {
      if (e.type !== 'asteroid' || !e.pos) continue;
      const dx = e.pos.x - px, dz = e.pos.z - pz;
      if (dx * dx + dz * dz > 900 * 900) continue;
      sphere.center.set(e.pos.x, 0, e.pos.z);
      sphere.radius = Math.max(20, (e.radius || 12) * 2);
      const v = viewFrustum.intersectsSphere(sphere);
      const s = frustum.intersectsSphere(sphere);
      if (s) inOrtho++;
      else if (v) viewOnly++;
    }
    return { activeShadowCamera: true, moved, remaining, viewOnly, inOrtho };
  });
  // Ground truth: where everything actually is, in case pos writes are physics-owned.
  result.diag = await page.evaluate(() => {
    const st = window.SF.state;
    const p = st.entities.get(st.playerId);
    const rocks = [];
    for (const e of st.entities.values()) {
      if (e.type === 'asteroid' && e.pos) rocks.push([Math.round(e.pos.x), Math.round(e.pos.z)]);
    }
    const cam = st.render.camera;
    const svc = window.SF.registry.get('render');
    return {
      playerPos: p && p.pos ? { x: Math.round(p.pos.x), z: Math.round(p.pos.z) } : null,
      rockCount: rocks.length,
      rocks: rocks.slice(0, 30),
      camPos: cam && cam.position ? { x: Math.round(cam.position.x), y: Math.round(cam.position.y), z: Math.round(cam.position.z) } : null,
      camFocus: st.camera?.focus ? { x: Math.round(st.camera.focus.x), z: Math.round(st.camera.focus.z) } : null,
      shadowFollowPos: svc._shadowFollow ? { x: Math.round(svc._shadowFollow.x), z: Math.round(svc._shadowFollow.z) } : null,
      shadowCamPos: svc._activeShadowCamera ? {
        x: Math.round(svc._activeShadowCamera.position.x),
        y: Math.round(svc._activeShadowCamera.position.y),
        z: Math.round(svc._activeShadowCamera.position.z) } : null,
      shadowCamTarget: svc._keyLight?.target ? {
        x: Math.round(svc._keyLight.target.position.x),
        z: Math.round(svc._keyLight.target.position.z) } : null,
    };
  });
  await page.waitForTimeout(500);

  result.setup = await page.evaluate(() => ({
    spawned: window.__abSpawned,
    pool: window.SF.state.render?.asteroidInstancePool
      ? { registered: window.SF.state.render.asteroidInstancePool.registered,
          submitted: window.SF.state.render.asteroidInstancePool.submitted }
      : null,
    zoom: window.SF.state.camera?.zoom,
    liveZoom: window.SF.state.camera?.liveZoom,
    shadows: window.SF.state.settings?.video?.shadows,
    asteroids: (() => { let n = 0; for (const e of window.SF.state.entities.values()) if (e.type === 'asteroid') n++; return n; })(),
  }));

  // Reach the game's render service and gate on a live ortho + enabled map first.
  result.shadowGate = await page.evaluate(() => {
    const svc = window.SF.registry && window.SF.registry.get('render');
    const r = window.SF.state.render.renderer;
    return {
      hasSvc: !!svc,
      activeShadowCamera: !!(svc && svc._activeShadowCamera),
      shadowReceiverCount: svc ? svc._shadowReceiverCount : null,
      mapEnabled: r?.shadowMap?.enabled,
      lightAutoUpdate: svc && svc._keyLight ? svc._keyLight.shadow?.autoUpdate : null,
    };
  });

  const sample = (label, ms) => page.evaluate(async ([label, ms]) => {
    const st = window.SF.state;
    const svc = window.SF.registry.get('render');
    const r = st.render.renderer;
    const shadow = svc._keyLight.shadow;
    let needsUpdateSets = 0;
    let refreshFrames = 0;
    let frames = 0;
    let matrixUploadFrames = 0;
    let shadowUploadFrames = 0;
    let dirtyFlagFrames = 0;
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(shadow), 'needsUpdate')
      || Object.getOwnPropertyDescriptor(shadow, 'needsUpdate');
    let needsVal = shadow.needsUpdate;
    Object.defineProperty(shadow, 'needsUpdate', {
      configurable: true,
      get() { return needsVal; },
      set(v) { if (v === true) needsUpdateSets++; needsVal = v; },
    });
    // Count every `_shadowMapDirty = true` write — the dirty flag is consumed inside
    // the render pass, so RAF sampling misses it; the setter sees every write.
    let dirtyWrites = 0;
    let dirtyVal = svc._shadowMapDirty;
    Object.defineProperty(svc, '_shadowMapDirty', {
      configurable: true,
      get() { return dirtyVal; },
      set(v) { if (v === true) dirtyWrites++; dirtyVal = v; },
    });
    const t0 = performance.now();
    await new Promise((resolve) => {
      let setsAtFrameStart = 0;
      function tick() {
        frames++;
        if (needsUpdateSets > setsAtFrameStart) refreshFrames++;
        setsAtFrameStart = needsUpdateSets;
        if (svc._shadowMapDirty) dirtyFlagFrames++;
        const ps = st.render.asteroidInstancePool;
        if (ps) {
          if (ps.matrixUploads > 0) matrixUploadFrames++;
          if ((ps.shadowMatrixUploads || 0) > 0) shadowUploadFrames++;
        }
        if (performance.now() - t0 < ms) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });
    if (desc && desc.set) Object.defineProperty(shadow, 'needsUpdate', desc);
    else Object.defineProperty(shadow, 'needsUpdate', { configurable: true, writable: true, value: needsVal });
    Object.defineProperty(svc, '_shadowMapDirty', { configurable: true, writable: true, value: dirtyVal });
    const secs = (performance.now() - t0) / 1000;
    return { label, seconds: +secs.toFixed(2), frames,
      fps: +(frames / secs).toFixed(1),
      needsUpdateSets, refreshFrames,
      refreshPerSec: +(refreshFrames / secs).toFixed(1),
      refreshFrameFraction: +(refreshFrames / frames).toFixed(3),
      dirtyFlagFrames, dirtyWrites,
      dirtyWritesPerSec: +(dirtyWrites / secs).toFixed(1),
      matrixUploadFrames, shadowUploadFrames,
      activeShadowCamera: !!svc._activeShadowCamera,
      shadowReceiverCount: svc._shadowReceiverCount,
      renderFrames: r.info.render.frame };
  }, [label, ms]);

  result.phases.edgeOnly = await sample('edgeOnly', 8000);

  // Phase B: drop a rock inside the ortho — in-ortho motion must still refresh the map.
  await page.evaluate(() => {
    const o = window.__abOrigin;
    window.SF.bus.emit('entity:spawnRequest', { spec: window.__ROCK_SPEC(o.x + 60, o.z) });
  });
  await page.waitForFunction(
    (prev) => (window.SF.state.render?.asteroidInstancePool?.registered || 0) > prev,
    result.setup.pool?.registered || 0, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
  result.phases.inOrthoMotion = await sample('inOrthoMotion', 6000);
} finally {
  await browser.close();
  child.kill();
}

console.log(JSON.stringify(result, null, 2));
if (OUT) writeFileSync(OUT, JSON.stringify(result, null, 2));
