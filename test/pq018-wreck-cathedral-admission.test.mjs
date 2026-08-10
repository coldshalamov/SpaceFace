// PQ-018 Phase 0/1 — Wreck Cathedral asset admission.
//
// This proves the authored hero landmark reaches the runtime through the ordinary place path:
// frozen source identity, a generated release artifact that preserves every semantic contract node,
// and registration in the runtime place map. It also pins the transform-validation invariant that
// this asset was the first to exercise: shear detection must measure the same angular skew at every
// node scale, because release quantization folds a large dequantization scale into node TRS.
//
// Site wiring, Ceres placement, and route acceptance are later PQ-018 phases and are not claimed here.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as THREE from 'three';

import { AUTHORED_TRANSFORM_SKEW_EPSILON, authoredTransformIssue } from '../src/render/assetLoader.js';
import { PART_LIBRARY_CONTRACT } from '../src/render/partsLibrary.js';

const PART_ID = 'place_landmark_wreck_cathedral';
const PART_FILE = `places/${PART_ID}.glb`;
const SOURCE_PATH = `assets/ships/parts/${PART_FILE}`;
const RELEASE_PATH = `assets/ships/release/parts/${PART_FILE}`;

// The reviewed source candidate is frozen at admission. Any change here invalidates the source
// evidence set in assets/ships/parts/revamp-evidence/place_landmark_wreck_cathedral/.
// Re-author candidate (I-beams, casemate hull banks, material separation, rooted rupture).
const SOURCE_SHA256 = 'd77097b75cbb05c95d9d90e43b2013e89664c956ca55578854ea736657914fdd';
const SOURCE_BYTES = 16993604;

// Every marker the later PQ-018 phases bind against. Release optimization must not rename, merge,
// or drop any of them, and their local transforms must survive byte-for-byte.
const SEMANTIC_MARKERS = Object.freeze([
  'INTERACTION_HangarCavity',
  'SALVAGE_ConduitBank',
  'SALVAGE_EngineMachinery',
  'SALVAGE_ServiceRack',
  'SOCKET_Flythrough_Entry',
  'SOCKET_Flythrough_Exit',
  'SOCKET_TheMarker',
  'ZONE_Bridge',
  'ZONE_BrokenKeel',
  'ZONE_Propulsion',
  'ZONE_Service_Port',
  'ZONE_Service_Starboard',
]);

const JSON_CHUNK = 0x4e4f534a;

function readGlb(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${path}: GLB magic`);
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${path}: declared length`);
  let json = null;
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    assert.ok(offset + 8 + length <= bytes.length, `${path}: chunk bounds`);
    if (type === JSON_CHUNK) {
      json = JSON.parse(bytes.subarray(offset + 8, offset + 8 + length).toString('utf8').replace(/\0+$/, '').trim());
    }
    offset += 8 + length;
  }
  assert.ok(json, `${path}: JSON chunk`);
  return { bytes, json, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function nodesByName(json) {
  return new Map((json.nodes || []).map((node) => [node.name, node]));
}

function triangleCount(json) {
  return (json.meshes || []).reduce((sum, mesh) => sum + (mesh.primitives || []).reduce((meshSum, primitive) => {
    if ((primitive.mode ?? 4) !== 4) return meshSum;
    const count = json.accessors?.[primitive.indices]?.count
      ?? json.accessors?.[primitive.attributes?.POSITION]?.count
      ?? 0;
    return meshSum + Math.floor(count / 3);
  }, 0), 0);
}

const source = readGlb(SOURCE_PATH);
const release = readGlb(RELEASE_PATH);
const partsManifest = JSON.parse(readFileSync('assets/ships/parts/parts_manifest.json', 'utf8'));
const releaseManifest = JSON.parse(readFileSync('assets/ships/release/release_manifest.json', 'utf8'));

test('the reviewed source candidate is the exact asset being admitted', () => {
  assert.equal(source.sha256, SOURCE_SHA256, 'source GLB hash is frozen by the PQ-018 packet');
  assert.equal(source.bytes.length, SOURCE_BYTES);
  assert.equal(source.json.asset?.extras?.spacefaceAsset?.partId, PART_ID);
  assert.equal(source.json.asset?.extras?.spacefaceAsset?.slot, 'place');
  assert.equal(source.json.asset?.extras?.spacefaceAsset?.contractVersion, 1);
});

test('the parts manifest row describes the committed source exactly', () => {
  const part = (partsManifest.parts || []).find((entry) => entry.id === PART_ID);
  assert.ok(part, 'parts_manifest.json declares the landmark');
  assert.equal(part.file, PART_FILE);
  assert.equal(part.category, 'places');
  assert.equal(part.mount, 'origin');
  assert.equal(part.budgetClass, 'landmark', 'a 134k-triangle hero body must not inherit the modular part budget');
  assert.equal(part.bytes, source.bytes.length);
  assert.equal(part.tris, triangleCount(source.json));
  assert.deepEqual([...(part.sockets || [])].sort(),
    SEMANTIC_MARKERS.filter((name) => name.startsWith('SOCKET_')).slice().sort());
  assert.ok((partsManifest.runtimeSlots?.place || []).includes(PART_FILE), 'wired to the place runtime slot');
});

test('the release artifact is generated, compressed, and enumerated', () => {
  const row = (releaseManifest.assets || []).find((entry) => entry.id === PART_ID);
  assert.ok(row, 'release_manifest.json enumerates the landmark');
  assert.equal(row.source, SOURCE_PATH);
  assert.equal(row.release, RELEASE_PATH);
  assert.equal(row.sourceSha256, source.sha256);
  assert.equal(row.releaseSha256, release.sha256);
  assert.equal(row.sourceBytes, source.bytes.length);
  assert.equal(row.releaseBytes, release.bytes.length);
  assert.ok(release.bytes.length < source.bytes.length, 'release build must actually compress the source');

  const textures = release.json.textures || [];
  assert.equal(row.textures, textures.length);
  assert.equal(row.ktx2Textures, textures.length);
  assert.ok(textures.length > 0 && textures.every((texture) => texture.extensions?.KHR_texture_basisu),
    'every release texture is KTX2/BasisU; the 26 authored PNG maps never reach the runtime');
  assert.ok((release.json.extensionsRequired || []).includes('EXT_meshopt_compression'),
    'release geometry is meshopt-compressed');
});

test('release optimization preserves the authored contract surface', () => {
  const sourceNodes = nodesByName(source.json);
  const releaseNodes = nodesByName(release.json);
  assert.equal(releaseNodes.size, sourceNodes.size, 'no contract node is added or dropped');
  assert.equal(triangleCount(release.json), triangleCount(source.json), 'no silent decimation');
  assert.deepEqual(
    (release.json.materials || []).map((material) => material.name),
    (source.json.materials || []).map((material) => material.name),
    'all eight semantic materials survive with their roles',
  );

  for (const name of SEMANTIC_MARKERS) {
    const before = sourceNodes.get(name);
    const after = releaseNodes.get(name);
    assert.ok(before, `${name}: present in source`);
    assert.ok(after, `${name}: preserved through release`);
    // Markers carry no mesh, so quantization never rewrites them; PQ-018 Phase 2/3 anchors
    // components on these exact local offsets.
    assert.deepEqual(after.translation ?? [0, 0, 0], before.translation ?? [0, 0, 0], `${name}: translation`);
    assert.deepEqual(after.rotation ?? [0, 0, 0, 1], before.rotation ?? [0, 0, 0, 1], `${name}: rotation`);
    assert.equal(after.extras?.['spaceface.semanticRole'], before.extras?.['spaceface.semanticRole'], `${name}: role`);
  }

  for (const level of ['LOD0', 'LOD1', 'LOD2']) {
    assert.ok(releaseNodes.has(`${level}_ROOT`), `${level}_ROOT survives release`);
  }
  const lodTriangles = ['LOD0', 'LOD1', 'LOD2'].map((level) => (release.json.nodes || [])
    .filter((node) => node.name?.startsWith(`${level}_`) && node.mesh != null)
    .reduce((sum, node) => sum + (release.json.meshes[node.mesh].primitives || []).reduce((meshSum, primitive) => {
      const count = release.json.accessors?.[primitive.indices]?.count
        ?? release.json.accessors?.[primitive.attributes?.POSITION]?.count ?? 0;
      return meshSum + Math.floor(count / 3);
    }, 0), 0));
  assert.ok(lodTriangles[0] > lodTriangles[1] && lodTriangles[1] > lodTriangles[2],
    `LOD chain must stay strictly reducing; got ${lodTriangles.join('/')}`);
});

test('the landmark resolves through the shared runtime place map', () => {
  assert.ok(PART_LIBRARY_CONTRACT.slots.place.includes(PART_FILE),
    'the renderer resolves the landmark through the same authored-place whitelist as every other place');
});

// Regression: the runtime authored-part contract rejected this asset for "shear" that does not
// exist. Release quantization folds a ~265x dequantization scale into the node TRS, so an absolute
// element epsilon became an angular tolerance 265x stricter than intended and float32 quaternion
// round-off alone tripped it. The invariant is angular, so the tolerance must follow node scale.
test('transform validation measures shear as angular skew, not scaled element error', () => {
  const position = new THREE.Vector3(-10.567, 25.633, -13.587);
  const rotation = new THREE.Quaternion(-0.3623541559249117, -0.6633013071780531, 0.31391004454293425, 0.5746228094583621);
  const uniform = new THREE.Vector3(265.5588194637169, 265.5588081603505, 265.55882066341854);

  const quantized = new THREE.Matrix4().compose(position, rotation, uniform);
  assert.equal(authoredTransformIssue(quantized), null,
    'a release-quantized hero node with an orthogonal basis is not sheared');

  const unit = new THREE.Matrix4().compose(position, rotation, new THREE.Vector3(1, 1, 1));
  assert.equal(authoredTransformIssue(unit), null, 'the same rotation at unit scale is not sheared');

  // A genuine skew of ~1e-3 rad must still be rejected at hero scale.
  const sheared = new THREE.Matrix4().copy(quantized);
  sheared.elements[4] += 1e-3 * uniform.x;
  assert.equal(authoredTransformIssue(sheared), 'shear', 'real skew is still rejected at hero scale');

  const shearedUnit = new THREE.Matrix4().copy(unit);
  shearedUnit.elements[4] += 1e-3;
  assert.equal(authoredTransformIssue(shearedUnit), 'shear', 'real skew is still rejected at unit scale');

  // The historical absolute epsilon stays the floor: a unit-scale node is no more permissive than
  // before this repair, so scaling the tolerance can only ever relax nodes that carry a scale.
  const justOverAtUnitScale = new THREE.Matrix4().copy(unit);
  justOverAtUnitScale.elements[4] += AUTHORED_TRANSFORM_SKEW_EPSILON * 10;
  assert.equal(authoredTransformIssue(justOverAtUnitScale), 'shear',
    'skew just past the epsilon is rejected at unit scale');

  const nonFinite = new THREE.Matrix4();
  nonFinite.elements[0] = Number.NaN;
  assert.equal(authoredTransformIssue(nonFinite), 'scale');
  assert.equal(authoredTransformIssue(new THREE.Matrix4().makeScale(1, -1, 1)), 'mirrored');
  // three.js clamps a degenerate decomposition to unit scale, so a collapsed axis is caught by the
  // determinant arm rather than the scale arm. Pinning it keeps that routing from drifting silently.
  assert.equal(authoredTransformIssue(new THREE.Matrix4().makeScale(1, 0, 1)), 'mirrored');
});

test('every release node of the admitted landmark satisfies the transform contract', () => {
  const offenders = [];
  for (const node of release.json.nodes || []) {
    const matrix = Array.isArray(node.matrix) && node.matrix.length === 16
      ? new THREE.Matrix4().fromArray(node.matrix)
      : new THREE.Matrix4().compose(
        new THREE.Vector3().fromArray(node.translation || [0, 0, 0]),
        new THREE.Quaternion().fromArray(node.rotation || [0, 0, 0, 1]),
        new THREE.Vector3().fromArray(node.scale || [1, 1, 1]),
      );
    const issue = authoredTransformIssue(matrix);
    if (issue) offenders.push(`${node.name}: ${issue}`);
  }
  assert.deepEqual(offenders, [], 'the release artifact loads without an authored-part contract violation');
});
