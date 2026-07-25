#!/usr/bin/env node
// Rebuild only the PQ-018 Wreck Cathedral release GLB from its immutable source.
//
// glTF Transform position quantization composes a large dequantization scale onto each mesh node.
// Three.js validates scene-relative transforms after decomposition/recomposition; the source's
// Blender quaternions are unit rotations within float precision, but their tiny length error is
// magnified by that scale beyond the loader's 1e-5 tolerance. Normalize rotations before and after
// the standard KTX2 + meshopt transforms so the release remains a pure TRS hierarchy without
// widening the shared loader contract.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import JPEG from 'jpeg-js';
import { PNG } from 'pngjs';
import {
  Matrix4,
  Quaternion,
  Vector3,
} from 'three';

import {
  inspectGlbReleaseCompression,
  inspectReleaseAssetPair,
} from '../src/contracts/assetReleaseValidation.js';
import { RELEASE_MESHOPT_OPTIONS } from './lib/releaseMeshoptProfile.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PART_ID = 'place_landmark_wreck_cathedral';
const SOURCE_REL = `assets/ships/parts/places/${PART_ID}.glb`;
const RELEASE_REL = `assets/ships/release/parts/places/${PART_ID}.glb`;
const SOURCE = resolve(ROOT, SOURCE_REL);
const RELEASE = resolve(ROOT, RELEASE_REL);
const RELEASE_LOCK = resolve(ROOT, 'assets/ships/release.__lock');
const EXPECTED_SOURCE_SHA256 = 'f335935f9658bad0e721aceb5d66bb4c2f0457fe411442819b4a3455a00af704';
const REQUIRED_ROOT = 'SF_PLACE_LANDMARK_WRECK_CATHEDRAL_ROOT';
const REQUIRED_LODS = Object.freeze(['LOD0_ROOT', 'LOD1_ROOT', 'LOD2_ROOT']);
const REQUIRED_MARKER_PREFIX = /^(INTERACTION_|SALVAGE_|SOCKET_|ZONE_)/;
const TRANSFORM_TOLERANCE = 1e-5;

if (existsSync(RELEASE_LOCK)) {
  throw new Error(`refusing PQ-018 rebuild while the shared release lock exists: ${RELEASE_LOCK}`);
}

const sourceBytes = await readFile(SOURCE);
assert.equal(
  sha256(sourceBytes),
  EXPECTED_SOURCE_SHA256,
  'PQ-018 release source must remain the reviewed immutable GLB',
);
const sourceInspection = inspectGlbReleaseCompression(SOURCE_REL, {
  root: ROOT,
  releaseMode: false,
});
assert.equal(
  sourceInspection.ok,
  true,
  `source GLB must parse before release rebuild: ${JSON.stringify(sourceInspection.issues)}`,
);

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });

const document = await io.read(SOURCE);
const sourceHierarchy = hierarchySnapshot(document);
const sourceMarkers = markerTransformSnapshot(document);
const sourceNodeCount = document.getRoot().listNodes().length;
assertRequiredIdentity(document);

splitIncompatibleTextureSlots(document);
const normalizedBefore = normalizeNodeRotations(document);
await document.transform(
  ktx2({
    slots: /^(baseColorTexture|emissiveTexture)$/,
    imageDecoder: decodeImage,
    isUASTC: true,
    uastcLDRQualityLevel: 2,
    generateMipmap: true,
    needSupercompression: true,
    isPerceptual: true,
    isSetKTX2SRGBTransferFunc: true,
  }),
  ktx2({
    slots: /^(normalTexture|clearcoatNormalTexture)$/,
    imageDecoder: decodeImage,
    isUASTC: true,
    uastcLDRQualityLevel: 2,
    generateMipmap: true,
    needSupercompression: true,
    isNormalMap: true,
    isPerceptual: false,
    isSetKTX2SRGBTransferFunc: false,
  }),
  ktx2({
    slots: /^(occlusionTexture|metallicRoughnessTexture|roughnessTexture|metalnessTexture|clearcoatTexture|clearcoatRoughnessTexture|anisotropyTexture|transmissionTexture)$/,
    imageDecoder: decodeImage,
    isUASTC: true,
    uastcLDRQualityLevel: 2,
    generateMipmap: true,
    needSupercompression: true,
    isPerceptual: false,
    isSetKTX2SRGBTransferFunc: false,
  }),
  meshopt({
    encoder: MeshoptEncoder,
    ...RELEASE_MESHOPT_OPTIONS,
  }),
);
const normalizedAfter = normalizeNodeRotations(document);
stampReleaseTextureCompression(document);

assert.equal(document.getRoot().listNodes().length, sourceNodeCount, 'node count must remain stable');
assert.deepEqual(hierarchySnapshot(document), sourceHierarchy, 'hierarchy and mesh ownership must remain stable');
assert.deepEqual(markerTransformSnapshot(document), sourceMarkers, 'root, LOD, socket, and zone pivots must remain exact');
assertRequiredIdentity(document);
const transformMetrics = assertLoaderSafeTransforms(document);

await mkdir(dirname(RELEASE), { recursive: true });
const temporary = `${RELEASE}.pq018-${process.pid}.tmp.glb`;
const temporaryRelative = relative(ROOT, temporary).replaceAll('\\', '/');
try {
  await io.write(temporary, document);
  const pair = inspectReleaseAssetPair(SOURCE_REL, temporaryRelative, { root: ROOT });
  assert.equal(
    pair.ok,
    true,
    `rebuilt release failed source/release parity: ${JSON.stringify(pair.issues)}`,
  );
  assert.equal(pair.release.metrics.textureCount, pair.release.metrics.ktx2TextureCount);
  assert.ok(pair.release.metrics.meshoptBufferViewCount > 0, 'release must retain meshopt buffer views');
  await replaceFile(temporary, RELEASE);
} finally {
  await rm(temporary, { force: true }).catch(() => {});
}

const releaseBytes = await readFile(RELEASE);
const releaseInspection = inspectGlbReleaseCompression(RELEASE_REL, {
  root: ROOT,
  releaseMode: true,
});
assert.equal(
  releaseInspection.ok,
  true,
  `rebuilt release compression contract failed: ${JSON.stringify(releaseInspection.issues)}`,
);

console.log(JSON.stringify({
  partId: PART_ID,
  source: {
    path: SOURCE_REL,
    bytes: sourceBytes.length,
    sha256: EXPECTED_SOURCE_SHA256,
  },
  release: {
    path: RELEASE_REL,
    bytes: releaseBytes.length,
    sha256: sha256(releaseBytes),
  },
  compression: {
    textures: releaseInspection.metrics.textureCount,
    ktx2Textures: releaseInspection.metrics.ktx2TextureCount,
    meshoptBufferViews: releaseInspection.metrics.meshoptBufferViewCount,
  },
  transforms: {
    normalizedBefore,
    normalizedAfter,
    nodeCount: sourceNodeCount,
    maxRoundTripDelta: transformMetrics.maxRoundTripDelta,
  },
}, null, 2));

function hierarchySnapshot(doc) {
  return doc.getRoot().listNodes()
    .map((node) => ({
      name: node.getName(),
      parent: node.getParentNode()?.getName() || null,
      children: node.listChildren().map((child) => child.getName()).sort(),
      mesh: node.getMesh()?.getName() || null,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function markerTransformSnapshot(doc) {
  return doc.getRoot().listNodes()
    .filter((node) => (
      node.getName() === REQUIRED_ROOT
      || REQUIRED_LODS.includes(node.getName())
      || REQUIRED_MARKER_PREFIX.test(node.getName())
    ))
    .map((node) => ({
      name: node.getName(),
      translation: node.getTranslation(),
      rotation: node.getRotation(),
      scale: node.getScale(),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function assertRequiredIdentity(doc) {
  const nodes = new Map(doc.getRoot().listNodes().map((node) => [node.getName(), node]));
  for (const name of [REQUIRED_ROOT, ...REQUIRED_LODS]) {
    const node = nodes.get(name);
    assert.ok(node, `missing stable node ${name}`);
    assert.deepEqual(node.getTranslation(), [0, 0, 0], `${name}: translation`);
    assert.deepEqual(node.getRotation(), [0, 0, 0, 1], `${name}: rotation`);
    assert.deepEqual(node.getScale(), [1, 1, 1], `${name}: scale`);
  }
}

function normalizeNodeRotations(doc) {
  let count = 0;
  for (const node of doc.getRoot().listNodes()) {
    const rotation = node.getRotation();
    const length = Math.hypot(...rotation);
    if (!(length > 0) || Math.abs(length - 1) <= Number.EPSILON) continue;
    node.setRotation(rotation.map((value) => value / length));
    count++;
  }
  return count;
}

function assertLoaderSafeTransforms(doc) {
  const matrix = new Matrix4();
  const recomposed = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  let maxRoundTripDelta = 0;
  for (const node of doc.getRoot().listNodes()) {
    matrix.fromArray(node.getWorldMatrix());
    matrix.decompose(position, rotation, scale);
    assert.ok(
      [position.x, position.y, position.z, rotation.x, rotation.y, rotation.z, rotation.w,
        scale.x, scale.y, scale.z].every(Number.isFinite),
      `${node.getName()}: non-finite scene-relative transform`,
    );
    assert.ok(scale.x > 0 && scale.y > 0 && scale.z > 0 && matrix.determinant() > 0,
      `${node.getName()}: mirrored or non-positive scene-relative transform`);
    recomposed.compose(position, rotation, scale);
    for (let index = 0; index < 16; index++) {
      maxRoundTripDelta = Math.max(
        maxRoundTripDelta,
        Math.abs(matrix.elements[index] - recomposed.elements[index]),
      );
    }
    assert.ok(
      maxRoundTripDelta <= TRANSFORM_TOLERANCE,
      `${node.getName()}: transform round-trip ${maxRoundTripDelta} exceeds ${TRANSFORM_TOLERANCE}`,
    );
  }
  return { maxRoundTripDelta };
}

function splitIncompatibleTextureSlots(doc) {
  for (const material of doc.getRoot().listMaterials()) {
    const baseTexture = material.getBaseColorTexture();
    const normalTexture = material.getNormalTexture();
    if (!baseTexture || !normalTexture || baseTexture !== normalTexture) continue;
    const image = normalTexture.getImage();
    if (!image) continue;
    const clone = doc.createTexture(normalTexture.getName()
      ? `${normalTexture.getName()}_normal_slot`
      : 'normal_slot_clone')
      .setImage(image)
      .setMimeType(normalTexture.getMimeType());
    material.setNormalTexture(clone);
  }
}

function stampReleaseTextureCompression(doc) {
  const compression = 'KTX2/BasisU';
  const asset = doc.getRoot().getAsset();
  if (asset.extras?.spacefaceAsset) {
    asset.extras = {
      ...asset.extras,
      spacefaceAsset: {
        ...asset.extras.spacefaceAsset,
        textureCompression: compression,
      },
    };
  }
  for (const scene of doc.getRoot().listScenes()) {
    const extras = scene.getExtras() || {};
    if (!extras.spacefaceAsset) continue;
    scene.setExtras({
      ...extras,
      spacefaceAsset: {
        ...extras.spacefaceAsset,
        textureCompression: compression,
      },
    });
  }
}

function decodeImage(buffer) {
  try {
    const png = PNG.sync.read(Buffer.from(buffer));
    return {
      width: png.width,
      height: png.height,
      data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength),
    };
  } catch {
    const decoded = JPEG.decode(Buffer.from(buffer), { useTArray: true });
    return {
      width: decoded.width,
      height: decoded.height,
      data: new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength),
    };
  }
}

async function replaceFile(temporary, target) {
  try {
    await rename(temporary, target);
    return;
  } catch (error) {
    if (!['EPERM', 'EACCES', 'EBUSY', 'EEXIST', 'UNKNOWN'].includes(error?.code)) throw error;
  }
  await copyFile(temporary, target);
  await rm(temporary, { force: true });
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}
