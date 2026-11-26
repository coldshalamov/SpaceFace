// The Scale 4 powered deck steadies freight against the Anvil's live pull. This is
// a library, NOT a registered system — `fields` (the impulse owner that already
// queues before the same fixed-step physics solve) drives syncKesslerDeckDamping
// every tick. It touches only pods the kesslerScale owner has already recorded on
// the deck (ids kept in _deckPods) — never a payload scan. No pose, velocity, mass
// or reading is assigned. The unread desk crate also gets a bounded pull back to its seat.
import { KESSLER_SCALE } from '../data/kessler.js';
import { kesslerPadPosition, kesslerDeliveredCratePosition } from './kesslerScaleWorksite.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { fieldBodyProfile } from '../core/fields/fieldReadModel.js';

export function kesslerDeckDampingImpulse(state, pod, dt) {
  if (!(dt > 0) || !Number.isFinite(dt) || !pod?.alive || pod.type !== 'payload'
    || pod.data?.jettisonedCargo !== true || pod.data.anchored
    // Custody-only bodies are the yard's business — except the delivered crate,
    // which the deck must hold on the plate so it can be read.
    || (pod.data.physicalCustodyOnly === true && pod.data.kesslerDelivered !== true)
    || pod.physicsBody === false || state.entities?.get(pod.id) !== pod
    || ![pod.pos?.x, pod.pos?.z, pod.vel?.x, pod.vel?.z].every(Number.isFinite)) return null;
  const pad = kesslerPadPosition();
  if (Math.hypot(pod.pos.x - pad.x, pod.pos.z - pad.z) > KESSLER_SCALE.padRadius) return null;
  const profile = fieldBodyProfile(pod, state);
  if (!profile.dynamic || !(profile.mass > 0)) return null;
  const speed = Math.hypot(pod.vel.x, pod.vel.z);
  const unreadDeskCrate = pod.data.kesslerDelivered === true
    && pod.data.physicalCustodyOnly === true && pod.data.kesslerRead !== true;
  if (!(speed > 0) && !unreadDeskCrate) return null;
  // Bounded drag: 24/s settles the observed ~60 u/s² pull below 8 u/s.
  // Even a large step can remove at most current speed, never reverse velocity
  // and inject energy. Effective solver mass follows the canonical physical read.
  const fraction = speed > 0 ? Math.min(1, 24 * dt, 240 * dt / speed) : 0;
  // Jettison's owner authors a finite body mass. Refuse malformed/un-normalized
  // bodies: the solver's repair default may differ from entity.mass. Hitch load
  // belongs to field coupling and never changes this body's solver mass.
  const baseMass = pod.physicsBody?.mass;
  if (!(baseMass > 0) || !Number.isFinite(baseMass)) return null;
  const mass = baseMass * Math.max(.25, Math.min(8, profile.physicsMassScale));
  let dx = -pod.vel.x * fraction;
  let dz = -pod.vel.z * fraction;
  if (unreadDeskCrate) {
    const seat = kesslerDeliveredCratePosition(pad);
    const x = seat.x - pod.pos.x;
    const z = seat.z - pod.pos.z;
    const distance = Math.hypot(x, z);
    if (distance > 0) {
      // Drag alone leaves a steady drift in the Anvil pull. Limit the seat correction per step.
      const correction = Math.min(6, 120 * dt, distance * 12 * dt) / distance;
      dx += x * correction;
      dz += z * correction;
    }
  }
  const impulse = { x: dx * mass, y: 0, z: dz * mass };
  return Number.isFinite(impulse.x) && Number.isFinite(impulse.z) && (dx !== 0 || dz !== 0) ? impulse : null;
}

/**
 * The owner's per-tick driver, called from `fields.update` before physics.
 * `sys` supplies the registry plus one private slot (_deckDampTick) — one pass per
 * fixed tick, only pods kesslerScale already recorded on the deck (by id).
 */
export function syncKesslerDeckDamping(sys, state, dt) {
  if (!(dt > 0) || sys._deckDampTick === state.tick) return;
  sys._deckDampTick = state.tick;
  if (state?.mode !== 'flight' || state.ui?.docked || state.player?.flags?.docked
    || state.save?.restoring || state.physicsVenue?.active
    || (state.run?.kind && !['adventure', 'campaign'].includes(state.run.kind))
    || state.world?.currentSectorId !== KESSLER_SCALE.sectorId) return;
  const scale = sys.registry?.get?.('kesslerScale');
  const ids = scale?._deckPods;
  if (!ids || ids.size === 0) return;
  for (const id of [...ids]) {
    const pod = state.entities?.get?.(id);
    const impulse = pod && kesslerDeckDampingImpulse(state, pod, dt);
    if (impulse) queuePhysicsImpulse(pod, impulse, { tick: state.tick, source: 'kessler-scale-deck' });
  }
}
