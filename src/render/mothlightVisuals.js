import * as THREE from 'three';
import { MOTHLIGHT as C, MOTHLIGHT_LAMP_IDS } from '../data/mothlight.js';
import { isMothlightTender, isMothlightLamp } from '../data/mothlightBody.js';
import { mothlightPresentation } from '../systems/mothlight.js';

export const MOTHLIGHT_MOTION_NODES = Object.freeze([
  ...Array.from({ length: 6 }, (_, i) => `MOTION_MOTHLIGHT_IRIS_${i + 1}`),
  'MOTION_MOTHLIGHT_HATCH_1', 'MOTION_MOTHLIGHT_HATCH_2',
  ...Array.from({ length: 4 }, (_, i) => `MOTION_MOTHLIGHT_STOCK_${i + 1}`),
]);
function sourceMatches(root, lamp) {
  const source = root?.userData?.mothlightAuthoredSource;
  return source?.assetId === (lamp ? 'SF_PROP_MOTHLIGHT_LAMP' : 'SF_SHIP_MOTHLIGHT_TENDER')
    && source.file === `assets/ships/release/parts/wholeships/${lamp ? 'mothlight_lamp' : 'mothlight'}.glb`;
}
function inside(node, ancestor) {
  for (let current = node; current; current = current.parent) {
    if (current.visible === false) return false;
    if (current === ancestor) return true;
  }
  return false;
}
const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

// Neither an invented decoy trajectory nor a renderer firing owner: the genuine
// current source warning drives both amber charge envelopes, and accepted stock
// revisions decide when each original leaves its authored cradle.
export function createMothlightVisualDriver(root, entity) {
  const lamp = isMothlightLamp(entity);
  if ((!lamp && !isMothlightTender(entity)) || !sourceMatches(root, lamp)) return null;
  const nodes = lamp ? [] : MOTHLIGHT_MOTION_NODES.map(name => root.getObjectByName(name));
  if (!lamp && nodes.some(node => !node)) throw new Error('Mothlight source lacks iris, hatch or original stock pivots');
  const irises = nodes.slice(0, 6), hatches = nodes.slice(6, 8), stock = nodes.slice(8);
  const irisRest = irises.map(node => node.quaternion.clone()), hatchRest = hatches.map(node => node.position.clone());
  const owned = [], replacements = [], clones = new Map();
  root.traverse(node => {
    if (!node.isMesh || !node.material) return;
    let parent = node, isStock = false;
    while (parent && parent !== root) { if (stock.includes(parent)) isStock = true; parent = parent.parent; }
    const original = node.material, materials = Array.isArray(original) ? original : [original]; let changed = false;
    const mapped = materials.map(material => {
      if (!material.name?.startsWith('Material_Emissive_Amber')) return material;
      changed = true;
      // A stowed original never claims to be the currently drifting false light.
      const key = `${material.uuid}:${isStock ? 'stock' : 'signal'}`;
      if (!clones.has(key)) { const clone = material.clone(); clones.set(key, clone);
        owned.push({ material: clone, intensity: material.emissiveIntensity, stock: isStock }); }
      return clones.get(key);
    });
    if (changed) { replacements.push({ node, original }); node.material = Array.isArray(original) ? mapped : mapped[0]; }
  });
  const id = entity.id, life = entity.occupantGeneration, axis = new THREE.Vector3(0, 1, 0), turn = new THREE.Quaternion();
  let retired = false, previous = null, lastAttackId = null, shotTick = null;
  let irisAmount = 0, irisPark = null;
  const hatchAmounts = [0, 0], hatchParks = [null, null];
  const parked = (current, start, time) => current * (1 - smooth((time - start) / .35));
  const quiet = () => {
    for (let i = 0; i < irises.length; i++) { irises[i].quaternion.copy(irisRest[i]); irises[i].updateMatrix(); }
    for (let i = 0; i < hatches.length; i++) { hatches[i].position.copy(hatchRest[i]); hatches[i].updateMatrix(); }
    for (const entry of owned) entry.material.emissiveIntensity = 0;
    irisAmount = 0; irisPark = null; hatchAmounts.fill(0); hatchParks.fill(null);
    previous = null; shotTick = null;
  };
  return {
    update(live, now, a11y, state) {
      if (retired) return;
      const valid = Number.isFinite(now) && live?.id === id && live.occupantGeneration === life
        && live.alive !== false && state?.entities?.get(id) === live
        && (lamp ? isMothlightLamp(live) : isMothlightTender(live)) && sourceMatches(root, lamp)
        && !!state.render?.scene && inside(root, live.mesh) && inside(root, state.render.scene);
      const frame = valid ? mothlightPresentation(state, live) : null;
      if (!frame || !frame.nativeBodyReady || frame.ownerLife !== life || frame.tick !== state.tick
        || frame.sourceRevision !== live.physicsBody?.revision
        || !Number.isSafeInteger(frame.phaseStartTick) || frame.phaseStartTick > state.tick) { quiet(); return; }
      if (previous != null && (state.simTime < previous || state.simTime - previous > .1)) quiet();
      const age = state.tick - frame.phaseStartTick, reduced = a11y?.reducedMotion === true;
      const attack = frame.acceptedAttack;
      const actualAttack = !lamp && attack?.ownerLife === life && attack.tick <= state.tick
        && attack.weaponId === C.weaponId && typeof attack.receiptId === 'string' ? attack.receiptId : null;
      if (previous == null) lastAttackId = actualAttack;
      else if (actualAttack && actualAttack !== lastAttackId) { lastAttackId = actualAttack; shotTick = attack.tick; }
      const shotAge = shotTick == null ? Infinity : state.tick - shotTick;
      const trueWarning = !lamp && frame.phase === 'true_charge' && frame.nextAttackTick >= state.tick;
      const falseWarning = lamp && frame.lampId === frame.falseLampId && frame.phase === 'false_charge'
        && frame.activeDecoyIds?.includes(frame.lampId);
      const charge = trueWarning || falseWarning ? smooth(age / C.chargeTicks) : 0;
      const glow = charge ? .08 + .92 * charge : 0;
      for (const entry of owned) entry.material.emissiveIntensity = entry.intensity * (entry.stock ? 0 : glow)
        * (a11y?.reducedFlash ? .45 : 1);
      if (!lamp) {
        let opening;
        if (trueWarning) { opening = reduced ? 1 : charge; irisPark = null; }
        else if (!reduced && shotAge >= 0 && shotAge < 18) { opening = 1 - smooth(shotAge / 18); irisPark = null; }
        else if (!reduced && irisAmount > 0) {
          if (!irisPark) irisPark = { amount: irisAmount, at: state.simTime };
          opening = parked(irisPark.amount, irisPark.at, state.simTime);
        } else { opening = 0; irisPark = null; }
        irisAmount = opening;
        for (let i = 0; i < irises.length; i++) {
          irises[i].quaternion.copy(irisRest[i]).multiply(turn.setFromAxisAngle(axis, opening * 24 * Math.PI / 180)); irises[i].updateMatrix();
        }
        const deployIndex = MOTHLIGHT_LAMP_IDS.indexOf(frame.deployingLampId), hatch = deployIndex < 0 ? -1 : deployIndex % 2;
        for (let i = 0; i < hatches.length; i++) {
          let amount;
          if (frame.phase === 'deploy' && hatch === i) { amount = reduced ? 1 : smooth(age / C.deployTicks); hatchParks[i] = null; }
          else if (!reduced && hatchAmounts[i] > 0) {
            if (!hatchParks[i]) hatchParks[i] = { amount: hatchAmounts[i], at: state.simTime };
            amount = parked(hatchParks[i].amount, hatchParks[i].at, state.simTime);
          } else { amount = 0; hatchParks[i] = null; }
          hatchAmounts[i] = amount;
          hatches[i].position.copy(hatchRest[i]); hatches[i].position.z += (i === 0 ? -1 : 1) * 3.6 * amount; hatches[i].updateMatrix();
        }
        for (let i = 0; i < stock.length; i++) stock[i].visible = frame.stowedLampIds?.includes(MOTHLIGHT_LAMP_IDS[i]) === true;
      }
      previous = state.simTime;
    },
    dispose() {
      if (retired) return; quiet(); retired = true;
      for (const node of stock) node.visible = true;
      for (let i = replacements.length - 1; i >= 0; i--) replacements[i].node.material = replacements[i].original;
      for (const clone of clones.values()) clone.dispose();
    },
  };
}
