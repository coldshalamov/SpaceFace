import { deepFreeze, defineEncounter } from './catalog.js';
import { RARE_SPAWN_RUNTIMES } from '../../systems/rareSpawnRuntime.js';

export const encounterOrder = 357;
export const trigger = deepFreeze({
  id: 'rare_gold_asteroid', tier: 'minor', deck: 'combat', weight: 0.07, rare: true,
  zoneTypes: ['mining_belt', 'dense_asteroid', 'refinery_approach'],
  script: 'selfRegistered', pressureCost: 48, cooldownS: 86_400, proximity: true,
});
export const runtime = RARE_SPAWN_RUNTIMES.goldAsteroid;
export default defineEncounter(trigger, {
  factionId: 'faction_reach',
  motive: 'claim_the_gold_core',
  engagementTrigger: 'gold_claim_contested',
  title: 'GOLD ASTEROID',
  primaryLine: 'ASSAY SPIKE: one gold body, pirate claimants, and a jackpot core under the shell.',
  rareRumor: {
    kind: 'vein', kindLabel: 'Gold Assay Whisper', targetName: 'unregistered gold assay',
    radius: 760,
    text: 'Prospector chatter narrows a gold assay to an amber search ring. The rock and whoever reached it first are both real.',
  },
  receipts: {
    jackpot_core_exposed: 'GOLD CORE EXPOSED — 48 units broke loose while pirate claimants closed.',
  },
});
