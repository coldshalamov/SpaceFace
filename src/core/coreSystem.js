// Core system: owns the entity store + lifecycle, the per-step prelude (tick/time/snapshot),
// the end-of-step lifetime sweep, and the cross-cutting helpers exposed via ctx.helpers (§4.3).
import { allocateEntityId, makeEntity, stampOccupantGeneration, worldLedgerHoldsId, clearEntityRuntime } from './entity.js';
import { isDynamicPhysicsBodyEntity, shouldSyncPhysicsBodyEntity } from './physicsAuthority.js';
import { mulberry32, hash32, wrapAngle } from './rng.js';
import { hasActiveSpatialHash } from './spatialQuery.js';
import { initializePresentationAdmission } from './presentationAdmission.js';
import { packCombatTable } from './combatTable.js';
import { beginDirtyTick, markDirty, collectDirtyIds, DIRTY } from './dirtyJournal.js';
import { stampNearWorkBudget, refreshNearWorkAlwaysAwake } from './activityScheduler.js';
import { modelTruthProxyManifest } from '../data/modelTruth.js';
import { measuredSkinAllowedFor } from '../data/collisionProxyManifests.js';


// Bench A/B: production default ON. Quiet Ceres keeps short-lived lanes empty; the clocks walk
// then only re-checks Infinity-ttl movers whose POSE was already published in preStep. Skip the
// walk when short-lived lanes are empty and no shipLike carries despawnAt. Dirty-wake: any
// projectile/fx/bomb/charge/pickup/mine/snare/payload on a lane, or a shipLike despawnAt, restores
// the full clocks path. Different angle from held pose-rematch / sleeping-clocks / compact-skip.
let LIFETIME_SWEEP_QUIET_CLOCKS_SKIP = true;
export function setLifetimeSweepQuietClocksSkipForBench(enabled) {
  LIFETIME_SWEEP_QUIET_CLOCKS_SKIP = enabled !== false;
}
export function getLifetimeSweepQuietClocksSkipForBench() {
  return LIFETIME_SWEEP_QUIET_CLOCKS_SKIP !== false;
}

function shortLivedClockLanesEmpty(index) {
  if (!index || index.__spacefaceEntityIndexV1 !== true || index.ready !== true) return false;
  const empty = (lane) => !lane || lane.length === 0;
  return empty(index.projectiles)
    && empty(index.fx)
    && empty(index.bombs)
    && empty(index.charges)
    && empty(index.pickups)
    && empty(index.payloads)
    && empty(index.mines)
    && empty(index.vectorMines)
    && empty(index.snares);
}

function shipLikeHasDespawnAt(index) {
  const ships = index && index.shipLike;
  if (!ships || ships.length === 0) return false;
  for (let i = 0; i < ships.length; i++) {
    const e = ships[i];
    if (e && e.alive && e.data && e.data.despawnAt != null) return true;
  }
  return false;
}

const DAY_SECONDS = 600; // 10 sim-minutes per in-game "day" (faction decay/conflict cadence)

export const core = {
  name: 'core',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.presentationJournal = ctx.presentationJournal || null;
    this._lastDay = 0;
    this._presentationPausedForDock = false;
    this._presentationJournalErrorCount = 0;
    if (Array.isArray(this._presentationJournalUnsubscribes)) {
      for (const unsubscribe of this._presentationJournalUnsubscribes) unsubscribe();
    }
    this._presentationJournalUnsubscribes = [];

    const state = this.state, bus = this.bus;
    const publishPresentation = (method, entity) => {
      const journal = this.presentationJournal;
      if (!journal || typeof journal[method] !== 'function') return 0;
      try {
        return journal[method](state.tick, entity);
      } catch (error) {
        this._presentationJournalErrorCount++;
        try { journal.requestRebuild?.('owner-publication-error'); } catch (_) { /* derived only */ }
        if (this._presentationJournalErrorCount <= 3) {
          console.error(`[core] presentation journal ${method} failed:`, error);
        }
        return 0;
      }
    };
    const requestPresentationRebuild = (reason) => {
      const journal = this.presentationJournal;
      if (!journal || typeof journal.requestRebuild !== 'function') return;
      try { journal.requestRebuild(reason); }
      catch (_) { this._presentationJournalErrorCount++; }
    };
    this._publishPresentation = publishPresentation;

    const spawnEntity = (spec) => {
      const index = ensureEntityIndex(state);
      reconcileEntityIndexSource(index, state.entityList);
      const e = makeEntity(spec);
      // Measured skins ride fixed bodies and eligible solid dynamics alike; authored physicsBody
      // geometry (shape, collisionProxyManifest, useMeasuredSkin:false) opts out — Package C.
      const measuredSkin = e && e.collides !== false && measuredSkinAllowedFor(e)
        ? modelTruthProxyManifest(e)
        : null;
      if (measuredSkin) {
        const declared = e.data && e.data.collisionProxy;
        if (!declared || declared === 'station_ring_hub' || declared === 'helios_trade_hub' || declared === 'gate_jump_ring') {
          e.data = e.data || {};
          e.data.collisionProxy = measuredSkin.id;
        }
      }
      initializePresentationAdmission(e);
      const reserved = Number.isSafeInteger(spec && spec.id) && spec.id > 0 ? spec.id : 0;
      const id = reserved && !state.entities.has(reserved)
        ? reserved
        : allocateEntityId(state);
      e.id = id;
      // A reserved id and a freeIds recycle are both a new occupant of that number.
      stampOccupantGeneration(state, e);
      state.entities.set(id, e);
      state.entityList.push(e);
      appendEntityIndex(index, e);
      markEntityIndexSourceSynced(index, state.entityList);
      markDirty(state, e.id, DIRTY.MEMBERSHIP | DIRTY.POSE);
      publishPresentation('recordSpawn', e);
      bus.emit('entity:spawned', { id, type: e.type, entity: e });
      return e;
    };
    const getEntity = (id) => state.entities.get(id) || null;
    const removeEntity = (id, opts) => {
      const e = state.entities.get(id);
      if (!e) return false;
      e.alive = false;
      if (opts && opts.immediate === true) {
        const hintedIndex = Number.isInteger(opts.index) ? opts.index : -1;
        const index = state.entityList[hintedIndex] === e
          ? hintedIndex
          : state.entityList.indexOf(e);
        if (index >= 0) this._removeEntityAtIndex(index, state, opts);
      }
      return true;
    };
    // Multi-corpse removal for sweep/despawn bursts; indices are list positions, applied
    // highest-first exactly like the callers' reverse walks.
    const removeEntitiesAtIndices = (indices, opts) => this._removeEntitiesAtIndices(indices, state, opts);
    const queryRadius = (pos, r, out = []) => {
      out.length = 0;
      const hash = state.spatialHash;
      if (hasActiveSpatialHash(hash)) {
        hash.queryRadius(pos.x, pos.z, r, out);
      } else {
        const source = (state.entityIndex && state.entityIndex.collidables) || state.entityList;
        for (const e of source) {
          if (e && e.alive && e.collides) out.push(e);
        }
      }
      const r2 = r * r;
      let write = 0;
      for (let i = 0; i < out.length; i++) {
        const e = out[i];
        if (!e || !e.alive || !e.collides || !e.pos) continue;
        const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z;
        if (dx * dx + dz * dz <= r2) out[write++] = e;
      }
      out.length = write;
      return out;
    };
    const player = () => state.entities.get(state.playerId) || null;
    ensureEntityIndex(state);

    // INTERIM pacing policy for the nemesis packet (Counterexample), pending the tension-director
    // deliverable. Deterministic, read-only over state: it approves or refuses a reserved
    // named-rival beat and NEVER spawns ships or spends the ship budget itself — the encounter
    // host owns spawning and separately re-checks budget/placement. All time is simulation time.
    // Refusals are fail-closed: the engine waits and retries (15 s) rather than spawning.
    const NEMESIS_MIN_SIM_TIME = 180; // earliest first announcement (LIMITS contract, seconds)
    const canStartNemesisEncounter = (request, currentState) => {
      const s = currentState || state;
      if (!s || s.mode !== 'flight') return false;
      if (!(Number(s.simTime) >= NEMESIS_MIN_SIM_TIME)) return false;
      // Same-sector token: the request is anchored to the sector it was announced in.
      const currentSector = s.world && s.world.currentSectorId || '';
      if (!currentSector || !request || request.sectorId !== currentSector) return false;
      // Living player above the 45% recovery threshold (the host re-checks this independently).
      const self = s.entities && s.entities.get(s.playerId);
      if (!self || self.alive === false) return false;
      const hullMax = Number.isFinite(self.hullMax) && self.hullMax > 0 ? self.hullMax : self.hull;
      if (!(Number(self.hull) > 0) || !(self.hull / Math.max(1, hullMax) > 0.45)) return false;
      // Protected onboarding (read-only check): the tutorial rail owns the opening minutes.
      const onboarding = s.onboarding;
      if (onboarding && onboarding.active && !onboarding.finished) return false;
      // Docked or dock-adjacent: never open a boss beat at the station's doorstep.
      if (self.flags && self.flags.docked) return false;
      if (s.ui && s.ui.docked === true) return false;
      const corridor = s.dockingCorridor;
      if (corridor && corridor.phase && corridor.phase !== 'none') return false;
      // No other major encounter: survival/crucible/swarm runs and an already-live rival beat
      // each veto. Mission-owned set pieces stay authored by their own directors this interim.
      const run = s.run;
      if (run && run.kind && run.phase !== 'inactive') return false;
      const rivalMemory = s.nemesis;
      if (rivalMemory && (rivalMemory.active || rivalMemory.pending)) return false;
      return true;
    };

    const markEntityVisualChanged = (entityOrId) => {
      const entity = typeof entityOrId === 'object'
        ? entityOrId
        : state.entities.get(entityOrId);
      return entity ? publishPresentation('recordVisual', entity) : 0;
    };
    Object.assign(ctx.helpers, {
      spawnEntity, getEntity, removeEntity, removeEntitiesAtIndices, queryRadius, player,
      entityIndex: () => ensureEntityIndex(state),
      markEntityVisualChanged,
      requestPresentationRebuild,
      mulberry32, hash32, wrapAngle,
      canStartNemesisEncounter,
    });
    this.helpers = ctx.helpers;

    this._presentationJournalUnsubscribes.push(
      // Force-kill command (missions/console).
      bus.on('entity:kill', ({ id, killerId }) => {
        const e = state.entities.get(id);
        if (e && e.alive) { e.alive = false; e._killerId = killerId; }
      }),
      bus.on('entity:spawnRequest', ({ spec }) => spawnEntity(spec)),
      bus.on('ship:appearanceChanged', ({ id }) => markEntityVisualChanged(id)),
      bus.on('save:restoring', () => requestPresentationRebuild('save-restoring')),
      // Continue restores simTime without reconstructing core. Re-anchor the day boundary so the
      // first preStep cannot invent a multi-day day:tick from _lastDay still sitting at 0.
      bus.on('save:loaded', () => {
        this.syncDayBoundaryFromSimTime(state);
        requestPresentationRebuild('save-loaded');
      }),
      // A same-sector teleport (world.relocatePlayerInSector) writes pos and prevPos together, so
      // the per-tick recordTransformIfChanged never sees it, and the render pose blend has no
      // continuous source across it. A parked hull stayed at the old spot with the camera on it
      // (measured: Helios capture 1915 WU from the sim pose for 55 s). Re-seed like a sector entry.
      bus.on('world:playerRelocated', () => requestPresentationRebuild('player-relocated')),
      bus.on('game:new', () => requestPresentationRebuild('game-new')),
      bus.on('game:newGame', () => requestPresentationRebuild('game-new')),
      bus.on('game:started', () => requestPresentationRebuild('game-started')),
    );
  },

  /**
   * Align the day-boundary cursor with the authoritative sim clock.
   * Used after Continue/load so restored simTime does not look like N days of elapsed time.
   */
  syncDayBoundaryFromSimTime(state = this.state) {
    if (!state) return;
    const day = Math.max(0, Math.floor((Number(state.simTime) || 0) / DAY_SECONDS));
    this._lastDay = day;
    state.days = day;
  },

  destroy() {
    if (Array.isArray(this._presentationJournalUnsubscribes)) {
      for (const unsubscribe of this._presentationJournalUnsubscribes) unsubscribe();
      this._presentationJournalUnsubscribes.length = 0;
    }
    this._publishPresentation = null;
    this.presentationJournal = null;
  },

  // Prelude: advance clocks and snapshot interpolation state. Called by registry.step().
  preStep(dt, state) {
    state.tick++;
    state.simTime += dt;
    state.meta.playtimeS += dt;
    const index = ensureEntityIndex(state);
    reconcileEntityIndexSource(index, state.entityList);
    refreshVolatileEntityIndex(index, state);
    beginDirtyTick(state, state.tick);
    // index.movables is append-gated by isMovableEntity. Re-checking every tick re-entered
    // isDynamicPhysicsBodyEntity → authoredPhysicsBody/defaultDynamic on the quiet preStep
    // pole (profile authoredPhysicsBody self under isMovableEntity). Trust the lane; mid-life
    // dynamic flips already require re-index for spatial/physics lanes too.
    const movables = index.movables;
    for (const e of movables) {
      if (!e || !e.alive) continue;
      const noInterp = !!(e.flags && e.flags.noInterp);
      if (e.physicsSleeping === true && !noInterp) {
        const svx = e.vel ? Number(e.vel.x) || 0 : 0;
        const svz = e.vel ? Number(e.vel.z) || 0 : 0;
        const swy = Number(e.angVel) || 0;
        const poseStill = e.prevPos
          && e.prevPos.x === e.pos.x
          && e.prevPos.z === e.pos.z
          && e.prevRot === e.rot;
        if (svx * svx + svz * svz <= 1e-8 && swy * swy <= 1e-8 && poseStill) continue;
      }
      const posChanged = !e.prevPos
        || e.prevPos.x !== e.pos.x
        || e.prevPos.z !== e.pos.z
        || e.prevRot !== e.rot;
      e.prevPos.copy(e.pos);
      e.prevRot = e.rot;
      e.prevBank = e.bank;   // snapshot roll for renderer interpolation (Phase 1 banking)
      e.prevPitch = e.pitch; // snapshot pitch lean for renderer interpolation
      const vx = e.vel ? Number(e.vel.x) || 0 : 0;
      const vz = e.vel ? Number(e.vel.z) || 0 : 0;
      if ((vx * vx + vz * vz) > 1e-8 || posChanged) markDirty(state, e.id, DIRTY.POSE);
    }
    packCombatTable(state);
    stampNearWorkBudget(state);
    index.ready = true;
    const day = Math.floor(state.simTime / DAY_SECONDS);
    if (day !== this._lastDay) {
      const elapsed = day - this._lastDay;
      this._lastDay = day;
      state.days = day;
      // Forward boundaries notify consumers. A backward jump means the clock was reset (New Game)
      // while core kept the prior cursor — adopt silently instead of emitting a negative/zero catch-up.
      if (elapsed > 0) {
        this.bus.emit('day:tick', { days: day, elapsed });
      }
    }
  },

  _removeEntityAtIndex(i, state, opts) {
    const list = state.entityList;
    const e = list[i];
    if (!e) return false;
    e.alive = false;
    clearEntityRuntime(e);
    this._publishPresentation?.('recordDestroy', e);
    markDirty(state, e.id, DIRTY.MEMBERSHIP);
    removeEntityIndex(state.entityIndex, e);
    const destroyed = {
      id: e.id,
      type: e.type,
      pos: { x: e.pos.x, z: e.pos.z },
      radius: e.radius,
      factionId: e.factionId,
      // The entity object itself: ids recycle, and a queued receipt can flush after a different
      // occupant took the id. Subscribers that key on identity (spawnBudget's slot release)
      // compare this ref, not the id alone.
      entity: e,
    };
    if (opts && opts.reason) destroyed.reason = opts.reason;
    this.bus.queue('entity:destroyed', destroyed);
    state.entities.delete(e.id);
    // Far shelving writes its row before removing the body, and dressing/field rows can hold an
    // id too. Recycling a held id let the next spawn or row take it, so two world objects shared
    // one mesh and presentation slot. The id comes back once that row promotes and the body dies.
    if (!worldLedgerHoldsId(state.world, e.id)) state.freeIds.push(e.id);
    const last = list.pop();
    if (i < list.length) list[i] = last;
    if (opts && opts.immediate === true) markEntityIndexSourceSynced(state.entityIndex, list);
    return true;
  },

  // Batch twin of _removeEntityAtIndex for multi-corpse ticks: same per-corpse bookkeeping and
  // the same swap-pop applied highest-index-first, but the index strip runs once via
  // removeEntitiesFromIndex instead of re-scanning every bucket per corpse.
  _removeEntitiesAtIndices(indices, state, opts) {
    const list = state.entityList;
    if (!Array.isArray(list) || !indices || indices.length === 0) return 0;
    indices.sort((a, b) => b - a);
    const corpses = this._corpseScratch || (this._corpseScratch = []);
    corpses.length = 0;
    for (let k = 0; k < indices.length; k++) {
      const i = indices[k];
      const e = list[i];
      if (!e) continue;
      e.alive = false;
      clearEntityRuntime(e);
      this._publishPresentation?.('recordDestroy', e);
      markDirty(state, e.id, DIRTY.MEMBERSHIP);
      const destroyed = {
        id: e.id,
        type: e.type,
        pos: { x: e.pos.x, z: e.pos.z },
        radius: e.radius,
        factionId: e.factionId,
        // Same generation ref as the single path: ids recycle, and a queued receipt that flushes
        // after a new occupant took the id must not release that occupant's binding.
        entity: e,
      };
      if (opts && opts.reason) destroyed.reason = opts.reason;
      this.bus.queue('entity:destroyed', destroyed);
      state.entities.delete(e.id);
      // Same recycle guard as the single path: ledger-held ids come back when the row dies.
      if (!worldLedgerHoldsId(state.world, e.id)) state.freeIds.push(e.id);
      const last = list.pop();
      if (i < list.length) list[i] = last;
      corpses.push(e);
    }
    if (corpses.length === 0) return 0;
    removeEntitiesFromIndex(state.entityIndex, corpses);
    if (opts && opts.immediate === true) markEntityIndexSourceSynced(state.entityIndex, list);
    return corpses.length;
  },

  // End-of-step: TTL/despawn, sweep dead entities, recycle ids, flush deferred events.
  lifetimeSweep(dt, state) {
    const docked = !!(state.ui && state.ui.docked);
    if (docked !== this._presentationPausedForDock) {
      this._presentationPausedForDock = docked;
      if (!docked) {
        const journal = this.presentationJournal;
        if (journal && typeof journal.requestRebuild === 'function') {
          try { journal.requestRebuild('undock-resume'); }
          catch (_) { this._presentationJournalErrorCount++; }
        }
      }
    }
    const list = state.entityList;
    // Clocks and pose-dirty belong to movers / short-lived extras. Stations and field rocks
    // do not get a TTL or a transform publish from this sweep. The dead-compact pass still
    // walks entityList so a skipped clock cannot leak a corpse.
    const index = state.entityIndex;
    const clocks = index && index.__spacefaceEntityIndexV1 && index.ready === true
      && Array.isArray(index.movables)
      ? index.movables
      : list;
    // Quiet short-lived-lane clocks skip: when no projectile/fx/ordnance/pickup clocks exist and
    // no shipLike carries despawnAt, the movable walk only re-checks Infinity-ttl ships whose
    // POSE preStep already published. Skip the walk; dirty publish + corpse compact still run.
    const skipQuietClocks = LIFETIME_SWEEP_QUIET_CLOCKS_SKIP
      && shortLivedClockLanesEmpty(index)
      && !shipLikeHasDespawnAt(index);
    if (!skipQuietClocks) {
      for (let i = 0; i < clocks.length; i++) {
        const e = clocks[i];
        if (!e || e.id === state.playerId) continue;
        if (e.alive && e.ttl !== Infinity) {
          e.ttl -= dt;
          if (e.ttl <= 0) {
            e.alive = false;
            markDirty(state, e.id, DIRTY.MEMBERSHIP);
          }
        }
        if (e.alive && e.data && e.data.despawnAt != null && state.simTime >= e.data.despawnAt) {
          e.alive = false;
          markDirty(state, e.id, DIRTY.MEMBERSHIP);
        }
        if (e.alive) {
          const pos = e.pos;
          const prev = e.prevPos;
          if (pos && prev && (pos.x !== prev.x || pos.z !== prev.z)) markDirty(state, e.id, DIRTY.POSE);
          else if (e.prevRot != null && e.rot !== e.prevRot) markDirty(state, e.id, DIRTY.POSE);
        }
      }
    }
    const dirty = collectDirtyIds(
      state,
      DIRTY.MEMBERSHIP | DIRTY.POSE,
      this._lifetimeDirty || (this._lifetimeDirty = []),
    );
    const entities = state.entities;
    const player = entities && typeof entities.get === 'function' ? entities.get(state.playerId) : null;
    if (player && player.alive && !this._presentationPausedForDock && isMovableEntity(player)) {
      this._publishPresentation?.('recordTransformIfChanged', player);
    }
    for (let i = 0; i < dirty.length; i++) {
      const e = entities && typeof entities.get === 'function' ? entities.get(dirty[i]) : null;
      if (!e || e.id === state.playerId || !e.alive) continue;
      if (!this._presentationPausedForDock && isMovableEntity(e)) {
        this._publishPresentation?.('recordTransformIfChanged', e);
      }
    }
    const tier1 = state.perfRuntime && state.perfRuntime.tier1;
    if (tier1 && tier1.isEnabled()) {
      tier1.countEntityVisits(list.length, 'lifetime-sweep');
    }
    // Collect corpse slots before mutating: removal order stays the backward walk's
    // highest-index-first sequence, and multi-corpse ticks pay one index pass instead of
    // one ~30-bucket strip per corpse.
    const corpseIndices = this._lifetimeCorpseIndices || (this._lifetimeCorpseIndices = []);
    corpseIndices.length = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e && e.id === state.playerId) continue;
      if (e && !e.alive) corpseIndices.push(i);
    }
    if (corpseIndices.length === 1) this._removeEntityAtIndex(corpseIndices[0], state);
    else if (corpseIndices.length > 1) this._removeEntitiesAtIndices(corpseIndices, state);
    if (state.entityIndex && state.entityIndex.__spacefaceEntityIndexV1) {
      markEntityIndexSourceSynced(state.entityIndex, list);
    }
    if (state.spatialHash && typeof state.spatialHash.flushPerfCounters === 'function') {
      state.spatialHash.flushPerfCounters(state.perfRuntime);
    }
    this.bus.flush();
  },
};

function ensureEntityIndex(state) {
  if (state.entityIndex && state.entityIndex.__spacefaceEntityIndexV1) return repairEntityIndex(state.entityIndex);
  state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    version: 0,
    ready: false,
    ships: [],
    drones: [],
    shipLike: [],
    projectiles: [],
    pickups: [],
    payloads: [],
    movables: [],
    stations: [],
    dockStations: [],
    gates: [],
    asteroids: [],
    mineables: [],
    wrecks: [],
    fx: [],
    mines: [],
    vectorMines: [],
    snares: [],
    charges: [],
    bombs: [],
    statics: [],
    damageables: [],
    aiShips: [],
    weaponShips: [],
    collidables: [],
    spatialStatics: [],
    spatialDynamics: [],
    spatialStaticVersion: 0,
    physicsBodies: [],
    physicsStatics: [],
    physicsDynamics: [],
    physicsStaticVersion: 0,
    radarContacts: [],
    radarAsteroids: [],
    byStationId: new Map(),
    byWorldRecordId: new Map(),
    _indexedIds: new Set(),
    _sourceList: null,
    _sourceLength: -1,
  };
  return state.entityIndex;
}

function repairEntityIndex(index) {
  if (!index || !index.__spacefaceEntityIndexV1) return index;
  if (!Array.isArray(index.ships)) index.ships = [];
  if (!Array.isArray(index.drones)) index.drones = [];
  if (!Array.isArray(index.shipLike)) index.shipLike = [];
  if (!Array.isArray(index.projectiles)) index.projectiles = [];
  if (!Array.isArray(index.pickups)) index.pickups = [];
  if (!Array.isArray(index.payloads)) index.payloads = [];
  if (!Array.isArray(index.movables)) index.movables = [];
  if (!Array.isArray(index.stations)) index.stations = [];
  if (!Array.isArray(index.dockStations)) index.dockStations = [];
  if (!Array.isArray(index.gates)) index.gates = [];
  if (!Array.isArray(index.asteroids)) index.asteroids = [];
  if (!Array.isArray(index.mineables)) index.mineables = [];
  if (!Array.isArray(index.wrecks)) index.wrecks = [];
  if (!Array.isArray(index.fx)) {
    index.fx = [];
    index.ready = false;
  }
  if (!Array.isArray(index.mines)) {
    index.mines = [];
    index.ready = false;
  }
  if (!Array.isArray(index.vectorMines)) {
    index.vectorMines = [];
    index.ready = false;
  }
  if (!Array.isArray(index.snares)) index.snares = [];
  if (!Array.isArray(index.charges)) {
    index.charges = [];
    index.ready = false;
  }
  if (!Array.isArray(index.bombs)) {
    index.bombs = [];
    index.ready = false;
  }
  if (!Array.isArray(index.statics)) index.statics = [];
  if (!Array.isArray(index.damageables)) index.damageables = [];
  // Repairing a volatile lane leaves it valid-but-empty; force the next refresh
  // to rebuild rather than wait out the cadence on a corrupt index.
  if (!Array.isArray(index.aiShips)) { index.aiShips = []; index._volatileReady = false; }
  if (!Array.isArray(index.weaponShips)) { index.weaponShips = []; index._volatileReady = false; }
  if (!Array.isArray(index.collidables)) index.collidables = [];
  if (!Array.isArray(index.spatialStatics)) index.spatialStatics = [];
  if (!Array.isArray(index.spatialDynamics)) index.spatialDynamics = [];
  if (!Number.isFinite(index.spatialStaticVersion)) index.spatialStaticVersion = 0;
  if (!Array.isArray(index.physicsBodies)) index.physicsBodies = [];
  if (!Array.isArray(index.physicsStatics)) index.physicsStatics = [];
  if (!Array.isArray(index.physicsDynamics)) index.physicsDynamics = [];
  if (!Number.isFinite(index.physicsStaticVersion)) index.physicsStaticVersion = 0;
  if (!Array.isArray(index.radarContacts)) index.radarContacts = [];
  if (!Array.isArray(index.radarAsteroids)) index.radarAsteroids = [];
  if (!(index.byStationId instanceof Map)) index.byStationId = new Map();
  if (!(index.byWorldRecordId instanceof Map)) {
    index.byWorldRecordId = new Map();
    index.ready = false;
  }
  if (!(index._indexedIds instanceof Set)) {
    index._indexedIds = new Set();
    index.ready = false;
  }
  if (!('_sourceList' in index)) index._sourceList = null;
  if (!Number.isFinite(index._sourceLength)) index._sourceLength = -1;
  return index;
}

function clearEntityIndex(index) {
  if (!index || !index.__spacefaceEntityIndexV1) return;
  repairEntityIndex(index);
  // Membership may already be gone when this runs (entities.clear() precedes the index wipe on
  // the wholesale-save path). Version-latched caches must see a bump so no stale row outlives
  // the wipe — an extra bump only costs a re-walk, a missed one leaks a dead entity.
  index.version = (Number.isFinite(index.version) ? index.version : 0) + 1;
  index.ships.length = 0;
  index.drones.length = 0;
  index.shipLike.length = 0;
  index.projectiles.length = 0;
  index.pickups.length = 0;
  index.payloads.length = 0;
  index.movables.length = 0;
  index.stations.length = 0;
  index.dockStations.length = 0;
  index.gates.length = 0;
  index.asteroids.length = 0;
  index.mineables.length = 0;
  index.wrecks.length = 0;
  index.fx.length = 0;
  index.mines.length = 0;
  index.vectorMines.length = 0;
  index.snares.length = 0;
  index.charges.length = 0;
  index.bombs.length = 0;
  index.statics.length = 0;
  index.damageables.length = 0;
  index.aiShips.length = 0;
  index.weaponShips.length = 0;
  index.collidables.length = 0;
  index.spatialStatics.length = 0;
  index.spatialDynamics.length = 0;
  index.physicsBodies.length = 0;
  index.physicsStatics.length = 0;
  index.physicsDynamics.length = 0;
  index.radarContacts.length = 0;
  index.radarAsteroids.length = 0;
  index.byStationId.clear();
  index.byWorldRecordId.clear();
  index._indexedIds.clear();
  index._volatileReady = false;
}

function appendEntityIndex(index, e) {
  if (!index || !index.__spacefaceEntityIndexV1 || !e || !e.alive) return;
  if (e.id != null) {
    if (index._indexedIds.has(e.id)) return;
    index._indexedIds.add(e.id);
  }
  const movable = isMovableEntity(e);
  if (e.collides) {
    index.collidables.push(e);
    if (movable) {
      index.spatialDynamics.push(e);
    } else {
      index.spatialStatics.push(e);
      index.spatialStaticVersion++;
    }
  }
  if (shouldSyncPhysicsBodyEntity(e)) {
    index.physicsBodies.push(e);
    if (isDynamicPhysicsBodyEntity(e)) {
      index.physicsDynamics.push(e);
    } else {
      index.physicsStatics.push(e);
      index.physicsStaticVersion++;
    }
  }
  if (movable) index.movables.push(e);
  if (e.type !== 'projectile' && e.type !== 'fx'
      && e.type !== 'masslineSnare' && e.type !== 'masslineSnareAnchor') {
    if (e.type === 'asteroid') index.radarAsteroids.push(e);
    else index.radarContacts.push(e);
  }
  // First holder wins, matching the entities-map walk every worldRecordId lookup used to run.
  const worldRecordId = e.data && e.data.worldRecordId;
  if (worldRecordId != null && !index.byWorldRecordId.has(worldRecordId)) {
    index.byWorldRecordId.set(worldRecordId, e);
  }

  switch (e.type) {
    case 'ship':
      index.ships.push(e);
      index.shipLike.push(e);
      index.damageables.push(e);
      if (e.data && e.data.ai) index.aiShips.push(e);
      if (e.data && e.data.weapons && e.data.weapons.length) index.weaponShips.push(e);
      break;
    case 'drone':
      index.drones.push(e);
      index.shipLike.push(e);
      index.damageables.push(e);
      break;
    case 'projectile':
      index.projectiles.push(e);
      break;
    case 'pickup':
      index.pickups.push(e);
      break;
    case 'payload':
      index.payloads.push(e);
      break;
    case 'station': {
      index.stations.push(e);
      index.statics.push(e);
      index.damageables.push(e);
      const data = e.data || {};
      if (data.isGate) index.gates.push(e);
      else if (data.dockless !== true) index.dockStations.push(e);
      if (data.stationId && !index.byStationId.has(data.stationId)) index.byStationId.set(data.stationId, e);
      break;
    }
    case 'asteroid':
      index.asteroids.push(e);
      index.statics.push(e);
      if (!(e.data && e.data.respawnAt != null)) index.mineables.push(e);
      break;
    case 'wreck':
      index.wrecks.push(e);
      index.mineables.push(e);
      break;
    case 'fx':
      index.fx.push(e);
      break;
    case 'mine':
      // W03 physical mines: shootable (damageables) so clearing a wake is counterplay.
      index.damageables.push(e);
      index.mines.push(e);
      break;
    case 'vectormine':
      index.vectorMines.push(e);
      break;
    case 'masslineSnare':
      index.snares.push(e);
      break;
    case 'charge':
      index.charges.push(e);
      break;
    case 'bomb':
      // Drift bombs: kinematic fuze entities. Collidable for projectile sweeps (PQ-205.02)
      // while physicsBody stays false — bombs own their pose. Not a combat damageable;
      // projectile:hit is retired by the bombs owner exactly once.
      index.bombs.push(e);
      break;
    case 'massSeed':
      // PQ-011 anchor seeds: damageable in every phase (counterplay — hostile fire and stray
      // blasts can destroy the anchor; there is no protected window).
      index.damageables.push(e);
      break;
    case 'fieldEmitter':
      // PQ-012 deployed Well/Repulsor devices: damageable so shooting one down unregisters its
      // field the same tick (counterplay + destruction cleanup). The Cone has no emitter entity.
      index.damageables.push(e);
      break;
    case 'masslineSnareAnchor':
      // PQ-030: visible snare endpoints are fixed ghost bodies but remain projectile-damageable;
      // destroying either endpoint cleanly breaks the authority-owned line.
      index.damageables.push(e);
      break;
  }
  index.version++;
}

function removeEntityIndex(index, e) {
  if (!index || !index.__spacefaceEntityIndexV1 || !e) return;
  repairEntityIndex(index);
  if (e.id != null && !index._indexedIds.has(e.id)) return;
  if (e.id != null) index._indexedIds.delete(e.id);
  removeFromIndexArray(index.collidables, e);
  const removedSpatialStatic = removeFromIndexArray(index.spatialStatics, e);
  removeFromIndexArray(index.spatialDynamics, e);
  removeFromIndexArray(index.physicsBodies, e);
  const removedPhysicsStatic = removeFromIndexArray(index.physicsStatics, e);
  removeFromIndexArray(index.physicsDynamics, e);
  removeFromIndexArray(index.movables, e);
  removeFromIndexArray(index.radarContacts, e);
  removeFromIndexArray(index.radarAsteroids, e);
  removeFromIndexArray(index.ships, e);
  removeFromIndexArray(index.drones, e);
  removeFromIndexArray(index.shipLike, e);
  removeFromIndexArray(index.projectiles, e);
  removeFromIndexArray(index.pickups, e);
  removeFromIndexArray(index.payloads, e);
  removeFromIndexArray(index.stations, e);
  removeFromIndexArray(index.dockStations, e);
  removeFromIndexArray(index.gates, e);
  removeFromIndexArray(index.asteroids, e);
  removeFromIndexArray(index.mineables, e);
  removeFromIndexArray(index.wrecks, e);
  removeFromIndexArray(index.fx, e);
  removeFromIndexArray(index.mines, e);
  removeFromIndexArray(index.vectorMines, e);
  removeFromIndexArray(index.snares, e);
  removeFromIndexArray(index.charges, e);
  removeFromIndexArray(index.bombs, e);
  removeFromIndexArray(index.statics, e);
  removeFromIndexArray(index.damageables, e);
  removeFromIndexArray(index.aiShips, e);
  removeFromIndexArray(index.weaponShips, e);
  if (e.type === 'station') {
    const stationId = e.data && e.data.stationId;
    if (stationId && index.byStationId.get(stationId) === e) {
      index.byStationId.delete(stationId);
      for (const station of index.stations) {
        if (station && station.alive && station.data && station.data.stationId === stationId) {
          index.byStationId.set(stationId, station);
          break;
        }
      }
    }
  }
  // Vacated worldRecordId slots remap to the next live holder so map lookups answer the same
  // entity the entityList walk would have found (duplicate keepers exist for malformed rows).
  const worldRecordId = e.data && e.data.worldRecordId;
  if (worldRecordId != null && index.byWorldRecordId.get(worldRecordId) === e) {
    index.byWorldRecordId.delete(worldRecordId);
    const source = index._sourceList;
    if (Array.isArray(source)) {
      for (const survivor of source) {
        if (survivor && survivor !== e && survivor.alive !== false
          && survivor.data && survivor.data.worldRecordId === worldRecordId) {
          index.byWorldRecordId.set(worldRecordId, survivor);
          break;
        }
      }
    }
  }
  if (removedSpatialStatic) index.spatialStaticVersion++;
  if (removedPhysicsStatic) index.physicsStaticVersion++;
  index.version++;
}

function removeFromIndexArray(list, e) {
  if (!Array.isArray(list)) return;
  const i = list.indexOf(e);
  if (i >= 0) {
    list.splice(i, 1);
    return true;
  }
  return false;
}

// Batch counterpart of removeEntityIndex for multi-corpse ticks (sweep, sector despawn). One
// membership filter per bucket drops the whole corpse set while preserving survivor order
// exactly as the sequential indexOf+splice pass did — same final index state, and the version
// counters keep their exact per-corpse increments.
function removeEntitiesFromIndex(index, corpses) {
  if (!index || !index.__spacefaceEntityIndexV1 || !corpses || corpses.length === 0) return;
  repairEntityIndex(index);
  // Corpses whose id is no longer indexed were already stripped once — same early-return
  // removeEntityIndex applies per entity, so they must not be filtered a second time.
  const removed = new Set();
  let indexed = 0;
  for (let i = 0; i < corpses.length; i++) {
    const e = corpses[i];
    if (!e || (e.id != null && !index._indexedIds.has(e.id))) continue;
    if (e.id != null) index._indexedIds.delete(e.id);
    removed.add(e);
    indexed++;
  }
  if (indexed === 0) return;
  removeCorpsesFromIndexArray(index.collidables, removed);
  index.spatialStaticVersion += removeCorpsesFromIndexArray(index.spatialStatics, removed);
  removeCorpsesFromIndexArray(index.spatialDynamics, removed);
  removeCorpsesFromIndexArray(index.physicsBodies, removed);
  index.physicsStaticVersion += removeCorpsesFromIndexArray(index.physicsStatics, removed);
  removeCorpsesFromIndexArray(index.physicsDynamics, removed);
  removeCorpsesFromIndexArray(index.movables, removed);
  removeCorpsesFromIndexArray(index.radarContacts, removed);
  removeCorpsesFromIndexArray(index.radarAsteroids, removed);
  removeCorpsesFromIndexArray(index.ships, removed);
  removeCorpsesFromIndexArray(index.drones, removed);
  removeCorpsesFromIndexArray(index.shipLike, removed);
  removeCorpsesFromIndexArray(index.projectiles, removed);
  removeCorpsesFromIndexArray(index.pickups, removed);
  removeCorpsesFromIndexArray(index.payloads, removed);
  removeCorpsesFromIndexArray(index.stations, removed);
  removeCorpsesFromIndexArray(index.dockStations, removed);
  removeCorpsesFromIndexArray(index.gates, removed);
  removeCorpsesFromIndexArray(index.asteroids, removed);
  removeCorpsesFromIndexArray(index.mineables, removed);
  removeCorpsesFromIndexArray(index.wrecks, removed);
  removeCorpsesFromIndexArray(index.fx, removed);
  removeCorpsesFromIndexArray(index.mines, removed);
  removeCorpsesFromIndexArray(index.vectorMines, removed);
  removeCorpsesFromIndexArray(index.snares, removed);
  removeCorpsesFromIndexArray(index.charges, removed);
  removeCorpsesFromIndexArray(index.bombs, removed);
  removeCorpsesFromIndexArray(index.statics, removed);
  removeCorpsesFromIndexArray(index.damageables, removed);
  removeCorpsesFromIndexArray(index.aiShips, removed);
  removeCorpsesFromIndexArray(index.weaponShips, removed);
  // Station-slot remap lands on the first surviving live station with the same stationId —
  // the sequential rescans also skipped dead stations, so the outcome is identical.
  for (let i = 0; i < corpses.length; i++) {
    const e = corpses[i];
    if (!e || e.type !== 'station' || !removed.has(e)) continue;
    const stationId = e.data && e.data.stationId;
    if (stationId && index.byStationId.get(stationId) === e) {
      index.byStationId.delete(stationId);
      for (const station of index.stations) {
        if (station && station.alive && station.data && station.data.stationId === stationId) {
          index.byStationId.set(stationId, station);
          break;
        }
      }
    }
  }
  // Same remap for worldRecordId slots, one shared rescan for the whole corpse set — the
  // sequential path re-scanned the list per vacated key, the batch scans it once.
  let vacatedWorldRecordIds = null;
  for (let i = 0; i < corpses.length; i++) {
    const e = corpses[i];
    if (!e || !removed.has(e)) continue;
    const worldRecordId = e.data && e.data.worldRecordId;
    if (worldRecordId != null && index.byWorldRecordId.get(worldRecordId) === e) {
      index.byWorldRecordId.delete(worldRecordId);
      (vacatedWorldRecordIds || (vacatedWorldRecordIds = new Set())).add(worldRecordId);
    }
  }
  if (vacatedWorldRecordIds && Array.isArray(index._sourceList)) {
    for (const survivor of index._sourceList) {
      if (!survivor || survivor.alive === false || !survivor.data) continue;
      const key = survivor.data.worldRecordId;
      if (key != null && vacatedWorldRecordIds.has(key) && !index.byWorldRecordId.has(key)) {
        index.byWorldRecordId.set(key, survivor);
      }
    }
  }
  index.version += indexed;
}

// In-place order-preserving removal of every corpse in `removed` from one index bucket.
// Returns the dropped count so the version counters keep sequential semantics.
function removeCorpsesFromIndexArray(list, removed) {
  if (!Array.isArray(list)) return 0;
  let w = 0, dropped = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (removed.has(e)) { dropped++; continue; }
    list[w++] = e;
  }
  if (dropped) list.length = w;
  return dropped;
}

function reconcileEntityIndexSource(index, list) {
  repairEntityIndex(index);
  if (index.ready && index._sourceList === list && index._sourceLength === list.length) return;
  clearEntityIndex(index);
  for (const e of list) appendEntityIndex(index, e);
  markEntityIndexSourceSynced(index, list);
  index.ready = true;
}

function markEntityIndexSourceSynced(index, list) {
  if (!index || !index.__spacefaceEntityIndexV1) return;
  index._sourceList = list;
  index._sourceLength = list.length;
}

// Mid-life ai/weapons attach without a spawn/despawn is rare. append/remove already keep
// aiShips/weaponShips correct for membership. Rebuilding every preStep was O(ships) on the
// quiet registry pole; catch up on a fixed cadence so a hot attach still lands within a few
// ticks without paying the walk 60 Hz. Exported so contract checks (check-gameplay-core)
// bound their wait by the real window instead of a stale constant.
export const VOLATILE_INDEX_PERIOD_TICKS = 8;

function refreshVolatileEntityIndex(index, stateOrTick = 0) {
  if (!index || !index.__spacefaceEntityIndexV1) return false;
  const state = stateOrTick && typeof stateOrTick === 'object' ? stateOrTick : null;
  const tick = state ? (state.tick | 0) : (Number.isInteger(stateOrTick) ? stateOrTick : Math.floor(Number(stateOrTick) || 0));
  if (index._volatileReady === true) {
    const period = VOLATILE_INDEX_PERIOD_TICKS;
    if (((tick % period) + period) % period !== 0) return false;
  }
  index.aiShips.length = 0;
  index.weaponShips.length = 0;
  const ships = index.ships;
  for (let i = 0; i < ships.length; i++) {
    const e = ships[i];
    if (!e || !e.alive || e.type !== 'ship') continue;
    if (e.data && e.data.ai) index.aiShips.push(e);
    if (e.data && e.data.weapons && e.data.weapons.length) index.weaponShips.push(e);
  }
  // Mid-life combatant / activity-slot attach shares this cadence. Refresh the
  // near-work always-awake cache here so stampNearWorkBudget stays a boolean
  // read on the quiet 60 Hz path (same staleness window as aiShips).
  const shipLike = index.shipLike;
  for (let i = 0; i < shipLike.length; i++) {
    refreshNearWorkAlwaysAwake(shipLike[i], state);
  }
  index._volatileReady = true;
  return true;
}

function isMovableEntity(e) {
  // Keep render interpolation aligned with the physics authority. Wrecks and fracture chunks are
  // dynamic Rapier bodies; without a fresh previous pose, render alpha repeatedly pulls them back
  // toward their spawn pose and creates the characteristic object-width flicker.
  if (isDynamicPhysicsBodyEntity(e)) return true;
  switch (e.type) {
    case 'ship':
    case 'drone':
    case 'projectile':
    case 'pickup':
    case 'payload':
    case 'fx':
      return true;
    // PQ-011: a Mass Seed's Rapier body stays FIXED (physicsStatics), but the entity itself moves
    // kinematically during travel — and the spatial-hash STATIC layer caches positions by version,
    // so classing it static would leave it bucketed at its spawn point and unacquirable at its lock
    // point. Movable membership puts it in the incremental dynamic layer (rehash follows pos) and
    // earns prevPos snapshots so renderer interpolation doesn't judder the travel animation.
    case 'massSeed':
      return true;
    // Alien Ecology: fauna are kinematic (physicsBody:false, collides:false) but move every
    // tick — movable membership keeps their spatial bucket + prevPos interpolation honest.
    case 'fauna':
      return true;
    // PQ-205.02: kinematic drift bombs participate in the spatial-dynamic layer so the
    // projectile-sweep hash follows the capsule. Pose is still bomb-owned (physicsBody:false).
    case 'bomb':
      return true;
    default:
      return false;
  }
}
