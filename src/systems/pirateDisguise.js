// BP-13/B7 Fake-Civilian-Until-Scan.
//
// Listens to the existing scanner pulse event and reveals disguised pirate traffic. Scanner/HUD
// remain unchanged; after reveal, their existing contact readers see ordinary hostile AI fields.
//
// PQ-151.02 — the same system owns the corrupt-port papers wash. Explicit per-pod confirmation at an outlaw berth
// stamps only the chosen nearby pod and takes the reviewed cut. Reputation
// with the port's faction pays the cut down. Credits still move through economy:chargeCredits.
// Heat is not bought off here — WANTED still escapes by leaving the zone or breaking a net.
import { revealPirateDisguise, shouldRevealOnScan } from '../data/pirateDisguise.js';
import {
  applyLaunderStamp,
  canLaunderSalvageAtStation,
  isHotLaunderCargo,
  LAUNDER_DOCK_RANGE,
  LAUNDER_LEDGER_MAX,
  launderCutCredits,
  launderCutFrac,
  stationRecordById,
} from '../data/salvageLegality.js';
import { cargoIdentityOf } from '../data/cargoIdentity.js';
import { occupantGenerationOf } from '../core/entity.js';
import { isJettisonedCargoPod } from './lootShards.js';
import { hasTethysBlackMarketAccess, TETHYS_BLACK_MARKET_RUN } from '../data/frontierRumors.js';
import { indexedShipLikeScan, indexedTypeScan } from '../world/livingWorldViews.js';

let nextLaunderQuote = 0; // Runtime-only tokens never rewind with a saved game.

export const pirateDisguise = {
  name: 'pirateDisguise',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._onScanPulse = (p) => this._scan(p);
    this._launderQuotes = new Map();
    this._launderContext = null;
    this._onDocked = () => this._invalidateLaunderQuotes();
    this._launderResetEvents = ['dock:undocked', 'sector:exit', 'sector:enter', 'game:new', 'game:newGame', 'game:load', 'save:restoring', 'save:loaded'];
    this._onLaunderIntent = (p) => this.launderAtDock(p);
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('scan:pulse', this._onScanPulse);
      this.bus.on('dock:docked', this._onDocked);
      this.bus.on('dock:launder', this._onLaunderIntent);
      for (const event of this._launderResetEvents) this.bus.on(event, this._onDocked);
    }
  },

  _scan(payload) {
    const state = this.state;
    const pos = payload && payload.pos;
    if (!state || !pos) return;
    const list = indexedShipLikeScan(state);
    for (const entity of list) {
      if (!shouldRevealOnScan(entity, pos)) continue;
      const reveal = revealPirateDisguise(entity, state, { by: 'scan' });
      if (!reveal) continue;
      this._speak(entity, reveal);
      this._emit('pirateDisguise:revealed', reveal);
    }
  },

  /** Papers are an explicit, per-pod service. Dock/open/quote never charges. */
  _invalidateLaunderQuotes() {
    this._launderQuotes?.clear();
    this._launderContext = null;
  },

  _launderBerth(stationId) {
    const state = this.state;
    const player = state?.entities?.get(state.playerId);
    const station = stationRecordById(stationId);
    if (!player?.alive || state.mode !== 'flight' || state.ui?.docked !== true
        || state.ui.dockedStationId !== stationId) return { reason: 'not_docked' };
    if (!station || !canLaunderSalvageAtStation(station)) return { reason: 'unavailable' };
    if (stationId === TETHYS_BLACK_MARKET_RUN.stationId && !hasTethysBlackMarketAccess(state)) {
      return { reason: 'black_market_locked' };
    }
    const berth = (state.entityIndex?.stations || state.entityList || []).find(e =>
      e?.alive && e.type === 'station' && e.data?.stationId === stationId
      && state.entities.get(e.id) === e);
    if (!berth || occupantGenerationOf(berth) == null || occupantGenerationOf(player) == null) return { reason: 'station_changed' };
    return { player, station, berth };
  },

  launderAtDock(payload = {}) {
    const state = this.state;
    const { action, contextId, requestId, stationId } = payload;
    if (action === 'close') {
      if (contextId === this._launderContext) this._invalidateLaunderQuotes();
      return null;
    }
    if (action !== 'quote' && action !== 'confirm') return null;
    const reply = { stationId, contextId, requestId };
    const fail = reason => {
      const denial = { ...reply, accepted: false, reason, source: 'pirateDisguise' };
      this._emit(action === 'quote' ? 'cargo:launderQuoted' : 'cargo:laundered', denial);
      return denial;
    };
    if (typeof contextId !== 'string' || !contextId || contextId.length > 120
        || typeof requestId !== 'string' || !requestId || requestId.length > 120) return fail('invalid_request');
    const current = this._launderBerth(stationId);
    if (current.reason) { this._invalidateLaunderQuotes(); return fail(current.reason); }
    const { player, station, berth } = current;
    const factionId = station.factionId || 'faction_quiet';
    const reputation = Number.isFinite(state.factions?.[factionId]?.rep) ? state.factions[factionId].rep : 0;
    const cutFrac = launderCutFrac(reputation);
    if (action === 'quote') {
      this._invalidateLaunderQuotes();
      this._launderContext = contextId;
      const quotes = [];
      const nearby = nearbyHotPods(state, player.pos, LAUNDER_DOCK_RANGE).sort((a,b) => Math.hypot(a.pos.x-player.pos.x,a.pos.z-player.pos.z)-Math.hypot(b.pos.x-player.pos.x,b.pos.z-player.pos.z));
      for (const pod of nearby.slice(0, 32)) {
        if (state.entities.get(pod.id) !== pod || occupantGenerationOf(pod) == null) continue;
        const cut = launderCutCredits(pod.data.commodityId, pod.data.amount, reputation);
        const quoteId = `papers:${++nextLaunderQuote}`;
        this._launderQuotes.set(quoteId, {
          player, playerGeneration: occupantGenerationOf(player),
          pod, podGeneration: occupantGenerationOf(pod), berth, berthGeneration: occupantGenerationOf(berth),
          sectorId: state.world?.currentSectorId, enterSerial: state.world?.enterSerial,
          stationId, contextId, fingerprint: launderFingerprint(pod), cut, cutFrac, reputation,
        });
        const identity = cargoIdentityOf(pod);
        quotes.push({ quoteId, podId: pod.id, commodityId: pod.data.commodityId,
          amount: pod.data.amount, ownerId: pod.data.ownerId ?? null,
          ownerName: identity?.ownerName ?? null,
          label: pod.data.cargoIdentity?.label || pod.data.label || pod.name || null,
          factionId: pod.data.factionId || pod.data.cargoIdentity?.factionId || null,
          distance: Math.round(Math.hypot(pod.pos.x-player.pos.x,pod.pos.z-player.pos.z)), cut, cutFrac,
          affordable: Number(state.player.credits) >= cut });
      }
      const result = { ...reply, accepted: true, quotes, truncated: nearby.length > quotes.length, range: LAUNDER_DOCK_RANGE };
      this._emit('cargo:launderQuoted', result);
      return result;
    }
    const quote = this._launderQuotes.get(payload.quoteId);
    // Consume before validation/dispatch. No denial or repeated event can charge this quote later.
    this._launderQuotes.delete(payload.quoteId);
    if (!quote || quote.contextId !== contextId || this._launderContext !== contextId) return fail('stale_quote');
    const pod = quote.pod;
    if (quote.stationId !== stationId || quote.player !== player || quote.berth !== berth
        || quote.playerGeneration !== occupantGenerationOf(player) || quote.berthGeneration !== occupantGenerationOf(berth)
        || state.entities.get(pod.id) !== pod || quote.podGeneration !== occupantGenerationOf(pod)
        || quote.sectorId !== state.world?.currentSectorId || quote.enterSerial !== state.world?.enterSerial
        || !isJettisonedCargoPod(pod) || pod.data.laundered
        || !isHotLaunderCargo(pod.data.commodityId, pod.data.legality)
        || launderFingerprint(pod) !== quote.fingerprint) return fail('cargo_changed');
    if (!finiteLaunderPoint(player.pos) || !finiteLaunderPoint(pod.pos)
        || Math.hypot(pod.pos.x-player.pos.x, pod.pos.z-player.pos.z) > LAUNDER_DOCK_RANGE) return fail('out_of_range');
    const cut = launderCutCredits(pod.data.commodityId, pod.data.amount, reputation);
    if (cut !== quote.cut || cutFrac !== quote.cutFrac || reputation !== quote.reputation) return fail('price_changed');
    const credits = Math.max(0, Math.floor(Number(state.player.credits) || 0));
    if (credits < cut) return fail('short');
    let stamped, entry;
    const payment = { amount: cut, reason: 'launder:cut', requireFull: true, expectedCredits: credits, result: false,
      commit: () => {
        stamped = [{ podId: pod.id, ...applyLaunderStamp(pod.data, stationId) }];
        entry = recordLaunderLedger(state, { stationId, factionId, cut, cutFrac, reputation, pods: stamped });
        return true;
      },
    };
    this._emit('economy:chargeCredits', payment);
    if (payment.result !== true) return fail('payment_unavailable');
    const receipt = { ...reply, accepted: true, source: 'pirateDisguise', stationId,
      factionId, cut, cutFrac, reputation, podIds: [pod.id], pods: stamped,
      receiptId: entry.receiptId, seenAt: entry.seenAt };
    this._emit('cargo:laundered', receipt);
    this._emit('toast', { text: `Papers washed — cut ${cut} cr`, kind: 'pirateDisguise', ttl: 2 });
    return receipt;
  },

  _speak(entity, reveal) {
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({
        channel: 'bark',
        text: reveal.text,
        kind: 'pirateDisguise',
        // ttl is the queue stale-drop deadline as well as the floor hold — 1 s expired under
        // the 1.5 s bark gap, so the reveal never spoke when it mattered (a fight just ended).
        ttl: 3,
        id: `pirateDisguise:${entity.id}`,
        factionId: entity.factionId,
      });
    } else {
      this._emit('toast', { text: reveal.text, kind: 'pirateDisguise', ttl: 3 });
    }
    this._emit('pirateDisguise:voice', {
      entityId: entity.id,
      situation: reveal.situation,
      text: reveal.text,
      factionId: entity.factionId,
    });
  },

  _emit(evt, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(evt, payload);
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onScanPulse) this.bus.off('scan:pulse', this._onScanPulse);
      if (this._onDocked) this.bus.off('dock:docked', this._onDocked);
      if (this._onLaunderIntent) this.bus.off('dock:launder', this._onLaunderIntent);
      for (const event of this._launderResetEvents || []) this.bus.off(event, this._onDocked);
    }
    this._invalidateLaunderQuotes();
    this._onScanPulse = null;
    this._onDocked = null;
    this._onLaunderIntent = null;
  },
};

function finiteLaunderPoint(pos) {
  return !!pos && Number.isFinite(pos.x) && Number.isFinite(pos.z);
}

function launderFingerprint(pod) {
  const data = pod.data;
  return JSON.stringify([cargoIdentityOf(pod), pod.name, data.commodityId, data.amount, data.legality, data.laundered,
    data.ownerId, data.ownerName, data.label, data.factionId, data.ownership, data.cargoIdentity, data.salvagePool]);
}

function nearbyHotPods(state, origin, range) {
  if (!finiteLaunderPoint(origin)) return [];
  const list = indexedTypeScan(state, 'payloads');
  const reach = Number(range);
  const reach2 = reach * reach;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!isJettisonedCargoPod(entity) || !finiteLaunderPoint(entity.pos) || !entity.data
        || !Number.isSafeInteger(entity.data.amount) || entity.data.amount <= 0) continue;
    if (entity.data.laundered) continue;
    if (!isHotLaunderCargo(entity.data.commodityId, entity.data.legality)) continue;
    const dx = (entity.pos.x || 0) - (origin.x || 0);
    const dz = (entity.pos.z || 0) - (origin.z || 0);
    if (dx * dx + dz * dz > reach2) continue;
    out.push(entity);
  }
  return out;
}

function recordLaunderLedger(state, spec) {
  const player = state.player;
  if (!Array.isArray(player.launderLedger)) player.launderLedger = [];
  const ledger = player.launderLedger;
  const seed = (Number(state.meta && state.meta.seed) >>> 0) || 1;
  // The ledger truncates to a fixed cap, so its length is not a sequence — carry the max seq forward.
  let seq = 0;
  for (let i = 0; i < ledger.length; i++) seq = Math.max(seq, Number(ledger[i] && ledger[i].seq) || 0);
  seq += 1;
  const entry = {
    receiptId: `launder:${seed.toString(36)}:${seq.toString(36)}`,
    seq,
    stationId: spec.stationId || null,
    factionId: spec.factionId || null,
    side: 'launder',
    cut: Math.max(0, Math.round(Number(spec.cut) || 0)),
    cutFrac: Number(spec.cutFrac) || 0,
    reputation: Number(spec.reputation) || 0,
    pods: spec.pods || [],
    seenAt: Math.max(0, Number(state.simTime) || 0),
  };
  ledger.unshift(entry);
  if (ledger.length > LAUNDER_LEDGER_MAX) ledger.length = LAUNDER_LEDGER_MAX;
  return entry;
}

export default pirateDisguise;
