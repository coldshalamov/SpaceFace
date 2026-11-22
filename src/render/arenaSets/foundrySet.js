import * as THREE from 'three';
import { foundryPlateShape } from '../../data/foundryPlate.js';
import { FOUNDRY_LIGHT } from '../../data/lookMoods.js';
import { FOUNDRY_ARENA_ID } from '../../systems/swarmArena.js';
import { machinedBoxGeometry } from '../arenaFinish.js';
import { loadAuthoredPart } from '../assetLoader.js';
import { getAssetResidency } from '../assetResidency.js';
import { isReleaseAssetMode } from '../releaseMode.js';
import { instantiatePackagedPrimitives } from '../visualFactory.js';
import { frameCostFixOn } from '../frameCostSwitches.js';

export const FOUNDRY_DECK_Y = -62;
const BAY = 84;
const DECK_BAYS = 13;
const DECK_SIZE = BAY * DECK_BAYS;
const BELT_X = 142;
const BELT_LENGTH = 314;
const BELT_HEIGHT = 13;
const CRATES_PER_BELT = 6;
const BANK_CAPACITY = 24;
const PROP_ROOT = 'assets/ships/parts/places/';
const RELEASE_PROP_ROOT = 'assets/ships/release/parts/places/';

const CONVEYORS = [-1, 1].map(side => ({
  x: side * BELT_X, z: side * 25, yaw: Math.PI / 2, fit: BELT_LENGTH,
  y: FOUNDRY_DECK_Y, height: BELT_HEIGHT,
}));
const RACKS = [
  { x: -193, z: -105, yaw: Math.PI / 2, fit: 76 },
  { x: 193, z: 104, yaw: Math.PI / 2, fit: 76 },
  { x: 123, z: -222, yaw: 0, fit: 91 },
  { x: -123, z: 222, yaw: 0, fit: 91 },
];
const GANTRIES = [
  { x: -181, z: -226, yaw: 0, fit: 95 },
  { x: 181, z: 226, yaw: Math.PI, fit: 95 },
];
const FURNACE = { x: 11, z: 112 };
const WORK_LAMPS = [
  { x: -102, z: 53 },
  { x: 104, z: 43 },
];

const plateCorner = value => Math.sign(value) * (0.5 - (0.5 - Math.abs(value)) * 0.24);

// The horizontal deck occupies almost the entire screen. Its fixed, tightly fitted
// map needs one bilinear hardware comparison per fragment. The stock five-tap filter
// remains on the ships, rocks and authored prop materials.
function useDeckShadowFilter(material) {
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <shadowmap_pars_fragment>', `
      #if defined( USE_SHADOWMAP ) && defined( SHADOWMAP_TYPE_PCF )
        #define getShadow getDefaultShadow
      #endif
      #include <shadowmap_pars_fragment>
      #if defined( USE_SHADOWMAP ) && defined( SHADOWMAP_TYPE_PCF )
        #undef getShadow
        float getShadow( sampler2DShadow map, vec2 size, float intensity,
            float bias, float radius, vec4 coord ) {
          if (intensity <= 0.0) return 1.0;
          vec3 sampleCoord = coord.xyz / coord.w;
          sampleCoord.z += bias;
          if (any(lessThan(sampleCoord.xy, vec2(0.0))) ||
              any(greaterThan(sampleCoord, vec3(1.0)))) return 1.0;
          return mix(1.0, texture(map, sampleCoord), intensity);
        }
      #endif
    `);
  };
}

export function isFoundrySetEntry(event, arenaId) {
  return event === 'swarm:arenaEntered' && arenaId === FOUNDRY_ARENA_ID;
}

function freezeStaticMatrix(object) {
  object.updateMatrix();
  object.matrixAutoUpdate = false;
  return object;
}

function buildSimpleBoxGeometry() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  if (geometry.getAttribute('uv')) geometry.deleteAttribute('uv');
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'sf-foundry-simple-box';
  return geometry;
}

function buildDeckPlateGeometry() {
  // Exact chamfered-corner unit slab matching plateCorner's corner cut at far fewer triangles
  // than the beveled ExtrudeGeometry (28 tris vs 60 tris per plate across 169 floor bays).
  const c = 0.03;
  const h = 0.5;
  const ring = [
    [-h + c, -h], [h - c, -h], [h, -h + c], [h, h - c],
    [h - c, h], [-h + c, h], [-h, h - c], [-h, -h + c],
  ];
  const positions = [];
  const normals = [];
  const pushTri = (ax, ay, az, bx, by, bz, cx, cy, cz, nx, ny, nz) => {
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  };
  for (let i = 1; i < ring.length - 1; i++) {
    const a = ring[0], b = ring[i], d = ring[i + 1];
    pushTri(a[0], h, a[1], d[0], h, d[1], b[0], h, b[1], 0, 1, 0);
  }
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const ex = b[0] - a[0], ez = b[1] - a[1];
    const len = Math.hypot(ex, ez) || 1;
    const nx = ez / len, nz = -ex / len;
    pushTri(a[0], -h, a[1], b[0], -h, b[1], b[0], h, b[1], nx, 0, nz);
    pushTri(a[0], -h, a[1], b[0], h, b[1], a[0], h, a[1], nx, 0, nz);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.name = 'sf-foundry-deck-plate';
  return geometry;
}

function blocks(root, name, geometry, material, rows, receives = true, casts = false) {
  const batch = new THREE.InstancedMesh(geometry, material, rows.length);
  batch.name = name;
  batch.receiveShadow = receives;
  batch.castShadow = casts;
  const pose = new THREE.Object3D();
  const color = new THREE.Color();
  rows.forEach(([x, y, z, width, height, depth, hex, yaw = 0], i) => {
    pose.position.set(x, y, z);
    pose.scale.set(width, height, depth);
    pose.rotation.y = yaw;
    pose.updateMatrix();
    batch.setMatrixAt(i, pose.matrix);
    if (hex != null) batch.setColorAt(i, color.setHex(hex));
  });
  freezeStaticMatrix(batch);
  root.add(batch);
  return batch;
}

function buildDeck(root, planeMaterial, steel, simpleBox, plateGeometry, trimOut) {
  const foundation = new THREE.Mesh(new THREE.PlaneGeometry(DECK_SIZE, DECK_SIZE), planeMaterial);
  foundation.name = 'Foundry deck foundation';
  foundation.rotation.x = -Math.PI / 2;
  foundation.position.y = FOUNDRY_DECK_Y - 1.25;
  foundation.castShadow = false;
  foundation.receiveShadow = true;
  // The grout plane lies under ~95 % of the screen, beneath the steel plates. Drawn first it shaded
  // every deck pixel twice; drawn after them, early depth rejects all but the visible joints. The
  // opaque state sort (opaqueStateSort.js) orders by renderOrder first, and it is also mounted after
  // the plates for the raw traversal order (?rfx=-sort).
  foundation.renderOrder = 1;
  freezeStaticMatrix(foundation);

  const plate = [];
  const finishes = [0x454743, 0x494945, 0x464946, 0x484b48, 0x444644];
  const half = (DECK_BAYS - 1) / 2;
  for (let row = -half; row <= half; row++) {
    const stagger = row % 2 === 0 ? 0 : BAY / 2;
    for (let col = -half; col <= half; col++) {
      const x = col * BAY + stagger;
      const z = row * BAY;
      const finish = (Math.abs(row * 19 + col * 13) + col * col) % finishes.length;
      plate.push([x, FOUNDRY_DECK_Y - 0.6, z, BAY - 1, 1.2, BAY - 1, finishes[finish]]);
      if ((col - row * 2) % 5 === 0) {
        trimOut.push([x - 23, FOUNDRY_DECK_Y + 0.15, z + 17, 14, 0.3, 27, 0x252b30]);
        for (let slot = 0; slot < 5; slot++) {
          trimOut.push([x - 23, FOUNDRY_DECK_Y + 0.55, z + 7 + 5 * slot, 12, 0.5, 1.4, 0x555754]);
        }
      }
    }
  }
  for (const side of [-1, 1]) {
    for (const x of [97, 112, 171, 187]) {
      trimOut.push([side * x, FOUNDRY_DECK_Y + 0.8, 0, 1.6, 1.6, 780, 0x373a3a]);
    }
    for (let z = -378; z <= 378; z += 28) {
      const x = side * 95;
      trimOut.push([x, FOUNDRY_DECK_Y + 0.12, z, 2.6, 0.24, 14, 0x806340]);
    }
  }
  blocks(root, 'Foundry steel plating', plateGeometry, steel, plate, true, false);
  return foundation;
}

function buildMachinery(root, steel, simpleBox, fixtures, trimOut) {
  const frames = [], hot = [], lamps = [];
  const y = FOUNDRY_DECK_Y;
  for (const belt of CONVEYORS) {
    frames.push([belt.x, y + 9, belt.z, 25, 5, BELT_LENGTH, 0x262d30]);
    for (const edge of [-1, 1]) {
      frames.push([belt.x + edge * 13, y + 10, belt.z, 2, 3, BELT_LENGTH, 0x79726a]);
      for (let i = -3; i <= 3; i++) {
        frames.push([belt.x + edge * 11, y + 4, belt.z + i * 43, 3.2, 8, 7, 0x323536]);
      }
    }
    for (let i = -22; i <= 22; i++) {
      trimOut.push([belt.x, y + 12, belt.z + i * 6.8, 23, 1, 2.3, 0x595b58]);
    }
    for (const end of [-1, 1]) {
      const z = belt.z + end * BELT_LENGTH / 2;
      frames.push([belt.x, y + 9, z, 32, 18, 19, 0x414546]);
      frames.push([belt.x, y + 18, z, 27, 0.5, 11, 0x8d6735]);
    }
  }
  const { x, z } = FURNACE;
  frames.push([x, y + 2, z - 6, 63, 4, 57, 0x242929]);
  frames.push([x, y + 13, z + 10, 51, 22, 31, 0x3d3330]);
  frames.push([x, y + 25, z + 12, 49, 4, 29, 0x605149]);
  frames.push([x, y + 6, z - 16, 49, 8, 24, 0x57453a]);
  for (const side of [-1, 1]) {
    frames.push([x + side * 21, y + 17, z - 12, 8, 20, 17, 0x695040]);
    frames.push([x + side * 15, y + 32, z + 15, 11, 13, 11, 0x383736]);
  }
  hot.push([x, y + 15, z - 6, 33, 10, 1]);
  for (let i = -3; i <= 3; i++) {
    frames.push([x + i * 4.5, y + 13, z - 10, 1, 11, 2, 0x2c2521]);
    hot.push([x + i * 4.5, y + 10.5, z - 16, 2.4, 0.75, 15]);
  }

  for (const lamp of WORK_LAMPS) {
    frames.push([lamp.x, y + 1, lamp.z, 8, 2, 8, 0x554d41]);
    frames.push([lamp.x, y + 15, lamp.z, 2.2, 30, 2.2, 0x5d5350]);
    frames.push([lamp.x, y + 30, lamp.z, 13, 4.2, 6, 0x4b4844]);
    lamps.push([lamp.x, y + 32.2, lamp.z, 8, 0.6, 2]);
  }
  // This roof of the high shop lamp is visible when looking beyond the far bank.
  frames.push([-248, y + 24, -316, 11, 48, 13, 0x4b4744]);
  frames.push([-214, y + 49, -316, 78, 5, 14, 0x686258]);
  lamps.push([-195, y + 52, -316, 20, 1, 4]);
  blocks(root, 'Foundry machinery and trusses', simpleBox, steel, frames, true, false);
  blocks(root, 'Foundry furnace cores', simpleBox, fixtures.hot, hot, false, false);
  blocks(root, 'Foundry work-lamp lenses', simpleBox, fixtures.lamp, lamps, false, false);
}

// The arena camera never brings these set pieces close: a cargo pod is ~40-100 px on screen, a
// rack or gantry a few hundred. The set mounts the packages' authored LOD1 bodies (~40 % of the
// LOD0 triangles, same silhouette and materials), the way the whole-ship LOD picks LOD1 below 240 px.
// Pieces that never move are merged into one mesh per material (mountStaticChunksMerged).
const SET_PIECE_LOD = 'lod1';
const STATIC_PROP_LOD = 'lod1';

function primitiveLod(primitive) {
  const tag = primitive && primitive.tags && primitive.tags.lod;
  if (tag) return String(tag).toLowerCase();
  const match = /LOD([012])[_-]/i.exec(String(primitive && primitive.name || ''));
  return match ? `lod${match[1]}` : null;
}

// One derived record per (source record, lod): the merged-geometry cache in visualFactory is keyed
// by record identity, so re-entering the Foundry reuses the merged buffers instead of minting new ones.
const lodRecords = new WeakMap();

/** The record re-expressed at one authored LOD (presented as lod0 so the merge path applies). */
export function recordAtLod(record, lod = SET_PIECE_LOD) {
  const primitives = record && Array.isArray(record.primitives) ? record.primitives : null;
  if (!primitives || !primitives.some((p) => primitiveLod(p) === lod)) return record;
  let byLod = lodRecords.get(record);
  if (!byLod) lodRecords.set(record, byLod = new Map());
  if (byLod.has(lod)) return byLod.get(lod);
  const picked = [];
  for (const primitive of primitives) {
    const level = primitiveLod(primitive);
    if (level === null) { picked.push(primitive); continue; }
    if (level !== lod) continue;
    picked.push({
      ...primitive,
      name: String(primitive.name || '').replace(/LOD[012]([_-])/i, 'LOD0$1'),
      tags: { ...(primitive.tags || {}), lod: 'lod0' },
    });
  }
  const derived = { ...record, primitives: picked };
  byLod.set(lod, derived);
  return derived;
}

function recordAtPreferredLod(record, preferredLod = STATIC_PROP_LOD) {
  const picked = recordAtLod(record, preferredLod);
  return picked !== record ? picked : recordAtLod(record, SET_PIECE_LOD);
}

function textureIdentityKey(texture) {
  if (!texture) return 'none';
  const sourceKey = texture.userData?.spacefaceSharedImageSourceKey
    || texture.source?.uuid
    || texture.image?.src
    || texture.uuid;
  return `${sourceKey}:${texture.wrapS}:${texture.wrapT}:${texture.channel || 0}`;
}

function staticMaterialKey(material) {
  if (!material || Array.isArray(material) || material.transparent || material.alphaTest > 0) return null;
  if (!material.isMeshStandardMaterial && !material.isMeshBasicMaterial
      && !material.isMeshPhongMaterial && !material.isMeshLambertMaterial) return null;
  const programKey = typeof material.customProgramCacheKey === 'function'
    ? String(material.customProgramCacheKey()) : '';
  const emissiveHex = material.emissive ? material.emissive.getHexString() : '000000';
  const emissiveIntensity = Number.isFinite(material.emissiveIntensity) ? material.emissiveIntensity : 0;
  const lampChannel = material.userData?.spacefaceLampBusChannel || material.userData?.lampBus || '';
  const role = material.userData?.spacefaceMaterialRole || '';
  const textures = [
    textureIdentityKey(material.map),
    textureIdentityKey(material.normalMap),
    textureIdentityKey(material.roughnessMap),
    textureIdentityKey(material.metalnessMap),
    textureIdentityKey(material.aoMap),
    textureIdentityKey(material.emissiveMap),
  ].join('/');
  return [
    material.type,
    programKey,
    role,
    lampChannel,
    Number(material.roughness ?? 1).toFixed(3),
    Number(material.metalness ?? 0).toFixed(3),
    Number(material.envMapIntensity ?? 1).toFixed(3),
    material.dithering ? 1 : 0,
    material.flatShading ? 1 : 0,
    emissiveHex,
    emissiveIntensity.toFixed(3),
    textures,
  ].join('|');
}

const _mergeVec = new THREE.Vector3();
const _mergeNormal = new THREE.Vector3();
const _mergeNormalMat = new THREE.Matrix3();

function mergeStaticChunkGeometries(chunks, bakeVertexColors) {
  const first = chunks[0].geometry;
  const candidateAttrs = ['position', 'normal', 'tangent', 'uv'];
  const attrNames = candidateAttrs.filter((name) => {
    const ref = first.getAttribute(name);
    if (!ref) return false;
    return chunks.every(({ geometry }) => {
      const a = geometry.getAttribute(name);
      return !!a && a.itemSize === ref.itemSize;
    });
  });
  if (!attrNames.includes('position')) return null;

  let vertexTotal = 0;
  let indexTotal = 0;
  for (const { geometry } of chunks) {
    const pos = geometry.getAttribute('position');
    if (!pos || pos.count <= 0) return null;
    // A package geometry whose CPU arrays were released after upload cannot be read back: leave
    // those pieces unmerged (they draw from their own GPU buffers through the fallback path).
    for (const name of attrNames) {
      const a = geometry.getAttribute(name);
      if (!a.array || a.array.length < a.count * a.itemSize) return null;
    }
    if (geometry.index && (!geometry.index.array || geometry.index.array.length < geometry.index.count)) return null;
    vertexTotal += pos.count;
    indexTotal += geometry.index ? geometry.index.count : pos.count;
  }
  if (vertexTotal <= 0 || vertexTotal > 2000000) return null;

  const out = {};
  for (const name of attrNames) {
    out[name] = new Float32Array(vertexTotal * first.getAttribute(name).itemSize);
  }
  if (bakeVertexColors) out.color = new Float32Array(vertexTotal * 3);
  const index = vertexTotal <= 65535 ? new Uint16Array(indexTotal) : new Uint32Array(indexTotal);

  let vOffset = 0;
  let iOffset = 0;
  for (const { geometry, matrix, material } of chunks) {
    const pos = geometry.getAttribute('position');
    const count = pos.count;
    const det = matrix.determinant();
    const flipWinding = det < 0;
    _mergeNormalMat.getNormalMatrix(matrix);

    for (const name of attrNames) {
      const a = geometry.getAttribute(name);
      const size = a.itemSize;
      const dst = out[name];
      for (let v = 0; v < count; v++) {
        const o = (vOffset + v) * size;
        if (name === 'position') {
          _mergeVec.set(a.getX(v), a.getY(v), a.getZ(v)).applyMatrix4(matrix);
          dst[o] = _mergeVec.x; dst[o + 1] = _mergeVec.y; dst[o + 2] = _mergeVec.z;
        } else if (name === 'normal') {
          _mergeNormal.set(a.getX(v), a.getY(v), a.getZ(v)).applyMatrix3(_mergeNormalMat).normalize();
          dst[o] = _mergeNormal.x; dst[o + 1] = _mergeNormal.y; dst[o + 2] = _mergeNormal.z;
        } else if (name === 'tangent' && size === 4) {
          _mergeNormal.set(a.getX(v), a.getY(v), a.getZ(v)).transformDirection(matrix);
          dst[o] = _mergeNormal.x; dst[o + 1] = _mergeNormal.y; dst[o + 2] = _mergeNormal.z;
          dst[o + 3] = flipWinding ? -a.getW(v) : a.getW(v);
        } else {
          for (let c = 0; c < size; c++) {
            dst[o + c] = c === 0 ? a.getX(v) : c === 1 ? a.getY(v) : c === 2 ? a.getZ(v) : a.getW(v);
          }
        }
      }
    }

    if (bakeVertexColors) {
      const tint = material.color;
      const r = tint ? tint.r : 1;
      const g = tint ? tint.g : 1;
      const b = tint ? tint.b : 1;
      const srcColor = geometry.getAttribute('color');
      const dst = out.color;
      for (let v = 0; v < count; v++) {
        const o = (vOffset + v) * 3;
        if (srcColor) {
          dst[o] = srcColor.getX(v) * r;
          dst[o + 1] = srcColor.getY(v) * g;
          dst[o + 2] = srcColor.getZ(v) * b;
        } else {
          dst[o] = r; dst[o + 1] = g; dst[o + 2] = b;
        }
      }
    }

    if (geometry.index) {
      const srcIdx = geometry.index;
      if (flipWinding) {
        for (let k = 0; k < srcIdx.count; k += 3) {
          index[iOffset + k] = srcIdx.getX(k) + vOffset;
          index[iOffset + k + 1] = srcIdx.getX(k + 2) + vOffset;
          index[iOffset + k + 2] = srcIdx.getX(k + 1) + vOffset;
        }
      } else {
        for (let k = 0; k < srcIdx.count; k++) index[iOffset + k] = srcIdx.getX(k) + vOffset;
      }
      iOffset += srcIdx.count;
    } else if (flipWinding) {
      for (let k = 0; k < count; k += 3) {
        index[iOffset + k] = vOffset + k;
        index[iOffset + k + 1] = vOffset + k + 2;
        index[iOffset + k + 2] = vOffset + k + 1;
      }
      iOffset += count;
    } else {
      for (let k = 0; k < count; k++) index[iOffset + k] = vOffset + k;
      iOffset += count;
    }
    vOffset += count;
  }

  const merged = new THREE.BufferGeometry();
  for (const name of attrNames) {
    merged.setAttribute(name, new THREE.BufferAttribute(out[name], first.getAttribute(name).itemSize));
  }
  if (bakeVertexColors) merged.setAttribute('color', new THREE.BufferAttribute(out.color, 3));
  merged.setIndex(new THREE.BufferAttribute(index, 1));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function demoteStaticMaterialForIntegrated(material, own) {
  if (!material || !material.isMeshStandardMaterial || material.transparent || material.alphaTest > 0
      || material.userData?.spacefaceLampBusChannel || material.userData?.lampBus) {
    return material;
  }
  const next = own(new THREE.MeshLambertMaterial({
    color: material.color ? material.color.clone() : new THREE.Color(0xffffff),
    map: material.map || null,
    emissive: material.emissive ? material.emissive.clone() : new THREE.Color(0x000000),
    emissiveMap: material.emissiveMap || null,
    emissiveIntensity: Number.isFinite(material.emissiveIntensity) ? material.emissiveIntensity : 1,
    vertexColors: !!material.vertexColors,
    side: material.side,
    flatShading: !!material.flatShading,
    fog: material.fog !== false,
    dithering: !!material.dithering,
    name: material.name || '',
  }));
  if (material.userData) next.userData = { ...material.userData };
  return next;
}

function coalesceMaterialBuckets(chunks, own, keepSingleInFallback = false, integratedTier = false) {
  const buckets = new Map();
  const fallback = [];
  const demoted = integratedTier ? new Map() : null;
  const demote = (material) => {
    if (!integratedTier || !material) return material;
    let cached = demoted.get(material);
    if (!cached) {
      cached = demoteStaticMaterialForIntegrated(material, own);
      demoted.set(material, cached);
    }
    return cached;
  };
  for (const chunk of chunks) {
    const key = staticMaterialKey(chunk.material);
    if (!key || !chunk.geometry?.isBufferGeometry) {
      fallback.push(integratedTier ? { ...chunk, material: demote(chunk.material) } : chunk);
      continue;
    }
    let bucket = buckets.get(key);
    if (!bucket) { bucket = []; buckets.set(key, bucket); }
    bucket.push(chunk);
  }
  const merged = [];
  for (const bucket of buckets.values()) {
    const baseMaterial = bucket[0].material;
    const baseColorHex = baseMaterial.color ? baseMaterial.color.getHex() : 0xffffff;
    const hasDistinctColors = bucket.some((c) => (c.material.color ? c.material.color.getHex() : 0xffffff) !== baseColorHex);
    const hasAnyVertexColors = bucket.some((c) => !!c.geometry.getAttribute('color'));
    const bakeVertexColors = hasDistinctColors || hasAnyVertexColors;
    if (keepSingleInFallback && bucket.length === 1 && !bakeVertexColors) {
      const single = bucket[0];
      fallback.push(integratedTier ? { ...single, material: demote(single.material) } : single);
      continue;
    }
    const mergedGeometry = mergeStaticChunkGeometries(bucket, bakeVertexColors);
    if (!mergedGeometry) {
      for (const item of bucket) fallback.push(integratedTier ? { ...item, material: demote(item.material) } : item);
      continue;
    }
    own(mergedGeometry);
    let material = baseMaterial;
    if (bakeVertexColors && typeof baseMaterial.clone === 'function') {
      material = own(baseMaterial.clone());
      if (material.color) material.color.setHex(0xffffff);
      material.vertexColors = true;
      material.needsUpdate = true;
    }
    material = demote(material);
    merged.push({ name: bucket[0].name, geometry: mergedGeometry, material });
  }
  return { merged, fallback };
}

function mountStaticChunksMerged(root, chunks, own, integratedTier = false) {
  const { merged, fallback } = coalesceMaterialBuckets(chunks, own, false, integratedTier);
  for (const item of merged) {
    const mesh = new THREE.Mesh(item.geometry, item.material);
    mesh.name = 'Foundry static props';
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    freezeStaticMatrix(mesh);
    root.add(mesh);
  }
  for (const item of fallback) {
    const mesh = new THREE.Mesh(item.geometry, item.material);
    mesh.name = item.name || 'Foundry static prop';
    mesh.applyMatrix4(item.matrix);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    freezeStaticMatrix(mesh);
    root.add(mesh);
  }
}

function mountPart(root, record, placements, name, batches, own, staticChunks = null, preferredLod = STATIC_PROP_LOD, integratedTier = false) {
  const model = new THREE.Group();
  model.name = name;
  const mountedRecord = frameCostFixOn('setLod') ? recordAtPreferredLod(record, preferredLod) : record;
  instantiatePackagedPrimitives(mountedRecord, model);
  const bounds = new THREE.Box3().setFromObject(model);
  if (bounds.isEmpty()) return;
  const centre = bounds.getCenter(new THREE.Vector3());
  centre.y = bounds.min.y;
  const size = bounds.getSize(new THREE.Vector3());
  const pose = new THREE.Object3D();
  const anchor = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const moving = name === 'Foundry cargo';
  const poses = placements.map(({ x, y = FOUNDRY_DECK_Y, z, yaw = 0, fit, height }) => {
    const scale = fit / Math.max(size.x, size.y, size.z);
    pose.scale.set(scale, height && size.y > 0 ? height / size.y : scale, scale);
    pose.rotation.y = yaw;
    pose.position.set(x, y, z).sub(anchor.copy(centre).multiply(pose.scale).applyQuaternion(pose.quaternion));
    pose.updateMatrix();
    return pose.matrix.clone();
  });
  if (!moving && staticChunks) {
    for (const mesh of model.children) {
      mesh.updateMatrix();
      for (const poseMatrix of poses) {
        staticChunks.push({
          name,
          geometry: mesh.geometry,
          material: mesh.material,
          matrix: new THREE.Matrix4().multiplyMatrices(poseMatrix, mesh.matrix),
        });
      }
    }
    return;
  }
  const localChunks = model.children.map((mesh) => {
    mesh.updateMatrix();
    return {
      name,
      geometry: mesh.geometry,
      material: mesh.material,
      matrix: mesh.matrix.clone(),
    };
  });
  const { merged, fallback } = coalesceMaterialBuckets(localChunks, own, true, integratedTier);
  const entries = [
    ...merged.map((item) => ({ ...item, primitive: null })),
    ...fallback.map((item) => ({ ...item, primitive: item.matrix })),
  ];
  for (const { geometry, material, primitive } of entries) {
    const batch = own(new THREE.InstancedMesh(geometry, material, placements.length));
    batch.name = name;
    batch.receiveShadow = true;
    // The authored kits contain fine ribs and fasteners. The structural silhouettes cast.
    batch.castShadow = false;
    if (moving) {
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      batch.frustumCulled = false;
      batches.push({ batch, poses, primitive });
    } else {
      poses.forEach((poseMatrix, i) => batch.setMatrixAt(i, primitive ? matrix.multiplyMatrices(poseMatrix, primitive) : poseMatrix));
    }
    freezeStaticMatrix(batch);
    root.add(batch);
  }
}

export function createFoundrySet(scene, { renderer, nocturne, loadPart = loadAuthoredPart, gpu = null } = {}) {
  const root = new THREE.Group();
  root.name = 'Foundry industrial deck';
  const integratedTier = gpu?.tier === 'integrated' || gpu?.tier === 'software';
  const cheapMat = integratedTier && frameCostFixOn('foundryCheapMat');
  const center = { x: 0, z: 0 };
  const local = { x: 0, z: 0 };
  const resources = new Set();
  const own = resource => { resources.add(resource); return resource; };
  const steel = own(cheapMat
    ? new THREE.MeshLambertMaterial({ color: 0xffffff })
    : new THREE.MeshStandardMaterial({ roughness: 0.76, metalness: 0.22, color: 0xffffff }));
  const floor = own(cheapMat
    ? new THREE.MeshLambertMaterial({ color: 0xffffff })
    : new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x252322, shininess: 19 }));
  const grout = own(new THREE.MeshLambertMaterial({ color: 0x252729 }));
  useDeckShadowFilter(floor);
  useDeckShadowFilter(grout);
  const fixtures = {
    hot: own(new THREE.MeshBasicMaterial({ color: new THREE.Color(FOUNDRY_LIGHT.furnaceCore).multiplyScalar(3.4) })),
    lamp: own(new THREE.MeshBasicMaterial({ color: new THREE.Color(FOUNDRY_LIGHT.lampCore).multiplyScalar(1.4) })),
  };
  const box = machinedBoxGeometry();
  const simpleBox = own(buildSimpleBoxGeometry());
  const plateGeometry = own(buildDeckPlateGeometry());
  const trimRows = [];
  const foundation = buildDeck(root, grout, floor, simpleBox, plateGeometry, trimRows);
  own(foundation.geometry);
  buildMachinery(root, steel, simpleBox, fixtures, trimRows);
  blocks(root, 'Foundry deck trim and rollers', simpleBox, steel, trimRows, true, false);
  root.add(foundation);
  for (const object of root.children) if (object.isInstancedMesh) own(object);

  const blank = [0, 0, 0, 1, 1, 1, 0xffffff];
  const blankUncolored = [0, 0, 0, 1, 1, 1];
  const walls = own(blocks(root, 'Foundry bank foundations', box, steel,
    Array(BANK_CAPACITY * 9).fill(blank), true, true));
  const bankLenses = own(blocks(root, 'Foundry bank marker lenses', simpleBox, fixtures.lamp,
    Array(BANK_CAPACITY * 2).fill(blankUncolored), false, false));
  walls.count = bankLenses.count = 0;
  const pose = new THREE.Object3D();
  const color = new THREE.Color();
  const matrix = new THREE.Matrix4();
  const cargo = [];
  let elapsed = 0;
  let disposed = false;
  let bankWave = null;
  const lightSources = [
    { x: FURNACE.x, y: FOUNDRY_DECK_Y + 15, z: FURNACE.z - 29, ...FOUNDRY_LIGHT.furnace },
    ...WORK_LAMPS.map(lamp => ({ ...lamp, y: FOUNDRY_DECK_Y + 28, ...FOUNDRY_LIGHT.workLamp })),
  ];
  const lights = lightSources.map(({ color: tint, intensity, range, priority }, i) => {
    if (nocturne) return nocturne.createLight(`foundry-set:${i}`, 'point', {
      color: tint, intensity, range, priority, stationary: true,
    });
    const light = own(new THREE.PointLight(tint, intensity, range, 2));
    light.name = `Foundry practical ${i + 1}`;
    root.add(light);
    return light;
  });
  scene.add(root);
  const owner = 'foundry-arena-set';
  const active = () => !disposed;
  const assetRoot = isReleaseAssetMode() ? RELEASE_PROP_ROOT : PROP_ROOT;
  const jobs = [
    ['place_conveyor_truss', CONVEYORS, 'Foundry conveyor truss', STATIC_PROP_LOD],
    ['place_container_rack', RACKS, 'Foundry panel racks', STATIC_PROP_LOD],
    ['place_maintenance_gantry', GANTRIES, 'Foundry maintenance gantries', STATIC_PROP_LOD],
    ['place_cargo_pod_standard', CONVEYORS.flatMap(belt => Array.from({ length: CRATES_PER_BELT }, () =>
      ({ x: belt.x, z: 0, y: FOUNDRY_DECK_Y + BELT_HEIGHT, yaw: belt.yaw, fit: 19 }))), 'Foundry cargo', STATIC_PROP_LOD],
  ];
  const ready = renderer ? Promise.all(jobs.map(async ([file, placements, name, preferredLod]) => {
    const record = await loadPart(`${assetRoot}${file}.glb`, {
      renderer, slot: 'place', optional: true, residencyOwner: owner, isResidencyOwnerActive: active,
    });
    return { record, placements, name, preferredLod };
  })).then((loaded) => {
    if (!active()) return;
    const staticChunks = [];
    for (const { record, placements, name, preferredLod } of loaded) {
      if (record?.primitives?.length) {
        mountPart(root, record, placements, name, cargo, own, staticChunks, preferredLod, cheapMat);
      }
    }
    if (staticChunks.length > 0) mountStaticChunksMerged(root, staticChunks, own, cheapMat);
  }) : Promise.resolve();

  function setBankBlock(batch, index, bank, x, y, z, width, height, depth, hex) {
    const { rot, pos } = bank;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    pose.position.set(pos.x - center.x + x * cos + z * sin, y, pos.z - center.z - x * sin + z * cos);
    pose.rotation.y = rot;
    pose.scale.set(width, height, depth);
    pose.updateMatrix();
    batch.setMatrixAt(index, pose.matrix);
    if (hex != null) batch.setColorAt(index, color.setHex(hex));
  }

  return {
    root, center, ready,
    installBanks(entities, wave = 0) {
      if (bankWave === wave) return false;
      const banks = [];
      let x = 0, z = 0, n = 0;
      for (const entity of entities) {
        if (!entity || entity.alive === false || entity.data?.roomKind !== 'plate') continue;
        if (entity.data.roomSolidId && !entity.data.roomSolidId.startsWith(`survival-room-w${wave}-`)) continue;
        const id = entity.data.roomToyId;
        const rim = id?.startsWith('foundry_rim_');
        if (!rim && !id?.startsWith('foundry_plate_')) continue;
        banks.push(entity);
        if (rim) { x += entity.pos.x; z += entity.pos.z; n++; }
      }
      if (n === 0) return false;
      bankWave = wave;
      center.x = x / n;
      center.z = z / n;
      let i = 0, j = 0;
      for (const bank of banks.slice(0, BANK_CAPACITY)) {
        const shape = foundryPlateShape(bank);
        const { halfWidth: w, halfDepth: d, halfHeight: h } = shape;
        const height = -FOUNDRY_DECK_Y - h;
        setBankBlock(walls, i++, bank, 0, FOUNDRY_DECK_Y + height / 2, 0, w * 2, height, d * 2, 0x35393c);
        setBankBlock(walls, i++, bank, 0, -h - 2, 0, w * 2, 4, d * 2, 0x70573c);
        for (let panel = -2; panel <= 2; panel++) {
          setBankBlock(walls, i++, bank, panel * w * 0.36, -27, d - 1, w * 0.29, 36, 2, 0x504e49);
        }
        for (const edge of [-1, 1]) {
          setBankBlock(walls, i++, bank, edge * w * 0.88, -12, d - 1, w * 0.13, 9, 2, 0xb18a41);
          setBankBlock(bankLenses, j++, bank, edge * w * 0.73, -h - 3, d, 4, 1.6, 1.2);
        }
      }
      walls.count = i;
      bankLenses.count = j;
      for (const mesh of [walls, bankLenses]) {
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
      }
      return true;
    },
    frame(dt, membrane) {
      elapsed += dt;
      if (membrane) membrane.toLocal(center, local);
      else { local.x = center.x; local.z = center.z; }
      root.position.set(local.x, 0, local.z);
      for (let i = 0; i < lights.length; i++) {
        const light = lights[i];
        const source = lightSources[i];
        light.position.set(source.x + (nocturne ? local.x : 0), source.y, source.z + (nocturne ? local.z : 0));
      }
      for (const { batch, poses, primitive } of cargo) {
        for (let i = 0; i < poses.length; i++) {
          const belt = CONVEYORS[Math.floor(i / CRATES_PER_BELT)];
          const phase = (elapsed * 11 + (i % CRATES_PER_BELT) * BELT_LENGTH / CRATES_PER_BELT) % BELT_LENGTH;
          matrix.copy(poses[i]);
          matrix.elements[14] += belt.z + (belt.x < 0 ? 1 : -1) * (phase - BELT_LENGTH / 2);
          batch.setMatrixAt(i, primitive ? matrix.multiply(primitive) : matrix);
        }
        batch.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      if (nocturne) for (const light of lights) light.dispose();
      for (const resource of resources) resource.dispose();
      getAssetResidency(renderer)?.releaseOwner(owner, 'foundry-set-exit');
    },
  };
}
