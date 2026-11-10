import assert from 'node:assert/strict';

import { claims } from '../src/systems/claims.js';

function makeCtx(playerPatch = {}, claimsPatch = {}) {
  const toasts = [];
  const events = [];
  const state = {
    claims: { bodies: [], ...claimsPatch },
    player: {
      credits: 0,
      researchedNodes: [],
      cargo: { items: {} },
      ...playerPatch,
    },
    world: { currentSectorId: 'sector_helios_prime' },
    entityList: [],
  };
  const bus = {
    emit(event, payload) {
      events.push({ event, payload });
      if (event === 'toast') toasts.push(payload);
    },
  };
  claims.init({ state, bus, ctx: {} });
  return { state, toasts, events };
}

let ctx = makeCtx({ credits: 1000 });
assert.equal(claims.claim({ id: 'poi_arden', name: 'Arden Moon', size: 'M' }), false);
assert.equal(ctx.toasts.at(-1).text, 'Need 14,000 more cr to claim Arden Moon');
assert.doesNotMatch(ctx.toasts.at(-1).text, /15000|credits/);

ctx = makeCtx(
  { credits: 1000, researchedNodes: ['tech_deep_core_mining'] },
  { bodies: [{ id: 'claim_1', poiId: 'poi_arden', name: 'Arden Moon', modules: [], slots: 3 }] },
);
assert.equal(claims.buildModule('claim_1', 'mod_refinery'), false);
assert.equal(ctx.toasts.at(-1).text, 'Need 11,000 more cr for On-Site Refinery');
assert.doesNotMatch(ctx.toasts.at(-1).text, /12000|credits/);

console.log('Claims guidance OK - direct claim/base blockers show missing credits and target names.');
