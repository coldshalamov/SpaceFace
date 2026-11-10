// In-cap law-response chain probe: mirrors the live assault scenario at simTime ~155 (inside the
// first-session attacker cap window) and dumps, per second, every link in the fire chain for each
// dispatched responder — doctrine phase/fireWindow, decision action, canStart result, cap
// ownership (owners/waiting), intent.fire and block reason, plus combat trace rejections.
// Read-only diagnostic: no gameplay state is written.

import { createSimulation } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { heat, isPlayerWanted } from '../src/systems/heat.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { aiEncounter } from '../src/systems/aiEncounter.js';
import { actions } from '../src/systems/actions.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { weapons } from '../src/systems/weapons.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { makeShipEntitySpec, fittingsFromDefaultModules } from '../src/systems/ships.js';
import { NEW_GAME } from '../src/data/newGameDefaults.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { authorizeAIEngagement } from '../src/ai/engagementAuthority.js';

const SEED = 47;
const HELIOS = 'sector_helios_prime';
const COALITION_LOCAL = { x: -920, z: 1080 };
const INCAP_SIMTIME = 155; // inside the first-session cap window (lifts at 600)
const SECONDS = Number(process.env.PROBE_SECONDS || 150);

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
const { state, bus } = sim;
state.mode = 'flight';
state.world.currentSectorId = HELIOS;
state.world.sectors[HELIOS] = { id: HELIOS, factionId: 'faction_scn', security: 0.98, tier: 0 };
state.simTime = INCAP_SIMTIME;
state.tick = INCAP_SIMTIME * 60;
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

const log = { deaths: [], hits: [], fires: [], rejects: [], starts: [] };
bus.on('player:death', (p) => log.deaths.push(p));
bus.on('combat:damage', (p) => {
  if (p && p.targetId === player.id) log.hits.push({ attackerId: p.attackerId, applied: p.applied, atTick: state.tick });
});
bus.on('combat:fire', (p) => log.fires.push({ ownerId: p && p.ownerId, atTick: state.tick }));

await sim.registry.get('physics').prepareBackend(state);

const tactical = sim.registry.get('tacticalAI');
const inspect = sim.helpers && typeof sim.helpers.inspectAI === 'function' ? sim.helpers.inspectAI : null;
const actionPort = tactical && tactical.ports && tactical.ports.actions ? tactical.ports.actions : null;

// Trace rejections/starts from the combat kernel trace ring.
function drainTrace() {
  const events = state.combat && state.combat.trace && Array.isArray(state.combat.trace.events)
    ? state.combat.trace.events : [];
  for (const e of events) {
    if (!e || e._seen) continue;
    e._seen = true;
    if (e.kind === 'action.rejected' && e.actionId === 'action_burst') {
      log.rejects.push({ actorId: e.actorId, reason: e.reason, atTick: e.tick });
    }
    if (e.kind === 'action.started') log.starts.push({ actorId: e.actorId, actionId: e.actionId, atTick: e.tick });
  }
}

function sustainedFireOn() {
  bus.emit('combat:damage', { attackerId: player.id, targetId: station.id, applied: 8, amount: 8, kind: 'energy' });
}

function responders() {
  return [...state.entities.values()].filter((e) => e && e.type === 'ship' && e.data && e.data.ai
    && (e.data.ai.engagementTrigger === 'security_response' || e.data.ai.securityTargetId != null)
    && e.alive !== false);
}

let diedAt = null;
for (let s = 0; s < SECONDS && diedAt == null; s++) {
  sustainedFireOn();
  sim.runTicks(60);
  drainTrace();
  const rows = responders().map((e) => {
    const dist = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
    const ai = e.data.ai;
    const intent = e.data.intent || {};
    let decision = null;
    let doctrine = null;
    if (inspect) {
      try {
        const env = inspect({ entityId: e.id });
        const raw = env && env.result ? env.result : env;
        doctrine = raw && raw.combatDoctrine || null;
        decision = raw && raw.lastResult && Array.isArray(raw.lastResult.decisions)
          ? raw.lastResult.decisions.find((d) => d && d.entityId === e.id) || null : null;
      } catch { /* ignore */ }
    }
    const canBurst = actionPort && typeof actionPort.canStart === 'function'
      ? actionPort.canStart(e.id, 'action_burst', { targetId: player.id, tick: state.tick }) : null;
    return {
      id: e.id,
      spawnCtx: ai.spawnContext,
      dist: Math.round(dist),
      phase: doctrine ? doctrine.phase : (decision && decision.combatDoctrine ? decision.combatDoctrine.phase : null),
      fireWindow: doctrine ? doctrine.fireWindow : null,
      doctrineTarget: doctrine ? doctrine.targetId : null,
      actionId: decision && decision.action ? decision.action.actionId : null,
      actionStatus: decision && decision.action ? decision.action.status : null,
      actionReason: decision && decision.action ? decision.action.reason : null,
      canBurst: canBurst ? `${canBurst.ok}:${canBurst.reason || ''}` : null,
      auth: (() => { const a = authorizeAIEngagement({ state, self: e, target: player, objectiveReason: 'combat_doctrine:interceptor_flyby:strike' }); return `${a.ok}:${a.reason || ''}`; })(),
      fire: intent.fire === true,
      fireBlock: intent.fireBlockReason || null,
    };
  });
  console.log(`t${state.tick} sim${Math.round(state.simTime)} heat${(state.player.heat || 0).toFixed(2)} hits${log.hits.length} starts${log.starts.length} rejects${log.rejects.length}`);
  for (const r of rows) console.log('  ', JSON.stringify(r));
  if (log.deaths.length) diedAt = state.simTime;
}

console.log('\n=== SUMMARY ===');
console.log('diedAt:', diedAt);
console.log('playerHits:', log.hits.length, log.hits.slice(0, 8));
console.log('combatFires:', log.fires.length, log.fires.slice(0, 8));
console.log('actionStarts:', log.starts.slice(0, 12));
console.log('burstRejects:', log.rejects.slice(0, 20));
