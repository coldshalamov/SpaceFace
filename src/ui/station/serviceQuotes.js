// Shared dock service quotes and readiness data.
// Live dock controls are rendered by stationApp.

import { COMMODITIES } from '../../data/commodities.js';
import { presenceServiceForStation } from '../../data/factionPresence.js';
import { SERVICE_PRICES, INSURANCE_DEFAULTS, loanLimitFor, cargoPolicyQuoteFor, serviceUnitCr, stationOffersService, stationServiceOutage, stationConditionsFor, stationRefuelRation, AMMO_BATCH } from '../../systems/economy.js';
import { stationConditionChips } from '../../economy/stationConditions.js';
import { livingHullCyclesSinceWash, livingHullGrimeAt } from '../../core/livingHull.js';
import { recoveryCostQuote } from '../../combat/playerDefeat.js';
import { stationControlAttrs } from './stationBindingMap.js';

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
        desc: 'Open the Shipyard for hulls and repairs.',
        available, disabledReason: available ? '' : `Requires Pitborn reputation ${stored.requiredRep}`,
        targetTab: 'shipyard',
      });
    if (stored.services.includes('fence')) rows.push({
        id: 'pitborn_fence', label: 'Pitborn Fence',
        desc: 'Open the Market, black market included.',
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
  if (stored.factionId === 'faction_helix' && stored.services.includes('directorate_audit')) {
    return [{
      id: 'directorate_audit',
      label: 'Helix Directorate Audit',
      desc: 'Submit your paperwork for a stamped rim-audit receipt.',
      available,
      disabledReason: available ? '' : `Requires Helix reputation ${stored.requiredRep}`,
      targetTab: null,
    }];
  }
  return [];
}

/** Dock palette / command-dock path into the live factionPresence service writer. */
export function runFactionPresenceDockAction(bus, state, stationId, serviceId) {
  const rows = factionPresenceServiceRows(state, stationId);
  const row = rows.find((entry) => entry && entry.id === serviceId) || null;
  if (!row || !bus || typeof bus.emit !== 'function') {
    return { ok: false, targetTab: null };
  }
  if (!row.available) {
    bus.emit('toast', {
      text: row.disabledReason || 'Faction desk unavailable',
      kind: 'warn',
      ttl: 3,
    });
    return { ok: false, targetTab: null, reason: row.disabledReason || '' };
  }
  bus.emit('ui:factionPresenceService', {
    stationId,
    serviceId,
    targetTab: row.targetTab || null,
  });
  return { ok: true, targetTab: row.targetTab || null };
}

export { AMMO_BATCH };                    // munitions per ammo purchase — owned by economy now
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
  { type: 'insurance', label: 'Hull Insurance', desc: 'Caps the station recovery fee; cargo loss still applies', requires: [] },
  { type: 'cargo_insurance', label: 'Cargo Insurance', desc: 'Cover the legal manifest for one trip', requires: [] },
  { type: 'loan', label: 'Take a Note', desc: 'Borrow against hull, hold, and standing', requires: [] },
  { type: 'settle', label: 'Settle the Note', desc: 'Pay down standing debt before it ages to bounty', requires: [] },
  { type: 'redeem_rights', label: 'Redeem Salvage Rights', desc: 'A Pitborn yard buys out claimed wreck rights', requires: [] },
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

// INF-089: the speakable reason a disabled service verb carries — exact blocking condition
// plus the nearest valid action. Only quotes that declare a disabledReason get one; done-state
// facts (full tank, intact hull) stay quiet spans, and advisory partials stay enabled.
export function disabledServiceWhy(quote) {
  if (!quote || !quote.disabled) return '';
  const parts = [quote.disabledReason, quote.remedy].map((s) => String(s || '').trim()).filter(Boolean);
  return parts.join(' — ');
}

function escWhyAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// INF-089: a dead-end verb that keeps its place in the tab order. aria-disabled (not disabled)
// so keyboard/controller focus can reach it; the whyReveal layer reads data-why on hover AND
// focus, and the click path toasts the same phrase instead of failing silently.
export function disabledVitalActHtml(id, label, text, why) {
  const copy = `${label} · ${text}`;
  return `<button type="button" ${stationControlAttrs(id)} class="k-word k-word--fine fh-key fh-key--small sxb-vital__act k-38"` +
    ` data-vital-act="${escWhyAttr(id)}" data-why="${escWhyAttr(why)}" aria-disabled="true"` +
    ` aria-label="${escWhyAttr(label + '. ' + why)}">${escWhyAttr(copy)}</button>`;
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

/**
 * THE WORLD REMEMBERS — the quote plus the berth's live memory of the pilot (strike / boom /
 * blockade chips and one reason). The price already carries it (serviceUnitCr); this only says why.
 */
export function serviceQuote(type, state, entity) {
  const quote = baseServiceQuote(type, state, entity);
  if (!quote || (type !== 'repair' && type !== 'refuel')) return quote;
  const stationId = state && state.ui && state.ui.dockedStationId;
  if (!stationId) return quote;
  const { chips, reason } = stationConditionChips(stationConditionsFor(state, stationId), type);
  if (!chips.length) return quote;
  return {
    ...quote,
    detail: reason && !quote.disabled ? `${quote.detail} · ${reason}` : quote.detail,
    chips: [...(Array.isArray(quote.chips) ? quote.chips : []), ...chips],
  };
}

function baseServiceQuote(type, state, entity) {
  const p = state && state.player || {};
  const credits = playerCredits(state);
  // One job per verb: the yard queues what it already holds, and a second booking of the same
  // type can never deliver (the live job already covers the deficit). The disabled path turns
  // the click into an honest line instead of a second charge.
  if ((type === 'repair' || type === 'refuel') && playerYardJobs(state).some((j) => j.type === type)) {
    const verb = type === 'refuel' ? 'refuel' : 'repair';
    return {
      amount: 0,
      cost: 0,
      detail: 'The yard is already working your ' + verb + ' job.',
      buttonLabel: type === 'refuel' ? 'Refuel' : 'Repair',
      disabled: true,
      disabledReason: 'the yard is already on your ' + verb + ' job — watch it finish or undock to cancel',
      chips: [{ text: 'yard busy', kind: 'warn' }],
    };
  }
  if (type === 'refuel') {
    // The berth's services list outranks the tank math: no pump here, no quote at all.
    if (!stationOffersService(state, 'refuel')) {
      return {
        amount: 0, cost: 0,
        detail: 'This berth has no fuel berth — refuel where the services list names it',
        buttonLabel: 'Refuel',
        disabled: true,
        disabledReason: 'no fuel berth here — try a trade hub or a depot',
        chips: [{ text: 'no pump', kind: 'bad' }],
      };
    }
    const fuel = state && state.fuel || { current: 0, max: 0 };
    const current = Math.round(fuel.current || 0);
    const max = Math.round(fuel.max || 0);
    const missingFull = Math.max(0, (fuel.max || 0) - (fuel.current || 0));
    // A blockaded berth rations the pumps (economy.stationRefuelRation): the quote only offers what
    // the pump will deliver, and says so when the tank is already at the ration.
    const missing = Math.min(missingFull, stationRefuelRation(state, state && state.ui && state.ui.dockedStationId, fuel));
    if (missingFull > 0 && missing <= 0) {
      return {
        amount: 0, cost: 0,
        detail: 'Fuel ' + current + '/' + max + ' · rationed — the pumps are shut to a tank this full while the blockade holds',
        buttonLabel: 'Rationed',
        disabled: true,
        disabledReason: 'fuel rationed behind the blockade',
        chips: [{ text: 'fuel rationed', kind: 'warn' }],
      };
    }
    const fuelUnit = serviceUnitCr(state, SERVICE_PRICES.fuelCrPerUnit, 'refuel');
    const cost = Math.round(missing * fuelUnit);
    if (missing <= 0) {
      return { amount: 0, cost: 0, detail: 'Fuel ' + current + '/' + max + ' · full', buttonLabel: 'Full', disabled: true, chips: [{ text: 'full', kind: 'ok' }] };
    }
    const affordableUnits = Math.max(0, Math.floor(credits / fuelUnit));
    if (credits < cost && affordableUnits <= 0) {
      // INF-089 dead end: broke with an empty tank. The blocking condition is exact and the
      // remedy names the nearest real credit source (cargo in the hold → Market sell).
      const carrying = Number(state && state.player && state.player.cargo && state.player.cargo.usedVolume) > 0;
      return {
        amount: 0,
        cost,
        detail: 'Fuel ' + current + '/' + max + ' · ' + Math.round(missing) + 'u @ ' + fmtCr(fuelUnit) + ' cr/u',
        buttonLabel: 'Refuel',
        disabled: true,
        disabledReason: 'need ' + fmtCr(fuelUnit) + ' cr/u',
        remedy: carrying
          ? 'Sell cargo at the Market to raise fuel money'
          : 'Take a station contract or sell salvage, then refuel',
        chips: [{ text: fmtCr(cost) + ' cr', kind: 'cost' }, { text: 'need ' + fmtCr(fuelUnit) + ' cr/u', kind: 'bad' }],
      };
    }
    if (credits < cost) {
      const partialCost = Math.round(affordableUnits * fuelUnit);
      return {
        amount: Math.min(missing, affordableUnits),
        cost: partialCost,
        detail: 'Fuel ' + current + '/' + max + ' · partial ' + affordableUnits + '/' + Math.round(missing) + 'u @ ' + fmtCr(fuelUnit) + ' cr/u',
        buttonLabel: 'Partial Refuel',
        disabled: false,
        chips: [{ text: fmtCr(partialCost) + ' / ' + fmtCr(cost) + ' cr', kind: 'warn' }, afterCreditsChip(credits, partialCost)],
      };
    }
    return {
      amount: missing,
      cost,
      detail: 'Fuel ' + current + '/' + max + ' · ' + Math.round(missing) + 'u @ ' + fmtCr(fuelUnit) + ' cr/u',
      buttonLabel: 'Refuel',
      disabled: false,
      chips: [{ text: fmtCr(cost) + ' cr', kind: 'cost' }, afterCreditsChip(credits, cost)],
    };
  }
  if (type === 'repair') {
    // Same berth contract as the pump: no yard here, no quote.
    if (!stationOffersService(state, 'repair')) {
      return {
        amount: 0, cost: 0,
        detail: 'This berth has no repair yard — weld where the services list names it',
        buttonLabel: 'Repair Hull',
        disabled: true,
        disabledReason: 'no repair yard here — try a station with repair services',
        chips: [{ text: 'no yard', kind: 'bad' }],
      };
    }
    // §15.6 C6 — the yard is down while a slammed ring is cleared (economy.stationServiceOutage).
    const outage = stationServiceOutage(state, state && state.ui && state.ui.dockedStationId, 'repair');
    if (outage) {
      const mins = Math.max(1, Math.ceil(outage.remainingS / 60));
      return {
        amount: 0, cost: 0,
        detail: 'Repair bay down — a hull went through the ring · back in ' + mins + ' min',
        buttonLabel: 'Repair Hull',
        disabled: true,
        disabledReason: 'repair bay down — a hull went through the ring',
        chips: [{ text: 'bay down ' + mins + ' min', kind: 'bad' }],
      };
    }
    const missing = repairMissing(entity);
    const repairUnit = serviceUnitCr(state, SERVICE_PRICES.repairCrPerHp, 'repair');
    const cost = Math.round(missing.total * repairUnit);
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
      const repairable = Math.max(1, Math.floor(credits / repairUnit));
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
    // Same berth contract as the pump and the weld: the wash runs at a repair berth.
    if (!stationOffersService(state, 'repair')) {
      return {
        amount: 0, cost: 0,
        detail: 'This berth has no repair yard — the wash runs where hulls are welded',
        buttonLabel: 'Wash Hull',
        disabled: true,
        disabledReason: 'no repair yard here — the wash runs at a repair berth',
        chips: [{ text: 'no yard', kind: 'bad' }],
      };
    }
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
  if (type === 'redeem_rights') {
    const rights = Math.max(0, Math.floor(Number(p.salvageRights) || 0));
    const dockedId = (state && state.ui && state.ui.dockedStationId) || null;
    // Same derivation the economy click-path applies (economy.js 'redeem_rights'): live
    // presence + rep availability — the stored record ignores requiredRep/available, so a
    // negative-Pitborn player would otherwise see an enabled verb that refuses on click.
    const reps = {};
    for (const [fid, row] of Object.entries((state && state.factions) || {})) {
      reps[fid] = Number(row && row.rep) || 0;
    }
    const presence = dockedId ? presenceServiceForStation(dockedId, reps) : null;
    const yard = !!(presence && presence.factionId === 'faction_pitborn'
      && Array.isArray(presence.services) && presence.services.length > 0
      && presence.available !== false);
    if (!yard) {
      return {
        amount: 0, cost: 0,
        detail: 'Claimed wreck rights cash out at a Pitborn yard or fence',
        buttonLabel: 'Redeem', disabled: true, disabledReason: 'pitborn yard only',
        chips: [{ text: 'pitborn yard only', kind: 'bad' }],
      };
    }
    if (rights <= 0) {
      return {
        amount: 0, cost: 0,
        detail: 'No claimed rights — rated stunts mint them in the field',
        buttonLabel: 'Redeem', disabled: true,
        chips: [{ text: 'none held', kind: 'warn' }],
      };
    }
    const payout = rights * SERVICE_PRICES.salvageRightCr;
    return {
      amount: rights, cost: payout, payout,
      detail: `${rights} right${rights === 1 ? '' : 's'} @ ${fmtCr(SERVICE_PRICES.salvageRightCr)} cr + Pitborn notice`,
      buttonLabel: 'Redeem', disabled: false,
      chips: [{ text: `+${fmtCr(payout)} cr`, kind: 'gain' }, { text: `+${rights} pitborn rep`, kind: 'ok' }],
    };
  }
  if (type === 'insurance') {
    // Ironman permadeath returns before the recovery path — no charge ever occurs, so a
    // policy can never pay. Say so instead of selling a strict no-op.
    const difficulty = state && state.settings && state.settings.gameplay && state.settings.gameplay.difficulty;
    if (difficulty === 'ironman') {
      return {
        amount: 0,
        cost: 0,
        detail: 'Permadeath — there is no recovery for a policy to cover.',
        buttonLabel: 'Purchase',
        disabled: true,
        disabledReason: 'ironman runs have no recovery to insure',
        chips: [{ text: 'no-op on ironman', kind: 'bad' }],
      };
    }
    // No policy on file prices exactly what the purchase click will charge: the lazy write
    // seeds INSURANCE_DEFAULTS before debiting, so quoting `{}` would promise a free 0-cr
    // deductible the click does not deliver.
    const ins = (p.insurance && typeof p.insurance === 'object')
      ? p.insurance
      : { rate: INSURANCE_DEFAULTS.rate, deductibleCr: INSURANCE_DEFAULTS.deductibleCr, insuredModules: false };
    const index = Math.max(0, Math.floor(Number(p.activeShipIndex) || 0));
    const owned = Array.isArray(p.ownedShips) ? p.ownedShips[index] : null;
    // Same hull the recovery plan would price: owned record, then the live entity's defId.
    const quote = recoveryCostQuote(
      (owned && owned.defId) || (entity && entity.data && entity.data.defId) || 'ship_kestrel', ins);
    const active = quote.insured === true;
    const deductible = quote.deductibleCr;
    const recovery = 'cargo loss still applies';
    if (active) {
      return {
        amount: 0,
        cost: 0,
        detail: quote.starter
          ? 'Active · ' + quote.shipName + ' recovery is the flat ' + fmtCr(deductible) + ' cr deductible either way · ' + recovery
          : 'Active · ' + quote.shipName + ' recovery ' + fmtCr(quote.uninsuredCostCr) + ' cr → ' + fmtCr(quote.insuredCostCr) + ' cr deductible · ' + recovery,
        buttonLabel: 'Cancel',
        disabled: false,
        chips: quote.starter
          ? [{ text: 'active', kind: 'ok' }]
          : [{ text: 'active', kind: 'ok' }, { text: 'covers ' + fmtCr(quote.coveredCostCr) + ' cr/loss', kind: 'gain' }],
      };
    }
    const disabled = credits < deductible;
    return {
      amount: 1,
      cost: deductible,
      detail: quote.starter
        ? 'Recovery on ' + quote.shipName + ' is the flat ' + fmtCr(deductible) + ' cr deductible either way — insurance pays on bigger hulls · ' + recovery
        : 'Recovery on ' + quote.shipName + ' · ' + fmtCr(quote.uninsuredCostCr) + ' cr uninsured → ' + fmtCr(quote.insuredCostCr) + ' cr insured · ' + recovery,
      buttonLabel: 'Purchase',
      disabled,
      disabledReason: disabled ? 'need ' + fmtCr(deductible - credits) + ' cr' : '',
      chips: disabled
        ? [{ text: fmtCr(deductible) + ' cr', kind: 'cost' }, { text: 'need ' + fmtCr(deductible - credits) + ' cr', kind: 'bad' }]
        : [{ text: fmtCr(deductible) + ' cr', kind: 'cost' },
           ...(quote.starter || quote.coveredCostCr <= 0
             ? []
             : [{ text: 'saves ' + fmtCr(quote.coveredCostCr) + ' cr/loss', kind: 'gain' }]),
           afterCreditsChip(credits, deductible)],
    };
  }
  if (type === 'cargo_insurance') {
    // Same ironman rule as hull recovery: permadeath never reaches the payout path, so the
    // premium would buy a strict no-op. Say so instead of selling it.
    const difficulty = state && state.settings && state.settings.gameplay && state.settings.gameplay.difficulty;
    if (difficulty === 'ironman') {
      return {
        amount: 0,
        cost: 0,
        detail: 'Permadeath — there is no recovery for a policy to pay on.',
        buttonLabel: 'Purchase',
        disabled: true,
        disabledReason: 'ironman runs have no recovery to insure',
        chips: [{ text: 'no-op on ironman', kind: 'bad' }],
      };
    }
    // FB-124 — the same quote the click applies: legal manifest × sector danger, one trip.
    const policy = p.cargoPolicy && typeof p.cargoPolicy === 'object' ? p.cargoPolicy : null;
    if (policy && Number(policy.coverCr) > 0) {
      return {
        amount: 0,
        cost: 0,
        detail: 'Active · manifest ' + fmtCr(policy.manifestCr) + ' cr · pays up to ' + fmtCr(policy.coverCr) + ' cr · ends next dock',
        buttonLabel: 'Covered',
        disabled: true,
        chips: [{ text: 'active', kind: 'ok' }],
      };
    }
    const quote = cargoPolicyQuoteFor(state);
    if (!quote) {
      return {
        amount: 0,
        cost: 0,
        detail: 'No legal cargo in the hold — nothing to cover',
        buttonLabel: 'Purchase',
        disabled: true,
        chips: [{ text: 'empty manifest', kind: 'warn' }],
      };
    }
    const disabled = credits < quote.premiumCr;
    return {
      amount: 1,
      cost: quote.premiumCr,
      detail: 'Manifest ' + fmtCr(quote.manifestCr) + ' cr · danger tier ' + quote.dangerTier
        + ' · pays ' + Math.round(quote.coverFrac * 100) + '% of lost value, up to ' + fmtCr(quote.coverCr) + ' cr · one trip',
      buttonLabel: 'Purchase',
      disabled,
      disabledReason: disabled ? 'need ' + fmtCr(quote.premiumCr - credits) + ' cr' : '',
      chips: disabled
        ? [{ text: fmtCr(quote.premiumCr) + ' cr', kind: 'cost' }, { text: 'need ' + fmtCr(quote.premiumCr - credits) + ' cr', kind: 'bad' }]
        : [{ text: fmtCr(quote.premiumCr) + ' cr', kind: 'cost' },
           { text: 'covers ' + fmtCr(quote.coverCr) + ' cr', kind: 'gain' },
           afterCreditsChip(credits, quote.premiumCr)],
    };
  }
  if (type === 'loan') {
    // FB-049 — the note as an instrument. The limit is the same function the click enforces.
    const dockedId = (state && state.ui && state.ui.dockedStationId) || null;
    const limit = loanLimitFor(state, dockedId);
    const debt = Math.max(0, Math.round(Number(p.debt) || 0));
    const room = Math.max(0, limit - debt);
    if (room <= 0) {
      return {
        amount: 0,
        cost: 0,
        detail: 'Note ' + fmtCr(debt) + ' cr · at the ' + fmtCr(limit) + ' cr limit',
        buttonLabel: 'Borrow',
        disabled: true,
        disabledReason: 'note is at its limit — settle first',
        chips: [{ text: 'at limit', kind: 'bad' }],
      };
    }
    return {
      amount: room,
      cost: 0,
      payout: room,
      detail: 'Borrow up to ' + fmtCr(room) + ' cr'
        + (debt > 0 ? ' · note already ' + fmtCr(debt) + ' cr' : '')
        + ' · stale notes levy 25%/day to bounty',
      buttonLabel: 'Borrow ' + fmtCr(room) + ' cr',
      disabled: false,
      chips: [{ text: '+' + fmtCr(room) + ' cr', kind: 'gain' },
              { text: 'note ' + fmtCr(debt + room) + ' cr', kind: 'warn' }],
    };
  }
  if (type === 'settle') {
    const debt = Math.max(0, Math.round(Number(p.debt) || 0));
    if (debt <= 0) {
      return {
        amount: 0,
        cost: 0,
        detail: 'No note on the ledger',
        buttonLabel: 'Settle',
        disabled: true,
        chips: [{ text: 'clear', kind: 'ok' }],
      };
    }
    const pay = Math.min(debt, Math.max(0, Math.round(credits)));
    const disabled = pay <= 0;
    return {
      amount: pay,
      cost: pay,
      detail: 'Note ' + fmtCr(debt) + ' cr · settle ' + fmtCr(pay) + ' cr now'
        + (debt - pay > 0 ? ' · ' + fmtCr(debt - pay) + ' cr still on the ledger' : ' · clears the ledger'),
      buttonLabel: 'Settle ' + fmtCr(pay) + ' cr',
      disabled,
      disabledReason: disabled ? 'need credits' : '',
      chips: disabled
        ? [{ text: fmtCr(debt) + ' cr owed', kind: 'cost' }, { text: 'need credits', kind: 'bad' }]
        : [{ text: fmtCr(pay) + ' cr', kind: 'cost' }, afterCreditsChip(credits, pay)],
    };
  }
  return { amount: 0, cost: 0, detail: '', buttonLabel: '', disabled: true, chips: [] };
}

// ── The yard, made visible ──────────────────────────────────────────────────────────────────
// stationServices simulates pads, crews and a job queue (and emits service:* events), but no
// dock surface ever read the slice — a paid job ran invisible, and undocking cancelled it in
// silence. These pure helpers turn the live state into what the player is owed: where the job
// stands, and what undocking would do to it.

export function playerYardJobs(state) {
  const s = state && state.stationServices;
  const jobs = s && s.player && Array.isArray(s.player.jobs) ? s.player.jobs : [];
  return jobs.filter(Boolean);
}

export function yardJobReadout(state) {
  const jobs = playerYardJobs(state);
  if (!jobs.length) return null;
  const s = state.stationServices;
  const player = s.player;
  const yardView = (s.stations && s.stations[player.stationId]) || null;
  const head = jobs[0];
  const label = head.type === 'refuel' ? 'Refuel' : 'Repair';
  const frac = head.total > 0 ? Math.max(0, Math.min(1, head.applied / head.total)) : 0;
  const pct = Math.round(frac * 100) + '%';
  let status;
  let value;
  let detail;
  let tone;
  if (player.padIdx < 0) {
    status = 'Holding';
    value = 'yard full';
    const waiting = yardView ? yardView.waitingClients : 0;
    detail = `No free pad — ${waiting} client${waiting === 1 ? '' : 's'} ahead of you`;
    tone = 'warn';
  } else if (head.status === 'active') {
    status = `${label} underway`;
    value = pct;
    const crewsBusy = yardView ? yardView.busyCrews : null;
    detail = `Pad ${player.padIdx + 1}` +
      (crewsBusy != null ? ` · ${crewsBusy} crew${crewsBusy === 1 ? '' : 's'} on the floor` : '');
    tone = 'ok';
  } else {
    status = `${label} queued`;
    value = '0%';
    detail = 'On the pad — waiting on a free crew';
    tone = 'warn';
  }
  const extra = jobs.length - 1;
  if (extra > 0) detail += ` · +${extra} more job${extra === 1 ? '' : 's'} queued`;
  return {
    label: 'Yard',
    status,
    value,
    detail,
    tone,
    frac,
    aria: `Yard: ${status}, ${value}. ${detail}`,
  };
}
