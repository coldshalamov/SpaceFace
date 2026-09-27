// Cloak & sensor stealth (Wave M2 §4.2, design/revamp/MASSLINE_PHYSICS_IDENTITY.md).
//
// Module-activated stealth with an energy bar and a DYNAMIC detection-radius ring: thrusting,
// boosting and reeling grow the ring; firing breaks the cloak outright; coasting dark shrinks it
// to the module's floor — which is the beautiful part: it makes Newtonian drift purposeful. Cut
// engines, commit to a ballistic arc, and glide through the ambush.
//
// Cloak is a VERB, not a flag. Engaging mid-fight matters to everything that was already
// tracking you, through the single shared gate cloakHidesEntityFrom():
//   • aiPorts' sensor seam: a cloak-hidden ship never becomes a NEW contact, and an established
//     contact fades on a dead-reckoned last fix over ~2 s (the per-observer ledger lives at
//     state.massline2.cloakTracks, runtime-only) — the ship goes dark, it does not teleport.
//   • weapons: a missile lock on a dark target bleeds faster than ordinary cone-loss until it
//     drops, and in-flight seekers lose guidance quality to a dumb ballistic drift.
//   • scanner counterplay: a 'scan:pulse' inside the sweep radius BURNS a cloak open for
//     ~1.6 s (revealUntil). The event belongs to another lane, so this side only subscribes;
//     for the player the live ring also blooms so raw-radius readers (patrol scan seam, the
//     HUD ring) see the burn.
// Symmetric: the player's runtime is state.massline2.cloak; any NPC with entity.data.cloak
// ({ active, radius }) plays by identical rules — spawn/mission/AI producers own activation.
// No AI reads around the gate; nothing here rewrites hostility. Runtime is unsaved (reload =
// decloaked with a full charge — noted in the ledger). Fitted-module detection reads the
// owned-ship fittings directly so ships.js's derived shape stays untouched.
import { massline2Flag } from '../data/featureFlags.js';
import { MODULES } from '../data/modules.js';

// --- Dials (design doc §12) -----------------------------------------------------------------
const CLOAK_MIN_ENGAGE = 0.12;      // energy floor to engage
const CLOAK_ACTIVITY_EASE = 2.6;    // 1/s — how fast the ring eases toward its activity target
const CLOAK_THRUST_GROW = 1.9;      // radius multiplier contribution at full thrust
const CLOAK_BOOST_GROW = 3.2;       // boost is LOUD
const CLOAK_REEL_GROW = 0.9;        // winching the massline hums
const CLOAK_BREAK_ON_FIRE = true;   // firing does not grow the ring — it drops the cloak
// --- Interplay dials (cloak-as-verb) ---------------------------------------------------------
const CLOAK_SCAN_REVEAL_S = 1.6;    // a pulse inside its sweep burns the cloak open this long
const CLOAK_SCAN_BURN_RADIUS = 4200; // the player's ring blooms past sensor envelopes while burned
const SCAN_PULSE_RADIUS_WU = 1200;   // mirrors scanner.js NEAR_SCAN_RADIUS; payload.radius wins
                                     // when the event grows the field

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
          if (!p || p.ownerId == null) return;
          if (p.ownerId === this.state.playerId) { this._drop('fired'); return; }
          // Same rule for a cloaked NPC: firing breaks its cloak. Runtime is data-only for NPCs
          // (their producer owns charge bookkeeping), and cloak:dropped is a player-facing
          // receipt (VFX consumers hard-wire targetId=playerId) — so the NPC drop is silent.
          const entity = this.state.entities && typeof this.state.entities.get === 'function'
            ? this.state.entities.get(p.ownerId)
            : null;
          const rt = entity && cloakRuntimeFor(this.state, entity);
          if (rt && rt.active === true) {
            // The burn stamp (revealUntil) stays: inert while decloaked, still binding on a
            // re-engage inside the window — firing cannot flicker-dodge the pulse.
            rt.active = false;
          }
        }));
      }
      // save:restoring reseats the whole entity-id space AND rewinds the sim clock: a leftover
      // burn stamp could land back inside its own window on the next engage, and a ledger row
      // filed under an old id would ghost whoever inherits it. Drop the cloak, the time
      // stamps, and the fade ledger together.
      this._unsubs.push(this.bus.on('save:restoring', () => {
        this._drop(null);
        const rt = this.state && this.state.massline2 && this.state.massline2.cloak;
        if (rt) { delete rt.revealUntil; delete rt.engagedAt; }
        this._clearCloakTracks();
      }));
      for (const event of ['game:started', 'dock:docked', 'player:death']) {
        this._unsubs.push(this.bus.on(event, () => this._drop(null)));
      }
      this._unsubs.push(this.bus.on('game:new', () => this.newGame()));
      this._unsubs.push(this.bus.on('game:newGame', () => this.newGame()));
      // Id recycling is the ledger's failure mode for the whole run, not only on load: every
      // removal (swept corpse, sector despawn, TTL) queues this receipt. Drop the departed
      // observer's own table plus every other observer's fix filed under that id.
      this._unsubs.push(this.bus.on('entity:destroyed', (p) => this._dropCloakTrack(p && p.id)));
      // Scanner counterplay (another lane owns scanner.js — cloak only listens): an active
      // pulse burns every cloak inside its sweep open for a bounded window.
      this._unsubs.push(this.bus.on('scan:pulse', (p) => this._onScanPulse(p)));
    }
  },

  newGame() {
    if (!this.state) return;
    const runtime = ensureCloak(this.state);
    runtime.active = false;
    runtime.energy = 1;
    runtime.radius = 0;
    runtime.available = false;
    delete runtime.revealUntil;
    delete runtime.engagedAt;
    // The per-observer contact-fade ledger is perception runtime, not memory — a fresh run
    // starts with nobody holding a ghost of a ship that no longer exists.
    this._clearCloakTracks();
  },

  /** The fade ledger is sim-runtime truth keyed by recycled entity ids — never serialized,
   *  cleared wholesale on new game and save restore. */
  _clearCloakTracks() {
    const root = this.state && this.state.massline2;
    const ledger = root && root.cloakTracks;
    if (ledger && typeof ledger.clear === 'function') ledger.clear();
  },

  /** One entity left the world — drop its observer table and every fix filed under its id
   *  before a different hull inherits them. */
  _dropCloakTrack(id) {
    if (id == null) return;
    const ledger = this.state && this.state.massline2 && this.state.massline2.cloakTracks;
    if (!ledger || typeof ledger.delete !== 'function') return;
    ledger.delete(id);
    for (const tracks of ledger.values()) {
      if (tracks && typeof tracks.delete === 'function') tracks.delete(id);
    }
  },

  destroy() {
    for (const off of this._unsubs || []) { if (typeof off === 'function') off(); }
    this._unsubs = [];
  },

  update(dt, state) {
    const runtime = ensureCloak(state);
    if (!cloakEnabledForState(state) || state.mode !== 'flight') {
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
    runtime.engagedAt = cloakTimeS(state);
    // A still-open scan burn rides the re-engage — flicking the cloak off and on inside the
    // window cannot shake the pulse's fix. Expired stamps are dead weight.
    if (!(Number.isFinite(runtime.revealUntil) && cloakTimeS(state) < runtime.revealUntil)) {
      delete runtime.revealUntil;
    }
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
    // revealUntil survives the drop: inert while decloaked, still binding if the pilot
    // re-engages inside the burn window — a toggle flicker cannot dodge the pulse.
    if (this.bus && reason) {
      this.bus.emit('cloak:dropped', { reason, energy: runtime.energy });
      this.bus.emit('audio:cue', { id: 'massline.cloakOff' });
    }
  },

  // The counterplay verb: an active scanner pulse burns through every cloak inside its sweep —
  // the ping is loud, so a cloaked ship inside the radius lights up on every sensor for a moment
  // (and the CLOAKED PLAYER lights up too: pinging while dark costs you the dark). The reveal is
  // a bounded window (revealUntil) honored by cloakHidesEntityFrom, which is the single gate
  // aiPorts contacts, weapon locks, and in-flight seekers all share — one write, every seam.
  //
  // scanner.js today emits 'scan:pulse' with only { pos }; the sweep radius defaults to its
  // NEAR_SCAN_RADIUS constant. If the event grows an explicit `radius` field it wins verbatim.
  _onScanPulse(payload) {
    const state = this.state;
    if (!state || !cloakEnabledForState(state)) return;
    const origin = payload && payload.pos;
    if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.z)) return;
    const radius = Number.isFinite(payload && payload.radius) && payload.radius > 0
      ? payload.radius
      : SCAN_PULSE_RADIUS_WU;
    const now = cloakTimeS(state);
    const r2 = radius * radius;
    for (const entity of cloakCandidateEntities(state)) {
      if (!entity || !entity.pos) continue;
      const runtime = cloakRuntimeFor(state, entity);
      if (!runtime || runtime.active !== true) continue;
      const dx = finite(entity.pos.x) - origin.x;
      const dz = finite(entity.pos.z) - origin.z;
      if (dx * dx + dz * dz > r2) continue;
      runtime.revealUntil = Math.max(
        Number.isFinite(runtime.revealUntil) ? runtime.revealUntil : 0,
        now + CLOAK_SCAN_REVEAL_S,
      );
      if (entity.id === state.playerId) {
        // Bloom the live ring so raw-radius readers — the patrol-scan seam and the HUD ring —
        // see the burn without a second channel; the activity ease walks it back down.
        runtime.radius = Math.max(
          Number.isFinite(runtime.radius) ? runtime.radius : 0,
          CLOAK_SCAN_BURN_RADIUS,
        );
      }
      if (this.bus) {
        this.bus.emit('cloak:burned', {
          entityId: entity.id,
          until: runtime.revealUntil,
          x: entity.pos.x,
          z: entity.pos.z,
        });
      }
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

/** Every entity worth a cloak read on a burn sweep — the live entity map, else the list. */
function cloakCandidateEntities(state) {
  if (state.entities && typeof state.entities.values === 'function') return state.entities.values();
  return Array.isArray(state.entityList) ? state.entityList : [];
}

/**
 * The cloak runtime for an entity — the player's module bar lives on state.massline2.cloak, an
 * NPC's on entity.data.cloak ({ active, radius, baseRadius?, revealUntil? }). Same shape, same
 * rules: that symmetry is what lets a cloaked raider and the cloaked player obey one contract.
 */
export function cloakRuntimeFor(state, entity) {
  if (!state || !entity) return null;
  if (entity.id === state.playerId) return state.massline2 && state.massline2.cloak;
  const data = entity.data;
  return data && data.cloak && typeof data.cloak === 'object' ? data.cloak : null;
}

/** NPC-side engage seam: a producer (spawner, mission, AI rule) calls this once to put a ship
 *  dark; every interplay seam below then treats it exactly like the player's module cloak.
 *  `nowS` (state.simTime) stamps engagedAt for the fade ledger when the caller has the sim
 *  clock; an unexpired revealUntil rides the re-engage, so re-cloaking inside a scan burn
 *  stays lit rather than dodging the window. */
export function engageEntityCloak(entity, radius = 320, nowS) {
  const data = entity.data || (entity.data = {});
  const base = Number.isFinite(radius) && radius > 0 ? radius : 320;
  const prev = data.cloak;
  const rt = { active: true, radius: base, baseRadius: base };
  if (Number.isFinite(nowS)) rt.engagedAt = nowS;
  if (prev && Number.isFinite(prev.revealUntil)) rt.revealUntil = prev.revealUntil;
  data.cloak = rt;
  return rt;
}

/** The cloak system's clock: simTime everywhere it exists; tick/60 keeps headless fixtures that
 *  never advance simTime deterministic instead of freezing every fade at age zero. */
export function cloakTimeS(state) {
  if (state && Number.isFinite(state.simTime)) return state.simTime;
  return state && Number.isInteger(state.tick) ? state.tick / 60 : 0;
}

/**
 * The ONE cloak perception gate (Wave M2 §4.2). True when `target`'s cloak runtime is active and
 * `observer` sits OUTSIDE the live detection radius. A scan-pulse burn (revealUntil) punches the
 * window open — while it lasts the cloak hides nothing from anyone. Symmetric for the player
 * (state.massline2.cloak) and NPCs (entity.data.cloak); flag-gated so headless contract runs
 * never take the branch.
 */
export function cloakHidesEntityFrom(state, observer, target) {
  if (!cloakEnabledForState(state)) return false;
  const runtime = cloakRuntimeFor(state, target);
  if (!runtime || runtime.active !== true || !(runtime.radius > 0)) return false;
  if (Number.isFinite(runtime.revealUntil) && cloakTimeS(state) < runtime.revealUntil) return false;
  if (!observer || !observer.pos || !target || !target.pos) return false;
  const dx = finite(observer.pos.x) - finite(target.pos.x);
  const dz = finite(observer.pos.z) - finite(target.pos.z);
  return (dx * dx + dz * dz) > runtime.radius * runtime.radius;
}

/** Instance-aware flag read — honors state.runtime.features profiles (headless contract runs,
 *  per-session flag tables) and falls back to the global map when no profile is installed. */
function cloakEnabledForState(state) {
  const features = state && state.runtime && state.runtime.features;
  return massline2Flag('cloak', features);
}

function positive(v, fb) { return Number.isFinite(v) && v > 0 ? v : fb; }
function finite(v, fb = 0) { return Number.isFinite(v) ? v : fb; }
