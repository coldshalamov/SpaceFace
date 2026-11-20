// OVH-06b — the two-frame emissive flash on the struck hull.
//
// The VFX owner (`vfx.js`, `combat:damage`) notes a hit into the shared flash book; the renderer's
// per-entity pass calls `syncHullHitFlash` for the entity's mesh group. A struck body brightens
// for two frames and is back to its authored look; a hull that is not hit costs one Map lookup.
//
// Hull materials are shared across ships, so a shared material is never edited. The first time a
// hull flashes, each of its opaque lit meshes is given a private clone, kept in a WeakMap and
// swapped in only while a flash is live and swapped back out afterwards. A repeat hit re-uses
// the clone: no allocation on the hit path, no shader recompile (same program, same defines), and
// the authored materials are exactly as they were between flashes.
//
// Presentation only: nothing here reads or writes the simulation, and nothing uses randomness.
import { createHitFlashBook } from './vfx/bodyHitRead.js';

/** One book for the renderer's lifetime; vfx.js feeds it, the renderer pass reads it. */
export const hullHitFlashBook = createHitFlashBook(64);

// Warm white-hot: a struck plate reads as light on metal, not as a tint.
const FLASH_R = 1.0;
const FLASH_G = 0.82;
const FLASH_B = 0.55;
export const HULL_FLASH_INTENSITY = 2.4;

const records = new WeakMap();

function isFlashable(mat) {
  return !!(mat && mat.emissive && mat.emissive.isColor
    && !mat.transparent && mat.blending === 1 /* THREE.NormalBlending */
    && Number.isFinite(mat.emissiveIntensity)
    && !(mat.userData && (mat.userData.sfNoHitFlash || mat.userData.shieldShell)));
}

function buildRecord(group, rec) {
  rec.meshes.length = 0;
  rec.orig.length = 0;
  rec.clones.length = 0;
  group.traverse((node) => {
    if (!node.isMesh || node.isInstancedMesh || node.isSkinnedMesh) return;
    const mat = node.material;
    if (Array.isArray(mat) || !isFlashable(mat)) return;
    // Parts that already animate their own glow (lamps, plumes, blinkers) keep it.
    if (node.userData && (node.userData.blink || node.userData.plume)) return;
    rec.meshes.push(node);
    rec.orig.push(mat);
    rec.clones.push(null);
  });
}

function swapIn(rec) {
  for (let i = 0; i < rec.meshes.length; i += 1) {
    const mesh = rec.meshes[i];
    if (mesh.material !== rec.orig[i]) continue; // someone else replaced it: leave their work
    let clone = rec.clones[i];
    if (!clone) {
      clone = rec.orig[i].clone();
      clone.userData = { ...(rec.orig[i].userData || {}), sfHitFlashClone: true };
      rec.clones[i] = clone;
    }
    mesh.material = clone;
  }
  rec.active = true;
}

function swapOut(rec) {
  for (let i = 0; i < rec.meshes.length; i += 1) {
    const mesh = rec.meshes[i];
    if (rec.clones[i] && mesh.material === rec.clones[i]) mesh.material = rec.orig[i];
  }
  rec.active = false;
}

function paint(rec, level) {
  for (let i = 0; i < rec.clones.length; i += 1) {
    const clone = rec.clones[i];
    if (!clone || rec.meshes[i].material !== clone) continue;
    const base = rec.orig[i];
    clone.emissive.setRGB(
      base.emissive.r + (FLASH_R - base.emissive.r) * level,
      base.emissive.g + (FLASH_G - base.emissive.g) * level,
      base.emissive.b + (FLASH_B - base.emissive.b) * level,
    );
    clone.emissiveIntensity = base.emissiveIntensity + level * HULL_FLASH_INTENSITY;
  }
}

/**
 * Per-entity renderer pass. `group` is the entity's mesh group, `now` is sim seconds.
 * Returns the flash level applied (0 when idle) so callers/tests can read it.
 */
export function syncHullHitFlash(entityId, group, now, reducedFlash = false, book = hullHitFlashBook) {
  if (!group || entityId == null) return 0;
  const level = book.level(entityId, now, reducedFlash);
  let rec = records.get(group);
  if (level <= 0) {
    if (rec && rec.active) swapOut(rec);
    return 0;
  }
  if (!rec) {
    rec = { meshes: [], orig: [], clones: [], active: false };
    records.set(group, rec);
  }
  if (!rec.active) {
    // A new flash: re-read the hierarchy (a LOD swap or rebuild may have changed it).
    if (rec.meshes.length === 0 || rec.meshes[0].parent == null) buildRecord(group, rec);
    swapIn(rec);
  }
  paint(rec, level);
  return level;
}

/** Test/inspection hook: how many meshes of a group the flash would touch. */
export function hullFlashMeshCount(group) {
  const rec = { meshes: [], orig: [], clones: [] };
  buildRecord(group, rec);
  return rec.meshes.length;
}
