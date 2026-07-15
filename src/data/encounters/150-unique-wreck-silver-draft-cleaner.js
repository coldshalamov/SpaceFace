// Direct-only R2 encounter hook. Silver-Draft's seeded sim-time deadline requests it explicitly.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 150;
export const trigger = deepFreeze({
  id: 'unique_wreck_silver_draft_cleaner',
  tier: 'minor',
  deck: 'combat',
  weight: 0,
  zoneTypes: [],
  script: 'uniqueWreckSilverDraftCleaner',
  pressureCost: 45,
  cooldownS: 1200,
  proximity: false,
  gates: {
    uniqueWreckOnly: true,
    uniqueWreckId: 'wreck_mts_silver_draft',
  },
});
export default defineEncounter(trigger, {
  triggerKind: 'seeded_cleaner',
  motive: 'sanitize_lost_ledger',
  engagementTrigger: 'unique_wreck_cleaner_deadline',
  factionId: 'faction_mts',
  context: 'encounter',
  squad: {
    archetypes: ['lancer_sniper'],
    size: [1, 1],
    doctrine: 'standoff',
    formation: 'loose',
  },
  bossName: 'MERIDIAN CLEANER',
  telegraph: 'A Meridian transponder goes dark as its weapons lock the Silver-Draft ledger.',
  windowS: 300,
});
