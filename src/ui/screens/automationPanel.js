// src/ui/screens/automationPanel.js — Automation / passive-fleet screen (ARCHITECTURE §5, spec 09).
// Tabs: Drones / Traders / Outposts / Fleet. Reads state.automation (+ static defs for the
// purchasable catalog). Buy / assign / order buttons emit ui:fleetOrder{shipId,order,targetRef}
// (the automation system is the sole handler — §4.4). Shows passive-income rate + a passive-cap
// bar derived from the active-income reference curve. READ-ONLY on state; emits intents only.
//
// Export: automationScreen  (id 'automation'). No 'three' import.

import { DRONES, TRADERS, OUTPOSTS, AUTO_BALANCE } from '../../data/automation.js';
import { COMMODITIES } from '../../data/commodities.js';
import { escapeHtml } from '../comms.js';

const DRONE_DISPLAY_ORE_ID = 'cmdty_ore_iron';
const DRONE_DISPLAY_ORE_VALUE = (COMMODITIES.find((c) => c.id === DRONE_DISPLAY_ORE_ID) || {}).basePrice || 28;

const PROGRAM_OPTIONS = Object.freeze([
  { value: '', label: 'Manual (mine -> bank)', meta: 'Banks ore in the drone buffer; recall to cash out.' },
  { value: 'mine_to_depot', label: 'Mine -> Haul -> Sell', meta: 'Loops field mining into depot sales through the passive cap.' },
  { value: 'patrol_guard', label: 'Guard Player', meta: 'Keeps the drone close as a defensive escort.' },
  { value: 'scout_report', label: 'Scout -> Report', meta: 'Tests beacon movement and a short overwatch loop.' },
]);

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
#sf-automation .au-command { display: grid; grid-template-columns: minmax(230px, 1.08fr) minmax(0, 1.92fr);
  gap: 12px; align-items: stretch; }
#sf-automation .au-next, #sf-automation .au-summary {
  border: 1px solid var(--panel-edge); border-radius: 8px; background: rgba(10,18,30,.62);
  padding: 12px 13px; }
#sf-automation .au-next { display: flex; flex-direction: column; gap: 8px; border-color: rgba(57,208,255,.42); }
#sf-automation .au-kicker { font-family: var(--mono); font-size: .68em; letter-spacing: .13em; text-transform: uppercase;
  color: var(--accent-2); }
#sf-automation .au-next-title { font-size: 1em; color: var(--ink); }
#sf-automation .au-next-body { font-size: .82em; line-height: 1.35; color: var(--ink-dim); }
#sf-automation .au-next-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: auto; }
#sf-automation .au-next-meta { font-family: var(--mono); font-size: .72em; color: var(--energy); }
#sf-automation .au-cta { padding: 7px 12px; white-space: nowrap; border-color: var(--accent-2);
  background: rgba(57,208,255,.11); color: var(--ink); }
#sf-automation .au-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
#sf-automation .au-metric { min-width: 0; border: 1px solid rgba(57,208,255,.16); border-radius: 6px;
  background: rgba(6,10,18,.5); padding: 8px 9px; }
#sf-automation .au-metric .k { font-family: var(--mono); font-size: .66em; letter-spacing: .09em; text-transform: uppercase;
  color: var(--ink-mute); }
#sf-automation .au-metric .v { margin-top: 4px; font-family: var(--mono); font-size: .88em; color: var(--ink); }
#sf-automation .au-metric .s { margin-top: 3px; font-size: .72em; line-height: 1.25; color: var(--ink-dim); }
#sf-automation .au-note { font-size: .78em; color: var(--ink-dim); line-height: 1.35; margin-top: 6px; }
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
@media (max-width: 760px) {
  #sf-automation .au-command { grid-template-columns: 1fr; }
  #sf-automation .au-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
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
  _els: null,
  _bodySig: '',

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
    const body = rootEl.querySelector('[data-body]');
    this._els = {
      cr: rootEl.querySelector('[data-cr]'),
      rate: rootEl.querySelector('[data-rate]'),
      capfill: rootEl.querySelector('[data-capfill]'),
      captxt: rootEl.querySelector('[data-captxt]'),
      body,
      tabs: Array.from(rootEl.querySelectorAll('[data-tab]')),
    };

    rootEl.querySelector('[data-tabs]').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-tab]');
      if (btn && btn.dataset.tab !== this._tab) { this._tab = btn.dataset.tab; this.refresh(this._ctx, { forceBody: true }); }
    });

    // one delegated listener for all action buttons in the body
    body.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (btn) this._onAction(btn.dataset.act, btn.dataset.ref, btn.dataset.kind);
    });
    // V2 §4 / cut-list #28: program dropdown change handler (selects don't fire 'click').
    body.addEventListener('change', (e) => {
      const sel = e.target.closest('select[data-act="assignProgram"]');
      if (!sel) return;
      this._onAction('assignProgram', sel.dataset.ref, sel.dataset.kind, sel.value);
    });
  },

  onShow(ctx) { if (ctx) this._ctx = ctx; this.refresh(this._ctx, { forceBody: true }); },
  onHide() { /* cached DOM retained */ },

  refresh(ctx, opts = {}) {
    if (ctx) this._ctx = ctx;
    if (!this._root) return;
    this._syncHeader();
    this._syncTabs();
    const sig = this._bodySignature();
    if (opts.forceBody || sig !== this._bodySig) {
      this._bodySig = sig;
      this._renderBody();
    }
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
    return passiveCapPerMin(this._ctx.state);
  },

  // current passive rate: sum of net (income - upkeep) across deployed assets.
  _currentRatePerMin() {
    return summarizeAutomationOperations(this._ctx.state).netRatePerMin;
  },

  _syncHeader() {
    const st = this._ctx.state;
    const cr = this._els && this._els.cr;
    if (cr) cr.textContent = ((st.player && st.player.credits) || 0).toLocaleString();

    const rate = this._currentRatePerMin();
    const cap = this._passiveCapPerMin();
    const rateEl = this._els && this._els.rate;
    if (rateEl) rateEl.textContent = `${Math.round(rate)} cr/min`;
    const fill = this._els && this._els.capfill;
    if (fill) fill.style.width = (cap > 0 ? Math.max(0, Math.min(100, (rate / cap) * 100)) : 0).toFixed(1) + '%';
    const captxt = this._els && this._els.captxt;
    if (captxt) captxt.textContent = `cap ${Math.round(cap)} cr/min`;
  },

  _syncTabs() {
    const tabs = (this._els && this._els.tabs) || [];
    for (const b of tabs) {
      b.classList.toggle('active', b.dataset.tab === this._tab);
    }
  },

  _bodySignature() {
    const a = this._auto();
    const st = this._ctx.state;
    const player = st.player || {};
    const summary = summarizeAutomationOperations(st);
    const next = automationNextAction(st);
    const parts = [
      this._tab,
      this._playerTier(),
      player.activeShipIndex || 0,
      Math.round(player.credits || 0),
      Math.round(summary.grossRatePerMin || 0),
      Math.round(summary.netRatePerMin || 0),
      Math.round(summary.upkeepPerMin || 0),
      Math.round(summary.capUsedPct || 0),
      Math.round(summary.totalPassiveEarnedLifetime || 0),
      next && next.tab,
      next && next.title,
    ];
    if (this._tab === 'drones') {
      for (const d of a.drones || []) {
        const program = d.program && d.program.templateId;
        parts.push(d.id, d.defId, d.status, Math.round(d.buffer || 0), Math.round(d.fuel || 0), program || '');
      }
    } else if (this._tab === 'traders') {
      const hireUnlocked = (player.researchedNodes || []).includes('tech_autonomous_fleets');
      parts.push(hireUnlocked ? 1 : 0);
      for (const t of a.traders || []) {
        const route = t.route ? `${t.route.from || ''}>${t.route.to || ''}` : '';
        parts.push(t.id, t.defId, t.status, route, Math.round(t.ratePerMin || 0));
      }
    } else if (this._tab === 'outposts') {
      const buildUnlocked = (player.researchedNodes || []).includes('tech_outpost_charter');
      parts.push(buildUnlocked ? 1 : 0);
      for (const o of a.outposts || []) {
        parts.push(o.id, o.defId, o.status, o.sectorId || '', Math.round(o.storage || 0), Math.round(o.ratePerMin || 0));
      }
    } else {
      const owned = player.ownedShips || [];
      parts.push(a.fleetCap || 0, owned.length);
      for (const fs of a.fleet || []) {
        parts.push(fs.id, fs.defId, fs.name || '', fs.status, fs.order || '', fs.hullPct != null ? Math.round(fs.hullPct * 100) : '');
      }
      for (let i = 0; i < owned.length; i++) parts.push(i, owned[i] && owned[i].defId, owned[i] && owned[i].customName);
    }
    return parts.join('|');
  },

  _renderBody() {
    const body = this._els && this._els.body;
    if (!body) return;
    const frag = document.createDocumentFragment();
    this._renderOperationsBoard(frag);
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

  _renderOperationsBoard(frag) {
    const summary = summarizeAutomationOperations(this._ctx.state);
    const next = automationNextAction(this._ctx.state);
    const wrap = document.createElement('div');
    wrap.className = 'au-command';
    wrap.innerHTML = `
      <div class="au-next">
        <div class="au-kicker">Operations Board</div>
        <div class="au-next-title">${escapeHtml(next.title)}</div>
        <div class="au-next-body">${escapeHtml(next.body)}</div>
        <div class="au-next-row">
          <span class="au-next-meta">${escapeHtml(next.meta)}</span>
          <button class="au-cta" data-act="switchTab" data-ref="${escapeHtml(next.tab)}">${escapeHtml(next.cta)}</button>
        </div>
      </div>
      <div class="au-summary" aria-label="Automation summary">
        ${metricHtml('Assets', String(summary.activeAssets), `${summary.drones} drones / ${summary.traders} traders / ${summary.outposts} outposts`)}
        ${metricHtml('Net Flow', `${fmtCr(summary.netRatePerMin)} cr/min`, `gross ${fmtCr(summary.grossRatePerMin)} - upkeep ${fmtCr(summary.upkeepPerMin)}`)}
        ${metricHtml('Cap Load', `${Math.round(summary.capUsedPct)}%`, `${fmtCr(Math.max(0, summary.capHeadroomPerMin))} cr/min headroom`)}
        ${metricHtml('Lifetime', `${fmtCr(summary.totalPassiveEarnedLifetime)} cr`, summary.distressedAssets ? `${summary.distressedAssets} distressed` : 'stable')}
      </div>`;
    frag.appendChild(wrap);
  },

  _renderDrones(frag) {
    const a = this._auto();
    const owned = a.drones || [];
    const tier = this._playerTier();

    frag.appendChild(this._section(`Deployed Drones (${owned.length})`));
    if (!owned.length) {
      frag.appendChild(emptyEl('No drones deployed. Buy a Mk1 near an asteroid field, then recall it before fuel runs dry to bank ore.'));
    } else {
      for (const d of owned) {
        const def = DRONES.find((x) => x.id === d.defId) || d;
        const buf = d.buffer != null ? d.buffer : 0;
        const bufCap = def.bufferCap || 1;
        const fuelPct = d.fuelMax ? (d.fuel || 0) / d.fuelMax : (def.fuelMax ? (d.fuel || 0) / def.fuelMax : 1);
        // V2 §4 / cut-list #28: program dropdown. Shows the drone's current alphabet template (or
        // Manual for the legacy mine-to-buffer loop). Switching emits assignProgram.
        const curTpl = (d.program && d.program.templateId) || '';
        const programOpts = PROGRAM_OPTIONS
          .map((opt) => `<option value="${escapeHtml(opt.value)}" ${curTpl === opt.value ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`)
          .join('');
        const programBadge = curTpl ? ` <span class="au-program-badge">${escapeHtml(programLabel(curTpl))}</span>` : '';
        const programMeta = curTpl ? programMetaText(curTpl) : PROGRAM_OPTIONS[0].meta;
        const card = document.createElement('div');
        card.className = 'au-card';
        card.innerHTML = `
          <div class="grow">
            <div class="nm">${prettyId(def.id)} ${statusPill(d.status)}${programBadge}</div>
            <div class="meta">
              <span>tier ${def.tier}</span>
              <span>mine ${def.mineRate}/s</span>
              <span>yield ~${fmtCr(estDroneRate(d))}/min gross</span>
              <span>buffer ${Math.round(buf)}/${bufCap} ${miniBar(buf / bufCap)}</span>
              <span>fuel ${miniBar(fuelPct)}</span>
              <span>upkeep ${def.upkeepPerMin}/min</span>
            </div>
            <div class="au-program-row">
              <span class="au-program-label">Program:</span>
              <select class="au-program" data-act="assignProgram" data-ref="${d.id != null ? d.id : def.id}" data-kind="drone">${programOpts}</select>
            </div>
            <div class="au-note">${escapeHtml(programMeta)}</div>
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
          <div class="nm">${prettyId(def.id)} ${locked ? `<span class="au-locked">requires drone tier ${def.tier}</span>` : ''}</div>
          <div class="meta">
            <span>mine ${def.mineRate}/s</span>
            <span>yield ~${fmtCr(estDroneRate(def))}/min gross</span>
            <span>buffer ${def.bufferCap}</span>
            <span>range ${def.deployRange}</span>
            <span>upkeep ${def.upkeepPerMin}/min</span>
          </div>
          ${locked ? `<div class="au-note">Research logistics upgrades to unlock this heavier drone tier.</div>` : `<div class="au-note">Best first passive asset: low upkeep, visible in the field, and reversible on recall.</div>`}
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
      frag.appendChild(emptyEl(hireUnlocked
        ? 'No NPC traders hired. Hire one to turn known price spreads into capped passive income.'
        : 'No NPC traders hired. Research Autonomous Fleets, then hire haulers for managed trade routes.'));
    } else {
      for (const t of owned) {
        const def = TRADERS.find((x) => x.id === t.defId) || t;
        const card = document.createElement('div');
        card.className = 'au-card';
        const route = t.route ? `${escapeHtml(t.route.from || '?')} → ${escapeHtml(t.route.to || '?')}` : 'idle (assign route)';
        const hot = Math.round((t.hotness || 0) * 100);
        card.innerHTML = `
          <div class="grow">
            <div class="nm">${prettyId(def.id)} ${statusPill(t.status)}</div>
            <div class="meta">
              <span>cargo ${def.cargoVol}u</span>
              <span>cycle ${def.cycleTime}s</span>
              <span>route ${route}</span>
              <span>route heat ${hot}%</span>
              <span>upkeep ${def.upkeepPerMin}/min</span>
            </div>
            <div class="au-note">${t.route ? 'Reroute when heat rises or spreads collapse; escorts lower loss risk on dangerous lanes.' : 'Use Route to assign a profitable two-station lane.'}</div>
          </div>
          <button class="au-order" data-act="assignRoute" data-ref="${t.id != null ? t.id : def.id}" data-kind="trader">Route</button>
          <button class="au-recall" data-act="dismiss" data-ref="${t.id != null ? t.id : def.id}" data-kind="trader">Dismiss</button>`;
        frag.appendChild(card);
      }
    }

    frag.appendChild(this._section('Hire Trader'));
    if (!hireUnlocked) {
      frag.appendChild(lockedEl('NPC trader hiring requires Autonomous Fleets in the logistics tech branch.'));
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
          <div class="au-note">${hireUnlocked ? 'Auto-picks a profitable route now; use Route later to reset heat and find a fresh spread.' : 'Unlocks after Drone Swarm, when the player has seen enough logistics to manage risk.'}</div>
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
      frag.appendChild(emptyEl(buildUnlocked
        ? 'No outposts established. Build one in a sector you can defend to anchor long-term income.'
        : 'No outposts established. Research Outpost Charter after Autonomous Fleets to start sector ownership.'));
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
            <div class="au-note">${o.autoSell ? 'Auto-sells stored output every minute through the passive cap.' : 'Stored output is waiting for manual logistics.'}</div>
          </div>
          <button class="au-recall" data-act="decommission" data-ref="${o.id != null ? o.id : def.id}" data-kind="outpost">Decommission</button>`;
        frag.appendChild(card);
      }
    }

    frag.appendChild(this._section('Construct Outpost'));
    if (!buildUnlocked) {
      frag.appendChild(lockedEl('Outpost construction requires Outpost Charter in the logistics tech branch.'));
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
          <div class="au-note">${buildUnlocked ? 'High upkeep, high commitment: best after you can protect the sector or fund losses.' : 'This is the empire layer; reach it after traders prove the route economy.'}</div>
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
      frag.appendChild(emptyEl('No wingmen assigned. Spare owned ships can launch as escorts and reduce automation loss risk.'));
    } else {
      for (const fs of fleet) {
        const card = document.createElement('div');
        card.className = 'au-card';
        const order = fs.order || 'escort';
        card.innerHTML = `
          <div class="grow">
            <div class="nm">${escapeHtml(fs.name) || prettyId(fs.defId || 'wingman')} ${statusPill(fs.status)}</div>
            <div class="meta">
              <span>order ${escapeHtml(order)}</span>
              ${fs.hullPct != null ? `<span>hull ${Math.round(fs.hullPct * 100)}% ${miniBar(fs.hullPct)}</span>` : ''}
            </div>
            <div class="au-note">Escort protects you now and can guard automation assets as the fleet layer expands.</div>
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
      frag.appendChild(emptyEl('No spare ships to assign. Buy a second hull at a shipyard, then return here to crew it as a wingman.'));
    } else if (fleet.length >= cap) {
      frag.appendChild(lockedEl(`Fleet at capacity (${cap}). Research higher Drone/Fleet tiers to expand.`));
    } else {
      for (const { s, i } of assignable) {
        const card = document.createElement('div');
        card.className = 'au-card';
        card.innerHTML = `
          <div class="grow">
            <div class="nm">${escapeHtml(s.customName) || prettyId(s.defId)}</div>
            <div class="meta"><span>${prettyId(s.defId)}</span><span>starts on escort</span></div>
            <div class="au-note">Assigned ships remain in the automation ledger and spawn as live wingmen in-sector.</div>
          </div>
          <button class="au-buy" data-act="assignFleet" data-ref="${i}" data-kind="ownedShip">Assign as Wingman</button>`;
        frag.appendChild(card);
      }
    }
  },

  // ---- intent dispatch ----------------------------------------------------
  // `extra` carries the selected value for <select>-driven actions (e.g. assignProgram templateId).
  _onAction(act, ref, kind, extra) {
    if (act === 'switchTab') {
      if (TABS.some((t) => t.id === ref)) {
        this._tab = ref;
        this.refresh(this._ctx, { forceBody: true });
      }
      return;
    }

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
    this.refresh(this._ctx, { forceBody: true });
  },
};

// ---- helpers ----------------------------------------------------------------
export function summarizeAutomationOperations(state) {
  const a = automationState(state);
  const drones = (a.drones || []).length;
  const traders = (a.traders || []).length;
  const outposts = (a.outposts || []).length;
  const fleet = (a.fleet || []).length;
  const grossRatePerMin = grossRatePerMinFromAutomation(a);
  const upkeepPerMin = estimateUpkeepPerMin(a);
  const netRatePerMin = grossRatePerMin - upkeepPerMin;
  const capPerMin = passiveCapPerMin(state);
  const distressedAssets = countDistressedAssets(a);
  return {
    drones,
    traders,
    outposts,
    fleet,
    activeAssets: drones + traders + outposts + fleet,
    grossRatePerMin,
    upkeepPerMin,
    netRatePerMin,
    capPerMin,
    capHeadroomPerMin: capPerMin - Math.max(0, grossRatePerMin),
    capUsedPct: capPerMin > 0 ? Math.min(999, Math.max(0, grossRatePerMin / capPerMin * 100)) : 0,
    totalPassiveEarnedLifetime: (a.meta && a.meta.totalPassiveEarnedLifetime) || 0,
    distressedAssets,
  };
}

export function automationNextAction(state) {
  const a = automationState(state);
  const player = (state && state.player) || {};
  const credits = player.credits || 0;
  const researched = player.researchedNodes || [];
  const summary = summarizeAutomationOperations(state);
  const hasTraderTech = researched.includes('tech_autonomous_fleets');
  const hasOutpostTech = researched.includes('tech_outpost_charter');
  const droneMk1 = DRONES[0] || {};
  const spareShips = ((player.ownedShips || []).length - 1) > 0;
  if (summary.distressedAssets > 0) {
    return nextAction('drones', 'Stabilize distressed assets',
      'Your automation is unpaid or under attack. Bank drone buffers, cut upkeep, or fly rescue before repossession.',
      `${summary.distressedAssets} distressed`, 'Review Assets');
  }
  if (!(a.drones || []).length) {
    return nextAction('drones', 'Deploy a mining drone',
      credits >= (droneMk1.cost || 0)
        ? 'Start the passive layer with a Mk1 drone. It is cheap, visible in the field, and recallable if the route goes bad.'
        : 'Earn enough credits for a Mk1 mining drone, then start automation with a reversible low-upkeep asset.',
      `${fmtCr(droneMk1.cost || 0)} cr starter`, 'Open Drone Bay');
  }
  if (summary.capUsedPct >= 90) {
    return nextAction('drones', 'Raise automation ceiling',
      'Passive production is pressing into the cap. Research logistics tiers or rebalance assets before buying more raw output.',
      `${Math.round(summary.capUsedPct)}% cap load`, 'Review Drones');
  }
  if (!(a.traders || []).length) {
    if (hasTraderTech) {
      return nextAction('traders', 'Hire a route trader',
        'Turn market spreads into managed income. Reroute when heat climbs so the lane keeps paying.',
        'Autonomous Fleets ready', 'Open Traders');
    }
    return nextAction('traders', 'Research Autonomous Fleets',
      'Traders unlock after the drone layer, giving the player a second automation verb: managing route heat and danger.',
      'Tech locked', 'View Traders');
  }
  if (!(a.outposts || []).length) {
    if (hasOutpostTech) {
      return nextAction('outposts', 'Found a sector outpost',
        'Outposts convert money into territory. Build one where your fleet can absorb raids and upkeep.',
        'Charter ready', 'Open Outposts');
    }
    return nextAction('outposts', 'Work toward Outpost Charter',
      'The empire layer should come after traders prove the route economy and the player can fund higher upkeep.',
      'Tech locked', 'View Outposts');
  }
  if (!(a.fleet || []).length && spareShips) {
    return nextAction('fleet', 'Assign a spare hull',
      'Crew a second owned ship as a wingman so automation risk starts feeling protectable, not random.',
      `${(player.ownedShips || []).length - 1} spare hulls`, 'Open Fleet');
  }
  return nextAction('fleet', 'Keep routes defended',
    'Your automation stack is online. Keep the cap healthy, rotate hot trader routes, and add escorts before dangerous expansion.',
    `${fmtCr(summary.netRatePerMin)} cr/min net`, 'Review Fleet');
}

function nextAction(tab, title, body, meta, cta) {
  return { tab, title, body, meta, cta };
}

function automationState(state) {
  return (state && state.automation) || { drones: [], traders: [], outposts: [], fleet: [], fleetCap: 0,
    meta: {}, accumulators: {}, balance: AUTO_BALANCE };
}

function passiveCapPerMin(state) {
  const a = automationState(state);
  const bal = a.balance || AUTO_BALANCE;
  const ref = bal.activeRefByTier || AUTO_BALANCE.activeRefByTier;
  const tier = playerTierFromState(state);
  const active = ref[Math.min(tier, ref.length) - 1] || ref[0] || 0;
  const frac = bal.passiveCapFrac != null ? bal.passiveCapFrac : 0.45;
  return active * frac;
}

function playerTierFromState(state) {
  const player = (state && state.player) || {};
  const cap = player.droneTierCap || 1;
  return Math.max(1, Math.min(5, Math.round(cap) || 1));
}

function grossRatePerMinFromAutomation(a) {
  let rate = 0;
  for (const d of a.drones || []) rate += d.ratePerMin != null ? d.ratePerMin : estDroneRate(d);
  for (const t of a.traders || []) rate += t.ratePerMin != null ? t.ratePerMin : 0;
  for (const o of a.outposts || []) rate += o.ratePerMin != null ? o.ratePerMin : 0;
  return rate;
}

function estimateUpkeepPerMin(a) {
  let sum = 0;
  for (const d of a.drones || []) sum += defUpkeep(DRONES, d);
  for (const t of a.traders || []) sum += defUpkeep(TRADERS, t);
  for (const o of a.outposts || []) {
    const def = OUTPOSTS.find((x) => x.id === o.defId) || o;
    sum += (def.upkeepPerMin || 0) * Math.pow(1.5, (o.level || 1) - 1);
  }
  return sum;
}

function defUpkeep(defs, inst) {
  const def = defs.find((x) => x.id === inst.defId) || inst;
  return def.upkeepPerMin || 0;
}

function countDistressedAssets(a) {
  let n = 0;
  for (const list of [a.drones || [], a.traders || [], a.outposts || [], a.fleet || []]) {
    for (const asset of list) {
      if (asset && (asset.status === 'distressed' || asset.status === 'raided' || asset.status === 'lowfuel')) n++;
    }
  }
  return n;
}

function estDroneRate(d) {
  // Display-only fallback when an asset has not reported ratePerMin yet; automation owns payouts.
  const def = DRONES.find((x) => x.id === d.defId) || d;
  return (def.mineRate || 0) * 60 * DRONE_DISPLAY_ORE_VALUE;
}

function programLabel(id) {
  const opt = PROGRAM_OPTIONS.find((x) => x.value === id);
  return opt ? opt.label : prettyId(id);
}

function programMetaText(id) {
  const opt = PROGRAM_OPTIONS.find((x) => x.value === id);
  return opt ? opt.meta : 'Custom program assigned.';
}

function metricHtml(k, v, s) {
  return `<div class="au-metric"><div class="k">${escapeHtml(k)}</div><div class="v">${escapeHtml(v)}</div><div class="s">${escapeHtml(s)}</div></div>`;
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
  if (status === 'distressed' || status === 'lowfuel' || status === 'idle') return `<span class="au-pill warn">${escapeHtml(status)}</span>`;
  if (status === 'lost' || status === 'raided' || status === 'destroyed') return `<span class="au-pill bad">${escapeHtml(status)}</span>`;
  return `<span class="au-pill">${escapeHtml(status)}</span>`;
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
  return escapeHtml(String(id || '')
    .replace(/^(drone_|trader_|outpost_|cmdty_|ship_|sector_|mod_)/, '')
    .replace(/_/g, ' '));
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
