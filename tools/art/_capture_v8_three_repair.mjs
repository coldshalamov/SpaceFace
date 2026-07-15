/**
 * Standalone Three.js evidence capture for V8 REPAIR1 hub+gate.
 * Writes under assets/ships/m4_helios_hub_v8/evidence only.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FAMILY = resolve(ROOT, 'assets/ships/m4_helios_hub_v8');
// Write under fresh three_repair1/ to avoid WinError 1224 on locked prior evidence files.
const EVIDENCE = resolve(FAMILY, 'evidence/three_repair1');
const RENDERS = resolve(EVIDENCE, 'renders');
const DEVSHOTS = resolve(EVIDENCE, 'devshots');
const IDS = ['helios_hub_station', 'helios_gate'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
};

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').toUpperCase();
}
function rel(abs) {
  return abs.replace(/\\/g, '/').replace(ROOT.replace(/\\/g, '/') + '/', '');
}

function writePreviewHtml(outPath, glbUrl) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>V8 Repair Preview</title>
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
renderer.setSize(w, h, false); renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a0c10);
const camera = new THREE.PerspectiveCamera(40, w / h, 0.05, 800);
scene.add(new THREE.HemisphereLight(0xb0c4de, 0x1a1c22, 0.7));
const key = new THREE.DirectionalLight(0xfff2e0, 1.6); key.position.set(18, 22, 14); scene.add(key);
const fill = new THREE.DirectionalLight(0x88aacc, 0.65); fill.position.set(-16, 10, -12); scene.add(fill);
const rim = new THREE.DirectionalLight(0x66ddff, 0.55); rim.position.set(-10, 8, 18); scene.add(rim);
const ktx2Loader = new KTX2Loader().setTranscoderPath('/node_modules/three/examples/jsm/libs/basis/').detectSupport(renderer);
const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); loader.setKTX2Loader(ktx2Loader);
function fitCamera(root, mode) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const distMul = mode === 'close' ? 1.7 : mode === 'mid' ? 2.8 : 4.5;
  const dist = maxDim * distMul;
  camera.position.set(center.x + dist * 0.72, center.y + dist * 0.42, center.z + dist * 0.78);
  camera.near = Math.max(0.05, dist / 200); camera.far = dist * 20;
  camera.lookAt(center); camera.updateProjectionMatrix();
  return { maxDim, dist, mode };
}
loader.load(glbUrl, (gltf) => {
  const root = gltf.scene;
  let meshCount = 0;
  root.traverse((o) => {
    if (o.isMesh && /collision/i.test(o.name || '')) o.visible = false;
    if (o.isMesh && o.visible) meshCount++;
  });
  const lodMode = params.get('lod') || '';
  if (lodMode) {
    root.traverse((o) => {
      if (!o.isMesh) return;
      const n = (o.name || '').toLowerCase();
      if (n.includes('lod0') || n.includes('lod1') || n.includes('lod2')) o.visible = n.includes(lodMode.toLowerCase());
    });
  }
  scene.add(root);
  fitCamera(root, mode);
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const buf = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  let bright = 0;
  for (let i = 0; i < buf.length; i += 4) if (buf[i] + buf[i+1] + buf[i+2] > 90) bright++;
  window.__SF_PREVIEW__ = { ready: true, meshCount, brightPixels: bright, proceduralFallback: meshCount < 1 || bright < 20 };
}, undefined, (err) => { window.__SF_PREVIEW__ = { ready: false, error: String(err) }; });
</script></body></html>`;
  writeFileSync(outPath, html, 'utf8');
}

function startServer() {
  return new Promise((resolveServer) => {
    const server = createServer((req, res) => {
      try {
        let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        const abs = resolve(ROOT, urlPath.replace(/^\//, ''));
        if (!abs.startsWith(ROOT) || !existsSync(abs)) { res.writeHead(404); res.end('nf'); return; }
        const ext = extname(abs).toLowerCase();
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
        res.end(readFileSync(abs));
      } catch (e) { res.writeHead(500); res.end(String(e)); }
    });
    server.listen(0, '127.0.0.1', () => resolveServer({ server, port: server.address().port }));
  });
}

const shots = [];
const { chromium } = await import('playwright');
mkdirSync(RENDERS, { recursive: true });
mkdirSync(DEVSHOTS, { recursive: true });
const { server, port } = await startServer();
const browser = await chromium.launch({ headless: true });
try {
  for (const id of IDS) {
    const glbRel = `/assets/ships/m4_helios_hub_v8/release_candidates/places/${id}.glb`;
    const htmlPath = resolve(EVIDENCE, `three_preview_${id}.html`);
    writePreviewHtml(htmlPath, glbRel);
    for (const m of [
      { shot: `${id}_three_close`, mode: 'close', w: 960, h: 540, lod: '' },
      { shot: `${id}_three_gameplay`, mode: 'mid', w: 960, h: 540, lod: '' },
      { shot: `${id}_three_mid`, mode: 'mid', w: 128, h: 128, lod: '' },
      { shot: `${id}_three_far`, mode: 'far', w: 40, h: 40, lod: '' },
      { shot: `${id}_three_lod0`, mode: 'close', w: 640, h: 360, lod: 'lod0' },
      { shot: `${id}_three_lod1`, mode: 'close', w: 640, h: 360, lod: 'lod1' },
      { shot: `${id}_three_lod2`, mode: 'close', w: 640, h: 360, lod: 'lod2' },
    ]) {
      const page = await browser.newPage({ viewport: { width: m.w, height: m.h }, deviceScaleFactor: 1 });
      const lodQ = m.lod ? `&lod=${encodeURIComponent(m.lod)}` : '';
      const url = `http://127.0.0.1:${port}/assets/ships/m4_helios_hub_v8/evidence/three_repair1/three_preview_${id}.html?mode=${m.mode}&w=${m.w}&h=${m.h}&glb=${encodeURIComponent(glbRel)}${lodQ}`;
      await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
      await page.waitForFunction(() => window.__SF_PREVIEW__ && (window.__SF_PREVIEW__.ready === true || window.__SF_PREVIEW__.error), null, { timeout: 90000 });
      const meta = await page.evaluate(() => window.__SF_PREVIEW__);
      const evidencePng = resolve(RENDERS, `${m.shot}.png`);
      const devPng = resolve(DEVSHOTS, `${m.shot}.png`);
      await page.screenshot({ path: evidencePng, type: 'png' });
      copyFileSync(evidencePng, devPng);
      shots.push({
        shot: m.shot, asset: id, mode: m.mode, lod: m.lod || 'all',
        bytes: statSync(evidencePng).size, sha256: sha256(evidencePng),
        brightPixels: meta.brightPixels, meshCount: meta.meshCount,
        proceduralFallback: meta.proceduralFallback,
        ok: !meta.error && !meta.proceduralFallback && meta.meshCount > 0,
        error: meta.error || null,
      });
      console.log(`[three] ${m.shot} ok=${!meta.error} bright=${meta.brightPixels} meshes=${meta.meshCount}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
writeFileSync(resolve(EVIDENCE, 'runtime_loader_receipt_repair1.json'), JSON.stringify({
  schema: 'spaceface.runtimeLoaderReceipt.v1',
  packet: 'M4-HELIOS-V8-NEW-FOUNDATION-GROK-001',
  phase: 'REPAIR1',
  loaderPath: 'three/GLTFLoader + KTX2Loader + MeshoptDecoder',
  promote: false,
  acceptanceClaim: false,
  shots,
}, null, 2));
console.log(`[three] done shots=${shots.length} ok=${shots.filter((s) => s.ok).length}`);
if (shots.some((s) => !s.ok)) process.exitCode = 1;
