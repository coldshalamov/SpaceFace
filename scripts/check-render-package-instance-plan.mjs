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

import * as THREE from 'three';

import { createRenderPackageLoader } from '../src/render/renderPackageLoader.js';
import { createAssetResidencyRegistry } from '../src/render/assetResidency.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_DIR = resolve(ROOT, 'assets/ships/release/render-packages');

/** Read a .glb container's JSON chunk without decoding any binary payload. */
function readGlbJson(path) {
  const buffer = readFileSync(path);
  if (buffer.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path} is not a GLB container`);
  return JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString('utf8'));
}

/**
 * Rebuild the node graph GLTFLoader would produce: one Object3D per glTF node, children in
 * declaration order, `extras` surfaced as userData. Meshes become THREE.Mesh with a placeholder
 * geometry/material so the plan's resource collection has something real to mark.
 */
function sceneFromGlbJson(json) {
  const nodes = json.nodes || [];
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.MeshStandardMaterial();

  const build = (index) => {
    const record = nodes[index];
    const object = record.mesh === undefined ? new THREE.Object3D() : new THREE.Mesh(geometry, material);
    object.name = record.name || '';
    if (record.extras) object.userData = { ...record.extras };
    for (const child of record.children || []) object.add(build(child));
    return object;
  };

  const sceneRecord = (json.scenes || [])[json.scene ?? 0];
  const roots = (sceneRecord && sceneRecord.nodes) || [];
  if (roots.length === 1) return { scene: build(roots[0]), nodeCount: countReachable(nodes, roots) };
  const scene = new THREE.Group();
  scene.name = (sceneRecord && sceneRecord.name) || 'Scene';
  for (const root of roots) scene.add(build(root));
  return { scene, nodeCount: countReachable(nodes, roots) + 1 };
}

function countReachable(nodes, roots) {
  let total = 0;
  const walk = (index) => {
    total++;
    for (const child of nodes[index].children || []) walk(child);
  };
  for (const root of roots) walk(root);
  return total;
}

async function checkPackage(id) {
  const dir = resolve(PACKAGE_DIR, id);
  const metadata = JSON.parse(readFileSync(resolve(dir, 'render-package.json'), 'utf8'));
  const { scene, nodeCount } = sceneFromGlbJson(readGlbJson(resolve(dir, 'render.glb')));

  const loader = createRenderPackageLoader({
    loadGlb: async () => ({ scene }),
    residency: createAssetResidencyRegistry(),
  });
  try {
    const loaded = await loader.load(metadata, { baseUrl: 'file:///packages/' });

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
