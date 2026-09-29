#!/usr/bin/env node
// Overdraw / depth-complexity probe — measures how many opaque fragment layers the real
// frame rasterizes per pixel at a given camera pose, in the engine's real draw order:
// WebGLRenderer.projectObject traversal order (opaqueSort is disabled — see
// src/render/renderer.js setOpaqueSort(() => 0)).
//
// Method (fragment coverage, API-semantic — exact on any conforming rasterizer incl.
// SwiftShader; timings are NOT read off this box):
//   pass "complexity": every opaque candidate drawn with depth test OFF, +1/255 red per
//     fragment → per-pixel geometric layer count (depth complexity D).
//   pass "shaded": same list drawn with depth test ON in the real sorted order → count
//     of fragments that PASS the depth test = fragments early-Z could not reject because
//     they were rasterized before a nearer occluder landed. Per-pixel value minus 1 is
//     the wasted-shading estimate W (shaded-then-overwritten layers).
//   pass "prepass-sim": all opaque geometry drawn once depth-only first, then the shaded
//     pass with EQUAL → the layer count a full depth prepass would leave (≈1 + proxy
//     misses); used for the A/B only, not for the gate.
//   Existing spacefaceDepthPrepass meshes write depth in every pass but never count
//   fragments — they cost ~nothing to shade in the real frame too.
//
// Usage:
//   node scripts/probe-overdraw.mjs [--headful] [--out=.devshots/overdraw/probe.json]
//   node scripts/probe-overdraw.mjs --list      # only enumerate probe targets, no GL work
import { createServer, get as httpRequestGet } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'overdraw');
const PORT = Number(process.env.SPACEFACE_PORT || 8123);
const HEADFUL = process.argv.includes('--headful');
const LIST_ONLY = process.argv.includes('--list');
const OUT_ARG = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1];
const TIMEOUT_MS = 40_000;
const PROBE_W = 320;
const PROBE_H = 180;
const SETTLE_MS = 900;

async function isServerRunning(port) {
  return new Promise((resolve) => {
    const req = httpRequestGet(`http://127.0.0.1:${port}/`, (res) => resolve(res.statusCode < 500));
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
  });
}

async function ensureLocalServer() {
  if (await isServerRunning(PORT)) {
    console.log(`[probe-overdraw] Using existing server on port ${PORT}`);
    return null;
  }
  console.log(`[probe-overdraw] Starting local server on port ${PORT}...`);
  const srv = spawn('node', ['server.js', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isServerRunning(PORT)) return srv;
  }
  throw new Error(`Server failed to start on port ${PORT}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const serverProcess = await ensureLocalServer();
  let browser = null;
  try {
    const { chromium } = await loadPlaywright(ROOT);
    browser = await chromium.launch({
      headless: !HEADFUL,
      args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    // TEST-ONLY workaround for an upstream boot blocker: master's elementaryVoices.js
    // statically imports bare '@elemaudio/core' which index.html's importmap does not
    // map (its real dist also needs unmapped CJS deps). SF_OVERDRAW_ELEMAUDIO_STUB=<path>
    // injects an importmap entry pointing at a stub module so the graph boots.
    const elemaudioStub = process.env.SF_OVERDRAW_ELEMAUDIO_STUB;
    if (elemaudioStub) {
      await page.route('**/*', async (route) => {
        if (route.request().resourceType() !== 'document') return route.continue();
        const res = await route.fetch();
        let body = await res.text();
        body = body.replace(
          '"@elemaudio/web-renderer":',
          `"@elemaudio/core": "${elemaudioStub}",\n      "@elemaudio/web-renderer":`,
        );
        await route.fulfill({ response: res, body });
      });
      console.log(`[probe-overdraw] elemaudio importmap stub: ${elemaudioStub}`);
    }
    page.on('console', (msg) => {
      const txt = msg.text();
      if (txt.includes('[overdraw]') || txt.includes('[SpaceFace]')) console.log(`[browser] ${txt}`);
    });
    page.on('pageerror', (err) => console.log(`[browser:pageerror] ${err.message}`));

    const targetUrl = `http://127.0.0.1:${PORT}/?perfmonitor=1&seed=47`;
    console.log(`[probe-overdraw] Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    await page.waitForSelector('#gl-canvas', { timeout: 15_000 });
    await page.waitForFunction(() => window.SF && window.SF.state, null, { timeout: 20_000 });
    await page.evaluate(() => {
      if (window.SF.bus && typeof window.SF.bus.emit === 'function') window.SF.bus.emit('game:new', { seed: 47 });
    });
    await page.waitForFunction(
      () => window.SF.state && (window.SF.state.mode === 'flight' || window.SF.state.mode === 'gameover'),
      null, { timeout: 300_000, polling: 500 },
    );
    const mode = await page.evaluate(() => window.SF.state.mode);
    if (mode !== 'flight') throw new Error(`New game did not reach flight (mode=${mode})`);
    console.log('[probe-overdraw] In flight. Installing probe...');
    if (process.env.SF_OVERDRAW_NO_PREPASS === '1') {
      await page.evaluate(() => { window.__SF_OVERDRAW_NO_PREPASS = true; });
      console.log('[probe-overdraw] A/B control: depth-prepass meshes excluded from measurement');
    }
    await page.evaluate(IN_PAGE_PROBE);

    const targets = await page.evaluate(() => {
      const state = window.SF.state;
      const player = state.entities.get(state.playerId);
      const out = [];
      for (const e of state.entityList || []) {
        if (!e || e.alive === false || !e.pos) continue;
        const d = e.data || {};
        const isStation = e.type === 'station';
        const isSiteRoot = d.role === 'world_site_root';
        if (!isStation && !isSiteRoot) continue;
        const radius = Number(d.placeRadius || e.radius || 0) || (isStation ? 220 : 0);
        const dx = e.pos.x - player.pos.x;
        const dz = e.pos.z - player.pos.z;
        out.push({
          id: e.id, kind: isStation ? 'station' : 'world_site_root',
          name: d.stationId || d.worldSiteId || e.id,
          x: e.pos.x, z: e.pos.z, radius,
          dist: Math.round(Math.hypot(dx, dz)),
        });
      }
      out.sort((a, b) => (a.dist - a.radius) - (b.dist - b.radius));
      return { player: { x: player.pos.x, z: player.pos.z }, targets: out.slice(0, 12) };
    });
    console.log(JSON.stringify(targets, null, 1));
    if (LIST_ONLY) return;

    // Teleport once per target (closest pose first so authored assets stream in),
    // wait for that entity's authoredAssetState to settle (SwiftShader is slow —
    // bounded wait, status recorded either way), then measure both poses.
    const results = [];
    const poses = [
      { name: 'approach', offsetK: 1.2, offsetA: 0.75, zoom: 200 },
      { name: 'inside', offsetK: 0.3, offsetA: 0.6, zoom: 330 },
    ];
    const chosen = targets.targets.slice(0, 4);
    for (const t of chosen) {
      const settle = await page.evaluate(async ({ t, timeoutMs }) => {
        const state = window.SF.state;
        const player = state.entities.get(state.playerId);
        const entity = (state.entityList || []).find((e) => e && e.id === t.id);
        const put = (offsetK, angle, zoom) => {
          const offset = t.radius * offsetK;
          const x = t.x - Math.cos(angle) * offset;
          const z = t.z - Math.sin(angle) * offset;
          if (typeof player.pos.set === 'function') player.pos.set(x, 0, z);
          else { player.pos.x = x; player.pos.z = z; }
          player.prevPos?.copy?.(player.pos);
          if (player.vel?.set) player.vel.set(0, 0, 0);
          else { player.vel.x = 0; player.vel.z = 0; }
          player.rot = 0; player.prevRot = 0;
          player.flags = { ...(player.flags || {}), noInterp: true };
          state.camera.zoom = zoom;
          window.SF.bus.emit('camera:zoom', { level: zoom });
          state.render?.cameraCtrl?.snapToPlayer?.();
        };
        const authoredState = (e) => (e && e.mesh && e.mesh.userData
          ? e.mesh.userData.authoredAssetState : 'missing');
        const TERMINAL = new Set(['authored', 'authored-with-cleanup-error', 'authored-prepared',
          'same-semantic-fallback', 'same-semantic-fallback-prepared', 'shell-ready',
          'unavailable', 'procedural-settled', 'fallback-after-error',
          'cancelled-before-load', 'orphaned-before-swap', 'orphaned-after-pipeline-compile']);
        // First park inside the site so the admission pump wants it authored.
        put(0.3, 0.6, 330);
        const start = Date.now();
        let status = authoredState(entity);
        let meshCount = 0;
        while (Date.now() - start < timeoutMs) {
          await new Promise((res) => setTimeout(res, 1500));
          status = authoredState(entity);
          meshCount = 0;
          entity?.mesh?.traverse?.((o) => { if (o.isMesh) meshCount++; });
          if (TERMINAL.has(status) && meshCount > 0) break;
        }
        return { status, meshCount, waitedMs: Date.now() - start };
      }, { t, timeoutMs: 240_000 });
      console.log(`[probe-overdraw] ${t.name}: authored=${settle.status} calls=${settle.calls} waited=${settle.waitedMs}ms`);

      for (const pose of poses) {
        const r = await page.evaluate(async ({ t, pose }) => {
          const state = window.SF.state;
          const player = state.entities.get(state.playerId);
          const offset = t.radius * pose.offsetK;
          const x = t.x - Math.cos(pose.offsetA) * offset;
          const z = t.z - Math.sin(pose.offsetA) * offset;
          if (typeof player.pos.set === 'function') player.pos.set(x, 0, z);
          else { player.pos.x = x; player.pos.z = z; }
          player.prevPos?.copy?.(player.pos);
          if (player.vel?.set) player.vel.set(0, 0, 0);
          else { player.vel.x = 0; player.vel.z = 0; }
          player.rot = 0; player.prevRot = 0;
          player.flags = { ...(player.flags || {}), noInterp: true };
          state.camera.zoom = pose.zoom;
          window.SF.bus.emit('camera:zoom', { level: pose.zoom });
          state.render?.cameraCtrl?.snapToPlayer?.();
          await new Promise((res) => setTimeout(res, 1200));
          await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
          return { x, z, zoom: pose.zoom };
        }, { t, pose });
        const measured = await page.evaluate(async ({ probeW, probeH }) => {
          return window.__sfOverdrawProbe(probeW, probeH);
        }, { probeW: PROBE_W, probeH: PROBE_H });
        results.push({ target: t, pose: pose.name, at: r, settle, measured });
        console.log(`[probe-overdraw] ${t.name} ${pose.name}: ` +
          `coverage=${measured.coverage?.toFixed(3)} D=${measured.meanLayersCovered?.toFixed(2)} ` +
          `S=${measured.meanShadedCovered?.toFixed(2)} W=${measured.meanWasteCovered?.toFixed(2)} ` +
          `Spre=${measured.meanShadedCoveredPrepass?.toFixed(2)} ` +
          `items=${measured.items} tris=${measured.realFrame?.triangles} calls=${measured.realFrame?.calls}`);
      }
    }

    const out = {
      schema: 'spaceface.overdrawProbe.v1',
      generatedAt: new Date().toISOString(),
      probeResolution: [PROBE_W, PROBE_H],
      note: 'layer counts are API-semantic (exact on any conforming rasterizer); no timings read here',
      targets,
      results,
    };
    const outPath = OUT_ARG ? path.resolve(OUT_ARG) : path.join(OUT_DIR, `overdraw-${Date.now()}.json`);
    await writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
    console.log(`[probe-overdraw] wrote ${outPath}`);
  } finally {
    if (browser) await browser.close();
    if (serverProcess) serverProcess.kill();
  }
}

main().catch((err) => { console.error('[probe-overdraw] failed:', err); process.exit(1); });

// ---------------------------------------------------------------------------
// Injected into the page. Builds the opaque render list exactly like
// WebGLRenderer.projectObject does in this build: the engine installs
// `renderer.setOpaqueSort(() => 0)` (src/render/renderer.js) so opaque draw
// order IS scene-traversal order — renderOrder and material-id sorting are
// dead config. The probe therefore keeps the walk's encounter order (frustum
// culling by world bounding sphere, per-material-group items), then rasterizes
// the list into a small RGBA8 target with +1/255 additive writes so the red
// channel IS the per-pixel layer count. Four sweeps: no-depth (D), real-order
// depth-tested (S — fragments that pass = layers early-Z cannot reject), full
// depth prewrite then depth-tested (S_pre — the prepass floor), and an A-only
// sanity pass. Per-pixel stats are returned, no timing data.
const IN_PAGE_PROBE = () => {
  window.__sfOverdrawProbe = function __sfOverdrawProbe(probeW, probeH) {
    const THREE = window.SF.THREE;
    const state = window.SF.state;
    const scene = state.render.scene;
    const renderer = state.render.renderer;
    const camera = state.render.camera;
    if (!scene || !renderer || !camera) return { error: 'render handles unavailable' };

    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    const projScreen = new THREE.Matrix4()
      .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const frustum = new THREE.Frustum().setFromProjectionMatrix(projScreen);
    const sphere = new THREE.Sphere();
    const v = new THREE.Vector3();

    const items = [];
    const skipped = { transparent: 0, nonMesh: 0, culled: 0, layerHidden: 0 };
    const walk = (o) => {
      if (!o.visible) return;
      const isDrawable = o.isMesh || o.isSkinnedMesh || o.isInstancedMesh;
      if (isDrawable && o.layers.test(camera.layers)) {
        const g = o.geometry;
        if (g) {
          const depthOnly = o.userData && o.userData.spacefaceDepthPrepass === true;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          const allOpaque = mats.every((m) => m && m.transparent !== true && m.visible !== false);
          if (allOpaque || depthOnly) {
            let inFrustum = true;
            if (o.frustumCulled) {
              // InstancedMesh culls against its instance-aware boundingSphere in three.
              const bs = o.isInstancedMesh && o.boundingSphere ? o.boundingSphere
                : (g.boundingSphere || g.computeBoundingSphere(), g.boundingSphere);
              sphere.copy(bs).applyMatrix4(o.matrixWorld);
              inFrustum = frustum.intersectsSphere(sphere);
            }
            if (inFrustum) {
              v.setFromMatrixPosition(o.matrixWorld).applyMatrix4(projScreen);
              const groups = Array.isArray(o.material) && Array.isArray(g.groups) && g.groups.length > 0
                ? g.groups : [null];
              for (const gr of groups) {
                const mat = gr ? mats[gr.materialIndex || 0] : mats[0];
                if (!mat || mat.transparent === true || mat.visible === false) continue;
                items.push({ object: o, geometry: g, group: gr, material: mat, z: v.z, depthOnly });
              }
            } else skipped.culled++;
          } else skipped.transparent++;
        } else skipped.nonMesh++;
      } else if (isDrawable) skipped.layerHidden++;
      for (const child of o.children) walk(child);
    };
    walk(scene);

    // No sort: opaqueSort is disabled engine-wide, so traversal order is the
    // real draw order — prepass siblings prepended at index 0 land here first,
    // exactly like the live render.
    // A/B counterfactual: with __SF_OVERDRAW_NO_PREPASS the prepass meshes are
    // dropped entirely — equivalent to measuring the same tree unpatched.
    if (window.__SF_OVERDRAW_NO_PREPASS === true) {
      for (let i = items.length - 1; i >= 0; i--) if (items[i].depthOnly) items.splice(i, 1);
    }

    const unit = 1 / 255;
    const mkCount = (depthTest, depthWrite, depthFunc) => {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(unit, 0, 0) });
      m.depthTest = depthTest;
      m.depthWrite = depthWrite;
      m.depthFunc = depthFunc;
      m.blending = THREE.CustomBlending;
      m.blendEquation = THREE.AddEquation;
      m.blendSrc = THREE.OneFactor;
      m.blendDst = THREE.OneFactor;
      m.transparent = false;
      m.toneMapped = false;
      m.fog = false;
      m.name = 'SF_overdraw_count';
      return m;
    };
    const countNoDepth = mkCount(false, false, THREE.AlwaysDepth);
    const countDepth = mkCount(true, true, THREE.LessEqualDepth);
    const depthOnlyMat = new THREE.MeshBasicMaterial({ colorWrite: false });
    depthOnlyMat.name = 'SF_overdraw_depthonly';

    const rt = new THREE.WebGLRenderTarget(probeW, probeH, {
      depthBuffer: true, stencilBuffer: false,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    });
    const prevTarget = renderer.getRenderTarget();
    const prevColor = new THREE.Color();
    renderer.getClearColor(prevColor);
    const prevAlpha = renderer.getClearAlpha();
    const prevAutoClear = renderer.autoClear;
    const prevInfoReset = renderer.info.autoReset;
    renderer.info.autoReset = false;
    renderer.autoClear = false;

    const geoCache = new Map();
    const groupGeometryFor = (it) => {
      if (!it.group) return it.geometry;
      let sub = geoCache.get(it);
      if (sub) return sub;
      const g = it.geometry;
      sub = new THREE.BufferGeometry();
      for (const name of Object.keys(g.attributes)) sub.setAttribute(name, g.attributes[name]);
      if (g.index) {
        sub.setIndex(new THREE.BufferAttribute(
          g.index.array.slice(it.group.start, it.group.start + it.group.count), g.index.itemSize));
      } else {
        sub.setDrawRange(it.group.start, it.group.count);
      }
      sub.boundingSphere = g.boundingSphere;
      geoCache.set(it, sub);
      return sub;
    };

    const probeScene = new THREE.Scene();
    const buildScene = (materialFor) => {
      while (probeScene.children.length) probeScene.remove(probeScene.children[0]);
      items.forEach((it, i) => {
        const mat = materialFor(it);
        const geo = groupGeometryFor(it);
        let m;
        if (it.object.isInstancedMesh) {
          m = new THREE.InstancedMesh(geo, mat, it.object.count);
          m.instanceMatrix = it.object.instanceMatrix;
          if (it.object.instanceColor) m.instanceColor = it.object.instanceColor;
        } else if (it.object.isSkinnedMesh) {
          m = new THREE.SkinnedMesh(geo, mat);
          m.bind(it.object.skeleton, it.object.bindMatrix);
          m.bindMode = it.object.bindMode;
        } else {
          m = new THREE.Mesh(geo, mat);
        }
        m.matrixAutoUpdate = false;
        m.matrix.copy(it.object.matrixWorld);
        m.matrixWorld.copy(it.object.matrixWorld);
        m.renderOrder = i;
        m.frustumCulled = false;
        probeScene.add(m);
      });
    };

    const renderAndCount = (clear = true) => {
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      if (clear) renderer.clear();
      renderer.render(probeScene, camera);
      const buf = new Uint8Array(probeW * probeH * 4);
      renderer.readRenderTargetPixels(rt, 0, 0, probeW, probeH, buf);
      return buf;
    };

    const statsFrom = (buf) => {
      const n = probeW * probeH;
      let covered = 0, sum = 0, max = 0;
      const hist = new Map();
      for (let p = 0; p < n; p++) {
        const r = buf[p * 4];
        if (r > 0) { covered++; sum += r; if (r > max) max = r; hist.set(r, (hist.get(r) || 0) + 1); }
      }
      const sorted = [...hist.keys()].sort((a, b) => a - b);
      const pct = (q) => {
        let acc = 0;
        for (const k of sorted) { acc += hist.get(k); if (acc >= covered * q) return k; }
        return 0;
      };
      return {
        pixels: n, covered, coverage: covered / n,
        meanLayersCovered: covered ? sum / covered : 0,
        meanLayersAll: sum / n,
        p50: pct(0.5), p95: pct(0.95), max,
        totalFragments: sum,
      };
    };

    const realInfo = {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      points: renderer.info.render.points,
      lines: renderer.info.render.lines,
      geometries: renderer.info.memory.geometries,
      programs: renderer.info.programs ? renderer.info.programs.length : null,
    };

    let result;
    try {
      // pass D — geometric depth complexity (no depth test)
      buildScene((it) => (it.depthOnly ? depthOnlyMat : countNoDepth));
      const dBuf = renderAndCount();
      // pass S — real-order depth-tested shaded layers
      buildScene((it) => (it.depthOnly ? depthOnlyMat : countDepth));
      const sBuf = renderAndCount();
      // pass S_pre — full depth prewrite (clear once), then real-order depth-tested count
      // layered into the same target WITHOUT a second clear.
      buildScene(() => depthOnlyMat);
      renderAndCount(true);
      buildScene((it) => (it.depthOnly ? depthOnlyMat : countDepth));
      const preBuf = renderAndCount(false);

      const D = statsFrom(dBuf);
      const S = statsFrom(sBuf);
      const PRE = statsFrom(preBuf);
      result = {
        items: items.length,
        itemsDepthOnly: items.filter((i) => i.depthOnly).length,
        skipped,
        coverage: S.coverage,
        meanLayersCovered: D.meanLayersCovered,
        meanLayersAllPx: D.meanLayersAll,
        layersP95: D.p95, layersMax: D.max,
        meanShadedCovered: S.meanLayersCovered,
        meanShadedAllPx: S.meanLayersAll,
        shadedP95: S.p95,
        meanWasteCovered: Math.max(0, S.meanLayersCovered - 1),
        meanWasteAllPx: Math.max(0, S.meanLayersAll - S.coverage),
        totalShadedFragments: S.totalFragments,
        meanShadedCoveredPrepass: PRE.meanLayersCovered,
        meanWasteCoveredPrepass: Math.max(0, PRE.meanLayersCovered - 1),
        totalShadedFragmentsPrepass: PRE.totalFragments,
        realFrame: realInfo,
      };
    } finally {
      renderer.setRenderTarget(prevTarget);
      renderer.setClearColor(prevColor, prevAlpha);
      renderer.autoClear = prevAutoClear;
      renderer.info.autoReset = prevInfoReset;
      rt.dispose();
      for (const g of geoCache.values()) g.dispose();
      countNoDepth.dispose(); countDepth.dispose(); depthOnlyMat.dispose();
    }
    return result;
  };
};

