// Cruise travel tier (spec2/02 §1). V toggles a 3.0 s charge; while engaged the ship gets
// ×4 maxSpeed, ×2.5 main accel and ×0.25 turn. Drops instantly on damage, manual toggle, boost,
// firing or mass-lock (any entity radius ≥ 60 within 180 wu).
// The system owns state.player.cruise and emits cruise:charging/engaged/dropped{reason}.

const CHARGE_NEEDED = 3.0;          // s (spec §1)
const MASS_LOCK_RADIUS = 180;       // wu
const MASS_LOCK_ENTITY_RADIUS = 60; // wu
const DROP_REASONS = Object.freeze({ DAMAGE: 'damage', MASSLOCK: 'masslock', MANUAL: 'manual' });

export const cruise = {
  name: 'cruise',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._wasCruiseAction = false;

    this.bus.on('combat:damage', (p) => {
      if (!p || p.targetId !== this.state.playerId) return;
      this._drop(DROP_REASONS.DAMAGE);
    });
    this.bus.on('ship:boostStart', (p) => {
      if (p && p.shipId === this.state.playerId) this._drop(DROP_REASONS.DAMAGE);
    });
    this.bus.on('combat:fire', (p) => {
      if (p && p.ownerId === this.state.playerId) this._drop(DROP_REASONS.DAMAGE);
    });
  },

  update(dt, state) {
    if (state.mode !== 'flight') return;
    const player = state.entities.get(state.playerId);
    if (!player || !player.alive) return;

    const cruise = this._ensureCruise(state);
    const action = !!(state.input && state.input.actions && state.input.actions.cruise);
    const edge = action && !this._wasCruiseAction;
    this._wasCruiseAction = action;

    // Manual toggle: off→charge, charging/cruising→manual drop.
    if (edge) {
      if (cruise.phase === 'off') {
        this._startCharge(cruise);
      } else {
        this._drop(DROP_REASONS.MANUAL);
      }
    }

    if (cruise.phase === 'charging') {
      cruise.t += dt;
      if (cruise.t >= CHARGE_NEEDED) {
        cruise.t = CHARGE_NEEDED;
        cruise.phase = 'cruising';
        this.bus.emit('cruise:engaged', { playerId: state.playerId });
      }
    }

    if (cruise.phase === 'cruising') {
      // Mass-lock drop is checked every tick while cruising.
      if (this._massLocked(player, state)) {
        this._drop(DROP_REASONS.MASSLOCK);
      }
    }
  },

  _ensureCruise(state) {
    const p = state.player || (state.player = {});
    if (!p.cruise || typeof p.cruise !== 'object') {
      p.cruise = { phase: 'off', t: 0 };
    }
    return p.cruise;
  },

  _startCharge(cruise) {
    cruise.phase = 'charging';
    cruise.t = 0;
    this.bus.emit('cruise:charging', { playerId: this.state.playerId });
  },

  _drop(reason) {
    const cruise = this._ensureCruise(this.state);
    if (cruise.phase === 'off') return;
    const was = cruise.phase;
    cruise.phase = 'off';
    cruise.t = 0;
    this.bus.emit('cruise:dropped', { reason, was, playerId: this.state.playerId });
  },

  _massLocked(player, state) {
    const list = state.entityList || [];
    for (const e of list) {
      if (!e || e === player || !e.alive) continue;
      if ((e.radius || 0) < MASS_LOCK_ENTITY_RADIUS) continue;
      const dx = e.pos.x - player.pos.x;
      const dz = e.pos.z - player.pos.z;
      if (dx * dx + dz * dz <= MASS_LOCK_RADIUS * MASS_LOCK_RADIUS) return true;
    }
    return false;
  },
};

// Query helpers used by other systems (camera, vfx, flight profile hooks).
export function isCruising(state) {
  const c = state && state.player && state.player.cruise;
  return !!(c && c.phase === 'cruising');
}

export function isCharging(state) {
  const c = state && state.player && state.player.cruise;
  return !!(c && c.phase === 'charging');
}

export function cruiseChargeProgress(state) {
  const c = state && state.player && state.player.cruise;
  if (!c || c.phase !== 'charging') return 0;
  return Math.min(1, c.t / CHARGE_NEEDED);
}

export function cruiseMultipliers(state) {
  const c = state && state.player && state.player.cruise;
  if (!c || c.phase !== 'cruising') return { maxSpeed: 1, accel: 1, turn: 1 };
  return { maxSpeed: 4.0, accel: 2.5, turn: 0.25 };
}
