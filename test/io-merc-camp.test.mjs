import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { applySectorAnchors } from '../src/data/sectorAnchors.js';
import { SECTORS } from '../src/data/sectors.js';
import { planZoneSpawns, zonesForSector } from '../src/data/sectorZones.js';
import { dockDenyReason } from '../src/data/dockDeny.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';
import { world as worldProto } from '../src/systems/world.js';

const SECTOR_ID = 'sector_io_reach';
const STATION_ID = 'station_io_merc';
const MERC_ZONE_ID = 'zone_io_merc';
// Mirrors the flat station safety bubble in src/systems/world.js (STATION_SAFE_RADIUS);
// live station records carry no radius, so the bubble is always this constant.
const STATION_SAFE_RADIUS = 1100;
// The planner clusters inside min(zone.radius, 260) of the presence spawnCenter.
const CLUSTER_RADIUS = 260;

function sector() {
  return applySectorAnchors(SECTORS.find((row) => row.id === SECTOR_ID));
}

function stationPos() {
  const station = sector().stations.find((row) => row.id === STATION_ID);
  assert.ok(station?.pos, 'station_io_merc resolves through the anchors');
  return station.pos;
}

test('the Mercenary Outpost is a real berth, not a map label', () => {
  const station = sector().stations.find((row) => row.id === STATION_ID);
  assert.ok(station, 'the Quiet contracting post exists on the ordinary route');
  assert.deepEqual(station.pos, { x: 1280, z: 620 });
  assert.equal(station.factionId, 'faction_quiet');
  assert.equal(station.minRep, -30, 'the door vets standing without locking out first visitors');
  assert.equal(station.missionProfile, 'bounty_board');
  assert.equal(station.boardAnchorType, 'bounty_hunt', 'the writ wall pins a bounty offer');
  for (const service of ['black_market', 'missions']) {
    assert.ok(station.services.includes(service), `the camp runs ${service}`);
  }
});

test('the Quiet picket is planned outside the berth and reads standing', () => {
  const station = stationPos();
  const zone = zonesForSector(SECTOR_ID).find((row) => row.id === MERC_ZONE_ID);
  assert.ok(zone);
  assert.equal(zone.presence?.factionId, 'faction_quiet');
  assert.equal(zone.presence.standingHostileBelow, 0);
  assert.equal(zone.presence.context, 'zone_hostile');

  // The real contract is analytic: the farthest-in cluster draw must still clear the
  // station bubble, or the intent is silently suppressed on the ordinary route.
  const minClearance = Math.hypot(
    zone.presence.spawnCenter.x - station.x,
    zone.presence.spawnCenter.z - station.z,
  ) - CLUSTER_RADIUS;
  assert.ok(minClearance >= STATION_SAFE_RADIUS,
    `every picket draw clears the station bubble (worst case ${minClearance.toFixed(1)} WU)`);

  const intents = planZoneSpawns(SECTOR_ID, 8, [5, 8], () => 0.5);
  assert.ok(intents.some((row) => row.zoneId === MERC_ZONE_ID), 'a Quiet picket intent is planned');
  for (const intent of intents) {
    if (intent.zoneId === MERC_ZONE_ID) {
      assert.equal(intent.factionId, 'faction_quiet');
      assert.equal(intent.standingHostileBelow, 0);
      const d = Math.hypot(intent.pos.x - station.x, intent.pos.z - station.z);
      assert.ok(d >= STATION_SAFE_RADIUS,
        `picket intent survives the station safety bubble (${d.toFixed(1)} WU)`);
    }
  }
});

test('the spawned lance reads standing while the writ-house door does the vetting', () => {
  const station = stationPos();
  const state = createGameState(809);
  state.playerId = 1;
  state.factions.faction_quiet = { ...(state.factions.faction_quiet || {}), rep: 0 };
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
  const active = {
    enemies: [], gates: [], hazards: [], fields: [], pois: [],
    stations: [{ id: STATION_ID, pos: { ...station } }],
  };
  system._spawnEnemies(sector(), active, () => 0.5);
  const lance = spawned.find((entity) => entity.data?.ai?.zoneId === MERC_ZONE_ID);
  assert.ok(lance, 'the ordinary world route spawned the authored outpost picket');
  assert.equal(lance.factionId, 'faction_quiet', 'the standing gate needs the spawned faction stamp');
  assert.equal(lance.data.ai.standingHostileBelow, 0);
  assert.ok(Math.hypot(lance.pos.x - station.x, lance.pos.z - station.z) >= STATION_SAFE_RADIUS,
    'the picket stands outside the station safety boundary');

  assert.equal(isHostileToPlayer(lance, 0, state), false, 'neutral standing permits the camp approach');
  state.factions.faction_quiet.rep = -1;
  assert.equal(isHostileToPlayer(lance, 0, state), true, 'negative standing turns the same picket hostile');
  state.factions.faction_quiet.rep = 0;
  lance.data.ai.retaliationTargetId = state.playerId;
  assert.equal(isHostileToPlayer(lance, 0, state), true, 'provocation overrides neutral standing');
  delete lance.data.ai.retaliationTargetId;

  const door = { minRep: -30, factionId: 'faction_quiet' };
  assert.equal(dockDenyReason(door, { rep: 0 }), null, 'neutral standing docks');
  const denied = dockDenyReason(door, { rep: -40 });
  assert.equal(denied?.reason, 'hostile_rep', 'red standing is refused at the berth');
  assert.equal(denied?.text, 'You. No.', 'the refusal speaks Quiet');
});

test('the Mercenary Outpost label survives as the camp approach marker', () => {
  const poi = sector().pois.find((row) => row.id === 'poi_merc');
  assert.ok(poi, 'the authored outpost POI still exists');
  assert.equal(poi.name, 'Mercenary Outpost');
  assert.equal(poi.factionId, 'faction_quiet');
});
