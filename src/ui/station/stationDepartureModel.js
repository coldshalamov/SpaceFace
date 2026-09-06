// src/ui/station/stationDepartureModel.js — departure readiness + first-dock handoff projections.
// Pure state → chip/step records shared by the live "Orbital Command" shell (stationApp.js):
// the Undock tile's READY/CHECK/RISK summary, the Departure Check chips, and the 3-step
// Getting Started handoff. Live consumers import this module directly.
import { COMMODITIES } from '../../data/commodities.js';
import { prettyType } from './stationHubFormatters.js';
import { stationTabLabel } from './stationHubModel.js';
import { activeMissionCount } from './stationMissionModel.js';

const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));

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

/** One chip per launch surface: tracked work, cargo hold, fuel, hull. Reads live state only. */
export function departureReadinessChips(state) {
  return [
    departureMissionChip(state),
    departureCargoChip(state),
    departureFuelChip(state),
    departureHullChip(state),
  ];
}

/** Undock-tile summary from the chips: worst chip wins; warnings never hard-block undock. */
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

/** Whether the opening docked route still owes the player the 3-step Getting Started strip. */
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

/** The sell → job → launch steps for the first-dock handoff strip. */
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
        : 'Opens ' + stationTabLabel(firstDockDepartureTarget(departureChips))
          + '. ' + departure.status + ' — repair, refuel, or resolve the red departure chip before undock.',
      kind: departure.state === 'risk' ? 'bad' : (departure.state === 'check' ? 'warn' : 'ok'),
      done: departure.state === 'ready' && missionDone,
      targetTab: firstDockDepartureTarget(departureChips),
    },
  ];
}
