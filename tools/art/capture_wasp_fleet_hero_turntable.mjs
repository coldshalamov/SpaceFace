#!/usr/bin/env node
// Record a fixed-camera browser turntable from the same Three.js asset path used by still evidence.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { chromium } from 'playwright';

const args = parseArgs(process.argv.slice(2));
const port = Number(args.port || 41735);
const asset = String(args.asset || '/.devshots/graphics/wasp-fleet-hero-v1/candidate/wasp_production_v1_golden_ktx2.glb');
const outputDir = resolve(args.out || '.devshots/graphics/wasp-fleet-hero-v1/evidence/turntable');
const durationMs = Math.max(3000, Number(args.duration || 6000));
mkdirSync(outputDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 960, height: 960 },
  recordVideo: { dir: outputDir, size: { width: 960, height: 960 } },
});
const page = await context.newPage();
const query = new URLSearchParams({ asset, w: '960', h: '960', az: '-38', tilt: '47', zoom: '38', ty: '0.35' });
const url = `http://127.0.0.1:${port}/tools/art/wasp_fleet_hero_preview.html?${query}`;
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__SF?.ready === true || window.__SF?.error, null, { timeout: 120_000 });
const diagnostics = await page.evaluate(() => window.__SF);
if (!diagnostics?.ready) throw new Error(diagnostics?.error || 'preview did not become ready');
await page.evaluate(async (duration) => {
  const view = window.__SFView;
  if (!view?.root) throw new Error('turntable control unavailable');
  const start = performance.now();
  await new Promise((resolveAnimation) => {
    function frame(now) {
      const progress = Math.min(1, (now - start) / duration);
      view.root.rotation.y = progress * Math.PI * 2;
      view.renderer.render(view.scene, view.camera);
      if (progress >= 1) resolveAnimation(); else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  });
}, durationMs);
await page.waitForTimeout(250);
const video = page.video();
await page.close();
await context.close();
const rawOutput = resolve(outputDir, 'wasp-fleet-hero-ktx2-turntable.raw.webm');
await video.saveAs(rawOutput);
await browser.close();
const output = resolve(outputDir, 'wasp-fleet-hero-ktx2-turntable.webm');
const trimSeconds = (durationMs / 1000 + 0.6).toFixed(2);
const ffmpegArgs = ['-y', '-v', 'error', '-sseof', `-${trimSeconds}`, '-i', rawOutput, '-t', trimSeconds, '-c:v', 'libvpx-vp9', '-crf', '24', '-b:v', '0', '-an', output];
const ffmpeg = spawnSync('ffmpeg', ffmpegArgs, { encoding: 'utf8', windowsHide: true, shell: false });
if (ffmpeg.status !== 0) throw new Error(`ffmpeg ${ffmpegArgs.join(' ')}\n${ffmpeg.error || ''}\n${ffmpeg.stderr || ''}`);
rmSync(rawOutput, { force: true });
const report = {
  schema: 'spaceface.waspFleetHero.turntable.v1', asset, url, durationMs, diagnostics,
  postprocess: { executable: 'ffmpeg', args: ffmpegArgs, exitCode: ffmpeg.status },
  capture: { path: output, bytes: readFileSync(output).length, sha256: sha256(output) },
};
const reportPath = resolve(outputDir, 'turntable-report.json');
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, report: reportPath, video: output }, null, 2)}\n`);

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index++) {
    if (!values[index].startsWith('--')) continue;
    const key = values[index].slice(2);
    result[key] = values[index + 1] && !values[index + 1].startsWith('--') ? values[++index] : true;
  }
  return result;
}
