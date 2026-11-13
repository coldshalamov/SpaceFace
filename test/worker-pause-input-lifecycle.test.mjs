import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';

test('a worker pause between fixed ticks discards old clicks and samples fresh input on resume', async () => {
  const sim = createSimHost();
  try {
    const scenarioContract = JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url)));
    const init = await sim.init({ profile: 'production', seed: 4242, bridgeAll: true, scenarioContract });
    const { state, runtime } = sim.host;
    state.mode = 'flight';
    state.playerId = runtime.spawn({
      type: 'ship', isPlayer: true, team: 0, pos: { x: 0, z: 0 }, radius: 4, mass: 12, hull: 100, hullMax: 100,
    }).id;
    state.settings.controls.bindings = { deployBeacon: ['KeyU'] };
    const ring = createSimCommandRing();
    let tick = 0;
    const drain = steps => sim.tick({ tick: ++tick, steps, ackEnd: init.initRebuild?.end ?? 0, commands: ring.drain() });
    const mouse = type => pushLaneCommand(ring, { kind: 'domEvent', d: { type, button: 2, clientX: 40, clientY: 40 } });
    const tap = () => {
      mouse('mousedown');
      mouse('mouseup');
      for (const pressed of [true, false]) {
        pushLaneCommand(ring, { kind: 'domEvent', d: { type: pressed ? 'keydown' : 'keyup', code: 'KeyU', pressed } });
      }
    };

    tap();
    assert.equal((await drain(0)).stepsExecuted, 0);
    ring.pushBus({ emit: 'sim:pause', payload: {} });
    pushLaneCommand(ring, { kind: 'uiFold', p: { modalActive: true, screenStackLen: 1 } });
    pushLaneCommand(ring, { kind: 'uiFold', p: { modalActive: false, screenStackLen: 0 } });
    assert.equal((await drain(0)).stepsExecuted, 0);
    assert.equal((await drain(1)).stepsExecuted, 1);
    assert.equal(state.input.actions.massline.latch, false);
    assert.equal(state.input.actions.deployBeacon, false);

    tap();
    assert.equal((await drain(1)).stepsExecuted, 1);
    assert.equal(state.input.actions.massline.latch, true);
    assert.equal(state.input.actions.deployBeacon, true);
  } finally {
    sim.shutdown();
  }
});
