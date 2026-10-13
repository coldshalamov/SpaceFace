// The private dispose-registration probe (partsLibrary) must finish in ONE render per renderer.
//
// It renders a throwaway InstancedMesh through the real renderer so three attaches its dispose
// listeners, and the renderer calls it again every frame until `complete`. The vendored three skips
// count<=0 InstancedMeshes (W140-F-C) and draws shadow casters from its own registry (Pole E), so a
// zero-count probe never registered the shadow-map material callback: registration stayed
// incomplete and the probe re-rendered — re-linking its depth/distance programs — about eight times
// a second in flight (210 runs in a 35 s launch, ~9 s of main-thread link waits).
//
// This test runs the REAL vendored WebGLRenderer (one shared three instance with partsLibrary, via an
// esbuild bundle) over a deterministic fake WebGL2 context, so it fails if the probe ever goes back
// to a mesh the vendored renderer will not register.
import assert from 'node:assert/strict';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

function createEventCanvas() {
  const listeners = new Map();
  return {
    width: 4,
    height: 4,
    style: {},
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    setAttribute() {},
  };
}

function createFakeGl(canvas) {
  let next = 1;
  const constants = new Map([['SAMPLER_2D', 0x8b5e]]);
  const names = new Map([[0x8b5e, 'SAMPLER_2D']]);
  const constant = (name) => {
    if (!constants.has(name)) {
      while (names.has(next)) next += 1;
      constants.set(name, next);
      names.set(next, name);
      next += 1;
    }
    return constants.get(name);
  };
  const params = {
    MAX_TEXTURE_SIZE: 4096, MAX_CUBE_MAP_TEXTURE_SIZE: 4096, MAX_VERTEX_ATTRIBS: 16,
    MAX_TEXTURE_IMAGE_UNITS: 16, MAX_VERTEX_TEXTURE_IMAGE_UNITS: 16, MAX_COMBINED_TEXTURE_IMAGE_UNITS: 32,
    MAX_SAMPLES: 4, MAX_FRAGMENT_UNIFORM_VECTORS: 1024, MAX_VERTEX_UNIFORM_VECTORS: 1024,
    MAX_VARYING_VECTORS: 16, MAX_UNIFORM_BUFFER_BINDINGS: 24,
    ALIASED_LINE_WIDTH_RANGE: new Float32Array([1, 1]), ALIASED_POINT_SIZE_RANGE: new Float32Array([1, 64]),
    VERSION: 'WebGL 2.0', SHADING_LANGUAGE_VERSION: 'WebGL GLSL ES 3.00', VENDOR: 'fake', RENDERER: 'fake',
  };
  const ctx = {
    canvas,
    drawingBufferHeight: 4,
    drawingBufferWidth: 4,
    checkFramebufferStatus: () => constant('FRAMEBUFFER_COMPLETE'),
    clientWaitSync: () => constant('CONDITION_SATISFIED'),
    createBuffer: () => ({}), createFramebuffer: () => ({}), createProgram: () => ({}), createQuery: () => ({}),
    createRenderbuffer: () => ({}), createSampler: () => ({}), createShader: () => ({}), createTexture: () => ({}),
    createVertexArray: () => ({}), fenceSync: () => ({}),
    getActiveAttrib: () => null,
    getActiveUniform: () => ({ name: 'map', type: 0x8b5e, size: 1 }),
    getAttribLocation: () => 0,
    getContextAttributes: () => ({
      alpha: true, antialias: false, depth: true, stencil: false, premultipliedAlpha: true,
      preserveDrawingBuffer: false, powerPreference: 'default', failIfMajorPerformanceCaveat: false,
    }),
    getError: () => constant('NO_ERROR'),
    getExtension: () => null,
    getParameter: (value) => params[names.get(value)] ?? 0,
    getProgramInfoLog: () => '',
    getProgramParameter: (_program, value) => {
      const name = names.get(value);
      if (name === 'ACTIVE_ATTRIBUTES') return 0;
      if (name === 'ACTIVE_UNIFORMS') return 1;
      return true;
    },
    getQueryParameter: () => true,
    getShaderInfoLog: () => '',
    getShaderParameter: () => true,
    getShaderPrecisionFormat: () => ({ precision: 23, rangeMax: 127, rangeMin: 127 }),
    getSupportedExtensions: () => [],
    getUniformLocation: () => ({}),
    isContextLost: () => false,
  };
  return new Proxy(ctx, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === 'string' && /^[A-Z0-9_]+$/.test(prop)) return constant(prop);
      if (typeof prop === 'string') {
        const noop = () => {};
        target[prop] = noop;
        return noop;
      }
      return undefined;
    },
  });
}

async function loadSharedThree() {
  const built = await build({
    bundle: true,
    format: 'esm',
    legalComments: 'none',
    logLevel: 'error',
    minify: false,
    platform: 'browser',
    target: 'es2022',
    write: false,
    alias: {
      three: path.join(ROOT, 'vendor', 'three.module.js'),
      'three/addons': path.join(ROOT, 'vendor', 'addons'),
    },
    stdin: {
      contents: [
        "export { WebGLRenderer, Scene } from 'three';",
        "export { beginAuthoredInstanceMeshDisposeRegistrationProbe, endAuthoredInstanceMeshDisposeRegistrationProbe, prepareAuthoredInstancePoolsForContextLoss } from './src/render/partsLibrary.js';",
      ].join('\n'),
      loader: 'js',
      resolveDir: ROOT,
      sourcefile: 'dispose-probe-single-run.entry.mjs',
    },
  });
  const source = Buffer.from(built.outputFiles[0].text).toString('base64');
  return import(`data:text/javascript;base64,${source}#dispose-probe-single-run`);
}

test('the dispose-registration probe completes in one render and is then skipped', async () => {
  const mod = await loadSharedThree();
  const canvas = createEventCanvas();
  const renderer = new mod.WebGLRenderer({ canvas, context: createFakeGl(canvas) });
  renderer.setSize(4, 4, false);
  renderer.userData = renderer.userData || {};
  const scene = new mod.Scene();

  const first = mod.beginAuthoredInstanceMeshDisposeRegistrationProbe(scene, renderer);
  assert.ok(first, 'the first call renders the probe');
  const end = mod.endAuthoredInstanceMeshDisposeRegistrationProbe(first);
  assert.deepEqual(end.captureErrors, [], 'the probe render raised nothing');
  assert.equal(end.complete, true,
    `registration is complete after one run (missing: ${end.provenanceStatus.missingKinds.join(', ') || 'none'})`);
  assert.deepEqual(end.provenanceStatus.missingKinds, []);
  assert.ok(end.provenanceStatus.listenerCounts.materials >= 2,
    'both the renderer and the shadow map material callbacks were captured');

  // The renderer asks again every frame; a completed registration must make that free.
  for (let frame = 0; frame < 5; frame += 1) {
    assert.equal(mod.beginAuthoredInstanceMeshDisposeRegistrationProbe(scene, renderer), null,
      `frame ${frame + 1} does not re-render the probe`);
  }
  assert.equal(renderer.userData.spacefaceDisposeProbeRuns, 1, 'exactly one probe render for this renderer');
});

test('a registration that cannot complete is retried a bounded number of times per context generation', async () => {
  const mod = await loadSharedThree();
  const scene = new mod.Scene();
  // A renderer whose render() draws nothing: no dispose listener is ever attached, so registration
  // can never complete. Before the cap this meant a full probe scene render on every frame.
  const deadRenderer = {
    userData: {},
    render() {},
    setRenderTarget() {},
  };
  let rendered = 0;
  for (let frame = 0; frame < 10; frame += 1) {
    const receipt = mod.beginAuthoredInstanceMeshDisposeRegistrationProbe(scene, deadRenderer);
    if (!receipt) continue;
    rendered += 1;
    mod.endAuthoredInstanceMeshDisposeRegistrationProbe(receipt);
  }
  assert.equal(rendered, 3, 'at most three probe renders for an incomplete registration');
  assert.equal(deadRenderer.userData.spacefaceDisposeProbeRuns, 3);

  // A context loss starts a new generation: the probe may run again.
  mod.prepareAuthoredInstancePoolsForContextLoss(scene, deadRenderer);
  const again = mod.beginAuthoredInstanceMeshDisposeRegistrationProbe(scene, deadRenderer);
  assert.ok(again, 'a new context generation re-arms the probe');
  mod.endAuthoredInstanceMeshDisposeRegistrationProbe(again);
});
