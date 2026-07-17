// 326 — Customs logic net. Lawful cutter + patrol interdiction on mid-sec lanes.
// Uses customs_cutter / patrol_lawman. Forced combat only if player is wanted elsewhere.
import { deepFreeze, defineEncounter } from './catalog.js';

export const encounterOrder = 326;
export const trigger = deepFreeze({
  id: 'customs_logic_net',
  tier: 'minor',
  deck: 'patrol',
  weight: 1.2,
  zoneTypes: ['border_checkpoint', 'trade_lane', 'civilian_core'],
  script: 'patrolScan',
  pressureCost: 30,
  cooldownS: 420,
  proximity: true,
  gates: {
    minSecurity: 0.35,
    maxSecurity: 0.95,
  },
});

export default defineEncounter(trigger, {
  motive: 'lawful_inspection',
  engagementTrigger: 'scan_failed_or_wanted',
  factionId: 'faction_scn',
  context: 'patrol',
  title: 'CUSTOMS LOGIC NET',
  primaryLine: 'CONCORD CUTTER: stand by for manifest verification. Ref 44-C. Non-compliance is logged.',
  squad: {
    archetypes: ['customs_cutter', 'patrol_lawman'],
    size: [1, 2],
    doctrine: 'official',
    formation: 'line',
  },
  bark: 'patrol_scan',
  offerS: 16,
  choices: [
    { id: 'comply', label: 'Hold for scan' },
    { id: 'bribe', label: 'Offer a fee', needs: 'credits' },
    { id: 'run', label: 'Break the cordon' },
  ],
  timeoutChoice: 'comply',
});
