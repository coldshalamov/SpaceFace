// WANTED heat system (V2 §20b / IMPROVEMENT_IDEAS cut-list #15). Owns state.player.heat — a 0..1
// scalar that measures how hard the law is hunting the player RIGHT NOW. Single writer (§0.6):
// only this system mutates player.heat.
//
// What raises heat:
//   - Killing a non-hostile ship (piracy) — big spike, scaled by victim class
//   - Damaging a non-hostile ship (unprovoked attack) — small chip per hit
//   - Getting busted smuggling contraband — medium spike per bust
//   - A faction going aggro on you — strong signal the law noticed
// What lowers heat:
//   - Clean time. Heat decays slowly while you behave, faster in high-sec (patrols "process" you),
//     frozen while docked (laying low). Roughly: full heat -> clean in ~5-8 min of clean flight.
//
// Outputs:
//   - player.heat (0..1) — the canonical scalar
//   - heat:changed { value } event — HUD/alerts listen to show the WANTED indicator
//   - The lawful "playerWanted" flag on enemies is derived downstream by combat.js at spawn time
//     from this scalar, not written here (heat owns heat; combat owns enemy specs).
//
// Tunables kept conservative so a casual smuggler isn't perma-hunted, but a murderous pirate feels
// real consequences. All clamp at 1.
const HEAT_MAX = 1;
const DECAY_PER_S = 0.0022;        // ~7.5 min to fully cool from full heat, clean flight
const DECAY_HIGHSEC_MULT = 2.4;    // high-sec patrols process you faster
const DECAY_DOCKED = 0;            // frozen while docked (laying low)
const KILL_NONHOSTILE = 0.28;      // piracy kill of a clean ship
const KILL_CLASS_MULT = { station: 1.0, capital: 0.6, large: 0.4, fighter: 0.25, default: 0.15 };
const HIT_NONHOSTILE = 0.012;      // chip per unprovoked hit (capped per second below)
const HIT_CAP_PER_S = 0.06;        // so a beam doesn't max heat in one burst
const BUST_CONTRABAND = 0.16;      // smuggling scan bust
const FactionsAggroAdd = 0.20;     // a faction flipping hostile (the law noticed)

const WANTED_THRESHOLD = 0.15;     // above this, lawful patrols hunt you (playerWanted=true)

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

export const heat = {
  name: 'heat',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    const player = this.state.player;
    if (player && typeof player.heat !== 'number') player.heat = 0;
    this._lastHitT = -1e9;
    this._lastEmit = -1;
    this._burstAccrued = 0;

    const bus = this.bus;

    // Piracy: killing a ship that isn't already hostile to the player. We use the faction system's
    // notion of "is this faction aggro toward the player" as the test for "was this a clean victim."
    bus.on('entity:killed', (p) => this._onKill(p));

    // Unprovoked attacks: chipping a non-hostile ship's hull/shield. Capped per-second so a beam
    // weapon can't spike heat to max instantly.
    bus.on('combat:damage', (p) => this._onDamage(p));

    // Smuggling busts: contraband found on a patrol scan.
    bus.on('contraband:scanned', (p) => {
      if (p && p.found) this._raise(BUST_CONTRABAND, 'smuggling bust');
    });

    // A faction going hostile is the strongest "the law noticed" signal short of a kill.
    bus.on('faction:aggro', () => this._raise(FactionsAggroAdd, 'faction hostile'));
  },

  // Is the victim faction currently hostile to the player? If yes, the kill is legitimate combat,
  // not piracy, and shouldn't raise heat. We read factions state defensively.
  _victimIsHostile(factionId) {
    const f = this.state.factions && factionId != null ? this.state.factions[factionId] : null;
    return !!(f && f.aggro);
  },

  _onKill(p) {
    if (!p || p.killerId !== this.state.playerId) return;
    // Lawful victims (patrol_lawman / factionLawful) are ALWAYS piracy — killing a cop is the
    // clearest criminal act even if you're already hostile to their faction.
    if (p.factionLawful) {
      this._raise(KILL_NONHOSTILE * 1.3, 'lawful kill');
      return;
    }
    if (this._victimIsHostile(p.factionId)) return; // legitimate combat, no heat
    const cls = p.victimClass || 'default';
    const mult = KILL_CLASS_MULT[cls] != null ? KILL_CLASS_MULT[cls] : KILL_CLASS_MULT.default;
    this._raise(KILL_NONHOSTILE * mult, 'piracy kill (' + cls + ')');
  },

  _onDamage(p) {
    if (!p || p.attackerId !== this.state.playerId) return; // only the player's own attacks
    if (p.factionLawful || !this._victimIsHostile(p.factionId)) {
      const now = this.state.simTime;
      if (now - this._lastHitT < 1.0) {
        // within the per-second cap window: only raise if under the burst budget
        if (this._burstAccrued >= HIT_CAP_PER_S) return;
      } else {
        this._burstAccrued = 0;
      }
      this._burstAccrued = (this._burstAccrued || 0) + HIT_NONHOSTILE;
      this._lastHitT = now;
      this._raise(HIT_NONHOSTILE, 'unprovoked hit');
    }
  },

  // Add to heat and emit a changed event (throttled to avoid spamming the HUD every chip).
  _raise(delta, reason) {
    const player = this.state.player;
    if (!player) return;
    const before = player.heat || 0;
    player.heat = clamp01(before + delta);
    if (player.heat !== before) {
      // emit immediately on threshold crossings (WANTED appearing/disappearing) so the HUD reacts
      // crisply, otherwise throttle to once per ~0.4s.
      const crossed = (before < WANTED_THRESHOLD) !== (player.heat < WANTED_THRESHOLD);
      const now = this.state.simTime;
      if (crossed || now - this._lastEmit > 0.4) {
        this._lastEmit = now;
        this.bus.emit('heat:changed', { value: player.heat, reason });
      }
    }
  },

  update(dt, state) {
    const player = state.player;
    if (!player || !player.heat) return; // 0 heat = nothing to decay
    if (state.mode !== 'flight') return; // frozen in menus
    // Docked = laying low (frozen). High-sec decays faster.
    const docked = !!(player.flags && player.flags.docked);
    if (docked) return;
    let rate = DECAY_PER_S;
    const sector = state.world && state.world.currentSectorDef;
    if (sector && typeof sector.security === 'number' && sector.security >= 0.6) rate *= DECAY_HIGHSEC_MULT;
    const before = player.heat;
    player.heat = clamp01(before - rate * dt);
    if (player.heat !== before) {
      const now = state.simTime;
      const crossed = (before < WANTED_THRESHOLD) !== (player.heat < WANTED_THRESHOLD);
      if (crossed || now - this._lastEmit > 0.4) {
        this._lastEmit = now;
        this.bus.emit('heat:changed', { value: player.heat });
      }
    }
  },
};

// Exposed for combat.js / ai.js to derive the lawful playerWanted flag at spawn time and on the fly.
export function isPlayerWanted(state) {
  const h = state.player && state.player.heat;
  return typeof h === 'number' ? h >= WANTED_THRESHOLD : false;
}
export const THRESHOLD = WANTED_THRESHOLD;
