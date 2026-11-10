import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { parseStrictEmbeddedGlb } from '../tools/art/lib/strictGlbValidation.mjs';
import {
  isPackagedLiveWholeShipFile,
  wholeShipVisualForEntity,
} from '../src/render/partsLibrary.js';
import { renderPackagePilotForSourceUrl } from '../src/render/renderPackageManifest.js';
import { traffic, TRAFFIC_ROLES, trafficRoleMixForSector } from '../src/systems/traffic.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PART_ROOT = 'assets/ships/release/parts/';
const ARCLIGHT_FILE = 'wholeships/helios_arclight.glb';
const SPAN_FILE = 'wholeships/helios_span.glb';
const ATLAS_FILE = 'wholeships/atlas_production_v1.glb';
const ARCLIGHT_ID = 'SF_WHOLESHIP_HELIOS_ARCLIGHT';
const SPAN_ID = 'SF_WHOLESHIP_HELIOS_SPAN';

function visual(data) {
  return wholeShipVisualForEntity({ type: 'ship', data }, { requiredWholeShip: true });
}

test('Helios Arclight is a packaged rare heavy and does not steal Span or Atlas', () => {
  const arclight = visual({ trafficRole: 'arclight', defId: 'ship_mule' });
  const hauler = visual({ trafficRole: 'hauler', defId: 'ship_mule' });
  const atlas = visual({ defId: 'ship_atlas' });
  const trader = visual({ lootTableId: 'mule_trader', silhouette: 'trader_haul', defId: 'ship_mule' });

  assert.equal(arclight.file, ARCLIGHT_FILE);
  assert.equal(arclight.assetId, ARCLIGHT_ID);
  assert.equal(hauler.file, SPAN_FILE);
  assert.equal(hauler.assetId, SPAN_ID);
  assert.equal(trader.file, SPAN_FILE);
  assert.equal(atlas.file, ATLAS_FILE);
  assert.notEqual(arclight.file, hauler.file);
  assert.notEqual(arclight.file, atlas.file);

  assert.equal(isPackagedLiveWholeShipFile(arclight.file), true);
  const pilot = renderPackagePilotForSourceUrl(`${PART_ROOT}${ARCLIGHT_FILE}`);
  assert.ok(pilot, 'Arclight body must have a render-package pilot');
  assert.equal(pilot.runtimeAssetId, ARCLIGHT_ID);

  assert.equal(TRAFFIC_ROLES.arclight.label, 'Helios Arclight');
  assert.equal(TRAFFIC_ROLES.hauler.label, 'Cargo Hauler');
  const mix = trafficRoleMixForSector({
    id: 'sector_helios_prime',
    security: 0.95,
    trafficPerMin: 18,
  });
  assert.equal(mix.arclight, 0, 'Arclight must not roll from the ambient mix');
  assert.ok(mix.hauler > 0, 'Span haulers stay in the ambient mix');

  const source = parseStrictEmbeddedGlb(
    readFileSync(resolve(ROOT, 'assets/ships/parts', ARCLIGHT_FILE)),
    'arclight source',
  );
  const names = new Set((source.gltf.nodes || []).map((node) => node.name).filter(Boolean));
  assert.equal(source.gltf.asset?.extras?.spacefaceAsset?.assetId, ARCLIGHT_ID);
  assert.ok(names.has('SF_M4_HELIOS_ARCLIGHT_ROOT'));
  assert.ok(names.has('SOCKET_Engine_Main'));
  assert.ok(names.has('COLLISION_HULL'));
  assert.ok(!names.has('SF_M4_HELIOS_SPAN_ROOT'), 'Arclight must not steal the Span root identity');
});

test('Helios start-sector traffic always includes one Arclight', () => {
  const sim = createSimulation({ seed: 47, systems: [traffic] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world = state.world || {};
  state.world.currentSectorId = 'sector_helios_prime';
  sim.spawn({
    type: 'station', team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 40, hull: 1000, hullMax: 1000,
    data: { stationId: 'station_helios', name: 'Helios Station' },
  });
  sim.spawn({
    type: 'station', team: 2, pos: { x: 900, z: 120 }, vel: { x: 0, z: 0 },
    radius: 34, hull: 1000, hullMax: 1000,
    data: { stationId: 'station_helios_yard', name: 'Helios Yard' },
  });
  bus.emit('sector:enter', {
    sectorId: 'sector_helios_prime',
    sector: { id: 'sector_helios_prime', security: 0.95, trafficPerMin: 18, factionId: 'faction_helios' },
  });

  const arclights = (state.traffic.freighters || []).filter((rec) => rec && rec.role === 'arclight');
  const haulers = (state.traffic.freighters || []).filter((rec) => rec && rec.role === 'hauler');
  assert.equal(arclights.length, 1, 'exactly one Arclight on Helios');
  assert.ok(haulers.length >= 1, 'Span haulers still spawn beside the Arclight');

  const entity = state.entities.get(arclights[0].id);
  assert.ok(entity && entity.alive !== false);
  assert.equal(entity.data.trafficRole, 'arclight');
  assert.equal(entity.data.trafficLabel, 'Helios Arclight');
  const selection = visual(entity.data);
  assert.equal(selection.file, ARCLIGHT_FILE);
  assert.equal(selection.assetId, ARCLIGHT_ID);

  const haulerEntity = state.entities.get(haulers[0].id);
  assert.equal(visual(haulerEntity.data).file, SPAN_FILE);
  sim.dispose();
});
