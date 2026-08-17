import assert from 'node:assert/strict';
import test from 'node:test';

import {
  defaultShipAppearance,
  normalizeShipAppearance,
  paletteWithShipAppearance,
  shipAppearanceSignature,
} from '../src/core/shipAppearance.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';

test('legacy ships receive a stable non-destructive appearance record', () => {
  const appearance = defaultShipAppearance('ship_kestrel');

  assert.deepEqual(appearance, {
    version: 1,
    hullColor: null,
    accentColor: null,
    finish: 'worn',
    wear: 0.55,
    decalId: 'borrowed_time',
  });
  assert.equal(Object.isFrozen(appearance), true);
});

test('appearance normalization accepts safe colors and rejects unstable fields', () => {
  const appearance = normalizeShipAppearance({
    version: 99,
    hullColor: '#A1b2C3',
    accentColor: '39d0ff',
    finish: 'mirror',
    wear: 4,
    decalId: '../../bad',
    surprise: true,
  }, 'ship_kestrel');

  assert.deepEqual(appearance, {
    version: 1,
    hullColor: '#a1b2c3',
    accentColor: '#39d0ff',
    finish: 'worn',
    wear: 1,
    decalId: 'borrowed_time',
  });
});

test('dock-baked wreck silhouettes are bounded and stay absent from untouched save payloads', () => {
  assert.equal('decalKillMarks' in normalizeShipAppearance(null, 'ship_kestrel'), false);
  assert.equal(normalizeShipAppearance({ decalKillMarks: 99 }, 'ship_kestrel').decalKillMarks, 13);
  assert.equal('decalKillMarks' in normalizeShipAppearance({ decalKillMarks: -4 }, 'ship_kestrel'), false);
  assert.notEqual(
    shipAppearanceSignature({ decalKillMarks: 3 }, 'ship_kestrel'),
    shipAppearanceSignature({ decalKillMarks: 4 }, 'ship_kestrel'),
  );
});

test('appearance palette overrides only declared colors and carries finish identity', () => {
  const base = { hull: '#808090', accent: '#a0eef8', thruster: '#60d8ee', dark: '#206070' };
  const entity = { data: { appearance: { hullColor: '#334455', finish: 'polished', wear: 0.1 } } };
  const result = paletteWithShipAppearance(entity, base);

  assert.deepEqual(result, {
    ...base,
    hull: '#334455',
    finish: 'polished',
    wear: 0.1,
    appearanceHullOverride: true,
    appearanceAccentOverride: false,
  });
  assert.notEqual(shipAppearanceSignature(entity.data.appearance), shipAppearanceSignature(null));
});

test('spawn specs carry normalized appearance into the render-facing entity record', () => {
  const spec = makeShipEntitySpec('ship_kestrel', {
    isPlayer: true,
    appearance: { hullColor: '#112233', finish: 'polished', wear: 0.05 },
  });

  assert.deepEqual(spec.data.appearance, {
    version: 1,
    hullColor: '#112233',
    accentColor: null,
    finish: 'polished',
    wear: 0.05,
    decalId: 'borrowed_time',
  });
});
