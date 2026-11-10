import * as THREE from 'three';
import { TALLY_THREE, tallyThreeSource } from '../data/tallyThree.js';

export const TALLY_THREE_PLACE_FILE = 'places/place_tally_three.glb';
export const TALLY_THREE_ASSET_ID = 'SF_PLACE_TALLY_3';
export const TALLY_THREE_MOTION_NODES = Object.freeze([
  'MOTION_TALLY_ARM_LEFT', 'MOTION_TALLY_ARM_RIGHT', 'MOTION_TALLY_STAMP', 'MOTION_TALLY_SCAN',
]);
export function isTallyThreeAssessor(entity) {
  return entity?.data?.worldRecordId === TALLY_THREE.assessorId && entity.data.role === 'claim_assessor';
}
function sourceMatches(root) {
  const source = root?.userData?.tallyThreeAuthoredSource;
  return source?.assetId === TALLY_THREE_ASSET_ID && typeof source.file === 'string'
    && source.file.replace(/^.*assets\/ships\/(?:release\/)?parts\//, '') === TALLY_THREE_PLACE_FILE;
}
function inside(node, ancestor) {
  for (let current = node; current; current = current.parent) if (current === ancestor) return true;
  return false;
}
function deliveredReceipt(source, state) {
  const receipt = source?.delivery;
  if (!(source?.extracted === true && receipt?.sourceKey === TALLY_THREE.sourceKey
    && receipt.worldRecordId === TALLY_THREE.worldRecordId && receipt.stationId === TALLY_THREE.homeStationId
    && receipt.receiptId === `tally-three:${TALLY_THREE.worldRecordId}`
    && Number.isSafeInteger(receipt.qty) && receipt.qty > 0
    && Number.isSafeInteger(receipt.quoteCr) && receipt.quoteCr >= 0)) return null;
  const committed = state?.economy?.committedIntents?.[receipt.receiptId];
  const accepted = committed?.receipt, result = committed?.result;
  if (!accepted || Object.keys(accepted).length !== Object.keys(receipt).length
    || !Object.keys(receipt).every(key => accepted[key] === receipt[key])
    || result?.receiptId !== receipt.receiptId || result.qty !== receipt.qty
    || result.stationId !== receipt.stationId || !Number.isSafeInteger(result.creditedCr)
    || result.creditedCr < 0) return null;
  return receipt.receiptId;
}
const smooth = value => { const t = Math.min(1, Math.max(0, value)); return t * t * (3 - 2 * t); };
const radians = degrees => degrees * Math.PI / 180;
function anglesFor(phase) {
  return phase === 'disputed' ? [radians(62), radians(-39)]
    : phase === 'assess' ? [radians(55), radians(-55)] : [0, 0];
}

// Four source-owned rigid groups. No gesture changes custody, a quote, a wallet or a collider.
export function createTallyThreeVisualDriver(root, entity) {
  if (!isTallyThreeAssessor(entity) || !sourceMatches(root)) return null;
  const nodes = new Map();
  root.traverse(node => { if (TALLY_THREE_MOTION_NODES.includes(node.name)) nodes.set(node.name, node); });
  if (nodes.size !== TALLY_THREE_MOTION_NODES.length) throw new Error('Tally source lacks its four authored instrument pivots');
  const [left, right, stamp, scan] = TALLY_THREE_MOTION_NODES.map(name => nodes.get(name));
  const rests = [left, right, stamp, scan].map(node => ({ position: node.position.clone(), quaternion: node.quaternion.clone() }));
  const axis = new THREE.Vector3(0, 1, 0), turn = new THREE.Quaternion();
  const id = entity.id, life = entity.occupantGeneration;
  let retired = false, initialized = false, phaseKey = null, lastReceipt = null, evidenceRevision = 0;
  let phaseStart = 0, stampStart = null, scanStart = null, lastNow = null;
  let from = [0, 0], target = [0, 0], current = [0, 0];
  const reset = () => {
    for (const [index, node] of [left, right, stamp, scan].entries()) {
      node.position.copy(rests[index].position); node.quaternion.copy(rests[index].quaternion); node.updateMatrix();
    }
  };
  const rotate = (node, rest, angle) => {
    node.quaternion.copy(rest.quaternion).multiply(turn.setFromAxisAngle(axis, angle)); node.updateMatrix();
  };
  const sampleArms = now => {
    const amount = smooth((now - phaseStart) / 1.4);
    current[0] = from[0] + (target[0] - from[0]) * amount;
    current[1] = from[1] + (target[1] - from[1]) * amount;
  };
  return {
    update(live, now, a11y, state) {
      if (retired) return;
      const valid = Number.isFinite(now) && live?.id === id && live.occupantGeneration === life
        && live.alive !== false && isTallyThreeAssessor(live) && state?.entities?.get(id) === live
        && state.world?.currentSectorId === TALLY_THREE.sectorId && inside(root, live.mesh)
        && !!state.render?.scene && inside(root, state.render.scene);
      if (!valid) { reset(); initialized = false; stampStart = scanStart = null; return; }
      const source = tallyThreeSource(state), phase = live.data.tallyThree?.phase || 'patrol';
      const key = `${phase}:${live.data.tallyThree?.tick ?? ''}`;
      const receipt = deliveredReceipt(source, state), evidence = Number(source?.evidenceRevision) || 0;
      if (!initialized || now < lastNow) {
        initialized = true; phaseKey = key; lastReceipt = receipt; evidenceRevision = evidence;
        target = anglesFor(phase); from = target.slice(); current = target.slice(); phaseStart = now - 1.4; stampStart = scanStart = null;
      } else {
        sampleArms(now);
        if (key !== phaseKey) { phaseKey = key; from = current.slice(); target = anglesFor(phase); phaseStart = now; }
        if (source?.evidenceObserved === true && evidence > evidenceRevision) scanStart = now;
        evidenceRevision = Math.max(evidenceRevision, evidence);
        // The actor's success phase must name the exact durable owner-accepted settlement.
        if (receipt && receipt !== lastReceipt && phase === 'receipt' && live.data.tallyThree.receiptId === receipt) {
          lastReceipt = receipt;
          stampStart = now;
        }
      }
      lastNow = now;
      const reduced = a11y?.reducedMotion === true || a11y?.reducedFlash === true;
      if (reduced) { current = target.slice(); from = current.slice(); phaseStart = now - 1.4; stampStart = scanStart = null; }
      else sampleArms(now);
      rotate(left, rests[0], current[0]); rotate(right, rests[1], current[1]);
      stamp.position.copy(rests[2].position);
      if (stampStart != null) {
        const elapsed = (now - stampStart) / .45;
        if (elapsed >= 1) stampStart = null;
        else stamp.position.y -= .35 * Math.sin(Math.PI * Math.max(0, elapsed));
      }
      stamp.updateMatrix();
      let sweep = 0;
      if (scanStart != null) {
        const elapsed = (now - scanStart) / 1.4;
        if (elapsed >= 1) scanStart = null;
        else sweep = radians(8) * Math.sin(Math.PI * Math.max(0, elapsed));
      }
      rotate(scan, rests[3], sweep);
    },
    dispose() { if (!retired) { retired = true; reset(); } },
  };
}
