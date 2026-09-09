import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  createSpaceReflectionEnvironment,
  SPACE_REFLECTION_PMREM_SIGMA_RADIANS,
} from '../src/render/spaceReflectionEnvironment.js';

test('PBR reflection rig preserves black space while providing distinct broad sources', () => {
  const blackSpace = new THREE.Texture();
  const reflection = createSpaceReflectionEnvironment(THREE, { background: blackSpace });

  assert.strictEqual(reflection.scene.background, blackSpace);
  assert.equal(reflection.diagnostics.visibleInGame, false);
  assert.equal(reflection.diagnostics.preservesDarkBackdrop, true);
  assert.equal(reflection.cards.length, 3);
  assert.deepEqual(
    reflection.cards.map((card) => card.name),
    ['reflection-key-warm', 'reflection-rim-cool', 'reflection-fill-neutral'],
  );
  assert.equal(new Set(reflection.cards.map((card) => card.userData.radiance)).size, 3,
    'key, rim, and fill must not collapse to one identical reflection response');
  assert.ok(reflection.cards.every((card) => card.userData.reflectionOnly === true));

  reflection.dispose();
  assert.equal(reflection.scene.children.length, 0);
});

test('PBR reflection convolution stays inside the live PMREM sample ceiling', () => {
  const cubeCapturePixels = 256 - 1;
  const radiansPerPixel = Math.PI / (2 * cubeCapturePixels);
  const requestedSamples = 1 + Math.floor(3 * SPACE_REFLECTION_PMREM_SIGMA_RADIANS / radiansPerPixel);

  assert.ok(requestedSamples <= 20, `reflection PMREM requests ${requestedSamples} samples`);
});
