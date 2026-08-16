import { deepFreeze, defineEncounter } from './catalog.js';
import { RARE_SPAWN_RUNTIMES } from '../../systems/rareSpawnRuntime.js';

export const encounterOrder = 358;
export const trigger = deepFreeze({
  id: 'rare_merchant_prince', tier: 'major', deck: 'civilian', weight: 0.045, rare: true,
  zoneTypes: ['trade_lane', 'civilian_core', 'refinery_approach'],
  script: 'selfRegistered', pressureCost: 82, cooldownS: 86_400, proximity: true,
});
export const runtime = RARE_SPAWN_RUNTIMES.merchantPrince;
export default defineEncounter(trigger, {
  factionId: 'faction_meridian',
  motive: 'move_a_luxury_manifest_under_guard',
  engagementTrigger: 'merchant_prince_contact',
  title: 'THE MERCHANT PRINCE',
  primaryLine: 'LUXURY CONVOY: the Prince is over-lit, fully manifested, and guarded by ships with working guns.',
  choices: [
    { id: 'guard', label: 'Guard the Prince' },
    { id: 'rob', label: 'Rob the convoy' },
    { id: 'pass', label: 'Let it pass' },
  ],
  timeoutChoice: 'pass',
  rareRumor: {
    kind: 'cache', kindLabel: 'Luxury Convoy Ledger', targetName: 'Merchant Prince convoy',
    radius: 880,
    text: 'A gilded manifest is crossing this region under real escort. The card blurs the lane; it does not invent the cargo.',
  },
  receipts: {
    prince_guarded: 'MERCHANT PRINCE GUARDED — 14,000 CR and Meridian standing paid.',
    prince_robbed: 'MERCHANT PRINCE ROBBED — luxury and art manifests broke loose in space.',
    passed: 'MERCHANT PRINCE PASSED — the convoy kept its impossible shine.',
  },
});
