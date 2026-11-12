// The catalogue route points to the same persistent workshop used by ordinary flight discovery.
import { deepFreeze, defineEncounter } from './catalog.js';
import { rigWorkshopEncounter } from '../../features/rigWorkshop/runtime.js';

export const encounterOrder = 8202;
export const trigger = deepFreeze({ id: 'pro_rig_workshop', tier: 'ambient', deck: 'civilian', weight: 1,
  zoneTypes: ['civilian_core', 'refinery_approach', 'trade_lane'], script: 'selfRegistered',
  pressureCost: 0, cooldownS: 1800, proximity: true, gates: { deferDuringGuidedOnboarding: true } });
export const runtime = rigWorkshopEncounter;
export default defineEncounter(trigger, {
  shape: { situation: 'yard', place: trigger.zoneTypes, twist: 'none', actor: 'faction_free' },
  factionId: 'faction_free', context: 'encounter', noCombat: true, noCredits: true,
  title: 'RATCHET · Physical Rig Workshop',
  primaryLine: 'RATCHET: Two loan machines. Six sorts of part. Bring back something useful, preferably in one piece.',
});
