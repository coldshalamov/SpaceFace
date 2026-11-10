import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { applySectorAnchors } from '../src/data/sectorAnchors.js';
import { SECTORS } from '../src/data/sectors.js';
import { planZoneSpawns, zonesForSector } from '../src/data/sectorZones.js';
import { dockDenyReason } from '../src/data/dockDeny.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';
import { world as worldProto } from '../src/systems/world.js';

const SECTOR_ID = 'sector_sker_haven';
const STATION_ID = 'station_sker';
const HAVEN_ZONE_ID = 'zone_sker_haven';
const GATECAMP_ZONE_ID = 'zone_sker_gatecamp';
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
  assert.ok(station?.pos, 'station_sker resolves through the anchors');
  return station.pos;
}

test('only the Skerris Deep picket keys hostility to live Reach standing', () => {
  const station = stationPos();
  const haven = zonesForSector(SECTOR_ID).find((row) => row.id === HAVEN_ZONE_ID);
  const gatecamp = zonesForSector(SECTOR_ID).find((row) => row.id === GATECAMP_ZONE_ID);
  assert.ok(haven);
  assert.equal(haven.presence.standingHostileBelow, 0);
  assert.deepEqual(haven.presence.spawnCenter, { x: -1700, z: 1500 });
  assert.equal(haven.presence.context, 'zone_hostile');
  assert.ok(gatecamp);
  assert.equal(gatecamp.presence.standingHostileBelow, undefined, 'the gate-camp stays unconditionally hostile');

  // The real contract is analytic: the farthest-in cluster draw must still clear the
  // station bubble, or the intent is silently suppressed on the ordinary route.
  const minClearance = Math.hypot(
    haven.presence.spawnCenter.x - station.x,
    haven.presence.spawnCenter.z - station.z,
  ) - CLUSTER_RADIUS;
  assert.ok(minClearance >= STATION_SAFE_RADIUS,
    `every picket draw clears the station bubble (worst case ${minClearance.toFixed(1)} WU)`);

  const intents = planZoneSpawns(SECTOR_ID, 8, [7, 11], () => 0.5);
  assert.ok(intents.some((row) => row.zoneId === HAVEN_ZONE_ID), 'a haven picket intent is planned');
  for (const intent of intents) {
    if (intent.zoneId === HAVEN_ZONE_ID) {
      assert.equal(intent.standingHostileBelow, 0);
      const d = Math.hypot(intent.pos.x - station.x, intent.pos.z - station.z);
      assert.ok(d >= STATION_SAFE_RADIUS,
        `haven picket intent survives the station safety bubble (${d.toFixed(1)} WU)`);
    } else if (intent.zoneId === GATECAMP_ZONE_ID) {
      assert.equal(intent.standingHostileBelow, null);
    }
  }
});

test('the spawned picket reads standing while the Bazaar door does the vetting', () => {
  const station = stationPos();
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
  const active = {
    enemies: [], gates: [], hazards: [], fields: [], pois: [],
    stations: [{ id: STATION_ID, pos: { ...station } }],
  };
  system._spawnEnemies(sector(), active, () => 0.5);
  const guard = spawned.find((entity) => entity.data?.ai?.zoneId === HAVEN_ZONE_ID);
  assert.ok(guard, 'the ordinary world route spawned the authored Skerris Deep picket');
  assert.equal(guard.factionId, 'faction_reach', 'the standing gate needs the spawned faction stamp');
  assert.equal(guard.data.ai.standingHostileBelow, 0);
  assert.ok(Math.hypot(guard.pos.x - station.x, guard.pos.z - station.z) >= STATION_SAFE_RADIUS,
    'the picket stands outside the station safety boundary');

  assert.equal(isHostileToPlayer(guard, 0, state), false, 'neutral standing permits the Bazaar approach');
  state.factions.faction_reach.rep = -1;
  assert.equal(isHostileToPlayer(guard, 0, state), true, 'negative standing turns the same picket hostile');
  state.factions.faction_reach.rep = 0;
  guard.data.ai.retaliationTargetId = state.playerId;
  assert.equal(isHostileToPlayer(guard, 0, state), true, 'provocation overrides neutral standing');
  delete guard.data.ai.retaliationTargetId;

  const door = { minRep: 1, factionId: 'faction_reach' };
  assert.equal(dockDenyReason(door, { rep: 0 })?.reason, 'hostile_rep',
    'the door — not the patrol — refuses unvouched pilots');
  assert.equal(dockDenyReason(door, { rep: 1 }), null, 'vouched pilots dock');
});
