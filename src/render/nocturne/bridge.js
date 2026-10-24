// Compatibility adapters publish logical light requests. They never mount extra GPU lights.
// A WeakMap keeps renderer-owned objects out of scene.userData (Three clones that as JSON).
import { Color, Vector3 } from 'three';

const owners = new WeakMap();
export function bindNocturneScene(scene, owner) { if (scene) owners.set(scene, owner); }
export function unbindNocturneScene(scene, owner) { if (owners.get(scene) === owner) owners.delete(scene); }
export function nocturneForScene(scene) { return scene ? owners.get(scene) || null : null; }

export function eventPriorityClass(priority) {
  // VFX admission priorities are normalized to [0, 1].
  return priority >= 0.7 ? 3 : priority >= 0.3 ? 2 : 1;
}

/** PointLight-shaped, CPU-only view over a registry source; existing VFX keep their envelopes. */
export function createLogicalLight(registry, id, type = 'point', options = {}) {
  const source = registry.register(id, {
    type, color: 0xffffff, intensity: 0, range: 400, decay: 2,
    priority: 1, ...options,
  });
  if (!source) throw new Error(`NOCTURNE registry capacity exhausted for ${id}`);
  const target = { position: source.target, updateMatrixWorld() {} };
  const proxy = {
    name: id, position: source.position, color: source.color, target,
    visible: true, parent: null, _nocturneSource: source,
    removeFromParent() {},
    dispose() {
      // A retiring presenter can dispose twice after a replacement reused the same logical
      // name. The old handle must never unregister the replacement generation.
      if (registry.get(id) === source) registry.unregister(id);
    },
  };
  Object.defineProperties(proxy, {
    intensity: { get: () => source.intensity, set(value) {
      const next = Number.isFinite(value) ? Math.max(0, value) : 0;
      if ((next > 0) !== (source.intensity > 0)) registry.invalidate();
      source.intensity = next;
    } },
    distance: { get: () => source.range, set: value => { source.range = Math.max(0, Number(value) || 0); } },
    decay: { get: () => source.decay, set: value => { source.decay = Math.max(0, Number(value) || 0); } },
    angle: { get: () => source.angle, set: value => { source.angle = value; } },
    penumbra: { get: () => source.penumbra, set: value => { source.penumbra = value; } },
    castShadow: { get: () => source.shadow, set: value => { source.shadow = value === true; } },
  });
  return proxy;
}

// A small CPU light record for fixtures which deliberately run without a full renderer.
export function emptyLogicalLight() {
  return { position: new Vector3(), color: new Color(), intensity: 0, distance: 0 };
}
