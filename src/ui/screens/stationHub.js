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
import { createServicesPanel, serviceQuote } from './services.js';
import { createManufacturePanel } from './manufacture.js';
import { createFactionsPanel, tierFor, factionStandingGuidance } from './factions.js';
import { createBarPanel } from './bar.js';
import { SECTORS } from '../../data/sectors.js';
import { FACTION_META } from '../../data/factions.js';
import { NEW_GAME } from '../../data/newGameDefaults.js';
import { COMMODITIES } from '../../data/commodities.js';
import { isUnsellableCargo } from '../../systems/cargo.js';
import { escapeHtml } from '../comms.js';
import { missionPreflight } from '../missionPreflight.js';
import { missionConsequenceSummary } from '../missionPreflight.js';
import { missionStandingRequirement } from '../missionPreflight.js';
import { missionRouteIntel, missionCargoFootprint, fmtHoldUnits } from '../missionPreflight.js';
import { BINDINGS } from '../bindings.js';
import { MAP_FOCUS, openGalaxyMap } from '../mapAuthority.js';
import { glyphSvg } from '../uiPrimitives.js';
import { STATION_BROADCASTS } from '../../systems/stationBroadcast.js';
// Command-deck effect layer (vanilla DOM/canvas factories; view-only, no sim import).
// See design/revamp/COMMAND_DECK_EFFECTS_AND_GAMEPLAY_BIBLE.md §1 and src/ui/effects/README.md.
import {
  createRippleField,
  createRouteBeam,
  createMorphLabel,
  createCircularGauge,
  createDockRail,
} from '../effects/index.js';
import { dataBar, setDataBar } from '../uiPrimitives.js';
import { confirm, isConfirmOpen } from '../confirm.js';

// === Functional parity (post-gold) — keep game working; no career UI chrome ===
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

/** Station OS root classes: the gold framed bases (f6f6a90c) plus the fullscreen OS shell mode
 *  (design/STATION_SHELL_CONTRACT.md — rail | workspace | top strip, tools own the screen). */
export const STATION_HUB_ROOT_BASE_CLASSES = Object.freeze([
  'st-hub',
  'panel',
  'st-hub--os',
]);
export const STATION_HUB_TYPE_CLASSES = Object.freeze([
  'st-hub--trade_hub', 'st-hub--refinery', 'st-hub--mining', 'st-hub--fab',
  'st-hub--military', 'st-hub--blackmarket', 'st-hub--research',
]);
export function applyStationHubRootClasses(el, stationType) {
  if (!el || !el.classList) return el || null;
  for (const c of STATION_HUB_ROOT_BASE_CLASSES) el.classList.add(c);
  el.classList.remove('st-hub--desk');
  for (const c of STATION_HUB_TYPE_CLASSES) el.classList.remove(c);
  const typeClass = stationType ? `st-hub--${stationType}` : null;
  if (typeClass && STATION_HUB_TYPE_CLASSES.includes(typeClass)) el.classList.add(typeClass);
  return el;
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



const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const STATION_BY_ID = new Map();
for (const sec of SECTORS) {
  for (const stn of sec.stations || []) STATION_BY_ID.set(stn.id, stn);
}

const TABS = [
  { id: 'market', label: 'Market', icon: '⚖', help: 'Buy cargo, sell cargo, and set profitable trade nav routes.' },
  { id: 'shipyard', label: 'Shipyard', icon: '⛴', help: 'Buy whole ships (new chassis). Changes base cargo, toughness, and what module sizes fit.' },
  { id: 'outfit', label: 'Outfitting', icon: '⚙', help: 'Buy and install modules on your current ship: guns, shields, cargo pods, mining tools.' },
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
  // A deliberately loaded trade route is the player's current intent — it outranks the
  // standing tracked-mission chip until the cargo is delivered.
  const tradeWaypoint = state && state.nav && state.nav.waypoint;
  if (tradeWaypoint && tradeWaypoint.kind === 'trade') {
    const tradeChip = departureTradeWaypointChip(state, tradeWaypoint);
    if (tradeChip) return tradeChip;
  }
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

export function departureReadinessChips(state) {
  return [
    departureMissionChip(state),
    departureCargoChip(state),
    departureFuelChip(state),
    departureHullChip(state),
  ];
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
  return [
    {
      // Sell path opens Market → Selling (trade desk), not the Hold manifest.
      // Hold is inventory-only; Market is where buy/sell and price intel live.
      key: 'hold',
      label: 'Cargo',
      title: marketDone
        ? 'Cargo sold — hold is ready'
        : (hasCargo ? 'Sell what you hauled' : 'Open your hold'),
      text: marketDone
        ? 'Credits banked and space free for the next run.'
        : (hasCargo
            ? 'Opens Market → Selling. Sell what is in your hold at the station price, then free capacity for new cargo.'
            : 'Opens Hold. Nothing to sell yet — check Market prices or undock to mine.'),
      kind: marketDone ? 'ok' : 'warn',
      done: marketDone,
      targetTab: hasCargo ? 'market' : 'hold',
      tradeMode: hasCargo ? 'sell' : null,
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
  const modeAttr = step.tradeMode
    ? ' data-handoff-trade-mode="' + escapeHtml(step.tradeMode) + '"'
    : '';
  const modeSuffix = step.tradeMode === 'sell'
    ? ' (Selling)'
    : (step.tradeMode === 'buy' ? ' (Buying)' : '');
  return '<button type="button" class="' + cls + '" data-handoff-tab="' + escapeHtml(step.targetTab) + '"' +
    modeAttr +
    ' title="' + escapeHtml('Open ' + tabLabel(step.targetTab) + modeSuffix + ': ' + step.title) + '"' +
    ' aria-label="' + escapeHtml('Open ' + tabLabel(step.targetTab) + modeSuffix + ': ' + step.title + '. ' + step.text) + '">' +
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
    const safeReady = candidates.filter((candidate) => candidate.risk <= 1 && candidate.readiness.state !== 'blocked');
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

let cssInjected = false;
function injectCss() {
  if (cssInjected || typeof document === 'undefined') return;
  cssInjected = true;
  const style = document.createElement('style');
  style.id = 'ui-station-styles';
  style.textContent = STATION_CSS;
  document.head.appendChild(style);
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
  shipyard: 'Buy a whole new ship. Bigger chassis = more base hold and bigger module slots.',
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

/**
 * Stable structural identity for the Service Dock. Readiness is deliberately excluded: the hub
 * refreshes a few times per second while docked, and rebuilding the buttons on each refresh resets
 * their pointer/focus state halfway through the magnification curve.
 * @param {Array<{id?: string, label?: string, icon?: string}>} items
 */
export function dockRailItemKey(items = []) {
  return items.map((item) => [item && item.id, item && item.label, item && item.icon]
    .map((value) => String(value == null ? '' : value)).join('\u001f')).join('\u001e');
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
  _ctx: null,
  _panels: null,        // { market, shipyard, outfit, services, factions, bar } panel objects
  _missionEls: null,
  _stationId: null,
  _subbed: false,

  /**
   * Exit-gate owner: confirm when needed, then commit undock (functional parity with post-gold exit system).
   * No career rails — pure undock.
   */
  async requestStationExit(req = {}) {
    const bus = this._ctx && this._ctx.bus;
    if (!bus) return;
    const intent = req.intent === 'explicit' ? 'explicit' : 'implicit';
    const held = !!req.held;
    const readiness = (this._undockBtn && this._undockBtn.getAttribute('data-readiness')) || 'ready';
    if (stationExitNeedsConfirm(intent, readiness, held)) {
      const ok = await confirm({
        title: 'Leave station?',
        body: 'Undock and return to flight?',
        confirmLabel: 'Undock',
        cancelLabel: 'Stay',
        opener: req.opener || null,
      });
      if (!ok) return;
    }
    commitStationUndock(bus, {
      intent,
      held,
      source: req.source || 'station-exit',
    });
  },

  /** Build the screen DOM once and cache it. Called by uiRoot/screenManager.
   *
   *  Station OS layout (design/STATION_SHELL_CONTRACT.md — the Berth Ledger):
   *    top deck   — station identity · live vitals (credits/fuel/hull/hold) · Briefing (Meta) · Undock
   *    berth      — Service Dock strip: live readiness badges, hover = quote, click = ACT
   *    handoff    — one dismissible first-dock strip (early game only)
   *    body       — nav rail | full-height tool workspace | Briefing drawer (collapsed by default)
   *    footer     — Departure Check chips + station status readout
   */
  mount(rootEl, ctx) {
    this._ctx = ctx;
    installStationExitGate(ctx);
    setStationExitOwner(this);
    injectCss();

    const screen = document.createElement('div');
    // Gold framed bases seed first (pinned), then the OS shell + type modifiers layer on.
    screen.className = 'st-hub panel';
    applyStationHubRootClasses(screen, null);

    // ── Top deck: identity · vitals · Briefing · Undock ────────────────────────
    const topbar = document.createElement('div');
    topbar.className = 'st-topbar st-topdeck';
    topbar.innerHTML =
      '<div class="st-topdeck-id">' +
        '<span class="st-station-name">Station</span>' +
        '<span class="st-station-fac mono"></span>' +
      '</div>' +
      '<div class="st-vitals" role="group" aria-label="Ship vitals">' +
        '<div class="st-vital st-top-credits"><span class="st-vital-l mono">Credits</span><span class="st-vital-v mono st-credits-mount"></span></div>' +
        '<div class="st-vital st-top-fuel"><span class="st-vital-l mono">Fuel</span><span class="st-vital-v mono" data-vital="fuel">—</span><span class="st-vital-bar" data-vbar="fuel"></span></div>' +
        '<div class="st-vital st-top-hull"><span class="st-vital-l mono">Hull</span><span class="st-vital-v mono" data-vital="hull">—</span><span class="st-vital-bar" data-vbar="hull"></span></div>' +
        '<div class="st-vital st-top-cargo"><span class="st-vital-l mono">Hold</span><span class="st-vital-v mono" data-vital="hold">—</span><span class="st-vital-bar" data-vbar="hold"></span></div>' +
      '</div>' +
      '<button type="button" class="st-inspector-toggle" aria-expanded="false" ' +
        'title="Open the station briefing: purpose, standing, and local advisories.">Briefing</button>' +
      '<button class="st-undock">⏏ UNDOCK</button>';
    screen.appendChild(topbar);
    // Vitals mounts: bars are sf-data-bar primitives updated in place (no reflow), the credits
    // readout is a Readout Morph that rolls only when the value actually changes.
    this._vitalEls = {
      creditsMount: topbar.querySelector('.st-credits-mount'),
      fuelV: topbar.querySelector('[data-vital="fuel"]'),
      hullV: topbar.querySelector('[data-vital="hull"]'),
      holdV: topbar.querySelector('[data-vital="hold"]'),
      bars: {},
    };
    for (const key of ['fuel', 'hull', 'hold']) {
      const mountEl = topbar.querySelector('[data-vbar="' + key + '"]');
      if (mountEl) {
        const bar = dataBar(0, { label: key + ' level' });
        mountEl.appendChild(bar);
        this._vitalEls.bars[key] = bar;
      }
    }
    this._lastCreditsShown = null;

    // ── Berth strip: the Service Dock centerpiece. Nodes act (verbs / tool jumps),
    //    hovering or focusing a node quotes it in the side readout before commit. ──
    const berth = document.createElement('div');
    berth.className = 'st-berth';
    berth.setAttribute('data-centerpiece', 'station-service-console');
    berth.innerHTML =
      '<div class="st-service-nodes-pane" role="group" aria-label="Berth services"></div>' +
      '<div class="st-berth-side">' +
        '<div class="st-berth-caption mono">Berth services</div>' +
        '<div class="st-berth-quote" aria-live="polite"></div>' +
      '</div>';
    screen.appendChild(berth);
    this._nodesPane = berth.querySelector('.st-service-nodes-pane');
    this._berthQuoteEl = berth.querySelector('.st-berth-quote');
    this._berthCaptionEl = berth.querySelector('.st-berth-caption');
    // Console Key grammar: hover/focus reveals the consequence (cost, delta) before commit.
    // One shared quote surface — never more than one delta readout at a time.
    berth.addEventListener('pointerover', (ev) => {
      const node = ev.target.closest && ev.target.closest('[data-service]');
      if (node) this._showBerthQuote(node.getAttribute('data-service'));
    });
    berth.addEventListener('pointerleave', () => this._showBerthQuote(null));
    berth.addEventListener('focusin', (ev) => {
      const node = ev.target.closest && ev.target.closest('[data-service]');
      if (node) this._showBerthQuote(node.getAttribute('data-service'));
    });
    berth.addEventListener('focusout', (ev) => {
      if (!berth.contains(ev.relatedTarget)) this._showBerthQuote(null);
    });

    // ── First-dock handoff: ONE dismissible strip, not permanent layout chrome. ──
    const handoff = document.createElement('div');
    handoff.className = 'st-handoff';
    handoff.hidden = true;
    handoff.innerHTML =
      '<span class="st-handoff-label mono">First dock — do these three</span>' +
      '<div class="st-handoff-steps"></div>' +
      '<button type="button" class="st-handoff-dismiss" data-handoff-dismiss ' +
        'title="Hide this checklist" aria-label="Dismiss the first-dock checklist">Got it</button>';
    screen.appendChild(handoff);
    this._handoffEl = handoff;
    handoff.addEventListener('click', (ev) => {
      const dismiss = ev.target.closest('[data-handoff-dismiss]');
      if (dismiss) {
        ctx.state.ui.firstDockHandoffDismissed = true;
        this._refreshHandoff();
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
        return;
      }
      const target = ev.target.closest('[data-handoff-tab]');
      if (!target || !this._handoffEl || !this._handoffEl.contains(target)) return;
      const tabId = target.getAttribute('data-handoff-tab');
      if (!TABS.some((t) => t.id === tabId) && tabId !== 'hold') return;
      const tradeMode = target.getAttribute('data-handoff-trade-mode') || null;
      this.setTab(tabId, { focusRail: true, tradeMode: tradeMode || undefined });
      ctx.bus.emit('audio:cue', { id: 'ui_tab' });
    });

    // ── Body: nav rail | tool workspace | Briefing drawer ──────────────────────
    const body = document.createElement('div');
    body.className = 'st-body';

    const rail = document.createElement('div');
    rail.className = 'st-rail';
    rail.setAttribute('role', 'tablist');
    rail.setAttribute('aria-label', 'Station sections');

    const content = document.createElement('div');
    content.className = 'st-content';

    // Briefing drawer (Meta, opt-in): all station lore/diagnostics live here, collapsed by
    // default so the workspace keeps its ≥70% budget. .st-purpose stays inside for the checks.
    const inspector = document.createElement('aside');
    inspector.className = 'st-inspector is-collapsed';
    inspector.setAttribute('aria-label', 'Station briefing');
    const inspectorInner = document.createElement('div');
    inspectorInner.className = 'st-inspector-inner';
    inspector.appendChild(inspectorInner);

    const inspectorHead = document.createElement('div');
    inspectorHead.className = 'st-inspector-header mono';
    inspectorHead.textContent = 'Station Briefing';
    inspectorInner.appendChild(inspectorHead);

    const inspectorContent = document.createElement('div');
    inspectorContent.className = 'st-inspector-content';
    inspectorInner.appendChild(inspectorContent);

    // Airlock wall: story graffiti accumulates here (managed by _refreshGraffiti, never wiped
    // by the briefing re-render above it).
    const airlock = document.createElement('div');
    airlock.className = 'st-airlock';
    airlock.innerHTML = '<div class="st-airlock__label mono">Airlock wall</div><div class="st-airlock__graffiti"></div>';
    inspectorInner.appendChild(airlock);
    this._airlockEl = airlock.querySelector('.st-airlock__graffiti');

    const purpose = document.createElement('div');
    purpose.className = 'st-purpose';
    purpose.innerHTML =
      '<div class="st-purpose-main"><span class="st-purpose-type mono">Station</span><span class="st-purpose-copy"></span></div>' +
      '<div class="st-purpose-sub"><span class="st-purpose-tab"></span><span class="st-purpose-services"></span></div>';
    inspectorInner.appendChild(purpose);
    this._purposeEl = purpose;

    this._inspectorEl = inspector;
    this._inspectorToggle = topbar.querySelector('.st-inspector-toggle');
    this._inspectorToggle.addEventListener('click', () => {
      const collapsed = inspector.classList.toggle('is-collapsed');
      this._inspectorToggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      this._inspectorToggle.classList.toggle('active', !collapsed);
      if (!collapsed) this._updateInspector();
      ctx.bus.emit('audio:cue', { id: 'ui_tab' });
    });

    body.appendChild(rail);
    body.appendChild(content);
    body.appendChild(inspector);
    screen.appendChild(body);

    // ── Footer: Departure Check rail + station status. The clearance hairline above it
    //    fills as chips clear — launch readiness you can read from across the room. ──
    const footer = document.createElement('div');
    footer.className = 'st-footer';
    const departure = document.createElement('div');
    departure.className = 'st-departure';
    departure.innerHTML =
      '<div class="st-departure-label mono">Departure Check</div>' +
      '<div class="st-departure-chips"></div>';
    footer.appendChild(departure);
    const statusChip = document.createElement('div');
    statusChip.className = 'st-econ-badge mono';
    statusChip.innerHTML = '<span class="st-econ-mount"></span>';
    footer.appendChild(statusChip);
    screen.appendChild(footer);
    this._footerEl = footer;
    this._econBadge = statusChip;
    this._econMorphMount = statusChip.querySelector('.st-econ-mount');
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
      b.innerHTML =
        '<span class="st-tab-icon sf-glyph" aria-hidden="true">' + (glyphSvg(t.id) || t.icon) + '</span>' +
        '<span class="st-tab-label">' + t.label + '</span>' +
        '<span class="st-tab-service mono" aria-hidden="true"></span>';
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
        holdBtn.title = 'View cargo hold manifest, capacity, and item values.';
        holdBtn.setAttribute('aria-label', 'Hold: View cargo hold manifest, capacity, and item values.');
        holdBtn.innerHTML =
          '<span class="st-tab-icon sf-glyph" aria-hidden="true">' + (glyphSvg('hold') || '■') + '</span>' +
          '<span class="st-tab-label">Hold</span>' +
          '<span class="st-tab-service mono" aria-hidden="true"></span>';
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

    let chargeTimer = null;
    undockBtn.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || undockBtn.disabled) return;
      undockBtn.classList.remove('abort');
      undockBtn.classList.add('charging');
      ctx.bus.emit('audio:cue', { id: 'ui_charge_start' });

      chargeTimer = setTimeout(() => {
        undockBtn.classList.remove('charging');
        ctx.bus.emit('audio:cue', { id: 'ui_undock' });
        commitStationUndock(ctx.bus, { intent: 'explicit', held: true, source: 'undock-hold' });
        chargeTimer = null;
      }, 600);
    });

    undockBtn.addEventListener('mouseup', () => {
      if (chargeTimer) {
        clearTimeout(chargeTimer);
        chargeTimer = null;
        undockBtn.classList.remove('charging');
        undockBtn.classList.add('abort');
        ctx.bus.emit('audio:cue', { id: 'ui_charge_abort' });
      }
    });

    undockBtn.addEventListener('mouseleave', () => {
      if (chargeTimer) {
        clearTimeout(chargeTimer);
        chargeTimer = null;
        undockBtn.classList.remove('charging');
        undockBtn.classList.add('abort');
      }
    });

    // Keep click for keyboard accessibility
    undockBtn.addEventListener('click', (e) => {
      if (e.detail === 0) { // synthetic click (e.g. keyboard Enter/Space)
        ctx.bus.emit('audio:cue', { id: 'ui_click' });
        commitStationUndock(ctx.bus, { intent: 'explicit', held: false, source: 'undock-key' });
      }
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
    // contract). Instances are inert until their verb fires (morph until set(), dock until items
    // land), so building them now costs nothing at rest.
    this._selectedService = null;
    this._selectedMissionId = null;
    this._lastEconKey = null;
    this._lastOpsStateKey = null;
    this._fx = {};
    try {
      this._fx.morph = createMorphLabel(this._econMorphMount, { numeric: false });
      this._fx.credits = createMorphLabel(this._vitalEls.creditsMount, { numeric: true });
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

    const refresh = () => {
      const state = ctx.state;
      const cargo = state && state.player && state.player.cargo || {};
      const cap = Number(cargo.capVolume) || 40;
      const used = Number(cargo.usedVolume) || 0;
      const free = Math.max(0, cap - used);
      const percent = Math.round((used / cap) * 100);

      let html = `
        <div class="st-sub-h">Cargo Hold Manifest</div>
        <div class="st-hold-header">
          <div class="st-hold-meter-label mono">HOLD STORAGE: ${used}/${cap} units (${percent}%)</div>
          <div class="st-hold-meter">
            <div class="st-hold-meter-fill" style="width: ${percent}%"></div>
          </div>
        </div>
      `;

      const items = cargo.items || {};
      const list = Object.entries(items).filter(([id, qty]) => Number(qty) > 0);
      const richLots = Array.isArray(cargo.richLots)
        ? cargo.richLots.filter((lot) => lot && lot.qty > 0)
        : [];
      if (richLots.length) {
        html += '<div class="st-slotline" style="margin:10px 0 6px">RICH ORE LOTS · PROVENANCE</div>';
        html += richLots.map(richLotReadoutHtml).join('');
      }

      if (list.length === 0) {
        html += `<div class="st-empty">Cargo hold is currently empty.</div>`;
      } else {
        html += `
          <div class="st-hold-grid">
            <div class="st-row st-row-head">
              <span>Commodity</span>
              <span class="c-num">Qty</span>
              <span class="c-num">Vol</span>
              <span class="c-num">Local Price</span>
              <span></span>
            </div>
        `;

        for (const [id, qty] of list) {
          const com = COMMODITY_BY_ID.get(id) || { name: prettyId(id), volume: 1 };
          const vol = (com.volume || 1) * qty;

          const stn = this._stationDef();
          const unitPay = stn ? holdUnitSellPrice(state, stn.id, id) : null;
          const priceText = unitPay != null ? unitPay.toLocaleString('en-US') + ' cr' : 'no quote';

          // Sealed contract freight (preloaded-mission cargo) cannot be sold mid-run — selling it
          // bricks the delivery with no recovery. Mirror the jettison lock: disable + relabel.
          const locked = isUnsellableCargo(state, id);
          let sellButtons;
          if (locked) {
            const lockTitle = 'Contract cargo cannot be sold — it is required for an active mission';
            sellButtons = `
                <button type="button" class="st-sell-btn" disabled
                  title="${lockTitle}" aria-label="${lockTitle}">LOCK: CONTRACT</button>`;
          } else {
            sellButtons = `
                <button type="button" class="st-sell-btn" data-sell-cmdty="${id}" data-sell-qty="1"
                  title="Sell one unit at the station's live price">Sell 1</button>
                <button type="button" class="st-sell-btn st-sell-btn--all" data-sell-cmdty="${id}" data-sell-qty="${qty}"
                  title="Sell every unit${unitPay != null ? ' · about ' + (unitPay * qty).toLocaleString('en-US') + ' cr' : ''}">Sell all</button>`;
          }

          html += `
            <div class="st-row">
              <span class="c-name">${com.name}</span>
              <span class="c-num">${qty}</span>
              <span class="c-num">${vol}</span>
              <span class="c-num">${priceText}</span>
              <span class="c-act">
                ${sellButtons}
              </span>
            </div>
          `;
        }

        html += `</div>`;
      }

      el.innerHTML = html;

      // Live intent: ui:sell → economy.handleTrade mutates cargo + credits and answers with
      // economy:tradeCompleted (which repaints this panel and the top-deck vitals).
      el.querySelectorAll('[data-sell-cmdty]').forEach(btn => {
        btn.addEventListener('click', () => {
          const cmdtyId = btn.getAttribute('data-sell-cmdty');
          const qty = Math.max(1, Math.floor(Number(btn.getAttribute('data-sell-qty')) || 1));
          ctx.bus.emit('ui:sell', { commodityId: cmdtyId, qty });
          ctx.bus.emit('audio:cue', { id: 'ui_click' });
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
    if (typeof document === 'undefined' || !this._nodesPane) return;
    const stn = this._stationDef();
    if (!stn) return;

    // Service Dock: the canonical berth services, each ONLINE (offered here) or OFFLINE. Built via the
    // dockRail effect (create-once, update-many) so hover/focus magnify + readiness badges are shared
    // with the rest of the command deck. Selecting a node ACTS: berth verbs quote→confirm, tool
    // services open their tool, offline services route you to the nearest berth that has them.
    if (this._fx && this._fx.dock) {
      const items = this._berthServiceItems(stn);
      const itemKey = dockRailItemKey(items);
      if (this._dockRailItemKey !== itemKey) {
        // Structural changes (first mount or a future service-layout change) may rebuild safely.
        // Do this once, not on the low-cadence periodic refresh path.
        this._fx.dock.setItems(items);
        this._dockRailItemKey = itemKey;
        if (this._selectedService) this._fx.dock.setFocus(this._selectedService);
      } else {
        // Live fuel/hull/availability text can change while docked. Update badges in place so a
        // pointer-driven dock curve keeps its transform, hover target, and keyboard focus.
        for (const item of items) this._fx.dock.setReadiness(item.id, item.readiness);
      }
    }
    if (this._berthCaptionEl) {
      const online = (Array.isArray(stn.services) ? stn.services : [])
        .filter((svc) => CANONICAL_BERTH_SERVICES.includes(svc)).length;
      this._berthCaptionEl.textContent = 'Berth services · ' + online + ' online';
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

  /** A Service Dock node was chosen: ACT on it. Berth verbs (refuel/repair) quote→confirm→mutate
   *  via ui:service; tool services open their tool; offline services explain and point at the
   *  nearest berth that has them. Click = do — never "select trivia". */
  _selectService(svc) {
    if (!svc) return;
    this._selectedService = svc;
    if (this._fx && this._fx.dock) this._fx.dock.setFocus(svc);
    this._showBerthQuote(svc);
    const ctx = this._ctx;
    if (!ctx) return;
    const stn = this._stationDef();
    if (!this._serviceOffered(svc)) {
      const near = nearestStationOffering(svc, stn && stn.id);
      const where = near ? ('Nearest: ' + near.name + ' · ' + near.sector + '.') : 'None charted yet.';
      ctx.bus.emit('toast', {
        text: stationServiceLabel(svc) + ' is offline at ' + ((stn && stn.name) || 'this berth') + '. ' + where,
        kind: 'info', ttl: 3.5,
      });
      ctx.bus.emit('audio:cue', { id: 'ui_deny' });
      return;
    }
    if (svc === 'refuel' || svc === 'repair') {
      this._actOnService(svc);
      return;
    }
    // Tool services: the verb lives on that tool — go there directly.
    this.setTab(tabForService(svc), { focusRail: false });
    ctx.bus.emit('audio:cue', { id: 'ui_tab' });
  },

  /** Quote→confirm→commit for a berth verb (same grammar and pricing as the Services tool). */
  async _actOnService(svc) {
    const ctx = this._ctx;
    if (!ctx) return;
    const state = ctx.state;
    const entity = state.entities && state.entities.get && state.entities.get(state.playerId);
    const quote = serviceQuote(svc, state, entity);
    if (!quote || quote.disabled || !(quote.amount > 0)) {
      const why = quote && quote.disabledReason ? ' — ' + quote.disabledReason : '';
      ctx.bus.emit('toast', {
        text: (quote && quote.detail) ? quote.detail + why : ('Nothing to ' + svc + ' right now.'),
        kind: 'info', ttl: 2.5,
      });
      ctx.bus.emit('audio:cue', { id: 'ui_deny' });
      return;
    }
    if (quote.cost > 0) {
      const ok = await confirm({
        title: quote.buttonLabel || stationServiceLabel(svc),
        body: quote.detail + ' · ' + Math.round(quote.cost).toLocaleString('en-US') + ' cr',
        confirmLabel: 'Confirm · ' + Math.round(quote.cost).toLocaleString('en-US') + ' cr',
        cancelLabel: 'Cancel',
      });
      if (!ok) { ctx.bus.emit('audio:cue', { id: 'ui_deny' }); return; }
    }
    ctx.bus.emit('ui:service', { type: svc, amount: quote.amount });
    ctx.bus.emit('audio:cue', { id: 'ui_click' });
    // Optimistic refresh: repair mutates the hull without a dedicated bus event (economy emits
    // only a toast), so the berth badges, vitals, and departure rail re-read state right away.
    this._refreshSchematicAndNodes();
    this._refreshVitals();
    this._refreshDeparture();
    this._showBerthQuote(svc);
  },

  /** The berth quote readout (Console Key reveal): one shared surface that previews a node's
   *  consequence — cost + delta for verbs, destination for tools, nearest berth for offline. */
  _showBerthQuote(svc) {
    const el = this._berthQuoteEl;
    if (!el) return;
    if (!svc) {
      el.textContent = 'Hover a service to quote it — click to act.';
      el.setAttribute('data-kind', 'idle');
      return;
    }
    const state = this._ctx && this._ctx.state;
    const stn = this._stationDef();
    if (!this._serviceOffered(svc)) {
      const near = nearestStationOffering(svc, stn && stn.id);
      el.textContent = 'Offline here' + (near ? ' — nearest: ' + near.name + ' · ' + near.sector : '');
      el.setAttribute('data-kind', 'offline');
      return;
    }
    if (svc === 'refuel' || svc === 'repair') {
      const entity = state && state.entities && state.entities.get && state.entities.get(state.playerId);
      const quote = serviceQuote(svc, state, entity);
      el.textContent = quote ? quote.detail : '';
      el.setAttribute('data-kind', quote && !quote.disabled && quote.amount > 0 ? 'verb' : 'idle');
      return;
    }
    el.textContent = berthServiceDesc(svc);
    el.setAttribute('data-kind', 'tool');
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
    if (typeof document === 'undefined' || !this._econBadge) return;
    const stn = this._stationDef();
    if (!stn) return;

    const state = this._ctx.state;

    // Faction identity: one hairline under the station name, colored by the controlling faction.
    if (this._el) this._el.style.setProperty('--st-fac-color', factionColorOf(stn.factionId));

    const activeEvents = state.economy && state.economy.econEvents || [];
    const affected = activeEvents.filter(e => e.stationId === stn.id);
    // Station state/event readout morphs on CHANGE only (the key omits the live countdown so the morph
    // does not re-fire every refresh tick — only when the event itself starts, ends, or swaps).
    let econText;
    let econKey;
    if (affected.length > 0) {
      const e = affected[0];
      econText = '⚠ ' + titleCaseWords(e.type || 'event') + ' active';
      econKey = 'alert:' + e.type;
      this._econBadge.className = 'st-econ-badge active mono';
    } else {
      econText = 'Market nominal';
      econKey = 'nominal';
      this._econBadge.className = 'st-econ-badge nominal mono';
    }
    if (this._fx && this._fx.morph) {
      if (econKey !== this._lastEconKey) { this._fx.morph.set(econText); this._lastEconKey = econKey; }
    } else if (this._econMorphMount) {
      this._econMorphMount.textContent = econText;
    }
  },

  /** Live ship vitals on the top deck: credits (Readout Morph on change only) + fuel / hull / hold
   *  data-bars updated in place. Event-driven — the periodic heartbeat never repaints these. */
  _refreshVitals() {
    const els = this._vitalEls;
    if (!els) return;
    const state = this._ctx && this._ctx.state;
    if (!state) return;
    const credits = Math.max(0, Math.floor((state.player && state.player.credits) || 0));
    if (credits !== this._lastCreditsShown) {
      this._lastCreditsShown = credits;
      if (this._fx && this._fx.credits) this._fx.credits.set(credits.toLocaleString('en-US'));
      else if (els.creditsMount) els.creditsMount.textContent = credits.toLocaleString('en-US');
    }
    const fuel = state.fuel || {};
    const fuelFrac = (Number(fuel.max) > 0) ? clamp01(Number(fuel.current) / Number(fuel.max), 0) : null;
    if (els.fuelV) els.fuelV.textContent = fuelFrac == null ? '—' : fmtPercent(fuelFrac);
    if (els.bars.fuel) {
      setDataBar(els.bars.fuel, fuelFrac == null ? 0 : fuelFrac);
      els.bars.fuel.setAttribute('data-tone', fuelFrac != null && fuelFrac < 0.25 ? 'bad' : (fuelFrac != null && fuelFrac < 0.45 ? 'warn' : 'ok'));
    }
    const ship = playerEntity(state);
    const hullFrac = ship && ship.hullMax > 0 ? clamp01((ship.hull || 0) / ship.hullMax, 0) : null;
    if (els.hullV) els.hullV.textContent = hullFrac == null ? '—' : fmtPercent(hullFrac);
    if (els.bars.hull) {
      setDataBar(els.bars.hull, hullFrac == null ? 0 : hullFrac);
      els.bars.hull.setAttribute('data-tone', hullFrac != null && hullFrac < 0.35 ? 'bad' : (hullFrac != null && hullFrac < 0.7 ? 'warn' : 'ok'));
    }
    const cargo = (state.player && state.player.cargo) || {};
    const cap = Number(cargo.capVolume) || 0;
    const used = Math.max(0, Number(cargo.usedVolume) || 0);
    const holdFrac = cap > 0 ? clamp01(used / cap, 0) : 0;
    if (els.holdV) els.holdV.textContent = cap > 0 ? (fmtDepartUnits(used) + '/' + fmtDepartUnits(cap) + 'u') : '—';
    if (els.bars.hold) {
      setDataBar(els.bars.hold, holdFrac);
      els.bars.hold.setAttribute('data-tone', holdFrac > 0.9 ? 'warn' : 'ok');
    }
  },

  /** The Briefing drawer (Meta, opt-in): the station's dossier — identity schematic, controlling
   *  faction + standing plan, and local advisories. Skipped entirely while collapsed. */
  _updateInspector() {
    if (typeof document === 'undefined' || !this._el) return;
    if (this._inspectorEl && this._inspectorEl.classList.contains('is-collapsed')) return;
    const inspectorEl = this._el.querySelector('.st-inspector-content');
    if (!inspectorEl) return;

    const stn = this._stationDef();
    if (!stn) {
      inspectorEl.innerHTML = `<div class="st-inspector-empty">Offline</div>`;
      return;
    }

    const state = this._ctx.state;
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
    const services = (Array.isArray(stn.services) ? stn.services : []);
    const offline = CANONICAL_BERTH_SERVICES.filter((svc) => !services.includes(svc));

    inspectorEl.innerHTML = `
      <div class="st-ins-section st-ins-section--id">
        <div class="st-ins-schematic" aria-hidden="true">${stationSchematicSvg(stn.type)}</div>
        <div class="st-ins-tab-header">
          <span class="st-ins-tab-name">${escapeHtml(stn.name || 'Station')}</span>
        </div>
        <div class="st-ins-desc">${escapeHtml(stationTypeLabel(stn.type))} · class ${escapeHtml(stn.size || 'M')}</div>
      </div>

      <div class="st-ins-section">
        <div class="st-ins-title">Standing</div>
        <div class="st-ins-row">
          <span>Authority</span>
          <span class="st-ins-row-val" style="color:${factionColor}">${escapeHtml(factionName)}</span>
        </div>
        <div class="st-ins-row">
          <span>Your standing</span>
          <span class="st-ins-row-val">${escapeHtml(tier.name)} (${rep > 0 ? '+' : ''}${rep})</span>
        </div>
        <div class="st-ins-row-detail">${escapeHtml(guidance.next)}</div>
        <div class="st-ins-row-detail st-ins-row-detail--plan">${escapeHtml(guidance.plan)}</div>
      </div>

      <div class="st-ins-section">
        <div class="st-ins-title">Advisories</div>
        <div class="st-ins-risk-desc">${escapeHtml(risks)}</div>
        ${offline.length
          ? `<div class="st-ins-row-detail">Offline here: ${escapeHtml(offline.map(stationServiceLabel).join(', '))}.</div>`
          : `<div class="st-ins-row-detail">Full berth coverage — every dock service is online.</div>`}
      </div>
    `;
  },

  /** Operations contract board (state.missions.boards[stationId]). The left rail is a set of compact
   *  contract selectors; picking one drives the CENTER preflight instrument (route beam + destination
   *  ping + risk/fuel/hold ring gauges + broker comms slate + morph contract state + full preflight
   *  and consequence readouts). Accept emits ui:acceptMission; the receipt reports whether the
   *  accepted mission owns nav now or is tracked behind the staged tutorial's opening route. */
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
      '<div class="st-sub-h">Contract Board</div>' +
      '<div class="st-mission-guide">Pick a contract to preflight it — route, risk, fuel, and hold — then accept. Accepting tracks it; nav follows when the current tutorial step releases the route.</div>' +
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
    // Pointer + keyboard share ONE selection path (Enter/Space parity on focusable cards).
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
      ev.preventDefault(); // Space must not scroll the board
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
    const ownsNav = !!(waypoint && waypoint.missionId === mission.id);
    const routeLine = ownsNav && waypoint.reason
      ? waypoint.reason
      : missionAfterAcceptText(mission);
    const receiptLabel = ownsNav ? 'Contract signed · nav set' : 'Contract signed · tracked';
    const handoffLine = ownsNav
      ? 'Mission Log (' + BINDINGS.missionLog.label + ') carries the route and timer. Launch when the departure rail is green.'
      : 'Mission Log (' + BINDINGS.missionLog.label + ') has the contract. Finish the current tutorial step to hand navigation over.';
    status.hidden = false;
    // One clean contract receipt: the singular confirmation the accept produces. A one-shot border
    // trace marks it as freshly printed (the sanctioned state-change motion, not a rest animation).
    status.innerHTML =
      '<div class="st-mission-accepted-label mono">' + escapeHtml(receiptLabel) + '</div>' +
      '<div class="st-mission-accepted-title">' + escapeHtml(mission.title || prettyType(mission.type)) + '</div>' +
      '<div class="st-mission-accepted-next">' + escapeHtml(routeLine) + '</div>' +
      '<div class="st-mission-accepted-log mono">' + escapeHtml(handoffLine) + '</div>' +
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
          '<button class="st-mission-accept" data-act="accept" data-mid="' + escapeHtml(mid) + '"' + (unmet ? ' disabled' : '') +
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
      '<button class="st-ops-btn st-ops-btn--accept st-mission-accept" data-act="accept" data-mid="' + escapeHtml(mid) + '"' + (unmet ? ' disabled' : '') +
        ' title="' + escapeHtml(acceptTitle) + '" aria-label="' + escapeHtml(acceptTitle) + '">Accept</button>' +
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
   *  Local or Star Map for its waypoint (same local-vs-jump split the Mission Log uses). */
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
        source: 'station:mission-route',
        missionId,
        sectorId: wp && wp.sectorId,
        pos: wp && wp.pos,
      });
      return;
    }
    const board = state.missions && state.missions.boards && state.missions.boards[this._stationId];
    const offer = board && board.slots && board.slots.find((s) => String(s && (s.id != null ? s.id : s.missionId)) === String(missionId));
    ctx.bus.emit('toast', { text: 'Accept this contract to plot its nav route' + (offer ? ' to ' + missionDestName(offer) : '') + '.', kind: 'info', ttl: 3 });
  },

  /** Activate a tab: toggle rail highlight + panel visibility, persist ui.activeStationTab.
   *  options.tradeMode — when opening Market, force All/Buying/Selling filter (handoff sell path). */
  setTab(tabId, options = {}) {
    if (!TABS.some((t) => t.id === tabId) && tabId !== 'hold') tabId = 'market';
    // Navigating a section clears the Service Dock selection (its quote surface goes idle).
    this._selectedService = null;
    this._showBerthQuote(null);
    const prevTab = this._activePanelId();
    if (prevTab !== tabId) {
      const prev = this._panels && this._panels[prevTab];
      if (prev && typeof prev.onHide === 'function') {
        try { prev.onHide(); } catch (e) { console.error(e); }
      }
    }
    this._ctx.state.ui.activeStationTab = tabId;
    // Stash panel open options for the following onShow (Market tradeMode, etc.).
    this._pendingPanelOptions = options && typeof options === 'object' ? options : {};
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
    const pending = this._pendingPanelOptions || {};
    this._pendingPanelOptions = null;
    // Error boundary: a child panel's onShow/refresh throwing must not crash the whole station hub or
    // bubble to an uncaught page error (matches the onHide guard). Degrade to a warning; rail stays usable.
    try {
      if (isShow && typeof p.onShow === 'function') {
        p.onShow({
          stationId: this._stationId,
          state: this._ctx.state,
          tradeMode: pending.tradeMode,
        });
      } else if (typeof p.refresh === 'function') {
        p.refresh({ stationId: this._stationId, state: this._ctx.state });
      }
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
      applyStationHubRootClasses(this._el, stn && stn.type);
      if (stn && stn.type) {
        this._el.classList.add(`st-hub--${stn.type}`);
      }
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
    const stn = this._stationDef();
    const nameEl = this._topbar.querySelector('.st-station-name');
    const facEl = this._topbar.querySelector('.st-station-fac');
    if (stn) {
      const targetName = stn.name || stn.id;
      if (nameEl.textContent !== targetName && nameEl.dataset.acquireTarget !== targetName) {
        this._signalAcquire(nameEl, targetName, { duration: 400 });
      }
      const fac = stn.factionId ? FACTION_BY_ID.get(stn.factionId) : null;
      facEl.textContent = (fac ? (fac.short || fac.name) : '') + '  ·  ' + (stn.type || '').replace('_', ' ');
      if (fac) facEl.style.color = fac.color || '';
    } else {
      nameEl.textContent = 'Station';
      facEl.textContent = '';
    }
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
    this._rail.querySelectorAll('[data-tab]').forEach((b) => {
      const tabId = b.getAttribute('data-tab');
      const status = stationTabServiceStatus(tabId, stn);
      b.setAttribute('data-service-status', status.state);
      b.classList.toggle('st-tab--service-unavailable', status.state === 'unavailable');
      b.title = status.title;
      b.setAttribute('aria-label', tabLabel(tabId) + ': ' + status.label + '. ' + tabPurpose(tabId));
      const badge = b.querySelector('.st-tab-service');
      if (badge) {
        const showBadge = status.state === 'available' || status.state === 'unavailable';
        badge.hidden = !showBadge;
        badge.textContent = showBadge ? status.label : '';
      }
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
    const summary = departureReadinessSummary(chips);
    if (this._undockBtn) {
      this._undockBtn.textContent = summary.label;
      this._undockBtn.title = summary.title;
      this._undockBtn.setAttribute('aria-label', summary.accessibleLabel);
      this._undockBtn.setAttribute('data-readiness', summary.state);
    }
    // Launch clearance hairline: the footer's top edge fills as chips clear (state-driven only).
    if (this._footerEl) {
      const cleared = chips.filter((c) => c && c.kind === 'ok').length;
      this._footerEl.style.setProperty('--st-clearance', String(chips.length ? cleared / chips.length : 0));
      this._footerEl.setAttribute('data-readiness', summary.state);
    }
  },

  _refreshHandoff() {
    if (!this._handoffEl) return;
    const state = this._ctx && this._ctx.state;
    const dismissed = !!(state && state.ui && state.ui.firstDockHandoffDismissed);
    const visible = !dismissed && firstDockHandoffVisible(state, this._stationId);
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

  /** Called by screenManager when this screen becomes the top of the stack. */
  onShow(ctx) {
    if (ctx) this._ctx = ctx;
    const oldId = this._stationId;
    this._resolveStation();
    if (this._stationId && this._stationId !== oldId) {
      this._triggerArrivalEdgeTrace();
      this._playArrivalBroadcast();
    }
    this._refreshTopbar();
    this._refreshVitals();
    this._refreshGraffiti();
    this._refreshRailServiceStatus();
    this._refreshPurpose();
    this._refreshDeparture();
    this._refreshHandoff();
    this._refreshSchematicAndNodes();
    this._refreshEconAndReadiness();
    // Command-deck effects resume on show (frame-sleep contract).
    this._setEffectsActive(true);
    // restore the last active tab (or default 'market')
    const tab = this._activePanelId();
    this.setTab(tab); // also refreshes the active panel via onShow
  },

  onHide() {
    // Park every effect's rAF while the screen is hidden (frame-sleep contract).
    this._setEffectsActive(false);
    const p = this._panels && this._panels[this._activePanelId()];
    if (p && typeof p.onHide === 'function') {
      try { p.onHide(); } catch (e) { console.error(e); }
    }
  },

  /** Generic refresh (data-event driven). Refreshes only the active panel for cheapness. */
  refresh(ctx, options = {}) {
    if (ctx) this._ctx = ctx;
    if (!this._el) return;
    // uiRoot asks every open modal to refresh every ~300 ms. Docked simulation is paused and this
    // screen already subscribes to every state change that can affect it below, so repainting the
    // hub (including market rows and inspector HTML) on that heartbeat just creates avoidable DOM
    // churn. In particular it used to interrupt the pointer-driven Service Dock magnification.
    if (options.periodic) return;
    this._refreshTopbar();
    this._refreshVitals();
    this._refreshGraffiti();
    this._refreshRailServiceStatus();
    this._refreshPurpose();
    this._refreshDeparture();
    this._refreshHandoff();
    this._refreshSchematicAndNodes();
    this._refreshEconAndReadiness();
    this._updateInspector();
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
    // Implicit station Back (backdrop / Esc route): the screenManager emits station:exitRequest
    // directly; the exit owner cleans up, confirms when needed, then commits the undock.
    bus.on('station:exitRequest', (req) => { this.requestStationExit(req || {}); });
    bus.on('ui:factionPresenceService', (payload = {}) => {
      if (!this._visible() || payload.stationId !== this._stationId) return;
      const targetTab = payload.serviceId === 'pitborn_yard'
        ? 'shipyard'
        : (payload.serviceId === 'pitborn_fence' ? 'market' : null);
      if (targetTab) this.setTab(targetTab, { focusRail: true });
    });
    const onActive = (wantTab) => () => {
      if (!this._visible()) return;
      const id = this._activePanelId();
      if (!wantTab || wantTab.includes(id)) this._refreshActive(false);
    };
    const refreshDeparture = () => { if (this._visible()) this._refreshDeparture(); };
    const refreshHandoff = () => { if (this._visible()) this._refreshHandoff(); };
    // Top-deck vitals answer every economy/ship mutation directly (the credits morph is the
    // "terminal is alive" read — it rolls exactly when the sim changes, and never at rest).
    const refreshVitals = () => { if (this._visible()) this._refreshVitals(); };
    bus.on('credits:changed', refreshVitals);
    bus.on('fuel:changed', refreshVitals);
    bus.on('cargo:changed', refreshVitals);
    bus.on('ship:statsChanged', refreshVitals);
    bus.on('economy:tradeCompleted', refreshVitals);
    // These are the two mutable readiness values shown by the Service Dock. The low-cadence modal
    // refresh deliberately does no work, so keep its badges and selected-service inspector truthful
    // through the same event path that updates the active panel.
    const refreshServiceDock = () => {
      if (!this._visible()) return;
      this._refreshRailServiceStatus();
      this._refreshSchematicAndNodes();
      this._refreshEconAndReadiness();
      this._updateInspector();
    };
    // market-affecting
    bus.on('economy:tradeCompleted', onActive(['market', 'services', 'hold']));
    bus.on('economy:tradeCompleted', refreshHandoff);
    bus.on('economy:tick', onActive(['market', 'hold']));
    bus.on('cargo:changed', onActive(['market', 'outfit', 'services', 'hold']));
    bus.on('cargo:changed', refreshDeparture);
    bus.on('cargo:changed', refreshHandoff);
    bus.on('credits:changed', onActive(['market', 'shipyard', 'outfit', 'services', 'hold']));
    bus.on('credits:changed', refreshDeparture);
    // ship/outfitting-affecting
    bus.on('ship:statsChanged', onActive(['outfit', 'shipyard', 'services']));
    bus.on('ship:statsChanged', refreshServiceDock);
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
    bus.on('fuel:changed', refreshServiceDock);
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
    });
    bus.on('mission:accepted', (payload) => {
      if (!this._visible()) return;
      this._setMissionAcceptedStatus(payload && payload.missionId);
      if (this._activePanelId() === 'missions') this._refreshMissions();
      this._refreshDeparture();
      this._refreshHandoff();
    });
    bus.on('mission:completed', () => { this._refreshMissionAcceptedStatus(); refreshDeparture(); refreshHandoff(); });
    bus.on('mission:failed', () => { this._refreshMissionAcceptedStatus(); refreshDeparture(); refreshHandoff(); });
    bus.on('mission:expired', () => { this._refreshMissionAcceptedStatus(); refreshDeparture(); refreshHandoff(); });
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

/** Render one player cargo provenance row. Every save-derived value is escaped before it enters
 * the Hold panel's innerHTML, including attribute text and fallback identifiers. */
export function richLotReadoutHtml(lot = {}) {
  const commodity = COMMODITY_BY_ID.get(lot.commodityId) || { name: prettyId(lot.commodityId) };
  const commodityName = String(commodity.name || prettyId(lot.commodityId));
  const qty = Math.max(0, Math.floor(Number(lot.qty) || 0));
  const opportunityId = String(lot.richOpportunityId || '');
  const lotLabel = String(lot.lotId || lot.richOpportunityId || 'LOT');
  const resolution = lot.resolution ? ` · ${String(lot.resolution).toUpperCase()}` : '';
  return `<div class="st-row st-row--rich-lot"><span class="c-name">${escapeHtml(`RICH ORE · ${commodityName}`)}</span><span class="c-num">${qty}</span><span class="c-num" title="${escapeHtml(opportunityId)}">${escapeHtml(lotLabel)}</span><span class="c-num">${escapeHtml(resolution)}</span><span></span></div>`;
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

// ---- scoped CSS (injected once; palette tokens from styles/ui.css — no raw-hue drift) ---------
// THE BERTH LEDGER — Station OS skin. One coherent skin, one voice:
//   Nav = rail rows · Verb = filled tinted buttons (quote→confirm) · Param = chips/steppers ·
//   Meta = ghost. Motion ONLY on state change (arrival trace, tab wipe, readout morphs, charge).
const STATION_CSS = `
/* ── 0 · Motion vocabulary (every animation is a state change, nothing runs at rest) ─────────── */
@keyframes sf-signal-acquire { 0% { opacity: 0; filter: blur(4px); } 100% { opacity: 1; filter: blur(0); } }
.acquiring { animation: sf-signal-acquire .4s var(--ease) forwards; }
@keyframes st-name-sweep { from { width: 0; opacity: 1; } to { width: 100%; opacity: .55; } }
@keyframes channel-wipe { 0% { clip-path: inset(0 100% 0 0); } 100% { clip-path: inset(0 0 0 0); } }
.switching { animation: channel-wipe .13s cubic-bezier(0.1, 0.9, 0.2, 1) forwards; }
@keyframes market-tick { 0% { background-color: color-mix(in srgb, var(--energy) 14%, transparent); } 100% { background-color: transparent; } }
.st-card-spark-wrap.tick { animation: market-tick .5s ease-out; }
.trend-up { color: var(--warn); font-size: .8em; margin-left: 4px; }
.trend-down { color: var(--ink-dim); font-size: .8em; margin-left: 4px; }

/* ── 1 · Shell tokens + station-type accents (sector accents ≤10%, tokens only) ──────────────── */
.st-hub {
  --st-accent: var(--accent);
  --st-fac-color: var(--ink-dim);
  --font-display: 'Segoe UI Variable Display', 'Segoe UI', system-ui, -apple-system, sans-serif;
  --font-body: 'Segoe UI Variable Text', 'Segoe UI', system-ui, -apple-system, sans-serif;
  --os-ink: #eef2f9; --os-ink-dim: #b9c5d9; --os-ink-mute: #7f8fa8;
  --os-line: color-mix(in srgb, var(--ink-dim) 14%, transparent);
  --os-line-strong: color-mix(in srgb, var(--ink-dim) 26%, transparent);
  --os-bg: #060a12;
  --os-deck: #0a101c;
  --os-surface: rgba(17, 24, 39, 0.66);
  --os-raised: rgba(24, 33, 52, 0.78);
  --os-shadow: 0 12px 32px -18px rgba(0, 0, 0, 0.7);
  --os-r: 10px; --os-r-sm: 7px; --os-r-xs: 5px;
  --st-accent-soft: color-mix(in srgb, var(--st-accent) 16%, transparent);
  --ink: var(--os-ink); --ink-dim: var(--os-ink-dim); --ink-mute: var(--os-ink-mute);
  --panel-edge: var(--os-line);
  color: var(--os-ink);
  font-family: var(--font-body);
  line-height: 1.5;
}
.st-hub--military { --st-accent: var(--danger); }
.st-hub--mining, .st-hub--refinery { --st-accent: var(--warn); }
.st-hub--blackmarket { --st-accent: var(--accent-3); }
.st-hub--research { --st-accent: var(--accent-2); }

/* ── 2 · The OS frame: edge-to-edge terminal, five fixed decks ────────────────────────────────── */
.st-hub.st-hub--os {
  width: 100vw; height: 100vh; max-width: none; max-height: none;
  border: 0; border-radius: 0; box-shadow: none;
  display: grid; grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  overflow: hidden; pointer-events: auto;
}
/* Decks are PINNED to their rows so hiding one (e.g. the dismissed handoff) can never
   re-flow the body into an auto row and strand the footer mid-screen. */
.st-hub.st-hub--os > .st-topdeck { grid-row: 1; }
.st-hub.st-hub--os > .st-berth { grid-row: 2; }
.st-hub.st-hub--os > .st-handoff { grid-row: 3; }
.st-hub.st-hub--os > .st-body { grid-row: 4; }
.st-hub.st-hub--os > .st-footer { grid-row: 5; }
.st-hub.st-hub--os {
  background:
    radial-gradient(120% 90% at 85% -20%, var(--st-accent-soft), transparent 55%),
    linear-gradient(180deg, var(--os-deck), var(--os-bg) 30%);
  animation: sf-fadein .25s var(--ease) both;
}
/* Arrival edge trace: one sweep of the deck seams when a new berth acquires (state change only). */
.st-hub.trace-active::after {
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 60;
  border-top: 1px solid var(--st-accent);
  animation: st-arrival-trace 480ms var(--ease) 1 both;
}
@keyframes st-arrival-trace { 0% { clip-path: inset(0 100% 0 0); opacity: .9; } 70% { clip-path: inset(0 0 0 0); opacity: .6; } 100% { opacity: 0; } }

/* ── 3 · Top deck: identity · vitals · Briefing (Meta) · Undock ───────────────────────────────── */
.st-topdeck {
  display: flex; align-items: center; gap: 22px; height: 58px; padding: 0 22px;
  border-bottom: 1px solid var(--os-line-strong);
  background: linear-gradient(180deg, rgba(255,255,255,0.03), transparent);
}
.st-topdeck-id { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
.st-station-name {
  font-family: var(--font-display); font-size: 22px; font-weight: 650; letter-spacing: .005em;
  color: #fff; white-space: nowrap; position: relative;
}
.st-station-name::after {
  content: ''; position: absolute; left: 0; bottom: -3px; height: 2px; width: 100%;
  background: var(--st-fac-color); opacity: .55; border-radius: 1px;
}
.st-station-name.acquiring::after { animation: st-name-sweep 400ms cubic-bezier(0.16, 1, 0.3, 1) both; }
.st-station-fac {
  flex: none; font-size: 10.5px; letter-spacing: .08em; color: var(--os-ink-dim);
  padding: 3px 10px; border: 1px solid var(--os-line); border-radius: 999px;
  background: rgba(255,255,255,0.025); white-space: nowrap;
}
/* Vitals: the ship talks back. Bars are sf-data-bar primitives; numbers morph on change only. */
.st-vitals { display: flex; align-items: center; gap: 26px; margin-left: auto; }
.st-vital { display: grid; grid-template-columns: auto auto; grid-template-rows: auto auto; column-gap: 8px; align-items: baseline; }
.st-vital-l { grid-column: 1; font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--os-ink-mute); }
.st-vital-v { grid-column: 2; font-size: 13.5px; font-weight: 600; color: var(--os-ink); font-variant-numeric: tabular-nums; }
.st-top-credits .st-vital-v { color: var(--energy); font-size: 15px; }
.st-vital-bar { grid-column: 1 / -1; margin-top: 3px; display: block; }
.st-vital-bar .sf-data-bar { width: 86px; height: 3px; border-radius: 2px; background: color-mix(in srgb, var(--os-ink-mute) 22%, transparent); display: block; overflow: hidden; }
.st-vital-bar .sf-data-bar__fill { height: 100%; border-radius: 2px; background: var(--good); transform-origin: left center; transform: scaleX(var(--sf-bar-v, 0)); transition: transform .2s var(--ease); }
.st-vital-bar .sf-data-bar[data-tone="warn"] .sf-data-bar__fill { background: var(--warn); }
.st-vital-bar .sf-data-bar[data-tone="bad"] .sf-data-bar__fill { background: var(--danger); }
/* Briefing toggle: Meta ghost. */
.st-inspector-toggle {
  flex: none; padding: 7px 14px; border-radius: var(--os-r-sm);
  background: transparent; border: 1px solid var(--os-line); color: var(--os-ink-dim);
  font-family: var(--font-display); font-weight: 600; font-size: 13px;
}
.st-inspector-toggle:hover { color: var(--os-ink); border-color: var(--os-line-strong); background: rgba(255,255,255,0.04); }
.st-inspector-toggle.active { color: var(--st-accent); border-color: color-mix(in srgb, var(--st-accent) 45%, transparent); background: var(--st-accent-soft); }
/* Undock: the one hardware control. Hold to charge; readiness colors the metal. */
.st-undock {
  flex: none; position: relative; overflow: hidden; padding: 9px 18px;
  border-radius: var(--os-r-sm); font-family: var(--font-display); font-weight: 650;
  letter-spacing: .02em; font-size: 13.5px;
  background: var(--os-surface); border: 1px solid var(--os-line-strong); color: var(--os-ink);
  transition: background-color .2s, border-color .2s, color .2s;
}
.st-undock::after { content: ''; position: absolute; left: 0; bottom: 0; height: 2px; width: 0%; background: currentColor; transition: none; }
.st-undock.charging::after { width: 100%; transition: width 0.6s linear; }
.st-undock.abort::after { width: 0%; transition: width 0.2s ease-out; }
.st-undock[data-readiness="ready"] { color: var(--good); border-color: color-mix(in srgb, var(--good) 45%, transparent); background: color-mix(in srgb, var(--good) 10%, var(--os-surface)); }
.st-undock[data-readiness="check"] { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 45%, transparent); background: color-mix(in srgb, var(--warn) 9%, var(--os-surface)); }
.st-undock[data-readiness="risk"]  { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 45%, transparent); background: color-mix(in srgb, var(--danger) 9%, var(--os-surface)); }
.st-undock[data-readiness="ready"]:hover { background: color-mix(in srgb, var(--good) 22%, var(--os-surface)); }
.st-undock[data-readiness="check"]:hover { background: color-mix(in srgb, var(--warn) 20%, var(--os-surface)); }
.st-undock[data-readiness="risk"]:hover  { background: color-mix(in srgb, var(--danger) 20%, var(--os-surface)); }

/* ── 4 · Berth strip: the Service Dock. Live readiness, hover quotes, click acts. ─────────────── */
/* z-index keeps the magnify curve ABOVE the handoff + body (no clip, no scroll gutter). */
.st-berth {
  position: relative; z-index: 8; overflow: visible;
  display: flex; align-items: stretch; gap: 18px; padding: 0 22px;
  border-bottom: 1px solid var(--os-line);
  background: linear-gradient(180deg, rgba(255,255,255,0.015), transparent);
}
.st-service-nodes-pane {
  flex: 1 1 auto; min-width: 0; display: flex; align-items: flex-end;
  overflow: visible; position: relative; z-index: 1;
}
/* overflow:visible — never scrollport-clip the hover scale. Extra X pad (~10px/side over the
   effect default) gives edge chips room to grow without eating the berth padding budget. */
.st-hub .sf-fx-dock {
  --sf-fx-dock-pad-top: 38px;
  --sf-fx-dock-pad-x: 20px;
  flex-wrap: nowrap; gap: 8px; justify-content: flex-start; max-width: 100%;
  overflow: visible; padding-bottom: 8px;
}
.st-hub .sf-fx-dock__item {
  min-width: 86px; padding: 8px 10px 7px; border-radius: var(--os-r-sm);
  background: var(--os-raised); border: 1px solid var(--os-line); box-shadow: var(--os-shadow);
}
.st-hub .sf-fx-dock__item:hover { border-color: color-mix(in srgb, var(--st-accent) 40%, transparent); background: color-mix(in srgb, var(--st-accent) 7%, var(--os-raised)); }
.st-hub .sf-fx-dock__item.is-focus { border-color: color-mix(in srgb, var(--st-accent) 55%, transparent); }
.st-hub .sf-fx-dock__item:focus-visible { outline: 2px solid var(--st-accent); outline-offset: 2px; }
.st-hub .sf-fx-dock__icon { color: var(--st-accent); font-size: 1.18em; }
.st-hub .sf-fx-dock__label { font-size: .7rem; letter-spacing: .01em; color: var(--os-ink-dim); font-family: var(--font-display); font-weight: 600; }
.st-hub .sf-fx-dock__badge { font-family: var(--mono); font-size: .6rem; letter-spacing: .05em; }
.st-berth-side {
  flex: none; width: 252px; display: flex; flex-direction: column; justify-content: center; gap: 4px;
  padding: 8px 0 8px 18px; border-left: 1px solid var(--os-line);
}
.st-berth-caption { font-size: 9.5px; letter-spacing: .16em; text-transform: uppercase; color: var(--os-ink-mute); }
.st-berth-quote { min-height: 2.6em; font-family: var(--mono); font-size: 11.5px; line-height: 1.35; color: var(--os-ink-dim); transition: opacity .14s var(--ease); }
.st-berth-quote[data-kind="idle"] { color: var(--os-ink-mute); font-style: italic; }
.st-berth-quote[data-kind="verb"] { color: var(--os-ink); }
.st-berth-quote[data-kind="offline"] { color: var(--warn); }
.st-berth-quote[data-kind="tool"] { color: var(--os-ink-dim); }

/* ── 5 · First-dock handoff: one dismissible line, not furniture ──────────────────────────────── */
.st-handoff {
  display: flex; align-items: center; gap: 14px; padding: 7px 22px;
  border-bottom: 1px solid var(--os-line);
  background: color-mix(in srgb, var(--st-accent) 4%, transparent);
}
.st-handoff[hidden] { display: none; }
.st-handoff-label { flex: none; color: var(--st-accent); font-size: 9.5px; letter-spacing: .18em; text-transform: uppercase; }
.st-handoff-steps { display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden; }
.st-handoff-step {
  display: inline-flex; align-items: baseline; gap: 8px; padding: 4px 12px;
  border: 1px solid var(--os-line); border-radius: 999px; background: var(--os-surface);
  color: var(--os-ink-dim); font: inherit; font-size: 12.5px; cursor: pointer; white-space: nowrap;
}
button.st-handoff-step:hover { background: rgba(255,255,255,0.05); color: var(--os-ink); }
button.st-handoff-step:focus-visible { outline: 2px solid var(--st-accent); outline-offset: 2px; }
.st-handoff-step-label { display: none; }
.st-handoff-step-title { font-weight: 600; color: inherit; font-size: 12.5px; }
.st-handoff-step-copy { display: none; }
.st-handoff-step--ok { color: var(--good); border-color: color-mix(in srgb, var(--good) 32%, transparent); }
.st-handoff-step--warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 30%, transparent); }
.st-handoff-step--bad { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 32%, transparent); }
.st-handoff-step.is-done { opacity: .68; }
.st-handoff-step.is-done .st-handoff-step-title::before { content: '✓ '; }
.st-handoff-dismiss {
  flex: none; margin-left: auto; padding: 4px 12px; border-radius: 999px;
  background: transparent; border: 1px solid var(--os-line); color: var(--os-ink-mute); font-size: 12px;
}
.st-handoff-dismiss:hover { color: var(--os-ink); border-color: var(--os-line-strong); }

/* ── 6 · Body: nav rail | workspace | briefing drawer ─────────────────────────────────────────── */
.st-body { display: flex; min-height: 0; min-width: 0; }
.st-rail {
  width: 208px; flex: none; display: flex; flex-direction: column; gap: 2px;
  padding: 12px 10px; border-right: 1px solid var(--os-line);
  background: linear-gradient(180deg, rgba(255,255,255,0.014), transparent);
  overflow-y: auto;
}
.st-tab {
  display: grid; grid-template-columns: 20px minmax(0, 1fr); grid-template-rows: auto auto;
  column-gap: 11px; align-items: center; text-align: left;
  background: transparent; border: 1px solid transparent; border-radius: var(--os-r-sm);
  padding: 8px 11px; color: var(--os-ink-dim);
  transition: background .15s var(--ease), color .15s var(--ease), border-color .15s var(--ease);
}
.st-tab:hover { color: var(--os-ink); background: rgba(255,255,255,0.045); }
.st-tab:focus-visible { outline: 2px solid var(--st-accent); outline-offset: 2px; color: var(--os-ink); }
.st-tab.active {
  color: #fff; border-color: var(--os-line);
  background: linear-gradient(90deg, var(--st-accent-soft), rgba(255,255,255,0.02));
  box-shadow: inset 2px 0 0 var(--st-accent);
}
.st-tab-icon { grid-row: 1 / span 2; width: 20px; height: 20px; opacity: .85; color: var(--os-ink-mute); display: inline-flex; align-items: center; justify-content: center; }
.st-tab-icon svg { width: 18px; height: 18px; }
.st-tab.active .st-tab-icon { color: var(--st-accent); opacity: 1; }
.st-tab-label {
  grid-column: 2; font-family: var(--font-display); font-size: 13.5px; font-weight: 600;
  letter-spacing: .01em; color: inherit; white-space: nowrap;
}
.st-tab-service {
  grid-column: 2; font-size: 9px; letter-spacing: .08em; text-transform: uppercase;
  color: var(--os-ink-mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;
}
.st-tab-service[hidden] { display: none; }
.st-tab[data-service-status="available"] .st-tab-service { color: color-mix(in srgb, var(--accent-2) 80%, var(--os-ink-mute)); }
.st-tab[data-service-status="unavailable"] { opacity: .62; }
.st-tab[data-service-status="unavailable"] .st-tab-service { color: var(--warn); }
.st-tab[data-service-status="unavailable"].active { opacity: 1; box-shadow: inset 2px 0 0 var(--warn); }

/* Workspace: the tools own this. Faint static chart-grid texture; zero motion at rest. */
.st-content {
  position: relative; flex: 1 1 auto; min-width: 0; min-height: 0; overflow: hidden;
  background:
    linear-gradient(color-mix(in srgb, var(--os-ink-mute) 4%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--os-ink-mute) 4%, transparent) 1px, transparent 1px);
  background-size: 34px 34px;
}
.st-content::after {
  content: ''; position: absolute; left: 0; right: 0; height: 3px; top: 0;
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--st-accent) 55%, transparent), transparent);
  opacity: 0; pointer-events: none; z-index: 10;
}
.st-content.switching::after { animation: channel-wipe-trace 130ms ease-out forwards; }
@keyframes channel-wipe-trace { 0% { top: 0; opacity: .8; } 100% { top: 100%; opacity: 0; } }
.st-tabpanel { position: absolute; inset: 0; overflow-y: auto; padding: 20px 26px 26px; animation: sf-fadein .18s var(--ease) both; }

/* Briefing drawer: Meta, opt-in, collapsed by default. Fixed inner width so text never squishes. */
.st-inspector {
  flex: none; width: 324px; min-height: 0; overflow: hidden;
  border-left: 1px solid var(--os-line); background: rgba(10, 15, 26, 0.55);
  transition: width .22s var(--ease);
}
.st-inspector.is-collapsed { width: 0; border-left-color: transparent; }
.st-inspector-inner { width: 324px; height: 100%; display: flex; flex-direction: column; min-height: 0; }
.st-inspector-header {
  flex: none; padding: 13px 20px; border-bottom: 1px solid var(--os-line);
  color: var(--st-accent); font-size: 10px; letter-spacing: .18em; text-transform: uppercase;
}
.st-inspector-content { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 18px 20px; display: flex; flex-direction: column; gap: 18px; }
.st-inspector-empty { color: var(--os-ink-mute); font-style: italic; padding: 10px 2px; }
.st-ins-section { display: flex; flex-direction: column; gap: 6px; padding-bottom: 16px; border-bottom: 1px solid var(--os-line); }
.st-ins-section:last-child { border-bottom: none; padding-bottom: 0; }
.st-ins-section--id { align-items: flex-start; }
.st-ins-schematic { align-self: center; opacity: .85; filter: drop-shadow(0 0 8px var(--st-accent-soft)); }
.st-ins-schematic svg { width: 84px; height: 84px; display: block; }
.st-ins-title { font-family: var(--mono); font-size: 9.5px; letter-spacing: .16em; text-transform: uppercase; color: var(--os-ink-mute); }
.st-ins-tab-header { display: flex; align-items: center; gap: 8px; }
.st-ins-tab-name { font-family: var(--font-display); font-size: 16px; font-weight: 650; color: var(--os-ink); }
.st-ins-desc { font-size: 12.5px; line-height: 1.5; color: var(--os-ink-dim); }
.st-ins-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--os-ink-dim); }
.st-ins-row-val { color: var(--os-ink); font-weight: 600; text-align: right; }
.st-ins-row-detail { font-size: 12.5px; line-height: 1.5; color: var(--os-ink-mute); }
.st-ins-row-detail--plan { color: var(--os-ink-dim); font-style: italic; }
.st-ins-risk-desc { font-size: 12.5px; line-height: 1.5; color: var(--os-ink-dim); }
.st-ins-hint { font-size: 12.5px; line-height: 1.45; color: var(--warn); }
/* Airlock wall — story graffiti archive inside the briefing. */
.st-airlock { flex: none; border-top: 1px solid var(--os-line); padding: 12px 20px 6px; }
.st-airlock__label { font-size: 9px; letter-spacing: .2em; text-transform: uppercase; color: var(--os-ink-mute); margin-bottom: 6px; }
.st-airlock__graffiti { display: flex; flex-direction: column; gap: 4px; max-height: 110px; overflow-y: auto; }
.st-airlock__line { --graffiti-skew: 0deg; font-family: var(--mono); font-size: 11px; letter-spacing: .12em; color: #9aa6b8; text-transform: uppercase; opacity: .82; transform: rotate(var(--graffiti-skew)); text-shadow: 0 1px 2px #000; line-height: 1.35; }
.st-airlock__empty { font-size: 10.5px; color: var(--os-ink-mute); font-style: italic; opacity: .6; }
.st-purpose { flex: none; display: flex; flex-direction: column; gap: 4px; padding: 12px 20px 16px; border-top: 1px solid var(--os-line); background: rgba(255,255,255,0.012); }
.st-purpose-main { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
.st-purpose-type { color: var(--st-accent); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; flex: none; }
.st-purpose-copy { color: var(--os-ink-dim); font-size: 12.5px; line-height: 1.45; }
.st-purpose-sub { display: flex; flex-direction: column; gap: 4px; color: var(--os-ink-mute); font-size: 12px; line-height: 1.45; margin-top: 2px; }

/* ── 7 · Footer: Departure Check rail + clearance hairline + station status ───────────────────── */
.st-footer {
  position: relative; display: flex; align-items: center; gap: 18px; padding: 0 22px; height: 42px;
  border-top: 1px solid var(--os-line-strong); background: rgba(8, 12, 20, 0.7);
}
.st-footer::before {
  content: ''; position: absolute; left: 0; top: -1px; height: 2px;
  width: calc(var(--st-clearance, 0) * 100%);
  background: var(--good); opacity: .8; transition: width .25s var(--ease);
}
.st-footer[data-readiness="risk"]::before { background: var(--danger); }
.st-footer[data-readiness="check"]::before { background: var(--warn); }
.st-departure { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1 1 auto; }
.st-departure-label { flex: none; color: var(--os-ink-mute); font-size: 9.5px; letter-spacing: .16em; text-transform: uppercase; }
.st-departure-chips { display: flex; flex-wrap: nowrap; gap: 6px; min-width: 0; overflow: hidden; }
.st-departure-chip {
  display: inline-flex; align-items: center; gap: 6px; min-height: 24px; max-width: 320px;
  padding: 2px 11px; border: 1px solid var(--os-line); border-radius: 999px;
  background: var(--os-surface); color: var(--os-ink-dim); font: inherit; font-size: 12px;
  line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
button.st-departure-chip { margin: 0; appearance: none; cursor: pointer; text-align: left; }
button.st-departure-chip:hover { background: rgba(255,255,255,0.05); color: var(--os-ink); }
button.st-departure-chip:focus-visible { outline: 2px solid var(--st-accent); outline-offset: 2px; }
.st-departure-chip b { color: var(--os-ink-mute); font-weight: 600; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; }
.st-departure-chip span { overflow: hidden; text-overflow: ellipsis; }
.st-departure-chip--ok { color: var(--good); border-color: color-mix(in srgb, var(--good) 30%, transparent); }
.st-departure-chip--warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 30%, transparent); }
.st-departure-chip--bad { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 32%, transparent); }
.st-departure-chip--info { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 26%, transparent); }
.st-econ-badge { flex: none; font-size: 11px; letter-spacing: .07em; color: var(--os-ink-mute); }
.st-econ-badge.active { color: var(--warn); }
.st-econ-badge.nominal { color: var(--os-ink-mute); }

/* ── 8 · Shared grammar: headers, rows, tags, buttons ─────────────────────────────────────────── */
.st-sub-h { font-family: var(--mono); font-size: 10.5px; letter-spacing: .18em; text-transform: uppercase; color: var(--os-ink-mute); margin: 2px 0 10px; }
.st-empty { color: var(--os-ink-mute); font-size: 13.5px; padding: 18px 4px; font-style: italic; }
.st-tag { font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; padding: 1px 6px; border-radius: 4px; background: var(--os-surface); color: var(--os-ink-dim); vertical-align: middle; border: 1px solid var(--os-line); }
.st-tag-restricted { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 45%, transparent); }
.st-tag-contraband { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 45%, transparent); }
.st-tag-owned, .st-tag-active { color: var(--accent-2); border-color: color-mix(in srgb, var(--accent-2) 45%, transparent); }
/* The global ui.css button rule shouts ALL-CAPS; the ledger speaks sentence case. The only
   deliberate all-caps control left is UNDOCK — one piece of hardware gets to shout. */
.st-hub button { border-radius: var(--os-r-xs); text-transform: none; letter-spacing: normal; }
.st-hub button:active:not(:disabled) { transform: scale(0.97); transition: transform 50ms ease; }
.c-name, .st-sy-name, .st-svc-name, .st-inv-name, .st-mission-title, .st-bar-name { font-family: var(--font-body); font-size: 14.5px; font-weight: 600; color: var(--os-ink); }
.st-row { display: grid; grid-template-columns: 2.4fr .8fr 1fr 1fr 2.2fr 1.6fr; align-items: center; gap: 8px; padding: 7px 8px; border-bottom: 1px solid color-mix(in srgb, var(--os-ink-mute) 12%, transparent); font-size: 13px; }
.st-row-head { color: var(--os-ink-mute); font-family: var(--mono); font-size: 10px; letter-spacing: .13em; text-transform: uppercase; border-bottom: 1px solid var(--os-line-strong); position: sticky; top: -20px; background: var(--os-bg); z-index: 1; }
.st-row .c-num { text-align: right; font-variant-numeric: tabular-nums; }
.st-row.locked { opacity: .55; }
.st-list { display: block; }
.st-slotline { color: var(--os-ink-mute); font-size: 11px; letter-spacing: .04em; }
/* Verb buttons: filled tints — unmistakably buttons. */
.st-buy-btn { border-color: color-mix(in srgb, var(--good) 50%, transparent); color: var(--good); background: color-mix(in srgb, var(--good) 10%, transparent); }
.st-buy-btn:hover:not(:disabled) { background: var(--good); color: #021008; }
.st-sell-btn { border-color: color-mix(in srgb, var(--warn) 50%, transparent); color: var(--warn); background: color-mix(in srgb, var(--warn) 10%, transparent); }
.st-sell-btn:hover:not(:disabled) { background: var(--warn); color: #1a1000; }
.st-mission-accept { border-color: color-mix(in srgb, var(--accent) 55%, transparent); color: var(--accent); background: color-mix(in srgb, var(--accent) 11%, transparent); font-weight: 600; }
.st-mission-accept:hover:not(:disabled) { background: var(--accent); color: #04121a; }

/* ── 9 · Market: trade floor (3-column) + analysis stage + chart modal ────────────────────────── */
.st-market-head { display: flex; gap: 24px; margin-bottom: 10px; align-items: center; flex-wrap: wrap; }
.st-stat { display: flex; flex-direction: column; }
.st-stat-l { font-size: 9.5px; letter-spacing: .14em; color: var(--os-ink-mute); text-transform: uppercase; }
.st-credits { color: var(--energy); font-size: 15px; font-variant-numeric: tabular-nums; }
.st-cargo { color: var(--cargo); font-size: 15px; font-variant-numeric: tabular-nums; }
.st-market-purpose { flex: 1 1 260px; border: 1px solid var(--os-line); border-radius: var(--os-r-sm); padding: 7px 11px; background: var(--os-surface); color: var(--os-ink-dim); font-size: 12.5px; line-height: 1.45; }
.st-market-purpose b { color: var(--os-ink); font-weight: 600; }
.st-market-layout { display: grid; grid-template-columns: 148px minmax(0, 1fr) 268px; gap: 16px; align-items: start; }
.st-market-category-rail { display: flex; flex-direction: column; gap: 3px; position: sticky; top: 0; }
.st-market-cat-tab { display: flex; align-items: center; gap: 9px; padding: 6px 10px; border: 1px solid transparent; border-radius: var(--os-r-xs); background: transparent; color: var(--os-ink-dim); font-size: 12.5px; text-align: left; }
.st-market-cat-tab:hover { background: rgba(255,255,255,0.045); color: var(--os-ink); }
.st-market-cat-tab.active { border-color: var(--os-line); background: var(--st-accent-soft); color: var(--os-ink); box-shadow: inset 2px 0 0 var(--st-accent); }
.st-cat-icon { flex: none; width: 18px; text-align: center; }
.st-cat-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-market-center { min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.st-market-search-sort-bar { display: flex; flex-direction: column-reverse; gap: 8px; }
/* The sort header is a control strip, not a phantom table: compact inline sort keys. */
.st-market-search-sort-bar .st-row-head { display: flex; align-items: center; gap: 4px; padding: 0 2px 2px;
  border-bottom: none; position: static; background: transparent; }
.st-market-search-sort-bar .st-row-head::before { content: 'Sort'; font-family: var(--mono); font-size: 9px;
  letter-spacing: .14em; text-transform: uppercase; color: var(--os-ink-mute); margin-right: 6px; }
.st-market-search-sort-bar .st-row-head .c-qty, .st-market-search-sort-bar .st-row-head .c-act { display: none; }
.st-market-search-sort-bar .st-row-head .sf-sort { font-size: 11px; padding: 2px 9px; border-radius: 999px;
  border: 1px solid transparent; background: transparent; color: var(--os-ink-mute); }
.st-market-search-sort-bar .st-row-head .sf-sort:hover { color: var(--os-ink); }
.st-market-search-sort-bar .st-row-head .sf-sort.active { color: var(--os-ink); border-color: var(--os-line); background: rgba(255,255,255,0.04); }
.st-trade-modes { display: inline-flex; gap: 0; border: 1px solid var(--os-line); border-radius: 999px; overflow: hidden; margin-left: auto; }
.st-trade-modes button { border: 0; border-radius: 0; background: transparent; color: var(--os-ink-mute); font-size: 12px; padding: 4px 14px; }
.st-trade-modes button + button { border-left: 1px solid var(--os-line); }
.st-trade-modes button:hover { color: var(--os-ink); background: rgba(255,255,255,0.04); }
.st-trade-modes button.active { color: var(--os-ink); background: var(--st-accent-soft); box-shadow: inset 0 -2px 0 var(--st-accent); }
.st-market-sidebar { display: flex; flex-direction: column; gap: 14px; position: sticky; top: 0; }
.st-market-mission { margin: -2px 0 10px; border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent); border-radius: var(--os-r-sm); padding: 9px 11px; background: color-mix(in srgb, var(--accent) 7%, var(--os-surface)); }
.st-market-mission[hidden] { display: none; }
.st-market-mission-label { color: var(--accent); font-size: 9.5px; letter-spacing: .14em; margin-bottom: 4px; }
.st-market-mission-title { color: var(--os-ink); font-weight: 700; font-size: 13.5px; line-height: 1.3; }
.st-market-mission-body { color: var(--os-ink-dim); font-size: 12.5px; line-height: 1.4; margin-top: 4px; }
.st-market-mission-meta { color: var(--energy); font-size: 11px; margin-top: 5px; }
.st-cmdty-purpose { display: block; margin-top: 3px; white-space: normal; line-height: 1.3; color: var(--os-ink-mute); font-size: 12px; }
.st-market-mission-line { display: block; margin-top: 3px; color: var(--accent); white-space: normal; line-height: 1.25; font-size: 12px; }
.st-market-mission-line[hidden] { display: none; }
.st-row.tracked-mission { border-color: color-mix(in srgb, var(--accent) 40%, transparent); background: color-mix(in srgb, var(--accent) 5%, transparent); }
.st-market-route { margin: -2px 0 10px; border: 1px solid color-mix(in srgb, var(--good) 38%, transparent); border-radius: var(--os-r-sm); padding: 9px 11px; background: color-mix(in srgb, var(--good) 6%, var(--os-surface)); }
.st-market-route[hidden] { display: none; }
.st-market-route-label { color: var(--good); font-size: 9.5px; letter-spacing: .14em; margin-bottom: 4px; }
.st-market-route-title { color: var(--os-ink); font-weight: 700; font-size: 13.5px; line-height: 1.3; }
.st-market-route-body { color: var(--os-ink-dim); font-size: 12.5px; line-height: 1.4; margin-top: 4px; }
.st-market-route-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 7px; }
.st-market-route-meta { color: var(--good); font-size: 11px; }
.st-market-route button { padding: 4px 10px; font-size: 12px; border-color: color-mix(in srgb, var(--good) 50%, transparent); color: var(--good); background: color-mix(in srgb, var(--good) 9%, transparent); white-space: nowrap; }
.st-market-route button:hover:not(:disabled) { background: color-mix(in srgb, var(--good) 20%, transparent); }
.st-row .c-qty { display: flex; align-items: center; gap: 3px; justify-content: flex-end; }
.st-row .c-qty button { padding: 2px 7px; font-size: 11.5px; }
.st-row .c-qty button.on { border-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
.st-qty-val { min-width: 34px; text-align: right; color: var(--accent); font-variant-numeric: tabular-nums; }
.st-row .c-act { display: flex; gap: 5px; justify-content: flex-end; }
.st-market-foot { margin-top: 10px; color: var(--os-ink-dim); font-size: 12.5px; }
.st-foot-msg { font-family: var(--mono); font-size: 12px; letter-spacing: .03em; }
.st-foot-msg.st-foot-msg--ok { color: var(--good); }
.st-foot-msg.st-foot-msg--bad { color: var(--danger); }
/* commodity cards */
.st-card-spark-wrap { display: flex; align-items: center; gap: 10px; padding: 2px 0; border: 1px solid transparent; border-radius: 4px; }
.st-row-gauge { flex: 0 0 auto; }
.st-row-gauge__track { stroke: color-mix(in srgb, var(--os-ink-mute) 30%, transparent); }
.st-spark { margin-left: 0; flex: 1 1 auto; width: 120px; height: 26px; opacity: .85; }
.st-row-role { flex: 0 0 auto; display: inline-flex; flex-direction: column; align-items: center; line-height: 1; gap: 2px; min-width: 46px; }
.st-row-role-glyph { font-size: 13px; }
.st-row-role-lbl { font-family: var(--mono); font-size: 8.5px; letter-spacing: .12em; color: var(--os-ink-mute); }
.st-role--produce .st-row-role-glyph { color: var(--good); }
.st-role--consume .st-row-role-glyph { color: var(--warn); }
.st-role--none .st-row-role-glyph { color: var(--os-ink-mute); }
.st-card-header { display: flex; align-items: center; gap: 8px; }
.st-card-cat-badge { margin-left: auto; font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: var(--os-ink-mute); }
.st-expand-btn { margin-left: 2px; padding: 0 5px; font-size: 11px; line-height: 1.3; color: var(--os-ink-mute); border-color: transparent; background: transparent; opacity: .5; }
.st-cmdty-card:hover .st-expand-btn { opacity: 1; }
.st-expand-btn:hover { color: var(--accent); border-color: var(--accent); opacity: 1; }
.st-cmdty-card {
  cursor: pointer; border: 1px solid var(--os-line); border-radius: var(--os-r-sm); background: var(--os-surface);
  padding: 9px 12px; margin-bottom: 8px; transition: border-color .12s var(--ease);
  display: grid; grid-template-columns: 1fr auto;
  grid-template-areas: "head head" "scope scope" "purpose purpose" "mission mission" "best best" "prices qty" "actions actions";
  align-items: center; gap: 4px 10px;
}
.st-cmdty-card:hover { border-color: color-mix(in srgb, var(--st-accent) 45%, var(--os-line)); }
.st-cmdty-card.is-selected { border-color: var(--st-accent); box-shadow: inset 2px 0 0 var(--st-accent); }
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
.st-price-lbl { font-family: var(--mono); font-size: 8.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--os-ink-mute); }
.st-card-qty-row { display: flex; justify-content: flex-end; }
.st-best-known-line { font-size: 11.5px; color: var(--accent-2); }
.st-intel-strip { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.st-intel-strip[hidden] { display: none; }
.st-intel-chips { display: inline-flex; gap: 5px; flex-wrap: wrap; }
.st-intel-strip > button { font-size: 11px; padding: 2px 9px; border-radius: 999px; border-color: color-mix(in srgb, var(--accent-2) 40%, transparent); color: var(--accent-2); background: color-mix(in srgb, var(--accent-2) 8%, transparent); }
.st-intel-strip > button:hover { background: color-mix(in srgb, var(--accent-2) 20%, transparent); }
.st-insp-intel { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; border-top: 1px solid var(--os-line); padding-top: 6px; }
.st-insp-intel[hidden] { display: none; }
.st-insp-intel-val { font-size: 12px; color: var(--os-ink); }
.st-insp-intel-val[data-tone="warn"] { color: var(--warn); }
.st-insp-intel-val[data-tone="bad"], .st-insp-intel-val[data-tone="danger"] { color: var(--danger); }
.st-insp-intel-val[data-tone="good"], .st-insp-intel-val[data-tone="ok"] { color: var(--good); }
.st-trend-arrow { display: inline-block; font-size: 1.3em; line-height: 1; transition: transform .3s var(--ease), color .3s var(--ease); }
.st-trend-arrow.up { color: var(--warn); transform: rotate(-90deg); }
.st-trend-arrow.down { color: var(--good); transform: rotate(90deg); }
.st-trend-arrow.flat { color: var(--os-ink-mute); opacity: .4; }
.st-trend-arrow.strong { font-size: 1.6em; }
.st-heat-up { color: var(--danger); }
.st-heat-down { color: var(--good); }
.st-heat-flat { color: var(--os-ink-dim); }
/* planner + ledger (sidebar) */
.st-market-planner { border: 1px solid var(--os-line); border-radius: var(--os-r-sm); padding: 10px 12px; background: var(--os-surface); }
.st-planner-hint { color: var(--os-ink-mute); font-weight: 400; font-size: 10px; letter-spacing: .02em; text-transform: none; }
.st-planner-list { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.st-planner-empty { color: var(--os-ink-dim); font-size: 12.5px; font-style: italic; padding: 4px 0; }
.st-planner-row { display: flex; flex-direction: column; gap: 5px; padding: 8px 10px; background: rgba(10,16,28,.5); border: 1px solid var(--os-line); border-radius: var(--os-r-xs); font-size: 12.5px; }
.st-pl-cmdty { color: var(--os-ink); font-weight: 600; }
.st-pl-prices { color: var(--os-ink-dim); font-size: 12px; }
.st-pl-margin { font-weight: 600; }
.st-pl-up { color: var(--good); }
.st-pl-run { font-family: var(--mono); font-size: 11px; }
.st-pl-run--ok { color: var(--energy); }
.st-pl-run--blocked { color: var(--os-ink-mute); font-style: italic; }
.st-pl-dest { color: var(--os-ink-mute); font-size: 12px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.st-pl-intel { color: var(--accent-2); font-size: 9.5px; font-weight: 500; letter-spacing: .04em; text-transform: uppercase; }
.st-pl-nav, .st-pl-load { padding: 4px 9px; font-size: 11.5px; white-space: nowrap; align-self: flex-start; }
.st-pl-load { border-color: color-mix(in srgb, var(--good) 48%, transparent); color: var(--good); background: color-mix(in srgb, var(--good) 9%, transparent); }
.st-pl-load:hover { background: color-mix(in srgb, var(--good) 20%, transparent); }
.st-pl-nav { border-color: color-mix(in srgb, var(--accent) 48%, transparent); color: var(--accent); }
.st-pl-nav:hover { background: color-mix(in srgb, var(--accent) 13%, transparent); }
.st-market-ledger { border: 1px solid var(--os-line); border-radius: var(--os-r-sm); padding: 10px 12px; background: var(--os-surface); }
.st-ledger-list { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.st-ledger-row { font-family: var(--mono); font-size: 11px; color: var(--os-ink-dim); display: flex; justify-content: space-between; gap: 8px; }
/* analysis stage */
.st-market-stage { position: relative; margin-top: 10px; border: 1px solid var(--os-line); border-radius: var(--os-r); background: var(--os-surface); padding: 10px 12px 12px; }
.st-market-stage[hidden] { display: none; }
.st-stage-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.st-stage-title { font-family: var(--mono); font-size: 10px; letter-spacing: .18em; color: var(--st-accent); text-transform: uppercase; }
.st-stage-close { padding: 0 7px; font-size: 15px; line-height: 1.4; color: var(--os-ink-mute); border-color: var(--os-line); background: transparent; }
.st-stage-close:hover { color: var(--os-ink); border-color: var(--os-ink-mute); }
.st-stage-grid { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 10px; }
.st-stage-cell { border: 1px solid var(--os-line); border-radius: var(--os-r-xs); padding: 10px 12px; background: rgba(10,16,28,.45); min-height: 150px; display: flex; flex-direction: column; }
.st-stage-lbl { font-family: var(--mono); font-size: 9.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--os-ink-mute); margin-bottom: 8px; }
.st-stage-price-row { display: flex; align-items: center; gap: 10px; }
.st-stage-spark-wrap { flex: 0 0 auto; }
.st-stage-spark { width: 170px; height: 46px; display: block; }
.st-stage-regime { font-family: var(--mono); font-size: 13px; color: var(--os-ink); }
.st-stage-forecast-lbl { font-family: var(--mono); font-size: 9px; letter-spacing: .14em; text-transform: uppercase; color: var(--os-ink-mute); margin: 8px 0 2px; }
.st-stage-cone { width: 100%; height: 80px; display: block; }
.st-stage-supply-mount, .st-stage-route-mount { flex: 1 1 auto; display: flex; align-items: center; justify-content: center; min-height: 96px; }
.st-stage-route-meta { font-family: var(--mono); font-size: 11px; color: var(--accent-2); text-align: center; margin-top: 6px; }
.st-inspector-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12.5px; padding: 4px 0; }
.st-insp-lbl { font-family: var(--mono); font-size: 9px; letter-spacing: .1em; text-transform: uppercase; color: var(--os-ink-mute); }
.st-insp-quote, .st-insp-profit { font-size: 12.5px; color: var(--os-ink); font-variant-numeric: tabular-nums; }
.st-insp-flood-mount { display: inline-flex; }
.st-inspector-actions { margin-top: 8px; display: flex; justify-content: flex-end; }
.st-insp-route { padding: 4px 12px; font-size: 12px; color: var(--accent); border-color: color-mix(in srgb, var(--accent) 48%, transparent); background: transparent; }
.st-insp-route:hover:not(:disabled) { background: color-mix(in srgb, var(--accent) 12%, transparent); }
.st-insp-route:disabled { color: var(--os-ink-mute); border-color: var(--os-line); opacity: .6; }
.st-market-stage-overlay { position: absolute; inset: 0; pointer-events: none; }
/* chart modal */
.st-modal { position: fixed; inset: 0; z-index: 140; display: flex; align-items: center; justify-content: center; background: rgba(3, 6, 12, 0.78); }
.st-modal-content { width: min(860px, 92vw); max-height: 88vh; overflow-y: auto; border: 1px solid var(--os-line-strong); border-radius: var(--os-r); background: var(--os-deck); box-shadow: 0 30px 90px -30px rgba(0,0,0,.9); }
.st-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; border-bottom: 1px solid var(--os-line); }
.st-modal-title { font-family: var(--font-display); font-weight: 650; font-size: 15px; }
.st-modal-close { padding: 0 9px; font-size: 16px; background: transparent; border-color: var(--os-line); color: var(--os-ink-mute); }
.st-modal-close:hover { color: var(--os-ink); }
.st-modal-body { padding: 14px 18px 18px; }
.st-modal-chart-info { display: flex; gap: 20px; flex-wrap: wrap; margin-bottom: 10px; }
.st-modal-stat { display: flex; flex-direction: column; gap: 1px; }
.st-modal-stat .st-lbl { font-family: var(--mono); font-size: 9px; letter-spacing: .13em; text-transform: uppercase; color: var(--os-ink-mute); }
.st-modal-stat .st-val { font-size: 14px; color: var(--os-ink); font-variant-numeric: tabular-nums; }
.st-chart-container { position: relative; }
.st-chart-tooltip { position: absolute; pointer-events: none; background: var(--os-deck); border: 1px solid var(--os-line-strong); border-radius: var(--os-r-xs); padding: 6px 9px; font-family: var(--mono); font-size: 11px; color: var(--os-ink); }
.st-modal-event-log { margin-top: 12px; }
.st-modal-event-log-title { font-family: var(--mono); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--os-ink-mute); margin-bottom: 6px; }
.st-modal-event-item { font-size: 12.5px; color: var(--os-ink-dim); padding: 3px 0; border-bottom: 1px solid var(--os-line); }
.st-modal-event-empty { font-size: 12.5px; color: var(--os-ink-mute); font-style: italic; }
.st-ev-name { color: var(--warn); }

/* ── 10 · Hold ────────────────────────────────────────────────────────────────────────────────── */
.st-hold-header { margin-bottom: 12px; max-width: 560px; }
.st-hold-meter-label { font-family: var(--mono); font-size: 11px; letter-spacing: .06em; color: var(--os-ink-dim); margin-bottom: 5px; }
.st-hold-meter { height: 6px; border-radius: 3px; background: color-mix(in srgb, var(--os-ink-mute) 20%, transparent); overflow: hidden; }
.st-hold-meter-fill { height: 100%; background: var(--cargo); border-radius: 3px; transition: width .25s var(--ease); }
.st-hold .st-row { grid-template-columns: 2.4fr .7fr .7fr 1.2fr 1.6fr; }
.st-hold .c-act { display: flex; gap: 6px; justify-content: flex-end; }
.st-hold .st-sell-btn { padding: 3px 10px; font-size: 12px; }

/* ── 11 · Shipyard: hangar + engineering stage ────────────────────────────────────────────────── */
.st-shipyard { display: flex; flex-direction: column; gap: 12px; }
.st-shipyard .st-row { grid-template-columns: 2.6fr .6fr .8fr .9fr .9fr 1.3fr 1fr; }
.st-sy-owned { margin: 0; }
.st-sy-owned-list { display: flex; gap: 10px; flex-wrap: wrap; }
.st-sy-card { border: 1px solid var(--os-line); border-radius: var(--os-r-sm); padding: 10px 12px; min-width: 190px; background: var(--os-surface); box-shadow: var(--os-shadow); }
.st-sy-card.active { border-color: color-mix(in srgb, var(--st-accent) 55%, transparent); }
.st-sy-name { margin-bottom: 3px; }
.st-sy-meta { color: var(--os-ink-dim); font-size: 11.5px; margin-bottom: 8px; }
.st-sy-guide, .st-sy-purpose, .st-sy-card-purpose { color: var(--os-ink-dim); font-size: 12.5px; line-height: 1.45; }
.st-sy-guide { margin: 0; border: 1px solid var(--os-line); border-radius: var(--os-r-sm); padding: 9px 11px; background: var(--os-surface); }
.st-sy-job-guide { border-color: color-mix(in srgb, var(--accent) 34%, transparent); background: color-mix(in srgb, var(--accent) 6%, var(--os-surface)); }
.st-sy-job-title { color: var(--os-ink); font-weight: 700; font-size: 13.5px; margin-top: 6px; }
.st-sy-job-body { color: var(--os-ink-dim); font-size: 12.5px; line-height: 1.4; margin-top: 3px; }
.st-sy-purpose { display: block; margin-top: 3px; white-space: normal; }
.st-sy-fitline { display: block; margin-top: 3px; white-space: normal; font-size: 11.5px; line-height: 1.35; }
.st-sy-fitline--ok { color: var(--good); }
.st-sy-fitline--warn { color: var(--warn); }
.st-sy-fitline--bad { color: var(--os-ink-mute); }
.st-shipyard .st-row.mission-fit-ok { border-color: color-mix(in srgb, var(--good) 30%, transparent); background: color-mix(in srgb, var(--good) 4%, transparent); }
.st-shipyard .st-row.mission-fit-warn { border-color: color-mix(in srgb, var(--warn) 26%, transparent); background: color-mix(in srgb, var(--warn) 3%, transparent); }
.st-sy-card-purpose { margin: -3px 0 8px; color: var(--os-ink-mute); }
.st-sy-btns { display: flex; gap: 6px; }
.st-sy-btns button { font-size: 12px; padding: 4px 9px; }
.st-sy-engineering { display: grid; grid-template-columns: 250px minmax(0, 1fr) 250px; gap: 16px; flex: 1 1 auto; min-height: 440px; }
.st-sy-rail { display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.st-sy-rail-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.st-sy-rail-credits { color: var(--energy); font-size: 13px; font-variant-numeric: tabular-nums; }
.st-sy-rail-controls { display: flex; flex-direction: column; gap: 6px; }
.st-sy-rail-header { display: grid; grid-template-columns: 1.4fr .6fr 1fr; align-items: center; gap: 6px; padding: 4px 8px; font-size: 10px; color: var(--os-ink-mute); border-bottom: 1px solid var(--os-line); }
.st-sy-rail-list { flex: 1; overflow-y: auto; min-height: 0; max-height: none; display: flex; flex-direction: column; gap: 6px; padding-right: 2px; }
.st-sy-rail-card { border: 1px solid var(--os-line); border-radius: var(--os-r-xs); padding: 8px 10px; cursor: pointer; background: var(--os-surface); transition: border-color .12s, background .12s; }
.st-sy-rail-card:hover { border-color: color-mix(in srgb, var(--st-accent) 45%, transparent); background: color-mix(in srgb, var(--st-accent) 5%, var(--os-surface)); }
.st-sy-rail-card.selected { border-color: var(--st-accent); box-shadow: inset 2px 0 0 var(--st-accent); }
.st-sy-rail-card.owned { opacity: .7; }
.st-sy-rail-card.mission-fit-ok { border-color: color-mix(in srgb, var(--good) 40%, transparent); }
.st-sy-rail-card.mission-fit-warn { border-color: color-mix(in srgb, var(--warn) 34%, transparent); }
.st-sy-rail-name { font-weight: 600; font-size: 13.5px; margin-bottom: 2px; }
.st-sy-rail-meta { color: var(--os-ink-dim); font-size: 10.5px; margin-bottom: 3px; }
.st-sy-rail-slots { color: var(--os-ink-mute); font-size: 10px; margin-bottom: 4px; }
.st-sy-rail-price { color: var(--energy); font-size: 12px; font-variant-numeric: tabular-nums; }
.st-sy-stock-tag { font-size: 9.5px; color: var(--os-ink-mute); }
.st-sy-center { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
.st-sy-stage-wrap { flex: 1; min-height: 280px; }
.st-sy-identity { margin-top: 12px; padding: 10px 12px; border: 1px solid var(--os-line); border-radius: var(--os-r-sm); background: var(--os-surface); }
.st-sy-identity-role { font-family: var(--mono); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--st-accent); margin-bottom: 3px; }
.st-sy-identity-name { font-size: 16px; font-weight: 650; margin-bottom: 4px; font-family: var(--font-display); }
.st-sy-identity-slots { color: var(--os-ink-mute); font-size: 11px; margin-bottom: 6px; }
.st-sy-identity-purpose { color: var(--os-ink-dim); font-size: 12.5px; line-height: 1.4; margin-bottom: 8px; }
.st-sy-identity-line { color: var(--os-ink-mute); font-size: 12px; font-style: italic; margin-bottom: 8px; }
.st-sy-identity-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.st-sy-id-chip { font-size: 10.5px; padding: 2px 8px; border-radius: 4px; border: 1px solid var(--os-line); color: var(--os-ink-dim); background: rgba(10,16,28,.5); }
.st-sy-id-chip--role { color: var(--st-accent); border-color: color-mix(in srgb, var(--st-accent) 40%, transparent); }
.st-sy-id-chip--combat { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 38%, transparent); }
.st-sy-id-chip--cargo { color: var(--cargo); border-color: color-mix(in srgb, var(--cargo) 38%, transparent); }
.st-sy-side { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; }
.st-sy-requirements { border: 1px solid var(--os-line); border-radius: var(--os-r-sm); padding: 12px; background: var(--os-surface); }
.st-sy-req-head { font-family: var(--mono); font-size: 9.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--os-ink-mute); margin-bottom: 8px; }
.st-sy-req-price { font-size: 17px; color: var(--energy); margin-bottom: 4px; font-variant-numeric: tabular-nums; }
.st-sy-req-price--short { color: var(--danger); }
.st-sy-req-credits { font-size: 11.5px; color: var(--os-ink-dim); margin-bottom: 10px; }
.st-sy-req-state { font-family: var(--mono); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; padding: 4px 8px; border-radius: 4px; margin-bottom: 8px; display: inline-block; }
.st-sy-req-state--available { color: var(--good); border: 1px solid color-mix(in srgb, var(--good) 38%, transparent); background: color-mix(in srgb, var(--good) 8%, transparent); }
.st-sy-req-state--funding { color: var(--danger); border: 1px solid color-mix(in srgb, var(--danger) 38%, transparent); background: color-mix(in srgb, var(--danger) 8%, transparent); }
.st-sy-req-state--locked { color: var(--warn); border: 1px solid color-mix(in srgb, var(--warn) 38%, transparent); background: color-mix(in srgb, var(--warn) 8%, transparent); }
.st-sy-req-state--owned { color: var(--os-ink-mute); border: 1px solid var(--os-line); background: rgba(10,16,28,.5); }
.st-sy-req-title { font-size: 12.5px; color: var(--os-ink-dim); line-height: 1.4; margin-bottom: 10px; }
.st-sy-buy-btn { width: 100%; border-color: color-mix(in srgb, var(--good) 50%, transparent); color: var(--good); background: color-mix(in srgb, var(--good) 10%, transparent); font-weight: 600; }
.st-sy-buy-btn:hover:not(:disabled) { background: var(--good); color: #021008; }
/* compare panel — shipyard injects its own floating-tooltip CSS; in the OS shell it lives
   statically in the side column (never floats over the berth strip). */
.st-hub--os .st-sy-cmp { position: static; width: auto; pointer-events: auto; animation: none;
  box-shadow: var(--os-shadow); z-index: auto; }
.st-sy-cmp { border: 1px solid var(--os-line); border-radius: var(--os-r-sm); padding: 12px; background: var(--os-surface); }
.st-sy-cmp-h { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
.st-sy-cmp-name { font-weight: 650; font-size: 13.5px; }
.st-sy-cmp-role { font-family: var(--mono); font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--st-accent); }
.st-sy-cmp-desc { color: var(--os-ink-dim); font-size: 12px; line-height: 1.4; margin-bottom: 8px; }
.st-sy-cmp-grid { display: grid; grid-template-columns: 1.2fr .9fr auto .9fr; gap: 3px 8px; align-items: baseline; font-size: 12px; }
.st-sy-cmp-lbl { color: var(--os-ink-mute); }
.st-sy-cmp-cur { text-align: right; color: var(--os-ink-dim); font-variant-numeric: tabular-nums; }
.st-sy-cmp-arr { color: var(--os-ink-mute); }
.st-sy-cmp-new { text-align: right; color: var(--os-ink); font-variant-numeric: tabular-nums; }
.st-sy-cmp-delta { font-size: 10.5px; }
.st-sy-cmp-sep { grid-column: 1 / -1; height: 1px; background: var(--os-line); margin: 3px 0; }
.st-sy-cmp-slots { color: var(--os-ink-mute); font-size: 11px; margin-top: 6px; }

/* engineering stage (shared shipyard/outfitting) */
.st-eng-stage { display: flex; flex-direction: column; height: 100%; }
.st-eng-stage__frame {
  position: relative; flex: 1; min-height: 240px;
  border: 1px solid var(--os-line); border-radius: var(--os-r); overflow: hidden;
  background: radial-gradient(ellipse at 50% 72%, #0a1426, #05070d 82%);
}
.st-eng-stage__frame::before {
  content: ''; position: absolute; inset: 0; pointer-events: none; z-index: 1;
  background: repeating-linear-gradient(0deg, color-mix(in srgb, var(--st-accent) 3%, transparent) 0, color-mix(in srgb, var(--st-accent) 3%, transparent) 1px, transparent 1px, transparent 26px);
}
.st-eng-stage__canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; opacity: 0; transition: opacity .25s ease; }
.st-eng-stage.is-ready .st-eng-stage__canvas { opacity: 1; }
.st-eng-stage__overlay { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
.st-eng-stage__gauges { position: absolute; left: 10px; top: 10px; z-index: 3; display: flex; flex-wrap: wrap; gap: 8px; max-width: 180px; pointer-events: none; }
.st-eng-gauge { background: rgba(5,7,13,.55); border-radius: 50%; padding: 2px; }
.st-eng-stage__label { margin-top: 8px; text-align: center; font-size: 12.5px; color: var(--os-ink-dim); min-height: 1.2em; }
.st-eng-stage__label .mono { color: var(--st-accent); }
.st-outfit-ghost-label { color: var(--warn); font-style: italic; }

/* fit tree */
.st-fit-tree { font-size: 12.5px; overflow-y: auto; max-height: none; flex: 1 1 auto; min-height: 0; padding-right: 4px; }
.st-fit-empty { color: var(--os-ink-mute); font-style: italic; padding: 8px 0; }
.st-fit-node { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; padding: 5px 8px; border-radius: var(--os-r-xs); cursor: pointer; }
.st-fit-node--root { font-weight: 600; color: var(--os-ink); background: var(--os-surface); border: 1px solid var(--os-line); margin-bottom: 6px; }
.st-fit-node--slot { padding-left: 18px; border-left: 2px solid transparent; margin: 1px 0; }
.st-fit-node--slot:hover { background: color-mix(in srgb, var(--st-accent) 7%, transparent); }
.st-fit-node--selected { background: color-mix(in srgb, var(--st-accent) 11%, transparent); }
.st-fit-node--filled { color: var(--os-ink); }
.st-fit-node--empty { color: var(--os-ink-mute); font-style: italic; }
.st-fit-node--preview-ok { border-left-color: var(--good); }
.st-fit-node--preview-bad { border-left-color: var(--danger); animation: st-fit-blink 1s ease-in-out 2; }
.st-fit-node--invalid { border-color: var(--danger); }
/* J05: holds an inline 16px stroke SVG now, not a Unicode character. inline-flex centres the glyph
   on the row's optical middle; a bare inline <svg> would sit on the text baseline and ride low. The
   per-type colour rules below still drive it, because the art strokes with currentColor.
   NOTE: this CSS lives inside a JS template literal — never use backticks in these comments. */
.st-fit-icon { width: 18px; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; }
.st-fit-icon svg { display: block; }
.st-fit-icon--hull { color: var(--accent); }
.st-fit-icon--weapon { color: var(--danger); }
.st-fit-icon--shield { color: var(--shield); }
.st-fit-icon--engine { color: var(--warn); }
.st-fit-icon--cargo { color: var(--cargo); }
.st-fit-icon--mining { color: var(--accent-2); }
.st-fit-icon--utility { color: var(--accent-3); }
.st-fit-branch { margin-bottom: 8px; }
.st-fit-branch-head { display: flex; align-items: center; gap: 6px; padding: 4px 8px; color: var(--os-ink-mute); text-transform: uppercase; letter-spacing: .08em; font-size: 10.5px; }
.st-fit-branch-label { flex: 1; }
.st-fit-branch-count { color: var(--os-ink-dim); }
.st-fit-label { flex: 1; }
.st-fit-meta { color: var(--os-ink-mute); font-size: 10.5px; }
.st-fit-slot-size { color: var(--st-accent); min-width: 18px; }
.st-fit-slot-name { flex: 1; }
.st-fit-slot-facing { color: var(--os-ink-mute); font-size: 10px; text-transform: capitalize; }
.st-fit-preview-arrow { color: var(--st-accent); }
.st-fit-preview-name { color: var(--good); }
.st-fit-preview-name--bad { color: var(--danger); }
.st-fit-mods { width: 100%; padding-left: 24px; }
.st-fit-mod { color: var(--os-ink-dim); font-size: 10.5px; line-height: 1.35; }
.st-fit-mod--preview { color: var(--good); }
@keyframes st-fit-blink { 0%,100% { background: transparent; } 50% { background: color-mix(in srgb, var(--danger) 10%, transparent); } }

/* ── 12 · Outfitting ──────────────────────────────────────────────────────────────────────────── */
.st-outfit-engineering { display: grid; grid-template-columns: 270px minmax(0, 1fr) 290px; gap: 16px; min-height: 480px; }
.st-outfit-tree-wrap { min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
.st-outfit-center { display: flex; flex-direction: column; gap: 12px; min-width: 0; min-height: 0; }
.st-outfit-stage-wrap { min-height: 280px; flex: 1 1 280px; }
.st-outfit-feel { border: 1px solid var(--os-line); border-radius: var(--os-r-sm); padding: 10px 12px; background: var(--os-surface); }
.st-outfit-feel__head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 8px; font-family: var(--mono); font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: var(--st-accent); }
.st-outfit-feel__head .mono { color: var(--os-ink-mute); letter-spacing: .06em; }
.st-outfit-feel-axes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px 12px; }
.st-outfit-feel-axis__head { display: flex; justify-content: space-between; gap: 8px; color: var(--os-ink-dim); font-size: 11px; }
.st-outfit-feel-axis__sense { margin-top: 2px; color: var(--os-ink-mute); font-size: 9.5px; }
.st-outfit-feel-bar { height: 5px; margin-top: 3px; overflow: hidden; border-radius: 999px; background: rgba(255,255,255,.055); }
.st-outfit-feel-bar__fill { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, color-mix(in srgb, var(--st-accent) 45%, transparent), var(--st-accent)); }
.st-outfit-feel-section { margin-top: 9px; padding-top: 8px; border-top: 1px solid color-mix(in srgb, var(--os-line) 72%, transparent); }
.st-outfit-feel-label { display: block; margin-bottom: 5px; color: var(--os-ink-mute); font-family: var(--mono); font-size: 9.5px; letter-spacing: .11em; text-transform: uppercase; }
.st-outfit-feel-preview, .st-outfit-feel-risks { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; color: var(--os-ink-dim); font-size: 11px; }
.st-outfit-feel-delta, .st-outfit-feel-risk { padding: 2px 7px; border: 1px solid var(--os-line); border-radius: 999px; background: rgba(255,255,255,.025); font-family: var(--mono); font-size: 10px; }
.st-outfit-feel-delta b { color: var(--st-accent); }
.st-outfit-feel-risk--illegal { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 38%, transparent); }
.st-outfit-feel-risk--loud, .st-outfit-feel-risk--hot { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 38%, transparent); }
.st-outfit-feel-risk--heavy { color: var(--energy); border-color: color-mix(in srgb, var(--energy) 34%, transparent); }
.st-outfit-feel-note, .st-outfit-feel-empty { color: var(--os-ink-mute); font-size: 10.5px; line-height: 1.35; }
.st-outfit-feel-note--warn { color: var(--warn); }
.st-outfit-right { display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow-y: auto; }
/* In the narrow right column the module shop stacks as compact cards, never a crushed table. */
.st-outfit-right .st-shop-head-row.st-row { display: none; }
.st-outfit-right .st-shop-row { grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas: "name price" "slot slot" "stats stats" "act act"; gap: 2px 8px;
  border: 1px solid var(--os-line); border-radius: var(--os-r-xs); background: var(--os-surface);
  padding: 8px 10px; margin-bottom: 6px; }
.st-outfit-right .st-shop-row > .c-name { grid-area: name; }
.st-outfit-right .st-shop-row > .st-shop-slot { grid-area: slot; }
.st-outfit-right .st-shop-row > .st-shop-stats { grid-area: stats; }
.st-outfit-right .st-shop-row > .st-shop-price { grid-area: price; text-align: right; }
.st-outfit-right .st-shop-row > .c-act { grid-area: act; justify-content: flex-end; display: flex; margin-top: 4px; }
.st-outfit-grid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 18px; align-items: start; }
.st-outfit-top { display: grid; grid-template-columns: 1.6fr 1fr; gap: 18px; margin-bottom: 16px; }
.st-slot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.st-slot { border: 1px solid var(--os-line); border-radius: var(--os-r-xs); padding: 8px 10px; cursor: pointer; background: var(--os-surface); position: relative; }
.st-slot.empty { border-style: dashed; }
.st-slot.filled { border-color: var(--os-line-strong); }
.st-slot.sel { border-color: var(--st-accent); box-shadow: inset 2px 0 0 var(--st-accent); }
.st-slot-weapon { border-left: 3px solid var(--danger); }
.st-slot-shield { border-left: 3px solid var(--shield); }
.st-slot-engine { border-left: 3px solid var(--warn); }
.st-slot-cargo { border-left: 3px solid var(--cargo); }
.st-slot-mining { border-left: 3px solid var(--accent-2); }
.st-slot-utility { border-left: 3px solid var(--accent-3); }
.st-slot-type { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: var(--os-ink-mute); }
.st-slot-facing { display: inline-block; margin-left: 5px; padding: 0 5px; border-radius: 3px; background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); font-size: 9px; letter-spacing: .08em; border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent); }
.st-slot-mod { font-size: 13px; margin-top: 3px; min-height: 1.1em; }
.st-slot-unfit { position: absolute; top: 6px; right: 6px; font-size: 10px; padding: 1px 6px; border-color: var(--danger); color: var(--danger); }
.st-stat-table { border: 1px solid var(--os-line); border-radius: var(--os-r-xs); padding: 6px 10px; background: var(--os-surface); }
.st-stat-row { display: grid; grid-template-columns: 1.4fr 1fr .9fr; align-items: baseline; gap: 6px; padding: 3px 0; font-size: 13px; }
.st-stat-row .st-stat-l { color: var(--os-ink-dim); text-transform: none; letter-spacing: normal; font-size: 13px; }
.st-stat-row--drive { grid-template-columns: 1.4fr 1fr; border-bottom: 1px solid var(--os-line); margin-bottom: 3px; padding-bottom: 4px; }
.st-stat-row--drive .st-stat-v { color: var(--st-accent); letter-spacing: .04em; }
.st-stat-v { text-align: right; font-variant-numeric: tabular-nums; }
.st-delta { text-align: right; font-size: 11.5px; font-family: var(--mono); }
.st-delta.up { color: var(--good); } .st-delta.down { color: var(--danger); }
.st-inv-list { display: flex; flex-wrap: wrap; gap: 8px; }
.st-inv-item { border: 1px solid var(--os-line); border-radius: var(--os-r-xs); padding: 6px 10px; cursor: pointer; background: var(--os-surface); display: flex; flex-direction: column; }
.st-inv-item:hover { border-color: var(--st-accent); }
.st-inv-item.incompat { opacity: .55; }
.st-inv-name { font-size: 13px; }
.st-inv-meta { font-size: 10px; color: var(--os-ink-mute); letter-spacing: .06em; text-transform: uppercase; }
.st-outfit-shop { margin-top: 20px; border-top: 1px solid var(--os-line); padding-top: 12px; }
.st-shop-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.st-shop-credits { color: var(--energy); font-size: 13.5px; font-variant-numeric: tabular-nums; }
.st-shop-head-row.st-row { grid-template-columns: 2.2fr .8fr 2.4fr 1fr 1.2fr; }
.st-shop-list { display: block; max-height: 340px; overflow-y: auto; }
.st-shop-row { display: grid; grid-template-columns: 2.2fr .8fr 2.4fr 1fr 1.2fr; align-items: center; gap: 8px; padding: 7px 8px; border-bottom: 1px solid color-mix(in srgb, var(--os-ink-mute) 10%, transparent); font-size: 13px; border-radius: var(--os-r-xs); transition: background var(--dur) var(--ease); }
.st-shop-row:hover { background: rgba(255,255,255,0.035); }
.st-shop-row.locked { opacity: .45; filter: saturate(.3); }
.st-shop-row.noafford { opacity: .6; }
.st-shop-row.nofit .c-name { color: var(--os-ink-mute); }
.st-shop-slot { color: var(--os-ink-mute); text-transform: uppercase; letter-spacing: .06em; font-size: 11px; }
.st-shop-stats { color: var(--os-ink-dim); font-size: 12px; line-height: 1.35; }
.st-shop-price { text-align: right; color: var(--energy); font-variant-numeric: tabular-nums; }
.st-shop-delta { margin-top: 2px; display: flex; flex-wrap: wrap; gap: 4px; }
.st-shop-delta .st-delta { font-size: 10.5px; }
.st-shop-group { font-family: var(--mono); font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: var(--st-accent); margin: 12px 0 4px; padding: 4px 8px; display: flex; align-items: center; gap: 10px; }
.st-shop-group::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, var(--os-line), transparent); }
.st-shop-row .c-act button { font-size: 12px; padding: 3px 10px; }
.st-shop-row .c-act button:not(:disabled) { border-color: color-mix(in srgb, var(--good) 48%, transparent); color: var(--good); background: color-mix(in srgb, var(--good) 8%, transparent); }
.st-shop-row .c-act button:not(:disabled):hover { background: var(--good); color: #021008; }

/* ── 13 · Manufacture ─────────────────────────────────────────────────────────────────────────── */
.st-manufacture { display: flex; flex-direction: column; gap: 6px; }
.st-manuf-intro { color: var(--os-ink-dim); font-size: 13px; margin-bottom: 8px; line-height: 1.45; }
.st-manuf-group-h { font-family: var(--mono); font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: var(--st-accent); margin: 14px 0 6px; display: flex; align-items: center; gap: 10px; }
.st-manuf-group-h::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, var(--os-line), transparent); }
.st-manuf-list { display: flex; flex-direction: column; gap: 8px; }
.st-manuf-card { padding: 12px 14px; border: 1px solid var(--os-line); border-radius: var(--os-r-sm); background: var(--os-surface); box-shadow: var(--os-shadow); }
.st-manuf-card.st-manuf-locked { opacity: .5; filter: saturate(.3); }
.st-manuf-card-h { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.st-manuf-title { font-size: 14.5px; font-weight: 600; color: var(--os-ink); display: flex; align-items: center; gap: 8px; }
.st-manuf-desc { color: var(--os-ink-dim); font-size: 12.5px; margin: 4px 0 2px; line-height: 1.4; }
.st-manuf-augnote { color: var(--warn); font-size: 11.5px; margin-top: 2px; }
.st-manuf-out { color: var(--good); font-size: 13px; margin: 4px 0; font-weight: 600; }
.st-manuf-mats { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.st-mat-chip { font-size: 11px; padding: 2px 7px; border-radius: 999px; font-family: var(--mono); background: color-mix(in srgb, var(--good) 10%, transparent); color: var(--good); border: 1px solid color-mix(in srgb, var(--good) 25%, transparent); }
.st-mat-chip.st-mat-missing { background: color-mix(in srgb, var(--danger) 10%, transparent); color: var(--danger); border-color: color-mix(in srgb, var(--danger) 25%, transparent); }

/* ── 14 · Services: quote cards → confirm (a centered console column, not a left-locked list) ── */
.st-services { display: flex; flex-direction: column; align-items: center; }
.st-services > * { width: min(840px, 100%); }
.st-svc-list { display: flex; flex-direction: column; gap: 8px; }
.st-svc-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid var(--os-line); border-radius: var(--os-r-sm); padding: 12px 14px; background: var(--os-surface); box-shadow: var(--os-shadow); }
.st-svc-row.disabled { opacity: .5; }
.st-svc-row--blocked { border-color: color-mix(in srgb, var(--danger) 30%, transparent); }
.st-svc-row--recommend { border-color: color-mix(in srgb, var(--accent) 34%, transparent); background: color-mix(in srgb, var(--accent) 7%, var(--os-surface)); }
.st-svc-row--recommend-ok { border-color: color-mix(in srgb, var(--good) 30%, transparent); background: color-mix(in srgb, var(--good) 6%, var(--os-surface)); }
.st-svc-row--recommend-warn { border-color: color-mix(in srgb, var(--warn) 34%, transparent); background: color-mix(in srgb, var(--warn) 7%, var(--os-surface)); }
.st-svc-row--recommend-bad { border-color: color-mix(in srgb, var(--danger) 38%, transparent); background: color-mix(in srgb, var(--danger) 8%, var(--os-surface)); }
.st-svc-row--recommend .st-svc-name { color: var(--accent); font-family: var(--mono); font-size: 11px; letter-spacing: .11em; text-transform: uppercase; }
.st-svc-row button { flex: none; }
.st-svc-row button:not(:disabled) { border-color: color-mix(in srgb, var(--accent) 50%, transparent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); font-weight: 600; }
.st-svc-row button:not(:disabled):hover { background: var(--accent); color: #04121a; }
.st-svc-detail { font-size: 11.5px; color: var(--os-ink-dim); margin-top: 2px; font-family: var(--mono); }
.st-svc-meta { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
.st-svc-chip { font-family: var(--mono); font-size: 10.5px; line-height: 1.2; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--os-line); color: var(--os-ink-dim); background: rgba(255,255,255,0.03); }
.st-svc-chip--ok { color: var(--good); border-color: color-mix(in srgb, var(--good) 30%, transparent); }
.st-svc-chip--warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 32%, transparent); }
.st-svc-chip--bad { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 32%, transparent); }
.st-svc-chip--cost { color: var(--energy); border-color: color-mix(in srgb, var(--energy) 26%, transparent); }

/* ── 15 · Factions ────────────────────────────────────────────────────────────────────────────── */
.st-fac-note { font-size: 11px; color: var(--os-ink-mute); margin-bottom: 12px; letter-spacing: .06em; }
.st-fac-list { display: flex; flex-direction: column; gap: 12px; max-width: 820px; }
.st-fac-row { border-bottom: 1px solid color-mix(in srgb, var(--os-ink-mute) 12%, transparent); padding-bottom: 10px; }
.st-fac-head { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
.st-fac-dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.st-fac-name { flex: 1; font-size: 14px; }
.st-fac-tier { font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; padding: 1px 7px; border-radius: 4px; }
.st-fac-val { min-width: 56px; text-align: right; font-size: 13px; font-variant-numeric: tabular-nums; }
.st-fac-bar { position: relative; height: 8px; border-radius: 4px; background: rgba(255,255,255,0.05); overflow: hidden; border: 1px solid var(--os-line); }
.st-fac-bar-mid { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: var(--os-ink-mute); opacity: .6; }
.st-fac-bar-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; transform-origin: left; background: var(--accent); opacity: .7; }
.st-fac-ctrl, .st-fac-rel { font-size: 10.5px; color: var(--os-ink-mute); margin-top: 5px; }
.st-fac-rel { color: var(--os-ink-dim); }
.st-fac-effect { font-size: 12.5px; color: var(--os-ink); line-height: 1.4; margin-top: 5px; }
.st-fac-guidance { display: grid; grid-template-columns: minmax(52px, auto) 1fr; gap: 4px 10px; margin-top: 8px; padding: 8px 9px; border: 1px solid var(--os-line); border-radius: var(--os-r-xs); background: rgba(10,16,28,.4); color: var(--os-ink-dim); font-size: 11.5px; line-height: 1.4; }
.st-fac-guidance-label { color: var(--st-accent); text-transform: uppercase; letter-spacing: .08em; font-size: 10px; }
.st-fac-contracts { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
.st-fac-contract { font-size: 10px; line-height: 1.25; padding: 3px 6px; border-radius: 4px; border: 1px solid var(--os-line); color: var(--os-ink-mute); background: rgba(255,255,255,.02); }
.st-fac-contract b { font-family: var(--mono); font-size: 9px; letter-spacing: .06em; text-transform: uppercase; color: var(--os-ink-dim); margin-right: 3px; }
.st-fac-contract.unlocked { color: var(--good); border-color: color-mix(in srgb, var(--good) 26%, transparent); }
.st-fac-contract.unlocked b { color: var(--good); }
.st-fac-contract.locked:not(.aspirational) { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 26%, transparent); }
.st-fac-contract.aspirational { border-style: dashed; }
.st-fac-hostile { color: var(--danger); background: color-mix(in srgb, var(--danger) 10%, transparent); }
.st-fac-cool { color: var(--warn); background: color-mix(in srgb, var(--warn) 10%, transparent); }
.st-fac-neutral { color: var(--os-ink-dim); background: rgba(255,255,255,0.05); }
.st-fac-warm, .st-fac-good { color: var(--good); background: color-mix(in srgb, var(--good) 10%, transparent); }
.st-fac-allied { color: var(--accent-2); background: color-mix(in srgb, var(--accent-2) 12%, transparent); }
.st-fac-bar-fill.st-fac-hostile { background: var(--danger); }
.st-fac-bar-fill.st-fac-cool { background: var(--warn); }
.st-fac-bar-fill.st-fac-good, .st-fac-bar-fill.st-fac-warm { background: var(--good); }
.st-fac-bar-fill.st-fac-allied { background: var(--accent-2); }
.st-faction-gauge { height: 6px; border-radius: 1px; position: relative; width: 140px; margin-top: 4px; background: linear-gradient(90deg, var(--danger) 0%, var(--danger) 20%, var(--warn) 20%, var(--warn) 40%, var(--ink-mute) 40%, var(--ink-mute) 60%, var(--accent-2) 60%, var(--accent-2) 80%, var(--good) 80%, var(--good) 100%); }
.st-faction-gauge::after { content: ''; position: absolute; top: -3px; width: 2px; height: 12px; background: var(--os-ink); box-shadow: 0 0 4px rgba(0,0,0,0.8); left: var(--rep-pct, 50%); transition: left 0.5s var(--ease); }

/* ── 16 · Bar ─────────────────────────────────────────────────────────────────────────────────── */
.st-bar-list { display: flex; flex-direction: column; gap: 14px; max-width: 820px; }
.st-bar-card { display: flex; gap: 14px; border: 1px solid var(--os-line); border-radius: var(--os-r-sm); padding: 12px 14px; background: var(--os-surface); box-shadow: var(--os-shadow); }
.st-bar-avatar { width: 64px; height: 64px; border-radius: var(--os-r-xs); flex: none; border: 1px solid var(--os-line); }
.st-bar-body { flex: 1; }
.st-bar-role { color: var(--os-ink-mute); font-size: 10.5px; letter-spacing: .06em; text-transform: uppercase; }
.st-bar-line { color: var(--os-ink-dim); font-size: 13px; margin: 6px 0 8px; font-style: italic; }
.st-bar-intel { display: flex; gap: 5px; flex-wrap: wrap; margin: -2px 0 8px; }
.st-bar-intel-chip { font-size: 10.5px; line-height: 1.25; border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent); border-radius: 5px; padding: 2px 6px; color: var(--os-ink-dim); background: rgba(10,16,28,.48); }
.st-bar-intel-chip b { font-family: var(--mono); color: var(--accent); font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
.st-bar-intel-chip--ok { border-color: color-mix(in srgb, var(--good) 30%, transparent); color: var(--good); }
.st-bar-intel-chip--ok b { color: var(--good); }
.st-bar-intel-chip--warn { border-color: color-mix(in srgb, var(--warn) 32%, transparent); color: var(--warn); }
.st-bar-intel-chip--warn b { color: var(--warn); }
.st-bar-intel-chip--bad { border-color: color-mix(in srgb, var(--danger) 36%, transparent); color: var(--danger); }
.st-bar-intel-chip--bad b { color: var(--danger); }
.st-bar-intel-chip--story { border-color: color-mix(in srgb, var(--accent-3) 36%, transparent); color: var(--accent-3); }
.st-bar-intel-chip--story b { color: var(--accent-3); }
.st-bar-choices { display: flex; gap: 6px; flex-wrap: wrap; }
.st-bar-choices button { font-size: 12.5px; }
.st-bar-reply { margin-top: 8px; font-size: 13px; color: var(--accent-2); max-height: 0; overflow: hidden; transition: max-height .2s ease; }
.st-bar-reply.show { max-height: 120px; }
.st-bar-offer { margin-top: 8px; display: grid; gap: 6px; justify-items: start; }
.st-bar-offer .st-mission-preflight { margin: 0; }
.st-bar-offer .st-mission-consequences { margin: 0; }
.st-bar-offer.accepted { opacity: .82; }
.st-bar-offer-warn { margin: -1px 0 0; }
.st-bar-offer-blocker { margin: -1px 0 0; }
.st-bar-accept-btn { font-size: 12.5px; }
.st-bar-log-btn { border-color: color-mix(in srgb, var(--good) 42%, transparent); color: var(--good); }
.st-bar-log-btn:hover { background: color-mix(in srgb, var(--good) 12%, transparent); }

/* ── 17 · Missions: contract board + preflight instrument ─────────────────────────────────────── */
.st-mission-guide { margin: -2px 0 12px; color: var(--os-ink-dim); font-size: 12.5px; line-height: 1.45; }
.st-mission-recommend { margin: -2px 0 12px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid color-mix(in srgb, var(--accent) 34%, transparent); border-radius: var(--os-r-sm); padding: 10px 12px; background: color-mix(in srgb, var(--accent) 7%, var(--os-surface)); }
.st-mission-recommend[hidden] { display: none; }
.st-mission-recommend--ok { border-color: color-mix(in srgb, var(--good) 32%, transparent); background: color-mix(in srgb, var(--good) 6%, var(--os-surface)); }
.st-mission-recommend--warn { border-color: color-mix(in srgb, var(--warn) 34%, transparent); background: color-mix(in srgb, var(--warn) 7%, var(--os-surface)); }
.st-mission-recommend--bad { border-color: color-mix(in srgb, var(--danger) 38%, transparent); background: color-mix(in srgb, var(--danger) 7%, var(--os-surface)); }
.st-mission-recommend-copy { min-width: 0; display: grid; gap: 3px; }
.st-mission-recommend-label { color: var(--accent); font-size: 9.5px; letter-spacing: .14em; }
.st-mission-recommend--ok .st-mission-recommend-label { color: var(--good); }
.st-mission-recommend--warn .st-mission-recommend-label { color: var(--warn); }
.st-mission-recommend--bad .st-mission-recommend-label { color: var(--danger); }
.st-mission-recommend-title { color: var(--os-ink); font-weight: 700; font-size: 13.5px; line-height: 1.3; }
.st-mission-recommend-reason { color: var(--os-ink-dim); font-size: 12px; line-height: 1.35; }
.st-mission-recommend button { flex: none; max-width: 100%; font-size: 12px; white-space: nowrap; border-color: color-mix(in srgb, var(--accent) 52%, transparent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); font-weight: 600; }
.st-mission-recommend button:hover:not(:disabled) { background: var(--accent); color: #04121a; }
.st-mission-accepted { margin: -2px 0 12px; border: 1px solid color-mix(in srgb, var(--good) 40%, transparent); border-radius: var(--os-r-sm); padding: 10px 12px; background: color-mix(in srgb, var(--good) 6%, var(--os-surface)); position: relative; }
.st-mission-accepted[hidden] { display: none; }
.st-mission-accepted-label { color: var(--good); font-size: 9.5px; letter-spacing: .16em; margin-bottom: 4px; text-transform: uppercase; }
.st-mission-accepted-title { color: var(--os-ink); font-weight: 700; font-size: 14px; line-height: 1.3; }
.st-mission-accepted-next { color: var(--os-ink-dim); font-size: 12.5px; line-height: 1.4; margin-top: 4px; }
.st-mission-accepted-log { color: var(--os-ink-mute); font-size: 11px; line-height: 1.4; margin-top: 6px; }
.st-mission-accepted-actions { margin-top: 9px; display: flex; gap: 10px; flex-wrap: wrap; }
.st-mission-accepted.trace-run::after { content: ''; position: absolute; inset: -1px; border-radius: var(--os-r-sm); border: 1px solid var(--good); pointer-events: none; animation: st-receipt-trace 620ms ease-out 1 both; }
@keyframes st-receipt-trace { 0% { clip-path: inset(0 100% 100% 0); opacity: 1; } 60% { clip-path: inset(0 0 0 0); opacity: 1; } 100% { opacity: 0; } }
.st-mission-list { display: flex; flex-direction: column; gap: 10px; }
.st-mission-card { border: 1px solid var(--os-line); border-radius: var(--os-r-sm); padding: 11px 14px; background: var(--os-surface); box-shadow: var(--os-shadow); cursor: pointer; transition: border-color .15s ease, background .15s ease; }
.st-mission-card:hover { border-color: color-mix(in srgb, var(--st-accent) 40%, transparent); }
.st-mission-card.selected { border-color: var(--st-accent); background: color-mix(in srgb, var(--st-accent) 6%, var(--os-surface)); box-shadow: inset 3px 0 0 var(--st-accent); }
.st-mission-card.tracked { border-color: color-mix(in srgb, var(--accent) 50%, transparent); }
.st-mission-card.recommended--ok { border-color: color-mix(in srgb, var(--good) 36%, transparent); }
.st-mission-card.recommended--warn { border-color: color-mix(in srgb, var(--warn) 38%, transparent); }
.st-mission-card.recommended--bad { border-color: color-mix(in srgb, var(--danger) 40%, transparent); }
.st-mission-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 10px; }
.st-mission-title { font-size: 14px; min-width: 0; }
.st-mission-badges { display: inline-flex; align-items: center; gap: 6px; flex: none; }
.st-mission-recommended { font-family: var(--mono); font-size: 9.5px; letter-spacing: .08em; padding: 1px 7px; border-radius: 4px; border: 1px solid var(--os-line); background: rgba(255,255,255,.03); }
.st-mission-recommended--ok { color: var(--good); border-color: color-mix(in srgb, var(--good) 32%, transparent); }
.st-mission-recommended--warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 32%, transparent); }
.st-mission-recommended--bad { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 34%, transparent); }
.st-mission-readiness { font-family: var(--mono); font-size: 9.5px; letter-spacing: .08em; padding: 1px 7px; border-radius: 4px; border: 1px solid var(--os-line); background: rgba(255,255,255,.03); }
.st-mission-readiness--ok { color: var(--good); border-color: color-mix(in srgb, var(--good) 30%, transparent); }
.st-mission-readiness--warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 32%, transparent); }
.st-mission-readiness--bad { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 34%, transparent); }
.st-mission-risk { font-size: 9.5px; letter-spacing: .08em; padding: 1px 7px; border-radius: 4px; background: rgba(255,255,255,.04); color: var(--os-ink-dim); }
.st-mission-risk.r0 { color: var(--good); } .st-mission-risk.r1 { color: var(--accent-2); }
.st-mission-risk.r2 { color: var(--warn); } .st-mission-risk.r3, .st-mission-risk.r4 { color: var(--danger); }
.st-mission-meta { font-size: 11.5px; color: var(--os-ink-dim); margin: 4px 0; }
.st-mission-brief { color: var(--os-ink); font-size: 13px; line-height: 1.42; margin-top: 6px; }
.st-mission-purpose { color: var(--os-ink); font-size: 12.5px; line-height: 1.4; margin-top: 5px; }
.st-mission-next { color: var(--os-ink-mute); font-size: 11.5px; line-height: 1.4; margin: 3px 0 8px; }
.st-mission-preflight { display: flex; flex-wrap: wrap; gap: 5px; margin: 0 0 8px; }
.st-mission-preflight-chip { font-family: var(--mono); font-size: 10.5px; letter-spacing: .04em; border: 1px solid var(--os-line); border-radius: 4px; padding: 2px 6px; color: var(--os-ink-dim); background: rgba(10,16,28,.45); }
.st-mission-preflight-chip--ok { color: var(--good); border-color: color-mix(in srgb, var(--good) 30%, transparent); }
.st-mission-preflight-chip--warn { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 32%, transparent); }
.st-mission-preflight-chip--bad { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 32%, transparent); }
.st-mission-preflight-chip--info { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 26%, transparent); }
.st-mission-standing { display: flex; gap: 8px; align-items: baseline; font-size: 11px; line-height: 1.3; margin: -3px 0 8px; color: var(--os-ink-mute); }
.st-mission-standing .mono { font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; }
.st-mission-standing--ok .mono { color: var(--good); }
.st-mission-standing--locked .mono { color: var(--danger); }
.st-mission-preflight-warn { color: var(--warn); font-size: 11.5px; line-height: 1.35; margin: -3px 0 8px; }
.st-mission-rewards { display: flex; gap: 14px; font-size: 13px; margin-bottom: 8px; }
.st-mission-cr { color: var(--energy); }
.st-mission-rep { color: var(--accent-2); }
.st-mission-exp { color: var(--os-ink-mute); }
.st-mission-consequences { display: flex; flex-wrap: wrap; gap: 5px; margin: -2px 0 8px; }
.st-mission-consequence { font-size: 10.5px; letter-spacing: .02em; line-height: 1.25; padding: 3px 6px; border: 1px solid var(--os-line); border-radius: 4px; color: var(--os-ink-dim); background: rgba(255,255,255,.02); }
.st-mission-consequence b { color: var(--os-ink); font-weight: 700; text-transform: uppercase; }
.st-mission-consequence--ok { border-color: color-mix(in srgb, var(--good) 28%, transparent); color: var(--good); }
.st-mission-consequence--warn { border-color: color-mix(in srgb, var(--warn) 28%, transparent); color: var(--warn); }
.st-mission-consequence--bad { border-color: color-mix(in srgb, var(--danger) 32%, transparent); color: var(--danger); }
.st-mission-btns { display: flex; gap: 8px; align-items: center; }
.st-mission-btns button { font-size: 12.5px; }
.st-mission-unmet { font-size: 11.5px; color: var(--danger); }
/* ops board */
.st-ops { display: flex; gap: 16px; align-items: stretch; }
.st-ops-rail { flex: 0 0 320px; min-width: 0; max-width: 360px; }
.st-ops-rail-h { color: var(--os-ink-mute); font-size: 9.5px; letter-spacing: .16em; margin: 0 0 8px; text-transform: uppercase; }
.st-ops-center { flex: 1 1 auto; min-width: 0; align-self: stretch; border: 1px solid var(--os-line); border-radius: var(--os-r); background: var(--os-surface); padding: 14px 16px; }
@media (max-width: 900px) { .st-ops { flex-direction: column; } .st-ops-rail { flex: 1 1 auto; max-width: none; width: 100%; } }
.st-ops-empty { color: var(--os-ink-mute); font-size: 13px; line-height: 1.5; padding: 30px 10px; text-align: center; }
.st-ops-empty[hidden], .st-ops-dossier[hidden] { display: none; }
.st-ops-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 13px; }
.st-ops-eyebrow { color: var(--st-accent); font-size: 9px; letter-spacing: .18em; }
.st-ops-title { color: var(--os-ink); font-weight: 700; font-size: 16px; line-height: 1.25; margin-top: 3px; font-family: var(--font-display); }
.st-ops-state { flex: none; font-family: var(--mono); font-size: 10.5px; letter-spacing: .1em; font-weight: 700; padding: 4px 10px; border: 1px solid var(--os-line); border-radius: 5px; background: rgba(255,255,255,.03); white-space: nowrap; color: var(--os-ink-dim); }
.st-ops-state[data-kind="ok"] { color: var(--good); border-color: color-mix(in srgb, var(--good) 40%, transparent); }
.st-ops-state[data-kind="warn"] { color: var(--warn); border-color: color-mix(in srgb, var(--warn) 40%, transparent); }
.st-ops-state[data-kind="bad"] { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 42%, transparent); }
.st-ops-route { position: relative; height: 92px; margin: 0 0 14px; border: 1px solid var(--os-line); border-radius: var(--os-r-sm); overflow: hidden; background: radial-gradient(120% 140% at 50% 130%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 62%), rgba(6,12,22,.5); }
.st-ops-route[data-kind="warn"] { border-color: color-mix(in srgb, var(--warn) 32%, transparent); }
.st-ops-route[data-kind="danger"] { border-color: color-mix(in srgb, var(--danger) 34%, transparent); }
.st-ops-beam, .st-ops-ping { position: absolute; inset: 0; pointer-events: none; }
.st-ops-node { position: absolute; top: 50%; transform: translateY(-50%); display: grid; gap: 3px; max-width: 42%; z-index: 1; }
.st-ops-node--origin { left: 14px; text-align: left; }
.st-ops-node--dest { right: 14px; text-align: right; }
.st-ops-node-tag { font-size: 8.5px; letter-spacing: .14em; color: var(--os-ink-mute); }
.st-ops-node-name { font-size: 13px; font-weight: 700; color: var(--os-ink); line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-ops-node--dest .st-ops-node-name { color: var(--accent); }
.st-ops-gauges { display: flex; gap: 18px; margin: 0 0 14px; flex-wrap: wrap; }
.st-ops-gauge { display: flex; align-items: center; gap: 9px; }
.st-ops-gauge-mount { flex: none; display: flex; }
.st-ops-gauge-meta { display: grid; gap: 1px; }
.st-ops-gauge-val { font-family: var(--mono); font-size: 13.5px; font-weight: 700; color: var(--os-ink); line-height: 1.05; font-variant-numeric: tabular-nums; }
.st-ops-gauge-label { font-size: 8.5px; letter-spacing: .12em; color: var(--os-ink-mute); text-transform: uppercase; }
.st-ops-comms { border: 1px solid color-mix(in srgb, var(--accent) 24%, transparent); border-left: 3px solid color-mix(in srgb, var(--accent) 55%, transparent); border-radius: var(--os-r-xs); padding: 9px 12px; margin: 0 0 12px; background: color-mix(in srgb, var(--accent) 6%, transparent); }
.st-ops-comms-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 4px; }
.st-ops-comms-from { color: var(--accent-2); font-weight: 700; font-size: 12.5px; min-width: 0; }
.st-ops-comms-tag { flex: none; color: var(--accent); font-size: 8.5px; letter-spacing: .14em; }
.st-ops-comms-msg { color: var(--os-ink-dim); font-size: 12.5px; line-height: 1.5; font-style: italic; }
.st-ops-standing { margin: 0 0 8px; }
.st-ops-warn[hidden] { display: none; }
.st-ops-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 2px; }
.st-ops-btn { font-size: 13px; }
.st-ops-btn--plot { border-color: color-mix(in srgb, var(--accent) 44%, transparent); color: var(--accent); }
.st-ops-btn--plot:hover { background: color-mix(in srgb, var(--accent) 12%, transparent); }
.st-mission-cslot { display: flex; flex-wrap: wrap; gap: 5px; margin: 7px 0 6px; }
.st-mission-chip { font-family: var(--mono); font-size: 9.5px; letter-spacing: .03em; padding: 2px 6px; border: 1px solid var(--os-line); border-radius: 4px; color: var(--os-ink-dim); background: rgba(10,16,28,.42); }
.st-mission-chip--cr { color: var(--energy); }
.st-mission-chip--rep { color: var(--accent-2); }
.st-mission-chip--r0 { color: var(--good); } .st-mission-chip--r1 { color: var(--accent-2); }
.st-mission-chip--r2 { color: var(--warn); } .st-mission-chip--r3, .st-mission-chip--r4 { color: var(--danger); }
.st-mission-chip--time { color: var(--os-ink-mute); }

/* ── 18 · Legacy comms overlays stay parked while docked chrome is active (pre-existing rule) ── */
#sf-comms, #sf-comm-backlog, #sf-comm-backlog-btn { display: none !important; }
[data-tip]::after { border-left: 3px solid var(--tip-accent, var(--os-line-strong)); }
[data-tip-severity="ok"]   { --tip-accent: var(--good); }
[data-tip-severity="warn"] { --tip-accent: var(--warn); }
[data-tip-severity="bad"]  { --tip-accent: var(--danger); }

/* ── 19 · Reduced motion: every state read stays legible, all sweeps become instant ───────────── */
@media (prefers-reduced-motion: reduce) {
  .st-hub *, .st-modal * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
  .st-station-name.acquiring::after { animation: none; }
  .st-hub.trace-active::after { animation: none; opacity: 0; }
  .st-content::after { animation: none; }
  .st-mission-accepted.trace-run::after { animation: none; }
}
html.sf-reduce-motion .st-mission-accepted.trace-run::after { animation: none; }
html.sf-reduce-motion .st-hub.trace-active::after { animation: none; opacity: 0; }
`;
