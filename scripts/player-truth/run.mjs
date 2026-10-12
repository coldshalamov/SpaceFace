#!/usr/bin/env node
// Player-truth harness: play what the player plays, see what the player sees, fail loudly.
//
//   npm run player-truth -- --mode=swarm [--arena="Ricochet Foundry"|all] [--seed=4242]
//   npm run player-truth -- --mode=adventure|racing|gauntlet [--duration=300]
//   flags: --headed (GPU Chrome, preferred) · --rounds=3 · --duration=<sim s> · --wall=<min>
//          --idle=<sim s> · --viewport=WxH (1280x720 headed, 960x540 software GL) · --out=<dir> · --evidence (copy compact result
//          into design/program/player-truth/<label>/)
//
// Drives the real public route in a real rendered browser with trusted keyboard/mouse input,
// samples live telemetry with src/testing/playerTruth/reader.js (observer only), takes periodic
// screenshots, runs scripts/player-truth/checks.mjs and writes verdict.md + contact-sheet.jpg.
// Exit code: 0 PASS, 1 FAIL, 2 INCOMPLETE (a check could not measure), 3 harness error.

import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { loadPlaywright } from '../lib/load-playwright.mjs';
import { startBenchServer } from '../lib/benchServer.mjs';
import { runChecks, overall } from './checks.mjs';
import { analyzeReadability } from './readability.mjs';
import { buildContactSheet } from './contactSheet.mjs';
import { renderVerdict, printSummary } from './verdict.mjs';
import { bootToMenu, crucibleToArmory, readArmory, auditItems, swapProbe, armoryLaunchWord, clickText, waitBootOverlayGone, adventureToFlight, racingToFlight, listDoorArenas } from './routes.mjs';
import { waitSim, simNow, wallNow, controlProbes, fightBeat, cruiseBeat } from './driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODES = ['swarm', 'gauntlet', 'adventure', 'racing'];

export function parseArgs(argv) {
  const a = { mode: 'swarm', arena: null, seed: 4242, rounds: 3, duration: null, wall: null, idle: 6, headed: false, viewport: null, out: null, evidence: false, shotEvery: null };
  for (const raw of argv) {
    const m = raw.match(/^--([^=]+)(?:=(.*))?$/); if (!m) continue;
    const [, k, v] = m;
    if (k === 'headed' || k === 'gpu') a.headed = true;
    else if (k === 'evidence') a.evidence = true;
    else if (k === 'shot-every') a.shotEvery = Number(v);
    else if (k in a) a[k] = v === undefined ? true : (typeof a[k] === 'number' ? Number(v) : v);
  }
  if (!MODES.includes(a.mode)) throw new Error(`--mode must be one of ${MODES.join(', ')}`);
  // SwiftShader fill cost dominates a software run; a smaller canvas keeps a bounded run in minutes.
  a.viewport = a.viewport || (a.headed ? '1280x720' : '960x540');
  a.duration = a.duration || { swarm: 180, gauntlet: 180, adventure: 300, racing: 180 }[a.mode];
  return a;
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function runOne(args, arena) {
  const label = [args.mode, arena ? slug(arena) : null].filter(Boolean).join('-');
  const outDir = path.resolve(ROOT, args.out || path.join('scratch/player-truth', label));
  rmSync(outDir, { recursive: true, force: true }); mkdirSync(path.join(outDir, 'frames'), { recursive: true });
  const [vwStr, vhStr] = args.viewport.split('x'); const vw = Number(vwStr); const vh = Number(vhStr);
  const wallCapMs = (args.wall || (args.headed ? 10 : 40)) * 60000;
  const shotEveryMs = (args.shotEvery || (args.headed ? 1 : 3)) * 1000;
  const T0 = Date.now();
  const log = (...m) => console.log(`[${label} ${((Date.now() - T0) / 1000).toFixed(0)}s]`, ...m);
  const trace = { meta: { mode: args.mode, rounds: args.mode === 'swarm' || args.mode === 'gauntlet', hasLoadout: args.mode === 'swarm' }, samples: [], events: [], longTasks: [], keys: [], rounds: [], probes: [], route: { steps: [] }, loadout: null, readability: null };
  const shots = [];
  const step = (name, ok, detail) => { trace.route.steps.push({ name, ok, detail, t: null }); log(`${ok ? 'ok ' : 'XX '} ${name} — ${detail}`); };

  const server = await startBenchServer();
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({
    headless: !args.headed,
    args: args.headed
      ? ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-renderer-backgrounding', '--disable-background-timer-throttling'],
  });
  const page = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e).slice(0, 200)));
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
    await page.addScriptTag({ type: 'module', content: "import { installPlayerTruthReader } from '/src/testing/playerTruth/reader.js'; installPlayerTruthReader(window, { vfxEvery: 4 }).start(); window.__playerTruthReady = true;" });
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
      doorInfo = await crucibleToArmory(page, { ruleset: RULESET[args.mode] || args.mode, arena, seed: args.seed }, step);
      if (args.mode === 'swarm') {
        await page.waitForFunction(() => { const n = (s) => String(s || '').replace(/\s+/g, ' '); return [...document.querySelectorAll('#screens button')].some((x) => x.offsetParent && !x.disabled && /Launch round 1/.test(n(x.textContent))); }, null, { timeout: 600000 });
        await waitBootOverlayGone(page);
        await shoot('armory', false);
        const items = await readArmory(page);
        const audit = auditItems(args.mode, items);
        const probe = await swapProbe(page, 3);
        trace.loadout = { items, ...audit, ...probe, shotT: shots[shots.length - 1].t };
        await shoot('armory after installs', false);
        step('preparation', true, `hull ${doorInfo.hull || 'default'} · ${items.length} armory offers read · ${probe.swapProbe}`);
        const word = await armoryLaunchWord(page);
        await clickText(page, word || 'Launch round 1');
      }
      await page.waitForFunction(() => window.SF.state.mode === 'flight' && window.SF.state.run && window.SF.state.run.phase === 'active', null, { timeout: 600000 });
      await waitBootOverlayGone(page);
      const st0 = await phaseNow();
      step('spawn', true, `flight · round ${st0.w} active at sim ${st0.sim.toFixed(1)} s`);
      trace.meta.playStartSim = st0.sim;
      trace.meta.runSeed = await page.evaluate(() => window.SF.state.run && window.SF.state.run.seed);
      let round = { wave: st0.w, startSim: st0.sim, startT: st0.t, endSim: null, endT: null, endPhase: null };
      trace.rounds.push(round);
      startStreams(() => `round ${round.wave}`);
      let beat = 0; let first = true;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const ph = await phaseNow();
        stopReason = overBudget(trace.meta.playStartSim, ph.sim);
        if (ph.ph !== 'active' && round.endSim == null) {
          round.endSim = ph.sim; round.endT = ph.t; round.endPhase = ph.ph;
          log(`round ${round.wave} → ${ph.ph} after ${(ph.sim - round.startSim).toFixed(1)} sim s`);
          await shoot(`round ${round.wave} ${ph.ph}`, false);
        }
        if (stopReason) break;
        if (ph.ph === 'ended' || ph.ph === 'victory') { stopReason = `run ${ph.ph} (player ${ph.playerAlive ? 'alive' : 'dead'})`; await page.waitForTimeout(2500); await shoot('results', false); break; }
        if (ph.ph === 'active') {
          if (first) {
            first = false;
            if (round === trace.rounds[0] && args.idle > 0) {
              log(`idle ${args.idle} sim s (no input)`);
              await waitSim(page, args.idle, { maxWallMs: 600000, until: (st) => !st.run || st.run.phase !== 'active' });
              if ((await phaseNow()).ph !== 'active') continue;
            }
            await controlProbes(page, `round ${round.wave}`, trace.probes);
            continue;
          }
          await fightBeat(page, beat++);
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
      log(`idle ${args.idle} sim s (no input)`);
      await waitSim(page, args.idle, { maxWallMs: 600000 });
      await controlProbes(page, 'spawn', trace.probes);
      let beat = 0;
      while (!(stopReason = overBudget(st0.sim, await simNow(page)))) {
        const ph = await phaseNow();
        if (ph.mode !== 'flight') { await page.waitForTimeout(800); if (Date.now() - T0 > wallCapMs) break; continue; }
        // A modal (tutorial card, dialogue) gets the keyboard answer a player gives: Enter/Space.
        if (ph.top && !['hud', null].includes(ph.top) && beat % 5 === 4) await page.keyboard.press('Enter');
        await cruiseBeat(page, beat++);
      }
      step('play', true, `${((await simNow(page)) - st0.sim).toFixed(1)} sim s flown`);
    }
  } catch (err) {
    stopReason = `harness/route error: ${String(err && err.message || err).split('\n')[0].slice(0, 200)}`;
    trace.route.steps.push({ name: 'route', ok: false, detail: stopReason });
    console.error(err);
    await shoot('route failure', false);
  } finally {
    clearInterval(shotTimer); clearInterval(drainTimer);
    while (busy) await new Promise((r) => setTimeout(r, 100));
    await drain().catch(() => {});
  }
  const t1 = trace.samples.length ? trace.samples[trace.samples.length - 1] : null;
  const commit = (() => { try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { return 'unknown'; } })();
  const dirty = (() => { try { return execSync('git status --porcelain -- src scripts', { cwd: ROOT }).toString().trim().length > 0; } catch { return false; } })();
  const softwareGl = /swiftshader|llvmpipe|software|softpipe/i.test(renderer);
  const playStart = trace.meta.playStartSim;
  Object.assign(trace.meta, {
    label, seedSet: !!(doorInfo && doorInfo.seedSet), arena: arena || (doorInfo && doorInfo.arenas ? (doorInfo.arenas.find((x) => x.pressed) || {}).name : null) || null, seed: args.seed, commit, dirty, renderer, softwareGl, headed: args.headed, browserVersion,
    resolution: `${vw}x${vh}`, when: new Date().toISOString(), wallSeconds: Math.round((Date.now() - T0) / 1000),
    simSeconds: t1 && playStart != null ? +(t1.sim - playStart).toFixed(1) : 0, frames: trace.samples.length, shots: shots.length,
    script: `idle ${args.idle} s → thrust/yaw probes → ${args.mode === 'swarm' || args.mode === 'gauntlet' ? 'aim+fire at nearest hostile, close/open range, latch every 7th beat' : 'cruise: thrust bursts and turns'}`,
    stopReason, pageErrors: pageErrors.slice(0, 10), arenasOffered: doorInfo && doorInfo.arenas ? doorInfo.arenas : null,
  });
  await browser.close().catch(() => {}); await server.close().catch(() => {});

  const verdict = await gradeAndWrite({ trace, shots, outDir, label, evidence: args.evidence, vw, vh });
  return { label, verdict, outDir };
}

/** Grade a recorded trace and write verdict.md/json, contact sheet and (with evidence) the compact copy. */
export async function gradeAndWrite({ trace, shots, outDir, label, evidence, vw, vh }) {
  const nearestSample = (t) => { let best = null; let bd = Infinity; for (const s of trace.samples) { const d = Math.abs(s.t - t); if (d < bd) { bd = d; best = s; } } return bd < 2000 ? best : null; };
  trace.readability = await analyzeReadability(shots, nearestSample).catch((e) => ({ error: String(e) }));
  const results = runChecks(trace);
  const verdict = overall(results);
  const paths = { verdict: path.relative(ROOT, path.join(outDir, 'verdict.md')), contactSheet: path.relative(ROOT, path.join(outDir, 'contact-sheet.jpg')), json: path.relative(ROOT, path.join(outDir, 'verdict.json')), trace: path.relative(ROOT, path.join(outDir, 'trace.json.gz')), frames: path.relative(ROOT, path.join(outDir, 'frames')) };
  const meta = { ...trace.meta, overall: verdict };
  await buildContactSheet({ shots, results, meta, outFile: path.join(outDir, 'contact-sheet.jpg'), vw, vh });
  const compact = { meta, overall: verdict, results: results.map((r) => ({ ...r, offenders: (r.offenders || []).slice(0, 4) })), rounds: trace.rounds, probes: trace.probes, route: trace.route, readability: trace.readability, loadout: trace.loadout && { ...trace.loadout, items: trace.loadout.items.map((x) => ({ name: x.name, category: x.category, desc: x.desc })) } };
  writeFileSync(path.join(outDir, 'verdict.json'), JSON.stringify(compact, null, 1));
  writeFileSync(path.join(outDir, 'trace.json.gz'), gzipSync(JSON.stringify({ ...trace, shots: shots.map((s) => ({ ...s, file: path.basename(s.file) })) })));
  if (evidence) {
    const evDir = path.join(ROOT, 'design/program/player-truth', label);
    mkdirSync(evDir, { recursive: true });
    await sharp(path.join(outDir, 'contact-sheet.jpg')).resize({ width: 1200 }).jpeg({ quality: 68 }).toFile(path.join(evDir, 'contact-sheet.jpg'));
    writeFileSync(path.join(evDir, 'verdict.json'), JSON.stringify(compact, null, 1));
    const evPaths = { verdict: path.relative(ROOT, path.join(evDir, 'verdict.md')), contactSheet: path.relative(ROOT, path.join(evDir, 'contact-sheet.jpg')), json: path.relative(ROOT, path.join(evDir, 'verdict.json')) };
    writeFileSync(path.join(evDir, 'verdict.md'), renderVerdict({ meta, results, overall: verdict, paths: evPaths }));
  }
  writeFileSync(path.join(outDir, 'verdict.md'), renderVerdict({ meta, results, overall: verdict, paths }));
  printSummary({ meta, results, overall: verdict, paths });
  return verdict;
}

// CLI mode → the Crucible door's data-ruleset (Gauntlet is the 'scored' ruleset).
const RULESET = Object.freeze({ swarm: 'swarm', gauntlet: 'scored' });

async function main() {
  const args = parseArgs(process.argv.slice(2));
  process.env.SPACEFACE_PLAYER_STORE_DIR = '';
  let arenas = [args.arena];
  if (args.arena === 'all' && (args.mode === 'swarm' || args.mode === 'gauntlet')) {
    const server = await startBenchServer(); const { chromium } = await loadPlaywright();
    const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await bootToMenu(page, server.baseUrl, () => {});
    await clickText(page, 'Crucible', { exact: true });
    await page.locator(`#screens .sf-crd-mode[data-ruleset="${RULESET[args.mode] || args.mode}"]`).click();
    const door = await listDoorArenas(page);
    arenas = door.filter((a) => !a.disabled).map((a) => a.name);
    await browser.close(); await server.close();
    const locked = door.filter((a) => a.disabled).map((a) => a.name);
    console.log(`arenas reachable from the door: ${arenas.join(', ')}${locked.length ? ` · locked for a fresh profile: ${locked.join(', ')}` : ''}`);
  }
  const outcomes = [];
  for (const arena of arenas) outcomes.push(await runOne(args, arena));
  const worst = outcomes.some((o) => o.verdict === 'FAIL') ? 1 : outcomes.some((o) => o.verdict !== 'PASS') ? 2 : 0;
  process.exitCode = worst;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(err); process.exitCode = 3; });
}
