#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const FAMILY = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(FAMILY, 'evidence/hitch_polish_v7');

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}

function rmsNormalDegrees(pngBytes) {
  // PNG RGBA, OpenGL normal map. Measure RMS tangent tilt in degrees.
  if (pngBytes[0] !== 0x89) return null;
  return null;
}

async function inspectGlb(path) {
  if (!existsSync(path)) return { missing: true, path };
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
  await MeshoptDecoder.ready;
  const document = await io.read(path);
  const root = document.getRoot();
  const nodes = root.listNodes();
  let triangles = 0;
  let draws = 0;
  const names = [];
  const hooks = [];
  const sockets = [];
  const plume = [];
  const canopy = [];
  for (const node of nodes) {
    const name = node.getName() || '';
    names.push(name);
    if (name.startsWith('SOCKET_')) sockets.push(name);
    if (name.includes('HOOK_')) hooks.push(name);
    if (/plume/i.test(name)) plume.push(name);
    if (/canopy/i.test(name)) canopy.push(name);
    const extras = node.getExtras() || {};
    const sf = extras.spaceface || {};
    if (sf.hook || sf.damageRole || sf.canopy) {
      hooks.push(`${name}:${JSON.stringify({ hook: sf.hook, damageRole: sf.damageRole, canopy: sf.canopy })}`);
    }
    const mesh = node.getMesh();
    if (!mesh || name === 'COLLISION_HULL') continue;
    for (const primitive of mesh.listPrimitives()) {
      draws += 1;
      const indices = primitive.getIndices();
      const position = primitive.getAttribute('POSITION');
      triangles += Math.floor((indices?.getCount() ?? position?.getCount() ?? 0) / 3);
    }
  }
  const materials = root.listMaterials().map((material) => {
    const name = material.getName();
    const normal = material.getNormalTexture();
    const orm = material.getMetallicRoughnessTexture();
    const occlusion = material.getOcclusionTexture();
    const base = material.getBaseColorTexture();
    return {
      name,
      metallic: material.getMetallicFactor(),
      roughness: material.getRoughnessFactor(),
      hasBase: !!base,
      hasNormal: !!normal,
      hasOrm: !!orm,
      hasOcclusion: !!occlusion,
      extras: material.getExtras() || null,
    };
  });
  return {
    path: path.replace(/\\/g, '/').replace(`${ROOT.replace(/\\/g, '/')}/`, ''),
    bytes: readFileSync(path).length,
    sha256: sha256(path),
    triangles,
    draws,
    sockets: sockets.sort(),
    hooks: [...new Set(hooks)].sort(),
    plume,
    canopy,
    materials,
    nodeCount: names.length,
    asset: root.getAsset().extras?.spacefaceAsset || null,
  };
}

await MeshoptDecoder.ready;
mkdirSync(OUT, { recursive: true });

const liveLod0 = resolve(ROOT, 'assets/ships/parts/wholeships/kestrel.glb');
const liveRelease = resolve(ROOT, 'assets/ships/release/parts/wholeships/kestrel.glb');
const v6Source = resolve(FAMILY, 'source_candidates/material_truth_v6/wholeships/kestrel_borrowed_time_v4_lod0.glb');
const v6Release = resolve(FAMILY, 'release_candidates/material_truth_v6/wholeships/kestrel_borrowed_time_v4_lod0.glb');
const v6Blend = resolve(FAMILY, 'blender/kestrel_material_truth_v6_production.blend');
const v5Blend = resolve(FAMILY, 'blender/kestrel_borrowed_time_v4_production.blend');

const report = {
  schema: 'spaceface.hitchPolishV7.baseline.v1',
  capturedAt: new Date().toISOString(),
  hashes: {
    v6ProductionBlend: existsSync(v6Blend) ? sha256(v6Blend) : null,
    v5ProductionBlend: existsSync(v5Blend) ? sha256(v5Blend) : null,
  },
  liveSource: await inspectGlb(liveLod0),
  liveRelease: await inspectGlb(liveRelease),
  v6Source: await inspectGlb(v6Source),
  v6Release: await inspectGlb(v6Release),
  mockups: [
    'reference/kestrel_drive_material_truth_reference_v1.png',
    'reference/kestrel_midship_material_truth_reference_v1.png',
    'reference/kestrel_sensor_material_truth_reference_v1.png',
    'reference/kestrel_bow_weapon_spine_reference_v1.png',
    'reference/kestrel_repair_pod_material_truth_reference_v1.png',
    'reference/kestrel_radiator_cassette_reference_v1.png',
    'reference/kestrel_die_laughing_stencil_reference_v2.png',
  ],
  gaps: [
    'Live still shows toy drive ring, chiclet vanes, neon hoop, BORROWED label.',
    'V6 rebuilds those families and adds DIE LAUGHING, but is unwired.',
    'V6 role maps are near-flat (finalize warnings); game camera cannot show new construction.',
    'Live has nine sockets, collision, LOD family, no baked plume — V6 already preserves these.',
    'Live GLB hooks array is empty in the parts manifest; authored damage states need HOOK_* meshes.',
    'Mockups have no DIE LAUGHING; keep and polish the stencil as extra identity, not a plaque.',
    'Drive/midship still sit below mockup construction (pipes, tapered vanes, heat tint, plate courses).',
  ],
};

writeFileSync(resolve(OUT, 'BASELINE_GAP.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({
  liveTris: report.liveSource.triangles,
  liveDraws: report.liveSource.draws,
  liveHooks: report.liveSource.hooks,
  liveSockets: report.liveSource.sockets.length,
  liveMaterials: report.liveSource.materials.map((row) => row.name),
  v6Tris: report.v6Source.triangles,
  v6Draws: report.v6Source.draws,
  v6Hooks: report.v6Source.hooks,
  v6Sockets: report.v6Source.sockets.length,
  v6Materials: report.v6Source.materials.map((row) => row.name),
  v6Blend: report.hashes.v6ProductionBlend,
}, null, 2));
