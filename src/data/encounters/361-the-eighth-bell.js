// THE EIGHTH BELL — a Choir chapel-barge dead on the Vesta Forge approach, still hauling
// the pilgrimage bell it can no longer deliver. The bell is a real tetherable body: cut
// her loose and haul her to the Resonant Cathedral and she tolls — loudly — under speed.
// Self-registered; the runtime owns the cast, the tolls, and the three honest endings.
import { deepFreeze, defineEncounter } from './catalog.js';
import { EIGHTH_BELL_RUNTIME } from '../../systems/eighthBellRuntime.js';

export const encounterOrder = 361;
export const trigger = deepFreeze({
  id: 'the_eighth_bell', tier: 'ambient', deck: 'civilian', weight: 0.5,
  zoneTypes: ['refinery_approach'], script: 'selfRegistered', pressureCost: 6,
  cooldownS: 900, proximity: true, rare: true,
  gates: { sectorIds: ['sector_vesta_forge'], blockAfterOutcome: 'berthed' },
});
export const runtime = EIGHTH_BELL_RUNTIME;
export default defineEncounter(trigger, {
  shape: {
    situation: 'distress',
    place: 'refinery_approach',
    twist: 'named',
    actor: 'faction_choir',
  },
  title: 'THE EIGHTH BELL', factionId: 'faction_choir',
  motive: 'the bell must reach the arch',
  primaryLine: 'SERAPH CANTOR: Drive is cold and the Eighth Bell is forty years late to her arch. '
    + 'Take a line and the whole lane hears her sing — or the Forge sells a tug.',
  choices: [
    {
      id: 'vow',
      label: 'Take the line — tow the bell to the Cathedral arch',
      playerLine: 'I\u2019ll ring her home.',
    },
    {
      id: 'hire',
      label: 'Wire 260 cr — a Forge yard tug finishes the last leg',
      needs: 'credits',
      playerLine: 'The Forge can carry this verse.',
    },
    {
      id: 'pass',
      label: 'Fly on — the Choir will wait for a kinder lane',
      playerLine: 'Not my hymn.',
    },
  ],
  timeoutChoice: 'pass',
  receipts: {
    berthed: 'EIGHTH BELL BERTHED — the Cathedral sings back. +240 cr; the Choir remembers.',
    hired: 'YARD TUG PAID — the Eighth Bell rides company iron the last leg.',
    passed: 'The procession dwindles astern, still silent.',
    drifted: 'The lane goes quiet. The bell keeps waiting for a line.',
    desecrated: 'DESECRATION LOGGED — the Choir keeps ledgers too.',
    lost: 'The Eighth Bell is gone from the lane.',
  },
});
