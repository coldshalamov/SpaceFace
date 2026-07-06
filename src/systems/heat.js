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
//   - Escaping the active search zone. Once outside the visible heat radius, WANTED drops one
//     level every few seconds until clean; returning inside the zone resets the escape timer.
//
// Outputs:
//   - player.heat (0..1) — the canonical scalar
//   - player.heatZone — visible search zone state for the radar/HUD
//   - heat:changed { value, level, zone } event — HUD/alerts listen to show WANTED state
//   - The lawful "playerWanted" flag on enemies is derived downstream by combat.js at spawn time
//     from this scalar, not written here (heat owns heat; combat owns enemy specs).
//
// Tunables kept conservative so a casual smuggler isn't perma-hunted, but a murderous pirate feels
// real consequences. All clamp at 1.
const HEAT_MAX = 1;
const KILL_NONHOSTILE = 0.28;      // piracy kill of a clean ship
const KILL_CLASS_MULT = { station: 1.0, capital: 0.6, large: 0.4, fighter: 0.25, default: 0.15 };
const HIT_NONHOSTILE = 0.012;      // chip per unprovoked hit (capped per second below)
const HIT_CAP_PER_S = 0.06;        // so a beam doesn't max heat in one burst
const BUST_CONTRABAND = 0.16;      // smuggling scan bust
const FactionsAggroAdd = 0.20;     // a faction flipping hostile (the law noticed)

const WANTED_THRESHOLD = 0.15;     // above this, lawful patrols hunt you (playerWanted=true)
const HEAT_LEVEL_COUNT = 5;
const HEAT_RADIUS_BY_LEVEL = [0, 1200, 1700, 2300, 3000, 3700];
const HEAT_CLEAR_SECONDS_BY_LEVEL = [0, 5, 6, 7, 8, 10];

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function defaultHeatZone() {
  return {
    active: false,
    center: { x: 0, z: 0 },
    radius: 0,
    level: 0,
    outsideS: 0,
    clearAfterS: 0,
  };
}

function heatZoneSnapshot(zone) {
  return zone ? {
    active: !!zone.active,
    center: { x: zone.center.x || 0, z: zone.center.z || 0 },
    radius: zone.radius || 0,
    level: zone.level || 0,
    outsideS: zone.outsideS || 0,
    clearAfterS: zone.clearAfterS || 0,
  } : defaultHeatZone();
}

function ensureHeatZone(player) {
  if (!player) return defaultHeatZone();
  const zone = player.heatZone && typeof player.heatZone === 'object' ? player.heatZone : defaultHeatZone();
  if (!zone.center || typeof zone.center !== 'object') zone.center = { x: 0, z: 0 };
  if (typeof zone.active !== 'boolean') zone.active = false;
  if (!Number.isFinite(zone.center.x)) zone.center.x = 0;
  if (!Number.isFinite(zone.center.z)) zone.center.z = 0;
  if (!Number.isFinite(zone.radius)) zone.radius = 0;
  if (!Number.isFinite(zone.level)) zone.level = 0;
  if (!Number.isFinite(zone.outsideS)) zone.outsideS = 0;
  if (!Number.isFinite(zone.clearAfterS)) zone.clearAfterS = 0;
  player.heatZone = zone;
  return zone;
}

function playerEntity(state) {
  return state && state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
}

function setZoneCenter(zone, entity) {
  if (!zone || !entity || !entity.pos) return;
  zone.center.x = entity.pos.x || 0;
  zone.center.z = entity.pos.z || 0;
}

function outsideHeatZone(entity, zone) {
  if (!entity || !entity.pos || !zone || !zone.active) return false;
  const dx = entity.pos.x - zone.center.x;
  const dz = entity.pos.z - zone.center.z;
  return dx * dx + dz * dz > zone.radius * zone.radius;
}

function heatValueForLevel(level) {
  if (level <= 0) return 0;
  return Math.max(WANTED_THRESHOLD, Math.min(HEAT_MAX, level / HEAT_LEVEL_COUNT));
}

export const heat = {
  name: 'heat',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    const player = this.state.player;
    if (player && typeof player.heat !== 'number') player.heat = 0;
    if (player) ensureHeatZone(player);
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
    const after = clamp01(before + delta);
    player.heat = after;
    if (after >= WANTED_THRESHOLD) this._refreshZone(true);
    if (player.heat !== before) {
      // emit immediately on threshold crossings (WANTED appearing/disappearing) so the HUD reacts
      // crisply, otherwise throttle to once per ~0.4s.
      const crossed = (before < WANTED_THRESHOLD) !== (player.heat < WANTED_THRESHOLD);
      const now = this.state.simTime || 0;
      if (crossed || now - this._lastEmit > 0.4) {
        this._emitChanged(reason, crossed);
      }
    }
  },

  update(dt, state) {
    const player = state.player;
    if (!player) return;
    const zone = ensureHeatZone(player);
    if (!player.heat) { this._clearZone(); return; }
    const level = heatLevelFor(player.heat);
    if (level <= 0) {
      this._setHeat(0, 'heat cleared');
      return;
    }
    if (state.mode !== 'flight') return; // frozen in menus
    // Docked/menu time is frozen; escaping only advances in live flight.
    const entity = playerEntity(state);
    const docked = !!((player.flags && player.flags.docked) || (entity && entity.flags && entity.flags.docked));
    if (docked) return;
    this._refreshZone(false);
    if (!outsideHeatZone(entity, zone)) {
      zone.outsideS = 0;
      return;
    }
    zone.outsideS += Math.max(0, dt || 0);
    while (zone.active && zone.outsideS >= zone.clearAfterS && heatLevelFor(player.heat) > 0) {
      zone.outsideS -= zone.clearAfterS;
      this._dropOneLevel();
    }
  },

  _refreshZone(recenter) {
    const player = this.state.player;
    if (!player) return;
    const level = heatLevelFor(player.heat || 0);
    const zone = ensureHeatZone(player);
    if (level <= 0) {
      this._clearZone();
      return;
    }
    const entity = playerEntity(this.state);
    if (!zone.active || recenter) setZoneCenter(zone, entity);
    zone.active = true;
    zone.level = level;
    zone.radius = heatRadiusForLevel(level);
    zone.clearAfterS = heatClearSecondsForLevel(level);
    if (!Number.isFinite(zone.outsideS) || recenter) zone.outsideS = 0;
  },

  _dropOneLevel() {
    const player = this.state.player;
    if (!player) return;
    const before = player.heat || 0;
    const beforeLevel = heatLevelFor(before);
    const after = beforeLevel <= 1 ? 0 : heatValueForLevel(beforeLevel - 1);
    this._setHeat(after, 'escaped heat radius');
  },

  _setHeat(value, reason) {
    const player = this.state.player;
    if (!player) return;
    const before = player.heat || 0;
    player.heat = clamp01(value);
    if (player.heat > 0) this._refreshZone(false);
    else this._clearZone();
    if (player.heat !== before) this._emitChanged(reason, true);
  },

  _clearZone() {
    const player = this.state.player;
    if (!player) return;
    const zone = ensureHeatZone(player);
    zone.active = false;
    zone.radius = 0;
    zone.level = 0;
    zone.outsideS = 0;
    zone.clearAfterS = 0;
  },

  _emitChanged(reason, force = false) {
    const now = this.state.simTime || 0;
    if (!force && now - this._lastEmit <= 0.4) return;
    this._lastEmit = now;
    const player = this.state.player || {};
    this.bus.emit('heat:changed', {
      value: player.heat || 0,
      level: heatLevelFor(player.heat || 0),
      zone: heatZoneSnapshot(ensureHeatZone(player)),
      reason,
    });
  },
};

// Exposed for combat.js / ai.js to derive the lawful playerWanted flag at spawn time and on the fly.
export function isPlayerWanted(state) {
  const h = state.player && state.player.heat;
  return typeof h === 'number' ? h >= WANTED_THRESHOLD : false;
}
export function heatLevelFor(value) {
  if (!Number.isFinite(value) || value < WANTED_THRESHOLD) return 0;
  return Math.max(1, Math.min(HEAT_LEVEL_COUNT, Math.ceil(value * HEAT_LEVEL_COUNT)));
}
export function heatRadiusForLevel(level) {
  const i = Math.max(0, Math.min(HEAT_LEVEL_COUNT, Math.round(level || 0)));
  return HEAT_RADIUS_BY_LEVEL[i] || 0;
}
export function heatClearSecondsForLevel(level) {
  const i = Math.max(0, Math.min(HEAT_LEVEL_COUNT, Math.round(level || 0)));
  return HEAT_CLEAR_SECONDS_BY_LEVEL[i] || 0;
}
export const THRESHOLD = WANTED_THRESHOLD;
