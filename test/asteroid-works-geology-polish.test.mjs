import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCellBlockGeos } from '../src/render/asteroidInteriorPreview.js';
import {
  WORKS_CELL_GEOMETRY_OPTIONS, armWorksPulse, advanceWorksPulse, patchRockUvWindow, worksBoreStage,
} from '../src/ui/asteroid/asteroidRenderer3d.js';

test('Works joint treatment keeps the shared default, footprint, cap and facet contract', () => {
  const defaults = makeCellBlockGeos();
  const explicitDefaults = makeCellBlockGeos({ jointOcclusion: 0.14, wallTopOcclusion: 0.17, grooveDepthScale: 1 });
  const works = makeCellBlockGeos(WORKS_CELL_GEOMETRY_OPTIONS);
  try {
    assert.equal(works.length, defaults.length);
    for (let i = 0; i < defaults.length; i++) {
      const base = defaults[i];
      const alternate = works[i];
      for (const name of ['position', 'normal', 'uv', 'color', 'sfFacet']) {
        assert.deepEqual(base.attributes[name].array, explicitDefaults[i].attributes[name].array);
        assert.equal(base.attributes[name].count, alternate.attributes[name].count);
      }
      assert.deepEqual(base.attributes.sfFacet.array, alternate.attributes.sfFacet.array);
      assert.deepEqual(base.attributes.uv.array, alternate.attributes.uv.array);
      // The first four triangles are the face: preserve its location for inclusions and contact.
      assert.deepEqual(base.attributes.position.array.slice(0, 36), alternate.attributes.position.array.slice(0, 36));
      base.computeBoundingBox();
      alternate.computeBoundingBox();
      assert.equal(base.boundingBox.min.x, alternate.boundingBox.min.x);
      assert.equal(base.boundingBox.max.x, alternate.boundingBox.max.x);
      assert.equal(base.boundingBox.min.y, alternate.boundingBox.min.y);
      assert.equal(base.boundingBox.max.y, alternate.boundingBox.max.y);
      assert.ok(Math.min(...alternate.attributes.color.array) >= Math.min(...base.attributes.color.array));
      assert.ok(alternate.attributes.color.array.some((value, n) => value > base.attributes.color.array[n]));
    }
  } finally {
    for (const geo of [...defaults, ...explicitDefaults, ...works]) geo.dispose();
  }
});

test('the rock projection binds all surface-map channels to one shared UV window', () => {
  const mat = {};
  patchRockUvWindow(mat);
  const shader = {
    vertexShader: '#include <common>\n#include <uv_vertex>',
    fragmentShader: '#include <common>\n#include <normal_fragment_maps>',
  };
  mat.onBeforeCompile(shader);
  for (const channel of ['vMapUv', 'vNormalMapUv', 'vAoMapUv', 'vRoughnessMapUv', 'vMetalnessMapUv']) {
    assert.match(shader.vertexShader, new RegExp(`\\b${channel}\\s*=\\s*sfWin\\s*;`));
  }
  assert.match(shader.vertexShader, /instanceMatrix\s*\*\s*#endif\s*vec4\( position, 1\.0 \)/);
  assert.ok(mat.customProgramCacheKey().includes('sf-ast-rock-uv'));
});

test('damage stages appear only after damage and persist until the cell is empty', () => {
  assert.equal(worksBoreStage(null), -1);
  assert.equal(worksBoreStage({ type: 'rock', hp: 10, maxHp: 10 }), -1);
  const early = worksBoreStage({ type: 'rock', hp: 9, maxHp: 10 });
  const late = worksBoreStage({ type: 'rock', hp: 2, maxHp: 10 });
  assert.ok(early.stage < late.stage);
  assert.equal(worksBoreStage({ type: 'empty', hp: 0, maxHp: 10 }), -1);
});

test('a pooled contact pulse expires on frame time and reuse restores other event styling', () => {
  let scale = 0;
  const pulse = { t: 0, mat: { opacity: 0 }, mesh: { visible: true, scale: { setScalar(n) { scale = n; } } } };
  armWorksPulse(pulse, 0.22, true);
  advanceWorksPulse(pulse, 0.11, 1);
  const contactScale = scale;
  const contactOpacity = pulse.mat.opacity;
  assert.ok(contactScale > 0 && contactOpacity > 0);
  advanceWorksPulse(pulse, 0.11, 1);
  assert.equal(pulse.t, 0);
  assert.equal(pulse.mesh.visible, false);
  pulse.mesh.visible = true;
  armWorksPulse(pulse, 0.6);
  advanceWorksPulse(pulse, 0.3, 1);
  assert.ok(scale > contactScale);
  assert.ok(pulse.mat.opacity > contactOpacity);
  advanceWorksPulse(pulse, 0.3, 1);
  assert.equal(pulse.mesh.visible, false);
});
