import { hasActiveSpatialHash } from '../../core/spatialQuery.js';
import { readFrameOrigin } from '../frameCoordinates.js';
import { presentedAnchorXZ } from '../presentedAnchor.js';

export const FLOW_ENVIRONMENT_CAPACITY = 3;
export const FLOW_ENVIRONMENT_MATERIAL = Object.freeze({ armor: 0, rock: 1, ice: 2, structure: 3 });
const BUCKETS = Object.freeze(['ships', 'asteroids', 'stations', 'wrecks']);
const QUERY_OPTIONS = Object.freeze({ countDiagnostics: false });
const MAX_SCAN = 1024;
const CADENCE = 0.08;
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function materialFor(entity) {
  if (entity.type === 'asteroid') return entity.data?.typeId === 'ast_icy' ? 2 : 1;
  return entity.type === 'ship' ? 0 : 3;
}

function compareIds(a, b) {
  // Runtime IDs are numbers or strings. Keep mixed-type ties stable without allocating strings.
  if (typeof a === typeof b) return a < b ? -1 : a > b ? 1 : 0;
  return typeof a === 'number' ? -1 : 1;
}

function solid(entity, excludeId) {
  if (!entity || entity.id == null || entity.id === excludeId || entity.alive === false
    || entity.active === false || entity.collides === false || entity.data?.respawnAt != null) return false;
  if (entity.type !== 'ship' && entity.type !== 'asteroid' && entity.type !== 'station' && entity.type !== 'wreck') return false;
  return Number.isFinite(entity.pos?.x) && Number.isFinite(entity.pos?.z)
    && Number.isFinite(entity.radius) && entity.radius > 0;
}

/**
 * Read-only neighborhood for visual flow. The query and returned records are retained by this
 * owner; neither a render vertex nor a particle performs a spatial query. Query selection runs
 * at 12.5 Hz; the selected three anchors are interpolated every update to follow the drawn hull.
 *
 * update(state, localX, localZ, radius, excludeId, alpha=1) returns this.
 * records[0..count) are reusable {id,x,z,radius,vx,vz,material,strength}; x/z are frame-local.
 * samplePoint(localX,localZ,out) fills reusable {dx,dz,lift,contact,vx,vz}. This is only decorative
 * displacement. Consumers must keep authoritative footprint vertices and force reach unchanged.
 */
export class FlowEnvironment {
  constructor() {
    this.records = Array.from({ length: FLOW_ENVIRONMENT_CAPACITY }, () => ({
      id: null, x: 0, z: 0, radius: 0, vx: 0, vz: 0, material: 0, strength: 0,
    }));
    this.count = 0;
    this._bodies = new Array(FLOW_ENVIRONMENT_CAPACITY).fill(null);
    this._retained = new Array(FLOW_ENVIRONMENT_CAPACITY).fill(null);
    this._distances = new Float64Array(FLOW_ENVIRONMENT_CAPACITY);
    this._candidates = [];
    this._origin = { x: 0, z: 0 };
    this._anchor = { x: 0, z: 0 };
    this._lastOriginX = this._lastOriginZ = NaN;
    this._lastX = this._lastZ = this._lastRadius = NaN;
    this._lastTime = -Infinity;
    this._cursor = 0;
    this._state = null;
    this._excludeId = null;
    this._sample = { dx: 0, dz: 0, lift: 0, contact: 0, vx: 0, vz: 0 };
    this._visitMap = entity => this._consider(entity);
    this.queryCount = 0;
  }

  update(state, x, z, radius, excludeId, alpha = 1) {
    if (!state || !Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius) || radius <= 0) {
      this.clear(); return this;
    }
    readFrameOrigin(state, this._origin);
    this._x = x; this._z = z; this._radius = radius;
    this._alpha = clamp(finite(alpha, 1), 0, 1);
    const time = finite(state.simTime);
    const originChanged = this._origin.x !== this._lastOriginX || this._origin.z !== this._lastOriginZ;
    const movement = Math.hypot(x - this._lastX, z - this._lastZ);
    let refresh = state !== this._state || excludeId !== this._excludeId || originChanged
      || Math.abs(radius - this._lastRadius) > 0.01 || movement > Math.max(2, radius * 0.025)
      || time < this._lastTime || time - this._lastTime >= CADENCE;
    this._state = state; this._excludeId = excludeId;
    // Destroyed and recycled identities are removed immediately, even during a paused render.
    for (let i = 0; i < this.count; i++) {
      const body = this._bodies[i];
      if (!solid(body, excludeId) || (state.entities?.get && state.entities.get(body.id) !== body)) refresh = true;
    }
    if (refresh) this._select(time);
    this._publish();
    return this;
  }

  _select(time) {
    const state = this._state;
    this.queryCount++;
    this._lastTime = time; this._lastX = this._x; this._lastZ = this._z; this._lastRadius = this._radius;
    this._lastOriginX = this._origin.x; this._lastOriginZ = this._origin.z;
    for (let i = 0; i < FLOW_ENVIRONMENT_CAPACITY; i++) {
      this._retained[i] = this._bodies[i]; this._bodies[i] = null; this._distances[i] = Infinity;
    }
    this.count = 0;
    // Keep good prior candidates while a very large fallback type list is examined in bounded
    // rotating windows. Spatial queries normally cover only a small neighborhood.
    for (let i = 0; i < FLOW_ENVIRONMENT_CAPACITY; i++) this._consider(this._retained[i]);
    if (hasActiveSpatialHash(state.spatialHash)) {
      this._candidates.length = 0;
      state.spatialHash.queryRadius(this._x + this._origin.x, this._z + this._origin.z,
        this._radius, this._candidates, QUERY_OPTIONS);
      this._scan(this._candidates, MAX_SCAN);
      this._candidates.length = 0;
    } else {
      const index = state.entityIndex;
      if (index?.__spacefaceEntityIndexV1 && index.ready === true) {
        for (let i = 0; i < BUCKETS.length; i++) this._scan(index[BUCKETS[i]], MAX_SCAN / BUCKETS.length);
      } else if (Array.isArray(state.entityList)) {
        this._scan(state.entityList, MAX_SCAN);
      } else if (state.entities?.forEach && state.entities.size <= MAX_SCAN) {
        // Small laboratory/fixture states sometimes have only a Map. A bound callback avoids
        // allocating an iterator; large production states must supply their normal index/list.
        state.entities.forEach(this._visitMap);
      }
    }
    this._cursor += MAX_SCAN / BUCKETS.length;
    for (let i = 0; i < FLOW_ENVIRONMENT_CAPACITY; i++) this._retained[i] = null;
  }

  _scan(list, budget) {
    if (!list || !list.length) return;
    const size = list.length;
    const start = size > budget ? this._cursor % size : 0;
    for (let i = 0, n = Math.min(size, budget); i < n; i++) this._consider(list[(start + i) % size]);
  }

  _consider(entity) {
    if (!solid(entity, this._excludeId)) return;
    // Prefer the immutable object occupying the current ID, not a stale indexed identity.
    if (this._state.entities?.get && this._state.entities.get(entity.id) !== entity) return;
    for (let i = 0; i < this.count; i++) if (this._bodies[i] === entity) return;
    presentedAnchorXZ(entity, this._alpha, this._anchor);
    const dx = this._anchor.x - this._origin.x - this._x;
    const dz = this._anchor.z - this._origin.z - this._z;
    const distance = Math.max(0, Math.hypot(dx, dz) - entity.radius);
    if (distance > this._radius) return;
    let at = this.count;
    for (let i = 0; i < this.count; i++) {
      if (distance < this._distances[i] || (distance === this._distances[i]
        && compareIds(entity.id, this._bodies[i].id) < 0)) { at = i; break; }
    }
    if (at >= FLOW_ENVIRONMENT_CAPACITY) return;
    for (let i = Math.min(this.count, FLOW_ENVIRONMENT_CAPACITY - 1); i > at; i--) {
      this._bodies[i] = this._bodies[i - 1]; this._distances[i] = this._distances[i - 1];
    }
    this._bodies[at] = entity; this._distances[at] = distance;
    this.count = Math.min(FLOW_ENVIRONMENT_CAPACITY, this.count + 1);
  }

  _publish() {
    let count = 0;
    for (let i = 0; i < this.count; i++) {
      const body = this._bodies[i];
      presentedAnchorXZ(body, this._alpha, this._anchor);
      const x = this._anchor.x - this._origin.x, z = this._anchor.z - this._origin.z;
      if (Math.hypot(x - this._x, z - this._z) - body.radius > this._radius) continue;
      this._bodies[count] = body;
      const rec = this.records[count++];
      rec.id = body.id; rec.x = x; rec.z = z; rec.radius = body.radius;
      rec.vx = finite(body.vel?.x); rec.vz = finite(body.vel?.z);
      rec.material = materialFor(body); rec.strength = 1;
    }
    this.count = count;
    for (let i = count; i < FLOW_ENVIRONMENT_CAPACITY; i++) {
      this._bodies[i] = null; this.records[i].id = null; this.records[i].radius = 0; this.records[i].strength = 0;
    }
  }

  samplePoint(x, z, out = this._sample) {
    out.dx = out.dz = out.lift = out.contact = out.vx = out.vz = 0;
    if (!Number.isFinite(x) || !Number.isFinite(z)) return out;
    let best = Infinity, selected = null, nx = 0, nz = 0, gap = 0, reach = 0;
    for (let i = 0; i < this.count; i++) {
      const rec = this.records[i];
      const dx = x - rec.x, dz = z - rec.z, distance = Math.hypot(dx, dz);
      const surface = distance - rec.radius;
      const band = Math.max(2, Math.min(24, rec.radius * 0.65));
      if (surface > band || surface < -band * 1.5 || Math.abs(surface) >= best) continue;
      best = Math.abs(surface); selected = rec; gap = surface; reach = band;
      nx = distance > 1e-6 ? dx / distance : 1; nz = distance > 1e-6 ? dz / distance : 0;
    }
    if (!selected) return out;
    const contact = Math.pow(Math.max(0, 1 - Math.abs(gap) / (gap < 0 ? reach * 1.5 : reach)), 2) * selected.strength;
    const tx = -nz, tz = nx;
    const shear = clamp(selected.vx * tx + selected.vz * tz, -60, 60) * 0.018 * contact;
    const outward = (Math.max(0, -gap) + reach * 0.18) * contact;
    out.dx = nx * outward + tx * shear; out.dz = nz * outward + tz * shear;
    out.lift = Math.min(4, selected.radius * (selected.material === 1 ? 0.18 : 0.11)) * contact;
    out.contact = contact; out.vx = selected.vx * contact; out.vz = selected.vz * contact;
    return out;
  }

  clear() {
    this.count = 0; this._state = null; this._lastTime = -Infinity; this._candidates.length = 0;
    for (let i = 0; i < FLOW_ENVIRONMENT_CAPACITY; i++) {
      this._bodies[i] = this._retained[i] = null;
      this.records[i].id = null; this.records[i].radius = 0; this.records[i].strength = 0;
    }
    return this;
  }
}
