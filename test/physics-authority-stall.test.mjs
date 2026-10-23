// A flight authority that never starts used to leave the ship dead with no word to the player:
// _updateSg02DynamicAuthority only dedupWarn'd a rejected Rapier init and retried on a 15 s -> 120 s
// backoff, while flightV3 emits no motion without the authority. After ~3 s of live flight with no
// authority the physics system now says so once (`physics:authorityStalled` + a plain toast) and
// announces `physics:authorityRecovered` when the authority is back and stepping.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';

const TICK_MS = 1000 * SIM_DT;

function rig(t) {
  const clock = { t: 5000 };
  const had = Object.prototype.hasOwnProperty.call(performance, 'now');
  const saved = had ? Object.getOwnPropertyDescriptor(performance, 'now') : null;
  Object.defineProperty(performance, 'now', { value: () => clock.t, configurable: true, writable: true });
  t.after(() => {
    if (saved) Object.defineProperty(performance, 'now', saved);
    else delete performance.now;
  });

  const bus = createBus();
  const sim = createSimulation({ seed: 260926, bus, systems: [physics] });
  const { state } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  const phys = sim.registry.get('physics');
  const seen = { stalled: [], recovered: [], toasts: [] };
  bus.on('physics:authorityStalled', (p) => seen.stalled.push(p));
  bus.on('physics:authorityRecovered', (p) => seen.recovered.push(p));
  bus.on('toast', (p) => seen.toasts.push(p));
  // The authority factory rejects, as a missing wasm / CSP-blocked Rapier init does.
  phys._sg02OwnerFactory = () => Promise.reject(new Error('rapier init failed (test)'));

  async function run(ticks, { advanceMs = TICK_MS } = {}) {
    for (let i = 0; i < ticks; i += 1) {
      clock.t += advanceMs;
      sim.step(SIM_DT);
      // Let the rejected init settle so the next tick can retry, as it does between real frames.
      await Promise.resolve();
      await Promise.resolve();
    }
  }
  return { sim, state, phys, seen, clock, run };
}

function quiet(fn) {
  const warn = console.warn;
  console.warn = () => {};
  return fn().finally(() => { console.warn = warn; });
}

test('no authority for ~3 s of live flight: exactly one stall event and one toast, then recovery', async (t) => {
  const { phys, seen, run } = rig(t);
  await quiet(async () => {
    await run(100); // 2.0 s
    assert.equal(seen.stalled.length, 0, 'two seconds without the authority is not yet reported');
    assert.equal(seen.toasts.length, 0);

    await run(90);  // 3.2 s total
    assert.equal(seen.stalled.length, 1, 'past ~3 s the stall is reported');
    assert.equal(seen.toasts.length, 1, 'with one plain toast');
    assert.match(seen.toasts[0].text, /Flight systems are still starting\. If your ship stays still, reload the game\./);
    assert.equal(seen.toasts[0].kind, 'warn');
    assert.ok(seen.stalled[0].stalledMs >= 3000, `stalledMs=${seen.stalled[0].stalledMs}`);

    await run(600); // ten more seconds of the same stall
    assert.equal(seen.stalled.length, 1, 'once per stall, however long it lasts');
    assert.equal(seen.toasts.length, 1);
    assert.equal(seen.recovered.length, 0);
  });

  // The retry succeeds: the real authority factory comes back.
  phys._sg02OwnerFactory = null;
  await run(1);
  assert.ok(phys._sg02Init, 'the retry minted a real init');
  await phys._sg02Init;
  assert.ok(phys._sg02, 'the real authority arrived');
  await run(2);
  assert.equal(seen.recovered.length, 1, 'recovery is announced exactly once');
  assert.ok(seen.recovered[0].stalledMs >= 0);
  assert.equal(seen.stalled.length, 1);
  assert.equal(seen.toasts.length, 1, 'recovery adds no second toast');
  await run(120);
  assert.equal(seen.recovered.length, 1, 'and does not repeat while flight is healthy');
});

test('a second stall after recovery is reported again', async (t) => {
  const { phys, seen, run } = rig(t);
  await quiet(async () => {
    await run(200);
    assert.equal(seen.stalled.length, 1);
    phys._sg02OwnerFactory = null;
    await run(1);
    await phys._sg02Init;
    await run(2);
    assert.equal(seen.recovered.length, 1);

    // The authority is lost again (e.g. a load boundary) and the next start fails too.
    phys._disableSg02DynamicAuthority();
    phys._sg02OwnerFactory = () => Promise.reject(new Error('rapier init failed again (test)'));
    await run(200);
    assert.equal(seen.stalled.length, 2, 'a new stall is a new report');
    assert.equal(seen.toasts.length, 2);
  });
});

test('time outside live flight never counts toward a stall', async (t) => {
  const { state, seen, run } = rig(t);
  await quiet(async () => {
    state.mode = 'menu';
    await run(400); // 6.7 s in the menu
    assert.equal(seen.stalled.length, 0, 'a menu with no authority is not a stalled flight');
    state.mode = 'flight';
    await run(100); // 1.7 s of flight: the window starts only now
    assert.equal(seen.stalled.length, 0);
    await run(100);
    assert.equal(seen.stalled.length, 1, 'but 3 s of actual flight is');
  });
});

test('a long gap between ticks (pause, throttled tab) restarts the window', async (t) => {
  const { clock, seen, run } = rig(t);
  await quiet(async () => {
    await run(100); // 1.7 s
    clock.t += 60000; // the tab slept for a minute
    await run(100);   // 1.7 s more: neither stretch reaches 3 s
    assert.equal(seen.stalled.length, 0, 'a sleeping tab is not minutes of stall');
    await run(100);
    assert.equal(seen.stalled.length, 1);
  });
});

test('a slow host that ran few ticks is not reported on wall time alone', async (t) => {
  const { seen, run } = rig(t);
  await quiet(async () => {
    await run(60, { advanceMs: 100 }); // 6 s of wall clock, only 60 ticks
    assert.equal(seen.stalled.length, 0, 'the tick floor holds even when wall time is far past 3 s');
    await run(80, { advanceMs: 100 });
    assert.equal(seen.stalled.length, 1);
  });
});

test('an init that never settles stays silent however long it pends (synchronous runs cannot trip it)', async (t) => {
  const { phys, seen, run } = rig(t);
  phys._sg02OwnerFactory = () => new Promise(() => {});
  await run(600, { advanceMs: 100 }); // 60 s of wall clock, 600 live-flight ticks, init pending throughout
  assert.equal(seen.stalled.length, 0, 'pending is not failed: no host-speed-dependent notice');
  assert.equal(seen.toasts.length, 0);
});

test('a healthy authority never raises a stall', async (t) => {
  const { phys, state, seen, run } = rig(t);
  phys._sg02OwnerFactory = null;
  await phys.prepareBackend(state);
  await run(400);
  assert.equal(seen.stalled.length, 0);
  assert.equal(seen.recovered.length, 0);
  assert.equal(seen.toasts.length, 0);
});
