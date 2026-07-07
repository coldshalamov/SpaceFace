// BP-13/B12 Station Pirate-Rumor Heat.
//
// Reader/aggregator only: derives lane rumors from real spawned pirate encounters and civilian
// traffic deaths. It never spawns, never edits encounter weights, and never writes economy state.
import { pickVariant } from '../ui/marketNews.js';
import { zoneAt, zonesForSector } from '../data/sectorZones.js';

export const PIRATE_RUMOR_THRESHOLD = 3;
export const PIRATE_RUMOR_DECAY_PER_S = 0.003;
const PIRATE_RUMOR_COOLDOWN_S = 300;
const SCHEMA_VERSION = 1;

const PIRATE_ENCOUNTER_KINDS = new Set([
  'ambush_snare',
  'pirate_toll',
  'named_hunter',
  'claim_threat',
]);

const CIVILIAN_TRAFFIC_ROLES = new Set(['hauler', 'courier', 'miner', 'rescue', 'trader']);

const HEADLINES = Object.freeze([
  'Station boards warn: {count} ships vanished near {zone}.',
  'Pirate rumor: {zone} is hot after {count} recent losses.',
  'Route notice: avoid {zone}; raider reports are piling up.',
]);

export const pirateRumor = {
  name: 'pirateRumor',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._subs = [];
    ensureRumorState(this.state);
    this._listen('encounter:spawned', (p) => this._onEncounterSpawned(p));
    this._listen('entity:killed', (p) => this._onEntityKilled(p));
  },

  newGame() {
    if (this.state) this.state.pirateRumor = freshState();
  },

  update(dt, state) {
    if (!state || (state.mode && state.mode !== 'flight')) return;
    this.state = state;
    const own = ensureRumorState(state);
    for (const rec of Object.values(own.zones)) {
      if (!rec || !Number.isFinite(rec.heat) || rec.heat <= 0) continue;
      rec.heat = Math.max(0, rec.heat - PIRATE_RUMOR_DECAY_PER_S * Math.max(0, dt || 0));
    }
  },

  destroy() {
    for (const off of this._subs || []) {
      try { off(); } catch (err) { /* cleanup must not throw */ }
    }
    this._subs = [];
  },

  _listen(evt, fn) {
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const off = this.bus.on(evt, fn);
    if (typeof off === 'function') this._subs.push(off);
  },

  _onEncounterSpawned(payload) {
    if (!payload || !PIRATE_ENCOUNTER_KINDS.has(payload.kind)) return;
    const sectorId = payload.sectorId || currentSectorId(this.state);
    const zone = zoneById(sectorId, payload.zoneId);
    if (!sectorId || !zone) return;
    this._addHeat({
      sectorId,
      zone,
      amount: 1,
      source: 'encounter',
      detail: payload.kind,
      count: payload.count || 1,
    });
  },

  _onEntityKilled(payload) {
    if (!payload || !this.state) return;
    const entity = this.state.entities && this.state.entities.get(payload.id);
    if (!isCivilianTraffic(entity)) return;
    const sectorId = currentSectorId(this.state);
    const pos = payload.pos || entity.pos;
    if (!sectorId || !pos) return;
    const zone = zoneAt(sectorId, pos.x || 0, pos.z || 0);
    if (!zone) return;
    this._addHeat({
      sectorId,
      zone,
      amount: 1,
      source: 'civilian-loss',
      detail: entity.data && entity.data.trafficRole || 'civilian',
      count: 1,
    });
  },

  _addHeat({ sectorId, zone, amount, source, detail, count }) {
    const own = ensureRumorState(this.state);
    const key = rumorKey(sectorId, zone.id);
    const rec = own.zones[key] || (own.zones[key] = freshZoneRecord(sectorId, zone));
    const now = this.state && this.state.simTime || 0;
    rec.heat = Math.max(0, (rec.heat || 0) + Math.max(0, amount || 0));
    rec.eventCount = (rec.eventCount | 0) + 1;
    rec.lossCount = (rec.lossCount | 0) + Math.max(1, count | 0);
    rec.lastEventAt = now;
    rec.lastSource = source || null;
    rec.lastDetail = detail || null;
    rec.zoneName = zone.name || rec.zoneName || zone.id;
    rec.zoneType = zone.type || rec.zoneType || null;
    rec.sectorId = sectorId;
    rec.zoneId = zone.id;
    this._maybeSurface(key, rec, now);
  },

  _maybeSurface(key, rec, now) {
    const hottest = hottestRumor(this.state);
    if (!hottest || hottest.key !== key || hottest.heat < PIRATE_RUMOR_THRESHOLD) return;
    if (Number.isFinite(rec.lastHeadlineAt) && (now - rec.lastHeadlineAt) < PIRATE_RUMOR_COOLDOWN_S) return;
    const headline = headlineFor(rec, this.state);
    rec.lastHeadlineAt = now;
    rec.lastHeadline = headline;
    rec.headlineCount = (rec.headlineCount | 0) + 1;
    const payload = {
      headline,
      kind: 'piracy',
      sectorId: rec.sectorId,
      zoneId: rec.zoneId,
      zoneName: rec.zoneName,
      heat: round(rec.heat),
      source: rec.lastSource || null,
    };
    const card = {
      kind: 'piracy',
      title: 'Pirate rumor',
      body: headline,
      sectorId: rec.sectorId,
      zoneId: rec.zoneId,
      zoneName: rec.zoneName,
    };
    rememberCard(this.state, card);
    emit(this.bus, 'news:headline', payload);
    emit(this.bus, 'pirateRumor:headline', payload);
    emit(this.bus, 'pirateRumor:card', card);
  },
};

export function rumorKey(sectorId, zoneId) {
  return `${sectorId || 'unknown'}:${zoneId || 'unknown'}`;
}

export function rumorReadoutForZone(state, sectorId, zoneId) {
  const own = state && state.pirateRumor;
  const rec = own && own.zones && own.zones[rumorKey(sectorId, zoneId)];
  if (!rec) return null;
  return {
    sectorId: rec.sectorId,
    zoneId: rec.zoneId,
    zoneName: rec.zoneName,
    heat: round(rec.heat || 0),
    headline: rec.lastHeadline || headlineFor(rec, state),
    eventCount: rec.eventCount | 0,
    lossCount: rec.lossCount | 0,
  };
}

function freshState() {
  return { schemaVersion: SCHEMA_VERSION, zones: {} };
}

function ensureRumorState(state) {
  if (!state.pirateRumor || typeof state.pirateRumor !== 'object') state.pirateRumor = freshState();
  if (!state.pirateRumor.zones || typeof state.pirateRumor.zones !== 'object') state.pirateRumor.zones = {};
  state.pirateRumor.schemaVersion = SCHEMA_VERSION;
  return state.pirateRumor;
}

function freshZoneRecord(sectorId, zone) {
  return {
    sectorId,
    zoneId: zone.id,
    zoneName: zone.name || zone.id,
    zoneType: zone.type || null,
    heat: 0,
    eventCount: 0,
    lossCount: 0,
    lastEventAt: 0,
    lastHeadlineAt: null,
    lastHeadline: null,
  };
}

function zoneById(sectorId, zoneId) {
  if (!sectorId || !zoneId) return null;
  return zonesForSector(sectorId).find((zone) => zone.id === zoneId) || null;
}

function currentSectorId(state) {
  return state && state.world && state.world.currentSectorId || null;
}

function isCivilianTraffic(entity) {
  if (!entity || (entity.type !== 'ship' && entity.type !== 'drone')) return false;
  const data = entity.data || {};
  const role = data.trafficRole;
  if (CIVILIAN_TRAFFIC_ROLES.has(role)) return true;
  const ai = data.ai || {};
  const words = `${ai.archetype || ''} ${ai.doctrine || ''} ${ai.spawnContext || ''}`.toLowerCase();
  if (words.includes('pirate') || words.includes('raider') || words.includes('ambush')) return false;
  return entity.team === 2 && ai.passive === true;
}

function hottestRumor(state) {
  const own = state && state.pirateRumor;
  if (!own || !own.zones) return null;
  let best = null;
  for (const [key, rec] of Object.entries(own.zones)) {
    if (!best || (rec.heat || 0) > best.heat || ((rec.heat || 0) === best.heat && key < best.key)) {
      best = { key, rec, heat: rec.heat || 0 };
    }
  }
  return best;
}

function headlineFor(rec, state) {
  const seed = state && state.meta && state.meta.seed || 0;
  const key = rumorKey(rec.sectorId, rec.zoneId) + ':' + (rec.headlineCount | 0);
  const template = pickVariant(HEADLINES, seed, key) || HEADLINES[0];
  return template
    .replace('{count}', String(Math.max(rec.eventCount | 0, rec.lossCount | 0, 1)))
    .replace('{zone}', rec.zoneName || rec.zoneId || 'the lane');
}

function rememberCard(state, card) {
  if (!state.ui || typeof state.ui !== 'object') state.ui = {};
  if (!state.ui.pirateRumor || typeof state.ui.pirateRumor !== 'object') {
    state.ui.pirateRumor = { cards: [], lastCard: null };
  }
  const model = state.ui.pirateRumor;
  if (!Array.isArray(model.cards)) model.cards = [];
  model.lastCard = card;
  model.cards.unshift(card);
  if (model.cards.length > 6) model.cards.length = 6;
}

function emit(bus, evt, payload) {
  if (bus && typeof bus.emit === 'function') bus.emit(evt, payload);
}

function round(n) {
  return Number((Number(n) || 0).toFixed(3));
}

export default pirateRumor;
