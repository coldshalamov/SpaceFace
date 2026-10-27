// The existing crew works actual finite field bodies. This module owns neither ore nor cargo.
import { PALLAS_SEAM as C, pallasSeamRole, pallasSeamCenter } from '../data/pallasSeamWork.js';
import { BEAMS } from '../data/mining.js';
import { physicsBodyNativeReady } from '../core/physicsAuthority.js';
import { forEachFieldRock } from '../world/livingWorldViews.js';
import { promoteAsteroidFieldRock } from '../world/asteroidField.js';
const beam = BEAMS.find(b => b.id === 'beam_mk1');
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const lives = new WeakMap(), sources = new WeakMap();
export function forgetPallasSeamLife(entry) { lives.delete(entry); sources.delete(entry); }
function actor(owner, entry, entity) {
  const role = pallasSeamRole(owner.state, entity);
  if (!role || entry?.control || entry?.towAssist || entry?.job?.corrupt
    || owner.state.npcJobs?.byId?.[entry.job.id] !== entry || entry.entityId !== entity.id
    || entry.worldRecordId !== entity.data.worldRecordId || entity.data.jobId !== entry.job.id) return null;
  const held = lives.get(entry);
  if (held && (held.entity !== entity || held.data !== entity.data || held.job !== entry.job || held.generation !== entity.occupantGeneration)) return null;
  if (!held) lives.set(entry, { entity, data: entity.data, job: entry.job, generation: entity.occupantGeneration });
  return role;
}
function pose(owner, entity) {
  if (!entity || entity.alive === false) return null;
  if (owner.state.settings?.gameplay?.physicsBackend !== 'rapier-dynamic') return { pos: entity.pos, vel: entity.vel };
  const physics = owner.registry?.get('physics'), native = physics?._sg02;
  const r = native?.records?.get(entity.id), b = r?.body;
  if (physics?._nativeRestorePending || physics?._nativeRestoreDeferred || !physicsBodyNativeReady(entity)
    || r?.entity !== entity || !b || native.world.getRigidBody(b.handle) !== b
    || !Number.isInteger(native._simTick) || owner.state.tick - native._simTick < 0 || owner.state.tick - native._simTick > 2
    || (r.spec.dynamic !== false && r._postStepReadTick !== native.tick) || !r.colliders?.length) return null;
  try {
    if (!b.isEnabled() || b.numColliders() !== r.colliders.length || r.colliders.some((c, i) => !c.isEnabled()
      || b.collider(i) !== c || native.world.getCollider(c.handle) !== c || c.parent() !== b)) return null;
    const p = b.translation(), v = b.linvel(), rotation = b.rotation(), angular = b.angvel();
    const o = native._frameOrigin || { x: 0, z: 0 };
    if (![p.x, p.y, p.z, v.x, v.y, v.z, rotation.x, rotation.y, rotation.z, rotation.w, angular.x, angular.y, angular.z].every(Number.isFinite)) return null;
    const result = { pos: { x: p.x + o.x, z: p.z + o.z }, vel: { x: v.x, z: v.z } };
    // Native pose is authoritative. Public legacy presentation writers can lag this read;
    // never use that scalar mirror to certify work or rewrite a native body.
    return result;
  } catch { return null; }
}
const sourceSlot = rock => rock?.data?.activityObjectSlotId || rock?.data?.asteroidSlotId || rock?.data?.slotId;
function source(owner, entry) {
  const payload = entry.job.payload ||= {};
  if (payload.pallasSeamFinished === true || payload.pallasSeamUnavailable === true) return null;
  const held = sources.get(entry);
  if (held) {
    const rock = owner.state.entities?.get(held.entity.id);
    if (rock !== held.entity || rock.data !== held.data || rock.occupantGeneration !== held.generation
      || rock.alive === false || rock.data.fieldId !== C.field || rock.data.siteAnchored || rock.data.opticStructureId
      || rock.data.resourceBodyId !== payload.pallasSeamSource
      || (rock.data.sourceSeed ?? null) !== payload.pallasSeamSourceSeed || rock.data.respawnAt != null) {
      payload.pallasSeamUnavailable = true; return null;
    }
    return rock;
  }
  const saved = payload.pallasSeamSource && owner.state.world?.resourceBodies?.byId?.[payload.pallasSeamSource];
  if (payload.pallasSeamSource && (!saved || saved.outcome !== 'active' || saved.fieldId !== C.field || saved.sectorId !== C.sector)) {
    payload.pallasSeamUnavailable = true; return null;
  }
  let found = null, best = Infinity;
  const center = pallasSeamCenter();
  forEachFieldRock(owner.state, rock => {
    if (rock?.alive === false || rock?.data?.fieldId !== C.field || rock.data.siteAnchored || rock.data.opticStructureId
      || rock.data.isChunk || rock.data.respawnAt != null || sourceSlot(rock) == null) return;
    if (saved && (String(sourceSlot(rock)) !== saved.slotId || (rock.data.sourceSeed ?? null) !== payload.pallasSeamSourceSeed)) return;
    const d = distance(rock.pos, center);
    if (d < best) { found = rock; best = d; }
  });
  if (!found) { if (saved) payload.pallasSeamUnavailable = true; else payload.pallasSeamWaiting = true; return null; }
  const rock = promoteAsteroidFieldRock(owner.state, found.id, owner.helpers, 'npc-mine');
  if (!rock) return null;
  const record = owner.registry?.get('world')?.persistResourceBody(rock);
  if (!record || (saved && record.recordId !== payload.pallasSeamSource)) return null;
  payload.pallasSeamWaiting = false;
  payload.pallasSeamSource = record.recordId;
  payload.pallasSeamSourceSeed = rock.data.sourceSeed ?? null;
  sources.set(entry, { entity: rock, data: rock.data, generation: rock.occupantGeneration });
  return rock;
}
export function pallasSeamTarget(owner, entry, entity) {
  const role = actor(owner, entry, entity);
  if (!role || ['flee', 'complete'].includes(entry.job.phase)) return null;
  const workPose = pose(owner, entity);
  if (!workPose) return { blocked: true };
  if (role === 'miner') {
    const rock = source(owner, entry), target = pose(owner, rock);
    if (!rock) return { blocked: true };
    // A saved crew can be far from the field now. Navigation may approach an observed
    // resource position, but only a current native source can advance or authorize a cut.
    const reach = Math.min((rock.radius || 0) + beam.range * .75, (rock.radius || 0) + (entity.radius || 0) + 26);
    entity.data.pallasSeamStandbyTick = !target && distance(workPose.pos, rock.pos) <= reach ? owner.state.tick : null;
    return { ...(target || { pos: rock.pos, vel: { x: 0, z: 0 } }), ready: !!target, workPose, reach };
  }
  // Saved timetables may still contain the old zone center. Repoint the itinerary only;
  // the old hull stays exactly where Continue restored it and must fly here normally.
  const route = entry.job.route;
  const index = ['transit', 'return'].includes(entry.job.phase) ? (entry.job.routeIndex + 1) % route.length : entry.job.routeIndex;
  const center = pallasSeamCenter(), offsets = [{ x: -91.9, z: 77.1 }, { x: -34.2, z: -94 }];
  const offset = offsets[index];
  if (!offset) return { blocked: true };
  return { pos: { x: center.x + offset.x, z: center.z + offset.z }, vel: { x: 0, z: 0 }, workPose, reach: 12 };
}
export function pallasSeamMeasurement(owner, entry, entity) {
  if (actor(owner, entry, entity) !== 'surveyor') return null;
  const target = pallasSeamTarget(owner, entry, entity);
  return target && !target.blocked && distance(target.workPose.pos, target.pos) <= target.reach
    && Math.hypot(target.workPose.vel.x, target.workPose.vel.z) <= 8 ? target.workPose.pos : null;
}
export function stepPallasSeamCut(owner, entry, entity, dt) {
  if (actor(owner, entry, entity) !== 'miner') return;
  entity.data.minerShiftActive = false;
  if (entry.job.phase !== 'work' || !(dt > 0) || entry.berthHold
    || owner.state.simTime < (entry.closeCallUntil || 0)) return;
  const rock = source(owner, entry), target = pallasSeamTarget(owner, entry, entity);
  if (!rock || !target || target.blocked || target.ready === false || distance(target.workPose.pos, target.pos) > target.reach
    || distance(target.workPose.vel, target.vel) > 8) return;
  const mining = owner.registry?.get('mining');
  if (!mining?.applyMining) return;
  entity.data.miningBeam = { ...beam, tierId: 'beam_mk1', directToCargo: false };
  entity.data.minerShiftRockId = rock.id;
  entity.data.minerShiftActive = true;
  const job = entry.job, data = entity.data, generation = entity.occupantGeneration;
  mining.applyMining(rock.id, beam.dps, Math.min(dt, .1), entity.id);
  if (owner.state.npcJobs?.byId?.[job.id] !== entry || owner.state.entities?.get(entity.id) !== entity
    || entry.job !== job || entity.data !== data || entity.occupantGeneration !== generation) return;
  if (rock.alive === false || rock.data.oreHP <= 0) {
    entry.job.payload.pallasSeamFinished = true;
    entity.data.minerShiftActive = false;
  }
}
