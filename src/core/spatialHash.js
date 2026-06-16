// Uniform-grid spatial hash for broad-phase collision and radius queries (ARCHITECTURE §0.16).
// Rebuilt every sim step. Large bodies (stations) span multiple cells.

export class SpatialHash {
  constructor(cell = 64) {
    this.cell = cell;
    this.buckets = new Map(); // "cx,cz" -> Entity[]
  }

  clear() { this.buckets.clear(); }

  insert(e) {
    const c = this.cell;
    const r = e.radius || 0;
    const x0 = Math.floor((e.pos.x - r) / c), x1 = Math.floor((e.pos.x + r) / c);
    const z0 = Math.floor((e.pos.z - r) / c), z1 = Math.floor((e.pos.z + r) / c);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = cx + ',' + cz;
        let b = this.buckets.get(k);
        if (!b) { b = []; this.buckets.set(k, b); }
        b.push(e);
      }
    }
  }

  rebuild(entityList) {
    this.clear();
    for (const e of entityList) {
      if (e.alive && e.collides) this.insert(e);
    }
  }

  /** Collect entities whose cells overlap the circle (x,z,r). Dedupes by id. */
  queryRadius(x, z, r, out = []) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    const seen = out._seen || (out._seen = new Set());
    seen.clear();
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const b = this.buckets.get(cx + ',' + cz);
        if (!b) continue;
        for (const e of b) { if (!seen.has(e.id)) { seen.add(e.id); out.push(e); } }
      }
    }
    return out;
  }
}
