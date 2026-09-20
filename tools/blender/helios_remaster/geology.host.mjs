// Authoring bridge: use the shipping common-rock construction, not an approximation.
// Blender fits the surveyed landmark assembly to this coherent lithic host.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Texture } from 'three';
import { createVisualFactory } from '../../../src/render/visualFactory.js';
import { preloadRockSurfaceLibrary } from '../../../src/render/rockSurfaceLibrary.js';

function hashId(value) {
  let hash = 2166136261;
  for (const c of value) { hash ^= c.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}
let serial = 0, id;
do { id = `helios-surveyed-shear-${serial++}`; } while (hashId(id) % 5 !== 1);
globalThis.__SF_VISUAL_FACTORY_THROW__ = true;
// Only geometry is serialized. Supply decoded-map placeholders to avoid the
// browser's fallback canvas path; Blender loads the real packaged pixels.
await preloadRockSurfaceLibrary({ initTexture() {} }, { loadTexture: async () => new Texture() });
const root = createVisualFactory().build({ id, type: 'asteroid', radius: 1,
  alive: true, pos: { x: 0, z: 0 }, data: { typeId: 'ast_common_rock' } });
const geometry = (root.userData.asteroidInstanceBody || root.userData.asteroidBody).geometry;
const attributes = Object.fromEntries(['position', 'normal', 'uv', 'color', 'sfGeologyPbr']
  .map(name => [name, { itemSize: geometry.attributes[name].itemSize,
    array: Array.from(geometry.attributes[name].array) }]));
const output = new URL('../../../.devshots/helios-remaster/geology/common-host.json', import.meta.url);
mkdirSync(fileURLToPath(new URL('.', output)), { recursive: true });
writeFileSync(output, JSON.stringify({ variant: geometry.userData.spacefaceGeology, attributes }) + '\n');
console.log(JSON.stringify({ output: fileURLToPath(output), triangles: geometry.attributes.position.count / 3,
  variant: geometry.userData.spacefaceGeology.variantName }));
