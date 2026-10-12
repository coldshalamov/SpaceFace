import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { installSimCommandSink, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import { installSandboxGameStartedHook, requestSandboxGame } from '../src/ui/sandbox/sandboxSetup.js';

// Worker lane: game:scenePrepared arrives on main as a replay, inside simLaneMain's
// suppressForward window. A synchronous applySandboxSetup emitted run:beginRequested there,
// the lane dropped it, and Swarm OPEN ARMORY fell into Adventure. The setup must run after
// the replay window closes.
test('worker lane: the Crucible setup applies after the scenePrepared replay window', async () => {
  const bus = createBus();
  const toasts = [];
  bus.on('toast', (t) => toasts.push(t.text));
  installSimCommandSink({ send() {} });
  try {
    installSandboxGameStartedHook(bus, () => ({ bus, state: { player: {}, entities: new Map() }, registry: null }));
    requestSandboxGame(bus, { survivalSetup: { bogus: true } });
    bus.emit('game:scenePrepared', {});
    assert.equal(toasts.length, 0, 'nothing applied inside the replay window');
    await Promise.resolve();
    assert.equal(toasts.length, 1, 'setup applied once the replay window closed');
    assert.match(toasts[0], /Crucible setup invalid/);
  } finally { uninstallSimCommandSink(); }
});
