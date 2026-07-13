// Cloak & sensor stealth (Wave M2 §4.2, design/revamp/MASSLINE_PHYSICS_IDENTITY.md).
//
// Module-activated stealth with an energy bar and a DYNAMIC detection-radius ring: thrusting,
// boosting and reeling grow the ring; firing breaks the cloak outright; coasting dark shrinks it
// to the module's floor — which is the beautiful part: it makes Newtonian drift purposeful. Cut
// engines, commit to a ballistic arc, and glide through the ambush.
//
// Honest perception: the ONLY gameplay effect is the aiPorts sensor-contact gate (a cloaked
// player outside `radius` is never made a contact, so tactical AI genuinely cannot target him).
// No AI reads around the gate; nothing here rewrites hostility. Runtime lives at
// state.massline2.cloak (unsaved; reload = decloaked with a full charge — noted in the ledger).
// Fitted-module detection reads the owned-ship fittings directly so ships.js's derived shape is
// untouched (that object is snapshot-sensitive in the golden).
import { massline2Flag } from '../data/featureFlags.js';
import { MODULES } from '../data/modules.js';

// --- Dials (design doc §12) -----------------------------------------------------------------
const CLOAK_MIN_ENGAGE = 0.12;      // energy floor to engage
const CLOAK_ACTIVITY_EASE = 2.6;    // 1/s — how fast the ring eases toward its activity target
const CLOAK_THRUST_GROW = 1.9;      // radius multiplier contribution at full thrust
const CLOAK_BOOST_GROW = 3.2;       // boost is LOUD
const CLOAK_REEL_GROW = 0.9;        // winching the massline hums
const CLOAK_BREAK_ON_FIRE = true;   // firing does not grow the ring — it drops the cloak

const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));

export const cloak = {
  id: 'cloak',
  name: 'cloak',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._unsubs = [];
    if (this.bus && typeof this.bus.on === 'function') {
      if (CLOAK_BREAK_ON_FIRE) {
        this._unsubs.push(this.bus.on('combat:fire', (p) => {
          if (p && p.ownerId === this.state.playerId) this._drop('fired');
        }));
      }
      for (const event of ['save:restoring', 'game:started', 'dock:docked', 'player:death']) {
        this._unsubs.push(this.bus.on(event, () => this._drop(null)));
      }
    }
  },

  destroy() {
    for (const off of this._unsubs || []) { if (typeof off === 'function') off(); }
    this._unsubs = [];
  },

  update(dt, state) {
    const runtime = ensureCloak(state);
    if (!massline2Flag('cloak') || state.mode !== 'flight') {
      if (runtime.active) this._drop(null);
      return;
    }
    const step = Math.max(0, Number(dt) || 0);
    const mod = fittedCloakModule(state);
    runtime.available = !!mod;
    if (!mod) {
      if (runtime.active) this._drop(null);
      runtime.energy = Math.min(1, runtime.energy + 0.1 * step);
      return;
    }

    const drain = positive(mod.mods.cloakDrainPerS, 0.09);
    const recharge = positive(mod.mods.cloakRechargePerS, 0.06);
    const base = positive(mod.mods.cloakBaseRadius, 320);
    runtime.baseRadius = base;

    const actions = state.input && state.input.actions;
    if (actions && actions.cloakToggle) {
      if (runtime.active) this._drop('toggled');
      else if (runtime.energy >= CLOAK_MIN_ENGAGE) this._engage(state, base);
      else if (this.bus) this.bus.emit('toast', { text: 'Cloak charge too low', kind: 'info', ttl: 2 });
    }

    if (!runtime.active) {
      runtime.energy = Math.min(1, runtime.energy + recharge * step);
      runtime.radius = base;
      return;
    }

    runtime.energy = Math.max(0, runtime.energy - drain * step);
    if (runtime.energy <= 0) { this._drop('depleted'); return; }

    // The signature ring: quiet drift = the floor; every erg of activity grows it. The ease (not
    // a snap) means a burst of thrust lingers on the sensors for a moment — commit to the coast.
    const inp = state.input || {};
    const tether = state.player && state.player.tether;
    let grow = 0;
    grow += Math.min(1, Math.abs(finite(inp.moveZ)) + Math.abs(finite(inp.moveX)) + Math.abs(finite(inp.turnIntent)) * 0.35) * CLOAK_THRUST_GROW;
    if (inp.boost) grow += CLOAK_BOOST_GROW;
    if (tether && tether.reeling) grow += CLOAK_REEL_GROW;
    const target = base * (1 + grow);
    const ease = 1 - Math.exp(-CLOAK_ACTIVITY_EASE * step);
    runtime.radius += (target - runtime.radius) * ease;
  },

  _engage(state, baseRadius) {
    const runtime = ensureCloak(state);
    runtime.active = true;
    runtime.radius = baseRadius;
    if (this.bus) {
      this.bus.emit('cloak:engaged', { radius: baseRadius, energy: runtime.energy });
      this.bus.emit('audio:cue', { id: 'massline.cloakOn' });
    }
  },

  _drop(reason) {
    const state = this.state;
    const runtime = state ? ensureCloak(state) : null;
    if (!runtime || !runtime.active) return;
    runtime.active = false;
    if (this.bus && reason) {
      this.bus.emit('cloak:dropped', { reason, energy: runtime.energy });
      this.bus.emit('audio:cue', { id: 'massline.cloakOff' });
    }
  },
};

/** Strongest fitted cloak module on the active ship, or null. Reads the owned-ship fittings
 *  record directly (state.player.ownedShips[activeShipIndex].fittings — an array of module def
 *  ids parallel to the hull's slots). */
export function fittedCloakModule(state) {
  const p = state && state.player;
  const ship = p && Array.isArray(p.ownedShips) ? p.ownedShips[p.activeShipIndex] : null;
  const fittings = ship && Array.isArray(ship.fittings) ? ship.fittings : null;
  if (!fittings) return null;
  let best = null;
  for (const defId of fittings) {
    if (!defId) continue;
    const def = MODULE_BY_ID.get(defId);
    const radius = def && def.mods && def.mods.cloakBaseRadius;
    if (!Number.isFinite(radius) || radius <= 0) continue;
    // Smaller detection radius = better cloak; the best module wins (no stacking).
    if (!best || radius < best.mods.cloakBaseRadius) best = def;
  }
  return best;
}

function ensureCloak(state) {
  const root = state.massline2 || (state.massline2 = {});
  if (!root.cloak) {
    root.cloak = { available: false, active: false, energy: 1, radius: 0, baseRadius: 0 };
  }
  return root.cloak;
}

function positive(v, fb) { return Number.isFinite(v) && v > 0 ? v : fb; }
function finite(v, fb = 0) { return Number.isFinite(v) ? v : fb; }
