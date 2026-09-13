import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// While a light casts shadows but its shadow map does not exist yet (the renderer holds shadow refreshes for
// the first 20 s of flight), three binds its shared empty DepthTexture to the shadow samplers. That texture
// was never uploaded, so WebGLTextures.setTexture2D bound the generic empty colour texture instead and ANGLE
// rejected every draw that sampled it ("Mismatch between texture format and sampler type"), which kept the
// player's ship and every other lit shadow receiver from drawing in early flight (2026-09-13).
const three = readFileSync(new URL('../vendor/three.module.js', import.meta.url), 'utf8');
const topLevelFunction = (name) => {
  const match = three.match(new RegExp(`function ${name}\\( [^)]*\\) \\{[\\s\\S]*?\\n\\}`));
  assert.ok(match, `${name} is present`);
  return match[0];
};

test('the empty shadow texture is uploaded once as a comparison depth texture', () => {
  const helper = topLevelFunction('getEmptyShadowTexture');
  assert.match(helper, /const compareFunction = textures\.isReversedDepthBuffer\(\) \? GreaterEqualCompare : LessEqualCompare;/);
  assert.match(helper, /if \( emptyShadowTexture\.version === 0 \|\| emptyShadowTexture\.compareFunction !== compareFunction \) \{\s*emptyShadowTexture\.compareFunction = compareFunction;\s*emptyShadowTexture\.needsUpdate = true;\s*\}/);
  assert.match(helper, /return emptyShadowTexture;/);
});

test('both shadow sampler setters bind it when a shadow map is missing', () => {
  for (const name of ['setValueT1', 'setValueT1Array']) {
    const setter = topLevelFunction(name);
    assert.match(setter, /if \( this\.type === gl\.SAMPLER_2D_SHADOW \) \{\s*emptyTexture2D = getEmptyShadowTexture\( textures \);\s*\}/, name);
  }
});

test('setTexture2D still uploads only textures whose version moved, which is why the helper bumps it', () => {
  const setTexture2D = three.match(/function setTexture2D\( texture, slot \) \{[\s\S]*?\n\t\}/);
  assert.ok(setTexture2D, 'setTexture2D is present');
  assert.match(setTexture2D[0], /texture\.version > 0 && textureProperties\.__version !== texture\.version/);
});
