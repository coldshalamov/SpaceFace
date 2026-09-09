#!/usr/bin/env node
// PQ-158.06 — normal-speed fight tape with audio: anticipation → contact → consequence → recovery.
// Playwright is webdriver-muted by default; this capture opts the graph in via __SF_CAPTURE_AUDIO
// and records Playwright page video plus a limiter tap so the file itself carries an audio track.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, 'design/program/roadmap/receipts');
const WIDTH = 1280;
const HEIGHT = 720;

await mkdir(OUT, { recursive: true });
const executablePath = findSystemBrowser();
if (!executablePath) throw new Error('Chrome or Edge is required for the PQ-158.06 fight capture');

const ownedServer = await acquireVisualProbeServer({ root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: false,
  executablePath,
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    `--window-size=${WIDTH},${HEIGHT}`,
    '--force-device-scale-factor=1',
  ],
});
const scratch = path.join(ROOT, '.devshots', 'pq-158-06');
await mkdir(scratch, { recursive: true });
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  recordVideo: { dir: scratch, size: { width: WIDTH, height: HEIGHT } },
});
const page = await context.newPage();
const issues = [];
let contextClosed = false;
page.on('pageerror', (error) => issues.push({ type: 'pageerror', text: error?.stack || error?.message || String(error) }));

let report = null;
try {
  await page.addInitScript(() => {
    window.__SF_CAPTURE_AUDIO = true;
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.goto(ownedServer.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.mouse.click(WIDTH / 2, HEIGHT / 2);
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus), null, { timeout: 30_000 });
  await page.evaluate(() => {
    const state = window.SF.state;
    state.settings.audio.muted = false;
    state.settings.audio.master = 0.8;
    state.settings.audio.sfx = 0.9;
    window.SF.bus.emit('settings:changed', { section: 'audio' });
    window.SF.bus.emit('game:new', { name: 'PQ-158.06 fight tape', seed: 4242 });
  });
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get(sf.state.playerId);
    return sf?.state?.mode === 'flight' && !!player;
  }, null, { timeout: 90_000 });
  await page.evaluate(() => {
    for (const selector of ['.tutorial-overlay', '[data-screen="tutorial"]', '.sf-tutorial']) {
      const root = document.querySelector(selector);
      const button = root && [...root.querySelectorAll('button')]
        .find((node) => /skip|dismiss|close|got it/i.test(node.textContent || ''));
      if (button) button.click();
    }
  });
  await page.waitForTimeout(400);

  const started = await page.evaluate(async () => {
    const audioSys = window.SF.registry.get('audio');
    if (audioSys && typeof audioSys._ensureContext === 'function') audioSys._ensureContext();
    const ctx = audioSys && audioSys.rt && audioSys.rt.ctx;
    if (!ctx) return { ok: false, reason: 'no-audio-context' };
    if (ctx.state === 'suspended' && ctx.resume) await ctx.resume();
    const plays = [];
    const originalPlay = audioSys.play.bind(audioSys);
    audioSys.play = function capturePlay(recipeId, opts) {
      plays.push({
        recipeId,
        tick: window.SF.state.tick,
        simTime: window.SF.state.simTime,
        wallMs: performance.now(),
      });
      return originalPlay(recipeId, opts);
    };
    const dest = ctx.createMediaStreamDestination();
    (audioSys.rt.limiter || audioSys.rt.masterGain).connect(dest);
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';
    const rec = new MediaRecorder(dest.stream, { mimeType: mime, audioBitsPerSecond: 128000 });
    const chunks = [];
    rec.ondataavailable = (event) => { if (event.data && event.data.size) chunks.push(event.data); };
    window.__sf158Fight = { rec, chunks, plays, mime, startedAt: performance.now() };
    rec.start(120);
    return { ok: true, mime, ctxState: ctx.state, muted: audioSys._isMuted() };
  });
  assert.equal(started.ok, true, started.reason || 'recorder failed');
  assert.equal(started.muted, false, 'capture must unmute the graph');

  await page.evaluate(() => {
    const bus = window.SF.bus;
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const pos = player && player.pos ? { x: player.pos.x, z: player.pos.z } : { x: 0, z: 0 };
    window.__sf158Beat = { pos, playerId: state.playerId };
    bus.emit('ai:telegraph', { actorId: 'hostile-1', targetId: state.playerId, kind: 'commit' });
  });
  await page.screenshot({ path: path.join(OUT, 'PQ-158-06-fight-anticipation.png') });
  await page.waitForTimeout(700);
  await page.evaluate(() => {
    const { pos, playerId } = window.__sf158Beat;
    const bus = window.SF.bus;
    bus.emit('combat:fire', { ownerId: 'hostile-1', weaponId: 'wpn_pulse_laser', pos });
    bus.emit('combat:damage', {
      targetId: playerId, sourceId: 'hostile-1', amount: 18, pos, damageType: 'energy',
    });
    bus.emit('projectile:hit', { ownerId: 'hostile-1', targetId: playerId, pos });
  });
  await page.screenshot({ path: path.join(OUT, 'PQ-158-06-fight-contact.png') });
  await page.waitForTimeout(550);
  await page.evaluate(() => {
    const { pos, playerId } = window.__sf158Beat;
    window.SF.bus.emit('shieldDown', { combatantId: playerId, pos });
  });
  await page.screenshot({ path: path.join(OUT, 'PQ-158-06-fight-consequence.png') });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const { playerId } = window.__sf158Beat;
    window.SF.bus.emit('weapons:vent', { ownerId: playerId, entityId: playerId, phase: 'end' });
    window.SF.bus.emit('ship:boostStart', { shipId: playerId });
  });
  await page.screenshot({ path: path.join(OUT, 'PQ-158-06-fight-recovery.png') });
  await page.waitForTimeout(900);

  const stopped = await page.evaluate(async () => {
    const pack = window.__sf158Fight;
    if (!pack) return { ok: false, reason: 'missing-recorder' };
    await new Promise((resolve) => {
      pack.rec.onstop = resolve;
      pack.rec.stop();
      setTimeout(resolve, 1500);
    });
    const blob = new Blob(pack.chunks, { type: pack.mime || 'video/webm' });
    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) {
      binary += String.fromCharCode(...bytes.subarray(i, i + step));
    }
    return {
      ok: true,
      mime: pack.mime,
      bytes: bytes.length,
      durationMs: performance.now() - pack.startedAt,
      plays: pack.plays,
      b64: btoa(binary),
    };
  });
  assert.equal(stopped.ok, true, stopped.reason || 'stop failed');
  assert.ok(stopped.bytes > 200, `audio tap too small (${stopped.bytes})`);
  const audioOnly = Buffer.from(stopped.b64, 'base64');
  const audioPath = path.join(scratch, 'fight-audio.webm');
  const videoPath = path.join(OUT, 'PQ-158-06-fight.webm');
  const jsonPath = path.join(OUT, 'PQ-158-06-fight.json');
  await writeFile(audioPath, audioOnly);
  const pageVideo = page.video();
  await context.close();
  contextClosed = true;
  let recordedVideo = null;
  if (pageVideo) recordedVideo = await pageVideo.path();
  if (recordedVideo && existsSync(recordedVideo)) {
    await execFileAsync('ffmpeg', [
      '-y', '-i', recordedVideo, '-i', audioPath,
      '-c:v', 'libvpx', '-b:v', '2M', '-c:a', 'libopus', '-shortest',
      videoPath,
    ], { timeout: 60000 });
  } else {
    await writeFile(videoPath, audioOnly);
  }
  const probe = await probeWebm(videoPath);
  report = {
    schema: 'spaceface.pq15806FightTape.v1',
    seed: 4242,
    normalSpeed: true,
    mime: 'video/webm',
    audioMime: stopped.mime,
    durationMs: stopped.durationMs,
    bytes: 0,
    plays: stopped.plays,
    beats: ['anticipation:telegraph', 'contact:hit', 'consequence:shieldDown', 'recovery:vent+boost'],
    stills: [
      'design/program/roadmap/receipts/PQ-158-06-fight-anticipation.png',
      'design/program/roadmap/receipts/PQ-158-06-fight-contact.png',
      'design/program/roadmap/receipts/PQ-158-06-fight-consequence.png',
      'design/program/roadmap/receipts/PQ-158-06-fight-recovery.png',
    ],
    probe,
    issues,
  };
  report.bytes = (await stat(videoPath)).size;
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  assert.ok(probe.hasAudio, 'fight tape must carry an audio track');
  assert.ok(probe.hasVideo, 'fight tape must carry a video track');
  assert.ok(stopped.plays.some((row) => row.recipeId === 'sfx.shieldBreak'), 'shield break must request');
  assert.ok(stopped.plays.some((row) => String(row.recipeId).includes('vent')), 'vent must request');
  console.log(JSON.stringify({
    videoPath: path.relative(ROOT, videoPath).replaceAll('\\', '/'),
    jsonPath: path.relative(ROOT, jsonPath).replaceAll('\\', '/'),
    durationMs: stopped.durationMs,
    plays: stopped.plays.map((row) => row.recipeId),
    probe,
  }, null, 2));
} finally {
  if (!contextClosed) await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await ownedServer.close().catch(() => {});
}

async function probeWebm(filePath) {
  try {
    const { stdout } = await execFileAsync('ffprobe', [
      '-v', 'error',
      '-print_format', 'json',
      '-show_streams',
      '-show_format',
      filePath,
    ], { timeout: 15000 });
    const parsed = JSON.parse(stdout);
    const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
    return {
      hasAudio: streams.some((row) => row.codec_type === 'audio'),
      hasVideo: streams.some((row) => row.codec_type === 'video'),
      durationS: Number(parsed.format && parsed.format.duration) || 0,
      codecs: streams.map((row) => `${row.codec_type}:${row.codec_name}`),
    };
  } catch (error) {
    return { hasAudio: false, hasVideo: false, error: String(error && error.message || error) };
  }
}

function findSystemBrowser() {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}
