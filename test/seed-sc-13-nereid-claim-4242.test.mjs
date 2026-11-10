// SEED-SC-13 — Nereid's claim reads as a claim outpost, not the shared mining-station kit.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';

import { applySectorAnchors } from '../src/data/sectorAnchors.js';
import { EAST_SECTORS } from '../src/data/frontierRegions/east.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { world } from '../src/systems/world.js';

const CLAIM = 'place_claim_outpost_base';
const PIN = { x: -780, z: 920 };

function materializeStations(sector) {
  const spawned = [];
  let nextId = 1;
  const host = {
    state: {},
    helpers: {
      spawnEntity(spec) {
        const ent = {
          id: nextId++,
          type: spec.type,
          pos: { x: spec.pos.x, z: spec.pos.z },
          data: spec.data,
          alive: true,
        };
        spawned.push(ent);
        return ent;
      },
    },
    _toGlobal(local, sectorId, out) {
      return world._toGlobal(local, sectorId, out);
    },
    _sectorOrigin(sectorId) {
      return world._sectorOrigin(sectorId);
    },
    _stampHomeSector(ent, sectorId) {
      return world._stampHomeSector.call(this, ent, sectorId);
    },
  };
  world._spawnStations.call(host, sector, { stations: [] }, () => 0);
  return spawned;
}

test('Nereid claim draws a claim outpost and the waystation stays a trade hub, seed 4242', () => {
  const card = EAST_SECTORS.find((row) => row.id === 'sector_nereid_shoal');
  const sector = applySectorAnchors(card);
  const claim = sector.stations.find((row) => row.id === 'station_nereid_claim');
  const way = sector.stations.find((row) => row.id === 'station_nereid');
  assert.ok(claim, 'the claim is on the merged sector');
  assert.equal(claim.pos.x, PIN.x);
  assert.equal(claim.pos.z, PIN.z);
  assert.equal(claim.archetypeGlb, CLAIM);
  assert.notEqual(claim.archetypeGlb, 'place_station_mining');
  assert.equal(way.pos.x, 960);
  assert.equal(way.pos.z, -380);
  assert.equal(way.archetypeGlb, 'place_station_trade_hub');

  const wreck = sector.pois.find((row) => row.id === 'poi_nereid_wreck');
  assert.equal(wreck.pos.x, 1280);
  assert.equal(wreck.pos.z, 720);

  const spawned = materializeStations(sector);
  const body = spawned.find((ent) => ent.data && ent.data.stationId === 'station_nereid_claim');
  assert.ok(body, 'world._spawnStations places the claim');
  assert.equal(body.data.archetypeGlb, CLAIM);
  assert.equal(resolvePlaceFileForEntity(body), `places/${CLAIM}.glb`);
  assert.equal(existsSync(`assets/ships/release/parts/places/${CLAIM}.glb`), true);
  const wayBody = spawned.find((ent) => ent.data && ent.data.stationId === 'station_nereid');
  assert.equal(wayBody.data.archetypeGlb, 'place_station_trade_hub');
  assert.notEqual(resolvePlaceFileForEntity(wayBody), `places/${CLAIM}.glb`);
});
