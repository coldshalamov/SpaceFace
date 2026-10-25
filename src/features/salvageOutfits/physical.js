// Live adapters for competing salvage outfits. Motion, rope solving, spawn admission,
// and station stock remain with their existing owners. This module never integrates poses.
import { makeShipEntitySpec } from '../../systems/ships.js';
import { getCombatKernel } from '../../combat/kernel.js';
import { attachmentBindsOccupant } from '../../combat/attachments.js';
import { physicsBodyNativeReady } from '../../core/physicsAuthority.js';
import { resolvePropulsionProfile } from '../../core/flight/propulsionCatalog.js';
import { WRECK_COLLIDER_PROPORTIONS } from '../../data/wreckClasses.js';

const OWNER = 'salvageOutfits';
const TERMINAL = new Set(['delivered', 'extracted', 'destroyed', 'lost', 'mined', 'salvaged', 'departed', 'dead']);
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
const speed = e => Math.hypot(finite(e?.vel?.x), finite(e?.vel?.z));
const poolOf = value => Object.fromEntries(Object.entries(value || {}).filter(([id, n]) =>
  /^cmdty_[a-z0-9_]+$/.test(id) && Number.isSafeInteger(n) && n > 0));
const poolBelow = (value, ceiling) => {
  const stock = poolOf(value);
  return Object.fromEntries(Object.entries(poolOf(ceiling))
    .map(([id, qty]) => [id, Math.min(qty, stock[id] || 0)]).filter(([, qty]) => qty > 0));
};
const point = value => value && Number.isFinite(value.x) && Number.isFinite(value.z)
  ? { x: value.x, z: value.z } : null;

export function createSalvageOutfitsPhysical(ctx) {
  const { state, bus, helpers } = ctx;
  const bindings = new Map();
  const absent = new Set();
  const actorSpecs = new WeakMap();
  const cargoSpecs = new WeakMap();
  const retired = new WeakSet();
  const lastReelTick = new WeakMap();
  const tows = new Map();
  const subs = [];
  let disposed = false;
  let restoring = false;
  let indexedEntities = state.entities;
  const on = (event, fn) => {
    const off = bus?.on?.(event, fn);
    if (typeof off === 'function') subs.push(off);
    else subs.push(() => bus?.off?.(event, fn));
  };
  const owns = e => !!e && e.data?.persistenceOwner === OWNER
    && typeof e.data.worldRecordId === 'string' && e.data.identityKey === e.data.worldRecordId;
  const live = e => !!e && e.alive !== false && state.entities?.get(e.id) === e;
  const current = row => !!row && live(row.entity)
    && row.entity.occupantGeneration === row.life && owns(row.entity);

  function note(entity) {
    if (!owns(entity) || !live(entity)) return;
    const key = entity.data.worldRecordId;
    let bucket = bindings.get(key);
    if (!bucket) bindings.set(key, bucket = new Set());
    if (![...bucket].some(row => row.entity === entity && row.life === entity.occupantGeneration)) {
      bucket.add({ entity, life: entity.occupantGeneration });
    }
  }
  function rebuild() {
    bindings.clear();
    indexedEntities = state.entities;
    for (const entity of state.entityList || []) note(entity);
  }
  rebuild();
  on('entity:spawned', p => note(p?.entity));
  on('entity:destroyed', p => {
    const entity = p?.entity;
    if (!owns(entity)) return;
    const key = entity.data.worldRecordId;
    const bucket = bindings.get(key);
    const row = bucket && [...bucket].find(b => b.entity === entity && b.life === entity.occupantGeneration);
    if (!row) return; // A delayed destruction receipt must not retire a reused numeric id.
    bucket.delete(row);
    if (!retired.has(entity) && !restoring) absent.add(key);
  });
  on('save:restoring', () => { restoring = true; bindings.clear(); absent.clear(); tows.clear(); });
  on('save:loaded', () => resume({ clearBindings: true }));
  on('sector:exit', p => {
    // The feature owner captures before dematerializing. A real transition opens a new
    // materialization lifetime; a continuous handoff keeps the exact present originals.
    if (p?.continuous === true || p?.continuousHandoff === true) return;
    absent.clear();
  });

  function find(key) {
    if (!key || disposed) return null;
    if (indexedEntities !== state.entities) { absent.clear(); rebuild(); }
    const bucket = bindings.get(key);
    if (!bucket) return null;
    const candidates = [];
    for (const row of bucket) {
      if (current(row) && row.entity.data.worldRecordId === key) candidates.push(row.entity);
      else if (!restoring && !retired.has(row.entity)) absent.add(key);
    }
    // Scalar-equal copies are ambiguous. Never pick whichever duplicate happened to be first.
    return candidates.length === 1 ? candidates[0] : null;
  }
  function canSpawn(meeting, record) {
    if (disposed || restoring || !record?.key || !meeting?.id
      || TERMINAL.has(record.status) || absent.has(record.key)
      || state.world?.currentSectorId !== meeting.sectorId) return false;
    const bucket = bindings.get(record.key);
    return !bucket || ![...bucket].some(current);
  }
  function spawnPose(meeting, record, def) {
    return point(record.pos) || {
      x: finite(meeting.anchor?.x) + finite(def.offset?.x),
      z: finite(meeting.anchor?.z) + finite(def.offset?.z),
    };
  }
  function stamp(meeting, record, kind) {
    return {
      worldRecordId: record.key, identityKey: record.key, persistenceOwner: OWNER,
      sectorId: meeting.sectorId, homeSectorId: meeting.sectorId, transientSector: true,
      salvageOutfitMeetingId: meeting.id, salvageOutfitKind: kind,
      salvageOutfitRecordId: record.id, salvageOutfitKey: record.key, scannable: true, lifetimeS: Infinity,
    };
  }
  const jobs = () => helpers.npcJobs;
  const entryFor = actor => {
    const entry = live(actor) && jobs()?.byEntity?.(actor.id);
    return entry && entry.worldRecordId === actor.data.worldRecordId && entry.entityId === actor.id ? entry : null;
  };
  const idleClaim = actor => `${OWNER}:idle:${actor.data.worldRecordId}`;
  function brake(actor) {
    if (!live(actor) || !owns(actor)) return false;
    const data = actor.data;
    data.intent = { moveX: 0, moveZ: 0, boost: false, brake: true, fire: false,
      fireGroup: null, aimAngle: finite(actor.rot) };
    return true;
  }
  function assign(actor, meeting, record, def) {
    if (!live(actor) || !owns(actor) || find(record.key) !== actor || !jobs()?.assign) return null;
    actorSpecs.set(actor, { meeting, record, def });
    let entry = entryFor(actor);
    if (!entry) {
      const expectedJobId = `job:${record.key}`;
      const orphan = jobs().get?.(expectedJobId);
      if (orphan && orphan.worldRecordId === record.key && orphan.entityId == null) {
        // A continuous sector membership change virtualizes generic jobs even though this
        // exact hull and rope remain live. Retire only our orphan worker clock via its owner;
        // assigning a fresh clock below does not rematerialize or move either endpoint.
        jobs().release(expectedJobId);
      }
      const destination = point(meeting.receiver) || point(meeting.anchor) || point(actor.pos);
      const jobId = jobs().assign(actor, {
        kind: 'tender', sectorId: meeting.sectorId, speed: Math.max(4, finite(def.speed, 28)),
        workS: 30,
        route: [
          { id: `${record.key}:holding`, pos: point(actor.pos) },
          { id: `${record.key}:receiver`, pos: destination },
        ],
      });
      if (!jobId) return null;
      record.jobId = jobId;
      entry = entryFor(actor);
    } else record.jobId = entry.job.id;
    if (!entry) { brake(actor); return null; }
    // A newly restored lease is deliberately re-requested against the present originals.
    // Until then one explicit idle lease prevents the job clock from moving the crew elsewhere.
    if (!entry?.control && !entry?.towAssist) {
      const tow = tows.get(actor);
      const lease = jobs().claimControl(entry.job.id, { claimId: tow?.claimId || idleClaim(actor), holder: OWNER });
      if (!tow || !lease?.granted) brake(actor);
    }
    return entry;
  }

  function ensureActor(meeting, record, def) {
    if (!record || TERMINAL.has(record.status)) return null;
    const old = find(record?.key);
    if (old) {
      assign(old, meeting, record, def);
      // Combat may already have restored this exact native joint before the source owner
      // resumes. Reacquire the nonpersistent movement lease even though no new line is needed.
      if (!tows.has(old) && ['approach', 'tow'].includes(record.status)
        && finite(state.simTime) >= finite(record.startsAt)) {
        const body = meeting.bodies?.[record.targetId], target = body && find(body.key);
        const restored = target && line(old, target);
        if (body?.status === 'live' && restored?.ownerId === old.id && restored.controlMode === 'npc_tow') {
          requestTow(old, target, meeting.receiver, `${meeting.id}:tow:${record.id}:${body.id}`);
        }
      }
      stepTow(old);
      return old;
    }
    if (!canSpawn(meeting, record)) return null;
    const budget = helpers.spawnBudget;
    if (!budget || budget.request(1, record.key) !== 1) return null;
    const spec = makeShipEntitySpec(def.shipDefId || 'ship_hawser', {
      team: 2, factionId: def.factionId || 'faction_free', pos: spawnPose(meeting, record, def),
      rot: finite(record.rot), ai: { passive: true, holdFire: true },
    });
    const travelSpeed = Math.max(4, finite(def.speed, 28));
    spec.flightModel = { ...spec.flightModel, maxSpeed: travelSpeed,
      boostMult: 1, boostMaxSpeedMult: 1, normalMaxSpeedMult: 1 };
    spec.maxSpeed = travelSpeed;
    spec.hull = Number.isFinite(record.hull) ? Math.min(spec.hullMax, Math.max(0, record.hull)) : spec.hull;
    spec.shield = 0; spec.shieldMax = 0; spec.shieldRegenRate = 0;
    spec.vel = point(record.vel) || { x: 0, z: 0 };
    spec.angVel = finite(record.angVel);
    spec.flags = { ...spec.flags, persistent: true, missionPinned: true };
    spec.data = { ...spec.data, ...stamp(meeting, record, 'crew'),
      salvageOutfitCrewId: def.id, name: def.name, callsign: def.name.toUpperCase(),
      scanLabel: `${def.name} · salvage crew`, weapons: [], fittings: [], miningBeam: null,
      derived: { ...spec.data.derived, flightModel: { ...spec.flightModel } },
    };
    const entity = helpers.spawnEntity?.(spec);
    if (!entity) { budget.release(record.key); return null; }
    if (!budget.bindEntity(entity.id, record.key)) {
      retired.add(entity); helpers.removeEntity?.(entity.id); budget.release(record.key); return null;
    }
    note(entity);
    assign(entity, meeting, record, def);
    return entity;
  }

  function ensureCargo(meeting, record, def) {
    if (!record || TERMINAL.has(record.status)) return null;
    const old = find(record?.key);
    if (old) {
      cargoSpecs.set(old, { record, def });
      constrainPool(old, record);
      return old;
    }
    if (!canSpawn(meeting, record)) return null;
    // An empty saved pool is an empty original, never permission to refill from the catalog.
    const pool = poolBelow(record.pool != null ? record.pool : def.pool, def.pool);
    if (!Object.keys(pool).length) return null;
    const mass = Math.max(1, finite(def.mass, 120));
    const radius = Math.max(2, finite(def.radius, 8));
    const hullMax = Math.max(1, finite(def.hull, 100));
    const spec = {
      type: 'wreck', team: 2, factionId: 'faction_free', pos: spawnPose(meeting, record, def),
      vel: point(record.vel) || { x: 0, z: 0 }, rot: finite(record.rot), angVel: finite(record.angVel),
      radius, mass, hull: Math.min(hullMax, Math.max(0, finite(record.hull, hullMax))), hullMax,
      physicsBody: { schemaVersion: 1, dynamic: true, shape: 'capsule', radius, mass,
        inertiaY: mass * radius * radius * 0.5 },
      // missionPinned/lotId/reservedBy are intentionally absent: the canonical tow admission
      // rejects bodies owned by another mission. Our claims live in our own source ledger.
      flags: { persistent: true },
      data: { ...stamp(meeting, record, 'cargo'), name: def.label, scanLabel: def.label,
        salvageOutfitPieceId: def.id, parentType: def.parentType || 'ship',
        proportions: WRECK_COLLIDER_PROPORTIONS, salvagePool: pool, salvageTimeLeft: 8,
        authoredSalvagePool: { ...pool }, debrisCache: 'empty',
        ...(def.assetId ? { authoredAssetId: def.assetId } : {}),
      },
    };
    const entity = helpers.spawnEntity?.(spec);
    if (entity) { cargoSpecs.set(entity, { record, def }); note(entity); }
    return entity || null;
  }

  function constrainPool(entity, explicitRecord = null) {
    if (!owns(entity) || entity.data.salvageOutfitKind !== 'cargo') return poolOf(entity?.data?.salvagePool);
    const data = entity.data, spec = cargoSpecs.get(entity);
    const restored = state.salvageOutfits?.meetings?.[data.salvageOutfitMeetingId]
      ?.bodies?.[data.salvageOutfitRecordId];
    const record = explicitRecord || restored || spec?.record;
    if (!record || record.key !== data.worldRecordId) return {};
    const remaining = poolBelow(record.pool, spec?.def?.pool || record.pool);
    const pool = poolBelow(data.salvagePool, remaining);
    // The scalar pool is a finite source mirror. Adopted/restored annotations can only
    // remove from the saved remainder; a missing live pool means empty, never a template.
    // Preserve its object identity because the ordinary mining owner may hold it mid-drain.
    if (!data.salvagePool || typeof data.salvagePool !== 'object' || Array.isArray(data.salvagePool)) {
      data.salvagePool = {};
    }
    for (const id of Object.keys(data.salvagePool)) if (!(pool[id] > 0)) delete data.salvagePool[id];
    Object.assign(data.salvagePool, pool);
    data.authoredSalvagePool = { ...pool };
    return pool;
  }
  function capture(entity) {
    if (!entity?.pos) return null;
    return { pos: { x: finite(entity.pos.x), z: finite(entity.pos.z) },
      vel: { x: finite(entity.vel?.x), z: finite(entity.vel?.z) }, rot: finite(entity.rot),
      angVel: finite(entity.angVel), hull: Math.max(0, finite(entity.hull)),
      pool: constrainPool(entity) };
  }

  function nativeReady(entity) {
    if (!live(entity) || !physicsBodyNativeReady(entity)) return false;
    if (state.settings?.gameplay?.physicsBackend !== 'rapier-dynamic') return true;
    const physics = ctx.registry?.get?.('physics');
    if (!physics || physics._nativeRestorePending || physics._nativeRestoreDeferred) return false;
    const native = physics._sg02;
    const record = native?.records?.get(entity.id);
    return !!record && record.entity === entity && !!record.body
      && (!Number.isFinite(native._simTick) || native._simTick >= finite(state.tick) - 1);
  }
  const attachments = () => getCombatKernel(ctx).attachments;
  function line(actor, target) {
    if (!live(actor) || !live(target) || !nativeReady(actor) || !nativeReady(target)) return null;
    const result = attachments().listForEntity(target.id, true).find(candidate =>
      candidate.state === 'active' && ['attachment_massline', 'tether_standard'].includes(candidate.defId)
      && ((candidate.ownerId === actor.id && candidate.targetId === target.id)
        || (candidate.ownerId === target.id && candidate.targetId === actor.id))
      && attachmentBindsOccupant(candidate, actor.id, actor.occupantGeneration)
      && attachmentBindsOccupant(candidate, target.id, target.occupantGeneration));
    if (!result) return null;
    if (state.settings?.gameplay?.physicsBackend === 'rapier-dynamic'
      && !helpers.combatPhysics?.getAttachmentTelemetry?.({
        attachmentId: result.id, physicsHandle: result.physicsHandle,
      })) return null;
    return result;
  }
  function playerLine(target) { return line(state.entities?.get(state.playerId), target); }
  function hasActiveLines(entity) {
    if (!entity || state.entities?.get(entity.id) !== entity) return false;
    return attachments().listForEntity(entity.id, true).some(active => active.state === 'active'
      && attachmentBindsOccupant(active, entity.id, entity.occupantGeneration));
  }

  // Steer through Flight V3's existing input membrane. Throttle is a fraction of the
  // authored propulsion combatSpeed, not a velocity setter. Braking distance includes the
  // towed mass; the small cutter consequently cannot brake a heavy load like the Hawser.
  function steer(actor, targetPosition, targetVelocity, arrival, payload = null) {
    const profile = resolvePropulsionProfile(actor, state);
    const dx = targetPosition.x - actor.pos.x, dz = targetPosition.z - actor.pos.z;
    const gap = Math.hypot(dx, dz), ux = dx / Math.max(0.001, gap), uz = dz / Math.max(0.001, gap);
    const massRatio = Math.max(0.08, actor.mass / Math.max(1, actor.mass + finite(payload?.mass)));
    const decel = Math.max(1, finite(profile.reverseAccel, 20) * massRatio * 0.55);
    const cruise = Math.max(6, finite(actorSpecs.get(actor)?.def.speed, 28));
    const remaining = Math.max(0, gap - arrival);
    const closing = Math.min(cruise, Math.sqrt(2 * decel * remaining), remaining / (payload ? 8 : 2.5));
    const tvx = finite(targetVelocity?.x), tvz = finite(targetVelocity?.z);
    const desiredX = tvx + ux * closing, desiredZ = tvz + uz * closing;
    const desiredSpeed = Math.hypot(desiredX, desiredZ);
    const aim = desiredSpeed > 0.1 ? Math.atan2(desiredZ, desiredX) : finite(actor.rot);
    const relativeClosing = (finite(actor.vel?.x) - tvx) * ux + (finite(actor.vel?.z) - tvz) * uz;
    const yawError = Math.atan2(Math.sin(aim - actor.rot), Math.cos(aim - actor.rot));
    const shouldBrake = gap <= arrival || Math.abs(yawError) > 0.35 || relativeClosing > closing + 0.5
      || speed(actor) > desiredSpeed + 1 || (payload && speed(payload) > desiredSpeed + 3);
    const throttle = Math.max(0.027, Math.min(1, desiredSpeed / Math.max(1, finite(profile.combatSpeed, 195))));
    actor.data.intent = { moveX: 0, moveZ: shouldBrake ? 0 : throttle,
      boost: false, brake: shouldBrake, aimAngle: aim, fire: false, fireGroup: null };
  }
  function stepTow(actor) {
    const tow = tows.get(actor);
    if (!tow || tow.lastTick === state.tick) return;
    tow.lastTick = state.tick;
    const entry = entryFor(actor), target = tow.target;
    if (!entry || entry.control?.claimId !== tow.claimId || !live(target)
      || target.occupantGeneration !== tow.targetLife || find(target.data.worldRecordId) !== target) {
      cancelTow(actor, tow.claimId); return;
    }
    if (!nativeReady(actor) || !nativeReady(target)) { brake(actor); return; }
    let active = line(actor, target);
    if (active && (active.ownerId !== actor.id || active.controlMode !== 'npc_tow')) active = null;
    if (!active) {
      if (playerLine(target)) { brake(actor); return; }
      const dx = tow.dest.x - target.pos.x, dz = tow.dest.z - target.pos.z;
      const range = Math.max(1, Math.hypot(dx, dz)), ux = dx / range, uz = dz / range;
      const separation = finite(actor.radius) + finite(target.radius) + 26;
      const relativeX = actor.pos.x - target.pos.x, relativeZ = actor.pos.z - target.pos.z;
      const behind = relativeX * ux + relativeZ * uz < -8;
      const lateral = -relativeX * uz + relativeZ * ux;
      // Pass beside the original before turning onto the outward working face. The tow
      // does not secretly carry the tug through the thing it is trying to recover.
      const detour = behind && Math.abs(lateral) < separation + 30;
      const side = lateral < -1 ? -1 : 1;
      const aimPoint = detour
        ? { x: target.pos.x - uz * (separation + 70) * side,
          z: target.pos.z + ux * (separation + 70) * side }
        : { x: target.pos.x + ux * separation, z: target.pos.z + uz * separation };
      steer(actor, aimPoint, target.vel, 10);
      if (!detour && distance(actor.pos, target.pos) <= separation + 40
        && Math.hypot(finite(actor.vel?.x) - finite(target.vel?.x), finite(actor.vel?.z) - finite(target.vel?.z)) <= 12) {
        const made = attachments().create({ defId: 'tether_standard', ownerId: actor.id,
          targetId: target.id, controlMode: 'npc_tow',
          sourceWorld: { x: actor.pos.x, y: 0, z: actor.pos.z },
          targetWorld: { x: target.pos.x, y: 0, z: target.pos.z } });
        if (made?.ok) tow.attachmentId = made.attachment.id;
      }
      return;
    }
    tow.attachmentId = active.id;
    const minimum = Math.max(28, finite(actor.radius) + finite(target.radius) + 12);
    if (active.restLength > minimum && lastReelTick.get(actor) !== state.tick) {
      lastReelTick.set(actor, state.tick);
      attachments().reel(active.id,
        -Math.min(active.restLength - minimum, Math.max(1, finite(active.tetherPolicy?.reelRate, 30)) / 60), minimum);
    }
    steer(actor, tow.dest, null, 14, target);
  }
  function requestTow(actor, target, destination, claimId) {
    const dest = point(destination);
    if (!live(actor) || !owns(actor) || !live(target) || !owns(target) || !dest
      || !claimId || find(actor.data.worldRecordId) !== actor || find(target.data.worldRecordId) !== target
      || !nativeReady(actor) || !nativeReady(target)) {
      return { granted: false, reason: 'original_native_bodies_required' };
    }
    let entry = entryFor(actor);
    if (!entry) {
      const saved = actorSpecs.get(actor);
      if (saved) entry = assign(actor, saved.meeting, saved.record, saved.def);
    }
    if (!entry) return { granted: false, reason: 'no_job' };
    const prior = tows.get(actor);
    if (prior) {
      return prior.claimId === claimId && prior.target === target && prior.targetLife === target.occupantGeneration
        && distance(prior.dest, dest) < 0.001
        ? { granted: true, duplicate: true, jobId: entry.job.id, claimId, targetId: target.id }
        : { granted: false, reason: 'crew_already_committed' };
    }
    if ([...tows].some(([other, tow]) => other !== actor && live(other)
      && tow.target === target && tow.targetLife === target.occupantGeneration)) {
      return { granted: false, reason: 'target_already_hired' };
    }
    if (playerLine(target)) return { granted: false, reason: 'player_has_custody' };
    if (entry.control?.claimId === idleClaim(actor)) jobs().releaseControl(entry.job.id, idleClaim(actor));
    const lease = jobs().claimControl(entry.job.id, { claimId, holder: OWNER });
    if (!lease?.granted) return lease || { granted: false, reason: 'control_refused' };
    // Adopt only a present exact own NPC joint after Continue. The original bodies, native
    // constraint and rest length survive; no duplicate line or artificial reload impulse.
    const restored = line(actor, target);
    tows.set(actor, { target, targetLife: target.occupantGeneration, claimId, dest,
      attachmentId: restored?.ownerId === actor.id && restored.controlMode === 'npc_tow' ? restored.id : null,
      lastTick: null });
    actor.data.salvageOutfitTowTargetKey = target.data.worldRecordId;
    stepTow(actor);
    return { granted: true, jobId: entry.job.id, claimId, targetId: target.id, feeCr: 0 };
  }
  function cancelTow(actor, claimId = null) {
    const tow = tows.get(actor), entry = entryFor(actor);
    if (claimId && tow?.claimId !== claimId && entry?.control?.claimId !== claimId) return false;
    if (tow) {
      // Cleanup must also work after native admission is withdrawn or an endpoint dies.
      // Generation-bound canonical records remain authoritative for releasing the old joint.
      for (const active of attachments().listForEntity(actor.id, true)) {
        if (active.state === 'active' && active.ownerId === actor.id && active.controlMode === 'npc_tow'
          && attachmentBindsOccupant(active, actor.id, actor.occupantGeneration)
          && attachmentBindsOccupant(active, tow.target.id, tow.targetLife)) {
          attachments().cut(active.id, actor.id, 'salvage_outfit_release');
        }
      }
      tows.delete(actor);
      if (actor?.data?.salvageOutfitTowTargetKey === tow.target.data?.worldRecordId) delete actor.data.salvageOutfitTowTargetKey;
    }
    if (entry && (!claimId || entry.control?.claimId === claimId)
      && entry.control?.claimId !== idleClaim(actor)) {
      if (entry.control?.holder === OWNER) jobs().releaseControl(entry.job.id, entry.control.claimId);
      const saved = actorSpecs.get(actor);
      if (saved) assign(actor, saved.meeting, saved.record, saved.def);
    }
    brake(actor);
    return !!tow;
  }
  function stop(actor) { cancelTow(actor); return brake(actor); }
  function navigate(actor, destination) {
    const dest = point(destination);
    if (!dest || !live(actor) || !owns(actor) || find(actor.data.worldRecordId) !== actor
      || !nativeReady(actor)) {
      brake(actor);
      return { arrived: false, reason: 'original_native_body_required' };
    }
    if (tows.has(actor)) cancelTow(actor);
    const saved = actorSpecs.get(actor);
    const entry = saved ? assign(actor, saved.meeting, saved.record, saved.def) : entryFor(actor);
    if (!entry) return { arrived: false, reason: 'no_job' };
    const lease = jobs().claimControl(entry.job.id, { claimId: idleClaim(actor), holder: OWNER });
    if (!lease?.granted) return { arrived: false, reason: 'control_refused' };
    // The empty workboat takes the same thrust/brake path as its approach. Departure is
    // witnessed at the actual destination; distance or elapsed time never moves a body.
    steer(actor, dest, null, 24);
    return { arrived: distance(actor.pos, dest) <= 42 && speed(actor) <= 8 };
  }
  function withinDelivery(actor, target, dest, radius = 65) {
    const reach = Math.max(1, finite(radius, 65));
    return !!line(actor, target) && distance(actor.pos, dest) <= reach
      && distance(target.pos, dest) <= reach && speed(actor) <= 12 && speed(target) <= 12;
  }
  function intake(meeting, record, entity) {
    if (!live(entity) || !owns(entity) || entity.data.worldRecordId !== record?.key
      || find(record.key) !== entity || entity.data.salvageOutfitMeetingId !== meeting?.id || !nativeReady(entity)
      || distance(entity.pos, meeting.receiver) > 65 || speed(entity) > 12) {
      return { ok: false, reason: 'original_not_at_receiver' };
    }
    const pool = constrainPool(entity, record);
    if (!(pool.cmdty_scrap_metal > 0)) return { ok: false, reason: 'receiver_requires_scrap' };
    const payload = {
      intakeId: `${record.key}:intake`, manifestId: `${record.key}:manifest`, lotId: record.key,
      yardId: meeting.stationId || meeting.receiver?.stationId || null,
      lines: Object.entries(pool).sort(([a], [b]) => a.localeCompare(b))
        .map(([commodityId, qty]) => ({ commodityId, qty })),
    };
    bus.emit('salvage:npcUnload', payload);
    return payload.intakeResult || { ok: false, reason: 'economy_owner_unavailable' };
  }
  function cutLines(entity, reason = 'salvage_outfit_handover') {
    if (!entity || state.entities?.get(entity.id) !== entity) return { ok: false, count: 0 };
    let count = 0;
    for (const active of attachments().listForEntity(entity.id, true)) {
      if (active.state !== 'active'
        || !attachmentBindsOccupant(active, entity.id, entity.occupantGeneration)) continue;
      const result = attachments().cut(active.id, active.ownerId, reason);
      if (!result?.ok) return { ok: false, count };
      count++;
    }
    return { ok: true, count };
  }
  function cutPlayerLine(target) {
    const active = playerLine(target);
    return active ? attachments().cut(active.id, active.ownerId, 'salvage_outfit_handover') : { ok: false };
  }
  function remove(entity) {
    if (!entity || !owns(entity) || state.entities?.get(entity.id) !== entity) return false;
    retired.add(entity);
    if (tows.has(entity)) cancelTow(entity);
    for (const [actor, tow] of tows) if (tow.target === entity) cancelTow(actor);
    const entry = entryFor(entity);
    if (entry) jobs().release(entry.job.id);
    helpers.spawnBudget?.releaseEntity?.(entity.id, entity);
    helpers.removeEntity?.(entity.id);
    const bucket = bindings.get(entity.data.worldRecordId);
    if (bucket) for (const row of bucket) if (row.entity === entity) bucket.delete(row);
    return true;
  }
  function resume({ clearBindings = false } = {}) {
    if (disposed) return false;
    restoring = false;
    if (clearBindings) {
      // Continue replaces serialized records and all transient leases. Keep actual bodies
      // and joints; ensureActor adopts them against the newly restored record on its next call.
      tows.clear(); absent.clear();
      for (const entity of state.entityList || []) {
        if (!owns(entity) || !live(entity) || entity.data.salvageOutfitKind !== 'crew') continue;
        const entry = entryFor(entity);
        if (entry?.control?.holder === OWNER && entry.control.claimId !== idleClaim(entity)) {
          jobs().releaseControl(entry.job.id, entry.control.claimId);
        }
        brake(entity);
      }
    }
    rebuild();
    return true;
  }
  function dispose() {
    if (disposed) return;
    for (const bucket of bindings.values()) for (const row of [...bucket]) if (current(row)) remove(row.entity);
    for (const off of subs) off();
    bindings.clear(); absent.clear(); tows.clear(); disposed = true;
  }
  return { ensureActor, ensureCargo, find, capture, requestTow, cancelTow, line, playerLine, hasActiveLines,
    nativeReady, withinDelivery, intake, cutLines, cutPlayerLine, remove, stop, navigate, resume, dispose };
}
