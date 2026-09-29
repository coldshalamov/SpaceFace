#!/usr/bin/env node
// W4 lane probe: transparent-pass sort cost + overdraw census on the live flight route.
//
//   node scripts/probe-transparent-sort.mjs [--duration=45] [--headful]
//
// In-page instrumentation (all install-on-enable, removed on exit):
//   1. renderer.setTransparentSort(replica of three r184 reversePainterSortStable)
//      + an Array.prototype.sort tap that fires only for that comparator —
//      exact transparent/transmissive list length, comparator invocations, and
//      wall time of the sort per render pass.
//   2. renderer.renderBufferDirect wrapper — per-draw material census
//      (transparent / transmissive / opaque split), draw calls and triangles per
//      list (delta of renderer.info.render across the call, which three updates
//      inside renderBufferDirect), and a bounding-disc screen-coverage estimate
//      (overdraw proxy) per transparent draw.
//   3. renderer.setRenderTarget tap — catches the three.js transmission pass:
//      it renders the whole opaque list a second time into a forced-MSAA
//      (samples=max(4,caps.samples)) render target at transmissionResolutionScale.
//   4. renderer.render wrapper — buckets (1)-(3) per render invocation and tags
//      the main-scene pass (state.render.scene) vs post/quad scenes.
//
// Output: .devshots/transparent-sort/<stamp>.json + console summary.
// Counting instrumentation only — writes nothing back into the game.

import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer, get as httpRequestGet } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'transparent-sort');
const PORT = Number(process.env.SPACEFACE_PORT || 8124);
const HEADFUL = process.argv.includes('--headful');
const DURATION_S = Number(process.argv.find((a) => a.startsWith('--duration='))?.split('=')[1] || 45);
const TIMEOUT_MS = 45_000;

function httpGet(url, cb) { return httpRequestGet(url, cb); }

async function isServerRunning(port) {
  return new Promise((resolve) => {
    const req = httpGet(`http://127.0.0.1:${port}/`, (res) => resolve(res.statusCode < 500));
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
  });
}

async function ensureLocalServer() {
  if (await isServerRunning(PORT)) {
    console.log(`[probe] Using existing server on port ${PORT}`);
    return null;
  }
  console.log(`[probe] Starting local server on port ${PORT}...`);
  const srv = spawn('node', ['server.js', String(PORT)], { cwd: ROOT, stdio: 'ignore', detached: false });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isServerRunning(PORT)) { console.log('[probe] Server is up.'); return srv; }
  }
  throw new Error(`Server failed to start on port ${PORT}`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const serverProcess = await ensureLocalServer();
  let browser = null;
  try {
    const { chromium } = await loadPlaywright();
    console.log(`[probe] Launching Chromium (${HEADFUL ? 'headed' : 'headless'})...`);
    browser = await chromium.launch({
      headless: !HEADFUL,
      args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--no-sandbox', '--disable-setuid-sandbox'],
    });
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('console', (msg) => {
      const t = msg.text();
      if (t.includes('[SpaceFace]') || t.includes('[taudit]')) console.log(`[browser] ${t}`);
    });
    page.on('pageerror', (err) => console.log(`[browser:pageerror] ${err.message}`));

    const targetUrl = `http://127.0.0.1:${PORT}/?perfmonitor=1&seed=47`;
    console.log(`[probe] Navigating to ${targetUrl}...`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });
    await page.waitForSelector('#gl-canvas', { timeout: 15_000 });
    await page.waitForFunction(() => window.SF && window.SF.state, null, { timeout: 30_000 });

    await page.evaluate(() => {
      if (window.SF.bus && typeof window.SF.bus.emit === 'function') window.SF.bus.emit('game:new', { seed: 47 });
    });
    await page.waitForFunction(
      () => window.SF.state && (window.SF.state.mode === 'flight' || window.SF.state.mode === 'gameover'),
      null, { timeout: 240_000, polling: 500 },
    );
    const mode = await page.evaluate(() => window.SF.state.mode);
    if (mode !== 'flight') throw new Error(`New game did not reach flight (mode=${mode})`);
    console.log('[probe] Flight reached; installing transparent-pass audit...');

    await page.evaluate(() => {
      const SF = window.SF;
      const THREE = SF.THREE;
      const renderer = SF.state.render.renderer;
      const mainScene = SF.state.render.scene;
      const info = renderer.info;
      if (!renderer || !mainScene) throw new Error('renderer/scene not published on state.render');

      const BLEND = { 0: 'none', 1: 'normal', 2: 'additive', 3: 'subtractive', 4: 'multiply', 5: 'custom' };
      const SIDE = { 0: 'front', 1: 'back', 2: 'double' };

      const audit = {
        host: navigator.userAgent,
        startedAt: new Date().toISOString(),
        renderCalls: [],          // one record per renderer.render() invocation
        sortRuns: [],             // one record per transparent/transmissive Array.sort
        materials: {},            // material.uuid -> census
        objects: {},              // object.uuid -> tally (transparent/transmissive draws only)
        setRenderTargetSeq: [],   // per-frame RT switch ids (first 64)
        maxConcurrentRenderItemsNote: 'three r184 reversePainterSortStable replica installed via setTransparentSort',
      };
      window.__sfTAudit = audit;

      let renderDepth = 0;
      let curRender = null;       // current render() invocation record
      let frameId = 0;
      let sawMainThisFrame = false;
      let rtIds = null;           // Map<rt,id> per frame
      let curRT = null;           // current render target id

      // ---- (1) transparent/transmissive sort tap -------------------------------------
      let cmpCount = 0;
      const transparentCmp = (a, b) => {
        cmpCount++;
        if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
        if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
        if (a.z !== b.z) return b.z - a.z;
        return a.id - b.id;
      };
      renderer.setTransparentSort(transparentCmp);
      const origSort = Array.prototype.sort;
      Array.prototype.sort = function sfSortTap(cmp) {
        if (cmp === transparentCmp) {
          cmpCount = 0;
          const t0 = performance.now();
          const r = origSort.call(this, cmp);
          const rec = {
            frame: frameId,
            n: this.length,
            cmps: cmpCount,
            ms: performance.now() - t0,
            transmissive: !!(this[0] && this[0].material && Number(this[0].material.transmission) > 0),
          };
          audit.sortRuns.push(rec);
          if (curRender) curRender.sortRuns.push(rec);
          return r;
        }
        return origSort.call(this, cmp);
      };

      // ---- (3) render-target switches -------------------------------------------------
      const origSetRT = renderer.setRenderTarget;
      let nextRtId = 1;
      const rtIdOf = new Map();   // WeakMap-ish via Map on object identity
      renderer.setRenderTarget = function sfSetRT(rt, activeCubeFace, activeMipmapLevel) {
        if (rtIds) {
          let id = rtIdOf.get(rt || 'canvas');
          if (id === undefined) {
            id = nextRtId++;
            rtIdOf.set(rt || 'canvas', id);
            if (rt && typeof rt === 'object') {
              audit['rtMeta:' + id] = {
                w: rt.width, h: rt.height, samples: rt.samples,
                mipmaps: !!(rt.texture && rt.texture.generateMipmaps),
              };
            }
          }
          curRT = id;
          if (audit.setRenderTargetSeq.length < 512) audit.setRenderTargetSeq.push({ frame: frameId, rt: id });
        }
        return origSetRT.call(this, rt, activeCubeFace, activeMipmapLevel);
      };

      // ---- (2) per-draw census ---------------------------------------------------------
      const _center = new THREE.Vector3();
      const _view = new THREE.Vector3();
      const coverageOf = (object, camera, geometry) => {
        try {
          if (!geometry || typeof geometry.computeBoundingSphere !== 'function') return 0;
          if (!geometry.boundingSphere) geometry.computeBoundingSphere();
          const bs = geometry.boundingSphere;
          if (!bs || !Number.isFinite(bs.radius)) return 0;
          const me = object.matrixWorld && object.matrixWorld.elements;
          if (!me) return 0;
          const sx = Math.hypot(me[0], me[4], me[8]);
          const sy = Math.hypot(me[1], me[5], me[9]);
          const sz = Math.hypot(me[2], me[6], me[10]);
          const r = bs.radius * Math.max(sx, sy, sz);
          _center.copy(bs.center).applyMatrix4(object.matrixWorld);
          if (!camera || !camera.isCamera || !camera.projectionMatrix) return 0;
          _view.copy(_center).applyMatrix4(camera.matrixWorldInverse);
          let frac = 0;
          if (camera.isPerspectiveCamera) {
            const dist = -_view.z;
            if (!(dist > 0)) return 0;
            const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5);
            const rNdc = r / (dist * tanHalf);
            frac = (Math.PI * rNdc * rNdc) / 4;          // NDC box area is 2x2=4
          } else {
            const w = camera.right - camera.left, h = camera.top - camera.bottom;
            frac = (Math.PI * r * r) / Math.max(1e-9, w * h);
          }
          return Math.max(0, Math.min(1, frac));
        } catch (_) { return 0; }
      };

      const censusMaterial = (material, bucket, objectName, tris, coverage) => {
        const key = material.uuid;
        let m = audit.materials[key];
        if (!m) {
          m = audit.materials[key] = {
            uuid: key, name: material.name || '', type: material.type,
            blending: BLEND[material.blending] || String(material.blending),
            transparent: material.transparent === true,
            transmission: Number(material.transmission) || 0,
            alphaTest: Number(material.alphaTest) || 0,
            alphaToCoverage: material.alphaToCoverage === true,
            opacity: Number.isFinite(material.opacity) ? material.opacity : null,
            depthWrite: material.depthWrite, depthTest: material.depthTest !== false,
            side: SIDE[material.side] || String(material.side),
            hasMap: !!material.map, vertexColors: material.vertexColors === true,
            buckets: {}, objects: new Set(), draws: 0, tris: 0, coverageSum: 0,
          };
        }
        m.buckets[bucket] = (m.buckets[bucket] || 0) + 1;
        m.objects.add(objectName);
        m.draws += 1; m.tris += tris; m.coverageSum += coverage;
        return m;
      };

      const tallyObject = (object, bucket, tris, coverage) => {
        const key = object.uuid;
        let o = audit.objects[key];
        if (!o) {
          const path = [];
          let p = object;
          while (p) { if (p.name) path.unshift(p.name); p = p.parent; }
          o = audit.objects[key] = {
            uuid: key, name: object.name || '(anon)', path: path.slice(-4).join('/'),
            type: object.type, instanced: !!object.isInstancedMesh, count: object.count || 1,
            draws: 0, tris: 0, coverageSum: 0, buckets: {},
          };
        }
        o.draws += 1; o.tris += tris; o.coverageSum += coverage;
        o.buckets[bucket] = (o.buckets[bucket] || 0) + 1;
      };

      const origRBD = renderer.renderBufferDirect;
      renderer.renderBufferDirect = function sfRBD(camera, scene, geometry, material, object, group) {
        const tri0 = info.render.triangles;
        const call0 = info.render.calls;
        const r = origRBD.call(this, camera, scene, geometry, material, object, group);
        const tris = info.render.triangles - tri0;
        const calls = Math.max(0, info.render.calls - call0);
        if (!curRender) return r;

        const transmissive = Number(material.transmission) > 0;
        const bucket = transmissive ? 'transmissive' : (material.transparent === true ? 'transparent' : 'opaque');
        const rec = curRender;
        rec.draws += calls; rec.tris += tris;
        rec[`${bucket}Draws`] += calls; rec[`${bucket}Tris`] += tris;

        // Opaque items re-drawn inside the same render invocation = transmission pass re-draw.
        const key = `${object.id}:${material.id}:${group ? group.id || 0 : 0}`;
        if (bucket === 'opaque') {
          if (rec.opaqueSeen.has(key)) rec.transmissionPassRedraws += calls;
          rec.opaqueSeen.add(key);
        }

        if (bucket !== 'opaque') {
          const cov = rec.sceneTag === 'main' ? coverageOf(object, camera, geometry) : 0;
          rec.coverageSum += cov;
          censusMaterial(material, bucket, object.name || '(anon)', tris, cov);
          tallyObject(object, bucket, tris, cov);
          if (transmissive) rec.transmissiveItems += 1;
        }
        return r;
      };

      // ---- (4) render() bucketing -------------------------------------------------------
      const origRender = renderer.render;
      renderer.render = function sfRender(scene, camera) {
        if (renderDepth === 0 && scene === mainScene) { frameId += 1; sawMainThisFrame = true; rtIds = new Map(); }
        const isMain = scene === mainScene;
        renderDepth += 1;
        const rec = {
          frame: frameId, sceneTag: isMain ? 'main' : 'other',
          sceneName: scene && scene.name || (scene && scene.type) || 'scene',
          draws: 0, tris: 0, opaqueDraws: 0, transparentDraws: 0, transmissiveDraws: 0,
          opaqueTris: 0, transparentTris: 0, transmissiveTris: 0,
          transmissiveItems: 0, transmissionPassRedraws: 0, coverageSum: 0,
          opaqueSeen: new Set(), sortRuns: [],
          ms: 0,
        };
        const prev = curRender; curRender = rec;
        const t0 = performance.now();
        try { return origRender.call(this, scene, camera); }
        finally {
          rec.ms = performance.now() - t0;
          rec.rtIds = rtIds ? Array.from(rtIdOf.values()) : [];
          delete rec.opaqueSeen;
          audit.renderCalls.push(rec);
          renderDepth -= 1; curRender = prev;
          if (renderDepth === 0) { rtIds = null; curRT = null; }
        }
      };

      audit.uninstall = () => {
        renderer.setTransparentSort(null);
        Array.prototype.sort = origSort;
        renderer.setRenderTarget = origSetRT;
        renderer.renderBufferDirect = origRBD;
        renderer.render = origRender;
      };
      console.log('[taudit] instrumentation installed');
    });

    console.log(`[probe] Sampling ${DURATION_S}s of flight...`);
    await page.waitForTimeout(DURATION_S * 1000);

    const dump = await page.evaluate(() => {
      const a = window.__sfTAudit;
      if (a && typeof a.uninstall === 'function') a.uninstall();
      // Sets aren't JSON-serializable — flatten census object sets.
      const materials = Object.entries(a.materials).map(([k, m]) => ({
        ...m, objects: Array.from(m.objects),
      }));
      delete a.materials;
      return { ...a, materials };
    });

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outPath = path.join(OUT_DIR, `${stamp}.json`);
    writeFileSync(outPath, JSON.stringify(dump, null, 2));

    // ---- summary -----------------------------------------------------------------------
    const mainCalls = dump.renderCalls.filter((r) => r.sceneTag === 'main');
    const otherCalls = dump.renderCalls.filter((r) => r.sceneTag !== 'main');
    const sum = (arr, k) => arr.reduce((a, r) => a + (r[k] || 0), 0);
    const avg = (arr, k) => (arr.length ? sum(arr, k) / arr.length : 0);
    const p95 = (arr, k) => {
      if (!arr.length) return 0;
      const v = arr.map((r) => r[k] || 0).sort((x, y) => x - y);
      return v[Math.min(v.length - 1, Math.floor(v.length * 0.95))];
    };

    const transparentSorts = dump.sortRuns.filter((s) => !s.transmissive);
    const transmissiveSorts = dump.sortRuns.filter((s) => s.transmissive);

    console.log('\n=== Transparent-sort + A2C audit summary ===');
    console.log(`frames (main-scene renders): ${mainCalls.length}; other render() calls: ${otherCalls.length}`);
    console.log(`main pass: draws avg=${avg(mainCalls, 'draws').toFixed(1)} tris avg=${avg(mainCalls, 'tris').toFixed(0)} render.ms avg=${avg(mainCalls, 'ms').toFixed(2)} p95=${p95(mainCalls, 'ms').toFixed(2)}`);
    console.log(`  opaque      draws avg=${avg(mainCalls, 'opaqueDraws').toFixed(1)} tris avg=${avg(mainCalls, 'opaqueTris').toFixed(0)}`);
    console.log(`  transparent draws avg=${avg(mainCalls, 'transparentDraws').toFixed(1)} tris avg=${avg(mainCalls, 'transparentTris').toFixed(0)}`);
    console.log(`  transmissive draws avg=${avg(mainCalls, 'transmissiveDraws').toFixed(1)} items avg=${avg(mainCalls, 'transmissiveItems').toFixed(2)}`);
    console.log(`  transmission-pass opaque re-draws avg=${avg(mainCalls, 'transmissionPassRedraws').toFixed(1)}`);
    console.log(`  transparent coverage index (sum bounding-disc frac) avg=${avg(mainCalls, 'coverageSum').toFixed(3)} p95=${p95(mainCalls, 'coverageSum').toFixed(3)}`);
    console.log(`transparent sorts: ${transparentSorts.length} runs; items avg=${avg(transparentSorts, 'n').toFixed(1)} max=${Math.max(0, ...transparentSorts.map((s) => s.n))} cmps avg=${avg(transparentSorts, 'cmps').toFixed(0)} wall avg=${(avg(transparentSorts, 'ms') * 1000).toFixed(1)}us max=${(Math.max(0, ...transparentSorts.map((s) => s.ms)) * 1000).toFixed(1)}us`);
    if (transmissiveSorts.length) {
      console.log(`transmissive sorts: ${transmissiveSorts.length} runs; items avg=${avg(transmissiveSorts, 'n').toFixed(1)}`);
    }
    console.log(`distinct materials drawn: ${dump.materials.length} (transparent/transmissive only)`);
    const byCov = dump.materials.slice().sort((a, b) => b.coverageSum - a.coverageSum).slice(0, 12);
    console.log('top coverage materials:');
    for (const m of byCov) {
      console.log(`  cov=${m.coverageSum.toFixed(2)} draws=${m.draws} tris=${m.tris} ${m.blending} dw=${m.depthWrite} side=${m.side} aT=${m.alphaTest} trans=${m.transmission} "${m.name || m.type}" objects=${m.objects.length}`);
    }
    const rtMeta = Object.keys(dump).filter((k) => k.startsWith('rtMeta:'));
    if (rtMeta.length) {
      console.log('render targets seen:');
      for (const k of rtMeta) console.log(`  ${k}: ${JSON.stringify(dump[k])}`);
    }
    console.log(`\nraw dump: ${outPath}`);
  } finally {
    if (browser) await browser.close();
    if (serverProcess) serverProcess.kill();
  }
}

main().catch((err) => {
  console.error('[probe] failed:', err);
  process.exit(1);
});
