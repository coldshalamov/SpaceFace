// NOCTURNE's fixed-residency forward backend. It can adopt the existing 6 point / 3 spot census;
// logical source count never changes the shader's light count. Tiled/clustered rendering is an
// optional future backend, not a reason to change the material pipeline without measurements.
import * as THREE from 'three';
import { NocturneRegistry } from './registry.js';
import { NocturneShadowBudget } from './shadows.js';
import { noteShadowCensusLightMutation } from '../shadowDepthAdmission.js';

const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const kindFor = (source) => source.type === 'area' ? 'spot' : source.type;
const DEFAULT_FRAME_OPTIONS = Object.freeze({});
function usable(source) {
  if (!source || !source.registered || !source.enabled || !(source.gain > 0)
    || !Number.isFinite(source.intensity) || !(source.intensity > 0)) return false;
  const p = source.position, c = source.color, t = source.target;
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)
    && Number.isFinite(c.r) && Number.isFinite(c.g) && Number.isFinite(c.b)
    && (source.type === 'point' || (Number.isFinite(t.x) && Number.isFinite(t.y) && Number.isFinite(t.z)));
}

export class NocturneDirector {
  constructor(scene, { registry = new NocturneRegistry(), pointLights = null, spotLights = null,
    directionalLights = [], pointCount = 6, spotCount = 3, shadowCount = 1,
    shadowResolution = 512, renderer = null, selectionHz = 8, hysteresis = 0.3,
    maxDistance = 1400, fadeSeconds = 0.18, profile = false, shadowUpdateHz = 15 } = {}) {
    this.registry = registry;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'SF_NOCTURNE';
    this.slots = [];
    this.selectionInterval = 1 / Math.max(1, finite(selectionHz, 8));
    this.hysteresis = Math.max(0, finite(hysteresis, 0.3));
    this.maxDistance = Math.max(1, finite(maxDistance, 1400));
    this.fadeSeconds = Math.max(0.001, finite(fadeSeconds, 0.18));
    this.profile = profile;
    this._clock = Infinity;
    this._registryVersion = -1;
    this._cameraMatrix = new THREE.Matrix4();
    this._frustum = new THREE.Frustum();
    this._sphere = new THREE.Sphere();
    this._cameraPosition = new THREE.Vector3();
    this._viewPosition = new THREE.Vector3();
    this._enabled = true;
    this._shadowEnabled = true;
    this._append('point', pointLights, pointCount);
    this._append('spot', spotLights, spotCount);
    this._append('directional', directionalLights, 0);
    if (this.group.children.length) scene?.add(this.group);
    this.shadowBudget = new NocturneShadowBudget(this.slots, { renderer, count: shadowCount, resolution: shadowResolution,
      movingHz: shadowUpdateHz });
    this._shadowOptions = { enabled: true, casterEpoch: 0, renderer };
    this._selected = new Array(this.slots.length).fill(null);
    this._scores = new Float64Array(this.slots.length);
    this._claimed = new Uint8Array(this.slots.length);
    this._diag = { backend: 'bounded-forward', logical: 0, candidates: 0, active: 0,
      points: 0, spots: 0, directionals: 0, shadowMaps: this.shadowBudget.count,
      shadowUpdates: 0, replacements: 0, selections: 0, rejected: 0, areaApproximation: 'wide-spot',
      selectionCpuMs: 0, updateCpuMs: 0, shadowMapsAllocated: 0, shadowTexels: 0, shadowUpdateRequested: false };
    for (const slot of this.slots) {
      if (slot.kind === 'point') this._diag.points++;
      if (slot.kind === 'spot') this._diag.spots++;
      if (slot.kind === 'directional') this._diag.directionals++;
    }
    noteShadowCensusLightMutation();
  }

  _append(kind, adopted, count) {
    const length = adopted ? adopted.length : Math.max(0, Math.floor(count));
    for (let i = 0; i < length; i++) {
      let light = adopted && (adopted[i].obj || adopted[i].light || adopted[i]);
      const owned = !light;
      if (!light) {
        light = kind === 'spot' ? new THREE.SpotLight(0xffffff, 0, 450, 0.6, 0.6, 2)
          : kind === 'directional' ? new THREE.DirectionalLight(0xffffff, 0)
            : new THREE.PointLight(0xffffff, 0, 150, 2);
        light.name = `SF_Nocturne_${kind}_${i}`;
        this.group.add(light);
        if (light.target) this.group.add(light.target);
      }
      light.visible = true;
      light.intensity = 0;
      this.slots.push({ index: this.slots.length, kind, light, owned, shadow: false,
        source: null, pending: null, level: 0, score: 0 });
    }
  }

  invalidate() { this._clock = Infinity; this.shadowBudget.invalidate(); }
  getDiagnostics() { return this._diag; }

  _score(source, camera) {
    if (!usable(source)) return 0;
    const p = source.position;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return 0;
    const distance2 = p.distanceToSquared(this._cameraPosition);
    const range = Math.max(1, finite(source.range, 1));
    if (kindFor(source) !== 'directional') {
      if (!source.critical && distance2 > (this.maxDistance + range) ** 2) return 0;
      this._sphere.center.copy(p);
      this._sphere.radius = range;
      if (camera && !this._frustum.intersectsSphere(this._sphere)) return 0;
    }
    let projected = 1;
    if (camera) {
      this._viewPosition.copy(p).applyMatrix4(camera.matrixWorldInverse);
      projected = range * Math.abs(camera.projectionMatrix.elements[5]);
      if (camera.isPerspectiveCamera) projected /= Math.max(range * 0.25, -this._viewPosition.z);
      projected = clamp(projected * projected, 0.015, 6);
    }
    const priority = clamp(finite(source.priority, 2), 0, 4);
    const luminance = Math.max(0.001, source.color.r * 0.2126 + source.color.g * 0.7152 + source.color.b * 0.0722);
    const energy = Math.log2(1 + source.intensity * source.gain * luminance);
    let score = projected * energy * (2 ** priority) * Math.max(0.001, finite(source.importance, 1))
      / (1 + Math.sqrt(distance2) / (range * 4));
    if (source.critical) score *= 4;
    for (const slot of this.slots) if (slot.source === source || slot.pending === source) { score *= 1 + this.hysteresis; break; }
    return score;
  }

  _select(camera) {
    const start = this.profile && typeof performance !== 'undefined' ? performance.now() : 0;
    this._selected.fill(null);
    this._scores.fill(0);
    this._claimed.fill(0);
    this._diag.candidates = 0;
    // Cache one camera score per source; choose at most the tiny fixed slot count. No sort,
    // heap queue, callbacks or temporary arrays. Shadow-required candidates never fall through
    // to an unshadowed slot after another source displaces them.
    for (const source of this.registry.sources) {
      source._selectionScore = this._score(source, camera);
      if (source._selectionScore > 0) this._diag.candidates++;
    }
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      for (const source of this.registry.sources) {
        if (kindFor(source) !== slot.kind || !(source._selectionScore > this._scores[i])) continue;
        if (slot.shadow && (!this._shadowEnabled || !source.shadow)) continue;
        if (!slot.shadow && source.requiresOcclusion) continue;
        let selected = false;
        for (let j = 0; j < i; j++) if (this._selected[j] === source) { selected = true; break; }
        if (selected) continue;
        this._selected[i] = source;
        this._scores[i] = source._selectionScore;
      }
    }
    // Keep winners in their current GPU slots whenever the shadow constraint allows it.
    for (const slot of this.slots) {
      const held = slot.pending || slot.source;
      slot.pending = null;
      if (!held) continue;
      for (let i = 0; i < this._selected.length; i++) {
        if (!this._claimed[i] && this._selected[i] === held
          && this.slots[i].shadow === slot.shadow && this.slots[i].kind === slot.kind) {
          slot.pending = held; slot.score = this._scores[i]; this._claimed[i] = 1; break;
        }
      }
    }
    for (const slot of this.slots) {
      if (slot.pending) continue;
      for (let i = 0; i < this._selected.length; i++) {
        if (!this._claimed[i] && this._selected[i]
          && this.slots[i].shadow === slot.shadow && this.slots[i].kind === slot.kind) {
          slot.pending = this._selected[i]; slot.score = this._scores[i]; this._claimed[i] = 1; break;
        }
      }
    }
    this._diag.selections++;
    this._diag.selectionCpuMs = this.profile && typeof performance !== 'undefined' ? performance.now() - start : 0;
  }

  update(dt, camera, options = DEFAULT_FRAME_OPTIONS) {
    const start = this.profile && typeof performance !== 'undefined' ? performance.now() : 0;
    const step = Math.max(0, finite(dt, 0));
    const enabled = options.enabled !== false;
    const shadowEnabled = options.shadowEnabled !== false;
    this.registry.tick(step);
    this._clock += step;
    if (camera) {
      this._cameraPosition.setFromMatrixPosition(camera.matrixWorld);
      this._cameraMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      this._frustum.setFromProjectionMatrix(this._cameraMatrix);
    }
    if (enabled !== this._enabled || shadowEnabled !== this._shadowEnabled) this._clock = Infinity;
    this._enabled = enabled;
    this._shadowEnabled = shadowEnabled;
    if (this._clock >= this.selectionInterval || this._registryVersion !== this.registry.version) {
      this._registryVersion = this.registry.version;
      this._clock = 0;
      this._select(camera);
    }
    let active = 0;
    for (const slot of this.slots) {
      let source = slot.source;
      const valid = usable(source);
      if (!valid) slot.level = 0;
      const fade = (source?.priority >= 3 || slot.pending?.priority >= 3) ? 0.035 : this.fadeSeconds;
      const rate = step / fade;
      slot.level = source === slot.pending && valid && enabled
        ? Math.min(1, slot.level + rate) : Math.max(0, slot.level - rate);
      if (slot.level <= 0 && slot.source !== slot.pending) {
        if (slot.source) this._diag.replacements++;
        slot.source = slot.pending;
        source = slot.source;
        // An event owns its attack/decay envelope already. A post-VFX flush has dt=0 and must
        // still light the same frame; adding a second residency attack would hide short flashes.
        if (source && enabled) slot.level = source.priority >= 3 ? 1 : Math.min(1, rate);
      }
      const light = slot.light;
      if (!enabled || !usable(source)
        || (slot.shadow && !shadowEnabled)) { light.intensity = 0; continue; }
      light.position.copy(source.position);
      light.color.copy(source.color);
      light.decay = Math.max(0, finite(source.decay, 2));
      light.distance = Math.max(1, finite(source.range, 1));
      if (light.target) {
        light.target.position.copy(source.target);
        light.target.updateMatrixWorld();
      }
      if (slot.kind === 'spot') {
        // Area-like fixtures use one wide, soft spot; this is not a rectangular-area BRDF.
        light.angle = clamp(source.type === 'area' ? Math.max(0.8, source.angle) : source.angle, 0.025, Math.PI / 2 - 0.01);
        light.penumbra = source.type === 'area' ? 1 : clamp(source.penumbra, 0, 1);
      }
      const eased = slot.level * slot.level * (3 - 2 * slot.level);
      light.intensity = Math.max(0, finite(source.intensity, 0)) * source.gain * eased;
      if (light.intensity > 0) active++;
    }
    this._shadowOptions.enabled = enabled && shadowEnabled;
    this._shadowOptions.casterEpoch = options.casterEpoch || 0;
    this._shadowOptions.renderer = options.renderer || this.shadowBudget.renderer;
    this.shadowBudget.update(step, this._shadowOptions);
    this._diag.logical = this.registry.size;
    this._diag.active = active;
    this._diag.rejected = this.registry.rejected;
    this._diag.shadowUpdates = this.shadowBudget.updates;
    this._diag.shadowMapsAllocated = 0;
    this._diag.shadowTexels = 0;
    this._diag.shadowUpdateRequested = this.shadowBudget.requested;
    for (const record of this.shadowBudget.records) {
      const map = record.slot.light.shadow.map;
      if (map) { this._diag.shadowMapsAllocated++; this._diag.shadowTexels += map.width * map.height; }
    }
    this._diag.updateCpuMs = this.profile && typeof performance !== 'undefined' ? performance.now() - start : 0;
    return this._diag;
  }

  clear() {
    for (const slot of this.slots) { slot.source = null; slot.pending = null; slot.level = 0; slot.light.intensity = 0; }
    this._clock = Infinity;
    this.shadowBudget.invalidate();
  }

  dispose({ disposeGpu = true } = {}) {
    if (this._disposed) return;
    this._disposed = true;
    this.clear();
    this.shadowBudget.dispose({ disposeGpu });
    this.group.removeFromParent();
    if (disposeGpu) for (const slot of this.slots) if (slot.owned) slot.light.dispose?.();
    this.group.clear();
    this.slots.length = 0;
    this._selected.fill(null);
    this._shadowOptions.renderer = null;
    this.registry = null;
    this.scene = null;
    noteShadowCensusLightMutation();
  }
}
