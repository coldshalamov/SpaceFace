// lossLedger.js — BP-01.1 packet WRECK_PROVENANCE ("Who Died Here") — SYSTEM.
//
// An event-sourced loss recorder. The offscreen sector sim (sectorSim → automation.offscreenRiskPass)
// and the live automation tick ALREADY emit loss events when a trader/outpost/convoy is lost. This
// system LISTENS to those events and records structured provenance entries a player can later read
// at a wreck ("this is the MTS hauler the sim lost to Reach raiders three days ago") and a station
// hears as a one-line news headline.
//
// CRITICAL DISCIPLINE (enforced structurally):
//   • EVENT-SOURCED — never rolls its own losses. Subscribes ONLY to `automation:assetLost`
//     { kind, id, value, sectorId } and `automation:outpostRaided` { outpostId, sectorId, lossVol }.
//     If those events never fire (the 47-A golden slice), the ledger stays empty ⇒ no leak.
//   • SEEDED lossId — `hash32(seed, sectorId, kind, simTime, assetId)`. The SAME loss ⇒ the SAME id
//     on every load. The wreck-class assignment keys off (lossId, sectorId) so the ledger and the
//     wreck read IDENTICAL provenance (failureMode "provenance drift" — both key off lossId + sectorId).
//   • RING BUFFER per sector — capped at MAX_PER_SECTOR. Unbounded growth is a failureMode.
//   • ADDITIVE wreck tagging — on `entity:spawned` for a wreck in a sector with a recorded loss,
//     sets `data.provenance` + `data.wreckClass` + enriches `data.scanLabel` to the class label.
//     NEVER overwrites a communicator's mission-bearing scanLabel (communicators carry wreckMissions;
//     their label is the mission hook, not the class). Only enriches debris-class wrecks.
//   • SINGLE-WRITER honored — emits intents (`lossLedger:recorded`) and a voice headline only.
//     NEVER writes credits, cargo, rep, or the entity store (entity:spawned is read-only; the wreck's
//     `data` is enriched in place as additive metadata the producers already permit — they set
//     `data.scanLabel` themselves, so this is a read-then-enrich on the same field, not a second writer).
//   • ONE-VOICE — the loss headline goes through `ctx.helpers.voice.say({ channel:'news' })` exactly
//     once per recorded loss, with a `toast` fallback if the arbiter declines.
//
// noTouch honored: sectorSim.js / automation.js / salvage.js / marketNews.js / economy.js are NOT
// edited. This system reads `state.world.sectors[id].owner` (factions owns it — read-only, §0.6) for
// faction attribution and listens to the events those systems already emit.
//
// reuses (per spec): automation.offscreenRiskPass + automation:outpostRaided/trader-loss events,
// sectorSim offscreen losses, salvage.js wreck placement (entity:spawned hook), marketNews's news
// channel (via voiceArbiter — marketNews.js has no inbound custom-headline event; the 'news' voice
// channel IS the station-news channel per voiceArbiter CHANNEL_PRIORITY).
//
// budget: spawn:none (salvage.js keeps its ≤2/zone cap) · voice:news channel (one line per loss)
//         · draw:none
// rng: seeded — the ledger itself is event-sourced (no roll); lossId + wreckClass are hash32-derived.
//
// ACCEPTANCE (spec): after the field rolls a loss in sector S, `lossesFor(S)` returns the structured
// entry AND a station-news headline ("A Drift hauler went dark near {sector}") appears via the news
// channel; when the player enters S, a salvage wreck carries a scanLabel/log referencing that loss.
// No recorded loss ⇒ generic wreck (unchanged).

import { hash32 } from '../core/rng.js';
import { pickWreckClass, wreckClassById } from '../data/wreckClasses.js';

const MAX_PER_SECTOR = 8;           // ring-buffer cap — bounded growth (failureMode guard)
const MAX_TOTAL = 64;               // global backstop across all sectors (rare; trims oldest)
const KIND_NORMALIZE = {
  trader: 'trader',
  drone: 'drone',
  fleet: 'fleet',
  outpost: 'outpost',               // from automation:outpostRaided (synthesized kind)
};
// Cargo-hint lean per loss kind — flavor only, never the real pool (salvage.js owns the pool).
const CARGO_HINT = {
  trader: 'manifest cargo',
  drone: 'ore buffer',
  fleet: 'fleet stores',
  outpost: 'outpost goods',
};

function dayOf(state) {
  // 1 in-game day = DAY_SECONDS sim seconds (matches coreSystem.js:8 / sectorSim cadence).
  const DAY_SECONDS = 600;
  const t = (state && typeof state.simTime === 'number') ? state.simTime : 0;
  return Math.floor(t / DAY_SECONDS);
}

function sectorName(state, sectorId) {
  const sec = sectorId && state && state.world && state.world.sectors && state.world.sectors[sectorId];
  if (sec && sec.name) return sec.name;
  return sectorId || 'unknown space';
}

function ownerOf(state, sectorId) {
  const sec = sectorId && state && state.world && state.world.sectors && state.world.sectors[sectorId];
  return (sec && sec.owner) || null;
}

/** Ensure the state slice exists (additive — does not touch createGameState defaults). */
export function ensureState(state) {
  if (!state) return null;
  if (!state.lossLedger) state.lossLedger = { bySector: {}, entries: [], seed: 0 };
  const L = state.lossLedger;
  if (!L.bySector || typeof L.bySector !== 'object') L.bySector = {};
  if (!Array.isArray(L.entries)) L.entries = [];
  if (typeof L.seed !== 'number') L.seed = (state.meta && state.meta.seed) || 1;
  return L;
}

/** Public read: all recorded losses for a sector (newest first). Pure, deterministic. */
export function lossesFor(state, sectorId) {
  const L = ensureState(state);
  if (!L || !sectorId) return [];
  const arr = L.bySector[sectorId];
  return arr ? arr.slice() : [];
}

/** Public read: the most recent recorded loss for a sector, or null. */
export function latestLossFor(state, sectorId) {
  const arr = lossesFor(state, sectorId);
  return arr.length ? arr[0] : null;
}

/** Public read: a one-line prose headline for the most recent loss in a sector. Pure. */
export function latestLossLine(state, sectorId) {
  const e = latestLossFor(state, sectorId);
  if (!e) return null;
  return lossLine(e, sectorName(state, sectorId));
}

function lossLine(e, sName) {
  const factionWord = e.factionId === 'faction_concord' ? 'Concord'
    : e.factionId === 'faction_reach' ? 'Reach'
    : e.factionId === 'faction_drift' ? 'Drift'
    : e.factionId === 'faction_quiet' ? 'the Quiet'
    : 'a';
  const noun = e.kind === 'outpost' ? 'outpost'
    : e.kind === 'fleet' ? 'fleet vessel'
    : e.kind === 'drone' ? 'mining drone'
    : 'hauler';
  const verb = e.kind === 'outpost' ? 'was raided' : 'went dark';
  return `A ${factionWord} ${noun} ${verb} near ${sName}.`;
}

function makeLossId(seed, sectorId, kind, simTime, assetId) {
  return 'loss_' + hash32(seed, sectorId, kind, simTime, assetId).toString(36);
}

function record(state, bus, helpers, entry) {
  const L = ensureState(state);
  if (!L) return null;
  // Dedupe by lossId (the same loss event firing twice — e.g. a replay — must not double-record).
  if (L.entries.some((x) => x.lossId === entry.lossId)) return entry;
  // Per-sector ring buffer (newest first).
  const arr = L.bySector[entry.sectorId] || (L.bySector[entry.sectorId] = []);
  arr.unshift(entry);
  if (arr.length > MAX_PER_SECTOR) arr.length = MAX_PER_SECTOR;
  // Global backstop.
  L.entries.unshift(entry);
  if (L.entries.length > MAX_TOTAL) L.entries.length = MAX_TOTAL;
  // Emit the sanctioned intent (consumers: GHOST_CONVOY_RUMOR threshold, CONVOY_LOSS_INVESTIGATION).
  if (bus && bus.emit) bus.emit('lossLedger:recorded', { ...entry });
  // One-voice news headline (marketNews.js has no inbound custom-headline event; the 'news' voice
  // channel IS the station-news channel per voiceArbiter CHANNEL_PRIORITY). Fire once per loss.
  const line = lossLine(entry, sectorName(state, entry.sectorId));
  if (helpers && helpers.voice && typeof helpers.voice.say === 'function') {
    const said = helpers.voice.say({ channel: 'news', text: line, kind: 'lossLedger' });
    if (!said && bus && bus.emit) bus.emit('toast', { text: line, kind: 'warn', ttl: 4 });
  } else if (bus && bus.emit) {
    bus.emit('toast', { text: line, kind: 'warn', ttl: 4 });
  }
  return entry;
}

export const lossLedger = {
  name: 'lossLedger',

  init(ctx) {
    this._state = ctx && ctx.state;
    this._bus = ctx && ctx.bus;
    this._helpers = ctx && ctx.helpers;
    this._registry = ctx && ctx.registry;
    ensureState(this._state);

    this._onAssetLost = (p) => this._handleAssetLost(p);
    this._onOutpostRaided = (p) => this._handleOutpostRaided(p);
    this._onEntitySpawned = (p) => this._tagWreck(p);
    this._onNewGame = () => this._reset();

    if (this._bus && this._bus.on) {
      this._bus.on('automation:assetLost', this._onAssetLost);
      this._bus.on('automation:outpostRaided', this._onOutpostRaided);
      this._bus.on('entity:spawned', this._onEntitySpawned);
      this._bus.on('game:newGame', this._onNewGame);
    }
  },

  newGame() { this._reset(); },

  _reset() {
    const state = this._state;
    if (!state) return;
    const seed = (state.meta && state.meta.seed) || 1;
    state.lossLedger = { bySector: {}, entries: [], seed };
  },

  _handleAssetLost(p) {
    const state = this._state;
    if (!state || !p || !p.sectorId) return; // no sector ⇒ can't attribute (matches automation's null-sectorId path)
    const L = ensureState(state);
    const kind = KIND_NORMALIZE[p.kind] || 'trader';
    const entry = {
      lossId: makeLossId(L.seed, p.sectorId, kind, state.simTime || 0, p.id || ''),
      sectorId: p.sectorId,
      assetId: p.id || null,
      factionId: ownerOf(state, p.sectorId),
      kind,
      simDay: dayOf(state),
      t: state.simTime || 0,
      cargoHint: CARGO_HINT[kind] || 'cargo',
      value: p.value || 0,
      source: 'automation:assetLost',
    };
    record(state, this._bus, this._helpers, entry);
  },

  _handleOutpostRaided(p) {
    const state = this._state;
    if (!state || !p || !p.sectorId) return;
    const L = ensureState(state);
    const kind = 'outpost';
    const entry = {
      lossId: makeLossId(L.seed, p.sectorId, kind, state.simTime || 0, p.outpostId || ''),
      sectorId: p.sectorId,
      assetId: p.outpostId || null,
      factionId: ownerOf(state, p.sectorId),
      kind,
      simDay: dayOf(state),
      t: state.simTime || 0,
      cargoHint: CARGO_HINT[kind] || 'goods',
      value: p.lossVol || 0,
      source: 'automation:outpostRaided',
    };
    record(state, this._bus, this._helpers, entry);
  },

  // Additive wreck tagging — the seam that makes a wreck read its provenance. Reads entity:spawned
  // (coreSystem.js:29 emits { id, type, entity }), so salvage.js / intervention.js are NOT edited.
  // A wreck in a sector with a recorded loss gets data.provenance + data.wreckClass + an enriched
  // scanLabel. Communicators keep their mission label (their scanLabel is the mission hook).
  _tagWreck(p) {
    const state = this._state;
    if (!state || !p || p.type !== 'wreck') return;
    const e = p.entity;
    if (!e || !e.data) return;
    // Find the sector this wreck is in. Wrecks carry data.sectorId when set by salvage points;
    // fall back to the player's current sector (wrecks spawn in the active sector).
    const sectorId = e.data.sectorId || (state.world && state.world.currentSectorId);
    if (!sectorId) return;
    const loss = latestLossFor(state, sectorId);
    if (!loss) return; // no recorded loss ⇒ generic wreck (unchanged) — golden-sim safe
    // Don't clobber a communicator's mission-bearing label — only enrich non-communicator wrecks.
    const isComms = e.data.isCommunicator || e.data.parentType === 'communicator';
    const classId = pickWreckClass({ seed: ensureState(state).seed, lossId: loss.lossId, sectorId });
    const cls = wreckClassById(classId) || wreckClassById('debris');
    // Additive metadata (these fields are new; producers don't read them, so no behavior change).
    e.data.provenance = {
      lossId: loss.lossId,
      kind: loss.kind,
      factionId: loss.factionId,
      simDay: loss.simDay,
      cargoHint: loss.cargoHint,
    };
    e.data.wreckClass = classId;
    if (!isComms) {
      e.data.scanLabel = cls.scanLabel;
      e.data.wreckClassLabel = cls.label;
      e.data.wreckClassBlurb = cls.blurb;
    } else {
      // Communicator: keep the mission label, but record the class for the mission log to read.
      e.data.wreckClassLabel = cls.label;
    }
  },

  destroy() {
    if (this._bus && this._bus.off) {
      if (this._onAssetLost) this._bus.off('automation:assetLost', this._onAssetLost);
      if (this._onOutpostRaided) this._bus.off('automation:outpostRaided', this._onOutpostRaided);
      if (this._onEntitySpawned) this._bus.off('entity:spawned', this._onEntitySpawned);
      if (this._onNewGame) this._bus.off('game:newGame', this._onNewGame);
    }
    this._onAssetLost = null;
    this._onOutpostRaided = null;
    this._onEntitySpawned = null;
    this._onNewGame = null;
  },

  // Serialization — durable subset only (the recorded entries + seed). Round-trips through save.
  serialize() {
    const L = ensureState(this._state);
    if (!L) return { bySector: {}, entries: [], seed: 1 };
    // Entries only — bySector is derivable from entries (rebuilt on deserialize).
    return { entries: L.entries.slice(-MAX_TOTAL), seed: L.seed };
  },

  deserialize(data) {
    const state = this._state;
    if (!state) return;
    const L = ensureState(state);
    const entries = (data && Array.isArray(data.entries)) ? data.entries : [];
    L.entries = entries.slice(-MAX_TOTAL);
    L.seed = (data && typeof data.seed === 'number') ? (data.seed >>> 0) : ((state.meta && state.meta.seed) || 1);
    L.bySector = {};
    for (const e of L.entries) {
      if (!e || !e.sectorId) continue;
      const arr = L.bySector[e.sectorId] || (L.bySector[e.sectorId] = []);
      arr.push(e);
    }
    // newest-first within each sector (entries are already newest-first from serialize).
  },
};

export default lossLedger;
