import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { SpaceBackground } from '../src/render/spaceBackground.js';
import {
  smearStretch,
  VL_SMEAR_MAX,
  VL_SMEAR_MAX_STRETCH,
} from '../src/render/velocityLanguage.js';

function frameHarness(smear = 0) {
  const position = {
    x: 0,
    y: 0,
    z: 0,
    set(x, y, z) {
      this.x = x;
      this.y = y;
      this.z = z;
    },
  };
  const background = Object.create(SpaceBackground.prototype);
  Object.assign(background, {
    state: {
      render: {
        velocityLanguage: {
          schema: 'velocity_language_v1',
          drive: { parallaxGain: 0, smear },
          region: null,
        },
      },
    },
    bgTime: 0,
    camX: 0,
    camZ: 0,
    bgY: -220,
    group: { position },
    _streamPrimed: false,
    _streamCamX: 0,
    _streamCamZ: 0,
    _flowX: 0,
    _flowZ: 1,
    _smearFit: { stretch: -1, dim: -1 },
    layers: [],
    layerMaterial: null,
    stars: null,
    flares: null,
    planets: [],
    wormhole: null,
    structureMacro: null,
    structureCard: null,
    _computePerspScale: () => 500,
    _updateRegionTint() {},
    _updateComet() {},
    _refreshHeroes() {},
  });
  return background;
}

test('smearStretch keeps its allocating public result and supports one fully repainted output', () => {
  const legacyA = smearStretch(0.5);
  const legacyB = smearStretch(0.5);
  assert.notStrictEqual(legacyA, legacyB, 'one-argument callers still receive fresh records');
  assert.deepEqual(Object.keys(legacyA), ['stretch', 'dim']);
  assert.deepEqual(legacyA, {
    stretch: 1 + 0.5 * (VL_SMEAR_MAX_STRETCH - 1),
    dim: 1 / (1 + 0.5 * (VL_SMEAR_MAX_STRETCH - 1)),
  });

  const out = { stretch: -1, dim: -1 };
  assert.strictEqual(smearStretch(0.5, out), out);
  assert.deepEqual(out, legacyA);
  assert.strictEqual(smearStretch(Number.NaN, out), out);
  assert.deepEqual(out, { stretch: 1, dim: 1 }, 'invalid input repaints both fields neutral');
  assert.strictEqual(smearStretch(1e9, out), out);
  assert.deepEqual(out, {
    stretch: 1 + VL_SMEAR_MAX * (VL_SMEAR_MAX_STRETCH - 1),
    dim: 1 / (1 + VL_SMEAR_MAX * (VL_SMEAR_MAX_STRETCH - 1)),
  }, 'clamped input repaints both fields from the capped value');
});

test('SpaceBackground update retains exactly one smear result across changing frames', () => {
  const background = frameHarness(0.25);
  const retained = background._smearFit;

  background.update(1 / 60, 1 / 60, { x: 0, z: 0 });
  assert.strictEqual(background._smearFit, retained);
  assert.deepEqual(retained, smearStretch(0.25));

  background.state.render.velocityLanguage.drive.smear = Number.NaN;
  background.update(1 / 144, 2 / 60, { x: 1, z: -2 });
  assert.strictEqual(background._smearFit, retained);
  assert.deepEqual(retained, { stretch: 1, dim: 1 });

  for (let frame = 0; frame < 512; frame += 1) {
    background.state.render.velocityLanguage.drive.smear = (frame % 17) / 16;
    background.update(1 / 240, frame / 240, { x: frame * 0.1, z: -frame * 0.2 });
    assert.strictEqual(background._smearFit, retained);
    assert.deepEqual(Object.keys(retained), ['stretch', 'dim']);
  }
});

test('value noise preserves the exact shipped samples without a per-call hash closure', () => {
  const samples = [
    [0, 0, 0, 0.23606797284446657],
    [0, 0.25, 0.75, 0.25804498594561665],
    [1, -1.25, 2.5, 0.42833298133336939],
    [0xC0FFEE, 123.456, -78.9, 0.32710102069353958],
    [0xffffffff, 9999.125, 9999.875, 0.074940089623886763],
  ];
  const background = Object.create(SpaceBackground.prototype);
  for (const [seed, x, z, expected] of samples) {
    background.seed = seed;
    assert.equal(background._valueNoise(x, z), expected, `${seed}:${x}:${z}`);
  }

  const source = readFileSync(new URL('../src/render/spaceBackground.js', import.meta.url), 'utf8');
  const start = source.indexOf('  _valueNoise(x, z) {');
  const end = source.indexOf('\n  _updateComet(dt) {', start);
  assert(start >= 0 && end > start, 'the shipping value-noise method remains inspectable');
  const body = source.slice(start, end);
  assert.doesNotMatch(body, /=>|function\s*\(/,
    'the display-frame value-noise method must not allocate a hash closure');
  assert.match(source, /smearStretch\(smear, this\._smearFit\)/,
    'the display-frame smear path must use the retained caller-owned result');
  assert.equal((source.match(/this\._smearFit\s*=/g) || []).length, 1,
    'SpaceBackground owns exactly one smear result record for its lifetime');
});
