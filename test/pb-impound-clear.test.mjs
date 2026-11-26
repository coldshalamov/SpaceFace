// Seed 4242. The station fine card reports honest wanted decay/hold wording instead of a frozen
// static countdown. A clean heat value does not invent a clock or hold clause.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { fineWarrantDetail } from '../src/ui/impoundPayPrompt.js';

const SEED = 4242;

function state(heat, extra = {}) {
  return {
    meta: { seed: SEED },
    mode: 'flight',
    world: { currentSectorId: 'sector_helios_prime' },
    player: { heat, credits: 1000, ...extra.player },
    ui: { docked: false, ...extra.ui },
    ...extra.root,
  };
}

test('seed 4242 the fine card reports truthful decay or hold cause for wanted heat', () => {
  assert.equal(SEED, 4242);
  const heat = 0.2;
  const offer = { amount: 400, stationId: 'station_helios', status: 'open' };

  const dockedDetail = fineWarrantDetail(offer, state(heat, { ui: { docked: true } }));
  assert.ok(dockedDetail.includes('paused while docked'), dockedDetail);
  assert.match(dockedDetail, /Wire the 400 cr/);

  const escapingDetail = fineWarrantDetail(offer, state(heat, {
    player: {
      heatZone: {
        active: true, center: { x: 0, z: 0 }, radius: 1200, level: 1,
        outsideS: 2, clearAfterS: 5, sectorId: 'sector_helios_prime',
      },
    },
    root: { playerId: 1, entities: new Map([[1, { pos: { x: 1500, z: 0 } }]]) },
  }));
  assert.ok(escapingDetail.includes('clears in 3s'), escapingDetail);

  const clean = fineWarrantDetail(offer, state(0));
  assert.equal(clean.includes('clears in'), false);
  assert.equal(clean.includes('leave search zone'), false);
  assert.match(clean, /Wire the 400 cr/);
  const below = fineWarrantDetail(offer, state(0.14));
  assert.equal(below.includes('clears in'), false);
  assert.equal(below.includes('leave search zone'), false);
  const src = readFileSync(new URL('../src/ui/impoundPayPrompt.js', import.meta.url), 'utf8');
  assert.match(src, /detail:\s*fineWarrantDetail\(offer,\s*state\)/);
  assert.match(src, /wantedClearClause\(/);
});
