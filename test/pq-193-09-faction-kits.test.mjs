import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { parseStrictEmbeddedGlb } from '../tools/art/lib/strictGlbValidation.mjs';
import {
  isPackagedLiveWholeShipFile,
  tradeHubOverlayFileForEntity,
  wholeShipVisualForEntity,
} from '../src/render/partsLibrary.js';
import { renderPackagePilotForSourceUrl } from '../src/render/renderPackageManifest.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PART_ROOT = 'assets/ships/release/parts/';

function visual(data, factionId) {
  return wholeShipVisualForEntity(
    { type: 'ship', factionId, data },
    { requiredWholeShip: true },
  );
}

function names(rel) {
  const parsed = parseStrictEmbeddedGlb(
    readFileSync(resolve(ROOT, 'assets/ships/parts', rel)),
    rel,
  );
  return new Set((parsed.gltf.nodes || []).map((node) => node.name).filter(Boolean));
}

test('Span haulers carry DMC/MTS/Reach kits; unknown factions keep the live Span', () => {
  const plain = visual({ trafficRole: 'hauler', defId: 'ship_mule' }, 'faction_scn');
  const dmc = visual({ trafficRole: 'hauler', defId: 'ship_mule' }, 'faction_dmc');
  const mts = visual({ trafficRole: 'hauler', defId: 'ship_mule' }, 'faction_mts');
  const reach = visual({ trafficRole: 'hauler', defId: 'ship_mule' }, 'faction_reach');
  const trader = visual({ lootTableId: 'mule_trader', defId: 'ship_mule' }, 'faction_dmc');

  assert.equal(plain.file, 'wholeships/helios_span.glb');
  assert.equal(plain.assetId, 'SF_WHOLESHIP_HELIOS_SPAN');
  assert.equal(dmc.file, 'wholeships/helios_span_dmc.glb');
  assert.equal(dmc.assetId, 'SF_WHOLESHIP_HELIOS_SPAN_DMC');
  assert.equal(mts.file, 'wholeships/helios_span_mts.glb');
  assert.equal(reach.file, 'wholeships/helios_span_reach.glb');
  assert.equal(trader.file, 'wholeships/helios_span_dmc.glb');
  assert.equal(isPackagedLiveWholeShipFile(dmc.file), true);
  assert.ok(names(dmc.file).has('LOD0_VAR_DMC_orebox_port_fwd'));
  assert.ok(names(mts.file).has('LOD0_VAR_MTS_clamshell_mid'));
  assert.ok(names(reach.file).has('LOD0_VAR_REACH_plate0'));
  assert.ok(names(dmc.file).has('SF_M4_HELIOS_SPAN_DMC_ROOT'));
  assert.ok(!names(dmc.file).has('SF_M4_HELIOS_SPAN_ROOT'));
});

test('Wasp patrol and escort carry faction kits; pirate and player Wasp stay the accepted hull', () => {
  const patrol = visual({ trafficRole: 'patrol', defId: 'ship_wasp' }, 'faction_scn');
  const escort = visual({ trafficRole: 'escort', defId: 'ship_wasp' }, 'faction_mts');
  const militia = visual({ trafficRole: 'patrol', defId: 'ship_wasp' }, 'faction_free');
  const pirate = visual({ trafficRole: 'pirate', defId: 'ship_hornet' }, 'faction_scn');
  const player = wholeShipVisualForEntity(
    { type: 'ship', isPlayer: true, factionId: 'faction_free', data: { defId: 'ship_wasp' } },
    { requiredWholeShip: true },
  );
  const lancer = visual({ lootTableId: 'lancer_sniper', defId: 'ship_wasp' }, 'faction_scn');

  assert.equal(patrol.file, 'wholeships/wasp_scn_patrol.glb');
  assert.equal(escort.file, 'wholeships/wasp_mts_escort.glb');
  assert.equal(militia.file, 'wholeships/wasp_free_militia.glb');
  assert.equal(pirate.file, 'wholeships/wasp_production_v1.glb');
  assert.equal(player.file, 'wholeships/wasp_production_v1.glb');
  assert.equal(lancer.file, 'wholeships/wasp_production_v1.glb');
  assert.ok(names(patrol.file).has('LOD0_VAR_SCN_band'));
  assert.ok(names(escort.file).has('LOD0_VAR_MTS_clamshell_fore'));
  assert.ok(names(militia.file).has('LOD0_VAR_FREE_pod'));
});

test('the three trade-hub overlays on disk bind to Free/MTS/SCN hubs and stay garnish', () => {
  const helios = tradeHubOverlayFileForEntity({
    type: 'station',
    factionId: 'faction_scn',
    data: { archetypeGlb: 'place_station_trade_hub', stationTypeId: 'trade_hub' },
  });
  const tethys = tradeHubOverlayFileForEntity({
    type: 'station',
    factionId: 'faction_mts',
    data: { archetypeGlb: 'place_station_trade_hub', stationTypeId: 'trade_hub' },
  });
  const reach = tradeHubOverlayFileForEntity({
    type: 'station',
    factionId: 'faction_free',
    data: { archetypeGlb: 'place_station_trade_hub', stationTypeId: 'trade_hub' },
  });
  const refinery = tradeHubOverlayFileForEntity({
    type: 'station',
    factionId: 'faction_dmc',
    data: { archetypeGlb: 'place_station_refinery', stationTypeId: 'refinery' },
  });
  assert.equal(helios, 'places/var_station_trade_hub_scn_overlay_v01.glb');
  assert.equal(tethys, 'places/var_station_trade_hub_mts_overlay_v01.glb');
  assert.equal(reach, 'places/var_station_trade_hub_free_overlay_v01.glb');
  assert.equal(refinery, null);

  const scnNames = names('places/var_station_trade_hub_scn_overlay_v01.glb');
  assert.ok(scnNames.has('SF_TRADE_HUB_SCN_OVERLAY_ROOT'));
  assert.ok(scnNames.has('LOD0_VAR_SCN_cladding_band'));
  assert.ok(scnNames.has('LOD0_VAR_SCN_boom_n'));
  const freeNames = names('places/var_station_trade_hub_free_overlay_v01.glb');
  assert.ok(freeNames.has('LOD0_VAR_FREE_pod00'));
  const mtsNames = names('places/var_station_trade_hub_mts_overlay_v01.glb');
  assert.ok(mtsNames.has('LOD0_VAR_MTS_ring_outer'));
});

test('faction kit bodies have render-package pilots after release packaging', () => {
  const files = [
    ['wholeships/helios_span_dmc.glb', 'SF_WHOLESHIP_HELIOS_SPAN_DMC'],
    ['wholeships/helios_span_mts.glb', 'SF_WHOLESHIP_HELIOS_SPAN_MTS'],
    ['wholeships/helios_span_reach.glb', 'SF_WHOLESHIP_HELIOS_SPAN_REACH'],
    ['wholeships/wasp_free_militia.glb', 'SF_WASP_FREE_MILITIA'],
    ['wholeships/wasp_mts_escort.glb', 'SF_WASP_MTS_ESCORT'],
    ['wholeships/wasp_scn_patrol.glb', 'SF_WASP_SCN_PATROL'],
    ['places/var_station_trade_hub_free_overlay_v01.glb', 'SF_PLACE_STATION_TRADE_HUB_FREE_OVERLAY'],
    ['places/var_station_trade_hub_mts_overlay_v01.glb', 'SF_PLACE_STATION_TRADE_HUB_MTS_OVERLAY'],
    ['places/var_station_trade_hub_scn_overlay_v01.glb', 'SF_PLACE_STATION_TRADE_HUB_SCN_OVERLAY'],
  ];
  for (const [file, assetId] of files) {
    const pilot = renderPackagePilotForSourceUrl(`${PART_ROOT}${file}`);
    assert.ok(pilot, `${file} must have a render-package pilot`);
    assert.equal(pilot.runtimeAssetId, assetId);
  }
});
