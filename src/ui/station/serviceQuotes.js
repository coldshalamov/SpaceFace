// Shared dock service quotes and readiness data.
// Live dock controls are rendered by stationApp.

import { COMMODITIES } from '../../data/commodities.js';
import { SERVICE_PRICES } from '../../systems/economy.js';
import { livingHullCyclesSinceWash, livingHullGrimeAt } from '../../core/livingHull.js';

export function factionPresenceServiceRows(state, stationId) {
  const own = state && state.factionPresence;
  const stored = own && own.servicesByStation && own.servicesByStation[stationId];
  if (!stored) return [];
  const rep = Number(state && state.factions && state.factions[stored.factionId] && state.factions[stored.factionId].rep) || 0;
  const available = stored.requiredRep == null || rep >= stored.requiredRep;
  if (stored.factionId === 'faction_archive' && stored.services.includes('reading_room')) {
    return [{
      id: 'archive_reading_room',
      label: 'Archive Reading Room',
      desc: 'Open a seeded, persistent redacted record.',
      available,
      disabledReason: available ? '' : `Requires Archive reputation ${stored.requiredRep}`,
      targetTab: null,
    }];
  }
  if (stored.factionId === 'faction_pitborn') {
    const rows = [];
    if (stored.services.includes('yard')) rows.push({
        id: 'pitborn_yard', label: 'Pitborn Yard',
        desc: 'Route to the existing Shipyard chassis and repair surface.',
        available, disabledReason: available ? '' : `Requires Pitborn reputation ${stored.requiredRep}`,
        targetTab: 'shipyard',
      });
    if (stored.services.includes('fence')) rows.push({
        id: 'pitborn_fence', label: 'Pitborn Fence',
        desc: 'Route to the existing Market and black-market trade surface.',
        available, disabledReason: available ? '' : `Requires Pitborn reputation ${stored.requiredRep}`,
        targetTab: 'market',
      });
    return rows;
  }
  if (stored.factionId === 'faction_understory' && stored.services.includes('wreck_buy')) {
    return [{
      id: 'understory_wreck_buy',
      label: 'Understory Wreck Buyer',
      desc: 'Review the newest loss-ledger hull this berth can appraise.',
      available,
      disabledReason: available ? '' : 'Understory appraisal unavailable',
      targetTab: null,
    }];
  }
  return [];
}

export const AMMO_BATCH = 100;         // munitions per ammo purchase
const MUNITIONS = COMMODITIES.find((c) => c.id === 'cmdty_munitions') || { volPerU: 1 };

const FUEL_WARN_FRAC = 0.45;
const FUEL_BAD_FRAC = 0.25;
const PROTECTION_WARN_FRAC = 0.7;
const PROTECTION_BAD_FRAC = 0.35;

const SERVICE_ROWS = Object.freeze([
  { type: 'refuel', label: 'Refuel', desc: 'Top off jump fuel', requires: ['refuel'] },
  { type: 'repair', label: 'Repair Hull', desc: 'Restore hull integrity', requires: ['repair'] },
  { type: 'hull_wash', label: 'Hull Wash', desc: 'Clear surface grime without erasing hull history', requires: ['repair'] },
  { type: 'ammo', label: 'Buy Munitions', desc: 'Restock missile/ammo stores', requires: ['trade', 'refuel'] },
  { type: 'insurance', label: 'Hull Insurance', desc: 'Station recovery payout; cargo loss still applies', requires: [] },
]);

function fmtCr(n) { return (Math.round(n) || 0).toLocaleString('en-US'); }

function fmtPct(frac) {
  return Math.round(Math.max(0, Math.min(1, Number(frac) || 0)) * 100) + '%';
}

function repairMissing(e) {
  if (!e) return { hull: 0, armor: 0, total: 0 };
  const hull = Math.max(0, (e.hullMax || 0) - (e.hull || 0));
  const armor = Math.max(0, (e.armorMax || 0) - (e.armorHp || 0));
  return { hull, armor, total: hull + armor };
}

function playerCredits(state) {
  return Math.max(0, Math.floor((state && state.player && state.player.credits) || 0));
}

function cargoFreeVolume(state) {
  const cargo = state && state.player && state.player.cargo || {};
  return Math.max(0, ((cargo.capVolume || 0) - (cargo.usedVolume || 0)));
}

function afterCreditsChip(credits, cost) {
  return { text: 'after ' + fmtCr(Math.max(0, credits - cost)) + ' cr', kind: 'ok' };
}

function serviceRow(type) {
  return SERVICE_ROWS.find((row) => row.type === type) || null;
}

function isServiceOffered(type, stationServices) {
  const row = serviceRow(type);
  if (!row) return false;
  if (!Array.isArray(stationServices)) return true;
  if (row.requires.length === 0) return true;
  return row.requires.some((req) => stationServices.includes(req));
}

function fuelMissing(state) {
  const fuel = state && state.fuel || {};
  return Math.max(0, (fuel.max || 0) - (fuel.current || 0));
}

function fuelFraction(state) {
  const fuel = state && state.fuel || {};
  const max = Number(fuel.max);
  if (!(max > 0)) return 1;
  return Math.max(0, Math.min(1, Number(fuel.current || 0) / max));
}

function protectionFraction(entity) {
  if (!entity) return 1;
  const hullMax = Number(entity.hullMax);
  const armorMax = Number(entity.armorMax);
  const hullFrac = hullMax > 0 ? Math.max(0, Math.min(1, Number(entity.hull || 0) / hullMax)) : 1;
  const armorFrac = armorMax > 0 ? Math.max(0, Math.min(1, Number(entity.armorHp || 0) / armorMax)) : 1;
  return Math.min(hullFrac, armorFrac);
}

function recommendationCandidate(service, quote, stationServices, opts) {
  const row = serviceRow(service);
  const offered = isServiceOffered(service, stationServices);
  const actionable = offered && !quote.disabled && quote.amount > 0;
  const blockedReason = offered
    ? (quote.disabledReason ? 'You need ' + quote.disabledReason.replace(/^need\s+/i, '') + ' before this service can clear the warning.' : 'This service is not actionable right now.')
    : 'This station does not offer ' + (row && row.label || service) + '.';
  return {
    service,
    type: actionable ? service : null,
    amount: actionable ? quote.amount : 0,
    cost: quote.cost || 0,
    actionLabel: actionable ? quote.buttonLabel : (offered ? 'Blocked' : 'Unavailable'),
    priority: opts.priority,
    kind: opts.kind,
    title: actionable ? opts.title : opts.blockedTitle,
    reason: actionable ? opts.reason : blockedReason + ' ' + opts.fallback,
    chips: quote.chips || [],
  };
}

export function serviceReadinessRecommendation(state, entity, stationServices = null) {
  const candidates = [];

  const fuelFrac = fuelFraction(state);
  if (fuelMissing(state) > 0 && fuelFrac < FUEL_WARN_FRAC) {
    const quote = serviceQuote('refuel', state, entity);
    candidates.push(recommendationCandidate('refuel', quote, stationServices, {
      priority: (fuelFrac < FUEL_BAD_FRAC ? 120 : 80) + Math.round((1 - fuelFrac) * 20),
      kind: fuelFrac < FUEL_BAD_FRAC ? 'bad' : 'warn',
      title: fuelFrac < FUEL_BAD_FRAC ? 'Refuel before undock' : 'Top off fuel reserve',
      blockedTitle: fuelFrac < FUEL_BAD_FRAC ? 'Fuel low; refuel blocked' : 'Fuel reserve thin; refuel blocked',
      reason: 'Fuel is at ' + fmtPct(fuelFrac) + '; top off now so route changes and jumps stay safe.',
      fallback: 'Keep the next hop local or find fuel soon.',
    }));
  }

  const missing = repairMissing(entity);
  const protFrac = protectionFraction(entity);
  if (missing.total > 0.5 && protFrac < PROTECTION_WARN_FRAC) {
    const quote = serviceQuote('repair', state, entity);
    candidates.push(recommendationCandidate('repair', quote, stationServices, {
      priority: (protFrac < PROTECTION_BAD_FRAC ? 130 : 75) + Math.round((1 - protFrac) * 20),
      kind: protFrac < PROTECTION_BAD_FRAC ? 'bad' : 'warn',
      title: protFrac < PROTECTION_BAD_FRAC ? 'Repair before undock' : 'Patch hull before risk work',
      blockedTitle: protFrac < PROTECTION_BAD_FRAC ? 'Hull critical; repair blocked' : 'Hull worn; repair blocked',
      reason: 'Protection is at ' + fmtPct(protFrac) + '; repair now before pirates, debris, or docking bumps tax the hull.',
      fallback: 'Avoid combat and high-speed impacts until you can repair.',
    }));
  }

  if (candidates.length) {
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0];
  }

  return {
    service: null,
    type: null,
    amount: 0,
    cost: 0,
    actionLabel: 'Ready',
    priority: 0,
    kind: 'ok',
    title: 'Services clear',
    reason: 'Fuel and hull are serviceable. Choose a job or trade route, then undock.',
    chips: [{ text: 'fuel ok', kind: 'ok' }, { text: 'hull ok', kind: 'ok' }],
  };
}

export function serviceQuote(type, state, entity) {
  const p = state && state.player || {};
  const credits = playerCredits(state);
  if (type === 'refuel') {
    const fuel = state && state.fuel || { current: 0, max: 0 };
    const current = Math.round(fuel.current || 0);
    const max = Math.round(fuel.max || 0);
    const missing = Math.max(0, (fuel.max || 0) - (fuel.current || 0));
    const cost = Math.round(missing * SERVICE_PRICES.fuelCrPerUnit);
    if (missing <= 0) {
      return { amount: 0, cost: 0, detail: 'Fuel ' + current + '/' + max + ' · full', buttonLabel: 'Full', disabled: true, chips: [{ text: 'full', kind: 'ok' }] };
    }
    const affordableUnits = Math.max(0, Math.floor(credits / SERVICE_PRICES.fuelCrPerUnit));
    if (credits < cost && affordableUnits <= 0) {
      return {
        amount: 0,
        cost,
        detail: 'Fuel ' + current + '/' + max + ' · ' + Math.round(missing) + 'u @ ' + fmtCr(SERVICE_PRICES.fuelCrPerUnit) + ' cr/u',
        buttonLabel: 'Refuel',
        disabled: true,
        disabledReason: 'need ' + fmtCr(SERVICE_PRICES.fuelCrPerUnit) + ' cr/u',
        chips: [{ text: fmtCr(cost) + ' cr', kind: 'cost' }, { text: 'need ' + fmtCr(SERVICE_PRICES.fuelCrPerUnit) + ' cr/u', kind: 'bad' }],
      };
    }
    if (credits < cost) {
      const partialCost = Math.round(affordableUnits * SERVICE_PRICES.fuelCrPerUnit);
      return {
        amount: Math.min(missing, affordableUnits),
        cost: partialCost,
        detail: 'Fuel ' + current + '/' + max + ' · partial ' + affordableUnits + '/' + Math.round(missing) + 'u @ ' + fmtCr(SERVICE_PRICES.fuelCrPerUnit) + ' cr/u',
        buttonLabel: 'Partial Refuel',
        disabled: false,
        chips: [{ text: fmtCr(partialCost) + ' / ' + fmtCr(cost) + ' cr', kind: 'warn' }, afterCreditsChip(credits, partialCost)],
      };
    }
    return {
      amount: missing,
      cost,
      detail: 'Fuel ' + current + '/' + max + ' · ' + Math.round(missing) + 'u @ ' + fmtCr(SERVICE_PRICES.fuelCrPerUnit) + ' cr/u',
      buttonLabel: 'Refuel',
      disabled: false,
      chips: [{ text: fmtCr(cost) + ' cr', kind: 'cost' }, afterCreditsChip(credits, cost)],
    };
  }
  if (type === 'repair') {
    const missing = repairMissing(entity);
    const cost = Math.round(missing.total * SERVICE_PRICES.repairCrPerHp);
    const hullText = 'Hull ' + Math.round(entity ? entity.hull : 0) + '/' + Math.round(entity ? entity.hullMax : 0);
    const armorText = 'Armor ' + Math.round(entity ? entity.armorHp || 0 : 0) + '/' + Math.round(entity ? entity.armorMax || 0 : 0);
    if (missing.total <= 0.5 || cost <= 0) {
      return { amount: 0, cost: 0, detail: hullText + ' · ' + armorText + ' · intact', buttonLabel: 'Full', disabled: true, chips: [{ text: 'intact', kind: 'ok' }] };
    }
    if (credits <= 0) {
      return {
        amount: missing.total,
        cost,
        detail: hullText + ' · ' + armorText + ' · full repair ' + fmtCr(cost) + ' cr',
        buttonLabel: 'Repair Hull',
        disabled: true,
        disabledReason: 'need credits',
        chips: [{ text: fmtCr(cost) + ' cr', kind: 'cost' }, { text: 'need credits', kind: 'bad' }],
      };
    }
    if (credits < cost) {
      const repairable = Math.max(1, Math.floor(credits / SERVICE_PRICES.repairCrPerHp));
      return {
        amount: missing.total,
        cost: credits,
        detail: hullText + ' · ' + armorText + ' · partial ' + fmtCr(repairable) + '/' + fmtCr(missing.total) + ' hp',
        buttonLabel: 'Partial Repair',
        disabled: false,
        chips: [{ text: fmtCr(credits) + ' / ' + fmtCr(cost) + ' cr', kind: 'warn' }, afterCreditsChip(credits, credits)],
      };
    }
    return {
      amount: missing.total,
      cost,
      detail: hullText + ' · ' + armorText + ' · full repair',
      buttonLabel: 'Repair Hull',
      disabled: false,
      chips: [{ text: fmtCr(cost) + ' cr', kind: 'cost' }, afterCreditsChip(credits, cost)],
    };
  }
  if (type === 'hull_wash') {
    const index = Math.max(0, Math.floor(Number(p.activeShipIndex) || 0));
    const owned = Array.isArray(p.ownedShips) ? p.ownedShips[index] : null;
    const now = Number(state && state.simTime) || 0;
    const cycles = livingHullCyclesSinceWash(owned && owned.livingHull, now);
    const grime = livingHullGrimeAt(owned && owned.livingHull, now);
    const cost = SERVICE_PRICES.hullWashCr;
    const historyNote = 'tallies, patches, scorch, and marks stay';
    if (grime <= 0.001) {
      return {
        amount: 0,
        cost: 0,
        detail: 'Surface grime 0% · hull history untouched',
        buttonLabel: 'Clean',
        disabled: true,
        chips: [{ text: 'clean', kind: 'ok' }],
      };
    }
    const disabled = credits < cost;
    return {
      amount: 1,
      cost,
      detail: 'Surface grime ' + Math.round(grime * 100) + '% · ' + cycles + ' cycle' + (cycles === 1 ? '' : 's') + ' since wash · ' + historyNote,
      buttonLabel: 'Wash Hull',
      disabled,
      disabledReason: disabled ? 'need ' + fmtCr(cost) + ' cr' : '',
      chips: [
        { text: fmtCr(cost) + ' cr', kind: 'cost' },
        ...(disabled ? [{ text: 'need credits', kind: 'bad' }] : [afterCreditsChip(credits, cost)]),
      ],
    };
  }
  if (type === 'ammo') {
    const vol = MUNITIONS.volPerU > 0 ? MUNITIONS.volPerU : 1;
    const holdUnits = Math.max(0, Math.floor(cargoFreeVolume(state) / vol));
    const affordUnits = Math.max(0, Math.floor(credits / SERVICE_PRICES.ammoCrPerUnit));
    const units = Math.max(0, Math.min(AMMO_BATCH, holdUnits, affordUnits));
    if (holdUnits <= 0) {
      return { amount: 0, cost: 0, detail: '0/' + AMMO_BATCH + ' units · hold full', buttonLabel: 'Buy Munitions', disabled: true, disabledReason: 'hold full', chips: [{ text: 'hold full', kind: 'bad' }] };
    }
    if (affordUnits <= 0) {
      return { amount: 0, cost: 0, detail: '0/' + AMMO_BATCH + ' units · ' + fmtCr(SERVICE_PRICES.ammoCrPerUnit) + ' cr/u', buttonLabel: 'Buy Munitions', disabled: true, disabledReason: 'need credits', chips: [{ text: 'need ' + fmtCr(SERVICE_PRICES.ammoCrPerUnit) + ' cr/u', kind: 'bad' }] };
    }
    const cost = Math.round(units * SERVICE_PRICES.ammoCrPerUnit);
    const limited = units < AMMO_BATCH;
    const limitReason = limited ? (holdUnits < AMMO_BATCH && holdUnits <= affordUnits ? 'hold-limited' : 'wallet-limited') : '';
    return {
      amount: units,
      cost,
      detail: units + '/' + AMMO_BATCH + ' units · uses ' + fmtCr(units * vol) + 'u hold',
      buttonLabel: limited ? 'Buy ' + units : 'Buy Munitions',
      disabled: false,
      chips: [{ text: fmtCr(cost) + ' cr', kind: 'cost' }, ...(limited ? [{ text: limitReason, kind: 'warn' }] : []), afterCreditsChip(credits, cost)],
    };
  }
  if (type === 'insurance') {
    const ins = p.insurance || {};
    const active = !!ins.insuredModules;
    const deductible = Math.max(0, Math.round(ins.deductibleCr || 0));
    const recovery = 'station recovery · cargo loss still applies';
    if (active) {
      return {
        amount: 0,
        cost: 0,
        detail: 'Active · ' + recovery + ' · payout ' + Math.round((ins.rate || 0.6) * 100) + '% · deductible ' + fmtCr(deductible) + ' cr',
        buttonLabel: 'Cancel',
        disabled: false,
        chips: [{ text: 'active', kind: 'ok' }],
      };
    }
    const disabled = credits < deductible;
    return {
      amount: 1,
      cost: deductible,
      detail: 'Inactive · ' + recovery + ' · payout ' + Math.round((ins.rate || 0.6) * 100) + '% · deductible ' + fmtCr(deductible) + ' cr',
      buttonLabel: 'Purchase',
      disabled,
      disabledReason: disabled ? 'need ' + fmtCr(deductible - credits) + ' cr' : '',
      chips: disabled
        ? [{ text: fmtCr(deductible) + ' cr', kind: 'cost' }, { text: 'need ' + fmtCr(deductible - credits) + ' cr', kind: 'bad' }]
        : [{ text: fmtCr(deductible) + ' cr', kind: 'cost' }, afterCreditsChip(credits, deductible)],
    };
  }
  return { amount: 0, cost: 0, detail: '', buttonLabel: '', disabled: true, chips: [] };
}
