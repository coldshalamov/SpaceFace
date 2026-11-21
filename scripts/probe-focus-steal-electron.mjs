// FOCUS-STEAL probe (lane audit A3/C1, 2026-11-21). The one probe that MUST take focus: it runs the
// desktop build in a normal focused window (SPACEFACE_TEST_VISIBLE=1), flies Swarm with W physically
// held (OS-style auto-repeat), then a SEPARATE process opens a focused browser window over it — what
// our own test windows, toasts and overlays do on the owner's machine. It measures:
//   during the steal: does simulation time stop (worker steps, pose-table sim time), is a pause plate
//                     on screen, what holds the time-effects ledger carries;
//   on return:        does the world resume from the same instant (no jump), does the still-held
//                     key work again without being re-pressed (the OS only sends repeats for it).
// It hands foreground focus back to whatever had it before the run.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/probe-focus-steal-electron.mjs [--out=<dir>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] ?? true] : [a, true];
}));
const OUT = resolve(ROOT, String(argv.out || '.devshots/no-freeze/focus-steal'));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.env.SPACEFACE_TEST_VISIBLE = '1'; // this probe takes focus on purpose

const { createIsolatedElectronLaunch } = await import('./lib/electronTestIsolation.mjs');
const { loadPlaywright } = await import('./lib/load-playwright.mjs');
const { installCspSafePlaywrightPolling } = await import('./lib/playwrightCspPolling.mjs');
const { installFirstLightPromptHandler } = await import('./player-truth/routes.mjs');
const { captureForegroundWindow, restoreForegroundWindow } = await import('./lib/quietLaunch.mjs');
const pw = await loadPlaywright();
const ownerForeground = (() => { try { return captureForegroundWindow(); } catch (_) { return null; } })();
const launch = createIsolatedElectronLaunch({ root: ROOT, taskId: 'focus-steal', timeout: 180000,
  baseEnv: { ...process.env, SPACEFACE_TEST_VISIBLE: '1' } });
const report = { errors: [] };
let app = null; let thief = null;
try {
  app = await pw._electron.launch(launch.options);
  const page = await app.firstWindow({ timeout: 180000 });
  installCspSafePlaywrightPolling(page);
  await installFirstLightPromptHandler(page, () => {});
  page.on('pageerror', (e) => { if (report.errors.length < 20) report.errors.push(String(e.message || e).slice(0, 300)); });
  await page.waitForLoadState('domcontentloaded', { timeout: 180000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 240000 });
  const focusGame = () => app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]; if (w) { w.show(); w.focus(); } return !!w;
  });
  await focusGame();
  // Swarm (round 2): the Adventure opening neutralises flight input, so W could not be measured there.
  // The hold is kept short (2 s before, 2.5 s after) so the ship cannot reach the arena rim.
  await page.waitForFunction(() => {
    const ui = window.SF.registry && window.SF.registry.get && window.SF.registry.get('ui');
    const m = ui && (ui.screenManager || ui.manager);
    return !!(m && typeof m.hasScreen === 'function' && m.hasScreen('crucibleDraft'));
  }, null, { timeout: 120000 }).catch(() => {});
  await page.evaluate(async () => {
    const { swarmStartAtRound, swarmArcadeSeedFor } = await import('/src/data/swarmLadder.js');
    const L = await import('/src/ui/crucibleLaunch.js');
    const { SWARM_RULESET } = await import('/src/data/swarmMode.js');
    const start = swarmStartAtRound('2');
    const arenaId = L.CRUCIBLE_ARENA_ID;
    const setup = L.crucibleSetupFor({ starterId: L.CRUCIBLE_DEFAULT_STARTER_ID,
      seed: swarmArcadeSeedFor(arenaId) || L.freshSeed(), arenaId, ruleset: SWARM_RULESET, startWave: start.startWave });
    const access = window.SF.state.settings && window.SF.state.settings.accessibility;
    if (access) access.firstLightOffered = true;
    L.requestCrucibleRun(window.SF.bus, setup, SWARM_RULESET);
  });
  const t0 = Date.now();
  for (;;) {
    const ok = await page.evaluate(() => { const s = window.SF.state; return s.mode === 'flight' && s.timeScale > 0
      && Number.isFinite(s.render && s.render.firstPlayableFrameAt); }).catch(() => false);
    if (ok) break;
    await page.evaluate(() => {
      const n = (s) => String(s || '').replace(/\s+/g, ' ').trim();
      const b = [...document.querySelectorAll('#screens button')].find((x) => x.offsetParent && !x.disabled
        && /^(Launch round \d+|Launch|Keep current loadout|Continue|Start run|Begin|Undock|Skip)/i.test(n(x.textContent)));
      if (b) b.click();
    }).catch(() => {});
    if (Date.now() - t0 > 240000) throw new Error('no flight');
    await sleep(1000);
  }
  await focusGame();
  await sleep(2500);
  // In-page sampler (20 Hz).
  await page.evaluate(async () => {
    const { createTimeEffects } = await import('/src/core/timeEffects.js');
    const w = { samples: [], phase: 'fly' };
    window.__fs = w;
    w.timer = setInterval(() => {
      const s = window.SF.state;
      let g = null; try { g = window.SF.simLaneDiag(); } catch (_) {}
      const pt = g && g.poseTable;
      const c = (g && g.workerClockLastDiagnostics) || {};
      const p = s.entities && s.entities.get ? s.entities.get(s.playerId) : null;
      let holds = null;
      try { holds = createTimeEffects(s).describeRequests().map((r) => `${r.source || r.id}:${r.scale}`); } catch (_) {}
      w.samples.push({ t: performance.now(), ph: w.phase, ts: s.timeScale, mode: s.mode,
        sim: pt && pt.active ? pt.simTime : s.simTime, steps: c.steps ?? null,
        tableWrites: pt && pt.reader ? pt.reader.advances : null,
        speed: p && p.vel ? Math.hypot(p.vel.x, p.vel.z) : null,
        plate: !!document.getElementById('sf-focus-pause'), focus: document.hasFocus(), holds });
    }, 50);
  });
  const cdp = await page.context().newCDPSession(page);
  const key = (type, autoRepeat = false) => cdp.send('Input.dispatchKeyEvent', { type, code: 'KeyW', key: 'w',
    windowsVirtualKeyCode: 87, nativeVirtualKeyCode: 87, autoRepeat, ...(type === 'keyDown' ? { text: 'w' } : {}) }).catch(() => {});
  const phase = (n) => page.evaluate((x) => { window.__fs.phase = x; }, n);
  let repeating = false;
  // The nose follows the cursor: circle it so a held W flies loops, not into the arena rim.
  const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const t0m = Date.now();
  const repeater = setInterval(() => {
    if (!repeating) return;
    key('keyDown', true);
    const a = (Date.now() - t0m) / 1000 * 1.8;
    cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: vp.w / 2 + Math.cos(a) * vp.w * 0.25, y: vp.h / 2 + Math.sin(a) * vp.h * 0.25 }).catch(() => {});
  }, 33);
  // 1. Fly with W physically held.
  await key('keyDown'); repeating = true;
  await sleep(2000);
  // 2. Another process opens a focused window over the game. An unfocused window receives no key
  //    events from the OS, so the repeats stop reaching the game while the finger stays down.
  await phase('stolen');
  repeating = false;
  thief = await pw.chromium.launch({ headless: false, args: ['--new-window', '--window-size=900,600'] });
  const tp = await thief.newPage();
  await tp.goto('about:blank').catch(() => {});
  await tp.bringToFront().catch(() => {});
  await sleep(4000);
  await page.screenshot({ path: join(OUT, 'during-steal.png') }).catch(() => {});
  await thief.close(); thief = null;
  // 3. The owner comes back to the game window; the key is still held, so the OS resumes repeats.
  await phase('returned');
  await focusGame();
  repeating = true;
  await sleep(2500);
  await page.screenshot({ path: join(OUT, 'after-return.png') }).catch(() => {});
  repeating = false; clearInterval(repeater); await key('keyUp');
  const samples = await page.evaluate(() => { clearInterval(window.__fs.timer); return window.__fs.samples; });
  const by = (ph) => samples.filter((s) => s.ph === ph);
  const span = (rows, f) => (rows.length > 1 ? f(rows.at(-1)) - f(rows[0]) : null);
  const stolen = by('stolen'); const fly = by('fly'); const back = by('returned');
  const settled = stolen.filter((s) => s.t - stolen[0].t > 700 && s.ts === 0);
  // A jump is sim time advancing faster than wall time between two samples.
  let resumeJump = 0;
  for (let i = 1; i < back.length; i++) {
    resumeJump = Math.max(resumeJump, (back[i].sim - back[i - 1].sim) - (back[i].t - back[i - 1].t) / 1000);
  }
  const speedAtSteal = stolen[0]?.speed ?? null;
  report.summary = {
    fly: { simAdvanced: span(fly, (s) => s.sim), wallS: span(fly, (s) => s.t / 1000), speedEnd: fly.at(-1)?.speed },
    stolen: {
      focusLost: settled.every((s) => s.focus === false),
      simAdvancedAfterBlur: span(settled, (s) => s.sim),
      workerStepsAfterBlur: span(settled, (s) => s.steps),
      timeScale: [...new Set(settled.map((s) => s.ts))],
      platePresent: settled.length ? settled.every((s) => s.plate) : null,
      holds: settled.at(-1)?.holds,
    },
    returned: {
      plateCleared: back.length ? !back.at(-1).plate : null,
      timeScaleEnd: back.at(-1)?.ts,
      simAheadOfWallS: +resumeJump.toFixed(3),
      speedAtSteal,
      speedEnd: back.at(-1)?.speed,
    },
  };
  const s = report.summary;
  const why = [];
  if (!settled.length) why.push('the focus steal never paused the world (no scale-0 samples)');
  if (settled.length && !s.stolen.platePresent) why.push('the world was held with no pause plate');
  if (s.stolen.simAdvancedAfterBlur > 0.05) why.push(`the world kept moving off screen (+${s.stolen.simAdvancedAfterBlur} s)`);
  // One worker batch (up to four 16.7 ms steps) can land between two samples; the owner's blip was seconds.
  if (resumeJump > 0.25) why.push(`resume jumped ${resumeJump.toFixed(2)} s ahead`);
  if (!(s.returned.timeScaleEnd > 0)) why.push('the world did not resume after focus returned');
  if (speedAtSteal != null && s.returned.speedEnd != null && speedAtSteal > 20 && s.returned.speedEnd < speedAtSteal * 0.5) {
    why.push(`the still-held W did nothing after focus returned (speed ${speedAtSteal.toFixed(0)} -> ${s.returned.speedEnd.toFixed(0)})`);
  }
  report.verdict = why.length ? 'FAIL' : 'pass';
  report.why = why.join('; ');
  writeFileSync(join(OUT, 'samples.json'), JSON.stringify(samples));
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  console.log('focus-steal probe', report.verdict, report.why, JSON.stringify(report.summary));
} catch (e) {
  console.log('PROBE FAILED', String((e && e.stack) || e).slice(0, 800));
  process.exitCode = 2;
} finally {
  try { if (thief) await thief.close(); } catch { /* gone */ }
  try { if (app) await app.close(); } catch { /* gone */ }
  try { launch.cleanup({ runtimeClosed: true }); } catch { /* best effort */ }
  try { if (ownerForeground) restoreForegroundWindow(ownerForeground); } catch { /* best effort */ }
}
