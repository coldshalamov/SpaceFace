// Security reserves launch into a clear frame, never stacked into one firing lane (ledger row D197).
//
// pullIntoFrame (src/law/authorityResponse.js) projects every reserve's station launch onto a 63 WU ring about the
// offender so the answering patrol is on camera. Three reserves 5-19 WU apart overlap (hull radius 18): two sat on top
// of each other and fired into allied hulls, so a sustained assault on Coalition HQ never produced a kill in 240 s of
// sim time (the lethal response in test/law-assault-player-death.test.mjs). _respondersFor now finds a clear slot in the
// frame, defers (retryable, reservations released) while the frame is occupied, and after a bounded number of retries
// launches at the authored slot anyway: a late stacked response beats none.
//
// The fixture is the production system stack at 60 Hz: the trigger is the combat:damage a real landed round emits.

import test from 'node:test';
import assert from 'node:assert/strict';

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
    // Production stations spawn hull 1e6 (src/systems/world.js station bootstrap): the
    // jurisdictional anchor cannot die to a patrol's stray shot mid-incident. A paper hull
    // here let one friendly round kill the station, which froze lastDamageAt, collapsed the
    // protection lookup, and let the incident resolve 'disengaged' while the assault ran.
    mass: 1e6,
    hull: 1e6,
    hullMax: 1e6,
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
  bus.on('law:dispatchStarted', (p) => log.dispatches.push({
    incidentId: p && p.id,
    responders: p && p.responderIds,
    arrivals: (p?.responderIds || []).map((id) => {
      const responder = state.entities.get(id);
      return { id, pos: { ...responder.pos }, radius: responder.radius };
    }),
  }));
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


test('reserves arrive on separate hulls: no two overlap at the first dispatch', async () => {
  const { sim, state, bus, station, player, log } = boot();
  await sim.registry.get('physics').prepareBackend(state);
  sustainedFireOn(bus, player.id, station.id);
  sim.runTicks(120);
  assert.equal(log.dispatches.length, 1, 'the response launches');
  const arrivals = log.dispatches[0].arrivals;
  assert.equal(arrivals.length, 3);
  for (let a = 0; a < arrivals.length; a++) {
    for (let b = a + 1; b < arrivals.length; b++) {
      const gap = Math.hypot(arrivals[a].pos.x - arrivals[b].pos.x, arrivals[a].pos.z - arrivals[b].pos.z);
      assert.ok(gap >= arrivals[a].radius + arrivals[b].radius,
        `responders ${a} and ${b} start ${gap.toFixed(1)} WU apart, inside their hulls`);
    }
  }
});

test('a crowded arrival frame defers, releases its reservations, and retries once the frame clears', async () => {
  const { sim, state, bus, station, player, log } = boot();
  await sim.registry.get('physics').prepareBackend(state);
  const blocker = sim.spawn({ type: 'ship', team: 2, pos: { x: player.pos.x + 500, z: player.pos.z }, radius: 700, hull: 100, hullMax: 100, mass: 1e6, data: { ai: { passive: true, lawful: false } } });
  sustainedFireOn(bus, player.id, station.id);
  sim.runTicks(120); // the first dispatch attempt is ~1.3 s after the first round; retries follow every 0.5 s
  const incident = Object.values(state.lawSecurity.incidents)[0];
  assert.ok(incident);
  assert.equal(incident.spawnBudgetDeferred, 'arrival_crowded');
  assert.equal(log.dispatches.length, 0);
  assert.equal(state.spawnBudget.used, 0, 'unlaunched reservations must be released');
  blocker.alive = false;
  sim.runTicks(30);
  assert.equal(log.dispatches.length, 1, 'the incident must retry instead of abandoning the response');
  assert.equal(log.dispatches[0].responders.length, 3);
  assert.equal(state.spawnBudget.used, 3, 'only actual launched responders retain slots');
});

test('a frame that never clears still gets its response after the bounded retries', async () => {
  const { sim, state, bus, station, player, log } = boot();
  await sim.registry.get('physics').prepareBackend(state);
  sim.spawn({ type: 'ship', team: 2, pos: { x: player.pos.x + 500, z: player.pos.z }, radius: 700, hull: 100, hullMax: 100, mass: 1e6, data: { ai: { passive: true, lawful: false } } });
  sustainedFireOn(bus, player.id, station.id);
  sim.runTicks(60);
  assert.equal(log.dispatches.length, 0, 'still deferring early in the retry window');
  sim.runTicks(60 * 6);
  const incident = Object.values(state.lawSecurity.incidents)[0];
  assert.ok(incident.arrivalCrowdedTries >= 8, `the retries were spent (${incident.arrivalCrowdedTries})`);
  assert.equal(log.dispatches.length, 1, 'crime is never left unanswered by a permanently parked crowd');
  assert.equal(log.dispatches[0].responders.length, 3);
  assert.equal(state.spawnBudget.used, 3);
});

test('a field rock on the authored arrival slot moves the launch instead of starting a patrol inside it', async () => {
  // Baseline: where do the three reserves arrive with open space?
  const open = boot();
  await open.sim.registry.get('physics').prepareBackend(open.state);
  sustainedFireOn(open.bus, open.player.id, open.station.id);
  open.sim.runTicks(120);
  assert.equal(open.log.dispatches.length, 1);
  const authored = open.log.dispatches[0].arrivals.map((row) => ({ ...row.pos }));

  // Same world, but a 40 WU rock sits exactly on the first reserve's authored slot.
  const rocky = boot();
  await rocky.sim.registry.get('physics').prepareBackend(rocky.state);
  rocky.sim.spawn({ type: 'asteroid', team: 0, pos: { x: authored[0].x, z: authored[0].z }, radius: 40, hull: 1e6, hullMax: 1e6, mass: 1e6, data: {} });
  sustainedFireOn(rocky.bus, rocky.player.id, rocky.station.id);
  rocky.sim.runTicks(120);
  assert.equal(rocky.log.dispatches.length, 1, 'the response still launches');
  const arrivals = rocky.log.dispatches[0].arrivals;
  for (const arrival of arrivals) {
    assert.ok(Math.hypot(arrival.pos.x - authored[0].x, arrival.pos.z - authored[0].z) >= 40 + arrival.radius,
      `responder ${arrival.id} starts at ${JSON.stringify(arrival.pos)}, inside the rock at ${JSON.stringify(authored[0])}`);
  }
});

test('a tow payload on the authored arrival slot moves the launch too', async () => {
  const open = boot();
  await open.sim.registry.get('physics').prepareBackend(open.state);
  sustainedFireOn(open.bus, open.player.id, open.station.id);
  open.sim.runTicks(120);
  const authored = open.log.dispatches[0].arrivals.map((row) => ({ ...row.pos }));

  const loaded = boot();
  await loaded.sim.registry.get('physics').prepareBackend(loaded.state);
  loaded.sim.spawn({ type: 'payload', team: 0, pos: { x: authored[0].x, z: authored[0].z }, radius: 30, hull: 1e6, hullMax: 1e6, mass: 1e6, data: {} });
  sustainedFireOn(loaded.bus, loaded.player.id, loaded.station.id);
  loaded.sim.runTicks(120);
  assert.equal(loaded.log.dispatches.length, 1, 'the response still launches');
  for (const arrival of loaded.log.dispatches[0].arrivals) {
    assert.ok(Math.hypot(arrival.pos.x - authored[0].x, arrival.pos.z - authored[0].z) >= 30 + arrival.radius,
      `responder ${arrival.id} starts inside the payload`);
  }
});
