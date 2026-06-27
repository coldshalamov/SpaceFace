import { COMMODITIES } from '../data/commodities.js';
import { FACTION_META } from '../data/factions.js';
import { MISSION_TUNING } from '../data/missions.js';

const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const SINGLE_LOAD_CARGO_MISSIONS = new Set(['cargo_delivery', 'salvage_retrieval', 'smuggling_run']);

function missionCollateral(m) {
  return Math.max(0, m && (m.collateral_cr || m.collateralCr || m.collateral || 0) || 0);
}

function missionRewardCredits(m) {
  const raw = m && (m.reward_cr != null
    ? m.reward_cr
    : (m.rewardCr != null ? m.rewardCr : (m.reward != null ? m.reward : 0)));
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function fmtCredits(value) {
  return missionRewardCredits({ reward_cr: value }).toLocaleString('en-US');
}

function missionRiskTier(m) {
  const raw = m && (m.riskTier != null ? m.riskTier : (m.risk != null ? m.risk : 0));
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function prettyFactionId(id) {
  return String(id || '')
    .replace(/^faction_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function missionFactionLabel(m) {
  const factionId = m && m.factionId;
  if (!factionId) return null;
  const faction = FACTION_BY_ID.get(factionId);
  return (faction && (faction.short || faction.name)) || prettyFactionId(factionId);
}

export function missionRepGain(m, cfg = MISSION_TUNING) {
  const type = m && m.type;
  const baseTable = (cfg && cfg.BASE_REP) || MISSION_TUNING.BASE_REP || {};
  const baseRep = Number(baseTable[type] != null ? baseTable[type] : 0);
  if (!(baseRep > 0)) return 0;
  return Math.max(0, Math.round(baseRep * (1 + missionRiskTier(m) * 0.4)));
}

export function missionRepPenalty(m, cfg = MISSION_TUNING) {
  const gain = missionRepGain(m, cfg);
  return gain > 0 ? -Math.ceil(gain * 0.6) : 0;
}

function missionConsequenceChips(m, cfg) {
  const chips = [];
  const faction = missionFactionLabel(m);
  const payout = missionRewardCredits(m);
  const repGain = missionRepGain(m, cfg);
  const repPenalty = missionRepPenalty(m, cfg);

  if (faction) chips.push({ kind: 'info', text: `Client ${faction}` });
  if (payout > 0) chips.push({ kind: 'ok', text: `Pays ${fmtCredits(payout)} cr` });
  if (faction && repGain > 0) chips.push({ kind: 'ok', text: `${faction} rep +${repGain}` });
  if (faction && repPenalty < 0) chips.push({ kind: 'warn', text: `Fail ${faction} rep ${repPenalty}` });
  if (m && m.type === 'smuggling_run') chips.push({ kind: 'warn', text: 'Bust risks law rep' });

  return chips;
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

  chips.push(...missionConsequenceChips(m, cfg));

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

  return {
    blocker: blockers[0] || null,
    warning: warnings[0] || null,
    chips,
  };
}
