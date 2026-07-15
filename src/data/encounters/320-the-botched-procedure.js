// 320 — THE BOTCHED PROCEDURE. Gilligan steal: a crew "solved" a vacuum leak with the
// worst possible material. Competent plan, one lethal detail. The humor is in the
// procedure followed correctly except for the part that kills you. No quips; the
// wreck's repair log is the joke, and the joke is a confession of competence.
import { deepFreeze, defineEncounter } from './catalog.js';
import { E1_ENCOUNTER_RUNTIMES } from '../../systems/e1EncounterRuntime.js';

export const encounterOrder = 320;
export const trigger = deepFreeze({
  id: 'side_botched_procedure', tier: 'minor', deck: 'mystery', weight: 0.6,
  zoneTypes: ['derelict_field'], script: 'selfRegistered',
  pressureCost: 15, cooldownS: 86400, proximity: true,
  gates: { uniqueOnce: true, storyBeatMin: 2 },
});
export const runtime = E1_ENCOUNTER_RUNTIMES.h9;
export default defineEncounter(trigger, {
  title: 'THE BOTCHED PROCEDURE', factionId: 'faction_free', noCombat: true,
  primaryLine: 'DERELICT LOG: Hull breach sealed with sealant compound. Sealant rated: non-reactive atmospheres. Hull atmosphere at breach: hydrogen-sulfide trace. Sealant holding.',
  choices: [
    { id: 'read',  label: 'Read the full repair log', playerLine: 'Read it.' },
    { id: 'take',  label: 'Take the sealant canister', playerLine: 'Take it.' },
    { id: 'leave', label: 'Leave it sealed',          playerLine: 'Leave it.' },
  ],
  timeoutChoice: 'leave',
  receipts: {
    read:  'REPAIR LOG READ — crew sealed a hull breach with sealant rated against the very gas they were losing. The seal held. The crew did not.',
    take:  'SEALANT RECOVERED — mismatched to every hull you fly. One canister. Marked INERT. It is not.',
    leave: 'DERELICT LEFT — the seal holds. The log holds. Neither admits the other.',
  },
  graffitiOn: {
    read: { line: 'THEY FIXED THE LEAK. THE FIX WAS THE LEAK.', where: 'bulkhead' },
  },
});
