// SFQ-I018 on the LIVE AI backend (tacticalAI, the default aiBackend): a lawful patrol stops fighting once the
// player's warrant has lapsed.
//
// The compatibility backend (the old src/systems/ai.js) was deleted in Q4; this pins the behaviour where
// players meet it: a wanted player is shot at by the patrol, and the moment the heat is gone the patrol stops
// firing and does not close.
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
const PATROL_POST_WU = 140; // the patrol spawns (and holds its post) 140 WU off the player

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
  const patrol = sim.spawn(makeEnemySpawnSpec('patrol_lawman', 3, { x: PATROL_POST_WU, z: 0 }, { factionId: 'faction_scn' }));
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
  // The patrol flies its owed attack telegraph (engine_flare, f07ab9045abe) and holds fire while
  // its committed aim is off-bore, so the first round lands ~6 s in: the window covers the warning.
  sim.runTicks(60 * 8);
  assert.ok(counts.fires > 0, `the patrol engages a wanted player (${counts.fires} shots)`);

  state.player.heat = 0;
  sim.runTicks(15); // the lapse is noticed within a quarter of a second
  const firesAtLapse = counts.fires;
  sim.runTicks(60 * 4);
  assert.equal(counts.fires, firesAtLapse, 'no round leaves the patrol once the warrant has lapsed');
  // It stops pressing the attack: the squad drops the player as an objective and the hull flies
  // its own post (a formation hold), not an intercept. This used to be read off the distance,
  // which a stale contact picture passed by accident (the patrol kept FOCUS on the clean player
  // for 4 s and only happened to be extending away); since aiRefreshCadence the hull sees the
  // lapse within one think and turns back to its post, which can sit nearer the player.
  const decision = sim.registry.get('tacticalAI').stack.lastResult.decisions
    .find((row) => row.entityId === patrol.id);
  assert.ok(decision, 'the patrol is still on the tactical roster');
  const objective = decision.directive && decision.directive.objective && decision.directive.objective.kind;
  assert.ok(objective !== 'focus' && objective !== 'engage',
    `it does not press the attack on a player who is no longer wanted (objective ${objective})`);
  assert.notEqual(decision.maneuver && decision.maneuver.kind, 'intercept',
    'it does not fly an intercept at a player who is no longer wanted');
  // HOLD at the spawn post. After the warrant lapses the hull is already on HOLD/FORMATION
  // (not intercept). It brakes in from ~307 WU, crosses 140 around +10 s, reverses at ~131 WU
  // around +14 s, then station-keeps in a ~10 WU orbit around the post — HOLD arrivalRadius
  // is 18 WU in src/ai/maneuver.js. A 1 s snapshot during the inbound brake (142 → 139) is
  // still the return, not a settle. Wait past the first reversal, then sample a full orbit.
  const POST_HOLD_RADIUS_WU = 18;
  sim.runTicks(60 * 12);
  const samples = [];
  for (let i = 0; i < 6; i++) {
    sim.runTicks(60);
    samples.push(distance());
  }
  const nearest = Math.min(...samples);
  const farthest = Math.max(...samples);
  assert.ok(nearest >= PATROL_POST_WU - POST_HOLD_RADIUS_WU,
    `it station-keeps at its post, never dives on the player (${nearest.toFixed(1)}–${farthest.toFixed(1)} WU)`);
  assert.ok(farthest <= PATROL_POST_WU + POST_HOLD_RADIUS_WU,
    `it remains on the post (${nearest.toFixed(1)}–${farthest.toFixed(1)} WU)`);
  assert.equal(counts.fires, firesAtLapse, 'still no round once the warrant has lapsed');
  assert.equal(patrol.data.ai.roe, 'lawful_wanted_only');
});

test('a patrol never opens fire on a player who was never wanted', async () => {
  const { sim, state, counts } = await rig();
  state.player.heat = 0;
  sim.runTicks(60 * 6);
  assert.equal(counts.fires, 0);
});
