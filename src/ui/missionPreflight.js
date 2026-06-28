import { COMMODITIES } from '../data/commodities.js';
import { MISSION_TUNING } from '../data/missions.js';
import { SECTORS } from '../data/sectors.js';

const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const SINGLE_LOAD_CARGO_MISSIONS = new Set(['cargo_delivery', 'salvage_retrieval', 'smuggling_run']);
const TASK_TIME_FALLBACK = {
  cargo_delivery: 20,
  bulk_trade: 30,
  bounty_hunt: 60,
  mining_quota: 45,
  salvage_retrieval: 30,
  escort: 90,
  patrol_clear: 45,
  smuggling_run: 20,
  passenger_transport: 20,
  recon_scan: 25,
};

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

function fmtClock(value) {
  const s = Math.max(0, Math.floor(Number(value) || 0));
  const m = Math.floor(s / 60);
  if (m >= 60) return (m / 60).toFixed(m >= 600 ? 0 : 1) + 'h';
  if (m >= 1) return m + 'm';
  return s + 's';
}

function missionDestSectorId(m) {
  if (!m) return null;
  if (m.destSectorId) return m.destSectorId;
  const raw = String(m.dest || '');
  return raw.startsWith('sector_') ? raw : null;
}

function sectorName(id) {
  const sector = id ? SECTOR_BY_ID.get(id) : null;
  return sector ? sector.name : (id || '').replace(/^sector_/, '').replace(/_/g, ' ') || 'target sector';
}

export function missionRouteScope(m, state) {
  const targetSectorId = missionDestSectorId(m);
  const currentSectorId = state && state.world && state.world.currentSectorId || null;
  const distance = Number(m && m.distance);
  if (targetSectorId && currentSectorId && targetSectorId === currentSectorId) {
    return { kind: 'ok', text: 'Local sector' };
  }
  if (targetSectorId) {
    return {
      kind: 'info',
      text: currentSectorId ? `Jump route: ${sectorName(targetSectorId)}` : `Route: ${sectorName(targetSectorId)}`,
    };
  }
  if (Number.isFinite(distance) && distance > 0) {
    return { kind: 'info', text: `${Math.round(distance).toLocaleString('en-US')}u route` };
  }
  return null;
}

function missionTaskEstimate(m) {
  const p = m && m.params || {};
  const explicit = Number(p.taskTime);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  switch (m && m.type) {
    case 'bulk_trade': return Math.max(1, Number(p.qty) || 1) * 1.5;
    case 'mining_quota': return Math.max(1, Number(p.qty) || 1) * 3;
    case 'patrol_clear': return Math.max(1, Number(p.clearCount) || 1) * 45;
    case 'recon_scan': return Math.max(1, Number(p.scanTargets) || 1) * 25;
    default: return TASK_TIME_FALLBACK[m && m.type] || 30;
  }
}

export function missionTimePacing(m, state) {
  const timeLimit = Number(m && (m.expiresInS != null ? m.expiresInS : m.time_limit_s));
  if (!Number.isFinite(timeLimit) || timeLimit <= 0) return null;
  const cfg = (state && state.missions && state.missions.config) || MISSION_TUNING;
  const cruise = Number(cfg && cfg.cruiseSpeedRef) || MISSION_TUNING.cruiseSpeedRef || 140;
  const distance = Math.max(0, Number(m && m.distance) || 0);
  const estimate = distance / Math.max(1, cruise) + missionTaskEstimate(m);
  const slack = estimate > 0 ? timeLimit / estimate : null;
  const tight = slack != null && slack < 1.6;
  return {
    chip: {
      kind: tight ? 'warn' : 'ok',
      text: (tight ? 'Tight ' : '') + `${fmtClock(timeLimit)} timer`,
    },
    warning: tight ? 'Timer is tight for the route distance; refuel, repair, and launch directly after accepting.' : null,
    slack,
  };
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

  const route = missionRouteScope(m, state);
  if (route) chips.push(route);

  const pacing = missionTimePacing(m, state);
  let pacingWarning = null;
  if (pacing && pacing.chip) {
    chips.push(pacing.chip);
    pacingWarning = pacing.warning || null;
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

  if (pacingWarning) warnings.push(pacingWarning);

  return {
    blocker: blockers[0] || null,
    warning: warnings[0] || null,
    chips,
  };
}
