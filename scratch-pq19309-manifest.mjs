#!/usr/bin/env node
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname || '.');
const MANIFEST = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

const SPAN_SOCKETS = [
  'SOCKET_Weapon_Front', 'SOCKET_Mining_Front', 'SOCKET_Engine_Main', 'SOCKET_Trail_Main',
  'SOCKET_Utility_Dorsal', 'SOCKET_Cargo_Ventral', 'SOCKET_Camera_Focus', 'SOCKET_RCS_Port',
  'SOCKET_RCS_Starboard',
];
const SPAN_HOOKS = ['HOOK_DRIVE_CORE', 'HOOK_DRIVE_FAN', 'Gun_Assembly'];
const SPAN_TINT = { hull: 'Material_Hull', accent: 'Material_Cyan', warm: 'Material_Warm' };
const WASP_SOCKETS = [
  'SOCKET_Weapon_Front', 'SOCKET_Mining_Front', 'SOCKET_Engine_Main', 'SOCKET_Trail_Main',
  'SOCKET_Trail_Port', 'SOCKET_Trail_Starboard', 'SOCKET_Utility_Dorsal', 'SOCKET_Cargo_Ventral',
  'SOCKET_Camera_Focus', 'SOCKET_RCS_Port', 'SOCKET_RCS_Starboard',
];
const WASP_TINT = {
  hull: 'Material_Hull', dark: 'Material_Armor', mechanical: 'Material_Mechanical',
  accent: 'Material_Accent', warning: 'Material_Warning', canopy: 'Material_Canopy',
  thruster: 'Material_Thruster',
};

function row(part) {
  const abs = resolve(ROOT, 'assets/ships/parts', part.file);
  const bytes = statSync(abs).size;
  return { ...part, bytes };
}

const SHIPS = [
  row({
    id: 'wholeship_helios_span_dmc',
    assetId: 'SF_WHOLESHIP_HELIOS_SPAN_DMC',
    category: 'wholeships',
    priority: 'P1',
    file: 'wholeships/helios_span_dmc.glb',
    tris: 50418,
    textureSize: 1024,
    tintable: SPAN_TINT,
    hooks: SPAN_HOOKS,
    sockets: SPAN_SOCKETS,
    mount: 'origin',
    bounds: {
      min: [-14.325, -2.3, -4.625],
      max: [14.15, 3.5606, 4.625],
      dimensionsM: [28.475, 5.8606, 9.25],
    },
    note: 'PQ-193.09 — live Helios Span carrying the DMC orebox faction kit. Donor hull is the accepted Span; kit garnish remapped onto hull/mechanical. Provenance: assets/ships/foundry/fleet_breadth_20260720/variants/var_helios_span_dmc_orebox_v01.glb.',
  }),
  row({
    id: 'wholeship_helios_span_mts',
    assetId: 'SF_WHOLESHIP_HELIOS_SPAN_MTS',
    category: 'wholeships',
    priority: 'P1',
    file: 'wholeships/helios_span_mts.glb',
    tris: 47886,
    textureSize: 1024,
    tintable: SPAN_TINT,
    hooks: SPAN_HOOKS,
    sockets: SPAN_SOCKETS,
    mount: 'origin',
    bounds: {
      min: [-14.325, -2.3, -4.46],
      max: [14.15, 3.96, 4.46],
      dimensionsM: [28.475, 6.26, 8.92],
    },
    note: 'PQ-193.09 — live Helios Span carrying the MTS sealed faction kit. Donor hull is the accepted Span; kit garnish remapped onto hull/mechanical. Provenance: assets/ships/foundry/fleet_breadth_20260720/variants/var_helios_span_mts_sealed_v01.glb.',
  }),
  row({
    id: 'wholeship_helios_span_reach',
    assetId: 'SF_WHOLESHIP_HELIOS_SPAN_REACH',
    category: 'wholeships',
    priority: 'P1',
    file: 'wholeships/helios_span_reach.glb',
    tris: 48154,
    textureSize: 1024,
    tintable: SPAN_TINT,
    hooks: SPAN_HOOKS,
    sockets: SPAN_SOCKETS,
    mount: 'origin',
    bounds: {
      min: [-14.6625, -2.3, -4.46],
      max: [14.15, 3.2522, 4.46],
      dimensionsM: [28.8125, 5.5522, 8.92],
    },
    note: 'PQ-193.09 — live Helios Span carrying the Reach scrap faction kit. Donor hull is the accepted Span; kit garnish remapped onto hull/mechanical. Provenance: assets/ships/foundry/fleet_breadth_20260720/variants/var_helios_span_reach_scrap_v01.glb.',
  }),
  row({
    id: 'wholeship_wasp_free_militia',
    assetId: 'SF_WASP_FREE_MILITIA',
    category: 'wholeships',
    priority: 'P1',
    file: 'wholeships/wasp_free_militia.glb',
    tris: 12994,
    textureSize: 1024,
    tintable: WASP_TINT,
    hooks: [],
    sockets: WASP_SOCKETS,
    mount: 'origin',
    bounds: {
      min: [-10, -1.38, -8.0818],
      max: [12, 2.3247, 8.0818],
      dimensionsM: [22, 3.7047, 16.1637],
    },
    note: 'PQ-193.09 — live Wasp carrying the Free militia faction kit. Donor hull is the accepted production Wasp; pirate Wasp slot untouched. Provenance: assets/ships/foundry/fleet_breadth_20260720/variants/var_wasp_free_militia_v01.glb.',
  }),
  row({
    id: 'wholeship_wasp_mts_escort',
    assetId: 'SF_WASP_MTS_ESCORT',
    category: 'wholeships',
    priority: 'P1',
    file: 'wholeships/wasp_mts_escort.glb',
    tris: 12974,
    textureSize: 1024,
    tintable: WASP_TINT,
    hooks: [],
    sockets: WASP_SOCKETS,
    mount: 'origin',
    bounds: {
      min: [-10, -1.38, -8.0818],
      max: [12, 4.8603, 8.0818],
      dimensionsM: [22, 6.2403, 16.1637],
    },
    note: 'PQ-193.09 — live Wasp carrying the MTS escort faction kit. Donor hull is the accepted production Wasp; pirate Wasp slot untouched. Provenance: assets/ships/foundry/fleet_breadth_20260720/variants/var_wasp_mts_escort_v01.glb.',
  }),
  row({
    id: 'wholeship_wasp_scn_patrol',
    assetId: 'SF_WASP_SCN_PATROL',
    category: 'wholeships',
    priority: 'P1',
    file: 'wholeships/wasp_scn_patrol.glb',
    tris: 12126,
    textureSize: 1024,
    tintable: WASP_TINT,
    hooks: [],
    sockets: WASP_SOCKETS,
    mount: 'origin',
    bounds: {
      min: [-10, -1.38, -8.0818],
      max: [12, 2.38, 8.0818],
      dimensionsM: [22, 3.76, 16.1637],
    },
    note: 'PQ-193.09 — live Wasp carrying the SCN patrol faction kit. Donor hull is the accepted production Wasp; pirate Wasp slot untouched. Provenance: assets/ships/foundry/fleet_breadth_20260720/variants/var_wasp_scn_patrol_v01.glb.',
  }),
];

const PLACES = [
  row({
    id: 'var_station_trade_hub_free_overlay_v01',
    assetId: 'SF_PLACE_STATION_TRADE_HUB_FREE_OVERLAY',
    category: 'places',
    priority: 'P1',
    file: 'places/var_station_trade_hub_free_overlay_v01.glb',
    tris: 3024,
    textureSize: 1024,
    tintable: { hull: 'SF_HullMid_K0PBR', mechanical: 'SF_Machinery_K0PBR' },
    hooks: [],
    sockets: [],
    mount: 'origin',
    bounds: {
      min: [-67.7152, 14.535, -59.5856],
      max: [65.4314, 39.6919, 72.6036],
      dimensionsM: [133.1466, 25.1569, 132.1893],
    },
    note: 'PQ-193.09 — Free-ports trade-hub overlay (habitat pods, junk truss, panel skirts) authored at donor origin on place_station_trade_hub. Existing overlay identity. Provenance: assets/ships/foundry/fleet_breadth_20260720/variants/var_station_trade_hub_free_overlay_v01.glb.',
  }),
  row({
    id: 'var_station_trade_hub_mts_overlay_v01',
    assetId: 'SF_PLACE_STATION_TRADE_HUB_MTS_OVERLAY',
    category: 'places',
    priority: 'P1',
    file: 'places/var_station_trade_hub_mts_overlay_v01.glb',
    tris: 4800,
    textureSize: 1024,
    tintable: { hull: 'SF_HullMid_K0PBR', mechanical: 'SF_Machinery_K0PBR' },
    hooks: [],
    sockets: [],
    mount: 'origin',
    bounds: {
      min: [-73.3576, 26.677, -66.2221],
      max: [79.3566, 49.227, 66.2181],
      dimensionsM: [152.7142, 22.55, 132.4401],
    },
    note: 'PQ-193.09 — MTS trade-hub overlay (commerce rings, clamshell crowns, holo ads) authored at donor origin on place_station_trade_hub. Existing overlay identity. Provenance: assets/ships/foundry/fleet_breadth_20260720/variants/var_station_trade_hub_mts_overlay_v01.glb.',
  }),
  row({
    id: 'var_station_trade_hub_scn_overlay_v01',
    assetId: 'SF_PLACE_STATION_TRADE_HUB_SCN_OVERLAY',
    category: 'places',
    priority: 'P1',
    file: 'places/var_station_trade_hub_scn_overlay_v01.glb',
    tris: 2756,
    textureSize: 1024,
    tintable: { hull: 'SF_HullMid_K0PBR', mechanical: 'SF_Machinery_K0PBR' },
    hooks: [],
    sockets: [],
    mount: 'origin',
    bounds: {
      min: [-94.4005, 11.2307, -65.402],
      max: [76.3995, 56.177, 65.398],
      dimensionsM: [170.8, 44.9463, 130.8],
    },
    note: 'PQ-193.09 — SCN trade-hub overlay (armor cladding, corner bastions, customs booms) authored at donor origin on place_station_trade_hub. Existing overlay identity. Provenance: assets/ships/foundry/fleet_breadth_20260720/variants/var_station_trade_hub_scn_overlay_v01.glb.',
  }),
];

function upsertAfter(id, part) {
  const existing = manifest.parts.findIndex((p) => p.id === part.id);
  if (existing >= 0) {
    manifest.parts[existing] = part;
    return;
  }
  const after = manifest.parts.findIndex((p) => p.id === id);
  if (after >= 0) manifest.parts.splice(after + 1, 0, part);
  else manifest.parts.push(part);
}

upsertAfter('wholeship_helios_span', SHIPS[0]);
upsertAfter('wholeship_helios_span_dmc', SHIPS[1]);
upsertAfter('wholeship_helios_span_mts', SHIPS[2]);
upsertAfter('wholeship_wasp_production_v1', SHIPS[3]);
upsertAfter('wholeship_wasp_free_militia', SHIPS[4]);
upsertAfter('wholeship_wasp_mts_escort', SHIPS[5]);
upsertAfter('place_station_trade_hub', PLACES[0]);
upsertAfter('var_station_trade_hub_free_overlay_v01', PLACES[1]);
upsertAfter('var_station_trade_hub_mts_overlay_v01', PLACES[2]);

const hullSlot = manifest.runtimeSlots.hull;
for (const file of SHIPS.map((p) => p.file)) {
  if (!hullSlot.includes(file)) hullSlot.push(file);
}
const placeSlot = manifest.runtimeSlots.place;
for (const file of PLACES.map((p) => p.file)) {
  if (!placeSlot.includes(file)) placeSlot.push(file);
}

writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`manifest parts=${manifest.parts.length} hullSlot=${hullSlot.length} placeSlot=${placeSlot.length}`);
console.log('added', [...SHIPS, ...PLACES].map((p) => p.id).join(', '));
