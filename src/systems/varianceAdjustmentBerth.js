import { VARIANCE_ADJUSTMENT_BERTH as VA } from '../data/varianceAdjustmentBerth.js';
import { SLATE_COLUMN } from '../data/slate.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import {
  resolveCollisionProxyManifest,
  proxyOuterRadiusWu,
  effectiveCorridorBearingDeg,
  hullEnvelopeWu,
} from '../data/collisionProxyManifests.js';
import { makeShipEntitySpec } from './ships.js';
import { deferSectorEnterMaterialization } from '../core/sectorEnterDefer.js';

const BERTH_SIDES = Object.freeze([1, -1, 0.75, -0.75]);
const CLEARANCE_TYPES = new Set(['ship', 'asteroid', 'wreck', 'station']);
const DEG = Math.PI / 180;

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function entitiesOf(state) {
  if (state?.entities && typeof state.entities.values === 'function') return [...state.entities.values()];
  return Array.isArray(state?.entityList) ? state.entityList : [];
}

function storyFlags(state) {
  if (!state?.story) return null;
  if (!state.story.flags || typeof state.story.flags !== 'object') state.story.flags = {};
  return state.story.flags;
}

function hasIdentityTags(entity) {
  const d = entity?.data;
  return !!(entity?.type === 'ship' && entity.isPlayer !== true
    && d?.varianceAdjustmentId === VA.actorId
    && d?.worldRecordId === VA.worldRecordId
    && d?.identityKey === VA.identityKey
    && d?.persistenceOwner === VA.persistenceOwner
    && d?.defId === VA.shipDefId
    && d?.hullDefId === VA.hullDefId);
}

function sameIdentity(entity) {
  return entity?.alive !== false && hasIdentityTags(entity);
}

function isLiveCanonical(state, entity) {
  return sameIdentity(entity) && entity.id != null
    && state?.entities && typeof state.entities.get === 'function'
    && state.entities.get(entity.id) === entity;
}

function inAdventure(state) {
  const run = state?.run;
  return !run || !run.kind || run.kind === 'adventure' || run.kind === 'campaign';
}

function sceneActive(state) {
  return inAdventure(state) && state?.world?.currentSectorId === VA.sectorId;
}

function partialIdentityClaim(entity) {
  const d = entity?.data;
  return !!(d && (d.varianceAdjustmentId === VA.actorId || d.worldRecordId === VA.worldRecordId
    || d.identityKey === VA.identityKey || d.persistenceOwner === VA.persistenceOwner));
}

function wrapRadians(angle) {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function stationFor(state) {
  return entitiesOf(state).find((entity) => entity?.alive !== false && entity.type === 'station'
    && entity.data?.stationId === VA.stationId) || null;
}

/** Deterministic candidate search against the live station proxy, approach lane, Slate pillar,
 * and current collidable world bodies. Called only on entry/restore or a relevant deferred event. */
export function varianceAdjustmentBerthPosition(state, station, outBlocked = []) {
  outBlocked.length = 0;
  if (!station?.pos || !Number.isFinite(station.pos.x) || !Number.isFinite(station.pos.z)) return null;
  const manifest = resolveCollisionProxyManifest(station);
  if (!manifest) return null;
  const outer = proxyOuterRadiusWu(manifest, station);
  if (!(outer > 0)) return null;
  const distance = outer + VA.hullRadiusWu + VA.berthSlackWu;
  const stationRadius = finite(station.radius, outer);
  if (distance > stationRadius + 250 - VA.hullRadiusWu) return null;

  const docking = manifest.docking || {};
  const corridor = docking.corridor || {};
  const corridorHalfWidth = Math.max(0, finite(corridor.halfWidthDeg, 22)) * DEG;
  const mouthRadius = Math.max(0, finite(corridor.mouthRadius, 1.35)) * outer;
  const axis = finite(station.rot) + effectiveCorridorBearingDeg(manifest, station) * DEG;
  const hullAngularRadius = Math.asin(Math.min(1, VA.hullRadiusWu / distance));
  const columnCenter = sectorLocalToGlobalForSector(SLATE_COLUMN.pos, SLATE_COLUMN.sectorId, {});
  const minColumnDistance = SLATE_COLUMN.readRadius + VA.hullRadiusWu + VA.slateColumnMarginWu;
  const entities = entitiesOf(state);

  for (const side of BERTH_SIDES) {
    const angle = axis + side * Math.PI / 2;
    const offset = Math.abs(wrapRadians(angle - axis));
    if (distance - VA.hullRadiusWu <= mouthRadius
      || offset - hullAngularRadius < corridorHalfWidth) continue;
    const pos = {
      x: station.pos.x + Math.cos(angle) * distance,
      z: station.pos.z + Math.sin(angle) * distance,
    };
    if (Math.hypot(pos.x - columnCenter.x, pos.z - columnCenter.z) < minColumnDistance) continue;

    let blocked = false;
    for (const entity of entities) {
      if (!entity || entity === station || entity.alive === false || entity.collides === false
        || hasIdentityTags(entity) || !CLEARANCE_TYPES.has(entity.type) || !entity.pos) continue;
      const required = VA.hullRadiusWu + hullEnvelopeWu(entity) + VA.nearbyBodyMarginWu;
      const separation = Math.hypot(finite(entity.pos.x) - pos.x, finite(entity.pos.z) - pos.z);
      if (separation < required) {
        outBlocked.push({ pos: { x: finite(entity.pos.x), z: finite(entity.pos.z) }, required });
        blocked = true;
      }
    }
    if (!blocked) return { pos, rot: angle };
  }
  return null;
}

function actorSpec(station, berth) {
  const spec = makeShipEntitySpec(VA.shipDefId, {
    team: 2,
    factionId: station.factionId || null,
    isPlayer: false,
    pos: berth.pos,
    rot: berth.rot,
  });
  spec.radius = VA.hullRadiusWu;
  spec.vel = { x: 0, z: 0 };
  spec.angVel = 0;
  spec.physicsBody = {
    dynamic: false,
    shape: 'ball',
    radius: VA.hullRadiusWu,
    useMeasuredSkin: false,
    material: 'ship',
  };
  spec.flags = { ...(spec.flags || {}), persistent: true, invuln: true };
  spec.data = {
    ...spec.data,
    defId: VA.shipDefId,
    hullDefId: VA.hullDefId,
    weapons: [],
    name: VA.displayName,
    callsign: VA.callsign,
    worldRecordId: VA.worldRecordId,
    identityKey: VA.identityKey,
    persistenceOwner: VA.persistenceOwner,
    varianceAdjustmentId: VA.actorId,
    homeSectorId: VA.sectorId,
    sectorId: VA.sectorId,
    transientSector: true,
    masslineTetherable: false,
    scanLabel: 'VARIANCE ADJUSTMENT · moored inspection hull',
  };
  return spec;
}

function eventEntity(state, payload) {
  if (payload?.entity && typeof payload.entity === 'object') return payload.entity;
  const id = payload?.entityId ?? payload?.id ?? payload?.targetId;
  if (id == null) return null;
  if (state?.entities && typeof state.entities.get === 'function') return state.entities.get(id) || null;
  return entitiesOf(state).find((entity) => entity?.id === id) || null;
}

export const varianceAdjustmentBerth = {
  name: 'varianceAdjustmentBerth',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || {};
    this._unsubs = [];
    this._pending = this.state?.world?.currentSectorId === VA.sectorId;
    this._restoring = false;
    this._spawning = false;
    this._suppressed = new WeakSet();
    this._ownedRefs = new WeakSet();
    this._blockedCandidates = [];
    this._waitingForBudget = false;
    const on = (event, fn) => {
      const off = this.bus?.on?.(event, fn);
      if (typeof off === 'function') this._unsubs.push(off);
    };
    on('sector:enter', (payload) => {
      if (payload?.sectorId && payload.sectorId !== VA.sectorId) return;
      this._pending = sceneActive(this.state);
      if (!this._pending) return;
      if (deferSectorEnterMaterialization(this.state, payload, this._cookProvider)) return;
      this._reconcile();
    });
    on('sector:exit', (payload) => {
      if (payload?.continuous || payload?.noTeleport) return;
      this._pending = false;
      this._blockedCandidates = [];
      this._waitingForBudget = false;
      this._removeOwned();
      this.helpers.spawnBudget?.release(VA.worldRecordId);
    });
    on('save:restoring', () => {
      this._restoring = true;
      this._pending = false;
      this._blockedCandidates = [];
      // Retire pre-restore object refs before the loaded world can rebind a replacement actor.
      // A delayed destroy receipt for an actor from the outgoing world must not mark the new
      // scene lost merely because this owner once held that old object.
      this._ownedRefs = new WeakSet();
    });
    on('save:loaded', () => {
      this._restoring = false;
      this._pending = sceneActive(this.state);
      if (this._pending) this._reconcile();
    });
    on('game:newGame', () => this.newGame());
    on('entity:killed', (payload) => this._recordExternalLoss(payload));
    on('entity:spawned', (payload) => {
      if (this._spawning || this._restoring) return;
      const entity = eventEntity(this.state, payload);
      // world materializes every station/pending body before its sector:enter tail. Mark the
      // scene dirty here, then let that settled lifecycle event run the clearance scan once.
      if (entity?.type === 'station' && entity.data?.stationId === VA.stationId
        && sceneActive(this.state)) this._pending = true;
    });
    on('entity:destroyed', (payload) => {
      const entity = eventEntity(this.state, payload);
      if (hasIdentityTags(entity)) {
        if (!this._suppressed.has(entity)) this._recordExternalLoss(payload);
        return;
      }
      const clearedCandidate = this._blockedCandidates.some((candidate) => {
        if (!entity?.pos) return false;
        return Math.hypot(finite(entity.pos.x) - candidate.pos.x,
          finite(entity.pos.z) - candidate.pos.z) < candidate.required + hullEnvelopeWu(entity);
      });
      const budgetAvailable = this.helpers.spawnBudget?.available?.() > 0;
      if ((clearedCandidate || (this._waitingForBudget && budgetAvailable))
        && sceneActive(this.state)) this._reconcile();
    });
    this._cookProvider = () => {
      if (this._pending && sceneActive(this.state) && !this._restoring) this._reconcile();
    };
    (this.helpers.sectorCookProviders || (this.helpers.sectorCookProviders = []))
      .push(this._cookProvider);
    if (this._pending && !this._restoring) this._reconcile();
  },

  _reconcile() {
    const state = this.state;
    if (this._restoring || !sceneActive(state)) { this._pending = false; return; }
    this._pending = false;
    this._waitingForBudget = false;
    const flags = storyFlags(state);
    if (flags?.[VA.storyFlags.lost] === true) return;

    const entities = entitiesOf(state);
    const claims = entities.filter(partialIdentityClaim);
    const liveClaims = claims.filter(sameIdentity);
    const deadCanonical = claims.some((entity) => hasIdentityTags(entity)
      && entity.alive === false && state?.entities?.get?.(entity.id) === entity);
    if (deadCanonical) {
      if (flags) flags[VA.storyFlags.lost] = true;
      return;
    }
    const actors = liveClaims.filter((entity) => isLiveCanonical(state, entity))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (claims.some((entity) => !hasIdentityTags(entity))) return; // conflicting authored identity: fail closed

    let actor = actors[0] || null;
    for (const duplicate of actors.slice(1)) this._removeOne(duplicate);

    const budget = this.helpers.spawnBudget;
    if (actor) {
      if (!this._bindBudget(actor, budget)) {
        this._removeOne(actor);
        this._waitingForBudget = true;
        return;
      }
      this._ownedRefs?.add(actor);
      this._blockedCandidates = [];
      this._announce(flags);
      return;
    }

    const station = stationFor(state);
    if (!station || !budget) {
      this._pending = true;
      return;
    }
    const blocked = [];
    const berth = varianceAdjustmentBerthPosition(state, station, blocked);
    if (!berth) {
      this._blockedCandidates = blocked;
      return;
    }
    if (budget.request(1, VA.worldRecordId) !== 1) {
      this._waitingForBudget = true;
      return;
    }

    this._spawning = true;
    try {
      actor = this.helpers.spawnEntity?.(actorSpec(station, berth)) || null;
    } catch (error) {
      budget.release(VA.worldRecordId);
      throw error;
    } finally {
      this._spawning = false;
    }
    if (!actor || !sameIdentity(actor) || !this._bindBudget(actor, budget)) {
      if (actor) this._removeOne(actor);
      budget.release(VA.worldRecordId);
      this._waitingForBudget = true;
      return;
    }
    this._ownedRefs?.add(actor);
    this._blockedCandidates = [];
    this._announce(flags);
  },

  _bindBudget(actor, budget) {
    if (!budget || !isLiveCanonical(this.state, actor)) return false;
    const owner = budget.ownerForEntity?.(actor.id);
    if (owner != null && owner !== VA.worldRecordId) return false;
    if (budget.bindEntity?.(actor.id, VA.worldRecordId)
      && budget.ownerForEntity?.(actor.id) === VA.worldRecordId) return true;
    if (budget.request?.(1, VA.worldRecordId) !== 1) return false;
    if (budget.bindEntity?.(actor.id, VA.worldRecordId)
      && budget.ownerForEntity?.(actor.id) === VA.worldRecordId) return true;
    budget.release?.(VA.worldRecordId);
    return false;
  },

  _announce(flags) {
    if (!flags || flags[VA.storyFlags.seen] === true) return;
    flags[VA.storyFlags.seen] = true;
    this.bus?.emit?.('comms:popup', {
      id: 'variance_adjustment_berth_arrival',
      sender: 'VESTA FORGE · YARD REGISTRY',
      category: 'story',
      text: VA.arrivalLine,
      ttl: 9,
      persist: false,
    });
  },

  _removeOne(entity) {
    if (!isLiveCanonical(this.state, entity)) return;
    this._suppressed?.add(entity);
    this.helpers?.removeEntity?.(entity.id, {
      immediate: true,
      reason: 'variance_adjustment_berth_owner_remove',
    });
    if (this.helpers?.spawnBudget?.ownerForEntity?.(entity.id) === VA.worldRecordId) {
      this.helpers.spawnBudget.releaseEntity?.(entity.id, entity);
    }
  },

  _removeOwned() {
    for (const entity of entitiesOf(this.state)) if (sameIdentity(entity)) this._removeOne(entity);
  },

  _recordExternalLoss(payload) {
    if (this._spawning || this._restoring) return;
    const entity = eventEntity(this.state, payload);
    if (!hasIdentityTags(entity) || this._suppressed?.has(entity)) return;
    const current = this.state?.entities?.get?.(entity.id);
    if (current && current !== entity) return; // recycled id; the stale receipt is not current custody
    if (current !== entity && !this._ownedRefs?.has(entity)) return;
    const flags = storyFlags(this.state);
    if (flags) flags[VA.storyFlags.lost] = true;
    this._pending = false;
    this._blockedCandidates = [];
    this._waitingForBudget = false;
    this.helpers.spawnBudget?.releaseEntity?.(entity.id, entity);
    this.helpers.spawnBudget?.release?.(VA.worldRecordId);
  },

  newGame() {
    this._removeOwned();
    this.helpers.spawnBudget?.release?.(VA.worldRecordId);
    const flags = storyFlags(this.state);
    if (flags) {
      delete flags[VA.storyFlags.seen];
      delete flags[VA.storyFlags.lost];
    }
    this._restoring = false;
    this._pending = sceneActive(this.state);
    this._blockedCandidates = [];
    this._waitingForBudget = false;
    this._ownedRefs = new WeakSet();
    // New-game world construction emits sector:enter / station entity:spawned after this reset.
    // Do not reconcile against the outgoing world here.
  },

  destroy() {
    const providers = this.helpers?.sectorCookProviders;
    if (Array.isArray(providers)) {
      const index = providers.indexOf(this._cookProvider);
      if (index >= 0) providers.splice(index, 1);
    }
    const queue = this.state?.render?.deferredEnterMaterializers;
    if (Array.isArray(queue)) {
      for (let i = queue.length - 1; i >= 0; i -= 1) {
        if (queue[i]?.provider === this._cookProvider) queue.splice(i, 1);
      }
    }
    this._removeOwned();
    this.helpers?.spawnBudget?.release?.(VA.worldRecordId);
    for (const off of this._unsubs || []) off?.();
    this._unsubs = [];
    this._suppressed = new WeakSet();
    this._ownedRefs = new WeakSet();
    this._blockedCandidates = [];
    this._waitingForBudget = false;
    this._cookProvider = null;
  },
};

