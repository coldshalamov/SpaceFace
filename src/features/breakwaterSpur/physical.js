// physical.js — Breakwater Spur body admission, original identity, socket
// custody and damage observation. Physics moves bodies; this module verifies
// and records. Durable originals carry persistenceOwner + worldRecordId +
// occupantGeneration identity; recycled numeric ids never alias them.

import {
  BREAKWATER_OWNER, BREAKWATER_SITE_ID, BREAKWATER_SECTOR_ID,
  BREAKWATER_SITE_LOCAL, BREAKWATER_STRUCTURE, BREAKWATER_SOCKETS,
  BREAKWATER_SEAT_CAPS, BREAKWATER_CARTRIDGES, BREAKWATER_POCKET_DRESSING,
  BREAKWATER_SUPPLY_LOAD, BREAKWATER_CONSIGNMENT, BREAKWATER_HAULER,
  BREAKWATER_RAIDER, breakwaterRecordId,
} from './definition.js';
import {
  ensurePhysicsBodySpec, physicsBodyNativeReady, readPhysicsTelemetry,
  writePhysicsControl, cancelOwnedPhysicsControl,
} from '../../core/physicsAuthority.js';
import { sectorLocalToGlobalForSector } from '../../data/sectorCoordinates.js';
import { getCombatKernel } from '../../combat/kernel.js';
import { attachmentBindsOccupant } from '../../combat/attachments.js';
import { makeEnemySpawnSpec } from '../../systems/enemySpawnSpec.js';
import { makeShipEntitySpec } from '../../systems/ships.js';
import { refreshPhysicsPartition, requestActivityReclassify } from '../../world/activityRuntime.js';
import { refreshEntityPhysicsIndex } from '../../core/coreSystem.js';
import { fittedManifest } from '../counterweightCircuit/physical.js';
import { cradleFit, receiverBackZ, receiverFootprint, crossedReceiverMouth } from '../counterweightCircuit/course.js';

const TAU = Math.PI * 2;

function finite(n, fallback = 0) { return Number.isFinite(n) ? n : fallback; }
function dist2XZ(a, b) {
  const dx = finite(a?.x) - finite(b?.x), dz = finite(a?.z) - finite(b?.z);
  return dx * dx + dz * dz;
}
function localToGlobal(local) {
  return sectorLocalToGlobalForSector({ x: local.x, z: local.z }, BREAKWATER_SECTOR_ID);
}
function yawWrap(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function createBreakwaterSpurPhysical(ctx) {
  const state = ctx.state;
  const bus = ctx.bus;
  const helpers = ctx.helpers;
  let disposed = false;
  let suspended = false;
  const receiverMemory = new Map();
  const pendingSeats = new Map();
  // identity-keyed live bindings — never trusted across save/sector boundaries.
  const bindings = new Map();

  const siteAnchor = localToGlobal(BREAKWATER_SITE_LOCAL);

  // --- identity ------------------------------------------------------------

  function matches(entity, worldRecordId) {
    if (!entity || entity.alive === false) return false;
    const data = entity.data;
    return !!data && (data.persistenceOwner === BREAKWATER_OWNER || (data.persistenceOwner === 'worldRecords' && data.siteId === BREAKWATER_SITE_ID && ['hauler','raider'].includes(data.siteRole)))
      && data.worldRecordId === worldRecordId && data.identityKey === worldRecordId;
  }

  function findByRecordId(worldRecordId) {
    const bound = bindings.get(worldRecordId);
    if (bound && bound.entity && bound.entity.alive !== false
      && matches(bound.entity, worldRecordId)
      && bound.entity.occupantGeneration === bound.generation
      && state.entities && state.entities.get(bound.entity.id) === bound.entity) {
      return bound.entity;
    }
    if (bound) return null; // a disappeared/recycled occupant cannot rebind in this visit
    bindings.delete(worldRecordId);
    const matchesFound = (state.entityList || [...state.entities.values()]).filter(entity => matches(entity, worldRecordId));
    if (matchesFound.length !== 1) return null;
    const entity = matchesFound[0];
    bindings.set(worldRecordId, { entity, generation: entity.occupantGeneration || 0 });
    return entity;
  }

  function ownEntities() {
    const out = [];
    for (const entity of state.entityList || state.entities.values()) {
      if (entity?.data?.persistenceOwner === BREAKWATER_OWNER || (entity?.data?.persistenceOwner === 'worldRecords' && entity.data.siteId === BREAKWATER_SITE_ID && ['hauler','raider'].includes(entity.data.siteRole))) out.push(entity);
    }
    return out;
  }

  // --- spawn specs -----------------------------------------------------------

  function staticSpec(piece) {
    const pos = piece.global
      ? { x: piece.global.x, z: piece.global.z }
      : localToGlobal({
          x: BREAKWATER_SITE_LOCAL.x + piece.local.x,
          z: BREAKWATER_SITE_LOCAL.z + piece.local.z,
        });
    const recordRole = piece.recordRole || `structure_${piece.role}`;
    const assetId = piece.file.split('/').at(-1).replace(/\.glb$/, '');
    const manifest = fittedManifest(assetId, piece.radius);
    if (!manifest) return null;
    return {
      type: 'payload', team: 0, factionId: null, homeSectorId: BREAKWATER_SECTOR_ID,
      pos, vel: { x: 0, z: 0 }, rot: piece.rot || 0, angVel: 0,
      radius: piece.radius, mass: piece.mass, hull: 1e6, hullMax: 1e6,
      shield: 0, shieldMax: 0, collides: true,
      physicsBody: {
        schemaVersion: 1, dynamic: false, radius: piece.radius, mass: piece.mass,
        shape: 'compound', collisionProxyManifest: manifest, material: 'prop', revision: 0,
        contact: { restitution: 0, restitutionCombine: 'min' },
      },
      flags: { persistent: true, invuln: true },
      data: {
        persistenceOwner: BREAKWATER_OWNER,
        worldRecordId: breakwaterRecordId(recordRole),
        identityKey: breakwaterRecordId(recordRole),
        sectorId: BREAKWATER_SECTOR_ID, homeSectorId: BREAKWATER_SECTOR_ID,
        transientSector: false, siteId: BREAKWATER_SITE_ID, siteRole: piece.role === 'shelf_drive' ? 'freight_receiver' : piece.role,
        packagedPropFile: piece.file, packagedPropSlot: piece.slot,
        packagedPropRadius: piece.radius, visualRadius: piece.radius,
        name: piece.label, authoredScanLabel: piece.label,
        scannable: piece.scannable === true, scanLabel: piece.scanLabel || piece.label,
        lifetimeS: Infinity, salvagePool: {}, loot: [],
      },
    };
  }

  function socketSpec(socket) {
    const pos = socketGlobal(socket);
    return {
      type: 'payload', team: 0, factionId: null, homeSectorId: BREAKWATER_SECTOR_ID,
      pos, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
      radius: socket.radius, mass: 20000, hull: 1e6, hullMax: 1e6,
      shield: 0, shieldMax: 0, collides: false,
      physicsBody: false, // Scannable marker; the measured cradle owns contact.
      flags: { persistent: true, invuln: true },
      data: {
        persistenceOwner: BREAKWATER_OWNER,
        worldRecordId: breakwaterRecordId(socket.id),
        identityKey: breakwaterRecordId(socket.id),
        sectorId: BREAKWATER_SECTOR_ID, homeSectorId: BREAKWATER_SECTOR_ID,
        transientSector: false, siteId: BREAKWATER_SITE_ID,
        siteRole: 'socket', socketRole: socket.role,
        name: socket.label, scanLabel: `${socket.label} — empty`,
        authoredScanLabel: socket.label, scannable: true,
        lifetimeS: Infinity, salvagePool: {}, loot: [],
      },
    };
  }

  function payloadSpec({ role, file, slot, pos, radius, mass, hullMax, label, extraData }) {
    const worldRecordId = breakwaterRecordId(role);
    const assetId = file.split('/').at(-1).replace(/\.glb$/, '');
    const manifest = fittedManifest(assetId, radius);
    if (!manifest) return null;
    return {
      type: 'payload', team: 0, factionId: null, homeSectorId: BREAKWATER_SECTOR_ID,
      pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
      radius, mass, hull: hullMax, hullMax, shield: 0, shieldMax: 0, collides: true,
      physicsBody: {
        schemaVersion: 1, dynamic: true, radius, mass,
        inertiaY: 0.5 * mass * radius * radius, shape: 'compound', collisionProxyManifest: manifest,
        ccd: true, material: 'payload', revision: 0,
      },
      flags: { persistent: true },
      data: {
        persistenceOwner: BREAKWATER_OWNER, worldRecordId, identityKey: worldRecordId,
        sectorId: BREAKWATER_SECTOR_ID, homeSectorId: BREAKWATER_SECTOR_ID,
        transientSector: false, siteId: BREAKWATER_SITE_ID, siteRole: role,
        packagedPropFile: file, packagedPropSlot: slot,
        packagedPropRadius: radius, visualRadius: radius,
        name: label, scanLabel: label, authoredScanLabel: label, scannable: true,
        towable: true, masslineTetherable: true, physicalCustodyOnly: true,
        loot: [], salvagePool: {}, authoredSalvagePool: {}, lifetimeS: Infinity,
        ...(extraData || {}),
      },
    };
  }

  // --- geometry --------------------------------------------------------------

  function socketGlobal(socketOrRole) {
    const socket = typeof socketOrRole === 'string' ? BREAKWATER_SOCKETS[socketOrRole] : socketOrRole;
    return {
      x: siteAnchor.x + socket.local.x,
      z: siteAnchor.z + socket.local.z,
    };
  }

  function siteLocalPos(local) { return localToGlobal(local); }

  // --- admission ---------------------------------------------------------------

  function ensureStructure() {
    if (suspended || disposed || !helpers?.spawnEntity) return 0;
    if (state.world?.currentSectorId !== BREAKWATER_SECTOR_ID) return 0;
    let spawned = 0;
    for (const piece of BREAKWATER_STRUCTURE) {
      const id = breakwaterRecordId(`structure_${piece.role}`);
      if (findByRecordId(id)) continue;
      const spec = staticSpec(piece);
      if (!spec) continue;
      const entity = helpers.spawnEntity(spec);
      if (entity) { bindings.set(id, { entity, generation: entity.occupantGeneration || 0 }); spawned++; }
    }
    for (const role of Object.keys(BREAKWATER_SOCKETS)) {
      const id = breakwaterRecordId(BREAKWATER_SOCKETS[role].id);
      if (findByRecordId(id)) continue;
      const entity = helpers.spawnEntity(socketSpec(BREAKWATER_SOCKETS[role]));
      if (entity) { bindings.set(id, { entity, generation: entity.occupantGeneration || 0 }); spawned++; }
    }
    for (const piece of BREAKWATER_POCKET_DRESSING) {
      const recordRole = `pocket_${piece.label.replace(/\s+/g, '_')}`;
      const id = breakwaterRecordId(recordRole);
      if (findByRecordId(id)) continue;
      const spec = staticSpec({
        ...piece,
        role: 'pocket_dressing',
        recordRole,
        global: sectorLocalToGlobalForSector({ x: piece.local.x, z: piece.local.z }, BREAKWATER_SECTOR_ID),
        scannable: false,
      });
      if (!spec) continue;
      const entity = helpers.spawnEntity(spec);
      if (entity) { bindings.set(id, { entity, generation: entity.occupantGeneration || 0 }); spawned++; }
    }
    return spawned;
  }

  function ensureCartridge(row, role) {
    const cart = row.cartridges[role];
    if (!cart || !['loose','unconfirmed'].includes(cart.status)) return null;
    const existing = findByRecordId(cart.worldRecordId);
    if (existing) {
      cart.entityId = existing.id; cart.generation = existing.occupantGeneration || 0;
      cart.hull = finite(existing.hull, cart.hull); cart.damaged = cart.hull < cart.hullMax;
      cart.everSpawned = true; cart.status = 'loose';
      if (cart.pendingSeat && existing.physicsBody?.dynamic === false) pendingSeats.set(role,{entity:existing,generation:existing.occupantGeneration});
      return existing;
    }
    if (cart.everSpawned) { cart.status = 'unconfirmed'; return null; }
    if (suspended || disposed || !helpers?.spawnEntity) return null;
    if (state.world?.currentSectorId !== BREAKWATER_SECTOR_ID) return null;
    const spec = BREAKWATER_CARTRIDGES[role];
    const spec2 = payloadSpec({
      role: `cartridge_${role}`, file: spec.file, slot: spec.slot,
      pos: localToGlobal(spec.pocketLocal), radius: spec.radius,
      mass: spec.mass, hullMax: spec.hullMax, label: spec.label,
      extraData: { cartridgeRole: role },
    });
    if (!spec2) return null;
    const entity = helpers.spawnEntity(spec2);
    if (!entity) return null;
    bindings.set(cart.worldRecordId, { entity, generation: entity.occupantGeneration || 0 });
    cart.entityId = entity.id; cart.generation = entity.occupantGeneration || 0;
    cart.everSpawned = true; cart.hull = finite(entity.hull, cart.hull);
    return entity;
  }

  function spawnLooseLoad(row, kind) {
    if (row.looseLoad) return { ok: false, reason: 'load_already_out' };
    if (suspended || disposed || !helpers?.spawnEntity || state.world?.currentSectorId !== BREAKWATER_SECTOR_ID) return { ok: false, reason: 'spawn_unavailable' };
    const def = kind === 'consignment' ? BREAKWATER_CONSIGNMENT : BREAKWATER_SUPPLY_LOAD;
    const pos = kind === 'consignment'
      ? { x: siteAnchor.x + def.local.x, z: siteAnchor.z + def.local.z }
      : localToGlobal(def.pocketLocal);
    const role = kind === 'consignment' ? 'consignment' : 'supply_load';
    const worldRecordId = breakwaterRecordId(`${role}_${row.seq + 1}`);
    const spec = payloadSpec({
      role, file: def.file, slot: def.slot, pos, radius: def.radius,
      mass: def.mass, hullMax: def.hullMax, label: def.label,
      extraData: { loadKind: kind, worldRecordId, identityKey:worldRecordId },
    });
    if (!spec) return {ok:false, reason:'unmeasured_asset'};
    {
      const manifestId=`breakwater:${kind}:${worldRecordId}`, qty=kind==='consignment'?8:18;
      spec.data.cargoManifest={manifestId,lotId:manifestId,destinationId:kind==='consignment'?'station_beltout':BREAKWATER_SITE_ID,lines:[{commodityId:kind==='consignment'?'cmdty_salvage_electronics':'cmdty_scrap_metal',qty}],totalQty:qty,custody:{holderId:worldRecordId}};
    }
    // A spawn observer may save before admission bookkeeping completes. Adopt
    // the unique already-live original when the durable reservation retries.
    const entity = findByRecordId(worldRecordId) || helpers.spawnEntity(spec);
    if (!entity) return { ok: false, reason: 'spawn_failed' };
    entity.data.worldRecordId = worldRecordId;
    entity.data.identityKey = worldRecordId;
    bindings.set(worldRecordId, { entity, generation: entity.occupantGeneration || 0 });
    row.seq = (row.seq || 0) + 1;
    row.looseLoad = {
      kind, worldRecordId, status: 'waiting',
      entityId: entity.id, generation: entity.occupantGeneration || 0,
    };
    return { ok: true, entity, worldRecordId };
  }

  function spawnHauler(row, purpose) {
    if (row.freight.hauler) return { ok: false, reason: 'hauler_active' };
    if (suspended || disposed || !helpers?.spawnEntity || state.world?.currentSectorId !== BREAKWATER_SECTOR_ID) return { ok: false, reason: 'spawn_unavailable' };
    const origin = localToGlobal(BREAKWATER_HAULER.originLocal);
    const berth = { x: siteAnchor.x + BREAKWATER_HAULER.berthLocal.x, z: siteAnchor.z + BREAKWATER_HAULER.berthLocal.z };
    const receiver=findByRecordId(breakwaterRecordId('structure_shelf_drive'));
    if (!receiver) return {ok:false,reason:'receiver_unavailable'};
    const sector = state.world?.sectors?.[BREAKWATER_SECTOR_ID];
    const worldRecordId = breakwaterRecordId(`hauler_${row.seq + 1}`);
    const spec = makeShipEntitySpec(BREAKWATER_HAULER.defId, {
      team: 0, factionId: sector?.factionId || 'faction_meridian',
      pos: origin,
      ai: { archetype: 'civilian', motive: 'route_haul' },
    });
    spec.name = BREAKWATER_HAULER.label;
    spec.data = {
      ...(spec.data || {}),
      persistenceOwner: 'worldRecords', worldRecordId, identityKey: worldRecordId,
      sectorId: BREAKWATER_SECTOR_ID, homeSectorId: BREAKWATER_SECTOR_ID,
      transientSector: false, siteId: BREAKWATER_SITE_ID, siteRole: 'hauler',
      name: BREAKWATER_HAULER.label, authoredScanLabel: BREAKWATER_HAULER.label,
      scannable: true, scanLabel: BREAKWATER_HAULER.label,
    };
    const manifestId=`breakwater:defended_unload:${worldRecordId}`;
    spec.data.cargoManifest={manifestId,lotId:manifestId,destinationId:BREAKWATER_SITE_ID,lines:[{commodityId:'cmdty_scrap_metal',qty:8}],totalQty:8,custody:{holderId:worldRecordId}};
    spec.flags = { ...(spec.flags || {}), persistent: true };
    const entity = helpers.spawnEntity(spec);
    if (!entity) return { ok: false, reason: 'spawn_failed' };
    row.seq = (row.seq || 0) + 1;
    const route = [
      { id: 'origin', pos: { x: origin.x, z: origin.z }, label: 'Outpost approach' },
      { id: `dest:${BREAKWATER_SITE_ID}`, pos: { x: receiver.pos.x-Math.sin(receiver.rot||0)*38, z: receiver.pos.z-Math.cos(receiver.rot||0)*38 }, label: 'Breakwater outboard loading apron', targetRef: `berth:${BREAKWATER_SITE_ID}` },
    ];
    const jobId = ctx.registry?.get?.('npcJobsRuntime')?.assign(entity, {
      kind: 'hauler',
      route,
      speed: BREAKWATER_HAULER.speed,
      loadS: BREAKWATER_HAULER.loadS,
      unloadS: BREAKWATER_HAULER.unloadS,
      sectorId: BREAKWATER_SECTOR_ID,
      payload: { kind: 'breakwater_supply', purpose, requirePhysicalArrival:{reach:3,maxSpeed:4} },
    });
    if (!jobId) { helpers.removeEntity?.(entity.id,{reason:'breakwater_job_refused'}); return {ok:false,reason:'job_refused'}; }
    bindings.set(worldRecordId, { entity, generation: entity.occupantGeneration || 0 });
    row.freight.hauler = {
      worldRecordId, jobId: jobId || null, purpose,
      entityId: entity.id, generation: entity.occupantGeneration || 0,
      phase: 'inbound', spawnedAt: state.simTime,
    };
    return { ok: true, entity, jobId, worldRecordId };
  }

  function spawnRaider(row) {
    if (row.raider) return { ok: false, reason: 'raider_active' };
    if (suspended || disposed || !helpers?.spawnEntity || state.world?.currentSectorId !== BREAKWATER_SECTOR_ID) return { ok: false, reason: 'spawn_unavailable' };
    const pos = localToGlobal(BREAKWATER_RAIDER.spawnLocal);
    const haulerEnt = row.freight.hauler && findByRecordId(row.freight.hauler.worldRecordId);
    const spec = makeEnemySpawnSpec(
      BREAKWATER_RAIDER.enemyTypeId, BREAKWATER_RAIDER.level, pos, {
        factionId: 'faction_reach', motive: 'assigned_interdiction',
        engagementTrigger: 'authorized_hostile_spawn',
      },
    );
    spec.data = spec.data || {};
    spec.data.persistenceOwner = 'worldRecords';
    spec.data.homeSectorId = BREAKWATER_SECTOR_ID;
    spec.flags = {...(spec.flags||{}),persistent:true};
    spec.data.worldRecordId = breakwaterRecordId(`raider_${row.seq + 1}`);
    spec.data.identityKey = spec.data.worldRecordId;
    spec.data.siteId = BREAKWATER_SITE_ID;
    spec.data.siteRole = 'raider';
    if (haulerEnt) spec.data.interdictTargetId = haulerEnt.id;
    const entity = helpers.spawnEntity(spec);
    if (!entity) return { ok: false, reason: 'spawn_failed' };
    row.seq = (row.seq || 0) + 1;
    bindings.set(entity.data.worldRecordId, { entity, generation: entity.occupantGeneration || 0 });
    row.raider = { worldRecordId:entity.data.worldRecordId, entityId: entity.id, generation: entity.occupantGeneration || 0, status: 'active' };
    return { ok: true, entity };
  }

  // --- seat gate ---------------------------------------------------------------

  function cartridgeEntity(row, role) {
    const cart = row.cartridges[role];
    if (!cart || cart.status === 'lost') return null;
    return findByRecordId(cart.worldRecordId);
  }

  function nativeRecord(entity) {
    const physics = ctx.registry?.get?.('physics'), native = physics?._sg02;
    const record = native?.records?.get?.(entity?.id);
    if (!entity || state.entities?.get(entity.id) !== entity || entity.alive === false
      || physics?._nativeRestorePending || physics?._nativeRestoreDeferred
      || native?._pendingNativeRebuilds?.size || !record?.body || record.entity !== entity
      || record.revision !== finite(entity.physicsBody?.revision)
      || record.body.isValid?.() === false || !physicsBodyNativeReady(entity)) return null;
    return record;
  }

  function seatGate(row, socketRole) {
    const socket = BREAKWATER_SOCKETS[socketRole];
    if (!socket) return { ok:false, reason:'unknown_socket' };
    if (row.sockets[socketRole].status === 'seated') return { ok:false, reason:'socket_occupied' };
    const cart = row.cartridges[socket.cartridgeRole];
    if (!cart || cart.status === 'lost') return {ok:false,reason:'original_lost'};
    if (cart.status !== 'loose') return {ok:false,reason:'original_missing'};
    const entity = cartridgeEntity(row, socket.cartridgeRole);
    const receiver = findByRecordId(breakwaterRecordId(`structure_shelf_${socketRole}`));
    if (!nativeRecord(entity) || !nativeRecord(receiver)) return {ok:false,reason:'original_body_not_ready'};
    if (!(entity.hull > 0)) return {ok:false,reason:'original_lost'};
    const footprint = receiverFootprint(entity, receiver), bounds = cradleFit(receiver.radius);
    let memory = receiverMemory.get(socketRole);
    if (!memory || memory.body !== entity || memory.generation !== entity.occupantGeneration
      || memory.receiver !== receiver || memory.receiverGeneration !== receiver.occupantGeneration) {
      memory = {body:entity,generation:entity.occupantGeneration,receiver,
        receiverGeneration:receiver.occupantGeneration,entered:false,footprint:null,supportAt:null};
      receiverMemory.set(socketRole,memory);
    }
    if (crossedReceiverMouth(memory.footprint,footprint,bounds)) memory.entered=true;
    if (footprint.maxZ < bounds.mouthZ-.1 || footprint.minX < bounds.minX-.1 || footprint.maxX > bounds.maxX+.1) memory.entered=false;
    memory.footprint=footprint;
    const back = receiverBackZ(bounds,footprint);
    const inside = footprint.minX >= bounds.minX-.08 && footprint.maxX <= bounds.maxX+.08
      && footprint.minZ >= bounds.mouthZ-.08 && footprint.maxZ <= back+.08;
    const contacts = helpers.combatPhysics?.sampleSolidContacts?.(entity.id,{targetId:receiver.id}) || [];
    const support = contacts.some(c => c.source === 'rapier-solid-contact' && c.tick === state.tick
      && c.sourceLife === entity.occupantGeneration && c.targetLife === receiver.occupantGeneration
      && (c.targetPrimitiveId === 'rear_spine' || c.targetPrimitiveId?.startsWith('depth_keeper_')));
    if (support) memory.supportAt=state.simTime;
    const speed=Math.hypot(entity.vel.x-receiver.vel.x,entity.vel.z-receiver.vel.z);
    const age=memory.supportAt == null ? Infinity : state.simTime-memory.supportAt;
    const supportHeld=support || (age>=0 && age<=1.75 && Math.max(0,back-footprint.maxZ)<=.15 && speed<=.5);
    if (!inside || !memory.entered || !supportHeld) return {ok:false,reason:'bring_original_to_socket'};
    if (speed > BREAKWATER_SEAT_CAPS.speedWuPerS || Math.abs(finite(entity.angVel)-finite(receiver.angVel)) > .25)
      return {ok:false,reason:'slow_and_steady_for_socket'};
    if (Math.abs(yawWrap(finite(entity.rot)-finite(receiver.rot))) > BREAKWATER_SEAT_CAPS.yawDeg*Math.PI/180)
      return {ok:false,reason:'align_with_socket'};
    return {ok:true,entity,receiver,socket,speed};
  }

  // On-request dispatch guidance. Read-only: does not advance mouth memory,
  // stable time or custody. Only discuss an actual original near its own cradle.
  function restorationGuidance(row, role) {
    if (row.phase !== 'restoring' || row.cartridges[role]?.status !== 'loose') return null;
    const entity = cartridgeEntity(row, role);
    const receiver = findByRecordId(breakwaterRecordId(`structure_shelf_${role}`));
    if (!nativeRecord(entity) || !nativeRecord(receiver) || !(entity.hull > 0)
      || Math.hypot(entity.pos.x-receiver.pos.x,entity.pos.z-receiver.pos.z)>60) return null;
    const yaw = Math.abs(yawWrap(finite(entity.rot)-finite(receiver.rot)))*180/Math.PI;
    const speed = Math.hypot(entity.vel.x-receiver.vel.x,entity.vel.z-receiver.vel.z);
    const spin = Math.abs(finite(entity.angVel)-finite(receiver.angVel));
    const label = BREAKWATER_CARTRIDGES[role].label;
    if (yaw>BREAKWATER_SEAT_CAPS.yawDeg)
      return `${label}: the cartridge is still skewed. Square it with the cradle before pushing through the mouth; I cannot seat it sideways.`;
    if (speed>BREAKWATER_SEAT_CAPS.speedWuPerS || spin>.25)
      return `${label}: alignment looks right, but it is still drifting or turning too fast. Ease off and let it settle.`;
    return `${label}: alignment looks right. Guide it through the open mouth and gently against the rear support; hold steady until Seat is offered. Proximity alone is not a seat.`;
  }

  // Fixed-step watch — stable for holdS before custody is offered.
  function updateSeatWatch(row, socketRole, dt) {
    const pending = pendingSeats.get(socketRole);
    if (pending) {
      const {entity,generation} = pending;
      const native = nativeRecord(entity);
      if (!entity || entity.alive === false || entity.occupantGeneration !== generation) {
        pendingSeats.delete(socketRole); row.seatWatch[socketRole]=null;
        return {ok:false,reason:'original_missing'};
      }
      if (!native || native.body.isFixed?.() !== true) return {ok:false,reason:'native_seating_pending'};
      pendingSeats.delete(socketRole);
      const cart = row.cartridges[BREAKWATER_SOCKETS[socketRole].cartridgeRole], socket=row.sockets[socketRole];
      socket.status='seated'; socket.cartridgeRole=cart.role; socket.seatedAt=state.simTime;
      cart.status='seated'; cart.pendingSeat=false; cart.seatedAt=state.simTime; cart.entityId=entity.id;
      cart.generation=generation; cart.hull=finite(entity.hull,cart.hull); cart.damaged=cart.hull<cart.hullMax;
      row.seatWatch[socketRole]=null;
      return {ok:true,seated:true,entity,cartridge:cart};
    }
    const gate = seatGate(row, socketRole), watch = row.seatWatch[socketRole];
    if (!gate.ok) { if (watch) row.seatWatch[socketRole]=null; return gate; }
    const gen=gate.entity.occupantGeneration;
    if (!watch || watch.entityId !== gate.entity.id || watch.generation !== gen) {
      row.seatWatch[socketRole]={entityId:gate.entity.id,generation:gen,since:0};
      return {...gate,stable:false,holdRemaining:BREAKWATER_SEAT_CAPS.holdS};
    }
    watch.since+=dt;
    return {...gate,stable:watch.since>=BREAKWATER_SEAT_CAPS.holdS,
      holdRemaining:Math.max(0,BREAKWATER_SEAT_CAPS.holdS-watch.since)};
  }

  function attachmentsService() {
    return getCombatKernel(ctx)?.attachments || null;
  }

  function linesTargeting(entityId) {
    const svc = attachmentsService();
    if (!svc?.listForEntity) return [];
    return (svc.listForEntity(entityId) || [])
      .filter(att => att && att.state === 'active' && att.targetId === entityId);
  }

  // Accept custody: cut every active line on the original through the attachment
  // owner, then weld it into the socket (fixed body — part of the structure).
  function trySeat(row, socketRole) {
    if (pendingSeats.has(socketRole)) return {ok:false,reason:'native_seating_pending'};
    const watch=row.seatWatch[socketRole], gate=seatGate(row,socketRole);
    if (!gate.ok) return {ok:false,reason:gate.reason};
    const entity=gate.entity;
    if (!watch || watch.entityId!==entity.id || watch.generation!==entity.occupantGeneration
      || watch.since<BREAKWATER_SEAT_CAPS.holdS) return {ok:false,reason:'settle_before_seating'};
    const svc=attachmentsService();
    for (const line of svc?.listForEntity?.(entity.id) || []) {
      if (line.state!=='active') continue;
      if (!attachmentBindsOccupant(line,entity.id,entity.occupantGeneration)
        || !svc.cut(line.id,null,'breakwater_custody')?.ok) return {ok:false,reason:'release_refused'};
    }
    cancelOwnedPhysicsControl(entity,BREAKWATER_OWNER);
    entity.physicsBody={...entity.physicsBody,dynamic:false,revision:finite(entity.physicsBody?.revision)+1};
    ensurePhysicsBodySpec(entity);
    if (refreshEntityPhysicsIndex(state,entity,entity.occupantGeneration)) {
      refreshPhysicsPartition(entity); requestActivityReclassify(state,entity,{physicsPublication:true});
    }
    row.cartridges[BREAKWATER_SOCKETS[socketRole].cartridgeRole].pendingSeat=true;
    pendingSeats.set(socketRole,{entity,generation:entity.occupantGeneration});
    return {ok:true,pending:true};
  }

  // Site-custody for loose loads (supply handoff at shelf / consignment at
  // destination): same low-speed + distance gate, then the original retires
  // into custody — an accepted transfer, never a loss.
  function custodyGate(row, load, gatePos, radius) {
    if (!load || load.status === 'lost' || load.status === 'delivered') return { ok: false, reason: 'no_load' };
    const entity = findByRecordId(load.worldRecordId);
    if (!entity) return { ok: false, reason: 'load_missing' };
    if (!physicsBodyNativeReady(entity)) return { ok: false, reason: 'body_not_ready' };
    if (dist2XZ(entity.pos, gatePos) > radius * radius) return { ok: false, reason: 'out_of_range', entity };
    const tele = readPhysicsTelemetry(entity) || {};
    const vel = entity.vel || tele.vel || { x: 0, z: 0 };
    if (Math.hypot(finite(vel.x), finite(vel.z)) > BREAKWATER_SEAT_CAPS.speedWuPerS) {
      return { ok: false, reason: 'too_fast', entity };
    }
    return { ok: true, entity };
  }

  function acceptCustody(row, load, entity) {
    const svc = attachmentsService();
    for (const line of linesTargeting(entity.id)) {
      svc.cut(line.id, null, 'breakwater_custody');
    }
    cancelOwnedPhysicsControl(entity, BREAKWATER_OWNER);
    load._custodyRetire = entity.id;   // entity:destroyed handler reads this first
    if (helpers?.removeEntity) helpers.removeEntity(entity.id, { reason: 'breakwater_custody' });
    bindings.delete(load.worldRecordId);
    return true;
  }

  // --- damage & loss -----------------------------------------------------------

  function recordDamage(row, entity) {
    const data = entity?.data || {};
    const role = data.cartridgeRole;
    if (role && row.cartridges[role]) {
      const cart = row.cartridges[role];
      const hull = finite(entity.hull, cart.hull);
      if (hull < cart.hull) {
        cart.hull = hull;
        cart.damaged = true;
        return { type: 'damaged', role, hull };
      }
    }
    if (data.siteRole === 'supply_load' || data.siteRole === 'consignment') {
      return { type: 'load_damaged', kind: data.loadKind, hull: finite(entity.hull) };
    }
    return null;
  }

  function recordLoss(row, entity, reason) {
    const data = entity?.data || {};
    if (data.persistenceOwner !== BREAKWATER_OWNER && !(data.persistenceOwner === 'worldRecords' && data.siteId === BREAKWATER_SITE_ID && ['hauler','raider'].includes(data.siteRole))) return null;
    const role = data.cartridgeRole;
    if (role && row.cartridges[role]) {
      const cart = row.cartridges[role];
      if (cart.status === 'lost') return null;
      cart.status = 'lost';
      cart.lostAt = state.simTime;
      cart.lostReason = reason || 'destroyed';
      cart.entityId = null;
      bindings.delete(cart.worldRecordId);
      // A lost original never reseats; if it was seated the socket empties again.
      for (const s of Object.values(row.sockets)) {
        if (s.status === 'seated' && s.cartridgeRole === role) {
          s.status = 'empty'; s.cartridgeRole = null; s.seatedAt = null;
        }
      }
      return { type: 'cartridge_lost', role, reason };
    }
    if (row.looseLoad && data.worldRecordId === row.looseLoad.worldRecordId) {
      if (row.looseLoad._custodyRetire === entity.id) {
        row.looseLoad._custodyRetire = null;
        return null;   // custody retire — the accepted handoff already recorded
      }
      const kind = row.looseLoad.kind;
      row.looseLoad.status = 'lost';
      bindings.delete(row.looseLoad.worldRecordId);
      return { type: 'load_lost', kind, reason };
    }
    if (row.freight.hauler && data.worldRecordId === row.freight.hauler.worldRecordId) {
      const purpose = row.freight.hauler.purpose;
      row.freight.hauler.phase = 'lost';
      bindings.delete(row.freight.hauler.worldRecordId);
      return { type: 'hauler_lost', purpose, reason };
    }
    if (row.raider && data.siteRole === 'raider') {
      row.raider.status = 'down';
      return { type: 'raider_down' };
    }
    return null;
  }

  function handleImpact(row, payload) {
    const a = state.entities.get(payload.aId), b = state.entities.get(payload.bId);
    for (const entity of [a, b]) {
      const data = entity?.data;
      if (!data || data.persistenceOwner !== BREAKWATER_OWNER) continue;
      if (!data.cartridgeRole && data.siteRole !== 'supply_load' && data.siteRole !== 'consignment') continue;
      const impulse = finite(payload.impulse);
      const entityMass = Math.max(finite(entity.mass, 1), 1);
      // Impact damage only on real hits — scaled by the body's own mass so a
      // towed pod isn't ruined by ordinary docking taps.
      if (impulse > entityMass * 2.2) {
        const kernel = getCombatKernel(ctx);
        kernel?.routeDamage?.({
          attackerId: payload.causalActorId ?? (entity === a ? payload.bId : payload.aId),
          targetId: entity.id,
          packet: { channels: { kinetic: impulse / entityMass }, flags: { ignoreFriendlyFire: true }, penetration: 1 },
          origin: { kind: 'environment', id: 'breakwater_impact' },
        });
      }
    }
  }

  // Only the feature-owned movable originals need a feature save; worldRecords
  // deliberately excludes them. Capture their actual finite pose and condition.
  function snapshotBodies(row) {
    const old=row.bodySnapshots || {}, snapshots={...old};
    const ids=[...Object.values(row.cartridges).map(c=>c.worldRecordId),row.looseLoad?.worldRecordId].filter(Boolean);
    for (const id of ids) {
      const e=findByRecordId(id);
      if (!e || e.alive===false || !(e.hull>0)) continue;
      if (![e.pos?.x,e.pos?.z,e.vel?.x,e.vel?.z,e.rot,e.angVel,e.hull].every(Number.isFinite)) continue;
      snapshots[id]={pos:{x:e.pos.x,z:e.pos.z},vel:{x:e.vel.x,z:e.vel.z},rot:e.rot,angVel:e.angVel,
        hull:e.hull,dynamic:e.physicsBody?.dynamic!==false,
        cargoManifest:e.data?.cargoManifest ? JSON.parse(JSON.stringify(e.data.cargoManifest)) : null};
    }
    return snapshots;
  }

  function restoreBodies(row) {
    if (suspended || disposed || state.world?.currentSectorId!==BREAKWATER_SECTOR_ID) return;
    const entries=[...Object.entries(row.cartridges).map(([role,c])=>({role:`cartridge_${role}`,record:c,def:BREAKWATER_CARTRIDGES[role],extra:{cartridgeRole:role}})),
      ...(row.looseLoad ? [{role:row.looseLoad.kind==='consignment'?'consignment':'supply_load',record:row.looseLoad,
        def:row.looseLoad.kind==='consignment'?BREAKWATER_CONSIGNMENT:BREAKWATER_SUPPLY_LOAD,extra:{loadKind:row.looseLoad.kind}}] : [])];
    for (const {role,record,def,extra} of entries) {
      if (record.status==='lost' || findByRecordId(record.worldRecordId)) continue;
      const snap=row.bodySnapshots?.[record.worldRecordId];
      if (!snap || ![snap.pos?.x,snap.pos?.z,snap.vel?.x,snap.vel?.z,snap.rot,snap.angVel,snap.hull].every(Number.isFinite)
        || !(snap.hull>0) || snap.hull>def.hullMax) continue;
      const spec=payloadSpec({role,file:def.file,slot:def.slot,pos:snap.pos,radius:def.radius,mass:def.mass,hullMax:def.hullMax,label:def.label,extraData:extra});
      if (!spec) continue;
      spec.data.worldRecordId=record.worldRecordId; spec.data.identityKey=record.worldRecordId;
      if (snap.cargoManifest) spec.data.cargoManifest=JSON.parse(JSON.stringify(snap.cargoManifest));
      spec.vel={...snap.vel}; spec.rot=snap.rot; spec.angVel=snap.angVel; spec.hull=snap.hull;
      spec.physicsBody.dynamic=snap.dynamic!==false;
      const entity=helpers.spawnEntity(spec);
      if (entity) {bindings.set(record.worldRecordId,{entity,generation:entity.occupantGeneration||0});record.entityId=entity.id;record.generation=entity.occupantGeneration||0;}
    }
  }

  // --- lifecycle ---------------------------------------------------------------

  function suspendBodies() { suspended = true; }
  function resume() { suspended = false; }

  function teardown() {
    bindings.clear(); receiverMemory.clear(); pendingSeats.clear();
    suspended = false;
  }

  function retireOwned() {
    for (const entity of ownEntities()) {
      for (const line of attachmentsService()?.listForEntity?.(entity.id) || []) {
        if (line.state === 'active' && attachmentBindsOccupant(line,entity.id,entity.occupantGeneration))
          attachmentsService()?.cut?.(line.id,null,'breakwater_reset');
      }
      cancelOwnedPhysicsControl(entity,BREAKWATER_OWNER);
      helpers?.removeEntity?.(entity.id,{reason:'breakwater_reset'});
    }
    pendingSeats.clear(); receiverMemory.clear(); bindings.clear();
  }

  function destroy() {
    retireOwned(); disposed = true;
    bindings.clear();
  }

  return {
    siteAnchor,
    socketGlobal,
    siteLocalPos,
    ownEntities,
    findByRecordId,
    matches,
    ensureStructure,
    ensureCartridge,
    spawnLooseLoad,
    spawnHauler,
    spawnRaider,
    cartridgeEntity,
    seatGate,
    restorationGuidance,
    updateSeatWatch,
    trySeat,
    custodyGate,
    acceptCustody,
    recordDamage,
    recordLoss,
    handleImpact,
    linesTargeting,
    snapshotBodies,
    restoreBodies,
    suspendBodies,
    resume,
    retireOwned,
    teardown,
    destroy,
  };
}
