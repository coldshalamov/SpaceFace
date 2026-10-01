import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { mines } from '../src/systems/mines.js';
import { combat } from '../src/systems/combat.js';
import { resolveAdditionalActionVfxReceipt } from '../src/render/vfx/actionEventRecipes.js';

test('a triggered mine snaps before it detonates', () => {
  const sim = createSimulation({ seed: 4242, systems: [mines, combat] });
  const { state, bus } = sim;
  state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12,
    hull: 200, hullMax: 200, shield: 0, shieldMax: 0,
    data: {},
  });
  state.playerId = player.id;
  const order = [];
  bus.on('mines:triggered', (p) => order.push({ kind: 'trigger', pos: p.pos, mineId: p.mineId }));
  bus.on('mines:detonated', (p) => order.push({ kind: 'detonation', pos: p.pos, mineId: p.mineId }));
  const owner = sim.spawn({
    type: 'ship', team: 1, pos: { x: 500, z: 0 }, radius: 14, hull: 100, hullMax: 100, data: {},
  });
  const mine = sim.registry.get('mines').placeMine({
    ownerId: owner.id,
    pos: { x: 40, z: 0 },
    team: 1,
    armDelayS: 0,
    triggerRadius: 80,
    blastDamage: 35,
    telegraph: false,
  });
  sim.runTicks(3);
  assert.equal(order.length, 2);
  assert.equal(order[0].kind, 'trigger');
  assert.equal(order[1].kind, 'detonation');
  assert.equal(order[0].mineId, mine.id);
  assert.equal(order[1].mineId, mine.id);
  const trigger = resolveAdditionalActionVfxReceipt('mines:triggered', order[0], state);
  const blast = resolveAdditionalActionVfxReceipt('mines:detonated', order[1], state);
  assert.equal(trigger.pos.x, 40);
  assert.equal(blast.pos.x, 40);
  assert.equal(trigger.sourceId, mine.id);
  sim.dispose();
});
