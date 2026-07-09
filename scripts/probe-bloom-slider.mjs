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

  const byName = new Map(captures.map((c) => [c.name, c]));
  const comparisons = {
    wrapper_1_vs_0_1: compareImages(byName.get('wrapper_strength_1'), byName.get('wrapper_strength_0_1')),
    wrapper_0_vs_off: compareImages(byName.get('wrapper_strength_0'), byName.get('wrapper_bloom_off')),
    graph_1_vs_0_1: compareImages(byName.get('graph_strength_1'), byName.get('graph_strength_0_1')),
    graph_0_vs_off: compareImages(byName.get('graph_strength_0'), byName.get('graph_bloom_off')),
  };

  const report = { generatedAt: new Date().toISOString(), port, pageErrors, captures, comparisons };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(report, null, 2));
  console.log(`report: ${OUT}`);
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
