// Thunderchild cross-faction title authority (Depth Program S4).
//
// This system owns only state.story.titles and state.story.titlesSeen. It observes canonical combat
// events to produce deterministic title:holdResolved receipts, reduces those receipts, and exposes
// semantic events plus a small live-entity presentation stamp for morale/decal/news/Ledger readers.

import {
  PLAYER_DEED_BY_ID,
  PLAYER_DEED_BY_KILL_CAUSE,
  PLAYER_DEED_HOLDER_KEY,
  PLAYER_DEED_RECEIPT_LIMIT,
  THUNDERCHILD,
  THUNDERCHILD_TITLE_ID,
  TITLE_ACTIVE_HOLD_LIMIT,
  TITLE_CANDIDATE_LIMIT,
  TITLE_HISTORY_LIMIT,
  TITLE_PROCESSED_RECEIPT_LIMIT,
  TITLES_SCHEMA_VERSION,
  TITLES_SEEN_LIMIT,
} from '../data/titles.js';
import { isHostileForAI } from '../ai/engagementAuthority.js';

function finiteInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : fallback;
}

function cleanText(value, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
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

function freshPlayerDeedState() {
  return {
    earnedById: {},
    order: [],
    processedReceiptIds: [],
  };
}

function normalizePlayerDeedRecord(raw, deed) {
  if (!raw || typeof raw !== 'object' || !deed) return null;
  const receiptId = cleanText(raw.receiptId);
  if (!receiptId) return null;
  return {
    id: deed.id,
    title: deed.title,
    description: deed.description,
    earnedTick: finiteInteger(raw.earnedTick),
    receiptId,
    source: cleanText(raw.source, deed.trigger.event),
  };
}

function ensurePlayerDeeds(titles) {
  const source = titles.playerDeeds && typeof titles.playerDeeds === 'object'
    ? titles.playerDeeds : freshPlayerDeedState();
  const earnedById = {};
  for (const [id, raw] of Object.entries(source.earnedById && typeof source.earnedById === 'object'
    ? source.earnedById : {})) {
    const record = normalizePlayerDeedRecord(raw, PLAYER_DEED_BY_ID[id]);
    if (record) earnedById[id] = record;
  }
  const order = [];
  const seen = new Set();
  for (const id of Array.isArray(source.order) ? source.order : []) {
    if (!earnedById[id] || seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  const missing = Object.keys(earnedById).filter((id) => !seen.has(id));
  missing.sort((left, right) => earnedById[left].earnedTick - earnedById[right].earnedTick
    || left.localeCompare(right));
  order.push(...missing);
  titles.playerDeeds = {
    earnedById,
    order,
    processedReceiptIds: boundedTail(source.processedReceiptIds, PLAYER_DEED_RECEIPT_LIMIT)
      .map((id) => cleanText(id)).filter(Boolean),
  };
  return titles.playerDeeds;
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
  ensurePlayerDeeds(titles);

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

  story.titlesSeen = boundedTail(story.titlesSeen, TITLES_SEEN_LIMIT)
    .filter((record) => record && typeof record === 'object')
    .map((record) => ({
      id: cleanText(record.id),
      title: cleanText(record.title, THUNDERCHILD.title),
      seenAt: finiteInteger(record.seenAt),
      holderKey: cleanText(record.holderKey),
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
  return Array.isArray(state.entityList) ? state.entityList.find((entity) => entity && entity.id === id) || null : null;
}

function entityForHolder(state, holderKey) {
  if (!holderKey || !state) return null;
  const entities = Array.isArray(state.entityList)
    ? state.entityList
    : state.entities && typeof state.entities.values === 'function' ? [...state.entities.values()] : [];
  return entities.find((entity) => entity && entity.alive !== false
    && entity.data && entity.data.worldRecordId === holderKey) || null;
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
  if (Array.isArray(state && state.entityList)) return state.entityList;
  return state && state.entities && typeof state.entities.values === 'function'
    ? [...state.entities.values()] : [];
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
  if (!data || data.titleId !== THUNDERCHILD_TITLE_ID) return;
  delete data.titleId;
  delete data.titleName;
  delete data.titleKillMarks;
}

function stampTitle(entity, own) {
  if (!entity) return;
  const data = entity.data || (entity.data = {});
  data.titleId = THUNDERCHILD_TITLE_ID;
  data.titleName = THUNDERCHILD.title;
  data.titleKillMarks = own.killMarks;
}

function syncTitleStamp(state, own) {
  for (const entity of liveEntities(state)) {
    if (own.status === 'held' && holderKeyOf(entity) === own.holderKey && entity.alive !== false) {
      stampTitle(entity, own);
    } else {
      clearTitleStamp(entity);
    }
  }
}

function syncPlayerDeedStamp(state) {
  if (!state) return;
  const titles = state.story && state.story.titles;
  const deeds = titles && titles.playerDeeds ? titles.playerDeeds : ensurePlayerDeeds(titles || {});
  const player = entityFor(state, state.playerId);
  if (!player) return;
  const data = player.data || (player.data = {});
  const ids = deeds.order.filter((id) => deeds.earnedById[id]);
  if (!ids.length) {
    delete data.deedTitleIds;
    delete data.deedTitleName;
    return;
  }
  data.deedTitleIds = ids.slice();
  data.deedTitleName = deeds.earnedById[ids[ids.length - 1]].title;
}

function playerDeedSeenRecord(record) {
  return {
    id: record.id,
    title: record.title,
    seenAt: record.earnedTick,
    holderKey: PLAYER_DEED_HOLDER_KEY,
  };
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

function titleSeenRecord(own) {
  return {
    id: `${THUNDERCHILD_TITLE_ID}:${own.successionCount}:${own.holderKey}`,
    title: THUNDERCHILD.title,
    seenAt: own.earnedTick,
    holderKey: own.holderKey,
  };
}

function earnedEvent(own, receiptId) {
  return {
    titleId: THUNDERCHILD_TITLE_ID,
    title: THUNDERCHILD.title,
    holderKey: own.holderKey,
    holder: cloneHolder(own.holder),
    earnedTick: own.earnedTick,
    killMarks: own.killMarks,
    successionCount: own.successionCount,
    receiptId,
  };
}

export function createTitlesSystem() {
  return {
    name: 'titles',

    init(ctx) {
      this.state = ctx && ctx.state;
      this.bus = ctx && ctx.bus;
      this._holderEntityId = null;
      this._activeEntityIds = new Map();
      ensureState(this.state);
      this._onHold = (payload) => this._onHoldResolved(payload || {});
      this._onDamage = (payload) => this._onCombatDamage(payload || {});
      this._onKilled = (payload) => this._onEntityKilled(payload || {});
      this._onSpawned = (payload) => this._onEntitySpawned(payload || {});
      this._onHeavyPartDetached = (payload) => this._onHeavyPartDetachedReceipt(payload || {});
      this._onTetherLatched = (payload) => this._onTetherLatchedReceipt(payload || {});
      this._onSaveLoaded = () => this._rebindSilently();
      this._onNewGame = () => this.newGame();
      this._onNewGamePlus = (payload) => this.applyNewGamePlusLegacy(payload && payload.titles);
      if (this.bus && typeof this.bus.on === 'function') {
        this.bus.on('title:holdResolved', this._onHold);
        this.bus.on('combat:damage', this._onDamage);
        this.bus.on('entity:killed', this._onKilled);
        this.bus.on('entity:spawned', this._onSpawned);
        this.bus.on('heavyPart:detached', this._onHeavyPartDetached);
        this.bus.on('tether:latched', this._onTetherLatched);
        this.bus.on('save:loaded', this._onSaveLoaded);
        this.bus.on('game:newGame', this._onNewGame);
        this.bus.on('story:newGamePlusStarted', this._onNewGamePlus);
      }
      this._rebindSilently();
    },

    newGame() {
      if (!this.state) return;
      if (!this.state.story || typeof this.state.story !== 'object') this.state.story = {};
      this.state.story.titles = {
        schemaVersion: TITLES_SCHEMA_VERSION,
        byId: { [THUNDERCHILD_TITLE_ID]: freshThunderchildState() },
        playerDeeds: freshPlayerDeedState(),
      };
      this.state.story.titlesSeen = [];
      this._holderEntityId = null;
      this._activeEntityIds.clear();
      syncTitleStamp(this.state, ensureState(this.state));
      syncPlayerDeedStamp(this.state);
    },

    /** Carry only player-earned deed titles into New Run+. Cross-faction holder succession remains
     * a property of the newly seeded world and is intentionally rebuilt from live combat. */
    applyNewGamePlusLegacy(legacy) {
      const raw = legacy && legacy.playerDeeds;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 0;
      ensureState(this.state);
      this.state.story.titles.playerDeeds = {
        earnedById: raw.earnedById && typeof raw.earnedById === 'object' ? { ...raw.earnedById } : {},
        order: Array.isArray(raw.order) ? raw.order.slice(0, 64) : [],
        processedReceiptIds: Array.isArray(raw.processedReceiptIds)
          ? raw.processedReceiptIds.slice(-PLAYER_DEED_RECEIPT_LIMIT) : [],
      };
      const deeds = ensurePlayerDeeds(this.state.story.titles);
      syncPlayerDeedStamp(this.state);
      const count = deeds.order.length;
      emit(this.bus, 'title:newGamePlusApplied', { count });
      return count;
    },

    update(_dt, state = this.state) {
      if (state) this.state = state;
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
      this._activeEntityIds.clear();
      for (const candidate of liveEntities(this.state)) {
        const holderKey = holderKeyOf(candidate);
        if (holderKey && own.activeHolds[holderKey] && candidate.alive !== false) {
          this._activeEntityIds.set(holderKey, candidate.id);
        }
      }
      syncTitleStamp(this.state, own);
      syncPlayerDeedStamp(this.state);
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
        stampTitle(entity, own);
      } else {
        clearTitleStamp(entity);
      }
      if (holderKey && own.activeHolds[holderKey] && entity.alive !== false) {
        this._activeEntityIds.set(holderKey, entity.id);
      }
      if (entity.id === (this.state && this.state.playerId)) syncPlayerDeedStamp(this.state);
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
      stampTitle(entityFor(this.state, transientEntityId), own);

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

    _awardPlayerDeed(deed, receiptId, source) {
      if (!deed || !this.state) return null;
      ensureState(this.state);
      const own = this.state.story.titles.playerDeeds;
      const cleanReceiptId = cleanText(receiptId);
      if (!cleanReceiptId || own.processedReceiptIds.includes(cleanReceiptId)
        || own.earnedById[deed.id]) return null;
      appendBounded(own.processedReceiptIds, cleanReceiptId, PLAYER_DEED_RECEIPT_LIMIT);
      const record = {
        id: deed.id,
        title: deed.title,
        description: deed.description,
        earnedTick: finiteInteger(this.state.tick),
        receiptId: cleanReceiptId,
        source: cleanText(source, deed.trigger.event),
      };
      own.earnedById[deed.id] = record;
      own.order.push(deed.id);
      this.state.story.titlesSeen = this.state.story.titlesSeen
        .filter((entry) => entry && entry.id !== deed.id);
      appendBounded(this.state.story.titlesSeen, playerDeedSeenRecord(record), TITLES_SEEN_LIMIT);
      syncPlayerDeedStamp(this.state);

      const event = {
        kind: 'player_deed',
        titleId: deed.id,
        title: deed.title,
        description: deed.description,
        holderKey: PLAYER_DEED_HOLDER_KEY,
        earnedTick: record.earnedTick,
        receiptId: cleanReceiptId,
        source: record.source,
      };
      emit(this.bus, 'title:earned', event);
      emit(this.bus, 'toast', {
        text: `TITLE EARNED · ${deed.title} — ${deed.description}`,
        kind: 'success',
        ttl: 5,
      });
      return event;
    },

    _awardKillDeed(payload) {
      if (!payload || payload.killerId !== (this.state && this.state.playerId)) return null;
      const killCause = cleanText(payload.presentation && payload.presentation.style
        && payload.presentation.style.id);
      const deed = PLAYER_DEED_BY_KILL_CAUSE[killCause];
      if (!deed) return null;
      const victimId = payload.id != null ? payload.id : payload.entityId;
      const receiptId = cleanText(payload.receiptId,
        `deed:kill:${finiteInteger(this.state && this.state.tick)}:${victimId}:${killCause}`);
      return this._awardPlayerDeed(deed, receiptId, `kill:${killCause}`);
    },

    _onHeavyPartDetachedReceipt(payload) {
      if (!payload || payload.attackerId !== (this.state && this.state.playerId)) return null;
      const parent = entityFor(this.state, payload.parentId);
      if (!parent || parent.alive === false || parent.data?.heavyDisabled !== true
        || parent.data?.towable !== true) return null;
      const deed = PLAYER_DEED_BY_ID.deed_yardhand;
      const receiptId = `deed:heavy-strip:${payload.parentId}:${cleanText(payload.partId, payload.entityId)}:${finiteInteger(this.state.tick)}`;
      return this._awardPlayerDeed(deed, receiptId, 'heavy_strip');
    },

    _onTetherLatchedReceipt(payload) {
      const target = entityFor(this.state, payload && payload.targetId);
      if (!target || target.alive === false || target.data?.heavyDisabled !== true
        || target.data?.towable !== true) return null;
      const deed = PLAYER_DEED_BY_ID.deed_linehauler;
      const receiptId = `deed:heavy-tow:${target.id}:${finiteInteger(this.state.tick)}`;
      return this._awardPlayerDeed(deed, receiptId, 'heavy_tow');
    },

    _onEntityKilled(payload) {
      this._awardKillDeed(payload);
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
      stampTitle(killer, own);
      emit(this.bus, 'title:killMarksChanged', event);
      return event;
    },

    _succeedOrVacate(own) {
      const previousHolderKey = own.holderKey;
      const previousHolder = cloneHolder(own.holder);
      const tick = finiteInteger(this.state && this.state.tick);
      const successor = own.candidates.sort(compareThunderchildCandidates)[0] || null;
      own.successionCount += 1;
      own.killMarks = 0;

      if (successor) {
        own.status = 'held';
        own.holderKey = successor.holderKey;
        own.holder = cloneHolder(successor.holder);
        own.earnedTick = tick;
        own.candidates = own.candidates.filter((entry) => entry.holderKey !== successor.holderKey);
        const liveSuccessor = entityForHolder(this.state, own.holderKey);
        this._holderEntityId = liveSuccessor ? liveSuccessor.id : null;
      } else {
        own.status = 'vacant';
        own.holderKey = null;
        own.holder = null;
        own.earnedTick = 0;
        this._holderEntityId = null;
      }
      syncTitleStamp(this.state, own);

      const receiptId = `title:succession:${own.successionCount}:${own.holderKey || 'vacant'}`;
      appendBounded(own.history, {
        kind: successor ? 'succession' : 'vacant',
        tick,
        previousHolderKey,
        holderKey: own.holderKey,
        receiptId,
      }, TITLE_HISTORY_LIMIT);
      if (successor) appendBounded(this.state.story.titlesSeen, titleSeenRecord(own), TITLES_SEEN_LIMIT);

      const succession = {
        titleId: THUNDERCHILD_TITLE_ID,
        title: THUNDERCHILD.title,
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
        titleId: THUNDERCHILD_TITLE_ID,
        title: THUNDERCHILD.title,
        previousHolderKey,
        holderKey: own.holderKey,
        holder: cloneHolder(own.holder),
        active: !!successor,
        tick,
        reason: 'holder_killed',
      });
      emit(this.bus, 'news:publish', successor ? {
        text: `${THUNDERCHILD.news.successionPrefix}${own.holder.displayName}${THUNDERCHILD.news.successionSuffix}`,
        kind: 'title_succession',
        titleId: THUNDERCHILD_TITLE_ID,
        holderKey: own.holderKey,
        previousHolderKey,
        channelId: 'news',
        receiptId,
      } : {
        text: THUNDERCHILD.news.vacant,
        kind: 'title_vacant',
        titleId: THUNDERCHILD_TITLE_ID,
        holderKey: null,
        previousHolderKey,
        channelId: 'news',
        receiptId,
      });
      return succession;
    },

    destroy() {
      if (this.bus && typeof this.bus.off === 'function') {
        if (this._onHold) this.bus.off('title:holdResolved', this._onHold);
        if (this._onDamage) this.bus.off('combat:damage', this._onDamage);
        if (this._onKilled) this.bus.off('entity:killed', this._onKilled);
        if (this._onSpawned) this.bus.off('entity:spawned', this._onSpawned);
        if (this._onHeavyPartDetached) this.bus.off('heavyPart:detached', this._onHeavyPartDetached);
        if (this._onTetherLatched) this.bus.off('tether:latched', this._onTetherLatched);
        if (this._onSaveLoaded) this.bus.off('save:loaded', this._onSaveLoaded);
        if (this._onNewGame) this.bus.off('game:newGame', this._onNewGame);
        if (this._onNewGamePlus) this.bus.off('story:newGamePlusStarted', this._onNewGamePlus);
      }
      this._onHold = this._onDamage = this._onKilled = this._onSpawned = null;
      this._onHeavyPartDetached = this._onTetherLatched = null;
      this._onSaveLoaded = this._onNewGame = null;
      this._onNewGamePlus = null;
      this._activeEntityIds.clear();
    },
  };
}

export const titlesSystem = createTitlesSystem();
