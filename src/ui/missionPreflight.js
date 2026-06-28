import { COMMODITIES } from '../data/commodities.js';
import { MISSION_TUNING } from '../data/missions.js';
import { SECTORS } from '../data/sectors.js';

const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const STATION_SECTOR_BY_ID = new Map();
for (const sec of SECTORS) {
  for (const stn of sec.stations || []) {
    STATION_SECTOR_BY_ID.set(stn.id, sec.id);
  }
}

const SINGLE_LOAD_CARGO_MISSIONS = new Set(['cargo_delivery', 'salvage_retrieval', 'smuggling_run']);
const TIMER_TIGHT_S = 5 * 60;
const TIMER_CRITICAL_S = 2 * 60;

function missionCollateral(m) {
  return Math.max(0, m && (m.collateral_cr || m.collateralCr || m.collateral || 0) || 0);
}

export function missionRewardCredits(m) {
  const raw = m && (m.reward != null ? m.reward : (m.rewardCr != null ? m.rewardCr : m.reward_cr));
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

export function missionRepReward(m) {
  if (!m || !m.factionId) return 0;
  const explicit = Number(m.rep != null ? m.rep : m.repReward);
  if (Number.isFinite(explicit) && explicit !== 0) return Math.round(explicit);
  const risk = Number(m.riskTier != null ? m.riskTier : (m.risk != null ? m.risk : 0));
  const riskTier = Number.isFinite(risk) ? Math.max(0, Math.round(risk)) : 0;
  const base = MISSION_TUNING.BASE_REP[m.type] != null ? MISSION_TUNING.BASE_REP[m.type] : 3;
  return Math.round(base * (1 + riskTier * 0.4));
}

export function missionRepPenalty(m) {
  const reward = missionRepReward(m);
  return reward > 0 ? -Math.ceil(reward * 0.6) : 0;
}

export function missionConsequenceSummary(m) {
  const reward = missionRewardCredits(m);
  const repReward = missionRepReward(m);
  const repPenalty = missionRepPenalty(m);
  const collateral = missionCollateral(m);
  const chips = [];
  const success = [];
  if (reward > 0) success.push(`+${reward.toLocaleString('en-US')} cr`);
  if (repReward > 0) success.push(`+${repReward} rep`);
  if (collateral > 0) success.push(`${collateral.toLocaleString('en-US')} cr collateral returned`);
  chips.push({
    kind: 'ok',
    label: 'Success',
    text: success.length ? success.join(', ') : 'contract closes cleanly',
  });

  const fail = [];
  if (repPenalty < 0) fail.push(`${repPenalty} rep`);
  if (collateral > 0) fail.push('collateral forfeited');
  fail.push('no payout');
  chips.push({
    kind: 'warn',
    label: 'Fail/expire',
    text: fail.join(', '),
  });

  if (m && m.type === 'smuggling_run') {
    chips.push({ kind: 'bad', label: 'Heat', text: 'customs scans can add legal trouble' });
  }

  return { reward, repReward, repPenalty, collateral, chips };
}

export function missionCargoFootprint(m) {
  const p = m && m.params || {};
  if (!p.cmdtyId || !(p.qty > 0)) return { qty: 0, volume: 0 };
  const commodity = COMMODITY_BY_ID.get(p.cmdtyId);
  const volPerU = commodity && commodity.volPerU > 0 ? commodity.volPerU : 1;
  return { qty: Math.floor(p.qty), volume: Math.floor(p.qty) * volPerU };
}

export function fmtHoldUnits(value) {
  if (!Number.isFinite(value)) return '0';
  return (Math.round(value * 10) / 10).toLocaleString('en-US');
}

function titleCaseId(id) {
  return String(id || '')
    .replace(/^sector_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function sectorLabel(id) {
  const sec = SECTOR_BY_ID.get(id);
  return sec ? sec.name : titleCaseId(id);
}

function missionDestinationSectorId(m) {
  if (!m) return null;
  if (m.destSectorId) return m.destSectorId;
  if (m.destStationId && STATION_SECTOR_BY_ID.has(m.destStationId)) return STATION_SECTOR_BY_ID.get(m.destStationId);
  return null;
}

function missionSecondsAvailable(m, state) {
  if (!m) return null;
  const simTime = Number(state && state.simTime) || 0;
  const deadline = Number(m.deadline_s != null ? m.deadline_s : m.deadlineS);
  if (Number.isFinite(deadline) && deadline > 0) return Math.max(0, deadline - simTime);
  const relative = Number(m.time_limit_s != null ? m.time_limit_s
    : (m.timeLimitS != null ? m.timeLimitS : (m.expiresInS != null ? m.expiresInS : null)));
  return Number.isFinite(relative) && relative > 0 ? relative : null;
}

function fmtMissionTime(seconds) {
  const s = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (s >= 3600) {
    const h = s / 3600;
    return h >= 10 ? Math.round(h) + 'h' : (Math.round(h * 10) / 10).toLocaleString('en-US') + 'h';
  }
  if (s >= 60) return Math.ceil(s / 60) + 'm';
  return s + 's';
}

function pushRouteAndPaceChips(chips, warnings, m, state) {
  const destSectorId = missionDestinationSectorId(m);
  const currentSectorId = state && state.world && state.world.currentSectorId;
  if (destSectorId) {
    if (currentSectorId && currentSectorId === destSectorId) {
      chips.push({ kind: 'ok', text: 'Same-sector route' });
    } else {
      chips.push({ kind: 'info', text: `Jump to ${sectorLabel(destSectorId)}` });
    }
  } else if (m && (m.destStationId || m.dest)) {
    chips.push({ kind: 'info', text: 'Destination route' });
  } else {
    chips.push({ kind: 'info', text: 'Local objective' });
  }

  const seconds = missionSecondsAvailable(m, state);
  if (seconds == null) return;
  const time = fmtMissionTime(seconds);
  if (seconds <= 0) {
    chips.push({ kind: 'bad', text: 'Timer expired' });
    warnings.push('This contract timer has already run out; pick a live board offer.');
  } else if (seconds <= TIMER_CRITICAL_S) {
    chips.push({ kind: 'bad', text: `Timer ${time} critical` });
    warnings.push('Timer is critical; undock only if the route is already staged.');
  } else if (seconds <= TIMER_TIGHT_S) {
    chips.push({ kind: 'warn', text: `Timer ${time} tight` });
    warnings.push('Timer is tight; clear cargo, repair, and route before accepting.');
  } else {
    chips.push({ kind: 'ok', text: `Timer ${time}` });
  }
}

export function missionPreflight(m, state) {
  const chips = [];
  const cfg = (state && state.missions && state.missions.config) || MISSION_TUNING;
  const activeCount = (state && state.missions && Array.isArray(state.missions.active)) ? state.missions.active.length : 0;
  const maxActive = cfg.maxActive || 8;
  const blockers = [];
  const warnings = [];

  if (activeCount >= maxActive) blockers.push('Active mission limit reached');
  chips.push({
    kind: activeCount >= maxActive ? 'bad' : 'ok',
    text: activeCount >= maxActive ? `Slots full ${activeCount}/${maxActive}` : `Slot ${activeCount + 1}/${maxActive}`,
  });

  const collateral = missionCollateral(m);
  const credits = Number(state && state.player && state.player.credits) || 0;
  if (collateral > 0) {
    if (credits < collateral) blockers.push(`Need ${collateral.toLocaleString('en-US')} cr collateral`);
    chips.push({
      kind: credits < collateral ? 'bad' : 'ok',
      text: `${collateral.toLocaleString('en-US')} cr collateral`,
    });
  } else {
    chips.push({ kind: 'ok', text: 'No collateral' });
  }

  const cargoNeed = missionCargoFootprint(m);
  if (cargoNeed.qty > 0) {
    const cargo = state && state.player && state.player.cargo || {};
    const cap = Number.isFinite(cargo.capVolume) ? cargo.capVolume : 0;
    const used = Number.isFinite(cargo.usedVolume) ? cargo.usedVolume : 0;
    const free = Math.max(0, cap - used);
    const oneLoad = SINGLE_LOAD_CARGO_MISSIONS.has(m && m.type);
    if (oneLoad) {
      if (cap < cargoNeed.volume) {
        blockers.push(`Requires ${fmtHoldUnits(cargoNeed.volume)}u cargo capacity`);
      } else if (free < cargoNeed.volume) {
        warnings.push(`Only ${fmtHoldUnits(free)}u free now; clear space before carrying this cargo.`);
      }
      chips.push({
        kind: cap < cargoNeed.volume ? 'bad' : (free < cargoNeed.volume ? 'warn' : 'ok'),
        text: `${fmtHoldUnits(cargoNeed.volume)}u hold required`,
      });
    } else {
      chips.push({ kind: 'info', text: `${cargoNeed.qty.toLocaleString('en-US')}u quota` });
    }
  }

  pushRouteAndPaceChips(chips, warnings, m, state);

  return {
    blocker: blockers[0] || null,
    warning: warnings[0] || null,
    chips,
  };
}
