// THE DRIFT AUCTION — a salvage scow in a lawless pocket with three tethered
// mystery containers and circling rival scavengers (build_map §30.3 VIG-03).
// No menu: flash a scanner pulse to bid, peek a crate's true lot to bait a
// rival into the dud — or cut the tether and run the crossfire. Self-registered;
// the runtime owns the scow, the crates, the bids, and the honest endings.
import { deepFreeze, defineEncounter } from './catalog.js';
import { DRIFT_AUCTION_RUNTIME } from '../../systems/driftAuctionRuntime.js';

export const encounterOrder = 1306;
export const trigger = deepFreeze({
  id: 'the_drift_auction', tier: 'ambient', deck: 'civilian', weight: 0.5,
  zoneTypes: ['derelict_field'], script: 'selfRegistered', pressureCost: 6,
  cooldownS: 900, proximity: true, rare: true,
  gates: { sectorIds: ['sector_pallas_drift'] },
});
export const runtime = DRIFT_AUCTION_RUNTIME;
export default defineEncounter(trigger, {
  shape: {
    situation: 'salvage',
    place: 'derelict_field',
    twist: 'named',
    actor: 'faction_quiet',
  },
  title: 'THE DRIFT AUCTION', factionId: 'faction_quiet',
  motive: 'three tethered crates, two hungry rivals, no law within a long listen',
  primaryLine: 'SCOW: Three crates on tethers, two haulers circling, no law in this pocket. '
    + 'Pulse a crate to bid — or cut a line and run the crossfire. I take pulses, not paper.',
  choices: [],
  receipts: {
    sold: 'GAVEL FALLS — the top pulse takes the crate. Salvage changes hands with no paper.',
    stolen: 'THE LINE GOES TAUT — the crate leaves on a cut tether and the pocket settles it with guns.',
    unsold: 'No pulses. The lot drifts on, still tethered, still nobody\u2019s.',
    drifted: 'The pocket stops watching. The scow keeps her crates.',
    lost: 'The Drift Auction is gone from the band.',
  },
});
