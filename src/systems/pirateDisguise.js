// BP-13/B7 Fake-Civilian-Until-Scan.
//
// Listens to the existing scanner pulse event and reveals disguised pirate traffic. Scanner/HUD
// remain unchanged; after reveal, their existing contact readers see ordinary hostile AI fields.
//
// PQ-151.02 — the same system owns the corrupt-port papers wash. Docking at an outlaw berth
// with a hot pod in range is the verb: they stamp the pod clean and take a cut. Reputation
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
import { isJettisonedCargoPod } from './lootShards.js';

export const pirateDisguise = {
  name: 'pirateDisguise',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || {};
    this._onScanPulse = (p) => this._scan(p);
    this._onDocked = (p) => this.launderAtDock(p);
    this._onLaunderIntent = (p) => this.launderAtDock(p);
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('scan:pulse', this._onScanPulse);
      this.bus.on('dock:docked', this._onDocked);
      this.bus.on('dock:launder', this._onLaunderIntent);
    }
  },

  _scan(payload) {
    const state = this.state;
    const pos = payload && payload.pos;
    if (!state || !pos) return;
    const list = Array.isArray(state.entityList) ? state.entityList : [];
    for (const entity of list) {
      if (!shouldRevealOnScan(entity, pos)) continue;
      const reveal = revealPirateDisguise(entity, state, { by: 'scan' });
      if (!reveal) continue;
      this._speak(entity, reveal);
      this._emit('pirateDisguise:revealed', reveal);
    }
  },

  /**
   * Dock verb at a corrupt port: wash nearby hot pods for a cut.
   * Not a WANTED buy-out — papers only. Returns the receipt or null.
   */
  launderAtDock(payload) {
    const state = this.state;
    if (!state || !payload) return null;
    const stationId = payload.stationId
      || (payload.station && payload.station.id)
      || null;
    const station = (payload.station && typeof payload.station === 'object')
      ? payload.station
      : (stationRecordById(stationId) || {
        id: stationId,
        type: payload.stationType,
        services: payload.services,
        factionId: payload.factionId,
      });
    const stationKey = station.id || stationId;
    if (!canLaunderSalvageAtStation(station) && !canLaunderSalvageAtStation(stationKey)) {
      return null;
    }

    const player = state.player;
    if (!player) return null;
    const origin = launderOrigin(state);
    if (!origin) return null;

    const pods = nearbyHotPods(state, origin, LAUNDER_DOCK_RANGE);
    if (pods.length === 0) return null;

    const factionId = station.factionId || 'faction_quiet';
    const rec = state.factions && state.factions[factionId];
    const reputation = rec && Number.isFinite(rec.rep) ? rec.rep : 0;

    let cut = 0;
    for (let i = 0; i < pods.length; i++) {
      const data = pods[i].data;
      cut += launderCutCredits(data.commodityId, data.amount, reputation);
    }
    const credits = Math.max(0, Math.floor(Number(player.credits) || 0));
    if (cut > 0 && credits < cut) {
      const denial = {
        accepted: false,
        reason: 'short',
        source: 'pirateDisguise',
        stationId: stationKey,
        factionId,
        cut,
        credits,
        reputation,
      };
      this._emit('cargo:laundered', denial);
      return denial;
    }

    const stamped = [];
    for (let i = 0; i < pods.length; i++) {
      const pod = pods[i];
      const result = applyLaunderStamp(pod.data, stationKey || station);
      if (result) stamped.push({ podId: pod.id, ...result });
    }
    if (stamped.length === 0) return null;

    if (cut > 0) {
      this._emit('economy:chargeCredits', { amount: cut, reason: 'launder:cut' });
    }

    const entry = recordLaunderLedger(state, {
      stationId: stationKey,
      factionId,
      cut,
      cutFrac: launderCutFrac(reputation),
      reputation,
      pods: stamped,
    });
    const receipt = {
      accepted: true,
      source: 'pirateDisguise',
      stationId: entry.stationId,
      factionId,
      cut,
      cutFrac: entry.cutFrac,
      reputation,
      podIds: stamped.map((row) => row.podId),
      pods: stamped,
      receiptId: entry.receiptId,
      seenAt: entry.seenAt,
    };
    this._emit('cargo:laundered', receipt);
    this._emit('toast', {
      text: `Papers washed — cut ${cut} cr`,
      kind: 'pirateDisguise',
      ttl: 2,
    });
    return receipt;
  },

  _speak(entity, reveal) {
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({
        channel: 'bark',
        text: reveal.text,
        kind: 'pirateDisguise',
        ttl: 1,
        id: `pirateDisguise:${entity.id}`,
        factionId: entity.factionId,
      });
    } else {
      this._emit('toast', { text: reveal.text, kind: 'pirateDisguise', ttl: 1 });
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
    }
    this._onScanPulse = null;
    this._onDocked = null;
    this._onLaunderIntent = null;
  },
};

function launderOrigin(state) {
  const entity = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  if (entity && entity.pos) return entity.pos;
  return null;
}

function nearbyHotPods(state, origin, range) {
  const list = Array.isArray(state.entityList) ? state.entityList : [];
  const reach = Number(range);
  const reach2 = reach * reach;
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const entity = list[i];
    if (!isJettisonedCargoPod(entity) || !entity.pos || !entity.data) continue;
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
  const seq = ledger.length + 1;
  const entry = {
    receiptId: `launder:${seed.toString(36)}:${seq.toString(36)}`,
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
