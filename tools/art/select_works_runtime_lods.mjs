// Select the runtime LOD registers of an authored works source GLB.
//
// The authoring candidate (e.g. assets/works/<family>/source/<family>.glb) keeps every LOD
// including the far LOD2 register for evidence. The shipped parts GLB must carry only the two
// live Asteroid Works registers (LOD0/work, LOD1/site); LOD2 never becomes a live fallback.
// This tool derives that selected runtime file deterministically from the frozen candidate
// bytes without touching them.
//
//   node tools/art/select_works_runtime_lods.mjs \
//     --input assets/works/gas_tap/source/gas_tap.glb \
//     --output assets/ships/parts/works/place_works_gas_tap.glb \
//     --drop-prefix LOD2_ --lods lod0,lod1
//
// The output is byte-deterministic for a given input: node removal plus glTF-Transform prune
// of now-unreferenced meshes/accessors, a contract `exportedLods` update, and a GLB write.
import { argv } from 'node:process';
import { readFile, writeFile, stat } from 'node:fs/promises';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

function parseArgs(args) {
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input') parsed.input = args[++i];
    else if (arg === '--output') parsed.output = args[++i];
    else if (arg === '--drop-prefix') parsed.dropPrefix = args[++i];
    else if (arg === '--lods') parsed.lods = String(args[++i]).split(',').map((s) => s.trim());
    else throw new Error(`unknown argument: ${arg}`);
  }
  for (const key of ['input', 'output', 'dropPrefix', 'lods']) {
    if (!parsed[key]) throw new Error(`missing --${key}`);
  }
  return parsed;
}

const options = parseArgs(argv.slice(2));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
  'meshopt.encoder': MeshoptEncoder,
});
const bytes = await io.read(options.input);
const document = bytes;
const root = document.getRoot();

const dropped = [];
for (const node of root.listNodes()) {
  if ((node.getName() || '').startsWith(options.dropPrefix)) {
    dropped.push(node.getName());
    node.dispose();
  }
}
// Nested dropped nodes (hook children such as LOD2_valve_wheel) can sit beneath kept markers.
for (const scene of root.listScenes()) {
  scene.traverse((node) => {
    for (const child of node.listChildren()) {
      if ((child.getName() || '').startsWith(options.dropPrefix)) {
        dropped.push(child.getName());
        child.dispose();
      }
    }
  });
}
if (!dropped.length) throw new Error(`no nodes matched --drop-prefix ${options.dropPrefix}`);

// The stamped contract (`spacefaceAsset`) appears on the scene, the root node, and the asset.
// Every copy must agree that only the selected registers ship.
const updateContract = (holder) => {
  const extras = holder.getExtras ? holder.getExtras() : null;
  if (!extras || typeof extras !== 'object') return false;
  const contract = extras.spacefaceAsset;
  if (!contract || typeof contract !== 'object') return false;
  holder.setExtras({ ...extras, spacefaceAsset: { ...contract, exportedLods: options.lods } });
  return true;
};
let contractsUpdated = 0;
for (const scene of root.listScenes()) if (updateContract(scene)) contractsUpdated += 1;
for (const node of root.listNodes()) if (updateContract(node)) contractsUpdated += 1;
if (!contractsUpdated) throw new Error('no spacefaceAsset contract found to update');

prune({ keepLeaves: false, keepAttributes: false, keepExtras: true })(document);

await io.write(options.output, document);

// This gltf-transform Asset exposes no extras accessors, so reconcile the asset-level contract
// copy directly in the written GLB's JSON chunk (scene and root-node copies were updated above).
{
  const payload = await readFile(options.output);
  const jsonLength = payload.readUInt32LE(12);
  const gltf = JSON.parse(payload.subarray(20, 20 + jsonLength).toString('utf-8').replace(/\s+$/u, ''));
  const contract = gltf.asset?.extras?.spacefaceAsset;
  if (contract && JSON.stringify(contract.exportedLods) !== JSON.stringify(options.lods)) {
    gltf.asset.extras.spacefaceAsset = { ...contract, exportedLods: options.lods };
    const jsonPayload = Buffer.from(JSON.stringify(gltf), 'utf-8');
    const padded = Buffer.alloc(Math.ceil(jsonPayload.length / 4) * 4, 0x20);
    jsonPayload.copy(padded);
    const binary = payload.subarray(20 + jsonLength);
    const total = 12 + 8 + padded.length + binary.length;
    const header = Buffer.alloc(20);
    header.write('glTF', 0, 'ascii');
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(total, 8);
    header.writeUInt32LE(padded.length, 12);
    header.write('JSON', 16, 'ascii');
    await writeFile(options.output, Buffer.concat([header, padded, binary]));
  }
}


const remaining = [];
document.getRoot().listNodes().forEach((node) => {
  if ((node.getName() || '').startsWith(options.dropPrefix)) remaining.push(node.getName());
});
if (remaining.length) throw new Error(`dropped LOD nodes survived: ${remaining.join(', ')}`);

console.log(JSON.stringify({
  ok: true,
  input: options.input,
  output: options.output,
  droppedNodes: dropped.sort(),
  exportedLods: options.lods,
  bytes: (await stat(options.output)).size,
}, null, 2));
