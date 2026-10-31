// Sim-safe mission recap and objective wording — extracted from ui/screens/missionLog.js.
// Everything here is pure: data tables + state reads in, player-facing text out. No DOM,
// no timers, no randomness — so the whole-sim worker lane (and any system) may import it.
// missionLog.js re-exports objectiveText/continueRecap for its existing screen importers.

import { SECTORS } from '../../data/sectors.js';
import { commodityDisplayName } from '../commodityNames.js';
import { starterRamSentence } from '../../data/starterJobs.js';
import { unsatisfiedRequiredConditions } from '../../data/contractClauses.js';

// Build a station lookup from the static SECTORS graph.
export const STATION_INFO = new Map();
export const SECTOR_BY_ID = new Map();
for (const sec of SECTORS) {
  SECTOR_BY_ID.set(sec.id, sec);
  for (const st of sec.stations || []) {
    STATION_INFO.set(st.id, { name: st.name, sectorId: sec.id, sectorName: sec.name });
  }
}

export function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  // A whole-hour span reads "2h", not "2h 0m" ("1h 30m left of 2h" — the zero tail said nothing).
  if (h >= 1) return m > 0 ? h + 'h ' + m + 'm' : h + 'h';
  if (m >= 1) return m + 'm ' + sec + 's';
  return sec + 's';
}

export function titleCaseWords(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function prettyType(t) {
  if (!t) return 'Contract';
  return titleCaseWords(t);
}

export function cmdtyName(id) {
  return id ? commodityDisplayName(id) : 'cargo';
}

export function destStationName(id) {
  const info = STATION_INFO.get(id);
  return info ? info.name : 'destination';
}

/** " in <Sector>" when the contract names a destination sector, else "". */
export function inSector(m) {
  const name = contractSectorName(m, '');
  return name ? ` in ${name}` : '';
}

export function contractSectorName(m, fallback) {
  const sector = m.destSectorId ? SECTOR_BY_ID.get(m.destSectorId) : null;
  return sector && sector.name ? sector.name : fallback;
}

/** Build a human-readable objective description from the mission instance. */
export function objectiveText(m) {
  const p = m.params || {};
  const prog = m.objectiveProgress || 0;
  const tgt = m.objectiveTarget || 1;
  const dest = m.destStationId ? destStationName(m.destStationId) : 'destination';
  if (p.setPieceObjective === 'long_read_rumor_survey') {
    const rumorLabel = p.rumorAlreadyKnown ? 'RUMOR KNOWN' : 'RUMOR PURCHASED';
    return `${rumorLabel} ${p.rumorPurchased ? '✓' : '○'} / BEARING FIXED ${p.bearingFixed ? '✓' : '○'}`;
  }
  if (p.setPieceObjective === 'long_read_salvage') {
    return `COMPLICATION LIVE ${p.complicationObserved ? '✓' : '○'} / WRECK RECOVERED ${p.salvageDecisionReady ? '✓' : '○'}`;
  }
  if (p.setPieceObjective === 'long_read_fence') {
    return `CHOOSE / CONFIRM DISPOSITION · ${titleCaseWords(p.wreckChoiceId || 'wreck outcome')}`;
  }
  // B0's manifest card has two real stages. Keep the shared log/HUD objective in lockstep with
  // the mission owner: before the sample is aboard, point at the marked rock; after recovery,
  // point home to Helios. This is a read of the canonical mission record, not a second stage writer.
  if (m.storyTag === 'campaign47a:b0:recovery') {
    return p.sampleRecovered
      ? 'Deliver the 47-A sample to Helios Station'
      : 'Recover the 47-A sample from the marked rock, then deliver it to Helios Station';
  }
  switch (m.type) {
    case 'cargo_delivery': {
      const serviceClass = `${m.originChoiceId || ''} ${m.title || ''} ${m.mapLabel || ''}`.toLowerCase();
      const cargo = `${Math.max(1, Number(p.qty) || tgt)}u ${cmdtyName(p.cmdtyId)}`;
      if (m.originCareer === 'hauler' && serviceClass.includes('bonded express')) {
        return `EXPRESS · Deliver ${cargo} to ${dest} · short clock · ${m.collateral_cr || 0} cr bond at risk`;
      }
      if (m.originCareer === 'hauler' && serviceClass.includes('open manifest')) {
        return `OPEN · Deliver ${cargo} to ${dest} · longer window · no collateral`;
      }
      return `Deliver to ${dest}`;
    }
    case 'salvage_retrieval':
    case 'passenger_transport':
      return `Deliver to ${dest}`;
    case 'bulk_trade':
      return `Sell ${prog}/${tgt} ${cmdtyName(p.cmdtyId)}`;
    case 'mining_quota':
      return `Mine ${prog}/${tgt} ${cmdtyName(p.cmdtyId)}`;
    case 'bounty_hunt':
      return starterRamSentence(p) || 'Eliminate target';
    case 'patrol_clear':
      return `Clear ${prog}/${tgt} hostiles`;
    case 'escort': {
      // INF-064: the dock predicate holds the contract open until the convoy docks too
      // (_escorteeArrivedOk), so a bare `Escort to X` leaves the player waiting inside an
      // apparently completed marker. Expose the pending convoy — but only while a live
      // escortee gates completion (never spawned means the predicate is satisfied by default).
      if (m._escorteeId != null && !m._escorteeArrived) return `Escort to ${dest} · convoy en route`;
      return `Escort to ${dest}`;
    }
    case 'recon_scan':
      if (p.originSurveySample) {
        const scans = Math.max(1, p.scanTargets || 1);
        const mined = Math.max(0, prog - scans);
        return p.surveyComplete
          ? `Mine sample ${mined}/${Math.max(1, p.sampleQty || 1)} ${cmdtyName(p.sampleCmdtyId)}`
          : 'Scan a Ceres asteroid field';
      }
      return `Scan ${prog}/${tgt} targets`;
    case 'smuggling_run':
      return `Deliver contraband to ${dest}`;
    // Physical-job contracts. Same sentences the sim keeps for the nav marker (missionNavReason),
    // so the HUD tracker, local map, log and station Contracts all read as one instruction
    // instead of a bare "0/1".
    case 'tow_recovery': {
      const load = p.variant === 'drift_hulk' ? 'dead freighter' : 'slag core';
      return m.destStationId
        ? `Tow the ${load} to ${dest}, or sling it into the yard`
        : `Tow the ${load} home, or sling it into the yard`;
    }
    case 'demolition':
      return `${p.variant === 'guarded_tower' ? 'Knock down the picketed tower' : 'Knock down the marked tower'}${inSector(m)}`;
    case 'rescue_under_fire':
      return tgt > 1
        ? `Pull ${prog}/${tgt} life pods out of ${contractSectorName(m, 'the field')}`
        : `Pull the life pods out of ${contractSectorName(m, 'the field')}`;
    case 'race': {
      const course = p.courseName ? `the ${p.courseName} gates` : 'the gate course';
      return tgt > 1 ? `Run ${course} in order · ${prog}/${tgt} cleared` : `Run ${course} and finish`;
    }
    case 'bulk_haul':
      return `Tether-haul ${prog}/${tgt}u bulk ore to ${dest}`;
    case 'capital_boss':
      return `Destroy the capital ship${inSector(m)}`;
    case 'authored_set_piece':
      return m.brief || m.title || `Finish the physical job${inSector(m)}`;
    case 'split_manifest':
      return tgt > 1 ? `Land the cargo nets on the yard pad · ${prog}/${tgt} landed` : 'Land the cargo net on the yard pad';
    case 'quiet_berth':
      return 'Pull the dead lighter into the west berth with its load intact';
    case 'counterweight_watch':
      return 'Hold the yard gate open on its counterweight while the tug walks the crates through';
    case 'breakaway_recovery':
      return 'Bring the broken-away flywheel home through the Concord catcher fork';
    case 'heist_intercept':
      return 'Intercept the launcher capsule and deliver it to the Quiet fence';
    default: {
      // Unknown or future types: the contract's own words first, the plain type name second.
      // A bare count is only ever a suffix, and only when there is more than one thing to count.
      const words = m.navReason || m.brief || prettyType(m.type);
      return tgt > 1 ? `${words} · ${prog}/${tgt}` : words;
    }
  }
}

/**
 * INF-070: Continue restores the player's intention. A pure recap of restored state — the
 * tracked (or first) active objective in the one shared wording, the current sector, and one
 * unresolved risk (a blocking contract term first, then a tight clock, then a critical hull).
 * Reads only; emits nothing, so it can never replay a reward. Null when there is no
 * objective to resume and no risk to answer.
 */
export function continueRecap(state) {
  const active = state && state.missions && Array.isArray(state.missions.active)
    ? state.missions.active.filter((m) => m && m.status === 'active')
    : [];
  const trackedId = state && state.ui && state.ui.trackedMissionId;
  const mission = (trackedId && active.find((m) => m.id === trackedId)) || active[0] || null;
  const sectorId = state && state.world && state.world.currentSectorId;
  const sector = sectorId && SECTOR_BY_ID.get(sectorId);
  const location = sector && sector.name ? sector.name : null;
  const objective = mission ? `${mission.title || 'Contract'} — ${objectiveText(mission)}` : null;
  let risk = null;
  if (mission) {
    const blocked = unsatisfiedRequiredConditions(mission) || [];
    if (blocked.length) {
      const first = blocked[0] || {};
      risk = `Held: ${first.pendingText || first.label || 'a contract term'} — settle it before turn-in.`;
    } else {
      const deadline = Number(mission.deadline_s);
      const remaining = Number.isFinite(deadline) ? deadline - (Number(state.simTime) || 0) : null;
      if (remaining != null && remaining < 120) {
        risk = `Clock: ${fmtTime(Math.max(0, remaining))} left on ${mission.title || 'the contract'}.`;
      }
    }
  }
  if (!risk && state && state.entities && typeof state.entities.get === 'function') {
    const player = state.entities.get(state.playerId);
    const max = Number(player && player.hullMax);
    if (max > 0 && (Number(player.hull) || 0) / max < 0.35) {
      risk = 'Hull critical — repair before taking fire.';
    }
  }
  // A bare position is not an intention — the pilot can see where they loaded. The recap
  // speaks only when there is an objective to resume or a risk to answer.
  if (!objective && !risk) return null;
  return { objective, location, risk };
}
