#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';
import * as THREE from 'three';

import { applyAuthoredMaterialProfile } from '../src/render/authoredMaterialProfiles.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.resolve(process.argv[2] || path.join(ROOT, '.devshots', 'graphics', 'pbr-fallback'));
const ROLES = Object.freeze([
  'hull', 'accent', 'mechanical', 'warning', 'geology', 'radiator',
  'docking', 'ceramic', 'service', 'rubber', 'repair',
]);
const COLUMNS = Object.freeze(['baseColor', 'normal', 'orm']);

await mkdir(OUT, { recursive: true });
const rows = [];
let tileSize = 0;

for (const role of ROLES) {
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0.5 });
  material.name = `Preview_${role}`;
  applyAuthoredMaterialProfile(material, role, { assetId: `preview_${role}` });
  const fallback = material.userData.spacefaceProceduralPbrFallback;
  if (!fallback) throw new Error(`fallback was not generated for ${role}`);
  const textures = [material.map, material.normalMap, material.roughnessMap];
  const size = Number(textures[0]?.image?.width || 0);
  if (!size || textures.some((texture) => texture?.image?.width !== size || texture?.image?.height !== size)) {
    throw new Error(`${role} generated inconsistent texture dimensions`);
  }
  if (material.roughnessMap !== material.metalnessMap) throw new Error(`${role} ORM is not shared`);
  tileSize = tileSize || size;
  if (size !== tileSize) throw new Error(`${role} does not match ${tileSize}px preview tiles`);
  rows.push({ role, fallback, textures });
}

const png = new PNG({ width: tileSize * COLUMNS.length, height: tileSize * rows.length });
for (let row = 0; row < rows.length; row += 1) {
  for (let column = 0; column < COLUMNS.length; column += 1) {
    const source = rows[row].textures[column].image.data;
    for (let y = 0; y < tileSize; y += 1) {
      const targetOffset = ((row * tileSize + y) * png.width + column * tileSize) * 4;
      const sourceOffset = y * tileSize * 4;
      png.data.set(source.subarray(sourceOffset, sourceOffset + tileSize * 4), targetOffset);
    }
  }
}

const pngBytes = PNG.sync.write(png);
const pngPath = path.join(OUT, 'pbr-role-contact-sheet.png');
await writeFile(pngPath, pngBytes);
const report = {
  schema: 'spaceface.proceduralPbrFallbackPreview.v1',
  generator: 'src/render/proceduralPbrFallback.js',
  columns: COLUMNS,
  rows: rows.map(({ role, fallback, textures }) => ({
    role,
    fallback,
    maps: Object.fromEntries(COLUMNS.map((column, index) => [column, channelStats(textures[index])])),
  })),
  tileSize,
  output: path.relative(ROOT, pngPath).replaceAll('\\', '/'),
  sha256: createHash('sha256').update(pngBytes).digest('hex'),
};
await writeFile(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

function channelStats(texture) {
  const data = texture.image.data;
  const channels = [];
  for (let channel = 0; channel < 3; channel += 1) {
    let min = 255;
    let max = 0;
    let sum = 0;
    let sumSquares = 0;
    let count = 0;
    for (let offset = channel; offset < data.length; offset += 4) {
      const value = data[offset];
      min = Math.min(min, value);
      max = Math.max(max, value);
      sum += value;
      sumSquares += value * value;
      count += 1;
    }
    const mean = sum / count;
    channels.push({
      min,
      max,
      mean: Number(mean.toFixed(4)),
      stdDev: Number(Math.sqrt(Math.max(0, sumSquares / count - mean * mean)).toFixed(4)),
    });
  }
  return Object.freeze({ r: channels[0], g: channels[1], b: channels[2] });
}
