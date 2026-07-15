// Thunderchild cross-faction title reducer (Depth Program S4 groundwork).
//
// This system owns only state.story.titles and state.story.titlesSeen. It consumes explicit
// title:holdResolved receipts and canonical entity:killed events, then exposes semantic events for
// future morale, decal, ticker, and ledger integration. No consumer is required for this reducer to
// remain deterministic and save-safe.

import {
  THUNDERCHILD,
  THUNDERCHILD_TITLE_ID,
  TITLE_CANDIDATE_LIMIT,
  TITLE_HISTORY_LIMIT,
  TITLE_PROCESSED_RECEIPT_LIMIT,
  TITLES_SCHEMA_VERSION,
  TITLES_SEEN_LIMIT,
} from '../data/titles.js';

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
    candidates: [],
    history: [],
    processedReceiptIds: [],
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
  return candidate.hostileOutcomes >= THUNDERCHILD.minHostileOutcomes;
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
      ensureState(this.state);
      if (this.bus && typeof this.bus.on === 'function') {
        this.bus.on('title:holdResolved', (payload) => this._onHoldResolved(payload || {}));
        this.bus.on('entity:killed', (payload) => this._onEntityKilled(payload || {}));
        this.bus.on('save:loaded', () => this._rebindSilently());
        this.bus.on('game:newGame', () => this.newGame());
      }
      this._rebindSilently();
    },

    newGame() {
      if (!this.state) return;
      if (!this.state.story || typeof this.state.story !== 'object') this.state.story = {};
      this.state.story.titles = {
        schemaVersion: TITLES_SCHEMA_VERSION,
        byId: { [THUNDERCHILD_TITLE_ID]: freshThunderchildState() },
      };
      this.state.story.titlesSeen = [];
      this._holderEntityId = null;
    },

    update() {},

    _rebindSilently() {
      const own = ensureState(this.state);
      const entity = own.status === 'held' ? entityForHolder(this.state, own.holderKey) : null;
      this._holderEntityId = entity ? entity.id : null;
    },

    _onHoldResolved(payload) {
      const own = ensureState(this.state);
      const receiptId = cleanText(payload.receiptId);
      if (!rememberReceipt(own, receiptId)) return null;
      const entity = entityFor(this.state, payload.entityId);
      const candidate = normalizedReceipt(payload, entity);
      if (!qualifies(payload, candidate)) return null;

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
      const own = ensureState(this.state);
      if (own.status !== 'held') return null;
      const victimId = payload.id != null ? payload.id : payload.entityId;
      const victim = entityFor(this.state, victimId);
      const victimKey = holderKeyOf(victim);
      const holderDied = victimKey === own.holderKey
        || (victimKey === '' && victimId != null && victimId === this._holderEntityId);
      if (holderDied) return this._succeedOrVacate(own, payload);
      if (victimKey) own.candidates = own.candidates.filter((candidate) => candidate.holderKey !== victimKey);

      const killer = entityFor(this.state, payload.killerId);
      if (holderKeyOf(killer) !== own.holderKey) return null;
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
  };
}

export const titlesSystem = createTitlesSystem();
