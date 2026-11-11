// The scale's powered deck settles freight against the Anvil's live pull. Fields
// deliberately omit payload velocity terms. This table-clock owner queues ordinary
// dissipative impulses immediately before the same fixed-step physics solve, after
// current field response is known. No pose, velocity, mass or reading is assigned.
import { KESSLER_SCALE } from '../data/kessler.js';
import { kesslerPadPosition } from './kesslerScaleWorksite.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { fieldBodyProfile } from '../core/fields/fieldReadModel.js';

export function kesslerDeckDampingImpulse(state, pod, dt) {
  if (!(dt > 0) || !Number.isFinite(dt) || !pod?.alive || pod.type !== 'payload'
    || pod.data?.jettisonedCargo !== true || pod.data.physicalCustodyOnly || pod.data.anchored
    || pod.physicsBody === false || state.entities?.get(pod.id) !== pod
    || ![pod.pos?.x, pod.pos?.z, pod.vel?.x, pod.vel?.z].every(Number.isFinite)) return null;
  const pad = kesslerPadPosition();
  if (Math.hypot(pod.pos.x - pad.x, pod.pos.z - pad.z) > KESSLER_SCALE.padRadius) return null;
  const profile = fieldBodyProfile(pod, state);
  if (!profile.dynamic || !(profile.mass > 0)) return null;
  const speed = Math.hypot(pod.vel.x, pod.vel.z);
  if (!(speed > 0)) return null;
  // Bounded drag: 24/s settles the observed ~60 WU/s² pull below 8 WU/s.
  // Even a large step can remove at most current speed, never reverse velocity
  // and inject energy. Effective solver mass follows the canonical physical read.
  const fraction = Math.min(1, 24 * dt, 240 * dt / speed);
  // Jettison's owner authors a finite body mass. Refuse malformed/un-normalized
  // bodies: the solver's repair default may differ from entity.mass. Hitch load
  // belongs to field coupling and never changes this body's solver mass.
  const baseMass = pod.physicsBody?.mass;
  if (!(baseMass > 0) || !Number.isFinite(baseMass)) return null;
  const mass = baseMass * Math.max(.25, Math.min(8, profile.physicsMassScale));
  const impulse = { x: -pod.vel.x * fraction * mass, y: 0, z: -pod.vel.z * fraction * mass };
  return Number.isFinite(mass) && Number.isFinite(impulse.x) && Number.isFinite(impulse.z) ? impulse : null;
}

export function tickKesslerDeckDamping(state, dt) {
  if (state?.mode !== 'flight' || state.ui?.docked || state.player?.flags?.docked
    || state.physicsVenue?.active || !['adventure', 'campaign', undefined, null, ''].includes(state.run?.kind)
    || state.world?.currentSectorId !== KESSLER_SCALE.sectorId) return;
  if (!(state.entityList || []).some(e => e?.alive && e.data?.kesslerScale === true
    && e.data.kesslerWorksiteVersion === 1 && e.physicsBody === false)) return;
  const index = state.entityIndex;
  const pods = index?.__spacefaceEntityIndexV1 && Array.isArray(index.payloads) ? index.payloads : state.entityList || [];
  for (const pod of pods) {
    const impulse = kesslerDeckDampingImpulse(state, pod, dt);
    if (impulse) queuePhysicsImpulse(pod, impulse, { tick: state.tick, source: 'kessler-scale-deck' });
  }
}

// Independent from cargo's once-per-frame bookkeeping and the plate's calendar
// census. Every catch-up step must consume exactly its own drag, never stale mass.
export const kesslerDeckDamping = {
  name: 'kesslerDeckDamping',
  init() {},
  update(dt, state) { tickKesslerDeckDamping(state, dt); },
};
