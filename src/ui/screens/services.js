// src/ui/screens/services.js — STATION "Services" tab panel.
// Refuel / repair hull / buy ammo / toggle insurance. Each action emits ui:service {type,amount};
// economy/world own the credit charge + the effect (§0.6, §4.4). Read-only over sim state.
//
// Prices are illustrative client-side previews; the owning system applies the authoritative cost.
const FUEL_CR_PER_UNIT = 3;     // refuel cost preview
const HULL_CR_PER_HP = 5;       // repair cost preview
const AMMO_BATCH = 100;         // munitions per ammo purchase
const AMMO_CR_PER_UNIT = 4;

function fmtCr(n) { return (Math.round(n) || 0).toLocaleString('en-US'); }

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
    let amount = 0;
    if (type === 'refuel') {
      amount = Math.max(0, (state.fuel.max || 0) - (state.fuel.current || 0));
    } else if (type === 'repair') {
      const e = state.entities.get(state.playerId);
      amount = e ? Math.max(0, (e.hullMax || 0) - (e.hull || 0)) : 0;
    } else if (type === 'ammo') {
      amount = AMMO_BATCH;
    } else if (type === 'insurance') {
      amount = state.player.insurance && state.player.insurance.insuredModules ? 0 : 1; // toggle intent
    }
    if ((type === 'refuel' || type === 'repair') && amount <= 0) {
      ctx.bus.emit('audio:cue', { id: 'ui_deny' });
      ctx.bus.emit('toast', { text: 'Nothing to ' + type, kind: 'info', ttl: 2 });
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
    const p = state.player;
    const e = state.entities.get(state.playerId);
    const frag = document.createDocumentFragment();
    for (const r of ROWS) {
      const offered = !svc || r.requires.length === 0 || r.requires.some((req) => svc.includes(req));
      let cost = 0, detail = r.desc;
      if (r.type === 'refuel') {
        const missing = Math.max(0, (state.fuel.max || 0) - (state.fuel.current || 0));
        cost = Math.round(missing * FUEL_CR_PER_UNIT);
        detail = 'Fuel ' + Math.round(state.fuel.current || 0) + '/' + Math.round(state.fuel.max || 0) +
          ' · ' + fmtCr(cost) + ' cr';
      } else if (r.type === 'repair') {
        const missing = e ? Math.max(0, (e.hullMax || 0) - (e.hull || 0)) : 0;
        cost = Math.round(missing * HULL_CR_PER_HP);
        detail = 'Hull ' + Math.round(e ? e.hull : 0) + '/' + Math.round(e ? e.hullMax : 0) +
          ' · ' + fmtCr(cost) + ' cr';
      } else if (r.type === 'ammo') {
        cost = AMMO_BATCH * AMMO_CR_PER_UNIT;
        detail = AMMO_BATCH + ' units · ' + fmtCr(cost) + ' cr';
      } else if (r.type === 'insurance') {
        const ins = p.insurance || {};
        detail = (ins.insuredModules ? 'Active' : 'Inactive') +
          ' · payout ' + Math.round((ins.rate || 0.6) * 100) + '% · deductible ' + fmtCr(ins.deductibleCr || 0);
      }
      const row = document.createElement('div');
      row.className = 'st-svc-row' + (offered ? '' : ' disabled');
      const btnLabel = r.type === 'insurance'
        ? ((p.insurance && p.insurance.insuredModules) ? 'Cancel' : 'Purchase')
        : ((r.type === 'refuel' || r.type === 'repair') && cost <= 0 ? 'Full' : r.label);
      const dis = !offered || (((r.type === 'refuel' || r.type === 'repair') && cost <= 0));
      row.innerHTML =
        '<div class="st-svc-info"><div class="st-svc-name">' + r.label + '</div>' +
        '<div class="st-svc-detail mono">' + detail + (offered ? '' : ' · not offered here') + '</div></div>' +
        '<button data-svc="' + r.type + '"' + (dis ? ' disabled' : '') + '>' + btnLabel + '</button>';
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
