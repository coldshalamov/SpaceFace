import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import {
  POI_BEHAVIOR_FAMILIES,
  POI_FAMILY_IDS,
  validatePoiBehaviorFamily,
} from '../src/data/poiBehaviorFamilies.js';
import {
  livingPoiBehaviors,
  planPoiBehaviors,
  poiBehaviorFingerprint,
} from '../src/systems/livingPoiBehaviors.js';
import { SECTORS } from '../src/data/sectors.js';

const SYNTHETIC_ZONES = Object.freeze([
  { id: 'yard-a', name: 'Licensed Yard', type: 'civilian_core', factionId: 'faction_scn', center: { x: 0, z: 0 }, radius: 400, threat: 0 },
  { id: 'yard-b', name: 'Patrol Annex', type: 'patrol_corridor', factionId: 'faction_scn', center: { x: 800, z: 0 }, radius: 300, threat: 1 },
  { id: 'mine-a', name: 'Working Seam', type: 'mining_belt', factionId: 'faction_dmc', center: { x: 0, z: 800 }, radius: 500, threat: 1 },
  { id: 'mine-b', name: 'Deep Seam', type: 'mining_belt', factionId: 'faction_dmc', center: { x: 800, z: 800 }, radius: 500, threat: 1 },
  { id: 'wreck-a', name: 'Cold Hulk', type: 'derelict_field', factionId: 'faction_free', center: { x: -800, z: 0 }, radius: 350, threat: 2 },
  { id: 'wreck-b', name: 'Broken Yard', type: 'derelict_field', factionId: 'faction_free', center: { x: -800, z: 800 }, radius: 350, threat: 2 },
  { id: 'anom-a', name: 'Research Signal', type: 'anomaly_deep', factionId: 'faction_vael', center: { x: 0, z: -800 }, radius: 550, threat: 3 },
  { id: 'anom-b', name: 'Blind Fog', type: 'nebula_fog', factionId: 'faction_free', center: { x: 800, z: -800 }, radius: 550, threat: 1 },
  { id: 'route-a', name: 'Freight Spine', type: 'trade_lane', factionId: 'faction_mts', center: { x: 1600, z: 0 }, radius: 600, threat: 0 },
  { id: 'route-b', name: 'Forge Approach', type: 'refinery_approach', factionId: 'faction_dmc', center: { x: 1600, z: 800 }, radius: 600, threat: 1 },
  { id: 'nest-a', name: 'Raider Claim', type: 'outlaw_zone', factionId: 'faction_reach', center: { x: -1600, z: 0 }, radius: 600, threat: 2 },
  { id: 'nest-b', name: 'Ambush Lane', type: 'ambush_lane', factionId: 'faction_reach', center: { x: -1600, z: 800 }, radius: 600, threat: 3 },
]);

const SYNTHETIC_SECTOR = Object.freeze({
  id: 'sector_test',
  security: 0.35,
  stations: Object.freeze([
    Object.freeze({ id: 'station_test', factionId: 'faction_free', type: 'trade_hub' }),
  ]),
});

function plan(seed, sector = SYNTHETIC_SECTOR) {
  return planPoiBehaviors({ seed, sectorId: sector.id, dayIndex: 4, zones: SYNTHETIC_ZONES, sector });
}

function makeState(seed = 19) {
  return {
    meta: { seed },
    simTime: 0,
    mode: 'flight',
    playerId: 1,
    player: { cargo: { items: {} } },
    entities: new Map([[1, { id: 1, type: 'ship', pos: { x: 0, z: 0 }, alive: true }]]),
    world: {
      currentSectorId: SYNTHETIC_SECTOR.id,
      sectors: { [SYNTHETIC_SECTOR.id]: SYNTHETIC_SECTOR },
      activeSector: { stations: [], fields: [], pois: [], gates: [] },
    },
  };
}

function makeSystem(seed = 19) {
  const state = makeState(seed);
  const bus = createBus();
  const spoken = [];
  const emitted = [];
  const rawEmit = bus.emit;
  bus.emit = (event, payload) => { emitted.push({ event, payload }); rawEmit(event, payload); };
  const system = Object.create(livingPoiBehaviors);
  system.init({ state, bus, helpers: { voice: { say: (cue) => { spoken.push(cue); return true; } } } });
  system.newGame();
  system.planSector(SYNTHETIC_SECTOR.id, { zones: SYNTHETIC_ZONES, sector: SYNTHETIC_SECTOR, dayIndex: 4 });
  return { system, state, bus, spoken, emitted };
}

test('catalog exposes exactly six distinct, solvable behavior grammars', () => {
  assert.deepEqual(POI_FAMILY_IDS, [
    'lawful_station_yard',
    'mining_field',
    'derelict_salvage',
    'anomaly_research',
    'convoy_industrial_route',
    'pirate_contested_nest',
  ]);
  const verbs = new Set();
  const aftermath = new Set();
  for (const id of POI_FAMILY_IDS) {
    const family = POI_BEHAVIOR_FAMILIES[id];
    assert.equal(validatePoiBehaviorFamily(family), true, id);
    assert.ok(family.entryLine.trim().split(/\s+/).length <= 12, `${id} entry line exceeds one-voice copy limit`);
    assert.equal(verbs.has(family.contract.verb), false, `${id} duplicates interaction grammar`);
    assert.equal(aftermath.has(family.aftermath.kind), false, `${id} duplicates aftermath grammar`);
    verbs.add(family.contract.verb);
    aftermath.add(family.aftermath.kind);
  }
  assert.deepEqual([...verbs].sort(), ['clear', 'dock', 'escort', 'mine', 'salvage', 'triangulate'],
    'the six families expose six physical player verbs');
});

function makeRouteSystem(seed = 137) {
  const state = makeState(seed);
  state.world.sectors = Object.fromEntries(SECTORS.map((sector) => [sector.id, sector]));
  state.world.currentSectorId = 'sector_ceres_belt';
  const bus = createBus();
  const emitted = [];
  const rawEmit = bus.emit;
  bus.emit = (event, payload) => { emitted.push({ event, payload }); return rawEmit(event, payload); };
  const system = Object.create(livingPoiBehaviors);
  system.init({ state, bus, helpers: { voice: { say: () => true } } });
  system.newGame();
  return { state, bus, emitted, system };
}

function planSnapshot(state) {
  return Object.values(state.livingPoiBehaviors.activeByZone).map((row) => ({
    behaviorId: row.behaviorId,
    familyId: row.familyId,
    zoneId: row.zoneId,
    fingerprint: row.fingerprint,
    status: row.status,
    progress: row.progress,
  }));
}

test('continuous destination identity activates a nonempty deterministic physical plan', () => {
  const first = makeRouteSystem(137);
  const second = makeRouteSystem(137);
  const sector = first.state.world.sectors.sector_ceres_belt;
  for (const harness of [first, second]) {
    harness.state.world.currentSectorId = sector.id;
    harness.bus.emit('sector:enter', {
      sectorId: sector.id,
      sector,
      continuous: true,
      noTeleport: true,
    });
    assert.equal(harness.state.livingPoiBehaviors.activeSectorId, sector.id);
    assert.ok(Object.keys(harness.state.livingPoiBehaviors.activeByZone).length > 0,
      'continuous destination must activate its authored living-place plan');
    assert.equal(harness.emitted.some((row) => row.event === 'spawn:request' || row.event === 'combat:fire'), false);
  }
  assert.deepEqual(planSnapshot(first.state), planSnapshot(second.state),
    'same seed/sector/day produces stable IDs and fingerprints through continuous handoff');
});

test('duplicate same-sector same-day handoff keeps the live plan and emits nothing twice', () => {
  const { state, bus, emitted } = makeRouteSystem(211);
  const sector = state.world.sectors.sector_ceres_belt;
  const payload = { sectorId: sector.id, sector, continuous: true, noTeleport: true };
  bus.emit('sector:enter', payload);
  const own = state.livingPoiBehaviors;
  const planIdentity = own.activeByZone;
  const row = Object.values(own.activeByZone)[0];
  bus.emit('world:zoneEntered', { zoneId: row.zoneId });
  row.progress = 1;
  const before = planSnapshot(state);
  const beforePlannedEvents = emitted.filter((entry) => entry.event === 'poi:behaviorPlanned').length;
  const beforeEntered = structuredClone(own.entered);

  bus.emit('sector:enter', payload);
  assert.equal(own.activeByZone, planIdentity, 'duplicate handoff preserves the same live plan object');
  assert.deepEqual(planSnapshot(state), before, 'duplicate handoff does not reset progress/status/fingerprint');
  assert.deepEqual(own.entered, beforeEntered);
  assert.equal(emitted.filter((entry) => entry.event === 'poi:behaviorPlanned').length, beforePlannedEvents,
    'duplicate handoff does not re-emit plan receipts');
});

test('away/return and Continue rebuild preserve same-day aftermath, receipts, entered, IDs, and fingerprints', () => {
  const original = makeRouteSystem(307);
  const { state, bus, system, emitted } = original;
  const ceres = state.world.sectors.sector_ceres_belt;
  const io = state.world.sectors.sector_io_reach;
  bus.emit('sector:enter', { sectorId: ceres.id, sector: ceres, continuous: true, noTeleport: true });
  const row = Object.values(state.livingPoiBehaviors.activeByZone)[0];
  bus.emit('world:zoneEntered', { zoneId: row.zoneId });
  const family = POI_BEHAVIOR_FAMILIES[row.familyId];
  for (let index = 0; index < family.contract.required; index++) {
    system._interact(row.zoneId, family.contract.verb, {
      commodityId: 'cmdty_ore_iron',
      pos: { x: index * 220, z: index * 40 },
    });
  }
  const stable = {
    behaviorId: row.behaviorId,
    fingerprint: row.fingerprint,
    aftermath: structuredClone(state.livingPoiBehaviors.aftermath[row.behaviorId]),
    receipts: structuredClone(state.livingPoiBehaviors.receipts),
    entered: structuredClone(state.livingPoiBehaviors.entered),
  };

  bus.emit('sector:exit', { sectorId: ceres.id, continuous: true, noTeleport: true });
  assert.equal(state.livingPoiBehaviors.currentZoneId, null, 'departing clears only current zone identity');
  assert.deepEqual(state.livingPoiBehaviors.aftermath[row.behaviorId], stable.aftermath);
  assert.deepEqual(state.livingPoiBehaviors.receipts, stable.receipts);
  assert.deepEqual(state.livingPoiBehaviors.entered, stable.entered);

  state.world.currentSectorId = io.id;
  bus.emit('sector:enter', { sectorId: io.id, sector: io, continuous: true, noTeleport: true });
  assert.ok(Object.keys(state.livingPoiBehaviors.activeByZone).length > 0);
  state.world.currentSectorId = ceres.id;
  bus.emit('sector:enter', { sectorId: ceres.id, sector: ceres, continuous: true, noTeleport: true });
  const returned = Object.values(state.livingPoiBehaviors.activeByZone)
    .find((candidate) => candidate.behaviorId === stable.behaviorId);
  assert.ok(returned, 'same-day return restores the stable physical behavior identity');
  assert.equal(returned.fingerprint, stable.fingerprint);
  assert.equal(returned.status, 'aftermath');
  assert.deepEqual(state.livingPoiBehaviors.receipts, stable.receipts);
  assert.deepEqual(state.livingPoiBehaviors.entered, stable.entered);

  const saved = system.serialize();
  const continued = makeRouteSystem(307);
  continued.state.world.currentSectorId = ceres.id;
  continued.system.deserialize(saved);
  assert.deepEqual(continued.state.livingPoiBehaviors.activeByZone, {}, 'Continue restores consequences, not a stale live plan');
  continued.bus.emit('sector:enter', {
    sectorId: ceres.id, sector: ceres, continuous: true, noTeleport: true,
  });
  const rebuilt = Object.values(continued.state.livingPoiBehaviors.activeByZone)
    .find((candidate) => candidate.behaviorId === stable.behaviorId);
  assert.ok(rebuilt, 'empty post-Continue live plan is rebuilt on destination activation');
  assert.equal(rebuilt.fingerprint, stable.fingerprint);
  assert.equal(rebuilt.status, 'aftermath');
  assert.deepEqual(continued.state.livingPoiBehaviors.receipts, stable.receipts);
  assert.deepEqual(continued.state.livingPoiBehaviors.entered, stable.entered);
  assert.equal(emitted.some((entry) => entry.event === 'spawn:request' || entry.event === 'combat:fire'), false);
});

test('20 seeds per family are deterministic, varied, bounded, and overlap-free', () => {
  const seenByFamily = new Map(POI_FAMILY_IDS.map((id) => [id, new Set()]));
  for (let seed = 1; seed <= 20; seed++) {
    const a = plan(seed);
    const b = plan(seed);
    assert.deepEqual(a, b, `seed ${seed} changed fingerprint`);
    assert.equal(a.length, 6);
    assert.ok(a.reduce((sum, row) => sum + row.budgetCost, 0) <= 12, `seed ${seed} overflowed POI budget`);
    assert.equal(new Set(a.map((row) => row.familyId)).size, a.length, `seed ${seed} duplicated family`);
    assert.equal(new Set(a.map((row) => row.zoneId)).size, a.length, `seed ${seed} overlapped zone ownership`);
    for (const row of a) {
      assert.equal(row.fingerprint, poiBehaviorFingerprint(row));
      assert.equal(row.behaviorId, `poib:${row.sectorId}:${row.familyId}:${row.zoneId}`,
        'behavior identity is stable across days and names its physical zone');
      seenByFamily.get(row.familyId).add(row.zoneId);
    }
  }
  for (const [familyId, zones] of seenByFamily) {
    assert.ok(zones.size >= 2, `${familyId} never varies across 20 seeds`);
  }
});

test('high-security jurisdiction suppresses contested escalation and never authorizes ambient aggression', () => {
  const highSec = { ...SYNTHETIC_SECTOR, id: 'sector_highsec', security: 0.98 };
  const rows = planPoiBehaviors({ seed: 5, sectorId: highSec.id, dayIndex: 1, zones: SYNTHETIC_ZONES, sector: highSec });
  const nest = rows.find((row) => row.familyId === 'pirate_contested_nest');
  assert.ok(nest);
  assert.equal(nest.dangerMode, 'jurisdiction_suppressed');
  assert.equal(nest.canAutoAggro, false);
  assert.equal(rows.some((row) => row.spawnIntent || row.fireIntent || row.hostileOnEntry), false);
});

test('entry is one-voice, repeated entry is quiet, and map/radar receipts name the affordance', () => {
  const { bus, spoken, emitted } = makeSystem();
  bus.emit('world:zoneEntered', { zoneId: 'yard-a', name: 'Licensed Yard', type: 'civilian_core', threat: 0 });
  bus.emit('world:zoneEntered', { zoneId: 'yard-a', name: 'Licensed Yard', type: 'civilian_core', threat: 0 });
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].channel, 'news');
  assert.ok(spoken[0].text.split(/\s+/).length <= 12);
  const read = emitted.find((row) => row.event === 'poi:behaviorReadout');
  assert.ok(read);
  assert.equal(read.payload.mapLabel, 'YARD CONTROL');
  assert.equal(read.payload.radarKind, 'lawful-yard');
  assert.equal(read.payload.affordance, 'dock');
});

test('each family resolves only through its own physical verb and records distinct persistent aftermath', () => {
  const { system, bus, state, emitted } = makeSystem(73);
  const mining = Object.values(state.livingPoiBehaviors.activeByZone)
    .find((row) => row.familyId === 'mining_field');
  bus.emit('world:zoneEntered', { zoneId: mining.zoneId, type: 'mining_belt', threat: 1 });
  bus.emit('cargo:changed', { cargo: { items: { cmdty_ore_iron: 3 } }, usedU: 3, massT: 2.4 });
  const rows = Object.values(state.livingPoiBehaviors.activeByZone);
  for (const row of rows) {
    const family = POI_BEHAVIOR_FAMILIES[row.familyId];
    for (let i = 0; i < family.contract.required; i++) {
      bus.emit('poi:interact', {
        zoneId: row.zoneId,
        verb: family.contract.verb,
        commodityId: 'cmdty_ore_iron',
        pos: { x: i * 220, z: i * 40 },
      });
    }
    const aftermath = state.livingPoiBehaviors.aftermath[row.behaviorId];
    assert.ok(aftermath, row.familyId);
    assert.equal(aftermath.kind, family.aftermath.kind);
    assert.equal(aftermath.outcome, family.contract.successOutcome);
    assert.equal(aftermath.expiresDay, 4 + family.aftermath.persistsDays,
      `${row.familyId} keeps its exact authored aftermath duration`);
    assert.equal(system._interact(row.zoneId, family.contract.verb, {
      commodityId: 'cmdty_ore_iron', pos: { x: 0, z: 0 },
    }), false, `${row.familyId} cannot resolve twice while aftermath is active`);
  }
  assert.equal(Object.keys(state.livingPoiBehaviors.aftermath).length, 6);
  assert.equal(emitted.filter((row) => row.event === 'poi:behaviorOutcome').length, 6);
  assert.ok(emitted.some((row) => row.event === 'economy:applyTradePressure'));
  assert.ok(emitted.some((row) => row.event === 'faction:repDelta'));
  assert.equal(emitted.some((row) => row.event === 'mission:offered'), false,
    'synthetic sectors with no connected graph destination cannot emit malformed board rows');
  assert.ok(emitted.some((row) => row.event === 'poi:cargoObserved'));
  assert.equal(state.livingPoiBehaviors.receipts.length, 6);

  const saved = system.serialize();
  const loaded = makeSystem(73);
  loaded.system.deserialize(saved);
  assert.deepEqual(loaded.system.serialize(), saved);
});

test('active aftermath pins each family to its physical zone, then expiry reopens daily selection', () => {
  const { system, state } = makeSystem(73);
  const dayFourRows = Object.values(state.livingPoiBehaviors.activeByZone);
  const zonesByFamily = Object.fromEntries(dayFourRows.map((row) => [row.familyId, row.zoneId]));
  for (const row of dayFourRows) {
    const family = POI_BEHAVIOR_FAMILIES[row.familyId];
    for (let index = 0; index < family.contract.required; index++) {
      system._interact(row.zoneId, family.contract.verb, {
        commodityId: 'cmdty_ore_iron',
        pos: { x: index * 220, z: index * 40 },
      });
    }
  }

  const dayFive = system.planSector(SYNTHETIC_SECTOR.id, {
    zones: SYNTHETIC_ZONES, sector: SYNTHETIC_SECTOR, dayIndex: 5,
  });
  for (const row of dayFive.filter((candidate) => candidate.familyId !== 'convoy_industrial_route')) {
    assert.equal(row.zoneId, zonesByFamily[row.familyId], `${row.familyId} moved before expiresDay`);
    assert.equal(row.status, 'aftermath');
  }
  const convoy = dayFive.find((row) => row.familyId === 'convoy_industrial_route');
  assert.equal(convoy.status, 'available', 'one-day freight wake expires before day-five replanning');
  assert.equal(state.livingPoiBehaviors.aftermath[`poib:${SYNTHETIC_SECTOR.id}:convoy_industrial_route:${zonesByFamily.convoy_industrial_route}`], undefined);
  const deterministicDayFive = planPoiBehaviors({
    seed: state.meta.seed,
    sectorId: SYNTHETIC_SECTOR.id,
    dayIndex: 5,
    zones: SYNTHETIC_ZONES,
    sector: SYNTHETIC_SECTOR,
  }).find((row) => row.familyId === 'convoy_industrial_route');
  assert.equal(convoy.zoneId, deterministicDayFive.zoneId, 'expired family re-enters deterministic daily selection');
});

test('schema-1 day-indexed aftermath migrates to stable identity and keeps newest collision', () => {
  const { system } = makeSystem(41);
  const olderId = 'poib:sector_test:4:mining_field';
  const newerId = 'poib:sector_test:5:mining_field';
  const base = {
    familyId: 'mining_field', sectorId: 'sector_test', zoneId: 'mine-a',
    kind: 'worked_seam', outcome: 'worked', expiresDay: 9, cause: 'test', fingerprint: 'pb_test',
  };
  system.deserialize({
    schemaVersion: 1,
    aftermath: {
      [olderId]: { ...base, behaviorId: olderId, resolvedDay: 4, resolvedAt: 2400 },
      [newerId]: { ...base, behaviorId: newerId, resolvedDay: 5, resolvedAt: 3000, outcome: 'newest_truth' },
    },
    receipts: [
      { behaviorId: olderId, familyId: base.familyId, sectorId: base.sectorId, zoneId: base.zoneId, t: 2400 },
      { behaviorId: newerId, familyId: base.familyId, sectorId: base.sectorId, zoneId: base.zoneId, t: 3000 },
    ],
    entered: { [olderId]: true, [newerId]: true },
  });
  const saved = system.serialize();
  const stableId = 'poib:sector_test:mining_field:mine-a';
  assert.equal(saved.schemaVersion, 2);
  assert.deepEqual(Object.keys(saved.aftermath), [stableId]);
  assert.equal(saved.aftermath[stableId].behaviorId, stableId);
  assert.equal(saved.aftermath[stableId].outcome, 'newest_truth');
  assert.deepEqual(saved.receipts.map((receipt) => receipt.behaviorId), [stableId, stableId]);
  assert.deepEqual(saved.entered, { [stableId]: true });

  const loaded = makeSystem(41);
  loaded.system.deserialize(saved);
  assert.deepEqual(loaded.system.serialize(), saved, 'schema-2 save/load preserves stable identity exactly');
});

test('wrong verbs and passive time cannot turn a POI into random combat', () => {
  const { system, bus, state, emitted } = makeSystem(91);
  const nest = Object.values(state.livingPoiBehaviors.activeByZone)
    .find((row) => row.familyId === 'pirate_contested_nest');
  const lawful = Object.values(state.livingPoiBehaviors.activeByZone)
    .find((row) => row.familyId === 'lawful_station_yard');
  const anomaly = Object.values(state.livingPoiBehaviors.activeByZone)
    .find((row) => row.familyId === 'anomaly_research');
  bus.emit('world:zoneEntered', { zoneId: nest.zoneId, type: 'outlaw_zone', threat: 2 });
  state.simTime += 120;
  system.update(120, state);
  bus.emit('poi:interact', { zoneId: nest.zoneId, verb: 'dock' });
  state.entities.set(2, {
    id: 2, type: 'ship', team: 2, factionId: 'faction_free', alive: true,
    pos: { ...nest.zoneCenter }, data: { ai: { passive: true, zoneId: nest.zoneId } },
  });
  bus.emit('entity:killed', { id: 2, killerId: state.playerId, factionId: 'faction_free', pos: { ...nest.zoneCenter } });
  bus.emit('contraband:scanned', { found: true, stationId: 'station_elsewhere' });
  for (let i = 0; i < 3; i++) bus.emit('poi:interact', { zoneId: anomaly.zoneId, verb: 'triangulate' });
  assert.equal(state.livingPoiBehaviors.aftermath[nest.behaviorId], undefined);
  assert.equal(state.livingPoiBehaviors.aftermath[lawful.behaviorId], undefined);
  assert.equal(state.livingPoiBehaviors.aftermath[anomaly.behaviorId], undefined);
  assert.equal(emitted.some((row) => row.event === 'spawn:request' || row.event === 'combat:fire'), false);
  assert.equal(nest.canAutoAggro, false);
});
