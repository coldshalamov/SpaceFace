// Scratch lethality probe: same stack as test/law-assault-player-death.test.mjs but parameterized
// on start simTime, so we can measure time-to-kill INSIDE the first-session attacker cap.
// Usage: node scripts/probe-law-lethality.mjs [startSimTime] [maxSeconds]
import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { heat, isPlayerWanted } from '../src/systems/heat.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { aiEncounter } from '../src/systems/aiEncounter.js';
import { actions } from '../src/systems/actions.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { weapons } from '../src/systems/weapons.js';
import { physics } from '../src/systems/../core/physics.js';
import { combat } from '../src/systems/combat.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';

const START_T = Number(process.argv[2] || 300);
const MAX_S = Number(process.argv[3] || 300);
const HELIOS = 'sector_helios_prime';
const COALITION_LOCAL = { x: -920, z: 1080 };

const sim = createSimulation({
  seed: 47,
  systems: [spawnBudget, lawSecurity, heat, createTacticalAISystem(), aiEncounter, actions, aiPorts, weapons, physics, combat],
});
const { state, bus } = sim;
state.mode = 'flight';
state.world.currentSectorId = HELIOS;
state.world.sectors[HELIOS] = { id: HELIOS, factionId: 'faction_scn', security: 0.98, tier: 0 };
state.simTime = START_T;
state.tick = START_T * 60;
state.player.credits = NEW_GAME.credits;

const stationPos = sectorLocalToGlobalForSector(COALITION_LOCAL, HELIOS);
const station = sim.spawn({
  type: 'station', team: 2, factionId: 'faction_scn',
  pos: { x: stationPos.x, z: stationPos.z }, radius: 60,
  data: { stationId: 'station_coalition', dockRadius: 90, factionId: 'faction_scn' },
});
const player = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
  team: 0, factionId: 'faction_free', isPlayer: true, player: state.player,
  fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
  pos: { x: stationPos.x + 180, z: stationPos.z + 40 },
}));
state.playerId = player.id;

let playerHits = 0;
let diedAt = null;
bus.on('combat:damage', (p) => { if (p && p.targetId === player.id) playerHits++; });
bus.on('player:death', () => { diedAt = state.simTime; });

const ready = await sim.registry.get('physics').prepareBackend(state);
console.log('physicsReady', ready, 'startSimTime', START_T);

const emitHit = () => bus.emit('combat:damage', { attackerId: player.id, targetId: station.id, applied: 8, amount: 8, kind: 'energy' });
emitHit();
sim.runTicks(30);

for (let s = 0; s < MAX_S && diedAt == null; s++) {
  emitHit();
  sim.runTicks(60);
  if (s % 30 === 0 || diedAt != null) {
    const shooters = [...state.entities.values()].filter((e) => e && e.type === 'ship' && e.data && e.data.ai && e.data.ai.spawnContext === 'security_response');
    console.log(`t+${s}s simT=${Math.round(state.simTime)} shield=${Math.round(player.shield)} hull=${Math.round(player.hull)} hits=${playerHits} heat=${(state.player.heat||0).toFixed(2)} wanted=${isPlayerWanted(state)} resp=${shooters.map((e)=>`${e.id}@${Math.round(Math.hypot(e.pos.x-player.pos.x,e.pos.z-player.pos.z))}${e.data.intent&&e.data.intent.fire?'F':''}${e.data.ai.combatDoctrinePhase||''}`).join(' ')}`);
  }
}
console.log('RESULT', diedAt == null ? 'NO_DEATH' : `DIED at simT ${Math.round(diedAt)} (${Math.round(diedAt - START_T)}s in)`, 'hits', playerHits);
sim.dispose();
