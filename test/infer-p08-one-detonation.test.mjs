// SFQ-I015 — command and proximity on one bomb lifetime fire one detonation cue.
// A second bomb still fires its own.
//
//   node --test test/infer-p08-one-detonation.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { BOMB_DEFS } from '../src/data/bombs.js';
import { bombs } from '../src/systems/bombs.js';

const DT = 1 / 60;
const SEED = 4242;

function boot() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.simTime = 0;
  state.playerId = 1;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, mass: 32, radius: 6, rot: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  const detonated = [];
  const audio = [];
  const routed = [];
  const dropped = [];
  bus.on('bombs:detonated', (p) => detonated.push(p));
  bus.on('audio:cue', (p) => audio.push(p));
  bus.on('bombs:dropped', (p) => dropped.push(p));
  let nextId = 50;
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, hull: 40, hullMax: 40, ...spec };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    routeCombatDamage(req) { routed.push(req); return { ok: true }; },
    combatPhysics: { applyImpulse() { return true; } },
  };
  const system = Object.create(bombs);
  system.init({ state, bus, helpers });
  const selectedId = 'bomb_frag';
  const rt = state.bombs;
  const def = BOMB_DEFS[selectedId];
  const free = rt.rack.cells.findIndex((c) => !c || !c.count);
  if (free >= 0) rt.rack.cells[free] = { id: selectedId, count: def.magazine };
  rt.selectedId = selectedId;
  return {
    state, bus, system, player, detonated, audio, routed, dropped,
    spawnShip(x, z) {
      const ship = {
        id: nextId++, type: 'ship', alive: true, team: 1, mass: 32, radius: 4,
        pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, hull: 40, hullMax: 40,
      };
      state.entities.set(ship.id, ship);
      state.entityList.push(ship);
      return ship;
    },
    tick(n = 1) {
      for (let i = 0; i < n; i++) {
        state.simTime += DT;
        state.tick += 1;
        system.update(DT, state);
      }
    },
  };
}

function burstCues(audio, bombId) {
  return audio.filter((p) => p && p.bombId === bombId && p.id === 'bombs.frag.burst');
}

test('one bomb with command and proximity fires once; a second bomb still fires (seed 4242)', () => {
  const t = boot();
  try {
    t.state.input.actions = { dropBomb: true };
    t.tick(1);
    assert.equal(t.dropped.length, 1);
    const bombA = t.state.entities.get(t.dropped[0].bombId);
    assert.ok(bombA, 'first bomb dropped');
    t.tick(40);
    assert.equal(bombA.data.armed, true);
    assert.equal(bombA.data.phase, 'drift');
    t.player.pos.x = 800;
    t.player.pos.z = 800;
    const victimA = t.spawnShip(bombA.pos.x, bombA.pos.z);
    t.state.input.actions.chargeDetonate = true;
    t.tick(1);
    t.state.input.actions.chargeDetonate = false;
    t.tick(20);
    const hitsA = t.detonated.filter((p) => p.bombId === bombA.id);
    const soundsA = burstCues(t.audio, bombA.id);
    assert.equal(hitsA.length, 1, 'command plus a proximity victim is one detonation');
    assert.equal(soundsA.length, 1, 'that detonation plays one burst');
    assert.equal(new Set(hitsA.map((p) => p.trigger)).size, 1);
    const damageA = t.routed.filter((r) => r && r.origin && r.origin.id === bombA.id);
    assert.deepEqual(damageA.map((r) => r.targetId), [victimA.id], 'one damage application for the first bomb');

    t.player.pos.x = 400;
    t.tick(40);
    t.state.input.actions.dropBomb = true;
    t.tick(1);
    assert.equal(t.dropped.length, 2, 'the bay accepts a second bomb after its cooldown');
    const bombB = t.state.entities.get(t.dropped[1].bombId);
    assert.ok(bombB, 'second bomb dropped');
    t.tick(40);
    assert.equal(bombB.data.phase, 'drift');
    t.spawnShip(bombB.pos.x, bombB.pos.z);
    t.tick(30);
    const hitsB = t.detonated.filter((p) => p.bombId === bombB.id);
    const soundsB = burstCues(t.audio, bombB.id);
    assert.equal(hitsB.length, 1, 'a distinct bomb still detonates');
    assert.equal(soundsB.length, 1);
    assert.equal(hitsA.length, 1, 'the first bomb does not pick up a late second cue');
    void victimA;
    console.log(`SEED=${SEED} A=${hitsA[0].trigger} cues=${soundsA.length} B=${hitsB[0].trigger} cues=${soundsB.length}`);
  } finally {
    t.bus.clear();
  }
});
