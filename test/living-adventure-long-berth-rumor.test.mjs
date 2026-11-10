import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { frontierRumorOffer } from '../src/data/frontierRumors.js';
import { buildReply } from '../src/ui/station/barContacts.js';

test('Ceres barkeeper points to the physical Long Berth and keeps its daily card available', () => {
  const state = createGameState(4707);
  const reply = buildReply('barkeep', 'rumors', { state }, 'station_ceres');

  assert.match(reply.text, /The Long Berth/);
  assert.match(reply.text, /Ceres Refinery/);
  assert.match(reply.text, /Massline her and pull her clear/);
  assert.deepEqual(reply.frontierRumorOffer, frontierRumorOffer(state, 'station_ceres'));
  assert.ok(reply.frontierRumorOffer, 'the normal purchasable card remains available with the local lead');
});
