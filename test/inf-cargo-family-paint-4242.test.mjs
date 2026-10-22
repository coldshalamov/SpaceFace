// Spore catalyst and a gate handshake paint as their own families.
// Seed 4242 is the run seed; the painter is pure.
import test from 'node:test';
import assert from 'node:assert/strict';
import { commodityPresentationFor } from '../src/data/commodities.js';

const SEED = 4242;

test('seed 4242: living samples and lattice credentials are not ordinary freight', () => {
  assert.equal(SEED, 4242);
  const spore = commodityPresentationFor('cmdty_spore_catalyst');
  const handshake = commodityPresentationFor('cmdty_gate_handshake');
  const classified = commodityPresentationFor('cmdty_classified_salvage');
  const ore = commodityPresentationFor('cmdty_ore_iron');

  assert.equal(spore.id, 'cargo-family-bioresource');
  assert.equal(spore.color, '#6ecf4a');
  assert.notEqual(spore.id, 'cargo-family-general');

  assert.equal(handshake.id, 'cargo-family-protocol');
  assert.equal(handshake.color, '#7f8cff');
  assert.notEqual(handshake.id, 'cargo-family-general');
  assert.notEqual(handshake.color, spore.color);

  assert.equal(classified.id, 'cargo-family-salvage');
  assert.equal(ore.id, 'cargo-family-raw');
  assert.notEqual(ore.color, spore.color);
});
