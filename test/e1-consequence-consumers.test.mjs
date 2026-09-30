/**
 * D106 — E1 depth-program consequence events must have production consumers. Each emit
 * asserted by the authored tests now lands in its owning system: the ghost swarm spawns,
 * persistent story cargo reaches the hold, faction trade posture is recorded, ambient comms
 * register (and voice once), and a vengeful moral return closes the debt.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { scanner } from '../src/systems/scanner.js';
import { cargo as cargoSystem } from '../src/systems/cargo.js';
import { factions } from '../src/systems/factions.js';
import { story as storySystem } from '../src/systems/story.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { nextMoralDebt } from '../src/systems/moralMemory.js';

function bootPlayerSim(seed, systems) {
  const sim = createSimulation({ seed, systems });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100, data: { intent: {}, ai: {} },
  });
  sim.state.playerId = player.id;
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = 'sector_helios_prime';
  return { sim, state: sim.state, bus: sim.bus };
}

test('sensorGhost:swarm spawns marked, passive, bounded-lifetime ghost contacts deterministically', () => {
  const run = (seed) => {
    const t = bootPlayerSim(seed, [scanner]);
    const before = t.state.entities.size;
    t.bus.emit('sensorGhost:swarm', { encounterId: 'debug:ghosts', pos: { x: 400, z: -250 }, count: 7 });
    const spawned = [];
    for (const entity of t.state.entities.values()) {
      if (entity.type !== 'ship' || !entity.data || !entity.data.isGhost) continue;
      spawned.push(entity);
    }
    assert.equal(spawned.length, 7, 'the swarm count must land as entities');
    assert.ok(t.state.entities.size >= before + 7);
    return spawned.map((e) => ({ x: e.pos.x, z: e.pos.z, vx: e.vel.x, vz: e.vel.z }))
      .sort((a, b) => (a.x - b.x) || (a.z - b.z));
  };
  const first = run(47201);
  const second = run(47201);
  assert.deepEqual(first, second, 'same seed must scatter the same swarm');
  const t = bootPlayerSim(47201, [scanner]);
  t.bus.emit('sensorGhost:swarm', { encounterId: 'debug:ghosts', pos: { x: 0, z: 0 }, count: 7 });
  for (const entity of t.state.entities.values()) {
    if (entity.type !== 'ship' || !entity.data || !entity.data.isGhost) continue;
    assert.equal(entity.data.ghost, true);
    assert.equal(entity.data.ai.passive, true, 'ghosts never pick fights');
    assert.equal(typeof entity.data.despawnAt, 'number', 'each ghost carries its own decay clock');
    const drift = Math.hypot(entity.vel.x, entity.vel.z);
    assert.ok(drift > 10 && drift < 60, `ghosts scatter outward (drift ${drift.toFixed(1)})`);
  }
});

test('cargo:persistentAdded grants the story item into the hold (idempotent, unknown ids refuse)', () => {
  const t = bootPlayerSim(47202, [cargoSystem]);
  t.state.story.persistentCargo = ['depth_vols_black_box'];
  t.bus.emit('cargo:persistentAdded', { id: 'depth_vols_black_box', label: 'Captain Vols black box' });
  assert.equal(t.state.player.cargo.items.depth_vols_black_box, 1);
  assert.ok(t.state.player.cargo.usedMass > 0, 'the story item has authored mass');
  t.bus.emit('cargo:persistentAdded', { id: 'depth_vols_black_box', label: 'again' });
  assert.equal(t.state.player.cargo.items.depth_vols_black_box, 1, 'a re-register never duplicates the item');
  t.bus.emit('cargo:persistentAdded', { id: 'not_a_registered_story_item' });
  assert.equal(t.state.player.cargo.items.not_a_registered_story_item, undefined);
});

test('faction:tradePosture records durable posture on the owning faction record', () => {
  const t = bootPlayerSim(47203, [factions]);
  t.bus.emit('faction:tradePosture', { factionId: 'faction_understory', posture: 'open_early', permanent: true });
  const rec = t.state.factions.faction_understory;
  assert.equal(rec.tradePosture, 'open_early');
  assert.equal(rec.tradePostureLocked, true);
  t.bus.emit('faction:tradePosture', { factionId: 'faction_understory', posture: 'cautious' });
  assert.equal(rec.tradePosture, 'open_early', 'a permanent posture outranks later soft sets');
});

test('ambientComms:register stores the line and voices it once; toneChanged updates the registry', () => {
  const t = bootPlayerSim(47204, [storySystem]);
  const popups = [];
  t.bus.on('comms:popup', (p) => popups.push(p));
  t.bus.emit('ambientComms:register', {
    id: 'vols_mayday_ghost', line: 'Mayday. Tessera drive gone. Anyone receiving.', persistent: true,
  });
  assert.equal(t.state.story.ambientComms.lines.vols_mayday_ghost.persistent, true);
  assert.equal(popups.length, 1, 'the registered line is voiced exactly once');
  assert.match(popups[0].text, /Mayday/);
  t.bus.emit('ambientComms:register', {
    id: 'vols_mayday_ghost', line: 'Mayday. Tessera drive gone. Anyone receiving.', persistent: true,
  });
  assert.equal(popups.length, 1, 'a re-register refreshes the record but never re-voices');
  t.bus.emit('ambientComms:toneChanged', { tone: 'warmer', reason: 'love_letter_reseeded', persistent: true });
  assert.equal(t.state.story.ambientComms.tone, 'warmer');
});

test('moralMemory:vengefulReturn closes the debt so the picker never re-offers it', () => {
  const t = bootPlayerSim(47205, [encounterDirector]);
  t.bus.emit('moralMemory:remember', { id: 'ace_test_return', name: 'Test Return', cause: 'spared' });
  assert.ok(nextMoralDebt(t.state), 'the debt is pending before the return');
  t.bus.emit('moralMemory:vengefulReturn', { id: 'ace_test_return', name: 'Test Return' });
  const debt = t.state.story.moralMemory.debts.ace_test_return;
  assert.equal(debt.status, 'returned');
  assert.equal(typeof debt.returnedAt, 'number');
  assert.equal(nextMoralDebt(t.state), null, 'a returned debt is never re-picked');
});
