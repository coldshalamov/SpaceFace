// Seal the native-driven jaw bindings from the canonical authored source, never from a preview.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { validateMotionBank } from '../src/contracts/motionBank.js';
import { readGlbJson } from './lib/renderPackageRuntimeTable.mjs';

const source = new URL('../assets/ships/parts/places/place_anvil_storm_orchard.glb', import.meta.url);
const output = new URL('../assets/ships/motions/anvil-storm-orchard.motion.json', import.meta.url);
const bytes = await readFile(source);
const gltf = readGlbJson(bytes);
const geometry = JSON.parse(await readFile(new URL('../src/data/anvilOrchardGeometry.json', import.meta.url), 'utf8'));
const metadata = gltf.scenes[gltf.scene ?? 0]?.extras?.spacefaceAsset;
if (metadata?.assetId !== geometry.assetId) throw new Error('Orchard motion source identity mismatch');
const sourceSha = createHash('sha256').update(bytes).digest('hex');
if (sourceSha !== geometry.sourceGlbSha256) throw new Error('Orchard motion source seal mismatch');
const bindings = geometry.rigs.map(rig => {
  const matches = gltf.nodes.filter(node => node.name === rig.node);
  if (matches.length !== 1 || matches[0].matrix) throw new Error(`Expected one authored TRS pivot ${rig.node}`);
  const node = matches[0];
  return { id: rig.node.toLowerCase().replace(/^motion_/, ''), node: rig.node, parent: null,
    restPose: { translation: node.translation || [0, 0, 0], rotation: node.rotation || [0, 0, 0, 1], scale: node.scale || [1, 1, 1] },
    requiredAtLod: [0, 1, 2] };
});
const bank = validateMotionBank({ schema: 'spaceface.rigidMotionBank.v1', rigId: 'anvil_storm_orchard_jaws',
  sourceAssetId: geometry.assetId, sourceGlbSha256: sourceSha, fps: 60, bindings, events: {},
  clips: [{ name: 'nativeRest', durationS: 1 / 60, loop: false, endMode: 'rest', channels: bindings.map(binding => ({
    group: binding.id, path: 'translation', times: [0, 1 / 60], values: [0, 0, 0, 0, 0, 0], interpolation: 'linear',
  })) }],
  simulationAuthority: 'Orchard native actual jaw body pose; renderer applies after bank update. No event-driven clip owns jaw travel.',
});
await mkdir(new URL('../assets/ships/motions/', import.meta.url), { recursive: true });
await writeFile(output, JSON.stringify(bank, null, 2) + '\n');
console.log(`Sealed ${bindings.length} native jaw bindings: ${fileURLToPath(output)}`);
