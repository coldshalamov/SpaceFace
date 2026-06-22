import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import { ASSET_RUNTIME_DECODER_CONTRACT } from '../render/assetLoader.js';

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a;

export const SG04_RELEASE_ASSET_CONTRACT = Object.freeze({
  schema: 'spaceface.sg04ReleaseAssetContract.v1',
  compressedTextureExtension: ASSET_RUNTIME_DECODER_CONTRACT.compressedTextureExtension,
  meshCompressionExtensions: ASSET_RUNTIME_DECODER_CONTRACT.meshCompressionExtensions,
  requiredRuntimeFiles: Object.freeze([
    ASSET_RUNTIME_DECODER_CONTRACT.gltfLoader,
    ASSET_RUNTIME_DECODER_CONTRACT.ktx2Loader,
    ASSET_RUNTIME_DECODER_CONTRACT.dracoLoader,
    ASSET_RUNTIME_DECODER_CONTRACT.meshoptDecoder,
    `${ASSET_RUNTIME_DECODER_CONTRACT.ktx2TranscoderPath}basis_transcoder.js`,
    `${ASSET_RUNTIME_DECODER_CONTRACT.ktx2TranscoderPath}basis_transcoder.wasm`,
    `${ASSET_RUNTIME_DECODER_CONTRACT.dracoDecoderPath}draco_decoder.js`,
    `${ASSET_RUNTIME_DECODER_CONTRACT.dracoDecoderPath}draco_decoder.wasm`,
    `${ASSET_RUNTIME_DECODER_CONTRACT.dracoDecoderPath}draco_wasm_wrapper.js`,
  ]),
  releaseRules: Object.freeze({
    everyTextureUsesKtx2: true,
    meshCompression: 'KHR_draco_mesh_compression or EXT/KHR_meshopt_compression',
    uncompressedDevAssetsMustFailRelease: true,
  }),
});

export function inspectRuntimeDecoderFiles(options = {}) {
  const root = resolve(options.root || process.cwd());
  const files = SG04_RELEASE_ASSET_CONTRACT.requiredRuntimeFiles.map((file) => {
    const rel = normalizeRel(file);
    const abs = resolve(root, rel);
    const ok = existsSync(abs);
    return {
      path: rel,
      ok,
      bytes: ok ? readFileSync(abs).length : 0,
    };
  });
  return {
    schema: 'spaceface.sg04RuntimeDecoderFiles.v1',
    ok: files.every((file) => file.ok && file.bytes > 0),
    files,
  };
}

export function inspectGlbReleaseCompression(assetPath, options = {}) {
  const root = resolve(options.root || process.cwd());
  const relAsset = normalizeRel(assetPath);
  const absAsset = resolve(root, relAsset);
  const checks = [];
  const issues = [];
  let gltf = null;
  let bytes = null;

  record(checks, issues, 'asset.exists', existsSync(absAsset), relAsset, 'asset file exists');
  if (existsSync(absAsset)) {
    try {
      bytes = readFileSync(absAsset);
      gltf = parseGlb(bytes);
      record(checks, issues, 'glb.parse', true, relAsset, 'glb transport parses');
    } catch (error) {
      record(checks, issues, 'glb.parse', false, relAsset, 'glb transport parses', errorMessage(error));
    }
  }

  const metrics = gltf ? releaseMetrics(gltf, bytes.length) : emptyMetrics(bytes ? bytes.length : 0);
  const releaseIssues = releaseCompressionIssues(metrics);
  const requireRelease = options.releaseMode === true;
  if (requireRelease) {
    for (const issue of releaseIssues) {
      record(checks, issues, issue.rule, false, relAsset, issue.message, issue.detail);
    }
  } else {
    for (const issue of releaseIssues) {
      checks.push({ rule: issue.rule, ok: false, path: relAsset, message: issue.message, detail: issue.detail });
    }
  }

  return {
    schema: 'spaceface.sg04AssetCompressionInspection.v1',
    assetPath: relAsset,
    ok: issues.length === 0,
    releaseReady: !!gltf && releaseIssues.length === 0,
    releaseIssues,
    issueCount: issues.length,
    issues,
    checks,
    metrics,
  };
}

export function inspectReleaseAssetPair(sourcePath, releasePath, options = {}) {
  const root = resolve(options.root || process.cwd());
  const source = inspectGlbReleaseCompression(sourcePath, { root, releaseMode: false });
  const release = inspectGlbReleaseCompression(releasePath, { root, releaseMode: true });
  const issues = [];

  if (!source.ok) {
    issues.push({
      rule: 'release.sourceAsset',
      path: normalizeRel(sourcePath),
      message: 'source asset must parse before release comparison',
      detail: source.issues.map((issue) => issue.rule).join(','),
    });
  }
  if (!release.ok || !release.releaseReady) {
    issues.push({
      rule: 'release.compressedAsset',
      path: normalizeRel(releasePath),
      message: 'release asset must parse and satisfy compression contract',
      detail: release.releaseIssues.map((issue) => issue.rule).join(','),
    });
  }

  const sourceNodes = new Set(source.metrics.contractNodeNames || []);
  const releaseNodes = new Set(release.metrics.contractNodeNames || []);
  const missingNodes = [...sourceNodes].filter((name) => !releaseNodes.has(name));
  if (missingNodes.length) {
    issues.push({
      rule: 'release.contractNodes',
      path: normalizeRel(releasePath),
      message: 'release compression must preserve gameplay contract nodes',
      detail: missingNodes.join(','),
    });
  }

  if (source.metrics.primitiveCount !== release.metrics.primitiveCount) {
    issues.push({
      rule: 'release.primitiveTopology',
      path: normalizeRel(releasePath),
      message: 'release compression must preserve primitive count',
      detail: `${source.metrics.primitiveCount} -> ${release.metrics.primitiveCount}`,
    });
  }

  if (source.metrics.textureCount !== release.metrics.textureCount) {
    issues.push({
      rule: 'release.textureTopology',
      path: normalizeRel(releasePath),
      message: 'release compression must preserve texture slot count',
      detail: `${source.metrics.textureCount} -> ${release.metrics.textureCount}`,
    });
  }

  return {
    schema: 'spaceface.sg04ReleaseAssetPair.v1',
    sourcePath: normalizeRel(sourcePath),
    releasePath: normalizeRel(releasePath),
    ok: source.ok && release.ok && release.releaseReady && issues.length === 0,
    source,
    release,
    issues,
  };
}

export function validateReleaseAssetPairs(assetPairs, options = {}) {
  const root = resolve(options.root || process.cwd());
  const runtime = inspectRuntimeDecoderFiles({ root });
  const pairs = (assetPairs || []).map((pair) =>
    inspectReleaseAssetPair(pair.source || pair.sourcePath, pair.release || pair.releasePath, { root }));
  const issues = [];
  if (!runtime.ok) {
    issues.push({
      rule: 'runtime.decoders',
      message: 'release decoder runtime files must be vendored',
      detail: runtime.files.filter((file) => !file.ok || file.bytes <= 0).map((file) => file.path).join(','),
    });
  }
  for (const pair of pairs) {
    if (!pair.ok) {
      issues.push({
        rule: 'asset.releasePair',
        path: pair.releasePath,
        message: 'release asset pair must preserve contracts and pass compression',
        detail: pair.issues.map((issue) => issue.rule).join(','),
      });
    }
  }
  return {
    schema: 'spaceface.sg04ReleaseAssetPairs.v1',
    ok: runtime.ok && pairs.length > 0 && pairs.every((pair) => pair.ok) && issues.length === 0,
    runtime,
    pairs,
    issues,
  };
}

export function validateReleaseAssetSet(assetPaths, options = {}) {
  const root = resolve(options.root || process.cwd());
  const releaseMode = options.releaseMode === true;
  const runtime = inspectRuntimeDecoderFiles({ root });
  const assets = (assetPaths || []).map((assetPath) =>
    inspectGlbReleaseCompression(assetPath, { root, releaseMode }));
  const issues = [];
  if (!runtime.ok) {
    issues.push({
      rule: 'runtime.decoders',
      message: 'release decoder runtime files must be vendored',
      detail: runtime.files.filter((file) => !file.ok || file.bytes <= 0).map((file) => file.path).join(','),
    });
  }
  if (releaseMode) {
    for (const asset of assets) {
      if (!asset.releaseReady) {
        issues.push({
          rule: 'asset.releaseCompression',
          path: asset.assetPath,
          message: 'release assets must use KTX2 textures and mesh compression',
          detail: asset.releaseIssues.map((issue) => issue.rule).join(','),
        });
      }
    }
  }
  const assetsOk = assets.every((asset) => asset.ok);
  return {
    schema: 'spaceface.sg04ReleaseAssetSet.v1',
    releaseMode,
    ok: runtime.ok && assetsOk && issues.length === 0,
    releaseReady: runtime.ok && assets.length > 0 && assets.every((asset) => asset.releaseReady),
    runtime,
    assets,
    issues,
  };
}

function parseGlb(bytes) {
  if (bytes.length < 20) throw new Error('file too small to be a GLB');
  if (bytes.readUInt32LE(0) !== GLB_MAGIC) throw new Error('bad GLB magic');
  if (bytes.readUInt32LE(4) !== GLB_VERSION) throw new Error('unsupported glTF version');
  if (bytes.readUInt32LE(8) !== bytes.length) throw new Error('GLB header length does not match file size');

  let off = 12;
  while (off < bytes.length) {
    if (off + 8 > bytes.length) throw new Error('truncated GLB chunk header');
    const chunkLength = bytes.readUInt32LE(off);
    const chunkType = bytes.readUInt32LE(off + 4);
    const start = off + 8;
    const end = start + chunkLength;
    if (end > bytes.length) throw new Error('GLB chunk overruns file');
    if (chunkType === CHUNK_JSON) {
      return JSON.parse(bytes.subarray(start, end).toString('utf8').replace(/\0+$/, '').trim());
    }
    off = end;
  }
  throw new Error('missing JSON chunk');
}

function releaseMetrics(gltf, bytes) {
  const extensionsUsed = new Set(gltf.extensionsUsed || []);
  const extensionsRequired = new Set(gltf.extensionsRequired || []);
  const textures = gltf.textures || [];
  const textureCount = textures.length;
  const ktx2TextureCount = textures.filter((texture) =>
    !!(texture.extensions && texture.extensions.KHR_texture_basisu)).length;
  const imageMimeTypes = new Set((gltf.images || []).map((image) => image && image.mimeType).filter(Boolean));
  let primitiveCount = 0;
  let dracoPrimitiveCount = 0;
  for (const mesh of gltf.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      primitiveCount++;
      if (primitive.extensions && primitive.extensions.KHR_draco_mesh_compression) dracoPrimitiveCount++;
    }
  }
  let meshoptBufferViewCount = 0;
  for (const view of gltf.bufferViews || []) {
    if (view.extensions && (view.extensions.EXT_meshopt_compression || view.extensions.KHR_meshopt_compression)) {
      meshoptBufferViewCount++;
    }
  }
  const meshCompressionExtensions = [...SG04_RELEASE_ASSET_CONTRACT.meshCompressionExtensions];
  const declaredMeshCompression = meshCompressionExtensions.some((name) =>
    extensionsUsed.has(name) || extensionsRequired.has(name));
  return {
    bytes,
    textureCount,
    ktx2TextureCount,
    imageMimeTypes: [...imageMimeTypes].sort(),
    primitiveCount,
    dracoPrimitiveCount,
    meshoptBufferViewCount,
    extensionsUsed: [...extensionsUsed].sort(),
    extensionsRequired: [...extensionsRequired].sort(),
    nodeNames: (gltf.nodes || []).map((node) => node.name).filter(Boolean).sort(),
    contractNodeNames: (gltf.nodes || [])
      .map((node) => node.name)
      .filter((name) => /^(SOCKET|HOOK|MOUNT|LOD[0-2])/i.test(String(name || '')))
      .sort(),
    hasKtx2Textures: textureCount === 0 || ktx2TextureCount === textureCount,
    hasMeshCompression: primitiveCount > 0 && (
      dracoPrimitiveCount > 0 || meshoptBufferViewCount > 0 || declaredMeshCompression
    ),
  };
}

function releaseCompressionIssues(metrics) {
  const issues = [];
  if (!metrics.hasKtx2Textures) {
    issues.push({
      rule: 'release.textures.ktx2',
      message: 'every release texture must use KHR_texture_basisu',
      detail: `${metrics.ktx2TextureCount}/${metrics.textureCount} textures use KTX2`,
    });
  }
  if (!metrics.hasMeshCompression) {
    issues.push({
      rule: 'release.mesh.compression',
      message: 'release geometry must use Draco or Meshopt compression',
      detail: `primitives=${metrics.primitiveCount} draco=${metrics.dracoPrimitiveCount} meshoptViews=${metrics.meshoptBufferViewCount}`,
    });
  }
  return issues;
}

function emptyMetrics(bytes) {
  return {
    bytes,
    textureCount: 0,
    ktx2TextureCount: 0,
    imageMimeTypes: [],
    primitiveCount: 0,
    dracoPrimitiveCount: 0,
    meshoptBufferViewCount: 0,
    extensionsUsed: [],
    extensionsRequired: [],
    hasKtx2Textures: false,
    hasMeshCompression: false,
  };
}

function record(checks, issues, rule, ok, path, message, detail = '') {
  const check = { rule, ok: !!ok, path, message };
  if (detail) check.detail = String(detail);
  checks.push(check);
  if (!ok) issues.push({ rule, path, message, detail: detail ? String(detail) : undefined });
}

function normalizeRel(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}

export function relativeAssetPath(root, absPath) {
  return relative(resolve(root || process.cwd()), resolve(absPath)).replace(/\\/g, '/');
}
