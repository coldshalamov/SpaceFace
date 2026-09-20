#!/usr/bin/env node
// PQ-193.09: graft foundry faction kits onto live Span/Wasp, stamp the three
// trade-hub overlays. Hitch freeze untouched. Does not rewrite foreign files.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';

const ROOT = resolve(import.meta.dirname || '.');
const UV_SCALE = 0.08;

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

function boxUvAndTangents(document, prim) {
  const pos = prim.getAttribute('POSITION');
  const nrm = prim.getAttribute('NORMAL');
  if (!pos || !nrm) return;
  const buffer = pos.getBuffer() || document.getRoot().listBuffers()[0];
  const count = pos.getCount();
  const needUv = !prim.getAttribute('TEXCOORD_0');
  const uv = needUv ? new Float32Array(count * 2) : null;
  const tan = new Float32Array(count * 4);
  const p = [0, 0, 0];
  const n = [0, 0, 0];
  for (let i = 0; i < count; i++) {
    pos.getElement(i, p);
    nrm.getElement(i, n);
    const ax = Math.abs(n[0]);
    const ay = Math.abs(n[1]);
    const az = Math.abs(n[2]);
    let tx = 1;
    let ty = 0;
    let tz = 0;
    if (ax >= ay && ax >= az) {
      if (uv) {
        uv[i * 2] = p[1] * UV_SCALE;
        uv[i * 2 + 1] = p[2] * UV_SCALE;
      }
      tx = 0;
      ty = 1;
      tz = 0;
    } else if (ay >= ax && ay >= az) {
      if (uv) {
        uv[i * 2] = p[0] * UV_SCALE;
        uv[i * 2 + 1] = p[2] * UV_SCALE;
      }
    } else if (uv) {
      uv[i * 2] = p[0] * UV_SCALE;
      uv[i * 2 + 1] = p[1] * UV_SCALE;
    }
    const ndot = n[0] * tx + n[1] * ty + n[2] * tz;
    tx -= n[0] * ndot;
    ty -= n[1] * ndot;
    tz -= n[2] * ndot;
    const len = Math.hypot(tx, ty, tz) || 1;
    tan[i * 4] = tx / len;
    tan[i * 4 + 1] = ty / len;
    tan[i * 4 + 2] = tz / len;
    tan[i * 4 + 3] = 1;
  }
  if (needUv) {
    prim.setAttribute('TEXCOORD_0', document.createAccessor('box_uv')
      .setType('VEC2')
      .setArray(uv)
      .setBuffer(buffer));
  }
  if (!prim.getAttribute('TANGENT')) {
    prim.setAttribute('TANGENT', document.createAccessor('box_tan')
      .setType('VEC4')
      .setArray(tan)
      .setBuffer(buffer));
  }
}

function copyAccessor(src, dstDoc, buffer) {
  if (!src) return null;
  const array = src.getArray();
  const copy = dstDoc.createAccessor(src.getName() || '')
    .setType(src.getType())
    .setBuffer(buffer);
  if (array) copy.setArray(array.slice());
  if (src.getNormalized && src.getNormalized()) copy.setNormalized(true);
  return copy;
}

function copyTexture(src, dstDoc) {
  if (!src) return null;
  const tex = dstDoc.createTexture(src.getName() || 'tex');
  const image = src.getImage();
  if (image) tex.setImage(image);
  const mime = src.getMimeType();
  if (mime) tex.setMimeType(mime);
  return tex;
}

function copyMaterialFactors(src, dstDoc, name) {
  const dst = dstDoc.createMaterial(name || src.getName() || 'mat');
  dst.setBaseColorFactor(src.getBaseColorFactor())
    .setMetallicFactor(src.getMetallicFactor())
    .setRoughnessFactor(src.getRoughnessFactor())
    .setEmissiveFactor(src.getEmissiveFactor())
    .setAlphaMode(src.getAlphaMode())
    .setDoubleSided(src.getDoubleSided());
  return dst;
}

function remapKitMaterial(matName, liveMats, emissive) {
  if (matName === 'KitMat_Paint') return liveMats.get('Material_Hull') || liveMats.get('SF_HullMid_K0PBR');
  if (matName === 'KitMat_Steel' || matName === 'KitMat_Rubber') {
    return liveMats.get('Material_Mechanical')
      || liveMats.get('Material_Armor')
      || liveMats.get('SF_Machinery_K0PBR');
  }
  if (matName === 'KitMat_Emissive') return emissive;
  return liveMats.get(matName) || null;
}

function graftVarNodes(liveDoc, kitDoc, shipRoot, liveMats) {
  const buffer = liveDoc.getRoot().listBuffers()[0] || liveDoc.createBuffer();
  const kitEmissive = kitDoc.getRoot().listMaterials().find((m) => m.getName() === 'KitMat_Emissive');
  let emissive = liveMats.get('KitMat_Emissive') || null;
  if (kitEmissive && !emissive) {
    emissive = copyMaterialFactors(kitEmissive, liveDoc, 'KitMat_Emissive');
    liveMats.set('KitMat_Emissive', emissive);
  }
  const grafted = [];
  for (const node of kitDoc.getRoot().listNodes()) {
    const name = String(node.getName() || '');
    if (!name.startsWith('VAR_')) continue;
    const srcMesh = node.getMesh();
    if (!srcMesh) continue;
    const dstMesh = liveDoc.createMesh(name);
    for (const prim of srcMesh.listPrimitives()) {
      const dstPrim = liveDoc.createPrimitive();
      for (const semantic of prim.listSemantics()) {
        dstPrim.setAttribute(semantic, copyAccessor(prim.getAttribute(semantic), liveDoc, buffer));
      }
      if (prim.getIndices()) dstPrim.setIndices(copyAccessor(prim.getIndices(), liveDoc, buffer));
      const srcMat = prim.getMaterial();
      const matName = srcMat?.getName() || '';
      const mapped = remapKitMaterial(matName, liveMats, emissive);
      if (mapped) dstPrim.setMaterial(mapped);
      if (matName !== 'KitMat_Emissive') boxUvAndTangents(liveDoc, dstPrim);
      dstMesh.addPrimitive(dstPrim);
    }
    const lodName = name.startsWith('LOD0_') ? name : `LOD0_${name}`;
    const dstNode = liveDoc.createNode(lodName);
    dstNode.setMesh(dstMesh);
    dstMesh.setName(lodName);
    dstNode.setTranslation(node.getTranslation());
    dstNode.setRotation(node.getRotation());
    dstNode.setScale(node.getScale());
    shipRoot.addChild(dstNode);
    grafted.push(lodName);
  }
  return grafted;
}

function countTris(document) {
  let tris = 0;
  let hull = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    const hullish = /hull/i.test(mesh.getName() || '');
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const n = idx ? Math.floor(idx.getCount() / 3) : 0;
      tris += n;
      if (hullish) hull += n;
    }
  }
  return { tris, hull };
}

function aabb(document) {
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  const p = [0, 0, 0];
  for (const node of document.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const name = String(node.getName() || '').toUpperCase();
    if (name === 'COLLISION_HULL' || name.startsWith('LOD1_') || name.startsWith('LOD2_')) continue;
    const matrix = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      if (!pos) continue;
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, p);
        const x = matrix[0] * p[0] + matrix[4] * p[1] + matrix[8] * p[2] + matrix[12];
        const y = matrix[1] * p[0] + matrix[5] * p[1] + matrix[9] * p[2] + matrix[13];
        const z = matrix[2] * p[0] + matrix[6] * p[1] + matrix[10] * p[2] + matrix[14];
        min = [Math.min(min[0], x), Math.min(min[1], y), Math.min(min[2], z)];
        max = [Math.max(max[0], x), Math.max(max[1], y), Math.max(max[2], z)];
      }
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

function stamp(document, scene, rootNode, extras) {
  const asset = document.getRoot().getAsset();
  asset.extras = { ...(asset.extras || {}), ...extras, spacefaceAsset: extras.spacefaceAsset };
  scene.setExtras({ ...(scene.getExtras() || {}), spacefaceAsset: extras.spacefaceAsset });
  if (rootNode) {
    rootNode.setExtras({ ...(rootNode.getExtras() || {}), spacefaceAsset: extras.spacefaceAsset });
  }
}

async function writeAndPrune(document, outRel) {
  await document.transform(prune({
    keepLeaves: true,
    keepAttributes: true,
    propertyTypes: [PropertyType.MATERIAL, PropertyType.TEXTURE, PropertyType.ACCESSOR],
  }));
  const bytes = await io.writeBinary(document);
  const out = resolve(ROOT, outRel);
  writeFileSync(out, bytes);
  return { out, bytes: bytes.length, ...countTris(document), bounds: aabb(document) };
}

async function packageShipKit({
  liveRel, kitRel, outRel, assetId, partId, rootName, role, kitPrefix,
}) {
  const live = await io.read(resolve(ROOT, liveRel));
  const kit = await io.read(resolve(ROOT, kitRel));
  const liveStamp = live.getRoot().getAsset().extras?.spacefaceAsset || {};
  const scene = live.getRoot().getDefaultScene() || live.getRoot().listScenes()[0];
  const shipRoot = live.getRoot().listNodes().find((n) => n.getName() === (
    liveRel.includes('wasp') ? 'WASP_PRODUCTION_V1_LOD0_ROOT' : 'SF_M4_HELIOS_SPAN_ROOT'
  ));
  if (!shipRoot) throw new Error(`missing live root in ${liveRel}`);
  const liveMats = new Map(live.getRoot().listMaterials().map((m) => [m.getName(), m]));
  const grafted = graftVarNodes(live, kit, shipRoot, liveMats);
  if (!grafted.length) throw new Error(`no VAR_ nodes grafted from ${kitRel}`);
  shipRoot.setName(rootName);
  const extras = {
    ...liveStamp,
    contractVersion: liveStamp.contractVersion || 2,
    assetId,
    partId,
    slot: 'hull',
    category: 'wholeships',
    role,
    liveRuntimeFile: outRel.replace(/^assets\/ships\/parts\//, ''),
    factorOnlyMaterials: [
      ...new Set([...(liveStamp.factorOnlyMaterials || []), 'KitMat_Emissive']),
    ],
    packet: 'PQ-193.09',
    wiringStatus: 'live_faction_kit',
    sourceRole: 'whole-ship hull',
    kitPrefix,
    kitNodeCount: grafted.length,
  };
  stamp(live, scene, shipRoot, {
    spacefaceAsset: extras,
    assetId,
    partId,
    category: 'wholeships',
    unit: 'metre',
    upAxis: '+Y',
    forwardAxis: '+X',
    starboardAxis: '+Z',
    sourceRole: 'whole-ship hull',
  });
  const result = await writeAndPrune(live, outRel);
  return { ...result, grafted, assetId, rootName };
}

async function packageOverlay({ kitRel, outRel, assetId, partId, rootName, factionId, hub }) {
  const overlay = await io.read(resolve(ROOT, kitRel));
  const scene = overlay.getRoot().getDefaultScene() || overlay.getRoot().listScenes()[0];
  const buffer = overlay.getRoot().listBuffers()[0] || overlay.createBuffer();
  const hubMats = new Map(hub.getRoot().listMaterials().map((m) => [m.getName(), m]));
  const liveMats = new Map();
  for (const [name, src] of [
    ['SF_HullMid_K0PBR', hubMats.get('SF_HullMid_K0PBR')],
    ['SF_Machinery_K0PBR', hubMats.get('SF_Machinery_K0PBR')],
    ['SF_CyanEmission', hubMats.get('SF_CyanEmission')],
  ]) {
    if (src) liveMats.set(name, copyMaterialFactors(src, overlay, name));
  }
  liveMats.set('Material_Hull', liveMats.get('SF_HullMid_K0PBR'));
  liveMats.set('Material_Mechanical', liveMats.get('SF_Machinery_K0PBR'));
  const kitEmissive = overlay.getRoot().listMaterials().find((m) => m.getName() === 'KitMat_Emissive');
  const emissive = kitEmissive
    ? copyMaterialFactors(kitEmissive, overlay, 'KitMat_Emissive')
    : (liveMats.get('SF_CyanEmission') || null);
  if (emissive) liveMats.set('KitMat_Emissive', emissive);

  const root = overlay.createNode(rootName);
  scene.addChild(root);
  const grafted = [];
  for (const node of [...overlay.getRoot().listNodes()]) {
    const name = String(node.getName() || '');
    if (!name.startsWith('VAR_')) continue;
    if (node === root) continue;
    const lodName = name.startsWith('LOD0_') ? name : `LOD0_${name}`;
    node.setName(lodName);
    const mesh = node.getMesh();
    if (mesh) mesh.setName(lodName);
    for (const prim of mesh ? mesh.listPrimitives() : []) {
      const matName = prim.getMaterial()?.getName() || '';
      const mapped = remapKitMaterial(matName, liveMats, emissive);
      if (mapped) prim.setMaterial(mapped);
      if (matName !== 'KitMat_Emissive') boxUvAndTangents(overlay, prim);
    }
    if (node.getParentNode() !== root) root.addChild(node);
    grafted.push(lodName);
  }
  if (!grafted.length) throw new Error(`no VAR_ nodes in ${kitRel}`);

  const extras = {
    contractVersion: 2,
    assetId,
    partId,
    liveId: partId,
    slot: 'place',
    forward: '+X',
    up: '+Y',
    starboard: '+Z',
    unit: 'metre',
    normalConvention: 'OpenGL',
    ormChannels: 'R=AO,G=Roughness,B=Metallic',
    textureCompression: 'PNG-source',
    factorOnlyMaterials: [
      'KitMat_Emissive',
      'SF_CyanEmission',
      'SF_HullMid_K0PBR',
      'SF_Machinery_K0PBR',
    ],
    packet: 'PQ-193.09',
    intendedFaction: factionId,
    wiringStatus: 'live_trade_hub_overlay',
    sourceRole: 'place overlay',
    kitNodeCount: grafted.length,
  };
  stamp(overlay, scene, root, {
    spacefaceAsset: extras,
    assetId,
    partId,
    category: 'places',
    unit: 'metre',
    upAxis: '+Y',
    forwardAxis: '+X',
    starboardAxis: '+Z',
  });
  const result = await writeAndPrune(overlay, outRel);
  return { ...result, grafted, assetId, rootName, bufferBytes: buffer.getArray?.()?.length };
}

const SPAN_KITS = [
  {
    kitRel: 'assets/ships/foundry/fleet_breadth_20260720/variants/var_helios_span_dmc_orebox_v01.glb',
    outRel: 'assets/ships/parts/wholeships/helios_span_dmc.glb',
    assetId: 'SF_WHOLESHIP_HELIOS_SPAN_DMC',
    partId: 'wholeship_helios_span_dmc',
    rootName: 'SF_M4_HELIOS_SPAN_DMC_ROOT',
    role: 'hauler_dmc',
    kitPrefix: 'VAR_DMC_',
    liveRel: 'assets/ships/parts/wholeships/helios_span.glb',
  },
  {
    kitRel: 'assets/ships/foundry/fleet_breadth_20260720/variants/var_helios_span_mts_sealed_v01.glb',
    outRel: 'assets/ships/parts/wholeships/helios_span_mts.glb',
    assetId: 'SF_WHOLESHIP_HELIOS_SPAN_MTS',
    partId: 'wholeship_helios_span_mts',
    rootName: 'SF_M4_HELIOS_SPAN_MTS_ROOT',
    role: 'hauler_mts',
    kitPrefix: 'VAR_MTS_',
    liveRel: 'assets/ships/parts/wholeships/helios_span.glb',
  },
  {
    kitRel: 'assets/ships/foundry/fleet_breadth_20260720/variants/var_helios_span_reach_scrap_v01.glb',
    outRel: 'assets/ships/parts/wholeships/helios_span_reach.glb',
    assetId: 'SF_WHOLESHIP_HELIOS_SPAN_REACH',
    partId: 'wholeship_helios_span_reach',
    rootName: 'SF_M4_HELIOS_SPAN_REACH_ROOT',
    role: 'hauler_reach',
    kitPrefix: 'VAR_REACH_',
    liveRel: 'assets/ships/parts/wholeships/helios_span.glb',
  },
];

const WASP_KITS = [
  {
    kitRel: 'assets/ships/foundry/fleet_breadth_20260720/variants/var_wasp_free_militia_v01.glb',
    outRel: 'assets/ships/parts/wholeships/wasp_free_militia.glb',
    assetId: 'SF_WASP_FREE_MILITIA',
    partId: 'wholeship_wasp_free_militia',
    rootName: 'WASP_FREE_MILITIA_ROOT',
    role: 'patrol_free',
    kitPrefix: 'VAR_FREE_',
    liveRel: 'assets/ships/parts/wholeships/wasp_production_v1.glb',
  },
  {
    kitRel: 'assets/ships/foundry/fleet_breadth_20260720/variants/var_wasp_mts_escort_v01.glb',
    outRel: 'assets/ships/parts/wholeships/wasp_mts_escort.glb',
    assetId: 'SF_WASP_MTS_ESCORT',
    partId: 'wholeship_wasp_mts_escort',
    rootName: 'WASP_MTS_ESCORT_ROOT',
    role: 'escort_mts',
    kitPrefix: 'VAR_MTS_',
    liveRel: 'assets/ships/parts/wholeships/wasp_production_v1.glb',
  },
  {
    kitRel: 'assets/ships/foundry/fleet_breadth_20260720/variants/var_wasp_scn_patrol_v01.glb',
    outRel: 'assets/ships/parts/wholeships/wasp_scn_patrol.glb',
    assetId: 'SF_WASP_SCN_PATROL',
    partId: 'wholeship_wasp_scn_patrol',
    rootName: 'WASP_SCN_PATROL_ROOT',
    role: 'patrol_scn',
    kitPrefix: 'VAR_SCN_',
    liveRel: 'assets/ships/parts/wholeships/wasp_production_v1.glb',
  },
];

const OVERLAYS = [
  {
    kitRel: 'assets/ships/foundry/fleet_breadth_20260720/variants/var_station_trade_hub_free_overlay_v01.glb',
    outRel: 'assets/ships/parts/places/var_station_trade_hub_free_overlay_v01.glb',
    assetId: 'SF_PLACE_STATION_TRADE_HUB_FREE_OVERLAY',
    partId: 'var_station_trade_hub_free_overlay_v01',
    rootName: 'SF_TRADE_HUB_FREE_OVERLAY_ROOT',
    factionId: 'faction_free',
  },
  {
    kitRel: 'assets/ships/foundry/fleet_breadth_20260720/variants/var_station_trade_hub_mts_overlay_v01.glb',
    outRel: 'assets/ships/parts/places/var_station_trade_hub_mts_overlay_v01.glb',
    assetId: 'SF_PLACE_STATION_TRADE_HUB_MTS_OVERLAY',
    partId: 'var_station_trade_hub_mts_overlay_v01',
    rootName: 'SF_TRADE_HUB_MTS_OVERLAY_ROOT',
    factionId: 'faction_mts',
  },
  {
    kitRel: 'assets/ships/foundry/fleet_breadth_20260720/variants/var_station_trade_hub_scn_overlay_v01.glb',
    outRel: 'assets/ships/parts/places/var_station_trade_hub_scn_overlay_v01.glb',
    assetId: 'SF_PLACE_STATION_TRADE_HUB_SCN_OVERLAY',
    partId: 'var_station_trade_hub_scn_overlay_v01',
    rootName: 'SF_TRADE_HUB_SCN_OVERLAY_ROOT',
    factionId: 'faction_scn',
  },
];

const reports = [];
const overlaysOnly = process.argv.includes('--overlays-only');
if (!overlaysOnly) {
  for (const spec of [...SPAN_KITS, ...WASP_KITS]) {
    const result = await packageShipKit(spec);
    reports.push({ kind: 'ship', ...result, file: spec.outRel });
    console.log(JSON.stringify({ kind: 'ship', file: spec.outRel, ...result, grafted: result.grafted.length }, null, 2));
  }
}

const hub = await io.read(resolve(ROOT, 'assets/ships/parts/places/place_station_trade_hub.glb'));
for (const spec of OVERLAYS) {
  const result = await packageOverlay({ ...spec, hub });
  reports.push({ kind: 'overlay', ...result, file: spec.outRel });
  console.log(JSON.stringify({ kind: 'overlay', file: spec.outRel, assetId: result.assetId, bytes: result.bytes, tris: result.tris, grafted: result.grafted.length, bounds: result.bounds }, null, 2));
}

writeFileSync(resolve(ROOT, 'scratch-pq19309-prepare-report.json'), `${JSON.stringify(reports, null, 2)}\n`);
console.log('wrote scratch-pq19309-prepare-report.json');
