// Thunderchild cross-faction title authority (Depth Program S4).
//
// This system owns only state.story.titles and state.story.titlesSeen. It observes canonical combat
// events to produce deterministic title:holdResolved receipts, reduces those receipts, and exposes
// semantic events plus a small live-entity presentation stamp for morale/decal/news/Ledger readers.

import {
  AURA_TITLES,
  authoredTitleId,
  COUNTER_TITLES,
  isPlayerTitleHolder,
  QUIET_CLEAR_TITLE_ID,
  THUNDERCHILD,
  THUNDERCHILD_TITLE_ID,
  TITLE_ACTIVE_HOLD_LIMIT,
  TITLE_CANDIDATE_LIMIT,
  TITLE_DEFS_BY_ID,
  TITLE_HISTORY_LIMIT,
  TITLE_PROCESSED_RECEIPT_LIMIT,
  TITLES_SCHEMA_VERSION,
  TITLES_SEEN_LIMIT,
} from '../data/titles.js';
import { activeOwnedShip, hullNameForOwnedShip } from '../data/hullIdentity.js';
import { isHostileForAI } from '../ai/engagementAuthority.js';
import { KNOWN_TRICK_IDS } from '../combat/stuntTaxonomy.js';
import { journalFor } from '../combat/stuntEvidence.js';
import { adventureStunts, boundStuntNarrative, completeWitness, deliverWitnessReports, incidentIdentity, observeStuntWitnesses, qualifyStuntTitles, sampledStuntWitnesses, sendWitnessReports } from '../combat/stuntWitnesses.js';
import { indexedShipLikeScan } from '../world/livingWorldViews.js';

function finiteInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function cleanText(value, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

function humanizeId(value, fallback = 'Stunt') {
  const str = typeof value === 'string' ? value.trim() : '';
  if (!str) return fallback;
  return str
    .replace(/^title_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function cloneHolder(holder) {
  if (!holder || typeof holder !== 'object') return null;
  return {
    shipDefId: cleanText(holder.shipDefId, 'ship_unknown'),
    factionId: cleanText(holder.factionId, 'faction_unknown'),
    displayName: cleanText(holder.displayName, 'Unnamed hull'),
  };
}

function freshThunderchildState() {
  return {
    status: 'vacant',
    holderKey: null,
    holder: null,
    earnedTick: 0,
    killMarks: 0,
    successionCount: 0,
    activeHolds: {},
    candidates: [],
    history: [],
    processedReceiptIds: [],
  };
}

// ---- FB-060 counter titles -----------------------------------------------------------------
// Same world-record law as the thunderchild hold (held/vacant + succession on the holder's
// death) but earned by a counted verb instead of a threat-ratio hold: `progress` counts each
// holder's qualifying receipts until `counterTarget`, at which point the holder takes a vacant
// title or queues as a successor candidate. `window` is the open "wanted period" ledger Quiet-
// Clear reads — it lives on the record so a save taken mid-window does not fabricate a clear.

function freshCounterTitleState(def) {
  return {
    titleId: def.id,
    title: def.title,
    status: 'vacant',
    holderKey: null,
    holder: null,
    earnedTick: 0,
    marks: 0,
    successionCount: 0,
    progress: {},
    window: null,
    candidates: [],
    history: [],
    processedReceiptIds: [],
  };
}

function normalizeCounterCandidate(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const holderKey = cleanText(raw.holderKey);
  const holder = cloneHolder(raw.holder);
  if (!holderKey || !holder) return null;
  return {
    holderKey,
    holder,
    count: Math.max(1, finiteInteger(raw.count, 1)),
    tick: finiteInteger(raw.tick),
  };
}

/** Tolerant to the flat NG+ carry shape ({titleId, title, status:'held', holderKey:'player'}). */
function normalizeCounterTitleState(raw, def) {
  const own = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const holderKey = cleanText(own.holderKey);
  const status = own.status === 'held' && holderKey ? 'held' : 'vacant';
  const progress = {};
  for (const [key, value] of Object.entries(own.progress && typeof own.progress === 'object' ? own.progress : {})) {
    const cleanKey = cleanText(key);
    const count = finiteInteger(value);
    if (cleanKey && count > 0) progress[cleanKey] = Math.min(count, def.counterTarget);
  }
  const candidates = [];
  const seen = new Set();
  for (const entry of Array.isArray(own.candidates) ? own.candidates : []) {
    const candidate = normalizeCounterCandidate(entry);
    if (!candidate || candidate.holderKey === holderKey || seen.has(candidate.holderKey)) continue;
    seen.add(candidate.holderKey);
    candidates.push(candidate);
  }
  candidates.sort(compareCounterCandidates);
  candidates.length = Math.min(candidates.length, TITLE_CANDIDATE_LIMIT);
  const window = own.window && typeof own.window === 'object'
    ? { kills: finiteInteger(own.window.kills), openedTick: finiteInteger(own.window.openedTick) }
    : null;
  return {
    titleId: def.id,
    title: cleanText(own.title, def.title),
    status,
    holderKey: status === 'held' ? holderKey : null,
    holder: status === 'held' ? cloneHolder(own.holder) : null,
    earnedTick: status === 'held' ? finiteInteger(own.earnedTick) : 0,
    marks: finiteInteger(own.marks),
    successionCount: finiteInteger(own.successionCount),
    progress,
    window,
    candidates,
    history: boundedTail(own.history, TITLE_HISTORY_LIMIT),
    processedReceiptIds: boundedTail(own.processedReceiptIds, TITLE_PROCESSED_RECEIPT_LIMIT)
      .map((id) => cleanText(id)).filter(Boolean),
    ...(cleanText(own.trickId) ? { trickId: cleanText(own.trickId) } : {}),
  };
}

/** Successor order for a counter title: deeper qualifying count, then earlier qualification. */
export function compareCounterCandidates(a, b) {
  const count = finiteInteger(b.count) - finiteInteger(a.count);
  if (count) return count;
  const tick = finiteInteger(a.tick) - finiteInteger(b.tick);
  if (tick) return tick;
  const keyA = cleanText(a.holderKey);
  const keyB = cleanText(b.holderKey);
  return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
}

function counterTitleSeenRecord(def, own) {
  return {
    id: `${def.id}:${own.successionCount}:${own.holderKey}`,
    title: def.title,
    seenAt: own.earnedTick,
    holderKey: own.holderKey,
  };
}

function holderDisplayName(own) {
  return own && own.holder && own.holder.displayName ? own.holder.displayName : 'you';
}

/** The player's hull as a title holder snapshot — the persistent ship is what the news names. */
function playerHolderSnapshot(state) {
  const player = state && state.player;
  const owned = activeOwnedShip(state);
  const index = Math.max(0, finiteInteger(player && player.activeShipIndex));
  return {
    shipDefId: cleanText(owned && owned.defId, 'ship_kestrel'),
    factionId: 'faction_player',
    displayName: owned
      ? hullNameForOwnedShip(owned, index, finiteInteger(state && state.meta && state.meta.seed))
      : 'you',
  };
}

function normalizeActiveHold(raw, fallbackHolderKey = '') {
  if (!raw || typeof raw !== 'object') return null;
  const holderKey = cleanText(raw.holderKey, cleanText(fallbackHolderKey));
  if (!holderKey) return null;
  const startedTick = finiteInteger(raw.startedTick);
  return {
    holderKey,
    startedTick,
    lastCombatTick: Math.max(startedTick, finiteInteger(raw.lastCombatTick, startedTick)),
    alliedThreat: Math.max(1, finiteInteger(raw.alliedThreat, 1)),
    hostileThreat: finiteInteger(raw.hostileThreat),
    hostileOutcomes: finiteInteger(raw.hostileOutcomes),
    candidateKills: finiteInteger(raw.candidateKills),
  };
}

function normalizeCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return null;
  const holderKey = cleanText(candidate.holderKey);
  const receiptId = cleanText(candidate.receiptId);
  const holder = cloneHolder(candidate.holder);
  if (!holderKey || !receiptId || !holder) return null;
  return {
    receiptId,
    holderKey,
    holder,
    startedTick: finiteInteger(candidate.startedTick),
    endedTick: finiteInteger(candidate.endedTick),
    alliedThreat: finiteInteger(candidate.alliedThreat),
    hostileThreat: finiteInteger(candidate.hostileThreat),
    hostileOutcomes: finiteInteger(candidate.hostileOutcomes),
    candidateKills: finiteInteger(candidate.candidateKills),
  };
}

function boundedTail(values, limit) {
  return Array.isArray(values) ? values.slice(-limit) : [];
}

function ensureState(state) {
  if (!state.story || typeof state.story !== 'object') state.story = {};
  const story = state.story;
  if (!story.titles || typeof story.titles !== 'object') story.titles = {};
  const titles = story.titles;
  titles.schemaVersion = TITLES_SCHEMA_VERSION;
  if (!titles.byId || typeof titles.byId !== 'object') titles.byId = {};

  const source = titles.byId[THUNDERCHILD_TITLE_ID];
  const own = source && typeof source === 'object' ? source : freshThunderchildState();
  own.status = own.status === 'held' && cleanText(own.holderKey) && own.holder ? 'held' : 'vacant';
  own.holderKey = own.status === 'held' ? cleanText(own.holderKey) : null;
  own.holder = own.status === 'held' ? cloneHolder(own.holder) : null;
  own.earnedTick = finiteInteger(own.earnedTick);
  own.killMarks = Math.min(THUNDERCHILD.maxKillMarks, finiteInteger(own.killMarks));
  own.successionCount = finiteInteger(own.successionCount);

  const activeHolds = Object.entries(own.activeHolds && typeof own.activeHolds === 'object'
    ? own.activeHolds : {})
    .map(([holderKey, raw]) => normalizeActiveHold(raw, holderKey))
    .filter((hold) => hold && hold.holderKey !== own.holderKey)
    .sort((a, b) => b.lastCombatTick - a.lastCombatTick
      || a.holderKey.localeCompare(b.holderKey))
    .slice(0, TITLE_ACTIVE_HOLD_LIMIT)
    .sort((a, b) => a.holderKey.localeCompare(b.holderKey));
  own.activeHolds = Object.fromEntries(activeHolds.map((hold) => [hold.holderKey, hold]));

  const byHolder = new Map();
  for (const raw of Array.isArray(own.candidates) ? own.candidates : []) {
    const candidate = normalizeCandidate(raw);
    if (!candidate || candidate.holderKey === own.holderKey) continue;
    const prior = byHolder.get(candidate.holderKey);
    if (!prior || compareThunderchildCandidates(candidate, prior) < 0) byHolder.set(candidate.holderKey, candidate);
  }
  own.candidates = [...byHolder.values()].sort(compareThunderchildCandidates).slice(0, TITLE_CANDIDATE_LIMIT);
  own.history = boundedTail(own.history, TITLE_HISTORY_LIMIT);
  own.processedReceiptIds = boundedTail(own.processedReceiptIds, TITLE_PROCESSED_RECEIPT_LIMIT)
    .map((id) => cleanText(id)).filter(Boolean);
  titles.byId[THUNDERCHILD_TITLE_ID] = own;

  // FB-060 — the counter titles are world records in the same byId map. A held record keyed to
  // the player that lacks a holder snapshot (an NG+ carry, an old save shape) backfills one from
  // the active hull rather than fabricating an NPC.
  for (const def of COUNTER_TITLES) {
    const rec = normalizeCounterTitleState(titles.byId[def.id], def);
    if (rec.status === 'held' && rec.holderKey === 'player' && !rec.holder) {
      rec.holder = playerHolderSnapshot(state);
    }
    titles.byId[def.id] = rec;
  }

  story.titlesSeen = boundedTail(story.titlesSeen, TITLES_SEEN_LIMIT)
    .filter((record) => record && typeof record === 'object')
    .map((record) => ({
      id: cleanText(record.id),
      title: cleanText(record.title, THUNDERCHILD.title),
      seenAt: finiteInteger(record.seenAt),
      holderKey: cleanText(record.holderKey),
      ...(record.trickId ? { trickId: cleanText(record.trickId) } : {}),
    }))
    .filter((record) => record.id && record.holderKey);
  return own;
}

function currentThunderchildState(state) {
  const own = state && state.story && state.story.titles && state.story.titles.byId
    && state.story.titles.byId[THUNDERCHILD_TITLE_ID];
  return own && own.activeHolds && typeof own.activeHolds === 'object' ? own : ensureState(state);
}

function ratioComparison(a, b) {
  const aAllied = finiteInteger(a.alliedThreat);
  const bAllied = finiteInteger(b.alliedThreat);
  const aHostile = finiteInteger(a.hostileThreat);
  const bHostile = finiteInteger(b.hostileThreat);
  // Positive threat over no allied support is an infinite ratio. Treat 0/0 as zero.
  if (aHostile === 0 || bHostile === 0) {
    if (aHostile === 0 && bHostile === 0) return 0;
    return aHostile === 0 ? 1 : -1;
  }
  if (aAllied === 0 || bAllied === 0) {
    const aInfinite = aAllied === 0 && aHostile > 0;
    const bInfinite = bAllied === 0 && bHostile > 0;
    if (aInfinite !== bInfinite) return aInfinite ? -1 : 1;
    if (aInfinite && bInfinite) return 0;
  }
  const left = BigInt(aHostile) * BigInt(bAllied);
  const right = BigInt(bHostile) * BigInt(aAllied);
  if (left !== right) return left > right ? -1 : 1;
  return 0;
}

/** Best-first deterministic successor ordering from the audited S4 contract. */
export function compareThunderchildCandidates(a, b) {
  const ratio = ratioComparison(a, b);
  if (ratio) return ratio;
  const outcomes = finiteInteger(b.hostileOutcomes) - finiteInteger(a.hostileOutcomes);
  if (outcomes) return outcomes;
  const durationA = finiteInteger(a.endedTick) - finiteInteger(a.startedTick);
  const durationB = finiteInteger(b.endedTick) - finiteInteger(b.startedTick);
  if (durationA !== durationB) return durationB - durationA;
  const qualifiedAt = finiteInteger(a.endedTick) - finiteInteger(b.endedTick);
  if (qualifiedAt) return qualifiedAt;
  const keyA = cleanText(a.holderKey);
  const keyB = cleanText(b.holderKey);
  return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
}

function entityFor(state, id) {
  if (id == null || !state) return null;
  if (state.entities && typeof state.entities.get === 'function') {
    const entity = state.entities.get(id);
    if (entity) return entity;
  }
  return null;
}

const KNOWN_TRICK_ID_SET = new Set(KNOWN_TRICK_IDS);
const STUNT_INCIDENT_LIMIT = 240;

export function qualifiedStuntWitnesses(state, trick) {
  return sampledStuntWitnesses(state, trick).filter(completeWitness);
}

function entityForHolder(state, holderKey) {
  if (!holderKey || !state) return null;
  for (const entity of indexedShipLikeScan(state)) {
    if (entity && entity.alive !== false && entity.data && entity.data.worldRecordId === holderKey) {
      return entity;
    }
  }
  return null;
}

function holderKeyOf(entity) {
  return cleanText(entity && entity.data && entity.data.worldRecordId);
}

function holderSnapshot(entity) {
  if (!entity) return null;
  const data = entity.data || {};
  return {
    shipDefId: cleanText(data.shipDefId || data.defId, 'ship_unknown'),
    factionId: cleanText(entity.factionId || data.factionId, 'faction_unknown'),
    displayName: cleanText(data.displayName || entity.name || data.name, 'Unnamed hull'),
  };
}

function liveEntities(state) {
  return indexedShipLikeScan(state);
}

function isDurableNpcShip(state, entity) {
  return !!entity && entity.alive !== false && entity.type === 'ship'
    && entity.id !== (state && state.playerId) && !!holderKeyOf(entity)
    && entity.team != null && entity.pos && Number.isFinite(entity.pos.x) && Number.isFinite(entity.pos.z);
}

function threatSnapshot(state, candidate) {
  let alliedThreat = 0;
  let hostileThreat = 0;
  const radiusSq = THUNDERCHILD.aura.radius * THUNDERCHILD.aura.radius;
  for (const entity of liveEntities(state)) {
    if (!entity || entity.alive === false || entity.type !== 'ship' || entity.team == null
      || !entity.pos || !Number.isFinite(entity.pos.x) || !Number.isFinite(entity.pos.z)) continue;
    const dx = entity.pos.x - candidate.pos.x;
    const dz = entity.pos.z - candidate.pos.z;
    if (dx * dx + dz * dz > radiusSq) continue;
    if (entity.id === candidate.id || entity.team === candidate.team) alliedThreat += 1;
    else if (isHostileForAI(state, candidate, entity)) hostileThreat += 1;
  }
  return { alliedThreat: Math.max(1, alliedThreat), hostileThreat };
}

function isQualifyingThreat(alliedThreat, hostileThreat) {
  return BigInt(finiteInteger(hostileThreat)) * BigInt(THUNDERCHILD.threatRatio.hostileMultiplier)
    >= BigInt(Math.max(1, finiteInteger(alliedThreat))) * BigInt(THUNDERCHILD.threatRatio.alliedMultiplier);
}

function clearTitleStamp(entity) {
  const data = entity && entity.data;
  if (!data) return;
  // Only the aura-law ids are this stamp's to clear: a flat-record title id (stunt recognition)
  // written onto the player entity is another lane's ink.
  if (TITLE_DEFS_BY_ID.has(data.titleId)) {
    delete data.titleId;
    delete data.titleName;
  }
  if (Array.isArray(data.titleIds)) {
    data.titleIds = data.titleIds.filter((id) => !TITLE_DEFS_BY_ID.has(id));
    if (!data.titleIds.length) delete data.titleIds;
  }
  if (!TITLE_DEFS_BY_ID.has(data.titleId)) delete data.titleKillMarks;
}

/** Aura titles a live entity currently holds, in authored precedence order. */
function heldAuraTitlesFor(state, entity) {
  const byId = state && state.story && state.story.titles && state.story.titles.byId;
  if (!byId || !entity) return [];
  const key = holderKeyOf(entity);
  const isPlayerEntity = entity.id === (state && state.playerId) || entity.isPlayer === true;
  const held = [];
  for (const def of AURA_TITLES) {
    const rec = byId[def.id];
    if (!rec || rec.status !== 'held' || !rec.holderKey) continue;
    if ((key && rec.holderKey === key) || (isPlayerEntity && rec.holderKey === 'player')) {
      held.push({ def, rec });
    }
  }
  return held;
}

function stampEntityTitle(state, entity) {
  if (!entity) return null;
  const held = heldAuraTitlesFor(state, entity);
  const data = entity.data || (entity.data = {});
  if (!held.length || entity.alive === false) {
    clearTitleStamp(entity);
    return null;
  }
  const primary = held[0];
  data.titleId = primary.def.id;
  data.titleName = primary.def.title;
  data.titleIds = held.map((row) => row.def.id);
  if (primary.def.id === THUNDERCHILD_TITLE_ID) {
    data.titleKillMarks = finiteInteger(primary.rec.killMarks);
  } else {
    delete data.titleKillMarks;
  }
  return held;
}

function syncTitleStamp(state) {
  const seen = new Set();
  for (const entity of liveEntities(state)) {
    if (!entity || entity.id == null) continue;
    seen.add(entity.id);
    stampEntityTitle(state, entity);
  }
  const player = entityFor(state, state && state.playerId);
  if (player && !seen.has(player.id)) stampEntityTitle(state, player);
}

function normalizedReceipt(payload, entity) {
  const receiptId = cleanText(payload && payload.receiptId);
  const holderKey = holderKeyOf(entity);
  if (!receiptId || !holderKey) return null;
  return normalizeCandidate({
    receiptId,
    holderKey,
    holder: holderSnapshot(entity),
    startedTick: payload.startedTick,
    endedTick: payload.endedTick,
    alliedThreat: payload.alliedThreat,
    hostileThreat: payload.hostileThreat,
    hostileOutcomes: payload.hostileOutcomes,
    candidateKills: payload.candidateKills,
  });
}

function qualifies(payload, candidate) {
  if (!payload || payload.survived !== true || !candidate) return false;
  const integerFields = [
    payload.startedTick,
    payload.endedTick,
    payload.alliedThreat,
    payload.hostileThreat,
    payload.hostileOutcomes,
    payload.candidateKills,
  ];
  if (!integerFields.every((value) => Number.isSafeInteger(value) && value >= 0)) return false;
  const duration = candidate.endedTick - candidate.startedTick;
  if (duration < THUNDERCHILD.minDurationTicks) return false;
  const hostileSide = BigInt(candidate.hostileThreat) * BigInt(THUNDERCHILD.threatRatio.hostileMultiplier);
  const alliedSide = BigInt(candidate.alliedThreat) * BigInt(THUNDERCHILD.threatRatio.alliedMultiplier);
  if (hostileSide < alliedSide) return false;
  return candidate.hostileOutcomes >= THUNDERCHILD.minHostileOutcomes
    && candidate.candidateKills >= THUNDERCHILD.minHostileOutcomes;
}

function appendBounded(array, value, limit) {
  array.push(value);
  if (array.length > limit) array.splice(0, array.length - limit);
}

function rememberReceipt(own, receiptId) {
  if (!receiptId || own.processedReceiptIds.includes(receiptId)) return false;
  appendBounded(own.processedReceiptIds, receiptId, TITLE_PROCESSED_RECEIPT_LIMIT);
  return true;
}

function emit(bus, event, payload) {
  if (bus && typeof bus.emit === 'function') bus.emit(event, payload);
}

function titleSeenRecordFor(def, own) {
  return {
    id: `${def.id}:${own.successionCount}:${own.holderKey}`,
    title: def.title,
    seenAt: own.earnedTick,
    holderKey: own.holderKey,
  };
}

function titleSeenRecord(own) {
  return titleSeenRecordFor(THUNDERCHILD, own);
}

function earnedEventFor(def, own, receiptId) {
  return {
    titleId: def.id,
    title: def.title,
    holderKey: own.holderKey,
    holder: cloneHolder(own.holder),
    earnedTick: own.earnedTick,
    killMarks: own.killMarks,
    marks: own.marks,
    successionCount: own.successionCount,
    receiptId,
  };
}

function earnedEvent(own, receiptId) {
  return earnedEventFor(THUNDERCHILD, own, receiptId);
}

export function createTitlesSystem() {
  return {
    name: 'titles',

    init(ctx) {
      this.destroy();
      this.state = ctx && ctx.state;
      this.bus = ctx && ctx.bus;
      this._holderEntityId = null;
      this._activeEntityIds = new Map();
      ensureState(this.state);
      this._onHold = (payload) => this._onHoldResolved(payload || {});
      this._onDamage = (payload) => this._onCombatDamage(payload || {});
      this._onKilled = (payload) => this._onEntityKilled(payload || {});
      this._onSpawned = (payload) => this._onEntitySpawned(payload || {});
      this._onSaveLoaded = () => this._rebindSilently();
      this._onNewGame = () => this.newGame();
      this._onTrickDetected = (payload) => this._onStuntTrick(payload || {});
      this._onNewGamePlus = (payload) => this.applyNewGamePlusTitles(payload && payload.titles);
      this._onPodDelivered = (payload) => this._onSurvivorPodDelivered(payload || {});
      this._onPodResolved = (payload) => this._onSurvivorPodResolved(payload || {});
      this._onReleaseRatedEvt = (payload) => this._onReleaseRated(payload || {});
      this._onHeatChangedEvt = (payload) => this._onHeatChanged(payload || {});
      if (this.bus && typeof this.bus.on === 'function') {
        this.bus.on('title:holdResolved', this._onHold);
        this.bus.on('combat:damage', this._onDamage);
        this.bus.on('entity:killed', this._onKilled);
        this.bus.on('entity:spawned', this._onSpawned);
        this.bus.on('save:loaded', this._onSaveLoaded);
        this.bus.on('game:newGame', this._onNewGame);
        this.bus.on('stunt:trickDetected', this._onTrickDetected);
        this.bus.on('stunt:trickAmended', this._onTrickDetected);
        this.bus.on('story:newGamePlusStarted', this._onNewGamePlus);
        this.bus.on('survivorPod:delivered', this._onPodDelivered);
        this.bus.on('survivorPod:rescued', this._onPodResolved);
        this.bus.on('tether:releaseRated', this._onReleaseRatedEvt);
        this.bus.on('heat:changed', this._onHeatChangedEvt);
      }
      this._rebindSilently();
    },

    newGame() {
      if (!this.state) return;
      if (!this.state.story || typeof this.state.story !== 'object') this.state.story = {};
      const byId = { [THUNDERCHILD_TITLE_ID]: freshThunderchildState() };
      for (const def of COUNTER_TITLES) byId[def.id] = freshCounterTitleState(def);
      this.state.story.titles = {
        schemaVersion: TITLES_SCHEMA_VERSION,
        byId,
      };
      this.state.story.titlesSeen = [];
      this._holderEntityId = null;
      this._activeEntityIds?.clear();
      syncTitleStamp(this.state);
    },

    applyNewGamePlusTitles(titles) {
      if (!this.state || !Array.isArray(titles) || !titles.length) return 0;
      ensureState(this.state);
      const story = this.state.story;
      if (!Array.isArray(story.titlesSeen)) story.titlesSeen = [];
      let applied = 0;
      for (const carried of titles) {
        if (!carried || typeof carried !== 'object') continue;
        // Only the player's own titles carry (PQ-032.03). A record from an older save can still
        // hold an NPC's Thunderchild key; writing it produced "you" under a dead stranger's key.
        // A carried title is the player's in the new run, so its rows are keyed 'player'.
        const trickId = cleanText(carried.trickId);
        // No silent 'player' default here: a record with neither trickId nor a player-shaped
        // holderKey is an NPC's title and is refused, not adopted. leftoverTitleRecord already
        // drops records with no holderKey, so this cannot refuse a legitimate carry.
        if (!isPlayerTitleHolder({ holderKey: cleanText(carried.holderKey), trickId })) continue;
        const titleId = authoredTitleId(carried.id || carried.titleId);
        const titleName = cleanText(carried.title, titleId === THUNDERCHILD_TITLE_ID ? THUNDERCHILD.title : '');
        const holderKey = 'player';
        if (!titleId || !titleName) continue;
        const seenId = cleanText(carried.seenId, `${titleId}:${holderKey}:legacy`);
        if (!story.titlesSeen.some((record) => record && record.id === seenId)) {
          appendBounded(story.titlesSeen, {
            id: seenId,
            title: titleName,
            seenAt: 0,
            holderKey,
            ...(trickId ? { trickId } : {}),
          }, TITLES_SEEN_LIMIT);
        }
        if (titleId === THUNDERCHILD_TITLE_ID) {
          const own = story.titles.byId[THUNDERCHILD_TITLE_ID];
          if (own && own.status !== 'held') {
            own.status = 'held';
            own.holderKey = holderKey;
            own.holder = {
              shipDefId: 'ship_kestrel',
              factionId: 'faction_player',
              displayName: 'you',
            };
            own.earnedTick = 0;
          }
        } else if (trickId || titleId.startsWith('title_')) {
          story.titles.byId[titleId] = {
            schemaVersion: TITLES_SCHEMA_VERSION,
            titleId,
            trickId,
            title: titleName,
            status: 'held',
            holderKey,
            earnedTick: 0,
          };
        }
        applied += 1;
      }
      syncTitleStamp(this.state);
      emit(this.bus, 'title:newGamePlusApplied', { count: applied });
      return applied;
    },

    update(_dt, state = this.state) {
      if (state) this.state = state;
      observeStuntWitnesses(this.state);
      deliverWitnessReports(this.state, this.bus);
      if (!this._activeEntityIds.size) return;
      const own = currentThunderchildState(this.state);
      const tick = finiteInteger(this.state && this.state.tick);
      for (const [holderKey, entityId] of this._activeEntityIds) {
        const hold = own.activeHolds[holderKey];
        const entity = entityFor(this.state, entityId);
        if (!hold) {
          this._activeEntityIds.delete(holderKey);
          continue;
        }
        if (!entity || entity.alive === false || tick < hold.startedTick
          || tick - hold.lastCombatTick > THUNDERCHILD.holdContinuityTicks) {
          delete own.activeHolds[holderKey];
          this._activeEntityIds.delete(holderKey);
          continue;
        }
        if (tick - hold.startedTick < THUNDERCHILD.minDurationTicks
          || hold.hostileOutcomes < THUNDERCHILD.minHostileOutcomes
          || hold.candidateKills < THUNDERCHILD.minHostileOutcomes) continue;
        delete own.activeHolds[holderKey];
        this._activeEntityIds.delete(holderKey);
        emit(this.bus, 'title:holdResolved', {
          receiptId: `title:natural-hold:${holderKey}:${hold.startedTick}`,
          entityId: entity.id,
          startedTick: hold.startedTick,
          endedTick: tick,
          alliedThreat: hold.alliedThreat,
          hostileThreat: hold.hostileThreat,
          hostileOutcomes: hold.hostileOutcomes,
          candidateKills: hold.candidateKills,
          survived: true,
          source: 'combat_observation',
        });
      }
    },

    _rebindSilently() {
      const own = ensureState(this.state);
      const entity = own.status === 'held' ? entityForHolder(this.state, own.holderKey) : null;
      this._holderEntityId = entity ? entity.id : null;
      this._activeEntityIds?.clear();
      for (const candidate of liveEntities(this.state)) {
        const holderKey = holderKeyOf(candidate);
        if (holderKey && own.activeHolds[holderKey] && candidate.alive !== false) {
          this._activeEntityIds.set(holderKey, candidate.id);
        }
      }
      syncTitleStamp(this.state);

      const playerId = this.state && this.state.playerId;
      const playerEntity = entityFor(this.state, playerId) || entityFor(this.state, 'player');
      if (playerEntity && !playerEntity.data?.titleId && this.state.story && this.state.story.titles && this.state.story.titles.byId) {
        for (const [tId, tRec] of Object.entries(this.state.story.titles.byId)) {
          // FB-060 — counter titles can sit on NPC hulls; a world-record holder is not the
          // player's stamp to wear. Only player-held records (stunt keys, 'player') stamp here;
          // aura-title stamping already ran through syncTitleStamp above.
          if (tId !== THUNDERCHILD_TITLE_ID && tRec && tRec.status === 'held' && isPlayerTitleHolder(tRec)) {
            playerEntity.data = playerEntity.data || {};
            playerEntity.data.titleId = tId;
            playerEntity.data.titleName = tRec.title;
            break;
          }
        }
      }
    },

    _onCombatDamage(payload) {
      const applied = Number(payload.applied != null ? payload.applied : payload.amount);
      if (!Number.isFinite(applied) || applied <= 0) return null;
      const attacker = entityFor(this.state, payload.attackerId);
      const target = entityFor(this.state, payload.targetId);
      this._observeCombatant(attacker, target);
      this._observeCombatant(target, attacker);
      return null;
    },

    _onEntitySpawned(payload) {
      const entity = payload.entity || entityFor(this.state, payload.id);
      if (!entity) return null;
      const own = currentThunderchildState(this.state);
      const holderKey = holderKeyOf(entity);
      if (own.status === 'held' && holderKey === own.holderKey && entity.alive !== false) {
        this._holderEntityId = entity.id;
      }
      // The stamp is every aura title's now — the counter titles bind by the same holderKey law.
      stampEntityTitle(this.state, entity);
      if (holderKey && own.activeHolds[holderKey] && entity.alive !== false) {
        this._activeEntityIds.set(holderKey, entity.id);
      }
      return entity;
    },

    _observeCombatant(candidate, opponent) {
      const own = currentThunderchildState(this.state);
      if (!isDurableNpcShip(this.state, candidate) || !opponent || opponent.alive === false
        || opponent.type !== 'ship' || !isHostileForAI(this.state, candidate, opponent)) return null;
      const holderKey = holderKeyOf(candidate);
      if (holderKey === own.holderKey) return null;
      const tick = finiteInteger(this.state && this.state.tick);
      let hold = own.activeHolds[holderKey];
      if (hold && tick - hold.lastCombatTick > THUNDERCHILD.holdContinuityTicks) {
        delete own.activeHolds[holderKey];
        this._activeEntityIds.delete(holderKey);
        hold = null;
      }
      if (hold) {
        this._activeEntityIds.set(holderKey, candidate.id);
        hold.lastCombatTick = tick;
        return hold;
      }
      const threat = threatSnapshot(this.state, candidate);
      if (!isQualifyingThreat(threat.alliedThreat, threat.hostileThreat)) return null;
      hold = {
        holderKey,
        startedTick: tick,
        lastCombatTick: tick,
        alliedThreat: threat.alliedThreat,
        hostileThreat: threat.hostileThreat,
        hostileOutcomes: 0,
        candidateKills: 0,
      };
      own.activeHolds[holderKey] = hold;
      this._activeEntityIds.set(holderKey, candidate.id);
      const keys = Object.keys(own.activeHolds);
      if (keys.length > TITLE_ACTIVE_HOLD_LIMIT) {
        keys.sort((left, right) => own.activeHolds[left].lastCombatTick - own.activeHolds[right].lastCombatTick
          || right.localeCompare(left));
        delete own.activeHolds[keys[0]];
        this._activeEntityIds.delete(keys[0]);
      }
      return hold;
    },

    _onHoldResolved(payload) {
      const own = ensureState(this.state);
      const receiptId = cleanText(payload.receiptId);
      if (!rememberReceipt(own, receiptId)) return null;
      const entity = entityFor(this.state, payload.entityId);
      const candidate = normalizedReceipt(payload, entity);
      if (!qualifies(payload, candidate)) return null;
      delete own.activeHolds[candidate.holderKey];
      this._activeEntityIds.delete(candidate.holderKey);

      if (own.status === 'vacant') {
        this._awardVacant(own, candidate, payload.entityId);
        return candidate;
      }
      if (candidate.holderKey === own.holderKey) return candidate;

      const index = own.candidates.findIndex((entry) => entry.holderKey === candidate.holderKey);
      if (index < 0) own.candidates.push(candidate);
      else if (compareThunderchildCandidates(candidate, own.candidates[index]) < 0) own.candidates[index] = candidate;
      own.candidates.sort(compareThunderchildCandidates);
      if (own.candidates.length > TITLE_CANDIDATE_LIMIT) own.candidates.length = TITLE_CANDIDATE_LIMIT;
      return candidate;
    },

    _awardVacant(own, candidate, transientEntityId) {
      own.status = 'held';
      own.holderKey = candidate.holderKey;
      own.holder = cloneHolder(candidate.holder);
      own.earnedTick = candidate.endedTick;
      own.killMarks = 0;
      own.candidates = own.candidates.filter((entry) => entry.holderKey !== candidate.holderKey);
      appendBounded(own.history, {
        kind: 'earned',
        tick: own.earnedTick,
        holderKey: own.holderKey,
        receiptId: candidate.receiptId,
      }, TITLE_HISTORY_LIMIT);
      appendBounded(this.state.story.titlesSeen, titleSeenRecord(own), TITLES_SEEN_LIMIT);
      this._holderEntityId = transientEntityId;
      stampEntityTitle(this.state, entityFor(this.state, transientEntityId));

      emit(this.bus, 'title:earned', earnedEvent(own, candidate.receiptId));
      emit(this.bus, 'title:auraChanged', {
        titleId: THUNDERCHILD_TITLE_ID,
        title: THUNDERCHILD.title,
        previousHolderKey: null,
        holderKey: own.holderKey,
        holder: cloneHolder(own.holder),
        active: true,
        tick: own.earnedTick,
        reason: 'earned',
      });
      emit(this.bus, 'news:publish', {
        text: `${own.holder.displayName}${THUNDERCHILD.news.earnedSuffix}`,
        kind: 'title_earned',
        titleId: THUNDERCHILD_TITLE_ID,
        holderKey: own.holderKey,
        channelId: 'news',
        receiptId: `title:earned:${candidate.receiptId}`,
      });
    },

    _onEntityKilled(payload) {
      const own = currentThunderchildState(this.state);
      const victimId = payload.id != null ? payload.id : payload.entityId;
      const victim = entityFor(this.state, victimId);
      const victimKey = holderKeyOf(victim);
      if (victimKey) {
        delete own.activeHolds[victimKey];
        this._activeEntityIds.delete(victimKey);
      }
      const killer = entityFor(this.state, payload.killerId);
      const killerKey = holderKeyOf(killer);
      const activeHold = killerKey && own.activeHolds[killerKey];
      if (activeHold && victim && isHostileForAI(this.state, killer, victim)) {
        activeHold.lastCombatTick = finiteInteger(this.state && this.state.tick);
        activeHold.hostileOutcomes += 1;
        activeHold.candidateKills += 1;
      }
      // FB-060 — a player kill inside an open WANTED window voids the Quiet-Clear count for it.
      const quiet = this.state && this.state.story && this.state.story.titles
        && this.state.story.titles.byId && this.state.story.titles.byId[QUIET_CLEAR_TITLE_ID];
      if (quiet && quiet.window && payload.killerId === this.state.playerId) {
        quiet.window.kills += 1;
      }
      // FB-060 — counter titles follow the same succession law: the holder's death moves the
      // title to the best queued candidate or leaves it vacant. Player death ends the run but
      // the record still resolves so a carried save cannot leave a ghost holder.
      for (const def of COUNTER_TITLES) {
        const rec = this.state.story.titles.byId[def.id];
        if (!rec) continue;
        if (victimKey) rec.candidates = rec.candidates.filter((c) => c.holderKey !== victimKey);
        if (rec.status !== 'held') continue;
        const counterHolderDied = (victimKey && victimKey === rec.holderKey)
          || (victimId != null && victimId === this.state.playerId && isPlayerTitleHolder(rec));
        if (counterHolderDied) this._succeedCounterTitle(def, rec);
      }

      if (own.status !== 'held') return null;
      const holderDied = victimKey === own.holderKey
        || (victimKey === '' && victimId != null && victimId === this._holderEntityId);
      if (holderDied) return this._succeedOrVacate(own, payload);
      if (victimKey) own.candidates = own.candidates.filter((candidate) => candidate.holderKey !== victimKey);

      if (killerKey !== own.holderKey) return null;
      const stableVictim = victimKey || `entity:${victimId}`;
      const tick = finiteInteger(this.state && this.state.tick);
      const receiptId = cleanText(payload.receiptId, `title:kill:${tick}:${stableVictim}`);
      if (!rememberReceipt(own, receiptId)) return null;
      own.killMarks = Math.min(THUNDERCHILD.maxKillMarks, own.killMarks + 1);
      const event = {
        titleId: THUNDERCHILD_TITLE_ID,
        title: THUNDERCHILD.title,
        holderKey: own.holderKey,
        killMarks: own.killMarks,
        victimKey: stableVictim,
        tick,
        receiptId,
      };
      stampEntityTitle(this.state, killer);
      emit(this.bus, 'title:killMarksChanged', event);
      return event;
    },

    _succeedOrVacate(own) {
      return this._succeedOrVacateFor(THUNDERCHILD, own, compareThunderchildCandidates);
    },

    /** The shared succession law (FB-060): the best queued candidate inherits, else the title
     *  goes vacant. `def` supplies the id, the display name, and the news lines. */
    _succeedOrVacateFor(def, own, compareCandidates) {
      const previousHolderKey = own.holderKey;
      const previousHolder = cloneHolder(own.holder);
      const tick = finiteInteger(this.state && this.state.tick);
      const successor = own.candidates.sort(compareCandidates)[0] || null;
      own.successionCount += 1;
      own.killMarks = 0;
      if ('marks' in own) own.marks = successor ? Math.max(1, finiteInteger(successor.count, 1)) : 0;

      if (successor) {
        own.status = 'held';
        own.holderKey = successor.holderKey;
        own.holder = cloneHolder(successor.holder);
        own.earnedTick = tick;
        own.candidates = own.candidates.filter((entry) => entry.holderKey !== successor.holderKey);
        if (def.id === THUNDERCHILD_TITLE_ID) {
          const liveSuccessor = entityForHolder(this.state, own.holderKey);
          this._holderEntityId = liveSuccessor ? liveSuccessor.id : null;
        }
      } else {
        own.status = 'vacant';
        own.holderKey = null;
        own.holder = null;
        own.earnedTick = 0;
        if (def.id === THUNDERCHILD_TITLE_ID) this._holderEntityId = null;
      }
      syncTitleStamp(this.state);

      // Thunderchild keeps its shipped receipt shape (`title:succession:N:holder`); counter
      // titles are def-qualified since several records now emit successions.
      const receiptId = def.id === THUNDERCHILD_TITLE_ID
        ? `title:succession:${own.successionCount}:${own.holderKey || 'vacant'}`
        : `title:succession:${def.id}:${own.successionCount}:${own.holderKey || 'vacant'}`;
      appendBounded(own.history, {
        kind: successor ? 'succession' : 'vacant',
        tick,
        previousHolderKey,
        holderKey: own.holderKey,
        receiptId,
      }, TITLE_HISTORY_LIMIT);
      if (successor) appendBounded(this.state.story.titlesSeen, titleSeenRecordFor(def, own), TITLES_SEEN_LIMIT);

      const succession = {
        titleId: def.id,
        title: def.title,
        previousHolderKey,
        previousHolder,
        holderKey: own.holderKey,
        holder: cloneHolder(own.holder),
        tick,
        successionCount: own.successionCount,
        cause: 'holder_killed',
        receiptId,
      };
      emit(this.bus, 'title:succession', succession);
      emit(this.bus, 'title:auraChanged', {
        titleId: def.id,
        title: def.title,
        previousHolderKey,
        holderKey: own.holderKey,
        holder: cloneHolder(own.holder),
        active: !!successor,
        tick,
        reason: 'holder_killed',
      });
      emit(this.bus, 'news:publish', successor ? {
        text: `${def.news.successionPrefix}${holderDisplayName(own)}${def.news.successionSuffix}`,
        kind: 'title_succession',
        titleId: def.id,
        holderKey: own.holderKey,
        previousHolderKey,
        channelId: 'news',
        receiptId,
      } : {
        text: def.news.vacant,
        kind: 'title_vacant',
        titleId: def.id,
        holderKey: null,
        previousHolderKey,
        channelId: 'news',
        receiptId,
      });
      return succession;
    },

    _succeedCounterTitle(def, own) {
      return this._succeedOrVacateFor(def, own, compareCounterCandidates);
    },

    // ---- FB-060: counter-title earn lanes ---------------------------------------------------
    // Every lane resolves to one holder key ('player' or a durable worldRecordId), one receipt
    // id, and one count tick. `processedReceiptIds` on the record dedupes across save/reload.

    _counterTitleRecord(def) {
      const titles = ensureState(this.state) && this.state.story.titles;
      const rec = titles.byId[def.id];
      return rec && rec.titleId === def.id ? rec : null;
    },

    _holderKeyForEntity(entity) {
      if (!entity) return null;
      if (entity.id === (this.state && this.state.playerId) || entity.isPlayer === true) return 'player';
      const key = holderKeyOf(entity);
      // Only durable world-record hulls hold titles — an ephemeral traffic hull cannot carry one.
      return key || null;
    },

    /**
     * One qualifying receipt for `def` credited to `holderKey`. Under the target it accrues as
     * progress; at the target the holder takes a vacant title or queues behind the live holder.
     */
    _creditCounterTitle(def, holderKey, holder, receiptId) {
      const own = this._counterTitleRecord(def);
      if (!own || !holderKey) return null;
      if (receiptId && !rememberReceipt(own, receiptId)) return null;
      const tick = finiteInteger(this.state && this.state.tick);
      if (own.status === 'held' && own.holderKey === holderKey) {
        own.marks = finiteInteger(own.marks) + 1;
        return null;
      }
      own.progress[holderKey] = finiteInteger(own.progress[holderKey]) + 1;
      const count = own.progress[holderKey];
      if (count < def.counterTarget) return { pending: count };
      delete own.progress[holderKey];
      const candidate = { holderKey, holder: cloneHolder(holder), count, tick };
      if (own.status === 'held') {
        const index = own.candidates.findIndex((entry) => entry.holderKey === holderKey);
        if (index < 0) own.candidates.push(candidate);
        else if (count > finiteInteger(own.candidates[index].count)) own.candidates[index] = candidate;
        own.candidates.sort(compareCounterCandidates);
        if (own.candidates.length > TITLE_CANDIDATE_LIMIT) own.candidates.length = TITLE_CANDIDATE_LIMIT;
        return candidate;
      }
      return this._awardCounterTitle(def, own, candidate);
    },

    _awardCounterTitle(def, own, candidate) {
      own.status = 'held';
      own.holderKey = candidate.holderKey;
      own.holder = cloneHolder(candidate.holder);
      own.earnedTick = candidate.tick;
      own.marks = candidate.count;
      own.candidates = own.candidates.filter((entry) => entry.holderKey !== candidate.holderKey);
      const receiptId = `title:earned:${def.id}:${candidate.holderKey}:${candidate.tick}`;
      appendBounded(own.history, {
        kind: 'earned',
        tick: candidate.tick,
        holderKey: candidate.holderKey,
        receiptId,
      }, TITLE_HISTORY_LIMIT);
      appendBounded(this.state.story.titlesSeen, counterTitleSeenRecord(def, own), TITLES_SEEN_LIMIT);
      const holderEntity = candidate.holderKey === 'player'
        ? entityFor(this.state, this.state.playerId)
        : entityForHolder(this.state, candidate.holderKey);
      stampEntityTitle(this.state, holderEntity);

      emit(this.bus, 'title:earned', earnedEventFor(def, own, receiptId));
      emit(this.bus, 'title:auraChanged', {
        titleId: def.id,
        title: def.title,
        previousHolderKey: null,
        holderKey: own.holderKey,
        holder: cloneHolder(own.holder),
        active: true,
        tick: candidate.tick,
        reason: 'earned',
      });
      emit(this.bus, 'news:publish', {
        text: `${holderDisplayName(own)}${def.news.earnedSuffix}`,
        kind: 'title_earned',
        titleId: def.id,
        holderKey: own.holderKey,
        channelId: 'news',
        receiptId,
      });
      return own;
    },

    _onSurvivorPodDelivered(payload) {
      // traffic.js emits this when a rescue hull hands a pod to a station — the rescue hull is
      // the earner; only durable hulls (or the player) can hold a title.
      const entity = entityFor(this.state, payload && payload.rescueHullId);
      const holderKey = this._holderKeyForEntity(entity);
      if (!holderKey) return null;
      const def = COUNTER_TITLES.find((row) => row.counter === 'rescues');
      const podKey = payload && payload.podEntityId != null ? String(payload.podEntityId) : '';
      return this._creditCounterTitle(def, holderKey,
        holderKey === 'player' ? playerHolderSnapshot(this.state) : holderSnapshot(entity),
        `pod:${podKey || `${entity && entity.id}:${finiteInteger(this.state && this.state.tick)}`}`);
    },

    _onSurvivorPodResolved(payload) {
      // survivorPod.js emits survivorPod:rescued with a reason: 'station_delivery' and
      // 'player_handoff_rescue_hull' both required the player latched — those count for the
      // pilot. 'rescue_hull' claims credit the hull that took it. The receipt key is the pod's
      // own entity id so this lane and survivorPod:delivered can never count one pod twice.
      const reason = cleanText(payload && payload.reason);
      const def = COUNTER_TITLES.find((row) => row.counter === 'rescues');
      const podKey = payload && payload.entityId != null ? String(payload.entityId) : cleanText(payload && payload.id);
      const receiptId = `pod:${podKey || finiteInteger(this.state && this.state.tick)}`;
      if (reason === 'station_delivery' || reason === 'player_handoff_rescue_hull') {
        return this._creditCounterTitle(def, 'player', playerHolderSnapshot(this.state), receiptId);
      }
      if (reason === 'rescue_hull' && payload.rescueHullId != null) {
        const entity = entityFor(this.state, payload.rescueHullId);
        const holderKey = this._holderKeyForEntity(entity);
        if (!holderKey) return null;
        return this._creditCounterTitle(def, holderKey,
          holderKey === 'player' ? playerHolderSnapshot(this.state) : holderSnapshot(entity), receiptId);
      }
      return null;
    },

    _onReleaseRated(payload) {
      // tether:releaseRated is the player's own Massline verdict — the same receipt the
      // razorReleases achievement counter reads.
      if (!payload || payload.classification !== 'razor') return null;
      const def = COUNTER_TITLES.find((row) => row.counter === 'razorReleases');
      const receiptId = `razor:${finiteInteger(payload.observedTick, finiteInteger(this.state && this.state.tick))}:${String(payload.targetId)}`;
      return this._creditCounterTitle(def, 'player', playerHolderSnapshot(this.state), receiptId);
    },

    _onHeatChanged(payload) {
      // Quiet-Clear counts a WANTED period that closes with no player kill inside it. The window
      // rides on the title record so a save/continue mid-window keeps the ledger honest.
      const def = COUNTER_TITLES.find((row) => row.counter === 'quietClears');
      const own = this._counterTitleRecord(def);
      if (!own || !payload || payload.wantedCrossed !== true) return null;
      const tick = finiteInteger(this.state && this.state.tick);
      if (payload.wanted === true) {
        own.window = { kills: 0, openedTick: tick };
        return null;
      }
      const window = own.window;
      own.window = null;
      if (!window || window.kills > 0) return null;
      return this._creditCounterTitle(def, 'player', playerHolderSnapshot(this.state),
        `quiet:${window.openedTick}:${tick}`);
    },

    _onStuntTrick(trick) {
      const state = this.state;
      if (!state || !adventureStunts(state) || trick?.actorId !== state.playerId || !KNOWN_TRICK_ID_SET.has(trick?.trickId)) return null;
      if(typeof trick.episodeId!=='string'||!trick.episodeId||trick.episodeId.length>512)return null;
      const root = journalFor(state)?.roots.get(trick.rootId);
      if (!root || root.truncated || root.actorId !== state.playerId || !Array.isArray(trick.causeChain) || !trick.causeChain.length
        || !Number.isSafeInteger(trick.tick)||trick.tick<root.tick||trick.tick>state.tick||trick.tick-root.tick>480) return null;
      const consequence = trick.consequence;
      if (!consequence || !(consequence.killed || trick.pureEscape || consequence.escaped
        || consequence.hullMax > 0 && consequence.hullDamage >= .25 * consequence.hullMax && consequence.helmLossSeconds >= 1)) return null;
      ensureState(state);
      const titles = state.story.titles;
      titles.stuntIncidents ||= [];
      const tick = finiteInteger(trick.tick ?? state.tick);
      const settlement = titles.stuntSettlement ||= { tick: -1, ids: [], watermark: -1 };
      let incident = titles.stuntIncidents.find(record => record.id === trick.episodeId);
      if (!incident && (tick < (settlement.watermark ?? -1) || settlement.ids?.includes(trick.episodeId))) return null;
      if (incident && tick > (incident.amendmentDeadline ?? incident.tick + 180)) return null;
      observeStuntWitnesses(state);
      const sampled = sampledStuntWitnesses(state, trick, { partial: true });
      const identity = incident || incidentIdentity(state, trick);
      const target = entityFor(state, trick.targetId);
      const fresh = !incident;
      if (!incident) {
        incident = { id: trick.episodeId, rootId: trick.rootId, tick, ...identity,
          sectorId: state.world?.currentSectorId ?? null, sourceName: trick.sourceName ?? root.sourceName ?? String(root.sourceId),
          targetName: trick.targetName ?? target?.data?.displayName ?? target?.name ?? String(trick.targetId),
          titleIds: [], witnessIds: [], witnesses: [], reportedNetworks: [], reports: [], barkStatus: 'unqualified',
          amendmentDeadline: trick.amendmentDeadline ?? Math.min(tick + 180, root.tick + 480) };
        appendBounded(titles.stuntIncidents, incident, STUNT_INCIDENT_LIMIT);
        settlement.ids ||= []; settlement.ids.push(trick.episodeId);
        if (settlement.ids.length > 128) settlement.ids.shift();
        settlement.tick = Math.max(settlement.tick, tick); settlement.watermark = Math.max(settlement.watermark ?? -1, tick - 480);
      }
      Object.assign(incident, { trickId: trick.trickId, name: cleanText(trick.name, humanizeId(trick.trickId)),
        consequence: { ...consequence }, modifiers: { ...trick.modifiers }, victimLives: (trick.victimLives || []).map(v => ({ ...v })).slice(0, 8),
        escaped: trick.pureEscape === true || consequence.escaped === true, materialCombat: !trick.pureEscape,
        threatEpisodeId: trick.threatEpisodeId ?? null, bankCorridorId: trick.bankCorridorId ?? trick.metrics?.bankCorridorId ?? null,
        chain: trick.causeChain.slice(0, 32).map(node => ({ ...node })), evidenceRevision: trick.evidenceRevision ?? null,
        outcome: consequence.killed ? 'destroyed' : trick.pureEscape || consequence.escaped ? 'escaped' : 'disabled' });
      for (const witness of sampled) {
        const prior = incident.witnesses.findIndex(w => w.identity === witness.identity);
        if (prior >= 0) {
          const old=incident.witnesses[prior];
          incident.witnesses[prior]={...witness,sourceTicks:Math.max(old.sourceTicks,witness.sourceTicks),
            transferTicks:Math.max(old.transferTicks,witness.transferTicks),payoffTicks:Math.max(old.payoffTicks,witness.payoffTicks),
            terminalLives:[...new Set([...(old.terminalLives||[]),...(witness.terminalLives||[])])].slice(0,8),
            transferCoverage:{...old.transferCoverage,...Object.fromEntries(Object.entries(witness.transferCoverage||{}).map(([id,n])=>[id,Math.max(n,old.transferCoverage?.[id]||0)]))}};
        }
        else if (incident.witnesses.length < 8) incident.witnesses.push(witness);
      }
      incident.witnessIds = incident.witnesses.filter(completeWitness).map(w => String(w.id));
      incident.visibility = incident.reportedNetworks.length ? 'reported' : incident.witnessIds.length ? 'witnessed' : 'black-box';
      const acquired = qualifyStuntTitles(state, incident, this.bus);
      sendWitnessReports(state, incident, this.bus);
      emit(this.bus, fresh ? 'story:stuntIncidentRecorded' : 'story:stuntIncidentUpdated', { incident, trick, acquired });
      boundStuntNarrative(state);
      return acquired[0] || null;
    },

    destroy() {
      if (this.bus && typeof this.bus.off === 'function') {
        if (this._onHold) this.bus.off('title:holdResolved', this._onHold);
        if (this._onDamage) this.bus.off('combat:damage', this._onDamage);
        if (this._onKilled) this.bus.off('entity:killed', this._onKilled);
        if (this._onSpawned) this.bus.off('entity:spawned', this._onSpawned);
        if (this._onSaveLoaded) this.bus.off('save:loaded', this._onSaveLoaded);
        if (this._onNewGame) this.bus.off('game:newGame', this._onNewGame);
        if (this._onTrickDetected) this.bus.off('stunt:trickDetected', this._onTrickDetected);
        if (this._onTrickDetected) this.bus.off('stunt:trickAmended', this._onTrickDetected);
        if (this._onNewGamePlus) this.bus.off('story:newGamePlusStarted', this._onNewGamePlus);
        if (this._onPodDelivered) this.bus.off('survivorPod:delivered', this._onPodDelivered);
        if (this._onPodResolved) this.bus.off('survivorPod:rescued', this._onPodResolved);
        if (this._onReleaseRatedEvt) this.bus.off('tether:releaseRated', this._onReleaseRatedEvt);
        if (this._onHeatChangedEvt) this.bus.off('heat:changed', this._onHeatChangedEvt);
      }
      this._onHold = this._onDamage = this._onKilled = this._onSpawned = this._onSaveLoaded = this._onNewGame = this._onTrickDetected = this._onNewGamePlus = null;
      this._onPodDelivered = this._onPodResolved = this._onReleaseRatedEvt = this._onHeatChangedEvt = null;
      this._activeEntityIds?.clear();
    },
  };
}

export const titlesSystem = createTitlesSystem();
