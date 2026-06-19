// Uniform-grid spatial hash for broad-phase collision and radius queries (ARCHITECTURE §0.16).
// Rebuilt every sim step. Large bodies (stations) span multiple cells.

export class SpatialHash {
  constructor(cell = 64) {
    this.cell = cell;
    this.buckets = new Map(); // cx -> Map<cz, Entity[]>
    this._activeBuckets = [];
    this._seenIds = new Map();
    this._queryStamp = 1;
    this._pending = { rebuilds: 0, queries: 0, candidates: 0 };
    this.diagnostics = { rebuilds: 0, queries: 0, candidates: 0, activeBuckets: 0 };
  }

  clear() {
    for (const bucket of this._activeBuckets) bucket.length = 0;
    this._activeBuckets.length = 0;
  }

  insert(e) {
    const c = this.cell;
    const r = e.radius || 0;
    const x0 = Math.floor((e.pos.x - r) / c), x1 = Math.floor((e.pos.x + r) / c);
    const z0 = Math.floor((e.pos.z - r) / c), z1 = Math.floor((e.pos.z + r) / c);
    for (let cx = x0; cx <= x1; cx++) {
      let row = this.buckets.get(cx);
      if (!row) { row = new Map(); this.buckets.set(cx, row); }
      for (let cz = z0; cz <= z1; cz++) {
        let b = row.get(cz);
        if (!b) { b = []; row.set(cz, b); }
        if (b.length === 0) this._activeBuckets.push(b);
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
    this.diagnostics.activeBuckets = this._activeBuckets.length;
  }

  /** Collect entities whose cells overlap the circle (x,z,r). Dedupes by id. */
  queryRadius(x, z, r, out = []) {
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
    for (let cx = x0; cx <= x1; cx++) {
      const row = this.buckets.get(cx);
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
    this._pending.queries++;
    this._pending.candidates += candidates;
    this.diagnostics.queries++;
    this.diagnostics.candidates += candidates;
    return out;
  }

  flushPerfCounters(perfRuntime) {
    const p = this._pending;
    if (!perfRuntime || typeof perfRuntime.recordSpatialHash !== 'function') {
      p.rebuilds = 0; p.queries = 0; p.candidates = 0;
      return;
    }
    if (!p.rebuilds && !p.queries && !p.candidates) return;
    perfRuntime.recordSpatialHash(p);
    p.rebuilds = 0;
    p.queries = 0;
    p.candidates = 0;
  }
}
