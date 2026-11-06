import { renderRuckusMeshManifest } from './meshManifest.mjs';
/** Validate and optimize the Blender GLBs used by the runtime's demand warm.
 * The live visual factory stays synchronous after the New Game/Continue warm has completed;
 * GLBs remain the interchange/editing source of truth.
 * Run from the repo: node tools/ruckus/pack-model.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, prune } from '@gltf-transform/functions';
const root = new URL('../../', import.meta.url);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const rows = [['body0','ruckus-lod0.glb'],['body1','ruckus-lod1.glb'],['body2','ruckus-lod2.glb'],['core','pressure-core.glb']];
const report = {};
for (const [key, name] of rows) {
  const url = new URL(`assets/characters/ruckus/${name}`, root);
  const doc = await io.read(fileURLToPath(url));
  await doc.transform(weld(), dedup(), prune());
  await io.write(fileURLToPath(url), doc);
  const bytes = await readFile(url);
  if (bytes.toString('ascii',0,4) !== 'glTF' || bytes.readUInt32LE(4) !== 2) throw Error(`${name}: not GLB2`);
  const len = bytes.readUInt32LE(12), json = JSON.parse(bytes.toString('utf8',20,20+len));
  if (json.skins?.length || json.textures?.length || json.animations?.length) throw Error(`${name}: unsupported runtime payload`);
  for (const a of json.accessors || []) if (a.sparse) throw Error(`${name}: sparse accessor`);
  // NodeIO defaults to an interleaved layout. Runtime unpack explicitly respects byteStride.
  // Keep the optimized GLB as the runtime payload: warmRuckusModel fetches its JSON/BIN chunks
  // and the existing sliced decoder builds the same authored geometry before opening flight.
  let triangles = 0, drawCalls = 0;
  for (const mesh of json.meshes || []) for (const p of mesh.primitives) {
    if ((p.mode ?? 4) !== 4) throw Error(`${name}: non-triangle primitive`);
    triangles += (p.indices == null ? json.accessors[p.attributes.POSITION].count : json.accessors[p.indices].count) / 3;
    drawCalls++;
  }
  report[name] = { bytes: bytes.length, triangles, drawCalls };
}
await writeFile(new URL('src/render/characters/ruckusMeshData.js',root),
  renderRuckusMeshManifest(rows.map(([key]) => key)));
const manifestURL=new URL('assets/characters/ruckus/manifest.json',root);
const manifest=JSON.parse(await readFile(manifestURL,'utf8'));manifest.files=report;
manifest.runtime='Demand-fetched optimized GLB accessors; identical geometry, rigid nodes and materials';
await writeFile(manifestURL,JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
