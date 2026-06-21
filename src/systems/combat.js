// combat system: the damage pipeline (shield→armor→hull), shield/cap regen, death + loot +
// player respawn, and enemy spawn builders. Consumes projectile:hit from physics (ARCHITECTURE §2.3
// step 8, §4.4). Single source of health mutation for ships/stations/drones.
import { WEAPONS } from '../data/weapons.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { SHIPS } from '../data/ships.js';
import { MODULES } from '../data/modules.js';
import { makeShipEntitySpec, fittingsFromWeapons } from './ships.js';
import { removeCargo } from './cargo.js';
import { mulberry32, hash32 } from '../core/rng.js';
import { getCombatKernel } from '../combat/kernel.js';
import { legacyHitToDamagePacket } from '../combat/damage.js';

const WPN = new Map(WEAPONS.map((w) => [w.id, w]));
const ENEMY = new Map(ENEMY_TYPES.map((e) => [e.id, e]));
const SHIP = new Map(SHIPS.map((s) => [s.id, s]));
const MOD = new Map(MODULES.map((m) => [m.id, m]));
const CARGO_LOSS_RATE = 0.5;
const BASE_AI_CAPABILITIES = Object.freeze(['drive', 'sensor', 'weapon']);
const ARCHETYPE_TACTICAL_CAPABILITIES = Object.freeze({
  swarmer: Object.freeze(['counter_tether_overload', 'ranged', 'screen']),
  sniper: Object.freeze(['ranged']),
  brawler: Object.freeze(['disable', 'ranged']),
  fleeing_trader: Object.freeze(['ranged', 'screen']),
  pirate: Object.freeze(['counter_tether_overload', 'ranged', 'screen']),
  miniboss_capital: Object.freeze(['disable', 'ranged', 'screen']),
});

/** Scale an enemy archetype's base stats by encounter level. */
export function scaleCombatant(def, level) {
  const f = 1 + 0.12 * Math.max(0, (level || 1) - 1);
  return { hull: Math.round((def.hull || 100) * f), armor: Math.round((def.armor || 0) * f), shield: Math.round((def.shield || 0) * f), dmgMult: f };
}

function resolveEnemyWeapon(w, slotIndex) {
  const base = WPN.get(w.id);
  if (!base) return null;
  // Phase 2 hardpoint fields: enemy ships have no per-hull facing data, so default front + the
  // standard fixed-gun gimbal arc (they gimbal toward their AI lead angle, like the player does).
  // An enemy entry may force a turret mount via w.turret:true (e.g. capital boss broadside beams).
  const isTurret = base.tracking === 'auto_turret' || !!w.turret;
  const isHoming = base.tracking === 'homing';
  const facing = isTurret ? 'turret' : 'front';
  const gimbalArc = isTurret ? (base.turretArcDeg || 180) * Math.PI / 180
    : (isHoming ? Math.PI : 22 * Math.PI / 180);
  return {
    ...base, slotIndex, defId: w.id,
    facing, facingAngle: facing === 'turret' ? 0 : 0, gimbalArc,
    muzzleOffset: [0.8, 0],
    dmg: w.dmgOverride ?? base.dmg,
    rof: w.rofOverride ?? base.rof,
    projSpeed: w.projSpeedOverride ?? base.projSpeed,
    range: w.rangeOverride ?? base.range,
    spread: base.spreadDeg ?? 0,
    tracking: isTurret ? 'auto_turret' : (base.tracking || 'fixed'),
    arc: isTurret ? { turret: base.turretArcDeg || 180 } : 'fixed',
    heatMax: base.heatMax ?? 100, lockTimeS: base.lockTimeS ?? 0,
    _cooldown: 0, _heat: 0,
  };
}

/** Build a spawnEntity spec for a hostile NPC (team 1) from an enemy archetype id. */
export function makeEnemySpawnSpec(enemyTypeId, level, pos) {
  const def = ENEMY.get(enemyTypeId) || ENEMY_TYPES[0];
  level = level || (def.levelRange ? def.levelRange[0] : 1);
  const s = scaleCombatant(def, level);
  const factionId = def.factionLawful ? 'faction_scn' : 'faction_vael';
  const spec = makeShipEntitySpec(def.shipId, { team: 1, factionId, pos, ai: { archetype: def.aiArchetype } });
  spec.hull = spec.hullMax = s.hull;
  spec.armorHp = spec.armorMax = s.armor;
  spec.armorFlat = def.armorFlat || 0;
  spec.shield = spec.shieldMax = s.shield;
  spec.shieldRegenRate = def.shieldRegen || 0;
  spec.shieldRegenDelay = def.shieldRegenDelay || 3;
  spec.cap = spec.capMax = def.cap || 80;
  spec.capRegen = def.capRegen || 20;
  if (def.maxSpeed) spec.maxSpeed = def.maxSpeed;
  if (def.accel) spec.thrust = def.accel;
  if (def.turnRate) spec.turnRate = def.turnRate;
  if (def.collisionRadius) spec.radius = def.collisionRadius;
  if (def.mass) spec.mass = def.mass;
  spec.drag = spec.drag || 1.25;
  // Expand weapon entries by their declared count so a boss that lists {id,count:4} actually gets 4
  // independent weapon instances (each with its own cooldown/heat), not 1. (Phase-2 audit fix.)
  const ws = [];
  {
    let idx = 0;
    for (const w of (def.weapons || [])) {
      const n = Math.max(1, w.count || 1);
      for (let k = 0; k < n; k++) {
        const rw = resolveEnemyWeapon(w, idx++);
        if (rw) ws.push(rw);
      }
    }
  }
  spec.data = spec.data || {};
  if (ws.length) spec.data.weapons = ws;
  // Keep the render-facing fittings in sync with the NPC's assigned weapons so its barrels render
  // at the right hardpoints (combat bypasses the fittings path that the player shipyard uses).
  const shipDef = SHIP.get(def.shipId) || SHIPS.find((s) => s.id === def.shipId);
  if (shipDef) spec.data.fittings = fittingsFromWeapons(shipDef, ws);
  // Visual tier scales with danger level: a tougher enemy (higher level) reads as an upgraded Mk.II/III
  // hull so higher-danger zones are visibly more threatening. Maps level→minTier thresholds (≈Mk.II at
  // L6, Mk.III at L12). Player ships are unaffected (they sum their own fitted module tiers).
  spec.data.visualTier = Math.max(0, Math.round((level - 1) * 1.8));
  spec.data.miningBeam = null;
  spec.data.ai = {
    archetype: def.aiArchetype,
    lawful: !!def.factionLawful,
    capabilities: tacticalCapabilitiesFor(def),
  };
  spec.data.bountyCr = def.bountyCr || 0;
  spec.data.loot = def.loot || null;
  spec.data.lootTableId = def.id;
  spec.data.shipClass = def.shipClass || 'fighter';
  if (def.reinforcements) spec.data.reinforcements = { ...def.reinforcements };
  spec.data.level = level;
  // Enemy silhouette override (graphics spec Workstream D): when present, the render track
  // draws the enemy as its OWN hostile family instead of the player ship-def's family. Gameplay
  // stats still come from shipId; only the appearance changes.
  if (def.silhouette) spec.data.silhouette = def.silhouette;
  spec.factionId = factionId;
  return spec;
}

function tacticalCapabilitiesFor(def) {
  const caps = new Set(BASE_AI_CAPABILITIES);
  if (Array.isArray(def.weapons) && def.weapons.length) caps.add('ranged');
  for (const capability of ARCHETYPE_TACTICAL_CAPABILITIES[def.aiArchetype] || []) caps.add(capability);
  if (def.factionLawful) caps.add('disable');
  if (def.reinforcements) caps.add('screen');
  if (def.shipClass === 'capital') {
    caps.add('disable');
    caps.add('screen');
  }
  return [...caps].sort();
}

function qrange(range, r) { if (!range) return 1; const [lo, hi] = range; return Math.round(lo + (hi - lo) * r()); }

function catalogValue(id) {
  const def = SHIP.get(id) || WPN.get(id) || MOD.get(id);
  if (!def) return 0;
  return Math.max(0, Math.round((def.buyback != null ? def.buyback : def.price) || 0));
}

function setVecXZ(vec, x, z) {
  if (!vec) return;
  if (typeof vec.set === 'function') vec.set(x, 0, z);
  else { vec.x = x; vec.y = 0; vec.z = z; }
}

export const combat = {
  name: 'combat',
  init(ctx) {
    this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    this.registry = ctx.registry || null;
    this.rng = mulberry32(hash32(ctx.state.meta.seed, 'combat'));
    this.kernel = getCombatKernel(ctx, { onKill: (target, killerId) => this.kill(target, killerId) });
    ctx.bus.on('projectile:hit', (p) => this.onHit(p));
    ctx.bus.on('dock:docked', (p) => this.rememberRespawnStation(p && p.stationId));
  },

  // Transitional adapter: authored projectile/beam packets are routed directly; older scalar hit
  // producers still pass through the legacy bridge until their emitters migrate.
  onHit({ targetId, ownerId, damage, damageType, pos, penetration = 0, impulse = null, heat = 0, statuses = [], damagePacket = null, packet = null, weaponId = null, origin = null }) {
    const authoredPacket = damagePacket || packet || null;
    const result = this.ensureKernel().routeDamage({
      attackerId: ownerId,
      targetId,
      packet: authoredPacket
        ? damagePacketWithHit(authoredPacket, pos)
        : legacyHitToDamagePacket({ damage, damageType, pos, penetration, impulse, heat, statuses }),
      origin: origin || (authoredPacket
        ? { kind: 'weapon', id: weaponId || (authoredPacket.source && authoredPacket.source.weaponId) || 'projectile:hit' }
        : { kind: 'legacy', id: 'projectile:hit' }),
    });
    if (result.ok && targetId === this.state.playerId) {
      this.bus.emit('camera:shake', { amount: result.shieldBroke ? 0.4 : 0.2 });
    }
    return result;
  },

  ensureKernel() {
    if (this.kernel) return this.kernel;
    const helpers = this.helpers || (this.helpers = {});
    this.kernel = getCombatKernel({
      state: this.state,
      bus: this.bus,
      helpers,
      registry: this.registry || null,
    }, { onKill: (target, killerId) => this.kill(target, killerId) });
    return this.kernel;
  },

  kill(t, killerId) {
    const state = this.state, bus = this.bus, d = t.data || {};
    if (t.id === state.playerId) { this.respawnPlayer(t, killerId); return; }
    if (!t.alive) return;
    t.alive = false;
    const killedByPlayer = killerId === state.playerId;
    const factionLawful = !!(d.ai && d.ai.lawful);
    bus.emit('entity:killed', {
      id: t.id, killerId, type: t.type, pos: { x: t.pos.x, z: t.pos.z },
      factionId: t.factionId, factionLawful, bountyCr: d.bountyCr || 0,
      lootTableId: d.lootTableId || null, victimClass: d.shipClass || t.type,
    });
    bus.emit('camera:shake', { amount: 0.5 });
    const bounty = Math.max(0, Math.round(d.bountyCr || 0));
    if (bounty > 0 && killedByPlayer) bus.emit('economy:grantCredits', { amount: bounty, reason: 'bounty' });
    if (d.loot) {
      const { credits, items } = this.rollLoot(d.loot);
      const creditedLoot = killedByPlayer ? credits : 0;
      if (creditedLoot > 0) bus.emit('economy:grantCredits', { amount: creditedLoot, reason: 'loot' });
      bus.emit('loot:drop', { pos: { x: t.pos.x, z: t.pos.z }, credits: creditedLoot, items });
      for (const it of items) {
        const ang = this.rng() * Math.PI * 2, sp = 18 + this.rng() * 28;
        const kind = lootPickupKind(it.id);
        this.helpers.spawnEntity({
          type: 'pickup', pos: { x: t.pos.x + Math.cos(ang) * 8, z: t.pos.z + Math.sin(ang) * 8 },
          vel: { x: Math.cos(ang) * sp, z: Math.sin(ang) * sp }, radius: 2.2,
          data: { kind, commodityId: it.id, amount: it.qty, despawnAt: state.simTime + 30 },
        });
      }
    }
  },

  rollLoot(loot) {
    const r = this.rng;
    const cr0 = (loot.creditsRange && loot.creditsRange[0]) || 0;
    const cr1 = (loot.creditsRange && loot.creditsRange[1]) || 0;
    const credits = Math.round(cr0 + (cr1 - cr0) * r());
    const items = [];
    for (const g of (loot.guaranteed || [])) items.push({ id: g.id, qty: qrange(g.qtyRange, r) });
    for (const drop of (loot.drops || [])) if (r() < (drop.chance ?? 0)) items.push({ id: drop.id, qty: qrange(drop.qtyRange, r) });
    return { credits, items };
  },

  respawnPlayer(t, killerId) {
    const state = this.state, bus = this.bus;
    bus.emit('player:death', { pos: { x: t.pos.x, z: t.pos.z }, killerId });
    const stationId = this.respawnStationId();
    const respawnPos = this.respawnPosition(stationId);
    const refundCr = this.insuranceRefund(t);
    const cargoLostQty = this.applyRespawnCargoLoss();
    if (refundCr > 0) bus.emit('economy:grantCredits', { amount: refundCr, reason: 'insurance:respawn' });
    t.hull = t.hullMax; t.shield = t.shieldMax; t.cap = t.capMax;
    setVecXZ(t.pos, respawnPos.x, respawnPos.z);
    setVecXZ(t.vel, 0, 0);
    if (t.prevPos && typeof t.prevPos.copy === 'function') t.prevPos.copy(t.pos);
    else setVecXZ(t.prevPos, respawnPos.x, respawnPos.z);
    t.flags.invuln = true; t._invulnUntil = state.simTime + 3;
    bus.emit('player:respawn', {
      stationId,
      shipId: t.data && t.data.defId,
      refundCr,
      cargoLost: cargoLostQty > 0,
      cargoLostQty,
    });
    bus.emit('camera:shake', { amount: 0.8 });
  },

  rememberRespawnStation(stationId) {
    if (!stationId) return;
    const player = this.state && this.state.player;
    if (!player) return;
    const ins = player.insurance || (player.insurance = { rate: 0.6, deductibleCr: 500, insuredModules: false, lastStationId: null });
    ins.lastStationId = stationId;
  },

  respawnStationId() {
    const player = this.state && this.state.player;
    const ins = player && player.insurance;
    if (ins && ins.lastStationId) return ins.lastStationId;
    const stations = this.state && this.state.world && this.state.world.activeSector && this.state.world.activeSector.stations;
    return stations && stations[0] ? stations[0].stationId || null : null;
  },

  respawnPosition(stationId) {
    const stations = this.state && this.state.world && this.state.world.activeSector && this.state.world.activeSector.stations;
    const station = stationId && stations && stations.find((s) => s.stationId === stationId);
    const pos = station && station.pos;
    return pos ? { x: pos.x || 0, z: pos.z || 0 } : { x: 0, z: 0 };
  },

  insuranceRefund(t) {
    const player = this.state && this.state.player;
    const ins = player && player.insurance;
    if (!player || !ins || !ins.insuredModules) return 0;
    const owned = (player.ownedShips || [])[player.activeShipIndex || 0] || {};
    const shipId = owned.defId || (t.data && t.data.defId);
    const shipValue = catalogValue(shipId);
    let moduleValue = 0;
    for (const id of (owned.fittings || [])) {
      if (id) moduleValue += catalogValue(id);
    }
    const rate = Math.max(0, Number(ins.rate) || 0);
    const deductible = Math.max(0, Math.round(ins.deductibleCr || 0));
    return Math.max(0, Math.round(rate * (shipValue + moduleValue) - deductible));
  },

  applyRespawnCargoLoss() {
    const cargo = this.state && this.state.player && this.state.player.cargo;
    if (!cargo || !cargo.items) return 0;
    let lost = 0;
    for (const id of Object.keys(cargo.items)) {
      const have = Math.max(0, Math.floor(cargo.items[id] || 0));
      const qty = Math.floor(have * CARGO_LOSS_RATE);
      if (qty > 0) lost += removeCargo(this.state, id, qty);
    }
    return lost;
  },

  update(dt, state) {
    const ships = (state.entityIndex && state.entityIndex.ships) || state.entityList;
    for (const e of ships) {
      if (e.type !== 'ship' || !e.alive) continue;
      if (e.flags.invuln && e._invulnUntil != null && state.simTime >= e._invulnUntil) e.flags.invuln = false;
      if (e.shieldMax > 0 && e.shield < e.shieldMax && state.simTime - (e.lastDamageT || -1e9) >= (e.shieldRegenDelay || 3)) {
        e.shield = Math.min(e.shieldMax, e.shield + (e.shieldRegenRate || 0) * dt);
      }
      if (e.capMax > 0 && e.cap < e.capMax) {
        const regenMult = this.kernel ? this.kernel.capRegenMultiplier(e.id) : 1;
        e.cap = Math.min(e.capMax, e.cap + (e.capRegen || 0) * regenMult * dt);
      }
    }
    this._applyBeamDamage(state);
    if (this.kernel) this.kernel.postPhysics(dt);
  },

  // Continuous beam weapons (weapons.js) push a ray per firing beam into state.combat.beams each tick
  // with a dpsThisTick value; weapons clears the list at the start of its update, so this consumes the
  // current tick's beams (weapons runs before combat in UPDATE_ORDER). Each beam damages the FIRST
  // entity along its path. Without this sweep, beam weapons (and the Dreadnought's heavy beams) deal
  // zero damage — only writes, no reads.
  _applyBeamDamage(state) {
    const beams = state.combat && state.combat.beams;
    if (!beams || !beams.length) return;
    for (let i = 0; i < beams.length; i++) {
      const beam = beams[i];
      if (!beam || !beam.from || !beam.to || !(beam.dpsThisTick > 0)) continue;
      const ax = beam.from.x, az = beam.from.z;
      const dx = beam.to.x - ax, dz = beam.to.z - az;
      const len2 = dx * dx + dz * dz || 1e-6;
      const owner = state.entities.get(beam.ownerId);
      const ownerTeam = owner ? owner.team : null;
      let bestT = Infinity, bestE = null;
      const damageables = (state.entityIndex && state.entityIndex.damageables) || state.entityList;
      for (const e of damageables) {
        if (!e.alive) continue;
        if (e.type !== 'ship' && e.type !== 'station' && e.type !== 'drone') continue;
        if (e.id === beam.ownerId) continue;
        if (ownerTeam != null && e.team === ownerTeam) continue; // no friendly fire
        let t = ((e.pos.x - ax) * dx + (e.pos.z - az) * dz) / len2;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        const px = e.pos.x - (ax + dx * t), pz = e.pos.z - (az + dz * t);
        const rr = (e.radius || 6) + 2;
        if (px * px + pz * pz <= rr * rr && t < bestT) { bestT = t; bestE = e; }
      }
      if (bestE) {
        this.onHit({
          targetId: bestE.id,
          ownerId: beam.ownerId,
          damage: beam.dpsThisTick,
          damageType: beam.dmgType || 'energy',
          damagePacket: beam.damagePacket || null,
          weaponId: beam.weaponId || null,
          pos: { x: ax + dx * bestT, z: az + dz * bestT },
        });
      }
    }
  },
};

function lootPickupKind(id) {
  return (typeof id === 'string' && id.startsWith('cmdty_')) ? 'cargo' : 'module';
}

function damagePacketWithHit(packet, pos) {
  if (!pos) return packet;
  return {
    ...packet,
    channels: { ...(packet.channels || {}) },
    statuses: (packet.statuses || []).map((status) => ({ ...status })),
    flags: packet.flags ? { ...packet.flags } : undefined,
    source: packet.source ? { ...packet.source } : undefined,
    hit: {
      ...(packet.hit || {}),
      pos: { x: Number(pos.x) || 0, z: Number(pos.z) || 0 },
    },
    impulse: packet.impulse ? { ...packet.impulse } : packet.impulse,
  };
}
