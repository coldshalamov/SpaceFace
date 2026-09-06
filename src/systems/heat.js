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
import { isRunSealed } from '../core/runSeal.js';

const HEAT_MAX = 1;
const KILL_NONHOSTILE = 0.28;      // piracy kill of a clean ship
// Combat emits `victimClass: t.data.shipClass || t.type`. Civilian traffic commonly has no
// authored shipClass, so its live class is the generic `ship`. Pricing that through the old
// `default` multiplier produced 0.042 heat, which was immediately below WANTED for a clean hauler
// kill. Authored civilian hulls use frigate/hauler/freighter while ambient traffic often emits the
// generic ship class; all are headline piracy victims. Keep `default` conservative for genuinely
// unclassified entity kinds.
const KILL_CLASS_MULT = {
  station: 1.0,
  capital: 0.6,
  large: 0.4,
  ship: 0.6,
  frigate: 0.6,
  hauler: 0.6,
  freighter: 0.6,
  fighter: 0.25,
  default: 0.15,
};
const HIT_NONHOSTILE = 0.012;      // chip per unprovoked hit (capped per second below)
const HIT_CAP_PER_S = 0.06;        // so a beam doesn't max heat in one burst
const BUST_CONTRABAND = 0.16;      // smuggling scan bust
const FactionsAggroAdd = 0.20;     // a faction flipping hostile (the law noticed)

const WANTED_THRESHOLD = 0.15;     // above this, lawful patrols hunt you (playerWanted=true)
const HEAT_LEVEL_COUNT = 5;
const HEAT_RADIUS_BY_LEVEL = [0, 1200, 1700, 2300, 3000, 3700];
const HEAT_CLEAR_SECONDS_BY_LEVEL = [0, 5, 6, 7, 8, 10];

// PQ-019B — validated law incidents, priced on the same scale as every other crime above. A
// witnessed cargo theft sits between a contraband bust (0.16: passive smuggling, caught on a scan)
// and a piracy kill (0.28: someone died). Openly taking lawful cargo in front of witnesses is the
// more brazen act of the two lesser ones, but nobody was hurt.
const THEFT_INCIDENT = 0.22;
// A validated incident of a kind this table does not price still raises SOMETHING. Silence would
// make every future crime type free until someone remembered to add a row here.
const INCIDENT_HEAT_DEFAULT = 0.12;
const INCIDENT_HEAT_BY_KIND = Object.freeze({ payload_theft: THEFT_INCIDENT });

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

/**
 * Applied-incident ids, READ without creating.
 *
 * The lazy split matters: `check:sim:compare` replays the golden run across a save/restore boundary,
 * and a key that materialized in `init` would exist on one leg and not the other. No law incident is
 * ever reported in the golden scenario, so this object is never built there.
 */
function appliedIncidentIds(player) {
  const ledger = player && player.heatIncidentsApplied;
  return ledger && typeof ledger === 'object' && !Array.isArray(ledger) ? ledger : EMPTY_LEDGER;
}

function ensureAppliedIncidentIds(player) {
  if (!player.heatIncidentsApplied || typeof player.heatIncidentsApplied !== 'object'
    || Array.isArray(player.heatIncidentsApplied)) {
    player.heatIncidentsApplied = {};
  }
  return player.heatIncidentsApplied;
}

const EMPTY_LEDGER = Object.freeze({});

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
    this._resetTransientTiming();

    const bus = this.bus;

    // Piracy: killing a ship that isn't already hostile to the player. Production combat receipts
    // carry scanner's canonical team/context classification; older producers fall back to standing.
    bus.on('entity:killed', (p) => this._onKill(p));

    // Unprovoked attacks: chipping a non-hostile ship's hull/shield. Capped per-second so a beam
    // weapon can't spike heat to max instantly.
    bus.on('combat:damage', (p) => this._onDamage(p));

    // Smuggling busts: contraband found on a patrol scan.
    bus.on('contraband:scanned', (p) => {
      if (p && p.found) this._raise(BUST_CONTRABAND, 'smuggling bust');
    });

    // A faction going hostile is the strongest "the law noticed" signal short of a kill. The same
    // event also announces de-escalation, which must not itself create a fresh WANTED incident.
    bus.on('faction:aggro', (p) => {
      if (p && p.isAggro === false) return;
      this._raise(FactionsAggroAdd, 'faction hostile');
    });

    // These boundaries may move simTime backwards while the system instance survives. Per-burst
    // clocks are transient and must not inherit a future timestamp into a new/restored run.
    bus.on('game:started', () => this._resetTransientTiming());
    bus.on('save:loaded', () => this._resetTransientTiming());

    // Intentional clear (e.g. Ending A record expunge). Sole heat writer path via _setHeat.
    bus.on('heat:clear', (p) => {
      this._setHeat(0, (p && p.reason) || 'heat:clear');
    });

    // PQ-019B: validated law incidents. Heat listens; it is never told what to write. A mission that
    // wants a thief to become WANTED reports the crime to lawSecurity, lawSecurity validates
    // jurisdiction and witnesses, and only an ACCEPTED receipt reaches this listener. There is
    // therefore no mission-side heat write anywhere in the chain — the mission cannot reach
    // player.heat even if it wants to, because the only door is a receipt it cannot sign.
    bus.on('law:reportIncidentReceipt', (p) => this.applyIncidentReceipt(p));
  },

  /**
   * Consume one validated law incident receipt EXACTLY ONCE, through the private `_raise` path that
   * every other heat source already uses.
   *
   * Idempotence is durable: applied receipt ids live on `state.player`, which the save owner
   * serializes wholesale (`_serializePlayer` = clonePlain(player)). A duplicate bus delivery, a
   * replayed effect journal, or a reload followed by a retry all find the id already recorded.
   *
   * Returns `{ applied, reason, incidentReceiptId, delta }` so a caller's effect journal can key on
   * the same fact this system just recorded.
   */
  applyIncidentReceipt(receipt) {
    if (!receipt || typeof receipt !== 'object') {
      return { applied: false, reason: 'no_receipt', incidentReceiptId: null, delta: 0 };
    }
    // Only law signs incidents. A denial, or anything that did not come from the law owner, is not
    // an instruction to raise heat — it is the law explicitly declining to recognize a crime.
    if (receipt.accepted !== true || receipt.source !== 'lawSecurity') {
      return { applied: false, reason: 'not_law_validated', incidentReceiptId: null, delta: 0 };
    }
    if (receipt.validatedWitnessedTheft !== true) {
      return { applied: false, reason: 'not_witnessed', incidentReceiptId: null, delta: 0 };
    }
    const incidentReceiptId = typeof receipt.incidentReceiptId === 'string'
      && receipt.incidentReceiptId.trim().length > 0
      ? receipt.incidentReceiptId.trim()
      : null;
    if (!incidentReceiptId) {
      return { applied: false, reason: 'invalid_receipt_id', incidentReceiptId: null, delta: 0 };
    }
    const player = this.state && this.state.player;
    if (!player) {
      return { applied: false, reason: 'no_player', incidentReceiptId, delta: 0 };
    }
    if (appliedIncidentIds(player)[incidentReceiptId]) {
      return { applied: false, reason: 'already_applied', incidentReceiptId, delta: 0 };
    }

    const delta = INCIDENT_HEAT_BY_KIND[receipt.kind] != null
      ? INCIDENT_HEAT_BY_KIND[receipt.kind]
      : INCIDENT_HEAT_DEFAULT;

    // Record BEFORE mutating. If `_raise` ever throws, the alternative ordering would leave the
    // incident un-recorded and a retry would double-charge; this ordering can at worst under-apply,
    // which is the survivable failure.
    const ledger = ensureAppliedIncidentIds(player);
    ledger[incidentReceiptId] = true;

    this._raise(delta, `law incident (${receipt.kind})`);
    return { applied: true, reason: null, incidentReceiptId, delta };
  },

  // Is the victim faction currently hostile to the player? If yes, the kill is legitimate combat,
  // not piracy, and shouldn't raise heat. We read factions state defensively.
  _victimIsHostile(factionId) {
    const f = this.state.factions && factionId != null ? this.state.factions[factionId] : null;
    return !!(f && f.aggro);
  },

  _receiptTargetIsHostile(payload) {
    if (payload && typeof payload.targetHostileToPlayer === 'boolean') {
      return payload.targetHostileToPlayer;
    }
    // Compatibility for older/synthetic publishers that do not yet carry canonical target truth.
    return this._victimIsHostile(payload && payload.factionId);
  },

  _resetTransientTiming() {
    this._lastHitT = -1e9;
    this._lastEmit = -1e9;
    this._burstAccrued = 0;
  },

  _onKill(p) {
    if (!p || p.killerId !== this.state.playerId) return;
    if (!isWantedHeatVictim(this.state, p, p.id)) return;
    // Lawful victims (patrol_lawman / factionLawful) are ALWAYS piracy — killing a cop is the
    // clearest criminal act even if you're already hostile to their faction.
    if (p.factionLawful) {
      this._raise(KILL_NONHOSTILE * 1.3, 'lawful kill');
      return;
    }
    if (this._receiptTargetIsHostile(p)) return; // legitimate combat, no heat
    const cls = p.victimClass || 'default';
    const mult = KILL_CLASS_MULT[cls] != null ? KILL_CLASS_MULT[cls] : KILL_CLASS_MULT.default;
    this._raise(KILL_NONHOSTILE * mult, 'piracy kill (' + cls + ')');
  },

  _onDamage(p) {
    if (!p || p.attackerId !== this.state.playerId) return; // only the player's own attacks
    if (!isWantedHeatVictim(this.state, p, p.targetId)) return;
    if (p.factionLawful || !this._receiptTargetIsHostile(p)) {
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
    // THE RUN SEAL (PQ-135). Heat is campaign state: it raises WANTED, and WANTED sends law hunters
    // after the player. A Crucible run was accruing it — which both broke the run's own
    // "nothing follows you home" promise AND pointed bounty hunters at an arena, where they would
    // arrive as uninvited bodies competing with the wave for spawn slots.
    if (isRunSealed(this.state)) return;
    const before = player.heat || 0;
    const after = clamp01(before + delta);
    player.heat = after;
    if (after >= WANTED_THRESHOLD) this._refreshZone(true);
    if (player.heat !== before) {
      // emit immediately on threshold crossings (WANTED appearing/disappearing) and on any
      // WANTED-band increase, so HUD/audio presentation reacts crisply to escalations; everything
      // else (in-band chips, decays) throttles to once per ~0.4s. Without the band clause a climb
      // landing inside the throttle window is never emitted, and every level-keyed consumer
      // (radar, audio alarm) stays stale until the next emit.
      const crossed = (before < WANTED_THRESHOLD) !== (player.heat < WANTED_THRESHOLD);
      const bandMoved = heatLevelFor(player.heat) > heatLevelFor(before);
      const now = this.state.simTime || 0;
      if (crossed || bandMoved || now - this._lastEmit > 0.4) {
        this._emitChanged(reason, crossed || bandMoved, before);
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
    // Sealed the same way as _raise. Note this also blocks the DECAY path, which is correct: a run
    // must leave campaign heat exactly as it found it, in both directions.
    if (isRunSealed(this.state)) return;
    const before = player.heat || 0;
    player.heat = clamp01(value);
    if (player.heat > 0) this._refreshZone(false);
    else this._clearZone();
    if (player.heat !== before) this._emitChanged(reason, true, before);
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

  /**
   * Emit heat:changed with edge facts for presentation (GDX-A25).
   * Single writer still owns only player.heat; this enriches the public observation packet so
   * law/heat telegraphs can key the WANTED flip and suspicion intensity without inventing state.
   */
  _emitChanged(reason, force = false, previousValue = null) {
    const now = this.state.simTime || 0;
    if (!force && now - this._lastEmit <= 0.4) return;
    this._lastEmit = now;
    const player = this.state.player || {};
    const value = player.heat || 0;
    const prev = previousValue != null && Number.isFinite(previousValue) ? previousValue : value;
    const wanted = value >= WANTED_THRESHOLD;
    const wasWanted = prev >= WANTED_THRESHOLD;
    this.bus.emit('heat:changed', {
      value,
      previousValue: prev,
      level: heatLevelFor(value),
      zone: heatZoneSnapshot(ensureHeatZone(player)),
      reason,
      wanted,
      wantedCrossed: wanted !== wasWanted,
      // 0..1 approach toward the WANTED gate. 1 at/above threshold. Presentation-only scalar.
      suspicion: value <= 0 ? 0 : Math.min(1, value / WANTED_THRESHOLD),
      threshold: WANTED_THRESHOLD,
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

// WANTED heat is a crime ledger for attacking people and places, not for shooting your own
// plates, mines, mass-seeds, or other deployed devices. Self-hits (impulse charges, whip recoil)
// also must not mint a WANTED incident.
const WANTED_HEAT_VICTIM_TYPES = new Set(['ship', 'drone', 'station']);

function isWantedHeatVictim(state, payload, victimId) {
  if (victimId != null && state && victimId === state.playerId) return false;
  const type = wantedHeatVictimType(state, payload, victimId);
  if (type && !WANTED_HEAT_VICTIM_TYPES.has(type)) return false;
  return true;
}

function wantedHeatVictimType(state, payload, victimId) {
  if (payload && typeof payload.type === 'string' && payload.type) return payload.type;
  const entity = victimId != null && state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(victimId)
    : null;
  return entity && entity.type || null;
}
// PQ-019B: exported so the owner-invariant suite prices heat from the implementation rather than
// from a copy of it, and so tuning has one home.
export const INCIDENT_HEAT = Object.freeze({
  byKind: INCIDENT_HEAT_BY_KIND,
  fallback: INCIDENT_HEAT_DEFAULT,
});
