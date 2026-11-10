/**
 * Forge yard contracts (PB-MIS-E). The Outlying Yard in sector_vesta_forge runs the two
 * station-side jobs that complete the packet:
 *
 * - SPLIT MANIFEST (SF-139): a freighter broke up inbound; two real cargo portions were
 *   caught in nets — an urgent net (perishables on a clock) and a heavy net (high-value
 *   salvage, slow to land). The player may land the urgent net on the first run, try to
 *   place both, or strip the wreck later. Partial success continues the world; each lot
 *   is a real salvagePool counted only at the yard sink, never by a flag.
 * - QUIET BERTH (SF-142): a yard lighter is wedged outside the west berth, drive dead.
 *   The best solve is observation — read the situation, latch/tow or hire the yard's
 *   own tug for a fee (SF-138's borrowed tug), then park the hull at the dock ring.
 *   Force is physically valid: shooting the hull clear of the berth pays nothing and
 *   costs the contract. The job is one-shot; it never respawns for repeated rewards.
 * - TOW ASSIST (SF-138): any working tug can be hired to haul a real body to a real
 *   sink. The hire only leases the tug and attaches a live npc_tow constraint; the
 *   tug's own delivery pulse pays the contract, not the selection.
 *
 * The salvage-auction rule (SF-145) rides the same seam: every detached body in this
 * file and in claim-stake salvage is scored by possession — the actor that physically
 * delivers the pool to the sink is the actor the settlement names. A claim marker only
 * decides whether that delivery is lawful, never whether it counts.
 */

import { SECTORS } from './sectors.js';

// --- Stable ids --------------------------------------------------------------

export const SPLIT_MANIFEST_TYPE = 'split_manifest';
export const QUIET_BERTH_TYPE = 'quiet_berth';
export const YARD_WORK_SOURCE = 'yardWorkContract';

export const YARD_SECTOR_ID = 'sector_vesta_forge';
export const YARD_BOARD_STATION_ID = 'station_depot3';            // the forge depot posts the yard's work
export const YARD_SINK_STATION_ID = 'station_vesta_outlying_yard'; // the yard pays at its own dock
export const YARD_FACTION_ID = 'faction_dmc';

// One-shot authored offers. Completed/abandoned/failed rows retire by id so a
// board refresh can never repost a settled yard job.
export const YARD_CONTRACT_OFFERS = {
  splitManifest: 'split_manifest_forge_yard',
  quietBerth: 'quiet_berth_forge_yard',
};

// --- Tunables (data) ---------------------------------------------------------

export const SPLIT_MANIFEST_LOTS = {
  // The urgent net: light mass, medical freight, on the clock. Fast in = bonus.
  urgent: {
    cmdtyId: 'cmdty_medical',
    qty: 3,
    mass: 12,
    radius: 10,
    label: 'URGENT NET · MED',
    fastWindowS: 210,        // from first contact; after this the net counts as late
    lotId: 'yard-sm-urgent',
  },
  // The heavy net: dense quantum freight — a real mass the player must fight or hire out.
  heavy: {
    cmdtyId: 'cmdty_quantum_cores',
    qty: 4,
    mass: 150,
    radius: 14,
    label: 'HEAVY NET · QC',
    lotId: 'yard-sm-heavy',
  },
};

export const SPLIT_MANIFEST_TUNING = {
  rewardFullCr: 1500,        // board display = every share earned (urgent fast + heavy)
  shareUrgentFastCr: 500,    // the urgent net inside the yard ring before its clock
  shareUrgentLateCr: 300,    // the urgent net landed after its perishables clock
  shareHeavyCr: 1000,        // the heavy net inside the yard ring
  dockRange: 260,            // ring radius on the yard dock — a net inside it is "landed"
  scanLabel: 'SPILL SITE · TWO NETS',
  cueTitle: 'Two Nets Inbound',
};

export const QUIET_BERTH_TUNING = {
  rewardCr: 700,
  berthOffset: { x: 210, z: -90 },   // berth ring, sector-offset from the yard sink
  berthRange: 170,                   // the hull parked inside this ring counts as berthed
  spawnOffset: { x: -95, z: 130 },   // where the dead lighter materializes, wedged off-dock
  load: { cmdtyId: 'cmdty_comp_hullplate', qty: 5, lotId: 'yard-qb-load' },
  mass: 46,
  radius: 12,
  scanLabel: 'YARD LIGHTER · DRIVE DEAD',
  cueTitle: 'Berth Blocked',
};

// The tow assist hire: a working tug's quoted fee. Below the yard's 150cr drive-weld
// call-out on purpose — the assist only drags; it does not repair.
export const TOW_ASSIST_FEE_CR = 140;
export const TOW_ASSIST_RANGE = 2600;   // how far off the tug the target may sit when hired
export const TOW_ASSIST_APPROACH = 140; // approach ring on the target for the attach
export const TOW_ASSIST_TIMEOUT_S = 240;

// --- Cue copy (station dialog reads these; no runtime control flow lives here) ---

export const YARD_CUES = {
  splitManifest: {
    title: 'Two Nets Inbound',
    offerLine: 'Freighter broke up on final. Nets caught the load — one is medical, one is not.',
    brief: 'The urgent net is medical freight — land it before it goes worthless. '
      + 'The heavy net is dense; it will fight the tow. Save one fast, work both, '
      + 'or strip the wreck later — every unit is paid by what lands on our pad.',
    settleFull: 'Both nets on the pad. The yard pays full.',
    settlePartial: 'One net landed. The manifest closes on what was saved.',
    settleLate: 'The medical lot came in late — partial rate.',
  },
  quietBerth: {
    title: 'Berth Blocked',
    offerLine: 'Lighter wedged off the west berth with a dead drive. No hurry. No shooting.',
    brief: 'West berth is blocked by a yard lighter that lost its drive under load. '
      + 'Latch it, drag it, or hire one of our tugs to pull it in. '
      + 'If the hull dies on your hands the berth is clear and so is the contract — '
      + 'the yard does not pay for salvage.',
    settleClean: 'Berth clear, hull parked, load intact. The yard pays the quiet rate.',
    settleLoud: 'The berth is clear. The manifest is scrap. No payment.',
  },
};

// --- Authored layout ---------------------------------------------------------

// All positions are offsets from the yard sink's live position; the spawn code
// resolves the anchor at materialization time (depot3 has no authored pos).
function sectorRecord() {
  return SECTORS.find((s) => s && s.id === YARD_SECTOR_ID) || null;
}

export function yardSinkPos() {
  const sector = sectorRecord();
  const station = sector && Array.isArray(sector.stations)
    ? sector.stations.find((s) => s && s.id === YARD_SINK_STATION_ID)
    : null;
  return (station && station.pos && Number.isFinite(station.pos.x) && Number.isFinite(station.pos.z))
    ? { x: station.pos.x, z: station.pos.z }
    : null;
}

// Authored net offsets, sector-local relative to the sink.
const NET_OFFSETS = {
  urgent: { x: -640, z: 480 },
  heavy: { x: 720, z: -560 },
  wreck: { x: -140, z: 700 },
};

export function splitManifestNetOffset(kind) {
  const off = NET_OFFSETS[kind];
  return off ? { x: off.x, z: off.z } : { x: 0, z: 0 };
}

export function splitManifestWreckOffset() {
  return { x: NET_OFFSETS.wreck.x, z: NET_OFFSETS.wreck.z };
}

// --- Offer builders ----------------------------------------------------------

// Structural authored offers — never rolled. ensureBoard posts them once to the
// depot board; accepting defers the scene to sector arrival like every authored row.
export function buildSplitManifestOffer({ epoch = 0 } = {}) {
  return {
    id: YARD_CONTRACT_OFFERS.splitManifest,
    type: SPLIT_MANIFEST_TYPE,
    stationId: YARD_BOARD_STATION_ID,
    factionId: YARD_FACTION_ID,
    source: YARD_WORK_SOURCE,
    story: 'yard_work',
    params: {
      yardContractId: 'split_manifest',
      lots: [
        { key: 'urgent', cmdtyId: SPLIT_MANIFEST_LOTS.urgent.cmdtyId, qty: SPLIT_MANIFEST_LOTS.urgent.qty, lotId: SPLIT_MANIFEST_LOTS.urgent.lotId },
        { key: 'heavy', cmdtyId: SPLIT_MANIFEST_LOTS.heavy.cmdtyId, qty: SPLIT_MANIFEST_LOTS.heavy.qty, lotId: SPLIT_MANIFEST_LOTS.heavy.lotId },
      ],
      fastWindowS: SPLIT_MANIFEST_LOTS.urgent.fastWindowS,
    },
    reward_cr: SPLIT_MANIFEST_TUNING.rewardFullCr,
    collateral_cr: 0,
    riskTier: 1,
    authored: true,
    oneShot: true,
    title: YARD_CUES.splitManifest.title,
    description: YARD_CUES.splitManifest.brief,
    destStationId: YARD_SINK_STATION_ID,
    destSectorId: YARD_SECTOR_ID,
    stationName: 'Forge Outlying Yard',
    sectorName: 'The Forge',
    sectorHint: 'The Forge · yard apron',
    postedEpoch: epoch,
  };
}

export function buildQuietBerthOffer({ epoch = 0 } = {}) {
  return {
    id: YARD_CONTRACT_OFFERS.quietBerth,
    type: QUIET_BERTH_TYPE,
    stationId: YARD_BOARD_STATION_ID,
    factionId: YARD_FACTION_ID,
    source: YARD_WORK_SOURCE,
    story: 'yard_work',
    params: {
      yardContractId: 'quiet_berth',
      loadCmdtyId: QUIET_BERTH_TUNING.load.cmdtyId,
      loadQty: QUIET_BERTH_TUNING.load.qty,
      loadLotId: QUIET_BERTH_TUNING.load.lotId,
    },
    reward_cr: QUIET_BERTH_TUNING.rewardCr,
    collateral_cr: 0,
    riskTier: 1,
    authored: true,
    oneShot: true,
    title: YARD_CUES.quietBerth.title,
    description: YARD_CUES.quietBerth.brief,
    destStationId: YARD_SINK_STATION_ID,
    destSectorId: YARD_SECTOR_ID,
    stationName: 'Forge Outlying Yard',
    sectorName: 'The Forge',
    sectorHint: 'The Forge · west berth',
    postedEpoch: epoch,
  };
}
