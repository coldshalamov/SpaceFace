// SFQ-I014 — an expired tar field drops its drag and its goo. A still-live field does not.
//
//   node --test test/infer-p08-goo-expiry.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { bombs } from '../src/systems/bombs.js';
import { BOMB_DEFS } from '../src/data/bombs.js';

const DT = 1 / 60;
const SEED = 4242;
const GOO = BOMB_DEFS.bomb_goo;

function boot() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.simTime = 0;
  state.tick = 0;
  const bus = createBus();
  const helpers = {};
  let kernel = null;
  const combatFacade = { ensureKernel: () => kernel };
  const registry = { get: (name) => (name === 'combat' ? combatFacade : null) };
  const coreSystem = Object.create(core);
  coreSystem.init({ state, bus, helpers, registry });
  kernel = createCombatKernel({ state, bus, helpers, registry });
  helpers.routeCombatDamage = (req) => kernel.routeDamage(req);
  const player = helpers.spawnEntity({
    type: 'ship', team: 0, mass: 32, radius: 6, rot: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 100000, hullMax: 100000,
  });
  state.playerId = player.id;
  const system = Object.create(bombs);
  system.init({ state, bus, helpers, registry });
  const rt = state.bombs;
  const free = rt.rack.cells.findIndex((c) => !c || !c.count);
  if (free >= 0) rt.rack.cells[free] = { id: 'bomb_goo', count: GOO.magazine };
  else {
    rt.rack.cells.push({ id: 'bomb_goo', count: GOO.magazine });
    rt.rack.sockets = rt.rack.cells.length;
  }
  rt.selectedId = 'bomb_goo';
  const fieldEnded = [];
  bus.on('bombs:fieldEnded', (p) => fieldEnded.push(p));
  return {
    state, bus, player, system, fieldEnded,
    spawnShip(x, z) {
      return helpers.spawnEntity({
        type: 'ship', team: 1, mass: 32, radius: 1, rot: 0,
        pos: { x, z }, vel: { x: 30, z: 0 }, hull: 100000, hullMax: 100000,
      });
    },
    tick(n = 1) {
      for (let i = 0; i < n; i++) {
        state.tick += 1;
        state.simTime += DT;
        kernel.prePhysics(DT);
        system.update(DT, state);
        kernel.postPhysics();
      }
    },
    gooOf(ent) {
      return state.combat.entities[String(ent.id)]?.statuses?.status_goo || null;
    },
  };
}

function viscosityHits(ent) {
  const command = consumePhysicsCommand(ent);
  if (!command || !command.impulses) return 0;
  let n = 0;
  for (const impulse of command.impulses) {
    if (impulse && impulse.kind === 'bomb_viscosity') n += 1;
  }
  return n;
}

test('expired goo drops its drag and status while a live goo keeps both (seed 4242)', () => {
  const t = boot();
  try {
    const bombA = t.system.drop(t.player, 'bomb_goo', t.state);
    assert.ok(bombA);
    t.player.pos.x = 280;
    t.tick(160);
    const bombB = t.system.drop(t.player, 'bomb_goo', t.state);
    assert.ok(bombB);

    const onlyA = t.spawnShip(bombA.pos.x, bombA.pos.z);
    const onlyB = t.spawnShip(bombB.pos.x, bombB.pos.z);
    assert.ok(Math.hypot(onlyA.pos.x - bombB.pos.x, onlyA.pos.z - bombB.pos.z) > GOO.radius);
    assert.ok(Math.hypot(onlyB.pos.x - bombA.pos.x, onlyB.pos.z - bombA.pos.z) > GOO.radius);

    t.tick(80);
    assert.equal(bombA.data.phase, 'field');
    assert.equal(bombB.data.phase, 'field');

    let dragA = 0;
    let dragB = 0;
    for (let i = 0; i < 20; i++) {
      onlyA.pos.x = bombA.pos.x;
      onlyA.pos.z = bombA.pos.z;
      onlyB.pos.x = bombB.pos.x;
      onlyB.pos.z = bombB.pos.z;
      onlyA.vel.x = 30;
      onlyB.vel.x = 30;
      t.tick(1);
      dragA += viscosityHits(onlyA);
      dragB += viscosityHits(onlyB);
    }
    assert.ok(dragA > 0, 'the live first cloud still drags');
    assert.ok(dragB > 0, 'the live second cloud still drags');
    assert.ok(t.gooOf(onlyA)?.stacks > 0);
    assert.ok(t.gooOf(onlyB)?.stacks > 0);

    for (let i = 0; i < 400 && t.fieldEnded.length < 1; i++) {
      onlyA.pos.x = bombA.pos.x;
      onlyA.pos.z = bombA.pos.z;
      onlyB.pos.x = bombB.pos.x;
      onlyB.pos.z = bombB.pos.z;
      onlyA.vel.x = 30;
      onlyB.vel.x = 30;
      t.tick(1);
      viscosityHits(onlyA);
      viscosityHits(onlyB);
    }
    assert.equal(t.fieldEnded.length, 1);
    assert.equal(t.fieldEnded[0].bombId, bombA.id);
    assert.equal(t.fieldEnded[0].trigger, 'expired');
    assert.equal(bombA.alive, false);
    assert.equal(bombA.data.phase, 'spent');
    assert.equal(bombB.alive, true);
    assert.equal(bombB.data.phase, 'field');
    assert.equal(t.gooOf(onlyA), null, 'the expired cloud no longer tars its target');
    assert.ok(t.gooOf(onlyB)?.stacks > 0, 'the live cloud keeps its tar');

    let afterA = 0;
    let afterB = 0;
    for (let i = 0; i < 20; i++) {
      onlyA.pos.x = bombA.pos.x;
      onlyA.pos.z = bombA.pos.z;
      onlyB.pos.x = bombB.pos.x;
      onlyB.pos.z = bombB.pos.z;
      onlyA.vel.x = 30;
      onlyB.vel.x = 30;
      t.tick(1);
      afterA += viscosityHits(onlyA);
      afterB += viscosityHits(onlyB);
    }
    assert.equal(afterA, 0, 'expired goo requests no more drag');
    assert.ok(afterB > 0, 'the still-live goo keeps dragging');
    assert.equal(t.gooOf(onlyA), null);
    assert.ok(t.gooOf(onlyB)?.stacks > 0);
    console.log(`SEED=${SEED} liveDrag=${dragA}/${dragB} after=${afterA}/${afterB} ended=${t.fieldEnded[0].trigger}`);
  } finally {
    t.bus.clear();
  }
});
