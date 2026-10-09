import { PALLET_JACK as C } from '../data/palletJack.js';
import { isPalletJackEntity } from '../data/palletJackBody.js';
import { palletJackPresentation } from '../systems/palletJack.js';

export const PALLET_JACK_MOTION_NODE = 'MOTION_PALLET_JACK_CLAMP';
function sourceMatches(root) {
  const source = root?.userData?.palletJackAuthoredSource;
  return source?.assetId === C.assetId
    && source.file === 'assets/ships/release/parts/wholeships/pallet_jack.glb';
}
function inside(node, ancestor) {
  for (let current = node; current; current = current.parent) {
    if (current.visible === false) return false;
    if (current === ancestor) return true;
  }
  return false;
}
const smooth = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

// The one moving bridge is presentation. The original freight remains a separate
// native body; only its actual accepted transport joint can hold the closed pose.
export function createPalletJackVisualDriver(root, entity) {
  if (!isPalletJackEntity(entity) || !sourceMatches(root)) return null;
  const clamp = root.getObjectByName(PALLET_JACK_MOTION_NODE);
  if (!clamp) throw new Error('Pallet Jack source lacks its supported sliding clamp');
  const rest = clamp.position.clone(), id = entity.id, life = entity.occupantGeneration;
  let retired = false, previous = null, opened = 0, parking = null, releaseId = null;
  const pose = amount => { opened = amount; clamp.position.copy(rest); clamp.position.x += 8 * amount; clamp.updateMatrix(); };
  const quiet = () => { pose(0); previous = null; parking = null; };
  return {
    update(live, now, a11y, state) {
      if (retired) return;
      const valid = Number.isFinite(now) && live?.id === id && live.occupantGeneration === life
        && live.alive !== false && isPalletJackEntity(live) && state?.entities?.get(id) === live
        && sourceMatches(root) && !!state.render?.scene && inside(root, live.mesh) && inside(root, state.render.scene);
      const frame = valid ? palletJackPresentation(state, live) : null;
      if (!frame || !frame.nativeBodyReady || frame.ownerLife !== life || frame.tick !== state.tick
        || frame.sourceRevision !== live.physicsBody?.revision
        || !Number.isSafeInteger(frame.phaseStartTick) || frame.phaseStartTick > state.tick) { quiet(); return; }
      if (previous != null && (state.simTime < previous || state.simTime - previous > .1)) quiet();
      const cold = previous == null;
      const actualRelease = frame.lastRelease && frame.lastRelease.atTick <= state.tick
        && frame.lastRelease.targetCargoId === frame.targetCargoId ? frame.lastRelease.id : null;
      if (cold) releaseId = actualRelease;
      if (!cold && actualRelease && releaseId !== actualRelease) {
        releaseId = actualRelease; parking = { amount: opened, at: state.simTime };
      }
      const grabbing = frame.phase === 'grab' && frame.grabStartTick === frame.phaseStartTick
        && Number.isSafeInteger(frame.grabAttackId) && frame.targetEntityId != null && frame.targetLife != null;
      const holding = frame.loaded === true && typeof frame.acceptedAttachmentId === 'string';
      if (holding) { parking = null; pose(1); }
      else if (grabbing) {
        parking = null; pose(a11y?.reducedMotion ? 1 : smooth((state.tick - frame.grabStartTick) / C.grabTicks));
      } else {
        if (!parking && opened > 0) parking = { amount: opened, at: state.simTime };
        if (parking && !a11y?.reducedMotion) {
          const amount = parking.amount * (1 - smooth((state.simTime - parking.at) / (C.dropTicks / 60)));
          pose(amount); if (amount === 0) parking = null;
        } else { pose(0); parking = null; }
      }
      previous = state.simTime;
    },
    dispose() { if (retired) return; quiet(); retired = true; },
  };
}
