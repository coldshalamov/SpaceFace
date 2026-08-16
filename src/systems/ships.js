// ships system — owns ship/module/tech runtime: derived-stat computation (the single source of
// truth other systems read), fitting (fit/unfit), shipyard buy/sell, and tech research.
// ARCHITECTURE refs: §0.6 (ships is sole writer of derived stats), §0.10 (Kestrel starter),
// §0.18 (fitting rule), §3.4.1 (entity shape), §4.4 (event table). Pure-data sources:
//   SHIPS, WEAPONS, MODULES, TECH_NODES, BEAMS, NEW_GAME.
//
// getDerivedStats() and makeShipEntitySpec() are exported as pure-ish builders so other systems
// (save/newGame, render previews, UI stat readouts) can call them without going through the bus.
import { SHIPS } from '../data/ships.js';
import { FLIGHT_TUNING } from '../data/flightTuning.js';
import { WEAPONS } from '../data/weapons.js';
import { MODULES } from '../data/modules.js';
import { TECH_NODES, techDisplayName } from '../data/tech.js';
import {
  TECH_BRANCHES,
  TECH_CAPSTONES,
  TECH_EVENT_NAMES,
  featGateStatus,
  normalizeTechProgression,
  reduceTechProgression,
  techRespecPlan,
} from '../data/techProgression.js';
import { BEAMS } from '../data/mining.js';
import { NEW_GAME } from '../data/newGameDefaults.js';
import { SECTORS } from '../data/sectors.js';
import {
  describeHullRole,
  flightClassForHull,
  getLatticeRow,
  roleOperationalBiases,
} from '../data/shipRoleLattice.js';
import { syncDerivedPhysicsMass } from '../core/physicsAuthority.js';
import { resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';
import { resolveTravelCeiling } from '../core/flight/propulsionKernel.js';
import {
  defaultShipAppearance,
  normalizeShipAppearance,
  shipAppearanceSignature,
} from '../core/shipAppearance.js';
import {
  defaultLivingHull,
  livingHullAfterWash,
  livingHullWithGraffiti,
  livingHullWithKill,
  livingHullWithRepair,
  livingHullWithVent,
  normalizeLivingHull,
  sameLivingHull,
} from '../core/livingHull.js';

// ---- catalog lookup tables (built once at module load) ------------------------------------
const SHIP_BY_ID = new Map(SHIPS.map((s) => [s.id, s]));
const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
const MODULE_BY_ID = new Map(MODULES.map((m) => [m.id, m]));
const TECH_BY_ID = new Map(TECH_NODES.map((t) => [t.id, t]));
const BEAM_BY_ID = new Map(BEAMS.map((b) => [b.id, b]));
const SHIPWORKS_STATION_BY_ID = new Map();
for (const sector of SECTORS) {
  for (const station of sector.stations || []) SHIPWORKS_STATION_BY_ID.set(station.id, station);
}
// any fittable def (weapon OR module) by id
function defById(id) { return MODULE_BY_ID.get(id) || WEAPON_BY_ID.get(id) || null; }

function cloneOwnedShip(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

/** Resolve the two distinct station capabilities exposed by Shipworks. Hull acquisition/switching
 * requires a shipyard; module purchase/fitting also works at a module fabricator. */
export function shipworksAccessForServices(services) {
  const offered = Array.isArray(services) ? services : [];
  const hull = offered.includes('shipyard');
  const outfit = hull || offered.includes('module_craft');
  return {
    hull,
    outfit,
    hullReason: hull ? null : 'No shipyard service at this station',
    outfitReason: outfit ? null : 'No outfitting bay at this station',
  };
}

/** Fail-closed UI-intent authority for the exact berth currently occupied by the player. Direct
 * ships-system methods intentionally remain available to crafting, rewards, and sandbox callers. */
export function shipworksStationAccess(state) {
  const ui = state && state.ui;
  if (!ui || ui.docked !== true || typeof ui.dockedStationId !== 'string' || !ui.dockedStationId) {
    return {
      hull: false,
      outfit: false,
      stationId: null,
      hullReason: 'Dock at a shipyard to buy or switch ships',
      outfitReason: 'Dock at a shipyard or fabricator to fit modules',
    };
  }
  const station = SHIPWORKS_STATION_BY_ID.get(ui.dockedStationId);
  if (!station || !Array.isArray(station.services)) {
    return {
      hull: false,
      outfit: false,
      stationId: ui.dockedStationId,
      hullReason: 'Shipworks services unavailable at this berth',
      outfitReason: 'Shipworks services unavailable at this berth',
    };
  }
  return { ...shipworksAccessForServices(station.services), stationId: station.id };
}

// Heads share the existing Massline input grammar and are mutually exclusive fittings. This fixed
// priority is only a defensive read for manually-authored/old data; live fitting rejects multiples,
// so array slot order can never silently decide the active physics law.
const MASSLINE_HEAD_PRIORITY = Object.freeze({
  tractor: 1,
  elastic_whip: 2,
  frame_coupler: 3,
  monofilament_sweep: 4,
  transverse_snare: 5,
  twin_bridle: 6,
});
function masslineHeadIdForDef(def) {
  const id = def && def.mods && def.mods.masslineHeadId;
  return MASSLINE_HEAD_PRIORITY[id] ? id : null;
}

/** Return the differently slotted Massline head that makes this requested fit exclusive. Replacing
 * the head in its current slot is valid; fitting a second head elsewhere is not. */
export function findMasslineHeadConflict(fittings, slotIndex, requestedDef) {
  if (!masslineHeadIdForDef(requestedDef)) return null;
  const safeFittings = Array.isArray(fittings) ? fittings : [];
  for (let index = 0; index < safeFittings.length; index += 1) {
    const fittedId = safeFittings[index];
    if (index === slotIndex || !fittedId) continue;
    const fittedDef = defById(fittedId);
    if (masslineHeadIdForDef(fittedDef)) return fittedDef;
  }
  return null;
}

const SIZE_RANK = { S: 1, M: 2, L: 3 };
const SLOT_TYPES = ['weapon', 'shield', 'engine', 'cargo', 'mining', 'utility'];

function fmtCr(value) {
  return Math.max(0, Math.round(Number(value) || 0)).toLocaleString('en-US');
}

function purchaseFundingText(def, price, credits) {
  const missing = Math.max(0, (Number(price) || 0) - (Number(credits) || 0));
  return 'Need ' + fmtCr(missing) + ' more cr for ' + ((def && def.name) || 'this purchase');
}

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
export const PLAYER_GIMBAL_ARC = Math.PI;               // player fixed mounts bear full 360° around the hull
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
const BASE_RADAR_RANGE = 4000;
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

function outfitLimit(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : Infinity;
}

/** Read the nested mass budgets for one loadout. This is deliberately separate from derived flight
 * mass: capacity decides whether a module may be fitted, while getDerivedStats remains the sole
 * authority for how the accepted mass changes flight. Legacy/custom hulls without authored caps
 * remain unrestricted instead of becoming unloadable. */
export function outfitBudgetForFittings(shipDefOrId, fittings = []) {
  const shipDef = typeof shipDefOrId === 'string' ? SHIP_BY_ID.get(shipDefOrId) : shipDefOrId;
  if (!shipDef) return null;
  const slots = buildSlotList(shipDef);
  const safeFittings = Array.isArray(fittings) ? fittings : [];
  let used = 0;
  let weaponUsed = 0;
  let engineUsed = 0;
  for (let index = 0; index < slots.length; index += 1) {
    const def = defById(safeFittings[index]);
    if (!def) continue;
    const mass = Math.max(0, Number(def.mass) || 0);
    used += mass;
    if (def.slotType === 'weapon') weaponUsed += mass;
    if (def.slotType === 'engine') engineUsed += mass;
  }
  const outfitSpace = outfitLimit(shipDef.outfitSpace);
  const weaponCapacity = outfitLimit(shipDef.weaponCapacity);
  const engineCapacity = outfitLimit(shipDef.engineCapacity);
  return Object.freeze({
    used,
    weaponUsed,
    engineUsed,
    outfitSpace,
    weaponCapacity,
    engineCapacity,
    fits: used <= outfitSpace && weaponUsed <= weaponCapacity && engineUsed <= engineCapacity,
  });
}

/** Return the first player-legible nested-budget violation for a prospective loadout. */
export function outfitBudgetBlocker(shipDefOrId, fittings = []) {
  const budget = outfitBudgetForFittings(shipDefOrId, fittings);
  if (!budget) return { reason: 'missing_fit_target', text: null };
  if (budget.weaponUsed > budget.weaponCapacity) {
    return {
      reason: 'weapon_capacity',
      text: 'Weapon capacity exceeded (' + budget.weaponUsed + '/' + budget.weaponCapacity + ' t)',
      budget,
    };
  }
  if (budget.engineUsed > budget.engineCapacity) {
    return {
      reason: 'engine_capacity',
      text: 'Engine capacity exceeded (' + budget.engineUsed + '/' + budget.engineCapacity + ' t)',
      budget,
    };
  }
  if (budget.used > budget.outfitSpace) {
    return {
      reason: 'outfit_space',
      text: 'Outfit space exceeded (' + budget.used + '/' + budget.outfitSpace + ' t)',
      budget,
    };
  }
  return null;
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

/** Count capacity-bearing Drone Bays in compatible slots on one exact hull loadout. */
export function droneBayCountForFittings(defId, fittings = []) {
  const shipDef = SHIP_BY_ID.get(defId);
  if (!shipDef) return 0;
  const { slots, equipped } = resolveFittings(shipDef, fittings);
  let count = 0;
  for (let index = 0; index < equipped.length; index += 1) {
    const def = equipped[index];
    if (!def || !fits(slots[index], def)) continue;
    const value = def.mods && def.mods.droneBay;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) continue;
    const next = count + value;
    if (Number.isSafeInteger(next)) count = next;
  }
  return count;
}

/** Number of slots on a hull that can physically accept the canonical Drone Bay L. */
export function droneBayCompatibleSlotCount(defId) {
  const shipDef = SHIP_BY_ID.get(defId);
  const bayDef = MODULE_BY_ID.get('mod_drone_bay_l');
  if (!shipDef || !bayDef) return 0;
  return buildSlotList(shipDef).filter((slot) => fits(slot, bayDef)).length;
}

/** Add a positive finite fitted percentage without contaminating derived state. */
function addFinitePositivePct(current, value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return current;
  const next = current + value;
  return Number.isFinite(next) ? next : current;
}

/** Scale a runtime damage/range value from its immutable catalog base without overflow. */
function scaleWeaponRuntimeStat(baseValue, multiplier) {
  const base = Number(baseValue);
  const factor = Number(multiplier);
  if (!Number.isFinite(base) || base < 0) return 0;
  if (!Number.isFinite(factor) || factor <= 0) return base;
  const result = base * factor;
  return Number.isFinite(result) ? result : base;
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
const FALLBACK_ENGINE = {
  topSpeed: 60,
  accelMult: 0.9,
  turnMult: 0.9,
  mass: 0,
  mods: { topSpeed: 60, accelMult: 0.9, turnMult: 0.9, travelCeilingMult: 1.0 },
};
function engineMods(def) {
  const m = (def && def.mods) || (def === FALLBACK_ENGINE ? FALLBACK_ENGINE.mods : null);
  return {
    topSpeed: (m && m.topSpeed) || FALLBACK_ENGINE.mods.topSpeed,
    accelMult: (m && m.accelMult) || FALLBACK_ENGINE.mods.accelMult,
    turnMult: (m && m.turnMult) || FALLBACK_ENGINE.mods.turnMult,
    travelCeilingMult: Number.isFinite(m && m.travelCeilingMult) && m.travelCeilingMult > 0
      ? m.travelCeilingMult
      : FALLBACK_ENGINE.mods.travelCeilingMult,
  };
}

/** Build the complete propulsion profile once per derived-stat recompute. The underlying profile is
 * the hull's authored drive, with class/mass retained for legacy fallback. Only Travel Burn V-MAX
 * is tier-scaled, so fitting an engine cannot silently rewrite thrust, handling or drive-family behavior. */
function buildDerivedPropulsion(shipDef, flightClass, totalMass, engine) {
  const base = resolvePropulsionProfile({ driveId: shipDef.driveId, flightClass, mass: totalMass });
  const mult = engineMods(engine).travelCeilingMult;
  const derived = {
    ...base,
    travelCeiling: resolveTravelCeiling(base) * mult,
  };
  // Infinity is a runtime solver instruction, not authoritative entity state. Keep finite envelope
  // limits in the descriptor; an omitted limit is hydrated back to Infinity by the profile owner.
  if (!Number.isFinite(derived.solverSpeedLimit)) delete derived.solverSpeedLimit;
  return Object.freeze(derived);
}

/** Role lattice owns flight-class identity; fallback keeps legacy string matching. */
function flightClassForShip(shipDef) {
  return flightClassForHull(shipDef);
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
    reverseAccel: thrust * FLIGHT_TUNING.reverseThrustScale * t.accel,
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

  const { equipped, slots } = resolveFittings(shipDef, fittings);
  const droneBayCount = droneBayCountForFittings(defId, fittings);

  // (1) additive flats + mass + cargo pct + utility aggregates
  let shieldFlat = 0, shieldRegenFlat = 0, hullFlat = 0, cargoFlat = 0, cargoCapPct = 0;
  let weaponRangePct = 0;
  let weaponDmgPct = 0;
  let radarRangePct = 0;
  let hullRepairOOC = 0;
  // Every hull has its authored T1 drive. Fitted drive modules can only advance that capability;
  // the world owner resolves the canonical jump_tN key against its supported drive table.
  let jumpDriveTier = 1;
  let moduleMass = 0, continuousDrain = 0;
  let tetherSpoolMult = 1, tetherReelRateMult = 1;
  let ramDamageDealtMult = 0;
  let magnetRange = 0;
  let masslineHeadId = null;
  let hiddenCargoPct = Math.max(0, Math.min(1, Number(eff.hiddenCargoPct) || 0));
  let scannerCloak = Math.max(0, Math.min(1, Number(eff.scannerCloak) || 0));
  let damageReductionMult = 1; // multiplicative stacking of hardeners (§ formulas)
  for (let index = 0, length = equipped.length; index < length; index += 1) {
    const d = equipped[index] || null;
    if (!d) continue;
    moduleMass += d.mass || 0;
    continuousDrain += d.energyDraw || 0;
    const mods = d.mods || {};
    shieldFlat += mods.shieldFlat || 0;
    shieldRegenFlat += mods.shieldRegenFlat || 0;
    hullFlat += mods.hullFlat || 0;
    cargoFlat += mods.cargoFlat || 0;
    cargoCapPct += mods.cargoCapPct || 0;
    // Fire-control is an ordinary additive stat modifier, not a capability rating. Only a
    // compatible fitted slot may contribute, so malformed hand-authored arrays cannot grant it.
    const occupiesCompatibleSlot = fits(slots[index], d);
    if (occupiesCompatibleSlot) {
      weaponRangePct = addFinitePositivePct(weaponRangePct, mods.weaponRangePct);
      weaponDmgPct = addFinitePositivePct(weaponDmgPct, mods.weaponDmgPct);
      // Radar is a sensory capability: valid compatible modules select the strongest authored
      // coverage rather than stacking duplicate arrays. Reject a finite-but-unrepresentable value
      // here so it cannot discard an earlier usable range during final scaling.
      if (typeof mods.radarRangePct === 'number'
        && Number.isFinite(mods.radarRangePct)
        && mods.radarRangePct > radarRangePct) {
        const candidateRadarRange = BASE_RADAR_RANGE * (1 + mods.radarRangePct);
        if (Number.isFinite(candidateRadarRange) && candidateRadarRange > 0) {
          radarRangePct = mods.radarRangePct;
        }
      }
      // Drive tier is a capability rating: strongest compatible fitted module wins. Keep the
      // source primitive-only so hand-authored/malformed module records cannot leak NaN, strings,
      // or objects into the world jump state machine.
      if (typeof mods.jumpDriveTier === 'number'
        && Number.isFinite(mods.jumpDriveTier)
        && Number.isInteger(mods.jumpDriveTier)
        && mods.jumpDriveTier > 0) {
        jumpDriveTier = Math.max(jumpDriveTier, mods.jumpDriveTier);
      }
      // Autonomous hull repair is a capability rating. It must come from a valid fitted utility
      // module, and the strongest fitted variant wins instead of stacking repair per slot.
      if (typeof mods.hullRepairOOC === 'number'
        && Number.isFinite(mods.hullRepairOOC)
        && mods.hullRepairOOC > 0) {
        hullRepairOOC = Math.max(hullRepairOOC, mods.hullRepairOOC);
      }
    }
    if (Number.isFinite(mods.tetherSpoolMult) && mods.tetherSpoolMult > 0) {
      tetherSpoolMult = Math.max(tetherSpoolMult, mods.tetherSpoolMult);
    }
    if (Number.isFinite(mods.tetherReelRateMult) && mods.tetherReelRateMult > 0) {
      tetherReelRateMult = Math.max(tetherReelRateMult, mods.tetherReelRateMult);
    }
    if (Number.isFinite(mods.ramDamageDealtMult) && mods.ramDamageDealtMult > 0) {
      ramDamageDealtMult = Math.max(ramDamageDealtMult, mods.ramDamageDealtMult);
    }
    // Tractor magnet radius is a capability rating (max wins) — mining scoop reads derived.magnetRange.
    if (Number.isFinite(mods.magnetRange) && mods.magnetRange > 0) {
      magnetRange = Math.max(magnetRange, mods.magnetRange);
    }
    // Specialized heads are fitted capabilities, not input modes. Live fitting keeps them mutually
    // exclusive; fixed priority makes malformed/manual data deterministic instead of slot-ordered.
    const candidateHeadId = masslineHeadIdForDef(d);
    if ((MASSLINE_HEAD_PRIORITY[candidateHeadId] || 0) > (MASSLINE_HEAD_PRIORITY[masslineHeadId] || 0)) {
      masslineHeadId = candidateHeadId;
    }
    // Smuggling utilities are capability ratings, not additive economy bonuses. Taking the
    // strongest fitted module prevents stacking the same hidden volume or scan evasion twice.
    if (Number.isFinite(mods.hiddenCargoPct)) {
      hiddenCargoPct = Math.max(hiddenCargoPct, Math.max(0, Math.min(1, mods.hiddenCargoPct)));
    }
    if (Number.isFinite(mods.scannerCloak)) {
      scannerCloak = Math.max(scannerCloak, Math.max(0, Math.min(1, mods.scannerCloak)));
    }
    if (mods.damageReductionPct) damageReductionMult *= (1 - mods.damageReductionPct);
  }

  // (2) mass + handling baseline — role lattice biases operating-mass feel + handling identity.
  // Catalog dry/cargo mass stay truthful; opMassBias only scales the flight massRatio so haulers
  // wallow and scouts stay light without inventing new HP currencies.
  const lattice = getLatticeRow(shipDef.id);
  const biases = roleOperationalBiases(shipDef.id);
  const baseMass = shipDef.mass;
  const dryMass = baseMass + moduleMass;
  const cargoMass = Math.max(0, Number(player && player.cargo && player.cargo.usedMass) || 0);
  const totalMass = dryMass + cargoMass;
  const feelMass = totalMass * biases.opMassBias;
  const massRatio = feelMass / Math.max(0.001, baseMass);
  const handling = (shipDef.handling || 1) * biases.handlingBias;
  // Banking: per-hull roll-into-turn aggressiveness. Heavier loads bank less (mass dampens it),
  // so a fully-loaded freighter feels even more ponderous in a turn.
  const bankFactor = (shipDef.bankFactor != null ? shipDef.bankFactor : 0.6) / Math.sqrt(massRatio);

  const speedMass = 2 / (1 + massRatio);     // 1.0 at hull baseline, falls as mass grows
  const turnMass = 1.4 / (0.4 + massRatio);

  // (3) engine-derived movement.
  // The semi-Newtonian model gives steady-state speed = thrust/drag. Previously thrust/drag was
  // ~1/3 of maxSpeed, so ships crept and never reached their own ceiling (felt dead). We now solve
  // thrust from a desired CRUISE velocity so every hull actually reaches a satisfying speed, and
  // pick drag for responsiveness (~1/drag is the accelerate/stop time constant in seconds).
  const engine = pickEngine(equipped) || FALLBACK_ENGINE;
  const eng = engineMods(engine);
  const maxSpeed = eng.topSpeed * SPEED_SCALE * handling * speedMass;   // boost ceiling
  const drag = 1.7 + 0.6 * massRatio;                                   // ~0.4–0.6s time constant
  const cruiseFrac = Math.min(0.85, 0.60 + 0.14 * eng.accelMult);       // 0.72 baseline; better engines cruise faster
  const cruise = maxSpeed * cruiseFrac;
  const thrust = cruise * drag * THRUST_SCALE * biases.thrustBias;      // terminal velocity ≈ cruise
  const turnRate = BASE_TURN * eng.turnMult * handling * turnMass * biases.turnBias;

  // (4) health / energy / cargo — hull/shield stay catalog-truthful (no fake tank currency).
  const hullMax = shipDef.hull + hullFlat;
  const shieldMax = shipDef.shield + shieldFlat;
  const shieldRegenRate = (shipDef.baseShieldRegen + shieldRegenFlat) * shieldRegenMult;
  const capMax = shipDef.energyCap;
  const capRegen = shipDef.energyRegen * energyRegenMult;
  const cargoCap = Math.floor((shipDef.cargo + cargoFlat) * (1 + cargoCapPct) * cargoCapMult);
  const weaponRangeMult = weaponRangePct + 1;
  const weaponDmgMult = weaponDmgPct + 1;
  const radarRangeMult = radarRangePct + 1;
  const rawRadarRange = BASE_RADAR_RANGE * radarRangeMult;
  const radarRange = Number.isFinite(rawRadarRange) && rawRadarRange > 0
    ? rawRadarRange
    : BASE_RADAR_RANGE;

  // (5) boost/dash config (Phase 3). regenRate rides the energy efficiency multiplier so better
  // power systems help boost recharge. A ship with no boost block gets a near-zero pool (can't boost).
  const bdef = shipDef.boost || {};
  const boostRegen = (bdef.regenRate || 18) * energyRegenMult;
  const flightClass = flightClassForShip(shipDef);
  const propulsion = buildDerivedPropulsion(shipDef, flightClass, totalMass, engine);
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

  const roleIdentity = lattice
    ? {
      shipId: lattice.shipId,
      role: lattice.role,
      roleLabel: lattice.roleLabel,
      flightClass: lattice.flightClass,
      shortWhy: lattice.shortWhy,
      primaryCareers: lattice.primaryCareers,
      upgradeAdjacency: lattice.upgradeAdjacency,
      counterRoles: lattice.counterRoles,
    }
    : null;

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
    propulsion,
    dryMass, cargoMass, operationalMass: totalMass,
    operationalFeelMass: feelMass,
    mass: totalMass, radius: shipDef.collisionRadius || 14,
    tetherSpoolMult, tetherReelRateMult, masslineHeadId, magnetRange,
    weaponRangePct,
    weaponDmgPct,
    radarRangePct,
    weaponRangeMult,
    weaponDmgMult,
    radarRangeMult,
    radarRange,
    jumpDriveTier: `jump_t${jumpDriveTier}`,
    hullRepairOOC,
    droneBayCount,
    cargoCap,
    boost: {
      max: bdef.max || 0,
      drainRate: bdef.drainRate || 40,
      regenRate: boostRegen,
      dashImpulse: bdef.dashImpulse || 0,
      dashCooldown: bdef.dashCooldown || 3,
    },
    // informational extras (read by combat/ui; not part of the flat copy)
    continuousDrain, damageReductionMult, hiddenCargoPct, scannerCloak, ramDamageDealtMult,
    // M5 role lattice identity (recomputed; not serialized)
    roleIdentity,
    roleBiases: biases,
  };
}

/** Public lattice read for UI/tests — ships remains derived-stat authority. */
export function getShipRoleIdentity(defId) {
  return describeHullRole(defId);
}

/** Resolve equipped weapon modules into the data.weapons[] runtime list (§ shared shape). */
function buildWeaponList(shipDef, fittings, isPlayer, derivedStats = null) {
  const { slots, equipped } = resolveFittings(shipDef, fittings);
  const weapons = [];
  for (let i = 0; i < equipped.length; i++) {
    const d = equipped[i];
    if (!d || d.slotType !== 'weapon') continue;
    weapons.push(makeWeaponRuntime(d, slots[i], i, isPlayer, derivedStats));
  }
  // Legacy player saves before the explicit NEW_GAME weapon may still have no weapon fitted. Prefer
  // a front-facing slot so the fallback starter gun never fires backward or as an unturreted mount.
  if (weapons.length === 0 && isPlayer) {
    const wslot = slots.find((s) => s.type === 'weapon' && (s.facing === 'front' || !s.facing))
               || slots.find((s) => s.type === 'weapon');
    const w = WEAPON_BY_ID.get(STARTER_WEAPON_ID);
    if (wslot && w) weapons.push(makeWeaponRuntime(w, wslot, wslot.index, isPlayer, derivedStats));
  }
  return weapons;
}

function makeWeaponRuntime(def, slot, slotIndex, isPlayer = false, derivedStats = null) {
  // Hardpoint facing (Phase 2): turret/gimbal tracking determines how a gun acquires its aim.
  const tracking = def.tracking || 'fixed';
  const facing = (slot && slot.facing) || 'front';
  const facingAngle = FACING_ANGLE[facing] != null ? FACING_ANGLE[facing] : 0;
  const turretArc = def.turretArcDeg ? def.turretArcDeg * Math.PI / 180 : 0;
  // turret mounts track freely within their arc; fixed mounts gimbal-assist within GIMBAL_ARC;
  // homing weapons lock a target and steer in flight (no gimbal — they fire toward the target).
  const isTurret = facing === 'turret' || tracking === 'auto_turret';
  const isHoming = tracking === 'homing';
  const gimbalArc = isTurret ? (turretArc || Math.PI)
    : (isHoming ? Math.PI : (isPlayer ? PLAYER_GIMBAL_ARC : GIMBAL_ARC_DEFAULT));
  const muzzleOffset = FACING_OFFSET[facing] || FACING_OFFSET.front;
  return {
    slotIndex, defId: def.id, name: def.name, facing, facingAngle, gimbalArc, muzzleOffset,
    dmg: scaleWeaponRuntimeStat(def.dmg, derivedStats && derivedStats.weaponDmgMult), rof: def.rof, energyCost: def.energyCost,
    ...(def.splashDmg != null ? {
      splashDmg: scaleWeaponRuntimeStat(def.splashDmg, derivedStats && derivedStats.weaponDmgMult),
    } : {}),
    heat: def.heatPerShot || def.heatPerSec || 0, heatMax: def.heatMax || 100,
    projSpeed: def.projSpeed, range: scaleWeaponRuntimeStat(def.range, derivedStats && derivedStats.weaponRangeMult), spread: def.spreadDeg || 0,
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

function validRareOreChance(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Resolve the equipped mining laser into data.miningBeam, defaulting the player Kestrel to mk1. */
function buildMiningBeam(shipDef, fittings, isPlayer) {
  const { slots, equipped } = resolveFittings(shipDef, fittings);
  let mod = null;
  for (let i = 0; i < equipped.length; i++) {
    const d = equipped[i];
    if (d && d.slotType === 'mining' && fits(slots[i], d)) { mod = d; break; }
  }
  let beam = null;
  if (mod) {
    // map the mining module's dps onto the canonical beam tier table (§0.11)
    beam = BEAMS.find((b) => b.dps === mod.dps) || null;
    return {
      tierId: beam ? beam.id : DEFAULT_MINING_BEAM_TIER,
      dps: mod.dps, range: mod.range, directToCargo: !!mod.directToCargo,
      ...(validRareOreChance(mod.rareOreChance) ? { rareOreChance: mod.rareOreChance } : {}),
    };
  }
  if (isPlayer) {
    const b = BEAM_BY_ID.get(DEFAULT_MINING_BEAM_TIER);
    return {
      tierId: DEFAULT_MINING_BEAM_TIER,
      dps: b.dps, range: b.range, directToCargo: false,
    };
  }
  return null;
}

/**
 * makeShipEntitySpec(defId, opts) -> a spawnEntity spec (type:'ship') with the derived stat fields
 * copied onto the top level AND a full data block per the shared shape (§3.4.1).
 */
export function makeShipEntitySpec(defId, { team = 0, factionId = null, fittings = [], appearance = null, livingHull = null, isPlayer = false, player = null, pos = null, rot = 0, ai = null } = {}) {
  const shipDef = SHIP_BY_ID.get(defId) || SHIP_BY_ID.get('ship_kestrel');
  const derived = getDerivedStats(shipDef.id, fittings, player);
  const weapons = buildWeaponList(shipDef, fittings, isPlayer, derived || null);
  const miningBeam = buildMiningBeam(shipDef, fittings, isPlayer);

  return {
    type: 'ship', factionId, team, isPlayer: !!isPlayer,
    pos: pos || { x: 0, z: 0 }, rot,
    radius: derived.radius, mass: derived.mass,
    flightClass: derived.flightClass, flightModel: derived.flightModel,
    propulsion: derived.propulsion,
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
      appearance: appearance ? normalizeShipAppearance(appearance, shipDef.id) : null,
      livingHull: isPlayer ? normalizeLivingHull(livingHull, 0) : null,
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
    for (const unsubscribe of this._techProgressionUnsubs || []) unsubscribe();
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    this._cargoMassRefreshPending = false;
    const bus = this.bus;
    if (this.state.player.techProgression != null) {
      this.state.player.techProgression = normalizeTechProgression(this.state.player.techProgression);
    }

    // re-derive on fit/research changes coming from other systems
    bus.on('module:equipped', ({ shipId }) => this.recomputeEntity(shipId));
    bus.on('module:unequipped', ({ shipId }) => this.recomputeEntity(shipId));
    bus.on('tech:researched', () => this.recomputeActiveShip());
    bus.on('cargo:changed', () => { this._cargoMassRefreshPending = true; });
    bus.on('cargo:massSettled', () => this.flushCargoMassRefresh());
    bus.on('save:loaded', () => {
      if (this.state.player.techProgression != null) {
        this.state.player.techProgression = normalizeTechProgression(this.state.player.techProgression);
      }
      this.flushCargoMassRefresh();
      this.reconcileLivingHull({ announce: true });
      // Role identity is derived from the restored active hull. Publish once per Continue so the
      // presentation adapter can surface a one-time briefing without serializing lattice copy.
      this.publishActiveRoleContext({ source: 'save_loaded', announce: true });
    });

    // UI intent events (§4.4): the UI emits these; ships owns the mutation + credit emits. The
    // adapter validates the physical berth, while direct methods remain available to internal
    // crafting/reward/sandbox owners that do not originate at a station screen.
    const withShipworksAccess = (capability, action) => (payload = {}) => {
      // Plan 54: fitting owned modules from the explicit pause inventory is fee-free field work,
      // not station commerce. Keep buying and hull switching behind the physical berth gate.
      const pauseInventoryOutfit = capability === 'outfit'
        && payload.source === 'pause_inventory'
        && this.state.mode === 'paused';
      const access = shipworksStationAccess(this.state);
      if (!pauseInventoryOutfit && !access[capability]) {
        this.bus.emit('toast', {
          text: access[capability + 'Reason'],
          kind: 'error',
          ttl: 3,
        });
        return false;
      }
      return action(payload);
    };
    bus.on('ui:buyShip', withShipworksAccess('hull', (p) => this.buyShip(p)));
    bus.on('ui:setActiveShip', withShipworksAccess('hull', (p) => this.setActiveShip(p && p.index)));
    bus.on('ui:buyModule', withShipworksAccess('outfit', (p) => this.buyModule(p)));
    bus.on('ui:fitModule', withShipworksAccess('outfit', (p) => this.fitModule(p)));
    bus.on('ui:unfitModule', withShipworksAccess('outfit', (p) => this.unfitModule(p)));
    bus.on('ui:unlockTech', (p) => this.unlockTech((p && p.nodeId) || null));
    bus.on('ui:respecTech', (p) => this.respecTech(p && p.branch));
    bus.on('ui:setShipAppearance', (p) => this.setShipAppearance(p || {}));
    this._techProgressionUnsubs = TECH_EVENT_NAMES.map((eventName) => bus.on(eventName, (payload) => {
      this.recordTechProgress(eventName, payload || {});
    }));
    // Canonical gameplay receipts feed a small per-owned-ship history record. Presentation gets a
    // rare in-place update event; none of these events requests a ship rebuild or asset admission.
    bus.on('lossLedger:recorded', (p) => {
      if (p && p.kind === 'ship' && p.killedByPlayer === true) {
        this._reduceLivingHull((hull, now) => livingHullWithKill(hull, now), 'player_kill');
      }
    });
    bus.on('service:completed', (p) => {
      if (!p) return;
      if (p.type === 'repair') {
        this._reduceLivingHull((hull, now) => livingHullWithRepair(hull, p, now), 'heavy_repair');
      } else if (p.type === 'hull_wash') {
        this._reduceLivingHull((hull, now) => livingHullAfterWash(hull, now), 'hull_wash');
      }
    });
    bus.on('weapons:vent', (p) => {
      if (p && p.phase === 'start' && p.ownerId === this.state.playerId) {
        this._reduceLivingHull((hull, now) => livingHullWithVent(hull, now), 'weapon_vent');
      }
    });
    bus.on('graffiti:show', (p) => {
      if (p && p.where === 'bulkhead' && p.line) {
        this._reduceLivingHull((hull, now) => livingHullWithGraffiti(hull, p, now), 'bulkhead_graffiti');
      }
    });
    bus.on('game:started', () => this.reconcileLivingHull({ announce: false }));
  },

  // Event-only system. Cargo owns the registered per-tick coalescing boundary and emits one
  // cargo:massSettled receipt after all synchronous mutations in its update.
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

  /** Durable player-loss snapshot. The hulk owner stores this exact plain record; ships remains the
   * only authority allowed to turn it back into owned/live hull state. */
  capturePlayerLoss(lossId) {
    const owned = this.ownedShip();
    const entity = this.state && this.state.entities && this.state.entities.get
      ? this.state.entities.get(this.state.playerId) : null;
    if (!owned || !lossId || !entity || entity.type !== 'ship') return null;
    const def = SHIP_BY_ID.get(owned.defId);
    return {
      schemaVersion: 1,
      lossId: String(lossId),
      shipIndex: this.state.player.activeShipIndex | 0,
      defId: owned.defId,
      shipName: def && def.name || owned.defId,
      fittings: Array.isArray(owned.fittings) ? owned.fittings.slice() : [],
      appearance: cloneOwnedShip(owned.appearance),
      livingHull: cloneOwnedShip(owned.livingHull),
      runtimeMass: Math.max(1, Number(entity.mass) || Number(entity.data && entity.data.derived && entity.data.derived.operationalMass) || 1),
    };
  },

  /** Replace the destroyed ownership slot with the policy result. Full preserves the fit and hull
   * history; Basic is the same stock chassis; no policy gets the authored starter loadout. */
  applyPlayerLossRefit({ lossId, tier, shipSnapshot, insuranceClaim = null } = {}) {
    if (!lossId || !shipSnapshot || shipSnapshot.lossId !== lossId) return { ok: false, reason: 'loss_snapshot_unavailable' };
    if (tier !== 'loaner' && (!insuranceClaim || insuranceClaim.lossId !== lossId
      || insuranceClaim.tier !== tier || insuranceClaim.shipDefId !== shipSnapshot.defId
      || insuranceClaim.shipIndex !== shipSnapshot.shipIndex
      || !(Number(insuranceClaim.refitFundingCr) > 0))) {
      return { ok: false, reason: 'insurance_refit_unfunded' };
    }
    const p = this.state.player;
    const index = Number.isInteger(shipSnapshot.shipIndex) ? shipSnapshot.shipIndex : p.activeShipIndex | 0;
    let owned;
    if (tier === 'full' || tier === 'loyalty') {
      owned = {
        defId: shipSnapshot.defId,
        fittings: Array.isArray(shipSnapshot.fittings) ? shipSnapshot.fittings.slice() : [],
        appearance: cloneOwnedShip(shipSnapshot.appearance),
        livingHull: cloneOwnedShip(shipSnapshot.livingHull),
      };
    } else if (tier === 'basic') {
      const def = SHIP_BY_ID.get(shipSnapshot.defId) || SHIP_BY_ID.get(NEW_GAME.shipId);
      owned = {
        defId: def.id,
        fittings: new Array(buildSlotList(def).length).fill(null),
        appearance: defaultShipAppearance(def.id),
        livingHull: defaultLivingHull(this.state.simTime || 0),
      };
    } else {
      owned = {
        defId: NEW_GAME.shipId,
        fittings: this.fittingsFromDefaults(NEW_GAME.shipId, NEW_GAME.fittedModules || []),
        appearance: defaultShipAppearance(NEW_GAME.shipId),
        livingHull: defaultLivingHull(this.state.simTime || 0),
        loaner: { lossId, debtPending: true },
      };
      tier = 'loaner';
    }
    owned.lossRecovery = { lossId, tier, temporary: true };
    while (p.ownedShips.length <= index) p.ownedShips.push(null);
    p.ownedShips[index] = owned;
    p.activeShipIndex = index;
    const shipId = this._materializePlayerOwnedShip(owned);
    if (shipId == null) return { ok: false, reason: 'player_entity_unavailable' };
    this.bus.emit('ship:lossRefitApplied', { lossId, tier, shipId: owned.defId, shipIndex: index });
    return { ok: true, lossId, tier, shipId: owned.defId, shipIndex: index };
  },

  /** A station-delivered own hulk replaces the temporary recovery hull, restoring the original
   * fittings, appearance and living-hull scars exactly once. */
  recoverPlayerLoss({ lossId, shipSnapshot } = {}) {
    if (!lossId || !shipSnapshot || shipSnapshot.lossId !== lossId) return { ok: false, reason: 'loss_snapshot_unavailable' };
    const p = this.state.player;
    const active = this.ownedShip();
    if (active && active.recoveredFromLoss === lossId) {
      return { ok: true, idempotent: true, shipId: active.defId, shipIndex: p.activeShipIndex };
    }
    const index = p.activeShipIndex | 0;
    const owned = {
      defId: shipSnapshot.defId,
      fittings: Array.isArray(shipSnapshot.fittings) ? shipSnapshot.fittings.slice() : [],
      appearance: cloneOwnedShip(shipSnapshot.appearance),
      livingHull: cloneOwnedShip(shipSnapshot.livingHull),
      recoveredFromLoss: lossId,
    };
    p.ownedShips[index] = owned;
    const entityId = this._materializePlayerOwnedShip(owned);
    if (entityId == null) return { ok: false, reason: 'player_entity_unavailable' };
    this.bus.emit('ship:lostHullRecovered', {
      lossId,
      shipId: owned.defId,
      shipIndex: index,
      livingHull: cloneOwnedShip(owned.livingHull),
    });
    return { ok: true, shipId: owned.defId, shipIndex: index };
  },

  _materializePlayerOwnedShip(owned) {
    const entity = this.state.entities && this.state.entities.get
      ? this.state.entities.get(this.state.playerId) : null;
    if (!entity || !owned) return null;
    const canonical = makeShipEntitySpec(owned.defId, {
      team: 0,
      factionId: 'player',
      fittings: owned.fittings || [],
      appearance: owned.appearance,
      livingHull: owned.livingHull,
      isPlayer: true,
      player: this.state.player,
      pos: entity.pos,
      rot: entity.rot || 0,
    });
    entity.type = 'ship';
    entity.alive = true;
    entity.collides = true;
    entity.isPlayer = true;
    entity.factionId = 'player';
    entity.team = 0;
    for (const key of [
      'radius', 'mass', 'flightClass', 'flightModel', 'propulsion', 'hull', 'hullMax',
      'armorHp', 'armorMax', 'armorFlat', 'shield', 'shieldMax', 'shieldRegenRate',
      'shieldRegenDelay', 'cap', 'capMax', 'capRegen', 'thrust', 'turnRate', 'maxSpeed',
      'drag', 'boost',
    ]) entity[key] = canonical[key];
    entity.data = canonical.data;
    delete entity.physicsBody;
    entity.flags = Object.assign({}, entity.flags, { persistent: true });
    delete entity.flags.defeated;
    this.recomputeEntity(entity.id, owned.fittings || []);
    return entity.id;
  },

  reconcileLivingHull({ announce = false } = {}) {
    const player = this.state && this.state.player;
    if (!player || !Array.isArray(player.ownedShips)) return null;
    const now = Number(this.state.simTime) || 0;
    for (const owned of player.ownedShips) {
      if (owned) owned.livingHull = normalizeLivingHull(owned.livingHull, now);
    }
    const owned = this.ownedShip();
    const entity = this.activeShipEntity();
    if (!owned) return null;
    if (entity && entity.data) entity.data.livingHull = owned.livingHull;
    if (announce && entity) {
      this.bus.emit('ship:livingHullChanged', {
        id: entity.id,
        shipIndex: player.activeShipIndex,
        defId: owned.defId,
        source: 'reconciled',
        livingHull: owned.livingHull,
      });
    }
    return owned.livingHull;
  },

  _reduceLivingHull(reducer, source) {
    const owned = this.ownedShip();
    if (!owned || typeof reducer !== 'function') return false;
    const now = Number(this.state.simTime) || 0;
    const before = normalizeLivingHull(owned.livingHull, now);
    const after = normalizeLivingHull(reducer(before, now), now);
    if (sameLivingHull(before, after)) return false;
    owned.livingHull = after;
    const entity = this.activeShipEntity();
    if (entity && entity.data) entity.data.livingHull = after;
    this.bus.emit('ship:livingHullChanged', {
      id: entity && entity.id,
      shipIndex: this.state.player.activeShipIndex,
      defId: owned.defId,
      source,
      livingHull: after,
    });
    return true;
  },

  /**
   * Canonical player-facing role packet for the active owned hull. The role lattice remains the
   * only identity source for known hulls; missing/legacy defIds fall back to best-effort catalog
   * fields so Continue never drops the briefing seam. Packet is transient event/UI context and is
   * never serialized onto player ownership.
   */
  activeRoleContext({ source = 'query', previousDefId = null } = {}) {
    const p = this.state && this.state.player;
    if (!p || !Array.isArray(p.ownedShips)) return null;
    const activeShipIndex = Number.isInteger(p.activeShipIndex) ? p.activeShipIndex : 0;
    const owned = p.ownedShips[activeShipIndex] || null;
    if (!owned) return null;
    const identity = describeHullRole(owned.defId) || legacyRoleIdentity(owned.defId);
    if (!identity) return null;
    const path = identity.rolePath || null;
    const fallback = !!identity.fallback;
    return Object.freeze({
      schema: 'spaceface.shipRoleContext.v1',
      source,
      tick: Number(this.state.tick) || 0,
      activeShipIndex,
      previousDefId: previousDefId || null,
      defId: owned.defId,
      name: identity.name,
      role: identity.role,
      roleLabel: identity.roleLabel,
      flightClass: identity.flightClass,
      identityLine: identity.identityLine,
      signatureVerb: path ? path.signatureVerb : (identity.signatureVerb || identity.shortWhy),
      counterplay: path
        ? path.counterplay
        : (identity.counterplay || (identity.weaknesses || []).join(', ')),
      primaryCareers: Object.freeze((identity.primaryCareers || []).slice()),
      fallback,
    });
  },

  /**
   * Publish active role continuity. Visible briefing is owned by presentationAdapters via
   * ship:roleContext — ships never touches the DOM and never emits toast from this path.
   */
  publishActiveRoleContext({ source = 'query', previousDefId = null, announce = false } = {}) {
    const base = this.activeRoleContext({ source, previousDefId });
    if (!base) return null;
    const context = Object.freeze({
      ...base,
      announce: !!announce,
    });
    this.bus.emit('ship:roleContext', context);
    return context;
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
    const player = isPlayer ? this.state.player : null;
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
    const newWeapons = buildWeaponList(shipDef, fit, isPlayer, derived || null);
    const newViewFittings = fittingsForView(shipDef, fit, newWeapons);
    const newAppearance = defId + '|' + newViewFittings.join(',') + '|'
      + shipAppearanceSignature(e.data.appearance, defId);

    e.data.derived = derived;
    if (isPlayer && this.state.ui) this.state.ui.radarRange = derived.radarRange;
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
    if (!featGateStatus(node, p).revealed) return false;
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

  /** Quietly reduce real production receipts into the player's durable feat record. Individual
   * counters never toast or expose a checklist. Completing all records in a fantasy reveals its
   * capstone once, with the intended "the tree noticed" surprise. */
  recordTechProgress(eventName, payload) {
    const p = this.state && this.state.player;
    if (!p) return false;
    const result = reduceTechProgression(p.techProgression, eventName, payload || {}, {
      playerId: this.state.playerId,
      tick: this.state.tick,
      tetherTargetId: p.tether && p.tether.active ? p.tether.targetId : null,
    });
    if (!result.changed) return false;
    p.techProgression = result.progression;
    for (const branchId of result.newlyRevealedBranches) {
      const branch = TECH_BRANCHES.find((entry) => entry.id === branchId);
      const node = TECH_BY_ID.get(TECH_CAPSTONES[branchId]);
      this.bus.emit('tech:featGateRevealed', {
        branch: branchId,
        nodeId: node && node.id,
        featIds: Array.isArray(node && node.featGate) ? node.featGate.slice() : [],
      });
      this.bus.emit('toast', {
        text: `The tree noticed: ${(branch && branch.label) || branchId} capstone revealed.`,
        kind: 'success',
        ttl: 4,
      });
    }
    return true;
  },

  /** Paid branch respec at a physical station. It removes dependent researched nodes as a closure,
   * returns their RP through the missions grant writer, and unfits modules whose license vanished.
   * Efficiency deltas are subtracted exactly instead of rebuilding from 1 and erasing legacy or
   * non-tech bonuses. */
  respecTech(branch) {
    const state = this.state;
    const p = state && state.player;
    if (!p || !state.ui || state.ui.docked !== true || !state.ui.dockedStationId) {
      this.bus.emit('toast', { text: 'Dock at a station to respec research', kind: 'error', ttl: 3 });
      return false;
    }
    const plan = techRespecPlan(p.researchedNodes, branch, TECH_NODES);
    if (!plan.removed.length) {
      this.bus.emit('toast', { text: 'Nothing researched in that branch', kind: 'info', ttl: 2 });
      return false;
    }
    if ((p.credits || 0) < plan.costCr) {
      this.bus.emit('toast', { text: `Respec requires ${plan.costCr.toLocaleString()} cr`, kind: 'error', ttl: 3 });
      return false;
    }
    const removed = new Set(plan.removed);
    const unfitPlan = this._respecUnfitPlan(removed);
    if (!unfitPlan.ok) {
      this.bus.emit('toast', { text: unfitPlan.reason, kind: 'error', ttl: 3 });
      return false;
    }

    this.bus.emit('economy:chargeCredits', { amount: plan.costCr, reason: `tech_respec:${branch}` });
    const refundRp = plan.removed.reduce((sum, id) => sum + Math.max(0, Number(TECH_BY_ID.get(id)?.cost?.rp) || 0), 0);
    p.researchedNodes = plan.kept;
    this._removeTechEffects(plan.removed);
    this._applyRespecUnfits(unfitPlan.rows);
    if (refundRp > 0) {
      this.bus.emit('research:grant', {
        amount: refundRp,
        source: 'tech_respec',
        receiptId: `tech-respec:${branch}:${state.tick | 0}:${plan.removed.slice().sort().join(',')}`,
      });
    }
    this.recomputeActiveShip();
    this.bus.emit('tech:respecced', {
      branch,
      removedNodeIds: plan.removed.slice(),
      costCr: plan.costCr,
      refundedRp: refundRp,
      unfittedModuleIds: unfitPlan.rows.map((row) => row.defId),
      stationId: state.ui.dockedStationId,
    });
    this.bus.emit('toast', {
      text: `${branchLabel(branch)} research respecced · ${refundRp} RP returned`,
      kind: 'success',
      ttl: 4,
    });
    return true;
  },

  _respecUnfitPlan(removed) {
    const p = this.state.player;
    const rows = [];
    for (let shipIndex = 0; shipIndex < (p.ownedShips || []).length; shipIndex += 1) {
      const owned = p.ownedShips[shipIndex];
      for (let slotIndex = 0; slotIndex < (owned && owned.fittings || []).length; slotIndex += 1) {
        const defId = owned.fittings[slotIndex];
        const def = defById(defId);
        if (def && def.requiresTech && removed.has(def.requiresTech)) rows.push({ shipIndex, slotIndex, defId });
      }
    }
    const active = this.ownedShip();
    if (active && p.cargo && rows.some((row) => row.shipIndex === p.activeShipIndex)) {
      const fittings = active.fittings.slice();
      for (const row of rows) if (row.shipIndex === p.activeShipIndex) fittings[row.slotIndex] = null;
      const derived = getDerivedStats(active.defId, fittings, p);
      if ((p.cargo.usedVolume || 0) > derived.cargoCap) {
        return { ok: false, reason: 'Cargo would overflow after respec — jettison first', rows: [] };
      }
    }
    return { ok: true, reason: null, rows };
  },

  _applyRespecUnfits(rows) {
    const p = this.state.player;
    if (!Array.isArray(p.moduleInventory)) p.moduleInventory = [];
    for (const row of rows) {
      const owned = p.ownedShips[row.shipIndex];
      if (!owned || owned.fittings[row.slotIndex] !== row.defId) continue;
      owned.fittings[row.slotIndex] = null;
      p.moduleInventory.push({ instanceId: this.nextInstanceId(), defId: row.defId });
      this.bus.emit('module:unequipped', {
        shipId: this.shipIdFor(row.shipIndex),
        slotIndex: row.slotIndex,
        defId: row.defId,
        reason: 'tech_respec',
      });
    }
  },

  _removeTechEffects(removedNodeIds) {
    const p = this.state.player;
    const efficiencyMods = p.efficiencyMods && typeof p.efficiencyMods === 'object'
      ? p.efficiencyMods
      : (p.efficiencyMods = {});
    for (const id of removedNodeIds) {
      const efficiency = TECH_BY_ID.get(id)?.unlocks?.efficiency;
      for (const [key, delta] of Object.entries(efficiency || {})) {
        const current = Number(efficiencyMods[key]);
        efficiencyMods[key] = Math.max(0, (Number.isFinite(current) ? current : 1) - (Number(delta) || 0));
      }
    }
    p.droneTierCap = (p.researchedNodes || []).reduce((cap, id) => {
      const value = Number(TECH_BY_ID.get(id)?.unlocks?.droneTierCap);
      return Number.isFinite(value) ? Math.max(cap, value) : cap;
    }, 0);
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
      this.bus.emit('toast', { text: 'Research required: ' + techDisplayName(def.requiresTech), kind: 'error', ttl: 3 });
      return false;
    }
    const price = def.price || 0;
    if (price > 0 && p.credits < price) {
      this.bus.emit('toast', { text: purchaseFundingText(def, price, p.credits), kind: 'error', ttl: 3 });
      return false;
    }
    const shouldFit = Number.isInteger(fitSlotIndex);
    if (shouldFit) {
      const blocker = this.moduleFitBlocker({ slotIndex: fitSlotIndex, def });
      if (blocker) {
        if (blocker.text) this.bus.emit('toast', { text: blocker.text, kind: 'error', ttl: 3 });
        return false;
      }
    }
    const item = { instanceId: this.nextInstanceId(), defId };
    p.moduleInventory.push(item);
    const equipped = shouldFit ? this.fitModule({ slotIndex: fitSlotIndex, instanceId: item.instanceId }) : false;
    if (shouldFit && !equipped) {
      const rollbackIndex = p.moduleInventory.findIndex((entry) => entry.instanceId === item.instanceId);
      if (rollbackIndex >= 0) p.moduleInventory.splice(rollbackIndex, 1);
      return false;
    }
    // Charge only after an explicit Buy & Fit has succeeded, so a rejected fit cannot spend credits.
    if (price > 0) this.bus.emit('economy:chargeCredits', { amount: price, reason: 'buyModule:' + defId });
    this.bus.emit('module:purchased', { defId, price, fitSlotIndex: equipped ? fitSlotIndex : null });
    this.bus.emit('toast', { text: (equipped ? 'Purchased and equipped ' : 'Purchased ') + def.name, kind: 'success', ttl: 3 });
    return true;
  },

  /** Add a mission/career reward through the ships-owned inventory authority, without charging
   *  credits. Callers own idempotent reward receipts; ships owns validation + mutation. */
  grantModule({ defId, reason = 'reward' }) {
    const def = defById(defId);
    const p = this.state.player;
    if (!def || !p || !Array.isArray(p.moduleInventory)) return false;
    const item = { instanceId: this.nextInstanceId(), defId };
    p.moduleInventory.push(item);
    this.bus.emit('module:granted', { defId, instanceId: item.instanceId, reason });
    return true;
  },

  flushCargoMassRefresh() {
    if (!this._cargoMassRefreshPending) return null;
    this._cargoMassRefreshPending = false;
    const e = this.activeShipEntity();
    if (!e || !e.data) return null;
    const previous = e.data.derived || {};
    const cargoMass = Math.max(0, Number(this.state.player && this.state.player.cargo && this.state.player.cargo.usedMass) || 0);
    if (previous.cargoMass === cargoMass) return previous;
    const owned = this.ownedShip();
    const next = getDerivedStats(e.data.defId, (owned && owned.fittings) || [], this.state.player);
    e.data.derived = next;
    copyOperationalMassOntoEntity(e, next);
    this.bus.emit('ship:massChanged', {
      shipId: e.id,
      dryMass: next.dryMass,
      cargoMass: next.cargoMass,
      operationalMass: next.operationalMass,
    });
    return next;
  },

  // ---- shipyard: buy / sell ship ----------------------------------------------------------

  buyShip({ defId, setActive = false, grant = false }) {
    const def = SHIP_BY_ID.get(defId);
    const p = this.state.player;
    if (!def) return false;
    // grant=true: crafted ship — materials were the cost, tech already gated by the blueprint.
    if (!grant) {
      if (!this.isUnlocked(def)) {
        this.bus.emit('toast', { text: 'Research required: ' + techDisplayName(def.requiresTech), kind: 'error', ttl: 3 });
        return false;
      }
      const price = def.price || 0;
      if (p.credits < price) {
        this.bus.emit('toast', { text: purchaseFundingText(def, price, p.credits), kind: 'error', ttl: 3 });
        return false;
      }
      if (price) this.bus.emit('economy:chargeCredits', { amount: price, reason: 'buyShip:' + defId });
    }
    const slots = buildSlotList(def);
    p.ownedShips.push({
      defId,
      fittings: new Array(slots.length).fill(null),
      appearance: normalizeShipAppearance(p.cosmeticPresets && p.cosmeticPresets[defId], defId),
      livingHull: defaultLivingHull(this.state.simTime || 0),
    });
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
    const isTransition = index !== p.activeShipIndex;
    const previousOwned = p.ownedShips[p.activeShipIndex] || null;
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
      e.data.appearance = normalizeShipAppearance(owned.appearance, owned.defId);
      e.data.livingHull = normalizeLivingHull(owned.livingHull, this.state.simTime || 0);
      this.recomputeEntity(e.id, owned.fittings);
    }
    if (isTransition) {
      this.publishActiveRoleContext({
        source: 'active_ship_changed',
        previousDefId: previousOwned && previousOwned.defId,
        announce: true,
      });
    }
    return true;
  },

  setShipAppearance({ shipIndex = null, appearance = null } = {}) {
    const owned = this.ownedShip(shipIndex);
    if (!owned) return false;
    const normalized = normalizeShipAppearance(appearance, owned.defId);
    if (shipAppearanceSignature(owned.appearance, owned.defId)
        === shipAppearanceSignature(normalized, owned.defId)) return true;
    owned.appearance = normalized;
    const index = shipIndex == null ? this.state.player.activeShipIndex : shipIndex;
    if (index === this.state.player.activeShipIndex) {
      const entity = this.activeShipEntity();
      if (entity && entity.data) entity.data.appearance = normalized;
      if (entity) this.bus.emit('ship:appearanceChanged', { id: entity.id, appearance: normalized });
    }
    this.bus.emit('ship:appearanceSaved', { shipIndex: index, appearance: normalized });
    return true;
  },

  /** Install the bounded per-hull appearance presets projected by New Run+. Ships remains the
   * appearance writer: the projection contains no live entity ids and cannot mutate a prior hull. */
  applyNewGamePlusCosmetics(cosmetics) {
    const p = this.state.player;
    if (!p) return 0;
    const presets = {};
    for (const row of Array.isArray(cosmetics) ? cosmetics.slice(0, 32) : []) {
      const defId = row && typeof row.defId === 'string' ? row.defId : null;
      if (!defId || !SHIP_BY_ID.has(defId) || presets[defId]) continue;
      presets[defId] = normalizeShipAppearance(row.appearance, defId);
    }
    p.cosmeticPresets = presets;
    for (const owned of Array.isArray(p.ownedShips) ? p.ownedShips : []) {
      if (owned && presets[owned.defId]) owned.appearance = presets[owned.defId];
    }
    this.recomputeActiveShip();
    this.bus.emit('ship:newGamePlusCosmeticsApplied', { count: Object.keys(presets).length });
    return Object.keys(presets).length;
  },

  // ---- outfitting: fit / unfit modules ----------------------------------------------------

  moduleFitBlocker({ shipIndex, slotIndex, def }) {
    const owned = this.ownedShip(shipIndex);
    if (!owned || !def) return { reason: 'missing_fit_target', text: null };
    const shipDef = SHIP_BY_ID.get(owned.defId);
    const slot = buildSlotList(shipDef)[slotIndex];
    if (!slot) return { reason: 'unknown_slot', text: null };
    if (!fits(slot, def)) {
      return { reason: 'incompatible_slot', text: def.name + ' does not fit this slot' };
    }
    if (!this.isUnlocked(def)) {
      return { reason: 'research_required', text: 'Research required: ' + techDisplayName(def.requiresTech) };
    }
    const conflictingDef = findMasslineHeadConflict(owned.fittings, slotIndex, def);
    if (conflictingDef) {
      return {
        reason: 'massline_head_conflict',
        text: 'Unfit ' + conflictingDef.name + ' before fitting another head',
      };
    }
    const prospective = { ...owned, fittings: (owned.fittings || []).slice() };
    prospective.fittings[slotIndex] = def.id;
    const budgetBlocker = outfitBudgetBlocker(shipDef, prospective.fittings);
    if (budgetBlocker) return budgetBlocker;
    if (this.wouldOverflowCargo(prospective)) {
      return { reason: 'cargo_overflow', text: 'Cargo would overflow — jettison first' };
    }
    return null;
  },

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
    const blocker = this.moduleFitBlocker({ shipIndex, slotIndex, def });
    if (blocker) {
      if (blocker.text) this.bus.emit('toast', { text: blocker.text, kind: 'error', ttl: 3 });
      return false;
    }

    const existing = owned.fittings[slotIndex];

    // remove the module from inventory if it came from there
    const fittedInventoryItem = invIdx >= 0 ? p.moduleInventory.splice(invIdx, 1)[0] : null;

    owned.fittings[slotIndex] = defId;

    // Unfit whatever previously occupied the slot back to inventory after validation succeeds.
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
      appearance: defaultShipAppearance(NEW_GAME.shipId),
      livingHull: defaultLivingHull(this.state.simTime || 0),
    }];
    p.activeShipIndex = 0;
    p.moduleInventory = [];
    delete p.cosmeticPresets;
    p.researchedNodes = (NEW_GAME.researchedNodes || []).slice();
    p.researchPoints = NEW_GAME.researchPoints || 0;
    // Keep the deterministic empty route byte-stable. The first earned feat lazily materializes
    // this saved subtree; New Game only has to remove prior-run progress.
    delete p.techProgression;
    p.droneTierCap = 0;
    p.efficiencyMods = { miningYieldMult: 1, shieldRegenMult: 1, energyRegenMult: 1, cargoCapMult: 1, tradeFeeMult: 1 };
    // One-time New Game role packet for presentationAdapters (no permanent HUD, no mission text).
    this.publishActiveRoleContext({ source: 'new_game', announce: true });
  },

  /** Place each default-fitted module/weapon defId into its first compatible empty slot. */
  fittingsFromDefaults(defId, moduleIds) {
    return fittingsFromDefaultModules(defId, moduleIds);
  },
};

// ---- small utils ---------------------------------------------------------------------------

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

function branchLabel(branchId) {
  return TECH_BRANCHES.find((entry) => entry.id === branchId)?.label || String(branchId || 'Research');
}

/** Best-effort identity when a save carries a hull outside the live lattice (legacy / missing). */
function legacyRoleIdentity(defId) {
  if (defId == null || defId === '') return null;
  const def = SHIP_BY_ID.get(defId);
  const role = String((def && def.role) || 'multirole');
  const name = (def && def.name) || String(defId);
  const roleLabel = role
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Multirole';
  return Object.freeze({
    name,
    role,
    roleLabel,
    flightClass: flightClassForHull(def || defId) || 'medium',
    identityLine: 'Restored hull using a best-effort role read for a missing lattice entry.',
    shortWhy: 'Fly the restored hull; verify loadout at the next shipyard.',
    signatureVerb: 'Fly the restored hull; verify loadout at the next shipyard.',
    counterplay: 'Treat unfamiliar or legacy hulls cautiously until fittings are confirmed.',
    weaknesses: Object.freeze(['Unverified legacy loadout']),
    primaryCareers: Object.freeze(['hauler', 'hunter', 'prospector']),
    rolePath: null,
    fallback: true,
  });
}

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
  e.propulsion = d.propulsion;
  e.radius = d.radius; e.mass = d.mass;
  syncDerivedPhysicsMass(e, d.operationalMass, d.flightModel && d.flightModel.inertia);
}

/** Apply only fields that depend on operational mass; cargo churn must not rebuild combat/runtime
 * arrays or emit the broad refit events owned by recomputeEntity(). */
function copyOperationalMassOntoEntity(e, d) {
  e.thrust = d.thrust; e.turnRate = d.turnRate; e.maxSpeed = d.maxSpeed; e.drag = d.drag;
  e.bankFactor = d.bankFactor;
  e.flightClass = d.flightClass;
  e.flightModel = d.flightModel;
  e.propulsion = d.propulsion;
  e.mass = d.operationalMass;
  syncDerivedPhysicsMass(e, d.operationalMass, d.flightModel && d.flightModel.inertia);
}
