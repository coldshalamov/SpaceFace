// THE RUNAWAY KILN — an unmanned crucible drifting ballistic on the Vesta Forge depot
// ring (build_map §30.3 VIG-02). No offer, no timer: the load is already moving when
// the hail arrives. The only save is physical — rope, Mass Seed anchors, or a Twin
// Bridle bleeding the vector down; guns are a real detonation ending. Self-registered;
// the runtime owns the crucible, the bleed, and the four honest endings.
import { deepFreeze, defineEncounter } from './catalog.js';
import { RUNAWAY_KILN_RUNTIME } from '../../systems/runawayKilnRuntime.js';

export const encounterOrder = 1301;
export const trigger = deepFreeze({
  id: 'the_runaway_kiln', tier: 'ambient', deck: 'civilian', weight: 0.5,
  zoneTypes: ['refinery_approach'], script: 'selfRegistered', pressureCost: 8,
  cooldownS: 1800, proximity: true, rare: true,
  gates: { sectorIds: ['sector_vesta_forge'], blockAfterOutcome: 'saved' },
});
export const runtime = RUNAWAY_KILN_RUNTIME;
export default defineEncounter(trigger, {
  shape: {
    situation: 'distress',
    place: 'refinery_approach',
    twist: 'named',
    actor: 'faction_choir',
  },
  title: 'THE RUNAWAY KILN', factionId: 'faction_choir',
  motive: 'the ring must not take the load',
  primaryLine: 'DEPOT THREE: Unmanned crucible on our ring, drive cold, answering nothing. '
    + 'She is full of molten glass — guns will light her. Slow her down before she arrives.',
  receipts: {
    saved: 'CRUCIBLE CAUGHT — vector bled dead short of the ring. +320 cr; the depot remembers.',
    impact: 'THE LOAD MEETS THE RING — the scorch will outlive the paperwork.',
    detonated: 'DETONATION LOGGED — the glass goes everywhere and nowhere useful.',
    drifted: 'The lane stops watching. The crucible keeps her vector.',
    lost: 'CRUCIBLE NINE-ARM is gone from the band.',
  },
});
