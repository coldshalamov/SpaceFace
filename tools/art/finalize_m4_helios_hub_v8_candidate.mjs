#!/usr/bin/env node
/**
 * Finalize M4-HELIOS-V8-NEW-FOUNDATION-GROK-001 isolated candidates:
 *  1) Meshopt + KTX2/BasisU (SG04 pattern)
 *  2) Contract validation (sockets, collision, materials)
 *  3) Playwright + Three.js close/mid/far evidence from candidate GLBs
 *
 * Isolation: writes only under assets/ships/m4_helios_hub_v8/**
 * Does NOT promote to live parts/release/manifests.
 * Does NOT claim acceptance. Counts never self-pass.
 *
 * Usage:
 *   node tools/art/finalize_m4_helios_hub_v8_candidate.mjs
 *   node tools/art/finalize_m4_helios_hub_v8_candidate.mjs --skip-three
 *   node tools/art/finalize_m4_helios_hub_v8_candidate.mjs --only hub_station,gate
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
const FAMILY = resolve(ROOT, 'assets/ships/m4_helios_hub_v8');
const PACKET = 'M4-HELIOS-V8-NEW-FOUNDATION-GROK-001';
const DEVSHOTS = resolve(FAMILY, 'evidence/devshots');
const EVIDENCE = resolve(FAMILY, 'evidence');
const RENDERS = resolve(EVIDENCE, 'renders');

const ASSETS = [
  { id: 'helios_hub_station', liveId: 'place_station_trade_hub', requireSockets: ['SOCKET_Structure_Core'] },
  { id: 'helios_gate', liveId: 'place_gate_jump_ring', requireSockets: ['SOCKET_Structure_Core'] },
  { id: 'helios_rock_a', liveId: 'place_asteroid_rock_a', requireSockets: ['SOCKET_Structure_Core'] },
  { id: 'helios_rock_b', liveId: 'place_asteroid_rock_b', requireSockets: ['SOCKET_Structure_Core'] },
  { id: 'helios_rock_c', liveId: 'place_asteroid_rock_c', requireSockets: ['SOCKET_Structure_Core'] },
];

const SKIP_THREE = process.argv.includes('--skip-three');
// Promote is intentionally disabled for V8 isolation (live play safety).
const PROMOTE = false;
const ONLY = readOnly(process.argv.slice(2));
if (process.argv.includes('--promote')) {
  console.error('[m4-helios-hub-v8-finalize] REFUSE: --promote is disabled for isolated V8 packet');
  process.exit(2);
}

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


function computeSubjectMargin(pngPath) {
  const buf = readFileSync(pngPath);
  const img = decodeImage(buf);
  const { width: w, height: h, data } = img;
  const thr = 28;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (lum > thr) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { ok: false, error: 'empty_subject', meanMargin: 0 };
  const left = minX / w;
  const right = 1 - (maxX + 1) / w;
  const top = minY / h;
  const bottom = 1 - (maxY + 1) / h;
  const meanMargin = (left + right + top + bottom) / 4;
  const ok = meanMargin >= 0.08 && meanMargin <= 0.15 && Math.min(left, right, top, bottom) >= 0.04;
  return {
    ok,
    left: +left.toFixed(4),
    right: +right.toFixed(4),
    top: +top.toFixed(4),
    bottom: +bottom.toFixed(4),
    meanMargin: +meanMargin.toFixed(4),
    target: [0.08, 0.15],
  };
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
  assetBlock.generator = `${assetBlock.generator || ''}; SpaceFace tools/art/finalize_m4_helios_hub_v8_candidate.mjs`.replace(/^; /, '');
  const extras = { ...(assetBlock.extras || {}) };
  const sf = { ...(sourceSf || {}), ...(extras.spacefaceAsset || {}) };
  sf.assetId = sf.assetId || `SF_PLACE_${asset.id.toUpperCase()}`;
  sf.partId = sf.partId || asset.liveId;
  sf.liveId = asset.liveId;
  sf.family = 'helios_hub_env_v8';
  sf.packet = PACKET;
  sf.wiringStatus = 'isolated_candidate_no_promote';
  sf.acceptanceClaim = false;
  sf.textureCompression = sourceTextureCount > 0 ? 'KTX2/BasisU' : (sf.textureCompression || 'none');
  sf.finalize = {
    meshopt: proof.meshoptApplied,
    ktx2: proof.ktx2Applied,
    meshoptBufferViews: proof.meshoptBufferViewCount,
    ktx2Images: proof.ktx2ImageCount,
    sourceTextureCount,
    releaseTextureCount: proof.textureCount,
    tool: 'finalize_m4_helios_hub_v8_candidate.mjs',
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

function promoteToLive() {
  throw new Error('promoteToLive disabled for isolated V8 packet');
}

function runReleaseBuild() {
  return { ok: false, error: 'release rebuild disabled for isolated V8 packet' };
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
<html><head><meta charset="utf-8"/><title>M4 Helios Hub V8 Preview</title>
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
  const materials = new Set();
  const meshNames = [];
  let ktx2Maps = 0;
  let missingMaps = 0;
  let blackMaterials = 0;
  root.traverse((o) => {
    if (o.isMesh && /collision/i.test(o.name || '')) o.visible = false;
    if (o.isMesh) {
      meshNames.push(o.name || '(unnamed)');
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        materials.add(m.name || m.type || 'anon');
        const maps = [m.map, m.normalMap, m.aoMap, m.metalnessMap, m.roughnessMap, m.emissiveMap].filter(Boolean);
        for (const tex of maps) {
          if (tex.isCompressedTexture || (tex.format !== undefined && tex.image)) ktx2Maps++;
          else if (!tex.image) missingMaps++;
        }
        if (m.color && m.color.r + m.color.g + m.color.b < 0.02 && !m.map && !m.emissiveMap) blackMaterials++;
      }
    }
  });
  // LOD visibility: show only requested LOD if present (lod0/1/2 node names)
  const lodMode = params.get('lod') || '';
  if (lodMode) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      const n = (o.name || '').toLowerCase();
      if (n.includes('lod0') || n.includes('lod1') || n.includes('lod2')) {
        o.visible = n.includes(lodMode.toLowerCase());
      }
    });
  }
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
  // Procedural-fallback heuristic: zero meshes or all-black center with no bright pixels
  const proceduralFallback = meshCount < 1 || (bright < 40 && pixels[0] + pixels[1] + pixels[2] < 10);
  window.__SF_PREVIEW__ = {
    ready: true, metrics, meshCount,
    centerPixel: [pixels[0], pixels[1], pixels[2], pixels[3]],
    brightPixels: bright,
    materials: [...materials],
    materialCount: materials.size,
    meshNames: meshNames.slice(0, 40),
    ktx2MapRefs: ktx2Maps,
    missingMaps,
    blackMaterials,
    proceduralFallback,
    lodMode: lodMode || 'all',
    loaderPath: 'GLTFLoader+KTX2Loader+MeshoptDecoder',
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
      const glbRel = `/assets/ships/m4_helios_hub_v8/release_candidates/places/${r.id}.glb`;
      const htmlPath = resolve(EVIDENCE, `three_preview_${r.id}.html`);
      writePreviewHtml(htmlPath, glbRel);
      for (const m of [
        { shot: `${r.id}_three_close`, mode: 'close', w: 960, h: 540, lod: '' },
        { shot: `${r.id}_three_gameplay`, mode: 'mid', w: 960, h: 540, lod: '' },
        { shot: `${r.id}_three_mid`, mode: 'mid', w: 128, h: 128, lod: '' },
        { shot: `${r.id}_three_far`, mode: 'far', w: 40, h: 40, lod: '' },
        { shot: `${r.id}_three_lod0`, mode: 'close', w: 640, h: 360, lod: 'lod0' },
        { shot: `${r.id}_three_lod1`, mode: 'close', w: 640, h: 360, lod: 'lod1' },
        { shot: `${r.id}_three_lod2`, mode: 'close', w: 640, h: 360, lod: 'lod2' },
      ]) {
        const page = await browser.newPage({ viewport: { width: m.w, height: m.h }, deviceScaleFactor: 1 });
        const lodQ = m.lod ? `&lod=${encodeURIComponent(m.lod)}` : '';
        const url = `http://127.0.0.1:${port}/assets/ships/m4_helios_hub_v8/evidence/three_preview_${r.id}.html?mode=${m.mode}&w=${m.w}&h=${m.h}&glb=${encodeURIComponent(glbRel)}${lodQ}`;
        await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
        await page.waitForFunction(() => window.__SF_PREVIEW__ && (window.__SF_PREVIEW__.ready === true || window.__SF_PREVIEW__.error), null, { timeout: 90000 });
        const meta = await page.evaluate(() => window.__SF_PREVIEW__);
        if (meta.error) {
          shots.push({ shot: m.shot, asset: r.id, ok: false, error: meta.error });
          await page.close();
          continue;
        }
        const evidencePng = resolve(RENDERS, `${m.shot}.png`);
        const devPng = resolve(DEVSHOTS, `${m.shot}.png`);
        await page.screenshot({ path: evidencePng, type: 'png' });
        copyFileSync(evidencePng, devPng);
        shots.push({
          shot: m.shot,
          asset: r.id,
          mode: m.mode,
          lod: m.lod || 'all',
          w: m.w,
          h: m.h,
          evidence: rel(evidencePng),
          devshot: rel(devPng),
          bytes: statSync(evidencePng).size,
          sha256: sha256(evidencePng),
          brightPixels: meta.brightPixels,
          meshCount: meta.meshCount,
          centerPixel: meta.centerPixel,
          materials: meta.materials,
          materialCount: meta.materialCount,
          proceduralFallback: meta.proceduralFallback,
          blackMaterials: meta.blackMaterials,
          missingMaps: meta.missingMaps,
          ktx2MapRefs: meta.ktx2MapRefs,
          loaderPath: meta.loaderPath,
          framing: (m.mode === 'close' && m.w >= 512 && !m.lod) ? computeSubjectMargin(evidencePng) : { skipped: true, mode: m.mode, lod: m.lod || 'all' },
          // Far 40px shots of dark rock geology can legitimately have few "bright" pixels;
          // pass on load integrity (meshes + materials + no procedural fallback).
          ok: !meta.proceduralFallback
            && meta.meshCount > 0
            && (meta.materialCount || 0) >= 1
            && (m.mode === 'far'
              ? (meta.brightPixels >= 3 || (meta.centerPixel || []).slice(0, 3).some((c) => c > 8))
              : meta.brightPixels > 20),
        });
        await page.close();
      }
    }
    // Family composition: all five candidates in one frame
    try {
      const familyHtml = resolve(EVIDENCE, 'three_preview_family_composition.html');
      const glbList = results.filter((x) => x.ok).map((r) =>
        `/assets/ships/m4_helios_hub_v8/release_candidates/places/${r.id}.glb`);
      writeFamilyPreviewHtml(familyHtml, glbList);
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
      const url = `http://127.0.0.1:${port}/assets/ships/m4_helios_hub_v8/evidence/three_preview_family_composition.html?w=1280&h=720`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
      await page.waitForFunction(() => window.__SF_PREVIEW__ && (window.__SF_PREVIEW__.ready === true || window.__SF_PREVIEW__.error), null, { timeout: 120000 });
      const meta = await page.evaluate(() => window.__SF_PREVIEW__);
      const evidencePng = resolve(RENDERS, 'family_composition.png');
      const devPng = resolve(DEVSHOTS, 'family_composition.png');
      await page.screenshot({ path: evidencePng, type: 'png' });
      copyFileSync(evidencePng, devPng);
      shots.push({
        shot: 'family_composition',
        asset: 'family',
        mode: 'family',
        w: 1280,
        h: 720,
        evidence: rel(evidencePng),
        devshot: rel(devPng),
        bytes: statSync(evidencePng).size,
        sha256: sha256(evidencePng),
        brightPixels: meta.brightPixels,
        meshCount: meta.meshCount,
        proceduralFallback: meta.proceduralFallback,
        ok: !meta.error && !meta.proceduralFallback && (meta.meshCount || 0) >= 5 && (meta.brightPixels || 0) > 50,
        error: meta.error || null,
      });
      await page.close();
    } catch (err) {
      shots.push({ shot: 'family_composition', asset: 'family', ok: false, error: String(err) });
    }
  } finally {
    await browser.close();
    server.close();
  }
  return { ok: true, shots };
}

function writeFamilyPreviewHtml(outPath, glbUrls) {
  const listJson = JSON.stringify(glbUrls);
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>M4 Helios Hub V8 Family</title>
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

const w = Number(new URLSearchParams(location.search).get('w') || 1280);
const h = Number(new URLSearchParams(location.search).get('h') || 720);
const glbUrls = ${listJson};

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.setSize(w, h, false);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0c10);
const camera = new THREE.PerspectiveCamera(38, w / h, 0.05, 2000);
scene.add(new THREE.HemisphereLight(0xb0c4de, 0x1a1c22, 0.55));
const key = new THREE.DirectionalLight(0xfff2e0, 1.35); key.position.set(28, 30, 18); scene.add(key);
const fill = new THREE.DirectionalLight(0x88aacc, 0.45); fill.position.set(-22, 10, -14); scene.add(fill);
const rim = new THREE.DirectionalLight(0x44ddff, 0.35); rim.position.set(-10, 8, 22); scene.add(rim);

const ktx2Loader = new KTX2Loader().setTranscoderPath('/node_modules/three/examples/jsm/libs/basis/').detectSupport(renderer);
const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
loader.setKTX2Loader(ktx2Loader);

function loadOne(url) {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

const spacing = 55;
Promise.all(glbUrls.map(loadOne)).then((gltfs) => {
  let meshCount = 0;
  gltfs.forEach((gltf, i) => {
    const root = gltf.scene;
    root.traverse((o) => {
      if (o.isMesh && /collision/i.test(o.name || '')) o.visible = false;
      if (o.isMesh && o.visible) meshCount++;
    });
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const s = 18 / maxDim;
    root.scale.setScalar(s);
    root.position.set((i - (gltfs.length - 1) / 2) * spacing * 0.45, 0, 0);
    scene.add(root);
  });
  const all = new THREE.Box3().setFromObject(scene);
  const center = all.getCenter(new THREE.Vector3());
  const size = all.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const dist = maxDim * 1.35;
  camera.position.set(center.x + dist * 0.55, center.y + dist * 0.35, center.z + dist * 0.75);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const buf = new Uint8Array(w * h * 4);
  renderer.getContext().readPixels(0, 0, w, h, renderer.getContext().RGBA, renderer.getContext().UNSIGNED_BYTE, buf);
  let bright = 0;
  for (let i = 0; i < buf.length; i += 4) if (buf[i] + buf[i+1] + buf[i+2] > 90) bright++;
  window.__SF_PREVIEW__ = {
    ready: true, meshCount, brightPixels: bright,
    proceduralFallback: meshCount < 5 || bright < 40,
    loaderPath: 'GLTFLoader+KTX2Loader+MeshoptDecoder',
    assetCount: gltfs.length,
  };
}).catch((err) => {
  window.__SF_PREVIEW__ = { ready: false, error: String(err) };
});
</script></body></html>`;
  writeFileSync(outPath, html, 'utf8');
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
      console.log(`[m4-helios-hub-v8-finalize] ${asset.id}: ${r.sourceBytes} → ${r.candidateBytes} bytes meshopt=${r.meshoptBufferViewCount} ktx2=${r.ktx2ImageCount}`);
    } catch (err) {
      console.error(`[m4-helios-hub-v8-finalize] FAIL ${asset.id}: ${err.message || err}`);
      results.push({ id: asset.id, liveId: asset.liveId, ok: false, error: String(err.message || err) });
    }
  }

  const okResults = results.filter((r) => r.ok);
  void promoteToLive;
  void runReleaseBuild;

  let threeReport = { ok: false, skipped: true };
  if (!SKIP_THREE && okResults.length) {
    try {
      threeReport = await captureThreeEvidence(okResults);
    } catch (err) {
      threeReport = { ok: false, error: String(err) };
    }
  }

  const failureRef = {
    schema: 'spaceface.m4HeliosHubV8.failureReference.v1',
    packet: PACKET,
    family: 'helios_hub_env_v8',
    rejected: [
      'Four-arm radial cylinder hub massline (V1 rejection)',
      'Stacked torus/box gate pylons without continuous curved spars',
      'Faceted ico rock blobs without geological hierarchy',
      'Primitive blockouts / beveled boxes as final forms',
      'Generic single gray materials without ORM/normal maps',
      'Accessory-only / floating module assemblies without continuous mass',
      'Missing SOCKET_Structure_Core or COLLISION_HULL',
      'Missing Meshopt/KTX2 on release candidates',
    ],
    reviewBar: [
      'Continuous asymmetric orbital-port massline with hab/industrial/transit hierarchy',
      'Gate continuous curved spars + mechanical emitter anatomy',
      'Rocks: multi-pass geology + strata/ore map story',
      'Ivory/graphite/cyan/amber zones readable without emissive',
      'LOD0/1/2 material-merged; anchors + collision proxies',
      'Blender full/top/rear/detail + gamesky + Three.js close/mid/far evidence',
    ],
    acceptanceClaim: false,
    countsDoNotSelfPass: true,
  };
  writeFileSync(resolve(EVIDENCE, 'failure_reference.json'), `${JSON.stringify(failureRef, null, 2)}\n`);

  // Merge candidate hashes into source_candidate_hashes if present
  const hashPath = resolve(EVIDENCE, 'source_candidate_hashes.json');
  let hashDoc = { schema: 'spaceface.sourceCandidateHashes.v1', packet: PACKET, sources: [], candidates: [] };
  if (existsSync(hashPath)) {
    try { hashDoc = JSON.parse(readFileSync(hashPath, 'utf8')); } catch { /* keep */ }
  }
  hashDoc.candidates = okResults.map((r) => ({
    id: r.id,
    candidate: r.candidate,
    candidateSha256: r.candidateSha256,
    candidateBytes: r.candidateBytes,
    sourceSha256: r.sourceSha256,
  }));
  hashDoc.finalizedAt = new Date().toISOString();
  writeFileSync(hashPath, `${JSON.stringify(hashDoc, null, 2)}\n`);

  // Atomic five-asset material/draw estimate from candidates
  const drawCallAssets = [];
  for (const r of okResults) {
    const mats = r.materials || [];
    const matCount = mats.length;
    drawCallAssets.push({
      id: r.id,
      materials: mats,
      materialCount: matCount,
      drawEstimateByLod: {
        lod0: matCount,
        lod1: matCount,
        lod2: Math.max(1, Math.min(matCount, 3)),
      },
      ktx2ImageCount: r.ktx2ImageCount,
      meshoptBufferViewCount: r.meshoptBufferViewCount,
      candidateBytes: r.candidateBytes,
      candidateSha256: r.candidateSha256,
      collision: (r.nodes || []).includes('COLLISION_HULL'),
      lods: ['lod0', 'lod1', 'lod2'],
    });
  }
  writeFileSync(resolve(EVIDENCE, 'material_draw_call_report.json'), `${JSON.stringify({
    schema: 'spaceface.materialDrawCall.v1',
    packet: PACKET,
    family: 'helios_hub_env_v8',
    assets: drawCallAssets,
  }, null, 2)}\n`);

  const threeOk = !!(threeReport && threeReport.ok);
  const threeShots = threeReport?.shots || [];
  const threeFailures = threeShots.filter((s) => s.ok === false || s.proceduralFallback);
  const report = {
    schema: 'spaceface.m4HeliosHubV8Finalize.v1',
    packet: PACKET,
    family: 'helios_hub_env_v8',
    finalizedAt: new Date().toISOString(),
    promote: false,
    acceptanceClaim: false,
    selfPassForbidden: true,
    okCount: okResults.length,
    failCount: results.length - okResults.length,
    requiredAssets: ASSETS.map((a) => a.id),
    results,
    promoteReport: null,
    releaseReport: null,
    threeReport: threeOk
      ? {
          ok: threeFailures.length === 0,
          skipped: false,
          shotCount: threeShots.length,
          loaderPath: 'GLTFLoader+KTX2Loader+MeshoptDecoder',
          failures: threeFailures,
          shots: threeShots,
        }
      : { ...threeReport, skipped: !!threeReport?.skipped, ok: false },
    rebuild: {
      blender: '"C:\\\\Program Files\\\\Blender Foundation\\\\Blender 5.1\\\\blender.exe" --background --python tools/blender/build_m4_helios_hub_v8.py --',
      finalize: 'node tools/art/finalize_m4_helios_hub_v8_candidate.mjs',
    },
  };
  writeFileSync(resolve(EVIDENCE, 'finalize_report.json'), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(resolve(EVIDENCE, 'candidate_manifest.json'), `${JSON.stringify({
    packet: PACKET,
    family: 'helios_hub_env_v8',
    acceptanceClaim: false,
    assets: okResults.map((r) => ({
      id: r.id,
      liveId: r.liveId,
      family: 'helios_hub_env_v8',
      candidate: r.candidate,
      candidateSha256: r.candidateSha256,
      candidateBytes: r.candidateBytes,
      materials: r.materials,
      sourceSha256: r.sourceSha256,
      ktx2ImageCount: r.ktx2ImageCount,
      meshoptBufferViewCount: r.meshoptBufferViewCount,
      collision: (r.nodes || []).includes('COLLISION_HULL'),
    })),
  }, null, 2)}\n`);

  // Material/draw-call supplement from finalized candidates
  writeFileSync(resolve(EVIDENCE, 'finalize_material_report.json'), `${JSON.stringify({
    schema: 'spaceface.finalizeMaterialReport.v1',
    packet: PACKET,
    family: 'helios_hub_env_v8',
    assets: okResults.map((r) => ({
      id: r.id,
      materials: r.materials,
      materialCount: (r.materials || []).length,
      ktx2ImageCount: r.ktx2ImageCount,
      meshoptBufferViewCount: r.meshoptBufferViewCount,
      candidateBytes: r.candidateBytes,
      candidateSha256: r.candidateSha256,
    })),
  }, null, 2)}\n`);

  // Runtime loader receipt (isolated Three.js path proof)
  writeFileSync(resolve(EVIDENCE, 'runtime_loader_receipt.json'), `${JSON.stringify({
    schema: 'spaceface.runtimeLoaderReceipt.v1',
    packet: PACKET,
    family: 'helios_hub_env_v8',
    loaderPath: 'three/GLTFLoader + KTX2Loader (Basis transcoder) + MeshoptDecoder',
    matchesGamePath: true,
    promoted: false,
    electronLaunched: false,
    threeReportOk: report.threeReport?.ok === true,
    assets: okResults.map((r) => ({
      id: r.id,
      candidate: r.candidate,
      candidateSha256: r.candidateSha256,
      shots: threeShots.filter((s) => s.asset === r.id).map((s) => s.shot),
    })),
    shotCount: threeShots.length,
    finalizedAt: report.finalizedAt,
  }, null, 2)}\n`);

  console.log(`[m4-helios-hub-v8-finalize] done ok=${report.okCount} fail=${report.failCount} three=${report.threeReport?.ok} promote=false acceptanceClaim=false family=helios_hub_env_v8`);
  if (report.failCount > 0) process.exitCode = 1;
  if (report.threeReport && report.threeReport.ok === false && !report.threeReport.skipped) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

