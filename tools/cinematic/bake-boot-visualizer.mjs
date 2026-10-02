#!/usr/bin/env node
/** Bake the EXISTING SIGNAL / OVERPRINT renderer, not a new visual design.
 * Exact offline frames preserve its sculptures, grading and feedback without
 * making the loading page run another WebGL renderer. Never run this at boot.
 * Requires ffmpeg, Chrome and Playwright (BOOT_PLAYWRIGHT may point to its ESM entry).
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, rm, mkdtemp } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(root, 'assets/cinematics');
const temp = await mkdtemp(resolve(tmpdir(), 'sf-boot-bake-'));
const { chromium } = await import(process.env.BOOT_PLAYWRIGHT
  ? pathToFileURL(process.env.BOOT_PLAYWRIGHT).href : 'playwright-core');
const port = Number(process.env.BOOT_BAKE_PORT || 8127);
const server = spawn('python3', ['tools/cinematic/signal-remix-server.py', '--port', String(port)],
  { cwd: root, stdio: 'inherit' });
let browser;
const fps = 24, seconds = 18, width = 1280, height = 720;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const outputs = [];
function encode(args) {
  const result = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
}
try {
  for (let attempt = 0; ; attempt++) {
    try { const response = await fetch(`http://127.0.0.1:${port}/tools/cinematic/signal-remix.html`); if (response.ok) break; }
    catch {}
    if (attempt >= 100) throw new Error('Bake server did not start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  await mkdir(out, { recursive: true });
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: [
    '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ] });
  for (const quiet of [false, true]) {
    const name = quiet ? 'boot-visualizer-quiet' : 'boot-visualizer';
    const frames = resolve(temp, name); await mkdir(frames);
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/tools/cinematic/signal-remix.html?capture&art`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__remixProof?.ready);
    await page.evaluate(quiet => {
      __remixProof.video.pause(); __remixProof.controller.pause();
      __remixProof.controller.preferences({ motion: false, flash: quiet });
    }, quiet);
    for (let i = 0; i < seconds * fps; i++) {
      const data = await page.evaluate(async ({ time, fps }) => {
        const video = __remixProof.video, ctl = __remixProof.controller;
        const source = time * 32 / 18;
        if (Math.abs(video.currentTime - source) > .001) {
          await new Promise((resolve, reject) => {
            const cleanup = () => { clearTimeout(timer); video.removeEventListener('seeked', done); };
            const done = () => { cleanup(); resolve(); };
            const timer = setTimeout(() => { cleanup(); reject(new Error('Bake seek timed out')); }, 10000);
            video.addEventListener('seeked', done); video.currentTime = source;
          });
        }
        if (Math.abs(video.currentTime - source) > .1) throw new Error('Bake source timestamp mismatch');
        if (!ctl.renderAt(time, source, 1 / fps)) throw new Error('Bake compositor failed');
        // Read in the same task: no preserveDrawingBuffer or wall-clock capture assumptions.
        return ctl.canvas.toDataURL('image/png').split(',')[1];
      }, { time: i / fps, fps });
      await writeFile(resolve(frames, `${String(i).padStart(4, '0')}.png`), Buffer.from(data, 'base64'));
      if (i % fps === 0) console.log(`[boot-bake] ${name}: ${i}/${seconds * fps}`);
    }
    assert.deepEqual(errors, [], 'the authored compositor must render without errors');
    const file = `${name}.mp4`;
    // Circular 0.5s dissolve: output starts at source .5 and ends on source .5,
    // rather than hard-cutting the feedback/sculpture clocks back to zero.
    // Bound grain-heavy frames with VBV instead of shrinking or skipping the art.
    // 8 Mbit/s stays within Main@3.1 and avoids a 20-30 Mbit/s loading movie.
    encode(['-framerate', String(fps), '-i', resolve(frames, '%04d.png'),
      '-filter_complex', '[0:v]split=2[a][b];[a]trim=start=0.5,setpts=PTS-STARTPTS[a];[b]trim=end=0.5,setpts=PTS-STARTPTS[b];[a][b]xfade=transition=fade:duration=0.5:offset=17,format=yuv420p[v]',
      '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '22',
      '-maxrate', '8M', '-bufsize', '8M', '-profile:v', 'main', '-level:v', '3.1',
      '-g', '48', '-movflags', '+faststart', resolve(out, file)]);
    const bytes = await readFile(resolve(out, file));
    assert(bytes.length <= 19 * 1024 * 1024, 'loading media exceeded its encoded byte budget');
    outputs.push({ file, bytes: bytes.length, sha256: sha256(bytes), width, height, fps,
      seconds: 17.5, reducedFlash: quiet, maxBitrate: 8000000 });
    await page.close(); await rm(frames, { recursive: true, force: true });
  }
  encode(['-ss', '4', '-i', resolve(out, 'boot-visualizer-quiet.mp4'), '-frames:v', '1', '-q:v', '2', resolve(out, 'boot-visualizer.jpg')]);
  const poster = await readFile(resolve(out, 'boot-visualizer.jpg'));
  outputs.push({ file: 'boot-visualizer.jpg', bytes: poster.length, sha256: sha256(poster) });
  const inputs = {};
  for (const file of ['src/ui/introSignalRemix.js', 'src/ui/loadingSignalTableaux.js',
    'assets/cinematics/intro-visualizer.mp4', 'tools/cinematic/bake-boot-visualizer.mjs']) {
    inputs[file] = sha256(await readFile(resolve(root, file)));
  }
  await writeFile(resolve(out, 'boot-visualizer.manifest.json'), JSON.stringify({
    version: 1, method: 'Exact offline frames from unchanged attachIntroSignalRemix; circular 0.5s dissolve; bounded-bitrate native H.264 playback at runtime.',
    inputs, outputs,
  }, null, 2) + '\n');
  console.log('[boot-bake] complete', outputs);
} finally {
  await browser?.close(); server.kill(); await rm(temp, { recursive: true, force: true });
}
