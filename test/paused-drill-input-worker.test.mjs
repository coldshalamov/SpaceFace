import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createRegistry } from '../src/core/registry.js';
import { installSimCommandSink, uninstallSimCommandSink } from '../src/core/simLaneCommands.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';

test('paused worker drains a zero-step public drill-down input into the live drill owner', async () => {
  const host = createSimHost();
  try {
    await host.init({
      profile: 'production',
      seed: 4242,
      scenarioContract: JSON.parse(readFileSync(
        new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8',
      )),
    });

    const pausedTick = host.host.state.tick;
    const sendPaused = (d) => {
      const ring = createSimCommandRing();
      assert.notEqual(pushLaneCommand(ring, { kind: 'domEvent', d }), null);
      return host.tick({ steps: 0, commands: ring.drain() });
    };

    await sendPaused({ type: 'drillCall', op: 'begin', asteroidId: 545 });
    const state = host.host.state;
    const drill = state.drill;
    assert.equal(drill.active, true, 'the worker creates the public drill session while paused');
    const { col, row } = drill.avatar;
    assert.equal(row, 0, 'new drill sessions start at the surface row');

    // Give the first inward cell an empty face so the public down input has one deterministic,
    // immediately visible result without requiring a simulation tick or a generated geology seed.
    drill.field[col][row + 1] = { type: 'empty', hp: 0, maxHp: 0, ore: null, tierReq: 1 };
    const held = { left: false, right: false, up: false, down: true };
    const opts = { impulse: true };
    const facadeRegistry = createRegistry({
      simLane: 'worker', state, bus: createBus(), helpers: {},
    });
    const facade = facadeRegistry.get('drill');
    const emitted = [];
    installSimCommandSink((descriptor) => emitted.push(descriptor));
    try { facade.tickInput(held, 1 / 60, opts); } finally { uninstallSimCommandSink(); }
    assert.equal(emitted.length, 1);
    assert.deepEqual(emitted[0], {
      kind: 'domEvent',
      d: { type: 'drillTick', held, dt: 1 / 60, opts },
    }, 'the worker facade emits the screen-owned drill clock as a DOM-event command');
    await sendPaused(emitted[0].d);

    assert.equal(state.tick, pausedTick, 'paused drill work does not advance the world tick');
    assert.equal(drill.avatar.row, row + 1,
      'a zero-step worker command still applies the real drill controller input');
  } finally {
    host.shutdown();
  }
});
