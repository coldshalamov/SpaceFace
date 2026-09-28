import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';

import {
  combineOpeningProducerCensuses,
  createOpeningProducerCensus,
  createOpeningSubmissionPlan,
  createOpeningSubmissionReceipt,
  validateOpeningSubmissionReceipt,
} from '../src/render/openingSubmissionPlan.js';
import { yieldToNextPresent } from '../src/render/startupGpuResidency.js';

const CONTENT_HASH = 'a'.repeat(64);

function productionMetadata(root, hash = CONTENT_HASH) {
  root.userData.flightRenderPackage = {
    schema: 'spaceface.flightRenderPackage.v1',
    assetId: 'test-opening-package',
    contentHash: hash,
    contentHashVerified: true,
  };
  return root;
}

function planOptions(root) {
  const census = createOpeningProducerCensus(root, {
    includeOffscreen: true,
    route: { shadow: false, target: 'screen' },
    textures: [],
  });
  const combined = combineOpeningProducerCensuses([census]);
  return {
    candidates: [{ root, role: 'player' }],
    globalProgramKeys: combined.globalProgramKeys,
    openingProgramKeys: combined.openingProgramKeys,
    requiredContentHashes: combined.requiredContentHashes,
    producerCensus: combined,
    producerResourceIdentitySets: combined.resourceIdentitySets,
  };
}

test('receipt before absorbs live textures attached after the plan froze', () => {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.name = 'HullRoot';
  productionMetadata(root);
  const material = new THREE.MeshBasicMaterial();
  material.customProgramCacheKey = () => 'opening';
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(), material);
  leaf.name = 'Hull';
  root.add(leaf);
  scene.add(root);

  const plan = createOpeningSubmissionPlan({
    ...planOptions(root),
    camera: new THREE.PerspectiveCamera(),
    scene,
  });
  assert.equal(plan.complete, true);

  const beforePlanTextures = new Set(plan.resourceIdentitySets.blockingTextureIds || []);

  // Loading admission can stamp a blocking texture after the plan census freezes.
  const lateTexture = new THREE.Texture();
  material.map = lateTexture;

  const renderer = {
    info: {
      programs: [{ cacheKey: 'opening' }],
      memory: { geometries: 1, textures: 1 },
    },
  };
  const receipt = createOpeningSubmissionReceipt(renderer, plan, {
    programMaterials: [material],
  });
  const widened = receipt.before.blockingTextureIds.some((id) => !beforePlanTextures.has(id))
    || receipt.before.blockingTextureIds.length > beforePlanTextures.size;
  assert.ok(widened, 'live walk must widen receipt.before.blockingTextureIds past the frozen plan census');

  const validation = validateOpeningSubmissionReceipt(receipt, renderer);
  assert.equal((validation.uncapturedTextureIds || []).length, 0,
    `uncaptured textures must be empty after live absorb, got ${JSON.stringify(validation.uncapturedTextureIds)}`);
  assert.notEqual(validation.reason, 'uncaptured-first-draw-resource');
});

test('yieldToNextPresent prefers scheduler.yield over stacked setTimeout(0)', async () => {
  const order = [];
  const realRaf = globalThis.requestAnimationFrame;
  const realTimeout = globalThis.setTimeout;
  const realScheduler = globalThis.scheduler;
  globalThis.requestAnimationFrame = (cb) => {
    order.push('raf');
    cb();
    return 1;
  };
  globalThis.setTimeout = (cb, ms) => {
    order.push(`timeout:${ms ?? 0}`);
    return 1;
  };
  globalThis.scheduler = {
    yield: async () => { order.push('yield'); },
  };
  try {
    await yieldToNextPresent();
    assert.ok(order.includes('raf'));
    assert.ok(order.includes('yield'));
    assert.ok(!order.includes('timeout:0'), 'must not stack setTimeout(0) when yield exists');
  } finally {
    globalThis.requestAnimationFrame = realRaf;
    globalThis.setTimeout = realTimeout;
    globalThis.scheduler = realScheduler;
  }
});

test('player route keeps checkShaderErrors off via reporter; in-flight admission is sliced', async () => {
  const rendererSrc = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(rendererSrc, /installShaderLinkReporter/);
  assert.match(rendererSrc, /shaderChecks/);
  assert.doesNotMatch(rendererSrc, /checkShaderErrors\s*=\s*false/,
    'live WebGLRenderer must not disable shader-error checks inline (compileAsync isReady crash)');
  assert.match(rendererSrc, /sliceInFlight/);
  assert.match(rendererSrc, /yieldAfterPresent/);
  assert.match(rendererSrc, /_openingExtrasRecaptured/);
});
