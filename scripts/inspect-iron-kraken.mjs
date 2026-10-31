#!/usr/bin/env node
// Focused native-model evidence. This is deliberately not a full-route playtest or FPS gate.
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { createGameServer } = require('./lib/gameServer.cjs');
const args = process.argv.slice(2);
const value = name => args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
const output = resolve(ROOT, value('--out') || '.devshots/iron-kraken');
if (!output.startsWith(`${resolve(ROOT, '.devshots')}/`)) throw new Error('Capture output must be inside .devshots/');
const videoEnabled = !args.includes('--no-video');
const executablePath = value('--executable') || process.env.SF_CHROMIUM;
const shots = [
  { name: '01-heavy-inspect', title: 'articulated salvage machine', variant: 'heavy', view: 'inspect' },
  { name: '02-heavy-front', title: 'mantle and optical face', variant: 'heavy', view: 'front', inspection: true },
  { name: '03-heavy-top-rake', title: 'arm rake windup', variant: 'heavy', view: 'top', beatId: 'arm_rake', phase: 'tell', progress: 0.8 },
  { name: '04-heavy-jet', title: 'committed siphon jet', variant: 'heavy', view: 'gameplay', beatId: 'siphon_jet', phase: 'active', progress: 0.45, warnings: true },
  { name: '05-heavy-recovery', title: 'open mantle recovery', variant: 'heavy', view: 'front', beatId: 'siphon_jet', phase: 'recovery', progress: 0.4 },
  { name: '06-colossus-scale', title: 'colossus / player size comparison', variant: 'colossus', view: 'gameplay', scaleReference: true },
  { name: '07-reduced-motion', title: 'recovery with reduced motion', variant: 'heavy', view: 'inspect', beatId: 'siphon_jet', phase: 'recovery', progress: 0.4, reducedMotion: true },
  { name: '08-heavy-ink-ring', title: 'broken ink ring / clear approach gaps', variant: 'heavy', view: 'gameplay', beatId: 'ink_ring', phase: 'active', progress: 0.45, warnings: true },
];
const errors = [];
let browser, server;
const report = { kind: 'iron-kraken-native-diagnostic', acceptance: 'not-a-full-route-playtest',
  createdAt: new Date().toISOString(), captures: [], checks: null, errors };
try { report.commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); }
catch { report.commit = null; }
await mkdir(output, { recursive: true });

function observe(page) {
  page.on('pageerror', error => errors.push({ kind: 'pageerror', message: error.message }));
  page.on('console', message => { if (message.type() === 'error') errors.push({ kind: 'console', message: message.text() }); });
  page.on('requestfailed', request => errors.push({ kind: 'requestfailed', url: request.url(), message: request.failure()?.errorText }));
  page.on('response', response => { if (response.status() >= 400) errors.push({ kind: 'http', status: response.status(), url: response.url() }); });
}

async function openFixture(context, url) {
  const page = await context.newPage();
  observe(page);
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => window.ironKrakenReady === true, null, { timeout: 120000 });
  return page;
}

async function contactSheet(page, sources) {
  return page.evaluate(async images => {
    const columns = 3, tileWidth = 480, tileHeight = 337;
    const rows = Math.ceil(images.length / columns);
    const canvas = document.createElement('canvas');
    canvas.width = columns * tileWidth;
    canvas.height = rows * tileHeight + 86;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#080d16'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#edf2fb'; ctx.font = '600 25px system-ui';
    ctx.fillText('IRON KRAKEN · native model diagnostic', 22, 35);
    ctx.fillStyle = '#93a5be'; ctx.font = '14px system-ui';
    ctx.fillText('Production rig + score poses · Helios lighting · no post effects · scale marker uses the Hitch collision diameter', 22, 62);
    for (let i = 0; i < images.length; i++) {
      const loaded = await new Promise((resolve, reject) => {
        const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = images[i].data;
      });
      const x = i % columns * tileWidth, y = Math.floor(i / columns) * tileHeight + 86;
      ctx.drawImage(loaded, x + 5, y + 5, tileWidth - 10, 294);
      ctx.fillStyle = '#d9e3f0'; ctx.font = '13px system-ui';
      ctx.fillText(images[i].label, x + 14, y + 322);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }, sources);
}

try {
  server = createGameServer({ root: ROOT, devDiagnostics: false });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const url = `http://127.0.0.1:${server.address().port}/test/fixtures/iron-kraken.html`;
  const { chromium } = await loadPlaywright();
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await openFixture(context, url);
  report.runtime = await page.evaluate(() => window.ironKrakenProbe.runtime());
  const images = [];
  for (const shot of shots) {
    const capture = await page.evaluate(spec => window.ironKrakenProbe.capture(spec), shot);
    const buffer = await page.screenshot({ path: join(output, `${shot.name}.png`) });
    capture.file = `${shot.name}.png`;
    report.captures.push(capture);
    images.push({ data: `data:image/png;base64,${buffer.toString('base64')}`, label: `${shot.title} · ${capture.render.calls} calls / ${capture.render.triangles} triangles` });
    console.log(`${shot.name}: ${capture.render.calls} calls; ${capture.render.triangles} triangles; pose ${capture.poseHash}`);
  }
  const breakup = await page.evaluate(() => window.ironKrakenProbe.captureBreakup());
  const breakupBuffer = await page.screenshot({ path: join(output, `${breakup.name}.png`) });
  breakup.file = `${breakup.name}.png`;
  report.captures.push(breakup);
  images.push({ data: `data:image/png;base64,${breakupBuffer.toString('base64')}`,
    label: `mechanical breakup · ${breakup.render.calls} calls / ${breakup.diagnostics.active} fragments` });
  report.checks = await page.evaluate(() => window.ironKrakenProbe.checks());
  const sheet = await contactSheet(page, images);
  await writeFile(join(output, 'contact-sheet.png'), Buffer.from(sheet, 'base64'));
  await page.evaluate(() => window.ironKrakenProbe.dispose());
  await context.close();
  if (videoEnabled) {
    const videoContext = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
      recordVideo: { dir: output, size: { width: 1280, height: 800 } } });
    const videoPage = await openFixture(videoContext, url);
    const video = videoPage.video();
    report.motion = await videoPage.evaluate(() => window.ironKrakenProbe.animate(12));
    await videoContext.close();
    await rename(await video.path(), join(output, 'score-motion.webm'));
    report.motion.file = 'score-motion.webm';
  }
  if (errors.length) throw new Error(`${errors.length} browser error(s); see report.json`);
  report.result = 'captured';
  console.log(`Native render evidence: ${relative(ROOT, output)}`);
} catch (error) {
  report.result = 'failed';
  report.failure = error.stack || String(error);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(error => { errors.push({ kind: 'cleanup', message: String(error) }); });
  if (server) await new Promise(resolve => server.close(resolve));
  await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
}
