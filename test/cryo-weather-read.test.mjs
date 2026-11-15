import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getCombatKernel } from '../src/combat/kernel.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { CRYO_ARENA_ID } from '../src/systems/cryoDriftArena.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { swarmJuice } from '../src/systems/swarmJuice.js';

function makeFields() {
  const live = new Map();
  return {
    registerEnvironmental(spec) { live.set(spec.id, spec); return spec; },
    registerExternal(spec) { return this.registerEnvironmental(spec); },
    unregisterExternal(id) { return live.delete(id); },
    updateExternal(id, patch) { const row = live.get(id); if (row) Object.assign(row, patch); return row || null; },
    hasExternal(id) { return live.has(id); },
  };
}

function boot({ ruleset = 'swarm' } = {}) {
  const state = createGameState(7);
  const rawBus = createBus();
  const bus = {
    on: rawBus.on.bind(rawBus),
    off: rawBus.off.bind(rawBus),
    once: rawBus.once.bind(rawBus),
    emit: rawBus.emit.bind(rawBus),
  };
  let nextId = 1;
  const helpers = {
    spawnEntity(spec) {
      const entity = { ...spec, id: nextId++, alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 } };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const fields = makeFields();
  const ctx = { state, bus, helpers, registry: { get: (name) => name === 'fields' ? fields : null } };
  survivalArena.init(ctx);
  const run = createRunState({ kind: 'survival', ruleset, seed: 7 });
  run.arenaId = CRYO_ARENA_ID;
  run.wave = 1;
  run.phase = 'active';
  state.mode = 'flight';
  state.run = run;
  bus.emit('run:wavePlanned', { wave: 1, plan: planWave({ seed: 7, arenaId: CRYO_ARENA_ID, wave: 1 }) });
  const kernel = getCombatKernel(ctx);
  return {
    state, ctx, bus, kernel,
    destroy() { survivalArena.destroy(); kernel.dispose(); },
  };
}

test('the room reports actual move, depletion, refill and destruction once per installed room', () => {
  const h = boot();
  try {
    const cues = []; h.bus.on('swarm:cryoWeather', p => cues.push(p));
    const prop = survivalArena._roomSolids.get('coolant_tank');
    assert.ok(prop); const home = { ...prop.pos };
    const vent = survivalArena._cryoVents.get('coolant');
    survivalArena._syncCryoProps(h.state);
    assert.deepEqual(cues, []);
    prop.pos.x += 20;
    survivalArena._syncCryoProps(h.state);
    assert.deepEqual(cues.at(-1), { cue: 'moved', role: 'coolant', wave: 1 });
    assert.equal(vent.charge, 479);
    assert.equal(survivalArena._cryoRoom.props.coolant[0].x, prop.pos.x);
    for (let i = 0; i < 359; i++) survivalArena._syncCryoProps(h.state);
    assert.equal(vent.charge, 120);
    assert.deepEqual(cues.at(-1), { cue: 'low', role: 'coolant', wave: 1 });
    for (let i = 0; i < 120; i++) survivalArena._syncCryoProps(h.state);
    assert.equal(vent.charge, 0);
    assert.equal(survivalArena._cryoRoom.props.coolant.length, 1, 'last charged tick still has a pocket');
    survivalArena._syncCryoProps(h.state);
    assert.equal(survivalArena._cryoRoom.props.coolant.length, 0);
    assert.deepEqual(cues.at(-1), { cue: 'spent', role: 'coolant', wave: 1 });
    prop.pos = { ...home }; survivalArena._syncCryoProps(h.state);
    assert.equal(vent.charge, 480);
    assert.deepEqual(cues.at(-1), { cue: 'refilled', role: 'coolant', wave: 1 });
    prop.pos.x += 20; survivalArena._syncCryoProps(h.state);
    prop.pos = { ...home }; survivalArena._syncCryoProps(h.state);
    assert.equal(cues.length, 4, 'dock-edge chatter must not repeat instruction');
    prop.alive = false; survivalArena._syncCryoProps(h.state);
    assert.deepEqual(cues.at(-1), { cue: 'lost', role: 'coolant', wave: 1 });
    survivalArena._syncCryoProps(h.state); assert.equal(cues.length, 5);
    assert.equal(survivalArena._cryoRoom.props.coolant.length, 0);
  } finally { h.destroy(); }
});

test('heat reports its own pocket and the installed room resets the ledger', () => {
  const h = boot();
  try {
    const cues = []; h.bus.on('swarm:cryoWeather', p => cues.push(p));
    const prop = survivalArena._roomSolids.get('heat_manifold'); prop.pos.x += 20;
    survivalArena._syncCryoProps(h.state);
    assert.deepEqual(cues[0], { cue: 'moved', role: 'heat', wave: 1 });
    h.bus.emit('run:wavePlanned', { wave: 1, plan: planWave({ seed: 7, arenaId: CRYO_ARENA_ID, wave: 1 }) });
    const fresh = survivalArena._roomSolids.get('heat_manifold'); fresh.pos.x += 20;
    survivalArena._syncCryoProps(h.state);
    assert.equal(cues.length, 2);
  } finally { h.destroy(); }
});

test('the room\'s weather receipts reach the announcer as COLD FRONT and FRONT PASSED', () => {
  const h = boot();
  const juice = Object.create(swarmJuice);
  juice.init({ state: h.state, bus: h.bus });
  try {
    const calls = []; h.bus.on('swarm:announce', p => calls.push(p));
    const prop = survivalArena._roomSolids.get('coolant_tank');
    assert.ok(prop); const home = { ...prop.pos };
    prop.pos.x += 20;
    survivalArena._syncCryoProps(h.state);
    assert.equal(calls.at(-1).text, 'COLD FRONT');
    assert.equal(calls.at(-1).kind, 'cryo');
    for (let i = 0; i < 480; i++) survivalArena._syncCryoProps(h.state);
    assert.equal(calls.at(-1).text, 'FRONT PASSED');
    prop.pos = { ...home }; survivalArena._syncCryoProps(h.state);
    assert.equal(calls.at(-1).text, 'RECHARGED');
    prop.alive = false; survivalArena._syncCryoProps(h.state);
    assert.equal(calls.at(-1).text, 'TANK LOST');
    assert.deepEqual(calls.map(c => c.text),
      ['COLD FRONT', 'CHARGE LOW', 'FRONT PASSED', 'RECHARGED', 'TANK LOST']);
  } finally { juice.destroy(); h.destroy(); }
});

const { readCryoWeatherCue } = await import('../src/systems/cryoWeatherRead.js');
const docked = { alive: true, docked: true, active: true, charge: 480 };
const moved = { alive: true, docked: false, active: true, charge: 479 };
test('cue reader does not mutate charge, input observations or seen ledger', () => {
  const before = Object.freeze({ ...docked }), after = Object.freeze({ ...moved }), seen = new Set();
  const cue = readCryoWeatherCue(before, after, 'coolant', seen);
  assert.equal(cue.id, 'moved'); assert.equal(seen.size, 0);
  assert.equal(after.charge, 479);
  assert.equal(readCryoWeatherCue(before, after, 'coolant', new Set(['moved'])), null);
});
test('missing context, unknown roles and unchanged observations are silent', () => {
  assert.equal(readCryoWeatherCue(null, moved, 'coolant'), null);
  assert.equal(readCryoWeatherCue(docked, null, 'coolant'), null);
  assert.equal(readCryoWeatherCue(docked, moved, 'relay'), null);
  assert.equal(readCryoWeatherCue(moved, moved, 'heat'), null);
  assert.equal(readCryoWeatherCue({ ...moved, charge: 119 }, { ...moved, charge: 118 }, 'heat'), null);
});
test('death overrides low/spent; dock return overrides low; last charged tick is not called spent', () => {
  assert.equal(readCryoWeatherCue(moved, { alive: false, docked: false, active: false, charge: 0 }, 'coolant').id, 'lost');
  assert.equal(readCryoWeatherCue(moved, docked, 'coolant').id, 'refilled');
  assert.equal(readCryoWeatherCue({ ...moved, charge: 1 }, { ...moved, charge: 0 }, 'heat'), null);
  assert.equal(readCryoWeatherCue({ ...moved, charge: 0 }, { ...moved, charge: 0, active: false }, 'heat').id, 'spent');
});
