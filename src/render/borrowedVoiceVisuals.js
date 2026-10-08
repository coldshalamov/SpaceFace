import * as THREE from 'three';
import { BORROWED_VOICE } from '../data/borrowedVoice.js';
import { isBorrowedVoiceRing, isBorrowedVoiceRecorder } from '../data/borrowedVoiceBody.js';
import { borrowedVoicePresentation } from '../systems/borrowedVoice.js';

export const BORROWED_VOICE_FAN_NODES = Object.freeze(Array.from({ length: 6 }, (_, i) => `MOTION_BORROWED_VOICE_FAN_${i + 1}`));
export const BORROWED_VOICE_RECEIVER_NODE = 'MOTION_BORROWED_VOICE_RECEIVER';
const smooth = value => { const t = Math.min(1, Math.max(0, value)); return t * t * (3 - 2 * t); };
function inside(node, ancestor) {
  for (let current = node; current; current = current.parent) {
    if (current.visible === false) return false;
    if (current === ancestor) return true;
  }
  return false;
}
function identity(entity) {
  if (isBorrowedVoiceRing(entity)) return 'ring';
  return isBorrowedVoiceRecorder(entity) ? entity.data.borrowedVoiceRecorderId : null;
}
function sourceMatches(root, key) {
  const source = root?.userData?.borrowedVoiceAuthoredSource;
  return source?.assetId === (key === 'ring' ? 'SF_PLACE_BORROWED_VOICE_RING' : `SF_PROP_BORROWED_VOICE_${key.toUpperCase()}`)
    && source.file === `assets/ships/release/parts/wholeships/borrowed_voice_${key}.glb`;
}

// These are attached source instruments and dry tissue. Signal comes from the
// owner's measured reception; neither this pose nor an emissive notch creates evidence.
export function createBorrowedVoiceVisualDriver(root, entity) {
  const key = identity(entity);
  if (!key || !sourceMatches(root, key)) return null;
  const names = key === 'ring' ? BORROWED_VOICE_FAN_NODES : [BORROWED_VOICE_RECEIVER_NODE];
  const nodes = [], rests = [], axes = [];
  for (const name of names) {
    const node = root.getObjectByName(name);
    if (!node) throw new Error(`Borrowed Voice ${key} lacks its supported source pivot ${name}`);
    nodes.push(node); rests.push(node.quaternion.clone());
    axes.push(key === 'ring' ? new THREE.Vector3(-node.position.z, 0, node.position.x).normalize() : new THREE.Vector3(0, 0, 1));
  }
  const signals = [], replacements = [], owned = [];
  root.traverse(node => {
    if (!node.isMesh || !node.material) return;
    const original = node.material, list = Array.isArray(original) ? original : [original]; let changed = false;
    const trace = /HOOK_BORROWED_SIGNAL_(\d)/.exec(node.name);
    const cloned = list.map(material => {
      if (!material.name?.startsWith('Material_Emissive_Cyan')) return material;
      changed = true; const clone = material.clone(); owned.push(clone);
      signals.push({ material: clone, intensity: material.emissiveIntensity, index: trace ? Number(trace[1]) - 1 : -1 });
      clone.emissiveIntensity = 0; return clone;
    });
    if (changed) { replacements.push({ node, original }); node.material = Array.isArray(original) ? cloned : cloned[0]; }
  });
  const id = entity.id, life = entity.occupantGeneration, turn = new THREE.Quaternion();
  let retired = false, initialized = false, lastTime = null, lastTick = null;
  let current = 0, from = 0, target = 0, qualityStart = 0, fragmentRevision = 0, memoryStart = null;
  const pose = quality => {
    for (let i = 0; i < nodes.length; i++) {
      // The missing mast never mimics an intact receiver; its actual notch still reports quality.
      const angle = key === 'c' ? 0 : quality * (key === 'ring' ? .045 : .025);
      nodes[i].quaternion.copy(rests[i]).multiply(turn.setFromAxisAngle(axes[i], angle)); nodes[i].updateMatrix();
    }
  };
  const silence = () => { for (const signal of signals) signal.material.emissiveIntensity = 0; memoryStart = null; };
  const park = () => { pose(0); silence(); initialized = false; lastTime = lastTick = null; };
  return {
    update(live, now, a11y, state) {
      if (retired) return;
      const valid = Number.isFinite(now) && live?.id === id && live.occupantGeneration === life
        && live.alive !== false && state?.entities?.get(id) === live && identity(live) === key
        && sourceMatches(root, key) && state.mode === 'flight' && state.world?.currentSectorId === BORROWED_VOICE.sectorId
        && inside(root, live.mesh) && !!state.render?.scene && inside(root, state.render.scene);
      const frame = valid ? borrowedVoicePresentation(state, live) : null, time = frame?.simTime;
      if (!frame || frame.ownerLife !== life || frame.tick !== state.tick || time !== state.simTime
        || !Number.isFinite(time) || frame.nativeBodyReady !== true
        || frame.kind !== (key === 'ring' ? 'ring' : 'recorder') || (key !== 'ring' && frame.recorderId !== key)) { park(); return; }
      const first = !initialized || time < lastTime || state.tick < lastTick;
      const quality = Math.max(0, Math.min(1, Number.isFinite(frame.quality) ? frame.quality : 0));
      const revision = Number.isSafeInteger(frame.fragmentRevision) ? frame.fragmentRevision : 0;
      if (first) {
        initialized = true; current = from = target = quality; qualityStart = time;
        fragmentRevision = revision; memoryStart = null;
      }
      // Confirmed isolation freezes the currently visible tissue/instrument pose.
      // The hardware remains present and physically towable; no containment shell is invented.
      if (frame.disposition === 'quarantine') {
        silence(); fragmentRevision = revision; lastTime = time; lastTick = state.tick; return;
      }
      current = from + (target - from) * smooth((time - qualityStart) / 1.2);
      // Signal loss, including a stale native source, dims immediately. Only a
      // genuine improvement may ease upward; the display cannot overstate quality.
      if (quality < current) { current = from = target = quality; qualityStart = time; }
      else if (quality !== target) { from = current; target = quality; qualityStart = time; }
      if (!first && revision > fragmentRevision) memoryStart = time;
      fragmentRevision = revision;
      const reduced = a11y?.reducedMotion === true, lowFlash = a11y?.reducedFlash === true;
      if (reduced) { current = from = target; qualityStart = time; memoryStart = null; }
      pose(current);
      const age = memoryStart == null ? null : time - memoryStart;
      if (age != null && (age < 0 || age >= 3)) memoryStart = null;
      for (const signal of signals) {
        let gain = key === 'ring' ? .12 * current : .04 + .96 * current;
        if (!reduced && !lowFlash && memoryStart != null && signal.index >= 0) {
          gain += .35 * Math.max(0, 1 - Math.abs(age / 3 * 5 - (signal.index + .5)) / .65);
        }
        signal.material.emissiveIntensity = signal.intensity * gain;
      }
      lastTime = time; lastTick = state.tick;
    },
    dispose() {
      if (retired) return; retired = true; park();
      for (const entry of replacements) entry.node.material = entry.original;
      for (const material of owned) material.dispose();
    },
  };
}
