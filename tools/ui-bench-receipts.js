// ui-bench-receipts.js - settled contracts for the bench's mission-log-receipts shot.
// Receipts are built by the game's own writer (missionReceiptFor, systems/missions.js), covering
// every receipt shape the log reads: a paid job, a voided failure that returned the deposit, a
// race DNF, an abandoned job that forfeited its stake, and an expired window.
// Shots without `receipts` get the bare state back; the bench state is never saved.

import { missionReceiptFor } from '../src/systems/missions.js';

const base = { factionId: null, riskTier: 1, params: {}, collateral_cr: 0, reward_cr: 0 };

function receipts() {
  return [
    missionReceiptFor({
      ...base, id: 'bench_rcpt_void', type: 'bounty_hunt', title: 'Writ on the Ashfall Skiff',
      reward_cr: 1800, collateral_cr: 240, destStationId: 'station_helios',
    }, 'failed', 'failed_external', {
      rewardCr: 0, collateralLostCr: 0, collateralRefundCr: 240, repDelta: 0, at_s: 4200,
    }),
    missionReceiptFor({
      ...base, id: 'bench_rcpt_race', type: 'race', title: 'Veil Ribbon Sprint',
      destSectorId: 'sector_helios_prime',
    }, 'failed', 'race_left_course', { rewardCr: 0, collateralLostCr: 0, repDelta: -2, at_s: 3900 }),
    missionReceiptFor({
      ...base, id: 'bench_rcpt_paid', type: 'cargo_delivery', title: 'Tethys Food Run',
      reward_cr: 1200, collateral_cr: 300, destStationId: 'station_tethys',
    }, 'completed', null, { repDelta: 5, at_s: 3600 }),
    missionReceiptFor({
      ...base, id: 'bench_rcpt_abandon', type: 'bulk_trade', title: 'Ceres Ore Contract',
      collateral_cr: 300, destStationId: 'station_tethys',
    }, 'failed', 'abandoned', { rewardCr: 0, collateralLostCr: 300, repDelta: -3, at_s: 3300 }),
    missionReceiptFor({
      ...base, id: 'bench_rcpt_expired', type: 'recon_scan', title: 'Cold Wake Scan',
      destSectorId: 'sector_helios_prime',
    }, 'expired', 'deadline', { rewardCr: 0, collateralLostCr: 0, repDelta: -4, at_s: 3000 }),
  ];
}

let seeded = null;

export function seedReceiptsShot(state) {
  if (seeded) return;
  seeded = { receipts: state.missions.receipts };
  state.missions.receipts = receipts();
}

export function unseedReceiptsShot(state) {
  if (!seeded) return;
  state.missions.receipts = seeded.receipts;
  seeded = null;
}
