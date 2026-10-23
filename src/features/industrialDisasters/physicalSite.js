import { getCombatKernel } from '../../combat/kernel.js';
import { entityLocalPointToWorld } from '../../combat/geometry.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse, physicsBodyNativeReady } from '../../core/physicsAuthority.js';
import { presentationAllowsPlayerFacingAction } from '../../core/presentationAdmission.js';
import { refreshEntityPhysicsIndex } from '../../core/coreSystem.js';
import { refreshPhysicsPartition, requestActivityReclassify } from '../../world/activityRuntime.js';
import { SITE, getScenario, sitePoint } from './scenarios.js';

// This adapter authors bodies and submits commands. Rapier remains the only writer of live
// position, velocity and rotation; combat remains the only writer of hull damage. Numeric ids are
// runtime handles. All lifetime/save reconciliation uses the durable role identity instead.
export const INDUSTRIAL_PHYSICAL_VERSION = 1;
const OWNER = 'industrialDisasters';
// Corruption bounds, never gameplay limits. The corridor's current hard fence extends about
// 98,000 WU from this site on its furthest axis; ordinary towing may leave the Ceres disk.
// Native throws retain given momentum, so restore must not silently apply a craft cruise cap.
const MAX_COORDINATE_DELTA = 128_000;
const MAX_SPEED = 10_000;
const MAX_ANGULAR_SPEED = 1_000;
const MAX_CONTACTS = 24;
const STATUSES = new Set(['intact', 'damaged', 'disabled', 'rescued', 'secured', 'lost']);
const PLAYER_LINE_DEFS = new Set(['tether_standard', 'attachment_massline']);

const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const point = (value, fallback) => ({ x: finite(value?.x, fallback.x), z: finite(value?.z, fallback.z) });
const yaw = (value) => ((finite(value) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
const live = (entity) => !!entity && entity.alive !== false && Number(entity.hull) > 0;
const identity = (scenarioId, cycle, role) => `${SITE.id}/${scenarioId}/${cycle}/${role}`;
const cycleOf = (record) => clamp(Math.floor(finite(record?.cycle)), 0, 1_000_000);

function normalizedPlayerTether(raw, scenario) {
  const spec = scenario?.bodies.find(body => body.role === raw?.role);
  if (!spec || !PLAYER_LINE_DEFS.has(raw?.defId) || !Number.isFinite(raw.restLength)) return null;
  const result = { role: spec.role, defId: raw.defId, restLength: clamp(raw.restLength, 0, 480) };
  for (const key of ['sourceSocketId', 'targetSocketId']) {
    if (typeof raw[key] === 'string' && /^[A-Za-z0-9_:-]{1,96}$/.test(raw[key])) result[key] = raw[key];
  }
  for (const [key, limit] of [['sourceAnchorLocal', 200], ['targetAnchorLocal', spec.radius * 2]]) {
    const p = raw[key];
    if (Number.isFinite(p?.x) && Number.isFinite(p?.z) && Math.hypot(p.x, p.z) <= limit) {
      result[key] = { x: p.x, z: p.z };
    }
  }
  return result;
}

export function normalizeIndustrialPhysicalSnapshot(raw, scenario, anchor = SITE.anchor, cycle = 0) {
  scenario = typeof scenario === 'string' ? getScenario(scenario) : scenario;
  const input = raw && typeof raw === 'object' ? raw : {};
  const out = { version: INDUSTRIAL_PHYSICAL_VERSION, started: input.started === true,
    powerConnected: !!scenario?.connection && input.powerConnected !== false,
    powerRestLength: clamp(finite(input.powerRestLength, 44), 0, 80),
    playerTether: normalizedPlayerTether(input.playerTether, scenario), rows: {} };
  if (!scenario) return out;
  cycle = clamp(Math.floor(finite(cycle)), 0, 1_000_000);
  for (const spec of scenario.bodies) {
    const saved = input.rows?.[spec.role];
    if (!saved || typeof saved !== 'object') continue;
    const initial = sitePoint(spec.offset, anchor);
    const pos = point(saved.pos, initial);
    pos.x = clamp(pos.x, anchor.x - MAX_COORDINATE_DELTA, anchor.x + MAX_COORDINATE_DELTA);
    pos.z = clamp(pos.z, anchor.z - MAX_COORDINATE_DELTA, anchor.z + MAX_COORDINATE_DELTA);
    const vel = point(saved.vel, { x: 0, z: 0 });
    const speed = Math.hypot(vel.x, vel.z);
    if (speed > MAX_SPEED) { vel.x *= MAX_SPEED / speed; vel.z *= MAX_SPEED / speed; }
    const tombstone = saved.tombstone === true || saved.alive === false || saved.hull === 0;
    out.rows[spec.role] = {
      worldRecordId: identity(scenario.id, cycle, spec.role), pos, vel,
      rot: yaw(saved.rot),
      angVel: clamp(finite(saved.angVel), -MAX_ANGULAR_SPEED, MAX_ANGULAR_SPEED),
      hull: tombstone ? 0 : clamp(finite(saved.hull, spec.hull), 1, spec.hull),
      alive: !tombstone, tombstone,
      status: tombstone ? 'lost' : (STATUSES.has(saved.status) ? saved.status : 'intact'),
    };
  }
  return out;
}

/** Production ports only: ctx is the same {state,bus,helpers,registry} the registry supplies. */
export function createIndustrialPhysicalSite(ctx) {
  const { state, helpers, bus } = ctx;
  if (!state?.entities || typeof helpers?.spawnEntity !== 'function'
    || typeof helpers?.removeEntity !== 'function') throw new TypeError('Industrial site requires canonical entity lifetime ports');
  const kernel = getCombatKernel(ctx);
  const requiresPresentation = () => !!state.render?.scene
    || (typeof ctx.industrialPresentationRequired === 'function'
      ? ctx.industrialPresentationRequired() === true : ctx.industrialPresentationRequired === true);
  const bound = new Map();
  const pendingMotion = new Map();
  const contacts = [];
  let current = null;
  let scenario = null;
  let anchor = { ...SITE.anchor };
  let powerAttachmentId = null;
  let spawnTick = -1;
  let initialIssuedTick = null;
  let pendingPlayerTether = null;
  let disposed = false;

  function owns(entity) {
    return entity?.data?.persistenceOwner === OWNER
      && entity.data.industrialDisasterSiteId === SITE.id;
  }
  function ownedRows() {
    return [...state.entities.values()].filter(owns);
  }
  function bodies() {
    const out = Object.create(null);
    for (const [role, entity] of bound) {
      // A pool id may already belong to a new occupant. Never follow its recycled handle.
      if (state.entities.get(entity.id) === entity && live(entity)) out[role] = entity;
    }
    return out;
  }
  function attachedPower() {
    if (!powerAttachmentId) return null;
    const attachment = kernel.attachments.get(powerAttachmentId);
    return attachment?.state === 'active' ? attachment : null;
  }
  function sever(reason = 'industrial-isolated', preserve = false) {
    const attachment = attachedPower();
    if (attachment) kernel.attachments.cut(attachment.id, null, reason);
    powerAttachmentId = null;
    if (current?.physical && !preserve) current.physical.powerConnected = false;
  }
  function cleanReferences(entity) {
    for (const attachment of kernel.attachments.listForEntity(entity.id)) {
      kernel.attachments.cut(attachment.id, null, 'industrial-unloaded');
    }
    if (state.player?.targetId === entity.id) state.player.targetId = null;
    if (state.player?.waypointEntityId === entity.id) state.player.waypointEntityId = null;
  }
  function retire(entity, reason) {
    if (!entity || state.entities.get(entity.id) !== entity) return;
    cleanReferences(entity);
    helpers.removeEntity(entity.id, { immediate: true, reason });
  }
  function bodySpec(spec, saved) {
    const pos = saved?.pos || sitePoint(spec.offset, anchor);
    const roleIdentity = identity(scenario.id, cycleOf(current), spec.role);
    return {
      type: 'payload', _noMesh: true,
      pos: { ...pos }, vel: { x: 0, z: 0 }, rot: saved?.rot || 0, angVel: 0,
      radius: spec.radius, mass: spec.mass, hull: saved?.hull ?? spec.hull, hullMax: spec.hull,
      collides: !requiresPresentation(), ttl: Infinity, team: null, factionId: SITE.factionId,
      flags: { missionPinned: true, masslineTetherable: !requiresPresentation() },
      physicsBody: {
        schemaVersion: 1, revision: 1, dynamic: true,
        radius: spec.radius, mass: spec.mass,
        inertiaY: Math.max(1, 0.5 * spec.mass * spec.radius * spec.radius),
        shape: 'ball', ccd: true, material: requiresPresentation() ? 'massline_sensor' : 'payload',
        // A disaster never contributes generic kill loot or a second salvage resource pool.
        impactDamageScale: 0,
      },
      data: {
        name: spec.label, scanLabel: spec.label, role: 'industrial_disaster_body', kind: 'payload',
        industrialDisasterSiteId: SITE.id, industrialDisasterRole: spec.role,
        industrialDisasterScenario: scenario.id, industrialDisasterCycle: cycleOf(current),
        industrialSiteId: SITE.id, industrialRole: spec.role,
        industrialScenarioId: scenario.id, industrialCycle: cycleOf(current),
        industrialDisasterKind: spec.kind, industrialDisasterStatus: saved?.status || 'intact',
        worldRecordId: roleIdentity, worldObjectId: roleIdentity,
        persistenceOwner: OWNER, homeSectorId: SITE.sectorId, sectorId: SITE.sectorId,
        masslineTetherable: !requiresPresentation(), worldSiteTargetable: !requiresPresentation(),
        // The feature render adapter mounts this exact existing authored place on this body's
        // pose. It publishes ready on the ORIGINAL entity after its view-only fx descriptor loads.
        presentationOwnerWorldRecordId: roleIdentity,
        placeId: spec.assetId, placeTargetRadius: spec.radius, worldOneOff: true,
        visualRadius: spec.radius, salvagePool: {}, authoredSalvagePool: {},
        transientSector: false, missionPinned: true,
      },
    };
  }
  function materialize(record, definition = getScenario(record?.scenarioId), position = SITE.anchor) {
    if (disposed) throw new Error('Industrial physical adapter was disposed');
    if (!definition) throw new TypeError('Unknown industrial crisis');
    const continuing = current === record && scenario?.id === definition.id;
    if (current && !continuing) suspend(current);
    current = record; scenario = definition; anchor = point(position, SITE.anchor);
    if (!record.physical) record.physical = normalizeIndustrialPhysicalSnapshot(null, scenario, anchor, cycleOf(record));
    if (!continuing) pendingPlayerTether = normalizedPlayerTether(record.physical.playerTether, scenario);
    // A continuous visit is a six-body reconciliation, never a scan of the entire sector at 60 Hz.
    // Only a new visit/save adoption needs to find existing durable identities in the world map.
    const existing = continuing ? [...bound.values()] : ownedRows();
    let spawned = 0;
    for (const spec of scenario.bodies) {
      const wr = identity(scenario.id, cycleOf(record), spec.role);
      const saved = record.physical.rows?.[spec.role];
      const matches = existing.filter(entity => entity.data.worldRecordId === wr);
      if (saved?.tombstone || saved?.alive === false) {
        for (const entity of matches) retire(entity, 'industrial-tombstone');
        bound.delete(spec.role); continue;
      }
      let entity = matches.find(candidate => state.entities.get(candidate.id) === candidate && live(candidate));
      if (!entity && bound.has(spec.role)) {
        // Missing after a live binding is destruction, never a reason to mint a replacement.
        const dead = bound.get(spec.role);
        const tombstone = saved || { worldRecordId: wr,
          pos: point(dead?.pos, sitePoint(spec.offset, anchor)),
          vel: point(dead?.vel, { x: 0, z: 0 }), rot: finite(dead?.rot), angVel: finite(dead?.angVel) };
        tombstone.alive = false; tombstone.tombstone = true; tombstone.hull = 0; tombstone.status = 'lost';
        record.physical.rows[spec.role] = tombstone;
        bound.delete(spec.role); continue;
      }
      for (const duplicate of matches) if (duplicate !== entity) retire(duplicate, 'industrial-duplicate');
      if (!entity) {
        entity = helpers.spawnEntity(bodySpec(spec, saved));
        if (!entity) continue;
        entity.presentationAdmission = 'pending';
        pendingMotion.set(spec.role, { vel: point(saved?.vel, { x: 0, z: 0 }),
          angVel: finite(saved?.angVel), issuedTick: null });
        spawnTick = state.tick || 0;
        spawned++;
      }
      bound.set(spec.role, entity);
    }
    // Old cycle remnants are private to this owner; cleaning them cannot touch a neighbour's work.
    const wanted = new Set(scenario.bodies.map(spec => identity(scenario.id, cycleOf(record), spec.role)));
    for (const entity of existing) if (!wanted.has(entity.data.worldRecordId)) retire(entity, 'industrial-old-cycle');
    return { spawned, bodies: bodies(), ready: links().ready };
  }

  function nativeReady() {
    if (!current || !scenario) return false;
    const backend = state.settings?.gameplay?.physicsBackend;
    if (backend === 'rapier-dynamic' && state.physicsRuntime?.diagnostics?.sg02Ready !== true) return false;
    // One owner turn must have seen the newly spawned/revised original bodies. A previously
    // published sector snapshot cannot prove that this visit's endpoints exist in the native
    // owner yet (pooled ids may also still name the outgoing occupant in that snapshot).
    if ((state.tick || 0) <= spawnTick) return false;
    for (const spec of scenario.bodies) {
      if (!bound.has(spec.role) && !current.physical.rows?.[spec.role]?.tombstone) return false;
    }
    for (const entity of Object.values(bodies())) {
      if (!physicsBodyNativeReady(entity)) return false;
      if (requiresPresentation() && (entity.presentationAdmission !== 'ready'
        || !presentationAllowsPlayerFacingAction(entity, state))) {
        if (entity.collides !== false) setCollisionAdmission(entity, false);
        return false;
      }
      if (entity.collides === false) {
        // The authored view admits the SAME native identity. Pending GLBs cannot become invisible
        // walls. Changing the body revision asks the native owner to rebuild its collider; there
        // is no entity replacement and no handwritten position/velocity synchronization.
        setCollisionAdmission(entity, true);
        return false;
      }
    }
    return true;
  }
  function setCollisionAdmission(entity, admitted) {
    entity.collides = admitted;
    entity.flags.masslineTetherable = admitted;
    entity.data.masslineTetherable = admitted;
    entity.data.worldSiteTargetable = admitted;
    entity.physicsBody = { ...entity.physicsBody, material: admitted ? 'payload' : 'massline_sensor',
      revision: (entity.physicsBody.revision || 0) + 1 };
    if (refreshEntityPhysicsIndex(state, entity, entity.occupantGeneration)) {
      refreshPhysicsPartition(entity); requestActivityReclassify(state, entity);
    }
    spawnTick = state.tick || 0;
  }
  function ensurePowerLink() {
    if (!scenario?.connection || current?.physical?.powerConnected === false) return true;
    const entities = bodies();
    const from = entities[scenario.connection.fromRole];
    const to = entities[scenario.connection.toRole];
    if (!from || !to) { sever('industrial-endpoint-lost'); return true; }
    if (powerAttachmentId) {
      if (!attachedPower()) { current.physical.powerConnected = false; powerAttachmentId = null; }
      return true;
    }
    // Adopt a still-live original cable on an in-place save restore instead of creating a twin.
    const existing = kernel.attachments.listForEntity(from.id).find(attachment =>
      attachment.ownerId === from.id && attachment.targetId === to.id
      && attachment.controlMode === 'industrial-power');
    if (existing) { powerAttachmentId = existing.id; return true; }
    // Twin Bridle is the established world-to-world cable; standard player Massline requires an
    // emitter socket that a passive service skid does not possess.
    const made = kernel.attachments.create({ defId: 'attachment_twin_bridle',
      ownerId: from.id, targetId: to.id, sourceWorld: { ...from.pos }, targetWorld: { ...to.pos },
      controlMode: 'industrial-power' });
    if (!made.ok) return false;
    powerAttachmentId = made.attachment.id;
    const length = finite(current.physical.powerRestLength, 44);
    const reeled = kernel.attachments.reel(powerAttachmentId, length - made.attachment.restLength);
    if (reeled.ok) current.physical.powerRestLength = reeled.attachment.restLength;
    return true;
  }
  function links() {
    const admitted = nativeReady();
    const linkReady = admitted && ensurePowerLink();
    return { ready: admitted && linkReady, powerConnected: !!scenario?.connection
      && current?.physical?.powerConnected !== false && !!attachedPower(),
      powerPending: !!scenario?.connection && !linkReady,
      powerAttachmentId, playerTetherPending: !!pendingPlayerTether, contacts: contacts.slice(),
      missingRoles: scenario ? scenario.bodies.filter(spec => current?.physical?.rows?.[spec.role]?.tombstone
        || (bound.has(spec.role) && (state.entities.get(bound.get(spec.role).id) !== bound.get(spec.role)
          || !live(bound.get(spec.role))))).map(spec => spec.role) : [] };
  }
  function playerTetherSnapshot() {
    if (state.playerId == null) return null;
    const player = state.entities.get(state.playerId);
    if (!live(player)) return null;
    for (const attachment of kernel.attachments.listForEntity(state.playerId)) {
      if (attachment.ownerId !== state.playerId || !PLAYER_LINE_DEFS.has(attachment.defId)) continue;
      if (attachment.ownerGeneration != null && attachment.ownerGeneration !== player.occupantGeneration) continue;
      const target = state.entities.get(attachment.targetId);
      const role = target?.data?.industrialDisasterRole;
      if (!live(target) || bound.get(role) !== target
        || (attachment.targetGeneration != null && attachment.targetGeneration !== target.occupantGeneration)) continue;
      return normalizedPlayerTether({ role, defId: attachment.defId, restLength: attachment.restLength,
        sourceSocketId: attachment.sourceSocketId, targetSocketId: attachment.targetSocketId,
        sourceAnchorLocal: attachment.sourceAnchorLocal, targetAnchorLocal: attachment.targetAnchorLocal }, scenario);
    }
    return null;
  }
  function restorePlayerTether() {
    if (!pendingPlayerTether) return;
    const saved = pendingPlayerTether;
    const player = state.entities.get(state.playerId);
    const target = bodies()[saved.role];
    if (!target || current.physical.rows?.[saved.role]?.tombstone) {
      pendingPlayerTether = null; current.physical.playerTether = null; return;
    }
    if (!live(player) || !physicsBodyNativeReady(player)) return;
    const existing = kernel.attachments.listForEntity(player.id).filter(attachment => attachment.ownerId === player.id);
    if (existing.length) {
      // Generic/stunt persistence may already have restored this original line. Adopt it once;
      // a different line is an intentional current player choice and must never be overwritten.
      pendingPlayerTether = null;
      current.physical.playerTether = playerTetherSnapshot();
      return;
    }
    const spec = { defId: saved.defId, ownerId: player.id, targetId: target.id };
    for (const key of ['sourceSocketId', 'targetSocketId']) if (saved[key]) spec[key] = saved[key];
    if (saved.sourceAnchorLocal) spec.sourceWorld = entityLocalPointToWorld(player, saved.sourceAnchorLocal);
    if (saved.targetAnchorLocal) spec.targetWorld = entityLocalPointToWorld(target, saved.targetAnchorLocal);
    const made = kernel.attachments.create(spec);
    if (!made.ok) {
      // Only a pending native port may retry. An incompatible/missing socket is a real refusal,
      // never permission to swap attachment definitions or fabricate a player controller.
      if (['physics_port_unavailable', 'physics_body_missing', 'physics_attachment_pending', 'physics_create_rejected'].includes(made.reason)) return;
      pendingPlayerTether = null; current.physical.playerTether = null; return;
    }
    const reeled = kernel.attachments.reel(made.attachment.id, saved.restLength - made.attachment.restLength);
    pendingPlayerTether = null;
    if (!reeled.ok) {
      kernel.attachments.cut(made.attachment.id, player.id, 'industrial-restore-refused');
      current.physical.playerTether = null;
      return;
    }
    current.physical.playerTether = playerTetherSnapshot();
  }
  function start(record = current) {
    if (!record || record !== current || !links().ready) return false;
    restorePlayerTether();
    settleIssuedMotion();
    // On cold restore motion waits behind authored/native admission, then resumes exactly once.
    // A preview gets its previously earned motion back, but never the authored accident kick.
    for (const [role, motion] of pendingMotion) {
      if (motion.issuedTick !== null) continue;
      const entity = bodies()[role];
      if (!entity) continue;
      queuePhysicsImpulse(entity, { x: motion.vel.x * entity.mass, z: motion.vel.z * entity.mass },
        { source: OWNER, reason: 'restore-motion', tick: state.tick });
      if (motion.angVel) {
        // Angular restoration is sent through the same owner membrane below.
        restoreSpin(entity, motion.angVel, state.tick);
      }
      motion.issuedTick = state.tick || 0;
    }
    if (!record.physical.started && initialIssuedTick === null && record.phase !== 'preview') {
      for (const spec of scenario.bodies) {
        const entity = bodies()[spec.role];
        if (!entity) continue;
        queuePhysicsImpulse(entity, { x: spec.velocity.x * entity.mass, z: spec.velocity.z * entity.mass },
          { source: OWNER, reason: 'accident-release', tick: state.tick });
      }
      // The command is not yet motion. A save between this submission and the native owner turn
      // must retain the unspent release instead of silently saving a stopped accident.
      initialIssuedTick = state.tick || 0;
    }
    return true;
  }
  function settleIssuedMotion() {
    const native = state.settings?.gameplay?.physicsBackend !== 'rapier-dynamic'
      || state.physicsRuntime?.diagnostics?.sg02Ready === true;
    if (!native) return;
    for (const [role, motion] of pendingMotion) {
      if (motion.issuedTick !== null && (state.tick || 0) > motion.issuedTick) pendingMotion.delete(role);
    }
    if (initialIssuedTick !== null && (state.tick || 0) > initialIssuedTick) {
      if (current?.physical) current.physical.started = true;
      initialIssuedTick = null;
    }
  }
  function drive(entity, intent, dt) {
    if (!live(entity) || !Number.isFinite(intent.goal?.x) || !Number.isFinite(intent.goal?.z)) return;
    const dx = intent.goal.x - entity.pos.x, dz = intent.goal.z - entity.pos.z;
    const distance = Math.hypot(dx, dz);
    const speed = Math.min(clamp(finite(intent.speed), 0, 12), distance * 2);
    const desiredX = distance > 1e-6 ? dx / distance * speed : 0;
    const desiredZ = distance > 1e-6 ? dz / distance * speed : 0;
    let jx = (desiredX - entity.vel.x) * entity.mass;
    let jz = (desiredZ - entity.vel.z) * entity.mass;
    const length = Math.hypot(jx, jz);
    const budget = clamp(finite(intent.maxForce, 100), 0, 400) * dt;
    if (length > budget && length > 0) { jx *= budget / length; jz *= budget / length; }
    queuePhysicsImpulse(entity, { x: jx, z: jz }, { source: OWNER,
      reason: 'evacuation-thruster', tick: state.tick, continuous: true, dt });
  }
  function damage(entity, intent) {
    if (!live(entity)) return null;
    // Disabled remains a recoverable physical object. Death by an unrelated weapon is still
    // honest death and is tombstoned by the lifetime listener, never silently resurrected.
    const amount = Math.min(Math.max(0, finite(intent.amount)), Math.max(0, entity.hull - 1));
    if (!(amount > 0)) return null;
    const result = kernel.routeDamage({ attackerId: null, targetId: entity.id,
      origin: { kind: 'environment', id: `${SITE.id}:${intent.cause || 'hazard'}` },
      packet: { channels: { thermal: amount }, shieldBypass: 1, penetration: 0,
        flags: { allowAnyTarget: true }, source: { id: OWNER } } });
    if (result?.ok !== false) entity.data.industrialDisasterStatus = entity.hull <= 25 ? 'disabled' : 'damaged';
    return result;
  }
  function step(intents = [], dt = 0, record = current) {
    if (!record || record !== current || !links().ready) return { ready: false, applied: 0 };
    start(record);
    let applied = 0;
    const entities = bodies();
    for (const intent of Array.isArray(intents) ? intents : []) {
      if (!intent || typeof intent !== 'object') continue;
      if (intent.type === 'sever' && intent.linkId === 'power') {
        sever(); applied++; continue;
      }
      const entity = entities[intent.role];
      if (!entity) continue;
      if (intent.type === 'drive' && scenario.crewRoles.includes(intent.role)) {
        drive(entity, intent, Math.max(0, finite(dt))); applied++;
      } else if (intent.type === 'damage') { damage(entity, intent); applied++; }
    }
    contacts.length = 0;
    return { ready: true, applied };
  }
  function snapshot(record = current) {
    if (!record || record !== current || !scenario) return record?.physical || null;
    settleIssuedMotion();
    const physical = record.physical;
    for (const spec of scenario.bodies) {
      const entity = bound.get(spec.role);
      if (!entity) continue;
      const present = state.entities.get(entity.id) === entity && live(entity);
      const pending = pendingMotion.get(spec.role);
      const prior = physical.rows[spec.role];
      const velocity = point(entity.vel, { x: 0, z: 0 });
      // A ready individual body may already have received a real pilot shove while another
      // authored asset is still pending. Saved restoration is an additive owner impulse, so
      // preserve that observed motion as well as the still-unconsumed restoration command.
      if (pending) { velocity.x += pending.vel.x; velocity.z += pending.vel.z; }
      physical.rows[spec.role] = {
        worldRecordId: identity(scenario.id, cycleOf(record), spec.role),
        pos: point(entity.pos, sitePoint(spec.offset, anchor)),
        vel: velocity,
        rot: finite(entity.rot), angVel: finite(entity.angVel) + finite(pending?.angVel),
        hull: present ? clamp(entity.hull, 1, spec.hull) : 0,
        alive: present, tombstone: !present || prior?.tombstone === true,
        status: present ? entity.data.industrialDisasterStatus || 'intact' : 'lost',
      };
    }
    const attachment = attachedPower();
    if (attachment) physical.powerRestLength = attachment.restLength;
    else if (powerAttachmentId) physical.powerConnected = false;
    // Keep a cold restore's semantic line while native/visual admission is pending. After its
    // single restore attempt, a pilot cut is absence and cannot relatch on a later tick or save.
    physical.playerTether = playerTetherSnapshot() || pendingPlayerTether || null;
    return physical;
  }
  function canSuspend() {
    if (pendingPlayerTether) return false;
    for (const entity of bound.values()) {
      if (kernel.attachments.listForEntity(entity.id).some(attachment =>
        attachment.ownerId === state.playerId || attachment.targetId === state.playerId
        || attachment.controllerId === state.playerId)) return false;
    }
    return true;
  }
  function suspend(record = current) {
    if (record && record === current) snapshot(record);
    sever('industrial-sector-suspend', true);
    for (const entity of bound.values()) retire(entity, 'industrial-sector-suspend');
    bound.clear(); pendingMotion.clear(); contacts.length = 0; initialIssuedTick = null; pendingPlayerTether = null;
    current = null; scenario = null;
  }
  function cleanup() {
    sever('industrial-cleanup', true);
    for (const entity of ownedRows()) retire(entity, 'industrial-cleanup');
    bound.clear(); pendingMotion.clear(); contacts.length = 0; initialIssuedTick = null; pendingPlayerTether = null;
    current = null; scenario = null;
  }
  const offImpact = bus?.on('physics:impact', (event) => {
    if (contacts.length >= MAX_CONTACTS || !event) return;
    const a = state.entities.get(event.aId), b = state.entities.get(event.bId);
    if (!owns(a) || !owns(b) || !live(a) || !live(b)) return;
    if ((event.aGeneration != null && event.aGeneration !== a.occupantGeneration)
      || (event.bGeneration != null && event.bGeneration !== b.occupantGeneration)) return;
    contacts.push({ aRole: a.data.industrialDisasterRole, bRole: b.data.industrialDisasterRole,
      speed: finite(event.preSolveClosingSpeed, Math.hypot(a.vel.x - b.vel.x, a.vel.z - b.vel.z)),
      impulse: finite(event.impulse) });
  });
  return Object.freeze({ materialize, bodies, links, start, step, snapshot, suspend, cleanup, canSuspend,
    dispose() { if (disposed) return; cleanup(); if (typeof offImpact === 'function') offImpact(); disposed = true; } });
}

function restoreSpin(entity, angularVelocity, tick) {
  const inertia = Math.max(1, finite(entity.physicsBody?.inertiaY, entity.mass * entity.radius * entity.radius * 0.5));
  queuePhysicsTorqueImpulse(entity, { y: angularVelocity * inertia }, { source: OWNER, reason: 'restore-spin', tick });
}
