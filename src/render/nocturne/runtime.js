// One owner for source admission, fixed direct lights, local indirect fields, atmosphere and
// constrained exposure. Game entities and their data are read-only inputs to this adapter.
import { PointLight, Vector2 } from 'three';
import { NocturneRegistry } from './registry.js';
import { NocturneDirector } from './director.js';
import { NocturneContent } from './content.js';
import { NocturneHeadlightSources } from './headlightSources.js';
import { createNocturneAtmosphere } from './atmosphere.js';
import { bindNocturneScene, createLogicalLight, unbindNocturneScene } from './bridge.js';
import { noteShadowCensusLightMutation } from '../shadowDepthAdmission.js';

export const NOCTURNE_GPU_POINTS = 8;
export const NOCTURNE_QUALITY = Object.freeze({
  integrated: Object.freeze({ shadowResolution: 256, shadowHz: 10 }),
  balanced: Object.freeze({ shadowResolution: 512, shadowHz: 15 }),
  high: Object.freeze({ shadowResolution: 1024, shadowHz: 20 }),
});
const EMPTY = Object.freeze({});
const BOUNDARY_EVENTS = ['save:restoring', 'game:new', 'game:exitToMenu', 'sector:exit'];

export function resolveNocturneQuality(video = EMPTY, gpu = EMPTY) {
  const requested = video.nocturneQuality;
  if (NOCTURNE_QUALITY[requested]) return requested;
  if (video.qualityPreset === 'integrated' || video.qualityPreset === 'igpu60' || video.qualityPreset === 'low'
    || gpu.tier === 'integrated' || gpu.tier === 'software') return 'integrated';
  return video.qualityPreset === 'max' || video.qualityPreset === 'high' ? 'high' : 'balanced';
}

export class NocturneRuntime {
  constructor({ scene, renderer, state, headlights, gpu = EMPTY, bus = null }) {
    this.scene = scene; this.renderer = renderer; this.state = state; this.gpu = gpu;
    this.registry = new NocturneRegistry({ capacity: 512 });
    this.quality = resolveNocturneQuality(state?.settings?.video, gpu);
    const budget = NOCTURNE_QUALITY[this.quality];
    this.pointLights = Array.from({ length: NOCTURNE_GPU_POINTS }, (_, i) => {
      const light = new PointLight(0xffffff, 0, 400, 2);
      light.name = `SF_Nocturne_Point_${i}`;
      scene.add(light);
      return light;
    });
    this.director = new NocturneDirector(scene, { registry: this.registry,
      pointLights: this.pointLights, spotLights: headlights.slots,
      renderer, shadowCount: 1, shadowResolution: budget.shadowResolution,
      shadowUpdateHz: budget.shadowHz });
    this.shadowLight = this.director.shadowBudget.records[0]?.slot.light || null;
    this.shadowConfigured = !!this.shadowLight;
    // Pin the structural shadow sampler before any material warm-up. Settings disable work and
    // contribution, not the shader's shadow/light census.
    if (renderer?.shadowMap && this.shadowConfigured) renderer.shadowMap.enabled = true;
    this.headlights = new NocturneHeadlightSources(this.registry);
    this.content = new NocturneContent(this.registry);
    this.atmosphere = null;
    this.bloom = null;
    this.graph = null;
    this.enabled = true;
    this.shadowsEnabled = true;
    this.exposure = 1;
    this.exposureBase = 1;
    this._exposureOptions = { exposure: 1 };
    this._options = { meshes: null, camera: null, playerLamp: true, reducedFlash: false };
    this._directorOptions = { enabled: true, shadowEnabled: true, casterEpoch: 0, renderer };
    this._lightInputs = [this.shadowLight, ...headlights.slots.map(s => s.light).filter(l => l !== this.shadowLight), ...this.pointLights];
    this._subscriptions = [];
    this._proxies = new Map();
    this._lastOrigin = { x: NaN, z: NaN };
    this._originScratch = { x: 0, z: 0 };
    this._originGlobal = { x: 0, z: 0 };
    this._diagnostics = { version: 1, enabled: true, quality: this.quality,
      backend: 'bounded-forward', composition: 'vacuum', exposure: 1,
      direct: this.director.getDiagnostics(), content: this.content.diagnostics,
      atmosphere: null, hardwareAcceptance: 'not-measured' };
    bindNocturneScene(scene, this);
    if (bus?.on) for (const event of BOUNDARY_EVENTS) {
      const callback = () => this.clear();
      const off = bus.on(event, callback);
      this._subscriptions.push(typeof off === 'function' ? off : () => bus.off?.(event, callback));
    }
    noteShadowCensusLightMutation();
  }

  createLight(id, type = 'point', options = EMPTY) {
    const existing = this._proxies.get(id);
    if (existing && existing._nocturneSource.registered) return existing;
    const proxy = createLogicalLight(this.registry, id, type, options);
    this._proxies.set(id, proxy);
    return proxy;
  }

  attachPost(bloom) {
    if (!bloom?.attachAtmosphere) return false;
    this.bloom = bloom;
    const size = new Vector2();
    this.renderer.getDrawingBufferSize(size);
    this.atmosphere?.dispose();
    this.atmosphere = createNocturneAtmosphere(this.renderer, size.x, size.y, { quality: this.quality });
    this.atmosphere.setMedia(this.content.media);
    this.atmosphere.setLights(this._lightInputs);
    bloom.attachAtmosphere(this.atmosphere);
    this.graph?.attachAtmosphere(this.atmosphere);
    return true;
  }

  attachGraph(graph) {
    this.graph = graph;
    graph?.attachAtmosphere(this.atmosphere);
  }

  setExposureBase(value) { this.exposureBase = Number.isFinite(value) && value > 0 ? value : 1; }
  setEnabled(value) {
    this.enabled = value !== false;
    const video = this.state?.settings?.video || EMPTY;
    const active = this.enabled && video.nocturne !== false;
    this._directorOptions.enabled = active;
    this._directorOptions.shadowEnabled = active && video.nocturneShadows !== false;
    this.shadowsEnabled = this._directorOptions.shadowEnabled;
    this.director.invalidate();
    this.atmosphere?.setEnabled(active && video.nocturneAtmosphere !== false && video.postFx !== false);
    this.atmosphere?.invalidateHistory('lighting-toggle');
    if (!active) this.content.probes.clear();
  }

  prepare(dt, camera, membrane, meshes, playerLamp = true) {
    const video = this.state?.settings?.video || EMPTY;
    const step = Math.min(0.25, Math.max(0, Number.isFinite(dt) ? dt : 0));
    const quality = resolveNocturneQuality(video, this.gpu);
    if (quality !== this.quality) {
      this.quality = quality;
      // Keep the map allocation stable mid-flight; changing a preset adjusts cadence and the
      // volume resolution. A new renderer generation chooses the shadow texture resolution.
      this.director.shadowBudget.setMovingHz(NOCTURNE_QUALITY[quality].shadowHz);
      this.atmosphere?.setQuality(quality);
    }
    const enabled = this.enabled && video.nocturne !== false;
    this.shadowsEnabled = enabled && video.nocturneShadows !== false;
    const options = this._options;
    options.meshes = meshes; options.camera = camera; options.playerLamp = playerLamp;
    options.reducedFlash = !!(this.state.settings?.accessibility?.flashReduce || video.flashReduce);
    camera?.updateMatrixWorld();
    this.content.probes.enabled = enabled;
    this.content.update(this.state, step, membrane, options);
    this.headlights.update(this.state, step, membrane, options);
    if (membrane?.toLocal) {
      membrane.toLocal(this._originGlobal, this._originScratch);
      if (Number.isFinite(this._lastOrigin.x)
        && (this._lastOrigin.x !== this._originScratch.x || this._lastOrigin.z !== this._originScratch.z)) {
        this.director.invalidate(); this.atmosphere?.invalidateHistory('floating-origin');
      }
      this._lastOrigin.x = this._originScratch.x; this._lastOrigin.z = this._originScratch.z;
    }
    const direct = this._directorOptions;
    direct.enabled = enabled; direct.shadowEnabled = this.shadowsEnabled;
    direct.casterEpoch = this.content.casterEpoch;
    this.director.update(step, camera, direct);
    this.atmosphere?.setEnabled(enabled && video.nocturneAtmosphere !== false && video.postFx !== false);
    // Authored adaptation, not histogram metering: darkness never asks the camera to brighten it.
    const range = this.content.exposureRange;
    const factor = enabled ? Math.max(range[0], Math.min(range[1], this.content.exposureTarget)) : 1;
    const target = this.exposureBase * factor;
    this.exposure += (target - this.exposure) * (1 - Math.exp(-step / 2.5));
    this._exposureOptions.exposure = this.exposure;
    this.bloom?.setOptions(this._exposureOptions);
    this.graph?.setOptions(this._exposureOptions);
    if (this.renderer) this.renderer.toneMappingExposure = this.exposure;
    const diag = this._diagnostics;
    diag.enabled = enabled; diag.quality = this.quality; diag.composition = this.content.compositionId;
    diag.exposure = this.exposure;
  }

  /** VFX runs after prepareFrame; publish its same-frame requests without advancing clocks twice. */
  flush(camera) {
    this.director.update(0, camera, this._directorOptions);
    for (const slot of this.director.slots) slot.light.updateMatrixWorld();
    if (this.shadowConfigured && this.renderer?.shadowMap) {
      this.renderer.shadowMap.enabled = true;
      if (this.director.shadowBudget.requested) this.renderer.shadowMap.needsUpdate = true;
    }
  }

  getDiagnostics() {
    this._diagnostics.atmosphere = this.atmosphere?.getDiagnostics() || null;
    return this._diagnostics;
  }
  clear() {
    this.headlights.clear(); this.content.clear(); this.director.clear();
    for (const proxy of this._proxies.values()) proxy.intensity = 0;
    this.atmosphere?.invalidateHistory('world-boundary');
    this._lastOrigin.x = NaN;
  }
  dispose({ disposeGpu = true } = {}) {
    if (this._disposed) return;
    this._disposed = true;
    for (const off of this._subscriptions) off();
    this._subscriptions.length = 0;
    this.bloom?.attachAtmosphere(null, { disposeGpu });
    this.graph?.attachAtmosphere(null);
    this.atmosphere?.dispose({ disposeGpu });
    this.atmosphere = null;
    this.content.dispose({ disposeGpu }); this.headlights.dispose(); this.director.dispose({ disposeGpu });
    for (const light of this.pointLights) {
      light.removeFromParent();
      if (disposeGpu) light.dispose?.();
    }
    this.registry.clear(); this._proxies.clear();
    unbindNocturneScene(this.scene, this);
    // The diagnostics port can outlive a renderer generation. It must not retain that world's
    // meshes, camera, scene, post graph, or disposed light objects through its old runtime.
    this._options.meshes = null; this._options.camera = null;
    this._directorOptions.renderer = null;
    this._directorOptions.enabled = false; this._directorOptions.shadowEnabled = false;
    this._lightInputs.length = 0; this.pointLights.length = 0;
    this.shadowLight = null; this.shadowConfigured = false;
    this.enabled = false; this.shadowsEnabled = false;
    this._diagnostics.enabled = false; this._diagnostics.atmosphere = null;
    this.bloom = null; this.graph = null;
    this.scene = null; this.renderer = null; this.state = null; this.gpu = null;
  }
}
