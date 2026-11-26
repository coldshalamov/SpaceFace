import { deepFreeze, defineEncounter } from './catalog.js';
import { SWITCHBACK, SWITCHBACK_BRIEF, SWITCHBACK_CHOICES, SWITCHBACK_RECEIPTS } from '../../features/convoyRaid/catalog.js';
import { SWITCHBACK_ENCOUNTER_RUNTIME } from '../../features/convoyRaid/encounter.js';

export const encounterOrder = 8103;
export const trigger = deepFreeze({
  id: SWITCHBACK.encounterId, tier: 'ambient', deck: 'civilian', weight: 1,
  // An empty planner zone set makes this direct-entry-only. requestAuthoredEncounter supplies the
  // actual Ceres mining_belt zone and still applies ordinary pacing and eligibility checks.
  zoneTypes: [], script: 'selfRegistered', pressureCost: 8, cooldownS: 1800, proximity: true,
  gates: { sectorIds: [SWITCHBACK.sectorId], uniqueOnce: true },
});
export const runtime = SWITCHBACK_ENCOUNTER_RUNTIME;
export default defineEncounter(trigger, {
  shape: { situation: 'convoy', place: 'mining_belt', twist: 'named', actor: 'faction_dmc' },
  title: SWITCHBACK.title, factionId: SWITCHBACK.factionId,
  motive: 'keep the spindle carrier coupled through the outer belt',
  primaryLine: SWITCHBACK_BRIEF, choices: SWITCHBACK_CHOICES, timeoutChoice: 'decline',
  receipts: { ...SWITCHBACK_RECEIPTS, unavailable: 'No departure, freight, or payment was created.' },
});
