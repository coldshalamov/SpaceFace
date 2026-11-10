// src/ui/station/stationHubModel.js — shared station-hub state projections and actions.
// The pure, DOM-free half of the legacy station hub (src/ui/screens/stationHub.js): the station
// exit gate the docked shell commits undocks through, the hold sell-price projection the cargo
// manifest reads, the mission-board readiness badge, cargo-key normalization for persisted
// manifests, and the hub root-class contract. Live consumers import this module directly.
import { COMMODITIES } from '../../data/commodities.js';

const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

// === Station exit owner (UIUX-STATION-EXIT-CONFIRMATION) ────────────────────────────────────────
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

const CARGO_ITEM_KEY_MAX_LENGTH = 128;

/** Normalize a persisted cargo key without discarding legacy unknown cargo from the manifest. */
export function normalizeCargoItemKey(value) {
  if (typeof value !== 'string') return null;
  const key = value.trim();
  return key && key.length <= CARGO_ITEM_KEY_MAX_LENGTH ? key : null;
}

/** Resolve only catalog-backed cargo to an actionable commodity id. */
export function canonicalCargoItemId(value) {
  const key = normalizeCargoItemKey(value);
  return key && COMMODITY_BY_ID.has(key) ? key : null;
}

/** Board-readiness badge derived from the shared mission preflight result (screens/missionLog and
 *  the station contract board render it identically). Pure: preflight in, chip contract out. */
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

/**
 * Stable structural identity for a Service Dock item list. Readiness is deliberately excluded: the
 * hub refreshes a few times per second while docked, and rebuilding the buttons on each refresh
 * resets their pointer/focus state halfway through the magnification curve.
 * @param {Array<{id?: string, label?: string, icon?: string}>} items
 */
export function dockRailItemKey(items = []) {
  return items.map((item) => [item && item.id, item && item.label, item && item.icon]
    .map((value) => String(value == null ? '' : value)).join('\u001f')).join('\u001e');
}

// === Station tab + service vocabulary ───────────────────────────────────────────────────────────
// The player-facing names and per-tab service availability the station surfaces share. Pure:
// authored data in, label/status records out. The live station consumes these under their
// original names for the current import graph; new consumers import this module directly.

/** Authored service display names — never raw service ids with underscores in player copy. */
export const SERVICE_LABELS = {
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

export function stationServiceLabel(svc) {
  return SERVICE_LABELS[svc] || titleCaseWords(svc);
}

// Station tab display names + purpose lines (the "what is this tab for" copy).
const STATION_TABS = [
  { id: 'market', label: 'Market', help: 'Buy cargo, sell cargo, and set profitable trade nav routes.' },
  { id: 'shipyard', label: 'Shipyard', help: 'Buy whole ships (new chassis). Changes base cargo, toughness, and what module sizes fit.' },
  { id: 'outfit', label: 'Outfitting', help: 'Buy and install modules on your current ship: guns, shields, cargo pods, mining tools.' },
  { id: 'manufacture', label: 'Manufacture', help: 'Turn mined and traded materials into modules, upgrades, and hulls.' },
  { id: 'missions', label: 'Missions', help: 'Accept contracts; accepted missions auto-track and place nav guidance.' },
  { id: 'services', label: 'Services', help: 'Refuel, repair, and handle station services before undocking.' },
  { id: 'factions', label: 'Factions', help: 'Check standing and learn which groups control stations and contracts.' },
  { id: 'bar', label: 'Bar', help: 'Find rumors, contacts, and station-side leads.' },
];

function titleCaseWords(value) {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Display label for a station tab id ("hold" reads HOLD); unknown ids title-case. */
export function stationTabLabel(tabId) {
  if (tabId === 'hold') return 'HOLD';
  const tab = STATION_TABS.find((t) => t.id === tabId);
  return (tab && tab.label) || titleCaseWords(tabId);
}

/** Purpose line for a station tab id (tab help copy). */
export function stationTabPurpose(tabId) {
  if (tabId === 'hold') return 'View cargo hold manifest, capacity, and item values.';
  const tab = STATION_TABS.find((t) => t.id === tabId);
  return (tab && tab.help) || 'Pick a station action, then undock with a clearer next objective.';
}

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

/**
 * Service availability for a station tab at a specific station. Informs without disabling: the
 * result never carries a `disabled` flag — an unavailable tab still explains how to find one.
 */
export function stationTabServiceStatus(tabId, stn) {
  if (tabId === 'hold') {
    return {
      state: 'available',
      offered: true,
      label: 'manifest',
      title: 'HOLD: View cargo hold manifest. ' + stationTabPurpose(tabId),
    };
  }
  const rule = TAB_SERVICE_RULES[tabId];
  const label = stationTabLabel(tabId);
  if (!rule) {
    return {
      state: 'neutral',
      offered: true,
      label: 'station-wide',
      title: label + ': station-wide information. ' + stationTabPurpose(tabId),
    };
  }
  const services = (stn && Array.isArray(stn.services)) ? stn.services : [];
  if (!services.length) {
    return {
      state: 'unknown',
      offered: true,
      label: 'check services',
      title: label + ': service list unknown. ' + stationTabPurpose(tabId),
    };
  }
  const offered = rule.any.some((service) => services.includes(service));
  if (offered) {
    return {
      state: 'available',
      offered: true,
      label: rule.availableLabel,
      title: label + ': ' + rule.availableLabel + '. ' + stationTabPurpose(tabId),
    };
  }
  return {
    state: 'unavailable',
    offered: false,
    label: rule.unavailableLabel,
    title: label + ': ' + rule.unavailableLabel + ' at ' + ((stn && stn.name) || 'this station') + '. ' + rule.unavailableHint,
  };
}
