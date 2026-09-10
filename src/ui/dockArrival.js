// Pure presenter for a compact dock-arrival strip. It consumes receipts from existing owners and
// deliberately emits no voice, toast, mission, economy, faction, heat, or traffic mutations.

import { leftoverMechanicCard } from '../story/mechanicVoice.js';
import { leftoverLedgerCard } from '../story/storyLedger.js';
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

function currentSectorId(state) {
  return state && state.world && state.world.currentSectorId || null;
}

function liveStationFor(state, stationId) {
  if (!stationId || !state) return null;
  const list = state.entityList;
  if (Array.isArray(list)) {
    for (const entity of list) {
      if (!entity || entity.alive === false || entity.type !== 'station') continue;
      if (entity.data && entity.data.stationId === stationId) return entity;
    }
  }
  return null;
}

function leftoverLine(value) {
  const next = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  return next || null;
}

function leftoverRumorMatchesBerth(rec, state) {
  if (!rec) return false;
  const sectorId = currentSectorId(state);
  if (rec.sectorId && sectorId && rec.sectorId !== sectorId) return false;
  return true;
}

/** Leftover pirate rumor the Ceres incident already wrote — lastCard, else lastHeadline. */
export function leftoverRumorCard(state, _stationId) {
  const stored = state && state.ui && state.ui.pirateRumor && state.ui.pirateRumor.lastCard;
  if (stored && stored.body && leftoverRumorMatchesBerth(stored, state)) {
    const eventId = stored.eventId
      || (stored.sectorId && stored.zoneId ? `pirateRumor:${stored.sectorId}:${stored.zoneId}` : null);
    return leftoverCardFields({
      badge: 'PIRACY',
      title: stored.title || 'Pirate rumor',
      body: stored.body,
      eventId,
      kind: stored.kind || 'piracy',
      tone: 'danger',
    });
  }
  const zones = state && state.pirateRumor && state.pirateRumor.zones;
  if (!zones || typeof zones !== 'object') return null;
  let best = null;
  for (const rec of Object.values(zones)) {
    if (!rec || !rec.lastHeadline || !leftoverRumorMatchesBerth(rec, state)) continue;
    if (!best || (rec.lastHeadlineAt || 0) > (best.lastHeadlineAt || 0)) best = rec;
  }
  if (!best) return null;
  return leftoverCardFields({
    badge: 'PIRACY',
    title: 'Pirate rumor',
    body: best.lastHeadline,
    eventId: `pirateRumor:${best.sectorId}:${best.zoneId}`,
    kind: 'piracy',
    tone: 'danger',
  });
}

export function leftoverRumorLine(state, stationId) {
  const card = leftoverRumorCard(state, stationId);
  if (card && card.body) return card.body;
  const log = state && state.ui && state.ui.marketNews && Array.isArray(state.ui.marketNews.log)
    ? state.ui.marketNews.log : [];
  const rec = log.find((entry) => (
    entry
    && entry.kind === 'piracy'
    && entry.source === 'pirateRumor:headline'
    && leftoverLine(entry.text)
  ));
  return rec ? leftoverLine(rec.text) : null;
}

function leftoverPatchedReceipt(data) {
  if (!data || typeof data !== 'object') return null;
  const patch = data.structurePatch
    || (Array.isArray(data.receipts)
      && data.receipts.find((row) => row && (row.kind === 'patched' || (row.data && row.data.receiptId))));
  if (!patch || patch.kind !== 'patched') return null;
  const receiptId = patch.receiptId || (patch.data && patch.data.receiptId) || null;
  const text = leftoverLine(patch.text);
  if (!receiptId || !text) return null;
  return { receiptId: String(receiptId), text, kind: 'patched' };
}

/** Leftover yard patch already stamped on the live station entity. */
export function leftoverStructurePatch(state, station = {}) {
  const stationId = station.id || station.stationId || (station.data && station.data.stationId) || '';
  const fromArg = leftoverPatchedReceipt(station.data);
  if (fromArg) return fromArg;
  const live = liveStationFor(state, stationId);
  return leftoverPatchedReceipt(live && live.data);
}

function stationIdForFreighter(state, rec, ent) {
  if (ent && ent.data && ent.data.stationId) return ent.data.stationId;
  if (rec && rec.targetId != null && state && state.entities && typeof state.entities.get === 'function') {
    const target = state.entities.get(rec.targetId);
    if (target && target.data && target.data.stationId) return target.data.stationId;
  }
  return null;
}

/** Leftover routeDisrupted + leftover live hull count. No traffic.js write. */
export function leftoverRouteLine(state, stationId) {
  if (!stationId) return null;
  const list = state && state.traffic && Array.isArray(state.traffic.freighters)
    ? state.traffic.freighters : [];
  const entities = state && state.entities;
  let remain = 0;
  let disrupted = 0;
  for (const rec of list) {
    if (!rec) continue;
    const ent = entities && typeof entities.get === 'function' ? entities.get(rec.id) : null;
    if (!ent || ent.alive === false) continue;
    if (stationIdForFreighter(state, rec, ent) !== stationId) continue;
    remain += 1;
    if (rec.routeDisrupted || (ent.data && ent.data.routeDisrupted)) disrupted += 1;
  }
  if (!disrupted) return null;
  return remain === 1
    ? 'One hull remains on this disrupted approach.'
    : `${remain} hulls remain on this disrupted approach.`;
}

/** Leftover dock card for this station: stored lastCard, else leftover cardsForStation, else leftover rumor. */
export function leftoverEventCard(state, stationId) {
  if (!stationId) return leftoverRumorCard(state, stationId);
  const stored = state && state.ui && state.ui.marketNews && state.ui.marketNews.lastCard;
  if (stored && stored.stationId === stationId) {
    const fields = leftoverCardFields(stored);
    if (fields) return fields;
  }
  const liveCards = cardsForStation(state, stationId);
  const live = leftoverCardFields(liveCards && liveCards[0]);
  if (live) return live;
  return leftoverRumorCard(state, stationId);
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

function leftoverTraceHost(targets) {
  const from = targets && (targets.patchEl || targets.routeEl || targets.ledgerEl
    || targets.mechanicEl || targets.newsEl || targets.cardEl);
  const root = from && from.parentElement ? from.parentElement : null;
  const query = (sel) => (root && root.querySelector ? root.querySelector(sel) : null);
  return {
    patchEl: (targets && targets.patchEl) || query('.sxb-berth__patch'),
    routeEl: (targets && targets.routeEl) || query('.sxb-berth__route'),
    ledgerEl: (targets && targets.ledgerEl) || query('.sxb-berth__ledger'),
    mechanicEl: (targets && targets.mechanicEl) || query('.sxb-berth__mechanic'),
  };
}

function paintLeftoverLine(el, text) {
  const next = leftoverLine(text);
  if (el) {
    el.hidden = !next;
    setNodeText(el, next || '');
  }
  return next;
}

/** The writer stationApp uses: ticker line stays; leftover card fields go on the berth article. */
export function writeBerthArrival(targets, view, fallbackNews = '') {
  const newsEl = targets && targets.newsEl;
  const cardEl = targets && targets.cardEl;
  const host = leftoverTraceHost(targets);
  const news = (view && view.news) || fallbackNews || '';
  setNodeText(newsEl, news);
  return {
    news,
    eventCard: paintBerthEventCard(cardEl, view && view.eventCard),
    patch: paintLeftoverLine(host.patchEl, view && view.patch),
    route: paintLeftoverLine(host.routeEl, view && view.route),
    ledger: paintBerthEventCard(host.ledgerEl, view && view.ledger),
    mechanic: paintBerthEventCard(host.mechanicEl, view && view.mechanic),
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
  const rumor = leftoverRumorLine(state, stationId);
  const news = rumor || localNews(state, stationId);
  const route = leftoverRouteLine(state, stationId);
  const traffic = localTraffic(state, stationId) || route;
  const paperwork = paperworkFor(state);
  const eventCard = leftoverEventCard(state, stationId);
  const ledger = leftoverLedgerCard(state);
  const mechanic = leftoverMechanicCard(state);
  const patch = leftoverStructurePatch(state, station);
  const serviceCount = Array.isArray(station.services) ? station.services.length : 0;
  const identity = String(station.name || stationId || 'Station');
  const patchText = patch && patch.text ? patch.text : null;
  const ledgerLine = ledger && ledger.body ? ledger.body : null;
  const mechanicLine = mechanic && mechanic.body ? mechanic.body : null;
  const lines = [action.label, news, traffic, paperwork, patchText, ledgerLine, mechanicLine]
    .filter(Boolean)
    .slice(0, 7);
  return {
    identity,
    primaryAction: action.label,
    primaryTarget: action.target,
    news,
    eventCard,
    rumor,
    patch: patchText,
    patchReceiptId: patch && patch.receiptId ? patch.receiptId : null,
    route,
    ledger,
    ledgerLine,
    mechanic,
    mechanicLine,
    traffic,
    paperwork,
    serviceState: serviceCount ? `${serviceCount} berth services listed` : 'No berth services listed',
    lines,
  };
}
