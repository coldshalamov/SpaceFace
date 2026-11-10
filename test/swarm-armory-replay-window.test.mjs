import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { installSimCommandSink, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import { installSandboxGameStartedHook, requestSandboxGame, hasPendingSandboxLaunch } from '../src/ui/sandbox/sandboxSetup.js';
import { crucibleSetupFor, crucibleLaunchConfig } from '../src/ui/crucibleLaunch.js';

// Worker lane: game:scenePrepared arrives on main as a replay, inside simLaneMain's
// suppressForward window. A synchronous applySandboxSetup emitted run:beginRequested there,
// the lane dropped it, and Swarm OPEN ARMORY fell into Adventure. Native boot now
// settles the complete setup before acknowledgement; its replay must not apply it again.
test('worker lane: scenePrepared replay consumes the request without repeating native preparation', async () => {
  const bus = createBus();
  const toasts = [];
  let facadeReads = 0; let opts;
  bus.on('game:new', value => { opts = structuredClone(value); });
  bus.on('toast', (t) => toasts.push(t.text));
  installSimCommandSink({ send() {} });
  try {
    installSandboxGameStartedHook(bus, () => ({ bus, state: { player: {}, entities: new Map() },
      registry: { get() { facadeReads++; throw new Error('main cannot prepare native ships'); } } }));
    const config = crucibleLaunchConfig(crucibleSetupFor({ starterId: 'ricochet_runner', seed: 4242 }).value, 'swarm');
    requestSandboxGame(bus, config);
    bus.emit('game:scenePrepared', {});
    assert.equal(toasts.length, 0, 'nothing applied inside the replay window');
    await Promise.resolve();
    assert.equal(toasts.length, 0, 'no second facade transaction after replay');
    assert.equal(facadeReads, 0);
    assert.equal(hasPendingSandboxLaunch(), false);
    assert.equal(opts.crucibleSetup.survivalSetup.hullId, 'ship_hornet');
  } finally { uninstallSimCommandSink(); }
});
