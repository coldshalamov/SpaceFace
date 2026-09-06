import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { recommendMissionBoardOffer } from '../src/ui/station/stationMissionModel.js';

const source = readFileSync(new URL('../src/ui/station/stationMissionModel.js', import.meta.url), 'utf8');

function mission(overrides = {}) {
  return {
    id: overrides.id || 'mission_offer',
    type: 'cargo_delivery',
    title: 'Starter Delivery',
    factionId: 'faction_mts',
    reward_cr: 900,
    collateral_cr: 0,
    riskTier: 0,
    time_limit_s: 900,
    destStationId: 'station_beltout',
    destSectorId: 'sector_ceres_belt',
    distance: 800,
    params: { cmdtyId: 'cmdty_gas_hydrogen', qty: 1, taskTime: 30 },
    ...overrides,
  };
}

function state({ capVolume = 20, usedVolume = 0, credits = 1000, onboarding = null } = {}) {
  return {
    simTime: 0,
    world: { currentSectorId: 'sector_helios_prime' },
    player: {
      credits,
      cargo: { items: {}, usedVolume, usedMass: 0, capVolume, capMass: 100 },
    },
    missions: {
      active: [],
      config: { maxActive: 8, cruiseSpeedRef: 140 },
    },
    onboarding,
  };
}

assert.match(source, /export function recommendMissionBoardOffer/,
  'station mission model must expose a direct-testable mission recommendation policy');
assert.match(source, /Accept Recommended/,
  'mission recommendation should offer a clear accept CTA when the pick is ready');

let rec = recommendMissionBoardOffer([
  mission({ id: 'risky_bounty', type: 'bounty_hunt', title: 'Risky Bounty', reward_cr: 6000, riskTier: 4, params: {} }),
  mission({ id: 'starter_delivery', title: 'Starter Delivery', reward_cr: 900, riskTier: 0 }),
], state());
assert.equal(rec.missionId, 'starter_delivery',
  'recommendation should prefer clean low-risk starter work over high-risk pay bait');
assert.equal(rec.state, 'ready');
assert.equal(rec.disabled, false);
assert.equal(rec.label, 'RECOMMENDED',
  'ready picks expose a compact scannable RECOMMENDED label');
assert.equal(rec.actionLabel, 'Accept Recommended',
  'ready picks expose the accept CTA label for the board control');
assert.match(rec.reason, /ready now/i);
assert.match(rec.reason, /Risk 0/);

rec = recommendMissionBoardOffer([
  mission({ id: 'early_risk2', type: 'bounty_hunt', title: 'Early Risk 2', reward_cr: 5200, riskTier: 2, params: {} }),
  mission({ id: 'early_safe', title: 'Early Safe', reward_cr: 650, riskTier: 1 }),
], state({ onboarding: { active: true, finished: false, beatDoneAt: {} } }));
assert.equal(rec.missionId, 'early_safe',
  'first-loop recommendation should prefer Risk 0-1 work before elevated combat is taught');
assert.equal(rec.disabled, false);
assert.doesNotMatch(rec.reason, /Risk 2/);

rec = recommendMissionBoardOffer([
  mission({ id: 'only_risk2', type: 'bounty_hunt', title: 'Only Risk 2', reward_cr: 5200, riskTier: 2, params: {} }),
], state({ onboarding: { active: true, finished: false, beatDoneAt: {} } }));
assert.equal(rec.missionId, 'only_risk2',
  'first-loop recommendation should still surface the best available prep target');
assert.equal(rec.disabled, true,
  'first-loop elevated work should be prep-gated instead of recommended when no safe work exists');
assert.equal(rec.label, 'PREP FIRST');
assert.match(rec.reason, /Risk 0-1/);

const cargoCautionState = state({ capVolume: 5, usedVolume: 3 });
cargoCautionState.ui = { dockedStationId: 'station_helios' };
cargoCautionState.economy = {
  markets: { station_helios: { cmdty_gas_hydrogen: { stock: 0, lastBuy: 20 } } },
};
rec = recommendMissionBoardOffer([
  mission({ id: 'blocked_bulk', title: 'Blocked Bulk', params: { cmdtyId: 'cmdty_gas_hydrogen', qty: 3 } }),
  mission({ id: 'check_supply_first', title: 'Check Supply First', type: 'bulk_trade', riskTier: 1, params: { cmdtyId: 'cmdty_gas_hydrogen', qty: 1 } }),
], cargoCautionState);
assert.equal(rec.missionId, 'check_supply_first',
  'recommendation should choose a caution offer over an impossible one-load cargo blocker');
assert.equal(rec.state, 'caution');
assert.equal(rec.disabled, false);
assert.match(rec.reason, /Strong pick after one check/i);
assert.match(rec.reason, /not stocking enough|another source/i);

rec = recommendMissionBoardOffer([
  mission({ id: 'too_big', title: 'Too Big', params: { cmdtyId: 'cmdty_gas_hydrogen', qty: 3 } }),
], state({ capVolume: 1, usedVolume: 0 }));
assert.equal(rec.missionId, 'too_big',
  'when every offer is blocked, recommendation should still name the best prep target');
assert.equal(rec.state, 'blocked');
assert.equal(rec.disabled, true);
assert.equal(rec.label, 'PREP FIRST');
assert.match(rec.reason, /Need 7\.5u cargo capacity for this contract/);

rec = recommendMissionBoardOffer([
  mission({ id: '', title: 'Missing Id' }),
], state());
assert.equal(rec, null,
  'recommendation should not render a CTA for a malformed offer without an id');

console.log('Mission board recommendation OK - station board names the best next contract or prep blocker.');
