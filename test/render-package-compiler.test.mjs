import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Document, NodeIO } from '@gltf-transform/core';
import { KHRMeshPrimitiveRestart } from '@gltf-transform/extensions';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import {
  RENDER_PACKAGE_SCHEMA,
  RENDER_PACKAGE_SOURCE_SCHEMA,
  validateRenderPackage,
} from '../src/contracts/renderPackage.js';
import {
  compileRenderPackage,
  normalizeSemanticManifest,
} from '../scripts/lib/renderPackageCompiler.mjs';
import {
  compareRenderPackageDirectories,
  compareRenderPackageToSource,
} from '../scripts/check-render-package-equivalence.mjs';
import { createRenderPackageLoader } from '../src/render/renderPackageLoader.js';

const HASH = '0'.repeat(64);
const IDENTITY = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const COMPILE_SCRIPT = fileURLToPath(new URL('../scripts/compile-render-packages.mjs', import.meta.url));

function minimalPackage() {
  return {
    schema: RENDER_PACKAGE_SCHEMA,
    assetId: 'fixture.ship',
    kind: 'ship',
    compiler: { name: 'spaceface-render-package-compiler', version: '1.0.0' },
    contentHash: HASH,
    render: { uri: 'render.glb', sha256: HASH, bytes: 20 },
    provenance: {
      sourceGlb: { uri: 'fixture.glb', sha256: HASH, bytes: 20 },
      sourceManifest: null,
      semantics: { sha256: HASH },
    },
    nodes: [{
      id: 'fixture.body',
      nodeName: 'Hull',
      nodePath: [0],
      role: 'immutable',
      parentId: null,
      localTransform: [...IDENTITY],
      worldTransform: [...IDENTITY],
      materialPipelineKey: 'opaque:front',
      spatialClusterId: 'body',
      mergeBoundary: 'body',
    }],
    anchors: [],
    dynamicGroups: [],
    geometry: [],
    materials: [],
    lods: [],
    hlods: [],
    collisions: [],
    spatialClusters: [{ id: 'body', nodeIds: ['fixture.body'], bounds: null }],
  };
}

function semanticManifest({ reverse = false, unsafeMerge = false } = {}) {
  const semanticNodes = [
    {
      id: 'fixture.body',
      node: 'Hull',
      role: 'immutable',
      mergeBoundary: 'body',
      pipelineKey: 'opaque:front',
      transparency: 'opaque',
      cullingGroup: 'body',
      spatialClusterId: 'body',
    },
    {
      id: 'fixture.turret',
      node: 'Turret',
      role: 'dynamic',
      mergeBoundary: 'turret',
      pipelineKey: 'opaque:front',
      transparency: 'opaque',
      cullingGroup: 'turret',
      independentlyCulled: true,
      spatialClusterId: 'body',
    },
    {
      id: 'fixture.wing',
      node: 'Wing',
      role: 'immutable',
      mergeBoundary: 'body',
      pipelineKey: 'opaque:front',
      transparency: 'opaque',
      cullingGroup: 'body',
      spatialClusterId: 'body',
    },
  ];
  const anchors = [{
    id: 'fixture.trail.left',
    node: 'FX_Trail_Left',
    kind: 'trail',
    parentNodeId: 'fixture.body',
  }];
  const dynamicGroups = [{
    id: 'fixture.turret.group',
    nodeId: 'fixture.turret',
    kind: 'moving-part',
  }];
  return {
    schema: RENDER_PACKAGE_SOURCE_SCHEMA,
    assetId: 'fixture.ship',
    kind: 'ship',
    semanticNodes: reverse ? semanticNodes.toReversed() : semanticNodes,
    anchors: reverse ? anchors.toReversed() : anchors,
    dynamicGroups: reverse ? dynamicGroups.toReversed() : dynamicGroups,
    mergeGroups: [{
      id: 'fixture.merge.body',
      nodeIds: unsafeMerge
        ? ['fixture.body', 'fixture.turret']
        : ['fixture.body', 'fixture.wing'],
    }],
    lods: [],
    hlods: [],
    collisions: [],
  };
}

function createTrianglePrimitive(document, buffer, options = {}) {
  const prefix = options.prefix || 'fixture';
  const positions = document.createAccessor(`${prefix}-positions`)
    .setType('VEC3')
    .setArray(new Float32Array(options.positions || [
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ]))
    .setBuffer(buffer);
  if (options.positionExtras) positions.setExtras(options.positionExtras);
  const normals = document.createAccessor(`${prefix}-normals`)
    .setType('VEC3')
    .setArray(options.normalizedNormal
      ? new Int8Array([0, 0, 127, 0, 0, 127, 0, 0, 127])
      : new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]))
    .setNormalized(options.normalizedNormal === true)
    .setBuffer(buffer);
  const indices = document.createAccessor(`${prefix}-indices`)
    .setType('SCALAR')
    .setArray(new Uint16Array([0, 1, 2]))
    .setBuffer(buffer);
  const material = document.createMaterial(options.materialName || `${prefix}-material`)
    .setBaseColorFactor(options.color || [0.2, 0.4, 0.7, 1]);
  const primitive = document.createPrimitive()
    .setAttribute('POSITION', positions)
    .setAttribute('NORMAL', normals)
    .setIndices(indices)
    .setMaterial(material)
    .setMode(options.primitiveMode ?? 4);

  if (options.tangent) {
    primitive.setAttribute('TANGENT', document.createAccessor(`${prefix}-tangents`)
      .setType('VEC4')
      .setArray(new Float32Array([
        1, 0, 0, 1,
        1, 0, 0, 1,
        1, 0, 0, 1,
      ]))
      .setBuffer(buffer));
  }
  if (options.morphTarget) {
    const target = document.createPrimitiveTarget(options.targetName || 'Pulse')
      .setAttribute('POSITION', document.createAccessor(`${prefix}-morph-positions`)
        .setType('VEC3')
        .setArray(new Float32Array([
          0.1, 0, 0,
          0.1, 0, 0,
          0.1, 0, 0,
        ]))
        .setBuffer(buffer));
    primitive.addTarget(target);
  }
  return primitive;
}

function singleNodeManifest({ node = 'Hull', anchors = [] } = {}) {
  return {
    schema: RENDER_PACKAGE_SOURCE_SCHEMA,
    assetId: 'fixture.ship',
    kind: 'ship',
    semanticNodes: [{
      id: 'fixture.body',
      node,
      role: 'immutable',
      parentId: null,
      mergeBoundary: 'body',
      pipelineKey: 'opaque:front',
      transparency: 'opaque',
      cullingGroup: 'body',
      independentlyCulled: false,
      spatialClusterId: 'body',
    }],
    anchors,
    dynamicGroups: [],
    mergeGroups: [],
    lods: [],
    hlods: [],
    collisions: [],
  };
}

async function createTinyIndexedFixture(path, { primitiveMode = 4 } = {}) {
  const document = new Document();
  const buffer = document.createBuffer('fixture-buffer');
  const positions = document.createAccessor('fixture-positions')
    .setType('VEC3')
    .setArray(new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
    ]))
    .setBuffer(buffer);
  const normals = document.createAccessor('fixture-normals')
    .setType('VEC3')
    .setArray(new Float32Array([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
    ]))
    .setBuffer(buffer);
  const indices = document.createAccessor('fixture-indices')
    .setType('SCALAR')
    .setArray(new Uint16Array([0, 1, 2]))
    .setBuffer(buffer);
  const material = document.createMaterial('HullMaterial')
    .setBaseColorFactor([0.2, 0.4, 0.7, 1])
    .setMetallicFactor(0.6)
    .setRoughnessFactor(0.35);
  const primitive = document.createPrimitive()
    .setAttribute('POSITION', positions)
    .setAttribute('NORMAL', normals)
    .setIndices(indices)
    .setMaterial(material)
    .setMode(primitiveMode);
  const mesh = document.createMesh('FixtureMesh').addPrimitive(primitive);

  const hull = document.createNode('Hull').setMesh(mesh).setTranslation([2, 0, 0]);
  const trailAnchor = document.createNode('FX_Trail_Left').setTranslation([-0.5, 0, -1]);
  hull.addChild(trailAnchor);
  const wing = document.createNode('Wing').setMesh(mesh).setTranslation([4, 0, 0]);
  const turret = document.createNode('Turret').setMesh(mesh).setTranslation([0, 0.25, 0]);
  document.createScene('FixtureScene').addChild(hull).addChild(wing).addChild(turret);

  await new NodeIO().write(path, document);
}

async function createUnsupportedBakeFixture(path, options = {}) {
  const document = new Document();
  const buffer = document.createBuffer('fixture-buffer');
  const primitive = createTrianglePrimitive(document, buffer, {
    prefix: 'unsupported',
    normalizedNormal: options.normalizedNormal,
    tangent: options.tangent,
    morphTarget: options.morphTarget,
    positionExtras: options.positionExtras,
  });
  const mesh = document.createMesh('UnsupportedMesh').addPrimitive(primitive);
  const hull = document.createNode('Hull').setMesh(mesh);
  if (options.negativeScale) hull.setScale([-1, 1, 1]);
  else hull.setTranslation([2, 0, 0]);
  if (options.reservedExtras) {
    hull.setExtras({ spacefaceRenderPackageSemantic: { forged: true } });
  }
  const scene = document.createScene('FixtureScene').addChild(hull);

  if (options.primitiveRestart) {
    document.createExtension(KHRMeshPrimitiveRestart).setRequired(true);
  }

  if (options.skinJoint) {
    const inverseBind = document.createAccessor('inverse-bind')
      .setType('MAT4')
      .setArray(new Float32Array(IDENTITY))
      .setBuffer(buffer);
    const skin = document.createSkin('FixtureSkin')
      .addJoint(hull)
      .setSkeleton(hull)
      .setInverseBindMatrices(inverseBind);
    scene.addChild(document.createNode('Skinned').setMesh(mesh).setSkin(skin));
  }

  const io = new NodeIO();
  if (options.primitiveRestart) io.registerExtensions([KHRMeshPrimitiveRestart]);
  await io.write(path, document);
}

async function createCarrierFixture(path) {
  const document = new Document();
  const buffer = document.createBuffer('fixture-buffer');
  const mesh = document.createMesh('CarrierMesh')
    .addPrimitive(createTrianglePrimitive(document, buffer, { prefix: 'carrier' }));
  const hull = document.createNode('Hull').setMesh(mesh).setScale([2, 1, 1]);
  const anchor = document.createNode('FX_Trail_Left')
    .setTranslation([0.25, 0.5, -1])
    .setRotation([0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)]);
  const turret = document.createNode('Turret')
    .setMesh(mesh)
    .setTranslation([0.5, 0.25, 0])
    .setRotation([0, 0, Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)]);
  hull.addChild(anchor).addChild(turret);
  document.createScene('FixtureScene').addChild(hull);
  await new NodeIO().write(path, document);
}

function carrierManifest() {
  const manifest = singleNodeManifest();
  manifest.semanticNodes.push({
    id: 'fixture.turret',
    node: 'Turret',
    role: 'dynamic',
    parentId: 'fixture.body',
    mergeBoundary: 'turret',
    pipelineKey: 'opaque:front',
    transparency: 'opaque',
    cullingGroup: 'turret',
    independentlyCulled: true,
    spatialClusterId: 'body',
  });
  manifest.anchors.push({
    id: 'fixture.trail.left',
    node: 'FX_Trail_Left',
    kind: 'trail',
    parentNodeId: 'fixture.body',
  });
  manifest.dynamicGroups.push({
    id: 'fixture.turret.group',
    nodeId: 'fixture.turret',
    kind: 'moving-part',
  });
  return manifest;
}

async function createMorphIdentityFixture(path) {
  const document = new Document();
  const buffer = document.createBuffer('fixture-buffer');
  const primitive = createTrianglePrimitive(document, buffer, {
    prefix: 'morph',
    morphTarget: true,
    targetName: 'Pulse',
  });
  const mesh = document.createMesh('MorphMesh')
    .setExtras({ targetNames: ['Pulse'] })
    .addPrimitive(primitive);
  document.createScene('FixtureScene').addChild(document.createNode('Hull').setMesh(mesh));
  await new NodeIO().write(path, document);
}

async function createMultiPrimitiveSlashFixture(path) {
  const document = new Document();
  const buffer = document.createBuffer('fixture-buffer');
  const mesh = document.createMesh('SlashMesh')
    .addPrimitive(createTrianglePrimitive(document, buffer, {
      prefix: 'slash-a',
      materialName: 'SlashMaterialA',
    }))
    .addPrimitive(createTrianglePrimitive(document, buffer, {
      prefix: 'slash-b',
      materialName: 'SlashMaterialB',
      positions: [0, 0, 1, 1, 0, 1, 0, 1, 1],
      color: [0.7, 0.3, 0.2, 1],
    }));
  const hull = document.createNode('Hull/Primary').setMesh(mesh).setTranslation([1, 0, 0]);
  hull.addChild(document.createNode('FX/Trail_Left').setTranslation([-0.5, 0, -1]));
  document.createScene('FixtureScene').addChild(hull);
  await new NodeIO().write(path, document);
}

function slashManifest() {
  const manifest = singleNodeManifest({ node: 'Hull/Primary' });
  manifest.anchors.push({
    id: 'fixture.trail.left',
    node: 'FX/Trail_Left',
    kind: 'trail',
    parentNodeId: 'fixture.body',
  });
  return manifest;
}

async function createMergeMorphFixture(path, { animateWeights = false, nodeWeights = false } = {}) {
  const document = new Document();
  const buffer = document.createBuffer('fixture-buffer');
  const meshA = document.createMesh('MeshA')
    .addPrimitive(createTrianglePrimitive(document, buffer, { prefix: 'merge-a' }));
  const meshB = document.createMesh('MeshB')
    .addPrimitive(createTrianglePrimitive(document, buffer, {
      prefix: 'merge-b',
      morphTarget: true,
    }));
  const nodeA = document.createNode('A').setMesh(meshA);
  const nodeB = document.createNode('B').setMesh(meshB);
  if (nodeWeights) nodeB.setWeights([0.25]);
  document.createScene('FixtureScene').addChild(nodeA).addChild(nodeB);

  if (animateWeights) {
    const input = document.createAccessor('weight-times')
      .setType('SCALAR')
      .setArray(new Float32Array([0, 1]))
      .setBuffer(buffer);
    const output = document.createAccessor('weight-values')
      .setType('SCALAR')
      .setArray(new Float32Array([0, 1]))
      .setBuffer(buffer);
    const sampler = document.createAnimationSampler('weight-sampler')
      .setInput(input)
      .setOutput(output)
      .setInterpolation('LINEAR');
    const channel = document.createAnimationChannel('weight-channel')
      .setTargetNode(nodeB)
      .setTargetPath('weights')
      .setSampler(sampler);
    document.createAnimation('WeightAnimation').addSampler(sampler).addChannel(channel);
  }
  await new NodeIO().write(path, document);
}

function mergeMorphManifest() {
  const node = (id, name) => ({
    id,
    node: name,
    role: 'immutable',
    parentId: null,
    mergeBoundary: 'body',
    pipelineKey: 'opaque:front',
    transparency: 'opaque',
    cullingGroup: 'body',
    independentlyCulled: false,
    spatialClusterId: 'body',
  });
  return {
    schema: RENDER_PACKAGE_SOURCE_SCHEMA,
    assetId: 'fixture.ship',
    kind: 'ship',
    semanticNodes: [node('fixture.a', 'A'), node('fixture.b', 'B')],
    anchors: [],
    dynamicGroups: [],
    mergeGroups: [{ id: 'fixture.merge', nodeIds: ['fixture.a', 'fixture.b'] }],
    lods: [],
    hlods: [],
    collisions: [],
  };
}

async function parseGlb(path) {
  const bytes = await readFile(path);
  const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new GLTFLoader().parseAsync(arrayBuffer, '');
}

function findRawNode(root, rawName) {
  let match = null;
  root.traverse((object) => {
    if (!match && (object.userData?.name === rawName || object.name === rawName)) match = object;
  });
  return match;
}

function assertMatrixClose(actual, expected, message) {
  assert.equal(actual.length, expected.length, message);
  for (let index = 0; index < actual.length; index++) {
    assert.ok(
      Math.abs(actual[index] - expected[index]) <= 1e-5,
      `${message}: matrix[${index}] ${actual[index]} != ${expected[index]}`,
    );
  }
}

function positionAxisRange(primitive, axis) {
  const position = primitive.getAttribute('POSITION');
  const values = [];
  const point = [0, 0, 0];
  for (let index = 0; index < position.getCount(); index++) {
    position.getElement(index, point);
    values.push(point[axis]);
  }
  return [Math.min(...values), Math.max(...values)];
}

async function withFixture(run, fixtureOptions = {}) {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-render-package-'));
  try {
    const sourcePath = join(root, 'fixture.glb');
    await createTinyIndexedFixture(sourcePath, fixtureOptions);
    await run({ root, sourcePath });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('render-package schema rejects unknown fields, duplicate IDs, and broken semantic references', () => {
  const valid = minimalPackage();
  assert.deepEqual(validateRenderPackage(valid), {
    schema: 'spaceface.renderPackageValidationResult.v1',
    ok: true,
    issues: [],
  });

  const invalid = structuredClone(valid);
  invalid.undeclared = true;
  invalid.nodes.push({ ...structuredClone(invalid.nodes[0]) });
  invalid.anchors.push({
    id: 'fixture.anchor',
    nodeName: 'Missing',
    nodePath: [9],
    kind: 'trail',
    parentNodeId: 'fixture.missing',
    localTransform: [...IDENTITY],
    worldTransform: [...IDENTITY],
  });
  invalid.contentHash = 'not-a-sha256';

  const result = validateRenderPackage(invalid);
  assert.equal(result.ok, false);
  assert.deepEqual(
    new Set(result.issues.map((issue) => issue.rule)),
    new Set(['unknown-key', 'duplicate-id', 'reference', 'sha256']),
  );

  const unsupported = minimalPackage();
  unsupported.schema = 'spaceface.renderPackage.v2';
  assert.deepEqual(
    new Set(validateRenderPackage(unsupported).issues.map((issue) => issue.rule)),
    new Set(['schema']),
  );
});

test('semantic IDs, anchors, and dynamic groups are canonical across source declaration order', async () => {
  await withFixture(async ({ root, sourcePath }) => {
    const buildA = await compileRenderPackage({
      assetId: 'fixture.ship',
      sourceGlbPath: sourcePath,
      sourceUri: 'fixture.glb',
      semanticManifest: semanticManifest(),
      outputDir: join(root, 'build-a'),
    });
    const buildB = await compileRenderPackage({
      assetId: 'fixture.ship',
      sourceGlbPath: sourcePath,
      sourceUri: 'fixture.glb',
      semanticManifest: semanticManifest({ reverse: true }),
      outputDir: join(root, 'build-b'),
    });

    assert.deepEqual(
      buildA.package.nodes.map((entry) => entry.id),
      ['fixture.body', 'fixture.turret', 'fixture.wing'],
    );
    assert.deepEqual(buildA.package.anchors.map((entry) => entry.id), ['fixture.trail.left']);
    assert.deepEqual(buildA.package.dynamicGroups.map((entry) => entry.id), ['fixture.turret.group']);
    assert.deepEqual(buildA.package, buildB.package);
    assert.deepEqual(
      normalizeSemanticManifest(semanticManifest()),
      normalizeSemanticManifest(semanticManifest({ reverse: true })),
    );
  });
});

test('compiler records deterministic source, semantic, render, and package content hashes', async () => {
  await withFixture(async ({ root, sourcePath }) => {
    const sourceBytes = await readFile(sourcePath);
    const sourceManifestPath = join(root, 'release-source.json');
    const sourceManifestBytes = Buffer.from('{"asset":"fixture.ship","version":1}\n');
    await writeFile(sourceManifestPath, sourceManifestBytes);
    const first = await compileRenderPackage({
      assetId: 'fixture.ship',
      sourceGlbPath: sourcePath,
      sourceUri: 'fixture.glb',
      sourceManifestPath,
      sourceManifestUri: 'release-source.json',
      semanticManifest: semanticManifest(),
      outputDir: join(root, 'hash-a'),
    });
    const second = await compileRenderPackage({
      assetId: 'fixture.ship',
      sourceGlbPath: sourcePath,
      sourceUri: 'fixture.glb',
      sourceManifestPath,
      sourceManifestUri: 'release-source.json',
      semanticManifest: semanticManifest(),
      outputDir: join(root, 'hash-b'),
    });
    const changed = semanticManifest();
    changed.anchors[0].kind = 'effect';
    const third = await compileRenderPackage({
      assetId: 'fixture.ship',
      sourceGlbPath: sourcePath,
      sourceUri: 'fixture.glb',
      sourceManifestPath,
      sourceManifestUri: 'release-source.json',
      semanticManifest: changed,
      outputDir: join(root, 'hash-c'),
    });

    assert.equal(
      first.package.provenance.sourceGlb.sha256,
      createHash('sha256').update(sourceBytes).digest('hex'),
    );
    assert.equal(
      first.package.provenance.sourceManifest.sha256,
      createHash('sha256').update(sourceManifestBytes).digest('hex'),
    );
    for (const value of [
      first.package.provenance.semantics.sha256,
      first.package.render.sha256,
      first.package.contentHash,
    ]) assert.match(value, /^[a-f0-9]{64}$/);
    assert.equal(first.package.contentHash, second.package.contentHash);
    assert.notEqual(first.package.contentHash, third.package.contentHash);
  });
});

test('compiler rejects merge groups crossing dynamic or independently culled boundaries', async () => {
  await withFixture(async ({ root, sourcePath }) => {
    await assert.rejects(
      compileRenderPackage({
        assetId: 'fixture.ship',
        sourceGlbPath: sourcePath,
        semanticManifest: semanticManifest({ unsafeMerge: true }),
        outputDir: join(root, 'unsafe-dynamic'),
      }),
      /unsafe merge group .*dynamic/i,
    );

    const independentlyCulled = semanticManifest({ unsafeMerge: true });
    independentlyCulled.semanticNodes.find((entry) => entry.id === 'fixture.turret').role = 'immutable';
    await assert.rejects(
      compileRenderPackage({
        assetId: 'fixture.ship',
        sourceGlbPath: sourcePath,
        semanticManifest: independentlyCulled,
        outputDir: join(root, 'unsafe-culling'),
      }),
      /unsafe merge group .*independently culled/i,
    );

    const transparencyBoundary = semanticManifest();
    transparencyBoundary.semanticNodes.find((entry) => entry.id === 'fixture.wing').transparency = 'blend';
    await assert.rejects(
      compileRenderPackage({
        assetId: 'fixture.ship',
        sourceGlbPath: sourcePath,
        semanticManifest: transparencyBoundary,
        outputDir: join(root, 'unsafe-transparency'),
      }),
      /unsafe merge group .*transparency boundary/i,
    );
  });
});

test('compiler keeps strip primitives separate so merge groups cannot bridge topology', async () => {
  await withFixture(async ({ root, sourcePath }) => {
    const outputDir = join(root, 'strip-safe');
    await compileRenderPackage({
      assetId: 'fixture.ship',
      sourceGlbPath: sourcePath,
      semanticManifest: semanticManifest(),
      outputDir,
    });

    const compiled = await new NodeIO().read(join(outputDir, 'render.glb'));
    const hull = compiled.getRoot().listNodes().find((node) => node.getName() === 'Hull');
    const wing = compiled.getRoot().listNodes().find((node) => node.getName() === 'Wing');
    assert.equal(wing.getMesh(), null);
    assert.deepEqual(
      hull.getMesh().listPrimitives().map((primitive) => ({
        mode: primitive.getMode(),
        vertices: primitive.getAttribute('POSITION').getCount(),
        indices: primitive.getIndices().getCount(),
      })),
      [
        { mode: 5, vertices: 3, indices: 3 },
        { mode: 5, vertices: 3, indices: 3 },
      ],
      'triangle strips remain distinct primitives instead of creating cross-strip triangles',
    );
  }, { primitiveMode: 5 });
});

test('compiler fails closed on unsafe immutable streams, joint ownership, and reserved metadata', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-render-package-reject-'));
  try {
    const cases = [
      [{ normalizedNormal: true }, /normalized NORMAL streams/i],
      [{ tangent: true }, /TANGENT streams/i],
      [{ morphTarget: true }, /morph target streams/i],
      [{ negativeScale: true }, /negative-determinant transform/i],
      [{ skinJoint: true }, /skin joint/i],
      [{ positionExtras: { authored: true } }, /accessor metadata/i],
      [{ reservedExtras: true }, /reserved extras key/i],
      [{ primitiveRestart: true }, /does not support KHR_mesh_primitive_restart/i],
    ];
    for (const [index, [fixtureOptions, expected]] of cases.entries()) {
      const sourcePath = join(root, `unsafe-${index}.glb`);
      const outputDir = join(root, `unsafe-${index}-output`);
      await createUnsupportedBakeFixture(sourcePath, fixtureOptions);
      await assert.rejects(
        compileRenderPackage({
          assetId: 'fixture.ship',
          sourceGlbPath: sourcePath,
          semanticManifest: singleNodeManifest(),
          outputDir,
        }),
        expected,
      );
      await assert.rejects(readFile(join(outputDir, 'render.glb')), /ENOENT/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('compiler rejects morph-bearing and weight-animated merge groups before graph mutation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-render-package-merge-reject-'));
  try {
    const morphSource = join(root, 'morph.glb');
    await createMergeMorphFixture(morphSource);
    await assert.rejects(
      compileRenderPackage({
        assetId: 'fixture.ship',
        sourceGlbPath: morphSource,
        semanticManifest: mergeMorphManifest(),
        outputDir: join(root, 'morph-output'),
      }),
      /cannot combine morph targets/i,
    );

    const weightedSource = join(root, 'weighted.glb');
    await createMergeMorphFixture(weightedSource, { nodeWeights: true });
    await assert.rejects(
      compileRenderPackage({
        assetId: 'fixture.ship',
        sourceGlbPath: weightedSource,
        semanticManifest: mergeMorphManifest(),
        outputDir: join(root, 'weighted-output'),
      }),
      /cannot combine node or mesh weights/i,
    );

    const animatedSource = join(root, 'animated.glb');
    await createMergeMorphFixture(animatedSource, { animateWeights: true });
    await assert.rejects(
      compileRenderPackage({
        assetId: 'fixture.ship',
        sourceGlbPath: animatedSource,
        semanticManifest: mergeMorphManifest(),
        outputDir: join(root, 'animated-output'),
      }),
      /cannot move a weights animation target/i,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('meshless transform carriers preserve anchors and runtime moving-group composition', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-render-package-carrier-'));
  try {
    const sourcePath = join(root, 'source.glb');
    const outputDir = join(root, 'output');
    await createCarrierFixture(sourcePath);
    await compileRenderPackage({
      assetId: 'fixture.ship',
      sourceGlbPath: sourcePath,
      semanticManifest: carrierManifest(),
      outputDir,
    });

    const [source, compiled] = await Promise.all([
      parseGlb(sourcePath),
      parseGlb(join(outputDir, 'render.glb')),
    ]);
    const sourceAnchor = findRawNode(source.scene, 'FX_Trail_Left');
    const compiledAnchor = findRawNode(compiled.scene, 'FX_Trail_Left');
    const sourceTurret = findRawNode(source.scene, 'Turret');
    const compiledTurret = findRawNode(compiled.scene, 'Turret');
    assert.ok(sourceAnchor && compiledAnchor && sourceTurret && compiledTurret);

    source.scene.updateMatrixWorld(true);
    compiled.scene.updateMatrixWorld(true);
    assertMatrixClose(
      compiledAnchor.matrixWorld.elements,
      sourceAnchor.matrixWorld.elements,
      'anchor neutral world transform',
    );
    assertMatrixClose(
      compiledTurret.matrixWorld.elements,
      sourceTurret.matrixWorld.elements,
      'moving group neutral world transform',
    );

    for (const turret of [sourceTurret, compiledTurret]) {
      turret.position.set(0.9, -0.2, 0.4);
      turret.rotation.set(0.15, -0.35, 0.8);
      turret.scale.set(1.2, 0.8, 1.1);
    }
    source.scene.updateMatrixWorld(true);
    compiled.scene.updateMatrixWorld(true);
    assertMatrixClose(
      compiledTurret.matrixWorld.elements,
      sourceTurret.matrixWorld.elements,
      'moving group runtime world transform',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('geometry prune removes detached pre-bake meshes while preserving live morph names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-render-package-prune-'));
  try {
    const sourcePath = join(root, 'source.glb');
    const outputDir = join(root, 'output');
    await createMorphIdentityFixture(sourcePath);
    await compileRenderPackage({
      assetId: 'fixture.ship',
      sourceGlbPath: sourcePath,
      semanticManifest: singleNodeManifest(),
      outputDir,
    });

    const compiled = await new NodeIO().read(join(outputDir, 'render.glb'));
    assert.equal(compiled.getRoot().listMeshes().length, 1, 'detached source mesh is not serialized');
    assert.equal(compiled.getRoot().listAccessors().length, 4, 'only live position, normal, index, and morph streams remain');
    const mesh = compiled.getRoot().listMeshes()[0];
    assert.deepEqual(mesh.getExtras().targetNames, ['Pulse']);
    assert.equal(mesh.listPrimitives()[0].listTargets().length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('compiler semantic IDs resolve through the real GLTFLoader object graph', async () => {
  const root = await mkdtemp(join(tmpdir(), 'spaceface-render-package-semantic-id-'));
  try {
    const sourcePath = join(root, 'source.glb');
    const outputDir = join(root, 'output');
    await createMultiPrimitiveSlashFixture(sourcePath);
    const build = await compileRenderPackage({
      assetId: 'fixture.ship',
      sourceGlbPath: sourcePath,
      semanticManifest: slashManifest(),
      outputDir,
    });
    const renderBytes = new Uint8Array(await readFile(build.renderPath));
    const loader = createRenderPackageLoader({
      fetchImpl: async (url) => {
        assert.equal(url, 'https://assets.example/packages/fixture/render.glb');
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => renderBytes.buffer.slice(
            renderBytes.byteOffset,
            renderBytes.byteOffset + renderBytes.byteLength,
          ),
        };
      },
    });
    const loaded = await loader.load(build.package, {
      baseUrl: 'https://assets.example/packages/fixture/',
      expectedContentHash: build.package.contentHash,
    });
    const instance = loaded.createInstance();
    const body = instance.nodes.get('fixture.body');
    const anchor = instance.anchors.get('fixture.trail.left');
    assert.ok(body && anchor);
    assert.notStrictEqual(anchor, body.children[0], 'primitive expansion cannot redirect anchor identity');
    assert.equal(body.userData.name, 'Hull/Primary');
    assert.equal(anchor.userData.name, 'FX/Trail_Left');
    assert.strictEqual(instance.dynamicGroups.size, 0);
    instance.dispose();
    loaded.release();
    loader.dispose();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('two builds are byte-identical and preserve indexed geometry by default', async () => {
  await withFixture(async ({ root, sourcePath }) => {
    const outputA = join(root, 'identity-a');
    const outputB = join(root, 'identity-b');
    const buildA = await compileRenderPackage({
      assetId: 'fixture.ship',
      sourceGlbPath: sourcePath,
      sourceUri: 'fixture.glb',
      semanticManifest: semanticManifest(),
      outputDir: outputA,
    });
    await compileRenderPackage({
      assetId: 'fixture.ship',
      sourceGlbPath: sourcePath,
      sourceUri: 'fixture.glb',
      semanticManifest: semanticManifest(),
      outputDir: outputB,
    });

    assert.deepEqual(await readFile(join(outputA, 'render.glb')), await readFile(join(outputB, 'render.glb')));
    assert.deepEqual(
      await readFile(join(outputA, 'render-package.json')),
      await readFile(join(outputB, 'render-package.json')),
    );

    const report = await compareRenderPackageDirectories(outputA, outputB);
    assert.equal(report.ok, true);
    assert.equal(report.byteIdentical, true);

    const compiled = await new NodeIO().read(join(outputA, 'render.glb'));
    const primitives = compiled.getRoot().listMeshes().flatMap((mesh) => mesh.listPrimitives());
    assert.ok(primitives.length > 0);
    assert.ok(primitives.every((primitive) => primitive.getIndices()), 'indexed source geometry stays indexed');
    assert.deepEqual(
      primitives.map((primitive) => primitive.getAttribute('POSITION').getCount()).sort((a, b) => a - b),
      [3, 6],
      'the two compatible immutable primitives are joined while the dynamic primitive remains separate',
    );

    const hull = compiled.getRoot().listNodes().find((node) => node.getName() === 'Hull');
    const wing = compiled.getRoot().listNodes().find((node) => node.getName() === 'Wing');
    const turret = compiled.getRoot().listNodes().find((node) => node.getName() === 'Turret');
    const trail = compiled.getRoot().listNodes().find((node) => node.getName() === 'FX_Trail_Left');
    assert.deepEqual(Array.from(hull.getMatrix()), [...IDENTITY], 'immutable hull transform is baked into geometry');
    assert.deepEqual(Array.from(trail.getTranslation()), [-0.5, 0, -1], 'anchor keeps its authored local transform');
    assert.deepEqual(Array.from(trail.getWorldTranslation()), [1.5, 0, -1], 'carrier preserves the anchor world pose');
    assert.deepEqual(Array.from(turret.getTranslation()), [0, 0.25, 0], 'dynamic group transform remains separate');
    assert.equal(wing.getMesh(), null, 'merged semantic nodes retain identity without a duplicate draw');
    assert.deepEqual(positionAxisRange(hull.getMesh().listPrimitives()[0], 0), [2, 5]);
    assert.deepEqual(positionAxisRange(turret.getMesh().listPrimitives()[0], 0), [0, 1]);
    assert.deepEqual(
      buildA.package.nodes.find((entry) => entry.id === 'fixture.body').localTransform,
      [...IDENTITY],
    );
    assert.deepEqual(
      buildA.package.anchors.find((entry) => entry.id === 'fixture.trail.left').worldTransform.slice(12, 15),
      [1.5, 0, -1],
    );

    const sourceEquivalence = await compareRenderPackageToSource(outputA, {
      sourceGlbPath: sourcePath,
      semanticManifest: semanticManifest(),
    });
    assert.equal(sourceEquivalence.ok, true, JSON.stringify(sourceEquivalence.issues));
    assert.equal(sourceEquivalence.rebuild.byteIdentical, true);
    const changedSemantics = semanticManifest();
    changedSemantics.anchors[0].kind = 'effect';
    const semanticMismatch = await compareRenderPackageToSource(outputA, {
      sourceGlbPath: sourcePath,
      semanticManifest: changedSemantics,
    });
    assert.equal(semanticMismatch.ok, false);
    assert.ok(semanticMismatch.issues.some((issue) => issue.code === 'semantic-provenance'));
    assert.ok(semanticMismatch.issues.some((issue) => issue.code === 'source-rebuild'));

    const changedMetadata = JSON.parse(await readFile(join(outputB, 'render-package.json'), 'utf8'));
    changedMetadata.contentHash = '9'.repeat(64);
    await writeFile(join(outputB, 'render-package.json'), `${JSON.stringify(changedMetadata, null, 2)}\n`);
    const mismatch = await compareRenderPackageDirectories(outputA, outputB);
    assert.equal(mismatch.ok, false);
    assert.ok(mismatch.issues.some((issue) => issue.code === 'metadata-bytes'));
    assert.ok(mismatch.issues.some((issue) => issue.code === 'content-hash'));

    const originalRender = await readFile(join(outputA, 'render.glb'));
    await writeFile(join(outputA, 'render.glb'), Buffer.concat([originalRender, Buffer.from([0])]));
    const corrupt = await compareRenderPackageDirectories(outputA, outputA);
    assert.equal(corrupt.ok, false);
    assert.ok(corrupt.issues.some((issue) => issue.code === 'left-render-integrity'));
    assert.ok(corrupt.issues.some((issue) => issue.code === 'right-render-integrity'));
  });
});

test('compile-render-packages CLI compiles an explicit source without mutating release manifests', async () => {
  await withFixture(async ({ root, sourcePath }) => {
    const semanticPath = join(root, 'fixture.render-source.json');
    const outputDir = join(root, 'cli-output');
    await writeFile(semanticPath, `${JSON.stringify(semanticManifest(), null, 2)}\n`);

    const result = spawnSync(process.execPath, [
      COMPILE_SCRIPT,
      '--asset-id', 'fixture.ship',
      '--source', sourcePath,
      '--semantic', semanticPath,
      '--output', outputDir,
      '--source-uri', 'fixture.glb',
      '--json',
    ], { encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const receipt = JSON.parse(result.stdout);
    assert.equal(receipt.assetId, 'fixture.ship');
    assert.equal(receipt.contentHash.length, 64);
    assert.equal((await readFile(join(outputDir, 'render.glb'))).length, receipt.renderBytes);
    assert.equal(JSON.parse(await readFile(join(outputDir, 'render-package.json'), 'utf8')).contentHash, receipt.contentHash);
  });
});
