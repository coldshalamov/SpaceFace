#!/usr/bin/env node
// Validate the shared lighting catalog and optional JSON / GLB extras without a WebGL context.
// Usage: node scripts/check-nocturne-authoring.mjs [asset.glb | metadata.json ...]
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { NOCTURNE_LIGHT_PROFILES, NOCTURNE_LAYOUTS, NOCTURNE_COMPOSITIONS,
  NOCTURNE_CONTENT_LIMITS } from '../src/data/nocturneLighting.js';
import { validateNocturneLightMetadata, validateNocturneMediumMetadata } from '../src/render/nocturne/content.js';

let checked = 0;
const errors = [];
function checkLight(light, where, sockets = null) {
  for (const problem of validateNocturneLightMetadata(light)) errors.push(`${where}: ${problem}`);
  if (sockets && light.socket && !sockets.has(light.socket)) errors.push(`${where}: missing socket ${light.socket}`);
  checked++;
}
function checkMetadata(metadata, where, sockets = null) {
  if (metadata === false) return;
  if (!metadata || typeof metadata !== 'object') { errors.push(`${where}: metadata must be an object or false`); return; }
  if (metadata.lights != null) {
    if (!Array.isArray(metadata.lights)) errors.push(`${where}: lights must be an array`);
    else {
      if (metadata.lights.length > NOCTURNE_CONTENT_LIMITS.maxLightsPerOwner) errors.push(`${where}: exceeds per-owner source capacity`);
      const ids = new Set();
      for (let i = 0; i < metadata.lights.length; i++) {
        const light = metadata.lights[i];
        if (light?.id && ids.has(light.id)) errors.push(`${where}: duplicate source id ${light.id}`);
        if (light?.id) ids.add(light.id);
        checkLight(light, `${where}.lights[${i}]`, sockets);
      }
    }
  }
  if (metadata.medium != null) for (const problem of validateNocturneMediumMetadata(metadata.medium)) errors.push(`${where}.medium: ${problem}`);
  if (metadata.composition != null && !NOCTURNE_COMPOSITIONS[metadata.composition]) errors.push(`${where}: unknown composition ${metadata.composition}`);
}

for (const [name, profile] of Object.entries(NOCTURNE_LIGHT_PROFILES)) {
  assert.ok(['point', 'spot', 'directional', 'area'].includes(profile.type), `${name}: light type`);
  assert.equal(profile.decay, 2, `${name}: inverse-square calibration`);
  assert.ok(profile.intensity > 0 && profile.intensity <= 1e6 && profile.range > 0 && profile.range <= 4000, `${name}: bounded energy and range`);
}
for (const [name, rows] of Object.entries(NOCTURNE_LAYOUTS)) {
  assert.ok(rows.length <= NOCTURNE_CONTENT_LIMITS.maxLightsPerOwner, `${name}: source capacity`);
  for (const row of rows) checkLight(row, `layout.${name}.${row.id}`);
}
for (const composition of Object.values(NOCTURNE_COMPOSITIONS)) {
  assert.ok(composition.exposureRange[0] <= composition.exposure && composition.exposure <= composition.exposureRange[1], `${composition.id}: exposure outside authored range`);
  if (composition.medium) for (const problem of validateNocturneMediumMetadata(composition.medium)) errors.push(`${composition.id}: ${problem}`);
}
for (const filename of process.argv.slice(2)) {
  try {
    const bytes = await readFile(filename);
    if (extname(filename).toLowerCase() === '.glb') {
      assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'invalid GLB signature');
      assert.equal(bytes.readUInt32LE(4), 2, 'GLB version 2 required');
      assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, 'GLB JSON chunk required');
      const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
      const sockets = new Set((gltf.nodes || []).map(node => node.name).filter(Boolean));
      for (const [index, node] of (gltf.nodes || []).entries()) {
        if (node.extras?.nocturne != null) checkMetadata(node.extras.nocturne, `${filename}:node[${index}]`, sockets);
      }
      for (const [index, scene] of (gltf.scenes || []).entries()) {
        if (scene.extras?.nocturne != null) checkMetadata(scene.extras.nocturne, `${filename}:scene[${index}]`, sockets);
      }
    } else {
      const json = JSON.parse(bytes.toString('utf8'));
      checkMetadata(json.nocturne ?? json.userData?.nocturne ?? json, filename);
    }
  } catch (error) { errors.push(`${filename}: ${error.message}`); }
}
if (errors.length) {
  for (const error of errors) console.error(error);
  process.exitCode = 1;
} else console.log(`NOCTURNE authoring: ${Object.keys(NOCTURNE_LIGHT_PROFILES).length} profiles, ${checked} fixture descriptors, ${Object.keys(NOCTURNE_COMPOSITIONS).length} compositions valid.`);
