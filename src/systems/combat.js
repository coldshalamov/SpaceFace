// combat system: the damage pipeline (shield→armor→hull), shield/cap regen, death + loot +
// player respawn, and enemy spawn builders. Consumes projectile:hit from physics (ARCHITECTURE §2.3
// step 8, §4.4). Single source of health mutation for ships/stations/drones.
import { WEAPONS } from '../data/weapons.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { makeShipEntitySpec } from './ships.js';
import { mulberry32, hash32 } from '../core/rng.js';

const WPN = new Map(WEAPONS.map((w) => [w.id, w]));
const ENEMY = new Map(ENEMY_TYPES.map((e) => [e.id, e]));

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
  spec.data.miningBeam = null;
  spec.data.ai = { archetype: def.aiArchetype };
  spec.data.bountyCr = def.bountyCr || 0;
  spec.data.loot = def.loot || null;
  spec.data.lootTableId = def.id;
  spec.data.shipClass = def.shipClass || 'fighter';
  spec.factionId = factionId;
  return spec;
}

function qrange(range, r) { if (!range) return 1; const [lo, hi] = range; return Math.round(lo + (hi - lo) * r()); }

export const combat = {
  name: 'combat',
  init(ctx) {
    this.state = ctx.state; this.bus = ctx.bus; this.helpers = ctx.helpers;
    this.rng = mulberry32(hash32(ctx.state.meta.seed, 'combat'));
    ctx.bus.on('projectile:hit', (p) => this.onHit(p));
  },

  onHit({ targetId, ownerId, damage, damageType, pos }) {
    const state = this.state, bus = this.bus;
    const t = state.entities.get(targetId);
    if (!t || !t.alive) return;
    if (t.type !== 'ship' && t.type !== 'station' && t.type !== 'drone') return; // asteroids are mined, not shot
    if (t.flags.invuln) return;
    const attacker = state.entities.get(ownerId);
    if (attacker && attacker.team === t.team) return; // no friendly fire
    t.lastDamageT = state.simTime;
    let rem = damage, brokeShield = false;
    if (t.shieldMax > 0 && t.shield > 0) {
      const a = Math.min(t.shield, rem); t.shield -= a; rem -= a;
      if (t.shield <= 0) { brokeShield = true; bus.emit('shieldDown', { combatantId: t.id }); }
    }
    if (rem > 0 && t.armorHp > 0) {
      const eff = Math.max(0, rem - (t.armorFlat || 0));
      const a = Math.min(t.armorHp, eff); t.armorHp -= a; rem = eff - a;
    }
    if (rem > 0) t.hull -= rem;
    const isPlayer = t.id === state.playerId;
    bus.emit('combat:damage', { targetId: t.id, attackerId: ownerId, amount: damage, type: damageType, brokeShield, isPlayer, pos });
    if (isPlayer) bus.emit('camera:shake', { amount: brokeShield ? 0.4 : 0.2 });
    if (t.hull <= 0) this.kill(t, ownerId);
  },

  kill(t, killerId) {
    const state = this.state, bus = this.bus, d = t.data || {};
    if (t.id === state.playerId) { this.respawnPlayer(t, killerId); return; }
    if (!t.alive) return;
    t.alive = false;
    bus.emit('entity:killed', { id: t.id, killerId, type: t.type, pos: { x: t.pos.x, z: t.pos.z }, factionId: t.factionId, bountyCr: d.bountyCr || 0, lootTableId: d.lootTableId || null, victimClass: d.shipClass || t.type });
    bus.emit('camera:shake', { amount: 0.5 });
    if (d.loot) {
      const { credits, items } = this.rollLoot(d.loot);
      if (credits > 0) bus.emit('economy:grantCredits', { amount: credits, reason: 'bounty' });
      bus.emit('loot:drop', { pos: { x: t.pos.x, z: t.pos.z }, credits, items });
      for (const it of items) {
        const ang = this.rng() * Math.PI * 2, sp = 18 + this.rng() * 28;
        this.helpers.spawnEntity({
          type: 'pickup', pos: { x: t.pos.x + Math.cos(ang) * 8, z: t.pos.z + Math.sin(ang) * 8 },
          vel: { x: Math.cos(ang) * sp, z: Math.sin(ang) * sp }, radius: 2.2,
          data: { kind: 'cargo', commodityId: it.id, amount: it.qty, despawnAt: state.simTime + 30 },
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
    t.hull = t.hullMax; t.shield = t.shieldMax; t.cap = t.capMax;
    t.pos.set(0, 0, 0); t.vel.set(0, 0, 0); t.prevPos.copy(t.pos);
    t.flags.invuln = true; t._invulnUntil = state.simTime + 3;
    bus.emit('player:respawn', { stationId: null, shipId: t.data && t.data.defId, refundCr: 0, cargoLost: false });
    bus.emit('camera:shake', { amount: 0.8 });
  },

  update(dt, state) {
    for (const e of state.entityList) {
      if (e.type !== 'ship' || !e.alive) continue;
      if (e.flags.invuln && e._invulnUntil != null && state.simTime >= e._invulnUntil) e.flags.invuln = false;
      if (e.shieldMax > 0 && e.shield < e.shieldMax && state.simTime - (e.lastDamageT || -1e9) >= (e.shieldRegenDelay || 3)) {
        e.shield = Math.min(e.shieldMax, e.shield + (e.shieldRegenRate || 0) * dt);
      }
      if (e.capMax > 0 && e.cap < e.capMax) e.cap = Math.min(e.capMax, e.cap + (e.capRegen || 0) * dt);
    }
  },
};
