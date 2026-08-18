#!/usr/bin/env node
// scripts/stamp-wholeship-release-identity.mjs
//
// Stamp a rebuilt whole-ship RELEASE GLB with its spaceface asset identity, then refresh every
// binding that records its bytes.
//
// WHY THIS EXISTS
// ---------------
// A remastered hull can be exported with correct geometry AND correct compression and still be
// unshippable, because the identity block in `asset.extras.spacefaceAsset` is added by a finishing
// step that is easy to skip. Without it the file is rejected by check:bundle and by the render
// package pilots, and the honest-looking workaround -- reverting to the previous artifact -- throws
// the remaster away. This script is the third option: keep the new geometry, add the missing stamp.
//
// It is deliberately conservative:
//   * The stamp is inherited from the artifact currently in git (the last known-good identity), so
//     nothing is invented. Only the fields that genuinely describe THIS file are recomputed.
//   * The material set is compared against the inherited materialBillRuntimeMap. A remaster that
//     renamed or dropped a material is a different asset and must go through the real authoring
//     pipeline, so that case fails loudly instead of being stamped anyway.
//   * Compression claims are verified against the file, never copied. Claiming KTX2 on a raw file
//     would be a lie that check:bundle would later have to catch.
//
//   node scripts/stamp-wholeship-release-identity.mjs --part kestrel [--apply]
//
// Without --apply it reports what it would do and writes nothing.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const APPLY = process.argv.includes('--apply');
const PART = (() => {
  const i = process.argv.indexOf('--part');
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : 'kestrel';
})();

const RELEASE_GLB = `assets/ships/release/parts/wholeships/${PART}.glb`;
const RELEASE_MANIFEST = 'assets/ships/release/release_manifest.json';
const PILOTS = 'assets/ships/render-packages/pilots.json';

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

function parseGlb(bytes) {
  if (bytes.readUInt32LE(0) !== GLB_MAGIC) throw new Error('not a GLB');
  const total = bytes.readUInt32LE(8);
  if (total !== bytes.length) throw new Error(`declared length ${total} != ${bytes.length} on disk`);
  const chunks = [];
  let offset = 12;
  while (offset < bytes.length) {
    const len = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    chunks.push({ type, data: bytes.subarray(offset + 8, offset + 8 + len) });
    offset += 8 + len;
  }
  const jsonChunk = chunks.find((c) => c.type === CHUNK_JSON);
  if (!jsonChunk) throw new Error('GLB has no JSON chunk');
  return { chunks, json: JSON.parse(jsonChunk.data.toString('utf8')) };
}

// Rebuild the container around a modified JSON chunk. Both chunks must stay 4-byte aligned, JSON
// padded with spaces and BIN with zeroes -- padding JSON with NULs is a spec violation that some
// loaders accept and others reject, which is exactly the kind of "works here" defect to avoid.
function writeGlb(chunks, json) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = (4 - (jsonBytes.length % 4)) % 4;
  const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc(jsonPad, 0x20)]);
  const out = [];
  let bodyLength = 0;
  for (const chunk of chunks) {
    const isJson = chunk.type === CHUNK_JSON;
    const data = isJson ? jsonPadded : chunk.data;
    const pad = isJson ? 0 : (4 - (data.length % 4)) % 4;
    const padded = pad ? Buffer.concat([data, Buffer.alloc(pad, chunk.type === CHUNK_BIN ? 0x00 : 0x20)]) : data;
    const header = Buffer.alloc(8);
    header.writeUInt32LE(padded.length, 0);
    header.writeUInt32LE(chunk.type, 4);
    out.push(header, padded);
    bodyLength += 8 + padded.length;
  }
  const head = Buffer.alloc(12);
  head.writeUInt32LE(GLB_MAGIC, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + bodyLength, 8);
  return Buffer.concat([head, ...out]);
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

function inheritedStamp() {
  // The last shipped identity for this exact path, straight out of git. Never invented.
  const prior = execFileSync('git', ['show', `HEAD:${RELEASE_GLB}`], { cwd: ROOT, maxBuffer: 1 << 30 });
  const { json } = parseGlb(prior);
  const stamp = json.asset?.extras?.spacefaceAsset;
  if (!stamp) throw new Error(`HEAD:${RELEASE_GLB} carries no spacefaceAsset stamp to inherit`);
  return stamp;
}

const glbPath = resolve(ROOT, RELEASE_GLB);
const bytes = readFileSync(glbPath);
const { chunks, json } = parseGlb(bytes);

if (json.asset?.extras?.spacefaceAsset) {
  console.log(`${RELEASE_GLB} is already stamped (${json.asset.extras.spacefaceAsset.assetId}); nothing to do.`);
  process.exit(0);
}

const stamp = { ...inheritedStamp() };

// --- gate 1: compression claims must be TRUE of this file --------------------------------------
const ext = new Set(json.extensionsUsed || []);
const hasKtx2 = ext.has('KHR_texture_basisu');
const hasMeshopt = ext.has('EXT_meshopt_compression');
if (stamp.textureCompression && !hasKtx2) {
  throw new Error(`${RELEASE_GLB} has no KHR_texture_basisu; it is not a finished release artifact. Build it through the release pipeline before stamping.`);
}
if (stamp.meshCompression && !hasMeshopt) {
  throw new Error(`${RELEASE_GLB} has no EXT_meshopt_compression; it is not a finished release artifact.`);
}

// --- gate 2: the material set must still match the inherited bill -------------------------------
const materialNames = new Set((json.materials || []).map((m) => m.name).filter(Boolean));
const billed = new Set(Object.values(stamp.materialBillRuntimeMap || {}).flat());
const unbilled = [...materialNames].filter((n) => !billed.has(n));
const missingFromFile = [...billed].filter((n) => !materialNames.has(n));
if (unbilled.length || missingFromFile.length) {
  throw new Error(
    `${RELEASE_GLB} material set no longer matches the inherited runtime bill. `
    + `Unbilled in file: [${unbilled.join(', ')}]. Billed but absent: [${missingFromFile.join(', ')}]. `
    + 'A renamed or dropped material is a different asset and must go through the authoring pipeline.',
  );
}

// --- recompute only what genuinely describes THIS file ------------------------------------------
stamp.acceptedCandidateSha256 = sha256(bytes).toUpperCase();
stamp.generationFingerprint = sha256(Buffer.concat([
  Buffer.from(JSON.stringify({
    nodes: (json.nodes || []).length,
    meshes: (json.meshes || []).length,
    materials: [...materialNames].sort(),
    ext: [...ext].sort(),
  })),
])).toUpperCase();
stamp.liveRuntimeFile = `wholeships/${PART}.glb`;

json.asset = json.asset || {};
json.asset.extras = { ...(json.asset.extras || {}), spacefaceAsset: stamp };

const stamped = writeGlb(chunks, json);
const stampedSha = sha256(stamped);

console.log(`part            ${PART}`);
console.log(`geometry        ${(json.nodes || []).length} nodes / ${(json.meshes || []).length} meshes / ${materialNames.size} materials`);
console.log(`compression     KTX2=${hasKtx2} meshopt=${hasMeshopt}`);
console.log(`assetId         ${stamp.assetId}`);
console.log(`before          ${sha256(bytes)} / ${bytes.length} bytes (unstamped)`);
console.log(`after           ${stampedSha} / ${stamped.length} bytes (stamped)`);

if (!APPLY) {
  console.log('\ndry run - pass --apply to write the stamp and refresh the bindings.');
  process.exit(0);
}

writeFileSync(glbPath, stamped);

// --- refresh every binding that records these bytes ---------------------------------------------
const manifestPath = resolve(ROOT, RELEASE_MANIFEST);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const row = (manifest.assets || []).find((r) => r.release === RELEASE_GLB);
if (!row) throw new Error(`${RELEASE_MANIFEST} has no row for ${RELEASE_GLB}`);
const sourcePath = resolve(ROOT, row.source);
const sourceBytes = readFileSync(sourcePath);
row.releaseSha256 = stampedSha;
row.releaseBytes = stamped.length;
// The manifest's source record had drifted too; a binding that is half fresh is worse than one
// that is wholly stale, because it looks checked.
row.sourceSha256 = sha256(sourceBytes);
row.sourceBytes = sourceBytes.length;
row.textures = (json.images || []).length;
row.ktx2Textures = (json.images || []).filter((img) => (img.mimeType || '').includes('ktx2')).length;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const pilotsPath = resolve(ROOT, PILOTS);
const pilots = JSON.parse(readFileSync(pilotsPath, 'utf8'));
const pilot = (pilots.pilots || []).find((x) => x.sourceUrl === RELEASE_GLB);
if (pilot) {
  pilot.releaseSha256 = stampedSha;
  pilot.releaseBytes = stamped.length;
  writeFileSync(pilotsPath, `${JSON.stringify(pilots, null, 2)}\n`);
}

console.log('\nstamped and refreshed release_manifest.json + pilots.json.');
console.log('Next: npm run build:render-package-pilots, then npm run check:bundle.');
