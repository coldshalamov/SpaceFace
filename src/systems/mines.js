// W03 mine-layer — owns physical mine entities (type 'mine').
//
// Placement intent comes from mine_layer doctrine / shape 325 ambush wiring.
// Proximity damage routes through combat commands (routeDamage / combat:routeDamage),
// never direct hull writes or direct Rapier body mutation. Mines carry hull and are
// shootable (counterplay: destroy before trigger). Telegraph uses cue 'wake_mines'.
// A Massline throw stamps playerThrown so the mine becomes a grenade against the
// pack that laid it.
//
// Determinism: arm/trigger timers use state.simTime only; no Math.random / wall clock.
import { scalarHitToDamagePacket } from '../combat/damage.js';
import { Masks } from '../core/entity.js';

export const MINE_OWNER_CAP = 6;
export const MINE_ARM_DELAY_S = 2.0;
export const MINE_TRIGGER_RADIUS = 55;
export const MINE_HULL = 28;
export const MINE_BLAST_DAMAGE = 42;
export const MINE_TELEGRAPH_CUE = 'wake_mines';
export const MINE_TYPE = 'mine';
export const MINE_THROW_GRACE_S = 0.5;

// SF-041 (PB-ORD-C) — the wake-corridor law: a seeded fence hugs ONE flank of the approach
// line, leaving the opposite flank an open, readable safe lane. Solutions are physical:
// thread the open flank, displace the fence with a field/blast, or throw a body through.
// Pure geometry from the two endpoints — no rng, so browser/Electron/probes seed the same
// corridor from the same standoff.
export const MINE_CORRIDOR_COUNT = 3;
export const MINE_CORRIDOR_FLANK_WU = 56;   // first hull's lateral offset: its trigger disc
                                            // (55 wu) just kisses the approach centreline
export const MINE_CORRIDOR_RISE_WU = 46;    // each next hull steps further across (overlapping
                                            // discs: the hugged flank is a wall, not a sieve)

/**
 * Seed positions for one corridor fence between two endpoints (e.g. jackal → player approach).
 * Deterministic in the endpoints; the caller places each through the ordinary placeMine law.
 * @returns {Array<{x:number,z:number}>}
 */
export function mineCorridorLayout(fromPos, toPos, count = MINE_CORRIDOR_COUNT) {
  if (!fromPos || !toPos || !(count > 0)) return [];
  const dx = (toPos.x || 0) - (fromPos.x || 0);
  const dz = (toPos.z || 0) - (fromPos.z || 0);
  const len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  const px = -uz, pz = ux; // perpendicular: the flank the fence hugs
  const depth0 = 80, depthStep = 70; // strung along the approach, as the wake always was
  const out = [];
  for (let i = 0; i < count; i++) {
    const along = depth0 + i * depthStep;
    const side = MINE_CORRIDOR_FLANK_WU + i * MINE_CORRIDOR_RISE_WU;
    out.push({
      x: (fromPos.x || 0) + ux * along + px * side,
      z: (fromPos.z || 0) + uz * along + pz * side,
    });
  }
  return out;
}

const TRIGGER_TYPES = new Set(['ship', 'drone']);

export const mines = {
  name: 'mines',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers || (ctx.helpers = {});
    this.registry = ctx.registry || null;
    this._scratch = [];
    // Encounter scripts / mine-layer AI place through this helper (no direct entity writes).
    this.helpers.placeMine = (opts) => this.placeMine(opts || {});
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('mines:placeRequest', (p) => this.placeMine(p || {}));
      this.bus.on('massline:throw', (p) => this._onThrown(p || {}));
      this.bus.on('sector:exit', () => this.releaseAll('sector_exit'));
      this.bus.on('sector:enter', () => this.releaseAll('sector_enter'));
      this.bus.on('game:new', () => this.releaseAll('new_game'));
      this.bus.on('save:loaded', () => this.releaseAll('save_loaded'));
    }
  },

  /**
   * Place a physical mine. Enforces per-owner caps. Returns the entity or null.
   * @param {{ ownerId: number, pos: {x:number,z:number}, team?: number, factionId?: string, armDelayS?: number, triggerRadius?: number, hull?: number, telegraph?: boolean }} opts
   */
  placeMine(opts = {}) {
    const state = this.state;
    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (typeof spawnEntity !== 'function') return null;
    if (!opts.pos || !Number.isFinite(opts.pos.x) || !Number.isFinite(opts.pos.z)) return null;
    const ownerId = opts.ownerId != null ? opts.ownerId : (state && state.playerId != null ? state.playerId : null);
    if (ownerId != null && countOwnerMines(state, ownerId) >= MINE_OWNER_CAP) {
      if (this.bus) this.bus.emit('mines:capReached', { ownerId, cap: MINE_OWNER_CAP });
      return null;
    }

    const now = state.simTime || 0;
    const armDelay = Number.isFinite(opts.armDelayS) ? Math.max(0, opts.armDelayS) : MINE_ARM_DELAY_S;
    const triggerRadius = Number.isFinite(opts.triggerRadius) ? Math.max(0, opts.triggerRadius) : MINE_TRIGGER_RADIUS;
    const hull = Number.isFinite(opts.hull) ? Math.max(1, opts.hull) : MINE_HULL;
    const team = opts.team != null ? opts.team : teamOf(state, ownerId);

    const ent = spawnEntity({
      type: MINE_TYPE,
      pos: { x: opts.pos.x, z: opts.pos.z },
      vel: { x: 0, z: 0 },
      radius: 6,
      mass: 8,
      hull,
      hullMax: hull,
      collides: true,
      // Rapier solver contacts stay projectile-sweep plus ship hulls so a thrown mine is a
      // grenade, not scenery. Parked mines still arm on simTime; Massline latch is explicit.
      collisionMask: Masks.SHIP | Masks.PROJECTILE,
      physicsBody: {
        dynamic: true,
        ccd: true,
        material: 'projectile',
      },
      team,
      ownerId,
      factionId: opts.factionId || null,
      data: {
        kind: 'mine',
        mine: true,
        ownerId,
        armedAt: now + armDelay,
        armed: armDelay <= 0,
        triggerRadius,
        blastDamage: Number.isFinite(opts.blastDamage) ? opts.blastDamage : MINE_BLAST_DAMAGE,
        placedAt: now,
        sectorId: state.world && state.world.currentSectorId || null,
        triggered: false,
        masslineTetherable: true,
      },
    });
    if (!ent) return null;

    if (opts.telegraph !== false && this.bus) {
      this.bus.emit('ai:telegraph', {
        entityId: ownerId,
        mineId: ent.id,
        kind: MINE_TELEGRAPH_CUE,
        cue: MINE_TELEGRAPH_CUE,
        pos: { x: ent.pos.x, z: ent.pos.z },
        tick: state.tick | 0,
      });
      this.bus.emit('mines:placed', {
        mineId: ent.id,
        ownerId,
        pos: { x: ent.pos.x, z: ent.pos.z },
        armedAt: ent.data.armedAt,
        cue: MINE_TELEGRAPH_CUE,
      });
    }
    return ent;
  },

  update(_dt, state) {
    if (state.mode !== 'flight') return;
    const list = liveMineList(state);
    if (!list.length) return;
    const now = state.simTime || 0;
    for (const mine of list) {
      if (!mine || !mine.alive || mine.type !== MINE_TYPE) continue;
      const data = mine.data || (mine.data = {});
      // Destroyed / hull-depleted mines never trigger (counterplay).
      if (!(mine.hull > 0)) {
        mine.alive = false;
        continue;
      }
      if (!data.armed) {
        if (now >= (data.armedAt || 0)) {
          data.armed = true;
          if (this.bus) this.bus.emit('mines:armed', { mineId: mine.id, ownerId: data.ownerId });
        } else {
          continue;
        }
      }
      if (data.triggered) continue;
      const victim = this._findTriggerVictim(state, mine, data);
      if (!victim) continue;
      this._triggerMine(state, mine, data, victim);
    }
  },

  _onThrown(payload) {
    const id = payload && payload.payloadId;
    if (id == null || !this.state || !this.state.entities) return;
    const mine = this.state.entities.get(id);
    if (!mine || mine.alive === false || mine.type !== MINE_TYPE) return;
    const data = mine.data || (mine.data = {});
    const now = this.state.simTime || 0;
    data.playerThrown = true;
    data.thrownAt = now;
    data.thrownBy = this.state.playerId;
    data.masslineTetherable = true;
    mine.collisionMask = Masks.SHIP | Masks.PROJECTILE;
    mine.physicsBody = {
      ...(mine.physicsBody && typeof mine.physicsBody === 'object' ? mine.physicsBody : {}),
      dynamic: true,
      ccd: true,
      material: 'projectile',
    };
    if (!data.armed) {
      data.armed = true;
      data.armedAt = now;
      if (this.bus) this.bus.emit('mines:armed', { mineId: mine.id, ownerId: data.ownerId, thrown: true });
    }
  },

  _findTriggerVictim(state, mine, data) {
    const r = Number.isFinite(data.triggerRadius) ? Math.max(0, data.triggerRadius) : MINE_TRIGGER_RADIUS;
    const mx = mine.pos.x;
    const mz = mine.pos.z;
    const ownerId = data.ownerId;
    const team = mine.team;
    const thrown = data.playerThrown === true;
    const now = state.simTime || 0;
    const grace = thrown && (now - (Number(data.thrownAt) || 0) < MINE_THROW_GRACE_S);
    const playerId = state.playerId;
    let best = null;
    let bestDistance = Infinity;
    const source = (state.entityIndex && state.entityIndex.shipLike) || state.entityList || [];
    for (const e of source) {
      if (!e || !e.alive || e.id === mine.id) continue;
      if (!TRIGGER_TYPES.has(e.type)) continue;
      if (thrown) {
        if (grace && e.id === playerId) continue;
      } else {
        if (e.id === ownerId) continue;
        if (team != null && e.team != null && e.team === team) continue;
      }
      const dx = e.pos.x - mx;
      const dz = e.pos.z - mz;
      // Math.hypot scales before squaring, so finite 1e308-class coordinates retain
      // an ordered at/beyond comparison instead of collapsing both sides to Infinity.
      const distance = Math.hypot(dx, dz);
      if (distance > r) continue;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = e;
      }
    }
    return best;
  },

  _triggerMine(state, mine, data, victim) {
    data.triggered = true;
    const damage = data.blastDamage || MINE_BLAST_DAMAGE;
    const packet = scalarHitToDamagePacket({
      damage,
      damageType: 'explosive',
      pos: { x: victim.pos.x, z: victim.pos.z },
      source: { kind: 'mine', id: mine.id, weaponId: 'mine_layer' },
    });
    // allowAnyTarget not required for ships; mines themselves use hull via projectile:hit path.
    const request = {
      attackerId: data.ownerId != null ? data.ownerId : mine.id,
      targetId: victim.id,
      packet,
      origin: { kind: 'mine', id: mine.id },
    };
    const pos = { x: mine.pos.x, z: mine.pos.z };
    if (this.bus) {
      // The snap is the first receipt. Detonation follows on this same tick —
      // the fuse length does not change.
      this.bus.emit('mines:triggered', {
        mineId: mine.id,
        ownerId: data.ownerId,
        targetId: victim.id,
        damage,
        pos,
      });
    }
    this._routeDamage(request);
    if (this.bus) {
      this.bus.emit('mines:detonated', {
        mineId: mine.id,
        ownerId: data.ownerId,
        targetId: victim.id,
        damage,
        pos,
      });
    }
    mine.alive = false;
  },

  _routeDamage(request) {
    const helpers = this.helpers;
    if (helpers && typeof helpers.routeCombatDamage === 'function') {
      return helpers.routeCombatDamage(request);
    }
    const combatSys = this.registry && this.registry.get && this.registry.get('combat');
    if (combatSys && typeof combatSys.ensureKernel === 'function') {
      return combatSys.ensureKernel().routeDamage(request);
    }
    if (this.bus) this.bus.emit('combat:routeDamage', request);
    return null;
  },

  /** Release mines on sector exit / lifecycle (ownership lifecycle). */
  releaseAll(reason = 'release') {
    const state = this.state;
    if (!state) return 0;
    const list = liveMineList(state);
    let n = 0;
    for (const e of list) {
      if (!e || !e.alive || e.type !== MINE_TYPE) continue;
      e.alive = false;
      n++;
    }
    if (n && this.bus) this.bus.emit('mines:released', { count: n, reason });
    return n;
  },
};

export function countOwnerMines(state, ownerId) {
  if (!state || ownerId == null) return 0;
  let n = 0;
  for (const e of liveMineList(state)) {
    if (!e || !e.alive || e.type !== MINE_TYPE) continue;
    if (e.ownerId === ownerId || (e.data && e.data.ownerId === ownerId)) n++;
  }
  return n;
}

export function listMines(state) {
  const out = [];
  for (const e of liveMineList(state)) {
    if (e && e.alive && e.type === MINE_TYPE) out.push(e);
  }
  return out;
}

function liveMineList(state) {
  const index = state && state.entityIndex;
  if (index && index.__spacefaceEntityIndexV1 && Array.isArray(index.mines)) return index.mines;
  return (state && state.entityList) || [];
}

function teamOf(state, ownerId) {
  if (ownerId == null || !state || !state.entities) return 1;
  const owner = state.entities.get(ownerId);
  return owner && owner.team != null ? owner.team : 1;
}
