// Swarm enemy drops system (EC-A01-03)
// Things that fall out of enemies in the Pit (design/game/12_SWARM_THE_PIT.md).
//
// Drops are rare (at most 1 per 12 kills), at most 2 alive at once on the board, TTL 12 s, chosen
// from the run seed (equal weights, free_forge at 1/4 weight). Built on the same seam as the
// swarmSupply repair cell: an ordinary `type:'pickup'`, claimed on `pickup:collected` BY ID from
// this system's own ledger.
//
// Every effect goes through the owner of the thing it changes:
//   full_rack     weapons' own mount fields (_cooldown/_heat/vent latch); fields/massSeed/bombs own
//                 their cooldown clocks, cargo owns the charges (topped up to the rack ceiling)
//   heavy_hands   the mount's `impulsePerHit` override, which buildWeaponDamagePacket reads
//   dead_weight   the Massline's own impact receipts (tether:whipImpact / physics:impact), then the
//                 combat kernel's routeCombatDamage (never a direct hull write)
//   magnet        mining's vacuum: this system only opens a window on state.swarmDropMagnetUntil
//   big_bang      fields.deployOneOffShove (the Shove deploy at a one-off radius)
//   double_scrap  an extra run:awardRequested, so runSession.award stays the only purse writer
//   loose_cannon  a tetherable body that fires through the weapons owner's _spawnProjectile
//   free_forge    run.telemetry.freeForge (run keys are closed: an unknown key invalidates the run)

import { mulberry32 } from '../core/rng.js';
import { WEAPONS } from '../data/weapons.js';
import { validateRunState } from '../core/runState.js';
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { HEAVY_AS_TERRAIN_MASS } from '../combat/impulseKernel.js';
import { runOwnsReward, createRewardDeathLedger } from '../combat/rewardEligibility.js';
import { isSwarmRuleset } from './survivalSwarm.js';
import { isHostileToPlayer } from './scanner.js';
import { addCargo } from './cargo.js';
import {
  SWARM_DROP_KIND,
  SWARM_DROP_INTERVAL,
  SWARM_DROP_MAX_LIVE,
  SWARM_DROP_TTL_S,
  SWARM_DROP_BY_ID,
  SWARM_DROP_HEAVY_HANDS_S,
  SWARM_DROP_DEAD_WEIGHT_S,
  SWARM_DROP_DOUBLE_SCRAP_S,
  SWARM_DROP_LOOSE_CANNON_S,
  SWARM_DROP_MAGNET_S,
  SWARM_DROP_ARENA_RADIUS,
  SWARM_DROP_HEAVY_FRACTION,
  SWARM_DROP_CANNON,
  SWARM_DROP_EARNING_REASON,
  selectSwarmDrop,
} from '../data/swarmDrops.js';

const WEAPON_BY_ID = new Map(WEAPONS.map((w) => [w.id, w]));
const THROWN_WINDOW_S = 8;
const CONTACT_REPEAT_S = 1;
const RACK_CHARGE_CEILING = 6;
const _kernelFlags = Object.freeze({ allowAnyTarget: true, ignoreFriendlyFire: true });

function restoreHeavyHands(w) {
  const saved = w && w._heavyHandsSaved;
  if (!saved) return;
  if (saved.own) w.impulsePerHit = saved.value;
  else delete w.impulsePerHit;
  delete w._heavyHandsSaved;
}

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

function simNow(state) {
  return Number.isFinite(state && state.simTime) ? state.simTime : 0;
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
    this._unsubs.push(this.bus.on('tether:whipImpact', (p) => this._onWhipImpact(p)));
    this._unsubs.push(this.bus.on('physics:impact', (p) => this._onImpact(p)));
    this._unsubs.push(this.bus.on('run:awardRequested', (p) => this._onAwardRequested(p)));
    // The run envelope is not saved, so a reload drops every timed effect and turret; the one thing
    // that DOES survive a save is the doubled gun value on the player's mounts. Put every gun back.
    this._unsubs.push(this.bus.on('save:loaded', () => this._reset()));
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

  update() {
    const state = this.state;
    if (!state) return;
    const now = simNow(state);
    if (this._heavyHandsActive && now >= this._heavyHandsUntil) this._endHeavyHands();
    if (this._deadWeightActive && now >= this._deadWeightUntil) {
      this._deadWeightActive = false;
      this._deadWeightUntil = null;
    }
    if (this._doubleScrapActive && now >= this._doubleScrapUntil) {
      this._doubleScrapActive = false;
      this._doubleScrapUntil = null;
    }
    if (this._thrown.size > 0) this._pruneThrown(now);
    if (this._turrets.size > 0) this._tickTurrets(now);
    if (this._live.size > 0) this._cleanExpiredDrops(now);
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
    return Boolean(this._heavyHandsActive && simNow(this.state) < this._heavyHandsUntil);
  },

  isDeadWeightActive() {
    return Boolean(this._deadWeightActive && simNow(this.state) < this._deadWeightUntil);
  },

  isDoubleScrapActive() {
    return Boolean(this._doubleScrapActive && simNow(this.state) < this._doubleScrapUntil);
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
    this._thrown = new Map();
    this._contactAt = new Map();
    this._resetTimedEffects();
  },

  _resetTimedEffects() {
    // Always sweep the player's mounts: a save taken mid-effect carries the doubled value and its
    // `_heavyHandsSaved` marker with it, even though this system's own flags are gone.
    const player = this.state ? this._player() : null;
    if (player && player.data && Array.isArray(player.data.weapons)) {
      for (const w of player.data.weapons) restoreHeavyHands(w);
    }
    this._heavyHandsActive = false;
    this._heavyHandsUntil = null;
    this._deadWeightActive = false;
    this._deadWeightUntil = null;
    this._doubleScrapActive = false;
    this._doubleScrapUntil = null;
    if (this.state) this.state.swarmDropMagnetUntil = null;
    // Turrets belong to the run: retire them with it.
    if (this._turrets && this.helpers && typeof this.helpers.removeEntity === 'function') {
      for (const id of this._turrets.keys()) this.helpers.removeEntity(id);
    }
    this._turrets = new Map();
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
    const victim = this.state.entities && typeof this.state.entities.get === 'function'
      ? this.state.entities.get(id)
      : null;
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

    // Despawn/collection usually retire these ids through receipts; prune the dead as well so a
    // missed receipt cannot close the drop budget forever.
    for (const id of this._live) {
      const cell = this.state.entities?.get(id);
      if (!cell || cell.alive === false) {
        this._live.delete(id);
        this._liveDrops.delete(id);
      }
    }

    const budget = Math.max(0, SWARM_DROP_MAX_LIVE - this._live.size);
    const drops = Math.min(earned, budget);
    for (let i = 0; i < drops; i++) this._drop(run, victim, payload);
  },

  _drop(run, victim, payload) {
    const helpers = this.helpers;
    if (!helpers || typeof helpers.spawnEntity !== 'function') return;
    const pos = (victim && victim.pos) || (payload && payload.pos);
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;
    const state = this.state;
    const now = simNow(state);
    const index = this._dropIndex++;

    // Seeded from the run seed and the drop's ordinal alone (the swarmSupply shape), so the same
    // seed always deals the same sequence of drops and the draw never perturbs the shared stream.
    const rng = mulberry32((((run.seed >>> 0) ^ Math.imul(index + 1, 0x9e3779b9) ^ 0x5d0b5) >>> 0) || 1);
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
      data: {
        kind: SWARM_DROP_KIND,
        dropId: dropDef.id,
        dropName: dropDef.name,
        label: dropDef.name,
        amount: 1,
        swarmDrop: true,
        swarmDropIndex: index,
        despawnAt: now + SWARM_DROP_TTL_S,
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
    if (dropIndex != null) this._spent.add(dropIndex);
    // Mining retires a collected pickup itself; do it here too so a path that does not (the
    // physics contact collect) can never leave a second copy to claim.
    if (entity && entity.alive !== false && typeof this.helpers?.removeEntity === 'function') {
      this.helpers.removeEntity(id);
    }
    const run = liveSwarmRun(this.state);
    if (!run) return;
    if (payload.collectorId != null && payload.collectorId !== this.state.playerId) return;
    const player = this._player();
    if (!player || player.alive === false) return;
    if (!dropDef) return;

    this._applyDrop(dropDef, player, entity, run);
  },

  _applyDrop(dropDef, player, entity, run) {
    switch (dropDef.id) {
      case 'full_rack': this._applyFullRack(player); break;
      case 'heavy_hands': this._applyHeavyHands(player); break;
      case 'dead_weight': this._applyDeadWeight(); break;
      case 'magnet': this._applyMagnet(); break;
      case 'big_bang': this._applyBigBang(); break;
      case 'double_scrap': this._applyDoubleScrap(); break;
      case 'loose_cannon': this._applyLooseCannon(player); break;
      case 'free_forge': this._applyFreeForge(run); break;
      default: break;
    }

    this._emit('swarm:dropCollected', {
      id: entity?.id,
      dropId: dropDef.id,
      name: dropDef.name,
      wave: run.wave,
    });
    this._emit('toast', { text: dropDef.line, kind: 'good', ttl: 2.5 });
  },

  // ---- Full Rack --------------------------------------------------------------------------
  _applyFullRack(player) {
    const state = this.state;
    if (player && player.data) {
      if (Array.isArray(player.data.weapons)) {
        for (const w of player.data.weapons) {
          w._cooldown = 0;
          w._heat = 0;
        }
      }
      // weapons' forced-vent lockout (weapons.js _tickVent) reads these off the ship's data.
      player.data.weaponVentUntil = 0;
      player.data._weaponVenting = false;
    }
    // Pull / Shove: fields' runtime clock (state.fields.cooldowns).
    const fields = state.fields;
    if (fields && fields.cooldowns && typeof fields.cooldowns === 'object') {
      for (const k of Object.keys(fields.cooldowns)) fields.cooldowns[k] = 0;
    }
    // Pin: the player-blob latch massSeed reads.
    if (player && player.massSeed) player.massSeed.cooldownUntil = 0;
    else if (state.player && state.player.massSeed) state.player.massSeed.cooldownUntil = 0;
    // Bomb: the shared release latch and every per-payload clock.
    const bombs = state.bombs;
    if (bombs) {
      bombs.cooldownUntil = 0;
      if (bombs.cooldowns && typeof bombs.cooldowns === 'object') {
        for (const k of Object.keys(bombs.cooldowns)) bombs.cooldowns[k] = 0;
      }
    }
    // Impulse charges are the Pit's ammunition: top up to the rack ceiling swarmSupply uses.
    const cargo = state.player && state.player.cargo;
    if (cargo) {
      const held = (cargo.items && cargo.items.cmdty_impulse_charge) || 0;
      const amount = Math.max(0, RACK_CHARGE_CEILING - held);
      if (amount > 0) addCargo(state, 'cmdty_impulse_charge', amount);
    }
  },

  // ---- Heavy Hands ------------------------------------------------------------------------
  _applyHeavyHands(player) {
    this._heavyHandsActive = true;
    this._heavyHandsUntil = simNow(this.state) + SWARM_DROP_HEAVY_HANDS_S;
    if (!player || !player.data || !Array.isArray(player.data.weapons)) return;
    for (const w of player.data.weapons) {
      // A mount's own `impulsePerHit` wins over its def's (weapons.js buildWeaponDamagePacket
      // reads `w.impulsePerHit ?? def.impulsePerHit`). Mounts name their def by `defId`.
      // Remember whether the mount had its own value so expiry restores exactly what was there.
      if (w._heavyHandsSaved !== undefined) continue;
      const def = WEAPON_BY_ID.get(w.defId) || null;
      const own = Number.isFinite(w.impulsePerHit);
      const base = own ? w.impulsePerHit : (def && Number.isFinite(def.impulsePerHit) ? def.impulsePerHit : 0);
      if (!(base > 0)) continue; // a gun with no knockback has nothing to double
      w._heavyHandsSaved = { own, value: own ? w.impulsePerHit : null };
      w.impulsePerHit = base * 2;
    }
  },

  _endHeavyHands() {
    this._heavyHandsActive = false;
    this._heavyHandsUntil = null;
    const player = this._player();
    if (player && player.data && Array.isArray(player.data.weapons)) {
      for (const w of player.data.weapons) restoreHeavyHands(w);
    }
  },

  // ---- Dead Weight ------------------------------------------------------------------------
  _applyDeadWeight() {
    this._deadWeightActive = true;
    this._deadWeightUntil = simNow(this.state) + SWARM_DROP_DEAD_WEIGHT_S;
  },

  // massline:throw payload (masslineThrow.js runtime.lastThrow): { payloadId, tick, time, ... }.
  _onThrow(payload) {
    const id = payload && payload.payloadId;
    if (id == null || id === this.state.playerId) return; // a self-sling is not a thrown body
    this._thrown.set(id, simNow(this.state) + THROWN_WINDOW_S);
  },

  _pruneThrown(now) {
    for (const [id, until] of this._thrown) {
      if (now >= until) this._thrown.delete(id);
    }
    for (const [key, until] of this._contactAt) {
      if (now >= until) this._contactAt.delete(key);
    }
  },

  // tether:whipImpact (masslineImpacts.js): { targetId: the whipped/thrown mass, victimId, slung, rating }.
  _onWhipImpact(payload) {
    if (!payload || !this.isDeadWeightActive()) return;
    const massId = payload.targetId;
    if (!this._thrown.has(massId) && payload.slung !== true) return;
    this._deadWeightContact(massId, payload.victimId);
  },

  // physics:impact (physics.js): { aId, bId, dp, ... }. Catches the touches a whip receipt is too
  // slow for; the thrown side is whichever id the Massline released.
  _onImpact(payload) {
    if (!payload || !this.isDeadWeightActive()) return;
    const a = payload.aId;
    const b = payload.bId;
    if (a == null || b == null) return;
    if (this._thrown.has(a)) this._deadWeightContact(a, b);
    else if (this._thrown.has(b)) this._deadWeightContact(b, a);
  },

  _deadWeightContact(massId, victimId) {
    const state = this.state;
    if (massId == null || victimId == null || victimId === state.playerId || victimId === massId) return;
    const victim = state.entities && state.entities.get ? state.entities.get(victimId) : null;
    if (!victim || victim.alive === false || !victim.pos) return;
    if (victim.type !== 'ship' && victim.type !== 'drone') return;
    const player = this._player();
    if (!player || !isHostileToPlayer(victim, player.team, state)) return;

    const now = simNow(state);
    // One touch is several receipts (whip + impact, repeated while bodies overlap): a heavy must
    // take its 60 % once per touch, not once per receipt.
    const key = `${massId}:${victimId}`;
    const gate = this._contactAt.get(key);
    if (gate != null && now < gate) return;
    this._contactAt.set(key, now + CONTACT_REPEAT_S);

    const route = this.helpers && this.helpers.routeCombatDamage;
    if (typeof route !== 'function') return;
    const hullMax = Number.isFinite(victim.hullMax) && victim.hullMax > 0 ? victim.hullMax : 100;
    const hull = Number.isFinite(victim.hull) ? victim.hull : hullMax;
    const shield = Number.isFinite(victim.shield) ? victim.shield : 0;
    const mass = Number(victim.physicsBody && victim.physicsBody.mass) || Number(victim.mass) || 0;
    const heavy = mass >= HEAVY_AS_TERRAIN_MASS;
    // Light and medium die; a heavy loses 60 % of its full hull. Overkill margin on the kill so
    // armor and shield layers in the kernel cannot leave a sliver alive.
    const damage = heavy
      ? hullMax * SWARM_DROP_HEAVY_FRACTION
      : (hull + shield + 1) * 4;
    const packet = scalarHitToDamagePacket({
      damage,
      damageType: 'kinetic',
      pos: { x: victim.pos.x, z: victim.pos.z },
      source: { kind: 'dead_weight', massId },
    });
    packet.flags = _kernelFlags;
    route({
      attackerId: state.playerId,
      targetId: victim.id,
      packet,
      origin: { kind: 'dead_weight', id: massId },
    });
  },

  // ---- Magnet -----------------------------------------------------------------------------
  // Opens the window mining's pickup vacuum reads (mining.js swarmDropMagnetRange).
  _applyMagnet() {
    this.state.swarmDropMagnetUntil = simNow(this.state) + SWARM_DROP_MAGNET_S;
  },

  // ---- Big Bang ---------------------------------------------------------------------------
  _applyBigBang() {
    const fields = this.registry && typeof this.registry.get === 'function' ? this.registry.get('fields') : null;
    if (fields && typeof fields.deployOneOffShove === 'function') {
      fields.deployOneOffShove(SWARM_DROP_ARENA_RADIUS);
    }
    this._emit('camera:shake', { amount: 0.8 });
  },

  // ---- Double Scrap -----------------------------------------------------------------------
  _applyDoubleScrap() {
    this._doubleScrapActive = true;
    this._doubleScrapUntil = simNow(this.state) + SWARM_DROP_DOUBLE_SCRAP_S;
  },

  // Earnings only (scrap chips, round sweeps, brood pay, stipend, mill ore). The extra award goes
  // through the same event, so runSession.award stays the one writer of the purse.
  _onAwardRequested(payload) {
    if (!this.isDoubleScrapActive() || !payload) return;
    const credits = Number(payload.credits);
    if (!Number.isFinite(credits) || credits <= 0) return;
    const reason = payload.reason;
    if (typeof reason !== 'string' || !SWARM_DROP_EARNING_REASON.test(reason)) return;
    this._emit('run:awardRequested', {
      credits,
      reason: 'swarm:doubleScrapBonus',
      wave: payload.wave,
    });
  },

  // ---- Loose Cannon -----------------------------------------------------------------------
  // Closest existing turret spec: the Fortify kinetic turret's weapon (wpn_autocannon_s) fired
  // through the weapons owner's _spawnProjectile. The body is a dynamic, tetherable payload-class
  // prop (the encounter props' recipe), so the Line can tow it.
  _applyLooseCannon(player) {
    const helpers = this.helpers;
    if (!helpers || typeof helpers.spawnEntity !== 'function' || !player) return;
    const now = simNow(this.state);
    const mass = 40;
    const turret = helpers.spawnEntity({
      type: 'payload',
      name: 'Loose Cannon',
      pos: { x: player.pos.x + 25, z: player.pos.z + 25 },
      vel: { x: (player.vel?.x || 0) * 0.5, z: (player.vel?.z || 0) * 0.5 },
      radius: 12,
      mass,
      tetherable: true,
      collides: true,
      physicsBody: { shape: 'ball', mass, dynamic: true },
      team: player.team,
      ownerId: player.id,
      data: {
        kind: 'loose_cannon',
        looseCannon: true,
        masslineTetherable: true,
        scanLabel: 'LOOSE CANNON',
        spawnedAt: now,
        despawnAt: now + SWARM_DROP_LOOSE_CANNON_S,
      },
    });
    const id = turret && typeof turret === 'object' ? turret.id : turret;
    if (id != null) this._turrets.set(id, { until: now + SWARM_DROP_LOOSE_CANNON_S, nextFire: now });
  },

  _tickTurrets(now) {
    const state = this.state;
    const weaponOwner = this.registry && typeof this.registry.get === 'function'
      ? this.registry.get('weapons') : null;
    const definition = WEAPON_BY_ID.get(SWARM_DROP_CANNON.weaponId);
    const player = this._player();
    for (const [id, rec] of this._turrets) {
      const turret = state.entities && state.entities.get ? state.entities.get(id) : null;
      if (!turret || turret.alive === false) {
        this._turrets.delete(id);
        continue;
      }
      if (now >= rec.until) {
        this._turrets.delete(id);
        if (typeof this.helpers?.removeEntity === 'function') this.helpers.removeEntity(id);
        continue;
      }
      if (now < rec.nextFire || !player || !definition
        || !weaponOwner || typeof weaponOwner._spawnProjectile !== 'function') continue;

      const range = SWARM_DROP_CANNON.range;
      let nearest = null;
      let nearestSq = range * range;
      const list = state.entityList;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e || e.alive === false || e.id === id || e.id === player.id || !e.pos) continue;
        if (e.type !== 'ship' && e.type !== 'drone') continue;
        const dx = e.pos.x - turret.pos.x;
        const dz = e.pos.z - turret.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= nearestSq) continue;
        if (!isHostileToPlayer(e, player.team, state)) continue;
        nearestSq = d2;
        nearest = e;
      }
      if (!nearest) continue;

      rec.nextFire = now + SWARM_DROP_CANNON.intervalS;
      const angle = Math.atan2(nearest.pos.z - turret.pos.z, nearest.pos.x - turret.pos.x);
      const mount = {
        defId: SWARM_DROP_CANNON.weaponId, slotIndex: 0,
        dmg: SWARM_DROP_CANNON.damage, damageType: 'kinetic',
        projSpeed: definition.projSpeed, range,
      };
      weaponOwner._spawnProjectile(turret, mount, definition, angle, nearest, false, state, {});
      this._emit('combat:fire', {
        ownerId: id, weaponId: SWARM_DROP_CANNON.weaponId, hardpointIdx: 0,
        origin: { x: turret.pos.x, z: turret.pos.z }, dir: angle,
      });
    }
  },

  // ---- Free Forge -------------------------------------------------------------------------
  // state.run's key set is closed (runState.js flags an unknown key and the whole run goes
  // invalid), so the flag lives in the run's own telemetry bag, which the clone carries forward.
  _applyFreeForge(run) {
    if (!run.telemetry || typeof run.telemetry !== 'object') return;
    run.telemetry.freeForge = true;
  },

  _cleanExpiredDrops(now) {
    for (const id of this._live) {
      const drop = this.state.entities?.get ? this.state.entities.get(id) : null;
      if (!drop || drop.alive === false || (drop.data?.despawnAt != null && now >= drop.data.despawnAt)) {
        this._live.delete(id);
        this._liveDrops.delete(id);
        if (drop && drop.alive !== false && typeof this.helpers?.removeEntity === 'function') {
          this.helpers.removeEntity(id);
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
