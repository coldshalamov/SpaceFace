// SEED-HF-11 — a thrown-mass kill says it was yours. One string branch on destruction.playerCaused.
// Seed 4242. Kill cause, surface, and attribution stay whatever compactKillCausality already stored.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { KillCause, KillSurface } from '../src/combat/killCausality.js';
import { combatOutcome, combatOutcomeForEntity } from '../src/systems/combatOutcome.js';

const SEED = 4242;

function boot() {
  const voices = [];
  const state = {
    tick: 4,
    simTime: 1,
    mode: 'flight',
    playerId: 1,
    meta: { seed: SEED },
    world: { currentSectorId: 'sector_sker_haven' },
    entities: new Map(),
    entityList: [],
  };
  const player = {
    id: 1, type: 'ship', team: 0, alive: true, pos: { x: 0, z: 0 }, data: { name: 'You' },
  };
  state.entities.set(1, player);
  state.entityList.push(player);
  const bus = createBus();
  const sys = Object.create(combatOutcome);
  sys.init({
    state,
    bus,
    helpers: { voice: { say(line) { voices.push(line); return true; } } },
  });
  return { state, bus, sys, voices };
}

function raider(state, id, name) {
  const entity = {
    id,
    type: 'ship',
    team: 1,
    alive: true,
    pos: { x: 90, z: 10 },
    factionId: 'faction_reach',
    data: {
      name,
      shipClass: 'fighter',
      ai: { hostileTeams: [0], archetype: 'pirate' },
    },
  };
  state.entities.set(id, entity);
  state.entityList.push(entity);
  return entity;
}

function kill(bus, entity, presentation, killerId) {
  bus.emit('entity:killed', {
    id: entity.id,
    killerId,
    type: 'ship',
    factionId: entity.factionId,
    victimClass: 'fighter',
    presentation,
  });
}

test('SEED-HF-11 seed 4242 your thrown-mass crash says so, and an NPC crash does not', () => {
  const h = boot();
  const yoursTerrain = raider(h.state, 2, 'Reach Raider');
  const yoursShip = raider(h.state, 3, 'Keel Dog');
  const theirs = raider(h.state, 4, 'Other Pilot');
  const shot = raider(h.state, 5, 'Gunner');

  kill(h.bus, yoursTerrain, {
    version: 1,
    cause: KillCause.TERRAIN_COLLISION,
    playerCaused: true,
    surface: KillSurface.TERRAIN,
  }, h.state.playerId);
  kill(h.bus, yoursShip, {
    version: 1,
    cause: KillCause.SHIP_COLLISION,
    surface: KillSurface.CRAFT,
  }, h.state.playerId);
  kill(h.bus, theirs, {
    version: 1,
    cause: KillCause.SHIP_COLLISION,
    playerCaused: false,
    surface: KillSurface.CRAFT,
  }, 9);
  kill(h.bus, shot, {
    version: 1,
    cause: KillCause.KINETIC,
    playerCaused: true,
    surface: null,
  }, h.state.playerId);

  const terrain = combatOutcomeForEntity(h.state, yoursTerrain.id);
  const collision = combatOutcomeForEntity(h.state, yoursShip.id);
  const npc = combatOutcomeForEntity(h.state, theirs.id);
  const guns = combatOutcomeForEntity(h.state, shot.id);

  assert.deepEqual(terrain.destruction, {
    version: 1,
    cause: 'terrain_collision',
    playerCaused: true,
    surface: 'terrain',
  });
  assert.deepEqual(collision.destruction, {
    version: 1,
    cause: 'ship_collision',
    playerCaused: true,
    surface: 'craft',
  });
  assert.equal(npc.destruction.playerCaused, false);
  assert.equal(npc.destruction.cause, 'ship_collision');
  assert.equal(guns.destruction.cause, 'kinetic');
  assert.equal(guns.destruction.playerCaused, true);

  const said = h.voices
    .filter((line) => String(line.id || '').startsWith('combatOutcome:'))
    .map((line) => line.text);
  assert.deepEqual(said, [
    'Reach Raider smashed against terrain, wrecked by your thrown mass.',
    'Keel Dog destroyed in a collision, wrecked by your thrown mass.',
    'Other Pilot destroyed in a collision.',
    'Gunner destroyed by weapons fire.',
  ]);

  h.sys.destroy();
});
