#!/usr/bin/env node
// capture-wave-s-audition.mjs — Wave S lane-8 live audition: "every verb has a voice, the mix
// has a hierarchy, silence exists." Boots the real game headed, opts the audio graph in via
// __SF_CAPTURE_AUDIO, taps master/music/ambient/combat buses with AnalyserNodes, samples RMS
// + the music-duck gain param at 10 Hz, walks the four audition beats through LIVE event
// paths (combat fire/damage/hit, shieldDown's duck:true cue, dock:docked/dock:undocked), and
// records the limiter output as a webm artifact. A runtime listen — the JSON carries the
// measured levels, the webm carries the audible proof.
//
// Usage: node scripts/capture-wave-s-audition.mjs [--out=.devshots/audio]
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
const argVal = (name, fb) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fb;
};
const OUT = path.resolve(ROOT, argVal('out', '.devshots/audio'));
const WIDTH = 1280;
const HEIGHT = 720;

await mkdir(OUT, { recursive: true });
const ownedServer = await acquireVisualProbeServer({ root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: false,
  args: [
    '--autoplay-policy=no-user-gesture-required',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    `--window-size=${WIDTH},${HEIGHT}`,
    '--force-device-scale-factor=1',
  ],
});
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
const page = await context.newPage();
const issues = [];
page.on('pageerror', (error) => issues.push({ type: 'pageerror', text: String(error?.stack || error) }));

function findBeat(samples, tag) {
  return samples.filter((s) => s.beat === tag);
}
function peakRms(samples, key) {
  return samples.reduce((m, s) => Math.max(m, s[key] || 0), 0);
}
function floorRms(samples, key) {
  const vals = samples.map((s) => s[key] || 0).filter((v) => v > 0);
  if (!vals.length) return 0;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length * 0.5)]; // median as the floor proxy
}

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
    window.SF.bus.emit('game:new', { name: 'Wave S audition', seed: 4242 });
  });
  await page.waitForFunction(() => {
    const sf = window.SF;
    return sf?.state?.mode === 'flight' && !!sf.state.entities?.get(sf.state.playerId);
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

  // ── instrument the live graph ──────────────────────────────────────────────────────────
  const started = await page.evaluate(async () => {
    const audioSys = window.SF.registry.get('audio');
    if (audioSys && typeof audioSys._ensureContext === 'function') audioSys._ensureContext();
    const ctx = audioSys && audioSys.rt && audioSys.rt.ctx;
    if (!ctx) return { ok: false, reason: 'no-audio-context' };
    if (ctx.state === 'suspended' && ctx.resume) await ctx.resume();
    const rt = audioSys.rt;
    const plays = [];
    const originalPlay = audioSys.play.bind(audioSys);
    audioSys.play = function capturePlay(recipeId, opts) {
      plays.push({ recipeId, simTime: window.SF.state.simTime, wallMs: performance.now(), duck: !!(opts && opts.duck) });
      return originalPlay(recipeId, opts);
    };
    const mkAnalyser = (node) => {
      if (!node) return null;
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      try { node.connect(an); } catch (_) { return null; }
      return { an, buf: new Float32Array(an.fftSize) };
    };
    const taps = {
      master: mkAnalyser(rt.limiter || rt.masterGain),
      music: mkAnalyser(rt.musicBus),
      ambient: mkAnalyser(rt.ambientBus),
      combat: mkAnalyser(rt.combatBus),
      sfx: mkAnalyser(rt.sfxBus),
    };
    const dest = ctx.createMediaStreamDestination();
    (rt.limiter || rt.masterGain).connect(dest);
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus' : 'audio/webm';
    const rec = new MediaRecorder(dest.stream, { mimeType: mime, audioBitsPerSecond: 128000 });
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const pack = { rec, chunks, plays, mime, startedAt: performance.now(), taps, rt, beat: 'boot', samples: [] };
    const rmsOf = (tap) => {
      if (!tap) return 0;
      tap.an.getFloatTimeDomainData(tap.buf);
      let sum = 0;
      for (let i = 0; i < tap.buf.length; i++) sum += tap.buf[i] * tap.buf[i];
      return Math.sqrt(sum / tap.buf.length);
    };
    pack.timer = setInterval(() => {
      pack.samples.push({
        t: Math.round(performance.now() - pack.startedAt),
        beat: pack.beat,
        master: Math.round(rmsOf(taps.master) * 10000) / 10000,
        music: Math.round(rmsOf(taps.music) * 10000) / 10000,
        ambient: Math.round(rmsOf(taps.ambient) * 10000) / 10000,
        combat: Math.round(rmsOf(taps.combat) * 10000) / 10000,
        sfx: Math.round(rmsOf(taps.sfx) * 10000) / 10000,
        musicGain: rt.musicBus && rt.musicBus.gain ? Math.round(rt.musicBus.gain.value * 10000) / 10000 : null,
        musicDuckUntil: rt._duckUntil || 0,
        loops: rt.loops ? Object.keys(rt.loops) : [],
      });
    }, 100);
    window.__sfWaveS = pack;
    rec.start(120);
    return { ok: true, mime, ctxState: ctx.state, muted: audioSys._isMuted() };
  });
  assert.equal(started.ok, true, started.reason || 'recorder failed');
  assert.equal(started.muted, false, 'capture must unmute the graph');

  const setBeat = (tag) => page.evaluate((b) => { window.__sfWaveS.beat = b; }, tag);
  const settle = (ms) => page.waitForTimeout(ms);

  // Beat 1 — silence exists: idle drift in flight.
  await setBeat('silence_pre');
  await settle(4000);

  // Beat 2 — combat verbs: player fire, hostile hit, damage. Distinct recipes must answer.
  await setBeat('combat');
  await page.evaluate(() => {
    const { state, bus } = window.SF;
    const player = state.entities.get(state.playerId);
    const pos = player && player.pos ? { x: player.pos.x, z: player.pos.z } : { x: 0, z: 0 };
    bus.emit('combat:fire', { ownerId: state.playerId, weaponId: 'wpn_pulse_laser', pos });
  });
  await settle(700);
  await page.evaluate(() => {
    const { state, bus } = window.SF;
    const player = state.entities.get(state.playerId);
    const pos = player && player.pos ? { x: player.pos.x, z: player.pos.z } : { x: 0, z: 0 };
    bus.emit('combat:fire', { ownerId: 'hostile-1', weaponId: 'wpn_pulse_laser', pos });
    bus.emit('combat:damage', { targetId: state.playerId, sourceId: 'hostile-1', amount: 18, pos, damageType: 'energy' });
    bus.emit('projectile:hit', { ownerId: 'hostile-1', targetId: state.playerId, pos });
  });
  await settle(900);

  // Beat 3 — the mix hierarchy: a duck:true cue (shieldDown → shield blowout alarm) must
  // dip the music bus below the line while the cue owns the ear.
  await setBeat('duck');
  const musicBefore = await page.evaluate(() => window.__sfWaveS.rt.musicBus.gain.value);
  await page.evaluate(() => {
    const { state, bus } = window.SF;
    const player = state.entities.get(state.playerId);
    const pos = player && player.pos ? { x: player.pos.x, z: player.pos.z } : { x: 0, z: 0 };
    bus.emit('shieldDown', { combatantId: state.playerId, pos });
  });
  await settle(2500);

  // Beat 4 — station room tone: dock through the live event, the hum must own the berth.
  await setBeat('docked');
  await page.evaluate(() => {
    const { bus, state } = window.SF;
    const stations = (state.entityIndex && state.entityIndex.dockStations) || [];
    const st = stations.find((s) => s && s.alive);
    bus.emit('dock:docked', { stationId: st ? st.id : 'station_helios_prime' });
    window.__sfWaveS.dockStationId = st ? st.id : null;
  });
  await settle(2800);
  const humState = await page.evaluate(() => {
    const rt = window.__sfWaveS.rt;
    return { stationHum: !!(rt.loops && rt.loops.stationHum), docked: !!rt._docked };
  });
  await page.evaluate(() => {
    window.SF.bus.emit('dock:undocked', { stationId: window.__sfWaveS.dockStationId, committed: true });
  });
  await setBeat('undocked');
  await settle(2500);

  // Beat 5 — silence placement again: post-dock drift, cue tails gone.
  await setBeat('silence_post');
  await settle(3000);

  // ── stop, pull, judge ─────────────────────────────────────────────────────────────────
  const stopped = await page.evaluate(async () => {
    const pack = window.__sfWaveS;
    clearInterval(pack.timer);
    await new Promise((resolve) => { pack.rec.onstop = resolve; pack.rec.stop(); setTimeout(resolve, 1500); });
    const blob = new Blob(pack.chunks, { type: pack.mime || 'video/webm' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return {
      ok: true, mime: pack.mime, bytes: bytes.length,
      durationMs: performance.now() - pack.startedAt,
      plays: pack.plays, samples: pack.samples, dockStationId: pack.dockStationId,
      b64: btoa(binary),
    };
  });
  assert.equal(stopped.ok, true, 'stop failed');
  assert.ok(stopped.bytes > 200, `audio tap too small (${stopped.bytes})`);

  const audioPath = path.join(OUT, `wave-s-audition-${Date.now()}.webm`);
  await writeFile(audioPath, Buffer.from(stopped.b64, 'base64'));

  const samples = stopped.samples;
  const silencePre = findBeat(samples, 'silence_pre');
  const combat = findBeat(samples, 'combat');
  const duck = findBeat(samples, 'duck');
  const docked = findBeat(samples, 'docked');
  const silencePost = findBeat(samples, 'silence_post');

  const distinctCombat = [...new Set(stopped.plays.map((p) => p.recipeId))]
    .filter((id) => !/click|ui_/i.test(id));
  const duckSamples = duck.map((s) => s.musicGain).filter((v) => v != null);
  const duckMin = duckSamples.length ? Math.min(...duckSamples) : null;
  const duckPlayed = stopped.plays.some((p) => p.duck);
  const humLoop = docked.some((s) => (s.loops || []).includes('stationHum'));
  const humGone = findBeat(samples, 'undocked').slice(-5).every((s) => !(s.loops || []).includes('stationHum'));

  const verdicts = {
    silencePre: { floorMaster: floorRms(silencePre, 'master'), note: 'idle drift — master floor (engine bed may sit here by design)' },
    combatVoices: { distinctRecipes: distinctCombat, sampleCount: combat.length },
    duck: { musicGainBefore: musicBefore, musicGainMinDuringCue: duckMin, dipped: duckMin != null && duckMin < musicBefore - 0.001, duckFlaggedCue: duckPlayed },
    roomTone: { humLoopHeard: humLoop, ambientPeakDocked: peakRms(docked, 'ambient'), humStoppedAfterUndock: humGone },
    silencePost: { floorMaster: floorRms(silencePost, 'master') },
  };

  const report = {
    schema: 'spaceface.waveSAudition.v1',
    seed: 4242,
    durationMs: stopped.durationMs,
    mime: stopped.mime,
    artifact: path.relative(ROOT, audioPath).replaceAll('\\', '/'),
    dockStationId: stopped.dockStationId,
    verdicts,
    plays: stopped.plays,
    issues,
    humState,
  };
  const jsonPath = path.join(OUT, `wave-s-audition-${Date.now()}.json`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ jsonPath: path.relative(ROOT, jsonPath), artifact: report.artifact, verdicts }, null, 2));
} finally {
  await context.close().catch(() => {});
  await browser.close().catch(() => {});
  await ownedServer.close().catch(() => {});
}
