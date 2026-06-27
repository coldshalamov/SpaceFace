import { COMMODITIES } from '../data/commodities.js';
import { MISSION_TUNING } from '../data/missions.js';

const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const SINGLE_LOAD_CARGO_MISSIONS = new Set(['cargo_delivery', 'salvage_retrieval', 'smuggling_run']);

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

function missionCommodityName(m) {
  const id = m && m.params && m.params.cmdtyId;
  const commodity = id ? COMMODITY_BY_ID.get(id) : null;
  return (commodity && commodity.name) || 'cargo';
}

function missionCargoOwned(m, state) {
  const id = m && m.params && m.params.cmdtyId;
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  const owned = id && items ? Number(items[id]) : 0;
  return Number.isFinite(owned) && owned > 0 ? owned : 0;
}

function missionCargoLoopChip(m, cargoNeed, state, options = {}) {
  const p = m && m.params || {};
  if (!p.cmdtyId || !(cargoNeed && cargoNeed.qty > 0) || options.impossible) return null;
  const name = missionCommodityName(m);
  const qtyText = fmtHoldUnits(cargoNeed.qty) + 'u ' + name;
  const owned = missionCargoOwned(m, state);
  const ownedClamped = Math.min(cargoNeed.qty, owned);
  const ownedText = fmtHoldUnits(ownedClamped) + '/' + fmtHoldUnits(cargoNeed.qty) + 'u ' + name;

  if (SINGLE_LOAD_CARGO_MISSIONS.has(m && m.type)) {
    if (owned >= cargoNeed.qty) {
      return { kind: 'ok', text: ownedText + ' aboard for delivery' };
    }
    const need = Math.max(0, cargoNeed.qty - owned);
    return { kind: 'info', text: 'Load ' + fmtHoldUnits(need) + 'u ' + name + ' before undock' };
  }

  if (m && m.type === 'bulk_trade') {
    if (owned >= cargoNeed.qty) {
      return { kind: 'ok', text: 'Quota cargo aboard; sell ' + qtyText + ' at destination' };
    }
    return { kind: 'info', text: 'Buy/carry ' + qtyText + '; payout triggers when sold at destination' };
  }

  return null;
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
    let impossibleCargo = false;
    if (oneLoad) {
      if (cap < cargoNeed.volume) {
        blockers.push(`Requires ${fmtHoldUnits(cargoNeed.volume)}u cargo capacity`);
        impossibleCargo = true;
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

    const cargoLoopChip = missionCargoLoopChip(m, cargoNeed, state, { impossible: impossibleCargo });
    if (cargoLoopChip) chips.push(cargoLoopChip);
  }

  return {
    blocker: blockers[0] || null,
    warning: warnings[0] || null,
    chips,
  };
}
