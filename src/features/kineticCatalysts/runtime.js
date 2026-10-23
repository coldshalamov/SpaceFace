// Production membrane: observe successful existing powers, submit bounded additive commands,
// and leave movement, inventory, combat damage, cargo and law with their established owners.
import {
  queuePhysicsImpulse, prepareExternalPhysicsImpulse, resolvePhysicsBodySpec,
  physicsBodyNativeReady, shouldSyncPhysicsBodyEntity,
} from '../../core/physicsAuthority.js';
import { recordImpulseProvenance } from '../../combat/impulseKernel.js';
import { fieldAffectsBody, fieldContainsPoint } from '../../core/fields/fieldKernel.js';
import { KINETIC_LIMITS } from './catalog.js';
import { createKineticCatalystKernel } from './kernel.js';
import { normalizeCatalystReceipts, readFittedCatalyst } from './fitting.js';

const RUNTIMES = new WeakMap();
const MAX_SCAN = 512;
const MAX_EVENTS_PER_TICK = 32;
const MAX_RECEIPTS = 64;
const MAX_QUERY_RADIUS = 540;
const finite = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const copyPoint = p => ({ x: p.x, z: p.z });
const compareId = (a, b) => typeof a === 'number' && typeof b === 'number' ? a - b
  : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;

function liveEntity(state, id) {
  const e = state?.entities?.get?.(id);
  return e && e.alive !== false && point(e.pos) ? e : null;
}
function isHitched(state, entity) {
  const hitch = state.fields?.hitches?.[entity.id];
  if (hitch) {
    const source = liveEntity(state, hitch.sourceId);
    if (source && source.data?.massSeedState?.phase !== 'collapsing') return true;
  }
  return false;
}
function isPinned(state, entity) {
  if (isHitched(state, entity)) return true;
  const statuses = state.combat?.entities?.[String(entity.id)]?.statuses;
  const pin = statuses?.status_pinned;
  if (!pin) return false;
  return !(Number.isFinite(pin.expiresTick) && pin.expiresTick <= state.tick)
    && !(Number.isFinite(pin.expiresAt) && pin.expiresAt <= state.simTime);
}
function projectBody(state, e, delta = null) {
  if (!e || e.alive === false || !shouldSyncPhysicsBodyEntity(e) || !physicsBodyNativeReady(e)
    || !point(e.pos) || !point(e.vel) || e.flags?.docked || e.flags?.defeated) return null;
  const spec = resolvePhysicsBodySpec(e);
  if (!spec?.dynamic || spec.material === 'sensor' || e.type === 'planet' || e.type === 'massSeed') return null;
  const scale = state.combat?.entities?.[String(e.id)]?.physicsResponse?.massScale;
  const mass = spec.mass * (Number.isFinite(scale) ? Math.max(0.25, Math.min(8, scale)) : 1);
  if (!(mass >= KINETIC_LIMITS.minMass && mass <= KINETIC_LIMITS.maxMass)) return null;
  return { id: e.id, generation: e.occupantGeneration ?? null, kind: e.type,
    pos: copyPoint(e.pos), vel: { x: e.vel.x + finite(delta?.x), z: e.vel.z + finite(delta?.z) },
    mass, baseMass: spec.mass, radius: spec.radius, alive: true, dynamic: true,
    pinned: isPinned(state, e), hitched: isHitched(state, e) };
}
function persistent(state) {
  if (!state.kineticCatalysts || typeof state.kineticCatalysts !== 'object') {
    state.kineticCatalysts = { schemaVersion: 1, receipts: [] };
  }
  return state.kineticCatalysts;
}

/** Each factory owns its listeners and transient kernel; repeated init disposes the prior host. */
export function createKineticCatalystsRuntime() {
  let state = null, bus = null, registry = null, helpers = null, kernel = null;
  let off = [], evidence = [], sequence = 0, pendingRestore = null;
  let lastTick = -1, eventTick = -1, eventCount = 0, impulseTick = -1, postPhysicsTick = -1;
  let fixedDt = 1 / 60;
  let sectorId = null, playerId = null, playerGeneration = null, activeShipIndex = null;
  let processing = false, disposed = true;
  const query = [], candidates = new Map(), projectedDeltas = new Map(), recentImpacts = new Map();

  function player() { return liveEntity(state, state?.playerId); }
  function flightReady() {
    const p = player();
    return !!(state && p && state.mode === 'flight' && !state.ui?.docked && !p.flags?.docked
      && !p.flags?.defeated && !(state.jump && ['CHARGING', 'JUMPING'].includes(state.jump.state)));
  }
  function syncDeltaTick() {
    if (impulseTick === state.tick) return;
    impulseTick = state.tick;
    // Contact callbacks run after native integration. Their new commands belong to the
    // next solve and must survive that tick boundary. Older commands are already in vel.
    for (const [id, delta] of projectedDeltas) {
      if (delta.applyTick < state.tick) projectedDeltas.delete(id);
    }
  }
  function markPostPhysics(tick) {
    if (postPhysicsTick === tick) return;
    syncDeltaTick();
    for (const [id, delta] of projectedDeltas) {
      if (delta.applyTick <= tick) projectedDeltas.delete(id);
    }
    postPhysicsTick = tick;
  }
  function recordPendingImpulse(entity, impulse, mass) {
    syncDeltaTick();
    const applyTick = postPhysicsTick === state.tick ? state.tick + 1 : state.tick;
    const previous = projectedDeltas.get(entity.id);
    const delta = previous && previous.generation === (entity.occupantGeneration ?? null)
      ? previous : { x: 0, z: 0, applyTick, generation: entity.occupantGeneration ?? null };
    delta.x += impulse.x / mass; delta.z += impulse.z / mass;
    delta.applyTick = applyTick;
    projectedDeltas.set(entity.id, delta);
  }
  function projectedBody(entity, fields, fieldList, predict = true) {
    const pending = projectedDeltas.get(entity?.id);
    const body = projectBody(state, entity,
      predict && pending?.generation === (entity?.occupantGeneration ?? null) ? pending : null);
    if (!predict || !body || postPhysicsTick === state.tick || typeof fields?.readAcceptedFieldAcceleration !== 'function') return body;
    const sample = fields.readAcceptedFieldAcceleration(entity);
    if (sample?.tick !== state.tick || !Number.isFinite(sample.ax) || !Number.isFinite(sample.az)) return body;
    // The fields owner has accepted and queued this acceleration, but native vel has
    // not consumed it yet. Account for it in the same energy ledger as our own commands.
    body.vel.x += sample.ax * fixedDt; body.vel.z += sample.az * fixedDt;
    if (!Array.isArray(fieldList) || fieldList.length > MAX_SCAN) return body;
    let ownPull = false;
    const profile = { id: body.id, type: entity.type, dynamic: true };
    for (const field of fieldList) {
      if (!fieldAffectsBody(field, profile) || !fieldContainsPoint(field, body.pos.x, body.pos.z)) continue;
      // Never silently neutralize mixed or foreign fields. Feed-forward only when
      // every geometrically applicable source is this ship's own Pull well.
      if (field.kind !== 'well' || field.ownerId !== state.playerId) return body;
      ownPull = true;
    }
    if (ownPull) body.ownPullAcceleration = { x: sample.ax, z: sample.az };
    return body;
  }
  function ownerFrame(dt = 0) {
    const owner = player(), p = projectBody(state, owner);
    if (p) { p.cap = Math.max(0, finite(owner.cap)); p.rot = finite(owner.rot); }
    return { now: finite(state.simTime), dt, tick: Math.max(0, state.tick | 0), player: p, bodies: [] };
  }
  function frame(dt = 0, center = null, extraIds = [], predict = true) {
    syncDeltaTick();
    const owner = player();
    const fields = predict ? registry?.get?.('fields') : null;
    const fieldList = fields?.kernelList?.();
    const p = projectedBody(owner, fields, fieldList, predict);
    if (!p) return { now: finite(state.simTime), dt, tick: state.tick | 0, player: null, bodies: [] };
    p.cap = Math.max(0, finite(owner.cap));
    p.rot = finite(owner.rot);
    candidates.clear();
    const anchor = point(center) ? center : owner.pos;
    const add = e => {
      if (candidates.size >= KINETIC_LIMITS.maxBodies || !e || e.id === owner.id
        || state.entities.get(e.id) !== e) return;
      const body = projectedBody(e, fields, fieldList, predict);
      if (body) candidates.set(body.id, body);
    };
    // Already-owned relationships are considered before the neighborhood cap. IDs are re-resolved.
    const snap = kernel.snapshot();
    for (const id of extraIds.slice(0, 8)) add(liveEntity(state, id));
    for (const row of (snap.orbit || []).slice(0, 3)) add(liveEntity(state, row.bodyId ?? row.id));
    if (snap.bridge) {
      add(liveEntity(state, snap.bridge.aId)); add(liveEntity(state, snap.bridge.bId));
    }
    if (snap.pinnedId != null) add(liveEntity(state, snap.pinnedId));
    add(liveEntity(state, state.player?.targetId));
    query.length = 0;
    let nearby;
    if (state.spatialHash?.diagnostics?.activeBuckets > 0 && typeof state.spatialHash.queryRadius === 'function') {
      nearby = state.spatialHash.queryRadius(anchor.x, anchor.z, MAX_QUERY_RADIUS, query);
    } else if (typeof helpers?.queryRadius === 'function') {
      nearby = helpers.queryRadius(anchor, MAX_QUERY_RADIUS);
    } else nearby = state.entityList || [];
    // Keep the selection stable and deterministic even if the spatial bucket order changes.
    const bounded = (Array.isArray(nearby) ? nearby : query).slice(0, MAX_SCAN)
      .filter(e => point(e?.pos) && Math.hypot(e.pos.x - anchor.x, e.pos.z - anchor.z) <= MAX_QUERY_RADIUS)
      .sort((a, b) => Math.hypot(a.pos.x - anchor.x, a.pos.z - anchor.z)
        - Math.hypot(b.pos.x - anchor.x, b.pos.z - anchor.z) || compareId(a.id, b.id));
    for (const e of bounded) { if (candidates.size >= KINETIC_LIMITS.maxBodies) break; add(e); }
    return { now: finite(state.simTime), dt: Math.max(0, Math.min(KINETIC_LIMITS.maxStep, finite(dt))),
      tick: Math.max(0, state.tick | 0), player: p,
      bodies: [...candidates.values()].sort((a, b) => compareId(a.id, b.id)) };
  }
  function remember(cue) {
    const bodyIds = Array.isArray(cue.bodyIds) ? cue.bodyIds.slice(0, KINETIC_LIMITS.maxBodies) : [];
    const bodyGenerations = {};
    for (const id of bodyIds) bodyGenerations[String(id)] = state.entities?.get?.(id)?.occupantGeneration ?? null;
    // Kernel cues are bounded scalar/array records; cloning prevents a consumer changing evidence.
    const row = { ...cue, sequence: ++sequence, tick: state.tick | 0, at: finite(state.simTime),
      bodyIds, bodyGenerations };
    evidence.push(row);
    if (evidence.length > MAX_RECEIPTS) evidence.shift();
  }
  function queueCommand(command) {
    const entity = liveEntity(state, command.bodyId);
    const projected = projectBody(state, entity);
    if (!projected || (command.generation != null && command.generation !== entity.occupantGeneration)
      || !Number.isFinite(command.x) || !Number.isFinite(command.z)) return false;
    const magnitude = Math.hypot(command.x, command.z);
    if (magnitude <= 1e-10 || magnitude > KINETIC_LIMITS.maxImpulse + 1e-6) return false;
    // Voluntary tool recoil is the equal/opposite half of a momentum pair. External-hit
    // protection here would manufacture net momentum by damping only the player's half.
    const pairedReaction = String(command.reason).endsWith(':reaction');
    const external = entity.id === state.playerId && !pairedReaction;
    const provenance = { schemaVersion: 1, source: 'kineticCatalysts', kind: command.reason,
      actorId: state.playerId, ownerId: state.playerId, chainId: command.chainId || null, depth: 1 };
    const admission = prepareExternalPhysicsImpulse(entity, { x: command.x, y: 0, z: command.z }, {
      externalEffect: external, tick: state.tick, isPlayerTarget: entity.id === state.playerId,
      provenance, kind: command.reason,
    });
    if (!admission || Math.hypot(admission.x, admission.z) <= 1e-10) return false;
    const accepted = queuePhysicsImpulse(entity, admission, {
      provenance, kind: command.reason, tick: state.tick, externalEffect: external, externalProtected: true,
    });
    if (!accepted) return false;
    recordPendingImpulse(entity, admission, projected.mass);
    recordImpulseProvenance(entity, { actorId: state.playerId, sourceOwnerId: state.playerId,
      tag: 'kinetic_catalyst', appliedTick: state.tick, magnitude: Math.hypot(admission.x, admission.z) });
    return true;
  }
  function apply(result) {
    if (!result || !player()) return false;
    const cost = finite(result.capCost, -1);
    const p = player();
    if (cost < 0 || cost > Math.max(0, finite(p.cap)) + 1e-8
      || (result.impulses?.length || 0) > KINETIC_LIMITS.maxEffects) {
      kernel.clear('admission_failed');
      return false;
    }
    // All effect costs are paid synchronously; later event handlers observe the remaining cap.
    if (cost > 0) p.cap = Math.max(0, p.cap - cost);
    let admitted = 0;
    for (const command of result.impulses || []) if (queueCommand(command)) admitted++;
    for (const cue of (result.cues || []).slice(0, KINETIC_LIMITS.maxEffects)) {
      if (['echo_hit', 'bridge_transfer'].includes(cue.kind) && admitted === 0) continue;
      remember(cue);
    }
    return admitted > 0 || cost > 0 || result.changed === true;
  }
  function syncFitted() {
    if (!state || !kernel) return null;
    const p = player();
    const fit = readFittedCatalyst(state);
    const currentSector = state.world?.currentSectorId || null;
    if (playerId !== state.playerId || playerGeneration !== (p?.occupantGeneration ?? null)
      || activeShipIndex !== fit.shipIndex || sectorId !== currentSector) {
      kernel.clear('owner_or_sector_changed'); projectedDeltas.clear(); recentImpacts.clear();
      playerId = state.playerId; playerGeneration = p?.occupantGeneration ?? null;
      activeShipIndex = fit.shipIndex; sectorId = currentSector;
    }
    // setFitted only needs the owner's identity and available cap. An unfitted ship
    // performs no neighborhood/field scan on the simulation's hot path.
    const f = ownerFrame();
    apply(kernel.setFitted(fit.valid ? fit.id : null, f));
    // A fitting can be installed while the existing Rig is already running, or
    // restored after its owner has rehydrated. Read an explicit owner flag only;
    // absent state never manufactures a toggle or overrides confirmed events.
    const cone = state.fields?.coneActive, scoop = state.planet?.player?.collectorOn;
    if (fit.valid && fit.id && (typeof cone === 'boolean' || typeof scoop === 'boolean')) {
      const active = cone === true || scoop === true;
      if (kernel.snapshot().rigActive !== active) {
        apply(kernel.handlePower({ power: 'rig', sourceId: state.playerId, active,
          eventId: `rig:owner_state:${fit.id}:${state.tick}:${active}` }, frame()));
      }
    }
    return fit;
  }
  function eventBudget() {
    if (eventTick !== state.tick) { eventTick = state.tick; eventCount = 0; }
    return ++eventCount <= MAX_EVENTS_PER_TICK;
  }
  function cast(event) {
    if (disposed || processing || !flightReady() || !eventBudget()) return false;
    syncFitted();
    if (!readFittedCatalyst(state).id) return false;
    processing = true;
    try {
      return apply(kernel.handlePower(event, frame(0, event.center, [event.bodyId, event.targetId])));
    } finally { processing = false; }
  }
  function fieldOwned(payload) {
    if (payload?.npc || payload?.planted) return false;
    const source = liveEntity(state, payload?.sourceId);
    return payload?.sourceId === state.playerId || payload?.ownerId === state.playerId
      || source?.ownerId === state.playerId || source?.data?.ownerId === state.playerId;
  }
  function onField(payload) {
    if (!payload || !fieldOwned(payload) || !point(payload.center)) return;
    const power = payload.kind === 'well' ? 'pull' : payload.kind === 'repulsor' ? 'shove' : null;
    if (!power) return; // cone has its own toggle confirmation; never double charge it.
    cast({ power, sourceId: state.playerId, center: copyPoint(payload.center),
      radius: finite(payload.radius), targetId: state.player?.targetId,
      eventId: `field:${String(payload.fieldId)}:${power}` });
  }
  function onHitch(payload) {
    if (!payload || !fieldOwned(payload) || !liveEntity(state, payload.entityId)) return;
    cast({ power: 'pin', sourceId: state.playerId, bodyId: payload.entityId,
      targetId: state.player?.targetId, seedId: payload.sourceId,
      center: copyPoint(liveEntity(state, payload.entityId).pos),
      eventId: `hitch:${payload.fieldId}:${payload.entityId}:${state.tick}` });
  }
  function onSeed(payload) {
    const seed = liveEntity(state, payload?.seedId);
    if (!seed || !(seed.ownerId === state.playerId || seed.data?.ownerId === state.playerId
      || state.massSeed?.ownerId === state.playerId)) return;
    cast({ power: 'pin', sourceId: state.playerId, seedId: payload.seedId,
      targetId: state.player?.targetId,
      center: copyPoint(payload.pos || seed.pos), eventId: `seed:${payload.seedId}:locked` });
  }
  function onBomb(payload, kind) {
    if (payload?.ownerId !== state.playerId || !point(payload.pos)) return;
    const bodyId = payload.chargeId ?? payload.bombId;
    cast({ power: 'bomb', sourceId: state.playerId, bodyId, center: copyPoint(payload.pos),
      radius: finite(payload.radius), eventId: `${kind}:${bodyId}:thrown` });
  }
  function rig(active, eventId) {
    const p = player();
    if (!p) return;
    cast({ power: 'rig', sourceId: p.id, center: copyPoint(p.pos), active: active === true, eventId });
  }
  function compensateTransfer(entity, impulse, chainId, alreadyApplied, extra = {}) {
    if (!entity || processing || !flightReady()) return false;
    const fit = syncFitted();
    if (fit?.id !== 'load_bridge') return false;
    processing = true;
    try {
      const f = frame(0, entity.pos, [entity.id]);
      const result = kernel.transferImpulse({ bodyId: entity.id, x: impulse.x, z: impulse.z,
        impulse: { x: impulse.x, z: impulse.z }, chainId, depth: 0, alreadyApplied, ...extra }, f);
      if (!result.accepted) return false;
      result.impulses.unshift({ bodyId: entity.id,
        generation: entity.occupantGeneration ?? null,
        x: result.impulse.x - impulse.x, z: result.impulse.z - impulse.z,
        reason: 'bridge_compensation', chainId, depth: 1 });
      return apply(result);
    } finally { processing = false; }
  }
  function onImpact(payload) {
    if (Number.isInteger(payload?.tick) && payload.tick === state.tick) markPostPhysics(payload.tick);
    if (!payload || !Number.isFinite(payload.impulse) || payload.impulse <= 0
      || !point(payload.normal) || !flightReady() || !eventBudget()) return;
    const length = Math.hypot(payload.normal.x, payload.normal.z);
    if (length < 0.99 || length > 1.01) return;
    const tick = payload.tick;
    if (!Number.isInteger(tick) || tick !== state.tick) return;
    const a = liveEntity(state, payload.aId), b = liveEntity(state, payload.bId);
    if (!a || !b || (payload.aGeneration != null && payload.aGeneration !== a.occupantGeneration)
      || (payload.bGeneration != null && payload.bGeneration !== b.occupantGeneration)) return;
    const pair = [a.id, b.id].sort(compareId).join(':');
    if (recentImpacts.get(pair) === tick) return;
    recentImpacts.set(pair, tick);
    if (recentImpacts.size > 64) recentImpacts.delete(recentImpacts.keys().next().value);
    // The live physics receipt normal points a -> b. Solver impulse is -J on a, +J on b.
    // A pair already connected by this bridge is an internal collision, not new input momentum.
    const link = kernel.snapshot().bridge;
    if (!link || ((a.id === link.aId || a.id === link.bId) && (b.id === link.aId || b.id === link.bId))) return;
    const endpoint = a.id === link.aId || a.id === link.bId ? a : b.id === link.aId || b.id === link.bId ? b : null;
    if (!endpoint) return;
    const sign = endpoint === a ? -1 : 1;
    compensateTransfer(endpoint, { x: sign * payload.normal.x * payload.impulse,
      z: sign * payload.normal.z * payload.impulse }, `contact:${pair}:${tick}`, true);
  }
  function clear(reason) {
    if (kernel) apply(kernel.clear(reason, state ? frame() : undefined));
    projectedDeltas.clear(); recentImpacts.clear(); lastTick = postPhysicsTick = -1;
  }
  function onLoaded() {
    clear('save_loaded');
    syncFitted();
    if (pendingRestore) {
      const restored = pendingRestore; pendingRestore = null;
      if (restored.sectorId === (state.world?.currentSectorId || null)) {
        kernel.restore(restored.kernel, frame());
        syncFitted();
      }
    }
  }
  const system = {
    name: 'kineticCatalysts',
    init(ctx) {
      if (!ctx?.state || !ctx.bus?.on) throw new TypeError('Kinetic Catalysts needs state and event bus');
      if (!disposed) system.dispose();
      const previous = RUNTIMES.get(ctx.state);
      if (previous && previous !== system) previous.dispose();
      state = ctx.state; bus = ctx.bus; registry = ctx.registry; helpers = ctx.helpers;
      kernel = createKineticCatalystKernel({ seed: state.meta?.seed ?? 4242 });
      persistent(state).receipts = normalizeCatalystReceipts(state.kineticCatalysts.receipts);
      disposed = false; sequence = 0; evidence = []; pendingRestore = null;
      lastTick = eventTick = impulseTick = postPhysicsTick = -1; eventCount = 0; fixedDt = 1 / 60;
      sectorId = null; playerId = null; playerGeneration = null; activeShipIndex = null;
      RUNTIMES.set(state, system);
      const on = (name, fn) => off.push(bus.on(name, fn));
      on('fields:deployed', onField);
      on('fields:hitchLatched', onHitch);
      on('massSeed:locked', onSeed);
      on('charge:thrown', p => onBomb(p, 'charge'));
      on('bombs:dropped', p => onBomb(p, 'bomb'));
      on('fields:coneToggled', p => {
        if (p?.npc || (p?.sourceId != null && p.sourceId !== state.playerId)) return;
        rig(p?.active, `rig:cone:${p?.fieldId}:${state.tick}:${p?.active}`);
      });
      on('planet:collector', p => rig(p?.on, `rig:skim:${p?.siteId}:${state.tick}:${p?.on}`));
      on('physics:impact', onImpact);
      on('module:equipped', syncFitted); on('module:unequipped', syncFitted);
      on('ship:statsChanged', syncFitted);
      on('sector:exit', () => clear('sector_exit'));
      on('dock:docked', () => clear('docked'));
      on('player:death', () => clear('player_death'));
      on('save:restoring', () => clear('save_restoring'));
      on('save:loaded', onLoaded);
      on('game:new', () => system.newGame());
      on('game:newGame', () => system.newGame());
      syncFitted();
      return system;
    },
    update(dt, nextState = state) {
      if (disposed || nextState !== state || !flightReady()) return;
      if (!Number.isFinite(dt) || dt <= 0) return;
      fixedDt = Math.min(KINETIC_LIMITS.maxStep, dt);
      const fit = syncFitted();
      if (!fit?.valid || !fit.id) return;
      if (state.tick === lastTick) return;
      lastTick = state.tick;
      const snap = kernel.snapshot();
      const center = snap.echo ? { x: snap.echo.x ?? snap.echo.center?.x, z: snap.echo.z ?? snap.echo.center?.z } : null;
      apply(kernel.step(frame(dt, center)));
      // fields owns the accepted acceleration sample. Its impulses are already queued this
      // tick: we redistribute a share, not replay the source force or replace its owner.
      const bridge = kernel.snapshot().bridge;
      const fields = registry?.get?.('fields');
      if (bridge && typeof fields?.readAcceptedFieldAcceleration === 'function') {
        for (const id of [bridge.aId, bridge.bId]) {
          const e = liveEntity(state, id), body = projectBody(state, e);
          const measured = e && fields.readAcceptedFieldAcceleration(e);
          if (!body || measured?.tick !== state.tick || !Number.isFinite(measured.ax) || !Number.isFinite(measured.az)) continue;
          compensateTransfer(e, { x: measured.ax * body.mass * fixedDt, z: measured.az * body.mass * fixedDt },
            `field_force:${state.tick}:${id}`, true);
        }
      }
    },
    /**
     * Optional point-impulse seam: call INSTEAD of queuePhysicsImpulse, never after it.
     * A post-solver caller must pass {phase:'afterPhysics'} as the fourth argument.
     * Quiet solver ticks have no impact event and cannot be inferred from wall/telemetry time.
     */
    routeImpulse(entity, impulse, inputEvidence = {}, options = {}) {
      if (!entity || !point(impulse)) return false;
      if (!disposed && (state.entities?.get?.(entity.id) !== entity || entity.alive === false)) return false;
      if (!disposed && options.phase === 'afterPhysics') markPostPhysics(state.tick);
      if (disposed || processing || inputEvidence?.provenance?.source === 'kineticCatalysts'
        || inputEvidence?.depth > 0 || !flightReady()) return queuePhysicsImpulse(entity, impulse, inputEvidence);
      const fit = syncFitted();
      const body = projectBody(state, entity);
      if (fit?.id !== 'load_bridge' || !body) return queuePhysicsImpulse(entity, impulse, inputEvidence);
      // Submit base J once, then a same-tick equal/opposite redistribution. This also lets
      // source command admission fail before any partner receives momentum.
      if (!queuePhysicsImpulse(entity, impulse, inputEvidence)) return false;
      compensateTransfer(entity, impulse, inputEvidence.chainId || `direct:${state.tick}:${entity.id}:${eventCount++}`,
        false, { depth: finite(inputEvidence.depth), provenance: inputEvidence.provenance });
      // The energy guard saw the pre-input state. Remember the admitted original J
      // as well as the queued compensation before another source fires this tick.
      recordPendingImpulse(entity, impulse, body.mass);
      return true;
    },
    getSnapshot() {
      if (disposed) return null;
      // Rendering describes solved world motion. Pending command predictions belong
      // only to the force admission calculation, never to velocity arrows or mirrors.
      const f = kernel.snapshot().catalystId ? frame(0, null, [], false) : ownerFrame();
      const snap = kernel.snapshot(f);
      const byId = new Map(f.bodies.map(body => [body.id, body]));
      const projected = body => body ? { id: body.id, generation: body.generation,
        x: body.pos.x, z: body.pos.z, vx: body.vel.x, vz: body.vel.z, radius: body.radius, mass: body.mass } : null;
      return { ...snap, simTime: finite(state.simTime), owner: projected(f.player),
        orbit: (snap.orbit || []).map(row => ({ ...row, ...projected(byId.get(row.bodyId ?? row.id)) })),
        bridge: snap.bridge ? { ...snap.bridge, a: projected(byId.get(snap.bridge.aId)),
          b: projected(byId.get(snap.bridge.bId)) } : null,
        cap: f.player?.cap ?? 0, fitted: readFittedCatalyst(state) };
    },
    getEvidence() { return evidence.map(row => structuredClone(row)); },
    serialize() {
      if (disposed) return null;
      return { schemaVersion: 1, sectorId: state.world?.currentSectorId || null,
        receipts: normalizeCatalystReceipts(state.kineticCatalysts?.receipts), kernel: kernel.serialize() };
    },
    deserialize(data) {
      if (disposed) return;
      clear('deserialize');
      persistent(state).receipts = normalizeCatalystReceipts(data?.schemaVersion === 1 ? data.receipts : []);
      pendingRestore = data?.schemaVersion === 1 ? { sectorId: data.sectorId ?? null, kernel: data.kernel } : null;
      evidence = []; // stale physical proof never completes a rehydrated trial.
    },
    newGame() {
      if (disposed) return;
      clear('new_game');
      state.kineticCatalysts = { schemaVersion: 1, receipts: [] };
      kernel = createKineticCatalystKernel({ seed: state.meta?.seed ?? 4242 });
      pendingRestore = null; evidence = []; sequence = 0;
      syncFitted();
    },
    dispose() {
      if (disposed) return;
      for (const stop of off) if (typeof stop === 'function') stop();
      off = []; clear('disposed'); disposed = true;
      if (RUNTIMES.get(state) === system) RUNTIMES.delete(state);
      evidence = []; pendingRestore = null; query.length = 0; candidates.clear();
    },
    destroy() { system.dispose(); }, // registry.destroySystems owns this lifecycle name.
  };
  return system;
}

export function kineticCatalystsFor(state) { return RUNTIMES.get(state) || null; }
export const kineticCatalysts = createKineticCatalystsRuntime();
