// 323 — THE WRONG LAUGH. Scorsese steal: a salvage scene where an NPC laughs at the
// wrong detail, revealing complicity. The laugh is the moral x-ray — what a person
// finds funny shows who they are, and the funny thing here is a death. Not cruelty
// played for shock; cruelty metabolized as a coping mechanism the laugher can't afford.
import { deepFreeze, defineEncounter } from './catalog.js';
import { E1_ENCOUNTER_RUNTIMES } from '../../systems/e1EncounterRuntime.js';

export const encounterOrder = 323;
export const trigger = deepFreeze({
  id: 'side_wrong_laugh', tier: 'minor', deck: 'mystery', weight: 0.5,
  zoneTypes: ['derelict_field'], script: 'selfRegistered',
  pressureCost: 18, cooldownS: 86400, proximity: true,
  gates: { uniqueOnce: true, storyBeatMin: 4 },
});
export const runtime = E1_ENCOUNTER_RUNTIMES.h9;
export default defineEncounter(trigger, {
  title: 'THE WRONG LAUGH', factionId: 'faction_mts', noCombat: true,
  primaryLine: 'SALVAGER: Sorry. Sorry. It\'s the manifest. Cargo line says RELIEF SUPPLIES. Fourteen tonnes. The wreck\'s been here six months. Nobody\'s looking for fourteen tonnes of relief. [He laughs. He stops.]',
  choices: [
    { id: 'split',  label: 'Split the salvage',      playerLine: 'Half and half.' },
    { id: 'report', label: 'Report the manifest',    playerLine: 'I\'m filing this.' },
    { id: 'walk',   label: 'Walk away from the laugh', playerLine: 'Keep it. I\'m gone.' },
  ],
  timeoutChoice: 'walk',
  receipts: {
    split:  'SALVAGE SPLIT — 7t RELIEF SUPPLIES. The salvager stops laughing. Counts the cut. Does not thank you. Does not stop counting.',
    report: 'MANIFEST REPORTED — routed to Concord under REF 44-C. The wreck is flagged. The flag is filed. The salvager is already at the next wreck, laughing at something else.',
    walk:   'SALVAGE LEFT — the salvager stays. You go. The laugh does not come with you. The manifest does.',
  },
  graffitiOn: {
    report: { line: 'RELIEF SUPPLIES. FOURTEEN TONNES. NOBODY\'S LOOKING.', where: 'bulkhead' },
  },
});
