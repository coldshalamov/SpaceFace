// LOOK-04: the look bench. Boot the game once per ROUTE (swarm needs ?swarmRound at boot, the
// Adventure sector shots need ?sector at boot - two routes, two boots), pin the picture to a fixed
// quality, FREEZE the simulation, then render every hero frame under every variant of the Look
// without reloading, and score each picture.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/look-bench.mjs \
//        --variants=variants.json [--out=dir] [--frames=swarm,helios,phone,dark] [--preset=high]
//
// variants.json: [{"name":"base"}, {"name":"ambient-low","surface":{"rockFill":0.5},"rig":{"ambientGain":0.6}}]
//   surface   -> look.js tuneLook({surface})   (rockFill, rimStrength, coat, shadowTint[3], ...)
//   lookPost  -> look.js tuneLook({post})      (contrast, saturation, vibrance, ink, shadowTint[3], ...)
//   mood      -> snap to a named mood in src/data/lookMoods.js before the patches
//   rig       -> sector light gains on the live rig: ambientGain / keyGain / rimGain / fillGain
//   post      -> sector post override merged over the authored one: exposure, bloomStrengthScale,
//                bloomThresholdBias, grade, vignette
// Every variant starts from the frame's captured baseline (uniforms snapped, lights and post put
// back), so variants never accumulate.
//
// Outputs in <out>: <frame>-<variant>.png, sheet.png (rows = variants, columns = frames),
// lint.json (blownArea / largestRegion / bodyContrast per frame x variant), pin.json (renderer
// string and live quality numbers at every frame), run.json.
//
// No game code is touched: the live hooks are window.SF_fleetLook (the existing ?dev=fleetlook
// dev flag: setMood/tune) plus the render system from SF.registry.get('render').
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import { lintFrame, blownStats } from './look-lint.mjs';
import { bodiesUnderRegion } from './look-03-pixels.mjs';

const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const [k, ...v] = a.slice(2).split('='); return [k, v.length ? v.join('=') : 'true'];
}));
const PORT = Number(args.port || 8171);
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = resolve(args.out || `.devshots/fleet/looks/bench/${stamp}`);
// Default 'auto': judge the look at what this machine ships by default (an integrated GPU on the
// Auto policy boots on the High performance preset, renderer.js integratedAutoApplied). Pass
// --preset=high|medium|low to force another one.
const PRESET = args.preset || 'auto';
const ROUND = Number(args.round || 3);
const HELIOS = args.sector || 'helios_core';
const FRAMES = (args.frames || 'swarm,helios,phone,dark').split(',').map((s) => s.trim()).filter(Boolean);
const SHOW_HUD = args.hud === 'true';
const [VW, VH] = (args.viewport || '1280x720').split('x').map(Number);
const HEADED = args.headed === 'true';
const ARENA = args.arena || '';           // e.g. helios_core = Ricochet Foundry
const WANT_ROCKS = Number(args.rocks || 0); // wait (<=60 s) until this many asteroids are on screen before freezing
const VARIANTS = args.variants ? JSON.parse(readFileSync(resolve(args.variants), 'utf8')) : [{ name: 'base' }];
if (!VARIANTS.length) throw new Error('no variants');
for (const v of VARIANTS) if (!v.name || !/^[\w.-]+$/.test(v.name)) throw new Error(`variant needs a file-safe name: ${JSON.stringify(v)}`);
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[look-bench]', ...a);

// Darkest sector = lowest authored post exposure in sectorVisualProfiles.js.
async function darkestSector() {
  try {
    const m = await import(pathToFileURL(resolve('src/data/sectorVisualProfiles.js')).href);
    let best = null;
    for (const [id, p] of m.PROFILE_BY_ID) {
      const e = p && p.post && p.post.exposure;
      if (Number.isFinite(e) && (!best || e < best.exposure)) best = { id, exposure: e, profile: p.id };
    }
    return best;
  } catch (e) { log('could not read sectorVisualProfiles:', e.message); return null; }
}

// ---- page-side bench object (installed with evaluate; no game files involved) -------------------
const PAGE_BENCH = `(() => {
  const SF = window.SF, s = SF.state;
  const render = () => SF.registry.get('render');
  const FL = () => window.SF_fleetLook;
  const bench = window.__lookBench = { base: null };

  bench.unmasked = () => {
    try {
      const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl');
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
    } catch (e) { return 'unavailable: ' + e.message; }
  };

  bench.pinStatus = () => {
    const r = render(), rs = s.render || {}, v = (s.settings && s.settings.video) || {};
    const gl = rs.gpu || {};
    return {
      renderer: gl.renderer || null, vendor: gl.vendor || null, tier: gl.tier || null, software: gl.software === true,
      unmaskedRenderer: bench.unmasked(),
      dynResScale: rs.dynResScale, hitchReliefScale: rs.hitchReliefScale == null ? 1 : rs.hitchReliefScale,
      hitchReliefLevel: rs.hitchReliefLevel || 0,
      adaptiveScale: r && r._adaptive && typeof r._adaptive.getScale === 'function' ? r._adaptive.getScale() : null,
      adaptiveEnabled: r && r._adaptive ? (r._adaptive.enabled === undefined ? null : r._adaptive.enabled) : null,
      renderScaleSetting: v.renderScale, pixelRatio: r && r.renderer ? r.renderer.getPixelRatio() : null,
      buffer: r && r.renderer ? [r.renderer.domElement.width, r.renderer.domElement.height] : null,
      qualityMode: v.qualityMode, qualityPreset: v.qualityPreset, matchingPreset: (() => { try { return window.__lookPresetMatch ? window.__lookPresetMatch(v) : null; } catch (e) { return null; } })(), dynamicResolution: v.dynamicResolution,
      renderGraphSetting: v.renderGraph, shadows: v.shadows, bloom: v.bloom, bloomStrength: v.bloomStrength, postFx: v.postFx,
      frameCap: v.frameCap, mode: s.mode, sector: s.world && s.world.currentSectorId, simTime: s.simTime,
      viewport: [innerWidth, innerHeight], dpr: devicePixelRatio,
    };
  };

  // Pin: apply the preset through the same settings path the Settings screen uses (Manual mode, so
  // neither the dynamic-resolution controller nor the hitch governor is eligible), then force the
  // live fields back to full: dynResScale 1, hitch level 0, adaptive controller off.
  bench.pin = async (preset) => {
    if (preset === 'auto') { bench.repin(); return 'auto: shipped preset left as booted'; }
    const ad = await import('/src/render/adaptiveQuality.js');
    const applied = ad.applyQualityPreset(s.settings, preset);
    const video = s.settings.video;
    video.dynamicResolution = false;
    if (applied) for (const key of applied.changed) SF.bus.emit('settings:changed', { section: 'video', key, value: video[key] });
    bench.repin();
    return applied ? applied.changed : null;
  };
  bench.repin = () => {
    const r = render(), rs = s.render;
    try { r._adaptive && r._adaptive.setEnabled(false); } catch (e) {}
    try {
      if (r._hitchRelief && r._hitchRelief.level !== 0) r._setHitchReliefLevel(rs, 0, null);
      // Infinite last-change time blocks the governor's cooldown, so it cannot step down again.
      if (r._hitchRelief) r._hitchRelief.lastChangeMs = Infinity;
    } catch (e) {}
    rs.hitchReliefScale = 1; rs.hitchReliefLevel = 0; rs.dynResScale = 1;
    try { r._applySize(); } catch (e) {}
    return bench.pinStatus();
  };

  bench.freeze = (on, scale) => {
    if (on) SF.timeEffects.set('bench:freeze', { scale: scale || 0 }); else SF.timeEffects.clear('bench:freeze');
    return s.timeScale;
  };

  // Capture the frame's baseline: mood id, light intensities, the authored sector post.
  bench.capture = () => {
    const r = render(), rig = r && r._sectorPaletteRig;
    const lights = {};
    if (rig) for (const k of ['ambient', 'key', 'rim', 'fill']) if (rig.lights[k]) lights[k] = rig.lights[k].intensity;
    bench.base = { mood: FL().mood(), lights, sectorPost: r._sectorPost || null };
    return { mood: bench.base.mood, lights, post: bench.base.sectorPost };
  };
  bench.restore = () => {
    const r = render(), b = bench.base; if (!b) return false;
    FL().setMood(b.mood);                       // snap: also clears any tuneLook patch
    const rig = r._sectorPaletteRig;
    if (rig) for (const k of Object.keys(b.lights)) rig.lights[k].intensity = b.lights[k];
    r._sectorPost = b.sectorPost; r._invalidatePostOptionsCache(); r._syncPostOptions(true);
    return true;
  };
  bench.apply = (v) => {
    bench.restore();
    const r = render(), applied = {};
    const F = window.__lookFields;
    if (F) {
      const bad = [];
      for (const k of Object.keys(v.surface || {})) if (![...F.surfaceScalars, ...F.surfaceColors].includes(k)) bad.push('surface.' + k);
      for (const k of Object.keys(v.lookPost || {})) if (![...F.postScalars, ...F.postColors].includes(k)) bad.push('lookPost.' + k);
      for (const k of Object.keys(v.rig || {})) if (!['ambientGain', 'keyGain', 'rimGain', 'fillGain'].includes(k)) bad.push('rig.' + k);
      if (bad.length) applied.unknownKeys = bad;
    }
    if (v.mood) { FL().setMood(v.mood); applied.mood = v.mood; }
    if (v.surface || v.lookPost) { FL().tune({ surface: v.surface, post: v.lookPost }); applied.look = { surface: v.surface, post: v.lookPost }; }
    if (v.rig) {
      const rig = r._sectorPaletteRig;
      if (!rig) applied.rigError = 'no _sectorPaletteRig';
      else for (const k of ['ambient', 'key', 'rim', 'fill']) {
        const g = v.rig[k + 'Gain'];
        if (Number.isFinite(g) && rig.lights[k]) { rig.lights[k].intensity = bench.base.lights[k] * g; applied['light.' + k] = rig.lights[k].intensity; }
      }
    }
    // post: keys that are live Look post uniforms (toneNeutral, ink, contrast...) go through tuneLook;
    // the rest (exposure, bloomStrengthScale, bloomThresholdBias, grade, vignette) override the sector post.
    const lookPostKeys = F ? [...F.postScalars, ...F.postColors] : ['contrast', 'saturation', 'vibrance', 'ink', 'toneNeutral'];
    const postLook = {}, postSector = {};
    for (const k of Object.keys(v.post || {})) (lookPostKeys.includes(k) ? postLook : postSector)[k] = v.post[k];
    if (Object.keys(postLook).length) { FL().tune({ post: Object.assign({}, v.lookPost || {}, postLook) }); applied.lookPostFromPost = postLook; }
    if (F && postSector && Object.keys(postSector).length) {
      const okSector = ['exposure', 'bloomStrengthScale', 'bloomThresholdBias', 'grade', 'vignette', 'toe', 'grain'];
      const bad2 = Object.keys(postSector).filter((k) => !okSector.includes(k));
      if (bad2.length) (applied.unknownKeys ||= []).push(...bad2.map((k) => 'post.' + k));
    }
    if (Object.keys(postSector).length) {
      r._sectorPost = Object.assign({}, bench.base.sectorPost || {}, postSector);
      r._invalidatePostOptionsCache(); r._syncPostOptions(true);
      applied.post = postSector;
    }
    bench.repin();
    return applied;
  };

  // On-screen ships and asteroids with their screen-space silhouette (semi-axes in pixels).
  bench.bodies = () => {
    const h = SF.helpers, out = [];
    for (const e of s.entityList || []) {
      if (!e || e.alive === false || (e.type !== 'ship' && e.type !== 'asteroid') || !e.pos) continue;
      const rad = Number(e.radius); if (!(rad > 0)) continue;
      const p0 = h.worldToScreen({ x: e.pos.x, y: 0, z: e.pos.z }, {});
      if (!p0 || !p0.onScreen) continue;
      const px = h.worldToScreen({ x: e.pos.x + rad, y: 0, z: e.pos.z }, {});
      const pz = h.worldToScreen({ x: e.pos.x, y: 0, z: e.pos.z + rad }, {});
      if (!px || !pz) continue;
      const rx = Math.max(Math.abs(px.x - p0.x), Math.abs(pz.x - p0.x)), ry = Math.max(Math.abs(px.y - p0.y), Math.abs(pz.y - p0.y));
      if (!(rx > 4) || !(ry > 4) || rx > 400) continue;
      out.push({ id: e.id, type: e.type, defId: e.defId || (e.data && e.data.defId) || null, isPlayer: !!e.isPlayer, cx: p0.x, cy: p0.y, rx, ry,
        bounds: { left: p0.x - rx, right: p0.x + rx, top: p0.y - ry, bottom: p0.y + ry } });
    }
    return out;
  };

  // Which render objects / materials draw an entity id? Best effort: scene objects tagged with the entity id,
  // else the instanced pools that could be drawing it (asteroid pools share materials across entities).
  bench.materialsFor = (id) => {
    const e = s.entities && s.entities.get ? s.entities.get(id) : null;
    const scene = s.render && s.render.scene; const out = { id, type: e && e.type, defId: e && (e.defId || (e.data && e.data.defId)) || null,
      kind: e && e.data && (e.data.kind || e.data.shipClass) || null, meshes: [], pooled: [] };
    if (!scene) return out;
    const names = (o) => (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).map((m) => m.name || m.type);
    scene.traverse((o) => {
      const tag = o.userData && (o.userData.entityId != null ? o.userData.entityId : o.userData.id);
      if (tag === id && o.material) out.meshes.push({ name: o.name, kind: o.type, materials: names(o) });
      else if (o.isInstancedMesh && o.visible && out.pooled.length < 8 && (o.name || '').toLowerCase().match(/aster|rock/)) out.pooled.push({ name: o.name, count: o.count, materials: names(o) });
    });
    return out;
  };

  // Hide every DOM element that is not the main canvas or one of its ancestors (the HUD), so the
  // lint and the sheet judge the world, not the interface. Reversible with showHud().
  bench.hideHud = () => {
    let main = null;
    try { main = render().renderer.domElement; } catch (e) {}
    if (!main) { let area = 0; for (const c of document.querySelectorAll('canvas')) { const a = c.clientWidth * c.clientHeight; if (a > area) { area = a; main = c; } } }
    if (!main) return false;
    document.querySelectorAll('.sfb-keep').forEach((n) => n.classList.remove('sfb-keep'));
    for (let n = main; n && n !== document.documentElement; n = n.parentElement) n.classList.add('sfb-keep');
    let st = document.getElementById('sfb-hud-style');
    if (!st) { st = document.createElement('style'); st.id = 'sfb-hud-style'; document.head.appendChild(st); }
    st.textContent = 'body *:not(.sfb-keep){visibility:hidden !important}';
    return true;
  };
  bench.showHud = () => { const st = document.getElementById('sfb-hud-style'); if (st) st.textContent = ''; };
  return true;
})()`;

// ---- run ----------------------------------------------------------------------------------------
const server = spawn(process.execPath, ['server.js', String(PORT)], { cwd: process.cwd(), stdio: 'ignore' });
const dark = await darkestSector();
log(`out ${OUT}`);
log(`frames ${FRAMES.join(',')} | variants ${VARIANTS.map((v) => v.name).join(',')} | preset ${PRESET} | darkest sector ${dark ? `${dark.id} (exposure ${dark.exposure})` : '?'}`);

const results = [];        // { frame, variant, file, lint, pin }
const pinLog = [];         // per frame
const warnings = [];
const warn = (msg) => { warnings.push(msg); console.log('!!! [look-bench] ' + msg); };
let browser = null;

async function answerPrompts(page) {
  const ok = page.locator('.sf-confirm__ok');
  if (await ok.first().isVisible().catch(() => false)) {
    await ok.first().click().catch(() => {});
    await page.waitForSelector('.sf-confirm', { state: 'detached', timeout: 4000 }).catch(() => {});
  }
}
async function newPage(url, viewport) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 200)));
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(url, { waitUntil: 'commit', timeout: 120_000 });
  const splash = page.locator('#cinematic-splash');
  if (await splash.count().catch(() => 0)) {
    await splash.click({ timeout: 4000 }).catch(() => {});
    await page.waitForSelector('#cinematic-splash', { state: 'detached', timeout: 6000 }).catch(() => {});
  }
  return page;
}
async function waitFor(page, label, fn, ms = 240_000, arg) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    await answerPrompts(page);
    if (await page.evaluate(fn, arg).catch(() => false)) return true;
    await sleep(1000);
  }
  throw new Error(`timed out waiting for ${label}`);
}
async function installBench(page) {
  await waitFor(page, 'SF_fleetLook + SF', () => !!(window.SF && window.SF.registry && window.SF.timeEffects && window.SF_fleetLookReady), 300_000);
  await page.evaluate(PAGE_BENCH);
  await page.evaluate(async () => { try { const m = await import('/src/render/adaptiveQuality.js'); window.__lookPresetMatch = m.matchingQualityPreset; } catch (e) {} try { const l = await import('/src/render/look.js'); window.__lookFields = l.LOOK_FIELDS; } catch (e) {} });
}
async function pinAndReport(page, frame) {
  const pin = await page.evaluate(() => window.__lookBench.repin());
  const entry = { frame, ...pin };
  const problems = [];
  if (pin.software || /swiftshader|llvmpipe|software|basic render/i.test(`${pin.unmaskedRenderer} ${pin.renderer}`)) problems.push('SOFTWARE/SwiftShader renderer');
  if (pin.dynResScale !== 1) problems.push(`dynResScale ${pin.dynResScale}`);
  if (pin.hitchReliefScale !== 1 || pin.hitchReliefLevel !== 0) problems.push(`hitch relief scale ${pin.hitchReliefScale} level ${pin.hitchReliefLevel}`);
  if (PRESET !== 'auto' && pin.renderScaleSetting !== 1) problems.push(`renderScale setting ${pin.renderScaleSetting}`);
  entry.problems = problems;
  entry.pinned = problems.length === 0;
  pinLog.push(entry);
  if (problems.length) warn(`frame ${frame}: NOT the pinned high picture - ${problems.join('; ')}`);
  return entry;
}
async function settle(page, ms = 450) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await sleep(ms);
}
function pixelDiff(aBytes, bBytes) {
  // fraction of pixels whose max channel delta > 8, used only to report how still the freeze is
  const A = blobPng(aBytes), B = blobPng(bBytes);
  if (A.width !== B.width || A.height !== B.height) return 1;
  let n = 0; const total = A.width * A.height;
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    if (Math.abs(A.data[p] - B.data[p]) > 8 || Math.abs(A.data[p + 1] - B.data[p + 1]) > 8 || Math.abs(A.data[p + 2] - B.data[p + 2]) > 8) n++;
  }
  return n / total;
}
const blobPng = (bytes) => PNG.sync.read(bytes);

// Shoot one hero frame under every variant.
async function shootFrame(page, frame, label) {
  const pin = await pinAndReport(page, frame);
  if (!SHOW_HUD) await page.evaluate(() => window.__lookBench.hideHud());
  await page.evaluate(() => window.__lookBench.freeze(true));
  await settle(page, 900);
  const baseline = await page.evaluate(() => window.__lookBench.capture());
  log(`${frame}: baseline mood ${baseline.mood}, lights ${JSON.stringify(baseline.lights)}`);
  const bodies = await page.evaluate(() => window.__lookBench.bodies());
  let freezeDrift = null, baseBytes = null;
  // Warm-up: the first frames after the hold still settle (camera easing, HUD hide, preset route);
  // a base shot taken straight away is a different moment from every later variant (seen: 23% of
  // pixels). Burn two shots, then require the world to be still before the real base is taken.
  for (let w = 0; w < 4; w++) {
    const a = await page.screenshot(); await settle(page, 900); const b = await page.screenshot();
    if (pixelDiff(a, b) < 0.0005) break;
  }
  for (let i = 0; i < VARIANTS.length; i++) {
    const v = VARIANTS[i];
    const applied = await page.evaluate((vv) => window.__lookBench.apply(vv), v);
    await settle(page);
    const file = join(OUT, `${frame}-${v.name}.png`);
    let bytes = await page.screenshot({ path: file });
    let freezeMode = 'hold';
    if (applied.unknownKeys) warn(`${frame}/${v.name}: unknown variant keys ignored: ${applied.unknownKeys.join(', ')}`);
    if (i > 0 && baseBytes && pixelDiff(bytes, baseBytes) < 1e-6) {
      // Identical to base: either the variant is a no-op, or a fully held world is not redrawing.
      // Retry with the clock trickling (scale 0.001: the world is still, the renderer is fed).
      await page.evaluate(() => window.__lookBench.freeze(true, 0.001));
      await page.evaluate((vv) => window.__lookBench.apply(vv), v);
      await settle(page, 900);
      bytes = await page.screenshot({ path: file });
      freezeMode = 'trickle';
      const stillSame = pixelDiff(bytes, baseBytes) < 1e-6;
      if (stillSame) { freezeMode = 'no-visible-effect'; warn(`${frame}/${v.name}: picture is pixel-identical to base even with the renderer fed - the variant changes nothing visible here`); }
      await page.evaluate(() => window.__lookBench.freeze(true));
    }
    if (i === 0) baseBytes = bytes;
    if (i === 0) {                                  // how still is the freeze? shoot the base twice
      await settle(page, 600);
      const again = await page.screenshot();
      freezeDrift = pixelDiff(bytes, again);
      if (freezeDrift > 0.002) warn(`frame ${frame}: frozen world still moves (${(freezeDrift * 100).toFixed(2)}% of pixels changed between two shots of base)`);
    }
    const lint = lintFrame(bytes, bodies);
    lint.regionBodies = lint.regions.slice(0, 3).map((r) => ({ pixels: r.pixels, fraction: r.fraction, bodies: bodiesUnderRegion(r, bodies).map((b) => `${b.type}:${b.id}`) }));
    const top = lint.regions && lint.regions[0];
    let whiteRegion = null;
    if (top) {
      const cxr = (top.bounds.left + top.bounds.right) / 2, cyr = (top.bounds.top + top.bounds.bottom) / 2;
      const under = bodiesUnderRegion(top, bodies).map((b) => ({ ...b, d: Math.hypot(b.cx - cxr, b.cy - cyr) })).sort((a, b) => a.d - b.d);
      const pick = under[0] || null;
      whiteRegion = { pixels: top.pixels, fraction: top.fraction, meanLuma: top.meanLuma, bounds: top.bounds, candidates: under.slice(0, 3).map((b) => `${b.type}:${b.id}`) };
      if (pick) whiteRegion.entity = await page.evaluate((id) => window.__lookBench.materialsFor(id), pick.id);
      lint.whiteRegion = whiteRegion;
      if (i === 0 && whiteRegion.entity) console.log(`  largest white region (${(top.fraction * 100).toFixed(2)}%): entity ${pick.id} type ${pick.type} defId ${whiteRegion.entity.defId} kind ${whiteRegion.entity.kind} meshes ${JSON.stringify(whiteRegion.entity.meshes)} pooled ${JSON.stringify(whiteRegion.entity.pooled)}`);
    }
    results.push({ frame, label, variant: v.name, file, applied, freezeMode, diffFromBase: i > 0 && baseBytes ? pixelDiff(bytes, baseBytes) : 0, lint, freezeDrift: i === 0 ? freezeDrift : undefined, pinned: pin.pinned });
    const w = lint.bodyContrast.worst.map((b) => `${b.type}:${b.id}=${b.michelson.toFixed(2)}`).join(' ');
    console.log(`  ${frame.padEnd(7)} ${v.name.padEnd(16)} blown ${(lint.blownArea * 100).toFixed(2)}%  largest ${(lint.largestRegion * 100).toFixed(2)}%  bodies ${lint.bodiesMeasured}/${lint.bodiesOnScreen}  contrast median ${lint.bodyContrast.median == null ? '-' : lint.bodyContrast.median.toFixed(1)} (mich ${lint.bodyContrast.medianMichelson == null ? '-' : lint.bodyContrast.medianMichelson.toFixed(2)})  worst ${w || '-'}  diff-from-base ${(results[results.length - 1].diffFromBase * 100).toFixed(2)}%${freezeMode !== 'hold' ? ' [' + freezeMode + ']' : ''}`);
  }
  await page.evaluate(() => { window.__lookBench.restore(); });
  return { bodies: bodies.length, freezeDrift };
}

try {
  await sleep(2500);
  browser = await chromium.launch({ headless: !HEADED, args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const runInfo = { out: OUT, frames: FRAMES, variants: VARIANTS, preset: PRESET, darkSector: dark, freeze: 'SF.timeEffects scale 0 (sim held; presentation keeps rendering)', boots: [] };

  // ---- boot 1: Swarm round N, mid-fight -------------------------------------------------------
  if (FRAMES.includes('swarm')) {
    const t0 = Date.now();
    const page = await newPage(`http://127.0.0.1:${PORT}/?swarmRound=${ROUND}${ARENA ? `&swarmArena=${encodeURIComponent(ARENA)}` : ''}&dev=fleetlook`, { width: VW, height: VH });
    await installBench(page);
    let live = 0;
    while (Date.now() - t0 < 420_000) {
      await answerPrompts(page);
      const launch = page.getByText(/Launch round/i).first();
      if (await launch.isVisible().catch(() => false)) await launch.click({ force: true, timeout: 5000 }).catch(() => {});
      live = await page.evaluate(() => {
        const s = window.SF && window.SF.state;
        if (!s || s.mode !== 'flight') return 0;
        return (s.entityList || []).filter((e) => e && e.alive !== false && e.type === 'ship' && !e.isPlayer && e.team !== 0).length;
      }).catch(() => 0);
      if (live >= 3) break;
      await sleep(1500);
    }
    log(`swarm: ${live} hostiles live after ${Math.round((Date.now() - t0) / 1000)} s`);
    if (live < 3) warn('swarm: fewer than 3 hostiles live - the "mid-fight" frame may be empty');
    log('swarm: pinning quality ->', PRESET, JSON.stringify(await page.evaluate((p) => window.__lookBench.pin(p), PRESET)));
    await sleep(6000);                               // let the preset's render route settle
    await page.mouse.click(Math.round(VW / 2), Math.round(VH / 2)).catch(() => {});
    await sleep(2500);                               // a little more fight before the hold
    if (WANT_ROCKS) {
      let rocks = 0; const tr = Date.now();
      while (Date.now() - tr < 60_000) {
        rocks = await page.evaluate(() => window.__lookBench.bodies().filter((b) => b.type === 'asteroid').length);
        if (rocks >= WANT_ROCKS) break; await sleep(1000);
      }
      log(`swarm: ${rocks} asteroids on screen (wanted ${WANT_ROCKS})`);
      if (rocks < WANT_ROCKS) warn(`swarm: only ${rocks} asteroids on screen, wanted ${WANT_ROCKS}`);
    }
    const info = await shootFrame(page, 'swarm', `Swarm round ${ROUND} mid-fight`);
    runInfo.boots.push({ route: 'swarmRound', seconds: Math.round((Date.now() - t0) / 1000), ...info });
    await page.close();
  }

  // ---- boot 2: Adventure sector shot (Helios), phone portrait, darkest sector ------------------
  const sectorFrames = FRAMES.filter((f) => f !== 'swarm');
  if (sectorFrames.length) {
    const t0 = Date.now();
    const startSector = sectorFrames.includes('helios') || sectorFrames.includes('phone') ? HELIOS : (dark && dark.id);
    const page = await newPage(`http://127.0.0.1:${PORT}/?sector=${encodeURIComponent(startSector)}&shot=1&dev=fleetlook`, { width: 1280, height: 720 });
    await installBench(page);
    await waitFor(page, 'sector shot ready', () => window.__sfShotReady === true, 300_000);
    log(`sector boot ready after ${Math.round((Date.now() - t0) / 1000)} s`);
    log('pinning quality ->', PRESET, JSON.stringify(await page.evaluate((p) => window.__lookBench.pin(p), PRESET)));
    await sleep(6000);
    await settle(page, 2500);

    if (startSector === HELIOS && sectorFrames.includes('helios')) {
      await shootFrame(page, 'helios', `Adventure ${HELIOS} 1280x720`);
    }

    if (sectorFrames.includes('phone')) {
      // Phone portrait: 390x844 viewport + touch emulation (coarse pointer, touch points).
      await page.evaluate(() => window.__lookBench.freeze(false));
      const cdp = await page.context().newCDPSession(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
      await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' }).catch(() => {});
      await sleep(2500);
      const probe = await page.evaluate(() => ({ coarse: matchMedia('(pointer: coarse)').matches, touchPoints: navigator.maxTouchPoints, w: innerWidth, h: innerHeight,
        bodyClasses: document.body.className.slice(0, 160), phone: !!(window.SF && window.SF.state && window.SF.state.ui && (window.SF.state.ui.phone || window.SF.state.ui.isPhone)) }));
      log('phone probe', JSON.stringify(probe));
      if (!probe.coarse) warn('phone: matchMedia(pointer:coarse) is false - the game may not have switched to its touch layout');
      await shootFrame(page, 'phone', `Adventure ${HELIOS} 390x844 touch`);
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false }).catch(() => {});
      await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: false }).catch(() => {});
      await page.setViewportSize({ width: 1280, height: 720 });
      await sleep(1500);
    }

    if (sectorFrames.includes('dark') && dark) {
      await page.evaluate(() => window.__lookBench.freeze(false));
      const darkId = dark.id;
      let inPage = true;
      if (startSector !== darkId) {
        try {
          const jumped = await page.evaluate((id) => {
            const w = window.SF.registry.get('world'); if (!w || !w.enterSector) return false;
            window.__benchJumpAt = window.SF.state.simTime; w.enterSector(id); return true;
          }, darkId);
          if (!jumped) throw new Error('no world.enterSector');
          await waitFor(page, `sector ${darkId}`, (id) => window.SF.state.mode === 'flight' && window.SF.state.world.currentSectorId === id
            && (window.SF.state.simTime - (window.__benchJumpAt || 0)) >= 4 && !window.SF.state.render.sectorShellAdmission, 150_000, darkId);
        } catch (e) { inPage = false; log('in-page jump failed:', e.message); }
      }
      if (inPage) {
        await sleep(1500);
        await settle(page, 2000);
        await shootFrame(page, 'dark', `Darkest sector ${darkId}`);
      } else {
        warn('dark: in-page sector jump failed, used a second sector boot');
        await page.close();
        const p2 = await newPage(`http://127.0.0.1:${PORT}/?sector=${encodeURIComponent(darkId)}&shot=1&dev=fleetlook`, { width: 1280, height: 720 });
        await installBench(p2);
        await waitFor(p2, 'dark sector shot ready', () => window.__sfShotReady === true, 300_000);
        await p2.evaluate((p) => window.__lookBench.pin(p), PRESET);
        await sleep(6000);
        await settle(p2, 2000);
        await shootFrame(p2, 'dark', `Darkest sector ${darkId}`);
        await p2.close();
      }
    }
    runInfo.boots.push({ route: 'sector', seconds: Math.round((Date.now() - t0) / 1000) });
    await page.close().catch(() => {});
  }

  // ---- outputs ----------------------------------------------------------------------------------
  await finish(runInfo);
} catch (e) {
  console.error('[look-bench] FAILED', e);
  process.exitCode = 1;
  await finish({ out: OUT, error: String(e && e.message) }).catch((err) => console.error('finish failed', err));
} finally {
  if (browser) await browser.close().catch(() => {});
  server.kill();
}

async function finish(runInfo) {
  writeFileSync(join(OUT, 'pin.json'), JSON.stringify(pinLog, null, 2));
  const lint = {};
  for (const r of results) { (lint[r.frame] ||= {})[r.variant] = { ...r.lint, regions: undefined, freezeDrift: r.freezeDrift, freezeMode: r.freezeMode, diffFromBase: r.diffFromBase, pinned: r.pinned }; }
  writeFileSync(join(OUT, 'lint.json'), JSON.stringify(lint, null, 2));
  writeFileSync(join(OUT, 'run.json'), JSON.stringify({ ...runInfo, warnings, results: results.map((r) => ({ frame: r.frame, variant: r.variant, file: r.file, applied: r.applied })) }, null, 2));
  if (!results.length) return;
  await makeSheet();
  const anyUnpinned = pinLog.some((p) => !p.pinned);
  console.log(anyUnpinned ? '!!! [look-bench] QUALITY WAS NOT PINNED for: ' + pinLog.filter((p) => !p.pinned).map((p) => p.frame).join(', ') : '[look-bench] quality pinned for every frame');
  console.log(`[look-bench] renderer: ${pinLog[0] ? pinLog[0].unmaskedRenderer : '?'}`);
  console.log(`[look-bench] sheet ${join(OUT, 'sheet.png')} | lint ${join(OUT, 'lint.json')} | pin ${join(OUT, 'pin.json')}`);
}

// Contact sheet in a blank browser canvas: rows = variants, columns = frames, labelled.
async function makeSheet() {
  const frames = [...new Set(results.map((r) => r.frame))];
  const variants = [...new Set(results.map((r) => r.variant))];
  const cells = results.map((r) => ({ frame: r.frame, variant: r.variant, label: r.label,
    data: `data:image/png;base64,${readFileSync(r.file).toString('base64')}`,
    blown: r.lint.blownArea, med: r.lint.bodyContrast.medianMichelson }));
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const png = await page.evaluate(async ({ cells, frames, variants }) => {
    const imgs = await Promise.all(cells.map((c) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = c.data; })));
    const cellH = 440, pad = 14, head = 34, side = 170, cap = 26;
    const colW = frames.map((f) => Math.max(...cells.map((c, k) => (c.frame === f ? Math.round(imgs[k].width * cellH / imgs[k].height) : 0))));
    const W = side + pad + colW.reduce((a, w) => a + w + pad, 0), H = head + variants.length * (cellH + cap + pad) + pad;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.fillStyle = '#0a0d14'; g.fillRect(0, 0, W, H);
    g.font = '600 16px monospace'; g.fillStyle = '#f1f5f9';
    let x = side + pad;
    frames.forEach((f, j) => { const lab = cells.find((c) => c.frame === f).label; g.fillText(lab.slice(0, Math.max(10, Math.floor(colW[j] / 9))), x, 22); x += colW[j] + pad; });
    cells.forEach((c, k) => {
      const row = variants.indexOf(c.variant), col = frames.indexOf(c.frame);
      let cx = side + pad; for (let j = 0; j < col; j++) cx += colW[j] + pad;
      const y = head + row * (cellH + cap + pad);
      const w = Math.round(imgs[k].width * cellH / imgs[k].height);
      g.drawImage(imgs[k], cx, y, w, cellH);
      g.font = '12px monospace'; g.fillStyle = '#9fb0c8';
      g.fillText(`blown ${(c.blown * 100).toFixed(2)}%  body contrast ${c.med == null ? '-' : c.med.toFixed(2)}`, cx, y + cellH + 16);
      if (col === 0) { g.font = '600 15px monospace'; g.fillStyle = '#ffd479'; g.fillText(c.variant, 8, y + 24); }
    });
    return cv.toDataURL('image/png').split(',')[1];
  }, { cells, frames, variants });
  writeFileSync(join(OUT, 'sheet.png'), Buffer.from(png, 'base64'));
  await page.close();
}
