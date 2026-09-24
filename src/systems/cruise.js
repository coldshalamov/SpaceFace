// Cruise travel tier (spec2/02 §1). V toggles a 3.0 s charge; while engaged the ship gets
// ×4 maxSpeed, ×2.5 main accel and ×0.25 turn. Drops on meaningful damage, manual toggle, boost,
// firing or mass-lock (any entity radius ≥ 60 within 180 wu).
// The system owns state.player.cruise and emits cruise:charging/engaged/dropped{reason}.
//
// Meaningful damage = the hit penetrated to armor/hull, broke the shield, or applied a heavy
// packet. Chip harassment (small-arms fire absorbed by the shield) no longer drops the tier:
// a scout plinking every 0.6 s used to wipe the charge, deny the escape, and keep the yaw
// stumble permanently armed — see docs/GAMEPLAY_FLOW_RISKS.md §3.1 / TUNING_JOBS #2.

import { queryNearbyEntities } from '../core/spatialQuery.js';
import { WEAPONS } from '../data/weapons.js';

const CHARGE_NEEDED = 3.0;          // s (spec §1)
const MASS_LOCK_RADIUS = 180;       // wu
const MASS_LOCK_ENTITY_RADIUS = 60; // wu
const STUMBLE_S = 0.5;
const STUMBLE_REARM_S = 1.5;        // s — a drop inside the window does not re-arm the yaw stumble
const DAMAGE_DROP_FLOOR = 25;       // authored def.dmg — one heavy packet is a real hit at any mercy scale
const CHIP_WINDOW_S = 1.25;         // rolling window for sustained weapon pressure
const CHIP_WINDOW_FLOOR = 36;       // applied dmg in-window — above sustained starter fire (~31), below beams
const DROP_REASONS = Object.freeze({ DAMAGE: 'damage', MASSLOCK: 'masslock', MANUAL: 'manual', SNARED: 'snared' });

// Weapons whose hit IS the verb, not the damage number: EMP/subsystem spikes, latch/status
// payloads, RCS disruptors, and deployable ordnance. Their packet reads as chip damage on the
// damage legs alone, so identity — not magnitude — marks them meaningful. `impulsePerHit` is
// deliberately absent: every gun nudges (physics feedback, impulseProvenance 'starter_pulse_plink'
// etc.), so impulse cannot separate a control verb from an ordinary shot. Derived from the defs
// so a new control verb joins the set automatically.
const CONTROL_WEAPON_IDS = new Set(
  WEAPONS.filter((w) => w && (
    (w.subsystemShare || 0) > 0
    || (w.shieldBypass || 0) > 0
    || (w.rcsDisruptS || 0) > 0
    || w.damageType === 'emp'
    || w.damageType === 'ion'    // snarl web-catch: the hit exists to arrest the hull
    || !!w.deployKind
    || (Array.isArray(w.statuses) && w.statuses.length > 0)
  )).map((w) => w.id),
);

const WEAPON_BY_ID = new Map(WEAPONS.filter((w) => w && w.id).map((w) => [w.id, w]));

export const cruise = {
  name: 'cruise',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._wasCruiseAction = false;

    this.bus.on('combat:damage', (p) => {
      if (!p || p.targetId !== this.state.playerId) return;
      if (!this._isMeaningfulHit(p)) return;
      this._drop(DROP_REASONS.DAMAGE);
    });
    this.bus.on('ship:boostStart', (p) => {
      if (p && p.shipId === this.state.playerId) this._cancelIfCharging(DROP_REASONS.DAMAGE);
    });
    this.bus.on('combat:fire', (p) => {
      if (p && p.ownerId === this.state.playerId) this._cancelIfCharging(DROP_REASONS.DAMAGE);
    });
    // Interdiction hook (encounter director ambush shape): an external snare drops cruise with
    // the full SNARED stumble. Only meaningful while cruising — otherwise a strict no-op.
    this.bus.on('cruise:snareRequest', (p) => {
      const c = this._ensureCruise(this.state);
      if (c.phase === 'cruising') this._drop(DROP_REASONS.SNARED, p && p.sourceId);
    });
  },

  update(dt, state) {
    if (state.mode !== 'flight') return;
    const player = state.entities.get(state.playerId);
    if (!player || !player.alive) return;

    const cruise = this._ensureCruise(state);
    if (cruise.stumbleT > 0) cruise.stumbleT = Math.max(0, cruise.stumbleT - dt);
    if (cruise.stumbleCdT > 0) cruise.stumbleCdT = Math.max(0, cruise.stumbleCdT - dt);
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
      p.cruise = { phase: 'off', t: 0, stumbleT: 0, stumbleCdT: 0 };
    }
    if (!Number.isFinite(p.cruise.stumbleT)) p.cruise.stumbleT = 0;
    if (!Number.isFinite(p.cruise.stumbleCdT)) p.cruise.stumbleCdT = 0;
    return p.cruise;
  },

  _startCharge(cruise) {
    cruise.phase = 'charging';
    cruise.t = 0;
    this.bus.emit('cruise:charging', { playerId: this.state.playerId });
  },

  // A hit is meaningful when it penetrates to armor/hull, breaks the shield, is a heavy authored
  // packet (rawTotal — difficulty mercy scaling must not make a railgun slug read as chip),
  // carries a control payload (EMP/subsystem/snarl/disruptor verbs — the hit exists to stop
  // you), arrives from a non-weapon origin (hazards, reentry, mines, wear, thrown mass —
  // environmental damage is never chip), or is sustained weapon pressure: continuous emitters
  // (beams, rof volleys) ship dmg×dt per-tick packets that individually read as chip, so the
  // window judges the pressure the shield is actually absorbing. Isolated plinks do neither
  // and do not touch the travel tier (charge or cruise).
  _isMeaningfulHit(p) {
    const kind = p.origin && p.origin.kind;
    if (kind && kind !== 'weapon') return true;
    if ((p.hullDamage || 0) > 0 || (p.armorDamage || 0) > 0) return true;
    if (p.brokeShield) return true;
    if (p.emp === true) return true;
    if (p.weaponId && CONTROL_WEAPON_IDS.has(p.weaponId)) return true;
    // Per-packet size is judged on the authored def.dmg — `rawTotal`/`applied` are already
    // difficulty- and directional-scaled, so mercy scaling would silently un-arm the floor.
    // Continuous defs ship per-second dmg (per-tick packets stay small on purpose — the
    // pressure window below owns them). Unresolvable weapon ids fall back to rawTotal.
    const def = p.weaponId ? WEAPON_BY_ID.get(p.weaponId) : null;
    const authored = def && !def.continuous ? (def.dmg || 0)
      : (Number.isFinite(p.rawTotal) ? p.rawTotal
      : (Number.isFinite(p.amount) ? p.amount : 0));
    if (authored >= DAMAGE_DROP_FLOOR) return true;
    const applied = Number.isFinite(p.applied) ? p.applied
      : (Number.isFinite(p.amount) ? p.amount : 0);
    return this._recordWeaponPressure(applied) >= CHIP_WINDOW_FLOOR;
  },

  // Rolling sum of applied weapon damage over the last CHIP_WINDOW_S seconds of sim time.
  // Embedders without simTime get a synthetic per-event clock (~tick) so the window still works.
  _recordWeaponPressure(applied) {
    const c = this._ensureCruise(this.state);
    const log = c.hitLog || (c.hitLog = []);
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime
      : (this._pressureT = (this._pressureT || 0) + 1 / 60);
    log.push({ t: now, amt: applied });
    // Prune both tails: entries older than the window AND entries stamped in the future —
    // a save load can regress simTime while an old hitLog (serialized on player.cruise)
    // survives the merge, and stale future entries would otherwise poison every later sum.
    const cutoff = now - CHIP_WINDOW_S;
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].t < cutoff || log[i].t > now) log.splice(i, 1);
    }
    let sum = 0;
    for (let j = 0; j < log.length; j++) sum += log[j].amt;
    return sum;
  },

  _drop(reason, sourceId = null) {
    const cruise = this._ensureCruise(this.state);
    if (cruise.phase === 'off') return;
    const was = cruise.phase;
    cruise.phase = 'off';
    cruise.t = 0;
    // Re-arm cooldown: a drop inside the window does not stack a second yaw stumble — under
    // sustained real fire the stick otherwise stays spongy for as long as the hits keep landing.
    // The authored snare always stumbles; the interdiction beat is supposed to be felt.
    if (reason === DROP_REASONS.SNARED || cruise.stumbleCdT <= 0) {
      cruise.stumbleT = STUMBLE_S;
      cruise.stumbleCdT = STUMBLE_REARM_S;
    }
    if (reason === DROP_REASONS.SNARED) this.bus.emit('cruise:snared', { sourceId, playerId: this.state.playerId });
    this.bus.emit('cruise:dropped', { reason, was, playerId: this.state.playerId, snare: reason === DROP_REASONS.SNARED });
  },

  _cancelIfCharging(reason) {
    const cruise = this._ensureCruise(this.state);
    if (cruise.phase === 'charging') this._drop(reason);
  },

  _massLocked(player, state) {
    const hits = this._massLockScratch || (this._massLockScratch = []);
    const fallback = (state.entityIndex && Array.isArray(state.entityIndex.collidables)
      ? state.entityIndex.collidables
      : state.entityList) || [];
    const list = queryNearbyEntities(state, player.pos, MASS_LOCK_RADIUS, hits, fallback);
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e || e === player || !e.alive) continue;
      if ((e.radius || 0) < MASS_LOCK_ENTITY_RADIUS) continue;
      if (!e.pos) continue;
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
