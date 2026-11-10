import { TraceLayer, finite } from './contracts.js';

const LAYERS = new Set(Object.values(TraceLayer));

export class ExplainabilityTrace {
  constructor({ capacity = 8192, enabled = true, layers = null } = {}) {
    this.enabled = enabled !== false;
    this.layers = Array.isArray(layers) ? new Set(layers) : null;
    if (!this.enabled) {
      this.capacity = 0;
      this.sequence = 0;
      this._buffer = [];
      this._start = 0;
      this._count = 0;
      return;
    }
    if (!Number.isInteger(capacity) || capacity < 64) throw new RangeError('trace capacity must be an integer >= 64');
    this.capacity = capacity;
    this.sequence = 0;
    this._buffer = new Array(capacity);
    this._start = 0;
    this._count = 0;
  }

  get size() { return this._count; }
  get entries() { return this._orderedEntries(); }

  emit({ tick, layer, entityId = null, squadId = null, decision, selected = null, candidates = [], context = {} }) {
    if (!LAYERS.has(layer)) throw new TypeError(`unknown AI trace layer: ${layer}`);
    if (!this.enabled || (this.layers && !this.layers.has(layer))) return null;
    if (typeof decision !== 'string' || !decision) throw new TypeError('trace decision is required');
    const entry = Object.freeze({
      version: 1,
      sequence: this.sequence++,
      tick: Number.isInteger(tick) ? tick : 0,
      layer,
      entityId,
      squadId,
      decision,
      selected: selected == null ? null : canonical(selected),
      candidates: Object.freeze(Array.isArray(candidates) ? candidates.map(canonical) : []),
      context: canonical(context),
    });
    let index;
    if (this._count < this.capacity) {
      index = (this._start + this._count) % this.capacity;
      this._count++;
    } else {
      index = this._start;
      this._start = (this._start + 1) % this.capacity;
    }
    this._buffer[index] = entry;
    return entry;
  }

  query({ sinceTick = -Infinity, untilTick = Infinity, layer = null, entityId = undefined, squadId = undefined, limit = 512 } = {}) {
    const boundedLimit = Number.isInteger(limit) && limit >= 0 ? limit : 512;
    const out = [];
    for (let logical = this._count - 1; logical >= 0 && out.length < boundedLimit; logical--) {
      const entry = this._at(logical);
      if (entry.tick < sinceTick || entry.tick > untilTick) continue;
      if (layer != null && entry.layer !== layer) continue;
      if (entityId !== undefined && entry.entityId !== entityId) continue;
      if (squadId !== undefined && entry.squadId !== squadId) continue;
      out.push(entry);
    }
    out.reverse();
    return Object.freeze(out);
  }

  latestForEntity(entityId) {
    const byLayer = {};
    for (let logical = this._count - 1; logical >= 0; logical--) {
      const entry = this._at(logical);
      if (entry.entityId !== entityId) continue;
      if (byLayer[entry.layer] == null) byLayer[entry.layer] = entry;
    }
    return Object.freeze(byLayer);
  }

  snapshot() {
    return Object.freeze({
      version: 1,
      enabled: this.enabled,
      layers: this.layers ? Object.freeze([...this.layers]) : null,
      capacity: this.capacity,
      nextSequence: this.sequence,
      entries: Object.freeze(this._orderedEntries()),
    });
  }

  clear() {
    this._buffer.fill(undefined);
    this._start = 0;
    this._count = 0;
  }

  _at(logicalIndex) {
    return this._buffer[(this._start + logicalIndex) % this.capacity];
  }

  _orderedEntries() {
    const out = new Array(this._count);
    for (let index = 0; index < this._count; index++) out[index] = this._at(index);
    return out;
  }
}

function canonical(value) {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return round6(finite(value, 0));
  if (Array.isArray(value)) return Object.freeze(value.map(canonical));
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
    return Object.freeze(out);
  }
  return String(value);
}

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}
