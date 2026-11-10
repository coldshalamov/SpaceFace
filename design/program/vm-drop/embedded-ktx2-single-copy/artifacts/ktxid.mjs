import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { registerEmbeddedKtx2Textures, setEmbeddedKtx2DirectSliceForBench } from '/workspace/spaceface-scratch/master-20260924u/src/render/embeddedKtx2Textures.js';
const file = process.argv[2];
async function run(on) {
  setEmbeddedKtx2DirectSliceForBench(on);
  const got = [];
  const ktx2 = { parse(buffer, onLoad) { got.push(createHash('sha256').update(new Uint8Array(buffer)).digest('hex') + ':' + buffer.byteLength); structuredClone(buffer, { transfer: [buffer] }); onLoad(new THREE.CompressedTexture([], 4, 4)); } };
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); loader.register(registerEmbeddedKtx2Textures); loader.setKTX2Loader(ktx2);
  const buf = readFileSync(file); const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await loader.parseAsync(ab, '');
  return { got: got.sort(), bvCached: [...Array(gltf.parser.json.bufferViews.length).keys()].filter((i) => gltf.parser.cache.get('bufferView:' + i)).length, bufferViews: gltf.parser.json.bufferViews.length, images: (gltf.parser.json.images||[]).length };
}
const off = await run(false); const on = await run(true);
console.log(JSON.stringify({ off: { n: off.got.length, bvCached: off.bvCached, bufferViews: off.bufferViews, images: off.images }, on: { n: on.got.length, bvCached: on.bvCached }, identical: JSON.stringify(off.got) === JSON.stringify(on.got) }));
