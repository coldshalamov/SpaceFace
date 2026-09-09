#!/usr/bin/env node
/**
 * Finalize M4 Helios Arclight hero hauler candidate:
 *  1) Meshopt + KTX2/BasisU (SG04 pattern)
 *  2) Playwright + Three.js isolated evidence captures
 *  3) K0 quality-floor comparison contact sheet
 *  4) Candidate manifest / provenance receipts
 *
 * Does NOT write into assets/ships/parts, release, or src.
 *
 * Usage:
 *   node tools/art/finalize_m4_hero_hauler_candidate.mjs
 *   node tools/art/finalize_m4_hero_hauler_candidate.mjs --skip-three
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
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { extname } from 'node:path';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { ktx2 } from 'ktx2-encoder/gltf-transform';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import JPEG from 'jpeg-js';
import { PNG } from 'pngjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FAMILY = resolve(ROOT, 'assets/ships/m4_hero_hauler');
const PACKET = 'M4-HERO-HAULER-K0-QUALITY-001';
const SHIP = Object.freeze({
  id: 'helios_arclight',
  assetId: 'SF_WHOLESHIP_HELIOS_ARCLIGHT',
  partId: 'wholeship_helios_arclight',
  role: 'civilian_heavy_hauler_hero',
  title: 'Helios Arclight',
});

const SKIP_THREE = process.argv.includes('--skip-three');
const DEVSHOTS = resolve(ROOT, '.devshots/m4-hero-hauler');
const EVIDENCE = resolve(FAMILY, 'evidence');
const RENDERS = resolve(EVIDENCE, 'renders');

function sha256(path) {
  const h = createHash('sha256');
  h.update(readFileSync(path));
  return h.digest('hex').toUpperCase();
}

function rel(abs) {
  return abs.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', '');
}

function sourcePath() {
  return resolve(FAMILY, 'source/wholeships', `${SHIP.id}.glb`);
}

function candidatePath() {
  return resolve(FAMILY, 'release_candidates/wholeships', `${SHIP.id}.glb`);
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
  // Image size audit via bufferViews if possible is limited; report counts.
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

function stampReleaseMeta(document, sourceTextureCount, proof, sourceSf = {}) {
  const root = document.getRoot();
  const asset = root.getAsset();
  asset.generator = `${asset.generator || ''}; SpaceFace tools/art/finalize_m4_hero_hauler_candidate.mjs`.replace(/^; /, '');
  const extras = { ...(asset.extras || {}) };
  const sf = { ...(sourceSf || {}), ...(extras.spacefaceAsset || {}) };
  if (sourceSf.lod0AabbSize) sf.lod0AabbSize = sourceSf.lod0AabbSize;
  if (sourceSf.collisionBounds) sf.collisionBounds = sourceSf.collisionBounds;
  if (sourceSf.collisionCoverageRatio) sf.collisionCoverageRatio = sourceSf.collisionCoverageRatio;
  sf.assetId = sf.assetId || SHIP.assetId;
  sf.partId = sf.partId || SHIP.partId;
  sf.role = sf.role || SHIP.role;
  sf.family = 'helios_hero';
  sf.packet = PACKET;
  sf.wiringStatus = 'candidate_not_default_play';
  sf.textureCompression = sourceTextureCount > 0 ? 'KTX2/BasisU' : (sf.textureCompression || 'none');
  sf.finalize = {
    meshopt: proof.meshoptApplied,
    ktx2: proof.ktx2Applied,
    meshoptBufferViews: proof.meshoptBufferViewCount,
    ktx2Images: proof.ktx2ImageCount,
    sourceTextureCount,
    releaseTextureCount: proof.textureCount,
    tool: 'finalize_m4_hero_hauler_candidate.mjs',
    pattern: 'SG04 MeshoptEncoder + ktx2-encoder',
  };
  extras.spacefaceAsset = sf;
  extras.assetId = SHIP.assetId;
  extras.partId = SHIP.partId;
  asset.extras = extras;

  for (const scene of root.listScenes()) {
    const se = scene.getExtras() || {};
    const base = se.spacefaceAsset || sourceSf || {};
    scene.setExtras({
      ...se,
      spacefaceAsset: {
        ...base,
        textureCompression: sf.textureCompression,
        packet: PACKET,
        lod0AabbSize: sf.lod0AabbSize || base.lod0AabbSize,
        collisionBounds: sf.collisionBounds || base.collisionBounds,
        wiringStatus: 'candidate_not_default_play',
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

async function finalizeGlb(io) {
  const src = sourcePath();
  const dst = candidatePath();
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
  stampReleaseMeta(document, sourceTextureCount, proofStub, sourceSf);
  await writeAtomic(io, document, dst);

  const releaseRaw = inspectGlbRaw(dst);
  for (const need of [
    'SOCKET_Weapon_Front', 'SOCKET_Mining_Front', 'SOCKET_Engine_Main', 'SOCKET_Trail_Main',
    'SOCKET_Utility_Dorsal', 'SOCKET_Cargo_Ventral', 'SOCKET_Camera_Focus',
    'SOCKET_RCS_Port', 'SOCKET_RCS_Starboard', 'COLLISION_HULL',
  ]) {
    if (!releaseRaw.nodeNames.includes(need)) {
      throw new Error(`missing contract node after finalize: ${need}`);
    }
  }
  if (!releaseRaw.hasMeshoptExt || releaseRaw.meshoptBufferViewCount < 1) {
    throw new Error(`EXT_meshopt_compression missing after finalize (views=${releaseRaw.meshoptBufferViewCount})`);
  }
  if (sourceTextureCount > 0) {
    if (releaseRaw.ktx2ImageCount !== releaseRaw.imageCount || releaseRaw.imageCount < 1) {
      throw new Error(`not all release images are KTX2 (ktx2=${releaseRaw.ktx2ImageCount}/${releaseRaw.imageCount})`);
    }
  }

  const document2 = await io.read(dst);
  stampReleaseMeta(document2, sourceTextureCount, {
    meshoptApplied: true,
    ktx2Applied,
    meshoptBufferViewCount: releaseRaw.meshoptBufferViewCount,
    ktx2ImageCount: releaseRaw.ktx2ImageCount,
    textureCount: releaseRaw.textureCount,
  }, sourceSf);
  await writeAtomic(io, document2, dst);
  const finalRaw = inspectGlbRaw(dst);

  return {
    id: SHIP.id,
    assetId: SHIP.assetId,
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
    meshopt: finalRaw.hasMeshoptExt ? 'EXT_meshopt_compression' : 'none',
    ktx2: finalRaw.ktx2ImageCount > 0 ? 'KHR_texture_basisu/KTX2' : 'none',
    spacefaceAsset: finalRaw.spacefaceAsset,
  };
}

// ---------------------------------------------------------------------------
// Three.js isolated captures via Playwright
// ---------------------------------------------------------------------------

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
        // Map /assets and /node_modules and /vendor
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
<html><head><meta charset="utf-8"/><title>M4 Hero Hauler Preview</title>
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
const camera = new THREE.PerspectiveCamera(40, w / h, 0.05, 500);

const hemi = new THREE.HemisphereLight(0xb0c4de, 0x1a1c22, 0.55);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff2e0, 1.35);
key.position.set(12, 16, 10);
scene.add(key);
const fill = new THREE.DirectionalLight(0x88aacc, 0.45);
fill.position.set(-14, 6, -8);
scene.add(fill);
const rim = new THREE.DirectionalLight(0x44ddff, 0.35);
rim.position.set(-6, 4, 14);
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
  const distMul = mode === 'close' ? 1.85 : mode === 'mid' ? 2.9 : 4.6;
  const dist = maxDim * distMul;
  camera.position.set(center.x + dist * 0.72, center.y + dist * 0.38, center.z + dist * 0.78);
  camera.near = Math.max(0.05, dist / 200);
  camera.far = dist * 20;
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return { size: size.toArray(), center: center.toArray(), maxDim, dist, mode, w, h, glbUrl };
}

loader.load(glbUrl, (gltf) => {
  const root = gltf.scene;
  // Hide collision helper if present as mesh
  root.traverse((o) => {
    if (o.isMesh && /collision/i.test(o.name || '')) {
      o.visible = false;
    }
  });
  scene.add(root);
  const metrics = fitCamera(root, mode);
  renderer.render(scene, camera);
  // Sample center pixel
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
    ready: true,
    metrics,
    meshCount,
    centerPixel: [pixels[0], pixels[1], pixels[2], pixels[3]],
    brightPixels: bright,
  };
}, undefined, (err) => {
  window.__SF_PREVIEW__ = { ready: false, error: String(err) };
});
</script></body></html>`;
  writeFileSync(outPath, html, 'utf8');
}

async function captureThreeEvidence() {
  let playwright;
  try {
    playwright = await import('playwright');
  } catch (err) {
    return { ok: false, error: `playwright unavailable: ${err}` };
  }

  mkdirSync(DEVSHOTS, { recursive: true });
  mkdirSync(RENDERS, { recursive: true });

  const glbRel = `/assets/ships/m4_hero_hauler/source/wholeships/${SHIP.id}.glb`;
  const htmlPath = resolve(FAMILY, 'evidence', 'three_preview.html');
  writePreviewHtml(htmlPath, glbRel);

  const { server, port } = await startStaticServer();
  const browser = await playwright.chromium.launch({ headless: true });
  const shots = [];

  try {
    const modes = [
      { shot: 'three_readability_close', mode: 'close', w: 960, h: 540 },
      { shot: 'three_readability_120px', mode: 'mid', w: 128, h: 128 },
      { shot: 'three_readability_under45px', mode: 'far', w: 40, h: 40 },
      { shot: 'three_forward_34', mode: 'close', w: 960, h: 540 },
      { shot: 'three_gamesky_close', mode: 'close', w: 960, h: 540 },
    ];

    for (const m of modes) {
      const page = await browser.newPage({
        viewport: { width: m.w, height: m.h },
        deviceScaleFactor: 1,
      });
      const url = `http://127.0.0.1:${port}/assets/ships/m4_hero_hauler/evidence/three_preview.html?mode=${m.mode}&w=${m.w}&h=${m.h}&glb=${encodeURIComponent(glbRel)}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      await page.waitForFunction(() => window.__SF_PREVIEW__ && window.__SF_PREVIEW__.ready === true, null, { timeout: 60000 });
      const meta = await page.evaluate(() => window.__SF_PREVIEW__);
      const evidencePng = resolve(RENDERS, `${m.shot}.png`);
      const devPng = resolve(DEVSHOTS, `${m.shot}.png`);
      await page.screenshot({ path: evidencePng, type: 'png' });
      copyFileSync(evidencePng, devPng);
      shots.push({
        shot: m.shot,
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
        metrics: meta.metrics,
      });
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  // Copy Blender renders into devshots
  if (existsSync(RENDERS)) {
    for (const name of [
      'forward_34.png', 'rear_34.png', 'top_ortho.png', 'side_ortho.png', 'front_ortho.png',
      'readability_close.png', 'readability_120px.png', 'readability_under45px.png',
      'gamesky_forward_34.png', 'lod_continuity_lod0.png', 'lod_continuity_lod1.png',
      'lod_continuity_lod2.png', 'wireframe_overlay.png', 'socket_collision_overlay.png',
    ]) {
      const src = resolve(RENDERS, name);
      if (existsSync(src)) {
        const dst = resolve(DEVSHOTS, `blender-${name}`);
        copyFileSync(src, dst);
      }
    }
  }

  // K0 comparison: copy K0 live ladder if present for side-by-side note
  const k0Close = resolve(ROOT, '.devshots/k0-kestrel/live-3q-close.png');
  const k0Under = resolve(ROOT, '.devshots/k0-kestrel/live-3q-under45px.png');
  const comparison = {
    k0Close: existsSync(k0Close) ? rel(k0Close) : null,
    k0Under45: existsSync(k0Under) ? rel(k0Under) : null,
    heroClose: shots.find((s) => s.shot === 'three_readability_close')?.evidence || null,
    heroUnder45: shots.find((s) => s.shot === 'three_readability_under45px')?.evidence || null,
    note: 'Direct visual comparison against K0 live ladder. Geometry is new (not reused).',
  };
  if (existsSync(k0Close)) copyFileSync(k0Close, resolve(DEVSHOTS, 'k0-live-3q-close.png'));
  if (existsSync(k0Under)) copyFileSync(k0Under, resolve(DEVSHOTS, 'k0-live-3q-under45px.png'));

  const report = {
    schema: 'spaceface.m4HeroHaulerThreePreview.v1',
    packet: PACKET,
    wiringStatus: 'candidate_not_default_play',
    threeRoot: 'node_modules/three',
    capturedAt: new Date().toISOString(),
    shots,
    k0Comparison: comparison,
  };
  writeFileSync(resolve(EVIDENCE, 'three_preview_report.json'), JSON.stringify(report, null, 2));
  writeFileSync(resolve(DEVSHOTS, 'three-preview-report.json'), JSON.stringify(report, null, 2));
  return { ok: true, report };
}

function buildContactSheetNote() {
  // Lightweight JSON contact index (PNG collage optional / manual)
  const entries = [];
  const names = [
    'forward_34.png', 'rear_34.png', 'top_ortho.png', 'side_ortho.png',
    'readability_close.png', 'readability_120px.png', 'readability_under45px.png',
    'gamesky_forward_34.png', 'lod_continuity_lod0.png', 'lod_continuity_lod1.png',
    'lod_continuity_lod2.png', 'wireframe_overlay.png', 'socket_collision_overlay.png',
    'three_readability_close.png', 'three_readability_120px.png', 'three_readability_under45px.png',
  ];
  for (const n of names) {
    const p = resolve(RENDERS, n);
    if (existsSync(p)) {
      entries.push({ name: n, path: rel(p), bytes: statSync(p).size, sha256: sha256(p) });
    }
  }
  writeFileSync(resolve(EVIDENCE, 'evidence_index.json'), JSON.stringify({
    schema: 'spaceface.m4HeroHaulerEvidenceIndex.v1',
    packet: PACKET,
    entries,
  }, null, 2));
  return entries;
}

async function main() {
  mkdirSync(DEVSHOTS, { recursive: true });
  mkdirSync(EVIDENCE, { recursive: true });

  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  io.registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });

  console.log('[m4-hero-hauler-finalize] Meshopt+KTX2…');
  const finalize = await finalizeGlb(io);
  console.log('[m4-hero-hauler-finalize] candidate', finalize.candidateBytes, 'bytes', finalize.candidateSha256.slice(0, 12));

  let three = { ok: false, skipped: true };
  if (!SKIP_THREE) {
    console.log('[m4-hero-hauler-finalize] Three.js evidence…');
    three = await captureThreeEvidence();
    if (!three.ok) {
      console.warn('[m4-hero-hauler-finalize] Three capture warning:', three.error);
    }
  }

  const evidenceEntries = buildContactSheetNote();

  // Load production metrics if present
  let productionMetrics = null;
  const metricsPath = resolve(EVIDENCE, 'production_metrics.json');
  if (existsSync(metricsPath)) {
    productionMetrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
  }

  const sourceRaw = inspectGlbRaw(sourcePath());
  const collRatio = sourceRaw.spacefaceAsset?.collisionCoverageRatio
    || productionMetrics?.collisionCoverageRatio
    || null;

  const defects = [];
  if (collRatio && typeof collRatio.min === 'number' && collRatio.min < 0.85) {
    defects.push({
      id: 'HH-D01',
      severity: 'critical',
      title: 'Collision coverage below 0.85',
      value: collRatio,
    });
  }
  if ((productionMetrics?.export?.constantTangentPrimitives || []).length > 0) {
    defects.push({
      id: 'HH-D02',
      severity: 'medium',
      title: 'Constant tangent primitives present',
      count: productionMetrics.export.constantTangentPrimitives.length,
    });
  }
  if (productionMetrics?.bake?.status !== 'ok') {
    defects.push({
      id: 'HH-D03',
      severity: 'low',
      title: 'High-to-low bake is AO proxy only',
      bake: productionMetrics?.bake || null,
    });
  }
  if (!three.ok && !SKIP_THREE) {
    defects.push({
      id: 'HH-D04',
      severity: 'high',
      title: 'Three.js evidence capture failed',
      error: three.error || 'unknown',
    });
  }

  const manifest = {
    schema: 'spaceface.m4HeroHaulerCandidateManifest.v1',
    packet: PACKET,
    claimsAcceptance: false,
    wiringStatus: 'candidate_not_default_play',
    ship: SHIP,
    finalize,
    productionMetricsSummary: productionMetrics ? {
      totalTriangles: productionMetrics.export?.totalTriangles,
      hullTriangles: productionMetrics.export?.hullTriangles,
      sockets: productionMetrics.export?.sockets,
      materials: productionMetrics.export?.materials,
      collisionCoverageRatio: productionMetrics.collisionCoverageRatio,
      textureSize: productionMetrics.textureSize,
      sourceSha256: productionMetrics.sourceSha256,
      lodStats: productionMetrics.lodStats,
    } : null,
    threeEvidence: three.ok ? {
      shotCount: three.report.shots.length,
      shots: three.report.shots.map((s) => ({
        shot: s.shot, evidence: s.evidence, brightPixels: s.brightPixels, centerPixel: s.centerPixel,
      })),
      k0Comparison: three.report.k0Comparison,
    } : three,
    evidenceEntries,
    defects,
    honestStatus: defects.some((d) => d.severity === 'critical')
      ? 'candidate_with_critical_defects'
      : 'candidate_ready_for_controller_review',
    commands: {
      rebuild: '"C:\\\\Program Files\\\\Blender Foundation\\\\Blender 5.1\\\\blender.exe" --background --python tools/blender/build_m4_hero_hauler.py --',
      finalize: 'node tools/art/finalize_m4_hero_hauler_candidate.mjs',
    },
    generatedAt: new Date().toISOString(),
  };

  writeFileSync(resolve(EVIDENCE, 'candidate_manifest.json'), JSON.stringify(manifest, null, 2));
  writeFileSync(resolve(EVIDENCE, 'finalize_report.json'), JSON.stringify({ finalize, three: three.ok ? { ok: true, shotCount: three.report.shots.length } : three }, null, 2));
  writeFileSync(resolve(DEVSHOTS, 'candidate-manifest.json'), JSON.stringify(manifest, null, 2));

  // Campaign receipt
  const campaignDir = resolve(ROOT, '.campaign/M4-HERO-HAULER-K0-QUALITY-001');
  mkdirSync(campaignDir, { recursive: true });
  writeFileSync(resolve(campaignDir, 'receipt.json'), JSON.stringify({
    packet: PACKET,
    claimsAcceptance: false,
    honestStatus: manifest.honestStatus,
    finalize: {
      sourceBytes: finalize.sourceBytes,
      candidateBytes: finalize.candidateBytes,
      sourceSha256: finalize.sourceSha256,
      candidateSha256: finalize.candidateSha256,
      meshopt: finalize.meshopt,
      ktx2: finalize.ktx2,
    },
    collisionCoverageRatio: collRatio,
    defects,
    evidenceDir: rel(EVIDENCE),
    devshots: rel(DEVSHOTS),
    generatedAt: manifest.generatedAt,
  }, null, 2));

  console.log('[m4-hero-hauler-finalize] status:', manifest.honestStatus);
  console.log('[m4-hero-hauler-finalize] defects:', defects.length);
  console.log(JSON.stringify({
    ok: true,
    claimsAcceptance: false,
    honestStatus: manifest.honestStatus,
    candidate: finalize.candidate,
    candidateSha256: finalize.candidateSha256,
    defectCount: defects.length,
  }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
