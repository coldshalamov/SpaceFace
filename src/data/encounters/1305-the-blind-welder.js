// THE BLIND WELDER — a sensor-dead repair barge in the Vesta Forge slag field hails
// on the radio band (build_map §30 VIG-01). Tow her slow along the station strut so her
// fixed welder arc traces three cracked seams, holding relative speed under the gate.
// Self-registered; the runtime owns the barge, the seams, and the honest endings.
import { deepFreeze, defineEncounter } from './catalog.js';
import { BLIND_WELDER_RUNTIME } from '../../systems/blindWelderRuntime.js';

export const encounterOrder = 1305;
export const trigger = deepFreeze({
  id: 'the_blind_welder', tier: 'ambient', deck: 'civilian', weight: 0.5,
  zoneTypes: ['radiation_field'], script: 'selfRegistered', pressureCost: 6,
  cooldownS: 900, proximity: true, rare: true,
  gates: { sectorIds: ['sector_vesta_forge'] },
});
export const runtime = BLIND_WELDER_RUNTIME;
export default defineEncounter(trigger, {
  shape: {
    situation: 'distress',
    place: 'radiation_field',
    twist: 'named',
    actor: 'faction_dmc',
  },
  title: 'THE BLIND WELDER', factionId: 'faction_dmc',
  motive: 'three seams must hold before the field takes the strut',
  primaryLine: 'YARD BARGE: Eyes dead, arc live. Take a line and walk me slow along the strut — '
    + 'three cracked seams, gentle feet, and the yard covers your scars for free.',
  choices: [
    {
      id: 'tow',
      label: 'Take the line — tow her slow along the strut',
      playerLine: 'Easy tow. I will walk you seam to seam.',
    },
    {
      id: 'pass',
      label: 'Fly on — the field can wait for a slower lane',
      playerLine: 'Not my weld.',
    },
  ],
  timeoutChoice: 'pass',
  receipts: {
    welded: 'THREE SEAMS WELDED — the strut holds. Scars covered free; the bow carries the weld mark.',
    sheared: 'THE LINE SHEARS — too fast across the seam. She drifts on, waiting for a slower tow.',
    passed: 'The barge dwindles in the slag glow, still calling on the band.',
    drifted: 'The band goes quiet. She drifts on, cold and patient.',
    lost: 'The Blind Welder is gone from the band.',
  },
});
