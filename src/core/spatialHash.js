// Uniform-grid spatial hash for broad-phase collision and radius queries (ARCHITECTURE §0.16).
// Static colliders live in a cached layer; dynamic bodies use incremental membership so only
// entities that cross cells / change radius / spawn / die are removed and reinserted.

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
    // Static radius-query results are stable until staticVersion changes. Cache the deduped
    // candidate lists by exact cell rectangle + traversal mode so repeated AI sensor frames do
    // not rescan hundreds of asteroid buckets for every formation member and every AI cadence.
    this._staticQueryCache = new Map();
    this._staticQueryCacheEntries = 0;
    this._staticQueryCacheLimit = 128;
    this._staticVersion = null;
    this._dynamicQueryCache = new Map();
    this._dynamicQueryCacheEntries = 0;
    this._dynamicQueryCacheLimit = 64;
    this._dynamicQueryVersion = 1;
    this._coherentQueries = new Map();
    this._coherentQueryLimit = 256;
    // id -> { entity, x0, x1, z0, z1, r, stamp } — dynamic membership for incremental rehash
    this._dynamicMembers = new Map();
    // Lane-version gate for the stale-member sweep: the dynamics lane's membership version
    // (entityIndex.spatialDynamicsVersion / activity physicsDynamicsVersion) bumps on every
    // enter/exit, so an unchanged version + same lane array + length proves every member is
    // revisited this pass and the drop-unvisited sweep is a no-op. null = caller has no lane
    // version → always sweep.
    this._dynamicsVersion = null;
    this._dynamicsCount = -1;
    this._dynamicsSource = null;
    this._dynamicSyncStamp = 1;
    this._memberRemoveScratch = [];
    // id|entity -> member record — static membership for the incremental diff sync. Statics
    // are stable index refs, so unidentified members key safely on the object itself.
    this._staticMembers = new Map();
    this._staticSyncStamp = 1;
    this._staticMemberRemoveScratch = [];
    this._staticDirtyRects = [];
    this._seenIds = new Map();
    this._spanScratch = { r: 0, x0: 0, x1: 0, z0: 0, z1: 0 };
    this._batchSeenIds = [];
    this._batchFootprints = [];
    this._batchMetas = [];
    this._staticQueryResult = { entities: null, candidates: 0 };
    this._queryStamp = 1;
    this._pending = {
      rebuilds: 0,
      dynamicRebuilds: 0,
      dynamicFullRebuilds: 0,
      dynamicReinserts: 0,
      dynamicUnchanged: 0,
      staticReinserts: 0,
      staticUnchanged: 0,
      gateSkips: 0,
      queries: 0,
      candidates: 0,
    };
    this.diagnostics = {
      rebuilds: 0,
      dynamicRebuilds: 0,
      dynamicFullRebuilds: 0,
      dynamicReinserts: 0,
      dynamicUnchanged: 0,
      staticReinserts: 0,
      staticUnchanged: 0,
      gateSkips: 0,
      queries: 0,
      candidates: 0,
      activeBuckets: 0,
      staticBuckets: 0,
      dynamicBuckets: 0,
      staticQueryCacheHits: 0,
      staticQueryCacheMisses: 0,
      staticQueryCacheEntries: 0,
      dynamicQueryCacheHits: 0,
      dynamicQueryCacheMisses: 0,
      dynamicQueryCacheEntries: 0,
      coherentQueryHits: 0,
      coherentQueryMisses: 0,
    };
  }

  clear() {
    this._clearDynamicLayer();
    this._clearStaticLayer();
    this._seenIds.clear();
    this._queryStamp = 1;
    this._staticVersion = null;
    this._dynamicsVersion = null;
    this._dynamicsCount = -1;
    this._dynamicsSource = null;
    this._dynamicQueryVersion = 1;
    this._clearDynamicQueryCache();
    this._coherentQueries.clear();
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
    this._pending.dynamicFullRebuilds++;
    this.diagnostics.dynamicFullRebuilds++;
    for (const e of entityList) {
      if (e.alive && e.collides) {
        this.insert(e);
        this._recordDynamicMember(e);
      }
    }
    // Legacy full rebuild path counts as a static/full rebuild only (not a layered dynamic sync).
    this._updateActiveDiagnostics();
  }

  rebuildLayers(staticEntities = [], dynamicEntities = [], staticVersion = 0, dynamicsVersion = null) {
    if (this._staticVersion !== staticVersion) {
      // Incremental diff instead of clear+reinsert: only spawned/despawned/span-changed
      // statics are rehashed and only the cells they touched leave the query caches — a
      // version bump that changed no membership keeps every warm entry.
      this._syncStaticLayer(staticEntities);
      this._staticVersion = staticVersion;
    }

    this._syncDynamicLayer(dynamicEntities, dynamicsVersion);
    this._updateActiveDiagnostics();
  }

  /**
   * Incremental dynamic-layer sync: only entities that cross cell boundaries, change
   * radius/coverage, spawn, die, or fail membership identity checks are rehashed.
   * Stamp-based queryRadius semantics are unchanged (queries always read live entity.pos).
   */
  _syncDynamicLayer(dynamicEntities, dynamicsVersion = null) {
    this._pending.dynamicRebuilds++;
    this.diagnostics.dynamicRebuilds++;

    // Version + length unchanged proves the lane's membership is identical to last pass —
    // every member gets re-stamped in the walk below, so the drop-unvisited sweep can only
    // be a no-op. Members that die or lose collides while IN the lane are removed inline,
    // not by the sweep. An unversioned caller (null) always sweeps.
    const membershipStable = dynamicsVersion != null
      && dynamicsVersion === this._dynamicsVersion
      && dynamicEntities === this._dynamicsSource
      && dynamicEntities.length === this._dynamicsCount;

    let stamp = this._dynamicSyncStamp + 1;
    if (stamp > 0x7fffffff) stamp = 1;
    this._dynamicSyncStamp = stamp;

    let reinserts = 0;
    let unchanged = 0;
    let removed = 0;
    const list = dynamicEntities || [];

    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || !e.alive || !e.collides || !e.pos) {
        if (e && e.id != null) {
          const stale = this._dynamicMembers.get(e.id);
          if (stale && (stale.entity === e || !stale.entity || !stale.entity.alive)) {
            this._removeDynamicMemberRecord(stale);
            this._dynamicMembers.delete(e.id);
            removed++;
          }
        }
        continue;
      }

      const id = e.id;
      if (id == null) {
        // Unidentified colliders are not production path (spawn always assigns ids). Skip
        // membership tracking rather than re-inserting every sync (would multi-bucket).
        continue;
      }

      const prev = this._dynamicMembers.get(id);
      if (prev && prev.entity === e && e.physicsSleeping === true
        && !(e.flags && e.flags.noInterp)) {
        const vx = e.vel ? Number(e.vel.x) || 0 : 0;
        const vz = e.vel ? Number(e.vel.z) || 0 : 0;
        const wy = Number(e.angVel) || 0;
        if (vx * vx + vz * vz <= 1e-8 && wy * wy <= 1e-8) {
          prev.stamp = stamp;
          unchanged++;
          continue;
        }
      }

      const span = this._cellSpan(e);

      if (!prev || prev.entity !== e) {
        // New entity, id reuse with a different object, or first insert after clear.
        if (prev) {
          this._removeDynamicMemberRecord(prev);
        }
        this._insertInto(this.buckets, this._activeBuckets, this._activeCellX, this._activeCellZ, e);
        this._dynamicMembers.set(id, {
          entity: e,
          x0: span.x0, x1: span.x1, z0: span.z0, z1: span.z1, r: span.r,
          stamp,
        });
        reinserts++;
        continue;
      }

      if (
        prev.x0 !== span.x0 || prev.x1 !== span.x1 ||
        prev.z0 !== span.z0 || prev.z1 !== span.z1 ||
        prev.r !== span.r
      ) {
        this._removeDynamicMemberRecord(prev);
        this._insertInto(this.buckets, this._activeBuckets, this._activeCellX, this._activeCellZ, e);
        prev.entity = e;
        prev.x0 = span.x0; prev.x1 = span.x1; prev.z0 = span.z0; prev.z1 = span.z1; prev.r = span.r;
        prev.stamp = stamp;
        reinserts++;
        continue;
      }

      // Same coverage: membership stays; live pos/radius queries remain correct.
      prev.entity = e;
      prev.stamp = stamp;
      unchanged++;
    }

    // Drop memberships not visited this pass (despawned / left dynamic set / id retired).
    if (!membershipStable) {
      const removeScratch = this._memberRemoveScratch;
      removeScratch.length = 0;
      for (const [id, rec] of this._dynamicMembers) {
        if (rec.stamp !== stamp) removeScratch.push(id);
      }
      for (let i = 0; i < removeScratch.length; i++) {
        const id = removeScratch[i];
        const rec = this._dynamicMembers.get(id);
        if (!rec) continue;
        this._removeDynamicMemberRecord(rec);
        this._dynamicMembers.delete(id);
        removed++;
      }
      removeScratch.length = 0;
    }
    this._dynamicsVersion = dynamicsVersion;
    this._dynamicsCount = dynamicEntities.length;
    this._dynamicsSource = dynamicEntities;

    if (reinserts > 0 || removed > 0) {
      this._compactActiveBuckets(
        this._activeBuckets, this._activeCellX, this._activeCellZ,
      );
    }

    // Reinsert metric = entity cells rewritten; removals counted separately via compact path.
    const membershipUpdates = reinserts + removed;
    this._pending.dynamicReinserts += membershipUpdates;
    this._pending.dynamicUnchanged += unchanged;
    this.diagnostics.dynamicReinserts += membershipUpdates;
    this.diagnostics.dynamicUnchanged += unchanged;
    if (membershipUpdates > 0) {
      this._dynamicQueryVersion = (this._dynamicQueryVersion + 1) | 0;
      if (this._dynamicQueryVersion <= 0) this._dynamicQueryVersion = 1;
      this._clearDynamicQueryCache();
    }
  }

  /**
   * Incremental static-layer sync, mirroring _syncDynamicLayer: only statics that spawn, die,
   * or cross cell/radius boundaries are rehashed. Cached static-query and coherent-query
   * entries are invalidated only where their cell rectangle intersects a changed span — a
   * staticVersion bump that changed no real membership leaves every cache warm.
   */
  // Incremental static sync. Ordering caveat (adjudicated, W27): a member removed and
  // reinserted lands at its cells' tail rather than its original slot, so bucket iteration
  // order is history-dependent — not equivalent to a from-scratch rebuild. That is legal
  // because every consumer treats results as sets; the only order-observing reader is the
  // strict first-wins `hit.t < bestHit.t` tie-break (physics.js ~869) on exact ties, which
  // stays deterministic for any given history. If a live full rebuild is ever introduced
  // alongside this incremental path, either preserve order on reinsert or sort on read.
  _syncStaticLayer(staticEntities) {
    this._pending.rebuilds++;
    this.diagnostics.rebuilds++;

    let stamp = this._staticSyncStamp + 1;
    if (stamp > 0x7fffffff) stamp = 1;
    this._staticSyncStamp = stamp;

    const dirty = this._staticDirtyRects;
    dirty.length = 0;
    let reinserts = 0;
    let unchanged = 0;
    let removed = 0;
    const list = staticEntities || [];

    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const key = e && e.id != null ? e.id : e;
      if (!e || !e.alive || !e.collides || !e.pos) {
        if (key != null) {
          const stale = this._staticMembers.get(key);
          if (stale && stale.entity === e) {
            this._removeStaticMemberRecord(stale);
            this._staticMembers.delete(key);
            dirty.push({ x0: stale.x0, x1: stale.x1, z0: stale.z0, z1: stale.z1 });
            removed++;
          }
        }
        continue;
      }

      const span = this._cellSpan(e);
      const prev = this._staticMembers.get(key);
      if (!prev || prev.entity !== e) {
        if (prev) {
          this._removeStaticMemberRecord(prev);
          dirty.push({ x0: prev.x0, x1: prev.x1, z0: prev.z0, z1: prev.z1 });
        }
        this._insertStatic(e);
        this._staticMembers.set(key, {
          entity: e,
          x0: span.x0, x1: span.x1, z0: span.z0, z1: span.z1, r: span.r,
          stamp,
        });
        dirty.push({ x0: span.x0, x1: span.x1, z0: span.z0, z1: span.z1 });
        reinserts++;
        continue;
      }

      if (prev.x0 !== span.x0 || prev.x1 !== span.x1
        || prev.z0 !== span.z0 || prev.z1 !== span.z1
        || prev.r !== span.r) {
        this._removeStaticMemberRecord(prev);
        this._insertStatic(e);
        dirty.push({ x0: prev.x0, x1: prev.x1, z0: prev.z0, z1: prev.z1 });
        dirty.push({ x0: span.x0, x1: span.x1, z0: span.z0, z1: span.z1 });
        prev.entity = e;
        prev.x0 = span.x0; prev.x1 = span.x1; prev.z0 = span.z0; prev.z1 = span.z1; prev.r = span.r;
        prev.stamp = stamp;
        reinserts++;
        continue;
      }

      prev.entity = e;
      prev.stamp = stamp;
      unchanged++;
    }

    // Drop memberships not visited this pass (despawned / left the static set / id retired).
    const removeScratch = this._staticMemberRemoveScratch;
    removeScratch.length = 0;
    for (const [key, rec] of this._staticMembers) {
      if (rec.stamp !== stamp) removeScratch.push(key);
    }
    for (let i = 0; i < removeScratch.length; i++) {
      const rec = this._staticMembers.get(removeScratch[i]);
      if (!rec) continue;
      this._staticMembers.delete(removeScratch[i]);
      this._removeStaticMemberRecord(rec);
      dirty.push({ x0: rec.x0, x1: rec.x1, z0: rec.z0, z1: rec.z1 });
      removed++;
    }
    removeScratch.length = 0;

    if (reinserts > 0 || removed > 0) {
      this._compactActiveBuckets(
        this._staticActiveBuckets, this._staticActiveCellX, this._staticActiveCellZ,
      );
      this._invalidateStaticCells(dirty);
    }

    this._pending.staticReinserts += reinserts + removed;
    this._pending.staticUnchanged += unchanged;
    this.diagnostics.staticReinserts += reinserts + removed;
    this.diagnostics.staticUnchanged += unchanged;
  }

  _removeStaticMemberRecord(rec) {
    if (!rec || !rec.entity) return;
    this._removeEntityFromCells(
      this._staticBuckets, this._staticActiveBuckets, this._staticActiveCellX, this._staticActiveCellZ,
      rec.entity, rec.x0, rec.x1, rec.z0, rec.z1,
    );
  }

  _invalidateStaticCells(dirty) {
    if (!dirty || dirty.length === 0) return;
    const intersects = (x0, x1, z0, z1) => {
      for (let i = 0; i < dirty.length; i++) {
        const d = dirty[i];
        if (x0 <= d.x1 && x1 >= d.x0 && z0 <= d.z1 && z1 >= d.z0) return true;
      }
      return false;
    };
    // A cached static query is stale iff the cells it scanned overlap a changed member span.
    const cache = this._staticQueryCache;
    for (const [x0, a] of cache) {
      for (const [x1, b] of a) {
        for (const [z0, c] of b) {
          for (const [z1, d] of c) {
            if (!intersects(x0, x1, z0, z1)) continue;
            this._staticQueryCacheEntries -= d.size;
            c.delete(z1);
          }
          if (c.size === 0) b.delete(z0);
        }
        if (b.size === 0) a.delete(x1);
      }
      if (a.size === 0) cache.delete(x0);
    }
    this.diagnostics.staticQueryCacheEntries = this._staticQueryCacheEntries;
    // Coherent records capture queryRadius unions (dynamic + static), so a static membership
    // change in their rectangle invalidates them by the same intersection rule.
    for (const [key, rec] of this._coherentQueries) {
      if (intersects(rec.x0, rec.x1, rec.z0, rec.z1)) this._coherentQueries.delete(key);
    }
  }

  _cellSpan(e) {
    const c = this.cell;
    const r = e.radius || 0;
    const span = this._spanScratch;
    span.r = r;
    span.x0 = Math.floor((e.pos.x - r) / c);
    span.x1 = Math.floor((e.pos.x + r) / c);
    span.z0 = Math.floor((e.pos.z - r) / c);
    span.z1 = Math.floor((e.pos.z + r) / c);
    return span;
  }

  _recordDynamicMember(e) {
    if (!e || e.id == null || !e.pos) return;
    const span = this._cellSpan(e);
    this._dynamicMembers.set(e.id, {
      entity: e,
      x0: span.x0, x1: span.x1, z0: span.z0, z1: span.z1, r: span.r,
      stamp: this._dynamicSyncStamp,
    });
  }

  _removeDynamicMemberRecord(rec) {
    if (!rec || !rec.entity) return;
    this._removeEntityFromCells(
      this.buckets, this._activeBuckets, this._activeCellX, this._activeCellZ,
      rec.entity, rec.x0, rec.x1, rec.z0, rec.z1,
    );
  }

  _removeEntityFromCells(buckets, activeBuckets, activeCellX, activeCellZ, e, x0, x1, z0, z1) {
    for (let cx = x0; cx <= x1; cx++) {
      const row = buckets.get(cx);
      if (!row) continue;
      for (let cz = z0; cz <= z1; cz++) {
        const b = row.get(cz);
        if (!b || b.length === 0) continue;
        const idx = b.indexOf(e);
        if (idx < 0) continue;
        const last = b.length - 1;
        // Order-preserving removal: a bucket's emission order must equal full-rebuild
        // order so pair resolution never diverges across removal histories.
        for (let i = idx; i < last; i++) b[i] = b[i + 1];
        b.pop();
        // Continuous-world travel must not leave an ever-growing map of empty cell arrays.
        // Active-array references are compacted once per sync after all removals complete.
        if (b.length === 0) row.delete(cz);
      }
      if (row.size === 0) buckets.delete(cx);
    }
  }

  _compactActiveBuckets(activeBuckets, activeCellX, activeCellZ) {
    let w = 0;
    for (let i = 0; i < activeBuckets.length; i++) {
      if (activeBuckets[i].length > 0) {
        if (w !== i) {
          activeBuckets[w] = activeBuckets[i];
          activeCellX[w] = activeCellX[i];
          activeCellZ[w] = activeCellZ[i];
        }
        w++;
      }
    }
    activeBuckets.length = w;
    activeCellX.length = w;
    activeCellZ.length = w;
  }

  /** Collect entities whose cells overlap the circle (x,z,r). Dedupes by id. */
  queryRadius(x, z, r, out = [], opts = null) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
    let candidates = 0;
    const activeCount = this._activeBuckets.length + this._staticActiveBuckets.length;
    const cellSpanX = x1 - x0 + 1;
    const cellSpanZ = z1 - z0 + 1;
    const rectangularVisits = cellSpanX * cellSpanZ;
    const scanActive = activeCount > 0 && rectangularVisits > activeCount * 3;
    const staticResult = this._cachedStaticQuery(x0, x1, z0, z1, scanActive);
    candidates += staticResult.candidates;
    const seen = this._seenIds;
    const stamp = this._nextQueryStamp();
    const cachedDynamic = this._getDynamicQueryCache(x0, x1, z0, z1, scanActive);
    let dynamicEntities;
    if (cachedDynamic) {
      this.diagnostics.dynamicQueryCacheHits++;
      dynamicEntities = cachedDynamic;
    } else {
      this.diagnostics.dynamicQueryCacheMisses++;
      dynamicEntities = [];
      candidates += this._queryLayer(
        this.buckets, this._activeBuckets, this._activeCellX, this._activeCellZ,
        scanActive, x0, x1, z0, z1, stamp, dynamicEntities,
      );
      this._setDynamicQueryCache(x0, x1, z0, z1, scanActive, dynamicEntities);
    }
    for (let i = 0; i < dynamicEntities.length; i++) {
      const entity = dynamicEntities[i];
      seen.set(entity.id, stamp);
      out.push(entity);
    }
    for (let i = 0; i < staticResult.entities.length; i++) {
      const entity = staticResult.entities[i];
      if (seen.get(entity.id) === stamp) continue;
      seen.set(entity.id, stamp);
      out.push(entity);
    }
    if (!(opts && opts.countDiagnostics === false)) {
      this._pending.queries++;
      this._pending.candidates += candidates;
      this.diagnostics.queries++;
      this.diagnostics.candidates += candidates;
    }
    return out;
  }

  /**
   * Reuse last tick's neighbor list when the query AABB stays inside the same cell rectangle
   * and dynamic membership has not changed (SAP/grid temporal coherence).
   */
  queryRadiusCoherent(key, x, z, r, out = []) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c);
    const x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c);
    const z1 = Math.floor((z + r) / c);
    const version = this._dynamicQueryVersion;
    let rec = key != null ? this._coherentQueries.get(key) : null;
    if (rec
      && rec.version === version
      && x0 >= rec.x0 && x1 <= rec.x1 && z0 >= rec.z0 && z1 <= rec.z1) {
      this.diagnostics.coherentQueryHits++;
      out.length = 0;
      const src = rec.entities;
      for (let i = 0; i < src.length; i++) out.push(src[i]);
      return out;
    }
    this.diagnostics.coherentQueryMisses++;
    this.queryRadius(x, z, r, out);
    if (key == null) return out;
    if (!rec) {
      if (this._coherentQueries.size >= this._coherentQueryLimit) this._coherentQueries.clear();
      rec = { x0, x1, z0, z1, version, entities: [] };
      this._coherentQueries.set(key, rec);
    }
    rec.x0 = x0;
    rec.x1 = x1;
    rec.z0 = z0;
    rec.z1 = z1;
    rec.version = version;
    rec.entities.length = 0;
    for (let i = 0; i < out.length; i++) rec.entities.push(out[i]);
    return out;
  }

  /** Batch radius queries. Dense/large queries share one active-bucket traversal per layer. */
  queryRadiusBatch(requests = [], opts = null) {
    if (!Array.isArray(requests) || requests.length === 0) return requests;
    const c = this.cell;
    const requestCount = requests.length;
    const activeCount = this._activeBuckets.length + this._staticActiveBuckets.length;
    const shareResults = !!(opts && opts.shareResults === true);
    const shareSupersetResults = shareResults && !!(opts && opts.shareSupersetResults === true);
    const mutableSharedResults = shareResults && !!(opts && opts.mutableSharedResults === true);
    const footprints = this._batchFootprints;
    let allScanActive = requestCount > 1;
    let unionX0 = Infinity;
    let unionX1 = -Infinity;
    let unionZ0 = Infinity;
    let unionZ1 = -Infinity;

    for (let index = 0; index < requestCount; index++) {
      const request = requests[index];
      let footprint = footprints[index];
      if (!footprint) {
        footprint = { request: null, x0: 0, x1: 0, z0: 0, z1: 0, scanActive: false };
        footprints[index] = footprint;
      }
      const r = Number(request.r) || 0;
      const x0 = Math.floor((request.x - r) / c);
      const x1 = Math.floor((request.x + r) / c);
      const z0 = Math.floor((request.z - r) / c);
      const z1 = Math.floor((request.z + r) / c);
      const scanActive = activeCount > 0
        && ((x1 - x0 + 1) * (z1 - z0 + 1)) > activeCount * 3;
      footprint.request = request;
      footprint.x0 = x0;
      footprint.x1 = x1;
      footprint.z0 = z0;
      footprint.z1 = z1;
      footprint.scanActive = scanActive;
      if (!scanActive) allScanActive = false;
      if (x0 < unionX0) unionX0 = x0;
      if (x1 > unionX1) unionX1 = x1;
      if (z0 < unionZ0) unionZ0 = z0;
      if (z1 > unionZ1) unionZ1 = z1;
    }

    const metas = this._batchMetas;
    let metaCount = 0;
    const canShareSuperset = shareSupersetResults && allScanActive;
    if (canShareSuperset) {
      const firstRequest = footprints[0].request;
      const out = firstRequest.out && !Object.isFrozen(firstRequest.out)
        ? firstRequest.out
        : [];
      out.length = 0;
      for (let index = 0; index < requestCount; index++) footprints[index].request.out = out;
      this._prepareBatchMeta(
        metaCount++, out, unionX0, unionX1, unionZ0, unionZ1, true,
      );
    } else {
      for (let index = 0; index < requestCount; index++) {
        const footprint = footprints[index];
        const request = footprint.request;
        let shared = null;
        if (shareResults) {
          for (let metaIndex = 0; metaIndex < metaCount; metaIndex++) {
            const candidate = metas[metaIndex];
            if (
              candidate.x0 === footprint.x0 && candidate.x1 === footprint.x1
              && candidate.z0 === footprint.z0 && candidate.z1 === footprint.z1
              && candidate.scanActive === footprint.scanActive
            ) {
              shared = candidate;
              break;
            }
          }
        }
        if (shared) {
          // The broadphase result is a function of occupied cells, not the exact center inside
          // those cells. AI applies its exact circular range test afterwards, so sharing this
          // read-only candidate array preserves contacts while eliminating duplicate traversal.
          request.out = shared.out;
          continue;
        }
        const out = request.out && !Object.isFrozen(request.out)
          ? request.out
          : (request.out = []);
        out.length = 0;
        this._prepareBatchMeta(
          metaCount++, out,
          footprint.x0, footprint.x1, footprint.z0, footprint.z1,
          footprint.scanActive,
        );
      }
    }

    // Resolve stable static candidates once per unique query footprint. Dynamic contacts still
    // use the live layer below, while each caller keeps its own output array and ordering.
    for (let index = 0; index < metaCount; index++) {
      const meta = metas[index];
      const staticResult = this._cachedStaticQuery(
        meta.x0, meta.x1, meta.z0, meta.z1, meta.scanActive,
      );
      meta.staticEntities = staticResult.entities;
      meta.candidates += staticResult.candidates;
    }
    this._queryLayerBatch(
      this.buckets,
      this._activeBuckets,
      this._activeCellX,
      this._activeCellZ,
      metas,
      metaCount,
    );
    for (let index = 0; index < metaCount; index++) {
      const meta = metas[index];
      const staticEntities = meta.staticEntities;
      for (let staticIndex = 0; staticIndex < staticEntities.length; staticIndex++) {
        const entity = staticEntities[staticIndex];
        if (meta.scanActive) {
          if (meta.batchSeen.has(entity.id)) continue;
          meta.batchSeen.add(entity.id);
        } else {
          if (this._seenIds.get(entity.id) === meta.stamp) continue;
          this._seenIds.set(entity.id, meta.stamp);
        }
        meta.out.push(entity);
      }
    }
    if (shareResults && !mutableSharedResults) {
      // Opt-in shared batches are immutable by contract: downstream sensor consumers can read
      // the common candidate list but cannot corrupt another formation member's view or the
      // static cache. The production AI's explicitly ephemeral consumer may instead retain
      // mutable high-water scratch because it copies contacts before returning to its caller.
      for (let index = 0; index < metaCount; index++) Object.freeze(metas[index].out);
    }
    if (!(opts && opts.countDiagnostics === false)) {
      let candidates = 0;
      for (let index = 0; index < metaCount; index++) candidates += metas[index].candidates;
      this._pending.queries++;
      this._pending.candidates += candidates;
      this.diagnostics.queries++;
      this.diagnostics.candidates += candidates;
    }
    for (let index = 0; index < requestCount; index++) footprints[index].request = null;
    for (let index = 0; index < metaCount; index++) {
      const meta = metas[index];
      meta.out = null;
      meta.staticEntities = null;
      meta.batchSeen.clear();
    }
    return requests;
  }

  _prepareBatchMeta(index, out, x0, x1, z0, z1, scanActive) {
    let meta = this._batchMetas[index];
    if (!meta) {
      meta = {
        out: null,
        x0: 0,
        x1: 0,
        z0: 0,
        z1: 0,
        stamp: 0,
        batchSeen: null,
        candidates: 0,
        scanActive: false,
        staticEntities: null,
      };
      this._batchMetas[index] = meta;
    }
    const batchSeen = this._batchSeenIds[index]
      || (this._batchSeenIds[index] = new Set());
    batchSeen.clear();
    meta.out = out;
    meta.x0 = x0;
    meta.x1 = x1;
    meta.z0 = z0;
    meta.z1 = z1;
    meta.stamp = this._nextQueryStamp();
    meta.batchSeen = batchSeen;
    meta.candidates = 0;
    meta.scanActive = scanActive;
    meta.staticEntities = null;
    return meta;
  }

  _queryLayerBatch(buckets, activeBuckets, activeCellX, activeCellZ, metas, metaCount) {
    let hasScannedMeta = false;
    for (let index = 0; index < metaCount; index++) {
      if (metas[index].scanActive) {
        hasScannedMeta = true;
        break;
      }
    }
    if (hasScannedMeta) {
      for (let bucketIndex = 0; bucketIndex < activeBuckets.length; bucketIndex++) {
        const cx = activeCellX[bucketIndex];
        const cz = activeCellZ[bucketIndex];
        const bucket = activeBuckets[bucketIndex];
        for (let metaIndex = 0; metaIndex < metaCount; metaIndex++) {
          const meta = metas[metaIndex];
          if (!meta.scanActive
            || cx < meta.x0 || cx > meta.x1 || cz < meta.z0 || cz > meta.z1) continue;
          meta.candidates += bucket.length;
          for (let entityIndex = 0; entityIndex < bucket.length; entityIndex++) {
            const entity = bucket[entityIndex];
            if (meta.batchSeen.has(entity.id)) continue;
            meta.batchSeen.add(entity.id);
            meta.out.push(entity);
          }
        }
      }
    }
    for (let index = 0; index < metaCount; index++) {
      const meta = metas[index];
      if (meta.scanActive) continue;
      meta.candidates += this._queryLayer(
        buckets,
        activeBuckets,
        activeCellX,
        activeCellZ,
        false,
        meta.x0,
        meta.x1,
        meta.z0,
        meta.z1,
        meta.stamp,
        meta.out,
      );
    }
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

  _nextQueryStamp() {
    let stamp = this._queryStamp + 1;
    if (stamp > 0x7fffffff) {
      stamp = 1;
      this._seenIds.clear();
    }
    this._queryStamp = stamp;
    return stamp;
  }

  _cachedStaticQuery(x0, x1, z0, z1, scanActive) {
    const result = this._staticQueryResult;
    const cached = this._getStaticQueryCache(x0, x1, z0, z1, scanActive);
    if (cached) {
      this.diagnostics.staticQueryCacheHits++;
      result.entities = cached;
      result.candidates = 0;
      return result;
    }

    const entities = [];
    const stamp = this._nextQueryStamp();
    const candidates = this._queryLayer(
      this._staticBuckets,
      this._staticActiveBuckets,
      this._staticActiveCellX,
      this._staticActiveCellZ,
      scanActive,
      x0, x1, z0, z1,
      stamp,
      entities,
    );
    this._setStaticQueryCache(x0, x1, z0, z1, scanActive, entities);
    this.diagnostics.staticQueryCacheMisses++;
    result.entities = entities;
    result.candidates = candidates;
    return result;
  }

  _getStaticQueryCache(x0, x1, z0, z1, scanActive) {
    const a = this._staticQueryCache.get(x0);
    const b = a && a.get(x1);
    const c = b && b.get(z0);
    const d = c && c.get(z1);
    return d && d.get(scanActive) || null;
  }

  _setStaticQueryCache(x0, x1, z0, z1, scanActive, entities) {
    if (this._staticQueryCacheEntries >= this._staticQueryCacheLimit) this._clearStaticQueryCache();
    let a = this._staticQueryCache.get(x0);
    if (!a) { a = new Map(); this._staticQueryCache.set(x0, a); }
    let b = a.get(x1);
    if (!b) { b = new Map(); a.set(x1, b); }
    let c = b.get(z0);
    if (!c) { c = new Map(); b.set(z0, c); }
    let d = c.get(z1);
    if (!d) { d = new Map(); c.set(z1, d); }
    if (!d.has(scanActive)) {
      d.set(scanActive, entities);
      this._staticQueryCacheEntries++;
      this.diagnostics.staticQueryCacheEntries = this._staticQueryCacheEntries;
    }
  }

  _clearStaticQueryCache() {
    this._staticQueryCache.clear();
    this._staticQueryCacheEntries = 0;
    this.diagnostics.staticQueryCacheEntries = 0;
  }

  _dynamicQueryCacheKey(x0, x1, z0, z1, scanActive) {
    return `${this._dynamicQueryVersion}|${x0}|${x1}|${z0}|${z1}|${scanActive ? 1 : 0}`;
  }

  _getDynamicQueryCache(x0, x1, z0, z1, scanActive) {
    return this._dynamicQueryCache.get(this._dynamicQueryCacheKey(x0, x1, z0, z1, scanActive)) || null;
  }

  _setDynamicQueryCache(x0, x1, z0, z1, scanActive, entities) {
    if (this._dynamicQueryCacheEntries >= this._dynamicQueryCacheLimit) this._clearDynamicQueryCache();
    const key = this._dynamicQueryCacheKey(x0, x1, z0, z1, scanActive);
    if (!this._dynamicQueryCache.has(key)) {
      this._dynamicQueryCacheEntries++;
      this.diagnostics.dynamicQueryCacheEntries = this._dynamicQueryCacheEntries;
    }
    this._dynamicQueryCache.set(key, entities);
  }

  _clearDynamicQueryCache() {
    this._dynamicQueryCache.clear();
    this._dynamicQueryCacheEntries = 0;
    this.diagnostics.dynamicQueryCacheEntries = 0;
  }

  _clearDynamicLayer() {
    this.buckets.clear();
    this._activeBuckets.length = 0;
    this._activeCellX.length = 0;
    this._activeCellZ.length = 0;
    this._dynamicMembers.clear();
    this._clearDynamicQueryCache();
  }

  _clearStaticLayer() {
    this._clearStaticQueryCache();
    this._coherentQueries.clear();
    this._staticMembers.clear();
    this._staticBuckets.clear();
    this._staticActiveBuckets.length = 0;
    this._staticActiveCellX.length = 0;
    this._staticActiveCellZ.length = 0;
  }

  _updateActiveDiagnostics() {
    this.diagnostics.dynamicBuckets = this._activeBuckets.length;
    this.diagnostics.staticBuckets = this._staticActiveBuckets.length;
    this.diagnostics.activeBuckets = this.diagnostics.dynamicBuckets + this.diagnostics.staticBuckets;
  }

  /**
   * FB-088: the physics authority skipped a sync because the coverage gate proved no dynamic
   * member moved cells / spawned / despawned and the static version is unchanged. Counted so
   * the runtime witness can read gate behaviour next to the rebuild counters.
   */
  noteGateSkip() {
    this._pending.gateSkips++;
    this.diagnostics.gateSkips++;
  }

  flushPerfCounters(perfRuntime) {
    const p = this._pending;
    if (!perfRuntime || typeof perfRuntime.recordSpatialHash !== 'function') {
      p.rebuilds = 0;
      p.dynamicRebuilds = 0;
      p.dynamicFullRebuilds = 0;
      p.dynamicReinserts = 0;
      p.dynamicUnchanged = 0;
      p.staticReinserts = 0;
      p.staticUnchanged = 0;
      p.gateSkips = 0;
      p.queries = 0;
      p.candidates = 0;
      return;
    }
    if (
      !p.rebuilds && !p.dynamicRebuilds && !p.dynamicFullRebuilds &&
      !p.dynamicReinserts && !p.dynamicUnchanged && !p.gateSkips &&
      !p.queries && !p.candidates &&
      !p.staticReinserts && !p.staticUnchanged
    ) return;
    perfRuntime.recordSpatialHash(p);
    p.rebuilds = 0;
    p.dynamicRebuilds = 0;
    p.dynamicFullRebuilds = 0;
    p.dynamicReinserts = 0;
    p.dynamicUnchanged = 0;
    p.staticReinserts = 0;
    p.staticUnchanged = 0;
    p.gateSkips = 0;
    p.queries = 0;
    p.candidates = 0;
  }
}
