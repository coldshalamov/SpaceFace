import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertTextureInfoPreserved,
  replaceTextureInfoIndex,
} from '../tools/art/lib/textureInfoContract.mjs';

test('texture replacement preserves texCoord, transforms, and role scalars', () => {
  const source = {
    index: 4,
    texCoord: 1,
    scale: 0.63,
    extensions: {
      KHR_texture_transform: {
        offset: [0.125, -0.25],
        rotation: 0.35,
        scale: [2.75, 3.25],
        texCoord: 1,
      },
    },
    extras: { authoredSampling: true },
  };

  const replaced = replaceTextureInfoIndex(source, 9, { scale: 0.9 });
  assert.deepEqual(replaced, {
    ...source,
    index: 9,
  });
  assert.notEqual(replaced.extensions, source.extensions);
  assertTextureInfoPreserved(replaced, source, 9, { scale: 0.9 }, 'normalTexture');
});

test('texture replacement applies defaults only when source metadata is absent', () => {
  assert.deepEqual(
    replaceTextureInfoIndex({ index: 2, texCoord: 3 }, 8, { strength: 0.85 }),
    { strength: 0.85, index: 8, texCoord: 3 },
  );
  assert.deepEqual(
    replaceTextureInfoIndex(null, 8, { strength: 0.85 }),
    { strength: 0.85, index: 8 },
  );
});
