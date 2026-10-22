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
import { fields } from '../src/systems/fields.js';

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
    tick: 1,
    input: { actions: { chargeThrow: true } },
    player: { activeShipIndex: 0, ownedShips: [{ fittings: [] }], cargo: { items: {} } },
  };
  const system = Object.create(impulseCharges);
  system.bus = bus;
  system._handleThrow({ id: 1 }, { throwCdT: 0 }, state);
  assert.deepEqual(seen, ['No impulse charges in cargo']);
});

// SHOVE (five powers, owner 2026-10-22) is one press for two owners: it sets off armed ordnance
// AND drops the repulsor. The bomb bay no longer answers "Nothing armed" — the repulsor half
// always answers (it fires, or names its recharge) — and a press that did set ordnance off is
// never answered with a recharge warning.
test('a SHOVE press with nothing armed leaves the answer to the repulsor', () => {
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
  system._sweeps = [];
  system._collect = () => {};
  system._tickBombs = () => {};
  system.update(1 / 60, state);
  assert.deepEqual(seen, [], 'the bay stays quiet: the repulsor owns the answer');
});

function repulsorHarness() {
  const { bus, seen } = toastRecorder();
  const player = { id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, flags: {}, data: {} };
  const state = { mode: 'flight', playerId: 1, simTime: 5, tick: 300, entities: new Map([[1, player]]), entityList: [player] };
  const system = Object.create(fields);
  system.state = state;
  system.bus = bus;
  system._noteShoveDetonation = fields._noteShoveDetonation;
  bus.on('bombs:commanded', (p) => system._noteShoveDetonation(p));
  bus.on('charge:detonated', (p) => { if (p && p.trigger === 'manual') system._noteShoveDetonation(p); });
  const rt = { cooldowns: { repulsor: 9 } };
  return { bus, seen, state, system, rt };
}

test('a SHOVE press on a cooling repulsor names the recharge', () => {
  const { seen, state, system, rt } = repulsorHarness();
  system._deployRadial(state, rt, 'repulsor');
  assert.deepEqual(seen, ['Repulsor recharging — 4s']);
});

test('a SHOVE press that set off armed ordnance is not answered with a recharge warning', () => {
  for (const [event, payload] of [
    ['bombs:commanded', { ownerId: 1, count: 2, tick: 300 }],
    ['charge:detonated', { ownerId: 1, trigger: 'manual' }],
  ]) {
    const { bus, seen, state, system, rt } = repulsorHarness();
    bus.emit(event, payload);
    system._deployRadial(state, rt, 'repulsor');
    assert.deepEqual(seen, [], `${event}: the press already worked`);
    assert.equal(rt.lastDenial.reason, 'cooldown', 'the denial is still recorded for the HUD');
  }
  // A charge someone else set off, or one that blew on proximity, is not this press.
  for (const payload of [{ ownerId: 2, trigger: 'manual' }, { ownerId: 1, trigger: 'proximity' }]) {
    const { bus, seen, state, system, rt } = repulsorHarness();
    bus.emit('charge:detonated', payload);
    system._deployRadial(state, rt, 'repulsor');
    assert.deepEqual(seen, ['Repulsor recharging — 4s']);
  }
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
