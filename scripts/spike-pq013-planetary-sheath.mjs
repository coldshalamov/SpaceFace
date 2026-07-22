#!/usr/bin/env node
// PQ-013 SPIKE (bible-mandated STOP-gate): prove the planetary-scale Sheath + Bands visual
// read within frame budget BEFORE building the vertical. One THROWAWAY scene injected into
// the real render pipeline (real bloom/grade/HalfFloat composite), driven headed for real-GPU
// numbers. Captures default-camera screenshots (+ plasma variant) and measures rAF frame
// deltas with the spike hidden vs visible so the marginal cost is attributable.
//
// This script builds NO production seams. Everything lives under window.__pq013spike and a
// single THREE.Group; production PQ-013 work re-implements through the proper systems.
// Evidence: .devshots/pq013-planet/spike/{*.png,spike-report.json}

import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import { PNG } from 'pngjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'pq013-planet', 'spike');
const WIDTH = 1440, HEIGHT = 900;
const HEADED = process.env.SF_SPIKE_HEADLESS !== '1';

await mkdir(OUT, { recursive: true });
const executablePath = findSystemBrowser();
if (!executablePath) throw new Error('Chrome or Edge is required for the spike');

const ownedServer = await acquireVisualProbeServer({ explicitUrl: process.env.SF_PROBE_URL || '', root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: !HEADED,
  executablePath,
  args: [
    '--ignore-gpu-blocklist', '--enable-webgl',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
    `--window-size=${WIDTH},${HEIGHT + 120}`,
  ],
});
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
const page = await context.newPage();
const issues = [];
const captures = [];
page.on('pageerror', (e) => { console.error('[browser error]', e); issues.push({ type: 'pageerror', text: e?.stack || String(e) }); });
page.on('console', (m) => { if (m.type() === 'error') { console.error('[browser console.error]', m.text()); issues.push({ type: 'console.error', text: m.text() }); } });

try {
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(ownedServer.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus), null, { timeout: 30_000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'PQ013 Spike', seed: 47 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get(sf.state.playerId);
    return sf?.state?.mode === 'flight' && player?.mesh && !!sf?.registry?.get?.('vfx')?._scene;
  }, null, { timeout: 90_000 });
  await dismissTutorial(page);
  await page.waitForTimeout(800);

  const gpu = await page.evaluate(() => {
    const renderer = window.SF.state.render && window.SF.state.render.renderer;
    const gl = renderer && renderer.getContext ? renderer.getContext() : null;
    if (!gl) return { renderer: 'no-gl' };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    };
  });
  console.log('[spike] GPU:', JSON.stringify(gpu));

  // ---- Build the throwaway planetary scene -----------------------------------------------------
  const build = await page.evaluate(async () => {
    const SF = window.SF, state = SF.state, THREE = SF.THREE;
    const { createPlanetFactory } = await import('/src/render/planetFactory.js');
    const { createPlumeMaterial, createPlumeVolume, createMasslineRibbonMaterial, createEnergyMaterial } =
      await import('/src/render/energy/energyMaterials.js');

    const scene = state.render.scene;
    const player = state.entities.get(state.playerId);
    const fo = (state.world && state.world.frameOrigin) || { x: 0, z: 0 };

    // Anchor the player (capture-rig idiom) so the chase camera holds a stable frame.
    player.vel.x = 0; player.vel.z = 0;
    player.rot = -Math.PI / 2; // forward = (cos,sin) = (0,-1) -> faces -z (up-screen)
    player.physicsBody = { ...player.physicsBody, mass: 90000, inertiaY: 90000, revision: (player.physicsBody.revision || 0) + 1 };
    if (state.entityIndex && Number.isFinite(state.entityIndex.physicsStaticVersion)) state.entityIndex.physicsStaticVersion++;

    // SPIKE FINDING #3: the chase camera is FIXED-HEADING (ARCHITECTURE 0.14 — position-only
    // follow, never yaw). "Ahead of the ship" is meaningless for framing; the planet must sit
    // along the camera's fixed world forward (up-screen) to be seen at approach ranges. Query
    // the real camera rather than assuming an axis.
    const camDir = new THREE.Vector3();
    state.render.camera.getWorldDirection(camDir);
    const up = { x: camDir.x, z: camDir.z };
    const upLen = Math.hypot(up.x, up.z) || 1;
    up.x /= upLen; up.z /= upLen; // up-screen world direction on the gameplay plane

    // Planet global centre: up-screen of the spawn player.
    const R = 700;
    const C = { x: player.pos.x + up.x * 2200, z: player.pos.z + up.z * 2200 };
    // SPIKE FINDING #1: the default chase camera (tilt from vertical) never looks at the
    // horizon — the visible frustum points DOWN-forward (which is why the deep-field impostors
    // are all authored at negative Y). A colossal REAL planet must carry its bulk BELOW the
    // gameplay plane: centre y < 0, crest near the plane, ship skims over the limb. Physics
    // stays 2D planar (x/z annuli); the Y offset is presentation.
    const PLANET_Y = -520; // crest at +180 over the plane, inside the excluded core radius

    const group = new THREE.Group();
    group.name = 'pq013-spike';

    // 1) Colossal planet body — the shipped planet shader + ATMSHELL, at real-place scale.
    // SPIKE FINDING #5 (iteration 4, viewed): the shared detail-4 icosphere FACETS at close
    // range (blocky patch seams across the disc — the N64 hazard STEP 12 forbids). Near-planet
    // geometry needs a detail bump; test detail 5 here and measure what it costs.
    const pf = createPlanetFactory();
    const planet = pf.buildPlanetMesh('terran', R, 424213);
    const hiGeo = new THREE.IcosahedronGeometry(1, 5);
    planet.geometry = hiGeo;
    for (const child of planet.children) child.geometry = hiGeo; // ATMSHELL shares the sphere
    planet.position.set(C.x - fo.x, PLANET_Y, C.z - fo.z);
    group.add(planet);

    // 2) Annular band builder. SPIKE FINDINGS #4 + #6:
    //   - iteration 2: FLAT rings in the gameplay plane collapse to one edge-on line at the
    //     default camera — unreadable.
    //   - iteration 4 (viewed): VERTICAL curtains are just as thin from the fixed tilt.
    //   The band surface must FACE the camera: a shallow CONICAL SKIRT wrapping the planet —
    //   inner edge high, sloping down-outward — presents real area to the tilted camera on the
    //   near arc while the far arc hides behind the planet (natural occlusion). The SIM band
    //   stays a planar x/z annulus at these radii; the skirt is its drawn face, centred so the
    //   band surface crosses y=0 at rMid (the ship visibly flies IN the band).
    function makeBandGeo(rMid, width, segs, arcs, slope = 0.55) {
      // arcs: null = full ring; else [{a0,a1}] normalized arc spans (storm-band gaps).
      const spans = arcs || [{ a0: 0, a1: 1 }];
      const positions = [], along = [], side = [], index = [];
      const w2 = width / 2;
      const rIn = rMid - w2, rOut = rMid + w2;
      const yIn = w2 * slope, yOut = -w2 * slope;
      let v = 0;
      for (const s of spans) {
        const segN = Math.max(4, Math.round(segs * (s.a1 - s.a0)));
        for (let i = 0; i <= segN; i++) {
          const t = s.a0 + (s.a1 - s.a0) * (i / segN);
          const th = t * Math.PI * 2;
          const cx = Math.cos(th), sz = Math.sin(th);
          positions.push(cx * rIn, yIn, sz * rIn, cx * rOut, yOut, sz * rOut);
          along.push(t * 6, t * 6); // integer wrap multiple keeps the pulse seam invisible
          side.push(-1, 1);
          if (i < segN) {
            const a = v, b = v + 1, c = v + 2, d = v + 3;
            index.push(a, b, c, b, d, c);
          }
          v += 2;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
      geo.setAttribute('aAlong', new THREE.BufferAttribute(new Float32Array(along), 1));
      geo.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(side), 1));
      geo.setIndex(index);
      return geo;
    }
    // Deterministic storm arcs (integer-hash pattern idiom — no Math.random).
    function mix32(h) { h |= 0; h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); h = Math.imul(h ^ (h >>> 16), 0x45d9f3b); return (h ^= h >>> 16) >>> 0; }
    const stormArcs = [];
    for (let i = 0; i < 12; i++) {
      const j0 = mix32(9013 + i * 7) / 4294967296;
      const width = 0.045 + 0.03 * (mix32(577 + i * 13) / 4294967296);
      const base = i / 12 + j0 * 0.02;
      stormArcs.push({ a0: base, a1: Math.min(base + width, i / 12 + 1 / 12) });
    }

    // SPIKE FINDING #2 (iteration 1 whiteout): full-strength additive ribbons over planetary
    // areas blow out to a white sheet. The bible already rules it — bands are "thin, sparse,
    // desaturated, NOT additive white lasers" and the boundary never blooms. Band intensities
    // sit at or below radiance ~1 except the travel pulse.
    const bands = [
      // reentry band: smooth ominous brightening hugging the shell — energy material, no streak pulse
      { name: 'reentry', geo: makeBandGeo(R * 1.082, 42, 220, null), mat: null },
      // storm band: broken amber arcs
      { name: 'storm', geo: makeBandGeo(R * 1.18, 30, 220, stormArcs), mat: createMasslineRibbonMaterial({ name: 'spike-storm', color: 0xffb35c, intensity: 1.15, opacity: 0.3, pulseSpeed: 1.6 }) },
      { name: 'stormHot', geo: makeBandGeo(R * 1.18, 16, 220, stormArcs.filter((_, i) => i % 3 === 0)), mat: createMasslineRibbonMaterial({ name: 'spike-storm-hot', color: 0xff7040, intensity: 1.35, opacity: 0.28, pulseSpeed: 2.2 }) },
      // working band: dense cool streaks (the harvest corridor)
      { name: 'working', geo: makeBandGeo(R * 1.288, 44, 260, null), mat: createMasslineRibbonMaterial({ name: 'spike-working', color: 0xb8dff2, intensity: 1.0, opacity: 0.32, pulseSpeed: 3.4 }) },
      // outer band: thin, sparse, faint
      { name: 'outer', geo: makeBandGeo(R * 1.428, 16, 220, null), mat: createMasslineRibbonMaterial({ name: 'spike-outer', color: 0x9fd8e8, intensity: 0.7, opacity: 0.18, pulseSpeed: 2.2 }) },
    ];
    // reentry band material: energy strand, smooth (low edge noise), hot ramp toward #ff5c5c
    bands[0].mat = createEnergyMaterial({ name: 'spike-reentry', colorA: 0xffb35c, colorB: 0xff5c5c, intensity: 1.4, opacity: 0.3, noiseScale: 0.7, flowSpeed: 0.35, core: 0.1, edgeNoise: 0.15, fresnelPower: 1.2 });
    const bandMeshes = {};
    for (const b of bands) {
      const mesh = new THREE.Mesh(b.geo, b.mat);
      mesh.position.copy(planet.position);
      mesh.position.y = 0; // bands live in the gameplay plane (the skim corridor), not on the body
      mesh.renderOrder = 12;
      mesh.frustumCulled = false;
      group.add(mesh);
      bandMeshes[b.name] = mesh;
    }
    // Band tension: working band densest
    if (bandMeshes.working) bandMeshes.working.material.uniforms.uTension.value = 0.85;
    if (bandMeshes.outer) bandMeshes.outer.material.uniforms.uTension.value = 0.25;
    if (bandMeshes.storm) bandMeshes.storm.material.uniforms.uTension.value = 0.6;

    // 3) The Sheath — bow-shock cone AHEAD of the hull. Lathe profile: apex (hot stagnation
    // line) at local x=0, skirt flaring back to x=-4 (plume shader's axis convention).
    function makeSheathGeo() {
      const pts = [];
      const N = 14;
      for (let i = 0; i <= N; i++) {
        const t = i / N;              // 0 apex -> 1 skirt
        const x = -4 * t;
        const r = 0.22 + Math.pow(t, 0.72) * 3.1;
        pts.push(new THREE.Vector2(r, x)); // LatheGeometry rotates around Y: (radius, y)
      }
      const geo = new THREE.LatheGeometry(pts, 40);
      // Lathe builds around +Y with profile y := our x. Rotate so the axis lies along +X:
      geo.rotateZ(-Math.PI / 2); // +Y -> +X
      return geo;
    }
    const sheathGeo = makeSheathGeo();
    // Single-layer ionization sheath (Skim stage read) — a thin line at the nose, NOT a flame.
    const sheathThin = new THREE.Mesh(sheathGeo, createPlumeMaterial({
      name: 'spike-sheath-thin', colorA: 0x39d0ff, colorB: 0x2a7fb8, intensity: 2.6, opacity: 0.4, core: 0.5, boost: 0.1, swirl: 0.35, fork: 0.3,
    }));
    sheathThin.scale.set(3.2, 1.6, 1.6);
    // Two-layer plasma sheath (Commit/Breakup read) — the drama volume, closes over the hull.
    // Iteration-2 whiteout tune: coreIntensity 5.2/boost 1.0 blew 5.8% of the frame to pure
    // white at default zoom. The read needs bloom, not blowout — pull the core under the
    // white-out gate while the amber->red ramp still carries the heat truth.
    const sheathPlasma = createPlumeVolume(sheathGeo, {
      name: 'spike-sheath-plasma', colorA: 0xffb35c, colorB: 0xff5c5c, coreIntensity: 3.4, haloIntensity: 1.6, coreOpacity: 0.7, haloOpacity: 0.28, boost: 0.82, swirl: 0.5, fork: 0.6,
    });
    sheathPlasma.scale.set(3.6, 2.0, 2.0);
    for (const s of [sheathThin, sheathPlasma]) {
      s.visible = false;
      group.add(s);
    }

    scene.add(group);

    // rAF uniform driver (spike-only; production drives from the vfx accumulator).
    const mats = [];
    group.traverse((o) => { if (o.material && o.material.uniforms && o.material.uniforms.uTime) mats.push(o.material); });
    const spike = {
      group, planet, bandMeshes, sheathThin, sheathPlasma, R, C, up,
      mats, raf: 0, t0: performance.now(),
    };
    function tick() {
      const t = (performance.now() - spike.t0) / 1000;
      for (const m of spike.mats) m.uniforms.uTime.value = t;
      if (planet.material.uniforms && planet.material.uniforms.uTime) planet.material.uniforms.uTime.value = t;
      // Keep the sheath on the player nose, facing the ship's forward.
      const p = state.entities.get(state.playerId);
      const fo2 = (state.world && state.world.frameOrigin) || { x: 0, z: 0 };
      if (p) {
        const cf = Math.cos(p.rot || 0), sf2 = Math.sin(p.rot || 0);
        const nx = p.pos.x - fo2.x + cf * 10, nz = p.pos.z - fo2.z + sf2 * 10;
        for (const s of [spike.sheathThin, spike.sheathPlasma]) {
          s.position.set(nx, 0, nz);
          s.rotation.y = -(p.rot || 0); // local +X -> world forward(cos,sin) in x/z
        }
      }
      spike.raf = requestAnimationFrame(tick);
    }
    spike.raf = requestAnimationFrame(tick);
    window.__pq013spike = spike;
    const info = state.render.renderer.info;
    return { drawCallsNow: info.render.calls, triangles: info.render.triangles, playerPos: { ...player.pos }, planetCentre: C };
  });
  console.log('[spike] scene built:', JSON.stringify(build));

  // ---- helper: place player at a distance from the planet centre, facing it ------------------
  // The planet sits UP-SCREEN of the player along the camera's fixed forward; the ship faces it.
  async function placePlayer(dist) {
    await page.evaluate((dist) => {
      const SF = window.SF, state = SF.state;
      const spike = window.__pq013spike;
      const p = state.entities.get(state.playerId);
      p.pos.x = spike.C.x - spike.up.x * dist;
      p.pos.z = spike.C.z - spike.up.z * dist;
      p.rot = Math.atan2(spike.up.z, spike.up.x); // face along up-screen -> toward the planet
      p.vel.x = 0; p.vel.z = 0;
    }, dist);
    await page.waitForTimeout(450);
  }

  // ---- frame sampling ------------------------------------------------------------------------
  // Draw calls: renderer.info auto-resets at the start of every render pass, so a between-frame
  // read shows 0. Disable autoReset for the sample window and divide accumulated totals by the
  // frame count.
  async function sampleFrames(ms, label) {
    const r = await page.evaluate(async (ms) => {
      // Diagnostics owns renderer.info reset each frame; read its per-frame mirror instead
      // of renderer.info (which reads 0 between frames).
      const diag = window.__THREE_GAME_DIAGNOSTICS__ || (window.SF.state.render && window.SF.state.render.diagnostics);
      const deltas = [];
      const callSamples = [];
      let last = performance.now();
      await new Promise((resolve) => {
        function s(now) {
          deltas.push(now - last); last = now;
          if (diag && diag.info) { callSamples.push(diag.info.calls | 0); }
          if (now - deltas0 > ms) return resolve();
          requestAnimationFrame(s);
        }
        const deltas0 = performance.now();
        requestAnimationFrame((n) => { last = n; requestAnimationFrame(s); });
      });
      const maxOf = (a) => a.length ? Math.max(...a) : 0;
      const triangles = diag && diag.info ? diag.info.triangles | 0 : 0;
      deltas.sort((a, b) => a - b);
      const q = (p) => deltas[Math.min(deltas.length - 1, Math.floor(p * deltas.length))];
      return {
        n: deltas.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: deltas[deltas.length - 1],
        hitches32: deltas.filter((d) => d > 32).length,
        drawCalls: maxOf(callSamples), triangles,
      };
    }, ms);
    console.log(`[spike] frames ${label}: n=${r.n} p50=${r.p50.toFixed(2)} p95=${r.p95.toFixed(2)} p99=${r.p99.toFixed(2)} max=${r.max.toFixed(2)} hitches>32ms=${r.hitches32} calls/frame=${r.drawCalls} tris/frame=${r.triangles}`);
    return r;
  }

  async function setSpike(opts) {
    await page.evaluate((opts) => {
      const s = window.__pq013spike;
      s.group.visible = opts.group !== false;
      s.sheathThin.visible = !!opts.thin;
      s.sheathPlasma.visible = !!opts.plasma;
    }, opts);
    await page.waitForTimeout(200);
  }

  // ---- run the matrix ------------------------------------------------------------------------
  const report = { packet: 'PQ-013 spike', gpu, headed: HEADED, capturedAt: new Date().toISOString(), samples: {}, captures: [], issues };

  // Baseline at skim framing with the spike hidden. Settle first: scene build + first composite
  // raised a 3.1s one-off in iteration 1 (shader compile), which is startup, not steady state.
  await placePlayer(935); // near the working band (R*1.26..1.315 = 882..920)
  await setSpike({ group: false });
  await page.waitForTimeout(2500);
  report.samples.baselineSkim = await sampleFrames(5000, 'baseline (spike hidden)');

  // Far approach — planet + bands on the horizon.
  await setSpike({ group: true, thin: false, plasma: false });
  await placePlayer(3100);
  report.samples.far = await sampleFrames(4000, 'far approach');
  await capture('01-far-approach.png', 'far approach, default cam, dist 3100');

  await placePlayer(1500);
  report.samples.approach = await sampleFrames(4000, 'approach');
  await capture('02-approach.png', 'approach, default cam, dist 1500');

  // Skim with ionization sheath.
  await placePlayer(905);
  await setSpike({ group: true, thin: true, plasma: false });
  report.samples.skim = await sampleFrames(6000, 'skim + thin sheath');
  await capture('03-skim-bands-sheath.png', 'working band skim + ionization sheath, default cam');

  // Plasma commit (worst case).
  await setSpike({ group: true, thin: false, plasma: true });
  await placePlayer(860); // deeper — near the storm band
  report.samples.plasma = await sampleFrames(6000, 'plasma sheath (worst case)');
  await capture('04-plasma-commit.png', 'plasma sheath at storm-band depth, default cam');

  // Attribution at skim framing: which element buys the over-budget frames?
  await setSpike({ group: true, thin: true, plasma: false });
  await placePlayer(905);
  report.samples.attribAll = await sampleFrames(3500, 'attrib all-on');
  await page.evaluate(() => { window.__pq013spike.planet.visible = false; });
  report.samples.attribNoPlanet = await sampleFrames(3500, 'attrib planet hidden');
  await page.evaluate(() => { const s = window.__pq013spike; s.planet.visible = true; for (const m of Object.values(s.bandMeshes)) m.visible = false; });
  report.samples.attribNoBands = await sampleFrames(3500, 'attrib bands hidden');
  await page.evaluate(() => { const s = window.__pq013spike; for (const m of Object.values(s.bandMeshes)) m.visible = true; s.sheathThin.visible = false; });
  report.samples.attribNoSheath = await sampleFrames(3500, 'attrib sheath hidden');
  await page.evaluate(() => { window.__pq013spike.sheathThin.visible = true; });

  // COST PROBE: the attribution pins the overage on the procedural planet fragment shader at
  // near-fullscreen fill. Production plan = bake the SAME shader to a texture once (the tree
  // already ships planet-bake infrastructure for the background impostors) and sample it on a
  // plain textured sphere near-range. Prove the textured-sphere cost model holds budget at the
  // same coverage: swap in a MeshBasic canvas texture (cost equivalence probe — NOT the look).
  await page.evaluate(() => {
    const s = window.__pq013spike; const THREE = window.SF.THREE;
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
    const g = cv.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#274c73'); grad.addColorStop(0.5, '#2d6a4f'); grad.addColorStop(1, '#1d3557');
    g.fillStyle = grad; g.fillRect(0, 0, 1024, 512);
    g.fillStyle = 'rgba(240,244,250,0.55)';
    let h = 1;
    const mix = (x) => { x |= 0; x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); x = Math.imul(x ^ (x >>> 16), 0x45d9f3b); return ((x ^= x >>> 16) >>> 0) / 4294967296; };
    for (let i = 0; i < 900; i++) { const x = mix(h++) * 1024, y = mix(h++) * 512, r = 2 + mix(h++) * 14; g.beginPath(); g.ellipse(x, y, r * 2.2, r * 0.6, 0, 0, 7); g.fill(); }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    s._probeSavedMat = s.planet.material;
    s.planet.material = new THREE.MeshBasicMaterial({ map: tex, fog: false });
  });
  report.samples.costProbeBaked = await sampleFrames(4000, 'COST PROBE textured sphere (bake cost model)');
  await capture('07-cost-probe-textured-sphere.png', 'COST PROBE: baked-texture cost model at skim coverage (not the production look)');
  await page.evaluate(() => {
    const s = window.__pq013spike;
    s.planet.material.map.dispose(); s.planet.material.dispose();
    s.planet.material = s._probeSavedMat;
  });

  // Grey-read variant of the skim shot (desaturate in post is the reviewer step; capture raw here).
  await capture('05-skim-repeat-stability.png', 'skim repeat (capture stability check)');

  // ADVISORY (non-default cam): the STEP 12 lease list names the D7 camera seam for dive
  // framing. Preview what a lowered camera buys — clearly labeled, judged separately from
  // the 1x default shots above.
  await page.evaluate(() => {
    const cam = window.SF.state.render.camera;
    cam.position.y *= 0.42;
    cam.updateMatrixWorld(true);
  });
  await page.waitForTimeout(120);
  await capture('06-dive-framing-advisory.png', 'ADVISORY lowered camera (D7 dive-framing seam preview)');

  // Cleanup the throwaway scene.
  await page.evaluate(() => {
    const s = window.__pq013spike;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    s.group.parent && s.group.parent.remove(s.group);
    s.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) m.dispose(); }
    });
    delete window.__pq013spike;
  });
  report.samples.afterCleanup = await sampleFrames(2500, 'after cleanup');

  report.captures = captures;
  await writeFile(path.join(OUT, 'spike-report.json'), JSON.stringify(report, null, 2));

  const base = report.samples.baselineSkim, worst = report.samples.plasma;
  const deltaP95 = worst.p95 - base.p95;
  console.log(`[spike] VERDICT-DATA: baseline p95=${base.p95.toFixed(2)}ms worst(plasma) p95=${worst.p95.toFixed(2)}ms delta=${deltaP95.toFixed(2)}ms drawCallDelta=${worst.drawCalls - base.drawCalls}`);
  if (issues.length) { console.error('[spike] PAGE ERRORS', JSON.stringify(issues, null, 2)); process.exitCode = 1; }
  else console.log('SPIKE_CAPTURE_OK');
} finally {
  await browser.close();
  if (ownedServer && typeof ownedServer.close === 'function') await ownedServer.close();
}

async function capture(file, scenario) {
  const fullPath = path.join(OUT, file);
  await page.screenshot({ path: fullPath, fullPage: false });
  const bytes = await readFile(fullPath);
  const gate = assertNotWhiteout(file, bytes);
  captures.push({ path: fullPath, sha256: createHash('sha256').update(bytes).digest('hex'), scenario, whitePct: gate.whitePct, midLumPct: gate.midLumPct });
}

// Mechanical white-out gate (capture-fields.mjs idiom) — planetary scenes are the highest risk yet.
function assertNotWhiteout(file, bytes) {
  const png = PNG.sync.read(bytes);
  const { width, height, data } = png;
  const totalPixels = width * height;
  let whiteCount = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) whiteCount++;
  }
  const whitePct = whiteCount / totalPixels;
  if (whitePct > 0.02) { console.error(`WHITEOUT_FAIL ${file} ${(whitePct * 100).toFixed(4)}%`); process.exit(1); }
  const minX = Math.floor(width * 0.2), maxX = Math.floor(width * 0.8);
  const minY = Math.floor(height * 0.2), maxY = Math.floor(height * 0.8);
  let midLumCount = 0;
  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      const idx = (y * width + x) * 4;
      const lum = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
      if (lum >= 40 && lum <= 200) midLumCount++;
    }
  }
  const midLumPct = midLumCount / ((maxX - minX) * (maxY - minY));
  if (midLumPct < 0.01) { console.error(`STRUCTURE_FAIL ${file} ${(midLumPct * 100).toFixed(4)}%`); process.exit(1); }
  console.log(`[assertNotWhiteout] ${file}: whitePct=${(whitePct * 100).toFixed(4)}% centerMidLumPct=${(midLumPct * 100).toFixed(4)}% - PASS`);
  return { whitePct, midLumPct };
}

async function dismissTutorial(targetPage) {
  await targetPage.evaluate(() => {
    for (const sel of ['.tutorial-overlay', '[data-screen="tutorial"]', '.sf-tutorial']) {
      const root = document.querySelector(sel);
      const btn = root && [...root.querySelectorAll('button')].find((n) => /skip|dismiss|close|got it|begin/i.test(n.textContent || ''));
      if (btn) btn.click();
    }
    const anyBegin = [...document.querySelectorAll('button')].find((n) => /begin/i.test(n.textContent || ''));
    if (anyBegin) anyBegin.click();
  });
}

function findSystemBrowser() {
  return [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find((c) => existsSync(c)) || null;
}
