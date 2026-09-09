// Pure presenter for a compact dock-arrival strip. It consumes receipts from existing owners and
// deliberately emits no voice, toast, mission, economy, faction, heat, or traffic mutations.

import { COMMODITIES } from '../data/commodities.js';
import { isPlayerWanted } from '../systems/heat.js';
import { cardsForStation } from './marketNews.js';

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

function leftoverCardFields(card) {
  if (!card || !card.badge || !card.title || !card.body) return null;
  return {
    badge: String(card.badge).replace(/\s+/g, ' ').trim(),
    title: String(card.title).replace(/\s+/g, ' ').trim(),
    body: String(card.body).replace(/\s+/g, ' ').trim(),
    eventId: card.eventId ? String(card.eventId) : null,
    kind: card.kind ? String(card.kind) : null,
    tone: card.tone ? String(card.tone) : null,
  };
}

/** Leftover dock card for this station: stored lastCard, else leftover cardsForStation. */
export function leftoverEventCard(state, stationId) {
  if (!stationId) return null;
  const stored = state && state.ui && state.ui.marketNews && state.ui.marketNews.lastCard;
  if (stored && stored.stationId === stationId) {
    const fields = leftoverCardFields(stored);
    if (fields) return fields;
  }
  const live = cardsForStation(state, stationId);
  return leftoverCardFields(live && live[0]);
}

function setNodeText(node, value) {
  const next = String(value == null ? '' : value);
  if (node && node.textContent !== next) node.textContent = next;
}

/**
 * Paint leftover card fields onto the berth article stationApp mounts.
 * Returns the painted fields, or null when the host is hidden.
 */
export function paintBerthEventCard(cardEl, card) {
  if (!cardEl) return null;
  const painted = leftoverCardFields(card);
  cardEl.hidden = !painted;
  if (cardEl.removeAttribute) {
    if (!painted || !painted.eventId) cardEl.removeAttribute('data-event-id');
    if (!painted || !painted.kind) cardEl.removeAttribute('data-kind');
    if (!painted || !painted.tone) cardEl.removeAttribute('data-tone');
  }
  if (!painted) {
    setNodeText(cardEl.querySelector && cardEl.querySelector('.sxb-event__badge'), '');
    setNodeText(cardEl.querySelector && cardEl.querySelector('.sxb-event__title'), '');
    setNodeText(cardEl.querySelector && cardEl.querySelector('.sxb-event__body'), '');
    if (cardEl.removeAttribute) cardEl.removeAttribute('aria-label');
    return null;
  }
  if (painted.eventId && cardEl.setAttribute) cardEl.setAttribute('data-event-id', painted.eventId);
  if (painted.kind && cardEl.setAttribute) cardEl.setAttribute('data-kind', painted.kind);
  if (painted.tone && cardEl.setAttribute) cardEl.setAttribute('data-tone', painted.tone);
  setNodeText(cardEl.querySelector && cardEl.querySelector('.sxb-event__badge'), painted.badge);
  setNodeText(cardEl.querySelector && cardEl.querySelector('.sxb-event__title'), painted.title);
  setNodeText(cardEl.querySelector && cardEl.querySelector('.sxb-event__body'), painted.body);
  if (cardEl.setAttribute) {
    cardEl.setAttribute('aria-label', `${painted.badge}. ${painted.title}. ${painted.body}`);
  }
  return painted;
}

/** The writer stationApp uses: ticker line stays; leftover card fields go on the berth article. */
export function writeBerthArrival(targets, view, fallbackNews = '') {
  const newsEl = targets && targets.newsEl;
  const cardEl = targets && targets.cardEl;
  const news = (view && view.news) || fallbackNews || '';
  setNodeText(newsEl, news);
  return {
    news,
    eventCard: paintBerthEventCard(cardEl, view && view.eventCard),
  };
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
  const eventCard = leftoverEventCard(state, stationId);
  const serviceCount = Array.isArray(station.services) ? station.services.length : 0;
  const identity = String(station.name || stationId || 'Station');
  const lines = [action.label, news, traffic, paperwork].filter(Boolean).slice(0, 4);
  return {
    identity,
    primaryAction: action.label,
    primaryTarget: action.target,
    news,
    eventCard,
    traffic,
    paperwork,
    serviceState: serviceCount ? `${serviceCount} berth services listed` : 'No berth services listed',
    lines,
  };
}
