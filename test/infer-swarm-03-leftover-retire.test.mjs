// INFERENCE swarm-as-toybox U3 — the clear retires its disabled leftovers.
//
// A kill-target round clears with disabled bodies still live: they hold their
// budget slots forever (slots release only on entity:destroyed) and drift as
// unowned bodies into every later round. The clear now pronounces the defeat
// the round already recorded — leftovers scuttle unattributed (no score, no
// chain; the purse still pays the resolved body) and the engine's ordinary
// destroy path releases their slots. Boss-flagged bodies are left to their
// own machinery, and timed rounds still carry their survivors as pressure.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { survivalWave, waveOwnerId } from '../src/systems/survivalWave.js';

function boot() {
  const state = createGameState(4242);
  const bus = createBus();
  const helpers = {};
  state.playerId = 0;
  state.entities.set(0, { id: 0, alive: true, type: 'ship', pos: { x: 0, z: 0 }, data: {} });
  spawnBudget.init({ state, bus, helpers });
  runSession.init({ state, bus });
  survivalWave.init({ state, bus, helpers });
  const killed = [];
  const cleared = [];
  bus.on('entity:killed', (p) => killed.push(p && p.id));
  bus.on('run:waveCleared', (p) => cleared.push(p));
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: 4242, arenaId: 'helios_core' });
  for (const nextPhase of ['arena_intro', 'wave_intro', 'active']) {
    bus.emit('run:transitionRequested', { expectedPhase: state.run.phase, nextPhase });
  }
  let nextId = 11;
  return {
    state, bus, helpers,
    killed, cleared,
    budget: helpers.spawnBudget,
    plan(swarm) {
      bus.emit('run:wavePlanned', {
        wave: 1,
        plan: { ok: true, schedule: [], completionRules: {}, swarm },
      });
      bus.emit('run:waveStarted', { wave: 1 });
    },
    body(data = {}) {
      const id = nextId++;
      const entity = {
        id, alive: true, type: 'ship', pos: { x: 40 + id, z: 0 },
        vel: { x: 0, z: 0 }, data: { runCohort: 'survival', runWave: 1, ...data },
      };
      state.entities.set(id, entity);
      return entity;
    },
    bind(...entities) {
      const owner = waveOwnerId(1);
      const granted = this.budget.request(entities.length, owner);
      assert.equal(granted, entities.length);
      for (const entity of entities) {
        assert.equal(this.budget.bindEntity(entity.id, owner), true);
      }
    },
    close() { survivalWave.destroy(); spawnBudget.destroy(); runSession.destroy(); },
  };
}

test('a disabled leftover scuttles at clear and its slot releases on destroy', () => {
  const h = boot();
  try {
    h.plan({ killTarget: 2, concurrent: 8 });
    const a = h.body();
    const b = h.body();
    h.bind(a, b);
    const freeBefore = h.budget.available();
    bus_join(h, [a.id, b.id]);
    survivalWave._admittedTotal = 2;
    a.disabled = true;
    b.alive = false;
    h.bus.emit('entity:killed', { id: b.id, killerId: 0, tick: 1 });
    h.bus.emit('entity:destroyed', { id: b.id, entity: b });
    survivalWave.update();
    assert.equal(h.cleared.length, 1, 'round clears with the disabled body unresolved');
    assert.equal(a.alive, false, 'the leftover is pronounced dead at clear');
    assert.ok(h.killed.includes(a.id), 'retirement travels the honest kill path');
    h.bus.emit('entity:destroyed', { id: a.id, entity: a });
    assert.equal(h.budget.available(), freeBefore + 2, 'both slots release');
  } finally { h.close(); }
});

test('retirement is unattributed: no score, no chain, still a resolved body', () => {
  const h = boot();
  try {
    h.plan({ killTarget: 1, concurrent: 8 });
    const a = h.body();
    h.bind(a);
    bus_join(h, [a.id]);
    survivalWave._admittedTotal = 1;
    a.disabled = true;
    const payloads = [];
    h.bus.on('entity:killed', (p) => payloads.push(p));
    survivalWave.update();
    assert.equal(h.cleared.length, 1);
    assert.equal(a.alive, false);
    const retirement = payloads.find((p) => p && p.id === a.id);
    assert.ok(retirement, 'retirement travels the kill path');
    assert.equal(retirement.killerId ?? null, null, 'unattributed: no score, no chain');
    assert.equal(retirement.provenance?.actorId ?? null, null);
  } finally { h.close(); }
});

test('boss-flagged bodies are left to their own machinery', () => {
  const h = boot();
  try {
    h.plan({ killTarget: 1, concurrent: 8 });
    const boss = h.body({ isBoss: true });
    h.bind(boss);
    bus_join(h, [boss.id]);
    survivalWave._admittedTotal = 1;
    survivalWave._bossIds.add(boss.id);
    boss.disabled = true;
    survivalWave.update();
    assert.equal(h.cleared.length, 1);
    assert.equal(boss.alive, true, 'a disabled boss drifts on; the score system owns its dead');
  } finally { h.close(); }
});

test('a timed round carries its disabled survivors instead of retiring them', () => {
  const h = boot();
  try {
    h.plan({ durationTicks: 60, concurrent: 8 });
    const d = h.body();
    h.bind(d);
    bus_join(h, [d.id]);
    d.disabled = true;
    h.state.simTime = (h.state.simTime || 0) + 61;
    survivalWave.update();
    assert.equal(h.cleared.length, 1);
    assert.equal(d.alive, true, 'timed survivors stay live pressure by design');
  } finally { h.close(); }
});

function bus_join(h, ids) {
  h.bus.emit('survivalWave:cohortJoined', { wave: 1, ids });
}
