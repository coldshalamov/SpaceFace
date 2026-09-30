#!/usr/bin/env node
/** Offline review movie from the REAL runtime, with exact frames rather than
 * a low-throughput software-GPU screen recording. Not a shipped replacement.
 */
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const { chromium } = await import(process.env.INTRO_PLAYWRIGHT
  ? pathToFileURL(process.env.INTRO_PLAYWRIGHT).href : 'playwright-core');
const args = process.argv.slice(2), at = args.indexOf('--out');
const out = resolve(at < 0 ? '.devshots/signal-remix' : args[at + 1]);
const frames = resolve(out, 'offline-frames');
await mkdir(frames, { recursive: true });
const fps = 24, seconds = 18;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: [
  '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--autoplay-policy=no-user-gesture-required',
] });
const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  const base = process.env.INTRO_URL || 'http://127.0.0.1:8123/tools/cinematic/signal-remix.html';
  await page.goto(base + '?capture&art', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__remixProof?.ready);
  await page.evaluate(() => { __remixProof.video.pause(); __remixProof.controller.pause(); });
  for (let i = 0; i < seconds * fps; i++) {
    const result = await page.evaluate(async ({ time, fps }) => {
      const video = __remixProof.video, ctl = __remixProof.controller;
      const source = time * 32 / 18;
      if (Math.abs(video.currentTime - source) > .001) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => { cleanup(); reject(new Error('Bake seek timed out')); }, 10000);
          const cleanup = () => { clearTimeout(timer); video.removeEventListener('seeked', done); };
          const done = () => { cleanup(); resolve(); };
          video.addEventListener('seeked', done); video.currentTime = source;
        });
      }
      if (Math.abs(video.currentTime - source) > .1) throw new Error('Bake source timestamp mismatch');
      if (!ctl.renderAt(time, source, 1 / fps)) throw new Error('Bake compositor failed');
      // Read immediately in the same task; preserveDrawingBuffer is not required.
      return { data: ctl.canvas.toDataURL('image/jpeg', .92).split(',')[1], source: video.currentTime };
    }, { time: i / fps, fps });
    await writeFile(resolve(frames, `${String(i).padStart(4, '0')}.jpg`), Buffer.from(result.data, 'base64'));
    if (i % 48 === 0) console.log(`Offline intro preview: ${i}/${seconds * fps}`);
  }
  assert.deepEqual(errors, []);
  const movie = resolve(out, 'signal-overprint-preview.mp4');
  const encode = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps),
    '-i', resolve(frames, '%04d.jpg'), '-c:v', 'libx264', '-preset', 'fast', '-crf', '19',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', movie], { encoding: 'utf8' });
  if (encode.error || encode.status !== 0) throw new Error(encode.error?.message || encode.stderr);
  await writeFile(resolve(out, 'offline-preview.json'), JSON.stringify({
    file: 'signal-overprint-preview.mp4', width: 640, height: 360, fps, seconds, frames: fps * seconds,
    method: '432 exact runtime compositor frames, encoded offline; not measured real-time GPU performance.',
    source: 'Original shipped movie at exact time * 32 / 18, with unchanged runtime sculpture/optical layers.',
  }, null, 2));
  await rm(frames, { recursive: true, force: true });
} finally { await browser.close(); }
