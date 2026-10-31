#!/usr/bin/env node
// Focused native-model evidence. This is deliberately not a full-route playtest or FPS gate.
// Fast art loop: --no-video --skip-checks --shots=11-studio-reference,12-studio-fullbody,13-production-reference
// Compare an unchanged supplied frame: --reference-image=/absolute/path/frame.png
// Smooth fixed-tick movie (requires ffmpeg): --shots=none --skip-checks --motion-lighting=studio --motion-view=reference
// A standalone Chrome/Headless Shell can be supplied through --executable=/absolute/path/chrome.
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
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
const checksEnabled = !args.includes('--skip-checks');
const executablePath = value('--executable') || process.env.SF_CHROMIUM;
const requestedShots = value('--shots')?.split(',').filter(Boolean);
const motionSeconds = Number(value('--motion-seconds') || 12);
const motionFps = Number(value('--motion-fps') || 30);
if (!(motionSeconds >= 1 && motionSeconds <= 60)) throw new Error('--motion-seconds must be in 1..60');
if (![15, 30, 60].includes(motionFps)) throw new Error('--motion-fps must be 15, 30 or 60');
const motionSpec = { lighting: value('--motion-lighting') || 'production', view: value('--motion-view') || 'inspect' };
const allShots = [
  { name: '01-heavy-inspect', title: 'articulated salvage machine', variant: 'heavy', view: 'inspect' },
  { name: '02-heavy-front', title: 'mantle and optical face', variant: 'heavy', view: 'front', inspection: true },
  { name: '03-heavy-top-rake', title: 'arm rake windup', variant: 'heavy', view: 'top', beatId: 'arm_rake', phase: 'tell', progress: 0.8 },
  { name: '04-heavy-jet', title: 'committed siphon jet', variant: 'heavy', view: 'gameplay', beatId: 'siphon_jet', phase: 'active', progress: 0.45, warnings: true },
  { name: '05-heavy-recovery', title: 'open mantle recovery', variant: 'heavy', view: 'front', beatId: 'siphon_jet', phase: 'recovery', progress: 0.4 },
  { name: '06-colossus-scale', title: 'colossus / player size comparison', variant: 'colossus', view: 'gameplay', scaleReference: true },
  { name: '07-reduced-motion', title: 'recovery with reduced motion', variant: 'heavy', view: 'inspect', beatId: 'siphon_jet', phase: 'recovery', progress: 0.4, reducedMotion: true },
  { name: '08-heavy-ink-ring', title: 'broken ink ring / clear approach gaps', variant: 'heavy', view: 'gameplay', beatId: 'ink_ring', phase: 'active', progress: 0.45, warnings: true },
  { name: '11-studio-reference', title: 'reference three-quarter / fixed close camera', variant: 'heavy', view: 'reference', lighting: 'studio' },
  { name: '12-studio-fullbody', title: 'full body / neutral studio', variant: 'heavy', view: 'inspect', lighting: 'studio' },
  { name: '13-production-reference', title: 'same model and close camera / Helios', variant: 'heavy', view: 'reference', lighting: 'production' },
  { name: '14-studio-recovery', title: 'open mantle / same reference camera', variant: 'heavy', view: 'reference', lighting: 'studio', beatId: 'siphon_jet', phase: 'recovery', progress: 0.4 },
  { name: '15-distant-detail', title: 'distant arm detail / 110 px head', variant: 'heavy', view: 'detail', lighting: 'studio', headDiameterPx: 110 },
];
const allowedShots = [...allShots.map(shot => shot.name), '09-mechanical-breakup', '10-persistent-wreck', 'none'];
if (requestedShots?.some(name => !allowedShots.includes(name))) throw new Error(`Unknown --shots name. Choose: ${allowedShots.join(', ')}`);
const selected = name => !requestedShots || requestedShots.includes(name);
const shots = allShots.filter(shot => selected(shot.name));
const errors = [];
let browser, server;
const report = { kind: 'iron-kraken-native-diagnostic', acceptance: 'not-a-full-route-playtest',
  createdAt: new Date().toISOString(), captures: [], checks: null, errors };
try { report.commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); }
catch { report.commit = null; }
await mkdir(output, { recursive: true });

async function sourceIdentity() {
  const paths = (await readdir(join(ROOT, 'src/render'))).filter(name => /^ironKraken.*\.js$/.test(name)).map(name => `src/render/${name}`);
  paths.push('scripts/inspect-iron-kraken.mjs', 'test/fixtures/iron-kraken-native.mjs', 'test/fixtures/iron-kraken.html',
    'src/render/partsLibrary.js', 'src/render/visualFactory.js', 'src/render/visualOverrides.js');
  const files = {};
  for (const path of paths.sort()) files[path] = createHash('sha256').update(await readFile(join(ROOT, path))).digest('hex');
  return files;
}
report.sourceBefore = await sourceIdentity();

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
    ctx.fillText('Same production rig + materials · Helios and labelled neutral-studio views · no post effects · stationary diagnostic', 22, 62);
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

async function compareReference(page, referencePath, captureBuffer) {
  const reference = await readFile(resolve(referencePath));
  const mime = /\.jpe?g$/i.test(referencePath) ? 'image/jpeg' : 'image/png';
  return page.evaluate(async ({ reference, native }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920; canvas.height = 720;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f3f0e9'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const draw = async (source, x, label) => {
      const image = await new Promise((resolve, reject) => {
        const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = source;
      });
      const scale = Math.min(940 / image.width, 620 / image.height);
      ctx.drawImage(image, x + (960 - image.width * scale) / 2, 70 + (620 - image.height * scale) / 2,
        image.width * scale, image.height * scale);
      ctx.fillStyle = '#252626'; ctx.font = '600 24px system-ui'; ctx.fillText(label, x + 24, 39);
    };
    await draw(reference, 0, 'Supplied reference · complete frame');
    await draw(native, 960, 'Native production model · neutral studio');
    return canvas.toDataURL('image/png').split(',')[1];
  }, { reference: `data:${mime};base64,${reference.toString('base64')}`,
    native: `data:image/png;base64,${captureBuffer.toString('base64')}` });
}

async function captureFixedMovie(page) {
  const warmup = await page.evaluate(spec => window.ironKrakenProbe.prepareMotion(spec), motionSpec);
  const file = 'score-motion.webm';
  const encoder = spawn(value('--ffmpeg') || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'image2pipe', '-vcodec', 'png', '-framerate', String(motionFps), '-i', 'pipe:0', '-an',
    '-c:v', 'libvpx-vp9', '-row-mt', '1', '-deadline', 'realtime', '-cpu-used', '4', '-crf', '24', '-b:v', '0',
    '-pix_fmt', 'yuv420p', join(output, file)], { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  encoder.stderr.on('data', data => { stderr = `${stderr}${data}`.slice(-8000); });
  encoder.stdin.on('error', () => {}); // The write callback/encoder completion reports this failure.
  const encoded = new Promise((resolve, reject) => {
    encoder.once('error', reject);
    encoder.once('close', code => code === 0 ? resolve() : reject(new Error(`Fixed-frame video encoder exited ${code}: ${stderr}`)));
  });
  encoded.catch(() => {}); // Preserve the error while a browser frame/write is still in flight.
  let lastFrame = null;
  const frames = Math.round(motionSeconds * motionFps);
  try {
    for (let i = 0; i < frames; i++) {
      const pixels = await page.evaluate(ticks => window.ironKrakenProbe.motionPixels(ticks), i === 0 ? 0 : 60 / motionFps);
      lastFrame = pixels.frame;
      const buffer = Buffer.from(pixels.png, 'base64');
      await new Promise((resolve, reject) => encoder.stdin.write(buffer, error => error ? reject(error) : resolve()));
    }
    encoder.stdin.end();
    await encoded;
    await page.evaluate(() => window.ironKrakenProbe.finishMotion());
  } catch (error) {
    encoder.kill();
    throw error;
  }
  return { file, seconds: frames / motionFps, frames, fps: motionFps, ticksPerFrame: 60 / motionFps,
    ...warmup, ...lastFrame, timing: 'offline native WebGL frames; fixed simulation ticks; constant-rate encoded playback; no hardware FPS claim' };
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
  let referenceCapture = null;
  for (const shot of shots) {
    const capture = await page.evaluate(spec => window.ironKrakenProbe.capture(spec), shot);
    const buffer = await page.screenshot({ path: join(output, `${shot.name}.png`) });
    capture.file = `${shot.name}.png`;
    report.captures.push(capture);
    if (shot.name === '11-studio-reference') referenceCapture = buffer;
    images.push({ data: `data:image/png;base64,${buffer.toString('base64')}`, label: `${shot.title} · ${capture.render.calls} calls / ${capture.render.triangles} triangles` });
    console.log(`${shot.name}: ${capture.render.calls} calls; ${capture.render.triangles} triangles; pose ${capture.poseHash}`);
  }
  if (selected('09-mechanical-breakup')) {
    const breakup = await page.evaluate(() => window.ironKrakenProbe.captureBreakup());
    const breakupBuffer = await page.screenshot({ path: join(output, `${breakup.name}.png`) });
    breakup.file = `${breakup.name}.png`;
    report.captures.push(breakup);
    images.push({ data: `data:image/png;base64,${breakupBuffer.toString('base64')}`,
      label: `mechanical breakup · ${breakup.render.calls} calls / ${breakup.diagnostics.active} fragments` });
  }
  if (selected('10-persistent-wreck')) {
    const wreck = await page.evaluate(() => window.ironKrakenProbe.captureWreck());
    const wreckBuffer = await page.screenshot({ path: join(output, `${wreck.name}.png`) });
    wreck.file = `${wreck.name}.png`;
    report.captures.push(wreck);
    images.push({ data: `data:image/png;base64,${wreckBuffer.toString('base64')}`,
      label: `persistent mechanical wreck · ${wreck.render.calls} calls / ${wreck.render.triangles} triangles` });
  }
  report.lodChecks = checksEnabled ? await page.evaluate(() => window.ironKrakenProbe.lodChecks()) : { skipped: true, reason: '--skip-checks diagnostic iteration' };
  report.checks = checksEnabled ? await page.evaluate(() => window.ironKrakenProbe.checks()) : { skipped: true, reason: '--skip-checks diagnostic iteration' };
  if (images.length) {
    const sheet = await contactSheet(page, images);
    await writeFile(join(output, 'contact-sheet.png'), Buffer.from(sheet, 'base64'));
  }
  if (value('--reference-image') && referenceCapture) {
    const sheet = await compareReference(page, value('--reference-image'), referenceCapture);
    await writeFile(join(output, 'reference-comparison.png'), Buffer.from(sheet, 'base64'));
    report.referenceComparison = { file: 'reference-comparison.png', reference: value('--reference-image'), native: '11-studio-reference.png',
      note: 'Both complete images are letterboxed without cropping or model substitutions; camera match is a visual approximation.' };
  }
  const studio = report.captures.find(row => row.name === '11-studio-reference');
  const production = report.captures.find(row => row.name === '13-production-reference');
  if (studio && production) report.referenceLightingParity = { samePose: studio.poseHash === production.poseHash,
    sameCamera: JSON.stringify(studio.camera) === JSON.stringify(production.camera), studioPose: studio.poseHash, productionPose: production.poseHash };
  const recovery = report.captures.find(row => row.name === '14-studio-recovery');
  if (studio && recovery) report.referenceRecoveryComparison = {
    sameCamera: JSON.stringify(studio.camera) === JSON.stringify(recovery.camera),
    sameVariant: studio.variant === recovery.variant, closedTick: studio.tick, recoveryTick: recovery.tick,
    recoveryPhase: recovery.phase, recoveryBeat: recovery.beatId,
  };
  if (videoEnabled) {
    report.motion = await captureFixedMovie(page);
  }
  await page.evaluate(() => window.ironKrakenProbe.dispose());
  await context.close();
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
  report.sourceAfter = await sourceIdentity();
  report.sourceStable = JSON.stringify(report.sourceBefore) === JSON.stringify(report.sourceAfter);
  await writeFile(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
}
