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
    assert.ok(aftermath.expiresDay >= 5);
  }
  assert.equal(Object.keys(state.livingPoiBehaviors.aftermath).length, 6);
  assert.equal(emitted.filter((row) => row.event === 'poi:behaviorOutcome').length, 6);
  assert.ok(emitted.some((row) => row.event === 'economy:applyTradePressure'));
  assert.ok(emitted.some((row) => row.event === 'faction:repDelta'));
  assert.ok(emitted.some((row) => row.event === 'mission:offered'));
  assert.ok(emitted.some((row) => row.event === 'poi:cargoObserved'));
  assert.equal(state.livingPoiBehaviors.receipts.length, 6);

  const saved = system.serialize();
  const loaded = makeSystem(73);
  loaded.system.deserialize(saved);
  assert.deepEqual(loaded.system.serialize(), saved);
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
