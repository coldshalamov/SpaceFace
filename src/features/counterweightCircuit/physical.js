// Counterweight Circuit â€” physical owner layer.
//
// Owns the venue fixture bodies and the bounded per-attempt cohort: real
// spawned entities with durable identities, admitted through the canonical
// spawn/remove helpers, observed through the canonical attachment/physics
// owners. This module NEVER writes poses after spawn and never fabricates a
// success â€” it builds the observation frame attempt.js scores, drives the
// mobile-berth barge through real forces, and routes measured impacts on
// fragile course bodies through the combat damage owner.

import { getCombatKernel } from '../../combat/kernel.js';
import { scalarHitToDamagePacket } from '../../combat/damage.js';
import { resolveCollisionConsequence } from '../../combat/impulseKernel.js';
import { CERES_WORKFLEET_CONTRACT as CERES, ceresWorkfleetCollision } from '../../data/ceresWorkfleet.js';
import { pickCourseShift, admissionResult, cradleFit, receiverFootprint, receiverContainsFootprint, receiverSupportGap, crossedReceiverMouth } from './course.js';
import { attachmentBindsOccupant } from '../../combat/attachments.js';
import { physicsBodyNativeReady, writePhysicsControl } from '../../core/physicsAuthority.js';
import { modelTruthRow, modelTruthProxyManifest, modelTruthSkinHull } from '../../data/modelTruth.js';
import { DEFAULT_MASK, Masks } from '../../core/entity.js';
import { sectorLocalToGlobalForSector } from '../../data/sectorCoordinates.js';
import { VENUE_SECTOR_ID, VENUE_LOCAL, VENUE_STRUCTURES, OFFER_RANGE_WU, COMMIT_RADIUS_WU } from './definition.js';

export const CIRCUIT_OWNER = 'counterweightCircuit';
export const VENUE_BODY_PREFIX = 'pro:counterweightCircuit:venue:';
const ATTACH_DEFS = new Set(['attachment_massline', 'tether_standard']);

const finite = (v, d = 0) => (Number.isFinite(v) ? v : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));

/** Global WU position of a venue-local point (converted once via the canonical owner). */
export function venueGlobalPos(local, out = { x: 0, z: 0 }) {
  return sectorLocalToGlobalForSector({ x: VENUE_LOCAL.x + local.x, z: VENUE_LOCAL.z + local.z }, VENUE_SECTOR_ID, out);
}

export function venueAnchorGlobal(out = { x: 0, z: 0 }) {
  return sectorLocalToGlobalForSector(VENUE_LOCAL, VENUE_SECTOR_ID, out);
}

export function venueIdentity(role) { return `${VENUE_BODY_PREFIX}${role}`; }
export function cohortIdentity(attemptId, role) { return `pro:counterweightCircuit:att${attemptId}:${role}`; }

function isOwnedBody(entity, identity) {
  return !!entity && entity.alive !== false && entity.data?.persistenceOwner === CIRCUIT_OWNER
    && entity.data?.worldRecordId === identity && entity.data?.identityKey === identity;
}

/** Fitted measured collision skin for an authored asset at a body radius â€” the
 *  same packaged-fit contract shipbreakingYard uses, so visible objects and
 *  collision envelopes match instead of substituting a blind capsule. */
const fittedSkins = new Map();
export function fittedManifest(assetId, radius) {
  const key = `${assetId}:${radius}`;
  if (fittedSkins.has(key)) return fittedSkins.get(key);
  const row = modelTruthRow(assetId);
  const measured = assetId === CERES.assets.cradle.id
    ? ceresWorkfleetCollision('cradle', 'open', 'keepers-v2')
    : modelTruthProxyManifest({ type: 'payload', radius, data: { placeId: assetId } });
  if (!row || !measured) { fittedSkins.set(key, null); return null; }
  const reference = row.gameplay?.entityRadius || row.shell?.silhouetteRadius || 1;
  const dimensions = row.worldSize || row.bounds?.size;
  const envelope = Math.max(...(dimensions || [reference * 2]));
  const scale = reference * 2 / Math.max(envelope, 0.001);
  const center = row.bounds?.center || [0, 0, 0];
  const drawScale = finite(row.drawScale, 1);
  const offsetX = center[0] * drawScale / reference;
  const offsetZ = center[2] * drawScale / reference;
  const point = (p) => ({ x: (p.x - offsetX) * scale, z: (p.z - offsetZ) * scale });
  const primitives = measured.primitives.map((p) => {
    if (p.kind === 'capsule') return { ...p, ax: (p.ax - offsetX) * scale, az: (p.az - offsetZ) * scale, bx: (p.bx - offsetX) * scale, bz: (p.bz - offsetZ) * scale, r: p.r * scale };
    return { ...p, ...point(p), ...(p.kind === 'circle' ? { r: p.r * scale } : { hx: p.hx * scale, hz: p.hz * scale }) };
  });
  // A convex hull would close the concave receiving mouth.
  const hull = assetId === CERES.assets.cradle.id ? null : modelTruthSkinHull(row);
  const manifest = {
    ...measured,
    id: `counterweight:${assetId}:fit-v1`,
    referenceRadius: 'radius',
    primitives,
    ...(hull ? { compactHull: hull.map(point) } : {}),
  };
  fittedSkins.set(key, manifest);
  return manifest;
}

function physicsSpec(radius, mass, assetId, extra = {}) {
  const collisionProxyManifest = fittedManifest(assetId, radius);
  if (!collisionProxyManifest) throw new Error(`counterweight_unmeasured_asset:${assetId}`);
  return {
    schemaVersion: 1, radius, mass, dynamic: true,
    inertiaY: 0.5 * mass * radius * radius,
    shape: 'compound',
    ...(collisionProxyManifest ? { collisionProxyManifest: clone(collisionProxyManifest) } : {}),
    ccd: true, material: 'payload', revision: 0, ...extra,
  };
}

/** Entity spec for a permanent venue fixture â€” solid, invulnerable, persistent. */
export function makeVenueSpec(structure) {
  const pos = venueGlobalPos(structure.local);
  const identity = venueIdentity(structure.role);
  return {
    type: 'payload', team: 0, factionId: null, homeSectorId: VENUE_SECTOR_ID,
    pos, vel: { x: 0, z: 0 }, rot: finite(structure.rot), angVel: 0,
    radius: structure.radius, mass: 60, hull: 1e4, hullMax: 1e4,
    shield: 0, shieldMax: 0, collides: true,
    collisionMask: DEFAULT_MASK.payload,
    physicsBody: physicsSpec(structure.radius, 60, structure.asset, { dynamic: false }),
    flags: { persistent: true, missionPinned: true, invuln: true },
    data: {
      persistenceOwner: CIRCUIT_OWNER, worldRecordId: identity, identityKey: identity,
      counterweightVenueRole: structure.role, counterweightVenue: true,
      homeSectorId: VENUE_SECTOR_ID, sectorId: VENUE_SECTOR_ID, transientSector: false,
      packagedPropFile: structure.file, packagedPropSlot: 'place',
      packagedPropRadius: structure.radius, visualRadius: structure.radius,
      name: structure.label || 'Circuit fixture', scanLabel: structure.label || 'Circuit fixture',
      role: 'counterweight_venue', masslineTetherable: false, physicalCustodyOnly: true,
      loot: [], salvagePool: {}, authoredSalvagePool: {}, lifetimeS: Infinity,
    },
  };
}

/** Entity spec for a per-attempt cohort body (load, static course fixture, mobile mover). */
export function makeCohortSpec(bodyDef, attemptId, venueShift) {
  const local = { x: bodyDef.local.x + (venueShift?.x || 0), z: bodyDef.local.z + (venueShift?.z || 0) };
  const pos = venueGlobalPos(local);
  const identity = cohortIdentity(attemptId, bodyDef.role);
  const dynamic = bodyDef.kind !== 'static';
  const mass = finite(bodyDef.mass, dynamic ? 18 : 60);
  const hullMax = finite(bodyDef.hull, dynamic ? 80 : 1e4);
  return {
    type: 'payload', team: 0, factionId: null, homeSectorId: VENUE_SECTOR_ID,
    pos, vel: { x: 0, z: 0 }, rot: finite(bodyDef.rot), angVel: 0,
    radius: bodyDef.radius, mass, hull: hullMax, hullMax,
    shield: 0, shieldMax: 0, collides: true,
    collisionMask: DEFAULT_MASK.payload | Masks.PROJECTILE,
    physicsBody: physicsSpec(bodyDef.radius, mass, bodyDef.asset, {
      dynamic,
      // Receiving rails absorb a gentle landing and its tangential slide. With
      // zero friction a parked load slides off a depth keeper into the deeper
      // outer pocket while the pilot works the other shelf. This is real native
      // contact response, only on receivers; it never holds a floating load.
      ...(bodyDef.zone?.receiver ? { contact: { friction: .8, restitution: 0, restitutionCombine: 'min' } } : {}),
    }),
    flags: { persistent: true, missionPinned: true, invuln: !dynamic },
    data: {
      persistenceOwner: CIRCUIT_OWNER, worldRecordId: identity, identityKey: identity,
      counterweightRole: bodyDef.role, counterweightAttempt: attemptId,
      homeSectorId: VENUE_SECTOR_ID, sectorId: VENUE_SECTOR_ID, transientSector: false,
      combatProfileId: dynamic ? 'combat_profile_tether_payload' : 'combat_profile_tether_anchor',
      packagedPropFile: bodyDef.file, packagedPropSlot: bodyDef.file.startsWith('pods/') ? 'pod' : 'place',
      ...(bodyDef.asset.startsWith('pod_') ? { authoredPayloadAssetId: bodyDef.asset } : {}),
      packagedPropRadius: bodyDef.radius, visualRadius: bodyDef.radius,
      name: bodyDef.label || bodyDef.role, scanLabel: bodyDef.label || 'Circuit body',
      role: 'counterweight_course', masslineTetherable: dynamic, physicalCustodyOnly: true,
      ...(bodyDef.fragile ? { counterweightFragile: true } : {}),
      loot: [], salvagePool: {}, authoredSalvagePool: {}, lifetimeS: Infinity,
    },
  };
}

/**
 * The physical owner adapter. Created by the runtime at init; all body work
 * goes through ctx.helpers (canonical spawn/remove) and the combat/physics
 * owners (attachments, telemetry, forces, damage).
 */
export function createCircuitPhysical(ctx) {
  const { state, helpers, bus } = ctx;
  const bindings = new Map();       // identity -> {entity, generation}
  const lostIdentities = new Set(); // a missing original cannot rebind an impostor
  const receiverMemory = new Map();
  const observedLines = new Map();
  const pendingReleases = [];
  const impactTicks = new Map();
  const pendingImpacts = [];        // bounded per-tick impact receipts on cohort bodies
  let restoring = false;
  let retired = new WeakSet();
  const subscriptions = [];
  const on = (name, fn) => { if (bus?.on) subscriptions.push(bus.on(name, fn)); };

  const player = () => {
    const e = state.entities?.get(state.playerId);
    return e && e.alive !== false ? e : null;
  };

  function byIdentity(identity) {
    if (lostIdentities.has(identity)) return null;
    const cached = bindings.get(identity);
    if (cached && state.entities?.get(cached.entity.id) === cached.entity
      && cached.entity.occupantGeneration === cached.generation && isOwnedBody(cached.entity, identity)) return cached.entity;
    if (cached && !restoring && !retired.has(cached.entity)) {
      bindings.delete(identity);
      lostIdentities.add(identity);
      if (lostIdentities.size > 64) lostIdentities.delete(lostIdentities.values().next().value);
      return null; // a recycled id copying public markers is not the original
    }
    bindings.delete(identity);
    const matches = (state.entityList || []).filter((e) => e?.alive !== false && e.data?.worldRecordId === identity);
    if (matches.length !== 1 || !isOwnedBody(matches[0], identity)) return null;
    const entity = matches[0];
    bindings.set(identity, { entity, generation: entity.occupantGeneration });
    return entity;
  }

  const nativeReady = (entity) => {
    const physics = ctx.registry?.get?.('physics');
    const native = physics?._sg02;
    const record = native?.records?.get?.(entity?.id);
    return !!entity && state.entities?.get(entity.id) === entity && entity.alive !== false
      && !physics?._nativeRestorePending && !physics?._nativeRestoreDeferred
      && !native?._pendingNativeRebuilds?.size
      && !!record?.body && record.entity === entity
      && record.revision === finite(entity.physicsBody?.revision)
      && record.body.isValid?.() !== false
      && physicsBodyNativeReady(entity);
  };

  const attachments = () => getCombatKernel(ctx).attachments;

  /** Live player-owned Massline to a cohort body, or null. */
  function lineToEntity(entity) {
    const p = player();
    if (!p || !entity || !nativeReady(p) || !nativeReady(entity)) return null;
    const list = attachments().listForEntity(entity.id) || [];
    for (const line of list) {
      if (line.state !== 'active' || !ATTACH_DEFS.has(line.defId)) continue;
      const otherEnd = line.ownerId === entity.id ? line.targetId : line.ownerId;
      if (otherEnd !== p.id) continue;
      if (!attachmentBindsOccupant(line, entity.id, entity.occupantGeneration)) continue;
      if (!attachmentBindsOccupant(line, p.id, p.occupantGeneration)) continue;
      const telemetry = helpers.combatPhysics?.getAttachmentTelemetry?.({ attachmentId: line.id, physicsHandle: line.physicsHandle });
      if (!telemetry) continue;
      return { id: line.id, aId: line.ownerId, bId: line.targetId, defId: line.defId, telemetry };
    }
    return null;
  }

  // â”€â”€ venue fixtures â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function ensureVenue() {
    if (!helpers?.spawnEntity) return false;
    let allPresent = true;
    for (const structure of VENUE_STRUCTURES) {
      const identity = venueIdentity(structure.role);
      if (byIdentity(identity)) continue;
      const entity = helpers.spawnEntity(makeVenueSpec(structure));
      if (entity) bindings.set(identity, { entity, generation: entity.occupantGeneration });
      else allPresent = false;
    }
    return allPresent;
  }

  // â”€â”€ attempt cohort â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function cohortAdmission(cohort, def) {
    if ([...cohort.values()].some(entity => byIdentity(entity.data?.worldRecordId)!==entity)) {
      return { ...admissionResult(cohort,def,nativeReady), status:'failure',ready:false,pending:false,
        failure:true,completeCohort:false,reason:'original_missing' };
    }
    return admissionResult(cohort, def, entity => nativeReady(entity)
      && byIdentity(entity.data?.worldRecordId) === entity);
  }

  function admitCohort(def, attemptId, shift) {
    const cohort = new Map();
    if (!shift || !helpers?.spawnEntity) return admissionResult(cohort, def, nativeReady);
    try {
      for (const bodyDef of def.bodies) {
        const identity = cohortIdentity(attemptId, bodyDef.role);
        let entity = byIdentity(identity);
        if (!entity) {
          if (lostIdentities.has(identity)) throw new Error('original_missing');
          entity = helpers.spawnEntity(makeCohortSpec(bodyDef, attemptId, shift));
          if (entity) bindings.set(identity, { entity, generation: entity.occupantGeneration });
        }
        if (!entity) throw new Error('spawn_refused');
        cohort.set(bodyDef.role, entity);
      }
    } catch (error) {
      retireCohort(cohort);
      return { ...admissionResult(cohort, def, nativeReady), reason: String(error.message || 'spawn_refused') };
    }
    return cohortAdmission(cohort, def);
  }

  function retireEntity(entity, reason = 'counterweight_retire') {
    if (!entity || retired.has(entity)) return false;
    retired.add(entity);
    entity.data.counterweightRetired = reason;
    bindings.delete(entity.data.worldRecordId);
    helpers?.removeEntity?.(entity.id, { immediate: false });
    return true;
  }

  function retireCohort(cohortMap) {
    for (const entity of cohortMap.values()) {
      // Safely release any real line still binding the player to a retired body.
      for (const line of attachments().listForEntity(entity.id) || []) {
        try { attachments().cut?.(line.id, entity.id, 'counterweight_retire'); } catch (_) { /* best effort */ }
      }
      retireEntity(entity);
    }
    cohortMap.clear();
    receiverMemory.clear(); observedLines.clear(); pendingReleases.length = 0;
  }

  // â”€â”€ observation frame â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function observe(cohortMap, def, dt = 1 / 60) {
    const p = player();
    const obs = {
      simTime: state.simTime, dt,
      playerPos: p ? { x:p.pos.x,z:p.pos.z } : null,
      playerVel: p ? { x:p.vel.x,z:p.vel.z } : null,
      playerId: p ? p.id : null,
      playerAlive: !!p,
      mode: state.mode,
      committed: false,
      bodies: {},
      lines: [],
      releases: pendingReleases.splice(0),
      receivers: {},
      gates: {},
      impacts: pendingImpacts.splice(0, pendingImpacts.length),
    };
    for (const [role, entity] of cohortMap) {
      const alive = entity.alive !== false && byIdentity(entity.data?.worldRecordId) === entity;
      obs.bodies[role] = alive ? {
        id: entity.id, occupantGeneration: entity.occupantGeneration, radius: entity.radius, rot: entity.rot,
        pos: {x:entity.pos.x,z:entity.pos.z}, prevPos: {x:entity.prevPos?.x ?? entity.pos.x,z:entity.prevPos?.z ?? entity.pos.z},
        vel: {x:entity.vel.x,z:entity.vel.z},
        speed: Math.hypot(entity.vel.x, entity.vel.z),
        hull: entity.hull, hullMax: entity.hullMax, alive: true,
      } : { id:entity.id, occupantGeneration:entity.occupantGeneration, alive: false, hull: 0, hullMax: entity.hullMax || 0 };
      if (alive) {
        const line = lineToEntity(entity);
        if (line) {
          const t = line.telemetry;
          const taut = t.tension > 0.01 && (t.impulse > 0 || t.stretch > 0.001);
          obs.lines.push({ id: line.id, aId: line.aId, bId: line.bId, defId: line.defId, role,
            taut, tension: finite(t.tension), impulse: finite(t.impulse), stretch: finite(t.stretch) });
          observedLines.set(line.id, { entity, generation:entity.occupantGeneration, role,
            player:p, playerGeneration:p.occupantGeneration });
          obs.committed = true;
        }
      }
    }
    for (const [name, gate] of Object.entries(def?.gates || {})) {
      obs.gates[name] = { ...gate, pos: venueGlobalPos({x:gate.pos.x+(_shift?.x||0),z:gate.pos.z+(_shift?.z||0)}) };
    }
    for (const leg of def?.legs || []) {
      const pairs = leg.pairs || (leg.zone ? [[leg.role,leg.zone]] : []);
      for (const [role,zone] of pairs) {
        const key = `${role}:${zone}`;
        if (!obs.receivers[key]) obs.receivers[key] = observeReceiver(cohortMap.get(role),cohortMap.get(zone),key,
          leg.maxSpeed,def.bodies.find(b=>b.role===zone)?.zone);
      }
    }
    // Commit ring: the medal clock also arms when the pilot physically arrives
    // at the staged course â€” no attachment required for an honest approach.
    if (!obs.committed && p && def) {
      const origin = cohortOrigin(def);
      const d = Math.hypot(p.pos.x - origin.x, p.pos.z - origin.z);
      // Choosing a run and reading its briefing is not a timed maneuver.
      // Soft Berth's start ring overlaps the registrar: retain the authored
      // ring/layout, but require departure from the interaction apron for a
      // proximity start. A real line above still commits immediately.
      const registrar = venueAnchorGlobal();
      const outsideBriefingApron = Math.hypot(p.pos.x - registrar.x, p.pos.z - registrar.z) > OFFER_RANGE_WU;
      if (outsideBriefingApron && d <= (def.commitRadius || COMMIT_RADIUS_WU)) obs.committed = true;
    }
    return obs;
  }

  function cohortOrigin(def) {
    // Course origin = the venue-shifted position of the first authored load â€”
    // where the staged mass waits.
    const first = def.bodies.find((b) => b.kind === 'load');
    const shift = _shift;
    return venueGlobalPos({ x: (first ? first.local.x : 0) + (shift?.x || 0), z: (first ? first.local.z : 0) + (shift?.z || 0) });
  }

  let _shift = null;
  function setCourseShift(shift) { _shift = shift; }

  // â”€â”€ measured impacts on cohort bodies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function observeReceiver(body, receiver, key, maxSpeed = 4, zone = {}) {
    const result = {bodyId:body?.id, bodyGeneration:body?.occupantGeneration,
      receiverId:receiver?.id, receiverGeneration:receiver?.occupantGeneration,
      inside:false, entered:false, contact:false, supportContact:false, supportWitness:false,
      supportGapWu:null, supportContactAgeS:null, relativeSpeed:Infinity, stable:false,
      handlingSupported:false, relativeVelocity:null, relativeSpin:null,
      speedLimit:null, spinLimit:null, firstUnmet:null};
    if (!nativeReady(body) || !nativeReady(receiver) || byIdentity(body.data?.worldRecordId)!==body
      || byIdentity(receiver.data?.worldRecordId)!==receiver) return result;
    const bounds=cradleFit(receiver.radius), footprint=receiverFootprint(body,receiver);
    let mem=receiverMemory.get(key);
    if (!mem || mem.body!==body || mem.life!==body.occupantGeneration || mem.receiver!==receiver
      || mem.receiverLife!==receiver.occupantGeneration) {
      mem={body,life:body.occupantGeneration,receiver,receiverLife:receiver.occupantGeneration,entered:false,footprint:null};
      receiverMemory.set(key,mem);
    }
    if (crossedReceiverMouth(mem.footprint,footprint,bounds)) mem.entered=true;
    if (footprint.maxZ<bounds.mouthZ-.1 || footprint.minX<bounds.minX-.1 || footprint.maxX>bounds.maxX+.1) mem.entered=false;
    mem.footprint=footprint;
    result.inside=receiverContainsFootprint(bounds,footprint);
    result.entered=mem.entered;
    const contacts=helpers.combatPhysics?.sampleSolidContacts?.(body.id,{targetId:receiver.id}) || [];
    const live=contacts.filter(c=>c.source==='rapier-solid-contact' && c.tick===state.tick
      && c.sourceLife===body.occupantGeneration && c.targetLife===receiver.occupantGeneration);
    result.contact=live.length>0;
    result.supportContact=live.some(c=>c.targetPrimitiveId==='rear_spine' || c.targetPrimitiveId?.startsWith('depth_keeper_'));
    if (result.supportContact) mem.supportAt=state.simTime;
    const dx=body.pos.x-receiver.pos.x,dz=body.pos.z-receiver.pos.z,w=finite(receiver.angVel);
    result.relativeVelocity={x:body.vel.x-receiver.vel.x+w*dz,z:body.vel.z-receiver.vel.z-w*dx};
    result.relativeSpeed=Math.hypot(result.relativeVelocity.x,result.relativeVelocity.z);
    const age=mem.supportAt==null?Infinity:Math.max(0,state.simTime-mem.supportAt);
    const gap=receiverSupportGap(bounds,footprint);
    result.supportGapWu=gap;result.supportContactAgeS=Number.isFinite(age)?age:null;
    result.supportWitness=result.supportContact || (age<=(zone.supportWitnessS??1.5)
      && gap<=(zone.supportGapWu??.15) && result.relativeSpeed<=(zone.settleSpeedWu??.5));
    result.relativeSpin=Math.abs(finite(body.angVel)-w);
    result.speedLimit=maxSpeed;result.spinLimit=zone.maxSpinRad??.25;
    // This IS the acceptance predicate, in its original short-circuit order.
    // Presentation consumes this verdict rather than rechecking approximate geometry.
    result.firstUnmet=!result.inside?'inside':!result.entered?'mouth':!result.supportWitness?'support'
      :!(result.relativeSpeed<=maxSpeed)?'speed':!(result.relativeSpin<=result.spinLimit)?'spin':null;
    result.stable=result.firstUnmet===null;
    result.handlingSupported=true;
    return result;
  }

  on('tether:broken',(receipt={})=>{
    const witness=observedLines.get(receipt.attachmentId);
    observedLines.delete(receipt.attachmentId);
    if (!witness || receipt.reason!=='tether_cut') return;
    const p=player(), e=witness.entity;
    if (p!==witness.player || p?.occupantGeneration!==witness.playerGeneration || receipt.actorId!==p.id
      || byIdentity(e.data?.worldRecordId)!==e || e.occupantGeneration!==witness.generation) return;
    const line=attachments().get(receipt.attachmentId);
    if (!line || line.state!=='broken' || line.brokenTick!==state.tick
      || !attachmentBindsOccupant(line,e.id,e.occupantGeneration)
      || !attachmentBindsOccupant(line,p.id,p.occupantGeneration)) return;
    if (pendingReleases.length<12) pendingReleases.push({id:line.id,role:witness.role});
  });

  // Generic collisionConsequences ignores these payloads. Reuse its approved
  // payload-only kernel law and the sole combat hull writer, without re-impact.
  on('physics:impact', (payload = {}) => {
    if (payload.backend!=='rapier-dynamic' || payload.tick!==state.tick) return;
    const a=state.entities?.get(payload.aId),b=state.entities?.get(payload.bId);
    if (!a || !b || (a.type!=='payload' && b.type!=='payload')) return;
    if (a.alive===false || b.alive===false
      || a.occupantGeneration!==payload.aGeneration || b.occupantGeneration!==payload.bGeneration
      || !nativeReady(a) || !nativeReady(b)) return;
    for (const [hit,other] of [[a,b],[b,a]]) {
      if (hit.type!=='payload' || hit.flags?.invuln || byIdentity(hit.data?.worldRecordId)!==hit) continue;
      const key=`${hit.id}:${hit.occupantGeneration}:${other.id}:${other.occupantGeneration}`;
      if (state.tick-(impactTicks.get(key)??-Infinity)<12) continue;
      impactTicks.set(key,state.tick);
      if (impactTicks.size>256) impactTicks.delete(impactTicks.keys().next().value);
      const receipt=resolveCollisionConsequence({target:hit,other,exchangedMomentum:payload.impulse,
        tick:state.tick,payloadDamageOnly:true,pos:payload.pos,normal:payload.normal,
        preSolveClosingSpeed:payload.preSolveClosingSpeed,
        provenance:{actorId:payload.causalActorId??null,tag:'environment',appliedTick:state.tick}});
      if (!receipt) continue;
      if (pendingImpacts.length<16) pendingImpacts.push({bodyId:hit.id,role:hit.data.counterweightRole,
        dp:finite(payload.dp),impulse:finite(payload.impulse),tick:state.tick});
      if (!(receipt.impactDamage>0)) continue;
      const packet=scalarHitToDamagePacket({damage:receipt.impactDamage,damageType:'kinetic',pos:receipt.pos,
        source:{kind:`collision_${receipt.surface}`,impulseProvenance:receipt.provenance.tag}});
      packet.flags={allowAnyTarget:true,ignoreFriendlyFire:true};
      getCombatKernel(ctx).routeDamage({attackerId:receipt.provenance.actorId,targetId:hit.id,packet,
        origin:{kind:'collision',id:receipt.surface,bodyGeneration:hit.occupantGeneration,
          otherId:other.id,otherGeneration:other.occupantGeneration}});
    }
  });

  // Same real dynamic receiver throughout; only finite owner controls move it.
  const mover = { entity: null, itinerary: null, waypoint: 0, dwellUntil: 0 };

  function driveMobile(entity, itinerary) {
    if (entity) entity.data.counterweightBerthHeading=entity.rot;
    mover.entity = entity; mover.itinerary = itinerary || null; mover.waypoint = 0; mover.dwellUntil = 0;
  }

  function stepMobile(dt) {
    const e = mover.entity, it = mover.itinerary;
    if (!e || !it || e.alive === false || state.entities?.get(e.id) !== e) return;
    if (!nativeReady(e)) return;
    const wps = it.waypoints || [];
    if (!wps.length) return;
    const target = wps[mover.waypoint % wps.length];
    const goal = venueGlobalPos({ x: target.x + (_shift?.x || 0), z: target.z + (_shift?.z || 0) });
    const dx = goal.x - e.pos.x, dz = goal.z - e.pos.z;
    const dist = Math.hypot(dx, dz);
    const speed=Math.hypot(e.vel.x,e.vel.z);
    if (dist<2 && speed<.4 && mover.dwellUntil===0) mover.dwellUntil=state.simTime+(it.dwellS||0);
    if (mover.dwellUntil && state.simTime>=mover.dwellUntil && dist<3 && speed<.5) {
      mover.waypoint=(mover.waypoint+1)%wps.length; mover.dwellUntil=0;
    }
    const cruise=it.speedWu||6, acceleration=it.accelerationWu||3;
    const desired=mover.dwellUntil ? 0 : Math.min(cruise,Math.sqrt(2*(it.brakingWu||2)*Math.max(0,dist-.5)),dist*1.2);
    const ux=dx/Math.max(dist,.001),uz=dz/Math.max(dist,.001),mass=Math.max(1,finite(e.mass,1));
    const ax=(ux*desired-e.vel.x)*2,az=(uz*desired-e.vel.z)*2;
    const limit=Math.min(1,acceleration/Math.max(.001,Math.hypot(ax,az)));
    const heading=finite(e.data?.counterweightBerthHeading,-Math.PI/2);
    const error=Math.atan2(Math.sin(heading-finite(e.rot)),Math.cos(heading-finite(e.rot)));
    const inertia=finite(e.physicsBody?.inertiaY,mass);
    writePhysicsControl(e,{source:CIRCUIT_OWNER,mode:'itinerary',
      force:{x:ax*limit*mass,y:0,z:az*limit*mass},
      torque:{x:0,y:clamp((error*4-finite(e.angVel)*4)*inertia,-inertia*2,inertia*2),z:0},
      maxSpeed:cruise*1.5});
  }

  function retireMobile() {
    if (mover.entity) retireEntity(mover.entity, 'counterweight_mover_retire');
    mover.entity = null; mover.itinerary = null;
  }

  function afterRestore() {
    restoring = true;
    bindings.clear();
    lostIdentities.clear(); retired = new WeakSet();
    receiverMemory.clear(); observedLines.clear(); pendingReleases.length=0; impactTicks.clear();
    restoring = false;
  }

  function dispose() {
    for (const off of subscriptions.splice(0)) {
      try { off?.(); } catch (_) { /* release best effort */ }
    }
    bindings.clear();
    lostIdentities.clear();
    mover.entity = null; mover.itinerary = null;
    receiverMemory.clear(); observedLines.clear(); pendingReleases.length=0; impactTicks.clear();
    fittedSkins.clear();
  }

  return {
    ctx, player, byIdentity, nativeReady, lineToEntity,
    ensureVenue, pickCourseShift: def => pickCourseShift(state,def,venueGlobalPos),
    admitCohort, cohortAdmission, retireCohort, retireEntity, retireMobile,
    observe, setCourseShift, cohortOrigin, driveMobile, stepMobile,
    afterRestore, dispose,
  };
}
