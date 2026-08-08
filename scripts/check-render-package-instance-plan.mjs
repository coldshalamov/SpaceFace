#!/usr/bin/env node
// Prove every shipping render package survives the LOAD-TIME instance plan.
//
// WHY THIS EXISTS
// ---------------
// The flat instance plan moved semantic-locator validation and dynamic-group resolution from
// per-instance to load. That is the whole point — but it also moved WHEN a bad package fails.
// A package whose semantic extras do not round-trip cleanly used to fail on first instantiation;
// it now takes the entire load down, before prepareDecoded ever runs. Fixture-based tests cannot
// tell us whether the real corpus survives that gate, because the fixture is authored to pass it.
//
// So: for every package under assets/ships/release/render-packages, reconstruct the decoded node
// graph from the GLB's own JSON chunk (names, hierarchy and extras — exactly what GLTFLoader
// materialises as userData), run it through the real loader, and assert the plan covers the graph
// and resolves every metadata record.
//
// This deliberately does NOT re-test GLB binary decoding, KTX2 transcoding or GPU upload. Those
// paths are unchanged by the plan work and are not runnable headlessly. What is new, and therefore
// what is checked here, is the metadata <-> node-structure contract at load.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { createRenderPackageLoader } from '../src/render/renderPackageLoader.js';
import { createAssetResidencyRegistry } from '../src/render/assetResidency.js';
import { prepareRenderPackageBlueprint } from '../src/render/assetLoader.js';
import { renderPackagePilotForAssetId } from '../src/render/renderPackageManifest.js';
import { readGlbJson as readGlbJsonChunk, sceneFromGlbJson as buildDecodedScene } from './lib/renderPackageRuntimeTable.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packageDirIndex = process.argv.indexOf('--package-dir');
if (packageDirIndex >= 0 && !process.argv[packageDirIndex + 1]) {
  throw new Error('--package-dir requires a directory path');
}
const PACKAGE_DIR = packageDirIndex >= 0
  ? resolve(process.argv[packageDirIndex + 1])
  : resolve(ROOT, 'assets/ships/release/render-packages');

/**
 * Read a .glb container's JSON chunk without decoding any binary payload.
 *
 * The graph rebuild is shared with the render-package runtime-table compiler so both agree on what
 * GLTFLoader would actually produce. That matters: an earlier local copy of this rebuild treated
 * every glTF node as at most one Mesh, which understates any node whose mesh carries multiple
 * primitives — GLTFLoader wraps those in a Group of Meshes. `helios-trade-hub` decodes to 147 plan
 * nodes, not the 33 the naive rebuild reported, and this gate silently agreed with itself because
 * both sides of its comparison used the same wrong rebuild.
 */
function readGlbJson(path) {
  return readGlbJsonChunk(readFileSync(path));
}

/**
 * Rebuild the node graph GLTFLoader would produce: one Object3D per glTF node, children in
 * declaration order, `extras` surfaced as userData. Meshes become THREE.Mesh with a placeholder
 * geometry/material so the plan's resource collection has something real to mark.
 */
function sceneFromGlbJson(json) {
  const scene = buildDecodedScene(json);
  let nodeCount = 0;
  scene.traverse(() => { nodeCount++; });
  return { scene, nodeCount };
}

async function checkPackage(id) {
  const dir = resolve(PACKAGE_DIR, id);
  const metadata = JSON.parse(readFileSync(resolve(dir, 'render-package.json'), 'utf8'));
  const glbJson = readGlbJson(resolve(dir, 'render.glb'));
  const { scene, nodeCount } = sceneFromGlbJson(glbJson);
  const decoded = { scene, asset: glbJson.asset || {} };
  const pilot = renderPackagePilotForAssetId(metadata.assetId);
  if (!pilot) throw new Error(`shipping manifest has no pilot binding for ${metadata.assetId}`);

  const loader = createRenderPackageLoader({
    loadGlb: async () => decoded,
    residency: createAssetResidencyRegistry(),
    prepareDecoded(loadedDecoded, packageMetadata, _renderUrl, plan) {
      return prepareRenderPackageBlueprint(pilot, loadedDecoded, packageMetadata, { plan });
    },
  });
  try {
    const loaded = await loader.load(metadata, { baseUrl: 'file:///packages/' });

    // Exercise the exact shipping runtime-table binder. The prior checker validated semantic
    // locators and instance structure but never consumed metadata.runtime, so the compiler and
    // checker could agree with each other while every production planIndex was wrong.
    if (!loaded.prepared) throw new Error('shipping runtime blueprint was not prepared');
    if (loaded.prepared.primitives.length !== metadata.runtime.primitives.length) {
      throw new Error(
        `runtime blueprint bound ${loaded.prepared.primitives.length} primitives, expected ${metadata.runtime.primitives.length}`,
      );
    }
    if (loaded.prepared.markers.length !== metadata.runtime.markers.length) {
      throw new Error(
        `runtime blueprint bound ${loaded.prepared.markers.length} markers, expected ${metadata.runtime.markers.length}`,
      );
    }

    // The plan must cover the whole graph — a plan shorter than the graph would mean instances
    // silently lose nodes.
    if (loaded.planNodeCount !== nodeCount) {
      throw new Error(`plan covers ${loaded.planNodeCount} nodes but the GLB scene has ${nodeCount}`);
    }

    // Instantiate for real and confirm every declared record resolves to a live object.
    const instance = loaded.createInstance();
    for (const record of metadata.nodes) {
      if (!instance.nodes.get(record.id)) throw new Error(`node record ${record.id} did not resolve`);
    }
    for (const record of metadata.anchors) {
      if (!instance.anchors.get(record.id)) throw new Error(`anchor record ${record.id} did not resolve`);
    }
    for (const record of metadata.dynamicGroups) {
      if (!instance.dynamicGroups.get(record.id)) throw new Error(`dynamic group ${record.id} did not resolve`);
    }
    if (instance.planNodes.length !== nodeCount) {
      throw new Error(`instance exposed ${instance.planNodes.length} planNodes, expected ${nodeCount}`);
    }
    if (instance.planNodes[0] !== instance.root) throw new Error('planNodes[0] is not the instance root');

    // A second instance must be independent in transform and shared in resources.
    const second = loaded.createInstance();
    if (second.root === instance.root) throw new Error('two instances returned the same root');
    const firstMesh = instance.planNodes.find((object) => object.isMesh);
    const secondMesh = second.planNodes.find((object) => object.isMesh);
    if (firstMesh && secondMesh) {
      if (firstMesh === secondMesh) throw new Error('instances share a mesh object');
      if (firstMesh.geometry !== secondMesh.geometry) throw new Error('instances do not share geometry');
      if (firstMesh.material !== secondMesh.material) throw new Error('instances do not share material');
    }

    instance.dispose();
    second.dispose();
    return {
      id,
      nodeCount,
      records: metadata.nodes.length + metadata.anchors.length + metadata.dynamicGroups.length,
    };
  } finally {
    loader.dispose();
  }
}

const ids = readdirSync(PACKAGE_DIR)
  .filter((entry) => existsSync(resolve(PACKAGE_DIR, entry, 'render-package.json')))
  .filter((entry) => existsSync(resolve(PACKAGE_DIR, entry, 'render.glb')))
  .sort();

if (ids.length === 0) {
  console.error('check:render-package-plan: no render packages found');
  process.exit(1);
}

let failures = 0;
let nodes = 0;
let records = 0;
for (const id of ids) {
  try {
    const result = await checkPackage(id);
    nodes += result.nodeCount;
    records += result.records;
    console.log(`ok   ${id} — ${result.nodeCount} plan nodes, ${result.records} records resolved`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${id} — ${error.message}`);
  }
}

console.log(
  `\n${ids.length - failures}/${ids.length} shipping render packages build a valid instance plan `
  + `(${nodes} nodes, ${records} semantic records).`,
);
if (failures > 0) process.exit(1);
