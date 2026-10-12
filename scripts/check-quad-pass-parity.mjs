#!/usr/bin/env node
// W140 F-A verification: renderQuadPass must produce byte-identical output to a full
// renderer.render() of the same fixed quad scene, and must leave the GL/renderer
// bookkeeping in exactly the state the next main render expects.
//
// Drives a real WebGLRenderer in headless chromium (SwiftShader). For each quad
// material variant: draw via render() -> readPixels, clear, draw via
// renderQuadPass() -> readPixels, compare byte-for-byte. Then a main-scene
// render after a quad pass is compared against the same render without the
// intervening quad pass (state-hygiene proof).

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json' };

const server = http.createServer(async (req, res) => {
  try {
    const path = join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(404); res.end('nf');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch({
  executablePath: join(homedir(), 'AppData/Local/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-win64/chrome-headless-shell.exe'),
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) { console.log(`ok   ${name}`); return; }
  failures++;
  console.log(`FAIL ${name}${detail ? ' — ' + detail : ''}`);
}

try {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.setContent('<html><body></body></html>');
  await page.goto(`http://127.0.0.1:${port}/vendor/three.module.js`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.setContent('<html><body></body></html>');

  const result = await page.evaluate(async (port) => {
    const THREE = await import(`http://127.0.0.1:${port}/vendor/three.module.js`);
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 256;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
    renderer.autoClear = false;
    const gl = renderer.getContext();
    const out = { glErrors: [], checks: {} };
    const recErr = (tag) => { const e = gl.getError(); if (e !== gl.NO_ERROR) out.glErrors.push(`${tag}:${e}`); };

    // --- quad scene: 2x2 plane, unlit shader material sampling a source texture
    const quadScene = new THREE.Scene();
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
    quadMesh.frustumCulled = false;
    quadScene.add(quadMesh);

    // source texture with a non-trivial pattern
    const src = new Uint8Array(64 * 64 * 4);
    for (let i = 0; i < 64 * 64; i++) {
      src[i * 4] = (i * 37) % 256; src[i * 4 + 1] = (i * 53) % 256;
      src[i * 4 + 2] = (i * 91) % 256; src[i * 4 + 3] = 255;
    }
    const srcTex = new THREE.DataTexture(src, 64, 64);
    srcTex.needsUpdate = true;

    const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.,1.); }';
    const materials = {
      basic: new THREE.MeshBasicMaterial({ map: srcTex }),
      shader: new THREE.ShaderMaterial({
        uniforms: { tSrc: { value: srcTex }, uGain: { value: 0.5 } },
        vertexShader: VERT,
        fragmentShader: 'uniform sampler2D tSrc; uniform float uGain; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tSrc, vUv) * uGain + vec4(0.02,0.03,0.05,0.); }',
        depthTest: false, depthWrite: false,
      }),
      blendShader: new THREE.ShaderMaterial({
        uniforms: { tSrc: { value: srcTex } },
        vertexShader: VERT,
        fragmentShader: 'uniform sampler2D tSrc; varying vec2 vUv; void main(){ gl_FragColor = texture2D(tSrc, vUv) * 0.6; }',
        transparent: true, depthTest: false, depthWrite: false,
      }),
    };

    const target = new THREE.WebGLRenderTarget(256, 256);
    const px = () => new Uint8Array(256 * 256 * 4);
    const readTarget = () => { const b = px(); renderer.readRenderTargetPixels(target, 0, 0, 256, 256, b); return b; };
    const eq = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++; return d; };
    const glErr = () => gl.getError();

    const hasQuad = typeof renderer.renderQuadPass === 'function';
    out.hasQuadPass = hasQuad;
    if (!hasQuad) return out;

    for (const [name, material] of Object.entries(materials)) {
      quadMesh.material = material;
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x101020, 1); renderer.clear(true, true, false);
      const ac = renderer.autoClear; // stays false: the passes run under autoClear suppressed
      renderer.render(quadScene, quadCam);
      const full = readTarget(); recErr('full:' + name);
      renderer.setRenderTarget(target);
      renderer.clear(true, true, false);
      renderer.renderQuadPass(quadScene, quadCam);
      const fast = readTarget(); recErr('fast:' + name);
      out.checks['pixels:' + name] = eq(full, fast);
    }

    // --- bare-Mesh-as-"scene" shape (output.end composite call site)
    const bareQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), materials.shader);
    bareQuad.frustumCulled = false;
    renderer.setRenderTarget(target);
    renderer.clear(true, true, false);
    renderer.render(bareQuad, quadCam);
    const bareFull = readTarget(); recErr('full:bareMesh');
    renderer.setRenderTarget(target);
    renderer.clear(true, true, false);
    renderer.renderQuadPass(bareQuad, quadCam);
    const bareFast = readTarget(); recErr('fast:bareMesh');
    out.checks['pixels:bareMeshAsScene'] = eq(bareFull, bareFast);

    // --- state hygiene: main-scene render AFTER a quad pass == without it.
    const mainScene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    cam.position.set(0, 0, 4); cam.lookAt(0, 0, 0);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 1.4), new THREE.MeshBasicMaterial({ color: 0x3355aa, map: srcTex }));
    box.rotation.set(0.4, 0.7, 0.1);
    const box2 = box.clone(); box2.position.x = 1.4; box2.rotation.y = -0.3;
    mainScene.add(box, box2);
    const light = new THREE.DirectionalLight(0xffffff, 2); light.position.set(1, 2, 3);
    mainScene.add(light, new THREE.AmbientLight(0x404040));
    box.material = new THREE.MeshLambertMaterial({ color: 0x88aa33, map: srcTex });
    box2.material = new THREE.MeshLambertMaterial({ color: 0xaa3388 });

    renderer.setRenderTarget(target);
    renderer.clear(true, true, true);
    renderer.render(mainScene, cam);
    const mainSolo = readTarget(); recErr('main:solo');

    // quad pass (all three materials) between identical main renders
    for (const material of Object.values(materials)) {
      quadMesh.material = material;
      renderer.setRenderTarget(target);
      renderer.renderQuadPass(quadScene, quadCam);
    }
    renderer.setRenderTarget(target);
    renderer.clear(true, true, true);
    renderer.render(mainScene, cam);
    const mainAfter = readTarget(); recErr('main:after');

    out.checks['mainAfterQuadPasses'] = eq(mainSolo, mainAfter);
    out.checks['frameMonotonic'] = renderer.info.render.frame > 0;
    out.checks['callsCounted'] = renderer.info.render.calls > 0;
    renderer.setRenderTarget(null);
    renderer.dispose();
    return out;
  }, port);

  check('renderQuadPass exists on the vendored renderer', result.hasQuadPass === true);
  for (const [k, v] of Object.entries(result.checks || {})) {
    check(k, v === 0 || v === true, `diff=${v}`);
  }
  check('no GL errors', (result.glErrors || []).length === 0, (result.glErrors || []).join(','));
} finally {
  await browser.close();
  server.close();
}

if (failures) { console.log(`${failures} failures`); process.exit(1); }
console.log('quad-pass parity OK');
