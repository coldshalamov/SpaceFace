// src/ui/screens/stationHub.js — the docked STATION hub screen (id 'station').
// A 7-tab left rail (Market / Shipyard / Outfitting / Missions / Services / Factions / Bar) + a
// right content pane; switching tabs swaps the active panel (state.ui.activeStationTab). An Undock
// button emits dock:undocked. onShow(ctx) resolves the docked station and refreshes panels.
//
// Screen-module interface (ARCHITECTURE §5, uiRoot imports + registers this):
//   { id:'station', mount(rootEl, ctx), onShow(ctx), onHide(), refresh(ctx) }
//
// stationHub imports the tab-panel FACTORIES from sibling files in this set (they each return
// { el, onShow(ctx), refresh(ctx) }). The Missions tab is rendered inline here (the dedicated
// missionBoard.js screen belongs to another agent; the hub needs only a board view).
//
// READS state for display; EMITS intents only — never mutates sim state (§5, invariant 15).
import { createMarketPanel } from './market.js';
import { createShipyardPanel } from './shipyard.js';
import { createOutfittingPanel } from './outfitting.js';
import { createServicesPanel } from './services.js';
import { createManufacturePanel } from './manufacture.js';
import { createFactionsPanel } from './factions.js';
import { createBarPanel } from './bar.js';
import { SECTORS } from '../../data/sectors.js';
import { FACTION_META } from '../../data/factions.js';
import { MISSION_TUNING } from '../../data/missions.js';

const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));

// Tab order = the §5.3 rail. id === state.ui.activeStationTab value.
const TABS = [
  { id: 'market', label: 'Market', icon: '⚖' },
  { id: 'shipyard', label: 'Shipyard', icon: '⛴' },
  { id: 'outfit', label: 'Outfitting', icon: '⚙' },
  { id: 'manufacture', label: 'Manufacture', icon: '⚒' },
  { id: 'missions', label: 'Missions', icon: '✦' },
  { id: 'services', label: 'Services', icon: '⛽' },
  { id: 'factions', label: 'Factions', icon: '⚑' },
  { id: 'bar', label: 'Bar', icon: '☕' },
];

let cssInjected = false;
function injectCss() {
  if (cssInjected || typeof document === 'undefined') return;
  cssInjected = true;
  const style = document.createElement('style');
  style.id = 'ui-station-styles';
  style.textContent = STATION_CSS;
  document.head.appendChild(style);
}

export const stationHub = {
  id: 'station',
  _ctx: null,
  _panels: null,        // { market, shipyard, outfit, services, factions, bar } panel objects
  _missionEls: null,
  _stationId: null,
  _subbed: false,

  /** Build the screen DOM once and cache it. Called by uiRoot/screenManager. */
  mount(rootEl, ctx) {
    this._ctx = ctx;
    injectCss();

    const screen = document.createElement('div');
    screen.className = 'st-hub panel';

    // top bar: station name / faction / services
    const topbar = document.createElement('div');
    topbar.className = 'st-topbar';
    topbar.innerHTML =
      '<div class="st-topbar-l"><span class="st-station-name">Station</span>' +
      '<span class="st-station-fac mono"></span></div>' +
      '<button class="st-undock">⏏ UNDOCK</button>';
    screen.appendChild(topbar);

    // body: rail + content
    const body = document.createElement('div');
    body.className = 'st-body';
    const rail = document.createElement('div');
    rail.className = 'st-rail';
    const content = document.createElement('div');
    content.className = 'st-content';
    body.appendChild(rail);
    body.appendChild(content);
    screen.appendChild(body);

    // build rail buttons (one delegated listener)
    const railFrag = document.createDocumentFragment();
    for (const t of TABS) {
      const b = document.createElement('button');
      b.className = 'st-tab';
      b.setAttribute('data-tab', t.id);
      b.innerHTML = '<span class="st-tab-icon">' + t.icon + '</span><span class="st-tab-label">' + t.label + '</span>';
      railFrag.appendChild(b);
    }
    rail.appendChild(railFrag);
    rail.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-tab]');
      if (!b) return;
      this.setTab(b.getAttribute('data-tab'));
      ctx.bus.emit('audio:cue', { id: 'ui_tab' });
    });

    topbar.querySelector('.st-undock').addEventListener('click', () => {
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
      ctx.bus.emit('dock:undocked', {});
    });

    // instantiate tab panels (factories from this file-set)
    this._panels = {
      market: createMarketPanel(ctx),
      shipyard: createShipyardPanel(ctx),
      outfit: createOutfittingPanel(ctx),
      manufacture: createManufacturePanel(ctx),
      services: createServicesPanel(ctx),
      factions: createFactionsPanel(ctx),
      bar: createBarPanel(ctx),
    };
    // mount each panel's element (hidden until its tab is active)
    for (const id in this._panels) {
      const p = this._panels[id];
      p.el.classList.add('st-tabpanel');
      p.el.style.display = 'none';
      content.appendChild(p.el);
    }
    // inline Missions panel
    this._buildMissionsPanel(content, ctx);

    this._el = screen;
    this._rail = rail;
    this._content = content;
    this._topbar = topbar;
    rootEl.appendChild(screen);

    this._subscribe();
    return screen;
  },

  /** Inline mission board (state.missions.boards[stationId]) → Accept emits ui:acceptMission. */
  _buildMissionsPanel(content, ctx) {
    const panel = document.createElement('div');
    panel.className = 'st-tabpanel st-panel st-missions';
    panel.style.display = 'none';
    panel.innerHTML = '<div class="st-sub-h">Mission Board</div><div class="st-mission-list"></div>';
    const list = panel.querySelector('.st-mission-list');
    list.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-mid]');
      if (!btn) return;
      const missionId = btn.getAttribute('data-mid');
      const act = btn.getAttribute('data-act');
      if (act === 'accept') ctx.bus.emit('ui:acceptMission', { missionId });
      else if (act === 'track') ctx.bus.emit('ui:trackMission', { missionId });
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
    });
    content.appendChild(panel);
    this._missionEls = { panel, list };
  },

  _refreshMissions() {
    const ctx = this._ctx;
    if (!this._missionEls) return;
    const list = this._missionEls.list;
    const board = ctx.state.missions && ctx.state.missions.boards && ctx.state.missions.boards[this._stationId];
    const slots = (board && board.slots) || [];
    list.textContent = '';
    if (!slots.length) {
      list.innerHTML = '<div class="st-empty">No contracts posted right now. Check back after the next board refresh.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    const tracked = ctx.state.ui && ctx.state.ui.trackedMissionId;
    for (const m of slots) {
      const fac = m.factionId ? FACTION_BY_ID.get(m.factionId) : null;
      const risk = (m.riskTier != null ? m.riskTier : (m.risk != null ? m.risk : 0));
      const reward = m.reward != null ? m.reward : (m.rewardCr != null ? m.rewardCr : 0);
      const repAmt = (m.rep != null ? m.rep : (m.repReward != null ? m.repReward : (MISSION_TUNING.BASE_REP[m.type] || 0)));
      const mid = m.id != null ? m.id : m.missionId;
      const unmet = m.requirementUnmet || m.lockedReason || null;
      const card = document.createElement('div');
      card.className = 'st-mission-card' + (tracked && tracked === mid ? ' tracked' : '');
      card.innerHTML =
        '<div class="st-mission-top">' +
          '<span class="st-mission-title">' + (m.title || prettyType(m.type)) + '</span>' +
          '<span class="st-mission-risk r' + risk + '">RISK ' + risk + '</span>' +
        '</div>' +
        '<div class="st-mission-meta mono">' +
          (fac ? '<span class="st-mission-fac" style="color:' + (fac.color || '#aaa') + '">' + (fac.short || fac.name) + '</span> · ' : '') +
          prettyType(m.type) +
          (m.destStationId || m.dest ? ' → ' + (m.destName || m.destStationId || m.dest) : '') +
        '</div>' +
        '<div class="st-mission-rewards mono">' +
          '<span class="st-mission-cr">+' + (reward || 0).toLocaleString('en-US') + ' cr</span>' +
          (repAmt ? '<span class="st-mission-rep">+' + repAmt + ' rep</span>' : '') +
          (m.expiresInS != null ? '<span class="st-mission-exp">' + fmtTime(m.expiresInS) + '</span>' : '') +
        '</div>' +
        '<div class="st-mission-btns">' +
          '<button data-act="accept" data-mid="' + mid + '"' + (unmet ? ' disabled title="' + unmet + '"' : '') + '>Accept</button>' +
          '<button data-act="track" data-mid="' + mid + '" class="st-mission-track">Track</button>' +
          (unmet ? '<span class="st-mission-unmet">' + unmet + '</span>' : '') +
        '</div>';
      frag.appendChild(card);
    }
    list.appendChild(frag);
  },

  /** Activate a tab: toggle rail highlight + panel visibility, persist ui.activeStationTab. */
  setTab(tabId) {
    if (!TABS.some((t) => t.id === tabId)) tabId = 'market';
    this._ctx.state.ui.activeStationTab = tabId;
    // rail highlight
    this._rail.querySelectorAll('[data-tab]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabId);
    });
    // panel visibility
    for (const id in this._panels) this._panels[id].el.style.display = (id === tabId) ? '' : 'none';
    if (this._missionEls) this._missionEls.panel.style.display = (tabId === 'missions') ? '' : 'none';
    // refresh the now-visible panel
    this._refreshActive(true);
  },

  _activePanelId() { return (this._ctx.state.ui && this._ctx.state.ui.activeStationTab) || 'market'; },

  _refreshActive(isShow) {
    const id = this._activePanelId();
    if (id === 'missions') { this._refreshMissions(); return; }
    const p = this._panels[id];
    if (!p) return;
    if (isShow && typeof p.onShow === 'function') p.onShow({ stationId: this._stationId, state: this._ctx.state });
    else if (typeof p.refresh === 'function') p.refresh({ stationId: this._stationId, state: this._ctx.state });
  },

  /** Resolve the station def the player is docked at (set by dock:docked → uiRoot before onShow). */
  _resolveStation() {
    const state = this._ctx.state;
    // 1) explicit dockedStationId if the docking flow stashed one
    let sid = (state.ui && state.ui.dockedStationId) || this._stationId;
    // 2) else first station of the active sector
    const sect = state.world && state.world.activeSector;
    if (!sid && sect && sect.stations && sect.stations.length) {
      const first = sect.stations[0];
      sid = first.stationId || first.id;
    }
    // 3) else first station of the current sector's static def
    if (!sid) {
      const curId = state.world && state.world.currentSectorId;
      const sectorDef = (state.world && state.world.sectors && state.world.sectors[curId]) ||
        SECTORS.find((s) => s.id === curId) || SECTORS[0];
      if (sectorDef && sectorDef.stations && sectorDef.stations.length) sid = sectorDef.stations[0].id;
    }
    this._stationId = sid || null;
    return this._stationId;
  },

  _stationDef() {
    const state = this._ctx.state;
    const sid = this._stationId;
    const sect = state.world && state.world.activeSector;
    let stn = sect && (sect.stations || []).find((x) => x.id === sid);
    if (!stn) {
      for (const s of SECTORS) {
        const f = (s.stations || []).find((x) => x.id === sid);
        if (f) { stn = f; break; }
      }
    }
    return stn || null;
  },

  _refreshTopbar() {
    const stn = this._stationDef();
    const nameEl = this._topbar.querySelector('.st-station-name');
    const facEl = this._topbar.querySelector('.st-station-fac');
    if (stn) {
      nameEl.textContent = stn.name || stn.id;
      const fac = stn.factionId ? FACTION_BY_ID.get(stn.factionId) : null;
      facEl.textContent = (fac ? (fac.short || fac.name) : '') + '  ·  ' + (stn.type || '').replace('_', ' ');
      if (fac) facEl.style.color = fac.color || '';
    } else {
      nameEl.textContent = 'Station';
      facEl.textContent = '';
    }
  },

  /** Called by screenManager when this screen becomes the top of the stack. */
  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    this._resolveStation();
    this._refreshTopbar();
    // restore the last active tab (or default 'market')
    const tab = this._activePanelId();
    this.setTab(tab); // also refreshes the active panel via onShow
  },

  onHide() { /* DOM retained; nothing to tear down (§5.1) */ },

  /** Generic refresh (data-event driven). Refreshes only the active panel for cheapness. */
  refresh(ctx) {
    if (ctx) this._ctx = ctx;
    if (!this._el) return;
    this._refreshTopbar();
    this._refreshActive(false);
  },

  /** Subscribe to the data-change events that should rebuild the relevant panel (§5.5). Only the
   *  active panel is refreshed to stay cheap; switching tabs refreshes on demand. */
  _subscribe() {
    if (this._subbed) return;
    this._subbed = true;
    const bus = this._ctx.bus;
    const onActive = (wantTab) => () => {
      if (!this._visible()) return;
      const id = this._activePanelId();
      if (!wantTab || wantTab.includes(id)) this._refreshActive(false);
    };
    // market-affecting
    bus.on('economy:tradeCompleted', onActive(['market', 'services']));
    bus.on('economy:tick', onActive(['market']));
    bus.on('cargo:changed', onActive(['market', 'outfit', 'services']));
    bus.on('credits:changed', onActive(['market', 'shipyard', 'outfit', 'services']));
    // ship/outfitting-affecting
    bus.on('ship:statsChanged', onActive(['outfit', 'shipyard', 'services']));
    bus.on('ship:purchased', onActive(['shipyard', 'outfit']));
    bus.on('ship:sold', onActive(['shipyard', 'outfit']));
    bus.on('module:equipped', onActive(['outfit']));
    bus.on('module:unequipped', onActive(['outfit']));
    bus.on('tech:researched', onActive(['shipyard', 'outfit']));
    // services-affecting
    bus.on('fuel:changed', onActive(['services']));
    // factions
    bus.on('faction:repChanged', onActive(['factions']));
    // missions
    bus.on('mission:updated', () => { if (this._visible() && this._activePanelId() === 'missions') this._refreshMissions(); });
    bus.on('mission:accepted', () => { if (this._visible() && this._activePanelId() === 'missions') this._refreshMissions(); });
    bus.on('economy:eventStarted', onActive(['market']));
    bus.on('economy:eventEnded', onActive(['market']));
  },

  _visible() {
    const ui = this._ctx && this._ctx.state && this._ctx.state.ui;
    if (!ui || !ui.screenStack) return !!this._el; // be permissive if stack not wired
    return ui.screenStack[ui.screenStack.length - 1] === 'station';
  },
};

// ---- small format helpers --------------------------------------------------------------------
function prettyType(t) {
  if (!t) return 'Contract';
  return String(t).split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60);
  if (m >= 60) return (m / 60).toFixed(1) + 'h';
  if (m >= 1) return m + 'm';
  return s + 's';
}

// ---- scoped CSS (injected once; uses theme vars from styles/ui.css) --------------------------
const STATION_CSS = `
.st-hub { width: min(1100px, 94vw); height: min(760px, 92vh); display: flex; flex-direction: column;
  pointer-events: auto; overflow: hidden; animation: sf-fadein .3s var(--ease) both; }
.st-topbar { display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px; border-bottom: 1px solid var(--panel-edge);
  background: linear-gradient(180deg, rgba(14,24,42,.7), rgba(8,14,26,.5)); }
.st-station-name { font-size: var(--t-xl); letter-spacing: .04em; color: #fff; font-weight: 600;
  text-shadow: 0 0 16px rgba(57,208,255,.25); }
.st-station-fac { margin-left: 14px; color: var(--accent); font-size: var(--t-xs);
  letter-spacing: .14em; text-transform: uppercase; padding: 2px 10px; border-radius: var(--r-pill);
  border: 1px solid rgba(57,208,255,.3); background: rgba(57,208,255,.08); }
.st-undock { border-color: var(--accent); color: var(--accent); letter-spacing: .08em; font-weight: 600; }
.st-undock:hover { background: var(--grad-accent); color: #04121a; box-shadow: 0 0 16px rgba(57,208,255,.4); }
.st-body { display: flex; flex: 1; min-height: 0; }
.st-rail { width: 176px; flex: none; display: flex; flex-direction: column; gap: 3px; padding: var(--sp-3) var(--sp-2);
  border-right: 1px solid var(--panel-edge); background: rgba(6,10,20,.55); }
.st-tab { display: flex; align-items: center; gap: 10px; text-align: left; background: transparent;
  border: 1px solid transparent; border-radius: var(--r-md); padding: 9px 12px; color: var(--ink-dim);
  transition: all var(--dur) var(--ease); }
.st-tab:hover { color: var(--ink); background: rgba(57,208,255,.06); }
.st-tab.active { color: #fff; background: linear-gradient(90deg, rgba(57,208,255,.18), rgba(57,208,255,.04));
  border-color: rgba(57,208,255,.35); box-shadow: inset 3px 0 0 var(--accent), 0 0 12px rgba(57,208,255,.12); }
.st-tab-icon { width: 18px; text-align: center; opacity: .85; }
.st-tab-label { letter-spacing: .04em; font-size: .92rem; }
.st-content { flex: 1; min-width: 0; overflow: hidden; position: relative; }
.st-tabpanel { position: absolute; inset: 0; overflow-y: auto; padding: var(--sp-4) var(--sp-5);
  animation: sf-fadein .22s var(--ease) both; }
.st-sub-h { font-size: .72rem; letter-spacing: .18em; text-transform: uppercase; color: var(--ink-mute);
  margin: 2px 0 10px; }
.st-empty { color: var(--ink-mute); font-size: .85rem; padding: 18px 4px; font-style: italic; }
.st-tag { font-size: .6rem; letter-spacing: .08em; text-transform: uppercase; padding: 1px 5px; border-radius: 4px;
  background: var(--panel-2); color: var(--ink-dim); vertical-align: middle; }
.st-tag-restricted { color: var(--warn); border: 1px solid var(--warn); }
.st-tag-contraband { color: var(--danger); border: 1px solid var(--danger); }
.st-tag-owned, .st-tag-active { color: var(--accent-2); border: 1px solid var(--accent-2); }

/* generic rows */
.st-row { display: grid; grid-template-columns: 2.4fr .8fr 1fr 1fr 2.2fr 1.6fr; align-items: center;
  gap: 8px; padding: 7px 8px; border-bottom: 1px solid rgba(29,51,80,.5); font-size: .85rem; }
.st-row-head { color: var(--ink-mute); font-size: .68rem; letter-spacing: .12em; text-transform: uppercase;
  border-bottom: 1px solid var(--panel-edge); position: sticky; top: -14px; background: var(--panel); z-index: 1; }
.st-row .c-num { text-align: right; }
.st-row.locked { opacity: .55; }
.st-list { display: block; }
.st-slotline { color: var(--ink-mute); font-size: .68rem; letter-spacing: .04em; }

/* market */
.st-market-head { display: flex; gap: 24px; margin-bottom: 10px; }
.st-stat { display: flex; flex-direction: column; }
.st-stat-l { font-size: .62rem; letter-spacing: .14em; color: var(--ink-mute); text-transform: uppercase; }
.st-credits { color: var(--energy); font-size: 1.05rem; }
.st-cargo { color: var(--cargo); font-size: 1.05rem; }
.st-row .c-qty { display: flex; align-items: center; gap: 3px; justify-content: flex-end; }
.st-row .c-qty button { padding: 2px 7px; font-size: .72rem; }
.st-row .c-qty button.on { border-color: var(--accent); color: var(--accent); }
.st-qty-val { min-width: 34px; text-align: right; color: var(--accent); }
.st-row .c-act { display: flex; gap: 5px; justify-content: flex-end; }
.st-buy-btn { border-color: var(--good); color: var(--good); }
.st-buy-btn:hover:not(:disabled) { background: var(--good); color: #021008; }
.st-sell-btn { border-color: var(--warn); color: var(--warn); }
.st-sell-btn:hover:not(:disabled) { background: var(--warn); color: #1a1000; }
.st-market-foot { margin-top: 10px; color: var(--ink-dim); font-size: .8rem; }

/* Phase 7: Manufacturing panel */
.st-manufacture { display: flex; flex-direction: column; gap: 6px; }
.st-manuf-intro { color: var(--ink-dim); font-size: .82rem; margin-bottom: 8px; line-height: 1.4; }
.st-manuf-group-h { font-family: var(--mono); font-size: var(--t-xs); letter-spacing: .16em;
  text-transform: uppercase; color: var(--accent); margin: 14px 0 6px;
  display: flex; align-items: center; gap: 10px; }
.st-manuf-group-h::after { content:''; flex:1; height:1px; background:linear-gradient(90deg, var(--panel-edge), transparent); }
.st-manuf-list { display: flex; flex-direction: column; gap: 8px; }
.st-manuf-card { padding: 12px 14px; }
.st-manuf-card.st-manuf-locked { opacity: .5; filter: saturate(.3); }
.st-manuf-card-h { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.st-manuf-title { font-size: var(--t-md); font-weight: 600; color: var(--ink); display: flex; align-items: center; gap: 8px; }
.st-manuf-desc { color: var(--ink-dim); font-size: .78rem; margin: 4px 0 2px; line-height: 1.35; }
.st-manuf-augnote { color: var(--warn); font-size: .72rem; margin-top: 2px; }
.st-manuf-out { color: var(--good); font-size: .8rem; margin: 4px 0; font-weight: 600; }
.st-manuf-mats { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.st-mat-chip { font-size: .7rem; padding: 2px 7px; border-radius: var(--r-pill); font-family: var(--mono);
  background: rgba(98,224,138,.12); color: var(--good); border: 1px solid rgba(98,224,138,.25); }
.st-mat-chip.st-mat-missing { background: rgba(255,84,112,.12); color: var(--danger); border-color: rgba(255,84,112,.25); }

/* Phase 4: trade route planner + price heat */
.st-market-planner { margin-bottom: 12px; border: 1px solid var(--panel-edge); border-radius: 8px;
  padding: 10px 12px; background: linear-gradient(180deg, rgba(57,208,255,.06), rgba(10,18,32,.4)); }
.st-planner-hint { color: var(--ink-mute); font-weight: 400; font-size: .7rem; letter-spacing: .02em; text-transform: none; }
.st-planner-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.st-planner-empty { color: var(--ink-dim); font-size: .82rem; font-style: italic; padding: 4px 0; }
.st-planner-row { display: grid; grid-template-columns: 1.4fr 2.2fr 1.6fr 1.4fr auto; align-items: center; gap: 10px;
  padding: 6px 9px; background: rgba(10,18,32,.5); border: 1px solid var(--panel-edge); border-radius: 6px; font-size: .82rem; }
.st-pl-cmdty { color: var(--ink); font-weight: 600; }
.st-pl-prices { color: var(--ink-dim); font-size: .78rem; }
.st-pl-margin { font-weight: 600; }
.st-pl-up { color: var(--good); }
.st-pl-dest { color: var(--ink-mute); font-size: .78rem; }
.st-pl-nav { padding: 4px 10px; font-size: .72rem; border-color: var(--accent); color: var(--accent);
  border-radius: 5px; cursor: pointer; }
.st-pl-nav:hover { background: rgba(57,208,255,.14); }
.st-heat-up { color: var(--danger); }     /* dear = sell opportunity (red = you can sell high) */
.st-heat-down { color: var(--good); }     /* cheap = buy opportunity (green = buy low) */
.st-heat-flat { color: var(--ink-dim); }

/* shipyard */
.st-sy-owned { margin-bottom: 16px; }
.st-sy-owned-list { display: flex; gap: 10px; flex-wrap: wrap; }
.st-sy-card { border: 1px solid var(--panel-edge); border-radius: 6px; padding: 10px 12px; min-width: 180px;
  background: rgba(10,18,32,.6); }
.st-sy-card.active { border-color: var(--accent); box-shadow: 0 0 12px rgba(57,208,255,.25); }
.st-sy-name { font-size: .95rem; margin-bottom: 3px; }
.st-sy-meta { color: var(--ink-dim); font-size: .72rem; margin-bottom: 8px; }
.st-sy-btns { display: flex; gap: 6px; }
.st-sy-btns button { font-size: .75rem; padding: 4px 8px; }

/* outfitting */
.st-outfit-top { display: grid; grid-template-columns: 1.6fr 1fr; gap: 18px; margin-bottom: 16px; }
.st-slot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.st-slot { border: 1px solid var(--panel-edge); border-radius: 6px; padding: 8px 10px; cursor: pointer;
  background: rgba(10,18,32,.5); position: relative; }
.st-slot.empty { border-style: dashed; }
.st-slot.filled { border-color: var(--panel-edge-2); }
.st-slot.sel { border-color: var(--accent); box-shadow: 0 0 8px rgba(57,208,255,.3); }
.st-slot-type { font-size: .62rem; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-mute); }
.st-slot-facing { display: inline-block; margin-left: 5px; padding: 0 5px; border-radius: 3px;
  background: rgba(57,208,255,.14); color: var(--accent); font-size: .58rem; letter-spacing: .08em;
  border: 1px solid rgba(57,208,255,.35); }
.st-slot-mod { font-size: .85rem; margin-top: 3px; min-height: 1.1em; }
.st-slot-unfit { position: absolute; top: 6px; right: 6px; font-size: .62rem; padding: 1px 6px;
  border-color: var(--danger); color: var(--danger); }
.st-stat-table { border: 1px solid var(--panel-edge); border-radius: 6px; padding: 6px 10px; background: rgba(10,18,32,.5); }
.st-stat-row { display: grid; grid-template-columns: 1.4fr 1fr .9fr; align-items: baseline; gap: 6px;
  padding: 3px 0; font-size: .82rem; }
.st-stat-row .st-stat-l { color: var(--ink-dim); text-transform: none; letter-spacing: normal; font-size: .82rem; }
.st-stat-v { text-align: right; }
.st-delta { text-align: right; font-size: .75rem; font-family: var(--mono); }
.st-delta.up { color: var(--good); } .st-delta.down { color: var(--danger); }
.st-inv-list { display: flex; flex-wrap: wrap; gap: 8px; }
.st-inv-item { border: 1px solid var(--panel-edge); border-radius: 6px; padding: 6px 10px; cursor: pointer;
  background: rgba(10,18,32,.6); display: flex; flex-direction: column; }
.st-inv-item:hover { border-color: var(--accent); }
.st-inv-item.incompat { opacity: .55; }
.st-inv-name { font-size: .82rem; }
.st-inv-meta { font-size: .64rem; color: var(--ink-mute); letter-spacing: .06em; text-transform: uppercase; }

/* services */
.st-svc-list { display: flex; flex-direction: column; gap: 8px; }
.st-svc-row { display: flex; align-items: center; justify-content: space-between; gap: 12px;
  border: 1px solid var(--panel-edge); border-radius: 6px; padding: 10px 14px; background: rgba(10,18,32,.5); }
.st-svc-row.disabled { opacity: .5; }
.st-svc-name { font-size: .92rem; }
.st-svc-detail { font-size: .72rem; color: var(--ink-dim); margin-top: 2px; }

/* factions */
.st-fac-note { font-size: .68rem; color: var(--ink-mute); margin-bottom: 12px; letter-spacing: .06em; }
.st-fac-list { display: flex; flex-direction: column; gap: 12px; }
.st-fac-row { border-bottom: 1px solid rgba(29,51,80,.4); padding-bottom: 10px; }
.st-fac-head { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
.st-fac-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.st-fac-name { flex: 1; font-size: .92rem; }
.st-fac-tier { font-size: .66rem; letter-spacing: .08em; text-transform: uppercase; padding: 1px 7px; border-radius: 4px; }
.st-fac-val { min-width: 56px; text-align: right; font-size: .85rem; }
.st-fac-bar { position: relative; height: 8px; border-radius: 4px; background: var(--panel-2);
  overflow: hidden; border: 1px solid var(--panel-edge); }
.st-fac-bar-mid { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: var(--ink-mute); opacity: .6; }
.st-fac-bar-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: left;
  background: var(--accent); opacity: .7; }
.st-fac-ctrl { font-size: .66rem; color: var(--ink-mute); margin-top: 5px; }
.st-fac-hostile { color: var(--danger); background: rgba(255,84,112,.12); }
.st-fac-cool { color: var(--warn); background: rgba(255,179,71,.12); }
.st-fac-neutral { color: var(--ink-dim); background: rgba(132,160,200,.1); }
.st-fac-warm, .st-fac-good { color: var(--good); background: rgba(98,224,138,.12); }
.st-fac-allied { color: var(--accent-2); background: rgba(122,247,208,.14); }
.st-fac-bar-fill.st-fac-hostile { background: var(--danger); }
.st-fac-bar-fill.st-fac-cool { background: var(--warn); }
.st-fac-bar-fill.st-fac-good, .st-fac-bar-fill.st-fac-warm { background: var(--good); }
.st-fac-bar-fill.st-fac-allied { background: var(--accent-2); }

/* bar */
.st-bar-list { display: flex; flex-direction: column; gap: 14px; }
.st-bar-card { display: flex; gap: 14px; border: 1px solid var(--panel-edge); border-radius: 8px;
  padding: 12px 14px; background: rgba(10,18,32,.5); }
.st-bar-avatar { width: 64px; height: 64px; border-radius: 6px; flex: none; border: 1px solid var(--panel-edge); }
.st-bar-body { flex: 1; }
.st-bar-name { font-size: .98rem; }
.st-bar-role { color: var(--ink-mute); font-size: .68rem; letter-spacing: .06em; text-transform: uppercase; }
.st-bar-line { color: var(--ink-dim); font-size: .85rem; margin: 6px 0 8px; font-style: italic; }
.st-bar-choices { display: flex; gap: 6px; flex-wrap: wrap; }
.st-bar-choices button { font-size: .78rem; }
.st-bar-reply { margin-top: 8px; font-size: .82rem; color: var(--accent-2); max-height: 0; overflow: hidden;
  transition: max-height .2s ease; }
.st-bar-reply.show { max-height: 120px; }

/* missions */
.st-mission-list { display: flex; flex-direction: column; gap: 10px; }
.st-mission-card { border: 1px solid var(--panel-edge); border-radius: 8px; padding: 11px 14px;
  background: rgba(10,18,32,.55); }
.st-mission-card.tracked { border-color: var(--accent); box-shadow: 0 0 10px rgba(57,208,255,.2); }
.st-mission-top { display: flex; align-items: center; justify-content: space-between; }
.st-mission-title { font-size: .95rem; }
.st-mission-risk { font-size: .62rem; letter-spacing: .08em; padding: 1px 7px; border-radius: 4px;
  background: var(--panel-2); color: var(--ink-dim); }
.st-mission-risk.r0 { color: var(--good); } .st-mission-risk.r1 { color: var(--accent-2); }
.st-mission-risk.r2 { color: var(--warn); } .st-mission-risk.r3, .st-mission-risk.r4 { color: var(--danger); }
.st-mission-meta { font-size: .72rem; color: var(--ink-dim); margin: 4px 0; }
.st-mission-rewards { display: flex; gap: 14px; font-size: .8rem; margin-bottom: 8px; }
.st-mission-cr { color: var(--energy); }
.st-mission-rep { color: var(--accent-2); }
.st-mission-exp { color: var(--ink-mute); }
.st-mission-btns { display: flex; gap: 8px; align-items: center; }
.st-mission-btns button { font-size: .78rem; }
.st-mission-track { border-color: var(--panel-edge-2); }
.st-mission-unmet { font-size: .7rem; color: var(--danger); }
`;
