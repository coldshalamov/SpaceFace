// Event-owned contact continuity and recent berth traffic. This system never writes economy,
// faction, cargo, credits, heat, missions, or traffic; it records conversations and receipts.

import { COMMODITIES } from '../data/commodities.js';
import {
  CONTACT_COUNTER_DEFS,
  createInitialStationContactCounters,
  normalizeStationContactCounters,
  normalizeStationContactRecord,
} from '../data/stationContacts.js';

const COMMODITY_BY_ID = new Map(COMMODITIES.map((def) => [def.id, def]));
const MAX_TRAFFIC_RECEIPTS = 8;

function ensureContactBag(state) {
  const player = state.player || (state.player = {});
  if (!player.stationContacts || typeof player.stationContacts !== 'object' || Array.isArray(player.stationContacts)) {
    player.stationContacts = {};
  }
  return player.stationContacts;
}

function ensureCounterBag(state) {
  const player = state.player || (state.player = {});
  player.stationContactCounters = normalizeStationContactCounters(player.stationContactCounters);
  return player.stationContactCounters;
}

function ensureLifeState(state) {
  if (!state.stationLife || typeof state.stationLife !== 'object') state.stationLife = {};
  if (!Array.isArray(state.stationLife.traffic)) state.stationLife.traffic = [];
  return state.stationLife;
}

function commodityLabel(id) {
  const def = id && COMMODITY_BY_ID.get(id);
  return def && def.name ? def.name : String(id || 'cargo').replace(/^cmdty_/, '').replace(/_/g, ' ');
}

function freightCommodity(payload) {
  if (!payload) return null;
  if (payload.primaryCommodityId) return payload.primaryCommodityId;
  const trade = Array.isArray(payload.trades) && payload.trades[0];
  if (trade && trade.commodityId) return trade.commodityId;
  const pressure = Array.isArray(payload.pressures) && payload.pressures[0];
  return pressure && (pressure.commodityId || pressure.good) || null;
}

export const stationContacts = {
  name: 'stationContacts',
  state: null,
  bus: null,
  _subs: null,

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._subs = [];
    ensureContactBag(this.state);
    ensureCounterBag(this.state);
    ensureLifeState(this.state);
    const on = (event, handler) => {
      this.bus.on(event, handler);
      this._subs.push([event, handler]);
    };
    on('ui:talkContact', (payload = {}) => this._recordTalk(payload));
    on('stationContact:counterDelta', (payload = {}) => this._recordCounterDelta(payload));
    on('freight:arrival', (payload = {}) => this._recordFreight(payload, 'arrival'));
    on('freight:loss', (payload = {}) => this._recordFreight(payload, 'loss'));
  },

  newGame() {
    if (!this.state) return;
    this.state.player.stationContacts = {};
    this.state.player.stationContactCounters = createInitialStationContactCounters();
    this.state.stationLife = { traffic: [] };
  },

  _recordCounterDelta(payload) {
    const trackerId = String(payload.trackerId || '');
    const def = CONTACT_COUNTER_DEFS[trackerId];
    const delta = Math.trunc(Number(payload.delta) || 0);
    if (!def || !delta) return;
    const previous = ensureCounterBag(this.state);
    const next = normalizeStationContactCounters({
      ...previous,
      [trackerId]: previous[trackerId] + delta,
    });
    this.state.player.stationContactCounters = next;
    this.bus.emit('stationContact:counterChanged', {
      trackerId,
      contactId: def.contactId,
      previous: previous[trackerId],
      value: next[trackerId],
      reason: String(payload.reason || '').slice(0, 96) || null,
    });
  },

  _recordTalk(payload) {
    const contactId = String(payload.contactId || '').slice(0, 96);
    if (!contactId) return;
    const bag = ensureContactBag(this.state);
    const previous = normalizeStationContactRecord(bag[contactId]);
    const choice = String(payload.choiceId || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 48);
    const choiceFlag = choice ? `choice_${choice}` : null;
    const meaningful = choice && choice !== 'dismiss' && choice !== 'bye';
    const firstMeaningfulChoice = meaningful && !previous.flags[choiceFlag];
    const flags = { ...previous.flags };
    if (choiceFlag) flags[choiceFlag] = true;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const next = normalizeStationContactRecord({
      ...previous,
      met: true,
      talkCount: previous.talkCount + 1,
      standing: previous.standing + (firstMeaningfulChoice ? 1 : 0),
      stationId: payload.stationId || previous.stationId,
      canonicalKey: payload.canonicalKey || previous.canonicalKey,
      name: payload.name || previous.name,
      lastChoice: choice || previous.lastChoice,
      lastTalkSimTime: now,
      lastDockSimTime: now,
      flags,
    });
    bag[contactId] = next;
    this.bus.emit('stationContact:changed', { contactId, record: { ...next, flags: { ...next.flags } } });
  },

  _recordFreight(payload, kind) {
    const stationId = payload && payload.stationId ? String(payload.stationId) : null;
    if (!stationId) return;
    const commodityId = freightCommodity(payload);
    const qty = Math.max(0, Math.round(Number(payload.totalQty) || 0));
    const cargo = commodityLabel(commodityId);
    const text = kind === 'arrival'
      ? `${cargo} shipment cleared berth${qty ? ` · ${qty}u` : ''}.`
      : `Inbound ${cargo} delayed after a freight loss.`;
    const model = ensureLifeState(this.state);
    const rec = {
      kind,
      stationId,
      commodityId,
      text,
      simTime: Number.isFinite(this.state.simTime) ? this.state.simTime : 0,
      intentId: payload.intentId || null,
    };
    if (rec.intentId && model.traffic.some((entry) => entry.intentId === rec.intentId)) return;
    model.traffic.unshift(rec);
    if (model.traffic.length > MAX_TRAFFIC_RECEIPTS) model.traffic.length = MAX_TRAFFIC_RECEIPTS;
    this.bus.emit('stationLife:trafficChanged', { ...rec });
  },

  destroy() {
    for (const [event, handler] of (this._subs || [])) this.bus.off(event, handler);
    this._subs = [];
  },
};
