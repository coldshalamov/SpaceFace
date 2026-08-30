import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { copyFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import JPEG from 'jpeg-js';
import { PNG } from 'pngjs';
import { ensureWholeshipAssetContractMetadata } from './lib/wholeshipAssetIdentity.mjs';

import {
  inspectGlbReleaseCompression,
  inspectReleaseAssetPair,
} from '../src/contracts/assetReleaseValidation.js';
import { ktx2Serial } from './lib/ktx2SerialTransform.mjs';
import { RELEASE_MESHOPT_OPTIONS } from './lib/releaseMeshoptProfile.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PART_MANIFEST = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const RELEASE_ROOT = resolve(ROOT, 'assets/ships/release');
const RELEASE_MANIFEST = resolve(RELEASE_ROOT, 'release_manifest.json');
const STAGED_RELEASE_ROOT = resolve(ROOT, 'assets/ships/release.__building');
const PREVIOUS_RELEASE_ROOT = resolve(ROOT, 'assets/ships/release.__previous');
const RELEASE_BUILD_LOCK = resolve(ROOT, 'assets/ships/release.__lock');
const argvList = process.argv.slice(2);
const argv = new Set(argvList);
if (argv.has('--help') || argv.has('-h')) {
  console.log([
    'Usage: node scripts/build-sg04-release-assets.mjs [options]',
    '',
    '  --resume-valid       Reuse already-valid staged outputs during a full atomic build.',
    '  --no-clean           Build directly into the live release directory.',
    '  --only <id[,id...]>  Rebuild selected manifest ids; requires --no-clean.',
    '  --help, -h           Print this help without acquiring the release lock.',
  ].join('\n'));
  process.exit(0);
}
const DIRECT_LIVE_BUILD = argv.has('--no-clean');
const RESUME_VALID = argv.has('--resume-valid');
const ONLY_IDS = readOnlyIds(argvList);
if (ONLY_IDS.size && !DIRECT_LIVE_BUILD) {
  throw new Error('--only requires --no-clean so an incremental build preserves the existing release manifest');
}
const BUILD_RELEASE_ROOT = DIRECT_LIVE_BUILD ? RELEASE_ROOT : STAGED_RELEASE_ROOT;
const BUILD_RELEASE_MANIFEST = resolve(BUILD_RELEASE_ROOT, 'release_manifest.json');

assertUnderAssetShips('release root', RELEASE_ROOT);
assertUnderAssetShips('staged release root', STAGED_RELEASE_ROOT);
assertUnderAssetShips('previous release root', PREVIOUS_RELEASE_ROOT);
assertUnderAssetShips('release build lock', RELEASE_BUILD_LOCK);

const releaseBuildLock = acquireReleaseBuildLock();
process.on('exit', releaseBuildLock);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    releaseBuildLock();
    process.exit(signal === 'SIGINT' ? 130 : 143);
  });
}

const partManifest = JSON.parse(readFileSync(PART_MANIFEST, 'utf8'));
const packageJson = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'));
// Authored whole-ship bodies live in assets/ships/parts/wholeships/ but are NOT in parts_manifest.json.
// They are runtime-wired (partsLibrary.js WHOLE_SHIP_FILE_BY_DEF_ID) and were previously copied into
// release/ uncompressed and unmanifested. Fold them into the standard build so they get meshopt
// compression (their SOCKET_*/LOD* nodes are preserved by inspectReleaseAssetPair's parity check) and
// a release_manifest.json entry — same release standard as the kestrel reference and every part.
// Kestrel V4 ships LOD0 through the canonical player path. Its independently authored LOD1/LOD2
// family members remain release-built and hash-bound for a future separate-file residency selector;
// the current runtime deliberately decodes only LOD0 rather than tripling starter-ship residency.
const WHOLE_SHIP_FILES = [
  'kestrel.glb',
  'kestrel_lod1.glb',
  'kestrel_lod2.glb',
  'pelican.glb',
  'wasp.glb',
  'drifter_production_v1.glb',
  'drifter_production_v1_lod1.glb',
  'drifter_production_v1_lod2.glb',
  'ranger_production_v1.glb',
  'ranger_production_v1_lod1.glb',
  'ranger_production_v1_lod2.glb',
  'ironback_production_v1.glb',
  'ironback_production_v1_lod1.glb',
  'ironback_production_v1_lod2.glb',
];
const manifestPartFiles = new Set((partManifest.parts || []).map((part) => part.file));
const allAssets = [
  {
    id: 'ship_kestrel_reference',
    kind: 'ship-reference',
    source: 'assets/ships/kestrel/kestrel_reference.glb',
    release: 'assets/ships/release/kestrel/kestrel_reference.glb',
  },
  ...(partManifest.parts || [])
    .filter((part) => part.status !== 'blocked')
    .map((part) => ({
      id: part.id,
      kind: `part:${part.category}`,
      source: `assets/ships/parts/${part.file}`,
      release: `assets/ships/release/parts/${part.file}`,
    })),
  ...WHOLE_SHIP_FILES.filter((file) => !manifestPartFiles.has(`wholeships/${file}`)).map((file) => ({
    id: `wholeship_${file.replace(/\.glb$/, '')}`,
    kind: 'part:wholeships',
    source: `assets/ships/parts/wholeships/${file}`,
    release: `assets/ships/release/parts/wholeships/${file}`,
  })),
];
const assets = ONLY_IDS.size ? allAssets.filter((asset) => ONLY_IDS.has(asset.id)) : allAssets;
if (ONLY_IDS.size && assets.length !== ONLY_IDS.size) {
  const found = new Set(assets.map((asset) => asset.id));
  const missing = [...ONLY_IDS].filter((id) => !found.has(id));
  throw new Error(`unknown --only release asset id(s): ${missing.join(', ')}`);
}

if (!DIRECT_LIVE_BUILD && !RESUME_VALID) {
  await rm(STAGED_RELEASE_ROOT, { recursive: true, force: true });
}
await mkdir(BUILD_RELEASE_ROOT, { recursive: true });

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });

const existingReleaseManifest = ONLY_IDS.size && existsSync(RELEASE_MANIFEST)
  ? JSON.parse(readFileSync(RELEASE_MANIFEST, 'utf8'))
  : null;
const blockedReleaseSources = new Set((partManifest.parts || [])
  .filter((part) => part.status === 'blocked')
  .map((part) => `assets/ships/parts/${part.file}`));
const manifestAssets = existingReleaseManifest && Array.isArray(existingReleaseManifest.assets)
  ? existingReleaseManifest.assets.filter((asset) => !ONLY_IDS.has(asset.id) && !blockedReleaseSources.has(asset.source))
  : [];
for (let index = 0; index < assets.length; index++) {
  const asset = assets[index];
  const sourceAbs = resolve(ROOT, asset.source);
  const outputReleasePath = buildReleasePath(asset.release);
  const releaseAbs = resolve(ROOT, outputReleasePath);

  try {
    if (!existsSync(sourceAbs)) throw new Error(`missing SG-04 source asset: ${asset.source}`);

    if (RESUME_VALID) {
      const existingPair = inspectExistingReleasePair(asset, outputReleasePath);
      if (existingPair) {
        const sourceBytes = readFileSync(sourceAbs);
        const releaseBytes = readFileSync(releaseAbs);
        appendManifestAsset(manifestAssets, asset, existingPair, sourceBytes, releaseBytes);
        console.log(`[sg04] ${index + 1}/${assets.length} ${asset.id}: skip-valid ${sourceBytes.length} -> ${releaseBytes.length} bytes`);
        continue;
      }
    }

    const sourceInspection = inspectGlbReleaseCompression(asset.source, { root: ROOT, releaseMode: false });
    if (!sourceInspection.ok) {
      throw new Error(`source asset does not parse before release build: ${asset.source}`);
    }

    console.log(`[sg04] ${index + 1}/${assets.length} ${asset.id}: build-start ${asset.source} -> ${outputReleasePath}`);
    await mkdir(dirname(releaseAbs), { recursive: true });
    const document = await io.read(sourceAbs);
    if (asset.kind === 'part:wholeships') ensureWholeshipAssetContractMetadata(document);
    splitIncompatibleTextureSlots(document);
    const transforms = [];
    // Sources that already ship KTX2/BasisU textures (e.g. authored hull GLBs) are KTX2-native and
    // must skip the pngjs decode -> re-encode path: re-encoding would be lossy and pngjs can't read KTX2.
    // They only need meshopt geometry compression to satisfy the release contract.
    const sourceAlreadyKtx2 = sourceInspection.metrics.textureCount > 0
      && sourceInspection.metrics.ktx2TextureCount === sourceInspection.metrics.textureCount;
    if (sourceInspection.metrics.textureCount > 0 && !sourceAlreadyKtx2) {
      transforms.push(
        ktx2Serial({
          slots: /^(baseColorTexture|emissiveTexture)$/,
          imageDecoder: decodeImage,
          isUASTC: true,
          uastcLDRQualityLevel: 2,
          generateMipmap: true,
          needSupercompression: true,
          isPerceptual: true,
          isSetKTX2SRGBTransferFunc: true,
        }),
        ktx2Serial({
          slots: /^(normalTexture|clearcoatNormalTexture)$/,
          imageDecoder: decodeImage,
          isUASTC: true,
          uastcLDRQualityLevel: 2,
          generateMipmap: true,
          needSupercompression: true,
          isNormalMap: true,
          isPerceptual: false,
          isSetKTX2SRGBTransferFunc: false,
        }),
        ktx2Serial({
          slots: /^(occlusionTexture|metallicRoughnessTexture|roughnessTexture|metalnessTexture|clearcoatTexture|clearcoatRoughnessTexture|anisotropyTexture|transmissionTexture)$/,
          imageDecoder: decodeImage,
          isUASTC: true,
          uastcLDRQualityLevel: 2,
          generateMipmap: true,
          needSupercompression: true,
          isPerceptual: false,
          isSetKTX2SRGBTransferFunc: false,
        }),
      );
    }
    transforms.push(meshopt({
      encoder: MeshoptEncoder,
      ...RELEASE_MESHOPT_OPTIONS,
    }));

    await document.transform(...transforms);
    stampReleaseTextureCompression(document, sourceInspection);
    await mkdir(dirname(releaseAbs), { recursive: true });
    await writeDocumentAtomic(io, releaseAbs, document);

    // Compare the immutable source. Validation counts only slots on primitive-referenced materials,
    // so production pruning may remove unused materials without a lossy temporary source rewrite.
    const pair = inspectReleaseAssetPair(asset.source, outputReleasePath, { root: ROOT });
    if (!pair.ok) {
      throw new Error(`release asset failed SG-04 validation: ${outputReleasePath}\n${JSON.stringify(pair.issues, null, 2)}`);
    }

    const sourceBytes = readFileSync(sourceAbs);
    const releaseBytes = readFileSync(releaseAbs);
    appendManifestAsset(manifestAssets, asset, pair, sourceBytes, releaseBytes);
    console.log(`[sg04] ${index + 1}/${assets.length} ${asset.id}: ${sourceBytes.length} -> ${releaseBytes.length} bytes`);
  } catch (error) {
    console.error(`[sg04] failed ${index + 1}/${assets.length} ${asset.id}: ${asset.source} -> ${outputReleasePath}`);
    throw error;
  }
}

const devDeps = packageJson.devDependencies || {};
const releaseManifestPayload = `${JSON.stringify({
  schemaVersion: 1,
  releaseRoot: 'assets/ships/release',
  generatedBy: 'scripts/build-sg04-release-assets.mjs',
  contract: {
    textureContainer: 'KTX2/BasisU via KHR_texture_basisu',
    meshCompression: 'EXT_meshopt_compression',
    semanticParity: 'SOCKET_*, HOOK_*, MOUNT_*, and LOD* node names preserved',
  },
  toolchain: {
    '@gltf-transform/core': devDeps['@gltf-transform/core'],
    '@gltf-transform/extensions': devDeps['@gltf-transform/extensions'],
    '@gltf-transform/functions': devDeps['@gltf-transform/functions'],
    'ktx2-encoder': devDeps['ktx2-encoder'],
    meshoptimizer: devDeps.meshoptimizer,
    pngjs: devDeps.pngjs,
  },
  textureProfiles: {
    baseColorTexture: 'UASTC KTX2, mipmapped, zstd supercompressed, sRGB transfer',
    normalTexture: 'UASTC KTX2, mipmapped, zstd supercompressed, normal-map mode, linear',
    materialTextures: 'UASTC KTX2, mipmapped, zstd supercompressed, linear ORM/material data',
  },
  assets: manifestAssets,
}, null, 2)}\n`;
await writeFileAtomic(BUILD_RELEASE_MANIFEST, releaseManifestPayload);

if (!DIRECT_LIVE_BUILD) {
  await publishStagedRelease();
}

console.log(`[sg04] release manifest wrote ${relativeToRoot(RELEASE_MANIFEST)} (${manifestAssets.length} assets)`);
process.exit(0);

function readOnlyIds(args) {
  const ids = new Set();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--only' && args[index + 1]) {
      for (const id of args[++index].split(',')) if (id.trim()) ids.add(id.trim());
    } else if (arg.startsWith('--only=')) {
      for (const id of arg.slice('--only='.length).split(',')) if (id.trim()) ids.add(id.trim());
    }
  }
  return ids;
}

function appendManifestAsset(manifest, asset, pair, sourceBytes, releaseBytes) {
  manifest.push({
    id: asset.id,
    kind: asset.kind,
    source: asset.source,
    release: asset.release,
    sourceSha256: sha256(sourceBytes),
    releaseSha256: sha256(releaseBytes),
    sourceBytes: sourceBytes.length,
    releaseBytes: releaseBytes.length,
    textures: pair.release.metrics.textureCount,
    ktx2Textures: pair.release.metrics.ktx2TextureCount,
    meshoptBufferViews: pair.release.metrics.meshoptBufferViewCount,
    contractNodeCount: pair.release.metrics.contractNodeNames.length,
  });
}

function stampReleaseTextureCompression(document, sourceInspection) {
  const textureCount = sourceInspection && sourceInspection.metrics
    ? Number(sourceInspection.metrics.textureCount) || 0
    : 0;
  if (textureCount <= 0) return;
  const root = document.getRoot();
  const asset = root.getAsset();
  const assetContractVersion = Number(asset.extras?.spacefaceAsset?.contractVersion) || 1;
  const compression = assetContractVersion >= 2 ? 'KTX2/BasisU+mips' : 'KTX2/BasisU';
  if (asset.extras && asset.extras.spacefaceAsset) {
    asset.extras = {
      ...asset.extras,
      spacefaceAsset: {
        ...asset.extras.spacefaceAsset,
        textureCompression: compression,
      },
    };
  }
  for (const scene of root.listScenes()) {
    const extras = scene.getExtras() || {};
    if (!extras.spacefaceAsset) continue;
    scene.setExtras({
      ...extras,
      spacefaceAsset: {
        ...extras.spacefaceAsset,
        textureCompression: compression,
      },
    });
  }
}

function inspectExistingReleasePair(asset, outputReleasePath) {
  if (!existsSync(resolve(ROOT, outputReleasePath))) return null;
  const pair = inspectReleaseAssetPair(asset.source, outputReleasePath, { root: ROOT });
  return pair.ok ? pair : null;
}

function buildReleasePath(releasePath) {
  const rel = releasePath.replace(/\\/g, '/');
  if (DIRECT_LIVE_BUILD) return rel;
  return rel.replace(/^assets\/ships\/release\//, 'assets/ships/release.__building/');
}

function acquireReleaseBuildLock() {
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  for (;;) {
    try {
      mkdirSync(RELEASE_BUILD_LOCK);
      writeFileSync(resolve(RELEASE_BUILD_LOCK, 'owner.json'), `${JSON.stringify({
        token,
        pid: process.pid,
        argv: process.argv.slice(2),
        cwd: process.cwd(),
        startedAt: new Date().toISOString(),
      }, null, 2)}\n`);
      console.log(`[sg04] acquired release build lock: ${relativeToRoot(RELEASE_BUILD_LOCK)}`);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const owner = readReleaseBuildLockInfo();
        if (owner && owner.token && owner.token !== token) return;
        try { rmSync(RELEASE_BUILD_LOCK, { recursive: true, force: true }); } catch (_) {}
      };
    } catch (error) {
      if (error && error.code === 'EEXIST') {
        const owner = readReleaseBuildLockInfo();
        if (owner && Number.isInteger(owner.pid) && owner.pid > 0 && !isProcessRunning(owner.pid)) {
          console.warn(`[sg04] removing stale release build lock from pid ${owner.pid}`);
          rmSync(RELEASE_BUILD_LOCK, { recursive: true, force: true });
          continue;
        }
        throw new Error(`another SG-04 release asset build is already running (${relativeToRoot(RELEASE_BUILD_LOCK)}); owner=${JSON.stringify(owner || null)}`);
      }
      throw error;
    }
  }
}

function readReleaseBuildLockInfo() {
  try {
    return JSON.parse(readFileSync(resolve(RELEASE_BUILD_LOCK, 'owner.json'), 'utf8'));
  } catch (_) {
    return null;
  }
}

function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === 'EPERM';
  }
}

async function publishStagedRelease() {
  // Whole-ship bodies are now first-class manifest assets (built with meshopt into the staged tree by
  // the main loop), so the previous uncompressed preserve-copy is gone: copying the raw source over
  // the compressed staged output would defeat the release compression + node-parity validation.
  await rm(PREVIOUS_RELEASE_ROOT, { recursive: true, force: true });
  let movedLiveRelease = false;
  try {
    if (existsSync(RELEASE_ROOT)) {
      await rename(RELEASE_ROOT, PREVIOUS_RELEASE_ROOT);
      movedLiveRelease = true;
    }
    await rename(STAGED_RELEASE_ROOT, RELEASE_ROOT);
    await rm(PREVIOUS_RELEASE_ROOT, { recursive: true, force: true });
  } catch (error) {
    if (movedLiveRelease && !existsSync(RELEASE_ROOT) && existsSync(PREVIOUS_RELEASE_ROOT)) {
      try {
        await rename(PREVIOUS_RELEASE_ROOT, RELEASE_ROOT);
      } catch (restoreError) {
        console.error(`[sg04] failed to restore previous release assets: ${errorMessage(restoreError)}`);
      }
    }
    throw error;
  }
}

function assertUnderAssetShips(label, path) {
  const assetRoot = resolve(ROOT, 'assets/ships');
  const target = resolve(path);
  if (target !== assetRoot && !target.startsWith(`${assetRoot}\\`) && !target.startsWith(`${assetRoot}/`)) {
    throw new Error(`refusing to write ${label} outside assets/ships: ${path}`);
  }
}

function errorMessage(error) {
  return error && error.stack ? error.stack : String(error);
}

function splitIncompatibleTextureSlots(document) {
  const root = document.getRoot();
  for (const material of root.listMaterials()) {
    const baseTexture = material.getBaseColorTexture();
    const normalTexture = material.getNormalTexture();
    if (!baseTexture || !normalTexture || baseTexture !== normalTexture) continue;
    const image = normalTexture.getImage();
    if (!image) continue;
    const clone = document.createTexture(normalTexture.getName()
      ? `${normalTexture.getName()}_normal_slot`
      : 'normal_slot_clone')
      .setImage(image)
      .setMimeType(normalTexture.getMimeType());
    material.setNormalTexture(clone);
  }
}

async function writeDocumentAtomic(ioInstance, target, document) {
  const temp = `${target}.sg04-${process.pid}-${Date.now()}.tmp.glb`;
  try {
    await ioInstance.write(temp, document);
    await replaceFileWithRetry(temp, target);
  } finally {
    await rm(temp, { force: true }).catch(() => {});
  }
}

async function writeFileAtomic(target, contents) {
  const temp = `${target}.sg04-${process.pid}-${Date.now()}.tmp`;
  try {
    await writeFile(temp, contents);
    await replaceFileWithRetry(temp, target);
  } finally {
    await rm(temp, { force: true }).catch(() => {});
  }
}

async function replaceFileWithRetry(temp, target) {
  try {
    await rename(temp, target);
    return;
  } catch (error) {
    if (!isTransientWindowsReplaceError(error)) throw error;
  }
  let lastError = null;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await copyFile(temp, target);
      await rm(temp, { force: true });
      return;
    } catch (error) {
      if (!isTransientWindowsReplaceError(error)) throw error;
      lastError = error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 100));
    }
  }
  throw lastError || new Error(`unable to replace ${target}`);
}

function isTransientWindowsReplaceError(error) {
  return ['EPERM', 'EACCES', 'EBUSY', 'EEXIST', 'UNKNOWN'].includes(error?.code);
}

function decodePng(buffer) {
  const png = PNG.sync.read(Buffer.from(buffer));
  return {
    width: png.width,
    height: png.height,
    data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength),
  };
}

function decodeImage(buffer) {
  try {
    return decodePng(buffer);
  } catch {
    const decoded = JPEG.decode(Buffer.from(buffer), { useTArray: true });
    return {
      width: decoded.width,
      height: decoded.height,
      data: new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, decoded.data.byteLength),
    };
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function relativeToRoot(path) {
  return path.replace(ROOT, '').replace(/^[/\\]/, '').replace(/\\/g, '/');
}
