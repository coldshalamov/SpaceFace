// ships system — owns ship/module/tech runtime: derived-stat computation (the single source of
// truth other systems read), fitting (fit/unfit), shipyard buy/sell, and tech research.
// ARCHITECTURE refs: §0.6 (ships is sole writer of derived stats), §0.10 (Kestrel starter),
// §0.18 (fitting rule), §3.4.1 (entity shape), §4.4 (event table). Pure-data sources:
//   SHIPS, WEAPONS, MODULES, TECH_NODES, BEAMS, NEW_GAME.
//
// getDerivedStats() and makeShipEntitySpec() are exported as pure-ish builders so other systems
// (save/newGame, render previews, UI stat readouts) can call them without going through the bus.
import { SHIPS } from '../data/ships.js';
import { WEAPONS } from '../data/weapons.js';
import { MODULES } from '../data/modules.js';
import { TECH_NODES } from '../data/tech.js';
import { BEAMS } from '../data/mining.js';
import { NEW_GAME } from '../data/newGameDefaults.js';

// ---- catalog lookup tables (built once at module load) ------------------------------------
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));
const TECH_BY_ID = new Map(TECH_NODES.map((t) => [t.id, t]));
const BEAM_BY_ID = new Map(BEAMS.map((b) => [b.id, b]));
// any fittable def (weapon OR module) by id
function defById(id) { return MODULE_BY_ID.get(id) || WEAPON_BY_ID.get(id) || null; }

const SIZE_RANK = { S: 1, M: 2, L: 3 };
const SLOT_TYPES = ['weapon', 'shield', 'engine', 'cargo', 'mining', 'utility'];

// Legacy fallback for pre-explicit-loadout saves. NEW_GAME now fits this weapon directly; the
// fallback keeps old saves playable without letting the current starter gun hide from loadout UI.
const STARTER_WEAPON_ID = 'wpn_pulse_laser_s';
const DEFAULT_MINING_BEAM_TIER = 'beam_mk1'; // §0.10 Kestrel mines at 18 ore-HP/s

// ---- Weapon hardpoint facings (Phase 2) -----------------------------------------------------
// A hardpoint's facing is a base world angle offset from the nose. front faces forward, rear aft,
// left/right are broadsides, turret is omni (tracks within its turretArcDeg). A fixed hardpoint
// fires along (nose + facingAngle) and gimbal-assists toward the aim direction within GIMBAL_ARC.
export const FACING_ANGLE = { front: 0, right: Math.PI / 2, rear: Math.PI, left: -Math.PI / 2, turret: 0 };
export const GIMBAL_ARC_DEFAULT = 22 * Math.PI / 180;   // ~22° half-angle gimbal cone for fixed guns
// Muzzle offset per facing (in ship-radius fractions) so shots visibly leave the hull at the mount.
export const FACING_OFFSET = { front: [0.8, 0], right: [0.1, 0.6], rear: [-0.8, 0], left: [0.1, -0.6], turret: [0.5, 0] };

/** Normalize a weapon-slot entry (bare size OR {size, facing}) into {size, facing}. */
function weaponSlotSpec(entry) {
  if (typeof entry === 'string') return { size: entry, facing: 'front' };
  if (entry && typeof entry === 'object') return { size: entry.size || 'S', facing: entry.facing || 'front' };
  return { size: 'S', facing: 'front' };
}

// Handling / mass formulas. flight.js uses entity.thrust as a per-axis accel coefficient and
// vel += (a - drag*vel)*dt, so real terminal ~= thrust/drag; maxSpeed is the safety clamp.
// Constants are tuned so a fresh Kestrel (mass 18 + ion+booster+laser modules) lands on the
// current bootstrap feel: thrust~48, turnRate~3.0, maxSpeed~135, drag~1.25.
const BASE_TURN = 4.4;     // rad/s reference (before handling/mass/turnMult)
const SPEED_SCALE = 2.6;   // engine.topSpeed -> maxSpeed clamp scale
const THRUST_SCALE = 0.99; // engine.topSpeed -> thrust accel scale
const PLAYER_TURN_RATE_MULT = 0.78;
const PLAYER_TURN_RATE_CAP = 3.8;

const FLIGHT_CLASS_TUNING = {
  scout: { accel: 1.05, strafe: 0.58, turn: 1.08, brake: 1.1, assist: 1.15, inertia: 0.92 },
  fighter: { accel: 1.18, strafe: 0.68, turn: 1.28, brake: 1.18, assist: 1.25, inertia: 0.75 },
  miner: { accel: 0.92, strafe: 0.46, turn: 0.82, brake: 0.95, assist: 1.18, inertia: 1.12 },
  hauler: { accel: 0.72, strafe: 0.36, turn: 0.58, brake: 0.86, assist: 1.08, inertia: 1.35 },
  capital: { accel: 0.42, strafe: 0.24, turn: 0.34, brake: 0.62, assist: 0.92, inertia: 1.85 },
};

/** Build the canonical list of slots [{type,size,index,facing?}] for a ship def, in a stable order
 *  (weapon, shield, engine, cargo, mining, utility) so fittings[] indices are deterministic.
 *  Weapon slots carry a `facing` ('front'|'left'|'right'|'rear'|'turret'); other slot types don't. */
export function buildSlotList(shipDef) {
  const slots = [];
  for (const type of SLOT_TYPES) {
    const arr = (shipDef.slots && shipDef.slots[type]) || [];
    for (const entry of arr) {
      const slot = { type, size: (typeof entry === 'string') ? entry : (entry && entry.size) || 'S', index: slots.length };
      if (type === 'weapon') slot.facing = weaponSlotSpec(entry).facing;
      slots.push(slot);
    }
  }
  return slots;
}

/** §0.18 fitting rule: a module fits a slot iff types match and the slot is large enough. */
export function fits(slot, def) {
  if (!slot || !def) return false;
  return slot.type === def.slotType && SIZE_RANK[slot.size] >= SIZE_RANK[def.size];
}

/** Resolve a fittings array (defIds | null, parallel to slots) into the equipped defs per slot. */
function resolveFittings(shipDef, fittings) {
  const slots = buildSlotList(shipDef);
  const out = [];
  for (let i = 0; i < slots.length; i++) {
    const id = fittings && fittings[i];
    out.push(id ? defById(id) : null);
  }
  return { slots, equipped: out };
}

/** Build a render-facing fittings array (defId | null, parallel to buildSlotList order).
 *  NPC fittings pass through unchanged; their weapons[] are already real fittings. The only
 *  backfill path is the legacy pre-explicit starter-gun fallback for old player saves. */
function fittingsForView(shipDef, fittings, weapons) {
  const slots = buildSlotList(shipDef);
  const view = new Array(slots.length).fill(null);
  for (let i = 0; i < slots.length; i++) {
    const id = fittings && fittings[i];
    if (id) view[i] = id;
  }
  // If a legacy fallback weapon resolved but the weapon slot is empty in fittings, backfill the
  // first matching weapon slot so the barrel renders. Current NEW_GAME loadouts fit it directly.
  if (weapons && weapons.length) {
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].type !== 'weapon' || view[i]) continue;
      const w = weapons.find((ww) => ww.slotIndex === i);
      if (w && w.defId) { view[i] = w.defId; }
    }
  }
  return view;
}

/** Re-derive a render-facing fittings array purely from a resolved weapons[] list. Used by NPC
 *  spawners (combat/traffic) that bypass the fittings path and assign weapons directly — calling
 *  this keeps their `data.fittings` in sync so their barrels render at the right hardpoints. */
export function fittingsFromWeapons(shipDef, weapons) {
  return fittingsForView(shipDef, [], weapons || []);
}

function pickEngine(equipped) {
  for (const d of equipped) if (d && d.slotType === 'engine') return d;
  return null;
}

// Default engine modifiers when no engine module is fitted (a ship must still move). Mirrors the
// Ion Thruster M baseline so an un-outfitted hull is sluggish but functional.
const FALLBACK_ENGINE = { topSpeed: 60, accelMult: 0.9, turnMult: 0.9, mass: 0, mods: { topSpeed: 60, accelMult: 0.9, turnMult: 0.9 } };
function engineMods(def) {
  const m = (def && def.mods) || (def === FALLBACK_ENGINE ? FALLBACK_ENGINE.mods : null);
  return {
    topSpeed: (m && m.topSpeed) || FALLBACK_ENGINE.mods.topSpeed,
    accelMult: (m && m.accelMult) || FALLBACK_ENGINE.mods.accelMult,
    turnMult: (m && m.turnMult) || FALLBACK_ENGINE.mods.turnMult,
  };
}

function flightClassForShip(shipDef) {
  const role = String((shipDef && shipDef.role) || '').toLowerCase();
  if (role.includes('fighter') || role.includes('interceptor')) return 'fighter';
  if (role.includes('hauler') || role.includes('freighter')) return 'hauler';
  if (role.includes('mining')) return 'miner';
  if (role.includes('corvette') || role.includes('gunship') || role.includes('battlecruiser') || role.includes('flagship')) return 'capital';
  return 'scout';
}

function buildFlightModel({ shipDef, flightClass, totalMass, massRatio, handling, thrust, turnRate, maxSpeed, drag, bankFactor }) {
  const t = FLIGHT_CLASS_TUNING[flightClass] || FLIGHT_CLASS_TUNING.scout;
  const inertia = Math.max(1, (totalMass / Math.max(0.3, handling)) * t.inertia);
  const maxYawRate = Math.min(turnRate * PLAYER_TURN_RATE_MULT * t.turn, PLAYER_TURN_RATE_CAP);
  return {
    flightClass,
    mass: totalMass,
    inertia,
    mainAccel: thrust * t.accel,
    reverseAccel: thrust * 0.55 * t.accel,
    strafeAccel: thrust * t.strafe,
    angularAccel: Math.max(5, turnRate * 8.5 * t.turn / Math.sqrt(Math.max(0.4, massRatio))),
    angularBrake: Math.max(12, turnRate * 15 * t.brake / Math.pow(Math.max(0.4, massRatio), 0.25)),
    maxYawRate,
    linearDrag: drag,
    lateralDrag: drag * 0.42,
    assistStrength: t.assist,
    reverseBrake: 2.4 + 0.35 * handling,
    maxSpeed,
    boostMult: 2.2,
    normalMaxSpeedMult: 1.15,
    boostMaxSpeedMult: 2.0,
    bankMax: 0.68,
    bankFactor,
    role: shipDef.role || 'ship',
  };
}

/**
 * getDerivedStats(defId, fittings, player) -> full derived stat block (§0.6, §3.4.1).
 * Folds equipped module modifiers over the hull base, applies player.efficiencyMods, and
 * recomputes handling from mass. Starts the ship at FULL hull/shield/cap.
 */
export function getDerivedStats(defId, fittings = [], player = null) {
  const shipDef = SHIP_BY_ID.get(defId) || SHIP_BY_ID.get('ship_kestrel');
  const eff = (player && player.efficiencyMods) || {};
  const miningYieldMult = 1; // not applied to ship stats; mining system reads efficiencyMods itself
  const shieldRegenMult = eff.shieldRegenMult || 1;
  const energyRegenMult = eff.energyRegenMult || 1;
  const cargoCapMult = eff.cargoCapMult || 1;

  const { equipped } = resolveFittings(shipDef, fittings);

  // (1) additive flats + mass + cargo pct + utility aggregates
  let shieldFlat = 0, shieldRegenFlat = 0, hullFlat = 0, cargoFlat = 0, cargoCapPct = 0;
  let moduleMass = 0, continuousDrain = 0;
  let damageReductionMult = 1; // multiplicative stacking of hardeners (§ formulas)
  for (const d of equipped) {
    if (!d) continue;
    moduleMass += d.mass || 0;
    continuousDrain += d.energyDraw || 0;
    const mods = d.mods || {};
    shieldFlat += mods.shieldFlat || 0;
    shieldRegenFlat += mods.shieldRegenFlat || 0;
    hullFlat += mods.hullFlat || 0;
    cargoFlat += mods.cargoFlat || 0;
    cargoCapPct += mods.cargoCapPct || 0;
    if (mods.damageReductionPct) damageReductionMult *= (1 - mods.damageReductionPct);
  }

  // (2) mass + handling baseline
  const baseMass = shipDef.mass;
  const totalMass = baseMass + moduleMass;
  const massRatio = totalMass / baseMass;
  const handling = shipDef.handling || 1;
  // Banking: per-hull roll-into-turn aggressiveness. Heavier loads bank less (mass dampens it),
  // so a fully-loaded freighter feels even more ponderous in a turn.
  const bankFactor = (shipDef.bankFactor != null ? shipDef.bankFactor : 0.6) / Math.sqrt(massRatio);

  const speedMass = 2 / (1 + massRatio);     // 1.0 at hull baseline, falls as mass grows
  const thrustMass = 1.5 / (0.5 + massRatio);
  const turnMass = 1.4 / (0.4 + massRatio);

  // (3) engine-derived movement.
  // The semi-Newtonian model gives steady-state speed = thrust/drag. Previously thrust/drag was
  // ~1/3 of maxSpeed, so ships crept and never reached their own ceiling (felt dead). We now solve
  // thrust from a desired CRUISE velocity so every hull actually reaches a satisfying speed, and
  // pick drag for responsiveness (~1/drag is the accelerate/stop time constant in seconds).
  const eng = engineMods(pickEngine(equipped) || FALLBACK_ENGINE);
  const maxSpeed = eng.topSpeed * SPEED_SCALE * handling * speedMass;   // boost ceiling
  const drag = 1.7 + 0.6 * massRatio;                                   // ~0.4–0.6s time constant
  const cruiseFrac = Math.min(0.85, 0.60 + 0.14 * eng.accelMult);       // 0.72 baseline; better engines cruise faster
  const cruise = maxSpeed * cruiseFrac;
  const thrust = cruise * drag * THRUST_SCALE;                          // terminal velocity ≈ cruise
  const turnRate = BASE_TURN * eng.turnMult * handling * turnMass;

  // (4) health / energy / cargo
  const hullMax = shipDef.hull + hullFlat;
  const shieldMax = shipDef.shield + shieldFlat;
  const shieldRegenRate = (shipDef.baseShieldRegen + shieldRegenFlat) * shieldRegenMult;
  const capMax = shipDef.energyCap;
  const capRegen = shipDef.energyRegen * energyRegenMult;
  const cargoCap = Math.floor((shipDef.cargo + cargoFlat) * (1 + cargoCapPct) * cargoCapMult);

  // (5) boost/dash config (Phase 3). regenRate rides the energy efficiency multiplier so better
  // power systems help boost recharge. A ship with no boost block gets a near-zero pool (can't boost).
  const bdef = shipDef.boost || {};
  const boostRegen = (bdef.regenRate || 18) * energyRegenMult;
  const flightClass = flightClassForShip(shipDef);
  const flightModel = buildFlightModel({
    shipDef,
    flightClass,
    totalMass,
    massRatio,
    handling,
    thrust,
    turnRate,
    maxSpeed,
    drag,
    bankFactor,
  });

  return {
    hull: hullMax, hullMax,
    armorHp: 0, armorMax: 0, armorFlat: 0,
    shield: shieldMax, shieldMax,
    shieldRegenRate, shieldRegenDelay: 3,
    cap: capMax, capMax, capRegen,
    thrust, turnRate, maxSpeed, drag,
    bankFactor,
    flightClass,
    flightModel,
    mass: totalMass, radius: shipDef.collisionRadius || 14,
    cargoCap,
    boost: {
      max: bdef.max || 0,
      drainRate: bdef.drainRate || 40,
      regenRate: boostRegen,
      dashImpulse: bdef.dashImpulse || 0,
      dashCooldown: bdef.dashCooldown || 3,
    },
    // informational extras (read by combat/ui; not part of the flat copy)
    continuousDrain, damageReductionMult,
  };
}

/** Resolve equipped weapon modules into the data.weapons[] runtime list (§ shared shape). */
function buildWeaponList(shipDef, fittings, isPlayer) {
  const { slots, equipped } = resolveFittings(shipDef, fittings);
  const weapons = [];
  for (let i = 0; i < equipped.length; i++) {
    const d = equipped[i];
    if (!d || d.slotType !== 'weapon') continue;
    weapons.push(makeWeaponRuntime(d, slots[i], i));
  }
  // Legacy player saves before the explicit NEW_GAME weapon may still have no weapon fitted. Prefer
  // a front-facing slot so the fallback starter gun never fires backward or as an unturreted mount.
  if (weapons.length === 0 && isPlayer) {
    const wslot = slots.find((s) => s.type === 'weapon' && (s.facing === 'front' || !s.facing))
               || slots.find((s) => s.type === 'weapon');
    const w = WEAPON_BY_ID.get(STARTER_WEAPON_ID);
    if (wslot && w) weapons.push(makeWeaponRuntime(w, wslot, wslot.index));
  }
  return weapons;
}

function makeWeaponRuntime(def, slot, slotIndex) {
  // Hardpoint facing (Phase 2): turret/gimbal tracking determines how a gun acquires its aim.
  const tracking = def.tracking || 'fixed';
  const facing = (slot && slot.facing) || 'front';
  const facingAngle = FACING_ANGLE[facing] != null ? FACING_ANGLE[facing] : 0;
  const turretArc = def.turretArcDeg ? def.turretArcDeg * Math.PI / 180 : 0;
  // turret mounts track freely within their arc; fixed mounts gimbal-assist within GIMBAL_ARC;
  // homing weapons lock a target and steer in flight (no gimbal — they fire toward the target).
  const isTurret = facing === 'turret' || tracking === 'auto_turret';
  const isHoming = tracking === 'homing';
  const gimbalArc = isTurret ? (turretArc || Math.PI) : (isHoming ? Math.PI : GIMBAL_ARC_DEFAULT);
  const muzzleOffset = FACING_OFFSET[facing] || FACING_OFFSET.front;
  return {
    slotIndex, defId: def.id, name: def.name, facing, facingAngle, gimbalArc, muzzleOffset,
    dmg: def.dmg, rof: def.rof, energyCost: def.energyCost,
    heat: def.heatPerShot || def.heatPerSec || 0, heatMax: def.heatMax || 100,
    projSpeed: def.projSpeed, range: def.range, spread: def.spreadDeg || 0,
    tracking, lockTimeS: def.lockTimeS || 0,
    damageType: def.damageType, arc: turretArc ? { turret: turretArc } : (gimbalArc ? { gimbal: gimbalArc } : 'fixed'),
    _cooldown: 0, _heat: 0,
  };
}

/** Place each default-fitted module/weapon defId into its first compatible empty slot. */
export function fittingsFromDefaultModules(defId, moduleIds) {
  const shipDef = SHIP_BY_ID.get(defId) || SHIP_BY_ID.get('ship_kestrel');
  const slots = buildSlotList(shipDef);
  const fittings = new Array(slots.length).fill(null);
  for (const mid of moduleIds || []) {
    const def = defById(mid);
    if (!def) continue;
    const idx = slots.findIndex((s, i) => fittings[i] == null && fits(s, def));
    if (idx >= 0) fittings[idx] = mid;
  }
  return fittings;
}

/** Resolve the equipped mining laser into data.miningBeam, defaulting the player Kestrel to mk1. */
function buildMiningBeam(shipDef, fittings, isPlayer) {
  const { equipped } = resolveFittings(shipDef, fittings);
  let mod = null;
  for (const d of equipped) if (d && d.slotType === 'mining') { mod = d; break; }
  let beam = null;
  if (mod) {
    // map the mining module's dps onto the canonical beam tier table (§0.11)
    beam = BEAMS.find((b) => b.dps === mod.dps) || null;
    return {
      tierId: beam ? beam.id : DEFAULT_MINING_BEAM_TIER,
      dps: mod.dps, range: mod.range, _heat: 0, heatMax: 100, overheated: false,
      heatRate: mod.heatRate, coolRate: mod.coolRate, directToCargo: !!mod.directToCargo,
    };
  }
  if (isPlayer) {
    const b = BEAM_BY_ID.get(DEFAULT_MINING_BEAM_TIER);
    return {
      tierId: DEFAULT_MINING_BEAM_TIER,
      dps: b.dps, range: b.range, _heat: 0, heatMax: 100, overheated: false,
      heatRate: b.heatRate, coolRate: b.coolRate, directToCargo: false,
    };
  }
  return null;
}

/**
 * makeShipEntitySpec(defId, opts) -> a spawnEntity spec (type:'ship') with the derived stat fields
 * copied onto the top level AND a full data block per the shared shape (§3.4.1).
 */
export function makeShipEntitySpec(defId, { team = 0, factionId = null, fittings = [], isPlayer = false, player = null, pos = null, rot = 0, ai = null } = {}) {
  const shipDef = SHIP_BY_ID.get(defId) || SHIP_BY_ID.get('ship_kestrel');
  const derived = getDerivedStats(shipDef.id, fittings, player);
  const weapons = buildWeaponList(shipDef, fittings, isPlayer);
  const miningBeam = buildMiningBeam(shipDef, fittings, isPlayer);

  return {
    type: 'ship', factionId, team,
    pos: pos || { x: 0, z: 0 }, rot,
    radius: derived.radius, mass: derived.mass,
    flightClass: derived.flightClass, flightModel: derived.flightModel,
    // flat health/energy/flight fields (flight + physics read these directly) — §shared shape
    hull: derived.hull, hullMax: derived.hullMax,
    armorHp: derived.armorHp, armorMax: derived.armorMax, armorFlat: derived.armorFlat,
    shield: derived.shield, shieldMax: derived.shieldMax,
    shieldRegenRate: derived.shieldRegenRate, shieldRegenDelay: derived.shieldRegenDelay,
    cap: derived.cap, capMax: derived.capMax, capRegen: derived.capRegen,
    thrust: derived.thrust, turnRate: derived.turnRate, maxSpeed: derived.maxSpeed, drag: derived.drag,
    // Phase 3 boost/dash runtime: energy starts full; dashCdT is the current cooldown countdown.
    boost: {
      energy: derived.boost.max, max: derived.boost.max,
      drainRate: derived.boost.drainRate, regenRate: derived.boost.regenRate,
      dashImpulse: derived.boost.dashImpulse, dashCd: derived.boost.dashCooldown, dashCdT: 0,
    },
    data: {
      defId: shipDef.id,
      derived,
      weapons,
      miningBeam,
      // Effective loadout (defId | null, parallel to buildSlotList order) for the render track to
      // read tier + place visible props. Current starter weapons are explicit fittings; legacy
      // fallback weapons are still backfilled here so old saves show the barrel they can fire.
      fittings: fittingsForView(shipDef, fittings, weapons),
      combat: { targetId: null, lockTarget: null, lockProgress: 0 },
      intent: null,
      ai,
      factionId, team,
      lootTableId: null, bountyCr: 0,
    },
  };
}

// ---- the system singleton ------------------------------------------------------------------

export const ships = {
  name: 'ships',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    const bus = this.bus;

    // re-derive on fit/research changes coming from other systems
    bus.on('module:equipped', ({ shipId }) => this.recomputeEntity(shipId));
    bus.on('module:unequipped', ({ shipId }) => this.recomputeEntity(shipId));
    bus.on('tech:researched', () => this.recomputeActiveShip());

    // UI intent events (§4.4): the UI emits these; ships owns the mutation + credit emits.
    bus.on('ui:buyShip', (p) => this.buyShip(p || {}));
    bus.on('ui:buyModule', (p) => this.buyModule(p || {}));
    bus.on('ui:fitModule', (p) => this.fitModule(p || {}));
    bus.on('ui:unfitModule', (p) => this.unfitModule(p || {}));
    bus.on('ui:unlockTech', (p) => this.unlockTech((p && p.nodeId) || null));
  },

  // event-only system; no per-tick work
  update(/* dt, state */) {},

  // ---- helpers ----------------------------------------------------------------------------

  /** The entity currently flown by the player (the active owned ship). */
  activeShipEntity() {
    const e = this.state.entities.get(this.state.playerId);
    return e && e.alive ? e : null;
  },
  ownedShip(index) {
    const p = this.state.player;
    const i = (index == null) ? p.activeShipIndex : index;
    return p.ownedShips[i] || null;
  },

  /** Recompute derived stats for an entity from its def + fittings, copy onto the entity, and
   *  emit ship:statsChanged + ship:cargoCapChanged (§4.4). Returns the derived block. */
  recomputeEntity(shipId, fittings) {
    const e = this.state.entities.get(shipId);
    if (!e || !e.data) return null;
    const defId = e.data.defId;
    const isPlayer = e.id === this.state.playerId;
    // prefer the owned-ship fittings for the player so research/efficiency apply consistently
    let fit = fittings;
    if (!fit) {
      const owned = isPlayer ? this.ownedShip() : null;
      fit = (owned && owned.fittings) || [];
    }
    const player = this.state.player;
    const prev = e.data.derived || {};
    const derived = getDerivedStats(defId, fit, player);

    // preserve current hull/shield/cap fractions so a refit doesn't fully heal a damaged ship,
    // but lift caps that grew. (Fresh spawn already starts full via getDerivedStats.)
    const hullFrac = prev.hullMax ? clamp01(e.hull / prev.hullMax) : 1;
    const shieldFrac = prev.shieldMax ? clamp01(e.shield / prev.shieldMax) : 1;
    const capFrac = prev.capMax ? clamp01(e.cap / prev.capMax) : 1;

    copyDerivedOntoEntity(e, derived);
    e.hull = derived.hullMax * hullFrac;
    e.shield = derived.shieldMax * shieldFrac;
    e.cap = derived.capMax * capFrac;

    // refresh boost config (Phase 3) — preserve current energy fraction + cooldown timer so a
    // refit doesn't silently refill or reset boost.
    const boostFrac = (e.boost && e.boost.max) ? clamp01(e.boost.energy / e.boost.max) : 1;
    const prevDashCdT = (e.boost && e.boost.dashCdT) || 0;
    e.boost = {
      energy: derived.boost.max * boostFrac,
      max: derived.boost.max,
      drainRate: derived.boost.drainRate, regenRate: derived.boost.regenRate,
      dashImpulse: derived.boost.dashImpulse,
      dashCd: derived.boost.dashCooldown, dashCdT: Math.min(prevDashCdT, derived.boost.dashCooldown),
    };

    // snapshot the appearance signature BEFORE we overwrite weapons/fittings so we can detect a
    // visible change (hull def or loadout) and ask the render track to rebuild the mesh.
    const shipDef = SHIP_BY_ID.get(defId) || SHIP_BY_ID.get('ship_kestrel');
    const prevAppearance = e.data._appearance || '';
    const newWeapons = buildWeaponList(shipDef, fit, isPlayer);
    const newViewFittings = fittingsForView(shipDef, fit, newWeapons);
    const newAppearance = defId + '|' + newViewFittings.join(',');

    e.data.derived = derived;
    e.data.weapons = newWeapons;
    e.data.miningBeam = buildMiningBeam(shipDef, fit, isPlayer);
    e.data.fittings = newViewFittings;
    e.data._appearance = newAppearance;

    this.bus.emit('ship:statsChanged', { shipId: e.id, derived });
    this.bus.emit('ship:cargoCapChanged', { shipId: e.id, cargoCap: derived.cargoCap });
    // Appearance changed (hull swap or loadout change) → render track rebuilds the mesh so visible
    // weapons/engines/tier reflect the current ship. Emitted only on an actual change to avoid
    // rebuilding the mesh on every pure-stat recompute (e.g. research efficiency ticks).
    if (newAppearance !== prevAppearance) {
      this.bus.emit('ship:appearanceChanged', { id: e.id });
    }
    return derived;
  },

  recomputeActiveShip() {
    const e = this.activeShipEntity();
    if (e) this.recomputeEntity(e.id);
  },

  // ---- tech research ----------------------------------------------------------------------

  researchable(nodeId) {
    const node = TECH_BY_ID.get(nodeId);
    if (!node) return false;
    const p = this.state.player;
    if (p.researchedNodes.includes(nodeId)) return false;
    for (const pre of node.prereqs) if (!p.researchedNodes.includes(pre)) return false;
    if (p.credits < node.cost.credits) return false;
    if ((p.researchPoints || 0) < node.cost.rp) return false;
    return true;
  },

  unlockTech(nodeId) {
    const node = TECH_BY_ID.get(nodeId);
    if (!node) return false;
    const p = this.state.player;
    if (!this.researchable(nodeId)) {
      this.bus.emit('toast', { text: 'Cannot research ' + (node.name || nodeId), kind: 'error', ttl: 3 });
      return false;
    }
    // spend: credits via economy (single writer §0.6); RP is ours to deduct.
    if (node.cost.credits) this.bus.emit('economy:chargeCredits', { amount: node.cost.credits, reason: 'research:' + nodeId });
    p.researchPoints = Math.max(0, (p.researchPoints || 0) - (node.cost.rp || 0));
    p.researchedNodes.push(nodeId);
    this.applyUnlocks(node.unlocks || {});

    this.bus.emit('tech:researched', { nodeId, unlocks: node.unlocks || {} });
    this.bus.emit('toast', { text: 'Researched ' + (node.name || nodeId), kind: 'success', ttl: 3 });
    this.recomputeActiveShip();
    return true;
  },

  /** Apply a tech node's unlock effects we own: efficiencyMods + droneTierCap. (Ship/module buy
   *  gating is read live from researchedNodes, so no flag bookkeeping needed.) */
  applyUnlocks(unlocks) {
    const p = this.state.player;
    if (unlocks.efficiency) {
      for (const k in unlocks.efficiency) {
        // efficiency values are deltas added to the multiplier baseline of 1.0
        p.efficiencyMods[k] = (p.efficiencyMods[k] || 1) + unlocks.efficiency[k];
      }
    }
    if (typeof unlocks.droneTierCap === 'number') {
      p.droneTierCap = Math.max(p.droneTierCap || 0, unlocks.droneTierCap);
    }
  },

  /** A ship/module def is buyable iff it has no requiresTech, or that tech is researched. */
  isUnlocked(def) {
    if (!def) return false;
    if (!def.requiresTech) return true;
    return this.state.player.researchedNodes.includes(def.requiresTech);
  },

  // ---- module shop: buy a module/weapon into inventory -----------------------------------

  /** Purchase a module or weapon by defId. Validates tech, credits, then deducts credits and
   *  pushes a new instance into moduleInventory. Returns true on success. */
  buyModule({ defId, fitSlotIndex = null }) {
    const def = defById(defId);
    const p = this.state.player;
    if (!def) { this.bus.emit('toast', { text: 'Unknown module', kind: 'error', ttl: 2 }); return false; }
    if (!this.isUnlocked(def)) {
      this.bus.emit('toast', { text: 'Research required: ' + (def.requiresTech || 'unknown tech'), kind: 'error', ttl: 3 });
      return false;
    }
    const price = def.price || 0;
    if (price > 0 && p.credits < price) {
      this.bus.emit('toast', { text: 'Insufficient credits (' + price.toLocaleString('en-US') + ' cr)', kind: 'error', ttl: 3 });
      return false;
    }
    // Deduct credits via the economy's sole-writer path (§0.6).
    if (price > 0) this.bus.emit('economy:chargeCredits', { amount: price, reason: 'buyModule:' + defId });
    const item = { instanceId: this.nextInstanceId(), defId };
    p.moduleInventory.push(item);
    const shouldFit = Number.isInteger(fitSlotIndex);
    const equipped = shouldFit ? this.fitModule({ slotIndex: fitSlotIndex, instanceId: item.instanceId }) : false;
    this.bus.emit('module:purchased', { defId, price, fitSlotIndex: equipped ? fitSlotIndex : null });
    this.bus.emit('toast', { text: (equipped ? 'Purchased and equipped ' : 'Purchased ') + def.name, kind: 'success', ttl: 3 });
    return true;
  },

  // ---- shipyard: buy / sell ship ----------------------------------------------------------

  buyShip({ defId, setActive = false, grant = false }) {
    const def = SHIP_BY_ID.get(defId);
    const p = this.state.player;
    if (!def) return false;
    // grant=true: crafted ship — materials were the cost, tech already gated by the blueprint.
    if (!grant) {
      if (!this.isUnlocked(def)) {
        this.bus.emit('toast', { text: 'Research required: ' + def.requiresTech, kind: 'error', ttl: 3 });
        return false;
      }
      const price = def.price || 0;
      if (p.credits < price) {
        this.bus.emit('toast', { text: 'Insufficient credits', kind: 'error', ttl: 3 });
        return false;
      }
      if (price) this.bus.emit('economy:chargeCredits', { amount: price, reason: 'buyShip:' + defId });
    }
    const slots = buildSlotList(def);
    p.ownedShips.push({ defId, fittings: new Array(slots.length).fill(null) });
    const newIndex = p.ownedShips.length - 1;
    this.bus.emit('ship:purchased', { defId, price: grant ? 0 : (def.price || 0) });
    if (setActive) this.setActiveShip(newIndex);
    return true;
  },

  sellShip(index) {
    const p = this.state.player;
    if (index === p.activeShipIndex) {
      this.bus.emit('toast', { text: 'Cannot sell the active ship', kind: 'error', ttl: 3 });
      return false;
    }
    const owned = p.ownedShips[index];
    if (!owned) return false;
    const def = SHIP_BY_ID.get(owned.defId);
    const base = (def && (def.buyback != null ? def.buyback : def.price)) || 0;
    const refund = Math.floor(base * 0.5);
    // return fitted modules to inventory before scrapping the hull
    for (const id of owned.fittings) if (id) p.moduleInventory.push({ instanceId: this.nextInstanceId(), defId: id });
    p.ownedShips.splice(index, 1);
    if (p.activeShipIndex > index) p.activeShipIndex--;
    if (refund) this.bus.emit('economy:grantCredits', { amount: refund, reason: 'sellShip:' + owned.defId });
    this.bus.emit('ship:sold', { defId: owned.defId, refund });
    return true;
  },

  setActiveShip(index) {
    const p = this.state.player;
    const owned = p.ownedShips[index];
    if (!owned) return false;
    const target = getDerivedStats(owned.defId, owned.fittings || [], p);
    const cargo = p.cargo || {};
    if ((cargo.usedVolume || 0) > target.cargoCap) {
      this.bus.emit('toast', { text: 'Cargo would overflow — jettison first', kind: 'error', ttl: 3 });
      return false;
    }
    p.activeShipIndex = index;
    // re-derive the player entity onto the new hull if it exists
    const e = this.state.entities.get(this.state.playerId);
    if (e) {
      e.data.defId = owned.defId;
      this.recomputeEntity(e.id, owned.fittings);
    }
    return true;
  },

  // ---- outfitting: fit / unfit modules ----------------------------------------------------

  /** Fit a module (by inventory instanceId, or by defId — buying directly into a slot) into a
   *  slot on the active (or given) owned ship. */
  fitModule({ shipIndex, slotIndex, instanceId, defId }) {
    const p = this.state.player;
    const owned = this.ownedShip(shipIndex);
    if (!owned) return false;
    const shipDef = SHIP_BY_ID.get(owned.defId);
    const slots = buildSlotList(shipDef);
    const slot = slots[slotIndex];
    if (!slot) return false;

    // resolve the module def + whether it comes from inventory
    let invIdx = -1;
    let def = null;
    if (instanceId != null) {
      invIdx = p.moduleInventory.findIndex((m) => m.instanceId === instanceId);
      if (invIdx < 0) return false;
      def = defById(p.moduleInventory[invIdx].defId);
      defId = p.moduleInventory[invIdx].defId;
    } else if (defId != null) {
      def = defById(defId);
    }
    if (!def) return false;
    if (!fits(slot, def)) {
      this.bus.emit('toast', { text: def.name + ' does not fit this slot', kind: 'error', ttl: 3 });
      return false;
    }
    if (!this.isUnlocked(def)) {
      this.bus.emit('toast', { text: 'Research required: ' + def.requiresTech, kind: 'error', ttl: 3 });
      return false;
    }

    const existing = owned.fittings[slotIndex];

    // remove the module from inventory if it came from there
    const fittedInventoryItem = invIdx >= 0 ? p.moduleInventory.splice(invIdx, 1)[0] : null;

    owned.fittings[slotIndex] = defId;

    // cargo-overflow guard for downsizing cargo capacity (§ fitting rule) — only matters on the
    // active flown ship; veto is a soft check against current usedVolume.
    if (this.wouldOverflowCargo(owned)) {
      // revert
      owned.fittings[slotIndex] = existing;
      if (fittedInventoryItem) p.moduleInventory.splice(invIdx, 0, fittedInventoryItem);
      this.bus.emit('toast', { text: 'Cargo would overflow — jettison first', kind: 'error', ttl: 3 });
      return false;
    }

    // unfit whatever previously occupied the slot back to inventory (free) after validation succeeds.
    if (existing) p.moduleInventory.push({ instanceId: this.nextInstanceId(), defId: existing });

    this.bus.emit('module:equipped', { shipId: this.shipIdFor(shipIndex), slotIndex, defId });
    this.recomputeIfActive(shipIndex, owned.fittings);
    return true;
  },

  unfitModule({ shipIndex, slotIndex }) {
    const p = this.state.player;
    const owned = this.ownedShip(shipIndex);
    if (!owned) return false;
    const defId = owned.fittings[slotIndex];
    if (!defId) return false;

    owned.fittings[slotIndex] = null;
    if (this.wouldOverflowCargo(owned)) {
      owned.fittings[slotIndex] = defId; // revert
      this.bus.emit('toast', { text: 'Cargo would overflow — jettison first', kind: 'error', ttl: 3 });
      return false;
    }
    p.moduleInventory.push({ instanceId: this.nextInstanceId(), defId });
    this.bus.emit('module:unequipped', { shipId: this.shipIdFor(shipIndex), slotIndex, defId });
    this.recomputeIfActive(shipIndex, owned.fittings);
    return true;
  },

  /** Would the given owned ship's cargo capacity drop below currently-used volume? (active only) */
  wouldOverflowCargo(owned) {
    if (owned !== this.ownedShip()) return false; // only the flown ship holds cargo
    const cargo = this.state.player.cargo;
    if (!cargo) return false;
    const derived = getDerivedStats(owned.defId, owned.fittings, this.state.player);
    return (cargo.usedVolume || 0) > derived.cargoCap;
  },

  recomputeIfActive(shipIndex, fittings) {
    const isActive = (shipIndex == null) || shipIndex === this.state.player.activeShipIndex;
    if (isActive) {
      const e = this.activeShipEntity();
      if (e) this.recomputeEntity(e.id, fittings);
    }
  },

  shipIdFor(shipIndex) {
    const isActive = (shipIndex == null) || shipIndex === this.state.player.activeShipIndex;
    return isActive ? this.state.playerId : -1;
  },

  nextInstanceId() {
    this._instSeq = (this._instSeq || 0) + 1;
    return 'mi_' + this.state.tick + '_' + this._instSeq;
  },

  // ---- new game ---------------------------------------------------------------------------

  /** Populate ship/fitting/research state from NEW_GAME defaults (§4.5 player save-key). Called by
   *  the save system's newGame(); also safe to call directly. Does NOT spawn the entity — the
   *  caller spawns it via makeShipEntitySpec + helpers.spawnEntity. */
  newGame() {
    const p = this.state.player;
    p.ownedShips = [{
      defId: NEW_GAME.shipId,
      fittings: this.fittingsFromDefaults(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
    }];
    p.activeShipIndex = 0;
    p.moduleInventory = [];
    p.researchedNodes = (NEW_GAME.researchedNodes || []).slice();
    p.researchPoints = NEW_GAME.researchPoints || 0;
    p.droneTierCap = 0;
    p.efficiencyMods = { miningYieldMult: 1, shieldRegenMult: 1, energyRegenMult: 1, cargoCapMult: 1, tradeFeeMult: 1 };
  },

  /** Place each default-fitted module/weapon defId into its first compatible empty slot. */
  fittingsFromDefaults(defId, moduleIds) {
    return fittingsFromDefaultModules(defId, moduleIds);
  },
};

// ---- small utils ---------------------------------------------------------------------------

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

/** Copy the flat derived stat fields onto the entity top level so flight/physics read them. */
function copyDerivedOntoEntity(e, d) {
  e.hullMax = d.hullMax;
  e.armorHp = d.armorHp; e.armorMax = d.armorMax; e.armorFlat = d.armorFlat;
  e.shieldMax = d.shieldMax; e.shieldRegenRate = d.shieldRegenRate; e.shieldRegenDelay = d.shieldRegenDelay;
  e.capMax = d.capMax; e.capRegen = d.capRegen;
  e.thrust = d.thrust; e.turnRate = d.turnRate; e.maxSpeed = d.maxSpeed; e.drag = d.drag;
  e.bankFactor = d.bankFactor;
  e.flightClass = d.flightClass;
  e.flightModel = d.flightModel;
  e.radius = d.radius; e.mass = d.mass;
}
