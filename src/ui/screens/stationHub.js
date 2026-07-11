// src/ui/screens/stationHub.js — the docked STATION hub screen (id 'station').
// A 7-tab left rail (Market / Shipyard / Outfitting / Missions / Services / Factions / Bar) + a
// right content pane; switching tabs swaps the active panel (state.ui.activeStationTab). Undock /
// Back exit is owned by requestStationExit (implicit clean→confirm, explicit hold/RISK confirm);
// only committed undocks emit dock:undocked. onShow(ctx) resolves the docked station and refreshes.
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
import { createFactionsPanel, tierFor, factionStandingGuidance } from './factions.js';
import { createBarPanel } from './bar.js';
import { SECTORS } from '../../data/sectors.js';
import { FACTION_META } from '../../data/factions.js';
import { NEW_GAME } from '../../data/newGameDefaults.js';
import { COMMODITIES } from '../../data/commodities.js';
import { escapeHtml } from '../comms.js';
import { missionPreflight } from '../missionPreflight.js';
import { missionConsequenceSummary } from '../missionPreflight.js';
import { missionStandingRequirement } from '../missionPreflight.js';
import { missionRouteIntel, missionCargoFootprint, fmtHoldUnits } from '../missionPreflight.js';
import { BINDINGS } from '../bindings.js';
import { MAP_FOCUS, openGalaxyMap } from '../mapAuthority.js';
import { buildLadderRailModel } from '../careerLadderView.js';
import { glyphSvg } from '../uiPrimitives.js';
import { STATION_BROADCASTS } from '../../systems/stationBroadcast.js';
import { confirm, isConfirmOpen } from '../confirm.js';
// Command-deck effect layer (vanilla DOM/canvas factories; view-only, no sim import).
// See design/revamp/COMMAND_DECK_EFFECTS_AND_GAMEPLAY_BIBLE.md §1 and src/ui/effects/README.md.
import {
  createFlickerGrid,
  createRippleField,
  createRouteBeam,
  createMorphLabel,
  createCircularGauge,
  createDockRail,
} from '../effects/index.js';

// ── Station exit owner (UIUX-STATION-EXIT-CONFIRMATION) ─────────────────────────
// Centralizes implicit Back (Esc/B/E/backdrop) vs explicit Undock. Input.js may still
// emit bare dock:undocked; the bus gate rewrites those into station:exitRequest so
// combat/save/audio never see an uncommitted undock. Committed undocks pass through.

const STATION_EXIT_GATE = Symbol('sfStationExitGate');
let _stationExitOwner = null;

/** @param {{ requestStationExit?: Function }|null} owner */
export function setStationExitOwner(owner) {
  _stationExitOwner = owner || null;
}

/**
 * Whether an exit request still needs a confirm dialog.
 * @param {'implicit'|'explicit'} intent
 * @param {'ready'|'check'|'risk'|string} readinessState
 * @param {boolean} [held] true when the Undock hold charge completed
 */
export function stationExitNeedsConfirm(intent, readinessState, held) {
  if (intent === 'implicit') return true;
  if (intent === 'explicit' && readinessState === 'risk' && !held) return true;
  return false;
}

/**
 * Install a bus-level gate so bare dock:undocked while docked cannot fire side effects.
 * Safe to call multiple times; wraps emit once per bus instance.
 * @param {{ bus: any, state: any }} ctx
 */
export function installStationExitGate(ctx) {
  const bus = ctx && ctx.bus;
  const state = ctx && ctx.state;
  if (!bus || !state || bus[STATION_EXIT_GATE]) return bus;
  const rawEmit = typeof bus.emit === 'function' ? bus.emit.bind(bus) : null;
  if (!rawEmit) return bus;
  bus._sfStationExitRawEmit = rawEmit;
  bus.emit = function stationExitGatedEmit(event, payload) {
    if (event === 'dock:undocked') {
      const p = payload || {};
      if (state.ui && state.ui.docked === true && !p.committed) {
        const req = {
          intent: p.intent === 'explicit' ? 'explicit' : 'implicit',
          source: p.source || 'dock:undocked',
          opener: p.opener || (typeof document !== 'undefined' ? document.activeElement : null),
          held: !!p.held,
        };
        if (_stationExitOwner && typeof _stationExitOwner.requestStationExit === 'function') {
          _stationExitOwner.requestStationExit(req);
        } else {
          rawEmit('station:exitRequest', req);
        }
        return;
      }
    }
    return rawEmit(event, payload);
  };
  bus[STATION_EXIT_GATE] = true;
  return bus;
}

/** Emit the single canonical undock once the exit owner has committed. */
export function commitStationUndock(bus, payload = {}) {
  if (!bus) return;
  const raw = bus._sfStationExitRawEmit || (typeof bus.emit === 'function' ? bus.emit.bind(bus) : null);
  if (!raw) return;
  raw('dock:undocked', Object.assign({}, payload, { committed: true }));
}

const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

/** Station pays this unit price when the player sells cmdtyId (live market → memory → base). */
export function holdUnitSellPrice(state, stationId, cmdtyId) {
  if (!state || !stationId || !cmdtyId) return null;
  const markets = state.economy && state.economy.markets;
  const live = markets && markets[stationId] && markets[stationId][cmdtyId];
  if (live) {
    const v = live.lastSell != null ? live.lastSell : live.sell;
    if (Number.isFinite(Number(v))) return Math.round(Number(v));
  }
  const memRoot = state.player && state.player.marketMemory;
  const mem = memRoot && memRoot[stationId] && memRoot[stationId][cmdtyId];
  if (mem) {
    const v = mem.sell != null ? mem.sell : mem.lastSell;
    if (Number.isFinite(Number(v))) return Math.round(Number(v));
  }
  const def = COMMODITY_BY_ID.get(cmdtyId);
  if (def && Number.isFinite(Number(def.basePrice))) return Math.round(Number(def.basePrice));
  return null;
}
const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const STATION_BY_ID = new Map();
for (const sec of SECTORS) {
  for (const stn of sec.stations || []) STATION_BY_ID.set(stn.id, stn);
}

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

const SERVICE_LABELS = {
  trade: 'Market',
  shipyard: 'Shipyard',
  refuel: 'Refuel',
  repair: 'Repair',
  missions: 'Missions',
  ore_buy: 'Ore Buyer',
  refine: 'Refinery',
  module_craft: 'Manufacture',
  toll: 'Customs Toll',
  scan: 'Security Scan',
  black_market: 'Black Market',
  scan_tech: 'Survey Lab',
};

// Text glyphs for the Service Dock nodes (dockRail renders icon as textContent, not SVG — so these
// are single unicode marks, distinct from the tab rail's SVG glyphs). One per berth service.
const SERVICE_ICON = {
  refuel: '⛽', repair: '⚒', trade: '⚖', ore_buy: '⛏', refine: '♨',
  module_craft: '⚙', shipyard: '⛴', missions: '✦', toll: '⛨', scan: '⌖',
  black_market: '☣', scan_tech: '⌕',
};

// The physical berth services the Service Dock always shows — offered ones read ONLINE, the rest read
// OFFLINE (the "unavailable nodes visibly offline" requirement). This is a SERVICE strip (what this
// berth can physically do), deliberately NOT a copy of the section tab rail (bible §1.10 forbidden).
const CANONICAL_BERTH_SERVICES = [
  'refuel', 'repair', 'trade', 'ore_buy', 'refine', 'module_craft', 'shipyard', 'missions',
];

const TAB_SERVICE_RULES = {
  market: {
    any: ['trade', 'black_market'],
    availableLabel: 'trade desk here',
    unavailableLabel: 'no trade desk',
    unavailableHint: 'Use the Local Map or Star Map to find a market station.',
  },
  shipyard: {
    any: ['shipyard'],
    availableLabel: 'shipyard here',
    unavailableLabel: 'no shipyard',
    unavailableHint: 'Look for a trade hub or fabricator with shipyard service.',
  },
  outfit: {
    any: ['shipyard', 'module_craft'],
    availableLabel: 'outfitting here',
    unavailableLabel: 'no outfitting bay',
    unavailableHint: 'Look for shipyards or fabricators before buying gear.',
  },
  manufacture: {
    any: ['module_craft', 'refine'],
    availableLabel: 'fab bay here',
    unavailableLabel: 'no fabrication bay',
    unavailableHint: 'Bring materials to a refinery or fabricator station.',
  },
  missions: {
    any: ['missions', 'black_market'],
    availableLabel: 'contracts here',
    unavailableLabel: 'no mission desk',
    unavailableHint: 'Try a station with missions or a black-market contact.',
  },
  services: {
    any: ['refuel', 'repair', 'toll', 'scan', 'scan_tech'],
    availableLabel: 'services here',
    unavailableLabel: 'limited services',
    unavailableHint: 'Fuel, repair, toll, and scan services vary by station.',
  },
};

const DEPARTURE_SCREEN_LABELS = {
  missionLog: 'Mission Log',
};

const STATION_TYPE_PURPOSE = {
  trade_hub: 'Trade hubs are the safest place to compare prices, find legal cargo, and turn credits into better hulls.',
  refinery: 'Refineries want ore and gas, then turn raw mining runs into refined materials for manufacturing.',
  mining: 'Mining outposts sell field supplies and point you toward asteroid work, bulk contracts, and ore buyers.',
  fab: 'Fabricators consume refined goods and components; bring materials here when you want modules or new hull options.',
  military: 'Military stations favor repair, refuel, combat contracts, and restricted goods tied to faction standing.',
  blackmarket: 'Black markets pay for risky cargo and covert work, but their goods and contracts can attract trouble.',
  research: 'Research stations value scans, exotic materials, and tech-linked opportunities.',
};


/** Invariant Station OS root classes — must survive every onShow / _resolveStation. */
export const STATION_HUB_ROOT_BASE_CLASSES = Object.freeze([
  'st-hub',
  'st-hub--desk',
  'st-hub--os',
  'panel',
]);

/** Closed set of exclusive station-type root modifiers (`st-hub--{type}`). */
export const STATION_HUB_TYPE_CLASSES = Object.freeze(
  Object.keys(STATION_TYPE_PURPOSE).map((t) => `st-hub--${t}`),
);

/**
 * Apply hub root class invariants + exclusive station-type modifier.
 * Uses classList only — never wholesale className assignment — so concurrent
 * modifiers (`st-hub--engineering`, `trace-active`) survive repeated resolve/show.
 *
 * @param {Element|{classList: DOMTokenList}} el hub root element
 * @param {string|null|undefined} stationType e.g. 'trade_hub', 'military'
 * @returns {Element|{classList: DOMTokenList}|null}
 */
export function applyStationHubRootClasses(el, stationType) {
  if (!el || !el.classList) return el || null;
  for (const c of STATION_HUB_ROOT_BASE_CLASSES) el.classList.add(c);
  // Exclusive type swap from a closed allowlist — never strip desk/os/engineering.
  for (const c of STATION_HUB_TYPE_CLASSES) el.classList.remove(c);
  const typeClass = stationType ? `st-hub--${stationType}` : null;
  if (typeClass && STATION_HUB_TYPE_CLASSES.includes(typeClass)) el.classList.add(typeClass);
  return el;
}

function stationTypeLabel(type) {
  if (!type) return 'Station';
  return titleCaseWords(type);
}

function titleCaseWords(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function tabLabel(tabId) {
  if (tabId === 'hold') return 'HOLD';
  const tab = TABS.find((t) => t.id === tabId);
  return (tab && tab.label) || titleCaseWords(tabId);
}

export function stationTabServiceStatus(tabId, stn) {
  if (tabId === 'hold') {
    return {
      state: 'available',
      offered: true,
      label: 'manifest',
      title: 'HOLD: View cargo hold manifest. ' + tabPurpose(tabId),
    };
  }
  const rule = TAB_SERVICE_RULES[tabId];
  const label = tabLabel(tabId);
  if (!rule) {
    return {
      state: 'neutral',
      offered: true,
      label: 'station-wide',
      title: label + ': station-wide information. ' + tabPurpose(tabId),
    };
  }
  const services = (stn && Array.isArray(stn.services)) ? stn.services : [];
  if (!services.length) {
    return {
      state: 'unknown',
      offered: true,
      label: 'check services',
      title: label + ': service list unknown. ' + tabPurpose(tabId),
    };
  }
  const offered = rule.any.some((service) => services.includes(service));
  if (offered) {
    return {
      state: 'available',
      offered: true,
      label: rule.availableLabel,
      title: label + ': ' + rule.availableLabel + '. ' + tabPurpose(tabId),
    };
  }
  return {
    state: 'unavailable',
    offered: false,
    label: rule.unavailableLabel,
    title: label + ': ' + rule.unavailableLabel + ' at ' + ((stn && stn.name) || 'this station') + '. ' + rule.unavailableHint,
  };
}

function getManager(ctx) {
  if (ctx && ctx.screenManager) return ctx.screenManager;
  if (ctx && ctx.screens && ctx.screens.pushScreen) return ctx.screens;
  const ui = ctx && ctx.registry && ctx.registry.get && ctx.registry.get('ui');
  if (ui && ui.screenManager) return ui.screenManager;
  if (ui && ui.manager) return ui.manager;
  return null;
}

function pushDepartureScreen(ctx, screenId) {
  if (!screenId || !Object.prototype.hasOwnProperty.call(DEPARTURE_SCREEN_LABELS, screenId)) return false;
  const mgr = getManager(ctx);
  if (mgr && typeof mgr.pushScreen === 'function') {
    mgr.pushScreen(screenId);
    return true;
  }
  if (ctx && ctx.bus && typeof ctx.bus.emit === 'function') {
    ctx.bus.emit('ui:pushScreen', { id: screenId });
    return true;
  }
  return false;
}

function stationPurpose(stn) {
  const type = stn && stn.type;
  return STATION_TYPE_PURPOSE[type] || 'Dock here to trade, repair, find work, and prepare the ship for the next flight.';
}

function stationServiceSummary(stn) {
  const services = (stn && Array.isArray(stn.services)) ? stn.services : [];
  if (!services.length) return 'Available actions depend on this station type and your standing.';
  return 'Available here: ' + services.map(stationServiceLabel).join(', ') + '.';
}

function stationRecordId(stn) {
  if (!stn) return null;
  if (typeof stn.stationId === 'string' && stn.stationId) return stn.stationId;
  return (typeof stn.id === 'string' && stn.id) ? stn.id : null;
}

function liveStationEntity(state, stationId) {
  for (const e of ((state && state.entityList) || [])) {
    if (e && e.type === 'station' && e.data && e.data.stationId === stationId) return e;
  }
  return null;
}

function stationDefFrom(record, entity, stationId) {
  if (!record && !entity) return null;
  const data = (entity && entity.data) || {};
  return {
    ...(record || {}),
    id: stationId || stationRecordId(record) || data.stationId || null,
    name: (record && record.name) || data.name || data.stationName || data.stationId || stationId || 'Station',
    type: (record && (record.type || record.stationTypeId)) || data.stationTypeId || data.type || '',
    size: (record && record.size) || data.size || 'M',
    services: (record && record.services) || data.services || [],
    factionId: (record && record.factionId) || data.factionId || (entity && entity.factionId) || null,
  };
}

function tabPurpose(tabId) {
  if (tabId === 'hold') return 'View cargo hold manifest, capacity, and item values.';
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
  if (!chip) return '';
  if (chip.targetScreen) {
    const screenLabel = DEPARTURE_SCREEN_LABELS[chip.targetScreen] || 'screen';
    return chip.actionLabel || ('Open ' + screenLabel);
  }
  if (!chip.targetTab) return '';
  const tab = TABS.find((t) => t.id === chip.targetTab);
  const tabLabel = tab ? tab.label : 'station tab';
  return chip.actionLabel || ('Open ' + tabLabel);
}

function departureChipHtml(chip) {
  let icon = '●';
  const l = (chip.label || '').toLowerCase();
  if (l.includes('nav') || l.includes('obj') || l.includes('mission')) icon = '◆';
  else if (l.includes('hold') || l.includes('cargo') || l.includes('mass')) icon = '■';

  const cls = 'st-departure-chip st-departure-chip--' + chip.kind;
  const body =
    '<b>' + escapeHtml(chip.label) + '</b>' +
    '<span>' + icon + ' ' + escapeHtml(chip.text) + '</span>';

  const targetAttr = chip.targetScreen
    ? ' data-departure-screen="' + escapeHtml(chip.targetScreen) + '"'
    : (chip.targetTab ? ' data-departure-tab="' + escapeHtml(chip.targetTab) + '"' : '');
  if (!targetAttr) return '<span class="' + cls + '">' + body + '</span>';
  const title = departureChipActionTitle(chip);
  return '<button type="button" class="' + cls + '"' + targetAttr +
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
  const activeJobs = active.filter((m) => m && (m.status == null || m.status === 'active'));
  const tracked = trackedId ? active.find((m) => missionId(m) === trackedId) : null;
  if (tracked) {
    return {
      kind: 'ok',
      label: 'Track',
      text: clipDepartureText(tracked.title || prettyType(tracked.type)),
      targetScreen: 'missionLog',
      actionLabel: 'Open Mission Log to review tracked job',
    };
  }
  if (activeJobs.length > 0) {
    const one = activeJobs.length === 1;
    return {
      kind: 'warn',
      label: 'Track',
      text: one ? '1 untracked job' : activeJobs.length + ' untracked jobs',
      targetScreen: 'missionLog',
      actionLabel: one ? 'Open Mission Log to track the active job' : 'Open Mission Log to pick a tracked job',
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
      targetScreen: 'missionLog',
      actionLabel: 'Open Mission Log to review objectives',
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

export function departureReadinessSummary(chips) {
  const list = Array.isArray(chips) ? chips.filter(Boolean) : [];
  const issues = list.filter((chip) => chip.kind === 'bad' || chip.kind === 'warn');
  const hasBad = issues.some((chip) => chip.kind === 'bad');
  const hasWarn = issues.some((chip) => chip.kind === 'warn');
  const state = hasBad ? 'risk' : (hasWarn ? 'check' : 'ready');
  const status = hasBad ? 'RISK' : (hasWarn ? 'CHECK' : 'READY');
  const issueText = issues
    .map((chip) => (String(chip.label || 'Check') + ': ' + String(chip.text || '')).trim())
    .filter((text) => text.length > 2)
    .join('; ');
  const title = issueText
    ? 'Departure Check: ' + status + '. ' + issueText + '. Undock remains available.'
    : 'Departure Check: READY. Tracked work, cargo, fuel, and hull look serviceable.';
  return {
    state,
    status,
    label: '⏏ UNDOCK · ' + status,
    title,
    accessibleLabel: 'Undock. ' + title,
  };
}

function activeMissionCount(state) {
  const active = state && state.missions && Array.isArray(state.missions.active) ? state.missions.active : [];
  return active.filter((m) => m && (m.status == null || m.status === 'active')).length;
}

function cargoUsedUnits(state) {
  const cargo = state && state.player && state.player.cargo || {};
  const used = Number(cargo.usedVolume);
  if (Number.isFinite(used) && used > 0) return used;
  const items = cargo.items || {};
  return Object.values(items).reduce((sum, qty) => sum + Math.max(0, Number(qty) || 0), 0);
}

function firstDockStoryIndex(state) {
  const story = state && state.story || {};
  const raw = story.beatIndex != null ? story.beatIndex :
    (story.currentBeatIndex != null ? story.currentBeatIndex : story.beat);
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function firstDockHandoffVisible(state, stationId) {
  if (!state || !stationId) return false;
  const ob = state.onboarding || null;
  const beatDoneAt = ob && ob.beatDoneAt || {};
  const storyIndex = firstDockStoryIndex(state);
  const firstLoopOpen = !!ob && ob.active === true && ob.finished !== true;
  const earlyStory = storyIndex != null && storyIndex <= 1;
  if (ob && (ob.finished === true || beatDoneAt.choice != null)) return false;
  if (!firstLoopOpen && !earlyStory) return false;
  if (activeMissionCount(state) > 0 && beatDoneAt.dock != null) return false;
  return true;
}

function firstDockDepartureTarget(chips) {
  const issue = (Array.isArray(chips) ? chips : []).find((chip) => chip && (chip.kind === 'bad' || chip.kind === 'warn'));
  if (issue && issue.targetTab) return issue.targetTab;
  return 'services';
}

export function firstDockHandoffSteps(state = {}) {
  const ob = state.onboarding || {};
  const beatDoneAt = ob.beatDoneAt || {};
  const activeJobs = activeMissionCount(state);
  const missionDone = activeJobs > 0 || beatDoneAt.choice != null || ob.finished === true;
  const departureChips = departureReadinessChips(state);
  const departure = departureReadinessSummary(departureChips);
  const marketDone = beatDoneAt.dock != null;
  const hasCargo = cargoUsedUnits(state) > 0;
  // Verbs that match what the button does (open Hold to sell / Missions to accept / Services to fix).
  return [
    {
      key: 'hold',
      label: 'Cargo',
      title: marketDone
        ? 'Cargo sold — hold is ready'
        : (hasCargo ? 'Sell what you hauled' : 'Open your hold'),
      text: marketDone
        ? 'Credits banked and space free for the next run.'
        : (hasCargo
            ? 'Opens Hold. Sell 1 or Sell all at the station price, then free capacity for new cargo.'
            : 'Opens Hold / Market. Nothing to sell yet — check prices or undock to mine.'),
      kind: marketDone ? 'ok' : 'warn',
      done: marketDone,
      targetTab: hasCargo || marketDone ? 'hold' : 'market',
    },
    {
      key: 'missions',
      label: 'Jobs',
      title: missionDone ? 'Job on the board' : 'Take one easy job',
      text: missionDone
        ? (activeJobs === 1
            ? 'Opens Missions. One active job — Accept+Track already feeds nav.'
            : 'Opens Missions. ' + activeJobs + ' jobs active; track the one you want next.')
        : 'Opens Missions. Accept a nearby low-risk contract; Track puts the route on your nav.',
      kind: missionDone ? 'ok' : 'warn',
      done: missionDone,
      targetTab: 'missions',
    },
    {
      key: 'departure',
      label: 'Launch',
      title: departure.state === 'ready' ? 'Safe to undock' : 'Fix launch risks',
      text: departure.state === 'ready'
        ? 'Opens Services / Departure. Fuel, hull, and tracked work look good — undock when ready.'
        : 'Opens ' + tabLabel(firstDockDepartureTarget(departureChips))
          + '. ' + departure.status + ' — repair, refuel, or resolve the red departure chip before undock.',
      kind: departure.state === 'risk' ? 'bad' : (departure.state === 'check' ? 'warn' : 'ok'),
      done: departure.state === 'ready' && missionDone,
      targetTab: firstDockDepartureTarget(departureChips),
    },
  ];
}

function handoffStepHtml(step) {
  const done = step.done ? ' is-done' : '';
  const cls = 'st-handoff-step st-handoff-step--' + step.kind + done;
  const body =
    '<span class="st-handoff-step-label mono">' + escapeHtml(step.label) + '</span>' +
    '<span class="st-handoff-step-title">' + escapeHtml(step.title) + '</span>' +
    '<span class="st-handoff-step-copy">' + escapeHtml(step.text) + '</span>';
  if (!step.targetTab) return '<span class="' + cls + '">' + body + '</span>';
  return '<button type="button" class="' + cls + '" data-handoff-tab="' + escapeHtml(step.targetTab) + '"' +
    ' title="' + escapeHtml('Open ' + tabLabel(step.targetTab) + ': ' + step.title) + '"' +
    ' aria-label="' + escapeHtml('Open ' + tabLabel(step.targetTab) + ': ' + step.title + '. ' + step.text) + '">' +
    body +
    '</button>';
}

export function missionBoardReadiness(preflight = {}) {
  if (preflight.blocker) {
    return {
      state: 'blocked',
      kind: 'bad',
      label: 'BLOCKED',
      title: preflight.blocker,
    };
  }
  if (preflight.warning) {
    return {
      state: 'caution',
      kind: 'warn',
      label: 'CHECK',
      title: preflight.warning,
    };
  }
  return {
    state: 'ready',
    kind: 'ok',
    label: 'READY',
    title: 'Ready to accept, auto-track, and add to Mission Log.',
  };
}

function missionOfferId(m) {
  return m && (m.id != null ? m.id : m.missionId);
}

function missionRiskTier(m) {
  const raw = m && (m.riskTier != null ? m.riskTier : (m.risk != null ? m.risk : 0));
  const risk = Number(raw);
  return Number.isFinite(risk) ? Math.max(0, Math.round(risk)) : 0;
}

function firstLoopNeedsSafeWork(state) {
  const ob = state && state.onboarding;
  if (!ob || ob.finished === true) return false;
  const beatDoneAt = ob.beatDoneAt || {};
  return beatDoneAt.choice == null && activeMissionCount(state) === 0;
}

function missionRiskCopy(riskValue) {
  const risk = Math.max(0, Math.round(Number(riskValue) || 0));
  const band = risk >= 4 ? 'severe'
    : risk >= 3 ? 'high'
      : risk >= 2 ? 'elevated'
        : risk >= 1 ? 'moderate'
          : 'low';
  const prep = risk >= 3
    ? 'review hull, fuel, and escape route before accepting'
    : risk >= 2
      ? 'review route and ship readiness before accepting'
      : 'routine work for a prepared ship';
  return 'Risk ' + risk + ': ' + band + ' threat; ' + prep + '.';
}

function missionRecommendationReason(m, preflight, readiness, consequences) {
  const risk = missionRiskTier(m);
  const reward = consequences && consequences.reward > 0
    ? '+' + consequences.reward.toLocaleString('en-US') + ' cr'
    : 'contract payout';
  const routeChip = (preflight.chips || []).find((chip) =>
    chip && (chip.text === 'Local sector' || /^Jump route: /.test(chip.text) || /^Route: /.test(chip.text))
  );
  const route = routeChip ? routeChip.text : missionDestName(m || {});
  if (readiness.state === 'blocked') {
    return 'Prep first: ' + (preflight.blocker || readiness.title || 'clear the blocker') + '.';
  }
  if (readiness.state === 'caution') {
    return 'Strong pick after one check: ' + (preflight.warning || readiness.title || 'review readiness') +
      '. ' + reward + ', Risk ' + risk + ', ' + route + '.';
  }
  return 'Best board pick: ready now, ' + reward + ', Risk ' + risk + ', ' + route + '.';
}

/**
 * Keyboard activation for focusable mission cards (role=button).
 * Enter/Space on the card itself select it — same path as a body click.
 * Nested native action controls (Accept etc.) must not re-trigger card selection.
 * Returns { missionId } when the key should activate selection; null otherwise.
 */
export function resolveMissionCardKeyboardSelection(ev) {
  if (!ev || (ev.key !== 'Enter' && ev.key !== ' ')) return null;
  const target = ev.target;
  if (!target || typeof target.closest !== 'function') return null;
  const card = target.closest('.st-mission-card');
  // Nested buttons/inputs own their own activation; do not also select the card.
  if (!card || target !== card) return null;
  const mid = card.getAttribute('data-mid');
  if (mid == null || mid === '') return null;
  return { missionId: String(mid) };
}

export function recommendMissionBoardOffer(slots = [], state = {}) {
  const firstLoopSafeWork = firstLoopNeedsSafeWork(state);
  let candidates = (Array.isArray(slots) ? slots : [])
    .map((mission, index) => {
      if (!mission) return null;
      const id = missionOfferId(mission);
      if (id == null || id === '') return null;
      const preflight = missionPreflight(mission, state);
      const readiness = missionBoardReadiness(preflight);
      const consequences = missionConsequenceSummary(mission);
      const risk = missionRiskTier(mission);
      const collateral = consequences.collateral || 0;
      const reward = consequences.reward || 0;
      const readinessScore = readiness.state === 'ready' ? 10000 : (readiness.state === 'caution' ? 6500 : 1000);
      const score = readinessScore +
        Math.min(2200, reward / 8) -
        risk * 350 -
        Math.min(1600, collateral / 15) -
        (preflight.warning ? 250 : 0);
      return { mission, missionId: id, index, preflight, readiness, consequences, risk, score };
    })
    .filter(Boolean);
  if (firstLoopSafeWork) {
    const safeReady = candidates.filter((c) => c.risk <= 1 && c.readiness.state !== 'blocked');
    if (safeReady.length) candidates = safeReady;
  }
  candidates.sort((a, b) => (b.score - a.score) || (a.risk - b.risk) || (a.index - b.index));

  const best = candidates[0];
  if (!best) return null;
  const firstLoopRiskBlocked = firstLoopSafeWork && best.risk >= 2;
  const blocked = best.readiness.state === 'blocked' || firstLoopRiskBlocked;
  const reason = firstLoopRiskBlocked
    ? 'Prep first: take a Risk 0-1 contract before elevated work. Risk ' + best.risk + ' stays on the board.'
    : missionRecommendationReason(best.mission, best.preflight, best.readiness, best.consequences);
  return {
    mission: best.mission,
    missionId: best.missionId,
    kind: firstLoopRiskBlocked ? 'warn' : best.readiness.kind,
    state: firstLoopRiskBlocked ? 'blocked' : best.readiness.state,
    label: blocked ? 'PREP FIRST' : (best.readiness.state === 'caution' ? 'RECOMMENDED - CHECK' : 'RECOMMENDED'),
    title: best.mission.title || prettyType(best.mission.type),
    reason,
    actionLabel: blocked ? 'Resolve Prep' : 'Accept Recommended',
    disabled: blocked,
  };
}

/** Always refresh station CSS so layout reboots land without a full module cache mystery. */
function injectCss() {
  if (typeof document === 'undefined') return;
  let style = document.getElementById('ui-station-styles');
  if (!style) {
    style = document.createElement('style');
    style.id = 'ui-station-styles';
    document.head.appendChild(style);
  }
  style.textContent = STATION_CSS;
}

const STATION_RISKS = {
  trade_hub: 'Low risk. Customs scans are active but predictable. High security presence.',
  refinery: 'Industrial hazard zone. Toxic exhausts, heavy transport lanes, and high cargo shipping traffic.',
  mining: 'Navigational warning. Uncharted debris, drifting rocks, and active scavenger groups nearby.',
  fab: 'Industrial workspace. Automated construction frames and heavy logistics tug traffic.',
  military: 'Combat operations alert. High-intensity security scans and active perimeter defense grids.',
  blackmarket: 'Hostile environment. Unregulated flight paths, frequent local raids, and no security response.',
  research: 'Anomalous telemetry zone. Sensor wash warnings, local radiation leaks, and scientific testing hazard fields.',
};

function tabForService(svc) {
  if (svc === 'trade' || svc === 'black_market') return 'market';
  if (svc === 'shipyard') return 'shipyard';
  if (svc === 'module_craft' || svc === 'refine') return 'manufacture';
  if (svc === 'missions') return 'missions';
  if (['refuel', 'repair', 'toll', 'scan', 'scan_tech'].includes(svc)) return 'services';
  return 'services';
}

export function stationServiceLabel(svc) {
  return SERVICE_LABELS[svc] || titleCaseWords(svc);
}

const SERVICE_DESC = {
  refuel: 'Top off reactor fuel so the next jump route stays in range.',
  repair: 'Restore hull and armor before undocking into hostile lanes.',
  trade: 'Buy and sell cargo; compare prices and set profitable routes.',
  ore_buy: 'Sell raw mined ore to the station ore buyer.',
  refine: 'Refine raw ore and gas into materials for manufacturing.',
  module_craft: 'Fabricate modules, upgrades, and hulls from materials.',
  shipyard: 'Buy hulls to change cargo, survivability, and slot layout.',
  missions: 'Accept contracts that auto-track and set nav guidance.',
  toll: 'Pay the customs toll levied on cargo passing through.',
  scan: 'Station security scan of your manifest for contraband.',
  black_market: 'Move restricted cargo and take covert contracts.',
  scan_tech: 'Buy survey data and frontier charts from the survey lab.',
};

function berthServiceDesc(svc) {
  return SERVICE_DESC[svc] || tabPurpose(tabForService(svc));
}

/** Readiness badge for a Service Dock node: OFFLINE if not offered here; live fuel/hull % for
 *  refuel/repair; ONLINE otherwise. state maps to the dockRail badge colour (good/warn/danger). */
function berthServiceReadiness(svc, offered, state) {
  if (!offered) return { state: 'danger', label: 'OFFLINE' };
  if (svc === 'refuel') {
    const fuel = (state && state.fuel) || {};
    const frac = clamp01(Number(fuel.current) / Number(fuel.max), 1);
    return { state: frac < 0.25 ? 'danger' : (frac < 0.5 ? 'warn' : 'good'), label: fmtPercent(frac) };
  }
  if (svc === 'repair') {
    const ship = playerEntity(state);
    const frac = ship && ship.hullMax > 0 ? clamp01((ship.hull || 0) / ship.hullMax, 1) : 1;
    return { state: frac < 0.35 ? 'danger' : (frac < 0.7 ? 'warn' : 'good'), label: fmtPercent(frac) };
  }
  return { state: 'good', label: 'ONLINE' };
}

/** The authored sector a station id belongs to (static catalog scan; deterministic). */
function stationSectorId(stationId) {
  for (const sec of SECTORS) {
    if ((sec.stations || []).some((s) => s.id === stationId)) return sec.id;
  }
  return null;
}

/** Nearest station that offers `svc`, preferring the same sector, then a neighbour, then anywhere.
 *  Returns { name, sector } or null. Used for the inspector's "route to nearest service" hint. */
function nearestStationOffering(svc, fromStationId) {
  const homeSectorId = stationSectorId(fromStationId);
  const home = homeSectorId ? SECTOR_BY_ID.get(homeSectorId) : null;
  const neighbors = new Set((home && home.neighbors) || []);
  let sameSector = null;
  let neighbour = null;
  let anywhere = null;
  for (const sec of SECTORS) {
    for (const s of (sec.stations || [])) {
      if (s.id === fromStationId) continue;
      if (!Array.isArray(s.services) || !s.services.includes(svc)) continue;
      const rec = { name: s.name, sector: sec.name };
      if (sec.id === homeSectorId) sameSector = sameSector || rec;
      else if (neighbors.has(sec.id)) neighbour = neighbour || rec;
      else anywhere = anywhere || rec;
    }
  }
  return sameSector || neighbour || anywhere || null;
}

function stationSchematicSvg(type) {
  const norm = String(type || '').trim().toLowerCase();

  let paths = '';
  if (norm === 'military') {
    paths = `
      <circle cx="50" cy="50" r="14" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <circle cx="50" cy="50" r="6" fill="none" stroke="var(--st-accent)" stroke-width="1.2" />
      <path d="M 50 10 L 50 90 M 10 50 L 90 50 M 20 20 L 80 80 M 20 80 L 80 20" fill="none" stroke="var(--st-accent)" stroke-width="0.8" stroke-dasharray="2, 2" />
      <polygon points="50,5 55,20 80,20 65,35 75,60 50,45 25,60 35,35 20,20 45,20" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
    `;
  } else if (norm === 'refinery') {
    paths = `
      <rect x="25" y="40" width="16" height="45" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <rect x="45" y="30" width="20" height="55" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <rect x="70" y="50" width="12" height="35" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <path d="M 33 40 L 33 22 L 38 22 M 55 30 L 55 12 L 60 12 M 76 50 L 76 32 L 81 32" fill="none" stroke="var(--st-accent)" stroke-width="1" />
      <path d="M 15 85 L 85 85" stroke="var(--st-accent)" stroke-width="2" />
    `;
  } else if (norm === 'mining') {
    paths = `
      <path d="M 30 20 Q 15 35 20 60 Q 25 85 50 80 Q 75 75 80 50 Q 85 25 60 20 Z" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <circle cx="45" cy="40" r="4" fill="none" stroke="var(--st-accent)" stroke-width="1" />
      <circle cx="65" cy="55" r="6" fill="none" stroke="var(--st-accent)" stroke-width="1" />
      <path d="M 50 80 L 50 95 M 50 95 L 65 95" fill="none" stroke="var(--st-accent)" stroke-width="1.2" stroke-dasharray="2, 2" />
    `;
  } else if (norm === 'fab') {
    paths = `
      <polygon points="50,12 85,32 85,72 50,92 15,72 15,32" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <line x1="50" y1="12" x2="50" y2="92" stroke="var(--st-accent)" stroke-width="1.2" />
      <line x1="15" y1="32" x2="50" y2="52" stroke="var(--st-accent)" stroke-width="1" />
      <line x1="85" y1="32" x2="50" y2="52" stroke="var(--st-accent)" stroke-width="1" />
      <circle cx="50" cy="52" r="8" fill="none" stroke="var(--st-accent)" stroke-width="1.2" />
    `;
  } else if (norm === 'blackmarket') {
    paths = `
      <circle cx="35" cy="35" r="14" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <circle cx="65" cy="42" r="9" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <circle cx="48" cy="68" r="11" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <line x1="35" y1="35" x2="65" y2="42" stroke="var(--st-accent)" stroke-width="1" stroke-dasharray="2, 2" />
      <line x1="65" y1="42" x2="48" y2="68" stroke="var(--st-accent)" stroke-width="1" stroke-dasharray="2, 2" />
      <line x1="35" y1="35" x2="48" y2="68" stroke="var(--st-accent)" stroke-width="1" stroke-dasharray="2, 2" />
    `;
  } else if (norm === 'research') {
    paths = `
      <circle cx="50" cy="50" r="32" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <circle cx="50" cy="50" r="18" fill="none" stroke="var(--st-accent)" stroke-width="1" stroke-dasharray="3, 3" />
      <path d="M 50 10 L 50 90 M 10 50 L 90 50" stroke="var(--st-accent)" stroke-width="0.8" />
      <path d="M 30 30 Q 50 5 70 30" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
    `;
  } else {
    paths = `
      <circle cx="50" cy="50" r="35" fill="none" stroke="var(--st-accent)" stroke-width="1.8" />
      <circle cx="50" cy="50" r="22" fill="none" stroke="var(--st-accent)" stroke-width="1.2" stroke-dasharray="4, 3" />
      <circle cx="50" cy="50" r="8" fill="none" stroke="var(--st-accent)" stroke-width="1.5" />
      <line x1="50" y1="15" x2="50" y2="85" stroke="var(--st-accent)" stroke-width="1" />
      <line x1="15" y1="50" x2="85" y2="50" stroke="var(--st-accent)" stroke-width="1" />
    `;
  }

  return `
    <svg viewBox="0 0 100 100" width="120" height="120" style="display:block; margin: 0 auto;">
      ${paths}
    </svg>
  `;
}

export const stationHub = {
  id: 'station',
  data: { autoFocus: false },
  _ctx: null,
  _panels: null,        // { market, shipyard, outfit, services, factions, bar } panel objects
  _missionEls: null,
  _stationId: null,
  _subbed: false,
  _busyEl: null,
  _originRailEl: null,
  _originSelectedId: null,
  _ladderRailEl: null,
  _ladderSelectedId: null,
  _ladderModel: null,
  _activeRefreshJob: null,
  _activeRefreshRaf: 0,
  _activeRefreshTimer: 0,
  _undockChargeTimer: null,
  _exitInFlight: false,
  _setInspectorOpen: null,

  /** Build the screen DOM once and cache it. Called by uiRoot/screenManager. */
  mount(rootEl, ctx) {
    this._ctx = ctx;
    installStationExitGate(ctx);
    setStationExitOwner(this);
    injectCss();

    const screen = document.createElement('div');
    // Station OS: full-viewport tool shell (see design/STATION_SHELL_CONTRACT.md).
    screen.className = 'st-hub st-hub--desk st-hub--os panel';
    screen.setAttribute('data-station-os', '1');

    // Top strip only: name · credits · cargo · Briefing (Meta) · Undock (Meta)
    const topbar = document.createElement('div');
    topbar.className = 'st-topbar';
    topbar.innerHTML =
      '<div class="st-topbar-l">' +
        '<span class="st-station-name">Station</span>' +
        '<span class="st-station-fac mono"></span>' +
      '</div>' +
      '<div class="st-topbar-m">' +
        '<span class="st-top-stat"><span class="st-top-stat-l mono">Credits</span><span class="mono st-top-credits">0</span></span>' +
        '<span class="st-top-stat"><span class="st-top-stat-l mono">Cargo</span><span class="mono st-top-cargo">0 / 0</span></span>' +
        '<span class="st-top-stat st-top-departure"><span class="st-top-stat-l mono">Launch</span><span class="mono st-readiness-summary">—</span></span>' +
      '</div>' +
      '<div class="st-topbar-r">' +
        '<button type="button" class="st-inspector-toggle st-meta-btn" aria-expanded="false" title="Open station briefing">Briefing</button>' +
        '<button type="button" class="st-undock st-meta-btn">Undock</button>' +
      '</div>';
    screen.appendChild(topbar);
    this._topCreditsEl = topbar.querySelector('.st-top-credits');
    this._topCargoEl = topbar.querySelector('.st-top-cargo');
    this._readinessSummary = topbar.querySelector('.st-readiness-summary');

    // Airlock graffiti kept for flavor but out of the layout budget (visually one line under top).
    const airlock = document.createElement('div');
    airlock.className = 'st-airlock';
    airlock.innerHTML = '<div class="st-airlock__label mono">Airlock</div><div class="st-airlock__graffiti"></div>';
    screen.appendChild(airlock);
    this._airlockEl = airlock.querySelector('.st-airlock__graffiti');

    // Body: Nav rail + full-height workspace (+ opt-in briefing drawer)
    const body = document.createElement('div');
    body.className = 'st-body';

    const rail = document.createElement('div');
    rail.className = 'st-rail';
    rail.setAttribute('role', 'tablist');
    rail.setAttribute('aria-label', 'Station sections');

    const workspaceWrapper = document.createElement('div');
    workspaceWrapper.className = 'st-workspace-wrapper';

    const centerStage = document.createElement('div');
    centerStage.className = 'st-center-stage';

    const factionStripe = document.createElement('div');
    factionStripe.className = 'st-faction-stripe';
    centerStage.appendChild(factionStripe);

    // Hidden effect mounts only (no layout). Keeps command-deck effect factories parkable.
    // NOT a permanent service dock / bullseye — Services tool owns verbs.
    const consoleConsole = document.createElement('div');
    consoleConsole.className = 'st-console-deck st-console-deck--effects-only';
    consoleConsole.setAttribute('aria-hidden', 'true');
    consoleConsole.innerHTML = `
      <div class="st-schematic-pane" hidden>
        <div class="st-fx-scan" aria-hidden="true"></div>
        <div class="st-schematic-art"></div>
      </div>
      <div class="st-service-nodes-pane" hidden></div>
      <div class="st-fx-overlay" aria-hidden="true"></div>
    `;
    centerStage.appendChild(consoleConsole);
    this._schematicPane = consoleConsole.querySelector('.st-schematic-art');
    this._nodesPane = consoleConsole.querySelector('.st-service-nodes-pane');
    this._scanLayer = consoleConsole.querySelector('.st-fx-scan');
    this._fxOverlay = consoleConsole.querySelector('.st-fx-overlay');

    // Morph mount for status (parked; one-line only when needed via top strip readiness).
    const statusRow = document.createElement('div');
    statusRow.className = 'st-status-row st-status-row--sr';
    statusRow.innerHTML = '<div class="st-econ-badge mono"><span class="st-econ-mount"></span></div>';
    statusRow.setAttribute('aria-hidden', 'true');
    centerStage.appendChild(statusRow);
    this._econBadge = statusRow.querySelector('.st-econ-badge');
    this._econMorphMount = statusRow.querySelector('.st-econ-mount');

    // First-dock career origins: one compact, non-binding action rail. It is intentionally
    // independent of the disposable station checklist below and delegates every mutation to the
    // registered careerOrigins authority.
    const originRail = document.createElement('section');
    originRail.className = 'st-origin-rail';
    originRail.hidden = true;
    originRail.setAttribute('aria-labelledby', 'st-origin-rail-title');
    originRail.setAttribute('data-testid', 'career-origin-rail');
    originRail.innerHTML =
      '<div class="st-origin-head">' +
        '<span id="st-origin-rail-title" class="st-origin-kicker mono">Choose a first run</span>' +
        '<span class="st-origin-note">Optional. Paths never lock each other.</span>' +
      '</div>' +
      '<div class="st-origin-choices" role="group" aria-label="Career origin paths"></div>' +
      '<div class="st-origin-action">' +
        '<span class="st-origin-detail" aria-live="polite"></span>' +
        '<button type="button" class="st-origin-accept st-meta-btn" data-origin-action="accept" data-testid="career-origin-accept">Start path</button>' +
        '<button type="button" class="st-origin-decline st-meta-btn" data-origin-action="decline" data-testid="career-origin-decline">Not now</button>' +
      '</div>';
    centerStage.appendChild(originRail);
    this._originRailEl = originRail;
    this._originSelectedId = null;
    originRail.addEventListener('click', (ev) => {
      const choice = ev.target.closest('[data-origin-career]');
      if (choice && originRail.contains(choice)) {
        this._originSelectedId = choice.getAttribute('data-origin-career');
        this._refreshOriginRail();
        ctx.bus.emit('audio:cue', { id: 'ui_tab' });
        return;
      }
      const action = ev.target.closest('[data-origin-action]');
      if (!action || !originRail.contains(action) || !this._originSelectedId) return;
      const verb = action.getAttribute('data-origin-action');
      if (verb !== 'accept' && verb !== 'decline') return;
      ctx.bus.emit(`career:origin:${verb}`, { careerId: this._originSelectedId });
      ctx.bus.emit('audio:cue', { id: verb === 'accept' ? 'ui_accept' : 'ui_tab' });
      this._refreshOriginRail();
    });

    // Professional career ladders: compact non-binding strip adjacent to the origin rail.
    // Pure presenter model only; mutations are career:ladder:* intents (no state writes).
    // No visor/portrait chrome; no idle motion (respects html.sf-reduce-motion).
    const ladderRail = document.createElement('section');
    ladderRail.className = 'st-ladder-rail';
    ladderRail.hidden = true;
    ladderRail.setAttribute('role', 'region');
    ladderRail.setAttribute('aria-labelledby', 'st-ladder-rail-title');
    ladderRail.setAttribute('data-testid', 'career-ladder-rail');
    try {
      if (typeof document !== 'undefined'
        && document.documentElement
        && document.documentElement.classList.contains('sf-reduce-motion')) {
        ladderRail.setAttribute('data-reduce-motion', '1');
      }
    } catch (_) { /* ignore */ }
    ladderRail.innerHTML =
      '<div class="st-ladder-head">' +
        '<span id="st-ladder-rail-title" class="st-ladder-kicker mono">Professional path</span>' +
        '<span class="st-ladder-note">Optional. Paths never lock each other.</span>' +
      '</div>' +
      '<div class="st-ladder-careers" role="group" aria-label="Professional career ladders"></div>' +
      '<div class="st-ladder-panel">' +
        '<div class="st-ladder-meta">' +
          '<span class="st-ladder-detail" aria-live="polite" aria-atomic="true"></span>' +
          '<span class="st-ladder-progress mono"></span>' +
        '</div>' +
        '<p class="st-ladder-objective"></p>' +
        '<p class="st-ladder-where mono" hidden></p>' +
        '<p class="st-ladder-prereq" hidden></p>' +
        '<p class="st-ladder-fail" aria-live="polite" hidden></p>' +
        '<p class="st-ladder-receipt" aria-live="polite" hidden></p>' +
        '<div class="st-ladder-choices" role="group" aria-label="Path decisions" hidden></div>' +
        '<div class="st-ladder-actions">' +
          '<button type="button" class="st-ladder-accept st-meta-btn" data-ladder-action="accept" data-testid="career-ladder-accept">Start path</button>' +
          '<button type="button" class="st-ladder-decline st-meta-btn" data-ladder-action="decline" data-testid="career-ladder-decline">Not now</button>' +
          '<button type="button" class="st-ladder-recover st-meta-btn" data-ladder-action="recover" data-testid="career-ladder-recover">Retry</button>' +
          '<button type="button" class="st-ladder-abandon st-meta-btn" data-ladder-action="abandon" data-testid="career-ladder-abandon">Abandon</button>' +
          '<button type="button" class="st-ladder-map st-meta-btn" data-ladder-action="openMap" data-testid="career-ladder-map">Map</button>' +
          '<button type="button" class="st-ladder-log st-meta-btn" data-ladder-action="missionLog" data-testid="career-ladder-mission-log">Missions</button>' +
        '</div>' +
      '</div>';
    centerStage.appendChild(ladderRail);
    this._ladderRailEl = ladderRail;
    this._ladderSelectedId = null;
    this._ladderModel = null;
    ladderRail.addEventListener('click', (ev) => {
      this._onLadderRailClick(ev);
    });
    ladderRail.addEventListener('keydown', (ev) => {
      this._onLadderRailKeydown(ev);
    });

    // Disposable first-dock checklist (single strip, dismissible — never permanent multi-card chrome).
    const handoff = document.createElement('div');
    handoff.className = 'st-handoff';
    handoff.classList.add('st-handoff--strip');
    handoff.hidden = true;
    handoff.innerHTML =
      '<div class="st-handoff-head">' +
        '<span class="st-handoff-label mono">First dock — do these three</span>' +
        '<span class="st-handoff-copy">Sell cargo · take a job · fix fuel/hull · undock.</span>' +
        '<button type="button" class="st-handoff-dismiss st-meta-btn" data-handoff-dismiss="1" title="Dismiss checklist">Dismiss</button>' +
      '</div>' +
      '<div class="st-handoff-steps"></div>';
    centerStage.appendChild(handoff);
    this._handoffEl = handoff;
    this._handoffDismissed = false;
    handoff.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-handoff-dismiss]')) {
        this._handoffDismissed = true;
        handoff.hidden = true;
        try {
          if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('sf-station-handoff-dismissed', '1');
        } catch (_) { /* ignore */ }
        ctx.bus.emit('audio:cue', { id: 'ui_tab' });
        return;
      }
      const target = ev.target.closest('[data-handoff-tab]');
      if (!target || !this._handoffEl || !this._handoffEl.contains(target)) return;
      const tabId = target.getAttribute('data-handoff-tab');
      if (!TABS.some((t) => t.id === tabId) && tabId !== 'hold') return;
      this.setTab(tabId, { focusRail: true });
      ctx.bus.emit('audio:cue', { id: 'ui_tab' });
    });
    try {
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('sf-station-handoff-dismissed') === '1') {
        this._handoffDismissed = true;
      }
    } catch (_) { /* ignore */ }

    // Departure chips: compact one-line under handoff (not a second sidebar).
    const departure = document.createElement('div');
    departure.className = 'st-departure st-departure--compact';
    departure.innerHTML =
      '<div class="st-departure-label mono">Departure Check</div>' +
      '<div class="st-departure-chips"></div>';
    centerStage.appendChild(departure);
    this._departureEl = departure.querySelector('.st-departure-chips');
    departure.addEventListener('click', (ev) => {
      const chip = ev.target.closest('[data-departure-tab],[data-departure-screen]');
      if (!chip || !this._departureEl || !this._departureEl.contains(chip)) return;
      const screenId = chip.getAttribute('data-departure-screen');
      if (screenId) {
        if (!pushDepartureScreen(ctx, screenId)) return;
        ctx.bus.emit('audio:cue', { id: 'ui_tab' });
        return;
      }
      const tabId = chip.getAttribute('data-departure-tab');
      if (!TABS.some((t) => t.id === tabId) && tabId !== 'hold') return;
      this.setTab(tabId, { focusRail: true });
      ctx.bus.emit('audio:cue', { id: 'ui_tab' });
    });

    // Workspace = the active tool (centerpiece of Station OS).
    const content = document.createElement('div');
    content.className = 'st-content';
    // Centerpiece lives on the tool workspace (Station OS), not a decorative console deck.
    content.setAttribute('data-centerpiece', "station-service-console");
    const busy = document.createElement('div');
    busy.className = 'st-content-busy';
    busy.hidden = true;
    busy.setAttribute('role', 'status');
    busy.setAttribute('aria-live', 'polite');
    busy.innerHTML =
      '<span class="st-content-spinner" aria-hidden="true"></span>' +
      '<span class="st-content-busy-text mono">Loading tool</span>';
    content.appendChild(busy);
    this._busyEl = busy;
    centerStage.appendChild(content);

    workspaceWrapper.appendChild(centerStage);

    // Briefing drawer — Meta only, collapsed by default (no permanent essay column).
    const inspector = document.createElement('aside');
    inspector.className = 'st-inspector is-collapsed';
    inspector.setAttribute('aria-hidden', 'true');

    const inspectorHead = document.createElement('div');
    inspectorHead.className = 'st-inspector-header mono';
    inspectorHead.innerHTML = '<span>Station briefing</span><button type="button" class="st-inspector-close" aria-label="Close briefing">×</button>';
    inspector.appendChild(inspectorHead);

    const inspectorContent = document.createElement('div');
    inspectorContent.className = 'st-inspector-content';
    inspector.appendChild(inspectorContent);

    const purpose = document.createElement('div');
    purpose.className = 'st-purpose';
    purpose.innerHTML =
      '<div class="st-purpose-main"><span class="st-purpose-type mono">Station</span><span class="st-purpose-copy"></span></div>' +
      '<div class="st-purpose-sub"><span class="st-purpose-tab"></span><span class="st-purpose-services"></span></div>';
    inspector.appendChild(purpose);
    this._purposeEl = purpose;
    this._inspectorEl = inspector;

    const setInspectorOpen = (open) => {
      inspector.classList.toggle('is-collapsed', !open);
      inspector.setAttribute('aria-hidden', open ? 'false' : 'true');
      const toggle = topbar.querySelector('.st-inspector-toggle');
      if (toggle) {
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.classList.toggle('is-active', open);
      }
    };
    this._setInspectorOpen = setInspectorOpen;
    topbar.querySelector('.st-inspector-toggle').addEventListener('click', () => {
      setInspectorOpen(inspector.classList.contains('is-collapsed'));
      ctx.bus.emit('audio:cue', { id: 'ui_tab' });
    });
    inspectorHead.querySelector('.st-inspector-close').addEventListener('click', () => {
      setInspectorOpen(false);
      ctx.bus.emit('audio:cue', { id: 'ui_tab' });
    });

    workspaceWrapper.appendChild(inspector);

    // Beam layer kept for mission effects only; never layout-visible across the desk.
    const fxBeamLayer = document.createElement('div');
    fxBeamLayer.className = 'st-fx-beamlayer';
    fxBeamLayer.setAttribute('aria-hidden', 'true');
    workspaceWrapper.appendChild(fxBeamLayer);
    this._fxBeamLayer = fxBeamLayer;

    body.appendChild(rail);
    body.appendChild(workspaceWrapper);
    screen.appendChild(body);

    // Comms Side Panel
    const commsPanel = document.createElement('div');
    commsPanel.className = 'st-comms-panel';
    commsPanel.innerHTML = `
      <div class="st-comms-panel-head">
        <span>Comms Log</span>
        <button type="button" class="st-comms-panel-close" aria-label="Close comms log">CLOSE [X]</button>
      </div>
      <div class="st-comms-panel-body">
        <div class="st-comms-panel-row">No queued station traffic.</div>
      </div>
    `;
    commsPanel.id = 'st-comms-panel';
    commsPanel.setAttribute('aria-hidden', 'true');
    commsPanel.inert = true;
    screen.appendChild(commsPanel);

    const setCommsPanelOpen = (open) => {
      commsPanel.classList.toggle('open', !!open);
      commsPanel.setAttribute('aria-hidden', open ? 'false' : 'true');
      commsPanel.inert = !open;
      commsTicker.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) commsPanel.querySelector('.st-comms-panel-close').focus({ preventScroll: true });
      else commsTicker.focus({ preventScroll: true });
    };

    // Quiet, explicit control. Ambient placeholder chatter must not compete with first-dock copy.
    const commsTicker = document.createElement('button');
    commsTicker.type = 'button';
    commsTicker.className = 'st-comms-ticker';
    commsTicker.textContent = 'COMMS LOG';
    commsTicker.setAttribute('aria-controls', 'st-comms-panel');
    commsTicker.setAttribute('aria-expanded', 'false');
    commsPanel.querySelector('.st-comms-panel-close').addEventListener('click', () => {
      setCommsPanelOpen(false);
    });
    commsTicker.addEventListener('click', () => {
      setCommsPanelOpen(!commsPanel.classList.contains('open'));
    });
    screen.appendChild(commsTicker);

    // build rail buttons (one delegated listener, dynamically inject HOLD tab button next to MARKET)
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
      b.setAttribute('aria-label', t.label + ': ' + t.help);
      // Nav only — full tool names, no status essays on the rail (Station Shell Contract §2–3).
      b.innerHTML =
        '<span class="st-tab-icon sf-glyph" aria-hidden="true">' + (glyphSvg(t.id) || t.icon) + '</span>' +
        '<span class="st-tab-label">' + t.label + '</span>';
      railFrag.appendChild(b);

      if (t.id === 'market') {
        const holdBtn = document.createElement('button');
        holdBtn.className = 'st-tab';
        holdBtn.type = 'button';
        holdBtn.id = 'st-tab-hold';
        holdBtn.setAttribute('data-tab', 'hold');
        holdBtn.setAttribute('role', 'tab');
        holdBtn.setAttribute('aria-controls', 'st-panel-hold');
        holdBtn.setAttribute('aria-selected', 'false');
        holdBtn.setAttribute('tabindex', '-1');
        holdBtn.title = 'Cargo hold: sell cargo at station prices.';
        holdBtn.setAttribute('aria-label', 'Hold: sell cargo at station prices.');
        holdBtn.innerHTML =
          '<span class="st-tab-icon sf-glyph" aria-hidden="true">' + (glyphSvg('hold') || '■') + '</span>' +
          '<span class="st-tab-label">Hold</span>';
        railFrag.appendChild(holdBtn);
      }
    }
    rail.appendChild(railFrag);
    rail.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-tab]');
      if (!b) return;
      this.setTab(b.getAttribute('data-tab'), { focusRail: true });
      ctx.bus.emit('audio:cue', { id: 'ui_tab' });
    });
    rail.addEventListener('keydown', (ev) => this._onRailKeydown(ev));

    const undockBtn = topbar.querySelector('.st-undock');
    this._undockBtn = undockBtn;
    this._undockChargeTimer = null;

    // Explicit Undock — mouse/touch hold is the deliberate commitment; keyboard/gamepad
    // activation uses the same owner (RISK confirm when not held).
    undockBtn.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || undockBtn.disabled || this._exitInFlight) return;
      undockBtn.classList.remove('abort');
      undockBtn.classList.add('charging');
      ctx.bus.emit('audio:cue', { id: 'ui_charge_start' });

      this._undockChargeTimer = setTimeout(() => {
        undockBtn.classList.remove('charging');
        this._undockChargeTimer = null;
        ctx.bus.emit('audio:cue', { id: 'ui_undock' });
        this.requestStationExit({
          intent: 'explicit',
          source: 'undock-hold',
          held: true,
          opener: undockBtn,
        });
      }, 600);
    });

    undockBtn.addEventListener('mouseup', () => {
      if (this._abortUndockCharge({ abortCue: true })) {
        undockBtn.classList.add('abort');
      }
    });

    undockBtn.addEventListener('mouseleave', () => {
      if (this._abortUndockCharge({ abortCue: false })) {
        undockBtn.classList.add('abort');
      }
    });

    // Keyboard / gamepad / synthetic activate (HTMLElement.click detail === 0)
    undockBtn.addEventListener('click', (e) => {
      if (e.detail !== 0 || undockBtn.disabled || this._exitInFlight) return;
      // If a hold is in progress, treat activate as abort rather than double-request.
      if (this._abortUndockCharge({ abortCue: true })) {
        undockBtn.classList.add('abort');
        return;
      }
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
      this.requestStationExit({
        intent: 'explicit',
        source: 'undock-activate',
        held: false,
        opener: undockBtn,
      });
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

    // inline Hold panel
    this._panels.hold = this._buildHoldPanel(content, ctx);

    this._el = screen;
    this._rail = rail;
    this._content = content;
    this._topbar = topbar;

    // Command-deck effects: create ONCE here, update-many via refresh, park on hide (frame-sleep
    // contract). Instances are inert until their verb fires (flicker until reveal(), ripple until
    // ping(), beam until setPath(), morph until set()), so building them now costs nothing at rest.
    this._selectedService = null;
    this._selectedMissionId = null;
    this._lastRevealStationId = null;
    this._lastEconKey = null;
    this._lastOpsStateKey = null;
    this._fx = {};
    try {
      this._fx.flicker = createFlickerGrid(this._scanLayer, { width: 300, height: 168, cell: 12, gap: 3, token: '--accent' });
      this._fx.ripple = createRippleField(this._fxOverlay, { width: 300, height: 200 });
      this._fx.beam = createRouteBeam(this._fxBeamLayer, { width: 760, height: 420 });
      this._fx.morph = createMorphLabel(this._econMorphMount, { numeric: false });
      this._fx.dock = createDockRail(this._nodesPane, { onSelect: (svc) => this._selectService(svc) });
      // Operations board (Missions tab) instrument effects — mounted into the create-once scaffold
      // from _buildMissionsPanel; all park with the rest of this._fx via _setEffectsActive.
      const mEls = this._missionEls;
      if (mEls) {
        this._fx.mBeam = createRouteBeam(mEls.beamMount, { width: 320, height: 96 });
        this._fx.mPing = createRippleField(mEls.pingMount, { width: 320, height: 96 });
        this._fx.mState = createMorphLabel(mEls.stateMount, { numeric: false });
        this._fx.mRisk = createCircularGauge(mEls.gRiskMount, { size: 46, stroke: 5 });
        this._fx.mFuel = createCircularGauge(mEls.gFuelMount, { size: 46, stroke: 5 });
        this._fx.mCargo = createCircularGauge(mEls.gCargoMount, { size: 46, stroke: 5 });
      }
    } catch (e) { console.error('[stationHub] effect init failed', e); }

    rootEl.appendChild(screen);

    this._subscribe();
    return screen;
  },

  _buildHoldPanel(content, ctx) {
    const el = document.createElement('div');
    el.className = 'st-tabpanel st-panel st-hold';
    el.id = 'st-panel-hold';
    el.setAttribute('role', 'tabpanel');
    el.setAttribute('aria-labelledby', 'st-tab-hold');
    el.setAttribute('tabindex', '0');
    el.style.display = 'none';

    content.appendChild(el);

    const qtyDraft = Object.create(null);

    const refresh = () => {
      const state = ctx.state;
      const cargo = state && state.player && state.player.cargo || {};
      const cap = Number(cargo.capVolume) || 40;
      const used = Number(cargo.usedVolume) || 0;
      const percent = cap > 0 ? Math.round((used / cap) * 100) : 0;
      const stationId = this._stationId || (state.ui && state.ui.dockedStationId) || null;

      let html = `
        <div class="st-tool-head">
          <div class="st-sub-h">Hold</div>
          <p class="st-hold-hint">Sell cargo at this station's pay price. Use Market to buy.</p>
        </div>
        <div class="st-hold-header">
          <div class="st-hold-meter-label mono">Storage ${used}/${cap} u (${percent}%)</div>
          <div class="st-hold-meter">
            <div class="st-hold-meter-fill" style="width: ${percent}%"></div>
          </div>
        </div>
      `;

      const items = cargo.items || {};
      const list = Object.entries(items)
        .filter(([, qty]) => Number(qty) > 0)
        .map(([id, rawQty]) => {
          const qty = Math.max(0, Math.floor(Number(rawQty) || 0));
          const unit = stationId ? holdUnitSellPrice(state, stationId, id) : null;
          return { id, qty, unit, value: unit != null ? unit * qty : 0 };
        })
        .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));

      if (list.length === 0) {
        html += `<div class="st-empty">Hold is empty. Mine, salvage, or buy goods, then sell here.</div>`;
      } else {
        html += `
          <div class="st-hold-grid">
            <div class="st-row st-row-head st-hold-row">
              <span>Commodity</span>
              <span class="c-num">Qty</span>
              <span class="c-num">Pays</span>
              <span class="c-num">Total</span>
              <span class="c-act">Sell</span>
            </div>
        `;

        for (const row of list) {
          const com = COMMODITY_BY_ID.get(row.id) || { name: prettyId(row.id) };
          const priceText = row.unit != null ? (row.unit.toLocaleString() + ' cr') : '—';
          const totalText = row.unit != null ? (row.value.toLocaleString() + ' cr') : '—';
          const draft = Math.min(row.qty, Math.max(1, Number(qtyDraft[row.id]) || row.qty));
          qtyDraft[row.id] = draft;

          html += `
            <div class="st-row st-hold-row" data-hold-row="${row.id}">
              <span class="st-hold-name">${escapeHtml(com.name || prettyId(row.id))}</span>
              <span class="c-num mono">${row.qty}</span>
              <span class="c-num mono">${priceText}</span>
              <span class="c-num mono">${totalText}</span>
              <span class="c-act st-hold-actions">
                <span class="st-qty-param" data-cmdty="${row.id}">
                  <button type="button" class="st-qty-btn" data-qty-delta="-1" aria-label="Decrease quantity">−</button>
                  <input class="st-qty-input mono" type="number" min="1" max="${row.qty}" value="${draft}" data-qty-input="1" aria-label="Sell quantity" />
                  <button type="button" class="st-qty-btn" data-qty-delta="1" aria-label="Increase quantity">+</button>
                </span>
                <button type="button" class="st-sell-btn st-verb-btn" data-sell-cmdty="${row.id}" data-sell-mode="draft">Sell</button>
                <button type="button" class="st-sell-btn st-sell-btn--all st-verb-btn" data-sell-cmdty="${row.id}" data-sell-qty="${row.qty}">Sell all</button>
              </span>
            </div>
          `;
        }

        html += `</div>`;
      }

      el.innerHTML = html;

      el.querySelectorAll('[data-qty-delta]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const wrap = btn.closest('[data-cmdty]');
          const id = wrap && wrap.getAttribute('data-cmdty');
          const input = wrap && wrap.querySelector('[data-qty-input]');
          if (!id || !input) return;
          const max = Math.max(1, Math.floor(Number(input.getAttribute('max')) || 1));
          let v = Math.floor(Number(input.value) || 1) + Number(btn.getAttribute('data-qty-delta') || 0);
          v = Math.max(1, Math.min(max, v));
          input.value = String(v);
          qtyDraft[id] = v;
        });
      });
      el.querySelectorAll('[data-qty-input]').forEach((input) => {
        input.addEventListener('change', () => {
          const wrap = input.closest('[data-cmdty]');
          const id = wrap && wrap.getAttribute('data-cmdty');
          if (!id) return;
          const max = Math.max(1, Math.floor(Number(input.getAttribute('max')) || 1));
          let v = Math.floor(Number(input.value) || 1);
          v = Math.max(1, Math.min(max, v));
          input.value = String(v);
          qtyDraft[id] = v;
        });
      });

      el.querySelectorAll('[data-sell-cmdty]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const cmdtyId = btn.getAttribute('data-sell-cmdty');
          let qty;
          if (btn.getAttribute('data-sell-mode') === 'draft') {
            qty = Math.max(1, Math.floor(Number(qtyDraft[cmdtyId]) || 1));
          } else {
            qty = Math.max(1, Math.floor(Number(btn.getAttribute('data-sell-qty')) || 1));
          }
          ctx.bus.emit('ui:sell', { commodityId: cmdtyId, qty });
          ctx.bus.emit('audio:cue', { id: 'ui_click' });
          if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { refresh(); if (this._refreshTopbar) this._refreshTopbar(); });
          else setTimeout(() => { refresh(); if (this._refreshTopbar) this._refreshTopbar(); }, 0);
        });
      });
    };

    return {
      el,
      onShow() { refresh(); },
      refresh,
    };
  },

  _playArrivalBroadcast() {
    const stn = this._stationDef();
    if (!stn || !stn.type) return;
    const def = STATION_BROADCASTS[stn.type];
    if (!def || !def.lines.length) return;

    const text = def.lines[0];
    const bus = this._ctx && this._ctx.bus;
    const helpers = this._ctx && this._ctx.helpers;

    if (helpers && helpers.voice && typeof helpers.voice.say === 'function') {
      helpers.voice.say({
        channel: 'news',
        text: `[STATION ANNOUNCEMENT] ${text}`,
        kind: 'info',
        factionId: stn.factionId || null,
        priority: 30,
        ttl: 6,
      });
    } else if (bus && typeof bus.emit === 'function') {
      bus.emit('toast', {
        text: `[STATION ANNOUNCEMENT] ${text}`,
        kind: 'info',
        ttl: 6,
      });
    }
  },

  _triggerArrivalEdgeTrace() {
    if (typeof document === 'undefined' || !this._el) return;
    this._el.classList.remove('trace-active');
    void this._el.offsetWidth;
    this._el.classList.add('trace-active');
  },

  _refreshSchematicAndNodes() {
    if (typeof document === 'undefined' || !this._schematicPane || !this._nodesPane) return;
    const stn = this._stationDef();
    if (!stn) return;

    this._schematicPane.innerHTML = stationSchematicSvg(stn.type);

    // Service Dock: the canonical berth services, each ONLINE (offered here) or OFFLINE. Built via the
    // dockRail effect (create-once, update-many) so hover/focus magnify + readiness badges are shared
    // with the rest of the command deck. Selecting a node routes through the inspector, not the tab.
    if (this._fx && this._fx.dock) {
      this._fx.dock.setItems(this._berthServiceItems(stn));
      if (this._selectedService) this._fx.dock.setFocus(this._selectedService);
    }
  },

  /** Build the Service Dock item list for the current station (offered/offline + live readiness). */
  _berthServiceItems(stn) {
    const state = this._ctx && this._ctx.state;
    const offered = new Set(Array.isArray(stn.services) ? stn.services : []);
    return CANONICAL_BERTH_SERVICES.map((svc) => ({
      id: svc,
      label: stationServiceLabel(svc),
      icon: SERVICE_ICON[svc] || '●',
      readiness: berthServiceReadiness(svc, offered.has(svc), state),
    }));
  },

  _serviceOffered(svc) {
    const stn = this._stationDef();
    return !!(stn && Array.isArray(stn.services) && stn.services.includes(svc));
  },

  /**
   * Quick-service bar: click must DO something useful for the economy desk.
   * - refuel / repair → execute immediately (ui:service) when offered
   * - trade / shipyard / missions / etc → open the real section tab
   * - offline services → toast + short reason (no decorative beam across content)
   */
  _selectService(svc) {
    if (!svc) return;
    const bus = this._ctx && this._ctx.bus;
    const offered = this._serviceOffered(svc);
    this._selectedService = svc;
    if (this._fx && this._fx.dock) this._fx.dock.setFocus(svc);
    // Kill the old "draw a line to trivia" default — content stays readable.
    if (this._fx && this._fx.beam) this._fx.beam.setPath([], { active: false });

    if (!offered) {
      const stn = this._stationDef();
      const near = nearestStationOffering(svc, stn && stn.id);
      const label = stationServiceLabel(svc);
      const hint = near
        ? label + ' offline here. Nearest: ' + near.name + ' (' + near.sector + ').'
        : label + ' is not offered at this berth.';
      if (bus) bus.emit('toast', { text: hint, kind: 'warn', ttl: 3.5 });
      this._updateInspector();
      if (bus) bus.emit('audio:cue', { id: 'ui_deny' });
      return;
    }

    // Instant berth actions (the thing players expect from a "Refuel" chip).
    if (svc === 'refuel' || svc === 'repair') {
      if (bus) {
        bus.emit('ui:service', { type: svc });
        bus.emit('audio:cue', { id: 'ui_confirm' });
      }
      // Refresh readiness badges after economy applies the service.
      const self = this;
      const kick = () => {
        const stn = self._stationDef();
        if (stn && self._fx && self._fx.dock) self._fx.dock.setItems(self._berthServiceItems(stn));
        if (typeof self._refreshEconAndReadiness === 'function') self._refreshEconAndReadiness();
        self._updateInspector();
      };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(kick);
      else setTimeout(kick, 0);
      return;
    }

    // Navigation services → the real economy screen (not a diagnostics essay).
    const tab = tabForService(svc);
    // ore_buy is trade-desk sell pressure; land on Hold if the player has cargo, else Market.
    if (svc === 'ore_buy') {
      const hasCargo = cargoUsedUnits(this._ctx && this._ctx.state) > 0;
      this.setTab(hasCargo ? 'hold' : 'market', { focusRail: true });
    } else {
      this.setTab(tab, { focusRail: true });
    }
    if (bus) bus.emit('audio:cue', { id: 'ui_tab' });
    this._updateInspector();
    if (typeof this._updateCommandStrip === 'function') this._updateCommandStrip();
  },

  /** One ripple from the selected node (one event = one ripple; never on hover or a timer). */
  _pingServiceNode(svc) {
    const fx = this._fx;
    if (!fx || !fx.ripple || !this._fxOverlay || !this._nodesPane) return;
    const btn = this._nodesPane.querySelector('[data-service="' + svc + '"]');
    if (!btn) return;
    const oRect = this._fxOverlay.getBoundingClientRect();
    const bRect = btn.getBoundingClientRect();
    if (!(oRect.width > 0) || !(bRect.width > 0)) return;
    fx.ripple.resize(oRect.width, oRect.height);
    fx.ripple.ping(bRect.left + bRect.width / 2 - oRect.left, bRect.top + bRect.height / 2 - oRect.top,
      { kind: this._serviceOffered(svc) ? 'good' : 'danger' });
  },

  /** Plot the route beam from the selected node to the diagnostics inspector (flows only if offered). */
  _plotServiceBeam(svc) {
    const fx = this._fx;
    if (!fx || !fx.beam || !this._fxBeamLayer || !this._nodesPane || !this._el) return;
    const layer = this._fxBeamLayer.getBoundingClientRect();
    const btn = this._nodesPane.querySelector('[data-service="' + svc + '"]');
    const inspector = this._el.querySelector('.st-inspector');
    if (!btn || !inspector || !(layer.width > 0)) return;
    const b = btn.getBoundingClientRect();
    const i = inspector.getBoundingClientRect();
    if (!(b.width > 0) || !(i.width > 0)) return;
    fx.beam.resize(layer.width, layer.height);
    const from = { x: b.left + b.width / 2 - layer.left, y: b.top + b.height / 2 - layer.top };
    const to = { x: i.left - layer.left + 8, y: i.top - layer.top + 26 };
    const offered = this._serviceOffered(svc);
    fx.beam.setPath([from, { x: (from.x + to.x) / 2, y: from.y }, to],
      { active: offered, kind: offered ? 'route' : 'warn' });
  },

  /** Bounded scanner-grid "console acquisition" sweep — fires only on a genuine dock transition. */
  _revealScan() {
    const fx = this._fx && this._fx.flicker;
    if (!fx || !this._scanLayer) return;
    const r = this._scanLayer.getBoundingClientRect();
    if (r.width > 4 && r.height > 4) fx.resize(r.width, r.height);
    fx.reveal({ resolveTo: (c, row, cols, rows) => {
      const dx = (c + 0.5) / cols - 0.5;
      const dy = (row + 0.5) / rows - 0.5;
      return clamp01(1 - Math.sqrt(dx * dx + dy * dy) * 1.7);
    } });
  },

  /** Start/stop every command-deck effect. setActive(false) MUST park all rAF (frame-sleep contract);
   *  idempotent and tolerant of being called mid-reveal or twice. */
  _setEffectsActive(on) {
    if (!this._fx) return;
    for (const k in this._fx) {
      const f = this._fx[k];
      if (f && typeof f.setActive === 'function') {
        try { f.setActive(!!on); } catch (e) { /* effect teardown is best-effort */ }
      }
    }
  },

  _refreshEconAndReadiness() {
    if (typeof document === 'undefined' || !this._econBadge || !this._readinessSummary) return;
    const stn = this._stationDef();
    if (!stn) return;

    const state = this._ctx.state;

    const stripe = this._el.querySelector('.st-faction-stripe');
    if (stripe) {
      const color = factionColorOf(stn.factionId);
      stripe.style.background = `linear-gradient(90deg, ${color}, transparent)`;
    }

    const activeEvents = state.economy && state.economy.econEvents || [];
    const affected = activeEvents.filter(e => e.stationId === stn.id);
    // Station state/event readout morphs on CHANGE only (the key omits the live countdown so the morph
    // does not re-fire every refresh tick — only when the event itself starts, ends, or swaps).
    let econText;
    let econKey;
    if (affected.length > 0) {
      const e = affected[0];
      econText = '⚠ ' + String(e.type || 'event').replace(/_/g, ' ').toUpperCase() + ' ACTIVE';
      econKey = 'alert:' + e.type;
      this._econBadge.className = 'st-econ-badge active mono';
    } else {
      econText = 'STATUS NOMINAL · MARKET ACTIVE';
      econKey = 'nominal';
      this._econBadge.className = 'st-econ-badge nominal mono';
    }
    if (this._fx && this._fx.morph) {
      if (econKey !== this._lastEconKey) { this._fx.morph.set(econText); this._lastEconKey = econKey; }
    } else if (this._econMorphMount) {
      this._econMorphMount.textContent = econText;
    }

    const chips = departureReadinessChips(state);
    const summary = departureReadinessSummary(chips);
    if (this._readinessSummary) {
      this._readinessSummary.className = `st-readiness-summary st-readiness--${summary.state} mono`;
      this._readinessSummary.textContent = summary.status || '—';
    }
  },

  _updateInspector() {
    if (typeof document === 'undefined' || !this._el) return;
    const inspectorEl = this._el.querySelector('.st-inspector-content');
    if (!inspectorEl) return;

    const stn = this._stationDef();
    if (!stn) {
      inspectorEl.innerHTML = `<div class="st-inspector-empty">Offline</div>`;
      return;
    }

    const state = this._ctx.state;
    // Dual focus: a chosen Service Dock node describes THAT service (offered/offline + route hint);
    // otherwise the inspector follows the active section tab.
    const sel = this._selectedService;
    const usingService = !!(sel && SERVICE_LABELS[sel]);
    const tabId = usingService ? tabForService(sel) : this._activePanelId();
    const tab = TABS.find((t) => t.id === tabId) || { id: 'hold', label: 'HOLD', icon: '■', help: 'View cargo hold manifest, capacity, and item values.' };
    const tabStatus = stationTabServiceStatus(tabId, stn);
    const offered = usingService ? this._serviceOffered(sel) : tabStatus.offered;
    const headKind = usingService ? 'Selected Service' : 'Selected Subsystem';
    const headIcon = usingService ? escapeHtml(SERVICE_ICON[sel] || '●') : (glyphSvg(tabId) || tab.icon);
    const headName = usingService ? escapeHtml(stationServiceLabel(sel).toUpperCase()) : tab.label;
    const headDesc = usingService ? escapeHtml(berthServiceDesc(sel)) : tab.help;
    const availLabel = usingService ? (offered ? 'ONLINE' : 'OFFLINE') : tabStatus.label.toUpperCase();
    const availState = usingService ? (offered ? 'available' : 'unavailable') : tabStatus.state;

    const fid = stn.factionId;
    const factionMeta = fid ? FACTION_BY_ID.get(fid) : null;
    const factionName = factionNameOf(fid);
    const factionColor = factionColorOf(fid);

    let rep = 0;
    if (fid && state.factions && state.factions[fid]) {
      rep = state.factions[fid].rep;
    } else if (fid && NEW_GAME.factionRep && typeof NEW_GAME.factionRep[fid] === 'number') {
      rep = NEW_GAME.factionRep[fid];
    }
    const tier = tierFor(rep);
    const guidance = factionStandingGuidance(rep, factionMeta || { id: fid }, state.factions && state.factions[fid] && state.factions[fid].lastDelta);

    const risks = STATION_RISKS[stn.type] || 'Standard industrial dock safety parameters apply.';

    let html = `
      <div class="st-ins-section">
        <div class="st-ins-title">${headKind}</div>
        <div class="st-ins-tab-header">
          <span class="st-ins-tab-icon">${headIcon}</span>
          <span class="st-ins-tab-name">${headName}</span>
        </div>
        <div class="st-ins-desc">${headDesc}</div>
      </div>

      <div class="st-ins-section">
        <div class="st-ins-title">Service Status</div>
        <div class="st-ins-row">
          <span>Availability</span>
          <span class="st-ins-row-val st-ins-status--${availState}">${availLabel}</span>
        </div>
    `;

    if (!offered) {
      if (usingService) {
        const near = nearestStationOffering(sel, stn.id);
        html += `<div class="st-ins-hint">⚠️ Not offered at ${escapeHtml(stn.name || 'this berth')}.</div>`;
        html += near
          ? `<div class="st-ins-row-detail">Route: nearest ${escapeHtml(stationServiceLabel(sel))} at ${escapeHtml(near.name)} · ${escapeHtml(near.sector)}.</div>`
          : `<div class="st-ins-row-detail">No known ${escapeHtml(stationServiceLabel(sel))} on your charts yet.</div>`;
      } else {
        const rule = TAB_SERVICE_RULES[tabId];
        const hint = rule ? rule.unavailableHint : 'Service unavailable at this facility.';
        html += `<div class="st-ins-hint">⚠️ ${hint}</div>`;
      }
    }

    html += `
      </div>

      <div class="st-ins-section">
        <div class="st-ins-title">Faction Standing</div>
        <div class="st-ins-row">
          <span>Authority</span>
          <span class="st-ins-row-val" style="color:${factionColor}">${factionName}</span>
        </div>
        <div class="st-ins-row">
          <span>Standing</span>
          <span class="st-ins-row-val">${tier.name} (${rep > 0 ? '+' : ''}${rep})</span>
        </div>
        <div class="st-ins-row-detail">${guidance.next}</div>
        <div class="st-ins-row-detail" style="margin-top: 4px; font-style: italic;">Plan: ${guidance.plan}</div>
      </div>

      <div class="st-ins-section">
        <div class="st-ins-title">Local Station Risks</div>
        <div class="st-ins-risk-desc">${risks}</div>
      </div>
    `;

    inspectorEl.innerHTML = html;
  },

  /** Operations contract board (state.missions.boards[stationId]). The left rail is a set of compact
   *  contract selectors; picking one drives the CENTER preflight instrument (route beam + destination
   *  ping + risk/fuel/hold ring gauges + broker comms slate + morph contract state + full preflight
   *  and consequence readouts). Accept emits ui:acceptMission; the accepted receipt plots the route. */
  _buildMissionsPanel(content, ctx) {
    const panel = document.createElement('div');
    panel.className = 'st-tabpanel st-panel st-missions';
    panel.id = 'st-panel-missions';
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', 'st-tab-missions');
    panel.setAttribute('tabindex', '0');
    panel.style.display = 'none';
    const gauge = (key, label) =>
      '<div class="st-ops-gauge st-ops-gauge--' + key + '">' +
        '<div class="st-ops-gauge-mount" data-g="' + key + '"></div>' +
        '<div class="st-ops-gauge-meta">' +
          '<div class="st-ops-gauge-val" data-g="' + key + '">-</div>' +
          '<div class="st-ops-gauge-label mono">' + label + '</div>' +
        '</div>' +
      '</div>';
    panel.innerHTML =
      '<div class="st-sub-h">Operations Board</div>' +
      // STRICT: no multi-sentence mission guide essay on default board (preflight is the detail).
      '<div class="st-mission-recommend" hidden></div>' +
      '<div class="st-mission-accepted" hidden></div>' +
      '<div class="st-ops">' +
        '<div class="st-ops-rail">' +
          '<div class="st-ops-rail-h mono">Contracts</div>' +
          '<div class="st-mission-list"></div>' +
        '</div>' +
        '<div class="st-ops-center" data-centerpiece="contract-route-board">' +
          '<div class="st-ops-empty">No contract selected. Pick one from the left to run its route preflight.</div>' +
          '<div class="st-ops-dossier" hidden>' +
            '<div class="st-ops-head">' +
              '<div class="st-ops-head-copy">' +
                '<div class="st-ops-eyebrow mono">CONTRACT PREFLIGHT</div>' +
                '<div class="st-ops-title"></div>' +
              '</div>' +
              '<div class="st-ops-state"></div>' +
            '</div>' +
            '<div class="st-ops-route">' +
              '<div class="st-ops-beam"></div>' +
              '<div class="st-ops-ping"></div>' +
              '<div class="st-ops-node st-ops-node--origin"><span class="st-ops-node-tag mono">ORIGIN</span><span class="st-ops-node-name"></span></div>' +
              '<div class="st-ops-node st-ops-node--dest"><span class="st-ops-node-tag mono">DESTINATION</span><span class="st-ops-node-name"></span></div>' +
            '</div>' +
            '<div class="st-ops-gauges">' + gauge('risk', 'Risk') + gauge('fuel', 'Fuel') + gauge('cargo', 'Hold') + '</div>' +
            '<div class="st-ops-comms">' +
              '<div class="st-ops-comms-head"><span class="st-ops-comms-from"></span><span class="st-ops-comms-tag mono">&#9650; INCOMING</span></div>' +
              '<div class="st-ops-comms-msg"></div>' +
            '</div>' +
            '<div class="st-mission-preflight st-ops-preflight"></div>' +
            '<div class="st-ops-standing"></div>' +
            '<div class="st-mission-preflight-warn st-ops-warn" hidden></div>' +
            '<div class="st-mission-consequences st-ops-consequences"></div>' +
            '<div class="st-ops-actions"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    const status = panel.querySelector('.st-mission-accepted');
    const recommend = panel.querySelector('.st-mission-recommend');
    const list = panel.querySelector('.st-mission-list');
    const center = panel.querySelector('.st-ops-center');
    // Shared card-selection path for pointer click and keyboard Enter/Space (role=button parity).
    const selectMissionCard = (missionId) => {
      if (missionId == null || missionId === '') return;
      this._selectContract(missionId);
      ctx.bus.emit('audio:cue', { id: 'ui_tab' });
    };
    const handleMissionAction = (ev) => {
      const actionEl = ev.target.closest('[data-act]');
      // A click on the card body (not a control) selects the contract → drives the center preflight.
      if (!actionEl) {
        const card = ev.target.closest('.st-mission-card');
        if (card && card.getAttribute('data-mid')) {
          selectMissionCard(card.getAttribute('data-mid'));
        }
        return;
      }
      const missionId = actionEl.getAttribute('data-mid');
      const act = actionEl.getAttribute('data-act');
      if (act === 'accept') {
        if (missionId) this._selectContract(missionId);
        ctx.bus.emit('ui:acceptMission', { missionId });
      } else if (act === 'plotRoute') {
        this._plotContractRoute(missionId);
      }
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
    };
    const handleMissionCardKeydown = (ev) => {
      const resolved = resolveMissionCardKeyboardSelection(ev);
      if (!resolved) return;
      // Space must not scroll the station workspace; Enter is prevented for consistent activation.
      ev.preventDefault();
      selectMissionCard(resolved.missionId);
    };
    list.addEventListener('click', handleMissionAction);
    list.addEventListener('keydown', handleMissionCardKeydown);
    recommend.addEventListener('click', handleMissionAction);
    center.addEventListener('click', handleMissionAction);
    status.addEventListener('click', handleMissionAction);
    content.appendChild(panel);
    this._missionEls = {
      panel, list, status, recommend, center,
      empty: panel.querySelector('.st-ops-empty'),
      dossier: panel.querySelector('.st-ops-dossier'),
      title: panel.querySelector('.st-ops-title'),
      stateMount: panel.querySelector('.st-ops-state'),
      route: panel.querySelector('.st-ops-route'),
      beamMount: panel.querySelector('.st-ops-beam'),
      pingMount: panel.querySelector('.st-ops-ping'),
      originName: panel.querySelector('.st-ops-node--origin .st-ops-node-name'),
      destName: panel.querySelector('.st-ops-node--dest .st-ops-node-name'),
      gRiskMount: panel.querySelector('.st-ops-gauge-mount[data-g="risk"]'),
      gFuelMount: panel.querySelector('.st-ops-gauge-mount[data-g="fuel"]'),
      gCargoMount: panel.querySelector('.st-ops-gauge-mount[data-g="cargo"]'),
      gRiskVal: panel.querySelector('.st-ops-gauge-val[data-g="risk"]'),
      gFuelVal: panel.querySelector('.st-ops-gauge-val[data-g="fuel"]'),
      gCargoVal: panel.querySelector('.st-ops-gauge-val[data-g="cargo"]'),
      commsFrom: panel.querySelector('.st-ops-comms-from'),
      commsMsg: panel.querySelector('.st-ops-comms-msg'),
      preflight: panel.querySelector('.st-ops-preflight'),
      standing: panel.querySelector('.st-ops-standing'),
      warn: panel.querySelector('.st-ops-warn'),
      consequences: panel.querySelector('.st-ops-consequences'),
      actions: panel.querySelector('.st-ops-actions'),
    };
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
    // One clean contract receipt: the singular confirmation the accept produces. A one-shot border
    // trace marks it as freshly printed (the sanctioned state-change motion, not a rest animation).
    status.innerHTML =
      '<div class="st-mission-accepted-label mono">ACCEPTED + TRACKED</div>' +
      '<div class="st-mission-accepted-title">' + escapeHtml(mission.title || prettyType(mission.type)) + '</div>' +
      '<div class="st-mission-accepted-next">' + escapeHtml(routeLine) + '</div>' +
      '<div class="st-mission-accepted-log mono">Mission Log (' + BINDINGS.missionLog.label + ') now carries the route, timer, and progress. Undock when Departure Check is green.</div>' +
      '<div class="st-mission-accepted-actions">' +
        '<button class="st-ops-btn st-ops-btn--plot" data-act="plotRoute" data-mid="' + escapeHtml(String(mission.id)) + '" ' +
          'title="Open the map and ping this contract\'s destination" aria-label="Plot route and ping destination for ' + escapeHtml(mission.title || prettyType(mission.type)) + '">Plot Route</button>' +
      '</div>';
    // One-shot "freshly printed" edge sweep marking the receipt as new (state-change motion only).
    status.classList.remove('trace-run');
    void status.offsetWidth;
    status.classList.add('trace-run');
  },

  _refreshMissions() {
    const ctx = this._ctx;
    if (!this._missionEls) return;
    this._refreshMissionAcceptedStatus();
    const list = this._missionEls.list;
    const recommend = this._missionEls.recommend;
    const board = ctx.state.missions && ctx.state.missions.boards && ctx.state.missions.boards[this._stationId];
    const slots = (board && board.slots) || [];
    list.textContent = '';
    const recommendation = recommendMissionBoardOffer(slots, ctx.state);
    if (recommend) {
      if (!recommendation) {
        recommend.hidden = true;
        recommend.innerHTML = '';
      } else {
        const acceptTitle = recommendation.disabled
          ? recommendation.reason
          : 'Accept, auto-track, and add ' + recommendation.title + ' to Mission Log.';
        recommend.hidden = false;
        recommend.className = 'st-mission-recommend st-mission-recommend--' + recommendation.kind;
        recommend.innerHTML =
          '<div class="st-mission-recommend-copy">' +
            '<div class="st-mission-recommend-label mono">' + escapeHtml(recommendation.label) + '</div>' +
            '<div class="st-mission-recommend-title">' + escapeHtml(recommendation.title) + '</div>' +
            '<div class="st-mission-recommend-reason">' + escapeHtml(recommendation.reason) + '</div>' +
          '</div>' +
          '<button data-act="accept" data-mid="' + escapeHtml(recommendation.missionId) + '"' +
            (recommendation.disabled ? ' disabled' : '') +
            ' title="' + escapeHtml(acceptTitle) + '" aria-label="' + escapeHtml(acceptTitle) + '">' +
            escapeHtml(recommendation.actionLabel) +
          '</button>';
      }
    }
    if (!slots.length) {
      list.innerHTML = '<div class="st-empty">No contracts posted right now. Try the Bar for leads, check another station, or undock and use the Mission Log (' + BINDINGS.missionLog.label + ') for active objectives.</div>';
      this._selectedMissionId = null;
      this._refreshOpsCenter();
      return;
    }
    // Resolve the selected contract BEFORE rendering so the correct card carries `.selected`: keep the
    // current pick if still posted, else follow the recommendation, else the first contract.
    const slotIds = slots.map((s) => String(s && (s.id != null ? s.id : s.missionId)));
    if (this._selectedMissionId == null || !slotIds.includes(String(this._selectedMissionId))) {
      this._selectedMissionId = (recommendation && recommendation.missionId != null)
        ? String(recommendation.missionId) : (slotIds[0] || null);
    }
    const frag = document.createDocumentFragment();
    const tracked = ctx.state.ui && ctx.state.ui.trackedMissionId;
    for (const m of slots) {
      const fac = m.factionId ? FACTION_BY_ID.get(m.factionId) : null;
      const risk = missionRiskTier(m);
      const riskTitle = missionRiskCopy(risk);
      const mid = m.id != null ? m.id : m.missionId;
      const preflight = missionPreflight(m, ctx.state);
      const readiness = missionBoardReadiness(preflight);
      const consequences = missionConsequenceSummary(m);
      const cargoNeed = missionCargoFootprint(m);
      const unmet = m.requirementUnmet || m.lockedReason || preflight.blocker || null;
      const expires = m.expiresInS != null ? m.expiresInS : m.time_limit_s;
      const acceptTitle = unmet
        ? 'Cannot accept: ' + unmet
        : 'Accept, auto-track, and add ' + (m.title || prettyType(m.type)) + ' to Mission Log.';
      // Compact selector row: risk + reward + faction rep + cargo + timer at a glance (brief WORK 1).
      const cslot =
        '<span class="st-mission-chip st-mission-chip--r' + risk + '">R' + risk + '</span>' +
        '<span class="st-mission-chip st-mission-chip--cr">+' + (consequences.reward || 0).toLocaleString('en-US') + ' cr</span>' +
        (consequences.repReward ? '<span class="st-mission-chip st-mission-chip--rep">' + (fac ? escapeHtml(fac.short || fac.name) + ' ' : '') + '+' + consequences.repReward + ' rep</span>' : '') +
        (cargoNeed.volume > 0 ? '<span class="st-mission-chip st-mission-chip--hold">' + fmtHoldUnits(cargoNeed.volume) + 'u hold</span>' : '') +
        (expires != null ? '<span class="st-mission-chip st-mission-chip--time">' + fmtTime(expires) + '</span>' : '');
      const card = document.createElement('div');
      const recommended = recommendation && recommendation.missionId === mid;
      const selected = this._selectedMissionId != null && String(this._selectedMissionId) === String(mid);
      card.className = 'st-mission-card' +
        (tracked && tracked === mid ? ' tracked' : '') +
        (selected ? ' selected' : '') +
        (recommended ? ' recommended recommended--' + recommendation.kind : '');
      card.setAttribute('data-mid', String(mid));
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.innerHTML =
        '<div class="st-mission-top">' +
          '<span class="st-mission-title">' + escapeHtml(m.title || prettyType(m.type)) + '</span>' +
          '<span class="st-mission-badges">' +
            (recommended ? '<span class="st-mission-recommended st-mission-recommended--' + recommendation.kind + '">PICK</span>' : '') +
            '<span class="st-mission-readiness st-mission-readiness--' + readiness.kind + '" title="' + escapeHtml(readiness.title) + '" aria-label="' + escapeHtml(readiness.title) + '">' + escapeHtml(readiness.label) + '</span>' +
            '<span class="st-mission-risk r' + risk + '" title="' + escapeHtml(riskTitle) + '" aria-label="' + escapeHtml(riskTitle) + '">RISK ' + risk + '</span>' +
          '</span>' +
        '</div>' +
        '<div class="st-mission-meta mono">' +
          (fac ? '<span class="st-mission-fac" style="color:' + (fac.color || '#aaa') + '">' + escapeHtml(fac.short || fac.name) + '</span> · ' : '') +
          escapeHtml(prettyType(m.type)) +
          (m.destStationId || m.destSectorId || m.dest ? ' → ' + escapeHtml(missionDestName(m)) : '') +
        '</div>' +
        '<div class="st-mission-cslot">' + cslot + '</div>' +
        '<div class="st-mission-next">' + escapeHtml(missionNextStepText(m)) + '</div>' +
        '<div class="st-mission-btns">' +
          '<button type="button" class="st-verb-btn st-mission-accept" data-act="accept" data-mid="' + escapeHtml(mid) + '"' + (unmet ? ' disabled' : '') +
            ' title="' + escapeHtml(acceptTitle) + '" aria-label="' + escapeHtml(acceptTitle) + '">Accept</button>' +
          (unmet ? '<span class="st-mission-unmet">' + escapeHtml(unmet) + '</span>' : '') +
        '</div>';
      frag.appendChild(card);
    }
    list.appendChild(frag);
    // Drive the center preflight instrument for the selected contract.
    this._refreshOpsCenter();
  },

  /** Pick a contract from the rail → drive the center preflight instrument and ping its destination.
   *  Selection is an instance property (never gameState) so it stays out of the save schema. */
  _selectContract(missionId) {
    if (missionId == null || missionId === '') return;
    this._selectedMissionId = String(missionId);
    if (this._missionEls && this._missionEls.list) {
      this._missionEls.list.querySelectorAll('.st-mission-card').forEach((c) => {
        c.classList.toggle('selected', c.getAttribute('data-mid') === this._selectedMissionId);
      });
    }
    this._refreshOpsCenter();
    this._pingContractDest('nav'); // one ripple per discrete selection event (never on a refresh tick)
  },

  /** The center preflight instrument for the selected contract: route beam + destination nodes, the
   *  risk / fuel / hold ring gauges, the broker comms slate, the morph contract-state readout, and the
   *  full preflight + consequence detail. Effects are updated by verb — the scaffold is never rebuilt. */
  _refreshOpsCenter() {
    const els = this._missionEls;
    if (!els || !els.center) return;
    const ctx = this._ctx;
    const board = ctx.state.missions && ctx.state.missions.boards && ctx.state.missions.boards[this._stationId];
    const slots = (board && board.slots) || [];
    const m = this._selectedMissionId != null
      ? slots.find((s) => String(s && (s.id != null ? s.id : s.missionId)) === String(this._selectedMissionId))
      : null;
    if (!m) {
      els.empty.hidden = false;
      els.dossier.hidden = true;
      this._lastOpsStateKey = null;
      return;
    }
    els.empty.hidden = true;
    els.dossier.hidden = false;

    const preflight = missionPreflight(m, ctx.state);
    const readiness = missionBoardReadiness(preflight);
    const consequences = missionConsequenceSummary(m);
    const standing = missionStandingRequirement(m, ctx.state);
    const risk = missionRiskTier(m);
    const mid = String(m.id != null ? m.id : m.missionId);
    const unmet = m.requirementUnmet || m.lockedReason || preflight.blocker || null;

    els.title.textContent = m.title || prettyType(m.type);

    // Contract state morph — fires ONLY when the state label changes (never per refresh tick).
    const stateLabel = unmet ? 'BLOCKED'
      : readiness.state === 'ready' ? 'READY TO ACCEPT'
        : readiness.state === 'caution' ? 'CHECK PREP' : 'OFFERED';
    els.stateMount.setAttribute('data-kind', readiness.kind);
    const stateKey = mid + ':' + stateLabel;
    if (this._fx && this._fx.mState && this._lastOpsStateKey !== stateKey) {
      this._fx.mState.set(stateLabel);
      this._lastOpsStateKey = stateKey;
    }

    this._refreshOpsRoute(m);
    this._refreshOpsGauges(m, risk);

    // Broker comms slate — the contact and their message (mission-as-conversation).
    els.commsFrom.textContent = missionClientName(m) + ' · ' + prettyType(m.type);
    els.commsMsg.textContent = missionBriefText(m) + ' ' + missionValueText(m);

    // Full preflight chips + standing + non-blocking warning + consequence stakes — every part of the
    // centerpiece contract (route, risk, cargo, fuel, consequences) visible before accept.
    els.preflight.innerHTML = preflight.chips.map((chip) =>
      '<span class="st-mission-preflight-chip st-mission-preflight-chip--' + chip.kind + '">' + escapeHtml(chip.text) + '</span>').join('');
    els.standing.innerHTML = standing
      ? '<div class="st-mission-standing st-mission-standing--' + (standing.ok ? 'ok' : 'locked') + '">' +
          '<span class="mono">' + escapeHtml(standing.ok ? 'Standing ready' : 'Standing locked') + '</span>' +
          '<span>' + escapeHtml(standing.gateName + ': ' + standing.faction + ' ' + signedRep(standing.currentRep) +
            ' / needs ' + signedRep(standing.minRep)) + '</span>' +
        '</div>'
      : '';
    if (preflight.warning) { els.warn.hidden = false; els.warn.textContent = preflight.warning; }
    else { els.warn.hidden = true; els.warn.textContent = ''; }
    els.consequences.innerHTML = consequences.chips.map((chip) =>
      '<span class="st-mission-consequence st-mission-consequence--' + chip.kind + '"><b>' + escapeHtml(chip.label) + '</b> ' + escapeHtml(chip.text) + '</span>').join('');

    const acceptTitle = unmet ? 'Cannot accept: ' + unmet
      : 'Accept, auto-track, and add ' + (m.title || prettyType(m.type)) + ' to Mission Log.';
    els.actions.innerHTML =
      '<button class="st-ops-btn st-ops-btn--accept" data-act="accept" data-mid="' + escapeHtml(mid) + '"' + (unmet ? ' disabled' : '') +
        ' title="' + escapeHtml(acceptTitle) + '" aria-label="' + escapeHtml(acceptTitle) + '">Accept + Track</button>' +
      '<button class="st-ops-btn st-ops-btn--plot" data-act="plotRoute" data-mid="' + escapeHtml(mid) + '" ' +
        'title="Ping the destination and preview the route" aria-label="Preview route and ping destination for ' + escapeHtml(m.title || prettyType(m.type)) + '">Plot Route</button>' +
      (unmet ? '<span class="st-mission-unmet">' + escapeHtml(unmet) + '</span>' : '');
  },

  /** Draw the contract route lane (origin → destination) with the route beam, colour it by route risk,
   *  and set the node labels. Beam needs real pixel size, so plot only when the Missions tab is visible
   *  and laid out (getBoundingClientRect is 0 while display:none). */
  _refreshOpsRoute(m) {
    const els = this._missionEls;
    if (!els || !els.route) return;
    const origin = this._stationDef();
    els.originName.textContent = (origin && origin.name) || 'Current dock';
    els.destName.textContent = missionDestName(m);
    const intel = missionRouteIntel(m, this._ctx.state);
    const danger = intel ? (Number(intel.danger) || 0) : 0;
    const kind = danger >= 0.84 ? 'danger' : danger >= 0.72 ? 'warn' : 'route';
    els.route.setAttribute('data-kind', kind);
    if (!this._visible() || this._activePanelId() !== 'missions') return;
    const r = els.route.getBoundingClientRect();
    if (!(r.width > 8) || !(r.height > 8)) return;
    const W = r.width, H = r.height;
    const from = { x: W * 0.14, y: H * 0.5 };
    const to = { x: W * 0.86, y: H * 0.5 };
    if (this._fx && this._fx.mBeam) {
      this._fx.mBeam.resize(W, H);
      this._fx.mBeam.setPath([from, { x: (from.x + to.x) / 2, y: from.y }, to], { active: true, kind });
    }
  },

  /** The three preflight ring gauges: contract risk tier, fuel readiness, and hold readiness. */
  _refreshOpsGauges(m, risk) {
    const els = this._missionEls;
    if (!els) return;
    const state = this._ctx.state;
    const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
    // Risk ring fills toward the danger tiers.
    const riskV = clamp(risk / 4);
    const riskKind = risk >= 3 ? 'danger' : risk >= 2 ? 'warn' : 'good';
    if (this._fx && this._fx.mRisk) this._fx.mRisk.setValue(riskV, { kind: riskKind, label: 'Risk tier ' + risk + ' of 4' });
    if (els.gRiskVal) els.gRiskVal.textContent = 'R' + risk;
    // Fuel readiness: current fuel fraction.
    const fuel = state.fuel || {};
    const fMax = Number(fuel.max) || 0;
    const fFrac = fMax > 0 ? clamp((Number(fuel.current) || 0) / fMax) : null;
    const fuelKind = fFrac == null ? 'info' : (fFrac < 0.25 ? 'danger' : fFrac < 0.45 ? 'warn' : 'good');
    if (this._fx && this._fx.mFuel) this._fx.mFuel.setValue(fFrac == null ? 0 : fFrac, { kind: fuelKind, label: fFrac == null ? 'Fuel level unknown' : 'Fuel ' + Math.round(fFrac * 100) + '%' });
    if (els.gFuelVal) els.gFuelVal.textContent = fFrac == null ? '—' : Math.round(fFrac * 100) + '%';
    // Hold readiness: projected fill after loading contract cargo, else current hold fill.
    const cargo = (state.player && state.player.cargo) || {};
    const cap = Number(cargo.capVolume) || 0;
    const used = Number(cargo.usedVolume) || 0;
    const need = missionCargoFootprint(m).volume;
    let holdV, holdKind, holdTxt;
    if (need > 0) {
      holdV = cap > 0 ? clamp((used + need) / cap) : 1;
      holdKind = cap < need ? 'danger' : (cap - used >= need ? 'good' : 'warn');
      holdTxt = fmtHoldUnits(need) + 'u';
    } else {
      holdV = cap > 0 ? clamp(used / cap) : 0;
      holdKind = 'info';
      holdTxt = cap > 0 ? Math.round((used / cap) * 100) + '%' : '—';
    }
    if (this._fx && this._fx.mCargo) this._fx.mCargo.setValue(holdV, { kind: holdKind, label: 'Hold readiness' });
    if (els.gCargoVal) els.gCargoVal.textContent = holdTxt;
  },

  /** One ripple at the destination node (the 'destination ping' — one discrete event, never a timer). */
  _pingContractDest(kind) {
    const els = this._missionEls;
    const fx = this._fx;
    if (!els || !els.route || !fx || !fx.mPing) return;
    if (!this._visible() || this._activePanelId() !== 'missions') return;
    const r = els.route.getBoundingClientRect();
    if (!(r.width > 8) || !(r.height > 8)) return;
    fx.mPing.resize(r.width, r.height);
    fx.mPing.ping(r.width * 0.86, r.height * 0.5, { kind: kind || 'nav' });
  },

  /** Plot Route: select + ping the destination, and — once the contract is accepted/tracked — open the
   *  unified galaxyMap at LOCAL or GALAXY focus (same local-vs-jump split the Mission Log uses). */
  _plotContractRoute(missionId) {
    if (missionId != null) this._selectContract(missionId);
    const ctx = this._ctx;
    const state = ctx.state;
    const active = (state.missions && state.missions.active) || [];
    const tracked = state.ui && state.ui.trackedMissionId;
    const mission = active.find((mm) => mm && String(mm.id) === String(missionId) && mm.status === 'active');
    if (mission && String(tracked) === String(missionId)) {
      const wp = state.nav && state.nav.waypoint;
      const cur = state.world && state.world.currentSectorId;
      const local = !!(wp && (wp.pos || (wp.sectorId && cur && wp.sectorId === cur)));
      openGalaxyMap(ctx, {
        focus: local ? MAP_FOCUS.LOCAL : MAP_FOCUS.GALAXY,
        missionId: mission.id,
        sectorId: (wp && wp.sectorId) || mission.destSectorId || null,
        stationId: mission.destStationId || (wp && wp.stationId) || null,
        pos: wp && wp.pos ? wp.pos : null,
        source: 'stationHub',
      });
      return;
    }
    const board = state.missions && state.missions.boards && state.missions.boards[this._stationId];
    const offer = board && board.slots && board.slots.find((s) => String(s && (s.id != null ? s.id : s.missionId)) === String(missionId));
    ctx.bus.emit('toast', { text: 'Accept this contract to plot its nav route' + (offer ? ' to ' + missionDestName(offer) : '') + '.', kind: 'info', ttl: 3 });
  },

  /** Activate a tab: toggle rail highlight + panel visibility, persist ui.activeStationTab. */
  setTab(tabId, options = {}) {
    if (!TABS.some((t) => t.id === tabId) && tabId !== 'hold') tabId = 'market';
    // Navigating a section clears the Service Dock selection so the inspector follows the tab again,
    // and retracts the route beam that pointed at the previously selected service.
    this._selectedService = null;
    if (this._fx && this._fx.beam) this._fx.beam.setPath([], { active: false });
    const prevTab = this._activePanelId();
    if (prevTab !== tabId) {
      const prev = this._panels && this._panels[prevTab];
      if (prev && typeof prev.onHide === 'function') {
        try { prev.onHide(); } catch (e) { console.error(e); }
      }
    }
    this._ctx.state.ui.activeStationTab = tabId;
    if (this._el) {
      this._el.dataset.activeTab = tabId;
      this._el.classList.toggle('st-hub--engineering', tabId === 'shipyard' || tabId === 'outfit');
    }
    // rail highlight
    let activeButton = null;
    this._rail.querySelectorAll('[data-tab]').forEach((b) => {
      const isActive = b.getAttribute('data-tab') === tabId;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      if (b.getAttribute('role') === 'tab') {
        b.setAttribute('tabindex', isActive ? '0' : '-1');
      } else {
        b.setAttribute('tabindex', '-1');
      }
      if (isActive) activeButton = b;
    });
    // Trigger channel wipe animation
    if (this._content) {
      this._content.classList.remove('switching');
      void this._content.offsetWidth;
      this._content.classList.add('switching');
      setTimeout(() => this._content && this._content.classList.remove('switching'), 130);
    }
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
    this._refreshRailServiceStatus();
    this._refreshPurpose();
    this._refreshHandoff();
    this._refreshSchematicAndNodes();
    this._refreshEconAndReadiness();
    this._updateInspector();
    if (options.focusRail && activeButton && document.activeElement !== activeButton) {
      activeButton.focus({ preventScroll: true });
    }
    // refresh the now-visible panel
    this._scheduleActiveRefresh(true);
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

  _activePanelIsHeavy(tabId = this._activePanelId()) {
    return tabId === 'shipyard' || tabId === 'outfit';
  },

  _setContentBusy(on, tabId = this._activePanelId()) {
    const el = this._busyEl;
    if (!el) return;
    if (!on) {
      el.classList.remove('is-visible');
      el.hidden = true;
      return;
    }
    const label = tabId === 'shipyard'
      ? 'Loading shipyard'
      : tabId === 'outfit'
        ? 'Loading outfitting'
        : 'Loading station deck';
    const text = el.querySelector('.st-content-busy-text');
    if (text) text.textContent = label;
    el.hidden = false;
    el.classList.add('is-visible');
  },

  _clearScheduledActiveRefresh() {
    const win = typeof window !== 'undefined' ? window : globalThis;
    if (this._activeRefreshRaf && win && typeof win.cancelAnimationFrame === 'function') {
      win.cancelAnimationFrame(this._activeRefreshRaf);
    }
    if (this._activeRefreshTimer && win && typeof win.clearTimeout === 'function') {
      win.clearTimeout(this._activeRefreshTimer);
    }
    this._activeRefreshRaf = 0;
    this._activeRefreshTimer = 0;
    this._activeRefreshJob = null;
  },

  _afterNextPaint(fn) {
    const win = typeof window !== 'undefined' ? window : globalThis;
    const raf = win && typeof win.requestAnimationFrame === 'function'
      ? win.requestAnimationFrame.bind(win)
      : null;
    const setTimer = win && typeof win.setTimeout === 'function'
      ? win.setTimeout.bind(win)
      : setTimeout;
    if (!raf) {
      this._activeRefreshTimer = setTimer(() => {
        this._activeRefreshTimer = 0;
        fn();
      }, 0);
      return;
    }
    this._activeRefreshRaf = raf(() => {
      this._activeRefreshRaf = 0;
      this._activeRefreshTimer = setTimer(() => {
        this._activeRefreshTimer = 0;
        fn();
      }, 0);
    });
  },

  _scheduleActiveRefresh(isShow) {
    const tabId = this._activePanelId();
    const shouldDefer = !!isShow || this._activePanelIsHeavy(tabId);
    if (!shouldDefer) {
      this._refreshActive(!!isShow);
      return;
    }
    if (this._activeRefreshJob && this._activeRefreshJob.tabId === tabId) {
      this._activeRefreshJob.isShow = this._activeRefreshJob.isShow || !!isShow;
      return;
    }
    this._clearScheduledActiveRefresh();
    const job = { tabId, isShow: !!isShow };
    this._activeRefreshJob = job;
    this._setContentBusy(true, tabId);
    this._afterNextPaint(() => {
      if (this._activeRefreshJob !== job || this._activePanelId() !== job.tabId) return;
      this._activeRefreshJob = null;
      try {
        this._refreshActive(job.isShow);
      } finally {
        this._setContentBusy(false);
      }
    });
  },

  _refreshActive(isShow) {
    const id = this._activePanelId();
    if (id === 'missions') { this._refreshMissions(); return; }
    const p = this._panels[id];
    if (!p) return;
    // Error boundary: a child panel's onShow/refresh throwing must not crash the whole station hub or
    // bubble to an uncaught page error (matches the onHide guard). Degrade to a warning; rail stays usable.
    try {
      if (isShow && typeof p.onShow === 'function') p.onShow({ stationId: this._stationId, state: this._ctx.state });
      else if (typeof p.refresh === 'function') p.refresh({ stationId: this._stationId, state: this._ctx.state });
    } catch (e) {
      console.warn('[stationHub] panel "' + id + '" refresh failed', e);
    }
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
    if (this._el) {
      const stn = this._stationDef();
      // classList only: preserve desk/os bases + engineering/trace modifiers.
      applyStationHubRootClasses(this._el, stn && stn.type);
    }
    return this._stationId;
  },

  _stationDef() {
    const state = this._ctx.state;
    const sid = this._stationId;
    if (!sid) return null;
    const sect = state.world && state.world.activeSector;
    const activeRecord = sect && (sect.stations || []).find((x) => stationRecordId(x) === sid);
    let catalogRecord = null;
    const sectors = state.world && state.world.sectors;
    for (const s of (sectors ? Object.values(sectors) : [])) {
      const f = (s.stations || []).find((x) => stationRecordId(x) === sid);
      if (f) { catalogRecord = f; break; }
    }
    if (!catalogRecord) {
      for (const s of SECTORS) {
        const f = (s.stations || []).find((x) => stationRecordId(x) === sid);
        if (f) { catalogRecord = f; break; }
      }
    }
    return stationDefFrom(catalogRecord || activeRecord, liveStationEntity(state, sid), sid);
  },

  _refreshTopbar() {
    if (!this._topbar) return;
    const stn = this._stationDef();
    const nameEl = this._topbar.querySelector('.st-station-name');
    const facEl = this._topbar.querySelector('.st-station-fac');
    if (stn) {
      const targetName = stn.name || stn.id;
      if (nameEl && nameEl.textContent !== targetName && nameEl.dataset.acquireTarget !== targetName) {
        this._signalAcquire(nameEl, targetName, { duration: 400 });
      }
      if (facEl) {
        const fac = stn.factionId ? FACTION_BY_ID.get(stn.factionId) : null;
        facEl.textContent = (fac ? (fac.short || fac.name) : '') + '  ·  ' + (stn.type || '').replace('_', ' ');
        if (fac) facEl.style.color = fac.color || '';
      }
    } else {
      if (nameEl) nameEl.textContent = 'Station';
      if (facEl) facEl.textContent = '';
    }
    // Live money + cargo on the top strip (Station OS contract).
    const state = this._ctx && this._ctx.state;
    const credits = state && state.player ? (state.player.credits | 0) : 0;
    const cargo = state && state.player && state.player.cargo || {};
    const used = Number(cargo.usedVolume) || 0;
    const cap = Number(cargo.capVolume) || 0;
    if (this._topCreditsEl) this._topCreditsEl.textContent = credits.toLocaleString('en-US');
    if (this._topCargoEl) this._topCargoEl.textContent = used + ' / ' + cap;
  },

  _signalAcquire(element, finalText, opts = {}) {
    const duration = opts.duration || 400;
    const token = String(Date.now()) + ':' + Math.random().toString(36).slice(2);

    element.dataset.acquireTarget = finalText;
    element.dataset.acquireToken = token;
    element.textContent = finalText;
    element.style.opacity = '1';
    element.classList.remove('acquiring');
    void element.offsetWidth;
    element.classList.add('acquiring');
    setTimeout(() => {
      if (element.dataset.acquireToken !== token) return;
      delete element.dataset.acquireTarget;
      delete element.dataset.acquireToken;
    }, duration);
  },

  _refreshRailServiceStatus() {
    if (!this._rail) return;
    const stn = this._stationDef();
    // Nav rows stay names-only. Status lives in aria/title for a11y, not visual essay chips.
    this._rail.querySelectorAll('[data-tab]').forEach((b) => {
      const tabId = b.getAttribute('data-tab');
      const status = stationTabServiceStatus(tabId, stn);
      b.setAttribute('data-service-status', status.state);
      b.classList.toggle('st-tab--service-unavailable', status.state === 'unavailable');
      b.title = status.title;
      b.setAttribute('aria-label', tabLabel(tabId) + ': ' + status.label + '. ' + tabPurpose(tabId));
    });
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
    if (tabEl) {
      const tabId = this._activePanelId();
      const status = stationTabServiceStatus(tabId, stn);
      const note = status.state === 'unavailable' ? ' Service note: ' + status.label + '.' : '';
      tabEl.textContent = 'Current tab: ' + tabPurpose(tabId) + note;
    }
    if (servicesEl) servicesEl.textContent = stationServiceSummary(stn);
  },

  _refreshDeparture() {
    if (!this._departureEl) return;
    const chips = departureReadinessChips(this._ctx && this._ctx.state);
    this._departureEl.innerHTML = chips.map((chip) => departureChipHtml(chip)).join('');
    if (this._undockBtn) {
      const summary = departureReadinessSummary(chips);
      this._undockBtn.textContent = summary.label;
      this._undockBtn.title = summary.title;
      this._undockBtn.setAttribute('aria-label', summary.accessibleLabel);
      this._undockBtn.setAttribute('data-readiness', summary.state);
    }
  },

  _refreshOriginRail() {
    if (!this._originRailEl) return;
    const registry = this._ctx && this._ctx.registry;
    const origins = registry && typeof registry.get === 'function' && registry.get('careerOrigins');
    const view = origins && typeof origins.getOfferView === 'function'
      ? origins.getOfferView()
      : null;
    const offers = view && Array.isArray(view.offers) ? view.offers : [];
    const available = offers.filter((offer) => offer && (offer.canAccept || offer.canDecline));
    this._originRailEl.hidden = available.length === 0;
    if (!available.length) {
      this._originSelectedId = null;
      return;
    }
    if (!available.some((offer) => offer.careerId === this._originSelectedId)) {
      this._originSelectedId = available[0].careerId;
    }

    const choices = this._originRailEl.querySelector('.st-origin-choices');
    if (choices) {
      choices.innerHTML = offers.map((offer) => {
        const id = String(offer.careerId || '');
        const selected = id === this._originSelectedId;
        const inactive = !(offer.canAccept || offer.canDecline);
        const status = inactive ? String(offer.status || 'closed') : 'available';
        return '<button type="button" class="st-origin-choice' + (selected ? ' is-selected' : '')
          + (inactive ? ' is-resolved' : '') + '" data-origin-career="' + escapeHtml(id)
          + '" data-testid="career-origin-choice-' + escapeHtml(id) + '" aria-pressed="'
          + (selected ? 'true' : 'false') + '"><span class="st-origin-choice-name">'
          + escapeHtml(offer.title || id) + '</span><span class="st-origin-choice-status mono">'
          + escapeHtml(status) + '</span></button>';
      }).join('');
    }

    const selected = offers.find((offer) => offer.careerId === this._originSelectedId) || available[0];
    const detail = this._originRailEl.querySelector('.st-origin-detail');
    const accept = this._originRailEl.querySelector('[data-origin-action="accept"]');
    const decline = this._originRailEl.querySelector('[data-origin-action="decline"]');
    if (detail) detail.textContent = selected.line || 'Optional starter work.';
    if (accept) {
      accept.textContent = selected.acceptLabel || 'Start path';
      accept.disabled = !selected.canAccept;
      accept.setAttribute('aria-label', `${selected.acceptLabel || 'Start path'}: ${selected.title}`);
    }
    if (decline) {
      decline.textContent = selected.declineLabel || 'Not now';
      decline.disabled = !selected.canDecline;
      decline.setAttribute('aria-label', `${selected.declineLabel || 'Not now'}: ${selected.title}`);
    }
  },

  /**
   * Capture a stable focus token while focus is inside the ladder rail.
   * Returns null when focus is outside so repaint never steals it.
   * Token kinds: career | action | choice.
   */
  _captureLadderFocusToken() {
    if (typeof document === 'undefined' || !this._ladderRailEl) return null;
    const active = document.activeElement;
    if (!active || typeof this._ladderRailEl.contains !== 'function') return null;
    if (!this._ladderRailEl.contains(active)) return null;
    const career = active.closest && active.closest('[data-ladder-career]');
    if (career && this._ladderRailEl.contains(career)) {
      return { kind: 'career', id: career.getAttribute('data-ladder-career') || '' };
    }
    const choice = active.closest && active.closest('[data-ladder-choice]');
    if (choice && this._ladderRailEl.contains(choice)) {
      return { kind: 'choice', id: choice.getAttribute('data-ladder-choice') || '' };
    }
    const action = active.closest && active.closest('[data-ladder-action]');
    if (action && this._ladderRailEl.contains(action)) {
      return { kind: 'action', action: action.getAttribute('data-ladder-action') || '' };
    }
    return null;
  },

  /**
   * Restore focus to the enabled visible control matching a pre-repaint token.
   * No-op when token is null (focus was outside the rail) or control is gone/disabled.
   */
  _restoreLadderFocusToken(token) {
    if (!token || !this._ladderRailEl || this._ladderRailEl.hidden) return;
    if (typeof document === 'undefined') return;
    // If focus landed on a live control outside the rail during repaint, never steal it.
    const active = document.activeElement;
    if (active
      && active !== document.body
      && active !== document.documentElement
      && typeof this._ladderRailEl.contains === 'function'
      && !this._ladderRailEl.contains(active)
      && this._el
      && typeof this._el.contains === 'function'
      && this._el.contains(active)) {
      return;
    }
    let target = null;
    if (token.kind === 'career' && token.id) {
      // Prefer the post-repaint selected career when the prior focus was a branch control
      // (covers Arrow/Home/End selection that updates _ladderSelectedId before refresh).
      const preferId = this._ladderSelectedId || token.id;
      target = this._ladderRailEl.querySelector('[data-ladder-career="' + preferId + '"]')
        || this._ladderRailEl.querySelector('[data-ladder-career="' + token.id + '"]');
    } else if (token.kind === 'choice' && token.id) {
      target = this._ladderRailEl.querySelector(
        '[data-ladder-choice="' + token.id + '"]:not([disabled])',
      );
    } else if (token.kind === 'action' && token.action) {
      target = this._ladderRailEl.querySelector(
        '[data-ladder-action="' + token.action + '"]:not([disabled])',
      );
    }
    if (!target || target.disabled || target.hidden) return;
    if (typeof target.focus !== 'function') return;
    try { target.focus({ preventScroll: true }); } catch (_) {
      try { target.focus(); } catch (__) { /* ignore */ }
    }
  },

  /**
   * Professional ladder rail — pure presenter paint only.
   * Emits career:ladder:* intents; never writes state.careers.ladders or owner fields.
   */
  _refreshLadderRail() {
    if (!this._ladderRailEl) return;
    // Preserve focus across career/action/choice rebuilds when focus is inside the rail.
    const focusToken = this._captureLadderFocusToken();
    const ctx = this._ctx;
    const state = ctx && ctx.state;
    const registry = ctx && ctx.registry;
    let model;
    try {
      model = buildLadderRailModel(state, registry);
    } catch (err) {
      console.error('[stationHub] buildLadderRailModel failed', err);
      model = { nonBinding: true, visible: false, note: '', cards: [] };
    }
    this._ladderModel = model;
    const cards = model && Array.isArray(model.cards) ? model.cards : [];
    const visible = !!(model && model.visible && cards.length);
    this._ladderRailEl.hidden = !visible;
    // Keep reduced-motion flag in sync with accessibility root class.
    try {
      if (typeof document !== 'undefined' && document.documentElement) {
        if (document.documentElement.classList.contains('sf-reduce-motion')) {
          this._ladderRailEl.setAttribute('data-reduce-motion', '1');
        } else {
          this._ladderRailEl.removeAttribute('data-reduce-motion');
        }
      }
    } catch (_) { /* ignore */ }
    if (!visible) {
      this._ladderSelectedId = null;
      return;
    }

    const priority = { active: 0, recovering: 1, step_failed: 2, offered: 3, latent: 4, declined: 5, completed: 6 };
    if (!cards.some((c) => c && c.careerId === this._ladderSelectedId)) {
      const ranked = cards.slice().sort((a, b) =>
        (priority[a && a.status] ?? 9) - (priority[b && b.status] ?? 9));
      this._ladderSelectedId = ranked[0] && ranked[0].careerId;
    }

    const careersEl = this._ladderRailEl.querySelector('.st-ladder-careers');
    if (careersEl) {
      // All branch controls stay tabbable (tabindex=0) so gamepad D-pad focus traversal
      // can reach non-selected careers. Selected state is aria-pressed + is-selected only;
      // keyboard Arrow/Home/End still drive selection via _onLadderRailKeydown.
      careersEl.innerHTML = cards.map((card) => {
        const id = String(card.careerId || '');
        const selected = id === this._ladderSelectedId;
        const statusLabel = String(card.statusLabel || card.status || '');
        const a11y = (card.title || id) + ', ' + statusLabel
          + (card.progressLabel ? ', ' + card.progressLabel : '');
        return '<button type="button" class="st-ladder-choice' + (selected ? ' is-selected' : '')
          + (card.collapsed ? ' is-resolved' : '') + '" data-ladder-career="' + escapeHtml(id)
          + '" data-testid="career-ladder-choice-' + escapeHtml(id)
          + '" aria-pressed="' + (selected ? 'true' : 'false')
          + '" aria-label="' + escapeHtml(a11y)
          + '" tabindex="0">'
          + '<span class="st-ladder-choice-name">' + escapeHtml(card.title || id)
          + '</span><span class="st-ladder-choice-status mono">'
          + escapeHtml(statusLabel) + '</span></button>';
      }).join('');
    }

    const selected = cards.find((c) => c && c.careerId === this._ladderSelectedId) || cards[0];
    if (!selected) return;

    const detail = this._ladderRailEl.querySelector('.st-ladder-detail');
    const progress = this._ladderRailEl.querySelector('.st-ladder-progress');
    const objective = this._ladderRailEl.querySelector('.st-ladder-objective');
    const whereEl = this._ladderRailEl.querySelector('.st-ladder-where');
    const prereq = this._ladderRailEl.querySelector('.st-ladder-prereq');
    const fail = this._ladderRailEl.querySelector('.st-ladder-fail');
    const receipt = this._ladderRailEl.querySelector('.st-ladder-receipt');
    const choicesEl = this._ladderRailEl.querySelector('.st-ladder-choices');
    const accept = this._ladderRailEl.querySelector('[data-ladder-action="accept"]');
    const decline = this._ladderRailEl.querySelector('[data-ladder-action="decline"]');
    const recover = this._ladderRailEl.querySelector('[data-ladder-action="recover"]');
    const abandon = this._ladderRailEl.querySelector('[data-ladder-action="abandon"]');
    const mapBtn = this._ladderRailEl.querySelector('[data-ladder-action="openMap"]');
    const logBtn = this._ladderRailEl.querySelector('[data-ladder-action="missionLog"]');

    const place = ladderContactAndLocation(state, registry, selected);

    if (detail) {
      const lines = [];
      if (selected.nextAction) lines.push(selected.nextAction);
      if (selected.teach) lines.push(selected.teach);
      if (selected.attemptMultLabel) lines.push(selected.attemptMultLabel);
      detail.textContent = lines.join(' · ') || 'Optional professional path.';
    }
    if (progress) {
      const label = selected.progressLabel || '';
      progress.textContent = label;
      progress.hidden = !label;
      // Prefer truthful step index for a11y (step N of M), not only completed count.
      const stepOf = Number.isFinite(selected.stepIndex) && Number.isFinite(selected.stepsTotal)
        && selected.stepsTotal > 0
        ? Math.min(selected.stepsTotal, Math.max(1, (Number(selected.stepIndex) || 0) + 1))
        : null;
      if (label && stepOf != null) {
        progress.setAttribute('aria-label',
          'Progress: step ' + stepOf + ' of ' + selected.stepsTotal);
      } else if (label && Number.isFinite(selected.stepsDone) && Number.isFinite(selected.stepsTotal)) {
        progress.setAttribute('aria-label',
          'Progress: step ' + selected.stepsDone + ' of ' + selected.stepsTotal);
      } else if (label) {
        progress.setAttribute('aria-label', 'Progress: ' + label);
      } else {
        progress.removeAttribute('aria-label');
      }
    }
    if (objective) {
      objective.textContent = selected.objective || '';
      objective.hidden = !selected.objective;
    }
    if (whereEl) {
      const bits = [];
      if (place.contact) bits.push(place.contact);
      if (place.location) bits.push(place.location);
      const whereText = bits.join(' · ');
      whereEl.textContent = whereText;
      whereEl.hidden = !whereText;
      if (whereText) {
        whereEl.setAttribute('aria-label',
          (place.contact ? 'Contact ' + place.contact : '')
          + (place.contact && place.location ? ', ' : '')
          + (place.location ? 'Location ' + place.location : ''));
      } else {
        whereEl.removeAttribute('aria-label');
      }
    }
    if (prereq) {
      const show = !!(selected.prereqLabel && !selected.prereqMet);
      prereq.textContent = selected.prereqLabel || '';
      prereq.hidden = !show;
    }
    if (fail) {
      const failText = selected.failureLine
        || (selected.recovery && !selected.recovery.ready && selected.recovery.secondsLeft > 0
          ? ('Wait ' + selected.recovery.secondsLeft + 's, then retry.')
          : '');
      fail.textContent = failText || '';
      fail.hidden = !failText;
    }
    if (receipt) {
      receipt.textContent = selected.receiptLine || '';
      receipt.hidden = !selected.receiptLine;
    }
    if (choicesEl) {
      const showChoices = !!(selected.canChoose && Array.isArray(selected.choices) && selected.choices.length);
      choicesEl.hidden = !showChoices;
      if (showChoices) {
        const stepDef = ladderStepDefForCard(registry, selected);
        choicesEl.innerHTML = selected.choices.map((ch) => {
          const cid = String(ch.id || '');
          const enabled = ch.enabled !== false;
          const blocked = ch.blockedReason ? String(ch.blockedReason) : '';
          const preview = ladderChoiceConsequencePreview(stepDef, cid);
          const label = String(ch.label || cid);
          const buttonText = preview ? (label + ' · ' + preview) : label;
          const aria = label + ' for ' + (selected.stepTitle || selected.title || 'path')
            + (preview ? '. ' + preview : '')
            + (blocked ? '. ' + blocked : '');
          return '<button type="button" class="st-ladder-path-choice st-meta-btn" data-ladder-choice="'
            + escapeHtml(cid) + '" data-testid="career-ladder-path-choice-' + escapeHtml(cid)
            + '"' + (enabled ? '' : ' disabled')
            + ' aria-label="' + escapeHtml(aria) + '"'
            + (preview || blocked
              ? ' title="' + escapeHtml(preview || blocked) + '"'
              : '')
            + '>' + escapeHtml(buttonText) + '</button>';
        }).join('');
      } else {
        choicesEl.innerHTML = '';
      }
    }

    const title = selected.title || selected.careerId || 'path';
    const stepTitle = selected.stepTitle || title;
    if (accept) {
      accept.disabled = !selected.canAccept;
      accept.hidden = !(selected.canAccept || selected.status === 'latent' || selected.status === 'offered' || selected.status === 'declined');
      accept.setAttribute('aria-label', 'Start ' + title);
    }
    if (decline) {
      decline.disabled = !selected.canDecline;
      decline.hidden = !selected.canDecline && !selected.canAccept;
      decline.setAttribute('aria-label', 'Not now: ' + title);
    }
    if (recover) {
      recover.disabled = !selected.canRecover;
      recover.hidden = !(selected.status === 'recovering' || selected.status === 'step_failed' || selected.canRecover);
      recover.setAttribute('aria-label', 'Retry ' + stepTitle);
    }
    if (abandon) {
      abandon.disabled = !selected.canAbandon;
      abandon.hidden = !selected.canAbandon;
      abandon.setAttribute('aria-label', 'Abandon ' + title);
    }
    if (mapBtn) {
      const hasMap = !!(selected.mapAction);
      mapBtn.disabled = !hasMap;
      mapBtn.hidden = !hasMap;
      mapBtn.textContent = (selected.mapAction && selected.mapAction.label) || 'Map';
      mapBtn.setAttribute('aria-label', 'Open map for ' + stepTitle);
      if (hasMap && selected.mapAction.source) {
        mapBtn.setAttribute('data-map-source', selected.mapAction.source);
      } else {
        mapBtn.removeAttribute('data-map-source');
      }
    }
    if (logBtn) {
      logBtn.hidden = false;
      logBtn.setAttribute('aria-label', 'Open mission log for ' + title);
    }

    // Restore focus to the pre-repaint career/action/choice when it still exists.
    this._restoreLadderFocusToken(focusToken);
  },

  _ladderSelectedCard() {
    const cards = this._ladderModel && this._ladderModel.cards;
    if (!Array.isArray(cards) || !this._ladderSelectedId) return null;
    return cards.find((c) => c && c.careerId === this._ladderSelectedId) || null;
  },

  async _onLadderRailClick(ev) {
    const rail = this._ladderRailEl;
    const ctx = this._ctx;
    if (!rail || !ctx || !ctx.bus) return;

    const careerBtn = ev.target.closest('[data-ladder-career]');
    if (careerBtn && rail.contains(careerBtn)) {
      this._ladderSelectedId = careerBtn.getAttribute('data-ladder-career');
      this._refreshLadderRail();
      ctx.bus.emit('audio:cue', { id: 'ui_tab' });
      return;
    }

    const pathChoice = ev.target.closest('[data-ladder-choice]');
    if (pathChoice && rail.contains(pathChoice) && this._ladderSelectedId) {
      if (pathChoice.disabled) return;
      const choiceId = pathChoice.getAttribute('data-ladder-choice');
      if (!choiceId) return;
      ctx.bus.emit('career:ladder:choose', {
        careerId: this._ladderSelectedId,
        choiceId,
      });
      ctx.bus.emit('audio:cue', { id: 'ui_accept' });
      this._refreshLadderRail();
      return;
    }

    const action = ev.target.closest('[data-ladder-action]');
    if (!action || !rail.contains(action)) return;
    if (action.disabled) return;
    const verb = action.getAttribute('data-ladder-action');
    if (!verb) return;

    if (verb === 'openMap') {
      const card = this._ladderSelectedCard();
      if (card && card.mapAction) {
        openGalaxyMap(ctx, card.mapAction);
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
      }
      return;
    }
    if (verb === 'missionLog') {
      const mgr = getManager(ctx);
      let opened = false;
      if (mgr && typeof mgr.pushScreen === 'function') {
        mgr.pushScreen('missionLog');
        opened = true;
      } else if (ctx.bus) {
        ctx.bus.emit('ui:pushScreen', { id: 'missionLog' });
        opened = true;
      }
      if (opened) ctx.bus.emit('audio:cue', { id: 'ui_click' });
      return;
    }

    if (!this._ladderSelectedId) return;

    if (verb === 'abandon') {
      if (isConfirmOpen()) return;
      const card = this._ladderSelectedCard();
      const title = (card && card.title) || this._ladderSelectedId;
      const ok = await confirm({
        title: 'Abandon path?',
        body: 'Close ' + title + '? Other professional paths stay open.',
        confirmLabel: 'Abandon',
        cancelLabel: 'Keep path',
        danger: true,
      });
      if (!ok) return;
      ctx.bus.emit('career:ladder:abandon', { careerId: this._ladderSelectedId });
      ctx.bus.emit('audio:cue', { id: 'ui_click' });
      this._refreshLadderRail();
      return;
    }

    if (verb === 'accept') {
      ctx.bus.emit('career:ladder:accept', { careerId: this._ladderSelectedId });
      ctx.bus.emit('audio:cue', { id: 'ui_accept' });
      this._refreshLadderRail();
      return;
    }
    if (verb === 'decline') {
      ctx.bus.emit('career:ladder:decline', { careerId: this._ladderSelectedId });
      ctx.bus.emit('audio:cue', { id: 'ui_tab' });
      this._refreshLadderRail();
      return;
    }
    if (verb === 'recover') {
      ctx.bus.emit('career:ladder:recover', { careerId: this._ladderSelectedId });
      ctx.bus.emit('audio:cue', { id: 'ui_accept' });
      this._refreshLadderRail();
    }
  },

  _onLadderRailKeydown(ev) {
    const rail = this._ladderRailEl;
    if (!rail || rail.hidden || !rail.contains(ev.target)) return;

    const key = ev.key;
    // Escape must reach station exit owner — never trap.
    if (key === 'Escape') return;

    const careerButtons = Array.from(rail.querySelectorAll('[data-ladder-career]'));
    if (!careerButtons.length) return;

    // D-pad / arrows: roving career selection when focus is inside the rail.
    if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown'
      || key === 'Home' || key === 'End') {
      const onCareer = ev.target.closest('[data-ladder-career]');
      const onAction = ev.target.closest('[data-ladder-action], [data-ladder-choice]');
      if (onAction && !onCareer) return;

      const currentId = this._ladderSelectedId
        || (onCareer && onCareer.getAttribute('data-ladder-career'));
      let idx = Math.max(0, careerButtons.findIndex(
        (b) => b.getAttribute('data-ladder-career') === currentId));
      if (key === 'ArrowRight' || key === 'ArrowDown') idx = (idx + 1) % careerButtons.length;
      else if (key === 'ArrowLeft' || key === 'ArrowUp') idx = (idx - 1 + careerButtons.length) % careerButtons.length;
      else if (key === 'Home') idx = 0;
      else if (key === 'End') idx = careerButtons.length - 1;
      else return;

      ev.preventDefault();
      ev.stopPropagation();
      const next = careerButtons[idx];
      this._ladderSelectedId = next.getAttribute('data-ladder-career');
      this._refreshLadderRail();
      const focusBtn = rail.querySelector('[data-ladder-career="' + this._ladderSelectedId + '"]');
      if (focusBtn && typeof focusBtn.focus === 'function') {
        try { focusBtn.focus({ preventScroll: true }); } catch (_) {
          try { focusBtn.focus(); } catch (__) { /* ignore */ }
        }
      }
      if (this._ctx && this._ctx.bus) this._ctx.bus.emit('audio:cue', { id: 'ui_tab' });
      return;
    }

    // Enter/Space on a career button: primary enabled action (accept|recover|first choose).
    if (key === 'Enter' || key === ' ') {
      if (ev.target.closest('[data-ladder-action], [data-ladder-choice]')) return;
      if (!ev.target.closest('[data-ladder-career]') && ev.target !== rail) return;
      const card = this._ladderSelectedCard();
      if (!card) return;
      ev.preventDefault();
      ev.stopPropagation();
      let primary = null;
      if (card.canAccept) {
        primary = rail.querySelector('[data-ladder-action="accept"]');
      } else if (card.canRecover) {
        primary = rail.querySelector('[data-ladder-action="recover"]');
      } else if (card.canChoose) {
        primary = rail.querySelector('[data-ladder-choice]:not([disabled])');
      }
      if (primary && !primary.disabled) {
        primary.click();
      }
    }
  },

  _refreshHandoff() {
    if (!this._handoffEl) return;
    const state = this._ctx && this._ctx.state;
    const visible = !this._handoffDismissed && firstDockHandoffVisible(state, this._stationId);
    this._handoffEl.hidden = !visible;
    if (!visible) return;
    const stepsEl = this._handoffEl.querySelector('.st-handoff-steps');
    if (stepsEl) {
      const active = document.activeElement;
      const focusedTab = active && stepsEl.contains(active) && active.getAttribute('data-handoff-tab');
      stepsEl.innerHTML = firstDockHandoffSteps(state).map((step) => handoffStepHtml(step)).join('');
      if (focusedTab) {
        const replacement = stepsEl.querySelector('[data-handoff-tab="' + focusedTab + '"]');
        if (replacement) replacement.focus({ preventScroll: true });
      }
    }
  },

  /** Abort an in-progress Undock hold charge. @returns {boolean} true if a charge was aborted */
  _abortUndockCharge(opts = {}) {
    if (!this._undockChargeTimer) {
      if (this._undockBtn) this._undockBtn.classList.remove('charging');
      return false;
    }
    clearTimeout(this._undockChargeTimer);
    this._undockChargeTimer = null;
    if (this._undockBtn) this._undockBtn.classList.remove('charging');
    if (opts.abortCue !== false && this._ctx && this._ctx.bus) {
      this._ctx.bus.emit('audio:cue', { id: 'ui_charge_abort' });
    }
    return true;
  },

  /**
   * Clear station-local transient UI without undocking.
   * @returns {boolean} true if something was cleaned (caller should stay docked)
   */
  _clearStationTransient() {
    let cleared = false;
    if (this._abortUndockCharge({ abortCue: true })) cleared = true;
    if (this._inspectorEl && !this._inspectorEl.classList.contains('is-collapsed')) {
      if (typeof this._setInspectorOpen === 'function') this._setInspectorOpen(false);
      else {
        this._inspectorEl.classList.add('is-collapsed');
        this._inspectorEl.setAttribute('aria-hidden', 'true');
      }
      cleared = true;
    }
    if (typeof document !== 'undefined') {
      const active = document.activeElement;
      const root = this._el;
      if (active && root && typeof root.contains === 'function' && root.contains(active)) {
        const tag = active.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || active.isContentEditable) {
          try { active.blur(); } catch (_) { /* ignore */ }
          cleared = true;
        }
      }
    }
    return cleared;
  },

  /**
   * Centralized station-exit request owner.
   * - implicit (Esc/B/E/backdrop): clean transient first; if already clean, confirm then undock
   * - explicit (Undock control): hold completion is deliberate; RISK without hold confirms
   * @param {{ intent?: string, source?: string, opener?: Element|null, held?: boolean }} opts
   * @returns {Promise<{ action: string }>}
   */
  async requestStationExit(opts = {}) {
    if (this._exitInFlight || isConfirmOpen()) return { action: 'busy' };
    const ctx = this._ctx;
    if (!ctx || !ctx.state) return { action: 'noop' };
    if (!ctx.state.ui || ctx.state.ui.docked !== true) return { action: 'not-docked' };

    const intent = opts.intent === 'explicit' ? 'explicit' : 'implicit';
    const source = opts.source || intent;
    const held = !!opts.held;
    const opener = opts.opener
      || (typeof document !== 'undefined' ? document.activeElement : null)
      || this._undockBtn;

    if (intent === 'implicit') {
      if (this._clearStationTransient()) {
        // Esc/B/E already cue ui_back in input; backdrop has no cue of its own.
        if (ctx.bus && source === 'backdrop') ctx.bus.emit('audio:cue', { id: 'ui_back' });
        return { action: 'cleared' };
      }
    }

    const chips = departureReadinessChips(ctx.state);
    const summary = departureReadinessSummary(chips);
    const needsConfirm = stationExitNeedsConfirm(intent, summary.state, held);

    if (needsConfirm) {
      this._exitInFlight = true;
      try {
        if (opener && typeof opener.focus === 'function') {
          try { opener.focus({ preventScroll: true }); } catch (_) {
            try { opener.focus(); } catch (__) { /* ignore */ }
          }
        }
        const risk = summary.state === 'risk';
        const ok = await confirm({
          title: intent === 'implicit'
            ? 'Leave station?'
            : (risk ? 'Launch risk' : 'Leave station?'),
          body: intent === 'implicit'
            ? 'Undock and return to flight. Stay docked to keep trading and services.'
            : (summary.title || 'Departure Check reports risk. Undock anyway?'),
          confirmLabel: 'Undock',
          cancelLabel: 'Stay',
          danger: intent === 'explicit' && risk,
        });
        if (!ok) return { action: 'cancelled' };
      } finally {
        this._exitInFlight = false;
      }
    }

    this._abortUndockCharge({ abortCue: false });
    if (ctx.bus && intent === 'explicit' && !held) {
      ctx.bus.emit('audio:cue', { id: 'ui_undock' });
    }
    this._commitUndock(source);
    return { action: 'undocked' };
  },

  _commitUndock(source) {
    const bus = this._ctx && this._ctx.bus;
    if (!bus) return;
    commitStationUndock(bus, { source: source || 'station' });
  },

  /** Called by screenManager when this screen becomes the top of the stack. */
  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    installStationExitGate(ctx);
    setStationExitOwner(this);
    const oldId = this._stationId;
    this._resolveStation();
    if (this._stationId && this._stationId !== oldId) {
      this._triggerArrivalEdgeTrace();
      this._playArrivalBroadcast();
    }
    this._refreshTopbar();
    this._refreshGraffiti();
    this._refreshRailServiceStatus();
    this._refreshPurpose();
    this._refreshDeparture();
    this._refreshOriginRail();
    this._refreshLadderRail();
    this._refreshHandoff();
    this._refreshSchematicAndNodes();
    this._refreshEconAndReadiness();
    // Command-deck effects resume on show; the scanner-grid "console acquisition" sweep fires ONLY on
    // a genuine dock transition (returning from the map while still docked must not replay it).
    this._setEffectsActive(true);
    if (this._stationId && this._stationId !== this._lastRevealStationId) {
      this._lastRevealStationId = this._stationId;
      this._revealScan();
    }
    // restore the last active tab (or default 'market')
    const tab = this._activePanelId();
    this.setTab(tab, { focusRail: true }); // also refreshes the active panel via onShow
  },

  onHide() {
    // Park every effect's rAF while the screen is hidden (frame-sleep contract).
    this._abortUndockCharge({ abortCue: false });
    this._setEffectsActive(false);
    this._clearScheduledActiveRefresh();
    this._setContentBusy(false);
    const p = this._panels && this._panels[this._activePanelId()];
    if (p && typeof p.onHide === 'function') {
      try { p.onHide(); } catch (e) { console.error(e); }
    }
  },

  /** Generic refresh (data-event driven). Refreshes only the active panel for cheapness. */
  refresh(ctx, options = {}) {
    if (ctx) this._ctx = ctx;
    if (!this._el) return;
    if (options.periodic) {
      this._refreshDeparture();
      this._refreshEconAndReadiness();
      return;
    }
    this._refreshTopbar();
    this._refreshGraffiti();
    this._refreshRailServiceStatus();
    this._refreshPurpose();
    this._refreshDeparture();
    this._refreshOriginRail();
    this._refreshLadderRail();
    this._refreshHandoff();
    this._refreshSchematicAndNodes();
    this._refreshEconAndReadiness();
    this._updateInspector();
    this._scheduleActiveRefresh(false);
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
    const refreshHandoff = () => { if (this._visible()) this._refreshHandoff(); };
    const refreshOrigins = () => { if (this._visible()) this._refreshOriginRail(); };
    const refreshLadders = () => { if (this._visible()) this._refreshLadderRail(); };
    // market-affecting
    bus.on('economy:tradeCompleted', onActive(['market', 'services', 'hold']));
    bus.on('economy:tradeCompleted', refreshHandoff);
    bus.on('economy:tradeCompleted', refreshOrigins);
    bus.on('economy:tick', onActive(['market', 'hold']));
    bus.on('cargo:changed', onActive(['market', 'outfit', 'services', 'hold']));
    bus.on('cargo:changed', refreshDeparture);
    bus.on('cargo:changed', refreshHandoff);
    bus.on('credits:changed', onActive(['market', 'shipyard', 'outfit', 'services', 'hold']));
    bus.on('credits:changed', refreshDeparture);
    // ship/outfitting-affecting
    bus.on('ship:statsChanged', onActive(['outfit', 'shipyard', 'services']));
    bus.on('ship:statsChanged', refreshDeparture);
    bus.on('ship:statsChanged', refreshHandoff);
    bus.on('ship:purchased', onActive(['shipyard', 'outfit']));
    bus.on('ship:sold', onActive(['shipyard', 'outfit']));
    bus.on('module:equipped', onActive(['outfit']));
    bus.on('module:unequipped', onActive(['outfit']));
    bus.on('module:purchased', onActive(['outfit']));
    bus.on('tech:researched', onActive(['shipyard', 'outfit']));
    // services-affecting
    bus.on('fuel:changed', onActive(['services']));
    bus.on('fuel:changed', refreshDeparture);
    bus.on('fuel:changed', refreshHandoff);
    bus.on('nav:waypoint', refreshDeparture);
    bus.on('nav:waypoint', refreshHandoff);
    // factions
    bus.on('faction:repChanged', onActive(['factions']));
    // missions
    bus.on('mission:updated', () => {
      if (!this._visible()) return;
      if (this._activePanelId() === 'missions') this._refreshMissions();
      this._refreshDeparture();
      this._refreshHandoff();
      this._refreshOriginRail();
      this._refreshLadderRail();
    });
    bus.on('mission:accepted', (payload) => {
      if (!this._visible()) return;
      this._setMissionAcceptedStatus(payload && payload.missionId);
      if (this._activePanelId() === 'missions') this._refreshMissions();
      this._refreshDeparture();
      this._refreshHandoff();
      this._refreshOriginRail();
      this._refreshLadderRail();
    });
    bus.on('mission:completed', () => { this._refreshMissionAcceptedStatus(); refreshDeparture(); refreshHandoff(); refreshOrigins(); refreshLadders(); });
    bus.on('mission:failed', () => { this._refreshMissionAcceptedStatus(); refreshDeparture(); refreshHandoff(); refreshOrigins(); refreshLadders(); });
    bus.on('mission:expired', () => { this._refreshMissionAcceptedStatus(); refreshDeparture(); refreshHandoff(); refreshLadders(); });
    bus.on('career:origins:offered', refreshOrigins);
    bus.on('career:origins:accepted', refreshOrigins);
    bus.on('career:origins:declined', refreshOrigins);
    bus.on('career:origins:abandoned', refreshOrigins);
    bus.on('career:origin:completed', () => { refreshOrigins(); refreshLadders(); });
    bus.on('hunterOrigin:completed', refreshOrigins);
    bus.on('origin:prospector:completed', refreshOrigins);
    // Ladder system → rail refresh (CL-UI-02 contract subscribe_refresh)
    bus.on('career:ladder:offered', refreshLadders);
    bus.on('career:ladder:stepActive', refreshLadders);
    bus.on('career:ladder:stepDone', refreshLadders);
    bus.on('career:ladder:stepFailed', refreshLadders);
    bus.on('career:ladder:stepRecovered', refreshLadders);
    bus.on('career:ladder:completed', refreshLadders);
    bus.on('career:ladder:progress', refreshLadders);
    bus.on('career:ladder:choiceResolved', refreshLadders);
    bus.on('dock:docked', refreshLadders);
    bus.on('economy:eventStarted', onActive(['market']));
    bus.on('economy:eventEnded', onActive(['market']));
    // Implicit Back (Esc/B/E via input gate, backdrop via screenManager) and any external
    // station:exitRequest land here — one owner for clean→confirm→committed undock.
    bus.on('station:exitRequest', (payload) => {
      this.requestStationExit(payload || {});
    });
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

function signedRep(value) {
  const n = Math.round(Number(value) || 0);
  return (n > 0 ? '+' : '') + n;
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

/** Read-only ladder definition for a presenter card (never mutates state). */
function ladderDefinitionFor(registry, careerId) {
  if (!careerId || !registry || typeof registry.get !== 'function') return null;
  try {
    const sys = registry.get('careerLadders');
    if (sys && typeof sys.getDefinition === 'function') {
      return sys.getDefinition(careerId) || null;
    }
  } catch (_) { /* ignore */ }
  return null;
}

function ladderStepDefForCard(registry, card) {
  if (!card) return null;
  const def = ladderDefinitionFor(registry, card.careerId);
  if (!def || !Array.isArray(def.steps)) return null;
  if (card.stepId) {
    const byId = def.steps.find((s) => s && s.id === card.stepId);
    if (byId) return byId;
  }
  if (Number.isFinite(card.stepIndex) && def.steps[card.stepIndex]) {
    return def.steps[card.stepIndex];
  }
  return def.steps[0] || null;
}

/**
 * Named contact + location for the ladder rail (truthful reads only).
 * Contact: linked mission contact/client, else desk/step title, else faction short name.
 * Location: mapAction station/sector or linked mission destination names.
 */
function ladderContactAndLocation(state, registry, card) {
  const out = { contact: null, location: null };
  if (!card) return out;

  const linkedId = card.linkedMissionId || null;
  let linked = null;
  if (linkedId && state && state.missions && Array.isArray(state.missions.active)) {
    linked = state.missions.active.find((m) => m && String(m.id) === String(linkedId)) || null;
  }

  // Contact — never invent lore; only names already present on mission/def/faction meta.
  if (linked) {
    const named = linked.contactName || linked.giverName || linked.clientName || null;
    if (named && String(named).trim()) out.contact = String(named).trim();
    else {
      const fac = linked.factionId ? FACTION_BY_ID.get(linked.factionId) : null;
      if (fac) out.contact = fac.short || fac.name || null;
    }
  }
  if (!out.contact) {
    const stepDef = ladderStepDefForCard(registry, card);
    const params = stepDef && stepDef.params;
    const factionId = (params && params.factionId)
      || (stepDef && stepDef.factionId)
      || null;
    if (factionId) {
      const fac = FACTION_BY_ID.get(factionId);
      if (fac) out.contact = fac.short || fac.name || null;
    }
    // Desk-style step titles double as the contact desk when no person is named.
    if (!out.contact && card.stepTitle) {
      out.contact = String(card.stepTitle);
    } else if (!out.contact && card.title) {
      out.contact = String(card.title);
    }
  }

  // Location — map handoff first, then linked mission dest, then step params.
  const map = card.mapAction || null;
  const stationId = (map && map.stationId)
    || (linked && linked.destStationId)
    || null;
  const sectorId = (map && map.sectorId)
    || (linked && (linked.destSectorId || linked.sectorId))
    || null;
  const station = stationId ? STATION_BY_ID.get(stationId) : null;
  const sector = sectorId ? SECTOR_BY_ID.get(sectorId) : null;
  const stationName = (station && station.name)
    || (linked && (linked.destName || linked.destStationName))
    || (stationId ? prettyId(stationId) : null);
  const sectorName = (sector && sector.name)
    || (linked && linked.destSectorName)
    || (sectorId ? prettyId(sectorId) : null);
  if (stationName && sectorName && stationName !== sectorName) {
    out.location = stationName + ' · ' + sectorName;
  } else {
    out.location = stationName || sectorName || null;
  }
  return out;
}

/**
 * Copy-safe consequence preview from registered choice intents (credits/rep only).
 * Never dumps debug payloads or heat/cargo writes.
 */
function ladderChoiceConsequencePreview(stepDef, choiceId) {
  if (!stepDef || !Array.isArray(stepDef.choices) || !choiceId) return '';
  const ch = stepDef.choices.find((c) => c && c.id === choiceId);
  if (!ch) return '';
  // Prefer an authored short preview string if present.
  if (typeof ch.preview === 'string' && ch.preview.trim()) return ch.preview.trim();
  if (typeof ch.consequencePreview === 'string' && ch.consequencePreview.trim()) {
    return ch.consequencePreview.trim();
  }
  const cons = Array.isArray(ch.consequences) ? ch.consequences : [];
  if (!cons.length) return '';
  const bits = [];
  let cr = 0;
  let crCharge = 0;
  for (const intent of cons) {
    if (!intent || typeof intent !== 'object') continue;
    const ev = String(intent.event || '');
    const p = intent.payload || {};
    if (ev === 'economy:grantCredits' && Number.isFinite(p.amount) && p.amount > 0) {
      cr += Math.round(p.amount);
    } else if (ev === 'economy:chargeCredits' && Number.isFinite(p.amount) && p.amount > 0) {
      crCharge += Math.round(p.amount);
    } else if (ev === 'faction:repDelta' && Number.isFinite(p.delta) && p.factionId) {
      const fac = FACTION_BY_ID.get(p.factionId);
      const name = (fac && (fac.short || fac.name)) || prettyId(p.factionId);
      const sign = p.delta > 0 ? '+' : '';
      bits.push(name + ' ' + sign + Math.round(p.delta));
    }
  }
  if (cr > 0) bits.unshift('+' + cr.toLocaleString('en-US') + ' cr');
  if (crCharge > 0) bits.unshift('−' + crCharge.toLocaleString('en-US') + ' cr');
  // Cap at two chips so the strip stays a strip, not a prose wall.
  return bits.slice(0, 2).join(' · ');
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
      return 'Undock, follow the tracked objective, and check Mission Log (' + BINDINGS.missionLog.label + ') for progress.';
  }
}

function factionNameOf(fid) {
  const f = fid ? FACTION_BY_ID.get(fid) : null;
  return (f && f.name) || 'Independent';
}

function factionColorOf(fid) {
  const f = fid ? FACTION_BY_ID.get(fid) : null;
  return (f && f.color) || '#d7e6ff';
}

// ---- scoped CSS (injected once; uses theme vars from styles/ui.css) --------------------------
const STATION_CSS = `
/* Magic UI Animations */
@keyframes sf-signal-acquire { 0% { opacity: 0; filter: blur(4px); } 100% { opacity: 1; filter: blur(0); } }
.acquiring { animation: sf-signal-acquire .4s var(--ease) forwards; color: #ffca58; }
.st-undock { transition: background-color 0.2s, box-shadow 0.2s; position: relative; overflow: hidden; }
.st-undock::after { content: ''; position: absolute; left: 0; bottom: 0; height: 2px; width: 0%; background: #ffca58; transition: none; }
.st-undock.charging::after { width: 100%; transition: width 0.6s linear; }
.st-undock.abort::after { width: 0%; transition: width 0.2s ease-out; }
@keyframes channel-wipe { 0% { clip-path: inset(0 100% 0 0); filter: brightness(2) contrast(1.5); } 100% { clip-path: inset(0 0 0 0); filter: brightness(1) contrast(1); } }
.switching { animation: channel-wipe .13s cubic-bezier(0.1, 0.9, 0.2, 1) forwards; }
@keyframes market-tick { 0% { background-color: rgba(255, 202, 88, 0.15); border-color: rgba(255, 202, 88, 0.4); } 100% { background-color: transparent; border-color: transparent; } }
.st-card-spark-wrap { border: 1px solid transparent; border-radius: 4px; transition: border-color 0.5s; }
.st-card-spark-wrap.tick { animation: market-tick .5s ease-out; }
.trend-up { color: #f2a83b; font-size: 0.8em; margin-left: 4px; }
.trend-down { color: #8fb0c0; font-size: 0.8em; margin-left: 4px; }

/* Station type accents (without arbitrary hue drifts, strictly themed) */
.st-hub {
  --st-accent: #39d0ff; /* default cyan */
  --st-glow: rgba(57, 208, 255, 0.15);
}
.st-hub--military {
  --st-accent: #ff5c5c; /* red */
  --st-glow: rgba(255, 92, 92, 0.15);
}
.st-hub--mining, .st-hub--refinery {
  --st-accent: #ffb35c; /* amber/rust */
  --st-glow: rgba(255, 179, 92, 0.15);
}
.st-hub--blackmarket {
  --st-accent: #8d66ff; /* violet */
  --st-glow: rgba(141, 102, 255, 0.15);
}

/* Default framed panel (legacy). Desk mode below takes the full play surface. */
.st-hub { width: min(1560px, 96vw); height: min(920px, 95vh); display: flex; flex-direction: column;
  pointer-events: auto; overflow: hidden; animation: sf-fadein .3s var(--ease) both;
  background:
    radial-gradient(120% 80% at 82% -10%, color-mix(in srgb, var(--st-accent) 7%, transparent), transparent 60%),
    linear-gradient(180deg, rgba(15,20,33,0.95), rgba(10,14,24,0.97));
  border: 1px solid var(--st-line);
  border-radius: 18px;
  box-shadow: 0 44px 130px -36px rgba(0,0,0,0.85), 0 0 0 1px rgba(255,255,255,0.02) inset; }
/* Economy desk: own the viewport. Content is the game; chrome is secondary. */
.st-hub.st-hub--desk {
  width: 100%; height: 100%; max-width: none; max-height: none;
  border-radius: 0; border: none;
  box-shadow: none;
}
.st-topbar { display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 16px; border-bottom: 1px solid var(--panel-edge); flex: none;
  background: linear-gradient(180deg, rgba(14,24,42,.7), rgba(8,14,26,.5)); }
.st-topbar-l { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
.st-topbar-r { display: flex; align-items: center; gap: 8px; flex: none; }
.st-station-name { font-size: var(--t-xl); letter-spacing: .02em; color: #fff; font-weight: 600;
  text-shadow: 0 0 16px var(--st-glow); }
.st-station-fac { color: var(--st-accent); font-size: var(--t-xs);
  letter-spacing: .1em; text-transform: uppercase; padding: 2px 10px; border-radius: var(--r-pill);
  border: 1px solid rgba(57,208,255,.3); background: rgba(57,208,255,.08); white-space: nowrap; }
.st-inspector-toggle { font: inherit; font-size: .72rem; font-weight: 600; letter-spacing: .04em;
  padding: 7px 12px; border-radius: 8px; cursor: pointer; color: var(--ink-dim);
  border: 1px solid var(--st-line); background: rgba(255,255,255,.03); }
.st-inspector-toggle:hover, .st-inspector-toggle.is-active {
  color: var(--ink); border-color: color-mix(in srgb, var(--st-accent) 45%, transparent);
  background: color-mix(in srgb, var(--st-accent) 12%, transparent); }
.st-undock { border-color: var(--st-accent); color: var(--st-accent); letter-spacing: .04em; font-weight: 600;
  text-transform: none; }
.st-undock[data-readiness="ready"] { border-color: var(--good); color: var(--good); }
.st-undock[data-readiness="check"] { border-color: var(--warn); color: var(--warn); }
.st-undock[data-readiness="risk"] { border-color: var(--danger); color: var(--danger); }
/* airlock graffiti strip */
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

/* Keep .st-purpose styled cleanly inside the inspector, hiding native borders */
.st-purpose {
  display: flex; flex-direction: column; gap: 4px; padding: 12px;
  background: rgba(8,14,26,.4); border-top: 1px solid var(--panel-edge);
}
.st-purpose-main { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.st-purpose-type { color: var(--st-accent); font-size: .68rem; letter-spacing: .14em; text-transform: uppercase; flex: none; }
.st-purpose-copy { color: var(--ink); font-size: .78rem; line-height: 1.35; }
.st-purpose-sub { display: flex; flex-direction: column; gap: 4px; color: var(--ink-mute); font-size: .72rem; line-height: 1.35; margin-top: 4px; }
.st-purpose-tab { color: var(--ink-dim); }

.st-origin-rail { display: grid; grid-template-columns: minmax(150px, .7fr) minmax(300px, 1.4fr) minmax(290px, 1fr);
  align-items: center; gap: 10px; padding: 8px 16px; border-bottom: 1px solid rgba(57,208,255,.22);
  background: linear-gradient(90deg, rgba(57,208,255,.07), rgba(8,15,25,.2)); flex: none; }
.st-origin-rail[hidden] { display: none; }
.st-origin-head { display: grid; gap: 2px; min-width: 0; }
.st-origin-kicker { color: var(--st-accent); font-size: .62rem; letter-spacing: .15em; text-transform: uppercase; }
.st-origin-note { color: var(--ink-dim); font-size: .69rem; line-height: 1.3; }
.st-origin-choices { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.st-origin-choice { display: flex; justify-content: space-between; align-items: center; gap: 5px; min-width: 0;
  padding: 7px 9px; border: 1px solid rgba(140,174,202,.24); border-radius: 4px;
  color: var(--ink-dim); background: rgba(6,13,22,.52); text-align: left; cursor: pointer; }
.st-origin-choice:hover { color: var(--ink); border-color: rgba(57,208,255,.48); }
.st-origin-choice:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.st-origin-choice.is-selected { color: var(--ink); border-color: var(--st-accent); background: rgba(57,208,255,.1); }
.st-origin-choice.is-resolved { opacity: .56; }
.st-origin-choice-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .76rem; font-weight: 700; }
.st-origin-choice-status { flex: none; color: var(--ink-mute); font-size: .53rem; letter-spacing: .08em; text-transform: uppercase; }
.st-origin-action { display: grid; grid-template-columns: minmax(120px, 1fr) auto auto; align-items: center; gap: 6px; min-width: 0; }
.st-origin-detail { color: var(--ink-dim); font-size: .69rem; line-height: 1.25; overflow: hidden;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; white-space: normal; }
.st-origin-action .st-meta-btn { padding: 6px 9px; white-space: nowrap; }
.st-origin-action .st-meta-btn:disabled { opacity: .4; cursor: default; }
/* Professional ladder rail (CL-UI-02): compact strip; no visor/portrait/idle animation */
.st-ladder-rail { display: grid; grid-template-columns: minmax(150px, .7fr) minmax(260px, 1.2fr) minmax(320px, 1.2fr);
  align-items: start; gap: 10px; padding: 8px 16px; border-bottom: 1px solid rgba(57,208,255,.18);
  background: linear-gradient(90deg, rgba(57,208,255,.05), rgba(8,15,25,.18)); flex: none; }
.st-ladder-rail[hidden] { display: none; }
.st-ladder-head { display: grid; gap: 2px; min-width: 0; }
.st-ladder-kicker { color: var(--st-accent); font-size: .62rem; letter-spacing: .15em; text-transform: uppercase; }
.st-ladder-note { color: var(--ink-dim); font-size: .69rem; line-height: 1.3; }
.st-ladder-careers { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
.st-ladder-choice { display: flex; justify-content: space-between; align-items: center; gap: 5px; min-width: 0;
  min-height: 44px; padding: 10px 9px; border: 1px solid rgba(140,174,202,.24); border-radius: 4px;
  color: var(--ink-dim); background: rgba(6,13,22,.52); text-align: left; cursor: pointer; }
.st-ladder-choice:hover { color: var(--ink); border-color: rgba(57,208,255,.48); }
.st-ladder-choice:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.st-ladder-choice.is-selected { color: var(--ink); border-color: var(--st-accent); background: rgba(57,208,255,.1); }
.st-ladder-choice.is-resolved { opacity: .56; }
.st-ladder-choice-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .76rem; font-weight: 700; }
.st-ladder-choice-status { flex: none; color: var(--ink-mute); font-size: .53rem; letter-spacing: .08em; text-transform: uppercase; }
.st-ladder-panel { display: grid; gap: 4px; min-width: 0; }
.st-ladder-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; min-width: 0; }
.st-ladder-detail { color: var(--ink-dim); font-size: .69rem; line-height: 1.25; flex: 1 1 120px; min-width: 0;
  overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.st-ladder-progress { color: var(--ink-mute); font-size: .58rem; letter-spacing: .08em; text-transform: uppercase; flex: none; }
.st-ladder-objective, .st-ladder-where, .st-ladder-prereq, .st-ladder-fail, .st-ladder-receipt {
  margin: 0; font-size: .69rem; line-height: 1.3; color: var(--ink-dim); }
.st-ladder-objective { color: var(--ink); }
.st-ladder-where { color: var(--ink-mute); letter-spacing: .04em; }
.st-ladder-prereq { color: var(--ink-mute); }
.st-ladder-fail { color: var(--warn, #ffc64d); }
.st-ladder-receipt { color: var(--ink-mute); }
.st-ladder-choices { display: flex; flex-wrap: wrap; gap: 6px; }
.st-ladder-choices[hidden], .st-ladder-where[hidden], .st-ladder-prereq[hidden], .st-ladder-fail[hidden],
.st-ladder-receipt[hidden], .st-ladder-objective[hidden], .st-ladder-progress[hidden] { display: none; }
.st-ladder-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.st-ladder-actions .st-meta-btn, .st-ladder-path-choice {
  min-height: 44px; min-width: 44px; padding: 8px 12px; white-space: nowrap; }
.st-ladder-actions .st-meta-btn:disabled, .st-ladder-path-choice:disabled { opacity: .4; cursor: default; }
.st-ladder-actions .st-meta-btn:focus-visible, .st-ladder-path-choice:focus-visible {
  outline: 2px solid var(--accent); outline-offset: 2px; }
.st-ladder-recover:not(:disabled) { color: var(--warn, #ffc64d); border-color: rgba(255,198,77,.4); }
.st-ladder-abandon:not(:disabled) { color: var(--danger, #ff5470); border-color: rgba(255,84,112,.35); }
.st-handoff { display: grid; gap: 6px; padding: 8px 16px; border-bottom: 1px solid rgba(57,208,255,.18); flex: none; }
.st-handoff-head { display: flex; flex-direction: column; gap: 1px; }
.st-handoff-label { color: var(--st-accent); font-size: .58rem; letter-spacing: .16em; text-transform: uppercase; }
.st-handoff-copy { color: var(--ink-dim); font-size: .7rem; line-height: 1.3; }
.st-handoff-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(148px, 1fr)); gap: 6px; }
.st-handoff-step { display: grid; grid-template-areas: "label" "title" "copy"; gap: 1px; align-content: start;
  text-align: left; padding: 6px 9px; border: 1px solid var(--panel-edge); border-radius: 4px;
  background: rgba(10,18,32,.42); color: var(--ink-dim); font: inherit; cursor: pointer; }
button.st-handoff-step:hover { background: rgba(57,208,255,.09); color: var(--ink); }
button.st-handoff-step:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.st-handoff-step-label { grid-area: label; align-self: center; color: var(--ink-mute); font-size: .6rem; letter-spacing: .1em; text-transform: uppercase; }
.st-handoff-step-title { grid-area: title; min-width: 0; color: var(--ink); font-size: .78rem; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-handoff-step-copy { grid-area: copy; color: var(--ink-dim); font-size: .7rem; line-height: 1.3; }
.st-handoff-step--ok { border-color: rgba(98,224,138,.34); }
.st-handoff-step--ok .st-handoff-step-label { color: var(--good); }
.st-handoff-step--warn { border-color: rgba(255,198,77,.34); }
.st-handoff-step--warn .st-handoff-step-label { color: var(--warn); }
.st-handoff-step--bad { border-color: rgba(255,84,112,.38); }
.st-handoff-step--bad .st-handoff-step-label { color: var(--danger); }
.st-handoff-step.is-done { background: rgba(98,224,138,.06); }
.st-undock:hover { background: var(--grad-accent); color: #04121a; box-shadow: 0 0 16px rgba(57,208,255,.4); }
.st-undock[data-readiness="ready"]:hover { background: var(--good); color: #021008; box-shadow: 0 0 16px rgba(98,224,138,.34); }
.st-undock[data-readiness="check"]:hover { background: var(--warn); color: #1a1000; box-shadow: 0 0 16px rgba(255,198,77,.28); }
.st-undock[data-readiness="risk"]:hover { background: var(--danger); color: #21040a; box-shadow: 0 0 16px rgba(255,84,112,.3); }
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
/* Left rail: full tab names + full service status always readable (this is a permanent nav, not a
   tooltip-dependent chrome strip). Two-line stack; no ellipsis on label or service copy. */
.st-rail { width: 220px; flex: none; display: flex; flex-direction: column; gap: 3px; padding: var(--sp-3) var(--sp-2);
  border-right: 1px solid var(--panel-edge); background: rgba(6,10,20,.55); overflow-x: hidden; overflow-y: auto; }
.st-tab { display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: start; column-gap: 10px; row-gap: 0;
  text-align: left; background: transparent; border: 1px solid transparent; border-radius: var(--r-md);
  padding: 9px 12px; color: var(--ink-dim); transition: all var(--dur) var(--ease); width: 100%; box-sizing: border-box; }
.st-tab:hover { color: var(--ink); background: rgba(57,208,255,.06); }
.st-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; color: var(--ink);
  background: rgba(57,208,255,.08); }
.st-tab.active { color: #fff; background: linear-gradient(90deg, rgba(57,208,255,.18), rgba(57,208,255,.04));
  border-color: rgba(57,208,255,.35); box-shadow: inset 3px 0 0 var(--accent), 0 0 12px rgba(57,208,255,.12); }
.st-tab-icon { width: 18px; height: 18px; margin-top: 2px; opacity: .85; flex: none; }
.st-tab-copy { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; }
.st-tab-label { letter-spacing: .04em; font-size: .92rem; text-transform: uppercase;
  white-space: normal; overflow: visible; text-overflow: clip; line-height: 1.2; }
.st-tab-service { margin-left: 0; max-width: none; width: 100%;
  overflow: visible; text-overflow: clip; white-space: normal;
  font-size: .58rem; letter-spacing: .08em; text-transform: uppercase; color: var(--ink-mute);
  opacity: .9; line-height: 1.3; }
.st-tab-service[hidden] { display: none; }
.st-tab[data-service-status="available"] .st-tab-service { color: var(--accent-2); }
.st-tab[data-service-status="unavailable"] { opacity: .88; }
.st-tab[data-service-status="unavailable"] .st-tab-service { color: var(--warn); }
.st-tab[data-service-status="unavailable"].active { opacity: 1; border-color: rgba(255,198,77,.35);
  box-shadow: inset 3px 0 0 var(--warn), 0 0 12px rgba(255,198,77,.10); }
/* ===== Docked service console: center stage · Service Dock · inspector · effect layers ========== */
.st-workspace-wrapper { position: relative; display: flex; flex: 1; min-width: 0; min-height: 0; }
.st-center-stage { display: flex; flex-direction: column; flex: 1; min-width: 0; min-height: 0; overflow: hidden; position: relative; }
/* Content is the economy desk surface — must claim remaining height and scroll its panels. */
.st-content { position: relative; flex: 1 1 auto; min-height: 0; min-width: 0; overflow: hidden; }
.st-hub--desk .st-content { flex: 1 1 0; }
.st-hub--desk .st-tabpanel { padding: 16px 18px 24px; }
.st-content-busy {
  position: absolute; inset: 0; z-index: 40; display: grid; place-items: center; align-content: center; gap: 9px;
  pointer-events: none; color: var(--accent);
  background: linear-gradient(180deg, rgba(5,9,18,.84), rgba(5,9,18,.68));
  opacity: 0; transition: opacity 120ms var(--ease, ease-out);
}
.st-content-busy[hidden] { display: none; }
.st-content-busy.is-visible { opacity: 1; }
.st-content-spinner {
  width: 26px; height: 26px; border-radius: 50%;
  border: 2px solid rgba(57,208,255,.18); border-top-color: var(--accent);
  box-shadow: 0 0 14px rgba(57,208,255,.18);
}
.st-content-busy.is-visible .st-content-spinner {
  animation: st-spinner-rotate 760ms linear infinite;
}
.st-content-busy-text {
  font-size: .62rem; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-dim);
}
@keyframes st-spinner-rotate { to { transform: rotate(360deg); } }
.st-faction-stripe { height: 3px; flex: none; opacity: .85; }
.st-hub--engineering .st-console-deck,
.st-hub--engineering .st-status-row,
.st-hub--engineering .st-handoff,
.st-hub--engineering .st-departure {
  display: none;
}

/* Station OS: console deck is effects-only — zero layout budget (no bullseye, no service dock). */
.st-console-deck { position: absolute; width: 0; height: 0; overflow: hidden; opacity: 0; pointer-events: none; }
.st-console-deck--effects-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.st-hub--desk .st-schematic-pane,
.st-schematic-pane[hidden] { display: none !important; }
.st-status-row--sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0,0,0,0); }
.st-hub--os .st-center-stage { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.st-hub--os .st-content { flex: 1 1 0; min-height: 0; }
.st-hub--os .st-handoff--strip { flex: none; padding: 6px 12px; gap: 6px; }
.st-hub--os .st-origin-rail { padding: 6px 12px; gap: 8px; }
.st-hub--os .st-ladder-rail { padding: 6px 12px; gap: 8px; }
.st-hub--os .st-handoff-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
.st-hub--os .st-handoff-dismiss { margin-left: auto; font-size: .72rem; padding: 4px 10px; }
.st-hub--os .st-handoff-steps { display: flex; flex-wrap: wrap; gap: 6px; }
.st-hub--os .st-handoff-step { flex: 1 1 140px; max-width: 280px; min-height: 0; padding: 8px 10px; }
.st-hub--os .st-departure--compact { flex: none; padding: 4px 12px; min-height: 0; gap: 8px; }
.st-hub--os .st-topbar-m { display: flex; align-items: center; gap: 14px; flex: 1; justify-content: center; min-width: 0; }
.st-hub--os .st-top-stat { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.st-hub--os .st-top-stat-l { font-size: .55rem; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-mute); }
.st-hub--os .st-top-credits, .st-hub--os .st-top-cargo { font-size: .95rem; color: var(--ink); font-weight: 600; }
.st-hub--os .st-meta-btn { text-transform: none; letter-spacing: .02em; }
.st-hub--os .st-tab-service { display: none !important; }
.st-hub--os .st-tab { display: flex; align-items: center; gap: 10px; }
.st-hub--os .st-tab-label { overflow: visible; text-overflow: clip; white-space: normal; text-transform: none;
  font-size: .92rem; font-weight: 600; letter-spacing: .01em; }
.st-qty-param { display: inline-flex; align-items: center; gap: 2px; }
.st-qty-btn { width: 26px; height: 26px; border-radius: 6px; border: 1px solid var(--st-line);
  background: rgba(255,255,255,.04); color: var(--ink); cursor: pointer; font: inherit; }
.st-qty-input { width: 3.2rem; text-align: center; border-radius: 6px; border: 1px solid var(--st-line);
  background: rgba(0,0,0,.25); color: var(--ink); font: inherit; padding: 4px; }
.st-verb-btn { font-weight: 650; }
.st-market-mode { display: inline-flex; gap: 4px; margin-left: auto; }
.st-mode-btn { font: inherit; font-size: .78rem; font-weight: 650; padding: 6px 14px; border-radius: 8px;
  border: 1px solid var(--st-line); background: transparent; color: var(--ink-dim); cursor: pointer; }
.st-mode-btn.is-on { color: var(--ink); border-color: color-mix(in srgb, var(--accent) 50%, transparent);
  background: color-mix(in srgb, var(--accent) 14%, transparent); }
.st-market--board .st-card-spark-wrap--compact[hidden] { display: none !important; }
.st-mission-accept.st-verb-btn {
  font-size: .88rem; font-weight: 700; padding: 8px 16px; border-radius: 8px;
  border: 1px solid color-mix(in srgb, var(--accent) 50%, transparent);
  background: color-mix(in srgb, var(--accent) 18%, transparent); color: var(--ink); cursor: pointer;
}
.st-mission-accept.st-verb-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent) 32%, transparent);
}
.st-mission-accept.st-verb-btn:disabled { opacity: .45; cursor: not-allowed; }
.st-schematic-pane { position: relative; width: 100%; height: 100px; display: flex; align-items: center; justify-content: center; z-index: 0; }
.st-fx-scan { position: absolute; inset: 0; overflow: hidden; opacity: .45; pointer-events: none; z-index: 0; }
.st-fx-scan canvas { width: 100%; height: 100%; display: block; }
.st-schematic-art { position: relative; z-index: 1; filter: drop-shadow(0 0 9px var(--st-glow)); }
.st-schematic-art svg { display: block; width: 92px; height: 92px; }
.st-service-bar-label { font-size: .58rem; letter-spacing: .12em; text-transform: uppercase;
  color: var(--ink-mute); padding: 0 2px; }
.st-service-nodes-pane { position: relative; z-index: 5; width: 100%; overflow: visible; }
.st-fx-overlay { position: absolute; inset: 0; pointer-events: none; z-index: 2; }

/* Service Dock — dockRail owns magnify curve + glass plate; hub adds accent + scroll headroom.
   overflow-x:auto would force overflow-y to clip (CSS overflow pairing) — headroom is padding-top
   inside .sf-fx-dock so the scale/lift stays inside the scrollport. */
.st-hub .sf-fx-dock { flex-wrap: nowrap; gap: 7px; align-items: flex-end; justify-content: center;
  max-width: 100%; overflow-x: auto; overflow-y: hidden; scrollbar-width: thin;
  --sf-fx-dock-pad-top: 48px; }
.st-hub .sf-fx-dock__item { min-width: 62px; padding: 8px 9px;
  background:
    linear-gradient(165deg, color-mix(in srgb, var(--st-accent) 10%, transparent), transparent 55%),
    linear-gradient(180deg, rgba(18,28,48,.72), rgba(8,14,26,.78));
  border-color: color-mix(in srgb, var(--st-accent) 34%, transparent); }
.st-hub .sf-fx-dock__item:focus-visible { outline-color: var(--st-accent); }
.st-hub .sf-fx-dock__item.is-focus { border-color: color-mix(in srgb, var(--st-accent) 70%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.12),
    0 0 0 1px color-mix(in srgb, var(--st-accent) 28%, transparent),
    0 12px 28px -12px color-mix(in srgb, var(--st-accent) 48%, transparent); }
.st-hub .sf-fx-dock__item.is-adjacent { border-color: color-mix(in srgb, var(--st-accent) 42%, transparent); }
.st-hub .sf-fx-dock__icon { color: var(--st-accent); font-size: 1.12em; }
.st-hub .sf-fx-dock__label { font-size: .62rem; letter-spacing: .04em; }
.st-hub .sf-fx-dock__badge { font-size: .58rem; }

/* Status row: economy/state readout (morphs on change) + departure system light. */
.st-status-row { display: flex; align-items: center; gap: 12px; padding: 6px 18px; flex: none;
  border-bottom: 1px solid var(--panel-edge); font-size: .66rem; }
.st-econ-badge { flex: 1; min-width: 0; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-dim);
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.st-econ-badge.active { color: var(--warn); }
.st-econ-badge.nominal { color: var(--good); }
.st-readiness-summary { flex: none; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-mute); }
.st-readiness--risk { color: var(--danger); }
.st-readiness--check { color: var(--warn); }
.st-readiness--ready { color: var(--good); }

/* .st-content occupies the remaining center-stage flex space below the station console/status strips;
   the absolute tabpanels inside it fill that scoped area instead of covering the station chrome. */

/* Briefing drawer — collapsed by default in desk mode so Market/Hold own the width. */
.st-inspector { position: relative; z-index: 6; flex: none; width: 280px; display: flex; flex-direction: column;
  min-height: 0; border-left: 1px solid var(--panel-edge); background: rgba(6,11,22,.92);
  transition: width .18s var(--ease, ease-out), opacity .18s var(--ease, ease-out), border-color .18s ease; }
.st-inspector.is-collapsed { width: 0; opacity: 0; border-left-color: transparent; overflow: hidden; pointer-events: none; }
.st-inspector-header { flex: none; padding: 10px 14px; border-bottom: 1px solid var(--panel-edge);
  color: var(--st-accent); font-size: .62rem; letter-spacing: .12em; text-transform: uppercase;
  display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.st-inspector-close { font: inherit; font-size: 1.1rem; line-height: 1; width: 28px; height: 28px;
  border-radius: 6px; border: 1px solid transparent; background: transparent; color: var(--ink-dim); cursor: pointer; }
.st-inspector-close:hover { color: var(--ink); background: rgba(255,255,255,.06); }
.st-inspector-content { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 14px; }
.st-inspector-empty { color: var(--ink-mute); font-style: italic; padding: 10px 2px; }
.st-ins-section { display: flex; flex-direction: column; gap: 5px; }
.st-ins-title { font-size: .56rem; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-mute); }
.st-ins-tab-header { display: flex; align-items: center; gap: 8px; }
.st-ins-tab-icon { width: 18px; height: 18px; display: inline-flex; align-items: center; justify-content: center; color: var(--st-accent); }
.st-ins-tab-icon svg { width: 16px; height: 16px; }
.st-ins-tab-name { font-family: var(--font-display, var(--mono)); font-size: .9rem; letter-spacing: .05em; color: var(--ink); }
.st-ins-desc { font-size: .74rem; line-height: 1.42; color: var(--ink-dim); }
.st-ins-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: .76rem; color: var(--ink-dim); }
.st-ins-row-val { color: var(--ink); font-weight: 600; text-align: right; }
.st-ins-status--available { color: var(--good); }
.st-ins-status--unavailable { color: var(--danger); }
.st-ins-status--unknown, .st-ins-status--neutral { color: var(--warn); }
.st-ins-row-detail { font-size: .72rem; line-height: 1.4; color: var(--ink-mute); }
.st-ins-hint { font-size: .72rem; line-height: 1.35; color: var(--warn); }
.st-ins-risk-desc { font-size: .72rem; line-height: 1.4; color: var(--ink-dim); }

/* Route-beam overlay spans the whole workspace so a node can beam toward the inspector. */
.st-fx-beamlayer { position: absolute; inset: 0; pointer-events: none; z-index: 3; overflow: visible; }
.st-fx-beamlayer > svg { position: absolute; left: 0; top: 0; overflow: visible; }

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

/* Hold manifest — real sell actions, readable prices (not a 1-button dead stub). */
.st-hold-header { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
.st-hold-meter-label { font-size: .78rem; color: var(--ink-dim); letter-spacing: .04em; }
.st-hold-meter { height: 8px; border-radius: 999px; background: rgba(255,255,255,.06); overflow: hidden; }
.st-hold-meter-fill { height: 100%; background: linear-gradient(90deg, var(--accent), var(--good)); border-radius: inherit; }
.st-hold-hint { margin: 0; font-size: .78rem; line-height: 1.4; color: var(--ink-mute); max-width: 52ch; }
.st-hold-row { grid-template-columns: minmax(8rem, 1.6fr) 4.5rem 4.5rem minmax(5.5rem, 0.9fr) minmax(11rem, 1.3fr) !important; }
.st-hold-name { font-weight: 650; color: var(--ink); }
.st-hold-actions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.st-sell-btn { font: inherit; font-size: .72rem; font-weight: 600; padding: 6px 10px; border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); color: var(--ink);
  background: color-mix(in srgb, var(--accent) 12%, transparent); cursor: pointer; }
.st-sell-btn:hover { background: color-mix(in srgb, var(--accent) 22%, transparent); }
.st-sell-btn--all { border-color: color-mix(in srgb, var(--good) 42%, transparent);
  background: color-mix(in srgb, var(--good) 12%, transparent); }

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
.st-pl-dest { color: var(--ink-mute); font-size: .78rem; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.st-pl-intel { color: var(--accent-2); font-size: .62rem; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; }
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

/* ── Market rebuild: trade-intelligence scope ── */
/* Dense commodity row readouts: a stock-pressure mini-gauge + sparkline + supply/demand glyph read as
   one scope strip. Palette tokens only; no glow/pulse at rest (motion = state change only). */
.st-card-spark-wrap { display: flex; align-items: center; gap: 10px; padding: 2px 0; }
.st-row-gauge { flex: 0 0 auto; }
.st-row-gauge__track { stroke: color-mix(in srgb, var(--ink-mute) 30%, transparent); }
.st-spark { margin-left: 0; flex: 1 1 auto; width: 120px; height: 26px; }
.st-row-role { flex: 0 0 auto; display: inline-flex; flex-direction: column; align-items: center;
  line-height: 1; gap: 2px; min-width: 46px; }
.st-row-role-glyph { font-size: .92rem; }
.st-row-role-lbl { font-family: var(--mono); font-size: .54rem; letter-spacing: .12em; color: var(--ink-mute); }
.st-role--produce .st-row-role-glyph { color: var(--good); }
.st-role--consume .st-row-role-glyph { color: var(--warn); }
.st-role--none .st-row-role-glyph { color: var(--ink-mute); }
.st-card-header { display: flex; align-items: center; gap: 8px; }
.st-card-cat-badge { margin-left: auto; font-size: .56rem; letter-spacing: .1em; text-transform: uppercase;
  color: var(--ink-mute); }
.st-expand-btn { margin-left: 2px; padding: 0 5px; font-size: .68rem; line-height: 1.3; border-radius: 4px;
  color: var(--ink-mute); border-color: transparent; background: transparent; cursor: pointer; opacity: .5;
  transition: opacity .12s var(--ease, ease-out), color .12s, border-color .12s; }
.st-cmdty-card:hover .st-expand-btn { opacity: 1; }
.st-expand-btn:hover { color: var(--accent); border-color: var(--accent); opacity: 1; }
.st-cmdty-card { cursor: pointer; transition: border-color .12s var(--ease, ease-out);
  display: grid; grid-template-columns: 1fr auto; grid-template-areas:
    "head head" "scope scope" "purpose purpose" "mission mission" "best best" "prices qty" "actions actions";
  align-items: center; gap: 4px 10px; }
.st-cmdty-card:hover { border-color: color-mix(in srgb, var(--accent) 50%, var(--panel-edge)); }
.st-cmdty-card.is-selected { border-color: var(--accent); box-shadow: inset 2px 0 0 var(--accent); }
.st-cmdty-card > .st-card-header { grid-area: head; }
.st-cmdty-card > .st-card-spark-wrap { grid-area: scope; }
.st-cmdty-card > .st-cmdty-purpose { grid-area: purpose; }
.st-cmdty-card > .st-market-mission-line { grid-area: mission; }
.st-cmdty-card > .st-best-known-line { grid-area: best; }
.st-cmdty-card > .st-card-prices { grid-area: prices; }
.st-cmdty-card > .st-card-qty-row { grid-area: qty; }
.st-cmdty-card > .c-act { grid-area: actions; }
.st-card-prices { display: flex; gap: 18px; align-items: baseline; }
.st-card-price-col { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; }
.st-price-lbl { font-family: var(--mono); font-size: .52rem; letter-spacing: .14em; text-transform: uppercase;
  color: var(--ink-mute); }
.st-card-qty-row { display: flex; justify-content: flex-end; }

/* Selected-commodity analysis stage — the centerpiece. Four cells in a 2x2 grid: price/regime + cone,
   supply chain spindle, best-margin route beam, trade inspector. */
.st-market-stage { position: relative; margin-top: 10px; border: 1px solid var(--panel-edge);
  border-radius: var(--r-lg, 8px); background: color-mix(in srgb, var(--panel) 80%, transparent);
  padding: 10px 12px 12px; }
.st-market-stage[hidden] { display: none; }
.st-stage-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.st-stage-title { font-family: var(--mono); font-size: .62rem; letter-spacing: .18em; color: var(--accent);
  text-transform: uppercase; }
.st-stage-close { padding: 0 7px; font-size: 1rem; line-height: 1.4; border-radius: 4px; color: var(--ink-mute);
  border-color: var(--panel-edge); background: transparent; cursor: pointer; }
.st-stage-close:hover { color: var(--ink); border-color: var(--ink-mute); }
.st-stage-grid { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 10px; }
.st-stage-cell { border: 1px solid var(--panel-edge); border-radius: 6px; padding: 10px 12px;
  background: color-mix(in srgb, var(--panel-2) 60%, transparent); min-height: 150px;
  display: flex; flex-direction: column; }
.st-stage-lbl { font-family: var(--mono); font-size: .62rem; letter-spacing: .14em; text-transform: uppercase;
  color: var(--ink-mute); margin-bottom: 8px; }
.st-stage-price-row { display: flex; align-items: center; gap: 10px; }
.st-stage-spark-wrap { flex: 0 0 auto; }
.st-stage-spark { width: 170px; height: 46px; display: block; }
.st-stage-regime { font-family: var(--mono); font-size: .82rem; color: var(--ink); }
.st-stage-forecast-lbl { font-family: var(--mono); font-size: .58rem; letter-spacing: .14em; text-transform: uppercase;
  color: var(--ink-mute); margin: 8px 0 2px; }
.st-stage-cone { width: 100%; height: 80px; display: block; }
.st-stage-supply-mount, .st-stage-route-mount { flex: 1 1 auto; display: flex; align-items: center;
  justify-content: center; min-height: 96px; }
.st-stage-route-meta { font-family: var(--mono); font-size: .68rem; color: var(--accent-2); text-align: center;
  margin-top: 6px; }
.st-inspector-row { display: flex; align-items: center; justify-content: space-between; gap: 8px;
  font-size: .74rem; padding: 4px 0; }
.st-insp-lbl { font-family: var(--mono); font-size: .58rem; letter-spacing: .1em; text-transform: uppercase;
  color: var(--ink-mute); }
.st-insp-quote, .st-insp-profit { font-size: .78rem; color: var(--ink); }
.st-insp-flood-mount { display: inline-flex; }
.st-inspector-actions { margin-top: 8px; display: flex; justify-content: flex-end; }
.st-insp-route { padding: 4px 12px; font-size: .72rem; border-radius: 5px; color: var(--accent);
  border-color: var(--accent); background: transparent; cursor: pointer; }
.st-insp-route:hover:not(:disabled) { background: rgba(57,208,255,.12); }
.st-insp-route:disabled { color: var(--ink-mute); border-color: var(--panel-edge); cursor: not-allowed; opacity: .6; }
/* ripple overlay sits above the stage cells to catch event-mode pings */
.st-market-stage-overlay { position: absolute; inset: 0; pointer-events: none; }

@media (max-width: 900px) {
  .st-stage-grid { grid-template-columns: 1fr; grid-template-rows: none; }
  .st-origin-rail { grid-template-columns: 1fr; }
  .st-origin-head { grid-template-columns: auto 1fr; align-items: baseline; gap: 8px; }
  .st-origin-action { grid-template-columns: minmax(0, 1fr) auto auto; }
  .st-ladder-rail { grid-template-columns: 1fr; }
  .st-ladder-head { grid-template-columns: auto 1fr; align-items: baseline; gap: 8px; }
  .st-ladder-careers { grid-template-columns: 1fr; }
}

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
.st-sy-job-guide { border-color: rgba(57,208,255,.34); background: linear-gradient(90deg, rgba(57,208,255,.10), rgba(10,18,32,.54)); }
.st-sy-job-title { color: var(--ink); font-weight: 700; font-size: .84rem; margin-top: 6px; }
.st-sy-job-body { color: var(--ink-dim); font-size: .76rem; line-height: 1.35; margin-top: 3px; }
.st-sy-purpose { display: block; margin-top: 3px; white-space: normal; }
.st-sy-fitline { display: block; margin-top: 3px; white-space: normal; font-size: .7rem; line-height: 1.3; }
.st-sy-fitline--ok { color: var(--good); }
.st-sy-fitline--warn { color: var(--warn); }
.st-sy-fitline--bad { color: var(--ink-mute); }
.st-shipyard .st-row.mission-fit-ok { border-color: rgba(98,224,138,.34); background: rgba(98,224,138,.045); }
.st-shipyard .st-row.mission-fit-warn { border-color: rgba(255,198,77,.26); background: rgba(255,198,77,.035); }
.st-shipyard { display: flex; flex-direction: column; gap: 12px; }
.st-shipyard .st-sy-engineering { order: 0; }
.st-shipyard .st-sy-job-guide { order: 1; margin: 0; }
.st-shipyard .st-sy-owned { order: 2; margin: 0; }
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

/* ===== Premium Engineering Stage (Shipyard + Outfitting) ===== */
.st-eng-stage { display: flex; flex-direction: column; height: 100%; }
.st-eng-stage__frame {
  position: relative; flex: 1; min-height: 220px;
  border: 1px solid var(--panel-edge); border-radius: 8px; overflow: hidden;
  background: radial-gradient(ellipse at 50% 70%, #0a1426, #05070d 80%);
}
.st-eng-stage__frame::before {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(0deg, rgba(57,208,255,.03) 0, rgba(57,208,255,.03) 1px, transparent 1px, transparent 24px);
  z-index: 1;
}
.st-eng-stage__canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; opacity: 0; transition: opacity .25s ease; }
.st-eng-stage.is-ready .st-eng-stage__canvas { opacity: 1; }
.st-eng-stage__overlay { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
.st-eng-stage__gauges {
  position: absolute; left: 10px; top: 10px; z-index: 3;
  display: flex; flex-wrap: wrap; gap: 8px; max-width: 180px;
  pointer-events: none;
}
.st-eng-stage__loading {
  position: absolute; inset: 0; z-index: 4; display: grid; place-items: center;
  opacity: 1; pointer-events: none; transition: opacity .16s var(--ease, ease-out);
}
.st-eng-stage.is-ready .st-eng-stage__loading { opacity: 0; }
.st-eng-stage__spinner {
  width: 24px; height: 24px; border-radius: 50%;
  border: 2px solid rgba(57,208,255,.18); border-top-color: var(--accent);
  box-shadow: 0 0 14px rgba(57,208,255,.18);
}
.st-eng-stage:not(.is-ready) .st-eng-stage__spinner {
  animation: st-spinner-rotate 760ms linear infinite;
}
.st-eng-gauge { background: rgba(5,7,13,.55); border-radius: 50%; padding: 2px; }
.st-eng-stage__label {
  margin-top: 8px; text-align: center; font-size: .78rem; color: var(--ink-dim);
  min-height: 1.2em;
}
.st-eng-stage__label .mono { color: var(--accent); }
.st-outfit-ghost-label { color: var(--warn); font-style: italic; }

/* ===== Fit Tree (file-tree-inspired) ===== */
.st-fit-tree { font-size: .8rem; overflow-y: auto; max-height: 520px; padding-right: 4px; }
.st-fit-empty { color: var(--ink-mute); font-style: italic; padding: 8px 0; }
.st-fit-node { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; padding: 5px 8px; border-radius: 5px; cursor: pointer; }
.st-fit-node--root { font-weight: 600; color: var(--ink); background: rgba(10,18,32,.5); border: 1px solid var(--panel-edge); margin-bottom: 6px; }
.st-fit-node--slot { padding-left: 18px; border-left: 2px solid transparent; margin: 1px 0; }
.st-fit-node--slot:hover { background: rgba(57,208,255,.08); }
.st-fit-node--selected { background: rgba(57,208,255,.12); border-color: var(--accent); }
.st-fit-node--filled { color: var(--ink); }
.st-fit-node--empty { color: var(--ink-mute); font-style: italic; }
.st-fit-node--preview-ok { border-left-color: var(--good); }
.st-fit-node--preview-bad { border-left-color: var(--danger); animation: st-fit-blink 1s ease-in-out 2; }
.st-fit-node--invalid { border-color: var(--danger); }
.st-fit-icon { width: 18px; text-align: center; }
.st-fit-icon--hull { color: var(--accent); }
.st-fit-icon--weapon { color: var(--danger); }
.st-fit-icon--shield { color: var(--shield); }
.st-fit-icon--engine { color: var(--warn); }
.st-fit-icon--cargo { color: var(--cargo); }
.st-fit-icon--mining { color: var(--accent-2); }
.st-fit-icon--utility { color: var(--accent-3); }
.st-fit-branch { margin-bottom: 8px; }
.st-fit-branch-head { display: flex; align-items: center; gap: 6px; padding: 4px 8px; color: var(--ink-mute); text-transform: uppercase; letter-spacing: .08em; font-size: .68rem; }
.st-fit-branch-label { flex: 1; }
.st-fit-branch-count { color: var(--ink-dim); }
.st-fit-label { flex: 1; }
.st-fit-meta { color: var(--ink-mute); font-size: .68rem; }
.st-fit-slot-size { color: var(--accent); min-width: 18px; }
.st-fit-slot-name { flex: 1; }
.st-fit-slot-facing { color: var(--ink-mute); font-size: .64rem; text-transform: capitalize; }
.st-fit-preview-arrow { color: var(--accent); }
.st-fit-preview-name { color: var(--good); }
.st-fit-preview-name--bad { color: var(--danger); }
.st-fit-mods { width: 100%; padding-left: 24px; }
.st-fit-mod { color: var(--ink-dim); font-size: .68rem; line-height: 1.35; }
.st-fit-mod--preview { color: var(--good); }
@keyframes st-fit-blink { 0%,100% { background: transparent; } 50% { background: rgba(255,84,112,.12); } }

/* ===== Shipyard premium layout ===== */
.st-sy-engineering { display: grid; grid-template-columns: 240px 1fr 240px; gap: 16px; min-height: 420px; }
.st-sy-rail { display: flex; flex-direction: column; gap: 10px; }
.st-sy-rail-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.st-sy-rail-credits { color: var(--energy); font-size: .82rem; }
.st-sy-rail-controls { display: flex; flex-direction: column; gap: 6px; }
.st-sy-rail-header { display: grid; grid-template-columns: 1.4fr .6fr 1fr; align-items: center; gap: 6px; padding: 4px 8px; font-size: .66rem; color: var(--ink-mute); border-bottom: 1px solid var(--panel-edge); }
.st-sy-rail-list { flex: 1; overflow-y: auto; max-height: 420px; display: flex; flex-direction: column; gap: 6px; padding-right: 2px; }
.st-sy-rail-card { border: 1px solid var(--panel-edge); border-radius: 6px; padding: 8px 10px; cursor: pointer; background: rgba(10,18,32,.5); transition: border-color .12s, background .12s; }
.st-sy-rail-card:hover { border-color: var(--accent); background: rgba(57,208,255,.06); }
.st-sy-rail-card.selected { border-color: var(--accent); box-shadow: 0 0 10px rgba(57,208,255,.18); }
.st-sy-rail-card.owned { opacity: .7; }
.st-sy-rail-card.mission-fit-ok { border-color: rgba(98,224,138,.42); background: rgba(98,224,138,.06); }
.st-sy-rail-card.mission-fit-warn { border-color: rgba(255,198,77,.36); background: rgba(255,198,77,.05); }
.st-sy-rail-name { font-weight: 600; font-size: .88rem; margin-bottom: 2px; }
.st-sy-rail-meta { color: var(--ink-dim); font-size: .66rem; margin-bottom: 3px; }
.st-sy-rail-slots { color: var(--ink-mute); font-size: .62rem; margin-bottom: 4px; }
.st-sy-rail-price { color: var(--energy); font-size: .74rem; }
.st-sy-center { display: flex; flex-direction: column; min-height: 0; }
.st-sy-stage-wrap { flex: 1; min-height: 260px; }
.st-sy-identity { margin-top: 12px; padding: 10px 12px; border: 1px solid var(--panel-edge); border-radius: 6px; background: rgba(10,18,32,.5); }
.st-sy-identity-role { font-family: var(--mono); font-size: .62rem; letter-spacing: .12em; text-transform: uppercase; color: var(--accent); margin-bottom: 3px; }
.st-sy-identity-name { font-size: 1.05rem; font-weight: 600; margin-bottom: 4px; }
.st-sy-identity-slots { color: var(--ink-mute); font-size: .7rem; margin-bottom: 6px; }
.st-sy-identity-purpose { color: var(--ink-dim); font-size: .76rem; line-height: 1.35; margin-bottom: 8px; }
.st-sy-identity-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.st-sy-id-chip { font-size: .64rem; padding: 2px 8px; border-radius: 4px; border: 1px solid var(--panel-edge); color: var(--ink-dim); background: rgba(10,18,32,.5); }
.st-sy-id-chip--role { color: var(--accent); border-color: rgba(57,208,255,.35); }
.st-sy-id-chip--combat { color: var(--danger); border-color: rgba(255,84,112,.35); }
.st-sy-id-chip--cargo { color: var(--cargo); border-color: rgba(122,247,208,.35); }
.st-sy-side { display: flex; flex-direction: column; gap: 12px; }
.st-sy-requirements { border: 1px solid var(--panel-edge); border-radius: 6px; padding: 12px; background: rgba(10,18,32,.5); }
.st-sy-req-head { font-family: var(--mono); font-size: .6rem; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-mute); margin-bottom: 8px; }
.st-sy-req-price { font-size: 1.1rem; color: var(--energy); margin-bottom: 4px; }
.st-sy-req-price--short { color: var(--danger); }
.st-sy-req-credits { font-size: .72rem; color: var(--ink-dim); margin-bottom: 10px; }
.st-sy-req-state { font-family: var(--mono); font-size: .7rem; letter-spacing: .08em; text-transform: uppercase; padding: 4px 8px; border-radius: 4px; margin-bottom: 8px; }
.st-sy-req-state--available { color: var(--good); border: 1px solid rgba(98,224,138,.35); background: rgba(98,224,138,.08); }
.st-sy-req-state--funding { color: var(--danger); border: 1px solid rgba(255,84,112,.35); background: rgba(255,84,112,.08); }
.st-sy-req-state--locked { color: var(--warn); border: 1px solid rgba(255,179,71,.35); background: rgba(255,179,71,.08); }
.st-sy-req-state--owned { color: var(--ink-mute); border: 1px solid var(--panel-edge); background: rgba(10,18,32,.5); }
.st-sy-req-title { font-size: .74rem; color: var(--ink-dim); line-height: 1.35; margin-bottom: 10px; }
.st-sy-buy-btn { width: 100%; }

/* ===== Outfitting premium layout ===== */
.st-outfit-engineering { display: grid; grid-template-columns: minmax(200px, 260px) minmax(280px, 1fr) minmax(220px, 300px); gap: 16px; min-height: 480px; height: 100%; }
.st-outfit-tree-wrap { min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.st-outfit-stage-wrap {
  min-height: 320px; height: 100%;
  background: radial-gradient(ellipse at 50% 70%, #0a1426, #05070d 80%);
  border-radius: 8px;
}
.st-outfit-right { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; }
.st-hub--desk .st-outfit { display: flex; flex-direction: column; min-height: 100%; height: 100%; }
.st-hub--desk .st-outfit-engineering { flex: 1; min-height: min(560px, calc(100vh - 240px)); }
.st-hub--desk .st-eng-stage__frame { min-height: 360px; }
.st-hub--desk .st-hold,
.st-hub--desk .st-market,
.st-hub--desk .st-missions { min-height: 100%; }
/* Market: fill the desk instead of living in a half-inch strip under dead chrome. */
.st-hub--desk .st-market { display: flex; flex-direction: column; gap: 10px; height: 100%; box-sizing: border-box; }
.st-hub--desk .st-market-layout { display: grid; grid-template-columns: minmax(120px, 148px) minmax(0, 1fr) minmax(200px, 260px);
  gap: 12px; flex: 1; min-height: 0; align-items: stretch; }
.st-hub--desk .st-market-category-rail { display: flex; flex-direction: column; gap: 4px; overflow-y: auto; min-height: 0; }
.st-hub--desk .st-market-center { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.st-hub--desk .st-market-center .st-list { flex: 1; min-height: 0; overflow-y: auto; }
.st-hub--desk .st-market-sidebar { min-height: 0; overflow-y: auto; }
.st-hub--desk .st-market-cat-tab { text-align: left; white-space: normal; }
.st-hub--desk .st-airlock { min-height: 0; padding: 2px 12px; font-size: .68rem; }
.st-hub--desk .st-airlock__label { font-size: .55rem; letter-spacing: .1em; text-transform: none; opacity: .7; }
/* Hide the decorative route beam layer in desk mode — it crossed readable content. */
.st-hub--desk .st-fx-beamlayer { display: none; }

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
.st-fac-guidance { display: grid; grid-template-columns: minmax(52px, auto) 1fr; gap: 4px 10px;
  margin-top: 8px; padding: 8px 9px; border: 1px solid rgba(57,208,255,.12); border-radius: 6px;
  background: rgba(4,12,24,.34); color: var(--ink-dim); font-size: .7rem; line-height: 1.35; }
.st-fac-guidance-label { color: var(--accent); text-transform: uppercase; letter-spacing: .08em; font-size: .62rem; }
.st-fac-contracts { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
.st-fac-contract { font-size: .62rem; line-height: 1.25; padding: 3px 6px; border-radius: 4px;
  border: 1px solid rgba(148,163,184,.18); color: var(--ink-mute); background: rgba(255,255,255,.025); }
.st-fac-contract b { font-family: var(--mono); font-size: .58rem; letter-spacing: .06em; text-transform: uppercase;
  color: var(--ink-dim); margin-right: 3px; }
.st-fac-contract.unlocked { color: var(--good); border-color: rgba(98,224,138,.28); background: rgba(98,224,138,.08); }
.st-fac-contract.unlocked b { color: var(--good); }
.st-fac-contract.locked:not(.aspirational) { color: var(--warn); border-color: rgba(255,198,77,.26); }
.st-fac-contract.aspirational { border-style: dashed; }
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
.st-bar-intel { display: flex; gap: 5px; flex-wrap: wrap; margin: -2px 0 8px; }
.st-bar-intel-chip { font-size: .66rem; line-height: 1.25; border: 1px solid rgba(57,208,255,.22);
  border-radius: 5px; padding: 2px 6px; color: var(--ink-dim); background: rgba(6,12,22,.48); }
.st-bar-intel-chip b { font-family: var(--mono); color: var(--accent); font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
.st-bar-intel-chip--ok { border-color: rgba(98,224,138,.3); color: var(--good); }
.st-bar-intel-chip--ok b { color: var(--good); }
.st-bar-intel-chip--warn { border-color: rgba(255,198,77,.32); color: var(--warn); }
.st-bar-intel-chip--warn b { color: var(--warn); }
.st-bar-intel-chip--bad { border-color: rgba(255,84,112,.36); color: var(--danger); }
.st-bar-intel-chip--bad b { color: var(--danger); }
.st-bar-intel-chip--story { border-color: rgba(192,139,255,.36); color: var(--accent-2); }
.st-bar-intel-chip--story b { color: var(--accent-2); }
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
.st-bar-log-btn { border-color: rgba(98,224,138,.42); color: var(--good); }
.st-bar-log-btn:hover { background: rgba(98,224,138,.12); }

/* missions */
.st-mission-guide { margin: -2px 0 12px; border: 1px solid var(--panel-edge); border-radius: 6px;
  padding: 9px 11px; background: rgba(10,18,32,.5); color: var(--ink-dim); font-size: .8rem; line-height: 1.4; }
.st-mission-recommend { margin: -2px 0 12px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: 12px; border: 1px solid rgba(57,208,255,.34); border-radius: 6px; padding: 10px 12px;
  background: linear-gradient(90deg, rgba(57,208,255,.12), rgba(10,18,32,.58)); }
.st-mission-recommend[hidden] { display: none; }
.st-mission-recommend--ok { border-color: rgba(98,224,138,.36); background: linear-gradient(90deg, rgba(98,224,138,.11), rgba(10,18,32,.58)); }
.st-mission-recommend--warn { border-color: rgba(255,198,77,.38); background: linear-gradient(90deg, rgba(255,198,77,.12), rgba(10,18,32,.58)); }
.st-mission-recommend--bad { border-color: rgba(255,84,112,.42); background: linear-gradient(90deg, rgba(255,84,112,.13), rgba(10,18,32,.58)); }
.st-mission-recommend-copy { min-width: 0; display: grid; gap: 3px; }
.st-mission-recommend-label { color: var(--accent); font-size: .62rem; letter-spacing: .14em; }
.st-mission-recommend--ok .st-mission-recommend-label { color: var(--good); }
.st-mission-recommend--warn .st-mission-recommend-label { color: var(--warn); }
.st-mission-recommend--bad .st-mission-recommend-label { color: var(--danger); }
.st-mission-recommend-title { color: var(--ink); font-weight: 700; font-size: .88rem; line-height: 1.3; }
.st-mission-recommend-reason { color: var(--ink-dim); font-size: .74rem; line-height: 1.34; }
.st-mission-recommend button { flex: none; max-width: 100%; font-size: .75rem; white-space: nowrap; }
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
.st-mission-card.recommended--ok { border-color: rgba(98,224,138,.38); box-shadow: 0 0 12px rgba(98,224,138,.16); }
.st-mission-card.recommended--warn { border-color: rgba(255,198,77,.4); box-shadow: 0 0 12px rgba(255,198,77,.14); }
.st-mission-card.recommended--bad { border-color: rgba(255,84,112,.42); box-shadow: 0 0 12px rgba(255,84,112,.14); }
.st-mission-card.tracked.recommended { border-color: var(--accent); box-shadow: 0 0 12px rgba(57,208,255,.22); }
.st-mission-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 10px; }
.st-mission-title { font-size: .95rem; min-width: 0; }
.st-mission-badges { display: inline-flex; align-items: center; gap: 6px; flex: none; }
.st-mission-recommended { font-family: var(--mono); font-size: .62rem; letter-spacing: .08em; padding: 1px 7px;
  border-radius: 4px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.04); }
.st-mission-recommended--ok { color: var(--good); border-color: rgba(98,224,138,.34); }
.st-mission-recommended--warn { color: var(--warn); border-color: rgba(255,198,77,.34); }
.st-mission-recommended--bad { color: var(--danger); border-color: rgba(255,84,112,.36); }
.st-mission-readiness { font-family: var(--mono); font-size: .62rem; letter-spacing: .08em; padding: 1px 7px;
  border-radius: 4px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.04); }
.st-mission-readiness--ok { color: var(--good); border-color: rgba(98,224,138,.32); }
.st-mission-readiness--warn { color: var(--warn); border-color: rgba(255,198,77,.34); }
.st-mission-readiness--bad { color: var(--danger); border-color: rgba(255,84,112,.36); }
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
.st-mission-standing { display: flex; gap: 8px; align-items: baseline; font-size: .68rem; line-height: 1.3;
  margin: -3px 0 8px; color: var(--ink-mute); }
.st-mission-standing .mono { font-size: .6rem; letter-spacing: .08em; text-transform: uppercase; }
.st-mission-standing--ok .mono { color: var(--good); }
.st-mission-standing--locked .mono { color: var(--danger); }
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

/* operations board — two-column: compact contract selectors (rail) + preflight instrument (center) */
.st-ops { display: flex; gap: 16px; align-items: flex-start; }
.st-ops-rail { flex: 0 0 300px; min-width: 0; max-width: 340px; }
.st-ops-rail-h { color: var(--ink-mute); font-size: .6rem; letter-spacing: .16em; margin: 0 0 8px; text-transform: uppercase; }
.st-ops-center { flex: 1 1 auto; min-width: 0; align-self: stretch; border: 1px solid var(--panel-edge);
  border-radius: 10px; background: linear-gradient(180deg, rgba(10,18,32,.6), rgba(6,12,22,.5)); padding: 14px 16px; }
@media (max-width: 900px) { .st-ops { flex-direction: column; } .st-ops-rail { flex: 1 1 auto; max-width: none; width: 100%; } }
.st-ops-empty { color: var(--ink-mute); font-size: .82rem; line-height: 1.5; padding: 30px 10px; text-align: center; }
.st-ops-empty[hidden], .st-ops-dossier[hidden] { display: none; }
.st-ops-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 13px; }
.st-ops-eyebrow { color: var(--accent); font-size: .58rem; letter-spacing: .18em; }
.st-ops-title { color: var(--ink); font-weight: 700; font-size: 1.02rem; line-height: 1.25; margin-top: 3px; }
.st-ops-state { flex: none; font-family: var(--mono); font-size: .68rem; letter-spacing: .1em; font-weight: 700;
  padding: 4px 10px; border: 1px solid var(--panel-edge); border-radius: 5px; background: rgba(255,255,255,.03);
  white-space: nowrap; color: var(--ink-dim); }
.st-ops-state[data-kind="ok"] { color: var(--good); border-color: rgba(98,224,138,.42); background: rgba(98,224,138,.08); }
.st-ops-state[data-kind="warn"] { color: var(--warn); border-color: rgba(255,198,77,.42); background: rgba(255,198,77,.08); }
.st-ops-state[data-kind="bad"] { color: var(--danger); border-color: rgba(255,84,112,.44); background: rgba(255,84,112,.08); }
/* route lane */
.st-ops-route { position: relative; height: 92px; margin: 0 0 14px; border: 1px solid var(--panel-edge);
  border-radius: 8px; overflow: hidden;
  background: radial-gradient(120% 140% at 50% 130%, rgba(57,208,255,.1), transparent 62%), rgba(6,12,22,.5); }
.st-ops-route[data-kind="warn"] { border-color: rgba(255,198,77,.34); }
.st-ops-route[data-kind="danger"] { border-color: rgba(255,84,112,.36); }
.st-ops-beam, .st-ops-ping { position: absolute; inset: 0; pointer-events: none; }
.st-ops-node { position: absolute; top: 50%; transform: translateY(-50%); display: grid; gap: 3px; max-width: 42%; z-index: 1; }
.st-ops-node--origin { left: 14px; text-align: left; }
.st-ops-node--dest { right: 14px; text-align: right; }
.st-ops-node-tag { font-size: .52rem; letter-spacing: .14em; color: var(--ink-mute); }
.st-ops-node-name { font-size: .82rem; font-weight: 700; color: var(--ink); line-height: 1.2;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-ops-node--dest .st-ops-node-name { color: var(--accent); }
/* preflight ring gauges */
.st-ops-gauges { display: flex; gap: 18px; margin: 0 0 14px; flex-wrap: wrap; }
.st-ops-gauge { display: flex; align-items: center; gap: 9px; }
.st-ops-gauge-mount { flex: none; display: flex; }
.st-ops-gauge-meta { display: grid; gap: 1px; }
.st-ops-gauge-val { font-family: var(--mono); font-size: .86rem; font-weight: 700; color: var(--ink); line-height: 1.05; }
.st-ops-gauge-label { font-size: .56rem; letter-spacing: .12em; color: var(--ink-mute); text-transform: uppercase; }
/* broker comms slate */
.st-ops-comms { border: 1px solid rgba(57,208,255,.24); border-left: 3px solid rgba(57,208,255,.55);
  border-radius: 7px; padding: 9px 12px; margin: 0 0 12px;
  background: linear-gradient(90deg, rgba(57,208,255,.09), rgba(6,12,22,.4)); }
.st-ops-comms-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
.st-ops-comms-from { color: var(--accent-2); font-weight: 700; font-size: .8rem; min-width: 0; }
.st-ops-comms-tag { flex: none; color: var(--accent); font-size: .54rem; letter-spacing: .14em; }
.st-ops-comms-msg { color: var(--ink-dim); font-size: .8rem; line-height: 1.45; font-style: italic; }
/* dossier detail + actions */
.st-ops-standing { margin: 0 0 8px; }
.st-ops-warn[hidden] { display: none; }
.st-ops-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 2px; }
.st-ops-btn { font-size: .82rem; }
.st-ops-btn--plot { border-color: rgba(57,208,255,.44); color: var(--accent); }
.st-ops-btn--plot:hover { background: rgba(57,208,255,.12); }
/* compact selector card additions (board-only — .st-mission-card is not shared with the Bar) */
.st-mission-card { cursor: pointer; transition: border-color .15s ease, box-shadow .15s ease, background .15s ease; }
.st-mission-card:hover { border-color: rgba(57,208,255,.4); }
.st-mission-card.selected { border-color: var(--accent); background: rgba(57,208,255,.07);
  box-shadow: inset 3px 0 0 var(--accent), 0 0 12px rgba(57,208,255,.14); }
.st-mission-cslot { display: flex; flex-wrap: wrap; gap: 5px; margin: 7px 0 6px; }
.st-mission-chip { font-family: var(--mono); font-size: .62rem; letter-spacing: .03em; padding: 2px 6px;
  border: 1px solid var(--panel-edge); border-radius: 4px; color: var(--ink-dim); background: rgba(10,18,32,.42); }
.st-mission-chip--cr { color: var(--energy); }
.st-mission-chip--rep { color: var(--accent-2); }
.st-mission-chip--r0 { color: var(--good); } .st-mission-chip--r1 { color: var(--accent-2); }
.st-mission-chip--r2 { color: var(--warn); } .st-mission-chip--r3, .st-mission-chip--r4 { color: var(--danger); }
.st-mission-chip--time { color: var(--ink-mute); }
/* accepted receipt: singular confirmation + one-shot freshly-printed edge sweep + Plot Route */
.st-mission-accepted { position: relative; }
.st-mission-accepted-actions { margin-top: 9px; display: flex; gap: 10px; flex-wrap: wrap; }
.st-mission-accepted.trace-run::after { content: ''; position: absolute; inset: -1px; border-radius: 7px;
  border: 1px solid var(--good); pointer-events: none; animation: st-receipt-trace 620ms ease-out 1 both; }
@keyframes st-receipt-trace { 0% { clip-path: inset(0 100% 100% 0); opacity: 1; } 60% { clip-path: inset(0 0 0 0); opacity: 1; } 100% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .st-mission-accepted.trace-run::after { animation: none; } }
html.sf-reduce-motion .st-mission-accepted.trace-run::after { animation: none; }

/* --- SCORCHED BULKHEAD CONSOLE OVERRIDES --- */
/* No remote @font import: the game must run offline/packaged (and a mid-stylesheet @import is invalid
   anyway). --font-display / --font-body below fall back to the local --mono + system stacks. */

.st-hub {
  /* Refined mission-console theme: readable system type, soft slate surfaces, restrained accent,
     generous corners + soft elevation (replaces the hard 1px cyan-wireframe "bulkhead" look). */
  --font-display: 'Segoe UI Variable Display', 'Segoe UI', system-ui, -apple-system, sans-serif;
  --font-body: 'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, sans-serif;
  --panel-edge: rgba(150,167,193,0.13);
  --st-line: rgba(150,167,193,0.16);
  --st-surface: rgba(21,28,44,0.72);
  --st-surface-2: rgba(28,38,58,0.5);
  --st-raised: rgba(33,45,68,0.82);
  --st-r: 14px; --st-r-sm: 10px; --st-r-xs: 7px;
  --st-shadow: 0 14px 36px -18px rgba(0,0,0,0.72);
  --st-accent-soft: color-mix(in srgb, var(--st-accent) 20%, transparent);
  --ink: #eef2f9; --ink-dim: #bcc7db; --ink-mute: #8695ad;
  color: var(--ink);
  font-family: var(--font-body);
}
.st-station-name {
  font-family: var(--font-display);
  font-size: 25px;
  font-weight: 650;
  letter-spacing: 0.005em;
  text-transform: none;
  color: #fff;
  position: relative;
}
.st-station-name::after {
  content: ''; position: absolute; bottom: -2px; left: 0; height: 1px;
  background: var(--accent); width: 0; box-shadow: 0 0 6px var(--accent);
}
.st-station-name.acquiring::after {
  animation: signal-sweep 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
@keyframes signal-sweep {
  from { width: 0; opacity: 1; }
  to { width: 100%; opacity: 0.3; }
}
.st-tab-label {
  font-family: var(--font-display);
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  text-transform: none;
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
}
.c-name, .st-sy-name, .st-svc-name, .st-inv-name, .st-mission-title, .st-bar-name {
  font-family: var(--font-body);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0;
  color: var(--ink);
}
.st-cmdty-purpose, .st-market-mission-body, .st-sy-guide, .st-sy-purpose, .st-mission-brief, .st-mission-purpose, .st-bar-line {
  font-family: var(--font-body);
  font-size: 13.5px;
  font-weight: 400;
  line-height: 1.55;
  color: var(--ink-dim);
}
.st-row-head, .st-sub-h, .st-manuf-group-h {
  font-family: var(--mono);
  font-size: 10.5px;
  font-weight: 500;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: var(--ink-mute);
}
.st-topbar {
  height: 52px;
  padding: 0 20px;
}
/* Soft corners (was a hard 1px !important wireframe on every element). */
.st-hub button, .st-hub .st-tab, .st-hub input, .st-hub select, .st-hub .st-chip { border-radius: var(--st-r-xs); }
.st-undock {
  font-family: var(--font-display); font-weight: 650; letter-spacing: 0.01em; text-transform: none;
  border-radius: var(--st-r-sm); padding: 9px 18px;
}
.st-undock::before {
  content: ''; position: absolute; inset: 0;
  background: linear-gradient(90deg, var(--accent), transparent 70%);
  opacity: 0; transform: scaleX(0); transform-origin: left;
  transition: none; pointer-events: none; z-index: 0;
}
.st-undock.charging::before {
  opacity: 0.25; transform: scaleX(1);
  transition: transform 600ms cubic-bezier(0.33, 1, 0.68, 1), opacity 80ms ease;
}
.st-undock.abort::before {
  opacity: 0; transform: scaleX(0);
  transition: all 150ms ease;
}
.st-undock > * { position: relative; z-index: 1; }
.st-content::after {
  content: ''; position: absolute; left: 0; right: 0; height: 4px;
  background: repeating-linear-gradient(90deg, rgba(242,168,59,0.6) 0px, transparent 2px, rgba(242,168,59,0.3) 4px, transparent 6px);
  opacity: 0; pointer-events: none; z-index: 10; top: 0;
}
.st-content.switching::after {
  animation: channel-wipe-trace 120ms ease-out forwards;
}
@keyframes channel-wipe-trace {
  0% { top: 0; opacity: 0.9; }
  100% { top: 100%; opacity: 0; }
}
.st-trend-arrow {
  display: inline-block; font-size: 1.4em; line-height: 1;
  transition: transform 0.3s var(--ease), color 0.3s var(--ease);
}
.st-trend-arrow.up { color: var(--danger); transform: rotate(-90deg); }
.st-trend-arrow.down { color: var(--good); transform: rotate(90deg); }
.st-trend-arrow.flat { color: var(--ink-mute); opacity: 0.4; }
.st-trend-arrow.strong { font-size: 1.8em; }

.st-faction-gauge {
  height: 6px; border-radius: 1px; position: relative; width: 140px; margin-top: 4px;
  background: linear-gradient(90deg, var(--danger) 0%, var(--danger) 20%, var(--warn) 20%, var(--warn) 40%, var(--ink-mute) 40%, var(--ink-mute) 60%, var(--accent-2) 60%, var(--accent-2) 80%, var(--good) 80%, var(--good) 100%);
}
.st-faction-gauge::after {
  content: ''; position: absolute; top: -3px; width: 2px; height: 12px;
  background: var(--ink); box-shadow: 0 0 4px rgba(0,0,0,0.8);
  left: var(--rep-pct, 50%); transition: left 0.5s var(--ease);
}
.st-comms-ticker {
  font-family: var(--mono); font-size: 11px; color: var(--ink-mute);
  letter-spacing: 0.04em; white-space: nowrap; overflow: hidden;
  border-top: 1px solid var(--panel-edge); padding: 5px 16px; background: var(--sh-black);
  cursor: pointer; transition: background-color 0.2s ease;
}
.st-comms-ticker:hover {
  background: rgba(57,208,255,0.05);
}
.st-comms-ticker .sender {
  color: var(--accent); text-transform: uppercase; letter-spacing: 0.1em;
  font-size: 9px; margin-right: 8px;
}
#sf-comms, #sf-comm-backlog, #sf-comm-backlog-btn {
  display: none !important;
}
.st-comms-panel {
  position: absolute; right: 0; top: 53px; bottom: 25px; width: 340px;
  background: rgba(8,14,26,0.97); border-left: 1px solid var(--panel-edge);
  transform: translateX(100%); transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex; flex-direction: column; z-index: 100;
  /* no backdrop-filter: it composites over the live WebGL canvas every frame; the 0.97 fill reads
     the same without the per-frame blur (perf-sensitive iGPUs + the ui:perf compositor-shell rule). */
}
.st-comms-panel.open {
  transform: translateX(0);
}
.st-comms-panel-head {
  padding: 10px 16px; border-bottom: 1px solid var(--panel-edge);
  display: flex; justify-content: space-between; align-items: center;
  font-family: var(--font-display); font-size: 13px; font-weight: 600;
  letter-spacing: 0.09em; text-transform: uppercase; color: var(--accent);
}
.st-comms-panel-close {
  cursor: pointer; color: var(--ink-mute); font-family: var(--mono); font-size: 11px;
}
.st-comms-panel-close:hover { color: var(--ink); }
.st-comms-panel-body {
  flex: 1; overflow-y: auto; padding: 12px 16px; display: flex; flex-direction: column; gap: 8px;
}
.st-comms-panel-row {
  font-family: var(--font-body); font-size: 13px; line-height: 1.45; color: var(--ink);
}
.st-hub button:active:not(:disabled) {
  transform: scale(0.96); transition: transform 50ms ease;
}
[data-tip]::after {
  border-left: 3px solid var(--tip-accent, var(--panel-edge-2));
}
[data-tip-severity="ok"]   { --tip-accent: var(--good); }
[data-tip-severity="warn"] { --tip-accent: var(--warn); }
[data-tip-severity="bad"]  { --tip-accent: var(--danger); }

/* ===== Refined surfaces: soft elevated cards, calm separators, restrained accent ================ */
.st-hub { line-height: 1.5; }
.st-topbar { height: 60px; padding: 0 24px; border-bottom: 1px solid var(--st-line);
  background: linear-gradient(180deg, rgba(255,255,255,0.028), transparent); }
.st-station-fac { border: 1px solid var(--st-line); background: rgba(255,255,255,0.03); color: var(--ink-dim);
  letter-spacing: .07em; padding: 3px 11px; }
.st-airlock { border-bottom: 1px solid var(--st-line); background: rgba(255,255,255,0.012); }

/* Left rail — full words always (no Mark… / TRADE DESK H…) */
.st-rail { width: 228px; padding: 12px 10px; gap: 2px; border-right: 1px solid var(--st-line);
  background: linear-gradient(180deg, rgba(255,255,255,0.014), transparent); }
.st-tab { padding: 10px 12px; column-gap: 11px; color: var(--ink-dim); border: 1px solid transparent;
  transition: background .16s ease, color .16s ease, border-color .16s ease; }
.st-tab:hover { background: rgba(255,255,255,0.05); color: var(--ink); }
.st-tab:focus-visible { outline: 2px solid var(--st-accent); outline-offset: 2px; }
.st-tab.active { color: #fff; border-color: var(--st-line);
  background: linear-gradient(90deg, var(--st-accent-soft), rgba(255,255,255,0.02));
  box-shadow: inset 2px 0 0 var(--st-accent); }
.st-tab[data-service-status="unavailable"].active { border-color: color-mix(in srgb, var(--warn) 32%, transparent);
  box-shadow: inset 2px 0 0 var(--warn); }
.st-tab-icon { color: var(--ink-mute); }
.st-tab.active .st-tab-icon { color: var(--st-accent); }
.st-tab-service { font-size: .6rem; letter-spacing: .06em; line-height: 1.3; }

/* Console deck + status row — compact under desk mode */
.st-console-deck { padding: 8px 16px 6px; gap: 4px; border-bottom: 1px solid var(--st-line);
  overflow: visible;
  background: linear-gradient(180deg, color-mix(in srgb, var(--st-accent) 6%, transparent), transparent 80%); }
.st-hub--desk .st-console-deck { padding: 6px 14px 4px; }
.st-status-row { padding: 6px 16px; border-bottom: 1px solid var(--st-line); font-size: .72rem; }
.st-econ-badge, .st-readiness-summary { letter-spacing: .04em; text-transform: none; }
.st-hub--desk .st-handoff { padding: 8px 14px; }
.st-hub--desk .st-handoff-step-title { white-space: normal; overflow: visible; text-overflow: clip; }
.st-hub--desk .st-departure { padding: 6px 14px; min-height: 0; }

/* Service Dock nodes → glass berth chips (scale/lift owned by dockRail; keep transform free). */
.st-hub .sf-fx-dock { gap: 10px; --sf-fx-dock-pad-top: 48px; }
.st-hub .sf-fx-dock__item { min-width: 78px; padding: 10px 12px; border-radius: var(--st-r-sm);
  background:
    linear-gradient(160deg, color-mix(in srgb, var(--st-accent) 12%, transparent), transparent 50%),
    linear-gradient(180deg, rgba(255,255,255,.06), transparent 40%),
    var(--st-raised);
  border: 1px solid color-mix(in srgb, var(--st-accent) 28%, var(--st-line));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.10),
    inset 0 -1px 0 rgba(0,0,0,.25),
    0 8px 20px -12px rgba(0,0,0,0.75);
  transition: border-color .14s var(--ease, ease-out), box-shadow .14s var(--ease, ease-out), background .14s var(--ease, ease-out); }
.st-hub .sf-fx-dock__item:hover {
  background:
    linear-gradient(160deg, color-mix(in srgb, var(--st-accent) 16%, transparent), transparent 52%),
    linear-gradient(180deg, rgba(255,255,255,.08), transparent 42%),
    color-mix(in srgb, var(--st-accent) 7%, var(--st-raised)); }
.st-hub .sf-fx-dock__item.is-focus {
  border-color: color-mix(in srgb, var(--st-accent) 62%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.14),
    0 0 0 1px color-mix(in srgb, var(--st-accent) 26%, transparent),
    0 12px 28px -10px color-mix(in srgb, var(--st-accent) 46%, transparent); }
.st-hub .sf-fx-dock__item.is-adjacent {
  border-color: color-mix(in srgb, var(--st-accent) 40%, transparent);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.10),
    0 8px 20px -12px color-mix(in srgb, var(--st-accent) 28%, transparent); }
.st-hub .sf-fx-dock__label { font-size: .68rem; letter-spacing: .01em; color: var(--ink-dim); }
.st-hub .sf-fx-dock__icon { color: var(--st-accent); font-size: 1.22em; }
.st-hub .sf-fx-dock__badge { font-size: .62rem; letter-spacing: .04em; }

/* Departure strip → soft pills */
.st-departure { padding: 11px 24px; gap: 8px; border-bottom: 1px solid var(--st-line); min-height: 46px; }
.st-departure-label { font-size: .62rem; }
.st-departure-chip { border-radius: 999px; padding: 4px 12px; min-height: 27px; background: var(--st-surface);
  border: 1px solid var(--st-line); font-size: .74rem; }
button.st-departure-chip:hover { background: rgba(255,255,255,0.055); }

/* First-dock handoff → soft cards */
.st-handoff { padding: 13px 24px; gap: 8px; border-bottom: 1px solid var(--st-line); }
.st-handoff-copy { color: var(--ink-dim); font-size: .78rem; }
.st-handoff-step { padding: 11px 14px; border-radius: var(--st-r-sm); border: 1px solid var(--st-line);
  background: var(--st-surface); box-shadow: var(--st-shadow); }
.st-handoff-step-title { font-size: .84rem; }
.st-handoff-step-copy { font-size: .76rem; line-height: 1.5; color: var(--ink-dim); }

/* Tab panels + content */
.st-tabpanel { padding: 22px 26px; }
.st-empty { font-size: .9rem; }

/* Inspector / briefing drawer */
.st-inspector { width: 300px; border-left: 1px solid var(--st-line);
  background: linear-gradient(180deg, rgba(255,255,255,0.02), transparent), rgba(12,17,28,0.94); }
.st-inspector.is-collapsed { width: 0; }
.st-inspector-header { padding: 12px 16px; font-size: .62rem; letter-spacing: .12em; border-bottom: 1px solid var(--st-line); }
.st-inspector-content { padding: 14px 16px; gap: 16px; }
.st-ins-section { gap: 6px; padding-bottom: 18px; border-bottom: 1px solid var(--st-line); }
.st-ins-section:last-child { border-bottom: none; padding-bottom: 0; }
.st-ins-title { font-size: .6rem; letter-spacing: .14em; color: var(--ink-mute); }
.st-ins-tab-icon { color: var(--st-accent); }
.st-ins-tab-name { font-size: 1.02rem; font-weight: 650; letter-spacing: 0; }
.st-ins-desc { font-size: .82rem; line-height: 1.55; color: var(--ink-dim); }
.st-ins-row { font-size: .84rem; }
.st-ins-row-detail, .st-ins-risk-desc { font-size: .79rem; line-height: 1.55; }
.st-ins-hint { font-size: .79rem; line-height: 1.5; }

/* Cards across panels → soft elevated (replaces hard borders + cyan glows) */
.st-mission-card, .st-svc-row, .st-bar-card, .st-sy-card, .st-slot, .st-manuf-card, .st-market-planner,
.st-market-purpose, .st-sy-guide, .st-mission-guide, .st-svc-row {
  border-radius: var(--st-r-sm); border: 1px solid var(--st-line); background: var(--st-surface);
  box-shadow: var(--st-shadow); }
.st-mission-card.tracked, .st-sy-card.active, .st-slot.sel {
  border-color: color-mix(in srgb, var(--st-accent) 45%, transparent);
  box-shadow: 0 10px 26px -12px color-mix(in srgb, var(--st-accent) 34%, transparent); }
.st-shop-row { border-radius: var(--st-r-xs); }
.st-shop-row:hover { background: rgba(255,255,255,0.04); }

/* Undock refined (readiness colours preserved; pinned label/attrs untouched) */
.st-undock { background: var(--st-surface); border: 1px solid var(--st-line); box-shadow: var(--st-shadow); }
.st-undock[data-readiness="ready"] { color: var(--good); border-color: color-mix(in srgb, var(--good) 42%, transparent);
  background: color-mix(in srgb, var(--good) 13%, var(--st-surface)); }
.st-undock[data-readiness="ready"]:hover { background: color-mix(in srgb, var(--good) 26%, var(--st-surface)); box-shadow: 0 10px 24px -12px color-mix(in srgb, var(--good) 40%, transparent); }
.st-undock[data-readiness="check"] { border-color: color-mix(in srgb, var(--warn) 42%, transparent); background: color-mix(in srgb, var(--warn) 12%, var(--st-surface)); }
.st-undock[data-readiness="risk"] { border-color: color-mix(in srgb, var(--danger) 42%, transparent); background: color-mix(in srgb, var(--danger) 12%, var(--st-surface)); }

/* Comms rail */
.st-comms-ticker { padding: 8px 24px; font-size: 11.5px; border-top: 1px solid var(--st-line); background: rgba(8,12,20,0.6); }

@media (prefers-reduced-motion: reduce) {
  .st-hub *, .st-modal * {
    animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important;
  }
  .st-station-name.acquiring::after { animation: none; }
  .st-undock::before { transition: none; }
  .st-content::after { animation: none; }
  .st-content-spinner, .st-eng-stage__spinner { animation: none; }
}
`;
