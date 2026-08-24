// PQ-136.01 — ordinary sectors place loader-legal everyday-space kit props
// with variety at stations, lanes, and work sites. The thirty unpromoted
// source identities are recorded as loader-refused; their GLB bytes are
// never rewritten.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import {
  EVERYDAY_SPACE_KIT_LEGAL_IDS,
  EVERYDAY_SPACE_KIT_LEGAL_MODELS,
  EVERYDAY_SPACE_KIT_MAX_CORE_PER_SECTOR,
  EVERYDAY_SPACE_KIT_MAX_PER_SECTOR,
  EVERYDAY_SPACE_KIT_PLACE_FILE_BY_ID,
  EVERYDAY_SPACE_KIT_UNUSED_IDS,
  EVERYDAY_SPACE_KIT_UNUSED_MODELS,
  everydaySpaceKitFileForPlaceId,
  isEverydaySpaceKitPlaceId,
} from '../src/data/everydaySpaceKitDressing.js';
import { OCCUPATIONAL_YARD_PLACE_IDS } from '../src/data/occupationalYardDressing.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { world } from '../src/systems/world.js';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const SEEDS = Object.freeze([47, 101, 202, 303, 404, 505, 606, 707]);
const ORDINARY_SECTORS = Object.freeze([
  'sector_helios_prime',
  'sector_ceres_belt',
  'sector_tethys_junction',
  'sector_vesta_forge',
  'sector_pallas_drift',
]);
// Eight seeds across five ordinary sectors, cap 4–6 per sector. A working
// without-replacement picker should surface at least 10 of the 16 legal
// identities. Ten is below saturation so a collapsed picker (the old three
// beacon/buoy/drone shapes) still fails.
const MIN_DISTINCT_ACROSS_SEEDS = 10;

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

function collectKit(seed, sectorId) {
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
  const gates = (active.gates || []).map((row) => ({ x: Number(row.pos.x), z: Number(row.pos.z) }));
  const fields = (active.fields || []).map((row) => ({ x: Number(row.center.x), z: Number(row.center.z) }));
  const placed = [];
  for (const ent of sim.state.entityList || []) {
    if (!ent || !ent.data || ent.data.everydaySpaceKit !== true) continue;
    placed.push({
      placeId: String(ent.data.placeId),
      file: resolvePlaceFileForEntity(ent),
      x: Number(ent.pos && ent.pos.x),
      z: Number(ent.pos && ent.pos.z),
      name: ent.data.name,
    });
  }
  sim.dispose();
  return { placed, stations, gates, fields };
}

test('unused thirty source identities fail the authored loader and stay unstamped', () => {
  assert.equal(EVERYDAY_SPACE_KIT_UNUSED_MODELS.length, 30);
  assert.equal(EVERYDAY_SPACE_KIT_UNUSED_IDS.length, 30);
  for (const model of EVERYDAY_SPACE_KIT_UNUSED_MODELS) {
    assert.equal(model.live, false, `${model.stem} must not be marked live`);
    assert.equal(model.file, null);
    assert.ok(existsSync(resolve(ROOT, model.sourceFile)), model.sourceFile);
    assert.equal(glbHasPlaceExtras(resolve(ROOT, model.sourceFile)), false,
      `${model.stem} unexpectedly gained spacefaceAsset extras`);
    assert.equal(
      existsSync(resolve(ROOT, 'assets/ships/release/parts/places', `${model.id}.glb`)),
      false,
      `${model.id} must not have a silent release body`,
    );
    assert.equal(everydaySpaceKitFileForPlaceId(model.id), null);
    assert.equal(
      resolvePlaceFileForEntity({ type: 'fx', data: { placeId: model.id, everydaySpaceKit: true } }),
      null,
      `${model.id} must not resolve through the place selector`,
    );
  }
});

test('sixteen legal kit identities route through the release place family', () => {
  assert.equal(EVERYDAY_SPACE_KIT_LEGAL_MODELS.length, 16);
  assert.deepEqual([...EVERYDAY_SPACE_KIT_LEGAL_IDS].sort(), [...OCCUPATIONAL_YARD_PLACE_IDS].sort());
  assert.equal(Object.keys(EVERYDAY_SPACE_KIT_PLACE_FILE_BY_ID).length, 16);
  for (const model of EVERYDAY_SPACE_KIT_LEGAL_MODELS) {
    assert.equal(everydaySpaceKitFileForPlaceId(model.id), model.file);
    assert.ok(existsSync(resolve(ROOT, model.releaseUrl)), model.releaseUrl);
    assert.ok(glbHasPlaceExtras(resolve(ROOT, model.releaseUrl)), `${model.id} release missing extras`);
    assert.equal(
      resolvePlaceFileForEntity({ type: 'fx', data: { placeId: model.id } }),
      null,
      `${model.id} stays out of PLACE_FILES without the kit dressing flag`,
    );
    assert.equal(
      resolvePlaceFileForEntity({ type: 'fx', data: { placeId: model.id, everydaySpaceKit: true } }),
      model.file,
      `routing row missing for ${model.id}`,
    );
  }
});

test('ordinary sectors place kit props deterministically within the sector bound', () => {
  const a = collectKit(47, 'sector_vesta_forge');
  const b = collectKit(47, 'sector_vesta_forge');
  assert.ok(a.placed.length >= 1, 'Vesta must spawn kit dressing');
  assert.ok(a.placed.length <= EVERYDAY_SPACE_KIT_MAX_PER_SECTOR);
  assert.deepEqual(a.placed, b.placed);
  for (const row of a.placed) {
    assert.ok(isEverydaySpaceKitPlaceId(row.placeId));
    assert.equal(row.file, EVERYDAY_SPACE_KIT_PLACE_FILE_BY_ID[row.placeId]);
    assert.ok(!EVERYDAY_SPACE_KIT_UNUSED_IDS.includes(row.placeId));
  }
});

test('a handful of seeds yields distinct kit models, not the same prop repeated', () => {
  const distinct = new Set();
  const byAnchor = { station: 0, lane: 0, work: 0 };
  for (const seed of SEEDS) {
    for (const sectorId of ORDINARY_SECTORS) {
      const { placed, stations, gates, fields } = collectKit(seed, sectorId);
      const cap = sectorId === 'sector_helios_prime' || sectorId === 'sector_tethys_junction'
        ? EVERYDAY_SPACE_KIT_MAX_CORE_PER_SECTOR
        : EVERYDAY_SPACE_KIT_MAX_PER_SECTOR;
      assert.ok(placed.length >= 1, `${sectorId} seed ${seed} placed no kit props`);
      assert.ok(placed.length <= cap, `${sectorId} seed ${seed} exceeded sector bound`);
      if (sectorId === 'sector_ceres_belt') {
        assert.equal(placed.filter((row) => row.placeId === 'place_slurry_tank').length, 0);
        assert.equal(placed.filter((row) => row.placeId === 'place_sensor_mast').length, 0);
      }
      if (sectorId === 'sector_tethys_junction') {
        assert.equal(placed.filter((row) => row.placeId === 'place_transponder_gate').length, 0);
        assert.equal(placed.filter((row) => row.placeId === 'place_interdiction_buoy').length, 0);
      }
      for (const row of placed) {
        assert.ok(isEverydaySpaceKitPlaceId(row.placeId));
        assert.equal(row.file, EVERYDAY_SPACE_KIT_PLACE_FILE_BY_ID[row.placeId],
          `mutation: routing row missing for ${row.placeId}`);
        distinct.add(row.placeId);
        const model = EVERYDAY_SPACE_KIT_LEGAL_MODELS.find((item) => item.id === row.placeId);
        assert.ok(model);
        const sites = model.anchor === 'lane' ? gates : (model.anchor === 'work' ? fields : stations);
        if (!sites.length) continue;
        const nearest = Math.min(...sites.map((site) => dist2(row, site)));
        const limit = model.anchor === 'work' ? 420 : 240;
        assert.ok(nearest <= limit * limit,
          `${row.placeId} on ${sectorId} is not near a ${model.anchor} anchor`);
        byAnchor[model.anchor] += 1;
      }
    }
  }
  assert.ok(
    distinct.size >= MIN_DISTINCT_ACROSS_SEEDS,
    `expected at least ${MIN_DISTINCT_ACROSS_SEEDS} distinct kit models across ${SEEDS.length} seeds, got ${distinct.size}`,
  );
  assert.ok(byAnchor.station >= 1, 'station-adjacent kit props never appeared');
  assert.ok(byAnchor.lane >= 1, 'lane kit props never appeared');
  assert.ok(byAnchor.work >= 1, 'work-site kit props never appeared');
});
