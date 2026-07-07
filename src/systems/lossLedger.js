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
import { SECTORS } from '../data/sectors.js';
import { MISSION_TUNING } from '../data/missions.js';
import { wreckMissionById } from '../data/wreckMissions.js';
import { pickWreckClass, wreckClassById } from '../data/wreckClasses.js';
import { effectiveDangerTierFor, sectorSignalFor } from './sectorSim.js';

const MAX_PER_SECTOR = 8;           // ring-buffer cap — bounded growth (failureMode guard)
const MAX_TOTAL = 64;               // global backstop across all sectors (rare; trims oldest)
const GHOST_CONVOY_THRESHOLD = 3;
const GHOST_CONVOY_DRIVER = 'reach_pressure';
const GHOST_CONVOY_MISSION_ID = 'wm_reach_bounty';
const STATION_BY_SECTOR = new Map();
for (const sector of SECTORS) STATION_BY_SECTOR.set(sector.id, sector.stations || []);
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
  if (!L.ghostConvoy || typeof L.ghostConvoy !== 'object') L.ghostConvoy = { fired: {} };
  if (!L.ghostConvoy.fired || typeof L.ghostConvoy.fired !== 'object') L.ghostConvoy.fired = {};
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

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function laneKeyFor(entry) {
  return `${entry.sectorId}:${entry.factionId || 'unknown'}`;
}

function stationForSector(sectorId) {
  const stations = STATION_BY_SECTOR.get(sectorId) || [];
  return stations.find((s) => s.services && s.services.includes('missions')) || stations[0] || null;
}

function ghostConvoyLine(state, entry, count) {
  const sName = sectorName(state, entry.sectorId);
  return `Ghost convoy rumor: ${count} losses on the ${sName} lane point to a Reach raider nest.`;
}

function buildGhostConvoyOffer(state, entry, sameLane, signal) {
  const template = wreckMissionById(GHOST_CONVOY_MISSION_ID);
  const sectorId = entry.sectorId;
  const station = stationForSector(sectorId);
  const laneKey = laneKeyFor(entry);
  const dangerTier = clamp(
    Math.max(effectiveDangerTierFor(state, sectorId), Math.round(((signal && signal.danger) || 0) * 4)),
    2,
    4,
  );
  const distance = 600;
  const targetStrength = Number((1.3 + dangerTier * 0.5 + Math.min(4, sameLane.length) * 0.25).toFixed(2));
  const params = {
    clearCount: 1,
    killCount: 0,
    targetStrength,
    fValue: targetStrength,
    taskTime: 60,
    ghostConvoy: true,
  };
  const base = (MISSION_TUNING.BASE && MISSION_TUNING.BASE.bounty_hunt) || 200;
  const fRisk = (MISSION_TUNING.RISK_MULT && MISSION_TUNING.RISK_MULT[dangerTier]) || 1;
  const fDist = 1 + distance / (MISSION_TUNING.distDivisor || 2000);
  const reward_cr = Math.round(base * fDist * fRisk * params.fValue);
  const time_limit_s = Math.round((distance / (MISSION_TUNING.cruiseSpeedRef || 140) + params.taskTime) * (MISSION_TUNING.slackDefault || 2.2));
  const lossIds = sameLane.slice(0, GHOST_CONVOY_THRESHOLD).map((loss) => loss.lossId);

  return {
    id: `ghost_${hash32((state.meta && state.meta.seed) || 1, laneKey, 'ghostConvoy').toString(36)}`,
    source: 'ghostConvoyRumor',
    type: (template && template.type) || 'bounty_hunt',
    wreckMissionId: GHOST_CONVOY_MISSION_ID,
    stationId: station ? station.id : null,
    factionId: entry.factionId || (signal && signal.ownerId) || null,
    reward_cr,
    time_limit_s,
    collateral_cr: 0,
    riskTier: dangerTier,
    destStationId: station ? station.id : null,
    destSectorId: sectorId,
    distance,
    params,
    title: `Ghost convoy: Reach raider nest near ${sectorName(state, sectorId)}`,
    summary: `${sameLane.length} losses in this lane point to a repeat Reach ambush pattern. Clear the nest before the next convoy vanishes.`,
    giver: template ? template.giver : 'Lane rumor',
    log: template ? template.log : null,
    tag: template ? template.tag : 'wreck_salvage',
    budgetedEncounter: {
      spawnOnAccept: true,
      spawnBudgetClient: 'missions',
      noSpawnAtRumor: true,
    },
    rumor: {
      laneKey,
      sectorId,
      factionId: entry.factionId || null,
      driver: GHOST_CONVOY_DRIVER,
      lossCount: sameLane.length,
      lossIds,
    },
  };
}

function maybeEmitGhostConvoyRumor(state, bus, helpers, entry) {
  const L = ensureState(state);
  if (!L || !entry || !entry.sectorId) return null;
  const laneKey = laneKeyFor(entry);
  if (L.ghostConvoy.fired[laneKey]) return null;

  const signal = sectorSignalFor(state, entry.sectorId);
  if (!signal || !signal.driver || signal.driver.danger !== GHOST_CONVOY_DRIVER) return null;

  const sameLane = lossesFor(state, entry.sectorId)
    .filter((loss) => loss && (loss.factionId || 'unknown') === (entry.factionId || 'unknown'));
  if (sameLane.length < GHOST_CONVOY_THRESHOLD) return null;

  const offer = buildGhostConvoyOffer(state, entry, sameLane, signal);
  const line = ghostConvoyLine(state, entry, sameLane.length);
  const fired = {
    laneKey,
    sectorId: entry.sectorId,
    factionId: entry.factionId || null,
    lossCount: sameLane.length,
    firedAt: state.simTime || 0,
    offerId: offer.id,
  };
  L.ghostConvoy.fired[laneKey] = fired;

  const payload = {
    ...fired,
    driver: GHOST_CONVOY_DRIVER,
    line,
    offer,
  };
  if (bus && bus.emit) {
    bus.emit('rumor:ghostConvoy', payload);
    bus.emit('mission:offered', offer);
  }
  if (helpers && helpers.voice && typeof helpers.voice.say === 'function') {
    const said = helpers.voice.say({ channel: 'news', text: line, kind: 'ghostConvoy' });
    if (!said && bus && bus.emit) bus.emit('toast', { text: line, kind: 'info', ttl: 5 });
  } else if (bus && bus.emit) {
    bus.emit('toast', { text: line, kind: 'info', ttl: 5 });
  }
  return payload;
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
  maybeEmitGhostConvoyRumor(state, bus, helpers, entry);
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
    state.lossLedger = { bySector: {}, entries: [], seed, ghostConvoy: { fired: {} } };
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
    if (!L) return { bySector: {}, entries: [], seed: 1, ghostConvoy: { fired: {} } };
    // Entries only — bySector is derivable from entries (rebuilt on deserialize).
    return {
      entries: L.entries.slice(-MAX_TOTAL),
      seed: L.seed,
      ghostConvoy: { fired: { ...(L.ghostConvoy && L.ghostConvoy.fired || {}) } },
    };
  },

  deserialize(data) {
    const state = this._state;
    if (!state) return;
    const L = ensureState(state);
    const entries = (data && Array.isArray(data.entries)) ? data.entries : [];
    L.entries = entries.slice(-MAX_TOTAL);
    L.seed = (data && typeof data.seed === 'number') ? (data.seed >>> 0) : ((state.meta && state.meta.seed) || 1);
    L.ghostConvoy = {
      fired: {
        ...(data && data.ghostConvoy && data.ghostConvoy.fired || {}),
      },
    };
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
