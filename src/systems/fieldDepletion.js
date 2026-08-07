// fieldDepletion.js - BP-02 FIELD-MEMORY backend ledger.
//
// Event-sourced mining memory: asteroid destruction in a field raises a durable depletion scalar,
// and slow recovery lets belts heal over time. World already consumes field:depletedChanged.

const STATE_VERSION = 1;
export const FIELD_DEPLETION_PER_YIELD_U = 0.0025;
export const FIELD_DEPLETION_MAX_DELTA = 0.08;
export const FIELD_DEPLETION_RECOVERY_PER_S = 1 / (45 * 60);
export const FIELD_DEPLETION_RECOVERY_STEP_S = 5;
export const FIELD_DEPLETION_MAX_RECEIPTS = 24;

function freshState() {
  return { schemaVersion: STATE_VERSION, fields: {}, receipts: [] };
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function round6(value) {
  return Math.round((Number(value) || 0) * 1e6) / 1e6;
}

function fieldIdOf(value) {
  if (value == null || value === '') return null;
  return String(value);
}

function sectorIdOf(state, payload = {}) {
  return payload.sectorId || (state && state.world && state.world.currentSectorId) || null;
}

function entityFor(state, id) {
  if (id == null || !state || !state.entities || typeof state.entities.get !== 'function') return null;
  return state.entities.get(id) || null;
}

export function ensureFieldDepletionState(state) {
  if (!state) return null;
  if (!state.fieldDepletion || typeof state.fieldDepletion !== 'object') {
    state.fieldDepletion = freshState();
  }
  const own = state.fieldDepletion;
  own.schemaVersion = STATE_VERSION;
  if (!own.fields || typeof own.fields !== 'object' || Array.isArray(own.fields)) own.fields = {};
  if (!Array.isArray(own.receipts)) own.receipts = [];
  return own;
}

function normalizeFieldRecord(input, fieldId) {
  const rec = input && typeof input === 'object' ? input : {};
  const depletion = clamp01(rec.depletion);
  return {
    fieldId,
    sectorId: rec.sectorId || null,
    extractedU: round6(Math.max(0, Number(rec.extractedU) || 0)),
    destroyedCount: Math.max(0, Math.floor(Number(rec.destroyedCount) || 0)),
    depletion,
    richnessMult: richnessMultiplierForDepletion(depletion),
    lastChangedT: round6(Math.max(0, Number(rec.lastChangedT) || 0)),
  };
}

function fieldRecord(own, fieldId, sectorId = null) {
  let rec = own.fields[fieldId];
  if (!rec || typeof rec !== 'object') {
    rec = normalizeFieldRecord({ sectorId }, fieldId);
    own.fields[fieldId] = rec;
  } else {
    rec = normalizeFieldRecord({ ...rec, sectorId: rec.sectorId || sectorId }, fieldId);
    own.fields[fieldId] = rec;
  }
  return rec;
}

export function depletionDeltaForYield(units) {
  const u = Math.max(0, Number(units) || 0);
  return round6(Math.min(FIELD_DEPLETION_MAX_DELTA, u * FIELD_DEPLETION_PER_YIELD_U));
}

export function richnessMultiplierForDepletion(depletion) {
  return round6(1 - clamp01(depletion) * 0.55);
}

export function fieldMemoryBand(depletion) {
  const d = clamp01(depletion);
  if (d >= 0.72) return 'depleted';
  if (d >= 0.42) return 'thin';
  if (d >= 0.12) return 'worked';
  return 'rich';
}

export function fieldMemoryReadout(state, fieldId) {
  const own = ensureFieldDepletionState(state);
  const id = fieldIdOf(fieldId);
  const rec = id && own.fields[id] ? normalizeFieldRecord(own.fields[id], id) : normalizeFieldRecord({}, id || '');
  const band = fieldMemoryBand(rec.depletion);
  return {
    fieldId: id,
    sectorId: rec.sectorId,
    depletion: rec.depletion,
    richnessMult: rec.richnessMult,
    extractedU: rec.extractedU,
    destroyedCount: rec.destroyedCount,
    band,
    label: band === 'rich' ? 'Rich field' : band === 'worked' ? 'Worked field' : band === 'thin' ? 'Thinning field' : 'Depleted field',
  };
}

export function recordFieldExtraction(state, payload = {}) {
  const fieldId = fieldIdOf(payload.fieldId);
  if (!fieldId) return null;
  const own = ensureFieldDepletionState(state);
  const sectorId = sectorIdOf(state, payload);
  const simTime = round6(payload.simTime != null ? payload.simTime : state && state.simTime);
  const extractedU = Math.max(0, Number(payload.extractedU != null ? payload.extractedU : payload.yieldU) || 0);
  const delta = depletionDeltaForYield(extractedU);
  const destroyed = payload.destroyed !== false;
  const rec = fieldRecord(own, fieldId, sectorId);
  rec.sectorId = rec.sectorId || sectorId;
  rec.extractedU = round6(rec.extractedU + extractedU);
  if (destroyed) rec.destroyedCount += 1;
  rec.depletion = clamp01(round6(rec.depletion + delta));
  rec.richnessMult = richnessMultiplierForDepletion(rec.depletion);
  rec.lastChangedT = simTime;

  const receipt = {
    event: payload.event || (destroyed ? 'asteroid_destroyed' : 'field_extraction'),
    fieldId,
    sectorId: rec.sectorId,
    extractedU: round6(extractedU),
    delta,
    depleted: rec.depletion,
    richnessMult: rec.richnessMult,
    asteroidId: payload.asteroidId == null ? null : payload.asteroidId,
    source: payload.source || null,
    jobId: payload.jobId || null,
    tick: Math.max(0, Math.floor(Number(payload.tick) || (state && state.tick) || 0)),
    t: simTime,
  };
  own.receipts.push(receipt);
  if (own.receipts.length > FIELD_DEPLETION_MAX_RECEIPTS) {
    own.receipts.splice(0, own.receipts.length - FIELD_DEPLETION_MAX_RECEIPTS);
  }
  return { ...rec, delta, receipt };
}

export function recoverFieldDepletion(state, dt) {
  const own = ensureFieldDepletionState(state);
  const elapsed = Math.max(0, Number(dt) || 0);
  const recovery = elapsed * FIELD_DEPLETION_RECOVERY_PER_S;
  if (recovery <= 0) return [];
  const changed = [];
  const now = round6(state && state.simTime);
  for (const fieldId of Object.keys(own.fields)) {
    const rec = fieldRecord(own, fieldId);
    if (rec.depletion <= 0) continue;
    const before = rec.depletion;
    rec.depletion = clamp01(round6(rec.depletion - recovery));
    rec.richnessMult = richnessMultiplierForDepletion(rec.depletion);
    rec.lastChangedT = now;
    if (rec.depletion !== before) changed.push({ ...rec, delta: round6(rec.depletion - before) });
  }
  return changed;
}

function clonePlain(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export const fieldDepletion = {
  name: 'fieldDepletion',

  init(ctx) {
    this.state = ctx && ctx.state;
    this.bus = ctx && ctx.bus;
    this._recoveryAccum = 0;
    ensureFieldDepletionState(this.state);
    this._onDestroyed = (payload) => this._onAsteroidDestroyed(payload || {});
    this._onNpcExtraction = (payload) => this._onNpcMinerExtraction(payload || {});
    this._onNewGame = () => this.newGame();
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('asteroid:destroyed', this._onDestroyed);
      this.bus.on('mining:npcExtraction', this._onNpcExtraction);
      this.bus.on('game:newGame', this._onNewGame);
    }
  },

  newGame() {
    if (this.state) this.state.fieldDepletion = freshState();
    this._recoveryAccum = 0;
  },

  update(dt, state) {
    this._recoveryAccum = (this._recoveryAccum || 0) + Math.max(0, Number(dt) || 0);
    if (this._recoveryAccum < FIELD_DEPLETION_RECOVERY_STEP_S) return;
    const elapsed = this._recoveryAccum;
    this._recoveryAccum = 0;
    const changed = recoverFieldDepletion(state, elapsed);
    const currentSectorId = state && state.world && state.world.currentSectorId;
    for (const rec of changed) {
      if (!rec || rec.sectorId !== currentSectorId) continue;
      this._emitChanged(rec, 'recovery');
    }
  },

  _onAsteroidDestroyed(payload) {
    const state = this.state;
    const asteroidId = payload.id != null ? payload.id : payload.asteroidId != null ? payload.asteroidId : payload.entityId;
    const entity = entityFor(state, asteroidId);
    const data = entity && entity.data || {};
    const fieldId = fieldIdOf(payload.fieldId || data.fieldId);
    if (!fieldId) return null;
    const rec = recordFieldExtraction(state, {
      fieldId,
      sectorId: payload.sectorId || data.sectorId || sectorIdOf(state, payload),
      extractedU: data.yieldU != null ? data.yieldU : data.bulkMassU != null ? data.bulkMassU : payload.yieldU,
      asteroidId,
      simTime: state && state.simTime,
      tick: state && state.tick,
    });
    if (rec) this._emitChanged(rec, 'asteroid_destroyed');
    return rec;
  },

  _onNpcMinerExtraction(payload) {
    const fieldId = fieldIdOf(payload.fieldId);
    const extractedU = Math.max(0, Number(payload.extractedU) || 0);
    if (!fieldId || extractedU <= 0) return null;
    const rec = recordFieldExtraction(this.state, {
      fieldId,
      sectorId: payload.sectorId || sectorIdOf(this.state, payload),
      extractedU,
      asteroidId: payload.asteroidId,
      simTime: this.state && this.state.simTime,
      tick: this.state && this.state.tick,
      destroyed: false,
      event: 'npc_mining',
      source: 'traffic_npc_job',
      jobId: payload.jobId || null,
    });
    if (rec) this._emitChanged(rec, 'npc_mining', {
      source: 'traffic_npc_job',
      minerId: payload.minerId == null ? null : payload.minerId,
      jobId: payload.jobId || null,
    });
    return rec;
  },

  _emitChanged(rec, reason, context = null) {
    if (!this.bus || typeof this.bus.emit !== 'function') return false;
    const payload = {
      fieldId: rec.fieldId,
      sectorId: rec.sectorId || null,
      depleted: rec.depletion,
      richnessMult: rec.richnessMult,
      extractedU: rec.extractedU,
      destroyedCount: rec.destroyedCount,
      reason,
      source: context && context.source || null,
      minerId: context && context.minerId != null ? context.minerId : null,
      jobId: context && context.jobId || null,
    };
    this.bus.emit('fieldDepletion:changed', payload);
    this.bus.emit('field:depletedChanged', payload);
    return true;
  },

  serialize() {
    const own = ensureFieldDepletionState(this.state);
    const fields = {};
    for (const fieldId of Object.keys(own.fields).sort()) {
      const rec = normalizeFieldRecord(own.fields[fieldId], fieldId);
      if (rec.depletion > 0 || rec.extractedU > 0 || rec.destroyedCount > 0) fields[fieldId] = rec;
    }
    return {
      schemaVersion: STATE_VERSION,
      fields,
      receipts: clonePlain(own.receipts.slice(-FIELD_DEPLETION_MAX_RECEIPTS)),
    };
  },

  deserialize(data) {
    const own = ensureFieldDepletionState(this.state);
    own.fields = {};
    const fields = data && data.fields && typeof data.fields === 'object' ? data.fields : {};
    for (const fieldId of Object.keys(fields)) {
      own.fields[fieldId] = normalizeFieldRecord(fields[fieldId], fieldId);
    }
    own.receipts = Array.isArray(data && data.receipts)
      ? clonePlain(data.receipts).slice(-FIELD_DEPLETION_MAX_RECEIPTS)
      : [];
    own.schemaVersion = STATE_VERSION;
    this._recoveryAccum = 0;
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onDestroyed) this.bus.off('asteroid:destroyed', this._onDestroyed);
      if (this._onNpcExtraction) this.bus.off('mining:npcExtraction', this._onNpcExtraction);
      if (this._onNewGame) this.bus.off('game:newGame', this._onNewGame);
    }
    this._onDestroyed = this._onNpcExtraction = this._onNewGame = null;
  },
};

export default fieldDepletion;
