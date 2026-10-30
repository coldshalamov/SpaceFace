// ui-bench fixture: the impound lot's attendant desk on Shipworks.
//   impound: 'lot'    — a used hull on this yard's lot, the block open, a filed claim and a kin
//                       redemption pending, Shipworks opened on that hull in Buy mode.
//   impound: 'ransom' — the active hull is a bought marked hull and the kin's paper offer
//                       stands at this berth, Shipworks opened on it in Fleet mode.
// Both go through the lot's own public seams (postImpoundListing, mintImpoundShadow); the desk
// keys on the bench then emit the same `impoundLot:deskIntent` the game does.
import { ensureImpoundLotWiring, postImpoundListing } from '../src/systems/impoundLot.js';
import { mintImpoundShadow } from '../src/systems/impoundGrudge.js';
import { buildSlotList } from '../src/systems/ships.js';
import { SHIPS } from '../src/data/ships.js';

let seeded = false;

export function seedImpoundShot(state, bus, screenMemory, kind) {
  unseedImpoundShot(state);
  if (!kind) return;
  state.lossLedger = state.lossLedger || {};
  // The game wires the lot's listeners at loss-ledger init; the bench has no ledger system.
  ensureImpoundLotWiring(state, { bus });
  const stationId = state.ui.dockedStationId || 'station_helios';
  if (kind === 'lot') {
    let listing = null;
    for (let i = 0; i < 400 && !listing; i += 1) {
      const id = 90000 + i;
      const entity = { id, alive: true, type: 'ship', factionId: 'faction_reach', data: { defId: 'ship_wasp', callsign: 'Marrow' } };
      const l = postImpoundListing(state, bus, {
        entity,
        entry: { lossId: `loss_bench_${i}`, sectorId: 'sector_helios_prime', factionId: 'faction_reach', victimCallsign: 'Marrow', killedByPlayer: true, killerId: state.playerId },
      });
      if (!l) continue;
      if (l.stationId === stationId && l.dispute && l.redeem) listing = l;
      else delete state.lossLedger.impound;
    }
    if (!listing) return;
    listing.auction.open = true; // the block is open: the sealed bid stands on the desk
    screenMemory.set('ship', { mode: 'buy', viewIdx: 0, buyId: listing.defId, recordOpen: false, presetSelectionByHull: {} });
    seeded = true;
    return;
  }
  if (kind === 'ransom') {
    const def = SHIPS.find((s) => s.id === 'ship_wasp');
    const owned = { defId: def.id, fittings: new Array(buildSlotList(def).length).fill(null), appearance: null };
    owned.impoundShadow = mintImpoundShadow({ lossId: 'loss_bench_r', callsign: 'Marrow' }, Number(state.simTime) || 0);
    const day = Math.floor((Number(state.simTime) || 0) / 600);
    owned.impoundShadow.ransom = {
      state: 'offered', amount: 2400, offerDay: day, untilDay: day + 2, stationId,
      claimant: "Marrow's sister", announcedDay: day,
    };
    state.player.ownedShips.push(owned);
    state.player.activeShipIndex = state.player.ownedShips.length - 1;
    screenMemory.set('ship', { mode: 'fleet', viewIdx: state.player.activeShipIndex, buyId: def.id, recordOpen: false, presetSelectionByHull: {} });
    seeded = true;
  }
}

export function unseedImpoundShot(state) {
  if (!seeded) return;
  seeded = false;
  if (state.lossLedger) delete state.lossLedger.impound;
  if (state.player) state.player.activeShipIndex = 0; // ownedShips itself comes back with the baseline
}
