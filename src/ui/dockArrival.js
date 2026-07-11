// Pure presenter for a compact dock-arrival strip. It consumes receipts from existing owners and
// deliberately emits no voice, toast, mission, economy, faction, heat, or traffic mutations.

import { COMMODITIES } from '../data/commodities.js';
import { isPlayerWanted } from '../systems/heat.js';

const CONTRABAND_IDS = new Set(COMMODITIES.filter((def) => def.legality === 'contraband').map((def) => def.id));

function usedCargo(state) {
  const cargo = state && state.player && state.player.cargo;
  return Number(cargo && cargo.usedVolume) || 0;
}

function hasContraband(state) {
  const items = state && state.player && state.player.cargo && state.player.cargo.items || {};
  return Object.entries(items).some(([id, qty]) => CONTRABAND_IDS.has(id) && Number(qty) > 0);
}

function primaryActionFor(state) {
  if (usedCargo(state) > 0) return { label: 'Sell carried cargo', target: 'hold' };
  const active = state && state.missions && Array.isArray(state.missions.active) ? state.missions.active : [];
  if (!active.length) return { label: 'Take a local contract', target: 'missions' };
  return { label: 'Review departure and undock', target: 'undock' };
}

function localNews(state, stationId) {
  const model = state && state.ui && state.ui.marketNews;
  const log = model && Array.isArray(model.log) ? model.log : [];
  const rec = log.find((entry) => entry && entry.stationId === stationId && entry.text);
  if (rec) return String(rec.text).replace(/\s+/g, ' ').trim();
  const card = model && model.lastCard;
  if (card && card.stationId === stationId && card.headline) return String(card.headline).replace(/\s+/g, ' ').trim();
  return null;
}

function localTraffic(state, stationId) {
  const receipts = state && state.stationLife && Array.isArray(state.stationLife.traffic)
    ? state.stationLife.traffic
    : [];
  const rec = receipts.find((entry) => entry && entry.stationId === stationId && entry.text);
  return rec ? String(rec.text).replace(/\s+/g, ' ').trim() : null;
}

function paperworkFor(state) {
  if (isPlayerWanted(state)) return 'Wanted status flagged at this berth.';
  if (hasContraband(state)) return 'Restricted cargo may draw a customs scan.';
  return null;
}

export function buildDockArrival(state = {}, station = {}) {
  const stationId = station.id || station.stationId || '';
  const action = primaryActionFor(state);
  const news = localNews(state, stationId);
  const traffic = localTraffic(state, stationId);
  const paperwork = paperworkFor(state);
  const serviceCount = Array.isArray(station.services) ? station.services.length : 0;
  const identity = String(station.name || stationId || 'Station');
  const lines = [action.label, news, traffic, paperwork].filter(Boolean).slice(0, 4);
  return {
    identity,
    primaryAction: action.label,
    primaryTarget: action.target,
    news,
    traffic,
    paperwork,
    serviceState: serviceCount ? `${serviceCount} berth services listed` : 'No berth services listed',
    lines,
  };
}
