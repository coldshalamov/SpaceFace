import * as THREE from 'three';
import { TOWLINE_MEMBERS, TOWLINE_TABLE } from '../data/towlineTable.js';
import { isTowlineCrewEntity } from '../data/towlineTableBodies.js';
import { towlineCrewPresentation } from '../systems/towlineTable.js';

export const TOWLINE_MOTION_NODES = Object.freeze({
  mara: Object.freeze(['MOTION_TOWLINE_JAW_PORT', 'MOTION_TOWLINE_JAW_STARBOARD']),
  odo: Object.freeze(['MOTION_TOWLINE_WINCH']),
  kit: Object.freeze(['MOTION_TOWLINE_ACKNOWLEDGE']),
});
const jawAngle = 2 * Math.PI / 180;
const winchRadius = 2.4;
const turnLength = Math.PI * 2;
const smooth = value => { const t = Math.min(1, Math.max(0, value)); return t * t * (3 - 2 * t); };
function inside(node, ancestor) {
  for (let current = node; current; current = current.parent) {
    if (current.visible === false) return false;
    if (current === ancestor) return true;
  }
  return false;
}
function sourceMatches(root, member) {
  const source = root?.userData?.towlineAuthoredSource;
  return source?.assetId === member.assetId
    && source.file === `assets/ships/release/parts/wholeships/towline_${member.id}.glb`;
}

// The owner supplies current native line/receipt facts; these source pivots never
// alter the fixed jaws, line custody, rescue berths, or a labor entitlement.
export function createTowlineTableVisualDriver(root, entity) {
  const member = TOWLINE_MEMBERS.find(row => row.id === entity?.data?.towlineMemberId);
  if (!member || !isTowlineCrewEntity(entity) || entity.data.authoredAssetId !== member.assetId
    || !sourceMatches(root, member)) return null;
  const names = TOWLINE_MOTION_NODES[member.id], nodes = [], rests = [];
  for (const name of names) {
    const node = root.getObjectByName(name);
    if (!node) throw new Error(`Towline ${member.id} source lacks ${name}`);
    nodes.push(node); rests.push(node.quaternion.clone());
  }
  const id = entity.id, life = entity.occupantGeneration;
  const yaw = new THREE.Vector3(0, 1, 0), axle = new THREE.Vector3(0, 0, -1);
  const nod = new THREE.Vector3(0, 0, 1), turn = new THREE.Quaternion();
  let retired = false, initialized = false, lastTime = null, lastTick = null, lineId = null;
  let winding = 0, jaw = 0, jawFrom = 0, jawTarget = 0, jawStart = 0;
  let lastReceipt = null, acknowledgeStart = null;
  const rotate = (index, axis, angle) => {
    nodes[index].quaternion.copy(rests[index]).multiply(turn.setFromAxisAngle(axis, angle));
    nodes[index].updateMatrix();
  };
  const resetClock = () => {
    initialized = false; lastTime = lastTick = lineId = null; acknowledgeStart = null;
  };
  const park = () => {
    if (member.id === 'mara') { jaw = jawFrom = jawTarget = 0; rotate(0, yaw, 0); rotate(1, yaw, 0); }
    else if (member.id === 'kit') rotate(0, nod, 0);
    // An unpowered winch stops where it is; it cannot unwind without a real line.
    resetClock();
  };
  return {
    update(live, now, a11y, state) {
      if (retired) return;
      const valid = Number.isFinite(now) && live?.id === id && live.occupantGeneration === life
        && live.alive !== false && state?.entities?.get(id) === live && isTowlineCrewEntity(live)
        && live.data.authoredAssetId === member.assetId && sourceMatches(root, member)
        && state.world?.currentSectorId === TOWLINE_TABLE.sectorId && state.mode === 'flight'
        && inside(root, live.mesh) && !!state.render?.scene && inside(root, state.render.scene);
      const frame = valid ? towlineCrewPresentation(state, live) : null;
      const time = frame?.simTime;
      if (!frame || frame.memberId !== member.id || frame.ownerLife !== life
        || frame.tick !== state.tick || frame.nativeBodyReady !== true || !Number.isFinite(time)
        || time !== state.simTime) { park(); return; }
      const first = !initialized || time < lastTime || state.tick < lastTick;
      const attached = frame.nativeJointReady === true && typeof frame.attachmentId === 'string'
        && frame.attachmentId.length > 0;
      const currentLine = attached ? frame.attachmentId : null;
      const reduced = a11y?.reducedMotion === true;
      if (first) {
        initialized = true; lastReceipt = frame.receiptId; acknowledgeStart = null;
        jaw = jawFrom = jawTarget = attached ? jawAngle : 0; jawStart = time;
      }
      if (member.id === 'mara') {
        const target = attached ? jawAngle : 0;
        if (target !== jawTarget) { jawFrom = jaw; jawTarget = target; jawStart = time; }
        jaw = reduced ? target : jawFrom + (target - jawFrom) * smooth((time - jawStart) / .18);
        rotate(0, yaw, jaw); rotate(1, yaw, -jaw);
      } else if (member.id === 'odo') {
        const dt = first ? 0 : time - lastTime;
        // A fresh attachment/visibility/solve starts a fresh sample. A long gap is
        // discarded rather than inventing payout throughout an unobserved interval.
        if (!reduced && attached && currentLine === lineId && dt > 0 && dt <= .1
          && Number.isFinite(frame.relativeLineSpeed)) {
          winding = (winding + frame.relativeLineSpeed * dt / winchRadius) % turnLength;
        }
        rotate(0, axle, winding);
      } else {
        if (!first && frame.receiptId && frame.receiptId !== lastReceipt) {
          lastReceipt = frame.receiptId;
          acknowledgeStart = reduced ? null : time;
        }
        let angle = 0;
        if (reduced) acknowledgeStart = null;
        else if (acknowledgeStart != null) {
          const progress = (time - acknowledgeStart) / .72;
          if (progress < 0 || progress >= 1) acknowledgeStart = null;
          else angle = -8 * Math.PI / 180 * Math.sin(Math.PI * progress);
        }
        rotate(0, nod, angle);
      }
      lineId = currentLine; lastTime = time; lastTick = state.tick;
    },
    dispose() {
      if (retired) return; retired = true;
      for (let index = 0; index < nodes.length; index++) {
        nodes[index].quaternion.copy(rests[index]); nodes[index].updateMatrix();
      }
      resetClock();
    },
  };
}
