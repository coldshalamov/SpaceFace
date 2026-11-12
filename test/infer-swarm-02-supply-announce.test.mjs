// INFERENCE swarm-as-toybox U2 — repair cells announce their drop.
//
// A cell lands where its body died with a 16-second clock, and nothing told the
// player: swarm:supplyDropped had no listeners, so cells were found only by
// accident. The drop now toasts once and pings the vent-chime variant at the
// drop position; collection already toasts and chimes through the generic
// pickup path, so this unit is the drop half only.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { swarmSupply, SWARM_REPAIR_TTL_S } from '../src/systems/swarmSupply.js';

function boot({ hull = 20, hullMax = 100 } = {}) {
  const state = createGameState(4242);
  const bus = createBus();
  const toasts = [];
  const cues = [];
  const spawns = [];
  let nextId = 100;
  const helpers = {
    spawnEntity: (spec) => {
      const id = nextId++;
      spawns.push({ id, spec });
      state.entities.set(id, { id, ...spec });
      return { id };
    },
  };
  state.playerId = 0;
  state.entities.set(0, {
    id: 0, alive: true, type: 'ship', pos: { x: 0, z: 0 },
    hull, hullMax, data: {},
  });
  runSession.init({ state, bus });
  swarmSupply.init({ state, bus, helpers });
  bus.on('toast', (p) => toasts.push(p));
  bus.on('audio:cue', (p) => cues.push(p));
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: 4242, arenaId: 'helios_core' });
  for (const nextPhase of ['arena_intro', 'wave_intro', 'active']) {
    bus.emit('run:transitionRequested', { expectedPhase: state.run.phase, nextPhase });
  }
  let victimId = 1;
  return {
    state,
    bus,
    toasts,
    cues,
    spawns,
    kill() {
      const id = victimId++;
      state.entities.set(id, {
        id, alive: false, type: 'ship', pos: { x: 40 + id, z: 10 },
        vel: { x: 0, z: 0 }, data: { runCohort: 'survival', runWave: 1 },
      });
      bus.emit('entity:killed', { id, killerId: 0, tick: state.tick });
    },
    close() { swarmSupply.destroy(); runSession.destroy(); },
  };
}

test('a hurt-hull drop toasts once and pings at the drop position', () => {
  const h = boot();
  try {
    for (let i = 0; i < 5; i++) h.kill();
    assert.equal(h.spawns.length, 1, 'five hurt-hull kills earn one cell');
    const dropPos = h.spawns[0].spec.pos;
    const dropToasts = h.toasts.filter((t) => t.text === 'Repair cell on the field');
    assert.equal(dropToasts.length, 1);
    assert.equal(dropToasts[0].kind, 'good');
    assert.ok(dropToasts[0].ttl > 0 && dropToasts[0].ttl <= SWARM_REPAIR_TTL_S);
    const dropCues = h.cues.filter((c) => c && c.id === 'sfx_vent_chime');
    assert.equal(dropCues.length, 1);
    assert.deepEqual(dropCues[0].position, { x: dropPos.x, z: dropPos.z });
    assert.equal(dropCues[0].rate, 1.1, 'a variant rate, not the magnet catch at 0.9');
  } finally { h.close(); }
});

test('a full hull earns no cell and no announcement', () => {
  const h = boot({ hull: 100, hullMax: 100 });
  try {
    for (let i = 0; i < 14; i++) h.kill();
    assert.equal(h.spawns.length, 0);
    assert.equal(h.toasts.length, 0);
    assert.equal(h.cues.length, 0);
  } finally { h.close(); }
});

test('a reloaded cell claims silently — the drop already spoke', () => {
  const h = boot();
  try {
    for (let i = 0; i < 5; i++) h.kill();
    assert.equal(h.spawns.length, 1);
    h.toasts.length = 0;
    h.cues.length = 0;
    const cell = state_cell(h);
    h.bus.emit('entity:spawned', { entity: cell });
    assert.equal(h.toasts.length, 0);
    assert.equal(h.cues.length, 0);
  } finally { h.close(); }
});

function state_cell(h) {
  const spawned = h.spawns[0];
  return h.state.entities.get(spawned.id);
}
