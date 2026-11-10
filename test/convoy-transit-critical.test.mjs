// A live convoy's physical run IS the encounter — arrival is endpoint geometry in convoyTick,
// and the route spans dormant space (the fired lane sits ~14km of shelved space from the
// player). The transit cast (haulers + escorts) now carries data.transitCritical from spawn, so
// the classification pin holds them S0_EXACT for the whole run. Without it a dormant member
// either freezes under native authority (partition 0) or — on the kinematic backend — kept
// integrating while dormant and then caught a ballistic catch-up drift on wake re-entry,
// double-counting the motion and throwing the hull ~14km past the exchange; the convoy could
// never arrive and economy:applyTradePressure never fired (check-living-universe-events §J).

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { CONVOY_CARGO, ENCOUNTERS } from '../src/data/encounters.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { PIN_REASON, SIM_TIER } from '../src/world/activityClassification.js';
import {
  ensureActivityClassified,
  entityNeedsPhysics,
  physicsReachWuFromState,
} from '../src/world/activityRuntime.js';
import { physics } from '../src/core/physics.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { encounterDirector, planEncounterShape } from '../src/systems/encounterDirector.js';
import { factions } from '../src/systems/factions.js';
import { flight } from '../src/systems/flight.js';
import { heat } from '../src/systems/heat.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';

const SECTOR_ID = 'sector_tethys_junction';
const STATION_ID = 'st_tethys_hub';
const LANE_POS = Object.freeze({ x: 500, z: 1500 });      // Junction Trade Lane center
const STATION_POS = Object.freeze({ x: 1050, z: 380 });   // Meridian Exchange
// Same real stack as check-living-universe-events §J — kinematic backend, headless.
const SYSTEMS = [spawnBudget, cargo, economy, factions, heat, flight, physics, encounterDirector];

function boot(seed) {
  const sim = createSimulation({ seed, systems: SYSTEMS });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  const player = sim.spawn({
    type: 'ship', team: 0,
    pos: { ...LANE_POS }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6,
  });
  state.playerId = player.id;
  state.world.activeSector = {
    stations: [{ id: STATION_ID, pos: { ...STATION_POS }, name: 'Meridian Exchange' }],
  };
  state.settings.gameplay.physicsBackend = 'custom';   // headless boots have no rapier world
  const log = { pressure: [], receipts: [], resolved: [] };
  bus.on('economy:applyTradePressure', (p) => log.pressure.push(p));
  bus.on('encounter:receipt', (p) => log.receipts.push(p));
  bus.on('encounter:resolved', (p) => log.resolved.push(p));
  bus.emit('sector:enter', { sectorId: SECTOR_ID });
  return { sim, state, bus, player, log };
}

function fireConvoy(h) {
  const { state } = h;
  const director = h.sim.registry.get('encounterDirector');
  const dir = state.encounterDirector;
  const shape = ENCOUNTERS.convoy_departure;
  const zone = zonesForSector(SECTOR_ID).find((z) => shape.zoneTypes.includes(z.type));
  assert.ok(zone, 'Tethys exposes a convoy-compatible zone');
  const item = planEncounterShape(
    shape, zone, SECTOR_ID, 0, 50,
    mulberry32(hash32(state.meta.seed, shape.id, 'force')),
  );
  item.sectorId = SECTOR_ID;
  dir.pressure[shape.deck] = 140;
  director._fire(dir, state, item, shape, state.simTime || 0);
  const live = dir.live[item.encounterId];
  assert.ok(live, 'convoy materializes');
  return { live, id: item.encounterId };
}

function members(h, live, role) {
  return live.ids
    .filter((eid) => live.roles[eid] === role)
    .map((eid) => h.state.entities.get(eid))
    .filter((e) => e && e.alive !== false);
}

test('transit cast carries data.transitCritical and pins S0_EXACT far from the player', () => {
  const h = boot(41);
  const { live } = fireConvoy(h);
  h.sim.runTicks(60);
  ensureActivityClassified(h.state);
  const haulers = members(h, live, 'hauler');
  const escorts = members(h, live, 'escort');
  assert.ok(haulers.length >= 2 && escorts.length >= 1, 'convoy = haulers + escort');
  // Counterfactual: the run starts outside even the exact rim — reach is the S0 distance
  // bound, so past it only the pin keeps a hull exact; without it the cast shelves.
  const reach = physicsReachWuFromState(h.state, h.player);
  for (const e of [...haulers, ...escorts]) {
    const dist = Math.hypot(e.pos.x - h.player.pos.x, e.pos.z - h.player.pos.z);
    assert.ok(dist > reach, `route exits the near band (${Math.round(dist)} > ${Math.round(reach)})`);
    assert.equal(e.data.transitCritical, true, 'marker lands on entity data at spawn');
    assert.ok(
      e.activity && e.activity.pinnedExact && e.activity.pins.includes(PIN_REASON.MISSION_CRITICAL),
      `${live.roles[e.id]} pins mission-critical`,
    );
    assert.equal(e.activity.simTier, SIM_TIER.S0_EXACT, 'cast stays exact beyond the physics rim');
    assert.equal(entityNeedsPhysics(e), true, 'cast keeps its physics body');
  }
  // Mid-route — deep inside what was dormant space — the cast still cannot shelf.
  h.sim.runTicks(150 * 60);
  ensureActivityClassified(h.state);
  for (const e of [...members(h, live, 'hauler'), ...members(h, live, 'escort')]) {
    const dist = Math.hypot(e.pos.x - h.player.pos.x, e.pos.z - h.player.pos.z);
    assert.ok(dist > reach, `mid-transit still outside the exact rim (${Math.round(dist)})`);
    assert.equal(
      e.activity.simTier, SIM_TIER.S0_EXACT,
      `mid-transit ${live.roles[e.id]} is pinned exact, never shelved`,
    );
  }
});

test('kinematic integrate skips shelved bodies — catch-up owns their motion', () => {
  const h = boot(61);
  // A stamped-dormant mover: under the custom backend this body's position belongs to the
  // wake-edge catch-up drift alone. Feeding it through pos += vel*dt every tick double-counts
  // exactly what applyStamp drifts on re-entry — the observed §J teleport.
  const sleeper = h.sim.spawn({
    type: 'ship', team: 2,
    pos: { x: LANE_POS.x + 5000, z: LANE_POS.z + 5000 },
    vel: { x: 30, z: -10 },
    hull: 100, hullMax: 100, radius: 8,
  });
  sleeper.activity = { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false };
  const runner = h.sim.spawn({
    type: 'ship', team: 2,
    pos: { x: LANE_POS.x + 5100, z: LANE_POS.z + 5000 },
    vel: { x: 30, z: 0 },
    hull: 100, hullMax: 100, radius: 8,
  });
  const sx = sleeper.pos.x, sz = sleeper.pos.z, rx = runner.pos.x;
  physics.integrate(1 / 60, h.state);
  assert.equal(sleeper.pos.x, sx, 'dormant body is not kinematic-integrated');
  assert.equal(sleeper.pos.z, sz);
  assert.ok(runner.pos.x > rx, 'unclassified/exact bodies still integrate (stamp-less is unaffected)');
});

test('end to end: the convoy physically arrives and presses the market once', () => {
  const h = boot(41);
  const { live, id } = fireConvoy(h);
  h.sim.runTicks(400 * 60);                     // transit + arrival (physical run ≈360s)
  const tp = h.log.pressure.filter((p) => p.stationId === STATION_ID);
  assert.equal(tp.length, 1, 'arrival applies market pressure exactly once');
  assert.ok(tp[0].vol > 0 && tp[0].vol <= 12, `arrival pressure bounded (got ${tp[0].vol})`);
  assert.ok(CONVOY_CARGO.some((c) => c.commodityId === tp[0].good), 'pressure is the convoy cargo');
  assert.ok(
    h.log.receipts.some((r) => r.encounterId === id && /CONVOY ARRIVED/.test(r.text)),
    'arrival receipt',
  );
  assert.ok(
    h.log.resolved.some((r) => r.encounterId === id && r.outcome === 'arrived'),
    'encounter resolves arrived',
  );
});
