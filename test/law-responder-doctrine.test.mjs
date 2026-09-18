// Claimed law responders must carry a combat doctrine. Execution authorization
// (authorizeAIEngagement) fail-closes on a missing doctrine id, so an ambient squad
// patrol claimed for a security_response incident would otherwise orbit the offender
// forever — motive set, weapons free, but canStart denied on every tick (the live
// Helios assault stall: 130+ s of close orbiting with zero fire intent). _authorizeResponder
// outfits for response, so it backfills a doctrine: an authored one, else the faction
// profile's, else the patrol flyby. Activity/ROE still gate actual fire.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { heat } from '../src/systems/heat.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { aiEncounter } from '../src/systems/aiEncounter.js';
import { actions } from '../src/systems/actions.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { weapons } from '../src/systems/weapons.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { authorizeAIEngagement } from '../src/ai/engagementAuthority.js';
import { normalizeCombatDoctrineId } from '../src/ai/combatDoctrine.js';

const SEED = 47;
const HELIOS = 'sector_helios_prime';
const POST_CAP_SIMTIME = 601;

function boot() {
  const sim = createSimulation({
    seed: SEED,
    systems: [
      spawnBudget,
      lawSecurity,
      heat,
      createTacticalAISystem(),
      aiEncounter,
      actions,
      aiPorts,
      weapons,
      physics,
      combat,
    ],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = HELIOS;
  state.world.sectors[HELIOS] = {
    id: HELIOS,
    factionId: 'faction_scn',
    security: 0.98,
    tier: 0,
  };
  state.simTime = POST_CAP_SIMTIME;
  state.tick = POST_CAP_SIMTIME * 60;
  const player = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
    team: 0,
    factionId: 'faction_free',
    isPlayer: true,
    player: state.player,
    fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
    pos: { x: 1280, z: -420 },
  }));
  state.playerId = player.id;
  return { sim, state, player };
}

// An ambient squad patrol as the live sector fields it: lawful team, no authored combat
// doctrine on its ai record.
function spawnDoctrineLessPatrol(sim, pos) {
  return sim.spawn({
    type: 'ship',
    alive: true,
    team: 2,
    factionId: 'faction_scn',
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 18,
    mass: 70,
    hull: 200,
    hullMax: 200,
    armorHp: 50,
    armorMax: 50,
    shield: 100,
    shieldMax: 100,
    cap: 220,
    capMax: 220,
    flags: {},
    data: {
      defId: 'patrol_lawman',
      ai: {
        archetype: 'brawler',
        lawful: true,
        passive: false,
      },
    },
  });
}

test('authorizing a doctrine-less patrol backfills a valid combat doctrine', () => {
  const { sim, state, player } = boot();
  const patrol = spawnDoctrineLessPatrol(sim, { x: player.pos.x + 120, z: player.pos.z });
  assert.equal(normalizeCombatDoctrineId(patrol.data.ai.combatDoctrineId), null,
    'precondition: ambient patrol carries no doctrine');

  const law = sim.registry.get('lawSecurity');
  assert.equal(typeof law._authorizeResponder, 'function', 'law instance must expose authorize');
  law._authorizeResponder(patrol, player, null, 'security_response');

  const doctrine = normalizeCombatDoctrineId(patrol.data.ai.combatDoctrineId);
  assert.ok(doctrine, 'authorized responder must carry a valid combat doctrine');
  assert.equal(patrol.data.ai.lawful, true);
  assert.equal(patrol.data.ai.securityTargetId, player.id);
});

test('authorized doctrine-less patrol passes the doctrine execution gate', () => {
  const { sim, state, player } = boot();
  const patrol = spawnDoctrineLessPatrol(sim, { x: player.pos.x + 120, z: player.pos.z });
  const law = sim.registry.get('lawSecurity');
  law._authorizeResponder(patrol, player, null, 'security_response');

  // Let the 1 s challenge window elapse so the probe reads the doctrine gate, not the
  // window. Advance the clock directly: running ticks here would let AI maintenance
  // re-issue the activity with a fresh startedTick and renew the window under test.
  state.tick += 120;
  const result = authorizeAIEngagement({
    state,
    self: entityById(state, patrol.id),
    target: entityById(state, player.id),
    objectiveReason: 'combat_doctrine:interceptor_flyby:strike',
  });
  assert.notEqual(result.reason, 'combat_doctrine',
    `doctrine gate must pass for an authorized responder: ${JSON.stringify(result)}`);
  assert.equal(result.ok, true, `authorized responder must be cleared to fire: ${JSON.stringify(result)}`);
});

function entityById(state, id) {
  return state.entities.get(id);
}
