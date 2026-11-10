#!/usr/bin/env node
/**
 * Publish PQ-045 Everyday Space production props into canonical place paths.
 *
 * Finalizes the sixteen Blender-built source GLBs (bind occlusion to packed ORM),
 * copies them into `assets/ships/parts/places/`, and upserts `parts_manifest.json`
 * rows. Release encoding is a separate controller step:
 *
 *   node tools/art/build_release_parts.mjs place_cargo_pod_standard ...
 *
 * Does not hand-edit release manifests beyond the parts_manifest upsert.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FAMILY = resolve(ROOT, 'assets/incubator/everyday_space_kit/production');
const MANIFEST_PATH = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const PACKET = 'PQ-045-PROP-PROMOTION-001';

const SELECTED = Object.freeze([
  'cargo_pod_standard', 'container_rack', 'freight_platform', 'transfer_arm',
  'radiator_bank', 'slurry_tank', 'drill_platform', 'conveyor_truss',
  'extraction_mast', 'worklight_tower', 'transponder_gate', 'interdiction_buoy',
  'sensor_mast', 'scrap_cage', 'improvised_dock', 'maintenance_gantry',
]);

function json(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
function placeId(propId) {
  return `place_${propId}`;
}
function rel(id) {
  return `places/${id}.glb`;
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

async function finalizeSource(abs, report) {
  const document = await io.read(abs);
  const root = document.getRoot();
  const placeId = report.placeId;

  for (const material of root.listMaterials()) {
    const orm = material.getMetallicRoughnessTexture();
    if (orm && !material.getOcclusionTexture()) {
      material.setOcclusionTexture(orm);
      material.setOcclusionStrength(1);
    }
  }

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const vertex = [];
  let tris = 0;
  let rootNode = null;
  for (const node of root.listNodes()) {
    const name = node.getName() || '';
    if (name === placeId) rootNode = node;
    const extras = { ...(node.getExtras() || {}) };
    const sf = { ...(extras.spaceface || {}) };
    if (name.startsWith('SOCKET_')) {
      sf.socket = true;
      extras.socket = true;
    }
    if (name === 'COLLISION_HULL' || sf.collision) {
      sf.collision = true;
      sf.helper = true;
      sf.nonRender = true;
    }
    extras.spaceface = sf;
    node.setExtras(extras);

    const mesh = node.getMesh();
    if (!mesh) continue;
    const world = node.getWorldMatrix();
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      const indices = primitive.getIndices();
      if (indices) tris += Math.floor(indices.getCount() / 3);
      else if (position) tris += Math.floor(position.getCount() / 3);
      if (!position) continue;
      for (let i = 0; i < position.getCount(); i++) {
        position.getElement(i, vertex);
        const v = [
          world[0] * vertex[0] + world[4] * vertex[1] + world[8] * vertex[2] + world[12],
          world[1] * vertex[0] + world[5] * vertex[1] + world[9] * vertex[2] + world[13],
          world[2] * vertex[0] + world[6] * vertex[1] + world[10] * vertex[2] + world[14],
        ];
        for (let axis = 0; axis < 3; axis++) {
          if (v[axis] < min[axis]) min[axis] = v[axis];
          if (v[axis] > max[axis]) max[axis] = v[axis];
        }
      }
    }
  }
  if (!rootNode) {
    // Fallback: first empty root without mesh.
    rootNode = root.listNodes().find((n) => !n.getMesh() && (n.getName() || '').startsWith('place_'))
      || root.listNodes()[0];
  }
  const dimensionsM = min.map((v, i) => Number((max[i] - v).toFixed(4)));
  const lodTris = report.lodTriangles || {};
  const materials = report.materials || [];
  const sockets = report.sockets || [];
  const collision = report.collision || {};

  const spacefaceAsset = {
    contractVersion: 1,
    assetId: placeId,
    partId: placeId,
    liveId: placeId,
    slot: 'place',
    category: 'places',
    family: 'everyday_space_props',
    packet: PACKET,
    donorPropId: report.id,
    role: report.role || 'everyday_space_prop',
    forward: '+X',
    up: '+Y',
    starboard: '+Z',
    unit: 'metre',
    normalConvention: 'OpenGL',
    ormChannels: 'R=AO,G=Roughness,B=Metallic',
    textureCompression: 'PNG-source',
    textureAuthorship: 'deterministic role-classified procedural PBR maps (production builder)',
    textureSize: 512,
    deliverableRole: 'production_multi_lod',
    lods: ['lod0', 'lod1', 'lod2'],
    exportedLods: ['lod0', 'lod1', 'lod2'],
    lodTriangles: lodTris,
    triangleCount: lodTris.lod0 || tris,
    materials,
    sockets,
    collision: {
      representation: 'non_mesh_helper',
      kind: collision.kind || 'box',
      centerM: collision.centerM,
      halfExtentsM: collision.halfExtentsM,
      source: collision.source || 'evaluated_lod0_vertices',
    },
    lod0AabbSize: dimensionsM,
    wiringStatus: 'promoted_source_pending_runtime_scatter',
    claims: {
      candidateOnly: false,
      promoted: true,
      routeEvidence: false,
      performanceEvidence: false,
      g1g2g4: 'open',
    },
    sourceGenerator: 'tools/blender/build_everyday_space_props_production.py',
    finalize: { occlusionBoundToPackedOrm: true, tool: 'publish_everyday_space_props.mjs' },
  };

  const asset = root.getAsset();
  asset.extras = {
    ...(asset.extras || {}),
    assetId: placeId,
    partId: placeId,
    boundsDimensionsM: dimensionsM,
    spacefaceAsset,
  };

  for (const scene of root.listScenes()) {
    scene.setExtras({
      ...(scene.getExtras() || {}),
      assetId: placeId,
      partId: placeId,
      spacefaceAsset,
      'spaceface.authoringAxes': 'Blender X working face / Z up (kit donor)',
      'spaceface.exportAxes': 'glTF Y-up export',
    });
  }

  if (rootNode) {
    rootNode.setExtras({
      ...(rootNode.getExtras() || {}),
      spacefaceAsset,
      'spaceface.partId': placeId,
      'spaceface.assetId': placeId,
    });
  }

  await io.write(abs, document);
  return {
    tris: lodTris.lod0 || tris,
    bounds: {
      min: min.map((v) => Number(v.toFixed(4))),
      max: max.map((v) => Number(v.toFixed(4))),
      dimensionsM,
    },
  };
}

const buildReportPath = resolve(FAMILY, 'evidence/build-report.json');
if (!existsSync(buildReportPath)) {
  throw new Error('missing production build-report.json — run the Blender production builder first');
}
const buildReport = json(buildReportPath);
const reportById = new Map((buildReport.assets || []).map((row) => [row.id, row]));

const manifest = json(MANIFEST_PATH);
if (!Array.isArray(manifest.parts)) {
  throw new Error('parts_manifest.json missing parts array');
}

const promoted = [];
for (const propId of SELECTED) {
  const id = placeId(propId);
  const report = reportById.get(propId);
  const source = resolve(FAMILY, 'source', `${id}.glb`);
  if (!existsSync(source) || !report) {
    throw new Error(`${propId}: production GLB or build-report row missing`);
  }

  const { tris, bounds } = await finalizeSource(source, report);
  const canonical = resolve(ROOT, 'assets/ships/parts', rel(id));
  mkdirSync(dirname(canonical), { recursive: true });
  copyFileSync(source, canonical);
  const bytes = readFileSync(canonical).length;

  const lod0 = report.lodTriangles?.lod0 ?? tris;
  const note = [
    `${PACKET} — Everyday Space production prop from kit donor \`${propId}\`.`,
    `LOD0/1/2 tris ${report.lodTriangles?.lod0}/${report.lodTriangles?.lod1}/${report.lodTriangles?.lod2}.`,
    'Role-classified PBR (baseColor/ORM/normal); vertex-tight box collision; sockets preserved.',
    'Runtime scatter/wiring is a separate PQ-045 leaf. G1/G2/G4 independent review open.',
  ].join(' ');

  const entry = {
    id,
    category: 'places',
    priority: 'P2',
    file: rel(id),
    tris: lod0,
    bytes,
    textureSize: 512,
    tintable: {
      hull: 'Material_Struct',
      accent: 'Material_PaintTeal',
    },
    note,
    hooks: [],
    sockets: report.sockets || [],
    mount: 'origin',
    bounds,
  };

  const idx = manifest.parts.findIndex((p) => p.id === id);
  if (idx >= 0) manifest.parts[idx] = { ...manifest.parts[idx], ...entry };
  else manifest.parts.push(entry);

  promoted.push({
    id,
    propId,
    tris: lod0,
    lod: report.lodTriangles,
    bytes,
    sha256: report.sha256,
    reducing: report.lodStrictlyReducing,
  });
  console.log(`[publish] ${id}: tris=${lod0} bytes=${bytes} reducing=${report.lodStrictlyReducing}`);
}

writeJson(MANIFEST_PATH, manifest);

const receipt = {
  schema: 'spaceface.everydaySpaceProps.publish.v1',
  packet: PACKET,
  promoted,
  manifestPath: 'assets/ships/parts/parts_manifest.json',
  nextSteps: [
    'node tools/art/build_release_parts.mjs <place_ids...>',
    'runtime scatter wiring is a separate PQ-045 leaf',
  ],
};
const receiptPath = resolve(FAMILY, 'evidence/publish-receipt.json');
writeJson(receiptPath, receipt);
console.log(`[publish] wrote ${promoted.length} place props + manifest upserts`);
console.log(`[publish] receipt -> ${receiptPath}`);
