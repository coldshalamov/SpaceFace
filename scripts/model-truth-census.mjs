#!/usr/bin/env node
// Measure every live solid the loader resolves and write src/data/modelTruthCensus.json.
// The game does not read this file until a later pass. Re-running with --check fails
// when the committed census disagrees with a fresh measurement.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dequantize } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import * as THREE from 'three';

import { asteroidColliderRadius } from '../src/data/asteroidColliders.js';
import {
  COLLISION_PROXY_MANIFESTS,
  expandProxyPrimitives,
} from '../src/data/collisionProxyManifests.js';
import {
  OUTLINE_BINS,
  applyFit,
  ballPrimitives,
  boundsOfPoints,
  buildPlanarSkin,
  craftCapsulePrimitives,
  drawFit,
  flightPlaneToleranceWu,
  gameplaySliceY,
  lodOutlineToleranceWu,
  measuredProportions,
  outlineDelta,
  radialGap,
  radialOutline,
  roundWu,
  scaleProxyPrimitives,
  silhouetteRadiusOf,
  slicePoints,
  throatOpen,
} from '../src/data/modelTruthMath.js';
import { resolveCraftProportions } from '../src/core/sg02DynamicBodyOwner.js';
import { displacementScalar, silhouetteRadius as geologySilhouetteRadius } from '../src/render/objectSpaceGeology.js';
import { PART_LIBRARY_CONTRACT, liveSolidGlbCatalog } from '../src/render/partsLibrary.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'src/data/modelTruthCensus.json');
const RELEASE_ROOT = resolve(ROOT, PART_LIBRARY_CONTRACT.releaseRoot);
const CHECK = process.argv.includes('--check');
const ONLY = (process.argv.find((arg) => arg.startsWith('--only=')) || '').slice('--only='.length);

const AST_DISPLACE = {
  ast_common_rock: { detail: 2, displace: 0.20 },
  ast_metallic: { detail: 1, displace: 0.30 },
  ast_icy: { detail: 1, displace: 0.28 },
  ast_crystalline: { detail: 1, displace: 0.45 },
  ast_gas_cloud: { detail: 1, displace: 0.40 },
  ast_rare_exotic: { detail: 2, displace: 0.32 },
};

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = stable(value[key]);
    return out;
  }
  if (typeof value === 'number') return roundWu(value);
  return value;
}

function releasePath(file) {
  if (!file) return null;
  const rel = String(file).replace(/\\/g, '/').replace(/^assets\/ships\/release\/parts\//, '');
  return resolve(RELEASE_ROOT, rel);
}

function materialRole(material) {
  if (!material) return 'other';
  const name = String(material.getName() || '').toLowerCase();
  const alpha = String(material.getAlphaMode?.() || 'OPAQUE');
  const emissive = material.getEmissiveFactor?.() || [0, 0, 0];
  const emissiveMag = Math.max(emissive[0] || 0, emissive[1] || 0, emissive[2] || 0);
  const transmission = Number(material.getTransmission?.() || 0);
  if (/glass|canopy|window|cockpit|visor/.test(name) || transmission > 0.2) return 'glass';
  if (/decal|marking|insignia|label|livery|stripe/.test(name)) return 'decal';
  if (/emissive|light|glow|lamp|signal|beacon|thruster|plume/.test(name) || (emissiveMag > 0.45 && alpha !== 'OPAQUE')) {
    return 'emissive';
  }
  if (alpha === 'BLEND') return 'other';
  return 'opaqueHull';
}

function lodOfName(name) {
  const match = String(name || '').match(/lod[\s_-]*([012])/i);
  return match ? Number(match[1]) : null;
}

function transformPoint(matrix, x, y, z) {
  return {
    x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
  };
}

function quantKey(p) {
  return `${Math.round(p.x * 1000)},${Math.round(p.y * 1000)},${Math.round(p.z * 1000)}`;
}

async function measureGlb(absPath) {
  const bytes = statSync(absPath).size;
  const doc = await io.read(absPath);
  // KHR_mesh_quantization stores int16 positions. Reading them raw inflates a buoy to
  // tens of kilometres. Dequantize first so bounds match the loader's float mesh.
  await doc.transform(dequantize());
  const root = doc.getRoot();
  const points = [];
  const lodPoints = { 1: [], 2: [] };
  let triangles = 0;
  let boundaryEdges = 0;
  const faceSamples = [];
  const edgeUse = new Map();
  const materials = [];
  const seenMat = new Set();
  const sockets = [];
  let meshHash = null;
  const hash = createHash('sha256');
  let hashed = false;

  const noteEdge = (a, b) => {
    const ka = quantKey(a);
    const kb = quantKey(b);
    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    edgeUse.set(key, (edgeUse.get(key) || 0) + 1);
  };

  for (const node of root.listNodes()) {
    const name = node.getName() || '';
    const mesh = node.getMesh();
    if (/^SOCKET_/i.test(name) && !mesh) {
      const matrix = node.getWorldMatrix();
      const p = transformPoint(matrix, 0, 0, 0);
      sockets.push({
        name,
        position: [roundWu(p.x), roundWu(p.y), roundWu(p.z)],
      });
    }
    if (!mesh) continue;
    const nodeLod = lodOfName(name) ?? lodOfName(mesh.getName());
    const matrix = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const position = prim.getAttribute('POSITION');
      if (!position) continue;
      const array = position.getArray();
      if (!array) continue;
      const indices = prim.getIndices()?.getArray() || null;
      const triCount = indices ? Math.floor(indices.length / 3) : Math.floor(array.length / 9);
      triangles += triCount;
      hash.update(Buffer.from(array.buffer, array.byteOffset, array.byteLength));
      hashed = true;
      const material = prim.getMaterial();
      const role = materialRole(material);
      const matName = material?.getName?.() || role;
      const matKey = `${matName}|${role}|${material?.getDoubleSided?.() ? 1 : 0}|${material?.getAlphaMode?.() || ''}`;
      if (!seenMat.has(matKey)) {
        seenMat.add(matKey);
        materials.push({
          name: matName,
          role,
          doubleSided: material?.getDoubleSided?.() === true,
          alphaMode: material?.getAlphaMode?.() || 'OPAQUE',
          depthWrite: role === 'opaqueHull' || role === 'glass' || role === 'decal',
          additive: role === 'emissive' && (material?.getAlphaMode?.() === 'BLEND'),
        });
      }
      const count = indices ? indices.length : Math.floor(array.length / 3);
      const at = (index) => {
        const i3 = index * 3;
        return transformPoint(matrix, array[i3], array[i3 + 1], array[i3 + 2]);
      };
      const bucket = nodeLod === 1 || nodeLod === 2 ? lodPoints[nodeLod] : points;
      const stride = Math.max(1, Math.floor((indices ? indices.length : array.length / 3) / 12000));
      for (let i = 0; i < (indices ? indices.length : array.length / 3); i += stride) {
        bucket.push(at(indices ? indices[i] : i));
      }
      const step = Math.max(1, Math.floor(triCount / 4000));
      for (let t = 0; t < triCount; t += step) {
        const ia = indices ? indices[t * 3] : t * 3;
        const ib = indices ? indices[t * 3 + 1] : t * 3 + 1;
        const ic = indices ? indices[t * 3 + 2] : t * 3 + 2;
        const a = at(ia);
        const b = at(ib);
        const c = at(ic);
        if (role === 'opaqueHull' && step === 1) {
          noteEdge(a, b);
          noteEdge(b, c);
          noteEdge(c, a);
        }
        const ux = b.x - a.x; const uy = b.y - a.y; const uz = b.z - a.z;
        const vx = c.x - a.x; const vy = c.y - a.y; const vz = c.z - a.z;
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        if (faceSamples.length < 4000) {
          faceSamples.push({
            nx, ny, nz,
            cx: (a.x + b.x + c.x) / 3,
            cy: (a.y + b.y + c.y) / 3,
            cz: (a.z + b.z + c.z) / 3,
          });
        }
      }
    }
  }
  if (hashed) meshHash = hash.digest('hex');
  for (const uses of edgeUse.values()) if (uses === 1) boundaryEdges += 1;
  const bodyPoints = points.length ? points : (lodPoints[1].length ? lodPoints[1] : lodPoints[2]);
  const bounds = boundsOfPoints(bodyPoints);
  const center = bounds.center;
  let inwardFaces = 0;
  for (const face of faceSamples) {
    const dx = face.cx - center[0];
    const dy = face.cy - center[1];
    const dz = face.cz - center[2];
    if (face.nx * dx + face.ny * dy + face.nz * dz < 0) inwardFaces += 1;
  }
  sockets.sort((a, b) => a.name.localeCompare(b.name));
  materials.sort((a, b) => a.name.localeCompare(b.name) || a.role.localeCompare(b.role));
  return {
    bytes,
    triangles,
    meshes: root.listMeshes().length,
    nodes: root.listNodes().length,
    points: bodyPoints,
    lodPoints,
    bounds,
    boundaryEdges,
    inwardFaceFraction: faceSamples.length ? inwardFaces / faceSamples.length : 0,
    materials,
    sockets,
    meshHash,
  };
}

const glbCache = new Map();
async function cachedGlb(file) {
  const abs = releasePath(file);
  if (!abs || !existsSync(abs)) return { missing: true, abs };
  if (glbCache.has(abs)) return glbCache.get(abs);
  const measured = await measureGlb(abs);
  measured.abs = abs;
  measured.url = `assets/ships/release/parts/${String(file).replace(/\\/g, '/').replace(/^assets\/ships\/release\/parts\//, '')}`;
  glbCache.set(abs, measured);
  return measured;
}

function hashId(id) {
  let h = 2166136261;
  const s = String(id);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function asteroidPoints(typeId, variantIdx) {
  const def = AST_DISPLACE[typeId] || AST_DISPLACE.ast_common_rock;
  const geo = new THREE.IcosahedronGeometry(1, def.detail + 1);
  const pos = geo.attributes.position;
  const rnd = mulberry(hashId(typeId) + variantIdx * 911);
  const ox = rnd() * 100;
  const oy = rnd() * 100;
  const oz = rnd() * 100;
  const points = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 1) {
    v.fromBufferAttribute(pos, i).normalize();
    let d = 0;
    let amp = 1;
    let f = 1.7;
    for (let o = 0; o < 3; o += 1) {
      d += amp * Math.sin(v.x * f * 3.1 + ox) * Math.cos(v.y * f * 2.7 + oy) * Math.sin(v.z * f * 3.3 + oz);
      amp *= 0.5;
      f *= 2;
    }
    const radial = typeId === 'ast_common_rock'
      ? geologySilhouetteRadius(v.x, v.y, v.z, variantIdx)
        + displacementScalar(v.x, v.y, v.z, variantIdx) * 1.9
        + def.displace * d * 0.18
      : 1 + def.displace * d;
    const scale = Math.max(0.5, radial);
    points.push({ x: v.x * scale, y: v.y * scale, z: v.z * scale });
  }
  geo.dispose();
  return points;
}

function proportionsFor(row) {
  return resolveCraftProportions({
    type: 'ship',
    id: row.id,
    data: {
      defId: row.proportionsKey && String(row.proportionsKey).startsWith('ship_') ? row.proportionsKey : row.id,
      silhouette: row.silhouette || null,
      shipId: row.proportionsKey || null,
      typeId: row.proportionsKey || null,
    },
  });
}

function proxyAtScale(colliderId, scale, bearingDeg) {
  const entity = {
    pos: { x: 0, z: 0 },
    rot: 0,
    radius: scale,
    data: {
      collisionProxy: colliderId,
      dockRadius: scale,
      corridorBearingDeg: bearingDeg,
    },
  };
  const manifest = COLLISION_PROXY_MANIFESTS[colliderId];
  if (!manifest) return [];
  const local = expandProxyPrimitives(manifest, { entity, corridorBearingDeg: bearingDeg });
  return scaleProxyPrimitives(local, scale);
}

function evaluateOutline(worldPoints, primitives, opening) {
  const sliceY = gameplaySliceY(worldPoints);
  const slice = slicePoints(worldPoints, sliceY);
  const outline = radialOutline(slice).map(roundWu);
  const silhouette = silhouetteRadiusOf(outline);
  const tolerance = flightPlaneToleranceWu(silhouette);
  const gap = radialGap(outline, primitives, tolerance);
  let throatSealed = false;
  if (opening === 'gate-throat') {
    throatSealed = !throatOpen(primitives, Math.max(4, silhouette * 0.2));
  }
  return {
    sliceY: roundWu(sliceY),
    outline,
    silhouetteRadius: roundWu(silhouette),
    toleranceWu: roundWu(tolerance),
    coverageWu: roundWu(gap.coverageWu),
    stickWu: roundWu(gap.stickWu),
    gapWu: roundWu(gap.gapWu),
    overTolerance: gap.gapWu > 0.05 || throatSealed,
    throatSealed,
    slice,
  };
}

function colliderFor(row, fitSpec, proportions) {
  if (row.colliderKind === 'proxy') {
    return {
      kind: 'proxy',
      id: row.colliderId,
      primitives: proxyAtScale(row.colliderId, fitSpec.dockRadius || row.dockRadius, row.opening === 'gate-throat' ? 0 : 135),
    };
  }
  if (row.colliderKind === 'capsule') {
    return {
      kind: 'capsule',
      id: null,
      primitives: craftCapsulePrimitives(proportions, fitSpec.entityRadius || row.entityRadius),
    };
  }
  if (row.colliderKind === 'ball') {
    const factor = row.family === 'rock' ? asteroidColliderRadius(row.id, 1) : 1;
    const radius = (fitSpec.entityRadius || row.entityRadius || 1) * factor;
    return { kind: 'ball', id: null, factor, primitives: ballPrimitives(radius) };
  }
  return { kind: 'none', id: null, primitives: [] };
}

function rowStatus(row, measurement) {
  const reasons = [];
  if (measurement.missing) reasons.push('missing-file');
  if (row.solid && measurement.overTolerance) reasons.push('collider-gap');
  if (measurement.throatSealed) reasons.push('throat-sealed');
  if (measurement.lod && measurement.lod.overTolerance) reasons.push('lod-outline');
  if (!row.solid) {
    return { status: 'green', reasons: [], note: row.nonSolidReason || 'non-solid' };
  }
  if (row.opening === 'gas-soft') {
    const soft = measurement.colliderRadius < measurement.silhouetteRadius;
    return {
      status: soft ? 'green' : 'red',
      reasons: soft ? [] : ['gas-not-softer-than-bloom'],
      note: 'Gas stays enterable. The soft ball is smaller than the bloom.',
    };
  }
  const red = reasons.filter((reason) => reason !== 'missing-file' || row.packagedLive !== false);
  if (row.packagedLive === false && measurement.missing) {
    return { status: 'green', reasons: [], note: 'Loader does not publish this file.' };
  }
  return {
    status: red.length ? 'red' : 'green',
    reasons: red,
    note: null,
  };
}

async function measureRow(row) {
  const proportions = row.colliderKind === 'capsule' ? proportionsFor(row) : null;
  if (row.fit === 'asteroid') {
    let cloud = [];
    for (let variant = 0; variant < 5; variant += 1) cloud = cloud.concat(asteroidPoints(row.id, variant));
    const radius = row.entityRadius || 12;
    const world = cloud.map((p) => ({ x: p.x * radius, y: p.y * radius, z: p.z * radius }));
    const collider = colliderFor(row, { entityRadius: radius }, null);
    const evaluated = evaluateOutline(world, collider.primitives, row.opening || null);
    const gasBloom = row.id === 'ast_gas_cloud' ? evaluated.silhouetteRadius * 1.22 : evaluated.silhouetteRadius;
    const status = rowStatus(row, {
      missing: false,
      overTolerance: evaluated.overTolerance,
      throatSealed: evaluated.throatSealed,
      colliderRadius: collider.primitives[0]?.r || 0,
      silhouetteRadius: gasBloom,
      lod: null,
    });
    const skin = status.status === 'red'
      ? buildPlanarSkin(evaluated.slice, { referenceRadius: radius, opening: row.opening || null })
      : null;
    return {
      id: row.id,
      family: row.family,
      url: null,
      source: 'procedural-icosphere',
      bytes: 0,
      triangles: cloud.length / 3,
      meshes: 1,
      nodes: 1,
      pivot: [0, 0, 0],
      forwardAxis: '+X',
      bounds: stable(boundsOfPoints(world)),
      drawScale: radius,
      worldSize: stable(boundsOfPoints(world).size),
      gameplay: {
        entityRadius: radius,
        dockRadius: null,
        colliderKind: 'ball',
        colliderId: null,
        ballFactor: collider.factor,
      },
      shell: {
        boundaryEdges: 0,
        inwardFaceFraction: 0,
        sliceY: evaluated.sliceY,
        silhouetteRadius: evaluated.silhouetteRadius,
      },
      materials: [{ name: row.id, role: row.id === 'ast_gas_cloud' ? 'other' : 'opaqueHull', doubleSided: row.id === 'ast_gas_cloud', alphaMode: row.id === 'ast_gas_cloud' ? 'BLEND' : 'OPAQUE' }],
      sockets: [],
      lod: { lod0: false, lod1: false, lod2: false, outlineDeltaWu: null },
      collider: {
        kind: 'ball',
        id: null,
        gapWu: evaluated.gapWu,
        toleranceWu: evaluated.toleranceWu,
        coverageWu: evaluated.coverageWu,
        stickWu: evaluated.stickWu,
        overTolerance: evaluated.overTolerance,
        outline: evaluated.outline,
      },
      measuredProportions: null,
      proposedSkin: skin,
      opening: row.opening || null,
      frozenMesh: false,
      meshHash: null,
      status: status.status,
      reasons: status.reasons,
      note: status.note,
      tasteBudget: null,
    };
  }

  const measured = await cachedGlb(row.file);
  if (measured.missing) {
    const status = rowStatus(row, { missing: true, overTolerance: false, throatSealed: false, lod: null });
    return {
      id: row.id,
      family: row.family,
      url: row.file ? `assets/ships/release/parts/${row.file}` : null,
      source: 'missing',
      bytes: 0,
      triangles: 0,
      status: status.status,
      reasons: status.reasons.length ? status.reasons : ['missing-file'],
      note: status.note,
      solid: row.solid === true,
      tasteBudget: null,
    };
  }

  const sizes = Array.isArray(row.sizes) && row.sizes.length ? row.sizes : [null];
  let worst = null;
  let worstEval = null;
  let worstFit = null;
  let worstCollider = null;
  for (const size of sizes) {
    const fitSpec = {
      entityRadius: size?.entityRadius || row.entityRadius,
      dockRadius: size?.dockRadius || row.dockRadius,
      placeScale: row.placeScale,
    };
    const fit = drawFit(row.fit === 'station' ? 'station' : row.fit, measured.bounds, fitSpec);
    const world = applyFit(measured.points, fit);
    const collider = colliderFor(row, fitSpec, proportions);
    const evaluated = evaluateOutline(world, collider.primitives, row.opening || null);
    if (!worst || evaluated.gapWu > worst.gapWu || evaluated.throatSealed) {
      worst = {
        gapWu: evaluated.gapWu,
        name: size?.name || null,
        entityRadius: fitSpec.entityRadius,
        dockRadius: fitSpec.dockRadius || null,
      };
      worstEval = evaluated;
      worstFit = fit;
      worstCollider = collider;
    }
  }
  const worldAll = applyFit(measured.points, worstFit);
  const proportionsMeasured = row.fit === 'ship'
    ? measuredProportions(worldAll, worst.entityRadius)
    : null;

  let lod = { lod0: true, lod1: measured.lodPoints[1].length > 0, lod2: measured.lodPoints[2].length > 0, outlineDeltaWu: {} };
  const family = row.lodFamily;
  if (family && (family.lod1 || family.lod2)) {
    for (const level of [1, 2]) {
      const file = family[`lod${level}`];
      if (!file || file === row.file) continue;
      const sibling = await cachedGlb(file);
      lod[`lod${level}`] = !sibling.missing;
      if (sibling.missing) continue;
      // Each LOD file is fitted on its own bounds to the same target the loader uses,
      // then compared in world units. Sharing LOD0's scale makes a shorter file look shrunk.
      const siblingCloud = sibling.points.length
        ? sibling.points
        : sibling.lodPoints[1].concat(sibling.lodPoints[2]);
      const siblingBounds = siblingCloud.length ? boundsOfPoints(siblingCloud) : sibling.bounds;
      const siblingFit = drawFit(row.fit === 'station' ? 'station' : row.fit, siblingBounds, {
        entityRadius: worst.entityRadius,
        dockRadius: worst.dockRadius,
        placeScale: row.placeScale,
      });
      const siblingWorld = applyFit(siblingCloud, siblingFit);
      const siblingOutline = radialOutline(slicePoints(siblingWorld, gameplaySliceY(siblingWorld)));
      const delta = outlineDelta(siblingOutline, worstEval.outline);
      lod.outlineDeltaWu[`lod${level}`] = roundWu(delta);
    }
  }
  const lod0Radius = worstEval.silhouetteRadius;
  const lodTol = lodOutlineToleranceWu(lod0Radius);
  const lodOver = Object.values(lod.outlineDeltaWu).some((delta) => delta > lodTol + 0.05);
  lod.toleranceWu = roundWu(lodTol);
  lod.overTolerance = lodOver;

  const status = rowStatus(row, {
    missing: false,
    overTolerance: worstEval.overTolerance,
    throatSealed: worstEval.throatSealed,
    silhouetteRadius: worstEval.silhouetteRadius,
    colliderRadius: worstCollider.primitives[0]?.r || 0,
    lod,
  });
  const reference = row.colliderKind === 'proxy'
    ? (worst.dockRadius || row.dockRadius || worst.entityRadius)
    : (worst.entityRadius || row.entityRadius || 1);
  const skin = row.solid && worstEval.overTolerance
    ? buildPlanarSkin(worstEval.slice, { referenceRadius: reference, opening: row.opening || null })
    : null;

  return {
    id: row.id,
    family: row.family,
    url: measured.url,
    source: 'glb',
    bytes: measured.bytes,
    triangles: measured.triangles,
    meshes: measured.meshes,
    nodes: measured.nodes,
    pivot: stable(measured.bounds.center),
    forwardAxis: '+X',
    bounds: stable(measured.bounds),
    drawScale: roundWu(worstFit.scale),
    drawOffset: worstFit.offset.map(roundWu),
    worldSize: stable(boundsOfPoints(worldAll).size),
    gameplay: {
      entityRadius: worst.entityRadius,
      dockRadius: worst.dockRadius,
      colliderKind: worstCollider.kind,
      colliderId: worstCollider.id,
      ballFactor: worstCollider.factor || null,
      proportions: proportions ? {
        length: roundWu(proportions.length),
        halfWidth: roundWu(proportions.halfWidth),
        height: roundWu(proportions.height),
      } : null,
      sizes: row.sizes || null,
    },
    shell: {
      boundaryEdges: measured.boundaryEdges,
      inwardFaceFraction: roundWu(measured.inwardFaceFraction),
      sliceY: worstEval.sliceY,
      silhouetteRadius: worstEval.silhouetteRadius,
    },
    materials: measured.materials,
    sockets: measured.sockets,
    lod,
    collider: {
      kind: worstCollider.kind,
      id: worstCollider.id,
      gapWu: worstEval.gapWu,
      toleranceWu: worstEval.toleranceWu,
      coverageWu: worstEval.coverageWu,
      stickWu: worstEval.stickWu,
      overTolerance: worstEval.overTolerance,
      throatSealed: worstEval.throatSealed,
      outline: worstEval.outline,
      worstSize: worst.name,
    },
    measuredProportions: proportionsMeasured,
    proposedSkin: skin,
    opening: row.opening || null,
    frozenMesh: row.frozenMesh === true,
    meshHash: row.frozenMesh ? measured.meshHash : null,
    solid: row.solid === true,
    status: status.status,
    reasons: status.reasons,
    note: status.note,
    tasteBudget: null,
  };
}

async function buildCensus() {
  const catalog = liveSolidGlbCatalog().filter((row) => !ONLY || row.family === ONLY || row.id === ONLY);
  const rows = [];
  let index = 0;
  for (const row of catalog) {
    index += 1;
    process.stderr.write(`\r[model-truth] ${index}/${catalog.length} ${row.id}`.padEnd(80));
    try {
      rows.push(await measureRow(row));
    } catch (error) {
      rows.push({
        id: row.id,
        family: row.family,
        url: row.file || null,
        status: 'red',
        reasons: ['measure-failed'],
        note: error && error.message ? error.message : String(error),
        tasteBudget: null,
      });
    }
  }
  process.stderr.write('\n');
  rows.sort((a, b) => a.family.localeCompare(b.family) || a.id.localeCompare(b.id));
  const red = rows.filter((row) => row.status === 'red').length;
  return {
    schema: 'spaceface.modelTruthCensus.v1',
    generatedBy: 'scripts/model-truth-census.mjs',
    law: {
      flightPlaneStickOut: 'max(2 WU, 12% of silhouette radius)',
      cameraNearMarginWu: 1,
      lodOutline: 'max(4 WU, 8% of LOD0 radius)',
      maxProxyPrimitives: 32,
    },
    counts: {
      rows: rows.length,
      red,
      green: rows.length - red,
    },
    rows,
  };
}

const census = stable(await buildCensus());
const text = `${JSON.stringify(census, null, 2)}\n`;
if (CHECK) {
  if (!existsSync(OUT)) {
    console.error(`[model-truth] missing ${OUT}`);
    process.exit(1);
  }
  const committed = readFileSync(OUT, 'utf8');
  if (committed !== text) {
    console.error('[model-truth] committed census does not match a fresh run');
    process.exit(1);
  }
  console.log(`[model-truth] census matches (${census.counts.rows} rows, ${census.counts.red} red)`);
} else {
  writeFileSync(OUT, text);
  console.log(`[model-truth] wrote ${census.counts.rows} rows, ${census.counts.red} red, ${census.counts.green} green`);
}
