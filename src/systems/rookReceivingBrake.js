// Rook's existing ring brakes an attended tow through the physics membrane.
// The pilot holds Brake; the market still reads the real hull pose and speed.
import { ROOK_BOOTH } from '../data/rook.js';
import { rookPadPosition, rookBoothEligible } from '../characters/rookRules.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { fieldBodyProfile } from '../core/fields/fieldReadModel.js';
import { isMasslineObstructed } from '../world/asteroidField.js';
import { hullEnvelopeWu } from '../data/collisionProxyManifests.js';
import { isPlayerWanted } from './heat.js';

export const ROOK_RECEIVING_BRAKE = Object.freeze({ reach: 280, maxForce: 1200, maxAccel: 30, gain: 4 });
const finite = p => Number.isFinite(p?.x) && Number.isFinite(p?.z);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const radius = e => Math.max(Number(e.radius) || 0, Number(e.physicsBody?.radius) || 0, hullEnvelopeWu(e) || 0);
const live = (s, e) => !!e?.alive && e.hull > 0 && s.entities?.get(e.id) === e
  && Number.isSafeInteger(e.occupantGeneration) && e.occupantGeneration > 0;
function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, d = dx * dx + dz * dz;
  const t = d ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / d)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}

export function rookReceivingBeamClear(state, beacon, hull) {
  const pad = rookPadPosition();
  if (!finite(hull?.pos) || isMasslineObstructed({ state, player: beacon, target: hull,
    sourceWorld: pad, targetWorld: hull.pos })) return false;
  const index = state.entityIndex;
  const dressing = [...(index?.spatialStatics || []), ...(state.world?.dressing?.rows || [])];
  // Include ships and solid dressing as well as the canonical terrain query.
  // A half-second velocity margin conservatively pauses for crossing traffic.
  for (const body of [...(state.entityList || []), ...dressing]) {
    if (body === hull || body === beacon || body?.alive === false || body?.collides === false
      || body?.physicsBody === false || !finite(body?.pos)) continue;
    const padding = finite(body.vel) ? Math.hypot(body.vel.x, body.vel.z) * .5 : 0;
    if (segmentDistance(body.pos, pad, hull.pos) <= radius(body) + padding + 2) return false;
  }
  return true;
}

function receivingTow(state) {
  if (state?.mode !== 'flight' || state.ui?.docked || state.save?.restoring || state.physicsVenue?.active
    || state.world?.currentSectorId !== ROOK_BOOTH.sectorId
    || (state.run?.kind && !['adventure', 'campaign'].includes(state.run.kind))) return null;
  const player = state.entities?.get(state.playerId), t = state.player?.tether;
  if (!live(state, player) || player.flags?.docked || !finite(player.pos) || !t?.active) return null;
  const hull = state.entities.get(t.targetId), a = state.combat?.attachments?.byId?.[t.attachmentId];
  if (!live(state, hull) || !rookBoothEligible(hull) || !finite(hull.pos) || !finite(hull.vel)
    || hull.physicsBody?.dynamic !== true || !(hull.physicsBody.mass > 0) || !Number.isFinite(hull.physicsBody.mass)
    || !fieldBodyProfile(hull, state).dynamic || !a || a.id !== t.attachmentId || a.state !== 'active'
    || a.ownerId !== player.id || a.targetId !== hull.id || a.ownerGeneration !== player.occupantGeneration
    || a.targetGeneration !== hull.occupantGeneration || a.controllerId != null || a.controlMode === 'ceres_workfleet') return null;
  const pad = rookPadPosition(), reach = ROOK_RECEIVING_BRAKE.reach;
  if (distance(hull.pos, pad) > reach || distance(player.pos, pad) > reach + 220) return null;
  const beacon = (state.entityList || []).find(e => e?.alive && e.data?.rookBooth === true
    && e.physicsBody === false && finite(e.pos) && distance(e.pos, pad) < 1);
  return beacon ? { player, hull, beacon } : null;
}

/** Live reader, not a saved consent or stale worker telemetry leaf. */
export function rookReceivingBrakeReadout(state) {
  const tow = receivingTow(state);
  if (!tow) return null;
  const base = { targetId: tow.hull.id, stand: 'rook' };
  if (isPlayerWanted(state)) return { ...base, status: 'wanted', text: 'Receiving brake locked while WANTED.' };
  if (!rookReceivingBeamClear(state, tow.beacon, tow.hull))
    return { ...base, status: 'blocked', text: 'Receiving beam obstructed. Clear the path between ring and hull.' };
  const held = state.input?.brake === true;
  return { ...base, status: held ? 'braking' : 'ready',
    text: held ? 'Receiving brake engaged. Keep the Line long until the hull settles, then reel inside.'
      : 'Receiving brake ready: hold Brake to slow the attached hull. It does not pull it into the ring.' };
}

export function rookReceivingBrakeImpulse(state, hull, dt) {
  if (!(dt > 0) || !Number.isFinite(dt) || !finite(hull?.vel)) return null;
  const profile = fieldBodyProfile(hull, state), baseMass = hull.physicsBody?.mass;
  if (!profile.dynamic || !(baseMass > 0) || !Number.isFinite(baseMass)) return null;
  const mass = baseMass * Math.max(.25, Math.min(8, profile.physicsMassScale));
  const speed = Math.hypot(hull.vel.x, hull.vel.z);
  if (!(speed > 0) || !Number.isFinite(mass)) return null;
  const c = ROOK_RECEIVING_BRAKE;
  const fraction = Math.min(1, c.gain * dt, Math.min(c.maxAccel, c.maxForce / mass) * dt / speed);
  return { x: -hull.vel.x * fraction * mass, y: 0, z: -hull.vel.z * fraction * mass };
}

export const rookReceivingBrake = {
  name: 'rookReceivingBrake',
  init({ bus }) { this.bus = bus; this.lastCue = null; this.lastTick = null; },
  update(dt, state) {
    if (this.lastTick === state.tick || !(dt > 0)) return;
    this.lastTick = state.tick;
    const tow = receivingTow(state), readout = tow && rookReceivingBrakeReadout(state);
    if (!readout) { this.lastCue = null; return; }
    const key = `${tow.hull.occupantGeneration}:${readout.status}`;
    // Edge feedback only. No per-frame requests or saved service entitlement.
    if (key !== this.lastCue) {
      this.lastCue = key;
      // Keep the flight receipt one clause; the detailed readout belongs to the objective.
      const cue = readout.status === 'braking' ? 'Receiving brake engaged' : readout.text;
      this.bus?.emit('toast', { text: cue, kind: readout.status === 'braking' ? 'info' : 'warn', channel: 'objective', ttl: 5 });
    }
    if (readout.status !== 'braking') return;
    // A synchronous feedback listener can release custody, load a save or kill
    // a body. Revalidate after publication before queuing a physical command.
    const current = receivingTow(state);
    if (!current || current.hull !== tow.hull || current.beacon !== tow.beacon
      || rookReceivingBrakeReadout(state)?.status !== 'braking') return;
    const impulse = rookReceivingBrakeImpulse(state, tow.hull, dt);
    if (impulse) queuePhysicsImpulse(tow.hull, impulse, { tick: state.tick, source: 'rook-receiving-brake' });
  },
};
