import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { parseStrictEmbeddedGlb } from '../tools/art/lib/strictGlbValidation.mjs';
import { modelTruthRow } from '../src/data/modelTruth.js';
import {
  isPackagedLiveWholeShipFile,
  stationOverlayFileForEntity,
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

// Faction kits are forge variants (tools/blender/forge/variant.py): the same hull under the
// operator's paint, so the evidence is the operator colour, not a bolted-on kit node.
function hullColor(rel, materialName) {
  const parsed = parseStrictEmbeddedGlb(readFileSync(resolve(ROOT, 'assets/ships/parts', rel)), rel);
  const material = (parsed.gltf.materials || []).find((m) => m.name === materialName);
  return material ? JSON.stringify(material.pbrMetallicRoughness?.baseColorFactor) : null;
}

function isForgeVariantOf(rel, baseRel, materialName) {
  const parsed = parseStrictEmbeddedGlb(readFileSync(resolve(ROOT, 'assets/ships/parts', rel)), rel);
  const forge = parsed.gltf.asset?.extras?.spacefaceAsset?.surfaceGeometryRemaster === 'forge-v1';
  const color = hullColor(rel, materialName);
  return forge && color != null && color !== hullColor(baseRel, materialName);
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
  for (const variant of [dmc, mts, reach]) {
    assert.ok(isForgeVariantOf(variant.file, 'wholeships/helios_span.glb', 'Material_Armor'),
      `${variant.file} carries its operator's freight colour on the Span hull`);
  }
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
  for (const variant of [patrol, escort, militia]) {
    assert.ok(isForgeVariantOf(variant.file, 'wholeships/wasp_production_v1.glb', 'Material_Hull'),
      `${variant.file} carries its operator's paint on the Wasp hull`);
  }
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
  // Row 512: off-hub archetypes take the faction's canonical-shell kit — Ceres' Drift
  // refinery wears the cage, not a bare body.
  assert.equal(refinery, 'places/var_station_kit_drift_v01.glb');

  // The overlay bodies were reforged under generic material-slot node names; the
  // behavioral contract is the faction overlay root plus its authored faction lights.
  const scnNames = names('places/var_station_trade_hub_scn_overlay_v01.glb');
  assert.ok(scnNames.has('SF_TRADE_HUB_SCN_OVERLAY_ROOT'));
  assert.ok(scnNames.has('LOD0_Lights_Cyan_scn'), 'SCN overlay keeps its authored cyan claim lights');
  assert.ok([...scnNames].some((n) => /^LOD0_/.test(n)), 'SCN overlay still carries cladding geometry');
  const freeNames = names('places/var_station_trade_hub_free_overlay_v01.glb');
  assert.ok(freeNames.has('SF_TRADE_HUB_FREE_OVERLAY_ROOT'));
  assert.ok(freeNames.has('LOD0_Lights_Cyan_free'), 'Free overlay keeps its authored cyan claim lights');
  const mtsNames = names('places/var_station_trade_hub_mts_overlay_v01.glb');
  assert.ok(mtsNames.has('SF_TRADE_HUB_MTS_OVERLAY_ROOT'));
  assert.ok(mtsNames.has('LOD0_Lights_Warm'), 'MTS overlay keeps its authored warm marquee lights');
});

test('Row 514: Helix/Fulfillment/Archive/Pitborn/Understory/Verge kits dress the hulls those factions field', () => {
  // The player entity is faction_free: kit maps are factionId-keyed, so these never touch
  // the production hulls the player flies.
  const cases = [
    ['faction_helix', 'ship_drifter', 'wholeships/drifter_helix_courier.glb', 'SF_DRIFTER_HELIX_COURIER'],
    ['faction_archive', 'ship_drifter', 'wholeships/drifter_archive_censor.glb', 'SF_DRIFTER_ARCHIVE_CENSOR'],
    ['faction_archive', 'ship_ranger', 'wholeships/ranger_archive_censor.glb', 'SF_RANGER_ARCHIVE_CENSOR'],
    ['faction_fulfillment', 'ship_mule', 'wholeships/mule_fulfillment_hauler.glb', 'SF_MULE_FULFILLMENT_HAULER'],
    ['faction_pitborn', 'ship_mule', 'wholeships/mule_pitborn_junk.glb', 'SF_MULE_PITBORN_JUNK'],
    ['faction_pitborn', 'ship_ironback', 'wholeships/ironback_pitborn_junk.glb', 'SF_IRONBACK_PITBORN_JUNK'],
    ['faction_understory', 'ship_kestrel', 'wholeships/kestrel_understory_growth.glb', 'SF_KESTREL_UNDERSTORY_GROWTH'],
    ['faction_verge_layers', 'ship_ranger', 'wholeships/ranger_verge_surveyor.glb', 'SF_RANGER_VERGE_SURVEYOR'],
  ];
  const BASE_BY_DEF = {
    ship_drifter: 'wholeships/drifter_production_v1.glb',
    ship_ranger: 'wholeships/ranger_production_v1.glb',
    ship_mule: 'wholeships/mule_production_v1.glb',
    ship_ironback: 'wholeships/ironback_production_v1.glb',
    ship_kestrel: 'wholeships/kestrel.glb',
  };
  for (const [factionId, defId, file, assetId] of cases) {
    const selection = visual({ defId }, factionId);
    assert.equal(selection && selection.file, file, `${factionId} ${defId} must wear its kit`);
    assert.equal(selection && selection.assetId, assetId);
    assert.equal(isPackagedLiveWholeShipFile(file), true, `${file} must be packaged live`);
    assert.ok(isForgeVariantOf(file, BASE_BY_DEF[defId], 'Material_Hull'),
      `${file} carries its operator's paint on the ${defId} hull`);
    const pilot = renderPackagePilotForSourceUrl(`${PART_ROOT}${file}`);
    assert.ok(pilot, `${file} must have a render-package pilot`);
    assert.equal(pilot.runtimeAssetId, assetId);
  }
  // Off-kit combinations keep the production hulls.
  assert.equal(visual({ defId: 'ship_drifter' }, 'faction_quiet').file, 'wholeships/drifter_production_v1.glb');
  assert.equal(visual({ defId: 'ship_mule' }, 'faction_helix').file, 'wholeships/mule_production_v1.glb');
  assert.equal(visual({ defId: 'ship_kestrel' }, 'faction_pitborn').file, 'wholeships/kestrel.glb');
  assert.equal(visual({ defId: 'ship_ironback' }, 'faction_understory').file, 'wholeships/ironback_production_v1.glb');
  // The player entity carries faction_free (newGameBoot): that faction has no kit, so the
  // player's own hulls stay production paint on every kit-covered family.
  const player = wholeShipVisualForEntity(
    { type: 'ship', isPlayer: true, factionId: 'faction_free', data: { defId: 'ship_kestrel' } },
    { requiredWholeShip: true },
  );
  assert.equal(player.file, 'wholeships/kestrel.glb', 'the player Kestrel stays the Hitch, never garden');
});

// Row 512: fourteen canonical-shell kits — one authored dressing set per expansion faction,
// envelope-fit at compose onto whichever of the seven station archetypes the entity resolves.
const STATION_KIT_CASES = [
  ['faction_scn', 'places/var_station_kit_concord_v01.glb', 'SF_PLACE_STATION_KIT_CONCORD'],
  ['faction_mts', 'places/var_station_kit_meridian_v01.glb', 'SF_PLACE_STATION_KIT_MERIDIAN'],
  ['faction_dmc', 'places/var_station_kit_drift_v01.glb', 'SF_PLACE_STATION_KIT_DRIFT'],
  ['faction_reach', 'places/var_station_kit_reach_v01.glb', 'SF_PLACE_STATION_KIT_REACH'],
  ['faction_quiet', 'places/var_station_kit_quiet_v01.glb', 'SF_PLACE_STATION_KIT_QUIET'],
  ['faction_vael', 'places/var_station_kit_vael_v01.glb', 'SF_PLACE_STATION_KIT_VAEL'],
  ['faction_free', 'places/var_station_kit_frontier_v01.glb', 'SF_PLACE_STATION_KIT_FRONTIER'],
  ['faction_choir', 'places/var_station_kit_choir_v01.glb', 'SF_PLACE_STATION_KIT_CHOIR'],
  ['faction_helix', 'places/var_station_kit_helix_v01.glb', 'SF_PLACE_STATION_KIT_HELIX'],
  ['faction_understory', 'places/var_station_kit_understory_v01.glb', 'SF_PLACE_STATION_KIT_UNDERSTORY'],
  ['faction_fulfillment', 'places/var_station_kit_fulfillment_v01.glb', 'SF_PLACE_STATION_KIT_FULFILLMENT'],
  ['faction_archive', 'places/var_station_kit_archive_v01.glb', 'SF_PLACE_STATION_KIT_ARCHIVE'],
  ['faction_pitborn', 'places/var_station_kit_pitborn_v01.glb', 'SF_PLACE_STATION_KIT_PITBORN'],
  ['faction_verge_layers', 'places/var_station_kit_verge_v01.glb', 'SF_PLACE_STATION_KIT_VERGE'],
];

const SEVEN_ARCHETYPES = [
  'trade_hub', 'refinery', 'military', 'blackmarket', 'fab', 'mining', 'research',
];

function stationEntity(stationTypeId, factionId) {
  return {
    type: 'station',
    factionId,
    data: { archetypeGlb: `place_station_${stationTypeId}`, stationTypeId },
  };
}

test('Row 512: every faction kit dresses all seven station archetypes; authored hub overlays keep precedence', () => {
  for (const [factionId, file] of STATION_KIT_CASES) {
    for (const typeId of SEVEN_ARCHETYPES) {
      const resolved = stationOverlayFileForEntity(stationEntity(typeId, factionId));
      if (typeId === 'trade_hub'
        && { faction_scn: 1, faction_mts: 1, faction_free: 1 }[factionId]) {
        // The three authored Helios overlays still win on the hub they were built for.
        assert.equal(resolved, `places/var_station_trade_hub_${factionId.slice(8)}_overlay_v01.glb`,
          `${factionId} trade_hub keeps its authored overlay`);
      } else {
        assert.equal(resolved, file, `${factionId} on ${typeId} must wear its kit`);
      }
    }
  }
  // A faction with no kit row leaves every archetype bare rather than borrowing one.
  assert.equal(stationOverlayFileForEntity(stationEntity('refinery', 'faction_bloom')), null);
  assert.equal(stationOverlayFileForEntity(stationEntity('mining', 'faction_free_agent_x')), null);
  // Non-station entities and non-archetype places never take a kit.
  assert.equal(stationOverlayFileForEntity({ type: 'ship', factionId: 'faction_scn', data: {} }), null);
  const gate = stationOverlayFileForEntity({
    type: 'station',
    factionId: 'faction_scn',
    data: { isGate: true, archetypeGlb: 'place_gate_jump_ring' },
  });
  assert.equal(gate, null, 'the jump ring keeps its bare authored body');
});

test('Row 512: kit GLBs are forge-built dressing sets with measured canonical shells', () => {
  for (const [, file] of STATION_KIT_CASES) {
    const parsed = parseStrictEmbeddedGlb(
      readFileSync(resolve(ROOT, 'assets/ships/parts', file)),
      file,
    );
    assert.equal(parsed.gltf.asset?.extras?.spacefaceAsset?.surfaceGeometryRemaster,
      'forge-v1', `${file} must be a forge body`);
    const nodeNames = new Set((parsed.gltf.nodes || []).map((n) => n.name));
    assert.ok(!nodeNames.has('COLLISION_HULL'), `${file} is garnish — no collision hull`);
    assert.ok([...nodeNames].some((n) => /^SF_VAR_STATION_KIT_.*_ROOT$/.test(n)),
      `${file} carries its kit root`);
    // Every kit is a multi-material dressing set with a faction read — a cladding band
    // plus emissive or accent marks, never a blank shell.
    const mats = new Set((parsed.gltf.materials || []).map((m) => m.name));
    assert.ok(mats.size >= 4, `${file} is a layered dressing set, not a flat repaint`);
    assert.ok([...mats].some((m) => /Hull|Armor|Mechanical/.test(m)),
      `${file} keeps a cladding band material`);
    assert.ok([...mats].some((m) => /Emissive|Accent|Ceramic|Stone|Warning/.test(m)),
      `${file} carries a faction read`);
  }
});

test('Row 512: every kit x archetype census pair carries positive bounds, so the envelope fit is computable', () => {
  // StationKitEnvelopeFit divides measured bounds per-axis; a zero or missing row would
  // produce a degenerate or NaN transform. Prove every kit and every dressed archetype
  // reports finite, positive measured bounds and a finite centre.
  const finite3 = (v) => Array.isArray(v) && v.length === 3 && v.every((x) => Number.isFinite(Number(x)));
  for (const typeId of SEVEN_ARCHETYPES) {
    const base = modelTruthRow(`place_station_${typeId}`);
    assert.ok(base && base.bounds, `census row for place_station_${typeId}`);
    assert.ok(finite3(base.bounds.size) && base.bounds.size.every((x) => x > 0),
      `place_station_${typeId} measured bounds`);
    assert.ok(finite3(base.bounds.center), `place_station_${typeId} authored centre`);
  }
  for (const [, file] of STATION_KIT_CASES) {
    const stem = file.slice(file.lastIndexOf('/') + 1).replace(/\.glb$/, '');
    const kit = modelTruthRow(stem);
    assert.ok(kit && kit.bounds, `census row for ${stem}`);
    assert.ok(finite3(kit.bounds.size) && kit.bounds.size.every((x) => x > 0),
      `${stem} measured bounds`);
    assert.ok(finite3(kit.bounds.center), `${stem} authored centre`);
  }
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
    ...STATION_KIT_CASES.map(([, file, assetId]) => [file, assetId]),
  ];
  for (const [file, assetId] of files) {
    const pilot = renderPackagePilotForSourceUrl(`${PART_ROOT}${file}`);
    assert.ok(pilot, `${file} must have a render-package pilot`);
    assert.equal(pilot.runtimeAssetId, assetId);
  }
});
