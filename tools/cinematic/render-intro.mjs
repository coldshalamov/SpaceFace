#!/usr/bin/env node
// Bake the intro visualizer cinematic to video.
//
// Renders every frame of tools/cinematic/intro-scene.js deterministically through
// the running Chrome (CDP, WebGL2 via SwiftShader is fine), encodes h264 + a
// synthesized ambient bed with ffmpeg, and writes the poster frame.
//
// Usage:  node tools/cinematic/render-intro.mjs [--out DIR] [--w 1920] [--h 1080]
//         [--crf 19] [--keep-frames] [--poster-t 24]
// Requires: server.js serving the repo root on :8123, Chrome on :29229,
//           ffmpeg + ffprobe on PATH, playwright-core installed (npm i -D).

import { chromium } from 'playwright-core';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) =>
  a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : null).filter(Boolean));

const OUT_DIR = resolve(args.out || 'assets/cinematics');
const W = parseInt(args.w || '1920', 10);
const H = parseInt(args.h || '1080', 10);
const CRF = args.crf || '19';
const POSTER_T = parseFloat(args['poster-t'] || '24');
const KEEP = !!args['keep-frames'];
const SKIP_RENDER = !!args['skip-render']; // encode from frames already in FRAMES_DIR
const FRAMES_DIR = join(OUT_DIR, '.intro-frames');
const MP4 = join(OUT_DIR, 'intro-visualizer.mp4');
const POSTER = join(OUT_DIR, 'intro-visualizer.jpg');

mkdirSync(FRAMES_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

let spec;
if (SKIP_RENDER) {
  spec = { frames: 768, fps: 24, duration: 32 };
} else {
  const browser = await chromium.connectOverCDP('http://localhost:29229');
  const page = await browser.contexts()[0].newPage();
  await page.setViewportSize({ width: W, height: H });
  page.on('pageerror', (e) => { console.error('PAGE ERROR:', e.message); process.exitCode = 1; });
  await page.goto(`http://localhost:8123/tools/cinematic/intro.html?w=${W}&h=${H}`);
  await page.waitForFunction(() => globalThis.__cine?.ready, null, { timeout: 120000 });

  spec = await page.evaluate(() => ({ frames: __cine.frames, fps: __cine.fps, duration: __cine.duration }));
  console.log(`baking ${spec.frames} frames at ${W}x${H} @${spec.fps}fps`);

  const t0 = Date.now();
  for (let i = 0; i < spec.frames; i++) {
    const b64 = await page.evaluate((i) => { __cine.renderFrame(i); return __cine.snapshot('image/png').split(',')[1]; }, i);
    writeFileSync(join(FRAMES_DIR, `f_${String(i).padStart(4, '0')}.png`), Buffer.from(b64, 'base64'));
    if (i % 48 === 0 || i === spec.frames - 1) {
      const el = (Date.now() - t0) / 1000;
      console.log(`frame ${i}/${spec.frames}  ${(el / (i + 1)).toFixed(2)}s/f  eta ${((spec.frames - i) * el / (i + 1)).toFixed(0)}s`);
    }
  }
  await page.close();
  await browser.close();
}

// Ambient bed: brown-noise hull rumble + a detuned low drone + a high shimmer
// that swells once around the gate shot. All synthesized — no external assets.
const dur = spec.duration;
const audio = [
  '-f', 'lavfi', '-i', `anoisesrc=color=brown:duration=${dur}:amplitude=0.55:seed=7,lowpass=f=160,volume=0.5`,
  '-f', 'lavfi', '-i', `sine=frequency=55:duration=${dur},volume=0.32`,
  '-f', 'lavfi', '-i', `sine=frequency=82.41:duration=${dur},volume=0.14`,
  '-f', 'lavfi', '-i', `sine=frequency=110:duration=${dur},volume=0.05`,
  '-f', 'lavfi', '-i', `sine=frequency=1244.5:duration=${dur},vibrato=f=0.11:d=0.8,volume='0.02+0.05*sin(2*PI*t/${dur}-1.2)':eval=frame`,
  '-f', 'lavfi', '-i', `anoisesrc=color=pink:duration=${dur}:amplitude=0.3:seed=11,highpass=f=3000,volume=0.06`,
];
const filter = `[1:a][2:a][3:a][4:a][5:a][6:a]amix=inputs=6:normalize=0,afade=t=in:st=0:d=2.5,afade=t=out:st=${dur - 1.6}:d=1.6[a]`;

const ff = spawnSync('ffmpeg', [
  '-y',
  '-framerate', String(spec.fps), '-i', join(FRAMES_DIR, 'f_%04d.png'),
  ...audio,
  '-filter_complex', filter, '-map', '0:v', '-map', '[a]',
  // Grain defeats x264 — cap VBR so the shipped clip stays web-sized (~7Mbps
  // ≈ 30MB for 32s); CRF still shapes quality inside the cap.
  '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF,
  '-maxrate', args.maxrate || '7M', '-bufsize', '14M', '-pix_fmt', 'yuv420p',
  '-vf', 'scale=1920:1080:flags=lanczos,setsar=1',
  '-c:a', 'aac', '-b:a', '128k',
  '-movflags', '+faststart',
  MP4,
], { stdio: 'inherit' });
if (ff.status !== 0) { console.error('ffmpeg encode failed'); process.exit(1); }

// Poster from a representative frame (gate throat by default).
const posterIdx = Math.round(POSTER_T * spec.fps);
spawnSync('ffmpeg', ['-y', '-i', join(FRAMES_DIR, `f_${String(posterIdx).padStart(4, '0')}.png`),
  '-q:v', '3', POSTER], { stdio: 'inherit' });

if (!KEEP) rmSync(FRAMES_DIR, { recursive: true, force: true });
const probe = spawnSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration,size', '-of', 'csv=p=0', MP4]);
console.log('wrote', MP4, probe.stdout?.toString().trim());
console.log('wrote', POSTER);
