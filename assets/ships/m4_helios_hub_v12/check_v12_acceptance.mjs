/** Hard evidence gate for the isolated Helios V12 candidate. */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(resolve(HERE, p), 'utf8'));
const validation = read('validation_report.json');
const runtime = read('evidence/three_final/runtime_loader_receipt.json');
const controller = read('controller_visual_disposition.json');
const failures = [];
const requireCheck = (condition, message) => { if (!condition) failures.push(message); };

requireCheck(validation.status === 'candidate-exported-not-promoted', 'candidate status must remain isolated');
requireCheck(validation.exports?.length === 5, 'exact five candidate GLBs required');
for (const item of validation.exports || []) {
  requireCheck(item.glbMagic === 'glTF', `${item.file}: GLB magic invalid`);
  requireCheck(item.bytes > 10_000, `${item.file}: suspiciously empty`);
  requireCheck(item.bytes < 100_000_000, `${item.file}: exceeds GitHub 100MB hard limit`);
  requireCheck(item.meshCount > 0 && item.triangles > 500, `${item.file}: geometry profile too sparse`);
  requireCheck(item.materials?.length >= 2, `${item.file}: material hierarchy missing`);
}
requireCheck(validation.hub?.connectedAssembly === true, 'hub rooted assembly missing');
requireCheck(validation.hub?.rootedHierarchy >= 100, 'hub surface/detail hierarchy below professional Stage-B floor');
requireCheck(validation.hub?.sourceDetailObjects?.length >= 5, 'CC0 source detail hierarchy not retained');
requireCheck(validation.hub?.excludedArtifactObjects?.length === 0, 'spike/antenna artifacts remain');
requireCheck(validation.gate?.connectedAssembly === true, 'gate rooted assembly missing');
requireCheck(validation.gate?.rootedHierarchy >= 30, 'gate emitter/mechanical hierarchy too sparse');
requireCheck(validation.rocks?.allWatertight === true, 'rock/crystal mesh contains boundary or non-manifold edges');
requireCheck(runtime.loaderPath?.includes('GLTFLoader'), 'Three.js runtime loader path not proven');
requireCheck(runtime.shots?.length === 11, 'expected eleven runtime evidence shots');
requireCheck(runtime.shots?.every((shot) => shot.ok), 'one or more runtime evidence shots failed');
const contact = runtime.shots?.find((shot) => shot.mode === 'contact');
requireCheck(contact && Math.max(contact.projectedPixelBounds.width, contact.projectedPixelBounds.height) < 45,
  'hub contact silhouette must remain below 45px');
requireCheck(controller.status === 'CANDIDATE_CHECKPOINT_ONLY' && controller.accepted === false,
  'controller disposition must keep V12 explicitly unaccepted and unpromoted');

const blenderEvidence = [
  'v12_hub_close_final.png', 'v12_hub_120wu_final.png', 'v12_hub_rear_final.png',
  'v12_gate_close_final.png', 'v12_rocks_close_final.png', 'v12_family_final.png',
  'v12_hub_contact_lt45px_final.png',
];
for (const file of blenderEvidence) {
  const path = resolve(HERE, 'evidence/final', file);
  requireCheck(existsSync(path) && statSync(path).size > 50_000, `${file}: missing or empty Blender evidence`);
}
const receipt = {
  schema: 'spaceface.heliosV12CandidateCheckpoint.v1',
  status: failures.length ? 'TECHNICAL_REJECT' : 'TECHNICAL_PASS_VISUAL_REJECT',
  accepted: false,
  promotion: false,
  checks: 16 + (validation.exports?.length || 0) * 5 + blenderEvidence.length,
  failures,
  evidence: {
    validation: 'validation_report.json',
    runtime: 'evidence/three_final/runtime_loader_receipt.json',
    controller: 'controller_visual_disposition.json',
  },
};
writeFileSync(resolve(HERE, 'acceptance_report.json'), JSON.stringify(receipt, null, 2));
console.log(`[v12-checkpoint] ${receipt.status} failures=${failures.length}`);
for (const failure of failures) console.error(`- ${failure}`);
if (failures.length) process.exitCode = 1;
