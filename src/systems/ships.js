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

// Default starter weapon for a fresh player Kestrel (NEW_GAME fits no weapon; the Kestrel has a
// weapon-S slot, so the player must be able to shoot immediately — §ships task).
const STARTER_WEAPON_ID = 'wpn_pulse_laser_s';
const DEFAULT_MINING_BEAM_TIER = 'beam_mk1'; // §0.10 Kestrel mines at 18 ore-HP/s

// Handling / mass formulas. flight.js uses entity.thrust as a per-axis accel coefficient and
// vel += (a - drag*vel)*dt, so real terminal ~= thrust/drag; maxSpeed is the safety clamp.
// Constants are tuned so a fresh Kestrel (mass 18 + ion+booster+laser modules) lands on the
// current bootstrap feel: thrust~48, turnRate~3.0, maxSpeed~135, drag~1.25.
const BASE_TURN = 4.4;     // rad/s reference (before handling/mass/turnMult)
const SPEED_SCALE = 2.6;   // engine.topSpeed -> maxSpeed clamp scale
const THRUST_SCALE = 0.99; // engine.topSpeed -> thrust accel scale

/** Build the canonical list of slots [{type,size,index}] for a ship def, in a stable order
 *  (weapon, shield, engine, cargo, mining, utility) so fittings[] indices are deterministic. */
export function buildSlotList(shipDef) {
  const slots = [];
  for (const type of SLOT_TYPES) {
    const arr = (shipDef.slots && shipDef.slots[type]) || [];
    for (const size of arr) slots.push({ type, size, index: slots.length });
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

  const speedMass = 2 / (1 + massRatio);     // 1.0 at hull baseline, falls as mass grows
  const thrustMass = 1.5 / (0.5 + massRatio);
  const turnMass = 1.4 / (0.4 + massRatio);

  // (3) engine-derived movement
  const eng = engineMods(pickEngine(equipped) || FALLBACK_ENGINE);
  const maxSpeed = eng.topSpeed * SPEED_SCALE * handling * speedMass;
  const thrust = eng.topSpeed * THRUST_SCALE * eng.accelMult * handling * thrustMass;
  const turnRate = BASE_TURN * eng.turnMult * handling * turnMass;
  const drag = 0.75 + 0.30 * massRatio;

  // (4) health / energy / cargo
  const hullMax = shipDef.hull + hullFlat;
  const shieldMax = shipDef.shield + shieldFlat;
  const shieldRegenRate = (shipDef.baseShieldRegen + shieldRegenFlat) * shieldRegenMult;
  const capMax = shipDef.energyCap;
  const capRegen = shipDef.energyRegen * energyRegenMult;
  const cargoCap = Math.floor((shipDef.cargo + cargoFlat) * (1 + cargoCapPct) * cargoCapMult);

  return {
    hull: hullMax, hullMax,
    armorHp: 0, armorMax: 0, armorFlat: 0,
    shield: shieldMax, shieldMax,
    shieldRegenRate, shieldRegenDelay: 3,
    cap: capMax, capMax, capRegen,
    thrust, turnRate, maxSpeed, drag,
    mass: totalMass, radius: shipDef.collisionRadius || 14,
    cargoCap,
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
    weapons.push(makeWeaponRuntime(d, i));
  }
  // Fresh player Kestrel: NEW_GAME fits no weapon, so give a starter so the player can shoot (§task).
  if (weapons.length === 0 && isPlayer) {
    const wslot = slots.find((s) => s.type === 'weapon');
    const w = WEAPON_BY_ID.get(STARTER_WEAPON_ID);
    if (wslot && w) weapons.push(makeWeaponRuntime(w, wslot.index));
  }
  return weapons;
}

function makeWeaponRuntime(def, slotIndex) {
  return {
    slotIndex, defId: def.id,
    dmg: def.dmg, rof: def.rof, energyCost: def.energyCost,
    heat: def.heatPerShot || def.heatPerSec || 0, heatMax: def.heatMax || 100,
    projSpeed: def.projSpeed, range: def.range, spread: def.spreadDeg || 0,
    tracking: def.tracking || 'fixed', lockTimeS: def.lockTimeS || 0,
    damageType: def.damageType, arc: def.turretArcDeg ? { turret: def.turretArcDeg } : 'fixed',
    _cooldown: 0, _heat: 0,
  };
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
    // flat health/energy/flight fields (flight + physics read these directly) — §shared shape
    hull: derived.hull, hullMax: derived.hullMax,
    armorHp: derived.armorHp, armorMax: derived.armorMax, armorFlat: derived.armorFlat,
    shield: derived.shield, shieldMax: derived.shieldMax,
    shieldRegenRate: derived.shieldRegenRate, shieldRegenDelay: derived.shieldRegenDelay,
    cap: derived.cap, capMax: derived.capMax, capRegen: derived.capRegen,
    thrust: derived.thrust, turnRate: derived.turnRate, maxSpeed: derived.maxSpeed, drag: derived.drag,
    data: {
      defId: shipDef.id,
      derived,
      weapons,
      miningBeam,
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

    e.data.derived = derived;
    e.data.weapons = buildWeaponList(SHIP_BY_ID.get(defId) || SHIP_BY_ID.get('ship_kestrel'), fit, isPlayer);
    e.data.miningBeam = buildMiningBeam(SHIP_BY_ID.get(defId) || SHIP_BY_ID.get('ship_kestrel'), fit, isPlayer);

    this.bus.emit('ship:statsChanged', { shipId: e.id, derived });
    this.bus.emit('ship:cargoCapChanged', { shipId: e.id, cargoCap: derived.cargoCap });
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

  // ---- shipyard: buy / sell ship ----------------------------------------------------------

  buyShip({ defId, setActive = false }) {
    const def = SHIP_BY_ID.get(defId);
    const p = this.state.player;
    if (!def) return false;
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
    const slots = buildSlotList(def);
    p.ownedShips.push({ defId, fittings: new Array(slots.length).fill(null) });
    const newIndex = p.ownedShips.length - 1;
    this.bus.emit('ship:purchased', { defId, price });
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
    if (!p.ownedShips[index]) return false;
    p.activeShipIndex = index;
    // re-derive the player entity onto the new hull if it exists
    const e = this.state.entities.get(this.state.playerId);
    if (e) {
      e.data.defId = p.ownedShips[index].defId;
      this.recomputeEntity(e.id, p.ownedShips[index].fittings);
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

    // unfit whatever currently occupies the slot back to inventory (free)
    const existing = owned.fittings[slotIndex];
    if (existing) p.moduleInventory.push({ instanceId: this.nextInstanceId(), defId: existing });

    // remove the module from inventory if it came from there
    if (invIdx >= 0) p.moduleInventory.splice(invIdx, 1);

    owned.fittings[slotIndex] = defId;

    // cargo-overflow guard for downsizing cargo capacity (§ fitting rule) — only matters on the
    // active flown ship; veto is a soft check against current usedVolume.
    if (this.wouldOverflowCargo(owned)) {
      // revert
      owned.fittings[slotIndex] = existing;
      if (invIdx >= 0) p.moduleInventory.push({ instanceId, defId });
      this.bus.emit('toast', { text: 'Cargo would overflow — jettison first', kind: 'error', ttl: 3 });
      return false;
    }

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

  /** Place each default-fitted module defId into its first compatible empty slot. */
  fittingsFromDefaults(defId, moduleIds) {
    const shipDef = SHIP_BY_ID.get(defId) || SHIP_BY_ID.get('ship_kestrel');
    const slots = buildSlotList(shipDef);
    const fittings = new Array(slots.length).fill(null);
    for (const mid of moduleIds) {
      const def = defById(mid);
      if (!def) continue;
      const idx = slots.findIndex((s, i) => fittings[i] == null && fits(s, def));
      if (idx >= 0) fittings[idx] = mid;
    }
    return fittings;
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
  e.radius = d.radius; e.mass = d.mass;
}
