import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { applySectorAnchors } from '../src/data/sectorAnchors.js';
import { SECTORS } from '../src/data/sectors.js';
import { planZoneSpawns, zonesForSector } from '../src/data/sectorZones.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';
import { world as worldProto } from '../src/systems/world.js';
import { explorationDiscoveryPlates } from '../src/world/explorationJournal.js';

const SECTOR_ID = 'sector_kepler_scar';
const STATION_ID = 'station_kepler_scar';
const POI_ID = 'poi_kepler_hulk';

function sector() {
  return applySectorAnchors(SECTORS.find((row) => row.id === SECTOR_ID));
}

test('Scar Bazaar and the Flight Deck form one reachable authored destination', () => {
  const live = sector();
  const station = live.stations.find((row) => row.id === STATION_ID);
  const poi = live.pois.find((row) => row.id === POI_ID);
  assert.ok(station && station.pos);
  assert.ok(poi && poi.pos);
  assert.equal(poi.name, 'The Flight Deck');
  assert.equal(poi.scannerSignalKind, 'archive');
  assert.equal(poi.flavorTargetRef, 'landmark_c8_flight_deck');
  assert.equal(poi.discoveryPlate.title, 'The Flight Deck');
  assert.match(station.chartNote, /Void-Reach/);

  const separation = Math.hypot(station.pos.x - poi.pos.x, station.pos.z - poi.pos.z);
  assert.ok(separation >= 400, `station and hulk remain distinct physical carriers (${separation} WU)`);
  assert.ok(separation <= 650, `arriving at either carrier reveals the shared bazaar (${separation} WU)`);

  const state = createGameState(808);
  state.world.discovery[SECTOR_ID] = {
    charted: false,
    fieldsDepleted: {},
    pois: { [POI_ID]: { discovered: true, identified: true, investigated: true, investigatedAt: 8 } },
  };
  const plate = explorationDiscoveryPlates(state)
    .find((row) => row.sectorId === SECTOR_ID && row.poiId === POI_ID);
  assert.ok(plate);
  assert.equal(plate.title, 'The Flight Deck');
  assert.match(plate.body, /Reach stalls/);
});

test('the physical Flight Deck carrier receives its archive and flavor identity', () => {
  const spawned = [];
  const system = Object.assign({}, worldProto, {
    helpers: {
      spawnEntity(spec) {
        const entity = { id: spawned.length + 1, alive: true, ...spec };
        spawned.push(entity);
        return entity;
      },
    },
    _toGlobal: (point) => ({ ...point }),
    _stampHomeSector: () => {},
  });
  const active = { id: SECTOR_ID, pois: [] };
  system._spawnPOIs(sector(), active, { pois: {} }, () => 0.5);
  const carrier = spawned.find((entity) => entity.data?.poiId === POI_ID);
  assert.ok(carrier);
  assert.equal(carrier.data.name, 'The Flight Deck');
  assert.equal(carrier.data.scannerSignalKind, 'archive');
  assert.equal(carrier.data.flavorTargetRef, 'landmark_c8_flight_deck');
});

test('only the exact Bazaar guard squad keys hostility to live Reach standing', () => {
  const zone = zonesForSector(SECTOR_ID).find((row) => row.id === 'zone_kepler_scar');
  assert.ok(zone);
  assert.equal(zone.presence.standingHostileBelow, 0);
  assert.deepEqual(zone.presence.spawnCenter, { x: -520, z: -650 });
  const intents = planZoneSpawns(SECTOR_ID, 4, [7, 12], () => 0.5);
  assert.ok(intents.length > 0);
  assert.ok(intents.every((row) => row.zoneId === zone.id && row.standingHostileBelow === 0));

  const state = createGameState(809);
  state.playerId = 1;
  state.factions.faction_reach = { ...(state.factions.faction_reach || {}), rep: 0 };
  const spawned = [];
  const system = Object.assign({}, worldProto, {
    state,
    helpers: {
      spawnBudget: { request: (count) => count, releaseSome: () => {} },
      spawnEntity(spec) {
        const entity = { ...spec, id: spawned.length + 2, alive: true };
        spawned.push(entity);
        return entity;
      },
    },
    _toGlobal: (point) => ({ ...point }),
    _sectorOrigin: () => ({ x: 0, z: 0 }),
    _stampHomeSector: () => {},
    _assignDurableRecordId: () => {},
  });
  const station = sector().stations.find((row) => row.id === STATION_ID);
  const active = {
    enemies: [], gates: [], hazards: [], fields: [], pois: [],
    stations: [{ id: station.id, pos: { ...station.pos }, radius: 80 }],
  };
  system._spawnEnemies(sector(), active, () => 0.5);
  const guard = spawned.find((entity) => entity.data?.ai?.zoneId === zone.id);
  assert.ok(guard, 'the ordinary world route spawned the authored Bazaar squad');
  assert.equal(guard.data.ai.standingHostileBelow, 0);
  assert.ok(Math.hypot(guard.pos.x - station.pos.x, guard.pos.z - station.pos.z) >= 1180,
    'the authored outer patrol survives the real station safety boundary');

  assert.equal(isHostileToPlayer(guard, 0, state), false, 'neutral standing permits Bazaar approach');
  state.factions.faction_reach.rep = -1;
  assert.equal(isHostileToPlayer(guard, 0, state), true, 'negative standing makes the same guard hostile');
  state.factions.faction_reach.rep = 0;
  guard.data.ai.retaliationTargetId = state.playerId;
  assert.equal(isHostileToPlayer(guard, 0, state), true, 'provocation overrides neutral standing');
});
