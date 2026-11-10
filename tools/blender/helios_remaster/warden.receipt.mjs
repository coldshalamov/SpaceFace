// Exact six-file promotion data and direct exported-interface check. Art is root-reviewed.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Matrix4, Vector3, Quaternion } from 'three';

const root = process.cwd();
const registry = JSON.parse(readFileSync('tools/blender/helios_remaster/warden.sources.json', 'utf8'));
const digest = b => createHash('sha256').update(b).digest('hex');
const document = b => JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)));
function interfaces(doc) {
  const result = {};
  function walk(index, parent) {
    const node = doc.nodes[index];
    const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
      new Vector3(...(node.translation || [0, 0, 0])),
      new Quaternion(...(node.rotation || [0, 0, 0, 1])),
      new Vector3(...(node.scale || [1, 1, 1])));
    const world = parent.clone().multiply(local);
    if (/SOCKET|MOUNT|COLLISION|HOOK|Gun_Assembly/i.test(node.name || '')) result[node.name] = world.elements;
    for (const child of node.children || []) walk(child, world);
  }
  for (const index of doc.scenes[doc.scene || 0].nodes) walk(index, new Matrix4());
  return result;
}

const assets = [];
for (const [name, pinned] of Object.entries(registry)) {
  const source = execFileSync('git', ['cat-file', 'blob', pinned.gitBlob], { cwd: root, maxBuffer: 128 * 1024 * 1024 });
  if (digest(source) !== pinned.sha256) throw Error('Original source hash mismatch: ' + name);
  const reportPath = `.devshots/helios-remaster/warden/${name}/candidate.json`;
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const candidate = readFileSync(resolve(root, report.candidatePath));
  if (digest(candidate) !== report.candidateSha256) throw Error('Candidate changed after export: ' + name);
  const before = document(source), after = document(candidate);
  const originalInterfaces = interfaces(before), newInterfaces = interfaces(after);
  const errors = [];
  for (const [node, matrix] of Object.entries(originalInterfaces)) {
    const actual = newInterfaces[node];
    if (!actual) errors.push('Missing ' + node);
    else if (matrix.some((v, i) => Math.abs(v - actual[i]) > 1e-4)) errors.push('Moved ' + node);
  }
  if (errors.length) throw Error(name + ': ' + errors.join(', '));
  if (!after.materials.every(m => m.extras?.spacefaceRemasterGeometry === true)) throw Error('Unflagged material: ' + name);
  const additions = after.nodes.filter(n => /Remaster/.test(n.name || '') && n.mesh != null);
  if (additions.some(n => !/^LOD[012]_/.test(n.name))) throw Error('Unrecognized addition LOD: ' + name);
  const oldMeta = before.asset.extras?.spacefaceAsset || before.scenes[0].extras?.spacefaceAsset;
  const newMeta = after.asset.extras?.spacefaceAsset || after.scenes[0].extras?.spacefaceAsset;
  for (const key of ['assetId', 'partId', 'forward', 'slot', 'category']) {
    if (oldMeta?.[key] !== undefined && JSON.stringify(oldMeta[key]) !== JSON.stringify(newMeta?.[key])) {
      throw Error(name + ': changed identity ' + key);
    }
  }
  assets.push({ ...report, interfacesVerified: Object.keys(originalInterfaces), nativeLodNamesVerified: true,
    allMaterialGeometryFlagsVerified: true, sourceGitBlob: pinned.gitBlob });
}
const contract = { scope: 'Warden production trio and exact three Helios hostile GLBs', candidateCount: assets.length,
  authoring: ['tools/blender/helios_remaster/warden.py', 'tools/blender/helios_remaster/warden.sources.json',
    'tools/blender/helios_remaster/WARDEN_HOSTILES.md', 'tools/blender/helios_remaster/warden.receipt.mjs'],
  visualAcceptance: 'Root independent actual Three gallery review; not granted by this receipt', assets };
writeFileSync('tools/blender/helios_remaster/warden.contract.json', JSON.stringify(contract, null, 2) + '\n');
console.log(JSON.stringify({ candidates: assets.length, interfaces: 'preserved including animation hooks',
  materialFlags: 'all true', lods: assets.map(a => ({ name: a.asset, before: a.baseline, after: a.candidate })) }));
