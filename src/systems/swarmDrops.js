// Swarm enemy drops system (EC-A01-03)
// Things that fall out of enemies in the Pit (design/game/12_SWARM_THE_PIT.md).
//
// Drops are rare (at most 1 per 12 kills), at most 2 alive at once on the board,
// TTL 12 s, chosen with state.rng (equal weights, free_forge at 1/4 weight).
// Built on the same seam as swarmSupply repair cells.

import { mulberry32 } from '../core/rng.js';
import { WEAPONS } from '../data/weapons.js';

const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));

function restoreHeavyHands(w) {
  const saved = w && w._heavyHandsSaved;
  if (!saved) return;
  if (saved.own) w.impulsePerHit = saved.value;
  else delete w.impulsePerHit;
  delete w._heavyHandsSaved;
}
import { validateRunState } from '../core/runState.js';
import { runOwnsReward, createRewardDeathLedger } from '../combat/rewardEligibility.js';
import { isSwarmRuleset } from './survivalSwarm.js';
import { addCargo } from './cargo.js';
import {
  SWARM_DROP_KIND,
  SWARM_DROP_INTERVAL,
  SWARM_DROP_MAX_LIVE,
  SWARM_DROP_TTL_S,
  SWARM_DROP_DEFS,
  SWARM_DROP_BY_ID,
  selectSwarmDrop,
} from '../data/swarmDrops.js';

function liveSwarmRun(state) {
  if (!state) return null;
  const run = state.run;
  if (!run || typeof run !== 'object' || Array.isArray(run)) return null;
  if (run.kind !== 'survival') return null;
  if (run.phase === 'inactive') return null;
  if (!isSwarmRuleset(run.ruleset)) return null;
  if (!validateRunState(run).ok) return null;
  return run;
}

export const swarmDrops = {
  name: 'swarmDrops',
  id: 'swarmDrops',

  init(ctx) {
    this.destroy();
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || null;
    this.registry = ctx.registry || null;
    this._unsubs = [];
    this._reset();
    if (!this.bus || typeof this.bus.on !== 'function') return;

    this._unsubs.push(this.bus.on('entity:killed', (p) => this._onKilled(p)));
    this._unsubs.push(this.bus.on('swarm:broodKills', (p) => this._onBroodKills(p)));
    this._unsubs.push(this.bus.on('entity:spawned', (p) => this._onSpawned(p)));
    this._unsubs.push(this.bus.on('pickup:collected', (p) => this._onCollected(p)));
    this._unsubs.push(this.bus.on('entity:destroyed', (p) => this._onDestroyed(p)));
    this._unsubs.push(this.bus.on('massline:throw', (p) => this._onThrow(p)));
    this._unsubs.push(this.bus.on('combat:collisionConsequence', (p) => this._onCollision(p)));
    this._unsubs.push(this.bus.on('physics:impact', (p) => this._onImpact(p)));
    this._unsubs.push(this.bus.on('run:awardRequested', (p) => this._onAwardRequested(p)));
    // A save taken mid-Heavy-Hands reloads without the 20 s timer: put every gun back.
    this._unsubs.push(this.bus.on('save:loaded', () => {
      const player = this._player && this._player();
      if (player && player.data && Array.isArray(player.data.weapons)) {
        for (const w of player.data.weapons) restoreHeavyHands(w);
      }
      this._heavyHandsActive = false;
      this._heavyHandsUntil = null;
    }));
    this._unsubs.push(this.bus.on('run:ended', () => this._reset()));
  },

  destroy() {
    for (const off of this._unsubs || []) if (typeof off === 'function') off();
    this._unsubs = [];
    this._resetTimedEffects();
  },

  newGame() {
    this._reset();
  },

  update(dt) {
    const now = Number.isFinite(this.state?.simTime) ? this.state.simTime : 0;
    this._checkHeavyHandsExpiration(now);
    this._checkDeadWeightExpiration(now);
    this._checkDoubleScrapExpiration(now);
    this._tickTurrets(now);
    this._cleanExpiredDrops(now);
  },

  killsSinceDrop() {
    return this._sinceDrop;
  },

  liveDropCount() {
    return this._live.size;
  },

  liveDropIds() {
    return Array.from(this._live);
  },

  isHeavyHandsActive() {
    const now = Number.isFinite(this.state?.simTime) ? this.state.simTime : 0;
    return Boolean(this._heavyHandsActive && this.state && now < this._heavyHandsUntil);
  },

  isDeadWeightActive() {
    const now = Number.isFinite(this.state?.simTime) ? this.state.simTime : 0;
    return Boolean(this._deadWeightActive && this.state && now < this._deadWeightUntil);
  },

  isDoubleScrapActive() {
    const now = Number.isFinite(this.state?.simTime) ? this.state.simTime : 0;
    return Boolean(this._doubleScrapActive && this.state && now < this._doubleScrapUntil);
  },

  activeTurretCount() {
    return this._turrets.size;
  },

  _reset() {
    this._sinceDrop = 0;
    this._dropIndex = 0;
    this._live = new Set();
    this._spent = new Set();
    this._liveDrops = new Map();
    this._deathLedger = createRewardDeathLedger();
    this._thrownBodies = new Map();
    this._turrets = new Set();
    this._resetTimedEffects();
  },

  _resetTimedEffects() {
    if (this._heavyHandsActive) {
      const player = this._player();
      if (player?.data?.weapons) {
        for (const w of player.data.weapons) restoreHeavyHands(w);
      }
    }
    this._heavyHandsActive = false;
    this._heavyHandsUntil = null;
    this._deadWeightActive = false;
    this._deadWeightUntil = null;
    this._doubleScrapActive = false;
    this._doubleScrapUntil = null;
  },

  _player() {
    const state = this.state;
    if (!state || state.playerId == null || !state.entities) return null;
    return typeof state.entities.get === 'function' ? state.entities.get(state.playerId) : null;
  },

  _onKilled(payload) {
    const run = liveSwarmRun(this.state);
    if (!run) return;
    const id = payload && payload.id;
    if (id == null) return;
    const victim = (this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(id)
      : null) || payload.victim;
    if (!runOwnsReward(victim) || !this._deathLedger.claim(victim)) return;

    this._advanceDrops(run, 1, victim, payload);
  },

  _onBroodKills(payload) {
    const run = liveSwarmRun(this.state);
    if (!run || run.phase !== 'active' || this.state.mode !== 'flight' || !payload) return;
    if (payload.wave !== run.wave) return;
    const count = Number(payload.count);
    if (!Number.isFinite(count) || count < 1) return;
    this._advanceDrops(run, Math.trunc(count), null, payload);
  },

  _advanceDrops(run, count, victim, payload) {
    const pos = victim?.pos || payload?.pos;
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;

    const tally = this._sinceDrop + count;
    const earned = Math.floor(tally / SWARM_DROP_INTERVAL);
    this._sinceDrop = tally % SWARM_DROP_INTERVAL;
    if (earned <= 0) return;

    // Prune dead live drops
    for (const id of this._live) {
      const cell = this.state.entities?.get(id);
      if (!cell || cell.alive === false) {
        this._live.delete(id);
        this._liveDrops.delete(id);
      }
    }

    const budget = Math.max(0, SWARM_DROP_MAX_LIVE - this._live.size);
    const drops = Math.min(earned, budget);
    for (let i = 0; i < drops; i++) {
      this._drop(run, victim, payload);
    }
  },

  _drop(run, victim, payload) {
    const helpers = this.helpers;
    if (!helpers || typeof helpers.spawnEntity !== 'function') return;
    const pos = (victim && victim.pos) || (payload && payload.pos);
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;
    const state = this.state;
    const now = Number.isFinite(state.simTime) ? state.simTime : 0;
    const index = this._dropIndex++;

    const rng = typeof state.rng === 'function'
      ? state.rng
      : mulberry32(((run.seed >>> 0) ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0 || 1);

    const dropDef = selectSwarmDrop(rng);
    const angle = rng() * Math.PI * 2;
    const eject = 12 + rng() * 14;

    const spawned = helpers.spawnEntity({
      type: 'pickup',
      name: dropDef.name,
      pos: { x: pos.x, z: pos.z },
      vel: {
        x: (victim && victim.vel && Number.isFinite(victim.vel.x) ? victim.vel.x * 0.25 : 0)
          + Math.cos(angle) * eject,
        z: (victim && victim.vel && Number.isFinite(victim.vel.z) ? victim.vel.z * 0.25 : 0)
          + Math.sin(angle) * eject,
      },
      radius: 5,
      mass: 0.1,
      collides: true,
      tetherable: true,
      data: {
        kind: SWARM_DROP_KIND,
        dropId: dropDef.id,
        dropName: dropDef.name,
        name: dropDef.name,
        label: dropDef.name,
        amount: 1,
        swarmDrop: true,
        swarmDropIndex: index,
        despawnAt: now + SWARM_DROP_TTL_S,
        masslineTetherable: true,
        tetherable: true,
      },
    });
    const id = spawned && typeof spawned === 'object' ? spawned.id : spawned;
    if (id == null) return;
    this._live.add(id);
    this._liveDrops.set(id, dropDef);
    this._emit('swarm:dropDropped', {
      id,
      wave: run.wave,
      dropId: dropDef.id,
      name: dropDef.name,
      pos: { x: pos.x, z: pos.z },
      ttl: SWARM_DROP_TTL_S,
    });
    this._emit('audio:cue', {
      id: 'sfx_vent_chime',
      position: { x: pos.x, z: pos.z },
      gain: 0.35,
      rate: 1.1,
    });
  },

  _onSpawned(payload) {
    const entity = payload && payload.entity;
    if (!entity || entity.type !== 'pickup') return;
    if (!entity.data || entity.data.kind !== SWARM_DROP_KIND) return;
    const dropIndex = entity.data.swarmDropIndex;
    if (dropIndex != null && this._spent && this._spent.has(dropIndex)) return;
    this._live.add(entity.id);
    if (entity.data.dropId && SWARM_DROP_BY_ID.has(entity.data.dropId)) {
      this._liveDrops.set(entity.id, SWARM_DROP_BY_ID.get(entity.data.dropId));
    }
  },

  _onCollected(payload) {
    const id = payload && payload.pickupId;
    if (id == null || !this._live.has(id)) return;
    const entity = this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(id) : null;
    const dropIndex = entity?.data?.swarmDropIndex;
    const dropDef = (entity?.data?.dropId && SWARM_DROP_BY_ID.get(entity.data.dropId))
      || this._liveDrops.get(id) || null;
    this._live.delete(id);
    this._liveDrops.delete(id);
    if (entity) {
      entity.alive = false;
      if (typeof this.helpers?.removeEntity === 'function') {
        this.helpers.removeEntity(id);
      }
    }
    if (dropIndex != null) this._spent.add(dropIndex);
    const run = liveSwarmRun(this.state);
    if (!run) return;
    if (payload.collectorId != null && payload.collectorId !== this.state.playerId) return;
    const player = this._player();
    if (!player || player.alive === false) return;
    if (!dropDef) return;

    this._applyDrop(dropDef, player, entity);
  },

  _applyDrop(dropDef, player, entity) {
    const run = liveSwarmRun(this.state);
    if (!run) return;

    switch (dropDef.id) {
      case 'full_rack':
        this._applyFullRack(player);
        break;
      case 'heavy_hands':
        this._applyHeavyHands(player);
        break;
      case 'dead_weight':
        this._applyDeadWeight(player);
        break;
      case 'magnet':
        this._applyMagnet(player);
        break;
      case 'big_bang':
        this._applyBigBang(player);
        break;
      case 'double_scrap':
        this._applyDoubleScrap(player);
        break;
      case 'loose_cannon':
        this._applyLooseCannon(player);
        break;
      case 'free_forge':
        this._applyFreeForge();
        break;
    }

    this._emit('swarm:dropCollected', {
      id: entity?.id,
      dropId: dropDef.id,
      name: dropDef.name,
      wave: run.wave,
    });

    this._emit('toast', {
      text: dropDef.line,
      kind: 'good',
      ttl: 2.5,
    });
  },

  _applyFullRack(player) {
    if (player && player.data) {
      if (Array.isArray(player.data.weapons)) {
        for (const w of player.data.weapons) {
          w._cooldown = 0;
          w._heat = 0;
          if (w.ammo != null && w.ammoMax != null) w.ammo = w.ammoMax;
          if (w.ammo != null && w.maxAmmo != null) w.ammo = w.maxAmmo;
        }
      }
      delete player.data.weaponVentUntil;
      delete player.data.weaponVenting;
    }
    const state = this.state;
    if (state) {
      if (state.fields?.cooldowns) {
        for (const k of Object.keys(state.fields.cooldowns)) {
          state.fields.cooldowns[k] = 0;
        }
      }
      if (state.player?.massSeed) state.player.massSeed.cooldownUntil = 0;
      if (player?.massSeed) player.massSeed.cooldownUntil = 0;
      if (state.bombs) {
        state.bombs.cooldownUntil = 0;
        if (state.bombs.cooldowns) {
          for (const k of Object.keys(state.bombs.cooldowns)) state.bombs.cooldowns[k] = 0;
        }
      }
      if (state.player?.cargo && Number.isFinite(state.player.cargo.capVolume)) {
        try {
          addCargo(state, 'cmdty_impulse_charge', 6);
        } catch (_) {}
      }
    }
  },

  _applyHeavyHands(player) {
    const now = Number(this.state?.simTime) || 0;
    this._heavyHandsActive = true;
    this._heavyHandsUntil = now + 20;
    if (player && player.data && Array.isArray(player.data.weapons)) {
      for (const w of player.data.weapons) {
        // Double the gun's REAL knockback: its own override if it has one, else its weapon def's
        // value (weapons.js reads `w.impulsePerHit ?? def.impulsePerHit`). Remember whether the
        // instance had its own value so expiry restores exactly what was there (lead fix
        // 2026-11-11: the first version assumed 600 and wrote 600 back permanently).
        if (w._heavyHandsSaved === undefined) {
          const def = WEAPON_BY_ID.get(w.id) || null;
          const own = Number.isFinite(w.impulsePerHit);
          w._heavyHandsSaved = { own, value: own ? w.impulsePerHit : null };
          const base = own ? w.impulsePerHit : (def && Number.isFinite(def.impulsePerHit) ? def.impulsePerHit : 0);
          w.impulsePerHit = base * 2;
        }
      }
    }
  },

  _checkHeavyHandsExpiration(now) {
    if (!this._heavyHandsActive) return;
    if (this._heavyHandsUntil != null && now >= this._heavyHandsUntil) {
      this._heavyHandsActive = false;
      this._heavyHandsUntil = null;
      const player = this._player();
      if (player && player.data && Array.isArray(player.data.weapons)) {
        for (const w of player.data.weapons) restoreHeavyHands(w);
      }
    }
  },

  _applyDeadWeight(player) {
    const now = Number(this.state?.simTime) || 0;
    this._deadWeightActive = true;
    this._deadWeightUntil = now + 20;
  },

  _checkDeadWeightExpiration(now) {
    if (!this._deadWeightActive) return;
    if (this._deadWeightUntil != null && now >= this._deadWeightUntil) {
      this._deadWeightActive = false;
      this._deadWeightUntil = null;
    }
  },

  _onThrow(payload) {
    const id = payload && (payload.payloadId ?? payload.id);
    if (id != null) {
      const now = Number(this.state?.simTime) || 0;
      this._thrownBodies.set(id, now);
    }
  },

  _onCollision(payload) {
    if (!this.isDeadWeightActive()) return;
    const aId = payload?.targetId ?? payload?.aId;
    const bId = payload?.otherId ?? payload?.bId;
    if (aId == null || bId == null) return;
    this._handleDeadWeightContact(aId, bId);
  },

  _onImpact(payload) {
    if (!this.isDeadWeightActive()) return;
    const aId = payload?.aId;
    const bId = payload?.bId;
    if (aId == null || bId == null) return;
    this._handleDeadWeightContact(aId, bId);
  },

  _handleDeadWeightContact(aId, bId) {
    let thrownId = null;
    let victimId = null;
    if (this._thrownBodies.has(aId)) {
      thrownId = aId;
      victimId = bId;
    } else if (this._thrownBodies.has(bId)) {
      thrownId = bId;
      victimId = aId;
    }
    if (thrownId == null || victimId == null) return;
    if (victimId === this.state.playerId) return;

    const victim = this.state.entities?.get ? this.state.entities.get(victimId) : null;
    if (!victim || victim.alive === false) return;
    if (victim.type !== 'ship' && victim.type !== 'drone') return;

    const isHeavy = this._isHeavy(victim);
    const maxHull = Number.isFinite(victim.hullMax) && victim.hullMax > 0 ? victim.hullMax : 100;
    const damage = isHeavy ? Math.max(1, Math.round(maxHull * 0.6)) : Math.max(1, (victim.hull || maxHull) + 1000);

    this._thrownBodies.delete(thrownId);

    if (this.helpers && typeof this.helpers.routeCombatDamage === 'function') {
      this.helpers.routeCombatDamage({
        attackerId: this.state.playerId,
        targetId: victim.id,
        packet: {
          damage,
          damageType: 'kinetic',
          pos: victim.pos ? { ...victim.pos } : null,
          flags: { allowAnyTarget: true, ignoreFriendlyFire: true },
          source: { kind: 'dead_weight', id: 'dead_weight' },
        },
        origin: { kind: 'dead_weight', id: 'dead_weight' },
      });
    } else {
      victim.hull = Math.max(0, (Number.isFinite(victim.hull) ? victim.hull : maxHull) - damage);
      if (victim.hull <= 0) {
        victim.alive = false;
        this._emit('entity:killed', { id: victim.id, killerId: this.state.playerId, victim });
      }
    }
  },

  _isHeavy(ship) {
    if (!ship) return false;
    const cls = (ship.data && (ship.data.shipClass || ship.data.class || ship.data.role)) || ship.role || '';
    if (cls === 'capital' || cls === 'heavy' || cls === 'frigate' || cls === 'station') return true;
    const mass = Number(ship.mass);
    if (Number.isFinite(mass) && mass >= 100) return true;
    return false;
  },

  _applyMagnet(player) {
    if (!player || !this.state.entities) return;
    const entities = this.state.entities.values
      ? Array.from(this.state.entities.values())
      : (this.state.entityList || []);
    for (const e of entities) {
      if (!e || e.alive === false || e.type !== 'pickup') continue;
      if (e.data?.swarmDrop || e.data?.swarmRepair) continue;
      const dx = player.pos.x - e.pos.x;
      const dz = player.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1e-4) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      const pvx = Number(player.vel?.x) || 0;
      const pvz = Number(player.vel?.z) || 0;
      const approach = 420;
      if (!e.vel) e.vel = { x: 0, z: 0 };
      e.vel.x = pvx + nx * approach;
      e.vel.z = pvz + nz * approach;
      if (this.helpers?.combatPhysics?.applyImpulse) {
        this.helpers.combatPhysics.applyImpulse({
          entityId: e.id,
          impulse: { x: nx * 60, z: nz * 60 },
          reason: 'loot_homing',
          tick: this.state.tick,
        });
      }
      e.data = e.data || {};
      e.data.magnetPull = true;
    }
  },

  _applyBigBang(player) {
    if (!player) return;
    const arenaRadius = 1200;
    const center = { x: player.pos.x, z: player.pos.z };
    const now = Number(this.state.simTime) || 0;

    const fieldsSystem = this.registry?.get ? this.registry.get('fields') : null;
    if (fieldsSystem && fieldsSystem._kernel && typeof fieldsSystem._kernel.register === 'function') {
      const fieldId = `field_big_bang_${this.state.tick}_${player.id}`;
      fieldsSystem._kernel.register({
        id: fieldId,
        kind: 'repulsor',
        volume: 'ring',
        center,
        radius: arenaRadius,
        strength: 400,
        falloff: 1.2,
        damping: 0,
        createdAt: now,
        durationS: 5,
        filters: { excludeId: player.id },
      });
      this._emit('fields:deployed', {
        fieldId,
        kind: 'repulsor',
        sourceId: player.id,
        center,
        radius: arenaRadius,
        expireAt: now + 5,
      });
    }

    const entities = this.state.entities?.values
      ? Array.from(this.state.entities.values())
      : (this.state.entityList || []);
    for (const e of entities) {
      if (!e || e.alive === false || e.id === player.id) continue;
      if (!e.pos || typeof e.pos.x !== 'number' || typeof e.pos.z !== 'number') continue;
      const dx = e.pos.x - center.x;
      const dz = e.pos.z - center.z;
      const dist = Math.hypot(dx, dz);
      if (dist > arenaRadius || dist < 1e-4) continue;
      const nx = dx / dist;
      const nz = dz / dist;
      const falloff = Math.max(0, 1 - dist / arenaRadius);
      const impulseMag = 600 * (0.3 + 0.7 * falloff);

      if (!e.vel) e.vel = { x: 0, z: 0 };
      const mass = Math.max(0.1, Number(e.mass) || 1);
      e.vel.x += (nx * impulseMag) / mass;
      e.vel.z += (nz * impulseMag) / mass;

      if (this.helpers?.combatPhysics?.applyImpulse) {
        this.helpers.combatPhysics.applyImpulse({
          entityId: e.id,
          impulse: { x: nx * impulseMag, z: nz * impulseMag },
          reason: 'big_bang_shove',
          tick: this.state.tick,
        });
      }
    }
    this._emit('camera:shake', { amount: 0.8 });
  },

  _applyDoubleScrap(player) {
    const now = Number(this.state?.simTime) || 0;
    this._doubleScrapActive = true;
    this._doubleScrapUntil = now + 30;
  },

  _checkDoubleScrapExpiration(now) {
    if (!this._doubleScrapActive) return;
    if (this._doubleScrapUntil != null && now >= this._doubleScrapUntil) {
      this._doubleScrapActive = false;
      this._doubleScrapUntil = null;
    }
  },

  _onAwardRequested(payload) {
    if (!this.isDoubleScrapActive()) return;
    const credits = Number(payload && payload.credits);
    if (!Number.isFinite(credits) || credits <= 0) return;
    if (payload.reason === 'swarm:doubleScrapBonus') return;
    if (typeof payload.reason === 'string' && payload.reason.toLowerCase().includes('refund')) return;

    this._emit('run:awardRequested', {
      credits,
      reason: 'swarm:doubleScrapBonus',
      wave: payload.wave,
    });
  },

  _applyLooseCannon(player) {
    const helpers = this.helpers;
    if (!helpers || typeof helpers.spawnEntity !== 'function' || !player) return;
    const now = Number.isFinite(this.state.simTime) ? this.state.simTime : 0;
    const turret = helpers.spawnEntity({
      type: 'drone',
      name: 'Loose Cannon',
      pos: { x: player.pos.x + 25, z: player.pos.z + 25 },
      vel: { x: (player.vel?.x || 0) * 0.5, z: (player.vel?.z || 0) * 0.5 },
      radius: 14,
      mass: 50,
      collides: true,
      tetherable: true,
      data: {
        kind: 'loose_cannon',
        looseCannon: true,
        masslineTetherable: true,
        tetherable: true,
        role: 'drone',
        team: player.team || 'player',
        spawnedAt: now,
        despawnAt: now + 60,
        fireInterval: 0.5,
        lastFired: 0,
        range: 450,
        damage: 8,
        weaponId: 'wpn_autocannon_s',
      },
    });
    const id = turret && typeof turret === 'object' ? turret.id : turret;
    if (id != null) {
      this._turrets.add(id);
    }
  },

  _tickTurrets(now) {
    if (this._turrets.size === 0) return;
    for (const id of Array.from(this._turrets)) {
      const turret = this.state.entities?.get ? this.state.entities.get(id) : null;
      if (!turret || turret.alive === false || now >= (turret.data?.despawnAt ?? Infinity)) {
        this._turrets.delete(id);
        if (turret && turret.alive !== false) {
          turret.alive = false;
          if (typeof this.helpers?.removeEntity === 'function') this.helpers.removeEntity(id);
        }
        continue;
      }

      const data = turret.data || {};
      const fireInterval = data.fireInterval || 0.5;
      const lastFired = data.lastFired || 0;
      if (now - lastFired < fireInterval) continue;

      const range = data.range || 450;
      let nearest = null;
      let nearestDist = Infinity;
      const entities = this.state.entities?.values
        ? Array.from(this.state.entities.values())
        : (this.state.entityList || []);

      for (const e of entities) {
        if (!e || e.alive === false || e.id === turret.id || e.id === this.state.playerId) continue;
        if (e.type !== 'ship' && e.type !== 'drone') continue;
        if (e.data?.looseCannon) continue;
        const dx = e.pos.x - turret.pos.x;
        const dz = e.pos.z - turret.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= range && dist < nearestDist) {
          nearestDist = dist;
          nearest = e;
        }
      }

      if (nearest) {
        data.lastFired = now;
        const angle = Math.atan2(nearest.pos.z - turret.pos.z, nearest.pos.x - turret.pos.x);
        const projSpeed = 320;
        if (typeof this.helpers?.spawnEntity === 'function') {
          this.helpers.spawnEntity({
            type: 'projectile',
            ownerId: turret.id,
            team: turret.team || 'player',
            pos: { x: turret.pos.x, z: turret.pos.z },
            vel: { x: Math.cos(angle) * projSpeed, z: Math.sin(angle) * projSpeed },
            radius: 3,
            damage: data.damage || 8,
            damageType: 'kinetic',
            data: {
              damage: data.damage || 8,
              damageType: 'kinetic',
              weaponId: data.weaponId || 'wpn_autocannon_s',
              ownerId: turret.id,
              despawnAt: now + 2,
            },
          });
        }
        this._emit('combat:fire', {
          ownerId: turret.id,
          weaponId: data.weaponId || 'wpn_autocannon_s',
          origin: { x: turret.pos.x, z: turret.pos.z },
          dir: angle,
        });
      }
    }
  },

  _applyFreeForge() {
    const run = liveSwarmRun(this.state);
    if (run) {
      run.freeForge = true;
    }
  },

  _cleanExpiredDrops(now) {
    for (const id of Array.from(this._live)) {
      const drop = this.state.entities?.get ? this.state.entities.get(id) : null;
      if (!drop || drop.alive === false || (drop.data?.despawnAt != null && now >= drop.data.despawnAt)) {
        this._live.delete(id);
        this._liveDrops.delete(id);
        if (drop && drop.alive !== false) {
          drop.alive = false;
          if (typeof this.helpers?.removeEntity === 'function') this.helpers.removeEntity(id);
        }
      }
    }
  },

  _onDestroyed(payload) {
    const id = payload && payload.id;
    if (id == null) return;
    this._live.delete(id);
    this._liveDrops.delete(id);
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },
};
