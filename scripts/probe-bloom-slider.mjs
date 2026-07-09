import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { PNG } from 'pngjs';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const OUT = '.devshots/bloom/bloom-slider-probe.json';
const SHOT_DIR = '.devshots/bloom';
const WIDTH = 1280;
const HEIGHT = 800;

let serverChild = null;
let browser = null;

try {
  const port = await findFreePort(8240);
  serverChild = spawn(process.execPath, ['server.js', String(port)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  serverChild.stdout.on('data', () => {});
  serverChild.stderr.on('data', () => {});
  await waitReachable(`http://127.0.0.1:${port}/`);

  browser = await chromium.launch({
    headless: true,
    args: ['--ignore-gpu-blocklist', '--enable-webgl'],
  });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err && err.message || err)));
  page.on('console', (msg) => {
    if (msg.type() === 'error') pageErrors.push(msg.text());
  });
  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
    try { localStorage.removeItem('sf.profile.settings'); } catch (_) {}
  });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF && window.SF.bus && window.SF.state), null, { timeout: 15000 });
  await page.evaluate(() => {
    window.SF.bus.emit('game:new', { seed: 424242 });
    window.SF.bus.emit('ui:closeAll', {});
  });
  try {
    await page.waitForFunction(() => {
      const sf = window.SF;
      const state = sf && sf.state;
      return !!(state && state.mode === 'flight' && state.playerId && state.entities && state.entities.get(state.playerId));
    }, null, { timeout: 60000 });
  } catch (error) {
    const snap = await page.evaluate(() => {
      const sf = window.SF;
      const state = sf && sf.state;
      return {
        hasSf: !!sf,
        mode: state && state.mode,
        playerId: state && state.playerId,
        entityCount: state && state.entityList && state.entityList.length,
        screenStack: state && state.ui && state.ui.screenStack,
        assetGate: state && state.render && state.render.authoredAssetsReady,
        bootError: window.__SF_BOOT_ERROR__ && String(window.__SF_BOOT_ERROR__.message || window.__SF_BOOT_ERROR__),
        location: window.location.href,
      };
    });
    throw new Error(`flight wait failed: ${error.message}; snapshot=${JSON.stringify(snap)}; pageErrors=${JSON.stringify(pageErrors.slice(0, 8))}`);
  }
  await page.evaluate(() => {
    const state = window.SF.state;
    if (state.ui && state.ui.screenStack) state.ui.screenStack.length = 0;
    const splash = document.getElementById('cinematic-splash');
    if (splash && splash.parentNode) splash.parentNode.removeChild(splash);
    const intro = document.querySelector('.sf-ob-intro');
    if (intro && intro.parentNode) intro.parentNode.removeChild(intro);
  });
  await page.waitForTimeout(1000);

  mkdirSync(SHOT_DIR, { recursive: true });
  const cases = [
    { name: 'wrapper_strength_1', renderGraph: false, bloom: true, bloomStrength: 1 },
    { name: 'wrapper_strength_0_1', renderGraph: false, bloom: true, bloomStrength: 0.1 },
    { name: 'wrapper_strength_0', renderGraph: false, bloom: true, bloomStrength: 0 },
    { name: 'wrapper_bloom_off', renderGraph: false, bloom: false, bloomStrength: 1 },
    { name: 'graph_strength_1', renderGraph: true, bloom: true, bloomStrength: 1 },
    { name: 'graph_strength_0_1', renderGraph: true, bloom: true, bloomStrength: 0.1 },
    { name: 'graph_strength_0', renderGraph: true, bloom: true, bloomStrength: 0 },
    { name: 'graph_bloom_off', renderGraph: true, bloom: false, bloomStrength: 1 },
  ];

  const captures = [];
  for (const c of cases) {
    const result = await captureCase(page, c);
    captures.push(result);
    console.log(`${c.name}: path=${result.post.activePath} mean=${result.image.mean.toFixed(2)} max=${result.image.max} strength=${result.post.bloom?.strength ?? result.post.renderGraphDetails?.bloomStrength ?? 'n/a'}`);
  }
  const energy = await probeEnergyRadiance(page);
  const uiSlider = await probeSettingsSlider(page);

  const byName = new Map(captures.map((c) => [c.name, c]));
  const comparisons = {
    wrapper_1_vs_0_1: compareImages(byName.get('wrapper_strength_1'), byName.get('wrapper_strength_0_1')),
    wrapper_0_vs_off: compareImages(byName.get('wrapper_strength_0'), byName.get('wrapper_bloom_off')),
    graph_1_vs_0_1: compareImages(byName.get('graph_strength_1'), byName.get('graph_strength_0_1')),
    graph_0_vs_off: compareImages(byName.get('graph_strength_0'), byName.get('graph_bloom_off')),
  };

  const report = { generatedAt: new Date().toISOString(), port, pageErrors, captures, comparisons, energy, uiSlider };
  const verdict = evaluateVerdict(report);
  report.verdict = verdict;
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`report: ${OUT}`);
  if (!verdict.pass) {
    console.error('FAIL:', JSON.stringify(verdict.failures, null, 2));
    process.exitCode = 1;
  } else {
    console.log('PASS: bloom slider visibly attenuates both post paths, and zero/off match.');
  }
} finally {
  try { if (browser) await browser.close(); } catch (_) {}
  try { if (serverChild) serverChild.kill(); } catch (_) {}
}

async function captureCase(page, c) {
  await page.evaluate((next) => {
    const sf = window.SF;
    const video = sf.state.settings.video;
    video.renderGraph = next.renderGraph;
    video.bloom = next.bloom;
    video.bloomStrength = next.bloomStrength;
    video.bloomThreshold = 0.72;
    video.energyMaterials = true;
    sf.bus.emit('settings:changed', { section: 'video', key: null });
  }, c);
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForTimeout(250);
  const shotPath = `${SHOT_DIR}/${c.name}.png`;
  const buffer = await page.screenshot({ path: shotPath, fullPage: false });
  const image = imageStats(buffer);
  const diag = await page.evaluate(() => {
    const sf = window.SF;
    const render = sf.registry && sf.registry.get && sf.registry.get('render');
    const post = render && render.diag && typeof render.diag.post === 'function'
      ? render.diag.post()
      : (render && render._getPostDiagnostics ? render._getPostDiagnostics() : null);
    return {
      video: { ...sf.state.settings.video },
      post,
      renderGraphOptions: sf.state.render.renderGraph ? { ...sf.state.render.renderGraph.options } : null,
    };
  });
  return {
    ...c,
    shotPath: resolve(shotPath),
    image,
    post: diag.post,
    video: diag.video,
    renderGraphOptions: diag.renderGraphOptions,
  };
}

function imageStats(buffer) {
  const png = PNG.sync.read(buffer);
  let sum = 0;
  let max = 0;
  let bright = 0;
  const pixels = png.width * png.height;
  for (let i = 0; i < png.data.length; i += 4) {
    const r = png.data[i];
    const g = png.data[i + 1];
    const b = png.data[i + 2];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    sum += l;
    if (l > max) max = l;
    if (l > 220) bright++;
  }
  return {
    width: png.width,
    height: png.height,
    mean: sum / pixels,
    max,
    brightFraction: bright / pixels,
  };
}

function compareImages(a, b) {
  if (!a || !b) return null;
  const ap = PNG.sync.read(Buffer.from(requireBuffer(a.shotPath)));
  const bp = PNG.sync.read(Buffer.from(requireBuffer(b.shotPath)));
  if (ap.width !== bp.width || ap.height !== bp.height) return { error: 'size mismatch' };
  let total = 0;
  let max = 0;
  const pixels = ap.width * ap.height;
  for (let i = 0; i < ap.data.length; i += 4) {
    const d = Math.abs(ap.data[i] - bp.data[i])
      + Math.abs(ap.data[i + 1] - bp.data[i + 1])
      + Math.abs(ap.data[i + 2] - bp.data[i + 2]);
    total += d / 3;
    if (d / 3 > max) max = d / 3;
  }
  return { meanAbsDiff: total / pixels, maxAbsDiff: max };
}

function evaluateVerdict(report) {
  const failures = [];
  const cmp = report.comparisons || {};
  const get = (name) => cmp[name] && Number(cmp[name].meanAbsDiff);
  if (!(get('wrapper_1_vs_0_1') >= 10)) failures.push({ check: 'wrapper slider response', value: get('wrapper_1_vs_0_1') });
  if (!(get('graph_1_vs_0_1') >= 10)) failures.push({ check: 'render graph slider response', value: get('graph_1_vs_0_1') });
  if (!(get('wrapper_0_vs_off') <= 5)) failures.push({ check: 'wrapper zero matches off', value: get('wrapper_0_vs_off') });
  if (!(get('graph_0_vs_off') <= 5)) failures.push({ check: 'render graph zero matches off', value: get('graph_0_vs_off') });
  const graphOff = report.captures.find((c) => c.name === 'graph_bloom_off');
  const graphLow = report.captures.find((c) => c.name === 'graph_strength_0_1');
  const wrapperLow = report.captures.find((c) => c.name === 'wrapper_strength_0_1');
  if (graphOff && graphOff.post && graphOff.post.renderGraphDetails && graphOff.post.renderGraphDetails.effectiveBloomStrength !== 0) {
    failures.push({ check: 'render graph bloom off effective strength', value: graphOff.post.renderGraphDetails.effectiveBloomStrength });
  }
  if (!(graphLow && graphLow.post && graphLow.post.renderGraphDetails && graphLow.post.renderGraphDetails.postStyleScale < 1)) {
    failures.push({ check: 'render graph low post style scale', value: graphLow && graphLow.post && graphLow.post.renderGraphDetails });
  }
  if (!(wrapperLow && wrapperLow.post && wrapperLow.post.bloom && wrapperLow.post.bloom.postStyleScale < 1)) {
    failures.push({ check: 'wrapper low post style scale', value: wrapperLow && wrapperLow.post && wrapperLow.post.bloom });
  }
  const energy = report.energy || {};
  if (!(energy.default && energy.default.active)) failures.push({ check: 'energy plume active at default', value: energy.default });
  if (!(energy.low && energy.default && energy.low.coreIntensity < energy.default.coreIntensity * 0.5)) {
    failures.push({ check: 'energy plume low strength attenuates', value: energy });
  }
  if (!(energy.zero && energy.zero.active === false)) failures.push({ check: 'energy plume disabled at zero', value: energy.zero });
  const uiSlider = report.uiSlider || {};
  if (!(uiSlider.found === true)) failures.push({ check: 'settings bloom strength slider found', value: uiSlider });
  if (!(uiSlider.stateBloomStrength === 0.14)) failures.push({ check: 'settings slider writes bloomStrength', value: uiSlider });
  if (!(uiSlider.postBloomStrength === 0.14 || uiSlider.renderGraphBloomStrength === 0.14)) {
    failures.push({ check: 'settings slider reaches renderer diagnostics', value: uiSlider });
  }
  return { pass: failures.length === 0, failures };
}

async function probeSettingsSlider(page) {
  const result = await page.evaluate(async () => {
    const sf = window.SF;
    const ui = sf.registry && sf.registry.get && sf.registry.get('ui');
    const sm = ui && ui.screenManager;
    if (!sm) return { found: false, reason: 'screen manager missing' };
    const waitFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    for (let i = 0; i < 60 && !sm.hasScreen('settings'); i++) await waitFrame();
    if (!sm.hasScreen('settings')) return { found: false, reason: 'settings screen not registered' };
    sm.closeAll();
    sm.pushScreen('settings');
    const settingsScreen = document.querySelector('.screen[data-screen="settings"]');
    if (!settingsScreen) return { found: false, reason: 'settings screen not mounted' };
    const videoButton = Array.from(settingsScreen.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === 'Video');
    if (videoButton) videoButton.click();
    await waitFrame();
    const row = Array.from(settingsScreen.querySelectorAll('.sf-row')).find((el) => {
      const label = el.querySelector('label');
      return label && (label.textContent || '').trim() === 'Bloom strength';
    });
    const slider = row && row.querySelector('input[type="range"]');
    if (!slider) return { found: false, reason: 'bloom strength range missing' };
    sf.state.settings.video.renderGraph = false;
    sf.state.settings.video.bloom = true;
    slider.value = '0.14';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    await waitFrame();
    await waitFrame();
    const render = sf.registry && sf.registry.get && sf.registry.get('render');
    const post = render && render.diag && typeof render.diag.post === 'function'
      ? render.diag.post()
      : (render && render._getPostDiagnostics ? render._getPostDiagnostics() : null);
    sm.closeAll();
    return {
      found: true,
      sliderValue: Number(slider.value),
      stateBloomStrength: sf.state.settings.video.bloomStrength,
      postBloomStrength: post && post.bloom && post.bloom.strength,
      renderGraphBloomStrength: post && post.renderGraphDetails && post.renderGraphDetails.bloomStrength,
      activePath: post && post.activePath,
    };
  });
  console.log(`ui-slider: found=${result.found} state=${result.stateBloomStrength} post=${result.postBloomStrength ?? result.renderGraphBloomStrength ?? 'n/a'}`);
  return result;
}

async function probeEnergyRadiance(page) {
  const sample = async (bloomStrength, moveZ = 1) => {
    await page.evaluate(({ bloomStrength: strength, moveZ: z }) => {
      const sf = window.SF;
      const video = sf.state.settings.video;
      video.renderGraph = false;
      video.bloom = true;
      video.bloomStrength = strength;
      video.energyMaterials = true;
      if (window.__SF_BLOOM_PROBE_DRIVE__) clearInterval(window.__SF_BLOOM_PROBE_DRIVE__);
      const applyDrive = () => {
        const state = sf.state;
        const player = state.entities && state.entities.get(state.playerId);
        if (state.input) state.input.moveZ = z;
        if (player) {
          player._flightFrame = {
            ...(player._flightFrame || {}),
            throttle: z,
            commandedThrottle: z,
            forwardSpeed: z > 0 ? 90 : 0,
            maxSpeed: 140,
          };
        }
      };
      applyDrive();
      window.__SF_BLOOM_PROBE_DRIVE__ = setInterval(applyDrive, 16);
      sf.bus.emit('settings:changed', { section: 'video', key: null });
    }, { bloomStrength, moveZ });
    await page.waitForTimeout(900);
    return page.evaluate(() => {
      const sf = window.SF;
      const vfx = sf.registry && sf.registry.get && sf.registry.get('vfx');
      const energy = vfx && vfx._energy;
      const plume = energy && energy.plumes && energy.plumes.find((p) => p && p.visible) || energy && energy.plume;
      const core = plume && plume.userData && plume.userData.energyCore;
      const halo = plume && plume.userData && plume.userData.energyHalo;
      return {
        active: !!(energy && plume && plume.visible && plume.parent),
        coreIntensity: core && core.material && core.material.uniforms && core.material.uniforms.uIntensity
          ? core.material.uniforms.uIntensity.value
          : 0,
        coreOpacity: core && core.material && core.material.uniforms && core.material.uniforms.uOpacity
          ? core.material.uniforms.uOpacity.value
          : 0,
        haloIntensity: halo && halo.material && halo.material.uniforms && halo.material.uniforms.uIntensity
          ? halo.material.uniforms.uIntensity.value
          : 0,
        scale: vfx && typeof vfx._bloomRadianceScale === 'function' ? vfx._bloomRadianceScale() : null,
      };
    });
  };
  const defaultSample = await sample(0.35);
  const lowSample = await sample(0.1);
  const zeroSample = await sample(0);
  await page.evaluate(() => {
    if (window.__SF_BLOOM_PROBE_DRIVE__) clearInterval(window.__SF_BLOOM_PROBE_DRIVE__);
    window.__SF_BLOOM_PROBE_DRIVE__ = null;
    if (window.SF && window.SF.state && window.SF.state.input) window.SF.state.input.moveZ = 0;
  });
  console.log(`energy: default=${defaultSample.coreIntensity.toFixed(3)} low=${lowSample.coreIntensity.toFixed(3)} zeroActive=${zeroSample.active}`);
  return { default: defaultSample, low: lowSample, zero: zeroSample };
}

function requireBuffer(path) {
  return readFileSync(path);
}

async function findFreePort(start) {
  const { createServer } = await import('node:net');
  for (let p = start; p < start + 200; p++) {
    const ok = await new Promise((resolve) => {
      const server = createServer();
      server.once('error', () => resolve(false));
      server.listen(p, '127.0.0.1', () => server.close(() => resolve(true)));
    });
    if (ok) return p;
  }
  throw new Error('no free port');
}

async function waitReachable(url) {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch (_) {}
    await sleep(150);
  }
  throw new Error(`server never reachable: ${url}`);
}
