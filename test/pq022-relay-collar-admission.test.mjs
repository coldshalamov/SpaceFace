// PQ-022.exterior-relay-collar — admission of the authored claim relay/collar.
//
// This proves the exterior relay/collar PQ-024 depends on reaches the runtime through the ordinary
// place path: a frozen source identity, a release artifact that preserves every semantic contract
// node, exact manifest/runtime identity, the PQ-017 world-site binding pinned to the same bytes,
// and the Asteroid Ops exterior projection that puts exactly one relay beside an anchored rock.
//
// It also pins the one bookkeeping defect found during admission: the parts_manifest bounds row for
// this family is recorded in the Blender authoring axis order, not the declared +Y-up contract. The
// row is inert at runtime because src/render/assetLoader.js derives bounds with Box3.setFromObject
// on the loaded GLB, and because every consumer of the row uses order-invariant quantities. The
// assertions below hold that inertness in place so the mismatch cannot start mattering silently.
//
// Exact-final visual acceptance at the game camera, Browser/Electron route acceptance, and matched
// performance are NOT claimed here. They remain the explicit revised H1/review/H3 dispatch chain.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import * as THREE from 'three';

import { authoredTransformIssue } from '../src/render/assetLoader.js';
import { PART_LIBRARY_CONTRACT, resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { WORLD_SITE_ASSET_BINDINGS } from '../src/data/worldSiteAssetBindings.js';
import { asteroidSites, makeSiteRecord } from '../src/systems/asteroidSites.js';

const PART_ID = 'place_claim_outpost_relay';
const ASSET_ID = 'SF_PLACE_CLAIM_OUTPOST_RELAY';
const ROOT_NODE = 'SF_PLACE_CLAIM_OUTPOST_RELAY_ROOT';
const PART_FILE = `places/${PART_ID}.glb`;
const SOURCE_PATH = `assets/ships/parts/${PART_FILE}`;
const RELEASE_PATH = `assets/ships/release/parts/${PART_FILE}`;

// The reviewed source candidate is frozen at admission. Any change here invalidates the evidence
// record at assets/ships/m5_claim_outposts/evidence/place_claim_outpost_relay.json and both
// manifest rows, which pin these exact bytes.
const SOURCE_SHA256 = '57f6e1a42d0f1b259aada019e1960d1cbb4f81cbe0aaabfe66ed0248a8e206c9';
const SOURCE_BYTES = 13424076;
const RELEASE_SHA256 = '85b8d74e7719203766937289b2ed5756294c4a9d48612c0432c6f036644167a8';
const RELEASE_BYTES = 3338672;
const TECHNICAL_CANDIDATE_PATH = 'assets/ships/m5_claim_outposts/source_candidates/material_truth_v2/places/place_claim_outpost_relay.glb';
const TECHNICAL_CANDIDATE_SHA256 = 'a8789308e39f733bc6565198b2afee0ba5fd106affc54a22dd7d30e40ac10a7a';
const TECHNICAL_CANDIDATE_BYTES = 13416020;
const VALIDATION_BINDING_PATH = 'assets/ships/m5_claim_outposts/evidence/place_claim_outpost_relay_material_truth_v2/validation/validation_binding.json';

// Every socket the PQ-017 world site and any later PQ-024 collar binding anchors against.
const SOCKETS = Object.freeze([
  'SOCKET_Dock_Approach',
  'SOCKET_Emissive',
  'SOCKET_Module_Defense',
  'SOCKET_Module_Depot',
  'SOCKET_Module_Refinery',
  'SOCKET_Module_Teleporter',
  'SOCKET_Structure_Core',
]);

// Measured from both GLBs with node transforms applied. LOD0 is the authored envelope the runtime
// scales against; the chain must stay strictly reducing.
const LOD_TRIANGLES = Object.freeze({ LOD0: 62992, LOD1: 27592, LOD2: 8384 });
const AUTHORED_X_LENGTH_M = 104.3364;

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function readGlb(path) {
  const bytes = readFileSync(path);
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${path}: GLB magic`);
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${path}: declared length`);
  let json = null;
  let binary = Buffer.alloc(0);
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    assert.ok(offset + 8 + length <= bytes.length, `${path}: chunk bounds`);
    if (type === JSON_CHUNK) {
      json = JSON.parse(bytes.subarray(offset + 8, offset + 8 + length).toString('utf8').replace(/\0+$/, '').trim());
    }
    if (type === BIN_CHUNK) binary = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 8 + length;
  }
  assert.ok(json, `${path}: JSON chunk`);
  return { bytes, json, binary, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function accessorValues(glb, accessorIndex) {
  const accessor = glb.json.accessors[accessorIndex];
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
  const component = {
    5121: { bytes: 1, read: (offset) => glb.binary.readUInt8(offset) },
    5123: { bytes: 2, read: (offset) => glb.binary.readUInt16LE(offset) },
    5125: { bytes: 4, read: (offset) => glb.binary.readUInt32LE(offset) },
    5126: { bytes: 4, read: (offset) => glb.binary.readFloatLE(offset) },
  }[accessor.componentType];
  assert.ok(components && component && accessor.sparse == null, 'relay accessor must use supported dense data');
  const view = glb.json.bufferViews[accessor.bufferView];
  assert.equal(view.buffer ?? 0, 0, 'relay source accessors stay in the embedded BIN chunk');
  const packedStride = component.bytes * components;
  const stride = view.byteStride ?? packedStride;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return Array.from({ length: accessor.count }, (_, index) => {
    const row = Array.from({ length: components }, (_unused, axis) => (
      component.read(start + index * stride + axis * component.bytes)
    ));
    return components === 1 ? row[0] : row;
  });
}

function nonManifoldEdgeCount(glb, primitive) {
  const positions = accessorValues(glb, primitive.attributes.POSITION);
  const indices = primitive.indices == null
    ? Array.from({ length: positions.length }, (_, index) => index)
    : accessorValues(glb, primitive.indices);
  const weldedByPosition = new Map();
  const weldedByVertex = positions.map((position) => {
    const key = position.map((value) => Math.round(value * 1e6)).join(':');
    if (!weldedByPosition.has(key)) weldedByPosition.set(key, weldedByPosition.size);
    return weldedByPosition.get(key);
  });
  const edges = new Map();
  for (let offset = 0; offset + 2 < indices.length; offset += 3) {
    const triangle = indices.slice(offset, offset + 3).map((index) => weldedByVertex[index]);
    for (const [left, right] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
      const key = left < right ? `${left}:${right}` : `${right}:${left}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  return [...edges.values()].filter((count) => count !== 2).length;
}

function nodesByName(json) {
  return new Map((json.nodes || []).map((node) => [node.name, node]));
}

function primitiveTriangles(json, primitive) {
  if ((primitive.mode ?? 4) !== 4) return 0;
  const count = json.accessors?.[primitive.indices]?.count
    ?? json.accessors?.[primitive.attributes?.POSITION]?.count
    ?? 0;
  return Math.floor(count / 3);
}

function triangleCount(json) {
  return (json.meshes || []).reduce((sum, mesh) => sum
    + (mesh.primitives || []).reduce((meshSum, primitive) => meshSum + primitiveTriangles(json, primitive), 0), 0);
}

function lodTriangles(json, level) {
  return (json.nodes || [])
    .filter((node) => typeof node.name === 'string' && node.name.startsWith(`${level}_`) && node.mesh != null)
    .reduce((sum, node) => sum + (json.meshes[node.mesh].primitives || [])
      .reduce((meshSum, primitive) => meshSum + primitiveTriangles(json, primitive), 0), 0);
}

const source = readGlb(SOURCE_PATH);
const release = readGlb(RELEASE_PATH);
const partsManifest = JSON.parse(readFileSync('assets/ships/parts/parts_manifest.json', 'utf8'));
const releaseManifest = JSON.parse(readFileSync('assets/ships/release/release_manifest.json', 'utf8'));
const evidence = JSON.parse(readFileSync(
  'assets/ships/m5_claim_outposts/evidence/place_claim_outpost_relay.json', 'utf8'));
const manifestPart = (partsManifest.parts || []).find((entry) => entry.id === PART_ID);

test('validator reports are cryptographically bound to the exact technical candidate', () => {
  const candidateBytes = readFileSync(TECHNICAL_CANDIDATE_PATH);
  const binding = JSON.parse(readFileSync(VALIDATION_BINDING_PATH, 'utf8'));
  assert.equal(binding.schema, 'spaceface.claimOutpostRelayValidationBinding.v1');
  assert.equal(binding.assetId, PART_ID);
  assert.equal(binding.candidate.path, TECHNICAL_CANDIDATE_PATH);
  assert.equal(binding.candidate.bytes, TECHNICAL_CANDIDATE_BYTES);
  assert.equal(candidateBytes.length, TECHNICAL_CANDIDATE_BYTES);
  assert.equal(createHash('sha256').update(candidateBytes).digest('hex'), TECHNICAL_CANDIDATE_SHA256);
  assert.equal(binding.candidate.sha256, TECHNICAL_CANDIDATE_SHA256);
  for (const validator of ['foundry', 'khronos']) {
    const record = binding.validators[validator];
    const reportBytes = readFileSync(record.report);
    assert.equal(
      createHash('sha256').update(reportBytes).digest('hex'),
      record.reportSha256,
      `${validator} report bytes stay bound to this candidate validation epoch`,
    );
  }
});

test('the reviewed source candidate is the exact asset being admitted', () => {
  assert.equal(source.sha256, SOURCE_SHA256, 'source GLB hash is frozen by this leaf');
  assert.equal(source.bytes.length, SOURCE_BYTES);
  const stamp = source.json.asset?.extras?.spacefaceAsset;
  assert.ok(stamp, 'the source carries the spacefaceAsset contract stamp');
  assert.equal(stamp.contractVersion, 1);
  assert.equal(stamp.partId, PART_ID);
  assert.equal(stamp.assetId, ASSET_ID);
  assert.equal(stamp.slot, 'place');
  assert.equal(stamp.unit, 'metre');
  assert.equal(stamp.role, 'spec_relay', 'the relay identity the claim spec resolves against');

  // The defect class that made place_debris_chunk unloadable in PQ-018: absent extras, zero
  // embedded images, or geometry with no UV0. None of them are present here.
  assert.ok((source.json.images || []).length > 0, 'source embeds its authored maps');
  assert.equal((source.json.images || []).length, 15);
  const missingUv = (source.json.meshes || []).flatMap((mesh) => (mesh.primitives || [])
    .filter((primitive) => primitive.attributes?.TEXCOORD_0 == null));
  assert.equal(missingUv.length, 0, 'every primitive carries UV0');
});

test('the evidence record and the parts manifest row describe the committed source exactly', () => {
  assert.equal(evidence.sha256, source.sha256, 'the authored evidence record pins these bytes');
  assert.equal(evidence.bytes, source.bytes.length);
  assert.equal(evidence.canonical, SOURCE_PATH);

  assert.ok(manifestPart, 'parts_manifest.json declares the relay');
  assert.equal(manifestPart.file, PART_FILE);
  assert.equal(manifestPart.category, 'places');
  assert.equal(manifestPart.mount, 'origin');
  assert.equal(manifestPart.bytes, source.bytes.length);
  assert.equal(manifestPart.tris, LOD_TRIANGLES.LOD0,
    'the manifest triangle budget is the LOD0 body, not the summed chain');
  assert.deepEqual([...(manifestPart.sockets || [])].sort(), [...SOCKETS].sort());
  assert.ok((partsManifest.runtimeSlots?.place || []).includes(PART_FILE), 'wired to the place runtime slot');
});

test('the release artifact is generated, compressed, and enumerated', () => {
  const row = (releaseManifest.assets || []).find((entry) => entry.id === PART_ID);
  assert.ok(row, 'release_manifest.json enumerates the relay');
  assert.equal(row.source, SOURCE_PATH);
  assert.equal(row.release, RELEASE_PATH);
  assert.equal(row.sourceSha256, source.sha256);
  assert.equal(row.releaseSha256, release.sha256);
  assert.equal(release.sha256, RELEASE_SHA256);
  assert.equal(row.sourceBytes, source.bytes.length);
  assert.equal(row.releaseBytes, release.bytes.length);
  assert.equal(release.bytes.length, RELEASE_BYTES);
  assert.ok(release.bytes.length < source.bytes.length, 'the release build actually compresses the source');

  const textures = release.json.textures || [];
  assert.equal(row.textures, textures.length);
  assert.equal(row.ktx2Textures, textures.length);
  assert.ok(textures.length > 0 && textures.every((texture) => texture.extensions?.KHR_texture_basisu),
    'every release texture is KTX2/BasisU; the authored PNG maps never reach the runtime');
  assert.ok((release.json.extensionsRequired || []).includes('EXT_meshopt_compression'),
    'release geometry is meshopt-compressed');
  // PQ-018 recorded that the Cathedral's release artifact inherited the source's
  // textureCompression: "PNG-source" stamp. This asset does not: its release stamp is rewritten.
  assert.equal(source.json.asset?.extras?.spacefaceAsset?.textureCompression, 'PNG-source');
  assert.equal(release.json.asset?.extras?.spacefaceAsset?.textureCompression, 'KTX2/BasisU+mips',
    'the release stamp records its own mipmapped compression rather than inheriting PNG-source');
});

test('release optimization preserves the authored contract surface', () => {
  const sourceNodes = nodesByName(source.json);
  const releaseNodes = nodesByName(release.json);
  assert.equal(releaseNodes.size, sourceNodes.size, 'no contract node is added or dropped');
  assert.equal(releaseNodes.size, 24);
  assert.equal(triangleCount(release.json), triangleCount(source.json), 'no silent decimation');
  assert.deepEqual(
    (release.json.materials || []).map((material) => material.name),
    (source.json.materials || []).map((material) => material.name),
    'all five semantic materials survive with their roles',
  );

  for (const level of ['LOD0', 'LOD1', 'LOD2']) {
    assert.equal(lodTriangles(source.json, level), LOD_TRIANGLES[level], `${level}: source triangles`);
    assert.equal(lodTriangles(release.json, level), LOD_TRIANGLES[level], `${level}: release triangles`);
  }
  assert.ok(LOD_TRIANGLES.LOD0 > LOD_TRIANGLES.LOD1 && LOD_TRIANGLES.LOD1 > LOD_TRIANGLES.LOD2,
    'the LOD chain is a real reduction, not exported copies of LOD0');

  // A single authored root at identity is what centerAuthoredPlaceRoot and the world-site binding
  // both assume; a second top-level node would silently split the object.
  for (const glb of [source, release]) {
    const scene = glb.json.scenes[glb.json.scene ?? 0];
    assert.deepEqual((scene.nodes || []).map((index) => glb.json.nodes[index].name), [ROOT_NODE]);
    const root = nodesByName(glb.json).get(ROOT_NODE);
    assert.deepEqual(root.translation ?? [0, 0, 0], [0, 0, 0]);
    assert.deepEqual(root.rotation ?? [0, 0, 0, 1], [0, 0, 0, 1]);
    assert.deepEqual(root.scale ?? [1, 1, 1], [1, 1, 1]);
  }

  for (const name of SOCKETS) {
    const before = sourceNodes.get(name);
    const after = releaseNodes.get(name);
    assert.ok(before, `${name}: present in source`);
    assert.ok(after, `${name}: preserved through release`);
    // Sockets carry no mesh, so quantization never rewrites them. PQ-024 anchors the collar on
    // these exact local offsets.
    assert.deepEqual(after.translation ?? [0, 0, 0], before.translation ?? [0, 0, 0], `${name}: translation`);
    assert.deepEqual(after.rotation ?? [0, 0, 0, 1], before.rotation ?? [0, 0, 0, 1], `${name}: rotation`);
    assert.deepEqual(after.scale ?? [1, 1, 1], before.scale ?? [1, 1, 1], `${name}: scale`);
    assert.equal(after.mesh, undefined, `${name}: stays a marker`);
  }
});

test('every visible relay mesh is closed, so runtime front-face culling preserves its authored surface', () => {
  const offenders = [];
  for (const node of source.json.nodes || []) {
    if (!/^LOD[012]_/.test(node.name || '') || node.mesh == null) continue;
    for (const [index, primitive] of (source.json.meshes[node.mesh].primitives || []).entries()) {
      const nonManifoldEdges = nonManifoldEdgeCount(source, primitive);
      if (nonManifoldEdges > 0) offenders.push({ node: node.name, primitive: index, nonManifoldEdges });
    }
  }
  assert.deepEqual(offenders, [],
    'the hash-pinned authored relay has no open/non-manifold edge that would need a visible back face');
});

test('every release node of the admitted relay satisfies the authored transform contract', () => {
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

test('the relay resolves through the shared runtime place map', () => {
  assert.ok(PART_LIBRARY_CONTRACT.slots.place.includes(PART_FILE),
    'the renderer resolves the relay through the same authored-place whitelist as every other place');
  assert.equal(
    resolvePlaceFileForEntity({ type: 'fx', data: { claimSpecId: 'spec_relay', landmarkGlb: 'place_asteroid_rock_a' } }),
    PART_FILE,
    'the spec_relay claim identity resolves to this exact file with no second filename table',
  );
});

test('the PQ-017 world-site binding is pinned to the exact admitted bytes and sockets', () => {
  const binding = WORLD_SITE_ASSET_BINDINGS[PART_ID];
  assert.ok(binding, 'the world-site binding names the relay');
  assert.equal(binding.contractVersion, 1);
  assert.equal(binding.assetId, ASSET_ID);
  assert.equal(binding.source.path, SOURCE_PATH);
  assert.equal(binding.source.sha256, source.sha256);
  assert.equal(binding.source.bytes, source.bytes.length);
  assert.equal(binding.release.path, RELEASE_PATH);
  assert.equal(binding.release.sha256, release.sha256);
  assert.equal(binding.release.bytes, release.bytes.length);
  assert.equal(binding.root.name, ROOT_NODE);

  // Simulation never parses renderer assets, so the snapshot has to be verified against them.
  const sourceNodes = nodesByName(source.json);
  const releaseNodes = nodesByName(release.json);
  for (const name of SOCKETS) {
    const pinned = binding.sockets[name];
    assert.ok(pinned, `${name}: present in the binding snapshot`);
    assert.deepEqual([...pinned.transform.translation], sourceNodes.get(name).translation ?? [0, 0, 0],
      `${name}: binding matches the source GLB`);
    assert.deepEqual([...pinned.transform.translation], releaseNodes.get(name).translation ?? [0, 0, 0],
      `${name}: binding matches the release GLB`);
  }
});

// The parts_manifest bounds row for this family is written in the Blender authoring axis order:
// measured against the GLBs, manifest.y === -glb.z and manifest.z === +glb.y. The runtime never
// reads it (assetLoader derives bounds via Box3.setFromObject on the loaded scene), and every
// consumer of the row uses order-invariant quantities. These assertions keep that true, so the
// mismatch stays inert bookkeeping instead of becoming a live scale bug.
test('the manifest bounds row cannot affect runtime scale regardless of its axis order', () => {
  const size = manifestPart.bounds.dimensionsM;
  assert.equal(size.length, 3);
  assert.equal(size[0], AUTHORED_X_LENGTH_M, 'the +X authoring length is the one axis both frames agree on');

  // src/render/partsLibrary.js buildPlacePropRoot: authoredLength = size[0] and
  // authoredEnvelope = max(size). Both are order-invariant here because +X is the longest axis, so
  // placeScale stays an exact uniform multiplier on the authored metre length.
  assert.equal(Math.max(...size), size[0],
    '+X is the longest authored axis, so max(size) === size[0] and the Y/Z order cannot change scale');
  assert.deepEqual([...size].sort((a, b) => a - b), [...evidence.aabb.size].sort((a, b) => a - b),
    'the manifest row and the authored evidence record carry the same three magnitudes');
});

test('the Asteroid Ops exterior route projects exactly one relay beside an anchored rock', () => {
  const entities = new Map();
  const spawned = [];
  let nextId = 100;
  const bus = { on: () => () => {}, emit: () => {} };
  const state = {
    simTime: 0, tick: 0, meta: { seed: 47 }, entities, playerId: 1,
    world: { currentSectorId: 'sec_core_alpha' },
  };
  const helpers = {
    spawnEntity(spec) {
      const ent = { id: nextId++, alive: true, ...spec };
      ent.data = spec.data || {};
      entities.set(ent.id, ent);
      spawned.push(ent);
      return ent;
    },
  };
  const sys = Object.create(asteroidSites);
  sys.init({ state, bus, helpers, registry: { get: () => null } });

  const rock = {
    id: 42, type: 'asteroid', alive: true, pos: { x: 120, z: -40 }, radius: 9,
    data: { typeId: 'ast_common_rock', yieldU: 18, drillCleared: [], fieldId: 'field_1' },
  };
  entities.set(rock.id, rock);
  const site = makeSiteRecord({
    id: 'site_relay_probe', asteroidId: rock.id, sectorId: 'sec_core_alpha', fieldId: 'field_1', createdT: 0,
  });
  site.anchored = true;

  sys._ensureBeacon(site);
  const relays = spawned.filter((ent) => ent.data.placeId === PART_ID);
  assert.equal(relays.length, 1, 'anchoring a site puts exactly one relay in the flight world');
  const relay = relays[0];

  assert.equal(relay.type, 'fx', 'the exterior relay is dressing, not a simulated body');
  assert.equal(relay.collides, false, 'dressing never collides');
  assert.equal(relay.data.worldDressing, true);
  assert.equal(relay.data.siteBeacon, site.id, 'the relay is attributable to its site');
  assert.equal(relay.data.sectorId, 'sec_core_alpha');
  assert.equal(relay.factionId, 'faction_player', 'the player owns the industry that altered space');

  // The authored relay is an outpost-scale body; bolted beside a ~10 m rock it is presented at 0.16.
  // placeScale is a raw uniform multiplier on the authored envelope (buildPlacePropRoot only
  // normalizes when placeTargetRadius is supplied, and the exterior projection supplies none).
  // Confirmed live: the capture manifest records authoredWorldScale 0.16 and
  // authoredSourceEnvelope 104.33640453118832, giving the stamped visualBounds length below. The
  // mesh actually drawn is smaller (13.609 m measured, i.e. 85.06 authored m). The gap arises
  // inside instantiation, not from the loader's bounds: sockets are mesh-less and cannot expand a
  // Box3, and the capture measures setFromObject at 13.609 against a mesh-only walk at 13.608.
  // Recorded as an open row in the leaf receipt, not asserted as an equality here.
  assert.equal(relay.data.placeScale, 0.16);
  const envelopeMetres = AUTHORED_X_LENGTH_M * relay.data.placeScale;
  assert.ok(Math.abs(envelopeMetres - 16.6938) < 1e-3,
    `the scaled authored envelope is ~16.69 m along +X, got ${envelopeMetres}`);
  assert.ok(envelopeMetres > rock.radius, 'the relay reads as infrastructure against the rock it claims');

  // Placed on the rock's contact ring, deterministically from the site id.
  const dist = Math.hypot(relay.pos.x - rock.pos.x, relay.pos.z - rock.pos.z);
  assert.ok(Math.abs(dist - (rock.radius + 7)) < 1e-6, 'the relay sits on the rock contact ring');

  // Re-ensuring is idempotent: a sector revisit must not stack relays.
  sys._ensureBeacon(site);
  sys._ensureBeacon(site);
  assert.equal(spawned.filter((ent) => ent.data.placeId === PART_ID).length, 1,
    're-entering the sector re-uses the live relay instead of spawning another');

  // Despawn (sector unload) releases the relay, and the next visit re-ensures exactly one.
  relay.alive = false;
  entities.delete(relay.id);
  sys._ensureBeacon(site);
  const after = spawned.filter((ent) => ent.data.placeId === PART_ID && ent.alive !== false);
  assert.equal(after.length, 1, 'a despawned relay is re-ensured exactly once on the next visit');
});
