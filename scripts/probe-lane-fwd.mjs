// Stage-9 remediation direct verification (worker lane):
//  (a) newGameBoot stages pendingGameStarted; first 'flight' MODE apply emits
//      game:started once on the worker (probeState.gameStartedEmits===1) and
//      the bridged replay fires main-side subscribers exactly once.
//  (b) bus.emit + bus.queue both forward (probeState.lastBusEmit observes).
//  (c) unforwardedEmitCount stays 0 for census-covered emits incl. KNOWN dead
//      subs (ui:restockBombRack) and INCREMENTS on a type outside both sets.
import { createServer as createNetServer } from 'node:net';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire('C:/Users/Administrator/repos/SpaceFace-s1/package.json');
const { chromium } = require('playwright');

const REPO = 'C:/Users/Administrator/repos/SpaceFace-s1';
const ok = [];
const bad = [];
const check = (name, cond, detail = '') => { (cond ? ok : bad).push(name); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

async function findFreePort(start) {
  for (let port = start; port < start + 80; port++) {
    const free = await new Promise((resolve) => {
      const s = createNetServer();
      s.once('error', () => resolve(false));
      s.once('listening', () => s.close(() => resolve(true)));
      s.listen(port, '127.0.0.1');
    });
    if (free) return port;
  }
  throw new Error('no free port');
}

const port = await findFreePort(8490);
const server = spawn(process.execPath, ['server.js', String(port)], { cwd: REPO, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e && e.message || e).slice(0, 200)));

try {
  await page.goto(`http://127.0.0.1:${port}/?simLane=worker`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.SF && window.SF.state && window.SF.bus, null, { timeout: 90000 });
  await page.waitForFunction(() => window.SF.state.mode === 'menu', null, { timeout: 60000 });
  await page.waitForTimeout(1500);

  await page.evaluate(() => {
    window.__gameStartedCount = 0;
    window.__navWaypointCount = 0;
    window.SF.bus.on('game:started', () => { window.__gameStartedCount += 1; });
    window.SF.bus.on('nav:waypoint', () => { window.__navWaypointCount += 1; });
  });

  // ---- a: staged receipt + single emit at the flight transition ----------
  const boot = await page.evaluate(async () => {
    const r = await window.SF.laneRpc('newGameBoot', { opts: {}, newGamePlus: null });
    const probe = await window.SF.laneRpc('probeState', {});
    return { bootAck: r && { ok: r.ok, result: r.result }, staged: probe && probe.result && probe.result.pendingGameStarted, startedEmits: probe && probe.result && probe.result.gameStartedEmits };
  });
  check('newGameBoot rpc ok', boot.bootAck && boot.bootAck.ok === true && boot.bootAck.result && boot.bootAck.result.ok === true, JSON.stringify(boot.bootAck));
  check('pendingGameStarted staged post-boot', boot.staged === true, `staged=${boot.staged}`);
  check('no game:started emitted before flight', boot.startedEmits === 0 && await page.evaluate(() => window.__gameStartedCount) === 0, `worker=${boot.startedEmits} main=${await page.evaluate(() => window.__gameStartedCount)}`);

  await page.evaluate(async () => {
    const sc = await import('/src/core/simLaneCommands.js');
    sc.laneSetMode(window.SF.state, window.SF.bus, 'flight');
  });
  await page.waitForTimeout(2500);
  const after = await page.evaluate(async () => {
    const probe = await window.SF.laneRpc('probeState', {});
    return {
      mode: probe && probe.result && probe.result.mode,
      pending: probe && probe.result && probe.result.pendingGameStarted,
      workerEmits: probe && probe.result && probe.result.gameStartedEmits,
      mainCount: window.__gameStartedCount,
      unfwd: (window.SF.simLaneDiag() || {}).unforwardedEmitCount,
    };
  });
  check('worker mode is flight', after.mode === 'flight', `mode=${after.mode}`);
  check('worker emitted game:started exactly once', after.workerEmits === 1, `emits=${after.workerEmits}`);
  check('receipt consumed (pending cleared)', after.pending === false, `pending=${after.pending}`);
  check('main-side subscriber fired exactly once (bridge replay)', after.mainCount === 1, `main=${after.mainCount}`);

  // ---- b: emit + queue both forward --------------------------------------
  await page.evaluate(() => window.SF.bus.emit('ui:setCourse', { sectorId: 'sector_helios_prime', reason: 'laneFwdProbe' }));
  await page.waitForTimeout(1200);
  const emitFwd = await page.evaluate(async () => {
    const probe = await window.SF.laneRpc('probeState', {});
    return { lastBusEmit: probe && probe.result && probe.result.lastBusEmit };
  });
  check('emit() forward reaches worker', emitFwd.lastBusEmit === 'ui:setCourse', `lastBusEmit=${emitFwd.lastBusEmit}`);

  await page.evaluate(() => {
    window.SF.bus.queue('settings:changed', { section: 'laneProbe', key: 'queuePath' });
    window.SF.bus.flush();
  });
  await page.waitForTimeout(1200);
  const queueFwd = await page.evaluate(async () => {
    const probe = await window.SF.laneRpc('probeState', {});
    return { lastBusEmit: probe && probe.result && probe.result.lastBusEmit };
  });
  check('queue() forward reaches worker', queueFwd.lastBusEmit === 'settings:changed', `lastBusEmit=${queueFwd.lastBusEmit}`);

  // ---- c: coverage accounting ---------------------------------------------
  await page.evaluate(() => window.SF.bus.emit('ui:restockBombRack', { reason: 'laneFwdProbe' }));
  await page.waitForTimeout(900);
  const known = await page.evaluate(async () => {
    const probe = await window.SF.laneRpc('probeState', {});
    const diag = window.SF.simLaneDiag() || {};
    return { unfwd: diag.unforwardedEmitCount, lastBusEmit: probe && probe.result && probe.result.lastBusEmit };
  });
  check('KNOWN dead-sub emit not forwarded and not counted', known.unfwd === 0 && known.lastBusEmit === 'settings:changed', `unfwd=${known.unfwd} last=${known.lastBusEmit}`);

  await page.evaluate(() => window.SF.bus.emit('zz:unlisted:probe', { reason: 'positiveControl' }));
  await page.waitForTimeout(600);
  const ctrl = await page.evaluate(() => {
    const diag = window.SF.simLaneDiag() || {};
    return { unfwd: diag.unforwardedEmitCount, types: diag.unforwardedEmitTypes };
  });
  check('uncounted emit trips unforwardedEmitCount', ctrl.unfwd === 1 && ctrl.types && ctrl.types['zz:unlisted:probe'] === 1, `unfwd=${ctrl.unfwd} types=${JSON.stringify(ctrl.types)}`);

  const diag = await page.evaluate(() => {
    const d = window.SF.simLaneDiag() || {};
    return { unfwdTypes: d.unforwardedEmitTypes, replyCount: d.replyCount, postedSteps: d.postedSteps, boundaryCaptureCount: d.boundaryCaptureCount };
  });
  console.log('lane diag:', JSON.stringify(diag));
} catch (err) {
  console.log('PROBE FAILED:', err.message.slice(0, 300));
} finally {
  await browser.close();
  server.kill();
}
console.log(`\n${ok.length} passed, ${bad.length} failed${bad.length ? ': ' + bad.join(', ') : ''}`);
process.exit(bad.length ? 1 : 0);
