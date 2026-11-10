#!/usr/bin/env node
/** Actual compositor pixels while the page's JavaScript thread is blocked.
 * A worker heartbeat, rVFC callback count, or screenshot taken AFTER the stall
 * cannot establish this. CDP screencast timestamps must fall INSIDE the block.
 * This is a loading-surface regression fixture, not a full-game GPU benchmark.
 */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const args = process.argv.slice(2);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outIndex = args.indexOf('--out');
const out = resolve(outIndex < 0 ? '.devshots/boot-media' : args[outIndex + 1]);
const local = args.includes('--local-bytes');
const skipBaseline = args.includes('--skip-live-baseline');
const originalOnly = args.includes('--original-only');
const { chromium } = await import(process.env.BOOT_PLAYWRIGHT
  ? pathToFileURL(process.env.BOOT_PLAYWRIGHT).href : 'playwright-core');
const port = Number(process.env.BOOT_PROOF_PORT || 8128);
const url = process.env.BOOT_PROOF_URL || `http://127.0.0.1:${port}/tools/cinematic/boot-media-proof.html`;
const report = { scope: 'Real media, presenter, event bus and ring; fixture render-frame gate. Not a full-game boot benchmark.',
  transport: local ? 'Local source/media bytes injected via Playwright; no network request or browser-policy change.' : 'HTTP byte-range server',
  browser: '', checks: [], captures: {}, baselineSkipped: skipBaseline, originalOnly };
let server, browser;
const check = (name, ok, detail = null) => {
  report.checks.push({ name, pass: !!ok, detail }); assert.ok(ok, `${name}: ${JSON.stringify(detail)}`);
};
const exists = path => access(path).then(() => true, () => false);
const moduleCache = new Map();
async function moduleURL(path) {
  path = resolve(path);
  if (moduleCache.has(path)) return moduleCache.get(path);
  let source = await readFile(path, 'utf8');
  const re = /((?:from\s*|import\()['"])([^'"]+)(['"]\)?)/g;
  const matches = [...source.matchAll(re)];
  for (const m of matches.reverse()) {
    if (!m[2].startsWith('.')) continue;
    const replacement = m[1] + await moduleURL(resolve(dirname(path), m[2])) + m[3];
    source = source.slice(0, m.index) + replacement + source.slice(m.index + m[0].length);
  }
  const result = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  moduleCache.set(path, result); return result;
}
async function localPage(page, query) {
  let html = await readFile(resolve(root, 'tools/cinematic/boot-media-proof.html'), 'utf8');
  html = html.replace('<base href="/">', '');
  for (const match of [...html.matchAll(/<link rel="stylesheet" href="\/([^"]+)">/g)]) {
    html = html.replace(match[0], `<style>${await readFile(resolve(root, match[1]), 'utf8')}</style>`);
  }
  for (const match of [...html.matchAll(/((?:from\s*|import\()['"])\/([^'"]+)(['"]\)?)/g)]) {
    html = html.replace(match[0], match[1] + await moduleURL(resolve(root, match[2])) + match[3]);
  }
  html = html.replace('new URLSearchParams(location.search)', `new URLSearchParams(${JSON.stringify(query)})`);
  await page.goto('about:blank');
  const sources = {}, blobs = new Map();
  for (const [key, name] of Object.entries({ normal: 'boot-visualizer.mp4', quiet: 'boot-visualizer-quiet.mp4', original: 'intro-visualizer.mp4', poster: 'boot-visualizer.jpg' })) {
    let path = resolve(root, 'assets/cinematics', name);
    if (originalOnly) path = resolve(root, 'assets/cinematics', key === 'poster' ? 'intro-visualizer.jpg' : 'intro-visualizer.mp4');
    if (!blobs.has(path)) {
      const encoded = (await readFile(path)).toString('base64');
      const type = key === 'poster' ? 'image/jpeg' : 'video/mp4';
      blobs.set(path, await page.evaluate(([data, type]) => {
        const text = atob(data), bytes = new Uint8Array(text.length);
        for (let i = 0; i < bytes.length; i++) bytes[i] = text.charCodeAt(i);
        return URL.createObjectURL(new Blob([bytes], { type }));
      }, [encoded, type]));
    }
    sources[key] = blobs.get(path);
  }
  // Query semantics stay identical to the HTTP fixture.
  if (query.includes('original')) sources.normal = sources.original;
  await page.evaluate(s => { window.__localMedia = s; }, sources);
  html = html.replace('sources,timeoutMs:2500', 'sources:window.__localMedia,timeoutMs:2500');
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.boot-ring__emblem', { state: 'attached' });
  const emblem = resolve(root, 'assets/ui/generated/emblem/emblem.thumb.webp');
  if (await exists(emblem)) await page.locator('.boot-ring__emblem').evaluate((el, href) => el.setAttribute('href', href),
    `data:image/webp;base64,${(await readFile(emblem)).toString('base64')}`);
}
async function open(page, query = '') {
  if (local) await localPage(page, query); else await page.goto(url + query, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__bootMediaProof?.ready, null, { timeout: 15000 });
  check(`page identity ${query}`, (await page.title()).includes('SpaceFace boot media regression'));
  check(`nonblank loading surface ${query}`, await page.locator('.boot-instrument').count() === 1);
}
async function captureBlock(page, name) {
  await page.waitForFunction(() => __bootMediaProof.visual.inspect().status === 'video');
  if (name === 'live-baseline') await page.waitForFunction(() => __bootMediaProof.baseline?.inspect().frameCount > 3);
  await page.waitForTimeout(600);
  const session = await page.context().newCDPSession(page), frames = [];
  session.on('Page.screencastFrame', event => {
    frames.push(event);
    void session.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
  });
  await session.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 960, maxHeight: 540, everyNthFrame: 1 });
  await page.evaluate(() => __bootMediaProof.block(5000));
  await new Promise(resolve => setTimeout(resolve, 6100));
  await session.send('Page.stopScreencast');
  const block = await page.evaluate(() => window.__blocked);
  const during = frames.filter(f => f.metadata.timestamp * 1000 > block.start + 150 && f.metadata.timestamp * 1000 < block.end - 150);
  const analysis = await page.evaluate(async images => {
    const canvas = document.createElement('canvas'); canvas.width = 960; canvas.height = 540;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let prior = null; const deltas = [];
    for (const data of images) {
      const image = new Image(); image.src = 'data:image/jpeg;base64,' + data; await image.decode();
      ctx.clearRect(0, 0, 960, 540); ctx.drawImage(image, 0, 0, 960, 540);
      // Artwork only: exclude upper telemetry and all bottom-center progress chrome.
      const pixels = ctx.getImageData(96, 54, 768, 180).data;
      if (prior) {
        let delta = 0, n = 0;
        for (let i = 0; i < pixels.length; i += 16) {
          delta += Math.abs(pixels[i] - prior[i]) + Math.abs(pixels[i + 1] - prior[i + 1]) + Math.abs(pixels[i + 2] - prior[i + 2]); n += 3;
        }
        deltas.push(delta / n);
      }
      prior = pixels;
    }
    return { deltas, visiblyChanged: deltas.filter(d => d > .1).length };
  }, during.map(f => f.data));
  const changedTimes = during.filter((_f, i) => i > 0 && analysis.deltas[i - 1] > .1).map(f => f.metadata.timestamp * 1000);
  const gaps = changedTimes.slice(1).map((t, i) => t - changedTimes[i]);
  const result = { block, frameTimesMs: during.map(f => f.metadata.timestamp * 1000), capturedDuringBlock: during.length, ...analysis, maxChangingFrameGapMs: Math.max(0, ...gaps) };
  await mkdir(resolve(out, name), { recursive: true });
  for (let i = 0; i < during.length; i++) await writeFile(resolve(out, name, `${String(i).padStart(4, '0')}.jpg`), Buffer.from(during[i].data, 'base64'));
  await writeFile(resolve(out, name, 'capture.json'), JSON.stringify(result, null, 2));
  await page.screenshot({ path: resolve(out, `${name}.png`) });
  report.captures[name] = result;
  if (name !== 'live-baseline') {
    check(`${name}: artwork moves inside five-second JS block`, analysis.visiblyChanged >= 30, { frames: during.length, changed: analysis.visiblyChanged });
    check(`${name}: changing screen frames do not park`, result.maxChangingFrameGapMs < 450, result.maxChangingFrameGapMs);
  }
  await session.detach(); return result;
}
try {
  await mkdir(out, { recursive: true });
  if (!local && !process.env.BOOT_PROOF_URL) {
    server = spawn('python3', ['tools/cinematic/signal-remix-server.py', '--port', String(port)], { cwd: root, stdio: 'ignore' });
    for (let i = 0; ; i++) {
      try { if ((await fetch(url)).ok) break; } catch {}
      if (i >= 100) throw new Error('Media proof server failed to start');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  browser = await chromium.launch({ ...(process.env.BOOT_CHROME_PATH ? { executablePath: process.env.BOOT_CHROME_PATH } : { channel: 'chrome' }),
    headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  report.browser = browser.version();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await open(page, originalOnly ? '?original' : '');
  const native = await captureBlock(page, 'native');
  check('native boot has no optical WebGL overlay', await page.locator('.intro-signal-remix').count() === 0);
  const movie = await page.evaluate(() => {
    const video = document.querySelector('video'), current = video.currentTime;
    for (let i = 0; i < 300; i++) __bootMediaProof.stage(.8);
    return { before: current, after: video.currentTime, owner: __bootMediaProof.visual.inspect() };
  });
  check('300 progress events cannot rewind the movie', movie.after >= movie.before - .01);
  await page.evaluate(() => __bootMediaProof.hide());
  await page.waitForTimeout(80);
  check('hidden loading surface pauses video', await page.locator('video').evaluate(v => v.paused));
  const held = await page.locator('video').evaluate(v => v.currentTime);
  await page.locator('#load').click(); await page.waitForTimeout(300);
  check('Continue resumes instead of restarting', await page.locator('video').evaluate(v => v.currentTime) >= held - .05);
  check('Continue reuses one ring', await page.locator('.boot-instrument').count() === 1);
  await page.evaluate(() => __bootMediaProof.fail()); await page.waitForTimeout(80);
  check('failure pauses media without declaring completion', await page.evaluate(() => document.querySelector('video').paused && !__bootMediaProof.ring.snapshot().complete));
  await page.locator('#load').click(); await page.evaluate(() => __bootMediaProof.finish());
  await page.waitForTimeout(800);
  check('renderer frame handoff completes and pauses loading media', await page.evaluate(() => __bootMediaProof.ring.snapshot().complete && document.querySelector('video').paused));
  check('native lifecycle has no runtime errors', errors.length === 0, errors);
  if (!skipBaseline) {
    await open(page, '?original&live');
    const baseline = await captureBlock(page, 'live-baseline');
    check('comparison isolates the live optical canvas freeze', baseline.visiblyChanged <= 3 && native.visiblyChanged > baseline.visiblyChanged + 25,
      { live: baseline.visiblyChanged, native: native.visiblyChanged });
  }
  await page.close();
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await open(mobile);
  await mobile.waitForTimeout(300);
  check('reduced motion deliberately does not play', await mobile.locator('video').evaluate(v => v.paused));
  check('reduced motion disables poster drift', await mobile.locator('video').evaluate(v => getComputedStyle(v).animationName === 'none'));
  const box = await mobile.locator('.boot-instrument').boundingBox();
  check('mobile instrument stays inside viewport', box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844, box);
  await mobile.screenshot({ path: resolve(out, 'mobile-reduced-motion.png') });
  await mobile.close();
  if (!originalOnly) {
    const quiet = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await open(quiet, '?quiet');
    await quiet.waitForFunction(() => __bootMediaProof.visual.inspect().status === 'video');
    if (!local) check('reduced flash selects its separately baked variant', await quiet.locator('video').evaluate(v => v.currentSrc.includes('boot-visualizer-quiet.mp4')));
    await captureBlock(quiet, 'native-quiet');
    await quiet.close();
  }
} catch (error) {
  report.failure = error.stack || String(error); process.exitCode = 1;
} finally {
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  await browser?.close(); server?.kill();
  console.log(JSON.stringify({ checks: report.checks, captures: Object.fromEntries(Object.entries(report.captures).map(([k, v]) => [k, { capturedDuringBlock: v.capturedDuringBlock, visiblyChanged: v.visiblyChanged, maxChangingFrameGapMs: v.maxChangingFrameGapMs }])), failure: report.failure }, null, 2));
}
