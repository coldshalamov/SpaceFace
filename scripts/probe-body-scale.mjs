// Body-scale witness: how many CSS pixels the player's own hull (and each hostile hull) occupies
// on the glass at the shipping camera, plus every zoom term that produced that distance.
//
//   node scripts/probe-body-scale.mjs                    (adventure, seed 47, 5s idle + 40s thrust)
//   node scripts/probe-body-scale.mjs --route=crucible   (swarm seed 4242, 30s fighting)
//   node scripts/probe-body-scale.mjs --headless
//
// Boot/route machinery mirrors probe-smooth-flight.mjs: same headed Chromium, same server
// isolation (SPACEFACE_PLAYER_STORE_DIR='' mounts nothing), same firstPlayableFrameAt gate.
// Sampling is wall-time (250 ms), so host load stretches the sample count, not the geometry —
// this probe measures projection, not frame pacing.
import { spawn } from 'node:child_process';
import { createServer as createNetServer } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { summarizeBodyScaleSamples } from './lib/bodyScaleStats.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const hit = args.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.slice(flag.length + 1) : fallback;
};
const ROUTE = argValue('--route', 'adventure');
const HEADLESS = args.includes('--headless');
const SEED = Number(argValue('--seed', ROUTE === 'crucible' ? 4242 : 47)) >>> 0;
const SAMPLE_MS = 250;
const OUT_DIR = path.join(ROOT, '.devshots', 'body-scale');
const { chromium } = await loadPlaywright();

function cpuSnapshot() {
  let idle = 0; let total = 0;
  for (const cpu of os.cpus()) {
    for (const v of Object.values(cpu.times)) total += v;
    idle += cpu.times.idle;
  }
  return { idle, total };
}
function hostBusyPct(a, b) {
  const total = b.total - a.total;
  return total > 0 ? 100 * (1 - (b.idle - a.idle) / total) : 0;
}
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}
async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`game server did not answer at ${url}`);
}

const port = await freePort();
const server = spawn(process.execPath, ['server.js', String(port)], {
  cwd: ROOT,
  stdio: 'ignore',
  env: { ...process.env, SPACEFACE_PLAYER_STORE_DIR: '', SPACEFACE_USER_CONTENT_DIR: '' },
});
let browser = null;
const consoleErrors = [];
const seenErrors = new Set();
try {
  const baseUrl = `http://127.0.0.1:${port}/`;
  await waitForServer(baseUrl);
  const cpuBefore = cpuSnapshot();
  browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--window-size=1920,1100',
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('console', (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return;
    const line = `[${msg.type()}] ${msg.text().slice(0, 300)}`;
    if (seenErrors.has(line.slice(0, 140))) return;
    seenErrors.add(line.slice(0, 140));
    consoleErrors.push(line);
  });
  page.on('pageerror', (e) => {
    const line = `[pageerror] ${String(e).slice(0, 300)}`;
    if (!seenErrors.has(line.slice(0, 140))) { seenErrors.add(line.slice(0, 140)); consoleErrors.push(line); }
  });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch { /* storage unavailable */ }
  });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 150_000 });

  if (ROUTE === 'crucible') {
    const launched = await page.evaluate(async (seed) => {
      const launch = await import('/src/ui/crucibleLaunch.js');
      const setup = launch.crucibleSetupFor({ seed });
      if (!setup || !setup.ok) return false;
      return launch.requestCrucibleRun(window.SF.bus, setup.value, setup.ruleset) !== false;
    }, SEED);
    if (!launched) throw new Error('Crucible run did not launch');
  } else {
    await page.evaluate((seed) => window.SF.bus.emit('game:new', { name: 'Body Scale', seed }), SEED);
  }
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    return state && state.mode === 'flight'
      && Number.isFinite(state.render && state.render.firstPlayableFrameAt);
  }, null, { timeout: 560_000 });
  await page.bringToFront();
  await page.mouse.move(1400, 300);

  // In-page sampler. Reads SF.THREE (dev debug surface), the live camera, and the camera
  // controller's zoomDiagnostics(). Hull boxes exclude any subtree tagged
  // userData.spacefaceTags.vfxRole — that tag marks drive plumes, nozzle glow, blinkers and
  // shield bubbles, none of which are hull. The drive* family is collected separately as the
  // plume bbox for the occlusion test.
  await page.evaluate((sampleMs) => {
    const samples = [];
    window.__BS_SAMPLES__ = samples;
    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    function boxesOf(root, THREE) {
      const hull = new THREE.Box3(); hull.makeEmpty();
      const plume = new THREE.Box3(); plume.makeEmpty();
      const tmp = new THREE.Box3();
      const walk = (obj) => {
        if (!obj || obj.visible === false) return;
        const tags = obj.userData && obj.userData.spacefaceTags;
        const role = tags && tags.vfxRole;
        // Plume family: procedural ships tag flames vfxRole 'drivePlume'/'driveCore'/
        // 'driveNozzleGlow'; authored GLB ships tag them spacefaceTags.drive 'plume'
        // (partsLibrary.js binds it into drivePlumes). Authored drive 'fan'/'core'/
        // 'thruster' nodes are physical nacelle hardware and stay in the hull box.
        const isPlume = (role && /^drive/.test(role)) || (tags && tags.drive === 'plume');
        if (isPlume) {
          if (obj.isMesh && obj.geometry) {
            if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
            if (obj.geometry.boundingBox) {
              tmp.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
              plume.union(tmp);
            }
          }
          return;
        }
        if (role) return; // non-plume vfxRole (navBlinker, shieldBubblePool): effect, not hull
        if (obj.isMesh && obj.geometry) {
          if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
          if (obj.geometry.boundingBox) {
            tmp.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
            hull.union(tmp);
          }
        }
        const kids = obj.children || [];
        for (let i = 0; i < kids.length; i++) walk(kids[i]);
      };
      walk(root);
      return { hull, plume };
    }

    function projectBox(box, cam, THREE) {
      if (!box || box.isEmpty()) return null;
      const min = box.min; const max = box.max;
      let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
      let behind = 0; let used = 0;
      const sx = []; const sy = [];
      for (let i = 0; i < 8; i++) {
        const v = new THREE.Vector3(
          i & 1 ? max.x : min.x,
          i & 2 ? max.y : min.y,
          i & 4 ? max.z : min.z,
        ).project(cam);
        if (v.z > 1) { behind += 1; continue; }
        used += 1;
        const px = (v.x * 0.5 + 0.5) * W();
        const py = (-v.y * 0.5 + 0.5) * H();
        sx.push(px); sy.push(py);
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
      }
      if (!used) return null;
      const w = maxX - minX; const h = maxY - minY;
      return {
        pxWidth: w, pxHeight: h, pxMax: Math.max(w, h),
        cx: minX + w / 2, cy: minY + h / 2,
        centerOffsetPx: Math.hypot(minX + w / 2 - W() / 2, minY + h / 2 - H() / 2),
        minX, maxX, minY, maxY, cornersBehind: behind,
        inFrame: maxX >= 0 && minX <= W() && maxY >= 0 && minY <= H(),
      };
    }

    const meshFor = (render, entity) => (
      entity && entity.mesh
        ? entity.mesh
        : (render.meshes && typeof render.meshes.get === 'function' ? render.meshes.get(entity && entity.id) : null)
    );

    const collect = () => {
      const SF = window.SF;
      if (!SF || !SF.state || !SF.THREE) return;
      const st = SF.state; const THREE = SF.THREE; const render = st.render;
      const cam = render && render.camera;
      const ctrl = render && render.cameraCtrl;
      const p = st.entities && st.entities.get(st.playerId);
      if (!cam || !p || !p.pos) return;
      const diag = ctrl && typeof ctrl.zoomDiagnostics === 'function' ? ctrl.zoomDiagnostics() : null;
      const sample = {
        t: performance.now(),
        simTime: st.simTime,
        speedWu: p.vel ? Math.hypot(p.vel.x || 0, p.vel.z || 0) : 0,
        mode: st.mode,
        zoom: diag ? {
          requested: diag.requestedZoom,
          base: diag.baseZoom,
          dynamic: diag.dynamicZoom,
          composed: diag.composedZoom,
          speedZoomFactor: diag.speedZoomFactor,
          speedEmaWu: diag.speedEmaWu,
          contextZoomBias: diag.contextZoomBias,
          contextMinZoom: diag.contextMinZoom,
          contextZoomCap: diag.contextZoomCap,
          boostZoomFactor: diag.boostZoomFactor,
          pushZoom: diag.pushZoom,
          holdS: diag.holdS,
          directorMode: diag.director && diag.director.mode,
          directorZoom: diag.director && diag.director.zoom,
          directorRequiredZoom: diag.director && diag.director.requiredZoom,
        } : null,
        focusTerms: diag ? {
          velocityLead: Math.hypot(diag.velocityLeadX || 0, diag.velocityLeadZ || 0),
          compositionBias: Math.hypot(diag.compositionBiasX || 0, diag.compositionBiasZ || 0),
          boostLag: diag.boostLag,
          latchSpring: Math.hypot(diag.latchSpringX || 0, diag.latchSpringZ || 0),
          kick: Math.hypot(diag.kickX || 0, diag.kickZ || 0),
        } : null,
        player: null,
        plumeCoversHull: null,
        hostiles: { inFrame: 0, outOfFrame: 0, medianPx: null, minPx: null },
      };
      const pmesh = meshFor(render, p);
      if (pmesh) {
        pmesh.updateWorldMatrix(true, true);
        const { hull, plume } = boxesOf(pmesh, THREE);
        const hull2d = projectBox(hull, cam, THREE);
        sample.player = hull2d;
        // The visible exhaust is scene-level VFX, not a child of the hull mesh: NPC ships get a
        // pooled SF_RibbonTrail (engineTrailSurfaces.js), and the player hero gets the plasma
        // volume/stream groups (thruster/systems/*.js — named plume-system:*, sf-liquid-plasma-*,
        // sf-volumetric-plume-*). Collect every live candidate, then take the one closest to the
        // player's hull box so a fleet plume across the field cannot be mistaken for ours.
        if (render.scene && hull2d) {
          const hcx = (hull.min.x + hull.max.x) / 2;
          const hcy = (hull.min.y + hull.max.y) / 2;
          const hcz = (hull.min.z + hull.max.z) / 2;
          const hullC = new THREE.Vector3(hcx, hcy, hcz);
          const candidates = [];
          const tbox = new THREE.Box3();
          const tv = new THREE.Vector3();
          render.scene.traverse((o) => {
            if (!o || o.visible === false) return;
            if (o.name === 'SF_RibbonTrail' && o.isMesh) {
              // Fixed-capacity ring buffer: skip unwritten (0,0,0) verts or they drag the box
              // to world origin.
              const pos = o.geometry && o.geometry.getAttribute && o.geometry.getAttribute('position');
              if (!pos) return;
              tbox.makeEmpty();
              for (let i = 0; i < pos.count; i++) {
                tv.set(pos.getX(i), pos.getY(i), pos.getZ(i));
                if (tv.lengthSq() < 1e-9) continue;
                tbox.expandByPoint(tv);
              }
              if (tbox.isEmpty()) return;
              tbox.applyMatrix4(o.matrixWorld);
              candidates.push({ name: 'SF_RibbonTrail', box: tbox.clone() });
              return;
            }
            if (/^(plume-system:|sf-liquid-plasma-root|sf-volumetric-plume-)/.test(o.name || '')) {
              const b = new THREE.Box3().setFromObject(o);
              if (!b.isEmpty()) candidates.push({ name: o.name, box: b });
              return;
            }
            // SF_TrailStreakInstances is ONE InstancedMesh for every ship's drive streaks —
            // the only exhaust the authored hulls (e.g. crucible's ship_hornet) actually show.
            // Whole-mesh bounds span the map; instead keep the instances parked near the hull.
            if (o.name === 'SF_TrailStreakInstances' && o.isInstancedMesh) {
              const m4 = new THREE.Matrix4();
              tbox.makeEmpty();
              let near = 0;
              for (let i = 0; i < o.count; i++) {
                o.getMatrixAt(i, m4);
                tv.set(m4.elements[12], m4.elements[13], m4.elements[14]).applyMatrix4(o.matrixWorld);
                if (tv.distanceTo(hullC) > 40) continue;
                near += 1;
                tbox.expandByPoint(tv);
              }
              if (near) {
                tbox.expandByScalar(3); // a streak is a stretched quad; the point is its centre
                candidates.push({ name: `SF_TrailStreakInstances(${near})`, box: tbox.clone() });
              }
            }
          });
          let best = null;
          let bestD = Infinity;
          for (const cand of candidates) {
            const d = cand.box.distanceToPoint(hullC);
            if (d < bestD) { bestD = d; best = cand; }
          }
          // A plume belongs to this ship only if it actually touches the hull; otherwise it is
          // someone else's trail and there is no player plume this sample. The size gate drops
          // pathological boxes (dead particles parked at world origin make a volume group's
          // bounds span half the sector).
          const bestDiag = best ? best.box.getSize(tv).length() : Infinity;
          if (best && bestD <= Math.max(12, hull.getSize(tv).length()) && bestDiag < 300) {
            plume.union(best.box);
            sample.plumeSource = best.name;
            sample.plumeDistWu = Number(bestD.toFixed(1));
          }
        }
        const plume2d = projectBox(plume, cam, THREE);
        if (hull2d && plume2d) {
          sample.plumePxMax = plume2d.pxMax;
          sample.plumeCoversHull = hull2d.cx >= plume2d.minX && hull2d.cx <= plume2d.maxX
            && hull2d.cy >= plume2d.minY && hull2d.cy <= plume2d.maxY;
        }
      }
      const sizes = [];
      const detail = [];
      for (const e of st.entityList || []) {
        if (!e || e.alive === false || e.type !== 'ship' || e.id === st.playerId) continue;
        const mesh = meshFor(render, e);
        const tag = (e.data && (e.data.typeId || e.data.shipId || e.data.defId)) || null;
        if (!mesh) { sample.hostiles.outOfFrame += 1; continue; }
        mesh.updateWorldMatrix(true, true);
        const b2d = projectBox(boxesOf(mesh, THREE).hull, cam, THREE);
        if (!b2d || !b2d.inFrame) { sample.hostiles.outOfFrame += 1; continue; }
        sample.hostiles.inFrame += 1;
        sizes.push(b2d.pxMax);
        if (detail.length < 12) detail.push({ id: e.id, tag, pxMax: Math.round(b2d.pxMax) });
      }
      if (detail.length) sample.hostiles.detail = detail;
      if (sizes.length) {
        sizes.sort((a, b) => a - b);
        sample.hostiles.minPx = sizes[0];
        sample.hostiles.medianPx = sizes.length % 2
          ? sizes[(sizes.length - 1) / 2]
          : (sizes[sizes.length / 2 - 1] + sizes[sizes.length / 2]) / 2;
      }
      samples.push(sample);
    };
    collect();
    window.__BS_TIMER__ = setInterval(collect, sampleMs);
  }, SAMPLE_MS);

  if (ROUTE === 'crucible') {
    // Same fight posture as the kill-shot capture: hold thrust + LMB, re-aim at nearest hostile.
    await page.evaluate(() => {
      window.__BS_AIM__ = setInterval(() => {
        const st = window.SF.state;
        const p = st.entities.get(st.playerId);
        if (!p) return;
        let best = null; let bestD = Infinity;
        for (const e of st.entityList || []) {
          if (!e || e === p || e.alive === false || !e.pos) continue;
          const hostile = e.team != null && e.team !== p.team;
          if (!hostile) continue;
          const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
          if (d < bestD) { bestD = d; best = e; }
        }
        if (!best) return;
        st.input = st.input || {};
        st.input.aimX = best.pos.x;
        st.input.aimZ = best.pos.z;
        if (st.player) st.player.targetId = best.id;
      }, 200);
    });
    await page.keyboard.down('KeyW');
    await page.mouse.down();
    await page.waitForTimeout(30_000);
    await page.mouse.up().catch(() => {});
    await page.keyboard.up('KeyW').catch(() => {});
    await page.evaluate(() => clearInterval(window.__BS_AIM__));
  } else {
    // 5 s settled idle on the opening frame, then 40 s under power (same posture as the
    // adventure live-shots capture: hold W, no steering).
    await page.waitForTimeout(5000);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(40_000);
    await page.keyboard.up('KeyW').catch(() => {});
  }

  const payload = await page.evaluate(() => {
    clearInterval(window.__BS_TIMER__);
    const render = window.SF && window.SF.state && window.SF.state.render;
    let gpu = null;
    try {
      const canvas = document.getElementById('gl-canvas') || document.querySelector('canvas');
      const gl = canvas && (canvas.getContext('webgl2') || canvas.getContext('webgl'));
      const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
      gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null;
    } catch { /* best-effort */ }
    return {
      samples: window.__BS_SAMPLES__ || [],
      gpu,
      viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
    };
  });
  const hostBusy = hostBusyPct(cpuBefore, cpuSnapshot());

  const summary = summarizeBodyScaleSamples(payload.samples);
  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = path.join(OUT_DIR, `${ROUTE}-${SEED}.json`);
  writeFileSync(outFile, JSON.stringify({
    route: ROUTE,
    seed: SEED,
    capturedAt: new Date().toISOString(),
    sampleMs: SAMPLE_MS,
    viewport: payload.viewport,
    gpu: payload.gpu,
    hostBusyPct: Number(hostBusy.toFixed(1)),
    consoleErrors,
    summary,
    samples: payload.samples,
  }, null, 2));

  const pct = (v) => (v == null ? 'n/a' : `${(v * 100).toFixed(0)}%`);
  const px = (v) => (v == null ? 'n/a' : v.toFixed(1));
  console.log('\nBODY-SCALE WITNESS');
  console.log(`  route                     ${ROUTE}, seed ${SEED}; ${payload.viewport.width}x${payload.viewport.height} @${payload.viewport.dpr}x`);
  console.log(`  GPU                       ${payload.gpu || 'unknown'}`);
  console.log(`  host CPU busy             ${hostBusy.toFixed(0)}% (geometry probe — load stretches sample count, not measured sizes)`);
  console.log(`  samples                   ${summary.samples}`);
  console.log(`  player hull px            p10 ${px(summary.playerHullPx.p10)} / p50 ${px(summary.playerHullPx.p50)} / p90 ${px(summary.playerHullPx.p90)}`);
  console.log(`  player off-centre px p50  ${px(summary.playerCenterOffsetPx.p50)}`);
  console.log(`  hostile hull px           median ${px(summary.hostilePx.median)} / min ${px(summary.hostilePx.min)}`);
  console.log(`  zoom base / applied p50,p90  ${px(summary.zoom.base)} / ${px(summary.zoom.dynamicP50)}, ${px(summary.zoom.dynamicP90)}`);
  console.log(`  player speed p50/p90      ${px(summary.speedWu.p50)} / ${px(summary.speedWu.p90)} WU/s`);
  console.log('  zoom term binding (fraction of samples):');
  for (const [term, f] of Object.entries(summary.bindingFraction).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${term.padEnd(20)} ${pct(f)}`);
  }
  console.log('  zoom term active (fraction of samples):');
  for (const [term, f] of Object.entries(summary.activeFraction)) {
    console.log(`    ${term.padEnd(20)} ${pct(f)}`);
  }
  console.log(`  plume covers hull centre  ${summary.plumeCoversHullFraction == null ? 'n/a (no plume object found)' : pct(summary.plumeCoversHullFraction)} (plume present ${pct(summary.plumePresentFraction)} of samples${Object.keys(summary.plumeSources).length ? `, sources: ${Object.entries(summary.plumeSources).map(([k, v]) => `${k} ${pct(v)}`).join(', ')}` : ''})`);
  console.log(`  hostiles in frame         ${pct(summary.hostilesInFrameFraction)} of samples`);
  console.log(`  console errors            ${consoleErrors.length}`);
  for (const line of consoleErrors.slice(0, 10)) console.log(`    ${line}`);
  console.log(`  samples written           ${outFile}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}
