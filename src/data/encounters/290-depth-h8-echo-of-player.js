// E1/H8 self-registering mirror-course encounter. Course matching is measured in sim XZ space.
import { deepFreeze, defineEncounter } from './catalog.js';
import { E1_ENCOUNTER_RUNTIMES } from '../../systems/e1EncounterRuntime.js';

export const encounterOrder = 290;
export const trigger = deepFreeze({
  id: 'depth_h8_echo_of_player', tier: 'major', deck: 'civilian', weight: 1,
  zoneTypes: ['anomaly_deep'], script: 'selfRegistered', pressureCost: 25, cooldownS: 86400,
  proximity: true, gates: { uniqueOnce: true, storyBeatMin: 7 },
});
export const runtime = E1_ENCOUNTER_RUNTIMES.h8;
export default defineEncounter(trigger, {
  title: 'THE ECHO OF THE PLAYER', factionId: 'faction_free', context: 'convoy_civilian',
  squad: {
    archetypes: ['mule_trader'], size: [1, 1], doctrine: 'balanced', formation: 'loose', passive: true,
  },
  primaryLine: 'TESSERA: your signature is ahead, flying your course backward.',
  choices: [
    { id: 'hail', label: 'Answer your own hail' }, { id: 'break', label: 'Break it' },
  ],
  timeoutChoice: null,
  mirrorCourse: { simCoordinates: true, durationS: 6, maxPositionError: 80, maxVelocityError: 18 },
  receipts: {
    synced: 'ECHO SYNCED — Vols left one more order.',
    hailed: 'ECHO ANSWERED — your own earlier words return.',
    shattered: 'ECHO SHATTERED — sensor ghosts scatter.',
  },
});
