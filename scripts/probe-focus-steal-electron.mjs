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
// THREE VERDICTS (2026-11-22). Windows refuses to hand the foreground to a background process while
// someone is using the machine, so a steal can silently not happen. The probe records operating-system
// ground truth at every step (the shell's own win.isFocused() and its native blur/focus events) and says:
//   pass          the game was in the foreground, lost it, paused with its plate, and resumed cleanly
//   FAIL          the game really lost the foreground and did not pause (or paused silently, or jumped)
//   inconclusive  the game never got the foreground, or never lost it: nothing was tested
// The steal comes from inside the game's own process (a second window it focuses itself, then
// win.blur() as a second way): the process that owns the foreground is always allowed to give it away.
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
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    globalThis.__sfFocusTruth = { blur: 0, focus: 0 };
    w.on('blur', () => { globalThis.__sfFocusTruth.blur++; });
    w.on('focus', () => { globalThis.__sfFocusTruth.focus++; });
  });
  // Operating-system ground truth, read from the shell process (document.hasFocus() stays true through a blur).
  const truth = () => app.evaluate(({ BrowserWindow }) => {
    const all = BrowserWindow.getAllWindows(); const game = all[all.length - 1];
    const g = all.find((w) => w.getTitle() !== 'focus thief') || game;
    return { gameFocused: g.isFocused(), gameVisible: g.isVisible(), minimized: g.isMinimized(), windows: all.length, ...globalThis.__sfFocusTruth };
  }).catch(() => null);
  // Put the game in the foreground, three ways, checking after each.
  const takeForeground = async () => {
    const tried = [];
    const game = () => app.evaluate(({ BrowserWindow }, how) => {
      const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() !== 'focus thief');
      if (!w) return false;
      if (how === 'focus') { w.show(); w.focus(); }
      if (how === 'top') { w.setAlwaysOnTop(true); w.show(); w.focus(); w.setAlwaysOnTop(false); }
      if (how === 'restore') { w.minimize(); w.restore(); w.focus(); }
      return true;
    }, how);
    let how;
    for (how of ['focus', 'top', 'restore']) {
      await game();
      await sleep(500);
      const now = await truth();
      tried.push({ how, focused: !!(now && now.gameFocused) });
      if (now && now.gameFocused) return { ok: true, tried };
    }
    return { ok: false, tried };
  };
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
  report.truth = {};
  report.truth.foreground = await takeForeground();
  report.truth.beforeSteal = await truth();
  await sleep(2000);
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
    const a = (Date.now() - t0m) / 1000 * 3.2;
    cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: vp.w / 2 + Math.cos(a) * vp.w * 0.12, y: vp.h / 2 + Math.sin(a) * vp.h * 0.12 }).catch(() => {});
  }, 33);
  // 1. Fly with W physically held.
  await key('keyDown'); repeating = true;
  await sleep(2000);
  // 2. Another process opens a focused window over the game. An unfocused window receives no key
  //    events from the OS, so the repeats stop reaching the game while the finger stays down.
  await phase('stolen');
  repeating = false;
  // Way one: the game's own process opens a second window and focuses it (always allowed: the
  // foreground owner may hand the foreground to its own window). Way two, if the game still holds
  // the foreground half a second later: win.blur().
  const stealWays = [];
  await app.evaluate(({ BrowserWindow }) => {
    const t2 = new BrowserWindow({ width: 760, height: 520, title: 'focus thief', show: true, backgroundColor: '#202830' });
    t2.loadURL('about:blank').catch(() => {});
    t2.focus();
    globalThis.__sfThief = t2;
  }).catch((e) => stealWays.push({ how: 'second window', error: String(e).slice(0, 120) }));
  await sleep(600);
  let during = await truth();
  stealWays.push({ how: 'second window in the game process', gameLostFocus: !!(during && during.gameFocused === false) });
  if (!(during && during.gameFocused === false)) {
    await app.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows().find((x) => x.getTitle() !== 'focus thief'); if (w) w.blur(); }).catch(() => {});
    await sleep(600);
    during = await truth();
    stealWays.push({ how: 'win.blur()', gameLostFocus: !!(during && during.gameFocused === false) });
  }
  report.truth.stealWays = stealWays;
  report.truth.duringSteal = during;
  await sleep(3400);
  report.truth.endOfSteal = await truth();
  await page.screenshot({ path: join(OUT, 'during-steal.png') }).catch(() => {});
  await app.evaluate(() => { try { if (globalThis.__sfThief && !globalThis.__sfThief.isDestroyed()) globalThis.__sfThief.destroy(); } catch (_) {} globalThis.__sfThief = null; }).catch(() => {});
  // 3. The owner comes back to the game window; the key is still held, so the OS resumes repeats.
  await phase('returned');
  report.truth.returnForeground = await takeForeground();
  repeating = true;
  await sleep(2500);
  report.truth.afterReturn = await truth();
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
  // Did the steal happen at all? Operating-system truth, not the page's opinion.
  const T = report.truth;
  const inconclusive = [];
  if (!(T.beforeSteal && T.beforeSteal.gameFocused === true)) inconclusive.push(`the game never got the foreground before the steal (tried: ${T.foreground.tried.map((x) => x.how + (x.focused ? ' ok' : ' refused')).join(', ')}): Windows refuses while someone is using the machine`);
  else if (!(T.duringSteal && T.duringSteal.gameFocused === false)) inconclusive.push(`the game never lost the foreground (tried: ${T.stealWays.map((x) => x.how + (x.gameLostFocus ? ' ok' : ' no')).join(', ')})`);
  else if (!(T.afterReturn && T.afterReturn.gameFocused === true)) inconclusive.push('the game did not get the foreground back, so the return was not tested');
  s.stolen.focusLost = !!(T.duringSteal && T.duringSteal.gameFocused === false);
  s.stolen.nativeBlurEvents = T.endOfSteal ? T.endOfSteal.blur : null;
  if (!settled.length) why.push('the game lost the foreground and did not pause (no scale-0 samples)');
  if (settled.length && !s.stolen.platePresent) why.push('the world was held with no pause plate');
  // Ruling: the pause may take up to 0.2 s to settle.
  if (s.stolen.simAdvancedAfterBlur > 0.2) why.push(`the world kept moving off screen (+${s.stolen.simAdvancedAfterBlur} s)`);
  // One worker batch (up to four 16.7 ms steps) can land between two samples; the owner's blip was seconds.
  if (resumeJump > 0.25) why.push(`resume jumped ${resumeJump.toFixed(2)} s ahead`);
  if (!(s.returned.timeScaleEnd > 0)) why.push('the world did not resume after focus returned');
  if (speedAtSteal != null && s.returned.speedEnd != null && speedAtSteal > 20 && s.returned.speedEnd < speedAtSteal * 0.5) {
    why.push(`the still-held W did nothing after focus returned (speed ${speedAtSteal.toFixed(0)} -> ${s.returned.speedEnd.toFixed(0)})`);
  }
  // The pause part is judged whenever the steal really happened; anything short of that is not a result.
  const stealHappened = T.beforeSteal && T.beforeSteal.gameFocused === true && T.duringSteal && T.duringSteal.gameFocused === false;
  report.verdict = !stealHappened ? 'inconclusive' : why.length ? 'FAIL' : inconclusive.length ? 'inconclusive' : 'pass';
  report.why = (report.verdict === 'FAIL' ? why : report.verdict === 'inconclusive' ? inconclusive : []).join('; ');
  console.log('focus-steal truth', JSON.stringify(report.truth));
  writeFileSync(join(OUT, 'samples.json'), JSON.stringify(samples));
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  console.log('focus-steal probe', report.verdict, report.why, JSON.stringify(report.summary));
} catch (e) {
  console.log('PROBE FAILED', String((e && e.stack) || e).slice(0, 800));
  process.exitCode = 2;
} finally {
  try { if (thief) await thief.close(); } catch { /* gone */ }
  if (report.verdict !== 'pass' && !process.exitCode) process.exitCode = report.verdict === 'inconclusive' ? 3 : 1;
  try { if (app) await app.close(); } catch { /* gone */ }
  try { launch.cleanup({ runtimeClosed: true }); } catch { /* best effort */ }
  try { if (ownerForeground) restoreForegroundWindow(ownerForeground); } catch { /* best effort */ }
}
