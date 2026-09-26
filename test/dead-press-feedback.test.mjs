// Dead presses answer. The receipt IS the fix: a key that cannot fire says why instead of
// swallowing the press in silence — the defect behind "I press things and nothing happens".
// One test per family named in the ordnance tips (powerRail.js `why`), so the words the HUD
// promises and the words the systems actually say cannot drift apart.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import { createBus } from '../src/core/eventBus.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';
import { bombs } from '../src/systems/bombs.js';
import { planetRuntime } from '../src/systems/planetRuntime.js';

function toastRecorder() {
  const bus = createBus();
  const seen = [];
  bus.on('toast', (p) => seen.push(p.text));
  return { bus, seen };
}

test('a throw press inside the arming gap names the gap instead of going quiet', () => {
  const { bus, seen } = toastRecorder();
  const state = {
    input: { actions: { chargeThrow: true } },
    player: { activeShipIndex: 0, ownedShips: [{ fittings: [] }], cargo: { items: { cmdty_impulse_charge: 2 } } },
  };
  const system = Object.create(impulseCharges);
  system.bus = bus;
  system._handleThrow({ id: 1 }, { throwCdT: 1.2 }, state);
  assert.deepEqual(seen, ['Charge arming — 2s']);
  assert.equal(state.input.actions.chargeThrow, false, 'the press is consumed, not left to linger');
});

test('a throw with no charges in cargo names the shortage', () => {
  const { bus, seen } = toastRecorder();
  const state = {
    input: { actions: { chargeThrow: true } },
    player: { activeShipIndex: 0, ownedShips: [{ fittings: [] }], cargo: { items: {} } },
  };
  const system = Object.create(impulseCharges);
  system.bus = bus;
  system._handleThrow({ id: 1 }, { throwCdT: 0 }, state);
  assert.deepEqual(seen, ['No impulse charges in cargo']);
});

test('a detonate press with neither the charge net nor the bomb net armed says so once', () => {
  const { bus, seen } = toastRecorder();
  const player = { id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {} };
  const state = {
    mode: 'flight', playerId: 1, simTime: 5, tick: 300,
    entities: new Map([[1, player]]), entityList: [player],
    input: { actions: { chargeDetonate: true } },
  };
  const system = Object.create(bombs);
  system.state = state;
  system.bus = bus;
  system._collect = () => {};
  system._tickBombs = () => {};
  system.update(1 / 60, state);
  assert.deepEqual(seen, ['Nothing armed to detonate']);
});

test('the skim toggle answers away from a planet band and is wired to the no-site return', () => {
  const { bus, seen } = toastRecorder();
  const state = { input: { actions: { toggleSkimCollector: true } } };
  const system = Object.create(planetRuntime);
  system.bus = bus;
  system._denySkimToggle(state);
  assert.deepEqual(seen, ['Skim collector needs a planet band']);
  assert.equal(state.input.actions.toggleSkimCollector, false, 'the press is consumed');
  // update() itself is behind the authored planet flag (browser-only), so the wiring is pinned in
  // source: the deny runs on the early return that leaves the player away from every planet site.
  const src = readFileSync(new URL('../src/systems/planetRuntime.js', import.meta.url), 'utf8');
  assert.match(src, /this\._denySkimToggle\(state\);\s*\n\s*return;/);
});
