import { COMMODITIES } from '../data/commodities.js';
import { FACTION_META } from '../data/factions.js';
import { MISSION_TUNING, missionMinRepForRisk, missionStandingGateForMinRep } from '../data/missions.js';
import { SECTORS } from '../data/sectors.js';
import { forecastTransitFor, sectorSignalFor } from '../systems/sectorSim.js';

const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const STATION_SECTOR_BY_ID = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) STATION_SECTOR_BY_ID.set(station.id, sector.id);
}
const SINGLE_LOAD_CARGO_MISSIONS = new Set(['cargo_delivery', 'salvage_retrieval', 'smuggling_run']);
const MARKET_STAGED_CARGO_MISSIONS = new Set(['cargo_delivery', 'bulk_trade', 'smuggling_run']);
const ECONOMY_ROUTE_MISSIONS = new Set(['cargo_delivery', 'bulk_trade', 'smuggling_run', 'passenger_transport']);
const DANGEROUS_MISSION_TYPES = new Set(['bounty_hunt', 'patrol_clear', 'escort', 'smuggling_run']);
const STORY_BRANCH_FACTIONS = new Set(['faction_mts', 'faction_scn', 'faction_free']);
const TIMER_TIGHT_S = 5 * 60;
const TIMER_CRITICAL_S = 2 * 60;
const ROUTE_RISK_WARNING_DANGER = 0.72;
const ROUTE_RISK_BAD_DANGER = 0.84;
const HULL_WARN_FRAC = 0.70;
const HULL_CRITICAL_FRAC = 0.35;
const FUEL_WARN_FRAC = 0.45;
const FUEL_CRITICAL_FRAC = 0.25;
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

function signedRep(value) {
  const n = Math.round(Number(value) || 0);
  return (n > 0 ? '+' : '') + n;
}

function factionShortName(id) {
  const fac = id ? FACTION_BY_ID.get(id) : null;
  return (fac && (fac.short || fac.name)) || 'this faction';
}

function stateRepFor(state, factionId) {
  const rec = factionId && state && state.factions ? state.factions[factionId] : null;
  const rep = Number(rec && rec.rep);
  return Number.isFinite(rep) ? Math.round(rep) : 0;
}

function storyBranchIntroMinRep(m, state) {
  if (
    m && m.factionId &&
    state && state.story && state.story.beatIndex === 4 &&
    STORY_BRANCH_FACTIONS.has(m.factionId)
  ) {
    return -29;
  }
  return null;
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

export function missionRiskTier(m) {
  const raw = Number(m && (m.riskTier != null ? m.riskTier : m.risk));
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(4, Math.round(raw)));
}

export function missionStandingRequirement(m, state) {
  if (!m || !m.factionId) return null;
  const explicit = Number(m.minRep);
  const storyMinRep = storyBranchIntroMinRep(m, state);
  const minRep = storyMinRep != null
    ? storyMinRep
    : (Number.isFinite(explicit) ? Math.round(explicit) : missionMinRepForRisk(missionRiskTier(m)));
  const rep = stateRepFor(state, m.factionId);
  const gate = missionStandingGateForMinRep(minRep);
  const ok = rep >= minRep;
  const faction = factionShortName(m.factionId);
  return {
    ok,
    factionId: m.factionId,
    faction,
    minRep,
    currentRep: rep,
    gateName: gate ? gate.name : 'Faction Standing',
    gateShort: gate ? gate.short : signedRep(minRep),
    missingRep: Math.max(0, minRep - rep),
    chip: {
      kind: ok ? 'ok' : 'bad',
      text: ok
        ? (gate ? gate.short : signedRep(minRep)) + ' standing met'
        : signedRep(minRep) + ' ' + faction + ' standing required',
    },
    blocker: ok ? null : 'Need ' + signedRep(minRep) + ' standing with ' + faction,
  };
}

export function missionRiskRewardSummary(m) {
  const risk = missionRiskTier(m);
  const reward = missionRewardCredits(m);
  const collateral = missionCollateral(m);
  const rewardText = reward > 0 ? `+${reward.toLocaleString('en-US')} cr` : 'no listed payout';
  const stakeText = collateral > 0 ? ` - stake ${collateral.toLocaleString('en-US')} cr` : '';
  return {
    risk,
    reward,
    collateral,
    chip: {
      kind: risk >= 3 ? 'warn' : (reward > 0 ? 'ok' : 'info'),
      text: `Payout ${rewardText} / R${risk}${stakeText}`,
    },
  };
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

function commodityName(id) {
  const commodity = id ? COMMODITY_BY_ID.get(id) : null;
  return (commodity && commodity.name) || String(id || 'cargo').replace(/^cmdty_/, '').replace(/_/g, ' ');
}

function missionCargoTargetUnits(m) {
  const p = m && m.params || {};
  const cargoQty = Math.floor(Number(p.qty) || 0);
  if (cargoQty > 0 && MARKET_STAGED_CARGO_MISSIONS.has(m && m.type)) return cargoQty;
  const raw = m && (m.objectiveTarget != null ? m.objectiveTarget : p.qty);
  const target = Math.floor(Number(raw) || 0);
  return target > 0 ? target : 0;
}

function missionCargoProgressUnits(m) {
  const raw = m && m.objectiveProgress;
  const progress = Math.floor(Number(raw) || 0);
  return progress > 0 ? progress : 0;
}

function missionCargoOwnedUnits(m, state) {
  const cmdtyId = m && m.params && m.params.cmdtyId;
  const cargo = state && state.player && state.player.cargo || {};
  return Math.max(0, Math.floor(Number(cargo.items && cargo.items[cmdtyId]) || 0));
}

function dockedMarketEntry(state, cmdtyId) {
  const stationId = state && state.ui && state.ui.dockedStationId;
  const markets = state && state.economy && state.economy.markets;
  const market = stationId && markets && markets[stationId];
  return market && cmdtyId ? market[cmdtyId] || null : null;
}

function marketStockUnits(entry) {
  const stock = Math.floor(Number(entry && entry.stock) || 0);
  return stock > 0 ? stock : 0;
}

function marketHasBuyPrice(entry) {
  const price = Number(entry && (entry.lastBuy != null ? entry.lastBuy : entry.lastMid));
  return Number.isFinite(price) && price > 0;
}

export function missionCargoStaging(m, state) {
  const p = m && m.params || {};
  const cmdtyId = p.cmdtyId;
  if (!cmdtyId || !MARKET_STAGED_CARGO_MISSIONS.has(m && m.type)) return null;
  const target = missionCargoTargetUnits(m);
  if (target <= 0) return null;
  const remaining = Math.max(0, target - missionCargoProgressUnits(m));
  const name = commodityName(cmdtyId);
  if (remaining <= 0) return { chip: { kind: 'ok', text: name + ' objective complete' }, warning: null };

  const owned = missionCargoOwnedUnits(m, state);
  if (owned >= remaining) {
    return {
      chip: { kind: 'ok', text: fmtHoldUnits(owned) + '/' + fmtHoldUnits(remaining) + 'u ' + name + ' aboard' },
      warning: null,
    };
  }

  const need = Math.max(0, remaining - owned);
  const entry = dockedMarketEntry(state, cmdtyId);
  const stock = marketStockUnits(entry);
  if (entry && marketHasBuyPrice(entry)) {
    if (stock >= need) {
      return {
        chip: { kind: 'info', text: 'Buy ' + fmtHoldUnits(need) + 'u ' + name + ' here' },
        warning: null,
      };
    }
    if (stock > 0) {
      return {
        chip: { kind: 'warn', text: 'Market has ' + fmtHoldUnits(stock) + 'u ' + name },
        warning: 'Load ' + fmtHoldUnits(need) + 'u more ' + name + '; this market only shows ' + fmtHoldUnits(stock) + 'u.',
      };
    }
    return {
      chip: { kind: 'warn', text: 'Source ' + fmtHoldUnits(need) + 'u ' + name },
      warning: 'This station is not stocking enough ' + name + '; check Market or another station before undocking.',
    };
  }

  return {
    chip: { kind: owned > 0 ? 'warn' : 'info', text: fmtHoldUnits(owned) + '/' + fmtHoldUnits(remaining) + 'u ' + name + ' aboard' },
    warning: null,
  };
}

function clamp01(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function fmtPct(value) {
  return Math.round(clamp01(value) * 100) + '%';
}

function routeRiskLabel(danger) {
  if (danger >= ROUTE_RISK_BAD_DANGER) return 'Hostile';
  if (danger >= ROUTE_RISK_WARNING_DANGER) return 'Hazardous';
  if (danger >= 0.48) return 'Guarded';
  return 'Calm';
}

function routeRiskChipKind(danger, forecast) {
  if (danger >= ROUTE_RISK_BAD_DANGER) return 'bad';
  if (danger >= ROUTE_RISK_WARNING_DANGER) return 'warn';
  if (forecast && forecast.survivalMargin < 0 && forecast.incidentChance >= 0.18) return 'warn';
  return 'ok';
}

function pressureLabel(value) {
  const pressure = Number(value) || 0;
  if (pressure > 0.18) return 'scarcity';
  if (pressure < -0.18) return 'surplus';
  return 'balanced';
}

function missionRiskBand(m) {
  const raw = m && (m.riskTier != null ? m.riskTier : (m.risk != null ? m.risk : 0));
  const risk = Number(raw);
  return Number.isFinite(risk) ? Math.max(0, Math.round(risk)) : 0;
}

function playerShip(state) {
  return state && state.entities && state.entities.get && state.playerId != null
    ? state.entities.get(state.playerId)
    : null;
}

function shipHullFraction(state) {
  const ship = playerShip(state);
  const max = Number(ship && ship.hullMax);
  if (!(max > 0)) return null;
  return clamp01((Number(ship.hull) || 0) / max, 0);
}

function shipFuelFraction(state) {
  const fuel = state && state.fuel || {};
  const max = Number(fuel.max);
  if (!(max > 0)) return null;
  return clamp01((Number(fuel.current) || 0) / max, 0);
}

function missionDestSectorId(m) {
  if (!m) return null;
  if (m.destSectorId) return m.destSectorId;
  if (m.destStationId && STATION_SECTOR_BY_ID.has(m.destStationId)) return STATION_SECTOR_BY_ID.get(m.destStationId);
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

export function missionRouteIntel(m, state) {
  const targetSectorId = missionDestSectorId(m);
  if (!targetSectorId) return null;
  const currentSectorId = state && state.world && state.world.currentSectorId || null;
  const local = !!(currentSectorId && currentSectorId === targetSectorId);
  const signal = sectorSignalFor(state, targetSectorId);
  if (!signal) return null;
  const danger = clamp01(signal.danger);
  const label = routeRiskLabel(danger);
  const forecast = local ? null : forecastTransitFor(state, targetSectorId, {
    fromSectorId: currentSectorId,
    via: 'gate',
  });
  const chips = [{
    kind: local ? (danger >= ROUTE_RISK_WARNING_DANGER ? 'warn' : 'ok') : routeRiskChipKind(danger, forecast),
    text: (local ? 'Local risk: ' : 'Route risk: ') + label + ' ' + fmtPct(danger),
  }];

  if (ECONOMY_ROUTE_MISSIONS.has(m && m.type)) {
    chips.push({
      kind: Math.abs(Number(signal.pricePressure) || 0) > 0.18 ? 'info' : 'ok',
      text: 'Market: ' + pressureLabel(signal.pricePressure),
    });
  }

  let warning = null;
  if (!local && danger >= ROUTE_RISK_WARNING_DANGER) {
    warning = label + ' route risk to ' + sectorName(targetSectorId) + '; refuel, repair, and consider escort before accepting.';
  } else if (!local && forecast && forecast.survivalMargin < 0 && forecast.incidentChance >= 0.18) {
    warning = 'Projected transit exposure may exceed current defenses; repair or upgrade before accepting.';
  } else if (local && danger >= ROUTE_RISK_BAD_DANGER) {
    warning = label + ' local-sector risk near ' + sectorName(targetSectorId) + '; launch ready for contact.';
  }

  return {
    targetSectorId,
    targetName: sectorName(targetSectorId),
    danger,
    label,
    marketPressure: Number(signal.pricePressure) || 0,
    forecast,
    chips,
    warning,
  };
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
  const simTime = Number(state && state.simTime) || 0;
  const deadline = Number(m && (m.deadline_s != null ? m.deadline_s : m.deadlineS));
  const timeLimit = Number.isFinite(deadline) && deadline > 0
    ? Math.max(0, deadline - simTime)
    : Number(m && (m.expiresInS != null ? m.expiresInS : (m.timeLimitS != null ? m.timeLimitS : m.time_limit_s)));
  if (!Number.isFinite(timeLimit) || timeLimit <= 0) return null;
  const cfg = (state && state.missions && state.missions.config) || MISSION_TUNING;
  const cruise = Number(cfg && cfg.cruiseSpeedRef) || MISSION_TUNING.cruiseSpeedRef || 140;
  const distance = Math.max(0, Number(m && m.distance) || 0);
  const estimate = distance / Math.max(1, cruise) + missionTaskEstimate(m);
  const slack = estimate > 0 ? timeLimit / estimate : null;
  const critical = timeLimit <= TIMER_CRITICAL_S;
  const tight = critical || timeLimit <= TIMER_TIGHT_S || (slack != null && slack < 1.6);
  return {
    chip: {
      kind: critical ? 'bad' : (tight ? 'warn' : 'ok'),
      text: (critical ? 'Critical ' : (tight ? 'Tight ' : '')) + `${fmtClock(timeLimit)} timer`,
    },
    warning: critical
      ? 'Timer is critical; accept only if the route is staged and the ship is ready to launch.'
      : (tight ? 'Timer is tight for the route distance; refuel, repair, and launch directly after accepting.' : null),
    slack,
  };
}

export function missionShipReadiness(m, state) {
  const issues = [];
  const risk = missionRiskBand(m);
  const dangerous = risk >= 2 || DANGEROUS_MISSION_TYPES.has(m && m.type);
  const targetSectorId = missionDestSectorId(m);
  const currentSectorId = state && state.world && state.world.currentSectorId || null;
  const offSector = !!(targetSectorId && currentSectorId && targetSectorId !== currentSectorId);

  const hullFrac = shipHullFraction(state);
  if (hullFrac != null && (hullFrac < HULL_CRITICAL_FRAC || (dangerous && hullFrac < HULL_WARN_FRAC))) {
    const critical = hullFrac < HULL_CRITICAL_FRAC;
    issues.push({
      severity: critical ? 2 : 1,
      chip: { kind: critical ? 'bad' : 'warn', text: (critical ? 'Critical hull ' : 'Hull ') + fmtPct(hullFrac) },
      warning: critical
        ? 'Hull is critical; repair before accepting risky work.'
        : 'Hull is worn for a risky contract; repair before accepting combat or smuggling work.',
    });
  }

  const fuelFrac = shipFuelFraction(state);
  if (fuelFrac != null && (fuelFrac < FUEL_CRITICAL_FRAC || ((offSector || dangerous) && fuelFrac < FUEL_WARN_FRAC))) {
    const critical = fuelFrac < FUEL_CRITICAL_FRAC;
    issues.push({
      severity: critical ? 2 : 1,
      chip: { kind: critical ? 'bad' : 'warn', text: (critical ? 'Critical fuel ' : 'Fuel ') + fmtPct(fuelFrac) },
      warning: critical
        ? 'Fuel is critical; refuel before accepting routed work.'
        : (offSector ? 'Fuel is low for this route; refuel before launch.' : 'Fuel is low for risky work; refuel before accepting.'),
    });
  }

  issues.sort((a, b) => (b.severity - a.severity));
  return {
    chips: issues.map((issue) => issue.chip),
    warning: issues[0] ? issues[0].warning : null,
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

  const riskReward = missionRiskRewardSummary(m);
  chips.push(riskReward.chip);

  const standing = missionStandingRequirement(m, state);
  if (standing) {
    if (!standing.ok) blockers.push(standing.blocker);
    chips.push(standing.chip);
  }

  const route = missionRouteScope(m, state);
  if (route) chips.push(route);

  const routeIntel = missionRouteIntel(m, state);
  let routeIntelWarning = null;
  if (routeIntel) {
    chips.push(...routeIntel.chips);
    routeIntelWarning = routeIntel.warning || null;
  }

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
    const staging = missionCargoStaging(m, state);
    if (staging && staging.chip) chips.push(staging.chip);
    if (staging && staging.warning) warnings.push(staging.warning);
  }

  const shipReadiness = missionShipReadiness(m, state);
  for (const chip of shipReadiness.chips) chips.push(chip);
  if (shipReadiness.warning) warnings.push(shipReadiness.warning);
  if (routeIntelWarning) warnings.push(routeIntelWarning);
  if (pacingWarning) warnings.push(pacingWarning);

  return {
    blocker: blockers[0] || null,
    warning: warnings[0] || null,
    chips,
  };
}
