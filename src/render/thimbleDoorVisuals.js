import * as THREE from 'three';
import { isThimbleDoor, isThimbleRecorder } from '../data/thimbleDoorBody.js';

// The inactive source checkpoint has no gameplay owner. Activation must pass
// that owner's authenticated presentation function; absent it the rig is quiet.
export const THIMBLE_CABLE_NODE = 'MOTION_THIMBLE_CABLE';
function sourceMatches(root, recorder) {
  const source = root?.userData?.thimbleDoorAuthoredSource;
  return source?.assetId === (recorder ? 'SF_PROP_THIMBLE_RECORDER' : 'SF_PLACE_THIMBLE_DOOR')
    && source.file === `assets/ships/release/parts/wholeships/${recorder ? 'thimble_recorder' : 'thimble_door'}.glb`;
}
function inside(node, ancestor) {
  for (let current = node; current; current = current.parent) {
    if (current.visible === false) return false;
    if (current === ancestor) return true;
  }
  return false;
}
const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

export function createThimbleDoorVisualDriver(root, entity, { presentation = null } = {}) {
  const recorder = isThimbleRecorder(entity);
  if ((!recorder && !isThimbleDoor(entity)) || !sourceMatches(root, recorder)) return null;
  const cable = recorder ? null : root.getObjectByName(THIMBLE_CABLE_NODE);
  if (!recorder && !cable) throw new Error('Thimble source lacks the supported outer cable');
  const rest = cable?.quaternion.clone(), id = entity.id, life = entity.occupantGeneration;
  const owned = [], replacements = [], clones = new Map();
  root.traverse(node => {
    if (!node.isMesh || !node.material) return;
    const marker = /HOOK_THIMBLE_MARKER_([1-6])(?:_|$)/.exec(node.name);
    const lamp = node.name.includes('HOOK_THIMBLE_SURVEY_LAMP');
    const original = node.material, materials = Array.isArray(original) ? original : [original]; let changed = false;
    const mapped = materials.map(material => {
      if (!material.name?.startsWith('Material_Emissive_Cyan')) return material;
      changed = true; const key = `${material.uuid}:${marker?.[1] || (lamp ? 'lamp' : 'recorder')}`;
      if (!clones.has(key)) { const clone = material.clone(); clones.set(key, clone);
        owned.push({ material: clone, intensity: material.emissiveIntensity, color: material.emissive.clone(),
          marker: marker ? Number(marker[1]) - 1 : null, lamp }); }
      return clones.get(key);
    });
    if (changed) { replacements.push({ node, original }); node.material = Array.isArray(original) ? mapped : mapped[0]; }
  });
  const turn = new THREE.Quaternion(), axis = new THREE.Vector3(0, 0, 1), unknown = new THREE.Color(0x78888b);
  const tooWide = new THREE.Color(0xa58b60);
  let retired = false, previous = null, surveyRevision = null, surveyReceiptTick = null, recoveredAt = null;
  const quiet = () => {
    if (cable) { cable.quaternion.copy(rest); cable.updateMatrix(); }
    for (const entry of owned) entry.material.emissiveIntensity = 0;
    previous = null; surveyReceiptTick = null; recoveredAt = null;
  };
  return {
    update(live, now, a11y, state) {
      if (retired) return;
      const valid = Number.isFinite(now) && live?.id === id && live.occupantGeneration === life && live.alive !== false
        && state?.entities?.get(id) === live && (recorder ? isThimbleRecorder(live) : isThimbleDoor(live))
        && sourceMatches(root, recorder) && !!state.render?.scene && inside(root, live.mesh) && inside(root, state.render.scene);
      const frame = valid && typeof presentation === 'function' ? presentation(state, live) : null;
      if (!frame || !frame.nativeBodyReady || frame.ownerLife !== life || frame.tick !== state.tick
        || !Number.isFinite(frame.simTime) || frame.simTime !== state.simTime
        || frame.kind !== (recorder ? 'recorder' : 'door')) { quiet(); return; }
      if (previous != null && (state.simTime < previous || state.simTime - previous > .1)) quiet();
      const cold = previous == null;
      if (cold) surveyRevision = frame.surveyRevision;
      const actualSurvey = Number.isSafeInteger(frame.surveyReceiptTick) && frame.surveyReceiptTick <= state.tick
        && Number.isSafeInteger(frame.surveyRevision) && frame.surveyRevision > 0;
      if (!cold && actualSurvey && frame.surveyRevision !== surveyRevision) {
        surveyRevision = frame.surveyRevision; surveyReceiptTick = frame.surveyReceiptTick;
      }
      if (recorder) {
        if (!cold && Number.isFinite(frame.recoveredAt) && frame.recoveredAt <= state.simTime && recoveredAt == null)
          recoveredAt = frame.recoveredAt;
        const gain = frame.phase === 'recovered' ? (recoveredAt == null ? 0 : 1 - smooth((state.simTime - recoveredAt) / .7)) : .10;
        for (const entry of owned) entry.material.emissiveIntensity = entry.intensity * gain * (a11y?.reducedFlash ? .45 : 1);
      } else {
        const cableAngle = a11y?.reducedMotion ? 0 : .012 * Math.sin(state.simTime * Math.PI * 2 / 18);
        cable.quaternion.copy(rest).multiply(turn.setFromAxisAngle(axis, cableAngle)); cable.updateMatrix();
        const age = surveyReceiptTick == null ? Infinity : (state.tick - surveyReceiptTick) / 60;
        const sweep = age >= 0 && age < 1 && !a11y?.reducedMotion && !a11y?.reducedFlash;
        for (const entry of owned) {
          entry.material.emissive.copy(frame.clearance === 'too_wide' ? tooWide : frame.clearance === 'fit' ? entry.color : unknown);
          const active = sweep && (entry.lamp || entry.marker === Math.min(5, Math.floor(age * 6)));
          entry.material.emissiveIntensity = entry.intensity * (entry.lamp ? .08 : .025) + (active ? entry.intensity * .6 : 0);
        }
      }
      previous = state.simTime;
    },
    dispose() {
      if (retired) return; quiet(); retired = true;
      for (let i = replacements.length - 1; i >= 0; i--) replacements[i].node.material = replacements[i].original;
      for (const clone of clones.values()) clone.dispose();
    },
  };
}
