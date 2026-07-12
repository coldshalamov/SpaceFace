#!/usr/bin/env node
/**
 * Finalize M4 Helios Hub Environment visual family candidates:
 *  1) Meshopt + KTX2/BasisU (SG04 pattern)
 *  2) Contract validation (sockets, collision, materials)
 *  3) Optional promote into assets/ships/parts/places + incremental release rebuild
 *  4) Playwright + Three.js evidence captures
 *
 * Usage:
 *   node tools/art/finalize_m4_helios_hub_candidate.mjs
 *   node tools/art/finalize_m4_helios_hub_candidate.mjs --skip-three
 *   node tools/art/finalize_m4_helios_hub_candidate.mjs --promote
 *   node tools/art/finalize_m4_helios_hub_candidate.mjs --only hub_station,gate
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import JPEG from 'jpeg-js';
import { PNG } from 'pngjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FAMILY = resolve(ROOT, 'assets/ships/m4_helios_hub');
const PACKET = 'M4-HELIOS-HUB-ENV-VISUAL-FAMILY-001';
const PARTS_PLACES = resolve(ROOT, 'assets/ships/parts/places');
const PART_MANIFEST = resolve(ROOT, 'assets/ships/parts/parts_manifest.json');
const DEVSHOTS = resolve(ROOT, '.devshots/m4-helios-hub');
const EVIDENCE = resolve(FAMILY, 'evidence');
const RENDERS = resolve(EVIDENCE, 'renders');

const ASSETS = [
  { id: 'helios_hub_station', liveId: 'place_station_trade_hub', requireSockets: ['SOCKET_Structure_Core'] },
  { id: 'helios_gate', liveId: 'place_gate_jump_ring', requireSockets: ['SOCKET_Structure_Core'] },
  { id: 'helios_rock_a', liveId: 'place_asteroid_rock_a', requireSockets: ['SOCKET_Structure_Core'] },
  { id: 'helios_rock_b', liveId: 'place_asteroid_rock_b', requireSockets: ['SOCKET_Structure_Core'] },
  { id: 'helios_rock_c', liveId: 'place_asteroid_rock_c', requireSockets: ['SOCKET_Structure_Core'] },
  { id: 'helios_support_gantry', liveId: 'place_lane_beacon', requireSockets: ['SOCKET_Structure_Core'] },
  { id: 'helios_support_dock_arm', liveId: 'place_station_billboard', requireSockets: ['SOCKET_Structure_Core'] },
  { id: 'helios_nav_spire', liveId: 'place_nav_buoy', requireSockets: ['SOCKET_Structure_Core'] },
];

const SKIP_THREE = process.argv.includes('--skip-three');
const PROMOTE = process.argv.includes('--promote');
const ONLY = readOnly(process.argv.slice(2));

function readOnly(argv) {
  const idx = argv.indexOf('--only');
  if (idx >= 0 && argv[idx + 1]) {
    return new Set(argv[idx + 1].split(',').map((s) => s.trim()).filter(Boolean));
  }
  const eq = argv.find((a) => a.startsWith('--only='));
  if (eq) return new Set(eq.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean));
  return null;
}

function matchOnly(id) {
  if (!ONLY) return true;
  if (ONLY.has(id)) return true;
  const short = id.replace(/^helios_/, '');
  return ONLY.has(short) || ONLY.has(id.replace('helios_', ''));
}

function sha256(path) {
  const h = createHash('sha256');
  h.update(readFileSync(path));
  return h.digest('hex').toUpperCase();
}

function rel(abs) {
  return abs.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', '');
}

function sourcePath(id) {
  return resolve(FAMILY, 'source/places', `${id}.glb`);
}

function candidatePath(id) {
  return resolve(FAMILY, 'release_candidates/places', `${id}.glb`);
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

function markContractNodes(document, sourceCollisionBounds = null) {
  for (const node of document.getRoot().listNodes()) {
    const name = node.getName() || '';
    const extras = { ...(node.getExtras() || {}) };
    const sf = { ...(extras.spaceface || {}) };
    if (name.startsWith('SOCKET_')) {
      sf.socket = true;
      sf.keep = true;
      extras.socket = true;
      extras.spaceface = sf;
      node.setExtras(extras);
    }
    if (name === 'COLLISION_HULL' || sf.collision || extras.collision) {
      sf.collision = true;
      sf.helper = true;
      sf.nonRender = true;
      sf.role = 'collision';
      if (sourceCollisionBounds && !sf.bounds) sf.bounds = sourceCollisionBounds;
      extras.collision = true;
      extras.nonRender = true;
      extras.spaceface = sf;
      if (sourceCollisionBounds && !extras.bounds) extras.bounds = sourceCollisionBounds;
      node.setExtras(extras);
    }
  }
}

function countTextures(document) {
  return document.getRoot().listTextures().length;
}

function inspectGlbRaw(abs) {
  const buf = readFileSync(abs);
  if (buf.toString('utf8', 0, 4) !== 'glTF') throw new Error(`not GLB: ${abs}`);
  let off = 12;
  let json = null;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    off += 8;
    if (type === 0x4e4f534a) {
      json = JSON.parse(buf.subarray(off, off + len).toString('utf8').replace(/\0+$/, '').trim());
      break;
    }
    off += len;
  }
  if (!json) throw new Error(`no JSON chunk: ${abs}`);
  const images = json.images || [];
  const textures = json.textures || [];
  const bufferViews = json.bufferViews || [];
  let ktx2Count = 0;
  for (const img of images) {
    const mime = (img.mimeType || '').toLowerCase();
    if (mime.includes('ktx') || mime.includes('basis')) ktx2Count += 1;
  }
  const meshoptViews = bufferViews.filter(
    (bv) => bv.extensions && bv.extensions.EXT_meshopt_compression,
  ).length;
  const extensionsUsed = json.extensionsUsed || [];
  return {
    imageCount: images.length,
    textureCount: textures.length,
    ktx2ImageCount: ktx2Count,
    meshoptBufferViewCount: meshoptViews,
    extensionsUsed,
    hasMeshoptExt: extensionsUsed.includes('EXT_meshopt_compression'),
    hasBasisuExt: extensionsUsed.includes('KHR_texture_basisu'),
    nodeNames: (json.nodes || []).map((n) => n.name).filter(Boolean),
    materials: (json.materials || []).map((m) => m.name).filter(Boolean),
    spacefaceAsset: json.asset?.extras?.spacefaceAsset || {},
  };
}

function stampReleaseMeta(document, asset, sourceTextureCount, proof, sourceSf = {}) {
  const root = document.getRoot();
  const assetBlock = root.getAsset();
  assetBlock.generator = `${assetBlock.generator || ''}; SpaceFace tools/art/finalize_m4_helios_hub_candidate.mjs`.replace(/^; /, '');
  const extras = { ...(assetBlock.extras || {}) };
  const sf = { ...(sourceSf || {}), ...(extras.spacefaceAsset || {}) };
  // The runtime/export contract keys place assets from the live part id. Candidate-family ids
  // (for example `helios_hub_station`) are provenance, not contract identity. Preserving an older
  // candidate assetId here made regenerated live hubs fail the exporter golden.
  sf.assetId = `SF_${asset.liveId.toUpperCase()}`;
  sf.partId = sf.partId || asset.liveId;
  sf.liveId = asset.liveId;
  sf.family = 'helios_hub_env';
  sf.packet = PACKET;
  sf.wiringStatus = PROMOTE ? 'promoted_live_place' : 'candidate_pending_promote';
  sf.textureCompression = sourceTextureCount > 0 ? 'KTX2/BasisU' : (sf.textureCompression || 'none');
  sf.finalize = {
    meshopt: proof.meshoptApplied,
    ktx2: proof.ktx2Applied,
    meshoptBufferViews: proof.meshoptBufferViewCount,
    ktx2Images: proof.ktx2ImageCount,
    sourceTextureCount,
    releaseTextureCount: proof.textureCount,
    tool: 'finalize_m4_helios_hub_candidate.mjs',
    pattern: 'SG04 MeshoptEncoder + ktx2-encoder',
  };
  extras.spacefaceAsset = sf;
  extras.assetId = sf.assetId;
  extras.partId = sf.partId;
  assetBlock.extras = extras;

  for (const scene of root.listScenes()) {
    const se = scene.getExtras() || {};
    const base = se.spacefaceAsset || sourceSf || {};
    scene.setExtras({
      ...se,
      spacefaceAsset: {
        ...base,
        assetId: sf.assetId,
        partId: sf.partId,
        textureCompression: sf.textureCompression,
        packet: PACKET,
        liveId: asset.liveId,
        wiringStatus: sf.wiringStatus,
      },
    });
  }
}

async function writeAtomic(io, document, targetPath) {
  const tmp = `${targetPath}.tmp.${process.pid}.${Date.now()}.glb`;
  await io.write(tmp, document);
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      if (existsSync(targetPath)) {
        try { unlinkSync(targetPath); } catch { /* retry */ }
      }
      renameSync(tmp, targetPath);
      return;
    } catch (err) {
      if (attempt === 11) {
        try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* ignore */ }
        throw err;
      }
      await new Promise((r) => setTimeout(r, 80 * (attempt + 1)));
    }
  }
}

async function finalizeOne(io, asset) {
  const src = sourcePath(asset.id);
  const dst = candidatePath(asset.id);
  if (!existsSync(src)) throw new Error(`missing source GLB: ${src}`);
  mkdirSync(dirname(dst), { recursive: true });

  const sourceRaw = inspectGlbRaw(src);
  const sourceTextureCount = sourceRaw.textureCount || sourceRaw.imageCount;
  const sourceSf = sourceRaw.spacefaceAsset || {};

  const document = await io.read(src);
  markContractNodes(document, sourceSf.collisionBounds || null);
  splitIncompatibleTextureSlots(document);

  const transforms = [];
  let ktx2Applied = false;
  if (sourceTextureCount > 0) {
    const alreadyKtx2 = sourceRaw.ktx2ImageCount > 0
      && sourceRaw.ktx2ImageCount === sourceRaw.imageCount;
    if (!alreadyKtx2) {
      transforms.push(
        ktx2({
          slots: /^baseColorTexture$/,
          imageDecoder: decodeImage,
          isUASTC: true,
          uastcLDRQualityLevel: 2,
          generateMipmap: true,
          needSupercompression: true,
          isPerceptual: true,
          isSetKTX2SRGBTransferFunc: true,
        }),
        ktx2({
          slots: /^normalTexture$/,
          imageDecoder: decodeImage,
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
          imageDecoder: decodeImage,
          isUASTC: true,
          uastcLDRQualityLevel: 2,
          generateMipmap: true,
          needSupercompression: true,
          isPerceptual: false,
          isSetKTX2SRGBTransferFunc: false,
        }),
      );
      ktx2Applied = true;
    } else {
      ktx2Applied = true;
    }
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
  markContractNodes(document, sourceSf.collisionBounds || null);

  const proofStub = {
    meshoptApplied: true,
    ktx2Applied,
    meshoptBufferViewCount: 0,
    ktx2ImageCount: 0,
    textureCount: countTextures(document),
  };
  stampReleaseMeta(document, asset, sourceTextureCount, proofStub, sourceSf);
  await writeAtomic(io, document, dst);

  const releaseRaw = inspectGlbRaw(dst);
  for (const need of [...asset.requireSockets, 'COLLISION_HULL']) {
    if (!releaseRaw.nodeNames.includes(need)) {
      throw new Error(`${asset.id}: missing contract node after finalize: ${need}`);
    }
  }
  if (!releaseRaw.hasMeshoptExt || releaseRaw.meshoptBufferViewCount < 1) {
    throw new Error(`${asset.id}: EXT_meshopt_compression missing (views=${releaseRaw.meshoptBufferViewCount})`);
  }
  if (sourceTextureCount > 0) {
    if (releaseRaw.ktx2ImageCount !== releaseRaw.imageCount || releaseRaw.imageCount < 1) {
      throw new Error(`${asset.id}: not all release images are KTX2 (ktx2=${releaseRaw.ktx2ImageCount}/${releaseRaw.imageCount})`);
    }
  }

  // Require substantive materials — reject generic gray single-material proxies
  const mats = releaseRaw.materials || [];
  if (mats.length < 2) {
    throw new Error(`${asset.id}: material count too low (${mats.length}) — reject gray proxy`);
  }

  const document2 = await io.read(dst);
  stampReleaseMeta(document2, asset, sourceTextureCount, {
    meshoptApplied: true,
    ktx2Applied,
    meshoptBufferViewCount: releaseRaw.meshoptBufferViewCount,
    ktx2ImageCount: releaseRaw.ktx2ImageCount,
    textureCount: releaseRaw.textureCount,
  }, sourceSf);
  await writeAtomic(io, document2, dst);
  const finalRaw = inspectGlbRaw(dst);

  return {
    id: asset.id,
    liveId: asset.liveId,
    ok: true,
    source: rel(src),
    candidate: rel(dst),
    sourceBytes: statSync(src).size,
    candidateBytes: statSync(dst).size,
    sourceSha256: sha256(src),
    candidateSha256: sha256(dst),
    sourceTextureCount,
    releaseTextureCount: finalRaw.textureCount,
    releaseImageCount: finalRaw.imageCount,
    ktx2ImageCount: finalRaw.ktx2ImageCount,
    meshoptBufferViewCount: finalRaw.meshoptBufferViewCount,
    extensionsUsed: finalRaw.extensionsUsed,
    materials: finalRaw.materials,
    nodes: finalRaw.nodeNames,
    meshopt: finalRaw.hasMeshoptExt ? 'EXT_meshopt_compression' : 'none',
    ktx2: finalRaw.ktx2ImageCount > 0 ? 'KHR_texture_basisu/KTX2' : 'none',
    spacefaceAsset: finalRaw.spacefaceAsset,
  };
}

function updateManifestNotes(promoted) {
  if (!existsSync(PART_MANIFEST)) return;
  const man = JSON.parse(readFileSync(PART_MANIFEST, 'utf8'));
  const byId = new Map(promoted.map((p) => [p.liveId, p]));
  for (const part of man.parts || []) {
    const p = byId.get(part.id);
    if (!p) continue;
    part.bytes = p.candidateBytes;
    if (Number.isFinite(p.spacefaceAsset?.triangleCount)) {
      part.tris = p.spacefaceAsset.triangleCount;
    }
    if (p.spacefaceAsset?.kind === 'landmark') {
      part.budgetClass = 'landmark';
    }
    if (Number.isFinite(p.spacefaceAsset?.textureSize)) {
      part.textureSize = p.spacefaceAsset.textureSize;
    }
    const collision = p.spacefaceAsset?.collisionBounds;
    if (Array.isArray(collision?.min) && Array.isArray(collision?.max)) {
      part.bounds = {
        min: collision.min,
        max: collision.max,
        dimensionsM: Array.isArray(collision.size)
          ? collision.size
          : collision.max.map((value, index) => value - collision.min[index]),
      };
    }
    part.note = `${part.note || ''} | M4-HELIOS-HUB-ENV ${PACKET} promote ${new Date().toISOString().slice(0, 10)} sha=${p.candidateSha256.slice(0, 12)}`.trim();
  }
  writeTextAtomic(PART_MANIFEST, `${JSON.stringify(man, null, 2)}\n`);
}

function writeTextAtomic(target, contents) {
  const temporary = `${target}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(temporary, contents, 'utf8');
  replacePreparedFile(temporary, target);
}

function promoteToLive(results) {
  mkdirSync(PARTS_PLACES, { recursive: true });
  const promoted = [];
  for (const r of results) {
    if (!r.ok) continue;
    const src = resolve(ROOT, r.candidate);
    // Promote SOURCE (uncompressed with full contract) into parts; release build compresses.
    // Prefer source for parts authoring tree (matches pipeline: parts = authoring, release = compressed).
    const sourceAuthoring = sourcePath(r.id);
    const dest = resolve(PARTS_PLACES, `${r.liveId}.glb`);
    // Backup previous live place
    if (existsSync(dest)) {
      const bak = resolve(FAMILY, 'evidence', 'pre_promote_backups');
      mkdirSync(bak, { recursive: true });
      const backup = resolve(bak, `${r.liveId}.glb`);
      // Preserve the first pre-promotion snapshot. Repeated promotion attempts must not overwrite
      // it with a later live asset, and old read-only audit processes may legitimately hold it.
      if (!existsSync(backup)) copyFileSync(dest, backup);
    }
    // Use finalized candidate as live authoring input only if source is preferred;
    // pipeline expects parts/ to be PNG-source; candidates are KTX2. Promote SOURCE.
    replaceFileFrom(sourceAuthoring, dest);
    promoted.push({ ...r, livePath: rel(dest) });
    console.log(`[m4-helios-hub-finalize] promoted ${r.id} → ${rel(dest)}`);
  }
  updateManifestNotes(promoted);
  return promoted;
}

function replaceFileFrom(source, target) {
  const temporary = `${target}.tmp.${process.pid}.${Date.now()}.glb`;
  copyFileSync(source, temporary);
  replacePreparedFile(temporary, target);
}

function replacePreparedFile(temporary, target) {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      if (existsSync(target)) unlinkSync(target);
      renameSync(temporary, target);
      return;
    } catch (error) {
      if (attempt === 19) {
        try { if (existsSync(temporary)) unlinkSync(temporary); } catch { /* best effort */ }
        throw error;
      }
      // Keep manifest/release updates ordered after the live file swap.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100 * (attempt + 1));
    }
  }
}

function runReleaseBuild(liveIds) {
  if (!liveIds.length) return { ok: false, error: 'no live ids' };
  // Incremental release rebuild for promoted place IDs only.
  const only = liveIds.join(',');
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const args = ['run', 'build:sg04:release-assets', '--', '--no-clean', '--only', only];
  console.log(`[m4-helios-hub-finalize] release rebuild: ${args.join(' ')}`);
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    ok: res.status === 0,
    status: res.status,
    stdout: (res.stdout || '').slice(-4000),
    stderr: (res.stderr || '').slice(-4000),
  };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
};

function startStaticServer() {
  return new Promise((resolveServer) => {
    const server = createServer((req, res) => {
      try {
        let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        if (urlPath === '/') urlPath = '/index.html';
        const abs = resolve(ROOT, urlPath.replace(/^\//, ''));
        if (!abs.startsWith(ROOT) || !existsSync(abs)) {
          res.writeHead(404);
          res.end('not found');
          return;
        }
        const ext = extname(abs).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
        });
        res.end(readFileSync(abs));
      } catch (err) {
        res.writeHead(500);
        res.end(String(err));
      }
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolveServer({ server, port });
    });
  });
}

function writePreviewHtml(outPath, glbUrl) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>M4 Helios Hub Preview</title>
<style>html,body{margin:0;background:#0a0c10;overflow:hidden}canvas{display:block}</style>
</head><body>
<script type="importmap">
{"imports":{
  "three":"/node_modules/three/build/three.module.js",
  "three/addons/":"/node_modules/three/examples/jsm/"
}}
</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const params = new URLSearchParams(location.search);
const mode = params.get('mode') || 'close';
const w = Number(params.get('w') || 960);
const h = Number(params.get('h') || 540);
const glbUrl = params.get('glb') || '${glbUrl}';

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setSize(w, h, false);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0c10);
const camera = new THREE.PerspectiveCamera(40, w / h, 0.05, 800);

const hemi = new THREE.HemisphereLight(0xb0c4de, 0x1a1c22, 0.55);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff2e0, 1.35);
key.position.set(18, 20, 12);
scene.add(key);
const fill = new THREE.DirectionalLight(0x88aacc, 0.45);
fill.position.set(-16, 8, -10);
scene.add(fill);
const rim = new THREE.DirectionalLight(0x44ddff, 0.4);
rim.position.set(-8, 6, 16);
scene.add(rim);

const ktx2Loader = new KTX2Loader()
  .setTranscoderPath('/node_modules/three/examples/jsm/libs/basis/')
  .detectSupport(renderer);

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
loader.setKTX2Loader(ktx2Loader);

function fitCamera(root, mode) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const distMul = mode === 'close' ? 1.7 : mode === 'mid' ? 2.8 : 4.5;
  const dist = maxDim * distMul;
  camera.position.set(center.x + dist * 0.72, center.y + dist * 0.42, center.z + dist * 0.78);
  camera.near = Math.max(0.05, dist / 200);
  camera.far = dist * 20;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return { size: size.toArray(), center: center.toArray(), maxDim, dist, mode, w, h, glbUrl };
}

loader.load(glbUrl, (gltf) => {
  const root = gltf.scene;
  root.traverse((o) => {
    if (o.isMesh && /collision/i.test(o.name || '')) o.visible = false;
  });
  scene.add(root);
  const metrics = fitCamera(root, mode);
  renderer.render(scene, camera);
  const pixels = new Uint8Array(4);
  const gl = renderer.getContext();
  gl.readPixels(Math.floor(w/2), Math.floor(h/2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  let bright = 0;
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  for (let i = 0; i < buf.length; i += 4) {
    if (buf[i] + buf[i+1] + buf[i+2] > 90) bright++;
  }
  let meshCount = 0;
  root.traverse((o) => { if (o.isMesh && o.visible) meshCount++; });
  window.__SF_PREVIEW__ = {
    ready: true, metrics, meshCount,
    centerPixel: [pixels[0], pixels[1], pixels[2], pixels[3]],
    brightPixels: bright,
  };
}, undefined, (err) => {
  window.__SF_PREVIEW__ = { ready: false, error: String(err) };
});
</script></body></html>`;
  writeFileSync(outPath, html, 'utf8');
}

async function captureThreeEvidence(results) {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch (err) {
    return { ok: false, error: `playwright unavailable: ${err}` };
  }
  mkdirSync(DEVSHOTS, { recursive: true });
  mkdirSync(RENDERS, { recursive: true });

  const { server, port } = await startStaticServer();
  const browser = await playwright.chromium.launch({ headless: true });
  const shots = [];
  try {
    for (const r of results.filter((x) => x.ok)) {
      const glbRel = `/assets/ships/m4_helios_hub/release_candidates/places/${r.id}.glb`;
      const htmlPath = resolve(EVIDENCE, `three_preview_${r.id}.html`);
      writePreviewHtml(htmlPath, glbRel);
      for (const m of [
        { shot: `${r.id}_three_close`, mode: 'close', w: 960, h: 540 },
        { shot: `${r.id}_three_mid`, mode: 'mid', w: 128, h: 128 },
        { shot: `${r.id}_three_far`, mode: 'far', w: 40, h: 40 },
      ]) {
        const page = await browser.newPage({ viewport: { width: m.w, height: m.h }, deviceScaleFactor: 1 });
        const url = `http://127.0.0.1:${port}/assets/ships/m4_helios_hub/evidence/three_preview_${r.id}.html?mode=${m.mode}&w=${m.w}&h=${m.h}&glb=${encodeURIComponent(glbRel)}`;
        await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
        await page.waitForFunction(() => window.__SF_PREVIEW__ && window.__SF_PREVIEW__.ready === true, null, { timeout: 90000 });
        const meta = await page.evaluate(() => window.__SF_PREVIEW__);
        const evidencePng = resolve(RENDERS, `${m.shot}.png`);
        const devPng = resolve(DEVSHOTS, `${m.shot}.png`);
        await page.screenshot({ path: evidencePng, type: 'png' });
        copyFileSync(evidencePng, devPng);
        shots.push({
          shot: m.shot,
          asset: r.id,
          mode: m.mode,
          w: m.w,
          h: m.h,
          evidence: rel(evidencePng),
          devshot: rel(devPng),
          bytes: statSync(evidencePng).size,
          sha256: sha256(evidencePng),
          brightPixels: meta.brightPixels,
          meshCount: meta.meshCount,
          centerPixel: meta.centerPixel,
        });
        await page.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }
  return { ok: true, shots };
}

async function main() {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
      'meshopt.decoder': MeshoptDecoder,
    });

  mkdirSync(resolve(FAMILY, 'release_candidates/places'), { recursive: true });
  mkdirSync(EVIDENCE, { recursive: true });
  mkdirSync(DEVSHOTS, { recursive: true });

  const selected = ASSETS.filter((a) => matchOnly(a.id));
  const results = [];
  for (const asset of selected) {
    try {
      const r = await finalizeOne(io, asset);
      results.push(r);
      console.log(`[m4-helios-hub-finalize] ${asset.id}: ${r.sourceBytes} → ${r.candidateBytes} bytes meshopt=${r.meshoptBufferViewCount} ktx2=${r.ktx2ImageCount}`);
    } catch (err) {
      console.error(`[m4-helios-hub-finalize] FAIL ${asset.id}: ${err.message || err}`);
      results.push({ id: asset.id, liveId: asset.liveId, ok: false, error: String(err.message || err) });
    }
  }

  let promoteReport = null;
  let releaseReport = null;
  const okResults = results.filter((r) => r.ok);
  if (PROMOTE && okResults.length) {
    promoteReport = promoteToLive(okResults);
    releaseReport = runReleaseBuild(promoteReport.map((p) => p.liveId));
    if (!releaseReport.ok) {
      console.error('[m4-helios-hub-finalize] release rebuild failed — candidates remain; live parts may be updated');
    }
  }

  let threeReport = { ok: false, skipped: true };
  if (!SKIP_THREE && okResults.length) {
    try {
      threeReport = await captureThreeEvidence(okResults);
    } catch (err) {
      threeReport = { ok: false, error: String(err) };
    }
  }

  // Failure-reference sheet note (primitive gray proxy rejection criteria)
  const failureRef = {
    schema: 'spaceface.m4HeliosHub.failureReference.v1',
    packet: PACKET,
    rejected: [
      'Primitive blockouts / beveled boxes as final forms',
      'Accessory-only / floating module assemblies without continuous mass',
      'Generic single gray materials without ORM/normal maps',
      'File-size proxies (large GLB without hull/body substance)',
      'Missing SOCKET_Structure_Core or COLLISION_HULL',
      'Missing Meshopt/KTX2 on release candidates',
    ],
    acceptance: [
      'Continuous boolean-union primary shells',
      'Multi-material Helios identity (hull/mech/accent/warm/glass or rock)',
      '1024 baseColor + ORM + normal families',
      'LOD0/1/2 material-merged; emissive hooks keep-separate',
      'Beauty multi-angle + readability scales under .devshots/m4-helios-hub',
    ],
  };
  writeTextAtomic(resolve(EVIDENCE, 'failure_reference.json'), `${JSON.stringify(failureRef, null, 2)}\n`);

  const report = {
    schema: 'spaceface.m4HeliosHubFinalize.v1',
    packet: PACKET,
    family: 'helios_hub_env',
    finalizedAt: new Date().toISOString(),
    promote: PROMOTE,
    okCount: okResults.length,
    failCount: results.length - okResults.length,
    results,
    promoteReport,
    releaseReport: releaseReport ? {
      ok: releaseReport.ok,
      status: releaseReport.status,
      stdoutTail: releaseReport.stdout,
      stderrTail: releaseReport.stderr,
    } : null,
    threeReport: threeReport.ok
      ? { ok: true, shotCount: threeReport.shots?.length || 0, shots: threeReport.shots }
      : threeReport,
    rebuild: {
      blender: '"C:\\\\Program Files\\\\Blender Foundation\\\\Blender 5.1\\\\blender.exe" --background --python tools/blender/build_m4_helios_hub_family.py --',
      finalize: 'node tools/art/finalize_m4_helios_hub_candidate.mjs',
      promote: 'node tools/art/finalize_m4_helios_hub_candidate.mjs --promote',
    },
  };
  writeTextAtomic(resolve(EVIDENCE, 'finalize_report.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeTextAtomic(resolve(EVIDENCE, 'candidate_manifest.json'), `${JSON.stringify({
    packet: PACKET,
    assets: okResults.map((r) => ({
      id: r.id,
      liveId: r.liveId,
      candidate: r.candidate,
      candidateSha256: r.candidateSha256,
      candidateBytes: r.candidateBytes,
      materials: r.materials,
    })),
  }, null, 2)}\n`);

  console.log(`[m4-helios-hub-finalize] done ok=${report.okCount} fail=${report.failCount} promote=${PROMOTE}`);
  if (report.failCount > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
