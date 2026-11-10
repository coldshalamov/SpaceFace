// Direct-only R2 encounter hook. The Choir-Tender's `report_or_loot` complication requests it
// when a pilot claims the relief wreck: an SCN salvage investigator holds station over the
// recovery site and offers the same choice the complication already names — file the claim
// with relief control, or keep the goods and take the adverse filing.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 343;
export const trigger = deepFreeze({
  id: 'unique_wreck_choir_tender_investigator',
  tier: 'minor',
  deck: 'combat',
  weight: 0,
  zoneTypes: [],
  script: 'uniqueWreckChoirTenderInvestigator',
  pressureCost: 40,
  cooldownS: 1800,
  proximity: false,
  gates: {
    uniqueWreckOnly: true,
    uniqueWreckId: 'wreck_choir_tender',
  },
});
export default defineEncounter(trigger, {
  shape: {
    situation: 'wreck',
    place: trigger.zoneTypes,
    twist: 'unique_wreck',
    actor: 'faction_scn',
  },
  triggerKind: 'salvage_investigator',
  motive: 'audit_relief_claim',
  engagementTrigger: 'unique_wreck_salvage_claimed',
  factionId: 'faction_scn',
  context: 'encounter',
  title: 'RELIEF CLAIM AUDIT',
  primaryLine: 'SCN SALVAGE AUDIT: Relief-freighter Choir-Tender recovery claim under review.',
  choices: [
    { id: 'report', label: 'File the relief claim', playerLine: 'The recovery goes on record with relief control.' },
    { id: 'loot', label: 'Keep the recovery', playerLine: 'The cargo and the swarm stay in my hold.' },
  ],
  timeoutChoice: 'loot',
  squad: {
    archetypes: ['customs_cutter'],
    size: [1, 1],
    doctrine: 'standoff',
    formation: 'loose',
  },
  bossName: 'SCN SALVAGE INVESTIGATOR',
  telegraph: 'An SCN customs cutter holds station over the Choir-Tender recovery beacon, audit channel open.',
  windowS: 240,
  receipts: {
    reported: 'RELIEF CLAIM FILED — SCN acknowledges the Choir-Tender recovery.',
    adverse: 'ADVERSE FILING — the relief claim stays with you; the record says otherwise.',
  },
});
