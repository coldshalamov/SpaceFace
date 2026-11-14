// Rook's existing ring brakes an attended tow through the physics membrane: the pilot
// holds Brake; the market still reads the real hull pose and speed. This is a library,
// NOT a registered system — `fields` (the towed-body force owner that already queues
// impulses before physics) drives syncRookReceivingBrake every fixed step. The pad
// beacon is resolved on sector/spawn transitions and kept by id; the per-tick path
// touches only the towed hull, the pad, and the bodies the spatial index already
// knows sit near the beam — never a whole-entity-list walk.

import { ROOK_BOOTH } from '../data/rook.js';
import { rookPadPosition, rookBoothEligible } from '../characters/rookRules.js';
import { queuePhysicsImpulse } from '../core/physicsAuthority.js';
import { fieldBodyProfile } from '../core/fields/fieldReadModel.js';
import { isMasslineObstructed } from '../world/asteroidField.js';
import { hullEnvelopeWu } from '../data/collisionProxyManifests.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
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

// ── Pad identity ─────────────────────────────────────────────────────────────────
// One id per GameState, resolved only on the seams that can produce a pad (entity
// spawn, sector/lifecycle transition) and kept. The per-tick read is a single
// keyed lookup — never a scan. Fail-closed: a stale id validates against the live
// map before use; a missing id stays missing until the next transition seam.
const _padIndex = new WeakMap(); // state -> entity id

function padIsLive(e) {
  return !!e && e.alive !== false && e.data?.rookBooth === true && e.physicsBody === false
    && finite(e.pos) && distance(e.pos, rookPadPosition()) < 1;
}

/** The pad beacon just materialized — keep its id, no scan needed. */
export function noteRookPadSpawned(state, entity) {
  if (entity?.data?.rookBooth === true && padIsLive(entity)) _padIndex.set(state, entity.id);
}

/** Sector transitions and lifecycle resets drop the kept id; the next seam refills it. */
export function resetRookPadIndex(state) {
  _padIndex.delete(state);
}

/** One bounded entityList walk — called only from a sector/lifecycle transition
 *  seam (e.g. fields' _clearAll), never from the per-tick readout path. */
export function resolveRookPadEntity(state) {
  let id = null;
  if (state?.world?.currentSectorId === ROOK_BOOTH.sectorId) {
    for (const e of state.entityList || []) {
      if (padIsLive(e)) { id = e.id; break; }
    }
  }
  _padIndex.set(state, id);
  return id == null ? null : state.entities?.get?.(id) ?? null;
}

/** The per-tick read: the kept id plus one keyed lookup. A missing id fails closed —
 *  it does not re-scan; entity:spawned or the next transition resolves a new pad. */
export function rookPadEntity(state) {
  if (state?.world?.currentSectorId !== ROOK_BOOTH.sectorId) return null;
  const id = _padIndex.get(state);
  if (id == null) return null;
  const e = state.entities?.get?.(id);
  if (padIsLive(e)) return e;
  _padIndex.delete(state);
  return null;
}

// ── Beam clearance ───────────────────────────────────────────────────────────────
// The ring's tractor path is pad → hull: terrain and hulls answer through the indexed
// massline obstruction owner; moving bodies answer through one bounded spatial-hash
// query centred on the open span; solid dressing rows walk their own small table.
// The PR's per-tick entityList walk is retired.
const _beamQueryOut = [];
const _beamMid = { x: 0, z: 0 };
// Covers the largest plausible mover: radius plus half a second of travel past the span end.
const BEAM_QUERY_MARGIN = 300;

export function rookReceivingBeamClear(state, beacon, hull) {
  const pad = rookPadPosition();
  if (!finite(hull?.pos) || isMasslineObstructed({ state, player: beacon, target: hull,
    sourceWorld: pad, targetWorld: hull.pos })) return false;
  _beamMid.x = (pad.x + hull.pos.x) * 0.5;
  _beamMid.z = (pad.z + hull.pos.z) * 0.5;
  const span = distance(pad, hull.pos);
  const near = queryNearbyEntities(state, _beamMid, span * 0.5 + BEAM_QUERY_MARGIN, _beamQueryOut);
  // Include ships and other movers as well as the canonical terrain query. A
  // half-second velocity margin conservatively pauses for crossing traffic.
  for (const body of near) {
    if (body === hull || body === beacon || body?.alive === false || body?.collides === false
      || body?.physicsBody === false || !finite(body?.pos)) continue;
    const padding = finite(body.vel) ? Math.hypot(body.vel.x, body.vel.z) * .5 : 0;
    if (segmentDistance(body.pos, pad, hull.pos) <= radius(body) + padding + 2) return false;
  }
  const dressing = state.world?.dressing;
  const rows = dressing && Array.isArray(dressing.rows) ? dressing.rows : null;
  if (rows) {
    for (const row of rows) {
      if (!row || row === hull || row === beacon || row.alive === false
        || row.collides !== true || row.physicsBody === false || !finite(row.pos)) continue;
      if (segmentDistance(row.pos, pad, hull.pos) <= radius(row) + 2) return false;
    }
  }
  return true;
}

// ── The attended tow ─────────────────────────────────────────────────────────────
// Every gate the PR carried, in cheap-first order: context, custody, hull, reach —
// the pad itself arrives resolved by id.
export function rookReceivingTow(state, beacon = rookPadEntity(state)) {
  if (state?.mode !== 'flight' || state.ui?.docked || state.save?.restoring || state.physicsVenue?.active
    || state.world?.currentSectorId !== ROOK_BOOTH.sectorId
    || (state.run?.kind && !['adventure', 'campaign'].includes(state.run.kind))) return null;
  const player = state.entities?.get(state.playerId), t = state.player?.tether;
  if (!live(state, player) || player.flags?.docked || !finite(player.pos) || !t?.active) return null;
  const hull = state.entities.get(t.targetId), a = state.combat?.attachments?.byId?.[t.attachmentId];
  if (!live(state, hull) || !rookBoothEligible(hull) || !finite(hull.pos) || !finite(hull.vel)
    || hull.physicsBody?.dynamic !== true || !(hull.physicsBody.mass > 0) || !Number.isFinite(hull.physicsBody.mass)
    || !fieldBodyProfile(hull, state, _brakeProfile).dynamic || !a || a.id !== t.attachmentId || a.state !== 'active'
    || a.ownerId !== player.id || a.targetId !== hull.id || a.ownerGeneration !== player.occupantGeneration
    || a.targetGeneration !== hull.occupantGeneration || a.controllerId != null || a.controlMode === 'ceres_workfleet') return null;
  const pad = rookPadPosition(), reach = ROOK_RECEIVING_BRAKE.reach;
  if (distance(hull.pos, pad) > reach || distance(player.pos, pad) > reach + 220) return null;
  return padIsLive(beacon) ? { player, hull, beacon } : null;
}

const _brakeProfile = {};

/** Live reader, not a saved consent or stale worker telemetry leaf. */
export function rookReceivingBrakeReadout(state, beacon = rookPadEntity(state)) {
  const tow = rookReceivingTow(state, beacon);
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
  const profile = fieldBodyProfile(hull, state, _brakeProfile), baseMass = hull.physicsBody?.mass;
  if (!profile.dynamic || !(baseMass > 0) || !Number.isFinite(baseMass)) return null;
  const mass = baseMass * Math.max(.25, Math.min(8, profile.physicsMassScale));
  const speed = Math.hypot(hull.vel.x, hull.vel.z);
  if (!(speed > 0) || !Number.isFinite(mass)) return null;
  const c = ROOK_RECEIVING_BRAKE;
  const fraction = Math.min(
    1,
    c.gain * dt,
    Math.min(c.maxAccel, c.maxForce / mass) * dt / speed);
  return { x: -hull.vel.x * fraction * mass, y: 0, z: -hull.vel.z * fraction * mass };
}

/**
 * The owner's per-tick driver. `sys` supplies the bus plus two private slots
 * (_rookBrakeTick, _rookBrakeCue) — edge-only cueing, one impulse per fixed tick.
 */
export function syncRookReceivingBrake(sys, state, dt) {
  if (!(dt > 0) || sys._rookBrakeTick === state.tick) return;
  sys._rookBrakeTick = state.tick;
  const beacon = rookPadEntity(state);
  const tow = beacon && rookReceivingTow(state, beacon);
  const readout = tow && rookReceivingBrakeReadout(state, beacon);
  if (!readout) { sys._rookBrakeCue = null; return; }
  const key = `${tow.hull.occupantGeneration}:${readout.status}`;
  // Edge feedback only. No per-frame requests or saved service entitlement.
  if (key !== sys._rookBrakeCue) {
    sys._rookBrakeCue = key;
    // Keep the flight receipt one clause; the detailed readout belongs to the objective.
    const cue = readout.status === 'braking' ? 'Receiving brake engaged' : readout.text;
    sys.bus?.emit('toast', { text: cue, kind: readout.status === 'braking' ? 'info' : 'warn', channel: 'objective', ttl: 5 });
  }
  if (readout.status !== 'braking') return;
  // A synchronous feedback listener can release custody, load a save or kill
  // a body. Revalidate after publication before queuing a physical command.
  const current = rookReceivingTow(state, beacon);
  if (!current || current.hull !== tow.hull || current.beacon !== tow.beacon
    || rookReceivingBrakeReadout(state, beacon)?.status !== 'braking') return;
  const impulse = rookReceivingBrakeImpulse(state, tow.hull, dt);
  if (impulse) queuePhysicsImpulse(tow.hull, impulse, { tick: state.tick, source: 'rook-receiving-brake' });
}
