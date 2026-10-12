/**
 * One scene-level registry for the EXISTING material pools. It allocates no particles or lights.
 * Local render owners keep their source/lifecycle logic; this coordinator exposes their combined
 * pressure and their strongest real surface response to vfx.js's existing six-light budget.
 */
const scenes = new WeakMap();
export function registerMaterialOwner(owner) {
  let node = owner.renderer;
  for (let i = 0; node && !node.isScene && i < 32; i++) node = node.parent;
  const scene = node?.isScene ? node : null;
  if (owner._materialScene === scene) return;
  unregisterMaterialOwner(owner);
  if (!scene) return;
  let owners = scenes.get(scene);
  if (!owners) { owners = new Set(); scenes.set(scene, owners); }
  owners.add(owner); owner._materialScene = scene;
}
export function unregisterMaterialOwner(owner) {
  const scene = owner._materialScene;
  if (!scene) return;
  const owners = scenes.get(scene);
  owners?.delete(owner);
  if (!owners?.size) scenes.delete(scene);
  owner._materialScene = null;
}
export function createMaterialContactRead() {
  return { active: false, x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, intensity: 0, range: 0 };
}
/** out is retained by vfx.js. No scene traversal, allocations, entity reads or simulation writes. */
export function readMaterialContact(scene, out) {
  out.active = false; out.intensity = 0;
  const owners = scenes.get(scene);
  if (!owners) return out;
  for (const owner of owners) {
    const contact = owner.contactLight;
    if (owner.disposed || !owner.live || !contact?.active || contact.intensity <= out.intensity) continue;
    out.active = true;
    out.x = contact.x; out.y = contact.y; out.z = contact.z;
    out.r = contact.r; out.g = contact.g; out.b = contact.b;
    out.intensity = contact.intensity; out.range = contact.range;
  }
  return out;
}
export function inspectMaterialScene(scene) {
  const result = { schema: 'spaceface.living-vfx.v1', owners: 0, live: 0, capacity: 0, dropped: 0, batches: 0 };
  for (const owner of scenes.get(scene) || []) {
    if (owner.disposed) continue;
    result.owners++; result.live += owner.live; result.capacity += owner.capacity;
    result.dropped += owner.stats.dropped; result.batches += owner.renderer.batches.length;
  }
  return result;
}
