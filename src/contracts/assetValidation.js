import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

const DEFAULT_MAX_GLB_BYTES = 1_000_000;
const DEFAULT_MAX_TRIANGLES = 25_000;

const KESTREL_REQUIRED_SOCKETS = Object.freeze([
  'SOCKET_Weapon_Front',
  'SOCKET_Mining_Front',
  'SOCKET_Engine_Main',
  'SOCKET_Utility_Dorsal',
  'SOCKET_Cargo_Ventral',
  'SOCKET_Trail_Main',
  'SOCKET_Camera_Focus',
]);

export function validateShipAsset(assetPath, options = {}) {
  const root = resolve(options.root || process.cwd());
  const relAsset = normalizeRel(assetPath || 'assets/ships/kestrel/kestrel_reference.glb');
  const absAsset = resolve(root, relAsset);
  const checks = [];
  const issues = [];

  const manifestPath = findManifestPath(root, relAsset);
  let manifest = null;
  let bytes = null;
  let gltf = null;

  record(checks, issues, 'asset.exists', existsSync(absAsset), relAsset, 'asset file exists');

  if (manifestPath) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      record(checks, issues, 'manifest.read', true, toRel(root, manifestPath), 'manifest parses');
    } catch (error) {
      record(checks, issues, 'manifest.read', false, toRel(root, manifestPath), 'manifest parses', errorMessage(error));
    }
  } else {
    record(checks, issues, 'manifest.read', false, dirname(relAsset), 'manifest parses', 'no sibling *_manifest.json found');
  }

  if (existsSync(absAsset)) {
    try {
      bytes = readFileSync(absAsset);
      const parsed = parseGlb(bytes);
      gltf = parsed.gltf;
      record(checks, issues, 'glb.parse', true, relAsset, 'glb transport parses');
    } catch (error) {
      record(checks, issues, 'glb.parse', false, relAsset, 'glb transport parses', errorMessage(error));
    }
  }

  if (bytes) {
    record(checks, issues, 'glb.magicVersion', readU32(bytes, 0) === GLB_MAGIC && readU32(bytes, 4) === GLB_VERSION,
      relAsset, 'glb magic/version match glTF 2.0');
    record(checks, issues, 'glb.length', readU32(bytes, 8) === bytes.length,
      relAsset, 'glb header length matches file size', `header=${readU32(bytes, 8)} file=${bytes.length}`);
  }

  const metrics = gltf ? collectMetrics(gltf, bytes ? bytes.length : 0) : emptyMetrics(bytes ? bytes.length : 0);

  if (manifest && gltf) {
    const m = manifest.metrics || {};
    record(checks, issues, 'manifest.metrics', !!m.geometry && !!m.glb, relAsset, 'manifest declares geometry and glb metrics');
    record(checks, issues, 'metrics.triangles.glb', metrics.triangles === m.glb?.triangles,
      relAsset, 'glb triangle count matches manifest', `glb=${metrics.triangles} manifest=${m.glb?.triangles}`);
    record(checks, issues, 'metrics.meshes.glb', metrics.meshes === m.glb?.meshes,
      relAsset, 'glb mesh count matches manifest', `glb=${metrics.meshes} manifest=${m.glb?.meshes}`);
    record(checks, issues, 'metrics.nodes.glb', metrics.nodes === m.glb?.nodes,
      relAsset, 'glb node count matches manifest', `glb=${metrics.nodes} manifest=${m.glb?.nodes}`);
    record(checks, issues, 'metrics.triangles.geometry', metrics.triangles === m.geometry?.triangleCount,
      relAsset, 'geometry triangle count matches manifest', `glb=${metrics.triangles} manifest=${m.geometry?.triangleCount}`);
    record(checks, issues, 'metrics.meshes.geometry', metrics.meshes === m.geometry?.meshCount,
      relAsset, 'geometry mesh count matches manifest', `glb=${metrics.meshes} manifest=${m.geometry?.meshCount}`);

    const maxBytes = Number(options.maxBytes) || DEFAULT_MAX_GLB_BYTES;
    const maxTriangles = Number(options.maxTriangles) || DEFAULT_MAX_TRIANGLES;
    record(checks, issues, 'budget.triangles', metrics.triangles <= maxTriangles,
      relAsset, 'triangle budget', `${metrics.triangles} <= ${maxTriangles}`);
    record(checks, issues, 'budget.bytes', metrics.bytes <= maxBytes,
      relAsset, 'glb byte budget', `${metrics.bytes} <= ${maxBytes}`);

    validateBounds(checks, issues, relAsset, gltf, m.geometry);
    validateMaterials(checks, issues, relAsset, manifest);
    validateSockets(checks, issues, relAsset, gltf, manifest);
    validateManifestContract(checks, issues, relAsset, manifest);
  }

  const ok = issues.length === 0;
  return {
    schema: 'spaceface.assetValidationResult.v1',
    ok,
    assetPath: relAsset,
    manifestPath: manifestPath ? toRel(root, manifestPath) : null,
    assetId: manifest && manifest.assetId || null,
    displayName: manifest && manifest.displayName || null,
    issueCount: issues.length,
    issues,
    checks,
    metrics,
  };
}

function validateBounds(checks, issues, relAsset, gltf, geometry = {}) {
  const expectedMin = geometry && geometry.boundsMin;
  const expectedMax = geometry && geometry.boundsMax;
  if (!expectedMin || !expectedMax) {
    record(checks, issues, 'bounds.manifest', false, relAsset, 'manifest declares geometry bounds');
    return;
  }
  const actual = collectAccessorBounds(gltf);
  record(checks, issues, 'bounds.min', Number.isFinite(actual.min[0]) && sameVec(actual.min, expectedMin),
    relAsset, 'glb min bounds match manifest', `glb=${actual.min} manifest=${expectedMin}`);
  record(checks, issues, 'bounds.max', Number.isFinite(actual.max[0]) && sameVec(actual.max, expectedMax),
    relAsset, 'glb max bounds match manifest', `glb=${actual.max} manifest=${expectedMax}`);
}

function validateMaterials(checks, issues, relAsset, manifest) {
  const materials = manifest.materials || [];
  record(checks, issues, 'materials.roles', materials.length >= 8, relAsset, 'manifest declares at least 8 material roles', `count=${materials.length}`);
  for (const material of materials) {
    const path = `${relAsset}#material:${material.name || 'unnamed'}`;
    record(checks, issues, 'materials.metallic', inRange(material.metallic, 0, 1), path, 'metallic factor in [0,1]', `metallic=${material.metallic}`);
    record(checks, issues, 'materials.roughness', inRange(material.roughness, 0, 1), path, 'roughness factor in [0,1]', `roughness=${material.roughness}`);
    const alpha = material.alpha == null ? 1 : material.alpha;
    record(checks, issues, 'materials.alpha', alpha > 0 && alpha <= 1, path, 'alpha factor in (0,1]', `alpha=${alpha}`);
  }
}

function validateSockets(checks, issues, relAsset, gltf, manifest) {
  const declared = new Set((manifest.sockets || []).map((socket) => socket && socket.name).filter(Boolean));
  const required = new Set(isKestrelAsset(relAsset, manifest) ? KESTREL_REQUIRED_SOCKETS : declared);
  const nodeNames = collectNodeNames(gltf);
  const gltfSockets = new Set([...nodeNames].filter((name) => name.startsWith('SOCKET_')));

  record(checks, issues, 'sockets.manifestRequired', required.size > 0 && [...required].every((name) => declared.has(name)),
    relAsset, 'manifest declares all required sockets', `required=${[...required].join(',')}`);
  record(checks, issues, 'sockets.glbRequired', required.size > 0 && [...required].every((name) => gltfSockets.has(name)),
    relAsset, 'glb carries all required socket nodes', `glb=${[...gltfSockets].join(',')}`);
}

function validateManifestContract(checks, issues, relAsset, manifest) {
  const fileName = basename(relAsset);
  record(checks, issues, 'manifest.referenceModel', manifest.files && manifest.files.referenceModel === fileName,
    relAsset, 'manifest reference model matches asset path', `manifest=${manifest.files && manifest.files.referenceModel}`);
  record(checks, issues, 'manifest.runtimeSource', typeof manifest.runtimeSource === 'string' && manifest.runtimeSource.length > 0,
    relAsset, 'manifest declares runtime source');
  if (isKestrelAsset(relAsset, manifest)) {
    record(checks, issues, 'manifest.kestrelRuntimeSource', manifest.runtimeSource === 'src/render/ships/kestrelHero.js',
      relAsset, 'Kestrel runtime source points at kestrelHero.js', `runtimeSource=${manifest.runtimeSource}`);
  }
  record(checks, issues, 'manifest.coordinates', manifest.coordinateSystem?.forward === '+X' &&
    manifest.coordinateSystem?.up === '+Y' && manifest.coordinateSystem?.unit === 'metre',
    relAsset, 'coordinate contract is +X forward, +Y up, metres');
  record(checks, issues, 'manifest.provenance', !!manifest.authoring && Array.isArray(manifest.authoring.thirdPartyDependencies),
    relAsset, 'authoring provenance declares thirdPartyDependencies');
}

function parseGlb(bytes) {
  if (bytes.length < 20) throw new Error('file too small to be a glb');
  const magic = readU32(bytes, 0);
  const version = readU32(bytes, 4);
  const length = readU32(bytes, 8);
  if (magic !== GLB_MAGIC) throw new Error(`bad magic 0x${magic.toString(16)}`);
  if (version !== GLB_VERSION) throw new Error(`unsupported glTF version ${version}`);
  if (length !== bytes.length) throw new Error(`header length ${length} != file size ${bytes.length}`);

  let off = 12;
  const chunks = [];
  while (off < bytes.length) {
    if (off + 8 > bytes.length) throw new Error('truncated chunk header');
    const chunkLength = readU32(bytes, off);
    const chunkType = readU32(bytes, off + 4);
    const end = off + 8 + chunkLength;
    if (end > bytes.length) throw new Error('chunk length exceeds file size');
    chunks.push({ type: chunkType, data: bytes.subarray(off + 8, end) });
    off = end;
  }
  const jsonChunk = chunks.find((chunk) => chunk.type === CHUNK_JSON);
  if (!jsonChunk) throw new Error('missing JSON chunk');
  const jsonText = Buffer.from(jsonChunk.data).toString('utf8').replace(/\0+$/, '').replace(/\s+$/, '');
  const gltf = JSON.parse(jsonText);
  const binaryChunk = chunks.find((chunk) => chunk.type === CHUNK_BIN);
  return { gltf, binary: binaryChunk ? binaryChunk.data : null };
}

function collectMetrics(gltf, bytes) {
  let triangles = 0;
  for (const mesh of gltf.meshes || []) {
    for (const prim of mesh.primitives || []) {
      if ((prim.mode ?? 4) !== 4) continue;
      const idxAcc = gltf.accessors?.[prim.indices];
      if (idxAcc) triangles += Math.floor((idxAcc.count || 0) / 3);
    }
  }
  return {
    triangles,
    meshes: (gltf.meshes || []).length,
    nodes: (gltf.nodes || []).length,
    materials: (gltf.materials || []).length,
    bytes,
  };
}

function emptyMetrics(bytes) {
  return { triangles: 0, meshes: 0, nodes: 0, materials: 0, bytes };
}

function collectNodeNames(gltf) {
  const names = new Set();
  const visit = (idx) => {
    const node = gltf.nodes && gltf.nodes[idx];
    if (!node) return;
    if (node.name) names.add(node.name);
    for (const child of node.children || []) visit(child);
  };
  for (const root of gltf.scenes?.[0]?.nodes || []) visit(root);
  return names;
}

function collectAccessorBounds(gltf) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const acc of gltf.accessors || []) {
    if (acc.type !== 'VEC3' || (acc.componentType ?? 5126) !== 5126) continue;
    if (!acc.min || !acc.max) continue;
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], acc.min[i]);
      max[i] = Math.max(max[i], acc.max[i]);
    }
  }
  return { min, max };
}

function findManifestPath(root, relAsset) {
  const absDir = dirname(resolve(root, relAsset));
  const preferred = resolve(absDir, `${basename(absDir)}_manifest.json`);
  if (existsSync(preferred)) return preferred;
  try {
    const found = readdirSync(absDir)
      .filter((entry) => entry.endsWith('_manifest.json'))
      .sort()[0];
    return found ? resolve(absDir, found) : null;
  } catch (_error) {
    return null;
  }
}

function record(checks, issues, rule, ok, path, message, detail = '') {
  const check = { rule, ok: !!ok, path, message };
  if (detail) check.detail = String(detail);
  checks.push(check);
  if (!ok) issues.push({ rule, path, message, detail: detail ? String(detail) : undefined });
}

function readU32(buf, off) {
  return buf.length >= off + 4 ? buf.readUInt32LE(off) : 0;
}

function sameVec(actual, expected) {
  return actual.every((value, i) => Math.abs(round4(value) - round4(expected[i])) < 1e-3);
}

function round4(value) {
  return Math.round(value * 1e4) / 1e4;
}

function inRange(value, lo, hi) {
  return Number.isFinite(value) && value >= lo && value <= hi;
}

function isKestrelAsset(relAsset, manifest) {
  return relAsset.replace(/\\/g, '/').includes('/kestrel/') || (manifest && String(manifest.assetId || '').includes('KESTREL'));
}

function normalizeRel(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function toRel(root, absPath) {
  return relative(root, absPath).replace(/\\/g, '/');
}

function errorMessage(error) {
  return error && error.message ? error.message : String(error);
}
