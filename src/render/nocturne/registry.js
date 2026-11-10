// NOCTURNE logical sources. This is presentation state, never serialized game state.
// Admission may allocate; tick and direct source updates reuse their records/vectors.
import * as THREE from 'three';

export const NOCTURNE_PRIORITY = Object.freeze({ decoration: 0, secondary: 1, fixture: 2, event: 3, critical: 4 });
export const NOCTURNE_SOURCE_TYPES = Object.freeze(['point', 'spot', 'directional', 'area']);

const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;
const unit = (n, fallback = 1) => Math.max(0, Math.min(1, finite(n, fallback)));
function vector(out, input) {
  if (!input) return;
  out.set(finite(input.x ?? input[0], 0), finite(input.y ?? input[1], 0), finite(input.z ?? input[2], 0));
}

/** A finite catalogue can describe hundreds of sources without constructing a THREE.Light. */
export class NocturneRegistry {
  constructor({ capacity = 1024 } = {}) {
    this.capacity = Math.max(1, Math.floor(finite(capacity, 1024)));
    this.sources = [];
    this.byId = new Map();
    this.version = 0;
    this.rejected = 0;
    this._generation = 0;
  }

  get size() { return this.sources.length; }
  get(id) { return this.byId.get(id) || null; }
  invalidate() { this.version++; }

  register(id, descriptor = {}) {
    if (id == null) return null;
    const existing = this.byId.get(id);
    if (existing) return this.update(id, descriptor);
    if (this.sources.length >= this.capacity) { this.rejected++; return null; }
    const source = {
      id, generation: ++this._generation, index: this.sources.length, registered: true,
      type: 'point', position: new THREE.Vector3(), target: new THREE.Vector3(1, 0, 0),
      direction: new THREE.Vector3(1, 0, 0), color: new THREE.Color(0xffffff),
      intensity: 0, range: 150, decay: 2, angle: 0.6, penumbra: 0.6,
      priority: NOCTURNE_PRIORITY.fixture, importance: 1, critical: false,
      shadow: false, requiresOcclusion: false, stationary: false,
      enabled: true, power: 1, damage: 0, gain: 1, age: 0, ttl: Infinity,
      attack: 0, hold: Infinity, envelopeDecay: 0,
      owner: null, socket: null, socketObject: null, offset: new THREE.Vector3(),
      localDirection: new THREE.Vector3(1, 0, 0), useDirection: false,
      _ownerVisible: true, _lastEnabled: true, _selectionScore: 0,
    };
    this.byId.set(id, source);
    this.sources.push(source);
    this._apply(source, descriptor);
    this.version++;
    return source;
  }

  update(id, patch) {
    const source = this.byId.get(id);
    if (!source || !patch) return source || null;
    this._apply(source, patch);
    this.version++;
    return source;
  }

  _apply(source, patch) {
    if (patch.type != null && NOCTURNE_SOURCE_TYPES.includes(patch.type)) source.type = patch.type;
    vector(source.position, patch.position);
    vector(source.target, patch.target);
    if (patch.direction) {
      vector(source.direction, patch.direction);
      if (source.direction.lengthSq() < 1e-12) source.direction.set(1, 0, 0);
      source.direction.normalize();
      source.localDirection.copy(source.direction);
      source.useDirection = true;
    } else if (patch.target) source.useDirection = false;
    if (patch.color != null) source.color.set(patch.color);
    if (patch.colorHex != null) source.color.setHex(patch.colorHex);
    for (const key of ['intensity', 'range', 'decay', 'importance', 'angle', 'penumbra']) {
      if (patch[key] != null) source[key] = Math.max(0, finite(patch[key], source[key]));
    }
    if (patch.priority != null) source.priority = Math.max(0, Math.min(4, finite(patch.priority, 2)));
    if (patch.power != null) source.power = unit(patch.power);
    if (patch.damage != null) source.damage = unit(patch.damage, 0);
    for (const key of ['enabled', 'critical', 'stationary', 'shadow', 'requiresOcclusion']) {
      if (patch[key] != null) source[key] = !!patch[key];
    }
    if (patch.ttl != null) source.ttl = patch.ttl === Infinity ? Infinity : Math.max(0, finite(patch.ttl, 0));
    if (patch.age != null) source.age = Math.max(0, finite(patch.age, 0));
    if (patch.envelope) {
      source.attack = Math.max(0, finite(patch.envelope.attack, 0));
      source.hold = patch.envelope.hold === Infinity || patch.envelope.hold == null
        ? Infinity : Math.max(0, finite(patch.envelope.hold, 0));
      source.envelopeDecay = Math.max(0, finite(patch.envelope.decay, 0));
    }
    if ('owner' in patch) source.owner = patch.owner || null;
    if ('socket' in patch) source.socket = patch.socket || null;
    if ('owner' in patch || 'socket' in patch) {
      source.socketObject = source.socket && source.owner?.getObjectByName
        ? source.owner.getObjectByName(source.socket) : source.owner;
      // A missing explicitly named socket is dark; silently moving it to the origin is not safe.
      source._ownerVisible = !source.owner || !!source.socketObject;
    }
    vector(source.offset, patch.offset);
  }

  unregister(id) {
    const source = this.byId.get(id);
    if (!source) return false;
    this.byId.delete(id);
    const last = this.sources.pop();
    if (last !== source) { this.sources[source.index] = last; last.index = source.index; }
    source.registered = false;
    source.enabled = false;
    source.gain = 0;
    this.version++;
    return true;
  }

  clear() {
    for (const source of this.sources) { source.registered = false; source.enabled = false; source.gain = 0; }
    this.sources.length = 0;
    this.byId.clear();
    this.version++;
  }

  /** The caller updates render-root matrices once; this reads sockets without scene traversal. */
  tick(dt) {
    const step = Math.max(0, finite(dt, 0));
    for (let i = this.sources.length - 1; i >= 0; i--) {
      const source = this.sources[i];
      if (source.enabled !== source._lastEnabled) {
        source._lastEnabled = source.enabled;
        this.version++;
      }
      source.age += step;
      if (source.age >= source.ttl) { this.unregister(source.id); continue; }
      if (source.owner) {
        const node = source.socketObject;
        let visible = !!node && (source.owner.parent != null || source.owner.isScene === true);
        let reachesOwner = false;
        for (let p = node; p && visible; p = p.parent) {
          if (p === source.owner) reachesOwner = true;
          if (p.visible === false) visible = false;
        }
        // A destroyed/replaced socket may remain alive as a cached Object3D reference. It
        // must still belong to the declared owner before it can illuminate the old position.
        source._ownerVisible = visible && reachesOwner;
        if (node && node.matrixWorld) {
          source.position.copy(source.offset).applyMatrix4(node.matrixWorld);
          source.direction.copy(source.localDirection).transformDirection(node.matrixWorld);
          source.target.copy(source.direction).multiplyScalar(Math.max(1, source.range)).add(source.position);
        }
      } else if (source.useDirection) {
        source.target.copy(source.direction).multiplyScalar(Math.max(1, source.range)).add(source.position);
      }
      let envelope = source.attack > 0 ? Math.min(1, source.age / source.attack) : 1;
      const releaseAge = source.age - source.attack - source.hold;
      if (releaseAge > 0) envelope *= source.envelopeDecay > 0 ? Math.exp(-releaseAge * source.envelopeDecay) : 0;
      source.gain = source.enabled && source._ownerVisible
        ? envelope * unit(source.power) * (1 - unit(source.damage, 0)) : 0;
    }
  }
}
