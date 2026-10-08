import * as THREE from 'three';
import { SCISSORWAKE as C } from '../data/scissorwake.js';
import { isScissorwakeEntity } from '../data/scissorwakeBody.js';
import { scissorwakePresentation } from '../systems/scissorwake.js';

export const SCISSORWAKE_ASSET_ID = 'SF_SHIP_SCISSORWAKE';
export const SCISSORWAKE_FILE = 'wholeships/scissorwake.glb';
export const SCISSORWAKE_MOTION_NODES = Object.freeze([
  'MOTION_SCISSORWAKE_BLADE_PORT', 'MOTION_SCISSORWAKE_BLADE_STARBOARD', 'MOTION_SCISSORWAKE_SPOOL',
]);
function sourceMatches(root) {
  const source = root?.userData?.scissorwakeAuthoredSource;
  return source?.assetId === SCISSORWAKE_ASSET_ID && typeof source.file === 'string'
    && source.file.replace(/^.*assets\/ships\/(?:release\/)?parts\//, '') === SCISSORWAKE_FILE;
}
function inside(node, ancestor) {
  for (let current = node; current; current = current.parent) {
    if (current.visible === false) return false;
    if (current === ancestor) return true;
  }
  return false;
}
const smooth = value => { const t = Math.min(1, Math.max(0, value)); return t * t * (3 - 2 * t); };
const armedDelta = 24 * Math.PI / 180; // Genuine source rest8° becomes the authored armed32°.

// The native AI and attachment owner own commitment and cut. This is a source-clocked
// three-part mechanism: a readable warning, fixed pass, and finite current-pose recovery.
export function createScissorwakeVisualDriver(root, entity) {
  if (!isScissorwakeEntity(entity) || !sourceMatches(root)) return null;
  const nodes = new Map(); root.traverse(node => { if (SCISSORWAKE_MOTION_NODES.includes(node.name)) nodes.set(node.name, node); });
  if (nodes.size !== 3) throw new Error('Scissorwake source lacks its two blade hinges and supported spool pivot');
  const [port, starboard, spool] = SCISSORWAKE_MOTION_NODES.map(name => nodes.get(name));
  const rests = [port, starboard, spool].map(node => node.quaternion.clone());
  const materials = [], replacements = [], clones = new Map();
  root.traverse(node => {
    if (!node.isMesh || !node.material) return;
    const original = node.material, list = Array.isArray(original) ? original : [original]; let changed = false;
    const owned = list.map(material => {
      if (!material.name?.startsWith('Material_Emissive_Amber')) return material;
      changed = true;
      if (!clones.has(material)) { const clone = material.clone(); clones.set(material, clone);
        materials.push({ material: clone, intensity: material.emissiveIntensity }); }
      return clones.get(material);
    });
    if (changed) { replacements.push({ node, original }); node.material = Array.isArray(original) ? owned : owned[0]; }
  });
  const id = entity.id, life = entity.occupantGeneration, yaw = new THREE.Vector3(0, 1, 0);
  const axle = new THREE.Vector3(0, 0, -1), turn = new THREE.Quaternion();
  let retired = false, initialized = false, lastTick = null, lastCut = null, cutAt = null;
  let currentOpening = 0, currentSpool = 0, recoveryKey = null, recoveryFrom = 0, spoolFrom = 0;
  const draw = (opening, winding, gain) => {
    currentOpening = opening; currentSpool = winding;
    port.quaternion.copy(rests[0]).multiply(turn.setFromAxisAngle(yaw, opening)); port.updateMatrix();
    starboard.quaternion.copy(rests[1]).multiply(turn.setFromAxisAngle(yaw, -opening)); starboard.updateMatrix();
    spool.quaternion.copy(rests[2]).multiply(turn.setFromAxisAngle(axle, winding)); spool.updateMatrix();
    for (const entry of materials) entry.material.emissiveIntensity = entry.intensity * gain;
  };
  const rest = () => { draw(0, 0, 0); recoveryKey = null; cutAt = null; };
  return {
    update(live, now, a11y, state) {
      if (retired) return;
      const valid = Number.isFinite(now) && live?.id === id && live.occupantGeneration === life
        && live.alive !== false && isScissorwakeEntity(live) && state?.entities?.get(id) === live
        && sourceMatches(root) && inside(root, live.mesh) && !!state.render?.scene && inside(root, state.render.scene);
      const frame = valid ? scissorwakePresentation(state, live) : null;
      if (!frame || frame.nativeBodyReady !== true || frame.ownerLife !== life || frame.tick !== state.tick) {
        rest(); initialized = false; lastTick = null; return;
      }
      const first = !initialized || (lastTick != null && state.tick < lastTick);
      if (first) { initialized = true; lastCut = frame.outcome === 'cut' ? frame.attackId : null; cutAt = null; recoveryKey = null; }
      const reduced = a11y?.reducedMotion === true, lowFlash = a11y?.reducedFlash === true;
      const committed = typeof frame.attackId === 'string' && frame.attackId.length > 0
        && Number.isSafeInteger(frame.committedTick) && frame.committedTick <= state.tick;
      let opening = 0, winding = 0, gain = 0;
      if (committed && frame.phase === 'spool_cue' && state.tick - frame.committedTick <= C.windupTicks) {
        const progress = smooth((state.tick - frame.committedTick) / C.windupTicks);
        opening = armedDelta * (reduced ? 1 : progress); winding = reduced ? 0 : Math.PI * 2.5 * progress;
        gain = .12 + .68 * progress; recoveryKey = null;
      } else if (committed && frame.phase === 'attach_window'
        && Number.isSafeInteger(frame.phaseStartTick) && frame.phaseStartTick <= state.tick
        && state.tick - frame.phaseStartTick <= C.passTicks) {
        const progress = smooth((state.tick - frame.phaseStartTick) / C.passTicks);
        opening = armedDelta; winding = reduced ? 0 : Math.PI * 2.5 + Math.PI * 1.5 * progress;
        gain = .95; recoveryKey = null;
      } else if (typeof frame.attackId === 'string' && Number.isSafeInteger(frame.recoveryUntilTick)
        && state.tick < frame.recoveryUntilTick && frame.recoveryUntilTick - state.tick <= C.recoveryTicks) {
        const key = `${frame.attackId}:${frame.recoveryUntilTick}`;
        if (recoveryKey !== key) {
          recoveryKey = key;
          recoveryFrom = first ? armedDelta : currentOpening;
          spoolFrom = first ? 0 : currentSpool;
          if (frame.outcome === 'cut' && frame.attackId !== lastCut) { lastCut = frame.attackId; if (!reduced) cutAt = state.tick; }
        }
        const remaining = (frame.recoveryUntilTick - state.tick) / C.recoveryTicks;
        opening = reduced ? 0 : recoveryFrom * (1 - smooth(1 - remaining));
        // The drum coasts to its nearest turn; it does not replay the winding backwards.
        winding = reduced ? 0 : spoolFrom + (Math.ceil(spoolFrom / (Math.PI * 2)) * Math.PI * 2 - spoolFrom) * smooth(1 - remaining);
        gain = (frame.outcome === 'cut' ? .36 : .10) * remaining;
      }
      if (cutAt != null) {
        const age = state.tick - cutAt;
        if (age < 0 || age >= 18 || reduced) cutAt = null;
        else gain += .25 * (1 - age / 18);
      }
      draw(opening, winding, gain * (lowFlash ? .40 : 1)); lastTick = state.tick;
    },
    dispose() {
      if (retired) return; retired = true; rest();
      for (const entry of replacements) entry.node.material = entry.original;
      for (const clone of clones.values()) clone.dispose();
    },
  };
}
