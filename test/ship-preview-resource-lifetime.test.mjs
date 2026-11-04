import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { registerHooks } from 'node:module';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { SHIPS } from '../src/data/ships.js';

// CPU ownership fixture. The constructor, visual factory, caches and disposal events are real;
// WebGLRenderer and the browser surfaces are substitutes. These are not GPU/device observations.
const renderers = [];
class CpuRenderer {
  constructor({ canvas }) {
    this.domElement = canvas;
    this.debug = {};
    this.info = { programs: [] };
    this.properties = { get: () => ({}) };
    this.extensions = { has: () => false };
    this.disposals = 0;
    this.retirements = 0;
    renderers.push(this);
  }
  setPixelRatio() {}
  setSize() {}
  setClearColor() {}
  render(scene) { this.scene = scene; }
  getContext() { return { isContextLost: () => this.retirements > 0 }; }
  dispose() { this.disposals++; }
  forceContextLoss() { this.retirements++; }
}
const previous = new Map(['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame', '__previewCpuRenderer']
  .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
after(() => {
  for (const [key, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
});
globalThis.__previewCpuRenderer = CpuRenderer;
const previewUrl = new URL('../src/ui/shipPreviewMount.js', import.meta.url).href;
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'three' && context.parentURL === previewUrl) {
      return { url: 'fixture:preview-three', shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'fixture:preview-three') return { format: 'module', shortCircuit: true,
      source: `export * from ${JSON.stringify(import.meta.resolve('three'))}; export const WebGLRenderer = globalThis.__previewCpuRenderer;` };
    return next(url, context);
  },
});
let createShipPreviewMount, createStageHull;
try {
  ({ createShipPreviewMount } = await import(previewUrl));
  ({ createStageHull } = await import('../src/ui/screens/stageHull.js'));
} finally { hook.deregister(); }

const gradient = { addColorStop() {} };
const context2d = new Proxy({}, { get(target, key) {
  if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => gradient;
  if (key === 'measureText') return () => ({ width: 10 });
  if (key === 'getImageData' || key === 'createImageData') return () => ({ data: new Uint8ClampedArray(256 * 256 * 4) });
  return target[key] ?? (() => {});
} });
function element(tag = 'canvas') {
  const attributes = new Map();
  return {
    tagName: tag.toUpperCase(), width: 320, height: 200, clientWidth: 320, clientHeight: 200,
    style: {}, dataset: {}, children: [], classList: { toggle() {} },
    getContext: () => context2d, addEventListener() {}, removeEventListener() {},
    setAttribute(key, value) { attributes.set(key, String(value)); },
    getAttribute(key) { return attributes.get(key) ?? null; },
    removeAttribute(key) { attributes.delete(key); },
    prepend(child) { child.parentNode = this; this.children.unshift(child); },
    remove() { this.parentNode?.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; },
  };
}
globalThis.window = { devicePixelRatio: 1 };
globalThis.document = { createElement: element, createElementNS: (_ns, tag) => element(tag) };
globalThis.requestAnimationFrame = () => 1;
globalThis.cancelAnimationFrame = () => {};

function resources(root) {
  const geometries = new Set(), materials = new Set();
  root.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (material) materials.add(material);
    }
  });
  return { geometries, materials };
}
function mountPreview() {
  const mount = createShipPreviewMount(element(), { authoredShips: false, authoredWarmup: false });
  return { mount, renderer: renderers.at(-1) };
}

test('retirement preserves real factory geometry borrowed by another hull and releases only preview material clones', () => {
  const def = SHIPS.find(ship => ship.id === 'ship_pelican');
  const main = resources(createVisualFactory().build({ id: 2, type: 'ship', team: 0, factionId: 'faction_free',
    radius: def.collisionRadius || 14, data: { defId: def.id, fittings: [], weapons: [] } }));
  const { mount, renderer } = mountPreview();
  mount.show(def.id, { rotating: false });
  const preview = resources(renderer.scene);
  const shared = [...preview.geometries].filter(g => g.userData.spacefaceSharedAsset);
  assert(shared.some(g => main.geometries.has(g)), 'a second real factory hull borrows the same cache geometry');
  let sharedDisposals = 0, mainMaterialDisposals = 0, cloneDisposals = 0;
  for (const geometry of shared) geometry.addEventListener('dispose', () => sharedDisposals++);
  for (const material of main.materials) material.addEventListener('dispose', () => mainMaterialDisposals++);
  const clones = [...preview.materials].filter(m => m.isMeshStandardMaterial || m.isMeshPhysicalMaterial);
  assert(clones.length > 0);
  for (const material of clones) {
    assert(!main.materials.has(material), 'preview tuning owns a clone rather than the factory material');
    material.addEventListener('dispose', () => cloneDisposals++);
  }
  try { mount.dispose(); mount.dispose(); }
  finally { assert.equal(renderer.retirements, 1); }
  assert.equal(sharedDisposals, 0, 'preview retirement must not invalidate cache-owned GPU buffers');
  assert.equal(mainMaterialDisposals, 0);
  assert.equal(cloneDisposals, clones.length, 'each preview-owned material is released once');
});

test('cache eviction releases the evicted preview clones and leaves shared geometry and the current hull alive', () => {
  const { mount, renderer } = mountPreview();
  mount.show('ship_pelican', { rotating: false, fittings: [] });
  const first = resources(renderer.scene);
  const clones = [...first.materials].filter(m => m.isMeshStandardMaterial || m.isMeshPhysicalMaterial);
  let sharedDisposals = 0, cloneDisposals = 0;
  for (const geometry of first.geometries) {
    if (geometry.userData.spacefaceSharedAsset) geometry.addEventListener('dispose', () => sharedDisposals++);
  }
  for (const material of clones) material.addEventListener('dispose', () => cloneDisposals++);
  try {
    for (let length = 1; length <= 16; length++) {
      mount.show('ship_pelican', { rotating: false, fittings: Array(length).fill(null) });
    }
    assert.equal(cloneDisposals, clones.length, 'the seventeenth cache entry retires the first');
    assert.equal(sharedDisposals, 0);
    assert.equal(renderer.retirements, 0, 'eviction must not retire the displayed surface');
    assert.equal(mount.getDefId(), 'ship_pelican');
  } finally { mount.dispose(); }
  assert.equal(cloneDisposals, clones.length, 'later context retirement does not dispose evicted clones again');
});

test('real stage release/restore callbacks create one source renderer per live stage and retire each once', () => {
  const before = renderers.length;
  const stage = createStageHull(element('div'), { rootEl: element('section'), dock: false,
    mountFactory: (canvas, options) => createShipPreviewMount(canvas, { ...options, authoredShips: false, authoredWarmup: false }) });
  const ctx = { state: { settings: { video: { motionReduce: true } } } };
  for (let attempt = 0; attempt < 3; attempt++) {
    stage.show('ship_pelican'); stage.activate(ctx); stage.deactivate();
    assert.equal(renderers.length - before, attempt + 1);
    assert.equal(stage.release(), true); assert.equal(stage.release(), false);
    assert.equal(renderers.at(-1).retirements, 1);
    if (attempt < 2) { assert.equal(stage.restore(), true); assert.equal(stage.restore(), false); }
  }
  stage.dispose(); stage.dispose();
  assert.equal(renderers.length - before, 3);
  for (const renderer of renderers.slice(before)) {
    assert.equal(renderer.disposals, 1); assert.equal(renderer.retirements, 1);
  }
});
