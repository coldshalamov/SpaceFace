import { cloneMaterialPreservingShaderHooks } from '../materialClone.js';

// Readability on released station windows and berth lamps. This owner changes only the
// emissive strength of the station's own named mesh surfaces; it creates no geometry, lamps,
// motion or simulation state. Emission is independent of the sun, as real self-lit glass is.
const SURFACE = /(?:^|_)(?:Lights_(?:Warm|Cyan)|HOOK_NAV_(?:PORT|STARBOARD))$/;
export const STATION_NIGHT_STATION_CAP = 16;
export const STATION_NIGHT_SURFACE_CAP = 64;
export const STATION_NIGHT_REFRESH_S = 1;
export const STATION_NIGHT_GAIN = 1.35;

export class StationNightLightLayer {
  constructor() {
    this.slots = new Map();
    this.epoch = 0;
    this.sector = null;
    this.activeSlot = null;
    this.visit = (node) => this._visit(node);
  }
  _visit(node) {
    const slot = this.activeSlot;
    if (!slot || !node?.isMesh || !SURFACE.test(node.name || '') || Array.isArray(node.material)) return;
    const previous = slot.surfaces.get(node);
    if (previous && node.material === previous.clone) return;
    if (previous) { previous.clone.dispose(); slot.surfaces.delete(node); }
    const original = node.material;
    if (!original?.emissive?.isColor || !Number.isFinite(original.emissiveIntensity)
      || original.emissive.getHex() === 0 || typeof original.clone !== 'function'
      || slot.surfaces.size >= STATION_NIGHT_SURFACE_CAP) return;
    const clone = cloneMaterialPreservingShaderHooks(original);
    clone.emissiveIntensity = original.emissiveIntensity + Math.min(Math.max(0, 5 - original.emissiveIntensity), original.emissiveIntensity * (STATION_NIGHT_GAIN - 1));
    node.material = clone;
    slot.surfaces.set(node, { original, clone });
  }
  _release(slot) {
    for (const [mesh, row] of slot.surfaces) {
      if (mesh.material === row.clone) mesh.material = row.original;
      row.clone.dispose();
    }
    slot.surfaces.clear();
  }
  update(stations, state) {
    const sector = state?.world?.currentSectorId ?? null;
    if (sector !== this.sector) { this.clear(); this.sector = sector; }
    const now = Number.isFinite(state?.simTime) ? state.simTime : 0;
    const epoch = ++this.epoch;
    let admitted = 0;
    for (let i = 0; i < stations.length && admitted < STATION_NIGHT_STATION_CAP; i++) {
      const entity = stations[i], root = entity?.view?.root;
      if (!entity || entity.type !== 'station' || entity.alive === false || !root?.traverse) continue;
      let slot = this.slots.get(entity);
      if (slot && slot.root !== root) { this._release(slot); this.slots.delete(entity); slot = null; }
      if (!slot) {
        slot = { root, surfaces: new Map(), seen: epoch, nextScan: -Infinity };
        this.slots.set(entity, slot);
      }
      slot.seen = epoch;
      admitted++;
      // Authored GLBs can graft under a retained station root after its first frame.
      // A bounded periodic rescan finds them without allocating or traversing every frame.
      if (now >= slot.nextScan || now < slot.nextScan - STATION_NIGHT_REFRESH_S) {
        this.activeSlot = slot;
        root.traverse(this.visit);
        this.activeSlot = null;
        slot.nextScan = now + STATION_NIGHT_REFRESH_S;
      }
    }
    for (const [entity, slot] of this.slots) {
      if (slot.seen !== epoch) { this._release(slot); this.slots.delete(entity); }
    }
    return admitted;
  }
  clear() {
    for (const slot of this.slots.values()) this._release(slot);
    this.slots.clear();
    this.activeSlot = null;
  }
  dispose() { this.clear(); }
}
