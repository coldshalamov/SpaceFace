import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { PNG } from 'pngjs';

import {
  inspectGlbReleaseCompression,
  inspectReleaseAssetPair,
} from '../src/contracts/assetReleaseValidation.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PART_MANIFEST = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const RELEASE_ROOT = resolve(ROOT, 'assets/ships/release');
const RELEASE_MANIFEST = resolve(RELEASE_ROOT, 'release_manifest.json');
const STAGED_RELEASE_ROOT = resolve(ROOT, 'assets/ships/release.__building');
const PREVIOUS_RELEASE_ROOT = resolve(ROOT, 'assets/ships/release.__previous');
const RELEASE_BUILD_LOCK = resolve(ROOT, 'assets/ships/release.__lock');
const argv = new Set(process.argv.slice(2));
const DIRECT_LIVE_BUILD = argv.has('--no-clean');
const RESUME_VALID = argv.has('--resume-valid');
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
const assets = [
  {
    id: 'ship_kestrel_reference',
    kind: 'ship-reference',
    source: 'assets/ships/kestrel/kestrel_reference.glb',
    release: 'assets/ships/release/kestrel/kestrel_reference.glb',
  },
  ...(partManifest.parts || []).map((part) => ({
    id: part.id,
    kind: `part:${part.category}`,
    source: `assets/ships/parts/${part.file}`,
    release: `assets/ships/release/parts/${part.file}`,
  })),
];

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

const manifestAssets = [];
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
    const transforms = [];
    // Sources that already ship KTX2/BasisU textures (e.g. authored hull GLBs) are KTX2-native and
    // must skip the pngjs decode -> re-encode path: re-encoding would be lossy and pngjs can't read KTX2.
    // They only need meshopt geometry compression to satisfy the release contract.
    const sourceAlreadyKtx2 = sourceInspection.metrics.textureCount > 0
      && sourceInspection.metrics.ktx2TextureCount === sourceInspection.metrics.textureCount;
    if (sourceInspection.metrics.textureCount > 0 && !sourceAlreadyKtx2) {
      transforms.push(
        ktx2({
          slots: /^baseColorTexture$/,
          imageDecoder: decodePng,
          isUASTC: true,
          uastcLDRQualityLevel: 2,
          generateMipmap: true,
          needSupercompression: true,
          isPerceptual: true,
          isSetKTX2SRGBTransferFunc: true,
        }),
        ktx2({
          slots: /^normalTexture$/,
          imageDecoder: decodePng,
          isUASTC: true,
          uastcLDRQualityLevel: 2,
          generateMipmap: true,
          needSupercompression: true,
          isNormalMap: true,
          isPerceptual: false,
          isSetKTX2SRGBTransferFunc: false,
        }),
        ktx2({
          slots: /^(occlusionTexture|metallicRoughnessTexture|roughnessTexture|metalnessTexture)$/,
          imageDecoder: decodePng,
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
      level: 'high',
      quantizePosition: 14,
      quantizeNormal: 10,
      quantizeTexcoord: 12,
      quantizeColor: 8,
      quantizeWeight: 8,
      quantizeGeneric: 12,
    }));

    await document.transform(...transforms);
    await mkdir(dirname(releaseAbs), { recursive: true });
    await io.write(releaseAbs, document);

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
await writeFile(BUILD_RELEASE_MANIFEST, `${JSON.stringify({
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
}, null, 2)}\n`);

if (!DIRECT_LIVE_BUILD) {
  await publishStagedRelease();
}

console.log(`[sg04] release manifest wrote ${relativeToRoot(RELEASE_MANIFEST)} (${manifestAssets.length} assets)`);
process.exit(0);

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
  // Authored whole-ship bodies (assets/ships/parts/wholeships/) are not in parts_manifest.json, so the
  // manifest-driven staged build doesn't contain them. Copy them into the staged tree before the atomic
  // swap or the swap would wipe them from release/ and ships would fall back to the parts-assembly.
  try {
    const wsSrc = resolve(ROOT, 'assets/ships/parts/wholeships');
    if (existsSync(wsSrc)) {
      const wsDst = resolve(STAGED_RELEASE_ROOT, 'parts/wholeships');
      mkdirSync(wsDst, { recursive: true });
      cpSync(wsSrc, wsDst, { recursive: true });
      console.log('[sg04] preserved whole-ship bodies into staged release');
    }
  } catch (error) { console.error(`[sg04] whole-ship preserve failed: ${errorMessage(error)}`); }
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

function decodePng(buffer) {
  const png = PNG.sync.read(Buffer.from(buffer));
  return {
    width: png.width,
    height: png.height,
    data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength),
  };
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function relativeToRoot(path) {
  return path.replace(ROOT, '').replace(/^[/\\]/, '').replace(/\\/g, '/');
}
