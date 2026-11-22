// Does the route autopilot cancel itself? (referee, 2026-11-22; check:playable LANE-FWD~LOAD
// reported the route to the next sector "interrupted: manual" with nobody at the controls.)
// Desktop build, new Adventure game, then three engagements of the route to a neighbouring sector:
//   A  hands off, mouse never moved since the last key press
//   B  mouse parked to one side of the ship (the default scheme points the nose at the cursor)
//   C  mouse parked, then W tapped during the leg (a real manual interrupt; must cancel)
// Logs what the simulation's input carries during each leg and how long the nav:waypoint receipt
// for a ui:setCourse takes to bridge back from the worker.
//
//   node scripts/fleet/game-lock.mjs run -- node scripts/probe-autopilot-manual.mjs [--out=<dir>]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const OUT = resolve(ROOT, String(argv.out || '.devshots/smooth/autopilot-manual'));
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { createIsolatedElectronLaunch } = await import('./lib/electronTestIsolation.mjs');
const { loadPlaywright } = await import('./lib/load-playwright.mjs');
const { installCspSafePlaywrightPolling } = await import('./lib/playwrightCspPolling.mjs');
const { installFirstLightPromptHandler } = await import('./player-truth/routes.mjs');
const { PRESS_THROUGH_SCREENS } = await import('./lib/playHand.mjs');
const { _electron: electron } = await loadPlaywright();
const launch = createIsolatedElectronLaunch({ root: ROOT, taskId: 'autopilot-manual', timeout: 180000, baseEnv: { ...process.env, SPACEFACE_EVIDENCE_PLAYER_WORKER_BUNDLE: '1' } });
const report = { legs: [], errors: [] };
let app = null;
try {
  app = await electron.launch(launch.options);
  const page = await app.firstWindow({ timeout: 180000 });
  installCspSafePlaywrightPolling(page);
  await installFirstLightPromptHandler(page, () => {});
  page.on('pageerror', (e) => { if (report.errors.length < 20) report.errors.push(String(e.message || e).slice(0, 300)); });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 240000 });
  await page.evaluate(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus && typeof window.SF.simLaneDiag === 'function', null, { timeout: 240000 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await page.evaluate(() => { const a = window.SF.state.settings && window.SF.state.settings.accessibility; if (a) a.firstLightOffered = true; window.SF.bus.emit('game:new', { seed: 4242 }); });
  const t0 = Date.now();
  for (;;) {
    const ok = await page.evaluate(() => { const s = window.SF.state; return s.mode === 'flight' && s.timeScale > 0 && Number.isFinite(s.render && s.render.firstPlayableFrameAt); }).catch(() => false);
    if (ok) break;
    await page.evaluate(PRESS_THROUGH_SCREENS).catch(() => {});
    if (Date.now() - t0 > 240000) throw new Error('no flight');
    await sleep(700);
  }
  await sleep(6000); // let the opening settle
  const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight }));
  const key = (type, code, k, vk) => cdp.send('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, ...(type === 'keyDown' ? { text: k } : {}) }).catch(() => {});
  const mouse = (x, y) => cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }).catch(() => {});
  // How long does a ui:setCourse receipt take to come back from the worker?
  report.receipt = await page.evaluate(() => new Promise((done) => {
    const st = window.SF.state; const p = st.entities.get(st.playerId);
    const started = performance.now(); let n = 0;
    window.SF.bus.on('nav:waypoint', (w) => { n++; if (w && w.reason === 'apProbe') done({ ms: Math.round(performance.now() - started), receipts: n }); });
    window.SF.bus.emit('ui:setCourse', { pos: { x: p.pos.x + 4000, y: 0, z: p.pos.z + 4000 }, label: 'APPROBE', reason: 'apProbe' });
    setTimeout(() => done({ ms: null, receipts: n, note: 'no receipt in 5 s' }), 5000);
  }));
  console.log('setCourse receipt', JSON.stringify(report.receipt));
  const leg = async (name, prepare, during) => {
    await prepare();
    await sleep(1200);
    const armed = await page.evaluate(() => {
      const st = window.SF.state; const sid = st.world.currentSectorId; const sector = st.world.sectors[sid];
      const hop = (sector.neighbors || []).find((n) => st.world.discovery && st.world.discovery[n] && st.world.discovery[n].discovered) || (sector.neighbors || [])[0];
      window.__ap = { rows: [], responses: [] };
      if (!window.__apHooked) { window.__apHooked = true; window.SF.bus.on('nav:routeExecutor', (r) => window.__ap.responses.push({ t: Math.round(performance.now()), status: r.status, transition: r.transition, reason: r.reason || null })); }
      window.SF.bus.emit('ui:setCourse', { sectorId: hop, reason: 'apProbe' });
      return { sid, hop };
    });
    await sleep(900);
    await page.evaluate(async () => {
      window.SF.bus.emit('nav:engageRoute', {});
      const A = window.__ap; const st = window.SF.state;
      A.timer = setInterval(async () => {
        const p = st.entities.get(st.playerId); const i = st.input || {};
        let w = null;
        try { const r = await window.SF.laneRpc('probeState', {}); const q = r && (r.result || r); w = q && q.input ? q.input : null; } catch (_) {}
        A.rows.push({ t: Math.round(performance.now()), exec: st.nav && st.nav.executor ? st.nav.executor.status : null, engaged: !!(st.nav && st.nav.executor && st.nav.executor.engaged),
          ap: !!(st.nav && st.nav.autopilot && st.nav.autopilot.active), rot: p ? +p.rot.toFixed(2) : null,
          moveX: i.moveX, moveZ: i.moveZ, turn: i.turnIntent != null ? +Number(i.turnIntent).toFixed(2) : null, fromAim: i.turnIntentFromAim, boost: i.boost, brake: i.brake,
          aim: i.aimAngle != null ? +Number(i.aimAngle).toFixed(2) : null, autopilotStamp: !!i.autopilot, worker: w });
      }, 150);
    });
    if (during) await during();
    await sleep(5000);
    const got = await page.evaluate(() => { clearInterval(window.__ap.timer); return { rows: window.__ap.rows, responses: window.__ap.responses }; });
    await page.evaluate(() => window.SF.bus.emit('nav:abortRoute', { reason: 'apProbeDone' })).catch(() => {});
    const interrupted = got.responses.find((r) => r.transition === 'interrupted');
    const first = got.rows.find((r) => Math.abs(r.turn || 0) > 0.08 || Math.abs(r.moveZ || 0) > 0.08 || Math.abs(r.moveX || 0) > 0.08 || r.boost || r.brake);
    const row = { name, ...armed, responses: got.responses, interrupted: interrupted ? interrupted.reason : null, firstNonZeroInput: first || null, rows: got.rows };
    report.legs.push(row);
    console.log(`leg ${name}: ${got.responses.map((r) => r.transition + (r.reason ? `(${r.reason})` : '')).join(' -> ') || 'no response'}; first non-zero input row: ${JSON.stringify(first || null)}`);
    await sleep(1500);
  };
  await leg('A hands off', async () => {});
  await leg('B mouse parked to the side', async () => { await mouse(vp.w * 0.5, vp.h * 0.2); await sleep(100); await mouse(vp.w * 0.5 + 3, vp.h * 0.2); });
  await leg('C W tapped during the leg', async () => { await mouse(vp.w * 0.8, vp.h * 0.5); }, async () => { await sleep(2500); await key('keyDown', 'KeyW', 'w', 87); await sleep(300); await key('keyUp', 'KeyW', 'w', 87); });
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
} catch (e) {
  console.log('PROBE FAILED', String((e && e.stack) || e).slice(0, 600));
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  process.exitCode = 2;
} finally {
  try { if (app) await app.close(); } catch { /* gone */ }
  try { launch.cleanup({ runtimeClosed: true }); } catch { /* best effort */ }
}
