import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { installSimCommandSink, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import {
  armWorkerCrucibleSetup, installSandboxGameStartedHook, requestSandboxGame,
} from '../src/ui/sandbox/sandboxSetup.js';

// Worker lane (default since PR #260): main's registry has no 'ships'/'world' facades, so
// applySandboxSetup on main silently skipped the tech unlock, hull, fittings and arena
// relocation. Only run:beginRequested reached the sim, and Swarm/Gauntlet began inside the
// Adventure world: Helios, the 47-A rescue objective, an armory with no equipment.
// The Crucible setup must ride game:new to the worker and apply there.
// installSandboxGameStartedHook is a once-per-module installer: every hook test shares HB.
const HB = createBus();
const HCTX = () => ({ bus: HB, state: { player: { ownedShips: [] }, entities: new Map() }, registry: null });
installSandboxGameStartedHook(HB, HCTX);
const SWARM = { survivalSetup: { seed: 4242, arenaId: 'x' }, survivalRuleset: 'swarm', swarmStake: 'standard' };
const GAUNTLET = { survivalSetup: { seed: 7, arenaId: 'y' }, survivalRuleset: 'gauntlet' };

for (const [name, cfg] of [['swarm', SWARM], ['gauntlet', GAUNTLET]]) {
  test(`worker lane (${name}): game:new carries the whole Crucible config to the sim`, () => {
    const bus = createBus();
    const news = [];
    bus.on('game:new', (o) => news.push(o));
    installSimCommandSink({ send() {} });
    try {
      requestSandboxGame(bus, cfg);
    } finally { uninstallSimCommandSink(); }
    assert.equal(news.length, 1);
    assert.equal(news[0].crucibleLaunch, true);
    assert.deepEqual(news[0].crucibleSetupConfig, cfg);
    assert.deepEqual(JSON.parse(JSON.stringify(news[0])), news[0], 'structured-clone safe');
  });

  test(`worker lane (${name}): main does NOT apply the setup (the worker owns it)`, async () => {
    const bus = HB;
    const seen = [];
    const offs = ['toast', 'run:beginRequested', 'run:loadoutReady'].map((t) => bus.on(t, () => seen.push(t)));
    installSimCommandSink({ send() {} });
    try {
      requestSandboxGame(bus, { ...cfg, survivalSetup: { bogus: true } });
      bus.emit('game:scenePrepared', {});
      bus.emit('game:started', {});
      await Promise.resolve();
      assert.deepEqual(seen, [], 'nothing applied main-side');
    } finally { uninstallSimCommandSink(); offs.forEach((f) => f()); }
  });
}

test('main lane: no config rides game:new; setup still applies synchronously on main', () => {
  const bus = HB;
  const news = []; const toasts = [];
  bus.on('game:new', (o) => news.push(o));
  bus.on('toast', (t) => toasts.push(t.text));
  requestSandboxGame(bus, { survivalSetup: { bogus: true } });
  assert.equal(news[0].crucibleSetupConfig, undefined);
  bus.emit('game:scenePrepared', {});
  assert.equal(toasts.length, 1);
  assert.match(toasts[0], /Crucible setup invalid/);
});

test('worker realm: armWorkerCrucibleSetup applies once, at scenePrepared, on the sim bus', () => {
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (t) => toasts.push(t.text));
  const ctx = { bus, state: { player: { ownedShips: [] }, entities: new Map() }, registry: null };
  const disarm = armWorkerCrucibleSetup(ctx, { crucibleSetupConfig: { survivalSetup: { bogus: true } } });
  assert.equal(toasts.length, 0, 'not before scenePrepared');
  bus.emit('game:scenePrepared', { crucibleLaunch: true });
  bus.emit('game:scenePrepared', { crucibleLaunch: true });
  assert.equal(toasts.length, 1, 'applied exactly once');
  assert.match(toasts[0], /Crucible setup invalid/);
  disarm();
  assert.equal(typeof armWorkerCrucibleSetup(ctx, {}), 'function', 'no config → no-op disarm');
});

test('the worker host newGameBoot op arms the Crucible setup around the boot', async () => {
  const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../scripts/lib/simWorkerHost.mjs', import.meta.url), 'utf8'));
  const op = src.slice(src.indexOf("['newGameBoot'"), src.indexOf("['journalRebuild'"));
  assert.match(op, /armWorkerCrucibleSetup\(/);
  assert.ok(op.indexOf('armWorkerCrucibleSetup(') < op.indexOf('runNewGameSimBoot('), 'armed before the boot emits scenePrepared');
});
