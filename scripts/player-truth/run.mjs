#!/usr/bin/env node
// Player-truth harness: play what the player plays, see what the player sees, fail loudly.
//
//   npm run player-truth -- --mode=swarm [--arena="Ricochet Foundry"|all] [--seed=4242]
//   npm run player-truth -- --mode=adventure|racing|gauntlet [--duration=300]
//   flags: --headed (GPU Chrome, preferred) · --rounds=3 · --duration=<sim s> · --wall=<min>
//          --idle=<sim s> · --viewport=WxH (1280x720 headed, 960x540 software GL) · --out=<dir> · --tag=<suffix> (label suffix, e.g. idle) · --evidence (copy compact result
//          into design/program/player-truth/<label>/; scratch frames stay) · --prune-frames (opt-in delete of scratch frames after --evidence; default off)
//   gate:  --gate (idle pass + active pass to round 3; UNKNOWN on core checks = FAIL)
//          --gate=idle or --gate=active runs one of those passes · --viewports=960x540,1280x720,1920x1080
//          --hull=all|<starter id> · --baseline=<git ref> (before/after table) · browser: bundled Chromium
//          (`npx playwright install chromium`), else CHROME_PATH or /opt/google/chrome/chrome
//
// Drives the real public route in a real rendered browser with trusted keyboard/mouse input,
// samples live telemetry with src/testing/playerTruth/reader.js (observer only), takes periodic
// screenshots, runs scripts/player-truth/checks.mjs and writes verdict.md + contact-sheet.jpg.
// Exit code: 0 PASS, 1 FAIL, 2 INCOMPLETE (a check could not measure), 3 harness error,
//            4 HARNESS ENVIRONMENT (served assets/design stale vs HEAD, or a quoted route load error). Not a gameplay FAIL.

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadPlaywright } from '../lib/load-playwright.mjs';
import { launchChromium } from './browser.mjs';
import { startBenchServer } from '../lib/benchServer.mjs';
import { runChecks, overall } from './checks.mjs';
import { analyzeReadability } from './readability.mjs';
import { buildContactSheet } from './contactSheet.mjs';
import { renderVerdict, printSummary } from './verdict.mjs';
import { verifyHarnessEnvironment, ENVIRONMENT_EXIT, renderEnvironmentAbort, quoteLoadError } from './environment.mjs';
import { bootToMenu, crucibleToArmory, readLoadError, waitUntilFlight, readArmoryShelf, classifyOfferRead, readFittedRows, auditItems, swapProbe, armoryLaunchWord, clickText, waitBootOverlayGone, adventureToFlight, racingToFlight, listDoorArenas, listHulls } from './routes.mjs';
import { waitSim, simNow, wallNow, controlProbes, fightBeat, cruiseBeat } from './driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODES = ['swarm', 'gauntlet', 'adventure', 'racing'];

export function parseArgs(argv) {
  const a = { mode: 'swarm', arena: null, seed: 4242, rounds: 3, duration: null, wall: null, idle: 6, headed: false, viewport: null, viewports: null, hull: null, gate: false, baseline: null, out: null, evidence: false, pruneFrames: false, shotEvery: null, tag: null, fight: false };
  for (const raw of argv) {
    const m = raw.match(/^--([^=]+)(?:=(.*))?$/); if (!m) continue;
    const [, k, v] = m;
    if (k === 'headed' || k === 'gpu') a.headed = true;
    else if (k === 'evidence') a.evidence = true;
    else if (k === 'prune-frames') a.pruneFrames = v == null || v === '' || v === 'true';
    else if (k === 'fight') a.fight = true;
    else if (k === 'gate') a.gate = v == null || v === '' || v === 'true' ? true : v;
    else if (k === 'shot-every') a.shotEvery = Number(v);
    else if (k in a) a[k] = v === undefined ? true : (typeof a[k] === 'number' ? Number(v) : v);
  }
  if (!MODES.includes(a.mode)) throw new Error(`--mode must be one of ${MODES.join(', ')}`);
  // SwiftShader fill cost dominates a software run; a smaller canvas keeps a bounded run in minutes.
  a.viewport = a.viewport || (a.headed ? '1280x720' : '960x540');
  a.viewportList = a.viewports ? String(a.viewports).split(',').map((x) => x.trim()).filter((x) => /^\d+x\d+$/.test(x)) : [a.viewport];
  a.duration = a.duration || { swarm: 180, gauntlet: 180, adventure: 300, racing: 180 }[a.mode];
  return a;
}

// `--gate` replaces the caller's rounds and duration. A bounded hull × viewport matrix omits `--gate`
// so `--rounds`, `--duration` and `--wall` stay the numbers on the command line.
export function gatePasses(args) {
  const roundMode = args.mode === 'swarm' || args.mode === 'gauntlet';
  if (!args.gate) return [{}];
  if (!roundMode) return [{ gatePass: 'active', tag: args.tag }];
  const which = args.gate === true ? 'both' : String(args.gate);
  const idle = { gatePass: 'idle', tag: 'idle', idle: 40, rounds: 1, duration: 45 };
  const active = { gatePass: 'active', tag: 'active', idle: 3, rounds: Math.max(3, args.rounds), requireRounds: 3, duration: Math.max(args.duration, 300) };
  if (which === 'idle') return [idle];
  if (which === 'active') return [active];
  if (which === 'both') return [idle, active];
  throw new Error(`--gate must be idle, active, or omitted for both (got ${which})`);
}

/** One line when the route dies. A SwiftShader OOM often SIGKILLs Chrome before Playwright's close events flush, so the exit code and signal are part of the line. */
export function formatRouteFailure(message, { notes = [], exitCode = null, signal = null } = {}) {
  const head = String(message || 'unknown').split('\n')[0].slice(0, 180);
  const bits = notes.map((n) => String(n).replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (exitCode != null || signal) bits.push(`chrome exit ${exitCode == null ? 'null' : exitCode} signal ${signal || 'none'}`);
  const extra = bits.length ? ` [${bits.join(' | ')}]` : '';
  return `harness/route error: ${head}${extra}`.slice(0, 400);
}

/** Process status for a finished matrix. ENVIRONMENT (4) outranks a gameplay FAIL: the run was not the code under test. */
export function gateExitCode(verdicts) {
  if (verdicts.some((v) => v === 'ENVIRONMENT')) return ENVIRONMENT_EXIT;
  if (verdicts.some((v) => v === 'FAIL')) return 1;
  if (verdicts.some((v) => v !== 'PASS')) return 2;
  return 0;
}

/** Starter-fight pacing watch: shots, encounter beats and the post-combat silence, in sim seconds. */
async function installPacingWatch(page) {
  await page.evaluate(() => {
    const SF = window.SF; const log = window.__ptPacing = [];
    const sim = () => Number(SF.state.simTime) || 0;
    const on = (name, fn) => SF.bus.on(name, (p) => { if (log.length < 20000) log.push({ ev: name, sim: sim(), ...fn(p || {}) }); });
    on('combat:fire', (p) => { const e = SF.state.entities.get(p.ownerId); return { ownerId: p.ownerId, byPlayer: p.ownerId === SF.state.playerId, team: e ? e.team : null }; });
    on('combat:outcome', (p) => ({ entityId: p.entityId ?? p.id ?? null, outcome: p.outcome || null }));
    on('barkDirector:silence', (p) => ({ until: p.until }));
    on('encounter:telegraph', (p) => ({ kind: p.kind || null }));
    on('encounter:resolved', (p) => ({ kind: p.kind || p.shapeId || null, outcome: p.outcome || null }));
  });
}

/** Per hush: the shots that still land inside its breath, and when the fight's last shot fell. */
export function summarizePacing(log, breathS = 2.4) {
  const fires = log.filter((e) => e.ev === 'combat:fire');
  const lastShot = fires.length ? fires[fires.length - 1].sim : null;
  const hushes = log.filter((e) => e.ev === 'barkDirector:silence').map((h) => {
    const inBreath = fires.filter((f) => f.sim > h.sim && f.sim <= h.sim + breathS);
    const before = fires.filter((f) => f.sim <= h.sim);
    const next = fires.find((f) => f.sim > h.sim);
    return { sim: +h.sim.toFixed(2), until: h.until, sinceLastShotS: before.length ? +(h.sim - before[before.length - 1].sim).toFixed(2) : null,
      shotsInBreath: inBreath.length, hostileShotsInBreath: inBreath.filter((f) => !f.byPlayer).length, nextShotS: next ? +(next.sim - h.sim).toFixed(2) : null };
  });
  return {
    shots: fires.length, playerShots: fires.filter((f) => f.byPlayer).length, lastShotSim: lastShot,
    outcomes: log.filter((e) => e.ev === 'combat:outcome').map((e) => ({ sim: +e.sim.toFixed(2), entityId: e.entityId, outcome: e.outcome })),
    encounters: log.filter((e) => e.ev.startsWith('encounter:')).map((e) => ({ ev: e.ev, sim: +e.sim.toFixed(2), kind: e.kind, outcome: e.outcome || null })),
    hushes, hushAfterLastShot: hushes.length ? hushes.every((h) => h.hostileShotsInBreath === 0) : null,
  };
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function runOutputDirectory(args, label, multiple = false) {
  const requested = args.out || path.join('scratch/player-truth', label);
  return path.resolve(ROOT, args.out && multiple ? path.join(requested, label) : requested);
}

async function runOne(args, arena, extra = {}) {
  const label = [args.mode, arena ? slug(arena) : null, extra.hull ? slug(extra.hull) : null, extra.vpTag ? args.viewport : null, args.tag ? slug(args.tag) : null].filter(Boolean).join('-');
  const outDir = runOutputDirectory(args, label, extra.multiple);
  rmSync(outDir, { recursive: true, force: true }); mkdirSync(path.join(outDir, 'frames'), { recursive: true });
  const [vwStr, vhStr] = args.viewport.split('x'); const vw = Number(vwStr); const vh = Number(vhStr);
  const wallCapMs = (args.wall || (args.headed ? 10 : 40)) * 60000;
  const shotEveryMs = (args.shotEvery || (args.headed ? 1 : 3)) * 1000;
  const T0 = Date.now();
  const log = (...m) => console.log(`[${label} ${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...m);
  const trace = { meta: { mode: args.mode, rounds: args.mode === 'swarm' || args.mode === 'gauntlet', hasLoadout: args.mode === 'swarm' || args.mode === 'gauntlet', gate: args.gatePass || null, requireRounds: args.requireRounds || null }, samples: [], events: [], longTasks: [], keys: [], rounds: [], probes: [], route: { steps: [] }, loadout: null, readability: null };
  const shots = [];
  const step = (name, ok, detail) => { trace.route.steps.push({ name, ok, detail, t: null }); log(`${ok ? 'ok ' : 'XX '} ${name} — ${detail}`); };

  const server = await startBenchServer();
  const { chromium } = await loadPlaywright();
  const { browser, executable } = await launchChromium(chromium, {
    headless: !args.headed,
    args: args.headed
      ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  });
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
  const pageErrors = [];
  const browserNotes = [];
  const note = (line) => { if (browserNotes.length < 12) browserNotes.push(String(line).replace(/\s+/g, ' ').trim().slice(0, 180)); };
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 200)));
  browser.on('disconnected', () => note('browser disconnected'));
  page.on('crash', () => note('page crashed'));
  page.on('close', () => note('page closed'));
  const child = typeof browser.process === 'function' ? browser.process() : null;
  if (child && child.stderr) child.stderr.on('data', (buf) => {
    for (const line of String(buf).split('\n')) if (/FATAL|oom|killed|crash|SwiftShader|GL out|aw, snap/i.test(line)) note(line);
  });
  let lastProgress = 0; let progressMark = null;
  let readerOn = false; let stopReason = null; let shotTimer = null; let drainTimer = null; let busy = false;

  const drain = async () => {
    if (!readerOn) return;
    const d = await page.evaluate(() => window.__playerTruth && window.__playerTruth.drain()).catch(() => null);
    if (!d) return;
    trace.samples.push(...d.samples); trace.events.push(...d.events); trace.longTasks.push(...d.longTasks); trace.keys = d.keys;
    const last = trace.samples[trace.samples.length - 1];
    if (last && Date.now() - lastProgress > 30000) {
      const prev = progressMark; progressMark = { wall: Date.now(), sim: last.sim, f: trace.samples.length };
      if (prev) log(`progress: sim ${last.sim.toFixed(1)} s · ${((progressMark.f - prev.f) / ((progressMark.wall - prev.wall) / 1000)).toFixed(1)} fps · ${((progressMark.sim - prev.sim) / ((progressMark.wall - prev.wall) / 1000)).toFixed(2)} sim s per wall s · phase ${last.run ? last.run.ph : last.mode}`);
      lastProgress = Date.now();
    }
  };
  const shoot = async (tag, play) => {
    if (busy) return; busy = true;
    try {
      const info = await page.evaluate(() => ({ t: performance.now(), sim: window.SF ? window.SF.state.simTime : null, hud: (document.querySelector('.sf-crun') || document.querySelector('#hud') || {}).innerText || '' }));
      const file = path.join(outDir, 'frames', `${String(shots.length).padStart(4, '0')}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 72 });
      shots.push({ t: info.t, sim: info.sim, file, play, label: tag, hud: info.hud.replace(/\s+/g, ' ').trim().slice(0, 60) });
    } catch { /* page navigating */ } finally { busy = false; }
  };
  const startStreams = (tag) => {
    if (!shotTimer) shotTimer = setInterval(() => { shoot(tag(), true).catch(() => {}); }, shotEveryMs);
    if (!drainTimer) drainTimer = setInterval(() => { drain().catch(() => {}); }, 1500);
  };
  const installReader = async () => {
    await page.addScriptTag({ type: 'module', content: "import { installPlayerTruthReader } from '/src/testing/playerTruth/reader.js'; installPlayerTruthReader(window, { vfxEvery: 4, pxEvery: 24 }).start(); window.__playerTruthReady = true;" });
    await page.waitForFunction(() => window.__playerTruthReady === true, null, { timeout: 60000 });
    readerOn = true;
  };
  const phaseNow = () => page.evaluate(() => ({ sim: window.SF.state.simTime, t: performance.now(), mode: window.SF.state.mode, ph: window.SF.state.run ? window.SF.state.run.phase : null, w: window.SF.state.run ? window.SF.state.run.wave : null, top: window.SF.ctx.screenManager.top(), playerAlive: !!window.SF.state.entityList.find((e) => e.id === window.SF.state.playerId && e.alive !== false) }));
  const overBudget = (playStart, sim) => (Date.now() - T0 > wallCapMs ? 'wall-clock cap' : (sim - playStart > args.duration ? `duration ${args.duration} sim s reached` : null));

  let doorInfo = null; let renderer = 'unknown'; let browserVersion = browser.version();
  try {
    await bootToMenu(page, server.baseUrl, step);
    await installReader();
    renderer = await page.evaluate(() => {
      const r = window.SF.state.render && window.SF.state.render.renderer; const gl = r ? r.getContext() : document.createElement('canvas').getContext('webgl2');
      const ext = gl && gl.getExtension('WEBGL_debug_renderer_info'); return gl ? (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : 'no webgl';
    });
    await shoot('main menu', false);

    if (args.mode === 'swarm' || args.mode === 'gauntlet') {
      doorInfo = await crucibleToArmory(page, { ruleset: RULESET[args.mode] || args.mode, arena, seed: args.seed, hull: extra.hull || null }, step, {
        onShip: async () => { await shoot('ship step', false); },
      });
      if (args.mode === 'swarm') {
        await page.waitForFunction(() => { const n = (s) => String(s || '').replace(/\s+/g, ' '); return [...document.querySelectorAll('#screens button')].some((x) => x.offsetParent && !x.disabled && /Launch round 1/.test(n(x.textContent))); }, null, { timeout: 600000 });
        await waitBootOverlayGone(page);
        await shoot('armory', false);
        const shelf = await readArmoryShelf(page);
        const classified = classifyOfferRead(shelf);
        const doorClaim = doorInfo && doorInfo.doorPrep ? doorInfo.doorPrep.fittedClaimed : 0;
        let fitted = []; let fittedRead = true; let fittedError = null;
        try {
          const fit = await readFittedRows(page);
          fitted = fit.rows || [];
        } catch (err) {
          fittedRead = false;
          fittedError = String(err && err.message || err).split('\n')[0].slice(0, 160);
        }
        const audit = auditItems(args.mode, [...shelf.cards, ...fitted]);
        const probe = shelf.cards.length && fittedRead
          ? await swapProbe(page, 3)
          : { silentSwaps: [], announcedSwaps: 0, buys: 0, swapProbe: shelf.cards.length ? 'not-run' : 'no install possible' };
        trace.loadout = {
          items: shelf.cards, fitted, ...audit, ...probe, ...classified,
          fittedClaimed: Math.max(doorClaim || 0, shelf.fittedClaimed || 0),
          fittedRead, fittedError, doorQuote: doorInfo && doorInfo.doorPrep ? doorInfo.doorPrep.quote : null,
          shotT: shots[shots.length - 1] ? shots[shots.length - 1].t : null,
        };
        await shoot('armory after installs', false);
        const source = classified.offerSource === 'game-empty' ? `game offered nothing ("${(classified.offerQuote || '').slice(0, 80)}")`
          : classified.offerSource === 'harness-miss' ? `harness failed to read the screen ("${(classified.offerQuote || '').slice(0, 80)}")`
            : `${shelf.cards.length} armory offers read`;
        step('preparation', true, `hull ${doorInfo.hull || 'default'} · ${source} · ${fitted.length} fitted${fittedRead ? '' : ' (fit list not read)'} · ${probe.swapProbe}`);
        const word = await armoryLaunchWord(page);
        await clickText(page, word || 'Launch round 1');
      } else if (doorInfo && doorInfo.doorPrep) {
        const door = doorInfo.doorPrep;
        const claimed = door.fittedClaimed || 0;
        trace.loadout = {
          items: [], fitted: [], irrelevant: [], undescribed: [], silentSwaps: [],
          swapProbe: 'gauntlet preparation has no armory shelf',
          offerSource: 'door-only', offerQuote: door.quote || door.sub || door.face || '',
          fittedClaimed: claimed, fittedRead: null, shotT: shots[shots.length - 1] ? shots[shots.length - 1].t : null,
        };
        step('preparation', true, `hull ${doorInfo.hull || 'default'} · ${door.quote || 'no hull sentence'} · no armory shelf`);
      }
      await waitUntilFlight(page, { timeout: 600000, active: true });
      await waitBootOverlayGone(page);
      const st0 = await phaseNow();
      step('spawn', true, `flight · round ${st0.w} active at sim ${st0.sim.toFixed(1)} s`);
      trace.meta.playStartSim = st0.sim;
      trace.meta.runSeed = await page.evaluate(() => window.SF.state.run && window.SF.state.run.seed);
      let round = { wave: st0.w, startSim: st0.sim, startT: st0.t, endSim: null, endT: null, endPhase: null };
      trace.rounds.push(round);
      startStreams(() => `round ${round.wave}`);
      if (args.fight && !page.__ptPacing) { await installPacingWatch(page); page.__ptPacing = true; }
      let beat = 0; let first = true;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const ph = await phaseNow();
        stopReason = overBudget(trace.meta.playStartSim, ph.sim);
        if (ph.ph !== 'active' && round.endSim == null) {
          round.endSim = ph.sim; round.endT = ph.t; round.endPhase = ph.ph;
          log(`round ${round.wave} → ${ph.ph} after ${(ph.sim - round.startSim).toFixed(1)} sim s`);
          await shoot(`round ${round.wave} ${ph.ph}`, false);
          trace.transitions = trace.transitions || [];
          trace.transitions.push({ wave: round.wave, endSim: ph.sim, endPhase: ph.ph, hull: await page.evaluate(() => { const st = window.SF.state; const p = st.entityList.find((e) => e.id === st.playerId); return p ? { hull: p.hull, hullMax: p.hullMax, alive: p.alive !== false } : null; }).catch(() => null) });
        }
        if (stopReason) break;
        if (ph.ph === 'ended' || ph.ph === 'victory') { stopReason = `run ${ph.ph} (player ${ph.playerAlive ? 'alive' : 'dead'})`; await page.waitForTimeout(2500); await shoot('results', false); break; }
        if (ph.ph === 'active') {
          if (first) {
            round.startHull = await page.evaluate(() => { const st = window.SF.state; const p = st.entityList.find((e) => e.id === st.playerId); return p && p.hullMax ? +(p.hull / p.hullMax).toFixed(3) : null; }).catch(() => null);
            first = false;
            if (round === trace.rounds[0] && args.idle > 0) {
              log(`idle ${args.idle} sim s (no input)`);
              await waitSim(page, args.idle, { maxWallMs: 600000, until: (st) => !st.run || st.run.phase !== 'active' });
              if ((await phaseNow()).ph !== 'active') continue;
            }
            if (round !== trace.rounds[0]) await shoot(`round ${round.wave} start`, true);
            await controlProbes(page, `round ${round.wave}`, trace.probes);
            if (round !== trace.rounds[0]) await shoot(`round ${round.wave} after probes`, true);
            continue;
          }
          await fightBeat(page, beat++, args.fighter);
          continue;
        }
        if (ph.ph === 'draft' || ph.ph === 'cleanup' || ph.ph === 'refit') {
          if (trace.rounds.length >= args.rounds) { stopReason = `${args.rounds} rounds played`; break; }
          const word = await page.waitForFunction(() => { const n = (s) => String(s || '').replace(/\s+/g, ' ').trim(); const b = [...document.querySelectorAll('#screens button')].find((x) => x.offsetParent && !x.disabled && /^(Launch round \d+|Keep current loadout|Continue)/.test(n(x.textContent))); return b ? n(b.textContent) : null; }, null, { timeout: 300000 }).then((h) => h.jsonValue()).catch(() => null);
          if (!word) { stopReason = 'between-round screen had no launch word'; trace.route.steps.push({ name: 'next round', ok: false, detail: stopReason }); break; }
          await shoot(`between rounds (${word.replace(/Esc$/, '')})`, false);
          await clickText(page, word.replace(/Esc$/, '').trim());
          await page.waitForFunction(() => window.SF.state.run && window.SF.state.run.phase === 'active', null, { timeout: 300000 }).catch(() => null);
          const s1 = await phaseNow();
          if (s1.ph !== 'active') { stopReason = `next round did not start (phase ${s1.ph})`; trace.route.steps.push({ name: 'next round', ok: false, detail: stopReason }); break; }
          round = { wave: s1.w, startSim: s1.sim, startT: s1.t, endSim: null, endT: null, endPhase: null };
          trace.rounds.push(round); first = true;
          log(`round ${round.wave} active`);
          continue;
        }
        await page.waitForTimeout(500);
      }
      if (round.endSim == null) { const ph = await phaseNow(); round.cutSim = ph.sim; }
      step('play', true, `${trace.rounds.length} round(s): ${trace.rounds.map((r) => `${r.wave}:${r.endPhase || 'cut'}${r.endSim != null ? '@' + (r.endSim - r.startSim).toFixed(1) + 's' : ''}`).join(' ')}`);
    } else {
      if (args.mode === 'adventure') doorInfo = await adventureToFlight(page, step); else doorInfo = await racingToFlight(page, step);
      const st0 = await phaseNow();
      step('spawn', true, `flight at sim ${st0.sim.toFixed(1)} s`);
      trace.meta.playStartSim = st0.sim;
      startStreams(() => 'flight');
      if (args.fight) await installPacingWatch(page);
      log(`idle ${args.idle} sim s (no input)`);
      await waitSim(page, args.idle, { maxWallMs: 600000 });
      await controlProbes(page, 'spawn', trace.probes);
      let beat = 0;
      while (!(stopReason = overBudget(st0.sim, await simNow(page)))) {
        const ph = await phaseNow();
        if (ph.mode !== 'flight') { await page.waitForTimeout(800); if (Date.now() - T0 > wallCapMs) break; continue; }
        // A modal (tutorial card, dialogue) gets the keyboard answer a player gives: Enter/Space.
        if (ph.top && !['hud', null].includes(ph.top) && beat % 5 === 4) await page.keyboard.press('Enter');
        if (args.fight) await fightBeat(page, beat++); else await cruiseBeat(page, beat++);
      }
      step('play', true, `${((await simNow(page)) - st0.sim).toFixed(1)} sim s flown`);
    }
  } catch (err) {
    let quote = err && err.environmentQuote;
    if (!quote) quote = quoteLoadError(String(err && err.message || err));
    if (!quote) quote = await readLoadError(page);
    if (quote) {
      trace.meta.environmentQuote = quote;
      stopReason = `HARNESS ENVIRONMENT: route load failed: "${quote}"`;
      trace.route.steps.push({ name: 'route', ok: false, detail: quote, environment: true });
      console.error(stopReason);
      await shoot('route load error', false);
    } else {
      if (child) {
        await new Promise((r) => setTimeout(r, 400));
        if (child.exitCode != null || child.signalCode) note(`chrome exit ${child.exitCode} signal ${child.signalCode || 'none'}`);
        else if (typeof browser.isConnected === 'function' && !browser.isConnected()) note('browser not connected');
      }
      stopReason = formatRouteFailure(err && err.message || err, { notes: browserNotes });
      trace.route.steps.push({ name: 'route', ok: false, detail: stopReason });
      if (browserNotes.length) console.error('browser close notes:', browserNotes.join(' | '));
      console.error(err);
      await shoot('route failure', false);
    }
  } finally {
    clearInterval(shotTimer); clearInterval(drainTimer);
    while (busy) await new Promise((r) => setTimeout(r, 100));
    await drain().catch(() => {});
  }
  if (args.fight) {
    trace.pacing = summarizePacing(await page.evaluate(() => window.__ptPacing || []).catch(() => []));
    trace.pacing.director = await page.evaluate(() => {
      const st = window.SF.state; const d = st.encounterDirector || {}; const ob = st.onboarding || {};
      return { pending: (d.pending || []).map((i) => ({ shapeId: i.shapeId, dueAt: +(+i.dueAt).toFixed(1), defers: i.defers | 0, fireReadyHoldSince: i.fireReadyHoldSince ?? null })),
        stats: d.stats ? { fired: d.stats.fired, fizzled: d.stats.fizzled, resolved: d.stats.resolved, fireReadyExpired: d.stats.fireReadyExpired | 0 } : null,
        sectorId: st.world && st.world.currentSectorId, tension: st.tension && st.tension.phase, onboarding: { active: !!ob.active, finished: !!ob.finished, step: ob.stepId ?? ob.step ?? null } };
    }).catch((e) => ({ error: String(e) }));
  }
  const t1 = trace.samples.length ? trace.samples[trace.samples.length - 1] : null;
  const commit = (() => { try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { return 'unknown'; } })();
  const dirty = (() => { try { return execSync('git status --porcelain -- src scripts', { cwd: ROOT }).toString().trim().length > 0; } catch { return false; } })();
  const softwareGl = /swiftshader|llvmpipe|software|softpipe/i.test(renderer);
  const playStart = trace.meta.playStartSim;
  Object.assign(trace.meta, {
    label, browserExecutable: executable, hullPicked: extra.hull || null, hullsOffered: doorInfo && doorInfo.hulls ? doorInfo.hulls : null, idleSeconds: args.idle, seedSet: !!(doorInfo && doorInfo.seedSet), arena: arena || (doorInfo && doorInfo.arenas ? (doorInfo.arenas.find((x) => x.pressed) || {}).name : null) || null, seed: args.seed, commit, dirty, renderer, softwareGl, headed: args.headed, browserVersion,
    resolution: `${vw}x${vh}`, when: new Date().toISOString(), wallSeconds: Math.round((Date.now() - T0) / 1000),
    simSeconds: t1 && playStart != null ? +(t1.sim - playStart).toFixed(1) : 0, frames: trace.samples.length, shots: shots.length,
    script: `idle ${args.idle} s → thrust/yaw probes → ${args.mode === 'swarm' || args.mode === 'gauntlet' ? 'kiting fighter: aim+fire at nearest hostile, hold 230–400 u range, burn away from packs of 3+ inside 450 u, strafe, break off under fire, latch every 7th beat; probes + shots at every round start' : args.fight ? 'adventure fight: aim+fire at nearest hostile when one is in reach, else cruise' : 'cruise: thrust bursts and turns'}${args.gatePass ? ` · gate ${args.gatePass} pass` : ''} · no invulnerability (the only toggle is the physics-lab practice rack, not offered in Swarm/Gauntlet)`,
    stopReason, pageErrors: pageErrors.slice(0, 10), arenasOffered: doorInfo && doorInfo.arenas ? doorInfo.arenas : null,
  });
  await browser.close().catch(() => {}); await server.close().catch(() => {});

  const verdict = await gradeAndWrite({ trace, shots, outDir, label, evidence: args.evidence, pruneFrames: args.pruneFrames, vw, vh });
  return { label, verdict, outDir };
}

/** Scratch frames stay for review. They are removed only when --evidence and --prune-frames are both set. */
export function maybePruneFrames(outDir, { evidence = false, pruneFrames = false } = {}) {
  if (!evidence || !pruneFrames) return false;
  rmSync(path.join(outDir, 'frames'), { recursive: true, force: true });
  return true;
}

/** process.exit drops unflushed pipe buffers. Drain both streams, then exit. */
export function flushWritable(stream) {
  return new Promise((resolve) => {
    if (!stream || typeof stream.write !== 'function' || stream.destroyed || stream.writableEnded) { resolve(); return; }
    let settled = false;
    const finish = () => { if (!settled) { settled = true; clearTimeout(timer); resolve(); } };
    const timer = setTimeout(finish, 1000);
    try {
      stream.write('', () => finish());
    } catch { finish(); }
  });
}

export async function exitAfterFlush(code, { stdout = process.stdout, stderr = process.stderr, exit = process.exit } = {}) {
  await flushWritable(stdout);
  await flushWritable(stderr);
  exit(code);
}

/** Grade a recorded trace and write verdict.md/json, contact sheet and (with evidence) the compact copy. */
export async function gradeAndWrite({ trace, shots, outDir, label, evidence, pruneFrames = false, vw, vh }) {
  const nearestSample = (t) => { let best = null; let bd = Infinity; for (const s of trace.samples) { const d = Math.abs(s.t - t); if (d < bd) { bd = d; best = s; } } return bd < 2000 ? best : null; };
  trace.readability = await analyzeReadability(shots, nearestSample).catch((e) => ({ error: String(e) }));
  for (const c of (trace.readability && trace.readability.census) || []) c.name = trace.keys[c.ty] || null;
  const results = runChecks(trace);
  const verdict = overall(results);
  const paths = { verdict: path.relative(ROOT, path.join(outDir, 'verdict.md')), contactSheet: path.relative(ROOT, path.join(outDir, 'contact-sheet.jpg')), json: path.relative(ROOT, path.join(outDir, 'verdict.json')), trace: path.relative(ROOT, path.join(outDir, 'trace.json.gz')), frames: path.relative(ROOT, path.join(outDir, 'frames')) };
  const meta = { ...trace.meta, overall: verdict };
  await buildContactSheet({ shots, results, meta, outFile: path.join(outDir, 'contact-sheet.jpg'), vw, vh });
  const briefItem = (x) => ({ name: x.name, category: x.category, desc: x.desc });
  const compact = { meta, overall: verdict, results: results.map((r) => ({ ...r, offenders: (r.offenders || []).slice(0, 4) })), rounds: trace.rounds, probes: trace.probes, route: trace.route, pacing: trace.pacing || null, readability: trace.readability, loadout: trace.loadout && { ...trace.loadout, items: (trace.loadout.items || []).map(briefItem), fitted: (trace.loadout.fitted || []).map(briefItem) } };
  writeFileSync(path.join(outDir, 'verdict.json'), JSON.stringify(compact, null, 1));
  writeFileSync(path.join(outDir, 'trace.json.gz'), gzipSync(JSON.stringify({ ...trace, shots: shots.map((s) => ({ ...s, file: path.basename(s.file) })) })));
  if (evidence) {
    const evDir = path.join(ROOT, 'design/program/player-truth', label);
    mkdirSync(evDir, { recursive: true });
    await sharp(path.join(outDir, 'contact-sheet.jpg')).resize({ width: 1200 }).jpeg({ quality: 68 }).toFile(path.join(evDir, 'contact-sheet.jpg'));
    writeFileSync(path.join(evDir, 'verdict.json'), JSON.stringify(compact, null, 1));
    const evPaths = { verdict: path.relative(ROOT, path.join(evDir, 'verdict.md')), contactSheet: path.relative(ROOT, path.join(evDir, 'contact-sheet.jpg')), json: path.relative(ROOT, path.join(evDir, 'verdict.json')) };
    writeFileSync(path.join(evDir, 'verdict.md'), renderVerdict({ meta, results, overall: verdict, paths: evPaths }));
    maybePruneFrames(outDir, { evidence: true, pruneFrames });
  }
  writeFileSync(path.join(outDir, 'verdict.md'), renderVerdict({ meta, results, overall: verdict, paths }));
  printSummary({ meta, results, overall: verdict, paths });
  return verdict;
}

// CLI mode → the Crucible door's data-ruleset (Gauntlet is the 'scored' ruleset).
const RULESET = Object.freeze({ swarm: 'swarm', gauntlet: 'scored' });

async function assertHarnessEnvironment() {
  const server = await startBenchServer();
  let code = null;
  try {
    const env = await verifyHarnessEnvironment({ root: ROOT, baseUrl: server.baseUrl });
    if (!env.ok) {
      const commit = (() => { try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { return 'HEAD'; } })();
      const dir = path.join(ROOT, 'scratch/player-truth/environment');
      mkdirSync(dir, { recursive: true });
      const md = renderEnvironmentAbort({ problems: env.problems, commit, checked: env.checked, hashed: env.hashed });
      writeFileSync(path.join(dir, 'verdict.md'), md);
      console.error(md);
      code = ENVIRONMENT_EXIT;
    } else {
      console.log(`harness environment: ${env.checked} assets/design blobs match HEAD (${env.hashed} hashed)`);
    }
  } catch (err) {
    if (err && err.harnessError) { console.error(err.message || err); code = 3; }
    else throw err;
  } finally {
    await server.close().catch(() => {});
  }
  if (code != null) await exitAfterFlush(code);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  process.env.SPACEFACE_PLAYER_STORE_DIR = '';
  await assertHarnessEnvironment();
  let arenas = [args.arena];
  if (args.arena === 'all' && (args.mode === 'swarm' || args.mode === 'gauntlet')) {
    const server = await startBenchServer(); const { chromium } = await loadPlaywright();
    const { browser } = await launchChromium(chromium, { headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await bootToMenu(page, server.baseUrl, () => {});
    await clickText(page, 'Crucible', { exact: true });
    await page.locator(`#screens .sf-crd-mode[data-ruleset="${RULESET[args.mode] || args.mode}"]`).click();
    const door = await listDoorArenas(page);
    arenas = door.filter((a) => !a.disabled).map((a) => a.name);
    if (args.hull === 'all') { await clickText(page, 'Choose ship'); args.hullList = (await listHulls(page)).filter((h) => !h.locked).map((h) => h.id); }
    await browser.close(); await server.close();
    const locked = door.filter((a) => a.disabled).map((a) => a.name);
    console.log(`arenas reachable from the door: ${arenas.join(', ')}${locked.length ? ` · locked for a fresh profile: ${locked.join(', ')}` : ''}`);
  }
  if (args.hull === 'all' && !args.hullList && (args.mode === 'swarm' || args.mode === 'gauntlet')) {
    const server = await startBenchServer(); const { chromium } = await loadPlaywright();
    const { browser } = await launchChromium(chromium, { headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await bootToMenu(page, server.baseUrl, () => {});
    await clickText(page, 'Crucible', { exact: true });
    await page.locator(`#screens .sf-crd-mode[data-ruleset="${RULESET[args.mode] || args.mode}"]`).click();
    await clickText(page, 'Choose ship');
    const all = await listHulls(page); args.hullList = all.filter((h) => !h.locked).map((h) => h.id);
    console.log(`hulls offered: ${all.map((h) => `${h.face} (${h.id}${h.locked ? ', locked' : ''})`).join(', ')}`);
    await browser.close(); await server.close();
  }
  const hulls = args.hullList || [args.hull && args.hull !== 'all' ? args.hull : null];
  // --gate: an idle pass (passive kills/reward/spawn motion, the whole first round with no input) and an
  // active pass (fighter from ~3 s, must reach round 3); UNKNOWN on the core checks is a FAIL.
  const passes = gatePasses(args);
  const outcomes = [];
  const multiple = args.viewportList.length * hulls.length * arenas.length * passes.length > 1;
  for (const viewport of args.viewportList) for (const hull of hulls) for (const arena of arenas) for (const pass of passes) {
    const a = { ...args, viewport, ...pass, tag: pass.tag !== undefined ? [pass.tag, args.tag].filter(Boolean).join('-') || null : args.tag };
    outcomes.push(await runOne(a, arena, { hull, vpTag: args.viewportList.length > 1, multiple }));
  }
  if (outcomes.length > 1) {
    console.log('\nplayer-truth matrix:');
    for (const o of outcomes) console.log(`  ${o.verdict.padEnd(10)} ${o.label}  →  ${path.relative(ROOT, path.join(o.outDir, 'verdict.md'))}`);
  }
  if (args.baseline) {
    const { runBaseline } = await import('./compare.mjs');
    await runBaseline({ ref: args.baseline, argv: process.argv.slice(2), outcomes, root: ROOT });
  }
  const worst = gateExitCode(outcomes.map((o) => o.verdict));
  console.log(`player-truth exit ${worst}`);
  // Browser and bench server are already closed inside each run. Flush the verdict lines, then exit
  // so a pipe (the lock wrapper) cannot lose the exit code, and so a leftover handle cannot hold the lock.
  await exitAfterFlush(worst);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exitCode = 3; });
}
