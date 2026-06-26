// Uniform-grid spatial hash for broad-phase collision and radius queries (ARCHITECTURE §0.16).
// Static colliders live in a cached layer; only dynamic bodies need per-step cell churn.

export class SpatialHash {
  constructor(cell = 64) {
    this.cell = cell;
    this.buckets = new Map(); // dynamic/full layer: cx -> Map<cz, Entity[]>
    this._activeBuckets = [];
    this._activeCellX = [];
    this._activeCellZ = [];
    this._staticBuckets = new Map();
    this._staticActiveBuckets = [];
    this._staticActiveCellX = [];
    this._staticActiveCellZ = [];
    this._staticVersion = null;
    this._seenIds = new Map();
    this._queryStamp = 1;
    this._pending = { rebuilds: 0, dynamicRebuilds: 0, queries: 0, candidates: 0 };
    this.diagnostics = {
      rebuilds: 0,
      dynamicRebuilds: 0,
      queries: 0,
      candidates: 0,
      activeBuckets: 0,
      staticBuckets: 0,
      dynamicBuckets: 0,
    };
  }

  clear() {
    this._clearDynamicLayer();
    this._clearStaticLayer();
    this._staticVersion = null;
    this._updateActiveDiagnostics();
  }

  deactivate() {
    this.clear();
    this.diagnostics.activeBuckets = 0;
  }

  insert(e) {
    this._insertInto(this.buckets, this._activeBuckets, this._activeCellX, this._activeCellZ, e);
  }

  _insertStatic(e) {
    this._insertInto(this._staticBuckets, this._staticActiveBuckets, this._staticActiveCellX, this._staticActiveCellZ, e);
  }

  _insertInto(buckets, activeBuckets, activeCellX, activeCellZ, e) {
    const c = this.cell;
    const r = e.radius || 0;
    const x0 = Math.floor((e.pos.x - r) / c), x1 = Math.floor((e.pos.x + r) / c);
    const z0 = Math.floor((e.pos.z - r) / c), z1 = Math.floor((e.pos.z + r) / c);
    for (let cx = x0; cx <= x1; cx++) {
      let row = buckets.get(cx);
      if (!row) { row = new Map(); buckets.set(cx, row); }
      for (let cz = z0; cz <= z1; cz++) {
        let b = row.get(cz);
        if (!b) { b = []; row.set(cz, b); }
        if (b.length === 0) {
          activeBuckets.push(b);
          activeCellX.push(cx);
          activeCellZ.push(cz);
        }
        b.push(e);
      }
    }
  }

  rebuild(entityList) {
    this.clear();
    this._pending.rebuilds++;
    this.diagnostics.rebuilds++;
    for (const e of entityList) {
      if (e.alive && e.collides) this.insert(e);
    }
    this._updateActiveDiagnostics();
  }

  rebuildLayers(staticEntities = [], dynamicEntities = [], staticVersion = 0) {
    if (this._staticVersion !== staticVersion) {
      this._clearStaticLayer();
      for (const e of staticEntities) {
        if (e.alive && e.collides) this._insertStatic(e);
      }
      this._staticVersion = staticVersion;
      this._pending.rebuilds++;
      this.diagnostics.rebuilds++;
    }

    this._clearDynamicLayer();
    for (const e of dynamicEntities) {
      if (e.alive && e.collides) this.insert(e);
    }
    this._pending.dynamicRebuilds++;
    this.diagnostics.dynamicRebuilds++;
    this._updateActiveDiagnostics();
  }

  /** Collect entities whose cells overlap the circle (x,z,r). Dedupes by id. */
  queryRadius(x, z, r, out = [], opts = null) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    const seen = this._seenIds;
    let stamp = this._queryStamp + 1;
    if (stamp > 0x7fffffff) {
      stamp = 1;
      seen.clear();
    }
    this._queryStamp = stamp;
    let candidates = 0;
    const activeCount = this._activeBuckets.length + this._staticActiveBuckets.length;
    const cellSpanX = x1 - x0 + 1;
    const cellSpanZ = z1 - z0 + 1;
    const rectangularVisits = cellSpanX * cellSpanZ;
    const scanActive = activeCount > 0 && rectangularVisits > activeCount * 3;
    candidates += this._queryLayer(this.buckets, this._activeBuckets, this._activeCellX, this._activeCellZ,
      scanActive, x0, x1, z0, z1, stamp, out);
    candidates += this._queryLayer(this._staticBuckets, this._staticActiveBuckets, this._staticActiveCellX, this._staticActiveCellZ,
      scanActive, x0, x1, z0, z1, stamp, out);
    if (!(opts && opts.countDiagnostics === false)) {
      this._pending.queries++;
      this._pending.candidates += candidates;
      this.diagnostics.queries++;
      this.diagnostics.candidates += candidates;
    }
    return out;
  }

  _queryLayer(buckets, activeBuckets, activeCellX, activeCellZ, scanActive, x0, x1, z0, z1, stamp, out) {
    let candidates = 0;
    const seen = this._seenIds;
    if (scanActive) {
      for (let i = 0; i < activeBuckets.length; i++) {
        const cx = activeCellX[i];
        if (cx < x0 || cx > x1) continue;
        const cz = activeCellZ[i];
        if (cz < z0 || cz > z1) continue;
        const b = activeBuckets[i];
        candidates += b.length;
        for (const e of b) {
          if (seen.get(e.id) === stamp) continue;
          seen.set(e.id, stamp);
          out.push(e);
        }
      }
      return candidates;
    }
    for (let cx = x0; cx <= x1; cx++) {
      const row = buckets.get(cx);
      if (!row) continue;
      for (let cz = z0; cz <= z1; cz++) {
        const b = row.get(cz);
        if (!b) continue;
        candidates += b.length;
        for (const e of b) {
          if (seen.get(e.id) === stamp) continue;
          seen.set(e.id, stamp);
          out.push(e);
        }
      }
    }
    return candidates;
  }

  _clearDynamicLayer() {
    for (const bucket of this._activeBuckets) bucket.length = 0;
    this._activeBuckets.length = 0;
    this._activeCellX.length = 0;
    this._activeCellZ.length = 0;
  }

  _clearStaticLayer() {
    for (const bucket of this._staticActiveBuckets) bucket.length = 0;
    this._staticActiveBuckets.length = 0;
    this._staticActiveCellX.length = 0;
    this._staticActiveCellZ.length = 0;
  }

  _updateActiveDiagnostics() {
    this.diagnostics.dynamicBuckets = this._activeBuckets.length;
    this.diagnostics.staticBuckets = this._staticActiveBuckets.length;
    this.diagnostics.activeBuckets = this.diagnostics.dynamicBuckets + this.diagnostics.staticBuckets;
  }

  flushPerfCounters(perfRuntime) {
    const p = this._pending;
    if (!perfRuntime || typeof perfRuntime.recordSpatialHash !== 'function') {
      p.rebuilds = 0; p.dynamicRebuilds = 0; p.queries = 0; p.candidates = 0;
      return;
    }
    if (!p.rebuilds && !p.dynamicRebuilds && !p.queries && !p.candidates) return;
    perfRuntime.recordSpatialHash(p);
    p.rebuilds = 0;
    p.dynamicRebuilds = 0;
    p.queries = 0;
    p.candidates = 0;
  }
}
