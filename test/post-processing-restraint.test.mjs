import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

import {
  DEFAULT_POST_PRESENTATION,
  resolvePostPresentation,
} from '../src/render/bloom.js';

const require = createRequire(import.meta.url);
const { createGameServer } = require('../scripts/lib/gameServer.cjs');
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// WHAT THIS FILE PROTECTS, AND WHAT IT DELIBERATELY NO LONGER PROTECTS
// -------------------------------------------------------------------
// Retained: the CLAMPING CONTRACT. `bloomStrength` is a selective, additive light-spill control.
// It must never implicitly reach the full-screen presentation channels (grade / vignette / grain /
// toe). That is a real resolver invariant: those four are separate authored knobs owned by
// src/render/post/spaceRenderGraph.js and by settings, and a bloom slider that silently graded the
// whole frame would make every brightness change also a colour change, which is unreviewable.
//
// Withdrawn 2026-07-27 (grammar §9.2.1, build plan §2.5 item 2): this file used to assert that the
// background shader SOURCE did not contain four literal strings ("Micro-stars: hash speckle",
// "A few distant galaxies", "float bandMask", "float breath"). Two of the four matched COMMENTS,
// not code. No observed play failure was ever cited for any of them, they were defeatable by
// renaming a variable, and they banned a whole category of visual work by string match — the exact
// pattern CANONICAL_BUILD_MAP.md:164 and docs/POLICY_MANIFEST.md:44-58 forbid. Deleted.
//
// Also withdrawn: pinning DEFAULT_POST_PRESENTATION to exactly {0,0,0}. Whether the shipped default
// grade/vignette/grain is zero is a SETTINGS DEFAULT and a matter of taste; it belongs in the
// settings layer where a designer can move it, not in a test that fails the build. The invariant
// below is expressed against DEFAULT_POST_PRESENTATION itself, so it keeps holding whatever the
// authored defaults become.

test('bloom strength never implicitly grades, vignettes, or grains the whole frame', () => {
  // Every channel is a number in [0,1] — the resolver must produce a usable presentation record.
  for (const key of ['grain', 'vignette', 'grade']) {
    const value = DEFAULT_POST_PRESENTATION[key];
    assert.equal(typeof value, 'number', `${key} must resolve to a number`);
    assert.ok(value >= 0 && value <= 1, `${key} must resolve inside [0,1]`);
  }
  assert.equal(typeof DEFAULT_POST_PRESENTATION.toe, 'number');
  assert.ok(DEFAULT_POST_PRESENTATION.toe >= 0 && DEFAULT_POST_PRESENTATION.toe <= 0.06,
    'toe must resolve inside its calibrated additive [0,0.06] range');

  // The clamping contract: bloom controls do not leak into the full-screen presentation channels.
  for (const bloomStrength of [0, 0.35, 1, 2.5]) {
    assert.deepEqual(
      resolvePostPresentation({ bloomStrength }),
      DEFAULT_POST_PRESENTATION,
      `bloomStrength ${bloomStrength} must not implicitly color-grade, vignette, or grain the frame`,
    );
  }
  for (const bloom of [true, false]) {
    assert.deepEqual(resolvePostPresentation({ bloom }), DEFAULT_POST_PRESENTATION,
      'toggling bloom must not implicitly change full-screen presentation');
  }
});

test('optional post presentation is explicit and independently clamped', () => {
  assert.deepEqual(resolvePostPresentation({ grain: 2, vignette: -1, grade: 0.2, toe: 2 }), {
    grain: 1,
    vignette: 0,
    grade: 0.2,
    toe: 0.06,
  });
});

test('SwiftShader pixel matrix keeps canonical base presentation within one byte across routes', {
  timeout: 120_000,
}, async () => {
  const server = createGameServer({ root: ROOT, async: true, devDiagnostics: false });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  let browser = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-gpu-sandbox',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
      ],
    });
    const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
    // Keep the document's production import map, but do not boot the game. The matrix imports only
    // the two post routes and renders a frozen 9x9 frame directly.
    await page.route('**/src/main.js', (route) => route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: '',
    }));
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });

    const result = await page.evaluate(async () => {
      const THREE = await import('three');
      const { createBloom, DEFAULT_CINEMATIC_TOE } = await import('/src/render/bloom.js');
      const { SpaceRenderGraph } = await import('/src/render/post/spaceRenderGraph.js');
      const size = 9;
      const makeRoute = (kind) => {
        const canvas = document.createElement('canvas');
        const renderer = new THREE.WebGLRenderer({
          canvas,
          antialias: false,
          alpha: false,
          preserveDrawingBuffer: true,
          powerPreference: 'low-power',
        });
        renderer.setPixelRatio(1);
        renderer.setSize(size, size, false);
        renderer.toneMapping = THREE.NoToneMapping;
        const scene = new THREE.Scene();
        const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        const material = new THREE.ShaderMaterial({
          uniforms: { uColor: { value: new THREE.Color(0, 0, 0) } },
          vertexShader: `void main(){gl_Position=vec4(position.xy,0.0,1.0);}`,
          fragmentShader: `precision highp float; uniform vec3 uColor;
            void main(){gl_FragColor=vec4(uColor,1.0);}`,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        });
        scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
        const processor = kind === 'wrapper'
          ? createBloom(renderer, size, size)
          : new SpaceRenderGraph(renderer, { ao: false, renderScale: 1 });
        if (kind === 'graph') processor.setSize(size, size);
        return { kind, renderer, scene, camera, material, processor };
      };
      const wrapper = makeRoute('wrapper');
      const graph = makeRoute('graph');
      const colors = {
        black: [0, 0, 0],
        mid: [0.18, 0.2, 0.22],
        hdr: [3, 1.5, 0.4],
      };
      const modes = {
        off: { bloom: false, bloomStrength: 0.52, bloomThreshold: 1 },
        zero: { bloom: true, bloomStrength: 0, bloomThreshold: 1 },
        epsilon: { bloom: true, bloomStrength: 0.000001, bloomThreshold: 1 },
        highThreshold: { bloom: true, bloomStrength: 0.8, bloomThreshold: 99 },
      };
      const presentation = {
        grade: 0.38,
        toe: DEFAULT_CINEMATIC_TOE,
        vignette: 0.18,
        grain: 0,
      };
      const pixels = new Uint8Array(size * size * 4);
      const capture = (route, color, options) => {
        route.material.uniforms.uColor.value.setRGB(...color);
        route.processor.setOptions({ ...presentation, ...options });
        if (route.kind === 'wrapper') route.processor.render(route.scene, route.camera);
        else route.processor.render(route.scene, route.camera, { time: 0 });
        const gl = route.renderer.getContext();
        gl.finish();
        gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        const sample = (x, y) => Array.from(pixels.slice((y * size + x) * 4, (y * size + x) * 4 + 3));
        return {
          center: sample(4, 4),
          corner: sample(0, 0),
          diagnostics: route.processor.diagnostics(),
        };
      };
      const cells = [];
      for (const [colorName, color] of Object.entries(colors)) {
        for (const acesToneMapping of [false, true]) {
          for (const exposure of [0.65, 1.35]) {
            for (const [modeName, mode] of Object.entries(modes)) {
              const options = { ...mode, acesToneMapping, exposure };
              cells.push({
                key: `${colorName}|${acesToneMapping}|${exposure}|${modeName}`,
                colorName,
                acesToneMapping,
                exposure,
                modeName,
                wrapper: capture(wrapper, color, options),
                graph: capture(graph, color, options),
              });
            }
          }
        }
      }
      const gl = wrapper.renderer.getContext();
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      wrapper.processor.dispose();
      graph.processor.dispose();
      wrapper.renderer.dispose();
      graph.renderer.dispose();
      return { gpu, cells };
    });

    assert.match(result.gpu, /swiftshader/i, `matrix must run on SwiftShader, got ${result.gpu}`);
    for (const cell of result.cells) {
      for (const position of ['center', 'corner']) {
        const a = cell.wrapper[position];
        const b = cell.graph[position];
        const maxDiff = Math.max(...a.map((value, index) => Math.abs(value - b[index])));
        assert.ok(maxDiff <= 1,
          `${cell.key}|${position} wrapper ${a} vs graph ${b} exceeded one byte`);
      }
      if (cell.modeName === 'off' || cell.modeName === 'zero') {
        assert.equal(cell.wrapper.diagnostics.bloomPasses, 0, `${cell.key} wrapper bloom passes`);
        assert.equal(cell.graph.diagnostics.bloomPasses, 0, `${cell.key} graph bloom passes`);
      }
    }

    const black = result.cells.find((cell) => cell.key === 'black|true|0.65|off');
    assert.ok(black, 'matrix contains the calibrated black cell');
    assert.ok(Math.min(...black.wrapper.center) >= 8 && Math.max(...black.wrapper.center) <= 18,
      `center toe stays near the documented perceptual floor: ${black.wrapper.center}`);
    assert.ok(black.wrapper.corner.every((value, index) => value <= black.wrapper.center[index]),
      'vignette darkens the calibrated toe toward the corner');
    assert.ok(black.wrapper.corner.some((value) => value > 0),
      'the corner keeps a bounded non-black floor instead of collapsing into a blob');

    const midLow = result.cells.find((cell) => cell.key === 'mid|false|0.65|off').wrapper.center;
    const midHigh = result.cells.find((cell) => cell.key === 'mid|false|1.35|off').wrapper.center;
    assert.ok(midHigh.some((value, index) => value > midLow[index]),
      'exposure remains a live base-presentation control');
    const hdrNoAces = result.cells.find((cell) => cell.key === 'hdr|false|0.65|off').wrapper.center;
    const hdrAces = result.cells.find((cell) => cell.key === 'hdr|true|0.65|off').wrapper.center;
    assert.notDeepEqual(hdrAces, hdrNoAces, 'ACES on/off remains observable for HDR input');
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
