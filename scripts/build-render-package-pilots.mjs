import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

import {
  RENDER_PACKAGE_SOURCE_SCHEMA,
  stableJsonStringify,
} from '../src/contracts/renderPackage.js';
import { compileRenderPackage } from './lib/renderPackageCompiler.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const DEFAULT_MANIFEST = 'assets/ships/render-packages/pilots.json';
const PACKAGE_FILES = Object.freeze(['render.glb', 'render-package.json']);
const REQUIRED_PILOT_KEYS = Object.freeze(['kestrel', 'helios-span', 'debris-chunk']);
let ioPromise = null;

export async function buildRenderPackagePilots(options = {}) {
  const check = options.check === true;
  const repoRoot = resolve(options.repoRoot || REPO_ROOT);
  const manifestPath = resolve(repoRoot, options.manifestPath || DEFAULT_MANIFEST);
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  assertPilotManifest(manifest);

  const releaseManifestPath = resolve(repoRoot, manifest.releaseManifest);
  const releaseManifest = JSON.parse(await readFile(releaseManifestPath, 'utf8'));
  const releaseRows = new Map((releaseManifest.assets || []).map((row) => [row.id, row]));
  const scratch = check ? await mkdtemp(join(tmpdir(), 'spaceface-render-pilots-')) : null;
  const bindings = [];

  try {
    for (const pilot of manifest.pilots) {
      const sourcePath = resolve(repoRoot, pilot.sourceUrl);
      const releaseRow = releaseRows.get(pilot.releaseAssetId);
      assertReleaseBinding(pilot, releaseRow);
      const sourceBytes = await readFile(sourcePath);
      const sourceSha256 = sha256(sourceBytes);
      if (sourceBytes.length !== pilot.releaseBytes || sourceSha256 !== pilot.releaseSha256) {
        throw new Error(
          `${pilot.key}: release bytes drifted from the accepted binding `
          + `${pilot.releaseSha256}/${pilot.releaseBytes} to ${sourceSha256}/${sourceBytes.length}.`,
        );
      }

      const semanticManifest = await derivePilotSemanticManifest(pilot, sourcePath);
      const outputDir = check
        ? join(scratch, pilot.key)
        : resolve(repoRoot, pilot.outputDir);
      const result = await compileRenderPackage({
        assetId: pilot.assetId,
        sourceGlbPath: sourcePath,
        sourceManifestPath: manifestPath,
        semanticManifest,
        outputDir,
      });
      if (check) await assertPackageMatches(outputDir, resolve(repoRoot, pilot.outputDir), pilot.key);

      bindings.push({
        key: pilot.key,
        assetId: pilot.assetId,
        runtimeAssetId: pilot.runtimeAssetId,
        slot: pilot.slot,
        sourceUrl: pilot.sourceUrl,
        sourceSha256,
        metadataUrl: pilot.metadataUrl,
        expectedContentHash: result.package.contentHash,
      });
    }

    const runtimeManifestPath = resolve(repoRoot, manifest.runtimeManifest);
    const runtimeSource = renderRuntimeManifest(bindings);
    if (check) {
      const current = await readFile(runtimeManifestPath, 'utf8');
      if (current !== runtimeSource) throw new Error(`${manifest.runtimeManifest} is stale; rebuild render-package pilots.`);
    } else {
      await writeFile(runtimeManifestPath, runtimeSource);
    }
  } finally {
    if (scratch) await rm(scratch, { recursive: true, force: true });
  }

  return Object.freeze(bindings.map((binding) => Object.freeze({ ...binding })));
}

export async function derivePilotSemanticManifest(pilot, sourcePath) {
  const io = await renderPackageIo();
  const document = await io.read(sourcePath);
  const documentRoot = document.getRoot();
  const scene = documentRoot.getDefaultScene() || documentRoot.listScenes()[0];
  if (!scene) throw new Error(`${pilot.key}: package source contains no scene.`);
  assertRuntimeAssetIdentity(pilot, documentRoot, scene);
  const nodes = documentRoot.listNodes();
  const names = new Map();
  for (const node of nodes) {
    const name = String(node.getName() || '');
    if (!name) continue;
    if (!names.has(name)) names.set(name, []);
    names.get(name).push(node);
  }
  if (pilot.sceneRoot === true) {
    return deriveSceneRootSemanticManifest(pilot, scene, nodes, names);
  }
  const rootMatches = names.get(pilot.rootNode) || [];
  if (rootMatches.length !== 1) throw new Error(`${pilot.key}: expected one root node ${pilot.rootNode}.`);
  const rootNode = rootMatches[0];
  const descendants = nodes.filter((node) => isDescendantOrSelf(node, rootNode));
  const meshNodes = descendants.filter((node) => node.getMesh());
  if (meshNodes.length === 0) throw new Error(`${pilot.key}: package source contains no mesh nodes.`);
  for (const node of meshNodes) assertUniqueNodeName(pilot, node, names);

  const clusterId = `${pilot.assetId}.body`;
  const rootId = `${pilot.assetId}.root`;
  const meshRecords = meshNodes.map((node) => {
    const nodeName = node.getName();
    const dynamic = (pilot.dynamicNameIncludes || []).some((token) => nodeName.includes(token));
    const blend = /glass|canopy/i.test(nodeName);
    return {
      id: `${pilot.assetId}.mesh.${idToken(nodeName)}`,
      node: nodeName,
      role: dynamic ? 'dynamic' : 'immutable',
      parentId: rootId,
      mergeBoundary: nodeName,
      pipelineKey: nodeName === 'COLLISION_HULL' ? 'non-render' : (blend ? 'blend' : 'opaque'),
      transparency: blend ? 'blend' : 'opaque',
      cullingGroup: 'asset',
      independentlyCulled: false,
      spatialClusterId: clusterId,
    };
  });
  const byNodeName = new Map(meshRecords.map((record) => [record.node, record]));
  const anchors = descendants
    .filter((node) => !node.getMesh() && String(node.getName() || '').startsWith('SOCKET_'))
    .map((node) => {
      assertUniqueNodeName(pilot, node, names);
      return {
        id: `${pilot.assetId}.anchor.${idToken(node.getName())}`,
        node: node.getName(),
        kind: 'socket',
        parentNodeId: rootId,
      };
    });
  const dynamicGroups = meshRecords
    .filter((record) => record.role === 'dynamic')
    .map((record) => ({
      id: `${record.id}.dynamic`,
      nodeId: record.id,
      kind: 'dynamic-surface',
    }));
  const collision = byNodeName.get('COLLISION_HULL');

  return {
    schema: RENDER_PACKAGE_SOURCE_SCHEMA,
    assetId: pilot.assetId,
    kind: pilot.kind,
    semanticNodes: [{
      id: rootId,
      node: pilot.rootNode,
      role: 'immutable',
      mergeBoundary: 'asset-root',
      pipelineKey: 'root',
      transparency: 'opaque',
      cullingGroup: 'asset',
      independentlyCulled: false,
      spatialClusterId: clusterId,
    }, ...meshRecords],
    anchors,
    dynamicGroups,
    mergeGroups: [],
    lods: [],
    hlods: [],
    collisions: collision ? [{
      id: `${pilot.assetId}.collision`,
      nodeId: collision.id,
      reference: 'COLLISION_HULL',
    }] : [],
  };
}

function assertRuntimeAssetIdentity(pilot, documentRoot, scene) {
  const sceneExtras = scene.getExtras() || {};
  const assetExtras = documentRoot.getAsset()?.extras || {};
  const metadata = [
    sceneExtras.spacefaceAsset,
    sceneExtras.spaceface,
    assetExtras.spacefaceAsset,
    assetExtras.spaceface,
    assetExtras,
  ].find((value) => value && typeof value === 'object');
  const declaredAssetId = metadata?.assetId;
  if (typeof declaredAssetId !== 'string' || !declaredAssetId) {
    throw new Error(`${pilot.key}: package source declares no runtime assetId.`);
  }
  if (declaredAssetId !== pilot.runtimeAssetId) {
    throw new Error(
      `${pilot.key}: runtime assetId ${pilot.runtimeAssetId} does not match source ${declaredAssetId}.`,
    );
  }
}

function deriveSceneRootSemanticManifest(pilot, scene, nodes, names) {
  const roots = scene.listChildren();
  if (roots.length === 0) throw new Error(`${pilot.key}: scene-root package contains no nodes.`);
  const descendants = nodes.filter((node) => roots.some((root) => isDescendantOrSelf(node, root)));
  const meshNodes = descendants.filter((node) => node.getMesh());
  if (meshNodes.length === 0) throw new Error(`${pilot.key}: package source contains no mesh nodes.`);

  const semanticIds = new Map();
  const usedIds = new Set();
  for (const node of descendants) {
    assertUniqueNodeName(pilot, node, names);
    const id = `${pilot.assetId}.node.${idToken(node.getName())}`;
    if (usedIds.has(id)) {
      throw new Error(`${pilot.key}: semantic node names collapse to duplicate ID ${id}.`);
    }
    usedIds.add(id);
    semanticIds.set(node, id);
  }

  const clusterId = `${pilot.assetId}.body`;
  const semanticNodes = descendants.map((node) => {
    const nodeName = node.getName();
    const mesh = node.getMesh();
    const dynamic = !!mesh && (pilot.dynamicNameIncludes || []).some((token) => nodeName.includes(token));
    const blend = !!mesh && /glass|canopy/i.test(nodeName);
    const parent = node.getParentNode();
    return {
      id: semanticIds.get(node),
      node: nodeName,
      role: dynamic ? 'dynamic' : 'immutable',
      parentId: parent ? semanticIds.get(parent) : null,
      mergeBoundary: nodeName,
      pipelineKey: !mesh ? 'root' : nodeName === 'COLLISION_HULL' ? 'non-render' : blend ? 'blend' : 'opaque',
      transparency: blend ? 'blend' : 'opaque',
      cullingGroup: 'asset',
      independentlyCulled: false,
      spatialClusterId: clusterId,
    };
  });
  const byNodeName = new Map(semanticNodes.map((record) => [record.node, record]));
  const anchors = descendants
    .filter((node) => !node.getMesh() && String(node.getName() || '').startsWith('SOCKET_'))
    .map((node) => ({
      id: `${pilot.assetId}.anchor.${idToken(node.getName())}`,
      node: node.getName(),
      kind: 'socket',
      parentNodeId: semanticIds.get(node.getParentNode()) || semanticIds.get(node),
    }));
  const dynamicGroups = semanticNodes
    .filter((record) => record.role === 'dynamic')
    .map((record) => ({
      id: `${record.id}.dynamic`,
      nodeId: record.id,
      kind: 'dynamic-surface',
    }));
  const collision = byNodeName.get('COLLISION_HULL');

  return {
    schema: RENDER_PACKAGE_SOURCE_SCHEMA,
    assetId: pilot.assetId,
    kind: pilot.kind,
    semanticNodes,
    anchors,
    dynamicGroups,
    mergeGroups: [],
    lods: [],
    hlods: [],
    collisions: collision ? [{
      id: `${pilot.assetId}.collision`,
      nodeId: collision.id,
      reference: 'COLLISION_HULL',
    }] : [],
  };
}

function assertPilotManifest(manifest) {
  if (manifest?.schema !== 'spaceface.renderPackagePilots.v1') {
    throw new Error('Render-package pilot manifest has an unsupported schema.');
  }
  if (!manifest.releaseManifest || !manifest.runtimeManifest || !Array.isArray(manifest.pilots)) {
    throw new Error('Render-package pilot manifest is incomplete.');
  }
  if (manifest.pilots.length < REQUIRED_PILOT_KEYS.length) {
    throw new Error('Production manifest must retain the original three-asset pilot.');
  }
  const keys = new Set();
  const sourceUrls = new Set();
  for (const pilot of manifest.pilots) {
    if (!pilot?.key || keys.has(pilot.key)) throw new Error(`Duplicate or missing pilot key ${pilot?.key}.`);
    if (!pilot.sourceUrl || sourceUrls.has(pilot.sourceUrl)) throw new Error(`${pilot.key}: duplicate or missing source URL.`);
    const hasNamedRoot = typeof pilot.rootNode === 'string' && pilot.rootNode.length > 0;
    const hasSceneRoot = pilot.sceneRoot === true;
    if (hasNamedRoot === hasSceneRoot) {
      throw new Error(`${pilot.key}: choose exactly one of rootNode or sceneRoot.`);
    }
    keys.add(pilot.key);
    sourceUrls.add(pilot.sourceUrl);
  }
  for (const key of REQUIRED_PILOT_KEYS) {
    if (!keys.has(key)) throw new Error(`Production manifest is missing required pilot ${key}.`);
  }
}

function assertReleaseBinding(pilot, row) {
  if (!row) throw new Error(`${pilot.key}: release manifest row ${pilot.releaseAssetId} is missing.`);
  if (row.release !== pilot.sourceUrl) throw new Error(`${pilot.key}: release manifest path does not match ${pilot.sourceUrl}.`);
  if (row.releaseSha256 !== pilot.releaseSha256 || row.releaseBytes !== pilot.releaseBytes) {
    throw new Error(`${pilot.key}: accepted release hash/byte binding is stale.`);
  }
}

function assertUniqueNodeName(pilot, node, names) {
  const name = String(node.getName() || '');
  if (!name || (names.get(name) || []).length !== 1) {
    throw new Error(`${pilot.key}: semantic node names must be non-empty and unique (${name || 'unnamed'}).`);
  }
}

function isDescendantOrSelf(node, ancestor) {
  for (let current = node; current; current = current.getParentNode()) {
    if (current === ancestor) return true;
  }
  return false;
}

function idToken(value) {
  const token = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!token) throw new Error(`Cannot derive semantic ID from ${JSON.stringify(value)}.`);
  return token;
}

async function renderPackageIo() {
  ioPromise ||= Promise.resolve(MeshoptDecoder.ready).then(() => (
    new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
  ));
  return ioPromise;
}

async function assertPackageMatches(candidateDir, committedDir, key) {
  for (const file of PACKAGE_FILES) {
    const [candidate, committed] = await Promise.all([
      readFile(resolve(candidateDir, file)),
      readFile(resolve(committedDir, file)),
    ]);
    if (!candidate.equals(committed)) throw new Error(`${key}: ${file} is stale; rebuild render-package pilots.`);
  }
}

function renderRuntimeManifest(bindings) {
  const records = stableJsonStringify(bindings, 2);
  return `// Generated by scripts/build-render-package-pilots.mjs. Do not edit by hand.\n`
    + `const PILOTS = ${records};\n\n`
    + `export const RENDER_PACKAGE_PILOTS = Object.freeze(PILOTS.map((entry) => Object.freeze(entry)));\n\n`
    + `const BY_SOURCE_URL = new Map(RENDER_PACKAGE_PILOTS.map((entry) => [entry.sourceUrl, entry]));\n`
    + `const BY_ASSET_ID = new Map(RENDER_PACKAGE_PILOTS.map((entry) => [entry.assetId, entry]));\n\n`
    + `export function renderPackagePilotForSourceUrl(url) {\n`
    + `  const clean = String(url || '').replace(/\\\\/g, '/').split(/[?#]/, 1)[0].replace(/^\\.\\//, '');\n`
    + `  return BY_SOURCE_URL.get(clean) || null;\n`
    + `}\n\n`
    + `export function renderPackagePilotForAssetId(assetId) {\n`
    + `  return BY_ASSET_ID.get(String(assetId || '')) || null;\n`
    + `}\n`;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseArgs(argv) {
  const unknown = argv.filter((arg) => arg !== '--check');
  if (unknown.length) throw new Error(`Unknown render-package pilot option: ${unknown.join(', ')}`);
  return { check: argv.includes('--check') };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const bindings = await buildRenderPackagePilots(options);
  console.log(`render-package-pilots: ${options.check ? 'fresh' : 'built'} ${bindings.length} production packages`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
