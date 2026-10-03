// Segment-vs-body line-of-sight primitives shared by the PQ-146 observers. Leaf module: reads
// entity geometry and collision proxy manifests only; no journal, physics or state writes.
import { resolveCollisionProxyManifest, proxyWorldPrimitives, proxyScaleFor, expandProxyPrimitives } from '../data/collisionProxyManifests.js';
import { modelTruthProxyRowForEntity } from '../data/modelTruth.js';
import { isDynamicPhysicsBodyEntity } from '../core/physicsAuthority.js';
import { collidesFlipEpoch, entityIndexVersion } from '../world/livingWorldViews.js';
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
function pointSegmentDistance(p,a,b) {
  const dx=b.x-a.x,dz=b.z-a.z, square=dx*dx+dz*dz;
  const t=square ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/square)) : 0;
  return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);
}
function crossesBox(a,b,p) {
  const c=Math.cos(-p.rot),s=Math.sin(-p.rot);
  const rotate=v=>({x:(v.x-p.x)*c-(v.z-p.z)*s,z:(v.x-p.x)*s+(v.z-p.z)*c});
  const from=rotate(a),to=rotate(b); let low=0,high=1;
  for (const [axis,half] of [['x',p.hx],['z',p.hz]]) {
    const d=to[axis]-from[axis];
    if(Math.abs(d)<1e-9) { if(Math.abs(from[axis])>half)return false;continue; }
    const t1=(-half-from[axis])/d,t2=(half-from[axis])/d;
    low=Math.max(low,Math.min(t1,t2));high=Math.min(high,Math.max(t1,t2));if(low>high)return false;
  }
  return high>0&&low<1;
}
function segmentIntersects(a,b,c,d) {
  if(Math.max(a.x,b.x)<Math.min(c.x,d.x)||Math.max(c.x,d.x)<Math.min(a.x,b.x)
    ||Math.max(a.z,b.z)<Math.min(c.z,d.z)||Math.max(c.z,d.z)<Math.min(a.z,b.z))return false;
  const cross=(p,q,r)=>(q.x-p.x)*(r.z-p.z)-(r.x-p.x)*(q.z-p.z);
  return cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0;
}
export function primitiveBlocksSegment(a, b, p) {
  if (p.kind === 'circle' && p.r > 0 && pointSegmentDistance(p, a, b) < p.r) return true;
  if (p.kind === 'obb' && crossesBox(a, b, p)) return true;
  if (p.kind === 'capsule') {
    const start = { x: p.ax, z: p.az };
    const end = { x: p.bx, z: p.bz };
    if (segmentIntersects(a, b, start, end)
      || Math.min(
        pointSegmentDistance(start, a, b),
        pointSegmentDistance(end, a, b),
        pointSegmentDistance(a, start, end),
        pointSegmentDistance(b, start, end),
      ) < p.r) return true;
  }
  return false;
}

/** True when the segment crosses the entity's measured skin, or its gameplay ball when it has none. */
export function segmentHitsProxy(entity, a, b) {
  if (!entity || !point(entity.pos) || !point(a) || !point(b)) return false;
  const manifest = resolveCollisionProxyManifest(entity);
  const primitives = manifest
    ? proxyWorldPrimitives(entity, manifest)
    : [{ kind: 'circle', x: entity.pos.x, z: entity.pos.z, r: entity.physicsBody?.radius ?? entity.radius ?? entity.r ?? 0 }];
  for (const primitive of primitives) {
    if (primitiveBlocksSegment(a, b, primitive)) return true;
  }
  return false;
}

// Furthest primitive surface distance from an entity's own origin — rotation-invariant (a
// rotated offset keeps its magnitude), so it caches per (manifest, scale) and lets
// witnessLineOfSight skip proxy expansion for every entity whose reach cannot touch the
// segment. The skip is verdict-identical: every primitive surface sits within reach of
// entity.pos, so distance(pos, segment) > reach proves no primitive can intersect.
const _occluderReachMemo = new WeakMap();
function occluderReach(entity, manifest) {
  if (!manifest) {
    return Math.max(0, entity.physicsBody?.radius ?? entity.radius ?? entity.r ?? 0);
  }
  const scale = proxyScaleFor(entity, manifest);
  const hit = _occluderReachMemo.get(entity);
  if (hit && hit.manifest === manifest && hit.scale === scale) return hit.reach;
  const local = expandProxyPrimitives(manifest, { entity });
  let reach = 0;
  for (const p of local) {
    let extent = 0;
    if (p.kind === 'capsule') {
      extent = Math.max(
        Math.hypot(Number(p.ax) || 0, Number(p.az) || 0),
        Math.hypot(Number(p.bx) || 0, Number(p.bz) || 0),
      ) + Math.max(0, Number(p.r) || 0);
    } else {
      const body = p.kind === 'obb'
        ? Math.hypot(Number(p.hx) || 0, Number(p.hz) || 0)
        : Math.max(0, Number(p.r) || 0);
      extent = Math.hypot(Number(p.x) || 0, Number(p.z) || 0) + body;
    }
    if (extent > reach) reach = extent;
  }
  reach *= scale;
  _occluderReachMemo.set(entity, { manifest, scale, reach });
  return reach;
}

// One fused memo per body on the full input space of resolve + scale + reach — a call hit
// pays field reads + compares and skips the resolver's helper walks entirely. `data` object
// identity alone can't serve as the key: canonical identity mutates in place (a hull swap
// rewrites data.defId on the same object), so the resolved row rides the key with it. The
// raw corridorBearingDeg stamp rides too — chain expansion and approach-framed manifests
// reshape the primitive set inside the reach bound.
const _occluderBodyMemo = new WeakMap();
function occluderBodyView(entity) {
  const data = entity.data;
  const body = entity.physicsBody && typeof entity.physicsBody === 'object' ? entity.physicsBody : null;
  const hit = _occluderBodyMemo.get(entity);
  if (hit && hit.data === data && hit.type === entity.type && hit.collides === entity.collides
    && hit.row === modelTruthProxyRowForEntity(entity)
    && hit.dynamic === isDynamicPhysicsBodyEntity(entity)
    && hit.body === body
    && hit.bodyRevision === (body ? Math.max(0, Math.trunc(Number(body.revision) || 0)) : -1)
    && hit.bodyShape === (body && body.shape) && hit.bodySkin === (body && body.useMeasuredSkin)
    && hit.authored === (body && body.collisionProxyManifest)
    && hit.proxyId === (data && data.collisionProxy)
    && hit.dockRadius === (data && data.dockRadius) && hit.radius === entity.radius
    && hit.bearing === (data && data.corridorBearingDeg)) {
    return hit.view;
  }
  const manifest = resolveCollisionProxyManifest(entity);
  const view = { manifest, reach: occluderReach(entity, manifest) };
  _occluderBodyMemo.set(entity, {
    data, type: entity.type, collides: entity.collides,
    row: modelTruthProxyRowForEntity(entity), dynamic: isDynamicPhysicsBodyEntity(entity),
    body, bodyRevision: body ? Math.max(0, Math.trunc(Number(body.revision) || 0)) : -1,
    bodyShape: body && body.shape, bodySkin: body && body.useMeasuredSkin,
    authored: body && body.collisionProxyManifest,
    proxyId: data && data.collisionProxy,
    dockRadius: data && data.dockRadius, radius: entity.radius,
    bearing: data && data.corridorBearingDeg,
    view,
  });
  return view;
}

// The accept predicate requires entity.collides, so the candidate domain is a subset of the
// collidables index lane — iterate it directly when the index provably covers every map
// entity (the proven-coverage gate the other lanes use), else fall back to the full walk.
// Stale T→F members (the syncEntityCollisionIndexMembership caveat) are excluded by the
// per-call collides check below; observer/ignored are per-call inputs and stay per-call.
function occluderScanDomain(state) {
  const index = state && state.entityIndex;
  const entities = state && state.entities;
  if (index && index.__spacefaceEntityIndexV1 === true && index.ready === true
    && Array.isArray(index.collidables) && index._indexedIds instanceof Set
    && entities && entities.size === index._indexedIds.size) {
    return index.collidables;
  }
  return (entities && typeof entities.values === 'function' ? entities.values() : []);
}

// Prepared occluder rows shared by every witness call under one membership — mirrors the
// adjudicated LAW_WITNESS_PLAN_MEMO. Rows are pos-free (reach is pose-invariant; eval reads
// live pos), so the key is membership only: index version (spawns/removals), map size and
// _indexedIds.size (uncovered-domain and coverage-mode changes), and the collides flip epoch
// (a mid-tick F→T flip joins the lane without a version bump — post-flip queries must see
// the new member or the verdict diverges). The type/sensorBlocking filter is stamp-stable
// (zero post-spawn writers — verified in the W44 audit) and hoists to build time.
const WITNESS_OCCLUDER_PLAN_MEMO = new WeakMap();

// Plan rows partition at build: physics-fixed occluders (stations, gates, landmarks and any
// body past the isFixedPhysicsEntity radius threshold — the contract behind
// isDynamicPhysicsBodyEntity) cannot move inside a membership-stable memo, so they bucket by
// pos±reach once and only grid cells near the segment are walked. Reach beyond the cell size
// stays always-evaluated like a mobile row — a fat station would otherwise own most of the
// grid. Mobile rows never grid: a center that moved into the segment ball while its bucket
// stayed outside is a miss direction nothing downstream re-verifies.
const WITNESS_SPATIAL_CELL = 256;
let witnessSpatialQueryStamp = 0;

function witnessPlanInsert(plan, rec) {
  const entity = rec.occ;
  const px = entity && entity.pos ? Number(entity.pos.x) : NaN;
  const pz = entity && entity.pos ? Number(entity.pos.z) : NaN;
  if (!isDynamicPhysicsBodyEntity(entity) && Number.isFinite(px) && Number.isFinite(pz)
      && rec.reach <= WITNESS_SPATIAL_CELL) {
    const x0 = Math.floor((px - rec.reach) / WITNESS_SPATIAL_CELL);
    const x1 = Math.floor((px + rec.reach) / WITNESS_SPATIAL_CELL);
    const z0 = Math.floor((pz - rec.reach) / WITNESS_SPATIAL_CELL);
    const z1 = Math.floor((pz + rec.reach) / WITNESS_SPATIAL_CELL);
    for (let cx = x0; cx <= x1; cx++) {
      let row = plan.grid.get(cx);
      if (!row) { row = new Map(); plan.grid.set(cx, row); }
      for (let cz = z0; cz <= z1; cz++) {
        let bucket = row.get(cz);
        if (!bucket) { bucket = []; row.set(cz, bucket); }
        bucket.push(rec);
      }
    }
    return;
  }
  plan.dynamic.push(rec);
}

function witnessOccluderPlan(state) {
  const index = state && state.entityIndex;
  const entities = state && state.entities;
  const covered = !!(index && index.__spacefaceEntityIndexV1 === true && index.ready === true
    && Array.isArray(index.collidables) && index._indexedIds instanceof Set
    && entities && entities.size === index._indexedIds.size);
  const idxV = entityIndexVersion(state);
  const key = `${idxV == null ? 'nv' : idxV}`
    + `|${entities && Number.isFinite(entities.size) ? entities.size : -1}`
    + `|${collidesFlipEpoch()}`
    + `|${index && index._indexedIds instanceof Set ? index._indexedIds.size : -1}`
    + `|${covered ? 1 : 0}`;
  const hit = WITNESS_OCCLUDER_PLAN_MEMO.get(state);
  if (hit && hit.key === key) return hit.plan;
  const plan = { dynamic: [], grid: new Map() };
  for (const entity of occluderScanDomain(state)) {
    if (!entity) continue;
    if (!['ship','station','asteroid','planet','wreck','debris'].includes(entity.type)
      && entity.data?.sensorBlocking !== true) continue;
    witnessPlanInsert(plan, { occ: entity, reach: occluderBodyView(entity).reach });
  }
  WITNESS_OCCLUDER_PLAN_MEMO.set(state, { key, plan });
  return plan;
}

// One row's full accept chain — shared by both lanes so the verdict chain stays verbatim.
// Every surface point sits within reach of its origin: a center outside the segment's
// enclosing ball cannot intersect — identical verdict, no segment math (law twin).
function witnessRowBlocks(rec, observer, ignored, observerPos, destination, mx, mz, halfLen) {
  const entity = rec.occ;
  if(!entity?.alive||!entity.collides||entity.id===observer.id||ignored.includes(entity.id)||!point(entity.pos))return false;
  const dxm = entity.pos.x - mx, dzm = entity.pos.z - mz;
  const bound = halfLen + rec.reach;
  if (dxm * dxm + dzm * dzm > bound * bound) return false;
  if (pointSegmentDistance(entity.pos, observerPos, destination) > rec.reach) return false;
  return segmentHitsProxy(entity, observerPos, destination);
}

/** Uses the same station primitives as physics, preserving real gaps through compound geometry. */
export function witnessLineOfSight(state, observer, destination, ignored = []) {
  if (!point(observer?.pos)||!point(destination))return false;
  const ax = observer.pos.x, az = observer.pos.z, bx = destination.x, bz = destination.z;
  const mx = (ax + bx) * 0.5, mz = (az + bz) * 0.5;
  const halfLen = Math.hypot(bx - ax, bz - az) * 0.5;
  const plan = witnessOccluderPlan(state);
  for (const rec of plan.dynamic) {
    if (witnessRowBlocks(rec, observer, ignored, observer.pos, destination, mx, mz, halfLen)) return false;
  }
  // Cells overlapped by the segment ball dilated by the cell size: a grid row's bucket span
  // covers pos±reach with reach <= cell, so any possible blocker has its own center inside
  // this square — the cell containing it is visited. Superset of the bound test, identical
  // verdict once each returned row re-runs the full chain.
  const span = halfLen + WITNESS_SPATIAL_CELL;
  const gx0 = Math.floor((mx - span) / WITNESS_SPATIAL_CELL);
  const gx1 = Math.floor((mx + span) / WITNESS_SPATIAL_CELL);
  const gz0 = Math.floor((mz - span) / WITNESS_SPATIAL_CELL);
  const gz1 = Math.floor((mz + span) / WITNESS_SPATIAL_CELL);
  const stamp = ++witnessSpatialQueryStamp;
  for (let cx = gx0; cx <= gx1; cx++) {
    const gridRow = plan.grid.get(cx);
    if (!gridRow) continue;
    for (let cz = gz0; cz <= gz1; cz++) {
      const bucket = gridRow.get(cz);
      if (!bucket) continue;
      for (const rec of bucket) {
        if (rec._wq === stamp) continue;
        rec._wq = stamp;
        if (witnessRowBlocks(rec, observer, ignored, observer.pos, destination, mx, mz, halfLen)) return false;
      }
    }
  }
  return true;
}
