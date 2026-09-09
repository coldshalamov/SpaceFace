#!/usr/bin/env node
// Stamp asset/scene runtime identity on the nine live player bodies that already carry
// root-node extras but were never packaged. Does not compress or write release copies —
// SG-04 owns that. Prints the parts_manifest rows to splice in after the stamp.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const PARTS = resolve(ROOT, 'assets/ships/parts/wholeships');

const SHIPS = Object.freeze([
  { id: 'mule', defId: 'ship_mule', role: 'freighter', name: 'Mule' },
  { id: 'hornet', defId: 'ship_hornet', role: 'interceptor', name: 'Hornet' },
  { id: 'ironback', defId: 'ship_ironback', role: 'mining_barge', name: 'Ironback' },
  { id: 'bastion', defId: 'ship_bastion', role: 'corvette', name: 'Bastion' },
  { id: 'atlas', defId: 'ship_atlas', role: 'heavy_hauler', name: 'Atlas' },
  { id: 'ranger', defId: 'ship_ranger', role: 'explorer', name: 'Ranger' },
  { id: 'warden', defId: 'ship_warden', role: 'gunship', name: 'Warden' },
  { id: 'colossus', defId: 'ship_colossus', role: 'battlecruiser', name: 'Colossus' },
  { id: 'leviathan', defId: 'ship_leviathan', role: 'flagship', name: 'Leviathan' },
]);

const SOCKETS = Object.freeze([
  'SOCKET_Weapon_Front',
  'SOCKET_Mining_Front',
  'SOCKET_Engine_Main',
  'SOCKET_Trail_Main',
  'SOCKET_Trail_Port',
  'SOCKET_Trail_Starboard',
  'SOCKET_Utility_Dorsal',
  'SOCKET_Cargo_Ventral',
  'SOCKET_Camera_Focus',
  'SOCKET_RCS_Port',
  'SOCKET_RCS_Starboard',
]);

const TINTABLE = Object.freeze({
  hull: 'Material_Hull',
  dark: 'Material_Armor',
  mechanical: 'Material_Mechanical',
  accent: 'Material_Accent',
  warning: 'Material_Warning',
  canopy: 'Material_Canopy',
  thruster: 'Material_Thruster',
});

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function meshBounds(document) {
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      const localMin = pos.getMin([]);
      const localMax = pos.getMax([]);
      for (let i = 0; i < 3; i++) {
        if (localMin[i] < min[i]) min[i] = localMin[i];
        if (localMax[i] > max[i]) max[i] = localMax[i];
      }
    }
  }
  if (!Number.isFinite(min[0])) return null;
  return {
    min: min.map(round3),
    max: max.map(round3),
    dimensionsM: [max[0] - min[0], max[1] - min[1], max[2] - min[2]].map(round3),
  };
}

function triangleCount(document) {
  let tris = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      if (indices) tris += Math.floor(indices.getCount() / 3);
    }
  }
  return tris;
}

function listedSockets(document) {
  const names = document.getRoot().listNodes().map((node) => node.getName() || '');
  return SOCKETS.filter((name) => names.includes(name));
}

function contractFor(ship, existing = {}) {
  return {
    contractVersion: 2,
    assetId: `SF_${ship.id.toUpperCase()}_PRODUCTION_V1`,
    partId: `${ship.id}_production_v1`,
    packet: 'PQ-136-FLEET-RENDER-PACKAGE',
    family: 'fleet_player_bodies_v1',
    role: ship.role,
    lod: 'lod0',
    slot: 'hull',
    category: 'wholeships',
    forward: '+X',
    up: '+Y',
    starboard: '+Z',
    unit: 'metre',
    normalConvention: 'OpenGL',
    ormChannels: 'R=AO,G=Roughness,B=Metallic',
    textureCompression: 'PNG-source',
    embeddedPlume: false,
    wiringStatus: `live_player_${ship.id}`,
    ...existing,
    assetId: `SF_${ship.id.toUpperCase()}_PRODUCTION_V1`,
    partId: `${ship.id}_production_v1`,
    slot: 'hull',
    category: 'wholeships',
    lod: existing.lod || 'lod0',
  };
}

async function stamp(ship) {
  const file = `${ship.id}_production_v1.glb`;
  const abs = resolve(PARTS, file);
  if (!existsSync(abs)) throw new Error(`missing ${file}`);
  const document = await io.read(abs);
  const root = document.getRoot();
  const asset = root.getAsset();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  if (!scene) throw new Error(`${file}: no scene`);
  const sceneRoots = scene.listChildren();
  const existing = sceneRoots[0]?.getExtras()?.spacefaceAsset || {};
  const sf = contractFor(ship, existing);

  asset.extras = {
    ...(asset.extras || {}),
    assetId: sf.assetId,
    partId: sf.partId,
    category: 'wholeships',
    spacefaceAsset: sf,
  };
  scene.setExtras({
    ...(scene.getExtras() || {}),
    spacefaceAsset: sf,
  });
  for (const node of sceneRoots) {
    const extras = node.getExtras() || {};
    node.setExtras({
      ...extras,
      spacefaceAsset: {
        ...(extras.spacefaceAsset || {}),
        ...sf,
      },
    });
  }

  await io.write(abs, document);
  const bytes = readFileSync(abs).byteLength;
  const sockets = listedSockets(document);
  const missingSockets = SOCKETS.filter((name) => !sockets.includes(name));
  if (missingSockets.length) {
    throw new Error(`${file}: missing sockets ${missingSockets.join(', ')}`);
  }
  return {
    id: `wholeship_${ship.id}_production_v1`,
    assetId: sf.assetId,
    category: 'wholeships',
    priority: 'P0',
    file: `wholeships/${file}`,
    lodFamily: {
      lod0: `wholeships/${file}`,
      lod1: `wholeships/${ship.id}_production_v1_lod1.glb`,
      lod2: `wholeships/${ship.id}_production_v1_lod2.glb`,
    },
    status: 'integration_candidate',
    wiringStatus: `live_player_${ship.id}`,
    tris: triangleCount(document),
    bytes,
    textureSize: 1024,
    tintable: TINTABLE,
    hooks: [],
    sockets: [...SOCKETS],
    mount: 'origin',
    bounds: meshBounds(document),
    note: `Fleet remaster production ${ship.name}. Live player ${ship.role.replace(/_/g, ' ')}. Authored LOD0/1/2 on disk; LOD0 is the packaged live body. Not self-accepted.`,
  };
}

const rows = [];
for (const ship of SHIPS) rows.push(await stamp(ship));
writeFileSync(
  resolve(ROOT, 'tools/art/stamp_fleet_player_body_identity.rows.json'),
  `${JSON.stringify(rows, null, 2)}\n`,
);
console.log(JSON.stringify(rows.map((row) => ({
  id: row.id,
  bytes: row.bytes,
  tris: row.tris,
  bounds: row.bounds?.dimensionsM,
})), null, 2));
console.log('stamped 9 source bodies; rows at tools/art/stamp_fleet_player_body_identity.rows.json');
