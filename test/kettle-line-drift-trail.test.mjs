// The Kettle Line drift trail (WF-10): a Ceres Belt discovery chain you FOLLOW.
// Three authored convoy pieces strung along a drift line off the Helios-gate approach;
// each scanned piece's tell names a true compass bearing to the next; investigating the
// drive stern pops the crew's clamped pay strongbox as a real ropeable pod.
//
// Run: node --test test/kettle-line-drift-trail.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { KETTLE_LINE, KETTLE_LINE_LEGS, KETTLE_LINE_POIS, kettleLineSignalCopy } from '../src/data/kettleLine.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { SECTORS } from '../src/data/sectors.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { world } from '../src/systems/world.js';
import { mining } from '../src/systems/mining.js';
import { scanner } from '../src/systems/scanner.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';

const PLACES_DIR = fileURLToPath(new URL('../assets/ships/release/parts/places/', import.meta.url));
const LATCH = ATTACHMENT_DEFS.find((def) => def.id === 'tether_standard').maxLength;

function legByPoiId(poiId) {
  return KETTLE_LINE_LEGS.find((leg) => leg.poiId === poiId) || null;
}

test('the drift trail is authored geometry: packaged props, unique ids, sector-legal positions, pulse-proof spacing', () => {
  const ceres = SECTORS.find((sector) => sector.id === KETTLE_LINE.sectorId);
  assert.ok(ceres, 'Ceres Belt exists');
  const existing = new Set((ceres.pois || []).map((poi) => poi.id));
  assert.equal(existing.size, (ceres.pois || []).length, 'no duplicate poi ids in Ceres Belt');
  for (const poi of KETTLE_LINE_POIS) {
    assert.ok(existing.has(poi.id), `${poi.id} is appended into the sector's poi list`);
    assert.equal(ceres.pois.find((row) => row.id === poi.id), poi, 'the sector row is the authored row');
    assert.ok(existsSync(`${PLACES_DIR}${poi.landmarkGlb}.glb`), `${poi.landmarkGlb}.glb ships with the game`);
    const dist = Math.hypot(poi.pos.x, poi.pos.z);
    assert.ok(dist < ceres.worldRadius, `${poi.id} sits inside the sector disc (${Math.round(dist)} WU)`);
    assert.ok(poi.requiresActiveScan && poi.manualInvestigation, `${poi.id}'s tell is an earned scan verb`);
  }
  // The tells have to be flown: one piece must not hand the next piece's row on the same pulse
  // (scanner POI signal radius is 2000 WU).
  for (let i = 0; i < KETTLE_LINE_LEGS.length - 1; i++) {
    const a = KETTLE_LINE_LEGS[i].pos;
    const b = KETTLE_LINE_LEGS[i + 1].pos;
    const spacing = Math.hypot(a.x - b.x, a.z - b.z);
    assert.ok(spacing > 2000, `legs ${i}->${i + 1} are ${Math.round(spacing)} WU apart (> 2000, no pulse shortcut)`);
  }
});

test('each tell names the true bearing and range to the next piece; the stern ends the line', () => {
  const expect = [
    { from: 'poi_kettle_hopper', to: 'poi_kettle_ribs' },
    { from: 'poi_kettle_ribs', to: 'poi_kettle_stern' },
    { from: 'poi_kettle_stern', to: null },
  ];
  for (const { from, to } of expect) {
    const copy = kettleLineSignalCopy(from);
    assert.ok(copy, `${from} carries discovery copy`);
    assert.equal(copy.classification, legByPoiId(from).name.toUpperCase());
    assert.ok(!copy.detail.includes('{') && !copy.detail.includes('}'), 'tell is fully rendered');
    if (!to) {
      assert.ok(copy.detail.includes('strongbox'), 'the terminal tell names the payoff');
      continue;
    }
    const a = legByPoiId(from).pos;
    const b = legByPoiId(to).pos;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const range = Math.round(Math.hypot(dx, dz) / 50) * 50;
    const octant = ['east', 'north-east', 'north', 'north-west', 'west', 'south-west', 'south', 'south-east'][
      (Math.round(Math.atan2(-dz, dx) / (Math.PI / 4)) + 8) % 8
    ];
    assert.ok(copy.detail.includes(octant), `"${from}" tell names the true octant (${octant})`);
    assert.ok(copy.detail.includes(String(range)), `"${from}" tell names the true rounded range (${range} WU)`);
  }
  assert.equal(kettleLineSignalCopy('poi_survey'), null, 'foreign sources stay untouched');
});

test('a real pulse resolves the hopper row into the Kettle tell', () => {
  const bus = createBus();
  const sim = createSimulation({ seed: 4242, bus, systems: [scanner] });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.currentSectorId = 'sector_test_kettle';
  state.world.activeSector = { id: 'sector_test_kettle', pois: [] };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const hopper = legByPoiId('poi_kettle_hopper');
  const entity = sim.spawn({
    type: 'fx', team: 2, pos: { x: 900, z: 0 }, radius: hopper.visualRadius, mass: 0, collides: false,
    data: {
      poi: true, poiId: hopper.poiId, poiType: hopper.type, hidden: false,
      scannerSignalKind: 'salvage', manualInvestigation: true, scannerSignalPriority: 96,
    },
  });
  state.world.activeSector.pois.push({
    id: entity.id, poiId: hopper.poiId, type: hopper.type, pos: { ...entity.pos },
    hidden: false, scannerSignalKind: 'salvage', manualInvestigation: true, scannerSignalPriority: 96,
  });
  const events = { results: [] };
  bus.on('signal:scanResults', (p) => events.results.push(p));
  state.input.actions.scanPulse = true;
  sim.runTicks(2);
  assert.ok(events.results.length, 'the pulse returns signal rows');
  const row = events.results[0].signals.find((entry) => entry.sourceId === 'poi_kettle_hopper');
  assert.ok(row, 'the hopper appears in the pulse results');
  assert.equal(row.classification, 'KETTLE LINE HOPPER');
  assert.ok(row.detail.includes('south-west') && row.detail.includes('2100'),
    `the tell reads the authored bearing ("${row.detail}")`);
  assert.equal(row.manualInvestigation, true, 'the row asks to be investigated in person');
});

test('seed 4242: the stern is sealed until investigated, then the strongbox is a ropeable, splittable pod', () => {
  const bus = createBus();
  const sim = createSimulation({ seed: 4242, bus, systems: [physics, world, mining] });
  const { state } = sim;
  state.mode = 'flight';
  sim.registry.get('world').newGame();
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  sim.registry.get('world').enterSector(KETTLE_LINE.sectorId);

  const active = state.world.activeSector;
  const sternRow = active.pois.find((poi) => poi.poiId === KETTLE_LINE.terminalPoiId);
  assert.ok(sternRow, 'the stern is materialized in the sector');
  for (const leg of KETTLE_LINE_LEGS) {
    assert.ok(active.pois.some((poi) => poi.poiId === leg.poiId), `${leg.poiId} is materialized`);
  }

  const payoffPods = () => state.entityList.filter((entity) => entity
    && entity.alive !== false && entity.data && entity.data.kettleLinePayoff === true);
  assert.equal(payoffPods().length, 0, 'the strongbox is sealed before the stern is read');

  const plates = [];
  bus.on('discovery:plateUnlocked', (p) => plates.push(p));

  // Investigate the terminal piece the way the scanner emits it: one signal:investigated receipt.
  const worldSystem = sim.registry.get('world');
  worldSystem._onSignalInvestigated({
    signalId: `signal:poi:${KETTLE_LINE.terminalPoiId}`,
    sourceId: KETTLE_LINE.terminalPoiId,
    sectorId: KETTLE_LINE.sectorId,
    completedAt: 30,
  });
  assert.ok(plates.some((p) => p.poiId === KETTLE_LINE.terminalPoiId), 'the stern files its discovery plate');

  const pods = payoffPods();
  assert.equal(pods.length, 1, 'investigating the stern pops exactly one strongbox');
  const pod = pods[0];
  assert.equal(pod.type, 'payload');
  assert.equal(pod.data.commodityId, KETTLE_LINE.payoff.commodityId);
  assert.equal(pod.data.amount, KETTLE_LINE.payoff.amount);
  assert.ok(COMMODITIES.some((row) => row.id === pod.data.commodityId), 'the payoff commodity is a real one');
  assert.equal(isAttachable(pod, state.playerId, state), true, 'the strongbox is a legal Massline target');
  const distance = Math.hypot(pod.pos.x - sternRow.pos.x, pod.pos.z - sternRow.pos.z);
  assert.ok(distance <= LATCH, `strongbox sits ${distance.toFixed(1)} WU from the stern, inside latch ${LATCH}`);

  // Idempotent: a repeated receipt (or a re-materialize pass) must not mint a second box.
  worldSystem._onSignalInvestigated({
    signalId: `signal:poi:${KETTLE_LINE.terminalPoiId}`,
    sourceId: KETTLE_LINE.terminalPoiId,
    sectorId: KETTLE_LINE.sectorId,
    completedAt: 40,
  });
  assert.equal(payoffPods().length, 1, 'no duplicate strongbox on a repeated receipt');

  sim.registry.get('mining')._splitCargoPod(player, pod);
  const pickups = state.entityList.filter((entity) => entity
    && entity.alive !== false && entity.type === 'pickup'
    && entity.data && entity.data.commodityId === KETTLE_LINE.payoff.commodityId
    && entity.data.amount >= 1);
  assert.ok(pickups.length >= 1, 'splitting the strongbox spills the pay lot');
});
