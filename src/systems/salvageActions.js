// salvageActions.js - BP-01.1 SALVAGE_DISTINCT_FROM_MINING system.
//
// Annotates existing wreck entities with a distinct salvage verb from the pure catalog. The mining
// beam still drains wreck pools, but the pool/readout/consequence now depends on what kind of wreck
// the player is working on. This system does not edit salvage.js, mining.js, or combat.js.

import { actionForWreck, actionReadoutForWreck, poolForAction } from '../data/salvageActions.js';
import { salvagePoolForWreck } from '../data/salvageLegality.js';

const TETHER_AWAY_DISTANCE = 260;

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

export const salvageActions = {
  name: 'salvageActions',

  init(ctx) {
    this._state = ctx && ctx.state;
    this._bus = ctx && ctx.bus;
    this._registry = ctx && ctx.registry;
    this._onEntitySpawned = (p) => this._annotate(p && p.entity);
    this._onScan = (p) => this._onScanCompleted(p);
    this._onVent = (p) => this._vent(p && (p.wreckId != null ? p.wreckId : p.targetId));
    if (this._bus && this._bus.on) {
      this._bus.on('entity:spawned', this._onEntitySpawned);
      this._bus.on('scan:completed', this._onScan);
      this._bus.on('salvage:ventReactor', this._onVent);
    }
  },

  _annotate(entity) {
    if (!isWreck(entity)) return null;
    const data = entity.data || (entity.data = {});
    const action = actionForWreck(entity);
    data.salvageAction = actionReadoutForWreck(entity);
    data.salvagePool = salvagePoolForWreck(entity, poolForAction(action));
    data.scanGlyph = action.glyph;
    data.scanLabel = action.label;
    if (action.unstable) this._armReactor(entity, action);
    return data.salvageAction;
  },

  _armReactor(entity, action) {
    const data = entity.data || (entity.data = {});
    const now = (this._state && this._state.simTime) || 0;
    const existing = data.unstableReactor && typeof data.unstableReactor === 'object'
      ? data.unstableReactor
      : {};
    data.unstableReactor = {
      dueAt: existing.dueAt != null ? existing.dueAt : now + (action.timerS || 8),
      damage: action.burstDamage || 18,
      vented: !!existing.vented,
      burst: !!existing.burst,
      towedClear: !!existing.towedClear,
    };
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
    if (!state || !state.entities || !state.entities.values) return;
    for (const entity of state.entities.values()) {
      if (!isWreck(entity) || entity.alive === false) continue;
      const unstable = entity.data && entity.data.unstableReactor;
      if (!unstable || unstable.vented || unstable.burst || unstable.towedClear) continue;
      if (this._isTowedClear(entity, state)) {
        unstable.towedClear = true;
        if (this._bus && this._bus.emit) {
          this._bus.emit('salvage:reactorTowedClear', { wreckId: entity.id, targetId: entity.id, t: state.simTime || 0 });
        }
        continue;
      }
      if ((state.simTime || 0) >= unstable.dueAt) this._burst(entity, unstable, state);
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
