import { getCombatKernel } from '../../combat/kernel.js';
import { physicsBodyNativeReady, prepareExternalPhysicsImpulse, queuePhysicsImpulse } from '../../core/physicsAuthority.js';
import { hullEnvelopeWu, proxyOuterRadiusWu } from '../../data/collisionProxyManifests.js';
import { modelTruthProxyManifest, modelTruthRow, modelTruthSkinHull } from '../../data/modelTruth.js';
import { createYardLayout, SHIPBREAKING_YARD_SITE } from './layouts.js';
import { DEFAULT_MASK, Masks } from '../../core/entity.js';

const OWNER = 'shipbreakingYard';
const CLAMP = 'attachment_salvage_clamp';
const TERMINAL = new Set(['delivered', 'lost']);
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const distance = (a, b) => a && b ? Math.hypot(a.x - b.x, a.z - b.z) : Infinity;
const clone = value => value == null ? value : structuredClone(value);
const bindingKey = (jobId, moduleId) => `${jobId}/${moduleId}`;
export const yardBodyIdentity = (jobId, moduleId) => `shipbreaking:${jobId}:${moduleId}`;

function capturePose(entity) {
  return { x: entity.pos.x, z: entity.pos.z, vx: entity.vel.x, vz: entity.vel.z,
    rot: finite(entity.rot), spin: finite(entity.angVel) };
}

/** Physics membrane for the yard. The job owner owns decisions and terminal statuses. This
 * adapter owns only bindings to the ORIGINAL entities; core owns their membership, combat
 * owns damage/constraints and SG-02 alone writes motion. No render objects enter job saves. */
export function createYardPhysics(ctx) {
  const state = ctx.state;
  const bindings = new Map();
  const lines = new Map();
  const jobs = new Map();
  const suspended = new Set();
  const lossNotified = new Set();
  const cutNotified = new Set();
  const strainNotified = new Map();
  const contactTicks = new Map();
  const layouts = new Map();
  const fittedSkins = new Map();
  let disposed = false;
  const attachments = () => getCombatKernel(ctx).attachments;
  const layoutFor = job => {
    const key = `${job.layoutId}:${job.variant}`;
    if (!layouts.has(key)) layouts.set(key, createYardLayout(job.layoutId, job.variant));
    return layouts.get(key);
  };
  const live = entity => !!entity && entity.alive !== false
    && state.entities?.get(entity.id) === entity;

  function matches(entity, job, moduleId) {
    const identity = yardBodyIdentity(job.id, moduleId);
    return live(entity) && entity.data?.persistenceOwner === OWNER
      && entity.data.worldRecordId === identity && entity.data.identityKey === identity
      && entity.data.shipbreakingJobId === job.id && entity.data.shipbreakingModuleId === moduleId;
  }

  function binding(job, moduleId) {
    const old = bindings.get(bindingKey(job.id, moduleId));
    if (!old || !matches(old.entity, job, moduleId)
      || old.entity.occupantGeneration !== old.generation) return null;
    return old;
  }

  function body(job, moduleId) {
    if (!job || TERMINAL.has(job.modules?.[moduleId]?.status)) return null;
    return binding(job, moduleId)?.entity || null;
  }

  function nativeReady(entity) {
    if (!live(entity) || !physicsBodyNativeReady(entity)) return false;
    const host = ctx.registry?.get?.('physics');
    if (state.settings?.gameplay?.physicsBackend !== 'rapier-dynamic') {
      return !!ctx.helpers?.combatPhysics;
    }
    const record = host?._sg02?.records?.get(entity.id);
    return !!record && record.entity === entity && !!record.body
      && !host._nativeRestorePending && !host._nativeRestoreDeferred;
  }

  function lineIsOriginal(line, a, b) {
    if (!line || line.state !== 'active' || !a || !b
      || a.occupantGeneration == null || b.occupantGeneration == null) return false;
    // Pin endpoint roles themselves. A controller proof cannot stand in for a stale
    // owner/target generation when a pooled ID has been reused in another role.
    return line.ownerId === a.id && line.targetId === b.id
      ? line.ownerGeneration === a.occupantGeneration && line.targetGeneration === b.occupantGeneration
      : line.ownerId === b.id && line.targetId === a.id
        && line.ownerGeneration === b.occupantGeneration && line.targetGeneration === a.occupantGeneration;
  }

  function lineNative(line) {
    if (!line || line.state !== 'active') return false;
    if (state.settings?.gameplay?.physicsBackend !== 'rapier-dynamic') return true;
    return !!ctx.helpers?.combatPhysics?.getAttachmentTelemetry?.({
      attachmentId: line.id, physicsHandle: line.physicsHandle,
    });
  }

  function towLine(entity, actorId = state.playerId) {
    const actor = state.entities?.get(actorId);
    if (!nativeReady(actor) || !nativeReady(entity)) return null;
    return attachments().listForEntity(entity.id).find(line =>
      ['tether_standard', 'attachment_massline'].includes(line.defId)
      && (line.ownerId === actorId || line.controllerId === actorId
        && line.controllerGeneration === actor.occupantGeneration)
      && lineIsOriginal(line, actor, entity) && lineNative(line)) || null;
  }

  function lineStatus(job, couplingId) {
    const layout = layoutFor(job), spec = layout?.couplings.find(row => row.id === couplingId);
    if (!spec) return { ok: false, reason: 'unknown_coupling', connected: false };
    const a = body(job, spec.a), b = body(job, spec.b);
    const key = bindingKey(job.id, couplingId), knownId = lines.get(key)
      ?? job.couplings?.[couplingId]?.attachmentId;
    const line = knownId ? attachments().get(knownId) : null;
    return { ok: true, connected: lineIsOriginal(line, a, b), admitted: !!line && lineNative(line),
      line, a, b, spec, reason: line?.breakReason || null,
      tension: Math.max(0, finite(line?.lastTension)), restLength: finite(line?.restLength) };
  }

  function fittedSkin(module) {
    if (fittedSkins.has(module.assetId)) return fittedSkins.get(module.assetId);
    const row = modelTruthRow(module.assetId);
    const measured = modelTruthProxyManifest({ type: 'payload', radius: module.radius,
      data: { placeId: module.assetId } });
    if (!row || !measured) return null;
    const reference = row.gameplay?.entityRadius || row.shell?.silhouetteRadius || 1;
    const dimensions = row.worldSize || row.bounds?.size;
    const envelope = Math.max(...(dimensions || [reference * 2]));
    // Packaged props recenter their authored box and fit the longest axis to 2R.
    // Census skins are normalized to their original gameplay radius. Fit that measured
    // collision footprint by the same ratio, instead of substituting a narrow capsule.
    const scale = reference * 2 / Math.max(envelope, .001);
    const center = row.bounds?.center || [0, 0, 0], drawScale = finite(row.drawScale, 1);
    const offsetX = center[0] * drawScale / reference, offsetZ = center[2] * drawScale / reference;
    const point = p => ({ x: (p.x - offsetX) * scale, z: (p.z - offsetZ) * scale });
    const primitives = measured.primitives.map(p => {
      if (p.kind === 'capsule') return { ...p, ax: (p.ax - offsetX) * scale,
        az: (p.az - offsetZ) * scale, bx: (p.bx - offsetX) * scale,
        bz: (p.bz - offsetZ) * scale, r: p.r * scale };
      return { ...p, ...point(p), ...(p.kind === 'circle' ? { r: p.r * scale }
        : { hx: p.hx * scale, hz: p.hz * scale }) };
    });
    // The census approves a single hull only when it retains the measured silhouette.
    // Other modules keep their bounded primitive compound, including its real gaps.
    const hull = modelTruthSkinHull(row);
    const manifest = { ...measured, id: `shipbreaking:${module.assetId}:packaged-fit-v1`,
      referenceRadius: 'radius', primitives, ...(hull ? { compactHull: hull.map(point) } : {}) };
    fittedSkins.set(module.assetId, manifest);
    return manifest;
  }

  function makeSpec(job, module, row) {
    const pose = row.pose;
    const radius = module.radius, mass = module.mass;
    const hullMax = module.maxHull;
    const condition = Math.max(0, Math.min(1, finite(row.condition, module.condition)));
    const hull = Math.max(0, Math.min(hullMax, finite(row.hull, hullMax * condition)));
    const identity = yardBodyIdentity(job.id, module.id);
    const collisionProxyManifest = fittedSkin(module);
    return {
      type: 'payload', team: 0, factionId: null, homeSectorId: job.sectorId,
      pos: pose ? { x: pose.x, z: pose.z }
        : { x: job.anchor.x + module.x, z: job.anchor.z + module.z },
      vel: pose ? { x: pose.vx, z: pose.vz } : { x: 0, z: 0 },
      rot: pose ? finite(pose.rot) : module.rot, angVel: pose ? finite(pose.spin) : 0,
      radius, mass, hull, hullMax, shield: 0, shieldMax: 0, collides: true,
      // Payloads otherwise admit only physical ship/rock/station contacts. Ordinary
      // weapon sweeps must strike this machinery as well as direct damage intents.
      collisionMask: DEFAULT_MASK.payload | Masks.PROJECTILE,
      physicsBody: { schemaVersion: 1, dynamic: true, radius, mass,
        inertiaY: .5 * mass * radius * radius, shape: collisionProxyManifest ? 'compound' : 'capsule',
        ...(collisionProxyManifest ? { collisionProxyManifest: clone(collisionProxyManifest) } : {}), ccd: true,
        material: 'payload', revision: 0, ...clone(module.physicsBody) },
      flags: { persistent: true, missionPinned: true },
      data: {
        persistenceOwner: OWNER, worldRecordId: identity, identityKey: identity,
        salvageSourceKey: identity, shipbreakingJobId: job.id, shipbreakingModuleId: module.id,
        homeSectorId: job.sectorId, sectorId: job.sectorId, transientSector: true,
        combatProfileId: 'combat_profile_tether_anchor',
        packagedPropFile: module.file, packagedPropSlot: module.slot,
        packagedPropRadius: radius, visualRadius: radius,
        name: module.label, scanLabel: module.label, authoredScanLabel: module.label,
        role: 'shipbreaking_module', masslineTetherable: true, physicalCustodyOnly: true,
        // No generic mining, scoop or secondary loot owner can monetize this same original.
        loot: [], salvagePool: {}, authoredSalvagePool: {}, lifetimeS: Infinity,
      },
    };
  }

  function spawnJob(job) {
    if (disposed || !job?.id || !job.anchor || !ctx.helpers?.spawnEntity) {
      return { ok: false, reason: 'spawn_owner_unavailable' };
    }
    const layout = layoutFor(job);
    if (!layout) return { ok: false, reason: 'unknown_layout' };
    jobs.set(job.id, job); suspended.delete(job.id);
    let pending = 0;
    for (const module of layout.modules) {
      const row = job.modules?.[module.id];
      if (!row) continue;
      const key = bindingKey(job.id, module.id);
      if (TERMINAL.has(row.status)) {
        // A save can be taken by a credit/removal callback after the terminal receipt is
        // reserved but before the original disappears. Generic persistence may restore
        // that body. Retire only the exact durable provenance; never reopen its receipt.
        const remnants = (state.entityList || [...state.entities.values()])
          .filter(entity => matches(entity, job, module.id));
        for (const entity of remnants) {
          bindings.set(key, { entity, generation: entity.occupantGeneration, hull: entity.hull });
          if (!retire(job, module.id, 'shipbreaking_terminal_restore').ok) pending++;
        }
        continue;
      }
      if (binding(job, module.id)) continue;
      // A previously admitted original disappearing is loss, never a fresh spawn request.
      if (bindings.has(key)) return { ok: false, reason: 'original_missing', moduleId: module.id };
      const matchesList = (state.entityList || [...state.entities.values()])
        .filter(entity => matches(entity, job, module.id));
      if (matchesList.length > 1) return { ok: false, reason: 'duplicate_original', moduleId: module.id };
      const entity = matchesList[0] || ctx.helpers.spawnEntity(makeSpec(job, module, row));
      if (!entity) { pending += 1; continue; }
      // Spawn observers are synchronous: an admitted original can be destroyed before
      // spawnEntity returns. Retain even that failed life so sync reports loss; retrying
      // it as an unmaterialized row would mint a replacement after a real destruction.
      bindings.set(key, { entity, generation: entity.occupantGeneration, hull: entity.hull });
      lossNotified.delete(key);
    }
    const constraintResult = admitCouplings(job, layout);
    return { ok: pending === 0, admitted: pending === 0 && constraintResult.pending === 0,
      pending: pending + constraintResult.pending };
  }

  function admitCouplings(job, layout) {
    let pending = 0;
    for (const spec of layout.couplings) {
      const row = job.couplings?.[spec.id];
      if (!row || row.status !== 'connected') continue;
      if (TERMINAL.has(job.modules?.[spec.a]?.status) || TERMINAL.has(job.modules?.[spec.b]?.status)) continue;
      const key = bindingKey(job.id, spec.id);
      const a = body(job, spec.a), b = body(job, spec.b);
      if (!a || !b) { pending++; continue; }
      const known = lineStatus(job, spec.id);
      if (known.connected) { lines.set(key, known.line.id); continue; }
      // A known physical break is reported by syncJob, not silently welded back together.
      if (lines.has(key)) continue;
      if (!nativeReady(a) || !nativeReady(b)) { pending++; continue; }
      const token = `shipbreaking:${job.id}:${spec.id}`;
      const existing = attachments().listForEntity(a.id).filter(line =>
        line.actionInstanceId === token && lineIsOriginal(line, a, b));
      if (existing.length > 1) { pending++; continue; }
      if (existing.length === 1) { lines.set(key, existing[0].id); continue; }
      const created = attachments().create({ defId: CLAMP, ownerId: a.id, targetId: b.id,
        sourceWorld: { x: a.pos.x, z: a.pos.z }, targetWorld: { x: b.pos.x, z: b.pos.z },
        actionInstanceId: token, controlMode: OWNER });
      if (!created?.ok) { pending++; continue; }
      lines.set(key, created.attachment.id);
      // Preserve authored/saved span during a cold re-admission. Reeling uses the real
      // constraint owner and cannot teleport either body or silently rewrite native pose.
      if (Number.isFinite(row.restLength) && row.restLength >= 0) {
        attachments().reel(created.attachment.id, row.restLength - created.attachment.restLength, 0);
      }
    }
    return { pending };
  }

  function syncJob(job) {
    if (disposed || suspended.has(job.id)) return [];
    const layout = layoutFor(job); if (!layout) return [];
    jobs.set(job.id, job);
    const events = [];
    admitCouplings(job, layout);
    for (const module of layout.modules) {
      const row = job.modules?.[module.id], key = bindingKey(job.id, module.id);
      if (!row || TERMINAL.has(row.status)) continue;
      const old = bindings.get(key), current = binding(job, module.id);
      if (old && !current && !lossNotified.has(key)) {
        lossNotified.add(key); events.push({ type: 'lost', moduleId: module.id, reason: 'original_lost' });
      } else if (current && current.entity.hull !== current.hull) {
        const before = current.hull; current.hull = current.entity.hull;
        events.push({ type: 'damaged', moduleId: module.id, hull: current.hull,
          condition: Math.max(0, Math.min(1, current.hull / module.maxHull)), damage: Math.max(0, before - current.hull) });
      }
    }
    for (const spec of layout.couplings) {
      const row = job.couplings?.[spec.id], key = bindingKey(job.id, spec.id);
      if (!row || row.status !== 'connected') continue;
      const status = lineStatus(job, spec.id);
      const endpointLost = TERMINAL.has(job.modules?.[spec.a]?.status) || TERMINAL.has(job.modules?.[spec.b]?.status);
      if ((lines.has(key) && !status.connected || endpointLost) && !cutNotified.has(key)) {
        cutNotified.add(key); events.push({ type: 'released', couplingId: spec.id,
          reason: status.reason || 'endpoint_lost', broken: true });
      }
      const tense = status.connected && status.tension >= 1800;
      if (tense && !strainNotified.get(key)) events.push({ type: 'strain', couplingId: spec.id, tension: status.tension });
      strainNotified.set(key, tense);
    }
    return events;
  }

  function disconnect(job, couplingId, actorId = state.playerId) {
    const actor = state.entities?.get(actorId), row = job.couplings?.[couplingId];
    if (!live(actor) || actorId !== state.playerId || row?.status !== 'connected') {
      return { ok: false, reason: 'coupling_changed' };
    }
    const status = lineStatus(job, couplingId), { a, b, line, spec } = status;
    if (!status.connected || !nativeReady(a) || !nativeReady(b) || !lineNative(line)) {
      return { ok: false, reason: 'native_coupling_not_ready' };
    }
    const midpoint = { x: (a.pos.x + b.pos.x) / 2, z: (a.pos.z + b.pos.z) / 2 };
    if (distance(actor.pos, midpoint) > SHIPBREAKING_YARD_SITE.workRange) {
      return { ok: false, reason: 'move_closer_to_coupling' };
    }
    const relativeSpeed = Math.max(Math.hypot(actor.vel.x - a.vel.x, actor.vel.z - a.vel.z),
      Math.hypot(actor.vel.x - b.vel.x, actor.vel.z - b.vel.z));
    if (relativeSpeed > 18) return { ok: false, reason: 'match_wreck_velocity' };
    if (spec.requiresTow && !towLine(a, actorId) && !towLine(b, actorId)) {
      return { ok: false, reason: 'support_component_with_massline' };
    }
    // The yard owns the structural clamp; the player owns the decision. null performs
    // service-owned severing through combat, just as an authored subsystem transition does.
    const result = attachments().cut(line.id, null, 'shipbreaking_disconnect');
    if (!result?.ok) return { ok: false, reason: result?.reason || 'coupling_cut_refused' };
    cutNotified.add(bindingKey(job.id, couplingId));
    return { ok: true, couplingId, attachmentId: line.id, aId: a.id, bId: b.id,
      // Cutting retains existing velocities. Any authored stored-energy release is an
      // explicit, separate impulse transaction below, never a hidden position/velocity write.
      event: { type: 'released', couplingId, reason: 'deliberate', broken: false } };
  }

  function releaseImpulse(job, couplingId, impulse) {
    const status = lineStatus(job, couplingId), { a, b } = status;
    if (!nativeReady(a) || !nativeReady(b) || status.connected || !(impulse > 0)) return false;
    const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, length = Math.hypot(dx, dz) || 1;
    const magnitude = Math.min(20_000, impulse);
    const jx = dx / length * magnitude, jz = dz / length * magnitude;
    const evidence = { tag: 'shipbreaking_stored_pressure', tick: state.tick };
    queuePhysicsImpulse(a, { x: -jx, z: -jz }, evidence);
    queuePhysicsImpulse(b, { x: jx, z: jz }, evidence);
    return true;
  }

  function vent(job, moduleId, actorId = state.playerId) {
    const entity = body(job, moduleId), actor = state.entities?.get(actorId);
    const layout = layoutFor(job), spec = layout?.modules.find(module => module.id === moduleId);
    if (!spec?.hazardous || job.hazard?.vented || job.hazard?.burst) {
      return { ok: false, reason: 'converter_already_safe_or_lost' };
    }
    if (!nativeReady(entity) || !nativeReady(actor) || actorId !== state.playerId) {
      return { ok: false, reason: 'original_body_not_ready' };
    }
    if (distance(actor.pos, entity.pos) > SHIPBREAKING_YARD_SITE.workRange) {
      return { ok: false, reason: 'move_closer_to_service_port' };
    }
    if (Math.hypot(actor.vel.x - entity.vel.x, actor.vel.z - entity.vel.z) > 18) {
      return { ok: false, reason: 'match_wreck_velocity' };
    }
    const frame = body(job, 'frame');
    if (!nativeReady(frame)) return { ok: false, reason: 'reaction_frame_lost' };
    // The service jack unloads the charged assembly against its existing reaction frame.
    // Equal/opposite impulses are admitted by SG-02; the valve never mints a core pickup.
    const dx = entity.pos.x - frame.pos.x, dz = entity.pos.z - frame.pos.z;
    const length = Math.hypot(dx, dz) || 1;
    const impulse = Math.min(entity.mass, frame.mass) * .4;
    queuePhysicsImpulse(entity, { x: dx / length * impulse, z: dz / length * impulse },
      { tag: 'shipbreaking_pressure_vent', tick: state.tick });
    queuePhysicsImpulse(frame, { x: -dx / length * impulse, z: -dz / length * impulse },
      { tag: 'shipbreaking_pressure_vent', tick: state.tick });
    return { ok: true, moduleId, identityKey: entity.data.identityKey,
      position: { x: entity.pos.x, z: entity.pos.z } };
  }

  function burst(job, options = {}) {
    const layout = layoutFor(job), moduleId = options.moduleId || layout?.hazard?.moduleId;
    const source = bindings.get(bindingKey(job.id, moduleId))?.entity;
    if (!source?.pos) return { ok: false, reason: 'hazard_original_missing' };
    const radius = Math.max(1, finite(options.radius, layout.hazard?.radius || 54));
    const amount = Math.max(0, finite(options.damage, layout.hazard?.damage || 22));
    const speed = Math.max(0, Math.min(25, finite(options.impulse, layout.hazard?.impulse || 20)));
    const reaction = nativeReady(source) ? source : body(job, 'frame');
    const targets = (state.entityList || [...state.entities.values()]).filter(entity =>
      entity !== source && nativeReady(entity) && entity.physicsBody?.dynamic !== false
      && distance(entity.pos, source.pos) <= radius);
    let recoilX = 0, recoilZ = 0;
    for (const target of targets) {
      const dx = target.pos.x - source.pos.x, dz = target.pos.z - source.pos.z;
      const length = Math.hypot(dx, dz), falloff = Math.max(0, 1 - length / radius);
      const axisX = length > .001 ? dx / length : 1, axisZ = length > .001 ? dz / length : 0;
      const impulse = Math.min(20_000, target.mass * speed * falloff);
      const requested = { x: axisX * impulse, z: axisZ * impulse };
      const evidence = { tag: 'shipbreaking_pressure_burst', tick: state.tick,
        externalEffect: target.id === state.playerId };
      const accepted = target.id === state.playerId
        ? prepareExternalPhysicsImpulse(target, requested, evidence) : requested;
      const jx = finite(accepted?.x), jz = finite(accepted?.z);
      if (target !== reaction) {
        queuePhysicsImpulse(target, { x: jx, z: jz }, { ...evidence, externalProtected: true });
        // Recoil balances the actually admitted impulse, including the player's existing
        // protection budget. No hidden velocity writer or unbalanced synthetic kick.
        recoilX -= jx; recoilZ -= jz;
      }
      getCombatKernel(ctx).routeDamage({ attackerId: state.playerId, targetId: target.id,
        packet: { channels: { thermal: amount * falloff }, flags: { ignoreFriendlyFire: true }, penetration: .5 },
        origin: { kind: 'environment', id: 'shipbreaking_pressure_burst' } });
    }
    if (nativeReady(reaction)) queuePhysicsImpulse(reaction, { x: recoilX, z: recoilZ },
      { tag: 'shipbreaking_pressure_burst_reaction', tick: state.tick });
    if (live(source)) damage(job, moduleId, amount, 'shipbreaking_converter_burst');
    return { ok: true, moduleId, affected: targets.map(target => target.id),
      position: { x: source.pos.x, z: source.pos.z } };
  }

  function deliveryGate(job, moduleId, receiver) {
    const row = job.modules?.[moduleId], entity = body(job, moduleId);
    if (!row || TERMINAL.has(row.status)) return { ok: false, reason: 'already_settled_or_lost' };
    if (!entity || !nativeReady(entity)) return { ok: false, reason: 'original_body_not_ready' };
    const layout = layoutFor(job);
    const attached = layout.couplings.some(spec => (spec.a === moduleId || spec.b === moduleId)
      && (job.couplings[spec.id]?.status === 'connected' || lineStatus(job, spec.id).connected));
    if (attached) return { ok: false, reason: 'component_still_attached' };
    const position = receiver?.pos || receiver;
    const radius = finite(receiver?.radius, SHIPBREAKING_YARD_SITE.receiverRadius);
    const manifest = entity.physicsBody?.collisionProxyManifest;
    const envelope = Math.max(hullEnvelopeWu(entity), manifest ? proxyOuterRadiusWu(manifest, entity) : 0);
    if (distance(entity.pos, position) + envelope > radius) return { ok: false, reason: 'bring_original_inside_receiver' };
    const maxSpeed = finite(receiver?.maxSpeed, SHIPBREAKING_YARD_SITE.receiverSpeed);
    if (Math.hypot(entity.vel.x, entity.vel.z) > maxSpeed || Math.abs(entity.angVel) > .8) {
      return { ok: false, reason: 'slow_and_steady_for_weighing' };
    }
    const actor = state.entities?.get(state.playerId);
    if (!live(actor) || distance(actor.pos, position) > 150) return { ok: false, reason: 'pilot_outside_receiver' };
    const tow = towLine(entity);
    if (!tow) return { ok: false, reason: 'original_requires_your_massline' };
    const foreign = attachments().listForEntity(entity.id).some(line => line.state === 'active' && line.id !== tow.id);
    if (foreign) return { ok: false, reason: 'another_line_has_custody' };
    return { ok: true, entity, line: tow, identityKey: entity.data.identityKey,
      condition: Math.max(0, Math.min(1, entity.hull / entity.hullMax)) };
  }

  function snapshotJob(job) {
    const layout = layoutFor(job), result = { modules: {}, couplings: {} };
    for (const module of layout?.modules || []) {
      const entity = body(job, module.id);
      if (entity) result.modules[module.id] = { pose: capturePose(entity), hull: entity.hull,
        condition: Math.max(0, Math.min(1, entity.hull / entity.hullMax)), entityId: entity.id };
    }
    for (const spec of layout?.couplings || []) {
      const status = lineStatus(job, spec.id);
      if (status.line) result.couplings[spec.id] = { attachmentId: status.line.id,
        restLength: status.line.restLength, connected: status.connected,
        // Shelving dismantles native joints after the runtime captures the intact graph.
        // A save inside those cut callbacks must preserve that graph for re-admission;
        // only a live-world cut or break changes the player's separation decisions.
        terminal: !suspended.has(job.id) && status.line.state !== 'active', reason: status.reason };
    }
    return result;
  }

  function retire(job, moduleId, reason = 'shipbreaking_delivery') {
    // Runtime reserves the terminal row before reentrant cut/removal events, so resolve
    // the physical binding without consulting that row's terminal bit here.
    const current = binding(job, moduleId); if (!current) return { ok: false, reason: 'original_missing' };
    for (const line of attachments().listForEntity(current.entity.id)) {
      if (line.state !== 'active') continue;
      const cut = attachments().cut(line.id, null, reason);
      if (!cut?.ok) return { ok: false, reason: cut?.reason || 'line_cut_refused' };
    }
    const key = bindingKey(job.id, moduleId);
    lossNotified.add(key);
    ctx.helpers.removeEntity(current.entity.id);
    bindings.delete(key);
    return { ok: true, entityId: current.entity.id, identityKey: current.entity.data.identityKey };
  }

  function shelve(job) {
    const snapshot = snapshotJob(job);
    suspended.add(job.id);
    for (const module of layoutFor(job)?.modules || []) {
      if (binding(job, module.id)) retire(job, module.id, 'shipbreaking_sector_shelve');
      bindings.delete(bindingKey(job.id, module.id));
    }
    for (const spec of layoutFor(job)?.couplings || []) {
      lines.delete(bindingKey(job.id, spec.id)); cutNotified.delete(bindingKey(job.id, spec.id));
      strainNotified.delete(bindingKey(job.id, spec.id));
    }
    for (const module of layoutFor(job)?.modules || []) {
      lossNotified.delete(bindingKey(job.id, module.id)); contactTicks.delete(bindingKey(job.id, module.id));
    }
    jobs.delete(job.id);
    if (['complete', 'abandoned'].includes(job.status)) suspended.delete(job.id);
    return snapshot;
  }

  function damage(job, moduleId, amount, reason = 'shipbreaking_hazard', attackerId = state.playerId) {
    const entity = body(job, moduleId);
    if (!entity || !(amount > 0)) return { ok: false, reason: 'original_missing' };
    return getCombatKernel(ctx).routeDamage({ attackerId, targetId: entity.id,
      packet: { channels: { kinetic: Math.min(amount, entity.hullMax * 2) },
        flags: { ignoreFriendlyFire: true }, penetration: 1 }, origin: { kind: 'environment', id: reason } });
  }

  function impact(payload) {
    if (disposed || state.mode !== 'flight') return;
    const impulse = Math.max(0, finite(payload.impulse, finite(payload.dp)));
    if (!impulse) return;
    for (const [side, id] of [['a', payload.aId], ['b', payload.bId]]) {
      const entity = state.entities?.get(id), job = jobs.get(entity?.data?.shipbreakingJobId);
      const moduleId = entity?.data?.shipbreakingModuleId;
      if (!job || suspended.has(job.id) || body(job, moduleId) !== entity) continue;
      const generation = payload[`${side}Generation`];
      if (generation != null && entity.occupantGeneration !== generation) continue;
      const module = layoutFor(job).modules.find(row => row.id === moduleId);
      const deltaV = impulse / entity.mass, threshold = module.fragile ? 4 : 9;
      if (deltaV <= threshold) continue;
      const key = bindingKey(job.id, moduleId), tick = finite(payload.tick, state.tick);
      if (tick - (contactTicks.get(key) ?? -Infinity) < 30) continue;
      contactTicks.set(key, tick);
      damage(job, moduleId, Math.min(module.maxHull * .45, (deltaV - threshold) * (module.fragile ? 2 : 1)),
        'shipbreaking_hard_contact', payload.causalActorId ?? null);
    }
  }

  const unsubscribe = ctx.bus?.on?.('physics:impact', impact);
  function resetBindings() {
    bindings.clear(); lines.clear(); jobs.clear(); suspended.clear(); lossNotified.clear();
    cutNotified.clear(); strainNotified.clear(); contactTicks.clear(); layouts.clear();
    fittedSkins.clear();
  }
  function dispose() { disposed = true; if (typeof unsubscribe === 'function') unsubscribe(); resetBindings(); }
  return Object.freeze({ spawnJob, hydrateJob: spawnJob, syncJob, disconnect, releaseImpulse, vent, burst,
    snapshotJob, retire, shelve, body, lineStatus, nativeReady, towLine, deliveryGate, damage,
    resetBindings, dispose });
}
