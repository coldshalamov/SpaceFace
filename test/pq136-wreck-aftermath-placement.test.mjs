// PQ-136.00 — ordinary sectors place authored wreck-aftermath pack models with
// variety: one family per field, rare hero hulls, fracture-coherent fragments.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import {
  WRECK_AFTERMATH_FAMILY_SHED,
  WRECK_AFTERMATH_HERO_IDS,
  WRECK_AFTERMATH_MAX_BATTLE_PER_SECTOR,
  WRECK_AFTERMATH_MAX_CORE_PER_SECTOR,
  WRECK_AFTERMATH_MAX_PER_SECTOR,
  WRECK_AFTERMATH_MODELS,
  WRECK_AFTERMATH_PLACE_FILE_BY_ID,
  WRECK_AFTERMATH_RELEASE_URL_BY_ID,
  WRECK_AFTERMATH_STATION_APRON,
  isWreckAftermathPlaceId,
  wreckAftermathFileForPlaceId,
} from '../src/data/wreckAftermathDressing.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { world } from '../src/systems/world.js';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const SEEDS = Object.freeze([47, 101, 202, 303, 404, 505, 606, 707]);
const ORDINARY_SECTORS = Object.freeze([
  'sector_ceres_belt',
  'sector_tethys_junction',
  'sector_vesta_forge',
  'sector_pallas_drift',
]);
// Eight seeds across four ordinary sectors. A working without-replacement family
// picker should surface several hero hulls — well above the old three hulk/chunk
// shapes, and below the eleven spawnable heroes so a collapsed picker still fails.
const MIN_DISTINCT_HEROES = 5;
const MIN_DISTINCT_MODELS = 12;

function parseGlbJson(abs) {
  const buf = readFileSync(abs);
  assert.equal(buf.toString('utf8', 0, 4), 'glTF', `not a GLB: ${abs}`);
  const jsonLen = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8').replace(/\0+$/, ''));
}

function glbHasPlaceExtras(abs) {
  const json = parseGlbJson(abs);
  const sf = json.asset && json.asset.extras && json.asset.extras.spacefaceAsset;
  return !!(sf && sf.slot === 'place' && sf.assetId);
}

function dist2(a, b) {
  const dx = Number(a && a.x) - Number(b && b.x);
  const dz = Number(a && a.z) - Number(b && b.z);
  return dx * dx + dz * dz;
}

function capFor(sectorId) {
  if (sectorId === 'sector_tethys_junction') return WRECK_AFTERMATH_MAX_CORE_PER_SECTOR;
  if (sectorId === 'sector_pallas_drift') return WRECK_AFTERMATH_MAX_BATTLE_PER_SECTOR;
  return WRECK_AFTERMATH_MAX_PER_SECTOR;
}

function collectWrecks(seed, sectorId) {
  const sim = createSimulation({ seed, systems: [world] });
  sim.state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0, alive: true, collides: false, radius: 8, mass: 1,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {},
  });
  sim.state.playerId = player.id;
  sim.registry.get('world').enterSector(sectorId, { placePlayer: false });
  const active = sim.state.world.sectorContents[sectorId] || {};
  const stations = (active.stations || []).map((row) => ({ x: Number(row.pos.x), z: Number(row.pos.z) }));
  const wrecks = [];
  for (const ent of sim.state.entityList || []) {
    if (!ent || !ent.data || ent.data.wreckAftermath !== true) continue;
    const model = WRECK_AFTERMATH_MODELS.find((item) => item.id === ent.data.placeId);
    wrecks.push({
      placeId: String(ent.data.placeId),
      file: resolvePlaceFileForEntity(ent),
      x: Number(ent.pos && ent.pos.x),
      z: Number(ent.pos && ent.pos.z),
      kind: model && model.kind,
      family: model && model.family,
      stem: model && model.stem,
      grammar: model && model.grammar,
    });
  }
  sim.dispose();
  return { wrecks, stations };
}

test('all 44 pack models are routed through the place resolver', () => {
  assert.equal(WRECK_AFTERMATH_MODELS.length, 44);
  assert.equal(Object.keys(WRECK_AFTERMATH_PLACE_FILE_BY_ID).length, 44);
  assert.equal(Object.keys(WRECK_AFTERMATH_RELEASE_URL_BY_ID).length, 44);
  const files = new Set();
  const urls = new Set();
  for (const model of WRECK_AFTERMATH_MODELS) {
    files.add(model.file);
    urls.add(model.releaseUrl);
    assert.equal(wreckAftermathFileForPlaceId(model.id), model.file);
    assert.equal(model.releaseUrl, WRECK_AFTERMATH_RELEASE_URL_BY_ID[model.id]);
    assert.ok(existsSync(resolve(ROOT, model.releaseUrl)), model.releaseUrl);
    assert.ok(glbHasPlaceExtras(resolve(ROOT, model.releaseUrl)), `loader extras missing on ${model.id}`);
    assert.equal(
      resolvePlaceFileForEntity({ type: 'fx', data: { placeId: model.id } }),
      null,
      `${model.id} stays out of PLACE_FILES without the wreck dressing flag`,
    );
    assert.equal(
      resolvePlaceFileForEntity({ type: 'fx', data: { placeId: model.id, wreckAftermath: true } }),
      model.file,
      `mutation: routing row missing for ${model.id}`,
    );
  }
  assert.equal(files.size, 44);
  assert.equal(urls.size, 44);
});

test('ordinary Ceres belt places pack wrecks deterministically within the sector bound', () => {
  const a = collectWrecks(47, 'sector_ceres_belt');
  const b = collectWrecks(47, 'sector_ceres_belt');
  assert.ok(a.wrecks.length >= 1, 'Ceres must spawn authored wreck packing');
  assert.ok(a.wrecks.length <= WRECK_AFTERMATH_MAX_PER_SECTOR);
  assert.deepEqual(a.wrecks, b.wrecks);
  for (const wreck of a.wrecks) {
    assert.ok(isWreckAftermathPlaceId(wreck.placeId));
    assert.equal(wreck.file, WRECK_AFTERMATH_PLACE_FILE_BY_ID[wreck.placeId]);
  }
});

test('Helios tutorial sector does not spawn wreck packing over the memorial', () => {
  const { wrecks } = collectWrecks(47, 'sector_helios_prime');
  assert.equal(wrecks.length, 0);
});

test('a handful of seeds yields distinct hero hulls and a coherent fracture field', () => {
  const distinct = new Set();
  const heroes = new Set();
  for (const seed of SEEDS) {
    for (const sectorId of ORDINARY_SECTORS) {
      const { wrecks, stations } = collectWrecks(seed, sectorId);
      assert.ok(wrecks.length >= 1, `${sectorId} seed ${seed} placed no pack wrecks`);
      assert.ok(wrecks.length <= capFor(sectorId), `${sectorId} seed ${seed} exceeded sector bound`);
      const heroRows = wrecks.filter((row) => row.kind === 'hero');
      assert.ok(heroRows.length <= 1, `${sectorId} seed ${seed} placed ${heroRows.length} hero hulls`);
      const family = heroRows[0] && heroRows[0].family
        || wrecks.find((row) => row.family && row.family !== 'shared')?.family;
      if (family) {
        const shed = WRECK_AFTERMATH_FAMILY_SHED[family];
        assert.ok(shed, `unknown wreck family ${family}`);
        for (const row of wrecks) {
          if (row.kind === 'hero') {
            assert.equal(row.family, family, `hero ${row.placeId} mixed into a ${family} field`);
            heroes.add(row.placeId);
            assert.ok(WRECK_AFTERMATH_HERO_IDS.includes(row.placeId), `${row.placeId} is not a spawnable hero`);
          } else if (row.kind === 'debris') {
            assert.ok(shed.debris.includes(row.stem), `${row.placeId} is not ${family} debris`);
          } else if (row.kind === 'component') {
            assert.ok(
              shed.components.includes(row.stem) || row.family === 'shared' || row.family === family,
              `${row.placeId} is not ${family} component kit`,
            );
          } else if (row.kind === 'fragment') {
            assert.ok(shed.fragments.includes(row.stem), `${row.placeId} is not a ${family} fragment`);
          }
        }
      }
      for (const wreck of wrecks) {
        assert.ok(isWreckAftermathPlaceId(wreck.placeId));
        assert.equal(
          wreck.file,
          WRECK_AFTERMATH_PLACE_FILE_BY_ID[wreck.placeId],
          `mutation: routing row missing for ${wreck.placeId}`,
        );
        distinct.add(wreck.placeId);
        for (const station of stations) {
          assert.ok(
            dist2(wreck, station) >= WRECK_AFTERMATH_STATION_APRON * WRECK_AFTERMATH_STATION_APRON,
            `${wreck.placeId} on ${sectorId} sits inside a station apron`,
          );
        }
      }
    }
  }
  assert.ok(
    heroes.size >= MIN_DISTINCT_HEROES,
    `expected at least ${MIN_DISTINCT_HEROES} distinct hero hulls across ${SEEDS.length} seeds, got ${heroes.size}`,
  );
  assert.ok(
    distinct.size >= MIN_DISTINCT_MODELS,
    `expected at least ${MIN_DISTINCT_MODELS} distinct pack models across ${SEEDS.length} seeds, got ${distinct.size}`,
  );
});
