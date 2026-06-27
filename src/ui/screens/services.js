// src/ui/screens/services.js — STATION "Services" tab panel.
// Refuel / repair hull / buy ammo / toggle insurance. Each action emits ui:service {type,amount};
// economy/world own the credit charge + the effect (§0.6, §4.4). Read-only over sim state.
import { COMMODITIES } from '../../data/commodities.js';
import { SERVICE_PRICES } from '../../systems/economy.js';

export const AMMO_BATCH = 100;         // munitions per ammo purchase
const MUNITIONS = COMMODITIES.find((c) => c.id === 'cmdty_munitions') || { volPerU: 1 };

function fmtCr(n) { return (Math.round(n) || 0).toLocaleString('en-US'); }

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
    const disabled = credits < cost;
    return {
      amount: missing,
      cost,
      detail: 'Fuel ' + current + '/' + max + ' · ' + Math.round(missing) + 'u @ ' + fmtCr(SERVICE_PRICES.fuelCrPerUnit) + ' cr/u',
      buttonLabel: 'Refuel',
      disabled,
      disabledReason: disabled ? 'need ' + fmtCr(cost - credits) + ' cr' : '',
      chips: disabled
        ? [{ text: fmtCr(cost) + ' cr', kind: 'cost' }, { text: 'need ' + fmtCr(cost - credits) + ' cr', kind: 'bad' }]
        : [{ text: fmtCr(cost) + ' cr', kind: 'cost' }, afterCreditsChip(credits, cost)],
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
    if (active) {
      return {
        amount: 0,
        cost: 0,
        detail: 'Active · payout ' + Math.round((ins.rate || 0.6) * 100) + '% · deductible ' + fmtCr(deductible) + ' cr',
        buttonLabel: 'Cancel',
        disabled: false,
        chips: [{ text: 'active', kind: 'ok' }],
      };
    }
    const disabled = credits < deductible;
    return {
      amount: 1,
      cost: deductible,
      detail: 'Inactive · payout ' + Math.round((ins.rate || 0.6) * 100) + '% · deductible ' + fmtCr(deductible) + ' cr',
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

export function createServicesPanel(ctx) {
  const root = document.createElement('div');
  root.className = 'st-panel st-services';
  root.innerHTML = '<div class="st-sub-h">Station Services</div><div class="st-svc-list"></div>';
  const list = root.querySelector('.st-svc-list');

  // Available services for the docked station (filtered against the station def's services[]).
  // We keep all four rows but disable any the station doesn't offer.
  const ROWS = [
    { type: 'refuel', label: 'Refuel', desc: 'Top off jump fuel', requires: ['refuel'] },
    { type: 'repair', label: 'Repair Hull', desc: 'Restore hull integrity', requires: ['repair'] },
    { type: 'ammo', label: 'Buy Munitions', desc: 'Restock missile/ammo stores', requires: ['trade', 'refuel'] },
    { type: 'insurance', label: 'Hull Insurance', desc: 'Reduce loss on destruction', requires: [] },
  ];

  list.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-svc]');
    if (!btn) return;
    const type = btn.getAttribute('data-svc');
    const state = ctx.state;
    const explicitAmount = Number(btn.getAttribute('data-amount'));
    let amount = 0;
    if (Number.isFinite(explicitAmount) && explicitAmount >= 0) {
      amount = explicitAmount;
    } else if (type === 'refuel') {
      amount = Math.max(0, (state.fuel.max || 0) - (state.fuel.current || 0));
    } else if (type === 'repair') {
      const e = state.entities.get(state.playerId);
      amount = repairMissing(e).total;
    } else if (type === 'ammo') {
      amount = AMMO_BATCH;
    } else if (type === 'insurance') {
      amount = state.player.insurance && state.player.insurance.insuredModules ? 0 : 1; // toggle intent
    }
    if ((type === 'refuel' || type === 'repair' || type === 'ammo') && amount <= 0) {
      ctx.bus.emit('audio:cue', { id: 'ui_deny' });
      ctx.bus.emit('toast', { text: type === 'ammo' ? 'No munitions can fit right now' : 'Nothing to ' + type, kind: 'info', ttl: 2 });
      return;
    }
    ctx.bus.emit('ui:service', { type, amount });
    ctx.bus.emit('audio:cue', { id: 'ui_click' });
    // optimistic refresh; the owning system's fuel:changed / cargo:changed / credits:changed
    // events trigger the real refresh through stationHub.
    refresh();
  });

  function stationServices() {
    const s = ctx.state;
    const sid = panel.stationId;
    // find the station def in the active sector or the sectors map.
    const sect = s.world && s.world.activeSector;
    let stn = sect && (sect.stations || []).find((x) => x.id === sid);
    if (!stn) {
      const sectors = s.world && s.world.sectors;
      for (const k in (sectors || {})) {
        const found = (sectors[k].stations || []).find((x) => x.id === sid);
        if (found) { stn = found; break; }
      }
    }
    return (stn && stn.services) || null;
  }

  function refresh() {
    const state = ctx.state;
    const svc = stationServices();
    const e = state.entities.get(state.playerId);
    const frag = document.createDocumentFragment();
    for (const r of ROWS) {
      const offered = !svc || r.requires.length === 0 || r.requires.some((req) => svc.includes(req));
      const quote = serviceQuote(r.type, state, e);
      const row = document.createElement('div');
      const dis = !offered || quote.disabled;
      row.className = 'st-svc-row' + (offered ? '' : ' disabled') + (quote.disabledReason ? ' st-svc-row--blocked' : '');
      const chips = (quote.chips || []).map((chip) =>
        '<span class="st-svc-chip st-svc-chip--' + (chip.kind || 'cost') + '">' + chip.text + '</span>').join('');
      const title = offered
        ? (quote.disabledReason || (quote.cost > 0 ? 'Spend ' + fmtCr(quote.cost) + ' credits.' : r.desc))
        : 'This station does not offer ' + r.label + '.';
      row.innerHTML =
        '<div class="st-svc-info"><div class="st-svc-name">' + r.label + '</div>' +
        '<div class="st-svc-detail mono">' + quote.detail + (offered ? '' : ' · not offered here') + '</div>' +
        '<div class="st-svc-meta">' + chips + '</div></div>' +
        '<button data-svc="' + r.type + '" data-amount="' + quote.amount + '" title="' + title + '" aria-label="' + title + '"' + (dis ? ' disabled' : '') + '>' + quote.buttonLabel + '</button>';
      frag.appendChild(row);
    }
    list.textContent = '';
    list.appendChild(frag);
  }

  const panel = {
    el: root,
    stationId: null,
    onShow(c) { if (c && c.stationId) this.stationId = c.stationId; refresh(); },
    refresh,
  };
  return panel;
}
