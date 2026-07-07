#!/usr/bin/env node
// Release soak gate: 30 sim-minutes of live headless gameplay systems.
//
// This is intentionally not a browser/render test. It exercises the backend release promises:
// deterministic replay, shared spawnBudget cap, no long-lived director leaks, and no untelegraphed
// combat spawns. Initial world ambient is allowed only at sector entry; later combat squads must be
// backed by encounter telemetry before their ships appear.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { economy } from '../src/systems/economy.js';
import { factions } from '../src/systems/factions.js';
import { sectorSim } from '../src/systems/sectorSim.js';
import { world } from '../src/systems/world.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { stationSideEventDirector } from '../src/systems/stationSideEventDirector.js';
import { gateControlDirector } from '../src/systems/gateControlDirector.js';
import { zonesForSector } from '../src/data/sectorZones.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SOAK_SECONDS = 30 * 60;
const SECTOR_ID = 'sector_sker_haven';
const SEEDS = [47, 109];
let sections = 0;

function ok(label) {
  sections++;
  console.log(`  ok ${label}`);
}

function source(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

assertStaticContracts();
ok('static contracts: release soak is 30 minutes and spawn clients use spawnBudget');

for (const seed of SEEDS) {
  const first = runSoak(seed);
  const second = runSoak(seed);
  assert.deepEqual(second.digest, first.digest, `seed ${seed}: release soak must replay deterministically`);
  assertRunHealth(first, `seed ${seed}`);
  printRun(first);
}
ok(`${SEEDS.length} seeds replay deterministically and stay within release budgets`);

console.log(`[check-release-soak] PASS - ${sections} sections green`);

function assertStaticContracts() {
  assert.equal(SOAK_SECONDS, 1800, 'release soak must cover exactly 30 sim-minutes');
  assert.match(source('src/systems/spawnBudget.js'), /const DEFAULT_MAX = 12/,
    'shared spawn budget target must stay at the release cap of 12');
  assert.match(source('src/systems/world.js'), /budget\.request\(grant,\s*'world_ambient'\)/,
    'world ambient must reserve through spawnBudget');
  assert.match(source('src/systems/encounterDirector.js'), /budget\.request\(ships\.length,\s*live\.squadId\)/,
    'encounterDirector must reserve squads through spawnBudget');
  assert.match(source('src/systems/stationSideEventDirector.js'), /budget\.request\(1,\s*item\.eventId\)/,
    'station side events must reserve through spawnBudget');
  assert.match(source('src/systems/gateControlDirector.js'), /budget\.request\(n,\s*wingId\)/,
    'gate control wings must reserve through spawnBudget');
}

function runSoak(seed) {
  const sim = createSimulation({
    seed,
    systems: [
      spawnBudget,
      economy,
      factions,
      sectorSim,
      world,
      encounterDirector,
      stationSideEventDirector,
      gateControlDirector,
    ],
  });
  const { state, bus, registry } = sim;
  state.mode = 'flight';

  for (const system of registry.systems) {
    if (system && typeof system.newGame === 'function') system.newGame();
  }

  const player = sim.spawn({
    type: 'ship',
    team: 0,
    factionId: 'faction_free',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    hull: 220,
    hullMax: 220,
    shield: 90,
    shieldMax: 90,
    radius: 8,
    data: { defId: 'ship_kestrel', shipClass: 'fighter', weapons: [] },
  });
  state.playerId = player.id;
  state.player.team = 0;
  state.player.credits = 12000;
  state.player.cargo.items = { cmdty_refined_metals: 16, cmdty_ore_iron: 10 };

  const events = [];
  const telegraphed = new Set();
  const referee = [];
  const sideEvents = [];
  const gateEvents = [];
  const spawns = [];
  const destroyed = [];
  const samples = [];

  bus.on('encounter:telegraph', (p) => {
    telegraphed.add(p.encounterId);
    events.push({ type: 'encounter', t: round(state.simTime), id: p.encounterId, kind: p.kind, tier: p.tier, deck: p.deck });
    const live = state.encounterDirector.live[p.encounterId];
    if (live) referee.push({ at: state.simTime + 45, ids: live.ids, encounterId: p.encounterId });
  });
  bus.on('encounter:resolved', (p) => {
    events.push({ type: 'resolved', t: round(state.simTime), id: p.encounterId, outcome: p.outcome });
  });
  bus.on('station:sideEvent', (p) => {
    sideEvents.push({ t: round(state.simTime), eventId: p.eventId, kind: p.kind, ids: (p.entityIds || []).slice() });
  });
  bus.on('jump:chargeStart', (p) => {
    gateEvents.push({ type: 'charge', t: round(state.simTime), to: p.targetSectorId, via: p.via });
  });
  bus.on('jump:chargeAbort', (p) => {
    gateEvents.push({ type: 'abort', t: round(state.simTime), reason: p && p.reason || null });
  });
  bus.on('entity:spawned', (p) => {
    const e = p.entity;
    if (!e || e.id === state.playerId) return;
    spawns.push(classifySpawn(state, e, telegraphed));
  });
  bus.on('entity:destroyed', (p) => {
    destroyed.push({ t: round(state.simTime), id: p.id, type: p.type });
  });

  registry.get('world').enterSector(SECTOR_ID);
  const baselineEntities = state.entityList.length;
  const zones = zonesForSector(SECTOR_ID).filter((z) => z && z.center);
  assert(zones.length >= 3, `${SECTOR_ID}: release soak needs authored zones`);

  for (let sec = 0; sec < SOAK_SECONDS; sec++) {
    guidePlayer(state, zones, sec);
    maybeExerciseGate(bus, state, sec);
    runReferee(bus, state, referee);
    sim.runTicks(60, SIM_DT);
    samples.push(sampleState(state, sec, baselineEntities));
  }

  // Final cleanup window: lets referee/despawnAt releases land if the last meaningful event fired
  // near the 30-minute boundary. This does not extend the measured soak; it prevents false leaks.
  for (let sec = 0; sec < 90; sec++) {
    guidePlayer(state, zones, SOAK_SECONDS + sec);
    runReferee(bus, state, referee);
    sim.runTicks(60, SIM_DT);
  }
  const finalSample = sampleState(state, SOAK_SECONDS, baselineEntities);

  const digest = {
    seed,
    simTime: round(state.simTime),
    events,
    sideEvents,
    gateEvents,
    spawnSummary: summarizeSpawns(spawns),
    destroyedCount: destroyed.length,
    sampleDigest: samples.map((s) => ({
      t: s.t,
      liveShips: s.liveShips,
      budgetUsed: s.budgetUsed,
      reservations: s.reservations,
      activeEncounters: s.activeEncounters,
      pendingEncounters: s.pendingEncounters,
      sideActive: s.sideActive,
      gateActive: s.gateActive,
      entitiesOverBaseline: s.entitiesOverBaseline,
      pressure: s.pressure,
    })),
    final: finalSample,
  };

  sim.dispose();
  return { seed, digest, events, sideEvents, gateEvents, spawns, samples, finalSample, baselineEntities };
}

function guidePlayer(state, zones, sec) {
  const player = state.entities.get(state.playerId);
  if (!player) return;

  const pending = ((state.encounterDirector && state.encounterDirector.pending) || [])
    .filter((item) => item && item.zoneCenter && item.dueAt <= state.simTime + 8)
    .sort((a, b) => a.dueAt - b.dueAt)[0];

  let target = pending && pending.zoneCenter;
  if (!target && sec % 240 >= 30 && sec % 240 < 70) {
    const station = nearestStation(state);
    if (station) target = station.pos;
  }
  if (!target && sec % 300 >= 88 && sec % 300 < 118) {
    const gate = firstGate(state);
    if (gate) target = gate.pos;
  }
  if (!target) {
    const zone = zones[Math.floor(sec / 20) % zones.length];
    target = zone.center;
  }

  player.pos.x = target.x;
  player.pos.z = target.z;
  player.prevPos.copy(player.pos);
  player.vel.x = 0;
  player.vel.z = 0;
}

function maybeExerciseGate(bus, state, sec) {
  if (sec > 0 && sec % 300 === 90) {
    const gate = firstGate(state);
    if (gate && gate.data && gate.data.gateTo) {
      bus.emit('jump:chargeStart', { targetSectorId: gate.data.gateTo, via: 'gate', chargeNeeded: 12 });
    }
  }
  if (sec > 0 && sec % 300 === 112) {
    bus.emit('jump:chargeAbort', { reason: 'release_soak_probe' });
  }
}

function runReferee(bus, state, referee) {
  for (const job of referee) {
    if (job.done || state.simTime < job.at) continue;
    job.done = true;
    for (const id of job.ids.slice()) {
      const e = state.entities.get(id);
      if (!e || e.alive === false) continue;
      bus.emit('entity:killed', { id, killerId: state.playerId, pos: { x: e.pos.x, z: e.pos.z } });
      e.alive = false;
    }
  }
}

function sampleState(state, sec, baselineEntities) {
  const budget = state.spawnBudget || {};
  const reservations = budget.reservations instanceof Map
    ? [...budget.reservations.entries()].map(([key, rec]) => [key, rec.count | 0]).sort()
    : [];
  const budgetUsed = Number.isFinite(budget.used) ? budget.used : 0;
  const reservationSum = reservations.reduce((sum, [, count]) => sum + count, 0);
  const liveShips = state.entityList.filter((e) => e && e.alive !== false && (e.type === 'ship' || e.type === 'drone') && e.id !== state.playerId).length;
  const nonFinite = findNonFiniteEntity(state);
  assert.equal(nonFinite, null, `non-finite entity field at t=${sec}: ${nonFinite}`);
  assert.equal(budgetUsed, reservationSum, `spawnBudget.used drift at t=${sec}`);
  assert(budgetUsed <= budget.max, `spawnBudget exceeded at t=${sec}: ${budgetUsed}/${budget.max}`);
  assert(liveShips <= budget.max, `live non-player ship cap exceeded at t=${sec}: ${liveShips}/${budget.max}`);

  const dir = state.encounterDirector || {};
  const side = state.stationSideEvents || {};
  const gate = state.gateControl || {};
  return {
    t: sec,
    liveShips,
    budgetUsed,
    budgetMax: budget.max,
    reservations,
    activeEncounters: Object.keys(dir.live || {}).length,
    pendingEncounters: (dir.pending || []).length,
    sideActive: Object.keys(side.active || {}).length,
    gateActive: gate.scene ? 1 : 0,
    entitiesOverBaseline: state.entityList.length - baselineEntities,
    pressure: {
      combat: round(dir.pressure && dir.pressure.combat || 0),
      civilian: round(dir.pressure && dir.pressure.civilian || 0),
    },
  };
}

function assertRunHealth(run, label) {
  const telegraphs = run.events.filter((e) => e.type === 'encounter');
  const meaningful = telegraphs.filter((e) => e.tier !== 'ambient');
  const resolved = run.events.filter((e) => e.type === 'resolved');
  const maxBudget = maxOf(run.samples, 'budgetUsed');
  const maxShips = maxOf(run.samples, 'liveShips');
  const maxEntityDrift = maxOf(run.samples, 'entitiesOverBaseline');
  const final = run.finalSample;
  const badSpawns = run.spawns.filter((s) => !s.allowed);

  assert(telegraphs.length >= 4, `${label}: 30-min soak must exercise encounters (got ${telegraphs.length})`);
  assert(meaningful.length >= 2, `${label}: must exercise meaningful encounters (got ${meaningful.length})`);
  assert(resolved.length >= 2, `${label}: encounters must resolve, not leak (got ${resolved.length})`);
  assert(run.sideEvents.length >= 1, `${label}: station side-event director must fire at least once`);
  assert(run.gateEvents.some((e) => e.type === 'charge'), `${label}: gate-control charge seam must be exercised`);
  assert(maxBudget >= 6, `${label}: release soak must exercise shared budget pressure (peak ${maxBudget})`);
  assert(maxBudget <= 12, `${label}: budget peak exceeds release cap (${maxBudget})`);
  assert(maxShips <= 12, `${label}: live ship peak exceeds release cap (${maxShips})`);
  assert(maxEntityDrift <= 24, `${label}: entity count drift too high over baseline (${maxEntityDrift})`);
  assert(final.activeEncounters <= 1, `${label}: encounterDirector leaked active encounters after cleanup`);
  assert(final.sideActive === 0, `${label}: station side events leaked active budget after cleanup`);
  assert(final.gateActive === 0, `${label}: gate control leaked active scene after cleanup`);
  assert.equal(badSpawns.length, 0, `${label}: untelegraphed or unattributed spawns: ${JSON.stringify(badSpawns.slice(0, 5))}`);

  for (let i = 1; i < meaningful.length; i++) {
    assert(meaningful[i].t - meaningful[i - 1].t >= 28,
      `${label}: meaningful encounters spawned too tightly (${meaningful[i - 1].t}->${meaningful[i].t})`);
  }
}

function classifySpawn(state, entity, telegraphed) {
  const data = entity.data || {};
  const ai = data.ai || {};
  const encounterId = ai.encounterId || data.encounterId || null;
  const context = ai.spawnContext || ai.context || data.context || '';
  const sideEventId = data.sideEventId || null;
  const gateWingId = data.gateWingId || null;
  const t = round(state.simTime);
  const record = {
    t,
    id: entity.id,
    type: entity.type,
    team: entity.team,
    context,
    encounterId,
    sideEventId,
    gateWingId,
    allowed: true,
    reason: 'non-combat-or-initial',
  };

  if (entity.type !== 'ship' && entity.type !== 'drone') return record;
  if (encounterId) {
    record.allowed = telegraphed.has(encounterId);
    record.reason = record.allowed ? 'encounter-telegraphed' : 'encounter-missing-telegraph';
    return record;
  }
  if (sideEventId) {
    record.reason = 'station-side-event';
    return record;
  }
  if (gateWingId) {
    record.reason = 'gate-control-wing';
    return record;
  }
  if (context === 'ambient' || context === 'zone_hostile' || context === 'zone_patrol' || context === 'bounty_hunter') {
    record.allowed = t <= 0.1;
    record.reason = record.allowed ? 'sector-entry-ambient' : 'late-world-spawn';
    return record;
  }
  if (entity.team === 2) {
    record.reason = 'neutral-civilian';
    return record;
  }
  record.allowed = false;
  record.reason = 'unattributed-combat-spawn';
  return record;
}

function summarizeSpawns(spawns) {
  const out = {};
  for (const s of spawns) {
    out[s.reason] = (out[s.reason] || 0) + 1;
  }
  return out;
}

function nearestStation(state) {
  const player = state.entities.get(state.playerId);
  const stations = state.entityList.filter((e) => e && e.alive !== false && e.type === 'station' && !(e.data && e.data.isGate));
  if (!stations.length) return null;
  if (!player) return stations[0];
  return stations.slice().sort((a, b) => dist2(a.pos, player.pos) - dist2(b.pos, player.pos))[0];
}

function firstGate(state) {
  return state.entityList.find((e) => e && e.alive !== false && e.type === 'station' && e.data && e.data.isGate && e.data.gateTo) || null;
}

function dist2(a, b) {
  const dx = (a && a.x || 0) - (b && b.x || 0);
  const dz = (a && a.z || 0) - (b && b.z || 0);
  return dx * dx + dz * dz;
}

function maxOf(samples, key) {
  return samples.reduce((max, sample) => Math.max(max, sample[key] || 0), 0);
}

function findNonFiniteEntity(state) {
  for (const e of state.entityList) {
    if (!e) continue;
    for (const [bagName, bag] of [['pos', e.pos], ['vel', e.vel]]) {
      if (!bag) continue;
      for (const axis of ['x', 'y', 'z']) {
        if (axis in bag && !Number.isFinite(bag[axis])) return `${e.id}.${bagName}.${axis}`;
      }
    }
    for (const key of ['hull', 'shield', 'rot']) {
      if (key in e && !Number.isFinite(e[key])) return `${e.id}.${key}`;
    }
  }
  return null;
}

function printRun(run) {
  const telegraphs = run.events.filter((e) => e.type === 'encounter');
  const maxBudget = maxOf(run.samples, 'budgetUsed');
  const maxShips = maxOf(run.samples, 'liveShips');
  const maxEntityDrift = maxOf(run.samples, 'entitiesOverBaseline');
  console.log(`  seed ${run.seed}: encounters=${telegraphs.length} sideEvents=${run.sideEvents.length} gateCharges=${run.gateEvents.filter((e) => e.type === 'charge').length} peakBudget=${maxBudget}/12 peakShips=${maxShips}/12 entityDrift=${maxEntityDrift}`);
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : value;
}
