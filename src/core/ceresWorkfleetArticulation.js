// Native authority for the two named Ceres slide rigs. Runtime requests a target; only
// this fixed-step motor accepts motion. Neither rendering nor jobs advance the fraction.
import {
  CERES_WORKFLEET_SLIDE_SECONDS, ceresWorkfleetSlide, ceresWorkfleetSlideRole,
  clampCeresWorkfleetSlide, ceresWorkfleetMovingPrimitives, poseCeresWorkfleetPrimitive,
  sweepCeresWorkfleetPrimitive,
} from '../data/ceresWorkfleetArticulation.js';
import { planarProxyObbHalfHeight } from './planarProxyGeometry.js';
import { articulatedColliderRadius } from './articulatedColliderBounds.js';

const movingByManifest=new WeakMap();
function movingFor(rec,role){const manifest=rec.entity.physicsBody.collisionProxyManifest;let found=movingByManifest.get(manifest);if(!found){found=ceresWorkfleetMovingPrimitives(role,manifest);movingByManifest.set(manifest,found);}return found;}
const yawQuat = yaw => ({ x: 0, y: -Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
// Same tall planar extrusion as SG-02's initial compound builder. Changing a ram's
// extent must never reintroduce shallow-roof contact degeneracy or authored density.
const halfHeight = planarProxyObbHalfHeight;

export function syncCeresWorkfleetColliders(rec, refreshSpine, RAPIER) {
  const role = ceresWorkfleetSlideRole(rec.entity);
  if (!role) return false;
  const fraction = ceresWorkfleetSlide(rec.entity);
  rec.entity.data.ceresWorkfleetSlide = fraction;
  if (rec.ceresWorkfleetFraction === fraction && rec.ceresWorkfleetRole === role) return false;
  for (const { primitive, index } of movingFor(rec,role)) {
    const p = poseCeresWorkfleetPrimitive(primitive, role, fraction), collider = rec.colliders[index];
    const scale = rec.entity.radius, hx = p.hx * scale, hz = p.hz * scale;
    collider.setTranslationWrtParent({ x: p.x * scale, y: 0, z: p.z * scale });
    // setHalfExtents leaves Rapier's public shape cache stale; setShape updates both
    // native geometry and that cache, which owns the broad bound/coincident spines.
    if (primitive.id.includes('_ram_')) collider.setShape(new RAPIER.Cuboid(hx, halfHeight(hx, hz), hz));
    if (refreshSpine) rec.coincidentSpines[index] = refreshSpine(collider);
  }
  rec.ceresWorkfleetFraction = fraction;
  rec.ceresWorkfleetRole = role;
  rec.collectorSweepRadius = null;
  rec.body.wakeUp();
  return true;
}

export function stepCeresWorkfleetSlides(owner, rec, dt, pairsForm, refreshSpine) {
  const e = rec.entity, role = ceresWorkfleetSlideRole(e);
  if (!role || !(dt > 0) || !Number.isFinite(dt) || owner.records.get(e.id) !== rec
    || rec.ceresWorkfleetEntity !== e || rec.ceresWorkfleetLife !== e.occupantGeneration
    || e.alive === false || e.hull <= 0 || e.physicsBody === false || e.collides === false
    || e.data.ceresWorkfleetSlideDisabled === true || e.data.disabled === true
    || rec.body.isEnabled?.() === false) return false;
  const from = ceresWorkfleetSlide(e), target = Number.isFinite(e.data.ceresWorkfleetSlideTarget)
    ? clampCeresWorkfleetSlide(e.data.ceresWorkfleetSlideTarget) : from;
  const to = from + Math.sign(target - from) * Math.min(Math.abs(target - from), dt / CERES_WORKFLEET_SLIDE_SECONDS);
  e.data.ceresWorkfleetSlideBlocked = false;
  delete e.data.ceresWorkfleetSlideBlocker;
  if (to === from) return false;
  const pos = rec.body.translation(), q = rec.body.rotation();
  // Read the native yaw, not the rounded mirrored scalar after Continue/rebinding.
  const yaw = Math.atan2(-2 * q.y * q.w, 1 - 2 * q.y * q.y), c = Math.cos(yaw), s = Math.sin(yaw);
  const scale = e.radius, peers = [], ownReach = articulatedColliderRadius(rec) + 36 * scale / (role === 'breaker' ? 110 : 114);
  for (const peer of owner.records.values()) {
    if (peer === rec || peer.entity.alive === false || peer.entity.physicsBody === false
      || peer.body.isEnabled?.() === false || !pairsForm(e, rec.spec, peer.entity, peer.spec)) continue;
    const other = peer.body.translation(), reach = ownReach + articulatedColliderRadius(peer);
    if ((other.x - pos.x) ** 2 + (other.y - pos.y) ** 2 + (other.z - pos.z) ** 2 <= reach * reach) peers.push(peer);
  }
  // Direct collider queries see newly admitted peers before the first broad-phase step.
  if (peers.length) owner.world.propagateModifiedBodyPositionsToColliders();
  for (const { primitive } of peers.length ? movingFor(rec,role) : []) {
    const p = sweepCeresWorkfleetPrimitive(primitive, role, from, to), hx = p.hx * scale, hz = p.hz * scale;
    const shape = new owner.RAPIER.Cuboid(hx, halfHeight(hx, hz), hz);
    const at = { x: pos.x + (c * p.x - s * p.z) * scale, y: pos.y, z: pos.z + (s * p.x + c * p.z) * scale };
    for (const peer of peers) for (const collider of peer.colliders) {
      if (collider.isSensor?.() || collider.isEnabled?.() === false) continue;
      // Touching is allowed, penetrating is not. No pad/section exception, proxy shrink,
      // endpoint-only test, or staging tolerance substitutes for this continuous sweep.
      const contact = collider.contactShape(shape, at, yawQuat(yaw), 0);
      if (contact && contact.distance < 0) {
        e.data.ceresWorkfleetSlideBlocked = true;
        e.data.ceresWorkfleetSlideBlocker = peer.entity.data?.worldRecordId || peer.entity.id;
        return false;
      }
    }
  }
  e.data.ceresWorkfleetSlide = to;
  syncCeresWorkfleetColliders(rec, refreshSpine, owner.RAPIER);
  return true;
}
