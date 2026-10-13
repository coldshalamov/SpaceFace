// Browser-loss classification. No Chrome: a page close is a route FAIL until a signal,
// a disconnect, a kernel OOM, or a recorded SIGHUP/SIGTERM proves the environment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const cp = require('node:child_process');
import {
  BROWSER_LOSS_SETTLE_MS, applyHarnessLaunchOptions, chromeOwnsProcessGroup, chromeStderrNotes,
  classifyBrowserLoss, dmesgStampMs, installSessionSignalGuard, isChromeExecutable, isKernelOomKillLine,
  launchChromium, parseKernelOomLines, parseProcStat, signalsSince, withChromeSpawnCapture,
} from '../scripts/player-truth/browser.mjs';
import { checkRoute, overall } from '../scripts/player-truth/checks.mjs';
import { environmentRetryNote, formatRouteFailure } from '../scripts/player-truth/run.mjs';
import { renderVerdict } from '../scripts/player-truth/verdict.mjs';

const OCT12 = '[Mon Oct 12 07:59:23 2026] Out of memory: Killed process 57481 (node) total-vm:64231484kB, anon-rss:10769936kB, file-rss:2648kB, shmem-rss:0kB, UID:1000 pgtables:27652kB oom_score_adj:0';
const OCT12_OOM = '[Mon Oct 12 07:59:23 2026] oom-kill:constraint=CONSTRAINT_NONE,nodemask=(null),cpuset=interactive,mems_allowed=0,global_oom,task_memcg=/agent,task=node,pid=57481,uid=1000';
const OCT12_INVOKED = '[Mon Oct 12 07:59:57 2026] chrome-headless invoked oom-killer: gfp_mask=0x140cca(GFP_HIGHUSER_MOVABLE|__GFP_COMP), order=0, oom_score_adj=0';
const PUFF = '[Tue Oct 13 04:11:20 2026] virtio_balloon virtio0: Out of puff! Can\'t get 1 pages';
const OCT13_KILL = '[Tue Oct 13 04:20:00 2026] Out of memory: Killed process 42 (chrome) total-vm:1000kB, anon-rss:1000kB, file-rss:0kB, shmem-rss:0kB, UID:1000 pgtables:1kB oom_score_adj:0';

test('launch options keep SIGINT and refuse SIGHUP and SIGTERM handlers', async () => {
  const seen = [];
  const chromium = { launch: async (options) => { seen.push(options); return { close: async () => {} }; } };
  const out = await launchChromium(chromium, {
    headless: true, handleSIGHUP: true, handleSIGTERM: true, args: ['--use-angle=swiftshader'],
  });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].handleSIGHUP, false);
  assert.equal(seen[0].handleSIGTERM, false);
  assert.equal(seen[0].handleSIGINT, true);
  assert.deepEqual(seen[0].args, ['--use-angle=swiftshader']);
  assert.equal(out.executable, 'playwright-bundled');
  assert.equal(out.chrome.child, null);
  const forced = applyHarnessLaunchOptions({ handleSIGINT: false, handleSIGHUP: true });
  assert.equal(forced.handleSIGINT, false);
  assert.equal(forced.handleSIGHUP, false);
  assert.equal(forced.handleSIGTERM, false);
  assert.ok(BROWSER_LOSS_SETTLE_MS >= 400 && BROWSER_LOSS_SETTLE_MS <= 500);
});

test('the session guard records the first signal and exits on the second', () => {
  const ee = new EventEmitter();
  const exits = [];
  ee.exit = (code) => { exits.push(code); };
  const state = installSessionSignalGuard(ee);
  ee.emit('SIGHUP');
  assert.deepEqual(signalsSince(state).map((s) => s.name), ['SIGHUP']);
  assert.equal(state.signals.length, 1);
  assert.deepEqual(exits, []);
  assert.equal(installSessionSignalGuard(ee), state);
  ee.emit('SIGTERM');
  assert.deepEqual(exits, [143]);
  assert.equal(state.signals.length, 2);
  ee.emit('SIGTERM');
  assert.deepEqual(exits, [143]);

  const hangup = new EventEmitter();
  const hangupExits = [];
  hangup.exit = (code) => { hangupExits.push(code); };
  installSessionSignalGuard(hangup);
  hangup.emit('SIGHUP');
  hangup.emit('SIGHUP');
  assert.deepEqual(hangupExits, [129]);
});

test('signals before this run do not count', () => {
  const state = { signals: [{ name: 'SIGHUP', at: 10 }, { name: 'SIGTERM', at: 30 }] };
  assert.deepEqual(signalsSince(state, 20).map((s) => s.name), ['SIGTERM']);
  assert.deepEqual(signalsSince(null, 0), []);
});

test('spawn capture sees a chrome launch and restores spawn', async () => {
  assert.equal(isChromeExecutable('/home/box/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'), true);
  assert.equal(isChromeExecutable('chrome-headless-shell'), true);
  assert.equal(isChromeExecutable('/usr/bin/node'), false);
  assert.equal(isChromeExecutable('chrome_crashpad_handler'), false);
  const slot = withChromeSpawnCapture();
  try {
    const ignored = cp.spawn(process.execPath, ['-e', 'process.exit(0)'], { stdio: 'ignore' });
    await new Promise((resolve) => ignored.on('close', resolve));
    assert.equal(slot.child, null);
    const child = cp.spawn('/tmp/no-such/chrome', ['--probe'], { stdio: 'ignore' });
    child.on('error', () => {});
    await new Promise((resolve) => child.on('close', resolve));
    assert.equal(slot.child, child);
  } finally {
    slot.restore();
  }
  const after = cp.spawn('/tmp/no-such/chrome', ['--probe'], { stdio: 'ignore' });
  after.on('error', () => {});
  await new Promise((resolve) => after.on('close', resolve));
  assert.notEqual(slot.child, after);
});

test('chrome must be its own session, and a shared group is not', () => {
  const own = parseProcStat('4242 (chrome) S 10 4242 4242 0 0', 4242);
  const node = parseProcStat('50 (node) S 1 50 50 0 0', 50);
  assert.equal(chromeOwnsProcessGroup(own, node), true);
  const shared = parseProcStat('4242 (chrome with space) S 10 50 50 0 0', 4242);
  assert.equal(shared.pgid, 50);
  assert.equal(chromeOwnsProcessGroup(shared, node), false);
  assert.equal(chromeOwnsProcessGroup(parseProcStat('not a stat'), node), false);
  assert.deepEqual(chromeStderrNotes('ok\n[FATAL] aw, snap\n'), ['[FATAL] aw, snap']);
});

test('kernel OOM lines are only kill lines newer than the run', () => {
  assert.equal(isKernelOomKillLine(OCT12), true);
  assert.equal(isKernelOomKillLine(OCT12_INVOKED), false);
  assert.equal(isKernelOomKillLine(PUFF), false);
  assert.ok(dmesgStampMs(OCT12) < dmesgStampMs(OCT13_KILL));
  const since = Date.parse('Tue Oct 13 04:15:00 2026');
  const lines = parseKernelOomLines([OCT12, OCT12_OOM, OCT12_INVOKED, PUFF, OCT13_KILL, '[  123.456] Out of memory: Killed process 9 (chrome)'].join('\n'), since);
  assert.deepEqual(lines, [OCT13_KILL]);
  assert.equal(parseKernelOomLines(OCT12, null).length, 1);
});

test('classifyBrowserLoss separates an environment kill from a route failure', () => {
  const closed = ['page closed'];
  const bare = classifyBrowserLoss({ notes: closed, browserConnected: true, exitCode: null, signal: null });
  assert.equal(bare.environment, false);
  const crash = classifyBrowserLoss({ notes: ['page crashed'], browserConnected: true });
  assert.equal(crash.environment, false);
  const production = classifyBrowserLoss({
    notes: ['page closed', 'browser disconnected'], browserConnected: false, exitCode: 0, signal: null,
  });
  assert.equal(production.environment, true);
  assert.equal(production.reason, 'browser disconnected');
  const killed = classifyBrowserLoss({ notes: ['page closed', 'page crashed', 'browser disconnected'], signal: 'SIGKILL', browserConnected: false });
  assert.equal(killed.environment, true);
  assert.equal(killed.reason, 'chrome signal SIGKILL');
  for (const signal of ['SIGTERM', 'SIGHUP', 'SIGSEGV', 'SIGABRT', 'SIGBUS']) {
    assert.equal(classifyBrowserLoss({ notes: closed, signal, browserConnected: false }).reason, `chrome signal ${signal}`);
  }
  const oom = classifyBrowserLoss({ notes: ['page crashed'], browserConnected: true, oom: [OCT13_KILL, PUFF] });
  assert.equal(oom.environment, true);
  assert.equal(oom.reason, 'kernel oom');
  assert.deepEqual(oom.oom, [OCT13_KILL]);
  const oomElsewhere = classifyBrowserLoss({ notes: [], browserConnected: true, oom: [OCT13_KILL] });
  assert.equal(oomElsewhere.environment, false);
  const hangup = classifyBrowserLoss({ notes: closed, browserConnected: true, signalsSeen: [{ name: 'SIGHUP', at: 1 }] });
  assert.equal(hangup.environment, true);
  assert.equal(hangup.reason, 'harness received SIGHUP');
  const survived = classifyBrowserLoss({ notes: [], browserConnected: true, signalsSeen: ['SIGTERM'] });
  assert.equal(survived.environment, false);
  const puff = classifyBrowserLoss({ notes: closed, browserConnected: true, oom: [PUFF, OCT12_INVOKED] });
  assert.equal(puff.environment, false);
});

test('a proven browser loss is an environment route, and a bare close stays FAIL', () => {
  const loss = {
    environment: true,
    reason: 'chrome signal SIGKILL',
    detail: 'HARNESS ENVIRONMENT: page closed by the environment (chrome signal SIGKILL)',
  };
  const env = checkRoute({ meta: { environmentLoss: loss }, route: { steps: [{ name: 'route', ok: false }] } });
  assert.equal(env.status, 'ENVIRONMENT');
  assert.match(env.detail, /HARNESS ENVIRONMENT/);
  assert.match(env.detail, /chrome signal SIGKILL/);
  const fail = checkRoute({
    meta: {},
    route: { steps: [{ name: 'main menu', ok: true }, { name: 'route', ok: false, detail: 'page closed' }] },
  });
  assert.equal(fail.status, 'FAIL');
  assert.equal(overall([env, { status: 'FAIL', id: 'player_ship' }]), 'ENVIRONMENT');
  const quote = checkRoute({ meta: { environmentQuote: 'The game could not start. Retry Launch; saved games are unchanged.' }, route: { steps: [] } });
  assert.equal(quote.status, 'ENVIRONMENT');
  assert.match(quote.detail, /route load failed/);
});

test('the failure line keeps the chrome signal, free memory, and oom, and the retry is named once', () => {
  const line = formatRouteFailure('page.evaluate: Target page, context or browser has been closed', {
    notes: ['page closed'], exitCode: null, signal: 'SIGKILL', oom: [OCT13_KILL], freeMemory: 1024 * 1024 * 1024, totalMemory: 15 * 1024 * 1024 * 1024,
  });
  assert.match(line, /^harness\/route error: page\.evaluate: Target page/);
  assert.match(line, /page closed/);
  assert.match(line, /chrome exit null signal SIGKILL/);
  assert.match(line, /free memory 1024 MiB \/ 15360 MiB/);
  assert.match(line, /oom \[Tue Oct 13 04:20:00 2026\] Out of memory: Killed process 42 \(chrome\)/);
  assert.equal(formatRouteFailure('menu missing'), 'harness/route error: menu missing');
  assert.match(formatRouteFailure('page closed', { chrome: true, freeMemory: 512 * 1024 * 1024 }), /chrome exit null signal none/);
  assert.match(formatRouteFailure('page closed', { chrome: true, freeMemory: 512 * 1024 * 1024 }), /free memory 512 MiB/);
  const note = environmentRetryNote({ environment: true, reason: 'harness received SIGHUP' });
  assert.equal(note, 'retried once after environment browser loss (harness received SIGHUP)');
  assert.equal(environmentRetryNote({ environment: false, reason: 'browser disconnected' }), null);
  assert.equal(environmentRetryNote(null), null);
  const md = renderVerdict({
    meta: { label: 'swarm', mode: 'swarm', seed: 4242, environmentRetry: note, sessionSignals: ['SIGHUP'], stopReason: 'duration' },
    results: [], overall: 'PASS', paths: {},
  });
  assert.match(md, /Environment retry: retried once after environment browser loss \(harness received SIGHUP\)/);
  assert.match(md, /Session signals ignored \(Chrome left running\): SIGHUP/);
});
