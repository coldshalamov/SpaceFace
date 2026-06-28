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
import { COMMODITIES } from '../../data/commodities.js';
import { escapeHtml } from '../comms.js';
import { missionPreflight } from '../missionPreflight.js';
import { missionConsequenceSummary } from '../missionPreflight.js';

const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const STATION_BY_ID = new Map();
for (const sec of SECTORS) {
  for (const stn of sec.stations || []) STATION_BY_ID.set(stn.id, stn);
}

// Tab order = the §5.3 rail. id === state.ui.activeStationTab value.
const TABS = [
  { id: 'market', label: 'Market', icon: '⚖', help: 'Buy cargo, sell cargo, and set profitable trade nav routes.' },
  { id: 'shipyard', label: 'Shipyard', icon: '⛴', help: 'Buy hulls to change cargo space, survivability, handling, and module slots.' },
  { id: 'outfit', label: 'Outfitting', icon: '⚙', help: 'Install modules so your active hull can fight, mine, haul, or survive better.' },
  { id: 'manufacture', label: 'Manufacture', icon: '⚒', help: 'Turn mined and traded materials into modules, upgrades, and hulls.' },
  { id: 'missions', label: 'Missions', icon: '✦', help: 'Accept contracts; accepted missions auto-track and place nav guidance.' },
  { id: 'services', label: 'Services', icon: '⛽', help: 'Refuel, repair, and handle station services before undocking.' },
  { id: 'factions', label: 'Factions', icon: '⚑', help: 'Check standing and learn which groups control stations and contracts.' },
  { id: 'bar', label: 'Bar', icon: '☕', help: 'Find rumors, contacts, and station-side leads.' },
];

const STATION_TYPE_PURPOSE = {
  trade_hub: 'Trade hubs are the safest place to compare prices, find legal cargo, and turn credits into better hulls.',
  refinery: 'Refineries want ore and gas, then turn raw mining runs into refined materials for manufacturing.',
  mining: 'Mining outposts sell field supplies and point you toward asteroid work, bulk contracts, and ore buyers.',
  fab: 'Fabricators consume refined goods and components; bring materials here when you want modules or new hull options.',
  military: 'Military stations favor repair, refuel, combat contracts, and restricted goods tied to faction standing.',
  blackmarket: 'Black markets pay for risky cargo and covert work, but their goods and contracts can attract trouble.',
  research: 'Research stations value scans, exotic materials, and tech-linked opportunities.',
};

function stationTypeLabel(type) {
  if (!type) return 'Station';
  return String(type).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function stationPurpose(stn) {
  const type = stn && stn.type;
  return STATION_TYPE_PURPOSE[type] || 'Dock here to trade, repair, find work, and prepare the ship for the next flight.';
}

function stationServiceSummary(stn) {
  const services = (stn && Array.isArray(stn.services)) ? stn.services : [];
  if (!services.length) return 'Available actions depend on this station type and your standing.';
  return 'Available here: ' + services.map((s) => String(s).replace(/_/g, ' ')).join(', ') + '.';
}

function tabPurpose(tabId) {
  const tab = TABS.find((t) => t.id === tabId);
  return (tab && tab.help) || 'Pick a station action, then undock with a clearer next objective.';
}

function clamp01(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback == null ? 0 : fallback;
  return Math.max(0, Math.min(1, n));
}

function fmtPercent(frac) {
  return Math.round(clamp01(frac, 0) * 100) + '%';
}

function fmtDepartUnits(value) {
  if (!Number.isFinite(value)) return '0';
  return (Math.round(value * 10) / 10).toLocaleString('en-US');
}

function clipDepartureText(text) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  return raw.length > 42 ? raw.slice(0, 39) + '...' : raw;
}

function departureChipActionTitle(chip) {
  if (!chip || !chip.targetTab) return '';
  const tab = TABS.find((t) => t.id === chip.targetTab);
  const tabLabel = tab ? tab.label : 'station tab';
  return chip.actionLabel || ('Open ' + tabLabel);
}

function departureChipHtml(chip) {
  const cls = 'st-departure-chip st-departure-chip--' + chip.kind;
  const body =
    '<b>' + escapeHtml(chip.label) + '</b>' +
    '<span>' + escapeHtml(chip.text) + '</span>';
  if (!chip.targetTab) return '<span class="' + cls + '">' + body + '</span>';
  const title = departureChipActionTitle(chip);
  return '<button type="button" class="' + cls + '" data-departure-tab="' + escapeHtml(chip.targetTab) + '"' +
    ' title="' + escapeHtml(title) + '" aria-label="' + escapeHtml(title + ': ' + chip.label + ' ' + chip.text) + '">' +
    body +
    '</button>';
}

function playerEntity(state) {
  return state && state.entities && state.entities.get && state.playerId != null
    ? state.entities.get(state.playerId)
    : null;
}

function missionId(m) {
  return m && (m.id != null ? m.id : m.missionId);
}

function departureTradeWaypointChip(state, waypoint) {
  if (!waypoint || waypoint.kind !== 'trade') return null;
  const commodityId = waypoint.commodityId;
  const commodity = commodityId ? COMMODITY_BY_ID.get(commodityId) : null;
  const commodityName = (commodity && commodity.name) ||
    String((waypoint.reason || '').replace(/^Sell\s+/i, '') || 'cargo');
  const rawLabel = waypoint.label || waypoint.stationName || waypoint.stationId || waypoint.sectorName || 'Trade destination';
  const destination = String(rawLabel).split(' · ')[0] || rawLabel;
  const cargo = state && state.player && state.player.cargo || {};
  const qty = commodityId ? Math.max(0, Math.floor(Number(cargo.items && cargo.items[commodityId]) || 0)) : 0;
  if (commodityId && qty <= 0) {
    return {
      kind: 'warn',
      label: 'Route',
      text: clipDepartureText(destination + ': no ' + commodityName + ' aboard'),
      targetTab: 'market',
      actionLabel: 'Open Market to load route cargo',
    };
  }
  if (commodityId) {
    return {
      kind: 'ok',
      label: 'Route',
      text: clipDepartureText(destination + ': ' + fmtDepartUnits(qty) + 'u ' + commodityName),
      targetTab: 'market',
      actionLabel: 'Open Market to review route cargo',
    };
  }
  return {
    kind: 'info',
    label: 'Route',
    text: clipDepartureText(waypoint.reason || rawLabel),
    targetTab: 'market',
    actionLabel: 'Open Market to review route cargo',
  };
}

function departureMissionChip(state) {
  const trackedId = state && state.ui && state.ui.trackedMissionId;
  const active = state && state.missions && Array.isArray(state.missions.active) ? state.missions.active : [];
  const tracked = trackedId ? active.find((m) => missionId(m) === trackedId) : null;
  if (tracked) {
    return {
      kind: 'ok',
      label: 'Track',
      text: clipDepartureText(tracked.title || prettyType(tracked.type)),
      targetTab: 'missions',
      actionLabel: 'Open Missions to review station contracts',
    };
  }
  const waypoint = state && state.nav && state.nav.waypoint;
  if (waypoint) {
    const tradeChip = departureTradeWaypointChip(state, waypoint);
    if (tradeChip) return tradeChip;
    const label = waypoint.label || waypoint.reason || waypoint.stationName || waypoint.stationId || waypoint.sectorId || 'Nav guidance set';
    return {
      kind: 'info',
      label: 'Nav',
      text: clipDepartureText(label),
      targetTab: 'missions',
      actionLabel: 'Open Missions to review objectives',
    };
  }
  return {
    kind: 'warn',
    label: 'Track',
    text: 'No tracked job',
    targetTab: 'missions',
    actionLabel: 'Open Missions to accept and track a job',
  };
}

function departureCargoChip(state) {
  const cargo = state && state.player && state.player.cargo || {};
  const cap = Number(cargo.capVolume);
  const used = Number(cargo.usedVolume);
  if (!(cap > 0)) return { kind: 'bad', label: 'Hold', text: 'No cargo data' };
  const safeUsed = Number.isFinite(used) ? Math.max(0, used) : 0;
  const free = Math.max(0, cap - safeUsed);
  const freeFrac = free / cap;
  const kind = free <= 0.1 ? 'bad' : (freeFrac < 0.18 ? 'warn' : 'ok');
  return {
    kind,
    label: 'Hold',
    text: fmtDepartUnits(free) + 'u free',
    targetTab: 'market',
    actionLabel: kind === 'ok' ? 'Open Market to review cargo' : 'Open Market to sell cargo',
  };
}

function departureFuelChip(state) {
  const fuel = state && state.fuel || {};
  const current = Number(fuel.current);
  const max = Number(fuel.max);
  if (!(max > 0)) return { kind: 'warn', label: 'Fuel', text: 'Unknown' };
  const frac = clamp01(current / max, 0);
  const kind = frac < 0.25 ? 'bad' : (frac < 0.45 ? 'warn' : 'ok');
  return {
    kind,
    label: 'Fuel',
    text: fmtPercent(frac),
    targetTab: 'services',
    actionLabel: kind === 'ok' ? 'Open Services to review launch supplies' : 'Open Services to refuel',
  };
}

function departureHullChip(state) {
  const ship = playerEntity(state);
  if (!ship || !(ship.hullMax > 0)) return { kind: 'warn', label: 'Hull', text: 'Unknown' };
  const frac = clamp01((ship.hull || 0) / ship.hullMax, 0);
  const kind = frac < 0.35 ? 'bad' : (frac < 0.7 ? 'warn' : 'ok');
  return {
    kind,
    label: 'Hull',
    text: fmtPercent(frac),
    targetTab: 'services',
    actionLabel: kind === 'ok' ? 'Open Services to review ship readiness' : 'Open Services to repair hull',
  };
}

function departureReadinessChips(state) {
  return [
    departureMissionChip(state),
    departureCargoChip(state),
    departureFuelChip(state),
    departureHullChip(state),
  ];
}

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

    // airlock graffiti strip: the threshold the player crosses on entry. Populated from
    // state.ui.graffiti (the comms/narrative overlay stashes airlock/shipyard/clearing/chain_dest
    // lines here as the story advances). Per the worldbuilding: graffiti knows things the HUD won't
    // record. It reads as vandalism; it is the most accurate text in the game.
    const airlock = document.createElement('div');
    airlock.className = 'st-airlock';
    airlock.innerHTML = '<div class="st-airlock__label mono">AIRLOCK</div><div class="st-airlock__graffiti"></div>';
    screen.appendChild(airlock);
    this._airlockEl = airlock.querySelector('.st-airlock__graffiti');

    const purpose = document.createElement('div');
    purpose.className = 'st-purpose';
    purpose.innerHTML =
      '<div class="st-purpose-main"><span class="st-purpose-type mono">Station</span><span class="st-purpose-copy"></span></div>' +
      '<div class="st-purpose-sub"><span class="st-purpose-tab"></span><span class="st-purpose-services"></span></div>';
    screen.appendChild(purpose);
    this._purposeEl = purpose;

    const departure = document.createElement('div');
    departure.className = 'st-departure';
    departure.innerHTML =
      '<div class="st-departure-label mono">Departure Check</div>' +
      '<div class="st-departure-chips"></div>';
    screen.appendChild(departure);
    this._departureEl = departure.querySelector('.st-departure-chips');
    departure.addEventListener('click', (ev) => {
      const chip = ev.target.closest('[data-departure-tab]');
      if (!chip || !this._departureEl || !this._departureEl.contains(chip)) return;
      const tabId = chip.getAttribute('data-departure-tab');
      if (!TABS.some((t) => t.id === tabId)) return;
      this.setTab(tabId, { focusRail: true });
      ctx.bus.emit('audio:cue', { id: 'ui_tab' });
    });

    // body: rail + content
    const body = document.createElement('div');
    body.className = 'st-body';
    const rail = document.createElement('div');
    rail.className = 'st-rail';
    rail.setAttribute('role', 'tablist');
    rail.setAttribute('aria-label', 'Station sections');
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
      b.type = 'button';
      b.id = 'st-tab-' + t.id;
      b.setAttribute('data-tab', t.id);
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', 'st-panel-' + t.id);
      b.setAttribute('aria-selected', 'false');
      b.setAttribute('tabindex', '-1');
      b.title = t.help;
      b.innerHTML = '<span class="st-tab-icon">' + t.icon + '</span><span class="st-tab-label">' + t.label + '</span>';
      railFrag.appendChild(b);
    }
    rail.appendChild(railFrag);
    rail.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-tab]');
      if (!b) return;
      this.setTab(b.getAttribute('data-tab'), { focusRail: true });
      ctx.bus.emit('audio:cue', { id: 'ui_tab' });
    });
    rail.addEventListener('keydown', (ev) => this._onRailKeydown(ev));

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
      p.el.id = 'st-panel-' + id;
      p.el.classList.add('st-tabpanel');
      p.el.setAttribute('role', 'tabpanel');
      p.el.setAttribute('aria-labelledby', 'st-tab-' + id);
      p.el.setAttribute('tabindex', '0');
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
    panel.id = 'st-panel-missions';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', 'st-tab-missions');
    panel.setAttribute('tabindex', '0');
    panel.style.display = 'none';
    panel.innerHTML =
      '<div class="st-sub-h">Mission Board</div>' +
      '<div class="st-mission-guide">Accepting a contract adds it to the Mission Log (J), auto-tracks it, and sets nav guidance when a destination exists. Rewards fund hulls, modules, repairs, and fuel.</div>' +
      '<div class="st-mission-accepted" hidden></div>' +
      '<div class="st-mission-list"></div>';
    const status = panel.querySelector('.st-mission-accepted');
    const list = panel.querySelector('.st-mission-list');
    list.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-mid]');
      if (!btn) return;
      const missionId = btn.getAttribute('data-mid');
      const act = btn.getAttribute('data-act');
      if (act === 'accept') ctx.bus.emit('ui:acceptMission', { missionId });
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
    });
    content.appendChild(panel);
    this._missionEls = { panel, list, status };
  },

  _setMissionAcceptedStatus(missionId) {
    this._missionAcceptedId = missionId || null;
    this._refreshMissionAcceptedStatus();
  },

  _refreshMissionAcceptedStatus() {
    const status = this._missionEls && this._missionEls.status;
    if (!status) return;
    const active = this._ctx && this._ctx.state && this._ctx.state.missions && this._ctx.state.missions.active || [];
    const mission = this._missionAcceptedId
      ? active.find((m) => m && m.id === this._missionAcceptedId && m.status === 'active')
      : null;
    if (!mission) {
      status.hidden = true;
      status.innerHTML = '';
      return;
    }
    const waypoint = this._ctx.state.nav && this._ctx.state.nav.waypoint;
    const routeLine = waypoint && waypoint.reason
      ? waypoint.reason
      : missionAfterAcceptText(mission);
    status.hidden = false;
    status.innerHTML =
      '<div class="st-mission-accepted-label mono">ACCEPTED + TRACKED</div>' +
      '<div class="st-mission-accepted-title">' + escapeHtml(mission.title || prettyType(mission.type)) + '</div>' +
      '<div class="st-mission-accepted-next">' + escapeHtml(routeLine) + '</div>' +
      '<div class="st-mission-accepted-log mono">Mission Log (J) now carries the route, timer, and progress. Undock when Departure Check is green.</div>';
  },

  _refreshMissions() {
    const ctx = this._ctx;
    if (!this._missionEls) return;
    this._refreshMissionAcceptedStatus();
    const list = this._missionEls.list;
    const board = ctx.state.missions && ctx.state.missions.boards && ctx.state.missions.boards[this._stationId];
    const slots = (board && board.slots) || [];
    list.textContent = '';
    if (!slots.length) {
      list.innerHTML = '<div class="st-empty">No contracts posted right now. Try the Bar for leads, check another station, or undock and use the Mission Log (J) for active objectives.</div>';
      return;
    }
    const frag = document.createDocumentFragment();
    const tracked = ctx.state.ui && ctx.state.ui.trackedMissionId;
    for (const m of slots) {
      const fac = m.factionId ? FACTION_BY_ID.get(m.factionId) : null;
      const risk = (m.riskTier != null ? m.riskTier : (m.risk != null ? m.risk : 0));
      const mid = m.id != null ? m.id : m.missionId;
      const preflight = missionPreflight(m, ctx.state);
      const consequences = missionConsequenceSummary(m);
      const unmet = m.requirementUnmet || m.lockedReason || preflight.blocker || null;
      const expires = m.expiresInS != null ? m.expiresInS : m.time_limit_s;
      const preflightHtml = preflight.chips.map((chip) =>
        '<span class="st-mission-preflight-chip st-mission-preflight-chip--' + chip.kind + '">' + escapeHtml(chip.text) + '</span>'
      ).join('');
      const consequenceHtml = consequences.chips.map((chip) =>
        '<span class="st-mission-consequence st-mission-consequence--' + chip.kind + '"><b>' + escapeHtml(chip.label) + '</b> ' + escapeHtml(chip.text) + '</span>'
      ).join('');
      const card = document.createElement('div');
      card.className = 'st-mission-card' + (tracked && tracked === mid ? ' tracked' : '');
      card.innerHTML =
        '<div class="st-mission-top">' +
          '<span class="st-mission-title">' + escapeHtml(m.title || prettyType(m.type)) + '</span>' +
          '<span class="st-mission-risk r' + risk + '">RISK ' + risk + '</span>' +
        '</div>' +
        '<div class="st-mission-meta mono">' +
          (fac ? '<span class="st-mission-fac" style="color:' + (fac.color || '#aaa') + '">' + escapeHtml(fac.short || fac.name) + '</span> · ' : '') +
          escapeHtml(prettyType(m.type)) +
          (m.destStationId || m.destSectorId || m.dest ? ' → ' + escapeHtml(missionDestName(m)) : '') +
        '</div>' +
        '<div class="st-mission-brief">' + escapeHtml(missionBriefText(m)) + '</div>' +
        '<div class="st-mission-purpose">' + escapeHtml(missionValueText(m)) + '</div>' +
        '<div class="st-mission-next">' + escapeHtml(missionNextStepText(m)) + '</div>' +
        '<div class="st-mission-preflight">' + preflightHtml + '</div>' +
        (preflight.warning ? '<div class="st-mission-preflight-warn">' + escapeHtml(preflight.warning) + '</div>' : '') +
        '<div class="st-mission-rewards mono">' +
          '<span class="st-mission-cr">+' + (consequences.reward || 0).toLocaleString('en-US') + ' cr</span>' +
          (consequences.repReward ? '<span class="st-mission-rep">+' + consequences.repReward + ' rep</span>' : '') +
          (expires != null ? '<span class="st-mission-exp">' + fmtTime(expires) + '</span>' : '') +
        '</div>' +
        '<div class="st-mission-consequences mono">' + consequenceHtml + '</div>' +
        '<div class="st-mission-btns">' +
          '<button data-act="accept" data-mid="' + escapeHtml(mid) + '"' + (unmet ? ' disabled title="' + escapeHtml(unmet) + '"' : ' title="Accept, auto-track, and add to Mission Log"') + '>Accept + Track</button>' +
          (unmet ? '<span class="st-mission-unmet">' + escapeHtml(unmet) + '</span>' : '') +
        '</div>';
      frag.appendChild(card);
    }
    list.appendChild(frag);
  },

  /** Activate a tab: toggle rail highlight + panel visibility, persist ui.activeStationTab. */
  setTab(tabId, options = {}) {
    if (!TABS.some((t) => t.id === tabId)) tabId = 'market';
    const prevTab = this._activePanelId();
    if (prevTab !== tabId) {
      const prev = this._panels && this._panels[prevTab];
      if (prev && typeof prev.onHide === 'function') {
        try { prev.onHide(); } catch (e) { console.error(e); }
      }
    }
    this._ctx.state.ui.activeStationTab = tabId;
    // rail highlight
    let activeButton = null;
    this._rail.querySelectorAll('[data-tab]').forEach((b) => {
      const isActive = b.getAttribute('data-tab') === tabId;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      b.setAttribute('tabindex', isActive ? '0' : '-1');
      if (isActive) activeButton = b;
    });
    // panel visibility
    for (const id in this._panels) {
      const isActive = id === tabId;
      this._panels[id].el.style.display = isActive ? '' : 'none';
      this._panels[id].el.hidden = !isActive;
    }
    if (this._missionEls) {
      const isActive = tabId === 'missions';
      this._missionEls.panel.style.display = isActive ? '' : 'none';
      this._missionEls.panel.hidden = !isActive;
    }
    this._refreshPurpose();
    if (options.focusRail && activeButton && document.activeElement !== activeButton) {
      activeButton.focus({ preventScroll: true });
    }
    // refresh the now-visible panel
    this._refreshActive(true);
  },

  _onRailKeydown(ev) {
    const currentButton = ev.target && ev.target.closest && ev.target.closest('[role="tab"][data-tab]');
    if (!currentButton || !this._rail || !this._rail.contains(currentButton)) return;
    const buttons = Array.from(this._rail.querySelectorAll('[role="tab"][data-tab]'));
    if (!buttons.length) return;

    const key = ev.key;
    const currentIndex = Math.max(0, buttons.indexOf(currentButton));
    let nextIndex = currentIndex;
    if (key === 'ArrowDown' || key === 'ArrowRight' || key === 'PageDown') nextIndex = (currentIndex + 1) % buttons.length;
    else if (key === 'ArrowUp' || key === 'ArrowLeft' || key === 'PageUp') nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    else if (key === 'Home') nextIndex = 0;
    else if (key === 'End') nextIndex = buttons.length - 1;
    else if (key === 'Enter' || key === ' ') nextIndex = currentIndex;
    else return;

    ev.preventDefault();
    ev.stopPropagation();
    const nextButton = buttons[nextIndex];
    const tabId = nextButton && nextButton.getAttribute('data-tab');
    if (!tabId) return;
    this.setTab(tabId, { focusRail: true });
    this._ctx.bus.emit('audio:cue', { id: 'ui_tab' });
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

  _refreshPurpose() {
    if (!this._purposeEl) return;
    const stn = this._stationDef();
    const typeEl = this._purposeEl.querySelector('.st-purpose-type');
    const copyEl = this._purposeEl.querySelector('.st-purpose-copy');
    const tabEl = this._purposeEl.querySelector('.st-purpose-tab');
    const servicesEl = this._purposeEl.querySelector('.st-purpose-services');
    if (typeEl) typeEl.textContent = stationTypeLabel(stn && stn.type);
    if (copyEl) copyEl.textContent = stationPurpose(stn);
    if (tabEl) tabEl.textContent = 'Current tab: ' + tabPurpose(this._activePanelId());
    if (servicesEl) servicesEl.textContent = stationServiceSummary(stn);
  },

  _refreshDeparture() {
    if (!this._departureEl) return;
    const chips = departureReadinessChips(this._ctx && this._ctx.state);
    this._departureEl.innerHTML = chips.map((chip) => departureChipHtml(chip)).join('');
  },

  /** Called by screenManager when this screen becomes the top of the stack. */
  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    this._resolveStation();
    this._refreshTopbar();
    this._refreshGraffiti();
    this._refreshPurpose();
    this._refreshDeparture();
    // restore the last active tab (or default 'market')
    const tab = this._activePanelId();
    this.setTab(tab); // also refreshes the active panel via onShow
  },

  onHide() {
    const p = this._panels && this._panels[this._activePanelId()];
    if (p && typeof p.onHide === 'function') {
      try { p.onHide(); } catch (e) { console.error(e); }
    }
  },

  /** Generic refresh (data-event driven). Refreshes only the active panel for cheapness. */
  refresh(ctx, options = {}) {
    if (ctx) this._ctx = ctx;
    if (!this._el) return;
    this._refreshTopbar();
    this._refreshGraffiti();
    this._refreshPurpose();
    this._refreshDeparture();
    if (!(options.periodic && this._activePanelId() === 'bar')) this._refreshActive(false);
  },

  /** Render the airlock graffiti from state.ui.graffiti (stashed by the narrative overlay).
   *  Lines accumulate across beats — the airlock remembers everything painted on it. */
  _refreshGraffiti() {
    if (!this._airlockEl) return;
    const ctx = this._ctx;
    const stash = (ctx.state.ui && ctx.state.ui.graffiti) || [];
    // only surface non-bulkhead graffiti at the airlock (bulkhead is the player's own ship)
    const lines = stash.filter((g) => g.where !== 'bulkhead');
    if (!lines.length) { this._airlockEl.innerHTML = '<span class="st-airlock__empty">clean bulkhead</span>'; return; }
    const frag = document.createDocumentFragment();
    for (const g of lines) {
      const ln = document.createElement('div');
      ln.className = 'st-airlock__line';
      ln.textContent = g.line;
      // vary the skew/offset slightly per line so it reads as hand-sprayed, not typeset
      ln.style.setProperty('--graffiti-skew', ((g.line.length % 5) - 2) * 0.4 + 'deg');
      ln.title = g.author ? ('— ' + g.author) : '';
      frag.appendChild(ln);
    }
    this._airlockEl.innerHTML = '';
    this._airlockEl.appendChild(frag);
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
    const refreshDeparture = () => { if (this._visible()) this._refreshDeparture(); };
    // market-affecting
    bus.on('economy:tradeCompleted', onActive(['market', 'services']));
    bus.on('economy:tick', onActive(['market']));
    bus.on('cargo:changed', onActive(['market', 'outfit', 'services']));
    bus.on('cargo:changed', refreshDeparture);
    bus.on('credits:changed', onActive(['market', 'shipyard', 'outfit', 'services']));
    bus.on('credits:changed', refreshDeparture);
    // ship/outfitting-affecting
    bus.on('ship:statsChanged', onActive(['outfit', 'shipyard', 'services']));
    bus.on('ship:statsChanged', refreshDeparture);
    bus.on('ship:purchased', onActive(['shipyard', 'outfit']));
    bus.on('ship:sold', onActive(['shipyard', 'outfit']));
    bus.on('module:equipped', onActive(['outfit']));
    bus.on('module:unequipped', onActive(['outfit']));
    bus.on('module:purchased', onActive(['outfit']));
    bus.on('tech:researched', onActive(['shipyard', 'outfit']));
    // services-affecting
    bus.on('fuel:changed', onActive(['services']));
    bus.on('fuel:changed', refreshDeparture);
    bus.on('nav:waypoint', refreshDeparture);
    // factions
    bus.on('faction:repChanged', onActive(['factions']));
    // missions
    bus.on('mission:updated', () => {
      if (!this._visible()) return;
      if (this._activePanelId() === 'missions') this._refreshMissions();
      this._refreshDeparture();
    });
    bus.on('mission:accepted', (payload) => {
      if (!this._visible()) return;
      this._setMissionAcceptedStatus(payload && payload.missionId);
      if (this._activePanelId() === 'missions') this._refreshMissions();
      this._refreshDeparture();
    });
    bus.on('mission:completed', () => { this._refreshMissionAcceptedStatus(); refreshDeparture(); });
    bus.on('mission:failed', () => { this._refreshMissionAcceptedStatus(); refreshDeparture(); });
    bus.on('mission:expired', () => { this._refreshMissionAcceptedStatus(); refreshDeparture(); });
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

function prettyId(id) {
  return String(id || '')
    .replace(/^(station|sector|cmdty|faction)_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function plural(count, singular, pluralForm) {
  return count === 1 ? singular : (pluralForm || singular + 's');
}

function missionDestName(m) {
  const direct = m.destName || m.destStationName;
  if (direct) return direct;
  const rawDest = m.dest || '';
  const stationId = m.destStationId || (String(rawDest).startsWith('station_') ? rawDest : null);
  const station = stationId ? STATION_BY_ID.get(stationId) : null;
  if (station) return station.name;
  const sectorId = m.destSectorId || (String(rawDest).startsWith('sector_') ? rawDest : null);
  const sector = sectorId ? SECTOR_BY_ID.get(sectorId) : null;
  if (sector) return sector.name;
  if (rawDest) return prettyId(rawDest);
  return 'the target area';
}

function missionClientName(m) {
  const fac = m && m.factionId ? FACTION_BY_ID.get(m.factionId) : null;
  return (fac && (fac.short || fac.name)) || 'The client';
}

function missionCommodityName(m) {
  const id = m && m.params && m.params.cmdtyId;
  const commodity = id ? COMMODITY_BY_ID.get(id) : null;
  return (commodity && commodity.name) || 'cargo';
}

function missionCargoAmount(m) {
  const p = m && m.params || {};
  const cargo = missionCommodityName(m);
  return p.qty ? p.qty + 'u ' + cargo : cargo;
}

function missionBriefText(m) {
  const p = m && m.params || {};
  const client = missionClientName(m);
  const dest = missionDestName(m || {});
  const cargo = missionCommodityName(m);
  const amount = missionCargoAmount(m);
  switch (m && m.type) {
    case 'cargo_delivery':
      return client + ' wants ' + amount + ' delivered to ' + dest + ' with the manifest clean and the route quiet.';
    case 'bulk_trade':
      return dest + ' is short on ' + cargo + '; sell the quota there before the board reprices the lane.';
    case 'mining_quota':
      return client + ' has a buyer waiting for ' + amount + '. Mine the quota and return with cargo space to spare.';
    case 'salvage_retrieval':
      return client + ' marked recoverable ' + amount + ' in hostile drift. Bring it back before another crew logs the claim.';
    case 'smuggling_run':
      return client + ' pays for ' + amount + ' that should not become a customs story. Reach ' + dest + ' without inviting scans.';
    case 'bounty_hunt':
      return client + ' posted a tag near ' + dest + '; expect a pilot who knows why the bounty is high.';
    case 'escort':
      return client + ' needs a convoy visible, intact, and boring all the way to ' + dest + '.';
    case 'patrol_clear': {
      const count = p.clearCount || 1;
      return client + ' wants ' + count + ' hostile ' + plural(count, 'signature') + ' erased from the lane before traders notice.';
    }
    case 'recon_scan': {
      const count = p.scanTargets || 1;
      return client + ' needs ' + count + ' quiet scan ' + plural(count, 'sweep') + ' near ' + dest + '; measure the site and leave clean.';
    }
    case 'passenger_transport':
      return client + ' has one passenger who paid for a dull manifest and a quiet berth to ' + dest + '.';
    default:
      return client + ' posted a contract with enough detail to plan the work before undocking.';
  }
}

function missionValueText(m) {
  switch (m && m.type) {
    case 'cargo_delivery':
      return 'Pays for hauling cargo; useful when you have free cargo space and need credits for refits.';
    case 'bulk_trade':
      return 'Turns market buying/selling into a contract payout on top of normal trade profit.';
    case 'mining_quota':
      return 'Rewards asteroid work; better mining beams and cargo modules make this faster.';
    case 'salvage_retrieval':
      return 'Pays for recovery runs; bring cargo room and expect debris or hostile space.';
    case 'bounty_hunt':
    case 'patrol_clear':
      return 'Combat work for credits and standing; hull, shield, and weapon upgrades matter here.';
    case 'escort':
      return 'Convoy work that rewards survivability, weapons, and staying near the objective.';
    case 'smuggling_run':
      return 'High-risk cargo pay; restricted routes can be profitable but invite scans and trouble.';
    case 'passenger_transport':
      return 'Straight route work; faster ships and safer paths reduce deadline pressure.';
    case 'recon_scan':
      return 'Exploration work; scanners, utility slots, and map awareness shorten the job.';
    default:
      return 'Contract reward feeds the upgrade loop: credits, standing, fuel, repairs, and better gear.';
  }
}

function missionNextStepText(m) {
  const dest = missionDestName(m || {});
  switch (m && m.type) {
    case 'mining_quota':
      return 'Next: accept, undock to an asteroid field, mine the quota, then follow the tracked objective.';
    case 'bulk_trade':
      return 'Next: accept, buy or carry the requested goods, then sell them where the tracker points.';
    case 'bounty_hunt':
    case 'patrol_clear':
      return 'Next: accept, undock, follow the tracked nav, and be ready to fight.';
    case 'recon_scan':
      return 'Next: accept, undock, follow tracked nav, and scan the marked sites.';
    default:
      return 'Next: accept to auto-track it, undock, then follow nav guidance toward ' + dest + '.';
  }
}

function missionAfterAcceptText(m) {
  const dest = missionDestName(m || {});
  switch (m && m.type) {
    case 'mining_quota':
      return 'Undock to an asteroid field, mine the quota, then follow the tracker back for payout.';
    case 'bulk_trade':
      return 'Buy or carry the requested goods, then sell them where the tracked market points.';
    case 'bounty_hunt':
    case 'patrol_clear':
      return 'Undock, follow tracked nav, and be ready to fight before the timer runs down.';
    case 'recon_scan':
      return 'Undock, follow tracked nav, and scan each marked site before returning.';
    case 'cargo_delivery':
    case 'passenger_transport':
    case 'escort':
    case 'smuggling_run':
    case 'salvage_retrieval':
      return 'Undock, follow nav guidance toward ' + dest + ', then dock to resolve the handoff.';
    default:
      return 'Undock, follow the tracked objective, and check Mission Log (J) for progress.';
  }
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
/* airlock graffiti strip — the threshold on entry. Reads as vandalism; is the most accurate text. */
.st-airlock { display:flex; align-items:stretch; gap:0; border-bottom:1px solid var(--panel-edge);
  background:linear-gradient(180deg, rgba(6,10,18,.6), rgba(4,7,14,.4)); min-height:0; }
.st-airlock__label { writing-mode:vertical-rl; transform:rotate(180deg); padding:6px 4px; font-size:8px;
  letter-spacing:.2em; color:var(--ink-mute); border-right:1px solid var(--panel-edge); align-self:stretch; }
.st-airlock__graffiti { flex:1; padding:7px 12px; display:flex; flex-direction:column; gap:3px;
  overflow:hidden; }
.st-airlock__line { --graffiti-skew:0deg; font-family:var(--mono); font-size:11px; letter-spacing:.14em;
  color:#9aa6b8; text-transform:uppercase; opacity:.82; transform:rotate(var(--graffiti-skew));
  text-shadow:0 1px 2px #000; line-height:1.3; }
.st-airlock__empty { font-size:10px; color:var(--ink-mute); font-style:italic; opacity:.5; }
.st-purpose { display: grid; gap: 4px; padding: 9px 20px 10px; border-bottom: 1px solid var(--panel-edge);
  background: rgba(8,14,26,.54); }
.st-purpose-main { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.st-purpose-type { color: var(--accent); font-size: .68rem; letter-spacing: .14em; text-transform: uppercase; flex: none; }
.st-purpose-copy { color: var(--ink); font-size: .82rem; line-height: 1.35; }
.st-purpose-sub { display: flex; flex-wrap: wrap; gap: 10px 18px; color: var(--ink-mute); font-size: .72rem; line-height: 1.35; }
.st-purpose-tab { color: var(--ink-dim); }
.st-undock:hover { background: var(--grad-accent); color: #04121a; box-shadow: 0 0 16px rgba(57,208,255,.4); }
.st-departure { display: flex; align-items: center; gap: 10px; min-height: 42px; padding: 7px 20px;
  border-bottom: 1px solid var(--panel-edge); background: rgba(4,9,18,.58); }
.st-departure-label { flex: none; color: var(--ink-mute); font-size: .62rem; text-transform: uppercase; }
.st-departure-chips { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.st-departure-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 24px; max-width: 230px;
  padding: 2px 8px; border: 1px solid var(--panel-edge); border-radius: 4px; background: rgba(10,18,32,.46);
  color: var(--ink-dim); font: inherit; font-size: .72rem; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
button.st-departure-chip { margin: 0; appearance: none; cursor: pointer; text-align: left; }
button.st-departure-chip:hover { background: rgba(57,208,255,.08); color: var(--ink); }
button.st-departure-chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.st-departure-chip b { color: var(--ink-mute); font-weight: 600; text-transform: uppercase; }
.st-departure-chip span { overflow: hidden; text-overflow: ellipsis; }
.st-departure-chip--ok { color: var(--good); border-color: rgba(98,224,138,.34); }
.st-departure-chip--warn { color: var(--warn); border-color: rgba(255,198,77,.34); }
.st-departure-chip--bad { color: var(--danger); border-color: rgba(255,84,112,.34); }
.st-departure-chip--info { color: var(--accent); border-color: rgba(57,208,255,.28); }
.st-body { display: flex; flex: 1; min-height: 0; }
.st-rail { width: 176px; flex: none; display: flex; flex-direction: column; gap: 3px; padding: var(--sp-3) var(--sp-2);
  border-right: 1px solid var(--panel-edge); background: rgba(6,10,20,.55); }
.st-tab { display: flex; align-items: center; gap: 10px; text-align: left; background: transparent;
  border: 1px solid transparent; border-radius: var(--r-md); padding: 9px 12px; color: var(--ink-dim);
  transition: all var(--dur) var(--ease); }
.st-tab:hover { color: var(--ink); background: rgba(57,208,255,.06); }
.st-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; color: var(--ink);
  background: rgba(57,208,255,.08); }
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
.st-market-purpose { margin: -2px 0 10px; border: 1px solid var(--panel-edge); border-radius: 6px;
  padding: 9px 11px; background: rgba(10,18,32,.5); color: var(--ink-dim); font-size: .8rem; line-height: 1.4; }
.st-market-purpose b { color: var(--ink); font-weight: 600; }
.st-market-mission { margin: -2px 0 10px; border: 1px solid rgba(57,208,255,.46); border-radius: 6px;
  padding: 9px 11px; background: rgba(15,37,54,.38); box-shadow: 0 0 12px rgba(57,208,255,.12); }
.st-market-mission[hidden] { display: none; }
.st-market-mission-label { color: var(--accent); font-size: .6rem; letter-spacing: .14em; margin-bottom: 4px; }
.st-market-mission-title { color: var(--ink); font-weight: 700; font-size: .88rem; line-height: 1.3; }
.st-market-mission-body { color: var(--ink-dim); font-size: .78rem; line-height: 1.35; margin-top: 4px; }
.st-market-mission-meta { color: var(--energy); font-size: .66rem; margin-top: 5px; }
.st-cmdty-purpose { display: block; margin-top: 3px; white-space: normal; line-height: 1.25; }
.st-market-mission-line { display: block; margin-top: 3px; color: var(--accent); white-space: normal; line-height: 1.25; }
.st-market-mission-line[hidden] { display: none; }
.st-row.tracked-mission { border-color: rgba(57,208,255,.45); background: rgba(57,208,255,.045); }
.st-market-route { margin: -2px 0 10px; border: 1px solid rgba(98,224,138,.42); border-radius: 6px;
  padding: 9px 11px; background: rgba(18,48,34,.34); box-shadow: 0 0 12px rgba(98,224,138,.10); }
.st-market-route[hidden] { display: none; }
.st-market-route-label { color: var(--good); font-size: .6rem; letter-spacing: .14em; margin-bottom: 4px; }
.st-market-route-title { color: var(--ink); font-weight: 700; font-size: .88rem; line-height: 1.3; }
.st-market-route-body { color: var(--ink-dim); font-size: .78rem; line-height: 1.35; margin-top: 4px; }
.st-market-route-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 7px; }
.st-market-route-meta { color: var(--good); font-size: .66rem; }
.st-market-route button { padding: 4px 9px; font-size: .72rem; border-radius: 5px; cursor: pointer;
  border-color: var(--good); color: var(--good); background: rgba(98,224,138,.08); white-space: nowrap; }
.st-market-route button:hover:not(:disabled) { background: rgba(98,224,138,.15); }
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
/* market footer message (e.g. "Select a quantity, then Buy or Sell." / the live trade result) —
   referenced in market.js but never defined, so it was inheriting unstyled. */
.st-foot-msg { font-family: var(--mono); font-size: .76rem; letter-spacing: .04em; }
.st-foot-msg.st-foot-msg--ok { color: var(--good); }
.st-foot-msg.st-foot-msg--bad { color: var(--danger); }

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
.st-planner-row { display: grid; grid-template-columns: 1.25fr 1.8fr 1.25fr 1.35fr 1.15fr auto auto; align-items: center; gap: 8px;
  padding: 6px 9px; background: rgba(10,18,32,.5); border: 1px solid var(--panel-edge); border-radius: 6px; font-size: .82rem; }
.st-pl-cmdty { color: var(--ink); font-weight: 600; }
.st-pl-prices { color: var(--ink-dim); font-size: .78rem; }
.st-pl-margin { font-weight: 600; }
.st-pl-up { color: var(--good); }
.st-pl-run { font-family: var(--mono); font-size: .76rem; }
.st-pl-run--ok { color: var(--energy); }
.st-pl-run--blocked { color: var(--ink-mute); font-style: italic; }
.st-pl-dest { color: var(--ink-mute); font-size: .78rem; }
.st-pl-nav, .st-pl-load { padding: 4px 9px; font-size: .72rem; border-radius: 5px; cursor: pointer; white-space: nowrap; }
.st-pl-load { border-color: var(--good); color: var(--good); background: rgba(98,224,138,.08); }
.st-pl-load:hover { background: rgba(98,224,138,.15); }
.st-pl-nav { border-color: var(--accent); color: var(--accent); }
.st-pl-nav:hover { background: rgba(57,208,255,.14); }
.st-heat-up { color: var(--danger); }     /* dear = sell opportunity (red = you can sell high) */
.st-heat-down { color: var(--good); }     /* cheap = buy opportunity (green = buy low) */
.st-heat-flat { color: var(--ink-dim); }
/* UX-4: inline price-trend sparkline next to each commodity name. Small + muted so it reads as a
   secondary cue (the ▲/▼ heat is the primary); trend-colored by sparkline.js (warm up / cool down). */
.st-spark { display:inline-block; width:56px; height:14px; vertical-align:middle; margin-left:8px;
  opacity:.85; }

/* shipyard */
/* The hulls-for-sale table has 7 columns (Hull name, Tier, Hull, Shield, Cargo, Price, action) but
   the shared .st-row grid only defines 6 tracks — so shipyard rows were misaligning / squishing the
   last column. Scope a 7-track grid under .st-shipyard so the market table (6 cols) is unaffected. */
.st-shipyard .st-row { grid-template-columns: 2.6fr .6fr .8fr .9fr .9fr 1.3fr 1fr; }
.st-sy-owned { margin-bottom: 16px; }
.st-sy-owned-list { display: flex; gap: 10px; flex-wrap: wrap; }
.st-sy-card { border: 1px solid var(--panel-edge); border-radius: 6px; padding: 10px 12px; min-width: 180px;
  background: rgba(10,18,32,.6); }
.st-sy-card.active { border-color: var(--accent); box-shadow: 0 0 12px rgba(57,208,255,.25); }
.st-sy-name { font-size: .95rem; margin-bottom: 3px; }
.st-sy-meta { color: var(--ink-dim); font-size: .72rem; margin-bottom: 8px; }
.st-sy-guide, .st-sy-purpose, .st-sy-card-purpose { color: var(--ink-dim); font-size: .74rem; line-height: 1.35; }
.st-sy-guide { margin: -2px 0 10px; border: 1px solid var(--panel-edge); border-radius: 6px;
  padding: 9px 11px; background: rgba(10,18,32,.5); }
.st-sy-purpose { display: block; margin-top: 3px; white-space: normal; }
.st-sy-card-purpose { margin: -3px 0 8px; color: var(--ink-mute); }
.st-sy-btns { display: flex; gap: 6px; }
.st-sy-btns button { font-size: .75rem; padding: 4px 8px; }

/* outfitting */
/* the two-column wrapper (slot grid + stat table) referenced in outfitting.js — was undefined. */
.st-outfit-grid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 18px; align-items: start; }
.st-outfit-top { display: grid; grid-template-columns: 1.6fr 1fr; gap: 18px; margin-bottom: 16px; }
.st-slot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.st-slot { border: 1px solid var(--panel-edge); border-radius: 6px; padding: 8px 10px; cursor: pointer;
  background: rgba(10,18,32,.5); position: relative; }
.st-slot.empty { border-style: dashed; }
.st-slot.filled { border-color: var(--panel-edge-2); }
.st-slot.sel { border-color: var(--accent); box-shadow: 0 0 8px rgba(57,208,255,.3); }
/* Type-coded left accent so slot kinds are scannable at a glance. The .st-slot-{type} modifier
   is emitted by outfitting.js per cell; these cover every slotType in data/ships.js + modules.js. */
.st-slot-weapon { border-left: 3px solid var(--danger); }
.st-slot-shield { border-left: 3px solid var(--shield); }
.st-slot-engine { border-left: 3px solid var(--warn); }
.st-slot-cargo { border-left: 3px solid var(--cargo); }
.st-slot-mining { border-left: 3px solid var(--accent-2); }
.st-slot-utility { border-left: 3px solid var(--accent-3); }
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
.st-stat-row--drive { grid-template-columns: 1.4fr 1fr; border-bottom: 1px solid var(--panel-edge);
  margin-bottom: 3px; padding-bottom: 4px; }
.st-stat-row--drive .st-stat-v { color: var(--accent); letter-spacing: .04em; }
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

/* module shop (outfitting) */
.st-outfit-shop { margin-top: 20px; border-top: 1px solid var(--panel-edge); padding-top: 12px; }
.st-shop-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.st-shop-credits { color: var(--energy); font-size: .92rem; }
.st-shop-head-row.st-row { grid-template-columns: 2.2fr .8fr 2.4fr 1fr 1.2fr; }
.st-shop-list { display: block; max-height: 340px; overflow-y: auto; }
.st-shop-row { display: grid; grid-template-columns: 2.2fr .8fr 2.4fr 1fr 1.2fr; align-items: center;
  gap: 8px; padding: 7px 8px; border-bottom: 1px solid rgba(29,51,80,.4); font-size: .82rem;
  transition: background var(--dur) var(--ease); }
.st-shop-row:hover { background: rgba(57,208,255,.05); }
.st-shop-row.locked { opacity: .45; filter: saturate(.3); }
.st-shop-row.noafford { opacity: .6; }
.st-shop-row.nofit .c-name { color: var(--ink-mute); }
.st-shop-slot { color: var(--ink-mute); text-transform: uppercase; letter-spacing: .06em; font-size: .72rem; }
.st-shop-stats { color: var(--ink-dim); font-size: .74rem; line-height: 1.35; }
.st-shop-price { text-align: right; color: var(--energy); }
.st-shop-delta { margin-top: 2px; display: flex; flex-wrap: wrap; gap: 4px; }
.st-shop-delta .st-delta { font-size: .68rem; }
.st-shop-group { font-family: var(--mono); font-size: var(--t-xs); letter-spacing: .16em;
  text-transform: uppercase; color: var(--accent); margin: 12px 0 4px; padding: 4px 8px;
  display: flex; align-items: center; gap: 10px; }
.st-shop-group::after { content:''; flex:1; height:1px; background:linear-gradient(90deg, var(--panel-edge), transparent); }
.st-shop-row .c-act button { font-size: .74rem; padding: 3px 10px; }
.st-shop-row .c-act button:not(:disabled) { border-color: var(--good); color: var(--good); cursor: pointer; }
.st-shop-row .c-act button:not(:disabled):hover { background: var(--good); color: #021008; }

/* services */
.st-svc-list { display: flex; flex-direction: column; gap: 8px; }
.st-svc-row { display: flex; align-items: center; justify-content: space-between; gap: 12px;
  border: 1px solid var(--panel-edge); border-radius: 6px; padding: 10px 14px; background: rgba(10,18,32,.5); }
.st-svc-row.disabled { opacity: .5; }
.st-svc-row--blocked { border-color: rgba(255,84,112,.32); }
.st-svc-row--recommend { border-color: rgba(57,208,255,.34); background: linear-gradient(90deg, rgba(57,208,255,.12), rgba(10,18,32,.58)); }
.st-svc-row--recommend-ok { border-color: rgba(98,224,138,.3); background: linear-gradient(90deg, rgba(98,224,138,.1), rgba(10,18,32,.56)); }
.st-svc-row--recommend-warn { border-color: rgba(255,198,77,.36); background: linear-gradient(90deg, rgba(255,198,77,.12), rgba(10,18,32,.58)); }
.st-svc-row--recommend-bad { border-color: rgba(255,84,112,.42); background: linear-gradient(90deg, rgba(255,84,112,.14), rgba(10,18,32,.58)); }
.st-svc-row--recommend .st-svc-name { color: var(--accent); font-family: var(--mono); font-size: .72rem;
  letter-spacing: .11em; text-transform: uppercase; }
.st-svc-name { font-size: .92rem; }
.st-svc-detail { font-size: .72rem; color: var(--ink-dim); margin-top: 2px; }
.st-svc-meta { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.st-svc-chip { font-family: var(--mono); font-size: .68rem; line-height: 1.2; padding: 2px 7px; border-radius: 999px;
  border: 1px solid var(--panel-edge); color: var(--ink-dim); background: rgba(132,160,200,.08); }
.st-svc-chip--ok { color: var(--good); border-color: rgba(98,224,138,.32); background: rgba(98,224,138,.1); }
.st-svc-chip--warn { color: var(--warn); border-color: rgba(255,198,77,.34); background: rgba(255,198,77,.1); }
.st-svc-chip--bad { color: var(--danger); border-color: rgba(255,84,112,.34); background: rgba(255,84,112,.1); }
.st-svc-chip--cost { color: var(--energy); border-color: rgba(255,216,74,.28); background: rgba(255,216,74,.08); }

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
.st-fac-ctrl, .st-fac-rel { font-size: .66rem; color: var(--ink-mute); margin-top: 5px; }
.st-fac-rel { color: var(--ink-dim); }
.st-fac-effect { font-size: .74rem; color: var(--ink); line-height: 1.35; margin-top: 5px; }
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
.st-bar-offer { margin-top: 8px; display: grid; gap: 6px; justify-items: start; }
.st-bar-offer .st-mission-preflight { margin: 0; }
.st-bar-offer .st-mission-consequences { margin: 0; }
.st-bar-offer.accepted { opacity: .82; }
.st-bar-offer-warn { margin: -1px 0 0; }
.st-bar-offer-blocker { margin: -1px 0 0; }
.st-bar-accept-btn { font-size: .78rem; }

/* missions */
.st-mission-guide { margin: -2px 0 12px; border: 1px solid var(--panel-edge); border-radius: 6px;
  padding: 9px 11px; background: rgba(10,18,32,.5); color: var(--ink-dim); font-size: .8rem; line-height: 1.4; }
.st-mission-accepted { margin: -2px 0 12px; border: 1px solid rgba(98,224,138,.42); border-radius: 6px;
  padding: 10px 12px; background: rgba(25,54,42,.36); box-shadow: 0 0 12px rgba(98,224,138,.12); }
.st-mission-accepted[hidden] { display: none; }
.st-mission-accepted-label { color: var(--good); font-size: .62rem; letter-spacing: .14em; margin-bottom: 4px; }
.st-mission-accepted-title { color: var(--ink); font-weight: 700; font-size: .9rem; line-height: 1.3; }
.st-mission-accepted-next { color: var(--ink-dim); font-size: .78rem; line-height: 1.35; margin-top: 4px; }
.st-mission-accepted-log { color: var(--ink-mute); font-size: .68rem; line-height: 1.35; margin-top: 6px; }
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
.st-mission-brief { color: var(--ink); font-size: .82rem; line-height: 1.38; margin-top: 6px; }
.st-mission-purpose { color: var(--ink); font-size: .78rem; line-height: 1.35; margin-top: 5px; }
.st-mission-next { color: var(--ink-mute); font-size: .72rem; line-height: 1.35; margin: 3px 0 8px; }
.st-mission-preflight { display: flex; flex-wrap: wrap; gap: 5px; margin: 0 0 8px; }
.st-mission-preflight-chip { font-family: var(--mono); font-size: .66rem; letter-spacing: .04em;
  border: 1px solid var(--panel-edge); border-radius: 4px; padding: 2px 6px; color: var(--ink-dim);
  background: rgba(10,18,32,.48); }
.st-mission-preflight-chip--ok { color: var(--good); border-color: rgba(98,224,138,.34); }
.st-mission-preflight-chip--warn { color: var(--warn); border-color: rgba(255,198,77,.34); }
.st-mission-preflight-chip--bad { color: var(--danger); border-color: rgba(255,84,112,.34); }
.st-mission-preflight-chip--info { color: var(--accent); border-color: rgba(57,208,255,.28); }
.st-mission-preflight-warn { color: var(--warn); font-size: .7rem; line-height: 1.3; margin: -3px 0 8px; }
.st-mission-rewards { display: flex; gap: 14px; font-size: .8rem; margin-bottom: 8px; }
.st-mission-cr { color: var(--energy); }
.st-mission-rep { color: var(--accent-2); }
.st-mission-exp { color: var(--ink-mute); }
.st-mission-consequences { display: flex; flex-wrap: wrap; gap: 5px; margin: -2px 0 8px; }
.st-mission-consequence { font-size: .64rem; letter-spacing: .02em; line-height: 1.25;
  padding: 3px 6px; border: 1px solid rgba(148,163,184,.18); border-radius: 4px;
  color: var(--ink-dim); background: rgba(255,255,255,.025); }
.st-mission-consequence b { color: var(--ink); font-weight: 700; text-transform: uppercase; }
.st-mission-consequence--ok { border-color: rgba(98,224,138,.3); color: var(--good); }
.st-mission-consequence--warn { border-color: rgba(255,198,77,.3); color: var(--warn); }
.st-mission-consequence--bad { border-color: rgba(255,84,112,.34); color: var(--danger); }
.st-mission-btns { display: flex; gap: 8px; align-items: center; }
.st-mission-btns button { font-size: .78rem; }
.st-mission-unmet { font-size: .7rem; color: var(--danger); }
`;
