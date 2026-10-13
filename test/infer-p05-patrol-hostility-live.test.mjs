// SFQ-I018 on the LIVE AI backend (tacticalAI, the default aiBackend): a lawful patrol stops fighting once the
// player's warrant has lapsed.
//
// test/infer-p05-patrol-hostility.test.mjs pins the compatibility backend (src/systems/ai.js), which the default
// runtime does not run. On the live backend the engagement authority is the hostility oracle (isHostileForAI) and the
// final fire gate (roe lawful_wanted_only), so the behaviour already held; this pins it where players meet it: a
// wanted player is shot at by the patrol, and the moment the heat is gone the patrol stops firing and does not close.
// Seed 4242, the production tactical stack at 60 Hz, no stubbed hostility.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { aiEncounter } from '../src/systems/aiEncounter.js';
import { actions } from '../src/systems/actions.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { weapons } from '../src/systems/weapons.js';
import { physics } from '../src/core/physics.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';

const SECTOR = 'sector_helios_prime';

async function rig() {
  const sim = createSimulation({
    seed: 4242,
    systems: [spawnBudget, createTacticalAISystem(), aiEncounter, actions, aiPorts, weapons, physics, combat],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  state.world.sectors[SECTOR] = { id: SECTOR, factionId: 'faction_scn', security: 0.98, tier: 0 };
  state.simTime = 700; // past the first-session protection window
  state.tick = 700 * 60;
  await sim.registry.get('physics').prepareBackend(state);
  const player = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
    team: 0, factionId: 'faction_free', isPlayer: true, player: state.player,
    fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
    pos: { x: 0, z: 0 },
  }));
  state.playerId = player.id;
  const patrol = sim.spawn(makeEnemySpawnSpec('patrol_lawman', 3, { x: 140, z: 0 }, { factionId: 'faction_scn' }));
  const counts = { fires: 0 };
  bus.on('combat:fire', (payload) => { if (payload && payload.ownerId === patrol.id) counts.fires += 1; });
  const distance = () => Math.hypot(patrol.pos.x - player.pos.x, patrol.pos.z - player.pos.z);
  return { sim, state, player, patrol, counts, distance };
}

test('a lawful patrol is a lawful patrol on the live backend', async () => {
  const { patrol } = await rig();
  assert.equal(patrol.data.ai.lawful, true);
  assert.equal(patrol.data.ai.roe, 'lawful_wanted_only');
});

test('a patrol fires at a wanted player, then stops firing and stops closing once the warrant lapses', async () => {
  const { sim, state, patrol, counts, distance } = await rig();
  state.player.heat = 0.6;
  sim.runTicks(60 * 3);
  assert.ok(counts.fires > 0, `the patrol engages a wanted player (${counts.fires} shots)`);

  state.player.heat = 0;
  sim.runTicks(15); // the lapse is noticed within a quarter of a second
  const firesAtLapse = counts.fires;
  const distanceAtLapse = distance();
  sim.runTicks(60 * 4);
  assert.equal(counts.fires, firesAtLapse, 'no round leaves the patrol once the warrant has lapsed');
  assert.ok(distance() >= distanceAtLapse - 5, 'it does not press the attack on a player who is no longer wanted');
  assert.equal(patrol.data.ai.roe, 'lawful_wanted_only');
});

test('a patrol never opens fire on a player who was never wanted', async () => {
  const { sim, state, counts } = await rig();
  state.player.heat = 0;
  sim.runTicks(60 * 6);
  assert.equal(counts.fires, 0);
});
