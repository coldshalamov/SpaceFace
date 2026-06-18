// src/ui/screens/automationPanel.js — Automation / passive-fleet screen (ARCHITECTURE §5, spec 09).
// Tabs: Drones / Traders / Outposts / Fleet. Reads state.automation (+ static defs for the
// purchasable catalog). Buy / assign / order buttons emit ui:fleetOrder{shipId,order,targetRef}
// (the automation system is the sole handler — §4.4). Shows passive-income rate + a passive-cap
// bar derived from the active-income reference curve. READ-ONLY on state; emits intents only.
//
// Export: automationScreen  (id 'automation'). No 'three' import.

import { DRONES, TRADERS, OUTPOSTS, AUTO_BALANCE } from '../../data/automation.js';

const TABS = [
  { id: 'drones',   label: 'Drones'   },
  { id: 'traders',  label: 'Traders'  },
  { id: 'outposts', label: 'Outposts' },
  { id: 'fleet',    label: 'Fleet'    },
];

const STYLE_ID = 'sf-automation-style';
const CSS = `
#sf-automation { width: min(92vw, 1000px); height: min(88vh, 720px); display: flex; flex-direction: column;
  background: linear-gradient(180deg, var(--panel-2), var(--panel)); border: 1px solid var(--panel-edge);
  border-radius: 10px; box-shadow: 0 12px 48px rgba(0,0,0,.6); overflow: hidden; pointer-events: auto; }
#sf-automation .au-head { padding: 12px 18px; border-bottom: 1px solid var(--panel-edge); background: rgba(8,14,26,.7);
  display: flex; flex-direction: column; gap: 10px; }
#sf-automation .au-top { display: flex; align-items: center; justify-content: space-between; }
#sf-automation .au-title { font-size: 1.2em; letter-spacing: .12em; text-transform: uppercase; color: var(--accent);
  text-shadow: 0 0 12px rgba(57,208,255,.5); }
#sf-automation .au-credits { font-family: var(--mono); font-size: .9em; color: var(--energy); }
#sf-automation .au-income { display: flex; align-items: center; gap: 14px; font-family: var(--mono); font-size: .8em; }
#sf-automation .au-income .lbl { color: var(--ink-dim); }
#sf-automation .au-income .val { color: var(--accent-2); font-weight: 700; }
#sf-automation .au-capbar { flex: 1; height: 12px; border-radius: 6px; background: rgba(10,18,30,.9);
  border: 1px solid var(--panel-edge); position: relative; overflow: hidden; min-width: 120px; }
#sf-automation .au-capfill { position: absolute; left: 0; top: 0; bottom: 0; width: 0%;
  background: linear-gradient(90deg, var(--accent-2), var(--accent)); transition: width .2s ease; }
#sf-automation .au-captxt { font-family: var(--mono); font-size: .72em; color: var(--ink-dim); white-space: nowrap; }
#sf-automation .au-tabs { display: flex; gap: 4px; }
#sf-automation .au-tab { padding: 6px 16px; font-size: .82em; letter-spacing: .06em; text-transform: uppercase;
  border-radius: 6px 6px 0 0; }
#sf-automation .au-tab.active { background: rgba(57,208,255,.14); border-color: var(--accent); color: #fff;
  text-shadow: 0 0 8px rgba(57,208,255,.5); }
#sf-automation .au-body { flex: 1; overflow-y: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 18px; }
#sf-automation .au-section-h { font-family: var(--mono); font-size: .76em; letter-spacing: .14em; text-transform: uppercase;
  color: var(--ink-mute); border-bottom: 1px solid var(--panel-edge); padding-bottom: 5px; margin-bottom: 2px; }
#sf-automation .au-card { display: flex; align-items: center; gap: 14px; padding: 11px 13px;
  background: rgba(10,18,30,.6); border: 1px solid var(--panel-edge); border-radius: 8px; }
#sf-automation .au-card .nm { font-size: .96em; color: var(--ink); }
#sf-automation .au-card .meta { font-family: var(--mono); font-size: .76em; color: var(--ink-dim); margin-top: 3px;
  display: flex; gap: 14px; flex-wrap: wrap; }
#sf-automation .au-card .grow { flex: 1; min-width: 0; }
#sf-automation .au-card button { padding: 7px 14px; white-space: nowrap; }
#sf-automation .au-buy { background: rgba(98,224,138,.12); border-color: var(--good); color: #d9ffe7; }
#sf-automation .au-buy:hover { border-color: var(--good); }
#sf-automation .au-order { background: rgba(57,208,255,.1); border-color: var(--accent-2); }
#sf-automation .au-recall { background: rgba(255,84,112,.1); border-color: var(--danger); color: #ffd6dd; }
#sf-automation .au-empty { font-size: .84em; color: var(--ink-mute); font-style: italic; padding: 6px 0; }
#sf-automation .au-pill { font-family: var(--mono); font-size: .68em; padding: 1px 7px; border-radius: 10px;
  border: 1px solid var(--panel-edge); color: var(--ink-dim); }
#sf-automation .au-pill.ok { color: var(--good); border-color: rgba(98,224,138,.5); }
#sf-automation .au-pill.warn { color: var(--warn); border-color: rgba(255,179,71,.5); }
#sf-automation .au-pill.bad { color: var(--danger); border-color: rgba(255,84,112,.5); }
#sf-automation .au-program-row { display:flex; align-items:center; gap:8px; margin-top:6px; }
#sf-automation .au-program-label { font-size:.7em; color:var(--ink-mute); letter-spacing:.04em; text-transform:uppercase; }
#sf-automation .au-program { font-family:var(--mono); font-size:.78em; padding:3px 8px; border-radius:4px;
  background:var(--panel); color:var(--ink); border:1px solid var(--panel-edge); cursor:pointer; }
#sf-automation .au-program-badge { font-family:var(--mono); font-size:.66em; padding:1px 6px; border-radius:8px;
  background:rgba(57,208,255,.12); color:var(--accent); border:1px solid rgba(57,208,255,.4); margin-left:6px; }
#sf-automation .au-minibar { width: 90px; height: 6px; border-radius: 3px; background: rgba(20,28,42,.9);
  overflow: hidden; display: inline-block; vertical-align: middle; }
#sf-automation .au-minibar > i { display: block; height: 100%; background: var(--good); }
#sf-automation .au-locked { font-size: .8em; color: var(--warn); }
`;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

export const automationScreen = {
  id: 'automation',
  _ctx: null,
  _root: null,
  _tab: 'drones',

  mount(rootEl, ctx) {
    injectStyle();
    this._ctx = ctx;
    this._root = rootEl;
    rootEl.id = 'sf-automation';
    rootEl.innerHTML = `
      <div class="au-head">
        <div class="au-top">
          <div class="au-title">Automation</div>
          <div class="au-credits">CR <span data-cr>0</span></div>
        </div>
        <div class="au-income">
          <span class="lbl">PASSIVE</span><span class="val" data-rate>0 cr/min</span>
          <div class="au-capbar"><div class="au-capfill" data-capfill></div></div>
          <span class="au-captxt" data-captxt>cap —</span>
        </div>
        <div class="au-tabs" data-tabs>
          ${TABS.map((t) => `<button class="au-tab" data-tab="${t.id}">${t.label}</button>`).join('')}
        </div>
      </div>
      <div class="au-body" data-body></div>`;

    rootEl.querySelector('[data-tabs]').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tab]');
      if (btn) { this._tab = btn.dataset.tab; this.refresh(this._ctx); }
    });

    // one delegated listener for all action buttons in the body
    rootEl.querySelector('[data-body]').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (btn) this._onAction(btn.dataset.act, btn.dataset.ref, btn.dataset.kind);
    });
    // V2 §4 / cut-list #28: program dropdown change handler (selects don't fire 'click').
    rootEl.querySelector('[data-body]').addEventListener('change', (e) => {
      const sel = e.target.closest('select[data-act="assignProgram"]');
      if (!sel) return;
      this._onAction('assignProgram', sel.dataset.ref, sel.dataset.kind, sel.value);
    });
  },

  onShow(ctx) { if (ctx) this._ctx = ctx; this.refresh(this._ctx); },
  onHide() { /* cached DOM retained */ },

  refresh(ctx) {
    if (ctx) this._ctx = ctx;
    if (!this._root) return;
    this._syncHeader();
    this._syncTabs();
    this._renderBody();
  },

  // ---- internals ----------------------------------------------------------
  _auto() {
    const st = this._ctx.state;
    return st.automation || { drones: [], traders: [], outposts: [], fleet: [], fleetCap: 0,
      meta: {}, accumulators: {}, balance: AUTO_BALANCE };
  },

  _balance() {
    const a = this._auto();
    return a.balance || AUTO_BALANCE;
  },

  // Player progression tier — used to bound the passive cap and gate higher-tier assets.
  // Derived from droneTierCap (set by tech) so the panel matches what the player has unlocked.
  _playerTier() {
    const st = this._ctx.state;
    const cap = (st.player && st.player.droneTierCap) || 1;
    return Math.max(1, Math.min(5, cap));
  },

  _passiveCapPerMin() {
    const bal = this._balance();
    const ref = bal.activeRefByTier || AUTO_BALANCE.activeRefByTier;
    const tier = this._playerTier();
    const active = ref[Math.min(tier, ref.length) - 1] || ref[0];
    const frac = bal.passiveCapFrac != null ? bal.passiveCapFrac : 0.45;
    return active * frac;
  },

  // current passive rate: sum of net (income - upkeep) across deployed assets.
  _currentRatePerMin() {
    const a = this._auto();
    let rate = 0;
    for (const d of a.drones || []) rate += (d.ratePerMin != null ? d.ratePerMin : estDroneRate(d)) - (d.upkeepPerMin || 0);
    for (const t of a.traders || []) rate += (t.ratePerMin != null ? t.ratePerMin : 0) - (t.upkeepPerMin || 0);
    for (const o of a.outposts || []) rate += (o.ratePerMin != null ? o.ratePerMin : 0) - (o.upkeepPerMin || 0);
    return rate;
  },

  _syncHeader() {
    const st = this._ctx.state;
    const cr = this._root.querySelector('[data-cr]');
    if (cr) cr.textContent = ((st.player && st.player.credits) || 0).toLocaleString();

    const rate = this._currentRatePerMin();
    const cap = this._passiveCapPerMin();
    const rateEl = this._root.querySelector('[data-rate]');
    if (rateEl) rateEl.textContent = `${Math.round(rate)} cr/min`;
    const fill = this._root.querySelector('[data-capfill]');
    if (fill) fill.style.width = (cap > 0 ? Math.max(0, Math.min(100, (rate / cap) * 100)) : 0).toFixed(1) + '%';
    const captxt = this._root.querySelector('[data-captxt]');
    if (captxt) captxt.textContent = `cap ${Math.round(cap)} cr/min`;
  },

  _syncTabs() {
    for (const b of this._root.querySelectorAll('[data-tab]')) {
      b.classList.toggle('active', b.dataset.tab === this._tab);
    }
  },

  _renderBody() {
    const body = this._root.querySelector('[data-body]');
    const frag = document.createDocumentFragment();
    if (this._tab === 'drones') this._renderDrones(frag);
    else if (this._tab === 'traders') this._renderTraders(frag);
    else if (this._tab === 'outposts') this._renderOutposts(frag);
    else this._renderFleet(frag);
    body.replaceChildren(frag);
  },

  _section(title) {
    const h = document.createElement('div');
    h.className = 'au-section-h';
    h.textContent = title;
    return h;
  },

  _renderDrones(frag) {
    const a = this._auto();
    const owned = a.drones || [];
    const tier = this._playerTier();

    frag.appendChild(this._section(`Deployed Drones (${owned.length})`));
    if (!owned.length) {
      frag.appendChild(emptyEl('No drones deployed. Purchase a mining drone below.'));
    } else {
      for (const d of owned) {
        const def = DRONES.find((x) => x.id === d.defId) || d;
        const buf = d.buffer != null ? d.buffer : 0;
        const bufCap = def.bufferCap || 1;
        const fuelPct = d.fuelMax ? (d.fuel || 0) / d.fuelMax : (def.fuelMax ? (d.fuel || 0) / def.fuelMax : 1);
        // V2 §4 / cut-list #28: program dropdown. Shows the drone's current alphabet template (or
        // Manual for the legacy mine-to-buffer loop). Switching emits assignProgram.
        const curTpl = (d.program && d.program.templateId) || '';
        const programOpts = [
          ['manual', 'Manual (mine→bank)', ''],
          ['mine_to_depot', 'Mine → Haul → Sell', 'mine_to_depot'],
          ['patrol_guard', 'Guard Player', 'patrol_guard'],
          ['scout_report', 'Scout → Report', 'scout_report'],
        ].map(([v, label, id]) => `<option value="${id}" ${curTpl === id ? 'selected' : ''}>${label}</option>`).join('');
        const programBadge = curTpl ? ` <span class="au-program-badge">⚙ ${curTpl}</span>` : '';
        const card = document.createElement('div');
        card.className = 'au-card';
        card.innerHTML = `
          <div class="grow">
            <div class="nm">${prettyId(def.id)} ${statusPill(d.status)}${programBadge}</div>
            <div class="meta">
              <span>tier ${def.tier}</span>
              <span>mine ${def.mineRate}/s</span>
              <span>buffer ${Math.round(buf)}/${bufCap} ${miniBar(buf / bufCap)}</span>
              <span>fuel ${miniBar(fuelPct)}</span>
              <span>upkeep ${def.upkeepPerMin}/min</span>
            </div>
            <div class="au-program-row">
              <span class="au-program-label">Program:</span>
              <select class="au-program" data-act="assignProgram" data-ref="${d.id != null ? d.id : def.id}" data-kind="drone">${programOpts}</select>
            </div>
          </div>
          <button class="au-order" data-act="recall" data-ref="${d.id != null ? d.id : def.id}" data-kind="drone">Recall</button>`;
        frag.appendChild(card);
      }
    }

    frag.appendChild(this._section('Drone Bay — Purchase'));
    const cap = this._balance().fleetCapByTier ? null : null; // drones gated by tier, not fleetCap
    for (const def of DRONES) {
      const locked = def.tier > tier;
      const card = document.createElement('div');
      card.className = 'au-card';
      card.innerHTML = `
        <div class="grow">
          <div class="nm">${prettyId(def.id)} ${locked ? `<span class="au-locked">⛔ requires drone tier ${def.tier}</span>` : ''}</div>
          <div class="meta">
            <span>mine ${def.mineRate}/s</span>
            <span>buffer ${def.bufferCap}</span>
            <span>range ${def.deployRange}</span>
            <span>upkeep ${def.upkeepPerMin}/min</span>
          </div>
        </div>
        <button class="au-buy" data-act="buyDrone" data-ref="${def.id}" ${locked ? 'disabled' : ''}>Buy ${fmtCr(def.cost)} cr</button>`;
      frag.appendChild(card);
    }
  },

  _renderTraders(frag) {
    const a = this._auto();
    const owned = a.traders || [];
    const st = this._ctx.state;
    const hireUnlocked = (st.player && st.player.researchedNodes || []).includes('tech_autonomous_fleets');

    frag.appendChild(this._section(`Active Traders (${owned.length})`));
    if (!owned.length) {
      frag.appendChild(emptyEl('No NPC traders hired.'));
    } else {
      for (const t of owned) {
        const def = TRADERS.find((x) => x.id === t.defId) || t;
        const card = document.createElement('div');
        card.className = 'au-card';
        const route = t.route ? `${t.route.from || '?'} → ${t.route.to || '?'}` : 'idle (assign route)';
        card.innerHTML = `
          <div class="grow">
            <div class="nm">${prettyId(def.id)} ${statusPill(t.status)}</div>
            <div class="meta">
              <span>cargo ${def.cargoVol}u</span>
              <span>cycle ${def.cycleTime}s</span>
              <span>route ${route}</span>
              <span>upkeep ${def.upkeepPerMin}/min</span>
            </div>
          </div>
          <button class="au-order" data-act="assignRoute" data-ref="${t.id != null ? t.id : def.id}" data-kind="trader">Route</button>
          <button class="au-recall" data-act="dismiss" data-ref="${t.id != null ? t.id : def.id}" data-kind="trader">Dismiss</button>`;
        frag.appendChild(card);
      }
    }

    frag.appendChild(this._section('Hire Trader'));
    if (!hireUnlocked) {
      frag.appendChild(lockedEl('NPC trader hiring requires the Autonomous Fleets tech.'));
    }
    for (const def of TRADERS) {
      const card = document.createElement('div');
      card.className = 'au-card';
      card.innerHTML = `
        <div class="grow">
          <div class="nm">${prettyId(def.id)}</div>
          <div class="meta">
            <span>cargo ${def.cargoVol}u</span>
            <span>cycle ${def.cycleTime}s</span>
            <span>eff ${Math.round(def.tradeEff * 100)}%</span>
            <span>loss/cycle ${Math.round(def.baseLossPerCycle * 100)}%</span>
            <span>upkeep ${def.upkeepPerMin}/min</span>
          </div>
        </div>
        <button class="au-buy" data-act="hireTrader" data-ref="${def.id}" ${hireUnlocked ? '' : 'disabled'}>Hire ${fmtCr(def.hireCost)} cr</button>`;
      frag.appendChild(card);
    }
  },

  _renderOutposts(frag) {
    const a = this._auto();
    const owned = a.outposts || [];
    const st = this._ctx.state;
    const buildUnlocked = (st.player && st.player.researchedNodes || []).includes('tech_outpost_charter');

    frag.appendChild(this._section(`Outposts (${owned.length})`));
    if (!owned.length) {
      frag.appendChild(emptyEl('No outposts established.'));
    } else {
      for (const o of owned) {
        const def = OUTPOSTS.find((x) => x.id === o.defId) || o;
        const stor = o.storage != null ? o.storage : 0;
        const cap = def.storageCap || 1;
        const card = document.createElement('div');
        card.className = 'au-card';
        card.innerHTML = `
          <div class="grow">
            <div class="nm">${prettyId(def.id)} ${statusPill(o.status)} <span class="au-pill">${o.sectorId ? prettyId(o.sectorId) : 'unsited'}</span></div>
            <div class="meta">
              <span>${recipeText(def.recipe)}</span>
              <span>storage ${Math.round(stor)}/${cap} ${miniBar(stor / cap)}</span>
              <span>defense ${def.defense}</span>
              <span>upkeep ${def.upkeepPerMin}/min</span>
            </div>
          </div>
          <button class="au-recall" data-act="decommission" data-ref="${o.id != null ? o.id : def.id}" data-kind="outpost">Decommission</button>`;
        frag.appendChild(card);
      }
    }

    frag.appendChild(this._section('Construct Outpost'));
    if (!buildUnlocked) {
      frag.appendChild(lockedEl('Outpost construction requires the Outpost Charter tech.'));
    }
    for (const def of OUTPOSTS) {
      const card = document.createElement('div');
      card.className = 'au-card';
      card.innerHTML = `
        <div class="grow">
          <div class="nm">${prettyId(def.id)}</div>
          <div class="meta">
            <span>${recipeText(def.recipe)}</span>
            <span>out ${def.outRate}/s</span>
            <span>storage ${def.storageCap}</span>
            <span>defense ${def.defense}</span>
            <span>upkeep ${def.upkeepPerMin}/min</span>
          </div>
        </div>
        <button class="au-buy" data-act="buildOutpost" data-ref="${def.id}" ${buildUnlocked ? '' : 'disabled'}>Build ${fmtCr(def.buildCost)} cr</button>`;
      frag.appendChild(card);
    }
  },

  _renderFleet(frag) {
    const a = this._auto();
    const fleet = a.fleet || [];
    const cap = a.fleetCap || (this._balance().fleetCapByTier || AUTO_BALANCE.fleetCapByTier || [2])[this._playerTier() - 1] || 0;

    const h = this._section(`Escort / Wingmen Fleet (${fleet.length}/${cap})`);
    frag.appendChild(h);

    if (!fleet.length) {
      frag.appendChild(emptyEl('No wingmen in your fleet. Owned ships can be assigned as AI escorts.'));
    } else {
      for (const fs of fleet) {
        const card = document.createElement('div');
        card.className = 'au-card';
        const order = fs.order || 'escort';
        card.innerHTML = `
          <div class="grow">
            <div class="nm">${fs.name || prettyId(fs.defId || 'wingman')} ${statusPill(fs.status)}</div>
            <div class="meta">
              <span>order ${order}</span>
              ${fs.hullPct != null ? `<span>hull ${Math.round(fs.hullPct * 100)}% ${miniBar(fs.hullPct)}</span>` : ''}
            </div>
          </div>
          <button class="au-order" data-act="orderEscort" data-ref="${fs.id != null ? fs.id : fs.defId}" data-kind="fleet">Escort</button>
          <button class="au-order" data-act="orderMine" data-ref="${fs.id != null ? fs.id : fs.defId}" data-kind="fleet">Mine</button>
          <button class="au-recall" data-act="orderRecall" data-ref="${fs.id != null ? fs.id : fs.defId}" data-kind="fleet">Recall</button>`;
        frag.appendChild(card);
      }
    }

    // assignable owned ships (anything beyond the active hull can be tasked)
    const st = this._ctx.state;
    const owned = (st.player && st.player.ownedShips) || [];
    const activeIdx = (st.player && st.player.activeShipIndex) || 0;
    frag.appendChild(this._section('Assign Owned Ship'));
    const assignable = owned.map((s, i) => ({ s, i })).filter(({ i }) => i !== activeIdx);
    if (!assignable.length) {
      frag.appendChild(emptyEl('No spare ships to assign. Buy additional hulls at a shipyard.'));
    } else if (fleet.length >= cap) {
      frag.appendChild(lockedEl(`Fleet at capacity (${cap}). Research higher Drone/Fleet tiers to expand.`));
    } else {
      for (const { s, i } of assignable) {
        const card = document.createElement('div');
        card.className = 'au-card';
        card.innerHTML = `
          <div class="grow">
            <div class="nm">${s.customName || prettyId(s.defId)}</div>
            <div class="meta"><span>${prettyId(s.defId)}</span></div>
          </div>
          <button class="au-buy" data-act="assignFleet" data-ref="${i}" data-kind="ownedShip">Assign as Wingman</button>`;
        frag.appendChild(card);
      }
    }
  },

  // ---- intent dispatch ----------------------------------------------------
  // `extra` carries the selected value for <select>-driven actions (e.g. assignProgram templateId).
  _onAction(act, ref, kind, extra) {
    const bus = this._ctx.bus;
    // single intent channel into automation: ui:fleetOrder {shipId, order, targetRef} (§4.4).
    // shipId carries the instance id for existing assets; targetRef carries the catalog defId or
    // owned-ship index for purchase/assign orders. order is the verb the automation system switches on.
    const toastFor = {
      buyDrone: 'Deploying mining drone…',
      recall: 'Recalling asset…',
      hireTrader: 'Hiring NPC trader…',
      assignRoute: 'Assigning trade route…',
      dismiss: 'Dismissing trader…',
      buildOutpost: 'Constructing outpost…',
      decommission: 'Decommissioning outpost…',
      orderEscort: 'Order: escort.',
      orderMine: 'Order: mine.',
      orderRecall: 'Order: recall.',
      assignFleet: 'Assigning wingman…',
      assignProgram: 'Assigning drone program…',
    };

    // For purchases/assigns the instance does not exist yet → shipId null, targetRef = defId/index.
    const purchaseLike = ['buyDrone', 'hireTrader', 'buildOutpost', 'assignFleet'];
    const isPurchase = purchaseLike.includes(act);
    // assignProgram targets an EXISTING drone (shipId = ref) with the templateId as targetRef.
    const isProgram = act === 'assignProgram';

    bus.emit('ui:fleetOrder', {
      shipId: (isPurchase) ? null : numOr(ref),
      order: act,
      targetRef: isProgram ? (extra || null) : ref,
      kind: kind || null,
    });

    if (toastFor[act]) bus.emit('toast', { text: toastFor[act], kind: 'info', ttl: 2500 });

    // refresh in case automation handled synchronously; otherwise it re-emits change events the
    // uiRoot will route back to refresh() anyway.
    this.refresh(this._ctx);
  },
};

// ---- helpers ----------------------------------------------------------------
function estDroneRate(d) {
  // rough passive estimate when the asset hasn't reported a ratePerMin: mineRate (u/s) * 60 * a
  // nominal ore value. Display-only; the authoritative number comes from automation when present.
  const def = DRONES.find((x) => x.id === d.defId) || d;
  return (def.mineRate || 0) * 60 * 2; // ~2 cr per ore-u placeholder for display
}

function recipeText(r) {
  if (!r) return 'idle';
  if (r.passive) return `passive ${r.creditGen || 0} cr/s`;
  const ins = r.inputs ? Object.entries(r.inputs).map(([k, v]) => `${v}×${prettyId(k)}`).join('+') : '?';
  const out = r.output ? Object.entries(r.output).map(([k, v]) => `${v}×${prettyId(k)}`).join('+') : '?';
  return `${ins} → ${out}`;
}

function statusPill(status) {
  if (!status || status === 'active' || status === 'working' || status === 'deployed') return `<span class="au-pill ok">active</span>`;
  if (status === 'distressed' || status === 'lowfuel' || status === 'idle') return `<span class="au-pill warn">${status}</span>`;
  if (status === 'lost' || status === 'raided' || status === 'destroyed') return `<span class="au-pill bad">${status}</span>`;
  return `<span class="au-pill">${status}</span>`;
}

function miniBar(frac) {
  const pct = Math.max(0, Math.min(1, frac || 0)) * 100;
  const col = pct < 25 ? 'var(--danger)' : pct < 55 ? 'var(--warn)' : 'var(--good)';
  return `<span class="au-minibar"><i style="width:${pct.toFixed(0)}%;background:${col}"></i></span>`;
}

function emptyEl(text) {
  const d = document.createElement('div');
  d.className = 'au-empty';
  d.textContent = text;
  return d;
}
function lockedEl(text) {
  const d = document.createElement('div');
  d.className = 'au-locked';
  d.textContent = '⛔ ' + text;
  return d;
}

function prettyId(id) {
  return String(id || '')
    .replace(/^(drone_|trader_|outpost_|cmdty_|ship_|sector_|mod_)/, '')
    .replace(/_/g, ' ');
}

function numOr(v) {
  const n = Number(v);
  return Number.isFinite(n) && String(v).trim() !== '' && !/^[a-z]/i.test(String(v)) ? n : v;
}

function fmtCr(v) {
  v = Math.round(v || 0);
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e4) return (v / 1e3).toFixed(0) + 'k';
  return v.toLocaleString();
}
