// Law-assault player-death route — the M3 public route's death leg, proven on the real system
// stack. The authored probationary wasp cannot kill a parked starter Kestrel (its effective damage
// sits below shield regeneration — see scripts/check-m3-player-facing-public-route.mjs), so the
// browser route instead fires on a lawful station inside its own jurisdiction, lets CONTROL
// dispatch patrol lawmen, and takes the ordinary-combat kill. That response is only lethal once
// the first-session attacker cap (engagementAuthority MAX_FIRST_SESSION_ATTACKERS=2 until
// simTime 600) lifts; this test runs the post-cap regime deterministically at 60 Hz instead of
// waiting out a browser throttle.
//
// The trigger is the same event weapons emits for a real landed round (combat:damage with the
// player as attacker and a lawful target); everything downstream — incident, dispatch, doctrine,
// fire authorization, projectile flight, shield/armor/hull routing, defeat receipt — is the
// production chain. No vitals are written, no kill is invoked directly.

import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
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
// Coalition HQ's authored sector-local anchor (src/data/sectors.js). Sitting on its patrol ring
// keeps the player inside that jurisdiction for the whole exchange.
const COALITION_LOCAL = { x: -920, z: 1080 };
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
  const { state, bus } = sim;
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
  state.player.credits = NEW_GAME.credits;

  const stationPos = sectorLocalToGlobalForSector(COALITION_LOCAL, HELIOS);
  const station = sim.spawn({
    type: 'station',
    team: 2,
    factionId: 'faction_scn',
    pos: { x: stationPos.x, z: stationPos.z },
    radius: 60,
    data: {
      stationId: 'station_coalition',
      dockRadius: 90,
      factionId: 'faction_scn',
    },
  });

  const player = sim.spawn(makeShipEntitySpec(NEW_GAME.shipId, {
    team: 0,
    factionId: 'faction_free',
    isPlayer: true,
    player: state.player,
    fittings: fittingsFromDefaultModules(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
    pos: { x: stationPos.x + 180, z: stationPos.z + 40 },
  }));
  state.playerId = player.id;

  const log = {
    incidents: [],
    dispatches: [],
    deaths: [],
    gameOvers: [],
    playerHits: [],
    fires: [],
    projectileHits: [],
    phases: [],
    fireBlocks: {},
    projSamples: [],
  };
  bus.on('law:incidentOpened', (p) => log.incidents.push({ cause: p && p.cause, stationId: p && p.stationId }));
  bus.on('law:dispatchStarted', (p) => log.dispatches.push({ incidentId: p && p.id, responders: p && p.responderIds }));
  bus.on('player:death', (p) => log.deaths.push(p));
  bus.on('game:over', (p) => log.gameOvers.push(p));
  bus.on('combat:damage', (p) => {
    if (p && p.targetId === player.id) log.playerHits.push({ applied: p.applied, attackerId: p.attackerId, atTick: state.tick });
  });
  bus.on('combat:fire', (p) => log.fires.push({ ownerId: p && p.ownerId, atTick: state.tick }));
  bus.on('projectile:hit', (p) => log.projectileHits.push({ targetId: p && p.targetId, ownerId: p && p.ownerId, atTick: state.tick }));
  bus.on('ai:doctrinePhase', (p) => {
    if (log.phases.length < 200) log.phases.push({ id: p.entityId, phase: p.phase, fireWindow: p.fireWindow, atTick: p.tick });
  });

  return { sim, state, bus, station, player, log };
}

// Sustained LMB against the station: each landed round is a combat:damage the heat owner counts,
// which is what keeps WANTED hot and refreshes the incident's lastDamageAt.
function sustainedFireOn(bus, playerId, stationId) {
  bus.emit('combat:damage', {
    attackerId: playerId,
    targetId: stationId,
    applied: 8,
    amount: 8,
    kind: 'energy',
  });
}

test('lawful assault on Coalition HQ draws a lethal security response past the first-session cap', async () => {
  const { sim, state, bus, station, player, log } = boot();

  // Rapier dynamic authority initializes behind a promise; a purely synchronous runTicks loop
  // never yields for it, which leaves projectiles frozen at their muzzle with decrementing TTL.
  // createSimulation forks its system definitions, so the live instance comes from the registry.
  const physicsReady = await sim.registry.get('physics').prepareBackend(state);
  assert.equal(physicsReady, true, 'Rapier physics authority must initialize for projectile flight');

  // First landed round on a lawful hull inside its jurisdiction.
  sustainedFireOn(bus, player.id, station.id);
  sim.runTicks(30);
  assert.equal(log.incidents.length, 1, `station hit must open a jurisdiction incident: ${JSON.stringify(log.incidents)}`);
  assert.equal(log.incidents[0].cause, 'player_assault');

  // Hold the trigger: refresh the incident every ~second while responders close and shoot.
  // Sample every tick so we see fire windows that open and close inside a one-second stride.
  const maxSeconds = 240;
  let diedAt = null;
  for (let s = 0; s < maxSeconds && diedAt == null; s++) {
    sustainedFireOn(bus, player.id, station.id);
    for (let t = 0; t < 60; t++) {
      sim.runTicks(1);
      for (const e of state.entities.values()) {
        const intent = e && e.data && e.data.intent;
        const ai = e && e.data && e.data.ai;
        if (!ai || ai.spawnContext !== 'security_response' || !intent) continue;
        if (intent.fire === true) log.fires.push({ id: e.id, atTick: state.tick, intent: true });
        if (intent.fireBlockReason) {
          const key = `${e.data.ai.combatDoctrinePhase || ai.doctrinePhase || '?'}:${intent.fireBlockReason}`;
          log.fireBlocks[key] = (log.fireBlocks[key] || 0) + 1;
        }
      }
      // Projectile census: alive count, one sample with speed/position/distance-to-player.
      let liveProj = 0;
      let projSample = null;
      for (const e of state.entities.values()) {
        if (!e || e.type !== 'projectile' || e.alive === false) continue;
        liveProj += 1;
        if (!projSample) {
          const owner = state.entities.get(e.ownerId);
          projSample = {
            id: e.id, ownerId: e.ownerId,
            pos: { x: Math.round(e.pos.x), z: Math.round(e.pos.z) },
            vel: e.vel ? { x: +e.vel.x.toFixed(1), z: +e.vel.z.toFixed(1) } : null,
            speed: e.vel ? Math.round(Math.hypot(e.vel.x, e.vel.z)) : null,
            distToPlayer: Math.round(Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z)),
            ownerPos: owner && owner.pos ? { x: Math.round(owner.pos.x), z: Math.round(owner.pos.z) } : null,
            ttl: e.ttl, age: e.data && e.data.age,
          };
        }
      }
      if (liveProj > 0 && log.projSamples.length < 60) {
        log.projSamples.push({ atTick: state.tick, live: liveProj, sample: projSample });
      }
      if (log.deaths.length) { diedAt = state.simTime; break; }
    }
  }

  const responders = [...state.entities.values()].filter((e) => e && e.type === 'ship'
    && e.data && e.data.ai && e.data.ai.spawnContext === 'security_response');
  const inspect = sim.helpers && typeof sim.helpers.inspectAI === 'function'
    ? sim.helpers.inspectAI : null;
  const debug = {
    simTime: state.simTime,
    tick: state.tick,
    incidents: log.incidents,
    dispatches: log.dispatches,
    responders: responders.map((e) => ({
      id: e.id,
      alive: e.alive !== false,
      dist: Math.round(Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z)),
      fire: e.data && e.data.intent && e.data.intent.fire === true,
      intent: e.data && e.data.intent,
      doctrine: e.data.ai.combatDoctrineId,
      ai: {
        activity: e.data.ai.activity,
        motive: e.data.ai.motive,
        engagementTrigger: e.data.ai.engagementTrigger,
        securityTargetId: e.data.ai.securityTargetId,
        squadId: e.data.ai.squadId,
        roe: e.data.ai.roe,
        zoneId: e.data.ai.zoneId,
        approachTelegraph: e.data.ai.approachTelegraph,
        noFireResponseWindowS: e.data.ai.noFireResponseWindowS,
        passive: e.data.ai.passive,
      },
      authStrike: authorizeAIEngagement({
        state, self: e, target: player,
        objectiveReason: `combat_doctrine:${e.data.ai.combatDoctrineId || 'interceptor_flyby'}:strike`,
      }),
      inspect: inspect ? (() => {
        try {
          const env = inspect({ entityId: e.id });
          const raw = env && env.result ? env.result : env;
          const decision = raw && raw.lastResult && Array.isArray(raw.lastResult.decisions)
            ? raw.lastResult.decisions.find((d) => d && d.entityId === e.id) || null : null;
          return { doctrine: raw && raw.combatDoctrine || null, decision: decision && { directive: decision.directive, action: decision.action, doctrine: decision.combatDoctrine } };
        } catch (err) { return { error: String(err && err.message || err) }; }
      })() : null,
    })),
    playerVitals: { shield: player.shield, armor: player.armorHp, hull: player.hull },
    playerHitCount: log.playerHits.length,
    wanted: isPlayerWanted(state),
    playerHeat: state.player && state.player.heat,
    fireIntentsSeen: log.fires.length,
    combatFires: log.fires.filter((f) => !f.intent).length,
    projectileHits: log.projectileHits.slice(0, 12),
    fireBlocks: log.fireBlocks,
    phaseLog: log.phases.filter((p) => p.id === 3).slice(-30),
    projSamples: log.projSamples,
  };
  try { writeFileSync('.devshots/law-assault-debug.json', JSON.stringify(debug, null, 2)); } catch {}
  assert.ok(log.dispatches.length > 0, `CONTROL must dispatch responders: ${JSON.stringify(debug)}`);
  assert.ok(diedAt != null, `dispatched response must kill the parked starter within ${maxSeconds}s: ${JSON.stringify(debug)}`);
  assert.ok(log.playerHits.length > 0, 'death must arrive through ordinary combat hits, not a script');

  // The defeat receipt the after-action screen reads (src/combat/playerDefeat.js).
  const receipt = state.combat && state.combat.lastPlayerDefeat;
  assert.ok(receipt, 'player:death must leave a canonical defeat receipt');
  assert.ok(receipt.fatalSummary || receipt.cause, 'receipt must name the fatal cause');
  assert.ok(receipt.vitalsPct && receipt.vitalsPct.hull != null, 'receipt must carry final damage');
  assert.ok(receipt.recovery && receipt.recovery.stationName, 'receipt must name a recovery dock');
  assert.ok(receipt.recovery && receipt.recovery.costCr != null, 'receipt must name a recovery cost');
  assert.ok(receipt.recovery && receipt.recovery.cargoLosses != null,
    'receipt must state the cargo consequence');
  assert.ok(receipt.recovery && receipt.recovery.insuranceStatus, 'receipt must state coverage');
});
