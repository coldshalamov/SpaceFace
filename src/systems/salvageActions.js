// salvageActions.js - BP-01.1 SALVAGE_DISTINCT_FROM_MINING system.
//
// Annotates existing wreck entities with a distinct salvage verb from the pure catalog. The mining
// beam still drains wreck pools, but the pool/readout/consequence now depends on what kind of wreck
// the player is working on. This system does not edit salvage.js, mining.js, or combat.js.

import { actionForWreck, actionReadoutForWreck, poolForAction } from '../data/salvageActions.js';
import { salvagePoolForWreck } from '../data/salvageLegality.js';
import { entityIndexVersion, indexedTypeScan } from '../world/livingWorldViews.js';

const TETHER_AWAY_DISTANCE = 260;

/** Bench A/B: production default ON. Quiet latch skips salvage unstable-reactor
 * entities.values() census when no live unstable reactors remain. Soft-GPU fps not
 * claimed. Fresh salvage residual after #146 catch-nets / #147 sanctuary. */
let SALVAGE_UNSTABLE_QUIET_LATCH = true;
export function setSalvageUnstableQuietLatchForBench(enabled) {
  SALVAGE_UNSTABLE_QUIET_LATCH = enabled !== false;
}
export function getSalvageUnstableQuietLatchForBench() {
  return SALVAGE_UNSTABLE_QUIET_LATCH !== false;
}

/** Membership rescan while latched (0.5 s @ 60 Hz). */
const SALVAGE_UNSTABLE_QUIET_RESCAN_TICKS = 30;

function publishSalvageUnstableQuiet(state, latched) {
  if (!state) return;
  const rt = state.salvageActionsRuntime || (state.salvageActionsRuntime = {});
  rt.unstableQuietLatched = !!latched;
}

function ensureUi(state) {
  if (!state.ui || typeof state.ui !== 'object') state.ui = {};
  return state.ui;
}

function isWreck(entity) {
  return !!(entity && entity.type === 'wreck');
}

function playerEntity(state) {
  return state && state.entities && state.entities.get && state.entities.get(state.playerId);
}

function distance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0));
}

function applyAuthoredWreckConfiguration(entity, options, simTime) {
  if (!isWreck(entity)) return null;
  const data = entity.data || (entity.data = {});
  const salvagePool = options && options.salvagePool;
  const scanLabel = options && options.scanLabel;
  const reactorTimerS = options && options.reactorTimerS;

  if (salvagePool && typeof salvagePool === 'object') {
    data.authoredSalvagePool = { ...salvagePool };
    data.salvagePool = salvagePoolForWreck(entity, data.authoredSalvagePool);
  }
  if (typeof scanLabel === 'string' && scanLabel.trim()) {
    data.authoredScanLabel = scanLabel;
    data.scanLabel = scanLabel;
  }
  if (Number.isFinite(reactorTimerS) && reactorTimerS > 0) {
    data.authoredReactorTimerS = reactorTimerS;
    const existing = data.unstableReactor && typeof data.unstableReactor === 'object'
      ? data.unstableReactor
      : {};
    data.unstableReactor = {
      ...existing,
      dueAt: simTime + reactorTimerS,
    };
  }
  return data;
}

export const salvageActions = {
  name: 'salvageActions',

  init(ctx) {
    this._state = ctx && ctx.state;
    this._bus = ctx && ctx.bus;
    this._registry = ctx && ctx.registry;
    this._unstableQuiet = null;
    this._unstableWakeSeq = 0;
    this._onEntitySpawned = (p) => this._annotate(p && p.entity);
    this._onScan = (p) => this._onScanCompleted(p);
    this._onVent = (p) => this._vent(p && (p.wreckId != null ? p.wreckId : p.targetId));
    this._onBoundaryWake = () => this.noteUnstableWake();
    if (this._bus && this._bus.on) {
      this._bus.on('entity:spawned', this._onEntitySpawned);
      this._bus.on('scan:completed', this._onScan);
      this._bus.on('salvage:ventReactor', this._onVent);
      // Boundary wakes: this system is not in FRESH_RUN_SYSTEMS — save/run/sector
      // transitions reach it only through the bus.
      this._bus.on('save:loaded', this._onBoundaryWake);
      this._bus.on('game:new', this._onBoundaryWake);
      this._bus.on('game:newGame', this._onBoundaryWake);
      this._bus.on('sector:enter', this._onBoundaryWake);
    }
  },

  /** External wake when a reactor could appear without a spawn/annotate call. */
  noteUnstableWake() {
    this._unstableWakeSeq = (this._unstableWakeSeq | 0) + 1;
    this._unstableQuiet = null;
  },

  configureAuthoredWreck(entity, options = {}) {
    const now = (this._state && this._state.simTime) || 0;
    const data = applyAuthoredWreckConfiguration(entity, options, now);
    if (!data) return null;
    if (data.unstableReactor
      && !data.unstableReactor.vented
      && !data.unstableReactor.burst
      && !data.unstableReactor.towedClear) {
      this.noteUnstableWake();
    }
    this._annotate(entity);
    return data;
  },

  _annotate(entity) {
    if (!isWreck(entity)) return null;
    const data = entity.data || (entity.data = {});
    const action = actionForWreck(entity);
    data.salvageAction = actionReadoutForWreck(entity);
    if (data.authoredSalvagePool) {
      if (!data.salvagePool || typeof data.salvagePool !== 'object') {
        data.salvagePool = salvagePoolForWreck(entity, data.authoredSalvagePool);
      }
    } else {
      data.salvagePool = salvagePoolForWreck(entity, poolForAction(action));
    }
    data.scanGlyph = action.glyph;
    data.scanLabel = data.authoredScanLabel || action.label;
    if (action.unstable) this._armReactor(entity, action);
    return data.salvageAction;
  },

  _armReactor(entity, action) {
    const data = entity.data || (entity.data = {});
    const now = (this._state && this._state.simTime) || 0;
    const existing = data.unstableReactor && typeof data.unstableReactor === 'object'
      ? data.unstableReactor
      : {};
    const timerS = Number.isFinite(data.authoredReactorTimerS) && data.authoredReactorTimerS > 0
      ? data.authoredReactorTimerS
      : (action.timerS || 8);
    data.unstableReactor = {
      dueAt: existing.dueAt != null ? existing.dueAt : now + timerS,
      damage: action.burstDamage || 18,
      vented: !!existing.vented,
      burst: !!existing.burst,
      towedClear: !!existing.towedClear,
    };
    // Live unstable reactor: wake quiet latch so the dueAt / tow census resumes.
    this.noteUnstableWake();
  },

  _onScanCompleted(p) {
    const state = this._state;
    if (!state || !p || p.targetId == null || !state.entities || !state.entities.get) return;
    const entity = state.entities.get(p.targetId);
    const readout = this._annotate(entity);
    if (!readout) return;
    ensureUi(state).salvageActionRead = { ...readout, t: state.simTime || 0 };
    if (this._bus && this._bus.emit) this._bus.emit('salvage:actionRead', { ...readout });
  },

  _vent(wreckId) {
    const state = this._state;
    if (wreckId == null || !state || !state.entities || !state.entities.get) return null;
    const wreck = state.entities.get(wreckId);
    if (!isWreck(wreck)) return null;
    const readout = this._annotate(wreck);
    if (!readout || readout.actionId !== 'vent_reactor') return null;
    const unstable = wreck.data && wreck.data.unstableReactor;
    if (!unstable || unstable.burst || unstable.towedClear) return null;
    unstable.vented = true;
    if (this._bus && this._bus.emit) {
      this._bus.emit('salvage:reactorVented', { wreckId, targetId: wreckId, t: state.simTime || 0 });
    }
    return unstable;
  },

  update(_dt, state) {
    if (!state) return;
    // Quiet open flight: no live unstable reactors still paid a full entities.values()
    // walk (isWreck / unstableReactor bag) every tick. Latch when the census stays
    // empty; wake on membership, reactor arm/annotate, or 0.5 s rescan. Soft-GPU fps
    // not claimed. Fresh salvage residual after #146 catch-nets / #147 sanctuary.
    if (SALVAGE_UNSTABLE_QUIET_LATCH !== false) {
      const membership = entityIndexVersion(state);
      const tick = state.tick | 0;
      const wakeSeq = this._unstableWakeSeq | 0;
      const quiet = this._unstableQuiet;
      if (quiet
        && membership != null
        && quiet.membership === membership
        && quiet.wakeSeq === wakeSeq
        && ((tick - (quiet.armedTick | 0)) < SALVAGE_UNSTABLE_QUIET_RESCAN_TICKS)) {
        publishSalvageUnstableQuiet(state, true);
        return;
      }
    } else if (this._unstableQuiet) {
      this._unstableQuiet = null;
      publishSalvageUnstableQuiet(state, false);
    }

    const index = state.entityIndex;
    const useWrecks = !!(index && index.__spacefaceEntityIndexV1 && index.ready === true
      && Array.isArray(index.wrecks));
    const list = useWrecks
      ? indexedTypeScan(state, 'wrecks')
      : (state.entities && typeof state.entities.values === 'function'
        ? state.entities.values()
        : null);
    if (!list) return;

    let liveUnstable = 0;
    for (const entity of list) {
      if (!isWreck(entity) || entity.alive === false) continue;
      const unstable = entity.data && entity.data.unstableReactor;
      if (!unstable || unstable.vented || unstable.burst || unstable.towedClear) continue;
      liveUnstable++;
      if (this._isTowedClear(entity, state)) {
        unstable.towedClear = true;
        if (this._bus && this._bus.emit) {
          this._bus.emit('salvage:reactorTowedClear', { wreckId: entity.id, targetId: entity.id, t: state.simTime || 0 });
        }
        continue;
      }
      if ((state.simTime || 0) >= unstable.dueAt) this._burst(entity, unstable, state);
    }

    if (SALVAGE_UNSTABLE_QUIET_LATCH !== false) {
      const membership = entityIndexVersion(state);
      if (membership != null && liveUnstable === 0) {
        this._unstableQuiet = {
          membership,
          wakeSeq: this._unstableWakeSeq | 0,
          armedTick: state.tick | 0,
        };
        publishSalvageUnstableQuiet(state, true);
      } else {
        this._unstableQuiet = null;
        publishSalvageUnstableQuiet(state, false);
      }
    }
  },

  _isTowedClear(entity, state) {
    const tether = state.player && state.player.tether;
    if (!tether || !tether.active || tether.targetId !== entity.id) return false;
    const player = playerEntity(state);
    return distance(player && player.pos, entity.pos) >= TETHER_AWAY_DISTANCE;
  },

  _burst(entity, unstable, state) {
    unstable.burst = true;
    const damage = Math.max(1, Math.min(unstable.damage || 18, 24));
    const payload = {
      targetId: state.playerId,
      ownerId: entity.id,
      damage,
      damageType: 'thermal',
      pos: entity.pos ? { x: entity.pos.x, z: entity.pos.z } : null,
      origin: { kind: 'salvage_reactor', id: entity.id },
    };
    const combat = this._registry && this._registry.get && this._registry.get('combat');
    if (combat && typeof combat.onHit === 'function') combat.onHit(payload);
    else if (this._bus && this._bus.emit) this._bus.emit('combat:hit', payload);
    entity.alive = false;
    if (this._bus && this._bus.emit) {
      this._bus.emit('salvage:reactorBurst', { wreckId: entity.id, targetId: entity.id, damage, t: state.simTime || 0 });
    }
  },

  destroy() {
    if (this._bus && this._bus.off) {
      if (this._onEntitySpawned) this._bus.off('entity:spawned', this._onEntitySpawned);
      if (this._onScan) this._bus.off('scan:completed', this._onScan);
      if (this._onVent) this._bus.off('salvage:ventReactor', this._onVent);
    }
    this._onEntitySpawned = null;
    this._onScan = null;
    this._onVent = null;
  },
};

export default salvageActions;
